"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Button } from "@heroui/button";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Divider } from "@heroui/divider";
import { Input } from "@heroui/input";
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Pagination,
  Skeleton,
  Tooltip,
} from "@heroui/react";
import { addToast } from "@heroui/toast";
import NextLink from "next/link";
import Image from "next/image";
import {
  Activity,
  Building2,
  CircleOff,
  Clock3,
  Copy,
  Globe2,
  LifeBuoy,
  Rocket,
  RotateCcw,
  Search,
  ShieldAlert,
  Users,
} from "lucide-react";

import { getAllTenants, type TenantResponse } from "@/app/actions/admin";
import { REALTIME_POLLING } from "@/app/lib/realtime/polling-policy";
import {
  isPollingGloballyEnabled,
  resolvePollingInterval,
  subscribePollingControl,
  tracePollingAttempt,
} from "@/app/lib/realtime/polling-telemetry";
import { useRealtimeTenantStatus } from "@/app/hooks/use-realtime-tenant-status";
import {
  PeopleEntityCard,
  PeopleEntityCardBody,
  PeopleEntityCardHeader,
  PeopleMetricCard,
  PeoplePageHeader,
  PeoplePanel,
} from "@/components/people-ui";

type TenantStatusValue = "ACTIVE" | "SUSPENDED" | "CANCELLED";
type SubscriptionStatusValue =
  | "TRIAL"
  | "ATIVA"
  | "INADIMPLENTE"
  | "CANCELADA"
  | "SUSPENSA";
type TenantLifecycle =
  | "TRIAL"
  | "ONBOARDING"
  | "ACTIVE"
  | "AT_RISK"
  | "DELINQUENT"
  | "SUSPENDED"
  | "CANCELLED";
type TenantHealth = "HEALTHY" | "WATCH" | "CRITICAL";

interface TenantSummary {
  id: string;
  name: string;
  slug: string;
  domain: string | null;
  email: string | null;
  telefone: string | null;
  timezone: string;
  status: TenantStatusValue;
  createdAt: string;
  updatedAt: string;
  superAdmin: {
    name: string;
    email: string;
  } | null;
  branding: {
    primaryColor: string | null;
    secondaryColor: string | null;
    accentColor: string | null;
    logoUrl: string | null;
    faviconUrl: string | null;
  } | null;
  plan: {
    status: SubscriptionStatusValue;
    name: string | null;
    valorMensal: number | null;
    valorAnual: number | null;
    moeda: string;
    trialEndsAt: string | null;
    renovaEm: string | null;
  } | null;
  counts: {
    usuarios: number;
    processos: number;
    clientes: number;
  };
  onlineUsersNow: number;
}

interface TenantDerivedState {
  lifecycle: TenantLifecycle;
  lifecycleLabel: string;
  lifecycleTone:
    | "primary"
    | "success"
    | "warning"
    | "danger"
    | "secondary"
    | "default";
  health: TenantHealth;
  healthLabel: string;
  healthTone: "success" | "warning" | "danger";
  healthHint: string;
  subscriptionLabel: string;
  subscriptionTone:
    | "primary"
    | "success"
    | "warning"
    | "danger"
    | "secondary"
    | "default";
  adoptionScore: number;
  nextMilestoneLabel: string;
  nextMilestoneValue: string;
  revenueLabel: string;
}

interface TenantWithDerived extends TenantSummary {
  derived: TenantDerivedState;
}

const statusLabel: Record<TenantStatusValue, string> = {
  ACTIVE: "Ativo",
  SUSPENDED: "Suspenso",
  CANCELLED: "Cancelado",
};

const statusTone: Record<TenantStatusValue, "success" | "warning" | "danger"> =
  {
    ACTIVE: "success",
    SUSPENDED: "warning",
    CANCELLED: "danger",
  };

const lifecycleOptions: Array<{
  value: TenantLifecycle | "all";
  label: string;
}> = [
  { value: "all", label: "Todos" },
  { value: "TRIAL", label: "Trial" },
  { value: "ONBOARDING", label: "Onboarding" },
  { value: "ACTIVE", label: "Ativos" },
  { value: "AT_RISK", label: "Em risco" },
  { value: "DELINQUENT", label: "Inadimplentes" },
  { value: "SUSPENDED", label: "Suspensos" },
  { value: "CANCELLED", label: "Cancelados" },
];

const healthOptions: Array<{ value: TenantHealth | "all"; label: string }> = [
  { value: "all", label: "Saude geral" },
  { value: "HEALTHY", label: "Saudavel" },
  { value: "WATCH", label: "Acompanhar" },
  { value: "CRITICAL", label: "Critico" },
];

function fetchTenants() {
  return getAllTenants().then((response: TenantResponse) => {
    if (!response.success || !response.data) {
      throw new Error(response.error ?? "Nao foi possivel carregar os tenants");
    }

    return response.data as TenantSummary[];
  });
}

function formatCurrency(value: number | null | undefined, currency = "BRL") {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "Nao definido";
  }

  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  });
}

function formatDate(value: string | null) {
  if (!value) return "Nao definido";

  return new Date(value).toLocaleDateString("pt-BR");
}

function formatDateTime(value: string | null) {
  if (!value) return "Nao definido";

  return new Date(value).toLocaleString("pt-BR");
}

function daysUntil(value: string | null) {
  if (!value) return null;

  const target = new Date(value);

  if (Number.isNaN(target.getTime())) {
    return null;
  }

  const diff = target.getTime() - Date.now();

  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function deriveTenantState(tenant: TenantSummary): TenantDerivedState {
  const subscriptionStatus = tenant.plan?.status ?? null;
  const adoptionScore =
    tenant.counts.usuarios + tenant.counts.processos + tenant.counts.clientes;
  const trialDays = daysUntil(tenant.plan?.trialEndsAt ?? null);
  const renewalDays = daysUntil(tenant.plan?.renovaEm ?? null);

  let lifecycle: TenantLifecycle = "ACTIVE";

  if (tenant.status === "CANCELLED" || subscriptionStatus === "CANCELADA") {
    lifecycle = "CANCELLED";
  } else if (
    tenant.status === "SUSPENDED" ||
    subscriptionStatus === "SUSPENSA"
  ) {
    lifecycle = "SUSPENDED";
  } else if (subscriptionStatus === "INADIMPLENTE") {
    lifecycle = "DELINQUENT";
  } else if (!tenant.plan?.name || adoptionScore === 0) {
    lifecycle = subscriptionStatus === "TRIAL" ? "TRIAL" : "ONBOARDING";
  } else if (subscriptionStatus === "TRIAL") {
    lifecycle = "TRIAL";
  } else if (renewalDays !== null && renewalDays <= 7) {
    lifecycle = "AT_RISK";
  }

  let health: TenantHealth = "HEALTHY";
  let healthHint = "Operacao consistente e sem sinais imediatos de risco.";

  if (["CANCELLED", "SUSPENDED", "DELINQUENT"].includes(lifecycle)) {
    health = "CRITICAL";
    healthHint =
      lifecycle === "DELINQUENT"
        ? "Requer acao financeira imediata para evitar perda de receita."
        : "Tenant fora da operacao normal. Necessita tratamento administrativo.";
  } else if (lifecycle === "TRIAL" && trialDays !== null && trialDays <= 3) {
    health = "CRITICAL";
    healthHint =
      "Trial perto do fim. Janela curta para conversao ou acao comercial.";
  } else if (
    lifecycle === "TRIAL" ||
    lifecycle === "ONBOARDING" ||
    lifecycle === "AT_RISK" ||
    adoptionScore <= 2
  ) {
    health = "WATCH";
    healthHint =
      lifecycle === "AT_RISK"
        ? "Renovacao proxima ou sinais de friccao operacional."
        : "Tenant ainda precisa consolidar onboarding e uso recorrente.";
  }

  const lifecycleMeta: Record<
    TenantLifecycle,
    {
      label: string;
      tone: TenantDerivedState["lifecycleTone"];
      milestoneLabel: string;
      milestoneValue: string;
    }
  > = {
    TRIAL: {
      label: "Trial",
      tone: "primary",
      milestoneLabel: "Fim do trial",
      milestoneValue:
        trialDays === null
          ? formatDate(tenant.plan?.trialEndsAt ?? null)
          : trialDays < 0
            ? `Expirou ha ${Math.abs(trialDays)} dia(s)`
            : `${trialDays} dia(s)`,
    },
    ONBOARDING: {
      label: "Onboarding",
      tone: "secondary",
      milestoneLabel: "Ultima atividade",
      milestoneValue: formatDate(tenant.updatedAt),
    },
    ACTIVE: {
      label: "Ativo",
      tone: "success",
      milestoneLabel: "Renovacao",
      milestoneValue: formatDate(tenant.plan?.renovaEm ?? null),
    },
    AT_RISK: {
      label: "Em risco",
      tone: "warning",
      milestoneLabel: "Renovacao critica",
      milestoneValue:
        renewalDays === null
          ? formatDate(tenant.plan?.renovaEm ?? null)
          : renewalDays < 0
            ? `Venceu ha ${Math.abs(renewalDays)} dia(s)`
            : `${renewalDays} dia(s)`,
    },
    DELINQUENT: {
      label: "Inadimplente",
      tone: "danger",
      milestoneLabel: "Cobranca",
      milestoneValue: "Acao imediata",
    },
    SUSPENDED: {
      label: "Suspenso",
      tone: "warning",
      milestoneLabel: "Reativacao",
      milestoneValue: "Aguardando decisao",
    },
    CANCELLED: {
      label: "Cancelado",
      tone: "danger",
      milestoneLabel: "Encerramento",
      milestoneValue: formatDate(tenant.updatedAt),
    },
  };

  const subscriptionLabels: Record<SubscriptionStatusValue, string> = {
    TRIAL: "Assinatura em trial",
    ATIVA: "Assinatura ativa",
    INADIMPLENTE: "Financeiro em atraso",
    CANCELADA: "Assinatura cancelada",
    SUSPENSA: "Assinatura suspensa",
  };

  const subscriptionTones: Record<
    SubscriptionStatusValue,
    TenantDerivedState["subscriptionTone"]
  > = {
    TRIAL: "primary",
    ATIVA: "success",
    INADIMPLENTE: "danger",
    CANCELADA: "default",
    SUSPENSA: "warning",
  };

  return {
    lifecycle,
    lifecycleLabel: lifecycleMeta[lifecycle].label,
    lifecycleTone: lifecycleMeta[lifecycle].tone,
    health,
    healthLabel:
      health === "HEALTHY"
        ? "Saudavel"
        : health === "WATCH"
          ? "Acompanhar"
          : "Critico",
    healthTone:
      health === "HEALTHY"
        ? "success"
        : health === "WATCH"
          ? "warning"
          : "danger",
    healthHint,
    subscriptionLabel: subscriptionStatus
      ? subscriptionLabels[subscriptionStatus]
      : "Sem assinatura configurada",
    subscriptionTone: subscriptionStatus
      ? subscriptionTones[subscriptionStatus]
      : "default",
    adoptionScore,
    nextMilestoneLabel: lifecycleMeta[lifecycle].milestoneLabel,
    nextMilestoneValue: lifecycleMeta[lifecycle].milestoneValue,
    revenueLabel: formatCurrency(
      tenant.plan?.valorMensal ?? null,
      tenant.plan?.moeda ?? "BRL",
    ),
  };
}

function useTenantsData(data: TenantSummary[] | undefined) {
  const tenants = useMemo<TenantWithDerived[]>(() => {
    return (data ?? []).map((tenant) => ({
      ...tenant,
      derived: deriveTenantState(tenant),
    }));
  }, [data]);

  const totals = useMemo(() => {
    const summary = {
      total: tenants.length,
      activation: 0,
      healthy: 0,
      attention: 0,
      cancelled: 0,
    };

    tenants.forEach((tenant) => {
      if (tenant.derived.lifecycle === "CANCELLED") {
        summary.cancelled += 1;
        return;
      }

      if (["TRIAL", "ONBOARDING"].includes(tenant.derived.lifecycle)) {
        summary.activation += 1;
      }

      if (tenant.derived.health === "HEALTHY") {
        summary.healthy += 1;
      }

      if (tenant.derived.health !== "HEALTHY") {
        summary.attention += 1;
      }
    });

    return summary;
  }, [tenants]);

  return { tenants, totals };
}

function TenantsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton
            key={`tenant-metric-skeleton-${index}`}
            className="h-28 rounded-2xl"
            isLoaded={false}
          />
        ))}
      </div>
      <Skeleton className="h-48 rounded-3xl" isLoaded={false} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton
            key={`tenant-list-skeleton-${index}`}
            className="h-60 rounded-3xl"
            isLoaded={false}
          />
        ))}
      </div>
    </div>
  );
}

function buildCopyLabel(tenant: TenantSummary) {
  return tenant.domain || tenant.slug || tenant.id;
}

function getUsageSummary(tenant: TenantWithDerived) {
  return `${tenant.counts.usuarios} usuarios · ${tenant.counts.processos} processos · ${tenant.counts.clientes} clientes`;
}

function getIdentityLabel(tenant: TenantSummary) {
  if (tenant.domain) return tenant.domain;
  if (tenant.email) return tenant.email;
  return `${tenant.slug}.localhost`;
}

interface TenantCardProps {
  tenant: TenantWithDerived;
  onOpenDetails: (tenant: TenantWithDerived) => void;
}

function TenantCard({ tenant, onOpenDetails }: TenantCardProps) {
  const { status, statusChanged, isUpdating } = useRealtimeTenantStatus(
    tenant.id,
  );
  const effectiveStatus =
    (status?.status as TenantStatusValue | undefined) ?? tenant.status;
  const effectiveTenant = useMemo(
    () => ({
      ...tenant,
      status: effectiveStatus,
      derived: deriveTenantState({ ...tenant, status: effectiveStatus }),
    }),
    [tenant, effectiveStatus],
  );

  const handleCopy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      addToast({
        title: `${label} copiado`,
        description: "Valor copiado para a area de transferencia.",
        color: "success",
      });
    } catch {
      addToast({
        title: "Falha ao copiar",
        description: "Nao foi possivel copiar agora. Tente novamente.",
        color: "danger",
      });
    }
  };

  return (
    <PeopleEntityCard
      className="h-full border-default-200/80 bg-content1/80 shadow-sm shadow-black/5 transition-colors hover:border-primary/45 hover:bg-content1 dark:border-white/10 dark:bg-background/60 dark:shadow-black/20"
      isPressable
      onPress={() => onOpenDetails(effectiveTenant)}
    >
      <PeopleEntityCardHeader className="flex flex-col gap-4 border-default-200/80 lg:flex-row lg:items-start lg:justify-between dark:border-white/10">
        <div className="flex min-w-0 items-start gap-4">
          <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-default-200/80 bg-default-100/55 shadow-sm dark:border-white/10 dark:bg-white/5">
            {effectiveTenant.branding?.logoUrl ? (
              <Image
                alt={`Logo ${effectiveTenant.name}`}
                className="h-full w-full object-contain"
                height={64}
                src={effectiveTenant.branding.logoUrl}
                width={64}
              />
            ) : (
              <span className="text-xl font-semibold text-foreground">
                {effectiveTenant.name?.charAt(0)?.toUpperCase() ?? "?"}
              </span>
            )}
          </div>
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-lg font-semibold text-foreground">
                {effectiveTenant.name}
              </p>
              <Chip
                className={statusChanged ? "animate-pulse" : ""}
                color={statusTone[effectiveStatus]}
                size="sm"
                variant="flat"
              >
                {statusLabel[effectiveStatus]}
                {isUpdating ? (
                  <span className="ml-1 text-[10px]">⟳</span>
                ) : null}
              </Chip>
              <Chip
                color={effectiveTenant.derived.lifecycleTone}
                size="sm"
                variant="flat"
              >
                {effectiveTenant.derived.lifecycleLabel}
              </Chip>
              <Chip
                color={effectiveTenant.derived.healthTone}
                size="sm"
                variant="bordered"
              >
                {effectiveTenant.derived.healthLabel}
              </Chip>
              <Chip
                color={effectiveTenant.onlineUsersNow > 0 ? "success" : "default"}
                size="sm"
                variant="flat"
              >
                {effectiveTenant.onlineUsersNow} online agora
              </Chip>
            </div>
            <p className="text-sm text-default-400">
              {getIdentityLabel(effectiveTenant)}
            </p>
            <div className="flex flex-wrap gap-2 text-xs text-default-500">
              <span>
                Owner: {effectiveTenant.superAdmin?.name || "Nao definido"}
              </span>
              <span>• {effectiveTenant.timezone}</span>
              <span>
                • Atualizado em {formatDate(effectiveTenant.updatedAt)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 lg:justify-end">
          <Button
            as={NextLink}
            color="primary"
            data-stop-card-press="true"
            href={`/admin/tenants/${effectiveTenant.id}`}
            radius="full"
            size="sm"
            variant="flat"
          >
            Gerenciar tenant
          </Button>
          <Button
            as={NextLink}
            data-stop-card-press="true"
            href={`/admin/suporte?tenantId=${effectiveTenant.id}`}
            radius="full"
            size="sm"
            startContent={<LifeBuoy className="h-4 w-4" />}
            variant="bordered"
          >
            Suporte
          </Button>
          <Tooltip content="Copiar identificador principal do tenant">
            <Button
              isIconOnly
              data-stop-card-press="true"
              radius="full"
              size="sm"
              variant="light"
              onPress={() =>
                handleCopy(buildCopyLabel(effectiveTenant), "Tenant")
              }
            >
              <Copy className="h-4 w-4" />
            </Button>
          </Tooltip>
        </div>
      </PeopleEntityCardHeader>

      <PeopleEntityCardBody className="space-y-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-default-200/80 bg-default-100/45 p-4 dark:border-white/10 dark:bg-background/40">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-default-500">
              Receita base
            </p>
            <p className="mt-2 text-base font-semibold text-foreground">
              {effectiveTenant.derived.revenueLabel}
            </p>
            <p className="mt-1 text-xs text-default-400">
              {effectiveTenant.plan?.name
                ? `Plano ${effectiveTenant.plan.name}`
                : "Sem plano publicado"}
            </p>
          </div>
          <div className="rounded-2xl border border-default-200/80 bg-default-100/45 p-4 dark:border-white/10 dark:bg-background/40">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-default-500">
              Proximo marco
            </p>
            <p className="mt-2 text-base font-semibold text-foreground">
              {effectiveTenant.derived.nextMilestoneValue}
            </p>
            <p className="mt-1 text-xs text-default-400">
              {effectiveTenant.derived.nextMilestoneLabel}
            </p>
          </div>
          <div className="rounded-2xl border border-default-200/80 bg-default-100/45 p-4 dark:border-white/10 dark:bg-background/40">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-default-500">
              Saude operacional
            </p>
            <p className="mt-2 text-base font-semibold text-foreground">
              {effectiveTenant.derived.healthLabel}
            </p>
            <p className="mt-1 text-xs text-default-400">
              {effectiveTenant.derived.healthHint}
            </p>
          </div>
          <div className="rounded-2xl border border-default-200/80 bg-default-100/45 p-4 dark:border-white/10 dark:bg-background/40">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-default-500">
              Uso atual
            </p>
            <p className="mt-2 text-base font-semibold text-foreground">
              {effectiveTenant.derived.adoptionScore}
            </p>
            <p className="mt-1 text-xs text-default-400">
              {getUsageSummary(effectiveTenant)}
            </p>
            <p className="mt-2 text-xs text-default-500">
              Sessões online agora: {effectiveTenant.onlineUsersNow}
            </p>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-3 rounded-2xl border border-default-200/80 bg-default-100/35 p-4 dark:border-white/10 dark:bg-background/30">
            <div className="flex flex-wrap gap-2">
              <Chip
                color={effectiveTenant.derived.subscriptionTone}
                size="sm"
                variant="flat"
              >
                {effectiveTenant.derived.subscriptionLabel}
              </Chip>
              {effectiveTenant.email ? (
                <Chip size="sm" variant="bordered">
                  {effectiveTenant.email}
                </Chip>
              ) : null}
              {effectiveTenant.telefone ? (
                <Chip size="sm" variant="bordered">
                  {effectiveTenant.telefone}
                </Chip>
              ) : null}
            </div>
            <p className="text-sm leading-6 text-default-400">
              {effectiveTenant.derived.healthHint}
            </p>
          </div>
          <div className="rounded-2xl border border-default-200/80 bg-default-100/35 p-4 dark:border-white/10 dark:bg-background/30">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-default-500">
              Identificacao tecnica
            </p>
            <div className="mt-3 grid gap-2 text-xs text-default-400">
              <span>ID: {effectiveTenant.id}</span>
              <span>Slug: {effectiveTenant.slug}</span>
              <span>
                Dominio: {effectiveTenant.domain || "Nao configurado"}
              </span>
              <span>
                Criado em: {formatDateTime(effectiveTenant.createdAt)}
              </span>
            </div>
          </div>
        </div>
      </PeopleEntityCardBody>
    </PeopleEntityCard>
  );
}

export function TenantsContent() {
  const [isPollingEnabled, setIsPollingEnabled] = useState(() =>
    isPollingGloballyEnabled(),
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [lifecycleFilter, setLifecycleFilter] = useState<
    TenantLifecycle | "all"
  >("all");
  const [healthFilter, setHealthFilter] = useState<TenantHealth | "all">("all");
  const [planFilter, setPlanFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [selectedTenant, setSelectedTenant] =
    useState<TenantWithDerived | null>(null);
  const pageSize = 8;

  useEffect(() => subscribePollingControl(setIsPollingEnabled), []);

  const pollingInterval = resolvePollingInterval({
    isConnected: false,
    enabled: isPollingEnabled,
    fallbackMs: REALTIME_POLLING.TENANT_STATUS_FALLBACK_MS,
    minimumMs: REALTIME_POLLING.TENANT_STATUS_FALLBACK_MS,
  });

  const { data, error, isLoading, mutate } = useSWR<TenantSummary[]>(
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
      revalidateOnFocus: true,
      refreshInterval: isPollingEnabled ? pollingInterval : 0,
      revalidateOnReconnect: false,
      dedupingInterval: 30_000,
    },
  );

  const { tenants, totals } = useTenantsData(data);

  const lifecycleCounts = useMemo(() => {
    const counts = new Map<TenantLifecycle, number>();

    tenants.forEach((tenant) => {
      counts.set(
        tenant.derived.lifecycle,
        (counts.get(tenant.derived.lifecycle) ?? 0) + 1,
      );
    });

    return counts;
  }, [tenants]);

  const planOptions = useMemo(() => {
    const options = tenants
      .map((tenant) => tenant.plan?.name)
      .filter((plan): plan is string => Boolean(plan));

    return Array.from(new Set(options)).sort((a, b) => a.localeCompare(b));
  }, [tenants]);

  const filteredTenants = useMemo(() => {
    return tenants.filter((tenant) => {
      const normalizedSearch = searchTerm.trim().toLowerCase();

      if (normalizedSearch) {
        const haystack = [
          tenant.name,
          tenant.slug,
          tenant.domain,
          tenant.email,
          tenant.superAdmin?.name,
          tenant.superAdmin?.email,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        if (!haystack.includes(normalizedSearch)) {
          return false;
        }
      }

      if (
        lifecycleFilter !== "all" &&
        tenant.derived.lifecycle !== lifecycleFilter
      ) {
        return false;
      }

      if (healthFilter !== "all" && tenant.derived.health !== healthFilter) {
        return false;
      }

      if (planFilter !== "all" && tenant.plan?.name !== planFilter) {
        return false;
      }

      return true;
    });
  }, [healthFilter, lifecycleFilter, planFilter, searchTerm, tenants]);

  const totalPages = Math.max(1, Math.ceil(filteredTenants.length / pageSize));
  const paginatedTenants = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredTenants.slice(start, start + pageSize);
  }, [filteredTenants, page]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, lifecycleFilter, healthFilter, planFilter]);

  useEffect(() => {
    setPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  const resetFilters = () => {
    setSearchTerm("");
    setLifecycleFilter("all");
    setHealthFilter("all");
    setPlanFilter("all");
  };

  const filteredLabel = `${filteredTenants.length} de ${tenants.length} escritorio(s)`;

  return (
    <section className="space-y-6">
      <PeoplePageHeader
        tag="Administracao comercial"
        title="Tenants"
        description="Painel de crescimento, ativacao e retencao dos escritorios. Veja lifecycle, saude operacional, risco e acesso rapido a suporte e gestao completa."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              color="default"
              radius="full"
              size="sm"
              variant="bordered"
              onPress={() => mutate()}
            >
              Recarregar
            </Button>
            <Button
              as={NextLink}
              color="primary"
              href="/admin/tenants/new"
              radius="full"
              size="sm"
            >
              Criar tenant
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <PeopleMetricCard
          label="Base total"
          value={totals.total}
          helper="Escritorios sob gestao"
          icon={<Building2 size={16} />}
          tone="primary"
        />
        <PeopleMetricCard
          label="Em ativacao"
          value={totals.activation}
          helper="Trial e onboarding"
          icon={<Rocket size={16} />}
          tone="secondary"
        />
        <PeopleMetricCard
          label="Saudaveis"
          value={totals.healthy}
          helper="Operacao consistente"
          icon={<Activity size={16} />}
          tone="success"
        />
        <PeopleMetricCard
          label="Atencao imediata"
          value={totals.attention}
          helper="Risco operacional ou financeiro"
          icon={<ShieldAlert size={16} />}
          tone="warning"
        />
        <PeopleMetricCard
          label="Cancelados"
          value={totals.cancelled}
          helper="Base perdida ou encerrada"
          icon={<CircleOff size={16} />}
          tone="danger"
        />
      </div>

      <PeoplePanel
        title="Pipeline e filtros"
        description="Use lifecycle, saude e plano para localizar rapidamente onde agir: converter, ativar, reter ou escalar."
      >
        <div className="space-y-5">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_auto] lg:items-center">
            <Input
              classNames={{ inputWrapper: "min-h-12" }}
              placeholder="Buscar por escritorio, slug, dominio, owner ou e-mail"
              startContent={<Search className="h-4 w-4 text-default-400" />}
              value={searchTerm}
              onValueChange={setSearchTerm}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                radius="full"
                size="sm"
                startContent={<RotateCcw className="h-4 w-4" />}
                variant="bordered"
                onPress={resetFilters}
              >
                Limpar
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-default-500">
                Lifecycle
              </p>
              <p className="text-xs text-default-500">{filteredLabel}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {lifecycleOptions.map((option) => {
                const count =
                  option.value === "all"
                    ? tenants.length
                    : (lifecycleCounts.get(option.value) ?? 0);
                const active = lifecycleFilter === option.value;

                return (
                  <Button
                    key={option.value}
                    color={active ? "primary" : "default"}
                    radius="full"
                    size="sm"
                    variant={active ? "solid" : "bordered"}
                    onPress={() => setLifecycleFilter(option.value)}
                  >
                    {option.label} ({count})
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-default-500">
                Saude operacional
              </p>
              <div className="flex flex-wrap gap-2">
                {healthOptions.map((option) => {
                  const active = healthFilter === option.value;
                  return (
                    <Button
                      key={option.value}
                      color={active ? "secondary" : "default"}
                      radius="full"
                      size="sm"
                      variant={active ? "solid" : "bordered"}
                      onPress={() => setHealthFilter(option.value)}
                    >
                      {option.label}
                    </Button>
                  );
                })}
              </div>
            </div>
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-default-500">
                Plano comercial
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  color={planFilter === "all" ? "secondary" : "default"}
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
                    color={planFilter === plan ? "secondary" : "default"}
                    radius="full"
                    size="sm"
                    variant={planFilter === plan ? "solid" : "bordered"}
                    onPress={() => setPlanFilter(plan)}
                  >
                    {plan}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </PeoplePanel>

      {error ? (
        <PeoplePanel
          title="Falha ao carregar tenants"
          description="A listagem nao pode ser tratada como vazia enquanto a consulta principal falhar."
        >
          <div className="flex flex-col gap-4 rounded-2xl border border-danger/30 bg-danger/5 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-danger">
                Nao foi possivel carregar a base de tenants.
              </p>
              <p className="mt-1 text-sm text-default-400">
                {error instanceof Error
                  ? error.message
                  : "Erro inesperado ao consultar o admin."}
              </p>
            </div>
            <Button
              color="danger"
              radius="full"
              variant="flat"
              onPress={() => mutate()}
            >
              Tentar novamente
            </Button>
          </div>
        </PeoplePanel>
      ) : null}

      {(!data && isLoading) || !data ? (
        <TenantsSkeleton />
      ) : (
        <>
          {filteredTenants.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {paginatedTenants.map((tenant) => (
                <TenantCard
                  key={tenant.id}
                  tenant={tenant}
                  onOpenDetails={setSelectedTenant}
                />
              ))}
            </div>
          ) : (
            <PeoplePanel
              title="Nenhum tenant encontrado"
              description="A busca atual nao retornou escritorios. Revise filtros ou volte para a base completa."
            >
              <div className="rounded-3xl border border-dashed border-default-300/80 bg-default-100/35 px-6 py-12 text-center dark:border-white/10 dark:bg-background/30">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl border border-default-200/80 bg-default-100/55 dark:border-white/10 dark:bg-white/5">
                  <Globe2 className="h-7 w-7 text-default-400" />
                </div>
                <p className="text-base font-semibold text-foreground">
                  Nada corresponde aos filtros atuais.
                </p>
                <p className="mt-2 text-sm text-default-400">
                  Limpe a combinacao de lifecycle, saude e plano para
                  reencontrar a base inteira.
                </p>
                <Button
                  className="mt-4"
                  radius="full"
                  variant="bordered"
                  onPress={resetFilters}
                >
                  Limpar filtros
                </Button>
              </div>
            </PeoplePanel>
          )}

          {filteredTenants.length > pageSize ? (
            <div className="flex justify-center pt-2">
              <Pagination page={page} total={totalPages} onChange={setPage} />
            </div>
          ) : null}
        </>
      )}

      <Modal
        isOpen={Boolean(selectedTenant)}
        scrollBehavior="inside"
        size="4xl"
        onClose={() => setSelectedTenant(null)}
      >
        <ModalContent>
          <ModalHeader className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-base font-semibold text-foreground">
                {selectedTenant?.name ?? "Tenant"}
              </span>
              {selectedTenant ? (
                <>
                  <Chip
                    color={selectedTenant.derived.lifecycleTone}
                    size="sm"
                    variant="flat"
                  >
                    {selectedTenant.derived.lifecycleLabel}
                  </Chip>
                  <Chip
                    color={selectedTenant.derived.healthTone}
                    size="sm"
                    variant="bordered"
                  >
                    {selectedTenant.derived.healthLabel}
                  </Chip>
                </>
              ) : null}
            </div>
            <p className="text-xs text-default-500">
              Visao rapida para suporte, retencao e operacao do escritorio.
            </p>
          </ModalHeader>
          <ModalBody>
            {selectedTenant ? (
              <div className="space-y-5">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-2xl border border-default-200/80 bg-default-100/45 p-4 dark:border-white/10 dark:bg-background/40">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-default-500">
                      Status do tenant
                    </p>
                    <p className="mt-2 text-base font-semibold text-foreground">
                      {statusLabel[selectedTenant.status]}
                    </p>
                    <p className="mt-1 text-xs text-default-400">
                      {selectedTenant.derived.subscriptionLabel}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-default-200/80 bg-default-100/45 p-4 dark:border-white/10 dark:bg-background/40">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-default-500">
                      Plano
                    </p>
                    <p className="mt-2 text-base font-semibold text-foreground">
                      {selectedTenant.plan?.name ?? "Sem plano"}
                    </p>
                    <p className="mt-1 text-xs text-default-400">
                      {selectedTenant.derived.revenueLabel}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-default-200/80 bg-default-100/45 p-4 dark:border-white/10 dark:bg-background/40">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-default-500">
                      Marco critico
                    </p>
                    <p className="mt-2 text-base font-semibold text-foreground">
                      {selectedTenant.derived.nextMilestoneValue}
                    </p>
                    <p className="mt-1 text-xs text-default-400">
                      {selectedTenant.derived.nextMilestoneLabel}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-default-200/80 bg-default-100/45 p-4 dark:border-white/10 dark:bg-background/40">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-default-500">
                      Uso consolidado
                    </p>
                    <p className="mt-2 text-base font-semibold text-foreground">
                      {selectedTenant.derived.adoptionScore}
                    </p>
                    <p className="mt-1 text-xs text-default-400">
                      {getUsageSummary(selectedTenant)}
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                  <div className="space-y-3 rounded-2xl border border-default-200/80 bg-default-100/35 p-4 dark:border-white/10 dark:bg-background/30">
                    <p className="text-sm font-semibold text-foreground">
                      Resumo operacional
                    </p>
                    <p className="text-sm text-default-400">
                      {selectedTenant.derived.healthHint}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {selectedTenant.email ? (
                        <Chip size="sm" variant="bordered">
                          {selectedTenant.email}
                        </Chip>
                      ) : null}
                      {selectedTenant.telefone ? (
                        <Chip size="sm" variant="bordered">
                          {selectedTenant.telefone}
                        </Chip>
                      ) : null}
                      <Chip size="sm" variant="flat">
                        {selectedTenant.timezone}
                      </Chip>
                    </div>
                  </div>
                  <div className="space-y-2 rounded-2xl border border-default-200/80 bg-default-100/35 p-4 text-sm text-default-400 dark:border-white/10 dark:bg-background/30">
                    <p>
                      <span className="font-medium text-foreground">
                        Owner:
                      </span>{" "}
                      {selectedTenant.superAdmin?.name || "Nao definido"}
                    </p>
                    <p>
                      <span className="font-medium text-foreground">
                        Owner e-mail:
                      </span>{" "}
                      {selectedTenant.superAdmin?.email || "Nao definido"}
                    </p>
                    <p>
                      <span className="font-medium text-foreground">
                        Dominio:
                      </span>{" "}
                      {selectedTenant.domain || "Nao configurado"}
                    </p>
                    <p>
                      <span className="font-medium text-foreground">Slug:</span>{" "}
                      {selectedTenant.slug}
                    </p>
                    <p>
                      <span className="font-medium text-foreground">
                        Criado em:
                      </span>{" "}
                      {formatDateTime(selectedTenant.createdAt)}
                    </p>
                    <p>
                      <span className="font-medium text-foreground">
                        Atualizado em:
                      </span>{" "}
                      {formatDateTime(selectedTenant.updatedAt)}
                    </p>
                    <p>
                      <span className="font-medium text-foreground">ID:</span>{" "}
                      {selectedTenant.id}
                    </p>
                  </div>
                </div>
              </div>
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
              <>
                <Button
                  as={NextLink}
                  radius="full"
                  variant="bordered"
                  href={`/admin/suporte?tenantId=${selectedTenant.id}`}
                  onPress={() => setSelectedTenant(null)}
                >
                  Abrir suporte
                </Button>
                <Button
                  as={NextLink}
                  color="primary"
                  href={`/admin/tenants/${selectedTenant.id}`}
                  radius="full"
                  onPress={() => setSelectedTenant(null)}
                >
                  Ir para gestao completa
                </Button>
              </>
            ) : null}
          </ModalFooter>
        </ModalContent>
      </Modal>
    </section>
  );
}
