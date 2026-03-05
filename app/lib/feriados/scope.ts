import { TipoFeriado } from "@/generated/prisma";

export interface HolidayScope {
  tribunalId?: string | null;
  uf?: string | null;
  municipio?: string | null;
}

export interface HolidayScopeRecord {
  tipo: TipoFeriado;
  tribunalId?: string | null;
  uf?: string | null;
  municipio?: string | null;
}

function normalizeText(value?: string | null): string {
  if (!value) return "";

  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

function normalizeUf(value?: string | null): string {
  return normalizeText(value).slice(0, 2);
}

export function isWeekendDate(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

export function isSameDateOrRecurringMatch(
  targetDate: Date,
  holidayDate: Date,
  recorrente: boolean,
): boolean {
  if (!recorrente) {
    return (
      targetDate.getFullYear() === holidayDate.getFullYear() &&
      targetDate.getMonth() === holidayDate.getMonth() &&
      targetDate.getDate() === holidayDate.getDate()
    );
  }

  return (
    targetDate.getMonth() === holidayDate.getMonth() &&
    targetDate.getDate() === holidayDate.getDate()
  );
}

export function holidayMatchesScope(
  holiday: HolidayScopeRecord,
  scope: HolidayScope,
): boolean {
  const scopeTribunalId = scope.tribunalId?.trim() || "";
  const scopeUf = normalizeUf(scope.uf);
  const scopeMunicipio = normalizeText(scope.municipio);

  const holidayTribunalId = holiday.tribunalId?.trim() || "";
  const holidayUf = normalizeUf(holiday.uf);
  const holidayMunicipio = normalizeText(holiday.municipio);

  // Escopo mais específico: tribunal.
  if (holidayTribunalId) {
    return scopeTribunalId === holidayTribunalId;
  }

  // Feriado nacional sempre aplica.
  if (holiday.tipo === TipoFeriado.NACIONAL) {
    return true;
  }

  // Municipal exige município correspondente (e UF quando informada).
  if (holidayMunicipio) {
    if (!scopeMunicipio || scopeMunicipio !== holidayMunicipio) {
      return false;
    }

    if (holidayUf) {
      return scopeUf === holidayUf;
    }

    return true;
  }

  // Estadual/Judiciário por UF (quando a origem informa UF).
  if (holidayUf) {
    return scopeUf === holidayUf;
  }

  // Registro sem amarração geográfica: aplica no tenant.
  return true;
}

