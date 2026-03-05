"use server";

import { getServerSession } from "next-auth";

import { authOptions } from "@/auth";
import prisma, { convertAllDecimalFields } from "@/app/lib/prisma";

export interface BillingFiltros {
  status?: string;
  search?: string;
  pagina?: number;
  itensPorPagina?: number;
}

export interface BillingFaturaItem {
  id: string;
  numero: string;
  descricao: string | null;
  valor: number;
  moeda: string;
  status: string;
  vencimento: Date | null;
  pagoEm: Date | null;
  externalInvoiceId: string | null;
  urlBoleto: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface BillingResumo {
  totalFaturas: number;
  totalPago: number;
  totalAberto: number;
  totalVencido: number;
  valorTotal: number;
  valorPago: number;
  valorAberto: number;
  valorVencido: number;
}

export async function getTenantBillingFaturas(
  filtros: BillingFiltros = {},
): Promise<{
  success: boolean;
  data?: {
    assinatura: {
      id: string;
      status: string;
      plano: string | null;
      renovaEm: Date | null;
      trialEndsAt: Date | null;
    } | null;
    faturas: BillingFaturaItem[];
    total: number;
    totalPaginas: number;
    resumo: BillingResumo;
  };
  error?: string;
}> {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.tenantId) {
      return { success: false, error: "Não autenticado" };
    }

    const role = (session.user as any)?.role as string | undefined;
    const canManageBilling =
      role === "ADMIN" || role === "SUPER_ADMIN" || role === "FINANCEIRO";

    if (!canManageBilling) {
      return {
        success: false,
        error: "Sem permissão para acessar o billing do escritório",
      };
    }

    const tenantId = session.user.tenantId;
    const pagina = filtros.pagina || 1;
    const itensPorPagina = filtros.itensPorPagina || 10;
    const skip = (pagina - 1) * itensPorPagina;

    const whereBase: any = {
      tenantId,
      subscriptionId: { not: null },
      contratoId: null,
    };

    if (filtros.status) {
      whereBase.status = filtros.status;
    }

    if (filtros.search?.trim()) {
      const term = filtros.search.trim();

      whereBase.OR = [
        { numero: { contains: term, mode: "insensitive" } },
        { descricao: { contains: term, mode: "insensitive" } },
        { externalInvoiceId: { contains: term, mode: "insensitive" } },
      ];
    }

    const [assinatura, total, faturas, totalAgg, pagoAgg, abertoAgg, vencidoAgg] =
      await Promise.all([
        prisma.tenantSubscription.findFirst({
          where: { tenantId },
          select: {
            id: true,
            status: true,
            renovaEm: true,
            trialEndsAt: true,
            plano: { select: { nome: true } },
          },
        }),
        prisma.fatura.count({ where: whereBase }),
        prisma.fatura.findMany({
          where: whereBase,
          select: {
            id: true,
            numero: true,
            descricao: true,
            valor: true,
            moeda: true,
            status: true,
            vencimento: true,
            pagoEm: true,
            externalInvoiceId: true,
            urlBoleto: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: [{ createdAt: "desc" }],
          skip,
          take: itensPorPagina,
        }),
        prisma.fatura.aggregate({
          where: whereBase,
          _sum: { valor: true },
        }),
        prisma.fatura.aggregate({
          where: { ...whereBase, status: "PAGA" },
          _sum: { valor: true },
          _count: { _all: true },
        }),
        prisma.fatura.aggregate({
          where: { ...whereBase, status: { in: ["ABERTA", "RASCUNHO"] } },
          _sum: { valor: true },
          _count: { _all: true },
        }),
        prisma.fatura.aggregate({
          where: { ...whereBase, status: "VENCIDA" },
          _sum: { valor: true },
          _count: { _all: true },
        }),
      ]);

    const resumo: BillingResumo = {
      totalFaturas: total,
      totalPago: pagoAgg._count._all,
      totalAberto: abertoAgg._count._all,
      totalVencido: vencidoAgg._count._all,
      valorTotal: Number(totalAgg._sum.valor || 0),
      valorPago: Number(pagoAgg._sum.valor || 0),
      valorAberto: Number(abertoAgg._sum.valor || 0),
      valorVencido: Number(vencidoAgg._sum.valor || 0),
    };

    const convertedFaturas = faturas.map((item) => convertAllDecimalFields(item));
    const serialized = JSON.parse(JSON.stringify(convertedFaturas));

    return {
      success: true,
      data: {
        assinatura: assinatura
          ? {
              id: assinatura.id,
              status: assinatura.status,
              plano: assinatura.plano?.nome || null,
              renovaEm: assinatura.renovaEm,
              trialEndsAt: assinatura.trialEndsAt,
            }
          : null,
        faturas: serialized,
        total,
        totalPaginas: Math.max(1, Math.ceil(total / itensPorPagina)),
        resumo,
      },
    };
  } catch (error) {
    console.error("Erro ao buscar billing do tenant:", error);
    return { success: false, error: "Erro interno ao carregar billing" };
  }
}
