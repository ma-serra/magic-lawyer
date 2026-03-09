"use server";

import { getServerSession } from "next-auth/next";

import prisma from "@/app/lib/prisma";
import { authOptions } from "@/auth";
import logger from "@/lib/logger";

// ==================== SINCRONIZAR MODULE MAP ====================

export async function syncModuleMap(): Promise<{
  success: boolean;
  data?: {
    totalModules: number;
    totalRoutes: number;
    generatedFile: string;
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

    // Buscar TODOS os módulos ativos do banco (100% dinâmico)
    const modulos = await prisma.modulo.findMany({
      where: {
        ativo: true,
      },
      include: {
        rotas: {
          where: { ativo: true },
          select: { rota: true },
        },
      },
      orderBy: { ordem: "asc" },
    });

    // Gerar o conteúdo do arquivo
    // Sistema agora é 100% dinâmico - não precisa gerar arquivo estático

    const totalModules = modulos.length;
    const totalRoutes = modulos.reduce(
      (acc, modulo) => acc + modulo.rotas.length,
      0,
    );

    // Limpar cache do module-map dinâmico
    try {
      const [{ clearModuleMapCache }, { clearModuleMapCacheEdge }] =
        await Promise.all([
          import("../lib/module-map"),
          import("../lib/module-map-edge"),
        ]);

      clearModuleMapCache();
      clearModuleMapCacheEdge();
    } catch (error) {
      console.warn("Erro ao limpar cache do module-map:", error);
    }

    // Cache do Edge Runtime será atualizado automaticamente via revalidação
    // O fallback estático no module-map-edge.ts garante funcionamento

    logger.info(
      `Module map sincronizado: ${totalModules} módulos, ${totalRoutes} rotas por usuário ${user.email}`,
    );

    return {
      success: true,
      data: {
        totalModules,
        totalRoutes,
        generatedFile: "sistema-dinamico",
      },
    };
  } catch (error) {
    logger.error("Erro ao sincronizar module map:", error);

    return { success: false, error: "Erro interno do servidor" };
  }
}

// ==================== GERAR CONTEÚDO DO ARQUIVO ====================

function generateModuleMapFile(modulos: any[]): string {
  const timestamp = new Date().toISOString();

  let content = `// ==================== AUTO-GENERATED FILE ====================\n`;

  content += `// Este arquivo é gerado automaticamente pelo sistema de administração\n`;
  content += `// Última atualização: ${timestamp}\n`;
  content += `// NÃO EDITE MANUALMENTE - Use a interface de administração\n\n`;

  content += `export const MODULE_ROUTE_MAP: Record<string, string[]> = {\n`;

  // Gerar o mapeamento
  modulos.forEach((modulo, index) => {
    const routes = modulo.rotas.map((r: any) => `"${r.rota}"`).join(", ");

    content += `  "${modulo.slug}": [${routes}],\n`;
  });

  content += `};\n\n`;

  // DEFAULT_MODULES agora é uma função assíncrona getDefaultModules()

  // Função isRouteAllowedByModules
  content += `export function isRouteAllowedByModules(pathname: string, modules?: string[]) {\n`;
  content += `  console.log("[module-map] Verificando acesso à rota:", {\n`;
  content += `    pathname,\n`;
  content += `    modules,\n`;
  content += `    hasModules: !!modules,\n`;
  content += `    hasWildcard: modules?.includes("*"),\n`;
  content += `  });\n\n`;
  content += `  if (!modules || modules.includes("*")) {\n`;
  content += `    console.log("[module-map] Acesso liberado - sem módulos ou wildcard");\n`;
  content += `    return true;\n`;
  content += `  }\n\n`;
  content += `  const normalizedPath = pathname.replace(/\\/$/, "");\n\n`;
  content += `  // Verificar se a rota está mapeada para algum módulo\n`;
  content += `  const requiredModule = moduleRequiredForRoute(normalizedPath);\n\n`;
  content += `  console.log("[module-map] Módulo necessário para rota:", {\n`;
  content += `    pathname: normalizedPath,\n`;
  content += `    requiredModule,\n`;
  content += `  });\n\n`;
  content += `  // Se a rota não está mapeada para nenhum módulo, liberar acesso\n`;
  content += `  if (!requiredModule) {\n`;
  content += `    console.log("[module-map] Rota não mapeada - acesso liberado");\n`;
  content += `    return true;\n`;
  content += `  }\n\n`;
  content += `  // Se a rota está mapeada, verificar se o usuário tem o módulo necessário\n`;
  content += `  const hasModule = modules.includes(requiredModule);\n`;
  content += `  console.log("[module-map] Verificação final:", {\n`;
  content += `    requiredModule,\n`;
  content += `    hasModule,\n`;
  content += `    modules,\n`;
  content += `  });\n\n`;
  content += `  return hasModule;\n`;
  content += `}\n\n`;

  // Função moduleRequiredForRoute
  content += `export function moduleRequiredForRoute(pathname: string): string | null {\n`;
  content += `  const normalizedPath = pathname.replace(/\\/$/, "");\n\n`;
  content += `  console.log("[module-map] Buscando módulo para rota:", {\n`;
  content += `    pathname,\n`;
  content += `    normalizedPath,\n`;
  content += `  });\n\n`;
  content += `  for (const [module, routes] of Object.entries(MODULE_ROUTE_MAP)) {\n`;
  content += `    const matches = routes.some((route) => normalizedPath.startsWith(route));\n`;
  content += `    console.log("[module-map] Verificando módulo:", {\n`;
  content += `      module,\n`;
  content += `      routes,\n`;
  content += `      matches,\n`;
  content += `    });\n\n`;
  content += `    if (matches) {\n`;
  content += `      console.log("[module-map] Módulo encontrado:", module);\n`;
  content += `      return module;\n`;
  content += `    }\n`;
  content += `  }\n\n`;
  content += `  console.log("[module-map] Nenhum módulo encontrado para rota:", normalizedPath);\n`;
  content += `  return null;\n`;
  content += `}\n`;

  return content;
}

// ==================== VERIFICAR STATUS DA SINCRONIZAÇÃO ====================

export async function getModuleMapStatus(): Promise<{
  success: boolean;
  data?: {
    lastSync: Date | null;
    totalModules: number;
    totalRoutes: number;
    needsSync: boolean;
    mode: "dynamic-cache";
    nodeCacheWindowSeconds: number;
    edgeCacheWindowSeconds: number;
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

    // Buscar estatísticas dos módulos
    const [totalModules, totalRoutes] = await Promise.all([
      prisma.modulo.count({ where: { ativo: true } }),
      prisma.moduloRota.count({ where: { ativo: true } }),
    ]);

    // Buscar última sincronização do banco de dados
    const lastSyncLog = await prisma.moduleDetectionLog.findFirst({
      orderBy: { detectedAt: "desc" },
      select: { detectedAt: true },
    });

    const lastSync: Date | null = lastSyncLog?.detectedAt || null;

    return {
      success: true,
      data: {
        lastSync,
        totalModules,
        totalRoutes,
        needsSync: false,
        mode: "dynamic-cache",
        nodeCacheWindowSeconds: 300,
        edgeCacheWindowSeconds: 60,
      },
    };
  } catch (error) {
    logger.error("Erro ao verificar status do module map:", error);

    return { success: false, error: "Erro interno do servidor" };
  }
}

// ==================== FORÇAR SINCRONIZAÇÃO ====================

export async function forceSyncModuleMap(): Promise<{
  success: boolean;
  data?: any;
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

    // Forçar sincronização
    const result = await syncModuleMap();

    if (result.success) {
      logger.info(`Module map forçado a sincronizar por usuário ${user.email}`);
    }

    return result;
  } catch (error) {
    logger.error("Erro ao forçar sincronização do module map:", error);

    return { success: false, error: "Erro interno do servidor" };
  }
}
