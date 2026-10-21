import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { DecisionDto, InternalVisitDto } from "@lins/shared";
import type { AppContext } from "../context";
import { recordAudit } from "../lib/audit";
import { newId } from "../lib/crypto";
import { ApiError } from "../lib/errors";
import { requireUser, validate } from "../lib/http";
import { toAuditDto, toInternalVisitDto } from "../lib/mappers";
import type { AuditRow, VisitRow } from "../lib/rows";
import { withTransaction } from "../lib/transaction";

const visitSelect = `
  SELECT vr.*, vp.cpf_last2,
    (SELECT COUNT(*) FROM visit_decisions d WHERE d.visit_request_id = vr.id) AS decision_count,
    (SELECT COUNT(*) FROM identity_checks ic WHERE ic.visit_request_id = vr.id) AS identity_check_count,
    (SELECT COUNT(*) FROM virtual_releases r WHERE r.visit_request_id = vr.id) AS release_count
  FROM visit_requests vr
  JOIN visitor_profiles vp ON vp.id = vr.visitor_id
`;

const statusSchema = z.enum([
  "PENDING_REVIEW",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
  "EXPIRED",
  "COMPLETED",
]);

const listQuerySchema = z.object({
  status: statusSchema.optional(),
});

const paramsSchema = z.object({
  id: z.string().min(5).max(120),
});

const decisionSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  expectedVersion: z.number().int().positive(),
  reason: z.string().trim().max(500).optional(),
});

const auditQuerySchema = z.object({
  targetType: z.string().trim().max(80).optional(),
  targetId: z.string().trim().max(120).optional(),
  eventType: z.string().trim().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

function findVisit(ctx: AppContext, id: string): VisitRow | undefined {
  return ctx.db
    .prepare(`${visitSelect} WHERE vr.id = ?`)
    .get(id) as unknown as VisitRow | undefined;
}

function decisionsFor(ctx: AppContext, visitId: string): DecisionDto[] {
  const rows = ctx.db
    .prepare(
      `SELECT id, decision, actor_name, reason, request_version, occurred_at, correlation_id
       FROM visit_decisions
       WHERE visit_request_id = ?
       ORDER BY occurred_at DESC`,
    )
    .all(visitId) as unknown as {
    id: string;
    decision: "APPROVE" | "REJECT";
    actor_name: string;
    reason: string | null;
    request_version: number;
    occurred_at: string;
    correlation_id: string;
  }[];
  return rows.map((row) => ({
    id: row.id,
    decision: row.decision,
    actorName: row.actor_name,
    reason: row.reason,
    requestVersion: row.request_version,
    occurredAt: row.occurred_at,
    correlationId: row.correlation_id,
  }));
}

export function registerInternalRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get("/api/v1/internal/visit-requests", async (request, reply) => {
    const user = requireUser(ctx.db, request, reply, ["ANALYST"]);
    if (!user) {
      return reply;
    }
    const query = validate(listQuerySchema, request.query);
    const rows = (
      query.status
        ? ctx.db
            .prepare(
              `${visitSelect} WHERE vr.status = ?
               ORDER BY CASE vr.status WHEN 'PENDING_REVIEW' THEN 0 ELSE 1 END,
                        vr.created_at DESC
               LIMIT 100`,
            )
            .all(query.status)
        : ctx.db
            .prepare(
              `${visitSelect}
               ORDER BY CASE vr.status WHEN 'PENDING_REVIEW' THEN 0 ELSE 1 END,
                        vr.created_at DESC
               LIMIT 100`,
            )
            .all()
    ) as unknown as VisitRow[];
    return { requests: rows.map(toInternalVisitDto) };
  });

  app.get("/api/v1/internal/visit-requests/:id", async (request, reply) => {
    const user = requireUser(ctx.db, request, reply, ["ANALYST"]);
    if (!user) {
      return reply;
    }
    const { id } = validate(paramsSchema, request.params);
    const row = findVisit(ctx, id);
    if (!row) {
      throw new ApiError(404, "NOT_FOUND", "Solicitação não encontrada.");
    }
    return {
      request: toInternalVisitDto(row),
      decisions: decisionsFor(ctx, id),
    };
  });

  app.post("/api/v1/internal/visit-requests/:id/decisions", async (request, reply) => {
    const user = requireUser(ctx.db, request, reply, ["ANALYST"]);
    if (!user) {
      return reply;
    }
    const { id } = validate(paramsSchema, request.params);
    const body = validate(decisionSchema, request.body);

    const updated = withTransaction(ctx.db, (): InternalVisitDto => {
      const current = findVisit(ctx, id);
      if (!current) {
        throw new ApiError(404, "NOT_FOUND", "Solicitação não encontrada.");
      }
      if (current.version !== body.expectedVersion) {
        throw new ApiError(
          409,
          "STATE_CONFLICT",
          "A solicitação foi alterada. Recarregue antes de decidir.",
        );
      }
      if (current.status !== "PENDING_REVIEW") {
        throw new ApiError(
          409,
          "INVALID_STATE_TRANSITION",
          "A solicitação não está mais aguardando análise.",
        );
      }

      const now = new Date().toISOString();
      const nextStatus = body.decision === "APPROVE" ? "APPROVED" : "REJECTED";
      const result = ctx.db
        .prepare(
          `UPDATE visit_requests
           SET status = ?, version = version + 1, decided_at = ?, decided_by = ?,
               decision_reason = ?, approved_at = ?
           WHERE id = ? AND version = ? AND status = 'PENDING_REVIEW'`,
        )
        .run(
          nextStatus,
          now,
          user.name,
          body.reason ?? null,
          body.decision === "APPROVE" ? now : null,
          id,
          body.expectedVersion,
        );
      if (Number(result.changes) !== 1) {
        throw new ApiError(
          409,
          "STATE_CONFLICT",
          "A solicitação foi alterada por outra operação.",
        );
      }

      ctx.db
        .prepare(
          `INSERT INTO visit_decisions
            (id, visit_request_id, decision, actor_id, actor_name, reason, request_version,
             occurred_at, correlation_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          newId("dec"),
          id,
          body.decision,
          user.id,
          user.name,
          body.reason ?? null,
          body.expectedVersion,
          now,
          request.correlationId,
        );

      recordAudit(ctx.db, {
        eventType: "VISIT_DECISION_RECORDED",
        actorId: user.id,
        actorName: user.name,
        actorRole: user.role,
        targetType: "VisitRequest",
        targetId: id,
        mode: "SIMULATED",
        correlationId: request.correlationId,
        metadata: {
          decision: body.decision,
          requestVersion: body.expectedVersion,
          resultingStatus: nextStatus,
        },
      });

      const row = findVisit(ctx, id);
      if (!row) {
        throw new Error("Solicitação decidida não encontrada.");
      }
      return toInternalVisitDto(row);
    });

    return { request: updated, correlationId: request.correlationId };
  });

  app.get("/api/v1/internal/audit-events", async (request, reply) => {
    const user = requireUser(ctx.db, request, reply, ["AUDITOR"]);
    if (!user) {
      return reply;
    }
    const query = validate(auditQuerySchema, request.query);
    const conditions: string[] = ["1 = 1"];
    const params: (string | number)[] = [];
    if (query.targetType) {
      conditions.push("target_type = ?");
      params.push(query.targetType);
    }
    if (query.targetId) {
      conditions.push("target_id = ?");
      params.push(query.targetId);
    }
    if (query.eventType) {
      conditions.push("event_type = ?");
      params.push(query.eventType);
    }
    const rows = ctx.db
      .prepare(
        `SELECT * FROM audit_events
         WHERE ${conditions.join(" AND ")}
         ORDER BY occurred_at DESC
         LIMIT ?`,
      )
      .all(...params, query.limit) as unknown as AuditRow[];

    recordAudit(ctx.db, {
      eventType: "AUDIT_QUERY",
      actorId: user.id,
      actorName: user.name,
      actorRole: user.role,
      targetType: "AUDIT_LOG",
      targetId: "audit-events",
      correlationId: request.correlationId,
      metadata: {
        eventTypeFilter: query.eventType ?? null,
        targetTypeFilter: query.targetType ?? null,
        targetIdFilter: query.targetId ?? null,
        resultCount: rows.length,
      },
    });

    return { events: rows.map(toAuditDto) };
  });
}
