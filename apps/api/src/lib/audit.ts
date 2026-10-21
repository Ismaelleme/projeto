import type { AuditResult } from "@lins/shared";
import type { Db } from "../db";
import { newId } from "./crypto";

export interface AuditInput {
  eventType: string;
  actorId?: string | null;
  actorName?: string | null;
  actorRole?: string | null;
  targetType: string;
  targetId: string;
  result?: AuditResult;
  mode?: "SIMULATED" | null;
  correlationId: string;
  metadata?: Record<string, unknown>;
}

export function recordAudit(db: Db, input: AuditInput): void {
  db.prepare(
    `INSERT INTO audit_events
      (id, event_type, actor_id, actor_name, actor_role, target_type, target_id,
       occurred_at, result, mode, correlation_id, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    newId("aud"),
    input.eventType,
    input.actorId ?? null,
    input.actorName ?? null,
    input.actorRole ?? null,
    input.targetType,
    input.targetId,
    new Date().toISOString(),
    input.result ?? "SUCCESS",
    input.mode ?? null,
    input.correlationId,
    JSON.stringify(input.metadata ?? {}),
  );
}
