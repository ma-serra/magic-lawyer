#!/usr/bin/env node

/**
 * Script para iniciar workers assíncronos.
 * Uso: npm run dev:worker
 */

require("dotenv").config();

require("ts-node").register({
  transpileOnly: true,
  skipProject: true,
  compilerOptions: {
    module: "CommonJS",
    moduleResolution: "Node",
    esModuleInterop: true,
    allowJs: false,
    baseUrl: ".",
  },
});
require("tsconfig-paths/register");

const path = require("path");

async function main() {
  console.log("🚀 Iniciando Workers Assíncronos...");

  try {
    const { testRedisConnection } = require(path.join(__dirname, "../app/lib/notifications/redis-config"));
    const { startNotificationWorker, stopNotificationWorker } = require(path.join(__dirname, "../app/lib/notifications/notification-worker"));
    const { startPortalProcessSyncWorker, stopPortalProcessSyncWorker } = require(path.join(__dirname, "../app/lib/juridical/process-sync-worker"));
    const { startInpiCatalogSyncWorker, stopInpiCatalogSyncWorker } = require(path.join(__dirname, "../app/lib/inpi/catalog-sync-worker"));

    console.log("📡 Testando conexão Redis...");
    const redisConnected = await testRedisConnection();

    if (!redisConnected) {
      console.error("❌ Falha na conexão Redis. Verifique a variável REDIS_URL");
      process.exit(1);
    }

    console.log("✅ Conexão Redis OK");

    console.log("👷 Iniciando workers...");
    await startNotificationWorker();
    await startPortalProcessSyncWorker();
    await startInpiCatalogSyncWorker();

    console.log("✅ Workers iniciados com sucesso!");
    console.log("📊 Monitoramento disponível em: /api/admin/notifications/worker");

    process.on("SIGINT", async () => {
      console.log("\n🛑 Parando worker...");
      await stopInpiCatalogSyncWorker();
      await stopPortalProcessSyncWorker();
      await stopNotificationWorker();
      console.log("✅ Workers parados");
      process.exit(0);
    });

    setInterval(() => {
      // Heartbeat
    }, 30_000);
  } catch (error) {
    console.error("❌ Erro ao iniciar worker:", error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("❌ Erro inesperado no worker:", error);
  process.exit(1);
});
