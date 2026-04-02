"use server";

import { getServerSession } from "next-auth/next";

import { authOptions } from "@/auth";
import { checkPermission } from "@/app/actions/equipe";
import prisma from "@/app/lib/prisma";
import {
  ContratoStatus,
  EventoStatus,
  InvoiceStatus,
  PaymentStatus,
  ProcessoPrazoStatus,
  ProcessoStatus,
  TarefaStatus,
  UserRole,
} from "@/generated/prisma";
import logger from "@/lib/logger";

export type RelatorioPeriodo = "30d" | "90d" | "180d" | "365d";

interface RelatorioRangeConfig {
  dias: number;
  mesesSerie: number;
}

const RELATORIO_RANGES: Record<RelatorioPeriodo, RelatorioRangeConfig> = {
  "30d": { dias: 30, mesesSerie: 3 },
  "90d": { dias: 90, mesesSerie: 6 },
  "180d": { dias: 180, mesesSerie: 8 },
  "365d": { dias: 365, mesesSerie: 12 },
};

export interface RelatorioStatusCount {
  key: string;
  label: string;
  total: number;
}

export interface RelatorioSerieMensal {
  mes: string;
  processos: number;
  clientes: number;
  receita: number;
  tarefasConcluidas: number;
}

export interface RelatorioTopCliente {
  id: string;
  nome: string;
  processos: number;
  contratos: number;
  faturamento: number;
}

export interface RelatorioAgendaItem {
  id: string;
  tipo: "PRAZO" | "EVENTO";
  titulo: string;
  referencia?: string;
  data: string;
  href?: string;
}

export interface RelatoriosTenantData {
  periodo: RelatorioPeriodo;
  intervalo: {
    inicio: string;
    fim: string;
    dias: number;
  };
  resumo: {
    processosAtivos: number;
    processosNovos: number;
    clientesAtivos: number;
    novosClientes: number;
    contratosAtivos: number;
    receitaPeriodo: number;
    variacaoReceita: number;
    tarefasAbertas: number;
    prazosUrgentes: number;
    faturasVencidas: number;
  };
  seriesMensais: RelatorioSerieMensal[];
  distribuicoes: {
    processosPorStatus: RelatorioStatusCount[];
    tarefasPorStatus: RelatorioStatusCount[];
  };
  rankings: {
    clientes: RelatorioTopCliente[];
  };
  agenda: {
    prazosProximos: RelatorioAgendaItem[];
    eventosProximos: RelatorioAgendaItem[];
  };
}

interface RelatoriosResponse {
  success: boolean;
  data?: RelatoriosTenantData;
  error?: string;
}

function addDays(date: Date, days: number) {
  const result = new Date(date);

  result.setDate(result.getDate() + days);

  return result;
}

function addMonths(date: Date, months: number) {
  const result = new Date(date);

  result.setMonth(result.getMonth() + months);

  return result;
}

function startOfDay(date: Date) {
  const result = new Date(date);

  result.setHours(0, 0, 0, 0);

  return result;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function formatMonthLabel(date: Date) {
  return date.toLocaleDateString("pt-BR", {
    month: "short",
    year: "2-digit",
  });
}

function normalizePeriodo(periodo?: RelatorioPeriodo): RelatorioPeriodo {
  if (!periodo || !(periodo in RELATORIO_RANGES)) {
    return "90d";
  }

  return periodo;
}

function toNumber(value: unknown): number {
  const numeric = Number(value);

  return Number.isFinite(numeric) ? numeric : 0;
}

export async function getRelatoriosData(
  periodoParam: RelatorioPeriodo = "90d",
): Promise<RelatoriosResponse> {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return { success: false, error: "Usuário não autenticado" };
    }

    const user = session.user as any;
    const tenantId = user?.tenantId as string | undefined;
    const userRole = user?.role as UserRole | undefined;

    if (!tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    if (userRole !== UserRole.ADMIN && userRole !== UserRole.SUPER_ADMIN) {
      const canViewReports = await checkPermission("relatorios", "visualizar");

      if (!canViewReports) {
        return {
          success: false,
          error: "Você não tem permissão para visualizar relatórios",
        };
      }
    }

    const periodo = normalizePeriodo(periodoParam);
    const rangeConfig = RELATORIO_RANGES[periodo];
    const now = new Date();
    const inicioPeriodo = addDays(now, -rangeConfig.dias);
    const inicioPeriodoAnterior = addDays(inicioPeriodo, -rangeConfig.dias);
    const seteDias = addDays(now, 7);

    const [
      processosAtivos,
      processosNovos,
      clientesAtivos,
      novosClientes,
      contratosAtivos,
      receitaPeriodoAgg,
      receitaAnteriorAgg,
      tarefasAbertas,
      prazosUrgentes,
      faturasVencidas,
    ] = await Promise.all([
      prisma.processo.count({
        where: {
          tenantId,
          deletedAt: null,
          status: {
            in: [ProcessoStatus.EM_ANDAMENTO, ProcessoStatus.SUSPENSO],
          },
        },
      }),
      prisma.processo.count({
        where: {
          tenantId,
          deletedAt: null,
          createdAt: { gte: inicioPeriodo },
        },
      }),
      prisma.cliente.count({
        where: {
          tenantId,
          deletedAt: null,
        },
      }),
      prisma.cliente.count({
        where: {
          tenantId,
          deletedAt: null,
          createdAt: { gte: inicioPeriodo },
        },
      }),
      prisma.contrato.count({
        where: {
          tenantId,
          deletedAt: null,
          status: {
            in: [ContratoStatus.ATIVO, ContratoStatus.SUSPENSO],
          },
        },
      }),
      prisma.pagamento.aggregate({
        where: {
          tenantId,
          status: PaymentStatus.PAGO,
          confirmadoEm: { gte: inicioPeriodo },
        },
        _sum: { valor: true },
      }),
      prisma.pagamento.aggregate({
        where: {
          tenantId,
          status: PaymentStatus.PAGO,
          confirmadoEm: {
            gte: inicioPeriodoAnterior,
            lt: inicioPeriodo,
          },
        },
        _sum: { valor: true },
      }),
      prisma.tarefa.count({
        where: {
          tenantId,
          deletedAt: null,
          status: {
            in: [TarefaStatus.PENDENTE, TarefaStatus.EM_ANDAMENTO],
          },
        },
      }),
      prisma.processoPrazo.count({
        where: {
          tenantId,
          deletedAt: null,
          status: ProcessoPrazoStatus.ABERTO,
          processo: {
            deletedAt: null,
          },
          dataVencimento: {
            gte: now,
            lte: seteDias,
          },
        },
      }),
      prisma.fatura.count({
        where: {
          tenantId,
          status: InvoiceStatus.VENCIDA,
        },
      }),
    ]);

    const receitaPeriodo = toNumber(receitaPeriodoAgg._sum.valor);
    const receitaAnterior = toNumber(receitaAnteriorAgg._sum.valor);
    const variacaoReceita =
      receitaAnterior > 0
        ? ((receitaPeriodo - receitaAnterior) / receitaAnterior) * 100
        : receitaPeriodo > 0
          ? 100
          : 0;

    const processoStatusConfig: Array<{ key: ProcessoStatus; label: string }> = [
      { key: ProcessoStatus.EM_ANDAMENTO, label: "Em andamento" },
      { key: ProcessoStatus.SUSPENSO, label: "Suspensos" },
      { key: ProcessoStatus.ENCERRADO, label: "Encerrados" },
      { key: ProcessoStatus.ARQUIVADO, label: "Arquivados" },
      { key: ProcessoStatus.RASCUNHO, label: "Rascunhos" },
    ];

    const tarefaStatusConfig: Array<{ key: TarefaStatus; label: string }> = [
      { key: TarefaStatus.PENDENTE, label: "Pendentes" },
      { key: TarefaStatus.EM_ANDAMENTO, label: "Em andamento" },
      { key: TarefaStatus.CONCLUIDA, label: "Concluídas" },
      { key: TarefaStatus.CANCELADA, label: "Canceladas" },
    ];

    const [processosPorStatus, tarefasPorStatus] = await Promise.all([
      Promise.all(
        processoStatusConfig.map(async (item) => ({
          key: item.key,
          label: item.label,
          total: await prisma.processo.count({
            where: {
              tenantId,
              deletedAt: null,
              status: item.key,
            },
          }),
        })),
      ),
      Promise.all(
        tarefaStatusConfig.map(async (item) => ({
          key: item.key,
          label: item.label,
          total: await prisma.tarefa.count({
            where: {
              tenantId,
              deletedAt: null,
              status: item.key,
            },
          }),
        })),
      ),
    ]);

    const monthBoundaries = Array.from(
      { length: rangeConfig.mesesSerie },
      (_, index) => {
        const offset = rangeConfig.mesesSerie - index - 1;
        const start = startOfMonth(addMonths(now, -offset));

        return {
          start,
          end: addMonths(start, 1),
          label: formatMonthLabel(start),
        };
      },
    );

    const seriesMensais: RelatorioSerieMensal[] = await Promise.all(
      monthBoundaries.map(async ({ start, end, label }) => {
        const [processos, clientes, receitaAgg, tarefasConcluidas] =
          await Promise.all([
            prisma.processo.count({
              where: {
                tenantId,
                deletedAt: null,
                createdAt: {
                  gte: start,
                  lt: end,
                },
              },
            }),
            prisma.cliente.count({
              where: {
                tenantId,
                deletedAt: null,
                createdAt: {
                  gte: start,
                  lt: end,
                },
              },
            }),
            prisma.pagamento.aggregate({
              where: {
                tenantId,
                status: PaymentStatus.PAGO,
                confirmadoEm: {
                  gte: start,
                  lt: end,
                },
              },
              _sum: { valor: true },
            }),
            prisma.tarefa.count({
              where: {
                tenantId,
                deletedAt: null,
                status: TarefaStatus.CONCLUIDA,
                updatedAt: {
                  gte: start,
                  lt: end,
                },
              },
            }),
          ]);

        return {
          mes: label,
          processos,
          clientes,
          receita: toNumber(receitaAgg._sum.valor),
          tarefasConcluidas,
        };
      }),
    );

    const [contratosPorCliente, processosPorCliente] = await Promise.all([
      prisma.contrato.groupBy({
        by: ["clienteId"],
        where: {
          tenantId,
          deletedAt: null,
          status: {
            in: [
              ContratoStatus.ATIVO,
              ContratoStatus.SUSPENSO,
              ContratoStatus.ENCERRADO,
            ],
          },
        },
        _count: {
          _all: true,
        },
        _sum: {
          valor: true,
        },
        orderBy: {
          _sum: {
            valor: "desc",
          },
        },
        take: 10,
      }),
      prisma.processo.groupBy({
        by: ["clienteId"],
        where: {
          tenantId,
          deletedAt: null,
        },
        _count: {
          _all: true,
        },
      }),
    ]);

    const clienteIds = Array.from(
      new Set([
        ...contratosPorCliente.map((item) => item.clienteId),
        ...processosPorCliente.map((item) => item.clienteId),
      ]),
    );

    const clientes =
      clienteIds.length > 0
        ? await prisma.cliente.findMany({
            where: {
              id: { in: clienteIds },
              tenantId,
            },
            select: {
              id: true,
              nome: true,
            },
          })
        : [];

    const nomeClienteMap = new Map(clientes.map((cliente) => [cliente.id, cliente.nome]));
    const processosPorClienteMap = new Map(
      processosPorCliente.map((item) => [item.clienteId, item._count._all]),
    );

    let rankingClientes: RelatorioTopCliente[] = contratosPorCliente
      .map((item) => ({
        id: item.clienteId,
        nome: nomeClienteMap.get(item.clienteId) || "Cliente",
        processos: processosPorClienteMap.get(item.clienteId) || 0,
        contratos: item._count._all,
        faturamento: toNumber(item._sum.valor),
      }))
      .sort((a, b) => {
        if (b.faturamento !== a.faturamento) {
          return b.faturamento - a.faturamento;
        }

        return b.processos - a.processos;
      });

    if (rankingClientes.length < 5) {
      const existingIds = new Set(rankingClientes.map((item) => item.id));

      const complement = processosPorCliente
        .filter((item) => !existingIds.has(item.clienteId))
        .map((item) => ({
          id: item.clienteId,
          nome: nomeClienteMap.get(item.clienteId) || "Cliente",
          processos: item._count._all,
          contratos: 0,
          faturamento: 0,
        }))
        .sort((a, b) => b.processos - a.processos);

      rankingClientes = [...rankingClientes, ...complement];
    }

    rankingClientes = rankingClientes.slice(0, 5);

    const [prazosProximosRaw, eventosProximosRaw] = await Promise.all([
      prisma.processoPrazo.findMany({
        where: {
          tenantId,
          deletedAt: null,
          status: ProcessoPrazoStatus.ABERTO,
          processo: {
            deletedAt: null,
          },
          dataVencimento: {
            gte: startOfDay(now),
            lte: addDays(now, 15),
          },
        },
        orderBy: { dataVencimento: "asc" },
        take: 6,
        select: {
          id: true,
          titulo: true,
          dataVencimento: true,
          processo: {
            select: {
              id: true,
              numero: true,
            },
          },
        },
      }),
      prisma.evento.findMany({
        where: {
          tenantId,
          status: {
            in: [EventoStatus.AGENDADO, EventoStatus.CONFIRMADO],
          },
          dataInicio: {
            gte: now,
            lte: addDays(now, 15),
          },
        },
        orderBy: { dataInicio: "asc" },
        take: 6,
        select: {
          id: true,
          titulo: true,
          dataInicio: true,
          processo: {
            select: {
              id: true,
              numero: true,
            },
          },
        },
      }),
    ]);

    const prazosProximos: RelatorioAgendaItem[] = prazosProximosRaw.map(
      (prazo) => ({
        id: prazo.id,
        tipo: "PRAZO",
        titulo: prazo.titulo,
        referencia: prazo.processo?.numero,
        data: prazo.dataVencimento.toISOString(),
        href: prazo.processo ? `/processos/${prazo.processo.id}` : undefined,
      }),
    );

    const eventosProximos: RelatorioAgendaItem[] = eventosProximosRaw.map(
      (evento) => ({
        id: evento.id,
        tipo: "EVENTO",
        titulo: evento.titulo,
        referencia: evento.processo?.numero,
        data: evento.dataInicio.toISOString(),
        href: evento.processo ? `/processos/${evento.processo.id}` : undefined,
      }),
    );

    return {
      success: true,
      data: {
        periodo,
        intervalo: {
          inicio: inicioPeriodo.toISOString(),
          fim: now.toISOString(),
          dias: rangeConfig.dias,
        },
        resumo: {
          processosAtivos,
          processosNovos,
          clientesAtivos,
          novosClientes,
          contratosAtivos,
          receitaPeriodo,
          variacaoReceita,
          tarefasAbertas,
          prazosUrgentes,
          faturasVencidas,
        },
        seriesMensais,
        distribuicoes: {
          processosPorStatus,
          tarefasPorStatus,
        },
        rankings: {
          clientes: rankingClientes,
        },
        agenda: {
          prazosProximos,
          eventosProximos,
        },
      },
    };
  } catch (error) {
    logger.error("[relatorios] erro ao carregar dados", error);

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível carregar os relatórios",
    };
  }
}
