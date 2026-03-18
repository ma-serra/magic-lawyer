"use server";

import { getServerSession } from "next-auth/next";

import {
  buildAdminAuditControlTower,
  type AdminAuditChangeEntry,
  type AdminOperationalAuditEntry,
  type AdminSupportAuditItem,
} from "@/app/lib/admin-audit-center";
import prisma from "@/app/lib/prisma";
import { authOptions } from "@/auth";
import logger from "@/lib/logger";

export type AuditLogEntry = {
  id: string;
  fonte: "SUPER_ADMIN" | "TENANT";
  acao: string;
  entidade: string;
  entidadeId?: string | null;
  createdAt: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  dadosAntigos?: any;
  dadosNovos?: any;
  changedFields?: string[];
  superAdmin?: {
    id: string;
    nome: string;
    email: string;
  } | null;
  tenant?: {
    id: string;
    nome: string;
    slug: string | null;
  } | null;
  usuario?: {
    id: string;
    nome: string;
    email: string;
  } | null;
};

export type AuditLogSummary = {
  total: number;
  porCategoria: {
    create: number;
    update: number;
    delete: number;
    other: number;
  };
};

export type AuditLogFilters = {
  limit?: number;
  fonte?: "SUPER_ADMIN" | "TENANT";
  tenantId?: string;
  entidade?: string;
  acao?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
};

export type AdminAuditCenterFilters = {
  limit?: number;
  tenantId?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
};

export type AdminAuditCenterResponse = {
  success: boolean;
  data?: {
    changeLogs: AuditLogEntry[];
    operationalEvents: AdminOperationalAuditEntry[];
    supportTickets: AdminSupportAuditItem[];
    tenantOptions: Array<{
      id: string;
      name: string;
      slug: string;
      status: string;
    }>;
    overview: ReturnType<typeof buildAdminAuditControlTower>["overview"];
    categories: ReturnType<typeof buildAdminAuditControlTower>["categories"];
    topActors: ReturnType<typeof buildAdminAuditControlTower>["topActors"];
    topTenants: ReturnType<typeof buildAdminAuditControlTower>["topTenants"];
    criticalEvents: ReturnType<typeof buildAdminAuditControlTower>["criticalEvents"];
  };
  error?: string;
};

export type GetAuditLogsResponse = {
  success: boolean;
  data?: {
    logs: AuditLogEntry[];
    summary: AuditLogSummary;
  };
  error?: string;
};

export type AuditLogContextResponse = {
  success: boolean;
  data?: {
    entidade: string;
    entidadeId: string;
    detalhes?: Record<string, any> | null;
  };
  error?: string;
};

async function ensureSuperAdmin() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    throw new Error("Não autenticado");
  }

  const role = (session.user as any)?.role;

  if (role !== "SUPER_ADMIN") {
    throw new Error(
      "Acesso negado. Apenas Super Admins podem acessar os logs de auditoria.",
    );
  }

  return session.user.id;
}

function buildNome(firstName?: string | null, lastName?: string | null) {
  return [firstName, lastName].filter(Boolean).join(" ") || null;
}

function categorizeAcao(acao: string) {
  const normalized = acao?.toUpperCase?.() ?? "";

  if (normalized.includes("CREATE")) {
    return "create" as const;
  }

  if (normalized.includes("UPDATE")) {
    return "update" as const;
  }

  if (normalized.includes("DELETE")) {
    return "delete" as const;
  }

  return "other" as const;
}

function buildSummary(logs: AuditLogEntry[]): AuditLogSummary {
  const summary: AuditLogSummary = {
    total: logs.length,
    porCategoria: {
      create: 0,
      update: 0,
      delete: 0,
      other: 0,
    },
  };

  for (const log of logs) {
    const categoria = categorizeAcao(log.acao);

    summary.porCategoria[categoria] += 1;
  }

  return summary;
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

const SUPPORT_FIRST_RESPONSE_SLA_MINUTES: Record<string, number> = {
  LOW: 24 * 60,
  MEDIUM: 4 * 60,
  HIGH: 60,
  URGENT: 15,
};

function computeSupportDueAt(createdAt: Date, priority: string) {
  const minutes =
    SUPPORT_FIRST_RESPONSE_SLA_MINUTES[priority] ??
    SUPPORT_FIRST_RESPONSE_SLA_MINUTES.MEDIUM;

  return new Date(createdAt.getTime() + minutes * 60 * 1000);
}

function filterLogsBySearch(logs: AuditLogEntry[], search?: string) {
  if (!search || search.trim().length === 0) {
    return logs;
  }

  const searchTerm = search.trim().toLowerCase();

  return logs.filter((log) => {
    const candidateValues = [
      log.acao,
      log.entidade,
      log.entidadeId,
      log.superAdmin?.nome,
      log.superAdmin?.email,
      log.tenant?.nome,
      log.tenant?.slug,
      log.usuario?.nome,
      log.usuario?.email,
    ]
      .filter(Boolean)
      .map((value) => String(value).toLowerCase());

    return candidateValues.some((value) => value.includes(searchTerm));
  });
}

async function loadUnifiedAuditLogs(filters?: AuditLogFilters) {
  const {
    limit = 100,
    fonte,
    tenantId,
    entidade,
    acao,
    search,
    startDate,
    endDate,
  } = filters ?? {};

  const shouldFetchSuperAdmin = fonte !== "TENANT";
  const shouldFetchTenant = fonte !== "SUPER_ADMIN";
  const dateFilter = buildDateRangeFilter(startDate, endDate);

  const [superAdminLogs, tenantLogs] = await Promise.all([
    shouldFetchSuperAdmin
      ? prisma.superAdminAuditLog.findMany({
          orderBy: { createdAt: "desc" },
          where: {
            ...(entidade ? { entidade } : {}),
            ...(acao
              ? {
                  acao: {
                    contains: acao,
                    mode: "insensitive",
                  },
                }
              : {}),
            ...(dateFilter ? { createdAt: dateFilter } : {}),
          },
          include: {
            superAdmin: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        })
      : [],
    shouldFetchTenant
      ? prisma.auditLog.findMany({
          orderBy: { createdAt: "desc" },
          where: {
            ...(tenantId ? { tenantId } : {}),
            ...(entidade ? { entidade } : {}),
            ...(acao
              ? {
                  acao: {
                    contains: acao,
                    mode: "insensitive",
                  },
                }
              : {}),
            ...(dateFilter ? { createdAt: dateFilter } : {}),
          },
          include: {
            tenant: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
            usuario: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        })
      : [],
  ]);

  const logs: AuditLogEntry[] = [
    ...superAdminLogs.map((log) => ({
      id: log.id,
      fonte: "SUPER_ADMIN" as const,
      acao: log.acao,
      entidade: log.entidade,
      entidadeId: log.entidadeId,
      createdAt: log.createdAt.toISOString(),
      ipAddress: log.ipAddress,
      userAgent: log.userAgent,
      dadosAntigos: log.dadosAntigos ?? undefined,
      dadosNovos: log.dadosNovos ?? undefined,
      superAdmin: log.superAdmin
        ? {
            id: log.superAdmin.id,
            nome:
              buildNome(log.superAdmin.firstName, log.superAdmin.lastName) ||
              log.superAdmin.email,
            email: log.superAdmin.email,
          }
        : null,
    })),
    ...tenantLogs.map((log) => ({
      id: log.id,
      fonte: "TENANT" as const,
      acao: log.acao,
      entidade: log.entidade,
      entidadeId: log.entidadeId,
      createdAt: log.createdAt.toISOString(),
      ipAddress: log.ip,
      userAgent: log.userAgent,
      dadosAntigos: log.previousValues ?? undefined,
      dadosNovos: log.dados ?? undefined,
      changedFields: log.changedFields ?? undefined,
      tenant: log.tenant
        ? {
            id: log.tenant.id,
            nome: log.tenant.name,
            slug: log.tenant.slug,
          }
        : null,
      usuario: log.usuario
        ? {
            id: log.usuario.id,
            nome:
              buildNome(log.usuario.firstName, log.usuario.lastName) ||
              log.usuario.email ||
              "",
            email: log.usuario.email ?? "",
          }
        : null,
    })),
  ];

  const filteredLogs = filterLogsBySearch(logs, search);

  filteredLogs.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const limitedLogs = filteredLogs.slice(0, limit);

  return {
    logs: limitedLogs,
    summary: buildSummary(limitedLogs),
  };
}

export async function getSystemAuditLogs(
  filters?: AuditLogFilters,
): Promise<GetAuditLogsResponse> {
  try {
    await ensureSuperAdmin();
    const result = await loadUnifiedAuditLogs(filters);

    return {
      success: true,
      data: {
        logs: result.logs,
        summary: result.summary,
      },
    };
  } catch (error) {
    logger.error("Erro ao buscar logs de auditoria:", error);

    return {
      success: false,
      error: "Erro interno do servidor ao buscar logs de auditoria",
    };
  }
}

function buildOperationalSearchWhere(search?: string) {
  if (!search || search.trim().length === 0) {
    return undefined;
  }

  const searchTerm = search.trim();

  return {
    OR: [
      { action: { contains: searchTerm, mode: "insensitive" as const } },
      { category: { contains: searchTerm, mode: "insensitive" as const } },
      { source: { contains: searchTerm, mode: "insensitive" as const } },
      { status: { contains: searchTerm, mode: "insensitive" as const } },
      { actorName: { contains: searchTerm, mode: "insensitive" as const } },
      { actorEmail: { contains: searchTerm, mode: "insensitive" as const } },
      { entityType: { contains: searchTerm, mode: "insensitive" as const } },
      { entityId: { contains: searchTerm, mode: "insensitive" as const } },
      { route: { contains: searchTerm, mode: "insensitive" as const } },
      { message: { contains: searchTerm, mode: "insensitive" as const } },
    ],
  };
}

function mapOperationalEvent(event: any): AdminOperationalAuditEntry {
  return {
    id: event.id,
    tenant: event.tenant
      ? {
          id: event.tenant.id,
          name: event.tenant.name,
          slug: event.tenant.slug,
          status: event.tenant.status,
        }
      : null,
    category: event.category,
    source: event.source,
    action: event.action,
    status: event.status,
    actorType: event.actorType,
    actorId: event.actorId,
    actorName: event.actorName,
    actorEmail: event.actorEmail,
    entityType: event.entityType,
    entityId: event.entityId,
    route: event.route,
    ipAddress: event.ipAddress,
    userAgent: event.userAgent,
    message: event.message,
    payload: event.payload ?? undefined,
    createdAt: event.createdAt.toISOString(),
  };
}

function mapSupportWaitingFor(
  status: string,
  latestMessage?:
    | {
        authorType: string;
        isInternal: boolean;
      }
    | null,
): AdminSupportAuditItem["waitingFor"] {
  if (status === "CLOSED" || status === "RESOLVED") {
    return "NONE";
  }

  if (status === "WAITING_CUSTOMER") {
    return "REQUESTER";
  }

  if (status === "WAITING_EXTERNAL") {
    return "NONE";
  }

  if (!latestMessage) {
    return "SUPPORT";
  }

  if (
    latestMessage.authorType === "SUPER_ADMIN" ||
    latestMessage.authorType === "SYSTEM"
  ) {
    return latestMessage.isInternal ? "SUPPORT" : "REQUESTER";
  }

  return "SUPPORT";
}

export async function getAdminAuditCenter(
  filters?: AdminAuditCenterFilters,
): Promise<AdminAuditCenterResponse> {
  try {
    await ensureSuperAdmin();

    const limit = filters?.limit ?? 180;
    const tenantId =
      filters?.tenantId && filters.tenantId !== "ALL"
        ? filters.tenantId
        : undefined;
    const dateFilter = buildDateRangeFilter(
      filters?.startDate,
      filters?.endDate,
    );

    const [changeLogResult, operationalEventsRaw, supportTicketsRaw, tenantOptions] =
      await Promise.all([
        loadUnifiedAuditLogs({
          limit,
          tenantId,
          search: filters?.search,
          startDate: filters?.startDate,
          endDate: filters?.endDate,
        }),
        prisma.operationalAuditEvent.findMany({
          where: {
            ...(tenantId ? { tenantId } : {}),
            ...(dateFilter ? { createdAt: dateFilter } : {}),
            ...(buildOperationalSearchWhere(filters?.search) ?? {}),
          },
          include: {
            tenant: {
              select: {
                id: true,
                name: true,
                slug: true,
                status: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
          take: limit,
        }),
        prisma.ticket.findMany({
          where: {
            ...(tenantId ? { tenantId } : {}),
            ...(dateFilter ? { updatedAt: dateFilter } : {}),
          },
          orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
          take: 36,
          include: {
            tenant: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                role: true,
              },
            },
            assignedToSuperAdmin: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
            messages: {
              orderBy: { createdAt: "desc" },
              take: 1,
              select: {
                authorType: true,
                isInternal: true,
              },
            },
          },
        }),
        prisma.tenant.findMany({
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
          },
        }),
      ]);

    const operationalEvents = operationalEventsRaw.map(mapOperationalEvent);
    const changeLogs = changeLogResult.logs;

    const supportTickets: AdminSupportAuditItem[] = supportTicketsRaw.map(
      (ticket) => {
        const firstResponseDueAt = computeSupportDueAt(
          ticket.createdAt,
          ticket.priority,
        );
        const slaBreached = ticket.firstResponseAt
          ? ticket.firstResponseAt > firstResponseDueAt
          : ticket.status !== "CLOSED" &&
            ticket.status !== "RESOLVED" &&
            new Date() > firstResponseDueAt;

        return {
          id: ticket.id,
          title: ticket.title,
          status: ticket.status,
          priority: ticket.priority,
          category: ticket.category,
          supportLevel: ticket.supportLevel,
          createdAt: ticket.createdAt.toISOString(),
          updatedAt: ticket.updatedAt.toISOString(),
          closedAt: ticket.closedAt ? ticket.closedAt.toISOString() : null,
          firstResponseAt: ticket.firstResponseAt
            ? ticket.firstResponseAt.toISOString()
            : null,
          firstResponseDueAt: firstResponseDueAt.toISOString(),
          slaBreached,
          waitingFor: mapSupportWaitingFor(ticket.status, ticket.messages[0] ?? null),
          tenant: {
            id: ticket.tenant.id,
            name: ticket.tenant.name,
            slug: ticket.tenant.slug,
          },
          requester: {
            id: ticket.user.id,
            name:
              buildNome(ticket.user.firstName, ticket.user.lastName) ||
              ticket.user.email,
            email: ticket.user.email,
            role: ticket.user.role,
          },
          assignedTo: ticket.assignedToSuperAdmin
            ? {
                id: ticket.assignedToSuperAdmin.id,
                name:
                  buildNome(
                    ticket.assignedToSuperAdmin.firstName,
                    ticket.assignedToSuperAdmin.lastName,
                  ) || ticket.assignedToSuperAdmin.email,
                email: ticket.assignedToSuperAdmin.email,
              }
            : null,
        };
      },
    );

    const controlTower = buildAdminAuditControlTower({
      operationalEvents,
      changeLogs: changeLogs as AdminAuditChangeEntry[],
      supportTickets,
    });

    return {
      success: true,
      data: {
        changeLogs,
        operationalEvents,
        supportTickets,
        tenantOptions: tenantOptions.map((tenant) => ({
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          status: tenant.status,
        })),
        overview: controlTower.overview,
        categories: controlTower.categories,
        topActors: controlTower.topActors,
        topTenants: controlTower.topTenants,
        criticalEvents: controlTower.criticalEvents,
      },
    };
  } catch (error) {
    logger.error("Erro ao montar central de auditoria:", error);

    return {
      success: false,
      error: "Erro interno do servidor ao montar a central de auditoria.",
    };
  }
}

function convertLogToCsvRow(log: AuditLogEntry) {
  const row = [
    new Date(log.createdAt).toISOString(),
    log.fonte,
    log.acao,
    log.entidade,
    log.entidadeId ?? "",
    log.tenant?.nome ?? "",
    log.tenant?.slug ?? "",
    log.superAdmin?.nome ?? log.usuario?.nome ?? "",
    log.superAdmin?.email ?? log.usuario?.email ?? "",
    log.ipAddress ?? "",
    log.userAgent ?? "",
    log.changedFields?.join("|") ?? "",
    log.dadosAntigos ? JSON.stringify(log.dadosAntigos) : "",
    log.dadosNovos ? JSON.stringify(log.dadosNovos) : "",
  ];

  return row
    .map((cell) => {
      if (cell === null || cell === undefined) {
        return "";
      }

      const value = String(cell);

      if (/[",\n]/.test(value)) {
        return `"${value.replace(/"/g, '""')}"`;
      }

      return value;
    })
    .join(",");
}

export async function getAuditLogContext(
  entidade: string,
  entidadeId: string,
): Promise<AuditLogContextResponse> {
  try {
    await ensureSuperAdmin();

    if (!entidade || !entidadeId) {
      return {
        success: false,
        error: "Entidade ou ID inválidos",
      };
    }

    const normalizedEntidade = entidade.toUpperCase();

    switch (normalizedEntidade) {
      case "USUARIO": {
        const usuario = await prisma.usuario.findUnique({
          where: { id: entidadeId },
          include: {
            tenant: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
          },
        });

        if (!usuario) {
          return {
            success: true,
            data: {
              entidade: normalizedEntidade,
              entidadeId,
              detalhes: null,
            },
          };
        }

        return {
          success: true,
          data: {
            entidade: normalizedEntidade,
            entidadeId,
            detalhes: {
              id: usuario.id,
              nome:
                buildNome(usuario.firstName, usuario.lastName) || usuario.email,
              email: usuario.email,
              role: usuario.role,
              ativo: usuario.active,
              tenant: usuario.tenant
                ? {
                    id: usuario.tenant.id,
                    nome: usuario.tenant.name,
                    slug: usuario.tenant.slug,
                  }
                : null,
              criadoEm: usuario.createdAt.toISOString(),
              atualizadoEm: usuario.updatedAt.toISOString(),
            },
          },
        };
      }
      case "TENANT": {
        const tenant = await prisma.tenant.findUnique({
          where: { id: entidadeId },
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            tipoPessoa: true,
            email: true,
            telefone: true,
            createdAt: true,
            updatedAt: true,
          },
        });

        return {
          success: true,
          data: {
            entidade: normalizedEntidade,
            entidadeId,
            detalhes: tenant
              ? {
                  ...tenant,
                  createdAt: tenant.createdAt.toISOString(),
                  updatedAt: tenant.updatedAt.toISOString(),
                }
              : null,
          },
        };
      }
      default:
        return {
          success: true,
          data: {
            entidade: normalizedEntidade,
            entidadeId,
            detalhes: null,
          },
        };
    }
  } catch (error) {
    logger.error("Erro ao buscar contexto do log de auditoria:", error);

    return {
      success: false,
      error: "Erro interno ao buscar contexto do log",
    };
  }
}

export async function exportSystemAuditLogs(filters?: AuditLogFilters) {
  try {
    const result = await getSystemAuditLogs({
      ...filters,
      limit: filters?.limit ?? 1000,
    });

    if (!result.success || !result.data) {
      return {
        success: false,
        error: result.error ?? "Não foi possível exportar os logs",
      };
    }

    const header = [
      "createdAt",
      "fonte",
      "acao",
      "entidade",
      "entidadeId",
      "tenantNome",
      "tenantSlug",
      "usuarioNome",
      "usuarioEmail",
      "ip",
      "userAgent",
      "changedFields",
      "dadosAntigos",
      "dadosNovos",
    ].join(",");

    const rows = result.data.logs.map(convertLogToCsvRow);
    const csv = [header, ...rows].join("\n");

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

    return {
      success: true,
      data: csv,
      filename: `audit-logs-${timestamp}.csv`,
    };
  } catch (error) {
    logger.error("Erro ao exportar logs de auditoria:", error);

    return {
      success: false,
      error: "Erro interno do servidor ao exportar logs de auditoria",
    };
  }
}
