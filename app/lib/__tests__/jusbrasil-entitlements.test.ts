import {
  buildJusbrasilPlanEligibility,
  isJusbrasilPlanSlugEligible,
} from "@/app/lib/juridical/jusbrasil-entitlements";

describe("jusbrasil entitlements", () => {
  it("mantem bloqueado quando nao ha plano ou o plano e basico", () => {
    expect(isJusbrasilPlanSlugEligible(null)).toBe(false);
    expect(isJusbrasilPlanSlugEligible("basico")).toBe(false);

    expect(
      buildJusbrasilPlanEligibility({
        planSlug: "basico",
        planName: "Basico",
      }),
    ).toMatchObject({
      eligibleByPlan: false,
      planSlug: "basico",
      planName: "Basico",
    });
  });

  it("libera a partir do plano pro", () => {
    expect(isJusbrasilPlanSlugEligible("pro")).toBe(true);
    expect(isJusbrasilPlanSlugEligible("enterprise")).toBe(true);
    expect(isJusbrasilPlanSlugEligible("ultra")).toBe(true);
    expect(isJusbrasilPlanSlugEligible("PRO")).toBe(true);
  });

  it("retorna mensagem comercial clara para planos nao elegiveis", () => {
    const eligibility = buildJusbrasilPlanEligibility({
      planSlug: "basico",
      planName: "Basico",
    });

    expect(eligibility.eligibleByPlan).toBe(false);
    expect(eligibility.eligibilityReason).toContain("Pro");
    expect(eligibility.eligibilityReason).toContain("Enterprise");
    expect(eligibility.eligibilityReason).toContain("Ultra");
  });
});
