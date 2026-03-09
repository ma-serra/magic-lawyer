"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";

import { authOptions } from "@/auth";
import prisma from "@/app/lib/prisma";
import { logAudit, toAuditJson } from "@/app/lib/audit/log";
import {
  buildTenantChannelProviderAuditPayload,
  buildTenantChannelProviderView,
  mergeTenantChannelProviderConfigs,
  testStoredTenantChannelProviderRecord,
  testTenantChannelProviderDraft,
  type TenantChannelProviderRecord,
} from "@/app/lib/tenant-channel-providers";
import {
  TENANT_CHANNEL_PROVIDER_CHANNELS,
  isTenantChannelProviderChannel,
  isTenantChannelProviderType,
  type TenantChannelProviderChannel,
  type TenantChannelProviderHealthStatus,
  type TenantChannelValidationMode,
} from "@/app/lib/omnichannel-config";
import { TENANT_PERMISSIONS } from "@/types";

function canManageTenantChannels(user: any) {
  const role = user?.role as string | undefined;
  const permissions = (user?.permissions ?? []) as string[];

  return (
    role === "SUPER_ADMIN" ||
    role === "ADMIN" ||
    permissions.includes(TENANT_PERMISSIONS.manageOfficeSettings)
  );
}

async function requireTenantChannelManager() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    throw new Error("Não autenticado");
  }

  const user = session.user as any;

  if (!canManageTenantChannels(user)) {
    throw new Error("Sem permissão para gerenciar canais do tenant");
  }

  if (!user.tenantId) {
    throw new Error("Tenant não identificado");
  }

  return {
    tenantId: user.tenantId as string,
    userId: (user.id as string | undefined) ?? null,
  };
}

function getTenantChannelProviderSelect() {
  return {
    id: true,
    tenantId: true,
    channel: true,
    provider: true,
    displayName: true,
    credentialsEncrypted: true,
    configuration: true,
    active: true,
    healthStatus: true,
    dataConfiguracao: true,
    lastValidatedAt: true,
    lastValidationMode: true,
    lastErrorAt: true,
    lastErrorMessage: true,
    createdAt: true,
    updatedAt: true,
  } as const;
}

function resolveSavedHealthState(params: {
  active: boolean;
  validationMode: TenantChannelValidationMode | null;
  validationHealthStatus: TenantChannelProviderHealthStatus | null;
}) {
  if (!params.active) {
    return "INACTIVE" as const;
  }

  if (!params.validationMode || !params.validationHealthStatus) {
    return "PENDING" as const;
  }

  return params.validationHealthStatus;
}

export async function listarTenantChannelProviders() {
  try {
    const { tenantId } = await requireTenantChannelManager();

    const providers = await prisma.tenantChannelProvider.findMany({
      where: {
        tenantId,
        channel: {
          in: [...TENANT_CHANNEL_PROVIDER_CHANNELS],
        },
      },
      select: getTenantChannelProviderSelect(),
    });

    const providersByChannel = new Map(
      providers.map((provider) => [provider.channel, provider]),
    );

    return {
      success: true,
      data: TENANT_CHANNEL_PROVIDER_CHANNELS.map((channel) =>
        buildTenantChannelProviderView(
          channel,
          (providersByChannel.get(channel) as TenantChannelProviderRecord | undefined) ??
            null,
        ),
      ),
    } as const;
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Erro ao listar canais omnichannel do tenant",
    } as const;
  }
}

export async function obterTenantChannelProvider(
  channel: TenantChannelProviderChannel,
) {
  try {
    const { tenantId } = await requireTenantChannelManager();

    if (!isTenantChannelProviderChannel(channel)) {
      return { success: false, error: "Canal inválido" } as const;
    }

    const provider = await prisma.tenantChannelProvider.findUnique({
      where: {
        tenantId_channel: {
          tenantId,
          channel,
        },
      },
      select: getTenantChannelProviderSelect(),
    });

    return {
      success: true,
      data: buildTenantChannelProviderView(
        channel,
        (provider as TenantChannelProviderRecord | null) ?? null,
      ),
    } as const;
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Erro ao carregar canal omnichannel",
    } as const;
  }
}

export async function configurarTenantChannelProvider(data: {
  channel: TenantChannelProviderChannel;
  provider: string;
  displayName?: string | null;
  active: boolean;
  publicConfig?: Record<string, unknown> | null;
  secretConfig?: Record<string, unknown> | null;
}) {
  try {
    const { tenantId, userId } = await requireTenantChannelManager();

    if (!isTenantChannelProviderChannel(data.channel)) {
      return { success: false, error: "Canal inválido" } as const;
    }

    if (!isTenantChannelProviderType(data.provider)) {
      return { success: false, error: "Provider inválido" } as const;
    }

    const existing = await prisma.tenantChannelProvider.findUnique({
      where: {
        tenantId_channel: {
          tenantId,
          channel: data.channel,
        },
      },
      select: getTenantChannelProviderSelect(),
    });

    const mergedConfig = mergeTenantChannelProviderConfigs({
      provider: data.provider,
      currentProvider: existing?.provider,
      existingPublicConfig: existing?.configuration,
      existingSecretConfig: existing?.credentialsEncrypted,
      nextPublicConfig: data.publicConfig,
      nextSecretConfig: data.secretConfig,
    });

    const validation = data.active
      ? testTenantChannelProviderDraft({
          channel: data.channel,
          provider: data.provider,
          publicConfig: mergedConfig.publicConfig,
          secretConfig: mergedConfig.secretConfig,
        })
      : null;

    if (validation && !validation.success) {
      return {
        success: false,
        error: validation.errors[0] ?? validation.message,
        details: validation.errors,
      } as const;
    }

    const now = new Date();
    const healthStatus = resolveSavedHealthState({
      active: data.active,
      validationMode: validation?.mode ?? null,
      validationHealthStatus: validation?.healthStatus ?? null,
    });

    const saved = await prisma.tenantChannelProvider.upsert({
      where: {
        tenantId_channel: {
          tenantId,
          channel: data.channel,
        },
      },
      update: {
        provider: data.provider,
        displayName: data.displayName?.trim() || null,
        configuration: mergedConfig.publicConfig,
        credentialsEncrypted: mergedConfig.credentialsEncrypted,
        active: data.active,
        healthStatus,
        lastValidatedAt: validation?.success ? now : existing?.lastValidatedAt ?? null,
        lastValidationMode: validation?.success ? validation.mode : null,
        lastErrorAt: null,
        lastErrorMessage: null,
        updatedAt: now,
      },
      create: {
        tenantId,
        channel: data.channel,
        provider: data.provider,
        displayName: data.displayName?.trim() || null,
        configuration: mergedConfig.publicConfig,
        credentialsEncrypted: mergedConfig.credentialsEncrypted,
        active: data.active,
        healthStatus,
        dataConfiguracao: now,
        lastValidatedAt: validation?.success ? now : null,
        lastValidationMode: validation?.success ? validation.mode : null,
      },
      select: getTenantChannelProviderSelect(),
    });

    const auditPayload = buildTenantChannelProviderAuditPayload({
      channel: data.channel,
      provider: data.provider,
      active: data.active,
      publicConfig: mergedConfig.publicConfig,
      secretConfig: mergedConfig.secretConfig,
      healthStatus,
      validationMode: validation?.mode ?? null,
    });

    await logAudit({
      tenantId,
      usuarioId: userId,
      acao: existing ? "TENANT_CHANNEL_PROVIDER_UPDATED" : "TENANT_CHANNEL_PROVIDER_CREATED",
      entidade: "TENANT_CHANNEL_PROVIDER",
      entidadeId: saved.id,
      dados: toAuditJson(auditPayload),
      previousValues: existing
        ? toAuditJson(
            buildTenantChannelProviderAuditPayload({
              channel: data.channel,
              provider: existing.provider,
              active: existing.active,
              publicConfig:
                (existing.configuration as Record<string, string> | null) ?? {},
              secretConfig: {},
              healthStatus: existing.healthStatus,
              validationMode: existing.lastValidationMode,
            }),
          )
        : undefined,
      changedFields: ["provider", "displayName", "active", "configuration"],
    });

    revalidatePath("/configuracoes");

    return {
      success: true,
      data: buildTenantChannelProviderView(
        data.channel,
        saved as TenantChannelProviderRecord,
      ),
      validation,
    } as const;
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Erro ao salvar configuração de canal",
    } as const;
  }
}

export async function testarTenantChannelProvider(
  channel: TenantChannelProviderChannel,
) {
  try {
    const { tenantId, userId } = await requireTenantChannelManager();

    if (!isTenantChannelProviderChannel(channel)) {
      return { success: false, error: "Canal inválido" } as const;
    }

    const existing = await prisma.tenantChannelProvider.findUnique({
      where: {
        tenantId_channel: {
          tenantId,
          channel,
        },
      },
      select: getTenantChannelProviderSelect(),
    });

    if (!existing) {
      return {
        success: false,
        error: "Canal ainda não foi configurado para este tenant.",
      } as const;
    }

    const validation = testStoredTenantChannelProviderRecord(
      existing as TenantChannelProviderRecord,
    );
    const validatedAt = new Date();
    const nextHealthStatus = existing.active
      ? validation.healthStatus
      : ("INACTIVE" as const);

    await prisma.tenantChannelProvider.update({
      where: { id: existing.id },
      data: validation.success
        ? {
            healthStatus: nextHealthStatus,
            lastValidatedAt: validatedAt,
            lastValidationMode: validation.mode,
            lastErrorAt: null,
            lastErrorMessage: null,
          }
        : {
            healthStatus: "ERROR",
            lastValidatedAt: validatedAt,
            lastValidationMode: validation.mode,
            lastErrorAt: validatedAt,
            lastErrorMessage: validation.errors[0] ?? validation.message,
          },
    });

    await logAudit({
      tenantId,
      usuarioId: userId,
      acao: "TENANT_CHANNEL_PROVIDER_TESTED",
      entidade: "TENANT_CHANNEL_PROVIDER",
      entidadeId: existing.id,
      dados: toAuditJson({
        channel,
        provider: existing.provider,
        success: validation.success,
        validationMode: validation.mode,
        healthStatus: validation.success ? nextHealthStatus : "ERROR",
        message: validation.message,
        warnings: validation.warnings,
        errors: validation.errors,
      }),
    });

    revalidatePath("/configuracoes");

    return {
      success: validation.success,
      data: {
        channel,
        provider: existing.provider,
        validationMode: validation.mode,
        healthStatus: validation.success ? nextHealthStatus : "ERROR",
        validatedAt,
        warnings: validation.warnings,
      },
      error: validation.success
        ? undefined
        : validation.errors[0] ?? validation.message,
    } as const;
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Erro ao testar canal omnichannel",
    } as const;
  }
}
