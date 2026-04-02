import { getMunicipiosPorSiglaEstado } from "@/lib/api/brazil-municipios";
import logger from "@/lib/logger";
import { findFreePlanCapitalScope } from "@/app/lib/feriados/free-plan-capitals";

const BRASIL_API_HOLIDAYS_ENDPOINT = "https://brasilapi.com.br/api/feriados/v1";
const FERIADOS_API_BASE_URL =
  process.env.FERIADOS_API_BASE_URL?.trim().replace(/\/+$/, "") ||
  "https://feriadosapi.com";
const FERIADOS_API_PLAN =
  process.env.FERIADOS_API_PLAN?.trim().toLowerCase() === "paid"
    ? "paid"
    : "free";

export interface OfficialNationalHoliday {
  dateIso: string;
  date: Date;
  name: string;
}

export interface OfficialScopedHoliday {
  dateIso: string;
  date: Date;
  name: string;
  uf?: string | null;
  municipio?: string | null;
}

interface OfficialHolidaysSuccess {
  success: true;
  source: string;
  holidays: OfficialNationalHoliday[];
}

interface OfficialScopedHolidaysSuccess {
  success: true;
  source: string;
  holidays: OfficialScopedHoliday[];
}

interface OfficialHolidaysFailure {
  success: false;
  source: string;
  error: string;
  reason?:
    | "invalid_year"
    | "provider_not_configured"
    | "invalid_scope"
    | "municipio_not_found"
    | "capital_only_scope"
    | "source_unavailable";
}

export type OfficialHolidaysResult =
  | OfficialHolidaysSuccess
  | OfficialHolidaysFailure;

export type OfficialScopedHolidaysResult =
  | OfficialScopedHolidaysSuccess
  | OfficialHolidaysFailure;

function parseIsoDateOnly(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);
  const parsedDate = new Date(Date.UTC(year, month - 1, day));

  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return parsedDate;
}

function parseBrazilDateOnly(value: string): Date | null {
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(value.trim())) {
    return null;
  }

  const [day, month, year] = value.split("/").map(Number);
  const parsedDate = new Date(Date.UTC(year, month - 1, day));

  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return parsedDate;
}

function normalizeHolidayName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeTextKey(value?: string | null): string {
  if (!value) return "";

  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function isValidSyncYear(ano: number) {
  return Number.isInteger(ano) && ano >= 2000 && ano <= 2100;
}

function getRegionalHolidayApiKey(): string | null {
  const apiKey = process.env.FERIADOS_API_KEY?.trim();
  return apiKey ? apiKey : null;
}

export function getFeriadosApiPlan() {
  return FERIADOS_API_PLAN;
}

function buildRegionalHeaders() {
  const apiKey = getRegionalHolidayApiKey();

  if (!apiKey) {
    return null;
  }

  return {
    Accept: "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
}

async function fetchRegionalHolidayEndpoint(
  source: string,
): Promise<unknown | OfficialHolidaysFailure> {
  const headers = buildRegionalHeaders();

  if (!headers) {
    return {
      success: false,
      source,
      reason: "provider_not_configured",
      error:
        "Chave da fonte regional de feriados nao configurada. Defina FERIADOS_API_KEY para sincronizar feriados estaduais e municipais.",
    };
  }

  try {
    const response = await fetch(source, {
      method: "GET",
      cache: "no-store",
      headers,
    });

    if (!response.ok) {
      logger.warn(
        `Falha na consulta de feriados regionais: ${response.status} ${response.statusText} (${source})`,
      );

      return {
        success: false,
        source,
        reason: "source_unavailable",
        error:
          "Fonte regional de feriados indisponivel no momento. Tente novamente em alguns instantes.",
      };
    }

    return response.json();
  } catch (error) {
    logger.error("Erro ao consultar fonte regional de feriados:", error);

    return {
      success: false,
      source,
      reason: "source_unavailable",
      error: "Erro ao consultar fonte regional de feriados",
    };
  }
}

function mapScopedHolidaysFromPayload(
  rawPayload: unknown,
  source: string,
  expectedType: "ESTADUAL" | "MUNICIPAL",
  fallbackUf?: string | null,
  fallbackMunicipio?: string | null,
): OfficialScopedHolidaysResult {
  if (
    !rawPayload ||
    typeof rawPayload !== "object" ||
    !Array.isArray((rawPayload as any).feriados)
  ) {
    return {
      success: false,
      source,
      error: "Resposta invalida da fonte regional de feriados",
    };
  }

  const holidays = (rawPayload as any).feriados
    .filter(
      (item: unknown): item is {
        data: string;
        nome: string;
        tipo: string;
        uf?: string;
      } =>
        Boolean(
          item &&
            typeof item === "object" &&
            typeof (item as any).data === "string" &&
            typeof (item as any).nome === "string" &&
            typeof (item as any).tipo === "string",
        ),
    )
    .filter(
      (item: {
        data: string;
        nome: string;
        tipo: string;
        uf?: string;
      }) => normalizeTextKey(item.tipo) === expectedType,
    )
    .map((item: {
      data: string;
      nome: string;
      tipo: string;
      uf?: string;
    }) => {
      const parsedDate = parseBrazilDateOnly(item.data.trim());

      if (!parsedDate) {
        return null;
      }

      return {
        dateIso: parsedDate.toISOString().slice(0, 10),
        date: parsedDate,
        name: normalizeHolidayName(item.nome),
        uf: normalizeTextKey(item.uf || fallbackUf).slice(0, 2) || null,
        municipio: fallbackMunicipio
          ? normalizeHolidayName(fallbackMunicipio)
          : null,
      };
    })
    .filter(
      (item: OfficialScopedHoliday | null): item is OfficialScopedHoliday =>
        item !== null,
    );

  return {
    success: true,
    source,
    holidays,
  };
}

function mapNationalHolidaysFromPayload(
  rawPayload: unknown,
  source: string,
): OfficialHolidaysResult {
  if (
    !rawPayload ||
    typeof rawPayload !== "object" ||
    !Array.isArray((rawPayload as any).feriados)
  ) {
    return {
      success: false,
      source,
      error: "Resposta invalida da fonte oficial de feriados",
    };
  }

  const holidays = (rawPayload as any).feriados
    .filter(
      (item: unknown): item is { data: string; nome: string; tipo?: string } =>
        Boolean(
          item &&
            typeof item === "object" &&
            typeof (item as any).data === "string" &&
            typeof (item as any).nome === "string",
        ),
    )
    .filter((item: { data: string; nome: string; tipo?: string }) => {
      if (!item.tipo) return true;
      return normalizeTextKey(item.tipo) === "NACIONAL";
    })
    .map((item: { data: string; nome: string }) => {
      const parsedDate = parseBrazilDateOnly(item.data.trim());

      if (!parsedDate) {
        return null;
      }

      return {
        dateIso: parsedDate.toISOString().slice(0, 10),
        date: parsedDate,
        name: normalizeHolidayName(item.nome),
      };
    })
    .filter((item: OfficialNationalHoliday | null): item is OfficialNationalHoliday => item !== null);

  if (holidays.length === 0) {
    return {
      success: false,
      source,
      error: "Nenhum feriado nacional encontrado para o ano informado",
    };
  }

  return {
    success: true,
    source,
    holidays,
  };
}

async function resolveMunicipioIbge(
  uf: string,
  municipio: string,
): Promise<{ ibge: string; nome: string; uf: string } | null> {
  const normalizedUf = normalizeTextKey(uf).slice(0, 2);
  const normalizedMunicipio = normalizeTextKey(municipio);

  if (!normalizedUf || !normalizedMunicipio) {
    return null;
  }

  const municipios = await getMunicipiosPorSiglaEstado(normalizedUf);
  const exactMatch = municipios.find(
    (item) => normalizeTextKey(item.nome) === normalizedMunicipio,
  );

  if (exactMatch) {
    return {
      ibge: String(exactMatch.id),
      nome: exactMatch.nome,
      uf: normalizedUf,
    };
  }

  const partialMatches = municipios.filter((item) => {
    const normalizedItem = normalizeTextKey(item.nome);

    return (
      normalizedItem.includes(normalizedMunicipio) ||
      normalizedMunicipio.includes(normalizedItem)
    );
  });

  if (partialMatches.length === 1) {
    return {
      ibge: String(partialMatches[0].id),
      nome: partialMatches[0].nome,
      uf: normalizedUf,
    };
  }

  return null;
}

export function isRegionalHolidaySyncConfigured() {
  return Boolean(getRegionalHolidayApiKey());
}

export async function fetchOfficialNationalHolidays(
  ano: number,
): Promise<OfficialHolidaysResult> {
  const source = `${BRASIL_API_HOLIDAYS_ENDPOINT}/${ano}`;
  const regionalSource = `${FERIADOS_API_BASE_URL}/api/v1/feriados/nacionais?ano=${ano}`;

  if (!isValidSyncYear(ano)) {
    return {
      success: false,
      source,
      reason: "invalid_year",
      error: "Ano invalido para sincronizacao",
    };
  }

  if (getRegionalHolidayApiKey()) {
    const rawRegionalPayload = await fetchRegionalHolidayEndpoint(regionalSource);

    if ((rawRegionalPayload as OfficialHolidaysFailure)?.success !== false) {
      const regionalResult = mapNationalHolidaysFromPayload(
        rawRegionalPayload,
        regionalSource,
      );

      if (regionalResult.success) {
        return regionalResult;
      }
    } else {
      logger.warn(
        `Falha ao consultar feriados nacionais na Feriados API (${regionalSource}). Aplicando fallback BrasilAPI.`,
      );
    }
  }

  try {
    const response = await fetch(source, {
      method: "GET",
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      logger.warn(
        `Falha na consulta de feriados nacionais (${ano}): ${response.status} ${response.statusText}`,
      );

      return {
        success: false,
        source,
        reason: "source_unavailable",
        error:
          "Fonte oficial indisponivel no momento. Tente novamente em alguns instantes.",
      };
    }

    const rawPayload = await response.json();

    if (!Array.isArray(rawPayload)) {
      return {
        success: false,
        source,
        error: "Resposta invalida da fonte oficial de feriados",
      };
    }

    const holidays = rawPayload
      .filter(
        (item): item is { date: string; name: string; type: string } =>
          Boolean(
            item &&
              typeof item === "object" &&
              typeof (item as any).date === "string" &&
              typeof (item as any).name === "string" &&
              typeof (item as any).type === "string",
          ),
      )
      .filter((item) => item.type.toLowerCase() === "national")
      .map((item) => {
        const parsedDate = parseIsoDateOnly(item.date.trim());

        if (!parsedDate) {
          return null;
        }

        return {
          dateIso: item.date.trim(),
          date: parsedDate,
          name: normalizeHolidayName(item.name),
        };
      })
      .filter((item): item is OfficialNationalHoliday => item !== null);

    if (holidays.length === 0) {
      return {
        success: false,
        source,
        error: "Nenhum feriado nacional encontrado para o ano informado",
      };
    }

    return {
      success: true,
      source,
      holidays,
    };
  } catch (error) {
    logger.error("Erro ao consultar fonte oficial de feriados:", error);

    return {
      success: false,
      source,
      reason: "source_unavailable",
      error: "Erro ao consultar fonte oficial de feriados",
    };
  }
}

export async function fetchOfficialStateHolidays(
  ano: number,
  uf: string,
): Promise<OfficialScopedHolidaysResult> {
  const normalizedUf = normalizeTextKey(uf).slice(0, 2);
  const source = `${FERIADOS_API_BASE_URL}/api/v1/feriados/estado/${normalizedUf}?ano=${ano}`;

  if (!isValidSyncYear(ano)) {
    return {
      success: false,
      source,
      reason: "invalid_year",
      error: "Ano invalido para sincronizacao",
    };
  }

  if (normalizedUf.length !== 2) {
    return {
      success: false,
      source,
      reason: "invalid_scope",
      error: "UF invalida para sincronizacao regional",
    };
  }

  const rawPayload = await fetchRegionalHolidayEndpoint(source);

  if ((rawPayload as OfficialHolidaysFailure)?.success === false) {
    return rawPayload as OfficialHolidaysFailure;
  }

  return mapScopedHolidaysFromPayload(rawPayload, source, "ESTADUAL", normalizedUf);
}

export async function fetchOfficialMunicipalHolidays(
  ano: number,
  uf: string,
  municipio: string,
): Promise<OfficialScopedHolidaysResult> {
  const normalizedUf = normalizeTextKey(uf).slice(0, 2);
  const normalizedMunicipio = normalizeHolidayName(municipio);
  const sourceBase = `${FERIADOS_API_BASE_URL}/api/v1/feriados/cidade`;

  if (!isValidSyncYear(ano)) {
    return {
      success: false,
      source: sourceBase,
      reason: "invalid_year",
      error: "Ano invalido para sincronizacao",
    };
  }

  if (normalizedUf.length !== 2 || !normalizedMunicipio) {
    return {
      success: false,
      source: sourceBase,
      reason: "invalid_scope",
      error: "Escopo municipal invalido para sincronizacao regional",
    };
  }

  const municipioResolvido = await resolveMunicipioIbge(
    normalizedUf,
    normalizedMunicipio,
  );

  if (!municipioResolvido) {
    return {
      success: false,
      source: sourceBase,
      reason: "municipio_not_found",
      error:
        "Municipio nao encontrado na base do IBGE para sincronizacao de feriados municipais.",
    };
  }

  const capitalScope = findFreePlanCapitalScope({
    uf: municipioResolvido.uf,
    municipio: municipioResolvido.nome,
    ibge: municipioResolvido.ibge,
  });

  if (getFeriadosApiPlan() === "free" && !capitalScope) {
    return {
      success: false,
      source: sourceBase,
      reason: "capital_only_scope",
      error:
        "Plano free da Feriados API cobre feriados municipais apenas nas 27 capitais. Para municipios do interior, mantenha cadastro manual ou use um plano pago.",
    };
  }

  const source = `${sourceBase}/${municipioResolvido.ibge}?ano=${ano}`;
  const rawPayload = await fetchRegionalHolidayEndpoint(source);

  if ((rawPayload as OfficialHolidaysFailure)?.success === false) {
    return rawPayload as OfficialHolidaysFailure;
  }

  return mapScopedHolidaysFromPayload(
    rawPayload,
    source,
    "MUNICIPAL",
    municipioResolvido.uf,
    municipioResolvido.nome,
  );
}
