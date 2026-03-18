export type AdminAuditTabKey =
  | "overview"
  | "changes"
  | "access"
  | "support"
  | "emails"
  | "webhooks"
  | "crons";

export type AdminAuditStatus = "SUCCESS" | "WARNING" | "ERROR" | "INFO";

export interface AdminAuditTenantRef {
  id: string;
  name: string;
  slug: string | null;
  status?: string | null;
}

export interface AdminOperationalAuditEntry {
  id: string;
  tenant: AdminAuditTenantRef | null;
  category: string;
  source: string;
  action: string;
  status: string;
  actorType: string | null;
  actorId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  entityType: string | null;
  entityId: string | null;
  route: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  message: string | null;
  payload?: unknown;
  createdAt: string;
}

export interface AdminAuditChangeEntry {
  id: string;
  fonte: "SUPER_ADMIN" | "TENANT";
  acao: string;
  entidade: string;
  entidadeId?: string | null;
  createdAt: string;
  tenant?: AdminAuditTenantRef | null;
  superAdmin?: {
    id: string;
    nome: string;
    email: string;
  } | null;
  usuario?: {
    id: string;
    nome: string;
    email: string;
  } | null;
  changedFields?: string[];
}

export interface AdminSupportAuditItem {
  id: string;
  title: string;
  status: string;
  priority: string;
  category: string;
  supportLevel: string;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  firstResponseAt: string | null;
  firstResponseDueAt: string | null;
  slaBreached: boolean;
  waitingFor: "SUPPORT" | "REQUESTER" | "NONE";
  tenant: {
    id: string;
    name: string;
    slug: string;
  };
  requester: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  assignedTo: {
    id: string;
    name: string;
    email: string;
  } | null;
}

export interface AdminAuditControlTowerInput {
  operationalEvents: AdminOperationalAuditEntry[];
  changeLogs: AdminAuditChangeEntry[];
  supportTickets: AdminSupportAuditItem[];
  now?: Date;
}

function toTimestamp(value: string) {
  return new Date(value).getTime();
}

function isWithinLastHours(value: string, now: Date, hours: number) {
  return now.getTime() - toTimestamp(value) <= hours * 60 * 60 * 1000;
}

function normalizeStatus(value?: string | null): AdminAuditStatus {
  switch ((value ?? "").toUpperCase()) {
    case "SUCCESS":
      return "SUCCESS";
    case "WARNING":
      return "WARNING";
    case "ERROR":
      return "ERROR";
    default:
      return "INFO";
  }
}

function mapCategoryToTab(category: string): Exclude<AdminAuditTabKey, "overview" | "changes"> {
  switch (category) {
    case "ACCESS":
      return "access";
    case "SUPPORT":
      return "support";
    case "EMAIL":
      return "emails";
    case "WEBHOOK":
      return "webhooks";
    case "CRON":
      return "crons";
    default:
      return "support";
  }
}

export function filterOperationalEventsByTab(
  events: AdminOperationalAuditEntry[],
  tab: AdminAuditTabKey,
) {
  if (tab === "overview" || tab === "changes") {
    return events;
  }

  return events.filter((event) => mapCategoryToTab(event.category) === tab);
}

export function buildAdminAuditControlTower(
  input: AdminAuditControlTowerInput,
) {
  const now = input.now ?? new Date();
  const events24h = input.operationalEvents.filter((event) =>
    isWithinLastHours(event.createdAt, now, 24),
  );
  const changeLogs24h = input.changeLogs.filter((log) =>
    isWithinLastHours(log.createdAt, now, 24),
  );

  const categoryCounts: Record<
    Exclude<AdminAuditTabKey, "overview">,
    { count: number; errors: number; lastEventAt: string | null }
  > = {
    changes: { count: input.changeLogs.length, errors: 0, lastEventAt: null },
    access: { count: 0, errors: 0, lastEventAt: null },
    support: { count: 0, errors: 0, lastEventAt: null },
    emails: { count: 0, errors: 0, lastEventAt: null },
    webhooks: { count: 0, errors: 0, lastEventAt: null },
    crons: { count: 0, errors: 0, lastEventAt: null },
  };

  for (const log of input.changeLogs) {
    if (
      !categoryCounts.changes.lastEventAt ||
      toTimestamp(log.createdAt) > toTimestamp(categoryCounts.changes.lastEventAt)
    ) {
      categoryCounts.changes.lastEventAt = log.createdAt;
    }
  }

  for (const event of input.operationalEvents) {
    const tab = mapCategoryToTab(event.category);
    const stats = categoryCounts[tab];

    stats.count += 1;

    if (normalizeStatus(event.status) === "ERROR") {
      stats.errors += 1;
    }

    if (!stats.lastEventAt || toTimestamp(event.createdAt) > toTimestamp(stats.lastEventAt)) {
      stats.lastEventAt = event.createdAt;
    }
  }

  const actorFrequency = new Map<
    string,
    { name: string; email: string | null; total: number; lastEventAt: string }
  >();
  for (const event of input.operationalEvents) {
    const actorKey = event.actorId || event.actorEmail || event.actorName;
    if (!actorKey) continue;

    const label =
      event.actorName || event.actorEmail || event.actorId || "Ator desconhecido";
    const current = actorFrequency.get(actorKey);

    if (!current) {
      actorFrequency.set(actorKey, {
        name: label,
        email: event.actorEmail,
        total: 1,
        lastEventAt: event.createdAt,
      });
      continue;
    }

    current.total += 1;
    if (toTimestamp(event.createdAt) > toTimestamp(current.lastEventAt)) {
      current.lastEventAt = event.createdAt;
    }
  }

  const tenantFrequency = new Map<
    string,
    { name: string; slug: string | null; total: number; lastEventAt: string }
  >();
  for (const item of [...input.operationalEvents, ...input.changeLogs]) {
    const tenant = item.tenant;
    if (!tenant?.id) continue;

    const current = tenantFrequency.get(tenant.id);

    if (!current) {
      tenantFrequency.set(tenant.id, {
        name: tenant.name,
        slug: tenant.slug,
        total: 1,
        lastEventAt: item.createdAt,
      });
      continue;
    }

    current.total += 1;
    if (toTimestamp(item.createdAt) > toTimestamp(current.lastEventAt)) {
      current.lastEventAt = item.createdAt;
    }
  }

  const criticalEvents = input.operationalEvents
    .filter((event) => normalizeStatus(event.status) === "ERROR")
    .sort((a, b) => toTimestamp(b.createdAt) - toTimestamp(a.createdAt))
    .slice(0, 8);

  const supportOpen = input.supportTickets.filter(
    (ticket) => ticket.status !== "CLOSED",
  ).length;
  const supportBreached = input.supportTickets.filter(
    (ticket) => ticket.slaBreached,
  ).length;

  return {
    overview: {
      operationalEventsTotal: input.operationalEvents.length,
      changeLogsTotal: input.changeLogs.length,
      access24h: events24h.filter((event) => event.category === "ACCESS").length,
      emails24h: events24h.filter(
        (event) =>
          event.category === "EMAIL" && event.action === "EMAIL_SENT",
      ).length,
      webhooks24h: events24h.filter((event) => event.category === "WEBHOOK").length,
      crons24h: events24h.filter((event) => event.category === "CRON").length,
      supportTouches24h: events24h.filter((event) => event.category === "SUPPORT")
        .length,
      supportOpen,
      supportBreached,
      changeLogs24h: changeLogs24h.length,
      criticalEvents24h: events24h.filter(
        (event) => normalizeStatus(event.status) === "ERROR",
      ).length,
    },
    categories: [
      {
        key: "changes" as const,
        label: "Alterações",
        ...categoryCounts.changes,
      },
      {
        key: "access" as const,
        label: "Acessos",
        ...categoryCounts.access,
      },
      {
        key: "support" as const,
        label: "Suporte",
        ...categoryCounts.support,
      },
      {
        key: "emails" as const,
        label: "Emails",
        ...categoryCounts.emails,
      },
      {
        key: "webhooks" as const,
        label: "Webhooks",
        ...categoryCounts.webhooks,
      },
      {
        key: "crons" as const,
        label: "Crons",
        ...categoryCounts.crons,
      },
    ],
    topActors: Array.from(actorFrequency.values())
      .sort((a, b) => b.total - a.total || toTimestamp(b.lastEventAt) - toTimestamp(a.lastEventAt))
      .slice(0, 6),
    topTenants: Array.from(tenantFrequency.values())
      .sort((a, b) => b.total - a.total || toTimestamp(b.lastEventAt) - toTimestamp(a.lastEventAt))
      .slice(0, 6),
    criticalEvents,
  };
}
