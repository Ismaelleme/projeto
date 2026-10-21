import fs from "node:fs";
import path from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import type { AppConfig } from "./config";
import { loadConfig } from "./config";
import type { Db } from "./db";
import { openDatabase } from "./db";
import type { AppContext } from "./context";
import { ApiError, errorBody, sendApiError } from "./lib/errors";
import { newCorrelationId } from "./lib/crypto";
import { RateLimiter } from "./lib/rate-limit";
import { registerAuthRoutes } from "./routes/auth";
import { registerPublicRoutes } from "./routes/public";
import { registerVisitorRoutes } from "./routes/visitor";
import { registerInternalRoutes } from "./routes/internal";
import { registerGateRoutes } from "./routes/gate";
import "./types";

export interface BuildAppOptions {
  config?: Partial<AppConfig>;
  db?: Db;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const config = loadConfig(options.config);
  const db = options.db ?? openDatabase(config);
  const ctx: AppContext = {
    db,
    config,
    limiter: new RateLimiter(5 * 60 * 1000),
  };

  const app = Fastify({
    logger:
      config.appEnv === "test"
        ? false
        : {
            level: process.env.LOG_LEVEL ?? "info",
            redact: [
              "req.headers.authorization",
              "req.headers.idempotency-key",
              "res.headers.set-cookie",
            ],
          },
    bodyLimit: 256 * 1024,
    trustProxy: false,
  });

  app.decorateRequest("correlationId", "");
  app.addHook("onRequest", async (request, reply) => {
    const raw = request.headers["x-correlation-id"];
    const candidate = Array.isArray(raw) ? raw[0] : raw;
    request.correlationId =
      candidate && /^[A-Za-z0-9._:-]{1,80}$/.test(candidate)
        ? candidate
        : newCorrelationId();
    reply.header("X-Correlation-Id", request.correlationId);
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    if (request.url.startsWith("/api/")) {
      reply.header("Cache-Control", "no-store");
    }
  });

  await app.register(cors, {
    origin:
      config.appEnv === "test"
        ? false
        : ["http://localhost:5173", "http://127.0.0.1:5173"],
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Idempotency-Key",
      "X-Correlation-Id",
    ],
    exposedHeaders: ["X-Correlation-Id", "Retry-After"],
    maxAge: 600,
  });

  app.get("/health", async () => ({
    status: "ok",
    mode: "SIMULATED",
    appEnv: config.appEnv,
    demoMode: config.demoMode,
    physicalAccessPerformed: false,
  }));

  app.get("/ready", async (request, reply) => {
    try {
      db.prepare("SELECT 1 AS ok").get();
      return {
        status: "ready",
        database: "ok",
        mode: "SIMULATED",
        physicalAccessPerformed: false,
      };
    } catch {
      return reply.code(503).send({
        status: "unavailable",
        correlationId: request.correlationId,
      });
    }
  });

  registerPublicRoutes(app, ctx);
  registerAuthRoutes(app, ctx);
  registerVisitorRoutes(app, ctx);
  registerInternalRoutes(app, ctx);
  registerGateRoutes(app, ctx);

  const indexFile = path.join(config.webRoot, "index.html");
  const serveWeb = config.serveWeb && fs.existsSync(indexFile);
  if (serveWeb) {
    await app.register(fastifyStatic, {
      root: config.webRoot,
      prefix: "/",
      index: ["index.html"],
      maxAge: "1h",
      setHeaders: (response, filePath) => {
        if (filePath.endsWith("index.html")) {
          response.header("Cache-Control", "no-store");
        }
      },
    });
  }

  app.setNotFoundHandler((request, reply) => {
    if (
      serveWeb &&
      request.method === "GET" &&
      !request.url.startsWith("/api/") &&
      request.url !== "/health" &&
      request.url !== "/ready"
    ) {
      return reply.type("text/html").sendFile("index.html");
    }
    return reply
      .code(404)
      .send(errorBody("NOT_FOUND", "Recurso não encontrado.", request.correlationId));
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) {
      return sendApiError(reply, error, request.correlationId);
    }
    const fastifyError = error as {
      name?: string;
      code?: string;
      statusCode?: number;
    };
    const statusCode = fastifyError.statusCode;
    if (statusCode && statusCode >= 400 && statusCode < 500) {
      return reply
        .code(statusCode)
        .send(
          errorBody(
            "VALIDATION_ERROR",
            "Requisição inválida.",
            request.correlationId,
          ),
        );
    }
    request.log.error(
      {
        errorName: fastifyError.name,
        errorCode: fastifyError.code,
        correlationId: request.correlationId,
      },
      "Erro interno não tratado",
    );
    return reply
      .code(500)
      .send(
        errorBody(
          "INTERNAL_ERROR",
          "Não foi possível concluir a operação.",
          request.correlationId,
        ),
      );
  });

  app.addHook("onClose", async () => {
    if (!options.db) {
      db.close();
    }
  });

  return app;
}
