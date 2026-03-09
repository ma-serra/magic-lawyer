export type ModuleRouteMap = Record<string, string[]>;

function ensureLeadingSlash(value: string) {
  return value.startsWith("/") ? value : `/${value}`;
}

export function normalizeModulePath(pathname: string) {
  const basePath = pathname.split("?")[0]?.split("#")[0] ?? pathname;
  const normalized = ensureLeadingSlash(basePath.trim());

  if (normalized.length > 1 && normalized.endsWith("/")) {
    return normalized.slice(0, -1);
  }

  return normalized;
}

export function isModuleRouteMatch(pathname: string, route: string) {
  const normalizedPath = normalizeModulePath(pathname);
  const normalizedRoute = normalizeModulePath(route);

  return (
    normalizedPath === normalizedRoute ||
    normalizedPath.startsWith(`${normalizedRoute}/`)
  );
}

export function moduleRequiredForPath(
  moduleMap: ModuleRouteMap,
  pathname: string,
): string | null {
  const normalizedPath = normalizeModulePath(pathname);

  const orderedRoutes = Object.entries(moduleMap)
    .flatMap(([module, routes]) =>
      routes.map((route) => ({
        module,
        route: normalizeModulePath(route),
      })),
    )
    .sort((left, right) => right.route.length - left.route.length);

  const match = orderedRoutes.find(({ route }) =>
    isModuleRouteMatch(normalizedPath, route),
  );

  return match?.module ?? null;
}
