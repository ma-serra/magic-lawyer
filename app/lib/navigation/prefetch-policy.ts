export type AuthenticatedNavPrefetchStrategy = "viewport" | "intent" | "none";

const VIEWPORT_PREFETCH_ROUTES = new Set(["/dashboard", "/admin/dashboard"]);
const NO_PREFETCH_ROUTE_PREFIXES = [
  "/inpi",
  "/portal-advogado",
  "/suporte",
  "/admin/suporte",
  "/relatorios",
  "/admin/relatorios",
  "/documentos",
];

export function normalizeNavigationHref(href: string) {
  const [pathOnly] = href.split("#", 1);
  const [withoutQuery] = pathOnly.split("?", 1);
  const withLeadingSlash = withoutQuery.startsWith("/") ? withoutQuery : `/${withoutQuery}`;
  const normalized = withLeadingSlash.replace(/\/+$/, "");

  return normalized || "/";
}

function matchesRoutePrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function getAuthenticatedNavPrefetchStrategy(
  href: string,
): AuthenticatedNavPrefetchStrategy {
  const normalizedHref = normalizeNavigationHref(href);

  if (VIEWPORT_PREFETCH_ROUTES.has(normalizedHref)) {
    return "viewport";
  }

  if (NO_PREFETCH_ROUTE_PREFIXES.some((prefix) => matchesRoutePrefix(normalizedHref, prefix))) {
    return "none";
  }

  return "intent";
}
