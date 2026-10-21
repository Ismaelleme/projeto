import { randomBytes } from "node:crypto";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import path from "node:path";

export type AppEnv = "demo" | "test" | "production";

export interface AppConfig {
  appEnv: AppEnv;
  demoMode: boolean;
  port: number;
  host: string;
  databasePath: string;
  cpfHashSecret: string;
  sessionTtlMinutes: number;
  seedDemoData: boolean;
  serveWeb: boolean;
  webRoot: string;
  loginRateLimit: number;
}

const projectRoot = path.resolve(fileURLToPath(new URL("../../../", import.meta.url)));

try {
  loadEnvFile(path.join(projectRoot, ".env"));
} catch {}

export function loadConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const rawEnv = process.env.APP_ENV ?? "demo";
  if (!["demo", "test", "production"].includes(rawEnv)) {
    throw new Error(`APP_ENV inválido: ${rawEnv}`);
  }
  const appEnv = rawEnv as AppEnv;

  const config: AppConfig = {
    appEnv,
    demoMode: process.env.DEMO_MODE !== "false",
    port: Number(process.env.PORT ?? 3000),
    host: process.env.HOST ?? "127.0.0.1",
    databasePath:
      process.env.DATABASE_PATH ??
      path.join(projectRoot, "data", "controle-visitas.db"),
    cpfHashSecret: process.env.CPF_HASH_SECRET ?? randomBytes(32).toString("hex"),
    sessionTtlMinutes: Number(process.env.SESSION_TTL_MINUTES ?? 8 * 60),
    seedDemoData: process.env.SEED_DEMO_DATA !== "false",
    serveWeb: process.env.SERVE_WEB !== "false",
    webRoot: path.join(projectRoot, "apps", "web", "dist"),
    loginRateLimit: Number(process.env.LOGIN_RATE_LIMIT ?? 20),
  };

  const merged = { ...config, ...overrides };
  if (merged.appEnv === "production") {
    throw new Error(
      "Este MVP é exclusivamente simulado e não pode iniciar com APP_ENV=production.",
    );
  }
  if (!Number.isInteger(merged.port) || merged.port <= 0 || merged.port > 65535) {
    throw new Error("PORT inválido.");
  }
  if (!Number.isFinite(merged.sessionTtlMinutes) || merged.sessionTtlMinutes <= 0) {
    throw new Error("SESSION_TTL_MINUTES inválido.");
  }
  return merged;
}
