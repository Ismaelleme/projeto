import type { FastifyReply, FastifyRequest } from "fastify";
import type { Role, AuthUser } from "@lins/shared";
import type { z } from "zod";
import type { Db } from "../db";
import { recordAudit } from "./audit";
import { resolveSession } from "./auth";
import { ApiError, errorBody } from "./errors";

function targetOf(request: FastifyRequest): string {
  return request.routeOptions.url || request.url.split("?")[0] || "unknown";
}

export function requireUser(
  db: Db,
  request: FastifyRequest,
  reply: FastifyReply,
  roles?: Role[],
): AuthUser | null {
  const user = resolveSession(db, request.headers.authorization);
  if (!user) {
    reply
      .code(401)
      .send(errorBody("UNAUTHENTICATED", "Autenticação necessária.", request.correlationId));
    return null;
  }

  if (roles && !roles.includes(user.role)) {
    recordAudit(db, {
      eventType: "SECURITY_ACCESS_DENIED",
      actorId: user.id,
      actorName: user.name,
      actorRole: user.role,
      targetType: "ENDPOINT",
      targetId: targetOf(request),
      result: "DENIED",
      correlationId: request.correlationId,
      metadata: { requiredRoles: roles },
    });
    reply
      .code(403)
      .send(errorBody("FORBIDDEN", "Você não tem permissão para esta operação.", request.correlationId));
    return null;
  }

  return user;
}

export function validate<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (parsed.success) {
    return parsed.data;
  }
  const fields = parsed.error.issues.map((issue) => ({
    name: issue.path.length > 0 ? issue.path.join(".") : "body",
    message: issue.message,
  }));
  throw new ApiError(422, "VALIDATION_ERROR", "Verifique os campos informados.", fields);
}

export function readIdempotencyKey(request: FastifyRequest): string {
  const raw = request.headers["idempotency-key"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) {
    throw new ApiError(
      400,
      "IDEMPOTENCY_KEY_REQUIRED",
      "O cabeçalho Idempotency-Key é obrigatório.",
    );
  }
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(value)) {
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      "Idempotency-Key inválida.",
      [{ name: "Idempotency-Key", message: "Use de 8 a 128 caracteres seguros." }],
    );
  }
  return value;
}

export function requestTarget(request: FastifyRequest): string {
  return targetOf(request);
}
