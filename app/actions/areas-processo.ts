"use server";

import { getSession } from "@/app/lib/auth";
import { AREAS_PROCESSO_PADRAO } from "@/app/lib/processos/area-processo-defaults";
import prisma from "@/app/lib/prisma";
import { buildSoftDeletePayload } from "@/app/lib/soft-delete";
import logger from "@/lib/logger";
import { TENANT_PERMISSIONS } from "@/types";

export interface AreaProcessoCreatePayload {
  nome: string;
  slug: string;
  descricao?: string | null;
  ordem?: number;
}

export interface AreaProcessoUpdatePayload {
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

function canManageAreasProcesso(user: any) {
  const role = user?.role as string | undefined;
  const permissions = (user?.permissions ?? []) as string[];

  return (
    role === "SUPER_ADMIN" ||
    role === "ADMIN" ||
    permissions.includes(TENANT_PERMISSIONS.manageOfficeSettings)
  );
}

async function ensureDefaultAreasProcessoSeeded(tenantId: string) {
  const existing = await prisma.areaProcesso.findMany({
    where: {
      tenantId,
      slug: {
        in: AREAS_PROCESSO_PADRAO.map((item) => item.slug),
      },
    },
    select: {
      id: true,
      slug: true,
      nome: true,
      descricao: true,
      ordem: true,
      ativo: true,
      deletedAt: true,
    },
  });

  const existingBySlug = new Map(existing.map((item) => [item.slug, item]));
  const toCreate = AREAS_PROCESSO_PADRAO.filter(
    (item) => !existingBySlug.has(item.slug),
  );

  if (toCreate.length > 0) {
    await prisma.areaProcesso.createMany({
      data: toCreate.map((item) => ({
        tenantId,
        slug: item.slug,
        nome: item.nome,
        descricao: item.descricao,
        ordem: item.ordem,
        ativo: true,
      })),
      skipDuplicates: true,
    });
  }

  for (const item of AREAS_PROCESSO_PADRAO) {
    const existingItem = existingBySlug.get(item.slug);

    if (!existingItem) {
      continue;
    }

    const data: Record<string, unknown> = {};

    if (existingItem.deletedAt !== null || existingItem.ativo !== true) {
      data.nome = item.nome;
      data.descricao = item.descricao;
      data.ordem = item.ordem;
      data.ativo = true;
      data.deletedAt = null;
      data.deletedByActorType = null;
      data.deletedByActorId = null;
      data.deleteReason = null;
    } else {
      if (!existingItem.nome?.trim()) {
        data.nome = item.nome;
      }

      if (!existingItem.descricao?.trim()) {
        data.descricao = item.descricao;
      }

      if (existingItem.ordem == null) {
        data.ordem = item.ordem;
      }
    }

    if (Object.keys(data).length === 0) {
      continue;
    }

    await prisma.areaProcesso.update({
      where: { id: existingItem.id },
      data,
    });
  }
}

export async function listAreasProcesso(params?: { ativo?: boolean }) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;

    if (!user.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    await ensureDefaultAreasProcessoSeeded(user.tenantId);

    const where: any = {
      tenantId: user.tenantId,
      deletedAt: null,
    };

    if (params?.ativo !== undefined) {
      where.ativo = params.ativo;
    }

    const areas = await prisma.areaProcesso.findMany({
      where,
      include: {
        _count: {
          select: {
            processos: {
              where: {
                deletedAt: null,
              },
            },
          },
        },
      },
      orderBy: [{ ordem: "asc" }, { nome: "asc" }],
    });

    return { success: true, areas };
  } catch (error) {
    logger.error("Erro ao listar áreas de processo:", error);

    return { success: false, error: "Erro ao listar áreas de processo" };
  }
}

export async function getAreaProcesso(id: string) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;

    const area = await prisma.areaProcesso.findFirst({
      where: {
        id,
        tenantId: user.tenantId,
        deletedAt: null,
      },
      include: {
        _count: {
          select: {
            processos: {
              where: {
                deletedAt: null,
              },
            },
          },
        },
      },
    });

    if (!area) {
      return { success: false, error: "Área não encontrada" };
    }

    return { success: true, area };
  } catch (error) {
    logger.error("Erro ao buscar área de processo:", error);

    return { success: false, error: "Erro ao buscar área de processo" };
  }
}

export async function createAreaProcesso(data: AreaProcessoCreatePayload) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;

    if (!user.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    if (!canManageAreasProcesso(user)) {
      return {
        success: false,
        error: "Sem permissão para criar áreas de processo",
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

    const [slugExistente, nomesTenant] = await Promise.all([
      prisma.areaProcesso.findFirst({
        where: {
          tenantId: user.tenantId,
          slug,
          deletedAt: null,
        },
        select: { id: true },
      }),
      prisma.areaProcesso.findMany({
        where: {
          tenantId: user.tenantId,
          deletedAt: null,
        },
        select: { nome: true },
      }),
    ]);

    if (slugExistente) {
      return { success: false, error: "Slug já existe no escritório" };
    }

    const nomeExistente = nomesTenant.some(
      (item) => normalizeNomeCompare(item.nome) === normalizeNomeCompare(nome),
    );

    if (nomeExistente) {
      return { success: false, error: "Já existe uma área com este nome" };
    }

    const area = await prisma.areaProcesso.create({
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
      `Área de processo criada: ${area.id} por usuário ${user.email}`,
    );

    return { success: true, area };
  } catch (error) {
    logger.error("Erro ao criar área de processo:", error);

    return { success: false, error: "Erro ao criar área de processo" };
  }
}

export async function updateAreaProcesso(
  id: string,
  data: AreaProcessoUpdatePayload,
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

    if (!canManageAreasProcesso(user)) {
      return {
        success: false,
        error: "Sem permissão para editar áreas de processo",
      };
    }

    const areaExistente = await prisma.areaProcesso.findFirst({
      where: {
        id,
        tenantId: user.tenantId,
        deletedAt: null,
      },
    });

    if (!areaExistente) {
      return { success: false, error: "Área não encontrada" };
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

    const nomeParaValidar = updateData.nome ?? areaExistente.nome;
    const slugParaValidar = updateData.slug ?? areaExistente.slug;

    const [slugExistente, nomesTenant, processosVinculados] = await Promise.all([
      prisma.areaProcesso.findFirst({
        where: {
          tenantId: user.tenantId,
          slug: slugParaValidar,
          id: { not: id },
          deletedAt: null,
        },
        select: { id: true },
      }),
      prisma.areaProcesso.findMany({
        where: {
          tenantId: user.tenantId,
          id: { not: id },
          deletedAt: null,
        },
        select: { nome: true },
      }),
      updateData.ativo === false
        ? prisma.processo.count({
            where: {
              tenantId: user.tenantId,
              areaId: id,
              deletedAt: null,
            },
          })
        : Promise.resolve(0),
    ]);

    if (slugExistente) {
      return { success: false, error: "Slug já existe no escritório" };
    }

    const nomeExistente = nomesTenant.some(
      (item) =>
        normalizeNomeCompare(item.nome) === normalizeNomeCompare(nomeParaValidar),
    );

    if (nomeExistente) {
      return { success: false, error: "Já existe uma área com este nome" };
    }

    if (updateData.ativo === false && processosVinculados > 0) {
      return {
        success: false,
        error: `Não é possível desativar. Existem ${processosVinculados} processo(s) ativo(s) vinculado(s) a esta área.`,
      };
    }

    const area = await prisma.areaProcesso.update({
      where: { id },
      data: updateData,
    });

    logger.info(`Área de processo atualizada: ${id} por usuário ${user.email}`);

    return { success: true, area };
  } catch (error) {
    logger.error("Erro ao atualizar área de processo:", error);

    return { success: false, error: "Erro ao atualizar área de processo" };
  }
}

export async function deleteAreaProcesso(id: string) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;

    if (!user.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    if (!canManageAreasProcesso(user)) {
      return {
        success: false,
        error: "Sem permissão para excluir áreas de processo",
      };
    }

    const area = await prisma.areaProcesso.findFirst({
      where: {
        id,
        tenantId: user.tenantId,
        deletedAt: null,
      },
      include: {
        _count: {
          select: {
            processos: {
              where: {
                deletedAt: null,
              },
            },
          },
        },
      },
    });

    if (!area) {
      return { success: false, error: "Área não encontrada" };
    }

    if (area._count.processos > 0) {
      return {
        success: false,
        error: `Não é possível excluir. Existem ${area._count.processos} processo(s) vinculado(s) a esta área.`,
      };
    }

    await prisma.areaProcesso.update({
      where: { id },
      data: buildSoftDeletePayload(
        {
          actorId: user.id ?? null,
          actorType: user.role ?? "USER",
        },
        "Exclusão manual de área de processo",
      ),
    });

    logger.info(`Área de processo deletada: ${id} por usuário ${user.email}`);

    return { success: true };
  } catch (error) {
    logger.error("Erro ao deletar área de processo:", error);

    return { success: false, error: "Erro ao deletar área de processo" };
  }
}
