"use client";

import type { RangeValue } from "@react-types/shared";

import React, { useMemo, useState } from "react";
import useSWR from "swr";
import { Badge } from "@heroui/badge";
import { Button } from "@heroui/button";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Input } from "@heroui/input";
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from "@heroui/modal";
import { Popover, PopoverContent, PopoverTrigger } from "@heroui/popover";
import {
  RangeCalendar,
  Select,
  SelectItem,
  Tab,
  Tabs,
  Tooltip,
} from "@heroui/react";
import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from "@heroui/table";
import { CalendarDate, getLocalTimeZone } from "@internationalized/date";
import {
  Activity,
  AlertTriangle,
  BellRing,
  Building2,
  CalendarRange,
  Clock3,
  Download,
  Eye,
  FileText,
  Globe,
  Info,
  KeyRound,
  LifeBuoy,
  Mail,
  RefreshCcw,
  Search,
  Shield,
  Siren,
  TimerReset,
  UserRound,
  Webhook,
} from "lucide-react";

import {
  getAdminNotificationAudit,
  type NotificationAuditFilters,
} from "@/app/actions/admin-notification-audit";
import {
  getAdminAuditCenter,
  getAuditLogContext,
  type AdminAuditCenterFilters,
  type AuditLogEntry,
} from "@/app/actions/auditoria";
import {
  filterOperationalEventsByTab,
  type AdminAuditStatus,
  type AdminAuditTabKey,
  type AdminOperationalAuditEntry,
} from "@/app/lib/admin-audit-center";
import {
  PeopleEmptyState,
  PeopleMetricCard,
  PeoplePageHeader,
  PeoplePanel,
} from "@/components/people-ui";
import {
  NotificationAuditPanel,
  type NotificationAuditPanelFilters,
} from "./notification-audit-panel";
import { toast } from "@/lib/toast";

function formatCalendarRange(value?: RangeValue<CalendarDate> | null) {
  if (!value?.start) {
    return "Selecionar intervalo";
  }

  const startDate = value.start.toDate(getLocalTimeZone());
  const endDate = value.end?.toDate(getLocalTimeZone()) ?? startDate;

  return `${startDate.toLocaleDateString("pt-BR")} - ${endDate.toLocaleDateString("pt-BR")}`;
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return "—";
  }

  return new Date(value).toLocaleString("pt-BR");
}

function formatDateOnly(value?: string | null) {
  if (!value) {
    return "—";
  }

  return new Date(value).toLocaleDateString("pt-BR");
}

function formatJson(data: unknown) {
  if (!data) {
    return "{}";
  }

  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}

function formatValue(value: unknown) {
  if (value === null || value === undefined) {
    return "—";
  }

  if (typeof value === "boolean") {
    return value ? "Sim" : "Não";
  }

  if (typeof value === "object") {
    return formatJson(value);
  }

  return String(value);
}

function normalizeOperationalStatus(status: string): AdminAuditStatus {
  switch (status?.toUpperCase?.()) {
    case "SUCCESS":
      return "SUCCESS";
    case "WARNING":
      return "WARNING";
    case "ERROR":
      return "ERROR";
    default:
      return "INFO";
  }
}

function getOperationalStatusTone(status: string) {
  switch (normalizeOperationalStatus(status)) {
    case "SUCCESS":
      return "success";
    case "WARNING":
      return "warning";
    case "ERROR":
      return "danger";
    default:
      return "default";
  }
}

function getChangeActionTone(action: string) {
  const normalized = action.toUpperCase();

  if (normalized.includes("CREATE")) return "success";
  if (normalized.includes("UPDATE")) return "warning";
  if (normalized.includes("DELETE")) return "danger";

  return "default";
}

function createCsvContent(rows: Array<Record<string, unknown>>) {
  if (!rows.length) {
    return "";
  }

  const headers = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row).forEach((key) => set.add(key));
      return set;
    }, new Set<string>()),
  );

  const lines = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((header) => {
          const value = row[header];
          const stringValue =
            value === null || value === undefined ? "" : String(value);

          if (/[",\n]/.test(stringValue)) {
            return `"${stringValue.replace(/"/g, '""')}"`;
          }

          return stringValue;
        })
        .join(","),
    ),
  ];

  return lines.join("\n");
}

function downloadCsv(filename: string, rows: Array<Record<string, unknown>>) {
  const csv = createCsvContent(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

const TAB_META: Record<
  AdminAuditTabKey,
  { label: string; icon: React.ReactNode; description: string }
> = {
  overview: {
    label: "Centro",
    icon: <Activity className="h-4 w-4" />,
    description:
      "Leitura executiva com alertas, suporte, atores críticos e trilhas mais tocadas.",
  },
  changes: {
    label: "Alterações",
    icon: <FileText className="h-4 w-4" />,
    description:
      "Quem mudou o quê no sistema, com diff por entidade e contexto investigativo.",
  },
  access: {
    label: "Acessos",
    icon: <KeyRound className="h-4 w-4" />,
    description:
      "Entradas, bloqueios e tentativas de autenticação para usuários e super admins.",
  },
  support: {
    label: "Suporte",
    icon: <LifeBuoy className="h-4 w-4" />,
    description:
      "Abertura, resposta, roteamento, leitura e encerramento do suporte com SLA visível.",
  },
  emails: {
    label: "Emails",
    icon: <Mail className="h-4 w-4" />,
    description:
      "Disparos reais de email com remetente, destinatário, assunto, provider e resultado.",
  },
  notifications: {
    label: "Notificações",
    icon: <BellRing className="h-4 w-4" />,
    description:
      "Despacho, supressão, entrega por canal, custo, destinatário resolvido e evidência por provider.",
  },
  webhooks: {
    label: "Webhooks",
    icon: <Webhook className="h-4 w-4" />,
    description:
      "Recebimento, rejeição e processamento de webhooks das integrações do produto.",
  },
  crons: {
    label: "Crons",
    icon: <TimerReset className="h-4 w-4" />,
    description:
      "Execuções agendadas, rejeições, falhas e conclusões dos automatismos do sistema.",
  },
};

export function AuditoriaContent() {
  const [selectedTab, setSelectedTab] = useState<AdminAuditTabKey>("overview");
  const [searchTerm, setSearchTerm] = useState("");
  const [tenantFilter, setTenantFilter] = useState("ALL");
  const [calendarRange, setCalendarRange] =
    useState<RangeValue<CalendarDate> | null>(null);
  const [selectedChangeLog, setSelectedChangeLog] =
    useState<AuditLogEntry | null>(null);
  const [selectedOperationalEvent, setSelectedOperationalEvent] =
    useState<AdminOperationalAuditEntry | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [notificationFilters, setNotificationFilters] =
    useState<NotificationAuditPanelFilters>({});

  const filters: AdminAuditCenterFilters = useMemo(() => {
    const startIso = calendarRange?.start
      ? calendarRange.start.toDate(getLocalTimeZone()).toISOString()
      : undefined;
    const endIso = calendarRange?.end
      ? calendarRange.end.toDate(getLocalTimeZone()).toISOString()
      : undefined;

    return {
      limit: 220,
      tenantId: tenantFilter === "ALL" ? undefined : tenantFilter,
      search: searchTerm || undefined,
      startDate: startIso,
      endDate: endIso,
    };
  }, [calendarRange, searchTerm, tenantFilter]);

  const { data, error, isLoading, mutate } = useSWR(
    ["admin-audit-center", filters],
    ([, params]) => getAdminAuditCenter(params),
    {
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      focusThrottleInterval: 2000,
    },
  );

  const contextKey =
    selectedChangeLog?.entidadeId && selectedChangeLog?.entidade
      ? [
          "audit-log-context",
          selectedChangeLog.entidade,
          selectedChangeLog.entidadeId,
        ]
      : null;

  const { data: selectedLogContext, isLoading: loadingContext } = useSWR(
    contextKey,
    ([, entidade, entidadeId]) =>
      getAuditLogContext(entidade as string, entidadeId as string),
  );

  const auditData = data?.data;
  const changeLogs = auditData?.changeLogs ?? [];
  const operationalEvents = auditData?.operationalEvents ?? [];
  const supportTickets = auditData?.supportTickets ?? [];
  const tenantOptions = auditData?.tenantOptions ?? [];
  const overview = auditData?.overview;
  const categoryStats = auditData?.categories ?? [];
  const topActors = auditData?.topActors ?? [];
  const topTenants = auditData?.topTenants ?? [];
  const criticalEvents = auditData?.criticalEvents ?? [];

  const currentOperationalEvents = useMemo(() => {
    if (selectedTab === "overview") {
      return operationalEvents;
    }

    return filterOperationalEventsByTab(operationalEvents, selectedTab);
  }, [operationalEvents, selectedTab]);

  const tenantSelectOptions = useMemo(
    () => [
      {
        id: "ALL",
        name: "Todos os escritórios",
        slug: "global",
        status: "ALL",
      },
      ...tenantOptions,
    ],
    [tenantOptions],
  );

  const changeDiffEntries = useMemo(() => {
    if (!selectedChangeLog) {
      return [] as Array<{ field: string; before: unknown; after: unknown }>;
    }

    const oldData =
      selectedChangeLog.dadosAntigos &&
      typeof selectedChangeLog.dadosAntigos === "object"
        ? (selectedChangeLog.dadosAntigos as Record<string, unknown>)
        : {};
    const newData =
      selectedChangeLog.dadosNovos &&
      typeof selectedChangeLog.dadosNovos === "object"
        ? (selectedChangeLog.dadosNovos as Record<string, unknown>)
        : {};

    const keys = new Set<string>([
      ...(selectedChangeLog.changedFields ?? []),
      ...Object.keys(oldData ?? {}),
      ...Object.keys(newData ?? {}),
    ]);

    return Array.from(keys)
      .map((field) => ({
        field,
        before: oldData[field],
        after: newData[field],
      }))
      .filter(({ before, after }) => {
        try {
          return JSON.stringify(before) !== JSON.stringify(after);
        } catch {
          return before !== after;
        }
      });
  }, [selectedChangeLog]);

  const handleExport = async () => {
    if (!auditData) {
      return;
    }

    try {
      setIsExporting(true);

      if (selectedTab === "notifications") {
        const notificationExportFilters: NotificationAuditFilters = {
          ...filters,
          ...notificationFilters,
          limit: 1000,
        };
        const notificationAuditResponse = await getAdminNotificationAudit(
          notificationExportFilters,
        );

        if (!notificationAuditResponse.success || !notificationAuditResponse.data) {
          throw new Error(
            notificationAuditResponse.error ||
              "Falha ao exportar a trilha de notificações.",
          );
        }

        downloadCsv(
          `auditoria-notificacoes-${new Date().toISOString()}.csv`,
          notificationAuditResponse.data.rows.map((row) => ({
            createdAt: row.createdAt,
            tenant: row.tenantName,
            tenantSlug: row.tenantSlug ?? "",
            user: row.userName,
            userEmail: row.userEmail ?? "",
            eventType: row.eventType,
            dispatchDecision: row.dispatchDecision,
            channel: row.channel ?? "",
            provider: row.provider ?? "",
            status: row.status,
            recipientTarget: row.recipientTarget ?? "",
            reasonCode: row.reasonCode ?? "",
            reasonLabel: row.reasonLabel,
            providerMessageId: row.providerMessageId ?? "",
            providerStatus: row.providerStatus ?? "",
            providerResponseCode: row.providerResponseCode ?? "",
            costAmount: row.costAmount ?? "",
            costCurrency: row.costCurrency ?? "",
            costSource: row.costSource ?? "",
            notificationId: row.notificationId ?? "",
          })),
        );
      } else if (selectedTab === "changes") {
        downloadCsv(
          `auditoria-alteracoes-${new Date().toISOString()}.csv`,
          changeLogs.map((log) => ({
            createdAt: log.createdAt,
            fonte: log.fonte,
            acao: log.acao,
            entidade: log.entidade,
            entidadeId: log.entidadeId ?? "",
            tenant: log.tenant?.nome ?? "",
            slug: log.tenant?.slug ?? "",
            ator: log.superAdmin?.nome ?? log.usuario?.nome ?? "",
            email: log.superAdmin?.email ?? log.usuario?.email ?? "",
            changedFields: log.changedFields?.join("|") ?? "",
          })),
        );
      } else if (selectedTab === "support") {
        downloadCsv(
          `auditoria-suporte-${new Date().toISOString()}.csv`,
          supportTickets.map((ticket) => ({
            updatedAt: ticket.updatedAt,
            title: ticket.title,
            status: ticket.status,
            priority: ticket.priority,
            category: ticket.category,
            supportLevel: ticket.supportLevel,
            tenant: ticket.tenant.name,
            requester: ticket.requester.name,
            assignedTo: ticket.assignedTo?.name ?? "",
            waitingFor: ticket.waitingFor,
            slaBreached: ticket.slaBreached ? "Sim" : "Não",
          })),
        );
      } else {
        downloadCsv(
          `auditoria-operacional-${selectedTab}-${new Date().toISOString()}.csv`,
          currentOperationalEvents.map((event) => ({
            createdAt: event.createdAt,
            category: event.category,
            status: event.status,
            source: event.source,
            action: event.action,
            actorName: event.actorName ?? "",
            actorEmail: event.actorEmail ?? "",
            tenant: event.tenant?.name ?? "",
            entityType: event.entityType ?? "",
            entityId: event.entityId ?? "",
            route: event.route ?? "",
            message: event.message ?? "",
          })),
        );
      }

      toast.success("Exportação concluída");
    } catch (exportError) {
      toast.error(
        exportError instanceof Error
          ? exportError.message
          : "Falha ao exportar a trilha atual.",
      );
    } finally {
      setIsExporting(false);
    }
  };

  const renderOperationalTable = (events: AdminOperationalAuditEntry[]) => {
    if (!events.length) {
      return (
        <PeopleEmptyState
          title="Nenhum evento operacional encontrado"
          description="Essa trilha será preenchida automaticamente conforme o sistema registrar eventos reais."
          icon={<AlertTriangle className="h-6 w-6" />}
        />
      );
    }

    return (
      <Table removeWrapper aria-label="Tabela de eventos operacionais">
        <TableHeader>
          <TableColumn>Data/Hora</TableColumn>
          <TableColumn>Status</TableColumn>
          <TableColumn>Ação</TableColumn>
          <TableColumn>Ator</TableColumn>
          <TableColumn>Tenant</TableColumn>
          <TableColumn>Contexto</TableColumn>
          <TableColumn>Detalhes</TableColumn>
        </TableHeader>
        <TableBody>
          {events.map((event) => (
            <TableRow key={event.id}>
              <TableCell>
                <span className="text-sm text-foreground">
                  {formatDateTime(event.createdAt)}
                </span>
              </TableCell>
              <TableCell>
                <Badge
                  color={getOperationalStatusTone(event.status) as never}
                  variant="flat"
                >
                  {event.status}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-foreground">
                    {event.action.replace(/_/g, " ")}
                  </span>
                  <span className="text-xs text-default-500">
                    {event.source}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <div className="flex flex-col">
                  <span className="text-sm text-foreground">
                    {event.actorName || event.actorEmail || event.actorType || "Sistema"}
                  </span>
                  <span className="text-xs text-default-500">
                    {event.actorEmail || event.actorType || "Sem ator humano"}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <div className="flex flex-col">
                  <span className="text-sm text-foreground">
                    {event.tenant?.name || "Plataforma"}
                  </span>
                  <span className="text-xs text-default-500">
                    {event.tenant?.slug || "global"}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <div className="flex flex-col">
                  <span className="text-sm text-foreground">
                    {event.entityType || event.route || "Sem contexto"}
                  </span>
                  <span className="text-xs text-default-500">
                    {event.entityId || event.message || "Sem detalhe resumido"}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <Button
                  color="primary"
                  size="sm"
                  startContent={<Info className="h-3.5 w-3.5" />}
                  variant="light"
                  onPress={() => setSelectedOperationalEvent(event)}
                >
                  Ver evento
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  };

  return (
    <section className="mx-auto flex w-full max-w-[1680px] flex-col gap-6 px-3 py-8 sm:px-6">
      <PeoplePageHeader
        tag="Administração"
        title="Centro de auditoria operacional"
        description="Trilha unificada de acessos, alterações, suporte, emails, webhooks e crons. O objetivo aqui é rastrear o sistema inteiro com nível probatório, não apenas listar logs."
        actions={
          <>
            <Button
              radius="full"
              size="sm"
              startContent={<RefreshCcw className="h-4 w-4" />}
              variant="flat"
              onPress={() => void mutate()}
            >
              Atualizar leitura
            </Button>
            <Button
              color="primary"
              isLoading={isExporting}
              radius="full"
              size="sm"
              startContent={<Download className="h-4 w-4" />}
              variant="flat"
              onPress={handleExport}
            >
              Exportar trilha atual
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <PeopleMetricCard
          helper="Eventos de auth, email, webhook, cron e suporte"
          icon={<Activity className="h-4 w-4" />}
          label="Eventos operacionais"
          tone="primary"
          value={overview?.operationalEventsTotal ?? 0}
        />
        <PeopleMetricCard
          helper="Alterações estruturadas em entidades do produto"
          icon={<FileText className="h-4 w-4" />}
          label="Mudanças auditadas"
          tone="secondary"
          value={overview?.changeLogsTotal ?? 0}
        />
        <PeopleMetricCard
          helper="Logins e bloqueios nas últimas 24h"
          icon={<KeyRound className="h-4 w-4" />}
          label="Acessos 24h"
          tone="success"
          value={overview?.access24h ?? 0}
        />
        <PeopleMetricCard
          helper="Emails enviados com trilha confirmada nas últimas 24h"
          icon={<Mail className="h-4 w-4" />}
          label="Emails 24h"
          tone="primary"
          value={overview?.emails24h ?? 0}
        />
        <PeopleMetricCard
          helper="Recebimentos e processamentos de integrações"
          icon={<Webhook className="h-4 w-4" />}
          label="Webhooks 24h"
          tone="warning"
          value={overview?.webhooks24h ?? 0}
        />
        <PeopleMetricCard
          helper="Execuções agendadas visíveis na trilha"
          icon={<TimerReset className="h-4 w-4" />}
          label="Crons 24h"
          tone="danger"
          value={overview?.crons24h ?? 0}
        />
      </div>

      <PeoplePanel
        title="Filtros de investigação"
        description="Refine por tenant, período e texto livre. As abas abaixo organizam o domínio auditado."
      >
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
          <Input
            classNames={{ inputWrapper: "min-h-12" }}
            label={
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-default-400" />
                <span>Busca global</span>
                <Tooltip
                  color="primary"
                  content="Procure por ator, ação, email, tenant, rota, entidade ou mensagem."
                >
                  <Info className="h-3.5 w-3.5 cursor-help text-primary" />
                </Tooltip>
              </div>
            }
            placeholder="Buscar por ator, ação, email ou rota"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
          <Select
            classNames={{ trigger: "min-h-12" }}
            items={tenantSelectOptions}
            label={
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-default-400" />
                <span>Escritório</span>
              </div>
            }
            selectedKeys={[tenantFilter]}
            selectionMode="single"
            onSelectionChange={(keys) => {
              const value = Array.from(keys)[0] as string | undefined;
              setTenantFilter(value ?? "ALL");
            }}
          >
            {(tenant) => (
              <SelectItem
                key={tenant.id}
                textValue={`${tenant.name} ${tenant.slug} ${tenant.status}`}
              >
                {tenant.name}
              </SelectItem>
            )}
          </Select>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-sm text-default-400">
              <CalendarRange className="h-4 w-4" />
              <span>Período</span>
            </div>
            <Popover offset={10} placement="bottom">
              <PopoverTrigger>
                <Button className="justify-start" radius="full" variant="flat">
                  <CalendarRange className="mr-2 h-4 w-4" />
                  {formatCalendarRange(calendarRange)}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <RangeCalendar
                  aria-label="Filtro de período"
                  value={calendarRange as never}
                  onChange={(value) =>
                    setCalendarRange(
                      (value as RangeValue<CalendarDate> | null) ?? null,
                    )
                  }
                />
              </PopoverContent>
            </Popover>
          </div>
          <Card className="border border-warning/20 bg-warning/5">
            <CardBody className="gap-2 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-warning">
                <Shield className="h-4 w-4" />
                Regra de ouro
              </div>
              <p className="text-sm text-default-500">
                Nada nesta tela é mock. Se a trilha não existir, ela não aparece.
                Os gaps precisam ser corrigidos no fluxo de origem.
              </p>
            </CardBody>
          </Card>
        </div>
      </PeoplePanel>

      <PeoplePanel
        title={TAB_META[selectedTab].label}
        description={TAB_META[selectedTab].description}
      >
        {error ? (
          <PeopleEmptyState
            title="Falha ao carregar a central de auditoria"
            description={
              (error as Error)?.message ||
              "Refaça a consulta ou atualize a leitura operacional."
            }
            icon={<AlertTriangle className="h-6 w-6" />}
          />
        ) : isLoading ? (
          <div className="flex min-h-56 items-center justify-center">
            <p className="text-sm text-default-400">
              Montando a central de auditoria operacional.
            </p>
          </div>
        ) : (
          <Tabs
            aria-label="Abas da central de auditoria"
            color="primary"
            selectedKey={selectedTab}
            variant="underlined"
            onSelectionChange={(key) => setSelectedTab(key as AdminAuditTabKey)}
          >
            {(
              Object.keys(TAB_META) as AdminAuditTabKey[]
            ).map((tabKey) => (
              <Tab
                key={tabKey}
                title={
                  <div className="flex items-center gap-2">
                    {TAB_META[tabKey].icon}
                    <span>{TAB_META[tabKey].label}</span>
                  </div>
                }
              >
                <div className="mt-4 flex flex-col gap-4">
                  {tabKey === "overview" ? (
                    <>
                      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                        <Card className="ml-admin-surface">
                          <CardHeader className="border-b border-default-200/80 dark:border-white/10">
                            <div className="flex items-center gap-2">
                              <Globe className="h-4 w-4 text-primary" />
                              <h3 className="text-sm font-semibold text-foreground">
                                Trilhas monitoradas
                              </h3>
                            </div>
                          </CardHeader>
                          <CardBody className="space-y-3">
                            {categoryStats.map((item) => (
                              <div
                                key={item.key}
                                className="rounded-2xl ml-admin-surface-soft p-3"
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <div>
                                    <p className="text-sm font-medium text-foreground">
                                      {item.label}
                                    </p>
                                    <p className="text-xs text-default-500">
                                      Último sinal: {formatDateTime(item.lastEventAt)}
                                    </p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-lg font-semibold text-foreground">
                                      {item.count}
                                    </p>
                                    <p className="text-xs text-danger">
                                      {item.errors} erro(s)
                                    </p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </CardBody>
                        </Card>

                        <Card className="ml-admin-surface">
                          <CardHeader className="border-b border-default-200/80 dark:border-white/10">
                            <div className="flex items-center gap-2">
                              <UserRound className="h-4 w-4 text-secondary" />
                              <h3 className="text-sm font-semibold text-foreground">
                                Atores mais ativos
                              </h3>
                            </div>
                          </CardHeader>
                          <CardBody className="space-y-3">
                            {topActors.length ? (
                              topActors.map((actor) => (
                                <div
                                  key={`${actor.name}-${actor.lastEventAt}`}
                                  className="rounded-2xl ml-admin-surface-soft p-3"
                                >
                                  <div className="flex items-center justify-between gap-3">
                                    <div>
                                      <p className="text-sm font-medium text-foreground">
                                        {actor.name}
                                      </p>
                                      <p className="text-xs text-default-500">
                                        {actor.email || "Sem email exposto"}
                                      </p>
                                    </div>
                                    <div className="text-right">
                                      <p className="text-lg font-semibold text-foreground">
                                        {actor.total}
                                      </p>
                                      <p className="text-xs text-default-500">
                                        {formatDateTime(actor.lastEventAt)}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              ))
                            ) : (
                              <PeopleEmptyState
                                title="Sem atores destacados"
                                description="Os atores mais recorrentes aparecerão aqui conforme a trilha amadurecer."
                                icon={<UserRound className="h-5 w-5" />}
                              />
                            )}
                          </CardBody>
                        </Card>

                        <Card className="border border-danger/20 bg-danger/5">
                          <CardHeader className="border-b border-danger/20">
                            <div className="flex items-center gap-2">
                              <Siren className="h-4 w-4 text-danger" />
                              <h3 className="text-sm font-semibold text-foreground">
                                Alertas críticos recentes
                              </h3>
                            </div>
                          </CardHeader>
                          <CardBody className="space-y-3">
                            {criticalEvents.length ? (
                              criticalEvents.map((event) => (
                                <div
                                  key={event.id}
                                  className="rounded-2xl border border-danger/20 bg-danger/5 p-3 dark:bg-background/50"
                                >
                                  <div className="flex items-center justify-between gap-3">
                                    <div>
                                      <p className="text-sm font-medium text-foreground">
                                        {event.action.replace(/_/g, " ")}
                                      </p>
                                      <p className="text-xs text-default-500">
                                        {event.message || event.source}
                                      </p>
                                    </div>
                                    <Badge color="danger" variant="flat">
                                      {event.category}
                                    </Badge>
                                  </div>
                                  <p className="mt-2 text-xs text-default-500">
                                    {formatDateTime(event.createdAt)}
                                  </p>
                                </div>
                              ))
                            ) : (
                              <PeopleEmptyState
                                title="Sem alertas críticos"
                                description="Nenhum erro operacional grave foi capturado no recorte atual."
                                icon={<Shield className="h-5 w-5" />}
                              />
                            )}
                          </CardBody>
                        </Card>
                      </div>

                      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.35fr_1fr]">
                        <Card className="ml-admin-surface">
                          <CardHeader className="border-b border-default-200/80 dark:border-white/10">
                            <div className="flex items-center gap-2">
                              <LifeBuoy className="h-4 w-4 text-primary" />
                              <h3 className="text-sm font-semibold text-foreground">
                                Suporte e SLA
                              </h3>
                            </div>
                          </CardHeader>
                          <CardBody className="space-y-4">
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                              <PeopleMetricCard
                                helper="Tickets ainda não encerrados"
                                icon={<LifeBuoy className="h-4 w-4" />}
                                label="Tickets abertos"
                                tone="primary"
                                value={overview?.supportOpen ?? 0}
                              />
                              <PeopleMetricCard
                                helper="Threads tocadas nas últimas 24h"
                                icon={<Eye className="h-4 w-4" />}
                                label="Toques de suporte"
                                tone="secondary"
                                value={overview?.supportTouches24h ?? 0}
                              />
                              <PeopleMetricCard
                                helper="Atendimentos além do SLA de primeira resposta"
                                icon={<Clock3 className="h-4 w-4" />}
                                label="SLA em risco"
                                tone="danger"
                                value={overview?.supportBreached ?? 0}
                              />
                            </div>

                            {supportTickets.length ? (
                              <Table
                                removeWrapper
                                aria-label="Tabela de tickets recentes de suporte"
                              >
                                <TableHeader>
                                  <TableColumn>Ticket</TableColumn>
                                  <TableColumn>Status</TableColumn>
                                  <TableColumn>Escritório</TableColumn>
                                  <TableColumn>Responsável</TableColumn>
                                  <TableColumn>SLA</TableColumn>
                                </TableHeader>
                                <TableBody>
                                  {supportTickets.slice(0, 8).map((ticket) => (
                                    <TableRow key={ticket.id}>
                                      <TableCell>
                                        <div className="flex flex-col">
                                          <span className="text-sm font-medium text-foreground">
                                            {ticket.title}
                                          </span>
                                          <span className="text-xs text-default-500">
                                            Atualizado em {formatDateTime(ticket.updatedAt)}
                                          </span>
                                        </div>
                                      </TableCell>
                                      <TableCell>
                                        <Badge
                                          color={
                                            ticket.status === "CLOSED"
                                              ? "success"
                                              : ticket.slaBreached
                                                ? "danger"
                                                : "warning"
                                          }
                                          variant="flat"
                                        >
                                          {ticket.status}
                                        </Badge>
                                      </TableCell>
                                      <TableCell>
                                        <div className="flex flex-col">
                                          <span className="text-sm text-foreground">
                                            {ticket.tenant.name}
                                          </span>
                                          <span className="text-xs text-default-500">
                                            {ticket.tenant.slug}
                                          </span>
                                        </div>
                                      </TableCell>
                                      <TableCell>
                                        <span className="text-sm text-foreground">
                                          {ticket.assignedTo?.name || "Não atribuído"}
                                        </span>
                                      </TableCell>
                                      <TableCell>
                                        <span
                                          className={
                                            ticket.slaBreached
                                              ? "text-sm text-danger"
                                              : "text-sm text-default-500"
                                          }
                                        >
                                          {ticket.slaBreached
                                            ? "Estourado"
                                            : `Venceu/vence em ${formatDateOnly(
                                                ticket.firstResponseDueAt,
                                              )}`}
                                        </span>
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            ) : (
                              <PeopleEmptyState
                                title="Sem tickets no recorte"
                                description="Os atendimentos recentes aparecerão aqui quando existirem tickets no período filtrado."
                                icon={<LifeBuoy className="h-5 w-5" />}
                              />
                            )}
                          </CardBody>
                        </Card>

                        <Card className="ml-admin-surface">
                          <CardHeader className="border-b border-default-200/80 dark:border-white/10">
                            <div className="flex items-center gap-2">
                              <Building2 className="h-4 w-4 text-primary" />
                              <h3 className="text-sm font-semibold text-foreground">
                                Tenants mais tocados
                              </h3>
                            </div>
                          </CardHeader>
                          <CardBody className="space-y-3">
                            {topTenants.length ? (
                              topTenants.map((tenant) => (
                                <div
                                  key={`${tenant.name}-${tenant.lastEventAt}`}
                                  className="rounded-2xl ml-admin-surface-soft p-3"
                                >
                                  <div className="flex items-center justify-between gap-3">
                                    <div>
                                      <p className="text-sm font-medium text-foreground">
                                        {tenant.name}
                                      </p>
                                      <p className="text-xs text-default-500">
                                        {tenant.slug || "slug indisponível"}
                                      </p>
                                    </div>
                                    <div className="text-right">
                                      <p className="text-lg font-semibold text-foreground">
                                        {tenant.total}
                                      </p>
                                      <p className="text-xs text-default-500">
                                        {formatDateTime(tenant.lastEventAt)}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              ))
                            ) : (
                              <PeopleEmptyState
                                title="Sem tenants destacados"
                                description="O ranking de tenants mais tocados aparecerá quando houver trilha suficiente."
                                icon={<Building2 className="h-5 w-5" />}
                              />
                            )}
                          </CardBody>
                        </Card>
                      </div>
                    </>
                  ) : tabKey === "notifications" ? (
                    <NotificationAuditPanel
                      filters={filters}
                      value={notificationFilters}
                      onChange={setNotificationFilters}
                    />
                  ) : tabKey === "changes" ? (
                    changeLogs.length ? (
                      <Table removeWrapper aria-label="Tabela de alterações auditadas">
                        <TableHeader>
                          <TableColumn>Data/Hora</TableColumn>
                          <TableColumn>Ação</TableColumn>
                          <TableColumn>Entidade</TableColumn>
                          <TableColumn>Origem</TableColumn>
                          <TableColumn>Tenant</TableColumn>
                          <TableColumn>Detalhes</TableColumn>
                        </TableHeader>
                        <TableBody>
                          {changeLogs.map((log) => (
                            <TableRow key={log.id}>
                              <TableCell>{formatDateTime(log.createdAt)}</TableCell>
                              <TableCell>
                                <Badge
                                  color={getChangeActionTone(log.acao) as never}
                                  variant="flat"
                                >
                                  {log.acao.replace(/_/g, " ")}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-col">
                                  <span className="text-sm font-medium text-foreground">
                                    {log.entidade.replace(/_/g, " ")}
                                  </span>
                                  <span className="text-xs text-default-500">
                                    {log.entidadeId || "Sem ID"}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-col">
                                  <span className="text-sm text-foreground">
                                    {log.superAdmin?.nome ||
                                      log.usuario?.nome ||
                                      log.fonte}
                                  </span>
                                  <span className="text-xs text-default-500">
                                    {log.superAdmin?.email ||
                                      log.usuario?.email ||
                                      log.fonte}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-col">
                                  <span className="text-sm text-foreground">
                                    {log.tenant?.nome || "Plataforma"}
                                  </span>
                                  <span className="text-xs text-default-500">
                                    {log.tenant?.slug || "global"}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <Button
                                  color="primary"
                                  size="sm"
                                  startContent={<Info className="h-3.5 w-3.5" />}
                                  variant="light"
                                  onPress={() => setSelectedChangeLog(log)}
                                >
                                  Ver diff
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <PeopleEmptyState
                        title="Nenhuma alteração encontrada"
                        description="As alterações estruturadas aparecerão aqui conforme usuários e admins modificarem dados do produto."
                        icon={<FileText className="h-5 w-5" />}
                      />
                    )
                  ) : (
                    <>
                      {tabKey === "support" && (
                        <Card className="ml-admin-surface">
                          <CardHeader className="border-b border-default-200/80 dark:border-white/10">
                            <div className="flex items-center gap-2">
                              <LifeBuoy className="h-4 w-4 text-primary" />
                              <h3 className="text-sm font-semibold text-foreground">
                                Tickets recentes
                              </h3>
                            </div>
                          </CardHeader>
                          <CardBody>
                            {supportTickets.length ? (
                              <Table removeWrapper aria-label="Tickets recentes">
                                <TableHeader>
                                  <TableColumn>Ticket</TableColumn>
                                  <TableColumn>Status</TableColumn>
                                  <TableColumn>Solicitante</TableColumn>
                                  <TableColumn>Responsável</TableColumn>
                                  <TableColumn>Fila</TableColumn>
                                  <TableColumn>Atualizado</TableColumn>
                                </TableHeader>
                                <TableBody>
                                  {supportTickets.map((ticket) => (
                                    <TableRow key={ticket.id}>
                                      <TableCell>
                                        <div className="flex flex-col">
                                          <span className="text-sm font-medium text-foreground">
                                            {ticket.title}
                                          </span>
                                          <span className="text-xs text-default-500">
                                            {ticket.tenant.name}
                                          </span>
                                        </div>
                                      </TableCell>
                                      <TableCell>
                                        <Badge
                                          color={
                                            ticket.status === "CLOSED"
                                              ? "success"
                                              : ticket.slaBreached
                                                ? "danger"
                                                : "warning"
                                          }
                                          variant="flat"
                                        >
                                          {ticket.status}
                                        </Badge>
                                      </TableCell>
                                      <TableCell>
                                        <div className="flex flex-col">
                                          <span className="text-sm text-foreground">
                                            {ticket.requester.name}
                                          </span>
                                          <span className="text-xs text-default-500">
                                            {ticket.requester.email}
                                          </span>
                                        </div>
                                      </TableCell>
                                      <TableCell>
                                        <span className="text-sm text-foreground">
                                          {ticket.assignedTo?.name || "Não atribuído"}
                                        </span>
                                      </TableCell>
                                      <TableCell>
                                        <span className="text-sm text-default-500">
                                          {ticket.waitingFor}
                                        </span>
                                      </TableCell>
                                      <TableCell>
                                        {formatDateTime(ticket.updatedAt)}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            ) : (
                              <PeopleEmptyState
                                title="Sem tickets recentes"
                                description="Os tickets reais do suporte aparecerão aqui quando houver movimentação."
                                icon={<LifeBuoy className="h-5 w-5" />}
                              />
                            )}
                          </CardBody>
                        </Card>
                      )}

                      {renderOperationalTable(currentOperationalEvents)}
                    </>
                  )}
                </div>
              </Tab>
            ))}
          </Tabs>
        )}
      </PeoplePanel>

      <Modal
        isOpen={Boolean(selectedChangeLog)}
        scrollBehavior="inside"
        size="5xl"
        onOpenChange={(open) => {
          if (!open) {
            setSelectedChangeLog(null);
          }
        }}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <span className="text-sm uppercase tracking-widest text-primary">
                  Alteração auditada
                </span>
                <div className="flex items-center gap-3">
                  <Badge
                    color={getChangeActionTone(selectedChangeLog?.acao ?? "") as never}
                    variant="flat"
                  >
                    {selectedChangeLog?.acao.replace(/_/g, " ")}
                  </Badge>
                  <Badge color="secondary" variant="flat">
                    {selectedChangeLog?.fonte === "SUPER_ADMIN"
                      ? "Super Admin"
                      : "Tenant"}
                  </Badge>
                </div>
                <span className="text-xs text-default-400">
                  {selectedChangeLog ? formatDateTime(selectedChangeLog.createdAt) : ""}
                </span>
              </ModalHeader>
              <ModalBody>
                {selectedChangeLog ? (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <Card className="ml-admin-surface-muted">
                        <CardBody className="space-y-2">
                          <p className="text-xs uppercase tracking-widest text-default-500">
                            Origem
                          </p>
                          <p className="text-sm font-medium text-foreground">
                            {selectedChangeLog.superAdmin?.nome ||
                              selectedChangeLog.usuario?.nome ||
                              "Sistema"}
                          </p>
                          <p className="text-xs text-default-500">
                            {selectedChangeLog.superAdmin?.email ||
                              selectedChangeLog.usuario?.email ||
                              "Sem email"}
                          </p>
                          <p className="text-xs text-default-500">
                            {selectedChangeLog.tenant?.nome || "Plataforma"}
                          </p>
                        </CardBody>
                      </Card>
                      <Card className="ml-admin-surface-muted">
                        <CardBody className="space-y-2">
                          <p className="text-xs uppercase tracking-widest text-default-500">
                            Metadados
                          </p>
                          <p className="text-sm text-foreground">
                            Entidade: {selectedChangeLog.entidade}
                          </p>
                          <p className="text-sm text-default-500">
                            ID: {selectedChangeLog.entidadeId || "—"}
                          </p>
                          <p className="text-sm text-default-500">
                            IP: {selectedChangeLog.ipAddress || "—"}
                          </p>
                        </CardBody>
                      </Card>
                    </div>

                    <Card className="ml-admin-surface-muted">
                      <CardHeader className="border-b border-default-200/80 dark:border-white/10">
                        <h3 className="text-sm font-semibold text-foreground">
                          Diff de campos
                        </h3>
                      </CardHeader>
                      <CardBody>
                        {changeDiffEntries.length ? (
                          <div className="space-y-3">
                            {changeDiffEntries.map((entry) => (
                              <div
                                key={entry.field}
                                className="grid grid-cols-1 gap-3 rounded-2xl ml-admin-surface-soft p-3 lg:grid-cols-3"
                              >
                                <div>
                                  <p className="text-xs uppercase tracking-widest text-default-500">
                                    Campo
                                  </p>
                                  <p className="text-sm font-medium text-foreground">
                                    {entry.field}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-xs uppercase tracking-widest text-default-500">
                                    Antes
                                  </p>
                                  <pre className="whitespace-pre-wrap text-xs text-default-400">
                                    {formatValue(entry.before)}
                                  </pre>
                                </div>
                                <div>
                                  <p className="text-xs uppercase tracking-widest text-default-500">
                                    Depois
                                  </p>
                                  <pre className="whitespace-pre-wrap text-xs text-default-400">
                                    {formatValue(entry.after)}
                                  </pre>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <PeopleEmptyState
                            title="Sem diff estruturado"
                            description="Esse log não trouxe um conjunto de campos alterados comparável."
                            icon={<Info className="h-5 w-5" />}
                          />
                        )}
                      </CardBody>
                    </Card>

                    <Card className="ml-admin-surface-muted">
                      <CardHeader className="border-b border-default-200/80 dark:border-white/10">
                        <h3 className="text-sm font-semibold text-foreground">
                          Contexto da entidade
                        </h3>
                      </CardHeader>
                      <CardBody>
                        {loadingContext ? (
                          <p className="text-sm text-default-500">
                            Buscando contexto da entidade.
                          </p>
                        ) : (
                          <pre className="whitespace-pre-wrap rounded-2xl border border-default-200/80 bg-default-100/60 p-4 text-xs text-default-500 dark:border-white/10 dark:bg-background/40 dark:text-default-400">
                            {formatJson(selectedLogContext?.data?.detalhes ?? null)}
                          </pre>
                        )}
                      </CardBody>
                    </Card>
                  </div>
                ) : null}
              </ModalBody>
              <ModalFooter>
                <Button radius="full" variant="light" onPress={onClose}>
                  Fechar
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      <Modal
        isOpen={Boolean(selectedOperationalEvent)}
        scrollBehavior="inside"
        size="4xl"
        onOpenChange={(open) => {
          if (!open) {
            setSelectedOperationalEvent(null);
          }
        }}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <span className="text-sm uppercase tracking-widest text-primary">
                  Evento operacional
                </span>
                <div className="flex items-center gap-3">
                  <Badge
                    color={getOperationalStatusTone(selectedOperationalEvent?.status ?? "") as never}
                    variant="flat"
                  >
                    {selectedOperationalEvent?.status}
                  </Badge>
                  <Badge color="secondary" variant="flat">
                    {selectedOperationalEvent?.category}
                  </Badge>
                </div>
                <span className="text-xs text-default-400">
                  {selectedOperationalEvent
                    ? formatDateTime(selectedOperationalEvent.createdAt)
                    : ""}
                </span>
              </ModalHeader>
              <ModalBody>
                {selectedOperationalEvent ? (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <Card className="ml-admin-surface-muted">
                        <CardBody className="space-y-2">
                          <p className="text-xs uppercase tracking-widest text-default-500">
                            Ator
                          </p>
                          <p className="text-sm font-medium text-foreground">
                            {selectedOperationalEvent.actorName ||
                              selectedOperationalEvent.actorEmail ||
                              selectedOperationalEvent.actorType ||
                              "Sistema"}
                          </p>
                          <p className="text-xs text-default-500">
                            {selectedOperationalEvent.actorEmail ||
                              selectedOperationalEvent.actorType ||
                              "Sem email"}
                          </p>
                          <p className="text-xs text-default-500">
                            {selectedOperationalEvent.tenant?.name || "Plataforma"}
                          </p>
                        </CardBody>
                      </Card>
                      <Card className="ml-admin-surface-muted">
                        <CardBody className="space-y-2">
                          <p className="text-xs uppercase tracking-widest text-default-500">
                            Metadados técnicos
                          </p>
                          <p className="text-sm text-foreground">
                            Ação: {selectedOperationalEvent.action}
                          </p>
                          <p className="text-sm text-default-500">
                            Fonte: {selectedOperationalEvent.source}
                          </p>
                          <p className="text-sm text-default-500">
                            Rota: {selectedOperationalEvent.route || "—"}
                          </p>
                          <p className="text-sm text-default-500">
                            IP: {selectedOperationalEvent.ipAddress || "—"}
                          </p>
                        </CardBody>
                      </Card>
                    </div>

                    <Card className="ml-admin-surface-muted">
                      <CardHeader className="border-b border-default-200/80 dark:border-white/10">
                        <h3 className="text-sm font-semibold text-foreground">
                          Mensagem operacional
                        </h3>
                      </CardHeader>
                      <CardBody>
                        <p className="text-sm text-default-400">
                          {selectedOperationalEvent.message || "Sem mensagem resumida."}
                        </p>
                      </CardBody>
                    </Card>

                    <Card className="ml-admin-surface-muted">
                      <CardHeader className="border-b border-default-200/80 dark:border-white/10">
                        <h3 className="text-sm font-semibold text-foreground">
                          Payload bruto
                        </h3>
                      </CardHeader>
                      <CardBody>
                        <pre className="whitespace-pre-wrap rounded-2xl border border-default-200/80 bg-default-100/60 p-4 text-xs text-default-500 dark:border-white/10 dark:bg-background/40 dark:text-default-400">
                          {formatJson(selectedOperationalEvent.payload ?? null)}
                        </pre>
                      </CardBody>
                    </Card>
                  </div>
                ) : null}
              </ModalBody>
              <ModalFooter>
                <Button radius="full" variant="light" onPress={onClose}>
                  Fechar
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </section>
  );
}
