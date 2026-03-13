import {
  buildInitialPortalProcessSyncState,
  getPortalProcessSyncState,
  savePortalProcessSyncState,
  withPortalProcessSyncStatus,
} from "./process-sync-status-store";
import type {
  PortalProcessSyncWorkflowOutcome,
  PortalProcessSyncWorkflowStepInput,
} from "./process-sync-workflow-shared";
import {
  createPortalProcessSyncAudit,
  executePortalProcessSyncCapture,
  extractProcessosFromResult,
  persistPortalProcessos,
} from "./process-sync-core";

import logger from "@/lib/logger";

export async function executePortalProcessSyncWorkflowStep(
  input: PortalProcessSyncWorkflowStepInput,
): Promise<PortalProcessSyncWorkflowOutcome> {
  "use step";

  const origem =
    input.mode === "CAPTCHA" ? "BACKGROUND_CAPTCHA" : "BACKGROUND_INITIAL";

  let state =
    (await getPortalProcessSyncState(input.syncId)) ??
    buildInitialPortalProcessSyncState({
      syncId: input.syncId,
      tenantId: input.tenantId,
      usuarioId: input.usuarioId,
      advogadoId: input.advogadoId,
      tribunalSigla: input.tribunalSigla,
      oab: input.oab,
      mode: input.mode,
    });

  state = withPortalProcessSyncStatus(state, "RUNNING", {
    mode: input.mode,
    error: undefined,
    captchaId: undefined,
    captchaImage: undefined,
  });
  await savePortalProcessSyncState(state);

  try {
    const resultado = await executePortalProcessSyncCapture({
      mode: input.mode,
      tenantId: input.tenantId,
      tribunalSigla: input.tribunalSigla,
      oab: input.oab,
      captchaId: input.captchaId || state.captchaId,
      captchaText: input.captchaText,
    });

    if (!resultado.success) {
      if (resultado.captchaRequired && resultado.captcha?.id) {
        state = withPortalProcessSyncStatus(state, "WAITING_CAPTCHA", {
          error:
            resultado.error ||
            "Captcha obrigatório para continuar a sincronização.",
          captchaId: resultado.captcha.id,
          captchaImage: resultado.captcha.imageDataUrl,
        });
        await savePortalProcessSyncState(state);
        await createPortalProcessSyncAudit({
          tenantId: input.tenantId,
          usuarioId: input.usuarioId,
          syncId: input.syncId,
          tribunalSigla: input.tribunalSigla,
          oab: input.oab,
          status: "PENDENTE_CAPTCHA",
          origem,
          error: resultado.error,
        });

        return {
          kind: "WAITING_CAPTCHA",
          captchaId: resultado.captcha.id,
        };
      }

      state = withPortalProcessSyncStatus(state, "FAILED", {
        error:
          resultado.error || "Falha ao sincronizar processos no Workflow.",
      });
      await savePortalProcessSyncState(state);
      await createPortalProcessSyncAudit({
        tenantId: input.tenantId,
        usuarioId: input.usuarioId,
        syncId: input.syncId,
        tribunalSigla: input.tribunalSigla,
        oab: input.oab,
        status: "ERRO",
        origem,
        error: state.error,
      });

      return {
        kind: "FAILED",
        error: state.error || "Falha ao sincronizar processos.",
      };
    }

    const processosCapturados = extractProcessosFromResult(resultado);
    if (processosCapturados.length === 0) {
      state = withPortalProcessSyncStatus(state, "FAILED", {
        error: "Captura concluída sem processos válidos.",
      });
      await savePortalProcessSyncState(state);
      await createPortalProcessSyncAudit({
        tenantId: input.tenantId,
        usuarioId: input.usuarioId,
        syncId: input.syncId,
        tribunalSigla: input.tribunalSigla,
        oab: input.oab,
        status: "ERRO",
        origem,
        error: state.error,
      });

      return {
        kind: "FAILED",
        error: state.error || "Captura concluída sem processos válidos.",
      };
    }

    const persisted = await persistPortalProcessos({
      tenantId: input.tenantId,
      processos: processosCapturados,
      clienteNome: input.clienteNome,
      advogadoId: input.advogadoId,
    });

    const processosNumeros = processosCapturados
      .map((item) => item.numeroProcesso)
      .filter(Boolean)
      .slice(0, 50);

    state = withPortalProcessSyncStatus(state, "COMPLETED", {
      syncedCount: processosCapturados.length,
      createdCount: persisted.createdCount,
      updatedCount: persisted.updatedCount,
      processosNumeros,
      error: undefined,
    });
    await savePortalProcessSyncState(state);

    await createPortalProcessSyncAudit({
      tenantId: input.tenantId,
      usuarioId: input.usuarioId,
      syncId: input.syncId,
      tribunalSigla: input.tribunalSigla,
      oab: input.oab,
      status: "SUCESSO",
      origem,
      syncedCount: processosCapturados.length,
      createdCount: persisted.createdCount,
      updatedCount: persisted.updatedCount,
      processosNumeros,
    });

    return {
      kind: "COMPLETED",
      syncedCount: processosCapturados.length,
      createdCount: persisted.createdCount,
      updatedCount: persisted.updatedCount,
      processosNumeros,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erro inesperado no workflow.";

    state = withPortalProcessSyncStatus(state, "FAILED", {
      error: message,
    });
    await savePortalProcessSyncState(state);
    await createPortalProcessSyncAudit({
      tenantId: input.tenantId,
      usuarioId: input.usuarioId,
      syncId: input.syncId,
      tribunalSigla: input.tribunalSigla,
      oab: input.oab,
      status: "ERRO",
      origem,
      error: message,
    });

    logger.error(
      "[PortalProcessSyncWorkflow] Erro ao processar sincronização",
      error,
    );

    return {
      kind: "FAILED",
      error: message,
    };
  }
}

executePortalProcessSyncWorkflowStep.maxRetries = 0;
