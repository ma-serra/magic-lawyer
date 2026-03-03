import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";

const CNJ_SGT_ENDPOINT = "https://www.cnj.jus.br/sgt/sgt_ws.php";
const SOAP_TIMEOUT_MS = 12000;
const SEARCH_LIMIT = 14;

type CausaPayload = {
  nome: string;
  codigoCnj: string | null;
  descricao: string | null;
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

type FetchCausasResult =
  | {
      success: true;
      causas: CausaPayload[];
      total: number;
    }
  | {
      success: false;
      error:
        | "CNJ retornou status 200 com erro"
        | "CNJ retornou SoapFault"
        | "Erro de comunicação com CNJ";
      details?: string;
    };

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

    const codeRaw = extractTag(raw, "cod_item");
    const descricaoRaw = extractTag(raw, "dscGlossario");

    const key = nome.toLowerCase();
    if (!map.has(key)) {
      map.set(key, {
        nome,
        codigoCnj: codeRaw && codeRaw.length > 0 ? codeRaw : null,
        descricao: descricaoRaw && descricaoRaw.length > 0 ? stripHtml(descricaoRaw) : null,
      });
    }
  }

  return Array.from(map.values());
}

function buildSoapEnvelope(search: string, tipoTabela: string, tipoPesquisa: string): string {
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
): Promise<FetchCausasResult> {
  const envelope = buildSoapEnvelope(search, tipoTabela, tipoPesquisa);
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
        error: "CNJ retornou status 200 com erro",
      };
    }

    const xml = await response.text();

    if (/SoapFault/i.test(xml) || /faultstring/i.test(xml)) {
      return { success: false, error: "CNJ retornou SoapFault" };
    }

    const causas = parseSoapItems(xml);
    return { success: true, causas, total: causas.length };
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

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const tipoTabela = (searchParams.get("tipoTabela") || "C").trim();
  const tipoPesquisa = (searchParams.get("tipoPesquisa") || "N").trim();
  const queryParam = searchParams.getAll("q");

  const requestedSearches = queryParam
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value) => value.length >= 3)
    .slice(0, SEARCH_LIMIT);

  const queries = requestedSearches.length ? requestedSearches : DEFAULT_SEARCH_TERMS;
  const merged = new Map<string, CausaPayload>();
  const diagnostics: Array<{
    query: string;
    count: number;
    error?: string;
  }> = [];

  for (const query of queries) {
    const result = await fetchCausasFromCNJ(query, tipoTabela, tipoPesquisa);
    if (!result.success) {
      diagnostics.push({
        query,
        count: 0,
        error: result.error,
      });
      continue;
    }

    for (const causa of result.causas) {
      const key = `${causa.nome.toLowerCase()}|${causa.codigoCnj ?? ""}`;
      if (!merged.has(key)) {
        merged.set(key, causa);
      }
    }

    diagnostics.push({
      query,
      count: result.total,
    });
  }

  if (!merged.size) {
    return NextResponse.json(
      {
        success: false,
        error: "Não foi possível obter causas oficiais no momento.",
        diagnostics,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    success: true,
    source: "cnj-sgt-soap",
    total: merged.size,
    consultas: diagnostics,
    causas: Array.from(merged.values()),
  });
}
