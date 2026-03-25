"use server";

import { getSession } from "@/app/lib/auth";
import prisma from "@/app/lib/prisma";
import { buildSoftDeletePayload } from "@/app/lib/soft-delete";
import logger from "@/lib/logger";

export interface CategoriaTarefaCreatePayload {
  nome: string;
  slug: string;
  descricao?: string | null;
  corHex?: string | null;
  ordem?: number;
}

export interface CategoriaTarefaUpdatePayload {
  nome?: string;
  slug?: string;
  descricao?: string | null;
  corHex?: string | null;
  ordem?: number;
  ativo?: boolean;
}

export async function listCategoriasTarefa(params?: { ativo?: boolean }) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;

    if (!user.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    const where: any = {
      tenantId: user.tenantId,
      deletedAt: null,
    };

    if (params?.ativo !== undefined) {
      where.ativo = params.ativo;
    }

    const categorias = await prisma.categoriaTarefa.findMany({
      where,
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
      orderBy: [{ ordem: "asc" }, { nome: "asc" }],
    });

    return { success: true, categorias };
  } catch (error) {
    logger.error("Erro ao listar categorias de tarefa:", error);

    return { success: false, error: "Erro ao listar categorias de tarefa" };
  }
}

export async function getCategoriaTarefa(id: string) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;

    const categoria = await prisma.categoriaTarefa.findFirst({
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

    if (!categoria) {
      return { success: false, error: "Categoria não encontrada" };
    }

    return { success: true, categoria };
  } catch (error) {
    logger.error("Erro ao buscar categoria de tarefa:", error);

    return { success: false, error: "Erro ao buscar categoria de tarefa" };
  }
}

export async function createCategoriaTarefa(
  data: CategoriaTarefaCreatePayload,
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

    // Validações
    if (!data.nome?.trim()) {
      return { success: false, error: "Nome é obrigatório" };
    }

    if (!data.slug?.trim()) {
      return { success: false, error: "Slug é obrigatório" };
    }

    // Verificar se slug já existe
    const slugExistente = await prisma.categoriaTarefa.findFirst({
      where: {
        tenantId: user.tenantId,
        slug: data.slug.trim(),
        deletedAt: null,
      },
    });

    if (slugExistente) {
      return { success: false, error: "Slug já existe" };
    }

    const categoria = await prisma.categoriaTarefa.create({
      data: {
        nome: data.nome.trim(),
        slug: data.slug.trim(),
        descricao: data.descricao?.trim(),
        corHex: data.corHex || "#3B82F6", // Azul padrão
        ordem: data.ordem,
        ativo: true,
        tenantId: user.tenantId,
      },
    });

    logger.info(
      `Categoria de tarefa criada: ${categoria.id} por usuário ${user.email}`,
    );

    return { success: true, categoria };
  } catch (error) {
    logger.error("Erro ao criar categoria de tarefa:", error);

    return { success: false, error: "Erro ao criar categoria de tarefa" };
  }
}

export async function updateCategoriaTarefa(
  id: string,
  data: CategoriaTarefaUpdatePayload,
) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;

    // Verificar se a categoria existe e pertence ao tenant
    const categoriaExistente = await prisma.categoriaTarefa.findFirst({
      where: {
        id,
        tenantId: user.tenantId,
        deletedAt: null,
      },
    });

    if (!categoriaExistente) {
      return { success: false, error: "Categoria não encontrada" };
    }

    // Se mudando o slug, verificar se novo slug já existe
    if (data.slug && data.slug !== categoriaExistente.slug) {
      const slugExistente = await prisma.categoriaTarefa.findFirst({
        where: {
          tenantId: user.tenantId,
          slug: data.slug.trim(),
          id: {
            not: id,
          },
          deletedAt: null,
        },
      });

      if (slugExistente) {
        return { success: false, error: "Slug já existe" };
      }
    }

    const updateData: any = {};

    if (data.nome !== undefined) updateData.nome = data.nome.trim();
    if (data.slug !== undefined) updateData.slug = data.slug.trim();
    if (data.descricao !== undefined)
      updateData.descricao = data.descricao?.trim();
    if (data.corHex !== undefined) updateData.corHex = data.corHex;
    if (data.ordem !== undefined) updateData.ordem = data.ordem;
    if (data.ativo !== undefined) updateData.ativo = data.ativo;

    const categoria = await prisma.categoriaTarefa.update({
      where: { id },
      data: updateData,
    });

    logger.info(
      `Categoria de tarefa atualizada: ${id} por usuário ${user.email}`,
    );

    return { success: true, categoria };
  } catch (error) {
    logger.error("Erro ao atualizar categoria de tarefa:", error);

    return { success: false, error: "Erro ao atualizar categoria de tarefa" };
  }
}

export async function deleteCategoriaTarefa(id: string) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;

    // Verificar se a categoria existe e pertence ao tenant
    const categoria = await prisma.categoriaTarefa.findFirst({
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

    if (!categoria) {
      return { success: false, error: "Categoria não encontrada" };
    }

    // Verificar se há tarefas vinculadas
    if (categoria._count.tarefas > 0) {
      return {
        success: false,
        error: `Não é possível excluir. Existem ${categoria._count.tarefas} tarefa(s) vinculada(s) a esta categoria.`,
      };
    }

    await prisma.categoriaTarefa.update({
      where: { id },
      data: buildSoftDeletePayload(
        {
          actorId: user.id ?? null,
          actorType: user.role ?? "USER",
        },
        "Exclusão manual de categoria de tarefa",
      ),
    });

    logger.info(
      `Categoria de tarefa deletada: ${id} por usuário ${user.email}`,
    );

    return { success: true };
  } catch (error) {
    logger.error("Erro ao deletar categoria de tarefa:", error);

    return { success: false, error: "Erro ao deletar categoria de tarefa" };
  }
}
