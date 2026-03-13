export type InpiCatalogSyncProvider = "vercel-queue";

export function getInpiCatalogSyncProvider(): InpiCatalogSyncProvider {
  return "vercel-queue";
}

export function isInpiCatalogSyncUsingVercelQueue() {
  return true;
}
