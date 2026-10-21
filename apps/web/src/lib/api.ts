import type {
  AuditEventListDto,
  AuthUser,
  GateVisitDto,
  IdentityCheckDto,
  IdentityOutcome,
  InternalVisitDetailDto,
  InternalVisitDto,
  LoginResponse,
  ReleaseDto,
  VisitDto,
  VisitResponse,
  VisitStatus,
} from "@lins/shared";

const TOKEN_KEY = "lins.demo.session";
const SESSION_EXPIRED_EVENT = "lins:session-expired";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly correlationId: string;
  readonly fields: { name: string; message: string }[];

  constructor(
    status: number,
    code: string,
    message: string,
    correlationId: string,
    fields?: { name: string; message: string }[],
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.correlationId = correlationId;
    this.fields = fields ?? [];
  }
}

export interface CreateVisitInput {
  visitorName: string;
  cpf: string;
  company?: string;
  contact?: string;
  purpose: string;
  hostName?: string;
  privacyNoticeVersion: string;
  privacyNoticeAccepted: boolean;
}

export interface AuditQuery {
  targetType?: string;
  targetId?: string;
  eventType?: string;
  limit?: number;
}

export function getToken(): string | null {
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  window.localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body !== undefined && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  const token = getToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(path, { ...init, headers });
  } catch {
    throw new ApiError(
      0,
      "NETWORK_ERROR",
      "Não foi possível conectar ao servidor. Verifique se a API está em execução.",
      "",
    );
  }

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const envelope = payload as
      | {
          error?: {
            code?: string;
            message?: string;
            correlationId?: string;
            fields?: { name: string; message: string }[];
          };
        }
      | null;
    const error = envelope?.error;
    if (response.status === 401 && path !== "/api/v1/auth/login") {
      clearToken();
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    }
    throw new ApiError(
      response.status,
      error?.code ?? "UNKNOWN_ERROR",
      error?.message ?? "Não foi possível concluir a operação.",
      error?.correlationId ?? response.headers.get("X-Correlation-Id") ?? "",
      error?.fields,
    );
  }

  return payload as T;
}

function post<T>(path: string, body: unknown, idempotencyKey?: string): Promise<T> {
  const headers: Record<string, string> = {};
  if (idempotencyKey) {
    headers["Idempotency-Key"] = idempotencyKey;
  }
  return request<T>(path, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

export const api = {
  login(email: string, password: string): Promise<LoginResponse> {
    return post<LoginResponse>("/api/v1/auth/login", { email, password });
  },
  me(): Promise<{ user: AuthUser }> {
    return request<{ user: AuthUser }>("/api/v1/auth/me");
  },
  logout(): Promise<void> {
    return request<void>("/api/v1/auth/logout", { method: "POST" });
  },
  createVisit(input: CreateVisitInput, key: string): Promise<VisitResponse> {
    return post<VisitResponse>("/api/v1/visitor/requests", input, key);
  },
  myVisits(): Promise<{ requests: VisitDto[] }> {
    return request<{ requests: VisitDto[] }>("/api/v1/visitor/requests");
  },
  internalVisits(status?: VisitStatus): Promise<{ requests: InternalVisitDto[] }> {
    const query = status ? `?status=${encodeURIComponent(status)}` : "";
    return request<{ requests: InternalVisitDto[] }>(
      `/api/v1/internal/visit-requests${query}`,
    );
  },
  internalVisit(id: string): Promise<InternalVisitDetailDto> {
    return request<InternalVisitDetailDto>(
      `/api/v1/internal/visit-requests/${encodeURIComponent(id)}`,
    );
  },
  decide(
    id: string,
    decision: "APPROVE" | "REJECT",
    expectedVersion: number,
    reason?: string,
  ): Promise<{ request: InternalVisitDto; correlationId: string }> {
    return post(`/api/v1/internal/visit-requests/${encodeURIComponent(id)}/decisions`, {
      decision,
      expectedVersion,
      reason: reason || undefined,
    });
  },
  auditEvents(query: AuditQuery = {}): Promise<AuditEventListDto> {
    const params = new URLSearchParams();
    if (query.targetType) params.set("targetType", query.targetType);
    if (query.targetId) params.set("targetId", query.targetId);
    if (query.eventType) params.set("eventType", query.eventType);
    if (query.limit) params.set("limit", String(query.limit));
    const suffix = params.toString() ? `?${params.toString()}` : "";
    return request<AuditEventListDto>(`/api/v1/internal/audit-events${suffix}`);
  },
  gateVisits(q?: string): Promise<{ visits: GateVisitDto[] }> {
    const suffix = q ? `?q=${encodeURIComponent(q)}` : "";
    return request<{ visits: GateVisitDto[] }>(`/api/v1/gate/visits${suffix}`);
  },
  gateVisit(id: string): Promise<{ visit: GateVisitDto }> {
    return request<{ visit: GateVisitDto }>(
      `/api/v1/gate/visits/${encodeURIComponent(id)}`,
    );
  },
  gateLookup(requestCode: string): Promise<{ visit: GateVisitDto }> {
    return post<{ visit: GateVisitDto }>("/api/v1/gate/visits/lookup", {
      requestCode,
    });
  },
  identityCheck(
    visitId: string,
    simulatedOutcome: IdentityOutcome,
  ): Promise<{ check: IdentityCheckDto }> {
    return post<{ check: IdentityCheckDto }>(
      `/api/v1/gate/visits/${encodeURIComponent(visitId)}/identity-checks`,
      { mode: "SIMULATED", simulatedOutcome },
    );
  },
  release(
    visitRequestId: string,
    identityCheckId: string,
    expectedVersion: number,
    key: string,
  ): Promise<ReleaseDto> {
    return post<ReleaseDto>(
      "/api/v1/gate/virtual-releases",
      { visitRequestId, identityCheckId, expectedVersion },
      key,
    );
  },
};

export { SESSION_EXPIRED_EVENT };
