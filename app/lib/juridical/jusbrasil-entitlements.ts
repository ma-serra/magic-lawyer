export const JUSBRASIL_ALLOWED_PLAN_SLUGS = [
  "pro",
  "enterprise",
  "ultra",
] as const;

export const JUSBRASIL_MINIMUM_PLAN_LABEL = "Pro";

export type JusbrasilPlanEligibility = {
  planSlug: string | null;
  planName: string | null;
  eligibleByPlan: boolean;
  eligibilityReason: string;
};

export function normalizeJusbrasilPlanSlug(planSlug?: string | null) {
  const normalized = planSlug?.trim().toLowerCase() || "";
  return normalized || null;
}

export function isJusbrasilPlanSlugEligible(planSlug?: string | null) {
  const normalized = normalizeJusbrasilPlanSlug(planSlug);
  return normalized
    ? JUSBRASIL_ALLOWED_PLAN_SLUGS.includes(
        normalized as (typeof JUSBRASIL_ALLOWED_PLAN_SLUGS)[number],
      )
    : false;
}

export function buildJusbrasilPlanEligibility(params: {
  planSlug?: string | null;
  planName?: string | null;
}): JusbrasilPlanEligibility {
  const planSlug = normalizeJusbrasilPlanSlug(params.planSlug);
  const planName = params.planName?.trim() || null;
  const eligibleByPlan = isJusbrasilPlanSlugEligible(planSlug);

  if (eligibleByPlan) {
    return {
      planSlug,
      planName,
      eligibleByPlan,
      eligibilityReason:
        "Plano elegivel para ativacao manual do Jusbrasil.",
    };
  }

  if (!planSlug) {
    return {
      planSlug,
      planName,
      eligibleByPlan,
      eligibilityReason:
        "Disponivel apenas para escritorios com plano Pro ou superior.",
    };
  }

  return {
    planSlug,
    planName,
    eligibleByPlan,
    eligibilityReason: `Disponivel apenas para planos ${JUSBRASIL_MINIMUM_PLAN_LABEL}, Enterprise e Ultra.`,
  };
}
