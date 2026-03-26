"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";

import { authOptions } from "@/auth";
import prisma from "@/app/lib/prisma";
import { logAudit, toAuditJson } from "@/app/lib/audit/log";
import {
  buildJusbrasilExpectedWebhookUrl,
  getJusbrasilClientFromEnv,
  getTenantJusbrasilIntegrationState,
} from "@/app/lib/juridical/jusbrasil-oab-sync";
import { resolveJusbrasilApiBaseUrl } from "@/lib/api/juridical/jusbrasil";
import { TENANT_PERMISSIONS } from "@/types";

function canManageJusbrasil(user: any) {
  const role = user?.role as string | undefined;
  const permissions = (user?.permissions ?? []) as string[];

  return (
    role === "SUPER_ADMIN" ||
    role === "ADMIN" ||
    permissions.includes(TENANT_PERMISSIONS.manageOfficeSettings)
  );
}

function buildJusbrasilConfigResponse(config: {
  id: string | null;
  integracaoAtiva: boolean;
  dataConfiguracao: Date | null;
  ultimaValidacao: Date | null;
  lastWebhookAt: Date | null;
  lastWebhookEvent: string | null;
  globalConfigured: boolean;
  planSlug: string | null;
  planName: string | null;
  planEligible: boolean;
  planEligibilityReason: string;
}) {
  const globalConfigured = config.globalConfigured;
  const integracaoAtiva = config.integracaoAtiva;

  return {
    id: config.id ?? null,
    integracaoAtiva,
    dataConfiguracao: config.dataConfiguracao ?? null,
    ultimaValidacao: config.ultimaValidacao ?? null,
    lastWebhookAt: config.lastWebhookAt ?? null,
    lastWebhookEvent: config.lastWebhookEvent ?? null,
    globalConfigured,
    planSlug: config.planSlug,
    planName: config.planName,
    planEligible: config.planEligible,
    planEligibilityReason: config.planEligibilityReason,
    baseUrl: resolveJusbrasilApiBaseUrl(process.env.JUSBRASIL_API_BASE_URL),
    expectedWebhookUrl: buildJusbrasilExpectedWebhookUrl(),
    effectiveEnabled: globalConfigured && config.planEligible && integracaoAtiva,
    usingGlobalAccount: true,
  } as const;
}

export async function obterConfiguracaoJusbrasil() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return { success: false, error: "Nao autenticado" } as const;
    }

    const user = session.user as any;

    if (!canManageJusbrasil(user)) {
      return {
        success: false,
        error: "Sem permissao para visualizar integracao Jusbrasil",
      } as const;
    }

    if (!user.tenantId) {
      return { success: false, error: "Tenant nao identificado" } as const;
    }

    const state = await getTenantJusbrasilIntegrationState(user.tenantId);

    return {
      success: true,
      data: buildJusbrasilConfigResponse({
        id: state.configId,
        integracaoAtiva: state.integracaoAtiva,
        dataConfiguracao: state.dataConfiguracao,
        ultimaValidacao: state.ultimaValidacao,
        lastWebhookAt: state.lastWebhookAt,
        lastWebhookEvent: state.lastWebhookEvent,
        globalConfigured: state.globalConfigured,
        planSlug: state.planSlug,
        planName: state.planName,
        planEligible: state.planEligible,
        planEligibilityReason: state.planEligibilityReason,
      }),
    } as const;
  } catch (error) {
    console.error("Erro ao obter configuracao Jusbrasil:", error);
    return { success: false, error: "Erro interno do servidor" } as const;
  }
}

export async function configurarJusbrasilTenant(data: {
  integracaoAtiva: boolean;
}) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return { success: false, error: "Nao autenticado" } as const;
    }

    const user = session.user as any;

    if (!canManageJusbrasil(user)) {
      return {
        success: false,
        error: "Sem permissao para configurar a integracao Jusbrasil",
      } as const;
    }

    if (!user.tenantId) {
      return { success: false, error: "Tenant nao identificado" } as const;
    }

    const existingState = await getTenantJusbrasilIntegrationState(user.tenantId);

    const integracaoAtiva = Boolean(data.integracaoAtiva);
    const now = new Date();
    let ultimaValidacao = existingState.ultimaValidacao ?? null;

    if (integracaoAtiva && !existingState.planEligible) {
      return {
        success: false,
        error: existingState.planEligibilityReason,
      } as const;
    }

    if (integracaoAtiva) {
      const client = getJusbrasilClientFromEnv();

      if (!client) {
        return {
          success: false,
          error:
            "A plataforma esta sem JUSBRASIL_API_KEY. Configure a credencial global antes de ativar esta integracao.",
        } as const;
      }

      await client.getCurrentUser();
      ultimaValidacao = now;
    }

    const savedConfig = await prisma.tenantJusbrasilConfig.upsert({
      where: { tenantId: user.tenantId },
      update: {
        integracaoAtiva,
        ultimaValidacao,
      },
      create: {
        tenantId: user.tenantId,
        integracaoAtiva,
        dataConfiguracao: now,
        ultimaValidacao,
      },
      select: {
        id: true,
        integracaoAtiva: true,
        dataConfiguracao: true,
        ultimaValidacao: true,
        lastWebhookAt: true,
        lastWebhookEvent: true,
      },
    });

    await logAudit({
      tenantId: user.tenantId,
      usuarioId: user.id,
      acao: existingState.configId
        ? "TENANT_JUSBRASIL_CONFIG_UPDATED"
        : "TENANT_JUSBRASIL_CONFIG_CREATED",
      entidade: "TenantJusbrasilConfig",
      entidadeId: savedConfig.id,
      dados: toAuditJson({
        integracaoAtiva: savedConfig.integracaoAtiva,
        ultimaValidacao: savedConfig.ultimaValidacao,
      }),
      previousValues: existingState.configId
        ? toAuditJson({
            integracaoAtiva: existingState.integracaoAtiva,
            ultimaValidacao: existingState.ultimaValidacao,
          })
        : null,
      changedFields: ["integracaoAtiva", "ultimaValidacao"],
    });

    revalidatePath("/configuracoes");

    return {
      success: true,
      data: buildJusbrasilConfigResponse({
        id: savedConfig.id,
        integracaoAtiva: savedConfig.integracaoAtiva,
        dataConfiguracao: savedConfig.dataConfiguracao,
        ultimaValidacao: savedConfig.ultimaValidacao,
        lastWebhookAt: savedConfig.lastWebhookAt,
        lastWebhookEvent: savedConfig.lastWebhookEvent,
        globalConfigured: existingState.globalConfigured,
        planSlug: existingState.planSlug,
        planName: existingState.planName,
        planEligible: existingState.planEligible,
        planEligibilityReason: existingState.planEligibilityReason,
      }),
    } as const;
  } catch (error) {
    console.error("Erro ao configurar Jusbrasil:", error);
    return { success: false, error: "Erro interno do servidor" } as const;
  }
}

export async function testarConexaoJusbrasil() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return { success: false, error: "Nao autenticado" } as const;
    }

    const user = session.user as any;

    if (!canManageJusbrasil(user)) {
      return {
        success: false,
        error: "Sem permissao para testar integracao Jusbrasil",
      } as const;
    }

    if (!user.tenantId) {
      return { success: false, error: "Tenant nao identificado" } as const;
    }

    const existingState = await getTenantJusbrasilIntegrationState(user.tenantId);

    if (!existingState.planEligible) {
      return {
        success: false,
        error: existingState.planEligibilityReason,
      } as const;
    }

    const client = getJusbrasilClientFromEnv();

    if (!client) {
      return {
        success: false,
        error:
          "A plataforma esta sem JUSBRASIL_API_KEY. Configure a credencial global antes do teste.",
      } as const;
    }

    const userInfo = await client.getCurrentUser();
    const validatedAt = new Date();

    await prisma.tenantJusbrasilConfig.upsert({
      where: { tenantId: user.tenantId },
      update: {
        ultimaValidacao: validatedAt,
      },
      create: {
        tenantId: user.tenantId,
        integracaoAtiva: existingState.integracaoAtiva,
        dataConfiguracao: validatedAt,
        ultimaValidacao: validatedAt,
      },
      select: {
        id: true,
      },
    });

    await logAudit({
      tenantId: user.tenantId,
      usuarioId: user.id,
      acao: "TENANT_JUSBRASIL_CONFIG_TESTED",
      entidade: "TenantJusbrasilConfig",
      entidadeId: existingState.configId ?? user.tenantId,
      dados: toAuditJson({
        integracaoAtiva: existingState.integracaoAtiva,
        ultimaValidacao: validatedAt,
        userEmail: userInfo.email?.trim() || null,
        userName: userInfo.name?.trim() || null,
      }),
      changedFields: ["ultimaValidacao"],
    });

    revalidatePath("/configuracoes");

    return {
      success: true,
      data: {
        conectado: true,
        ultimaValidacao: validatedAt,
        userEmail: userInfo.email?.trim() || null,
        userName: userInfo.name?.trim() || null,
      },
    } as const;
  } catch (error) {
    console.error("Erro ao testar conexao Jusbrasil:", error);
    return { success: false, error: "Erro ao testar conexao" } as const;
  }
}
