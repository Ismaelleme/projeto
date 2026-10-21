import type { Db } from "../db";
import { ApiError } from "./errors";
import type { IdempotencyRow } from "./rows";

export function findIdempotentReplay<T>(
  db: Db,
  scope: string,
  key: string,
  requestHash: string,
): T | null {
  const row = db
    .prepare("SELECT * FROM idempotency_records WHERE scope = ? AND key = ?")
    .get(scope, key) as IdempotencyRow | undefined;
  if (!row) {
    return null;
  }
  if (row.request_hash !== requestHash) {
    throw new ApiError(
      409,
      "IDEMPOTENCY_CONFLICT",
      "Esta chave já foi usada com um conteúdo diferente.",
    );
  }
  return JSON.parse(row.response_json) as T;
}

export function saveIdempotency(
  db: Db,
  scope: string,
  key: string,
  requestHash: string,
  response: unknown,
): void {
  db.prepare(
    `INSERT INTO idempotency_records
      (scope, key, request_hash, status, response_json, created_at)
     VALUES (?, ?, ?, 'COMPLETED', ?, ?)`,
  ).run(scope, key, requestHash, JSON.stringify(response), new Date().toISOString());
}
