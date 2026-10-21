import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../context";
import { login, logoutSession } from "../lib/auth";
import { ApiError } from "../lib/errors";
import { requireUser, validate } from "../lib/http";
import { rateLimitKey } from "../lib/rate-limit";

const loginSchema = z.object({
  email: z.string().trim().email("Informe um e-mail válido.").max(254),
  password: z.string().min(1, "Informe a senha.").max(200),
});

export function registerAuthRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.post("/api/v1/auth/login", async (request, reply) => {
    const limit = ctx.limiter.consume(
      rateLimitKey(request, "login"),
      ctx.config.loginRateLimit,
    );
    if (!limit.allowed) {
      reply.header("Retry-After", String(limit.retryAfterSeconds));
      throw new ApiError(429, "RATE_LIMITED", "Muitas tentativas. Aguarde para tentar novamente.");
    }

    const body = validate(loginSchema, request.body);
    const result = login(ctx.db, body.email, body.password, ctx.config.sessionTtlMinutes);
    if (!result) {
      throw new ApiError(401, "UNAUTHENTICATED", "E-mail ou senha inválidos.");
    }
    return reply.code(200).send(result);
  });

  app.get("/api/v1/auth/me", async (request, reply) => {
    const user = requireUser(ctx.db, request, reply);
    if (!user) {
      return reply;
    }
    return { user };
  });

  app.post("/api/v1/auth/logout", async (request, reply) => {
    logoutSession(ctx.db, request.headers.authorization);
    return reply.code(204).send();
  });

  app.get("/api/v1/auth/session", async (request, reply) => {
    const user = requireUser(ctx.db, request, reply);
    if (!user) {
      return reply;
    }
    return reply.code(200).send({
      user,
      mode: "SIMULATED",
      physicalAccessPerformed: false,
    });
  });
}
