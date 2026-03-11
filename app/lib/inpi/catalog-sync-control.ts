import { getRedisInstance } from "@/app/lib/notifications/redis-singleton";

const INPI_CATALOG_SYNC_CANCEL_TTL_SECONDS = 2 * 60 * 60;

export const INPI_CATALOG_SYNC_CANCELED_ERROR = "INPI_SYNC_CANCELED";

function buildCancelKey(syncId: string) {
  return `ml:inpi-sync:cancel:${syncId}`;
}

export function isInpiCatalogSyncCanceledError(error: unknown) {
  return (
    error instanceof Error && error.message === INPI_CATALOG_SYNC_CANCELED_ERROR
  );
}

export async function requestInpiCatalogSyncCancellation(syncId: string) {
  const redis = getRedisInstance();
  await redis.set(
    buildCancelKey(syncId),
    new Date().toISOString(),
    "EX",
    INPI_CATALOG_SYNC_CANCEL_TTL_SECONDS,
  );
}

export async function clearInpiCatalogSyncCancellation(syncId: string) {
  const redis = getRedisInstance();
  await redis.del(buildCancelKey(syncId));
}

export async function isInpiCatalogSyncCancellationRequested(syncId: string) {
  const redis = getRedisInstance();
  return (await redis.exists(buildCancelKey(syncId))) > 0;
}
