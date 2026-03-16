"use server";

import { getServerSession } from "next-auth/next";

import prisma from "@/app/lib/prisma";
import {
  buildFinanceiroAdminDashboard,
  resolveFinanceiroBillingContext,
  type FinanceiroAdminBillingContextFilter,
  type FinanceiroAdminCommissionRecord,
  type FinanceiroAdminDashboard,
  type FinanceiroAdminFilterPreset,
  type FinanceiroAdminFilters,
  type FinanceiroAdminInvoiceRecord,
  type FinanceiroAdminPaymentRecord,
  type FinanceiroAdminStatusFilter,
  type FinanceiroAdminSubscriptionRecord,
  type FinanceiroAdminTenantOption,
} from "@/app/lib/financeiro-admin-dashboard";
import { authOptions } from "@/auth";
import logger from "@/lib/logger";

// ==================== TIPOS ====================

export type EstatisticasFinanceiras = {
  receitaTotal: number;
  receitaMensal: number;
  receitaAnual: number;
  totalAssinaturas: number;
  assinaturasAtivas: number;
  assinaturasInadimplentes: number;
  totalFaturas: number;
  faturasPagas: number;
  faturasPendentes: number;
  faturasVencidas: number;
  totalPagamentos: number;
  pagamentosConfirmados: number;
  comissoesPendentes: number;
  comissoesPagas: number;
};

export type ResumoMensal = {
  mes: string;
  receita: number;
  assinaturas: number;
  faturas: number;
  pagamentos: number;
};

export type TopTenants = {
  id: string;
  name: string;
  receitaTotal: number;
  assinaturasAtivas: number;
  status: string;
};

export type FaturaResumo = {
  id: string;
  numero: string;
  tenant: {
    name: string;
    slug: string;
  };
  valor: number;
  status: string;
  vencimento?: Date;
  pagoEm?: Date;
  createdAt: Date;
};

export type PagamentoResumo = {
  id: string;
  fatura: {
    numero: string;
    tenant: {
      name: string;
    };
  };
  valor: number;
  status: string;
  metodo: string;
  confirmadoEm?: Date;
  createdAt: Date;
};

export type ComissaoResumo = {
  id: string;
  advogado: {
    nome: string;
    oab: string;
  };
  pagamento: {
    valor: number;
    fatura: {
      numero: string;
      tenant: {
        name: string;
      };
    };
  };
  valorComissao: number;
  percentualComissao: number;
  status: string;
  dataPagamento?: Date;
  createdAt: Date;
};

export type {
  FinanceiroAdminBillingContextFilter,
  FinanceiroAdminDashboard,
  FinanceiroAdminFilterPreset,
  FinanceiroAdminFilters,
  FinanceiroAdminStatusFilter,
  FinanceiroAdminTenantOption,
};

// ==================== FUNÇÕES AUXILIARES ====================

async function ensureSuperAdmin() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    throw new Error("Não autenticado");
  }

  const userRole = (session.user as any)?.role;

  if (userRole !== "SUPER_ADMIN") {
    throw new Error(
      "Acesso negado. Apenas Super Admins podem acessar dados financeiros.",
    );
  }

  return session.user.id;
}

// ==================== ESTATÍSTICAS FINANCEIRAS ====================

export async function getEstatisticasFinanceiras(): Promise<{
  success: boolean;
  data?: EstatisticasFinanceiras;
  error?: string;
}> {
  try {
    await ensureSuperAdmin();

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    // Receita total (soma de todos os pagamentos confirmados)
    const receitaTotalResult = await prisma.pagamento.aggregate({
      where: {
        status: "PAGO",
      },
      _sum: {
        valor: true,
      },
    });

    // Receita mensal
    const receitaMensalResult = await prisma.pagamento.aggregate({
      where: {
        status: "PAGO",
        confirmadoEm: {
          gte: startOfMonth,
        },
      },
      _sum: {
        valor: true,
      },
    });

    // Receita anual
    const receitaAnualResult = await prisma.pagamento.aggregate({
      where: {
        status: "PAGO",
        confirmadoEm: {
          gte: startOfYear,
        },
      },
      _sum: {
        valor: true,
      },
    });

    // Assinaturas
    const [totalAssinaturas, assinaturasAtivas, assinaturasInadimplentes] =
      await Promise.all([
        prisma.tenantSubscription.count(),
        prisma.tenantSubscription.count({ where: { status: "ATIVA" } }),
        prisma.tenantSubscription.count({ where: { status: "INADIMPLENTE" } }),
      ]);

    // Faturas
    const [totalFaturas, faturasPagas, faturasPendentes, faturasVencidas] =
      await Promise.all([
        prisma.fatura.count(),
        prisma.fatura.count({ where: { status: "PAGA" } }),
        prisma.fatura.count({ where: { status: "ABERTA" } }),
        prisma.fatura.count({ where: { status: "VENCIDA" } }),
      ]);

    // Pagamentos
    const [totalPagamentos, pagamentosConfirmados] = await Promise.all([
      prisma.pagamento.count(),
      prisma.pagamento.count({ where: { status: "PAGO" } }),
    ]);

    // Comissões
    const [comissoesPendentes, comissoesPagas] = await Promise.all([
      prisma.pagamentoComissao.count({ where: { status: "PENDENTE" } }),
      prisma.pagamentoComissao.count({ where: { status: "PAGO" } }),
    ]);

    const estatisticas: EstatisticasFinanceiras = {
      receitaTotal: Number(receitaTotalResult._sum.valor || 0),
      receitaMensal: Number(receitaMensalResult._sum.valor || 0),
      receitaAnual: Number(receitaAnualResult._sum.valor || 0),
      totalAssinaturas,
      assinaturasAtivas,
      assinaturasInadimplentes,
      totalFaturas,
      faturasPagas,
      faturasPendentes,
      faturasVencidas,
      totalPagamentos,
      pagamentosConfirmados,
      comissoesPendentes,
      comissoesPagas,
    };

    return {
      success: true,
      data: estatisticas,
    };
  } catch (error) {
    logger.error("Erro ao buscar estatísticas financeiras:", error);

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro interno do servidor",
    };
  }
}

// ==================== RESUMO MENSAL ====================

export async function getResumoMensal(): Promise<{
  success: boolean;
  data?: ResumoMensal[];
  error?: string;
}> {
  try {
    await ensureSuperAdmin();

    const now = new Date();
    const meses = [];

    // Últimos 12 meses
    for (let i = 11; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const nextMonth = new Date(date.getFullYear(), date.getMonth() + 1, 1);

      const [
        receitaResult,
        assinaturasResult,
        faturasResult,
        pagamentosResult,
      ] = await Promise.all([
        prisma.pagamento.aggregate({
          where: {
            status: "PAGO",
            confirmadoEm: {
              gte: date,
              lt: nextMonth,
            },
          },
          _sum: {
            valor: true,
          },
        }),
        prisma.tenantSubscription.count({
          where: {
            createdAt: {
              gte: date,
              lt: nextMonth,
            },
          },
        }),
        prisma.fatura.count({
          where: {
            createdAt: {
              gte: date,
              lt: nextMonth,
            },
          },
        }),
        prisma.pagamento.count({
          where: {
            confirmadoEm: {
              gte: date,
              lt: nextMonth,
            },
          },
        }),
      ]);

      meses.push({
        mes: date.toLocaleDateString("pt-BR", {
          month: "short",
          year: "numeric",
        }),
        receita: Number(receitaResult._sum.valor || 0),
        assinaturas: assinaturasResult,
        faturas: faturasResult,
        pagamentos: pagamentosResult,
      });
    }

    return {
      success: true,
      data: meses,
    };
  } catch (error) {
    logger.error("Erro ao buscar resumo mensal:", error);

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro interno do servidor",
    };
  }
}

// ==================== TOP TENANTS ====================

export async function getTopTenants(): Promise<{
  success: boolean;
  data?: TopTenants[];
  error?: string;
}> {
  try {
    await ensureSuperAdmin();

    const tenants = await prisma.tenant.findMany({
      include: {
        subscription: {
          include: {
            faturas: {
              include: {
                pagamentos: {
                  where: {
                    status: "PAGO",
                  },
                },
              },
            },
          },
        },
      },
    });

    const tenantsComReceita = tenants.map((tenant) => {
      const receitaTotal = tenant.subscription
        ? tenant.subscription.faturas.reduce(
            (fatTotal: number, fatura: any) => {
              return (
                fatTotal +
                fatura.pagamentos.reduce((pagTotal: number, pagamento: any) => {
                  return pagTotal + Number(pagamento.valor);
                }, 0)
              );
            },
            0,
          )
        : 0;

      const assinaturasAtivas =
        tenant.subscription && tenant.subscription.status === "ATIVA" ? 1 : 0;

      return {
        id: tenant.id,
        name: tenant.name,
        receitaTotal,
        assinaturasAtivas,
        status: tenant.status,
      };
    });

    // Ordenar por receita total (decrescente) e pegar top 10
    const topTenants = tenantsComReceita
      .sort((a, b) => b.receitaTotal - a.receitaTotal)
      .slice(0, 10);

    return {
      success: true,
      data: topTenants,
    };
  } catch (error) {
    logger.error("Erro ao buscar top tenants:", error);

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro interno do servidor",
    };
  }
}

// ==================== FATURAS RECENTES ====================

export async function getFaturasRecentes(): Promise<{
  success: boolean;
  data?: FaturaResumo[];
  error?: string;
}> {
  try {
    await ensureSuperAdmin();

    const faturas = await prisma.fatura.findMany({
      include: {
        tenant: {
          select: {
            name: true,
            slug: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 10,
    });

    const faturasResumo: FaturaResumo[] = faturas.map((fatura) => ({
      id: fatura.id,
      numero: fatura.numero || `#${fatura.id.slice(-8)}`,
      tenant: {
        name: fatura.tenant.name,
        slug: fatura.tenant.slug,
      },
      valor: Number(fatura.valor),
      status: fatura.status,
      vencimento: fatura.vencimento || undefined,
      pagoEm: fatura.pagoEm || undefined,
      createdAt: fatura.createdAt,
    }));

    return {
      success: true,
      data: faturasResumo,
    };
  } catch (error) {
    logger.error("Erro ao buscar faturas recentes:", error);

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro interno do servidor",
    };
  }
}

// ==================== PAGAMENTOS RECENTES ====================

export async function getPagamentosRecentes(): Promise<{
  success: boolean;
  data?: PagamentoResumo[];
  error?: string;
}> {
  try {
    await ensureSuperAdmin();

    const pagamentos = await prisma.pagamento.findMany({
      include: {
        fatura: {
          include: {
            tenant: {
              select: {
                name: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 10,
    });

    const pagamentosResumo: PagamentoResumo[] = pagamentos.map((pagamento) => ({
      id: pagamento.id,
      fatura: {
        numero: pagamento.fatura.numero || `#${pagamento.fatura.id.slice(-8)}`,
        tenant: {
          name: pagamento.fatura.tenant.name,
        },
      },
      valor: Number(pagamento.valor),
      status: pagamento.status,
      metodo: pagamento.metodo || "N/A",
      confirmadoEm: pagamento.confirmadoEm || undefined,
      createdAt: pagamento.createdAt,
    }));

    return {
      success: true,
      data: pagamentosResumo,
    };
  } catch (error) {
    logger.error("Erro ao buscar pagamentos recentes:", error);

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro interno do servidor",
    };
  }
}

// ==================== COMISSÕES PENDENTES ====================

export async function getComissoesPendentes(): Promise<{
  success: boolean;
  data?: ComissaoResumo[];
  error?: string;
}> {
  try {
    await ensureSuperAdmin();

    const comissoes = await prisma.pagamentoComissao.findMany({
      where: {
        status: "PENDENTE",
      },
      include: {
        advogado: {
          select: {
            oabNumero: true,
            oabUf: true,
            usuario: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
          },
        },
        pagamento: {
          include: {
            fatura: {
              include: {
                tenant: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 10,
    });

    const comissoesResumo: ComissaoResumo[] = comissoes.map(
      (comissao: any) => ({
        id: comissao.id,
        advogado: {
          nome: `${comissao.advogado.usuario.firstName} ${comissao.advogado.usuario.lastName}`,
          oab: `${comissao.advogado.oabNumero}/${comissao.advogado.oabUf}`,
        },
        pagamento: {
          valor: Number(comissao.pagamento.valor),
          fatura: {
            numero:
              comissao.pagamento.fatura.numero ||
              `#${comissao.pagamento.fatura.id.slice(-8)}`,
            tenant: {
              name: comissao.pagamento.fatura.tenant.name,
            },
          },
        },
        valorComissao: Number(comissao.valorComissao),
        percentualComissao: Number(comissao.percentualComissao),
        status: comissao.status,
        dataPagamento: comissao.dataPagamento || undefined,
        createdAt: comissao.createdAt,
      }),
    );

    return {
      success: true,
      data: comissoesResumo,
    };
  } catch (error) {
    logger.error("Erro ao buscar comissões pendentes:", error);

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro interno do servidor",
    };
  }
}

export async function getFinanceiroDashboardAdmin(
  filters?: FinanceiroAdminFilters,
): Promise<{
  success: boolean;
  data?: FinanceiroAdminDashboard;
  error?: string;
}> {
  try {
    await ensureSuperAdmin();

    const tenantId = filters?.tenantId?.trim() || undefined;

    const [tenants, invoices, payments, subscriptions, commissions] =
      await Promise.all([
        prisma.tenant.findMany({
          where: {
            slug: {
              not: "global",
            },
          },
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
          },
          orderBy: {
            name: "asc",
          },
        }),
        prisma.fatura.findMany({
          where: {
            ...(tenantId ? { tenantId } : {}),
            tenant: {
              slug: {
                not: "global",
              },
            },
          },
          select: {
            id: true,
            tenantId: true,
            numero: true,
            valor: true,
            status: true,
            createdAt: true,
            vencimento: true,
            pagoEm: true,
            subscriptionId: true,
            contratoId: true,
            metadata: true,
            tenant: {
              select: {
                name: true,
                slug: true,
                status: true,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        }),
        prisma.pagamento.findMany({
          where: {
            ...(tenantId ? { tenantId } : {}),
            fatura: {
              tenant: {
                slug: {
                  not: "global",
                },
              },
            },
          },
          select: {
            id: true,
            tenantId: true,
            valor: true,
            status: true,
            metodo: true,
            createdAt: true,
            confirmadoEm: true,
            fatura: {
              select: {
                id: true,
                numero: true,
                status: true,
                subscriptionId: true,
                contratoId: true,
                metadata: true,
                tenant: {
                  select: {
                    name: true,
                    slug: true,
                    status: true,
                  },
                },
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        }),
        prisma.tenantSubscription.findMany({
          where: {
            ...(tenantId ? { tenantId } : {}),
            tenant: {
              slug: {
                not: "global",
              },
            },
          },
          select: {
            tenantId: true,
            status: true,
            valorMensalContratado: true,
            valorAnualContratado: true,
            tenant: {
              select: {
                name: true,
                slug: true,
              },
            },
          },
        }),
        prisma.pagamentoComissao.findMany({
          where: {
            ...(tenantId ? { tenantId } : {}),
            pagamento: {
              fatura: {
                tenant: {
                  slug: {
                    not: "global",
                  },
                },
              },
            },
          },
          select: {
            id: true,
            tenantId: true,
            valorComissao: true,
            percentualComissao: true,
            status: true,
            createdAt: true,
            dataPagamento: true,
            advogado: {
              select: {
                oabNumero: true,
                oabUf: true,
                usuario: {
                  select: {
                    firstName: true,
                    lastName: true,
                  },
                },
              },
            },
            pagamento: {
              select: {
                fatura: {
                  select: {
                    numero: true,
                    tenant: {
                      select: {
                        name: true,
                        slug: true,
                      },
                    },
                  },
                },
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        }),
      ]);

    const tenantOptions: FinanceiroAdminTenantOption[] = tenants.map((tenant) => ({
      key: tenant.id,
      label: tenant.name,
      status: tenant.status,
      description: `${tenant.slug} · ${tenant.status}`,
    }));

    const invoiceRecords: FinanceiroAdminInvoiceRecord[] = invoices.map(
      (invoice) => ({
        id: invoice.id,
        tenantId: invoice.tenantId,
        tenantName: invoice.tenant.name,
        tenantSlug: invoice.tenant.slug,
        tenantStatus: invoice.tenant.status,
        numero: invoice.numero || `#${invoice.id.slice(-8)}`,
        valor: Number(invoice.valor),
        status: invoice.status,
        createdAt: invoice.createdAt,
        vencimento: invoice.vencimento,
        pagoEm: invoice.pagoEm,
        subscriptionId: invoice.subscriptionId,
        contratoId: invoice.contratoId,
        metadata:
          invoice.metadata && typeof invoice.metadata === "object"
            ? (invoice.metadata as Record<string, unknown>)
            : null,
      }),
    );

    const paymentRecords: FinanceiroAdminPaymentRecord[] = payments.map(
      (payment) => {
        const invoiceStub: FinanceiroAdminInvoiceRecord = {
          id: payment.fatura.id,
          tenantId: payment.tenantId,
          tenantName: payment.fatura.tenant.name,
          tenantSlug: payment.fatura.tenant.slug,
          tenantStatus: payment.fatura.tenant.status,
          numero: payment.fatura.numero || `#${payment.fatura.id.slice(-8)}`,
          valor: Number(payment.valor),
          status: payment.fatura.status,
          createdAt: payment.createdAt,
          vencimento: null,
          pagoEm: payment.confirmadoEm,
          subscriptionId: payment.fatura.subscriptionId,
          contratoId: payment.fatura.contratoId,
          metadata:
            payment.fatura.metadata && typeof payment.fatura.metadata === "object"
              ? (payment.fatura.metadata as Record<string, unknown>)
              : null,
        };

        return {
          id: payment.id,
          tenantId: payment.tenantId,
          tenantName: payment.fatura.tenant.name,
          tenantSlug: payment.fatura.tenant.slug,
          tenantStatus: payment.fatura.tenant.status,
          invoiceId: payment.fatura.id,
          invoiceNumero: payment.fatura.numero || `#${payment.fatura.id.slice(-8)}`,
          invoiceStatus: payment.fatura.status,
          valor: Number(payment.valor),
          status: payment.status,
          metodo: payment.metodo,
          createdAt: payment.createdAt,
          confirmadoEm: payment.confirmadoEm,
          billingContext: resolveFinanceiroBillingContext(invoiceStub),
        };
      },
    );

    const subscriptionRecords: FinanceiroAdminSubscriptionRecord[] =
      subscriptions.map((subscription) => ({
        tenantId: subscription.tenantId,
        tenantName: subscription.tenant.name,
        tenantSlug: subscription.tenant.slug,
        status: subscription.status,
        valorMensalContratado:
          subscription.valorMensalContratado != null
            ? Number(subscription.valorMensalContratado)
            : null,
        valorAnualContratado:
          subscription.valorAnualContratado != null
            ? Number(subscription.valorAnualContratado)
            : null,
      }));

    const commissionRecords: FinanceiroAdminCommissionRecord[] =
      commissions.map((commission) => ({
        id: commission.id,
        tenantId: commission.tenantId,
        tenantName: commission.pagamento.fatura.tenant.name,
        tenantSlug: commission.pagamento.fatura.tenant.slug,
        advogadoNome: `${commission.advogado.usuario.firstName} ${commission.advogado.usuario.lastName}`.trim(),
        advogadoOab: [commission.advogado.oabNumero, commission.advogado.oabUf]
          .filter(Boolean)
          .join("/"),
        valorComissao: Number(commission.valorComissao),
        percentualComissao: Number(commission.percentualComissao),
        status: commission.status,
        createdAt: commission.createdAt,
        dataPagamento: commission.dataPagamento,
        faturaNumero:
          commission.pagamento.fatura.numero ||
          `#${commission.id.slice(-8)}`,
      }));

    return {
      success: true,
      data: buildFinanceiroAdminDashboard({
        filters,
        tenantOptions,
        invoices: invoiceRecords,
        payments: paymentRecords,
        subscriptions: subscriptionRecords,
        commissions: commissionRecords,
      }),
    };
  } catch (error) {
    logger.error("Erro ao montar dashboard financeiro global:", error);

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Erro interno do servidor",
    };
  }
}
