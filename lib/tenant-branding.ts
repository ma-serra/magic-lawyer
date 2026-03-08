import {
  getTenantByDomainWithBranding,
  getTenantBySlugWithBranding,
} from "@/app/lib/tenant";

export type TenantBrandingData = {
  name: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  accentColor: string | null;
  loginBackgroundUrl: string | null;
};

export function normalizeHost(host: string): string {
  if (!host) {
    return "";
  }

  return host.split(":")[0]?.toLowerCase() ?? "";
}

export function extractTenantFromHost(host: string): string | null {
  const cleanHost = normalizeHost(host);

  if (!cleanHost) {
    return null;
  }

  if (cleanHost.endsWith(".localhost")) {
    const subdomain = cleanHost.replace(".localhost", "");
    if (subdomain) {
      return subdomain;
    }
  }

  if (cleanHost.endsWith(".magiclawyer.vercel.app")) {
    const subdomain = cleanHost.replace(".magiclawyer.vercel.app", "");
    if (subdomain && subdomain !== "magiclawyer") {
      return subdomain;
    }
  }

  if (cleanHost.endsWith(".magiclawyer.com.br")) {
    const subdomain = cleanHost.replace(".magiclawyer.com.br", "");
    if (subdomain) {
      return subdomain;
    }
  }

  if (
    !cleanHost.includes("magiclawyer") &&
    !cleanHost.includes("vercel.app") &&
    !cleanHost.includes("localhost")
  ) {
    return cleanHost;
  }

  return null;
}

export async function getTenantBrandingByHost(host: string): Promise<TenantBrandingData | null> {
  try {
    const cleanHost = normalizeHost(host);
    const tenantSlug = extractTenantFromHost(cleanHost);

    if (cleanHost) {
      const tenantByDomain = await getTenantByDomainWithBranding(cleanHost);
      if (tenantByDomain) {
        return {
          name: tenantByDomain.name ?? null,
          logoUrl: tenantByDomain.branding?.logoUrl ?? null,
          faviconUrl: tenantByDomain.branding?.faviconUrl ?? null,
          primaryColor: tenantByDomain.branding?.primaryColor ?? null,
          secondaryColor: tenantByDomain.branding?.secondaryColor ?? null,
          accentColor: tenantByDomain.branding?.accentColor ?? null,
          loginBackgroundUrl: tenantByDomain.branding?.loginBackgroundUrl ?? null,
        };
      }
    }

    if (tenantSlug) {
      const tenantBySlug = await getTenantBySlugWithBranding(
        tenantSlug.toLowerCase(),
      );

      if (tenantBySlug) {
        return {
          name: tenantBySlug.name ?? null,
          logoUrl: tenantBySlug.branding?.logoUrl ?? null,
          faviconUrl: tenantBySlug.branding?.faviconUrl ?? null,
          primaryColor: tenantBySlug.branding?.primaryColor ?? null,
          secondaryColor: tenantBySlug.branding?.secondaryColor ?? null,
          accentColor: tenantBySlug.branding?.accentColor ?? null,
          loginBackgroundUrl: tenantBySlug.branding?.loginBackgroundUrl ?? null,
        };
      }
    }

    return null;
  } catch (error) {
    console.error("[tenant-branding] Erro ao buscar branding:", error);
    return null;
  }
}
