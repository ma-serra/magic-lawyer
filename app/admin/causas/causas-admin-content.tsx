"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { RefreshCw } from "lucide-react";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Divider,
  Select,
  SelectItem,
} from "@heroui/react";
import { Link } from "@heroui/link";

import { getAllTenants, type TenantResponse } from "@/app/actions/admin";
import { syncCausasOficiais } from "@/app/actions/causas";
import { title, subtitle } from "@/components/primitives";
import { toast } from "@/lib/toast";

type TenantStatus = "ACTIVE" | "SUSPENDED" | "CANCELLED" | (string & {});

interface TenantSummary {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
}

interface SyncCausaResult {
  tenantId: string;
  criadas: number;
  atualizadas: number;
  total: number;
  tenant?: {
    nome?: string | null;
    slug?: string | null;
    status?: string | null;
  } | null;
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

function fetchAllTenants() {
  return getAllTenants().then((response: TenantResponse) => {
    if (!response.success || !response.data) {
      throw new Error(response.error || "Não foi possível carregar tenants");
    }

    return response.data as TenantSummary[];
  });
}

export function CausasAdminContent() {
  const { data: tenants, isLoading, error, mutate } = useSWR(
    "admin-causas-tenants",
    fetchAllTenants,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      keepPreviousData: true,
    },
  );

  const tenantList: TenantSummary[] = tenants ?? [];
  const [targetTenantId, setTargetTenantId] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastResult, setLastResult] = useState<SyncCausaResult | null>(null);
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
    if (!targetTenantId) {
      toast.error("Selecione um escritório antes de sincronizar.");
      return;
    }

    setIsSyncing(true);
    setLastResult(null);
    setLastError(null);

    try {
      const result = await syncCausasOficiais(targetTenantId);

      if (!result.success) {
        const message = result.error || "Erro ao sincronizar causas oficiais.";
        setLastError(message);
        toast.error(message);
        return;
      }

      const payload = result as SyncCausaResult;
      setLastResult(payload);
      toast.success(
        `Sincronização concluída para ${payload.tenant?.nome ?? targetTenantId}. ${payload.criadas} criadas, ${payload.atualizadas} atualizadas.`,
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
  }, [targetTenantId]);

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
        <h1 className={title({ size: "lg", color: "blue" })}>Causas Oficiais</h1>
        <p className={subtitle({ fullWidth: true })}>
          Sincronize o catálogo de causas CNJ por escritório a partir da origem oficial
          do sistema.
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
              Não foi possível carregar os escritórios: {(error as Error).message}
            </p>
          ) : (
            <div className="grid gap-4 md:grid-cols-[1fr_auto]">
              <Select
                className="w-full max-w-md"
                label="Escritório destino"
                placeholder={
                  isLoading ? "Carregando escritórios..." : "Escolha um escritório"
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

              <Button
                color="primary"
                isLoading={isSyncing}
                onPress={handleSync}
                isDisabled={!targetTenantId || isLoading}
              >
                Sincronizar catálogo oficial
              </Button>
            </div>
          )}

          {selectedTenant ? (
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
        <CardBody>
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
            <div className="space-y-1 text-sm text-default-400">
              <p>
                Tenant:{" "}
                <strong>{lastResult.tenant?.nome ?? "-"}</strong> (
                {lastResult.tenant?.slug ?? "-"})
              </p>
              <p>
                Status: {lastResult.tenant?.status ?? "-"} · Total recebido:{" "}
                {lastResult.total}
              </p>
              <p>
                Resultado: <strong>{lastResult.criadas}</strong> novas e{" "}
                <strong>{lastResult.atualizadas}</strong> atualizadas.
              </p>
            </div>
          ) : null}
        </CardBody>
      </Card>
    </section>
  );
}
