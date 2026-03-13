import { QueueClient } from "@vercel/queue";

import { processInpiCatalogSyncVercelMessage } from "@/app/lib/inpi/catalog-sync-vercel-processor";
import type { InpiCatalogSyncQueueMessage } from "@/app/lib/inpi/catalog-sync-vercel-queue";

export const maxDuration = 300;

const queueClient = new QueueClient({
  region: process.env.VERCEL_REGION || "iad1",
});

const handleInpiCatalogSyncCallback =
  queueClient.handleCallback<InpiCatalogSyncQueueMessage>(
  async (message, metadata) => {
    await processInpiCatalogSyncVercelMessage(message, metadata);
  },
  {
    visibilityTimeoutSeconds: 300,
    retry: (_error, metadata) => {
      if (metadata.deliveryCount >= 6) {
        return { acknowledge: true };
      }

      return {
        afterSeconds: Math.min(300, 5 * 2 ** (metadata.deliveryCount - 1)),
      };
    },
  },
);

export async function POST(request: Request) {
  return handleInpiCatalogSyncCallback(request);
}
