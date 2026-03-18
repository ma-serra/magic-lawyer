"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import NextLink from "next/link";
import { Button } from "@heroui/button";
import { Pagination } from "@heroui/pagination";
import { Chip, Input, Spinner } from "@heroui/react";
import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from "@heroui/table";
import { Tab, Tabs } from "@heroui/tabs";
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
  ArrowUpRight,
  Briefcase,
  Building2,
  Download,
  FileSpreadsheet,
  FileText,
  Globe,
  LifeBuoy,
  Search,
  ShieldCheck,
  Target,
  Wallet,
} from "lucide-react";

import { getAdminReportsHub } from "@/app/actions/admin-reports";
import {
  ADMIN_REPORT_PRESET_OPTIONS,
  type AdminReportsCatalogItem,
  type AdminReportsData,
  type AdminReportsFormat,
  type AdminReportsMetricFormat,
  type AdminReportsPreset,
} from "@/app/lib/admin-reports-hub";
import {
  PeopleEmptyState,
  PeopleEntityCard,
  PeopleEntityCardBody,
  PeopleEntityCardHeader,
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

type CatalogFilter = "ALL" | string;
type CatalogStatusFilter = "ALL" | "DISPONIVEL" | "ATENCAO";
type ReportsHubTabKey = "overview" | "catalog" | "monitoring";

const CHART_COLORS = [
  "#2563eb",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#14b8a6",
  "#f97316",
];

const CATALOG_PAGE_SIZE_OPTIONS = [12, 24, 48] as const;

const REPORTS_HUB_TAB_META: Record<
  ReportsHubTabKey,
  { label: string; description: string }
> = {
  overview: {
    label: "Visao executiva",
    description:
      "Resumo de receita, crescimento, composicao financeira e funil do negocio.",
  },
  catalog: {
    label: "Biblioteca comercial",
    description:
      "Frentes priorizadas, relatorios mais pedidos e o catalogo mestre com filtros e paginacao.",
  },
  monitoring: {
    label: "Monitoramento",
    description:
      "Tenants de valor, risco operacional, auditoria recente e fila de suporte.",
  },
};

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 0,
});

const percentFormatter = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  maximumFractionDigits: 1,
});

function formatMetricValue(value: number, format: AdminReportsMetricFormat) {
  switch (format) {
    case "currency":
      return currencyFormatter.format(value || 0);
    case "percentage":
      return percentFormatter.format(value || 0);
    case "decimal":
      return new Intl.NumberFormat("pt-BR", {
        maximumFractionDigits: 1,
        minimumFractionDigits: 1,
      }).format(value || 0);
    case "integer":
    default:
      return numberFormatter.format(value || 0);
  }
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Nao definido";
  }

  return date.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function getCategoryIcon(icon: string) {
  switch (icon) {
    case "Wallet":
      return <Wallet className="h-5 w-5" />;
    case "Building2":
      return <Building2 className="h-5 w-5" />;
    case "LifeBuoy":
      return <LifeBuoy className="h-5 w-5" />;
    case "Briefcase":
      return <Briefcase className="h-5 w-5" />;
    case "Target":
      return <Target className="h-5 w-5" />;
    case "ShieldCheck":
      return <ShieldCheck className="h-5 w-5" />;
    case "Globe":
      return <Globe className="h-5 w-5" />;
    default:
      return <FileText className="h-5 w-5" />;
  }
}

function getChipColor(
  value: "DISPONIVEL" | "ATENCAO" | string,
): "default" | "success" | "warning" | "danger" | "secondary" | "primary" {
  if (value === "ATENCAO") {
    return "warning";
  }

  if (value === "DISPONIVEL") {
    return "success";
  }

  if (value.toLowerCase().includes("cancel")) {
    return "danger";
  }

  if (value.toLowerCase().includes("ativo")) {
    return "success";
  }

  return "default";
}

function csvEscape(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
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

function buildCsvFromRows(rows: string[][]) {
  return rows.map((row) => row.map(csvEscape).join(";")).join("\n");
}

async function exportXlsxFile(rows: string[][], fileName: string) {
  const XLSX = await import("xlsx");
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(workbook, worksheet, "Relatorios");
  XLSX.writeFile(workbook, fileName);
}

async function exportPdfFile(title: string, rows: string[][], fileName: string) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();

  doc.setFontSize(16);
  doc.text(title, 40, 42);
  doc.setFontSize(10);

  let cursorY = 68;
  for (const row of rows) {
    const wrapped = doc.splitTextToSize(row.join(" | "), width - 80);
    const rowHeight = wrapped.length * 14 + 6;

    if (cursorY + rowHeight > height - 40) {
      doc.addPage();
      cursorY = 40;
    }

    doc.text(wrapped, 40, cursorY);
    cursorY += rowHeight;
  }

  doc.save(fileName);
}

function buildExportRows(
  data: AdminReportsData,
  reports: AdminReportsCatalogItem[],
) {
  return [
    ["Campo", "Valor"],
    ["Escopo", data.summary.scopeLabel],
    ["Periodo", data.summary.presetLabel],
    ["Gerado em", formatDateTime(data.generatedAt)],
    ["Categorias", numberFormatter.format(data.summary.categories)],
    ["Relatorios no catalogo", numberFormatter.format(data.summary.catalogReports)],
    ["Itens de atencao", numberFormatter.format(data.summary.priorityWatchlist)],
    [""],
    ["Indicador", "Valor"],
    ...data.metricCards.map((metric) => [
      metric.label,
      formatMetricValue(metric.value, metric.format),
    ]),
    [""],
    ["Relatorio", "Categoria", "Publico", "Cadencia", "Metric", "Status", "Link"],
    ...reports.map((report) => [
      report.title,
      report.tags[0] ?? "geral",
      report.audience,
      report.cadence,
      `${report.liveMetricLabel}: ${formatMetricValue(
        report.liveMetricValue,
        report.liveMetricFormat,
      )}`,
      report.status,
      report.href,
    ]),
  ];
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number | string }>;
  label?: string;
}) {
  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div className="rounded-xl border border-white/10 bg-content1/95 p-3 shadow-xl backdrop-blur">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-default-500">
        {label}
      </p>
      <div className="space-y-1">
        {payload.map((item) => (
          <p key={`${label}-${item.name}`} className="text-xs text-foreground">
            <span className="font-medium">{item.name}:</span>{" "}
            {typeof item.value === "number"
              ? item.value > 1000
                ? numberFormatter.format(item.value)
                : item.value
              : item.value}
          </p>
        ))}
      </div>
    </div>
  );
}

function fetchReports(
  preset: AdminReportsPreset,
  tenantId: string,
): Promise<AdminReportsData> {
  return getAdminReportsHub({ preset, tenantId }).then(
    (response: ActionResponse<AdminReportsData>) => {
      if (!response.success || !response.data) {
        throw new Error(response.error ?? "Falha ao carregar o hub de relatorios");
      }

      return response.data;
    },
  );
}

export function RelatoriosContent() {
  const [preset, setPreset] = useState<AdminReportsPreset>("90D");
  const [tenantId, setTenantId] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<CatalogFilter>("ALL");
  const [statusFilter, setStatusFilter] = useState<CatalogStatusFilter>("ALL");
  const [selectedTab, setSelectedTab] = useState<ReportsHubTabKey>("overview");
  const [catalogPage, setCatalogPage] = useState(1);
  const [catalogPageSize, setCatalogPageSize] =
    useState<(typeof CATALOG_PAGE_SIZE_OPTIONS)[number]>(12);
  const [exporting, setExporting] = useState<AdminReportsFormat | null>(null);

  const { data, error, isLoading, isValidating } = useSWR(
    ["admin-reports-hub", preset, tenantId],
    ([, nextPreset, nextTenantId]) =>
      fetchReports(nextPreset as AdminReportsPreset, nextTenantId as string),
    {
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      refreshInterval: 60000,
    },
  );

  const tenantOptions = useMemo<SearchableSelectOption[]>(() => {
    const options = data?.tenantOptions ?? [];

    return [
      {
        key: "ALL",
        label: "Todos os escritorios",
        textValue: "todos os escritorios global",
        description: "Visao consolidada da operacao inteira",
      },
      ...options.map((tenant) => ({
        key: tenant.key,
        label: tenant.label,
        textValue: `${tenant.label} ${tenant.slug} ${tenant.status}`,
        description: `${tenant.slug} • ${tenant.status}`,
      })),
    ];
  }, [data?.tenantOptions]);

  const categoryOptions = useMemo<SearchableSelectOption[]>(() => {
    if (!data) {
      return [{ key: "ALL", label: "Todas as categorias" }];
    }

    return [
      { key: "ALL", label: "Todas as categorias" },
      ...data.categories.map((category) => ({
        key: category.id,
        label: category.label,
        textValue: `${category.label} ${category.description}`,
        description: `${category.items.length} relatorio(s) ativos`,
      })),
    ];
  }, [data]);

  const filteredReports = useMemo(() => {
    const allReports = data?.categories.flatMap((category) => category.items) ?? [];
    const normalizedSearch = search.trim().toLowerCase();

    return allReports.filter((report) => {
      if (categoryFilter !== "ALL") {
        const category = data?.categories.find((item) => item.id === categoryFilter);

        if (!category?.items.some((item) => item.id === report.id)) {
          return false;
        }
      }

      if (statusFilter !== "ALL" && report.status !== statusFilter) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const haystack = [
        report.title,
        report.description,
        report.audience,
        report.cadence,
        report.tags.join(" "),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    });
  }, [categoryFilter, data, search, statusFilter]);

  const catalogTotalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredReports.length / catalogPageSize)),
    [catalogPageSize, filteredReports.length],
  );

  const safeCatalogPage = Math.min(catalogPage, catalogTotalPages);

  const paginatedReports = useMemo(() => {
    const startIndex = (safeCatalogPage - 1) * catalogPageSize;

    return filteredReports.slice(startIndex, startIndex + catalogPageSize);
  }, [catalogPageSize, filteredReports, safeCatalogPage]);

  const catalogRangeStart =
    filteredReports.length === 0 ? 0 : (safeCatalogPage - 1) * catalogPageSize + 1;
  const catalogRangeEnd =
    filteredReports.length === 0
      ? 0
      : Math.min(filteredReports.length, safeCatalogPage * catalogPageSize);

  useEffect(() => {
    setCatalogPage(1);
  }, [categoryFilter, statusFilter, search, tenantId, preset, catalogPageSize]);

  useEffect(() => {
    if (catalogPage > catalogTotalPages) {
      setCatalogPage(catalogTotalPages);
    }
  }, [catalogPage, catalogTotalPages]);

  const scopeStats = useMemo(() => {
    if (!data) return null;

    return {
      categoryCount: data.categories.length,
      reportCount: data.summary.catalogReports,
      warningCount: data.summary.priorityWatchlist,
    };
  }, [data]);

  const handleExport = async (format: AdminReportsFormat) => {
    if (!data) return;

    setExporting(format);
    const rows = buildExportRows(data, filteredReports);
    const fileBase = `hub-relatorios-admin-${preset.toLowerCase()}-${new Date()
      .toISOString()
      .slice(0, 10)}`;

    try {
      if (format === "CSV") {
        const blob = new Blob([buildCsvFromRows(rows)], {
          type: "text/csv;charset=utf-8;",
        });
        downloadBlob(blob, `${fileBase}.csv`);
      } else if (format === "XLSX") {
        await exportXlsxFile(rows, `${fileBase}.xlsx`);
      } else {
        await exportPdfFile("Hub de relatorios admin", rows, `${fileBase}.pdf`);
      }

      toast.success(`Exportacao ${format} concluida.`);
    } catch (exportError) {
      toast.error("Nao foi possivel exportar o hub de relatorios.");
    } finally {
      setExporting(null);
    }
  };

  return (
    <section className="space-y-6">
      <PeoplePageHeader
        tag="Inteligencia de negocio"
        title="Hub global de relatorios"
        description="Centro mestre para receita, tenants, operacao, suporte, comercial, governanca e entregaveis premium. A ideia aqui nao e so ler KPIs: e decidir onde agir, o que vender e o que auditar."
        actions={
          <>
            <Button
              as={NextLink}
              color="primary"
              href="/admin/dashboard"
              size="sm"
            >
              Abrir dashboard
            </Button>
            <Button as={NextLink} href="/admin/financeiro" size="sm" variant="flat">
              Financeiro global
            </Button>
            <Button as={NextLink} href="/admin/suporte" size="sm" variant="flat">
              Suporte e SLA
            </Button>
            <Button as={NextLink} href="/admin/auditoria" size="sm" variant="flat">
              Auditoria
            </Button>
          </>
        }
      />

      <PeoplePanel
        title="Comando do hub"
        description="Defina o recorte, troque o escritorio quando quiser uma leitura dirigida e exporte a fotografia atual do hub."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              isLoading={exporting === "CSV"}
              size="sm"
              startContent={<Download className="h-4 w-4" />}
              variant="flat"
              onPress={() => handleExport("CSV")}
            >
              Exportar CSV
            </Button>
            <Button
              isLoading={exporting === "XLSX"}
              size="sm"
              startContent={<FileSpreadsheet className="h-4 w-4" />}
              variant="flat"
              onPress={() => handleExport("XLSX")}
            >
              XLSX
            </Button>
            <Button
              isLoading={exporting === "PDF"}
              size="sm"
              startContent={<FileText className="h-4 w-4" />}
              variant="flat"
              onPress={() => handleExport("PDF")}
            >
              PDF
            </Button>
          </div>
        }
      >
        <div className="grid gap-4 lg:grid-cols-[1.25fr_0.95fr]">
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {ADMIN_REPORT_PRESET_OPTIONS.map((option) => (
                <Button
                  key={option.key}
                  color={preset === option.key ? "primary" : "default"}
                  size="sm"
                  variant={preset === option.key ? "solid" : "bordered"}
                  onPress={() => setPreset(option.key)}
                >
                  {option.label}
                </Button>
              ))}
            </div>

            <SearchableSelect
              ariaLabel="Escopo por escritorio"
              description="Escolha um escritorio para ver o hub num recorte individual. Em Todos, a leitura continua global."
              items={tenantOptions}
              label="Escopo do hub"
              placeholder="Todos os escritorios"
              selectedKey={tenantId}
              size="sm"
              onSelectionChange={(key) => setTenantId(key ?? "ALL")}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-default-500">
                Escopo
              </p>
              <p className="mt-2 text-sm font-semibold text-foreground">
                {data?.summary.scopeLabel ?? "Carregando..."}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-default-500">
                Catalogo
              </p>
              <p className="mt-2 text-2xl font-semibold text-primary">
                {scopeStats ? numberFormatter.format(scopeStats.reportCount) : "--"}
              </p>
              <p className="text-xs text-default-400">
                relatorio(s) ativos distribuidos em{" "}
                {scopeStats ? numberFormatter.format(scopeStats.categoryCount) : "--"}{" "}
                frentes
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-default-500">
                Watchlist
              </p>
              <p className="mt-2 text-2xl font-semibold text-warning">
                {scopeStats ? numberFormatter.format(scopeStats.warningCount) : "--"}
              </p>
              <p className="text-xs text-default-400">
                item(ns) sinalizados para acompanhamento
              </p>
            </div>
          </div>
        </div>
      </PeoplePanel>

      {error ? (
        <PeoplePanel
          title="Falha ao carregar o hub"
          description="Nao foi possivel buscar os dados que alimentam os relatorios administrativos."
        >
          <p className="text-sm text-danger">
            {error instanceof Error ? error.message : "Erro inesperado"}
          </p>
        </PeoplePanel>
      ) : null}

      {isLoading && !data ? (
        <PeoplePanel
          title="Sincronizando leitura executiva"
          description="Coletando receita, operacao, SLA, comercial e auditoria."
        >
          <div className="flex items-center gap-2 text-sm text-default-400">
            <Spinner size="sm" />
            Carregando hub de relatorios...
          </div>
        </PeoplePanel>
      ) : null}

      {data ? (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {data.metricCards.map((metric) => (
              <PeopleMetricCard
                key={metric.id}
                helper={metric.helper}
                label={metric.label}
                tone={metric.tone}
                value={formatMetricValue(metric.value, metric.format)}
              />
            ))}
          </div>

          <PeoplePanel
            title={REPORTS_HUB_TAB_META[selectedTab].label}
            description={REPORTS_HUB_TAB_META[selectedTab].description}
          >
            <Tabs
              aria-label="Abas do hub global de relatorios"
              color="primary"
              selectedKey={selectedTab}
              variant="underlined"
              onSelectionChange={(key) => setSelectedTab(key as ReportsHubTabKey)}
            >
              <Tab key="overview" title="Visao executiva">
                <div className="mt-4 grid gap-6 xl:grid-cols-[1.25fr_0.95fr]">
                  <PeoplePanel
                    title="Radar de receita e crescimento"
                    description="Faturado x recebido ao lado de tickets resolvidos, novos tenants e leads ganhos."
                    actions={
                      isValidating ? (
                        <Chip color="primary" size="sm" variant="flat">
                          Atualizando...
                        </Chip>
                      ) : (
                        <Chip color="success" size="sm" variant="flat">
                          Atualizado em {formatDateTime(data.generatedAt)}
                        </Chip>
                      )
                    }
                  >
                    <div className="grid gap-6 xl:grid-cols-2">
                      <div className="h-72">
                        <ResponsiveContainer
                          height="100%"
                          minHeight={240}
                          minWidth={280}
                          width="100%"
                        >
                          <AreaChart data={data.monthlySeries}>
                            <defs>
                              <linearGradient id="recebidoArea" x1="0" x2="0" y1="0" y2="1">
                                <stop offset="5%" stopColor="#2563eb" stopOpacity={0.35} />
                                <stop offset="95%" stopColor="#2563eb" stopOpacity={0.04} />
                              </linearGradient>
                              <linearGradient id="faturadoArea" x1="0" x2="0" y1="0" y2="1">
                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                                <stop offset="95%" stopColor="#10b981" stopOpacity={0.03} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                            <XAxis dataKey="label" stroke="#94a3b8" tickLine={false} />
                            <YAxis
                              stroke="#94a3b8"
                              tickFormatter={(value) => numberFormatter.format(value)}
                              tickLine={false}
                            />
                            <Tooltip content={<ChartTooltip />} />
                            <Legend />
                            <Area
                              dataKey="faturado"
                              fill="url(#faturadoArea)"
                              name="Faturado"
                              stroke="#10b981"
                              strokeWidth={2}
                              type="monotone"
                            />
                            <Area
                              dataKey="recebido"
                              fill="url(#recebidoArea)"
                              name="Recebido"
                              stroke="#2563eb"
                              strokeWidth={2}
                              type="monotone"
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>

                      <div className="h-72">
                        <ResponsiveContainer
                          height="100%"
                          minHeight={240}
                          minWidth={280}
                          width="100%"
                        >
                          <BarChart data={data.monthlySeries}>
                            <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                            <XAxis dataKey="label" stroke="#94a3b8" tickLine={false} />
                            <YAxis stroke="#94a3b8" tickLine={false} />
                            <Tooltip content={<ChartTooltip />} />
                            <Legend />
                            <Bar
                              dataKey="ticketsAbertos"
                              fill="#f59e0b"
                              name="Tickets abertos"
                              radius={[8, 8, 0, 0]}
                            />
                            <Bar
                              dataKey="ticketsResolvidos"
                              fill="#10b981"
                              name="Tickets resolvidos"
                              radius={[8, 8, 0, 0]}
                            />
                            <Bar
                              dataKey="novosTenants"
                              fill="#8b5cf6"
                              name="Novos tenants"
                              radius={[8, 8, 0, 0]}
                            />
                            <Bar
                              dataKey="leadsGanhos"
                              fill="#2563eb"
                              name="Leads ganhos"
                              radius={[8, 8, 0, 0]}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </PeoplePanel>

                  <div className="grid gap-6">
                    <PeoplePanel
                      title="Composicao financeira"
                      description="Metodos de pagamento aceitos e distribuicao de uso no periodo."
                    >
                      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                        <div className="h-56">
                          <ResponsiveContainer
                            height="100%"
                            minHeight={220}
                            minWidth={220}
                            width="100%"
                          >
                            <PieChart>
                              <Pie
                                cx="50%"
                                cy="50%"
                                data={data.paymentMethodBreakdown}
                                dataKey="value"
                                innerRadius={52}
                                nameKey="label"
                                outerRadius={78}
                                paddingAngle={2}
                              >
                                {data.paymentMethodBreakdown.map((entry, index) => (
                                  <Cell
                                    key={entry.id}
                                    fill={CHART_COLORS[index % CHART_COLORS.length]}
                                  />
                                ))}
                              </Pie>
                              <Tooltip content={<ChartTooltip />} />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>

                        <div className="space-y-2">
                          {data.paymentMethodBreakdown.length === 0 ? (
                            <PeopleEmptyState
                              description="Nao houve pagamento confirmado no recorte."
                              title="Sem composicao de receita"
                            />
                          ) : (
                            data.paymentMethodBreakdown.map((entry, index) => (
                              <div
                                key={entry.id}
                                className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3"
                              >
                                <div className="flex items-center gap-3">
                                  <span
                                    className="h-3 w-3 rounded-full"
                                    style={{
                                      backgroundColor:
                                        CHART_COLORS[index % CHART_COLORS.length],
                                    }}
                                  />
                                  <div>
                                    <p className="text-sm font-semibold text-foreground">
                                      {entry.label}
                                    </p>
                                    <p className="text-xs text-default-400">
                                      canal de cobranca confirmado
                                    </p>
                                  </div>
                                </div>
                                <span className="text-sm font-semibold text-default-200">
                                  {numberFormatter.format(entry.value)}
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </PeoplePanel>

                    <PeoplePanel
                      title="Suporte e pipeline"
                      description="Fila de atendimento e distribuicao do funil comercial."
                    >
                      <div className="grid gap-4 lg:grid-cols-2">
                        <div className="h-52 rounded-2xl border border-white/10 bg-white/[0.02] p-3">
                          <ResponsiveContainer
                            height="100%"
                            minHeight={180}
                            minWidth={220}
                            width="100%"
                          >
                            <BarChart data={data.supportStatusBreakdown}>
                              <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                              <XAxis dataKey="label" stroke="#94a3b8" tickLine={false} />
                              <YAxis stroke="#94a3b8" tickLine={false} />
                              <Tooltip content={<ChartTooltip />} />
                              <Bar
                                dataKey="value"
                                fill="#f59e0b"
                                name="Tickets"
                                radius={[8, 8, 0, 0]}
                              />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>

                        <div className="h-52 rounded-2xl border border-white/10 bg-white/[0.02] p-3">
                          <ResponsiveContainer
                            height="100%"
                            minHeight={180}
                            minWidth={220}
                            width="100%"
                          >
                            <BarChart data={data.leadStatusBreakdown}>
                              <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                              <XAxis dataKey="label" stroke="#94a3b8" tickLine={false} />
                              <YAxis stroke="#94a3b8" tickLine={false} />
                              <Tooltip content={<ChartTooltip />} />
                              <Bar
                                dataKey="value"
                                fill="#2563eb"
                                name="Leads"
                                radius={[8, 8, 0, 0]}
                              />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    </PeoplePanel>
                  </div>
                </div>
              </Tab>

              <Tab key="catalog" title="Biblioteca comercial">
                <div className="mt-4 flex flex-col gap-6">
                  <PeoplePanel
                    title="Frentes de relatacao priorizadas"
                    description="Cada bloco abaixo representa uma frente do negocio com quick access, leitura viva e catalogo associado."
                  >
                    <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                      {data.categories.map((category) => (
                        <PeopleEntityCard
                          key={category.id}
                          isPressable
                          onPress={() => {
                            setCategoryFilter(category.id);
                            setSelectedTab("catalog");
                          }}
                        >
                          <PeopleEntityCardHeader>
                            <div className="flex w-full items-start justify-between gap-3">
                              <div className="flex items-center gap-3">
                                <span className="rounded-2xl border border-white/10 bg-white/[0.06] p-2 text-primary">
                                  {getCategoryIcon(category.icon)}
                                </span>
                                <div>
                                  <p className="text-sm font-semibold text-foreground">
                                    {category.label}
                                  </p>
                                  <p className="text-xs text-default-400">
                                    {category.items.length} relatorio(s) ativos
                                  </p>
                                </div>
                              </div>
                              <ArrowUpRight className="h-4 w-4 text-default-400" />
                            </div>
                          </PeopleEntityCardHeader>
                          <PeopleEntityCardBody className="space-y-3">
                            <p className="text-sm text-default-300">{category.description}</p>
                            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-default-500">
                                {category.primaryMetricLabel}
                              </p>
                              <p className="mt-2 text-2xl font-semibold text-foreground">
                                {formatMetricValue(
                                  category.primaryMetricValue,
                                  category.primaryMetricFormat,
                                )}
                              </p>
                            </div>
                            <div className="space-y-2">
                              {category.highlights.map((highlight) => (
                                <div
                                  key={`${category.id}-${highlight}`}
                                  className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-xs text-default-300"
                                >
                                  {highlight}
                                </div>
                              ))}
                            </div>
                          </PeopleEntityCardBody>
                        </PeopleEntityCard>
                      ))}
                    </div>
                  </PeoplePanel>

                  <PeoplePanel
                    title="Mais pedidos pelo negocio"
                    description="Recortes de alto impacto para diretoria, financeiro, CS, suporte e growth."
                  >
                    <div className="grid gap-3 lg:grid-cols-2">
                      {data.spotlightReports.map((report) => (
                        <div
                          key={report.id}
                          className="rounded-2xl border border-white/10 bg-white/[0.02] p-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-foreground">
                                {report.title}
                              </p>
                              <p className="mt-1 text-xs text-default-400">
                                {report.description}
                              </p>
                            </div>
                            <Chip
                              color={getChipColor(report.status)}
                              size="sm"
                              variant="flat"
                            >
                              {report.status === "ATENCAO" ? "Atencao" : "Disponivel"}
                            </Chip>
                          </div>
                          <div className="mt-4 flex flex-wrap items-center gap-2">
                            {report.tags.slice(0, 3).map((tag) => (
                              <Chip key={`${report.id}-${tag}`} size="sm" variant="bordered">
                                {tag}
                              </Chip>
                            ))}
                          </div>
                          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-default-500">
                              {report.liveMetricLabel}
                            </p>
                            <p className="mt-2 text-lg font-semibold text-foreground">
                              {formatMetricValue(
                                report.liveMetricValue,
                                report.liveMetricFormat,
                              )}
                            </p>
                            <p className="text-xs text-default-400">
                              {report.audience} • {report.cadence}
                            </p>
                          </div>
                          <div className="mt-4 flex items-center justify-between gap-2">
                            <div className="flex flex-wrap gap-2">
                              {report.exports.map((format) => (
                                <Chip key={`${report.id}-${format}`} size="sm" variant="flat">
                                  {format}
                                </Chip>
                              ))}
                            </div>
                            <Button
                              as={NextLink}
                              href={report.href}
                              size="sm"
                              variant="flat"
                            >
                              Abrir origem
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </PeoplePanel>

                  <PeoplePanel
                    title="Catalogo mestre de relatorios"
                    description="Biblioteca unica para procurar tudo o que a empresa precisa ler, vender, auditar e exportar."
                  >
                    <div className="mb-4 grid gap-3 xl:grid-cols-[1.2fr_0.9fr_0.8fr]">
                      <SearchableSelect
                        ariaLabel="Categoria do catalogo"
                        items={categoryOptions}
                        label="Categoria"
                        placeholder="Todas as categorias"
                        selectedKey={categoryFilter}
                        size="sm"
                        onSelectionChange={(key) => setCategoryFilter(key ?? "ALL")}
                      />

                      <SearchableSelect
                        ariaLabel="Status do catalogo"
                        items={[
                          { key: "ALL", label: "Todos os status" },
                          {
                            key: "DISPONIVEL",
                            label: "Disponiveis",
                            description: "Leituras prontas para uso e exportacao",
                          },
                          {
                            key: "ATENCAO",
                            label: "Em atencao",
                            description: "Demandam acompanhamento prioritario",
                          },
                        ]}
                        label="Status"
                        placeholder="Todos os status"
                        selectedKey={statusFilter}
                        size="sm"
                        onSelectionChange={(key) =>
                          setStatusFilter((key as CatalogStatusFilter | null) ?? "ALL")
                        }
                      />

                      <Input
                        aria-label="Busca rapida no catalogo"
                        label="Busca rapida"
                        placeholder="Pesquisar relatorio, publico ou tag"
                        size="sm"
                        startContent={<Search className="h-4 w-4 text-default-400" />}
                        value={search}
                        onValueChange={setSearch}
                      />
                    </div>

                    <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          Exibindo {catalogRangeStart}-{catalogRangeEnd} de{" "}
                          {numberFormatter.format(filteredReports.length)} relatorio(s)
                        </p>
                        <p className="text-xs text-default-400">
                          A busca e os filtros continuam sobre o catalogo inteiro; a paginação só organiza a leitura.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-default-500">
                          Por pagina
                        </span>
                        {CATALOG_PAGE_SIZE_OPTIONS.map((pageSizeOption) => (
                          <Button
                            key={pageSizeOption}
                            color={
                              catalogPageSize === pageSizeOption ? "primary" : "default"
                            }
                            size="sm"
                            variant={
                              catalogPageSize === pageSizeOption ? "solid" : "bordered"
                            }
                            onPress={() => setCatalogPageSize(pageSizeOption)}
                          >
                            {pageSizeOption}
                          </Button>
                        ))}
                      </div>
                    </div>

                    {filteredReports.length === 0 ? (
                      <PeopleEmptyState
                        icon={<AlertTriangle className="h-6 w-6" />}
                        title="Nenhum relatorio bateu com os filtros"
                        description="Ajuste categoria, status ou texto de busca para voltar ao catalogo."
                      />
                    ) : (
                      <div className="space-y-4">
                        <Table
                          aria-label="Catalogo mestre de relatorios"
                          removeWrapper
                          classNames={{
                            table: "min-w-full",
                          }}
                        >
                          <TableHeader>
                            <TableColumn>RELATORIO</TableColumn>
                            <TableColumn>PUBLICO</TableColumn>
                            <TableColumn>CADENCIA</TableColumn>
                            <TableColumn>METRICA VIVA</TableColumn>
                            <TableColumn>STATUS</TableColumn>
                            <TableColumn>EXPORT</TableColumn>
                            <TableColumn>ORIGEM</TableColumn>
                          </TableHeader>
                          <TableBody>
                            {paginatedReports.map((report) => (
                              <TableRow key={report.id}>
                                <TableCell>
                                  <div className="space-y-1">
                                    <p className="text-sm font-semibold text-foreground">
                                      {report.title}
                                    </p>
                                    <p className="max-w-xl text-xs text-default-400">
                                      {report.description}
                                    </p>
                                    <div className="flex flex-wrap gap-1">
                                      {report.tags.slice(0, 3).map((tag) => (
                                        <Chip
                                          key={`${report.id}-${tag}`}
                                          size="sm"
                                          variant="bordered"
                                        >
                                          {tag}
                                        </Chip>
                                      ))}
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell>{report.audience}</TableCell>
                                <TableCell>{report.cadence}</TableCell>
                                <TableCell>
                                  <div>
                                    <p className="text-sm font-semibold text-foreground">
                                      {formatMetricValue(
                                        report.liveMetricValue,
                                        report.liveMetricFormat,
                                      )}
                                    </p>
                                    <p className="text-xs text-default-400">
                                      {report.liveMetricLabel}
                                    </p>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Chip
                                    color={getChipColor(report.status)}
                                    size="sm"
                                    variant="flat"
                                  >
                                    {report.status === "ATENCAO"
                                      ? "Atencao"
                                      : "Disponivel"}
                                  </Chip>
                                </TableCell>
                                <TableCell>
                                  <div className="flex flex-wrap gap-1">
                                    {report.exports.map((format) => (
                                      <Chip
                                        key={`${report.id}-${format}`}
                                        size="sm"
                                        variant="flat"
                                      >
                                        {format}
                                      </Chip>
                                    ))}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Button
                                    as={NextLink}
                                    href={report.href}
                                    size="sm"
                                    variant="flat"
                                  >
                                    Abrir
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>

                        {catalogTotalPages > 1 ? (
                          <div className="flex flex-col gap-3 border-t border-white/10 pt-4 lg:flex-row lg:items-center lg:justify-between">
                            <p className="text-xs text-default-400">
                              Pagina {safeCatalogPage} de {catalogTotalPages} no catalogo mestre.
                            </p>
                            <Pagination
                              showControls
                              page={safeCatalogPage}
                              total={catalogTotalPages}
                              onChange={setCatalogPage}
                            />
                          </div>
                        ) : null}
                      </div>
                    )}
                  </PeoplePanel>
                </div>
              </Tab>

              <Tab key="monitoring" title="Monitoramento">
                <div className="mt-4 flex flex-col gap-6">
                  <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
                    <PeoplePanel
                      title="Tenants de maior valor"
                      description="Escritorios com maior contribuicao financeira no recorte."
                    >
                      <div className="space-y-3">
                        {data.topTenants.length === 0 ? (
                          <PeopleEmptyState
                            description="Sem receita confirmada no recorte atual."
                            title="Ranking indisponivel"
                          />
                        ) : (
                          data.topTenants.map((tenant) => (
                            <div
                              key={tenant.id}
                              className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.02] p-3"
                            >
                              <div>
                                <p className="text-sm font-semibold text-foreground">
                                  {tenant.title}
                                </p>
                                <p className="text-xs text-default-400">
                                  {tenant.subtitle}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-sm font-semibold text-success">
                                  {formatMetricValue(tenant.value, tenant.format)}
                                </p>
                                {tenant.badge ? (
                                  <Chip size="sm" variant="flat">
                                    {tenant.badge}
                                  </Chip>
                                ) : null}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </PeoplePanel>

                    <div className="grid gap-6">
                      <PeoplePanel
                        title="Risco por escritorio"
                        description="Composicao de risco usando inadimplencia, SLA e status do tenant."
                      >
                        <div className="space-y-3">
                          {data.atRiskTenants.length === 0 ? (
                            <PeopleEmptyState
                              description="Nenhum escritorio com score de risco acima do baseline."
                              title="Risco controlado"
                            />
                          ) : (
                            data.atRiskTenants.map((tenant) => (
                              <div
                                key={tenant.id}
                                className="flex items-center justify-between rounded-2xl border border-danger/20 bg-danger/5 p-3"
                              >
                                <div>
                                  <p className="text-sm font-semibold text-foreground">
                                    {tenant.title}
                                  </p>
                                  <p className="text-xs text-default-400">
                                    {tenant.subtitle}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <p className="text-sm font-semibold text-danger">
                                    {formatMetricValue(tenant.value, tenant.format)}
                                  </p>
                                  {tenant.badge ? (
                                    <Chip color="warning" size="sm" variant="flat">
                                      {tenant.badge}
                                    </Chip>
                                  ) : null}
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </PeoplePanel>
                    </div>
                  </div>

                  <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
                    <PeoplePanel
                      title="Ultimas acoes administrativas"
                      description="Trilha recente da camada super admin para leitura de governanca."
                    >
                      <div className="space-y-3">
                        {data.latestAudit.length === 0 ? (
                          <PeopleEmptyState
                            description="Sem eventos administrativos recentes no escopo."
                            title="Auditoria recente vazia"
                          />
                        ) : (
                          data.latestAudit.map((entry) => (
                            <div
                              key={entry.id}
                              className="rounded-2xl border border-white/10 bg-white/[0.02] p-3"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold text-foreground">
                                    {entry.action}
                                  </p>
                                  <p className="text-xs text-default-400">
                                    {entry.entity} • {entry.actor}
                                  </p>
                                </div>
                                <span className="text-xs text-default-500">
                                  {formatDateTime(entry.createdAt)}
                                </span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </PeoplePanel>

                    <PeoplePanel
                      title="Fila recente de suporte"
                      description="Ultimos tickets observados com prioridade e sinal de SLA."
                    >
                      <div className="space-y-3">
                        {data.latestSupport.length === 0 ? (
                          <PeopleEmptyState
                            description="Sem tickets recentes no escopo selecionado."
                            title="Sem movimentacao de suporte"
                          />
                        ) : (
                          data.latestSupport.map((ticket) => (
                            <div
                              key={ticket.id}
                              className="rounded-2xl border border-white/10 bg-white/[0.02] p-3"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold text-foreground">
                                    {ticket.title}
                                  </p>
                                  <p className="text-xs text-default-400">
                                    {ticket.tenantName} • {ticket.status} • {ticket.priority}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <Chip
                                    color={ticket.slaBreached ? "warning" : "success"}
                                    size="sm"
                                    variant="flat"
                                  >
                                    {ticket.slaBreached
                                      ? "SLA em risco"
                                      : "Dentro do SLA"}
                                  </Chip>
                                  <p className="mt-1 text-xs text-default-500">
                                    {formatDateTime(ticket.createdAt)}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </PeoplePanel>
                  </div>
                </div>
              </Tab>
            </Tabs>
          </PeoplePanel>
        </>
      ) : null}
    </section>
  );
}
