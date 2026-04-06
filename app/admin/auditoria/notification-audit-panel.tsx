"use client";

import React, { useMemo, useState } from "react";
import useSWR from "swr";
import { Badge } from "@heroui/badge";
import { Button } from "@heroui/button";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Input } from "@heroui/input";
import { Modal, ModalBody, ModalContent, ModalHeader } from "@heroui/modal";
import { Select, SelectItem } from "@heroui/react";
import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from "@heroui/table";
import {
  AlertTriangle,
  BellRing,
  CircleDollarSign,
  Eye,
  Filter,
  MessageCircleWarning,
  Search,
  Send,
  ShieldAlert,
} from "lucide-react";

import type { AdminAuditCenterFilters } from "@/app/actions/auditoria";
import {
  getAdminNotificationAudit,
  getAdminNotificationAuditDetail,
  type NotificationAuditFilters,
  type NotificationAuditRow,
} from "@/app/actions/admin-notification-audit";
import {
  PeopleEmptyState,
  PeopleMetricCard,
  PeoplePanel,
} from "@/components/people-ui";

type NotificationAuditPanelFilters = Pick<
  NotificationAuditFilters,
  "channel" | "provider" | "status" | "reasonCode" | "eventType" | "userSearch"
>;

type NotificationAuditPanelProps = {
  filters: AdminAuditCenterFilters;
  value: NotificationAuditPanelFilters;
  onChange: (next: NotificationAuditPanelFilters) => void;
};

const STATUS_OPTIONS = [
  { key: "ALL", label: "Todos os status" },
  { key: "CREATED", label: "CREATED" },
  { key: "SUPPRESSED", label: "SUPPRESSED" },
  { key: "FAILED", label: "FAILED" },
  { key: "SKIPPED", label: "SKIPPED" },
  { key: "PENDING", label: "PENDING" },
  { key: "SENT", label: "SENT" },
  { key: "DELIVERED", label: "DELIVERED" },
  { key: "READ", label: "READ" },
];

const CHANNEL_OPTIONS = [
  { key: "ALL", label: "Todos os canais" },
  { key: "REALTIME", label: "Tempo real" },
  { key: "EMAIL", label: "Email" },
  { key: "TELEGRAM", label: "Telegram" },
  { key: "PUSH", label: "Push" },
];

function formatDateTime(value?: string | null) {
  if (!value) {
    return "—";
  }

  return new Date(value).toLocaleString("pt-BR");
}

function formatMoney(amount?: number | null, currency = "USD") {
  if (amount === null || amount === undefined) {
    return "—";
  }

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(amount);
}

function getStatusTone(status: string) {
  switch (status) {
    case "READ":
    case "DELIVERED":
      return "success";
    case "SENT":
    case "CREATED":
      return "primary";
    case "SKIPPED":
    case "SUPPRESSED":
      return "warning";
    case "FAILED":
      return "danger";
    default:
      return "default";
  }
}

function buildSelectOptions(
  currentValue: string | undefined,
  values: string[],
  allLabel: string,
) {
  const merged =
    currentValue && !values.includes(currentValue)
      ? [currentValue, ...values]
      : values;

  return [
    { key: "ALL", label: allLabel },
    ...Array.from(new Set(merged)).map((value) => ({ key: value, label: value })),
  ];
}

function getSelectedKeys(value: string | undefined, options: Array<{ key: string }>) {
  if (!value) {
    return ["ALL"];
  }

  return options.some((option) => option.key === value) ? [value] : ["ALL"];
}

export function NotificationAuditPanel({
  filters,
  value,
  onChange,
}: NotificationAuditPanelProps) {
  const [selectedDispatchId, setSelectedDispatchId] = useState<string | null>(null);
  const requestFilters = useMemo(
    () => ({
      ...filters,
      ...value,
      limit: 180,
    }),
    [filters, value],
  );
  const { data, error, isLoading } = useSWR(
    ["admin-notification-audit", requestFilters],
    ([, params]) => getAdminNotificationAudit(params),
    {
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      focusThrottleInterval: 2000,
    },
  );

  const detailKey = selectedDispatchId
    ? ["admin-notification-audit-detail", selectedDispatchId]
    : null;
  const { data: detailData, isLoading: loadingDetail } = useSWR(
    detailKey,
    ([, dispatchId]) => getAdminNotificationAuditDetail(dispatchId as string),
  );

  const rows = data?.data?.rows ?? [];
  const summary = data?.data?.summary;
  const options = data?.data?.options;
  const providerOptions = useMemo(
    () =>
      buildSelectOptions(
        value.provider,
        options?.providers ?? [],
        "Todos os providers",
      ),
    [options?.providers, value.provider],
  );
  const eventOptions = useMemo(
    () =>
      buildSelectOptions(
        value.eventType,
        options?.eventTypes ?? [],
        "Todos os eventos",
      ),
    [options?.eventTypes, value.eventType],
  );
  const reasonOptions = useMemo(
    () =>
      buildSelectOptions(
        value.reasonCode,
        options?.reasonCodes ?? [],
        "Todos os motivos",
      ),
    [options?.reasonCodes, value.reasonCode],
  );

  const handleFilterChange = (
    key: keyof NotificationAuditPanelFilters,
    nextValue?: string,
  ) => {
    onChange({
      ...value,
      [key]: !nextValue || nextValue === "ALL" ? undefined : nextValue,
    });
  };

  if (error) {
    return (
      <PeopleEmptyState
        title="Falha ao carregar a trilha de notificações"
        description={(error as Error)?.message || "A consulta de notificações falhou."}
        icon={<AlertTriangle className="h-6 w-6" />}
      />
    );
  }

  if (isLoading && !data) {
    return (
      <div className="flex min-h-56 items-center justify-center">
        <p className="text-sm text-default-400">
          Montando a auditoria de notificações por canal.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="border border-warning/20 bg-warning/5">
        <CardBody className="gap-2 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-warning">
            <MessageCircleWarning className="h-4 w-4" />
            Cobertura do v1
          </div>
          <p className="text-sm text-default-600">
            WhatsApp continua fora desta trilha. O motor principal audita apenas
            tempo real, email, Telegram e push.
          </p>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
        <PeopleMetricCard
          helper="Despachos avaliados no recorte atual"
          icon={<BellRing className="h-4 w-4" />}
          label="Total avaliado"
          tone="primary"
          value={summary?.totalEvaluated ?? 0}
        />
        <PeopleMetricCard
          helper="Despachos que viraram notificação persistida"
          icon={<Send className="h-4 w-4" />}
          label="Criadas"
          tone="success"
          value={summary?.totalCreated ?? 0}
        />
        <PeopleMetricCard
          helper="Eventos suprimidos antes da criação"
          icon={<ShieldAlert className="h-4 w-4" />}
          label="Suprimidas"
          tone="warning"
          value={summary?.totalSuppressed ?? 0}
        />
        <PeopleMetricCard
          helper="Falhas entre entregas tentadas"
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Taxa de falha"
          tone="danger"
          value={`${summary?.failureRate ?? 0}%`}
        />
        <PeopleMetricCard
          helper="Custo acumulado por entrega"
          icon={<CircleDollarSign className="h-4 w-4" />}
          label="Custo total"
          tone="secondary"
          value={formatMoney(summary?.costTotal, summary?.costCurrency ?? "USD")}
        />
      </div>

      <PeoplePanel
        title="Filtros da trilha"
        description="Filtre por usuário, evento, canal, provider, status e motivo."
      >
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-6">
          <Input
            classNames={{ inputWrapper: "min-h-12" }}
            label={
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-default-400" />
                <span>Usuário</span>
              </div>
            }
            placeholder="Nome, email ou ID"
            value={value.userSearch ?? ""}
            onChange={(event) => handleFilterChange("userSearch", event.target.value)}
          />
          <Select
            classNames={{ trigger: "min-h-12" }}
            items={eventOptions}
            label={
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-default-400" />
                <span>Evento</span>
              </div>
            }
            selectedKeys={getSelectedKeys(value.eventType, eventOptions)}
            selectionMode="single"
            onSelectionChange={(keys) =>
              handleFilterChange("eventType", Array.from(keys)[0] as string | undefined)
            }
          >
            {(item) => (
              <SelectItem key={item.key} textValue={item.label}>
                {item.label}
              </SelectItem>
            )}
          </Select>
          <Select
            classNames={{ trigger: "min-h-12" }}
            items={CHANNEL_OPTIONS}
            label="Canal"
            selectedKeys={getSelectedKeys(value.channel, CHANNEL_OPTIONS)}
            selectionMode="single"
            onSelectionChange={(keys) =>
              handleFilterChange("channel", Array.from(keys)[0] as string | undefined)
            }
          >
            {(item) => (
              <SelectItem key={item.key} textValue={item.label}>
                {item.label}
              </SelectItem>
            )}
          </Select>
          <Select
            classNames={{ trigger: "min-h-12" }}
            items={providerOptions}
            label="Provider"
            selectedKeys={getSelectedKeys(value.provider, providerOptions)}
            selectionMode="single"
            onSelectionChange={(keys) =>
              handleFilterChange("provider", Array.from(keys)[0] as string | undefined)
            }
          >
            {(item) => (
              <SelectItem key={item.key} textValue={item.label}>
                {item.label}
              </SelectItem>
            )}
          </Select>
          <Select
            classNames={{ trigger: "min-h-12" }}
            items={STATUS_OPTIONS}
            label="Status"
            selectedKeys={getSelectedKeys(value.status, STATUS_OPTIONS)}
            selectionMode="single"
            onSelectionChange={(keys) =>
              handleFilterChange("status", Array.from(keys)[0] as string | undefined)
            }
          >
            {(item) => (
              <SelectItem key={item.key} textValue={item.label}>
                {item.label}
              </SelectItem>
            )}
          </Select>
          <Select
            classNames={{ trigger: "min-h-12" }}
            items={reasonOptions}
            label="Motivo"
            selectedKeys={getSelectedKeys(value.reasonCode, reasonOptions)}
            selectionMode="single"
            onSelectionChange={(keys) =>
              handleFilterChange("reasonCode", Array.from(keys)[0] as string | undefined)
            }
          >
            {(item) => (
              <SelectItem key={item.key} textValue={item.label}>
                {item.label}
              </SelectItem>
            )}
          </Select>
        </div>
      </PeoplePanel>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.4fr_1fr_1fr]">
        <Card className="ml-admin-surface">
          <CardHeader className="border-b border-default-200/80 dark:border-white/10">
            <div className="flex items-center gap-2">
              <CircleDollarSign className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">
                Custo por canal
              </h3>
            </div>
          </CardHeader>
          <CardBody className="space-y-3">
            {summary?.costByChannel.length ? (
              summary.costByChannel.map((item) => (
                <div
                  key={item.channel}
                  className="rounded-2xl ml-admin-surface-soft p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {CHANNEL_OPTIONS.find((channel) => channel.key === item.channel)?.label ??
                          item.channel}
                      </p>
                      <p className="text-xs text-default-500">
                        {item.deliveries} entrega(s) com custo
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-foreground">
                      {formatMoney(item.amount, item.currency)}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <PeopleEmptyState
                title="Sem custo mensurável"
                description="Nenhuma entrega com custo registrado apareceu no recorte."
                icon={<CircleDollarSign className="h-5 w-5" />}
              />
            )}
          </CardBody>
        </Card>
        <Card className="ml-admin-surface">
          <CardHeader className="border-b border-default-200/80 dark:border-white/10">
            <div className="flex items-center gap-2">
              <BellRing className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">
                Top eventos
              </h3>
            </div>
          </CardHeader>
          <CardBody className="space-y-3">
            {summary?.topEvents.length ? (
              summary.topEvents.map((event) => (
                <div
                  key={event.eventType}
                  className="rounded-2xl ml-admin-surface-soft p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-foreground">
                      {event.eventType}
                    </p>
                    <p className="text-sm font-semibold text-foreground">
                      {event.total}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <PeopleEmptyState
                title="Sem eventos dominantes"
                description="Os eventos mais recorrentes aparecem aqui."
                icon={<BellRing className="h-5 w-5" />}
              />
            )}
          </CardBody>
        </Card>

        <Card className="ml-admin-surface">
          <CardHeader className="border-b border-default-200/80 dark:border-white/10">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">
                Top tenants
              </h3>
            </div>
          </CardHeader>
          <CardBody className="space-y-3">
            {summary?.topTenants.length ? (
              summary.topTenants.map((tenant) => (
                <div
                  key={tenant.tenantId}
                  className="rounded-2xl ml-admin-surface-soft p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-foreground">
                      {tenant.tenantName}
                    </p>
                    <p className="text-sm font-semibold text-foreground">
                      {tenant.total}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <PeopleEmptyState
                title="Sem tenants recorrentes"
                description="O ranking aparece quando houver trilha suficiente."
                icon={<ShieldAlert className="h-5 w-5" />}
              />
            )}
          </CardBody>
        </Card>
      </div>

      {rows.length ? (
        <Table removeWrapper aria-label="Tabela de auditoria de notificações">
          <TableHeader>
            <TableColumn>Data/Hora</TableColumn>
            <TableColumn>Evento e usuário</TableColumn>
            <TableColumn>Canal</TableColumn>
            <TableColumn>Status</TableColumn>
            <TableColumn>Destino</TableColumn>
            <TableColumn>Custo</TableColumn>
            <TableColumn>Detalhes</TableColumn>
          </TableHeader>
          <TableBody>
            {rows.map((row: NotificationAuditRow) => (
              <TableRow key={`${row.dispatchId}-${row.deliveryId ?? "dispatch"}`}>
                <TableCell>{formatDateTime(row.createdAt)}</TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-foreground">
                      {row.eventType}
                    </span>
                    <span className="text-xs text-default-500">
                      {row.userName} • {row.tenantName}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="text-sm text-foreground">{row.channelLabel}</span>
                    <span className="text-xs text-default-500">
                      {row.provider || "Sem provider"}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <Badge
                      color={getStatusTone(row.status) as never}
                      variant="flat"
                    >
                      {row.status}
                    </Badge>
                    <span className="text-xs text-default-500">
                      {row.reasonLabel}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="text-sm text-foreground">
                      {row.recipientTarget || "Sem destinatário"}
                    </span>
                    <span className="text-xs text-default-500">
                      {row.providerMessageId || row.providerStatus || "Sem evidência externa"}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="text-sm text-foreground">
                      {formatMoney(row.costAmount, row.costCurrency ?? "USD")}
                    </span>
                    <span className="text-xs text-default-500">
                      {row.costSource || "Sem custo"}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <Button
                    color="primary"
                    size="sm"
                    startContent={<Eye className="h-3.5 w-3.5" />}
                    variant="light"
                    onPress={() => setSelectedDispatchId(row.dispatchId)}
                  >
                    Ver ciclo
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <PeopleEmptyState
          title="Nenhuma linha encontrada"
          description="Ajuste os filtros ou amplie o período para encontrar despachos e entregas."
          icon={<BellRing className="h-6 w-6" />}
        />
      )}

      <Modal
        isOpen={Boolean(selectedDispatchId)}
        scrollBehavior="inside"
        size="5xl"
        onOpenChange={(open) => {
          if (!open) {
            setSelectedDispatchId(null);
          }
        }}
      >
        <ModalContent>
          {() => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <span className="text-sm uppercase tracking-widest text-primary">
                  Ciclo de despacho
                </span>
                <div className="flex items-center gap-3">
                  <Badge
                    color={getStatusTone(
                      detailData?.data?.dispatch.decision ?? "FAILED",
                    ) as never}
                    variant="flat"
                  >
                    {detailData?.data?.dispatch.decision ?? "—"}
                  </Badge>
                  <span className="text-sm text-default-500">
                    {detailData?.data?.dispatch.eventType ?? "Carregando"}
                  </span>
                </div>
              </ModalHeader>
              <ModalBody className="space-y-4 pb-6">
                {loadingDetail ? (
                  <div className="flex min-h-40 items-center justify-center">
                    <p className="text-sm text-default-400">
                      Carregando despacho e entregas.
                    </p>
                  </div>
                ) : !detailData?.success || !detailData.data ? (
                  <PeopleEmptyState
                    title="Falha ao carregar o detalhe"
                    description={detailData?.error || "O despacho não pôde ser lido."}
                    icon={<AlertTriangle className="h-6 w-6" />}
                  />
                ) : (
                  <>
                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                      <Card className="ml-admin-surface-soft">
                        <CardBody className="gap-2 p-4">
                          <p className="text-xs uppercase tracking-widest text-default-400">
                            Destinatário
                          </p>
                          <p className="text-sm font-medium text-foreground">
                            {detailData.data.user?.name || "Usuário indisponível"}
                          </p>
                          <p className="text-xs text-default-500">
                            {detailData.data.user?.email || detailData.data.user?.id || "Sem email"}
                          </p>
                        </CardBody>
                      </Card>
                      <Card className="ml-admin-surface-soft">
                        <CardBody className="gap-2 p-4">
                          <p className="text-xs uppercase tracking-widest text-default-400">
                            Tenant
                          </p>
                          <p className="text-sm font-medium text-foreground">
                            {detailData.data.tenant?.name || "Tenant indisponível"}
                          </p>
                          <p className="text-xs text-default-500">
                            {detailData.data.tenant?.slug || detailData.data.tenant?.id || "Sem slug"}
                          </p>
                        </CardBody>
                      </Card>
                      <Card className="ml-admin-surface-soft">
                        <CardBody className="gap-2 p-4">
                          <p className="text-xs uppercase tracking-widest text-default-400">
                            Canais
                          </p>
                          <p className="text-sm font-medium text-foreground">
                            Solicitados: {detailData.data.dispatch.requestedChannels.join(", ") || "—"}
                          </p>
                          <p className="text-xs text-default-500">
                            Resolvidos: {detailData.data.dispatch.resolvedChannels.join(", ") || "—"}
                          </p>
                        </CardBody>
                      </Card>
                    </div>

                    <Card className="ml-admin-surface">
                      <CardHeader className="border-b border-default-200/80 dark:border-white/10">
                        <div className="flex items-center gap-2">
                          <BellRing className="h-4 w-4 text-primary" />
                          <h3 className="text-sm font-semibold text-foreground">
                            Resumo do despacho
                          </h3>
                        </div>
                      </CardHeader>
                      <CardBody className="space-y-2">
                        <p className="text-sm text-foreground">
                          <span className="font-medium">Criado em:</span>{" "}
                          {formatDateTime(detailData.data.dispatch.createdAt)}
                        </p>
                        <p className="text-sm text-foreground">
                          <span className="font-medium">Motivo:</span>{" "}
                          {detailData.data.dispatch.reasonLabel}
                        </p>
                        {detailData.data.dispatch.reasonMessage ? (
                          <p className="text-sm text-default-500">
                            {detailData.data.dispatch.reasonMessage}
                          </p>
                        ) : null}
                        {detailData.data.notification ? (
                          <div className="rounded-2xl ml-admin-surface-soft p-3">
                            <p className="text-sm font-medium text-foreground">
                              {detailData.data.notification.title}
                            </p>
                            <p className="mt-1 text-sm text-default-500">
                              {detailData.data.notification.message}
                            </p>
                          </div>
                        ) : null}
                      </CardBody>
                    </Card>

                    <Card className="ml-admin-surface">
                      <CardHeader className="border-b border-default-200/80 dark:border-white/10">
                        <div className="flex items-center gap-2">
                          <Send className="h-4 w-4 text-primary" />
                          <h3 className="text-sm font-semibold text-foreground">
                            Entregas por canal
                          </h3>
                        </div>
                      </CardHeader>
                      <CardBody>
                        {detailData.data.deliveries.length ? (
                          <Table removeWrapper aria-label="Tabela de entregas da notificação">
                            <TableHeader>
                              <TableColumn>Canal</TableColumn>
                              <TableColumn>Status</TableColumn>
                              <TableColumn>Destino</TableColumn>
                              <TableColumn>Evidência</TableColumn>
                              <TableColumn>Custo</TableColumn>
                            </TableHeader>
                            <TableBody>
                              {detailData.data.deliveries.map((delivery) => (
                                <TableRow key={delivery.id}>
                                  <TableCell>
                                    <div className="flex flex-col">
                                      <span className="text-sm font-medium text-foreground">
                                        {delivery.channelLabel}
                                      </span>
                                      <span className="text-xs text-default-500">
                                        {delivery.provider}
                                      </span>
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex flex-col gap-1">
                                      <Badge
                                        color={getStatusTone(delivery.status) as never}
                                        variant="flat"
                                      >
                                        {delivery.status}
                                      </Badge>
                                      <span className="text-xs text-default-500">
                                        {delivery.reasonLabel}
                                      </span>
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex flex-col">
                                      <span className="text-sm text-foreground">
                                        {delivery.recipientTarget || "Sem alvo"}
                                      </span>
                                      <span className="text-xs text-default-500">
                                        {delivery.providerStatus || "Sem retorno do provider"}
                                      </span>
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex flex-col">
                                      <span className="text-sm text-foreground">
                                        {delivery.providerMessageId || "Sem message id"}
                                      </span>
                                      <span className="text-xs text-default-500">
                                        {delivery.sentAt
                                          ? `Enviado em ${formatDateTime(delivery.sentAt)}`
                                          : delivery.createdAt
                                            ? `Criado em ${formatDateTime(delivery.createdAt)}`
                                            : "Sem timestamp"}
                                      </span>
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex flex-col">
                                      <span className="text-sm text-foreground">
                                        {formatMoney(delivery.costAmount, delivery.costCurrency ?? "USD")}
                                      </span>
                                      <span className="text-xs text-default-500">
                                        {delivery.costSource || "Sem custo"}
                                      </span>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        ) : (
                          <PeopleEmptyState
                            title="Sem entregas materializadas"
                            description="Esse despacho não gerou linhas de entrega para canais individuais."
                            icon={<Send className="h-5 w-5" />}
                          />
                        )}
                      </CardBody>
                    </Card>

                    <Card className="ml-admin-surface">
                      <CardHeader className="border-b border-default-200/80 dark:border-white/10">
                        <div className="flex items-center gap-2">
                          <Search className="h-4 w-4 text-primary" />
                          <h3 className="text-sm font-semibold text-foreground">
                            Payload resumido
                          </h3>
                        </div>
                      </CardHeader>
                      <CardBody>
                        <pre className="overflow-x-auto rounded-2xl bg-default-100 p-4 text-xs text-default-700">
                          {JSON.stringify(detailData.data.dispatch.payloadSummary ?? {}, null, 2)}
                        </pre>
                      </CardBody>
                    </Card>
                  </>
                )}
              </ModalBody>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}

export type { NotificationAuditPanelFilters };
