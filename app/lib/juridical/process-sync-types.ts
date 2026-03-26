export type PortalProcessSyncStatus =
  | "QUEUED"
  | "RUNNING"
  | "AWAITING_WEBHOOK"
  | "WAITING_CAPTCHA"
  | "COMPLETED"
  | "FAILED";

export type PortalProcessSyncMode = "INITIAL" | "CAPTCHA";

export interface PortalProcessSyncJobData {
  syncId: string;
  tenantId: string;
  usuarioId: string;
  advogadoId?: string | null;
  tribunalSigla: string;
  oab: string;
  clienteNome?: string;
  mode: PortalProcessSyncMode;
  captchaId?: string;
  captchaText?: string;
}

export interface PortalProcessSyncState {
  syncId: string;
  tenantId: string;
  usuarioId: string;
  advogadoId?: string | null;
  tribunalSigla: string;
  oab: string;
  status: PortalProcessSyncStatus;
  mode: PortalProcessSyncMode;
  provider?: "SCRAPING" | "JUSBRASIL";
  correlationId?: string;
  webhookUrl?: string;
  message?: string;
  queueJobId?: string;
  syncedCount: number;
  createdCount: number;
  updatedCount: number;
  processosNumeros: string[];
  error?: string;
  captchaId?: string;
  captchaImage?: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  updatedAt: string;
}

export function isPortalProcessSyncTerminalStatus(
  status: PortalProcessSyncStatus,
) {
  return (
    status === "COMPLETED" ||
    status === "FAILED" ||
    status === "AWAITING_WEBHOOK"
  );
}
