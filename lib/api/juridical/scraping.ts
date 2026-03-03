/**
 * Serviço de Web Scraping para consultas processuais públicas
 *
 * Foco inicial: Tribunais com e-SAJ que permitem consulta pública
 * sem necessidade de certificado digital
 */

import https from "https";
import { constants } from "crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { SecureVersion } from "tls";
import fetch, { RequestInit } from "node-fetch";
import { load } from "cheerio";
import { ProcessoJuridico, MovimentacaoProcesso, ParteProcesso, CapturaResult, TribunalSistema, EsferaTribunal } from "./types";
import { getTribunalConfig } from "./config";
import logger from "@/lib/logger";
import {
  cleanupOldEsajCaptchaChallenges,
  consumeEsajCaptchaChallenge,
  createEsajCaptchaChallenge,
} from "./esaj-captcha-store";

interface ScrapingOptions {
  timeout?: number;
  retries?: number;
  delayBetweenRequests?: number;
  userAgent?: string;
  oab?: string;
}

const DEFAULT_OPTIONS: ScrapingOptions = {
  timeout: 30000, // 30 segundos
  retries: 3,
  delayBetweenRequests: 1000, // 1 segundo entre requisições
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
};

const ESAJ_TLS_INSECURE = process.env.ESAJ_TLS_INSECURE === "true" || process.env.ESAJ_TLS_INSECURE === "1";
const ESAJ_TLS_MIN_VERSION = process.env.ESAJ_TLS_MIN_VERSION;
const ESAJ_TLS_LEGACY = process.env.ESAJ_TLS_LEGACY === "true" || process.env.ESAJ_TLS_LEGACY === "1";
const ESAJ_FORCE_CURL = process.env.NODE_ENV === "development";
const ESAJ_MAX_OAB_PAGES = Math.max(
  1,
  Number.parseInt(process.env.ESAJ_MAX_OAB_PAGES ?? "5", 10) || 5,
);
const ESAJ_MAX_OAB_PROCESSOS = Math.max(
  1,
  Number.parseInt(process.env.ESAJ_MAX_OAB_PROCESSOS ?? "100", 10) || 100,
);

const CNJ_PATTERN = /\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/;

type EsajSession = {
  cookieHeader: string;
  csrfToken?: string;
  conversationId?: string;
};

type EsajProcessoLink = {
  numero?: string;
  url?: string;
};

const execFileAsync = promisify(execFile);

function normalizeProcessNumber(value?: string | null) {
  if (!value) return "";
  return value.replace(/\D/g, "");
}

function getProcessLinkKey(link: EsajProcessoLink) {
  if (link.url) {
    return `url:${link.url}`;
  }
  if (link.numero) {
    return `numero:${normalizeProcessNumber(link.numero)}`;
  }
  return null;
}

async function wait(ms?: number) {
  if (!ms || ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function buildEsajAgentOptions() {
  const options: https.AgentOptions = {
    rejectUnauthorized: !ESAJ_TLS_INSECURE,
  };

  if (ESAJ_TLS_MIN_VERSION) {
    options.minVersion = ESAJ_TLS_MIN_VERSION as SecureVersion;
  }

  if (ESAJ_TLS_LEGACY) {
    options.secureOptions = constants.SSL_OP_LEGACY_SERVER_CONNECT;
  }

  return options;
}

function buildEsajAgent(overrides?: https.AgentOptions) {
  return new https.Agent({
    ...buildEsajAgentOptions(),
    ...(overrides || {}),
  });
}

function shouldRetryWithLegacyTls(error: unknown) {
  if (!(error instanceof Error)) return false;
  const code = (error as { code?: string }).code;
  if (code === "EPROTO" || code === "ERR_SSL_WRONG_VERSION_NUMBER" || code === "ERR_SSL_UNSUPPORTED_PROTOCOL") {
    return true;
  }

  const message = error.message.toLowerCase();
  return message.includes("unsupported protocol") || message.includes("wrong version number") || message.includes("ssl_choose_client_version") || message.includes("alert protocol version");
}

async function fetchEsajPageViaCurl(url: string, headers: Record<string, string>, init: RequestInit & { cookieHeader?: string } = {}) {
  const timeoutSeconds = Math.max(1, Math.ceil((DEFAULT_OPTIONS.timeout ?? 30000) / 1000));
  const args = ["-sS", "-L", "-D", "-", "-o", "-", "--max-time", String(timeoutSeconds), "--compressed"];

  if (headers["User-Agent"]) {
    args.push("-A", headers["User-Agent"]);
  }

  if (ESAJ_TLS_INSECURE) {
    args.push("-k");
  }

  if (init.method && init.method.toUpperCase() !== "GET") {
    args.push("-X", init.method.toUpperCase());
  }

  if (init.body) {
    const body = typeof init.body === "string" ? init.body : init.body instanceof URLSearchParams ? init.body.toString() : "";
    if (body) {
      args.push("--data-raw", body);
    }
  }

  Object.entries(headers).forEach(([key, value]) => {
    if (key.toLowerCase() === "user-agent") return;
    args.push("-H", `${key}: ${value}`);
  });

  args.push(url);

  const { stdout } = await execFileAsync("curl", args, {
    maxBuffer: 10 * 1024 * 1024,
  });

  const rawOutput = stdout ?? "";
  const delimiter = rawOutput.includes("\r\n\r\n") ? "\r\n\r\n" : "\n\n";
  const headerEndIndex = rawOutput.lastIndexOf(delimiter);
  const headerText = headerEndIndex >= 0 ? rawOutput.slice(0, headerEndIndex) : "";
  const body = headerEndIndex >= 0 ? rawOutput.slice(headerEndIndex + delimiter.length) : rawOutput;
  const headerBlocks = headerText
    .split(/\r?\n\r?\n/)
    .map((block) => block.trim())
    .filter(Boolean);
  const lastHeaderBlock = headerBlocks[headerBlocks.length - 1] || "";
  const headerLines = lastHeaderBlock.split(/\r?\n/);
  const statusLine = headerLines.shift() || "";
  const statusMatch = statusLine.match(/HTTP\/\d+(?:\.\d+)?\s+(\d{3})/);
  const status = statusMatch ? Number(statusMatch[1]) : 0;
  const setCookies = headerLines.filter((line) => /^set-cookie:/i.test(line)).map((line) => line.replace(/^set-cookie:\s*/i, "").trim());

  return {
    response: {
      status,
      headers: {
        raw: () => ({
          "set-cookie": setCookies,
        }),
      },
    },
    body,
  };
}

async function fetchEsajBinaryViaCurl(url: string, headers: Record<string, string>, init: RequestInit & { cookieHeader?: string } = {}) {
  const timeoutSeconds = Math.max(1, Math.ceil((DEFAULT_OPTIONS.timeout ?? 30000) / 1000));
  const args = ["-sS", "-L", "--max-time", String(timeoutSeconds), "--compressed"];

  if (headers["User-Agent"]) {
    args.push("-A", headers["User-Agent"]);
  }

  if (ESAJ_TLS_INSECURE) {
    args.push("-k");
  }

  if (init.method && init.method.toUpperCase() !== "GET") {
    args.push("-X", init.method.toUpperCase());
  }

  if (init.body) {
    const body = typeof init.body === "string" ? init.body : init.body instanceof URLSearchParams ? init.body.toString() : "";
    if (body) {
      args.push("--data-raw", body);
    }
  }

  Object.entries(headers).forEach(([key, value]) => {
    if (key.toLowerCase() === "user-agent") return;
    args.push("-H", `${key}: ${value}`);
  });

  args.push(url);

  const { stdout } = await execFileAsync("curl", args, {
    maxBuffer: 10 * 1024 * 1024,
    encoding: "buffer",
  } as any);

  return Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout ?? "");
}

function parseCookies(setCookies?: string[]) {
  if (!setCookies || setCookies.length === 0) {
    return "";
  }
  const pairs = setCookies.map((cookie) => cookie.split(";")[0]);
  return pairs.filter(Boolean).join("; ");
}

function mergeCookieHeaders(current: string | undefined, setCookies?: string[]) {
  const cookieMap = new Map<string, string>();
  const ingest = (cookieHeader?: string) => {
    if (!cookieHeader) return;
    cookieHeader.split(";").forEach((chunk) => {
      const [name, ...rest] = chunk.trim().split("=");
      if (!name) return;
      cookieMap.set(name, rest.join("="));
    });
  };

  ingest(current);
  ingest(parseCookies(setCookies));

  return Array.from(cookieMap.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

function extractHiddenValue(html: string, name: string) {
  const regex = new RegExp(`name=\\"${name}\\"\\s+value=\\"([^\\"]*)\\"`, "i");
  const match = html.match(regex);
  return match?.[1];
}

function normalizeEsajBaseUrl(url?: string) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    let path = parsed.pathname;
    if (path.endsWith("/open.do")) {
      path = path.slice(0, -"/open.do".length);
    }
    return `${parsed.origin}${path}`;
  } catch (error) {
    return null;
  }
}

function formatNumeroCnj(numero: string) {
  const digits = numero.replace(/\D/g, "");
  if (digits.length !== 20) return numero;
  return `${digits.slice(0, 7)}-${digits.slice(7, 9)}.${digits.slice(9, 13)}.${digits.slice(13, 14)}.${digits.slice(14, 16)}.${digits.slice(16)}`;
}

function splitNumeroCnj(numero: string) {
  const digits = numero.replace(/\D/g, "");
  if (digits.length !== 20) {
    return null;
  }
  return {
    numeroDigitoAno: digits.slice(0, 13),
    foroNumero: digits.slice(16),
  };
}

function findFirstCnj(text: string) {
  const match = text.match(CNJ_PATTERN);
  return match?.[0] ?? null;
}

function parseDateBR(value?: string | null) {
  if (!value) return undefined;
  const cleaned = value.trim();
  const match = cleaned.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) return undefined;
  const [, dia, mes, ano] = match;
  const date = new Date(Number(ano), Number(mes) - 1, Number(dia));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function parseCurrencyBR(value?: string | null) {
  if (!value) return undefined;
  const normalized = value
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const parsed = Number.parseFloat(normalized);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function resolveLink(baseUrl: string, href?: string | null) {
  if (!href) return undefined;
  try {
    const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
    return new URL(href, normalizedBase).toString();
  } catch (error) {
    return undefined;
  }
}

function extractLabelValue(html: string, labels: string[]) {
  const $ = load(html);
  const normalizedLabels = labels.map((label) => label.toLowerCase());
  let value: string | undefined;

  $("tr").each((_index, row) => {
    const cells = $(row).find("td");
    if (cells.length < 2) return;
    const labelText = $(cells[0]).text().replace(/\s+/g, " ").trim();
    const normalized = labelText.toLowerCase();
    if (normalizedLabels.some((label) => normalized.startsWith(label))) {
      const rawValue = $(cells[1]).text().replace(/\s+/g, " ").trim();
      if (rawValue) {
        value = rawValue;
      }
      return false;
    }
  });

  return value;
}

async function fetchEsajPage(url: string, init: RequestInit & { cookieHeader?: string } = {}) {
  const initHeaders = (init.headers || {}) as Record<string, string>;
  const headers = {
    "User-Agent": initHeaders["User-Agent"] ?? DEFAULT_OPTIONS.userAgent,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    ...(initHeaders || {}),
  } as Record<string, string>;

  if (init.cookieHeader) {
    headers.Cookie = init.cookieHeader;
  }

  if (ESAJ_FORCE_CURL) {
    try {
      logger.info({ url }, "[Scraping ESAJ] Usando curl para contornar TLS no desenvolvimento");
      return await fetchEsajPageViaCurl(url, headers, init);
    } catch (curlError) {
      logger.warn({ error: curlError, url }, "[Scraping ESAJ] Curl falhou, tentando fetch padrão");
    }
  }

  const doFetch = async (agent: https.Agent) => {
    const response = await fetch(url, {
      ...init,
      headers,
      agent,
    });
    const body = await response.text();

    return {
      response,
      body,
    };
  };

  try {
    return await doFetch(buildEsajAgent());
  } catch (error) {
    if (!shouldRetryWithLegacyTls(error)) {
      throw error;
    }

    logger.warn({ error, url }, "[Scraping ESAJ] TLS legado requerido, tentando novamente");

    const legacyAttempts: https.AgentOptions[] = [
      {
        minVersion: "TLSv1" as SecureVersion,
        maxVersion: "TLSv1.2" as SecureVersion,
        secureOptions: constants.SSL_OP_LEGACY_SERVER_CONNECT,
      },
      {
        minVersion: "TLSv1" as SecureVersion,
        maxVersion: "TLSv1" as SecureVersion,
        secureOptions: constants.SSL_OP_LEGACY_SERVER_CONNECT | constants.SSL_OP_ALLOW_UNSAFE_LEGACY_RENEGOTIATION,
        ciphers: "DEFAULT@SECLEVEL=0",
        honorCipherOrder: true,
      },
    ];

    let lastError: unknown = error;
    for (const attempt of legacyAttempts) {
      try {
        return await doFetch(buildEsajAgent(attempt));
      } catch (legacyError) {
        lastError = legacyError;
      }
    }

    try {
      logger.warn({ url }, "[Scraping ESAJ] Fallback para curl devido a erro TLS");
      return await fetchEsajPageViaCurl(url, headers, init);
    } catch (curlError) {
      throw lastError ?? curlError;
    }
  }
}

async function fetchEsajBinary(url: string, init: RequestInit & { cookieHeader?: string } = {}) {
  const initHeaders = (init.headers || {}) as Record<string, string>;
  const headers = {
    "User-Agent": initHeaders["User-Agent"] ?? DEFAULT_OPTIONS.userAgent,
    Accept: "*/*",
    ...(initHeaders || {}),
  } as Record<string, string>;

  if (init.cookieHeader) {
    headers.Cookie = init.cookieHeader;
  }

  const doFetch = async (agent: https.Agent) => {
    const response = await fetch(url, {
      ...init,
      headers,
      agent,
    });

    // node-fetch v2
    const buffer = await (response as any).buffer?.();
    if (buffer && Buffer.isBuffer(buffer)) {
      return buffer as Buffer;
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  };

  const tryCurl = async () => {
    return fetchEsajBinaryViaCurl(url, headers, init);
  };

  if (ESAJ_FORCE_CURL) {
    try {
      return await tryCurl();
    } catch (error) {
      logger.warn({ error, url }, "[Scraping ESAJ] Curl binário falhou, tentando fetch padrão");
    }
  }

  try {
    return await doFetch(buildEsajAgent());
  } catch (error) {
    if (!shouldRetryWithLegacyTls(error)) {
      try {
        logger.warn({ error, url }, "[Scraping ESAJ] Fetch binário falhou, tentando curl");
        return await tryCurl();
      } catch {
        throw error;
      }
    }

    logger.warn({ error, url }, "[Scraping ESAJ] TLS legado requerido para binário, tentando novamente");

    const legacyAttempts: https.AgentOptions[] = [
      {
        minVersion: "TLSv1" as SecureVersion,
        maxVersion: "TLSv1.2" as SecureVersion,
        secureOptions: constants.SSL_OP_LEGACY_SERVER_CONNECT,
      },
      {
        minVersion: "TLSv1" as SecureVersion,
        maxVersion: "TLSv1" as SecureVersion,
        secureOptions:
          constants.SSL_OP_LEGACY_SERVER_CONNECT |
          constants.SSL_OP_ALLOW_UNSAFE_LEGACY_RENEGOTIATION,
        ciphers: "DEFAULT@SECLEVEL=0",
        honorCipherOrder: true,
      },
    ];

    let lastError: unknown = error;
    for (const attempt of legacyAttempts) {
      try {
        return await doFetch(buildEsajAgent(attempt));
      } catch (legacyError) {
        lastError = legacyError;
      }
    }

    try {
      logger.warn({ url }, "[Scraping ESAJ] Fallback binário para curl devido a erro TLS");
      return await tryCurl();
    } catch (curlError) {
      throw lastError ?? curlError;
    }
  }
}

async function initEsajSession(baseUrl: string): Promise<EsajSession> {
  const openUrl = `${baseUrl}/open.do`;
  const { response, body } = await fetchEsajPage(openUrl);
  const rawCookies = response.headers.raw?.()["set-cookie"];
  const cookieHeader = mergeCookieHeaders(undefined, rawCookies);
  const csrfToken = extractHiddenValue(body, "_csrf");
  const conversationId = extractHiddenValue(body, "conversationId");

  return {
    cookieHeader,
    csrfToken,
    conversationId,
  };
}

function parseEsajMensagemErro(html: string) {
  const $ = load(html);
  const message = $("#mensagemRetorno").text().replace(/\s+/g, " ").trim();
  if (!message) return null;
  return message;
}

function detectEsajCaptcha(html: string) {
  const $ = load(html);
  const text = $.text().toLowerCase();
  const hasRecaptcha = html.toLowerCase().includes("g-recaptcha");
  const inputLooksCaptcha = $("input[name*='captcha' i], input[id*='captcha' i]").length > 0;
  const img = $("img[src*='captcha' i], img[id*='captcha' i]").first();
  const imgSrc = img.attr("src") || undefined;
  const likely = hasRecaptcha || inputLooksCaptcha || Boolean(imgSrc) || text.includes("captcha") || text.includes("código de segurança") || text.includes("codigo de seguranca");

  return { required: likely, imageSrc: imgSrc };
}

function parseEsajLinks(html: string, baseUrl: string): EsajProcessoLink[] {
  const $ = load(html);
  const links: EsajProcessoLink[] = [];
  const seen = new Set<string>();

  $("a.linkProcesso, a[href*='show.do']").each((_index, element) => {
    const anchor = $(element);
    const href = anchor.attr("href");
    const numero = findFirstCnj(anchor.text()) ?? undefined;
    const link: EsajProcessoLink = {
      numero,
      url: resolveLink(baseUrl, href),
    };
    const key = getProcessLinkKey(link);

    if (!key || seen.has(key)) return;
    seen.add(key);
    links.push(link);
  });

  if (links.length === 0) {
    const fallbackNumero = findFirstCnj($.text());
    if (fallbackNumero) {
      links.push({ numero: fallbackNumero });
    }
  }

  return links;
}

async function searchEsajProcesso(baseUrl: string, session: EsajSession, params: URLSearchParams) {
  const searchUrl = `${baseUrl}/search.do?${params.toString()}`;
  const { response, body } = await fetchEsajPage(searchUrl, {
    cookieHeader: session.cookieHeader,
  });
  const rawCookies = response.headers.raw?.()["set-cookie"];
  const cookieHeader = mergeCookieHeaders(session.cookieHeader, rawCookies);

  return {
    body,
    cookieHeader,
  };
}

async function collectEsajLinksByOab(params: {
  baseUrl: string;
  initialCookieHeader: string;
  initialBody: string;
  queryParams: URLSearchParams;
  delayBetweenRequests?: number;
}) {
  const {
    baseUrl,
    initialBody,
    initialCookieHeader,
    queryParams,
    delayBetweenRequests,
  } = params;

  const linksMap = new Map<string, EsajProcessoLink>();
  let cookieHeader = initialCookieHeader;
  let pagesVisited = 0;
  let truncated = false;
  let lastBody = initialBody;

  for (let page = 0; page < ESAJ_MAX_OAB_PAGES; page += 1) {
    let pageBody = initialBody;

    if (page > 0) {
      const pageParams = new URLSearchParams(queryParams.toString());
      pageParams.set("paginaConsulta", String(page));

      const pageResult = await searchEsajProcesso(
        baseUrl,
        { cookieHeader },
        pageParams,
      );
      cookieHeader = pageResult.cookieHeader;
      pageBody = pageResult.body;

      if (parseEsajMensagemErro(pageBody)) {
        break;
      }

      const pageCaptcha = detectEsajCaptcha(pageBody);
      if (pageCaptcha.required) {
        // Se entrou captcha depois da primeira página, interrompe para evitar loop.
        break;
      }
    }

    pagesVisited += 1;
    lastBody = pageBody;

    const pageLinks = parseEsajLinks(pageBody, baseUrl);
    const before = linksMap.size;
    for (const link of pageLinks) {
      const key = getProcessLinkKey(link);
      if (!key || linksMap.has(key)) continue;
      linksMap.set(key, link);
    }
    const added = linksMap.size - before;

    if (linksMap.size >= ESAJ_MAX_OAB_PROCESSOS) {
      truncated = true;
      break;
    }

    if (page > 0 && pageLinks.length === 0 && added === 0) {
      break;
    }

    if (delayBetweenRequests) {
      await wait(delayBetweenRequests);
    }
  }

  return {
    links: Array.from(linksMap.values()),
    cookieHeader,
    pagesVisited,
    truncated,
    lastBody,
  };
}

async function fetchEsajDetalhes(baseUrl: string, url: string, cookieHeader: string) {
  const resolved = resolveLink(baseUrl, url);
  if (!resolved) {
    return null;
  }

  const { response, body } = await fetchEsajPage(resolved, {
    cookieHeader,
  });
  const rawCookies = response.headers.raw?.()["set-cookie"];
  const mergedCookies = mergeCookieHeaders(cookieHeader, rawCookies);

  return {
    url: resolved,
    body,
    cookieHeader: mergedCookies,
  };
}

function parseEsajParteTipo(label: string): ParteProcesso["tipo"] {
  const normalized = label.toLowerCase();

  if (
    normalized.includes("autor") ||
    normalized.includes("requerente") ||
    normalized.includes("exequente") ||
    normalized.includes("impetrante") ||
    normalized.includes("apelante") ||
    normalized.includes("agravante")
  ) {
    return "AUTOR";
  }

  if (
    normalized.includes("réu") ||
    normalized.includes("reu") ||
    normalized.includes("requerido") ||
    normalized.includes("executado") ||
    normalized.includes("impetrado") ||
    normalized.includes("apelado") ||
    normalized.includes("agravado")
  ) {
    return "REU";
  }

  return "TERCEIRO";
}

function normalizeParteNome(value: string) {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  const lines = cleaned
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return cleaned;

  const first = lines[0];
  const [beforeAdv] = first.split("Advogado:");
  return beforeAdv.trim();
}

function parseEsajPartes(html: string): ParteProcesso[] {
  const $ = load(html);
  const partes: ParteProcesso[] = [];

  const collectFromTable = (selector: string) => {
    $(selector)
      .find("tr")
      .each((_index, row) => {
        const cells = $(row).find("td");
        if (cells.length < 2) return;
        const label = $(cells[0]).text().replace(/\s+/g, " ").trim();
        const rawNome = $(cells[1]).text();
        const nome = normalizeParteNome(rawNome);
        if (!label || !nome) return;
        partes.push({
          tipo: parseEsajParteTipo(label),
          nome,
        });
      });
  };

  collectFromTable("#tablePartesPrincipais");
  collectFromTable("#tablePartesSecundarias");

  return partes;
}

function parseEsajDetalhesHtml(html: string) {
  const numeroEncontrado = findFirstCnj(html);
  const classe = extractLabelValue(html, ["Classe", "Classe judicial"]);
  const assunto = extractLabelValue(html, ["Assunto", "Assuntos"]);
  const comarca = extractLabelValue(html, ["Comarca", "Comarca/Foro", "Foro"]);
  const vara = extractLabelValue(html, ["Vara", "Vara/Ofício", "Vara/Oficio"]);
  const orgaoJulgador = extractLabelValue(html, ["Órgão julgador", "Orgao julgador", "Órgão Julgador", "Orgao Julgador"]);
  const distribuicao = extractLabelValue(html, ["Distribuição", "Distribuicao", "Data de distribuição", "Data de Distribuição"]);
  const valorCausaLabel = extractLabelValue(html, ["Valor da ação", "Valor da causa", "Valor da Ação", "Valor da Causa"]);
  const juiz = extractLabelValue(html, ["Juiz", "Juiz(a)", "Magistrado", "Relator"]);

  return {
    numeroEncontrado,
    classe,
    assunto,
    comarca,
    vara: vara || orgaoJulgador,
    dataDistribuicao: parseDateBR(distribuicao),
    valorCausa: parseCurrencyBR(valorCausaLabel),
    juiz,
    partes: parseEsajPartes(html),
  };
}

function buildEsajProcesso(params: {
  tribunalSigla: string;
  tribunalNome?: string;
  uf?: string;
  numeroProcesso: string;
  detalhes: ReturnType<typeof parseEsajDetalhesHtml>;
  linkConsulta?: string;
}) {
  const { tribunalSigla, numeroProcesso, detalhes, linkConsulta } = params;
  const tribunalConfig = getTribunalConfig({ sigla: tribunalSigla });

  return {
    numeroProcesso,
    tribunalNome: tribunalConfig?.nome || params.tribunalNome,
    tribunalSigla,
    sistema: TribunalSistema.ESAJ,
    esfera: tribunalConfig?.esfera || EsferaTribunal.ESTADUAL,
    uf: tribunalConfig?.uf || params.uf,
    classe: detalhes.classe || undefined,
    assunto: detalhes.assunto || undefined,
    comarca: detalhes.comarca || undefined,
    vara: detalhes.vara || undefined,
    dataDistribuicao: detalhes.dataDistribuicao || undefined,
    valorCausa: detalhes.valorCausa || undefined,
    juiz: detalhes.juiz || undefined,
    partes: detalhes.partes,
    linkConsulta,
    fonte: "SCRAPING",
    capturadoEm: new Date(),
  } satisfies ProcessoJuridico;
}

async function consultarEsaj(tribunalSigla: string, tribunalNome: string, uf: string, numeroProcesso: string, options: ScrapingOptions = {}): Promise<CapturaResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const numeroNormalizado = numeroProcesso ? normalizarNumeroProcesso(numeroProcesso) : "";
  const start = Date.now();

  try {
    const alvoConsulta = options.oab && options.oab.trim().length > 0 ? options.oab : numeroNormalizado;
    logger.info(`[Scraping ${tribunalSigla}] Consultando processo: ${alvoConsulta}`);

    const tribunalConfig = getTribunalConfig({ sigla: tribunalSigla });
    const baseUrl = normalizeEsajBaseUrl(tribunalConfig?.urlConsulta || tribunalConfig?.urlBase);

    if (!baseUrl) {
      return {
        success: false,
        error: `URL de consulta não configurada para ${tribunalSigla}`,
        tentativas: opts.retries,
      };
    }

    const session = await initEsajSession(baseUrl);
    const params = new URLSearchParams();
    const searchByOab = Boolean(options.oab && options.oab.trim().length > 0);

    if (session.conversationId) {
      params.set("conversationId", session.conversationId);
    }
    if (session.csrfToken) {
      params.set("_csrf", session.csrfToken);
    }

    params.set("cbPesquisa", searchByOab ? "NUMOAB" : "NUMPROC");
    params.set("paginaConsulta", "0");
    params.set("cdForo", "-1");

    if (searchByOab) {
      const oab = options.oab?.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
      if (!oab) {
        return {
          success: false,
          error: `OAB não informada para consulta no ${tribunalSigla}`,
          tentativas: opts.retries,
        };
      }
      params.set("dadosConsulta.valorConsulta", oab);
    } else {
      const split = splitNumeroCnj(numeroNormalizado);
      if (!split) {
        return {
          success: false,
          error: `Número do processo inválido para consulta no ${tribunalSigla}`,
          tentativas: opts.retries,
        };
      }

      params.set("numeroDigitoAnoUnificado", split.numeroDigitoAno);
      params.set("foroNumeroUnificado", split.foroNumero);
      params.set("dadosConsulta.tipoNuProcesso", "UNIFICADO");
      params.set("dadosConsulta.valorConsultaNuUnificado", formatNumeroCnj(numeroNormalizado));
    }

    const searchResult = await searchEsajProcesso(baseUrl, session, params);
    const mensagem = parseEsajMensagemErro(searchResult.body);
    if (mensagem) {
      return {
        success: false,
        error: mensagem,
        tentativas: opts.retries,
        tempoResposta: Date.now() - start,
      };
    }

    // Em muitos e-SAJ, busca por OAB dispara captcha (sem captcha, vem só o formulário/erro).
    if (searchByOab) {
      const captcha = detectEsajCaptcha(searchResult.body);
      if (captcha.required) {
        await cleanupOldEsajCaptchaChallenges();

        const captchaUrl = captcha.imageSrc ? resolveLink(baseUrl, captcha.imageSrc) : undefined;

        let imageDataUrl: string | undefined;
        if (captchaUrl) {
          try {
            const bin = await fetchEsajBinary(captchaUrl, {
              cookieHeader: searchResult.cookieHeader,
            });
            // Nem sempre o servidor manda content-type acessível via curl; assume PNG.
            const base64 = bin.toString("base64");
            imageDataUrl = `data:image/png;base64,${base64}`;
          } catch (error) {
            logger.warn({ error, captchaUrl }, "[Scraping ESAJ] Falha ao baixar captcha (seguindo com desafio sem imagem)");
          }
        }

        const paramsRecord: Record<string, string> = {};
        params.forEach((value, key) => {
          paramsRecord[key] = value;
        });

        const id = await createEsajCaptchaChallenge({
          tribunalSigla,
          baseUrl,
          cookieHeader: searchResult.cookieHeader,
          csrfToken: session.csrfToken,
          conversationId: session.conversationId,
          params: paramsRecord,
        });

        return {
          success: false,
          error: "Consulta por OAB exige captcha no e-SAJ. Resolva o código e tente novamente.",
          captchaRequired: true,
          captcha: {
            id,
            imageDataUrl,
            imageUrl: captchaUrl,
          },
          tentativas: opts.retries,
          tempoResposta: Date.now() - start,
          debug: {
            tribunalSigla,
            baseUrl,
            searchByOab,
            captchaDetected: captcha,
          },
        };
      }

      const collected = await collectEsajLinksByOab({
        baseUrl,
        initialCookieHeader: searchResult.cookieHeader,
        initialBody: searchResult.body,
        queryParams: params,
        delayBetweenRequests: opts.delayBetweenRequests,
      });
      const processos: ProcessoJuridico[] = [];
      const seenNumeros = new Set<string>();
      let cookieHeader = collected.cookieHeader;

      for (const link of collected.links) {
        let detalhesHtml = collected.lastBody;
        let detalhesUrl = link.url;

        if (link.url) {
          const detalhes = await fetchEsajDetalhes(baseUrl, link.url, cookieHeader);
          if (!detalhes) {
            continue;
          }
          detalhesHtml = detalhes.body;
          detalhesUrl = detalhes.url;
          cookieHeader = detalhes.cookieHeader;
        }

        const detalhes = parseEsajDetalhesHtml(detalhesHtml);
        const numeroProcessoExtraido =
          (detalhes.numeroEncontrado
            ? formatNumeroCnj(detalhes.numeroEncontrado)
            : undefined) ||
          link.numero;

        if (!numeroProcessoExtraido) {
          continue;
        }

        const numeroKey = normalizeProcessNumber(numeroProcessoExtraido);
        if (!numeroKey || seenNumeros.has(numeroKey)) {
          continue;
        }
        seenNumeros.add(numeroKey);

        processos.push(
          buildEsajProcesso({
            tribunalSigla,
            tribunalNome,
            uf,
            numeroProcesso: numeroProcessoExtraido,
            detalhes,
            linkConsulta: detalhesUrl || link.url || undefined,
          }),
        );

        if (processos.length >= ESAJ_MAX_OAB_PROCESSOS) {
          break;
        }

        if (opts.delayBetweenRequests) {
          await wait(opts.delayBetweenRequests);
        }
      }

      if (processos.length === 0) {
        return {
          success: false,
          error: `Nenhum processo encontrado para a OAB informada no ${tribunalSigla}`,
          tentativas: opts.retries,
          tempoResposta: Date.now() - start,
          debug: {
            tribunalSigla,
            pagesVisited: collected.pagesVisited,
            collectedLinks: collected.links.length,
          },
        };
      }

      return {
        success: true,
        processo: processos[0],
        processos,
        tempoResposta: Date.now() - start,
        debug: {
          tribunalSigla,
          pagesVisited: collected.pagesVisited,
          collectedLinks: collected.links.length,
          truncated: collected.truncated,
        },
      };
    }

    const links = parseEsajLinks(searchResult.body, baseUrl);
    let detalhesHtml = searchResult.body;
    let detalhesUrl: string | undefined;

    const primeiroLink = links.find((link) => Boolean(link.url));
    if (primeiroLink?.url) {
      const detalhes = await fetchEsajDetalhes(baseUrl, primeiroLink.url, searchResult.cookieHeader);
      if (detalhes) {
        detalhesHtml = detalhes.body;
        detalhesUrl = detalhes.url;
      }
    }

    const detalhes = parseEsajDetalhesHtml(detalhesHtml);
    const numeroProcessoExtraido =
      (detalhes.numeroEncontrado ? formatNumeroCnj(detalhes.numeroEncontrado) : undefined) || primeiroLink?.numero || (numeroNormalizado ? formatNumeroCnj(numeroNormalizado) : undefined);

    if (!numeroProcessoExtraido) {
      return {
        success: false,
        error: `Processo não encontrado no ${tribunalSigla}`,
        tentativas: opts.retries,
        tempoResposta: Date.now() - start,
      };
    }

    const processo = buildEsajProcesso({
      tribunalSigla,
      tribunalNome: tribunalConfig?.nome || tribunalNome,
      uf: tribunalConfig?.uf || uf,
      numeroProcesso: numeroProcessoExtraido,
      detalhes,
      linkConsulta: detalhesUrl || primeiroLink?.url || undefined,
    });

    return {
      success: true,
      processo,
      processos: [processo],
      tempoResposta: Date.now() - start,
    };
  } catch (error) {
    logger.error(`[Scraping ${tribunalSigla}] Erro ao consultar processo ${numeroNormalizado}:`, error);

    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro desconhecido",
      tentativas: opts.retries,
    };
  }
}

export async function resolverCaptchaEsaj(params: { captchaId: string; captchaText: string }): Promise<CapturaResult> {
  const start = Date.now();
  const challenge = await consumeEsajCaptchaChallenge(params.captchaId);
  if (!challenge) {
    return {
      success: false,
      error: "Desafio de captcha expirado. Gere um novo pelo /teste-captura.",
    };
  }

  const { baseUrl, cookieHeader, tribunalSigla } = challenge;

  const candidates = ["captcha", "captchaValue", "txtCaptcha", "textoCaptcha", "codigoCaptcha"];

  const baseParams = new URLSearchParams();
  Object.entries(challenge.params).forEach(([k, v]) => baseParams.set(k, v));

  let lastMensagem: string | null = null;
  for (const captchaKey of candidates) {
    const attemptParams = new URLSearchParams(baseParams.toString());
    attemptParams.set(captchaKey, params.captchaText.trim());

    const searchResult = await searchEsajProcesso(baseUrl, { cookieHeader }, attemptParams);
    const mensagem = parseEsajMensagemErro(searchResult.body);
    if (mensagem) lastMensagem = mensagem;

    const links = parseEsajLinks(searchResult.body, baseUrl);
    const primeiroLink = links.find((link) => Boolean(link.url));

    let detalhesHtml = searchResult.body;
    let detalhesUrl: string | undefined;
    if (primeiroLink?.url) {
      const detalhes = await fetchEsajDetalhes(baseUrl, primeiroLink.url, searchResult.cookieHeader);
      if (detalhes) {
        detalhesHtml = detalhes.body;
        detalhesUrl = detalhes.url;
      }
    }

    const detalhes = parseEsajDetalhesHtml(detalhesHtml);
    const numeroProcessoExtraido = (detalhes.numeroEncontrado ? formatNumeroCnj(detalhes.numeroEncontrado) : undefined) || primeiroLink?.numero;

    if (!numeroProcessoExtraido) {
      // pode ser captcha inválido ou nenhum resultado; tenta próximo nome de campo
      continue;
    }

    const processo = buildEsajProcesso({
      tribunalSigla,
      numeroProcesso: numeroProcessoExtraido,
      detalhes,
      linkConsulta: detalhesUrl || primeiroLink?.url || undefined,
    });

    return {
      success: true,
      processo,
      processos: [processo],
      tempoResposta: Date.now() - start,
      debug: {
        captchaKeyUsado: captchaKey,
      },
    };
  }

  return {
    success: false,
    error: lastMensagem || "Não foi possível validar o captcha (ou não há resultados). Gere um novo e tente novamente.",
    tempoResposta: Date.now() - start,
  };
}

/**
 * Normaliza número de processo para formato CNJ
 */
export function normalizarNumeroProcesso(numero: string): string {
  // Remove caracteres não numéricos
  const apenasNumeros = numero.replace(/\D/g, "");

  // Se já está no formato CNJ (NNNNNNN-DD.AAAA.J.TR.OOOO), retorna
  if (apenasNumeros.length === 20) {
    return `${apenasNumeros.slice(0, 7)}-${apenasNumeros.slice(7, 9)}.${apenasNumeros.slice(9, 13)}.${apenasNumeros.slice(13, 14)}.${apenasNumeros.slice(14, 16)}.${apenasNumeros.slice(16, 20)}`;
  }

  // Se tem menos de 20 dígitos, tenta completar ou retorna como está
  return numero;
}

/**
 * Consulta processo no TJBA (e-SAJ)
 */
export async function consultarTJBA(numeroProcesso: string, options: ScrapingOptions = {}): Promise<CapturaResult> {
  return consultarEsaj("TJBA", "Tribunal de Justiça da Bahia", "BA", numeroProcesso, options);
}

/**
 * Consulta processo no TJSP (e-SAJ)
 */
export async function consultarTJSP(numeroProcesso: string, options: ScrapingOptions = {}): Promise<CapturaResult> {
  return consultarEsaj("TJSP", "Tribunal de Justiça de São Paulo", "SP", numeroProcesso, options);
}

/**
 * Consulta processo genérica - detecta tribunal e chama função apropriada
 */
export async function consultarProcesso(numeroProcesso: string, tribunalSigla?: string, options: ScrapingOptions = {}): Promise<CapturaResult> {
  const numeroNormalizado = numeroProcesso ? normalizarNumeroProcesso(numeroProcesso) : "";

  if (!numeroNormalizado && !options.oab) {
    return {
      success: false,
      error: "Número do processo ou OAB é obrigatório para consulta",
    };
  }

  // Se não especificou tribunal, tenta detectar pelo número
  if (!tribunalSigla) {
    const digits = numeroNormalizado.replace(/\D/g, "");
    if (digits.length === 20) {
      const tribunalCodigo = digits.slice(14, 16);
      if (tribunalCodigo === "26") {
        tribunalSigla = "TJSP";
      } else if (tribunalCodigo === "05") {
        tribunalSigla = "TJBA";
      }
    }
    tribunalSigla = tribunalSigla || "TJSP";
  }

  const tribunalConfig = getTribunalConfig({ sigla: tribunalSigla });

  if (!tribunalConfig) {
    return {
      success: false,
      error: `Tribunal não encontrado: ${tribunalSigla}`,
    };
  }

  if (!tribunalConfig.scrapingDisponivel) {
    return {
      success: false,
      error: `Scraping não disponível para ${tribunalConfig.nome}`,
    };
  }

  // Chama função específica baseada no tribunal
  switch (tribunalSigla) {
    case "TJBA":
      return consultarTJBA(numeroNormalizado, options);
    case "TJSP":
      return consultarTJSP(numeroNormalizado, options);
    default:
      return {
        success: false,
        error: `Scraping não implementado para ${tribunalSigla}`,
      };
  }
}

/**
 * Extrai partes do processo a partir do HTML/texto
 */
export function extrairPartes(html: string): ParteProcesso[] {
  // TODO: Implementar parsing real do HTML
  // Por enquanto, retorna array vazio
  return [];
}

/**
 * Extrai movimentações do processo a partir do HTML/texto
 */
export function extrairMovimentacoes(html: string): MovimentacaoProcesso[] {
  // TODO: Implementar parsing real do HTML
  // Por enquanto, retorna array vazio
  return [];
}
