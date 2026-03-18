import prisma from "@/app/lib/prisma";
import type {
  JuridicalAiEntitlement,
  JuridicalAiQuota,
  JuridicalAiTier,
  JuridicalAiUsageSummary,
} from "@/app/lib/juridical-ai/types";

const AI_QUOTAS: Record<Exclude<JuridicalAiTier, "NONE">, JuridicalAiQuota> = {
  ESSENCIAL: {
    messagesPerMonth: 30,
    documentAnalysesPerMonth: 20,
    draftsPerMonth: 8,
    searchesPerMonth: 20,
    citationValidationsPerMonth: 25,
  },
  PROFISSIONAL: {
    messagesPerMonth: 150,
    documentAnalysesPerMonth: 80,
    draftsPerMonth: 30,
    searchesPerMonth: 100,
    citationValidationsPerMonth: 120,
  },
  PREMIUM: {
    messagesPerMonth: null,
    documentAnalysesPerMonth: null,
    draftsPerMonth: null,
    searchesPerMonth: null,
    citationValidationsPerMonth: null,
  },
};

function getTierForPlanSlug(planSlug: string | null | undefined): JuridicalAiTier {
  switch ((planSlug || "").toLowerCase()) {
    case "basico":
      return "ESSENCIAL";
    case "pro":
      return "PROFISSIONAL";
    case "enterprise":
    case "ultra":
      return "PREMIUM";
    default:
      return "NONE";
  }
}

export function getQuotaForTier(tier: JuridicalAiTier): JuridicalAiQuota {
  if (tier === "NONE") {
    return {
      messagesPerMonth: 0,
      documentAnalysesPerMonth: 0,
      draftsPerMonth: 0,
      searchesPerMonth: 0,
      citationValidationsPerMonth: 0,
    };
  }

  return AI_QUOTAS[tier];
}

export function getEntitlementForTier(params: {
  tier: JuridicalAiTier;
  source: JuridicalAiEntitlement["source"];
  planSlug?: string | null;
  planName?: string | null;
  planTier?: JuridicalAiTier;
  rolloutTierOverride?: JuridicalAiTier | null;
}): JuridicalAiEntitlement {
  return {
    tier: params.tier,
    planTier: params.planTier ?? params.tier,
    source: params.source,
    planSlug: params.planSlug ?? null,
    planName: params.planName ?? null,
    rolloutTierOverride: params.rolloutTierOverride ?? null,
    isEnabled: params.tier !== "NONE",
    allowCaseMemory: params.tier === "PROFISSIONAL" || params.tier === "PREMIUM",
    allowPrioritySupport: params.tier === "PREMIUM",
    allowUnlimitedDrafts: params.tier === "PREMIUM",
    quotas: getQuotaForTier(params.tier),
  };
}

export function getEntitlementForPlan(params: {
  planSlug?: string | null;
  planName?: string | null;
  isSuperAdmin?: boolean;
}): JuridicalAiEntitlement {
  if (params.isSuperAdmin) {
    return getEntitlementForTier({
      tier: "PREMIUM",
      planTier: "PREMIUM",
      source: "SUPER_ADMIN",
      planSlug: params.planSlug ?? null,
      planName: params.planName ?? "Super admin",
    });
  }

  const tier = getTierForPlanSlug(params.planSlug);
  return getEntitlementForTier({
    tier,
    planTier: tier,
    source: "TENANT_PLAN",
    planSlug: params.planSlug ?? null,
    planName: params.planName ?? null,
  });
}

export async function getTenantAiEntitlement(
  tenantId: string,
): Promise<JuridicalAiEntitlement> {
  const subscription = await prisma.tenantSubscription.findUnique({
    where: { tenantId },
    select: {
      plano: {
        select: {
          slug: true,
          nome: true,
        },
      },
    },
  });

  return getEntitlementForPlan({
    planSlug: subscription?.plano?.slug ?? null,
    planName: subscription?.plano?.nome ?? null,
  });
}

export function getCurrentUsagePeriodKey(date = new Date()) {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}`;
}

export async function getTenantAiUsageSummary(
  tenantId: string,
  userId?: string | null,
): Promise<JuridicalAiUsageSummary> {
  const periodKey = getCurrentUsagePeriodKey();
  const usage = await prisma.aiUsageLedger.groupBy({
    by: ["ledgerType"],
    where: {
      tenantId,
      periodKey,
      ...(userId ? { userId } : {}),
    },
    _sum: {
      units: true,
    },
  });

  const usageMap = new Map(
    usage.map((entry) => [entry.ledgerType, entry._sum.units ?? 0]),
  );

  return {
    periodKey,
    messagesUsed: usageMap.get("MESSAGE") ?? 0,
    draftsUsed: usageMap.get("DRAFT") ?? 0,
    analysesUsed: usageMap.get("ANALYSIS") ?? 0,
    searchesUsed: usageMap.get("SEARCH") ?? 0,
    citationValidationsUsed: usageMap.get("CITATION_VALIDATION") ?? 0,
  };
}

export function isQuotaExceeded(params: {
  quota: number | null;
  used: number;
  toConsume?: number;
}) {
  if (params.quota === null) {
    return false;
  }

  return params.used + (params.toConsume ?? 1) > params.quota;
}
