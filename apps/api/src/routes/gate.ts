import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { IdentityCheckDto, IdentityOutcome, ReleaseDto } from "@lins/shared";
import type { AppContext } from "../context";
import { recordAudit } from "../lib/audit";
import { hashPayload, newId } from "../lib/crypto";
import { ApiError } from "../lib/errors";
import { readIdempotencyKey, requireUser, validate } from "../lib/http";
import { findIdempotentReplay, saveIdempotency } from "../lib/idempotency";
import { toGateVisitDto, toReleaseDto } from "../lib/mappers";
import { rateLimitKey } from "../lib/rate-limit";
import type { IdentityCheckRow, ReleaseRow, VisitRow } from "../lib/rows";
import { withTransaction } from "../lib/transaction";

const gateSelect = `
  SELECT vr.*, vp.cpf_last2,
    (SELECT r.decision FROM virtual_releases r
     WHERE r.visit_request_id = vr.id
     ORDER BY r.occurred_at DESC, r.rowid DESC LIMIT 1) AS last_release_decision
  FROM visit_requests vr
  JOIN visitor_profiles vp ON vp.id = vr.visitor_id
`;

const paramsSchema = z.object({
  id: z.string().min(5).max(120),
});

const listQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
});

const lookupSchema = z.object({
  requestCode: z.string().trim().min(5).max(30),
});

const identitySchema = z.object({
  mode: z.enum(["SIMULATED", "REAL"]),
  simulatedOutcome: z
    .enum(["SIMULATED_MATCH", "SIMULATED_NO_MATCH", "INCONCLUSIVE", "ERROR", "UNAVAILABLE"])
    .optional(),
});

const releaseSchema = z.object({
  visitRequestId: z.string().min(5).max(120),
  identityCheckId: z.string().min(5).max(120),
  expectedVersion: z.number().int().positive().optional(),
});

function findGateVisit(ctx: AppContext, id: string): VisitRow | undefined {
  return ctx.db
    .prepare(`${gateSelect} WHERE vr.id = ?`)
    .get(id) as unknown as VisitRow | undefined;
}

function findCheck(ctx: AppContext, id: string, visitId: string): IdentityCheckRow | undefined {
  return ctx.db
    .prepare("SELECT * FROM identity_checks WHERE id = ? AND visit_request_id = ?")
    .get(id, visitId) as unknown as IdentityCheckRow | undefined;
}

const denialReason: Record<Exclude<IdentityOutcome, "SIMULATED_MATCH">, string> = {
  SIMULATED_NO_MATCH: "IDENTITY_SIMULATED_NO_MATCH",
  INCONCLUSIVE: "IDENTITY_INCONCLUSIVE",
  ERROR: "IDENTITY_ERROR",
  UNAVAILABLE: "IDENTITY_UNAVAILABLE",
};

export function registerGateRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get("/api/v1/gate/visits", async (request, reply) => {
    const user = requireUser(ctx.db, request, reply, ["GATE"]);
    if (!user) {
      return reply;
    }
    const query = validate(listQuerySchema, request.query);
    const rows = (
      query.q
        ? ctx.db
            .prepare(
              `${gateSelect} WHERE vr.status = 'APPROVED' AND vr.request_code LIKE ?
               ORDER BY vr.approved_at DESC LIMIT 50`,
            )
            .all(`%${query.q.toUpperCase()}%`)
        : ctx.db
            .prepare(
              `${gateSelect} WHERE vr.status = 'APPROVED'
               ORDER BY vr.approved_at DESC LIMIT 50`,
            )
            .all()
    ) as unknown as VisitRow[];
    return { visits: rows.map(toGateVisitDto) };
  });

  app.post("/api/v1/gate/visits/lookup", async (request, reply) => {
    const user = requireUser(ctx.db, request, reply, ["GATE"]);
    if (!user) {
      return reply;
    }
    const body = validate(lookupSchema, request.body);
    const row = ctx.db
      .prepare(`${gateSelect} WHERE vr.request_code = ?`)
      .get(body.requestCode.toUpperCase()) as unknown as VisitRow | undefined;
    if (!row) {
      throw new ApiError(404, "NOT_FOUND", "Visita não encontrada.");
    }
    recordAudit(ctx.db, {
      eventType: "GATE_VISIT_VIEWED",
      actorId: user.id,
      actorName: user.name,
      actorRole: user.role,
      targetType: "VisitRequest",
      targetId: row.id,
      correlationId: request.correlationId,
      metadata: { source: "lookup" },
    });
    return { visit: toGateVisitDto(row) };
  });

  app.get("/api/v1/gate/visits/:id", async (request, reply) => {
    const user = requireUser(ctx.db, request, reply, ["GATE"]);
    if (!user) {
      return reply;
    }
    const { id } = validate(paramsSchema, request.params);
    const row = findGateVisit(ctx, id);
    if (!row) {
      throw new ApiError(404, "NOT_FOUND", "Visita não encontrada.");
    }
    recordAudit(ctx.db, {
      eventType: "GATE_VISIT_VIEWED",
      actorId: user.id,
      actorName: user.name,
      actorRole: user.role,
      targetType: "VisitRequest",
      targetId: row.id,
      correlationId: request.correlationId,
      metadata: { source: "detail" },
    });
    return { visit: toGateVisitDto(row) };
  });

  app.post("/api/v1/gate/visits/:id/identity-checks", async (request, reply) => {
    const user = requireUser(ctx.db, request, reply, ["GATE"]);
    if (!user) {
      return reply;
    }
    const { id } = validate(paramsSchema, request.params);
    const body = validate(identitySchema, request.body);

    if (!ctx.config.demoMode || body.mode !== "SIMULATED") {
      recordAudit(ctx.db, {
        eventType: "IDENTITY_CHECK_RECORDED",
        actorId: user.id,
        actorName: user.name,
        actorRole: user.role,
        targetType: "VisitRequest",
        targetId: id,
        result: "DENIED",
        correlationId: request.correlationId,
        metadata: { requestedMode: body.mode, reason: "MODE_NOT_ALLOWED" },
      });
      throw new ApiError(
        422,
        "MODE_NOT_ALLOWED",
        "Somente a verificação simulada está disponível neste ambiente.",
      );
    }

    const visit = findGateVisit(ctx, id);
    if (!visit) {
      throw new ApiError(404, "NOT_FOUND", "Visita não encontrada.");
    }
    if (visit.status !== "APPROVED") {
      recordAudit(ctx.db, {
        eventType: "IDENTITY_CHECK_RECORDED",
        actorId: user.id,
        actorName: user.name,
        actorRole: user.role,
        targetType: "VisitRequest",
        targetId: id,
        result: "DENIED",
        mode: "SIMULATED",
        correlationId: request.correlationId,
        metadata: { reason: "VISIT_NOT_ELIGIBLE", status: visit.status },
      });
      throw new ApiError(
        409,
        "VISIT_NOT_ELIGIBLE",
        "A visita não está aprovada para conferência.",
      );
    }

    const outcome = body.simulatedOutcome ?? "SIMULATED_MATCH";
    const check = withTransaction(ctx.db, (): IdentityCheckDto => {
      const checkId = newId("idc");
      const now = new Date().toISOString();
      ctx.db
        .prepare(
          `INSERT INTO identity_checks
            (id, visit_request_id, operator_id, operator_name, mode, outcome,
             provider_reference, occurred_at, correlation_id)
           VALUES (?, ?, ?, ?, 'SIMULATED', ?, ?, ?, ?)`,
        )
        .run(
          checkId,
          id,
          user.id,
          user.name,
          outcome,
          "demo-adapter",
          now,
          request.correlationId,
        );
      recordAudit(ctx.db, {
        eventType: "IDENTITY_CHECK_RECORDED",
        actorId: user.id,
        actorName: user.name,
        actorRole: user.role,
        targetType: "VisitRequest",
        targetId: id,
        mode: "SIMULATED",
        correlationId: request.correlationId,
        metadata: { checkId, outcome },
      });
      return {
        id: checkId,
        visitRequestId: id,
        mode: "SIMULATED",
        outcome,
        occurredAt: now,
        correlationId: request.correlationId,
        providerReference: "demo-adapter",
      };
    });

    return reply.code(201).send({ check });
  });

  app.post("/api/v1/gate/virtual-releases", async (request, reply) => {
    const user = requireUser(ctx.db, request, reply, ["GATE"]);
    if (!user) {
      return reply;
    }
    const limit = ctx.limiter.consume(rateLimitKey(request, "gate.release"), 60);
    if (!limit.allowed) {
      reply.header("Retry-After", String(limit.retryAfterSeconds));
      throw new ApiError(429, "RATE_LIMITED", "Muitas liberações. Aguarde para tentar novamente.");
    }

    const idempotencyKey = readIdempotencyKey(request);
    const body = validate(releaseSchema, request.body);
    const payloadHash = hashPayload({
      visitRequestId: body.visitRequestId,
      identityCheckId: body.identityCheckId,
      expectedVersion: body.expectedVersion ?? null,
    });
    const scope = `release.create:${user.id}:${body.visitRequestId}`;
    let replayed = false;

    const result = withTransaction(ctx.db, (): ReleaseDto => {
      const replay = findIdempotentReplay<ReleaseDto>(
        ctx.db,
        scope,
        idempotencyKey,
        payloadHash,
      );
      if (replay) {
        replayed = true;
        recordAudit(ctx.db, {
          eventType: "IDEMPOTENCY_REPLAY",
          actorId: user.id,
          actorName: user.name,
          actorRole: user.role,
          targetType: "VirtualRelease",
          targetId: replay.releaseId,
          mode: "SIMULATED",
          correlationId: request.correlationId,
          metadata: { operation: "virtual.release" },
        });
        return replay;
      }

      const visit = findGateVisit(ctx, body.visitRequestId);
      if (!visit) {
        throw new ApiError(404, "NOT_FOUND", "Visita não encontrada.");
      }
      const check = findCheck(ctx, body.identityCheckId, visit.id);
      if (!check) {
        throw new ApiError(404, "NOT_FOUND", "Verificação não encontrada.");
      }
      if (body.expectedVersion !== undefined && body.expectedVersion !== visit.version) {
        throw new ApiError(
          409,
          "STATE_CONFLICT",
          "A visita foi alterada. Recarregue antes de liberar.",
        );
      }

      let decision: ReleaseDto["decision"] = "AUTHORIZED";
      let reasonCode: string | null = null;

      if (visit.status !== "APPROVED") {
        decision = "DENIED";
        reasonCode = "VISIT_NOT_ELIGIBLE";
      } else if (check.outcome !== "SIMULATED_MATCH") {
        decision = "DENIED";
        reasonCode = denialReason[check.outcome];
      } else {
        const existing = ctx.db
          .prepare(
            "SELECT id FROM virtual_releases WHERE visit_request_id = ? AND decision = 'AUTHORIZED' LIMIT 1",
          )
          .get(visit.id) as { id: string } | undefined;
        if (existing) {
          throw new ApiError(
            409,
            "STATE_CONFLICT",
            "Já existe uma liberação virtual autorizada para esta visita.",
          );
        }
      }

      const releaseId = newId("rel");
      const now = new Date().toISOString();
      ctx.db
        .prepare(
          `INSERT INTO virtual_releases
            (id, visit_request_id, identity_check_id, operator_id, operator_name,
             idempotency_key, decision, reason_code, mode, physical_access_performed,
             occurred_at, correlation_id, request_version)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'SIMULATED', 0, ?, ?, ?)`,
        )
        .run(
          releaseId,
          visit.id,
          check.id,
          user.id,
          user.name,
          idempotencyKey,
          decision,
          reasonCode,
          now,
          request.correlationId,
          visit.version,
        );

      recordAudit(ctx.db, {
        eventType: "VIRTUAL_RELEASE_REQUESTED",
        actorId: user.id,
        actorName: user.name,
        actorRole: user.role,
        targetType: "VirtualRelease",
        targetId: releaseId,
        mode: "SIMULATED",
        correlationId: request.correlationId,
        metadata: {
          visitRequestId: visit.id,
          identityCheckId: check.id,
          physicalAccessPerformed: false,
        },
      });
      recordAudit(ctx.db, {
        eventType:
          decision === "AUTHORIZED"
            ? "VIRTUAL_RELEASE_AUTHORIZED"
            : "VIRTUAL_RELEASE_DENIED",
        actorId: user.id,
        actorName: user.name,
        actorRole: user.role,
        targetType: "VirtualRelease",
        targetId: releaseId,
        result: decision === "AUTHORIZED" ? "SUCCESS" : "DENIED",
        mode: "SIMULATED",
        correlationId: request.correlationId,
        metadata: {
          visitRequestId: visit.id,
          identityCheckId: check.id,
          decision,
          reasonCode,
          physicalAccessPerformed: false,
        },
      });
      recordAudit(ctx.db, {
        eventType: "VIRTUAL_RELEASE_RECORDED",
        actorId: user.id,
        actorName: user.name,
        actorRole: user.role,
        targetType: "VirtualRelease",
        targetId: releaseId,
        mode: "SIMULATED",
        correlationId: request.correlationId,
        metadata: { decision, physicalAccessPerformed: false },
      });

      const dto: ReleaseDto = {
        releaseId,
        visitRequestId: visit.id,
        identityCheckId: check.id,
        decision,
        reasonCode,
        mode: "SIMULATED",
        physicalAccessPerformed: false,
        occurredAt: now,
        correlationId: request.correlationId,
        requestVersion: visit.version,
      };
      saveIdempotency(ctx.db, scope, idempotencyKey, payloadHash, dto);
      return dto;
    });

    return reply
      .code(200)
      .send(replayed ? { ...result, idempotentReplay: true } : result);
  });

  app.get("/api/v1/gate/virtual-releases/:id", async (request, reply) => {
    const user = requireUser(ctx.db, request, reply, ["GATE"]);
    if (!user) {
      return reply;
    }
    const { id } = validate(paramsSchema, request.params);
    const row = ctx.db
      .prepare("SELECT * FROM virtual_releases WHERE id = ?")
      .get(id) as unknown as ReleaseRow | undefined;
    if (!row) {
      throw new ApiError(404, "NOT_FOUND", "Liberação não encontrada.");
    }
    return { release: toReleaseDto(row) };
  });
}
