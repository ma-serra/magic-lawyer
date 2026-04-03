"use server";

import { Prisma } from "@/generated/prisma";
import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";

import { authOptions } from "@/auth";
import prisma from "@/app/lib/prisma";
import {
  buildHolidayExperienceGlobalRolloutFromRecord,
  buildHolidayExperienceTenantRolloutFromRecord,
  getDefaultHolidayExperienceGlobalRollout,
  resolveHolidayExperienceRollout,
  type HolidayExperienceGlobalRollout,
  type HolidayExperienceSurface,
  type HolidayExperienceTenantRolloutDraft,
} from "@/app/lib/feriados/experience-rollout";

async function requireSuperAdmin() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id || session.user.role !== "SUPER_ADMIN") {
    throw new Error("Acesso nao autorizado");
  }

  return {
    id: session.user.id,
    email: session.user.email ?? null,
  };
}

export type HolidayExperienceAdminDashboard = {
  catalog: {
    sharedCount: number;
    tenantCount: number;
    byType: Array<{
      tipo: string;
      total: number;
      shared: number;
      tenant: number;
    }>;
  };
  rollout: HolidayExperienceGlobalRollout;
  rolloutTenants: Array<{
    tenantId: string;
    tenantName: string;
    tenantSlug: string;
    tenantStatus: string;
    manualHolidayCount: number;
    overrideEnabled: boolean | null;
    surfaceOverrides: Partial<Record<HolidayExperienceSurface, boolean>>;
    enabledSurfaces: HolidayExperienceSurface[];
    disabledSurfaces: HolidayExperienceSurface[];
    rolloutEnabled: boolean;
    notes: string | null;
    updatedAt: string | null;
    updatedBy: string | null;
  }>;
  audit: Array<{
    id: string;
    action: string;
    entityId: string | null;
    createdAt: string;
    actorId: string;
  }>;
};

function serializeGlobalRolloutForAudit(
  rollout:
    | {
        globalEnabled: boolean;
        dashboardEnabled: boolean;
        processEnabled: boolean;
        andamentosEnabled: boolean;
        agendaEnabled: boolean;
        notificationsEnabled: boolean;
        notes: string | null;
        updatedBy: string | null;
      }
    | null
    | undefined,
) {
  if (!rollout) {
    return Prisma.JsonNull;
  }

  return {
    globalEnabled: rollout.globalEnabled,
    dashboardEnabled: rollout.dashboardEnabled,
    processEnabled: rollout.processEnabled,
    andamentosEnabled: rollout.andamentosEnabled,
    agendaEnabled: rollout.agendaEnabled,
    notificationsEnabled: rollout.notificationsEnabled,
    notes: rollout.notes,
    updatedBy: rollout.updatedBy,
  } satisfies Prisma.InputJsonValue;
}

function serializeTenantRolloutForAudit(
  rollout:
    | {
        tenantId: string;
        enabled: boolean | null;
        dashboardEnabled: boolean | null;
        processEnabled: boolean | null;
        andamentosEnabled: boolean | null;
        agendaEnabled: boolean | null;
        notificationsEnabled: boolean | null;
        notes: string | null;
        updatedBy: string | null;
      }
    | null
    | undefined,
) {
  if (!rollout) {
    return Prisma.JsonNull;
  }

  return {
    tenantId: rollout.tenantId,
    enabled: rollout.enabled,
    dashboardEnabled: rollout.dashboardEnabled,
    processEnabled: rollout.processEnabled,
    andamentosEnabled: rollout.andamentosEnabled,
    agendaEnabled: rollout.agendaEnabled,
    notificationsEnabled: rollout.notificationsEnabled,
    notes: rollout.notes,
    updatedBy: rollout.updatedBy,
  } satisfies Prisma.InputJsonValue;
}

export async function getHolidayExperienceAdminDashboard(): Promise<{
  success: boolean;
  data?: HolidayExperienceAdminDashboard;
  error?: string;
}> {
  try {
    await requireSuperAdmin();

    const [
      rolloutRecord,
      tenantRolloutRecords,
      tenants,
      holidayTypeCounts,
      tenantHolidayCounts,
      auditRows,
    ] = await Promise.all([
      prisma.holidayExperienceRollout.findUnique({
        where: { id: "global" },
      }),
      prisma.holidayExperienceTenantRollout.findMany({
        select: {
          tenantId: true,
          enabled: true,
          dashboardEnabled: true,
          processEnabled: true,
          andamentosEnabled: true,
          agendaEnabled: true,
          notificationsEnabled: true,
          notes: true,
          updatedAt: true,
          updatedBy: true,
        },
      }),
      prisma.tenant.findMany({
        where: {
          slug: {
            not: "global",
          },
        },
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      }),
      prisma.feriado.groupBy({
        by: ["tipo", "tenantId"],
        where: {
          deletedAt: null,
        },
        _count: {
          _all: true,
        },
      }),
      prisma.feriado.groupBy({
        by: ["tenantId"],
        where: {
          deletedAt: null,
          tenantId: {
            not: null,
          },
        },
        _count: {
          _all: true,
        },
      }),
      prisma.superAdminAuditLog.findMany({
        where: {
          acao: {
            in: [
              "HOLIDAY_EXPERIENCE_GLOBAL_UPDATED",
              "HOLIDAY_EXPERIENCE_TENANT_UPDATED",
            ],
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 12,
      }),
    ]);

    const rollout = buildHolidayExperienceGlobalRolloutFromRecord(rolloutRecord);
    const tenantRolloutMap = new Map(
      tenantRolloutRecords.map((record) => [
        record.tenantId,
        buildHolidayExperienceTenantRolloutFromRecord(record),
      ]),
    );
    const tenantHolidayCountMap = new Map(
      tenantHolidayCounts
        .filter((item) => Boolean(item.tenantId))
        .map((item) => [item.tenantId as string, item._count._all]),
    );

    const rolloutTenants = tenants.map((tenant) => {
      const tenantRollout = tenantRolloutMap.get(tenant.id) ?? null;
      const resolved = resolveHolidayExperienceRollout({
        globalRollout: rollout,
        tenantRollout,
      });

      return {
        tenantId: tenant.id,
        tenantName: tenant.name,
        tenantSlug: tenant.slug,
        tenantStatus: tenant.status,
        manualHolidayCount: tenantHolidayCountMap.get(tenant.id) ?? 0,
        overrideEnabled: tenantRollout?.enabled ?? null,
        surfaceOverrides: tenantRollout?.surfaces ?? {},
        enabledSurfaces: resolved.surfaces
          .filter((surface) => surface.enabled)
          .map((surface) => surface.key),
        disabledSurfaces: resolved.surfaces
          .filter((surface) => !surface.enabled)
          .map((surface) => surface.key),
        rolloutEnabled: resolved.enabled,
        notes: tenantRollout?.notes ?? null,
        updatedAt: tenantRollout?.updatedAt ?? null,
        updatedBy: tenantRollout?.updatedBy ?? null,
      };
    });

    const typeMap = new Map<
      string,
      { tipo: string; total: number; shared: number; tenant: number }
    >();

    for (const row of holidayTypeCounts) {
      const current = typeMap.get(row.tipo) ?? {
        tipo: row.tipo,
        total: 0,
        shared: 0,
        tenant: 0,
      };

      current.total += row._count._all;
      if (row.tenantId) {
        current.tenant += row._count._all;
      } else {
        current.shared += row._count._all;
      }

      typeMap.set(row.tipo, current);
    }

    return {
      success: true,
      data: {
        catalog: {
          sharedCount: holidayTypeCounts
            .filter((row) => row.tenantId === null)
            .reduce((sum, row) => sum + row._count._all, 0),
          tenantCount: holidayTypeCounts
            .filter((row) => row.tenantId !== null)
            .reduce((sum, row) => sum + row._count._all, 0),
          byType: Array.from(typeMap.values()).sort((a, b) =>
            a.tipo.localeCompare(b.tipo),
          ),
        },
        rollout,
        rolloutTenants,
        audit: auditRows.map((row) => ({
          id: row.id,
          action: row.acao,
          entityId: row.entidadeId ?? null,
          createdAt: row.createdAt.toISOString(),
          actorId: row.superAdminId,
        })),
      },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Nao foi possivel carregar a governanca de feriados",
    };
  }
}

export async function getMyHolidayExperienceRollout(): Promise<{
  success: boolean;
  data?: ReturnType<typeof resolveHolidayExperienceRollout>;
  error?: string;
}> {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return { success: false, error: "Nao autorizado" };
    }

    if (!session.user.tenantId) {
      return {
        success: true,
        data: resolveHolidayExperienceRollout({
          globalRollout: getDefaultHolidayExperienceGlobalRollout(),
          tenantRollout: null,
        }),
      };
    }

    const [rolloutRecord, tenantRolloutRecord] = await Promise.all([
      prisma.holidayExperienceRollout.findUnique({
        where: { id: "global" },
      }),
      prisma.holidayExperienceTenantRollout.findUnique({
        where: { tenantId: session.user.tenantId },
      }),
    ]);

    return {
      success: true,
      data: resolveHolidayExperienceRollout({
        globalRollout: buildHolidayExperienceGlobalRolloutFromRecord(
          rolloutRecord,
        ),
        tenantRollout: buildHolidayExperienceTenantRolloutFromRecord(
          tenantRolloutRecord,
        ),
      }),
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Nao foi possivel resolver o rollout de feriados",
    };
  }
}

export async function updateHolidayExperienceGlobalRollout(input: {
  globalEnabled: boolean;
  surfaces: Record<HolidayExperienceSurface, boolean>;
  notes?: string | null;
}) {
  try {
    const admin = await requireSuperAdmin();

    const previous = await prisma.holidayExperienceRollout.findUnique({
      where: { id: "global" },
    });

    const saved = await prisma.holidayExperienceRollout.upsert({
      where: { id: "global" },
      create: {
        id: "global",
        globalEnabled: input.globalEnabled,
        dashboardEnabled: input.surfaces.dashboard,
        processEnabled: input.surfaces.process,
        andamentosEnabled: input.surfaces.andamentos,
        agendaEnabled: input.surfaces.agenda,
        notificationsEnabled: input.surfaces.notifications,
        notes: input.notes?.trim() || null,
        updatedBy: admin.email ?? admin.id,
      },
      update: {
        globalEnabled: input.globalEnabled,
        dashboardEnabled: input.surfaces.dashboard,
        processEnabled: input.surfaces.process,
        andamentosEnabled: input.surfaces.andamentos,
        agendaEnabled: input.surfaces.agenda,
        notificationsEnabled: input.surfaces.notifications,
        notes: input.notes?.trim() || null,
        updatedBy: admin.email ?? admin.id,
      },
    });

    await prisma.superAdminAuditLog.create({
      data: {
        superAdminId: admin.id,
        acao: "HOLIDAY_EXPERIENCE_GLOBAL_UPDATED",
        entidade: "HolidayExperienceRollout",
        entidadeId: saved.id,
        dadosAntigos: serializeGlobalRolloutForAudit(previous),
        dadosNovos: serializeGlobalRolloutForAudit(saved),
      },
    });

    revalidatePath("/admin/feriados");

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Nao foi possivel atualizar o rollout global",
    };
  }
}

export async function updateHolidayExperienceTenantRollout(input: {
  tenantId: string;
  enabled: boolean | null;
  surfaces: Partial<Record<HolidayExperienceSurface, boolean>>;
  notes?: string | null;
}) {
  try {
    const admin = await requireSuperAdmin();

    const tenant = await prisma.tenant.findUnique({
      where: { id: input.tenantId },
      select: {
        id: true,
      },
    });

    if (!tenant) {
      return { success: false, error: "Tenant nao encontrado" };
    }

    const previous = await prisma.holidayExperienceTenantRollout.findUnique({
      where: { tenantId: tenant.id },
    });

    const saved = await prisma.holidayExperienceTenantRollout.upsert({
      where: { tenantId: tenant.id },
      create: {
        tenantId: tenant.id,
        enabled: input.enabled,
        dashboardEnabled:
          typeof input.surfaces.dashboard === "boolean"
            ? input.surfaces.dashboard
            : null,
        processEnabled:
          typeof input.surfaces.process === "boolean"
            ? input.surfaces.process
            : null,
        andamentosEnabled:
          typeof input.surfaces.andamentos === "boolean"
            ? input.surfaces.andamentos
            : null,
        agendaEnabled:
          typeof input.surfaces.agenda === "boolean"
            ? input.surfaces.agenda
            : null,
        notificationsEnabled:
          typeof input.surfaces.notifications === "boolean"
            ? input.surfaces.notifications
            : null,
        notes: input.notes?.trim() || null,
        updatedBy: admin.email ?? admin.id,
      },
      update: {
        enabled: input.enabled,
        dashboardEnabled:
          typeof input.surfaces.dashboard === "boolean"
            ? input.surfaces.dashboard
            : null,
        processEnabled:
          typeof input.surfaces.process === "boolean"
            ? input.surfaces.process
            : null,
        andamentosEnabled:
          typeof input.surfaces.andamentos === "boolean"
            ? input.surfaces.andamentos
            : null,
        agendaEnabled:
          typeof input.surfaces.agenda === "boolean"
            ? input.surfaces.agenda
            : null,
        notificationsEnabled:
          typeof input.surfaces.notifications === "boolean"
            ? input.surfaces.notifications
            : null,
        notes: input.notes?.trim() || null,
        updatedBy: admin.email ?? admin.id,
      },
    });

    await prisma.superAdminAuditLog.create({
      data: {
        superAdminId: admin.id,
        acao: "HOLIDAY_EXPERIENCE_TENANT_UPDATED",
        entidade: "HolidayExperienceTenantRollout",
        entidadeId: tenant.id,
        dadosAntigos: serializeTenantRolloutForAudit(previous),
        dadosNovos: serializeTenantRolloutForAudit(saved),
      },
    });

    revalidatePath("/admin/feriados");

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Nao foi possivel atualizar o rollout do tenant",
    };
  }
}
