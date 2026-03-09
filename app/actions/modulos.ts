"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth/next";

import prisma from "@/app/lib/prisma";
import { authOptions } from "@/auth";
import logger from "@/lib/logger";
import { ActionResponse } from "@/types/action-response";

// ==================== TIPOS ====================

export interface ModuloWithStats {
  id: string;
  slug: string;
  nome: string;
  categoriaId: string | null;
  categoriaInfo: {
    id: string;
    nome: string;
    slug: string;
    cor: string | null;
    icone: string | null;
  } | null;
  descricao: string | null;
  icone: string | null;
  ordem: number | null;
  ativo: boolean;
  createdAt: Date;
  updatedAt: Date;
  rotas: Array<{
    id: string;
    rota: string;
    descricao: string | null;
    ativo: boolean;
    createdAt: Date;
    updatedAt: Date;
  }>;
  _count: {
    planos: number;
    rotas: number;
  };
}

export interface ModuloListResponse {
  success: boolean;
  data?: {
    modulos: ModuloWithStats[];
    total: number;
    categorias: Array<{
      id: string;
      nome: string;
      slug: string;
      cor: string | null;
      icone: string | null;
      ativo: boolean;
      totalModulos: number;
    }>;
  };
  error?: string;
}

export interface ModuloDetailResponse {
  success: boolean;
  data?: ModuloWithStats & {
    planos: Array<{
      id: string;
      nome: string;
      slug: string;
      ativo: boolean;
    }>;
    rotas: Array<{
      id: string;
      rota: string;
      descricao: string | null;
      ativo: boolean;
      createdAt: Date;
      updatedAt: Date;
    }>;
  };
  error?: string;
}

export interface ModuloCatalogDiagnosticsResponse {
  success: boolean;
  data?: {
    filesystemModules: number;
    filesystemRoutes: number;
    databaseModules: number;
    databaseRoutes: number;
    activeModules: number;
    activeRoutes: number;
    needsCatalogSync: boolean;
    lastDetection: Date | null;
    cacheStrategy: {
      mode: "dynamic-cache";
      nodeCacheWindowSeconds: number;
      edgeCacheWindowSeconds: number;
    };
    missingInDatabase: string[];
    missingInCode: Array<{
      slug: string;
      planCount: number;
    }>;
    routeDiffs: Array<{
      slug: string;
      missingInDatabase: string[];
      staleInDatabase: string[];
    }>;
  };
  error?: string;
}

function normalizeGroupingName(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function toGroupingSlug(value: string) {
  return normalizeGroupingName(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function requireSuperAdmin() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    throw new Error("Não autorizado");
  }

  const user = session.user as any;

  if (user.role !== "SUPER_ADMIN") {
    throw new Error("Acesso negado");
  }

  return user;
}

// ==================== LISTAR MÓDULOS ====================

export async function listModulos(params?: {
  search?: string;
  categoria?: string;
  ativo?: boolean;
  limit?: number;
  offset?: number;
}): Promise<ModuloListResponse> {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;

    if (user.role !== "SUPER_ADMIN") {
      return { success: false, error: "Acesso negado" };
    }

    const { search, categoria, ativo, limit = 50, offset = 0 } = params || {};

    const where: any = {};

    if (search) {
      where.OR = [
        { nome: { contains: search, mode: "insensitive" } },
        { slug: { contains: search, mode: "insensitive" } },
        { descricao: { contains: search, mode: "insensitive" } },
      ];
    }

    if (categoria) {
      where.categoriaId = categoria;
    }

    if (ativo !== undefined) {
      where.ativo = ativo;
    }

    const [rawModulos, total, categorias] = await Promise.all([
      prisma.modulo.findMany({
        where,
        include: {
          categoria: {
            select: {
              id: true,
              nome: true,
              slug: true,
              cor: true,
              icone: true,
            },
          },
          rotas: {
            select: {
              id: true,
              rota: true,
              descricao: true,
              ativo: true,
              createdAt: true,
              updatedAt: true,
            },
            orderBy: { rota: "asc" },
          },
          _count: {
            select: {
              planoModulos: true,
              rotas: true,
            },
          },
        },
        orderBy: [{ ordem: "asc" }, { nome: "asc" }],
        take: limit,
        skip: offset,
      }),
      prisma.modulo.count({ where }),
      prisma.moduloCategoria.findMany({
        select: {
          id: true,
          nome: true,
          slug: true,
          cor: true,
          icone: true,
          ativo: true,
          _count: {
            select: {
              modulos: true,
            },
          },
        },
        orderBy: [{ ordem: "asc" }, { nome: "asc" }],
      }),
    ]);

    const modulos: ModuloWithStats[] = rawModulos.map((modulo) => ({
      id: modulo.id,
      slug: modulo.slug,
      nome: modulo.nome,
      descricao: modulo.descricao,
      categoriaId: modulo.categoriaId,
      categoriaInfo: modulo.categoria
        ? {
            id: modulo.categoria.id,
            nome: modulo.categoria.nome,
            slug: modulo.categoria.slug,
            cor: modulo.categoria.cor,
            icone: modulo.categoria.icone,
          }
        : null,
      icone: modulo.icone,
      ordem: modulo.ordem,
      ativo: modulo.ativo,
      createdAt: modulo.createdAt,
      updatedAt: modulo.updatedAt,
      rotas: modulo.rotas.map((rota) => ({
        id: rota.id,
        rota: rota.rota,
        descricao: rota.descricao,
        ativo: rota.ativo,
        createdAt: rota.createdAt,
        updatedAt: rota.updatedAt,
      })),
      _count: {
        planos: modulo._count.planoModulos,
        rotas: modulo._count.rotas,
      },
    }));

    return {
      success: true,
      data: {
        modulos,
        total,
        categorias: categorias.map((categoria) => ({
          id: categoria.id,
          nome: categoria.nome,
          slug: categoria.slug,
          cor: categoria.cor,
          icone: categoria.icone,
          ativo: categoria.ativo,
          totalModulos: categoria._count.modulos,
        })),
      },
    };
  } catch (error) {
    logger.error("Erro ao listar módulos:", error);

    return { success: false, error: "Erro interno do servidor" };
  }
}

// ==================== OBTER MÓDULO ====================

export async function getModulo(id: string): Promise<ModuloDetailResponse> {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;

    if (user.role !== "SUPER_ADMIN") {
      return { success: false, error: "Acesso negado" };
    }

    const modulo = await prisma.modulo.findUnique({
      where: { id },
      include: {
        categoria: {
          select: {
            id: true,
            nome: true,
            slug: true,
            cor: true,
            icone: true,
          },
        },
        _count: {
          select: {
            planoModulos: true,
            rotas: true,
          },
        },
        planoModulos: {
          select: {
            plano: {
              select: {
                id: true,
                nome: true,
                slug: true,
                ativo: true,
              },
            },
          },
        },
        rotas: {
          select: {
            id: true,
            rota: true,
            descricao: true,
            ativo: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { rota: "asc" },
        },
      },
    });

    if (!modulo) {
      return { success: false, error: "Módulo não encontrado" };
    }

    return {
      success: true,
      data: {
        id: modulo.id,
        slug: modulo.slug,
        nome: modulo.nome,
        descricao: modulo.descricao,
        categoriaId: modulo.categoriaId,
        categoriaInfo: modulo.categoria,
        icone: modulo.icone,
        ordem: modulo.ordem,
        ativo: modulo.ativo,
        createdAt: modulo.createdAt,
        updatedAt: modulo.updatedAt,
        planos: modulo.planoModulos.map((pm) => pm.plano),
        rotas: modulo.rotas.map((rota) => ({
          id: rota.id,
          rota: rota.rota,
          descricao: rota.descricao,
          ativo: rota.ativo,
          createdAt: rota.createdAt,
          updatedAt: rota.updatedAt,
        })),
        _count: {
          planos: modulo._count.planoModulos,
          rotas: modulo._count.rotas,
        },
      },
    };
  } catch (error) {
    logger.error("Erro ao obter módulo:", error);

    return { success: false, error: "Erro interno do servidor" };
  }
}

// ==================== ATUALIZAR CATEGORIA ====================

export async function updateModuloCategoria(
  moduloId: string,
  categoriaId: string | null,
): Promise<ActionResponse<{ success: boolean }>> {
  try {
    await requireSuperAdmin();

    // Verificar se o módulo existe
    const modulo = await prisma.modulo.findUnique({
      where: { id: moduloId },
    });

    if (!modulo) {
      return { success: false, error: "Módulo não encontrado" };
    }

    // Se categoriaId for fornecido, verificar se a categoria existe
    if (categoriaId) {
      const categoria = await prisma.moduloCategoria.findUnique({
        where: { id: categoriaId },
      });

      if (!categoria) {
        return { success: false, error: "Categoria não encontrada" };
      }
    }

    // Atualizar a categoria do módulo
    await prisma.modulo.update({
      where: { id: moduloId },
      data: { categoriaId },
    });

    revalidatePath("/admin/modulos");
    revalidatePath("/admin/planos");

    logger.info(
      `Categoria do módulo ${modulo.slug} atualizada para ${categoriaId || "sem categoria"}`,
    );

    return {
      success: true,
      data: { success: true },
    };
  } catch (error: any) {
    logger.error("Erro ao atualizar categoria do módulo:", error);

    return { success: false, error: "Erro interno do servidor" };
  }
}

export async function updateModuloGrouping(
  moduloId: string,
  groupingName: string | null,
): Promise<
  ActionResponse<{
    success: boolean;
    categoriaId: string | null;
    categoriaNome: string | null;
  }>
> {
  try {
    const user = await requireSuperAdmin();

    const modulo = await prisma.modulo.findUnique({
      where: { id: moduloId },
      select: { id: true, slug: true },
    });

    if (!modulo) {
      return { success: false, error: "Módulo não encontrado" };
    }

    const normalizedName = normalizeGroupingName(groupingName ?? "");

    if (!normalizedName) {
      await prisma.modulo.update({
        where: { id: moduloId },
        data: { categoriaId: null },
      });

      revalidatePath("/admin/modulos");
      revalidatePath("/admin/planos");

      logger.info(
        `Agrupamento removido do módulo ${modulo.slug} por ${user.email}`,
      );

      return {
        success: true,
        data: {
          success: true,
          categoriaId: null,
          categoriaNome: null,
        },
      };
    }

    const slug = toGroupingSlug(normalizedName);

    const existingCategory = await prisma.moduloCategoria.findFirst({
      where: {
        OR: [
          { slug },
          { nome: { equals: normalizedName, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        nome: true,
      },
    });

    let categoriaId = existingCategory?.id ?? null;
    let categoriaNome = existingCategory?.nome ?? normalizedName;

    if (!existingCategory) {
      const highestOrder = await prisma.moduloCategoria.findFirst({
        orderBy: { ordem: "desc" },
        select: { ordem: true },
      });

      const createdCategory = await prisma.moduloCategoria.create({
        data: {
          slug,
          nome: normalizedName,
          ordem: (highestOrder?.ordem ?? 0) + 1,
          ativo: true,
        },
        select: {
          id: true,
          nome: true,
        },
      });

      categoriaId = createdCategory.id;
      categoriaNome = createdCategory.nome;
    }

    await prisma.modulo.update({
      where: { id: moduloId },
      data: { categoriaId },
    });

    revalidatePath("/admin/modulos");
    revalidatePath("/admin/planos");

    logger.info(
      `Agrupamento do módulo ${modulo.slug} atualizado para ${categoriaNome} por ${user.email}`,
    );

    return {
      success: true,
      data: {
        success: true,
        categoriaId,
        categoriaNome,
      },
    };
  } catch (error) {
    logger.error("Erro ao atualizar agrupamento do módulo:", error);

    return { success: false, error: "Erro interno do servidor" };
  }
}

// ==================== CRIAR MÓDULO ====================

export async function getDashboardModulos(): Promise<{
  success: boolean;
  data?: {
    total: number;
    ativos: number;
    inativos: number;
    categorias: number;
    agrupamentosEmUso: number;
    totalRotas: number;
    maisUsados: Array<{
      id: string;
      nome: string;
      slug: string;
      count: number;
    }>;
  };
  error?: string;
}> {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;

    if (user.role !== "SUPER_ADMIN") {
      return { success: false, error: "Acesso negado" };
    }

    const [total, ativos, inativos, categorias, totalRotas, maisUsados] =
      await Promise.all([
        prisma.modulo.count(),
        prisma.modulo.count({ where: { ativo: true } }),
        prisma.modulo.count({ where: { ativo: false } }),
        prisma.moduloCategoria.count(),
        prisma.moduloRota.count({ where: { ativo: true } }),
        prisma.modulo.findMany({
          select: {
            id: true,
            nome: true,
            slug: true,
            _count: {
              select: {
                planoModulos: true,
              },
            },
          },
          orderBy: {
            planoModulos: {
              _count: "desc",
            },
          },
          take: 5,
        }),
      ]);

    const agrupamentosEmUso = await prisma.moduloCategoria.count({
      where: {
        modulos: {
          some: {},
        },
      },
    });

    return {
      success: true,
      data: {
        total,
        ativos,
        inativos,
        categorias,
        agrupamentosEmUso,
        totalRotas,
        maisUsados: maisUsados.map((m) => ({
          id: m.id,
          nome: m.nome,
          slug: m.slug,
          count: m._count.planoModulos,
        })),
      },
    };
  } catch (error) {
    logger.error("Erro ao obter dashboard de módulos:", error);

    return { success: false, error: "Erro interno do servidor" };
  }
}

export async function getModuloCatalogDiagnostics(): Promise<ModuloCatalogDiagnosticsResponse> {
  try {
    await requireSuperAdmin();

    const [{ scanProtectedModules }, latestDetection, databaseModules] =
      await Promise.all([
        import("@/lib/module-detection-core"),
        prisma.moduleDetectionLog.findFirst({
          orderBy: { detectedAt: "desc" },
          select: {
            detectedAt: true,
            filesystemHash: true,
          },
        }),
        prisma.modulo.findMany({
          select: {
            slug: true,
            ativo: true,
            rotas: {
              where: { ativo: true },
              select: { rota: true },
            },
            _count: {
              select: {
                planoModulos: true,
              },
            },
          },
          orderBy: { slug: "asc" },
        }),
      ]);

    const filesystem = await scanProtectedModules();
    const filesystemBySlug = new Map(
      filesystem.detectedModules.map((module) => [module.slug, module]),
    );
    const databaseBySlug = new Map(
      databaseModules.map((module) => [module.slug, module]),
    );

    const missingInDatabase = filesystem.detectedModules
      .filter((module) => !databaseBySlug.has(module.slug))
      .map((module) => module.slug);

    const missingInCode = databaseModules
      .filter((module) => !filesystemBySlug.has(module.slug))
      .map((module) => ({
        slug: module.slug,
        planCount: module._count.planoModulos,
      }));

    const routeDiffs = filesystem.detectedModules
      .map((module) => {
        const databaseModule = databaseBySlug.get(module.slug);

        if (!databaseModule) {
          return null;
        }

        const databaseRoutes = new Set(
          databaseModule.rotas.map((route) => route.rota),
        );
        const filesystemRoutes = new Set(module.rotas);
        const missingDatabaseRoutes = module.rotas.filter(
          (route) => !databaseRoutes.has(route),
        );
        const staleDatabaseRoutes = databaseModule.rotas
          .map((route) => route.rota)
          .filter((route) => !filesystemRoutes.has(route));

        if (
          missingDatabaseRoutes.length === 0 &&
          staleDatabaseRoutes.length === 0
        ) {
          return null;
        }

        return {
          slug: module.slug,
          missingInDatabase: missingDatabaseRoutes,
          staleInDatabase: staleDatabaseRoutes,
        };
      })
      .filter(
        (
          item,
        ): item is NonNullable<
          ModuloCatalogDiagnosticsResponse["data"]
        >["routeDiffs"][number] => Boolean(item),
      );

    const activeModules = databaseModules.filter(
      (module) => module.ativo,
    ).length;
    const activeRoutes = databaseModules.reduce((total, module) => {
      if (!module.ativo) {
        return total;
      }

      return total + module.rotas.length;
    }, 0);

    return {
      success: true,
      data: {
        filesystemModules: filesystem.detectedModules.length,
        filesystemRoutes: filesystem.totalRoutes,
        databaseModules: databaseModules.length,
        databaseRoutes: databaseModules.reduce(
          (total, module) => total + module.rotas.length,
          0,
        ),
        activeModules,
        activeRoutes,
        needsCatalogSync:
          !latestDetection ||
          latestDetection.filesystemHash !== filesystem.filesystemHash,
        lastDetection: latestDetection?.detectedAt ?? null,
        cacheStrategy: {
          mode: "dynamic-cache",
          nodeCacheWindowSeconds: 300,
          edgeCacheWindowSeconds: 60,
        },
        missingInDatabase,
        missingInCode,
        routeDiffs,
      },
    };
  } catch (error) {
    logger.error("Erro ao montar diagnóstico do catálogo de módulos:", error);

    return { success: false, error: "Erro interno do servidor" };
  }
}
