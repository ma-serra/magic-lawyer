"use server";

import { Prisma, UserRole } from "@/generated/prisma";
import { revalidatePath } from "next/cache";

import prisma from "@/app/lib/prisma";
import { getSession } from "@/app/lib/auth";
import { buildSoftDeletePayload } from "@/app/lib/soft-delete";
import logger from "@/lib/logger";

// ============================================
// TYPES
// ============================================

export interface ActionResponse<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface ModeloContratoFilters {
  search?: string;
  categoria?: string;
  tipoId?: string;
  ativo?: boolean;
  publico?: boolean;
}

export interface ModeloContratoFormData {
  nome: string;
  descricao?: string;
  categoria?: string;
  tipoId?: string;
  conteudo: string;
  variaveis?: string;
  publico?: boolean;
  ativo?: boolean;
}

export interface ModeloContratoListItem {
  id: string;
  nome: string;
  descricao: string | null;
  categoria: string | null;
  conteudo: string;
  variaveis: Prisma.JsonValue | null;
  tipoId: string | null;
  publico: boolean;
  ativo: boolean;
  createdAt: Date;
  updatedAt: Date;
  tipo?: {
    id: string;
    nome: string;
  } | null;
  _count?: {
    contratos: number;
  };
}

// ============================================
// HELPERS
// ============================================

async function getAuthenticatedTenantId(): Promise<{
  tenantId: string;
  user: {
    id: string;
    email?: string;
    role: string;
    tenantId: string;
  };
}> {
  const session = await getSession();

  if (!session?.user) {
    throw new Error("Não autorizado");
  }

  const user = session.user as {
    id: string;
    email?: string;
    role: string;
    tenantId?: string;
  };

  if (!user.tenantId) {
    throw new Error("Tenant não encontrado");
  }

  if (user.role === UserRole.CLIENTE) {
    throw new Error("Acesso negado");
  }

  return {
    tenantId: user.tenantId,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
    },
  };
}

function normalizeSearchValue(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim();

  return normalized.length > 0 ? normalized : undefined;
}

function normalizeVariaveis(variaveis: string | undefined): string[] | null {
  if (!variaveis) {
    return null;
  }

  const trimmed = variaveis.trim();

  if (!trimmed) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed);

    if (!Array.isArray(parsed)) {
      return null;
    }

    const normalized = parsed
      .map((value) =>
        typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim(),
      )
      .filter((value) => Boolean(value));

    return normalized.length > 0 ? normalized : null;
  } catch {
    const split = trimmed
      .split(/[;,\n]/g)
      .map((value) => value.trim())
      .filter((value) => Boolean(value));

    return split.length > 0 ? split : null;
  }
}

function countUniqueSortedVariaveis(variaveis: Prisma.JsonValue | null): number {
  if (!Array.isArray(variaveis)) {
    return 0;
  }

  const values = variaveis
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);

  return new Set(values).size;
}

// ============================================
// LISTAR
// ============================================

export async function listModelosContrato(
  filters: ModeloContratoFilters = {},
): Promise<ActionResponse<ModeloContratoListItem[]>> {
  try {
    const { tenantId, user } = await getAuthenticatedTenantId();
    const normalizedSearch = normalizeSearchValue(filters.search);

    const where: Prisma.ModeloContratoWhereInput = {
      tenantId,
      deletedAt: null,
    };

    if (normalizedSearch) {
      where.OR = [
        { nome: { contains: normalizedSearch, mode: "insensitive" } },
        { descricao: { contains: normalizedSearch, mode: "insensitive" } },
        { categoria: { contains: normalizedSearch, mode: "insensitive" } },
        { conteudo: { contains: normalizedSearch, mode: "insensitive" } },
      ];
    }

    if (filters.categoria) {
      where.categoria = filters.categoria;
    }

    if (filters.tipoId) {
      where.tipoId = filters.tipoId;
    }

    if (filters.ativo !== undefined) {
      where.ativo = filters.ativo;
    }

    if (filters.publico !== undefined) {
      where.publico = filters.publico;
    }

    const modelos = await prisma.modeloContrato.findMany({
      where,
      include: {
        tipo: {
          select: {
            id: true,
            nome: true,
          },
        },
        _count: {
          select: {
            contratos: {
              where: {
                deletedAt: null,
              },
            },
          },
        },
      },
      orderBy: [{ ativo: "desc" }, { nome: "asc" }],
    });

    const totalVariaveis = modelos.reduce(
      (acc, modelo) => acc + countUniqueSortedVariaveis(modelo.variaveis),
      0,
    );

    logger.info(`Usuário ${user.id} listou ${modelos.length} modelos de contrato`, {
      tenantId,
      totalVariaveis,
    });

    return {
      success: true,
      data: modelos,
    };
  } catch (error) {
    logger.error("Erro ao listar modelos de contrato:", error);

    if (error instanceof Error && error.message === "Não autorizado") {
      return { success: false, error: error.message };
    }

    return {
      success: false,
      error: "Erro ao listar modelos de contrato",
    };
  }
}

// ============================================
// BUSCAR POR ID
// ============================================

export async function getModeloContratoById(
  modeloId: string,
): Promise<ActionResponse<ModeloContratoListItem>> {
  try {
    const { tenantId, user } = await getAuthenticatedTenantId();

    const modelo = await prisma.modeloContrato.findFirst({
      where: {
        id: modeloId,
        tenantId,
        deletedAt: null,
      },
      include: {
        tipo: {
          select: {
            id: true,
            nome: true,
          },
        },
        _count: {
          select: {
            contratos: {
              where: {
                deletedAt: null,
              },
            },
          },
        },
      },
    });

    if (!modelo) {
      return {
        success: false,
        error: "Modelo de contrato não encontrado",
      };
    }

    logger.info(`Usuário ${user.id} acessou modelo de contrato ${modeloId}`);

    return {
      success: true,
      data: modelo,
    };
  } catch (error) {
    logger.error("Erro ao buscar modelo de contrato:", error);

    if (error instanceof Error && error.message === "Não autorizado") {
      return { success: false, error: error.message };
    }

    return {
      success: false,
      error: "Erro ao buscar modelo de contrato",
    };
  }
}

// ============================================
// CRIAR
// ============================================

export async function createModeloContrato(
  data: ModeloContratoFormData,
): Promise<ActionResponse<ModeloContratoListItem>> {
  try {
    const { tenantId, user } = await getAuthenticatedTenantId();
    const nome = normalizeSearchValue(data.nome);

    if (!nome) {
      return { success: false, error: "Nome é obrigatório" };
    }

    const conteudo = normalizeSearchValue(data.conteudo);

    if (!conteudo) {
      return { success: false, error: "Conteúdo é obrigatório" };
    }

    if (data.tipoId) {
      const tipo = await prisma.tipoContrato.findFirst({
        where: {
          id: data.tipoId,
          OR: [{ tenantId }, { tenantId: null }],
          deletedAt: null,
        },
      });

      if (!tipo) {
        return {
          success: false,
          error: "Tipo de contrato não encontrado",
        };
      }
    }

    const variaveis = normalizeVariaveis(data.variaveis);

    const modelo = await prisma.modeloContrato.create({
      data: {
        tenantId,
        tipoId: data.tipoId || null,
        nome,
        descricao: normalizeSearchValue(data.descricao) || null,
        categoria: normalizeSearchValue(data.categoria) || null,
        conteudo,
        variaveis: variaveis as Prisma.InputJsonValue,
        publico: data.publico ?? false,
        ativo: data.ativo ?? true,
      },
      include: {
        tipo: {
          select: {
            id: true,
            nome: true,
          },
        },
        _count: {
          select: {
            contratos: {
              where: {
                deletedAt: null,
              },
            },
          },
        },
      },
    });

    revalidatePath("/contratos/modelos");

    logger.info(`Modelo de contrato criado ${modelo.id} por ${user.id}`);

    return {
      success: true,
      data: modelo,
    };
  } catch (error) {
    logger.error("Erro ao criar modelo de contrato:", error);

    if (error instanceof Error && error.message === "Não autorizado") {
      return { success: false, error: error.message };
    }

    return {
      success: false,
      error: "Erro ao criar modelo de contrato",
    };
  }
}

// ============================================
// ATUALIZAR
// ============================================

export async function updateModeloContrato(
  modeloId: string,
  data: Partial<ModeloContratoFormData>,
): Promise<ActionResponse<ModeloContratoListItem>> {
  try {
    const { tenantId, user } = await getAuthenticatedTenantId();

    const modeloExistente = await prisma.modeloContrato.findFirst({
      where: {
        id: modeloId,
        tenantId,
        deletedAt: null,
      },
    });

    if (!modeloExistente) {
      return {
        success: false,
        error: "Modelo de contrato não encontrado",
      };
    }

    if (data.tipoId) {
      const tipo = await prisma.tipoContrato.findFirst({
        where: {
          id: data.tipoId,
          OR: [{ tenantId }, { tenantId: null }],
          deletedAt: null,
        },
      });

      if (!tipo) {
        return {
          success: false,
          error: "Tipo de contrato não encontrado",
        };
      }
    }

    const payload: Prisma.ModeloContratoUpdateInput = {};

    if (data.nome !== undefined) {
      const nome = normalizeSearchValue(data.nome);

      if (!nome) {
        return { success: false, error: "Nome é obrigatório" };
      }

      payload.nome = nome;
    }

    if (data.descricao !== undefined) {
      payload.descricao = normalizeSearchValue(data.descricao) || null;
    }

    if (data.categoria !== undefined) {
      payload.categoria = normalizeSearchValue(data.categoria) || null;
    }

    if (data.conteudo !== undefined) {
      const conteudo = normalizeSearchValue(data.conteudo);

      if (!conteudo) {
        return { success: false, error: "Conteúdo é obrigatório" };
      }

      payload.conteudo = conteudo;
    }

    if (data.publico !== undefined) {
      payload.publico = data.publico;
    }

    if (data.ativo !== undefined) {
      payload.ativo = data.ativo;
    }

    if (data.variaveis !== undefined) {
      payload.variaveis =
        normalizeVariaveis(data.variaveis) as Prisma.InputJsonValue;
    }

    if (data.tipoId !== undefined) {
      payload.tipo = data.tipoId
        ? { connect: { id: data.tipoId } }
        : { disconnect: true };
    }

    const modelo = await prisma.modeloContrato.update({
      where: {
        id: modeloId,
      },
      data: payload,
      include: {
        tipo: {
          select: {
            id: true,
            nome: true,
          },
        },
        _count: {
          select: {
            contratos: {
              where: {
                deletedAt: null,
              },
            },
          },
        },
      },
    });

    revalidatePath("/contratos/modelos");

    logger.info(`Modelo de contrato ${modeloId} atualizado por ${user.id}`);

    return {
      success: true,
      data: modelo,
    };
  } catch (error) {
    logger.error("Erro ao atualizar modelo de contrato:", error);

    if (error instanceof Error && error.message === "Não autorizado") {
      return { success: false, error: error.message };
    }

    return {
      success: false,
      error: "Erro ao atualizar modelo de contrato",
    };
  }
}

// ============================================
// EXCLUIR
// ============================================

export async function deleteModeloContrato(
  modeloId: string,
): Promise<ActionResponse> {
  try {
    const { tenantId, user } = await getAuthenticatedTenantId();

    const modelo = await prisma.modeloContrato.findFirst({
      where: {
        id: modeloId,
        tenantId,
        deletedAt: null,
      },
    });

    if (!modelo) {
      return {
        success: false,
        error: "Modelo de contrato não encontrado",
      };
    }

    const contratosVinculados = await prisma.contrato.count({
      where: {
        tenantId,
        modeloId,
        deletedAt: null,
      },
    });

    if (contratosVinculados > 0) {
      return {
        success: false,
        error: `Não é possível excluir: modelo vinculado a ${contratosVinculados} contrato(s). Remova o vínculo antes de excluir.`,
      };
    }

    await prisma.modeloContrato.update({
      where: {
        id: modeloId,
      },
      data: buildSoftDeletePayload(
        {
          actorId: user.id,
          actorType: user.role,
        },
        "Exclusão manual de modelo de contrato",
      ),
    });

    revalidatePath("/contratos/modelos");

    logger.info(`Modelo de contrato ${modeloId} removido por ${user.id}`);

    return {
      success: true,
    };
  } catch (error) {
    logger.error("Erro ao excluir modelo de contrato:", error);

    if (error instanceof Error && error.message === "Não autorizado") {
      return { success: false, error: error.message };
    }

    return {
      success: false,
      error: "Erro ao excluir modelo de contrato",
    };
  }
}
