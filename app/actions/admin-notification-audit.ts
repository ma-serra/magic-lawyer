"use server";

import { getServerSession } from "next-auth/next";

import {
  getNotificationAuditReasonLabel,
  NOTIFICATION_CHANNEL_LABELS,
} from "@/app/lib/notifications/notification-audit";
import prisma from "@/app/lib/prisma";
import { authOptions } from "@/auth";
import logger from "@/lib/logger";

type NotificationAuditDecision = "CREATED" | "SUPPRESSED" | "FAILED";
type NotificationAuditDeliveryStatus =
  | "PENDING"
  | "SENT"
  | "DELIVERED"
  | "READ"
  | "FAILED"
  | "SKIPPED";
type NotificationAuditRowStatus =
  | NotificationAuditDecision
  | NotificationAuditDeliveryStatus;

export type NotificationAuditFilters = {
  limit?: number;
  tenantId?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
  channel?: "REALTIME" | "EMAIL" | "TELEGRAM" | "PUSH";
  provider?: string;
  status?: NotificationAuditRowStatus;
  reasonCode?: string;
  eventType?: string;
  userSearch?: string;
};

export type NotificationAuditRow = {
  dispatchId: string;
  notificationId: string | null;
  deliveryId: string | null;
  createdAt: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string | null;
  userId: string;
  userName: string;
  userEmail: string | null;
  eventType: string;
  urgency: string;
  dispatchDecision: NotificationAuditDecision;
  requestedChannels: string[];
  resolvedChannels: string[];
  channel: string | null;
  channelLabel: string;
  provider: string | null;
  status: NotificationAuditRowStatus;
  providerStatus: string | null;
  providerResponseCode: string | null;
  providerMessageId: string | null;
  recipientTarget: string | null;
  reasonCode: string | null;
  reasonLabel: string;
  reasonMessage: string | null;
  costAmount: number | null;
  costCurrency: string | null;
  costSource: string | null;
  notificationTitle: string | null;
  notificationMessage: string | null;
  payloadSummary: unknown;
};

export type NotificationAuditSummary = {
  totalEvaluated: number;
  totalCreated: number;
  totalSuppressed: number;
  totalFailed: number;
  deliveryRows: number;
  failureRate: number;
  costTotal: number;
  costCurrency: string;
  costByChannel: Array<{
    channel: string;
    amount: number;
    currency: string;
    deliveries: number;
  }>;
  topTenants: Array<{
    tenantId: string;
    tenantName: string;
    total: number;
  }>;
  topEvents: Array<{
    eventType: string;
    total: number;
  }>;
  coverage: {
    whatsappAuditable: boolean;
    note: string;
  };
};

export type NotificationAuditExportRow = NotificationAuditRow;

export type NotificationAuditResponse = {
  success: boolean;
  data?: {
    rows: NotificationAuditRow[];
    summary: NotificationAuditSummary;
    options: {
      providers: string[];
      eventTypes: string[];
      reasonCodes: string[];
    };
  };
  error?: string;
};

export type NotificationAuditDetailResponse = {
  success: boolean;
  data?: {
    dispatch: {
      id: string;
      createdAt: string;
      decision: NotificationAuditDecision;
      eventType: string;
      urgency: string;
      requestedChannels: string[];
      resolvedChannels: string[];
      reasonCode: string | null;
      reasonLabel: string;
      reasonMessage: string | null;
      payloadSummary: unknown;
    };
    tenant: {
      id: string;
      name: string;
      slug: string | null;
    } | null;
    user: {
      id: string;
      name: string;
      email: string | null;
    } | null;
    notification: {
      id: string;
      title: string;
      message: string;
      createdAt: string;
      expiresAt: string | null;
    } | null;
    deliveries: Array<{
      id: string;
      channel: string;
      channelLabel: string;
      provider: string;
      status: string;
      providerStatus: string | null;
      providerResponseCode: string | null;
      providerMessageId: string | null;
      recipientTarget: string | null;
      recipientSnapshot: unknown;
      reasonCode: string | null;
      reasonLabel: string;
      reasonMessage: string | null;
      errorCode: string | null;
      errorMessage: string | null;
      metadata: unknown;
      sentAt: string | null;
      deliveredAt: string | null;
      readAt: string | null;
      costAmount: number | null;
      costCurrency: string | null;
      costSource: string | null;
      createdAt: string;
    }>;
  };
  error?: string;
};

type LoadedDispatchAudit = Awaited<
  ReturnType<typeof loadNotificationDispatchAudits>
>[number];
type LoadedNotificationDelivery = NonNullable<
  LoadedDispatchAudit["notification"]
>["deliveries"][number];

async function ensureSuperAdmin() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    throw new Error("Não autenticado");
  }

  if ((session.user as { role?: string }).role !== "SUPER_ADMIN") {
    throw new Error(
      "Acesso negado. Apenas Super Admins podem acessar a auditoria de notificações.",
    );
  }
}

function buildDateRangeFilter(startDate?: string, endDate?: string) {
  if (!startDate && !endDate) {
    return undefined;
  }

  const filter: { gte?: Date; lte?: Date } = {};

  if (startDate) {
    const start = new Date(startDate);

    start.setHours(0, 0, 0, 0);
    filter.gte = start;
  }

  if (endDate) {
    const end = new Date(endDate);

    end.setHours(23, 59, 59, 999);
    filter.lte = end;
  }

  return filter;
}

function buildUserName(user?: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
} | null) {
  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();

  return fullName || user?.email || "Usuário sem identificação";
}

function decimalToNumber(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "number") {
    return value;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function containsSearch(candidate: unknown, search: string) {
  if (candidate === null || candidate === undefined) {
    return false;
  }

  return String(candidate).toLowerCase().includes(search);
}

async function loadNotificationDispatchAudits(filters?: NotificationAuditFilters) {
  const limit = Math.min(Math.max(filters?.limit ?? 150, 50), 1000);
  const take = Math.min(Math.max(limit * 4, 300), 4000);
  const dateFilter = buildDateRangeFilter(filters?.startDate, filters?.endDate);

  return prisma.notificationDispatchAudit.findMany({
    where: {
      ...(filters?.tenantId && filters.tenantId !== "ALL"
        ? { tenantId: filters.tenantId }
        : {}),
      ...(filters?.eventType ? { eventType: filters.eventType } : {}),
      ...(dateFilter ? { createdAt: dateFilter } : {}),
    },
    orderBy: { createdAt: "desc" },
    take,
    include: {
      notification: {
        select: {
          id: true,
          title: true,
          message: true,
          createdAt: true,
          expiresAt: true,
          deliveries: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              channel: true,
              provider: true,
              providerMessageId: true,
              status: true,
              recipientTarget: true,
              recipientSnapshot: true,
              reasonCode: true,
              reasonMessage: true,
              errorCode: true,
              errorMessage: true,
              providerStatus: true,
              providerResponseCode: true,
              sentAt: true,
              deliveredAt: true,
              readAt: true,
              costAmount: true,
              costCurrency: true,
              costSource: true,
              metadata: true,
              createdAt: true,
            },
          },
        },
      },
    },
  });
}

function createNotificationAuditRow(params: {
  dispatch: LoadedDispatchAudit;
  tenant?: { id: string; name: string; slug: string | null } | null;
  user?: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
  } | null;
  delivery?: LoadedNotificationDelivery;
}): NotificationAuditRow {
  const { dispatch, delivery } = params;
  const userName = buildUserName(params.user);
  const channel = delivery?.channel ?? null;
  const status = (delivery?.status ?? dispatch.decision) as NotificationAuditRowStatus;
  const reasonCode = delivery?.reasonCode ?? dispatch.reasonCode ?? null;

  return {
    dispatchId: dispatch.id,
    notificationId: dispatch.notificationId,
    deliveryId: delivery?.id ?? null,
    createdAt: dispatch.createdAt.toISOString(),
    tenantId: dispatch.tenantId,
    tenantName: params.tenant?.name ?? "Tenant desconhecido",
    tenantSlug: params.tenant?.slug ?? null,
    userId: dispatch.userId,
    userName,
    userEmail: params.user?.email ?? null,
    eventType: dispatch.eventType,
    urgency: dispatch.urgency,
    dispatchDecision: dispatch.decision,
    requestedChannels: dispatch.requestedChannels,
    resolvedChannels: dispatch.resolvedChannels,
    channel,
    channelLabel: channel
      ? NOTIFICATION_CHANNEL_LABELS[channel]
      : dispatch.decision === "CREATED"
        ? "Sem entrega materializada"
        : "Sem canal criado",
    provider: delivery?.provider ?? null,
    status,
    providerStatus: delivery?.providerStatus ?? null,
    providerResponseCode: delivery?.providerResponseCode ?? null,
    providerMessageId: delivery?.providerMessageId ?? null,
    recipientTarget: delivery?.recipientTarget ?? null,
    reasonCode,
    reasonLabel: getNotificationAuditReasonLabel(reasonCode),
    reasonMessage: delivery?.reasonMessage ?? dispatch.reasonMessage ?? null,
    costAmount: decimalToNumber(delivery?.costAmount),
    costCurrency: delivery?.costCurrency ?? null,
    costSource: delivery?.costSource ?? null,
    notificationTitle: dispatch.notification?.title ?? null,
    notificationMessage: dispatch.notification?.message ?? null,
    payloadSummary: dispatch.payloadSummary ?? null,
  };
}

function filterNotificationAuditRows(
  rows: NotificationAuditRow[],
  filters?: NotificationAuditFilters,
) {
  const globalSearch = filters?.search?.trim().toLowerCase();
  const userSearch = filters?.userSearch?.trim().toLowerCase();

  return rows.filter((row) => {
    if (filters?.channel && row.channel !== filters.channel) {
      return false;
    }

    if (filters?.provider && row.provider !== filters.provider) {
      return false;
    }

    if (filters?.status && row.status !== filters.status) {
      return false;
    }

    if (filters?.reasonCode && row.reasonCode !== filters.reasonCode) {
      return false;
    }

    if (userSearch) {
      const userMatches =
        containsSearch(row.userName, userSearch) ||
        containsSearch(row.userEmail, userSearch) ||
        containsSearch(row.userId, userSearch);

      if (!userMatches) {
        return false;
      }
    }

    if (!globalSearch) {
      return true;
    }

    return [
      row.eventType,
      row.tenantName,
      row.tenantSlug,
      row.userName,
      row.userEmail,
      row.channel,
      row.provider,
      row.status,
      row.reasonCode,
      row.reasonMessage,
      row.recipientTarget,
      row.notificationTitle,
      row.notificationMessage,
    ].some((candidate) => containsSearch(candidate, globalSearch));
  });
}

function buildNotificationAuditSummary(rows: NotificationAuditRow[]) {
  const dispatchMap = new Map<
    string,
    {
      decision: NotificationAuditDecision;
      tenantId: string;
      tenantName: string;
      eventType: string;
    }
  >();
  const costByChannel = new Map<string, { amount: number; currency: string; deliveries: number }>();
  const topTenants = new Map<string, { tenantName: string; total: number }>();
  const topEvents = new Map<string, number>();
  let attemptedDeliveries = 0;
  let failedDeliveries = 0;
  let costTotal = 0;

  for (const row of rows) {
    if (!dispatchMap.has(row.dispatchId)) {
      dispatchMap.set(row.dispatchId, {
        decision: row.dispatchDecision,
        tenantId: row.tenantId,
        tenantName: row.tenantName,
        eventType: row.eventType,
      });
    }

    if (row.deliveryId && row.status !== "SKIPPED") {
      attemptedDeliveries += 1;
    }

    if (row.status === "FAILED") {
      failedDeliveries += 1;
    }

    if (row.channel && row.costAmount !== null) {
      costTotal += row.costAmount;

      const current = costByChannel.get(row.channel) ?? {
        amount: 0,
        currency: row.costCurrency ?? "USD",
        deliveries: 0,
      };

      current.amount += row.costAmount;
      current.deliveries += 1;
      costByChannel.set(row.channel, current);
    }
  }

  for (const dispatch of dispatchMap.values()) {
    const tenantStats = topTenants.get(dispatch.tenantId) ?? {
      tenantName: dispatch.tenantName,
      total: 0,
    };

    tenantStats.total += 1;
    topTenants.set(dispatch.tenantId, tenantStats);
    topEvents.set(dispatch.eventType, (topEvents.get(dispatch.eventType) ?? 0) + 1);
  }

  return {
    totalEvaluated: dispatchMap.size,
    totalCreated: Array.from(dispatchMap.values()).filter(
      (item) => item.decision === "CREATED",
    ).length,
    totalSuppressed: Array.from(dispatchMap.values()).filter(
      (item) => item.decision === "SUPPRESSED",
    ).length,
    totalFailed: Array.from(dispatchMap.values()).filter(
      (item) => item.decision === "FAILED",
    ).length,
    deliveryRows: rows.filter((row) => Boolean(row.deliveryId)).length,
    failureRate: attemptedDeliveries
      ? Number(((failedDeliveries / attemptedDeliveries) * 100).toFixed(1))
      : 0,
    costTotal: Number(costTotal.toFixed(6)),
    costCurrency: "USD",
    costByChannel: Array.from(costByChannel.entries())
      .map(([channel, values]) => ({
        channel,
        amount: Number(values.amount.toFixed(6)),
        currency: values.currency,
        deliveries: values.deliveries,
      }))
      .sort((left, right) => right.amount - left.amount),
    topTenants: Array.from(topTenants.entries())
      .map(([tenantId, values]) => ({
        tenantId,
        tenantName: values.tenantName,
        total: values.total,
      }))
      .sort((left, right) => right.total - left.total)
      .slice(0, 5),
    topEvents: Array.from(topEvents.entries())
      .map(([eventType, total]) => ({ eventType, total }))
      .sort((left, right) => right.total - left.total)
      .slice(0, 5),
    coverage: {
      whatsappAuditable: false,
      note: "WhatsApp ainda não é auditável no motor principal de notificações.",
    },
  } satisfies NotificationAuditSummary;
}

export async function getAdminNotificationAudit(
  filters?: NotificationAuditFilters,
): Promise<NotificationAuditResponse> {
  try {
    await ensureSuperAdmin();

    const dispatches = await loadNotificationDispatchAudits(filters);
    const tenantIds = Array.from(new Set(dispatches.map((dispatch) => dispatch.tenantId)));
    const userIds = Array.from(new Set(dispatches.map((dispatch) => dispatch.userId)));

    const [tenants, users] = await Promise.all([
      prisma.tenant.findMany({
        where: { id: { in: tenantIds } },
        select: { id: true, name: true, slug: true },
      }),
      prisma.usuario.findMany({
        where: { id: { in: userIds } },
        select: { id: true, firstName: true, lastName: true, email: true },
      }),
    ]);

    const tenantMap = new Map(tenants.map((tenant) => [tenant.id, tenant]));
    const userMap = new Map(users.map((user) => [user.id, user]));
    const allRows = dispatches.flatMap((dispatch) => {
      const tenant = tenantMap.get(dispatch.tenantId);
      const user = userMap.get(dispatch.userId);
      const deliveries = dispatch.notification?.deliveries ?? [];

      if (!deliveries.length) {
        return [createNotificationAuditRow({ dispatch, tenant, user })];
      }

      return deliveries.map((delivery) =>
        createNotificationAuditRow({ dispatch, tenant, user, delivery }),
      );
    });

    const filteredRows = filterNotificationAuditRows(allRows, filters).sort(
      (left, right) =>
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
    );
    const limit = Math.min(Math.max(filters?.limit ?? 150, 50), 1000);

    return {
      success: true,
      data: {
        rows: filteredRows.slice(0, limit),
        summary: buildNotificationAuditSummary(filteredRows),
        options: {
          providers: Array.from(
            new Set(allRows.map((row) => row.provider).filter(Boolean) as string[]),
          ).sort(),
          eventTypes: Array.from(new Set(allRows.map((row) => row.eventType))).sort(),
          reasonCodes: Array.from(
            new Set(allRows.map((row) => row.reasonCode).filter(Boolean) as string[]),
          ).sort(),
        },
      },
    };
  } catch (error) {
    logger.error("Erro ao carregar auditoria de notificações:", error);

    return {
      success: false,
      error: "Erro interno do servidor ao carregar a auditoria de notificações.",
    };
  }
}

export async function getAdminNotificationAuditDetail(
  dispatchId: string,
): Promise<NotificationAuditDetailResponse> {
  try {
    await ensureSuperAdmin();

    const dispatch = await prisma.notificationDispatchAudit.findUnique({
      where: { id: dispatchId },
      include: {
        notification: {
          select: {
            id: true,
            title: true,
            message: true,
            createdAt: true,
            expiresAt: true,
            deliveries: {
              orderBy: { createdAt: "asc" },
              select: {
                id: true,
                channel: true,
                provider: true,
                providerMessageId: true,
                status: true,
                recipientTarget: true,
                recipientSnapshot: true,
                reasonCode: true,
                reasonMessage: true,
                errorCode: true,
                errorMessage: true,
                providerStatus: true,
                providerResponseCode: true,
                sentAt: true,
                deliveredAt: true,
                readAt: true,
                costAmount: true,
                costCurrency: true,
                costSource: true,
                metadata: true,
                createdAt: true,
              },
            },
          },
        },
      },
    });

    if (!dispatch) {
      return {
        success: false,
        error: "Despacho de notificação não encontrado.",
      };
    }

    const [tenant, user] = await Promise.all([
      prisma.tenant.findUnique({
        where: { id: dispatch.tenantId },
        select: { id: true, name: true, slug: true },
      }),
      prisma.usuario.findUnique({
        where: { id: dispatch.userId },
        select: { id: true, firstName: true, lastName: true, email: true },
      }),
    ]);

    return {
      success: true,
      data: {
        dispatch: {
          id: dispatch.id,
          createdAt: dispatch.createdAt.toISOString(),
          decision: dispatch.decision,
          eventType: dispatch.eventType,
          urgency: dispatch.urgency,
          requestedChannels: dispatch.requestedChannels,
          resolvedChannels: dispatch.resolvedChannels,
          reasonCode: dispatch.reasonCode,
          reasonLabel: getNotificationAuditReasonLabel(dispatch.reasonCode),
          reasonMessage: dispatch.reasonMessage,
          payloadSummary: dispatch.payloadSummary ?? null,
        },
        tenant: tenant
          ? {
              id: tenant.id,
              name: tenant.name,
              slug: tenant.slug,
            }
          : null,
        user: user
          ? {
              id: user.id,
              name: buildUserName(user),
              email: user.email,
            }
          : null,
        notification: dispatch.notification
          ? {
              id: dispatch.notification.id,
              title: dispatch.notification.title,
              message: dispatch.notification.message,
              createdAt: dispatch.notification.createdAt.toISOString(),
              expiresAt: dispatch.notification.expiresAt
                ? dispatch.notification.expiresAt.toISOString()
                : null,
            }
          : null,
        deliveries: (dispatch.notification?.deliveries ?? []).map((delivery) => ({
          id: delivery.id,
          channel: delivery.channel,
          channelLabel: NOTIFICATION_CHANNEL_LABELS[delivery.channel],
          provider: delivery.provider,
          status: delivery.status,
          providerStatus: delivery.providerStatus,
          providerResponseCode: delivery.providerResponseCode,
          providerMessageId: delivery.providerMessageId,
          recipientTarget: delivery.recipientTarget,
          recipientSnapshot: delivery.recipientSnapshot ?? null,
          reasonCode: delivery.reasonCode,
          reasonLabel: getNotificationAuditReasonLabel(delivery.reasonCode),
          reasonMessage: delivery.reasonMessage,
          errorCode: delivery.errorCode,
          errorMessage: delivery.errorMessage,
          metadata: delivery.metadata ?? null,
          sentAt: delivery.sentAt ? delivery.sentAt.toISOString() : null,
          deliveredAt: delivery.deliveredAt
            ? delivery.deliveredAt.toISOString()
            : null,
          readAt: delivery.readAt ? delivery.readAt.toISOString() : null,
          costAmount: decimalToNumber(delivery.costAmount),
          costCurrency: delivery.costCurrency,
          costSource: delivery.costSource,
          createdAt: delivery.createdAt.toISOString(),
        })),
      },
    };
  } catch (error) {
    logger.error("Erro ao carregar detalhe da auditoria de notificações:", error);

    return {
      success: false,
      error: "Erro interno do servidor ao carregar o detalhe da notificação.",
    };
  }
}
