"use server";

import { UserRole } from "@/generated/prisma";

import { getSession } from "@/app/lib/auth";
import prisma from "@/app/lib/prisma";
import { AUDIT_ACTIONS } from "@/app/lib/audit/action-catalog";
import { logUnifiedSensitiveView } from "@/app/lib/audit/unified";
import logger from "@/lib/logger";

export type TenantAuditTabKey =
  | "overview"
  | "changes"
  | "access"
  | "deletions"
  | "operational";

export type TenantAuditCenterFilters = {
  limit?: number;
  page?: number;
  tab?: TenantAuditTabKey;
  search?: string;
  startDate?: string;
  endDate?: string;
};

export type TenantAuditChangeLogEntry = {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  changedFields: string[];
  previousValues: unknown;
  nextValues: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  actor: {
    id: string | null;
    name: string | null;
    email: string | null;
  };
};

export type TenantOperationalAuditEntry = {
  id: string;
  category: string;
  source: string;
  action: string;
  status: string;
  route: string | null;
  entityType: string | null;
  entityId: string | null;
  actorType: string | null;
  actorId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  message: string | null;
  payload: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
};

export type TenantAuditCenterResponse = {
  success: boolean;
  data?: {
    tenantId: string;
    page: number;
    limit: number;
    total: number;
    changeLogs: TenantAuditChangeLogEntry[];
    accessEvents: TenantOperationalAuditEntry[];
    operationalEvents: TenantOperationalAuditEntry[];
    summary: {
      totalChanges: number;
      totalAccessEvents: number;
      totalOperationalEvents: number;
      totalSoftDeletes: number;
      totalErrors: number;
      lastEventAt: string | null;
    };
  };
  error?: string;
};

type TenantAdminSession = {
  tenantId: string;
  userId: string;
  name: string | null;
  email: string | null;
};

function buildDateRange(startDate?: string, endDate?: string) {
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

function normalizeSearch(search?: string) {
  const value = search?.trim();
  return value && value.length > 0 ? value : undefined;
}

async function requireTenantAdmin(): Promise<TenantAdminSession> {
  const session = await getSession();
  const user = session?.user as
    | {
        id?: string;
        tenantId?: string;
        role?: UserRole | string;
        name?: string | null;
        email?: string | null;
      }
    | undefined;

  if (!user?.id || !user?.tenantId) {
    throw new Error("Não autenticado.");
  }

  if (user.role !== UserRole.ADMIN) {
    throw new Error("Acesso negado. Apenas ADMIN do escritório.");
  }

  return {
    tenantId: user.tenantId,
    userId: user.id,
    name: user.name ?? null,
    email: user.email ?? null,
  };
}

function mapOperationalEvent(
  event: {
    id: string;
    category: string;
    source: string;
    action: string;
    status: string;
    route: string | null;
    entityType: string | null;
    entityId: string | null;
    actorType: string | null;
    actorId: string | null;
    actorName: string | null;
    actorEmail: string | null;
    message: string | null;
    payload: unknown;
    ipAddress: string | null;
    userAgent: string | null;
    createdAt: Date;
  },
): TenantOperationalAuditEntry {
  return {
    id: event.id,
    category: event.category,
    source: event.source,
    action: event.action,
    status: event.status,
    route: event.route,
    entityType: event.entityType,
    entityId: event.entityId,
    actorType: event.actorType,
    actorId: event.actorId,
    actorName: event.actorName,
    actorEmail: event.actorEmail,
    message: event.message,
    payload: event.payload ?? undefined,
    ipAddress: event.ipAddress,
    userAgent: event.userAgent,
    createdAt: event.createdAt.toISOString(),
  };
}

export async function getTenantAuditCenter(
  filters?: TenantAuditCenterFilters,
): Promise<TenantAuditCenterResponse> {
  try {
    const actor = await requireTenantAdmin();

    const limit = Math.min(Math.max(filters?.limit ?? 50, 10), 200);
    const page = Math.max(filters?.page ?? 1, 1);
    const skip = (page - 1) * limit;
    const search = normalizeSearch(filters?.search);
    const dateRange = buildDateRange(filters?.startDate, filters?.endDate);
    const tab = filters?.tab ?? "overview";

    const changeWhere = {
      tenantId: actor.tenantId,
      ...(dateRange ? { createdAt: dateRange } : {}),
      ...(tab === "deletions"
        ? {
            OR: [
              { acao: { contains: "SOFT_DELETE", mode: "insensitive" as const } },
              { acao: { contains: "DELETED", mode: "insensitive" as const } },
              { changedFields: { has: "deletedAt" } },
            ],
          }
        : {}),
      ...(search
        ? {
            OR: [
              { acao: { contains: search, mode: "insensitive" as const } },
              { entidade: { contains: search, mode: "insensitive" as const } },
              { entidadeId: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const opWhere = {
      tenantId: actor.tenantId,
      ...(dateRange ? { createdAt: dateRange } : {}),
      ...(tab === "access"
        ? {
            OR: [{ category: "ACCESS" }, { category: "DATA_ACCESS" }],
          }
        : tab === "operational"
          ? {
              category: {
                in: ["SUPPORT", "EMAIL", "WEBHOOK", "CRON", "INTEGRATION"],
              },
            }
          : tab === "deletions"
            ? {
                action: { contains: "SOFT_DELETE", mode: "insensitive" as const },
              }
            : {}),
      ...(search
        ? {
            OR: [
              { action: { contains: search, mode: "insensitive" as const } },
              { category: { contains: search, mode: "insensitive" as const } },
              { source: { contains: search, mode: "insensitive" as const } },
              { entityType: { contains: search, mode: "insensitive" as const } },
              { entityId: { contains: search, mode: "insensitive" as const } },
              { message: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [changeLogsRaw, operationalRaw, totalChanges, totalOps] =
      await Promise.all([
        prisma.auditLog.findMany({
          where: changeWhere,
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
          include: {
            usuario: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        }),
        prisma.operationalAuditEvent.findMany({
          where: opWhere,
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
        }),
        prisma.auditLog.count({ where: changeWhere }),
        prisma.operationalAuditEvent.count({ where: opWhere }),
      ]);

    const changeLogs: TenantAuditChangeLogEntry[] = changeLogsRaw.map((log) => ({
      id: log.id,
      action: log.acao,
      entity: log.entidade,
      entityId: log.entidadeId ?? null,
      changedFields: log.changedFields ?? [],
      previousValues: log.previousValues ?? undefined,
      nextValues: log.dados ?? undefined,
      ipAddress: log.ip ?? null,
      userAgent: log.userAgent ?? null,
      createdAt: log.createdAt.toISOString(),
      actor: {
        id: log.usuario?.id ?? null,
        name: [log.usuario?.firstName, log.usuario?.lastName]
          .filter(Boolean)
          .join(" ")
          .trim() || log.usuario?.email || null,
        email: log.usuario?.email ?? null,
      },
    }));

    const operationalEvents = operationalRaw.map(mapOperationalEvent);
    const accessEvents = operationalEvents.filter(
      (event) => event.category === "ACCESS" || event.category === "DATA_ACCESS",
    );
    const lastEventAt =
      [...changeLogs.map((item) => item.createdAt), ...operationalEvents.map((item) => item.createdAt)]
        .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ??
      null;

    const softDeleteChanges = changeLogsRaw.filter(
      (log) =>
        log.acao.toUpperCase().includes("SOFT_DELETE") ||
        log.acao.toUpperCase().includes("DELETED") ||
        log.changedFields.includes("deletedAt"),
    ).length;
    const softDeleteOps = operationalRaw.filter((event) =>
      event.action.toUpperCase().includes("SOFT_DELETE"),
    ).length;
    const totalErrors = operationalRaw.filter(
      (event) => event.status.toUpperCase() === "ERROR",
    ).length;

    return {
      success: true,
      data: {
        tenantId: actor.tenantId,
        page,
        limit,
        total: totalChanges + totalOps,
        changeLogs,
        accessEvents,
        operationalEvents,
        summary: {
          totalChanges,
          totalAccessEvents: accessEvents.length,
          totalOperationalEvents: totalOps,
          totalSoftDeletes: softDeleteChanges + softDeleteOps,
          totalErrors,
          lastEventAt,
        },
      },
    };
  } catch (error) {
    logger.error("Erro ao montar central de auditoria do tenant:", error);

    return {
      success: false,
      error: "Erro ao carregar auditoria do escritório.",
    };
  }
}

export async function exportTenantAuditLogs(
  filters?: TenantAuditCenterFilters,
): Promise<{
  success: boolean;
  data?: string;
  filename?: string;
  error?: string;
}> {
  try {
    const actor = await requireTenantAdmin();
    const result = await getTenantAuditCenter({
      ...filters,
      limit: Math.min(Math.max(filters?.limit ?? 200, 50), 500),
      page: 1,
    });

    if (!result.success || !result.data) {
      return {
        success: false,
        error: result.error ?? "Falha ao exportar auditoria.",
      };
    }

    const rows = [
      ...result.data.changeLogs.map((log) => ({
        timestamp: log.createdAt,
        channel: "CHANGE_LOG",
        action: log.action,
        category: "CHANGE",
        entity: log.entity,
        entityId: log.entityId ?? "",
        actorName: log.actor.name ?? "",
        actorEmail: log.actor.email ?? "",
        status: "INFO",
        message: "",
      })),
      ...result.data.operationalEvents.map((event) => ({
        timestamp: event.createdAt,
        channel: "OPERATIONAL_EVENT",
        action: event.action,
        category: event.category,
        entity: event.entityType ?? "",
        entityId: event.entityId ?? "",
        actorName: event.actorName ?? "",
        actorEmail: event.actorEmail ?? "",
        status: event.status,
        message: event.message ?? "",
      })),
    ].sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );

    const headers = [
      "timestamp",
      "channel",
      "action",
      "category",
      "entity",
      "entityId",
      "actorName",
      "actorEmail",
      "status",
      "message",
    ];
    const csv = [
      headers.join(","),
      ...rows.map((row) =>
        headers
          .map((header) => {
            const value = String(row[header as keyof typeof row] ?? "");
            return /[",\n]/.test(value)
              ? `"${value.replace(/"/g, '""')}"`
              : value;
          })
          .join(","),
      ),
    ].join("\n");

    await logUnifiedSensitiveView({
      tenantId: actor.tenantId,
      source: "TENANT_AUDIT_EXPORT",
      action: AUDIT_ACTIONS.AUDIT_EXPORT_REQUESTED,
      entityType: "AUDIT_LOG",
      entityId: actor.tenantId,
      actor: {
        id: actor.userId,
        tenantId: actor.tenantId,
        name: actor.name,
        email: actor.email,
      },
      route: "/auditoria",
      message: "Exportação de trilha de auditoria do tenant.",
      payload: {
        filters: filters ?? {},
        rows: rows.length,
      },
    });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

    return {
      success: true,
      data: csv,
      filename: `tenant-audit-${timestamp}.csv`,
    };
  } catch (error) {
    logger.error("Erro ao exportar auditoria do tenant:", error);

    return {
      success: false,
      error: "Erro ao exportar auditoria do escritório.",
    };
  }
}

