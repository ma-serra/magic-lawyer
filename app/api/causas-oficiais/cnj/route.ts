import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";
import crypto from "node:crypto";
import type { Redis } from "ioredis";
import logger from "@/lib/logger";

const CNJ_SGT_ENDPOINT = "https://www.cnj.jus.br/sgt/sgt_ws.php";
const SOAP_TIMEOUT_MS = 12000;
const SEARCH_LIMIT = 14;
const MAX_QUERY_LENGTH = 60;
const CAUSAS_RATE_LIMIT_MAX_REQUESTS = 4;
const CAUSAS_RATE_LIMIT_WINDOW_SECONDS = 60;
const CAUSAS_FULL_CACHE_TTL_SECONDS = 20 * 60;
const CAUSAS_QUERY_CACHE_TTL_SECONDS = 60 * 60;
const CAUSAS_FETCH_LOCK_TTL_SECONDS = 60;

const CNJ_RATE_LIMIT_KEY_PREFIX = "causas:cnj:rate-limit";
const CNJ_FULL_CACHE_KEY_PREFIX = "causas:cnj:cache:full";
const CNJ_QUERY_CACHE_KEY_PREFIX = "causas:cnj:cache:query";
const CNJ_FETCH_LOCK_KEY = "causas:cnj:fetch:global-lock";

let redisClient: Redis | null = null;

type CausaPayload = {
  nome: string;
  codigoCnj: string | null;
  descricao: string | null;
};

type FetchResult =
  | {
      success: true;
      causas: CausaPayload[];
      total: number;
      source: "cnj-sgt-soap" | "cache";
    }
  | {
      success: false;
      error:
        | "CNJ retornou status com erro"
        | "CNJ retornou SoapFault"
        | "Erro de comunicação com CNJ"
        | "Resposta CNJ inválida";
      details?: string;
    };

type QuerySourceCachedResult = {
  version: number;
  createdAt: string;
  query: string;
  tipoTabela: string;
  tipoPesquisa: string;
  result: FetchResult;
};

type FullSyncResult = {
  version: number;
  createdAt: string;
  payload: {
    success: boolean;
    source: string;
    total: number;
    consultas: Array<{
      query: string;
      count: number;
      error?: string;
    }>;
    causas: CausaPayload[];
  };
};

const DEFAULT_SEARCH_TERMS = [
  "acao",
  "divorcio",
  "execu",
  "familia",
  "trabalh",
  "consumi",
  "tribut",
  "penal",
  "administr",
  "constitui",
  "mandado",
  "aposent",
  "propria",
  "imobili",
];

function sanitizeTextSearch(value: string | null | undefined): string {
  const raw = value?.trim() || "";

  return raw
    .replace(/\s+/g, " ")
    .replace(/[^A-Za-z0-9\s\-]/g, "")
    .slice(0, MAX_QUERY_LENGTH)
    .toLowerCase();
}

function sanitizeShortCode(value: string, fallback = "C"): string {
  const raw = value?.trim().toUpperCase() || "";
  const normalized = raw.replace(/[^A-Z]/g, "");
  return normalized ? normalized.slice(0, 1) : fallback;
}

function getClientIp(request: NextRequest) {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    return xff.split(",")[0]?.trim() || "anonymous";
  }

  const xr = request.headers.get("x-real-ip");
  if (xr) {
    return xr.trim();
  }

  return "anonymous";
}

function hash(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function getQueryCacheKey(
  query: string,
  tipoTabela: string,
  tipoPesquisa: string,
) {
  return `${CNJ_QUERY_CACHE_KEY_PREFIX}:${hash(`${tipoTabela}|${tipoPesquisa}|${query}`)}`;
}

function buildFullCacheKey(
  tipoTabela: string,
  tipoPesquisa: string,
  queries: string[],
) {
  const source = {
    tipoTabela,
    tipoPesquisa,
    queries,
    v: "v1",
  };

  return `${CNJ_FULL_CACHE_KEY_PREFIX}:${hash(JSON.stringify(source))}`;
}

async function getRedisClient() {
  if (redisClient) {
    return redisClient;
  }

  try {
    const { getRedisInstance } = await import(
      "@/app/lib/notifications/redis-singleton"
    );
    const redis = getRedisInstance();
    await redis.ping();
    redisClient = redis;

    return redis;
  } catch (error) {
    logger.warn("Redis indisponível para cache de causas oficiais.", error);
    redisClient = null;

    return null;
  }
}

async function getCachedJson<T>(redis: Redis, key: string) {
  try {
    const raw = await redis.get(key);
    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as T;
  } catch (error) {
    logger.warn("Falha ao ler cache de causas oficiais:", error);

    return null;
  }
}

async function setCachedJson(
  redis: Redis,
  key: string,
  ttlSeconds: number,
  payload: unknown,
) {
  try {
    await redis.set(key, JSON.stringify(payload), "EX", ttlSeconds);
  } catch (error) {
    logger.warn("Falha ao salvar cache de causas oficiais:", error);
  }
}

function normalizeResponsePayload(
  payload: FullSyncResult["payload"],
  source: string,
  fromCache: boolean,
) {
  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "public, max-age=60",
      "X-Cache-Status": fromCache ? "HIT" : "MISS",
      "X-Causas-Source": source,
    },
  });
}

async function checkRateLimit(redis: Redis, request: NextRequest) {
  const ip = getClientIp(request);
  const windowSeconds = CAUSAS_RATE_LIMIT_WINDOW_SECONDS;
  const maxRequests = CAUSAS_RATE_LIMIT_MAX_REQUESTS;
  const key = `${CNJ_RATE_LIMIT_KEY_PREFIX}:${ip}:${windowSeconds}`;

  const currentCount = await redis.incr(key);
  if (currentCount === 1) {
    await redis.set(key, String(currentCount), "EX", windowSeconds);
  }

  if (currentCount > maxRequests) {
    const ttl = await redis.ttl(key);
    const retryAfterSeconds =
      ttl > 0 ? Math.min(windowSeconds, Math.ceil(ttl / 1000)) : windowSeconds;

    return {
      allowed: false as const,
      retryAfterSeconds: Math.max(1, retryAfterSeconds),
    };
  }

  return { allowed: true as const };
}

async function acquireFetchLock(redis: Redis) {
  const lockToken = `${Date.now()}-${crypto.randomUUID()}`;
  const lockResult = await redis.set(
    CNJ_FETCH_LOCK_KEY,
    lockToken,
    "EX",
    CAUSAS_FETCH_LOCK_TTL_SECONDS,
    "NX",
  );

  if (lockResult !== "OK") {
    const ttl = await redis.ttl(CNJ_FETCH_LOCK_KEY);
    const retryAfterSeconds =
      ttl > 0
        ? Math.min(CAUSAS_FETCH_LOCK_TTL_SECONDS, Math.ceil(ttl / 1000))
        : CAUSAS_FETCH_LOCK_TTL_SECONDS;

    return {
      acquired: false as const,
      retryAfterSeconds: Math.max(1, retryAfterSeconds),
    };
  }

  return {
    acquired: true as const,
    release: async () => {
      const currentToken = await redis.get(CNJ_FETCH_LOCK_KEY);
      if (currentToken === lockToken) {
        await redis.del(CNJ_FETCH_LOCK_KEY);
      }
    },
  };
}

function stripHtml(value: string): string {
  const normalized = value
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&nbsp;?/gi, " ");

  return cheerio
    .load(`<div>${normalized}</div>`, null, false)("div")
    .text()
    .replace(/\s+/g, " ")
    .trim();
}

function extractTag(content: string, tag: string): string | null {
  const pattern = new RegExp(
    `<(?:ns1:)?${tag}>([\\s\\S]*?)<\\/(?:ns1:)?${tag}>`,
    "i",
  );
  const match = pattern.exec(content);

  if (!match?.[1]) {
    return null;
  }

  return match[1].trim();
}

function parseSoapItems(xml: string): CausaPayload[] {
  const itemPattern = /<(?:ns1:)?Item>([\s\S]*?)<\/(?:ns1:)?Item>/gi;
  const map = new Map<string, CausaPayload>();
  let match: RegExpExecArray | null;

  while ((match = itemPattern.exec(xml)) !== null) {
    const raw = match[1];
    const nomeRaw = extractTag(raw, "nome");

    if (!nomeRaw) {
      continue;
    }

    const nome = stripHtml(nomeRaw);
    if (!nome) {
      continue;
    }

    const key = nome.toLowerCase();
    if (map.has(key)) {
      continue;
    }

    const codeRaw = extractTag(raw, "cod_item");
    const descricaoRaw = extractTag(raw, "dscGlossario");

    map.set(key, {
      nome,
      codigoCnj: codeRaw && codeRaw.length > 0 ? codeRaw.trim() : null,
      descricao:
        descricaoRaw && descricaoRaw.length > 0
          ? stripHtml(descricaoRaw)
          : null,
    });
  }

  return Array.from(map.values());
}

function buildSoapEnvelope(
  search: string,
  tipoTabela: string,
  tipoPesquisa: string,
): string {
  const escaped = search
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

  return `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:sgt="${CNJ_SGT_ENDPOINT}"><soapenv:Body><sgt:pesquisarItemPublicoWS><tipoTabela>${tipoTabela}</tipoTabela><tipoPesquisa>${tipoPesquisa}</tipoPesquisa><valorPesquisa>${escaped}</valorPesquisa></sgt:pesquisarItemPublicoWS></soapenv:Body></soapenv:Envelope>`;
}

async function fetchCausasFromCNJ(
  search: string,
  tipoTabela: string,
  tipoPesquisa: string,
  redis: Redis | null,
): Promise<FetchResult> {
  const normalizedSearch = sanitizeTextSearch(search);
  const queryHash = getQueryCacheKey(
    normalizedSearch,
    tipoTabela,
    tipoPesquisa,
  );

  if (redis) {
    const cached = await getCachedJson<QuerySourceCachedResult>(
      redis,
      queryHash,
    );
    if (cached?.result?.success) {
      return cached.result;
    }
  }

  const envelope = buildSoapEnvelope(
    normalizedSearch,
    tipoTabela,
    tipoPesquisa,
  );
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, SOAP_TIMEOUT_MS);

  try {
    const response = await fetch(CNJ_SGT_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: `"${CNJ_SGT_ENDPOINT}#pesquisarItemPublicoWS"`,
      },
      body: envelope,
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        success: false,
        error: "CNJ retornou status com erro",
        details: `HTTP ${response.status}`,
      };
    }

    const xml = await response.text();
    if (!xml) {
      return {
        success: false,
        error: "Resposta CNJ inválida",
      };
    }

    if (/SoapFault/i.test(xml) || /faultstring/i.test(xml)) {
      return { success: false, error: "CNJ retornou SoapFault" };
    }

    const causas = parseSoapItems(xml);
    const result: FetchResult = {
      success: true,
      causas,
      total: causas.length,
      source: "cnj-sgt-soap",
    };

    if (redis && result.success && causas.length > 0) {
      await setCachedJson(redis, queryHash, CAUSAS_QUERY_CACHE_TTL_SECONDS, {
        version: 1,
        createdAt: new Date().toISOString(),
        query: normalizedSearch,
        tipoTabela,
        tipoPesquisa,
        result,
      } satisfies QuerySourceCachedResult);
    }

    return result;
  } catch (error) {
    return {
      success: false,
      error: "Erro de comunicação com CNJ",
      details: String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

function normalizeQueries(values: string[]) {
  const normalized = values
    .flatMap((value) => value.split(","))
    .map((value) => sanitizeTextSearch(value))
    .filter((value) => value.length >= 3)
    .filter((value, index, arr) => arr.indexOf(value) === index)
    .sort()
    .slice(0, SEARCH_LIMIT);

  return normalized.length ? normalized : DEFAULT_SEARCH_TERMS;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const tipoTabela = sanitizeShortCode(
    searchParams.get("tipoTabela") || "",
    "C",
  );
  const tipoPesquisa = sanitizeShortCode(
    searchParams.get("tipoPesquisa") || "",
    "N",
  );
  const requestedQueries = searchParams.getAll("q");
  const queries = normalizeQueries(
    requestedQueries.length ? requestedQueries : DEFAULT_SEARCH_TERMS,
  );

  const fullCacheKey = buildFullCacheKey(tipoTabela, tipoPesquisa, queries);
  const redis = await getRedisClient();
  const cachedFull = redis
    ? await getCachedJson<FullSyncResult>(redis, fullCacheKey)
    : null;
  if (cachedFull?.payload?.success) {
    return normalizeResponsePayload(
      cachedFull.payload,
      cachedFull.payload.source,
      true,
    );
  }

  if (redis) {
    const rateLimit = await checkRateLimit(redis, request);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: "Taxa de solicitações excedida. Tente novamente em instantes.",
          retryAfterSeconds: rateLimit.retryAfterSeconds,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimit.retryAfterSeconds ?? 60),
          },
        },
      );
    }
  }

  const diagnostics: Array<{
    query: string;
    count: number;
    error?: string;
  }> = [];

  const merged = new Map<string, CausaPayload>();
  let hadSuccess = false;

  const fetchWithLock = async () => {
    for (const query of queries) {
      const result = await fetchCausasFromCNJ(
        query,
        tipoTabela,
        tipoPesquisa,
        redis,
      );

      if (!result.success) {
        diagnostics.push({
          query,
          count: 0,
          error: result.error,
        });
        continue;
      }

      hadSuccess = true;
      diagnostics.push({
        query,
        count: result.total,
      });

      for (const causa of result.causas) {
        const key = `${causa.nome.toLowerCase()}|${causa.codigoCnj ?? ""}`;
        if (!merged.has(key)) {
          merged.set(key, causa);
        }
      }
    }
  };

  if (redis) {
    const lock = await acquireFetchLock(redis);
    if (!lock.acquired) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Sincronização em andamento. Aguarde alguns segundos e tente novamente.",
          retryAfterSeconds: lock.retryAfterSeconds,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(lock.retryAfterSeconds),
          },
        },
      );
    }

    try {
      await fetchWithLock();
    } finally {
      await lock.release();
    }
  } else {
    await fetchWithLock();
  }

  if (!merged.size) {
    return NextResponse.json(
      {
        success: false,
        error: "Não foi possível obter causas oficiais no momento.",
        consultas: diagnostics,
        source: "cnj-sgt-soap",
      },
      { status: 502 },
    );
  }

  const payload = {
    success: true,
    source: hadSuccess ? "cnj-sgt-soap" : "cnj-offline",
    total: merged.size,
    consultas: diagnostics,
    causas: Array.from(merged.values()),
  };

  if (redis) {
    await setCachedJson(redis, fullCacheKey, CAUSAS_FULL_CACHE_TTL_SECONDS, {
      version: 1,
      createdAt: new Date().toISOString(),
      payload,
    } satisfies FullSyncResult);
  }

  return normalizeResponsePayload(payload, payload.source, false);
}
