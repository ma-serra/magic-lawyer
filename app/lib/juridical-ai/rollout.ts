import type { Prisma } from "@/generated/prisma";

import { getEntitlementForTier } from "@/app/lib/juridical-ai/entitlements";
import {
  JURIDICAL_AI_TASK_LABELS,
  JURIDICAL_AI_TIER_LABELS,
} from "@/app/lib/juridical-ai/constants";
import type {
  JuridicalAiCommercialOffer,
  JuridicalAiEntitlement,
  JuridicalAiOnboardingStep,
  JuridicalAiRolloutStage,
  JuridicalAiRolloutSummary,
  JuridicalAiTaskAccess,
  JuridicalAiTaskKey,
  JuridicalAiTier,
} from "@/app/lib/juridical-ai/types";

type RawRolloutState = {
  stage?: unknown;
  workspaceEnabled?: unknown;
  tierOverride?: unknown;
  enabledTasks?: unknown;
  notes?: unknown;
  owner?: unknown;
  nextReviewAt?: unknown;
  updatedAt?: unknown;
  updatedBy?: unknown;
};

export type JuridicalAiTenantRolloutDraft = {
  stage: JuridicalAiRolloutStage;
  workspaceEnabled: boolean;
  tierOverride: JuridicalAiTier | null;
  enabledTasks: JuridicalAiTaskKey[];
  notes: string | null;
  owner: string | null;
  nextReviewAt: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
};

export type JuridicalAiRolloutMetrics = {
  processCount: number;
  documentCount: number;
  executionCount: number;
  draftCount: number;
  exportCount: number;
};

const ALL_TASK_KEYS: JuridicalAiTaskKey[] = [
  "PIECE_DRAFTING",
  "DOCUMENT_ANALYSIS",
  "QUESTION_ANSWERING",
  "CITATION_VALIDATION",
  "PROCESS_SUMMARY",
  "CASE_STRATEGY",
  "JURISPRUDENCE_BRIEF",
];

const ROLLOUT_DEFAULT_TASKS: Record<JuridicalAiRolloutStage, JuridicalAiTaskKey[]> = {
  DISABLED: [],
  PILOT: [
    "PIECE_DRAFTING",
    "DOCUMENT_ANALYSIS",
    "QUESTION_ANSWERING",
    "PROCESS_SUMMARY",
    "CASE_STRATEGY",
  ],
  CONTROLLED: [...ALL_TASK_KEYS],
  RELEASED: [...ALL_TASK_KEYS],
};

const TIER_FEATURES: Record<Exclude<JuridicalAiTier, "NONE">, string[]> = {
  ESSENCIAL: [
    "Peças auditáveis com contexto do caso.",
    "Análise documental com síntese e riscos.",
    "Pesquisa e validação jurídica com trilha básica.",
  ],
  PROFISSIONAL: [
    "Memória por caso e histórico operacional mais profundos.",
    "Maior franquia para casos complexos e fluxo intenso.",
    "Briefing jurisprudencial e estratégia com mais fôlego.",
  ],
  PREMIUM: [
    "Produção ilimitada de peças com governança do escritório.",
    "Franquias ilimitadas para rascunhos, pesquisas e validações.",
    "Suporte prioritário e rollout premium do produto.",
  ],
};

function isTaskKey(value: unknown): value is JuridicalAiTaskKey {
  return typeof value === "string" && ALL_TASK_KEYS.includes(value as JuridicalAiTaskKey);
}

function isRolloutStage(value: unknown): value is JuridicalAiRolloutStage {
  return (
    value === "DISABLED" ||
    value === "PILOT" ||
    value === "CONTROLLED" ||
    value === "RELEASED"
  );
}

function isTier(value: unknown): value is JuridicalAiTier {
  return (
    value === "NONE" ||
    value === "ESSENCIAL" ||
    value === "PROFISSIONAL" ||
    value === "PREMIUM"
  );
}

function toIsoDate(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseRolloutState(
  settings: Prisma.JsonValue | null | undefined,
): RawRolloutState {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return {};
  }

  const settingsObject = settings as Record<string, unknown>;
  const magicAi = settingsObject.magicAi;
  if (!magicAi || typeof magicAi !== "object" || Array.isArray(magicAi)) {
    return {};
  }

  const rollout = (magicAi as Record<string, unknown>).rollout;
  if (!rollout || typeof rollout !== "object" || Array.isArray(rollout)) {
    return {};
  }

  return rollout as RawRolloutState;
}

export function getRolloutDefaultTasks(stage: JuridicalAiRolloutStage) {
  return [...ROLLOUT_DEFAULT_TASKS[stage]];
}

export function parseTenantMagicAiRolloutDraft(params: {
  settings: Prisma.JsonValue | null | undefined;
  entitlement: JuridicalAiEntitlement;
}): JuridicalAiTenantRolloutDraft {
  const raw = parseRolloutState(params.settings);
  const stage =
    isRolloutStage(raw.stage)
      ? raw.stage
      : params.entitlement.isEnabled
        ? "RELEASED"
        : "DISABLED";
  const tierOverride =
    isTier(raw.tierOverride) && raw.tierOverride !== "NONE" ? raw.tierOverride : null;
  const effectiveEntitlement = tierOverride
    ? getEntitlementForTier({
        tier: tierOverride,
        planTier: params.entitlement.planTier,
        planSlug: params.entitlement.planSlug,
        planName: params.entitlement.planName,
        source: "TENANT_ROLLOUT_OVERRIDE",
        rolloutTierOverride: tierOverride,
      })
    : params.entitlement;
  const workspaceEnabled =
    typeof raw.workspaceEnabled === "boolean"
      ? raw.workspaceEnabled
      : stage !== "DISABLED" && effectiveEntitlement.isEnabled;
  const enabledTasks = Array.isArray(raw.enabledTasks)
    ? Array.from(new Set(raw.enabledTasks.filter(isTaskKey)))
    : getRolloutDefaultTasks(stage);

  return {
    stage,
    workspaceEnabled: workspaceEnabled && effectiveEntitlement.isEnabled,
    tierOverride,
    enabledTasks,
    notes: typeof raw.notes === "string" && raw.notes.trim() ? raw.notes.trim() : null,
    owner: typeof raw.owner === "string" && raw.owner.trim() ? raw.owner.trim() : null,
    nextReviewAt: toIsoDate(raw.nextReviewAt),
    updatedAt: toIsoDate(raw.updatedAt),
    updatedBy: typeof raw.updatedBy === "string" && raw.updatedBy.trim() ? raw.updatedBy.trim() : null,
  };
}

function buildOnboardingItems(metrics: JuridicalAiRolloutMetrics): JuridicalAiOnboardingStep[] {
  return [
    {
      key: "PROCESS_BASE",
      label: "Base processual pronta",
      description: "O escritório já possui ao menos um processo que pode servir de contexto.",
      completed: metrics.processCount > 0,
    },
    {
      key: "DOCUMENT_BASE",
      label: "Documentos vinculados",
      description: "Existe material documental real para alimentar análise e geração assistida.",
      completed: metrics.documentCount > 0,
    },
    {
      key: "FIRST_EXECUTION",
      label: "Primeira execução concluída",
      description: "O tenant já executou a IA pelo menos uma vez com trilha auditável.",
      completed: metrics.executionCount > 0,
    },
    {
      key: "FIRST_DRAFT",
      label: "Primeira produção jurídica",
      description: "O escritório já gerou rascunho, análise ou saída operacional relevante.",
      completed: metrics.draftCount > 0,
    },
    {
      key: "FIRST_EXPORT",
      label: "Reuso nos fluxos nativos",
      description: "A saída da IA já voltou para documentos, petições ou modelos do escritório.",
      completed: metrics.exportCount > 0,
    },
  ];
}

function buildTaskAccess(params: {
  rollout: JuridicalAiTenantRolloutDraft;
  entitlement: JuridicalAiEntitlement;
}): JuridicalAiTaskAccess[] {
  if (!params.rollout.workspaceEnabled || !params.entitlement.isEnabled) {
    return ALL_TASK_KEYS.map((taskKey) => ({
      taskKey,
      enabled: false,
      reason: "Workspace desabilitado para este tenant no rollout atual.",
    }));
  }

  const allowed = new Set(params.rollout.enabledTasks);

  return ALL_TASK_KEYS.map((taskKey) => ({
    taskKey,
    enabled: allowed.has(taskKey),
    reason: allowed.has(taskKey)
      ? `Liberada no estágio ${params.rollout.stage}.`
      : `A tarefa ${JURIDICAL_AI_TASK_LABELS[taskKey].toLowerCase()} ainda não entrou no rollout deste escritório.`,
  }));
}

export function resolveTenantMagicAiRollout(params: {
  settings: Prisma.JsonValue | null | undefined;
  entitlement: JuridicalAiEntitlement;
  metrics: JuridicalAiRolloutMetrics;
}): {
  entitlement: JuridicalAiEntitlement;
  rollout: JuridicalAiRolloutSummary;
} {
  const draft = parseTenantMagicAiRolloutDraft(params);
  const effectiveEntitlement = draft.tierOverride
    ? getEntitlementForTier({
        tier: draft.tierOverride,
        planTier: params.entitlement.planTier,
        planSlug: params.entitlement.planSlug,
        planName: params.entitlement.planName,
        source: "TENANT_ROLLOUT_OVERRIDE",
        rolloutTierOverride: draft.tierOverride,
      })
    : params.entitlement;
  const onboardingItems = buildOnboardingItems(params.metrics);
  const completedCount = onboardingItems.filter((item) => item.completed).length;
  const taskAccess = buildTaskAccess({
    rollout: draft,
    entitlement: effectiveEntitlement,
  });

  return {
    entitlement: effectiveEntitlement,
    rollout: {
      stage: draft.stage,
      workspaceEnabled: draft.workspaceEnabled,
      tierOverride: draft.tierOverride,
      owner: draft.owner,
      notes: draft.notes,
      nextReviewAt: draft.nextReviewAt,
      updatedAt: draft.updatedAt,
      updatedBy: draft.updatedBy,
      previewAccess:
        effectiveEntitlement.source === "TENANT_ROLLOUT_OVERRIDE" &&
        effectiveEntitlement.tier !== effectiveEntitlement.planTier,
      taskAccess,
      onboarding: {
        completionPercent: onboardingItems.length
          ? Math.round((completedCount / onboardingItems.length) * 100)
          : 0,
        completedCount,
        totalCount: onboardingItems.length,
        items: onboardingItems,
      },
    },
  };
}

export function isJuridicalAiTaskEnabled(
  rollout: JuridicalAiRolloutSummary,
  taskKey: JuridicalAiTaskKey,
) {
  return rollout.taskAccess.find((item) => item.taskKey === taskKey)?.enabled ?? false;
}

function getNextTier(tier: JuridicalAiTier): JuridicalAiTier | null {
  switch (tier) {
    case "NONE":
      return "ESSENCIAL";
    case "ESSENCIAL":
      return "PROFISSIONAL";
    case "PROFISSIONAL":
      return "PREMIUM";
    default:
      return null;
  }
}

export function buildTenantMagicAiCommercialOffer(params: {
  entitlement: JuridicalAiEntitlement;
  rollout: JuridicalAiRolloutSummary;
}): JuridicalAiCommercialOffer {
  if (params.rollout.previewAccess && params.entitlement.rolloutTierOverride) {
    const previewTier = params.entitlement.rolloutTierOverride as Exclude<
      JuridicalAiTier,
      "NONE"
    >;
    return {
      mode: "PILOT_OVERRIDE",
      title: `Piloto ${JURIDICAL_AI_TIER_LABELS[previewTier]} liberado`,
      description:
        "Este escritório está usando uma liberação temporária acima do plano atual para validação controlada do produto.",
      ctaLabel: "Revisar contratação em billing",
      ctaHref: "/configuracoes/billing",
      targetTier: previewTier,
      bullets: TIER_FEATURES[previewTier],
    };
  }

  const nextTier = getNextTier(params.entitlement.planTier) as Exclude<
    JuridicalAiTier,
    "NONE"
  > | null;
  if (!nextTier) {
    return {
      mode: "CURRENT_PLAN",
      title: "Catálogo premium completo ativo",
      description:
        "O escritório já está no topo da régua comercial atual do Magic AI e pode avançar em profundidade operacional.",
      ctaLabel: "Ir para billing",
      ctaHref: "/configuracoes/billing",
      targetTier: null,
      bullets: TIER_FEATURES.PREMIUM,
    };
  }

  return {
    mode: "UPSELL",
    title: `Próxima alavanca: ${JURIDICAL_AI_TIER_LABELS[nextTier]}`,
    description:
      params.entitlement.planTier === "NONE"
        ? "O escritório ainda não tem um plano de IA ativo. A ativação comercial libera o catálogo inicial do assistente."
        : `O próximo nível amplia a capacidade do escritório e reduz os gargalos da operação atual do plano ${JURIDICAL_AI_TIER_LABELS[params.entitlement.planTier]}.`,
    ctaLabel: "Revisar upgrade em billing",
    ctaHref: "/configuracoes/billing",
    targetTier: nextTier,
    bullets: TIER_FEATURES[nextTier],
  };
}

export function mergeTenantMagicAiRolloutIntoSettings(params: {
  settings: Prisma.JsonValue | null | undefined;
  rollout: JuridicalAiTenantRolloutDraft;
}): Prisma.InputJsonValue {
  const baseSettings =
    params.settings && typeof params.settings === "object" && !Array.isArray(params.settings)
      ? { ...(params.settings as Record<string, unknown>) }
      : {};
  const magicAi =
    baseSettings.magicAi && typeof baseSettings.magicAi === "object" && !Array.isArray(baseSettings.magicAi)
      ? { ...(baseSettings.magicAi as Record<string, unknown>) }
      : {};

  return {
    ...baseSettings,
    magicAi: {
      ...magicAi,
      rollout: {
        stage: params.rollout.stage,
        workspaceEnabled: params.rollout.workspaceEnabled,
        tierOverride: params.rollout.tierOverride,
        enabledTasks: params.rollout.enabledTasks,
        notes: params.rollout.notes,
        owner: params.rollout.owner,
        nextReviewAt: params.rollout.nextReviewAt,
        updatedAt: params.rollout.updatedAt,
        updatedBy: params.rollout.updatedBy,
      },
    },
  } satisfies Prisma.JsonObject;
}
