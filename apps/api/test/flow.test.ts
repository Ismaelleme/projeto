import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { IdentityOutcome, VisitStatus } from "@lins/shared";
import { PRIVACY_NOTICE_VERSION } from "@lins/shared";
import { buildApp } from "../src/app";
import { loadConfig, type AppConfig } from "../src/config";
import { openDatabase, type Db } from "../src/db";
import { hashPassword } from "../src/lib/crypto";

const VALID_CPF = "111.444.777-35";
const PASSWORD = "Demo@1234";

interface TestContext {
  app: FastifyInstance;
  db: Db;
}

let context: TestContext;

async function createTestApp(overrides: Partial<AppConfig> = {}): Promise<TestContext> {
  const config = loadConfig({
    appEnv: "test",
    databasePath: ":memory:",
    seedDemoData: false,
    serveWeb: false,
    cpfHashSecret: "test-only-secret",
    loginRateLimit: 1000,
    ...overrides,
  });
  const db = openDatabase(config);
  const app = await buildApp({ config, db });
  return { app, db };
}

async function login(app: FastifyInstance, email: string): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email, password: PASSWORD },
  });
  expect(response.statusCode).toBe(200);
  return response.json().token as string;
}

function bearer(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

function createPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    visitorName: "Pessoa Sintética de Teste",
    cpf: VALID_CPF,
    company: "Empresa Fictícia Ltda",
    contact: "(14) 99999-0000",
    purpose: "Teste automatizado do fluxo",
    hostName: "Anfitrião Fictício",
    privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
    privacyNoticeAccepted: true,
    ...overrides,
  };
}

async function createVisit(
  app: FastifyInstance,
  token: string,
  key = "test-create-key-0001",
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; version: number; requestCode: string; status: VisitStatus }> {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/visitor/requests",
    headers: { ...bearer(token), "idempotency-key": key },
    payload: createPayload(overrides),
  });
  expect(response.statusCode).toBe(201);
  return response.json();
}

async function decide(
  app: FastifyInstance,
  token: string,
  id: string,
  expectedVersion: number,
  decision: "APPROVE" | "REJECT" = "APPROVE",
): Promise<void> {
  const response = await app.inject({
    method: "POST",
    url: `/api/v1/internal/visit-requests/${id}/decisions`,
    headers: bearer(token),
    payload: {
      decision,
      expectedVersion,
      reason: "Decisão de teste automatizado.",
    },
  });
  expect(response.statusCode).toBe(200);
}

async function checkIdentity(
  app: FastifyInstance,
  token: string,
  visitId: string,
  outcome: IdentityOutcome,
): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: `/api/v1/gate/visits/${visitId}/identity-checks`,
    headers: bearer(token),
    payload: { mode: "SIMULATED", simulatedOutcome: outcome },
  });
  expect(response.statusCode).toBe(201);
  return response.json().check.id as string;
}

async function release(
  app: FastifyInstance,
  token: string,
  visitId: string,
  checkId: string,
  key: string,
  expectedVersion = 2,
) {
  return app.inject({
    method: "POST",
    url: "/api/v1/gate/virtual-releases",
    headers: { ...bearer(token), "idempotency-key": key },
    payload: {
      visitRequestId: visitId,
      identityCheckId: checkId,
      expectedVersion,
    },
  });
}

beforeEach(async () => {
  context = await createTestApp();
});

afterEach(async () => {
  await context.app.close();
  context.db.close();
});

describe("saúde e configuração", () => {
  it("expõe modo simulado e ausência de acesso físico", async () => {
    const health = await context.app.inject({ method: "GET", url: "/health" });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toMatchObject({
      status: "ok",
      mode: "SIMULATED",
      physicalAccessPerformed: false,
    });

    const publicConfig = await context.app.inject({
      method: "GET",
      url: "/api/v1/public/config",
    });
    expect(publicConfig.statusCode).toBe(200);
    expect(publicConfig.json()).toMatchObject({
      mode: "SIMULATED",
      identityMode: "SIMULATED",
      physicalAccessPerformed: false,
      privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
    });
  });

  it("bloqueia inicialização em produção", async () => {
    await expect(
      buildApp({
        config: {
          appEnv: "production",
          databasePath: ":memory:",
          seedDemoData: false,
          serveWeb: false,
        },
      }),
    ).rejects.toThrow(/simulado/);
  });
});

describe("autenticação e autorização", () => {
  it("nega acesso sem sessão e credenciais inválidas", async () => {
    const anonymous = await context.app.inject({
      method: "GET",
      url: "/api/v1/visitor/requests",
    });
    expect(anonymous.statusCode).toBe(401);
    expect(anonymous.json().error.code).toBe("UNAUTHENTICATED");

    const invalid = await context.app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "visitante@demo.local", password: "senha-errada" },
    });
    expect(invalid.statusCode).toBe(401);
    expect(invalid.json().error.code).toBe("UNAUTHENTICATED");
  });

  it("impede que perfis executem operações de outros portais", async () => {
    const visitor = await login(context.app, "visitante@demo.local");
    const gate = await login(context.app, "portaria@demo.local");
    const auditor = await login(context.app, "auditor@demo.local");

    const visitorTriesGate = await context.app.inject({
      method: "GET",
      url: "/api/v1/gate/visits",
      headers: bearer(visitor),
    });
    expect(visitorTriesGate.statusCode).toBe(403);

    const gateTriesInternal = await context.app.inject({
      method: "GET",
      url: "/api/v1/internal/visit-requests",
      headers: bearer(gate),
    });
    expect(gateTriesInternal.statusCode).toBe(403);

    const visitorTriesAudit = await context.app.inject({
      method: "GET",
      url: "/api/v1/internal/audit-events",
      headers: bearer(visitor),
    });
    expect(visitorTriesAudit.statusCode).toBe(403);

    const audit = await context.app.inject({
      method: "GET",
      url: "/api/v1/internal/audit-events?eventType=SECURITY_ACCESS_DENIED",
      headers: bearer(auditor),
    });
    expect(audit.statusCode).toBe(200);
    expect(audit.json().events.length).toBeGreaterThanOrEqual(3);
  });

  it("aplica rate limit no login", async () => {
    await context.app.close();
    context.db.close();
    context = await createTestApp({ loginRateLimit: 2 });

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await context.app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { email: "visitante@demo.local", password: "errada" },
      });
      expect(response.statusCode).toBe(401);
    }
    const limited = await context.app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "visitante@demo.local", password: "errada" },
    });
    expect(limited.statusCode).toBe(429);
    expect(limited.json().error.code).toBe("RATE_LIMITED");
  });
});

describe("portal do visitante", () => {
  it("cria solicitação sem RG, mascara CPF e trata idempotência", async () => {
    const visitor = await login(context.app, "visitante@demo.local");
    const first = await context.app.inject({
      method: "POST",
      url: "/api/v1/visitor/requests",
      headers: {
        ...bearer(visitor),
        "idempotency-key": "visitor-create-key-01",
      },
      payload: createPayload(),
    });
    expect(first.statusCode).toBe(201);
    const created = first.json();
    expect(created.status).toBe("PENDING_REVIEW");
    expect(created.cpfMasked).toBe("***.***.***-35");
    expect(JSON.stringify(created)).not.toContain("111.444.777-35");
    expect(created).not.toHaveProperty("rg");

    const replay = await context.app.inject({
      method: "POST",
      url: "/api/v1/visitor/requests",
      headers: {
        ...bearer(visitor),
        "idempotency-key": "visitor-create-key-01",
      },
      payload: createPayload(),
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json().id).toBe(created.id);
    expect(replay.json().idempotentReplay).toBe(true);

    const conflict = await context.app.inject({
      method: "POST",
      url: "/api/v1/visitor/requests",
      headers: {
        ...bearer(visitor),
        "idempotency-key": "visitor-create-key-01",
      },
      payload: createPayload({ purpose: "Outro motivo" }),
    });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().error.code).toBe("IDEMPOTENCY_CONFLICT");

    const list = await context.app.inject({
      method: "GET",
      url: "/api/v1/visitor/requests",
      headers: bearer(visitor),
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().requests).toHaveLength(1);
  });

  it("exige Idempotency-Key e valida CPF e aviso de privacidade", async () => {
    const visitor = await login(context.app, "visitante@demo.local");

    const missingKey = await context.app.inject({
      method: "POST",
      url: "/api/v1/visitor/requests",
      headers: bearer(visitor),
      payload: createPayload(),
    });
    expect(missingKey.statusCode).toBe(400);
    expect(missingKey.json().error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");

    const invalidCpf = await context.app.inject({
      method: "POST",
      url: "/api/v1/visitor/requests",
      headers: { ...bearer(visitor), "idempotency-key": "visitor-create-key-02" },
      payload: createPayload({ cpf: "000.000.000-00" }),
    });
    expect(invalidCpf.statusCode).toBe(422);
    expect(invalidCpf.json().error.fields[0].name).toBe("cpf");

    const invalidNotice = await context.app.inject({
      method: "POST",
      url: "/api/v1/visitor/requests",
      headers: { ...bearer(visitor), "idempotency-key": "visitor-create-key-03" },
      payload: createPayload({ privacyNoticeVersion: "outra-versao" }),
    });
    expect(invalidNotice.statusCode).toBe(422);
    expect(invalidNotice.json().error.code).toBe("PRIVACY_NOTICE_REQUIRED");
  });

  it("não permite consultar solicitação de outro visitante", async () => {
    const visitor = await login(context.app, "visitante@demo.local");
    const created = await createVisit(context.app, visitor, "visitor-create-key-04");

    context.db
      .prepare(
        "INSERT INTO users (id, email, password_hash, name, role, active, created_at) VALUES (?, ?, ?, ?, 'VISITOR', 1, ?)",
      )
      .run(
        "usr_second_visitor",
        "visitante2@demo.local",
        hashPassword(PASSWORD),
        "Segundo Visitante",
        new Date().toISOString(),
      );
    const second = await login(context.app, "visitante2@demo.local");

    const attempt = await context.app.inject({
      method: "GET",
      url: `/api/v1/visitor/requests/${created.id}`,
      headers: bearer(second),
    });
    expect(attempt.statusCode).toBe(404);
    expect(attempt.json().error.code).toBe("NOT_FOUND");
  });

  it("mantém o cancelamento bloqueado até decisão de política", async () => {
    const visitor = await login(context.app, "visitante@demo.local");
    const created = await createVisit(context.app, visitor, "visitor-create-key-05");
    const cancel = await context.app.inject({
      method: "POST",
      url: `/api/v1/visitor/requests/${created.id}/cancel`,
      headers: bearer(visitor),
    });
    expect(cancel.statusCode).toBe(409);
    expect(cancel.json().error.code).toBe("CANCEL_NOT_ALLOWED");
  });
});

describe("decisão interna", () => {
  it("aprova com versão esperada e rejeita conflito", async () => {
    const visitor = await login(context.app, "visitante@demo.local");
    const analyst = await login(context.app, "analista@demo.local");
    const created = await createVisit(context.app, visitor, "internal-key-01");

    const stale = await context.app.inject({
      method: "POST",
      url: `/api/v1/internal/visit-requests/${created.id}/decisions`,
      headers: bearer(analyst),
      payload: { decision: "APPROVE", expectedVersion: 99 },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.code).toBe("STATE_CONFLICT");

    await decide(context.app, analyst, created.id, 1);

    const detail = await context.app.inject({
      method: "GET",
      url: `/api/v1/internal/visit-requests/${created.id}`,
      headers: bearer(analyst),
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().request.status).toBe("APPROVED");
    expect(detail.json().request.version).toBe(2);
    expect(detail.json().decisions).toHaveLength(1);

    const again = await context.app.inject({
      method: "POST",
      url: `/api/v1/internal/visit-requests/${created.id}/decisions`,
      headers: bearer(analyst),
      payload: { decision: "REJECT", expectedVersion: 2 },
    });
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe("INVALID_STATE_TRANSITION");
  });
});

describe("portaria e liberação virtual", () => {
  async function approvedVisit(): Promise<{
    visitor: string;
    analyst: string;
    gate: string;
    visitorToken: string;
    visitId: string;
  }> {
    const visitorToken = await login(context.app, "visitante@demo.local");
    const analyst = await login(context.app, "analista@demo.local");
    const gate = await login(context.app, "portaria@demo.local");
    const created = await createVisit(context.app, visitorToken, "gate-key-01");
    await decide(context.app, analyst, created.id, 1);
    return { visitor: visitorToken, analyst, gate, visitorToken, visitId: created.id };
  }

  it("executa conferência simulada e liberação idempotente sem acesso físico", async () => {
    const flow = await approvedVisit();

    const list = await context.app.inject({
      method: "GET",
      url: "/api/v1/gate/visits",
      headers: bearer(flow.gate),
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().visits[0]).toMatchObject({
      id: flow.visitId,
      eligible: true,
      status: "APPROVED",
    });

    const realMode = await context.app.inject({
      method: "POST",
      url: `/api/v1/gate/visits/${flow.visitId}/identity-checks`,
      headers: bearer(flow.gate),
      payload: { mode: "REAL" },
    });
    expect(realMode.statusCode).toBe(422);
    expect(realMode.json().error.code).toBe("MODE_NOT_ALLOWED");

    const checkId = await checkIdentity(
      context.app,
      flow.gate,
      flow.visitId,
      "SIMULATED_MATCH",
    );
    const first = await release(
      context.app,
      flow.gate,
      flow.visitId,
      checkId,
      "release-key-0001",
    );
    expect(first.statusCode).toBe(200);
    const releaseBody = first.json();
    expect(releaseBody).toMatchObject({
      decision: "AUTHORIZED",
      mode: "SIMULATED",
      physicalAccessPerformed: false,
      requestVersion: 2,
    });

    const replay = await release(
      context.app,
      flow.gate,
      flow.visitId,
      checkId,
      "release-key-0001",
    );
    expect(replay.statusCode).toBe(200);
    expect(replay.json().releaseId).toBe(releaseBody.releaseId);
    expect(replay.json().idempotentReplay).toBe(true);

    const newKey = await release(
      context.app,
      flow.gate,
      flow.visitId,
      checkId,
      "release-key-0002",
    );
    expect(newKey.statusCode).toBe(409);
    expect(newKey.json().error.code).toBe("STATE_CONFLICT");
  });

  it("nega sem correspondência e permite nova conferência", async () => {
    const flow = await approvedVisit();
    const noMatch = await checkIdentity(
      context.app,
      flow.gate,
      flow.visitId,
      "SIMULATED_NO_MATCH",
    );
    const denied = await release(
      context.app,
      flow.gate,
      flow.visitId,
      noMatch,
      "release-key-0010",
    );
    expect(denied.statusCode).toBe(200);
    expect(denied.json()).toMatchObject({
      decision: "DENIED",
      reasonCode: "IDENTITY_SIMULATED_NO_MATCH",
      physicalAccessPerformed: false,
    });

    const match = await checkIdentity(
      context.app,
      flow.gate,
      flow.visitId,
      "SIMULATED_MATCH",
    );
    const authorized = await release(
      context.app,
      flow.gate,
      flow.visitId,
      match,
      "release-key-0011",
    );
    expect(authorized.statusCode).toBe(200);
    expect(authorized.json().decision).toBe("AUTHORIZED");
  });

  it("revalida o estado da visita no momento da liberação", async () => {
    const flow = await approvedVisit();
    const checkId = await checkIdentity(
      context.app,
      flow.gate,
      flow.visitId,
      "SIMULATED_MATCH",
    );
    context.db
      .prepare("UPDATE visit_requests SET status = 'REJECTED' WHERE id = ?")
      .run(flow.visitId);

    const denied = await release(
      context.app,
      flow.gate,
      flow.visitId,
      checkId,
      "release-key-0020",
    );
    expect(denied.statusCode).toBe(200);
    expect(denied.json()).toMatchObject({
      decision: "DENIED",
      reasonCode: "VISIT_NOT_ELIGIBLE",
      physicalAccessPerformed: false,
    });
  });

  it("bloqueia conferência de visita não aprovada", async () => {
    const visitor = await login(context.app, "visitante@demo.local");
    const gate = await login(context.app, "portaria@demo.local");
    const created = await createVisit(context.app, visitor, "gate-key-02");
    const attempt = await context.app.inject({
      method: "POST",
      url: `/api/v1/gate/visits/${created.id}/identity-checks`,
      headers: bearer(gate),
      payload: { mode: "SIMULATED", simulatedOutcome: "SIMULATED_MATCH" },
    });
    expect(attempt.statusCode).toBe(409);
    expect(attempt.json().error.code).toBe("VISIT_NOT_ELIGIBLE");
  });
});

describe("auditoria e privacidade", () => {
  it("registra o fluxo e não expõe CPF completo", async () => {
    const visitor = await login(context.app, "visitante@demo.local");
    const analyst = await login(context.app, "analista@demo.local");
    const gate = await login(context.app, "portaria@demo.local");
    const auditor = await login(context.app, "auditor@demo.local");
    const created = await createVisit(context.app, visitor, "audit-key-01");
    await decide(context.app, analyst, created.id, 1);
    const checkId = await checkIdentity(
      context.app,
      gate,
      created.id,
      "SIMULATED_MATCH",
    );
    const released = await release(
      context.app,
      gate,
      created.id,
      checkId,
      "audit-release-key-01",
    );
    expect(released.statusCode).toBe(200);

    const events = await context.app.inject({
      method: "GET",
      url: "/api/v1/internal/audit-events?limit=100",
      headers: bearer(auditor),
    });
    expect(events.statusCode).toBe(200);
    const serialized = JSON.stringify(events.json());
    expect(serialized).not.toContain("111.444.777-35");
    expect(serialized).toContain("VISIT_REQUEST_CREATED");
    expect(serialized).toContain("VISIT_DECISION_RECORDED");
    expect(serialized).toContain("IDENTITY_CHECK_RECORDED");
    expect(serialized).toContain("VIRTUAL_RELEASE_AUTHORIZED");
    expect(serialized).not.toContain("authorization");

    const auditEvent = events
      .json()
      .events.find(
        (event: { eventType: string }) => event.eventType === "AUDIT_QUERY",
      );
    expect(auditEvent).toBeUndefined();
  });

  it("mascara CPF nas visões do portal interno e da portaria", async () => {
    const visitor = await login(context.app, "visitante@demo.local");
    const analyst = await login(context.app, "analista@demo.local");
    const gate = await login(context.app, "portaria@demo.local");
    const created = await createVisit(context.app, visitor, "privacy-key-01");
    await decide(context.app, analyst, created.id, 1);

    const internal = await context.app.inject({
      method: "GET",
      url: "/api/v1/internal/visit-requests",
      headers: bearer(analyst),
    });
    const gateDetail = await context.app.inject({
      method: "GET",
      url: `/api/v1/gate/visits/${created.id}`,
      headers: bearer(gate),
    });
    const combined = JSON.stringify([internal.json(), gateDetail.json()]);
    expect(combined).toContain("***.***.***-35");
    expect(combined).not.toContain("111.444.777-35");
    expect(combined).not.toContain("cpfNormalized");
  });
});
