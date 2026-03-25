"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { getSession } from "@/app/lib/auth";
import prisma from "@/app/lib/prisma";

export interface AdvogadoHistoricoData {
  id: string;
  advogadoId: string;
  usuarioId: string;
  acao: string;
  campo?: string | null;
  valorAnterior?: string | null;
  valorNovo?: string | null;
  detalhes?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: Date;
  usuario: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    email: string;
    avatarUrl?: string | null;
  };
}

export interface CreateHistoricoInput {
  advogadoId: string;
  acao: string;
  campo?: string | null;
  valorAnterior?: string | null;
  valorNovo?: string | null;
  detalhes?: string | null;
}

export interface ActionResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Registra uma entrada no histórico de alterações do advogado
 */
export async function createAdvogadoHistorico(
  input: CreateHistoricoInput,
): Promise<ActionResponse<AdvogadoHistoricoData>> {
  try {
    const session = await getSession();

    if (!session?.user?.tenantId || !session?.user?.id) {
      return { success: false, error: "Usuário não autenticado" };
    }

    // Obter informações do request
    const headersList = await headers();
    const ipAddress =
      headersList.get("x-forwarded-for") ||
      headersList.get("x-real-ip") ||
      "unknown";
    const userAgent = headersList.get("user-agent") || "unknown";

    const historico = await prisma.advogadoHistorico.create({
      data: {
        tenantId: session.user.tenantId,
        advogadoId: input.advogadoId,
        usuarioId: session.user.id,
        acao: input.acao,
        campo: input.campo,
        valorAnterior: input.valorAnterior,
        valorNovo: input.valorNovo,
        detalhes: input.detalhes,
        ipAddress,
        userAgent,
      },
      include: {
        usuario: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    return { success: true, data: historico };
  } catch (error) {
    console.error("Erro ao criar histórico do advogado:", error);

    return { success: false, error: "Erro ao registrar histórico" };
  }
}

/**
 * Busca o histórico de alterações de um advogado
 */
export async function getAdvogadoHistorico(
  advogadoId: string,
): Promise<ActionResponse<AdvogadoHistoricoData[]>> {
  try {
    const session = await getSession();

    if (!session?.user?.tenantId) {
      return { success: false, error: "Usuário não autenticado" };
    }

    const historico = await prisma.advogadoHistorico.findMany({
      where: {
        tenantId: session.user.tenantId,
        advogadoId,
      },
      include: {
        usuario: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return { success: true, data: historico };
  } catch (error) {
    console.error("Erro ao buscar histórico do advogado:", error);

    return { success: false, error: "Erro ao buscar histórico" };
  }
}

/**
 * Busca o histórico de alterações de todos os advogados do tenant
 */
export async function getAllAdvogadosHistorico(): Promise<
  ActionResponse<AdvogadoHistoricoData[]>
> {
  try {
    const session = await getSession();

    if (!session?.user?.tenantId) {
      return { success: false, error: "Usuário não autenticado" };
    }

    const historico = await prisma.advogadoHistorico.findMany({
      where: {
        tenantId: session.user.tenantId,
      },
      include: {
        usuario: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        advogado: {
          select: {
            id: true,
            usuario: {
              select: {
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 100, // Limitar a 100 entradas mais recentes
    });

    return { success: true, data: historico };
  } catch (error) {
    console.error("Erro ao buscar histórico de todos os advogados:", error);

    return { success: false, error: "Erro ao buscar histórico" };
  }
}

/**
 * Deleta entradas antigas do histórico (manutenção)
 */
export async function cleanupAdvogadoHistorico(
  daysToKeep: number = 365,
): Promise<ActionResponse> {
  try {
    const session = await getSession();

    if (!session?.user?.tenantId) {
      return { success: false, error: "Usuário não autenticado" };
    }

    // Verificar se o usuário é admin
    if (session.user.role !== "ADMIN") {
      return {
        success: false,
        error: "Apenas administradores podem limpar o histórico",
      };
    }

    const cutoffDate = new Date();

    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const pendingCleanup = await prisma.advogadoHistorico.count({
      where: {
        tenantId: session.user.tenantId,
        createdAt: {
          lt: cutoffDate,
        },
      },
    });

    revalidatePath("/advogados");

    return {
      success: true,
      data: {
        deletedCount: 0,
        pendingCleanup,
        message:
          "Limpeza física desativada por política de retenção. Registros antigos seguem preservados.",
      },
    };
  } catch (error) {
    console.error("Erro ao limpar histórico do advogado:", error);

    return { success: false, error: "Erro ao limpar histórico" };
  }
}
