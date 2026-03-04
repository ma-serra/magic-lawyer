import { getRedisInstance } from "@/app/lib/notifications/redis-singleton";
import { normalizeNiceClassCode } from "@/app/lib/inpi/nice-classes";

import {
  InpiCatalogSyncPhase,
  InpiCatalogSyncState,
  InpiCatalogSyncStatus,
} from "./catalog-sync-types";

const INPI_CATALOG_SYNC_STATE_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 dias
const INPI_CATALOG_SYNC_HISTORY_MAX_ITEMS = 30;

function normalizeTerm(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function buildStateKey(syncId: string) {
  return `ml:inpi-sync:state:${syncId}`;
}

function buildScopeKey(params: {
  tenantId: string;
  usuarioId: string;
  termoNormalizado: string;
  classeNice?: string | null;
}) {
  const classe = normalizeNiceClassCode(params.classeNice) || "sem-classe";
  return `ml:inpi-sync:latest:${params.tenantId}:${params.usuarioId}:${params.termoNormalizado}:${classe}`;
}

function buildListKey(tenantId: string, usuarioId: string) {
  return `ml:inpi-sync:list:${tenantId}:${usuarioId}`;
}

function parseState(raw: string | null): InpiCatalogSyncState | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as InpiCatalogSyncState;
    if (!parsed?.syncId || !parsed?.tenantId || !parsed?.usuarioId) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function buildInitialInpiCatalogSyncState(params: {
  syncId: string;
  tenantId: string;
  usuarioId: string;
  termo: string;
  classeNice?: string | null;
}): InpiCatalogSyncState {
  const now = new Date().toISOString();
  const termoNormalizado = normalizeTerm(params.termo);

  return {
    syncId: params.syncId,
    tenantId: params.tenantId,
    usuarioId: params.usuarioId,
    termo: params.termo,
    termoNormalizado,
    classeNice: normalizeNiceClassCode(params.classeNice),
    status: "QUEUED",
    phase: "QUEUED",
    progressPct: 0,
    estimatedTotalRows: 0,
    scannedRows: 0,
    matchedRows: 0,
    persistedRows: 0,
    createdCount: 0,
    updatedCount: 0,
    reachedTimeout: false,
    reachedLimit: false,
    createdAt: now,
    updatedAt: now,
  };
}

export async function saveInpiCatalogSyncState(state: InpiCatalogSyncState) {
  const redis = getRedisInstance();
  const payload = JSON.stringify(state);
  const stateKey = buildStateKey(state.syncId);
  const scopeKey = buildScopeKey({
    tenantId: state.tenantId,
    usuarioId: state.usuarioId,
    termoNormalizado: state.termoNormalizado,
    classeNice: state.classeNice,
  });
  const listKey = buildListKey(state.tenantId, state.usuarioId);

  const multi = redis.multi();
  multi.set(stateKey, payload, "EX", INPI_CATALOG_SYNC_STATE_TTL_SECONDS);
  multi.set(scopeKey, state.syncId, "EX", INPI_CATALOG_SYNC_STATE_TTL_SECONDS);
  multi.lrem(listKey, 0, state.syncId);
  multi.lpush(listKey, state.syncId);
  multi.ltrim(listKey, 0, INPI_CATALOG_SYNC_HISTORY_MAX_ITEMS - 1);
  multi.expire(listKey, INPI_CATALOG_SYNC_STATE_TTL_SECONDS);
  await multi.exec();
}

export async function getInpiCatalogSyncState(
  syncId: string,
): Promise<InpiCatalogSyncState | null> {
  const redis = getRedisInstance();
  const raw = await redis.get(buildStateKey(syncId));
  return parseState(raw);
}

export async function getLatestInpiCatalogSyncState(params: {
  tenantId: string;
  usuarioId: string;
  termo: string;
  classeNice?: string | null;
}): Promise<InpiCatalogSyncState | null> {
  const redis = getRedisInstance();
  const termoNormalizado = normalizeTerm(params.termo);
  const latestSyncId = await redis.get(
    buildScopeKey({
      tenantId: params.tenantId,
      usuarioId: params.usuarioId,
      termoNormalizado,
      classeNice: params.classeNice,
    }),
  );

  if (!latestSyncId) {
    return null;
  }

  return getInpiCatalogSyncState(latestSyncId);
}

export async function listInpiCatalogSyncStates(params: {
  tenantId: string;
  usuarioId: string;
  limit?: number;
}): Promise<InpiCatalogSyncState[]> {
  const redis = getRedisInstance();
  const limit = Math.min(
    Math.max(params.limit ?? 10, 1),
    INPI_CATALOG_SYNC_HISTORY_MAX_ITEMS,
  );
  const listKey = buildListKey(params.tenantId, params.usuarioId);
  const syncIds = await redis.lrange(listKey, 0, limit - 1);

  if (syncIds.length === 0) {
    return [];
  }

  const keys = syncIds.map((id) => buildStateKey(id));
  const raws = await redis.mget(...keys);
  const states = raws
    .map((raw) => parseState(raw))
    .filter(Boolean) as InpiCatalogSyncState[];

  return states.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function withInpiCatalogSyncStatus(
  state: InpiCatalogSyncState,
  status: InpiCatalogSyncStatus,
  patch?: Partial<InpiCatalogSyncState>,
) {
  const now = new Date().toISOString();
  const startedAt =
    status === "RUNNING" && !state.startedAt ? now : state.startedAt;
  const finishedAt =
    status === "COMPLETED" || status === "FAILED" ? now : state.finishedAt;

  return {
    ...state,
    ...patch,
    status,
    startedAt,
    finishedAt,
    updatedAt: now,
  };
}

export function withInpiCatalogSyncProgress(
  state: InpiCatalogSyncState,
  patch: Partial<Pick<
    InpiCatalogSyncState,
    | "phase"
    | "progressPct"
    | "estimatedTotalRows"
    | "scannedRows"
    | "matchedRows"
    | "persistedRows"
    | "createdCount"
    | "updatedCount"
    | "warning"
    | "reachedLimit"
    | "reachedTimeout"
  >>,
) {
  const now = new Date().toISOString();
  return {
    ...state,
    ...patch,
    phase: (patch.phase || state.phase) as InpiCatalogSyncPhase,
    updatedAt: now,
  };
}

