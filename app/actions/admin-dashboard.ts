"use server";

import { getServerSession } from "next-auth/next";

import { getGlobalBrazilCoverageOverview } from "@/app/lib/geo/brazil-coverage-service";
import type { BrazilCoverageOverview } from "@/app/lib/geo/brazil-coverage";
import prisma from "@/app/lib/prisma";
import { getOnlinePresenceSnapshot } from "@/app/lib/realtime/session-presence";
import {
  InvoiceStatus,
  PaymentStatus,
  TenantStatus,
  UserRole,
} from "@/generated/prisma";
import { authOptions } from "@/auth";
import logger from "@/lib/logger";

const PRODUCTION_TENANT_WHERE = {
  slug: {
    not: "global",
  },
  isTestEnvironment: false,
} as const;

type Tone =
  | "primary"
  | "success"
  | "warning"
  | "secondary"
  | "danger"
  | "default";

type ValueFormat = "integer" | "currency" | "percentage" | "string";

function decimalToNumber(value: unknown): number {
  if (value == null) {
    return 0;
  }

  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "bigint") {
    return Number(value);
  }

  if (typeof value === "string") {
    const parsed = Number(value);

    return Number.isNaN(parsed) ? 0 : parsed;
  }

  if (
    typeof value === "object" &&
    "toString" in (value as Record<string, unknown>)
  ) {
    const parsed = Number((value as { toString(): string }).toString());

    return Number.isNaN(parsed) ? 0 : parsed;
  }

  return 0;
}

export interface AdminDashboardStat {
  id: string;
  label: string;
  helper?: string;
  value: number;
  tone: Tone;
  format?: ValueFormat;
  icon: string;
}

export interface AdminTrendPoint {
  id: string;
  label: string;
  value: number;
  previous?: number;
  format?: ValueFormat;
}

export interface AdminTenantHighlight {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  createdAt: string;
  users: number;
  processos: number;
  clientes: number;
  revenue90d: number;
  revenue30d: number;
  pendingInvoices: number;
  plan?: {
    name: string;
    billing: "mensal" | "anual" | "custom";
    price?: number;
    currency?: string;
  } | null;
}

export interface AdminTenantSummary {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  createdAt: string;
  email: string | null;
  telefone: string | null;
  domain: string | null;
  users: number;
  processos: number;
  clientes: number;
  activeSinceDays: number;
}

export interface AdminDashboardAlert {
  id: string;
  title: string;
  description: string;
  tone: Tone;
  icon?: string;
}

export interface AdminAuditEntry {
  id: string;
  action: string;
  entity: string | null;
  entityId: string | null;
  createdAt: string;
  summary: string;
}

export interface AdminOnlineUser {
  userId: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  role: string | null;
  name: string | null;
  email: string | null;
  locationLabel: string;
  locationCountry: string | null;
  locationRegion: string | null;
  locationCity: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  isSupportSession: boolean;
  lastSeenAt: string;
}

export interface AdminOnlineTenantPresence {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  usersOnline: number;
  supportSessions: number;
  lastSeenAt: string;
}

export interface AdminOnlineLocationPresence {
  key: string;
  label: string;
  country: string | null;
  region: string | null;
  city: string | null;
  usersOnline: number;
  tenantsOnline: number;
  supportSessions: number;
  mapX: number;
  mapY: number;
}

export interface AdminDashboardData {
  stats: AdminDashboardStat[];
  revenueSeries: AdminTrendPoint[];
  tenantGrowthSeries: AdminTrendPoint[];
  userGrowthSeries: AdminTrendPoint[];
  topTenants: AdminTenantHighlight[];
  latestTenants: AdminTenantSummary[];
  alerts: AdminDashboardAlert[];
  auditLog: AdminAuditEntry[];
  totals: {
    totalTenants: number;
    activeTenants: number;
    suspendedTenants: number;
    cancelledTenants: number;
    totalUsers: number;
    activeUsers: number;
    totalClientes: number;
    totalProcessos: number;
    totalRevenueAllTime: number;
    revenueLast30Days: number;
    outstandingInvoices: number;
    averageRevenuePerTenant: number;
  };
  onlinePresence: {
    totalUsersOnline: number;
    tenantsWithUsersOnline: number;
    supportSessionsOnline: number;
    generatedAt: string;
    users: AdminOnlineUser[];
    byTenant: AdminOnlineTenantPresence[];
    byLocation: AdminOnlineLocationPresence[];
  };
  geographicOverview: BrazilCoverageOverview;
}

export interface AdminDashboardResponse {
  success: boolean;
  data?: AdminDashboardData;
  error?: string;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, months: number) {
  const result = new Date(date);

  result.setMonth(result.getMonth() + months);

  return result;
}

function formatMonthLabel(date: Date) {
  return date.toLocaleDateString("pt-BR", {
    month: "short",
    year: "2-digit",
  });
}

function daysBetween(a: Date, b: Date) {
  const diffMs = Math.abs(b.getTime() - a.getTime());

  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

async function generateMonthlySeries(
  months: number,
  now: Date,
  generator: (start: Date, end: Date) => Promise<number>,
  format?: ValueFormat,
): Promise<AdminTrendPoint[]> {
  const series: AdminTrendPoint[] = [];
  let previous: number | undefined;

  for (let offset = months - 1; offset >= 0; offset -= 1) {
    const start = startOfMonth(addMonths(now, -offset));
    const end = addMonths(start, 1);
    const value = await generator(start, end);

    series.push({
      id: start.toISOString(),
      label: formatMonthLabel(start),
      value,
      previous,
      format,
    });

    previous = value;
  }

  return series;
}

function buildAlerts(params: {
  suspendedTenants: number;
  cancelledTenants: number;
  outstandingInvoices: number;
  revenueSeries: AdminTrendPoint[];
}): AdminDashboardAlert[] {
  const alerts: AdminDashboardAlert[] = [];

  if (params.suspendedTenants > 0) {
    alerts.push({
      id: "suspended-tenants",
      title: "Tenants suspensos",
      description: `${params.suspendedTenants} tenant(s) estão com status suspenso. Avalie e regularize o acesso deles.`,
      tone: "warning",
      icon: "⚠️",
    });
  }

  if (params.cancelledTenants > 0) {
    alerts.push({
      id: "cancelled-tenants",
      title: "Cancelamentos recentes",
      description: `${params.cancelledTenants} tenant(s) cancelados. Verifique se é preciso uma ação comercial.`,
      tone: "danger",
      icon: "❌",
    });
  }

  if (params.outstandingInvoices > 0) {
    alerts.push({
      id: "outstanding-invoices",
      title: "Faturas em aberto",
      description: `${params.outstandingInvoices} fatura(s) abertas ou vencidas aguardando pagamento.`,
      tone: "warning",
      icon: "💳",
    });
  }

  if (params.revenueSeries.length >= 2) {
    const lastPoint = params.revenueSeries.at(-1);
    const prevPoint = params.revenueSeries.at(-2);

    if (lastPoint && prevPoint && lastPoint.value < prevPoint.value) {
      const delta = prevPoint.value - lastPoint.value;

      alerts.push({
        id: "revenue-drop",
        title: "Queda de faturamento",
        description: `Receita do último mês caiu ${delta.toLocaleString(
          "pt-BR",
          {
            style: "currency",
            currency: "BRL",
          },
        )} em relação ao mês anterior.`,
        tone: "secondary",
        icon: "📉",
      });
    }
  }

  return alerts;
}

function serializeAuditEntry(entry: {
  id: string;
  acao: string;
  entidade: string | null;
  entidadeId: string | null;
  createdAt: Date;
  dadosNovos: unknown;
}): AdminAuditEntry {
  let summary = entry.acao.replace(/_/g, " ").toLowerCase();

  if (entry.entidade) {
    summary = `${summary} • ${entry.entidade}`;
  }

  return {
    id: entry.id,
    action: entry.acao,
    entity: entry.entidade,
    entityId: entry.entidadeId,
    createdAt: entry.createdAt.toISOString(),
    summary,
  };
}

function serializeTenantSummary(tenant: {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  createdAt: Date;
  email: string | null;
  telefone: string | null;
  domain: string | null;
  _count: { usuarios: number; processos: number; clientes: number };
}): AdminTenantSummary {
  const now = new Date();

  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    status: tenant.status,
    createdAt: tenant.createdAt.toISOString(),
    email: tenant.email,
    telefone: tenant.telefone,
    domain: tenant.domain,
    users: tenant._count.usuarios,
    processos: tenant._count.processos,
    clientes: tenant._count.clientes,
    activeSinceDays: daysBetween(tenant.createdAt, now),
  };
}

const BRAZIL_MAP_BOUNDS = {
  minLat: -34,
  maxLat: 6,
  minLng: -74,
  maxLng: -34,
} as const;

const BRAZIL_STATE_COORDINATES: Record<string, { lat: number; lng: number }> = {
  AC: { lat: -8.77, lng: -70.55 },
  AL: { lat: -9.62, lng: -36.82 },
  AP: { lat: 0.03, lng: -51.05 },
  AM: { lat: -3.1, lng: -60.02 },
  BA: { lat: -12.97, lng: -38.5 },
  CE: { lat: -3.73, lng: -38.52 },
  DF: { lat: -15.78, lng: -47.93 },
  ES: { lat: -20.32, lng: -40.34 },
  GO: { lat: -16.68, lng: -49.25 },
  MA: { lat: -2.53, lng: -44.3 },
  MT: { lat: -15.6, lng: -56.1 },
  MS: { lat: -20.45, lng: -54.62 },
  MG: { lat: -19.92, lng: -43.94 },
  PA: { lat: -1.45, lng: -48.5 },
  PB: { lat: -7.12, lng: -34.86 },
  PR: { lat: -25.42, lng: -49.27 },
  PE: { lat: -8.05, lng: -34.88 },
  PI: { lat: -5.09, lng: -42.8 },
  RJ: { lat: -22.91, lng: -43.17 },
  RN: { lat: -5.79, lng: -35.21 },
  RS: { lat: -30.03, lng: -51.23 },
  RO: { lat: -8.76, lng: -63.9 },
  RR: { lat: 2.82, lng: -60.67 },
  SC: { lat: -27.59, lng: -48.55 },
  SP: { lat: -23.55, lng: -46.63 },
  SE: { lat: -10.91, lng: -37.07 },
  TO: { lat: -10.25, lng: -48.32 },
};

function normalizeMapCoordinates(lat: number, lng: number) {
  const x =
    ((lng - BRAZIL_MAP_BOUNDS.minLng) /
      (BRAZIL_MAP_BOUNDS.maxLng - BRAZIL_MAP_BOUNDS.minLng)) *
    100;
  const y =
    100 -
    ((lat - BRAZIL_MAP_BOUNDS.minLat) /
      (BRAZIL_MAP_BOUNDS.maxLat - BRAZIL_MAP_BOUNDS.minLat)) *
      100;

  return {
    x: Number(Math.min(96, Math.max(4, x)).toFixed(2)),
    y: Number(Math.min(96, Math.max(4, y)).toFixed(2)),
  };
}

function resolveLocationCoordinates(params: {
  country: string | null;
  region: string | null;
}) {
  const country = params.country?.toUpperCase() ?? null;
  const region = params.region?.toUpperCase() ?? null;

  if (country === "BR" && region && BRAZIL_STATE_COORDINATES[region]) {
    const geo = BRAZIL_STATE_COORDINATES[region];

    return normalizeMapCoordinates(geo.lat, geo.lng);
  }

  if (country === "US") {
    return normalizeMapCoordinates(38.9, -77.04);
  }

  if (country === "PT") {
    return normalizeMapCoordinates(38.72, -9.14);
  }

  return normalizeMapCoordinates(-14.23, -51.92);
}

export async function getSuperAdminDashboardData(): Promise<AdminDashboardResponse> {
  const session = await getServerSession(authOptions);

  if (!session?.user || session.user.role !== UserRole.SUPER_ADMIN) {
    return {
      success: false,
      error: "Acesso não autorizado ao dashboard administrativo.",
    };
  }

  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 89 * 24 * 60 * 60 * 1000);

    const [
      totalTenants,
      activeTenants,
      suspendedTenants,
      cancelledTenants,
      totalUsuarios,
      activeUsuarios,
      totalProcessos,
      totalClientes,
      outstandingInvoices,
      revenueAllTimeAgg,
      revenueLast30Agg,
      geographicOverview,
    ] = await Promise.all([
      prisma.tenant.count({
        where: PRODUCTION_TENANT_WHERE,
      }),
      prisma.tenant.count({
        where: {
          ...PRODUCTION_TENANT_WHERE,
          status: TenantStatus.ACTIVE,
        },
      }),
      prisma.tenant.count({
        where: {
          ...PRODUCTION_TENANT_WHERE,
          status: TenantStatus.SUSPENDED,
        },
      }),
      prisma.tenant.count({
        where: {
          ...PRODUCTION_TENANT_WHERE,
          status: TenantStatus.CANCELLED,
        },
      }),
      prisma.usuario.count({
        where: {
          tenant: PRODUCTION_TENANT_WHERE,
        },
      }),
      prisma.usuario.count({
        where: {
          active: true,
          tenant: PRODUCTION_TENANT_WHERE,
        },
      }),
      prisma.processo.count({
        where: {
          tenant: PRODUCTION_TENANT_WHERE,
        },
      }),
      prisma.cliente.count({
        where: {
          tenant: PRODUCTION_TENANT_WHERE,
        },
      }),
      prisma.fatura.count({
        where: {
          status: { in: [InvoiceStatus.ABERTA, InvoiceStatus.VENCIDA] },
          tenant: PRODUCTION_TENANT_WHERE,
        },
      }),
      prisma.pagamento.aggregate({
        _sum: { valor: true },
        where: {
          status: PaymentStatus.PAGO,
          tenant: PRODUCTION_TENANT_WHERE,
        },
      }),
      prisma.pagamento.aggregate({
        _sum: { valor: true },
        where: {
          status: PaymentStatus.PAGO,
          tenant: PRODUCTION_TENANT_WHERE,
          confirmadoEm: {
            gte: thirtyDaysAgo,
          },
        },
      }),
      getGlobalBrazilCoverageOverview(),
    ]);

    const totalRevenueAllTime = decimalToNumber(revenueAllTimeAgg._sum.valor);
    const revenueLast30Days = decimalToNumber(revenueLast30Agg._sum.valor);

    const [revenueSeries, tenantGrowthSeries, userGrowthSeries] =
      await Promise.all([
        generateMonthlySeries(
          6,
          now,
          async (start, end) => {
            const result = await prisma.pagamento.aggregate({
              _sum: { valor: true },
              where: {
                status: PaymentStatus.PAGO,
                tenant: PRODUCTION_TENANT_WHERE,
                confirmadoEm: {
                  gte: start,
                  lt: end,
                },
              },
            });

            return decimalToNumber(result._sum.valor);
          },
          "currency",
        ),
        generateMonthlySeries(6, now, (start, end) =>
          prisma.tenant.count({
            where: {
              ...PRODUCTION_TENANT_WHERE,
              createdAt: {
                gte: start,
                lt: end,
              },
            },
          }),
        ),
        generateMonthlySeries(6, now, (start, end) =>
          prisma.usuario.count({
            where: {
              tenant: PRODUCTION_TENANT_WHERE,
              createdAt: {
                gte: start,
                lt: end,
              },
            },
          }),
        ),
      ]);

    const revenueByTenant = await prisma.pagamento.groupBy({
      by: ["tenantId"],
      _sum: { valor: true },
      where: {
        status: PaymentStatus.PAGO,
        tenant: PRODUCTION_TENANT_WHERE,
        confirmadoEm: {
          gte: ninetyDaysAgo,
        },
      },
      orderBy: {
        _sum: {
          valor: "desc",
        },
      },
      take: 5,
    });

    const tenantIds = revenueByTenant.map((item) => item.tenantId);

    const tenantsForHighlights = tenantIds.length
      ? await prisma.tenant.findMany({
          where: {
            id: { in: tenantIds },
            ...PRODUCTION_TENANT_WHERE,
          },
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            createdAt: true,
            subscription: {
              select: {
                plano: {
                  select: {
                    nome: true,
                    valorMensal: true,
                    valorAnual: true,
                    moeda: true,
                  },
                },
              },
            },
            _count: {
              select: {
                usuarios: true,
                processos: true,
                clientes: true,
              },
            },
          },
        })
      : [];

    const revenueLast30ByTenant = await prisma.pagamento.groupBy({
      by: ["tenantId"],
      _sum: { valor: true },
      where: {
        status: PaymentStatus.PAGO,
        confirmadoEm: {
          gte: thirtyDaysAgo,
        },
        tenantId: { in: tenantIds },
      },
    });

    const pendingInvoicesByTenant = tenantIds.length
      ? await prisma.fatura.groupBy({
          by: ["tenantId"],
          _count: {
            tenantId: true,
          },
          where: {
            tenantId: { in: tenantIds },
            status: { in: [InvoiceStatus.ABERTA, InvoiceStatus.VENCIDA] },
          },
        })
      : [];

    const topTenants: AdminTenantHighlight[] = revenueByTenant.map((item) => {
      const tenant = tenantsForHighlights.find((t) => t.id === item.tenantId);

      if (!tenant) {
        return {
          id: item.tenantId,
          name: "Tenant desconhecido",
          slug: item.tenantId,
          status: TenantStatus.ACTIVE,
          createdAt: new Date().toISOString(),
          users: 0,
          processos: 0,
          clientes: 0,
          revenue90d: decimalToNumber(item._sum.valor),
          revenue30d: 0,
          pendingInvoices: 0,
          plan: null,
        };
      }

      const revenue30Bucket = revenueLast30ByTenant.find(
        (bucket) => bucket.tenantId === tenant.id,
      );
      const pendingBucket = pendingInvoicesByTenant.find(
        (bucket) => bucket.tenantId === tenant.id,
      );

      let plan: AdminTenantHighlight["plan"] = null;

      if (tenant.subscription?.plano) {
        const plano = tenant.subscription.plano;
        let billing: "mensal" | "anual" | "custom" = "custom";
        let price: number | undefined;

        if (plano.valorMensal) {
          billing = "mensal";
          price = decimalToNumber(plano.valorMensal);
        } else if (plano.valorAnual) {
          billing = "anual";
          price = decimalToNumber(plano.valorAnual);
        }

        plan = {
          name: plano.nome,
          billing,
          price,
          currency: plano.moeda ?? "BRL",
        };
      }

      return {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        status: tenant.status,
        createdAt: tenant.createdAt.toISOString(),
        users: tenant._count.usuarios,
        processos: tenant._count.processos,
        clientes: tenant._count.clientes,
        revenue90d: decimalToNumber(item._sum.valor),
        revenue30d: decimalToNumber(revenue30Bucket?._sum.valor),
        pendingInvoices: pendingBucket?._count.tenantId ?? 0,
        plan,
      };
    });

    const latestTenantsRaw = await prisma.tenant.findMany({
      where: PRODUCTION_TENANT_WHERE,
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        createdAt: true,
        email: true,
        telefone: true,
        domain: true,
        _count: {
          select: {
            usuarios: true,
            processos: true,
            clientes: true,
          },
        },
      },
    });

    const latestTenants = latestTenantsRaw.map(serializeTenantSummary);

    const auditLogRaw = await prisma.superAdminAuditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        id: true,
        acao: true,
        entidade: true,
        entidadeId: true,
        createdAt: true,
        dadosNovos: true,
      },
    });

    const onlineSnapshotRaw = await getOnlinePresenceSnapshot({
      includeSuperAdmins: false,
    });
    const onlineTenantIds = Array.from(
      new Set(
        onlineSnapshotRaw
          .map((entry) => entry.tenantId)
          .filter((tenantId): tenantId is string => Boolean(tenantId)),
      ),
    );
    const onlineTenantsMeta = onlineTenantIds.length
      ? await prisma.tenant.findMany({
          where: {
            id: { in: onlineTenantIds },
            ...PRODUCTION_TENANT_WHERE,
          },
          select: {
            id: true,
            name: true,
            slug: true,
          },
        })
      : [];
    const onlineTenantMap = new Map(
      onlineTenantsMeta.map((tenant) => [tenant.id, tenant]),
    );

    const onlineUsers: AdminOnlineUser[] = onlineSnapshotRaw
      .filter((entry) => entry.tenantId && onlineTenantMap.has(entry.tenantId))
      .map((entry) => {
        const tenant = onlineTenantMap.get(entry.tenantId!);

        return {
          userId: entry.userId,
          tenantId: entry.tenantId!,
          tenantName: tenant?.name ?? "Tenant desconhecido",
          tenantSlug: tenant?.slug ?? "sem-slug",
          role: entry.role,
          name: entry.name,
          email: entry.email,
          locationLabel: entry.location.label || "Localização não identificada",
          locationCountry: entry.location.country,
          locationRegion: entry.location.region,
          locationCity: entry.location.city,
          ipAddress: entry.ipAddress,
          userAgent: entry.userAgent,
          isSupportSession: entry.isSupportSession,
          lastSeenAt: entry.lastSeenAt,
        };
      });

    const onlineByTenantMap = new Map<
      string,
      {
        tenantName: string;
        tenantSlug: string;
        usersOnline: number;
        supportSessions: number;
        lastSeenAt: string;
      }
    >();
    const onlineByLocationMap = new Map<
      string,
      {
        label: string;
        country: string | null;
        region: string | null;
        city: string | null;
        usersOnline: number;
        supportSessions: number;
        tenants: Set<string>;
      }
    >();

    for (const entry of onlineUsers) {
      const currentTenant =
        onlineByTenantMap.get(entry.tenantId) ??
        {
          tenantName: entry.tenantName,
          tenantSlug: entry.tenantSlug,
          usersOnline: 0,
          supportSessions: 0,
          lastSeenAt: entry.lastSeenAt,
        };
      const nextLastSeen =
        Date.parse(entry.lastSeenAt) > Date.parse(currentTenant.lastSeenAt)
          ? entry.lastSeenAt
          : currentTenant.lastSeenAt;

      onlineByTenantMap.set(entry.tenantId, {
        tenantName: entry.tenantName,
        tenantSlug: entry.tenantSlug,
        usersOnline: currentTenant.usersOnline + 1,
        supportSessions:
          currentTenant.supportSessions + (entry.isSupportSession ? 1 : 0),
        lastSeenAt: nextLastSeen,
      });

      const locationKey = `${entry.locationCountry ?? "??"}::${entry.locationRegion ?? "??"}::${entry.locationCity ?? "??"}`;
      const locationEntry =
        onlineByLocationMap.get(locationKey) ??
        {
          label: entry.locationLabel,
          country: entry.locationCountry,
          region: entry.locationRegion,
          city: entry.locationCity,
          usersOnline: 0,
          supportSessions: 0,
          tenants: new Set<string>(),
        };

      locationEntry.usersOnline += 1;
      locationEntry.supportSessions += entry.isSupportSession ? 1 : 0;
      locationEntry.tenants.add(entry.tenantId);
      onlineByLocationMap.set(locationKey, locationEntry);
    }

    const onlineByTenant: AdminOnlineTenantPresence[] = Array.from(
      onlineByTenantMap.entries(),
    )
      .map(([tenantId, value]) => ({
        tenantId,
        tenantName: value.tenantName,
        tenantSlug: value.tenantSlug,
        usersOnline: value.usersOnline,
        supportSessions: value.supportSessions,
        lastSeenAt: value.lastSeenAt,
      }))
      .sort((a, b) => b.usersOnline - a.usersOnline);

    const onlineByLocation: AdminOnlineLocationPresence[] = Array.from(
      onlineByLocationMap.entries(),
    )
      .map(([key, value]) => {
        const coordinates = resolveLocationCoordinates({
          country: value.country,
          region: value.region,
        });

        return {
          key,
          label: value.label,
          country: value.country,
          region: value.region,
          city: value.city,
          usersOnline: value.usersOnline,
          tenantsOnline: value.tenants.size,
          supportSessions: value.supportSessions,
          mapX: coordinates.x,
          mapY: coordinates.y,
        };
      })
      .sort((a, b) => b.usersOnline - a.usersOnline);

    const supportSessionsOnline = onlineUsers.filter(
      (entry) => entry.isSupportSession,
    ).length;

    const alerts = buildAlerts({
      suspendedTenants,
      cancelledTenants,
      outstandingInvoices,
      revenueSeries,
    });

    const stats: AdminDashboardStat[] = [
      {
        id: "total-tenants",
        label: "Tenants ativos",
        helper: `${activeTenants} de ${totalTenants}`,
        value: activeTenants,
        tone: "primary",
        icon: "🏢",
      },
      {
        id: "total-users",
        label: "Usuários ativos",
        helper: `${activeUsuarios} de ${totalUsuarios}`,
        value: activeUsuarios,
        tone: "secondary",
        icon: "👥",
      },
      {
        id: "revenue-30",
        label: "Receita nos últimos 30 dias",
        value: revenueLast30Days,
        tone: "success",
        format: "currency",
        icon: "💰",
      },
      {
        id: "outstanding-invoices",
        label: "Faturas em aberto",
        value: outstandingInvoices,
        tone: outstandingInvoices > 0 ? "warning" : "success",
        icon: "📄",
      },
    ];

    const averageRevenuePerTenant =
      totalTenants > 0 ? totalRevenueAllTime / totalTenants : 0;

    return {
      success: true,
      data: {
        stats,
        revenueSeries,
        tenantGrowthSeries,
        userGrowthSeries,
        topTenants,
        latestTenants,
        alerts,
        auditLog: auditLogRaw.map(serializeAuditEntry),
        totals: {
          totalTenants,
          activeTenants,
          suspendedTenants,
          cancelledTenants,
          totalUsers: totalUsuarios,
          activeUsers: activeUsuarios,
          totalClientes,
          totalProcessos,
          totalRevenueAllTime,
          revenueLast30Days,
          outstandingInvoices,
          averageRevenuePerTenant,
        },
        onlinePresence: {
          totalUsersOnline: onlineUsers.length,
          tenantsWithUsersOnline: onlineByTenant.length,
          supportSessionsOnline,
          generatedAt: new Date().toISOString(),
          users: onlineUsers,
          byTenant: onlineByTenant,
          byLocation: onlineByLocation,
        },
        geographicOverview,
      },
    };
  } catch (error) {
    logger.error("[admin-dashboard] erro ao carregar métricas", error);

    return {
      success: false,
      error:
        "Não foi possível carregar as métricas do dashboard administrativo.",
    };
  }
}
