"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";

import { checkPermission } from "@/app/actions/equipe";
import { getSession } from "@/app/lib/auth";
import { logAudit, toAuditJson } from "@/app/lib/audit/log";
import { INPI_DEFAULT_CATALOG } from "@/app/lib/inpi/default-catalog";
import { getInpiCatalogSyncQueue } from "@/app/lib/inpi/catalog-sync-queue";
import {
  clearInpiCatalogSyncCancellation,
  requestInpiCatalogSyncCancellation,
} from "@/app/lib/inpi/catalog-sync-control";
import { isInpiCatalogSyncUsingVercelQueue } from "@/app/lib/inpi/catalog-sync-provider";
import { isInpiCatalogSyncStale } from "@/app/lib/inpi/catalog-sync-runtime";
import {
  buildInitialInpiCatalogSyncState,
  getInpiCatalogSyncState,
  getLatestInpiCatalogSyncState,
  listInpiCatalogSyncStates,
  saveInpiCatalogSyncState,
  withInpiCatalogSyncProgress,
  withInpiCatalogSyncStatus,
} from "@/app/lib/inpi/catalog-sync-status-store";
import {
  InpiCatalogSyncState,
  isInpiCatalogSyncTerminalStatus,
} from "@/app/lib/inpi/catalog-sync-types";
import { enqueueInpiCatalogSyncVercelMessage } from "@/app/lib/inpi/catalog-sync-vercel-queue";
import {
  NICE_CLASS_CATALOG,
  formatNiceClassCode,
  normalizeNiceClassCode,
  type NiceClassType,
} from "@/app/lib/inpi/nice-classes";
import { initNotificationWorker } from "@/app/lib/notifications/init-worker";
import { getRedisInstance } from "@/app/lib/notifications/redis-singleton";
import prisma from "@/app/lib/prisma";
import { InpiDossieStatus, InpiRisco, UserRole } from "@/generated/prisma";
import logger from "@/lib/logger";

type InpiAccessMode = "read" | "write" | "sync";
const INPI_OFFICIAL_SEARCH_RATE_WINDOW_HOURS = 1;
const INPI_OFFICIAL_SEARCH_MAX_PER_WINDOW = 12;
const INPI_OFFICIAL_SEARCH_RATE_WINDOW_MS =
  INPI_OFFICIAL_SEARCH_RATE_WINDOW_HOURS * 60 * 60 * 1000;
const INPI_CATALOG_GLOBAL_INFLIGHT_TTL_SECONDS = 25 * 60;
const INPI_SCHEMA_NOT_READY_MESSAGE =
  "Módulo INPI ainda não foi aplicado neste banco. Execute a atualização de schema em produção (prisma db push ou migrate deploy) e faça novo deploy.";

function getPrismaErrorCode(error: unknown): string | null {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
  ) {
    return (error as { code: string }).code;
  }

  return null;
}

function isInpiSchemaMissingError(error: unknown): boolean {
  if (getPrismaErrorCode(error) !== "P2021") {
    return false;
  }

  const message = error instanceof Error ? error.message : "";
  return /magiclawyer\.Inpi/i.test(message);
}

export interface InpiCatalogSearchParams {
  termo: string;
  classeNice?: string;
  limit?: number;
  linkedDossieId?: string;
  recordHistory?: boolean;
}

export interface InpiCatalogSearchItem {
  id: string;
  nome: string;
  classeNice: string | null;
  titular: string | null;
  processoNumero: string | null;
  protocolo: string | null;
  status: string;
  fonte: string;
  score: number;
}

function normalizeRetryAfterSeconds(
  ttlSeconds: number,
  maxSeconds: number,
): number | undefined {
  if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
    return undefined;
  }

  return Math.min(Math.max(1, Math.ceil(ttlSeconds)), maxSeconds);
}

async function checkOfficialSearchRateLimit(tenantId: string) {
  const now = Date.now();
  const since = new Date(now - INPI_OFFICIAL_SEARCH_RATE_WINDOW_MS);
  const where = {
    tenantId,
    fonte: {
      in: ["inpi_oficial_live", "inpi_oficial_background"],
    },
    createdAt: {
      gte: since,
    },
  };
  const [count, oldest] = await prisma.$transaction([
    prisma.inpiBuscaLog.count({ where }),
    prisma.inpiBuscaLog.findFirst({
      where,
      orderBy: [{ createdAt: "asc" }],
      select: {
        createdAt: true,
      },
    }),
  ]);

  const retryAfterSeconds =
    count >= INPI_OFFICIAL_SEARCH_MAX_PER_WINDOW && oldest?.createdAt
      ? normalizeRetryAfterSeconds(
          (oldest.createdAt.getTime() + INPI_OFFICIAL_SEARCH_RATE_WINDOW_MS - now) /
            1000,
          INPI_OFFICIAL_SEARCH_RATE_WINDOW_HOURS * 60 * 60,
        )
      : undefined;

  return {
    exceeded: count >= INPI_OFFICIAL_SEARCH_MAX_PER_WINDOW,
    count,
    max: INPI_OFFICIAL_SEARCH_MAX_PER_WINDOW,
    retryAfterSeconds,
  };
}

export interface InpiDossieListParams {
  search?: string;
  status?: InpiDossieStatus | "all";
  risco?: InpiRisco | "all";
  page?: number;
  pageSize?: number;
}

export interface InpiDossieItem {
  id: string;
  nomePretendido: string;
  classeNice: string | null;
  segmento: string | null;
  status: InpiDossieStatus;
  riscoAtual: InpiRisco;
  observacoes: string | null;
  resumoAnalise: string | null;
  createdAt: Date;
  updatedAt: Date;
  colisoesCount: number;
  topColisoes: Array<{
    id: string;
    score: number;
    nivelRisco: InpiRisco;
    marcaNome: string;
    marcaClasseNice: string | null;
    marcaStatus: string;
  }>;
}

export interface InpiDossieColisaoDetalheItem {
  id: string;
  score: number;
  nivelRisco: InpiRisco;
  justificativa: string | null;
  marcaNome: string;
  marcaClasseNice: string | null;
  marcaStatus: string;
  marcaProcessoNumero: string | null;
  marcaTitular: string | null;
}

export interface InpiDashboardStats {
  catalogoGlobalTotal: number;
  dossiesTotal: number;
  dossiesViaveis: number;
  dossiesRiscoAltoOuCritico: number;
  dossiesProtocolados: number;
  buscasUltimas24h: number;
  ultimaAtualizacaoCatalogo: Date | null;
}

export interface InpiBuscaHistoryItem {
  id: string;
  termo: string;
  termoNormalizado: string;
  classeNice: string | null;
  totalEncontrado: number;
  fonte: string;
  createdAt: Date;
  userId: string | null;
  userName: string;
  userEmail: string | null;
}

export interface InpiBuscaHistoryParams {
  search?: string;
  source?: string;
  processNumber?: string;
  page?: number;
  pageSize?: number;
}

export interface InpiBuscaHistoryDetailsData {
  log: InpiBuscaHistoryItem;
  items: InpiCatalogSearchItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  warning?: string;
}

export interface InpiNiceClassItem {
  code: string;
  codeDisplay: string;
  heading: string;
  description: string;
  type: NiceClassType;
  usageDossies: number;
  usageSearches: number;
  usageTotal: number;
}

export interface InpiCatalogSearchSyncStatus {
  syncId: string;
  termo: string;
  termoNormalizado: string;
  classeNice: string | null;
  coordinationKey?: string;
  waitForGlobalSync?: boolean;
  status: InpiCatalogSyncState["status"];
  phase: InpiCatalogSyncState["phase"];
  progressPct: number;
  estimatedTotalRows: number;
  scannedRows: number;
  matchedRows: number;
  persistedRows: number;
  createdCount: number;
  updatedCount: number;
  reachedTimeout: boolean;
  reachedLimit: boolean;
  warning?: string;
  error?: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  updatedAt: string;
}

function normalizeTerm(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function getNiceClassVariants(value?: string | null): string[] {
  const normalized = normalizeNiceClassCode(value);

  if (!normalized) {
    return [];
  }

  const padded = normalized.padStart(2, "0");
  return normalized === padded ? [normalized] : [normalized, padded];
}

function toPublicInpiCatalogSearchSyncStatus(
  state: InpiCatalogSyncState,
): InpiCatalogSearchSyncStatus {
  return {
    syncId: state.syncId,
    termo: state.termo,
    termoNormalizado: state.termoNormalizado,
    classeNice: state.classeNice,
    coordinationKey: state.coordinationKey,
    waitForGlobalSync: state.waitForGlobalSync,
    status: state.status,
    phase: state.phase,
    progressPct: state.progressPct,
    estimatedTotalRows: state.estimatedTotalRows,
    scannedRows: state.scannedRows,
    matchedRows: state.matchedRows,
    persistedRows: state.persistedRows,
    createdCount: state.createdCount,
    updatedCount: state.updatedCount,
    reachedTimeout: state.reachedTimeout,
    reachedLimit: state.reachedLimit,
    warning: state.warning,
    error: state.error,
    createdAt: state.createdAt,
    startedAt: state.startedAt,
    finishedAt: state.finishedAt,
    updatedAt: state.updatedAt,
  };
}

function buildInpiCatalogGlobalCoordinationKey(
  termoNormalizado: string,
  classeNice?: string | null,
) {
  const classe = normalizeNiceClassCode(classeNice) || "sem-classe";
  return `${termoNormalizado}:${classe}`;
}

function buildInpiCatalogGlobalInflightKey(coordinationKey: string) {
  return `ml:inpi-sync:global:inflight:${coordinationKey}`;
}

function buildInpiCatalogGlobalFreshKey(coordinationKey: string) {
  return `ml:inpi-sync:global:fresh:${coordinationKey}`;
}

function parseInpiCatalogGlobalFreshPayload(raw: string | null): {
  status?: InpiCatalogSyncState["status"];
  sourceSyncId?: string;
  matchedRows?: number;
  scannedRows?: number;
  persistedRows?: number;
  createdCount?: number;
  updatedCount?: number;
  reachedLimit?: boolean;
  reachedTimeout?: boolean;
  warning?: string;
} | null {
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as {
      status?: InpiCatalogSyncState["status"];
      sourceSyncId?: string;
      matchedRows?: number;
      scannedRows?: number;
      persistedRows?: number;
      createdCount?: number;
      updatedCount?: number;
      reachedLimit?: boolean;
      reachedTimeout?: boolean;
      warning?: string;
    };
  } catch {
    return null;
  }
}

async function publishInpiCatalogGlobalFreshState(
  coordinationKey: string,
  state: InpiCatalogSyncState,
) {
  const redis = getRedisInstance();
  await redis.set(
    buildInpiCatalogGlobalFreshKey(coordinationKey),
    JSON.stringify({
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
    }),
    "EX",
    2 * 60,
  );
}

async function releaseInpiCatalogGlobalInflight(coordinationKey: string) {
  const redis = getRedisInstance();
  await redis.del(buildInpiCatalogGlobalInflightKey(coordinationKey));
}

async function refreshReadableInpiCatalogSyncState(
  state: InpiCatalogSyncState,
): Promise<InpiCatalogSyncState> {
  let next = state;

  if (
    next.waitForGlobalSync &&
    next.status === "QUEUED" &&
    next.coordinationKey
  ) {
    const redis = getRedisInstance();
    const inflightExists = await redis.exists(
      buildInpiCatalogGlobalInflightKey(next.coordinationKey),
    );

    if (!inflightExists) {
      const freshPayload = parseInpiCatalogGlobalFreshPayload(
        await redis.get(buildInpiCatalogGlobalFreshKey(next.coordinationKey)),
      );
      if (freshPayload?.status === "FAILED") {
        next = withInpiCatalogSyncStatus(next, "FAILED", {
          phase: "FAILED",
          waitForGlobalSync: false,
          progressPct: Math.max(1, Math.min(99, next.progressPct || 0)),
          error:
            freshPayload.warning ||
            "Sincronização global finalizou com falha. Tente novamente.",
        });
      } else if (freshPayload?.status === "CANCELED") {
        next = withInpiCatalogSyncStatus(next, "CANCELED", {
          phase: "CANCELED",
          waitForGlobalSync: false,
          progressPct: Math.max(1, Math.min(99, next.progressPct || 0)),
          warning:
            freshPayload.warning ||
            "Sincronização global foi cancelada antes de concluir.",
          error: undefined,
        });
      } else if (freshPayload?.status === "COMPLETED") {
        next = withInpiCatalogSyncStatus(next, "COMPLETED", {
          phase: "COMPLETED",
          waitForGlobalSync: false,
          progressPct: 100,
          scannedRows: Math.max(
            next.scannedRows,
            Math.max(0, freshPayload?.scannedRows ?? 0),
          ),
          matchedRows: Math.max(
            next.matchedRows,
            Math.max(0, freshPayload?.matchedRows ?? 0),
          ),
          persistedRows: Math.max(
            next.persistedRows,
            Math.max(0, freshPayload?.persistedRows ?? 0),
          ),
          createdCount: Math.max(
            next.createdCount,
            Math.max(0, freshPayload?.createdCount ?? 0),
          ),
          updatedCount: Math.max(
            next.updatedCount,
            Math.max(0, freshPayload?.updatedCount ?? 0),
          ),
          reachedLimit: Boolean(freshPayload?.reachedLimit),
          reachedTimeout: Boolean(freshPayload?.reachedTimeout),
          warning:
            freshPayload?.warning ||
              "Sincronização global concluída. Resultado reaproveitado para este escritório.",
        });
      } else {
        next = withInpiCatalogSyncStatus(next, "FAILED", {
          phase: "FAILED",
          waitForGlobalSync: false,
          progressPct: Math.max(1, Math.min(99, next.progressPct || 0)),
          error:
            "Sincronização global terminou sem publicar um resultado reaproveitável. Tente novamente.",
        });
      }

      await saveInpiCatalogSyncState(next);
    }
  }

  if (isInpiCatalogSyncStale(next)) {
    next = withInpiCatalogSyncStatus(next, "FAILED", {
      phase: "FAILED",
      waitForGlobalSync: false,
      progressPct: Math.max(1, Math.min(99, next.progressPct || 0)),
      error: "A busca anterior foi encerrada automaticamente por inatividade do worker.",
    });
    await saveInpiCatalogSyncState(next);
  }

  return next;
}

async function withInpiCatalogEnqueueLock<T>(params: {
  tenantId: string;
  usuarioId: string;
  termoNormalizado: string;
  classeNice?: string | null;
  callback: () => Promise<T>;
}): Promise<{ success: true; data: T } | { success: false; error: string }> {
  const classe = normalizeNiceClassCode(params.classeNice) || "sem-classe";
  const lockKey = `ml:inpi-sync:enqueue-lock:${params.tenantId}:${params.usuarioId}:${params.termoNormalizado}:${classe}`;
  const lockToken = `${Date.now()}-${randomUUID()}`;

  try {
    const redis = getRedisInstance();
    const acquired = await redis.set(lockKey, lockToken, "EX", 20, "NX");

    if (acquired !== "OK") {
      return {
        success: false,
        error:
          "Uma solicitação de busca já está sendo preparada para este termo. Aguarde alguns segundos.",
      };
    }

    try {
      const data = await params.callback();
      return { success: true, data };
    } finally {
      const current = await redis.get(lockKey);
      if (current === lockToken) {
        await redis.del(lockKey);
      }
    }
  } catch (error) {
    logger.warn("Falha no lock de enfileiramento INPI. Seguindo sem lock.", {
      tenantId: params.tenantId,
      usuarioId: params.usuarioId,
      termoNormalizado: params.termoNormalizado,
      classeNice: classe,
      error,
    });

    const data = await params.callback();
    return { success: true, data };
  }
}

function buildCatalogFingerprint(input: {
  nome: string;
  classeNice?: string | null;
  processoNumero?: string | null;
  protocolo?: string | null;
}): string {
  const normalizedClass = normalizeNiceClassCode(input.classeNice) || "";

  return [
    normalizeTerm(input.nome),
    normalizedClass,
    (input.processoNumero || "").trim(),
    (input.protocolo || "").trim(),
  ].join("|");
}

function buildCatalogSearchCandidateKey(input: {
  nome: string;
  classeNice?: string | null;
  processoNumero?: string | null;
}): string {
  return [
    (input.processoNumero || "").trim() || "sem-processo",
    normalizeTerm(input.nome),
    normalizeNiceClassCode(input.classeNice) || "sem-classe",
  ].join("|");
}

function computeCatalogSearchCandidateQuality(input: {
  score: number;
  titular?: string | null;
  classeNice?: string | null;
  processoNumero?: string | null;
  status?: string | null;
}): number {
  return (
    input.score +
    (input.titular ? 5 : 0) +
    (normalizeNiceClassCode(input.classeNice) ? 2 : 0) +
    (input.processoNumero ? 1 : 0) +
    (input.status && input.status !== "Situação não informada" ? 1 : 0)
  );
}

function computeCollisionScore(
  normalizedDossieName: string,
  candidate: {
    nome: string;
    nomeNormalizado: string;
    classeNice: string | null;
  },
  classeNice?: string | null,
): number {
  const normalizedCandidate = candidate.nomeNormalizado || normalizeTerm(candidate.nome);
  const normalizedClasse = normalizeNiceClassCode(classeNice) || "";
  const candidateClasse = normalizeNiceClassCode(candidate.classeNice) || "";

  let score = 0;

  if (normalizedCandidate === normalizedDossieName) {
    score = 100;
  } else if (
    normalizedCandidate.startsWith(normalizedDossieName) ||
    normalizedDossieName.startsWith(normalizedCandidate)
  ) {
    score = 86;
  } else if (
    normalizedCandidate.includes(normalizedDossieName) ||
    normalizedDossieName.includes(normalizedCandidate)
  ) {
    score = 74;
  } else {
    const targetTokens = new Set(
      normalizedDossieName.split(" ").filter((token) => token.length >= 3),
    );
    const candidateTokens = new Set(
      normalizedCandidate.split(" ").filter((token) => token.length >= 3),
    );

    let intersection = 0;

    for (const token of targetTokens) {
      if (candidateTokens.has(token)) {
        intersection += 1;
      }
    }

    const tokenSimilarity =
      targetTokens.size > 0
        ? Math.round((intersection / targetTokens.size) * 100)
        : 0;

    if (tokenSimilarity >= 60) {
      score = 64;
    } else if (tokenSimilarity >= 40) {
      score = 52;
    } else if (intersection > 0) {
      score = 40;
    }
  }

  if (normalizedClasse && candidateClasse && normalizedClasse === candidateClasse) {
    score += 10;
  }

  return Math.min(score, 100);
}

function riscoFromScore(score: number): InpiRisco {
  if (score >= 92) {
    return InpiRisco.CRITICO;
  }

  if (score >= 80) {
    return InpiRisco.ALTO;
  }

  if (score >= 65) {
    return InpiRisco.MEDIO;
  }

  return InpiRisco.BAIXO;
}

function statusFromAnalysis(
  scoreMax: number,
  collisionCount: number,
): InpiDossieStatus {
  if (collisionCount === 0) {
    return InpiDossieStatus.VIAVEL;
  }

  if (scoreMax >= 80) {
    return InpiDossieStatus.RISCO_ALTO;
  }

  if (scoreMax >= 65) {
    return InpiDossieStatus.RISCO_MODERADO;
  }

  return InpiDossieStatus.EM_ANALISE;
}

async function requireInpiContext(mode: InpiAccessMode) {
  const session = await getSession();

  if (!session?.user?.tenantId || !session.user.id) {
    throw new Error("Não autenticado");
  }

  const user = session.user as {
    id: string;
    tenantId: string;
    role: UserRole;
  };

  if (user.role === UserRole.CLIENTE || user.role === UserRole.SUPER_ADMIN) {
    throw new Error("Acesso negado");
  }

  if (user.role === UserRole.ADMIN) {
    return user;
  }

  const canRead = await checkPermission("causas", "visualizar");

  if (!canRead) {
    throw new Error("Acesso negado");
  }

  if (mode === "write") {
    const canWrite = await checkPermission("causas", "editar");

    if (!canWrite) {
      throw new Error("Sem permissão de edição para INPI");
    }
  }

  if (mode === "sync") {
    throw new Error("Apenas administradores podem sincronizar catálogo");
  }

  return user;
}

async function findCollisionsForDossie(input: {
  normalizedName: string;
  classeNice?: string | null;
  max?: number;
}) {
  const tokens = input.normalizedName
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 3)
    .slice(0, 6);

  const candidates = await prisma.inpiCatalogMarca.findMany({
    where: {
      OR: [
        { nomeNormalizado: { contains: input.normalizedName, mode: "insensitive" } },
        ...tokens.map((token) => ({
          nomeNormalizado: { contains: token, mode: "insensitive" as const },
        })),
      ],
    },
    take: 300,
    orderBy: [{ updatedAt: "desc" }],
  });

  const scored = candidates
    .map((candidate) => ({
      candidate,
      score: computeCollisionScore(input.normalizedName, candidate, input.classeNice),
    }))
    .filter((item) => item.score >= 40)
    .sort((a, b) => b.score - a.score)
    .slice(0, input.max ?? 25);

  return scored;
}

async function runDossieAnalysis(dossieId: string, tenantId: string) {
  const dossie = await prisma.inpiDossie.findFirst({
    where: {
      id: dossieId,
      tenantId,
    },
    select: {
      id: true,
      nomeNormalizado: true,
      classeNice: true,
    },
  });

  if (!dossie) {
    throw new Error("Dossiê não encontrado");
  }

  const collisions = await findCollisionsForDossie({
    normalizedName: dossie.nomeNormalizado,
    classeNice: dossie.classeNice,
  });

  await prisma.$transaction([
    prisma.inpiDossieColisao.deleteMany({
      where: {
        tenantId,
        dossieId: dossie.id,
      },
    }),
    ...(collisions.length
      ? [
          prisma.inpiDossieColisao.createMany({
            data: collisions.map(({ candidate, score }) => ({
              tenantId,
              dossieId: dossie.id,
              marcaId: candidate.id,
              score,
              nivelRisco: riscoFromScore(score),
              justificativa:
                score >= 80
                  ? "Alta semelhança nominal e/ou classe coincidente."
                  : score >= 65
                    ? "Semelhança moderada detectada na base global."
                    : "Risco baixo com sobreposição parcial.",
            })),
            skipDuplicates: true,
          }),
        ]
      : []),
  ]);

  const scoreMax = collisions[0]?.score ?? 0;
  const riscoAtual = riscoFromScore(scoreMax);
  const status = statusFromAnalysis(scoreMax, collisions.length);
  const resumoAnalise =
    collisions.length === 0
      ? "Nenhuma colisão relevante encontrada na base global."
      : `${collisions.length} colisão(ões) encontradas. Maior score: ${scoreMax}.`;

  const updated = await prisma.inpiDossie.update({
    where: {
      id: dossie.id,
    },
    data: {
      riscoAtual,
      status,
      resumoAnalise,
    },
    include: {
      colisoes: {
        include: {
          marca: true,
        },
        orderBy: [{ score: "desc" }],
        take: 3,
      },
      _count: {
        select: {
          colisoes: true,
        },
      },
    },
  });

  await prisma.inpiDossieSnapshot.create({
    data: {
      tenantId,
      dossieId: dossie.id,
      status,
      riscoAtual,
      scoreMax,
      colisoesCount: collisions.length,
      resumoAnalise,
      payload:
        toAuditJson({
          topColisoes: collisions.slice(0, 25).map(({ candidate, score }) => ({
            marcaId: candidate.id,
            nome: candidate.nome,
            classeNice: candidate.classeNice,
            processoNumero: candidate.processoNumero,
            status: candidate.status,
            score,
          })),
        }) ?? undefined,
    },
  });

  return {
    id: updated.id,
    riscoAtual: updated.riscoAtual,
    status: updated.status,
    resumoAnalise: updated.resumoAnalise,
    colisoesCount: updated._count.colisoes,
    topColisoes: updated.colisoes.map((colisao) => ({
      id: colisao.id,
      score: colisao.score,
      nivelRisco: colisao.nivelRisco,
      marcaNome: colisao.marca.nome,
      marcaClasseNice: colisao.marca.classeNice,
      marcaStatus: colisao.marca.status,
    })),
  };
}

export async function syncInpiCatalogBase() {
  try {
    const ctx = await requireInpiContext("sync");

    let created = 0;
    let updated = 0;

    for (const item of INPI_DEFAULT_CATALOG) {
      const nome = item.nome.trim();
      const classeNice = normalizeNiceClassCode(item.classeNice);
      const processoNumero = item.processoNumero?.trim() || null;
      const protocolo = item.protocolo?.trim() || null;
      const fingerprint = buildCatalogFingerprint({
        nome,
        classeNice,
        processoNumero,
        protocolo,
      });

      const payload = {
        nome,
        nomeNormalizado: normalizeTerm(nome),
        classeNice,
        titular: item.titular?.trim() || null,
        processoNumero,
        protocolo,
        status: item.status?.trim() || "DESCONHECIDO",
        descricao: item.descricao?.trim() || null,
        fonte: "base_inicial_magiclawyer",
        fingerprint,
      };

      const existing = await prisma.inpiCatalogMarca.findUnique({
        where: { fingerprint },
        select: { id: true },
      });

      if (existing) {
        await prisma.inpiCatalogMarca.update({
          where: { id: existing.id },
          data: payload,
        });
        updated += 1;
      } else {
        await prisma.inpiCatalogMarca.create({
          data: payload,
        });
        created += 1;
      }
    }

    await logAudit({
      tenantId: ctx.tenantId,
      usuarioId: ctx.id,
      acao: "SINCRONIZAR",
      entidade: "INPI_CATALOGO_BASE",
      dados: toAuditJson({
        created,
        updated,
        origem: "base_inicial_magiclawyer",
      }),
    });

    revalidatePath("/inpi");

    return {
      success: true,
      created,
      updated,
      totalCatalogo: await prisma.inpiCatalogMarca.count(),
    };
  } catch (error) {
    logger.error("Erro ao sincronizar catálogo INPI base:", error);

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Erro ao sincronizar catálogo INPI base",
    };
  }
}

export async function getInpiDashboardStats(): Promise<{
  success: boolean;
  data?: InpiDashboardStats;
  error?: string;
  warning?: string;
}> {
  try {
    const ctx = await requireInpiContext("read");
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [
      catalogoGlobalTotal,
      dossiesTotal,
      dossiesViaveis,
      dossiesRiscoAltoOuCritico,
      dossiesProtocolados,
      buscasUltimas24h,
      ultimaEntrada,
    ] = await Promise.all([
      prisma.inpiCatalogMarca.count(),
      prisma.inpiDossie.count({ where: { tenantId: ctx.tenantId } }),
      prisma.inpiDossie.count({
        where: {
          tenantId: ctx.tenantId,
          status: InpiDossieStatus.VIAVEL,
        },
      }),
      prisma.inpiDossie.count({
        where: {
          tenantId: ctx.tenantId,
          riscoAtual: {
            in: [InpiRisco.ALTO, InpiRisco.CRITICO],
          },
        },
      }),
      prisma.inpiDossie.count({
        where: {
          tenantId: ctx.tenantId,
          status: InpiDossieStatus.PROTOCOLADO,
        },
      }),
      prisma.inpiBuscaLog.count({
        where: {
          tenantId: ctx.tenantId,
          createdAt: {
            gte: since,
          },
        },
      }),
      prisma.inpiCatalogMarca.findFirst({
        orderBy: [{ updatedAt: "desc" }],
        select: { updatedAt: true },
      }),
    ]);

    return {
      success: true,
      data: {
        catalogoGlobalTotal,
        dossiesTotal,
        dossiesViaveis,
        dossiesRiscoAltoOuCritico,
        dossiesProtocolados,
        buscasUltimas24h,
        ultimaAtualizacaoCatalogo: ultimaEntrada?.updatedAt ?? null,
      },
    };
  } catch (error) {
    if (isInpiSchemaMissingError(error)) {
      logger.warn("Schema INPI não aplicado no banco atual ao carregar métricas.");
      return {
        success: true,
        warning: INPI_SCHEMA_NOT_READY_MESSAGE,
        data: {
          catalogoGlobalTotal: 0,
          dossiesTotal: 0,
          dossiesViaveis: 0,
          dossiesRiscoAltoOuCritico: 0,
          dossiesProtocolados: 0,
          buscasUltimas24h: 0,
          ultimaAtualizacaoCatalogo: null,
        },
      };
    }

    logger.error("Erro ao carregar métricas INPI:", error);

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro ao carregar métricas INPI",
    };
  }
}

export async function listInpiBuscaHistory(
  params?: InpiBuscaHistoryParams,
): Promise<{
  success: boolean;
  data?: {
    items: InpiBuscaHistoryItem[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
  error?: string;
  warning?: string;
}> {
  try {
    const ctx = await requireInpiContext("read");
    const page = Math.max(1, params?.page ?? 1);
    const pageSize = Math.min(Math.max(6, params?.pageSize ?? 8), 50);
    const search = params?.search?.trim();
    const normalizedSearch = search ? normalizeTerm(search) : "";
    const source = params?.source?.trim();
    const processNumber = params?.processNumber?.trim();

    const baseWhere = {
      tenantId: ctx.tenantId,
      ...(source && source !== "all" ? { fonte: source } : {}),
      ...(search
        ? {
            OR: [
              { termo: { contains: search, mode: "insensitive" as const } },
              {
                termoNormalizado: {
                  contains: normalizedSearch,
                  mode: "insensitive" as const,
                },
              },
              { classeNice: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    let logs: Array<{
      id: string;
      termo: string;
      termoNormalizado: string;
      classeNice: string | null;
      totalEncontrado: number;
      fonte: string;
      userId: string | null;
      createdAt: Date;
    }> = [];
    let total = 0;
    let warning: string | undefined;

    if (processNumber) {
      const matchingMarcas = await prisma.inpiCatalogMarca.findMany({
        where: {
          processoNumero: {
            contains: processNumber,
            mode: "insensitive",
          },
        },
        select: {
          nome: true,
          nomeNormalizado: true,
          classeNice: true,
        },
        take: 300,
      });

      if (matchingMarcas.length === 0) {
        return {
          success: true,
          data: {
            items: [],
            total: 0,
            page,
            pageSize,
            totalPages: 1,
          },
        };
      }

      const HISTORY_SCAN_LIMIT = 1200;
      const pool = await prisma.inpiBuscaLog.findMany({
        where: baseWhere,
        orderBy: [{ createdAt: "desc" }],
        take: HISTORY_SCAN_LIMIT,
        select: {
          id: true,
          termo: true,
          termoNormalizado: true,
          classeNice: true,
          totalEncontrado: true,
          fonte: true,
          userId: true,
          createdAt: true,
        },
      });

      const filtered = pool.filter((entry) =>
        matchingMarcas.some((marca) => {
          const score = computeCollisionScore(
            entry.termoNormalizado || normalizeTerm(entry.termo),
            marca,
            entry.classeNice,
          );
          return score >= 40;
        }),
      );

      total = filtered.length;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const safePage = Math.min(page, totalPages);
      const start = (safePage - 1) * pageSize;
      const end = start + pageSize;
      logs = filtered.slice(start, end);

      if (pool.length >= HISTORY_SCAN_LIMIT) {
        warning =
          "Filtro por processo pode estar parcial por limite operacional. Refine termo/fonte para precisão total.";
      }

      const userIds = Array.from(
        new Set(
          logs
            .map((entry) => entry.userId)
            .filter((value): value is string => Boolean(value)),
        ),
      );

      const users = userIds.length
        ? await prisma.usuario.findMany({
            where: {
              tenantId: ctx.tenantId,
              id: { in: userIds },
            },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          })
        : [];

      const usersById = new Map(
        users.map((user) => {
          const fullName = [user.firstName, user.lastName]
            .map((value) => value?.trim())
            .filter(Boolean)
            .join(" ")
            .trim();
          return [
            user.id,
            { name: fullName || user.email || "Usuário", email: user.email },
          ];
        }),
      );

      return {
        success: true,
        data: {
          items: logs.map((entry) => {
            const actor = entry.userId ? usersById.get(entry.userId) : null;
            return {
              id: entry.id,
              termo: entry.termo,
              termoNormalizado: entry.termoNormalizado,
              classeNice: entry.classeNice,
              totalEncontrado: entry.totalEncontrado,
              fonte: entry.fonte,
              createdAt: entry.createdAt,
              userId: entry.userId,
              userName: actor?.name || "Sistema",
              userEmail: actor?.email || null,
            };
          }),
          total,
          page: Math.min(page, Math.max(1, Math.ceil(total / pageSize))),
          pageSize,
          totalPages: Math.max(1, Math.ceil(total / pageSize)),
        },
        ...(warning ? { warning } : {}),
      };
    }

    const [dbTotal, dbLogs] = await Promise.all([
      prisma.inpiBuscaLog.count({ where: baseWhere }),
      prisma.inpiBuscaLog.findMany({
        where: baseWhere,
        orderBy: [{ createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          termo: true,
          termoNormalizado: true,
          classeNice: true,
          totalEncontrado: true,
          fonte: true,
          userId: true,
          createdAt: true,
        },
      }),
    ]);
    total = dbTotal;
    logs = dbLogs;

    const userIds = Array.from(
      new Set(
        logs
          .map((entry) => entry.userId)
          .filter((value): value is string => Boolean(value)),
      ),
    );

    const users = userIds.length
      ? await prisma.usuario.findMany({
          where: {
            tenantId: ctx.tenantId,
            id: { in: userIds },
          },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        })
      : [];

    const usersById = new Map(
      users.map((user) => {
        const fullName = [user.firstName, user.lastName]
          .map((value) => value?.trim())
          .filter(Boolean)
          .join(" ")
          .trim();
        return [user.id, { name: fullName || user.email || "Usuário", email: user.email }];
      }),
    );

    return {
      success: true,
      data: {
        items: logs.map((entry) => {
          const actor = entry.userId ? usersById.get(entry.userId) : null;
          return {
            id: entry.id,
            termo: entry.termo,
            termoNormalizado: entry.termoNormalizado,
            classeNice: entry.classeNice,
            totalEncontrado: entry.totalEncontrado,
            fonte: entry.fonte,
            createdAt: entry.createdAt,
            userId: entry.userId,
            userName: actor?.name || "Sistema",
            userEmail: actor?.email || null,
          };
        }),
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  } catch (error) {
    if (isInpiSchemaMissingError(error)) {
      const page = Math.max(1, params?.page ?? 1);
      const pageSize = Math.min(Math.max(6, params?.pageSize ?? 8), 50);
      logger.warn("Schema INPI não aplicado no banco atual ao listar histórico.");
      return {
        success: true,
        warning: INPI_SCHEMA_NOT_READY_MESSAGE,
        data: {
          items: [],
          total: 0,
          page,
          pageSize,
          totalPages: 1,
        },
      };
    }

    logger.error("Erro ao listar histórico de buscas INPI:", error);

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Erro ao listar histórico de buscas INPI",
    };
  }
}

export async function startInpiCatalogBackgroundSearch(input: {
  termo: string;
  classeNice?: string;
  forceRefresh?: boolean;
}): Promise<{
  success: boolean;
  syncId?: string;
  status?: InpiCatalogSearchSyncStatus;
  alreadyRunning?: boolean;
  error?: string;
  retryAfterSeconds?: number;
}> {
  try {
    const ctx = await requireInpiContext("read");
    const termo = (input.termo || "").trim();
    const classeNice = normalizeNiceClassCode(input.classeNice);
    const forceRefresh = Boolean(input.forceRefresh);

    if (termo.length < 2) {
      return {
        success: false,
        error: "Informe ao menos 2 caracteres para pesquisar.",
      };
    }

    if (!isInpiCatalogSyncUsingVercelQueue()) {
      try {
        await initNotificationWorker();
      } catch (workerError) {
        logger.warn(
          "Falha ao inicializar workers antes do enqueue de busca INPI. Tentando seguir com fila existente.",
          workerError,
        );
      }
    }

    const termNormalized = normalizeTerm(termo);
    const coordinationKey = buildInpiCatalogGlobalCoordinationKey(
      termNormalized,
      classeNice,
    );
    const locked = await withInpiCatalogEnqueueLock({
      tenantId: ctx.tenantId,
      usuarioId: ctx.id,
      termoNormalizado: termNormalized,
      classeNice,
      callback: async () => {
        let latest = await getLatestInpiCatalogSyncState({
          tenantId: ctx.tenantId,
          usuarioId: ctx.id,
          termo,
          classeNice,
        });

        if (latest && !isInpiCatalogSyncTerminalStatus(latest.status)) {
          if (isInpiCatalogSyncStale(latest)) {
            latest = withInpiCatalogSyncStatus(latest, "FAILED", {
              phase: "FAILED",
              progressPct: Math.max(1, Math.min(99, latest.progressPct || 0)),
              error:
                "A busca anterior foi encerrada automaticamente por inatividade do worker.",
            });
            await saveInpiCatalogSyncState(latest);
          } else {
            return {
              syncId: latest.syncId,
              status: toPublicInpiCatalogSearchSyncStatus(latest),
              alreadyRunning: true,
            };
          }
        }

        if (latest && !forceRefresh) {
          const latestUpdatedAt = new Date(latest.updatedAt).getTime();
          const shouldBypassCooldown =
            latest.status === "CANCELED" ||
            latest.status === "COMPLETED" &&
              (latest.reachedLimit || latest.reachedTimeout);
          if (
            Number.isFinite(latestUpdatedAt) &&
            Date.now() - latestUpdatedAt < 60 * 1000 &&
            !shouldBypassCooldown
          ) {
            return {
              syncId: latest.syncId,
              status: toPublicInpiCatalogSearchSyncStatus(latest),
              alreadyRunning: false,
            };
          }
        }

        const redis = getRedisInstance();
        const globalFreshRaw = !forceRefresh
          ? await redis.get(buildInpiCatalogGlobalFreshKey(coordinationKey))
          : null;
        const globalFresh = parseInpiCatalogGlobalFreshPayload(globalFreshRaw);

        if (globalFresh?.status === "COMPLETED" && !forceRefresh) {
          const syncId = randomUUID();
          const initialState = buildInitialInpiCatalogSyncState({
            syncId,
            tenantId: ctx.tenantId,
            usuarioId: ctx.id,
            termo,
            classeNice,
          });
          const completedState = withInpiCatalogSyncStatus(
            initialState,
            "COMPLETED",
            {
              phase: "COMPLETED",
              coordinationKey,
              waitForGlobalSync: false,
              progressPct: 100,
              scannedRows: Math.max(0, globalFresh.scannedRows ?? 0),
              matchedRows: Math.max(0, globalFresh.matchedRows ?? 0),
              persistedRows: Math.max(0, globalFresh.persistedRows ?? 0),
              createdCount: Math.max(0, globalFresh.createdCount ?? 0),
              updatedCount: Math.max(0, globalFresh.updatedCount ?? 0),
              reachedLimit: Boolean(globalFresh.reachedLimit),
              reachedTimeout: Boolean(globalFresh.reachedTimeout),
              warning:
                globalFresh.warning ||
                "Catálogo reaproveitado de sincronização global recente. Nenhuma nova consulta oficial foi disparada.",
            },
          );
          await saveInpiCatalogSyncState(completedState);

          return {
            syncId,
            status: toPublicInpiCatalogSearchSyncStatus(completedState),
            alreadyRunning: false,
          };
        }

        const inflightKey = buildInpiCatalogGlobalInflightKey(coordinationKey);
        const inflightToken = `${ctx.tenantId}:${ctx.id}:${Date.now()}:${randomUUID()}`;
        const acquiredInflight = await redis.set(
          inflightKey,
          inflightToken,
          "EX",
          INPI_CATALOG_GLOBAL_INFLIGHT_TTL_SECONDS,
          "NX",
        );

        const syncId = randomUUID();
        const initialState = buildInitialInpiCatalogSyncState({
          syncId,
          tenantId: ctx.tenantId,
          usuarioId: ctx.id,
          termo,
          classeNice,
        });

        if (acquiredInflight !== "OK") {
          const waitingState = withInpiCatalogSyncStatus(
            initialState,
            "QUEUED",
            {
              phase: "QUEUED",
              coordinationKey,
              waitForGlobalSync: true,
              progressPct: 1,
              warning:
                "Existe uma sincronização global em execução para este termo. Este escritório aguardará o resultado compartilhado.",
            },
          );
          await saveInpiCatalogSyncState(waitingState);

          return {
            syncId,
            status: toPublicInpiCatalogSearchSyncStatus(waitingState),
            alreadyRunning: false,
          };
        }

        const rateLimit = await checkOfficialSearchRateLimit(ctx.tenantId);

        if (rateLimit.exceeded) {
          await redis.del(inflightKey);
          throw new Error(
            `RATE_LIMIT:${rateLimit.count}:${rateLimit.max}:${
              rateLimit.retryAfterSeconds || ""
            }`,
          );
        }

        await saveInpiCatalogSyncState(initialState);

        try {
          const queueJobId = isInpiCatalogSyncUsingVercelQueue()
            ? await enqueueInpiCatalogSyncVercelMessage({
                syncId,
                pageStart: 1,
                scannedRowsBase: 0,
                createdCountBase: 0,
                updatedCountBase: 0,
              })
            : await getInpiCatalogSyncQueue().addJob({
                syncId,
                tenantId: ctx.tenantId,
                usuarioId: ctx.id,
                termo,
                termoNormalizado: initialState.termoNormalizado,
                classeNice,
                coordinationKey,
                forceRefresh,
              });

          const queuedState: InpiCatalogSyncState = {
            ...initialState,
            coordinationKey,
            waitForGlobalSync: false,
            queueJobId,
            updatedAt: new Date().toISOString(),
          };
          await saveInpiCatalogSyncState(queuedState);

          return {
            syncId,
            status: toPublicInpiCatalogSearchSyncStatus(queuedState),
            alreadyRunning: false,
          };
        } catch (queueError) {
          await redis.del(inflightKey);
          throw queueError;
        }
      },
    });

    if (!locked.success) {
      return {
        success: false,
        error: locked.error,
      };
    }

    return {
      success: true,
      syncId: locked.data.syncId,
      status: locked.data.status,
      alreadyRunning: locked.data.alreadyRunning,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Erro ao iniciar busca em background do INPI.";

    if (message.startsWith("RATE_LIMIT:")) {
      const [, count, max, retryAfter] = message.split(":");
      const retryAfterSeconds = Number.parseInt(retryAfter || "", 10);
      return {
        success: false,
        error: `Limite de consultas oficiais por escritório atingido (${count}/${max} na última hora).`,
        retryAfterSeconds: Number.isFinite(retryAfterSeconds)
          ? retryAfterSeconds
          : undefined,
      };
    }

    logger.error("Erro ao iniciar busca em background do INPI:", error);

    return {
      success: false,
      error: message,
    };
  }
}

export async function cancelInpiCatalogBackgroundSearch(input: {
  syncId: string;
}): Promise<{
  success: boolean;
  status?: InpiCatalogSearchSyncStatus;
  error?: string;
}> {
  try {
    const ctx = await requireInpiContext("read");
    const syncId = (input.syncId || "").trim();

    if (!syncId) {
      return {
        success: false,
        error: "ID da busca não informado.",
      };
    }

    let state = await getInpiCatalogSyncState(syncId);

    if (!state) {
      return {
        success: false,
        error: "Busca não encontrada ou expirada.",
      };
    }

    if (state.tenantId !== ctx.tenantId || state.usuarioId !== ctx.id) {
      return {
        success: false,
        error: "Busca não pertence ao usuário atual.",
      };
    }

    if (isInpiCatalogSyncTerminalStatus(state.status)) {
      await clearInpiCatalogSyncCancellation(syncId);
      return {
        success: true,
        status: toPublicInpiCatalogSearchSyncStatus(state),
      };
    }

    const coordinationKey = state.coordinationKey;
    const wasWaitingGlobalSync = Boolean(state.waitForGlobalSync);
    let canceledImmediately = false;

    await requestInpiCatalogSyncCancellation(syncId);

    if (state.status === "QUEUED" && state.waitForGlobalSync) {
      canceledImmediately = true;
    } else if (
      state.status === "QUEUED" &&
      state.queueJobId &&
      !isInpiCatalogSyncUsingVercelQueue()
    ) {
      const queue = getInpiCatalogSyncQueue();
      const cancelAttempt = await queue.cancelJob(state.queueJobId);
      canceledImmediately = cancelAttempt.removed;
    } else if (state.status === "QUEUED" && isInpiCatalogSyncUsingVercelQueue()) {
      canceledImmediately = true;
    }

    if (canceledImmediately) {
      state = withInpiCatalogSyncStatus(state, "CANCELED", {
        phase: "CANCELED",
        waitForGlobalSync: false,
        progressPct: Math.max(1, Math.min(99, state.progressPct || 0)),
        warning: wasWaitingGlobalSync
          ? "A espera pela sincronização global foi cancelada pelo usuário."
          : "Busca oficial cancelada antes do início da varredura.",
        error: undefined,
      });
      await saveInpiCatalogSyncState(state);
      await clearInpiCatalogSyncCancellation(syncId);

      if (coordinationKey && !wasWaitingGlobalSync) {
        await publishInpiCatalogGlobalFreshState(coordinationKey, state);
        await releaseInpiCatalogGlobalInflight(coordinationKey);
      }
    } else {
      state = withInpiCatalogSyncProgress(state, {
        warning: "Cancelamento solicitado. Encerrando a busca oficial...",
      });
      await saveInpiCatalogSyncState(state);
    }

    await logAudit({
      tenantId: ctx.tenantId,
      usuarioId: ctx.id,
      acao: "CANCELAR",
      entidade: "INPI_CATALOGO_BUSCA",
      dados: toAuditJson({
        syncId: state.syncId,
        termo: state.termo,
        classeNice: state.classeNice,
        statusAntes: canceledImmediately ? "QUEUED" : state.status,
        cancelamentoImediato: canceledImmediately,
      }),
    });

    return {
      success: true,
      status: toPublicInpiCatalogSearchSyncStatus(state),
    };
  } catch (error) {
    logger.error("Erro ao cancelar busca em background do INPI:", error);

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Erro ao cancelar busca em background do INPI.",
    };
  }
}

export async function getInpiCatalogBackgroundSearchStatus(input: {
  syncId: string;
}): Promise<{
  success: boolean;
  status?: InpiCatalogSearchSyncStatus;
  error?: string;
}> {
  try {
    const ctx = await requireInpiContext("read");
    const syncId = (input.syncId || "").trim();

    if (!syncId) {
      return {
        success: false,
        error: "ID da busca não informado.",
      };
    }

    let state = await getInpiCatalogSyncState(syncId);

    if (!state) {
      return {
        success: false,
        error: "Busca não encontrada ou expirada.",
      };
    }

    if (state.tenantId !== ctx.tenantId || state.usuarioId !== ctx.id) {
      return {
        success: false,
        error: "Busca não pertence ao usuário atual.",
      };
    }

    state = await refreshReadableInpiCatalogSyncState(state);

    return {
      success: true,
      status: toPublicInpiCatalogSearchSyncStatus(state),
    };
  } catch (error) {
    logger.error("Erro ao obter status da busca em background do INPI:", error);

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Erro ao obter status da busca em background do INPI.",
    };
  }
}

export async function getInpiLatestCatalogBackgroundSearchStatus(): Promise<{
  success: boolean;
  status?: InpiCatalogSearchSyncStatus;
  error?: string;
}> {
  try {
    const ctx = await requireInpiContext("read");
    const [latest] = await listInpiCatalogSyncStates({
      tenantId: ctx.tenantId,
      usuarioId: ctx.id,
      limit: 1,
    });

    if (!latest) {
      return {
        success: true,
        status: undefined,
      };
    }

    const resolved = await refreshReadableInpiCatalogSyncState(latest);

    return {
      success: true,
      status: toPublicInpiCatalogSearchSyncStatus(resolved),
    };
  } catch (error) {
    logger.error("Erro ao obter status mais recente de busca INPI:", error);

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Erro ao obter status mais recente de busca INPI.",
    };
  }
}

export async function getInpiBuscaHistoryDetails(input: {
  logId: string;
  processNumber?: string;
  page?: number;
  pageSize?: number;
}): Promise<{
  success: boolean;
  data?: InpiBuscaHistoryDetailsData;
  error?: string;
}> {
  try {
    const ctx = await requireInpiContext("read");
    const logId = (input.logId || "").trim();
    const processNumber = input.processNumber?.trim();
    const page = Math.max(1, input.page ?? 1);
    const pageSize = Math.min(Math.max(6, input.pageSize ?? 12), 50);

    if (!logId) {
      return {
        success: false,
        error: "Busca histórica não informada.",
      };
    }

    const log = await prisma.inpiBuscaLog.findFirst({
      where: {
        id: logId,
        tenantId: ctx.tenantId,
      },
      select: {
        id: true,
        termo: true,
        termoNormalizado: true,
        classeNice: true,
        totalEncontrado: true,
        fonte: true,
        userId: true,
        createdAt: true,
      },
    });

    if (!log) {
      return {
        success: false,
        error: "Registro de histórico não encontrado para este escritório.",
      };
    }

    let actor: { name: string; email: string | null } | null = null;
    if (log.userId) {
      const user = await prisma.usuario.findFirst({
        where: {
          id: log.userId,
          tenantId: ctx.tenantId,
        },
        select: {
          firstName: true,
          lastName: true,
          email: true,
        },
      });

      if (user) {
        const fullName = [user.firstName, user.lastName]
          .map((value) => value?.trim())
          .filter(Boolean)
          .join(" ")
          .trim();
        actor = {
          name: fullName || user.email || "Usuário",
          email: user.email,
        };
      }
    }

    const termo = log.termo;
    const normalized = log.termoNormalizado || normalizeTerm(termo);
    const classe = normalizeNiceClassCode(log.classeNice) || undefined;
    const classeVariants = getNiceClassVariants(classe);
    const tokens = normalized
      .split(" ")
      .map((token) => token.trim())
      .filter((token) => token.length >= 3)
      .slice(0, 6);

    const maxCandidates = 8_000;
    const marcas = await prisma.inpiCatalogMarca.findMany({
      where: {
        ...(processNumber
          ? {
              processoNumero: {
                contains: processNumber,
                mode: "insensitive" as const,
              },
            }
          : {}),
        ...(classeVariants.length ? { classeNice: { in: classeVariants } } : {}),
        OR: [
          { nomeNormalizado: { contains: normalized, mode: "insensitive" } },
          { nome: { contains: termo, mode: "insensitive" } },
          { processoNumero: { contains: termo, mode: "insensitive" } },
          ...tokens.map((token) => ({
            nomeNormalizado: { contains: token, mode: "insensitive" as const },
          })),
        ],
      },
      orderBy: [{ updatedAt: "desc" }],
      take: maxCandidates,
    });

    const scoredMap = new Map<string, InpiCatalogSearchItem>();

    for (const marca of marcas) {
      const score = computeCollisionScore(normalized, marca, classe);

      if (score < 40) {
        continue;
      }

      const candidate: InpiCatalogSearchItem = {
        id: marca.id,
        nome: marca.nome,
        classeNice: marca.classeNice,
        titular: marca.titular,
        processoNumero: marca.processoNumero,
        protocolo: marca.protocolo,
        status: marca.status,
        fonte: marca.fonte,
        score,
      };

      const key = buildCatalogSearchCandidateKey({
        nome: candidate.nome,
        classeNice: candidate.classeNice,
        processoNumero: candidate.processoNumero,
      });
      const previous = scoredMap.get(key);

      if (!previous) {
        scoredMap.set(key, candidate);
        continue;
      }

      const previousQuality = computeCatalogSearchCandidateQuality(previous);
      const nextQuality = computeCatalogSearchCandidateQuality(candidate);

      if (nextQuality > previousQuality) {
        scoredMap.set(key, candidate);
      }
    }

    const scored = Array.from(scoredMap.values()).sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      return (a.processoNumero || "").localeCompare(b.processoNumero || "");
    });

    const total = scored.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * pageSize;
    const end = start + pageSize;

    return {
      success: true,
      data: {
        log: {
          id: log.id,
          termo: log.termo,
          termoNormalizado: log.termoNormalizado,
          classeNice: log.classeNice,
          totalEncontrado: log.totalEncontrado,
          fonte: log.fonte,
          createdAt: log.createdAt,
          userId: log.userId,
          userName: actor?.name || "Sistema",
          userEmail: actor?.email || null,
        },
        items: scored.slice(start, end),
        total,
        page: safePage,
        pageSize,
        totalPages,
        ...(marcas.length >= maxCandidates
          ? {
              warning:
                "Resultado detalhado atingiu limite operacional de consulta local. Use 'Pesquisar novamente' para refinar ou atualizar a base.",
            }
          : {}),
      },
    };
  } catch (error) {
    logger.error("Erro ao carregar detalhes do histórico INPI:", error);

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Erro ao carregar detalhes do histórico INPI",
    };
  }
}

export async function listInpiNiceClasses(): Promise<{
  success: boolean;
  data?: InpiNiceClassItem[];
  error?: string;
  warning?: string;
}> {
  try {
    const ctx = await requireInpiContext("read");
    const [usageByDossie, usageBySearch] = await prisma.$transaction([
      prisma.inpiDossie.groupBy({
        by: ["classeNice"],
        where: {
          tenantId: ctx.tenantId,
          classeNice: {
            not: null,
          },
        },
        orderBy: {
          classeNice: "asc",
        },
        _count: {
          classeNice: true,
        },
      }),
      prisma.inpiBuscaLog.groupBy({
        by: ["classeNice"],
        where: {
          tenantId: ctx.tenantId,
          classeNice: {
            not: null,
          },
        },
        orderBy: {
          classeNice: "asc",
        },
        _count: {
          classeNice: true,
        },
      }),
    ]);

    const usageMap = new Map<
      string,
      {
        dossies: number;
        searches: number;
      }
    >();

    for (const row of usageByDossie) {
      const code = normalizeNiceClassCode(row.classeNice);

      if (!code) {
        continue;
      }

      const dossieCount =
        typeof row._count === "object" &&
        row._count !== null &&
        "classeNice" in row._count &&
        typeof row._count.classeNice === "number"
          ? row._count.classeNice
          : 0;
      const current = usageMap.get(code) || { dossies: 0, searches: 0 };
      current.dossies += dossieCount;
      usageMap.set(code, current);
    }

    for (const row of usageBySearch) {
      const code = normalizeNiceClassCode(row.classeNice);

      if (!code) {
        continue;
      }

      const searchCount =
        typeof row._count === "object" &&
        row._count !== null &&
        "classeNice" in row._count &&
        typeof row._count.classeNice === "number"
          ? row._count.classeNice
          : 0;
      const current = usageMap.get(code) || { dossies: 0, searches: 0 };
      current.searches += searchCount;
      usageMap.set(code, current);
    }

    return {
      success: true,
      data: NICE_CLASS_CATALOG.map((item) => {
        const usage = usageMap.get(item.code) || { dossies: 0, searches: 0 };

        return {
          code: item.code,
          codeDisplay: formatNiceClassCode(item.code),
          heading: item.heading,
          description: item.description,
          type: item.type,
          usageDossies: usage.dossies,
          usageSearches: usage.searches,
          usageTotal: usage.dossies + usage.searches,
        };
      }),
    };
  } catch (error) {
    if (isInpiSchemaMissingError(error)) {
      logger.warn("Schema INPI não aplicado no banco atual ao listar classes NICE.");
      return {
        success: true,
        warning: INPI_SCHEMA_NOT_READY_MESSAGE,
        data: NICE_CLASS_CATALOG.map((item) => ({
          code: item.code,
          codeDisplay: formatNiceClassCode(item.code),
          heading: item.heading,
          description: item.description,
          type: item.type,
          usageDossies: 0,
          usageSearches: 0,
          usageTotal: 0,
        })),
      };
    }

    logger.error("Erro ao listar classes NICE:", error);

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro ao listar classes NICE",
    };
  }
}

export async function listInpiDossies(params?: InpiDossieListParams): Promise<{
  success: boolean;
  data?: {
    items: InpiDossieItem[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
  error?: string;
  warning?: string;
}> {
  try {
    const ctx = await requireInpiContext("read");
    const page = Math.max(1, params?.page ?? 1);
    const pageSize = Math.min(Math.max(6, params?.pageSize ?? 12), 50);
    const search = params?.search?.trim();
    const normalizedSearch = search ? normalizeTerm(search) : "";

    const where = {
      tenantId: ctx.tenantId,
      ...(search
        ? {
            OR: [
              { nomePretendido: { contains: search, mode: "insensitive" as const } },
              {
                nomeNormalizado: {
                  contains: normalizedSearch,
                  mode: "insensitive" as const,
                },
              },
            ],
          }
        : {}),
      ...(params?.status && params.status !== "all" ? { status: params.status } : {}),
      ...(params?.risco && params.risco !== "all" ? { riscoAtual: params.risco } : {}),
    };

    const [total, dossies] = await Promise.all([
      prisma.inpiDossie.count({ where }),
      prisma.inpiDossie.findMany({
        where,
        include: {
          colisoes: {
            include: {
              marca: true,
            },
            orderBy: [{ score: "desc" }],
            take: 3,
          },
          _count: {
            select: {
              colisoes: true,
            },
          },
        },
        orderBy: [{ updatedAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      success: true,
      data: {
        items: dossies.map((dossie) => ({
          id: dossie.id,
          nomePretendido: dossie.nomePretendido,
          classeNice: dossie.classeNice,
          segmento: dossie.segmento,
          status: dossie.status,
          riscoAtual: dossie.riscoAtual,
          observacoes: dossie.observacoes,
          resumoAnalise: dossie.resumoAnalise,
          createdAt: dossie.createdAt,
          updatedAt: dossie.updatedAt,
          colisoesCount: dossie._count.colisoes,
          topColisoes: dossie.colisoes.map((colisao) => ({
            id: colisao.id,
            score: colisao.score,
            nivelRisco: colisao.nivelRisco,
            marcaNome: colisao.marca.nome,
            marcaClasseNice: colisao.marca.classeNice,
            marcaStatus: colisao.marca.status,
          })),
        })),
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  } catch (error) {
    if (isInpiSchemaMissingError(error)) {
      const page = Math.max(1, params?.page ?? 1);
      const pageSize = Math.min(Math.max(6, params?.pageSize ?? 12), 50);
      logger.warn("Schema INPI não aplicado no banco atual ao listar dossiês.");
      return {
        success: true,
        warning: INPI_SCHEMA_NOT_READY_MESSAGE,
        data: {
          items: [],
          total: 0,
          page,
          pageSize,
          totalPages: 1,
        },
      };
    }

    logger.error("Erro ao listar dossiês INPI:", error);

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro ao listar dossiês INPI",
    };
  }
}

export async function listInpiDossieColisoes(params: {
  dossieId: string;
  page?: number;
  pageSize?: number;
  search?: string;
}): Promise<{
  success: boolean;
  data?: {
    items: InpiDossieColisaoDetalheItem[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
  error?: string;
}> {
  try {
    const ctx = await requireInpiContext("read");
    const dossieId = (params.dossieId || "").trim();
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(Math.max(6, params.pageSize ?? 12), 50);
    const search = params.search?.trim();
    const normalizedSearch = search ? normalizeTerm(search) : "";

    if (!dossieId) {
      return {
        success: false,
        error: "Dossiê não informado.",
      };
    }

    const dossieExists = await prisma.inpiDossie.findFirst({
      where: {
        id: dossieId,
        tenantId: ctx.tenantId,
      },
      select: {
        id: true,
      },
    });

    if (!dossieExists) {
      return {
        success: false,
        error: "Dossiê não encontrado no escopo do escritório.",
      };
    }

    const where = {
      tenantId: ctx.tenantId,
      dossieId,
      ...(search
        ? {
            OR: [
              { marca: { nome: { contains: search, mode: "insensitive" as const } } },
              {
                marca: {
                  processoNumero: {
                    contains: search,
                    mode: "insensitive" as const,
                  },
                },
              },
              {
                marca: {
                  titular: {
                    contains: search,
                    mode: "insensitive" as const,
                  },
                },
              },
              {
                marca: {
                  nomeNormalizado: {
                    contains: normalizedSearch,
                    mode: "insensitive" as const,
                  },
                },
              },
            ],
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      prisma.inpiDossieColisao.count({ where }),
      prisma.inpiDossieColisao.findMany({
        where,
        include: {
          marca: {
            select: {
              nome: true,
              classeNice: true,
              status: true,
              processoNumero: true,
              titular: true,
            },
          },
        },
        orderBy: [{ score: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      success: true,
      data: {
        items: rows.map((row) => ({
          id: row.id,
          score: row.score,
          nivelRisco: row.nivelRisco,
          justificativa: row.justificativa,
          marcaNome: row.marca.nome,
          marcaClasseNice: row.marca.classeNice,
          marcaStatus: row.marca.status,
          marcaProcessoNumero: row.marca.processoNumero,
          marcaTitular: row.marca.titular,
        })),
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  } catch (error) {
    logger.error("Erro ao listar colisões do dossiê INPI:", error);

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Erro ao listar colisões do dossiê INPI",
    };
  }
}

export async function searchInpiCatalog(
  params: InpiCatalogSearchParams,
): Promise<{
  success: boolean;
  data?: InpiCatalogSearchItem[];
  error?: string;
  warning?: string;
}> {
  try {
    const ctx = await requireInpiContext("read");
    const termo = params.termo?.trim() || "";

    if (termo.length < 2) {
      return {
        success: false,
        error: "Informe ao menos 2 caracteres para pesquisar",
      };
    }

    const normalized = normalizeTerm(termo);
    const classe = normalizeNiceClassCode(params.classeNice) || undefined;
    const classeVariants = getNiceClassVariants(classe);
    const limit = Math.min(Math.max(params.limit ?? 20, 5), 100);

    const tokens = normalized
      .split(" ")
      .map((token) => token.trim())
      .filter((token) => token.length >= 3)
      .slice(0, 6);

    const marcas = await prisma.inpiCatalogMarca.findMany({
      where: {
        ...(classeVariants.length ? { classeNice: { in: classeVariants } } : {}),
        OR: [
          { nomeNormalizado: { contains: normalized, mode: "insensitive" } },
          { nome: { contains: termo, mode: "insensitive" } },
          { processoNumero: { contains: termo, mode: "insensitive" } },
          ...tokens.map((token) => ({
            nomeNormalizado: { contains: token, mode: "insensitive" as const },
          })),
        ],
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 300,
    });

    const scoredMap = new Map<string, InpiCatalogSearchItem>();

    for (const marca of marcas) {
      const score = computeCollisionScore(normalized, marca, classe);

      if (score < 40) {
        continue;
      }

      const candidate: InpiCatalogSearchItem = {
        id: marca.id,
        nome: marca.nome,
        classeNice: marca.classeNice,
        titular: marca.titular,
        processoNumero: marca.processoNumero,
        protocolo: marca.protocolo,
        status: marca.status,
        fonte: marca.fonte,
        score,
      };

      const key = buildCatalogSearchCandidateKey({
        nome: candidate.nome,
        classeNice: candidate.classeNice,
        processoNumero: candidate.processoNumero,
      });
      const previous = scoredMap.get(key);

      if (!previous) {
        scoredMap.set(key, candidate);
        continue;
      }

      const previousQuality = computeCatalogSearchCandidateQuality(previous);
      const nextQuality = computeCatalogSearchCandidateQuality(candidate);

      if (nextQuality > previousQuality) {
        scoredMap.set(key, candidate);
      }
    }

    const scoredAll = Array.from(scoredMap.values()).sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      return (a.processoNumero || "").localeCompare(b.processoNumero || "");
    });
    const scored = scoredAll.slice(0, limit);

    if (params.recordHistory !== false) {
      await prisma.inpiBuscaLog.create({
        data: {
          tenantId: ctx.tenantId,
          dossieId: params.linkedDossieId || null,
          termo,
          termoNormalizado: normalized,
          classeNice: classe || null,
          totalEncontrado: scoredAll.length,
          fonte: "catalogo_global",
          userId: ctx.id,
        },
      });
    }

    revalidatePath("/inpi");

    return {
      success: true,
      data: scored,
      ...(scored.length < Math.min(limit, 8) && termo.length >= 4
        ? {
            warning:
              "Resultado local exibido. Execute a busca completa em background para varrer toda a base oficial.",
          }
        : {}),
    };
  } catch (error) {
    logger.error("Erro ao buscar catálogo INPI:", error);

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro ao buscar catálogo INPI",
    };
  }
}

export async function createInpiDossie(input: {
  nomePretendido: string;
  classeNice?: string;
  segmento?: string;
  observacoes?: string;
}) {
  try {
    const ctx = await requireInpiContext("write");
    const nomePretendido = input.nomePretendido?.trim();

    if (!nomePretendido) {
      return { success: false, error: "Informe o nome pretendido" };
    }

    const classeNice = normalizeNiceClassCode(input.classeNice);
    const nomeNormalizado = normalizeTerm(nomePretendido);

    const exists = await prisma.inpiDossie.findFirst({
      where: {
        tenantId: ctx.tenantId,
        nomeNormalizado,
        classeNice,
      },
      select: { id: true },
    });

    if (exists) {
      return {
        success: false,
        error: "Já existe dossiê para este nome e classe no seu escritório",
      };
    }

    const dossie = await prisma.inpiDossie.create({
      data: {
        tenantId: ctx.tenantId,
        nomePretendido,
        nomeNormalizado,
        classeNice,
        segmento: input.segmento?.trim() || null,
        observacoes: input.observacoes?.trim() || null,
        criadoPorId: ctx.id,
        responsavelId: ctx.id,
      },
    });

    const analise = await runDossieAnalysis(dossie.id, ctx.tenantId);

    await logAudit({
      tenantId: ctx.tenantId,
      usuarioId: ctx.id,
      acao: "CRIAR",
      entidade: "INPI_DOSSIE",
      entidadeId: dossie.id,
      dados: toAuditJson({
        nomePretendido: dossie.nomePretendido,
        classeNice: dossie.classeNice,
        status: analise.status,
        riscoAtual: analise.riscoAtual,
        colisoesCount: analise.colisoesCount,
      }),
    });

    revalidatePath("/inpi");

    return {
      success: true,
      data: {
        dossieId: dossie.id,
        analise,
      },
    };
  } catch (error) {
    logger.error("Erro ao criar dossiê INPI:", error);

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro ao criar dossiê INPI",
    };
  }
}

export async function reanalyzeInpiDossie(dossieId: string) {
  try {
    const ctx = await requireInpiContext("write");

    const analysis = await runDossieAnalysis(dossieId, ctx.tenantId);

    await logAudit({
      tenantId: ctx.tenantId,
      usuarioId: ctx.id,
      acao: "REANALISAR",
      entidade: "INPI_DOSSIE",
      entidadeId: dossieId,
      dados: toAuditJson({
        status: analysis.status,
        riscoAtual: analysis.riscoAtual,
        colisoesCount: analysis.colisoesCount,
      }),
    });

    revalidatePath("/inpi");

    return {
      success: true,
      data: analysis,
    };
  } catch (error) {
    logger.error("Erro ao reprocessar análise INPI:", error);

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Erro ao reprocessar análise do dossiê",
    };
  }
}

export async function updateInpiDossieStatus(input: {
  dossieId: string;
  status: InpiDossieStatus;
  observacoes?: string;
  classeNice?: string;
}) {
  try {
    const ctx = await requireInpiContext("write");
    const normalizedClasseNice = normalizeNiceClassCode(input.classeNice);
    const nextObservacoes = input.observacoes?.trim() || null;
    const current = await prisma.inpiDossie.findFirst({
      where: {
        id: input.dossieId,
        tenantId: ctx.tenantId,
      },
      select: {
        id: true,
        nomeNormalizado: true,
        status: true,
        observacoes: true,
        classeNice: true,
      },
    });

    if (!current) {
      return {
        success: false,
        error: "Dossiê não encontrado no escopo do seu escritório",
      };
    }

    const classeChanged =
      (current.classeNice || null) !== (normalizedClasseNice || null);
    const statusChanged = current.status !== input.status;
    const observacoesChanged = (current.observacoes || null) !== nextObservacoes;

    if (classeChanged && normalizedClasseNice) {
      const duplicate = await prisma.inpiDossie.findFirst({
        where: {
          tenantId: ctx.tenantId,
          id: {
            not: current.id,
          },
          nomeNormalizado: current.nomeNormalizado,
          classeNice: normalizedClasseNice,
        },
        select: {
          id: true,
        },
      });

      if (duplicate) {
        return {
          success: false,
          error:
            "Já existe dossiê com este nome e classe NICE no seu escritório.",
        };
      }
    }

    await prisma.inpiDossie.update({
      where: {
        id: current.id,
      },
      data: {
        status: input.status,
        observacoes: nextObservacoes,
        classeNice: normalizedClasseNice,
      },
    });

    let analysis:
      | Awaited<ReturnType<typeof runDossieAnalysis>>
      | undefined;

    if (classeChanged) {
      analysis = await runDossieAnalysis(current.id, ctx.tenantId);

      if (analysis.status !== input.status) {
        await prisma.inpiDossie.update({
          where: {
            id: current.id,
          },
          data: {
            status: input.status,
          },
        });
        analysis = {
          ...analysis,
          status: input.status,
        };
      }
    }

    const changedFields = [
      ...(statusChanged ? ["status"] : []),
      ...(observacoesChanged ? ["observacoes"] : []),
      ...(classeChanged ? ["classeNice"] : []),
    ];

    await logAudit({
      tenantId: ctx.tenantId,
      usuarioId: ctx.id,
      acao: "ATUALIZAR_STATUS",
      entidade: "INPI_DOSSIE",
      entidadeId: current.id,
      previousValues: toAuditJson({
        status: current.status,
        observacoes: current.observacoes,
        classeNice: current.classeNice,
      }),
      dados: toAuditJson({
        status: input.status,
        observacoes: nextObservacoes,
        classeNice: normalizedClasseNice,
        reanaliseAutomatica: classeChanged,
      }),
      changedFields,
    });

    revalidatePath("/inpi");

    return {
      success: true,
      data: {
        classeNice: normalizedClasseNice || null,
        status: input.status,
        observacoes: nextObservacoes,
        reanalyzed: classeChanged,
        analysis,
      },
    };
  } catch (error) {
    logger.error("Erro ao atualizar status do dossiê INPI:", error);

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Erro ao atualizar status do dossiê",
    };
  }
}
