import prisma from "@/app/lib/prisma";
import { ensureSharedOfficialHolidaysForScope } from "@/app/lib/feriados/sync";
import { doesRitoProcessoUseBusinessDays, getRitoProcessoLabel } from "@/app/lib/processos/rito-processo";
import {
  holidayMatchesScope,
  isSameDateOrRecurringMatch,
  isWeekendDate,
  type HolidayScope,
} from "@/app/lib/feriados/scope";
import { RitoProcesso, TipoFeriado } from "@/generated/prisma";

export interface DeadlineRegimeValidationInput {
  tenantId: string;
  ritoProcesso?: RitoProcesso | null;
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

async function resolveBusinessDayRule(params: {
  tenantId: string;
  ritoProcesso?: RitoProcesso | null;
  regimePrazoId?: string | null;
}) {
  if (params.ritoProcesso) {
    return {
      contarDiasUteis: doesRitoProcessoUseBusinessDays(params.ritoProcesso),
      label: `o rito "${getRitoProcessoLabel(params.ritoProcesso)}"`,
    };
  }

  if (!params.regimePrazoId) {
    return {
      contarDiasUteis: false,
      label: "a regra de prazo selecionada",
    };
  }

  const regime = await prisma.regimePrazo.findFirst({
    where: {
      id: params.regimePrazoId,
      OR: [{ tenantId: params.tenantId }, { tenantId: null }],
    },
    select: {
      id: true,
      nome: true,
      contarDiasUteis: true,
    },
  });

  if (!regime) {
    return {
      invalid: true as const,
      error: "Regime de prazo inválido para este escritório.",
    };
  }

  return {
    contarDiasUteis: regime.contarDiasUteis,
    label: `o regime "${regime.nome}"`,
  };
}

export async function validateDeadlineWithRegime({
  tenantId,
  ritoProcesso,
  regimePrazoId,
  data,
  scope = {},
}: DeadlineRegimeValidationInput): Promise<DeadlineRegimeValidationResult> {
  const rule = await resolveBusinessDayRule({
    tenantId,
    ritoProcesso,
    regimePrazoId,
  });

  if ("invalid" in rule) {
    return {
      valid: false,
      error: rule.error,
    };
  }

  if (!rule.contarDiasUteis) {
    return { valid: true };
  }

  if (isWeekendDate(data)) {
    return {
      valid: false,
      error: `A data ${formatPtBrDate(data)} cai em final de semana e ${rule.label} exige dias úteis.`,
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
      error: `A data ${formatPtBrDate(data)} coincide com feriado (${feriadoAplicavel.nome}) e ${rule.label} exige dias úteis.`,
    };
  }

  return { valid: true };
}
