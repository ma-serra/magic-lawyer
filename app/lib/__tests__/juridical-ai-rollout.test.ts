import { getEntitlementForPlan } from "@/app/lib/juridical-ai/entitlements";
import {
  buildTenantMagicAiCommercialOffer,
  mergeTenantMagicAiRolloutIntoSettings,
  resolveTenantMagicAiRollout,
} from "@/app/lib/juridical-ai/rollout";

describe("juridical ai rollout", () => {
  it("mantém tenant sem plano com workspace bloqueado por padrão", () => {
    const entitlement = getEntitlementForPlan({
      planSlug: null,
      planName: null,
    });

    const resolved = resolveTenantMagicAiRollout({
      settings: null,
      entitlement,
      metrics: {
        processCount: 0,
        documentCount: 0,
        executionCount: 0,
        draftCount: 0,
        exportCount: 0,
      },
    });

    expect(resolved.entitlement.tier).toBe("NONE");
    expect(resolved.rollout.stage).toBe("DISABLED");
    expect(resolved.rollout.workspaceEnabled).toBe(false);
    expect(resolved.rollout.taskAccess.every((item) => item.enabled === false)).toBe(true);
  });

  it("aplica override premium de rollout sobre plano essencial", () => {
    const entitlement = getEntitlementForPlan({
      planSlug: "basico",
      planName: "Básico",
    });

    const resolved = resolveTenantMagicAiRollout({
      settings: {
        magicAi: {
          rollout: {
            stage: "PILOT",
            workspaceEnabled: true,
            tierOverride: "PREMIUM",
            enabledTasks: ["PIECE_DRAFTING", "DOCUMENT_ANALYSIS"],
          },
        },
      },
      entitlement,
      metrics: {
        processCount: 1,
        documentCount: 1,
        executionCount: 2,
        draftCount: 1,
        exportCount: 0,
      },
    });

    expect(resolved.entitlement.source).toBe("TENANT_ROLLOUT_OVERRIDE");
    expect(resolved.entitlement.planTier).toBe("ESSENCIAL");
    expect(resolved.entitlement.tier).toBe("PREMIUM");
    expect(resolved.rollout.previewAccess).toBe(true);
    expect(
      resolved.rollout.taskAccess.find((item) => item.taskKey === "PIECE_DRAFTING")?.enabled,
    ).toBe(true);
    expect(
      resolved.rollout.taskAccess.find(
        (item) => item.taskKey === "CITATION_VALIDATION",
      )?.enabled,
    ).toBe(false);
  });

  it("gera oferta comercial de piloto quando houver override", () => {
    const entitlement = getEntitlementForPlan({
      planSlug: "pro",
      planName: "Profissional",
    });

    const resolved = resolveTenantMagicAiRollout({
      settings: {
        magicAi: {
          rollout: {
            stage: "CONTROLLED",
            workspaceEnabled: true,
            tierOverride: "PREMIUM",
          },
        },
      },
      entitlement,
      metrics: {
        processCount: 1,
        documentCount: 1,
        executionCount: 1,
        draftCount: 1,
        exportCount: 1,
      },
    });

    const offer = buildTenantMagicAiCommercialOffer({
      entitlement: resolved.entitlement,
      rollout: resolved.rollout,
    });

    expect(offer.mode).toBe("PILOT_OVERRIDE");
    expect(offer.targetTier).toBe("PREMIUM");
    expect(offer.bullets.length).toBeGreaterThan(0);
  });

  it("mescla rollout em tenant.settings sem perder outras configurações", () => {
    const merged = mergeTenantMagicAiRolloutIntoSettings({
      settings: {
        draft: {
          foo: "bar",
        },
        magicAi: {
          foo: "keep",
        },
      },
      rollout: {
        stage: "RELEASED",
        workspaceEnabled: true,
        tierOverride: null,
        enabledTasks: ["PIECE_DRAFTING"],
        notes: "Liberado",
        owner: "Produto",
        nextReviewAt: null,
        updatedAt: "2026-03-18T00:00:00.000Z",
        updatedBy: "Produto",
      },
    });

    expect(merged).toMatchObject({
      draft: {
        foo: "bar",
      },
      magicAi: {
        foo: "keep",
        rollout: {
          stage: "RELEASED",
          enabledTasks: ["PIECE_DRAFTING"],
          notes: "Liberado",
        },
      },
    });
  });
});
