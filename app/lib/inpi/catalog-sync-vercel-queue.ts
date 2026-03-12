import { QueueClient } from "@vercel/queue";

export const INPI_CATALOG_SYNC_VERCEL_TOPIC = "inpi-catalog-sync";

const queueClient = new QueueClient({
  region: process.env.VERCEL_REGION || "iad1",
});

export interface InpiCatalogSyncQueueMessage {
  syncId: string;
  pageStart: number;
  scannedRowsBase: number;
  createdCountBase: number;
  updatedCountBase: number;
}

export async function enqueueInpiCatalogSyncVercelMessage(
  message: InpiCatalogSyncQueueMessage,
) {
  const { messageId } = await queueClient.send(
    INPI_CATALOG_SYNC_VERCEL_TOPIC,
    message,
    {
      idempotencyKey: `${message.syncId}:${message.pageStart}`,
    },
  );

  return messageId || `${message.syncId}:${message.pageStart}`;
}
