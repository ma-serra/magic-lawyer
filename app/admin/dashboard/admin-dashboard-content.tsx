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
  BellRing,
  Building2,
  DollarSign,
  FileText,
  KeyRound,
  MapPinned,
  Scale,
  Shield,
  ShieldAlert,
  TrendingUp,
  Users,
} from "lucide-react";

import {
  getAdminSecurityDashboard,
  type AdminSecurityDashboardResponse,
} from "@/app/actions/admin-security";
import {
  getSuperAdminDashboardData,
  type AdminDashboardData,
} from "@/app/actions/admin-dashboard";
import {
  PeopleMetricCard,
  PeoplePageHeader,
  PeoplePanel,
} from "@/components/people-ui";
import { BrazilCoverageMap } from "@/components/dashboard/brazil-coverage-map";

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

function analyticsSafePercent(value: number | null) {
  if (value === null || Number.isNaN(value)) return 0;
  return Number(value.toFixed(1));
}

function formatLastSeen(value: string) {
  const diffMs = Date.now() - new Date(value).getTime();
  const diffSeconds = Math.max(0, Math.floor(diffMs / 1000));

  if (diffSeconds < 60) {
    return "agora";
  }

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return `${diffMinutes} min atrás`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  return `${diffHours} h atrás`;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("pt-BR");
}

function fetchAdminDashboard() {
  return getSuperAdminDashboardData().then((response) => {
    if (!response.success || !response.data) {
      throw new Error(response.error ?? "Falha ao carregar dashboard");
    }

    return response.data;
  });
}

type AdminSecuritySnapshot = NonNullable<AdminSecurityDashboardResponse["data"]>;

function fetchAdminSecuritySnapshot() {
  return getAdminSecurityDashboard().then((response) => {
    if (!response.success || !response.data) {
      throw new Error(response.error ?? "Falha ao carregar radar de seguranca");
    }

    return response.data as AdminSecuritySnapshot;
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
    <div className="rounded-lg ml-admin-tooltip-surface p-3">
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
            className="h-28 animate-pulse rounded-2xl ml-admin-surface-muted"
          />
        ))}
      </div>
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={`panel-skeleton-${index}`}
          className="h-80 animate-pulse rounded-2xl ml-admin-surface-muted"
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
      revalidateOnFocus: true,
      refreshInterval: 15_000,
      dedupingInterval: 5_000,
    },
  );
  const {
    data: securitySnapshot,
    error: securityError,
    isLoading: isSecurityLoading,
  } = useSWR<AdminSecuritySnapshot>(
    "admin-dashboard-security-snapshot",
    fetchAdminSecuritySnapshot,
    {
      revalidateOnFocus: true,
      refreshInterval: 30_000,
      dedupingInterval: 10_000,
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
      topRevenueSum > 0
        ? ((data.topTenants[0]?.revenue90d ?? 0) / topRevenueSum) * 100
        : 0;

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
      name:
        tenant.name.length > 24 ? `${tenant.name.slice(0, 24)}…` : tenant.name,
      receita90d: tenant.revenue90d,
    }));

    const recommendations = buildRecommendations({
      revenueMoM,
      invoicePressure,
      activeTenantRate,
      top1Share,
    });

    const focusCards = [
      {
        label: "Receita do mês",
        value: pctLabel(revenueMoM),
        detail:
          revenueMoM !== null && revenueMoM < 0
            ? "Atenção imediata em churn, inadimplência e expansão."
            : "Mantém ritmo de crescimento ou estabilidade saudável.",
        tone:
          revenueMoM !== null && revenueMoM < 0
            ? ("danger" as const)
            : ("success" as const),
      },
      {
        label: "Pressão de cobrança",
        value: `${analyticsSafePercent(invoicePressure)}%`,
        detail:
          invoicePressure >= 15
            ? "Cobrança precisa entrar no plano diário do time."
            : "Nível de cobrança controlado para a base atual.",
        tone:
          invoicePressure >= 15 ? ("warning" as const) : ("primary" as const),
      },
      {
        label: "Concentração top-1",
        value: `${analyticsSafePercent(top1Share)}%`,
        detail:
          top1Share >= 45
            ? "Receita muito dependente de poucas contas."
            : "Dependência de receita em faixa administrável.",
        tone: top1Share >= 45 ? ("warning" as const) : ("secondary" as const),
      },
    ];

    const processHotspots = [...data.geographicOverview.states]
      .filter((state) => state.processos > 0)
      .sort((left, right) => right.processos - left.processos)
      .slice(0, 5);

    const topProcessState = processHotspots[0] ?? null;
    const topProcessStatesTotal = processHotspots.reduce(
      (sum, state) => sum + state.processos,
      0,
    );
    const topProcessStatesShare =
      data.totals.totalProcessos > 0
        ? (topProcessStatesTotal / data.totals.totalProcessos) * 100
        : 0;

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
      focusCards,
      processHotspots,
      topProcessState,
      topProcessStatesShare,
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
            <Button
              as={NextLink}
              color="primary"
              href="/admin/tenants"
              size="sm"
            >
              Tenants
            </Button>
            <Button
              as={NextLink}
              href="/admin/auditoria"
              size="sm"
              variant="bordered"
            >
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
        title="Mapa quente de processos pelo Brasil"
        description="Leitura territorial da base inteira. O mapa abre em processos para mostrar onde os escritorios ja concentram carteira, com troca opcional para advogados e escritorios."
      >
        <div className="mb-4 grid gap-3 md:grid-cols-3">
          <PeopleMetricCard
            label="Processos mapeados"
            value={formatNumber(data.totals.totalProcessos)}
            helper="Base consolidada de todos os escritorios"
            tone="primary"
            icon={<Scale className="h-4 w-4" />}
          />
          <PeopleMetricCard
            label="UF lider em processos"
            value={analytics.topProcessState?.uf ?? "--"}
            helper={
              analytics.topProcessState
                ? `${analytics.topProcessState.stateName} • ${formatNumber(
                    analytics.topProcessState.processos,
                  )} processos`
                : "Ainda sem destaque suficiente"
            }
            tone="secondary"
            icon={<MapPinned className="h-4 w-4" />}
          />
          <PeopleMetricCard
            label="Top 5 UFs"
            value={`${analytics.topProcessStatesShare.toFixed(1)}%`}
            helper={`${formatNumber(
              analytics.processHotspots.reduce(
                (sum, state) => sum + state.processos,
                0,
              ),
            )} processos concentrados nos 5 maiores polos`}
            tone="success"
            icon={<TrendingUp className="h-4 w-4" />}
          />
        </div>
        <BrazilCoverageMap
          audienceLabel="a plataforma"
          defaultMetric="processos"
          overview={data.geographicOverview}
        />
      </PeoplePanel>

      <PeoplePanel
        title="Presença online em tempo real"
        description="Usuários autenticados ativos por tenant e região nas últimas janelas de heartbeat."
      >
        <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl ml-admin-surface-soft p-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-default-500">
                  Usuários online
                </p>
                <p className="mt-2 text-xl font-semibold text-foreground">
                  {formatNumber(data.onlinePresence.totalUsersOnline)}
                </p>
              </div>
              <div className="rounded-2xl ml-admin-surface-soft p-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-default-500">
                  Tenants ativos agora
                </p>
                <p className="mt-2 text-xl font-semibold text-foreground">
                  {formatNumber(data.onlinePresence.tenantsWithUsersOnline)}
                </p>
              </div>
              <div className="rounded-2xl ml-admin-surface-soft p-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-default-500">
                  Sessões de suporte
                </p>
                <p className="mt-2 text-xl font-semibold text-foreground">
                  {formatNumber(data.onlinePresence.supportSessionsOnline)}
                </p>
              </div>
            </div>

            <div className="relative min-h-[280px] overflow-hidden rounded-2xl border border-default-200/80 bg-default-100/35 dark:border-white/10 dark:bg-background/20">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(34,197,94,0.16),transparent_45%),radial-gradient(circle_at_80%_80%,rgba(14,165,233,0.16),transparent_45%)]" />
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(148,163,184,0.08)_1px,transparent_1px)] bg-[size:22px_22px]" />
              {data.onlinePresence.byLocation.length === 0 ? (
                <div className="absolute inset-0 flex items-center justify-center text-sm text-default-400">
                  Nenhum usuário online detectado neste momento.
                </div>
              ) : (
                data.onlinePresence.byLocation.slice(0, 20).map((location) => {
                  const bubbleSize = Math.min(30, 10 + location.usersOnline * 3);

                  return (
                    <div
                      key={location.key}
                      className="absolute -translate-x-1/2 -translate-y-1/2"
                      style={{
                        left: `${location.mapX}%`,
                        top: `${location.mapY}%`,
                      }}
                      title={`${location.label} • ${location.usersOnline} usuário(s)`}
                    >
                      <div
                        className="flex items-center justify-center rounded-full border border-success/30 bg-success/25 text-[10px] font-semibold text-success"
                        style={{ width: bubbleSize, height: bubbleSize }}
                      >
                        {location.usersOnline}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="space-y-3">
            <div className="rounded-2xl ml-admin-surface-subtle p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                <MapPinned className="h-4 w-4 text-primary" />
                Top localizações online
              </div>
              <div className="space-y-2">
                {data.onlinePresence.byLocation.length === 0 ? (
                  <p className="text-sm text-default-400">
                    Sem localizações ativas.
                  </p>
                ) : (
                  data.onlinePresence.byLocation.slice(0, 6).map((location) => (
                    <div
                      key={`location-${location.key}`}
                      className="flex items-center justify-between rounded-xl ml-admin-surface-subtle px-3 py-2"
                    >
                      <div>
                        <p className="text-xs font-semibold text-foreground">
                          {location.label}
                        </p>
                        <p className="text-[11px] text-default-500">
                          {location.tenantsOnline} tenant(s)
                        </p>
                      </div>
                      <Chip size="sm" variant="flat">
                        {location.usersOnline} online
                      </Chip>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-2xl ml-admin-surface-subtle p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                <Users className="h-4 w-4 text-success" />
                Usuários conectados agora
              </div>
              <div className="space-y-2">
                {data.onlinePresence.users.length === 0 ? (
                  <p className="text-sm text-default-400">
                    Sem sessões ativas no momento.
                  </p>
                ) : (
                  data.onlinePresence.users.slice(0, 8).map((entry) => (
                    <div
                      key={`${entry.tenantId}-${entry.userId}-${entry.lastSeenAt}`}
                      className="rounded-xl ml-admin-surface-subtle px-3 py-2"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-foreground">
                            {entry.name || entry.email || entry.userId}
                          </p>
                          <p className="truncate text-[11px] text-default-500">
                            {entry.tenantName} • {entry.locationLabel}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {entry.isSupportSession ? (
                            <Chip
                              color="warning"
                              size="sm"
                              startContent={<Shield className="h-3 w-3" />}
                              variant="flat"
                            >
                              Suporte
                            </Chip>
                          ) : null}
                          <span className="text-[11px] text-default-500">
                            {formatLastSeen(entry.lastSeenAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </PeoplePanel>

      <PeoplePanel
        title="Radar de seguranca"
        description="Quem entrou, quem trocou senha e como os alertas de acesso estao performando no recorte padrao."
        actions={
          <Button
            as={NextLink}
            href="/admin/seguranca"
            size="sm"
            variant="flat"
          >
            Abrir cockpit de seguranca
          </Button>
        }
      >
        {securityError ? (
          <div className="flex items-center gap-2 text-sm text-danger">
            <AlertTriangle className="h-4 w-4" />
            {securityError instanceof Error
              ? securityError.message
              : "Falha ao carregar radar de seguranca."}
          </div>
        ) : isSecurityLoading && !securitySnapshot ? (
          <div className="flex min-h-[180px] items-center justify-center">
            <Spinner color="primary" label="Carregando radar de seguranca" />
          </div>
        ) : securitySnapshot ? (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <PeopleMetricCard
                label="Logins autorizados"
                value={formatNumber(securitySnapshot.summary.loginSuccesses)}
                helper="Entradas liberadas"
                tone="success"
                icon={<Shield className="h-4 w-4" />}
              />
              <PeopleMetricCard
                label="Logins rejeitados"
                value={formatNumber(securitySnapshot.summary.loginRejected)}
                helper="Tentativas bloqueadas"
                tone={
                  securitySnapshot.summary.loginRejected > 0
                    ? "warning"
                    : "default"
                }
                icon={<ShieldAlert className="h-4 w-4" />}
              />
              <PeopleMetricCard
                label="Trocas de senha"
                value={formatNumber(securitySnapshot.summary.passwordChanges)}
                helper="Perfil e primeiro acesso"
                tone="secondary"
                icon={<KeyRound className="h-4 w-4" />}
              />
              <PeopleMetricCard
                label="Alertas lidos"
                value={`${(securitySnapshot.summary.readRate * 100).toFixed(1)}%`}
                helper={`${formatNumber(securitySnapshot.summary.notificationsRead)} leituras`}
                tone="primary"
                icon={<BellRing className="h-4 w-4" />}
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
              <div className="space-y-3">
                <div className="rounded-2xl ml-admin-surface-subtle p-4">
                  <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Users className="h-4 w-4 text-primary" />
                    Quem mais acessou
                  </div>
                  <div className="space-y-2">
                    {securitySnapshot.topAccessUsers.length === 0 ? (
                      <p className="text-sm text-default-400">
                        Sem acessos registrados no recorte.
                      </p>
                    ) : (
                      securitySnapshot.topAccessUsers.slice(0, 5).map((entry) => (
                        <div
                          key={`${entry.tenantId || "global"}-${entry.actorId || entry.email || entry.name}`}
                          className="flex items-center justify-between rounded-xl ml-admin-surface-subtle px-3 py-2"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-foreground">
                              {entry.name}
                            </p>
                            <p className="truncate text-[11px] text-default-500">
                              {entry.tenantName}
                              {entry.email ? ` • ${entry.email}` : ""}
                            </p>
                          </div>
                          <Chip size="sm" variant="flat">
                            {formatNumber(entry.total)}
                          </Chip>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="rounded-2xl ml-admin-surface-subtle p-4">
                  <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                    <MapPinned className="h-4 w-4 text-success" />
                    Locais com mais atividade
                  </div>
                  <div className="space-y-2">
                    {securitySnapshot.topLocations.length === 0 ? (
                      <p className="text-sm text-default-400">
                        Sem localizacoes relevantes ainda.
                      </p>
                    ) : (
                      securitySnapshot.topLocations.slice(0, 5).map((entry) => (
                        <div
                          key={entry.label}
                          className="flex items-center justify-between rounded-xl ml-admin-surface-subtle px-3 py-2"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-foreground">
                              {entry.label}
                            </p>
                            <p className="text-[11px] text-default-500">
                              {formatNumber(entry.uniqueUsers)} usuario(s)
                            </p>
                          </div>
                          <Chip size="sm" variant="flat">
                            {formatNumber(entry.total)}
                          </Chip>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl ml-admin-surface-subtle p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Shield className="h-4 w-4 text-warning" />
                  Ultimos eventos de acesso
                </div>
                <div className="space-y-2">
                  {securitySnapshot.recentAccesses.length === 0 ? (
                    <p className="text-sm text-default-400">
                      Sem eventos de acesso no recorte.
                    </p>
                  ) : (
                    securitySnapshot.recentAccesses.slice(0, 8).map((entry) => (
                      <div
                        key={entry.id}
                        className="rounded-xl ml-admin-surface-subtle px-3 py-2"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-foreground">
                              {entry.actorName}
                            </p>
                            <p className="truncate text-[11px] text-default-500">
                              {entry.tenantName} • {entry.locationLabel}
                            </p>
                            <p className="truncate text-[11px] text-default-500">
                              {entry.deviceLabel}
                            </p>
                          </div>
                          <div className="text-right">
                            <Chip
                              color={
                                entry.status === "SUCCESS"
                                  ? "success"
                                  : entry.status === "WARNING"
                                    ? "warning"
                                    : entry.status === "ERROR"
                                      ? "danger"
                                      : "default"
                              }
                              size="sm"
                              variant="flat"
                            >
                              {entry.status}
                            </Chip>
                            <p className="mt-1 text-[11px] text-default-500">
                              {formatDateTime(entry.createdAt)}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </PeoplePanel>

      <PeoplePanel
        title="Onde agir hoje"
        description="Leitura executiva curta para decidir crescimento, cobrança e redução de risco sem entrar ainda nos gráficos."
      >
        <div className="grid gap-3 xl:grid-cols-3">
          {analytics.focusCards.map((item) => (
            <div
              key={item.label}
              className="rounded-2xl ml-admin-surface-subtle p-4"
            >
              <div className="mb-2 flex items-center gap-2">
                <Chip color={item.tone} size="sm" variant="flat">
                  {item.label}
                </Chip>
                <p className="text-sm font-semibold text-foreground">
                  {item.value}
                </p>
              </div>
              <p className="text-sm text-default-400">{item.detail}</p>
            </div>
          ))}
        </div>
      </PeoplePanel>

      <PeoplePanel
        title="Motor de crescimento"
        description="Receita mensal confirmada com entradas de novos tenants e usuários."
      >
        <div className="h-[360px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={analytics.chartSeries}>
              <CartesianGrid
                stroke="rgba(148,163,184,0.15)"
                strokeDasharray="3 3"
              />
              <XAxis
                dataKey="label"
                tick={{ fill: "#94a3b8", fontSize: 12 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                yAxisId="money"
                tick={{ fill: "#94a3b8", fontSize: 12 }}
                tickFormatter={(value) =>
                  `${Math.round(Number(value) / 1000)}k`
                }
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
          <div className="rounded-xl ml-admin-surface-subtle p-3">
            <p className="text-xs uppercase tracking-[0.14em] text-default-500">
              Crescimento de receita
            </p>
            <p className="text-sm font-semibold text-foreground">
              {pctLabel(analytics.revenueMoM)}
            </p>
          </div>
          <div className="rounded-xl ml-admin-surface-subtle p-3">
            <p className="text-xs uppercase tracking-[0.14em] text-default-500">
              Crescimento de novos tenants
            </p>
            <p className="text-sm font-semibold text-foreground">
              {pctLabel(analytics.tenantGrowthMoM)}
            </p>
          </div>
          <div className="rounded-xl ml-admin-surface-subtle p-3">
            <p className="text-xs uppercase tracking-[0.14em] text-default-500">
              Ticket médio por tenant ativo
            </p>
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
              <BarChart
                data={analytics.topTenantsChart}
                layout="vertical"
                margin={{ left: 10, right: 10 }}
              >
                <CartesianGrid
                  stroke="rgba(148,163,184,0.15)"
                  strokeDasharray="3 3"
                />
                <XAxis
                  type="number"
                  tick={{ fill: "#94a3b8", fontSize: 12 }}
                  tickFormatter={(value) =>
                    `${Math.round(Number(value) / 1000)}k`
                  }
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
                <Bar
                  dataKey="receita90d"
                  name="Receita 90d"
                  radius={[0, 6, 6, 0]}
                  fill={CHART_COLORS.revenue}
                />
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
                    className="flex items-center justify-between rounded-xl ml-admin-surface-subtle px-3 py-2"
                  >
                    <div className="flex items-center gap-2 text-sm text-foreground">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ background: item.color }}
                      />
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
              <p className="text-sm text-default-400">
                Sem recomendações críticas neste momento.
              </p>
            ) : (
              analytics.recommendations.map((item, idx) => (
                <div
                  key={`${item.title}-${idx}`}
                  className="rounded-xl ml-admin-surface-subtle p-3"
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
                    <p className="text-sm font-semibold text-foreground">
                      {item.title}
                    </p>
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
            <Button
              as={NextLink}
              href="/admin/auditoria"
              size="sm"
              variant="flat"
            >
              Ver auditoria completa
            </Button>
          }
        >
          <div className="space-y-3">
            {data.auditLog.length === 0 ? (
              <p className="text-sm text-default-400">
                Sem ações administrativas recentes.
              </p>
            ) : (
              data.auditLog.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-xl ml-admin-surface-subtle p-3"
                >
                  <p className="text-xs text-default-500">
                    {new Date(entry.createdAt).toLocaleString("pt-BR")}
                  </p>
                  <p className="text-sm font-semibold text-foreground">
                    {entry.action}
                  </p>
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
