import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { AppConfig } from "./config";
import {
  cpfLast2,
  hashCpf,
  hashPassword,
  newId,
  newRequestCode,
  syntheticCpfOrFallback,
} from "./lib/crypto";

export type Db = DatabaseSync;

const schema = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('VISITOR', 'ANALYST', 'GATE', 'AUDITOR')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);

CREATE TABLE IF NOT EXISTS visitor_profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  company TEXT,
  contact TEXT,
  cpf_hash TEXT NOT NULL,
  cpf_last2 TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, cpf_hash)
);

CREATE TABLE IF NOT EXISTS visit_requests (
  id TEXT PRIMARY KEY,
  request_code TEXT NOT NULL UNIQUE,
  visitor_id TEXT NOT NULL REFERENCES visitor_profiles(id),
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  visitor_name TEXT NOT NULL,
  company TEXT,
  contact TEXT,
  purpose TEXT NOT NULL,
  host_name TEXT,
  status TEXT NOT NULL CHECK (status IN (
    'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED', 'COMPLETED'
  )),
  version INTEGER NOT NULL,
  privacy_notice_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  submitted_at TEXT NOT NULL,
  decided_at TEXT,
  decided_by TEXT,
  decision_reason TEXT,
  approved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_visit_requests_status ON visit_requests(status);
CREATE INDEX IF NOT EXISTS idx_visit_requests_created_by ON visit_requests(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_visit_requests_code ON visit_requests(request_code);

CREATE TABLE IF NOT EXISTS visit_decisions (
  id TEXT PRIMARY KEY,
  visit_request_id TEXT NOT NULL REFERENCES visit_requests(id),
  decision TEXT NOT NULL CHECK (decision IN ('APPROVE', 'REJECT')),
  actor_id TEXT NOT NULL REFERENCES users(id),
  actor_name TEXT NOT NULL,
  reason TEXT,
  request_version INTEGER NOT NULL,
  occurred_at TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  UNIQUE (visit_request_id, request_version)
);

CREATE TABLE IF NOT EXISTS identity_checks (
  id TEXT PRIMARY KEY,
  visit_request_id TEXT NOT NULL REFERENCES visit_requests(id),
  operator_id TEXT NOT NULL REFERENCES users(id),
  operator_name TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode = 'SIMULATED'),
  outcome TEXT NOT NULL CHECK (outcome IN (
    'SIMULATED_MATCH', 'SIMULATED_NO_MATCH', 'INCONCLUSIVE', 'ERROR', 'UNAVAILABLE'
  )),
  provider_reference TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  correlation_id TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_identity_checks_visit ON identity_checks(visit_request_id);

CREATE TABLE IF NOT EXISTS virtual_releases (
  id TEXT PRIMARY KEY,
  visit_request_id TEXT NOT NULL REFERENCES visit_requests(id),
  identity_check_id TEXT NOT NULL REFERENCES identity_checks(id),
  operator_id TEXT NOT NULL REFERENCES users(id),
  operator_name TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('AUTHORIZED', 'DENIED', 'UNKNOWN')),
  reason_code TEXT,
  mode TEXT NOT NULL CHECK (mode = 'SIMULATED'),
  physical_access_performed INTEGER NOT NULL CHECK (physical_access_performed = 0),
  occurred_at TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  request_version INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_virtual_releases_visit ON virtual_releases(visit_request_id);

CREATE TABLE IF NOT EXISTS idempotency_records (
  scope TEXT NOT NULL,
  key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('IN_PROGRESS', 'COMPLETED', 'FAILED')),
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (scope, key)
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  actor_id TEXT,
  actor_name TEXT,
  actor_role TEXT,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('SUCCESS', 'DENIED', 'FAILED', 'UNKNOWN')),
  mode TEXT,
  correlation_id TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_audit_target ON audit_events(target_type, target_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_audit_correlation ON audit_events(correlation_id);
`;

export function openDatabase(config: AppConfig): Db {
  if (config.databasePath !== ":memory:") {
    fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });
  }
  const db = new DatabaseSync(config.databasePath);
  db.exec("PRAGMA foreign_keys = ON;");
  if (config.databasePath !== ":memory:") {
    db.exec("PRAGMA journal_mode = WAL;");
  }
  db.exec(schema);
  seedDatabase(db, config);
  return db;
}

function seedDatabase(db: Db, config: AppConfig): void {
  const existing = db.prepare("SELECT COUNT(*) AS count FROM users").get() as
    | { count: number }
    | undefined;
  if (existing && existing.count > 0) {
    return;
  }

  const now = new Date();
  const iso = (offsetMinutes = 0): string =>
    new Date(now.getTime() + offsetMinutes * 60_000).toISOString();

  const demoPassword = "Demo@1234";
  const users = [
    {
      id: newId("usr"),
      email: "visitante@demo.local",
      name: "Visitante Demonstração",
      role: "VISITOR",
    },
    {
      id: newId("usr"),
      email: "analista@demo.local",
      name: "Ana Analista",
      role: "ANALYST",
    },
    {
      id: newId("usr"),
      email: "portaria@demo.local",
      name: "Paulo Portaria",
      role: "GATE",
    },
    {
      id: newId("usr"),
      email: "auditor@demo.local",
      name: "Aline Auditoria",
      role: "AUDITOR",
    },
  ];

  const insertUser = db.prepare(
    "INSERT INTO users (id, email, password_hash, name, role, active, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)",
  );
  for (const user of users) {
    insertUser.run(
      user.id,
      user.email,
      hashPassword(demoPassword),
      user.name,
      user.role,
      iso(-60 * 24 * 7),
    );
  }

  if (!config.seedDemoData) {
    return;
  }

  const visitorUser = users[0];
  const analystUser = users[1];
  const insertProfile = db.prepare(
    `INSERT INTO visitor_profiles
      (id, user_id, name, company, contact, cpf_hash, cpf_last2, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertVisit = db.prepare(
    `INSERT INTO visit_requests
      (id, request_code, visitor_id, created_by_user_id, visitor_name, company, contact,
       purpose, host_name, status, version, privacy_notice_version, created_at,
       submitted_at, decided_at, decided_by, decision_reason, approved_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertDecision = db.prepare(
    `INSERT INTO visit_decisions
      (id, visit_request_id, decision, actor_id, actor_name, reason, request_version,
       occurred_at, correlation_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertAudit = db.prepare(
    `INSERT INTO audit_events
      (id, event_type, actor_id, actor_name, actor_role, target_type, target_id,
       occurred_at, result, mode, correlation_id, metadata_json)
     VALUES (?, ?, ?, ?, ?, 'VisitRequest', ?, ?, 'SUCCESS', ?, ?, ?)`,
  );

  const seeds = [
    {
      name: "Marina Alves Teste",
      company: "Fornecedora Alfa Ltda",
      contact: "(14) 99999-0101",
      purpose: "Manutenção preventiva",
      host: "Eng. Paulo Lima",
      status: "PENDING_REVIEW",
      version: 1,
      createdOffset: -95,
    },
    {
      name: "Caio Ferreira Exemplo",
      company: "Serviços Beta",
      contact: "(14) 99999-0202",
      purpose: "Reunião comercial",
      host: "Ana Costa",
      status: "PENDING_REVIEW",
      version: 1,
      createdOffset: -55,
    },
    {
      name: "Lívia Souza Demonstração",
      company: "Transportes Gama",
      contact: "(14) 99999-0303",
      purpose: "Entrega de equipamento",
      host: "Rafael Nunes",
      status: "APPROVED",
      version: 2,
      createdOffset: -180,
    },
  ];

  for (const seed of seeds) {
    const profileId = newId("vpr");
    const visitId = newId("vis");
    const cpf = syntheticCpfOrFallback();
    const createdAt = iso(seed.createdOffset);
    const profileCreatedAt = iso(seed.createdOffset - 5);
    insertProfile.run(
      profileId,
      visitorUser.id,
      seed.name,
      seed.company,
      seed.contact,
      hashCpf(cpf, config.cpfHashSecret),
      cpfLast2(cpf),
      profileCreatedAt,
      profileCreatedAt,
    );

    const approved = seed.status === "APPROVED";
    const decidedAt = approved ? iso(seed.createdOffset + 30) : null;
    insertVisit.run(
      visitId,
      newRequestCode(),
      profileId,
      visitorUser.id,
      seed.name,
      seed.company,
      seed.contact,
      seed.purpose,
      seed.host,
      seed.status,
      seed.version,
      "demo-2026-10-21",
      createdAt,
      createdAt,
      decidedAt,
      approved ? analystUser.name : null,
      approved ? "Solicitação sintética pré-aprovada para demonstração." : null,
      decidedAt,
    );

    const createCorrelation = newId("corr");
    insertAudit.run(
      newId("aud"),
      "VISIT_REQUEST_CREATED",
      visitorUser.id,
      visitorUser.name,
      visitorUser.role,
      visitId,
      createdAt,
      "SIMULATED",
      createCorrelation,
      JSON.stringify({ demoSeed: true }),
    );
    insertAudit.run(
      newId("aud"),
      "VISIT_REQUEST_SUBMITTED",
      visitorUser.id,
      visitorUser.name,
      visitorUser.role,
      visitId,
      createdAt,
      "SIMULATED",
      createCorrelation,
      JSON.stringify({ demoSeed: true }),
    );

    if (approved && decidedAt) {
      insertDecision.run(
        newId("dec"),
        visitId,
        "APPROVE",
        analystUser.id,
        analystUser.name,
        "Solicitação sintética pré-aprovada para demonstração.",
        1,
        decidedAt,
        newId("corr"),
      );
      insertAudit.run(
        newId("aud"),
        "VISIT_DECISION_RECORDED",
        analystUser.id,
        analystUser.name,
        analystUser.role,
        visitId,
        decidedAt,
        "SIMULATED",
        newId("corr"),
        JSON.stringify({ decision: "APPROVE", requestVersion: seed.version, demoSeed: true }),
      );
    }
  }
}
