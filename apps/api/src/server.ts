import { buildApp } from "./app";
import { loadConfig } from "./config";

const config = loadConfig();

if (!process.env.CPF_HASH_SECRET) {
  console.warn(
    "CPF_HASH_SECRET não definido; usando segredo efêmero. Hashes de CPF não serão estáveis entre reinícios.",
  );
}

const app = await buildApp({ config });

const shutdown = async (signal: string): Promise<void> => {
  app.log.info({ signal }, "Encerrando aplicação");
  await app.close();
  process.exit(0);
};

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});
process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

try {
  await app.listen({ port: config.port, host: config.host });
  app.log.info(
    {
      mode: "SIMULATED",
      appEnv: config.appEnv,
      physicalAccessPerformed: false,
      url: `http://${config.host}:${config.port}`,
    },
    "Controle de visitas demo iniciado",
  );
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
