import { buildFinanceiroAdminDashboard } from "@/app/lib/financeiro-admin-dashboard";

describe("financeiro admin dashboard", () => {
  const now = new Date("2026-03-15T12:00:00.000Z");

  const tenantOptions = [
    {
      key: "tenant-1",
      label: "RVB Advocacia",
      status: "ACTIVE",
      description: "rvb · ACTIVE",
    },
    {
      key: "tenant-2",
      label: "Souza Costa Advogados Associados",
      status: "ACTIVE",
      description: "sandra · ACTIVE",
    },
  ];

  const invoices = [
    {
      id: "inv-1",
      tenantId: "tenant-1",
      tenantName: "RVB Advocacia",
      tenantSlug: "rvb",
      tenantStatus: "ACTIVE",
      numero: "FAT-001",
      valor: 100,
      status: "PAGA",
      createdAt: new Date("2026-03-05T10:00:00.000Z"),
      vencimento: new Date("2026-03-10T10:00:00.000Z"),
      pagoEm: new Date("2026-03-08T10:00:00.000Z"),
      subscriptionId: "sub-1",
      contratoId: null,
      metadata: null,
    },
    {
      id: "inv-2",
      tenantId: "tenant-1",
      tenantName: "RVB Advocacia",
      tenantSlug: "rvb",
      tenantStatus: "ACTIVE",
      numero: "FAT-002",
      valor: 80,
      status: "VENCIDA",
      createdAt: new Date("2026-03-01T10:00:00.000Z"),
      vencimento: new Date("2026-03-09T10:00:00.000Z"),
      pagoEm: null,
      subscriptionId: null,
      contratoId: null,
      metadata: { billingContext: "PACOTE_AUTORIDADE" },
    },
    {
      id: "inv-3",
      tenantId: "tenant-2",
      tenantName: "Souza Costa Advogados Associados",
      tenantSlug: "sandra",
      tenantStatus: "ACTIVE",
      numero: "FAT-003",
      valor: 50,
      status: "ABERTA",
      createdAt: new Date("2026-03-10T10:00:00.000Z"),
      vencimento: new Date("2026-03-20T10:00:00.000Z"),
      pagoEm: null,
      subscriptionId: null,
      contratoId: "ctr-1",
      metadata: null,
    },
  ];

  const payments = [
    {
      id: "pay-1",
      tenantId: "tenant-1",
      tenantName: "RVB Advocacia",
      tenantSlug: "rvb",
      tenantStatus: "ACTIVE",
      invoiceId: "inv-1",
      invoiceNumero: "FAT-001",
      invoiceStatus: "PAGA",
      valor: 100,
      status: "PAGO",
      metodo: "PIX",
      createdAt: new Date("2026-03-08T10:00:00.000Z"),
      confirmadoEm: new Date("2026-03-08T10:00:00.000Z"),
      billingContext: "ASSINATURA",
    },
  ];

  const subscriptions = [
    {
      tenantId: "tenant-1",
      tenantName: "RVB Advocacia",
      tenantSlug: "rvb",
      status: "ATIVA",
      valorMensalContratado: 120,
      valorAnualContratado: null,
    },
  ];

  const commissions = [
    {
      id: "commission-1",
      tenantId: "tenant-1",
      tenantName: "RVB Advocacia",
      tenantSlug: "rvb",
      advogadoNome: "Luciano Santos",
      advogadoOab: "12345/BA",
      valorComissao: 20,
      percentualComissao: 20,
      status: "PENDENTE",
      createdAt: new Date("2026-03-08T10:00:00.000Z"),
      dataPagamento: null,
      faturaNumero: "FAT-001",
    },
  ];

  it("agrega receita, aging, forecast e repasse do recorte", () => {
    const dashboard = buildFinanceiroAdminDashboard({
      filters: {
        preset: "90D",
        tenantId: null,
        invoiceStatus: "ALL",
        billingContext: "ALL",
      },
      tenantOptions,
      invoices,
      payments,
      subscriptions,
      commissions,
      now,
    });

    expect(dashboard.summary.totalFaturadoPeriodo).toBe(230);
    expect(dashboard.summary.totalRecebidoPeriodo).toBe(100);
    expect(dashboard.summary.contasReceberAbertas).toBe(130);
    expect(dashboard.summary.contasReceberVencidas).toBe(80);
    expect(dashboard.summary.dueIn7Days).toBe(50);
    expect(dashboard.summary.forecast30d).toBe(50);
    expect(dashboard.summary.pendingCommissionsValue).toBe(20);
    expect(dashboard.summary.mrr).toBe(120);
    expect(dashboard.summary.arr).toBe(1440);
    expect(dashboard.summary.activeTenants).toBe(1);
    expect(dashboard.summary.collectionRate).toBeCloseTo(100 / 230, 5);

    expect(
      dashboard.aging.find((bucket) => bucket.bucket === "current")?.valor,
    ).toBe(50);
    expect(
      dashboard.aging.find((bucket) => bucket.bucket === "1_30")?.valor,
    ).toBe(80);

    expect(dashboard.revenueMix).toEqual([
      {
        key: "ASSINATURA",
        label: "Assinaturas",
        valor: 100,
        quantidade: 1,
      },
    ]);
    expect(dashboard.topRiskTenants[0]?.tenantId).toBe("tenant-1");
    expect(dashboard.pendingCommissions).toHaveLength(1);
  });

  it("filtra corretamente por contexto de receita premium", () => {
    const dashboard = buildFinanceiroAdminDashboard({
      filters: {
        preset: "90D",
        tenantId: null,
        invoiceStatus: "ALL",
        billingContext: "PACOTE_AUTORIDADE",
      },
      tenantOptions,
      invoices,
      payments,
      subscriptions,
      commissions,
      now,
    });

    expect(dashboard.summary.totalFaturadoPeriodo).toBe(80);
    expect(dashboard.summary.totalRecebidoPeriodo).toBe(0);
    expect(dashboard.summary.contasReceberAbertas).toBe(80);
    expect(dashboard.summary.contasReceberVencidas).toBe(80);
    expect(dashboard.recentInvoices).toHaveLength(1);
    expect(dashboard.recentInvoices[0]?.numero).toBe("FAT-002");
    expect(dashboard.recentPayments).toHaveLength(0);
  });

  it("separa métodos legados dos canais suportados atualmente", () => {
    const dashboard = buildFinanceiroAdminDashboard({
      filters: {
        preset: "90D",
        tenantId: null,
        invoiceStatus: "ALL",
        billingContext: "ALL",
      },
      tenantOptions,
      invoices,
      payments: [
        ...payments,
        {
          id: "pay-legacy",
          tenantId: "tenant-2",
          tenantName: "Souza Costa Advogados Associados",
          tenantSlug: "sandra",
          tenantStatus: "ACTIVE",
          invoiceId: "inv-3",
          invoiceNumero: "FAT-003",
          invoiceStatus: "ABERTA",
          valor: 25,
          status: "PAGO",
          metodo: "Débito Automático",
          createdAt: new Date("2026-03-12T10:00:00.000Z"),
          confirmadoEm: new Date("2026-03-12T10:00:00.000Z"),
          billingContext: "CONTRATO",
        },
      ],
      subscriptions,
      commissions,
      now,
    });

    expect(dashboard.paymentMethods).toEqual([
      {
        key: "PIX",
        label: "PIX",
        valor: 100,
        quantidade: 1,
      },
    ]);
    expect(dashboard.legacyPaymentMethods).toEqual([
      {
        rawMethod: "Débito Automático",
        label: "Débito Automático",
        valor: 25,
        quantidade: 1,
      },
    ]);
  });
});
