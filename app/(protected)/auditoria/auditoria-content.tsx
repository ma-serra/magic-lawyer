"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Badge } from "@heroui/badge";
import { Button } from "@heroui/button";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Input } from "@heroui/input";
import { Select, SelectItem, Tab, Tabs } from "@heroui/react";
import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from "@heroui/table";
import { Download, Eye, RefreshCcw, Search } from "lucide-react";

import {
  exportTenantAuditLogs,
  getTenantAuditCenter,
  type TenantAuditCenterFilters,
  type TenantAuditTabKey,
} from "@/app/actions/tenant-auditoria";
import {
  PeopleEmptyState,
  PeopleMetricCard,
  PeoplePageHeader,
  PeoplePanel,
} from "@/components/people-ui";
import { toast } from "@/lib/toast";

const TAB_OPTIONS: Array<{
  key: TenantAuditTabKey;
  label: string;
  description: string;
}> = [
  {
    key: "overview",
    label: "Visão geral",
    description: "Leitura executiva da trilha completa do escritório.",
  },
  {
    key: "changes",
    label: "Alterações",
    description: "Create/update/delete/restore com diff e ator.",
  },
  {
    key: "access",
    label: "Acessos",
    description: "Login e visualizações sensíveis rastreadas.",
  },
  {
    key: "deletions",
    label: "Exclusões",
    description: "Eventos de soft delete e restauração.",
  },
  {
    key: "operational",
    label: "Operacional",
    description: "Webhook, email, cron e integrações críticas.",
  },
];

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR");
}

function downloadCsv(filename: string, csv: string) {
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

function buildTabRows(
  tab: TenantAuditTabKey,
  data: NonNullable<Awaited<ReturnType<typeof getTenantAuditCenter>>["data"]>,
) {
  if (tab === "changes" || tab === "deletions") {
    return data.changeLogs.map((item) => ({
      id: item.id,
      timestamp: item.createdAt,
      action: item.action,
      category: "CHANGE",
      entity: `${item.entity}${item.entityId ? ` (${item.entityId})` : ""}`,
      actor: item.actor.name ?? item.actor.email ?? "Sistema",
      status: item.changedFields.length > 0 ? "UPDATED" : "INFO",
      source: "AuditLog",
      message:
        item.changedFields.length > 0
          ? `Campos alterados: ${item.changedFields.join(", ")}`
          : "Registro de alteração sem diff explícito.",
    }));
  }

  const sourceEvents = tab === "access" ? data.accessEvents : data.operationalEvents;

  return sourceEvents.map((item) => ({
    id: item.id,
    timestamp: item.createdAt,
    action: item.action,
    category: item.category,
    entity: item.entityType
      ? `${item.entityType}${item.entityId ? ` (${item.entityId})` : ""}`
      : "—",
    actor: item.actorName ?? item.actorEmail ?? "Sistema",
    status: item.status,
    source: item.source,
    message: item.message ?? "—",
  }));
}

export function AuditoriaTenantContent() {
  const [tab, setTab] = useState<TenantAuditTabKey>("overview");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [isExporting, setIsExporting] = useState(false);

  const filters: TenantAuditCenterFilters = useMemo(
    () => ({
      tab,
      limit: 80,
      page: 1,
      search: search.trim() || undefined,
    }),
    [tab, search],
  );

  const { data, isLoading, error, mutate } = useSWR(
    ["tenant-audit-center", filters],
    ([, params]) => getTenantAuditCenter(params),
    {
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      focusThrottleInterval: 2000,
    },
  );

  const auditData = data?.data;
  const tabRows = useMemo(() => {
    if (!auditData) return [];

    const rows = buildTabRows(tab, auditData);
    if (statusFilter === "ALL") return rows;
    return rows.filter((row) => row.status.toUpperCase() === statusFilter);
  }, [auditData, statusFilter, tab]);

  const handleExport = async () => {
    try {
      setIsExporting(true);
      const result = await exportTenantAuditLogs(filters);

      if (!result.success || !result.data || !result.filename) {
        throw new Error(result.error || "Falha ao exportar auditoria.");
      }

      downloadCsv(result.filename, result.data);
      toast.success("Auditoria exportada com sucesso.");
    } catch (exportError) {
      const message =
        exportError instanceof Error
          ? exportError.message
          : "Erro ao exportar auditoria.";
      toast.error(message);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <PeoplePageHeader
        tag="Governança e risco"
        title="Auditoria do Escritório"
        description="Trilha completa de alterações, acessos sensíveis e eventos operacionais do tenant."
      />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
        <PeopleMetricCard
          label="Alterações"
          value={String(auditData?.summary.totalChanges ?? 0)}
          helper="Registros em AuditLog"
        />
        <PeopleMetricCard
          label="Acessos sensíveis"
          value={String(auditData?.summary.totalAccessEvents ?? 0)}
          helper="Eventos ACCESS/DATA_ACCESS"
        />
        <PeopleMetricCard
          label="Operacionais"
          value={String(auditData?.summary.totalOperationalEvents ?? 0)}
          helper="Webhook, email, cron e integração"
        />
        <PeopleMetricCard
          label="Soft Deletes"
          value={String(auditData?.summary.totalSoftDeletes ?? 0)}
          helper="Exclusões lógicas rastreadas"
        />
        <PeopleMetricCard
          label="Erros"
          value={String(auditData?.summary.totalErrors ?? 0)}
          helper="Eventos operacionais com status ERROR"
        />
      </div>

      <PeoplePanel
        title="Centro de eventos auditáveis"
        description="Consulta por abas com filtros de status, busca textual e exportação da trilha do escritório."
      >
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-1 flex-col gap-3 md:flex-row md:items-center">
            <Input
              aria-label="Buscar na auditoria"
              className="md:max-w-lg"
              placeholder="Buscar ação, entidade, ator ou fonte"
              startContent={<Search className="h-4 w-4 text-default-400" />}
              value={search}
              onValueChange={setSearch}
            />
            <Select
              aria-label="Filtrar status"
              className="w-full md:max-w-56"
              selectedKeys={new Set([statusFilter])}
              onSelectionChange={(keys) => {
                const selected = Array.from(keys)[0];
                setStatusFilter(typeof selected === "string" ? selected : "ALL");
              }}
            >
              {[
                { key: "ALL", label: "Todos os status" },
                { key: "INFO", label: "INFO" },
                { key: "SUCCESS", label: "SUCCESS" },
                { key: "WARNING", label: "WARNING" },
                { key: "ERROR", label: "ERROR" },
                { key: "UPDATED", label: "UPDATED" },
              ].map((item) => (
                <SelectItem key={item.key} textValue={item.label}>
                  {item.label}
                </SelectItem>
              ))}
            </Select>
          </div>
          <div className="flex gap-2">
            <Button
              isIconOnly
              variant="flat"
              onPress={() => mutate()}
              aria-label="Atualizar auditoria"
            >
              <RefreshCcw className="h-4 w-4" />
            </Button>
            <Button
              color="primary"
              startContent={<Download className="h-4 w-4" />}
              isLoading={isExporting}
              onPress={handleExport}
            >
              Exportar CSV
            </Button>
          </div>
        </div>

        <div className="mt-4">
          <Tabs
            aria-label="Abas de auditoria do tenant"
            selectedKey={tab}
            onSelectionChange={(key) => setTab(key as TenantAuditTabKey)}
          >
            {TAB_OPTIONS.map((item) => (
              <Tab
                key={item.key}
                title={item.label}
                className="py-4"
              >
                <p className="text-sm text-default-500 mb-3">{item.description}</p>
              </Tab>
            ))}
          </Tabs>
        </div>

        <Card className="border border-default-200/60 bg-content1/80 mt-3">
          <CardHeader className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-default-800">
                Eventos capturados
              </p>
              <p className="text-xs text-default-500">
                Último evento: {formatDateTime(auditData?.summary.lastEventAt)}
              </p>
            </div>
            <Badge color="primary" variant="flat">
              {tabRows.length} linha(s)
            </Badge>
          </CardHeader>
          <CardBody>
            {error ? (
              <PeopleEmptyState
                icon={<Eye className="h-5 w-5" />}
                title="Falha ao carregar auditoria"
                description={
                  data?.error ??
                  "Não foi possível carregar os eventos. Tente atualizar."
                }
              />
            ) : (
              <Table
                aria-label="Tabela de trilha de auditoria do tenant"
                removeWrapper
                isStriped
                classNames={{ th: "text-[11px] uppercase tracking-wider" }}
              >
                <TableHeader>
                  <TableColumn>Data/Hora</TableColumn>
                  <TableColumn>Ação</TableColumn>
                  <TableColumn>Categoria</TableColumn>
                  <TableColumn>Entidade</TableColumn>
                  <TableColumn>Ator</TableColumn>
                  <TableColumn>Status</TableColumn>
                  <TableColumn>Origem</TableColumn>
                  <TableColumn>Mensagem</TableColumn>
                </TableHeader>
                <TableBody
                  emptyContent={
                    isLoading
                      ? "Carregando trilha de auditoria..."
                      : "Nenhum evento encontrado para os filtros atuais."
                  }
                  items={tabRows}
                >
                  {(row) => (
                    <TableRow key={row.id}>
                      <TableCell className="text-xs text-default-600">
                        {formatDateTime(row.timestamp)}
                      </TableCell>
                      <TableCell className="font-medium text-default-800">
                        {row.action}
                      </TableCell>
                      <TableCell>{row.category}</TableCell>
                      <TableCell className="max-w-[260px] truncate">
                        {row.entity}
                      </TableCell>
                      <TableCell>{row.actor}</TableCell>
                      <TableCell>
                        <Badge
                          color={
                            row.status === "ERROR"
                              ? "danger"
                              : row.status === "WARNING"
                                ? "warning"
                                : row.status === "SUCCESS"
                                  ? "success"
                                  : "default"
                          }
                          variant="flat"
                        >
                          {row.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{row.source}</TableCell>
                      <TableCell className="max-w-[360px] truncate">
                        {row.message}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardBody>
        </Card>
      </PeoplePanel>
    </div>
  );
}
