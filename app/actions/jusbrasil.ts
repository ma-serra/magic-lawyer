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
  isJusbrasilGloballyConfigured,
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
  id: string;
  integracaoAtiva: boolean;
  dataConfiguracao: Date;
  ultimaValidacao: Date | null;
  lastWebhookAt: Date | null;
  lastWebhookEvent: string | null;
} | null) {
  const globalConfigured = isJusbrasilGloballyConfigured();
  const integracaoAtiva = config?.integracaoAtiva ?? true;

  return {
    id: config?.id ?? null,
    integracaoAtiva,
    dataConfiguracao: config?.dataConfiguracao ?? null,
    ultimaValidacao: config?.ultimaValidacao ?? null,
    lastWebhookAt: config?.lastWebhookAt ?? null,
    lastWebhookEvent: config?.lastWebhookEvent ?? null,
    globalConfigured,
    baseUrl: resolveJusbrasilApiBaseUrl(process.env.JUSBRASIL_API_BASE_URL),
    expectedWebhookUrl: buildJusbrasilExpectedWebhookUrl(),
    effectiveEnabled: globalConfigured && integracaoAtiva,
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

    const config = await prisma.tenantJusbrasilConfig.findUnique({
      where: { tenantId: user.tenantId },
      select: {
        id: true,
        integracaoAtiva: true,
        dataConfiguracao: true,
        ultimaValidacao: true,
        lastWebhookAt: true,
        lastWebhookEvent: true,
      },
    });

    return {
      success: true,
      data: buildJusbrasilConfigResponse(config),
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

    const existingConfig = await prisma.tenantJusbrasilConfig.findUnique({
      where: { tenantId: user.tenantId },
      select: {
        id: true,
        integracaoAtiva: true,
        dataConfiguracao: true,
        ultimaValidacao: true,
        lastWebhookAt: true,
        lastWebhookEvent: true,
      },
    });

    const integracaoAtiva = Boolean(data.integracaoAtiva);
    const now = new Date();
    let ultimaValidacao = existingConfig?.ultimaValidacao ?? null;

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
      acao: existingConfig
        ? "TENANT_JUSBRASIL_CONFIG_UPDATED"
        : "TENANT_JUSBRASIL_CONFIG_CREATED",
      entidade: "TenantJusbrasilConfig",
      entidadeId: savedConfig.id,
      dados: toAuditJson({
        integracaoAtiva: savedConfig.integracaoAtiva,
        ultimaValidacao: savedConfig.ultimaValidacao,
      }),
      previousValues: existingConfig
        ? toAuditJson({
            integracaoAtiva: existingConfig.integracaoAtiva,
            ultimaValidacao: existingConfig.ultimaValidacao,
          })
        : null,
      changedFields: ["integracaoAtiva", "ultimaValidacao"],
    });

    revalidatePath("/configuracoes");

    return {
      success: true,
      data: buildJusbrasilConfigResponse(savedConfig),
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
    const existingState = await getTenantJusbrasilIntegrationState(user.tenantId);

    await prisma.tenantJusbrasilConfig.upsert({
      where: { tenantId: user.tenantId },
      update: {
        ultimaValidacao: validatedAt,
      },
      create: {
        tenantId: user.tenantId,
        integracaoAtiva: true,
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
