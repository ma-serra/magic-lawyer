"use server";

import { getServerSession } from "next-auth/next";

import prisma from "@/app/lib/prisma";
import {
  buildAdminReportsCatalog,
  buildTrendMonths,
  resolveAdminReportsRange,
  toDecimalNumber,
  type AdminReportsData,
  type AdminReportsFilters,
  type AdminReportsMonthlyPoint,
  type AdminReportsPreset,
} from "@/app/lib/admin-reports-hub";
import { resolveFinanceiroBillingContext } from "@/app/lib/financeiro-admin-dashboard";
import { authOptions } from "@/auth";
import {
  AutoridadeStatusUnlock,
  InvoiceStatus,
  LeadStatus,
  PaymentStatus,
  SubscriptionStatus,
  TenantStatus,
  TicketPriority,
  TicketStatus,
  TarefaStatus,
  PeticaoStatus,
  InpiRisco,
} from "@/generated/prisma";
import logger from "@/lib/logger";

const DEFAULT_PRESET: AdminReportsPreset = "90D";

const FIRST_RESPONSE_SLA_MINUTES: Record<TicketPriority, number> = {
  LOW: 24 * 60,
  MEDIUM: 4 * 60,
  HIGH: 60,
  URGENT: 15,
};

const OPEN_TICKET_STATUSES = new Set<TicketStatus>([
  TicketStatus.OPEN,
  TicketStatus.IN_PROGRESS,
  TicketStatus.WAITING_CUSTOMER,
  TicketStatus.WAITING_EXTERNAL,
]);

const CRITICAL_ACTION_KEYWORDS = [
  "DELETE",
  "REMOVE",
  "SUSPEND",
  "CANCEL",
  "REVOKE",
  "FAIL",
  "ERROR",
  "BLOCK",
  "CHARGEBACK",
  "REFUND",
  "PAYMENT",
];

const PRODUCTION_TENANT_WHERE = {
  slug: {
    not: "global",
  },
  isTestEnvironment: false,
} as const;

type ActionResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function toMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function average(numbers: number[]) {
  if (!numbers.length) return 0;
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function diffMinutes(start: Date, end: Date) {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

function diffHours(start: Date, end: Date) {
  return Math.max(0, Number(((end.getTime() - start.getTime()) / 3600000).toFixed(1)));
}

function getTicketFirstResponseDueAt(createdAt: Date, priority: TicketPriority) {
  return new Date(
    createdAt.getTime() + FIRST_RESPONSE_SLA_MINUTES[priority] * 60 * 1000,
  );
}

function isWithinRange(date: Date | null | undefined, start: Date | null, end: Date) {
  if (!date) return false;
  const time = date.getTime();
  return time >= (start?.getTime() ?? Number.MIN_SAFE_INTEGER) && time <= end.getTime();
}

function isCriticalAction(action: string, entity?: string | null) {
  const haystack = `${action} ${entity ?? ""}`.toUpperCase();
  return CRITICAL_ACTION_KEYWORDS.some((keyword) => haystack.includes(keyword));
}

function tenantStatusLabel(status: TenantStatus) {
  switch (status) {
    case TenantStatus.ACTIVE:
      return "Ativo";
    case TenantStatus.SUSPENDED:
      return "Suspenso";
    case TenantStatus.CANCELLED:
      return "Cancelado";
    default:
      return status;
  }
}

function ticketStatusLabel(status: TicketStatus) {
  switch (status) {
    case TicketStatus.OPEN:
      return "Aberto";
    case TicketStatus.IN_PROGRESS:
      return "Em andamento";
    case TicketStatus.WAITING_CUSTOMER:
      return "Aguardando cliente";
    case TicketStatus.WAITING_EXTERNAL:
      return "Aguardando terceiro";
    case TicketStatus.RESOLVED:
      return "Resolvido";
    case TicketStatus.CLOSED:
      return "Encerrado";
    default:
      return status;
  }
}

function ticketPriorityLabel(priority: TicketPriority) {
  switch (priority) {
    case TicketPriority.LOW:
      return "Baixa";
    case TicketPriority.MEDIUM:
      return "Media";
    case TicketPriority.HIGH:
      return "Alta";
    case TicketPriority.URGENT:
      return "Urgente";
    default:
      return priority;
  }
}

function leadStatusLabel(status: LeadStatus) {
  switch (status) {
    case LeadStatus.NEW:
      return "Novo";
    case LeadStatus.QUALIFIED:
      return "Qualificado";
    case LeadStatus.CONTACTED:
      return "Contatado";
    case LeadStatus.NEGOTIATION:
      return "Negociacao";
    case LeadStatus.WON:
      return "Ganho";
    case LeadStatus.LOST:
      return "Perdido";
    case LeadStatus.SPAM:
      return "Spam";
    default:
      return status;
  }
}

function paymentMethodLabel(method: string | null | undefined) {
  const normalized = String(method ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();

  switch (normalized) {
    case "PIX":
      return "PIX";
    case "BOLETO":
      return "Boleto";
    case "CREDIT_CARD":
    case "CARTAO":
    case "CARTAO DE CREDITO":
    case "CARTAO_CREDITO":
      return "Cartao";
    default:
      return "Outros";
  }
}

function buildBreakdown(values: Map<string, number>) {
  return Array.from(values.entries())
    .map(([label, value]) => ({
      id: label,
      label,
      value,
    }))
    .sort((left, right) => right.value - left.value);
}

function normalizeFilters(input?: Partial<AdminReportsFilters>): AdminReportsFilters {
  const preset = input?.preset ?? DEFAULT_PRESET;
  const tenantId =
    typeof input?.tenantId === "string" && input.tenantId.trim()
      ? input.tenantId
      : "ALL";

  return {
    preset,
    tenantId,
  };
}

async function ensureSuperAdmin() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    throw new Error("Nao autenticado");
  }

  const role = (session.user as { role?: string }).role;

  if (role !== "SUPER_ADMIN") {
    throw new Error("Acesso negado");
  }
}

export async function getAdminReportsHub(
  input?: Partial<AdminReportsFilters>,
): Promise<ActionResponse<AdminReportsData>> {
  try {
    await ensureSuperAdmin();

    const filters = normalizeFilters(input);
    const now = new Date();
    const range = resolveAdminReportsRange(filters.preset, now);
    const trendMonths = buildTrendMonths(now, 6);
    const trendStart = trendMonths[0]?.start ?? startOfDay(now);
    const analysisStart =
      range.start === null
        ? null
        : range.start < trendStart
          ? startOfDay(range.start)
          : startOfDay(trendStart);
    const scopeTenantWhere =
      filters.tenantId === "ALL"
        ? { ...PRODUCTION_TENANT_WHERE }
        : { ...PRODUCTION_TENANT_WHERE, id: filters.tenantId };
    const modelTenantWhere =
      filters.tenantId === "ALL"
        ? { tenant: { ...PRODUCTION_TENANT_WHERE } }
        : {
            tenantId: filters.tenantId,
            tenant: { ...PRODUCTION_TENANT_WHERE },
          };

    const [
      tenantOptions,
      scopeTenants,
      activeUsers,
      payments,
      invoicesForAnalysis,
      currentOpenInvoices,
      tickets,
      leads,
      adminAuditWindow,
      latestAdminAudit,
      tenantAuditWindow,
      tasks,
      upcomingEvents,
      dueSoonDeadlines,
      overdueDeadlines,
      documentsCreated,
      petitionProtocols,
      packageSubscriptions,
      authorityUnlocks,
      inpiDossiers,
      inpiCriticalRisk,
    ] = await Promise.all([
      prisma.tenant.findMany({
        where: PRODUCTION_TENANT_WHERE,
        orderBy: [{ status: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
        },
      }),
      prisma.tenant.findMany({
        where: scopeTenantWhere,
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          createdAt: true,
          subscription: {
            select: {
              status: true,
              valorMensalContratado: true,
              valorAnualContratado: true,
            },
          },
          _count: {
            select: {
              usuarios: true,
              clientes: true,
              processos: true,
            },
          },
        },
      }),
      prisma.usuario.count({
        where: {
          ...modelTenantWhere,
          active: true,
        },
      }),
      prisma.pagamento.findMany({
        where: {
          ...modelTenantWhere,
          status: PaymentStatus.PAGO,
          confirmadoEm: analysisStart
            ? {
                gte: analysisStart,
                lte: endOfDay(range.end),
              }
            : {
                lte: endOfDay(range.end),
              },
        },
        select: {
          id: true,
          tenantId: true,
          valor: true,
          metodo: true,
          confirmadoEm: true,
          fatura: {
            select: {
              id: true,
              numero: true,
              subscriptionId: true,
              contratoId: true,
              metadata: true,
              tenant: {
                select: {
                  name: true,
                  slug: true,
                  status: true,
                },
              },
            },
          },
        },
      }),
      prisma.fatura.findMany({
        where: {
          ...modelTenantWhere,
          createdAt: analysisStart
            ? {
                gte: analysisStart,
                lte: endOfDay(range.end),
              }
            : {
                lte: endOfDay(range.end),
              },
        },
        select: {
          id: true,
          tenantId: true,
          valor: true,
          status: true,
          createdAt: true,
          vencimento: true,
          subscriptionId: true,
          contratoId: true,
          metadata: true,
          tenant: {
            select: {
              name: true,
              slug: true,
              status: true,
            },
          },
        },
      }),
      prisma.fatura.findMany({
        where: {
          ...modelTenantWhere,
          status: {
            in: [InvoiceStatus.ABERTA, InvoiceStatus.VENCIDA],
          },
        },
        select: {
          id: true,
          tenantId: true,
          valor: true,
          status: true,
          tenant: {
            select: {
              name: true,
              slug: true,
              status: true,
            },
          },
        },
      }),
      prisma.ticket.findMany({
        where: {
          ...(filters.tenantId === "ALL" ? {} : { tenantId: filters.tenantId }),
          tenant: PRODUCTION_TENANT_WHERE,
        },
        select: {
          id: true,
          title: true,
          tenantId: true,
          status: true,
          priority: true,
          createdAt: true,
          updatedAt: true,
          closedAt: true,
          firstResponseAt: true,
          requesterRating: true,
          tenant: {
            select: {
              name: true,
              slug: true,
            },
          },
        },
      }),
      prisma.lead.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          status: true,
          source: true,
          createdAt: true,
          updatedAt: true,
          firstContactAt: true,
          lastInteractionAt: true,
          convertedAt: true,
          closedAt: true,
        },
      }),
      prisma.superAdminAuditLog.findMany({
        where: {
          createdAt: range.start
            ? {
                gte: startOfDay(range.start),
                lte: endOfDay(range.end),
              }
            : {
                lte: endOfDay(range.end),
              },
        },
        select: {
          id: true,
          acao: true,
          entidade: true,
          createdAt: true,
          superAdmin: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
      prisma.superAdminAuditLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 8,
        select: {
          id: true,
          acao: true,
          entidade: true,
          createdAt: true,
          superAdmin: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
      prisma.auditLog.findMany({
        where: {
          ...(modelTenantWhere ?? {}),
          createdAt: range.start
            ? {
                gte: startOfDay(range.start),
                lte: endOfDay(range.end),
              }
            : {
                lte: endOfDay(range.end),
              },
        },
        select: {
          id: true,
          acao: true,
          entidade: true,
          createdAt: true,
        },
      }),
      prisma.tarefa.findMany({
        where: {
          ...(modelTenantWhere ?? {}),
          deletedAt: null,
        },
        select: {
          id: true,
          status: true,
          createdAt: true,
          completedAt: true,
          dataLimite: true,
        },
      }),
      prisma.evento.count({
        where: {
          ...(modelTenantWhere ?? {}),
          dataInicio: {
            gte: startOfDay(now),
            lte: endOfDay(new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)),
          },
        },
      }),
      prisma.processoPrazo.count({
        where: {
          ...(modelTenantWhere ?? {}),
          status: "ABERTO",
          dataVencimento: {
            gte: startOfDay(now),
            lte: endOfDay(new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)),
          },
        },
      }),
      prisma.processoPrazo.count({
        where: {
          ...(modelTenantWhere ?? {}),
          status: "ABERTO",
          dataVencimento: {
            lt: startOfDay(now),
          },
        },
      }),
      prisma.documento.count({
        where: {
          ...(modelTenantWhere ?? {}),
          deletedAt: null,
          createdAt: range.start
            ? {
                gte: startOfDay(range.start),
                lte: endOfDay(range.end),
              }
            : {
                lte: endOfDay(range.end),
              },
        },
      }),
      prisma.peticao.count({
        where: {
          ...(modelTenantWhere ?? {}),
          status: PeticaoStatus.PROTOCOLADA,
          protocoladoEm: range.start
            ? {
                gte: startOfDay(range.start),
                lte: endOfDay(range.end),
              }
            : {
                lte: endOfDay(range.end),
              },
        },
      }),
      prisma.assinaturaPacoteJuiz.findMany({
        where: {
          ...(filters.tenantId === "ALL" ? {} : { tenantId: filters.tenantId }),
          tenant: PRODUCTION_TENANT_WHERE,
        },
        select: {
          id: true,
          status: true,
          precoPago: true,
          createdAt: true,
        },
      }),
      prisma.autoridadeTenantUnlock.count({
        where: {
          ...(modelTenantWhere ?? {}),
          status: AutoridadeStatusUnlock.ATIVO,
        },
      }),
      prisma.inpiDossie.count({
        where: modelTenantWhere ?? undefined,
      }),
      prisma.inpiDossie.count({
        where: {
          ...(modelTenantWhere ?? {}),
          riscoAtual: InpiRisco.CRITICO,
        },
      }),
    ]);

    const selectedTenant =
      filters.tenantId === "ALL"
        ? null
        : tenantOptions.find((tenant) => tenant.id === filters.tenantId) ?? null;

    const totalTenants = scopeTenants.length;
    const activeTenants = scopeTenants.filter(
      (tenant) => tenant.status === TenantStatus.ACTIVE,
    ).length;
    const suspendedTenants = scopeTenants.filter(
      (tenant) => tenant.status === TenantStatus.SUSPENDED,
    ).length;
    const cancelledTenants = scopeTenants.filter(
      (tenant) => tenant.status === TenantStatus.CANCELLED,
    ).length;
    const totalUsers = scopeTenants.reduce(
      (sum, tenant) => sum + tenant._count.usuarios,
      0,
    );
    const totalClients = scopeTenants.reduce(
      (sum, tenant) => sum + tenant._count.clientes,
      0,
    );
    const totalProcesses = scopeTenants.reduce(
      (sum, tenant) => sum + tenant._count.processos,
      0,
    );

    const currentOpenInvoiceMap = new Map<
      string,
      { count: number; total: number; status: TenantStatus; name: string; slug: string }
    >();
    for (const invoice of currentOpenInvoices) {
      const base = currentOpenInvoiceMap.get(invoice.tenantId) ?? {
        count: 0,
        total: 0,
        status: invoice.tenant.status,
        name: invoice.tenant.name,
        slug: invoice.tenant.slug,
      };
      base.count += 1;
      base.total += toDecimalNumber(invoice.valor);
      currentOpenInvoiceMap.set(invoice.tenantId, base);
    }

    const windowStart = range.start ? startOfDay(range.start) : null;
    const windowEnd = endOfDay(range.end);

    const windowPayments = payments.filter((payment) =>
      isWithinRange(payment.confirmadoEm, windowStart, windowEnd),
    );
    const windowInvoices = invoicesForAnalysis.filter((invoice) =>
      isWithinRange(invoice.createdAt, windowStart, windowEnd),
    );
    const currentOpenTickets = tickets.filter((ticket) =>
      OPEN_TICKET_STATUSES.has(ticket.status),
    );
    const windowTickets = tickets.filter((ticket) =>
      isWithinRange(ticket.createdAt, windowStart, windowEnd),
    );
    const currentLeads = leads;
    const windowLeads = leads.filter((lead) =>
      isWithinRange(lead.createdAt, windowStart, windowEnd),
    );
    const windowWonLeads = leads.filter((lead) =>
      lead.status === LeadStatus.WON &&
      isWithinRange(lead.convertedAt ?? lead.updatedAt, windowStart, windowEnd),
    );
    const windowLostLeads = leads.filter((lead) =>
      lead.status === LeadStatus.LOST &&
      isWithinRange(lead.closedAt ?? lead.updatedAt, windowStart, windowEnd),
    );

    const receivedRevenue = windowPayments.reduce(
      (sum, payment) => sum + toDecimalNumber(payment.valor),
      0,
    );
    const billedRevenue = windowInvoices.reduce(
      (sum, invoice) => sum + toDecimalNumber(invoice.valor),
      0,
    );
    const collectionRate =
      billedRevenue > 0 ? receivedRevenue / billedRevenue : 0;

    const paymentMethodMap = new Map<string, number>();
    const revenueByTenantMap = new Map<
      string,
      { value: number; name: string; slug: string; status: TenantStatus }
    >();
    let premiumRevenue = 0;

    for (const payment of windowPayments) {
      const label = paymentMethodLabel(payment.metodo);
      paymentMethodMap.set(label, (paymentMethodMap.get(label) ?? 0) + 1);

      const currentRevenue = revenueByTenantMap.get(payment.tenantId) ?? {
        value: 0,
        name: payment.fatura.tenant.name,
        slug: payment.fatura.tenant.slug,
        status: payment.fatura.tenant.status,
      };
      currentRevenue.value += toDecimalNumber(payment.valor);
      revenueByTenantMap.set(payment.tenantId, currentRevenue);

      if (
        resolveFinanceiroBillingContext({
          subscriptionId: payment.fatura.subscriptionId,
          contratoId: payment.fatura.contratoId,
          metadata:
            payment.fatura.metadata &&
            typeof payment.fatura.metadata === "object" &&
            !Array.isArray(payment.fatura.metadata)
              ? (payment.fatura.metadata as Record<string, unknown>)
              : null,
        }) === "PACOTE_AUTORIDADE"
      ) {
        premiumRevenue += toDecimalNumber(payment.valor);
      }
    }

    const subscriptions = scopeTenants
      .map((tenant) => tenant.subscription)
      .filter((subscription): subscription is NonNullable<typeof scopeTenants[number]["subscription"]> =>
        Boolean(subscription),
      );
    const activeSubscriptions = subscriptions.filter(
      (subscription) =>
        subscription.status === SubscriptionStatus.ATIVA ||
        subscription.status === SubscriptionStatus.TRIAL,
    );
    const mrr = activeSubscriptions.reduce((sum, subscription) => {
      const monthly = toDecimalNumber(subscription.valorMensalContratado);
      const annual = toDecimalNumber(subscription.valorAnualContratado);
      return sum + monthly + annual / 12;
    }, 0);
    const arr = mrr * 12;

    const packageSubscriptionsInWindow = packageSubscriptions.filter((subscription) =>
      isWithinRange(subscription.createdAt, windowStart, windowEnd),
    );
    const activePackageSubscriptions = packageSubscriptions.filter(
      (subscription) => subscription.status === "ATIVA",
    ).length;
    if (premiumRevenue === 0) {
      premiumRevenue = packageSubscriptionsInWindow.reduce(
        (sum, subscription) => sum + toDecimalNumber(subscription.precoPago),
        0,
      );
    }

    const supportStatusMap = new Map<string, number>();
    const supportPriorityMap = new Map<string, number>();
    const responseMinutes: number[] = [];
    const resolutionHours: number[] = [];
    const ratings: number[] = [];
    let slaBreached = 0;
    let waitingCustomer = 0;
    let waitingExternal = 0;

    const ticketRiskByTenant = new Map<string, number>();

    for (const ticket of tickets) {
      const statusLabel = ticketStatusLabel(ticket.status);
      supportStatusMap.set(statusLabel, (supportStatusMap.get(statusLabel) ?? 0) + 1);

      if (OPEN_TICKET_STATUSES.has(ticket.status)) {
        const priorityLabel = ticketPriorityLabel(ticket.priority);
        supportPriorityMap.set(
          priorityLabel,
          (supportPriorityMap.get(priorityLabel) ?? 0) + 1,
        );
      }

      if (ticket.firstResponseAt) {
        responseMinutes.push(diffMinutes(ticket.createdAt, ticket.firstResponseAt));
      }

      if (
        (ticket.status === TicketStatus.RESOLVED ||
          ticket.status === TicketStatus.CLOSED) &&
        (ticket.closedAt ?? ticket.updatedAt)
      ) {
        resolutionHours.push(
          diffHours(ticket.createdAt, ticket.closedAt ?? ticket.updatedAt),
        );
      }

      if (typeof ticket.requesterRating === "number") {
        ratings.push(ticket.requesterRating);
      }

      if (ticket.status === TicketStatus.WAITING_CUSTOMER) {
        waitingCustomer += 1;
      }

      if (ticket.status === TicketStatus.WAITING_EXTERNAL) {
        waitingExternal += 1;
      }

      if (OPEN_TICKET_STATUSES.has(ticket.status)) {
        const dueAt = getTicketFirstResponseDueAt(ticket.createdAt, ticket.priority);
        const breached = ticket.firstResponseAt
          ? ticket.firstResponseAt > dueAt
          : now > dueAt;

        if (breached) {
          slaBreached += 1;
          ticketRiskByTenant.set(
            ticket.tenantId,
            (ticketRiskByTenant.get(ticket.tenantId) ?? 0) + 2,
          );
        }
      }
    }

    const leadStatusMap = new Map<string, number>();
    const leadSourceMap = new Map<string, number>();
    const staleThreshold = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    for (const lead of currentLeads) {
      leadStatusMap.set(
        leadStatusLabel(lead.status),
        (leadStatusMap.get(leadStatusLabel(lead.status)) ?? 0) + 1,
      );
      leadSourceMap.set(
        lead.source,
        (leadSourceMap.get(lead.source) ?? 0) + 1,
      );
    }

    const qualifiedLeads = currentLeads.filter(
      (lead) => lead.status === LeadStatus.QUALIFIED,
    ).length;
    const negotiationLeads = currentLeads.filter(
      (lead) => lead.status === LeadStatus.NEGOTIATION,
    ).length;
    const staleLeads = currentLeads.filter((lead) => {
      if (
        lead.status === LeadStatus.WON ||
        lead.status === LeadStatus.LOST ||
        lead.status === LeadStatus.SPAM
      ) {
        return false;
      }

      const reference = lead.lastInteractionAt ?? lead.firstContactAt ?? lead.createdAt;
      return reference < staleThreshold;
    }).length;

    const adminAuditEvents = adminAuditWindow.length;
    const tenantAuditEvents = tenantAuditWindow.length;
    const criticalActions =
      adminAuditWindow.filter((entry) =>
        isCriticalAction(entry.acao, entry.entidade),
      ).length +
      tenantAuditWindow.filter((entry) =>
        isCriticalAction(entry.acao, entry.entidade),
      ).length;

    const openTasks = tasks.filter(
      (task) => task.status !== TarefaStatus.CONCLUIDA && task.status !== TarefaStatus.CANCELADA,
    ).length;
    const completedTasks = tasks.filter((task) =>
      isWithinRange(task.completedAt, windowStart, windowEnd),
    ).length;

    const processesCreated = await prisma.processo.count({
      where: {
        ...(modelTenantWhere ?? {}),
        deletedAt: null,
        createdAt: range.start
          ? {
              gte: startOfDay(range.start),
              lte: endOfDay(range.end),
            }
          : {
              lte: endOfDay(range.end),
            },
      },
    });

    const tenantStatusBreakdown = [
      {
        id: "Ativo",
        label: "Ativo",
        value: activeTenants,
      },
      {
        id: "Suspenso",
        label: "Suspenso",
        value: suspendedTenants,
      },
      {
        id: "Cancelado",
        label: "Cancelado",
        value: cancelledTenants,
      },
    ].filter((item) => item.value > 0);

    const monthlySeries: AdminReportsMonthlyPoint[] = trendMonths.map((bucket) => {
      const item: AdminReportsMonthlyPoint = {
        id: bucket.id,
        label: bucket.label,
        faturado: 0,
        recebido: 0,
        ticketsAbertos: 0,
        ticketsResolvidos: 0,
        novosTenants: 0,
        leadsGanhos: 0,
      };

      for (const invoice of invoicesForAnalysis) {
        if (invoice.createdAt >= bucket.start && invoice.createdAt < bucket.end) {
          item.faturado += toDecimalNumber(invoice.valor);
        }
      }

      for (const payment of payments) {
        if (
          payment.confirmadoEm &&
          payment.confirmadoEm >= bucket.start &&
          payment.confirmadoEm < bucket.end
        ) {
          item.recebido += toDecimalNumber(payment.valor);
        }
      }

      for (const ticket of tickets) {
        if (ticket.createdAt >= bucket.start && ticket.createdAt < bucket.end) {
          item.ticketsAbertos += 1;
        }

        const resolvedAt = ticket.closedAt ?? ticket.updatedAt;
        if (
          (ticket.status === TicketStatus.RESOLVED ||
            ticket.status === TicketStatus.CLOSED) &&
          resolvedAt >= bucket.start &&
          resolvedAt < bucket.end
        ) {
          item.ticketsResolvidos += 1;
        }
      }

      for (const tenant of scopeTenants) {
        if (tenant.createdAt >= bucket.start && tenant.createdAt < bucket.end) {
          item.novosTenants += 1;
        }
      }

      for (const lead of leads) {
        const wonAt = lead.convertedAt ?? lead.updatedAt;
        if (
          lead.status === LeadStatus.WON &&
          wonAt >= bucket.start &&
          wonAt < bucket.end
        ) {
          item.leadsGanhos += 1;
        }
      }

      return item;
    });

    const topTenants = Array.from(revenueByTenantMap.entries())
      .sort((left, right) => right[1].value - left[1].value)
      .slice(0, 6)
      .map(([tenantId, entry]) => ({
        id: tenantId,
        title: entry.name,
        subtitle: `${entry.slug} • ${tenantStatusLabel(entry.status)}`,
        value: entry.value,
        format: "currency" as const,
        tone: "success" as const,
        badge: tenantStatusLabel(entry.status),
      }));

    const riskByTenantMap = new Map<
      string,
      { score: number; name: string; slug: string; status: TenantStatus; overdue: number }
    >();

    for (const tenant of scopeTenants) {
      const invoiceRisk = currentOpenInvoiceMap.get(tenant.id)?.count ?? 0;
      const ticketRisk = ticketRiskByTenant.get(tenant.id) ?? 0;
      const statusRisk =
        tenant.status === TenantStatus.SUSPENDED
          ? 4
          : tenant.status === TenantStatus.CANCELLED
            ? 6
            : 0;

      const score = invoiceRisk * 3 + ticketRisk + statusRisk;

      if (score > 0) {
        riskByTenantMap.set(tenant.id, {
          score,
          name: tenant.name,
          slug: tenant.slug,
          status: tenant.status,
          overdue: invoiceRisk,
        });
      }
    }

    const atRiskTenants = Array.from(riskByTenantMap.entries())
      .sort((left, right) => right[1].score - left[1].score)
      .slice(0, 6)
      .map(([tenantId, entry]) => ({
        id: tenantId,
        title: entry.name,
        subtitle: `${entry.slug} • ${entry.overdue} titulo(s) sensivel(is)`,
        value: entry.score,
        format: "integer" as const,
        tone: "danger" as const,
        badge: tenantStatusLabel(entry.status),
      }));

    const latestAudit = latestAdminAudit.map((entry) => ({
      id: entry.id,
      action: entry.acao,
      entity: entry.entidade,
      createdAt: entry.createdAt.toISOString(),
      actor: `${entry.superAdmin.firstName} ${entry.superAdmin.lastName}`.trim(),
    }));

    const latestSupport = tickets
      .slice()
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .slice(0, 8)
      .map((ticket) => {
        const dueAt = getTicketFirstResponseDueAt(ticket.createdAt, ticket.priority);
        const breached = OPEN_TICKET_STATUSES.has(ticket.status)
          ? ticket.firstResponseAt
            ? ticket.firstResponseAt > dueAt
            : now > dueAt
          : false;

        return {
          id: ticket.id,
          title: ticket.title,
          tenantName: ticket.tenant.name,
          status: ticketStatusLabel(ticket.status),
          priority: ticketPriorityLabel(ticket.priority),
          slaBreached: breached,
          createdAt: ticket.createdAt.toISOString(),
        };
      });

    const categories = buildAdminReportsCatalog({
      mrr,
      arr,
      billedRevenue,
      receivedRevenue,
      collectionRate,
      activeSubscriptions: activeSubscriptions.length,
      openInvoices: currentOpenInvoices.length,
      overdueInvoices: currentOpenInvoices.filter(
        (invoice) => invoice.status === InvoiceStatus.VENCIDA,
      ).length,
      premiumRevenue,
      premiumSubscriptions: activePackageSubscriptions,
      paymentMethodCount: paymentMethodMap.size,
      activeTenants,
      totalTenants,
      suspendedTenants,
      cancelledTenants,
      activeUsers,
      totalUsers,
      clients: totalClients,
      processes: totalProcesses,
      topTenants: topTenants.length,
      atRiskTenants: atRiskTenants.length,
      openTickets: currentOpenTickets.length,
      slaBreached,
      waitingCustomer,
      waitingExternal,
      avgFirstResponseMinutes: average(responseMinutes),
      avgResolutionHours: average(resolutionHours),
      csatAverage: average(ratings),
      ratingsCount: ratings.length,
      openTasks,
      completedTasks,
      upcomingEvents,
      dueSoonDeadlines,
      overdueDeadlines,
      documentsCreated,
      petitionProtocols,
      processesCreated,
      newLeads: windowLeads.length,
      qualifiedLeads,
      negotiationLeads,
      wonLeads: windowWonLeads.length,
      lostLeads: windowLostLeads.length,
      staleLeads,
      leadSources: leadSourceMap.size,
      adminAuditEvents,
      tenantAuditEvents,
      criticalActions,
      riskSignals:
        currentOpenInvoices.length +
        slaBreached +
        suspendedTenants +
        cancelledTenants,
      activePackageSubscriptions,
      authorityUnlocks,
      inpiDossiers,
      inpiCriticalRisk,
    });

    const allCatalogItems = categories.flatMap((category) => category.items);
    const spotlightReports = allCatalogItems
      .slice()
      .sort((left, right) => {
        if (left.status !== right.status) {
          return left.status === "ATENCAO" ? -1 : 1;
        }

        return right.liveMetricValue - left.liveMetricValue;
      })
      .slice(0, 10);

    const scopeLabel = selectedTenant
      ? `${selectedTenant.name} (${selectedTenant.slug})`
      : "Visao global de todos os escritorios";

    const data: AdminReportsData = {
      generatedAt: now.toISOString(),
      filters,
      summary: {
        catalogReports: allCatalogItems.length,
        categories: categories.length,
        readyExports: allCatalogItems.filter((item) => item.exports.length > 0).length,
        priorityWatchlist: allCatalogItems.filter((item) => item.status === "ATENCAO")
          .length,
        scopeLabel,
        presetLabel: range.label,
      },
      tenantOptions: tenantOptions.map((tenant) => ({
        key: tenant.id,
        label: tenant.name,
        slug: tenant.slug,
        status: tenantStatusLabel(tenant.status),
      })),
      metricCards: [
        {
          id: "mrr",
          label: "MRR contratual",
          value: mrr,
          helper: `${activeSubscriptions.length} assinatura(s) ativa(s) ou em trial`,
          tone: "success",
          format: "currency",
        },
        {
          id: "recebido",
          label: "Recebido no recorte",
          value: receivedRevenue,
          helper: `${windowPayments.length} pagamento(s) confirmados`,
          tone: "primary",
          format: "currency",
        },
        {
          id: "tenants",
          label: "Tenants ativos",
          value: activeTenants,
          helper: `${totalTenants} tenant(s) no escopo analisado`,
          tone: "secondary",
          format: "integer",
        },
        {
          id: "usuarios",
          label: "Usuarios ativos",
          value: activeUsers,
          helper: `${totalUsers} usuario(s) cadastrados no escopo`,
          tone: "primary",
          format: "integer",
        },
        {
          id: "sla",
          label: "SLA em risco",
          value: slaBreached,
          helper: `${currentOpenTickets.length} ticket(s) em backlog atual`,
          tone: slaBreached > 0 ? "warning" : "success",
          format: "integer",
        },
        {
          id: "inadimplencia",
          label: "Titulos vencidos",
          value: currentOpenInvoices.filter(
            (invoice) => invoice.status === InvoiceStatus.VENCIDA,
          ).length,
          helper: `${currentOpenInvoices.length} titulo(s) em aberto`,
          tone:
            currentOpenInvoices.some(
              (invoice) => invoice.status === InvoiceStatus.VENCIDA,
            )
              ? "danger"
              : "default",
          format: "integer",
        },
        {
          id: "leads",
          label: "Leads qualificados",
          value: qualifiedLeads,
          helper: `${windowLeads.length} entrada(s) comercial(is) no recorte`,
          tone: "warning",
          format: "integer",
        },
        {
          id: "premium",
          label: "Premium ativo",
          value: activePackageSubscriptions,
          helper: `${authorityUnlocks} autoridade(s) desbloqueada(s)`,
          tone: "success",
          format: "integer",
        },
      ],
      monthlySeries,
      paymentMethodBreakdown: buildBreakdown(paymentMethodMap),
      supportStatusBreakdown: buildBreakdown(supportStatusMap),
      supportPriorityBreakdown: buildBreakdown(supportPriorityMap),
      leadStatusBreakdown: buildBreakdown(leadStatusMap),
      tenantStatusBreakdown,
      topTenants,
      atRiskTenants,
      latestAudit,
      latestSupport,
      categories,
      spotlightReports,
    };

    return {
      success: true,
      data,
    };
  } catch (error) {
    logger.error("Erro ao montar hub de relatorios admin", error);

    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro interno do servidor",
    };
  }
}
