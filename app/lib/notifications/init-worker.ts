/**
 * Compatibilidade para ambientes que ainda chamam a inicialização explícita
 * do worker legado. O processamento assíncrono agora é gerenciado pela
 * Vercel (Workflow/Queue), então não há processo local para iniciar.
 */

let workerInitialized = false;

/**
 * Inicializa a camada de compatibilidade (somente no servidor).
 */
export async function initNotificationWorker(): Promise<void> {
  if (typeof window !== "undefined") {
    return;
  }

  if (workerInitialized) {
    return;
  }

  workerInitialized = true;
  console.log(
    "[Workers] Processamento assíncrono delegado para Vercel Workflow/Queues.",
  );
}
