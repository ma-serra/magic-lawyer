"use server";

import { getSession } from "@/app/lib/auth";
import prisma from "@/app/lib/prisma";
import logger from "@/lib/logger";
import { TENANT_PERMISSIONS } from "@/types";

export interface TipoContratoCreatePayload {
  nome: string;
  slug: string;
  descricao?: string | null;
  ordem?: number;
}

export interface TipoContratoUpdatePayload {
  nome?: string;
  slug?: string;
  descricao?: string | null;
  ordem?: number;
  ativo?: boolean;
}

function sanitizeNome(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function sanitizeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeNomeCompare(value: string) {
  return sanitizeNome(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function canManageTiposContrato(user: any) {
  const role = user?.role as string | undefined;
  const permissions = (user?.permissions ?? []) as string[];

  return (
    role === "SUPER_ADMIN" ||
    role === "ADMIN" ||
    permissions.includes(TENANT_PERMISSIONS.manageOfficeSettings)
  );
}

export async function listTiposContrato(params?: { ativo?: boolean }) {
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
      OR: [{ tenantId: user.tenantId }, { tenantId: null }],
    };

    if (params?.ativo !== undefined) {
      where.ativo = params.ativo;
    }

    const tiposRaw = await prisma.tipoContrato.findMany({
      where,
      include: {
        _count: {
          select: {
            contratos: {
              where: {
                deletedAt: null,
              },
            },
            modelos: true,
          },
        },
      },
      orderBy: [{ ordem: "asc" }, { nome: "asc" }],
    });

    const isSuperAdmin = user.role === "SUPER_ADMIN";
    const tipos = tiposRaw.map((tipo) => {
      const isGlobal = tipo.tenantId === null;
      const canEdit = !isGlobal || isSuperAdmin;

      return {
        ...tipo,
        isGlobal,
        canEdit,
        canDelete: canEdit,
      };
    });

    return { success: true, tipos };
  } catch (error) {
    logger.error("Erro ao listar tipos de contrato:", error);

    return { success: false, error: "Erro ao listar tipos de contrato" };
  }
}

export async function getTipoContrato(id: string) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;
    if (!user.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    const tipo = await prisma.tipoContrato.findFirst({
      where: {
        id,
        OR: [{ tenantId: user.tenantId }, { tenantId: null }],
      },
      include: {
        _count: {
          select: {
            contratos: {
              where: {
                deletedAt: null,
              },
            },
            modelos: true,
          },
        },
      },
    });

    if (!tipo) {
      return { success: false, error: "Tipo não encontrado" };
    }

    return {
      success: true,
      tipo: {
        ...tipo,
        isGlobal: tipo.tenantId === null,
      },
    };
  } catch (error) {
    logger.error("Erro ao buscar tipo de contrato:", error);

    return { success: false, error: "Erro ao buscar tipo de contrato" };
  }
}

export async function createTipoContrato(data: TipoContratoCreatePayload) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;

    if (!user.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    if (!canManageTiposContrato(user)) {
      return {
        success: false,
        error: "Sem permissão para criar tipos de contrato",
      };
    }

    const nome = sanitizeNome(data.nome || "");
    const slug = sanitizeSlug(data.slug || "");
    const descricao = data.descricao?.trim() || null;

    if (!nome) {
      return { success: false, error: "Nome é obrigatório" };
    }

    if (!slug) {
      return { success: false, error: "Slug é obrigatório" };
    }

    const [slugExistente, nomeExistenteTenant, nomeGlobal] = await Promise.all([
      prisma.tipoContrato.findFirst({
        where: {
          tenantId: user.tenantId,
          slug,
        },
        select: { id: true },
      }),
      prisma.tipoContrato.findFirst({
        where: {
          tenantId: user.tenantId,
          nome,
        },
        select: { id: true },
      }),
      prisma.tipoContrato.findMany({
        where: {
          tenantId: null,
        },
        select: { nome: true },
      }),
    ]);

    if (slugExistente) {
      return { success: false, error: "Slug já existe no seu escritório" };
    }

    if (nomeExistenteTenant) {
      return { success: false, error: "Já existe um tipo com este nome" };
    }

    const conflitaComGlobal = nomeGlobal.some(
      (item) => normalizeNomeCompare(item.nome) === normalizeNomeCompare(nome),
    );

    if (conflitaComGlobal) {
      return {
        success: false,
        error:
          "Este nome já existe no catálogo global. Crie um nome customizado diferente.",
      };
    }

    const tipo = await prisma.tipoContrato.create({
      data: {
        nome,
        slug,
        descricao,
        ordem: data.ordem,
        ativo: true,
        tenantId: user.tenantId,
      },
    });

    logger.info(
      `Tipo de contrato criado: ${tipo.id} por usuário ${user.email}`,
    );

    return { success: true, tipo };
  } catch (error) {
    logger.error("Erro ao criar tipo de contrato:", error);

    return { success: false, error: "Erro ao criar tipo de contrato" };
  }
}

export async function updateTipoContrato(
  id: string,
  data: TipoContratoUpdatePayload,
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

    if (!canManageTiposContrato(user)) {
      return {
        success: false,
        error: "Sem permissão para editar tipos de contrato",
      };
    }

    const tipoExistente = await prisma.tipoContrato.findFirst({
      where: {
        id,
        tenantId: user.tenantId,
      },
    });

    if (!tipoExistente) {
      return { success: false, error: "Tipo não encontrado" };
    }

    const updateData: any = {};

    if (data.nome !== undefined) {
      const nome = sanitizeNome(data.nome);
      if (!nome) {
        return { success: false, error: "Nome é obrigatório" };
      }
      updateData.nome = nome;
    }

    if (data.slug !== undefined) {
      const slug = sanitizeSlug(data.slug);
      if (!slug) {
        return { success: false, error: "Slug é obrigatório" };
      }
      updateData.slug = slug;
    }

    if (data.descricao !== undefined) {
      updateData.descricao = data.descricao?.trim() || null;
    }

    if (data.ordem !== undefined) updateData.ordem = data.ordem;
    if (data.ativo !== undefined) updateData.ativo = data.ativo;

    const nomeParaValidar = updateData.nome ?? tipoExistente.nome;
    const slugParaValidar = updateData.slug ?? tipoExistente.slug;

    const [slugExistente, nomeExistenteTenant, globais] = await Promise.all([
      prisma.tipoContrato.findFirst({
        where: {
          tenantId: user.tenantId,
          slug: slugParaValidar,
          id: { not: id },
        },
        select: { id: true },
      }),
      prisma.tipoContrato.findFirst({
        where: {
          tenantId: user.tenantId,
          nome: nomeParaValidar,
          id: { not: id },
        },
        select: { id: true },
      }),
      prisma.tipoContrato.findMany({
        where: { tenantId: null },
        select: { nome: true },
      }),
    ]);

    if (slugExistente) {
      return { success: false, error: "Slug já existe no seu escritório" };
    }

    if (nomeExistenteTenant) {
      return { success: false, error: "Já existe um tipo com este nome" };
    }

    const conflitaComGlobal = globais.some(
      (item) =>
        normalizeNomeCompare(item.nome) === normalizeNomeCompare(nomeParaValidar),
    );

    if (conflitaComGlobal) {
      return {
        success: false,
        error:
          "Este nome já existe no catálogo global. Use um nome customizado diferente.",
      };
    }

    const tipo = await prisma.tipoContrato.update({
      where: { id },
      data: updateData,
    });

    logger.info(`Tipo de contrato atualizado: ${id} por usuário ${user.email}`);

    return { success: true, tipo };
  } catch (error) {
    logger.error("Erro ao atualizar tipo de contrato:", error);

    return { success: false, error: "Erro ao atualizar tipo de contrato" };
  }
}

export async function deleteTipoContrato(id: string) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;

    if (!user.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    if (!canManageTiposContrato(user)) {
      return {
        success: false,
        error: "Sem permissão para excluir tipos de contrato",
      };
    }

    const tipo = await prisma.tipoContrato.findFirst({
      where: {
        id,
        tenantId: user.tenantId,
      },
      include: {
        _count: {
          select: {
            contratos: {
              where: {
                deletedAt: null,
              },
            },
            modelos: true,
          },
        },
      },
    });

    if (!tipo) {
      return { success: false, error: "Tipo não encontrado" };
    }

    const totalVinculados = tipo._count.contratos + tipo._count.modelos;

    if (totalVinculados > 0) {
      return {
        success: false,
        error: `Não é possível excluir. Existem ${tipo._count.contratos} contrato(s) e ${tipo._count.modelos} modelo(s) vinculado(s) a este tipo.`,
      };
    }

    await prisma.tipoContrato.delete({
      where: { id },
    });

    logger.info(`Tipo de contrato deletado: ${id} por usuário ${user.email}`);

    return { success: true };
  } catch (error) {
    logger.error("Erro ao deletar tipo de contrato:", error);

    return { success: false, error: "Erro ao deletar tipo de contrato" };
  }
}
