import {
  buildAdminAuditControlTower,
  filterOperationalEventsByTab,
} from "@/app/lib/admin-audit-center";

describe("admin audit center", () => {
  const now = new Date("2026-03-16T18:00:00.000Z");

  const operationalEvents = [
    {
      id: "evt-access",
      tenant: {
        id: "tenant-1",
        name: "RVB Advocacia",
        slug: "rvb",
        status: "ACTIVE",
      },
      category: "ACCESS",
      source: "NEXTAUTH",
      action: "LOGIN_SUCCESS",
      status: "SUCCESS",
      actorType: "TENANT_USER",
      actorId: "user-1",
      actorName: "Admin RVB",
      actorEmail: "admin@rvb.adv.br",
      entityType: "USUARIO",
      entityId: "user-1",
      route: "/api/auth/[...nextauth]",
      ipAddress: "127.0.0.1",
      userAgent: "Playwright",
      message: "Login autorizado",
      createdAt: "2026-03-16T17:30:00.000Z",
    },
    {
      id: "evt-email",
      tenant: {
        id: "tenant-1",
        name: "RVB Advocacia",
        slug: "rvb",
        status: "ACTIVE",
      },
      category: "EMAIL",
      source: "RESEND",
      action: "EMAIL_SENT",
      status: "SUCCESS",
      actorType: "SYSTEM",
      actorId: null,
      actorName: null,
      actorEmail: null,
      entityType: "EMAIL",
      entityId: "msg-1",
      route: "email-service",
      ipAddress: null,
      userAgent: null,
      message: "Email enviado com sucesso",
      payload: { to: "cliente@teste.com" },
      createdAt: "2026-03-16T17:00:00.000Z",
    },
    {
      id: "evt-cron",
      tenant: null,
      category: "CRON",
      source: "VERCEL_CRON",
      action: "CRON_FAILED",
      status: "ERROR",
      actorType: "CRON",
      actorId: null,
      actorName: null,
      actorEmail: null,
      entityType: "SCHEDULE",
      entityId: "check-deadlines",
      route: "/api/cron/check-deadlines",
      ipAddress: null,
      userAgent: "vercel-cron/1.0",
      message: "Falha na verificação de prazos",
      createdAt: "2026-03-16T17:45:00.000Z",
    },
    {
      id: "evt-support",
      tenant: {
        id: "tenant-2",
        name: "Souza Costa Advogados Associados",
        slug: "sandra",
        status: "ACTIVE",
      },
      category: "SUPPORT",
      source: "SUPPORT_CENTER",
      action: "SUPPORT_THREAD_VIEWED",
      status: "INFO",
      actorType: "SUPER_ADMIN",
      actorId: "sa-1",
      actorName: "Robson Nonato",
      actorEmail: "robson@magiclawyer.com",
      entityType: "TICKET",
      entityId: "ticket-1",
      route: "/admin/suporte",
      ipAddress: null,
      userAgent: null,
      message: "Suporte abriu a thread",
      createdAt: "2026-03-16T17:40:00.000Z",
    },
  ];

  const changeLogs = [
    {
      id: "chg-1",
      fonte: "TENANT" as const,
      acao: "UPDATE_PROCESSO",
      entidade: "PROCESSO",
      entidadeId: "processo-1",
      createdAt: "2026-03-16T16:00:00.000Z",
      tenant: {
        id: "tenant-1",
        name: "RVB Advocacia",
        slug: "rvb",
        status: "ACTIVE",
      },
      usuario: {
        id: "user-1",
        nome: "Admin RVB",
        email: "admin@rvb.adv.br",
      },
      changedFields: ["status"],
    },
  ];

  const supportTickets = [
    {
      id: "ticket-1",
      title: "Webhook do Asaas não baixou",
      status: "OPEN",
      priority: "HIGH",
      category: "TECHNICAL",
      supportLevel: "N1",
      createdAt: "2026-03-16T15:30:00.000Z",
      updatedAt: "2026-03-16T17:40:00.000Z",
      closedAt: null,
      firstResponseAt: null,
      firstResponseDueAt: "2026-03-16T16:30:00.000Z",
      slaBreached: true,
      waitingFor: "SUPPORT" as const,
      tenant: {
        id: "tenant-2",
        name: "Souza Costa Advogados Associados",
        slug: "sandra",
      },
      requester: {
        id: "user-2",
        name: "Sandra Quesia de Souza Costa",
        email: "sandra@adv.br",
        role: "ADMIN",
      },
      assignedTo: null,
    },
  ];

  it("resume trilhas e alerta eventos críticos", () => {
    const dashboard = buildAdminAuditControlTower({
      operationalEvents,
      changeLogs,
      supportTickets,
      now,
    });

    expect(dashboard.overview.operationalEventsTotal).toBe(4);
    expect(dashboard.overview.changeLogsTotal).toBe(1);
    expect(dashboard.overview.access24h).toBe(1);
    expect(dashboard.overview.emails24h).toBe(1);
    expect(dashboard.overview.crons24h).toBe(1);
    expect(dashboard.overview.supportTouches24h).toBe(1);
    expect(dashboard.overview.supportOpen).toBe(1);
    expect(dashboard.overview.supportBreached).toBe(1);
    expect(dashboard.overview.criticalEvents24h).toBe(1);

    expect(
      dashboard.categories.find((item) => item.key === "crons")?.errors,
    ).toBe(1);
    expect(
      dashboard.categories.find((item) => item.key === "notifications")?.count,
    ).toBe(0);
    expect(dashboard.topActors.map((actor) => actor.name)).toContain(
      "Admin RVB",
    );
    expect(dashboard.topTenants[0]?.slug).toBe("rvb");
    expect(dashboard.criticalEvents[0]?.action).toBe("CRON_FAILED");
  });

  it("filtra eventos operacionais por aba", () => {
    expect(filterOperationalEventsByTab(operationalEvents, "access")).toHaveLength(
      1,
    );
    expect(filterOperationalEventsByTab(operationalEvents, "emails")).toHaveLength(
      1,
    );
    expect(
      filterOperationalEventsByTab(operationalEvents, "notifications"),
    ).toHaveLength(0);
    expect(filterOperationalEventsByTab(operationalEvents, "webhooks")).toHaveLength(
      0,
    );
  });
});
