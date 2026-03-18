export type FinanceiroAdminFilterPreset =
  | "30D"
  | "90D"
  | "365D"
  | "YTD"
  | "ALL";

export type FinanceiroAdminStatusFilter =
  | "ALL"
  | "ABERTA"
  | "VENCIDA"
  | "PAGA"
  | "CANCELADA"
  | "RASCUNHO"
  | "EM_RISCO";

export type FinanceiroAdminBillingContextFilter =
  | "ALL"
  | "ASSINATURA"
  | "PACOTE_AUTORIDADE"
  | "CONTRATO"
  | "OUTROS";

export type FinanceiroAdminFilters = {
  preset?: FinanceiroAdminFilterPreset;
  tenantId?: string | null;
  invoiceStatus?: FinanceiroAdminStatusFilter;
  billingContext?: FinanceiroAdminBillingContextFilter;
};

export type FinanceiroAdminTenantOption = {
  key: string;
  label: string;
  status: string;
  description: string;
};

export type FinanceiroAdminInvoiceRecord = {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  tenantStatus: string;
  numero: string;
  valor: number;
  status: string;
  createdAt: Date;
  vencimento: Date | null;
  pagoEm: Date | null;
  subscriptionId: string | null;
  contratoId: string | null;
  metadata?: Record<string, unknown> | null;
};

export type FinanceiroAdminPaymentRecord = {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  tenantStatus: string;
  invoiceId: string;
  invoiceNumero: string;
  invoiceStatus: string;
  valor: number;
  status: string;
  metodo: string | null;
  createdAt: Date;
  confirmadoEm: Date | null;
  billingContext: string;
};

export type FinanceiroAdminSubscriptionRecord = {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  status: string;
  valorMensalContratado: number | null;
  valorAnualContratado: number | null;
};

export type FinanceiroAdminCommissionRecord = {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  advogadoNome: string;
  advogadoOab: string;
  valorComissao: number;
  percentualComissao: number;
  status: string;
  createdAt: Date;
  dataPagamento: Date | null;
  faturaNumero: string;
};

export type FinanceiroAdminRevenuePoint = {
  periodKey: string;
  periodo: string;
  faturado: number;
  recebido: number;
  emAberto: number;
  vencido: number;
};

export type FinanceiroAdminAgingPoint = {
  bucket: string;
  label: string;
  valor: number;
  quantidade: number;
};

export type FinanceiroAdminForecastPoint = {
  bucket: string;
  label: string;
  previsto: number;
  emRisco: number;
  quantidade: number;
};

export type FinanceiroAdminBreakdownItem = {
  key: string;
  label: string;
  valor: number;
  quantidade: number;
};

export type FinanceiroAdminLegacyPaymentMethod = {
  rawMethod: string;
  label: string;
  valor: number;
  quantidade: number;
};

export type FinanceiroAdminTenantPerformance = {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  tenantStatus: string;
  recebidoPeriodo: number;
  faturadoPeriodo: number;
  abertoAtual: number;
  vencidoAtual: number;
  collectionRate: number;
  activeSubscriptions: number;
};

export type FinanceiroAdminSummary = {
  totalRecebidoPeriodo: number;
  totalFaturadoPeriodo: number;
  contasReceberAbertas: number;
  contasReceberVencidas: number;
  quantidadeEmAberto: number;
  quantidadeVencida: number;
  pendingCommissionsValue: number;
  mrr: number;
  arr: number;
  arpa: number;
  activeSubscriptions: number;
  activeTenants: number;
  collectionRate: number;
  delinquencyRate: number;
  revenueConcentrationTop5: number;
  forecast30d: number;
  dueIn7Days: number;
};

export type FinanceiroAdminDashboard = {
  generatedAt: string;
  rangeLabel: string;
  filters: Required<Pick<FinanceiroAdminFilters, "preset" | "invoiceStatus" | "billingContext">> & {
    tenantId: string | null;
  };
  tenantOptions: FinanceiroAdminTenantOption[];
  summary: FinanceiroAdminSummary;
  series: FinanceiroAdminRevenuePoint[];
  aging: FinanceiroAdminAgingPoint[];
  forecast: FinanceiroAdminForecastPoint[];
  revenueMix: FinanceiroAdminBreakdownItem[];
  paymentMethods: FinanceiroAdminBreakdownItem[];
  legacyPaymentMethods: FinanceiroAdminLegacyPaymentMethod[];
  topTenants: FinanceiroAdminTenantPerformance[];
  topRiskTenants: FinanceiroAdminTenantPerformance[];
  recentInvoices: FinanceiroAdminInvoiceRecord[];
  recentPayments: FinanceiroAdminPaymentRecord[];
  pendingCommissions: FinanceiroAdminCommissionRecord[];
};

type DashboardBuildInput = {
  filters?: FinanceiroAdminFilters;
  tenantOptions: FinanceiroAdminTenantOption[];
  invoices: FinanceiroAdminInvoiceRecord[];
  payments: FinanceiroAdminPaymentRecord[];
  subscriptions: FinanceiroAdminSubscriptionRecord[];
  commissions: FinanceiroAdminCommissionRecord[];
  now?: Date;
};

const MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
  month: "short",
  year: "numeric",
});

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function toPeriodKey(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${date.getFullYear()}-${month}`;
}

function toMonthLabel(date: Date) {
  const label = MONTH_LABEL_FORMATTER.format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function toFiniteNumber(value: number | null | undefined) {
  return Number.isFinite(value) ? Number(value) : 0;
}

function normalizeMethodToken(value: string | null | undefined) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

function normalizeSupportedPaymentMethod(
  method: string | null | undefined,
): "PIX" | "BOLETO" | "CREDIT_CARD" | null {
  const normalized = normalizeMethodToken(method);

  if (!normalized) {
    return null;
  }

  if (normalized === "PIX") {
    return "PIX";
  }

  if (normalized === "BOLETO" || normalized === "BOLETO BANCARIO") {
    return "BOLETO";
  }

  if (
    normalized === "CREDIT_CARD" ||
    normalized === "CARTAO" ||
    normalized === "CARTAO DE CREDITO" ||
    normalized === "CARTAO_CREDITO"
  ) {
    return "CREDIT_CARD";
  }

  return null;
}

function paymentMethodLabel(
  method: "PIX" | "BOLETO" | "CREDIT_CARD",
) {
  switch (method) {
    case "PIX":
      return "PIX";
    case "BOLETO":
      return "Boleto";
    case "CREDIT_CARD":
      return "Cartão";
  }
}

function safePercent(numerator: number, denominator: number) {
  if (!denominator || denominator <= 0) {
    return 0;
  }

  return numerator / denominator;
}

function isOpenInvoice(status: string) {
  return status === "ABERTA" || status === "VENCIDA";
}

function isCanceledInvoice(status: string) {
  return status === "CANCELADA";
}

export function resolveFinanceiroBillingContext(
  invoice: Pick<
    FinanceiroAdminInvoiceRecord,
    "subscriptionId" | "contratoId" | "metadata"
  >,
): FinanceiroAdminBillingContextFilter {
  const metadataContext = String(
    (invoice.metadata as Record<string, unknown> | null | undefined)
      ?.billingContext ?? "",
  ).trim();

  if (metadataContext === "PACOTE_AUTORIDADE") {
    return "PACOTE_AUTORIDADE";
  }

  if (invoice.subscriptionId) {
    return "ASSINATURA";
  }

  if (invoice.contratoId) {
    return "CONTRATO";
  }

  return "OUTROS";
}

export function resolveFinanceiroPeriod(
  preset: FinanceiroAdminFilterPreset = "90D",
  now = new Date(),
) {
  const end = endOfDay(now);

  switch (preset) {
    case "30D":
      return {
        preset,
        label: "Últimos 30 dias",
        start: startOfDay(addDays(now, -29)),
        end,
      };
    case "90D":
      return {
        preset,
        label: "Últimos 90 dias",
        start: startOfDay(addDays(now, -89)),
        end,
      };
    case "365D":
      return {
        preset,
        label: "Últimos 12 meses",
        start: startOfDay(addDays(now, -364)),
        end,
      };
    case "YTD":
      return {
        preset,
        label: "Ano atual",
        start: new Date(now.getFullYear(), 0, 1),
        end,
      };
    case "ALL":
    default:
      return {
        preset: "ALL" as const,
        label: "Base histórica completa",
        start: null,
        end,
      };
  }
}

function isWithinRange(
  value: Date | null | undefined,
  start: Date | null,
  end: Date,
) {
  if (!value) {
    return false;
  }

  if (!start) {
    return value <= end;
  }

  return value >= start && value <= end;
}

function matchesInvoiceStatusFilter(
  invoice: FinanceiroAdminInvoiceRecord,
  invoiceStatus: FinanceiroAdminStatusFilter,
) {
  if (invoiceStatus === "ALL") {
    return true;
  }

  if (invoiceStatus === "EM_RISCO") {
    return invoice.status === "ABERTA" || invoice.status === "VENCIDA";
  }

  return invoice.status === invoiceStatus;
}

function matchesInvoiceFilters(
  invoice: FinanceiroAdminInvoiceRecord,
  filters: Required<Pick<FinanceiroAdminFilters, "invoiceStatus" | "billingContext">> & {
    tenantId: string | null;
  },
) {
  if (filters.tenantId && invoice.tenantId !== filters.tenantId) {
    return false;
  }

  if (
    filters.billingContext !== "ALL" &&
    resolveFinanceiroBillingContext(invoice) !== filters.billingContext
  ) {
    return false;
  }

  return matchesInvoiceStatusFilter(invoice, filters.invoiceStatus);
}

function matchesPaymentFilters(
  payment: FinanceiroAdminPaymentRecord,
  filters: Required<Pick<FinanceiroAdminFilters, "billingContext">> & {
    tenantId: string | null;
  },
) {
  if (filters.tenantId && payment.tenantId !== filters.tenantId) {
    return false;
  }

  if (
    filters.billingContext !== "ALL" &&
    payment.billingContext !== filters.billingContext
  ) {
    return false;
  }

  return true;
}

function matchesSubscriptionFilters(
  subscription: FinanceiroAdminSubscriptionRecord,
  tenantId: string | null,
) {
  return !tenantId || subscription.tenantId === tenantId;
}

function matchesCommissionFilters(
  commission: FinanceiroAdminCommissionRecord,
  tenantId: string | null,
) {
  return !tenantId || commission.tenantId === tenantId;
}

function getDaysDifference(laterDate: Date, earlierDate: Date) {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((laterDate.getTime() - earlierDate.getTime()) / msPerDay);
}

function createEmptyRevenueSeries(now: Date) {
  const seriesStart = addMonths(startOfMonth(now), -11);

  return Array.from({ length: 12 }, (_, index) => {
    const current = addMonths(seriesStart, index);
    return {
      periodKey: toPeriodKey(current),
      periodo: toMonthLabel(current),
      faturado: 0,
      recebido: 0,
      emAberto: 0,
      vencido: 0,
    } satisfies FinanceiroAdminRevenuePoint;
  });
}

function getAgingBucket(daysPastDue: number | null) {
  if (daysPastDue == null || daysPastDue <= 0) {
    return "current";
  }
  if (daysPastDue <= 30) {
    return "1_30";
  }
  if (daysPastDue <= 60) {
    return "31_60";
  }
  if (daysPastDue <= 90) {
    return "61_90";
  }
  return "90_plus";
}

function getForecastBucket(daysUntilDue: number) {
  if (daysUntilDue < 0) {
    return "overdue";
  }
  if (daysUntilDue <= 7) {
    return "next_7";
  }
  if (daysUntilDue <= 30) {
    return "next_30";
  }
  if (daysUntilDue <= 60) {
    return "next_60";
  }
  return "later";
}

export function buildFinanceiroAdminDashboard({
  filters,
  tenantOptions,
  invoices,
  payments,
  subscriptions,
  commissions,
  now = new Date(),
}: DashboardBuildInput): FinanceiroAdminDashboard {
  const normalizedFilters = {
    preset: filters?.preset ?? "90D",
    tenantId: filters?.tenantId ?? null,
    invoiceStatus: filters?.invoiceStatus ?? "ALL",
    billingContext: filters?.billingContext ?? "ALL",
  } as const;

  const period = resolveFinanceiroPeriod(normalizedFilters.preset, now);
  const series = createEmptyRevenueSeries(now);
  const seriesIndex = new Map(series.map((item) => [item.periodKey, item]));

  const filteredInvoices = invoices.filter((invoice) =>
    matchesInvoiceFilters(invoice, normalizedFilters),
  );
  const filteredPayments = payments.filter((payment) =>
    matchesPaymentFilters(payment, normalizedFilters),
  );
  const filteredSubscriptions = subscriptions.filter((subscription) =>
    matchesSubscriptionFilters(subscription, normalizedFilters.tenantId),
  );
  const filteredCommissions = commissions.filter((commission) =>
    matchesCommissionFilters(commission, normalizedFilters.tenantId),
  );

  let totalFaturadoPeriodo = 0;
  let totalRecebidoPeriodo = 0;
  let contasReceberAbertas = 0;
  let contasReceberVencidas = 0;
  let quantidadeEmAberto = 0;
  let quantidadeVencida = 0;
  let dueIn7Days = 0;
  let forecast30d = 0;

  const agingMap = new Map<string, FinanceiroAdminAgingPoint>([
    ["current", { bucket: "current", label: "A vencer", valor: 0, quantidade: 0 }],
    ["1_30", { bucket: "1_30", label: "1-30 dias", valor: 0, quantidade: 0 }],
    ["31_60", { bucket: "31_60", label: "31-60 dias", valor: 0, quantidade: 0 }],
    ["61_90", { bucket: "61_90", label: "61-90 dias", valor: 0, quantidade: 0 }],
    ["90_plus", { bucket: "90_plus", label: "90+ dias", valor: 0, quantidade: 0 }],
  ]);

  const forecastMap = new Map<string, FinanceiroAdminForecastPoint>([
    ["overdue", { bucket: "overdue", label: "Vencido", previsto: 0, emRisco: 0, quantidade: 0 }],
    ["next_7", { bucket: "next_7", label: "Próximos 7 dias", previsto: 0, emRisco: 0, quantidade: 0 }],
    ["next_30", { bucket: "next_30", label: "8-30 dias", previsto: 0, emRisco: 0, quantidade: 0 }],
    ["next_60", { bucket: "next_60", label: "31-60 dias", previsto: 0, emRisco: 0, quantidade: 0 }],
    ["later", { bucket: "later", label: "60+ dias", previsto: 0, emRisco: 0, quantidade: 0 }],
  ]);

  const revenueMixMap = new Map<string, FinanceiroAdminBreakdownItem>();
  const paymentMethodMap = new Map<string, FinanceiroAdminBreakdownItem>();
  const legacyPaymentMethodMap = new Map<string, FinanceiroAdminLegacyPaymentMethod>();
  const tenantPerformanceMap = new Map<string, FinanceiroAdminTenantPerformance>();

  for (const invoice of filteredInvoices) {
    const invoiceValue = toFiniteNumber(invoice.valor);
    const dueDate = invoice.vencimento ?? invoice.createdAt;
    const duePeriodKey = toPeriodKey(startOfMonth(dueDate));
    const issuePeriodKey = toPeriodKey(startOfMonth(invoice.createdAt));
    const daysPastDue =
      invoice.vencimento && isOpenInvoice(invoice.status)
        ? getDaysDifference(now, invoice.vencimento)
        : null;

    if (seriesIndex.has(issuePeriodKey)) {
      seriesIndex.get(issuePeriodKey)!.faturado += invoiceValue;
    }

    if (seriesIndex.has(duePeriodKey)) {
      if (invoice.status === "ABERTA") {
        seriesIndex.get(duePeriodKey)!.emAberto += invoiceValue;
      } else if (invoice.status === "VENCIDA") {
        seriesIndex.get(duePeriodKey)!.vencido += invoiceValue;
      }
    }

    if (isWithinRange(invoice.createdAt, period.start, period.end)) {
      totalFaturadoPeriodo += invoiceValue;
    }

    if (isOpenInvoice(invoice.status)) {
      contasReceberAbertas += invoiceValue;
      quantidadeEmAberto += 1;

      const agingBucket = agingMap.get(getAgingBucket(daysPastDue));
      if (agingBucket) {
        agingBucket.valor += invoiceValue;
        agingBucket.quantidade += 1;
      }

      const daysUntilDue = invoice.vencimento
        ? getDaysDifference(invoice.vencimento, now)
        : 0;
      const forecastBucket = forecastMap.get(getForecastBucket(daysUntilDue));
      if (forecastBucket) {
        forecastBucket.quantidade += 1;
        if (daysUntilDue < 0) {
          forecastBucket.emRisco += invoiceValue;
        } else {
          forecastBucket.previsto += invoiceValue;
        }
      }

      if (daysUntilDue >= 0 && daysUntilDue <= 7) {
        dueIn7Days += invoiceValue;
      }

      if (daysUntilDue >= 0 && daysUntilDue <= 30) {
        forecast30d += invoiceValue;
      }
    }

    if (invoice.status === "VENCIDA") {
      contasReceberVencidas += invoiceValue;
      quantidadeVencida += 1;
    }

    const tenantPerformance =
      tenantPerformanceMap.get(invoice.tenantId) ??
      ({
        tenantId: invoice.tenantId,
        tenantName: invoice.tenantName,
        tenantSlug: invoice.tenantSlug,
        tenantStatus: invoice.tenantStatus,
        recebidoPeriodo: 0,
        faturadoPeriodo: 0,
        abertoAtual: 0,
        vencidoAtual: 0,
        collectionRate: 0,
        activeSubscriptions: 0,
      } satisfies FinanceiroAdminTenantPerformance);

    if (isWithinRange(invoice.createdAt, period.start, period.end)) {
      tenantPerformance.faturadoPeriodo += invoiceValue;
    }

    if (isOpenInvoice(invoice.status)) {
      tenantPerformance.abertoAtual += invoiceValue;
    }

    if (invoice.status === "VENCIDA") {
      tenantPerformance.vencidoAtual += invoiceValue;
    }

    tenantPerformanceMap.set(invoice.tenantId, tenantPerformance);
  }

  for (const payment of filteredPayments) {
    const paymentValue = toFiniteNumber(payment.valor);
    const paymentDate = payment.confirmadoEm ?? payment.createdAt;
    const paymentPeriodKey = toPeriodKey(startOfMonth(paymentDate));

    if (seriesIndex.has(paymentPeriodKey) && payment.status === "PAGO") {
      seriesIndex.get(paymentPeriodKey)!.recebido += paymentValue;
    }

    if (
      payment.status === "PAGO" &&
      isWithinRange(paymentDate, period.start, period.end)
    ) {
      totalRecebidoPeriodo += paymentValue;

      const revenueMixEntry =
        revenueMixMap.get(payment.billingContext) ??
        {
          key: payment.billingContext,
          label:
            payment.billingContext === "ASSINATURA"
              ? "Assinaturas"
              : payment.billingContext === "PACOTE_AUTORIDADE"
                ? "Pacotes premium"
                : payment.billingContext === "CONTRATO"
                  ? "Contratos"
                  : "Outros",
          valor: 0,
          quantidade: 0,
        };
      revenueMixEntry.valor += paymentValue;
      revenueMixEntry.quantidade += 1;
      revenueMixMap.set(payment.billingContext, revenueMixEntry);

      const supportedMethod = normalizeSupportedPaymentMethod(payment.metodo);
      if (supportedMethod) {
        const paymentMethodEntry =
          paymentMethodMap.get(supportedMethod) ??
          {
            key: supportedMethod,
            label: paymentMethodLabel(supportedMethod),
            valor: 0,
            quantidade: 0,
          };
        paymentMethodEntry.valor += paymentValue;
        paymentMethodEntry.quantidade += 1;
        paymentMethodMap.set(supportedMethod, paymentMethodEntry);
      } else {
        const rawMethod = (payment.metodo || "N/I").trim() || "N/I";
        const legacyEntry =
          legacyPaymentMethodMap.get(rawMethod) ??
          {
            rawMethod,
            label: rawMethod,
            valor: 0,
            quantidade: 0,
          };
        legacyEntry.valor += paymentValue;
        legacyEntry.quantidade += 1;
        legacyPaymentMethodMap.set(rawMethod, legacyEntry);
      }

      const tenantPerformance = tenantPerformanceMap.get(payment.tenantId);
      if (tenantPerformance) {
        tenantPerformance.recebidoPeriodo += paymentValue;
      } else {
        tenantPerformanceMap.set(payment.tenantId, {
          tenantId: payment.tenantId,
          tenantName: payment.tenantName,
          tenantSlug: payment.tenantSlug,
          tenantStatus: payment.tenantStatus,
          recebidoPeriodo: paymentValue,
          faturadoPeriodo: 0,
          abertoAtual: 0,
          vencidoAtual: 0,
          collectionRate: 0,
          activeSubscriptions: 0,
        });
      }
    }
  }

  let mrr = 0;
  let activeSubscriptions = 0;
  const activeTenantIds = new Set<string>();

  for (const subscription of filteredSubscriptions) {
    if (subscription.status !== "ATIVA") {
      continue;
    }

    activeSubscriptions += 1;
    activeTenantIds.add(subscription.tenantId);
    mrr +=
      toFiniteNumber(subscription.valorMensalContratado) ||
      toFiniteNumber(subscription.valorAnualContratado) / 12;

    const tenantPerformance = tenantPerformanceMap.get(subscription.tenantId);
    if (tenantPerformance) {
      tenantPerformance.activeSubscriptions += 1;
    } else {
      tenantPerformanceMap.set(subscription.tenantId, {
        tenantId: subscription.tenantId,
        tenantName: subscription.tenantName,
        tenantSlug: subscription.tenantSlug,
        tenantStatus: "ACTIVE",
        recebidoPeriodo: 0,
        faturadoPeriodo: 0,
        abertoAtual: 0,
        vencidoAtual: 0,
        collectionRate: 0,
        activeSubscriptions: 1,
      });
    }
  }

  const pendingCommissions = filteredCommissions
    .filter((commission) => commission.status === "PENDENTE")
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const pendingCommissionsValue = pendingCommissions.reduce(
    (acc, item) => acc + toFiniteNumber(item.valorComissao),
    0,
  );

  const tenantPerformance = Array.from(tenantPerformanceMap.values()).map(
    (tenant) => ({
      ...tenant,
      collectionRate: safePercent(
        tenant.recebidoPeriodo,
        tenant.faturadoPeriodo,
      ),
    }),
  );

  const totalRevenueTopFive = tenantPerformance
    .slice()
    .sort((a, b) => b.recebidoPeriodo - a.recebidoPeriodo)
    .slice(0, 5)
    .reduce((acc, item) => acc + item.recebidoPeriodo, 0);

  return {
    generatedAt: now.toISOString(),
    rangeLabel: period.label,
    filters: normalizedFilters,
    tenantOptions,
    summary: {
      totalRecebidoPeriodo,
      totalFaturadoPeriodo,
      contasReceberAbertas,
      contasReceberVencidas,
      quantidadeEmAberto,
      quantidadeVencida,
      pendingCommissionsValue,
      mrr,
      arr: mrr * 12,
      arpa: activeSubscriptions > 0 ? mrr / activeSubscriptions : 0,
      activeSubscriptions,
      activeTenants: activeTenantIds.size,
      collectionRate: safePercent(totalRecebidoPeriodo, totalFaturadoPeriodo),
      delinquencyRate: safePercent(
        contasReceberVencidas,
        contasReceberAbertas,
      ),
      revenueConcentrationTop5: safePercent(
        totalRevenueTopFive,
        totalRecebidoPeriodo,
      ),
      forecast30d,
      dueIn7Days,
    },
    series,
    aging: Array.from(agingMap.values()),
    forecast: Array.from(forecastMap.values()),
    revenueMix: Array.from(revenueMixMap.values()).sort(
      (a, b) => b.valor - a.valor,
    ),
    paymentMethods: Array.from(paymentMethodMap.values()).sort(
      (a, b) => b.valor - a.valor,
    ),
    legacyPaymentMethods: Array.from(legacyPaymentMethodMap.values()).sort(
      (a, b) => b.valor - a.valor,
    ),
    topTenants: tenantPerformance
      .slice()
      .sort((a, b) => b.recebidoPeriodo - a.recebidoPeriodo)
      .slice(0, 8),
    topRiskTenants: tenantPerformance
      .slice()
      .sort((a, b) => b.vencidoAtual - a.vencidoAtual)
      .filter((item) => item.vencidoAtual > 0)
      .slice(0, 8),
    recentInvoices: filteredInvoices
      .slice()
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 12),
    recentPayments: filteredPayments
      .slice()
      .sort((a, b) =>
        (b.confirmadoEm ?? b.createdAt).getTime() -
        (a.confirmadoEm ?? a.createdAt).getTime(),
      )
      .slice(0, 12),
    pendingCommissions: pendingCommissions.slice(0, 12),
  };
}
