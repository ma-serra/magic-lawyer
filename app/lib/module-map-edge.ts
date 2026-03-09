// ==================== EDGE RUNTIME MODULE MAP ====================
// Busca o mapeamento de rotas a partir da API interna (dinâmica)

import { moduleRequiredForPath } from "./module-route-matcher";

type ModuleRouteMap = Record<string, string[]>;

type ModuleMapCache = {
  data: ModuleRouteMap;
  timestamp: number;
};

let moduleMapCache: ModuleMapCache | null = null;
const CACHE_DURATION = 60 * 1000; // 1 minuto
const MODULE_MAP_ENDPOINT = "/api/internal/module-map";
const AUTH_HEADER = "x-internal-token";

function resolveOrigin(origin?: string): string {
  if (origin) {
    return origin;
  }

  const envOrigin = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL;

  if (envOrigin) {
    return envOrigin.startsWith("http") ? envOrigin : `https://${envOrigin}`;
  }

  throw new Error(
    "Não foi possível determinar a origem para buscar o module map",
  );
}

async function fetchModuleMapFromApi(origin?: string): Promise<ModuleRouteMap> {
  const resolvedOrigin = resolveOrigin(origin);
  const url = new URL(MODULE_MAP_ENDPOINT, resolvedOrigin);

  const headers: Record<string, string> = { "cache-control": "no-store" };
  const token = process.env.MODULE_MAP_API_TOKEN;

  if (token) {
    headers[AUTH_HEADER] = token;
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    headers,
    cache: "no-store",
    next: { revalidate: 0 },
  });

  if (!response.ok) {
    throw new Error(`Falha ao buscar module map (status ${response.status})`);
  }

  const payload = await response.json();

  if (!payload?.success) {
    throw new Error(payload?.error || "Resposta inválida ao buscar module map");
  }

  return (payload.data ?? {}) as ModuleRouteMap;
}

export async function getModuleRouteMapEdge(
  origin?: string,
): Promise<ModuleRouteMap> {
  const now = Date.now();

  if (moduleMapCache && now - moduleMapCache.timestamp < CACHE_DURATION) {
    return moduleMapCache.data;
  }

  try {
    const data = await fetchModuleMapFromApi(origin);

    moduleMapCache = { data, timestamp: now };

    return data;
  } catch (error) {
    console.error("⚠️  Erro ao atualizar module map para Edge:", error);

    if (moduleMapCache) {
      return moduleMapCache.data;
    }

    return {};
  }
}

export async function getDefaultModulesEdge(
  origin?: string,
): Promise<string[]> {
  const moduleMap = await getModuleRouteMapEdge(origin);

  return Object.keys(moduleMap);
}

export async function moduleRequiredForRouteEdge(
  pathname: string,
  origin?: string,
): Promise<string | null> {
  const moduleMap = await getModuleRouteMapEdge(origin);

  return moduleRequiredForPath(moduleMap, pathname);
}

export async function isRouteAllowedByModulesEdge(
  pathname: string,
  modules: string[] | undefined,
  origin?: string,
): Promise<boolean> {
  if (!modules || modules.includes("*")) {
    return true;
  }

  const requiredModule = await moduleRequiredForRouteEdge(pathname, origin);

  if (!requiredModule) {
    return true;
  }

  return modules.includes(requiredModule);
}

export function clearModuleMapCacheEdge(): void {
  moduleMapCache = null;
}
