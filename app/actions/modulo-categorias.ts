"use server";

import { getServerSession } from "next-auth/next";
import { revalidatePath } from "next/cache";

import prisma from "@/app/lib/prisma";
import { authOptions } from "@/auth";

// ==================== TIPOS ====================

export interface ModuloCategoriaCreateInput {
  nome: string;
  slug: string;
  descricao?: string;
  icone?: string;
  cor?: string;
  ordem?: number;
}

export interface ModuloCategoriaUpdateInput {
  nome?: string;
  slug?: string;
  descricao?: string;
  icone?: string;
  cor?: string;
  ordem?: number;
  ativo?: boolean;
}

export interface ModuloCategoriaWithStats {
  id: string;
  slug: string;
  nome: string;
  descricao: string | null;
  icone: string | null;
  cor: string | null;
  ordem: number;
  ativo: boolean;
  createdAt: Date;
  updatedAt: Date;
  _count: {
    modulos: number;
  };
}

export interface ModuloCategoriaListResponse {
  success: boolean;
  data?: {
    categorias: ModuloCategoriaWithStats[];
    total: number;
  };
  error?: string;
}

// ==================== LISTAR CATEGORIAS ====================

export async function listModuloCategorias(params?: {
  search?: string;
  ativo?: boolean;
  limit?: number;
  offset?: number;
}): Promise<ModuloCategoriaListResponse> {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const where: any = {};

    if (params?.search) {
      where.OR = [
        { nome: { contains: params.search, mode: "insensitive" } },
        { slug: { contains: params.search, mode: "insensitive" } },
        { descricao: { contains: params.search, mode: "insensitive" } },
      ];
    }

    if (params?.ativo !== undefined) {
      where.ativo = params.ativo;
    }

    const [categorias, total] = await Promise.all([
      prisma.moduloCategoria.findMany({
        where,
        include: {
          _count: {
            select: {
              modulos: true,
            },
          },
        },
        orderBy: [{ ordem: "asc" }, { nome: "asc" }],
        take: params?.limit || 100,
        skip: params?.offset || 0,
      }),
      prisma.moduloCategoria.count({ where }),
    ]);

    return {
      success: true,
      data: {
        categorias,
        total,
      },
    };
  } catch (error) {
    console.error("Erro ao listar categorias de módulos:", error);

    return {
      success: false,
      error: "Erro interno do servidor",
    };
  }
}

// ==================== BUSCAR CATEGORIA ====================

export async function getModuloCategoria(id: string) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const categoria = await prisma.moduloCategoria.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            modulos: true,
          },
        },
      },
    });

    if (!categoria) {
      return { success: false, error: "Categoria não encontrada" };
    }

    return {
      success: true,
      data: categoria,
    };
  } catch (error) {
    console.error("Erro ao buscar categoria:", error);

    return {
      success: false,
      error: "Erro interno do servidor",
    };
  }
}

// ==================== CRIAR CATEGORIA ====================

export async function createModuloCategoria(
  data: ModuloCategoriaCreateInput,
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    // Validações
    if (!data.nome?.trim()) {
      return { success: false, error: "Nome é obrigatório" };
    }

    if (!data.slug?.trim()) {
      return { success: false, error: "Slug é obrigatório" };
    }

    // Verificar se slug já existe
    const slugExistente = await prisma.moduloCategoria.findUnique({
      where: { slug: data.slug.trim() },
    });

    if (slugExistente) {
      return { success: false, error: "Slug já existe" };
    }

    const categoria = await prisma.moduloCategoria.create({
      data: {
        nome: data.nome.trim(),
        slug: data.slug.trim(),
        descricao: data.descricao?.trim(),
        icone: typeof data.icone === "string" ? data.icone.trim() : data.icone,
        cor: data.cor || "#3B82F6",
        ordem: data.ordem || 0,
        ativo: true,
      },
    });

    revalidatePath("/admin/modulos");
    revalidatePath("/admin/modulos/categorias");

    return {
      success: true,
      data: categoria,
    };
  } catch (error) {
    console.error("Erro ao criar categoria:", error);

    return {
      success: false,
      error: "Erro interno do servidor",
    };
  }
}

// ==================== ATUALIZAR CATEGORIA ====================

export async function updateModuloCategoria(
  id: string,
  data: ModuloCategoriaUpdateInput,
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    // Verificar se categoria existe
    const categoriaExistente = await prisma.moduloCategoria.findUnique({
      where: { id },
    });

    if (!categoriaExistente) {
      return { success: false, error: "Categoria não encontrada" };
    }

    // Se está alterando o slug, verificar se não existe outro com o mesmo slug
    if (data.slug && data.slug !== categoriaExistente.slug) {
      const slugExistente = await prisma.moduloCategoria.findUnique({
        where: { slug: data.slug.trim() },
      });

      if (slugExistente) {
        return { success: false, error: "Slug já existe" };
      }
    }

    const categoria = await prisma.moduloCategoria.update({
      where: { id },
      data: {
        ...(data.nome && { nome: data.nome.trim() }),
        ...(data.slug && { slug: data.slug.trim() }),
        ...(data.descricao !== undefined && {
          descricao: data.descricao?.trim(),
        }),
        ...(data.icone !== undefined && {
          icone:
            typeof data.icone === "string" ? data.icone.trim() : data.icone,
        }),
        ...(data.cor && { cor: data.cor }),
        ...(data.ordem !== undefined && { ordem: data.ordem }),
        ...(data.ativo !== undefined && { ativo: data.ativo }),
      },
    });

    revalidatePath("/admin/modulos");
    revalidatePath("/admin/modulos/categorias");

    return {
      success: true,
      data: categoria,
    };
  } catch (error) {
    console.error("Erro ao atualizar categoria:", error);

    return {
      success: false,
      error: "Erro interno do servidor",
    };
  }
}

// ==================== EXCLUIR CATEGORIA ====================

export async function deleteModuloCategoria(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    // Verificar se categoria existe
    const categoria = await prisma.moduloCategoria.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            modulos: true,
          },
        },
      },
    });

    if (!categoria) {
      return { success: false, error: "Categoria não encontrada" };
    }

    // Verificar se há módulos usando esta categoria
    if (categoria._count.modulos > 0) {
      return {
        success: false,
        error: `Não é possível excluir esta categoria pois ela está sendo usada por ${categoria._count.modulos} módulo(s). Primeiro mova os módulos para outra categoria.`,
      };
    }

    await prisma.moduloCategoria.update({
      where: { id },
      data: {
        ativo: false,
      },
    });

    revalidatePath("/admin/modulos");
    revalidatePath("/admin/modulos/categorias");

    return { success: true };
  } catch (error) {
    console.error("Erro ao excluir categoria:", error);

    return {
      success: false,
      error: "Erro interno do servidor",
    };
  }
}

// ==================== ALTERAR STATUS ====================

export async function toggleModuloCategoriaStatus(
  id: string,
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const categoria = await prisma.moduloCategoria.findUnique({
      where: { id },
    });

    if (!categoria) {
      return { success: false, error: "Categoria não encontrada" };
    }

    const categoriaAtualizada = await prisma.moduloCategoria.update({
      where: { id },
      data: { ativo: !categoria.ativo },
    });

    revalidatePath("/admin/modulos");
    revalidatePath("/admin/modulos/categorias");

    return {
      success: true,
      data: categoriaAtualizada,
    };
  } catch (error) {
    console.error("Erro ao alterar status da categoria:", error);

    return {
      success: false,
      error: "Erro interno do servidor",
    };
  }
}

// ==================== DASHBOARD ====================

export async function getDashboardModuloCategorias() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const [total, ativos, inativos] = await Promise.all([
      prisma.moduloCategoria.count(),
      prisma.moduloCategoria.count({ where: { ativo: true } }),
      prisma.moduloCategoria.count({ where: { ativo: false } }),
    ]);

    return {
      success: true,
      data: {
        total,
        ativos,
        inativos,
      },
    };
  } catch (error) {
    console.error("Erro ao buscar dashboard de categorias:", error);

    return {
      success: false,
      error: "Erro interno do servidor",
    };
  }
}
