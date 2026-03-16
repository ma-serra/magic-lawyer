"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import NextLink from "next/link";
import useSWR from "swr";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Database,
  ShieldAlert,
  UserCheck,
  UserX,
  Workflow,
} from "lucide-react";
import {
  Button,
  Chip,
  Switch,
  Tooltip,
} from "@heroui/react";
import { Link } from "@heroui/link";

import { getAllTenants, type TenantResponse } from "@/app/actions/admin";
import {
  type AdminCausasLinkageSnapshot,
  type AdminCausasLinkageTenantRow,
  type CausaSyncFailureSummaryRow,
  type CausaSyncTenantResult,
  type CausasOficiaisSyncResult,
  getAdminCausasLinkageSnapshot,
  syncCausasOficiais,
} from "@/app/actions/causas";
import {
  PeopleEmptyState,
  PeopleMetricCard,
  PeoplePageHeader,
  PeoplePanel,
} from "@/components/people-ui";
import { SearchableSelect } from "@/components/searchable-select";
import { toast } from "@/lib/toast";

type TenantStatus = "ACTIVE" | "SUSPENDED" | "CANCELLED" | (string & {});

interface TenantSummary {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
}

function getSingleSelectionKey(value: unknown): string | undefined {
  if (!value) {
    return undefined;
  }

  if (value instanceof Set) {
    const first = Array.from(value)[0];

    if (typeof first === "string" && first.length > 0) {
      return first;
    }

    return undefined;
  }

  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  return undefined;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}

function formatDuration(value?: number | null) {
  if (!value || value <= 0) {
    return "-";
  }

  if (value < 1000) {
    return `${value}ms`;
  }

  return `${(value / 1000).toFixed(1)}s`;
}

function getTenantStatusColor(status: TenantStatus) {
  switch (status) {
    case "ACTIVE":
      return "success" as const;
    case "SUSPENDED":
      return "warning" as const;
    case "CANCELLED":
      return "danger" as const;
    default:
      return "default" as const;
  }
}

function getTenantStatusLabel(status: TenantStatus) {
  switch (status) {
    case "ACTIVE":
      return "Ativo";
    case "SUSPENDED":
      return "Suspenso";
    case "CANCELLED":
      return "Cancelado";
    default:
      return status;
  }
}

function getTenantSyncLabel(sync: CausaSyncTenantResult) {
  return `${formatNumber(sync.criadas)} novas, ${formatNumber(sync.atualizadas)} atualizadas, ${formatNumber(sync.ignoradas)} ignoradas`;
}

function getTenantOperationalImpact(tenant: AdminCausasLinkageTenantRow | null) {
  if (!tenant) {
    return 0;
  }

  return (
    tenant.processCount +
    tenant.diligenciaCount +
    tenant.peticaoCount +
    tenant.prazoCount +
    tenant.contractDocumentCount +
    tenant.clientProcessCount +
    tenant.clientCount
  );
}

function FailureListItem({
  failures,
}: {
  failures: CausaSyncFailureSummaryRow[];
}) {
  if (!failures.length) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-danger/20 bg-danger/5 p-4 text-sm text-danger">
      <p className="mb-2 flex items-center gap-2 font-semibold">
        <AlertTriangle className="h-4 w-4" />
        Falhas durante a execução
      </p>
      <ul className="space-y-2 text-xs text-danger/90">
        {failures.map((failure) => (
          <li key={failure.tenantId}>
            <strong>{failure.tenantName || failure.tenantId}</strong>
            {failure.error ? `: ${failure.error}` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}

function fetchAllTenants() {
  return getAllTenants().then((response: TenantResponse) => {
    if (!response.success || !response.data) {
      throw new Error(response.error || "Não foi possível carregar tenants");
    }

    return response.data as TenantSummary[];
  });
}

function fetchAdminCausasLinkage() {
  return getAdminCausasLinkageSnapshot().then(
    (response: AdminCausasLinkageSnapshot) => {
      if (!response.success || !response.totals || !response.tenants) {
        throw new Error(
          response.error || "Não foi possível carregar o mapa de vínculo.",
        );
      }

      return response;
    },
  );
}

export function CausasAdminContent() {
  const {
    data: tenants,
    isLoading,
    error,
  } = useSWR("admin-causas-tenants", fetchAllTenants, {
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    focusThrottleInterval: 30000,
    keepPreviousData: true,
  });
  const {
    data: linkageSnapshot,
    isLoading: isLoadingLinkage,
    error: linkageError,
    mutate: mutateLinkage,
  } = useSWR("admin-causas-linkage", fetchAdminCausasLinkage, {
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    focusThrottleInterval: 30000,
    keepPreviousData: true,
  });

  const tenantList: TenantSummary[] = tenants ?? [];
  const linkageTenants = linkageSnapshot?.tenants ?? [];
  const [targetTenantId, setTargetTenantId] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncAllTenants, setSyncAllTenants] = useState(false);
  const [lastResult, setLastResult] = useState<CausasOficiaisSyncResult | null>(
    null,
  );
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => {
    if (!targetTenantId && tenantList.length > 0) {
      const activeTenantId = tenantList.find(
        (tenant) => tenant.status === "ACTIVE",
      )?.id;

      setTargetTenantId(activeTenantId ?? tenantList[0].id);
    }
  }, [tenantList, targetTenantId]);

  const selectedTenant = useMemo(
    () => tenantList.find((tenant) => tenant.id === targetTenantId) ?? null,
    [tenantList, targetTenantId],
  );
  const selectedTenantLinkage = useMemo(
    () =>
      linkageTenants.find((tenant) => tenant.tenantId === targetTenantId) ??
      null,
    [linkageTenants, targetTenantId],
  );
  const featuredLinkageTenants = useMemo(
    () =>
      linkageTenants
        .filter((tenant) => tenant.catalogCount > 0 || tenant.hasOperationalImpact)
        .slice(0, 6),
    [linkageTenants],
  );

  const activeTenants = tenantList.filter(
    (tenant) => tenant.status === "ACTIVE",
  ).length;
  const suspendedTenants = tenantList.filter(
    (tenant) => tenant.status === "SUSPENDED",
  ).length;
  const cancelledTenants = tenantList.filter(
    (tenant) => tenant.status === "CANCELLED",
  ).length;

  const validSelectedTenantId = tenantList.some(
    (tenant) => tenant.id === targetTenantId,
  )
    ? targetTenantId
    : "";

  const selectedTenantKeys = useMemo(
    () =>
      validSelectedTenantId
        ? new Set([validSelectedTenantId])
        : new Set<string>(),
    [validSelectedTenantId],
  );
  const tenantDestinationOptions = useMemo(
    () =>
      tenantList.map((tenant) => ({
        key: tenant.id,
        label: tenant.name,
        textValue: [tenant.name, tenant.slug, tenant.status]
          .filter(Boolean)
          .join(" "),
        description: tenant.slug,
        endContent: (
          <Chip
            color={getTenantStatusColor(tenant.status)}
            size="sm"
            variant="flat"
          >
            {getTenantStatusLabel(tenant.status)}
          </Chip>
        ),
      })),
    [tenantList],
  );

  const receivedCount =
    lastResult?.fontesOficiaisRecebidas ?? lastResult?.total ?? 0;
  const usedCount = lastResult?.fontesOficiaisUsadas ?? lastResult?.total ?? 0;
  const processedTenants =
    lastResult?.scope === "global" ? (lastResult.totalTenants ?? 0) : 1;
  const tenantResults = lastResult?.tenantResults ?? [];
  const successfulTenantResults = tenantResults.filter(
    (tenant) => tenant.success,
  ).length;
  const failedTenantResults = tenantResults.filter(
    (tenant) => !tenant.success,
  ).length;
  const linkageTotals = linkageSnapshot?.totals;
  const clientAreaImpactCount = linkageTotals?.clientCount ?? 0;
  const clientAreaProcessCount = linkageTotals?.clientProcessCount ?? 0;
  const selectedTenantImpactCount =
    getTenantOperationalImpact(selectedTenantLinkage);

  const handleSync = useCallback(async () => {
    if (!syncAllTenants && !targetTenantId) {
      toast.error("Selecione um escritório antes de sincronizar.");
      return;
    }

    setIsSyncing(true);
    setLastResult(null);
    setLastError(null);

    try {
      const result = await syncCausasOficiais(
        syncAllTenants ? null : targetTenantId,
        syncAllTenants,
      );

      if (!result.success) {
        const retryText =
          typeof result.retryAfterSeconds === "number" &&
          result.retryAfterSeconds > 0
            ? ` Aguarde ${result.retryAfterSeconds}s e tente novamente.`
            : "";
        const extraLabel =
          result.errorCode === "SYNC_ALREADY_RUNNING"
            ? "Sincronização já em andamento."
            : result.errorCode === "SYNC_COOLDOWN_BLOCKED"
              ? "Sincronizações estão em contenção para segurança."
              : "";
        const message =
          `${result.error || "Erro ao sincronizar causas oficiais."} ${extraLabel}${retryText}`.trim();
        setLastError(message);
        toast.error(message);
        return;
      }

      setLastResult(result);
      void mutateLinkage();

      const scopeLabel =
        result.scope === "global"
          ? `${result.totalTenants ?? 0} escritório(s)`
          : (result.tenant?.nome ?? targetTenantId);

      const toastReceivedCount =
        result.fontesOficiaisRecebidas ?? result.total ?? 0;
      const toastUsedCount = result.fontesOficiaisUsadas ?? result.total ?? 0;

      toast.success(
        `Sincronização concluída para ${scopeLabel}. ${toastReceivedCount} oficiais recebidas, ${toastUsedCount} processadas. ${result.criadas} criadas, ${result.atualizadas} atualizadas, ${result.ignoradas ?? 0} ignoradas.`,
      );
    } catch (syncError) {
      const message =
        syncError instanceof Error
          ? syncError.message
          : "Falha ao executar sincronização de causas oficiais.";

      setLastError(message);
      toast.error(message);
    } finally {
      setIsSyncing(false);
    }
  }, [mutateLinkage, syncAllTenants, targetTenantId]);

  const handleTargetTenantChange = useCallback((value: unknown) => {
    const next = getSingleSelectionKey(value);

    if (next) {
      setTargetTenantId(next);
      setLastResult(null);
      setLastError(null);
    }
  }, []);

  return (
    <section className="space-y-6">
      <PeoplePageHeader
        tag="Operação sistêmica"
        title="Sincronização de causas oficiais"
        description="Este módulo não replica o CRUD do tenant. Ele existe para operar o catálogo oficial de causas em escala, validar onde o catálogo impacta o produto e abrir o tenant correto quando houver desvio."
        actions={
          <>
            <Tooltip content="Fonte oficial consumida pelo sync.">
              <Button
                as="a"
                href="/api/causas-oficiais/cnj"
                radius="full"
                size="sm"
                target="_blank"
                variant="flat"
              >
                Fonte CNJ
              </Button>
            </Tooltip>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <PeopleMetricCard
          helper="Tenants aptos a receber catálogo"
          icon={<Building2 className="h-4 w-4" />}
          label="Escritórios ativos"
          tone="success"
          value={isLoading ? "..." : activeTenants}
        />
        <PeopleMetricCard
          helper="Contenção operacional ou financeira"
          icon={<ShieldAlert className="h-4 w-4" />}
          label="Suspensos"
          tone="warning"
          value={isLoading ? "..." : suspendedTenants}
        />
        <PeopleMetricCard
          helper="Base descontinuada"
          icon={<UserX className="h-4 w-4" />}
          label="Cancelados"
          tone="danger"
          value={isLoading ? "..." : cancelledTenants}
        />
        <PeopleMetricCard
          helper={
            lastResult
              ? "Escritórios processados na última execução"
              : "Aguardando primeira sincronização"
          }
          icon={<Workflow className="h-4 w-4" />}
          label="Último lote"
          tone={lastResult ? "primary" : "default"}
          value={lastResult ? processedTenants : "—"}
        />
      </div>

      <PeoplePanel
        title="Papel deste módulo no produto"
        description="A governança do catálogo acontece no tenant. O admin existe para sincronizar a fonte oficial, medir impacto operacional e apontar o tenant certo quando houver inconsistência."
      >
        <div className="grid gap-4 xl:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-background/40 p-4">
            <p className="text-sm font-semibold text-foreground">
              Área do tenant
            </p>
            <p className="mt-2 text-sm text-default-400">
              O escritório gerencia o catálogo em <strong>/causas</strong>. É
              essa base que abastece processos, diligências, petições e o
              classificador documental.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {["/causas", "/processos", "/documentos", "/diligencias", "/peticoes"].map(
                (route) => (
                  <Chip key={route} size="sm" variant="bordered">
                    {route}
                  </Chip>
                ),
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-background/40 p-4">
            <p className="text-sm font-semibold text-foreground">
              Área administrativa
            </p>
            <p className="mt-2 text-sm text-default-400">
              Aqui o Super Admin não cadastra causas manualmente. Ele opera o
              sync oficial CNJ, monitora quais escritórios dependem do catálogo
              e entra no tenant certo quando houver falha.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Chip color="primary" size="sm" variant="flat">
                {formatNumber(linkageTotals?.tenantsWithCatalog ?? 0)} tenants
                com catálogo
              </Chip>
              <Chip size="sm" variant="bordered">
                {formatNumber(linkageTotals?.catalogCount ?? 0)} causas
                catalogadas
              </Chip>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-background/40 p-4">
            <p className="text-sm font-semibold text-foreground">
              Área do cliente
            </p>
            <p className="mt-2 text-sm text-default-400">
              O cliente não edita causas. O impacto é indireto, via processos já
              classificados e documentos associados no escritório.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Chip color="success" size="sm" variant="flat">
                {formatNumber(clientAreaImpactCount)} clientes impactados
              </Chip>
              <Chip size="sm" variant="bordered">
                {formatNumber(clientAreaProcessCount)} processos com causa
              </Chip>
            </div>
          </div>
        </div>
      </PeoplePanel>

      <PeoplePanel
        title="Mapa de vínculo do catálogo"
        description="Contagens reais de onde o catálogo de causas já está acoplado no produto. Isso valida a necessidade do módulo admin como operação global e não como tela duplicada."
      >
        {linkageError ? (
          <div className="rounded-2xl border border-danger/20 bg-danger/5 p-4 text-sm text-danger">
            Não foi possível carregar o mapa de vínculo:{" "}
            {(linkageError as Error).message}
          </div>
        ) : !linkageSnapshot || !linkageTotals ? (
          <PeopleEmptyState
            title="Carregando vínculo do catálogo"
            description="Buscando contagens reais de uso por tenant, processos e impacto indireto no cliente."
            icon={<Workflow className="h-5 w-5" />}
          />
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <PeopleMetricCard
                helper="Escritórios com catálogo de causas existente"
                icon={<Building2 className="h-4 w-4" />}
                label="Tenants com catálogo"
                tone="primary"
                value={formatNumber(linkageTotals.tenantsWithCatalog)}
              />
              <PeopleMetricCard
                helper="Itens no catálogo multi-tenant"
                icon={<Database className="h-4 w-4" />}
                label="Causas catalogadas"
                tone="secondary"
                value={formatNumber(linkageTotals.catalogCount)}
              />
              <PeopleMetricCard
                helper="Processos já vinculados a causas"
                icon={<Workflow className="h-4 w-4" />}
                label="Processos classificados"
                tone="success"
                value={formatNumber(linkageTotals.processCount)}
              />
              <PeopleMetricCard
                helper="Diligências, petições, prazos e contratos que dependem da causa"
                icon={<UserCheck className="h-4 w-4" />}
                label="Fluxos dependentes"
                tone="warning"
                value={formatNumber(
                  linkageTotals.diligenciaCount +
                    linkageTotals.peticaoCount +
                    linkageTotals.prazoCount +
                    linkageTotals.contractDocumentCount,
                )}
              />
              <PeopleMetricCard
                helper="Clientes com processos já classificados"
                icon={<UserCheck className="h-4 w-4" />}
                label="Impacto no cliente"
                tone="success"
                value={formatNumber(linkageTotals.clientCount)}
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr),420px]">
              <div className="rounded-2xl border border-white/10 bg-background/40 p-4">
                <p className="text-sm font-semibold text-foreground">
                  Escritório em foco
                </p>
                {selectedTenant && selectedTenantLinkage ? (
                  <div className="mt-4 space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-foreground">
                          {selectedTenantLinkage.tenantName} (
                          {selectedTenantLinkage.tenantSlug})
                        </p>
                        <p className="mt-1 text-sm text-default-400">
                          Catálogo local com{" "}
                          {formatNumber(selectedTenantLinkage.catalogCount)}{" "}
                          causas, sendo{" "}
                          {formatNumber(selectedTenantLinkage.officialCount)}{" "}
                          oficiais e{" "}
                          {formatNumber(selectedTenantLinkage.internalCount)}{" "}
                          internas.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Chip
                          color={getTenantStatusColor(
                            selectedTenantLinkage.tenantStatus,
                          )}
                          size="sm"
                          variant="flat"
                        >
                          {selectedTenantLinkage.tenantStatus}
                        </Chip>
                        <Button
                          as={NextLink}
                          color="primary"
                          href={`/admin/tenants/${selectedTenantLinkage.tenantId}`}
                          radius="full"
                          size="sm"
                          variant="flat"
                        >
                          Abrir tenant
                        </Button>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      <div className="rounded-xl border border-white/10 bg-background/50 p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-default-500">
                          Processos
                        </p>
                        <p className="mt-2 text-lg font-semibold text-foreground">
                          {formatNumber(selectedTenantLinkage.processCount)}
                        </p>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-background/50 p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-default-500">
                          Diligências
                        </p>
                        <p className="mt-2 text-lg font-semibold text-foreground">
                          {formatNumber(selectedTenantLinkage.diligenciaCount)}
                        </p>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-background/50 p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-default-500">
                          Petições
                        </p>
                        <p className="mt-2 text-lg font-semibold text-foreground">
                          {formatNumber(selectedTenantLinkage.peticaoCount)}
                        </p>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-background/50 p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-default-500">
                          Prazos
                        </p>
                        <p className="mt-2 text-lg font-semibold text-foreground">
                          {formatNumber(selectedTenantLinkage.prazoCount)}
                        </p>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-background/50 p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-default-500">
                          Docs/contratos
                        </p>
                        <p className="mt-2 text-lg font-semibold text-foreground">
                          {formatNumber(
                            selectedTenantLinkage.contractDocumentCount,
                          )}
                        </p>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-background/50 p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-default-500">
                          Cliente impactado
                        </p>
                        <p className="mt-2 text-lg font-semibold text-foreground">
                          {formatNumber(selectedTenantLinkage.clientCount)}
                        </p>
                        <p className="mt-1 text-xs text-default-500">
                          {formatNumber(selectedTenantLinkage.clientProcessCount)}{" "}
                          processos classificados
                        </p>
                      </div>
                    </div>

                    <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm text-default-300">
                      Impacto operacional estimado:{" "}
                      <strong className="text-foreground">
                        {formatNumber(selectedTenantImpactCount)}
                      </strong>{" "}
                      vínculos ativos downstream.
                    </div>
                  </div>
                ) : (
                  <PeopleEmptyState
                    title="Selecione um escritório"
                    description="Escolha um tenant no comando de sincronização para ver o impacto real do catálogo naquele escritório."
                    icon={<Building2 className="h-5 w-5" />}
                  />
                )}
              </div>

              <div className="rounded-2xl border border-white/10 bg-background/40 p-4">
                <p className="text-sm font-semibold text-foreground">
                  Tenants mais dependentes
                </p>
                <p className="mt-1 text-sm text-default-400">
                  Escritórios com maior uso operacional do catálogo e atalho
                  direto para gestão administrativa.
                </p>
                <div className="mt-4 space-y-3">
                  {featuredLinkageTenants.length ? (
                    featuredLinkageTenants.map((tenant) => (
                      <div
                        key={tenant.tenantId}
                        className="rounded-xl border border-white/10 bg-background/50 p-3"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-medium text-foreground">
                              {tenant.tenantName}
                            </p>
                            <p className="mt-1 text-xs text-default-500">
                              {tenant.tenantSlug} • {tenant.catalogCount} causas
                            </p>
                          </div>
                          <Button
                            as={NextLink}
                            href={`/admin/tenants/${tenant.tenantId}`}
                            radius="full"
                            size="sm"
                            variant="bordered"
                          >
                            Gerenciar
                          </Button>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Chip size="sm" variant="flat">
                            Processos {formatNumber(tenant.processCount)}
                          </Chip>
                          <Chip size="sm" variant="flat">
                            Fluxos{" "}
                            {formatNumber(
                              tenant.diligenciaCount +
                                tenant.peticaoCount +
                                tenant.prazoCount +
                                tenant.contractDocumentCount,
                            )}
                          </Chip>
                          <Chip
                            color={tenant.clientCount > 0 ? "success" : "default"}
                            size="sm"
                            variant="flat"
                          >
                            Clientes {formatNumber(tenant.clientCount)}
                          </Chip>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-default-400">
                      Ainda não há tenants com uso operacional relevante do
                      catálogo.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </PeoplePanel>

      <PeoplePanel
        title="Comando de sincronização"
        description="Escolha um escritório específico para operação dirigida ou dispare um lote global. O resultado mais recente permanece visível abaixo durante toda a sessão."
        actions={
          <Tooltip content="Executa o catálogo oficial para o alvo atual e registra o resumo desta sessão.">
            <Button
              color="primary"
              isDisabled={
                isLoading || isSyncing || (!syncAllTenants && !targetTenantId)
              }
              isLoading={isSyncing}
              radius="full"
              startContent={<Database className="h-4 w-4" />}
              onPress={handleSync}
            >
              {syncAllTenants
                ? "Sincronizar todos os escritórios"
                : "Sincronizar escritório"}
            </Button>
          </Tooltip>
        }
      >
        {error ? (
          <div className="rounded-2xl border border-danger/20 bg-danger/5 p-4 text-sm text-danger">
            Não foi possível carregar os escritórios: {(error as Error).message}
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr),auto] lg:items-start">
              <SearchableSelect
                className="w-full max-w-xl"
                emptyContent="Nenhum escritório encontrado"
                isDisabled={syncAllTenants || isLoading}
                isClearable={false}
                items={tenantDestinationOptions}
                label="Escritório destino"
                placeholder={
                  isLoading
                    ? "Carregando escritórios..."
                    : "Escolha um escritório"
                }
                selectedKey={
                  selectedTenantKeys.size > 0 ? validSelectedTenantId : null
                }
                onSelectionChange={handleTargetTenantChange}
              />

              <div className="rounded-2xl border border-white/10 bg-background/40 px-4 py-3">
                <Switch
                  isSelected={syncAllTenants}
                  onValueChange={setSyncAllTenants}
                >
                  Sincronizar todos os escritórios
                </Switch>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-background/40 p-4">
              {syncAllTenants ? (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-foreground">
                    Escopo atual: lote global
                  </p>
                  <p className="text-sm text-default-400">
                    O sync vai percorrer todos os escritórios elegíveis da base.
                    Suspensos e cancelados continuam visíveis no painel para
                    leitura operacional, mas o foco de execução permanece na
                    base ativa.
                  </p>
                </div>
              ) : selectedTenant ? (
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      Escritório selecionado
                    </p>
                    <p className="mt-1 text-sm text-default-400">
                      {selectedTenant.name} ({selectedTenant.slug})
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Chip
                      color={getTenantStatusColor(selectedTenant.status)}
                      size="sm"
                      variant="flat"
                    >
                      {selectedTenant.status}
                    </Chip>
                    <Chip size="sm" variant="bordered">
                      ID {selectedTenant.id.slice(0, 8)}
                    </Chip>
                    <Button
                      as={NextLink}
                      href={`/admin/tenants/${selectedTenant.id}`}
                      radius="full"
                      size="sm"
                      variant="bordered"
                    >
                      Gerenciar tenant
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-default-400">
                  Selecione um escritório para habilitar a sincronização
                  dirigida.
                </p>
              )}
            </div>
          </div>
        )}
      </PeoplePanel>

      <PeoplePanel
        title="Resumo da última execução"
        description="Leitura operacional da execução mais recente desta sessão, com recorte por escritório quando o escopo for global."
      >
        {!lastResult && !lastError ? (
          <PeopleEmptyState
            title="Nenhuma sincronização executada ainda"
            description="Dispare um sync para visualizar quantas causas oficiais foram recebidas, quantas entraram no catálogo e onde houve falha."
            icon={<Database className="h-5 w-5" />}
          />
        ) : lastError ? (
          <div className="rounded-2xl border border-danger/20 bg-danger/5 p-4 text-sm text-danger">
            <p className="font-semibold">Falha</p>
            <p className="mt-1">{lastError}</p>
          </div>
        ) : lastResult ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <PeopleMetricCard
                helper="Resposta recebida da fonte oficial"
                icon={<Database className="h-4 w-4" />}
                label="Oficiais recebidas"
                tone="primary"
                value={formatNumber(receivedCount)}
              />
              <PeopleMetricCard
                helper="Itens aplicáveis neste sync"
                icon={<Workflow className="h-4 w-4" />}
                label="Processadas"
                tone="success"
                value={formatNumber(usedCount)}
              />
              <PeopleMetricCard
                helper="Novos registros inseridos"
                icon={<UserCheck className="h-4 w-4" />}
                label="Criadas"
                tone="success"
                value={formatNumber(lastResult.criadas)}
              />
              <PeopleMetricCard
                helper="Registros revisados no catálogo"
                icon={<CheckCircle2 className="h-4 w-4" />}
                label="Atualizadas"
                tone="secondary"
                value={formatNumber(lastResult.atualizadas)}
              />
              <PeopleMetricCard
                helper="Itens descartados ou sem efeito"
                icon={<AlertTriangle className="h-4 w-4" />}
                label="Ignoradas"
                tone={lastResult.ignoradas > 0 ? "warning" : "default"}
                value={formatNumber(lastResult.ignoradas)}
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr),320px]">
              <div className="rounded-2xl border border-white/10 bg-background/40 p-4">
                <p className="text-sm font-semibold text-foreground">
                  Origem da execução
                </p>
                <div className="mt-3 space-y-2 text-sm text-default-400">
                  <p>
                    <strong className="text-foreground">Escopo:</strong>{" "}
                    {lastResult.scope === "global" ? "Global" : "Escritório"}
                  </p>
                  <p>
                    <strong className="text-foreground">Fonte oficial:</strong>{" "}
                    <span className="text-default-200">
                      {lastResult.fontesOficiaisInfo?.source ?? "cnj-oficial"}
                    </span>
                  </p>
                  <p>
                    <strong className="text-foreground">URL solicitada:</strong>{" "}
                    <Link
                      className="text-primary"
                      href={
                        lastResult.fontesOficiaisInfo?.requestedUrl ??
                        "/api/causas-oficiais/cnj"
                      }
                      isExternal
                    >
                      {lastResult.fontesOficiaisInfo?.requestedUrl ??
                        "/api/causas-oficiais/cnj"}
                    </Link>
                  </p>
                  <p>
                    <strong className="text-foreground">
                      Escritórios processados:
                    </strong>{" "}
                    {lastResult.scope === "global"
                      ? (lastResult.totalTenants ?? 0)
                      : 1}
                  </p>
                </div>

                {lastResult.fontesOficiaisInfo?.usedFallback ? (
                  <div className="mt-4 rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm text-warning-foreground">
                    Sincronização executada com fallback local.
                  </div>
                ) : null}

                {lastResult.scope !== "global" && lastResult.tenant ? (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Chip color="primary" size="sm" variant="flat">
                      {lastResult.tenant.nome}
                    </Chip>
                    <Chip size="sm" variant="bordered">
                      {lastResult.tenant.slug}
                    </Chip>
                  </div>
                ) : null}
              </div>

              <div className="rounded-2xl border border-white/10 bg-background/40 p-4">
                <p className="text-sm font-semibold text-foreground">
                  Resultado por escritório
                </p>
                <div className="mt-3 grid gap-3">
                  <div className="rounded-xl border border-success/20 bg-success/5 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-success/80">
                      Concluídos com sucesso
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-success">
                      {lastResult.scope === "global"
                        ? successfulTenantResults
                        : lastResult.tenantResults?.[0]?.success
                          ? 1
                          : 0}
                    </p>
                  </div>
                  <div className="rounded-xl border border-danger/20 bg-danger/5 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-danger/80">
                      Falhas
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-danger">
                      {lastResult.scope === "global"
                        ? failedTenantResults
                        : lastResult.tenantResults?.[0]?.success
                          ? 0
                          : 1}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {tenantResults.length > 0 ? (
              <div className="space-y-3">
                <p className="text-sm font-semibold text-foreground">
                  Detalhe por escritório
                </p>
                <div className="grid gap-3 xl:grid-cols-2">
                  {tenantResults.map((tenant) => (
                    <div
                      key={tenant.tenantId}
                      className="rounded-2xl border border-white/10 bg-background/40 p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-foreground">
                            {tenant.tenantName} ({tenant.tenantSlug})
                          </p>
                          <p className="mt-1 text-xs text-default-500">
                            Tempo de execução:{" "}
                            {formatDuration(tenant.executionDurationMs)}
                          </p>
                        </div>
                        <Chip
                          color={tenant.success ? "success" : "danger"}
                          size="sm"
                          variant="flat"
                        >
                          {tenant.success ? "Concluído" : "Falhou"}
                        </Chip>
                        <Button
                          as={NextLink}
                          href={`/admin/tenants/${tenant.tenantId}`}
                          radius="full"
                          size="sm"
                          variant="bordered"
                        >
                          Abrir tenant
                        </Button>
                      </div>

                      {tenant.success ? (
                        <p className="mt-3 inline-flex items-center gap-2 text-sm text-success">
                          <CheckCircle2 className="h-4 w-4" />
                          {getTenantSyncLabel(tenant)}
                        </p>
                      ) : (
                        <p className="mt-3 inline-flex items-center gap-2 text-sm text-danger">
                          <UserX className="h-4 w-4" />
                          {tenant.error || "Falha sem mensagem detalhada."}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {lastResult.warnings?.tenantResults?.length ? (
              <FailureListItem failures={lastResult.warnings.tenantResults} />
            ) : null}
          </div>
        ) : null}
      </PeoplePanel>
    </section>
  );
}
