export type HolidayScopeInput = {
  tribunalId?: string | null;
  uf?: string | null;
  municipio?: string | null;
};

export type HolidayScopeType =
  | "FINAL_DE_SEMANA"
  | "NACIONAL"
  | "ESTADUAL"
  | "MUNICIPAL"
  | "TRIBUNAL";

export type HolidayImpactSource =
  | "WEEKEND"
  | "TENANT_MANUAL"
  | "SHARED_OFFICIAL"
  | "SHARED_MANUAL";

export type HolidayOverrideMode = "NONE" | "TENANT_OVERRIDES_SHARED";

export type HolidayCatalogEntry = {
  id?: string;
  tenantId?: string | null;
  nome: string;
  data: Date;
  recorrente?: boolean;
  tipo: "NACIONAL" | "ESTADUAL" | "MUNICIPAL" | "JUDICIARIO";
  tribunalId?: string | null;
  uf?: string | null;
  municipio?: string | null;
  source?: HolidayImpactSource;
};

export type HolidayImpactReason = {
  dateIso: string;
  holidayName: string;
  scopeType: HolidayScopeType;
  scopeLabel: string;
  source: HolidayImpactSource;
};

export type HolidayImpactSnapshot = {
  baseDate: string;
  effectiveDate: string;
  wasShifted: boolean;
  shiftDays: number;
  summary: string | null;
  reasons: HolidayImpactReason[];
  overrideMode: HolidayOverrideMode;
  lastCalculatedAt: string;
};

type DedupeResult = {
  entries: HolidayCatalogEntry[];
  overrideMode: HolidayOverrideMode;
};

function normalizeText(value?: string | null): string {
  if (!value) {
    return "";
  }

  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

function normalizeUf(value?: string | null) {
  return normalizeText(value).slice(0, 2);
}

function normalizeMunicipio(value?: string | null) {
  return value?.trim().replace(/\s+/g, " ") ?? "";
}

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function toDateIso(date: Date) {
  return date.toISOString().slice(0, 10);
}

function toPtBrDate(dateLike: Date | string) {
  const date = dateLike instanceof Date ? dateLike : new Date(dateLike);
  return date.toLocaleDateString("pt-BR");
}

function getScopeType(entry: HolidayCatalogEntry): HolidayScopeType {
  if (entry.tribunalId || entry.tipo === "JUDICIARIO") {
    return "TRIBUNAL";
  }

  if (entry.tipo === "MUNICIPAL") {
    return "MUNICIPAL";
  }

  if (entry.tipo === "ESTADUAL") {
    return "ESTADUAL";
  }

  return "NACIONAL";
}

function getScopeLabel(entry: HolidayCatalogEntry): string {
  if (entry.tribunalId) {
    return "Tribunal";
  }

  if (entry.municipio && entry.uf) {
    return `${entry.municipio}/${entry.uf}`;
  }

  if (entry.municipio) {
    return entry.municipio;
  }

  if (entry.uf) {
    return entry.uf;
  }

  return "Brasil";
}

function inferEntrySource(entry: HolidayCatalogEntry): HolidayImpactSource {
  if (entry.source) {
    return entry.source;
  }

  if (entry.tenantId) {
    return "TENANT_MANUAL";
  }

  return "SHARED_MANUAL";
}

function isWeekendDate(date: Date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function isSameDateOrRecurringMatch(
  targetDate: Date,
  holidayDate: Date,
  recorrente: boolean,
) {
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

function holidayMatchesScope(
  holiday: HolidayCatalogEntry,
  scope: HolidayScopeInput,
) {
  const scopeTribunalId = scope.tribunalId?.trim() || "";
  const scopeUf = normalizeUf(scope.uf);
  const scopeMunicipio = normalizeText(scope.municipio);

  const holidayTribunalId = holiday.tribunalId?.trim() || "";
  const holidayUf = normalizeUf(holiday.uf);
  const holidayMunicipio = normalizeText(holiday.municipio);

  if (holidayTribunalId || holiday.tipo === "JUDICIARIO") {
    return scopeTribunalId === holidayTribunalId;
  }

  if (holiday.tipo === "NACIONAL") {
    return true;
  }

  if (holidayMunicipio) {
    if (!scopeMunicipio || scopeMunicipio !== holidayMunicipio) {
      return false;
    }

    if (holidayUf) {
      return scopeUf === holidayUf;
    }

    return true;
  }

  if (holidayUf) {
    return scopeUf === holidayUf;
  }

  return true;
}

function buildEntryKey(entry: HolidayCatalogEntry) {
  return [
    getScopeType(entry),
    normalizeUf(entry.uf),
    normalizeText(entry.municipio),
    entry.tribunalId?.trim() || "",
    Boolean(entry.recorrente),
    toDateIso(entry.data),
  ].join("|");
}

function dedupeEntriesForDate(entries: HolidayCatalogEntry[]): DedupeResult {
  const map = new Map<string, HolidayCatalogEntry>();
  let overrideMode: HolidayOverrideMode = "NONE";

  for (const entry of entries) {
    const key = buildEntryKey(entry);
    const existing = map.get(key);

    if (!existing) {
      map.set(key, entry);
      continue;
    }

    const existingIsTenant = Boolean(existing.tenantId);
    const entryIsTenant = Boolean(entry.tenantId);

    if (entryIsTenant && !existingIsTenant) {
      map.set(key, entry);
      overrideMode = "TENANT_OVERRIDES_SHARED";
    }
  }

  return {
    entries: Array.from(map.values()).sort((a, b) =>
      getScopeType(a).localeCompare(getScopeType(b)),
    ),
    overrideMode,
  };
}

function buildHolidayReason(
  entry: HolidayCatalogEntry,
  date: Date,
): HolidayImpactReason {
  return {
    dateIso: toDateIso(date),
    holidayName: entry.nome,
    scopeType: getScopeType(entry),
    scopeLabel: getScopeLabel(entry),
    source: inferEntrySource(entry),
  };
}

function buildWeekendReason(date: Date): HolidayImpactReason {
  return {
    dateIso: toDateIso(date),
    holidayName: "Final de semana",
    scopeType: "FINAL_DE_SEMANA",
    scopeLabel: "Dia nao util",
    source: "WEEKEND",
  };
}

function describeReason(reason: HolidayImpactReason) {
  switch (reason.scopeType) {
    case "MUNICIPAL":
      return `feriado municipal em ${reason.scopeLabel}`;
    case "ESTADUAL":
      return `feriado estadual em ${reason.scopeLabel}`;
    case "TRIBUNAL":
      return `feriado do tribunal`;
    case "FINAL_DE_SEMANA":
      return "final de semana";
    case "NACIONAL":
    default:
      return "feriado nacional";
  }
}

function describeSource(source: HolidayImpactSource) {
  switch (source) {
    case "TENANT_MANUAL":
      return "regra do escritorio";
    case "SHARED_OFFICIAL":
      return "catalogo oficial";
    case "SHARED_MANUAL":
      return "catalogo compartilhado";
    case "WEEKEND":
    default:
      return "calendario util";
  }
}

function buildSummary(reasons: HolidayImpactReason[], effectiveDate: Date) {
  if (reasons.length === 0) {
    return null;
  }

  const firstReason = describeReason(reasons[0]);
  const suffix =
    reasons.length > 1 ? " e outros impedimentos" : "";

  return `Prazo ajustado para ${toPtBrDate(effectiveDate)} por ${firstReason}${suffix}.`;
}

export function getHolidayImpactEffectiveDate(
  holidayImpact: HolidayImpactSnapshot | null | undefined,
  fallbackDate: Date | string,
) {
  if (!holidayImpact?.effectiveDate) {
    return fallbackDate instanceof Date ? fallbackDate : new Date(fallbackDate);
  }

  const parsed = new Date(holidayImpact.effectiveDate);
  return Number.isNaN(parsed.getTime())
    ? fallbackDate instanceof Date
      ? fallbackDate
      : new Date(fallbackDate)
    : parsed;
}

export function hasHolidayImpactShift(
  holidayImpact: HolidayImpactSnapshot | null | undefined,
) {
  return holidayImpact?.wasShifted === true && holidayImpact.shiftDays > 0;
}

export function buildHolidayImpactDetailLines(
  holidayImpact: HolidayImpactSnapshot | null | undefined,
) {
  if (!holidayImpact) {
    return [] as string[];
  }

  const lines = [
    `Data base: ${toPtBrDate(holidayImpact.baseDate)}`,
    `Data efetiva: ${toPtBrDate(holidayImpact.effectiveDate)}`,
  ];

  if (!holidayImpact.wasShifted || holidayImpact.reasons.length === 0) {
    return lines;
  }

  for (const reason of holidayImpact.reasons) {
    if (reason.scopeType === "FINAL_DE_SEMANA") {
      lines.push(`${toPtBrDate(reason.dateIso)} - Final de semana`);
      continue;
    }

    lines.push(
      `${toPtBrDate(reason.dateIso)} - ${reason.holidayName} (${describeReason(
        reason,
      )}, ${describeSource(reason.source)})`,
    );
  }

  if (holidayImpact.overrideMode === "TENANT_OVERRIDES_SHARED") {
    lines.push("Regra manual do escritorio prevaleceu sobre o catalogo compartilhado.");
  }

  return lines;
}

export function parseHolidayImpact(
  value: unknown,
): HolidayImpactSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const raw = value as Record<string, unknown>;

  if (
    typeof raw.baseDate !== "string" ||
    typeof raw.effectiveDate !== "string" ||
    typeof raw.wasShifted !== "boolean" ||
    typeof raw.shiftDays !== "number" ||
    typeof raw.lastCalculatedAt !== "string"
  ) {
    return null;
  }

  const reasons = Array.isArray(raw.reasons)
    ? raw.reasons.flatMap((reason) => {
        if (!reason || typeof reason !== "object" || Array.isArray(reason)) {
          return [];
        }

        const parsedReason = reason as Record<string, unknown>;

        if (
          typeof parsedReason.dateIso !== "string" ||
          typeof parsedReason.holidayName !== "string" ||
          typeof parsedReason.scopeType !== "string" ||
          typeof parsedReason.scopeLabel !== "string" ||
          typeof parsedReason.source !== "string"
        ) {
          return [];
        }

        return [
          {
            dateIso: parsedReason.dateIso,
            holidayName: parsedReason.holidayName,
            scopeType: parsedReason.scopeType as HolidayScopeType,
            scopeLabel: parsedReason.scopeLabel,
            source: parsedReason.source as HolidayImpactSource,
          },
        ];
      })
    : [];

  return {
    baseDate: raw.baseDate,
    effectiveDate: raw.effectiveDate,
    wasShifted: raw.wasShifted,
    shiftDays: raw.shiftDays,
    summary:
      typeof raw.summary === "string" && raw.summary.trim() ? raw.summary : null,
    reasons,
    overrideMode:
      raw.overrideMode === "TENANT_OVERRIDES_SHARED"
        ? "TENANT_OVERRIDES_SHARED"
        : "NONE",
    lastCalculatedAt: raw.lastCalculatedAt,
  };
}

export function computeHolidayImpactFromCalendar(params: {
  baseDate: Date;
  contarDiasUteis: boolean;
  scope?: HolidayScopeInput;
  entries?: HolidayCatalogEntry[];
  maxShiftDays?: number;
  calculatedAt?: Date;
}): HolidayImpactSnapshot {
  const scope = params.scope ?? {};
  const baseDate = new Date(params.baseDate);
  const entries = params.entries ?? [];
  const maxShiftDays = params.maxShiftDays ?? 20;
  const calculatedAt = params.calculatedAt ?? new Date();

  if (!params.contarDiasUteis) {
    return {
      baseDate: baseDate.toISOString(),
      effectiveDate: baseDate.toISOString(),
      wasShifted: false,
      shiftDays: 0,
      summary: null,
      reasons: [],
      overrideMode: "NONE",
      lastCalculatedAt: calculatedAt.toISOString(),
    };
  }

  const reasons: HolidayImpactReason[] = [];
  let overrideMode: HolidayOverrideMode = "NONE";
  let cursor = new Date(baseDate);

  for (let step = 0; step < maxShiftDays; step += 1) {
    const applicableEntries = entries.filter((entry) => {
      return (
        isSameDateOrRecurringMatch(
          cursor,
          entry.data,
          Boolean(entry.recorrente),
        ) && holidayMatchesScope(entry, scope)
      );
    });

    if (applicableEntries.length > 0) {
      const deduped = dedupeEntriesForDate(applicableEntries);
      for (const entry of deduped.entries) {
        reasons.push(buildHolidayReason(entry, cursor));
      }
      if (deduped.overrideMode === "TENANT_OVERRIDES_SHARED") {
        overrideMode = "TENANT_OVERRIDES_SHARED";
      }
      cursor = addDays(cursor, 1);
      continue;
    }

    if (isWeekendDate(cursor)) {
      reasons.push(buildWeekendReason(cursor));
      cursor = addDays(cursor, 1);
      continue;
    }

    break;
  }

  const shiftDays = Math.max(
    0,
    Math.round(
      (startOfDay(cursor).getTime() - startOfDay(baseDate).getTime()) /
        (24 * 60 * 60 * 1000),
    ),
  );
  const wasShifted = shiftDays > 0;

  return {
    baseDate: baseDate.toISOString(),
    effectiveDate: cursor.toISOString(),
    wasShifted,
    shiftDays,
    summary: wasShifted ? buildSummary(reasons, cursor) : null,
    reasons,
    overrideMode,
    lastCalculatedAt: calculatedAt.toISOString(),
  };
}
