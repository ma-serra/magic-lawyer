"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";

import { authOptions } from "@/auth";
import prisma from "@/app/lib/prisma";
import type { Prisma } from "@/generated/prisma";
import {
  buildAdminClicksignSummary,
  buildAdminAsaasSummary,
  buildAdminTenantChannelProviderSummary,
} from "@/app/lib/admin-integration-summaries";
import {
  getGlobalClicksignFallbackSummary,
  testClicksignConnection,
  type ResolvedClicksignConfig,
} from "@/app/lib/clicksign";
import { getGlobalTelegramProviderSummary } from "@/app/lib/notifications/telegram-provider";
import {
  testStoredTenantChannelProviderRecord,
  type TenantChannelProviderRecord,
} from "@/app/lib/tenant-channel-providers";
import {
  isTenantChannelProviderChannel,
  type TenantChannelProviderChannel,
} from "@/app/lib/omnichannel-config";
import { createAsaasClientFromEncrypted } from "@/lib/asaas";
import { decrypt } from "@/lib/crypto";
import logger from "@/lib/logger";

function resolveAdminAsaasWebhookUrl() {
  const envBase =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "").trim() ||
    "http://localhost:9192";

  return `${envBase.replace(/\/$/, "")}/api/webhooks/asaas`;
}

async function requireSuperAdmin() {
  const session = await getServerSession(authOptions);

  if (!session?.user || session.user.role !== "SUPER_ADMIN" || !session.user.id) {
    throw new Error("Acesso não autorizado");
  }

  return {
    id: session.user.id,
  };
}

async function logSuperAdminIntegrationTest(params: {
  superAdminId: string;
  tenantId: string;
  acao: string;
  dadosNovos: Prisma.InputJsonValue;
}) {
  await prisma.superAdminAuditLog.create({
    data: {
      superAdminId: params.superAdminId,
      acao: params.acao,
      entidade: "TENANT_INTEGRATION",
      entidadeId: params.tenantId,
      dadosNovos: params.dadosNovos,
    },
  });
}

export async function testTenantClicksignConnectionAsSuperAdmin(tenantId: string) {
  try {
    const user = await requireSuperAdmin();

    const config = await prisma.clicksignTenantConfig.findUnique({
      where: { tenantId },
      select: {
        id: true,
        apiBase: true,
        ambiente: true,
        integracaoAtiva: true,
        dataConfiguracao: true,
        ultimaValidacao: true,
        accessTokenEncrypted: true,
      },
    });

    const summary = buildAdminClicksignSummary(
      config,
      getGlobalClicksignFallbackSummary(),
    );

    if (summary.effectiveSource === "DISABLED") {
      return {
        success: false,
        error: "ClickSign está desativado explicitamente neste tenant.",
      } as const;
    }

    if (summary.effectiveSource === "NONE") {
      return {
        success: false,
        error: "ClickSign não está configurado para o tenant e não há fallback disponível.",
      } as const;
    }

    if (summary.effectiveSource === "TENANT" && config) {
      const effectiveConfig: ResolvedClicksignConfig = {
        apiBase: config.apiBase,
        accessToken: decrypt(config.accessTokenEncrypted),
        ambiente: config.ambiente,
        source: "TENANT",
        tenantId,
        integracaoAtiva: config.integracaoAtiva,
      };

      const testResult = await testClicksignConnection({ config: effectiveConfig });

      if (!testResult.success) {
        return {
          success: false,
          error: testResult.error || "Falha ao validar conexão com ClickSign",
        } as const;
      }

      const validatedAt = new Date();

      await prisma.clicksignTenantConfig.update({
        where: { id: config.id },
        data: { ultimaValidacao: validatedAt },
      });

      await logSuperAdminIntegrationTest({
        superAdminId: user.id,
        tenantId,
        acao: "TEST_TENANT_CLICKSIGN_CONNECTION",
        dadosNovos: {
          source: "TENANT",
          ambiente: config.ambiente,
          ultimaValidacao: validatedAt.toISOString(),
        },
      });

      revalidatePath(`/admin/tenants/${tenantId}`);

      return {
        success: true,
        data: {
          conectado: true,
          source: "TENANT" as const,
          ambiente: config.ambiente,
          ultimaValidacao: validatedAt,
        },
      } as const;
    }

    const fallbackTest = await testClicksignConnection();

    if (!fallbackTest.success) {
      return {
        success: false,
        error:
          fallbackTest.error ||
          "ClickSign fallback não pôde ser validado para este tenant.",
      } as const;
    }

    const fallback = getGlobalClicksignFallbackSummary();

    await logSuperAdminIntegrationTest({
      superAdminId: user.id,
      tenantId,
      acao: "TEST_TENANT_CLICKSIGN_CONNECTION",
      dadosNovos: {
        source: fallbackTest.data?.source ?? fallback.source,
        ambiente: fallbackTest.data?.ambiente ?? fallback.ambiente,
        ultimaValidacao: null,
      },
    });

    revalidatePath(`/admin/tenants/${tenantId}`);

    return {
      success: true,
      data: {
        conectado: true,
        source: fallbackTest.data?.source ?? fallback.source,
        ambiente: fallbackTest.data?.ambiente ?? fallback.ambiente,
        ultimaValidacao: null,
      },
    } as const;
  } catch (error) {
    logger.error("Erro ao testar ClickSign no painel admin", error);

    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao testar ClickSign",
    } as const;
  }
}

export async function testTenantAsaasConnectionAsSuperAdmin(tenantId: string) {
  try {
    const user = await requireSuperAdmin();

    const config = await prisma.tenantAsaasConfig.findUnique({
      where: { tenantId },
      select: {
        id: true,
        asaasApiKey: true,
        webhookAccessToken: true,
        asaasAccountId: true,
        asaasWalletId: true,
        ambiente: true,
        integracaoAtiva: true,
        dataConfiguracao: true,
        webhookConfiguredAt: true,
        lastWebhookAt: true,
        lastWebhookEvent: true,
        ultimaValidacao: true,
      },
    });

    const summary = buildAdminAsaasSummary(config, {
      webhookUrl: resolveAdminAsaasWebhookUrl(),
      globalWebhookSecretConfigured: Boolean(
        process.env.ASAAS_WEBHOOK_SECRET?.trim(),
      ),
    });

    if (!summary.id) {
      return {
        success: false,
        error: "Asaas não está configurado neste tenant.",
      } as const;
    }

    if (!summary.integracaoAtiva) {
      return {
        success: false,
        error: "Integração Asaas está inativa neste tenant.",
      } as const;
    }

    const asaasClient = createAsaasClientFromEncrypted(
      config!.asaasApiKey,
      config!.ambiente.toLowerCase() as "sandbox" | "production",
    );
    const connectionTest = await asaasClient.testConnection();

    if (!connectionTest) {
      return {
        success: false,
        error: "Falha ao validar a conexão com Asaas.",
      } as const;
    }

    const validatedAt = new Date();

    await prisma.tenantAsaasConfig.update({
      where: { id: config!.id },
      data: { ultimaValidacao: validatedAt },
    });

    await logSuperAdminIntegrationTest({
      superAdminId: user.id,
      tenantId,
      acao: "TEST_TENANT_ASAAS_CONNECTION",
      dadosNovos: {
        ambiente: config!.ambiente,
        ultimaValidacao: validatedAt.toISOString(),
        webhookProtected: summary.isWebhookProtected,
      },
    });

    revalidatePath(`/admin/tenants/${tenantId}`);

    return {
      success: true,
      data: {
        conectado: true,
        ambiente: config!.ambiente,
        ultimaValidacao: validatedAt,
      },
    } as const;
  } catch (error) {
    logger.error("Erro ao testar Asaas no painel admin", error);

    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao testar Asaas",
    } as const;
  }
}

export async function testTenantChannelProviderAsSuperAdmin(
  tenantId: string,
  channel: TenantChannelProviderChannel,
) {
  try {
    const user = await requireSuperAdmin();

    if (!isTenantChannelProviderChannel(channel)) {
      return {
        success: false,
        error: "Canal omnichannel inválido.",
      } as const;
    }

    const config = await prisma.tenantChannelProvider.findUnique({
      where: {
        tenantId_channel: {
          tenantId,
          channel,
        },
      },
      select: {
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
      },
    });

    const telegramFallback =
      channel === "TELEGRAM" ? getGlobalTelegramProviderSummary() : null;
    const summary = buildAdminTenantChannelProviderSummary(
      channel,
      config,
      telegramFallback?.available
        ? {
            available: true,
            provider: telegramFallback.provider,
            providerLabel: telegramFallback.providerLabel,
            displayName: telegramFallback.displayName,
            botUsername: telegramFallback.botUsername,
            healthHint: telegramFallback.healthHint,
          }
        : null,
    );

    if (!config && summary.effectiveSource === "GLOBAL") {
      await logSuperAdminIntegrationTest({
        superAdminId: user.id,
        tenantId,
        acao: "TEST_TENANT_CHANNEL_PROVIDER_CONNECTION",
        dadosNovos: {
          channel,
          provider: summary.provider,
          success: true,
          validationMode: "STRUCTURAL",
          healthStatus: "PENDING",
          effectiveSource: "GLOBAL",
        },
      });

      revalidatePath(`/admin/tenants/${tenantId}`);

      return {
        success: true,
        data: {
          channel,
          provider: summary.provider,
          validationMode: "STRUCTURAL",
          healthStatus: "PENDING",
          ultimaValidacao: new Date(),
          effectiveSource: "GLOBAL",
        },
      } as const;
    }

    if (!summary.id || !config) {
      return {
        success: false,
        error: "Canal omnichannel não configurado neste tenant.",
      } as const;
    }

    const validation = testStoredTenantChannelProviderRecord(
      config as TenantChannelProviderRecord,
    );
    const validatedAt = new Date();
    const nextHealthStatus = config.active
      ? validation.healthStatus
      : ("INACTIVE" as const);

    await prisma.tenantChannelProvider.update({
      where: { id: config.id },
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

    await logSuperAdminIntegrationTest({
      superAdminId: user.id,
      tenantId,
      acao: "TEST_TENANT_CHANNEL_PROVIDER_CONNECTION",
      dadosNovos: {
        channel,
        provider: config.provider,
        success: validation.success,
        validationMode: validation.mode,
        healthStatus: validation.success ? nextHealthStatus : "ERROR",
        active: config.active,
      },
    });

    revalidatePath(`/admin/tenants/${tenantId}`);

    return {
      success: validation.success,
      data: {
        channel,
        provider: config.provider,
        validationMode: validation.mode,
        healthStatus: validation.success ? nextHealthStatus : "ERROR",
        ultimaValidacao: validatedAt,
      },
      error: validation.success
        ? undefined
        : validation.errors[0] ?? validation.message,
    } as const;
  } catch (error) {
    logger.error("Erro ao testar provider omnichannel no painel admin", error);

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Erro ao testar provider omnichannel",
    } as const;
  }
}
