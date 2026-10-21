export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  role: "VISITOR" | "ANALYST" | "GATE" | "AUDITOR";
  active: number;
  created_at: string;
}

export interface VisitRow {
  id: string;
  request_code: string;
  visitor_id: string;
  created_by_user_id: string;
  visitor_name: string;
  company: string | null;
  contact: string | null;
  purpose: string;
  host_name: string | null;
  status: "PENDING_REVIEW" | "APPROVED" | "REJECTED" | "CANCELLED" | "EXPIRED" | "COMPLETED";
  version: number;
  privacy_notice_version: string;
  created_at: string;
  submitted_at: string;
  decided_at: string | null;
  decided_by: string | null;
  decision_reason: string | null;
  approved_at: string | null;
  cpf_last2: string;
  decision_count?: number;
  identity_check_count?: number;
  release_count?: number;
  last_release_decision?: "AUTHORIZED" | "DENIED" | "UNKNOWN" | null;
}

export interface IdentityCheckRow {
  id: string;
  visit_request_id: string;
  operator_id: string;
  operator_name: string;
  mode: "SIMULATED";
  outcome:
    | "SIMULATED_MATCH"
    | "SIMULATED_NO_MATCH"
    | "INCONCLUSIVE"
    | "ERROR"
    | "UNAVAILABLE";
  provider_reference: string;
  occurred_at: string;
  correlation_id: string;
}

export interface ReleaseRow {
  id: string;
  visit_request_id: string;
  identity_check_id: string;
  operator_id: string;
  operator_name: string;
  idempotency_key: string;
  decision: "AUTHORIZED" | "DENIED" | "UNKNOWN";
  reason_code: string | null;
  mode: "SIMULATED";
  physical_access_performed: number;
  occurred_at: string;
  correlation_id: string;
  request_version: number;
}

export interface AuditRow {
  id: string;
  event_type: string;
  actor_id: string | null;
  actor_name: string | null;
  actor_role: string | null;
  target_type: string;
  target_id: string;
  occurred_at: string;
  result: "SUCCESS" | "DENIED" | "FAILED" | "UNKNOWN";
  mode: string | null;
  correlation_id: string;
  metadata_json: string;
}

export interface IdempotencyRow {
  scope: string;
  key: string;
  request_hash: string;
  status: "IN_PROGRESS" | "COMPLETED" | "FAILED";
  response_json: string;
  created_at: string;
}
