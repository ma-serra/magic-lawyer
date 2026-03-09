"use client";

import { useMemo } from "react";
import useSWR from "swr";
import NextLink from "next/link";
import { Button, Chip, Spinner } from "@heroui/react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
  BarChart,
} from "recharts";
import {
  AlertTriangle,
  Building2,
  DollarSign,
  FileText,
  TrendingUp,
  Users,
} from "lucide-react";

import {
  getSuperAdminDashboardData,
  type AdminDashboardData,
} from "@/app/actions/admin-dashboard";
import {
  PeopleMetricCard,
  PeoplePageHeader,
  PeoplePanel,
} from "@/components/people-ui";

const CHART_COLORS = {
  revenue: "#0ea5e9",
  tenants: "#22c55e",
  users: "#f59e0b",
  active: "#22c55e",
  suspended: "#f59e0b",
  cancelled: "#ef4444",
  neutral: "#64748b",
} as const;

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat("pt-BR");

function formatCurrency(value: number) {
  return currencyFormatter.format(value || 0);
}

function formatNumber(value: number) {
  return numberFormatter.format(value || 0);
}

function pct(current: number, previous: number) {
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

function pctLabel(value: number | null) {
  if (value === null || Number.isNaN(value)) return "—";
  const signal = value > 0 ? "+" : "";
  return `${signal}${value.toFixed(1)}%`;
}

function fetchAdminDashboard() {
  return getSuperAdminDashboardData().then((response) => {
    if (!response.success || !response.data) {
      throw new Error(response.error ?? "Falha ao carregar dashboard");
    }

    return response.data;
  });
}

type ChartTooltipPayloadItem = {
  name?: string;
  value?: number | string;
};

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: ChartTooltipPayloadItem[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border border-white/10 bg-content1/95 p-3 shadow-xl backdrop-blur">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-default-500">
        {label}
      </p>
      <div className="space-y-1">
        {payload.map((item: ChartTooltipPayloadItem) => (
          <p key={item.name} className="text-xs text-foreground">
            <span className="font-medium">{item.name}:</span>{" "}
            {item.name?.toLowerCase().includes("receita")
              ? formatCurrency(Number(item.value || 0))
              : formatNumber(Number(item.value || 0))}
          </p>
        ))}
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={`metric-skeleton-${index}`}
            className="h-28 animate-pulse rounded-2xl border border-white/10 bg-white/[0.03]"
          />
        ))}
      </div>
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={`panel-skeleton-${index}`}
          className="h-80 animate-pulse rounded-2xl border border-white/10 bg-white/[0.03]"
        />
      ))}
    </div>
  );
}

function buildRecommendations(params: {
  revenueMoM: number | null;
  invoicePressure: number;
  activeTenantRate: number;
  top1Share: number;
}) {
  const recommendations: Array<{
    title: string;
    detail: string;
    tone: "success" | "warning" | "danger" | "primary";
  }> = [];

  if (params.revenueMoM !== null && params.revenueMoM < 0) {
    recommendations.push({
      title: "Receita caiu no mês atual",
      detail:
        "Revisar churn, atraso de cobrança e expansão de contas enterprise nos próximos 7 dias.",
      tone: "danger",
    });
  } else {
    recommendations.push({
      title: "Receita em estabilidade/crescimento",
      detail:
        "Manter foco em retenção e expansão de base ativa para sustentar o ritmo.",
      tone: "success",
    });
  }

  if (params.invoicePressure >= 15) {
    recommendations.push({
      title: "Pressão de cobrança acima do ideal",
      detail:
        "Fortalecer rotina de cobrança preventiva e bloquear downgrade sem negociação ativa.",
      tone: "warning",
    });
  }

  if (params.activeTenantRate < 90) {
    recommendations.push({
      title: "Taxa de tenants ativos pode melhorar",
      detail:
        "Acionar plano de recuperação de tenants suspensos e investigar causa de cancelamento.",
      tone: "warning",
    });
  }

  if (params.top1Share >= 45) {
    recommendations.push({
      title: "Concentração alta de receita em poucos tenants",
      detail:
        "Risco de concentração. Priorizar aquisição e expansão em contas médias para diluir dependência.",
      tone: "primary",
    });
  }

  return recommendations.slice(0, 4);
}

export function AdminDashboardContent() {
  const { data, error, isLoading } = useSWR<AdminDashboardData>(
    "admin-dashboard-overview",
    fetchAdminDashboard,
    {
      revalidateOnFocus: false,
    },
  );

  const analytics = useMemo(() => {
    if (!data) return null;

    const revenueSeries = data.revenueSeries;
    const growthSeries = data.tenantGrowthSeries;
    const usersSeries = data.userGrowthSeries;

    const lastRevenue = revenueSeries.at(-1)?.value ?? 0;
    const prevRevenue = revenueSeries.at(-2)?.value ?? 0;
    const revenueMoM = pct(lastRevenue, prevRevenue);

    const lastTenantAdds = growthSeries.at(-1)?.value ?? 0;
    const prevTenantAdds = growthSeries.at(-2)?.value ?? 0;
    const tenantGrowthMoM = pct(lastTenantAdds, prevTenantAdds);

    const activeTenantRate =
      data.totals.totalTenants > 0
        ? (data.totals.activeTenants / data.totals.totalTenants) * 100
        : 0;

    const invoicePressure =
      data.totals.activeTenants > 0
        ? (data.totals.outstandingInvoices / data.totals.activeTenants) * 100
        : 0;

    const topRevenueSum = data.topTenants.reduce(
      (acc, tenant) => acc + tenant.revenue90d,
      0,
    );
    const top1Share =
      topRevenueSum > 0 ? (data.topTenants[0]?.revenue90d ?? 0) / topRevenueSum * 100 : 0;

    const chartSeries = revenueSeries.map((point, index) => ({
      label: point.label,
      receita: point.value,
      novosTenants: growthSeries[index]?.value ?? 0,
      novosUsuarios: usersSeries[index]?.value ?? 0,
    }));

    const tenantStatusChart = [
      {
        name: "Ativos",
        value: data.totals.activeTenants,
        color: CHART_COLORS.active,
      },
      {
        name: "Suspensos",
        value: data.totals.suspendedTenants,
        color: CHART_COLORS.suspended,
      },
      {
        name: "Cancelados",
        value: data.totals.cancelledTenants,
        color: CHART_COLORS.cancelled,
      },
    ].filter((item) => item.value > 0);

    const topTenantsChart = data.topTenants.map((tenant) => ({
      name: tenant.name.length > 24 ? `${tenant.name.slice(0, 24)}…` : tenant.name,
      receita90d: tenant.revenue90d,
    }));

    const recommendations = buildRecommendations({
      revenueMoM,
      invoicePressure,
      activeTenantRate,
      top1Share,
    });

    return {
      revenueMoM,
      tenantGrowthMoM,
      activeTenantRate,
      invoicePressure,
      top1Share,
      chartSeries,
      tenantStatusChart,
      topTenantsChart,
      recommendations,
    };
  }, [data]);

  if (!data || !analytics) {
    return (
      <section className="space-y-6">
        <PeoplePageHeader
          tag="Administração"
          title="Cockpit executivo"
          description="Painel para decisões de crescimento, retenção e eficiência operacional da plataforma."
        />
        {isLoading ? <DashboardSkeleton /> : null}
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <PeoplePageHeader
        tag="Administração"
        title="Cockpit executivo do Magic Lawyer"
        description="Foco em poucos indicadores que movem decisão: receita, crescimento, retenção operacional e risco de concentração."
        actions={
          <>
            <Button as={NextLink} color="primary" href="/admin/tenants" size="sm">
              Tenants
            </Button>
            <Button as={NextLink} href="/admin/auditoria" size="sm" variant="bordered">
              Auditoria
            </Button>
          </>
        }
      />

      {error ? (
        <PeoplePanel
          title="Falha ao carregar painel"
          description="Não foi possível obter os dados do dashboard administrativo."
        >
          <div className="flex items-center gap-2 text-sm text-danger">
            <AlertTriangle className="h-4 w-4" />
            {error instanceof Error ? error.message : "Erro inesperado"}
          </div>
        </PeoplePanel>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <PeopleMetricCard
          label="Receita 30 dias"
          value={formatCurrency(data.totals.revenueLast30Days)}
          helper="Entrada confirmada"
          tone="success"
          icon={<DollarSign className="h-4 w-4" />}
        />
        <PeopleMetricCard
          label="Crescimento mensal"
          value={pctLabel(analytics.revenueMoM)}
          helper="Receita vs mês anterior"
          tone={
            analytics.revenueMoM !== null && analytics.revenueMoM < 0
              ? "danger"
              : "primary"
          }
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <PeopleMetricCard
          label="Tenants ativos"
          value={`${analytics.activeTenantRate.toFixed(1)}%`}
          helper={`${data.totals.activeTenants}/${data.totals.totalTenants} em operação`}
          tone="primary"
          icon={<Building2 className="h-4 w-4" />}
        />
        <PeopleMetricCard
          label="Pressão de cobrança"
          value={`${analytics.invoicePressure.toFixed(1)}%`}
          helper="Faturas em aberto por tenant ativo"
          tone={analytics.invoicePressure >= 15 ? "warning" : "default"}
          icon={<FileText className="h-4 w-4" />}
        />
        <PeopleMetricCard
          label="Concentração top-1"
          value={`${analytics.top1Share.toFixed(1)}%`}
          helper="Receita do maior tenant entre top 5"
          tone={analytics.top1Share >= 45 ? "warning" : "secondary"}
          icon={<Users className="h-4 w-4" />}
        />
      </div>

      <PeoplePanel
        title="Motor de crescimento"
        description="Receita mensal confirmada com entradas de novos tenants e usuários."
      >
        <div className="h-[360px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={analytics.chartSeries}>
              <CartesianGrid stroke="rgba(148,163,184,0.15)" strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 12 }} tickLine={false} axisLine={false} />
              <YAxis
                yAxisId="money"
                tick={{ fill: "#94a3b8", fontSize: 12 }}
                tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                yAxisId="count"
                orientation="right"
                tick={{ fill: "#94a3b8", fontSize: 12 }}
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<ChartTooltip />} />
              <Legend />
              <Area
                yAxisId="money"
                dataKey="receita"
                name="Receita"
                type="monotone"
                stroke={CHART_COLORS.revenue}
                fill={CHART_COLORS.revenue}
                fillOpacity={0.2}
                strokeWidth={2}
              />
              <Bar
                yAxisId="count"
                dataKey="novosTenants"
                name="Novos tenants"
                fill={CHART_COLORS.tenants}
                barSize={18}
                radius={[4, 4, 0, 0]}
              />
              <Bar
                yAxisId="count"
                dataKey="novosUsuarios"
                name="Novos usuários"
                fill={CHART_COLORS.users}
                barSize={18}
                radius={[4, 4, 0, 0]}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <p className="text-xs uppercase tracking-[0.14em] text-default-500">Crescimento de receita</p>
            <p className="text-sm font-semibold text-foreground">{pctLabel(analytics.revenueMoM)}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <p className="text-xs uppercase tracking-[0.14em] text-default-500">Crescimento de novos tenants</p>
            <p className="text-sm font-semibold text-foreground">{pctLabel(analytics.tenantGrowthMoM)}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <p className="text-xs uppercase tracking-[0.14em] text-default-500">Ticket médio por tenant ativo</p>
            <p className="text-sm font-semibold text-foreground">
              {formatCurrency(
                data.totals.activeTenants > 0
                  ? data.totals.revenueLast30Days / data.totals.activeTenants
                  : 0,
              )}
            </p>
          </div>
        </div>
      </PeoplePanel>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <PeoplePanel
          title="Receita por tenant (90 dias)"
          description="Visão de concentração para decisões de risco e expansão comercial."
        >
          <div className="h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.topTenantsChart} layout="vertical" margin={{ left: 10, right: 10 }}>
                <CartesianGrid stroke="rgba(148,163,184,0.15)" strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  tick={{ fill: "#94a3b8", fontSize: 12 }}
                  tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={180}
                  tick={{ fill: "#94a3b8", fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="receita90d" name="Receita 90d" radius={[0, 6, 6, 0]} fill={CHART_COLORS.revenue} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </PeoplePanel>

        <PeoplePanel
          title="Status da carteira de tenants"
          description="Distribuição operacional da base ativa/suspensa/cancelada."
        >
          {analytics.tenantStatusChart.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-default-400">
              <Spinner size="sm" />
              Sem dados de status no momento.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="h-[220px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={analytics.tenantStatusChart}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={45}
                      outerRadius={80}
                      paddingAngle={3}
                    >
                      {analytics.tenantStatusChart.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="space-y-2">
                {analytics.tenantStatusChart.map((item) => (
                  <div
                    key={item.name}
                    className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2"
                  >
                    <div className="flex items-center gap-2 text-sm text-foreground">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: item.color }} />
                      {item.name}
                    </div>
                    <Chip size="sm" variant="flat">
                      {formatNumber(item.value)}
                    </Chip>
                  </div>
                ))}
              </div>
            </div>
          )}
        </PeoplePanel>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <PeoplePanel
          title="Leituras prioritárias para CEO"
          description="Recomendações automáticas com base no estado atual de receita, cobrança e retenção da base."
        >
          <div className="space-y-3">
            {analytics.recommendations.length === 0 ? (
              <p className="text-sm text-default-400">Sem recomendações críticas neste momento.</p>
            ) : (
              analytics.recommendations.map((item, idx) => (
                <div
                  key={`${item.title}-${idx}`}
                  className="rounded-xl border border-white/10 bg-white/[0.02] p-3"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <Chip size="sm" color={item.tone} variant="flat">
                      {item.tone === "danger"
                        ? "Risco"
                        : item.tone === "warning"
                          ? "Atenção"
                          : item.tone === "success"
                            ? "Saudável"
                            : "Estratégico"}
                    </Chip>
                    <p className="text-sm font-semibold text-foreground">{item.title}</p>
                  </div>
                  <p className="text-sm text-default-400">{item.detail}</p>
                </div>
              ))
            )}
          </div>
        </PeoplePanel>

        <PeoplePanel
          title="Auditoria executiva"
          description="Últimos eventos administrativos que impactam governança da plataforma."
          actions={
            <Button as={NextLink} href="/admin/auditoria" size="sm" variant="flat">
              Ver auditoria completa
            </Button>
          }
        >
          <div className="space-y-3">
            {data.auditLog.length === 0 ? (
              <p className="text-sm text-default-400">Sem ações administrativas recentes.</p>
            ) : (
              data.auditLog.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-xl border border-white/10 bg-white/[0.02] p-3"
                >
                  <p className="text-xs text-default-500">
                    {new Date(entry.createdAt).toLocaleString("pt-BR")}
                  </p>
                  <p className="text-sm font-semibold text-foreground">{entry.action}</p>
                  <p className="text-xs text-default-400">{entry.summary}</p>
                </div>
              ))
            )}
          </div>
        </PeoplePanel>
      </div>
    </section>
  );
}
