import logger from "@/lib/logger";

const BRASIL_API_HOLIDAYS_ENDPOINT = "https://brasilapi.com.br/api/feriados/v1";

export interface OfficialNationalHoliday {
  dateIso: string;
  date: Date;
  name: string;
}

interface OfficialHolidaysSuccess {
  success: true;
  source: string;
  holidays: OfficialNationalHoliday[];
}

interface OfficialHolidaysFailure {
  success: false;
  source: string;
  error: string;
}

export type OfficialHolidaysResult =
  | OfficialHolidaysSuccess
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

function normalizeHolidayName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export async function fetchOfficialNationalHolidays(
  ano: number,
): Promise<OfficialHolidaysResult> {
  const source = `${BRASIL_API_HOLIDAYS_ENDPOINT}/${ano}`;

  if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) {
    return {
      success: false,
      source,
      error: "Ano inválido para sincronização",
    };
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
        error:
          "Fonte oficial indisponível no momento. Tente novamente em alguns instantes.",
      };
    }

    const rawPayload = await response.json();

    if (!Array.isArray(rawPayload)) {
      return {
        success: false,
        source,
        error: "Resposta inválida da fonte oficial de feriados",
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
      error: "Erro ao consultar fonte oficial de feriados",
    };
  }
}
