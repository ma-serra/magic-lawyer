/**
 * Inicialização explícita de workers assíncronos.
 * Não deve iniciar automaticamente no import para evitar side effects
 * durante build e renderização no servidor.
 */

import { shouldBootstrapAppRuntimeWorkers } from "@/app/lib/inpi/catalog-sync-config";

let workerInitialized = false;

/**
 * Inicializa workers assíncronos (somente no servidor).
 */
export async function initNotificationWorker(): Promise<void> {
  // Verificar se estamos no servidor
  if (typeof window !== "undefined") {
    return; // Não executar no cliente
  }

  if (!shouldBootstrapAppRuntimeWorkers()) {
    return;
  }

  // Verificar se worker já foi iniciado
  if (workerInitialized) {
    return;
  }

  try {
    const { getNotificationWorker } = await import("./notification-worker");
    const { getPortalProcessSyncWorker } = await import(
      "@/app/lib/juridical/process-sync-worker"
    );
    const { getInpiCatalogSyncWorker } = await import(
      "@/app/lib/inpi/catalog-sync-worker"
    );

    // Criar workers (singleton)
    // Ambos iniciam automaticamente quando criados.
    getNotificationWorker();
    getPortalProcessSyncWorker();
    getInpiCatalogSyncWorker();

    // Marcar como inicializado
    workerInitialized = true;

    console.log("[Workers] ✅ Workers inicializados e prontos");
  } catch (error) {
    console.error("[Workers] ❌ Erro ao inicializar workers:", error);
    // Não falhar a aplicação se o worker não iniciar
    throw error;
  }
}
