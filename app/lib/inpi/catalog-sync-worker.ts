import { Job, Worker } from "bullmq";

import prisma from "@/app/lib/prisma";
import { logAudit, toAuditJson } from "@/app/lib/audit/log";
import { bullMQConfig } from "@/app/lib/notifications/redis-config";
import { getRedisInstance } from "@/app/lib/notifications/redis-singleton";
import logger from "@/lib/logger";

import { INPI_CATALOG_SYNC_QUEUE_NAME } from "./catalog-sync-queue";
import {
  InpiCatalogSyncJobData,
  InpiCatalogSyncState,
} from "./catalog-sync-types";
import {
  buildInitialInpiCatalogSyncState,
  getInpiCatalogSyncState,
  saveInpiCatalogSyncState,
  withInpiCatalogSyncProgress,
  withInpiCatalogSyncStatus,
} from "./catalog-sync-status-store";
import { normalizeNiceClassCode } from "./nice-classes";
import { searchInpiOfficialSource } from "./oficial-source";

const INPI_ESTIMATED_TOTAL_ROWS = 9_500_000;
const INPI_SYNC_BASE_MAX_DURATION_MS = 8 * 60 * 1000; // 8 min
const INPI_SYNC_MAX_DURATION_CEILING_MS = 18 * 60 * 1000; // 18 min
const INPI_SYNC_BASE_MAX_SCAN_ROWS = 12_000_000;
const INPI_SYNC_MAX_SCAN_ROWS_CEILING = 28_000_000;
const INPI_SYNC_BASE_MAX_MATCHES = 8_000;
const INPI_SYNC_MAX_MATCHES_CEILING = 30_000;
const INPI_SYNC_MAX_ATTEMPTS = 3;
const PERSIST_CHUNK_SIZE = 200;
const INPI_CATALOG_GLOBAL_FRESH_TTL_SECONDS = 2 * 60;

function normalizeTerm(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function buildCatalogFingerprint(input: {
  nome: string;
  classeNice?: string | null;
  processoNumero?: string | null;
  protocolo?: string | null;
}) {
  const normalizedClass = normalizeNiceClassCode(input.classeNice) || "";

  return [
    normalizeTerm(input.nome),
    normalizedClass,
    (input.processoNumero || "").trim(),
    (input.protocolo || "").trim(),
  ].join("|");
}

type OfficialItem = {
  nome: string;
  classeNice: string | null;
  processoNumero: string;
  titular?: string | null;
  status: string;
};

function buildInpiCatalogGlobalInflightKey(coordinationKey: string) {
  return `ml:inpi-sync:global:inflight:${coordinationKey}`;
}

function buildInpiCatalogGlobalFreshKey(coordinationKey: string) {
  return `ml:inpi-sync:global:fresh:${coordinationKey}`;
}

function buildCatalogQualityKey(item: OfficialItem) {
  return [
    (item.processoNumero || "").trim(),
    normalizeTerm(item.nome),
    normalizeNiceClassCode(item.classeNice) || "sem-classe",
  ].join("|");
}

async function persistCatalogItems(items: OfficialItem[]) {
  if (!items.length) {
    return {
      persistedRows: 0,
      createdCount: 0,
      updatedCount: 0,
    };
  }

  let persistedRows = 0;
  let createdCount = 0;
  let updatedCount = 0;

  for (let i = 0; i < items.length; i += PERSIST_CHUNK_SIZE) {
    const chunk = items.slice(i, i + PERSIST_CHUNK_SIZE);
    const withFingerprint = chunk.map((item) => {
      const classeNice = normalizeNiceClassCode(item.classeNice);
      const fingerprint = buildCatalogFingerprint({
        nome: item.nome,
        classeNice,
        processoNumero: item.processoNumero,
        protocolo: null,
      });

      return {
        ...item,
        classeNice,
        fingerprint,
      };
    });

    const existing = await prisma.inpiCatalogMarca.findMany({
      where: {
        fingerprint: {
          in: withFingerprint.map((item) => item.fingerprint),
        },
      },
      select: {
        fingerprint: true,
      },
    });
    const existingSet = new Set(existing.map((item) => item.fingerprint));

    await prisma.$transaction(
      withFingerprint.map((item) =>
        prisma.inpiCatalogMarca.upsert({
          where: { fingerprint: item.fingerprint },
          update: {
            nome: item.nome,
            nomeNormalizado: normalizeTerm(item.nome),
            classeNice: item.classeNice,
            titular: item.titular?.trim() || undefined,
            processoNumero: item.processoNumero,
            status: item.status,
            fonte: "inpi_dados_abertos_live",
            dadosRaw: {
              lastBackgroundSyncAt: new Date().toISOString(),
            },
          },
          create: {
            nome: item.nome,
            nomeNormalizado: normalizeTerm(item.nome),
            classeNice: item.classeNice,
            titular: item.titular?.trim() || null,
            processoNumero: item.processoNumero,
            protocolo: null,
            status: item.status,
            descricao: null,
            fonte: "inpi_dados_abertos_live",
            fingerprint: item.fingerprint,
            dadosRaw: {
              lastBackgroundSyncAt: new Date().toISOString(),
            },
          },
        }),
      ),
    );

    persistedRows += withFingerprint.length;
    updatedCount += withFingerprint.filter((item) =>
      existingSet.has(item.fingerprint),
    ).length;
    createdCount += withFingerprint.length - existingSet.size;
  }

  return {
    persistedRows,
    createdCount,
    updatedCount,
  };
}

function dedupeOfficialItems(items: OfficialItem[]) {
  const map = new Map<string, OfficialItem>();

  for (const item of items) {
    const fingerprint = buildCatalogFingerprint({
      nome: item.nome,
      classeNice: item.classeNice,
      processoNumero: item.processoNumero,
      protocolo: null,
    });

    if (!fingerprint) continue;

    const existing = map.get(fingerprint);
    if (!existing) {
      map.set(fingerprint, item);
      continue;
    }

    const existingQuality =
      (existing.titular ? 2 : 0) + (normalizeNiceClassCode(existing.classeNice) ? 1 : 0);
    const incomingQuality =
      (item.titular ? 2 : 0) + (normalizeNiceClassCode(item.classeNice) ? 1 : 0);

    if (incomingQuality > existingQuality) {
      map.set(fingerprint, item);
    } else if (incomingQuality === existingQuality) {
      const existingStableKey = buildCatalogQualityKey(existing);
      const incomingStableKey = buildCatalogQualityKey(item);
      if (incomingStableKey.localeCompare(existingStableKey) < 0) {
        map.set(fingerprint, item);
      }
    }
  }

  return Array.from(map.values());
}

export class InpiCatalogSyncWorker {
  private worker: Worker<InpiCatalogSyncJobData>;

  constructor() {
    this.worker = new Worker<InpiCatalogSyncJobData>(
      INPI_CATALOG_SYNC_QUEUE_NAME,
      this.processJob.bind(this),
      {
        connection: bullMQConfig.connection,
        concurrency: 2,
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 200 },
      },
    );

    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    this.worker.on("completed", (job) => {
      logger.info(`[InpiCatalogSyncWorker] Job ${job.id} completed`);
    });

    this.worker.on("failed", (job, error) => {
      logger.error(`[InpiCatalogSyncWorker] Job ${job?.id} failed`, error);
    });

    this.worker.on("ready", () => {
      logger.info("[InpiCatalogSyncWorker] Worker ready");
    });
  }

  private async processJob(job: Job<InpiCatalogSyncJobData>) {
    const data = job.data;
    const queueJobId = String(job.id);
    const coordinationKey = data.coordinationKey || null;
    const inflightKey = coordinationKey
      ? buildInpiCatalogGlobalInflightKey(coordinationKey)
      : null;
    let state: InpiCatalogSyncState =
      (await getInpiCatalogSyncState(data.syncId)) ??
      buildInitialInpiCatalogSyncState({
        syncId: data.syncId,
        tenantId: data.tenantId,
        usuarioId: data.usuarioId,
        termo: data.termo,
        classeNice: data.classeNice,
      });

    state = withInpiCatalogSyncStatus(state, "RUNNING", {
      phase: "SCANNING_BIBLIOGRAPHIC",
      queueJobId,
      coordinationKey: coordinationKey || state.coordinationKey,
      waitForGlobalSync: false,
      error: undefined,
      warning: undefined,
      estimatedTotalRows: INPI_ESTIMATED_TOTAL_ROWS,
      progressPct: 1,
      reachedLimit: false,
      reachedTimeout: false,
    });
    await saveInpiCatalogSyncState(state);

    try {
      let official: Awaited<ReturnType<typeof searchInpiOfficialSource>>;
      let attempts = 0;
      let maxDurationMs = INPI_SYNC_BASE_MAX_DURATION_MS;
      let maxScanRows = INPI_SYNC_BASE_MAX_SCAN_ROWS;
      let maxMatches = INPI_SYNC_BASE_MAX_MATCHES;

      while (true) {
        attempts += 1;

        if (attempts > 1) {
          state = withInpiCatalogSyncProgress(state, {
            phase: "SCANNING_BIBLIOGRAPHIC",
            progressPct: 2,
            warning: `Rodada automática ${attempts}/${INPI_SYNC_MAX_ATTEMPTS} para concluir a busca completa.`,
          });
          await saveInpiCatalogSyncState(state);
        }

        let lastProgressFlushAt = 0;
        official = await searchInpiOfficialSource({
          term: data.termo,
          classNice: data.classeNice || undefined,
          limit: maxMatches,
          maxMatches,
          maxDurationMs,
          maxScanRows,
          exhaustive: true,
          onProgress: async (progress) => {
            const now = Date.now();
            if (
              now - lastProgressFlushAt < 1200 &&
              progress.phase !== "FINALIZING"
            ) {
              return;
            }

            lastProgressFlushAt = now;
            state = withInpiCatalogSyncProgress(state, {
              phase: progress.phase,
              progressPct: Math.max(1, Math.min(95, progress.progressPct)),
              estimatedTotalRows: progress.estimatedTotalRows,
              scannedRows: progress.scannedRows,
              matchedRows: progress.matchedRows,
              reachedLimit: progress.reachedLimit,
              reachedTimeout: progress.reachedTimeout,
            });
            await saveInpiCatalogSyncState(state);
          },
        });

        if (!official.reachedLimit && !official.reachedTimeout) {
          break;
        }

        if (attempts >= INPI_SYNC_MAX_ATTEMPTS) {
          break;
        }

        maxDurationMs = Math.min(
          maxDurationMs + 4 * 60 * 1000,
          INPI_SYNC_MAX_DURATION_CEILING_MS,
        );
        maxScanRows = Math.min(
          maxScanRows + 4_000_000,
          INPI_SYNC_MAX_SCAN_ROWS_CEILING,
        );
        maxMatches = Math.min(maxMatches + 4_000, INPI_SYNC_MAX_MATCHES_CEILING);
      }

      state = withInpiCatalogSyncProgress(state, {
        phase: "PERSISTING",
        progressPct: 96,
        scannedRows: official.scannedRows,
        matchedRows: official.matchedRows,
        reachedLimit: official.reachedLimit,
        reachedTimeout: official.reachedTimeout,
      });
      await saveInpiCatalogSyncState(state);

      const deduped = dedupeOfficialItems(
        official.items.map((item) => ({
          nome: item.nome,
          classeNice: item.classeNice,
          processoNumero: item.processoNumero,
          titular: item.titular ?? null,
          status: item.status,
        })),
      );

      const persisted = await persistCatalogItems(deduped);

      let warning: string | undefined;
      if (official.reachedLimit || official.reachedTimeout) {
        warning =
          "Busca oficial finalizou com limite operacional mesmo após rodadas automáticas. Execute novo reprocessamento para completar.";
      }

      await prisma.inpiBuscaLog.create({
        data: {
          tenantId: data.tenantId,
          dossieId: null,
          termo: data.termo,
          termoNormalizado: data.termoNormalizado,
          classeNice: normalizeNiceClassCode(data.classeNice) || null,
          totalEncontrado: deduped.length,
          fonte: "inpi_oficial_background",
          userId: data.usuarioId,
        },
      });

      await logAudit({
        tenantId: data.tenantId,
        usuarioId: data.usuarioId,
        acao: "SINCRONIZAR",
        entidade: "INPI_CATALOGO_BUSCA",
        dados: toAuditJson({
          termo: data.termo,
          classeNice: normalizeNiceClassCode(data.classeNice) || null,
          matchedRows: official.matchedRows,
          scannedRows: official.scannedRows,
          persistedRows: persisted.persistedRows,
          createdCount: persisted.createdCount,
          updatedCount: persisted.updatedCount,
          reachedTimeout: official.reachedTimeout,
          reachedLimit: official.reachedLimit,
          warning: warning || null,
        }),
      });

      state = withInpiCatalogSyncStatus(state, "COMPLETED", {
        phase: "COMPLETED",
        coordinationKey: coordinationKey || state.coordinationKey,
        waitForGlobalSync: false,
        progressPct: 100,
        scannedRows: official.scannedRows,
        matchedRows: official.matchedRows,
        persistedRows: persisted.persistedRows,
        createdCount: persisted.createdCount,
        updatedCount: persisted.updatedCount,
        reachedLimit: official.reachedLimit,
        reachedTimeout: official.reachedTimeout,
        warning,
        error: undefined,
      });
      await saveInpiCatalogSyncState(state);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro inesperado no worker.";

      state = withInpiCatalogSyncStatus(state, "FAILED", {
        phase: "FAILED",
        coordinationKey: coordinationKey || state.coordinationKey,
        waitForGlobalSync: false,
        progressPct: Math.min(99, state.progressPct || 0),
        error: message,
      });
      await saveInpiCatalogSyncState(state);
      logger.error("[InpiCatalogSyncWorker] Erro ao processar job", error);
    } finally {
      if (coordinationKey) {
        const redis = getRedisInstance();
        const freshPayload = JSON.stringify({
          sourceSyncId: state.syncId,
          matchedRows: state.matchedRows,
          scannedRows: state.scannedRows,
          persistedRows: state.persistedRows,
          createdCount: state.createdCount,
          updatedCount: state.updatedCount,
          reachedLimit: state.reachedLimit,
          reachedTimeout: state.reachedTimeout,
          warning: state.warning,
          status: state.status,
          updatedAt: state.updatedAt,
        });

        await redis.set(
          buildInpiCatalogGlobalFreshKey(coordinationKey),
          freshPayload,
          "EX",
          INPI_CATALOG_GLOBAL_FRESH_TTL_SECONDS,
        );

        if (inflightKey) {
          const lockValue = await redis.get(inflightKey);
          if (lockValue) {
            await redis.del(inflightKey);
          }
        }
      }
    }
  }

  async start() {
    logger.info("[InpiCatalogSyncWorker] Starting worker...");
  }

  async stop() {
    logger.info("[InpiCatalogSyncWorker] Stopping worker...");
    await this.worker.close();
  }

  async getStats() {
    return {
      running: true,
      concurrency: 2,
    };
  }
}

let inpiCatalogSyncWorker: InpiCatalogSyncWorker | null = null;

export function getInpiCatalogSyncWorker() {
  if (!inpiCatalogSyncWorker) {
    inpiCatalogSyncWorker = new InpiCatalogSyncWorker();
  }

  return inpiCatalogSyncWorker;
}

export async function startInpiCatalogSyncWorker() {
  const worker = getInpiCatalogSyncWorker();
  await worker.start();
}

export async function stopInpiCatalogSyncWorker() {
  if (inpiCatalogSyncWorker) {
    await inpiCatalogSyncWorker.stop();
    inpiCatalogSyncWorker = null;
  }
}
