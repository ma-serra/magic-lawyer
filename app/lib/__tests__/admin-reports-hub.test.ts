import {
  buildAdminReportsCatalog,
  resolveAdminReportsRange,
} from "@/app/lib/admin-reports-hub";

describe("admin reports hub", () => {
  it("resolve o recorte padrao do ano atual", () => {
    const now = new Date("2026-03-15T12:00:00.000Z");
    const range = resolveAdminReportsRange("YTD", now);

    expect(range.label).toBe("Ano atual");
    expect(range.start?.getFullYear()).toBe(2026);
    expect(range.start?.getMonth()).toBe(0);
    expect(range.start?.getDate()).toBe(1);
    expect(range.end.toISOString()).toBe("2026-03-15T12:00:00.000Z");
  });

  it("monta o catalogo completo com frentes e sinais reais", () => {
    const catalog = buildAdminReportsCatalog({
      mrr: 1200,
      arr: 14400,
      billedRevenue: 5400,
      receivedRevenue: 4100,
      collectionRate: 4100 / 5400,
      activeSubscriptions: 8,
      openInvoices: 5,
      overdueInvoices: 2,
      premiumRevenue: 1200,
      premiumSubscriptions: 3,
      paymentMethodCount: 3,
      activeTenants: 5,
      totalTenants: 7,
      suspendedTenants: 1,
      cancelledTenants: 1,
      activeUsers: 24,
      totalUsers: 31,
      clients: 215,
      processes: 3200,
      topTenants: 5,
      atRiskTenants: 2,
      openTickets: 12,
      slaBreached: 3,
      waitingCustomer: 4,
      waitingExternal: 1,
      avgFirstResponseMinutes: 52,
      avgResolutionHours: 7.5,
      csatAverage: 4.4,
      ratingsCount: 11,
      openTasks: 18,
      completedTasks: 44,
      upcomingEvents: 9,
      dueSoonDeadlines: 6,
      overdueDeadlines: 1,
      documentsCreated: 83,
      petitionProtocols: 12,
      processesCreated: 19,
      newLeads: 14,
      qualifiedLeads: 6,
      negotiationLeads: 3,
      wonLeads: 2,
      lostLeads: 1,
      staleLeads: 4,
      leadSources: 2,
      adminAuditEvents: 10,
      tenantAuditEvents: 42,
      criticalActions: 3,
      riskSignals: 8,
      activePackageSubscriptions: 4,
      authorityUnlocks: 18,
      inpiDossiers: 9,
      inpiCriticalRisk: 2,
    });

    expect(catalog).toHaveLength(7);
    expect(catalog.flatMap((section) => section.items)).toHaveLength(56);
    expect(catalog[0]?.label).toBe("Receita e cobranca");
    expect(catalog[0]?.items[4]?.status).toBe("ATENCAO");
    expect(catalog[2]?.items[1]?.status).toBe("ATENCAO");
    expect(catalog[6]?.items[7]?.liveMetricValue).toBe(2);
  });
});
