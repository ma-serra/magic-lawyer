"use server";

import { getServerSession } from "next-auth/next";

import type { AdminSecurityDashboardData } from "@/app/lib/admin-security";

import { authOptions } from "@/auth";
import {
  buildAdminSecurityDashboard,
  type AdminSecurityEventSource,
  type AdminSecurityNotificationSource,
} from "@/app/lib/admin-security";
import prisma from "@/app/lib/prisma";
import logger from "@/lib/logger";

export type AdminSecurityFilters = {
  tenantId?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
};

export type AdminSecurityDashboardResponse = {
  success: boolean;
  data?: AdminSecurityDashboardData & {
    tenantOptions: Array<{
      id: string;
      name: string;
      slug: string;
      status: string;
    }>;
    filters: {
      tenantId: string | null;
      search: string | null;
      startDate: string;
      endDate: string;
    };
  };
  error?: string;
};

function asPayloadRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {} as Record<string, unknown>;
  }

  return value as Record<string, unknown>;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function ensureSuperAdmin() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id || (session.user as any)?.role !== "SUPER_ADMIN") {
    throw new Error("Acesso negado ao cockpit de seguranca.");
  }
}

function resolveDateRange(filters?: AdminSecurityFilters) {
  const end = filters?.endDate ? new Date(filters.endDate) : new Date();
  end.setHours(23, 59, 59, 999);

  const start = filters?.startDate
    ? new Date(filters.startDate)
    : new Date(end.getTime() - 6 * 24 * 60 * 60 * 1000);
  start.setHours(0, 0, 0, 0);

  return { start, end };
}

function buildSearchMatcher(search?: string) {
  const normalized = search?.trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  return (values: Array<string | null | undefined>) =>
    values.some((value) => (value || "").toLowerCase().includes(normalized));
}

export async function getAdminSecurityDashboard(
  filters?: AdminSecurityFilters,
): Promise<AdminSecurityDashboardResponse> {
  try {
    await ensureSuperAdmin();

    const { start, end } = resolveDateRange(filters);
    const tenantId = filters?.tenantId?.trim() || undefined;
    const search = filters?.search?.trim() || undefined;
    const matchesSearch = buildSearchMatcher(search);

    const [tenantOptions, rawAccessEvents, rawNotifications] = await Promise.all([
      prisma.tenant.findMany({
        where: {
          slug: {
            not: "global",
          },
        },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
        },
      }),
      prisma.operationalAuditEvent.findMany({
        where: {
          category: "ACCESS",
          createdAt: {
            gte: start,
            lte: end,
          },
          ...(tenantId ? { tenantId } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: 5000,
        select: {
          id: true,
          createdAt: true,
          tenantId: true,
          action: true,
          status: true,
          actorId: true,
          actorName: true,
          actorEmail: true,
          ipAddress: true,
          userAgent: true,
          payload: true,
          tenant: {
            select: {
              name: true,
              slug: true,
            },
          },
        },
      }),
      prisma.notification.findMany({
        where: {
          type: {
            startsWith: "access.",
          },
          createdAt: {
            gte: start,
            lte: end,
          },
          ...(tenantId ? { tenantId } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: 5000,
        select: {
          id: true,
          createdAt: true,
          tenantId: true,
          readAt: true,
          type: true,
          userId: true,
          tenant: {
            select: {
              name: true,
              slug: true,
            },
          },
          user: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          deliveries: {
            where: {
              status: {
                not: "SKIPPED",
              },
            },
            select: {
              channel: true,
              status: true,
            },
          },
          payload: true,
        },
      }),
    ]);

    let accessEvents: AdminSecurityEventSource[] = rawAccessEvents.map((event) => ({
      id: event.id,
      createdAt: event.createdAt.toISOString(),
      tenantId: event.tenantId,
      tenantName: event.tenant?.name ?? null,
      tenantSlug: event.tenant?.slug ?? null,
      actorId: event.actorId,
      actorName: event.actorName,
      actorEmail: event.actorEmail,
      action: event.action,
      status: event.status,
      ipAddress: event.ipAddress,
      userAgent: event.userAgent,
      payload: event.payload ?? undefined,
    }));
    let securityNotifications: AdminSecurityNotificationSource[] =
      rawNotifications.map((notification) => ({
        id: notification.id,
        createdAt: notification.createdAt.toISOString(),
        tenantId: notification.tenantId,
        tenantName: notification.tenant?.name ?? null,
        tenantSlug: notification.tenant?.slug ?? null,
        userId: notification.userId,
        userName:
          [notification.user?.firstName, notification.user?.lastName]
            .filter(Boolean)
            .join(" ")
            .trim() || notification.user?.email || notification.userId,
        userEmail: notification.user?.email ?? null,
        type: notification.type,
        readAt: notification.readAt?.toISOString() ?? null,
        deliveries: notification.deliveries.map((delivery) => ({
          channel: delivery.channel,
          status: delivery.status,
        })),
      }));

    if (matchesSearch) {
      accessEvents = accessEvents.filter((event) => {
        const payload = asPayloadRecord(event.payload);

        return matchesSearch([
          event.tenantName,
          event.tenantSlug,
          event.actorName,
          event.actorEmail,
          event.action,
          event.status,
          event.ipAddress,
          event.userAgent,
          readString(payload.locationLabel),
          readString(payload.deviceLabel),
        ]);
      });

      securityNotifications = securityNotifications.filter((notification) =>
        matchesSearch([
          notification.tenantName,
          notification.tenantSlug,
          notification.userName,
          notification.userEmail,
          notification.type,
        ]),
      );
    }

    const dashboard = buildAdminSecurityDashboard({
      accessEvents,
      securityNotifications,
    });

    return {
      success: true,
      data: {
        ...dashboard,
        tenantOptions,
        filters: {
          tenantId: tenantId ?? null,
          search: search ?? null,
          startDate: start.toISOString(),
          endDate: end.toISOString(),
        },
      },
    };
  } catch (error) {
    logger.error("[admin-security] erro ao carregar cockpit de seguranca", error);

    return {
      success: false,
      error: "Nao foi possivel carregar o cockpit de seguranca.",
    };
  }
}
