"use server";

import { getSession } from "@/app/lib/auth";
import prisma from "@/app/lib/prisma";
import { buildSoftDeletePayload } from "@/app/lib/soft-delete";
import logger from "@/lib/logger";

export interface ColumnCreatePayload {
  boardId: string;
  nome: string;
  cor?: string | null;
  limite?: number | null;
}

export interface ColumnUpdatePayload {
  nome?: string;
  cor?: string | null;
  ordem?: number;
  limite?: number | null;
  ativo?: boolean;
}

export async function listColumns(boardId: string) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;

    const columns = await prisma.boardColumn.findMany({
      where: {
        boardId,
        tenantId: user.tenantId,
        deletedAt: null,
      },
      include: {
        _count: {
          select: {
            tarefas: {
              where: {
                deletedAt: null,
              },
            },
          },
        },
      },
      orderBy: { ordem: "asc" },
    });

    return { success: true, columns };
  } catch (error) {
    logger.error("Erro ao listar colunas:", error);

    return { success: false, error: "Erro ao listar colunas" };
  }
}

export async function createColumn(data: ColumnCreatePayload) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;

    if (!user.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    // Validações
    if (!data.nome?.trim()) {
      return { success: false, error: "Nome é obrigatório" };
    }

    // Verificar se board existe
    const board = await prisma.board.findFirst({
      where: {
        id: data.boardId,
        tenantId: user.tenantId,
        deletedAt: null,
      },
    });

    if (!board) {
      return { success: false, error: "Board não encontrado" };
    }

    // Pegar a próxima ordem
    const ultimaColuna = await prisma.boardColumn.findFirst({
      where: {
        boardId: data.boardId,
        deletedAt: null,
      },
      orderBy: { ordem: "desc" },
    });

    const proximaOrdem = (ultimaColuna?.ordem ?? -1) + 1;

    const column = await prisma.boardColumn.create({
      data: {
        nome: data.nome.trim(),
        cor: data.cor,
        limite: data.limite,
        ordem: proximaOrdem,
        boardId: data.boardId,
        tenantId: user.tenantId,
      },
    });

    logger.info(
      `Coluna criada: ${column.id} no board ${data.boardId} por usuário ${user.email}`,
    );

    return { success: true, column };
  } catch (error) {
    logger.error("Erro ao criar coluna:", error);

    return { success: false, error: "Erro ao criar coluna" };
  }
}

export async function updateColumn(id: string, data: ColumnUpdatePayload) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;

    // Verificar se a coluna existe e pertence ao tenant
    const colunaExistente = await prisma.boardColumn.findFirst({
      where: {
        id,
        tenantId: user.tenantId,
        deletedAt: null,
      },
    });

    if (!colunaExistente) {
      return { success: false, error: "Coluna não encontrada" };
    }

    const updateData: any = {};

    if (data.nome !== undefined) updateData.nome = data.nome.trim();
    if (data.cor !== undefined) updateData.cor = data.cor;
    if (data.ordem !== undefined) updateData.ordem = data.ordem;
    if (data.limite !== undefined) updateData.limite = data.limite;
    if (data.ativo !== undefined) updateData.ativo = data.ativo;

    const column = await prisma.boardColumn.update({
      where: { id },
      data: updateData,
    });

    logger.info(`Coluna atualizada: ${id} por usuário ${user.email}`);

    return { success: true, column };
  } catch (error) {
    logger.error("Erro ao atualizar coluna:", error);

    return { success: false, error: "Erro ao atualizar coluna" };
  }
}

export async function deleteColumn(id: string) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;

    // Verificar se a coluna existe e pertence ao tenant
    const column = await prisma.boardColumn.findFirst({
      where: {
        id,
        tenantId: user.tenantId,
        deletedAt: null,
      },
      include: {
        _count: {
          select: {
            tarefas: {
              where: {
                deletedAt: null,
              },
            },
          },
        },
      },
    });

    if (!column) {
      return { success: false, error: "Coluna não encontrada" };
    }

    // Verificar se há tarefas
    if (column._count.tarefas > 0) {
      return {
        success: false,
        error: `Não é possível excluir. Existem ${column._count.tarefas} tarefa(s) nesta coluna. Mova-as primeiro.`,
      };
    }

    await prisma.boardColumn.update({
      where: { id },
      data: buildSoftDeletePayload(
        {
          actorId: user.id ?? null,
          actorType: user.role ?? "USER",
        },
        "Exclusão manual de coluna do board",
      ),
    });

    logger.info(`Coluna deletada: ${id} por usuário ${user.email}`);

    return { success: true };
  } catch (error) {
    logger.error("Erro ao deletar coluna:", error);

    return { success: false, error: "Erro ao deletar coluna" };
  }
}

export async function reorderColumns(
  boardId: string,
  columnOrders: Array<{ id: string; ordem: number }>,
) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;

    // Verificar se board existe
    const board = await prisma.board.findFirst({
      where: {
        id: boardId,
        tenantId: user.tenantId,
        deletedAt: null,
      },
    });

    if (!board) {
      return { success: false, error: "Board não encontrado" };
    }

    // Atualizar ordem de cada coluna
    await prisma.$transaction(
      columnOrders.map(({ id, ordem }) =>
        prisma.boardColumn.update({
          where: { id },
          data: { ordem },
        }),
      ),
    );

    logger.info(
      `Colunas reordenadas no board ${boardId} por usuário ${user.email}`,
    );

    return { success: true };
  } catch (error) {
    logger.error("Erro ao reordenar colunas:", error);

    return { success: false, error: "Erro ao reordenar colunas" };
  }
}
