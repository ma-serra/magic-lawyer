export const HOLIDAY_EXPERIENCE_SURFACES = [
  "dashboard",
  "process",
  "andamentos",
  "agenda",
  "notifications",
] as const;

export type HolidayExperienceSurface =
  (typeof HOLIDAY_EXPERIENCE_SURFACES)[number];

export type HolidayExperienceGlobalRollout = {
  globalEnabled: boolean;
  surfaces: Record<HolidayExperienceSurface, boolean>;
  notes: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
};

export type HolidayExperienceTenantRolloutDraft = {
  enabled: boolean | null;
  surfaces: Partial<Record<HolidayExperienceSurface, boolean>>;
  notes: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
};

export type HolidayExperienceResolvedRollout = {
  globalEnabled: boolean;
  enabled: boolean;
  notes: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
  surfaces: Array<{
    key: HolidayExperienceSurface;
    label: string;
    enabled: boolean;
    source: "GLOBAL" | "TENANT";
  }>;
};

const SURFACE_LABELS: Record<HolidayExperienceSurface, string> = {
  dashboard: "Dashboard",
  process: "Processo",
  andamentos: "Andamentos",
  agenda: "Agenda",
  notifications: "Notificacoes",
};

function toIsoDate(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = typeof value === "string" ? new Date(value) : value;

  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function getDefaultHolidayExperienceGlobalRollout(): HolidayExperienceGlobalRollout {
  return {
    globalEnabled: false,
    surfaces: {
      dashboard: true,
      process: true,
      andamentos: true,
      agenda: true,
      notifications: true,
    },
    notes: null,
    updatedAt: null,
    updatedBy: null,
  };
}

export function buildHolidayExperienceGlobalRolloutFromRecord(
  record:
    | {
        globalEnabled: boolean;
        dashboardEnabled: boolean;
        processEnabled: boolean;
        andamentosEnabled: boolean;
        agendaEnabled: boolean;
        notificationsEnabled: boolean;
        notes: string | null;
        updatedAt: Date;
        updatedBy: string | null;
      }
    | null
    | undefined,
): HolidayExperienceGlobalRollout {
  if (!record) {
    return getDefaultHolidayExperienceGlobalRollout();
  }

  return {
    globalEnabled: record.globalEnabled,
    surfaces: {
      dashboard: record.dashboardEnabled,
      process: record.processEnabled,
      andamentos: record.andamentosEnabled,
      agenda: record.agendaEnabled,
      notifications: record.notificationsEnabled,
    },
    notes: record.notes ?? null,
    updatedAt: record.updatedAt.toISOString(),
    updatedBy: record.updatedBy ?? null,
  };
}

export function buildHolidayExperienceTenantRolloutFromRecord(
  record:
    | {
        enabled: boolean | null;
        dashboardEnabled: boolean | null;
        processEnabled: boolean | null;
        andamentosEnabled: boolean | null;
        agendaEnabled: boolean | null;
        notificationsEnabled: boolean | null;
        notes: string | null;
        updatedAt: Date;
        updatedBy: string | null;
      }
    | null
    | undefined,
): HolidayExperienceTenantRolloutDraft {
  if (!record) {
    return {
      enabled: null,
      surfaces: {},
      notes: null,
      updatedAt: null,
      updatedBy: null,
    };
  }

  const surfaces = HOLIDAY_EXPERIENCE_SURFACES.reduce<
    Partial<Record<HolidayExperienceSurface, boolean>>
  >((acc, surface) => {
    const value =
      surface === "dashboard"
        ? record.dashboardEnabled
        : surface === "process"
          ? record.processEnabled
          : surface === "andamentos"
            ? record.andamentosEnabled
            : surface === "agenda"
              ? record.agendaEnabled
              : record.notificationsEnabled;

    if (typeof value === "boolean") {
      acc[surface] = value;
    }

    return acc;
  }, {});

  return {
    enabled: typeof record.enabled === "boolean" ? record.enabled : null,
    surfaces,
    notes: record.notes ?? null,
    updatedAt: toIsoDate(record.updatedAt),
    updatedBy: record.updatedBy ?? null,
  };
}

export function resolveHolidayExperienceRollout(params: {
  globalRollout: HolidayExperienceGlobalRollout;
  tenantRollout?: HolidayExperienceTenantRolloutDraft | null;
}): HolidayExperienceResolvedRollout {
  const tenantDraft = params.tenantRollout ?? {
    enabled: null,
    surfaces: {},
    notes: null,
    updatedAt: null,
    updatedBy: null,
  };

  const surfaces = HOLIDAY_EXPERIENCE_SURFACES.map((key) => {
    const tenantSurfaceOverride = tenantDraft.surfaces[key];
    const globalSurface = params.globalRollout.surfaces[key];
    let enabled: boolean;
    let source: "GLOBAL" | "TENANT";

    if (typeof tenantSurfaceOverride === "boolean") {
      enabled = tenantSurfaceOverride;
      source = "TENANT";
    } else if (typeof tenantDraft.enabled === "boolean") {
      enabled = tenantDraft.enabled ? globalSurface : false;
      source = "TENANT";
    } else {
      enabled = params.globalRollout.globalEnabled ? globalSurface : false;
      source = "GLOBAL";
    }

    return {
      key,
      label: SURFACE_LABELS[key],
      enabled,
      source,
    };
  });

  return {
    globalEnabled: params.globalRollout.globalEnabled,
    enabled: surfaces.some((surface) => surface.enabled),
    notes: tenantDraft.notes ?? params.globalRollout.notes,
    updatedAt: tenantDraft.updatedAt ?? params.globalRollout.updatedAt,
    updatedBy: tenantDraft.updatedBy ?? params.globalRollout.updatedBy,
    surfaces,
  };
}
