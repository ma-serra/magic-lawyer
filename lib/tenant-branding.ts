import { cache } from "react";

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

function isPlatformHostWithoutTenant(cleanHost: string): boolean {
  if (!cleanHost) {
    return true;
  }

  return (
    cleanHost === "localhost" ||
    cleanHost === "127.0.0.1" ||
    cleanHost === "magiclawyer.vercel.app" ||
    cleanHost === "www.magiclawyer.com.br" ||
    cleanHost === "magiclawyer.com.br" ||
    (cleanHost.endsWith(".vercel.app") &&
      cleanHost.split(".").length <= 3 &&
      cleanHost.includes("magiclawyer"))
  );
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

  if (
    cleanHost.endsWith(".vercel.app") &&
    cleanHost.split(".").length >= 4 &&
    cleanHost.includes("magiclawyer")
  ) {
    return cleanHost.split(".")[0] ?? null;
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

function mapTenantBranding(
  tenant:
    | Awaited<ReturnType<typeof getTenantByDomainWithBranding>>
    | Awaited<ReturnType<typeof getTenantBySlugWithBranding>>,
): TenantBrandingData | null {
  if (!tenant) {
    return null;
  }

  return {
    name: tenant.name ?? null,
    logoUrl: tenant.branding?.logoUrl ?? null,
    faviconUrl: tenant.branding?.faviconUrl ?? null,
    primaryColor: tenant.branding?.primaryColor ?? null,
    secondaryColor: tenant.branding?.secondaryColor ?? null,
    accentColor: tenant.branding?.accentColor ?? null,
    loginBackgroundUrl: tenant.branding?.loginBackgroundUrl ?? null,
  };
}

const getTenantBrandingByNormalizedHost = cache(
  async (cleanHost: string): Promise<TenantBrandingData | null> => {
    try {
      if (!cleanHost || isPlatformHostWithoutTenant(cleanHost)) {
        return null;
      }

      const tenantSlug = extractTenantFromHost(cleanHost);

      if (
        tenantSlug &&
        (cleanHost.endsWith(".localhost") ||
          cleanHost.endsWith(".magiclawyer.vercel.app") ||
          cleanHost.endsWith(".magiclawyer.com.br") ||
          (cleanHost.endsWith(".vercel.app") && cleanHost.split(".").length >= 4))
      ) {
        return mapTenantBranding(
          await getTenantBySlugWithBranding(tenantSlug.toLowerCase()),
        );
      }

      return mapTenantBranding(await getTenantByDomainWithBranding(cleanHost));
    } catch (error) {
      console.error("[tenant-branding] Erro ao buscar branding:", error);
      return null;
    }
  },
);

export async function getTenantBrandingByHost(
  host: string,
): Promise<TenantBrandingData | null> {
  return getTenantBrandingByNormalizedHost(normalizeHost(host));
}
