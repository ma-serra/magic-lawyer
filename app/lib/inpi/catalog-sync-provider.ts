export type InpiCatalogSyncProvider = "bullmq" | "vercel-queue";

function normalizeProvider(value?: string | null): InpiCatalogSyncProvider | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "bullmq") {
    return "bullmq";
  }

  if (
    normalized === "vercel" ||
    normalized === "vercel-queue" ||
    normalized === "queue"
  ) {
    return "vercel-queue";
  }

  return null;
}

export function getInpiCatalogSyncProvider(): InpiCatalogSyncProvider {
  const explicit = normalizeProvider(process.env.INPI_CATALOG_SYNC_PROVIDER);
  if (explicit) {
    return explicit;
  }

  if (process.env.VERCEL === "1" || Boolean(process.env.VERCEL_URL)) {
    return "vercel-queue";
  }

  return "bullmq";
}

export function isInpiCatalogSyncUsingVercelQueue() {
  return getInpiCatalogSyncProvider() === "vercel-queue";
}
