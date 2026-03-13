import { PortalProcessSyncMode } from "./process-sync-types";

export interface PortalProcessSyncWorkflowInput {
  syncId: string;
  tenantId: string;
  usuarioId: string;
  advogadoId?: string | null;
  tribunalSigla: string;
  oab: string;
  clienteNome?: string;
}

export interface PortalProcessSyncWorkflowStepInput
  extends PortalProcessSyncWorkflowInput {
  mode: PortalProcessSyncMode;
  captchaId?: string;
  captchaText?: string;
}

export type PortalProcessSyncWorkflowResumePayload =
  | {
      action: "SOLVE";
      captchaText: string;
    }
  | {
      action: "REFRESH";
    };

export type PortalProcessSyncWorkflowOutcome =
  | {
      kind: "WAITING_CAPTCHA";
      captchaId: string;
    }
  | {
      kind: "FAILED";
      error: string;
    }
  | {
      kind: "COMPLETED";
      syncedCount: number;
      createdCount: number;
      updatedCount: number;
      processosNumeros: string[];
    };

export function buildPortalProcessSyncHookToken(syncId: string) {
  return `portal-process-sync:${syncId}`;
}
