import prisma from "@/app/lib/prisma";
import { TipoFeriado } from "@/generated/prisma";
import { ensureSharedOfficialHolidaysForScope } from "@/app/lib/feriados/sync";
import {
  holidayMatchesScope,
  isSameDateOrRecurringMatch,
  isWeekendDate,
  type HolidayScope,
} from "@/app/lib/feriados/scope";

export interface DeadlineRegimeValidationInput {
  tenantId: string;
  regimePrazoId?: string | null;
  data: Date;
  scope?: HolidayScope;
}

export interface DeadlineRegimeValidationResult {
  valid: boolean;
  error?: string;
}

function startOfDay(date: Date) {
  const nextDate = new Date(date);
  nextDate.setHours(0, 0, 0, 0);
  return nextDate;
}

function endOfDay(date: Date) {
  const nextDate = new Date(date);
  nextDate.setHours(23, 59, 59, 999);
  return nextDate;
}

function formatPtBrDate(date: Date) {
  return date.toLocaleDateString("pt-BR");
}

export async function validateDeadlineWithRegime({
  tenantId,
  regimePrazoId,
  data,
  scope = {},
}: DeadlineRegimeValidationInput): Promise<DeadlineRegimeValidationResult> {
  if (!regimePrazoId) {
    return { valid: true };
  }

  const regime = await prisma.regimePrazo.findFirst({
    where: {
      id: regimePrazoId,
      OR: [{ tenantId }, { tenantId: null }],
    },
    select: {
      id: true,
      nome: true,
      contarDiasUteis: true,
    },
  });

  if (!regime) {
    return {
      valid: false,
      error: "Regime de prazo inválido para este escritório.",
    };
  }

  if (!regime.contarDiasUteis) {
    return { valid: true };
  }

  if (isWeekendDate(data)) {
    return {
      valid: false,
      error: `A data ${formatPtBrDate(data)} cai em final de semana e o regime "${regime.nome}" exige dias úteis.`,
    };
  }

  await ensureSharedOfficialHolidaysForScope(data.getUTCFullYear(), {
    uf: scope.uf,
    municipio: scope.municipio,
  });

  const feriados = await prisma.feriado.findMany({
    where: {
      AND: [
        {
          OR: [{ tenantId }, { tenantId: null }],
        },
        {
          OR: [
            {
              data: {
                gte: startOfDay(data),
                lte: endOfDay(data),
              },
            },
            { recorrente: true },
          ],
        },
      ],
    },
    select: {
      id: true,
      nome: true,
      data: true,
      recorrente: true,
      tipo: true,
      tribunalId: true,
      uf: true,
      municipio: true,
    },
  });

  const feriadoAplicavel = feriados.find((feriado) => {
    if (
      !isSameDateOrRecurringMatch(data, feriado.data, Boolean(feriado.recorrente))
    ) {
      return false;
    }

    return holidayMatchesScope(
      {
        tipo: feriado.tipo as TipoFeriado,
        tribunalId: feriado.tribunalId ?? null,
        uf: feriado.uf ?? null,
        municipio: feriado.municipio ?? null,
      },
      scope,
    );
  });

  if (feriadoAplicavel) {
    return {
      valid: false,
      error: `A data ${formatPtBrDate(data)} coincide com feriado (${feriadoAplicavel.nome}) e o regime "${regime.nome}" exige dias úteis.`,
    };
  }

  return { valid: true };
}
