"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type Key,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Divider,
  Input,
  Spinner,
  Tab,
  Tabs,
  Textarea,
} from "@heroui/react";
import { addToast } from "@heroui/toast";
import useSWR from "swr";
import {
  Activity,
  Bot,
  Coins,
  Factory,
  Rocket,
  ShieldCheck,
} from "lucide-react";

import {
  createJuridicalAiPromptVersion,
  getJuridicalAiAdminDashboard,
  publishJuridicalAiPromptVersion,
  trackJuridicalAiInteraction,
  updateJuridicalAiTenantRollout,
} from "@/app/actions/juridical-ai";
import { getAllTenants } from "@/app/actions/admin";
import {
  JURIDICAL_AI_ROLLOUT_STAGE_LABELS,
  JURIDICAL_AI_TASK_LABELS,
  JURIDICAL_AI_TIER_LABELS,
} from "@/app/lib/juridical-ai/constants";
import type {
  JuridicalAiAdminDashboard,
  JuridicalAiTaskKey,
  JuridicalAiTier,
} from "@/app/lib/juridical-ai/types";
import type { JuridicalAiAdminTab } from "@/app/lib/juridical-ai/assistant-dock";
import { SearchableSelect, type SearchableSelectOption } from "@/components/searchable-select";

type AdminTenantOption = {
  id: string;
  name: string;
  slug: string;
  status: string;
  planName: string | null;
};

type RolloutTenantRow = JuridicalAiAdminDashboard["rolloutTenants"][number];

const ADMIN_TABS: JuridicalAiAdminTab[] = [
  "cockpit",
  "rollout",
  "prompts",
  "usage",
  "executions",
];

const ADMIN_TAB_LABELS: Record<JuridicalAiAdminTab, string> = {
  cockpit: "Cockpit",
  rollout: "Rollout",
  prompts: "Prompts",
  usage: "Uso e custo",
  executions: "Execuções",
};

const TASK_OPTIONS: SearchableSelectOption[] = (
  Object.entries(JURIDICAL_AI_TASK_LABELS) as Array<[JuridicalAiTaskKey, string]>
).map(([key, label]) => ({
  key,
  label,
}));

const ROLLOUT_STAGE_OPTIONS: SearchableSelectOption[] = Object.entries(
  JURIDICAL_AI_ROLLOUT_STAGE_LABELS,
).map(([key, label]) => ({
  key,
  label,
}));

const TIER_OVERRIDE_OPTIONS: SearchableSelectOption[] = [
  {
    key: "NONE",
    label: "Sem override",
    description: "Segue somente o plano contratado pelo escritório.",
  },
  ...(["ESSENCIAL", "PROFISSIONAL", "PREMIUM"] as JuridicalAiTier[]).map((tier) => ({
    key: tier,
    label: JURIDICAL_AI_TIER_LABELS[tier],
    description: `Libera temporariamente a régua ${JURIDICAL_AI_TIER_LABELS[tier]} no rollout.`,
  })),
];

function normalizeAdminTab(value: string | null): JuridicalAiAdminTab {
  if (value && ADMIN_TABS.includes(value as JuridicalAiAdminTab)) {
    return value as JuridicalAiAdminTab;
  }

  return "cockpit";
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("pt-BR");
}

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  });
}

function toDateTimeLocalValue(value: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function buildAdminFetcher() {
  return getJuridicalAiAdminDashboard().then((response) => {
    if (!response.success || !response.data) {
      throw new Error(response.error ?? "Nao foi possivel carregar o cockpit da IA.");
    }

    return response.data;
  });
}

function buildTenantsFetcher() {
  return getAllTenants().then((response) => {
    if (!response.success || !Array.isArray(response.data)) {
      throw new Error(response.error ?? "Nao foi possivel carregar os tenants.");
    }

    return response.data.map((tenant) => ({
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      status: tenant.status,
      planName: tenant.plan?.name ?? null,
    })) satisfies AdminTenantOption[];
  });
}

function MetricCard({
  label,
  value,
  hint,
  tone,
  icon,
}: {
  label: string;
  value: string;
  hint: string;
  tone: "primary" | "success" | "warning" | "secondary";
  icon: ReactNode;
}) {
  return (
    <Card className="border border-default-200/70 bg-content1/80">
      <CardBody className="gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className={`rounded-2xl p-3 ${tone === "primary" ? "bg-primary/10 text-primary" : tone === "success" ? "bg-success/10 text-success" : tone === "warning" ? "bg-warning/10 text-warning" : "bg-secondary/10 text-secondary"}`}>
            {icon}
          </div>
          <Chip color={tone} size="sm" variant="flat">
            Magic AI
          </Chip>
        </div>
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-default-500">
            {label}
          </p>
          <p className="text-2xl font-semibold text-foreground">{value}</p>
          <p className="text-xs text-default-500">{hint}</p>
        </div>
      </CardBody>
    </Card>
  );
}

export function AdminMagicAiContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const trackedAdminViewRef = useRef<string | null>(null);
  const [selectedTab, setSelectedTab] = useState<JuridicalAiAdminTab>(
    normalizeAdminTab(searchParams.get("tab")),
  );
  const [isPending, startTransition] = useTransition();

  const [promptForm, setPromptForm] = useState({
    scope: "tenant" as "tenant" | "admin",
    ownerKey: "global",
    taskKey: "PIECE_DRAFTING" as JuridicalAiTaskKey,
    title: "",
    systemPrompt: "",
    instructionPrompt: "",
  });
  const [selectedRolloutTenantId, setSelectedRolloutTenantId] = useState<string | null>(null);
  const [rolloutForm, setRolloutForm] = useState({
    stage: "CONTROLLED" as JuridicalAiAdminDashboard["rolloutTenants"][number]["rolloutStage"],
    workspaceEnabled: true,
    tierOverride: "NONE" as JuridicalAiTier | "NONE",
    enabledTasks: [] as JuridicalAiTaskKey[],
    owner: "",
    nextReviewAt: "",
    notes: "",
  });

  const dashboardQuery = useSWR<JuridicalAiAdminDashboard>(
    "magic-ai-admin-dashboard",
    buildAdminFetcher,
    {
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
    },
  );
  const tenantsQuery = useSWR<AdminTenantOption[]>(
    "magic-ai-admin-tenants",
    buildTenantsFetcher,
    {
      revalidateOnFocus: false,
    },
  );

  useEffect(() => {
    setSelectedTab(normalizeAdminTab(searchParams.get("tab")));
  }, [searchParams]);

  useEffect(() => {
    const trackingKey = `${pathname}:${selectedTab}`;
    if (trackedAdminViewRef.current === trackingKey) {
      return;
    }

    trackedAdminViewRef.current = trackingKey;
    void trackJuridicalAiInteraction({
      scope: "admin",
      interaction: "WORKSPACE_OPENED",
      route: `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`,
      tab: selectedTab,
    });
  }, [pathname, searchParams, selectedTab]);

  const tenantOptions = useMemo<SearchableSelectOption[]>(
    () => [
      {
        key: "global",
        label: "Prompt global de tenant",
        description: "Aplica para todos os escritórios que não tiverem override próprio.",
      },
      ...(tenantsQuery.data ?? []).map((tenant) => ({
        key: tenant.id,
        label: tenant.name,
        textValue: `${tenant.name} ${tenant.slug} ${tenant.status} ${tenant.planName ?? ""}`,
        description: `${tenant.slug} • ${tenant.status}${tenant.planName ? ` • ${tenant.planName}` : ""}`,
      })),
    ],
    [tenantsQuery.data],
  );

  const tenantNameMap = useMemo(
    () =>
      new Map(
        (tenantsQuery.data ?? []).map((tenant) => [tenant.id, tenant.name]),
      ),
    [tenantsQuery.data],
  );
  const rolloutTenants = dashboardQuery.data?.rolloutTenants ?? [];
  const selectedRolloutTenant = useMemo(
    () =>
      rolloutTenants.find((tenant) => tenant.tenantId === selectedRolloutTenantId) ??
      rolloutTenants[0] ??
      null,
    [rolloutTenants, selectedRolloutTenantId],
  );

  useEffect(() => {
    if (!rolloutTenants.length) {
      return;
    }

    if (!selectedRolloutTenantId) {
      setSelectedRolloutTenantId(rolloutTenants[0].tenantId);
    }
  }, [rolloutTenants, selectedRolloutTenantId]);

  useEffect(() => {
    if (!selectedRolloutTenant) {
      return;
    }

    setRolloutForm({
      stage: selectedRolloutTenant.rolloutStage,
      workspaceEnabled: selectedRolloutTenant.workspaceEnabled,
      tierOverride: selectedRolloutTenant.overrideTier ?? "NONE",
      enabledTasks: selectedRolloutTenant.enabledTasks,
      owner: selectedRolloutTenant.owner ?? "",
      nextReviewAt: toDateTimeLocalValue(selectedRolloutTenant.nextReviewAt),
      notes: selectedRolloutTenant.notes ?? "",
    });
  }, [selectedRolloutTenant]);

  const handleTabChange = (key: Key) => {
    const nextTab = key as JuridicalAiAdminTab;
    setSelectedTab(nextTab);

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("tab", nextTab);
    router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
  };

  const refreshDashboard = () => {
    void dashboardQuery.mutate();
  };

  const toggleRolloutTask = (taskKey: JuridicalAiTaskKey) => {
    setRolloutForm((current) => ({
      ...current,
      enabledTasks: current.enabledTasks.includes(taskKey)
        ? current.enabledTasks.filter((item) => item !== taskKey)
        : [...current.enabledTasks, taskKey],
    }));
  };

  const applyRolloutPreset = (
    preset: "disable" | "pilot-premium" | "release-current",
  ) => {
    if (!selectedRolloutTenant) {
      return;
    }

    if (preset === "disable") {
      setRolloutForm((current) => ({
        ...current,
        stage: "DISABLED",
        workspaceEnabled: false,
        enabledTasks: [],
      }));
      return;
    }

    if (preset === "pilot-premium") {
      setRolloutForm((current) => ({
        ...current,
        stage: "PILOT",
        workspaceEnabled: true,
        tierOverride: "PREMIUM",
        enabledTasks: [
          "PIECE_DRAFTING",
          "DOCUMENT_ANALYSIS",
          "QUESTION_ANSWERING",
          "PROCESS_SUMMARY",
          "CASE_STRATEGY",
          "JURISPRUDENCE_BRIEF",
          "CITATION_VALIDATION",
          "SENTENCE_CALCULATION",
        ],
      }));
      return;
    }

    setRolloutForm((current) => ({
      ...current,
      stage: "RELEASED",
      workspaceEnabled: true,
      tierOverride: "NONE",
      enabledTasks: (Object.keys(JURIDICAL_AI_TASK_LABELS) as JuridicalAiTaskKey[]).filter(
        Boolean,
      ),
    }));
  };

  const handleSaveRollout = () => {
    if (!selectedRolloutTenant) {
      return;
    }

    startTransition(async () => {
      const response = await updateJuridicalAiTenantRollout({
        tenantId: selectedRolloutTenant.tenantId,
        stage: rolloutForm.stage,
        workspaceEnabled: rolloutForm.workspaceEnabled,
        tierOverride: rolloutForm.tierOverride === "NONE" ? null : rolloutForm.tierOverride,
        enabledTasks: rolloutForm.enabledTasks,
        owner: rolloutForm.owner,
        nextReviewAt: rolloutForm.nextReviewAt
          ? new Date(rolloutForm.nextReviewAt).toISOString()
          : null,
        notes: rolloutForm.notes,
      });

      if (!response.success) {
        addToast({
          color: "danger",
          title: "Falha ao atualizar rollout",
          description:
            response.error ?? "Nao foi possivel salvar a governanca do tenant.",
        });
        return;
      }

      addToast({
        color: "success",
        title: "Rollout atualizado",
        description: `${selectedRolloutTenant.tenantName} recebeu a nova politica do Magic AI.`,
      });
      refreshDashboard();
    });
  };

  const handleCreatePrompt = () => {
    startTransition(async () => {
      const response = await createJuridicalAiPromptVersion({
        ownerKey: promptForm.scope === "admin" ? "global-admin" : promptForm.ownerKey,
        scope: promptForm.scope,
        taskKey: promptForm.taskKey,
        title: promptForm.title,
        systemPrompt: promptForm.systemPrompt,
        instructionPrompt: promptForm.instructionPrompt,
      });

      if (!response.success) {
        addToast({
          color: "danger",
          title: "Falha ao criar prompt",
          description: response.error ?? "Nao foi possivel criar a nova versao.",
        });
        return;
      }

      addToast({
        color: "success",
        title: "Prompt versionado",
        description: "A nova versao foi criada como rascunho e ja pode ser publicada.",
      });
      refreshDashboard();
      setSelectedTab("prompts");
      setPromptForm((current) => ({
        ...current,
        title: "",
        systemPrompt: "",
        instructionPrompt: "",
      }));
    });
  };

  const handlePublishPrompt = (promptId: string) => {
    startTransition(async () => {
      const response = await publishJuridicalAiPromptVersion(promptId);

      if (!response.success) {
        addToast({
          color: "danger",
          title: "Falha ao publicar",
          description: response.error ?? "Nao foi possivel publicar a versao selecionada.",
        });
        return;
      }

      addToast({
        color: "success",
        title: "Prompt publicado",
        description: "A nova versao esta ativa para o escopo selecionado.",
      });
      refreshDashboard();
    });
  };

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border border-primary/15 bg-gradient-to-br from-content1 via-content1 to-primary/5">
        <CardBody className="gap-6 p-6 md:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Chip color="primary" variant="flat">
                  Governança da IA Jurídica
                </Chip>
                <Chip color="secondary" variant="flat">
                  Admin cockpit
                </Chip>
                <Chip color="warning" variant="flat">
                  Rollout controlado
                </Chip>
              </div>
              <div className="space-y-2">
                <h1 className="text-3xl font-semibold tracking-tight text-foreground">
                  Centro de comando do produto premium
                </h1>
                <p className="max-w-3xl text-sm leading-7 text-default-500 md:text-base">
                  Governe prompts, acompanhe adoção, custo, execuções e o recorte por tenant antes de liberar paridade plena com a oferta jurídica premium.
                </p>
              </div>
            </div>

            <Card className="border border-default-200/70 bg-content1/80 lg:w-[380px]">
              <CardBody className="gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-default-500">
                  Critério de rollout
                </p>
                <ul className="space-y-2 text-sm text-default-600">
                  <li>• Todo prompt nasce versionado e publicável por escopo.</li>
                  <li>• Toda execução gera trilha de uso, engine e resumo.</li>
                  <li>• Toda expansão do produto premium precisa passar por billing, auditoria e governança.</li>
                </ul>
              </CardBody>
            </Card>
          </div>

          <div className="grid gap-3 xl:grid-cols-4">
            <MetricCard
              hint="Total de execuções registradas no produto até agora."
              icon={<Rocket className="h-5 w-5" />}
              label="Execuções"
              tone="primary"
              value={dashboardQuery.data ? dashboardQuery.data.usage.totalExecutions.toString() : "—"}
            />
            <MetricCard
              hint="Rascunhos gerados e salvos em trilha auditável."
              icon={<Factory className="h-5 w-5" />}
              label="Peças e drafts"
              tone="success"
              value={dashboardQuery.data ? dashboardQuery.data.usage.totalDrafts.toString() : "—"}
            />
            <MetricCard
              hint="Quantos escritórios já produziram uso real da camada de IA."
              icon={<Activity className="h-5 w-5" />}
              label="Tenants com uso"
              tone="secondary"
              value={dashboardQuery.data ? dashboardQuery.data.usage.tenantsWithUsage.toString() : "—"}
            />
            <MetricCard
              hint="Custo estimado acumulado da operação atual."
              icon={<Coins className="h-5 w-5" />}
              label="Custo estimado"
              tone="warning"
              value={dashboardQuery.data ? formatCurrency(dashboardQuery.data.usage.totalEstimatedCost) : "—"}
            />
          </div>
        </CardBody>
      </Card>

      <Card className="border border-default-200/70 bg-content1/85">
        <CardHeader className="border-b border-default-200/70">
          <div className="space-y-1">
            <p className="text-lg font-semibold text-foreground">Cockpit administrativo</p>
            <p className="text-sm text-default-500">
              Separe a leitura por visão executiva, biblioteca de prompts, uso e execuções recentes.
            </p>
          </div>
        </CardHeader>
        <CardBody className="gap-6">
          <Tabs
            aria-label="Cockpit administrativo da IA"
            color="primary"
            selectedKey={selectedTab}
            variant="underlined"
            onSelectionChange={handleTabChange}
          >
            {ADMIN_TABS.map((tab) => (
              <Tab key={tab} title={ADMIN_TAB_LABELS[tab]} />
            ))}
          </Tabs>

          {selectedTab === "cockpit" ? (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.86fr)]">
              <div className="space-y-4">
                <Card className="border border-default-200/70 bg-content1/80">
                  <CardHeader className="border-b border-default-200/70">
                    <div className="space-y-1">
                      <p className="text-lg font-semibold text-foreground">Motores ativos</p>
                      <p className="text-sm text-default-500">
                        Distribuição atual por engine de execução.
                      </p>
                    </div>
                  </CardHeader>
                  <CardBody className="gap-3">
                    {dashboardQuery.isLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <Spinner size="sm" />
                      </div>
                    ) : (
                      (dashboardQuery.data?.usage.executionsByEngine ?? []).map((engine) => (
                        <div key={engine.engine} className="rounded-3xl border border-default-200/70 bg-default-50/40 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-foreground">{engine.engine}</p>
                              <p className="text-xs text-default-500">
                                Engine atualmente usada nas execuções registradas.
                              </p>
                            </div>
                            <Chip color="primary" variant="flat">
                              {engine.total}
                            </Chip>
                          </div>
                        </div>
                      ))
                    )}
                  </CardBody>
                </Card>

                <Card className="border border-default-200/70 bg-content1/80">
                  <CardHeader className="border-b border-default-200/70">
                    <div className="space-y-1">
                      <p className="text-lg font-semibold text-foreground">Ações mais usadas</p>
                      <p className="text-sm text-default-500">
                        Onde o produto já está gerando tração operacional real.
                      </p>
                    </div>
                  </CardHeader>
                  <CardBody className="gap-3">
                    {dashboardQuery.isLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <Spinner size="sm" />
                      </div>
                    ) : (
                      (dashboardQuery.data?.usage.executionsByAction ?? []).map((item) => (
                        <div
                          key={item.action}
                          className="rounded-3xl border border-default-200/70 bg-default-50/40 p-4"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-foreground">
                                {item.action}
                              </p>
                              <p className="text-xs text-default-500">
                                Execuções registradas da ação no rollout atual.
                              </p>
                            </div>
                            <Chip color="secondary" variant="flat">
                              {item.total}
                            </Chip>
                          </div>
                        </div>
                      ))
                    )}
                  </CardBody>
                </Card>
              </div>

              <div className="space-y-4">
                <Card className="border border-default-200/70 bg-content1/80">
                  <CardHeader className="border-b border-default-200/70">
                    <div className="space-y-1">
                      <p className="text-lg font-semibold text-foreground">Leituras de operação</p>
                      <p className="text-sm text-default-500">
                        O que precisa ficar de pé para liberar crescimento comercial.
                      </p>
                    </div>
                  </CardHeader>
                  <CardBody className="gap-3 text-sm text-default-600">
                    <div className="rounded-3xl border border-default-200/70 bg-default-50/40 p-4">
                      <p className="font-semibold text-foreground">Billing e franquia</p>
                      <p className="mt-2">
                        {JURIDICAL_AI_TIER_LABELS.PREMIUM} já nasce com drafts ilimitados, mas a régua interna continua controlando custo, trilha e abuso.
                      </p>
                    </div>
                    <div className="rounded-3xl border border-default-200/70 bg-default-50/40 p-4">
                      <p className="font-semibold text-foreground">Prompt governance</p>
                      <p className="mt-2">
                        Toda melhoria de prompt precisa passar por versionamento, publicação explícita e rastreio por escopo.
                      </p>
                    </div>
                    <div className="rounded-3xl border border-default-200/70 bg-default-50/40 p-4">
                      <p className="font-semibold text-foreground">Auditoria defensável</p>
                      <p className="mt-2">
                        A camada premium só escala se email, webhook, cron, prompt e execução permanecerem auditáveis para suporte e risco.
                      </p>
                    </div>
                  </CardBody>
                </Card>

                <Card className="border border-default-200/70 bg-content1/80">
                  <CardHeader className="border-b border-default-200/70">
                    <div className="space-y-1">
                      <p className="text-lg font-semibold text-foreground">Telemetria recente</p>
                      <p className="text-sm text-default-500">
                        Eventos operacionais da IA para rollout, suporte e risco.
                      </p>
                    </div>
                  </CardHeader>
                  <CardBody className="gap-3">
                    {dashboardQuery.isLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <Spinner size="sm" />
                      </div>
                    ) : (
                      (dashboardQuery.data?.usage.recentAuditEvents ?? []).map((event) => (
                        <div
                          key={event.id}
                          className="rounded-3xl border border-default-200/70 bg-default-50/40 p-4"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="space-y-1">
                              <p className="text-sm font-semibold text-foreground">
                                {event.action}
                              </p>
                              <p className="text-xs text-default-500">
                                {event.actorName ?? "Sem ator"}{event.route ? ` • ${event.route}` : ""}
                              </p>
                            </div>
                            <Chip
                              color={event.status === "SUCCESS" ? "success" : event.status === "WARNING" ? "warning" : "default"}
                              size="sm"
                              variant="flat"
                            >
                              {event.status}
                            </Chip>
                          </div>
                          <p className="mt-3 text-sm text-default-600">
                            {event.message ?? "Evento operacional rastreado sem mensagem adicional."}
                          </p>
                          <p className="mt-3 text-xs text-default-500">
                            {formatDateTime(event.createdAt)}
                          </p>
                        </div>
                      ))
                    )}
                  </CardBody>
                </Card>
              </div>
            </div>
          ) : null}

          {selectedTab === "rollout" ? (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)]">
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-4">
                  <MetricCard
                    hint="Escritórios monitorados pela régua do Magic AI."
                    icon={<Bot className="h-5 w-5" />}
                    label="Tenants no radar"
                    tone="primary"
                    value={(dashboardQuery.data?.rollout.totalTenants ?? 0).toString()}
                  />
                  <MetricCard
                    hint="Workspaces hoje habilitados no produto."
                    icon={<Rocket className="h-5 w-5" />}
                    label="Workspaces ativos"
                    tone="success"
                    value={(dashboardQuery.data?.rollout.enabledWorkspaces ?? 0).toString()}
                  />
                  <MetricCard
                    hint="Escritórios ainda em piloto controlado."
                    icon={<ShieldCheck className="h-5 w-5" />}
                    label="Pilotos"
                    tone="warning"
                    value={(dashboardQuery.data?.rollout.pilotTenants ?? 0).toString()}
                  />
                  <MetricCard
                    hint="Tenants que já precisam de revisão operacional."
                    icon={<Activity className="h-5 w-5" />}
                    label="Revisar rollout"
                    tone="secondary"
                    value={(dashboardQuery.data?.rollout.needsReview ?? 0).toString()}
                  />
                </div>

                <Card className="border border-default-200/70 bg-content1/80">
                  <CardHeader className="border-b border-default-200/70">
                    <div className="space-y-1">
                      <p className="text-lg font-semibold text-foreground">Editor de rollout por escritório</p>
                      <p className="text-sm text-default-500">
                        Ajuste etapa, override comercial, revisão e tarefas liberadas sem tocar no plano-base do tenant.
                      </p>
                    </div>
                  </CardHeader>
                  <CardBody className="gap-4">
                    <SearchableSelect
                      items={rolloutTenants.map((tenant) => ({
                        key: tenant.tenantId,
                        label: tenant.tenantName,
                        textValue: `${tenant.tenantName} ${tenant.tenantSlug} ${tenant.tenantStatus} ${tenant.planName ?? ""}`,
                        description: `${tenant.tenantSlug} • ${tenant.tenantStatus}${tenant.planName ? ` • ${tenant.planName}` : ""}`,
                      }))}
                      label="Escritório"
                      placeholder="Escolha um tenant"
                      selectedKey={selectedRolloutTenant?.tenantId ?? null}
                      onSelectionChange={setSelectedRolloutTenantId}
                    />

                    <div className="grid gap-4 md:grid-cols-2">
                      <SearchableSelect
                        items={ROLLOUT_STAGE_OPTIONS}
                        label="Estágio do rollout"
                        selectedKey={rolloutForm.stage}
                        onSelectionChange={(value) =>
                          setRolloutForm((current) => {
                            const nextStage =
                              (value as RolloutTenantRow["rolloutStage"] | null) ??
                              "CONTROLLED";
                            const defaultTasks: JuridicalAiTaskKey[] =
                              nextStage === "DISABLED"
                                ? []
                                : nextStage === "PILOT"
                                  ? [
                                      "PIECE_DRAFTING",
                                      "DOCUMENT_ANALYSIS",
                                      "QUESTION_ANSWERING",
                                      "PROCESS_SUMMARY",
                                      "CASE_STRATEGY",
                                      "SENTENCE_CALCULATION",
                                    ]
                                  : (Object.keys(
                                      JURIDICAL_AI_TASK_LABELS,
                                    ) as JuridicalAiTaskKey[]);

                            return {
                              ...current,
                              stage: nextStage,
                              workspaceEnabled:
                                nextStage === "DISABLED"
                                  ? false
                                  : current.workspaceEnabled,
                              enabledTasks:
                                current.enabledTasks.length > 0 &&
                                nextStage !== "DISABLED"
                                  ? current.enabledTasks
                                  : defaultTasks,
                            };
                          })
                        }
                      />
                      <SearchableSelect
                        items={TIER_OVERRIDE_OPTIONS}
                        label="Override comercial"
                        selectedKey={rolloutForm.tierOverride}
                        onSelectionChange={(value) =>
                          setRolloutForm((current) => ({
                            ...current,
                            tierOverride: (value as JuridicalAiTier | "NONE" | null) ?? "NONE",
                          }))
                        }
                      />
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <Input
                        label="Dono da operação"
                        placeholder="Ex.: Robson / time produto"
                        value={rolloutForm.owner}
                        onValueChange={(value) =>
                          setRolloutForm((current) => ({
                            ...current,
                            owner: value,
                          }))
                        }
                      />
                      <Input
                        label="Próxima revisão"
                        placeholder="Opcional"
                        type="datetime-local"
                        value={rolloutForm.nextReviewAt}
                        onValueChange={(value) =>
                          setRolloutForm((current) => ({
                            ...current,
                            nextReviewAt: value,
                          }))
                        }
                      />
                    </div>

                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          color={rolloutForm.workspaceEnabled ? "success" : "default"}
                          radius="full"
                          variant={rolloutForm.workspaceEnabled ? "flat" : "bordered"}
                          onPress={() =>
                            setRolloutForm((current) => ({
                              ...current,
                              workspaceEnabled: !current.workspaceEnabled,
                            }))
                          }
                        >
                          {rolloutForm.workspaceEnabled
                            ? "Workspace habilitado"
                            : "Workspace bloqueado"}
                        </Button>
                        <Button
                          radius="full"
                          variant="flat"
                          onPress={() => applyRolloutPreset("pilot-premium")}
                        >
                          Preset piloto premium
                        </Button>
                        <Button
                          radius="full"
                          variant="flat"
                          onPress={() => applyRolloutPreset("release-current")}
                        >
                          Liberar catálogo
                        </Button>
                        <Button
                          radius="full"
                          variant="flat"
                          onPress={() => applyRolloutPreset("disable")}
                        >
                          Bloquear workspace
                        </Button>
                      </div>

                      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                        {(Object.entries(JURIDICAL_AI_TASK_LABELS) as Array<
                          [JuridicalAiTaskKey, string]
                        >).map(([taskKey, label]) => {
                          const enabled = rolloutForm.enabledTasks.includes(taskKey);
                          return (
                            <Button
                              key={taskKey}
                              color={enabled ? "primary" : "default"}
                              variant={enabled ? "flat" : "bordered"}
                              className="justify-start"
                              onPress={() => toggleRolloutTask(taskKey)}
                            >
                              {label}
                            </Button>
                          );
                        })}
                      </div>
                    </div>

                    <Textarea
                      label="Notas operacionais"
                      minRows={4}
                      placeholder="Critérios do piloto, riscos, bloqueios ou próximos passos comerciais."
                      value={rolloutForm.notes}
                      onValueChange={(value) =>
                        setRolloutForm((current) => ({
                          ...current,
                          notes: value,
                        }))
                      }
                    />

                    <div className="flex justify-end">
                      <Button
                        color="primary"
                        isLoading={isPending}
                        onPress={handleSaveRollout}
                      >
                        Salvar política do tenant
                      </Button>
                    </div>
                  </CardBody>
                </Card>
              </div>

              <div className="space-y-4">
                <Card className="border border-default-200/70 bg-content1/80">
                  <CardHeader className="border-b border-default-200/70">
                    <div className="space-y-1">
                      <p className="text-lg font-semibold text-foreground">Leitura do tenant selecionado</p>
                      <p className="text-sm text-default-500">
                        Plano, rollout efetivo, progresso de adoção e janela de revisão.
                      </p>
                    </div>
                  </CardHeader>
                  <CardBody className="gap-3">
                    {selectedRolloutTenant ? (
                      <>
                        <div className="flex flex-wrap gap-2">
                          <Chip color="primary" variant="flat">
                            {selectedRolloutTenant.tenantName}
                          </Chip>
                          <Chip color="secondary" variant="flat">
                            {selectedRolloutTenant.tenantSlug}
                          </Chip>
                          <Chip color="warning" variant="flat">
                            {JURIDICAL_AI_ROLLOUT_STAGE_LABELS[selectedRolloutTenant.rolloutStage]}
                          </Chip>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="rounded-3xl border border-default-200/70 bg-default-50/40 p-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-default-500">
                              Plano vs. rollout
                            </p>
                            <p className="mt-2 text-sm font-semibold text-foreground">
                              {JURIDICAL_AI_TIER_LABELS[selectedRolloutTenant.planTier]} base
                            </p>
                            <p className="text-sm text-default-500">
                              Efetivo: {JURIDICAL_AI_TIER_LABELS[selectedRolloutTenant.effectiveTier]}
                            </p>
                          </div>
                          <div className="rounded-3xl border border-default-200/70 bg-default-50/40 p-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-default-500">
                              Onboarding
                            </p>
                            <p className="mt-2 text-sm font-semibold text-foreground">
                              {selectedRolloutTenant.completionPercent}% concluído
                            </p>
                            <p className="text-sm text-default-500">
                              {selectedRolloutTenant.totalExecutions} execuções • {selectedRolloutTenant.totalDrafts} drafts
                            </p>
                          </div>
                        </div>
                        <div className="rounded-3xl border border-default-200/70 bg-default-50/40 p-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-default-500">
                            Próxima revisão
                          </p>
                          <p className="mt-2 text-sm text-foreground">
                            {selectedRolloutTenant.nextReviewAt
                              ? formatDateTime(selectedRolloutTenant.nextReviewAt)
                              : "Sem revisão agendada"}
                          </p>
                          <p className="mt-2 text-sm text-default-500">
                            {selectedRolloutTenant.notes || "Sem notas operacionais registradas."}
                          </p>
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center justify-center py-8">
                        <Spinner size="sm" />
                      </div>
                    )}
                  </CardBody>
                </Card>

                <Card className="border border-default-200/70 bg-content1/80">
                  <CardHeader className="border-b border-default-200/70">
                    <div className="space-y-1">
                      <p className="text-lg font-semibold text-foreground">Fila de rollout</p>
                      <p className="text-sm text-default-500">
                        Todos os escritórios com leitura rápida de estágio e risco operacional.
                      </p>
                    </div>
                  </CardHeader>
                  <CardBody className="gap-3">
                    {rolloutTenants.map((tenant) => (
                      <button
                        key={tenant.tenantId}
                        className={`rounded-3xl border p-4 text-left transition ${selectedRolloutTenant?.tenantId === tenant.tenantId ? "border-primary/60 bg-primary/5" : "border-default-200/70 bg-default-50/40 hover:border-primary/35"}`}
                        type="button"
                        onClick={() => setSelectedRolloutTenantId(tenant.tenantId)}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="space-y-1">
                            <p className="text-sm font-semibold text-foreground">{tenant.tenantName}</p>
                            <p className="text-xs text-default-500">
                              {tenant.tenantSlug} • {tenant.tenantStatus}
                            </p>
                          </div>
                          <Chip color={tenant.workspaceEnabled ? "success" : "default"} size="sm" variant="flat">
                            {JURIDICAL_AI_ROLLOUT_STAGE_LABELS[tenant.rolloutStage]}
                          </Chip>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs text-default-500">
                          <span>{JURIDICAL_AI_TIER_LABELS[tenant.effectiveTier]}</span>
                          <span>•</span>
                          <span>{tenant.completionPercent}% onboarding</span>
                          <span>•</span>
                          <span>{tenant.enabledTasks.length} tarefa(s)</span>
                        </div>
                      </button>
                    ))}
                  </CardBody>
                </Card>
              </div>
            </div>
          ) : null}

          {selectedTab === "prompts" ? (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
              <div className="space-y-4">
                <Card className="border border-default-200/70 bg-content1/80">
                  <CardHeader className="border-b border-default-200/70">
                    <div className="space-y-1">
                      <p className="text-lg font-semibold text-foreground">Criar nova versão</p>
                      <p className="text-sm text-default-500">
                        Prompts nascem em rascunho e só entram em produção após publicação explícita.
                      </p>
                    </div>
                  </CardHeader>
                  <CardBody className="gap-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <SearchableSelect
                        items={[
                          { key: "tenant", label: "Tenant" },
                          { key: "admin", label: "Admin" },
                        ]}
                        label="Escopo"
                        selectedKey={promptForm.scope}
                        onSelectionChange={(value) =>
                          setPromptForm((current) => ({
                            ...current,
                            scope: (value as "tenant" | "admin") ?? "tenant",
                            ownerKey:
                              value === "admin"
                                ? "global-admin"
                                : current.ownerKey === "global-admin"
                                  ? "global"
                                  : current.ownerKey,
                          }))
                        }
                      />
                      <SearchableSelect
                        items={TASK_OPTIONS}
                        label="Tarefa"
                        selectedKey={promptForm.taskKey}
                        onSelectionChange={(value) =>
                          setPromptForm((current) => ({
                            ...current,
                            taskKey: (value as JuridicalAiTaskKey) ?? "PIECE_DRAFTING",
                          }))
                        }
                      />
                    </div>

                    {promptForm.scope === "tenant" ? (
                      <SearchableSelect
                        items={tenantOptions}
                        label="Destino do prompt"
                        selectedKey={promptForm.ownerKey}
                        isLoading={tenantsQuery.isLoading}
                        onSelectionChange={(value) =>
                          setPromptForm((current) => ({
                            ...current,
                            ownerKey: value ?? "global",
                          }))
                        }
                      />
                    ) : (
                      <Input
                        isDisabled
                        label="Destino"
                        value="Governança global do super admin"
                      />
                    )}

                    <Input
                      label="Título"
                      placeholder="Ex.: Geração de peça com linha mais conservadora"
                      value={promptForm.title}
                      onValueChange={(value) =>
                        setPromptForm((current) => ({ ...current, title: value }))
                      }
                    />
                    <Textarea
                      label="System prompt"
                      minRows={6}
                      placeholder="Defina papel, limites e postura do motor."
                      value={promptForm.systemPrompt}
                      onValueChange={(value) =>
                        setPromptForm((current) => ({ ...current, systemPrompt: value }))
                      }
                    />
                    <Textarea
                      label="Instruction prompt"
                      minRows={6}
                      placeholder="Defina a estrutura da resposta e os guardrails operacionais."
                      value={promptForm.instructionPrompt}
                      onValueChange={(value) =>
                        setPromptForm((current) => ({ ...current, instructionPrompt: value }))
                      }
                    />

                    <div className="flex justify-end">
                      <Button
                        color="primary"
                        isDisabled={
                          !promptForm.title.trim() ||
                          !promptForm.systemPrompt.trim() ||
                          !promptForm.instructionPrompt.trim()
                        }
                        isLoading={isPending}
                        onPress={handleCreatePrompt}
                      >
                        Versionar prompt
                      </Button>
                    </div>
                  </CardBody>
                </Card>
              </div>

              <div className="space-y-4">
                <Card className="border border-default-200/70 bg-content1/80">
                  <CardHeader className="border-b border-default-200/70">
                    <div className="space-y-1">
                      <p className="text-lg font-semibold text-foreground">Biblioteca atual</p>
                      <p className="text-sm text-default-500">
                        Prompts versionados por tarefa e escopo, com publish controlado.
                      </p>
                    </div>
                  </CardHeader>
                  <CardBody className="gap-3">
                    {dashboardQuery.isLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <Spinner size="sm" />
                      </div>
                    ) : (
                      (dashboardQuery.data?.prompts ?? []).map((prompt) => (
                        <div
                          key={prompt.id}
                          className="rounded-3xl border border-default-200/70 bg-default-50/40 p-4"
                          data-testid="ai-prompt-card"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="space-y-1">
                              <p className="text-sm font-semibold text-foreground">{prompt.title}</p>
                              <p className="text-xs text-default-500">
                                {JURIDICAL_AI_TASK_LABELS[prompt.taskKey]} • {prompt.scope} • {prompt.ownerKey === "global" ? "tenant global" : prompt.ownerKey === "global-admin" ? "admin global" : tenantNameMap.get(prompt.ownerKey) ?? prompt.ownerKey}
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Chip
                                color={prompt.status === "PUBLISHED" ? "success" : prompt.status === "DRAFT" ? "warning" : "default"}
                                size="sm"
                                variant="flat"
                              >
                                {prompt.status}
                              </Chip>
                              <Chip color="secondary" size="sm" variant="flat">
                                v{prompt.version}
                              </Chip>
                            </div>
                          </div>
                          <Divider className="my-3" />
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <p className="text-xs text-default-500">
                              Atualizado em {formatDateTime(prompt.updatedAt)}
                              {prompt.publishedAt ? ` • Publicado em ${formatDateTime(prompt.publishedAt)}` : ""}
                            </p>
                            {prompt.status !== "PUBLISHED" ? (
                              <Button
                                color="primary"
                                isLoading={isPending}
                                size="sm"
                                variant="flat"
                                onPress={() => handlePublishPrompt(prompt.id)}
                              >
                                Publicar
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      ))
                    )}
                  </CardBody>
                </Card>
              </div>
            </div>
          ) : null}

          {selectedTab === "usage" ? (
            <div className="grid gap-6 xl:grid-cols-2">
              <Card className="border border-default-200/70 bg-content1/80">
                <CardHeader className="border-b border-default-200/70">
                  <div className="space-y-1">
                    <p className="text-lg font-semibold text-foreground">Leitura de custo</p>
                    <p className="text-sm text-default-500">
                      Estado atual do custo agregado e da frente premium.
                    </p>
                  </div>
                </CardHeader>
                <CardBody className="gap-3 text-sm text-default-600">
                  <div className="rounded-3xl border border-default-200/70 bg-default-50/40 p-4">
                    <p className="font-semibold text-foreground">Custo acumulado</p>
                    <p className="mt-2 text-2xl font-semibold text-foreground">
                      {dashboardQuery.data
                        ? formatCurrency(dashboardQuery.data.usage.totalEstimatedCost)
                        : "—"}
                    </p>
                    <p className="mt-2 text-xs text-default-500">
                      Hoje essa fundação ainda opera majoritariamente em fallback local. O valor vai ganhar importância quando o provider LLM entrar em produção.
                    </p>
                  </div>
                  <div className="rounded-3xl border border-default-200/70 bg-default-50/40 p-4">
                    <p className="font-semibold text-foreground">Produto premium por plano</p>
                    <ul className="mt-2 space-y-2">
                      <li>• {JURIDICAL_AI_TIER_LABELS.ESSENCIAL}: mensagens e uso controlado.</li>
                      <li>• {JURIDICAL_AI_TIER_LABELS.PROFISSIONAL}: memória por caso e volume ampliado.</li>
                      <li>• {JURIDICAL_AI_TIER_LABELS.PREMIUM}: drafts ilimitados com governança interna de abuso.</li>
                    </ul>
                  </div>
                  <div className="rounded-3xl border border-default-200/70 bg-default-50/40 p-4">
                    <p className="font-semibold text-foreground">Uso faturável por tipo</p>
                    <div className="mt-3 space-y-3">
                      {(dashboardQuery.data?.usage.usageByLedgerType ?? []).map((item) => (
                        <div key={item.ledgerType} className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-foreground">{item.ledgerType}</p>
                            <p className="text-xs text-default-500">
                              Unidades registradas no ledger da IA.
                            </p>
                          </div>
                          <Chip color="secondary" variant="flat">
                            {item.totalUnits}
                          </Chip>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardBody>
              </Card>

              <Card className="border border-default-200/70 bg-content1/80">
                <CardHeader className="border-b border-default-200/70">
                  <div className="space-y-1">
                    <p className="text-lg font-semibold text-foreground">Tenants líderes da adoção</p>
                    <p className="text-sm text-default-500">
                      Recorte real de escritórios que mais usaram a IA até agora.
                    </p>
                  </div>
                </CardHeader>
                <CardBody className="gap-3">
                  {(dashboardQuery.data?.usage.topTenants ?? []).map((tenant) => (
                    <div key={tenant.tenantId} className="rounded-3xl border border-default-200/70 bg-default-50/40 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-foreground">{tenant.tenantName}</p>
                          <p className="text-xs text-default-500">
                            {tenant.tenantSlug} • {tenant.planName ?? "Sem plano"} • {tenant.tenantStatus}
                          </p>
                        </div>
                        <Chip
                          color={tenant.planName?.toLowerCase().includes("ultra") ? "success" : "primary"}
                          size="sm"
                          variant="flat"
                        >
                          {tenant.totalExecutions} exec.
                        </Chip>
                      </div>
                      <div className="mt-4 grid gap-3 md:grid-cols-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-default-500">
                            Ledger
                          </p>
                          <p className="mt-1 text-sm font-semibold text-foreground">
                            {tenant.totalUnits}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-default-500">
                            Custo
                          </p>
                          <p className="mt-1 text-sm font-semibold text-foreground">
                            {formatCurrency(tenant.totalEstimatedCost)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-default-500">
                            Última atividade
                          </p>
                          <p className="mt-1 text-sm font-semibold text-foreground">
                            {tenant.latestExecutionAt ? formatDateTime(tenant.latestExecutionAt) : "Sem dado"}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </CardBody>
              </Card>
            </div>
          ) : null}

          {selectedTab === "executions" ? (
            <Card className="border border-default-200/70 bg-content1/80">
              <CardHeader className="border-b border-default-200/70">
                <div className="space-y-1">
                  <p className="text-lg font-semibold text-foreground">Execuções recentes</p>
                  <p className="text-sm text-default-500">
                    Trilhas mais recentes para suporte, auditoria e observação do rollout.
                  </p>
                </div>
              </CardHeader>
              <CardBody className="gap-3">
                {dashboardQuery.isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Spinner size="sm" />
                  </div>
                ) : (
                  (dashboardQuery.data?.recentExecutions ?? []).map((execution) => (
                    <div key={execution.id} className="rounded-3xl border border-default-200/70 bg-default-50/40 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-foreground">{execution.action}</p>
                          <p className="text-xs text-default-500">
                            {tenantNameMap.get(execution.tenantId ?? "") ?? execution.tenantId ?? "Sem tenant"} • {execution.userId ?? "Sem usuário"}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Chip
                            color={execution.status === "SUCCESS" ? "success" : "warning"}
                            size="sm"
                            variant="flat"
                          >
                            {execution.status}
                          </Chip>
                          <Chip color="secondary" size="sm" variant="flat">
                            {execution.engine}
                          </Chip>
                        </div>
                      </div>
                      <Divider className="my-3" />
                      <p className="text-sm text-default-600">
                        {execution.outputSummary ?? "Sem resumo persistido."}
                      </p>
                      <p className="mt-3 text-xs text-default-500">
                        {formatDateTime(execution.createdAt)}
                      </p>
                    </div>
                  ))
                )}
              </CardBody>
            </Card>
          ) : null}
        </CardBody>
      </Card>
    </div>
  );
}
