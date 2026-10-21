import type { AuthUser } from "@lins/shared";
import type { Db } from "../db";
import { newId, newSessionToken, sha256, verifyPassword } from "./crypto";
import type { UserRow } from "./rows";

export interface LoginResult {
  token: string;
  user: AuthUser;
  expiresAt: string;
}

function toAuthUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
  };
}

export function login(
  db: Db,
  email: string,
  password: string,
  ttlMinutes: number,
): LoginResult | null {
  const row = db
    .prepare("SELECT * FROM users WHERE email = ? AND active = 1")
    .get(email.trim()) as UserRow | undefined;
  if (!row || !verifyPassword(password, row.password_hash)) {
    return null;
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMinutes * 60_000).toISOString();
  const token = newSessionToken();
  db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now.toISOString());
  db.prepare(
    "INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(newId("ses"), row.id, sha256(token), expiresAt, now.toISOString());

  return { token, user: toAuthUser(row), expiresAt };
}

export function resolveSession(db: Db, authorization: string | undefined): AuthUser | null {
  if (!authorization || !authorization.startsWith("Bearer ")) {
    return null;
  }
  const token = authorization.slice("Bearer ".length).trim();
  if (!token) {
    return null;
  }
  const row = db
    .prepare(
      `SELECT u.id, u.email, u.name, u.role
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1`,
    )
    .get(sha256(token), new Date().toISOString()) as UserRow | undefined;
  return row ? toAuthUser(row) : null;
}

export function logoutSession(db: Db, authorization: string | undefined): void {
  if (!authorization || !authorization.startsWith("Bearer ")) {
    return;
  }
  const token = authorization.slice("Bearer ".length).trim();
  if (!token) {
    return;
  }
  db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(token));
}
