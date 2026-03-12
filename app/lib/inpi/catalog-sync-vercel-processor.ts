import type { MessageMetadata } from "@vercel/queue";

import prisma from "@/app/lib/prisma";
import { logAudit, toAuditJson } from "@/app/lib/audit/log";
import { getRedisInstance } from "@/app/lib/notifications/redis-singleton";
import logger from "@/lib/logger";

import {
  clearInpiCatalogSyncCancellation,
  INPI_CATALOG_SYNC_CANCELED_ERROR,
  isInpiCatalogSyncCanceledError,
  isInpiCatalogSyncCancellationRequested,
} from "./catalog-sync-control";
import {
  dedupeOfficialItems,
  persistCatalogItems,
  reserveNewCatalogItemsForSync,
} from "./catalog-sync-persistence";
import {
  getInpiCatalogSyncState,
  saveInpiCatalogSyncState,
  withInpiCatalogSyncProgress,
  withInpiCatalogSyncStatus,
} from "./catalog-sync-status-store";
import { isInpiCatalogSyncTerminalStatus } from "./catalog-sync-types";
import { normalizeNiceClassCode } from "./nice-classes";
import { searchInpiOfficialPortalPageBatch } from "./oficial-source";
import {
  enqueueInpiCatalogSyncVercelMessage,
  type InpiCatalogSyncQueueMessage,
} from "./catalog-sync-vercel-queue";

const INPI_CATALOG_GLOBAL_FRESH_TTL_SECONDS = 2 * 60;
const INPI_CATALOG_GLOBAL_INFLIGHT_TTL_SECONDS = 25 * 60;
const INPI_CATALOG_SYNC_PAGES_PER_BATCH = 4;
const INPI_CATALOG_SYNC_MAX_DELIVERIES = 6;

function buildInpiCatalogGlobalInflightKey(coordinationKey: string) {
  return `ml:inpi-sync:global:inflight:${coordinationKey}`;
}

function buildInpiCatalogGlobalFreshKey(coordinationKey: string) {
  return `ml:inpi-sync:global:fresh:${coordinationKey}`;
}

async function publishInpiCatalogGlobalFreshState(params: {
  coordinationKey?: string;
  state: {
    syncId: string;
    matchedRows: number;
    scannedRows: number;
    persistedRows: number;
    createdCount: number;
    updatedCount: number;
    reachedLimit: boolean;
    reachedTimeout: boolean;
    warning?: string;
    status: string;
    updatedAt: string;
  };
}) {
  if (!params.coordinationKey) {
    return;
  }

  const redis = getRedisInstance();
  await redis.set(
    buildInpiCatalogGlobalFreshKey(params.coordinationKey),
    JSON.stringify({
      sourceSyncId: params.state.syncId,
      matchedRows: params.state.matchedRows,
      scannedRows: params.state.scannedRows,
      persistedRows: params.state.persistedRows,
      createdCount: params.state.createdCount,
      updatedCount: params.state.updatedCount,
      reachedLimit: params.state.reachedLimit,
      reachedTimeout: params.state.reachedTimeout,
      warning: params.state.warning,
      status: params.state.status,
      updatedAt: params.state.updatedAt,
    }),
    "EX",
    INPI_CATALOG_GLOBAL_FRESH_TTL_SECONDS,
  );
}

async function releaseInpiCatalogGlobalInflight(coordinationKey?: string) {
  if (!coordinationKey) {
    return;
  }

  const redis = getRedisInstance();
  await redis.del(buildInpiCatalogGlobalInflightKey(coordinationKey));
}

async function refreshInpiCatalogGlobalInflight(coordinationKey?: string) {
  if (!coordinationKey) {
    return;
  }

  const redis = getRedisInstance();
  await redis.set(
    buildInpiCatalogGlobalInflightKey(coordinationKey),
    new Date().toISOString(),
    "EX",
    INPI_CATALOG_GLOBAL_INFLIGHT_TTL_SECONDS,
  );
}

function calculateProgressPct(currentPage: number, totalPages: number) {
  if (!totalPages || totalPages <= 0) {
    return 1;
  }

  return Math.max(1, Math.min(95, Math.round((currentPage / totalPages) * 95)));
}

function describeSyncProcessingError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }

  return "Erro inesperado na fila Vercel.";
}

async function finalizeTerminalState(state: Awaited<
  ReturnType<typeof getInpiCatalogSyncState>
>) {
  if (!state) {
    return;
  }

  await saveInpiCatalogSyncState(state);
  await publishInpiCatalogGlobalFreshState({
    coordinationKey: state.coordinationKey,
    state,
  });
  await releaseInpiCatalogGlobalInflight(state.coordinationKey);
  await clearInpiCatalogSyncCancellation(state.syncId);
}

async function cancelSync(syncId: string, reason: string) {
  const state = await getInpiCatalogSyncState(syncId);
  if (!state || isInpiCatalogSyncTerminalStatus(state.status)) {
    return;
  }

  const next = withInpiCatalogSyncStatus(state, "CANCELED", {
    phase: "CANCELED",
    waitForGlobalSync: false,
    progressPct: Math.max(1, Math.min(99, state.progressPct || 0)),
    warning: reason,
    error: undefined,
  });

  await finalizeTerminalState(next);
}

async function failSync(syncId: string, message: string) {
  const state = await getInpiCatalogSyncState(syncId);
  if (!state || isInpiCatalogSyncTerminalStatus(state.status)) {
    return;
  }

  const next = withInpiCatalogSyncStatus(state, "FAILED", {
    phase: "FAILED",
    waitForGlobalSync: false,
    progressPct: Math.max(1, Math.min(99, state.progressPct || 0)),
    error: message,
  });

  await finalizeTerminalState(next);
}

export async function processInpiCatalogSyncVercelMessage(
  message: InpiCatalogSyncQueueMessage,
  metadata: MessageMetadata,
) {
  let state = await getInpiCatalogSyncState(message.syncId);
  if (!state) {
    return;
  }

  if (isInpiCatalogSyncTerminalStatus(state.status)) {
    return;
  }

  if (await isInpiCatalogSyncCancellationRequested(state.syncId)) {
    await cancelSync(state.syncId, "Busca oficial cancelada pelo usuário.");
    return;
  }

  try {
    state =
      state.status === "RUNNING"
        ? state
        : withInpiCatalogSyncStatus(state, "RUNNING", {
            phase: "SCANNING_BIBLIOGRAPHIC",
            waitForGlobalSync: false,
            error: undefined,
            warning: undefined,
            progressPct: Math.max(1, state.progressPct || 0),
          });
    await saveInpiCatalogSyncState(state);
    await refreshInpiCatalogGlobalInflight(state.coordinationKey);

    const batch = await searchInpiOfficialPortalPageBatch({
      term: state.termo,
      classNice: state.classeNice || undefined,
      pageStart: message.pageStart,
      maxPages: INPI_CATALOG_SYNC_PAGES_PER_BATCH,
      shouldCancel: async () =>
        isInpiCatalogSyncCancellationRequested(message.syncId),
      onPage: async (progress) => {
        const next = withInpiCatalogSyncProgress(state!, {
          phase: "SCANNING_BIBLIOGRAPHIC",
          progressPct: calculateProgressPct(
            progress.currentPage,
            progress.totalPages,
          ),
          estimatedTotalRows: Math.max(progress.totalFound, 1),
          scannedRows: Math.max(
            state!.scannedRows,
            message.scannedRowsBase + progress.scannedRows,
          ),
          matchedRows: Math.max(state!.matchedRows, progress.totalFound),
          reachedLimit: false,
          reachedTimeout: false,
        });
        state = next;
        await saveInpiCatalogSyncState(next);
        await refreshInpiCatalogGlobalInflight(next.coordinationKey);
      },
    });

    if (await isInpiCatalogSyncCancellationRequested(state.syncId)) {
      await cancelSync(state.syncId, "Busca oficial cancelada pelo usuário.");
      return;
    }

    const deduped = dedupeOfficialItems(
      batch.items.map((item) => ({
        nome: item.nome,
        classeNice: item.classeNice,
        processoNumero: item.processoNumero,
        titular: item.titular ?? null,
        status: item.status,
      })),
    );
    const reserved = await reserveNewCatalogItemsForSync(state.syncId, deduped);
    const persisted = await persistCatalogItems(reserved.items);
    const scannedRows = Math.max(
      state.scannedRows,
      message.scannedRowsBase + batch.scannedRows,
    );
    const createdCount = Math.max(
      state.createdCount,
      message.createdCountBase + persisted.createdCount,
    );
    const updatedCount = Math.max(
      state.updatedCount,
      message.updatedCountBase + persisted.updatedCount,
    );
    const persistedRows = Math.max(state.persistedRows, reserved.totalReserved);

    state = withInpiCatalogSyncProgress(state, {
      phase:
        batch.pageEnd >= batch.totalPages ? "PERSISTING" : "SCANNING_BIBLIOGRAPHIC",
      progressPct:
        batch.pageEnd >= batch.totalPages
          ? 96
          : calculateProgressPct(batch.pageEnd, batch.totalPages),
      estimatedTotalRows: Math.max(batch.totalFound, 1),
      scannedRows,
      matchedRows: Math.max(state.matchedRows, batch.totalFound),
      persistedRows,
      createdCount,
      updatedCount,
      reachedLimit: false,
      reachedTimeout: false,
      warning: undefined,
    });
    await saveInpiCatalogSyncState(state);
    await refreshInpiCatalogGlobalInflight(state.coordinationKey);

    if (batch.pageEnd < batch.totalPages) {
      await enqueueInpiCatalogSyncVercelMessage({
        syncId: state.syncId,
        pageStart: batch.pageEnd + 1,
        scannedRowsBase: state.scannedRows,
        createdCountBase: state.createdCount,
        updatedCountBase: state.updatedCount,
      });
      return;
    }

    await prisma.inpiBuscaLog.create({
      data: {
        tenantId: state.tenantId,
        dossieId: null,
        termo: state.termo,
        termoNormalizado: state.termoNormalizado,
        classeNice: normalizeNiceClassCode(state.classeNice) || null,
        totalEncontrado: state.matchedRows,
        fonte: "inpi_oficial_background",
        userId: state.usuarioId,
      },
    });

    await logAudit({
      tenantId: state.tenantId,
      usuarioId: state.usuarioId,
      acao: "SINCRONIZAR",
      entidade: "INPI_CATALOGO_BUSCA",
      dados: toAuditJson({
        termo: state.termo,
        classeNice: normalizeNiceClassCode(state.classeNice) || null,
        matchedRows: state.matchedRows,
        scannedRows: state.scannedRows,
        persistedRows: state.persistedRows,
        createdCount: state.createdCount,
        updatedCount: state.updatedCount,
        provider: "vercel-queue",
      }),
    });

    state = withInpiCatalogSyncStatus(state, "COMPLETED", {
      phase: "COMPLETED",
      waitForGlobalSync: false,
      progressPct: 100,
      warning: undefined,
      error: undefined,
    });
    await finalizeTerminalState(state);
  } catch (error) {
    if (isInpiCatalogSyncCanceledError(error)) {
      await cancelSync(message.syncId, "Busca oficial cancelada pelo usuário.");
      return;
    }

    const messageText = describeSyncProcessingError(error);

    logger.error("[InpiCatalogSyncVercel] Erro ao processar mensagem", {
      syncId: message.syncId,
      pageStart: message.pageStart,
      deliveryCount: metadata.deliveryCount,
      error: messageText,
      errorType:
        error === null ? "null" : Array.isArray(error) ? "array" : typeof error,
    });

    if (metadata.deliveryCount >= INPI_CATALOG_SYNC_MAX_DELIVERIES) {
      await failSync(message.syncId, messageText);
      return;
    }

    throw error;
  }
}
