import {
  buildHolidayExperienceGlobalRolloutFromRecord,
  buildHolidayExperienceTenantRolloutFromRecord,
  resolveHolidayExperienceRollout,
} from "@/app/lib/feriados/experience-rollout";

describe("holiday experience rollout", () => {
  it("falls back to the global rollout when there is no tenant override", () => {
    const globalRollout = buildHolidayExperienceGlobalRolloutFromRecord({
      globalEnabled: true,
      dashboardEnabled: true,
      processEnabled: true,
      andamentosEnabled: false,
      agendaEnabled: true,
      notificationsEnabled: true,
      notes: "global",
      updatedAt: new Date("2026-04-03T12:00:00.000Z"),
      updatedBy: "admin@magiclawyer.com.br",
    });

    const resolved = resolveHolidayExperienceRollout({
      globalRollout,
      tenantRollout: null,
    });

    expect(resolved.enabled).toBe(true);
    expect(
      resolved.surfaces.find((surface) => surface.key === "dashboard"),
    ).toMatchObject({
      enabled: true,
      source: "GLOBAL",
    });
    expect(
      resolved.surfaces.find((surface) => surface.key === "andamentos"),
    ).toMatchObject({
      enabled: false,
      source: "GLOBAL",
    });
  });

  it("lets a tenant opt in even when the global gate is off", () => {
    const globalRollout = buildHolidayExperienceGlobalRolloutFromRecord({
      globalEnabled: false,
      dashboardEnabled: true,
      processEnabled: true,
      andamentosEnabled: true,
      agendaEnabled: true,
      notificationsEnabled: true,
      notes: null,
      updatedAt: new Date("2026-04-03T12:00:00.000Z"),
      updatedBy: null,
    });
    const tenantRollout = buildHolidayExperienceTenantRolloutFromRecord({
      enabled: true,
      dashboardEnabled: null,
      processEnabled: true,
      andamentosEnabled: false,
      agendaEnabled: null,
      notificationsEnabled: null,
      notes: "piloto controlado",
      updatedAt: new Date("2026-04-03T13:00:00.000Z"),
      updatedBy: "owner@tenant.com",
    });

    const resolved = resolveHolidayExperienceRollout({
      globalRollout,
      tenantRollout,
    });

    expect(resolved.enabled).toBe(true);
    expect(
      resolved.surfaces.find((surface) => surface.key === "process"),
    ).toMatchObject({
      enabled: true,
      source: "TENANT",
    });
    expect(
      resolved.surfaces.find((surface) => surface.key === "andamentos"),
    ).toMatchObject({
      enabled: false,
      source: "TENANT",
    });
    expect(resolved.notes).toBe("piloto controlado");
    expect(resolved.updatedBy).toBe("owner@tenant.com");
  });
});
