export const APP_MODE = "SIMULATED" as const;
export const PHYSICAL_ACCESS_PERFORMED = false as const;
export const PRIVACY_NOTICE_VERSION = "demo-2026-10-21";
export const MAX_PAGE_SIZE = 100;

export type Role = "VISITOR" | "ANALYST" | "GATE" | "AUDITOR";

export type VisitStatus =
  | "PENDING_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "CANCELLED"
  | "EXPIRED"
  | "COMPLETED";

export type Decision = "APPROVE" | "REJECT";

export type IdentityMode = "SIMULATED" | "REAL";

export type IdentityOutcome =
  | "SIMULATED_MATCH"
  | "SIMULATED_NO_MATCH"
  | "INCONCLUSIVE"
  | "ERROR"
  | "UNAVAILABLE";

export type ReleaseDecision = "AUTHORIZED" | "DENIED" | "UNKNOWN";

export type AuditResult = "SUCCESS" | "DENIED" | "FAILED" | "UNKNOWN";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
  expiresAt: string;
}

export interface VisitDto {
  id: string;
  requestCode: string;
  status: VisitStatus;
  version: number;
  visitorName: string;
  cpfMasked: string;
  company: string | null;
  contact: string | null;
  purpose: string;
  hostName: string | null;
  privacyNoticeVersion: string;
  createdAt: string;
  submittedAt: string;
  decidedAt: string | null;
  decisionReason: string | null;
  approvedAt: string | null;
  decisionBy: string | null;
}

export interface GateVisitDto {
  id: string;
  requestCode: string;
  status: VisitStatus;
  version: number;
  visitorName: string;
  company: string | null;
  purpose: string;
  hostName: string | null;
  approvedAt: string | null;
  eligible: boolean;
  eligibilityReasons: string[];
  lastReleaseDecision: ReleaseDecision | null;
}

export interface InternalVisitDto extends VisitDto {
  decisionCount: number;
  identityCheckCount: number;
  releaseCount: number;
}

export interface DecisionDto {
  id: string;
  decision: Decision;
  actorName: string;
  reason: string | null;
  requestVersion: number;
  occurredAt: string;
  correlationId: string;
}

export interface VisitResponse extends VisitDto {
  idempotentReplay?: boolean;
}

export interface InternalVisitDetailDto {
  request: InternalVisitDto;
  decisions: DecisionDto[];
}

export interface AuditEventListDto {
  events: AuditEventDto[];
}

export interface PublicConfigDto {
  appEnv: string;
  mode: typeof APP_MODE;
  demoMode: boolean;
  identityMode: "SIMULATED";
  privacyNoticeVersion: string;
  physicalAccessPerformed: false;
}

export interface PrivacyNoticeDto {
  version: string;
  title: string;
  text: string;
  approvedForProduction: false;
  syntheticDataOnly: true;
}

export interface IdentityCheckDto {
  id: string;
  visitRequestId: string;
  mode: IdentityMode;
  outcome: IdentityOutcome;
  occurredAt: string;
  correlationId: string;
  providerReference: string;
}

export interface ReleaseDto {
  releaseId: string;
  visitRequestId: string;
  identityCheckId: string;
  decision: ReleaseDecision;
  reasonCode: string | null;
  mode: "SIMULATED";
  physicalAccessPerformed: false;
  occurredAt: string;
  correlationId: string;
  requestVersion: number;
  idempotentReplay?: boolean;
}

export interface AuditEventDto {
  id: string;
  eventType: string;
  actorId: string | null;
  actorName: string | null;
  actorRole: string | null;
  targetType: string;
  targetId: string;
  occurredAt: string;
  result: AuditResult;
  mode: string | null;
  correlationId: string;
  metadata: Record<string, unknown>;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    fields?: { name: string; message: string }[];
    correlationId: string;
  };
}

export const STATUS_LABELS: Record<VisitStatus, string> = {
  PENDING_REVIEW: "Aguardando análise",
  APPROVED: "Aprovada",
  REJECTED: "Rejeitada",
  CANCELLED: "Cancelada",
  EXPIRED: "Expirada",
  COMPLETED: "Concluída",
};

export const ROLE_LABELS: Record<Role, string> = {
  VISITOR: "Visitante",
  ANALYST: "Analista",
  GATE: "Portaria",
  AUDITOR: "Auditoria",
};

export const OUTCOME_LABELS: Record<IdentityOutcome, string> = {
  SIMULATED_MATCH: "Correspondência simulada",
  SIMULATED_NO_MATCH: "Sem correspondência simulada",
  INCONCLUSIVE: "Inconclusivo",
  ERROR: "Erro controlado",
  UNAVAILABLE: "Indisponível",
};

export const RELEASE_LABELS: Record<ReleaseDecision, string> = {
  AUTHORIZED: "Liberação virtual autorizada",
  DENIED: "Acesso não autorizado",
  UNKNOWN: "Resultado desconhecido",
};

export const EVENT_LABELS: Record<string, string> = {
  VISIT_REQUEST_CREATED: "Solicitação criada",
  VISIT_REQUEST_SUBMITTED: "Solicitação enviada",
  VISIT_DECISION_RECORDED: "Decisão registrada",
  IDENTITY_CHECK_RECORDED: "Conferência simulada registrada",
  GATE_VISIT_VIEWED: "Visita consultada na portaria",
  VIRTUAL_RELEASE_REQUESTED: "Liberação virtual solicitada",
  VIRTUAL_RELEASE_AUTHORIZED: "Liberação virtual autorizada",
  VIRTUAL_RELEASE_DENIED: "Liberação virtual negada",
  VIRTUAL_RELEASE_RECORDED: "Liberação virtual registrada",
  SECURITY_ACCESS_DENIED: "Acesso negado",
  IDEMPOTENCY_REPLAY: "Repetição idempotente",
  IDEMPOTENCY_CONFLICT: "Conflito de idempotência",
  AUDIT_QUERY: "Consulta de auditoria",
  DEMO_DATA_SEEDED: "Dados demo preparados",
};
