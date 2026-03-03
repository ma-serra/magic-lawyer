"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import {
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  UserCheck,
  UserX,
} from "lucide-react";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Divider,
  Select,
  SelectItem,
  Switch,
} from "@heroui/react";
import { Link } from "@heroui/link";

import { getAllTenants, type TenantResponse } from "@/app/actions/admin";
import {
  CausaSyncFailureSummaryRow,
  CausasOficiaisSyncResult,
  CausaSyncTenantResult,
  syncCausasOficiais,
} from "@/app/actions/causas";
import { title, subtitle } from "@/components/primitives";
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

function getTenantSyncLabel(sync: CausaSyncTenantResult) {
  if (!sync.success) {
    return `${formatNumber(sync.criadas)} novas, ${formatNumber(sync.atualizadas)} atualizadas, ${formatNumber(sync.ignoradas)} ignoradas`;
  }

  return `${formatNumber(sync.criadas)} novas, ${formatNumber(sync.atualizadas)} atualizadas, ${formatNumber(sync.ignoradas)} ignoradas`;
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
    <div className="rounded-xl border border-danger/20 bg-danger/5 p-3 text-sm text-danger">
      <p className="mb-2 flex items-center gap-2 font-semibold">
        <AlertTriangle className="h-4 w-4" />
        Falhas durante a execução
      </p>
      <ul className="space-y-1 text-xs text-danger/90">
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

export function CausasAdminContent() {
  const {
    data: tenants,
    isLoading,
    error,
    mutate,
  } = useSWR("admin-causas-tenants", fetchAllTenants, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    keepPreviousData: true,
  });

  const tenantList: TenantSummary[] = tenants ?? [];
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

      const scopeLabel =
        result.scope === "global"
          ? `${result.totalTenants ?? 0} escritório(s)`
          : (result.tenant?.nome ?? targetTenantId);

      const receivedCount = result.fontesOficiaisRecebidas ?? result.total ?? 0;
      const usedCount = result.fontesOficiaisUsadas ?? result.total ?? 0;

      toast.success(
        `Sincronização concluída para ${scopeLabel}. ${receivedCount} oficiais recebidas, ${usedCount} processadas. ${result.criadas} criadas, ${result.atualizadas} atualizadas, ${result.ignoradas ?? 0} ignoradas.`,
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Falha ao executar sincronização de causas oficiais.";

      setLastError(message);
      toast.error(message);
    } finally {
      setIsSyncing(false);
    }
  }, [targetTenantId, syncAllTenants]);

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
      <header className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-primary">
          Sistema
        </p>
        <h1 className={title({ size: "lg", color: "blue" })}>
          Causas Oficiais
        </h1>
        <p className={subtitle({ fullWidth: true })}>
          Sincronize o catálogo oficial de causas por escritório usando a origem
          CNJ.
        </p>
      </header>

      <Card className="border border-white/10 bg-background/70">
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-lg font-semibold">Sincronizar causas oficiais</p>
            <p className="text-sm text-default-400">
              Fonte padrão:&nbsp;
              <Link href="/api/causas-oficiais/cnj" isExternal>
                /api/causas-oficiais/cnj
              </Link>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="flat"
              onPress={() => void mutate()}
              isLoading={isLoading}
              isDisabled={isLoading}
              startContent={<RefreshCw className="h-4 w-4" />}
            >
              Atualizar lista
            </Button>
          </div>
        </CardHeader>
        <Divider className="border-white/10" />
        <CardBody className="space-y-5">
          {error ? (
            <p className="text-sm text-danger">
              Não foi possível carregar os escritórios:{" "}
              {(error as Error).message}
            </p>
          ) : (
            <div className="grid gap-4 md:grid-cols-[1fr_auto]">
              <Select
                className="w-full max-w-md"
                label="Escritório destino"
                isDisabled={syncAllTenants}
                placeholder={
                  isLoading
                    ? "Carregando escritórios..."
                    : "Escolha um escritório"
                }
                selectedKeys={
                  targetTenantId ? new Set([targetTenantId]) : new Set()
                }
                onSelectionChange={handleTargetTenantChange}
              >
                {tenantList.map((tenant) => (
                  <SelectItem
                    key={tenant.id}
                    textValue={`${tenant.name} (${tenant.slug})`}
                  >
                    {tenant.name} ({tenant.slug})
                  </SelectItem>
                ))}
              </Select>
              <div className="mt-1 flex items-center gap-2">
                <Switch
                  isSelected={syncAllTenants}
                  onValueChange={setSyncAllTenants}
                >
                  Sincronizar todos os escritórios
                </Switch>
              </div>

              <Button
                color="primary"
                isLoading={isSyncing}
                isDisabled={
                  (syncAllTenants ? false : !targetTenantId) ||
                  isLoading ||
                  isSyncing
                }
                onPress={handleSync}
              >
                Sincronizar catálogo oficial
              </Button>
            </div>
          )}

          {!syncAllTenants && selectedTenant ? (
            <div className="rounded-xl border border-white/10 bg-background/40 p-4">
              <p className="text-sm font-semibold text-foreground">
                Escritório selecionado
              </p>
              <div className="mt-2 grid gap-1 text-sm text-default-400 sm:grid-cols-3">
                <p>Nome: {selectedTenant.name}</p>
                <p>Slug: {selectedTenant.slug}</p>
                <p>Status: {selectedTenant.status}</p>
              </div>
            </div>
          ) : null}
        </CardBody>
      </Card>

      <Card className="border border-white/10 bg-background/70">
        <CardHeader>
          <div>
            <p className="text-lg font-semibold">Último resultado</p>
            <p className="text-sm text-default-400">
              Resumo da última execução desta sessão.
            </p>
          </div>
        </CardHeader>
        <Divider className="border-white/10" />
        <CardBody className="space-y-4">
          {!lastResult && !lastError ? (
            <p className="text-sm text-default-400">
              Nenhuma sincronização executada ainda nesta sessão.
            </p>
          ) : lastError ? (
            <div className="rounded-lg border border-danger/20 bg-danger/5 p-3 text-sm text-danger">
              <p className="font-semibold">Falha</p>
              <p>{lastError}</p>
            </div>
          ) : lastResult ? (
            <div className="space-y-4 text-sm text-default-400">
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                <p>
                  <strong className="text-foreground">Escopo:</strong>{" "}
                  <span className="text-default-100">
                    {lastResult.scope === "global" ? "Global" : "Escritório"}
                  </span>
                </p>
                <p>
                  <strong className="text-foreground">
                    Fontes oficiais recebidas:
                  </strong>{" "}
                  {formatNumber(
                    lastResult.fontesOficiaisRecebidas ?? lastResult.total ?? 0,
                  )}
                </p>
                <p>
                  <strong className="text-foreground">
                    Aplicáveis no sync:
                  </strong>{" "}
                  {formatNumber(
                    lastResult.fontesOficiaisUsadas ?? lastResult.total ?? 0,
                  )}
                </p>
                <p>
                  <strong className="text-foreground">Novas:</strong>{" "}
                  {formatNumber(lastResult.criadas)}
                </p>
                <p>
                  <strong className="text-foreground">Atualizadas:</strong>{" "}
                  {formatNumber(lastResult.atualizadas)}
                </p>
              </div>

              <p>
                <strong className="text-foreground">Fonte oficial:</strong>{" "}
                <span className="text-default-200">
                  {lastResult.fontesOficiaisInfo?.source ?? "cnj-oficial"}
                </span>
                <span className="ml-1 text-default-400">
                  (
                  {lastResult.fontesOficiaisInfo?.requestedUrl ??
                    "/api/causas-oficiais/cnj"}
                  )
                </span>
              </p>

              {lastResult.fontesOficiaisInfo?.usedFallback ? (
                <p className="rounded-md border border-warning/30 bg-warning/10 p-2 text-warning-foreground">
                  Sincronização executada com fallback local.
                </p>
              ) : null}

              {lastResult.scope === "global" && lastResult.tenant ? null : (
                <p>
                  Escritório: <strong>{lastResult.tenant?.nome ?? "-"}</strong>{" "}
                  ({lastResult.tenant?.slug ?? "-"})
                </p>
              )}

              <p>
                Total aplicável: {formatNumber(lastResult.total)} · Ignoradas:{" "}
                {formatNumber(lastResult.ignoradas)} ·{" "}
                {lastResult.scope === "global"
                  ? `Escritórios processados: ${lastResult.totalTenants ?? 0}`
                  : "Processado"}
              </p>

              {lastResult.scope === "global" && lastResult.totalTenants ? (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-foreground">
                    Detalhe por escritório
                  </p>
                  <div className="overflow-x-auto rounded-lg border border-white/10 bg-background/50">
                    <table className="min-w-full table-fixed text-xs">
                      <thead>
                        <tr className="text-default-400">
                          <th className="px-3 py-2 text-left font-semibold">
                            Escritório
                          </th>
                          <th className="px-3 py-2 text-left font-semibold">
                            Resultado
                          </th>
                          <th className="px-3 py-2 text-left font-semibold">
                            Tempo
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {(lastResult.tenantResults ?? []).map((tenant) => (
                          <tr
                            key={tenant.tenantId}
                            className="border-t border-white/10"
                          >
                            <td className="px-3 py-2">
                              {tenant.tenantName} ({tenant.tenantSlug})
                            </td>
                            <td className="px-3 py-2">
                              {tenant.success ? (
                                <span className="inline-flex items-center gap-1 text-success">
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  {getTenantSyncLabel(tenant)}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-danger">
                                  <UserX className="h-3.5 w-3.5" />
                                  Falhou
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-default-300">
                              {tenant.executionDurationMs}ms
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              {lastResult.scope === "tenant" &&
              lastResult.tenantResults?.[0] ? (
                <p className="inline-flex items-center gap-2 text-success">
                  <UserCheck className="h-4 w-4" />
                  Estado atual:{" "}
                  {lastResult.tenantResults?.[0]?.success
                    ? "Sincronizado com sucesso"
                    : "Falha"}
                </p>
              ) : null}

              {lastResult.warnings?.tenantResults?.length ? (
                <FailureListItem failures={lastResult.warnings.tenantResults} />
              ) : null}
            </div>
          ) : null}
        </CardBody>
      </Card>
    </section>
  );
}
