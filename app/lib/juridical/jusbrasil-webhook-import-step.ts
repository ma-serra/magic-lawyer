import {
  getPortalProcessSyncState,
  savePortalProcessSyncState,
  withPortalProcessSyncStatus,
} from "@/app/lib/juridical/process-sync-status-store";
import { persistCapturedMovimentacoes } from "@/app/lib/juridical/process-movement-sync";
import { upsertProcessoFromCapture } from "@/app/lib/juridical/processo-persistence";
import {
  buildJusbrasilExpectedWebhookUrl,
  createOabSyncAuditEntry,
} from "@/app/lib/juridical/jusbrasil-oab-sync";
import { normalizarProcesso } from "@/lib/api/juridical/normalization";
import {
  mapJusbrasilWebhookBatchToProcessos,
  type JusbrasilWebhookBatch,
} from "@/lib/api/juridical/jusbrasil-webhook-normalizer";

export interface JusbrasilWebhookImportJobInput {
  correlationId: string;
  tenantId: string;
  usuarioId?: string | null;
  advogadoId?: string;
  clienteNome?: string;
  syncId?: string;
  tribunalSigla: string;
  oab: string;
  processosPayload: Array<Record<string, unknown>>;
}

export async function processJusbrasilWebhookImportStep(
  input: JusbrasilWebhookImportJobInput,
) {
  "use step";

  const webhookUrl = buildJusbrasilExpectedWebhookUrl();

  try {
    const batch: JusbrasilWebhookBatch = {
      correlationId: input.correlationId,
      processos: input.processosPayload,
    };
    const processos = mapJusbrasilWebhookBatchToProcessos(batch);

    if (processos.length === 0) {
      throw new Error(
        "Webhook Jusbrasil recebido sem processos mapeaveis para importacao.",
      );
    }

    let createdCount = 0;
    let updatedCount = 0;
    const processNumbers: string[] = [];

    for (const processoRaw of processos) {
      const processo = normalizarProcesso(processoRaw);
      const persisted = await upsertProcessoFromCapture({
        tenantId: input.tenantId,
        processo,
        clienteNome: input.clienteNome,
        advogadoId: input.advogadoId,
        updateIfExists: true,
      });

      await persistCapturedMovimentacoes({
        tenantId: input.tenantId,
        processoId: persisted.processoId,
        criadoPorId: input.usuarioId ?? null,
        movimentacoes: processo.movimentacoes,
        notifyLawyers: persisted.updated,
        actorName: "Webhook Jusbrasil",
        sourceLabel: "Monitoramento OAB via Jusbrasil",
        sourceKind: "EXTERNAL",
      });

      if (persisted.created) {
        createdCount += 1;
      } else if (persisted.updated) {
        updatedCount += 1;
      }

      if (processo.numeroProcesso) {
        processNumbers.push(processo.numeroProcesso);
      }
    }

    await createOabSyncAuditEntry({
      tenantId: input.tenantId,
      usuarioId: input.usuarioId ?? null,
      tribunalSigla: input.tribunalSigla,
      oab: input.oab,
      status: "SUCESSO",
      origem: "JUSBRASIL_WEBHOOK",
      provider: "JUSBRASIL",
      mode: "ASYNC_WEBHOOK",
      entidadeId: input.correlationId,
      correlationId: input.correlationId,
      syncId: input.syncId,
      advogadoId: input.advogadoId,
      clienteNome: input.clienteNome,
      syncedCount: processos.length,
      createdCount,
      updatedCount,
      processosNumeros: processNumbers.slice(0, 50),
      webhookUrl,
    });

    if (input.syncId) {
      const state = await getPortalProcessSyncState(input.syncId);

      if (state && state.tenantId === input.tenantId) {
        const completedState = withPortalProcessSyncStatus(state, "COMPLETED", {
          provider: "JUSBRASIL",
          correlationId: input.correlationId,
          webhookUrl: state.webhookUrl || webhookUrl,
          message: "Webhook Jusbrasil processado com sucesso.",
          syncedCount: processos.length,
          createdCount,
          updatedCount,
          processosNumeros: processNumbers.slice(0, 50),
          error: undefined,
        });

        await savePortalProcessSyncState(completedState);
      }
    }

    return {
      correlationId: input.correlationId,
      syncedCount: processos.length,
      createdCount,
      updatedCount,
      processNumbers: processNumbers.slice(0, 50),
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Erro inesperado ao processar webhook Jusbrasil.";

    await createOabSyncAuditEntry({
      tenantId: input.tenantId,
      usuarioId: input.usuarioId ?? null,
      tribunalSigla: input.tribunalSigla,
      oab: input.oab,
      status: "ERRO",
      origem: "JUSBRASIL_WEBHOOK",
      provider: "JUSBRASIL",
      mode: "ASYNC_WEBHOOK",
      entidadeId: input.correlationId,
      correlationId: input.correlationId,
      syncId: input.syncId,
      advogadoId: input.advogadoId,
      clienteNome: input.clienteNome,
      error: message,
      webhookUrl,
    });

    if (input.syncId) {
      const state = await getPortalProcessSyncState(input.syncId);

      if (state && state.tenantId === input.tenantId) {
        const failedState = withPortalProcessSyncStatus(state, "FAILED", {
          provider: "JUSBRASIL",
          correlationId: input.correlationId,
          webhookUrl: state.webhookUrl || webhookUrl,
          error: message,
        });

        await savePortalProcessSyncState(failedState);
      }
    }

    throw error instanceof Error ? error : new Error(message);
  }
}

processJusbrasilWebhookImportStep.maxRetries = 0;
