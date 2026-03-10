"use client";

import type { RangeValue } from "@react-types/shared";

import React, { useMemo, useState } from "react";
import useSWR from "swr";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Badge } from "@heroui/badge";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";

import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
} from "@heroui/table";
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from "@heroui/modal";
import { Popover, PopoverTrigger, PopoverContent } from "@heroui/popover";
import { RangeCalendar, Tooltip, Select, SelectItem } from "@heroui/react";
import { CalendarDate, getLocalTimeZone } from "@internationalized/date";
import {
  CalendarRange,
  ClipboardList,
  CirclePlus,
  AlertTriangle,
  Download,
  Edit3,
  Info,
  Search,
  Settings2,
  Shield,
  Trash2,
  Users,
  XCircle,
} from "lucide-react";
import { toast } from "@/lib/toast";

import {
  PeopleEmptyState,
  PeopleMetricCard,
  PeoplePageHeader,
  PeoplePanel,
} from "@/components/people-ui";
import {
  exportSystemAuditLogs,
  getAuditLogContext,
  getSystemAuditLogs,
  type AuditLogEntry,
  type AuditLogFilters,
} from "@/app/actions/auditoria";

function formatCalendarRange(value?: RangeValue<CalendarDate> | null) {
  if (!value?.start) {
    return "Selecionar intervalo";
  }

  const startDate = value.start.toDate(getLocalTimeZone());
  const endDate = value.end?.toDate(getLocalTimeZone()) ?? startDate;

  return `${startDate.toLocaleDateString("pt-BR")} - ${endDate.toLocaleDateString("pt-BR")}`;
}

function formatJson(data: unknown) {
  if (!data) {
    return "{}";
  }

  try {
    return JSON.stringify(data, null, 2);
  } catch (error) {
    return String(data);
  }
}

function formatValue(value: unknown) {
  if (value === null || value === undefined) {
    return "—";
  }

  if (typeof value === "object") {
    try {
      return JSON.stringify(value, null, 2);
    } catch (error) {
      return String(value);
    }
  }

  if (typeof value === "boolean") {
    return value ? "Sim" : "Não";
  }

  return String(value);
}

export function AuditoriaContent() {
  const [searchTerm, setSearchTerm] = useState("");
  const [fonteFiltro, setFonteFiltro] = useState<
    "ALL" | "SUPER_ADMIN" | "TENANT"
  >("ALL");
  const [entidadeFiltro, setEntidadeFiltro] = useState<string>("ALL");
  const [acaoFiltro, setAcaoFiltro] = useState<string>("ALL");
  const [calendarRange, setCalendarRange] =
    useState<RangeValue<CalendarDate> | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  const filters: AuditLogFilters = useMemo(() => {
    const startIso = calendarRange?.start
      ? calendarRange.start.toDate(getLocalTimeZone()).toISOString()
      : undefined;
    const endIso = calendarRange?.end
      ? calendarRange.end.toDate(getLocalTimeZone()).toISOString()
      : undefined;

    return {
      limit: 250,
      search: searchTerm || undefined,
      fonte: fonteFiltro === "ALL" ? undefined : fonteFiltro,
      entidade: entidadeFiltro === "ALL" ? undefined : entidadeFiltro,
      acao: acaoFiltro === "ALL" ? undefined : acaoFiltro,
      startDate: startIso,
      endDate: endIso,
    };
  }, [searchTerm, fonteFiltro, entidadeFiltro, acaoFiltro, calendarRange]);

  const { data, error, isLoading } = useSWR(
    ["system-audit-logs", filters],
    ([, params]) => getSystemAuditLogs(params),
    {
      revalidateOnFocus: true,
      refreshInterval: 0,
    },
  );

  const logContextKey =
    selectedLog && selectedLog.entidadeId
      ? ["audit-log-context", selectedLog.entidade, selectedLog.entidadeId]
      : null;

  const { data: contextData, isLoading: loadingContext } = useSWR(
    logContextKey,
    ([, entidade, entidadeId]) =>
      getAuditLogContext(entidade as string, entidadeId as string),
  );

  const logs = data?.data?.logs ?? [];
  const summary = data?.data?.summary;

  const totalLogs = summary?.total ?? 0;
  const totalCreates = summary?.porCategoria.create ?? 0;
  const totalUpdates = summary?.porCategoria.update ?? 0;
  const totalDeletes = summary?.porCategoria.delete ?? 0;

  const entidadeOptions = useMemo(() => {
    const set = new Set<string>();

    logs.forEach((log) => {
      if (log.entidade) {
        set.add(log.entidade);
      }
    });

    return [
      { key: "ALL", label: "Todas" },
      ...Array.from(set)
        .sort()
        .map((entidade) => ({
          key: entidade,
          label: entidade.replace(/_/g, " "),
        })),
    ];
  }, [logs]);

  const acaoOptions = useMemo(() => {
    const set = new Set<string>();

    logs.forEach((log) => {
      if (log.acao) {
        set.add(log.acao);
      }
    });

    return [
      { key: "ALL", label: "Todas" },
      ...Array.from(set)
        .sort()
        .map((acao) => ({
          key: acao,
          label: acao.replace(/_/g, " "),
        })),
    ];
  }, [logs]);

  const diffEntries = useMemo(() => {
    if (!selectedLog) {
      return [] as Array<{ field: string; before: unknown; after: unknown }>;
    }

    const oldData =
      selectedLog.dadosAntigos && typeof selectedLog.dadosAntigos === "object"
        ? (selectedLog.dadosAntigos as Record<string, unknown>)
        : {};
    const newData =
      selectedLog.dadosNovos && typeof selectedLog.dadosNovos === "object"
        ? (selectedLog.dadosNovos as Record<string, unknown>)
        : {};

    const keys = new Set<string>([
      ...(selectedLog.changedFields ?? []),
      ...Object.keys(oldData ?? {}),
      ...Object.keys(newData ?? {}),
    ]);

    const entries: Array<{ field: string; before: unknown; after: unknown }> =
      [];

    keys.forEach((key) => {
      const before = oldData ? oldData[key] : undefined;
      const after = newData ? newData[key] : undefined;

      if (before === undefined && after === undefined) {
        return;
      }

      try {
        const beforeSerialized = JSON.stringify(before);
        const afterSerialized = JSON.stringify(after);

        if (beforeSerialized === afterSerialized) {
          return;
        }
      } catch (error) {
        // fallback to strict equality
        if (before === after) {
          return;
        }
      }

      entries.push({ field: key, before, after });
    });

    return entries;
  }, [selectedLog]);

  const getActionColor = (acao: string) => {
    if (acao.includes("CREATE")) return "success";
    if (acao.includes("UPDATE")) return "warning";
    if (acao.includes("DELETE")) return "danger";

    return "default";
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString("pt-BR");
  };

  return (
    <section className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-3 py-8 sm:px-6">
      <PeoplePageHeader
        tag="Administração"
        title="Auditoria do sistema"
        description="Trilha consolidada de ações administrativas para investigação, governança e rastreabilidade operacional."
        actions={
          <Button
            color="primary"
            isLoading={isExporting}
            radius="full"
            size="sm"
            startContent={<Download className="h-4 w-4" />}
            variant="flat"
            onPress={async () => {
              try {
                setIsExporting(true);
                const response = await exportSystemAuditLogs(filters);

                if (!response.success || !response.data || !response.filename) {
                  throw new Error(response.error ?? "Falha ao exportar logs");
                }

                const blob = new Blob([response.data], {
                  type: "text/csv;charset=utf-8",
                });
                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");

                link.href = url;
                link.download = response.filename;
                document.body.appendChild(link);
                link.click();
                link.remove();
                URL.revokeObjectURL(url);
                toast.success("Logs exportados com sucesso");
              } catch (err) {
                toast.error(
                  err instanceof Error
                    ? err.message
                    : "Não foi possível exportar os logs",
                );
              } finally {
                setIsExporting(false);
              }
            }}
          >
            Exportar CSV
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <PeopleMetricCard
          helper="Base consolidada da trilha administrativa"
          icon={<ClipboardList className="h-4 w-4" />}
          label="Total de logs"
          tone="primary"
          value={totalLogs}
        />
        <PeopleMetricCard
          helper="Criação de novos registros"
          icon={<CirclePlus className="h-4 w-4" />}
          label="Criações"
          tone="success"
          value={totalCreates}
        />
        <PeopleMetricCard
          helper="Mudanças em entidades existentes"
          icon={<Edit3 className="h-4 w-4" />}
          label="Atualizações"
          tone="warning"
          value={totalUpdates}
        />
        <PeopleMetricCard
          helper="Ações destrutivas registradas"
          icon={<Trash2 className="h-4 w-4" />}
          label="Exclusões"
          tone="danger"
          value={totalDeletes}
        />
      </div>

      <PeoplePanel
        title="Filtros de investigação"
        description="Refine por origem, entidade, ação e período para reduzir ruído e acelerar análise."
      >
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
          <Input
            classNames={{ inputWrapper: "min-h-12" }}
            label={
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-default-400" />
                <span>Busca</span>
                <Tooltip
                  className="max-w-xs"
                  color="primary"
                  content="Filtre por ação, entidade, usuário ou qualquer termo relacionado ao log."
                >
                  <Info className="h-3.5 w-3.5 cursor-help text-primary" />
                </Tooltip>
              </div>
            }
            placeholder="Buscar por ação, entidade ou usuário"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
          <Select
            classNames={{ trigger: "min-h-12" }}
            label={
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-default-400" />
                <span>Origem</span>
                <Tooltip
                  color="secondary"
                  content="Selecione a origem do log: ações disparadas por super admins ou pelos tenants."
                >
                  <Info className="h-3.5 w-3.5 cursor-help text-secondary" />
                </Tooltip>
              </div>
            }
            selectedKeys={[fonteFiltro]}
            selectionMode="single"
            onSelectionChange={(keys) => {
              const value = Array.from(keys)[0] as
                | typeof fonteFiltro
                | undefined;

              setFonteFiltro(value ?? "ALL");
            }}
          >
            <SelectItem key="ALL" textValue="Todas">
              Todas
            </SelectItem>
            <SelectItem key="SUPER_ADMIN" textValue="Super Admin">
              Super Admin
            </SelectItem>
            <SelectItem key="TENANT" textValue="Tenant">
              Tenant
            </SelectItem>
          </Select>
          <Select
            classNames={{ trigger: "min-h-12" }}
            items={entidadeOptions}
            label={
              <div className="flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-default-400" />
                <span>Entidade</span>
                <Tooltip
                  color="success"
                  content="Restrinja os resultados para um tipo específico de entidade auditada (ex.: USUARIO, TENANT)."
                >
                  <Info className="h-3.5 w-3.5 cursor-help text-success" />
                </Tooltip>
              </div>
            }
            selectedKeys={[entidadeFiltro]}
            selectionMode="single"
            onSelectionChange={(keys) => {
              const value = Array.from(keys)[0] as string | undefined;

              setEntidadeFiltro(value ?? "ALL");
            }}
          >
            {(item) => (
              <SelectItem key={item.key} textValue={item.label}>
                {item.label}
              </SelectItem>
            )}
          </Select>
          <Select
            classNames={{ trigger: "min-h-12" }}
            items={acaoOptions}
            label={
              <div className="flex items-center gap-2">
                <Settings2 className="h-4 w-4 text-default-400" />
                <span>Ação</span>
                <Tooltip
                  color="warning"
                  content="Filtre por tipos de operação (CREATE, UPDATE, DELETE...) para investigar eventos específicos."
                >
                  <Info className="h-3.5 w-3.5 cursor-help text-warning" />
                </Tooltip>
              </div>
            }
            selectedKeys={[acaoFiltro]}
            selectionMode="single"
            onSelectionChange={(keys) => {
              const value = Array.from(keys)[0] as string | undefined;

              setAcaoFiltro(value ?? "ALL");
            }}
          >
            {(item) => (
              <SelectItem key={item.key} textValue={item.label}>
                {item.label}
              </SelectItem>
            )}
          </Select>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-sm text-default-400">
              <CalendarRange className="h-4 w-4 text-default-400" />
              <span>Período</span>
              <Tooltip
                color="default"
                content="Defina um intervalo de datas para focar em eventos ocorridos em um período específico."
              >
                <Info className="h-3.5 w-3.5 cursor-help text-default-400" />
              </Tooltip>
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
                  value={calendarRange as any}
                  onChange={(value) =>
                    setCalendarRange(
                      (value as RangeValue<CalendarDate> | null) ?? null,
                    )
                  }
                />
              </PopoverContent>
            </Popover>
            <span className="text-xs text-default-500">
              Clique acima para abrir o calendário e definir o período desejado.
            </span>
            {calendarRange ? (
              <Tooltip color="danger" content="Remover intervalo selecionado">
                <Button
                  radius="full"
                  size="sm"
                  startContent={<XCircle className="h-4 w-4" />}
                  variant="light"
                  onPress={() => setCalendarRange(null)}
                >
                  Limpar período
                </Button>
              </Tooltip>
            ) : null}
          </div>
        </div>
      </PeoplePanel>

      <PeoplePanel
        title="Logs de auditoria"
        description="Histórico detalhado de ações administrativas, com contexto por entidade e diff por evento."
      >
        {error ? (
          <PeopleEmptyState
            description={
              (error as Error)?.message ||
              "Tente atualizar a consulta ou refinar o escopo da investigação."
            }
            icon={<AlertTriangle className="h-6 w-6" />}
            title="Não foi possível carregar os logs"
          />
        ) : isLoading ? (
          <div className="flex min-h-56 items-center justify-center">
            <p className="text-sm text-default-400">
              Buscando os registros de auditoria mais recentes.
            </p>
          </div>
        ) : logs.length > 0 ? (
          <Table removeWrapper aria-label="Tabela de Logs de Auditoria">
            <TableHeader>
              <TableColumn>Data/Hora</TableColumn>
              <TableColumn>Ação</TableColumn>
              <TableColumn>Entidade</TableColumn>
              <TableColumn>Origem</TableColumn>
              <TableColumn>IP</TableColumn>
              <TableColumn>Detalhes</TableColumn>
            </TableHeader>
            <TableBody>
              {logs.map((log) => {
                const origemLabel =
                  log.fonte === "SUPER_ADMIN" ? "Super Admin" : "Tenant";
                const origemDescricao =
                  log.fonte === "SUPER_ADMIN"
                    ? log.superAdmin?.nome || log.superAdmin?.email || "—"
                    : log.tenant?.nome || log.usuario?.nome || "—";
                const camposAlterados = log.changedFields ?? [];

                return (
                  <TableRow key={log.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-white">
                          {formatDate(log.createdAt)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        className="capitalize"
                        color={getActionColor(log.acao) as any}
                        variant="flat"
                      >
                        {log.acao.replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-white">
                          {log.entidade.replace(/_/g, " ")}
                        </span>
                        {log.entidadeId && (
                          <span className="text-xs text-default-400">
                            ID: {log.entidadeId}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm text-white">
                          {origemLabel}
                        </span>
                        <span className="text-xs text-default-400">
                          {origemDescricao}
                        </span>
                        {log.tenant?.slug && log.fonte !== "SUPER_ADMIN" && (
                          <span className="text-xs text-primary">
                            {log.tenant.slug}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-default-400">
                        {log.ipAddress || "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-2">
                        {camposAlterados.length > 0 ? (
                          <span className="text-xs text-default-400">
                            Campos alterados:{" "}
                            {camposAlterados.slice(0, 3).join(", ")}
                            {camposAlterados.length > 3
                              ? ` +${camposAlterados.length - 3}`
                              : ""}
                          </span>
                        ) : (
                          <span className="text-xs text-default-400">
                            {log.dadosNovos
                              ? "Dados atualizados"
                              : "Sem alterações registradas"}
                          </span>
                        )}
                        <Button
                          color="primary"
                          size="sm"
                          startContent={<Info className="h-3.5 w-3.5" />}
                          variant="light"
                          onPress={() => {
                            setSelectedLog(log);
                            setIsDetailsOpen(true);
                          }}
                        >
                          Ver Detalhes
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <PeopleEmptyState
            description="Os logs de auditoria aparecerão aqui conforme as ações forem registradas no sistema."
            icon={<ClipboardList className="h-6 w-6" />}
            title="Nenhum log encontrado"
          />
        )}
      </PeoplePanel>
      <Modal
        isOpen={isDetailsOpen}
        scrollBehavior="inside"
        size="xl"
        onOpenChange={(open) => {
          setIsDetailsOpen(open);
          if (!open) {
            setSelectedLog(null);
          }
        }}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <span className="text-sm uppercase tracking-widest text-primary">
                  Detalhes do Log
                </span>
                <div className="flex items-center gap-3">
                  <Badge
                    color={
                      selectedLog?.fonte === "SUPER_ADMIN"
                        ? "secondary"
                        : "primary"
                    }
                  >
                    {selectedLog?.fonte === "SUPER_ADMIN"
                      ? "Super Admin"
                      : "Tenant"}
                  </Badge>
                  <Badge
                    color={getActionColor(selectedLog?.acao ?? "") as any}
                    variant="flat"
                  >
                    {selectedLog?.acao
                      ? selectedLog.acao.replace(/_/g, " ")
                      : ""}
                  </Badge>
                </div>
                <span className="text-xs text-default-400">
                  {selectedLog ? formatDate(selectedLog.createdAt) : ""}
                </span>
              </ModalHeader>
              <ModalBody>
                {selectedLog ? (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="rounded-lg border border-white/10 bg-default/20 p-4">
                        <h3 className="text-sm font-semibold text-white">
                          Origem
                        </h3>
                        <div className="mt-1 text-sm text-default-400">
                          <div className="flex items-center gap-2">
                            {selectedLog.fonte === "SUPER_ADMIN" ? (
                              <Shield className="h-4 w-4 text-secondary" />
                            ) : (
                              <Users className="h-4 w-4 text-primary" />
                            )}
                            <span>
                              {selectedLog.fonte === "SUPER_ADMIN"
                                ? selectedLog.superAdmin?.nome ||
                                  selectedLog.superAdmin?.email ||
                                  "—"
                                : selectedLog.tenant?.nome ||
                                  selectedLog.usuario?.nome ||
                                  "—"}
                            </span>
                          </div>
                          {selectedLog.tenant?.slug ? (
                            <p className="text-xs text-default-500">
                              Tenant: {selectedLog.tenant.slug}
                            </p>
                          ) : null}
                          {selectedLog.superAdmin?.email &&
                          selectedLog.fonte === "SUPER_ADMIN" ? (
                            <p className="text-xs text-default-500">
                              Email: {selectedLog.superAdmin.email}
                            </p>
                          ) : null}
                          {selectedLog.usuario?.email &&
                          selectedLog.fonte === "TENANT" ? (
                            <p className="text-xs text-default-500">
                              Email: {selectedLog.usuario.email}
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-default/20 p-4">
                        <h3 className="text-sm font-semibold text-white">
                          Metadados
                        </h3>
                        <dl className="mt-1 space-y-2 text-sm text-default-400">
                          <div className="flex flex-col">
                            <dt className="text-xs uppercase tracking-widest text-default-500">
                              Entidade
                            </dt>
                            <dd>
                              {selectedLog.entidade
                                ? selectedLog.entidade.replace(/_/g, " ")
                                : "—"}
                            </dd>
                          </div>
                          {selectedLog.entidadeId ? (
                            <div className="flex flex-col">
                              <dt className="text-xs uppercase tracking-widest text-default-500">
                                ID da Entidade
                              </dt>
                              <dd>{selectedLog.entidadeId}</dd>
                            </div>
                          ) : null}
                          <div className="flex flex-col">
                            <dt className="text-xs uppercase tracking-widest text-default-500">
                              IP / User Agent
                            </dt>
                            <dd>{selectedLog.ipAddress ?? "—"}</dd>
                            <dd className="text-xs text-default-500">
                              {selectedLog.userAgent ?? "—"}
                            </dd>
                          </div>
                        </dl>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold text-white">
                        Campos Alterados
                      </h3>
                      {selectedLog.changedFields &&
                      selectedLog.changedFields.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {selectedLog.changedFields.map((field) => (
                            <Badge key={field} color="primary" variant="flat">
                              {field}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-default-400">
                          Nenhuma alteração registrada.
                        </p>
                      )}
                    </div>

                    {selectedLog.entidadeId ? (
                      <div className="rounded-lg border border-white/10 bg-default/20 p-4">
                        <h3 className="text-sm font-semibold text-white">
                          Contexto do Registro
                        </h3>
                        {loadingContext ? (
                          <p className="mt-2 text-sm text-default-400">
                            Carregando detalhes...
                          </p>
                        ) : contextData?.success ? (
                          contextData.data?.detalhes ? (
                            <div className="mt-3 space-y-2 text-sm text-default-400">
                              {contextData.data?.entidade === "USUARIO" ? (
                                <>
                                  {contextData.data.detalhes?.nome && (
                                    <p>
                                      <span className="text-default-500">
                                        Nome:
                                      </span>{" "}
                                      {contextData.data.detalhes.nome}
                                    </p>
                                  )}
                                  {contextData.data.detalhes?.email && (
                                    <p>
                                      <span className="text-default-500">
                                        Email:
                                      </span>{" "}
                                      {contextData.data.detalhes.email}
                                    </p>
                                  )}
                                  {contextData.data.detalhes?.role && (
                                    <p>
                                      <span className="text-default-500">
                                        Perfil:
                                      </span>{" "}
                                      {contextData.data.detalhes.role}
                                    </p>
                                  )}
                                  {contextData.data.detalhes?.ativo !==
                                    undefined && (
                                    <p>
                                      <span className="text-default-500">
                                        Ativo:
                                      </span>{" "}
                                      {contextData.data.detalhes.ativo
                                        ? "Sim"
                                        : "Não"}
                                    </p>
                                  )}
                                  {contextData.data.detalhes?.tenant ? (
                                    <p>
                                      <span className="text-default-500">
                                        Tenant:
                                      </span>{" "}
                                      {contextData.data.detalhes.tenant.nome}
                                      {contextData.data.detalhes.tenant.slug
                                        ? ` (${contextData.data.detalhes.tenant.slug})`
                                        : ""}
                                    </p>
                                  ) : null}
                                </>
                              ) : (
                                <pre className="rounded-md bg-default-50/50 p-3 text-xs text-default-400">
                                  {formatJson(contextData.data.detalhes)}
                                </pre>
                              )}
                            </div>
                          ) : (
                            <p className="mt-2 text-sm text-default-400">
                              Registro associado não encontrado no banco de
                              dados.
                            </p>
                          )
                        ) : contextData?.error ? (
                          <p className="mt-2 text-sm text-danger">
                            {contextData.error}
                          </p>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold text-white">
                        Resumo das Alterações
                      </h3>
                      {diffEntries.length > 0 ? (
                        <div className="space-y-3">
                          {diffEntries.map((entry) => (
                            <div
                              key={entry.field}
                              className="rounded-lg border border-white/10 bg-default/10 p-3"
                            >
                              <p className="text-xs uppercase tracking-widest text-default-500">
                                {entry.field}
                              </p>
                              <div className="mt-2 grid gap-3 md:grid-cols-2">
                                <div className="flex flex-col gap-1">
                                  <span className="text-xs text-default-500">
                                    Antes
                                  </span>
                                  {typeof entry.before === "object" &&
                                  entry.before !== null ? (
                                    <pre className="max-h-40 overflow-auto rounded-md bg-default-50/30 p-2 text-xs text-default-400">
                                      {formatValue(entry.before)}
                                    </pre>
                                  ) : (
                                    <span className="text-sm text-default-300">
                                      {formatValue(entry.before)}
                                    </span>
                                  )}
                                </div>
                                <div className="flex flex-col gap-1">
                                  <span className="text-xs text-default-500">
                                    Depois
                                  </span>
                                  {typeof entry.after === "object" &&
                                  entry.after !== null ? (
                                    <pre className="max-h-40 overflow-auto rounded-md bg-default-50/30 p-2 text-xs text-default-400">
                                      {formatValue(entry.after)}
                                    </pre>
                                  ) : (
                                    <span className="text-sm text-default-300">
                                      {formatValue(entry.after)}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-default-400">
                          Nenhuma diferença relevante identificada entre os
                          dados antigos e novos.
                        </p>
                      )}
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="flex flex-col gap-2">
                        <h3 className="text-sm font-semibold text-white">
                          Dados Anteriores
                        </h3>
                        <pre className="max-h-60 overflow-auto rounded-lg bg-default-50/50 p-4 text-xs text-default-300">
                          {formatJson(selectedLog.dadosAntigos)}
                        </pre>
                      </div>
                      <div className="flex flex-col gap-2">
                        <h3 className="text-sm font-semibold text-white">
                          Dados Novos
                        </h3>
                        <pre className="max-h-60 overflow-auto rounded-lg bg-default-50/50 p-4 text-xs text-default-300">
                          {formatJson(selectedLog.dadosNovos)}
                        </pre>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-default-400">
                    Nenhum log selecionado.
                  </p>
                )}
              </ModalBody>
              <ModalFooter>
                <Button variant="flat" onPress={() => onClose()}>
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
