import type {
  AuditEventDto,
  GateVisitDto,
  InternalVisitDto,
  VisitDto,
} from "@lins/shared";
import type { AuditRow, ReleaseRow, VisitRow } from "./rows";

export function cpfMask(last2: string): string {
  return `***.***.***-${last2}`;
}

export function toVisitDto(row: VisitRow): VisitDto {
  return {
    id: row.id,
    requestCode: row.request_code,
    status: row.status,
    version: row.version,
    visitorName: row.visitor_name,
    cpfMasked: cpfMask(row.cpf_last2),
    company: row.company,
    contact: row.contact,
    purpose: row.purpose,
    hostName: row.host_name,
    privacyNoticeVersion: row.privacy_notice_version,
    createdAt: row.created_at,
    submittedAt: row.submitted_at,
    decidedAt: row.decided_at,
    decisionReason: row.decision_reason,
    approvedAt: row.approved_at,
    decisionBy: row.decided_by,
  };
}

export function eligibility(status: VisitRow["status"]): {
  eligible: boolean;
  reasons: string[];
} {
  if (status === "APPROVED") {
    return { eligible: true, reasons: [] };
  }
  return {
    eligible: false,
    reasons: [`Visita com estado ${status} não é elegível para liberação.`],
  };
}

export function toGateVisitDto(row: VisitRow): GateVisitDto {
  const state = eligibility(row.status);
  return {
    id: row.id,
    requestCode: row.request_code,
    status: row.status,
    version: row.version,
    visitorName: row.visitor_name,
    company: row.company,
    purpose: row.purpose,
    hostName: row.host_name,
    approvedAt: row.approved_at,
    eligible: state.eligible,
    eligibilityReasons: state.reasons,
    lastReleaseDecision: row.last_release_decision ?? null,
  };
}

export function toInternalVisitDto(row: VisitRow): InternalVisitDto {
  return {
    ...toVisitDto(row),
    decisionCount: row.decision_count ?? 0,
    identityCheckCount: row.identity_check_count ?? 0,
    releaseCount: row.release_count ?? 0,
  };
}

export function toAuditDto(row: AuditRow): AuditEventDto {
  let metadata: Record<string, unknown> = {};
  try {
    metadata = JSON.parse(row.metadata_json) as Record<string, unknown>;
  } catch {
    metadata = {};
  }
  return {
    id: row.id,
    eventType: row.event_type,
    actorId: row.actor_id,
    actorName: row.actor_name,
    actorRole: row.actor_role,
    targetType: row.target_type,
    targetId: row.target_id,
    occurredAt: row.occurred_at,
    result: row.result,
    mode: row.mode,
    correlationId: row.correlation_id,
    metadata,
  };
}

export function toReleaseDto(
  row: ReleaseRow,
  idempotentReplay = false,
): {
  releaseId: string;
  visitRequestId: string;
  identityCheckId: string;
  decision: "AUTHORIZED" | "DENIED" | "UNKNOWN";
  reasonCode: string | null;
  mode: "SIMULATED";
  physicalAccessPerformed: false;
  occurredAt: string;
  correlationId: string;
  requestVersion: number;
  idempotentReplay?: boolean;
} {
  return {
    releaseId: row.id,
    visitRequestId: row.visit_request_id,
    identityCheckId: row.identity_check_id,
    decision: row.decision,
    reasonCode: row.reason_code,
    mode: "SIMULATED",
    physicalAccessPerformed: false,
    occurredAt: row.occurred_at,
    correlationId: row.correlation_id,
    requestVersion: row.request_version,
    ...(idempotentReplay ? { idempotentReplay: true } : {}),
  };
}
