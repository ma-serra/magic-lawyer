import { getRedisInstance } from "@/app/lib/notifications/redis-singleton";

import {
  PortalProcessSyncState,
  PortalProcessSyncStatus,
} from "./process-sync-types";

const SYNC_STATE_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 dias
const MAX_HISTORY_ITEMS = 20;

function buildStateKey(syncId: string) {
  return `ml:process-sync:state:${syncId}`;
}

function buildLatestKey(tenantId: string, usuarioId: string) {
  return `ml:process-sync:latest:${tenantId}:${usuarioId}`;
}

function buildListKey(tenantId: string, usuarioId: string) {
  return `ml:process-sync:list:${tenantId}:${usuarioId}`;
}

function parseState(raw: string | null): PortalProcessSyncState | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as PortalProcessSyncState;
    if (!parsed?.syncId || !parsed?.tenantId || !parsed?.usuarioId) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function savePortalProcessSyncState(
  state: PortalProcessSyncState,
) {
  const redis = getRedisInstance();
  const payload = JSON.stringify(state);
  const stateKey = buildStateKey(state.syncId);
  const latestKey = buildLatestKey(state.tenantId, state.usuarioId);
  const listKey = buildListKey(state.tenantId, state.usuarioId);

  const multi = redis.multi();

  multi.set(stateKey, payload, "EX", SYNC_STATE_TTL_SECONDS);
  multi.set(latestKey, state.syncId, "EX", SYNC_STATE_TTL_SECONDS);
  multi.lrem(listKey, 0, state.syncId);
  multi.lpush(listKey, state.syncId);
  multi.ltrim(listKey, 0, MAX_HISTORY_ITEMS - 1);
  multi.expire(listKey, SYNC_STATE_TTL_SECONDS);

  await multi.exec();
}

export async function getPortalProcessSyncState(
  syncId: string,
): Promise<PortalProcessSyncState | null> {
  const redis = getRedisInstance();
  const raw = await redis.get(buildStateKey(syncId));
  return parseState(raw);
}

export async function getLatestPortalProcessSyncState(params: {
  tenantId: string;
  usuarioId: string;
}): Promise<PortalProcessSyncState | null> {
  const redis = getRedisInstance();
  const latestSyncId = await redis.get(buildLatestKey(params.tenantId, params.usuarioId));

  if (!latestSyncId) return null;
  return getPortalProcessSyncState(latestSyncId);
}

export async function listPortalProcessSyncStates(params: {
  tenantId: string;
  usuarioId: string;
  limit?: number;
}): Promise<PortalProcessSyncState[]> {
  const redis = getRedisInstance();
  const limit = Math.min(Math.max(params.limit ?? 10, 1), MAX_HISTORY_ITEMS);
  const listKey = buildListKey(params.tenantId, params.usuarioId);
  const syncIds = await redis.lrange(listKey, 0, limit - 1);

  if (syncIds.length === 0) return [];

  const keys = syncIds.map((id) => buildStateKey(id));
  const raws = await redis.mget(...keys);
  const states = raws.map((raw) => parseState(raw)).filter(Boolean) as PortalProcessSyncState[];

  return states.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function buildInitialPortalProcessSyncState(params: {
  syncId: string;
  tenantId: string;
  usuarioId: string;
  advogadoId?: string | null;
  tribunalSigla: string;
  oab: string;
  mode?: "INITIAL" | "CAPTCHA";
}): PortalProcessSyncState {
  const now = new Date().toISOString();

  return {
    syncId: params.syncId,
    tenantId: params.tenantId,
    usuarioId: params.usuarioId,
    advogadoId: params.advogadoId,
    tribunalSigla: params.tribunalSigla,
    oab: params.oab,
    status: "QUEUED",
    mode: params.mode ?? "INITIAL",
    syncedCount: 0,
    createdCount: 0,
    updatedCount: 0,
    processosNumeros: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function withPortalProcessSyncStatus(
  state: PortalProcessSyncState,
  status: PortalProcessSyncStatus,
  patch?: Partial<PortalProcessSyncState>,
): PortalProcessSyncState {
  const now = new Date().toISOString();
  const startedAt =
    status === "RUNNING" && !state.startedAt ? now : state.startedAt;
  const finishedAt =
    status === "COMPLETED" ||
    status === "FAILED" ||
    status === "AWAITING_WEBHOOK"
      ? now
      : state.finishedAt;

  return {
    ...state,
    ...patch,
    status,
    startedAt,
    finishedAt,
    updatedAt: now,
  };
}
