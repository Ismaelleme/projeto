import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { PRIVACY_NOTICE_VERSION, type VisitDto } from "@lins/shared";
import type { AppContext } from "../context";
import { recordAudit } from "../lib/audit";
import {
  cpfLast2,
  hashCpf,
  hashPayload,
  isValidCpf,
  newId,
  newRequestCode,
  normalizeCpf,
} from "../lib/crypto";
import { ApiError } from "../lib/errors";
import {
  readIdempotencyKey,
  requireUser,
  validate,
} from "../lib/http";
import { findIdempotentReplay, saveIdempotency } from "../lib/idempotency";
import { toVisitDto } from "../lib/mappers";
import type { VisitRow } from "../lib/rows";
import { withTransaction } from "../lib/transaction";

const createSchema = z.object({
  visitorName: z.string().trim().min(3, "Informe o nome completo.").max(120),
  cpf: z.string().trim().min(11, "Informe o CPF.").max(14),
  company: z.string().trim().max(120).optional(),
  contact: z.string().trim().max(80).optional(),
  purpose: z.string().trim().min(3, "Informe o motivo da visita.").max(200),
  hostName: z.string().trim().max(120).optional(),
  privacyNoticeVersion: z.string().min(1, "O aviso de privacidade é obrigatório."),
  privacyNoticeAccepted: z
    .boolean()
    .refine((value) => value, "Confirme a leitura do aviso de privacidade."),
});

const paramsSchema = z.object({
  id: z.string().min(5).max(120),
});

function findOwnedVisit(db: AppContext["db"], id: string, userId: string): VisitRow | undefined {
  return db
    .prepare(
      `SELECT vr.*, vp.cpf_last2
       FROM visit_requests vr
       JOIN visitor_profiles vp ON vp.id = vr.visitor_id
       WHERE vr.id = ? AND vr.created_by_user_id = ?`,
    )
    .get(id, userId) as VisitRow | undefined;
}

export function registerVisitorRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.post("/api/v1/visitor/requests", async (request, reply) => {
    const user = requireUser(ctx.db, request, reply, ["VISITOR"]);
    if (!user) {
      return reply;
    }

    const idempotencyKey = readIdempotencyKey(request);
    const body = validate(createSchema, request.body);
    const cpf = normalizeCpf(body.cpf);
    if (!isValidCpf(cpf)) {
      throw new ApiError(422, "VALIDATION_ERROR", "Verifique os campos informados.", [
        { name: "cpf", message: "CPF inválido." },
      ]);
    }
    if (body.privacyNoticeVersion !== PRIVACY_NOTICE_VERSION) {
      throw new ApiError(
        422,
        "PRIVACY_NOTICE_REQUIRED",
        "A versão do aviso de privacidade não é a vigente neste ambiente.",
      );
    }

    const payloadHash = hashPayload({
      visitorName: body.visitorName,
      cpf,
      company: body.company ?? "",
      contact: body.contact ?? "",
      purpose: body.purpose,
      hostName: body.hostName ?? "",
      privacyNoticeVersion: body.privacyNoticeVersion,
    });
    const scope = `visit.create:${user.id}`;
    let replayed = false;

    const response = withTransaction(ctx.db, (): VisitDto => {
      const replay = findIdempotentReplay<VisitDto>(
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
          targetType: "VisitRequest",
          targetId: replay.id,
          correlationId: request.correlationId,
          metadata: { operation: "visit.create" },
        });
        return replay;
      }

      const cpfHash = hashCpf(cpf, ctx.config.cpfHashSecret);
      let profile = ctx.db
        .prepare(
          "SELECT id FROM visitor_profiles WHERE user_id = ? AND cpf_hash = ?",
        )
        .get(user.id, cpfHash) as { id: string } | undefined;

      if (!profile) {
        profile = { id: newId("vpr") };
        const now = new Date().toISOString();
        ctx.db
          .prepare(
            `INSERT INTO visitor_profiles
              (id, user_id, name, company, contact, cpf_hash, cpf_last2, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            profile.id,
            user.id,
            body.visitorName,
            body.company ?? null,
            body.contact ?? null,
            cpfHash,
            cpfLast2(cpf),
            now,
            now,
          );
      } else {
        ctx.db
          .prepare(
            "UPDATE visitor_profiles SET name = ?, company = ?, contact = ?, updated_at = ? WHERE id = ?",
          )
          .run(
            body.visitorName,
            body.company ?? null,
            body.contact ?? null,
            new Date().toISOString(),
            profile.id,
          );
      }

      const visitId = newId("vis");
      const now = new Date().toISOString();
      ctx.db
        .prepare(
          `INSERT INTO visit_requests
            (id, request_code, visitor_id, created_by_user_id, visitor_name, company,
             contact, purpose, host_name, status, version, privacy_notice_version,
             created_at, submitted_at, decided_at, decided_by, decision_reason, approved_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING_REVIEW', 1, ?, ?, ?, NULL, NULL, NULL, NULL)`,
        )
        .run(
          visitId,
          newRequestCode(),
          profile.id,
          user.id,
          body.visitorName,
          body.company ?? null,
          body.contact ?? null,
          body.purpose,
          body.hostName ?? null,
          body.privacyNoticeVersion,
          now,
          now,
        );

      recordAudit(ctx.db, {
        eventType: "VISIT_REQUEST_CREATED",
        actorId: user.id,
        actorName: user.name,
        actorRole: user.role,
        targetType: "VisitRequest",
        targetId: visitId,
        mode: "SIMULATED",
        correlationId: request.correlationId,
        metadata: { status: "PENDING_REVIEW" },
      });
      recordAudit(ctx.db, {
        eventType: "VISIT_REQUEST_SUBMITTED",
        actorId: user.id,
        actorName: user.name,
        actorRole: user.role,
        targetType: "VisitRequest",
        targetId: visitId,
        mode: "SIMULATED",
        correlationId: request.correlationId,
        metadata: { status: "PENDING_REVIEW" },
      });

      const row = findOwnedVisit(ctx.db, visitId, user.id);
      if (!row) {
        throw new Error("Solicitação recém-criada não encontrada.");
      }
      const dto = toVisitDto(row);
      saveIdempotency(ctx.db, scope, idempotencyKey, payloadHash, dto);
      return dto;
    });

    return reply
      .code(replayed ? 200 : 201)
      .send(replayed ? { ...response, idempotentReplay: true } : response);
  });

  app.get("/api/v1/visitor/requests", async (request, reply) => {
    const user = requireUser(ctx.db, request, reply, ["VISITOR"]);
    if (!user) {
      return reply;
    }
    const rows = ctx.db
      .prepare(
        `SELECT vr.*, vp.cpf_last2
         FROM visit_requests vr
         JOIN visitor_profiles vp ON vp.id = vr.visitor_id
         WHERE vr.created_by_user_id = ?
         ORDER BY vr.created_at DESC`,
      )
      .all(user.id) as unknown as VisitRow[];
    return { requests: rows.map(toVisitDto) };
  });

  app.get("/api/v1/visitor/requests/:id", async (request, reply) => {
    const user = requireUser(ctx.db, request, reply, ["VISITOR"]);
    if (!user) {
      return reply;
    }
    const { id } = validate(paramsSchema, request.params);
    const row = findOwnedVisit(ctx.db, id, user.id);
    if (!row) {
      throw new ApiError(404, "NOT_FOUND", "Solicitação não encontrada.");
    }
    return { request: toVisitDto(row) };
  });

  app.post("/api/v1/visitor/requests/:id/cancel", async (request, reply) => {
    const user = requireUser(ctx.db, request, reply, ["VISITOR"]);
    if (!user) {
      return reply;
    }
    const { id } = validate(paramsSchema, request.params);
    const row = findOwnedVisit(ctx.db, id, user.id);
    if (!row) {
      throw new ApiError(404, "NOT_FOUND", "Solicitação não encontrada.");
    }
    recordAudit(ctx.db, {
      eventType: "VISIT_CANCELLED",
      actorId: user.id,
      actorName: user.name,
      actorRole: user.role,
      targetType: "VisitRequest",
      targetId: id,
      result: "DENIED",
      correlationId: request.correlationId,
      metadata: { reason: "CANCEL_POLICY_PENDING" },
    });
    throw new ApiError(
      409,
      "CANCEL_NOT_ALLOWED",
      "O cancelamento permanece indisponível até a aprovação da política.",
    );
  });
}
