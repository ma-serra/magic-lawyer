"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Badge } from "@heroui/badge";
import { Button } from "@heroui/button";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Divider } from "@heroui/divider";
import {
  Skeleton,
  Tooltip,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Pagination,
} from "@heroui/react";
import { addToast } from "@heroui/toast";
import NextLink from "next/link";
import Image from "next/image";
import { Input } from "@heroui/input";
import { AnimatePresence, motion } from "framer-motion";
import { Search, Filter, RotateCcw, Copy, LifeBuoy } from "lucide-react";

import { getAllTenants, type TenantResponse } from "@/app/actions/admin";
import { REALTIME_POLLING } from "@/app/lib/realtime/polling-policy";
import { useRealtimeTenantStatus } from "@/app/hooks/use-realtime-tenant-status";
import {
  PeopleMetricCard,
  PeoplePageHeader,
  PeoplePanel,
} from "@/components/people-ui";
import {
  isPollingGloballyEnabled,
  resolvePollingInterval,
  subscribePollingControl,
  tracePollingAttempt,
} from "@/app/lib/realtime/polling-telemetry";

const statusLabel: Record<string, string> = {
  ACTIVE: "Ativo",
  SUSPENDED: "Suspenso",
  CANCELLED: "Cancelado",
};

const statusTone: Record<string, "success" | "warning" | "danger"> = {
  ACTIVE: "success",
  SUSPENDED: "warning",
  CANCELLED: "danger",
};

function fetchTenants() {
  return getAllTenants().then((response: TenantResponse) => {
    if (!response.success || !response.data) {
      throw new Error(response.error ?? "Não foi possível carregar os tenants");
    }

    return response.data as any[];
  });
}

function useTenantsData(data: any[] | undefined) {
  const tenants = data ?? [];

  const totals = useMemo(() => {
    const active = tenants.filter(
      (tenant) => tenant.status === "ACTIVE",
    ).length;
    const suspended = tenants.filter(
      (tenant) => tenant.status === "SUSPENDED",
    ).length;
    const cancelled = tenants.filter(
      (tenant) => tenant.status === "CANCELLED",
    ).length;

    return {
      total: tenants.length,
      active,
      suspended,
      cancelled,
    };
  }, [tenants]);

  return { tenants, totals };
}

function TenantsSkeleton() {
  return (
    <div className="space-y-6">
      <Card className="border border-white/10 bg-background/70">
        <CardHeader className="flex flex-col gap-2 pb-2 sm:flex-row sm:items-center sm:justify-between">
          <Skeleton className="h-6 w-56 rounded-lg" isLoaded={false} />
          <Skeleton className="h-9 w-36 rounded-full" isLoaded={false} />
        </CardHeader>
        <Divider className="border-white/10" />
        <CardBody className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton
              key={`stat-${index}`}
              className="h-20 w-full rounded-xl"
              isLoaded={false}
            />
          ))}
        </CardBody>
      </Card>

      {Array.from({ length: 3 }).map((_, index) => (
        <Card
          key={`tenant-${index}`}
          className="border border-white/10 bg-background/70"
        >
          <CardBody>
            <Skeleton className="h-16 w-full rounded-xl" isLoaded={false} />
          </CardBody>
        </Card>
      ))}
    </div>
  );
}

interface TenantCardProps {
  tenant: any;
  onOpenDetails: (tenant: any) => void;
}

function TenantCard({ tenant, onOpenDetails }: TenantCardProps) {
  const [showInternalData, setShowInternalData] = useState(false);
  const { status, statusChanged, isUpdating } = useRealtimeTenantStatus(
    tenant.id,
  );

  // Se tivermos status em tempo real, usar esse
  const tenantStatus = status?.status ?? tenant.status;
  const statusReason = status?.statusReason ?? null;

  // Animação quando o status muda
  const cardClassName = statusChanged
    ? "border border-white/10 bg-background/70 backdrop-blur transition hover:border-primary/40 animate-pulse border-green-500/50"
    : "border border-white/10 bg-background/70 backdrop-blur transition hover:border-primary/40";

  const handleCopy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      addToast({
        title: `${label} copiado`,
        description: "Valor copiado para a área de transferência.",
        color: "success",
      });
    } catch {
      addToast({
        title: "Falha ao copiar",
        description: "Não foi possível copiar agora. Tente novamente.",
        color: "danger",
      });
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      layout
    >
      <Card
        key={tenant.id}
        className={`${cardClassName} cursor-pointer`}
        role="button"
        tabIndex={0}
        onClick={(event) => {
          const target = event.target as HTMLElement;
          if (target.closest("[data-stop-card-press='true']")) return;
          onOpenDetails(tenant);
        }}
        onKeyDown={(event) => {
          const target = event.target as HTMLElement;
          if (target.closest("[data-stop-card-press='true']")) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onOpenDetails(tenant);
          }
        }}
      >
        <CardBody className="space-y-3">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-3">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/5">
                  {tenant.branding?.logoUrl ? (
                    <Image
                      alt={`Logo ${tenant.name}`}
                      height={56}
                      src={tenant.branding.logoUrl}
                      width={56}
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <span className="text-lg font-semibold text-foreground">
                      {tenant.name?.charAt(0)?.toUpperCase() ?? "?"}
                    </span>
                  )}
                </div>
                <div className="min-w-0 space-y-1">
                  <p className="text-lg font-semibold text-foreground">
                    {tenant.name}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    {statusReason ? (
                      <Tooltip content={statusReason}>
                        <Chip
                          className={statusChanged ? "animate-bounce" : ""}
                          color={statusTone[tenantStatus] ?? "secondary"}
                          size="sm"
                          variant="flat"
                        >
                          {statusLabel[tenantStatus] ?? tenantStatus}
                          {isUpdating && <span className="ml-1 text-xs">⟳</span>}
                        </Chip>
                      </Tooltip>
                    ) : (
                      <Chip
                        className={statusChanged ? "animate-bounce" : ""}
                        color={statusTone[tenantStatus] ?? "secondary"}
                        size="sm"
                        variant="flat"
                      >
                        {statusLabel[tenantStatus] ?? tenantStatus}
                        {isUpdating && <span className="ml-1 text-xs">⟳</span>}
                      </Chip>
                    )}
                    {tenant.plan?.name ? (
                      <Badge color="primary" variant="flat">
                        Plano {tenant.plan.name}
                      </Badge>
                    ) : (
                      <Chip size="sm" variant="flat">
                        Sem plano
                      </Chip>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-default-400">
                {tenant.email ? <span>Contato: {tenant.email}</span> : null}
                {tenant.telefone ? <span>• {tenant.telefone}</span> : null}
                {tenant.domain ? <span>• {tenant.domain}</span> : null}
              </div>
              <div className="flex flex-wrap gap-3 text-xs text-default-500">
                <span>{tenant.counts.usuarios} usuários</span>
                <span>• {tenant.counts.processos} processos</span>
                <span>• {tenant.counts.clientes} clientes</span>
                <span>
                  • Atualizado{" "}
                  {new Date(tenant.updatedAt).toLocaleDateString("pt-BR")}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                as={NextLink}
                color="primary"
                data-stop-card-press="true"
                href={`/admin/tenants/${tenant.id}`}
                radius="full"
                size="sm"
                variant="flat"
              >
                Gerenciar
              </Button>
              <Button
                as={NextLink}
                data-stop-card-press="true"
                href={`/admin/suporte?tenantId=${tenant.id}`}
                radius="full"
                size="sm"
                startContent={<LifeBuoy className="h-4 w-4" />}
                variant="bordered"
              >
                Suporte
              </Button>
              <Tooltip content="Copiar ID do tenant">
                <Button
                  isIconOnly
                  data-stop-card-press="true"
                  radius="full"
                  size="sm"
                  variant="light"
                  onPress={() => handleCopy(tenant.id, "ID do tenant")}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </Tooltip>
              <Button
                data-stop-card-press="true"
                radius="full"
                size="sm"
                variant="light"
                onPress={() => setShowInternalData((prev) => !prev)}
              >
                {showInternalData ? "Ocultar interno" : "Dados internos"}
              </Button>
            </div>
          </div>

          <AnimatePresence initial={false}>
            {showInternalData ? (
              <motion.div
                key={`internal-${tenant.id}`}
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="rounded-xl border border-warning/30 bg-warning/5 p-3">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-warning">
                    Uso interno de suporte
                  </p>
                  <div className="grid gap-2 text-xs text-default-400 sm:grid-cols-2 lg:grid-cols-3">
                    <span>ID: {tenant.id}</span>
                    <span>Slug: {tenant.slug}</span>
                    <span>Fuso: {tenant.timezone}</span>
                    <span>Criado: {new Date(tenant.createdAt).toLocaleString("pt-BR")}</span>
                    <span>Atualizado: {new Date(tenant.updatedAt).toLocaleString("pt-BR")}</span>
                    {tenant.superAdmin?.email ? (
                      <span>Owner: {tenant.superAdmin.email}</span>
                    ) : (
                      <span>Owner: não definido</span>
                    )}
                  </div>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </CardBody>
      </Card>
    </motion.div>
  );
}

export function TenantsContent() {
  const [isPollingEnabled, setIsPollingEnabled] = useState(() =>
    isPollingGloballyEnabled(),
  );

  useEffect(() => {
    return subscribePollingControl(setIsPollingEnabled);
  }, []);

  const pollingInterval = resolvePollingInterval({
    isConnected: false,
    enabled: isPollingEnabled,
    fallbackMs: REALTIME_POLLING.TENANT_STATUS_FALLBACK_MS,
    minimumMs: REALTIME_POLLING.TENANT_STATUS_FALLBACK_MS,
  });

  const { data, error, isLoading } = useSWR(
    "admin-tenants",
    () =>
      tracePollingAttempt(
        {
          hookName: "TenantsContent",
          endpoint: "/api/admin/tenants",
          source: "swr",
          intervalMs: pollingInterval,
        },
        () => fetchTenants(),
      ),
    {
      revalidateOnFocus: false,
      // 5 minutos no fallback sem realtime (ideal para admin com pouca frequência de alteração)
      refreshInterval: isPollingEnabled ? pollingInterval : 0,
      revalidateOnReconnect: false,
      dedupingInterval: 30_000,
    },
  );

  const { tenants, totals } = useTenantsData(data);

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [planFilter, setPlanFilter] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);
  const [selectedTenant, setSelectedTenant] = useState<any | null>(null);
  const pageSize = 8;

  const planOptions = useMemo(() => {
    const options = tenants
      .map((tenant) => tenant.plan?.name)
      .filter((plan): plan is string => Boolean(plan));

    return Array.from(new Set(options));
  }, [tenants]);

  const filteredTenants = useMemo(() => {
    return tenants.filter((tenant) => {
      if (searchTerm) {
        const normalized = searchTerm.toLowerCase();
        const matchesSearch =
          tenant.name.toLowerCase().includes(normalized) ||
          tenant.slug.toLowerCase().includes(normalized) ||
          tenant.email?.toLowerCase().includes(normalized) ||
          tenant.domain?.toLowerCase().includes(normalized);

        if (!matchesSearch) return false;
      }

      if (statusFilter !== "all" && tenant.status !== statusFilter) {
        return false;
      }

      if (planFilter !== "all") {
        if (!tenant.plan?.name || tenant.plan.name !== planFilter) {
          return false;
        }
      }

      return true;
    });
  }, [tenants, searchTerm, statusFilter, planFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredTenants.length / pageSize));
  const paginatedTenants = useMemo(() => {
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    return filteredTenants.slice(start, end);
  }, [filteredTenants, page]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, statusFilter, planFilter]);

  useEffect(() => {
    setPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  const statusOptions = [
    { value: "all", label: "Todos" },
    { value: "ACTIVE", label: "Ativos" },
    { value: "SUSPENDED", label: "Suspensos" },
    { value: "CANCELLED", label: "Cancelados" },
  ];

  const resetFilters = () => {
    setSearchTerm("");
    setStatusFilter("all");
    setPlanFilter("all");
  };

  return (
    <section className="space-y-6">
      <PeoplePageHeader
        tag="Administração"
        title="Gestão de tenants"
        description="Operação de suporte dos escritórios com acesso rápido a status, plano, contato e diagnóstico interno."
        actions={
          <Button
            as={NextLink}
            color="primary"
            href="/admin/tenants/new"
            radius="full"
            size="sm"
          >
            Criar tenant
          </Button>
        }
      />

      <PeoplePanel
        title="Busca e filtros"
        description="Filtre por status e plano para localizar rapidamente um escritório."
      >
        <div className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <Input
              className="w-full md:max-w-lg"
              placeholder="Buscar por nome, domínio, e-mail ou slug..."
              startContent={<Search className="h-4 w-4 text-default-400" />}
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
            <div className="flex gap-2">
              <Button
                startContent={<Filter className="h-4 w-4" />}
                variant={showFilters ? "solid" : "bordered"}
                onPress={() => setShowFilters((prev) => !prev)}
              >
                {showFilters ? "Ocultar filtros" : "Mostrar filtros"}
              </Button>
              <Button
                startContent={<RotateCcw className="h-4 w-4" />}
                variant="light"
                onPress={resetFilters}
              >
                Limpar
              </Button>
            </div>
          </div>

          <AnimatePresence initial={false}>
            {showFilters ? (
              <motion.div
                key="filters"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
              >
                <div className="mt-2 grid gap-4 md:grid-cols-2">
                  <Card className="border border-white/10 bg-white/5">
                    <CardBody className="space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-default-500">
                        Status
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {statusOptions.map((option) => (
                          <Button
                            key={option.value}
                            color={
                              statusFilter === option.value
                                ? "primary"
                                : "default"
                            }
                            radius="full"
                            size="sm"
                            variant={
                              statusFilter === option.value
                                ? "solid"
                                : "bordered"
                            }
                            onPress={() => setStatusFilter(option.value)}
                          >
                            {option.label}
                          </Button>
                        ))}
                      </div>
                    </CardBody>
                  </Card>

                  <Card className="border border-white/10 bg-white/5">
                    <CardBody className="space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-default-500">
                        Plano
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          color={planFilter === "all" ? "primary" : "default"}
                          radius="full"
                          size="sm"
                          variant={planFilter === "all" ? "solid" : "bordered"}
                          onPress={() => setPlanFilter("all")}
                        >
                          Todos
                        </Button>
                        {planOptions.map((plan) => (
                          <Button
                            key={plan}
                            color={planFilter === plan ? "primary" : "default"}
                            radius="full"
                            size="sm"
                            variant={
                              planFilter === plan ? "solid" : "bordered"
                            }
                            onPress={() => setPlanFilter(plan)}
                          >
                            {plan}
                          </Button>
                        ))}
                      </div>
                    </CardBody>
                  </Card>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>

          <p className="text-xs text-default-500">
            Mostrando{" "}
            <span className="font-semibold text-foreground">
              {filteredTenants.length}
            </span>{" "}
            de{" "}
            <span className="font-semibold text-foreground">{tenants.length}</span>{" "}
            tenants · página {page} de {totalPages}
          </p>
        </div>
      </PeoplePanel>

      {error ? (
        <Card className="border border-danger/30 bg-danger/10 text-danger">
          <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold">
                Não foi possível carregar os tenants
              </p>
              <p className="text-sm text-danger/80">
                {error instanceof Error ? error.message : "Erro inesperado"}
              </p>
            </div>
          </CardBody>
        </Card>
      ) : null}

      {(!data && isLoading) || !data ? (
        <TenantsSkeleton />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <PeopleMetricCard
              label="Total de tenants"
              value={totals.total}
              helper="Base completa"
              tone="primary"
            />
            <PeopleMetricCard
              label="Ativos"
              value={totals.active}
              helper="Operação normal"
              tone="success"
            />
            <PeopleMetricCard
              label="Suspensos"
              value={totals.suspended}
              helper="Requer acompanhamento"
              tone="warning"
            />
            <PeopleMetricCard
              label="Cancelados"
              value={totals.cancelled}
              helper="Encerrados"
              tone="danger"
            />
          </div>

          {filteredTenants.length ? (
            <motion.div layout className="space-y-4">
              {paginatedTenants.map((tenant) => (
                <TenantCard
                  key={tenant.id}
                  tenant={tenant}
                  onOpenDetails={setSelectedTenant}
                />
              ))}
            </motion.div>
          ) : (
            <Card className="border border-white/10 bg-background/70 backdrop-blur">
              <CardBody className="py-12 text-center">
                <div className="mb-4 text-5xl">🏢</div>
                <h3 className="text-lg font-medium text-foreground mb-1">
                  Nenhum tenant localizado
                </h3>
                <p className="text-sm text-default-400">
                  {tenants.length === 0
                    ? "Assim que um escritório for criado, você poderá controlá-lo por aqui."
                    : "Nenhum escritório corresponde aos filtros atuais. Ajuste a busca ou limpe os filtros para ver todos."}
                </p>
                {tenants.length > 0 ? (
                  <Button
                    className="mt-4"
                    radius="full"
                    size="sm"
                    variant="bordered"
                    onPress={resetFilters}
                  >
                    Limpar filtros
                  </Button>
                ) : null}
              </CardBody>
            </Card>
          )}

          {filteredTenants.length > pageSize ? (
            <div className="mt-2 flex justify-center">
              <Pagination page={page} total={totalPages} onChange={setPage} />
            </div>
          ) : null}
        </div>
      )}

      <Modal
        isOpen={Boolean(selectedTenant)}
        scrollBehavior="inside"
        size="3xl"
        onClose={() => setSelectedTenant(null)}
      >
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1">
            <p className="text-base font-semibold text-foreground">
              {selectedTenant?.name ?? "Detalhes do tenant"}
            </p>
            <p className="text-xs text-default-500">
              Visão rápida para suporte e operação.
            </p>
          </ModalHeader>
          <ModalBody className="space-y-4">
            {selectedTenant ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-white/10 bg-background/40 p-3">
                    <p className="text-xs uppercase tracking-[0.2em] text-default-500">
                      Status
                    </p>
                    <p className="mt-1 text-sm font-semibold text-foreground">
                      {statusLabel[selectedTenant.status] ?? selectedTenant.status}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-background/40 p-3">
                    <p className="text-xs uppercase tracking-[0.2em] text-default-500">
                      Plano
                    </p>
                    <p className="mt-1 text-sm font-semibold text-foreground">
                      {selectedTenant.plan?.name ?? "Sem plano"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-background/40 p-3">
                    <p className="text-xs uppercase tracking-[0.2em] text-default-500">
                      Contato
                    </p>
                    <p className="mt-1 text-sm text-default-300">
                      {selectedTenant.email ?? "Sem e-mail"}
                    </p>
                    <p className="text-sm text-default-500">
                      {selectedTenant.telefone ?? "Sem telefone"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-background/40 p-3">
                    <p className="text-xs uppercase tracking-[0.2em] text-default-500">
                      Volume
                    </p>
                    <p className="mt-1 text-sm text-default-300">
                      {selectedTenant.counts.usuarios} usuários •{" "}
                      {selectedTenant.counts.processos} processos •{" "}
                      {selectedTenant.counts.clientes} clientes
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-warning/30 bg-warning/5 p-3">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-warning">
                    Dados internos (suporte)
                  </p>
                  <div className="grid gap-2 text-xs text-default-500 sm:grid-cols-2">
                    <span>ID: {selectedTenant.id}</span>
                    <span>Slug: {selectedTenant.slug}</span>
                    <span>Timezone: {selectedTenant.timezone}</span>
                    <span>
                      Atualizado:{" "}
                      {new Date(selectedTenant.updatedAt).toLocaleString("pt-BR")}
                    </span>
                  </div>
                </div>
              </>
            ) : null}
          </ModalBody>
          <ModalFooter>
            <Button
              radius="full"
              variant="light"
              onPress={() => setSelectedTenant(null)}
            >
              Fechar
            </Button>
            {selectedTenant ? (
              <Button
                as={NextLink}
                color="primary"
                href={`/admin/tenants/${selectedTenant.id}`}
                radius="full"
                onPress={() => setSelectedTenant(null)}
              >
                Ir para gestão completa
              </Button>
            ) : null}
          </ModalFooter>
        </ModalContent>
      </Modal>
    </section>
  );
}
