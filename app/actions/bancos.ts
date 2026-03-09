"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth/next";

import prisma from "@/app/lib/prisma";
import { authOptions } from "@/auth";
import { UserRole } from "@/generated/prisma";
import logger from "@/lib/logger";

// ============================================
// INTERFACES
// ============================================

export interface BancoCreateInput {
  codigo: string;
  nome: string;
  nomeCompleto?: string;
  site?: string;
  telefone?: string;
  cnpj?: string;
  ispb?: string;
}

export interface BancoUpdateInput {
  nome?: string;
  nomeCompleto?: string;
  site?: string;
  telefone?: string;
  cnpj?: string;
  ispb?: string;
  ativo?: boolean;
}

export interface BancoListFilters {
  search?: string;
  ativo?: boolean;
  page?: number;
  limit?: number;
}

async function requireAuthenticated() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return { success: false as const, error: "Não autorizado" };
  }

  return { success: true as const, user: session.user as any };
}

async function requireSuperAdmin() {
  const auth = await requireAuthenticated();

  if (!auth.success) {
    return auth;
  }

  if (auth.user.role !== UserRole.SUPER_ADMIN) {
    return {
      success: false as const,
      error: "Acesso negado. Apenas Super Admin pode executar esta ação.",
    };
  }

  return auth;
}

// ============================================
// CRUD OPERATIONS
// ============================================

export async function listBancos(filters: BancoListFilters = {}) {
  try {
    const auth = await requireSuperAdmin();

    if (!auth.success) {
      return auth;
    }

    const { search, ativo, page = 1, limit = 50 } = filters;
    const skip = (page - 1) * limit;

    const where: any = {
      deletedAt: null,
    };

    if (ativo !== undefined) {
      where.ativo = ativo;
    }

    if (search) {
      where.OR = [
        { codigo: { contains: search, mode: "insensitive" } },
        { nome: { contains: search, mode: "insensitive" } },
        { nomeCompleto: { contains: search, mode: "insensitive" } },
        { cnpj: { contains: search, mode: "insensitive" } },
      ];
    }

    const [bancos, total] = await Promise.all([
      prisma.banco.findMany({
        where,
        orderBy: [{ ativo: "desc" }, { nome: "asc" }],
        skip,
        take: limit,
        select: {
          id: true,
          codigo: true,
          nome: true,
          nomeCompleto: true,
          site: true,
          telefone: true,
          cnpj: true,
          ispb: true,
          ativo: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              dadosBancarios: true,
            },
          },
        },
      }),
      prisma.banco.count({ where }),
    ]);

    return {
      success: true,
      bancos,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  } catch (error) {
    logger.error("Erro ao listar bancos:", error);

    return {
      success: false,
      error: "Erro interno do servidor",
    };
  }
}

export async function getBanco(codigo: string) {
  try {
    const auth = await requireSuperAdmin();

    if (!auth.success) {
      return auth;
    }

    const banco = await prisma.banco.findUnique({
      where: {
        codigo,
        deletedAt: null,
      },
      include: {
        _count: {
          select: {
            dadosBancarios: true,
          },
        },
      },
    });

    if (!banco) {
      return {
        success: false,
        error: "Banco não encontrado",
      };
    }

    return {
      success: true,
      banco,
    };
  } catch (error) {
    logger.error("Erro ao buscar banco:", error);

    return {
      success: false,
      error: "Erro interno do servidor",
    };
  }
}

export async function createBanco(data: BancoCreateInput) {
  try {
    const auth = await requireSuperAdmin();

    if (!auth.success) {
      return auth;
    }

    // Verificar se o código já existe
    const bancoExistente = await prisma.banco.findUnique({
      where: { codigo: data.codigo },
    });

    if (bancoExistente) {
      return {
        success: false,
        error: "Código do banco já existe",
      };
    }

    const banco = await prisma.banco.create({
      data: {
        ...data,
      },
    });

    revalidatePath("/admin/bancos");
    revalidatePath("/dados-bancarios");
    revalidatePath("/financeiro/dados-bancarios");

    return {
      success: true,
      banco,
    };
  } catch (error) {
    logger.error("Erro ao criar banco:", error);

    return {
      success: false,
      error: "Erro interno do servidor",
    };
  }
}

export async function updateBanco(codigo: string, data: BancoUpdateInput) {
  try {
    const auth = await requireSuperAdmin();

    if (!auth.success) {
      return auth;
    }

    const banco = await prisma.banco.update({
      where: { codigo },
      data: {
        ...data,
        updatedAt: new Date(),
      },
    });

    revalidatePath("/admin/bancos");
    revalidatePath("/dados-bancarios");
    revalidatePath("/financeiro/dados-bancarios");

    return {
      success: true,
      banco,
    };
  } catch (error) {
    logger.error("Erro ao atualizar banco:", error);

    return {
      success: false,
      error: "Erro interno do servidor",
    };
  }
}

export async function deleteBanco(codigo: string) {
  try {
    const auth = await requireSuperAdmin();

    if (!auth.success) {
      return auth;
    }

    // Verificar se há dados bancários vinculados
    const dadosBancariosCount = await prisma.dadosBancarios.count({
      where: { bancoCodigo: codigo },
    });

    if (dadosBancariosCount > 0) {
      return {
        success: false,
        error: `Não é possível excluir o banco. Existem ${dadosBancariosCount} dados bancários vinculados.`,
      };
    }

    // Soft delete
    await prisma.banco.update({
      where: { codigo },
      data: {
        deletedAt: new Date(),
        ativo: false,
      },
    });

    revalidatePath("/admin/bancos");
    revalidatePath("/dados-bancarios");
    revalidatePath("/financeiro/dados-bancarios");

    return {
      success: true,
    };
  } catch (error) {
    logger.error("Erro ao excluir banco:", error);

    return {
      success: false,
      error: "Erro interno do servidor",
    };
  }
}

export async function toggleBancoStatus(codigo: string) {
  try {
    const auth = await requireSuperAdmin();

    if (!auth.success) {
      return auth;
    }

    const banco = await prisma.banco.findUnique({
      where: { codigo },
    });

    if (!banco) {
      return {
        success: false,
        error: "Banco não encontrado",
      };
    }

    const bancoAtualizado = await prisma.banco.update({
      where: { codigo },
      data: {
        ativo: !banco.ativo,
        updatedAt: new Date(),
      },
    });

    revalidatePath("/admin/bancos");
    revalidatePath("/dados-bancarios");
    revalidatePath("/financeiro/dados-bancarios");

    return {
      success: true,
      banco: bancoAtualizado,
    };
  } catch (error) {
    logger.error("Erro ao alternar status do banco:", error);

    return {
      success: false,
      error: "Erro interno do servidor",
    };
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

export async function getBancosAtivos() {
  try {
    const auth = await requireAuthenticated();

    if (!auth.success) {
      return auth;
    }

    const bancos = await prisma.banco.findMany({
      where: {
        ativo: true,
        deletedAt: null,
      },
      orderBy: { nome: "asc" },
      select: {
        codigo: true,
        nome: true,
        nomeCompleto: true,
      },
    });

    return {
      success: true,
      bancos,
    };
  } catch (error) {
    logger.error("Erro ao buscar bancos ativos:", error);

    return {
      success: false,
      error: "Erro interno do servidor",
    };
  }
}

export async function getDashboardBancos() {
  try {
    const auth = await requireSuperAdmin();

    if (!auth.success) {
      return auth;
    }

    const [totalBancos, bancosAtivos, bancosInativos, bancoMaisUsado] =
      await Promise.all([
        prisma.banco.count({
          where: { deletedAt: null },
        }),
        prisma.banco.count({
          where: { ativo: true, deletedAt: null },
        }),
        prisma.banco.count({
          where: { ativo: false, deletedAt: null },
        }),
        prisma.banco.findFirst({
          where: { deletedAt: null },
          orderBy: {
            dadosBancarios: {
              _count: "desc",
            },
          },
          select: {
            codigo: true,
            nome: true,
            _count: {
              select: {
                dadosBancarios: true,
              },
            },
          },
        }),
      ]);

    return {
      success: true,
      dashboard: {
        totalBancos,
        bancosAtivos,
        bancosInativos,
        bancoMaisUsado,
      },
    };
  } catch (error) {
    logger.error("Erro ao buscar dashboard de bancos:", error);

    return {
      success: false,
      error: "Erro interno do servidor",
    };
  }
}

export async function buscarBancoPorCodigo(codigo: string) {
  try {
    const auth = await requireAuthenticated();

    if (!auth.success) {
      return auth;
    }

    const banco = await prisma.banco.findUnique({
      where: {
        codigo,
        ativo: true,
        deletedAt: null,
      },
      select: {
        codigo: true,
        nome: true,
        nomeCompleto: true,
      },
    });

    return {
      success: true,
      banco,
    };
  } catch (error) {
    logger.error("Erro ao buscar banco por código:", error);

    return {
      success: false,
      error: "Erro interno do servidor",
    };
  }
}

export async function getBancosDisponiveis() {
  try {
    const auth = await requireAuthenticated();

    if (!auth.success) {
      return auth;
    }

    const bancos = await prisma.banco.findMany({
      where: {
        ativo: true,
        deletedAt: null,
      },
      orderBy: { nome: "asc" },
      select: {
        codigo: true,
        nome: true,
        nomeCompleto: true,
      },
    });

    return {
      success: true,
      bancos,
    };
  } catch (error) {
    logger.error("Erro ao buscar bancos disponíveis:", error);

    return {
      success: false,
      error: "Erro interno do servidor",
    };
  }
}
