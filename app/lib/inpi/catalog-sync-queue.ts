import { Queue } from "bullmq";

import { bullMQConfig } from "@/app/lib/notifications/redis-config";

import { InpiCatalogSyncJobData } from "./catalog-sync-types";

export const INPI_CATALOG_SYNC_QUEUE_NAME = "inpi-catalog-sync";

export class InpiCatalogSyncQueue {
  private queue: Queue<InpiCatalogSyncJobData>;

  constructor() {
    this.queue = new Queue<InpiCatalogSyncJobData>(INPI_CATALOG_SYNC_QUEUE_NAME, {
      connection: bullMQConfig.connection,
      defaultJobOptions: {
        ...bullMQConfig.defaultJobOptions,
        attempts: 1,
        removeOnComplete: 200,
        removeOnFail: 200,
      },
    });
  }

  async addJob(data: InpiCatalogSyncJobData): Promise<string> {
    const job = await this.queue.add("inpi-catalog-sync-job", data, {
      priority: data.forceRefresh ? 1 : 2,
      delay: 0,
    });

    return String(job.id);
  }

  async getQueueStats() {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
      this.queue.getDelayedCount(),
    ]);

    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
    };
  }

  async cancelJob(jobId: string): Promise<{
    removed: boolean;
    state: string | null;
  }> {
    const job = await this.queue.getJob(jobId);

    if (!job) {
      return {
        removed: false,
        state: null,
      };
    }

    const state = await job.getState();

    try {
      await job.remove();
      return {
        removed: true,
        state,
      };
    } catch {
      return {
        removed: false,
        state,
      };
    }
  }

  async close() {
    await this.queue.close();
  }
}

let inpiCatalogSyncQueue: InpiCatalogSyncQueue | null = null;

export function getInpiCatalogSyncQueue() {
  if (!inpiCatalogSyncQueue) {
    inpiCatalogSyncQueue = new InpiCatalogSyncQueue();
  }

  return inpiCatalogSyncQueue;
}
