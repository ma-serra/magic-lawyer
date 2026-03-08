"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";

import { authOptions } from "@/auth";
import prisma, { convertAllDecimalFields } from "@/app/lib/prisma";
import {
  AsaasClient,
  createAsaasClientFromEncrypted,
  encryptAsaasCredentials,
  validateAsaasApiKey,
  formatCpfCnpjForAsaas,
  formatValueForAsaas,
  formatDateForAsaas,
} from "@/lib/asaas";
import { TENANT_PERMISSIONS } from "@/types";

function canManageAsaas(user: any) {
  const role = user?.role as string | undefined;
  const permissions = (user?.permissions ?? []) as string[];

  return (
    role === "SUPER_ADMIN" ||
    role === "ADMIN" ||
    permissions.includes(TENANT_PERMISSIONS.manageOfficeSettings) ||
    permissions.includes(TENANT_PERMISSIONS.manageFinance)
  );
}

function resolveAsaasWebhookUrl() {
  const envBase =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "").trim() ||
    "http://localhost:9192";

  return `${envBase.replace(/\/$/, "")}/api/webhooks/asaas`;
}

// ============================================
// CONFIGURAÇÃO ASAAS POR TENANT
// ============================================

export async function configurarAsaasTenant(data: {
  asaasApiKey?: string;
  asaasAccountId?: string;
  asaasWalletId?: string;
  webhookAccessToken?: string;
  ambiente: "SANDBOX" | "PRODUCAO";
}) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return { success: false, error: "Não autenticado" };
    }

    const user = session.user as any;

    if (!canManageAsaas(user)) {
      return {
        success: false,
        error: "Sem permissão para configurar a integração Asaas",
      };
    }

    if (!user.tenantId) {
      return { success: false, error: "Tenant não identificado" };
    }

    const existingConfig = await prisma.tenantAsaasConfig.findUnique({
      where: { tenantId: user.tenantId },
    });

    const apiKeyInput = data.asaasApiKey?.trim() ?? "";
    const accountId = data.asaasAccountId?.trim() || existingConfig?.asaasAccountId;

    if (!accountId) {
      return { success: false, error: "ID da conta Asaas é obrigatório" };
    }

    if (apiKeyInput && !validateAsaasApiKey(apiKeyInput)) {
      return { success: false, error: "API key do Asaas inválida" };
    }

    if (!apiKeyInput && !existingConfig) {
      return {
        success: false,
        error: "API key do Asaas é obrigatória na primeira configuração",
      };
    }

    const webhookTokenInput = data.webhookAccessToken?.trim() ?? "";
    if (webhookTokenInput && webhookTokenInput.length < 8) {
      return {
        success: false,
        error: "Token do webhook deve ter no mínimo 8 caracteres",
      };
    }

    // Testar conexão com Asaas com as credenciais efetivas
    const asaasClient = apiKeyInput
      ? new AsaasClient(
          apiKeyInput,
          data.ambiente.toLowerCase() as "sandbox" | "production",
        )
      : createAsaasClientFromEncrypted(
          existingConfig!.asaasApiKey,
          data.ambiente.toLowerCase() as "sandbox" | "production",
        );
    const connectionTest = await asaasClient.testConnection();

    if (!connectionTest) {
      return {
        success: false,
        error: "Falha na conexão com Asaas. Verifique suas credenciais.",
      };
    }

    const encryptedApiKey = apiKeyInput
      ? encryptAsaasCredentials(apiKeyInput)
      : existingConfig!.asaasApiKey;

    const walletId =
      data.asaasWalletId !== undefined
        ? (data.asaasWalletId.trim() || null)
        : (existingConfig?.asaasWalletId ?? null);
    const hasWebhookPayload = data.webhookAccessToken !== undefined;
    const encryptedWebhookToken = webhookTokenInput
      ? encryptAsaasCredentials(webhookTokenInput)
      : null;
    const now = new Date();

    // Salvar configuração
    const config = await prisma.tenantAsaasConfig.upsert({
      where: { tenantId: user.tenantId },
      update: {
        asaasApiKey: encryptedApiKey,
        ...(hasWebhookPayload
          ? {
              webhookAccessToken: encryptedWebhookToken,
              webhookConfiguredAt: encryptedWebhookToken ? now : null,
            }
          : {}),
        asaasAccountId: accountId,
        asaasWalletId: walletId,
        ambiente: data.ambiente,
        integracaoAtiva: true,
        ultimaValidacao: now,
        updatedAt: now,
      },
      create: {
        tenantId: user.tenantId,
        asaasApiKey: encryptedApiKey,
        webhookAccessToken: encryptedWebhookToken,
        webhookConfiguredAt: encryptedWebhookToken ? now : null,
        asaasAccountId: accountId,
        asaasWalletId: walletId,
        ambiente: data.ambiente,
        integracaoAtiva: true,
        ultimaValidacao: now,
      },
    });

    revalidatePath("/configuracoes");
    revalidatePath("/configuracoes/asaas");
    revalidatePath("/financeiro");

    return {
      success: true,
      data: {
        id: config.id,
        asaasAccountId: config.asaasAccountId,
        ambiente: config.ambiente,
        integracaoAtiva: config.integracaoAtiva,
        dataConfiguracao: config.dataConfiguracao,
        ultimaValidacao: config.ultimaValidacao,
        hasWebhookAccessToken: Boolean(config.webhookAccessToken),
        webhookConfiguredAt: config.webhookConfiguredAt,
        webhookUrl: resolveAsaasWebhookUrl(),
      },
    };
  } catch (error) {
    console.error("Erro ao configurar Asaas:", error);

    return { success: false, error: "Erro interno do servidor" };
  }
}

export async function testarConexaoAsaas() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return { success: false, error: "Não autenticado" };
    }

    const user = session.user as any;

    if (!canManageAsaas(user)) {
      return {
        success: false,
        error: "Sem permissão para testar integração Asaas",
      };
    }

    const config = await prisma.tenantAsaasConfig.findUnique({
      where: { tenantId: user.tenantId },
    });

    if (!config) {
      return { success: false, error: "Configuração Asaas não encontrada" };
    }

    const asaasClient = createAsaasClientFromEncrypted(
      config.asaasApiKey,
      config.ambiente.toLowerCase() as "sandbox" | "production",
    );
    const connectionTest = await asaasClient.testConnection();

    if (connectionTest) {
      // Atualizar última validação
      await prisma.tenantAsaasConfig.update({
        where: { id: config.id },
        data: { ultimaValidacao: new Date() },
      });

      revalidatePath("/configuracoes");
      revalidatePath("/configuracoes/asaas");
    }

    return {
      success: connectionTest,
      data: {
        conectado: connectionTest,
        ultimaValidacao: connectionTest ? new Date() : config.ultimaValidacao,
      },
    };
  } catch (error) {
    console.error("Erro ao testar conexão Asaas:", error);

    return { success: false, error: "Erro ao testar conexão" };
  }
}

export async function obterConfiguracaoAsaas() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return { success: false, error: "Não autenticado" };
    }

    const user = session.user as any;

    if (!canManageAsaas(user)) {
      return {
        success: false,
        error: "Sem permissão para visualizar integração Asaas",
      };
    }

    const config = await prisma.tenantAsaasConfig.findUnique({
      where: { tenantId: user.tenantId },
    });

    if (!config) {
      return { success: true, data: null };
    }

    return {
      success: true,
      data: {
        id: config.id,
        asaasAccountId: config.asaasAccountId,
        asaasWalletId: config.asaasWalletId,
        ambiente: config.ambiente,
        integracaoAtiva: config.integracaoAtiva,
        dataConfiguracao: config.dataConfiguracao,
        ultimaValidacao: config.ultimaValidacao,
        hasWebhookAccessToken: Boolean(config.webhookAccessToken),
        webhookConfiguredAt: config.webhookConfiguredAt,
        lastWebhookAt: config.lastWebhookAt,
        lastWebhookEvent: config.lastWebhookEvent,
        webhookUrl: resolveAsaasWebhookUrl(),
        globalWebhookSecretConfigured: Boolean(
          process.env.ASAAS_WEBHOOK_SECRET?.trim(),
        ),
      },
    };
  } catch (error) {
    console.error("Erro ao obter configuração Asaas:", error);

    return { success: false, error: "Erro interno do servidor" };
  }
}

// ============================================
// ASSINATURAS
// ============================================

export async function criarAssinatura(data: {
  planoId: string;
  billingType: "BOLETO" | "CREDIT_CARD" | "PIX";
  customerData: {
    name: string;
    email: string;
    cpfCnpj: string;
    phone?: string;
    postalCode?: string;
    address?: string;
    addressNumber?: string;
    complement?: string;
    province?: string;
    city?: string;
    state?: string;
  };
}) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return { success: false, error: "Não autenticado" };
    }

    const user = session.user as any;

    // Buscar plano
    const plano = await prisma.plano.findUnique({
      where: { id: data.planoId },
    });

    if (!plano) {
      return { success: false, error: "Plano não encontrado" };
    }

    // Buscar configuração Asaas
    const asaasConfig = await prisma.tenantAsaasConfig.findUnique({
      where: { tenantId: user.tenantId },
    });

    if (!asaasConfig || !asaasConfig.integracaoAtiva) {
      return {
        success: false,
        error: "Configuração Asaas não encontrada ou inativa",
      };
    }

    const asaasClient = createAsaasClientFromEncrypted(
      asaasConfig.asaasApiKey,
      asaasConfig.ambiente.toLowerCase() as "sandbox" | "production",
    );

    // Criar cliente no Asaas
    const asaasCustomer = await asaasClient.createCustomer({
      name: data.customerData.name,
      email: data.customerData.email,
      cpfCnpj: formatCpfCnpjForAsaas(data.customerData.cpfCnpj),
      phone: data.customerData.phone,
      mobilePhone: data.customerData.phone,
      postalCode: data.customerData.postalCode,
      address: data.customerData.address,
      addressNumber: data.customerData.addressNumber,
      complement: data.customerData.complement,
      province: data.customerData.province,
      city: data.customerData.city,
      state: data.customerData.state,
      country: "Brasil",
    });

    // Criar assinatura no Asaas
    const asaasSubscription = await asaasClient.createSubscription({
      customer: asaasCustomer.id!,
      billingType: data.billingType,
      value: formatValueForAsaas(Number(plano.valorMensal || 0)),
      nextDueDate: formatDateForAsaas(
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      ), // 30 dias
      cycle: "MONTHLY",
      description: `Assinatura Magic Lawyer - ${plano.nome}`,
      externalReference: `tenant_${user.tenantId}`,
    });

    // Criar assinatura no banco
    const subscription = await prisma.tenantSubscription.upsert({
      where: { tenantId: user.tenantId },
      update: {
        planoId: plano.id,
        status: "ATIVA",
        asaasCustomerId: asaasCustomer.id,
        asaasSubscriptionId: asaasSubscription.id,
        dataInicio: new Date(),
        trialEndsAt: new Date(
          Date.now() + plano.periodoTeste * 24 * 60 * 60 * 1000,
        ),
        metadata: {
          billingType: data.billingType,
          customerData: data.customerData,
        },
        updatedAt: new Date(),
      },
      create: {
        tenantId: user.tenantId,
        planoId: plano.id,
        status: "TRIAL",
        asaasCustomerId: asaasCustomer.id,
        asaasSubscriptionId: asaasSubscription.id,
        dataInicio: new Date(),
        trialEndsAt: new Date(
          Date.now() + plano.periodoTeste * 24 * 60 * 60 * 1000,
        ),
        metadata: {
          billingType: data.billingType,
          customerData: data.customerData,
        },
      },
    });

    revalidatePath("/precos");
    revalidatePath("/dashboard");

    return {
      success: true,
      data: {
        subscriptionId: subscription.id,
        asaasSubscriptionId: asaasSubscription.id,
        status: subscription.status,
        trialEndsAt: subscription.trialEndsAt,
      },
    };
  } catch (error) {
    console.error("Erro ao criar assinatura:", error);

    return { success: false, error: "Erro ao criar assinatura" };
  }
}

export async function cancelarAssinatura() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return { success: false, error: "Não autenticado" };
    }

    const user = session.user as any;

    // Buscar assinatura atual
    const subscription = await prisma.tenantSubscription.findUnique({
      where: { tenantId: user.tenantId },
      include: { plano: true },
    });

    if (!subscription || !subscription.asaasSubscriptionId) {
      return { success: false, error: "Assinatura não encontrada" };
    }

    // Buscar configuração Asaas
    const asaasConfig = await prisma.tenantAsaasConfig.findUnique({
      where: { tenantId: user.tenantId },
    });

    if (!asaasConfig) {
      return { success: false, error: "Configuração Asaas não encontrada" };
    }

    const asaasClient = createAsaasClientFromEncrypted(
      asaasConfig.asaasApiKey,
      asaasConfig.ambiente.toLowerCase() as "sandbox" | "production",
    );

    // Cancelar assinatura no Asaas
    await asaasClient.deleteSubscription(subscription.asaasSubscriptionId);

    // Atualizar status no banco
    await prisma.tenantSubscription.update({
      where: { id: subscription.id },
      data: {
        status: "CANCELADA",
        dataFim: new Date(),
        updatedAt: new Date(),
      },
    });

    revalidatePath("/precos");
    revalidatePath("/dashboard");

    return { success: true, data: { status: "CANCELADA" } };
  } catch (error) {
    console.error("Erro ao cancelar assinatura:", error);

    return { success: false, error: "Erro ao cancelar assinatura" };
  }
}

export async function obterAssinaturaAtual() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return { success: false, error: "Não autenticado" };
    }

    const user = session.user as any;

    const subscription = await prisma.tenantSubscription.findUnique({
      where: { tenantId: user.tenantId },
      include: { plano: true },
    });

    if (!subscription) {
      return { success: true, data: null };
    }

    // Converter campos Decimal para number
    const convertedSubscription = convertAllDecimalFields(subscription);

    // Serialização JSON explícita
    const serializedSubscription = JSON.parse(
      JSON.stringify(convertedSubscription),
    );

    return {
      success: true,
      data: {
        id: serializedSubscription.id,
        status: serializedSubscription.status,
        dataInicio: serializedSubscription.dataInicio,
        dataFim: serializedSubscription.dataFim,
        trialEndsAt: serializedSubscription.trialEndsAt,
        plano: serializedSubscription.plano
          ? {
              id: serializedSubscription.plano.id,
              nome: serializedSubscription.plano.nome,
              valorMensal: serializedSubscription.plano.valorMensal,
              periodoTeste: serializedSubscription.plano.periodoTeste,
            }
          : null,
      },
    };
  } catch (error) {
    console.error("Erro ao obter assinatura:", error);

    return { success: false, error: "Erro interno do servidor" };
  }
}

// ============================================
// PLANOS
// ============================================

export async function obterPlanos() {
  try {
    const planos = await prisma.plano.findMany({
      where: { ativo: true },
      orderBy: { valorMensal: "asc" },
    });

    // Converter campos Decimal para number
    const convertedPlanos = planos.map((plano) =>
      convertAllDecimalFields(plano),
    );

    // Serialização JSON explícita para garantir que não há objetos Decimal
    const serializedPlanos = JSON.parse(JSON.stringify(convertedPlanos));

    return {
      success: true,
      data: serializedPlanos,
    };
  } catch (error) {
    console.error("Erro ao obter planos:", error);

    return { success: false, error: "Erro interno do servidor" };
  }
}
