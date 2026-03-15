"use server";

import { getSession } from "@/app/lib/auth";
import { logAudit, toAuditJson } from "@/app/lib/audit/log";
import { checkPermission } from "@/app/actions/equipe";
import { revalidatePath } from "next/cache";
import prisma from "@/app/lib/prisma";
import logger from "@/lib/logger";
import { Prisma } from "@/generated/prisma";
import { getRedisInstance } from "@/app/lib/notifications/redis-singleton";
import { randomUUID } from "node:crypto";

type CausaStatusFilter = "all" | "ativas" | "arquivadas";
type CausaOrigemFilter = "all" | "oficiais" | "internas";

const MAX_CAUSAS_PAGE_SIZE = 100;
const CAUSA_OFFICIAL_TIMEOUT_MS = 8000;
const CAUSA_SYNC_AUDIT_SAMPLE_LIMIT = 25;
const MAX_CODIGO_CNJ_LENGTH = 64;
const MAX_DESCRICAO_CAUSA_LENGTH = 4000;
const CAUSA_SYNC_LOCK_KEY = "causas:sync:oficial:lock";
const CAUSA_SYNC_LOCK_TTL_SECONDS = 600;
const CAUSA_SYNC_COOLDOWN_SECONDS = 45;
const CAUSA_SYNC_RATE_LIMIT_SECONDS = 30;

type OfficialCausaRow = {
  nome: string;
  codigoCnj?: string | null;
  descricao?: string | null;
};

type OfficialCausaFetchResult = {
  causas: OfficialCausaRow[];
  source: string;
  requestedUrl: string;
  requestedCount: number;
  requestedCountFromSource: number;
  usedFallback: boolean;
  fallbackReason?: string;
};

type SyncThrottleCode = "SYNC_ALREADY_RUNNING" | "SYNC_COOLDOWN_BLOCKED";

type SyncThrottleResult =
  | {
      ok: true;
      release: () => Promise<void>;
      redisAvailable: boolean;
      cooldownKey: string;
    }
  | {
      ok: false;
      error: string;
      errorCode: SyncThrottleCode;
      retryAfterSeconds?: number;
      redisAvailable: boolean;
    };

function normalizeRetryAfterSeconds(
  ttlSeconds: number,
  maxSeconds: number,
): number | undefined {
  if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
    return undefined;
  }

  return Math.min(Math.max(1, Math.ceil(ttlSeconds)), maxSeconds);
}

function getRedisSyncGuardKeys(userId?: string | null) {
  const safeUserId =
    (typeof userId === "string" && userId.trim()) || "anonymous";

  return {
    lockKey: CAUSA_SYNC_LOCK_KEY,
    userCooldownKey: `causas:sync:oficial:user:${safeUserId}:cooldown`,
  };
}

async function acquireSyncCauseGuard(
  userId?: string | null,
): Promise<SyncThrottleResult> {
  let redis;

  try {
    redis = getRedisInstance();
  } catch (error) {
    logger.warn(
      "Redis indisponível para lock de sincronização de causas:",
      error,
    );

    return {
      ok: true,
      release: async () => {},
      redisAvailable: false,
      cooldownKey: "sync:causas:local",
    };
  }

  const { lockKey, userCooldownKey } = getRedisSyncGuardKeys(userId);

  try {
    const cooldownTtl = await redis.ttl(userCooldownKey);
    if (cooldownTtl > 0) {
      return {
        ok: false,
        error: "Aguardando intervalo de segurança. Não sincronize em excesso.",
        errorCode: "SYNC_COOLDOWN_BLOCKED",
        retryAfterSeconds: normalizeRetryAfterSeconds(
          cooldownTtl,
          CAUSA_SYNC_RATE_LIMIT_SECONDS,
        ),
        redisAvailable: true,
      };
    }

    const lockToken = `${Date.now()}-${randomUUID()}`;
    const lockResult = await redis.set(
      lockKey,
      lockToken,
      "EX",
      CAUSA_SYNC_LOCK_TTL_SECONDS,
      "NX",
    );

    if (lockResult !== "OK") {
      const ttl = await redis.ttl(lockKey);

      return {
        ok: false,
        error:
          "Sincronização de causas já está em andamento. Aguarde concluir.",
        errorCode: "SYNC_ALREADY_RUNNING",
        retryAfterSeconds: normalizeRetryAfterSeconds(
          Number(ttl) || 0,
          CAUSA_SYNC_LOCK_TTL_SECONDS,
        ),
        redisAvailable: true,
      };
    }

    return {
      ok: true,
      redisAvailable: true,
      cooldownKey: userCooldownKey,
      release: async () => {
        const current = await redis.get(lockKey);
        if (current === lockToken) {
          await redis.del(lockKey);
        }
      },
    };
  } catch (error) {
    logger.warn(
      "Falha no controle de sincronização de causas com Redis:",
      error,
    );

    return {
      ok: true,
      release: async () => {},
      redisAvailable: false,
      cooldownKey: userCooldownKey,
    };
  }
}

async function registerSyncCooldown(
  redisAvailable: boolean,
  cooldownKey: string,
  userId?: string | null,
) {
  if (!redisAvailable || !userId) {
    return;
  }

  try {
    const redis = getRedisInstance();
    await redis.set(
      cooldownKey,
      String(Date.now()),
      "EX",
      CAUSA_SYNC_COOLDOWN_SECONDS,
    );
  } catch (error) {
    logger.warn(
      "Falha ao registrar cooldown de sincronização de causas:",
      error,
    );
  }
}

const OFFICIAL_CAUSA_FALLBACK: OfficialCausaRow[] = [
  {
    nome: "Ação de Conhecimento",
    codigoCnj: "00101",
    descricao: "Ações em geral de conhecimento no processo civil.",
  },
  {
    nome: "Ação de Execução",
    codigoCnj: "00200",
    descricao: "Ações de execução e cumprimento de sentença.",
  },
  {
    nome: "Embargos à Execução",
    codigoCnj: "00201",
    descricao: "Defesa em fase executiva com oposição de embargos.",
  },
  {
    nome: "Mandado de Segurança",
    codigoCnj: "00300",
    descricao: "Remédio constitucional para ilegalidade ou abuso de poder.",
  },
  {
    nome: "Ação de Família",
    codigoCnj: "00400",
    descricao: "Pedidos relacionados a família e sucessões.",
  },
  {
    nome: "Pensão Alimentícia",
    codigoCnj: "00415",
    descricao: "Ações de fixação, revisão ou cobrança de alimentos.",
  },
  {
    nome: "Inventário",
    codigoCnj: "00500",
    descricao: "Procedimentos de partilha e administração de sucessão.",
  },
  {
    nome: "Ação Penal",
    codigoCnj: "00600",
    descricao: "Processos criminais e medidas conexas.",
  },
  {
    nome: "Busca e Apreensão",
    codigoCnj: "00701",
    descricao: "Ação de busca e apreensão de bens móveis.",
  },
  {
    nome: "Ação Trabalhista",
    codigoCnj: "00800",
    descricao: "Reclamações e execuções no âmbito do trabalho.",
  },
];

function normalizeOfficialFeedSource(): string | null {
  const rawUrl = process.env.CAUSAS_OFICIAIS_URL?.trim();
  const defaultLocalSource = "/api/causas-oficiais/cnj";

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  let resolvedBase: URL | null = null;
  if (baseUrl) {
    try {
      resolvedBase = new URL(baseUrl);
    } catch (error) {
      logger.warn("Falha ao resolver base para CAUSAS_OFICIAIS_URL:", error);
      resolvedBase = null;
    }
  } else {
    try {
      resolvedBase = new URL("http://localhost:9192");
    } catch (error) {
      logger.warn(
        "Falha ao resolver base local para CAUSAS_OFICIAIS_URL.",
        error,
      );
      resolvedBase = null;
    }
  }

  if (!rawUrl) {
    return resolvedBase
      ? new URL(defaultLocalSource, resolvedBase).toString()
      : defaultLocalSource;
  }

  const isAbsolute = /^https?:\/\//i.test(rawUrl);
  if (isAbsolute) {
    return rawUrl;
  }

  const relativeBaseUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    process.env.VERCEL_URL;

  if (!relativeBaseUrl) {
    logger.warn(
      "CAUSAS_OFICIAIS_URL está em formato relativo sem base para resolução.",
    );

    return null;
  }

  try {
    if (resolvedBase) {
      return new URL(rawUrl, resolvedBase).toString();
    }

    const normalizedBase = relativeBaseUrl.startsWith("http")
      ? relativeBaseUrl
      : `https://${relativeBaseUrl}`;

    return new URL(rawUrl, normalizedBase).toString();
  } catch (error) {
    logger.warn("Falha ao resolver CAUSAS_OFICIAIS_URL relativa", error);

    return null;
  }
}

function parseOfficialCausa(item: unknown): OfficialCausaRow | null {
  if (!item || typeof item !== "object") {
    return null;
  }

  const candidate = item as Record<string, unknown>;
  const nome =
    typeof candidate.nome === "string"
      ? candidate.nome.trim()
      : typeof candidate.name === "string"
        ? candidate.name.trim()
        : typeof candidate.nomeCausa === "string"
          ? candidate.nomeCausa.trim()
          : "";
  if (!nome) {
    return null;
  }

  const codigoCnj =
    typeof candidate.codigoCnj === "string" &&
    candidate.codigoCnj.trim().length > 0
      ? candidate.codigoCnj.trim()
      : typeof candidate.codigo === "string" &&
          candidate.codigo.trim().length > 0
        ? candidate.codigo.trim()
        : typeof candidate.codigo_cnj === "string" &&
            candidate.codigo_cnj.trim().length > 0
          ? candidate.codigo_cnj.trim()
          : null;

  const descricao =
    typeof candidate.descricao === "string" &&
    candidate.descricao.trim().length > 0
      ? candidate.descricao.trim()
      : typeof candidate.description === "string" &&
          candidate.description.trim().length > 0
        ? candidate.description.trim()
        : typeof candidate.observacao === "string" &&
            candidate.observacao.trim().length > 0
          ? candidate.observacao.trim()
          : null;

  return {
    nome,
    codigoCnj,
    descricao,
  };
}

function normalizeOfficialCausaList(rawItems: unknown[]): OfficialCausaRow[] {
  const deduplicated = new Map<string, OfficialCausaRow>();

  for (const item of rawItems) {
    const parsed = parseOfficialCausa(item);
    if (!parsed) {
      continue;
    }

    const key = parsed.nome.toLocaleLowerCase("pt-BR").trim();
    const existing = deduplicated.get(key);

    if (!existing) {
      deduplicated.set(key, parsed);
      continue;
    }

    const hasNewCode = Boolean(parsed.codigoCnj);
    const hasCurrentCode = Boolean(existing.codigoCnj);
    const hasNewDescription = Boolean(parsed.descricao);
    const hasCurrentDescription = Boolean(existing.descricao);

    if (
      (hasNewCode && !hasCurrentCode) ||
      (hasNewDescription && !hasCurrentDescription)
    ) {
      deduplicated.set(key, parsed);
    }
  }

  return Array.from(deduplicated.values()).sort((a, b) =>
    a.nome.localeCompare(b.nome, "pt-BR"),
  );
}

async function fetchOfficialCausas(): Promise<OfficialCausaFetchResult> {
  const sourceUrl = normalizeOfficialFeedSource();
  if (!sourceUrl) {
    logger.warn(
      `CAUSAS_OFICIAIS_URL não definida. Usando fallback interno. Configure para /api/causas-oficiais/cnj.`,
    );

    return {
      causas: OFFICIAL_CAUSA_FALLBACK,
      source: "fallback_local",
      requestedUrl: "not_configured",
      requestedCount: OFFICIAL_CAUSA_FALLBACK.length,
      requestedCountFromSource: OFFICIAL_CAUSA_FALLBACK.length,
      usedFallback: true,
      fallbackReason: "CAUSAS_OFICIAIS_URL não configurada.",
    };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, CAUSA_OFFICIAL_TIMEOUT_MS);

    const response = await fetch(sourceUrl, {
      method: "GET",
      cache: "no-store",
      headers: {
        "User-Agent": "MagicLawyer",
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!response.ok) {
      logger.warn(
        `Fonte oficial de causas não respondeu (${response.status}). Usando fallback interno.`,
      );

      return {
        causas: OFFICIAL_CAUSA_FALLBACK,
        source: "fallback_local",
        requestedUrl: sourceUrl,
        requestedCount: OFFICIAL_CAUSA_FALLBACK.length,
        requestedCountFromSource: OFFICIAL_CAUSA_FALLBACK.length,
        usedFallback: true,
        fallbackReason: `HTTP ${response.status} na fonte oficial.`,
      };
    }

    const body: unknown = await response.json();
    if (
      body &&
      typeof body === "object" &&
      "success" in body &&
      body.success === false
    ) {
      logger.warn("Fonte oficial de causas retornou erro:", body);

      return {
        causas: OFFICIAL_CAUSA_FALLBACK,
        source: "fallback_local",
        requestedUrl: sourceUrl,
        requestedCount: OFFICIAL_CAUSA_FALLBACK.length,
        requestedCountFromSource: OFFICIAL_CAUSA_FALLBACK.length,
        usedFallback: true,
        fallbackReason: "Fonte oficial retornou sucesso=false.",
      };
    }

    const parsedBody = body as Record<string, unknown> | null;
    const sourceName =
      parsedBody && typeof parsedBody.source === "string"
        ? parsedBody.source
        : "cnj_oficial";
    const sourceTotal =
      parsedBody &&
      typeof parsedBody.total === "number" &&
      Number.isFinite(parsedBody.total)
        ? parsedBody.total
        : 0;

    const rawItems = Array.isArray(body)
      ? body
      : Array.isArray((body as { causas?: unknown[] })?.causas)
        ? (body as { causas: unknown[] }).causas
        : [];

    const parsed = normalizeOfficialCausaList(rawItems);

    if (!parsed.length) {
      logger.warn(
        "Fonte oficial de causas retornou vazio. Usando fallback interno.",
      );

      return {
        causas: OFFICIAL_CAUSA_FALLBACK,
        source: "fallback_local",
        requestedUrl: sourceUrl,
        requestedCount: OFFICIAL_CAUSA_FALLBACK.length,
        requestedCountFromSource: OFFICIAL_CAUSA_FALLBACK.length,
        usedFallback: true,
        fallbackReason: "Fonte oficial retornou lista vazia.",
      };
    }

    return {
      causas: parsed,
      source: sourceName,
      requestedUrl: sourceUrl,
      requestedCount: parsed.length,
      requestedCountFromSource: sourceTotal > 0 ? sourceTotal : parsed.length,
      usedFallback: false,
    };
  } catch (error) {
    logger.warn("Falha ao consultar fonte oficial de causas:", error);

    return {
      causas: OFFICIAL_CAUSA_FALLBACK,
      source: "fallback_local",
      requestedUrl: sourceUrl ?? "not_available",
      requestedCount: OFFICIAL_CAUSA_FALLBACK.length,
      requestedCountFromSource: OFFICIAL_CAUSA_FALLBACK.length,
      usedFallback: true,
      fallbackReason:
        error instanceof Error
          ? error.message
          : "Falha na consulta da fonte oficial.",
    };
  }
}

function normalizeOficialFilter(origem?: CausaOrigemFilter | null) {
  if (origem === "oficiais") {
    return true;
  }

  if (origem === "internas") {
    return false;
  }

  return undefined;
}

function normalizePageSize(pageSize: number | undefined) {
  if (!pageSize || !Number.isFinite(pageSize)) {
    return undefined;
  }

  return Math.min(Math.max(Math.floor(pageSize), 1), MAX_CAUSAS_PAGE_SIZE);
}

function normalizePage(page: number | undefined) {
  if (!page || !Number.isFinite(page)) {
    return undefined;
  }

  return Math.max(Math.floor(page), 1);
}

function normalizeOrderDirection(orderDirection: "asc" | "desc" | undefined) {
  if (orderDirection !== "desc") {
    return "asc" as const;
  }

  return orderDirection;
}

function isAdminOrSuperAdmin(userRole?: string | null) {
  return userRole === "ADMIN" || userRole === "SUPER_ADMIN";
}

function isSuperAdmin(userRole?: string | null) {
  return userRole === "SUPER_ADMIN";
}

type TargetTenantSummary = {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  tenantStatus: string;
};

type SyncTenantResolution =
  | {
      success: true;
      scope: "global" | "tenant";
      tenants: TargetTenantSummary[];
    }
  | {
      success: false;
      error: string;
    };

export interface CausaSyncTenantResult {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  tenantStatus: string;
  criadas: number;
  atualizadas: number;
  ignoradas: number;
  total: number;
  success: boolean;
  executionDurationMs: number;
  error?: string | null;
}

type TenantSyncSummary = {
  tenantResult: CausaSyncTenantResult;
  executionDurationMs: number;
  changedSamples?: CausaSyncAuditRow[];
};

export interface CausaSyncFailureSummaryRow {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  tenantStatus: string;
  error?: string | null;
}

export interface CausasOficiaisSyncResult {
  success: boolean;
  error?: string;
  errorCode?: SyncThrottleCode;
  retryAfterSeconds?: number;
  criadas: number;
  atualizadas: number;
  ignoradas: number;
  total: number;
  fontesOficiaisRecebidas?: number;
  fontesOficiaisUsadas?: number;
  fontesOficiaisInfo?: {
    source?: string | null;
    requestedUrl?: string | null;
    requestedCount?: number | null;
    requestedCountFromSource?: number | null;
    usedFallback?: boolean | null;
  };
  scope?: "global" | "tenant";
  totalTenants?: number;
  tenantId?: string | null;
  tenant?: {
    nome?: string | null;
    slug?: string | null;
    status?: string | null;
  } | null;
  tenantResults?: CausaSyncTenantResult[];
  warnings?: {
    tenantResults?: CausaSyncFailureSummaryRow[];
    message: string;
  } | null;
}

export interface AdminCausasLinkageTenantRow {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  tenantStatus: string;
  catalogCount: number;
  officialCount: number;
  internalCount: number;
  processCount: number;
  diligenciaCount: number;
  peticaoCount: number;
  prazoCount: number;
  contractDocumentCount: number;
  clientProcessCount: number;
  clientCount: number;
  hasOperationalImpact: boolean;
}

export interface AdminCausasLinkageSnapshot {
  success: boolean;
  error?: string;
  generatedAt?: string;
  totals?: {
    tenantsWithCatalog: number;
    tenantsWithOperationalImpact: number;
    catalogCount: number;
    officialCount: number;
    internalCount: number;
    processCount: number;
    diligenciaCount: number;
    peticaoCount: number;
    prazoCount: number;
    contractDocumentCount: number;
    clientProcessCount: number;
    clientCount: number;
  };
  tenants?: AdminCausasLinkageTenantRow[];
}

function buildCountMap(
  rows: Array<{
    tenantId: string;
    _count: {
      _all: number;
    };
  }>,
) {
  return new Map(rows.map((row) => [row.tenantId, row._count._all]));
}

function sumTenantLinkageCount(
  tenant: Pick<
    AdminCausasLinkageTenantRow,
    | "processCount"
    | "diligenciaCount"
    | "peticaoCount"
    | "prazoCount"
    | "contractDocumentCount"
    | "clientProcessCount"
    | "clientCount"
  >,
) {
  return (
    tenant.processCount +
    tenant.diligenciaCount +
    tenant.peticaoCount +
    tenant.prazoCount +
    tenant.contractDocumentCount +
    tenant.clientProcessCount +
    tenant.clientCount
  );
}

export async function getAdminCausasLinkageSnapshot(): Promise<AdminCausasLinkageSnapshot> {
  try {
    const session = await getSession();

    if (!session?.user) {
      return {
        success: false,
        error: "Não autorizado",
      };
    }

    const user = session.user as any;

    if (!isSuperAdmin(user.role)) {
      return {
        success: false,
        error: "Sem permissão para visualizar o mapa administrativo de causas.",
      };
    }

    const [
      tenants,
      catalogCountRows,
      officialCountRows,
      processCountRows,
      diligenciaCountRows,
      peticaoCountRows,
      prazoCountRows,
      contractDocumentCountRows,
      clientVisibleProcessRows,
      clientVisiblePairs,
    ] = await Promise.all([
      prisma.tenant.findMany({
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
        },
        orderBy: {
          name: "asc",
        },
      }),
      prisma.causa.groupBy({
        by: ["tenantId"],
        _count: {
          _all: true,
        },
      }),
      prisma.causa.groupBy({
        by: ["tenantId"],
        where: {
          isOficial: true,
        },
        _count: {
          _all: true,
        },
      }),
      prisma.processoCausa.groupBy({
        by: ["tenantId"],
        _count: {
          _all: true,
        },
      }),
      prisma.diligencia.groupBy({
        by: ["tenantId"],
        where: {
          causaId: {
            not: null,
          },
        },
        _count: {
          _all: true,
        },
      }),
      prisma.peticao.groupBy({
        by: ["tenantId"],
        where: {
          causaId: {
            not: null,
          },
        },
        _count: {
          _all: true,
        },
      }),
      prisma.processoPrazo.groupBy({
        by: ["tenantId"],
        where: {
          causaId: {
            not: null,
          },
        },
        _count: {
          _all: true,
        },
      }),
      prisma.contratoDocumento.groupBy({
        by: ["tenantId"],
        where: {
          causaId: {
            not: null,
          },
        },
        _count: {
          _all: true,
        },
      }),
      prisma.processo.findMany({
        where: {
          deletedAt: null,
          causasVinculadas: {
            some: {},
          },
        },
        select: {
          tenantId: true,
          clienteId: true,
        },
      }),
      prisma.processo.findMany({
        where: {
          deletedAt: null,
          causasVinculadas: {
            some: {},
          },
        },
        select: {
          tenantId: true,
          clienteId: true,
        },
        distinct: ["tenantId", "clienteId"],
      }),
    ]);

    const catalogMap = buildCountMap(catalogCountRows);
    const officialMap = buildCountMap(officialCountRows);
    const processMap = buildCountMap(processCountRows);
    const diligenciaMap = buildCountMap(diligenciaCountRows);
    const peticaoMap = buildCountMap(peticaoCountRows);
    const prazoMap = buildCountMap(prazoCountRows);
    const contractDocumentMap = buildCountMap(contractDocumentCountRows);

    const clientVisibleProcessMap = new Map<string, number>();
    for (const row of clientVisibleProcessRows) {
      clientVisibleProcessMap.set(
        row.tenantId,
        (clientVisibleProcessMap.get(row.tenantId) ?? 0) + 1,
      );
    }

    const clientVisibleCountMap = new Map<string, number>();
    for (const row of clientVisiblePairs) {
      clientVisibleCountMap.set(
        row.tenantId,
        (clientVisibleCountMap.get(row.tenantId) ?? 0) + 1,
      );
    }

    const tenantRows: AdminCausasLinkageTenantRow[] = tenants.map((tenant) => {
      const catalogCount = catalogMap.get(tenant.id) ?? 0;
      const officialCount = officialMap.get(tenant.id) ?? 0;
      const internalCount = Math.max(0, catalogCount - officialCount);
      const processCount = processMap.get(tenant.id) ?? 0;
      const diligenciaCount = diligenciaMap.get(tenant.id) ?? 0;
      const peticaoCount = peticaoMap.get(tenant.id) ?? 0;
      const prazoCount = prazoMap.get(tenant.id) ?? 0;
      const contractDocumentCount = contractDocumentMap.get(tenant.id) ?? 0;
      const clientProcessCount = clientVisibleProcessMap.get(tenant.id) ?? 0;
      const clientCount = clientVisibleCountMap.get(tenant.id) ?? 0;

      const row: AdminCausasLinkageTenantRow = {
        tenantId: tenant.id,
        tenantName: tenant.name,
        tenantSlug: tenant.slug,
        tenantStatus: tenant.status,
        catalogCount,
        officialCount,
        internalCount,
        processCount,
        diligenciaCount,
        peticaoCount,
        prazoCount,
        contractDocumentCount,
        clientProcessCount,
        clientCount,
        hasOperationalImpact:
          catalogCount > 0 ||
          processCount > 0 ||
          diligenciaCount > 0 ||
          peticaoCount > 0 ||
          prazoCount > 0 ||
          contractDocumentCount > 0 ||
          clientProcessCount > 0 ||
          clientCount > 0,
      };

      return row;
    });

    const totals = tenantRows.reduce(
      (accumulator, tenant) => {
        accumulator.catalogCount += tenant.catalogCount;
        accumulator.officialCount += tenant.officialCount;
        accumulator.internalCount += tenant.internalCount;
        accumulator.processCount += tenant.processCount;
        accumulator.diligenciaCount += tenant.diligenciaCount;
        accumulator.peticaoCount += tenant.peticaoCount;
        accumulator.prazoCount += tenant.prazoCount;
        accumulator.contractDocumentCount += tenant.contractDocumentCount;
        accumulator.clientProcessCount += tenant.clientProcessCount;
        accumulator.clientCount += tenant.clientCount;
        accumulator.tenantsWithCatalog += tenant.catalogCount > 0 ? 1 : 0;
        accumulator.tenantsWithOperationalImpact +=
          sumTenantLinkageCount(tenant) > 0 ? 1 : 0;

        return accumulator;
      },
      {
        tenantsWithCatalog: 0,
        tenantsWithOperationalImpact: 0,
        catalogCount: 0,
        officialCount: 0,
        internalCount: 0,
        processCount: 0,
        diligenciaCount: 0,
        peticaoCount: 0,
        prazoCount: 0,
        contractDocumentCount: 0,
        clientProcessCount: 0,
        clientCount: 0,
      },
    );

    return {
      success: true,
      generatedAt: new Date().toISOString(),
      totals,
      tenants: tenantRows.sort((left, right) => {
        const rightImpact = sumTenantLinkageCount(right);
        const leftImpact = sumTenantLinkageCount(left);

        if (rightImpact !== leftImpact) {
          return rightImpact - leftImpact;
        }

        if (right.catalogCount !== left.catalogCount) {
          return right.catalogCount - left.catalogCount;
        }

        return left.tenantName.localeCompare(right.tenantName, "pt-BR");
      }),
    };
  } catch (error) {
    logger.error("Erro ao carregar snapshot administrativo de causas:", error);

    return {
      success: false,
      error: "Erro ao carregar o mapa administrativo de causas.",
    };
  }
}

type CausaSyncAuditRow = {
  id: string;
  nome: string;
  codigoCnj: string | null;
  descricao: string | null;
  changedFields: string[];
  previous?: {
    codigoCnj: string | null;
    descricao: string | null;
    isOficial: boolean;
  };
};

function getChangedFields(
  current: Pick<OfficialCausaRow, "nome" | "codigoCnj" | "descricao"> & {
    isOficial: boolean;
  },
  next: Pick<OfficialCausaRow, "nome" | "codigoCnj" | "descricao">,
) {
  const changedFields: string[] = [];
  const nextCodigo = next.codigoCnj ?? null;
  const nextDescricao = next.descricao ?? null;

  if ((current.codigoCnj ?? null) !== nextCodigo) {
    changedFields.push("codigoCnj");
  }

  if ((current.descricao ?? null) !== nextDescricao) {
    changedFields.push("descricao");
  }

  if (!current.isOficial) {
    changedFields.push("isOficial");
  }

  return changedFields;
}

function toTrimmedLower(value: string) {
  return value.trim().toLowerCase();
}

function getSyncValidationError(userRole?: string | null) {
  return isSuperAdmin(userRole)
    ? "Tenant não encontrado para sincronização."
    : "Sem permissão para sincronizar causas.";
}

async function resolveTenantForCausaSync(
  user: any,
  requestedTenantId?: string | null,
  syncAll?: boolean,
): Promise<SyncTenantResolution> {
  const trimmedTenantId =
    typeof requestedTenantId === "string" ? requestedTenantId.trim() : "";

  if (isSuperAdmin(user.role)) {
    if (syncAll || !trimmedTenantId) {
      const tenants = await prisma.tenant.findMany({
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
        },
        orderBy: {
          name: "asc",
        },
      });

      if (!tenants.length) {
        return {
          success: false,
          error: "Nenhum escritório encontrado para sincronização global.",
        };
      }

      return {
        success: true,
        scope: "global",
        tenants: tenants.map((tenant) => ({
          tenantId: tenant.id,
          tenantName: tenant.name,
          tenantSlug: tenant.slug,
          tenantStatus: tenant.status,
        })),
      } as const;
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: trimmedTenantId },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
      },
    });

    if (!tenant) {
      return {
        success: false,
        error: "Tenant não encontrado.",
      } as const;
    }

    return {
      success: true as const,
      scope: "tenant" as const,
      tenants: [
        {
          tenantId: tenant.id,
          tenantName: tenant.name,
          tenantSlug: tenant.slug,
          tenantStatus: tenant.status,
        },
      ],
    } as const;
  }

  if (!user.tenantId) {
    return {
      success: false,
      error: "Tenant não encontrado",
    } as const;
  }

  if (trimmedTenantId && trimmedTenantId !== user.tenantId) {
    return {
      success: false,
      error: getSyncValidationError(user.role),
    } as const;
  }

  return {
    success: true as const,
    scope: "tenant" as const,
    tenants: [
      {
        tenantId: user.tenantId,
        tenantName: "Escritório atual",
        tenantSlug: "",
        tenantStatus: "",
      },
    ],
  } as const;
}

function normalizeStatusFilter(status?: CausaStatusFilter | null) {
  if (status === "ativas") {
    return true;
  }

  if (status === "arquivadas") {
    return false;
  }

  return undefined;
}

function normalizeSearch(search?: string | null) {
  return typeof search === "string" ? search.trim() : "";
}

async function canManageCausas(
  action: "visualizar" | "criar" | "editar",
): Promise<boolean> {
  return checkPermission("causas", action).catch(() => false);
}

type ValidationFailure = { ok: false; error: string };
type ValidationSuccess = {
  ok: true;
  nome: string;
  codigoCnj: string | null;
  descricao: string | null;
};

type ValidationResult = ValidationSuccess | ValidationFailure;

function validationFailure(error: string): ValidationFailure {
  return { ok: false, error };
}

function isValidationSuccess(
  result: ValidationResult,
): result is ValidationSuccess {
  return result.ok;
}

function validateCausaPayload(payload: {
  nome: string;
  codigoCnj?: string | null;
  descricao?: string | null;
}): ValidationResult {
  const trimmedNome = payload.nome.trim();
  const trimmedCodigoCnj = payload.codigoCnj?.trim()
    ? payload.codigoCnj.trim()
    : null;
  const trimmedDescricao = payload.descricao?.trim()
    ? payload.descricao.trim()
    : null;

  if (!trimmedNome) {
    return validationFailure("Nome da causa é obrigatório");
  }

  if (trimmedNome.length > 200) {
    return validationFailure("Nome da causa deve ter no máximo 200 caracteres");
  }

  if (trimmedCodigoCnj && trimmedCodigoCnj.length > MAX_CODIGO_CNJ_LENGTH) {
    return validationFailure(
      `Código CNJ deve ter no máximo ${MAX_CODIGO_CNJ_LENGTH} caracteres`,
    );
  }

  if (
    trimmedDescricao &&
    trimmedDescricao.length > MAX_DESCRICAO_CAUSA_LENGTH
  ) {
    return validationFailure(
      `Descrição deve ter no máximo ${MAX_DESCRICAO_CAUSA_LENGTH} caracteres`,
    );
  }

  return {
    ok: true,
    nome: trimmedNome,
    codigoCnj: trimmedCodigoCnj,
    descricao: trimmedDescricao,
  };
}

function getFailureAuditMessage(tenantName: string, error: unknown) {
  const fallback = `Falha no sincronismo para ${tenantName}.`;

  return error instanceof Error
    ? error.message || fallback
    : typeof error === "string"
      ? error
      : fallback;
}

function toIsoDuration(start: number) {
  return Math.max(1, Date.now() - start);
}

function normalizeCausaSourceRow(causa: OfficialCausaRow) {
  return {
    nome: causa.nome.trim(),
    codigoCnj: causa.codigoCnj?.trim() ? causa.codigoCnj.trim() : null,
    descricao: causa.descricao?.trim() ? causa.descricao.trim() : null,
  };
}

async function syncTenantCausasOficiais(params: {
  tenant: TargetTenantSummary;
  causasOficiais: OfficialCausaRow[];
  fonte: OfficialCausaFetchResult;
  usuarioId: string;
  totalOficial: number;
}) {
  const start = Date.now();

  try {
    const changedSamples: CausaSyncAuditRow[] = [];
    let criadas = 0;
    let atualizadas = 0;
    let ignoradas = 0;

    const summary = await prisma.$transaction(async (tx) => {
      for (const causaRaw of params.causasOficiais) {
        const causa = normalizeCausaSourceRow(causaRaw);

        const existing = await tx.causa.findFirst({
          where: {
            tenantId: params.tenant.tenantId,
            nome: causa.nome,
          },
          select: {
            id: true,
            nome: true,
            codigoCnj: true,
            descricao: true,
            isOficial: true,
          },
        });

        const payload: CausaPayloadBase = {
          tenantId: params.tenant.tenantId,
          nome: causa.nome,
          codigoCnj: causa.codigoCnj,
          descricao: causa.descricao,
          isOficial: true,
        };

        if (!existing) {
          const created = await tx.causa.create({ data: payload });
          criadas += 1;

          if (changedSamples.length < CAUSA_SYNC_AUDIT_SAMPLE_LIMIT) {
            changedSamples.push({
              id: created.id,
              nome: causa.nome,
              codigoCnj: causa.codigoCnj,
              descricao: causa.descricao,
              changedFields: ["nome", "codigoCnj", "descricao", "isOficial"],
              previous: undefined,
            });
          }

          continue;
        }

        const changedFields = getChangedFields(existing, causa);
        if (changedFields.length === 0) {
          ignoradas += 1;
          continue;
        }

        const updateData: Partial<CausaPayloadBase> = {
          codigoCnj: causa.codigoCnj,
          descricao: causa.descricao,
          isOficial: true,
        };

        if (toTrimmedLower(existing.nome) !== toTrimmedLower(payload.nome)) {
          updateData.nome = payload.nome;
        }

        await tx.causa.update({
          where: { id: existing.id },
          data: updateData,
        });

        atualizadas += 1;

        if (changedSamples.length < CAUSA_SYNC_AUDIT_SAMPLE_LIMIT) {
          changedSamples.push({
            id: existing.id,
            nome: causa.nome,
            codigoCnj: causa.codigoCnj,
            descricao: causa.descricao,
            changedFields,
            previous: {
              codigoCnj: existing.codigoCnj,
              descricao: existing.descricao,
              isOficial: existing.isOficial,
            },
          });
        }
      }

      return {
        criadas,
        atualizadas,
        ignoradas,
        changedSamples,
      };
    });

    const tenantResult: CausaSyncTenantResult = {
      tenantId: params.tenant.tenantId,
      tenantName: params.tenant.tenantName,
      tenantSlug: params.tenant.tenantSlug,
      tenantStatus: params.tenant.tenantStatus,
      criadas: summary.criadas,
      atualizadas: summary.atualizadas,
      ignoradas: summary.ignoradas,
      total: params.totalOficial,
      success: true,
      executionDurationMs: toIsoDuration(start),
    };

    const aggregatedChangedFields = Array.from(
      new Set(summary.changedSamples.flatMap((item) => item.changedFields)),
    );

    await logAudit({
      tenantId: params.tenant.tenantId,
      usuarioId: params.usuarioId,
      acao: "causa.sync_oficial",
      entidade: "Causa",
      dados: toAuditJson({
        criadas: summary.criadas,
        atualizadas: summary.atualizadas,
        ignoradas: summary.ignoradas,
        totalOficial: params.totalOficial,
        fonte: params.fonte.source,
        fonteUrl: params.fonte.requestedUrl,
        totalInformadoPelaFonte: params.fonte.requestedCountFromSource,
        totalUsadoNoSync: params.totalOficial,
        fallback: params.fonte.usedFallback,
        fallbackReason: params.fonte.fallbackReason,
        tenant: {
          id: params.tenant.tenantId,
          nome: params.tenant.tenantName,
          slug: params.tenant.tenantSlug,
          status: params.tenant.tenantStatus,
        },
        changedSamples: summary.changedSamples,
      }),
      changedFields: aggregatedChangedFields,
      previousValues: toAuditJson({
        tenantId: params.tenant.tenantId,
      }),
    });

    return {
      tenantResult,
      executionDurationMs: toIsoDuration(start),
      changedSamples: summary.changedSamples,
    } satisfies TenantSyncSummary;
  } catch (error) {
    const duration = toIsoDuration(start);
    const tenantResult: CausaSyncTenantResult = {
      tenantId: params.tenant.tenantId,
      tenantName: params.tenant.tenantName,
      tenantSlug: params.tenant.tenantSlug,
      tenantStatus: params.tenant.tenantStatus,
      criadas: 0,
      atualizadas: 0,
      ignoradas: 0,
      total: params.totalOficial,
      success: false,
      executionDurationMs: duration,
      error: getFailureAuditMessage(params.tenant.tenantName, error),
    };

    await logAudit({
      tenantId: params.tenant.tenantId,
      usuarioId: params.usuarioId,
      acao: "causa.sync_oficial",
      entidade: "Causa",
      dados: toAuditJson({
        status: "falha",
        tenant: {
          id: params.tenant.tenantId,
          nome: params.tenant.tenantName,
          slug: params.tenant.tenantSlug,
          status: params.tenant.tenantStatus,
        },
        fonte: params.fonte.source,
        fonteUrl: params.fonte.requestedUrl,
        error: tenantResult.error,
      }),
      previousValues: toAuditJson({
        tenantId: params.tenant.tenantId,
      }),
      changedFields: ["sync_oficial"],
    });

    return {
      tenantResult,
      executionDurationMs: duration,
    } satisfies TenantSyncSummary;
  }
}

export interface CausasListParams {
  page?: number;
  pageSize?: number;
  search?: string | null;
  status?: CausaStatusFilter | null;
  origem?: CausaOrigemFilter | null;
  orderBy?: "nome" | "createdAt" | "updatedAt";
  orderDirection?: "asc" | "desc";
}

type CausaWhereInput = Prisma.CausaWhereInput;

type CausaPayloadBase = Parameters<typeof prisma.causa.create>[0]["data"];

type CausaLoggableData = Record<string, unknown> & {
  id?: string;
  nome?: string | null;
  codigoCnj?: string | null;
  descricao?: string | null;
  ativo?: boolean;
  isOficial?: boolean;
};

export interface CausaPayload {
  nome: string;
  codigoCnj?: string | null;
  descricao?: string | null;
  isOficial?: boolean;
}

export interface CausaListResultItem {
  id: string;
  tenantId: string;
  nome: string;
  codigoCnj: string | null;
  descricao: string | null;
  ativo: boolean;
  isOficial: boolean;
  createdAt: Date;
  updatedAt: Date;
  processoCount?: number;
  diligenciaCount?: number;
  peticaoCount?: number;
  prazoCount?: number;
}

export interface CausasListResult {
  causas: CausaListResultItem[];
  total?: number;
  page?: number;
  pageSize?: number;
  totalPages?: number;
  filtros?: {
    totalAtivas?: number;
    totalArquivadas?: number;
    totalOficiais?: number;
    totalInternas?: number;
  };
}

export async function listCausas(params: CausasListParams = {}) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return {
        success: false,
        error: "Não autorizado",
        criadas: 0,
        atualizadas: 0,
        ignoradas: 0,
        total: 0,
      };
    }

    const user = session.user as any;

    if (!user.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    const canList = await canManageCausas("visualizar");
    if (!canList && !isAdminOrSuperAdmin(user.role)) {
      return { success: false, error: "Sem permissão para visualizar causas" };
    }

    const normalizedSearch = normalizeSearch(params.search);
    const normalizedStatus = normalizeStatusFilter(params.status);
    const normalizedOrigem = normalizeOficialFilter(params.origem);
    const orderBy = params.orderBy ?? "nome";
    const orderDirection = normalizeOrderDirection(
      params.orderDirection ?? "asc",
    );
    const page = normalizePage(params.page);
    const pageSize = normalizePageSize(params.pageSize);
    const usePagination = page !== undefined && pageSize !== undefined;

    const where: CausaWhereInput = {
      tenantId: user.tenantId,
      ...(normalizedStatus === undefined ? {} : { ativo: normalizedStatus }),
      ...(normalizedOrigem === undefined
        ? {}
        : { isOficial: normalizedOrigem }),
      ...(normalizedSearch
        ? {
            OR: [
              {
                nome: {
                  contains: normalizedSearch,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                codigoCnj: {
                  contains: normalizedSearch,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                descricao: {
                  contains: normalizedSearch,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
            ],
          }
        : {}),
    };

    const orderByOptions: Prisma.CausaOrderByWithRelationInput[] = [
      { [orderBy]: orderDirection } as Prisma.CausaOrderByWithRelationInput,
    ];

    if (orderBy !== "nome") {
      orderByOptions.push({ nome: "asc" });
    }

    if (usePagination) {
      const skip = (page - 1) * pageSize;
      const take = pageSize;

      const [
        causas,
        total,
        totalAtivas,
        totalArquivadas,
        totalOficiais,
        totalInternas,
      ] = await Promise.all([
        prisma.causa.findMany({
          where,
          orderBy: orderByOptions,
          skip,
          take,
          include: {
            _count: {
              select: {
                processos: true,
                diligencias: true,
                peticoes: true,
                prazos: true,
              },
            },
          },
        }),
        prisma.causa.count({ where }),
        prisma.causa.count({ where: { tenantId: user.tenantId, ativo: true } }),
        prisma.causa.count({
          where: { tenantId: user.tenantId, ativo: false },
        }),
        prisma.causa.count({
          where: { tenantId: user.tenantId, isOficial: true },
        }),
        prisma.causa.count({
          where: { tenantId: user.tenantId, isOficial: false },
        }),
      ]);

      const formattedCausas = causas.map((causa) => ({
        ...causa,
        processoCount: causa._count?.processos,
        diligenciaCount: causa._count?.diligencias,
        peticaoCount: causa._count?.peticoes,
        prazoCount: causa._count?.prazos,
      }));

      return {
        success: true,
        causas: formattedCausas,
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / take)),
        filtros: {
          totalAtivas,
          totalArquivadas,
          totalOficiais,
          totalInternas,
        },
      } satisfies { success: true } & CausasListResult;
    }

    const causas = await prisma.causa.findMany({
      where,
      orderBy: orderByOptions,
      include: {
        _count: {
          select: {
            processos: true,
            diligencias: true,
            peticoes: true,
            prazos: true,
          },
        },
      },
    });

    const formattedCausas = causas.map((causa) => ({
      ...causa,
      processoCount: causa._count?.processos,
      diligenciaCount: causa._count?.diligencias,
      peticaoCount: causa._count?.peticoes,
      prazoCount: causa._count?.prazos,
    }));

    return {
      success: true,
      causas: formattedCausas,
    } satisfies { success: true } & CausasListResult;
  } catch (error) {
    logger.error("Erro ao listar causas:", error);

    return {
      success: false,
      error: "Erro ao carregar causas",
    };
  }
}

export async function createCausa(payload: CausaPayload) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return {
        success: false,
        error: "Não autorizado",
        criadas: 0,
        atualizadas: 0,
        ignoradas: 0,
        total: 0,
      };
    }

    const user = session.user as any;

    if (!user.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    const canCreate = await canManageCausas("criar");
    if (!canCreate && !isAdminOrSuperAdmin(user.role)) {
      return { success: false, error: "Sem permissão para criar causas" };
    }

    const isOficial = isAdminOrSuperAdmin(user.role)
      ? (payload.isOficial ?? false)
      : false;

    if (payload.isOficial === true && !isAdminOrSuperAdmin(user.role)) {
      return {
        success: false,
        error: "Sem permissão para definir causa oficial.",
      };
    }

    const normalized = validateCausaPayload(payload);
    if (!isValidationSuccess(normalized)) {
      return { success: false, error: normalized.error };
    }

    const data: CausaPayloadBase = {
      tenantId: user.tenantId,
      nome: normalized.nome,
      codigoCnj: normalized.codigoCnj,
      descricao: normalized.descricao,
      isOficial,
    };

    const causa = await prisma.causa.create({
      data,
    });

    revalidatePath("/causas");

    try {
      await logAudit({
        tenantId: user.tenantId,
        usuarioId: user.id,
        acao: "causa.create",
        entidade: "Causa",
        entidadeId: causa.id,
        dados: toAuditJson({
          ...data,
          id: causa.id,
        } as CausaLoggableData),
      });
    } catch (error) {
      logger.warn("Falha ao registrar auditoria de criação de causa", error);
    }

    return {
      success: true,
      causa,
    };
  } catch (error: any) {
    if (error?.code === "P2002") {
      return {
        success: false,
        error: "Já existe uma causa com este nome",
      };
    }

    logger.error("Erro ao criar causa:", error);

    return {
      success: false,
      error: "Erro ao criar causa",
    };
  }
}

export async function updateCausa(
  causaId: string,
  payload: Partial<CausaPayload>,
) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return {
        success: false,
        error: "Não autorizado",
        criadas: 0,
        atualizadas: 0,
        ignoradas: 0,
        total: 0,
      };
    }

    const user = session.user as any;

    if (!user.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    const canEdit = await canManageCausas("editar");
    if (!canEdit && !isAdminOrSuperAdmin(user.role)) {
      return { success: false, error: "Sem permissão para editar causas" };
    }

    const causa = await prisma.causa.findFirst({
      where: {
        id: causaId,
        tenantId: user.tenantId,
      },
    });

    if (!causa) {
      return { success: false, error: "Causa não encontrada" };
    }

    const data: Record<string, unknown> = {};
    const payloadForValidation: {
      nome: string;
      codigoCnj?: string | null;
      descricao?: string | null;
      isOficial?: boolean;
    } = {
      nome: payload.nome !== undefined ? payload.nome : causa.nome,
      codigoCnj:
        payload.codigoCnj !== undefined ? payload.codigoCnj : causa.codigoCnj,
      descricao:
        payload.descricao !== undefined ? payload.descricao : causa.descricao,
      isOficial: payload.isOficial ?? causa.isOficial,
    };
    const normalized = validateCausaPayload(payloadForValidation);
    if (!isValidationSuccess(normalized)) {
      return { success: false, error: normalized.error };
    }

    if (payload.nome !== undefined) {
      data.nome = normalized.nome;
    }

    if (payload.codigoCnj !== undefined) {
      data.codigoCnj = normalized.codigoCnj;
    }

    if (payload.descricao !== undefined) {
      data.descricao = normalized.descricao;
    }

    if (payload.isOficial !== undefined) {
      if (payload.isOficial && !isAdminOrSuperAdmin(user.role)) {
        return {
          success: false,
          error: "Sem permissão para alterar o status oficial.",
        };
      }

      data.isOficial = payload.isOficial;
    }

    const updated = await prisma.causa.update({
      where: { id: causa.id },
      data,
    });

    revalidatePath("/causas");

    try {
      await logAudit({
        tenantId: user.tenantId,
        usuarioId: user.id,
        acao: "causa.update",
        entidade: "Causa",
        entidadeId: causa.id,
        dados: toAuditJson({
          id: causa.id,
          ...data,
        } as CausaLoggableData),
        previousValues: toAuditJson({
          id: causa.id,
          nome: causa.nome,
          codigoCnj: causa.codigoCnj,
          descricao: causa.descricao,
          ativo: causa.ativo,
          isOficial: causa.isOficial,
        } as CausaLoggableData),
        changedFields: Object.keys(data),
      });
    } catch (error) {
      logger.warn(
        "Falha ao registrar auditoria de atualização de causa",
        error,
      );
    }

    return { success: true, causa: updated };
  } catch (error: any) {
    if (error?.code === "P2002") {
      return {
        success: false,
        error: "Já existe uma causa com este nome",
      };
    }

    logger.error("Erro ao atualizar causa:", error);

    return {
      success: false,
      error: "Erro ao atualizar causa",
    };
  }
}

export async function setCausaAtiva(causaId: string, ativo: boolean) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return {
        success: false,
        error: "Não autorizado",
        criadas: 0,
        atualizadas: 0,
        ignoradas: 0,
        total: 0,
      };
    }

    const user = session.user as any;

    if (!user.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    const canEdit = await canManageCausas("editar");
    if (!canEdit && !isAdminOrSuperAdmin(user.role)) {
      return { success: false, error: "Sem permissão para atualizar causas" };
    }

    const causa = await prisma.causa.findFirst({
      where: { id: causaId, tenantId: user.tenantId },
    });

    if (!causa) {
      return { success: false, error: "Causa não encontrada" };
    }

    const updated = await prisma.causa.update({
      where: { id: causa.id },
      data: { ativo },
    });

    revalidatePath("/causas");

    try {
      await logAudit({
        tenantId: user.tenantId,
        usuarioId: user.id,
        acao: "causa.toggle_status",
        entidade: "Causa",
        entidadeId: causa.id,
        dados: toAuditJson({
          id: causa.id,
          ativo,
        } as CausaLoggableData),
        previousValues: toAuditJson({
          ativo: causa.ativo,
        } as CausaLoggableData),
        changedFields: ["ativo"],
      });
    } catch (error) {
      logger.warn("Falha ao registrar auditoria de status da causa", error);
    }

    return { success: true, causa: updated };
  } catch (error) {
    logger.error("Erro ao alterar status da causa:", error);

    return {
      success: false,
      error: "Erro ao atualizar status da causa",
    };
  }
}

export async function syncCausasOficiais(
  targetTenantId?: string | null,
  syncAll?: boolean,
): Promise<CausasOficiaisSyncResult> {
  let syncGuard: SyncThrottleResult | null = null;
  let actingUserId: string | undefined;

  try {
    const session = await getSession();

    if (!session?.user) {
      return {
        success: false,
        error: "Não autorizado",
        criadas: 0,
        atualizadas: 0,
        ignoradas: 0,
        total: 0,
      };
    }

    const user = session.user as any;
    actingUserId = user?.id;

    if (!isAdminOrSuperAdmin(user.role)) {
      return {
        success: false,
        error: "Sem permissão para sincronizar causas",
        criadas: 0,
        atualizadas: 0,
        ignoradas: 0,
        total: 0,
      };
    }

    const resolvedTenant = await resolveTenantForCausaSync(
      user,
      targetTenantId,
      syncAll,
    );

    if (!resolvedTenant.success) {
      return {
        success: false,
        error: resolvedTenant.error,
        criadas: 0,
        atualizadas: 0,
        ignoradas: 0,
        total: 0,
      };
    }

    const tenants = resolvedTenant.tenants;
    if (!tenants.length) {
      return {
        success: false,
        error: "Nenhum escritório disponível para sincronizar.",
        criadas: 0,
        atualizadas: 0,
        ignoradas: 0,
        total: 0,
      };
    }

    syncGuard = await acquireSyncCauseGuard(user.id);
    if (!syncGuard.ok) {
      return {
        success: false,
        error: syncGuard.error,
        errorCode: syncGuard.errorCode,
        retryAfterSeconds: syncGuard.retryAfterSeconds,
        criadas: 0,
        atualizadas: 0,
        ignoradas: 0,
        total: 0,
      };
    }

    const causasOficiaisResult = await fetchOfficialCausas();
    const causasOficiais = causasOficiaisResult.causas;

    if (!causasOficiais.length) {
      return {
        success: false,
        error: "A fonte oficial retornou vazio. Tente novamente.",
        criadas: 0,
        atualizadas: 0,
        ignoradas: 0,
        total: 0,
      };
    }

    let criadas = 0;
    let atualizadas = 0;
    let ignoradas = 0;
    const fontesOficiaisUsadas = causasOficiaisResult.requestedCount;
    const tenantSummaries: TenantSyncSummary[] = [];

    for (const tenant of tenants) {
      const summary = await syncTenantCausasOficiais({
        tenant,
        causasOficiais,
        fonte: causasOficiaisResult,
        usuarioId: user.id,
        totalOficial: fontesOficiaisUsadas,
      });

      tenantSummaries.push(summary);
      criadas += summary.tenantResult.criadas;
      atualizadas += summary.tenantResult.atualizadas;
      ignoradas += summary.tenantResult.ignoradas;
    }

    revalidatePath("/causas");
    revalidatePath("/admin/causas");

    const successSummaries = tenantSummaries.filter(
      (item) => item.tenantResult.success,
    );
    const failedSummaries = tenantSummaries.filter(
      (item) => !item.tenantResult.success,
    );
    const tenantResultRows = tenantSummaries.map((item) => item.tenantResult);
    const hasAnySuccess = successSummaries.length > 0;
    const failedCount = failedSummaries.length;
    const hasErrors = failedCount > 0;
    const firstTenantSummary = tenantSummaries[0]?.tenantResult;
    const totalAplicavel = criadas + atualizadas + ignoradas;

    if (successSummaries.length > 0) {
      try {
        const globalAuditTenantId = tenantSummaries[0]?.tenantResult.tenantId;

        await logAudit({
          tenantId: globalAuditTenantId ?? user.tenantId,
          usuarioId: user.id,
          acao: "causa.sync_oficial",
          entidade: "Causa",
          dados: toAuditJson({
            escopo: resolvedTenant.scope,
            source: causasOficiaisResult.source,
            fonteUrl: causasOficiaisResult.requestedUrl,
            totalInformadoPelaFonte:
              causasOficiaisResult.requestedCountFromSource,
            totalUsadoNoSync: fontesOficiaisUsadas,
            requestedCount: causasOficiaisResult.requestedCount,
            fallback: causasOficiaisResult.usedFallback,
            fallbackReason: causasOficiaisResult.fallbackReason,
            success: hasAnySuccess,
            failureCount: failedSummaries.length,
            tenantSummaries: tenantResultRows,
          }),
        });
      } catch (error) {
        logger.warn(
          "Falha ao registrar auditoria geral de sincronização de causas oficiais",
          error,
        );
      }
    }

    if (!hasAnySuccess && hasErrors) {
      return {
        success: false,
        error: `Sincronização falhou para todos os escritórios (${failedCount}). ${failedSummaries
          .map(
            (item) =>
              `${item.tenantResult.tenantName}: ${item.tenantResult.error}`,
          )
          .join(" | ")}`,
        criadas,
        atualizadas,
        ignoradas,
        total: fontesOficiaisUsadas,
        fontesOficiaisRecebidas: causasOficiaisResult.requestedCountFromSource,
        fontesOficiaisUsadas,
        fontesOficiaisInfo: {
          source: causasOficiaisResult.source,
          requestedUrl: causasOficiaisResult.requestedUrl,
          requestedCount: causasOficiaisResult.requestedCount,
          requestedCountFromSource:
            causasOficiaisResult.requestedCountFromSource,
          usedFallback: causasOficiaisResult.usedFallback,
        },
        scope: resolvedTenant.scope,
        totalTenants: tenantSummaries.length,
        tenantId:
          resolvedTenant.scope === "tenant"
            ? firstTenantSummary?.tenantId
            : null,
        tenant: firstTenantSummary
          ? {
              nome: firstTenantSummary.tenantName,
              slug: firstTenantSummary.tenantSlug,
              status: firstTenantSummary.tenantStatus,
            }
          : null,
        tenantResults: tenantResultRows,
      };
    }

    const warnings = failedSummaries.length
      ? {
          tenantResults: failedSummaries.map((item) => ({
            tenantId: item.tenantResult.tenantId,
            tenantName: item.tenantResult.tenantName,
            tenantSlug: item.tenantResult.tenantSlug,
            tenantStatus: item.tenantResult.tenantStatus,
            error: item.tenantResult.error,
          })),
          message:
            "Sincronização concluída parcialmente. Alguns escritórios não foram atualizados.",
        }
      : null;

    return {
      success: hasAnySuccess,
      criadas,
      atualizadas,
      ignoradas,
      total: totalAplicavel > 0 ? totalAplicavel : fontesOficiaisUsadas,
      fontesOficiaisRecebidas: causasOficiaisResult.requestedCountFromSource,
      fontesOficiaisUsadas,
      fontesOficiaisInfo: {
        source: causasOficiaisResult.source,
        requestedUrl: causasOficiaisResult.requestedUrl,
        requestedCount: causasOficiaisResult.requestedCount,
        requestedCountFromSource: causasOficiaisResult.requestedCountFromSource,
        usedFallback: causasOficiaisResult.usedFallback,
      },
      scope: resolvedTenant.scope,
      totalTenants: tenantSummaries.length,
      tenantId:
        resolvedTenant.scope === "tenant" ? firstTenantSummary?.tenantId : null,
      tenant: firstTenantSummary
        ? {
            nome: firstTenantSummary.tenantName,
            slug: firstTenantSummary.tenantSlug,
            status: firstTenantSummary.tenantStatus,
          }
        : null,
      tenantResults: tenantResultRows,
      warnings,
    };
  } catch (error) {
    logger.error("Erro ao sincronizar causas oficiais:", error);

    return {
      success: false,
      error: "Erro ao sincronizar causas oficiais",
      criadas: 0,
      atualizadas: 0,
      ignoradas: 0,
      total: 0,
    };
  } finally {
    if (syncGuard?.ok) {
      try {
        await syncGuard.release();
      } catch (error) {
        logger.warn("Erro ao liberar lock de sincronização de causas:", error);
      }

      await registerSyncCooldown(
        syncGuard.redisAvailable,
        syncGuard.cooldownKey,
        actingUserId,
      );
    }
  }
}
