"use server";

import { getSession } from "@/app/lib/auth";
import { getRedisInstance } from "@/app/lib/notifications/redis-singleton";
import prisma from "@/app/lib/prisma";
import { buildSoftDeletePayload } from "@/app/lib/soft-delete";
import logger from "@/lib/logger";
import { TENANT_PERMISSIONS } from "@/types";

export interface TribunalCreatePayload {
  nome: string;
  sigla?: string | null;
  esfera?: string | null; // Federal, Estadual, Municipal
  uf?: string | null;
  siteUrl?: string | null;
}

export interface TribunalUpdatePayload {
  nome?: string;
  sigla?: string | null;
  esfera?: string | null;
  uf?: string | null;
  siteUrl?: string | null;
}

type ModerationResult = {
  ok: boolean;
  flagged: boolean;
  unavailable: boolean;
  reason?: string;
};

type DataJudApiKeyResolution = {
  key: string | null;
  source: "env" | "wiki" | "unavailable";
  reason?: string;
};

type DataJudTribunalRow = {
  nome: string;
  sigla: string;
  esfera: string | null;
  uf: string | null;
  siteUrl: string;
  sourceAlias: string;
  sourceCategory: string;
};

export interface SyncTribunaisOficiaisResult {
  success: boolean;
  error?: string;
  message?: string;
  source?: string;
  requestedUrl?: string;
  apiKeySource?: DataJudApiKeyResolution["source"];
  totalRecebido?: number;
  criados?: number;
  atualizados?: number;
  inalterados?: number;
  ignorados?: number;
  skippedByFresh?: boolean;
  retryAfterSeconds?: number;
}

const DATAJUD_ACCESS_PAGE_URL = "https://datajud-wiki.cnj.jus.br/api-publica/acesso/";
const DATAJUD_ENDPOINTS_PAGE_CANDIDATES = [
  "https://datajud-wiki.cnj.jus.br/api-publica/endpoints/",
  "https://datajud-wiki.cnj.jus.br/api-publica/endpoints",
];
const DATAJUD_SYNC_LOCK_KEY = "tribunais:datajud:sync:lock";
const DATAJUD_SYNC_FRESH_KEY = "tribunais:datajud:sync:fresh";
const DATAJUD_SYNC_LOCK_TTL_SECONDS = 120;
const DATAJUD_SYNC_FRESH_TTL_SECONDS = 2 * 60 * 60;
const DATAJUD_HTTP_TIMEOUT_MS = 20_000;
const DATAJUD_AUTO_SYNC_FAIL_COOLDOWN_SECONDS = 15 * 60;
const TRIBUNAIS_SOURCE_UNAVAILABLE_MESSAGE =
  "Dados indisponíveis no momento, favor informar suporte!";

function getBrazilDateWindowRef(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";

  const dateKey = `${get("year")}-${get("month")}-${get("day")}`;
  const hour = Number.parseInt(get("hour"), 10);

  if (!Number.isFinite(hour)) {
    return {
      dateKey,
      window: null as "manha" | "tarde" | "noite" | null,
    };
  }

  if (hour >= 6 && hour < 12) {
    return { dateKey, window: "manha" as const };
  }

  if (hour >= 12 && hour < 18) {
    return { dateKey, window: "tarde" as const };
  }

  if (hour >= 18 && hour <= 23) {
    return { dateKey, window: "noite" as const };
  }

  return { dateKey, window: null as "manha" | "tarde" | "noite" | null };
}

function normalizeNullableText(value?: string | null) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeRequiredText(value?: string | null) {
  if (!value) return "";
  return value.trim();
}

function canManageTribunais(user: any) {
  const role = user?.role as string | undefined;
  const permissions = (user?.permissions ?? []) as string[];

  return (
    role === "SUPER_ADMIN" ||
    role === "ADMIN" ||
    permissions.includes(TENANT_PERMISSIONS.manageOfficeSettings)
  );
}

function validateTribunalWebsite(siteUrl?: string | null) {
  const normalized = normalizeNullableText(siteUrl);
  if (!normalized) {
    return { success: true as const, value: null as string | null };
  }

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    return {
      success: false as const,
      error: "Site oficial inválido. Use uma URL válida.",
    };
  }

  if (parsed.protocol !== "https:") {
    return {
      success: false as const,
      error: "Site oficial deve usar HTTPS por segurança.",
    };
  }

  const host = parsed.hostname.toLowerCase();
  const isJusBrDomain = host === "jus.br" || host.endsWith(".jus.br");
  if (!isJusBrDomain) {
    return {
      success: false as const,
      error: "Site oficial deve ser domínio institucional do Judiciário (.jus.br).",
    };
  }

  return { success: true as const, value: normalized };
}

function validateTribunalName(nome: string) {
  const trimmed = normalizeRequiredText(nome);

  if (!trimmed) {
    return { success: false as const, error: "Nome é obrigatório." };
  }

  if (trimmed.length < 4 || trimmed.length > 180) {
    return {
      success: false as const,
      error: "Nome do tribunal deve ter entre 4 e 180 caracteres.",
    };
  }

  const hasControlChars = /[\x00-\x1F\x7F]/.test(trimmed);
  if (hasControlChars) {
    return {
      success: false as const,
      error: "Nome contém caracteres inválidos.",
    };
  }

  return { success: true as const, value: trimmed };
}

async function moderateTribunalText(text: string): Promise<ModerationResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    return {
      ok: true,
      flagged: false,
      unavailable: true,
      reason: "OPENAI_API_KEY não configurada",
    };
  }

  try {
    const response = await fetch("https://api.openai.com/v1/moderations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "omni-moderation-latest",
        input: text,
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      const body = await response.text();
      logger.warn(
        "[Tribunais] Moderação indisponível:",
        response.status,
        body.slice(0, 300),
      );
      return {
        ok: true,
        flagged: false,
        unavailable: true,
        reason: `HTTP ${response.status}`,
      };
    }

    const payload = (await response.json()) as {
      results?: Array<{ flagged?: boolean }>;
    };

    const flagged = Boolean(payload.results?.some((item) => item.flagged));
    return {
      ok: !flagged,
      flagged,
      unavailable: false,
      reason: flagged ? "Conteúdo bloqueado pela moderação automática" : undefined,
    };
  } catch (error) {
    logger.warn("[Tribunais] Falha ao chamar moderação automática", error);
    return {
      ok: true,
      flagged: false,
      unavailable: true,
      reason: "Falha de comunicação com moderação automática",
    };
  }
}

function decodeHtmlEntities(value: string) {
  const namedEntities: Record<string, string> = {
    "&amp;": "&",
    "&quot;": '"',
    "&#39;": "'",
    "&#x27;": "'",
    "&lt;": "<",
    "&gt;": ">",
    "&nbsp;": " ",
    "&ordf;": "ª",
    "&ordm;": "º",
  };

  return value
    .replace(/&#(\d+);/g, (_, decimal: string) =>
      String.fromCodePoint(Number.parseInt(decimal, 10)),
    )
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(
      /&[a-zA-Z0-9#]+;/g,
      (entity) => namedEntities[entity] ?? entity,
    );
}

function sanitizeHtmlText(value: string) {
  return decodeHtmlEntities(value.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchTextWithTimeout(
  url: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; text: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DATAJUD_HTTP_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...init,
      cache: "no-store",
      signal: controller.signal,
    });
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      text,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function resolveDataJudApiKey(): Promise<DataJudApiKeyResolution> {
  const envKey = process.env.DATAJUD_API_KEY?.trim();
  if (envKey) {
    return { key: envKey, source: "env" };
  }

  try {
    const accessResponse = await fetchTextWithTimeout(DATAJUD_ACCESS_PAGE_URL, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "MagicLawyer/1.0 (+https://magiclawyer.vercel.app)",
      },
    });

    if (!accessResponse.ok) {
      return {
        key: null,
        source: "unavailable",
        reason: `Falha ao ler página de acesso do DataJud (HTTP ${accessResponse.status}).`,
      };
    }

    const plainText = sanitizeHtmlText(accessResponse.text);
    const keyMatch = plainText.match(
      /Authorization:\s*APIKey\s*([A-Za-z0-9+/=._-]+)/i,
    );

    if (!keyMatch?.[1]) {
      return {
        key: null,
        source: "unavailable",
        reason: "A chave pública do DataJud não foi encontrada na página oficial.",
      };
    }

    return { key: keyMatch[1].trim(), source: "wiki" };
  } catch (error) {
    return {
      key: null,
      source: "unavailable",
      reason:
        error instanceof Error
          ? error.message
          : "Falha ao consultar chave pública no DataJud.",
    };
  }
}

function mapDataJudCategoryToEsfera(category: string): string | null {
  const normalized = category.trim().toLowerCase();

  if (normalized.includes("estadual")) return "Estadual";
  if (normalized.includes("federal")) return "Federal";
  if (normalized.includes("trabalho")) return "Trabalhista";
  if (normalized.includes("eleitoral")) return "Eleitoral";
  if (normalized.includes("militar")) return "Militar";
  if (normalized.includes("superior")) return "Superior";
  return null;
}

function extractDataJudAliasFromUrl(url: string) {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/\/(api_publica_[^/]+)\/_search\/?$/i);
    return match?.[1]?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

function formatSiglaFromAlias(alias: string) {
  const token = alias.replace(/^api_publica_/i, "").toLowerCase();

  if (token.startsWith("tre-")) {
    return `TRE-${token.slice(4).toUpperCase()}`;
  }

  return token.toUpperCase();
}

function deriveUfFromAlias(alias: string): string | null {
  const token = alias.replace(/^api_publica_/i, "").toLowerCase();

  if (token === "tjdft" || token === "tre-dft") {
    return "DF";
  }

  if (token.startsWith("tre-")) {
    const uf = token.slice(4).toUpperCase();
    return uf.length === 2 ? uf : null;
  }

  if (/^tj[a-z]{2}$/i.test(token)) {
    return token.slice(2).toUpperCase();
  }

  if (/^tjm[a-z]{2}$/i.test(token)) {
    return token.slice(3).toUpperCase();
  }

  return null;
}

function parseDataJudTribunaisFromHtml(html: string): DataJudTribunalRow[] {
  const tribunaisByAlias = new Map<string, DataJudTribunalRow>();
  const detailsRegex =
    /<details[\s\S]*?<summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/gi;
  const rowRegex =
    /<tr>\s*<td>([\s\S]*?)<\/td>\s*<td>\s*<a[^>]*href="([^"]+)"[^>]*>/gi;

  let detailsMatch: RegExpExecArray | null = detailsRegex.exec(html);

  while (detailsMatch) {
    const rawCategory = sanitizeHtmlText(detailsMatch[1] ?? "");
    const category = rawCategory || "Não categorizado";
    const categoryTableHtml = detailsMatch[2] ?? "";
    const esfera = mapDataJudCategoryToEsfera(category);
    let rowMatch: RegExpExecArray | null = rowRegex.exec(categoryTableHtml);

    while (rowMatch) {
      const nome = sanitizeHtmlText(rowMatch[1] ?? "");
      const rawUrl = decodeHtmlEntities(rowMatch[2] ?? "").trim();
      const alias = extractDataJudAliasFromUrl(rawUrl);

      if (nome && alias && !tribunaisByAlias.has(alias)) {
        const normalizedSearchUrl = rawUrl.replace(/\/_search\/?$/i, "/_search");
        tribunaisByAlias.set(alias, {
          nome,
          sigla: formatSiglaFromAlias(alias),
          esfera,
          uf: deriveUfFromAlias(alias),
          siteUrl: normalizedSearchUrl,
          sourceAlias: alias,
          sourceCategory: category,
        });
      }

      rowMatch = rowRegex.exec(categoryTableHtml);
    }

    detailsMatch = detailsRegex.exec(html);
  }

  return Array.from(tribunaisByAlias.values()).sort((a, b) =>
    a.nome.localeCompare(b.nome, "pt-BR"),
  );
}

type DataJudOfficialFetchResult =
  | {
      success: true;
      source: "datajud-wiki";
      requestedUrl: string;
      apiKey: DataJudApiKeyResolution;
      tribunais: DataJudTribunalRow[];
    }
  | {
      success: false;
      source: "datajud-wiki";
      requestedUrl?: string;
      apiKey: DataJudApiKeyResolution;
      error: string;
    };

async function fetchDataJudOfficialTribunais(): Promise<DataJudOfficialFetchResult> {
  const apiKey = await resolveDataJudApiKey();
  let lastError = "Fonte oficial indisponível.";
  let lastUrl: string | undefined;

  for (const candidateUrl of DATAJUD_ENDPOINTS_PAGE_CANDIDATES) {
    lastUrl = candidateUrl;
    try {
      const response = await fetchTextWithTimeout(candidateUrl, {
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "User-Agent": "MagicLawyer/1.0 (+https://magiclawyer.vercel.app)",
        },
      });

      if (!response.ok) {
        lastError = `DataJud indisponível em ${candidateUrl} (HTTP ${response.status}).`;
        continue;
      }

      const tribunais = parseDataJudTribunaisFromHtml(response.text);
      if (!tribunais.length) {
        lastError =
          "A estrutura da página oficial mudou e nenhum tribunal pôde ser extraído.";
        continue;
      }

      if (!apiKey.key) {
        lastError =
          apiKey.reason ??
          "Não foi possível obter a chave pública do DataJud para validar a API.";
        continue;
      }

      const probeUrl = tribunais[0]?.siteUrl;
      if (!probeUrl) {
        lastError =
          "A página oficial não informou endpoint utilizável para validação de conectividade.";
        continue;
      }

      const probe = await fetchTextWithTimeout(probeUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `APIKey ${apiKey.key}`,
          "User-Agent": "MagicLawyer/1.0 (+https://magiclawyer.vercel.app)",
        },
        body: JSON.stringify({ size: 0 }),
      });

      if (!probe.ok) {
        lastError = `Falha na validação da API DataJud (HTTP ${probe.status}).`;
        continue;
      }

      return {
        success: true,
        source: "datajud-wiki",
        requestedUrl: candidateUrl,
        apiKey,
        tribunais,
      };
    } catch (error) {
      lastError =
        error instanceof Error
          ? error.message
          : "Falha ao consultar a página oficial de endpoints do DataJud.";
    }
  }

  return {
    success: false,
    source: "datajud-wiki",
    requestedUrl: lastUrl,
    apiKey,
    error: lastError,
  };
}

export async function syncTribunaisOficiaisDataJud(params?: {
  force?: boolean;
}): Promise<SyncTribunaisOficiaisResult> {
  let redis: ReturnType<typeof getRedisInstance> | null = null;
  let lockToken: string | null = null;

  try {
    const session = await getSession();
    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;
    if (!user.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    if (!canManageTribunais(user)) {
      return {
        success: false,
        error: "Sem permissão para sincronizar tribunais oficiais",
      };
    }

    try {
      redis = getRedisInstance();
    } catch (error) {
      logger.warn("[Tribunais] Redis indisponível para lock de sincronização.", error);
      redis = null;
    }

    if (redis && !params?.force) {
      try {
        const freshSync = await redis.get(DATAJUD_SYNC_FRESH_KEY);
        if (freshSync) {
          return {
            success: true,
            skippedByFresh: true,
            source: "datajud-wiki",
            message:
              "Catálogo oficial já foi sincronizado recentemente. Aguarde alguns minutos para nova varredura.",
          };
        }
      } catch (error) {
        logger.warn(
          "[Tribunais] Falha ao consultar cache de sincronização recente.",
          error,
        );
      }
    }

    if (redis) {
      lockToken = `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
      try {
        const lock = await redis.set(
          DATAJUD_SYNC_LOCK_KEY,
          lockToken,
          "EX",
          DATAJUD_SYNC_LOCK_TTL_SECONDS,
          "NX",
        );

        if (lock !== "OK") {
          const ttl = await redis.ttl(DATAJUD_SYNC_LOCK_KEY);
          const retryAfterSeconds =
            typeof ttl === "number" && ttl > 0
              ? Math.ceil(ttl)
              : DATAJUD_SYNC_LOCK_TTL_SECONDS;

          return {
            success: false,
            error: `Sincronização em andamento. Tente novamente em ${retryAfterSeconds}s.`,
            retryAfterSeconds,
            source: "datajud-wiki",
          };
        }
      } catch (error) {
        logger.warn(
          "[Tribunais] Falha ao adquirir lock Redis. Seguiremos sem lock.",
          error,
        );
        lockToken = null;
      }
    }

    const officialFeed = await fetchDataJudOfficialTribunais();
    if (!officialFeed.success) {
      logger.warn("[Tribunais] Falha na fonte oficial DataJud", {
        error: officialFeed.error,
        requestedUrl: officialFeed.requestedUrl,
        apiKeySource: officialFeed.apiKey.source,
        apiKeyReason: officialFeed.apiKey.reason,
      });

      return {
        success: false,
        error: TRIBUNAIS_SOURCE_UNAVAILABLE_MESSAGE,
        source: officialFeed.source,
        requestedUrl: officialFeed.requestedUrl,
        apiKeySource: officialFeed.apiKey.source,
        message: officialFeed.error,
      };
    }

    const tribunais = officialFeed.tribunais;
    const seenKeys = new Set<string>();
    let criados = 0;
    let atualizados = 0;
    let inalterados = 0;
    let ignorados = 0;

    await prisma.$transaction(async (tx) => {
      for (const tribunal of tribunais) {
        const uniqueNameUfKey = `${tribunal.nome.toLowerCase()}::${tribunal.uf ?? ""}`;
        if (seenKeys.has(uniqueNameUfKey)) {
          ignorados += 1;
          continue;
        }
        seenKeys.add(uniqueNameUfKey);

        const existingGlobal = await tx.tribunal.findFirst({
          where: {
            nome: tribunal.nome,
            uf: tribunal.uf ?? null,
            tenantId: null,
          },
        });

        if (existingGlobal) {
          const changed =
            (existingGlobal.sigla ?? null) !== (tribunal.sigla ?? null) ||
            (existingGlobal.esfera ?? null) !== (tribunal.esfera ?? null) ||
            (existingGlobal.siteUrl ?? null) !== (tribunal.siteUrl ?? null);

          if (!changed) {
            inalterados += 1;
            continue;
          }

          await tx.tribunal.update({
            where: { id: existingGlobal.id },
            data: {
              sigla: tribunal.sigla,
              esfera: tribunal.esfera,
              siteUrl: tribunal.siteUrl,
            },
          });
          atualizados += 1;
          continue;
        }

        const conflictingTenant = await tx.tribunal.findFirst({
          where: {
            nome: tribunal.nome,
            uf: tribunal.uf ?? null,
            tenantId: { not: null },
          },
          select: { id: true },
        });

        if (conflictingTenant) {
          ignorados += 1;
          continue;
        }

        await tx.tribunal.create({
          data: {
            tenantId: null,
            nome: tribunal.nome,
            sigla: tribunal.sigla,
            esfera: tribunal.esfera,
            uf: tribunal.uf,
            siteUrl: tribunal.siteUrl,
          },
        });
        criados += 1;
      }
    });

    if (redis) {
      try {
        await redis.set(
          DATAJUD_SYNC_FRESH_KEY,
          String(Date.now()),
          "EX",
          DATAJUD_SYNC_FRESH_TTL_SECONDS,
        );
      } catch (error) {
        logger.warn("[Tribunais] Falha ao escrever cache de sincronização.", error);
      }
    }

    return {
      success: true,
      source: officialFeed.source,
      requestedUrl: officialFeed.requestedUrl,
      apiKeySource: officialFeed.apiKey.source,
      totalRecebido: tribunais.length,
      criados,
      atualizados,
      inalterados,
      ignorados,
      message: "Catálogo oficial sincronizado com sucesso.",
    };
  } catch (error) {
    logger.error("Erro ao sincronizar tribunais oficiais:", error);
    return {
      success: false,
      error: TRIBUNAIS_SOURCE_UNAVAILABLE_MESSAGE,
    };
  } finally {
    if (redis && lockToken) {
      try {
        const currentLockToken = await redis.get(DATAJUD_SYNC_LOCK_KEY);
        if (currentLockToken === lockToken) {
          await redis.del(DATAJUD_SYNC_LOCK_KEY);
        }
      } catch (error) {
        logger.warn("[Tribunais] Falha ao liberar lock de sincronização.", error);
      }
    }
  }
}

async function ensureAutoSyncTribunaisOficiais() {
  let redis: ReturnType<typeof getRedisInstance> | null = null;

  try {
    redis = getRedisInstance();
  } catch {
    return;
  }

  const { dateKey, window } = getBrazilDateWindowRef();
  if (!window || !redis) {
    return;
  }

  const doneKey = `tribunais:datajud:auto-sync:done:${dateKey}:${window}`;
  const failCooldownKey = `tribunais:datajud:auto-sync:fail:${dateKey}:${window}`;

  try {
    const [alreadyDone, inFailCooldown] = await Promise.all([
      redis.get(doneKey),
      redis.get(failCooldownKey),
    ]);

    if (alreadyDone || inFailCooldown) {
      return;
    }
  } catch {
    return;
  }

  const result = await syncTribunaisOficiaisDataJud({ force: true });
  if (!redis) return;

  try {
    if (result.success) {
      await redis.set(doneKey, String(Date.now()), "EX", 24 * 60 * 60);
      await redis.del(failCooldownKey);
      return;
    }

    await redis.set(
      failCooldownKey,
      result.error || "sync_failed",
      "EX",
      DATAJUD_AUTO_SYNC_FAIL_COOLDOWN_SECONDS,
    );
  } catch (error) {
    logger.warn("[Tribunais] Falha ao registrar estado de auto-sync.", error);
  }
}

export async function listTribunaisParaVinculo() {
  try {
    const session = await getSession();
    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;
    if (!user.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    await ensureAutoSyncTribunaisOficiais();

    const tribunais = await prisma.tribunal.findMany({
      where: {
        deletedAt: null,
        OR: [{ tenantId: null }, { tenantId: user.tenantId }],
      },
      select: {
        id: true,
        nome: true,
        sigla: true,
        esfera: true,
        uf: true,
      },
      orderBy: [{ nome: "asc" }],
    });

    return { success: true, tribunais };
  } catch (error) {
    logger.error("Erro ao listar tribunais para vínculo:", error);
    return { success: false, error: "Erro ao listar tribunais" };
  }
}

export async function listTribunais(params?: { uf?: string; esfera?: string }) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;

    if (!user.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    if (!canManageTribunais(user)) {
      return {
        success: false,
        error: "Sem permissão para visualizar tribunais",
      };
    }

    await ensureAutoSyncTribunaisOficiais();

    const where: any = {};
    where.deletedAt = null;
    where.OR = [{ tenantId: null }, { tenantId: user.tenantId }];

    if (params?.uf) {
      where.uf = params.uf;
    }

    if (params?.esfera) {
      where.esfera = params.esfera;
    }

    const tribunaisRaw = await prisma.tribunal.findMany({
      where,
      include: {
        _count: {
          select: {
            processos: {
              where: {
                deletedAt: null,
              },
            },
            juizes: true,
          },
        },
      },
      orderBy: [{ uf: "asc" }, { nome: "asc" }],
    });

    const tribunalIds = tribunaisRaw.map((tribunal) => tribunal.id);
    const [processCountsByTribunal, juizesVinculados] = tribunalIds.length
      ? await Promise.all([
          prisma.processo.groupBy({
            by: ["tribunalId"],
            where: {
              tenantId: user.tenantId,
              tribunalId: { in: tribunalIds },
              deletedAt: null,
            },
            _count: {
              _all: true,
            },
          }),
          prisma.processo.findMany({
            where: {
              tenantId: user.tenantId,
              tribunalId: { in: tribunalIds },
              juizId: { not: null },
              deletedAt: null,
            },
            select: {
              tribunalId: true,
              juizId: true,
            },
            distinct: ["tribunalId", "juizId"],
          }),
        ])
      : [[], []];

    const processoCountMap = new Map<string, number>(
      processCountsByTribunal
        .filter(
          (item): item is typeof item & { tribunalId: string } =>
            typeof item.tribunalId === "string",
        )
        .map((item) => [item.tribunalId, item._count._all] as const),
    );
    const juizCountMap = new Map<string, number>();

    for (const item of juizesVinculados) {
      if (typeof item.tribunalId !== "string") continue;
      const current = juizCountMap.get(item.tribunalId) ?? 0;
      juizCountMap.set(item.tribunalId, current + 1);
    }

    const isSuperAdmin = user.role === "SUPER_ADMIN";
    const tribunais = tribunaisRaw.map((tribunal) => {
      const isOwnedByTenant =
        Boolean(tribunal.tenantId) && tribunal.tenantId === user.tenantId;
      const isGlobal = tribunal.tenantId === null;
      const canEdit = isSuperAdmin || isOwnedByTenant;
      const processosCount = processoCountMap.get(tribunal.id) ?? 0;
      const juizesCount = juizCountMap.get(tribunal.id) ?? 0;

      return {
        ...tribunal,
        _count: {
          ...tribunal._count,
          processos: processosCount,
          juizes: juizesCount,
        },
        isGlobal,
        isOwnedByTenant,
        canEdit,
        canDelete: canEdit,
      };
    });

    return { success: true, tribunais };
  } catch (error) {
    logger.error("Erro ao listar tribunais:", error);

    return { success: false, error: "Erro ao listar tribunais" };
  }
}

export async function getTribunal(id: string) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;

    if (!user.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    if (!canManageTribunais(user)) {
      return {
        success: false,
        error: "Sem permissão para visualizar tribunais",
      };
    }

    const tribunal = await prisma.tribunal.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        _count: {
          select: {
            processos: {
              where: {
                deletedAt: null,
              },
            },
            juizes: true,
          },
        },
      },
    });

    if (!tribunal) {
      return { success: false, error: "Tribunal não encontrado" };
    }

    return { success: true, tribunal };
  } catch (error) {
    logger.error("Erro ao buscar tribunal:", error);

    return { success: false, error: "Erro ao buscar tribunal" };
  }
}

export async function createTribunal(data: TribunalCreatePayload) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;

    if (!user.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    if (!canManageTribunais(user)) {
      return {
        success: false,
        error: "Sem permissão para criar tribunais",
      };
    }

    // Validações
    const nomeCheck = validateTribunalName(data.nome);
    if (!nomeCheck.success) {
      return { success: false, error: nomeCheck.error };
    }
    const nome = nomeCheck.value;

    const uf = normalizeNullableText(data.uf ?? null);
    const sigla = normalizeNullableText(data.sigla ?? null);
    const esfera = normalizeNullableText(data.esfera ?? null);
    const websiteCheck = validateTribunalWebsite(data.siteUrl ?? null);
    if (!websiteCheck.success) {
      return { success: false, error: websiteCheck.error };
    }
    const siteUrl = websiteCheck.value;

    const moderation = await moderateTribunalText(
      [nome, sigla ?? "", esfera ?? "", uf ?? ""].filter(Boolean).join(" | "),
    );
    if (!moderation.ok) {
      return {
        success: false,
        error:
          "Cadastro bloqueado pela política de qualidade do catálogo global. Revise o conteúdo.",
      };
    }

    // Verificar se tribunal já existe (mesmo nome e UF)
    const tribunalExistente = await prisma.tribunal.findFirst({
      where: {
        nome,
        uf: uf ?? null,
        deletedAt: null,
      },
    });

    if (tribunalExistente) {
      if (tribunalExistente.tenantId === user.tenantId) {
        return {
          success: false,
          error: "Já existe um tribunal com este nome nesta UF",
        };
      }

      return {
        success: false,
        error:
          "Este tribunal já existe no catálogo do sistema. Use o tribunal existente.",
      };
    }

    const tribunal = await prisma.tribunal.create({
      data: {
        nome,
        sigla,
        esfera,
        uf,
        siteUrl,
        tenantId: user.tenantId,
      },
    });

    logger.info(`Tribunal criado: ${tribunal.id} por usuário ${user.email}`);

    return { success: true, tribunal };
  } catch (error) {
    logger.error("Erro ao criar tribunal:", error);

    return { success: false, error: "Erro ao criar tribunal" };
  }
}

export async function updateTribunal(id: string, data: TribunalUpdatePayload) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;

    if (!user.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    if (!canManageTribunais(user)) {
      return {
        success: false,
        error: "Sem permissão para editar tribunais",
      };
    }

    // Verificar se o tribunal existe e pertence ao tenant
    const tribunalExistente = await prisma.tribunal.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

    if (!tribunalExistente) {
      return { success: false, error: "Tribunal não encontrado" };
    }

    const isSuperAdmin = user.role === "SUPER_ADMIN";
    const isOwnerTenant =
      Boolean(tribunalExistente.tenantId) &&
      tribunalExistente.tenantId === user.tenantId;

    if (!isSuperAdmin && !isOwnerTenant) {
      return {
        success: false,
        error: "Você só pode editar tribunais criados pelo seu escritório.",
      };
    }

    // Se mudando nome ou UF, verificar duplicidade
    if (data.nome || data.uf) {
      const nomeCheck =
        data.nome !== undefined
          ? normalizeRequiredText(data.nome)
          : tribunalExistente.nome;
      const ufCheck =
        data.uf !== undefined
          ? normalizeNullableText(data.uf)
          : tribunalExistente.uf;

      const duplicado = await prisma.tribunal.findFirst({
        where: {
          nome: nomeCheck,
          uf: ufCheck,
          deletedAt: null,
          id: {
            not: id,
          },
        },
      });

      if (duplicado) {
        return {
          success: false,
          error: "Já existe um tribunal com este nome nesta UF",
        };
      }
    }

    const updateData: any = {};

    if (data.nome !== undefined) {
      const nomeCheck = validateTribunalName(data.nome);
      if (!nomeCheck.success) {
        return { success: false, error: nomeCheck.error };
      }
      updateData.nome = nomeCheck.value;
    }
    if (data.sigla !== undefined) updateData.sigla = normalizeNullableText(data.sigla);
    if (data.esfera !== undefined) updateData.esfera = normalizeNullableText(data.esfera);
    if (data.uf !== undefined) updateData.uf = normalizeNullableText(data.uf);
    if (data.siteUrl !== undefined) {
      const websiteCheck = validateTribunalWebsite(data.siteUrl);
      if (!websiteCheck.success) {
        return { success: false, error: websiteCheck.error };
      }
      updateData.siteUrl = websiteCheck.value;
    }

    if (
      updateData.nome !== undefined ||
      updateData.sigla !== undefined ||
      updateData.esfera !== undefined ||
      updateData.uf !== undefined
    ) {
      const moderation = await moderateTribunalText(
        [
          updateData.nome ?? tribunalExistente.nome,
          updateData.sigla ?? tribunalExistente.sigla ?? "",
          updateData.esfera ?? tribunalExistente.esfera ?? "",
          updateData.uf ?? tribunalExistente.uf ?? "",
        ]
          .filter(Boolean)
          .join(" | "),
      );
      if (!moderation.ok) {
        return {
          success: false,
          error:
            "Atualização bloqueada pela política de qualidade do catálogo global.",
        };
      }
    }

    const tribunal = await prisma.tribunal.update({
      where: { id },
      data: updateData,
    });

    logger.info(`Tribunal atualizado: ${id} por usuário ${user.email}`);

    return { success: true, tribunal };
  } catch (error) {
    logger.error("Erro ao atualizar tribunal:", error);

    return { success: false, error: "Erro ao atualizar tribunal" };
  }
}

export async function deleteTribunal(id: string) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;

    if (!user.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    if (!canManageTribunais(user)) {
      return {
        success: false,
        error: "Sem permissão para excluir tribunais",
      };
    }

    // Verificar se o tribunal existe e pertence ao tenant
    const tribunal = await prisma.tribunal.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        _count: {
          select: {
            processos: {
              where: {
                deletedAt: null,
              },
            },
            juizes: true,
          },
        },
      },
    });

    if (!tribunal) {
      return { success: false, error: "Tribunal não encontrado" };
    }

    const isSuperAdmin = user.role === "SUPER_ADMIN";
    const isOwnerTenant =
      Boolean(tribunal.tenantId) && tribunal.tenantId === user.tenantId;

    if (!isSuperAdmin && !isOwnerTenant) {
      return {
        success: false,
        error: "Você só pode excluir tribunais criados pelo seu escritório.",
      };
    }

    // Verificar se há processos ou juízes vinculados
    const totalVinculados = tribunal._count.processos + tribunal._count.juizes;

    if (totalVinculados > 0) {
      return {
        success: false,
        error: `Não é possível excluir. Existem ${tribunal._count.processos} processo(s) e ${tribunal._count.juizes} juiz(es) vinculado(s) a este tribunal.`,
      };
    }

    await prisma.tribunal.update({
      where: { id },
      data: buildSoftDeletePayload(
        {
          actorId: user.id ?? null,
          actorType: user.role ?? "USER",
        },
        "Exclusão manual de tribunal",
      ),
    });

    logger.info(`Tribunal deletado: ${id} por usuário ${user.email}`);

    return { success: true };
  } catch (error) {
    logger.error("Erro ao deletar tribunal:", error);

    return { success: false, error: "Erro ao deletar tribunal" };
  }
}
