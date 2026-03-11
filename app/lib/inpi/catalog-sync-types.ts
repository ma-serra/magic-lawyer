export type InpiCatalogSyncStatus =
  | "QUEUED"
  | "RUNNING"
  | "COMPLETED"
  | "CANCELED"
  | "FAILED";

export type InpiCatalogSyncPhase =
  | "QUEUED"
  | "SCANNING_BIBLIOGRAPHIC"
  | "SCANNING_CLASSIFICATION"
  | "PERSISTING"
  | "FINALIZING"
  | "COMPLETED"
  | "CANCELED"
  | "FAILED";

export interface InpiCatalogSyncJobData {
  syncId: string;
  tenantId: string;
  usuarioId: string;
  termo: string;
  termoNormalizado: string;
  classeNice?: string | null;
  coordinationKey?: string;
  forceRefresh?: boolean;
}

export interface InpiCatalogSyncState {
  syncId: string;
  tenantId: string;
  usuarioId: string;
  termo: string;
  termoNormalizado: string;
  classeNice: string | null;
  status: InpiCatalogSyncStatus;
  phase: InpiCatalogSyncPhase;
  queueJobId?: string;
  coordinationKey?: string;
  waitForGlobalSync?: boolean;
  progressPct: number;
  estimatedTotalRows: number;
  scannedRows: number;
  matchedRows: number;
  persistedRows: number;
  createdCount: number;
  updatedCount: number;
  reachedTimeout: boolean;
  reachedLimit: boolean;
  warning?: string;
  error?: string;
  startedAt?: string;
  finishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export function isInpiCatalogSyncTerminalStatus(
  status: InpiCatalogSyncStatus,
) {
  return (
    status === "COMPLETED" || status === "CANCELED" || status === "FAILED"
  );
}
