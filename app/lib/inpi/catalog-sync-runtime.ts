import type { InpiCatalogSyncState } from "./catalog-sync-types";

export const INPI_CATALOG_SYNC_STALE_MS = 10 * 60 * 1000;
export const INPI_SYNC_BASE_MAX_DURATION_MS = 8 * 60 * 1000;
export const INPI_SYNC_DURATION_STEP_MS = 4 * 60 * 1000;
export const INPI_SYNC_MAX_DURATION_CEILING_MS = 18 * 60 * 1000;
export const INPI_SYNC_MAX_ATTEMPTS = 3;
export const INPI_SYNC_MAX_OPERATIONAL_WINDOW_MS =
  Array.from({ length: INPI_SYNC_MAX_ATTEMPTS }, (_, index) =>
    Math.min(
      INPI_SYNC_BASE_MAX_DURATION_MS + index * INPI_SYNC_DURATION_STEP_MS,
      INPI_SYNC_MAX_DURATION_CEILING_MS,
    ),
  ).reduce((total, value) => total + value, 0) +
  2 * 60 * 1000;

type RuntimeSyncState = Pick<
  InpiCatalogSyncState,
  "progressPct" | "startedAt" | "status" | "updatedAt"
>;

export function isInpiCatalogSyncStale(
  state: Pick<InpiCatalogSyncState, "status" | "updatedAt">,
  now = Date.now(),
) {
  if (state.status !== "QUEUED" && state.status !== "RUNNING") {
    return false;
  }

  const updatedAt = new Date(state.updatedAt).getTime();
  if (!Number.isFinite(updatedAt) || updatedAt <= 0) {
    return true;
  }

  return now - updatedAt > INPI_CATALOG_SYNC_STALE_MS;
}

export function estimateInpiCatalogSyncEtaSeconds(
  state: RuntimeSyncState | null | undefined,
  now = Date.now(),
) {
  if (!state || state.status !== "RUNNING" || !state.startedAt) {
    return undefined;
  }

  const startedAt = new Date(state.startedAt).getTime();
  if (!Number.isFinite(startedAt) || startedAt <= 0) {
    return undefined;
  }

  const elapsedMs = Math.max(0, now - startedAt);
  const boundedRemainingSeconds = Math.max(
    0,
    Math.ceil((INPI_SYNC_MAX_OPERATIONAL_WINDOW_MS - elapsedMs) / 1000),
  );
  if (boundedRemainingSeconds <= 0) {
    return undefined;
  }

  if (state.progressPct <= 0 || state.progressPct >= 100) {
    return boundedRemainingSeconds;
  }

  const elapsedSeconds = Math.max(1, elapsedMs / 1000);
  const progressRemainingSeconds =
    elapsedSeconds / (state.progressPct / 100) - elapsedSeconds;

  if (!Number.isFinite(progressRemainingSeconds)) {
    return boundedRemainingSeconds;
  }

  return Math.max(
    1,
    Math.min(Math.ceil(progressRemainingSeconds), boundedRemainingSeconds),
  );
}
