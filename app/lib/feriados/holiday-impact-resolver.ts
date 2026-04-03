import prisma from "@/app/lib/prisma";
import { ensureSharedOfficialHolidaysForScope } from "@/app/lib/feriados/sync";
import {
  computeHolidayImpactFromCalendar,
  parseHolidayImpact,
  type HolidayCatalogEntry,
  type HolidayImpactSnapshot,
  type HolidayScopeInput,
} from "@/app/lib/feriados/holiday-impact";
import { ProcessoPrazoStatus, Prisma } from "@/generated/prisma";

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function normalizeText(value?: string | null) {
  if (!value) {
    return "";
  }

  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

function inferHolidaySource(params: {
  tenantId?: string | null;
  descricao?: string | null;
}) {
  if (params.tenantId) {
    return "TENANT_MANUAL" as const;
  }

  const description = params.descricao?.toLowerCase() ?? "";

  if (
    description.includes("fonte oficial") ||
    description.includes("sincronizado automaticamente")
  ) {
    return "SHARED_OFFICIAL" as const;
  }

  return "SHARED_MANUAL" as const;
}

export function buildHolidayScopeFromProcess(params: {
  tribunalId?: string | null;
  uf?: string | null;
  municipio?: string | null;
}): HolidayScopeInput {
  return {
    tribunalId: params.tribunalId ?? null,
    uf: params.uf ?? null,
    municipio: params.municipio ?? null,
  };
}

async function listCalendarEntries(params: {
  tenantId: string;
  baseDate: Date;
  scope: HolidayScopeInput;
  maxShiftDays?: number;
}) {
  const maxShiftDays = params.maxShiftDays ?? 20;
  const yearCandidates = Array.from(
    new Set([params.baseDate.getUTCFullYear(), addDays(params.baseDate, maxShiftDays).getUTCFullYear()]),
  );

  for (const year of yearCandidates) {
    await ensureSharedOfficialHolidaysForScope(year, {
      uf: params.scope.uf,
      municipio: params.scope.municipio,
    });
  }

  const entries = await prisma.feriado.findMany({
    where: {
      AND: [
        {
          OR: [{ tenantId: params.tenantId }, { tenantId: null }],
        },
        {
          deletedAt: null,
        },
        {
          OR: [
            {
              data: {
                gte: startOfDay(addDays(params.baseDate, -1)),
                lte: endOfDay(addDays(params.baseDate, maxShiftDays)),
              },
            },
            {
              recorrente: true,
            },
          ],
        },
      ],
    },
    select: {
      id: true,
      tenantId: true,
      nome: true,
      data: true,
      recorrente: true,
      tipo: true,
      tribunalId: true,
      uf: true,
      municipio: true,
      descricao: true,
    },
  });

  return entries.map(
    (entry) =>
      ({
        id: entry.id,
        tenantId: entry.tenantId,
        nome: entry.nome,
        data: entry.data,
        recorrente: entry.recorrente,
        tipo: entry.tipo,
        tribunalId: entry.tribunalId,
        uf: entry.uf,
        municipio: entry.municipio,
        source: inferHolidaySource({
          tenantId: entry.tenantId,
          descricao: entry.descricao,
        }),
      }) satisfies HolidayCatalogEntry,
  );
}

export async function resolveHolidayImpactForPrazoDraft(params: {
  tenantId: string;
  baseDate: Date;
  regimePrazoId?: string | null;
  scope?: HolidayScopeInput;
  maxShiftDays?: number;
}): Promise<HolidayImpactSnapshot> {
  const scope = params.scope ?? {};

  if (!params.regimePrazoId) {
    return computeHolidayImpactFromCalendar({
      baseDate: params.baseDate,
      contarDiasUteis: false,
      scope,
    });
  }

  const regime = await prisma.regimePrazo.findFirst({
    where: {
      id: params.regimePrazoId,
      OR: [{ tenantId: params.tenantId }, { tenantId: null }],
    },
    select: {
      id: true,
      contarDiasUteis: true,
    },
  });

  if (!regime?.contarDiasUteis) {
    return computeHolidayImpactFromCalendar({
      baseDate: params.baseDate,
      contarDiasUteis: false,
      scope,
    });
  }

  const entries = await listCalendarEntries({
    tenantId: params.tenantId,
    baseDate: params.baseDate,
    scope,
    maxShiftDays: params.maxShiftDays,
  });

  return computeHolidayImpactFromCalendar({
    baseDate: params.baseDate,
    contarDiasUteis: true,
    scope,
    entries,
    maxShiftDays: params.maxShiftDays,
  });
}

export async function recomputeHolidayImpactsForOpenDeadlines(params: {
  tenantId?: string | null;
  year?: number;
  scope?: HolidayScopeInput;
  regimePrazoId?: string | null;
}) {
  const todayStart = startOfDay(new Date());
  const normalizedUf = params.scope?.uf?.trim().toUpperCase() || null;
  const normalizedMunicipio = normalizeText(params.scope?.municipio);
  const yearStart =
    typeof params.year === "number" ? new Date(Date.UTC(params.year, 0, 1)) : null;
  const yearEnd =
    typeof params.year === "number"
      ? new Date(Date.UTC(params.year, 11, 31, 23, 59, 59, 999))
      : null;

  const yearFilter =
    yearStart && yearEnd
      ? ({
          OR: [
            {
              dataVencimento: {
                gte: yearStart,
                lte: yearEnd,
              },
            },
            {
              prorrogadoPara: {
                gte: yearStart,
                lte: yearEnd,
              },
            },
          ],
        } satisfies Prisma.ProcessoPrazoWhereInput)
      : undefined;

  const prazos = await prisma.processoPrazo.findMany({
    where: {
      deletedAt: null,
      status: {
        in: [ProcessoPrazoStatus.ABERTO, ProcessoPrazoStatus.PRORROGADO],
      },
      ...(params.tenantId ? { tenantId: params.tenantId } : {}),
      ...(params.regimePrazoId ? { regimePrazoId: params.regimePrazoId } : {}),
      ...(yearFilter ? yearFilter : {}),
      OR: [
        {
          dataVencimento: {
            gte: todayStart,
          },
        },
        {
          prorrogadoPara: {
            gte: todayStart,
          },
        },
      ],
      processo: {
        deletedAt: null,
        ...(normalizedUf
          ? {
              tribunal: {
                uf: normalizedUf,
              },
            }
          : {}),
        ...(normalizedMunicipio
          ? {
              comarca: {
                equals: params.scope?.municipio ?? undefined,
                mode: "insensitive",
              },
            }
          : {}),
      },
    },
    select: {
      id: true,
      tenantId: true,
      dataVencimento: true,
      prorrogadoPara: true,
      regimePrazoId: true,
      holidayImpact: true,
      processo: {
        select: {
          tribunalId: true,
          comarca: true,
          tribunal: {
            select: {
              uf: true,
            },
          },
        },
      },
    },
  });

  let updated = 0;

  for (const prazo of prazos) {
    const nextImpact = await resolveHolidayImpactForPrazoDraft({
      tenantId: prazo.tenantId,
      baseDate: prazo.prorrogadoPara ?? prazo.dataVencimento,
      regimePrazoId: prazo.regimePrazoId,
      scope: buildHolidayScopeFromProcess({
        tribunalId: prazo.processo.tribunalId,
        uf: prazo.processo.tribunal?.uf ?? null,
        municipio: prazo.processo.comarca,
      }),
    });

    const previousImpact = parseHolidayImpact(prazo.holidayImpact);

    if (JSON.stringify(previousImpact) === JSON.stringify(nextImpact)) {
      continue;
    }

    await prisma.processoPrazo.update({
      where: { id: prazo.id },
      data: {
        holidayImpact: nextImpact,
      },
    });

    updated += 1;
  }

  return {
    processed: prazos.length,
    updated,
  };
}
