import { cache } from "react";

import {
  getTenantByDomainWithBranding,
  getTenantBySlugWithBranding,
} from "@/app/lib/tenant";
import {
  extractTenantHintFromHost,
  getTenantHostHints,
  normalizeHost as normalizeTenantHost,
} from "@/lib/tenant-host";

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
  return normalizeTenantHost(host);
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
  return extractTenantHintFromHost(host);
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

      const { slugHint, domainHint } = getTenantHostHints(cleanHost);

      if (slugHint) {
        const bySlug = await getTenantBySlugWithBranding(slugHint.toLowerCase());
        if (bySlug) {
          return mapTenantBranding(bySlug);
        }
      }

      if (domainHint) {
        return mapTenantBranding(
          await getTenantByDomainWithBranding(domainHint),
        );
      }

      return null;
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
