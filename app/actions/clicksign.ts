"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";

import { authOptions } from "@/auth";
import prisma from "@/app/lib/prisma";
import { logAudit, toAuditJson } from "@/app/lib/audit/log";
import {
  getGlobalClicksignFallbackSummary,
  testClicksignConnection,
  type ResolvedClicksignConfig,
} from "@/app/lib/clicksign";
import {
  type ClicksignAmbiente,
  isValidClicksignApiBase,
  normalizeClicksignApiBase,
} from "@/app/lib/clicksign-config";
import { encrypt, decrypt } from "@/lib/crypto";
import { TENANT_PERMISSIONS } from "@/types";

type ClicksignEffectiveSource = "TENANT" | "GLOBAL" | "MOCK" | "DISABLED" | "NONE";

function canManageClicksign(user: any) {
  const role = user?.role as string | undefined;
  const permissions = (user?.permissions ?? []) as string[];

  return (
    role === "SUPER_ADMIN" ||
    role === "ADMIN" ||
    permissions.includes(TENANT_PERMISSIONS.manageOfficeSettings)
  );
}

function resolveEffectiveSource(params: {
  hasTenantConfig: boolean;
  integracaoAtiva: boolean;
  fallbackAvailable: boolean;
  fallbackSource: "GLOBAL" | "MOCK";
}): ClicksignEffectiveSource {
  if (params.hasTenantConfig) {
    return params.integracaoAtiva ? "TENANT" : "DISABLED";
  }

  return params.fallbackAvailable ? params.fallbackSource : "NONE";
}

function buildTenantConfigResponse(
  config: {
    id: string;
    apiBase: string;
    ambiente: ClicksignAmbiente;
    integracaoAtiva: boolean;
    dataConfiguracao: Date;
    ultimaValidacao: Date | null;
    accessTokenEncrypted: string;
  } | null,
) {
  const fallback = getGlobalClicksignFallbackSummary();

  return {
    id: config?.id ?? null,
    apiBase: config?.apiBase ?? null,
    ambiente: config?.ambiente ?? fallback.ambiente,
    integracaoAtiva: config?.integracaoAtiva ?? false,
    dataConfiguracao: config?.dataConfiguracao ?? null,
    ultimaValidacao: config?.ultimaValidacao ?? null,
    hasAccessToken: Boolean(config?.accessTokenEncrypted),
    effectiveSource: resolveEffectiveSource({
      hasTenantConfig: Boolean(config),
      integracaoAtiva: Boolean(config?.integracaoAtiva),
      fallbackAvailable: fallback.available,
      fallbackSource: fallback.source,
    }),
    fallbackAvailable: fallback.available,
    fallbackSource: fallback.source,
    mockMode: fallback.mockMode,
    fallbackApiBase: fallback.apiBase,
    fallbackAmbiente: fallback.ambiente,
  } as const;
}

export async function obterConfiguracaoClicksign() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return { success: false, error: "Não autenticado" } as const;
    }

    const user = session.user as any;

    if (!canManageClicksign(user)) {
      return {
        success: false,
        error: "Sem permissão para visualizar integração ClickSign",
      } as const;
    }

    if (!user.tenantId) {
      return { success: false, error: "Tenant não identificado" } as const;
    }

    const config = await prisma.clicksignTenantConfig.findUnique({
      where: { tenantId: user.tenantId },
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

    return {
      success: true,
      data: buildTenantConfigResponse(config),
    } as const;
  } catch (error) {
    console.error("Erro ao obter configuração ClickSign:", error);
    return { success: false, error: "Erro interno do servidor" } as const;
  }
}

export async function configurarClicksignTenant(data: {
  apiBase?: string;
  accessToken?: string;
  ambiente: ClicksignAmbiente;
  integracaoAtiva: boolean;
}) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return { success: false, error: "Não autenticado" } as const;
    }

    const user = session.user as any;

    if (!canManageClicksign(user)) {
      return {
        success: false,
        error: "Sem permissão para configurar a integração ClickSign",
      } as const;
    }

    if (!user.tenantId) {
      return { success: false, error: "Tenant não identificado" } as const;
    }

    const existingConfig = await prisma.clicksignTenantConfig.findUnique({
      where: { tenantId: user.tenantId },
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

    const apiBase = normalizeClicksignApiBase(
      data.apiBase || existingConfig?.apiBase,
      data.ambiente,
    );
    const accessTokenInput = data.accessToken?.trim() || "";
    const integracaoAtiva = Boolean(data.integracaoAtiva);

    if (!isValidClicksignApiBase(apiBase)) {
      return {
        success: false,
        error: "URL da API do ClickSign inválida. Use a base terminando em /api/v1.",
      } as const;
    }

    if (!accessTokenInput && !existingConfig?.accessTokenEncrypted) {
      return {
        success: false,
        error: "Access token do ClickSign é obrigatório na primeira configuração.",
      } as const;
    }

    if (accessTokenInput && accessTokenInput.length < 8) {
      return {
        success: false,
        error: "Access token do ClickSign parece inválido.",
      } as const;
    }

    const encryptedToken = accessTokenInput
      ? encrypt(accessTokenInput)
      : existingConfig?.accessTokenEncrypted;

    if (!encryptedToken) {
      return {
        success: false,
        error: "Não foi possível resolver o token efetivo do ClickSign.",
      } as const;
    }

    const now = new Date();

    if (integracaoAtiva) {
      const effectiveConfig: ResolvedClicksignConfig = {
        apiBase,
        accessToken: accessTokenInput || decrypt(existingConfig!.accessTokenEncrypted),
        ambiente: data.ambiente,
        source: "TENANT",
        tenantId: user.tenantId,
        integracaoAtiva: true,
      };

      const testResult = await testClicksignConnection({ config: effectiveConfig });

      if (!testResult.success) {
        return {
          success: false,
          error:
            testResult.error ||
            "Falha ao validar a conexão com ClickSign. Verifique base e token.",
        } as const;
      }
    }

    const savedConfig = await prisma.clicksignTenantConfig.upsert({
      where: { tenantId: user.tenantId },
      update: {
        apiBase,
        accessTokenEncrypted: encryptedToken,
        ambiente: data.ambiente,
        integracaoAtiva,
        ultimaValidacao: integracaoAtiva ? now : existingConfig?.ultimaValidacao ?? null,
        updatedAt: now,
      },
      create: {
        tenantId: user.tenantId,
        apiBase,
        accessTokenEncrypted: encryptedToken,
        ambiente: data.ambiente,
        integracaoAtiva,
        dataConfiguracao: now,
        ultimaValidacao: integracaoAtiva ? now : null,
      },
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

    await logAudit({
      tenantId: user.tenantId,
      usuarioId: user.id,
      acao: existingConfig
        ? "TENANT_CLICKSIGN_CONFIG_UPDATED"
        : "TENANT_CLICKSIGN_CONFIG_CREATED",
      entidade: "ClicksignTenantConfig",
      entidadeId: savedConfig.id,
      dados: toAuditJson({
        apiBase: savedConfig.apiBase,
        ambiente: savedConfig.ambiente,
        integracaoAtiva: savedConfig.integracaoAtiva,
        accessTokenUpdated: Boolean(accessTokenInput),
      }),
      previousValues: existingConfig
        ? toAuditJson({
            apiBase: existingConfig.apiBase,
            ambiente: existingConfig.ambiente,
            integracaoAtiva: existingConfig.integracaoAtiva,
            hasAccessToken: Boolean(existingConfig.accessTokenEncrypted),
          })
        : null,
      changedFields: [
        "apiBase",
        "ambiente",
        "integracaoAtiva",
        ...(accessTokenInput ? ["accessTokenEncrypted"] : []),
      ],
    });

    revalidatePath("/configuracoes");

    return {
      success: true,
      data: buildTenantConfigResponse(savedConfig),
    } as const;
  } catch (error) {
    console.error("Erro ao configurar ClickSign:", error);
    return { success: false, error: "Erro interno do servidor" } as const;
  }
}

export async function testarConexaoClicksign() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return { success: false, error: "Não autenticado" } as const;
    }

    const user = session.user as any;

    if (!canManageClicksign(user)) {
      return {
        success: false,
        error: "Sem permissão para testar integração ClickSign",
      } as const;
    }

    if (!user.tenantId) {
      return { success: false, error: "Tenant não identificado" } as const;
    }

    const config = await prisma.clicksignTenantConfig.findUnique({
      where: { tenantId: user.tenantId },
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

    if (config) {
      const effectiveConfig: ResolvedClicksignConfig = {
        apiBase: config.apiBase,
        accessToken: decrypt(config.accessTokenEncrypted),
        ambiente: config.ambiente,
        source: "TENANT",
        tenantId: user.tenantId,
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

      await logAudit({
        tenantId: user.tenantId,
        usuarioId: user.id,
        acao: "TENANT_CLICKSIGN_CONFIG_TESTED",
        entidade: "ClicksignTenantConfig",
        entidadeId: config.id,
        dados: toAuditJson({
          apiBase: config.apiBase,
          ambiente: config.ambiente,
          integracaoAtiva: config.integracaoAtiva,
        }),
        changedFields: ["ultimaValidacao"],
      });

      revalidatePath("/configuracoes");

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

    const testResult = await testClicksignConnection();

    if (!testResult.success) {
      return {
        success: false,
        error:
          testResult.error ||
          "ClickSign não configurado para o tenant nem disponível no fallback global.",
      } as const;
    }

    return {
      success: true,
      data: {
        conectado: true,
        source: testResult.data?.source ?? getGlobalClicksignFallbackSummary().source,
        ambiente:
          testResult.data?.ambiente ?? getGlobalClicksignFallbackSummary().ambiente,
        ultimaValidacao: null,
      },
    } as const;
  } catch (error) {
    console.error("Erro ao testar conexão ClickSign:", error);
    return { success: false, error: "Erro ao testar conexão" } as const;
  }
}
