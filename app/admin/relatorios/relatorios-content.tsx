"use client";

import NextLink from "next/link";
import useSWR from "swr";
import { Button, Chip, Spinner } from "@heroui/react";
import { AlertTriangle, Building2, DollarSign, FileText, Users } from "lucide-react";

import { getSuperAdminDashboardData } from "@/app/actions/admin-dashboard";
import { PeopleMetricCard, PeoplePageHeader, PeoplePanel } from "@/components/people-ui";

const REPORT_REFRESH_MS = 60000;

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  });
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleString("pt-BR");
}

export function RelatoriosContent() {
  const { data: response, error, isLoading } = useSWR(
    "admin-relatorios-overview",
    getSuperAdminDashboardData,
    {
      revalidateOnFocus: false,
      refreshInterval: REPORT_REFRESH_MS,
    },
  );

  const data = response?.success ? response.data : undefined;

  return (
    <section className="space-y-6">
      <PeoplePageHeader
        tag="Administração"
        title="Relatórios operacionais"
        description="Leitura executiva do negócio: crescimento, receita, riscos e trilha de auditoria em uma única visão."
        actions={
          <>
            <Button as={NextLink} color="primary" href="/admin/dashboard" size="sm">
              Abrir dashboard
            </Button>
            <Button as={NextLink} href="/admin/auditoria" size="sm" variant="bordered">
              Abrir auditoria
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <PeopleMetricCard
          label="Receita 30 dias"
          value={formatCurrency(data?.totals.revenueLast30Days ?? 0)}
          helper="Confirmações recentes"
          tone="success"
          icon={<DollarSign className="h-4 w-4" />}
        />
        <PeopleMetricCard
          label="Tenants ativos"
          value={data?.totals.activeTenants ?? 0}
          helper={`${data?.totals.totalTenants ?? 0} tenant(s) total`}
          tone="primary"
          icon={<Building2 className="h-4 w-4" />}
        />
        <PeopleMetricCard
          label="Usuários ativos"
          value={data?.totals.activeUsers ?? 0}
          helper={`${data?.totals.totalUsers ?? 0} usuário(s) total`}
          tone="secondary"
          icon={<Users className="h-4 w-4" />}
        />
        <PeopleMetricCard
          label="Alertas"
          value={data?.alerts.length ?? 0}
          helper="Itens que exigem acompanhamento"
          tone={(data?.alerts.length ?? 0) > 0 ? "warning" : "default"}
          icon={<AlertTriangle className="h-4 w-4" />}
        />
      </div>

      {error || (response && !response.success) ? (
        <PeoplePanel
          title="Falha ao carregar relatórios"
          description="Não foi possível sincronizar os dados do painel administrativo."
        >
          <p className="text-sm text-danger">
            {response?.error ||
              (error instanceof Error ? error.message : "Erro inesperado")}
          </p>
        </PeoplePanel>
      ) : null}

      {isLoading && !data ? (
        <PeoplePanel
          title="Sincronizando dados"
          description="Coletando indicadores globais do sistema."
        >
          <div className="flex items-center gap-2 text-sm text-default-400">
            <Spinner size="sm" />
            Carregando relatórios...
          </div>
        </PeoplePanel>
      ) : null}

      {data ? (
        <>
          <PeoplePanel
            title="Tendência dos últimos 6 meses"
            description="Receita, novos tenants e novos usuários por mês."
          >
            <div className="grid gap-3 lg:grid-cols-3">
              {data.revenueSeries.map((point, index) => (
                <div
                  key={point.id}
                  className="rounded-2xl border border-white/10 bg-white/[0.02] p-3"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-default-500">
                    {point.label}
                  </p>
                  <p className="mt-2 text-lg font-semibold text-success">
                    {formatCurrency(point.value)}
                  </p>
                  <p className="mt-2 text-xs text-default-400">
                    Tenants: {data.tenantGrowthSeries[index]?.value ?? 0} •
                    Usuários: {data.userGrowthSeries[index]?.value ?? 0}
                  </p>
                </div>
              ))}
            </div>
          </PeoplePanel>

          <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
            <PeoplePanel
              title="Tenants de maior impacto"
              description="Escritórios com maior contribuição financeira recente."
            >
              <div className="space-y-3">
                {data.topTenants.length === 0 ? (
                  <p className="text-sm text-default-400">
                    Sem registros de receita no período.
                  </p>
                ) : (
                  data.topTenants.map((tenant) => (
                    <div
                      key={tenant.id}
                      className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/[0.02] p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-foreground">
                          {tenant.name}
                        </p>
                        <Chip
                          color={tenant.status === "ACTIVE" ? "success" : "warning"}
                          size="sm"
                          variant="flat"
                        >
                          {tenant.status === "ACTIVE" ? "Ativo" : tenant.status}
                        </Chip>
                      </div>
                      <p className="text-xs text-default-400">
                        {tenant.clientes} clientes • {tenant.processos} processos •{" "}
                        {tenant.users} usuários
                      </p>
                      <p className="text-sm font-semibold text-success">
                        90 dias: {formatCurrency(tenant.revenue90d)}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </PeoplePanel>

            <PeoplePanel
              title="Alertas e auditoria"
              description="Riscos ativos e últimas ações administrativas."
            >
              <div className="space-y-4">
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-default-500">
                    Alertas
                  </p>
                  {data.alerts.length === 0 ? (
                    <p className="text-sm text-success">Nenhum alerta crítico no momento.</p>
                  ) : (
                    <div className="space-y-2">
                      {data.alerts.slice(0, 4).map((alert) => (
                        <div
                          key={alert.id}
                          className="rounded-xl border border-warning/20 bg-warning/10 p-3"
                        >
                          <p className="text-sm font-semibold text-warning">{alert.title}</p>
                          <p className="text-xs text-default-300">{alert.description}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-default-500">
                    Últimas ações
                  </p>
                  {data.auditLog.length === 0 ? (
                    <p className="text-sm text-default-400">Sem registros recentes.</p>
                  ) : (
                    <div className="space-y-2">
                      {data.auditLog.slice(0, 5).map((entry) => (
                        <div
                          key={entry.id}
                          className="rounded-xl border border-white/10 bg-white/[0.02] p-3"
                        >
                          <p className="text-sm font-medium text-foreground">{entry.action}</p>
                          <p className="text-xs text-default-400">
                            {entry.entity || "—"} • {formatDate(entry.createdAt)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </PeoplePanel>
          </div>

          <PeoplePanel
            title="Exportação e governança"
            description="Ações rápidas para análise detalhada e trilha formal."
          >
            <div className="flex flex-wrap gap-2">
              <Button as={NextLink} href="/admin/auditoria" size="sm" variant="flat">
                <FileText className="h-4 w-4" />
                Logs completos
              </Button>
              <Button as={NextLink} href="/admin/tenants" size="sm" variant="flat">
                Tenants
              </Button>
              <Button as={NextLink} href="/admin/financeiro" size="sm" variant="flat">
                Financeiro global
              </Button>
            </div>
          </PeoplePanel>
        </>
      ) : null}
    </section>
  );
}
