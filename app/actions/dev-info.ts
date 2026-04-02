"use server";

import { execSync } from "child_process";

import { getSession } from "@/app/lib/auth";
import { canCurrentUserAccessDevWorkbench } from "@/app/lib/dev-workbench-access";
import prisma from "@/app/lib/prisma";
import { getOnlinePresenceSnapshot } from "@/app/lib/realtime/session-presence";
import { buildDefaultTenantDomainBySlug } from "@/lib/tenant-host";

interface DevViewerInfo {
  isAuthenticated: boolean;
  role: string | null;
  email: string | null;
  tenantId: string | null;
  tenantSlug: string | null;
  canViewUsers: boolean;
  canViewOnline: boolean;
  canImpersonate: boolean;
  impersonationActive: boolean;
  impersonationTargetEmail: string | null;
}

interface DevTenantInfo {
  id: string;
  slug: string;
  name: string;
  domain: string | null;
  status: string;
  localUrl: string;
  productionUrl: string | null;
  totalUsers: number | null;
  onlineUsersNow: number | null;
}

interface DevUserInfo {
  id: string;
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  localUrl: string;
  productionUrl: string | null;
  onlineNow: boolean;
  lastSeenAt: string | null;
  locationLabel: string | null;
  isSupportSession: boolean;
  supportActorEmail: string | null;
}

interface DevInfo {
  ngrok: string;
  tenants: DevTenantInfo[];
  users: DevUserInfo[];
  onlineUsers: DevUserInfo[];
  dashboard: string;
  appLocalUrl: string;
  appProductionUrl: string;
  viewer: DevViewerInfo;
  timestamp: string;
}

function buildDisplayName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  email: string | null | undefined,
) {
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();

  return fullName || email || "Usuario sem nome";
}

function readNgrokUrl() {
  try {
    const result = execSync("curl -s http://localhost:4040/api/tunnels", {
      encoding: "utf8",
      timeout: 2000,
    });
    const tunnels = JSON.parse(result);

    if (tunnels.tunnels && tunnels.tunnels.length > 0) {
      return tunnels.tunnels[0].public_url as string;
    }
  } catch {
    console.log("ngrok nao disponivel");
  }

  return "";
}

function buildLocalTenantUrl(slug: string) {
  if (slug === "global") {
    return "http://localhost:9192";
  }

  return `http://${slug}.localhost:9192`;
}

function buildProductionTenantUrl(slug: string, domain: string | null) {
  if (slug === "global") {
    return "https://magiclawyer.com.br";
  }

  const normalizedDomain = domain?.trim() || buildDefaultTenantDomainBySlug(slug);

  if (!normalizedDomain) {
    return null;
  }

  return `https://${normalizedDomain}`;
}

function emptyDevInfo(viewer?: Partial<DevViewerInfo>): DevInfo {
  return {
    ngrok: "",
    tenants: [],
    users: [],
    onlineUsers: [],
    dashboard: "http://localhost:4040",
    appLocalUrl: "http://localhost:9192",
    appProductionUrl: "https://magiclawyer.com.br",
    viewer: {
      isAuthenticated: false,
      role: null,
      email: null,
      tenantId: null,
      tenantSlug: null,
      canViewUsers: false,
      canViewOnline: false,
      canImpersonate: false,
      impersonationActive: false,
      impersonationTargetEmail: null,
      ...viewer,
    },
    timestamp: new Date().toISOString(),
  };
}

export async function getDevInfo(): Promise<DevInfo> {
  const workbenchEnabled =
    process.env.NODE_ENV === "development"
      ? true
      : await canCurrentUserAccessDevWorkbench();

  if (!workbenchEnabled) {
    return emptyDevInfo();
  }

  try {
    const session = await getSession();
    const sessionUser = (session?.user as Record<string, unknown> | undefined) ?? {};
    const impersonation =
      (sessionUser.impersonation as
        | {
            active?: boolean;
            targetUserEmail?: string | null;
          }
        | undefined) ?? null;

    const canViewPrivilegedData = workbenchEnabled;

    const viewer: DevViewerInfo = {
      isAuthenticated: Boolean(session?.user),
      role:
        typeof session?.user?.role === "string" ? session.user.role : null,
      email: typeof session?.user?.email === "string" ? session.user.email : null,
      tenantId:
        typeof sessionUser.tenantId === "string" ? sessionUser.tenantId : null,
      tenantSlug:
        typeof sessionUser.tenantSlug === "string"
          ? sessionUser.tenantSlug
          : null,
      canViewUsers: canViewPrivilegedData,
      canViewOnline: canViewPrivilegedData,
      canImpersonate: canViewPrivilegedData,
      impersonationActive: Boolean(impersonation?.active),
      impersonationTargetEmail:
        typeof impersonation?.targetUserEmail === "string"
          ? impersonation.targetUserEmail
          : null,
    };

    const ngrok = readNgrokUrl();

    if (!viewer.canViewUsers) {
      const tenants = await prisma.tenant.findMany({
        where: {
          status: "ACTIVE",
        },
        select: {
          id: true,
          slug: true,
          name: true,
          domain: true,
          status: true,
        },
        orderBy: [{ slug: "asc" }],
      });

      return {
        ...emptyDevInfo(viewer),
        ngrok,
        tenants: tenants.map((tenant) => ({
          id: tenant.id,
          slug: tenant.slug,
          name: tenant.name,
          domain: tenant.domain,
          status: tenant.status,
          localUrl: buildLocalTenantUrl(tenant.slug),
          productionUrl: buildProductionTenantUrl(tenant.slug, tenant.domain),
          totalUsers: null,
          onlineUsersNow: null,
        })),
        timestamp: new Date().toISOString(),
      };
    }

    const [tenantsRaw, onlineSnapshot] = await Promise.all([
      prisma.tenant.findMany({
        where: {
          status: "ACTIVE",
        },
        select: {
          id: true,
          slug: true,
          name: true,
          domain: true,
          status: true,
          usuarios: {
            where: {
              active: true,
            },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              role: true,
              active: true,
            },
            orderBy: [{ role: "asc" }, { firstName: "asc" }, { email: "asc" }],
          },
        },
        orderBy: [{ slug: "asc" }],
      }),
      getOnlinePresenceSnapshot({
        includeSuperAdmins: false,
        includeSupportSessions: true,
        maxAgeSeconds: 120,
      }),
    ]);

    const onlineByUserId = new Map(
      onlineSnapshot.map((entry) => [entry.userId, entry] as const),
    );
    const onlineCountsByTenant = new Map<string, number>();

    for (const entry of onlineSnapshot) {
      if (!entry.tenantId) {
        continue;
      }

      onlineCountsByTenant.set(
        entry.tenantId,
        (onlineCountsByTenant.get(entry.tenantId) ?? 0) + 1,
      );
    }

    const tenantMetaById = new Map<
      string,
      {
        slug: string;
        name: string;
        localUrl: string;
        productionUrl: string | null;
      }
    >();

    const tenants: DevTenantInfo[] = tenantsRaw.map((tenant) => {
      const localUrl = buildLocalTenantUrl(tenant.slug);
      const productionUrl = buildProductionTenantUrl(tenant.slug, tenant.domain);

      tenantMetaById.set(tenant.id, {
        slug: tenant.slug,
        name: tenant.name,
        localUrl,
        productionUrl,
      });

      return {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        domain: tenant.domain,
        status: tenant.status,
        localUrl,
        productionUrl,
        totalUsers: tenant.usuarios.length,
        onlineUsersNow: onlineCountsByTenant.get(tenant.id) ?? 0,
      };
    });

    const users: DevUserInfo[] = tenantsRaw.flatMap((tenant) => {
      const tenantMeta = tenantMetaById.get(tenant.id);

      if (!tenantMeta) {
        return [];
      }

      return tenant.usuarios.map((user) => {
        const onlineEntry = onlineByUserId.get(user.id);

        return {
          id: user.id,
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
          tenantName: tenant.name,
          name: buildDisplayName(user.firstName, user.lastName, user.email),
          email: user.email,
          role: user.role,
          active: user.active,
          localUrl: tenantMeta.localUrl,
          productionUrl: tenantMeta.productionUrl,
          onlineNow: Boolean(onlineEntry),
          lastSeenAt: onlineEntry?.lastSeenAt ?? null,
          locationLabel: onlineEntry?.location.label ?? null,
          isSupportSession: Boolean(onlineEntry?.isSupportSession),
          supportActorEmail: onlineEntry?.supportActorEmail ?? null,
        };
      });
    });

    const onlineUsers: DevUserInfo[] = onlineSnapshot
      .filter((entry) => entry.tenantId && tenantMetaById.has(entry.tenantId))
      .map((entry) => {
        const tenantMeta = tenantMetaById.get(entry.tenantId!);

        return {
          id: entry.userId,
          tenantId: entry.tenantId!,
          tenantSlug: tenantMeta?.slug ?? "tenant",
          tenantName: tenantMeta?.name ?? "Tenant",
          name: entry.name || entry.email || "Usuario sem nome",
          email: entry.email || "",
          role: entry.role || "N/D",
          active: true,
          localUrl: tenantMeta?.localUrl ?? "http://localhost:9192",
          productionUrl: tenantMeta?.productionUrl ?? null,
          onlineNow: true,
          lastSeenAt: entry.lastSeenAt,
          locationLabel: entry.location.label ?? null,
          isSupportSession: entry.isSupportSession,
          supportActorEmail: entry.supportActorEmail,
        };
      })
      .sort((left, right) => {
        return Date.parse(right.lastSeenAt ?? "") - Date.parse(left.lastSeenAt ?? "");
      });

    return {
      ngrok,
      tenants,
      users,
      onlineUsers,
      dashboard: "http://localhost:4040",
      appLocalUrl: "http://localhost:9192",
      appProductionUrl: "https://magiclawyer.com.br",
      viewer,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error("Falha ao montar painel dev:", error);
    return emptyDevInfo();
  }
}
