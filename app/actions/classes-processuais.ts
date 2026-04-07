"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/app/lib/auth";
import prisma from "@/app/lib/prisma";
import { buildSoftDeletePayload } from "@/app/lib/soft-delete";
import { CLASSES_PROCESSUAIS_PADRAO } from "@/app/lib/processos/classe-processual-defaults";
import logger from "@/lib/logger";
import { TENANT_PERMISSIONS } from "@/types";

type UserSessionLike = {
  id?: string | null;
  email?: string | null;
  role?: string | null;
  tenantId?: string | null;
  permissions?: string[];
};

export interface ClasseProcessualPayload {
  nome: string;
  slug: string;
  descricao?: string | null;
  ordem?: number;
}

export interface ClasseProcessualUpdatePayload {
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

function canManageClassesProcessuais(user: UserSessionLike) {
  const role = user?.role ?? undefined;
  const permissions = user?.permissions ?? [];

  return (
    role === "SUPER_ADMIN" ||
    role === "ADMIN" ||
    permissions.includes(TENANT_PERMISSIONS.manageOfficeSettings)
  );
}

async function getSessionUser() {
  const session = await getSession();
  if (!session?.user) {
    return null;
  }

  return session.user as UserSessionLike;
}

async function ensureDefaultClassesProcessuaisSeeded() {
  const existing = await prisma.classeProcessual.findMany({
    where: {
      tenantId: null,
      slug: {
        in: CLASSES_PROCESSUAIS_PADRAO.map((item) => item.slug),
      },
    },
    select: {
      id: true,
      slug: true,
      nome: true,
      descricao: true,
      ordem: true,
      ativo: true,
      global: true,
      deletedAt: true,
    },
  });

  const existingBySlug = new Map(existing.map((item) => [item.slug, item]));
  const toCreate = CLASSES_PROCESSUAIS_PADRAO.filter(
    (item) => !existingBySlug.has(item.slug),
  );

  if (toCreate.length > 0) {
    await prisma.classeProcessual.createMany({
      data: toCreate.map((item) => ({
        tenantId: null,
        slug: item.slug,
        nome: item.nome,
        descricao: item.descricao,
        ordem: item.ordem,
        ativo: true,
        global: true,
      })),
      skipDuplicates: true,
    });
  }

  const toRestore = CLASSES_PROCESSUAIS_PADRAO.filter((item) => {
    const existingItem = existingBySlug.get(item.slug);

    if (!existingItem) {
      return false;
    }

    return (
      existingItem.deletedAt !== null ||
      existingItem.ativo !== true ||
      existingItem.global !== true ||
      existingItem.nome !== item.nome ||
      existingItem.descricao !== item.descricao ||
      existingItem.ordem !== item.ordem
    );
  });

  for (const item of toRestore) {
    const existingItem = existingBySlug.get(item.slug);

    if (!existingItem) {
      continue;
    }

    await prisma.classeProcessual.update({
      where: { id: existingItem.id },
      data: {
        nome: item.nome,
        descricao: item.descricao,
        ordem: item.ordem,
        ativo: true,
        global: true,
        deletedAt: null,
        deletedByActorType: null,
        deletedByActorId: null,
        deleteReason: null,
      },
    });
  }
}

function buildMergedClassesProcessuais<T extends {
  id: string;
  tenantId: string | null;
  slug: string;
  nome: string;
  descricao: string | null;
  ordem: number | null;
  ativo: boolean;
  global: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}>(globais: T[], tenantItems: T[]) {
  const tenantBySlug = new Map<string, T>();

  for (const item of tenantItems) {
    tenantBySlug.set(item.slug, item);
  }

  const merged: T[] = [];
  const slugsGlobais = new Set<string>();

  for (const globalItem of globais) {
    slugsGlobais.add(globalItem.slug);
    const override = tenantBySlug.get(globalItem.slug);

    if (!override) {
      merged.push(globalItem);
      continue;
    }

    if (!override.ativo) {
      continue;
    }

    merged.push({
      ...globalItem,
      ...override,
      global: false,
      ativo: true,
    });
  }

  for (const tenantItem of tenantItems) {
    if (!tenantItem.ativo) continue;
    if (slugsGlobais.has(tenantItem.slug)) continue;
    merged.push(tenantItem);
  }

  merged.sort((a, b) => {
    if ((a.ordem ?? 0) !== (b.ordem ?? 0)) {
      return (a.ordem ?? 0) - (b.ordem ?? 0);
    }

    return a.nome.localeCompare(b.nome, "pt-BR");
  });

  return merged;
}

async function refreshClassesProcessuaisPaths() {
  revalidatePath("/configuracoes");
  revalidatePath("/configuracoes/classes-processuais");
  revalidatePath("/processos");
}

export async function listClassesProcessuais(params?: { ativo?: boolean }) {
  try {
    const user = await getSessionUser();

    if (!user?.tenantId) {
      return { success: false, error: "Tenant não encontrado", classes: [] };
    }

    await ensureDefaultClassesProcessuaisSeeded();

    const [globais, tenantItems] = await Promise.all([
      prisma.classeProcessual.findMany({
        where: {
          tenantId: null,
          global: true,
          deletedAt: null,
          ...(params?.ativo !== undefined ? { ativo: params.ativo } : {}),
        },
        orderBy: [{ ordem: "asc" }, { nome: "asc" }],
      }),
      prisma.classeProcessual.findMany({
        where: {
          tenantId: user.tenantId,
          deletedAt: null,
        },
        orderBy: [{ ordem: "asc" }, { nome: "asc" }],
      }),
    ]);

    const classes = buildMergedClassesProcessuais(globais, tenantItems).filter(
      (item) => (params?.ativo === undefined ? true : item.ativo === params.ativo),
    );

    return { success: true, classes };
  } catch (error) {
    logger.error("Erro ao listar classes processuais:", error);

    return {
      success: false,
      error: "Erro ao listar classes processuais",
      classes: [],
    };
  }
}

export async function listarClassesProcessuaisGlobais() {
  try {
    const user = await getSessionUser();

    if (!user?.tenantId) {
      return { success: false, error: "Tenant não encontrado", data: [] };
    }

    await ensureDefaultClassesProcessuaisSeeded();

    const classes = await prisma.classeProcessual.findMany({
      where: {
        tenantId: null,
        global: true,
        deletedAt: null,
      },
      orderBy: [{ ordem: "asc" }, { nome: "asc" }],
    });

    return {
      success: true,
      data: classes,
    };
  } catch (error) {
    logger.error("Erro ao listar classes processuais globais:", error);

    return {
      success: false,
      error: "Erro ao listar classes processuais globais",
      data: [],
    };
  }
}

export async function listClassesProcessuaisConfiguracaoTenant() {
  try {
    const user = await getSessionUser();

    if (!user?.tenantId) {
      return { success: false, error: "Tenant não encontrado", data: [] };
    }

    await ensureDefaultClassesProcessuaisSeeded();

    const classes = await prisma.classeProcessual.findMany({
      where: {
        tenantId: user.tenantId,
        deletedAt: null,
      },
      orderBy: [{ ordem: "asc" }, { nome: "asc" }],
    });

    return {
      success: true,
      data: classes,
    };
  } catch (error) {
    logger.error(
      "Erro ao listar configurações de classes processuais do tenant:",
      error,
    );

    return {
      success: false,
      error: "Erro ao listar configurações do tenant",
      data: [],
    };
  }
}

export async function createClasseProcessual(data: ClasseProcessualPayload) {
  try {
    const user = await getSessionUser();

    if (!user?.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    if (!canManageClassesProcessuais(user)) {
      return {
        success: false,
        error: "Sem permissão para criar classes processuais",
      };
    }

    await ensureDefaultClassesProcessuaisSeeded();

    const nome = sanitizeNome(data.nome || "");
    const slug = sanitizeSlug(data.slug || "");
    const descricao = data.descricao?.trim() || null;

    if (!nome) {
      return { success: false, error: "Nome é obrigatório" };
    }

    if (!slug) {
      return { success: false, error: "Slug é obrigatório" };
    }

    const [globalItems, tenantItems, slugExistente] = await Promise.all([
      prisma.classeProcessual.findMany({
        where: {
          tenantId: null,
          global: true,
          deletedAt: null,
        },
        select: {
          slug: true,
          nome: true,
        },
      }),
      prisma.classeProcessual.findMany({
        where: {
          tenantId: user.tenantId,
          deletedAt: null,
        },
        select: {
          id: true,
          slug: true,
          nome: true,
        },
      }),
      prisma.classeProcessual.findFirst({
        where: {
          tenantId: user.tenantId,
          slug,
          deletedAt: null,
        },
        select: { id: true },
      }),
    ]);

    if (slugExistente) {
      return { success: false, error: "Slug já existe no escritório" };
    }

    if (globalItems.some((item) => item.slug === slug)) {
      return {
        success: false,
        error:
          "Este slug já existe no catálogo padrão. Gerencie a ativação na aba de padrões.",
      };
    }

    const normalizedNome = normalizeNomeCompare(nome);
    const nomeConflitaGlobal = globalItems.some(
      (item) => normalizeNomeCompare(item.nome) === normalizedNome,
    );

    if (nomeConflitaGlobal) {
      return {
        success: false,
        error:
          "Este nome já existe no catálogo padrão. Use outro nome ou ative o padrão correspondente.",
      };
    }

    const nomeConflitaTenant = tenantItems.some(
      (item) => normalizeNomeCompare(item.nome) === normalizedNome,
    );

    if (nomeConflitaTenant) {
      return {
        success: false,
        error: "Já existe uma classe processual com este nome no escritório",
      };
    }

    const classe = await prisma.classeProcessual.create({
      data: {
        tenantId: user.tenantId,
        slug,
        nome,
        descricao,
        ordem: data.ordem ?? 1000,
        ativo: true,
        global: false,
      },
    });

    await refreshClassesProcessuaisPaths();

    return {
      success: true,
      data: classe,
    };
  } catch (error) {
    logger.error("Erro ao criar classe processual:", error);

    return {
      success: false,
      error: "Erro ao criar classe processual",
    };
  }
}

export async function updateClasseProcessual(
  id: string,
  data: ClasseProcessualUpdatePayload,
) {
  try {
    const user = await getSessionUser();

    if (!user?.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    if (!canManageClassesProcessuais(user)) {
      return {
        success: false,
        error: "Sem permissão para editar classes processuais",
      };
    }

    await ensureDefaultClassesProcessuaisSeeded();

    const classeExistente = await prisma.classeProcessual.findFirst({
      where: {
        id,
        tenantId: user.tenantId,
        deletedAt: null,
      },
    });

    if (!classeExistente) {
      return { success: false, error: "Classe processual não encontrada" };
    }

    const globalSlug = await prisma.classeProcessual.findFirst({
      where: {
        tenantId: null,
        global: true,
        slug: classeExistente.slug,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (globalSlug) {
      return {
        success: false,
        error:
          "Esta entrada é uma configuração local de classe padrão. Use a aba de padrões para ativar ou desativar.",
      };
    }

    const updateData: Record<string, unknown> = {};

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

    if (data.ordem !== undefined) {
      updateData.ordem = data.ordem;
    }

    if (data.ativo !== undefined) {
      updateData.ativo = data.ativo;
    }

    const slugParaValidar = String(updateData.slug ?? classeExistente.slug);
    const nomeParaValidar = String(updateData.nome ?? classeExistente.nome);

    const [globalItems, tenantItems, slugExistente] = await Promise.all([
      prisma.classeProcessual.findMany({
        where: {
          tenantId: null,
          global: true,
          deletedAt: null,
        },
        select: {
          slug: true,
          nome: true,
        },
      }),
      prisma.classeProcessual.findMany({
        where: {
          tenantId: user.tenantId,
          id: { not: id },
          deletedAt: null,
        },
        select: {
          slug: true,
          nome: true,
        },
      }),
      prisma.classeProcessual.findFirst({
        where: {
          tenantId: user.tenantId,
          id: { not: id },
          slug: slugParaValidar,
          deletedAt: null,
        },
        select: { id: true },
      }),
    ]);

    if (slugExistente) {
      return { success: false, error: "Slug já existe no escritório" };
    }

    if (globalItems.some((item) => item.slug === slugParaValidar)) {
      return {
        success: false,
        error:
          "Este slug já existe no catálogo padrão. Use outro slug para a classe customizada.",
      };
    }

    const normalizedNome = normalizeNomeCompare(nomeParaValidar);

    if (
      globalItems.some((item) => normalizeNomeCompare(item.nome) === normalizedNome)
    ) {
      return {
        success: false,
        error:
          "Este nome já existe no catálogo padrão. Use outro nome para a classe customizada.",
      };
    }

    if (
      tenantItems.some((item) => normalizeNomeCompare(item.nome) === normalizedNome)
    ) {
      return {
        success: false,
        error: "Já existe uma classe processual com este nome no escritório",
      };
    }

    const classe = await prisma.classeProcessual.update({
      where: { id },
      data: updateData,
    });

    await refreshClassesProcessuaisPaths();

    return { success: true, data: classe };
  } catch (error) {
    logger.error("Erro ao atualizar classe processual:", error);

    return {
      success: false,
      error: "Erro ao atualizar classe processual",
    };
  }
}

export async function deleteClasseProcessual(id: string) {
  try {
    const user = await getSessionUser();

    if (!user?.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    if (!canManageClassesProcessuais(user)) {
      return {
        success: false,
        error: "Sem permissão para excluir classes processuais",
      };
    }

    const classe = await prisma.classeProcessual.findFirst({
      where: {
        id,
        tenantId: user.tenantId,
        deletedAt: null,
      },
    });

    if (!classe) {
      return { success: false, error: "Classe processual não encontrada" };
    }

    const globalSlug = await prisma.classeProcessual.findFirst({
      where: {
        tenantId: null,
        global: true,
        slug: classe.slug,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (globalSlug) {
      return {
        success: false,
        error:
          "Esta entrada controla uma classe padrão. Use a aba de padrões para desativar ou reativar.",
      };
    }

    await prisma.classeProcessual.update({
      where: { id },
      data: buildSoftDeletePayload(
        {
          actorId: user.id ?? null,
          actorType: user.role ?? "USER",
        },
        "Exclusão manual de classe processual",
      ),
    });

    await refreshClassesProcessuaisPaths();

    return { success: true };
  } catch (error) {
    logger.error("Erro ao excluir classe processual:", error);

    return {
      success: false,
      error: "Erro ao excluir classe processual",
    };
  }
}

export async function configurarClassesProcessuaisGlobaisTenant(
  globalId: string,
  ativo: boolean,
) {
  try {
    const user = await getSessionUser();

    if (!user?.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    if (!canManageClassesProcessuais(user)) {
      return {
        success: false,
        error: "Sem permissão para configurar classes processuais",
      };
    }

    await ensureDefaultClassesProcessuaisSeeded();

    const globalItem = await prisma.classeProcessual.findFirst({
      where: {
        id: globalId,
        tenantId: null,
        global: true,
        deletedAt: null,
      },
    });

    if (!globalItem) {
      return { success: false, error: "Classe processual padrão não encontrada" };
    }

    const existingOverride = await prisma.classeProcessual.findFirst({
      where: {
        tenantId: user.tenantId,
        slug: globalItem.slug,
        deletedAt: null,
      },
    });

    if (existingOverride) {
      await prisma.classeProcessual.update({
        where: { id: existingOverride.id },
        data: {
          nome: globalItem.nome,
          descricao: globalItem.descricao,
          ordem: globalItem.ordem,
          ativo,
        },
      });
    } else {
      await prisma.classeProcessual.create({
        data: {
          tenantId: user.tenantId,
          slug: globalItem.slug,
          nome: globalItem.nome,
          descricao: globalItem.descricao,
          ordem: globalItem.ordem,
          ativo,
          global: false,
        },
      });
    }

    await refreshClassesProcessuaisPaths();

    return { success: true };
  } catch (error) {
    logger.error("Erro ao configurar classes processuais globais:", error);

    return {
      success: false,
      error: "Erro ao configurar classes processuais globais",
    };
  }
}
