export type TenantHostHints = {
  cleanHost: string;
  slugHint: string | null;
  domainHint: string | null;
};

export function normalizeHost(host: string): string {
  if (!host) {
    return "";
  }

  return host.split(":")[0]?.trim().toLowerCase() ?? "";
}

export function normalizeTenantDomainInput(domain: string): string {
  const raw = domain.trim().toLowerCase();
  if (!raw) {
    return "";
  }

  const candidate = raw.startsWith("http://") || raw.startsWith("https://")
    ? raw
    : `https://${raw}`;

  try {
    const parsed = new URL(candidate);
    return normalizeHost(parsed.host);
  } catch {
    return normalizeHost(
      raw
        .replace(/^https?:\/\//, "")
        .split("/")[0]
        .split("?")[0]
        .split("#")[0],
    );
  }
}

function getVercelTenantPrefix(): string {
  return process.env.TENANT_VERCEL_SLUG_PREFIX?.trim().toLowerCase() ?? "";
}

export function getTenantDefaultDomainTemplate(): string {
  return (
    process.env.TENANT_DEFAULT_DOMAIN_TEMPLATE?.trim() || "{slug}.vercel.app"
  );
}

function isKnownPlatformHost(cleanHost: string): boolean {
  return (
    cleanHost === "localhost" ||
    cleanHost === "127.0.0.1" ||
    cleanHost === "magiclawyer.vercel.app" ||
    cleanHost === "www.magiclawyer.com.br" ||
    cleanHost === "magiclawyer.com.br"
  );
}

export function getTenantHostHints(host: string): TenantHostHints {
  const cleanHost = normalizeHost(host);

  if (!cleanHost || isKnownPlatformHost(cleanHost)) {
    return {
      cleanHost,
      slugHint: null,
      domainHint: null,
    };
  }

  if (cleanHost.endsWith(".localhost")) {
    const subdomain = cleanHost.replace(".localhost", "").trim();

    return {
      cleanHost,
      slugHint: subdomain || null,
      domainHint: null,
    };
  }

  if (cleanHost.endsWith(".magiclawyer.vercel.app")) {
    const subdomain = cleanHost.replace(".magiclawyer.vercel.app", "").trim();

    return {
      cleanHost,
      slugHint: subdomain && subdomain !== "magiclawyer" ? subdomain : null,
      domainHint: null,
    };
  }

  if (cleanHost.endsWith(".magiclawyer.com.br")) {
    const subdomain = cleanHost.replace(".magiclawyer.com.br", "").trim();

    return {
      cleanHost,
      slugHint: subdomain || null,
      domainHint: null,
    };
  }

  if (cleanHost.endsWith(".vercel.app")) {
    const parts = cleanHost.split(".");
    const firstLabel = parts[0]?.trim() ?? "";

    if (parts.length > 3) {
      return {
        cleanHost,
        slugHint: firstLabel || null,
        domainHint: null,
      };
    }

    if (parts.length === 3) {
      const prefix = getVercelTenantPrefix();

      if (prefix && firstLabel.startsWith(prefix)) {
        const slugFromPrefix = firstLabel.slice(prefix.length).trim();

        return {
          cleanHost,
          slugHint: slugFromPrefix || null,
          domainHint: cleanHost,
        };
      }

      return {
        cleanHost,
        slugHint: null,
        domainHint: cleanHost,
      };
    }
  }

  return {
    cleanHost,
    slugHint: null,
    domainHint: cleanHost,
  };
}

export function extractTenantHintFromHost(host: string): string | null {
  const { slugHint, domainHint } = getTenantHostHints(host);
  return slugHint || domainHint || null;
}

export function buildDefaultTenantDomainBySlug(slug: string): string {
  const normalizedSlug = slug.trim().toLowerCase();
  if (!normalizedSlug) {
    return "";
  }

  return getTenantDefaultDomainTemplate().replace(/\{slug\}/gi, normalizedSlug);
}
