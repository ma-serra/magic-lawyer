"use client";

import { useMemo, useState } from "react";
import NextLink from "next/link";
import useSWR from "swr";
import { Button, Chip, Input, Select, SelectItem, Spinner } from "@heroui/react";
import {
  AlertTriangle,
  BellRing,
  KeyRound,
  Mail,
  MapPinned,
  RefreshCw,
  Shield,
  ShieldAlert,
  Users,
} from "lucide-react";

import {
  getAdminSecurityDashboard,
  type AdminSecurityFilters,
} from "@/app/actions/admin-security";
import {
  PeopleMetricCard,
  PeoplePageHeader,
  PeoplePanel,
} from "@/components/people-ui";

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("pt-BR");
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function statusTone(status: string): "success" | "warning" | "danger" | "default" {
  switch (status.toUpperCase()) {
    case "SUCCESS":
      return "success";
    case "WARNING":
      return "warning";
    case "ERROR":
    case "FAILED":
      return "danger";
    default:
      return "default";
  }
}

function useDefaultDateRange() {
  return useMemo(() => {
    const end = new Date();
    const start = new Date(end.getTime() - 6 * 24 * 60 * 60 * 1000);
    const toInput = (date: Date) => {
      const local = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
      return local.toISOString().slice(0, 10);
    };

    return {
      startDate: toInput(start),
      endDate: toInput(end),
    };
  }, []);
}

export function AdminSecurityContent() {
  const defaultRange = useDefaultDateRange();
  const [search, setSearch] = useState("");
  const [tenantId, setTenantId] = useState("ALL");
  const [startDate, setStartDate] = useState(defaultRange.startDate);
  const [endDate, setEndDate] = useState(defaultRange.endDate);

  const filters: AdminSecurityFilters = useMemo(
    () => ({
      tenantId: tenantId === "ALL" ? undefined : tenantId,
      search: search.trim() || undefined,
      startDate,
      endDate,
    }),
    [endDate, search, startDate, tenantId],
  );

  const { data, error, isLoading, mutate } = useSWR(
    ["admin-security-dashboard", filters],
    ([, currentFilters]) => getAdminSecurityDashboard(currentFilters),
    {
      revalidateOnFocus: true,
      dedupingInterval: 5000,
    },
  );

  const dashboard = data?.success ? data.data : undefined;
  const tenantOptions = dashboard?.tenantOptions ?? [];
  const tenantSelectOptions = useMemo(
    () => [
      {
        id: "ALL",
        name: "Todos os tenants",
      },
      ...tenantOptions,
    ],
    [tenantOptions],
  );
  const selectedTenantKeys =
    tenantId !== "ALL" && tenantSelectOptions.some((item) => item.id === tenantId)
      ? [tenantId]
      : ["ALL"];

  return (
    <section className="space-y-6">
      <PeoplePageHeader
        tag="Seguranca"
        title="Cockpit de seguranca e acessos"
        description="Visibilidade global de quem entrou, quem trocou senha, quem recebeu alertas e como os sinais de seguranca foram entregues."
        actions={
          <>
            <Button as={NextLink} color="primary" href="/admin/dashboard" size="sm">
              Dashboard
            </Button>
            <Button as={NextLink} href="/admin/auditoria" size="sm" variant="bordered">
              Auditoria
            </Button>
          </>
        }
      />

      <PeoplePanel
        title="Filtros"
        description="Recorte por periodo, tenant e busca livre para investigar acessos e alertas."
        actions={
          <Button
            size="sm"
            startContent={<RefreshCw className="h-4 w-4" />}
            variant="flat"
            onPress={() => void mutate()}
          >
            Atualizar
          </Button>
        }
      >
        <div className="grid gap-3 lg:grid-cols-4">
          <Input
            label="Buscar"
            placeholder="Usuario, email, IP, local..."
            value={search}
            onValueChange={setSearch}
          />
          <Select
            label="Tenant"
            selectedKeys={selectedTenantKeys}
            onSelectionChange={(keys) => {
              const value = Array.from(keys)[0];
              setTenantId(typeof value === "string" ? value : "ALL");
            }}
          >
            {tenantSelectOptions.map((item) => (
              <SelectItem key={item.id} textValue={item.name}>
                {item.name}
              </SelectItem>
            ))}
          </Select>
          <Input
            label="Inicio"
            type="date"
            value={startDate}
            onValueChange={setStartDate}
          />
          <Input label="Fim" type="date" value={endDate} onValueChange={setEndDate} />
        </div>
      </PeoplePanel>

      {error || data?.success === false ? (
        <PeoplePanel
          title="Falha ao carregar cockpit"
          description="Nao foi possivel consolidar os dados de seguranca."
        >
          <div className="flex items-center gap-2 text-sm text-danger">
            <AlertTriangle className="h-4 w-4" />
            {error instanceof Error ? error.message : data?.error || "Erro inesperado"}
          </div>
        </PeoplePanel>
      ) : null}

      {!dashboard && isLoading ? (
        <div className="flex min-h-[240px] items-center justify-center">
          <Spinner color="primary" label="Carregando seguranca" />
        </div>
      ) : null}

      {dashboard ? (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
            <PeopleMetricCard
              label="Logins ok"
              value={dashboard.summary.loginSuccesses.toString()}
              helper="Entradas autorizadas no recorte"
              tone="success"
              icon={<Shield className="h-4 w-4" />}
            />
            <PeopleMetricCard
              label="Logins bloqueados"
              value={dashboard.summary.loginRejected.toString()}
              helper="Tentativas rejeitadas"
              tone={dashboard.summary.loginRejected > 0 ? "warning" : "default"}
              icon={<ShieldAlert className="h-4 w-4" />}
            />
            <PeopleMetricCard
              label="Usuarios unicos"
              value={dashboard.summary.uniqueUsers.toString()}
              helper="Contas com login bem-sucedido"
              tone="primary"
              icon={<Users className="h-4 w-4" />}
            />
            <PeopleMetricCard
              label="Trocas de senha"
              value={dashboard.summary.passwordChanges.toString()}
              helper="Perfil + primeiro acesso"
              tone="secondary"
              icon={<KeyRound className="h-4 w-4" />}
            />
            <PeopleMetricCard
              label="Alertas lidos"
              value={formatPercent(dashboard.summary.readRate)}
              helper={`${dashboard.summary.notificationsRead}/${dashboard.summary.securityNotifications} notificacoes`}
              tone="primary"
              icon={<BellRing className="h-4 w-4" />}
            />
            <PeopleMetricCard
              label="Emails com falha"
              value={dashboard.summary.emailDeliveriesFailed.toString()}
              helper={`${dashboard.summary.emailDeliveriesSent} entregas ok`}
              tone={
                dashboard.summary.emailDeliveriesFailed > 0 ? "danger" : "success"
              }
              icon={<Mail className="h-4 w-4" />}
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <PeoplePanel
              title="Quem mais acessou"
              description="Usuarios com mais logins autorizados no recorte."
            >
              <div className="space-y-2">
                {dashboard.topAccessUsers.length === 0 ? (
                  <p className="text-sm text-default-400">Sem acessos no periodo.</p>
                ) : (
                  dashboard.topAccessUsers.map((item) => (
                    <div
                      key={`${item.tenantId || "global"}-${item.actorId || item.email || item.name}`}
                      className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {item.name}
                        </p>
                        <p className="truncate text-xs text-default-500">
                          {item.tenantName}
                          {item.email ? ` · ${item.email}` : ""}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-foreground">
                          {item.total}
                        </p>
                        <p className="text-[11px] text-default-500">
                          {formatDateTime(item.lastAt)}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </PeoplePanel>

            <PeoplePanel
              title="Quem mais trocou senha"
              description="Mudancas voluntarias e definicao de senha no primeiro acesso."
            >
              <div className="space-y-2">
                {dashboard.topPasswordChanges.length === 0 ? (
                  <p className="text-sm text-default-400">
                    Nenhuma troca de senha no periodo.
                  </p>
                ) : (
                  dashboard.topPasswordChanges.map((item) => (
                    <div
                      key={`${item.tenantId || "global"}-${item.actorId || item.email || item.name}`}
                      className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {item.name}
                        </p>
                        <p className="truncate text-xs text-default-500">
                          {item.tenantName}
                          {item.email ? ` · ${item.email}` : ""}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-foreground">
                          {item.total}
                        </p>
                        <p className="text-[11px] text-default-500">
                          {formatDateTime(item.lastAt)}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </PeoplePanel>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <PeoplePanel
              title="Quem recebeu os alertas"
              description="Usuarios mais impactados pelos alertas de acesso e taxa de leitura."
            >
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-white/10 text-xs uppercase tracking-[0.14em] text-default-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">Usuario</th>
                      <th className="px-3 py-2 font-medium">Tenant</th>
                      <th className="px-3 py-2 font-medium">Alertas</th>
                      <th className="px-3 py-2 font-medium">Lidos</th>
                      <th className="px-3 py-2 font-medium">Email</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {dashboard.notificationRecipients.length === 0 ? (
                      <tr>
                        <td className="px-3 py-4 text-default-400" colSpan={5}>
                          Nenhum alerta no periodo.
                        </td>
                      </tr>
                    ) : (
                      dashboard.notificationRecipients.map((item) => (
                        <tr key={`${item.tenantId}-${item.userId}`}>
                          <td className="px-3 py-3">
                            <div className="min-w-0">
                              <p className="truncate font-medium text-foreground">
                                {item.name}
                              </p>
                              <p className="truncate text-xs text-default-500">
                                {item.email || "Sem email"}
                              </p>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-default-400">{item.tenantName}</td>
                          <td className="px-3 py-3 text-foreground">{item.notifications}</td>
                          <td className="px-3 py-3 text-foreground">{item.read}</td>
                          <td className="px-3 py-3 text-foreground">{item.emailSent}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </PeoplePanel>

            <div className="space-y-6">
              <PeoplePanel
                title="Entrega por canal"
                description="Saude da distribuicao dos alertas de seguranca."
              >
                <div className="space-y-2">
                  {dashboard.deliveryByChannel.length === 0 ? (
                    <p className="text-sm text-default-400">Sem entregas registradas.</p>
                  ) : (
                    dashboard.deliveryByChannel.map((item) => (
                      <div
                        key={item.channel}
                        className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2"
                      >
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold text-foreground">
                            {item.channel}
                          </p>
                          <Chip size="sm" variant="flat">
                            {item.notifications}
                          </Chip>
                        </div>
                        <p className="mt-1 text-xs text-default-500">
                          {item.sent} enviadas · {item.read} lidas · {item.failed} falhas
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </PeoplePanel>

              <PeoplePanel
                title="Top localizacoes"
                description="Onde os acessos estao se concentrando no recorte."
              >
                <div className="space-y-2">
                  {dashboard.topLocations.length === 0 ? (
                    <p className="text-sm text-default-400">Sem localizacoes registradas.</p>
                  ) : (
                    dashboard.topLocations.map((item) => (
                      <div
                        key={item.label}
                        className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground">
                            {item.label}
                          </p>
                          <p className="text-xs text-default-500">
                            {item.uniqueUsers} usuario(s) distintos
                          </p>
                        </div>
                        <Chip
                          color="primary"
                          size="sm"
                          startContent={<MapPinned className="h-3 w-3" />}
                          variant="flat"
                        >
                          {item.total}
                        </Chip>
                      </div>
                    ))
                  )}
                </div>
              </PeoplePanel>
            </div>
          </div>

          <PeoplePanel
            title="Trilha recente de acessos"
            description="Linha do tempo com status, dispositivo, local e tenant para investigacao rapida."
          >
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-white/10 text-xs uppercase tracking-[0.14em] text-default-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Quando</th>
                    <th className="px-3 py-2 font-medium">Usuario</th>
                    <th className="px-3 py-2 font-medium">Tenant</th>
                    <th className="px-3 py-2 font-medium">Acao</th>
                    <th className="px-3 py-2 font-medium">Origem</th>
                    <th className="px-3 py-2 font-medium">IP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {dashboard.recentAccesses.length === 0 ? (
                    <tr>
                      <td className="px-3 py-4 text-default-400" colSpan={6}>
                        Sem eventos de acesso no recorte atual.
                      </td>
                    </tr>
                  ) : (
                    dashboard.recentAccesses.map((item) => (
                      <tr key={item.id}>
                        <td className="px-3 py-3 text-default-400">
                          {formatDateTime(item.createdAt)}
                        </td>
                        <td className="px-3 py-3">
                          <div className="min-w-0">
                            <p className="truncate font-medium text-foreground">
                              {item.actorName}
                            </p>
                            <p className="truncate text-xs text-default-500">
                              {item.actorEmail || "Sem email"}
                            </p>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-default-400">{item.tenantName}</td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <Chip color={statusTone(item.status)} size="sm" variant="flat">
                              {item.status}
                            </Chip>
                            <span className="text-xs text-default-400">{item.action}</span>
                            {item.isKnownAccess === false ? (
                              <Chip color="warning" size="sm" variant="flat">
                                Contexto novo
                              </Chip>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="min-w-[220px]">
                            <p className="truncate text-foreground">{item.locationLabel}</p>
                            <p className="truncate text-xs text-default-500">
                              {item.deviceLabel}
                            </p>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-default-400">
                          {item.ipAddress || "Nao identificado"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </PeoplePanel>
        </>
      ) : null}
    </section>
  );
}
