"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/app/lib/auth";
import prisma from "@/app/lib/prisma";
import { buildSoftDeletePayload } from "@/app/lib/soft-delete";
import logger from "@/lib/logger";
import { ProcessoPrazoStatus, TipoFeriado } from "@/generated/prisma";
import { fetchOfficialNationalHolidays } from "@/app/lib/feriados/oficial";
import { ensureSharedOfficialHolidaysForYears } from "@/app/lib/feriados/sync";
import { recomputeHolidayImpactsForOpenDeadlines } from "@/app/lib/feriados/holiday-impact-resolver";
import { logAudit, toAuditJson } from "@/app/lib/audit/log";
import {
  holidayMatchesScope,
  isSameDateOrRecurringMatch,
  isWeekendDate,
  type HolidayScope,
} from "@/app/lib/feriados/scope";

export interface RegimePrazoPayload {
  nome: string;
  tipo:
    | "JUSTICA_COMUM"
    | "JUIZADO_ESPECIAL"
    | "TRABALHISTA"
    | "FEDERAL"
    | "OUTRO";
  contarDiasUteis: boolean;
  descricao?: string | null;
}

export interface SimulateRegimePrazoPayload {
  regimeId: string;
  dataInicio: string;
  quantidadeDias: number;
  incluirDataInicio?: boolean;
  tribunalId?: string | null;
  uf?: string | null;
  municipio?: string | null;
}

const DAY_IN_MS = 1000 * 60 * 60 * 24;

const DEFAULT_REGIMES_CATALOG: RegimePrazoPayload[] = [
  {
    nome: "Justiça Comum",
    tipo: "JUSTICA_COMUM",
    contarDiasUteis: true,
    descricao: "Prazos processuais calculados em dias úteis conforme CPC.",
  },
  {
    nome: "Juizado Especial",
    tipo: "JUIZADO_ESPECIAL",
    contarDiasUteis: false,
    descricao:
      "Prazo em juizados especiais, contagem contínua exceto finais de semana conforme rito local.",
  },
  {
    nome: "Trabalhista",
    tipo: "TRABALHISTA",
    contarDiasUteis: true,
    descricao: "Prazos da CLT com dias úteis e regras de suspensão específicas.",
  },
];

function parseIsoDateOnly(value: string): Date | null {
  const trimmedValue = value.trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmedValue)) {
    return null;
  }

  const [year, month, day] = trimmedValue.split("-").map(Number);
  const parsedDate = new Date(Date.UTC(year, month - 1, day));

  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return parsedDate;
}

function toIsoDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toPtBrDate(date: Date): string {
  const iso = toIsoDateOnly(date);
  const [year, month, day] = iso.split("-");

  return `${day}/${month}/${year}`;
}

function addUtcDays(date: Date, days: number): Date {
  const nextDate = new Date(date);
  nextDate.setUTCDate(nextDate.getUTCDate() + days);

  return nextDate;
}

function normalizeScopeField(value?: string | null): string | null {
  const normalized = value?.trim() ?? "";
  return normalized ? normalized : null;
}

export async function listRegimesPrazo() {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;

    if (!user.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    const regimes = await prisma.regimePrazo.findMany({
      where: {
        deletedAt: null,
        OR: [{ tenantId: user.tenantId }, { tenantId: null }],
      },
      orderBy: [{ tenantId: "asc" }, { nome: "asc" }],
    });

    const regimeIds = regimes.map((regime) => regime.id);
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(startOfToday);
    endOfToday.setHours(23, 59, 59, 999);
    const endOfThreeDays = new Date(endOfToday);
    endOfThreeDays.setDate(endOfThreeDays.getDate() + 3);
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const endOfYear = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);

    const [
      prazosGrouped,
      diligenciasGrouped,
      prazosAbertos,
      prazosVencidos,
      prazosVencendoHoje,
      prazosVencendo3Dias,
      feriadosAtivosAno,
    ] = await Promise.all([
      regimeIds.length
        ? prisma.processoPrazo.groupBy({
            by: ["regimePrazoId"],
            where: {
              tenantId: user.tenantId,
              regimePrazoId: { in: regimeIds },
              deletedAt: null,
            },
            _count: { _all: true },
          })
        : Promise.resolve([]),
      regimeIds.length
        ? prisma.diligencia.groupBy({
            by: ["regimePrazoId"],
            where: {
              tenantId: user.tenantId,
              regimePrazoId: { in: regimeIds },
            },
            _count: { _all: true },
          })
        : Promise.resolve([]),
      prisma.processoPrazo.count({
        where: {
          tenantId: user.tenantId,
          deletedAt: null,
          status: {
            in: [ProcessoPrazoStatus.ABERTO, ProcessoPrazoStatus.PRORROGADO],
          },
        },
      }),
      prisma.processoPrazo.count({
        where: {
          tenantId: user.tenantId,
          deletedAt: null,
          status: {
            in: [ProcessoPrazoStatus.ABERTO, ProcessoPrazoStatus.PRORROGADO],
          },
          dataVencimento: {
            lt: startOfToday,
          },
        },
      }),
      prisma.processoPrazo.count({
        where: {
          tenantId: user.tenantId,
          deletedAt: null,
          status: {
            in: [ProcessoPrazoStatus.ABERTO, ProcessoPrazoStatus.PRORROGADO],
          },
          dataVencimento: {
            gte: startOfToday,
            lte: endOfToday,
          },
        },
      }),
      prisma.processoPrazo.count({
        where: {
          tenantId: user.tenantId,
          deletedAt: null,
          status: {
            in: [ProcessoPrazoStatus.ABERTO, ProcessoPrazoStatus.PRORROGADO],
          },
          dataVencimento: {
            gt: endOfToday,
            lte: endOfThreeDays,
          },
        },
      }),
      prisma.feriado.count({
        where: {
          AND: [
            {
              OR: [{ tenantId: user.tenantId }, { tenantId: null }],
            },
            {
              deletedAt: null,
            },
            {
              OR: [
                { recorrente: true },
                {
                  data: {
                    gte: startOfYear,
                    lte: endOfYear,
                  },
                },
              ],
            },
          ],
        },
      }),
    ]);

    const prazoCountMap = new Map<string, number>();
    const diligenciaCountMap = new Map<string, number>();

    for (const entry of prazosGrouped) {
      if (!entry.regimePrazoId) continue;
      prazoCountMap.set(entry.regimePrazoId, entry._count._all);
    }

    for (const entry of diligenciasGrouped) {
      if (!entry.regimePrazoId) continue;
      diligenciaCountMap.set(entry.regimePrazoId, entry._count._all);
    }

    const regimesComContadores = regimes.map((regime) => {
      const totalPrazosVinculados = prazoCountMap.get(regime.id) ?? 0;
      const totalDiligenciasVinculadas = diligenciaCountMap.get(regime.id) ?? 0;

      return {
        ...regime,
        totalPrazosVinculados,
        totalDiligenciasVinculadas,
        totalVinculos: totalPrazosVinculados + totalDiligenciasVinculadas,
      };
    });

    return {
      success: true,
      regimes: regimesComContadores,
      insights: {
        prazosAbertos,
        prazosVencidos,
        prazosVencendoHoje,
        prazosVencendo3Dias,
        feriadosAtivosAno,
      },
    };
  } catch (error) {
    logger.error("Erro ao listar regimes de prazo:", error);

    return {
      success: false,
      error: "Erro ao carregar regimes de prazo",
    };
  }
}

export async function ensureDefaultRegimesCatalog() {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;

    if (!user.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    const existentes = await prisma.regimePrazo.findMany({
      where: {
        tenantId: user.tenantId,
        deletedAt: null,
      },
      select: {
        id: true,
        nome: true,
      },
    });

    const nomesExistentes = new Set(
      existentes.map((item) => item.nome.trim().toLowerCase()),
    );

    let created = 0;
    let ignored = 0;

    for (const regime of DEFAULT_REGIMES_CATALOG) {
      const nomeNormalizado = regime.nome.trim().toLowerCase();

      if (nomesExistentes.has(nomeNormalizado)) {
        ignored += 1;
        continue;
      }

      await prisma.regimePrazo.create({
        data: {
          tenantId: user.tenantId,
          nome: regime.nome.trim(),
          tipo: regime.tipo,
          contarDiasUteis: regime.contarDiasUteis,
          descricao: regime.descricao?.trim() || null,
        },
      });
      created += 1;
      nomesExistentes.add(nomeNormalizado);
    }

    try {
      await logAudit({
        tenantId: user.tenantId,
        usuarioId: user.id ?? null,
        acao: "REGIME_PRAZO_CATALOGO_BASE_GARANTIDO",
        entidade: "RegimePrazo",
        dados: toAuditJson({
          totalPadrao: DEFAULT_REGIMES_CATALOG.length,
          created,
          ignored,
        }),
        changedFields: ["created", "ignored"],
      });
    } catch (auditError) {
      logger.warn("Falha ao registrar auditoria de garantia de catálogo base de regimes", auditError);
    }

    return {
      success: true,
      data: {
        totalPadrao: DEFAULT_REGIMES_CATALOG.length,
        created,
        ignored,
      },
    };
  } catch (error) {
    logger.error("Erro ao garantir catálogo base de regimes:", error);

    return {
      success: false,
      error: "Erro ao garantir catálogo base de regimes",
    };
  }
}

export async function simulateRegimePrazo(payload: SimulateRegimePrazoPayload) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;

    if (!user.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    if (!payload.regimeId) {
      return { success: false, error: "Selecione um regime de prazo" };
    }

    const quantidadeDias = Number(payload.quantidadeDias);

    if (!Number.isInteger(quantidadeDias) || quantidadeDias <= 0) {
      return {
        success: false,
        error: "Informe uma quantidade de dias válida (mínimo: 1)",
      };
    }

    if (quantidadeDias > 3650) {
      return {
        success: false,
        error: "Quantidade de dias acima do limite operacional (máximo: 3650)",
      };
    }

    const dataInicio = parseIsoDateOnly(payload.dataInicio);

    if (!dataInicio) {
      return { success: false, error: "Data inicial inválida" };
    }

    const regime = await prisma.regimePrazo.findFirst({
      where: {
        id: payload.regimeId,
        deletedAt: null,
        OR: [{ tenantId: user.tenantId }, { tenantId: null }],
      },
    });

    if (!regime) {
      return { success: false, error: "Regime de prazo não encontrado" };
    }

    const scopeTribunalId = normalizeScopeField(payload.tribunalId);
    let scopeUf = normalizeScopeField(payload.uf)?.toUpperCase() ?? null;
    const scopeMunicipio = normalizeScopeField(payload.municipio);

    if (scopeTribunalId) {
      const tribunal = await prisma.tribunal.findFirst({
        where: {
          id: scopeTribunalId,
          tenantId: user.tenantId,
        },
        select: {
          id: true,
          uf: true,
        },
      });

      if (!tribunal) {
        return {
          success: false,
          error: "Tribunal informado não pertence ao seu escritório",
        };
      }

      if (!scopeUf && tribunal.uf) {
        scopeUf = tribunal.uf.trim().toUpperCase();
      }
    }

    const scope: HolidayScope = {
      tribunalId: scopeTribunalId,
      uf: scopeUf,
      municipio: scopeMunicipio,
    };

    const incluirDataInicio = Boolean(payload.incluirDataInicio);
    const estimatedRangeEnd = addUtcDays(
      dataInicio,
      Math.max(quantidadeDias * 4, quantidadeDias + 180),
    );

    if (regime.contarDiasUteis) {
      await ensureSharedOfficialHolidaysForYears(
        [dataInicio.getUTCFullYear(), estimatedRangeEnd.getUTCFullYear()],
        {
          uf: scopeUf,
          municipio: scopeMunicipio,
        },
      );
    }

    const feriados = regime.contarDiasUteis
      ? await prisma.feriado.findMany({
          where: {
            AND: [
              {
                OR: [{ tenantId: user.tenantId }, { tenantId: null }],
              },
              {
                deletedAt: null,
              },
              {
                OR: [
                  { recorrente: true },
                  {
                    data: {
                      gte: dataInicio,
                      lte: estimatedRangeEnd,
                    },
                  },
                ],
              },
            ],
          },
          select: {
            data: true,
            recorrente: true,
            tipo: true,
            tribunalId: true,
            uf: true,
            municipio: true,
          },
        })
      : [];

    let cursor = incluirDataInicio ? dataInicio : addUtcDays(dataInicio, 1);
    let diasComputados = 0;
    let finaisSemanaIgnorados = 0;
    let feriadosIgnorados = 0;
    let dataVencimento = cursor;
    let guardCounter = 0;

    while (diasComputados < quantidadeDias) {
      guardCounter += 1;

      if (guardCounter > 40000) {
        return {
          success: false,
          error:
            "Não foi possível concluir a simulação. Reduza o intervalo de dias.",
        };
      }

      const isWeekendDay = isWeekendDate(cursor);
      const cursorIso = toIsoDateOnly(cursor);
      const isHoliday =
        !isWeekendDay &&
        feriados.some((feriado) => {
          if (
            !isSameDateOrRecurringMatch(
              cursor,
              feriado.data,
              Boolean(feriado.recorrente),
            )
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
      const shouldCompute =
        !regime.contarDiasUteis || (!isWeekendDay && !isHoliday);

      if (shouldCompute) {
        diasComputados += 1;
        dataVencimento = cursor;
      } else if (isWeekendDay) {
        finaisSemanaIgnorados += 1;
      } else if (isHoliday) {
        feriadosIgnorados += 1;
      }

      if (diasComputados < quantidadeDias) {
        cursor = addUtcDays(cursor, 1);
      }
    }

    const diffDays = Math.max(
      0,
      Math.round((dataVencimento.getTime() - dataInicio.getTime()) / DAY_IN_MS),
    );

    return {
      success: true,
      simulation: {
        regimeId: regime.id,
        regimeNome: regime.nome,
        tipo: regime.tipo,
        contarDiasUteis: regime.contarDiasUteis,
        incluirDataInicio,
        quantidadeDias,
        dataInicio: toIsoDateOnly(dataInicio),
        dataInicioFormatada: toPtBrDate(dataInicio),
        dataVencimento: toIsoDateOnly(dataVencimento),
        dataVencimentoFormatada: toPtBrDate(dataVencimento),
        diasCorridosPercorridos: incluirDataInicio ? diffDays + 1 : diffDays,
        finaisSemanaIgnorados,
        feriadosIgnorados,
        escopo: {
          tribunalId: scopeTribunalId,
          uf: scopeUf,
          municipio: scopeMunicipio,
        },
      },
    };
  } catch (error) {
    logger.error("Erro ao simular regime de prazo:", error);

    return {
      success: false,
      error: "Erro ao simular vencimento do prazo",
    };
  }
}

export async function syncRegimesNationalHolidays(ano: number) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;

    if (!user.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) {
      return { success: false, error: "Ano inválido para sincronização" };
    }

    const sourceResult = await fetchOfficialNationalHolidays(ano);

    if (!sourceResult.success) {
      const startOfYearFallback = new Date(Date.UTC(ano, 0, 1));
      const endOfYearFallback = new Date(Date.UTC(ano, 11, 31, 23, 59, 59, 999));
      const cachedCount = await prisma.feriado.count({
        where: {
          tenantId: user.tenantId,
          deletedAt: null,
          tipo: "NACIONAL",
          data: {
            gte: startOfYearFallback,
            lte: endOfYearFallback,
          },
        },
      });

      if (cachedCount > 0) {
        return {
          success: true,
          data: {
            ano,
            totalRecebido: 0,
            created: 0,
            updated: 0,
            ignored: cachedCount,
            source: sourceResult.source,
            fallbackCache: true,
            warning:
              "Fonte oficial indisponível. Resultado mantido com base já sincronizada no tenant.",
          },
        };
      }

      return {
        success: false,
        error: sourceResult.error,
      };
    }

    const feriadosOficiais = sourceResult.holidays;

    const startOfYear = new Date(Date.UTC(ano, 0, 1));
    const endOfYear = new Date(Date.UTC(ano, 11, 31, 23, 59, 59, 999));

    const existentes = await prisma.feriado.findMany({
      where: {
        tenantId: user.tenantId,
        deletedAt: null,
        tipo: "NACIONAL",
        data: {
          gte: startOfYear,
          lte: endOfYear,
        },
      },
      select: {
        id: true,
        data: true,
        nome: true,
      },
    });

    const existentePorData = new Map<string, { id: string; nome: string }>();

    for (const item of existentes) {
      existentePorData.set(toIsoDateOnly(item.data), {
        id: item.id,
        nome: item.nome.trim().replace(/\s+/g, " "),
      });
    }

    let created = 0;
    let updated = 0;
    let ignored = 0;

    for (const feriado of feriadosOficiais) {
      const existente = existentePorData.get(feriado.dateIso);

      if (!existente) {
        await prisma.feriado.create({
          data: {
            tenantId: user.tenantId,
            nome: feriado.name,
            data: feriado.date,
            tipo: "NACIONAL",
            recorrente: false,
            descricao: "Sincronizado automaticamente da fonte oficial (BrasilAPI).",
          },
        });
        created += 1;
        continue;
      }

      if (existente.nome !== feriado.name) {
        await prisma.feriado.update({
          where: {
            id: existente.id,
          },
          data: {
            nome: feriado.name,
            descricao:
              "Atualizado automaticamente da fonte oficial (BrasilAPI).",
          },
        });
        updated += 1;
      } else {
        ignored += 1;
      }
    }

    // Propaga atualização de feriados para módulos que dependem de cálculo de prazo.
    revalidatePath("/regimes-prazo");
    revalidatePath("/processos");
    revalidatePath("/diligencias");

    try {
      await logAudit({
        tenantId: user.tenantId,
        usuarioId: user.id ?? null,
        acao: "REGIME_PRAZO_SYNC_FERIADOS_NACIONAIS",
        entidade: "Feriado",
        dados: toAuditJson({
          ano,
          totalRecebido: feriadosOficiais.length,
          created,
          updated,
          ignored,
          source: sourceResult.source,
        }),
        changedFields: ["created", "updated", "ignored"],
      });
    } catch (auditError) {
      logger.warn("Falha ao registrar auditoria de sincronização de feriados dos regimes", auditError);
    }

    return {
      success: true,
      data: {
        ano,
        totalRecebido: feriadosOficiais.length,
        created,
        updated,
        ignored,
        source: sourceResult.source,
      },
    };
  } catch (error) {
    logger.error("Erro ao sincronizar feriados nacionais oficiais:", error);

    return {
      success: false,
      error: "Erro ao sincronizar feriados oficiais",
    };
  }
}

export async function createRegimePrazo(payload: RegimePrazoPayload) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;

    if (!user.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    if (!payload.nome?.trim()) {
      return { success: false, error: "Nome do regime é obrigatório" };
    }

    const regime = await prisma.regimePrazo.create({
      data: {
        tenantId: user.tenantId,
        nome: payload.nome.trim(),
        tipo: payload.tipo,
        contarDiasUteis: payload.contarDiasUteis,
        descricao: payload.descricao?.trim() || null,
      },
    });

    try {
      await logAudit({
        tenantId: user.tenantId,
        usuarioId: user.id ?? null,
        acao: "REGIME_PRAZO_CRIADO",
        entidade: "RegimePrazo",
        entidadeId: regime.id,
        dados: toAuditJson({
          nome: regime.nome,
          tipo: regime.tipo,
          contarDiasUteis: regime.contarDiasUteis,
          descricao: regime.descricao,
        }),
        changedFields: ["nome", "tipo", "contarDiasUteis", "descricao"],
      });
    } catch (auditError) {
      logger.warn("Falha ao registrar auditoria de criação de regime de prazo", auditError);
    }

    return {
      success: true,
      regime,
    };
  } catch (error: any) {
    if (error?.code === "P2002") {
      return {
        success: false,
        error: "Já existe um regime com este nome",
      };
    }

    logger.error("Erro ao criar regime de prazo:", error);

    return {
      success: false,
      error: "Erro ao criar regime de prazo",
    };
  }
}

export async function updateRegimePrazo(
  regimeId: string,
  payload: Partial<RegimePrazoPayload>,
) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;

    if (!user.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    const regime = await prisma.regimePrazo.findFirst({
      where: {
        id: regimeId,
        tenantId: user.tenantId,
        deletedAt: null,
      },
    });

    if (!regime) {
      return { success: false, error: "Regime de prazo não encontrado" };
    }

    const data: any = {};

    if (payload.nome !== undefined) {
      if (!payload.nome.trim()) {
        return { success: false, error: "Nome do regime é obrigatório" };
      }
      data.nome = payload.nome.trim();
    }

    if (payload.tipo !== undefined) {
      data.tipo = payload.tipo;
    }

    if (payload.contarDiasUteis !== undefined) {
      data.contarDiasUteis = payload.contarDiasUteis;
    }

    if (payload.descricao !== undefined) {
      data.descricao = payload.descricao?.trim() || null;
    }

    const updated = await prisma.regimePrazo.update({
      where: { id: regime.id },
      data,
    });

    if (payload.contarDiasUteis !== undefined) {
      await recomputeHolidayImpactsForOpenDeadlines({
        tenantId: user.tenantId,
        regimePrazoId: regime.id,
      });
    }

    try {
      await logAudit({
        tenantId: user.tenantId,
        usuarioId: user.id ?? null,
        acao: "REGIME_PRAZO_ATUALIZADO",
        entidade: "RegimePrazo",
        entidadeId: updated.id,
        previousValues: toAuditJson({
          nome: regime.nome,
          tipo: regime.tipo,
          contarDiasUteis: regime.contarDiasUteis,
          descricao: regime.descricao,
        }),
        dados: toAuditJson({
          nome: updated.nome,
          tipo: updated.tipo,
          contarDiasUteis: updated.contarDiasUteis,
          descricao: updated.descricao,
        }),
        changedFields: Object.keys(data),
      });
    } catch (auditError) {
      logger.warn("Falha ao registrar auditoria de atualização de regime de prazo", auditError);
    }

    return {
      success: true,
      regime: updated,
    };
  } catch (error: any) {
    if (error?.code === "P2002") {
      return {
        success: false,
        error: "Já existe um regime com este nome",
      };
    }

    logger.error("Erro ao atualizar regime de prazo:", error);

    return {
      success: false,
      error: "Erro ao atualizar regime de prazo",
    };
  }
}

export async function deleteRegimePrazo(regimeId: string) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;

    if (!user.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    const regime = await prisma.regimePrazo.findFirst({
      where: {
        id: regimeId,
        tenantId: user.tenantId,
        deletedAt: null,
      },
    });

    if (!regime) {
      return { success: false, error: "Regime não encontrado" };
    }

    const vinculados = await prisma.processoPrazo.count({
      where: {
        regimePrazoId: regime.id,
        deletedAt: null,
      },
    });

    if (vinculados > 0) {
      return {
        success: false,
        error:
          "Não é possível remover o regime enquanto houver prazos vinculados. Atualize os registros primeiro.",
      };
    }

    await prisma.regimePrazo.update({
      where: { id: regime.id },
      data: buildSoftDeletePayload(
        {
          actorId: user.id ?? null,
          actorType: user.role ?? "USER",
        },
        "Exclusão manual de regime de prazo",
      ),
    });

    try {
      await logAudit({
        tenantId: user.tenantId,
        usuarioId: user.id ?? null,
        acao: "REGIME_PRAZO_EXCLUIDO",
        entidade: "RegimePrazo",
        entidadeId: regime.id,
        dados: toAuditJson({
          nome: regime.nome,
          tipo: regime.tipo,
          contarDiasUteis: regime.contarDiasUteis,
          descricao: regime.descricao,
        }),
        changedFields: ["nome", "tipo", "contarDiasUteis", "descricao"],
      });
    } catch (auditError) {
      logger.warn("Falha ao registrar auditoria de exclusão de regime de prazo", auditError);
    }

    return { success: true };
  } catch (error) {
    logger.error("Erro ao deletar regime de prazo:", error);

    return {
      success: false,
      error: "Erro ao deletar regime de prazo",
    };
  }
}
