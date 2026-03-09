// ==================== DYNAMIC MODULE MAP ====================
// Este arquivo agora é 100% dinâmico baseado no banco de dados
// NÃO EDITE MANUALMENTE - Use a interface de administração

import prisma from "./prisma";
import { moduleRequiredForPath } from "./module-route-matcher";

// Cache para performance
let moduleMapCache: Record<string, string[]> | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos

export async function getModuleRouteMap(): Promise<Record<string, string[]>> {
  const now = Date.now();

  // Verificar se o cache ainda é válido
  if (moduleMapCache && now - cacheTimestamp < CACHE_DURATION) {
    return moduleMapCache;
  }

  try {
    // Buscar módulos ativos e suas rotas do banco
    const modulos = await prisma.modulo.findMany({
      where: { ativo: true },
      include: {
        rotas: {
          where: { ativo: true },
          select: { rota: true },
        },
      },
      orderBy: { ordem: "asc" },
    });

    // Construir o mapa de rotas
    const moduleMap: Record<string, string[]> = {};

    for (const modulo of modulos) {
      moduleMap[modulo.slug] = modulo.rotas.map((r: any) => r.rota);
    }

    // Atualizar cache
    moduleMapCache = moduleMap;
    cacheTimestamp = now;

    return moduleMap;
  } catch (error) {
    console.error("Erro ao buscar módulos do banco:", error);

    // Retornar cache antigo se disponível
    return moduleMapCache || {};
  }
}

export async function getDefaultModules(): Promise<string[]> {
  const moduleMap = await getModuleRouteMap();

  return Object.keys(moduleMap);
}

export async function isRouteAllowedByModules(
  pathname: string,
  modules?: string[],
) {
  if (!modules || modules.includes("*")) {
    return true;
  }

  const normalizedPath = pathname.replace(/\/$/, "");

  const requiredModule = await moduleRequiredForRoute(normalizedPath);

  if (!requiredModule) {
    return true;
  }

  return modules.includes(requiredModule);
}

export async function moduleRequiredForRoute(
  pathname: string,
): Promise<string | null> {
  try {
    const moduleMap = await getModuleRouteMap();

    return moduleRequiredForPath(moduleMap, pathname);
  } catch (error) {
    console.error("Erro ao verificar módulo necessário para rota:", error);

    return null;
  }
}

// Função para limpar o cache (útil após atualizações)
export function clearModuleMapCache(): void {
  moduleMapCache = null;
  cacheTimestamp = 0;
}
