import { DefaultSession } from "next-auth";

type SessionImpersonationState = {
  active: boolean;
  startedAt: string;
  superAdminId: string;
  superAdminEmail: string;
  superAdminName?: string | null;
  targetUserId: string;
  targetUserEmail: string;
  targetUserName?: string | null;
  targetUserRole: string;
  targetTenantId: string;
  targetTenantSlug?: string | null;
  targetTenantName?: string | null;
};

declare module "next-auth" {
  interface Session {
    user: {
      id?: string;
      tenantId?: string;
      role?: string;
      tenantSlug?: string;
      tenantName?: string;
      tenantLogoUrl?: string;
      tenantFaviconUrl?: string;
      advogadoId?: string;
      impersonation?: SessionImpersonationState | null;
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    tenantId: string;
    role: string;
    tenantSlug?: string;
    tenantName?: string;
    tenantLogoUrl?: string;
    tenantFaviconUrl?: string;
    advogadoId?: string;
    impersonation?: SessionImpersonationState | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    tenantId?: string;
    role?: string;
    tenantSlug?: string;
    tenantName?: string;
    tenantLogoUrl?: string;
    tenantFaviconUrl?: string;
    advogadoId?: string;
    impersonation?: SessionImpersonationState | null;
  }
}
