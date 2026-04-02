import prisma from "@/app/lib/prisma";
import { getRedisInstance } from "@/app/lib/notifications/redis-singleton";
import { FREE_PLAN_CAPITALS } from "@/app/lib/feriados/free-plan-capitals";
import {
  fetchOfficialMunicipalHolidays,
  fetchOfficialNationalHolidays,
  fetchOfficialStateHolidays,
  type OfficialScopedHoliday,
} from "@/app/lib/feriados/oficial";

const HOLIDAY_SYNC_LOCK_TTL_SECONDS = 90;
const HOLIDAY_SYNC_CACHE_TTL_SECONDS = 6 * 60 * 60;

export interface HolidaySyncScope {
  uf?: string | null;
  municipio?: string | null;
}

export interface HolidaySeedResult {
  seeded: boolean;
  source?: string;
  created?: number;
  updated?: number;
  ignored?: number;
  reason?:
    | "invalid_year"
    | "cache_hit"
    | "already_seeded"
    | "lock_busy"
    | "source_unavailable"
    | "provider_not_configured"
    | "invalid_scope"
    | "municipio_not_found"
    | "capital_only_scope";
  error?: string;
}

export interface HolidayScopeSeedSummary {
  created: number;
  updated: number;
  ignored: number;
  warnings: string[];
  national: HolidaySeedResult;
  state?: HolidaySeedResult;
  municipal?: HolidaySeedResult;
}

export interface HolidayCatalogSeedSummary {
  year: number;
  created: number;
  updated: number;
  ignored: number;
  warnings: string[];
  national: HolidaySeedResult;
  states: Array<{ uf: string; result: HolidaySeedResult }>;
  capitals: Array<{
    uf: string;
    municipio: string;
    ibge: string;
    result: HolidaySeedResult;
  }>;
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

function normalizeUf(value?: string | null) {
  return normalizeTextKey(value).slice(0, 2);
}

function normalizeMunicipio(value?: string | null) {
  return value?.trim().replace(/\s+/g, " ") || "";
}

function getYearRangeUtc(ano: number) {
  return {
    start: new Date(Date.UTC(ano, 0, 1)),
    end: new Date(Date.UTC(ano, 11, 31, 23, 59, 59, 999)),
  };
}

async function tryGetRedis() {
  try {
    return getRedisInstance();
  } catch {
    return null;
  }
}

async function acquireSeedLock(lockKey: string) {
  const redis = await tryGetRedis();

  if (!redis) {
    return { redis: null, canSync: true };
  }

  try {
    const cachedSeed = await redis.get(lockKey.replace(":seed-lock", ":seeded"));
    if (cachedSeed) {
      return { redis, canSync: false, reason: "cache_hit" as const };
    }

    const lock = await redis.set(
      lockKey,
      String(Date.now()),
      "EX",
      HOLIDAY_SYNC_LOCK_TTL_SECONDS,
      "NX",
    );

    return {
      redis,
      canSync: lock === "OK",
      reason: lock === "OK" ? undefined : ("lock_busy" as const),
    };
  } catch {
    return { redis, canSync: true };
  }
}

async function markSeedDone(doneKey: string) {
  const redis = await tryGetRedis();
  if (!redis) return;

  try {
    await redis.set(
      doneKey,
      String(Date.now()),
      "EX",
      HOLIDAY_SYNC_CACHE_TTL_SECONDS,
    );
  } catch {
    // sem bloqueio por falha de redis
  }
}

async function upsertScopedSharedHoliday(
  holiday: OfficialScopedHoliday,
  tipo: "ESTADUAL" | "MUNICIPAL",
  description: string,
) {
  const existente = await prisma.feriado.findFirst({
    where: {
      tenantId: null,
      deletedAt: null,
      tipo,
      data: holiday.date,
      uf: holiday.uf ?? null,
      municipio: holiday.municipio ?? null,
      tribunalId: null,
    },
    select: {
      id: true,
      nome: true,
      descricao: true,
    },
  });

  if (!existente) {
    await prisma.feriado.create({
      data: {
        tenantId: null,
        nome: holiday.name,
        data: holiday.date,
        tipo,
        uf: holiday.uf ?? null,
        municipio: holiday.municipio ?? null,
        recorrente: false,
        descricao: description,
      },
    });

    return { created: 1, updated: 0, ignored: 0 };
  }

  if (
    existente.nome !== holiday.name ||
    existente.descricao !== description
  ) {
    await prisma.feriado.update({
      where: { id: existente.id },
      data: {
        nome: holiday.name,
        descricao: description,
      },
    });

    return { created: 0, updated: 1, ignored: 0 };
  }

  return { created: 0, updated: 0, ignored: 1 };
}

export async function ensureSharedNationalHolidays(
  ano: number,
): Promise<HolidaySeedResult> {
  if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) {
    return { seeded: false, reason: "invalid_year" };
  }

  const { start, end } = getYearRangeUtc(ano);
  const doneKey = `feriados:nacionais:${ano}:seeded`;
  const lockKey = `feriados:nacionais:${ano}:seed-lock`;
  const lock = await acquireSeedLock(lockKey);

  if (!lock.canSync) {
    return {
      seeded: false,
      reason: lock.reason === "cache_hit" ? "cache_hit" : "lock_busy",
    };
  }

  const globalCount = await prisma.feriado.count({
    where: {
      tenantId: null,
      deletedAt: null,
      tipo: "NACIONAL",
      data: {
        gte: start,
        lte: end,
      },
    },
  });

  if (globalCount > 0) {
    await markSeedDone(doneKey);
    return { seeded: false, reason: "already_seeded", ignored: globalCount };
  }

  const sourceResult = await fetchOfficialNationalHolidays(ano);

  if (!sourceResult.success) {
    return {
      seeded: false,
      reason: sourceResult.reason ?? "source_unavailable",
      source: sourceResult.source,
      error: sourceResult.error,
    };
  }

  let created = 0;
  let updated = 0;
  let ignored = 0;

  for (const feriado of sourceResult.holidays) {
    const existente = await prisma.feriado.findFirst({
      where: {
        tenantId: null,
        deletedAt: null,
        tipo: "NACIONAL",
        data: feriado.date,
      },
      select: {
        id: true,
        nome: true,
        descricao: true,
      },
    });

    const descricao =
      "Feriado nacional sincronizado automaticamente da fonte oficial (BrasilAPI).";

    if (!existente) {
      await prisma.feriado.create({
        data: {
          tenantId: null,
          nome: feriado.name,
          data: feriado.date,
          tipo: "NACIONAL",
          recorrente: false,
          descricao,
        },
      });
      created += 1;
      continue;
    }

    if (existente.nome !== feriado.name || existente.descricao !== descricao) {
      await prisma.feriado.update({
        where: { id: existente.id },
        data: {
          nome: feriado.name,
          descricao,
        },
      });
      updated += 1;
    } else {
      ignored += 1;
    }
  }

  await markSeedDone(doneKey);

  return {
    seeded: true,
    source: sourceResult.source,
    created,
    updated,
    ignored,
  };
}

export async function ensureSharedStateHolidays(
  ano: number,
  uf: string,
): Promise<HolidaySeedResult> {
  const normalizedUf = normalizeUf(uf);

  if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) {
    return { seeded: false, reason: "invalid_year" };
  }

  if (normalizedUf.length !== 2) {
    return { seeded: false, reason: "invalid_scope" };
  }

  const { start, end } = getYearRangeUtc(ano);
  const doneKey = `feriados:estaduais:${ano}:${normalizedUf}:seeded`;
  const lockKey = `feriados:estaduais:${ano}:${normalizedUf}:seed-lock`;
  const lock = await acquireSeedLock(lockKey);

  if (!lock.canSync) {
    return {
      seeded: false,
      reason: lock.reason === "cache_hit" ? "cache_hit" : "lock_busy",
    };
  }

  const existingCount = await prisma.feriado.count({
    where: {
      tenantId: null,
      deletedAt: null,
      tipo: "ESTADUAL",
      uf: normalizedUf,
      data: {
        gte: start,
        lte: end,
      },
    },
  });

  if (existingCount > 0) {
    await markSeedDone(doneKey);
    return { seeded: false, reason: "already_seeded", ignored: existingCount };
  }

  const sourceResult = await fetchOfficialStateHolidays(ano, normalizedUf);

  if (!sourceResult.success) {
    return {
      seeded: false,
      source: sourceResult.source,
      reason: sourceResult.reason ?? "source_unavailable",
      error: sourceResult.error,
    };
  }

  let created = 0;
  let updated = 0;
  let ignored = 0;
  const descricao = `Feriado estadual sincronizado automaticamente da fonte oficial regional (${normalizedUf}).`;

  for (const feriado of sourceResult.holidays) {
    const result = await upsertScopedSharedHoliday(
      {
        ...feriado,
        uf: normalizedUf,
        municipio: null,
      },
      "ESTADUAL",
      descricao,
    );

    created += result.created;
    updated += result.updated;
    ignored += result.ignored;
  }

  await markSeedDone(doneKey);

  return {
    seeded: true,
    source: sourceResult.source,
    created,
    updated,
    ignored,
  };
}

export async function ensureSharedMunicipalHolidays(
  ano: number,
  uf: string,
  municipio: string,
): Promise<HolidaySeedResult> {
  const normalizedUf = normalizeUf(uf);
  const normalizedMunicipio = normalizeMunicipio(municipio);

  if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) {
    return { seeded: false, reason: "invalid_year" };
  }

  if (normalizedUf.length !== 2 || !normalizedMunicipio) {
    return { seeded: false, reason: "invalid_scope" };
  }

  const { start, end } = getYearRangeUtc(ano);
  const municipioKey = normalizeTextKey(normalizedMunicipio);
  const doneKey = `feriados:municipais:${ano}:${normalizedUf}:${municipioKey}:seeded`;
  const lockKey =
    `feriados:municipais:${ano}:${normalizedUf}:${municipioKey}:seed-lock`;
  const lock = await acquireSeedLock(lockKey);

  if (!lock.canSync) {
    return {
      seeded: false,
      reason: lock.reason === "cache_hit" ? "cache_hit" : "lock_busy",
    };
  }

  const existingCount = await prisma.feriado.count({
    where: {
      tenantId: null,
      deletedAt: null,
      tipo: "MUNICIPAL",
      uf: normalizedUf,
      municipio: normalizedMunicipio,
      data: {
        gte: start,
        lte: end,
      },
    },
  });

  if (existingCount > 0) {
    await markSeedDone(doneKey);
    return { seeded: false, reason: "already_seeded", ignored: existingCount };
  }

  const sourceResult = await fetchOfficialMunicipalHolidays(
    ano,
    normalizedUf,
    normalizedMunicipio,
  );

  if (!sourceResult.success) {
    return {
      seeded: false,
      source: sourceResult.source,
      reason: sourceResult.reason ?? "source_unavailable",
      error: sourceResult.error,
    };
  }

  let created = 0;
  let updated = 0;
  let ignored = 0;
  const descricao =
    `Feriado municipal sincronizado automaticamente da fonte oficial regional (${normalizedMunicipio}/${normalizedUf}).`;

  for (const feriado of sourceResult.holidays) {
    const result = await upsertScopedSharedHoliday(
      {
        ...feriado,
        uf: feriado.uf ?? normalizedUf,
        municipio: feriado.municipio ?? normalizedMunicipio,
      },
      "MUNICIPAL",
      descricao,
    );

    created += result.created;
    updated += result.updated;
    ignored += result.ignored;
  }

  await markSeedDone(doneKey);

  return {
    seeded: true,
    source: sourceResult.source,
    created,
    updated,
    ignored,
  };
}

export async function ensureSharedOfficialHolidaysForScope(
  ano: number,
  scope: HolidaySyncScope = {},
): Promise<HolidayScopeSeedSummary> {
  const normalizedUf = normalizeUf(scope.uf);
  const normalizedMunicipio = normalizeMunicipio(scope.municipio);

  const national = await ensureSharedNationalHolidays(ano);
  const state = normalizedUf
    ? await ensureSharedStateHolidays(ano, normalizedUf)
    : undefined;
  const municipal =
    normalizedUf && normalizedMunicipio
      ? await ensureSharedMunicipalHolidays(
          ano,
          normalizedUf,
          normalizedMunicipio,
        )
      : undefined;

  const warnings = [national, state, municipal]
    .filter(Boolean)
    .flatMap((result) => {
      if (!result || result.seeded) return [];

      if (
        result.reason === "provider_not_configured" ||
        result.reason === "source_unavailable" ||
        result.reason === "municipio_not_found" ||
        result.reason === "capital_only_scope"
      ) {
        return [result.error || "Falha ao sincronizar feriados oficiais"];
      }

      return [];
    });

  return {
    created:
      (national.created ?? 0) + (state?.created ?? 0) + (municipal?.created ?? 0),
    updated:
      (national.updated ?? 0) + (state?.updated ?? 0) + (municipal?.updated ?? 0),
    ignored:
      (national.ignored ?? 0) + (state?.ignored ?? 0) + (municipal?.ignored ?? 0),
    warnings,
    national,
    state,
    municipal,
  };
}

export async function ensureSharedOfficialHolidaysForYears(
  years: number[],
  scope: HolidaySyncScope = {},
) {
  const uniqueYears = Array.from(
    new Set(
      years.filter((year) => Number.isInteger(year) && year >= 2000 && year <= 2100),
    ),
  ).sort((a, b) => a - b);

  const summaries: HolidayScopeSeedSummary[] = [];

  for (const year of uniqueYears) {
    summaries.push(await ensureSharedOfficialHolidaysForScope(year, scope));
  }

  return summaries;
}

export async function ensureSharedFreePlanOfficialHolidaysForYears(
  years: number[],
) {
  const uniqueYears = Array.from(
    new Set(
      years.filter((year) => Number.isInteger(year) && year >= 2000 && year <= 2100),
    ),
  ).sort((a, b) => a - b);

  const summaries: HolidayCatalogSeedSummary[] = [];

  for (const year of uniqueYears) {
    const national = await ensureSharedNationalHolidays(year);
    const states: HolidayCatalogSeedSummary["states"] = [];
    const capitals: HolidayCatalogSeedSummary["capitals"] = [];

    for (const capital of FREE_PLAN_CAPITALS) {
      states.push({
        uf: capital.uf,
        result: await ensureSharedStateHolidays(year, capital.uf),
      });
    }

    for (const capital of FREE_PLAN_CAPITALS) {
      capitals.push({
        ...capital,
        result: await ensureSharedMunicipalHolidays(
          year,
          capital.uf,
          capital.municipio,
        ),
      });
    }

    const warnings = [national, ...states.map((item) => item.result), ...capitals.map((item) => item.result)]
      .flatMap((result) => {
        if (result.seeded || !result.error) return [];
        if (
          result.reason === "cache_hit" ||
          result.reason === "already_seeded"
        ) {
          return [];
        }

        return [result.error];
      });

    summaries.push({
      year,
      created:
        (national.created ?? 0) +
        states.reduce((sum, item) => sum + (item.result.created ?? 0), 0) +
        capitals.reduce((sum, item) => sum + (item.result.created ?? 0), 0),
      updated:
        (national.updated ?? 0) +
        states.reduce((sum, item) => sum + (item.result.updated ?? 0), 0) +
        capitals.reduce((sum, item) => sum + (item.result.updated ?? 0), 0),
      ignored:
        (national.ignored ?? 0) +
        states.reduce((sum, item) => sum + (item.result.ignored ?? 0), 0) +
        capitals.reduce((sum, item) => sum + (item.result.ignored ?? 0), 0),
      warnings,
      national,
      states,
      capitals,
    });
  }

  return summaries;
}
