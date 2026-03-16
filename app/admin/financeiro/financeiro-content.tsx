"use client";

import { useMemo, useState, type ReactNode } from "react";
import useSWR from "swr";
import NextLink from "next/link";
import { Button } from "@heroui/button";
import { Chip, Spinner } from "@heroui/react";
import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from "@heroui/table";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  BadgeDollarSign,
  Banknote,
  Building2,
  CalendarRange,
  CreditCard,
  Download,
  FileSpreadsheet,
  FileText,
  HandCoins,
  Landmark,
  PieChart as PieChartIcon,
  Receipt,
  ShieldAlert,
  TrendingUp,
  Wallet,
} from "lucide-react";

import {
  getFinanceiroDashboardAdmin,
} from "@/app/actions/financeiro";
import type {
  FinanceiroAdminBillingContextFilter,
  FinanceiroAdminDashboard,
  FinanceiroAdminFilterPreset,
  FinanceiroAdminFilters,
  FinanceiroAdminStatusFilter,
} from "@/app/lib/financeiro-admin-dashboard";
import {
  PeopleEmptyState,
  PeopleMetricCard,
  PeoplePageHeader,
  PeoplePanel,
} from "@/components/people-ui";
import {
  SearchableSelect,
  type SearchableSelectOption,
} from "@/components/searchable-select";
import { toast } from "@/lib/toast";

type ActionResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

type ExportFormat = "csv" | "xlsx" | "pdf";
type DashboardInvoice = FinanceiroAdminDashboard["recentInvoices"][number];
type DashboardPayment = FinanceiroAdminDashboard["recentPayments"][number];
type DashboardCommission = FinanceiroAdminDashboard["pendingCommissions"][number];
type DashboardTenant = FinanceiroAdminDashboard["topTenants"][number];

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 2,
});

const percentFormatter = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  maximumFractionDigits: 1,
});

const PRESET_OPTIONS: Array<{
  key: FinanceiroAdminFilterPreset;
  label: string;
}> = [
  { key: "30D", label: "30 dias" },
  { key: "90D", label: "90 dias" },
  { key: "365D", label: "12 meses" },
  { key: "YTD", label: "Ano" },
  { key: "ALL", label: "Histórico" },
];

const STATUS_OPTIONS: SearchableSelectOption[] = [
  { key: "ALL", label: "Todos os status" },
  { key: "EM_RISCO", label: "Somente em risco" },
  { key: "ABERTA", label: "Em aberto" },
  { key: "VENCIDA", label: "Vencidas" },
  { key: "PAGA", label: "Pagas" },
  { key: "CANCELADA", label: "Canceladas" },
  { key: "RASCUNHO", label: "Rascunho" },
];

const BILLING_CONTEXT_OPTIONS: SearchableSelectOption[] = [
  { key: "ALL", label: "Toda a receita" },
  { key: "ASSINATURA", label: "Assinaturas" },
  { key: "PACOTE_AUTORIDADE", label: "Pacotes premium" },
  { key: "CONTRATO", label: "Contratos" },
  { key: "OUTROS", label: "Outros" },
];

const CHART_COLORS = ["#2563eb", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

function formatCurrency(value: number) {
  return currencyFormatter.format(value || 0);
}

function formatPercent(value: number) {
  return percentFormatter.format(Number.isFinite(value) ? value : 0);
}

function formatDate(value?: string | Date | null) {
  if (!value) {
    return "Nao definido";
  }

  return new Date(value).toLocaleDateString("pt-BR");
}

function formatDateTime(value?: string | Date | null) {
  if (!value) {
    return "Nao definido";
  }

  return new Date(value).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function csvEscape(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function buildCsvFromRows(rows: string[][]) {
  return rows.map((row) => row.map(csvEscape).join(";")).join("\n");
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function getStatusColor(status: string) {
  switch (status) {
    case "ATIVA":
    case "PAGA":
    case "PAGO":
    case "ACTIVE":
      return "success" as const;
    case "ABERTA":
    case "PENDENTE":
    case "EM_RISCO":
    case "INADIMPLENTE":
      return "warning" as const;
    case "VENCIDA":
    case "SUSPENSA":
      return "danger" as const;
    case "CANCELADA":
    case "CANCELADO":
      return "default" as const;
    default:
      return "secondary" as const;
  }
}

function getStatusLabel(status: string) {
  switch (status) {
    case "ACTIVE":
    case "ATIVA":
      return "Ativa";
    case "PAGA":
      return "Paga";
    case "PAGO":
      return "Pago";
    case "ABERTA":
      return "Em aberto";
    case "PENDENTE":
      return "Pendente";
    case "VENCIDA":
      return "Vencida";
    case "INADIMPLENTE":
      return "Inadimplente";
    case "SUSPENSA":
      return "Suspensa";
    case "CANCELADA":
      return "Cancelada";
    case "RASCUNHO":
      return "Rascunho";
    default:
      return status;
  }
}

function getPaymentMethodLabel(method: string | null | undefined) {
  const normalized = String(method || "N/I").toUpperCase();

  switch (normalized) {
    case "PIX":
      return "PIX";
    case "BOLETO":
      return "Boleto";
    case "CREDIT_CARD":
    case "CARTAO":
    case "CARTAO_CREDITO":
      return "Cartão";
    case "TRANSFERENCIA":
    case "BANK_TRANSFER":
      return "Transferência";
    default:
      return normalized;
  }
}

function getTenantStatusLabel(status: string) {
  switch (status) {
    case "ACTIVE":
    case "ATIVA":
      return "Ativo";
    case "SUSPENDED":
    case "SUSPENSA":
      return "Suspenso";
    case "CANCELLED":
    case "CANCELADA":
      return "Cancelado";
    case "INADIMPLENTE":
      return "Inadimplente";
    default:
      return status;
  }
}

function getBillingContextLabel(
  context: FinanceiroAdminBillingContextFilter | string,
) {
  switch (context) {
    case "ASSINATURA":
      return "Assinaturas";
    case "PACOTE_AUTORIDADE":
      return "Pacotes premium";
    case "CONTRATO":
      return "Contratos";
    default:
      return "Outros";
  }
}

function resolveInvoiceBillingContext(invoice: DashboardInvoice) {
  if (invoice.metadata?.billingContext === "PACOTE_AUTORIDADE") {
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

function buildExportRows(data: FinanceiroAdminDashboard) {
  return {
    resumo: [
      ["Indicador", "Valor"],
      ["Janela analisada", data.rangeLabel],
      ["Recebido no período", formatCurrency(data.summary.totalRecebidoPeriodo)],
      ["Faturado no período", formatCurrency(data.summary.totalFaturadoPeriodo)],
      ["Contas a receber", formatCurrency(data.summary.contasReceberAbertas)],
      ["Contas vencidas", formatCurrency(data.summary.contasReceberVencidas)],
      ["MRR", formatCurrency(data.summary.mrr)],
      ["ARR", formatCurrency(data.summary.arr)],
      ["ARPA", formatCurrency(data.summary.arpa)],
      ["Taxa de cobrança", formatPercent(data.summary.collectionRate)],
      ["Taxa de inadimplência", formatPercent(data.summary.delinquencyRate)],
      [
        "Concentração top 5",
        formatPercent(data.summary.revenueConcentrationTop5),
      ],
      ["Forecast 30 dias", formatCurrency(data.summary.forecast30d)],
      ["Vencendo em 7 dias", formatCurrency(data.summary.dueIn7Days)],
      [
        "Comissões pendentes",
        formatCurrency(data.summary.pendingCommissionsValue),
      ],
    ],
    series: [
      ["Período", "Faturado", "Recebido", "Em aberto", "Vencido"],
      ...data.series.map((point) => [
        point.periodo,
        point.faturado.toFixed(2),
        point.recebido.toFixed(2),
        point.emAberto.toFixed(2),
        point.vencido.toFixed(2),
      ]),
    ],
    aging: [
      ["Bucket", "Valor", "Quantidade"],
      ...data.aging.map((item) => [
        item.label,
        item.valor.toFixed(2),
        String(item.quantidade),
      ]),
    ],
    forecast: [
      ["Janela", "Previsto", "Em risco", "Quantidade"],
      ...data.forecast.map((item) => [
        item.label,
        item.previsto.toFixed(2),
        item.emRisco.toFixed(2),
        String(item.quantidade),
      ]),
    ],
    topTenants: [
      [
        "Tenant",
        "Recebido período",
        "Faturado período",
        "Em aberto",
        "Vencido",
        "Taxa cobrança",
      ],
      ...data.topTenants.map((tenant) => [
        tenant.tenantName,
        tenant.recebidoPeriodo.toFixed(2),
        tenant.faturadoPeriodo.toFixed(2),
        tenant.abertoAtual.toFixed(2),
        tenant.vencidoAtual.toFixed(2),
        formatPercent(tenant.collectionRate),
      ]),
    ],
    revenueMix: [
      ["Linha de receita", "Valor", "Quantidade"],
      ...data.revenueMix.map((item) => [
        item.label,
        item.valor.toFixed(2),
        String(item.quantidade),
      ]),
    ],
    paymentMethods: [
      ["Método", "Valor", "Quantidade"],
      ...data.paymentMethods.map((item) => [
        item.label,
        item.valor.toFixed(2),
        String(item.quantidade),
      ]),
    ],
    invoices: [
      [
        "Fatura",
        "Tenant",
        "Contexto",
        "Valor",
        "Status",
        "Vencimento",
        "Criada em",
      ],
      ...data.recentInvoices.map((invoice) => [
        invoice.numero,
        invoice.tenantName,
        getBillingContextLabel(resolveInvoiceBillingContext(invoice)),
        invoice.valor.toFixed(2),
        invoice.status,
        formatDate(invoice.vencimento),
        formatDate(invoice.createdAt),
      ]),
    ],
    payments: [
      ["Fatura", "Tenant", "Método", "Valor", "Status", "Confirmado em"],
      ...data.recentPayments.map((payment) => [
        payment.invoiceNumero,
        payment.tenantName,
        getPaymentMethodLabel(payment.metodo),
        payment.valor.toFixed(2),
        payment.status,
        formatDate(payment.confirmadoEm || payment.createdAt),
      ]),
    ],
    commissions: [
      ["Advogado", "Tenant", "Fatura", "Valor", "Percentual", "Status"],
      ...data.pendingCommissions.map((commission) => [
        commission.advogadoNome,
        commission.tenantName,
        commission.faturaNumero,
        commission.valorComissao.toFixed(2),
        `${commission.percentualComissao}%`,
        commission.status,
      ]),
    ],
  };
}

async function exportDashboard(
  format: ExportFormat,
  data: FinanceiroAdminDashboard,
) {
  const rows = buildExportRows(data);
  const fileBase = `financeiro-global-${new Date().toISOString().slice(0, 10)}`;

  if (format === "csv") {
    const allRows = [
      ["Resumo financeiro global"],
      ...rows.resumo,
      [""],
      ["Série mensal"],
      ...rows.series,
      [""],
      ["Aging"],
      ...rows.aging,
      [""],
      ["Forecast"],
      ...rows.forecast,
      [""],
      ["Top tenants"],
      ...rows.topTenants,
      [""],
      ["Mix de receita"],
      ...rows.revenueMix,
      [""],
      ["Métodos de pagamento"],
      ...rows.paymentMethods,
      [""],
      ["Faturas recentes"],
      ...rows.invoices,
      [""],
      ["Pagamentos recentes"],
      ...rows.payments,
      [""],
      ["Comissões pendentes"],
      ...rows.commissions,
    ];
    const blob = new Blob([buildCsvFromRows(allRows)], {
      type: "text/csv;charset=utf-8;",
    });
    downloadBlob(blob, `${fileBase}.csv`);
    return;
  }

  if (format === "xlsx") {
    const XLSX = await import("xlsx");
    const workbook = XLSX.utils.book_new();

    Object.entries(rows).forEach(([sheetName, sheetRows]) => {
      const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);
      XLSX.utils.book_append_sheet(
        workbook,
        worksheet,
        sheetName.slice(0, 31),
      );
    });

    XLSX.writeFile(workbook, `${fileBase}.xlsx`);
    return;
  }

  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  doc.setFontSize(16);
  doc.text("Cockpit Financeiro Global", 40, 42);
  doc.setFontSize(10);

  let cursorY = 64;

  const sections = [
    { title: "Resumo", rows: rows.resumo },
    { title: "Série mensal", rows: rows.series },
    { title: "Aging", rows: rows.aging },
    { title: "Forecast", rows: rows.forecast },
    { title: "Top tenants", rows: rows.topTenants },
    { title: "Mix de receita", rows: rows.revenueMix },
    { title: "Métodos de pagamento", rows: rows.paymentMethods },
    { title: "Faturas recentes", rows: rows.invoices },
    { title: "Pagamentos recentes", rows: rows.payments },
    { title: "Comissões pendentes", rows: rows.commissions },
  ];

  sections.forEach((section) => {
    if (cursorY > pageHeight - 80) {
      doc.addPage();
      cursorY = 40;
    }

    doc.setFontSize(12);
    doc.text(section.title, 40, cursorY);
    cursorY += 16;
    doc.setFontSize(9);

    section.rows.forEach((row) => {
      const wrapped = doc.splitTextToSize(row.join(" | "), pageWidth - 80);
      const rowHeight = wrapped.length * 12 + 4;

      if (cursorY + rowHeight > pageHeight - 40) {
        doc.addPage();
        cursorY = 40;
      }

      doc.text(wrapped, 40, cursorY);
      cursorY += rowHeight;
    });

    cursorY += 10;
  });

  doc.save(`${fileBase}.pdf`);
}

function loadDashboardData(
  filters: FinanceiroAdminFilters,
): Promise<FinanceiroAdminDashboard> {
  return getFinanceiroDashboardAdmin(filters).then(
    (response: ActionResponse<FinanceiroAdminDashboard>) => {
      if (!response.success || !response.data) {
        throw new Error(
          response.error ?? "Falha ao carregar dashboard financeiro global",
        );
      }

      return response.data;
    },
  );
}

function ChartLoading({ label }: { label: string }) {
  return (
    <div className="flex min-h-64 items-center justify-center">
      <Spinner label={label} />
    </div>
  );
}

function EmptyChart({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon: ReactNode;
}) {
  return (
    <PeopleEmptyState
      className="min-h-64"
      description={description}
      icon={icon}
      title={title}
    />
  );
}

function DashboardTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number | string; color?: string }>;
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border border-white/10 bg-background/90 p-3 shadow-xl">
      {label ? (
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-default-400">
          {label}
        </p>
      ) : null}
      <div className="space-y-1">
        {payload.map((entry, index) => (
          <div
            key={`${entry.name}-${entry.value}-${index}`}
            className="flex items-center justify-between gap-4 text-sm"
          >
            <span style={{ color: entry.color || "inherit" }}>
              {entry.name || "Valor"}
            </span>
            <span className="font-medium text-foreground">
              {formatCurrency(Number(entry.value) || 0)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DashboardTableEmpty({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <PeopleEmptyState
      className="min-h-40"
      description={description}
      icon={icon}
      title={title}
    />
  );
}

function TopTenantCard({
  tenant,
  mode,
}: {
  tenant: DashboardTenant;
  mode: "receita" | "risco";
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-background/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">
            {tenant.tenantName}
          </p>
          <p className="text-xs text-default-400">{tenant.tenantSlug}</p>
        </div>
        <Chip color={getStatusColor(tenant.tenantStatus)} size="sm" variant="flat">
          {getTenantStatusLabel(tenant.tenantStatus)}
        </Chip>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-default-500">
            Recebido
          </p>
          <p className="mt-1 text-lg font-semibold text-foreground">
            {formatCurrency(tenant.recebidoPeriodo)}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-default-500">
            Faturado
          </p>
          <p className="mt-1 text-lg font-semibold text-foreground">
            {formatCurrency(tenant.faturadoPeriodo)}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-default-500">
            Em aberto
          </p>
          <p className="mt-1 text-sm font-medium text-default-300">
            {formatCurrency(tenant.abertoAtual)}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-default-500">
            {mode === "risco" ? "Vencido" : "Taxa cobrança"}
          </p>
          <p
            className={`mt-1 text-sm font-medium ${
              mode === "risco" ? "text-danger" : "text-default-300"
            }`}
          >
            {mode === "risco"
              ? formatCurrency(tenant.vencidoAtual)
              : formatPercent(tenant.collectionRate)}
          </p>
        </div>
      </div>
    </div>
  );
}

function PaymentMethodList({
  items,
}: {
  items: FinanceiroAdminDashboard["paymentMethods"];
}) {
  if (items.length === 0) {
    return (
      <DashboardTableEmpty
        description="Os pagamentos confirmados aparecerão aqui com o método utilizado."
        icon={<CreditCard className="h-6 w-6" />}
        title="Sem métodos de pagamento"
      />
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <div
          key={item.key}
          className="rounded-2xl border border-white/10 bg-background/40 p-3"
        >
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{
                  backgroundColor: CHART_COLORS[index % CHART_COLORS.length],
                }}
              />
              <span className="text-sm font-medium text-foreground">
                {getPaymentMethodLabel(item.label)}
              </span>
            </div>
            <span className="text-sm font-semibold text-foreground">
              {formatCurrency(item.valor)}
            </span>
          </div>
          <div className="h-2 rounded-full bg-default-100/10">
            <div
              className="h-2 rounded-full"
              style={{
                backgroundColor: CHART_COLORS[index % CHART_COLORS.length],
                width: `${Math.max(
                  6,
                  Math.min(
                    100,
                    (item.valor / (items[0]?.valor || item.valor || 1)) * 100,
                  ),
                )}%`,
              }}
            />
          </div>
          <p className="mt-2 text-xs text-default-400">
            {item.quantidade} pagamento(s) confirmados
          </p>
        </div>
      ))}
    </div>
  );
}

function InvoiceTable({ items }: { items: DashboardInvoice[] }) {
  if (items.length === 0) {
    return (
      <DashboardTableEmpty
        description="As faturas filtradas aparecerão aqui assim que houver emissão."
        icon={<Receipt className="h-6 w-6" />}
        title="Sem faturas recentes"
      />
    );
  }

  return (
    <Table aria-label="Tabela de faturas recentes" removeWrapper>
      <TableHeader>
        <TableColumn>FATURA</TableColumn>
        <TableColumn>TENANT</TableColumn>
        <TableColumn>CONTEXTO</TableColumn>
        <TableColumn>VALOR</TableColumn>
        <TableColumn>STATUS</TableColumn>
        <TableColumn>VENCIMENTO</TableColumn>
      </TableHeader>
      <TableBody>
        {items.map((invoice) => (
          <TableRow key={invoice.id}>
            <TableCell>
              <div>
                <p className="text-sm font-medium text-foreground">
                  {invoice.numero}
                </p>
                <p className="text-xs text-default-400">
                  Criada em {formatDate(invoice.createdAt)}
                </p>
              </div>
            </TableCell>
            <TableCell>
              <div>
                <p className="text-sm text-foreground">{invoice.tenantName}</p>
                <p className="text-xs text-default-400">{invoice.tenantSlug}</p>
              </div>
            </TableCell>
            <TableCell>
              <span className="text-sm text-default-300">
                {getBillingContextLabel(resolveInvoiceBillingContext(invoice))}
              </span>
            </TableCell>
            <TableCell className="font-medium text-foreground">
              {formatCurrency(invoice.valor)}
            </TableCell>
            <TableCell>
              <Chip color={getStatusColor(invoice.status)} size="sm" variant="flat">
                {getStatusLabel(invoice.status)}
              </Chip>
            </TableCell>
            <TableCell>{formatDate(invoice.vencimento)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function PaymentTable({ items }: { items: DashboardPayment[] }) {
  if (items.length === 0) {
    return (
      <DashboardTableEmpty
        description="Os pagamentos confirmados aparecerão aqui com data e método."
        icon={<Wallet className="h-6 w-6" />}
        title="Sem pagamentos recentes"
      />
    );
  }

  return (
    <Table aria-label="Tabela de pagamentos recentes" removeWrapper>
      <TableHeader>
        <TableColumn>FATURA</TableColumn>
        <TableColumn>TENANT</TableColumn>
        <TableColumn>MÉTODO</TableColumn>
        <TableColumn>VALOR</TableColumn>
        <TableColumn>STATUS</TableColumn>
        <TableColumn>CONFIRMADO</TableColumn>
      </TableHeader>
      <TableBody>
        {items.map((payment) => (
          <TableRow key={payment.id}>
            <TableCell>{payment.invoiceNumero}</TableCell>
            <TableCell>
              <div>
                <p className="text-sm text-foreground">{payment.tenantName}</p>
                <p className="text-xs text-default-400">{payment.tenantSlug}</p>
              </div>
            </TableCell>
            <TableCell>{getPaymentMethodLabel(payment.metodo)}</TableCell>
            <TableCell className="font-medium text-foreground">
              {formatCurrency(payment.valor)}
            </TableCell>
            <TableCell>
              <Chip color={getStatusColor(payment.status)} size="sm" variant="flat">
                {getStatusLabel(payment.status)}
              </Chip>
            </TableCell>
            <TableCell>{formatDateTime(payment.confirmadoEm || payment.createdAt)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function CommissionTable({ items }: { items: DashboardCommission[] }) {
  if (items.length === 0) {
    return (
      <DashboardTableEmpty
        description="As comissões pendentes de repasse aparecerão aqui."
        icon={<HandCoins className="h-6 w-6" />}
        title="Sem comissões pendentes"
      />
    );
  }

  return (
    <Table aria-label="Tabela de comissões pendentes" removeWrapper>
      <TableHeader>
        <TableColumn>ADVOGADO</TableColumn>
        <TableColumn>TENANT</TableColumn>
        <TableColumn>FATURA</TableColumn>
        <TableColumn>VALOR</TableColumn>
        <TableColumn>PERCENTUAL</TableColumn>
        <TableColumn>STATUS</TableColumn>
      </TableHeader>
      <TableBody>
        {items.map((commission) => (
          <TableRow key={commission.id}>
            <TableCell>
              <div>
                <p className="text-sm font-medium text-foreground">
                  {commission.advogadoNome}
                </p>
                <p className="text-xs text-default-400">
                  {commission.advogadoOab || "OAB não informada"}
                </p>
              </div>
            </TableCell>
            <TableCell>{commission.tenantName}</TableCell>
            <TableCell>{commission.faturaNumero}</TableCell>
            <TableCell className="font-medium text-foreground">
              {formatCurrency(commission.valorComissao)}
            </TableCell>
            <TableCell>{commission.percentualComissao}%</TableCell>
            <TableCell>
              <Chip
                color={getStatusColor(commission.status)}
                size="sm"
                variant="flat"
              >
                {getStatusLabel(commission.status)}
              </Chip>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function FinanceiroContent() {
  const [filters, setFilters] = useState<FinanceiroAdminFilters>({
    preset: "90D",
    tenantId: null,
    invoiceStatus: "ALL",
    billingContext: "ALL",
  });
  const [isExporting, setIsExporting] = useState<ExportFormat | null>(null);

  const { data, error, isLoading } = useSWR(
    ["admin-financeiro-dashboard", filters] as const,
    ([, currentFilters]) => loadDashboardData(currentFilters),
    {
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
    },
  );

  const tenantOptions = useMemo<SearchableSelectOption[]>(
    () =>
      (data?.tenantOptions ?? []).map((tenant) => ({
        key: tenant.key,
        label: tenant.label,
        textValue: `${tenant.label} ${tenant.description}`,
        description: tenant.description,
      })),
    [data?.tenantOptions],
  );

  const summary = data?.summary;

  const playbook = useMemo(() => {
    if (!summary) {
      return [];
    }

    const recommendations: Array<{
      title: string;
      detail: string;
      tone: "success" | "warning" | "danger";
    }> = [];

    if (summary.contasReceberVencidas > 0) {
      recommendations.push({
        title: "Cobrança vencida pede ação imediata",
        detail: `${formatCurrency(summary.contasReceberVencidas)} já está vencido e precisa entrar na régua hoje.`,
        tone: "danger",
      });
    }

    if (summary.dueIn7Days > 0) {
      recommendations.push({
        title: "Janela curta de cobrança preventiva",
        detail: `${formatCurrency(summary.dueIn7Days)} vence nos próximos 7 dias.`,
        tone: "warning",
      });
    }

    if (summary.revenueConcentrationTop5 >= 0.5) {
      recommendations.push({
        title: "Receita concentrada nas maiores contas",
        detail: `Os cinco maiores tenants representam ${formatPercent(summary.revenueConcentrationTop5)} do recebido filtrado.`,
        tone: "warning",
      });
    }

    if (summary.collectionRate >= 0.85 && recommendations.length === 0) {
      recommendations.push({
        title: "Saúde de cobrança sob controle",
        detail: `A taxa de cobrança está em ${formatPercent(summary.collectionRate)} com baixa pressão imediata de caixa.`,
        tone: "success",
      });
    }

    if (recommendations.length === 0) {
      recommendations.push({
        title: "Sem alerta crítico neste recorte",
        detail:
          "O cockpit não detectou pressão material de vencidos, concentração ou repasses neste momento.",
        tone: "success",
      });
    }

    return recommendations.slice(0, 3);
  }, [summary]);

  const handleExport = async (format: ExportFormat) => {
    if (!data) {
      toast.error("Carregue o cockpit antes de exportar.");
      return;
    }

    setIsExporting(format);
    try {
      await exportDashboard(format, data);
      toast.success(`Exportação ${format.toUpperCase()} concluída.`);
    } catch {
      toast.error("Não foi possível exportar o cockpit financeiro.");
    } finally {
      setIsExporting(null);
    }
  };

  if (error) {
    return (
      <section className="space-y-6">
        <PeoplePageHeader
          description="Receita, cobrança, aging, forecast e repasse com visão de plataforma."
          tag="Administração"
          title="Cockpit financeiro global"
        />
        <PeoplePanel
          description="O financeiro global precisa continuar auditável mesmo quando uma consulta falha."
          title="Falha ao carregar o cockpit"
        >
          <div className="space-y-2 rounded-2xl border border-danger/30 bg-danger/5 p-4">
            <div className="flex items-start gap-2 text-sm text-danger">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {(error as Error).message ||
                  "Erro inesperado ao carregar dados financeiros."}
              </span>
            </div>
          </div>
        </PeoplePanel>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <PeoplePageHeader
        actions={
          <>
            <Button
              color="primary"
              isLoading={isExporting === "csv"}
              radius="full"
              size="sm"
              startContent={<Download className="h-4 w-4" />}
              onPress={() => handleExport("csv")}
            >
              Exportar CSV
            </Button>
            <Button
              isLoading={isExporting === "xlsx"}
              radius="full"
              size="sm"
              startContent={<FileSpreadsheet className="h-4 w-4" />}
              variant="bordered"
              onPress={() => handleExport("xlsx")}
            >
              XLSX
            </Button>
            <Button
              isLoading={isExporting === "pdf"}
              radius="full"
              size="sm"
              startContent={<FileText className="h-4 w-4" />}
              variant="bordered"
              onPress={() => handleExport("pdf")}
            >
              PDF
            </Button>
          </>
        }
        description="Coordene caixa, cobrança, concentração de receita, aging, forecast e repasses sem sair do painel global."
        tag="Administração"
        title="Cockpit financeiro global"
      />

      <PeoplePanel
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              as={NextLink}
              href="/admin/tenants"
              radius="full"
              size="sm"
              variant="flat"
            >
              Operar tenants
            </Button>
            <Button
              as={NextLink}
              href="/admin/relatorios"
              radius="full"
              size="sm"
              variant="flat"
            >
              Relatórios
            </Button>
          </div>
        }
        description="Defina janela, tenant, status e linha de receita para cruzar operação, cobrança e caixa."
        title="Filtro executivo"
      >
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {PRESET_OPTIONS.map((preset) => (
              <Button
                key={preset.key}
                color={filters.preset === preset.key ? "primary" : "default"}
                radius="full"
                size="sm"
                variant={filters.preset === preset.key ? "solid" : "bordered"}
                onPress={() =>
                  setFilters((current) => ({ ...current, preset: preset.key }))
                }
              >
                {preset.label}
              </Button>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <SearchableSelect
              items={tenantOptions}
              isClearable
              isLoading={isLoading}
              label="Escritório"
              placeholder="Todos os escritórios"
              selectedKey={filters.tenantId || null}
              testId="admin-financeiro-tenant-filter"
              onSelectionChange={(key) =>
                setFilters((current) => ({ ...current, tenantId: key }))
              }
            />
            <SearchableSelect
              items={STATUS_OPTIONS}
              isLoading={isLoading}
              label="Status de cobrança"
              selectedKey={filters.invoiceStatus || "ALL"}
              testId="admin-financeiro-status-filter"
              onSelectionChange={(key) =>
                setFilters((current) => ({
                  ...current,
                  invoiceStatus:
                    (key as FinanceiroAdminStatusFilter | null) || "ALL",
                }))
              }
            />
            <SearchableSelect
              items={BILLING_CONTEXT_OPTIONS}
              isLoading={isLoading}
              label="Linha de receita"
              selectedKey={filters.billingContext || "ALL"}
              testId="admin-financeiro-context-filter"
              onSelectionChange={(key) =>
                setFilters((current) => ({
                  ...current,
                  billingContext:
                    (key as FinanceiroAdminBillingContextFilter | null) ||
                    "ALL",
                }))
              }
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-default-500">
            <Chip
              size="sm"
              startContent={<CalendarRange className="h-3.5 w-3.5" />}
              variant="bordered"
            >
              {data?.rangeLabel || "Carregando janela"}
            </Chip>
            {filters.tenantId ? (
              <Chip size="sm" variant="bordered">
                Tenant filtrado
              </Chip>
            ) : null}
            {data?.generatedAt ? (
              <Chip size="sm" variant="bordered">
                Atualizado em{" "}
                {new Date(data.generatedAt).toLocaleTimeString("pt-BR")}
              </Chip>
            ) : null}
          </div>
        </div>
      </PeoplePanel>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <PeopleMetricCard
          helper="Entrada confirmada no período filtrado"
          icon={<Wallet className="h-4 w-4" />}
          label="Recebido"
          tone="success"
          value={summary ? formatCurrency(summary.totalRecebidoPeriodo) : "..."}
        />
        <PeopleMetricCard
          helper="Emissão total de cobrança no período"
          icon={<Receipt className="h-4 w-4" />}
          label="Faturado"
          tone="primary"
          value={summary ? formatCurrency(summary.totalFaturadoPeriodo) : "..."}
        />
        <PeopleMetricCard
          helper="Receita mensal recorrente ativa"
          icon={<TrendingUp className="h-4 w-4" />}
          label="MRR"
          tone="secondary"
          value={summary ? formatCurrency(summary.mrr) : "..."}
        />
        <PeopleMetricCard
          helper="Receita anual recorrente projetada"
          icon={<BadgeDollarSign className="h-4 w-4" />}
          label="ARR"
          tone="secondary"
          value={summary ? formatCurrency(summary.arr) : "..."}
        />
        <PeopleMetricCard
          helper={`${summary?.quantidadeEmAberto || 0} fatura(s) em aberto`}
          icon={<Banknote className="h-4 w-4" />}
          label="A receber"
          tone="warning"
          value={summary ? formatCurrency(summary.contasReceberAbertas) : "..."}
        />
        <PeopleMetricCard
          helper={`${summary?.quantidadeVencida || 0} fatura(s) vencida(s)`}
          icon={<ShieldAlert className="h-4 w-4" />}
          label="Vencido"
          tone="danger"
          value={summary ? formatCurrency(summary.contasReceberVencidas) : "..."}
        />
        <PeopleMetricCard
          helper={`${summary?.activeSubscriptions || 0} assinatura(s) ativas`}
          icon={<Building2 className="h-4 w-4" />}
          label="ARPA"
          tone="primary"
          value={summary ? formatCurrency(summary.arpa) : "..."}
        />
        <PeopleMetricCard
          helper={`${summary?.activeTenants || 0} tenant(s) com recorrência ativa`}
          icon={<Landmark className="h-4 w-4" />}
          label="Taxa de cobrança"
          tone={
            summary && summary.collectionRate >= 0.8 ? "success" : "warning"
          }
          value={summary ? formatPercent(summary.collectionRate) : "..."}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <PeoplePanel
          description="Série mensal para acompanhar conversão de cobrança em caixa e pressão de vencidos."
          title="Receita faturada x recebida"
        >
          {isLoading || !data ? (
            <ChartLoading label="Montando série financeira..." />
          ) : data.series.length > 0 ? (
            <div className="h-[360px] text-default-400">
              <ResponsiveContainer height="100%" width="100%">
                <AreaChart data={data.series}>
                  <defs>
                    <linearGradient id="financeiroFaturado" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0.04} />
                    </linearGradient>
                    <linearGradient id="financeiroRecebido" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.04} />
                    </linearGradient>
                    <linearGradient id="financeiroVencido" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.22} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0.04} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="currentColor" strokeDasharray="3 3" strokeOpacity={0.15} />
                  <XAxis dataKey="periodo" tick={{ fill: "currentColor", fontSize: 12 }} />
                  <YAxis
                    tick={{ fill: "currentColor", fontSize: 12 }}
                    tickFormatter={(value) => formatCurrency(Number(value))}
                  />
                  <Tooltip content={<DashboardTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area
                    dataKey="faturado"
                    fill="url(#financeiroFaturado)"
                    name="Faturado"
                    stroke="#2563eb"
                    type="monotone"
                  />
                  <Area
                    dataKey="recebido"
                    fill="url(#financeiroRecebido)"
                    name="Recebido"
                    stroke="#10b981"
                    type="monotone"
                  />
                  <Area
                    dataKey="vencido"
                    fill="url(#financeiroVencido)"
                    name="Vencido"
                    stroke="#ef4444"
                    type="monotone"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyChart
              description="Sem emissão ou recebimento suficiente para montar a série."
              icon={<TrendingUp className="h-6 w-6" />}
              title="Sem série financeira"
            />
          )}
        </PeoplePanel>

        <PeoplePanel
          description="Leituras que um coordenador financeiro precisa agir hoje."
          title="Playbook financeiro"
        >
          {isLoading || !summary ? (
            <ChartLoading label="Gerando recomendações..." />
          ) : (
            <div className="space-y-3">
              <div className="rounded-2xl border border-white/10 bg-background/40 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-default-500">
                  Forecast 30 dias
                </p>
                <p className="mt-2 text-2xl font-semibold text-foreground">
                  {formatCurrency(summary.forecast30d)}
                </p>
                <p className="mt-1 text-xs text-default-400">
                  Caixa previsto para os próximos 30 dias com a carteira atual.
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-background/40 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-default-500">
                  Vencendo em 7 dias
                </p>
                <p className="mt-2 text-2xl font-semibold text-warning">
                  {formatCurrency(summary.dueIn7Days)}
                </p>
                <p className="mt-1 text-xs text-default-400">
                  Janela ideal para cobrança preventiva e renegociação.
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-background/40 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-default-500">
                  Inadimplência
                </p>
                <p className="mt-2 text-2xl font-semibold text-danger">
                  {formatPercent(summary.delinquencyRate)}
                </p>
                <p className="mt-1 text-xs text-default-400">
                  Relação entre carteira vencida e contas em aberto.
                </p>
              </div>
              {playbook.map((item) => (
                <div
                  key={item.title}
                  className="rounded-2xl border border-white/10 bg-background/40 p-4"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <Chip color={item.tone} size="sm" variant="flat">
                      {item.tone === "danger"
                        ? "Risco"
                        : item.tone === "warning"
                          ? "Atenção"
                          : "Saudável"}
                    </Chip>
                    <p className="text-sm font-semibold text-foreground">
                      {item.title}
                    </p>
                  </div>
                  <p className="text-sm text-default-400">{item.detail}</p>
                </div>
              ))}
            </div>
          )}
        </PeoplePanel>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <PeoplePanel
          description="Quanto do caixa veio de assinatura, pacote premium e outras linhas."
          title="Mix de receita"
        >
          {isLoading || !data ? (
            <ChartLoading label="Montando mix..." />
          ) : data.revenueMix.length > 0 ? (
            <div className="space-y-4">
              <div className="h-[240px]">
                <ResponsiveContainer height="100%" width="100%">
                  <PieChart>
                    <Pie
                      data={data.revenueMix}
                      dataKey="valor"
                      innerRadius={62}
                      nameKey="label"
                      outerRadius={92}
                    >
                      {data.revenueMix.map((item, index) => (
                        <Cell
                          key={item.key}
                          fill={CHART_COLORS[index % CHART_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip content={<DashboardTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2">
                {data.revenueMix.map((item, index) => (
                  <div
                    key={item.key}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-background/40 p-3 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{
                          backgroundColor:
                            CHART_COLORS[index % CHART_COLORS.length],
                        }}
                      />
                      <span className="text-foreground">{item.label}</span>
                    </div>
                    <span className="font-semibold text-foreground">
                      {formatCurrency(item.valor)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <EmptyChart
              description="Ainda não há recebimento confirmado para montar o mix."
              icon={<PieChartIcon className="h-6 w-6" />}
              title="Sem mix de receita"
            />
          )}
        </PeoplePanel>

        <PeoplePanel
          description="Aging dos recebíveis em aberto para orientar régua de cobrança."
          title="Aging de recebíveis"
        >
          {isLoading || !data ? (
            <ChartLoading label="Montando aging..." />
          ) : data.aging.some((item) => item.valor > 0) ? (
            <div className="space-y-4">
              <div className="h-[240px] text-default-400">
                <ResponsiveContainer height="100%" width="100%">
                  <BarChart data={data.aging}>
                    <CartesianGrid stroke="currentColor" strokeDasharray="3 3" strokeOpacity={0.15} />
                    <XAxis dataKey="label" tick={{ fill: "currentColor", fontSize: 12 }} />
                    <YAxis
                      tick={{ fill: "currentColor", fontSize: 12 }}
                      tickFormatter={(value) => formatCurrency(Number(value))}
                    />
                    <Tooltip content={<DashboardTooltip />} />
                    <Bar dataKey="valor" fill="#f59e0b" name="Valor" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2">
                {data.aging.map((item) => (
                  <div
                    key={item.bucket}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-background/40 p-3 text-sm"
                  >
                    <span className="text-default-300">{item.label}</span>
                    <div className="text-right">
                      <p className="font-semibold text-foreground">
                        {formatCurrency(item.valor)}
                      </p>
                      <p className="text-xs text-default-400">
                        {item.quantidade} fatura(s)
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <EmptyChart
              description="Sem contas em aberto ou vencidas neste recorte."
              icon={<Banknote className="h-6 w-6" />}
              title="Aging zerado"
            />
          )}
        </PeoplePanel>

        <PeoplePanel
          description="Caixa esperado por janelas de vencimento com destaque para risco."
          title="Forecast de caixa"
        >
          {isLoading || !data ? (
            <ChartLoading label="Montando forecast..." />
          ) : data.forecast.some(
              (item) => item.previsto > 0 || item.emRisco > 0,
            ) ? (
            <div className="space-y-4">
              <div className="h-[240px] text-default-400">
                <ResponsiveContainer height="100%" width="100%">
                  <BarChart data={data.forecast}>
                    <CartesianGrid stroke="currentColor" strokeDasharray="3 3" strokeOpacity={0.15} />
                    <XAxis dataKey="label" tick={{ fill: "currentColor", fontSize: 12 }} />
                    <YAxis
                      tick={{ fill: "currentColor", fontSize: 12 }}
                      tickFormatter={(value) => formatCurrency(Number(value))}
                    />
                    <Tooltip content={<DashboardTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="previsto" fill="#10b981" name="Previsto" radius={[8, 8, 0, 0]} />
                    <Bar dataKey="emRisco" fill="#ef4444" name="Em risco" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2">
                {data.forecast.map((item) => (
                  <div
                    key={item.bucket}
                    className="rounded-2xl border border-white/10 bg-background/40 p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm text-default-300">{item.label}</span>
                      <span className="text-sm font-semibold text-foreground">
                        {formatCurrency(item.previsto + item.emRisco)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-default-400">
                      Previsto {formatCurrency(item.previsto)} · Em risco{" "}
                      {formatCurrency(item.emRisco)} · {item.quantidade} fatura(s)
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <EmptyChart
              description="Sem previsões relevantes de caixa para esta carteira."
              icon={<CalendarRange className="h-6 w-6" />}
              title="Sem forecast"
            />
          )}
        </PeoplePanel>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <PeoplePanel
          description="Contas com maior geração de caixa neste recorte."
          title="Top tenants por receita"
        >
          {isLoading || !data ? (
            <ChartLoading label="Ranqueando tenants..." />
          ) : data.topTenants.length > 0 ? (
            <div className="space-y-3">
              {data.topTenants.map((tenant) => (
                <TopTenantCard key={tenant.tenantId} mode="receita" tenant={tenant} />
              ))}
            </div>
          ) : (
            <DashboardTableEmpty
              description="Os tenants com maior receita aparecerão aqui conforme o filtro aplicado."
              icon={<Building2 className="h-6 w-6" />}
              title="Sem tenants com receita"
            />
          )}
        </PeoplePanel>

        <PeoplePanel
          description="Tenants com maior exposição vencida e risco de cobrança."
          title="Top risco de cobrança"
        >
          {isLoading || !data ? (
            <ChartLoading label="Calculando risco..." />
          ) : data.topRiskTenants.length > 0 ? (
            <div className="space-y-3">
              {data.topRiskTenants.map((tenant) => (
                <TopTenantCard key={tenant.tenantId} mode="risco" tenant={tenant} />
              ))}
            </div>
          ) : (
            <DashboardTableEmpty
              description="Nenhum tenant apresenta carteira vencida no recorte atual."
              icon={<ShieldAlert className="h-6 w-6" />}
              title="Sem risco de cobrança"
            />
          )}
        </PeoplePanel>

        <PeoplePanel
          description="Composição do recebido por canal de pagamento."
          title="Métodos de pagamento"
        >
          {isLoading || !data ? (
            <ChartLoading label="Montando métodos..." />
          ) : (
            <PaymentMethodList items={data.paymentMethods} />
          )}
        </PeoplePanel>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <PeoplePanel
          description="Últimas emissões para acompanhar volume, contexto de cobrança e vencimento."
          title="Faturas recentes"
        >
          {isLoading || !data ? (
            <ChartLoading label="Carregando faturas..." />
          ) : (
            <InvoiceTable items={data.recentInvoices} />
          )}
        </PeoplePanel>

        <PeoplePanel
          description="Últimos recebimentos confirmados com método e data efetiva."
          title="Pagamentos recentes"
        >
          {isLoading || !data ? (
            <ChartLoading label="Carregando pagamentos..." />
          ) : (
            <PaymentTable items={data.recentPayments} />
          )}
        </PeoplePanel>
      </div>

      <PeoplePanel
        description="Repasses aguardando liquidação operacional, com rastreabilidade por advogado e fatura."
        title="Comissões pendentes"
      >
        {isLoading || !data ? (
          <ChartLoading label="Carregando comissões..." />
        ) : (
          <CommissionTable items={data.pendingCommissions} />
        )}
      </PeoplePanel>
    </section>
  );
}
