import type { FastifyInstance } from "fastify";
import type { AppContext } from "../context";
import { PRIVACY_NOTICE_VERSION } from "@lins/shared";

export function registerPublicRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get("/api/v1/public/config", async () => ({
    appEnv: ctx.config.appEnv,
    mode: "SIMULATED",
    demoMode: ctx.config.demoMode,
    identityMode: "SIMULATED",
    privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
    physicalAccessPerformed: false,
  }));

  app.get("/api/v1/public/privacy-notice", async () => ({
    version: PRIVACY_NOTICE_VERSION,
    title: "Aviso de privacidade — demonstração",
    text:
      "Este ambiente é demonstrativo e usa somente dados fictícios. " +
      "Não informe dados pessoais reais. O CPF é validado, mas não é armazenado " +
      "em texto claro. Nenhuma imagem é coletada. Nenhum acesso físico é executado.",
    approvedForProduction: false,
    syntheticDataOnly: true,
  }));
}
