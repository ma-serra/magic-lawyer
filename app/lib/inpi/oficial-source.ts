import { createInterface } from "node:readline";
import { Readable } from "node:stream";

import { INPI_CATALOG_SYNC_CANCELED_ERROR } from "./catalog-sync-control";
import { normalizeNiceClassCode } from "./nice-classes";
import logger from "@/lib/logger";

const INPI_MARCAS_BIBLIO_URL =
  "https://dadosabertos.inpi.gov.br/download/marcas/MARCAS_DADOS_BIBLIOGRAFICOS.csv";
const INPI_MARCAS_CLASSIFICACAO_NACIONAL_URL =
  "https://dadosabertos.inpi.gov.br/download/marcas/MARCAS_CLASSIFICACOES_NACIONAIS.csv";

const INPI_PORTAL_BASE_URL = "https://busca.inpi.gov.br/pePI";
const INPI_PORTAL_LOGIN_URL = `${INPI_PORTAL_BASE_URL}/servlet/LoginController?action=login`;
const INPI_PORTAL_SEARCH_URL = `${INPI_PORTAL_BASE_URL}/servlet/MarcasServletController`;
const INPI_PORTAL_SEARCH_REFERER = `${INPI_PORTAL_BASE_URL}/jsp/marcas/Pesquisa_classe_basica.jsp`;
const INPI_PORTAL_USER_AGENT =
  "Mozilla/5.0 (compatible; MagicLawyerBot/1.0; +https://magiclawyer.app)";

function normalizeTerm(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function tokenizeNormalized(value: string): string[] {
  return value
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function hasBoundaryTokenMatch(
  normalizedCandidate: string,
  normalizedQuery: string,
): boolean {
  const candidateTokens = tokenizeNormalized(normalizedCandidate);
  const queryTokens = tokenizeNormalized(normalizedQuery);

  if (!candidateTokens.length || !queryTokens.length) {
    return false;
  }

  if (queryTokens.length === 1) {
    const query = queryTokens[0];

    return candidateTokens.some(
      (candidate) =>
        candidate === query ||
        candidate.startsWith(query) ||
        (query.startsWith(candidate) &&
          candidate.length >= Math.max(4, query.length - 1)),
    );
  }

  return queryTokens.every((query) =>
    candidateTokens.some(
      (candidate) =>
        candidate === query ||
        candidate.startsWith(query) ||
        (query.startsWith(candidate) &&
          candidate.length >= Math.max(4, query.length - 1)),
    ),
  );
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }

      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);

  return values;
}

function classToNice(value: string | null | undefined): string | null {
  return normalizeNiceClassCode(value);
}

function computeNameScore(targetNormalized: string, candidateName: string): number {
  const normalizedCandidate = normalizeTerm(candidateName);

  if (!normalizedCandidate) {
    return 0;
  }

  if (normalizedCandidate === targetNormalized) {
    return 100;
  }

  if (
    normalizedCandidate.startsWith(targetNormalized) ||
    targetNormalized.startsWith(normalizedCandidate)
  ) {
    return 92;
  }

  if (hasBoundaryTokenMatch(normalizedCandidate, targetNormalized)) {
    return 80;
  }

  const targetTokens = tokenizeNormalized(targetNormalized).filter(
    (token) => token.length >= 3,
  );
  const candidateTokens = tokenizeNormalized(normalizedCandidate).filter(
    (token) => token.length >= 3,
  );
  const candidateSet = new Set(candidateTokens);
  const shared = targetTokens.filter((token) => candidateSet.has(token)).length;

  if (!targetTokens.length || shared === 0) {
    return 0;
  }

  const ratio = shared / targetTokens.length;

  if (ratio >= 0.8) {
    return 72;
  }

  if (ratio >= 0.5) {
    return 60;
  }

  return 45;
}

type CsvRow = Record<string, string>;

async function forEachCsvRow(
  url: string,
  onRow: (row: CsvRow) => Promise<boolean> | boolean,
  options?: { timeoutMs?: number },
) {
  const timeoutMs = Math.max(options?.timeoutMs ?? 20_000, 5_000);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort("csv_fetch_timeout"), timeoutMs);
  let response: Response;

  try {
    response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "AbortError" || error.message.includes("AbortError"))
    ) {
      throw new Error("Tempo limite ao consultar fonte oficial do INPI");
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok || !response.body) {
    throw new Error(`Falha ao consultar fonte INPI (${response.status})`);
  }

  const nodeStream = Readable.fromWeb(response.body as any);
  const rl = createInterface({
    input: nodeStream,
    crlfDelay: Infinity,
  });

  let headers: string[] | null = null;

  try {
    for await (const line of rl) {
      const trimmed = line.trim();

      if (!trimmed) {
        continue;
      }

      if (!headers) {
        headers = parseCsvLine(line).map((header) => header.trim());
        continue;
      }

      const values = parseCsvLine(line);
      const row: CsvRow = {};

      for (let i = 0; i < headers.length; i += 1) {
        row[headers[i]] = values[i] ?? "";
      }

      const shouldContinue = await onRow(row);

      if (!shouldContinue) {
        break;
      }
    }
  } finally {
    rl.close();
    nodeStream.destroy();
  }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort("portal_fetch_timeout"), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "AbortError" || error.message.includes("AbortError"))
    ) {
      throw new Error("Tempo limite ao consultar portal oficial do INPI");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function extractCookieHeaderFromResponse(response: Response): string {
  const setCookies: string[] = [];
  const maybeGetSetCookie = (response.headers as any).getSetCookie;

  if (typeof maybeGetSetCookie === "function") {
    const values = maybeGetSetCookie.call(response.headers) as string[];
    if (Array.isArray(values)) {
      setCookies.push(...values);
    }
  }

  if (!setCookies.length) {
    const combined = response.headers.get("set-cookie");
    if (combined) {
      setCookies.push(...combined.split(/,(?=[^;,]+=)/g));
    }
  }

  return setCookies
    .map((entry) => entry.trim().split(";")[0]?.trim())
    .filter(Boolean)
    .join("; ");
}

async function readResponseText(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type") || "";
  const buffer = Buffer.from(await response.arrayBuffer());

  if (/charset\s*=\s*(iso-8859-1|latin1)/i.test(contentType)) {
    return new TextDecoder("latin1").decode(buffer);
  }

  return buffer.toString("utf8");
}

function decodeHtmlEntities(value: string): string {
  const decodeSafeCodePoint = (raw: string, radix: number) => {
    const parsed = Number.parseInt(raw, radix);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 0x10ffff) {
      return "";
    }

    try {
      return String.fromCodePoint(parsed);
    } catch {
      return "";
    }
  };

  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, dec: string) => decodeSafeCodePoint(dec, 10))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      decodeSafeCodePoint(hex, 16),
    );
}

function stripHtml(value: string): string {
  return decodeHtmlEntities(
    value
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function parseIntegerLoose(value: string): number | null {
  const cleaned = value.replace(/[^\d]/g, "");
  if (!cleaned) {
    return null;
  }

  const parsed = Number.parseInt(cleaned, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePortalSummary(html: string): {
  totalFound: number;
  currentPage: number;
  totalPages: number;
} {
  const totalMatch = html.match(
    /Foram encontrados\s*<b>([\d.,]+)<\/b>\s*processos/i,
  );
  const pageMatch = html.match(
    /Mostrando p.{0,2}gina\s*<b>(\d+)<\/b>\s*de\s*<b>(\d+)<\/b>/i,
  );

  return {
    totalFound: parseIntegerLoose(totalMatch?.[1] || "") ?? 0,
    currentPage: parseIntegerLoose(pageMatch?.[1] || "") ?? 1,
    totalPages: parseIntegerLoose(pageMatch?.[2] || "") ?? 1,
  };
}

type InpiPortalRow = {
  nome: string;
  classeNice: string | null;
  processoNumero: string;
  status: string;
  titular: string | null;
};

function parsePortalRows(html: string): InpiPortalRow[] {
  const rows: InpiPortalRow[] = [];
  const rowRegex = /<tr[^>]*class=normal[^>]*>([\s\S]*?)<\/tr>/gi;

  for (const rowMatch of html.matchAll(rowRegex)) {
    const rowHtml = rowMatch[1];
    const cells = Array.from(rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)).map(
      (cell) => stripHtml(cell[1]),
    );

    if (cells.length < 8) {
      continue;
    }

    const processoNumero =
      (cells[0].match(/\d{5,}/)?.[0] || "").trim() || cells[0].trim();
    const nome = cells[3]?.trim() || "";
    const status = cells[5]?.trim() || "Situação não informada";
    const titular = cells[6]?.trim() || null;
    const classeRaw = cells[7] || "";
    const classMatch =
      classeRaw.match(/NCL\(\d+\)\s*([0-9]{1,2})/i)?.[1] ||
      classeRaw.match(/\b([0-9]{1,2})\b/)?.[1] ||
      "";
    const classeNice = normalizeNiceClassCode(classMatch);

    if (!processoNumero || !nome) {
      continue;
    }

    rows.push({
      nome,
      classeNice,
      processoNumero,
      status,
      titular,
    });
  }

  return rows;
}

export interface InpiOfficialSearchOptions {
  term: string;
  classNice?: string;
  limit?: number;
  maxScanRows?: number;
  maxDurationMs?: number;
  exhaustive?: boolean;
  maxMatches?: number;
  onProgress?: (progress: InpiOfficialSearchProgress) => Promise<void> | void;
  shouldCancel?: () => Promise<boolean> | boolean;
}

export interface InpiOfficialSearchItem {
  nome: string;
  classeNice: string | null;
  processoNumero: string;
  titular?: string | null;
  status: string;
  dataDeposito: string | null;
  score: number;
}

export interface InpiOfficialSearchResult {
  items: InpiOfficialSearchItem[];
  scannedRows: number;
  matchedRows: number;
  reachedLimit: boolean;
  reachedTimeout: boolean;
}

export interface InpiOfficialSearchProgress {
  phase: "SCANNING_BIBLIOGRAPHIC" | "SCANNING_CLASSIFICATION" | "FINALIZING";
  scannedRows: number;
  matchedRows: number;
  progressPct: number;
  estimatedTotalRows: number;
  reachedLimit: boolean;
  reachedTimeout: boolean;
}

type CsvCandidate = {
  nome: string;
  numeroInpi: string;
  status: string;
  dataDeposito: string | null;
  score: number;
};

async function throwIfSearchCanceled(
  options: Pick<InpiOfficialSearchOptions, "shouldCancel">,
) {
  if (!options.shouldCancel) {
    return;
  }

  if (await options.shouldCancel()) {
    throw new Error(INPI_CATALOG_SYNC_CANCELED_ERROR);
  }
}

export interface InpiOfficialPortalBatchProgress {
  currentPage: number;
  totalPages: number;
  totalFound: number;
  scannedRows: number;
}

export interface InpiOfficialPortalBatchOptions {
  term: string;
  classNice?: string;
  pageStart: number;
  maxPages?: number;
  shouldCancel?: () => Promise<boolean> | boolean;
  onPage?: (
    progress: InpiOfficialPortalBatchProgress,
  ) => Promise<void> | void;
}

export interface InpiOfficialPortalBatchResult {
  items: InpiOfficialSearchItem[];
  totalPages: number;
  totalFound: number;
  scannedRows: number;
  pageStart: number;
  pageEnd: number;
}

async function searchInpiOfficialPortalSource(
  options: InpiOfficialSearchOptions,
): Promise<InpiOfficialSearchResult> {
  const term = options.term.trim();
  const termNormalized = normalizeTerm(term);

  if (!termNormalized || termNormalized.length < 2) {
    return {
      items: [],
      scannedRows: 0,
      matchedRows: 0,
      reachedLimit: false,
      reachedTimeout: false,
    };
  }

  const classFilter = classToNice(options.classNice);
  const exhaustive = Boolean(options.exhaustive);
  const limit = exhaustive
    ? Math.max(options.limit ?? 500, 50)
    : Math.min(Math.max(options.limit ?? 20, 5), 60);
  const maxScanRows = Math.max(options.maxScanRows ?? 1_500_000, 50_000);
  const maxDurationMs = Math.max(options.maxDurationMs ?? 45_000, 10_000);
  const maxMatches = Math.max(options.maxMatches ?? (exhaustive ? 5_000 : 500), 100);
  const registerPerPage = exhaustive ? 100 : 50;
  const maxPagesByScan = Math.max(1, Math.floor(maxScanRows / registerPerPage));
  const startedAt = Date.now();

  const aggregate = new Map<string, InpiOfficialSearchItem>();
  let reachedLimit = false;
  let reachedTimeout = false;
  let scannedRows = 0;
  let matchedRows = 0;

  await throwIfSearchCanceled(options);

  const emitProgress = async (
    phase: InpiOfficialSearchProgress["phase"],
    force = false,
  ) => {
    if (!options.onProgress) {
      return;
    }

    const denominator = Math.max(matchedRows || scannedRows || 1, 1);
    const baseProgress =
      phase === "FINALIZING"
        ? 100
        : Math.max(1, Math.min(95, Math.round((scannedRows / denominator) * 95)));
    const progressPct = force ? 100 : baseProgress;

    await options.onProgress({
      phase,
      scannedRows,
      matchedRows,
      progressPct,
      estimatedTotalRows: Math.max(matchedRows, scannedRows, 1),
      reachedLimit,
      reachedTimeout,
    });
  };

  const loginResponse = await fetchWithTimeout(
    INPI_PORTAL_LOGIN_URL,
    {
      method: "GET",
      headers: {
        "user-agent": INPI_PORTAL_USER_AGENT,
      },
    },
    Math.min(12_000, maxDurationMs),
  );

  if (!loginResponse.ok) {
    throw new Error(`Falha ao iniciar sessão no portal INPI (${loginResponse.status})`);
  }

  const cookie = extractCookieHeaderFromResponse(loginResponse);

  const body = new URLSearchParams();
  body.set("marca", term);
  body.set("classeInter", classFilter || "");
  body.set("registerPerPage", String(registerPerPage));
  body.set("Action", "searchMarca");
  body.set("tipoPesquisa", "BY_MARCA_CLASSIF_BASICA");
  body.set("buscaExata", exhaustive ? "nao" : "sim");
  body.set("txt", exhaustive ? "Pesquisa Radical" : "Pesquisa Exata");
  body.set("botao", "pesquisar");

  const firstResponse = await fetchWithTimeout(
    INPI_PORTAL_SEARCH_URL,
    {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie,
        referer: INPI_PORTAL_SEARCH_REFERER,
        "user-agent": INPI_PORTAL_USER_AGENT,
      },
      body: body.toString(),
      redirect: "follow",
    },
    Math.min(15_000, maxDurationMs),
  );

  if (!firstResponse.ok) {
    throw new Error(`Falha na busca oficial do portal INPI (${firstResponse.status})`);
  }

  const firstHtml = await readResponseText(firstResponse);
  const firstSummary = parsePortalSummary(firstHtml);
  const totalPages = Math.max(1, Math.min(firstSummary.totalPages, maxPagesByScan));
  matchedRows = firstSummary.totalFound;

  const ingestRows = (rows: InpiPortalRow[]) => {
    for (const row of rows) {
      scannedRows += 1;

      const scoreBase = computeNameScore(termNormalized, row.nome);
      if (scoreBase < 40) {
        continue;
      }

      const score =
        row.classeNice && classFilter && row.classeNice === classFilter
          ? Math.min(scoreBase + 8, 100)
          : scoreBase;

      if (score < 40) {
        continue;
      }

      const key = [
        row.processoNumero,
        normalizeTerm(row.nome),
        normalizeNiceClassCode(row.classeNice) || "sem-classe",
      ].join("|");
      const next: InpiOfficialSearchItem = {
        nome: row.nome,
        classeNice: row.classeNice,
        processoNumero: row.processoNumero,
        titular: row.titular,
        status: row.status,
        dataDeposito: null,
        score,
      };
      const previous = aggregate.get(key);

      if (!previous) {
        aggregate.set(key, next);
        continue;
      }

      const previousQuality =
        previous.score +
        (previous.titular ? 3 : 0) +
        (previous.classeNice ? 1 : 0);
      const nextQuality =
        next.score + (next.titular ? 3 : 0) + (next.classeNice ? 1 : 0);

      if (nextQuality > previousQuality) {
        aggregate.set(key, next);
      }
    }
  };

  ingestRows(parsePortalRows(firstHtml));
  await emitProgress("SCANNING_BIBLIOGRAPHIC");

  for (let page = 2; page <= totalPages; page += 1) {
    await throwIfSearchCanceled(options);

    if (Date.now() - startedAt >= maxDurationMs) {
      reachedTimeout = true;
      break;
    }

    if (aggregate.size >= maxMatches || scannedRows >= maxScanRows) {
      reachedLimit = true;
      break;
    }

    const pageResponse = await fetchWithTimeout(
      `${INPI_PORTAL_SEARCH_URL}?Action=nextPageMarca&page=${page}`,
      {
        method: "GET",
        headers: {
          cookie,
          referer: INPI_PORTAL_SEARCH_REFERER,
          "user-agent": INPI_PORTAL_USER_AGENT,
        },
      },
      Math.min(12_000, Math.max(4_000, maxDurationMs - (Date.now() - startedAt))),
    );

    if (!pageResponse.ok) {
      reachedLimit = true;
      break;
    }

    const pageHtml = await readResponseText(pageResponse);
    const summary = parsePortalSummary(pageHtml);
    matchedRows = Math.max(matchedRows, summary.totalFound);
    ingestRows(parsePortalRows(pageHtml));
    await emitProgress("SCANNING_BIBLIOGRAPHIC");
  }

  if (firstSummary.totalPages > totalPages) {
    reachedLimit = true;
  }

  const items = Array.from(aggregate.values())
    .filter((item) => (classFilter ? item.classeNice === classFilter : true))
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      return a.processoNumero.localeCompare(b.processoNumero);
    })
    .slice(0, exhaustive ? maxMatches : limit);

  if (aggregate.size > (exhaustive ? maxMatches : limit)) {
    reachedLimit = true;
  }

  await emitProgress("FINALIZING", true);

  return {
    items,
    scannedRows,
    matchedRows: Math.max(matchedRows, aggregate.size),
    reachedLimit,
    reachedTimeout,
  };
}

export async function searchInpiOfficialPortalPageBatch(
  options: InpiOfficialPortalBatchOptions,
): Promise<InpiOfficialPortalBatchResult> {
  const term = options.term.trim();
  const termNormalized = normalizeTerm(term);

  if (!termNormalized || termNormalized.length < 2) {
    return {
      items: [],
      totalPages: 0,
      totalFound: 0,
      scannedRows: 0,
      pageStart: 1,
      pageEnd: 0,
    };
  }

  const classFilter = classToNice(options.classNice);
  const registerPerPage = 100;
  const pageStart = Math.max(1, Math.floor(options.pageStart || 1));
  const maxPages = Math.max(1, Math.floor(options.maxPages ?? 8));

  await throwIfSearchCanceled(options);

  const loginResponse = await fetchWithTimeout(
    INPI_PORTAL_LOGIN_URL,
    {
      method: "GET",
      headers: {
        "user-agent": INPI_PORTAL_USER_AGENT,
      },
    },
    12_000,
  );

  if (!loginResponse.ok) {
    throw new Error(`Falha ao iniciar sessão no portal INPI (${loginResponse.status})`);
  }

  const cookie = extractCookieHeaderFromResponse(loginResponse);

  const body = new URLSearchParams();
  body.set("marca", term);
  body.set("classeInter", classFilter || "");
  body.set("registerPerPage", String(registerPerPage));
  body.set("Action", "searchMarca");
  body.set("tipoPesquisa", "BY_MARCA_CLASSIF_BASICA");
  body.set("buscaExata", "nao");
  body.set("txt", "Pesquisa Radical");
  body.set("botao", "pesquisar");

  const firstResponse = await fetchWithTimeout(
    INPI_PORTAL_SEARCH_URL,
    {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie,
        referer: INPI_PORTAL_SEARCH_REFERER,
        "user-agent": INPI_PORTAL_USER_AGENT,
      },
      body: body.toString(),
      redirect: "follow",
    },
    15_000,
  );

  if (!firstResponse.ok) {
    throw new Error(`Falha na busca oficial do portal INPI (${firstResponse.status})`);
  }

  const firstHtml = await readResponseText(firstResponse);
  const firstSummary = parsePortalSummary(firstHtml);
  const totalPages = Math.max(1, firstSummary.totalPages);
  const targetPageEnd = Math.min(totalPages, pageStart + maxPages - 1);
  const aggregate = new Map<string, InpiOfficialSearchItem>();
  let scannedRows = 0;

  const ingestRows = (rows: InpiPortalRow[]) => {
    for (const row of rows) {
      scannedRows += 1;

      const scoreBase = computeNameScore(termNormalized, row.nome);
      if (scoreBase < 40) {
        continue;
      }

      const score =
        row.classeNice && classFilter && row.classeNice === classFilter
          ? Math.min(scoreBase + 8, 100)
          : scoreBase;

      if (score < 40) {
        continue;
      }

      const key = [
        row.processoNumero,
        normalizeTerm(row.nome),
        normalizeNiceClassCode(row.classeNice) || "sem-classe",
      ].join("|");

      const next: InpiOfficialSearchItem = {
        nome: row.nome,
        classeNice: row.classeNice,
        processoNumero: row.processoNumero,
        titular: row.titular,
        status: row.status,
        dataDeposito: null,
        score,
      };
      const previous = aggregate.get(key);

      if (!previous || next.score > previous.score) {
        aggregate.set(key, next);
      }
    }
  };

  const emitPageProgress = async (currentPage: number) => {
    if (!options.onPage) {
      return;
    }

    await options.onPage({
      currentPage,
      totalPages,
      totalFound: firstSummary.totalFound,
      scannedRows,
    });
  };

  if (pageStart === 1) {
    ingestRows(parsePortalRows(firstHtml));
    await emitPageProgress(1);
  }

  for (let page = Math.max(2, pageStart); page <= targetPageEnd; page += 1) {
    await throwIfSearchCanceled(options);

    const pageResponse = await fetchWithTimeout(
      `${INPI_PORTAL_SEARCH_URL}?Action=nextPageMarca&page=${page}`,
      {
        method: "GET",
        headers: {
          cookie,
          referer: INPI_PORTAL_SEARCH_REFERER,
          "user-agent": INPI_PORTAL_USER_AGENT,
        },
      },
      12_000,
    );

    if (!pageResponse.ok) {
      throw new Error(`Falha na busca oficial do portal INPI (${pageResponse.status})`);
    }

    const pageHtml = await readResponseText(pageResponse);
    ingestRows(parsePortalRows(pageHtml));
    await emitPageProgress(page);
  }

  const items = Array.from(aggregate.values())
    .filter((item) => (classFilter ? item.classeNice === classFilter : true))
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      return a.processoNumero.localeCompare(b.processoNumero);
    });

  return {
    items,
    totalPages,
    totalFound: firstSummary.totalFound,
    scannedRows,
    pageStart,
    pageEnd: targetPageEnd,
  };
}

async function searchInpiOfficialCsvSource(
  options: InpiOfficialSearchOptions,
): Promise<InpiOfficialSearchResult> {
  const term = options.term.trim();
  const termNormalized = normalizeTerm(term);

  if (!termNormalized || termNormalized.length < 2) {
    return {
      items: [],
      scannedRows: 0,
      matchedRows: 0,
      reachedLimit: false,
      reachedTimeout: false,
    };
  }

  const classFilter = classToNice(options.classNice);
  const exhaustive = Boolean(options.exhaustive);
  const limit = exhaustive
    ? Math.max(options.limit ?? 500, 50)
    : Math.min(Math.max(options.limit ?? 20, 5), 60);
  const maxScanRows = Math.max(options.maxScanRows ?? 1_500_000, 50_000);
  const maxDurationMs = Math.max(options.maxDurationMs ?? 45_000, 10_000);
  const maxMatches = Math.max(options.maxMatches ?? (exhaustive ? 5_000 : 500), 100);
  const startedAt = Date.now();
  const candidateCap = exhaustive
    ? maxMatches
    : classFilter
      ? Math.max(limit * 10, 120)
      : Math.max(limit * 4, 60);
  const enoughCandidates = classFilter
    ? Math.max(limit * 8, 80)
    : Math.max(limit * 2, 20);
  const estimatedTotalRows = Math.max(maxScanRows, 7_500_000);

  const tokens = termNormalized
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 3)
    .slice(0, 6);

  const candidates: CsvCandidate[] = [];
  let hasStrongMatch = false;
  let scannedRows = 0;
  let reachedLimit = false;
  let reachedTimeout = false;
  let lastProgressEmittedAt = 0;

  await throwIfSearchCanceled(options);

  async function emitProgress(
    payload: Omit<InpiOfficialSearchProgress, "estimatedTotalRows">,
    force = false,
  ) {
    if (!options.onProgress) {
      return;
    }

    const now = Date.now();
    if (!force && now - lastProgressEmittedAt < 800) {
      return;
    }

    lastProgressEmittedAt = now;
    await options.onProgress({
      ...payload,
      estimatedTotalRows,
    });
  }

  await forEachCsvRow(
    INPI_MARCAS_BIBLIO_URL,
    async (row) => {
      scannedRows += 1;

      if (scannedRows % 1000 === 0) {
        await throwIfSearchCanceled(options);
      }

      if (scannedRows % 2500 === 0) {
        await emitProgress({
          phase: "SCANNING_BIBLIOGRAPHIC",
          scannedRows,
          matchedRows: candidates.length,
          progressPct: Math.max(
            1,
            Math.min(80, Math.round((scannedRows / estimatedTotalRows) * 80)),
          ),
          reachedLimit,
          reachedTimeout,
        });
      }

      if (scannedRows >= maxScanRows) {
        reachedLimit = true;
        return false;
      }

      if (Date.now() - startedAt >= maxDurationMs) {
        reachedTimeout = true;
        return false;
      }

      const nome = (row.elemento_nominativo || "").trim();
      const numeroInpi = (row.numero_inpi || "").trim();

      if (!nome || !numeroInpi) {
        return true;
      }

      const normalizedName = normalizeTerm(nome);

      if (!normalizedName) {
        return true;
      }

      const isMatch =
        normalizedName === termNormalized ||
        normalizedName.startsWith(termNormalized) ||
        hasBoundaryTokenMatch(normalizedName, termNormalized) ||
        tokens.some((token) => hasBoundaryTokenMatch(normalizedName, token));

      if (!isMatch) {
        return true;
      }

      const score = computeNameScore(termNormalized, nome);

      if (score < 45) {
        return true;
      }

      if (score >= 95) {
        hasStrongMatch = true;
      }

      candidates.push({
        nome,
        numeroInpi,
        status:
          (
            row.descricao_situacao ||
            row.codigo_situacao ||
            "Situação não informada"
          ).trim(),
        dataDeposito: (row.data_deposito || "").trim() || null,
        score,
      });

      if (!exhaustive && hasStrongMatch && candidates.length >= enoughCandidates) {
        reachedLimit = true;
        return false;
      }

      if (candidates.length >= candidateCap) {
        reachedLimit = true;
        return false;
      }

      return true;
    },
    {
      timeoutMs: Math.max(maxDurationMs + 2_000, 10_000),
    },
  );

  if (!candidates.length) {
    await emitProgress(
      {
        phase: "FINALIZING",
        scannedRows,
        matchedRows: 0,
        progressPct: 100,
        reachedLimit,
        reachedTimeout,
      },
      true,
    );

    return {
      items: [],
      scannedRows,
      matchedRows: 0,
      reachedLimit,
      reachedTimeout,
    };
  }

  const wantedNumbers = new Set(candidates.map((candidate) => candidate.numeroInpi));
  const classByNumber = new Map<string, Set<string>>();
  const classScanDeadline =
    Date.now() + Math.max(20_000, Math.floor(maxDurationMs * 0.35));
  let lastClassProgressEmittedAt = 0;
  let classRowsScanned = 0;

  await throwIfSearchCanceled(options);

  await forEachCsvRow(
    INPI_MARCAS_CLASSIFICACAO_NACIONAL_URL,
    async (row) => {
      classRowsScanned += 1;

      if (classRowsScanned % 1000 === 0) {
        await throwIfSearchCanceled(options);
      }

      const now = Date.now();
      if (options.onProgress && now - lastClassProgressEmittedAt >= 800) {
        lastClassProgressEmittedAt = now;
        await emitProgress({
          phase: "SCANNING_CLASSIFICATION",
          scannedRows,
          matchedRows: candidates.length,
          progressPct:
            80 +
            Math.min(
              15,
              Math.round(
                (classByNumber.size / Math.max(wantedNumbers.size, 1)) * 15,
              ),
            ),
          reachedLimit,
          reachedTimeout,
        });
      }

      if (Date.now() >= classScanDeadline) {
        reachedTimeout = true;
        return false;
      }

      const numeroInpi = (row.numero_inpi || "").trim();

      if (!numeroInpi || !wantedNumbers.has(numeroInpi)) {
        return true;
      }

      const maybeClass = classToNice(row.classe);

      if (!maybeClass) {
        return true;
      }

      if (!classByNumber.has(numeroInpi)) {
        classByNumber.set(numeroInpi, new Set());
      }

      classByNumber.get(numeroInpi)!.add(maybeClass);

      if (classByNumber.size >= wantedNumbers.size) {
        return false;
      }

      return true;
    },
    {
      timeoutMs: Math.max(Math.floor(maxDurationMs * 0.5), 20_000),
    },
  );

  const items = candidates
    .flatMap((candidate) => {
      const classes = classByNumber.get(candidate.numeroInpi);
      const classList = classes?.size ? Array.from(classes) : [null];

      return classList.map((classeNice) => ({
        nome: candidate.nome,
        classeNice,
        processoNumero: candidate.numeroInpi,
        titular: null,
        status: candidate.status,
        dataDeposito: candidate.dataDeposito,
        score:
          classeNice && classFilter && classeNice === classFilter
            ? Math.min(candidate.score + 8, 100)
            : candidate.score,
      }));
    })
    .filter((item) => (classFilter ? item.classeNice === classFilter : true))
    .sort((a, b) => b.score - a.score)
    .slice(0, exhaustive ? maxMatches : limit);

  await throwIfSearchCanceled(options);

  await emitProgress(
    {
      phase: "FINALIZING",
      scannedRows,
      matchedRows: candidates.length,
      progressPct: 100,
      reachedLimit,
      reachedTimeout,
    },
    true,
  );

  return {
    items,
    scannedRows,
    matchedRows: candidates.length,
    reachedLimit,
    reachedTimeout,
  };
}

export async function searchInpiOfficialSource(
  options: InpiOfficialSearchOptions,
): Promise<InpiOfficialSearchResult> {
  try {
    return await searchInpiOfficialPortalSource(options);
  } catch (error) {
    logger.warn(
      "[INPI] Falha ao consultar portal oficial de marcas. Aplicando fallback CSV.",
      error,
    );
    return searchInpiOfficialCsvSource(options);
  }
}
