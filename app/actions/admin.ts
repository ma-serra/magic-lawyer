"use server";

import bcrypt from "bcryptjs";
import { getServerSession } from "next-auth";
import { headers } from "next/headers";

import prisma from "@/app/lib/prisma";
import {
  extractRequestIp,
  extractRequestUserAgent,
  logOperationalEvent,
} from "@/app/lib/audit/operational-events";
import {
  createImpersonationTicket,
  type ImpersonationSessionSnapshot,
} from "@/app/lib/impersonation-ticket";
import { getTenantAccessibleModules } from "@/app/lib/tenant-modules";
import {
  EspecialidadeJuridica,
  DigitalCertificatePolicy,
  InvoiceStatus,
  PaymentStatus,
  SubscriptionStatus,
  TenantStatus,
  TipoPessoa,
  UserRole,
} from "@/generated/prisma";
import { authOptions } from "@/auth";
import logger from "@/lib/logger";
import { ensureDefaultCargosForTenant } from "@/app/lib/default-cargos";
import { enviarEmailPrimeiroAcesso, maskEmail } from "@/app/lib/first-access-email";
import { getGlobalClicksignFallbackSummary } from "@/app/lib/clicksign";
import {
  buildAdminAsaasSummary,
  buildAdminCertificatesSummary,
  buildAdminClicksignSummary,
  buildAdminTenantChannelProviderSummary,
} from "@/app/lib/admin-integration-summaries";
import { getGlobalTelegramProviderSummary } from "@/app/lib/notifications/telegram-provider";
import { getOnlineCountsByTenant } from "@/app/lib/realtime/session-presence";

// =============================================
// TENANT MANAGEMENT
// =============================================

export interface CreateTenantData {
  name: string;
  slug: string;
  domain?: string;
  email: string;
  telefone?: string;
  documento?: string;
  razaoSocial?: string;
  nomeFantasia?: string;
  tipoPessoa: "FISICA" | "JURIDICA";
  timezone?: string;
  adminUser: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
  };
  // Configuração Asaas (opcional)
  asaasConfig?: {
    configurarAsaas: boolean;
    asaasApiKey?: string;
    asaasAccountId?: string;
    asaasWalletId?: string;
    asaasAmbiente?: "SANDBOX" | "PRODUCAO";
  };
}

export interface TenantResponse {
  success: boolean;
  data?: any;
  error?: string;
}

const decimalToNullableNumber = (value: unknown) => {
  if (value == null) {
    return null;
  }

  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "bigint") {
    return Number(value);
  }

  if (typeof value === "string") {
    const parsed = Number(value);

    return Number.isNaN(parsed) ? null : parsed;
  }

  if (
    typeof value === "object" &&
    "toString" in (value as Record<string, unknown>)
  ) {
    const parsed = Number((value as { toString(): string }).toString());

    return Number.isNaN(parsed) ? null : parsed;
  }

  return null;
};

const buildUserDisplayName = (
  firstName?: string | null,
  lastName?: string | null,
  fallback?: string | null,
) => {
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();

  if (fullName) return fullName;
  if (fallback?.trim()) return fallback.trim();
  return "Usuário";
};

export interface TenantManagementData {
  tenant: {
    id: string;
    name: string;
    slug: string;
    domain: string | null;
    email: string | null;
    telefone: string | null;
    documento: string | null;
    razaoSocial: string | null;
    nomeFantasia: string | null;
    timezone: string;
    status: TenantStatus;
    createdAt: string;
    updatedAt: string;
  };
  branding: {
    primaryColor: string | null;
    secondaryColor: string | null;
    accentColor: string | null;
    logoUrl: string | null;
    faviconUrl: string | null;
  } | null;
  subscription: {
    id: string | null;
    status: SubscriptionStatus | null;
    planId: string | null;
    planName: string | null;
    valorMensal: number | null;
    valorAnual: number | null;
    moeda: string | null;
    trialEndsAt: string | null;
    renovaEm: string | null;
  };
  availablePlans: Array<{
    id: string;
    nome: string;
    valorMensal: number | null;
    valorAnual: number | null;
    moeda: string;
  }>;
  metrics: {
    usuarios: number;
    processos: number;
    clientes: number;
    revenue90d: number;
    revenue30d: number;
    outstandingInvoices: number;
  };
  invoices: Array<{
    id: string;
    numero: string | null;
    status: InvoiceStatus;
    valor: number;
    vencimento: string | null;
    pagoEm: string | null;
    criadoEm: string;
  }>;
  users: Array<{
    id: string;
    name: string;
    email: string;
    role: UserRole;
    active: boolean;
    lastLoginAt: string | null;
  }>;
  availableRoles: UserRole[];
  integrations: {
    clicksign: ReturnType<typeof buildAdminClicksignSummary>;
    asaas: ReturnType<typeof buildAdminAsaasSummary>;
    certificates: ReturnType<typeof buildAdminCertificatesSummary>;
    whatsapp: ReturnType<typeof buildAdminTenantChannelProviderSummary>;
    telegram: ReturnType<typeof buildAdminTenantChannelProviderSummary>;
    sms: ReturnType<typeof buildAdminTenantChannelProviderSummary>;
  };
}

function resolveAdminAsaasWebhookUrl() {
  const envBase =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "").trim() ||
    "http://localhost:9192";

  return `${envBase.replace(/\/$/, "")}/api/webhooks/asaas`;
}

// Criar novo tenant
export async function createTenant(
  data: CreateTenantData,
): Promise<TenantResponse> {
  try {
    const session = await getServerSession(authOptions);

    if (
      !session?.user ||
      session.user.role !== "SUPER_ADMIN" ||
      !session.user.id
    ) {
      return {
        success: false,
        error: "Acesso não autorizado para criar tenants",
      };
    }

    const superAdminId = session.user.id;

    // Verificar se slug já existe
    const existingTenant = await prisma.tenant.findUnique({
      where: { slug: data.slug },
    });

    if (existingTenant) {
      return {
        success: false,
        error: "Slug já existe. Escolha outro slug.",
      };
    }

    if (data.domain) {
      const domainConflict = await prisma.tenant.findUnique({
        where: { domain: data.domain },
      });

      if (domainConflict) {
        return {
          success: false,
          error: "Domínio já está em uso por outro tenant.",
        };
      }
    }

    // Hash da senha do admin
    const passwordHash = await bcrypt.hash(data.adminUser.password, 12);

    // Criar tenant e admin em transação
    const result = await prisma.$transaction(async (tx) => {
      // Criar tenant
      const tenant = await tx.tenant.create({
        data: {
          name: data.name,
          slug: data.slug,
          domain: data.domain,
          email: data.email,
          telefone: data.telefone,
          documento: data.documento,
          razaoSocial: data.razaoSocial,
          nomeFantasia: data.nomeFantasia,
          tipoPessoa: data.tipoPessoa,
          timezone: data.timezone || "America/Sao_Paulo",
          status: "ACTIVE",
          superAdminId, // Vinculado ao super admin
        },
      });

      await ensureDefaultCargosForTenant(tx, tenant.id);

      // Criar usuário admin do tenant
      const adminUser = await tx.usuario.create({
        data: {
          tenantId: tenant.id,
          email: data.adminUser.email,
          passwordHash,
          firstName: data.adminUser.firstName,
          lastName: data.adminUser.lastName,
          role: "ADMIN",
          active: true,
        },
      });

      // Criar branding padrão
      await tx.tenantBranding.create({
        data: {
          tenantId: tenant.id,
          primaryColor: "#2563eb",
          secondaryColor: "#1d4ed8",
          accentColor: "#3b82f6",
        },
      });

      return { tenant, adminUser };
    });

    // Configurar Asaas se solicitado
    if (
      data.asaasConfig?.configurarAsaas &&
      data.asaasConfig.asaasApiKey &&
      data.asaasConfig.asaasAccountId
    ) {
      try {
        // Importar funções do Asaas
        const { encryptAsaasCredentials, validateAsaasApiKey } = await import(
          "@/lib/asaas"
        );

        // Validar API key
        if (!validateAsaasApiKey(data.asaasConfig.asaasApiKey)) {
          logger.warn(`API key Asaas inválida para tenant ${result.tenant.id}`);
        } else {
          // Criptografar API key
          const encryptedApiKey = encryptAsaasCredentials(
            data.asaasConfig.asaasApiKey,
          );

          // Salvar configuração Asaas
          await prisma.tenantAsaasConfig.create({
            data: {
              tenantId: result.tenant.id,
              asaasApiKey: encryptedApiKey,
              asaasAccountId: data.asaasConfig.asaasAccountId,
              asaasWalletId: data.asaasConfig.asaasWalletId || null,
              ambiente: data.asaasConfig.asaasAmbiente || "SANDBOX",
              integracaoAtiva: true,
              dataConfiguracao: new Date(),
              ultimaValidacao: new Date(),
            },
          });

          logger.info(
            `Configuração Asaas criada para tenant ${result.tenant.id}`,
          );
        }
      } catch (error) {
        logger.error(
          `Erro ao configurar Asaas para tenant ${result.tenant.id}:`,
          error,
        );
        // Não falha a criação do tenant se a configuração Asaas falhar
      }
    }

    // Log de auditoria
    await prisma.superAdminAuditLog.create({
      data: {
        superAdminId,
        acao: "CREATE_TENANT",
        entidade: "TENANT",
        entidadeId: result.tenant.id,
        dadosNovos: {
          tenantName: result.tenant.name,
          tenantSlug: result.tenant.slug,
          adminEmail: data.adminUser.email,
        },
      },
    });

    return {
      success: true,
      data: {
        tenant: result.tenant,
        adminUser: {
          id: result.adminUser.id,
          email: result.adminUser.email,
          name: `${result.adminUser.firstName} ${result.adminUser.lastName}`,
        },
      },
    };
  } catch (error) {
    logger.error("Erro ao criar tenant:", error);

    return {
      success: false,
      error: "Erro interno do servidor ao criar tenant",
    };
  }
}

// Listar todos os tenants
export async function getAllTenants(): Promise<TenantResponse> {
  try {
    const session = await getServerSession(authOptions);

    if (
      !session?.user ||
      session.user.role !== "SUPER_ADMIN" ||
      !session.user.id
    ) {
      return {
        success: false,
        error: "Acesso não autorizado para listar tenants",
      };
    }

    const tenants = await prisma.tenant.findMany({
      include: {
        superAdmin: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        branding: true,
        subscription: {
          include: {
            plano: true,
          },
        },
        _count: {
          select: {
            usuarios: true,
            processos: true,
            clientes: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    const onlineCountsByTenant = await getOnlineCountsByTenant({
      includeSuperAdmins: false,
    });

    const data = tenants.map((tenant) => ({
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      domain: tenant.domain,
      email: tenant.email,
      telefone: tenant.telefone,
      timezone: tenant.timezone,
      status: tenant.status,
      createdAt: tenant.createdAt.toISOString(),
      updatedAt: tenant.updatedAt.toISOString(),
      superAdmin: tenant.superAdmin
        ? {
            name: `${tenant.superAdmin.firstName} ${tenant.superAdmin.lastName}`.trim(),
            email: tenant.superAdmin.email,
          }
        : null,
      branding: tenant.branding
        ? {
            primaryColor: tenant.branding.primaryColor,
            secondaryColor: tenant.branding.secondaryColor,
            accentColor: tenant.branding.accentColor,
            logoUrl: tenant.branding.logoUrl,
            faviconUrl: tenant.branding.faviconUrl,
          }
        : null,
      plan: tenant.subscription
        ? {
            status: tenant.subscription.status,
            name: tenant.subscription.plano?.nome ?? null,
            valorMensal: decimalToNullableNumber(
              tenant.subscription.plano?.valorMensal ?? null,
            ),
            valorAnual: decimalToNullableNumber(
              tenant.subscription.plano?.valorAnual ?? null,
            ),
            moeda: tenant.subscription.plano?.moeda ?? "BRL",
            trialEndsAt: tenant.subscription.trialEndsAt?.toISOString() ?? null,
            renovaEm: tenant.subscription.renovaEm?.toISOString() ?? null,
          }
        : null,
      counts: {
        usuarios: tenant._count.usuarios,
        processos: tenant._count.processos,
        clientes: tenant._count.clientes,
      },
      onlineUsersNow: onlineCountsByTenant[tenant.id] ?? 0,
    }));

    return {
      success: true,
      data,
    };
  } catch (error) {
    logger.error("Erro ao buscar tenants:", error);

    return {
      success: false,
      error: "Erro interno do servidor ao buscar tenants",
    };
  }
}

// Atualizar status do tenant
export async function updateTenantStatus(
  tenantId: string,
  status: TenantStatus,
): Promise<TenantResponse> {
  try {
    const session = await getServerSession(authOptions);

    if (
      !session?.user ||
      session.user.role !== "SUPER_ADMIN" ||
      !session.user.id
    ) {
      return {
        success: false,
        error: "Acesso não autorizado para atualizar tenant",
      };
    }

    const superAdminId = session.user.id;

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      return {
        success: false,
        error: "Tenant não encontrado",
      };
    }

    const updatedTenant = await prisma.tenant.update({
      where: { id: tenantId },
      data: { status },
    });

    // Log de auditoria
    await prisma.superAdminAuditLog.create({
      data: {
        superAdminId,
        acao: "UPDATE_TENANT_STATUS",
        entidade: "TENANT",
        entidadeId: tenantId,
        dadosAntigos: { status: tenant.status },
        dadosNovos: { status },
      },
    });

    // Invalidar sessões de todos os usuários do tenant
    const { invalidateTenant } = await import(
      "@/app/lib/realtime/invalidation"
    );

    await invalidateTenant({
      tenantId,
      reason: `STATUS_CHANGED_FROM_${tenant.status}_TO_${status}`,
      actorId: superAdminId,
    });

    return {
      success: true,
      data: updatedTenant,
    };
  } catch (error) {
    logger.error("Erro ao atualizar status do tenant:", error);

    return {
      success: false,
      error: "Erro interno do servidor ao atualizar tenant",
    };
  }
}

export interface UpdateTenantDetailsInput {
  name?: string;
  slug?: string;
  domain?: string | null;
  email?: string | null;
  telefone?: string | null;
  documento?: string | null;
  razaoSocial?: string | null;
  nomeFantasia?: string | null;
  timezone?: string;
}

export interface UpdateTenantSubscriptionInput {
  planId?: string | null;
  status?: SubscriptionStatus;
  trialEndsAt?: string | null;
  renovaEm?: string | null;
}

export interface UpdateTenantBrandingInput {
  primaryColor?: string | null;
  secondaryColor?: string | null;
  accentColor?: string | null;
  logoUrl?: string | null;
  faviconUrl?: string | null;
}

export interface UpdateTenantUserInput {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  avatarUrl?: string;
  role?: UserRole;
  active?: boolean;
  resetFirstAccess?: boolean;
  sendFirstAccessEmail?: boolean;
  // Campos pessoais adicionais (todos os roles)
  cpf?: string;
  rg?: string;
  dataNascimentoUsuario?: Date | string;
  observacoes?: string;
  // Campos específicos do advogado
  oabNumero?: string;
  oabUf?: string;
  telefone?: string;
  whatsapp?: string;
  bio?: string;
  especialidades?: string[];
  comissaoPadrao?: number;
  comissaoAcaoGanha?: number;
  comissaoHonorarios?: number;
  // Campos específicos do cliente
  tipoPessoa?: string;
  documento?: string;
  telefoneCliente?: string;
  celular?: string;
  dataNascimento?: Date | string;
  inscricaoEstadual?: string;
  responsavelNome?: string;
  responsavelEmail?: string;
  responsavelTelefone?: string;
  observacoesCliente?: string;
}

export interface CreateTenantUserInput extends UpdateTenantUserInput {
  firstName: string;
  lastName: string;
  email: string;
}

export async function getTenantManagementData(
  tenantId: string,
): Promise<TenantResponse> {
  try {
    const session = await getServerSession(authOptions);

    if (
      !session?.user ||
      session.user.role !== "SUPER_ADMIN" ||
      !session.user.id
    ) {
      return {
        success: false,
        error: "Acesso não autorizado",
      };
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        branding: true,
        subscription: {
          include: { plano: true },
        },
        _count: {
          select: {
            usuarios: true,
            processos: true,
            clientes: true,
          },
        },
      },
    });

    if (!tenant) {
      return {
        success: false,
        error: "Tenant não encontrado",
      };
    }

    const ninetyDaysAgo = new Date(Date.now() - 89 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000);

    const [
      plans,
      invoices,
      users,
      revenue90Agg,
      revenue30Agg,
      outstandingInvoices,
      clicksignConfig,
      asaasConfig,
      digitalCertificates,
      tenantChannelProviders,
    ] = await Promise.all([
      prisma.plano.findMany({
        where: { ativo: true },
        orderBy: { nome: "asc" },
      }),
      prisma.fatura.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
      prisma.usuario.findMany({
        where: { tenantId },
        orderBy: { firstName: "asc" },
        include: {
          advogado: true,
        },
      }),
      prisma.pagamento.aggregate({
        _sum: { valor: true },
        where: {
          tenantId,
          status: PaymentStatus.PAGO,
          confirmadoEm: { gte: ninetyDaysAgo },
        },
      }),
      prisma.pagamento.aggregate({
        _sum: { valor: true },
        where: {
          tenantId,
          status: PaymentStatus.PAGO,
          confirmadoEm: { gte: thirtyDaysAgo },
        },
      }),
      prisma.fatura.count({
        where: {
          tenantId,
          status: { in: [InvoiceStatus.ABERTA, InvoiceStatus.VENCIDA] },
        },
      }),
      prisma.clicksignTenantConfig.findUnique({
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
      }),
      prisma.tenantAsaasConfig.findUnique({
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
      }),
      prisma.digitalCertificate.findMany({
        where: { tenantId },
        select: {
          scope: true,
          isActive: true,
          validUntil: true,
          lastValidatedAt: true,
          lastUsedAt: true,
        },
      }),
      prisma.tenantChannelProvider.findMany({
        where: {
          tenantId,
          channel: {
            in: ["WHATSAPP", "TELEGRAM", "SMS"],
          },
        },
        select: {
          id: true,
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
        },
      }),
    ]);

    const omnichannelProviders = new Map(
      tenantChannelProviders.map((provider) => [provider.channel, provider]),
    );
    const globalTelegramFallback = getGlobalTelegramProviderSummary();

    const data: TenantManagementData = {
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        domain: tenant.domain,
        email: tenant.email,
        telefone: tenant.telefone,
        documento: tenant.documento,
        razaoSocial: tenant.razaoSocial,
        nomeFantasia: tenant.nomeFantasia,
        timezone: tenant.timezone,
        status: tenant.status,
        createdAt: tenant.createdAt.toISOString(),
        updatedAt: tenant.updatedAt.toISOString(),
      },
      branding: tenant.branding
        ? {
            primaryColor: tenant.branding.primaryColor,
            secondaryColor: tenant.branding.secondaryColor,
            accentColor: tenant.branding.accentColor,
            logoUrl: tenant.branding.logoUrl,
            faviconUrl: tenant.branding.faviconUrl,
          }
        : null,
      subscription: {
        id: tenant.subscription?.id ?? null,
        status: tenant.subscription?.status ?? null,
        planId: tenant.subscription?.planoId ?? null,
        planName: tenant.subscription?.plano?.nome ?? null,
        valorMensal: decimalToNullableNumber(
          tenant.subscription?.plano?.valorMensal,
        ),
        valorAnual: decimalToNullableNumber(
          tenant.subscription?.plano?.valorAnual,
        ),
        moeda: tenant.subscription?.plano?.moeda ?? null,
        trialEndsAt: tenant.subscription?.trialEndsAt?.toISOString() ?? null,
        renovaEm: tenant.subscription?.renovaEm?.toISOString() ?? null,
      },
      availablePlans: plans.map((plan) => ({
        id: plan.id,
        nome: plan.nome,
        valorMensal: decimalToNullableNumber(plan.valorMensal),
        valorAnual: decimalToNullableNumber(plan.valorAnual),
        moeda: plan.moeda ?? "BRL",
      })),
      metrics: {
        usuarios: tenant._count.usuarios,
        processos: tenant._count.processos,
        clientes: tenant._count.clientes,
        revenue90d: decimalToNullableNumber(revenue90Agg._sum.valor) ?? 0,
        revenue30d: decimalToNullableNumber(revenue30Agg._sum.valor) ?? 0,
        outstandingInvoices,
      },
      invoices: invoices.map((invoice) => ({
        id: invoice.id,
        numero: invoice.numero,
        status: invoice.status,
        valor: decimalToNullableNumber(invoice.valor) ?? 0,
        vencimento: invoice.vencimento?.toISOString() ?? null,
        pagoEm: invoice.pagoEm?.toISOString() ?? null,
        criadoEm: invoice.createdAt.toISOString(),
      })),
      users: users.map((user) => ({
        id: user.id,
        name:
          `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        avatarUrl: user.avatarUrl,
        role: user.role,
        active: user.active,
        lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
        createdAt: user.createdAt.toISOString(),
        // Dados do advogado se existir
        oabNumero: user.advogado?.oabNumero ?? null,
        oabUf: user.advogado?.oabUf ?? null,
        telefone: user.advogado?.telefone ?? null,
        whatsapp: user.advogado?.whatsapp ?? null,
        bio: user.advogado?.bio ?? null,
        especialidades: user.advogado?.especialidades ?? null,
        comissaoPadrao: user.advogado?.comissaoPadrao
          ? parseFloat(user.advogado.comissaoPadrao.toString())
          : null,
        comissaoAcaoGanha: user.advogado?.comissaoAcaoGanha
          ? parseFloat(user.advogado.comissaoAcaoGanha.toString())
          : null,
        comissaoHonorarios: user.advogado?.comissaoHonorarios
          ? parseFloat(user.advogado.comissaoHonorarios.toString())
          : null,
      })),
      availableRoles: Object.values(UserRole),
      integrations: {
        clicksign: buildAdminClicksignSummary(
          clicksignConfig,
          getGlobalClicksignFallbackSummary(),
        ),
        asaas: buildAdminAsaasSummary(asaasConfig, {
          webhookUrl: resolveAdminAsaasWebhookUrl(),
          globalWebhookSecretConfigured: Boolean(
            process.env.ASAAS_WEBHOOK_SECRET?.trim(),
          ),
        }),
        certificates: buildAdminCertificatesSummary({
          policy:
            tenant.digitalCertificatePolicy ?? DigitalCertificatePolicy.OFFICE,
          certificates: digitalCertificates,
        }),
        whatsapp: buildAdminTenantChannelProviderSummary(
          "WHATSAPP",
          omnichannelProviders.get("WHATSAPP") ?? null,
        ),
        telegram: buildAdminTenantChannelProviderSummary(
          "TELEGRAM",
          omnichannelProviders.get("TELEGRAM") ?? null,
          globalTelegramFallback.available
            ? {
                available: true,
                provider: globalTelegramFallback.provider,
                providerLabel: globalTelegramFallback.providerLabel,
                displayName: globalTelegramFallback.displayName,
                botUsername: globalTelegramFallback.botUsername,
                healthHint: globalTelegramFallback.healthHint,
              }
            : null,
        ),
        sms: buildAdminTenantChannelProviderSummary(
          "SMS",
          omnichannelProviders.get("SMS") ?? null,
        ),
      },
    };

    return {
      success: true,
      data,
    };
  } catch (error) {
    logger.error("Erro ao carregar dados do tenant", error);

    return {
      success: false,
      error: "Erro interno do servidor ao carregar tenant",
    };
  }
}

export async function updateTenantDetails(
  tenantId: string,
  payload: UpdateTenantDetailsInput,
): Promise<TenantResponse> {
  try {
    const session = await getServerSession(authOptions);

    if (
      !session?.user ||
      session.user.role !== "SUPER_ADMIN" ||
      !session.user.id
    ) {
      return { success: false, error: "Acesso não autorizado" };
    }

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });

    if (!tenant) {
      return { success: false, error: "Tenant não encontrado" };
    }

    if (payload.slug && payload.slug !== tenant.slug) {
      const slugConflict = await prisma.tenant.findUnique({
        where: { slug: payload.slug },
      });

      if (slugConflict) {
        return {
          success: false,
          error: "Slug informado já está em uso.",
        };
      }
    }

    if (payload.domain !== undefined && payload.domain !== tenant.domain) {
      if (payload.domain) {
        const domainConflict = await prisma.tenant.findUnique({
          where: { domain: payload.domain },
        });

        if (domainConflict) {
          return {
            success: false,
            error: "Domínio informado já está em uso.",
          };
        }
      }
    }

    const updateData: Record<string, unknown> = {};

    if (payload.name !== undefined) updateData.name = payload.name;
    if (payload.slug !== undefined) updateData.slug = payload.slug;
    if (payload.domain !== undefined) updateData.domain = payload.domain;
    if (payload.email !== undefined) updateData.email = payload.email;
    if (payload.telefone !== undefined) updateData.telefone = payload.telefone;
    if (payload.documento !== undefined)
      updateData.documento = payload.documento;
    if (payload.razaoSocial !== undefined)
      updateData.razaoSocial = payload.razaoSocial;
    if (payload.nomeFantasia !== undefined)
      updateData.nomeFantasia = payload.nomeFantasia;
    if (payload.timezone !== undefined) updateData.timezone = payload.timezone;

    if (Object.keys(updateData).length === 0) {
      return {
        success: true,
        data: tenant,
      };
    }

    const updatedTenant = await prisma.tenant.update({
      where: { id: tenantId },
      data: updateData,
    });

    await prisma.superAdminAuditLog.create({
      data: {
        superAdminId: session.user.id,
        acao: "UPDATE_TENANT_DETAILS",
        entidade: "TENANT",
        entidadeId: tenantId,
        dadosAntigos: {
          name: tenant.name,
          slug: tenant.slug,
          domain: tenant.domain,
          email: tenant.email,
          telefone: tenant.telefone,
        },
        dadosNovos: {
          name: updatedTenant.name,
          slug: updatedTenant.slug,
          domain: updatedTenant.domain,
          email: updatedTenant.email,
          telefone: updatedTenant.telefone,
        },
      },
    });

    return {
      success: true,
      data: updatedTenant,
    };
  } catch (error) {
    logger.error("Erro ao atualizar dados do tenant", error);

    return {
      success: false,
      error: "Erro interno ao salvar alterações",
    };
  }
}

export async function updateTenantSubscription(
  tenantId: string,
  payload: UpdateTenantSubscriptionInput,
): Promise<TenantResponse> {
  try {
    const session = await getServerSession(authOptions);

    if (
      !session?.user ||
      session.user.role !== "SUPER_ADMIN" ||
      !session.user.id
    ) {
      return { success: false, error: "Acesso não autorizado" };
    }

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });

    if (!tenant) {
      return { success: false, error: "Tenant não encontrado" };
    }

    let planId: string | null | undefined = payload.planId;
    let planoVersaoId: string | null | undefined = null;

    if (planId) {
      const plan = await prisma.plano.findUnique({ where: { id: planId } });

      if (!plan) {
        return {
          success: false,
          error: "Plano selecionado não existe",
        };
      }

      // Buscar a versão publicada mais recente do plano
      const versaoPublicada = await prisma.planoVersao.findFirst({
        where: {
          planoId: planId,
          status: "PUBLISHED",
        },
        orderBy: {
          numero: "desc",
        },
      });

      if (versaoPublicada) {
        planoVersaoId = versaoPublicada.id;
      }
    }

    const trialEndsAt = payload.trialEndsAt
      ? new Date(payload.trialEndsAt)
      : null;
    const renovaEm = payload.renovaEm ? new Date(payload.renovaEm) : null;

    const existingSubscription = await prisma.tenantSubscription.findUnique({
      where: { tenantId },
    });

    let subscription;

    if (existingSubscription) {
      subscription = await prisma.tenantSubscription.update({
        where: { tenantId },
        data: {
          planoId: planId ?? null,
          planoVersaoId: planoVersaoId ?? null,
          status: payload.status ?? existingSubscription.status,
          trialEndsAt,
          renovaEm,
          planRevision: { increment: 1 }, // Incrementar sempre que atualizar
        },
        include: {
          plano: true,
          planoVersao: true,
        },
      });
    } else {
      subscription = await prisma.tenantSubscription.create({
        data: {
          tenantId,
          planoId: planId ?? null,
          planoVersaoId: planoVersaoId ?? null,
          status: payload.status ?? SubscriptionStatus.TRIAL,
          trialEndsAt,
          renovaEm,
        },
        include: {
          plano: true,
          planoVersao: true,
        },
      });
    }

    const superAdmin = session.user.email
      ? await prisma.superAdmin.findUnique({
          where: { email: session.user.email },
          select: { id: true },
        })
      : null;

    if (!superAdmin?.id) {
      logger.warn(
        "Super admin não encontrado para auditoria ao atualizar tenant",
        { userId: session.user.id, email: session.user.email },
      );
    } else {
      await prisma.superAdminAuditLog.create({
        data: {
          superAdminId: superAdmin.id,
          acao: "UPDATE_TENANT_SUBSCRIPTION",
          entidade: "TENANT",
          entidadeId: tenantId,
          dadosNovos: {
            planId: subscription.planoId,
            status: subscription.status,
            trialEndsAt: subscription.trialEndsAt,
            renovaEm: subscription.renovaEm,
          },
        },
      });
    }

    // Invalidar sessões se algo sensível mudou OU se é uma nova subscription
    const isNewSubscription = !existingSubscription;
    const hasPlanChanged = planId && existingSubscription?.planoId !== planId;
    const hasStatusChanged =
      payload.status && existingSubscription?.status !== payload.status;
    // Detectar mudança mesmo quando valores são null (limpeza de campos)
    const hasTrialEndsAtChanged =
      (trialEndsAt &&
        existingSubscription?.trialEndsAt?.getTime() !==
          trialEndsAt.getTime()) ||
      (!trialEndsAt && existingSubscription?.trialEndsAt !== null) ||
      (trialEndsAt && !existingSubscription?.trialEndsAt);
    const hasRenovaEmChanged =
      (renovaEm &&
        existingSubscription?.renovaEm?.getTime() !== renovaEm.getTime()) ||
      (!renovaEm && existingSubscription?.renovaEm !== null) ||
      (renovaEm && !existingSubscription?.renovaEm);

    // Separar mudanças críticas (exigem logout) de mudanças soft (atualização de UI)
    const { softUpdateTenant, invalidateTenant } = await import(
      "@/app/lib/realtime/invalidation"
    );

    if (hasStatusChanged) {
      // Mudança de status é CRÍTICA (pode exigir logout)
      // Verificar se é suspensão/cancelamento
      const isCriticalStatus =
        payload.status === "SUSPENSA" || payload.status === "CANCELADA";

      if (isCriticalStatus) {
        // HARD LOGOUT - usar invalidateTenant
        await invalidateTenant({
          tenantId,
          reason: `SUBSCRIPTION_STATUS_CHANGED_TO_${payload.status}`,
          actorId: superAdmin?.id || session.user.id,
        });
      } else {
        // SOFT UPDATE - apenas atualizar UI
        await softUpdateTenant({
          tenantId,
          reason: `SUBSCRIPTION_STATUS_CHANGED_TO_${payload.status}`,
          actorId: superAdmin?.id || session.user.id,
          planDetails: {
            planId: subscription.planoId,
            planRevision: subscription.planRevision,
          },
        });
      }
    } else if (
      isNewSubscription ||
      hasPlanChanged ||
      hasTrialEndsAtChanged ||
      hasRenovaEmChanged
    ) {
      // Todas essas mudanças são SOFT (não exigem logout)
      let reason = "";

      if (isNewSubscription) {
        reason = `SUBSCRIPTION_CREATED`;
      } else if (hasPlanChanged) {
        reason = `PLAN_CHANGED_TO_${planId}`;
      } else if (hasTrialEndsAtChanged) {
        reason = `TRIAL_ENDS_AT_CHANGED`;
      } else if (hasRenovaEmChanged) {
        reason = `RENOVA_EM_CHANGED`;
      }

      await softUpdateTenant({
        tenantId,
        reason,
        actorId: superAdmin?.id || session.user.id,
        planDetails: {
          planId: subscription.planoId,
          planRevision: subscription.planRevision,
        },
      });
    }

    const serialized = {
      ...subscription,
      plano: subscription.plano
        ? {
            ...subscription.plano,
            valorMensal:
              subscription.plano.valorMensal !== null &&
              subscription.plano.valorMensal !== undefined
                ? Number(subscription.plano.valorMensal)
                : null,
            valorAnual:
              subscription.plano.valorAnual !== null &&
              subscription.plano.valorAnual !== undefined
                ? Number(subscription.plano.valorAnual)
                : null,
          }
        : null,
    };

    return {
      success: true,
      data: serialized,
    };
  } catch (error) {
    logger.error("Erro ao atualizar assinatura do tenant", error);

    return {
      success: false,
      error: "Erro interno ao atualizar assinatura",
    };
  }
}

export async function updateTenantBranding(
  tenantId: string,
  payload: UpdateTenantBrandingInput,
): Promise<TenantResponse> {
  try {
    const session = await getServerSession(authOptions);

    if (
      !session?.user ||
      session.user.role !== "SUPER_ADMIN" ||
      !session.user.id
    ) {
      return { success: false, error: "Acesso não autorizado" };
    }

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });

    if (!tenant) {
      return { success: false, error: "Tenant não encontrado" };
    }

    const branding = await prisma.tenantBranding.upsert({
      where: { tenantId },
      update: {
        primaryColor: payload.primaryColor ?? undefined,
        secondaryColor: payload.secondaryColor ?? undefined,
        accentColor: payload.accentColor ?? undefined,
        logoUrl: payload.logoUrl ?? undefined,
        faviconUrl: payload.faviconUrl ?? undefined,
      },
      create: {
        tenantId,
        primaryColor: payload.primaryColor ?? "#2563eb",
        secondaryColor: payload.secondaryColor ?? "#1d4ed8",
        accentColor: payload.accentColor ?? "#3b82f6",
        logoUrl: payload.logoUrl ?? null,
        faviconUrl: payload.faviconUrl ?? null,
      },
    });

    await prisma.superAdminAuditLog.create({
      data: {
        superAdminId: session.user.id,
        acao: "UPDATE_TENANT_BRANDING",
        entidade: "TENANT",
        entidadeId: tenantId,
        dadosNovos: branding,
      },
    });

    return {
      success: true,
      data: branding,
    };
  } catch (error) {
    logger.error("Erro ao atualizar branding do tenant", error);

    return {
      success: false,
      error: "Erro interno ao salvar branding",
    };
  }
}

export async function createTenantUser(
  tenantId: string,
  payload: CreateTenantUserInput,
): Promise<TenantResponse> {
  try {
    const session = await getServerSession(authOptions);

    if (
      !session?.user ||
      session.user.role !== "SUPER_ADMIN" ||
      !session.user.id
    ) {
      return { success: false, error: "Acesso não autorizado" };
    }

    // Validar email único
    const existingUser = await prisma.usuario.findFirst({
      where: {
        email: payload.email,
        tenantId: tenantId,
      },
    });

    if (existingUser) {
      return {
        success: false,
        error: "Este email já está em uso por outro usuário neste tenant",
      };
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true },
    });

    if (!tenant) {
      return { success: false, error: "Tenant não encontrado" };
    }

    // Criar usuário
    const newUser = await prisma.usuario.create({
      data: {
        tenantId: tenantId,
        email: payload.email,
        firstName: payload.firstName,
        lastName: payload.lastName,
        phone: payload.phone,
        role: payload.role || "SECRETARIA",
        active: payload.active ?? true,
        passwordHash: null,
        // Campos pessoais adicionais
        cpf: payload.cpf,
        rg: payload.rg,
        dataNascimento: payload.dataNascimentoUsuario
          ? new Date(payload.dataNascimentoUsuario)
          : undefined,
        observacoes: payload.observacoes,
      },
    });

    let firstAccessEmailSent = false;
    let firstAccessEmailError: string | undefined;

    if ((payload.sendFirstAccessEmail ?? true) && newUser.active) {
      const nomeCompleto =
        `${newUser.firstName || ""} ${newUser.lastName || ""}`.trim() || undefined;
      const envioPrimeiroAcesso = await enviarEmailPrimeiroAcesso({
        userId: newUser.id,
        tenantId,
        email: newUser.email,
        nome: nomeCompleto,
        tenantNome: tenant.name,
      });

      firstAccessEmailSent = envioPrimeiroAcesso.success;
      firstAccessEmailError = envioPrimeiroAcesso.success
        ? undefined
        : envioPrimeiroAcesso.error ||
          "Não foi possível enviar o e-mail de primeiro acesso.";
    } else if (payload.sendFirstAccessEmail ?? true) {
      firstAccessEmailError =
        "Usuário criado sem envio de e-mail porque está desativado.";
    }

    // Criar dados do advogado se for advogado
    if (payload.role === "ADVOGADO") {
      await prisma.advogado.create({
        data: {
          tenantId: tenantId,
          usuarioId: newUser.id,
          oabNumero: payload.oabNumero,
          oabUf: payload.oabUf,
          telefone: payload.telefone,
          whatsapp: payload.whatsapp,
          bio: payload.bio,
          especialidades: (payload.especialidades ||
            []) as EspecialidadeJuridica[],
          comissaoPadrao: payload.comissaoPadrao || 0,
          comissaoAcaoGanha: payload.comissaoAcaoGanha || 0,
          comissaoHonorarios: payload.comissaoHonorarios || 0,
        },
      });
    }

    // Criar dados do cliente se for cliente
    if (payload.role === "CLIENTE") {
      await prisma.cliente.create({
        data: {
          tenantId: tenantId,
          usuarioId: newUser.id,
          tipoPessoa: (payload.tipoPessoa || "FISICA") as TipoPessoa,
          nome:
            `${payload.firstName || ""} ${payload.lastName || ""}`.trim() ||
            payload.email,
          documento: payload.documento,
          email: payload.email,
          telefone: payload.telefoneCliente,
          celular: payload.celular,
          dataNascimento: payload.dataNascimento
            ? new Date(payload.dataNascimento)
            : undefined,
          inscricaoEstadual: payload.inscricaoEstadual,
          responsavelNome: payload.responsavelNome,
          responsavelEmail: payload.responsavelEmail,
          responsavelTelefone: payload.responsavelTelefone,
          observacoes: payload.observacoesCliente,
        },
      });
    }

    await prisma.superAdminAuditLog.create({
      data: {
        superAdminId: session.user.id,
        acao: "CREATE_TENANT_USER",
        entidade: "USUARIO",
        entidadeId: newUser.id,
        dadosNovos: {
          email: newUser.email,
          role: newUser.role,
          firstAccessEmailSent,
          tenantId: tenantId,
        },
      },
    });

    return {
      success: true,
      data: {
        user: newUser,
        maskedEmail: maskEmail(newUser.email),
        firstAccessEmailSent,
        firstAccessEmailError,
      },
    };
  } catch (error) {
    logger.error("Erro ao criar usuário:", error);

    return {
      success: false,
      error: "Erro interno do servidor ao criar usuário",
    };
  }
}

export async function updateTenantUser(
  tenantId: string,
  userId: string,
  payload: UpdateTenantUserInput,
): Promise<TenantResponse> {
  try {
    const session = await getServerSession(authOptions);

    if (
      !session?.user ||
      session.user.role !== "SUPER_ADMIN" ||
      !session.user.id
    ) {
      return { success: false, error: "Acesso não autorizado" };
    }

    const user = await prisma.usuario.findUnique({ where: { id: userId } });

    if (!user || user.tenantId !== tenantId) {
      return {
        success: false,
        error: "Usuário não encontrado para este tenant",
      };
    }

    const updateData: Record<string, unknown> = {};

    // Validar email único se está sendo alterado
    if (payload.email && payload.email !== user.email) {
      const existingUser = await prisma.usuario.findFirst({
        where: {
          email: payload.email,
          tenantId: tenantId,
          id: { not: userId },
        },
      });

      if (existingUser) {
        return {
          success: false,
          error: "Este email já está em uso por outro usuário neste tenant",
        };
      }

      updateData.email = payload.email;
    }

    // Atualizar firstName se fornecido
    if (
      payload.firstName !== undefined &&
      payload.firstName !== user.firstName
    ) {
      updateData.firstName = payload.firstName;
    }

    // Atualizar lastName se fornecido
    if (payload.lastName !== undefined && payload.lastName !== user.lastName) {
      updateData.lastName = payload.lastName;
    }

    // Atualizar phone se fornecido
    if (payload.phone !== undefined && payload.phone !== user.phone) {
      updateData.phone = payload.phone;
    }

    // Atualizar avatarUrl se fornecido
    if (
      payload.avatarUrl !== undefined &&
      payload.avatarUrl !== user.avatarUrl
    ) {
      updateData.avatarUrl = payload.avatarUrl;
    }

    // Atualizar campos pessoais adicionais
    if (payload.cpf !== undefined) {
      updateData.cpf = payload.cpf;
    }
    if (payload.rg !== undefined) {
      updateData.rg = payload.rg;
    }
    if (payload.dataNascimentoUsuario !== undefined) {
      updateData.dataNascimento = payload.dataNascimentoUsuario
        ? new Date(payload.dataNascimentoUsuario)
        : null;
    }
    if (payload.observacoes !== undefined) {
      updateData.observacoes = payload.observacoes;
    }

    if (payload.role && payload.role !== user.role) {
      updateData.role = payload.role;
    }

    if (payload.active !== undefined && payload.active !== user.active) {
      updateData.active = payload.active;
    }

    if (payload.resetFirstAccess) {
      updateData.passwordHash = null;
    }

    if (Object.keys(updateData).length === 0) {
      return {
        success: true,
        data: { user },
      };
    }

    // Atualizar dados do advogado se for advogado
    if (payload.role === "ADVOGADO" || user.role === "ADVOGADO") {
      const advogadoData: Record<string, unknown> = {};

      if (payload.oabNumero !== undefined) {
        advogadoData.oabNumero = payload.oabNumero;
      }
      if (payload.oabUf !== undefined) {
        advogadoData.oabUf = payload.oabUf;
      }
      if (payload.telefone !== undefined) {
        advogadoData.telefone = payload.telefone;
      }
      if (payload.whatsapp !== undefined) {
        advogadoData.whatsapp = payload.whatsapp;
      }
      if (payload.bio !== undefined) {
        advogadoData.bio = payload.bio;
      }
      if (payload.especialidades !== undefined) {
        advogadoData.especialidades =
          payload.especialidades as EspecialidadeJuridica[];
      }
      if (payload.comissaoPadrao !== undefined) {
        advogadoData.comissaoPadrao = payload.comissaoPadrao;
      }
      if (payload.comissaoAcaoGanha !== undefined) {
        advogadoData.comissaoAcaoGanha = payload.comissaoAcaoGanha;
      }
      if (payload.comissaoHonorarios !== undefined) {
        advogadoData.comissaoHonorarios = payload.comissaoHonorarios;
      }

      if (Object.keys(advogadoData).length > 0) {
        await prisma.advogado.upsert({
          where: { usuarioId: userId },
          create: {
            tenantId: tenantId,
            usuarioId: userId,
            ...advogadoData,
          },
          update: advogadoData,
        });
      }
    }

    // Atualizar dados do cliente se for cliente
    if (payload.role === "CLIENTE" || user.role === "CLIENTE") {
      const clienteData: Record<string, unknown> = {};

      if (payload.tipoPessoa !== undefined) {
        clienteData.tipoPessoa = payload.tipoPessoa;
      }
      if (payload.documento !== undefined) {
        clienteData.documento = payload.documento;
      }
      if (payload.telefoneCliente !== undefined) {
        clienteData.telefone = payload.telefoneCliente;
      }
      if (payload.celular !== undefined) {
        clienteData.celular = payload.celular;
      }
      if (payload.dataNascimento !== undefined) {
        clienteData.dataNascimento = payload.dataNascimento;
      }
      if (payload.inscricaoEstadual !== undefined) {
        clienteData.inscricaoEstadual = payload.inscricaoEstadual;
      }
      if (payload.responsavelNome !== undefined) {
        clienteData.responsavelNome = payload.responsavelNome;
      }
      if (payload.responsavelEmail !== undefined) {
        clienteData.responsavelEmail = payload.responsavelEmail;
      }
      if (payload.responsavelTelefone !== undefined) {
        clienteData.responsavelTelefone = payload.responsavelTelefone;
      }
      if (payload.observacoesCliente !== undefined) {
        clienteData.observacoes = payload.observacoesCliente;
      }

      // Atualizar nome do cliente baseado no firstName/lastName se fornecido
      if (payload.firstName !== undefined || payload.lastName !== undefined) {
        const nome =
          `${payload.firstName || user.firstName || ""} ${payload.lastName || user.lastName || ""}`.trim();

        if (nome) {
          clienteData.nome = nome;
        }
      }

      if (Object.keys(clienteData).length > 0) {
        await prisma.cliente.upsert({
          where: {
            tenantId_usuarioId: {
              tenantId: tenantId,
              usuarioId: userId,
            },
          },
          create: {
            tenantId: tenantId,
            usuarioId: userId,
            tipoPessoa: (payload.tipoPessoa || "FISICA") as TipoPessoa,
            nome:
              `${payload.firstName || ""} ${payload.lastName || ""}`.trim() ||
              payload.email ||
              "",
            email: payload.email || user.email,
            ...clienteData,
          },
          update: clienteData,
        });
      }
    }

    const updatedUser = await prisma.usuario.update({
      where: { id: userId },
      data: updateData,
    });

    let firstAccessEmailSent: boolean | undefined;
    let firstAccessEmailError: string | undefined;

    if (payload.resetFirstAccess) {
      if (!updatedUser.active) {
        firstAccessEmailSent = false;
        firstAccessEmailError =
          "A senha foi invalidada para primeiro acesso, mas o usuário está desativado e não recebeu e-mail.";
      } else {
        const tenant = await prisma.tenant.findUnique({
          where: { id: tenantId },
          select: { name: true },
        });

        const nomeCompleto =
          `${updatedUser.firstName || ""} ${updatedUser.lastName || ""}`.trim() ||
          undefined;
        const envioPrimeiroAcesso = await enviarEmailPrimeiroAcesso({
          userId: updatedUser.id,
          tenantId,
          email: updatedUser.email,
          nome: nomeCompleto,
          tenantNome: tenant?.name ?? "Magic Lawyer",
        });

        firstAccessEmailSent = envioPrimeiroAcesso.success;
        firstAccessEmailError = envioPrimeiroAcesso.success
          ? undefined
          : envioPrimeiroAcesso.error ||
            "Não foi possível enviar o e-mail de primeiro acesso.";
      }
    }

    // Invalidar sessão do usuário se o status (active) mudou
    if (payload.active !== undefined && payload.active !== user.active) {
      const { invalidateUser } = await import(
        "@/app/lib/realtime/invalidation"
      );

      await invalidateUser({
        userId,
        tenantId,
        reason: payload.active ? "USER_REACTIVATED" : "USER_DEACTIVATED",
        actorId: session.user.id,
      });

      // Disparar notificação de remoção/inativação se usuário foi desativado
      if (!payload.active && user.active) {
        try {
          const { NotificationHelper } = await import(
            "@/app/lib/notifications/notification-helper"
          );

          // Buscar admins e advogados responsáveis para notificar
          const admins = await prisma.usuario.findMany({
            where: {
              tenantId,
              role: "ADMIN",
              active: true,
            },
            select: { id: true },
          });

          const advogados = await prisma.advogado.findMany({
            where: {
              tenantId,
              usuarioId: userId,
            },
            include: {
              usuario: {
                select: { id: true },
              },
            },
          });

          const recipients = new Set<string>();

          admins.forEach((admin) => {
            if (admin.id && admin.id !== session.user.id) {
              recipients.add(admin.id);
            }
          });
          advogados.forEach((adv) => {
            if (adv.usuario?.id && adv.usuario.id !== session.user.id) {
              recipients.add(adv.usuario.id);
            }
          });

          const actorName = session.user.name || "Administrador";

          for (const recipientId of Array.from(recipients)) {
            await NotificationHelper.notifyEquipeUserRemoved(
              tenantId,
              recipientId,
              {
                usuarioId: userId,
                nome:
                  (user as any).name ||
                  `${(user as any).firstName || ""} ${(user as any).lastName || ""}`.trim() ||
                  user.email ||
                  "Usuário",
                role: user.role,
                motivo: "Usuário inativado pelo administrador",
                removidoPor: actorName,
              },
            );
          }
        } catch (error) {
          logger.error(
            "Erro ao notificar remoção/inativação de usuário:",
            error,
          );
          // Não falhar a operação se a notificação falhar
        }
      }
    }

    await prisma.superAdminAuditLog.create({
      data: {
        superAdminId: session.user.id,
        acao: "UPDATE_TENANT_USER",
        entidade: "USUARIO",
        entidadeId: userId,
        dadosNovos: {
          role: updatedUser.role,
          active: updatedUser.active,
          firstAccessReset: Boolean(payload.resetFirstAccess),
        },
      },
    });

    return {
      success: true,
      data: {
        user: updatedUser,
        maskedEmail: maskEmail(updatedUser.email),
        firstAccessEmailSent,
        firstAccessEmailError,
      },
    };
  } catch (error) {
    logger.error("Erro ao atualizar usuário do tenant", error);

    return {
      success: false,
      error: "Erro interno ao atualizar usuário",
    };
  }
}

export async function startTenantUserImpersonation(
  tenantId: string,
  userId: string,
): Promise<TenantResponse> {
  try {
    const session = await getServerSession(authOptions);

    if (
      !session?.user ||
      session.user.role !== "SUPER_ADMIN" ||
      !session.user.id
    ) {
      return {
        success: false,
        error: "Acesso não autorizado para iniciar impersonação.",
      };
    }

    const [superAdmin, targetUser] = await Promise.all([
      prisma.superAdmin.findUnique({
        where: { id: session.user.id },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          image: true,
          status: true,
        },
      }),
      prisma.usuario.findUnique({
        where: { id: userId },
        include: {
          tenant: {
            select: {
              id: true,
              slug: true,
              name: true,
              nomeFantasia: true,
              razaoSocial: true,
              status: true,
              statusReason: true,
              sessionVersion: true,
              planRevision: true,
              branding: {
                select: {
                  logoUrl: true,
                  faviconUrl: true,
                },
              },
            },
          },
          permissoes: {
            select: {
              permissao: true,
            },
          },
        },
      }),
    ]);

    if (!superAdmin || superAdmin.status !== "ACTIVE") {
      return {
        success: false,
        error: "Super admin inválido ou inativo.",
      };
    }

    if (!targetUser || targetUser.tenantId !== tenantId) {
      return {
        success: false,
        error: "Usuário não encontrado para o tenant informado.",
      };
    }

    if (!targetUser.active) {
      return {
        success: false,
        error: "Não é possível impersonar usuário desativado.",
      };
    }

    if (targetUser.tenant.status !== "ACTIVE") {
      return {
        success: false,
        error: `Tenant do usuário está com status ${targetUser.tenant.status}.`,
      };
    }

    const headersList = await headers();
    const requestHeaders = new Headers(headersList);
    const ipAddress = extractRequestIp(requestHeaders);
    const userAgent = extractRequestUserAgent(requestHeaders);

    const superAdminName = buildUserDisplayName(
      superAdmin.firstName,
      superAdmin.lastName,
      superAdmin.email,
    );
    const targetUserName = buildUserDisplayName(
      targetUser.firstName,
      targetUser.lastName,
      targetUser.email,
    );
    const targetTenantName =
      targetUser.tenant.nomeFantasia ??
      targetUser.tenant.razaoSocial ??
      targetUser.tenant.name ??
      targetUser.tenant.slug;
    const targetPermissions = targetUser.permissoes.map(
      (permission) => permission.permissao,
    );
    const targetModules = await getTenantAccessibleModules(targetUser.tenantId);

    const nextSession: ImpersonationSessionSnapshot = {
      id: targetUser.id,
      email: targetUser.email,
      name: targetUserName,
      image: targetUser.avatarUrl ?? null,
      avatarUrl: targetUser.avatarUrl ?? null,
      tenantId: targetUser.tenantId,
      role: targetUser.role,
      tenantSlug: targetUser.tenant.slug,
      tenantName: targetTenantName,
      tenantLogoUrl: targetUser.tenant.branding?.logoUrl ?? null,
      tenantFaviconUrl: targetUser.tenant.branding?.faviconUrl ?? null,
      permissions: targetPermissions,
      tenantModules: targetModules,
      sessionVersion: targetUser.sessionVersion ?? 1,
      tenantSessionVersion: targetUser.tenant.sessionVersion ?? 1,
      tenantPlanRevision: targetUser.tenant.planRevision ?? 1,
      tenantStatus: targetUser.tenant.status,
      tenantStatusReason: targetUser.tenant.statusReason ?? null,
      impersonation: {
        active: true,
        startedAt: new Date().toISOString(),
        superAdminId: superAdmin.id,
        superAdminEmail: superAdmin.email,
        superAdminName,
        targetUserId: targetUser.id,
        targetUserEmail: targetUser.email,
        targetUserName,
        targetUserRole: targetUser.role,
        targetTenantId: targetUser.tenantId,
        targetTenantSlug: targetUser.tenant.slug,
        targetTenantName,
      },
    };

    const ticket = createImpersonationTicket({
      type: "IMPERSONATION_START",
      issuedForSessionId: session.user.id,
      issuedForRole: session.user.role,
      nextSession,
    });

    await prisma.superAdminAuditLog.create({
      data: {
        superAdminId: superAdmin.id,
        acao: "START_USER_IMPERSONATION",
        entidade: "USUARIO",
        entidadeId: targetUser.id,
        ipAddress,
        userAgent,
        dadosNovos: {
          tenantId: targetUser.tenantId,
          tenantSlug: targetUser.tenant.slug,
          tenantName: targetTenantName,
          targetUserEmail: targetUser.email,
          targetUserRole: targetUser.role,
          startedAt: nextSession.impersonation?.startedAt,
        },
      },
    });

    await logOperationalEvent({
      tenantId: targetUser.tenantId,
      category: "SUPPORT",
      source: "SUPER_ADMIN_IMPERSONATION",
      action: "SUPER_ADMIN_IMPERSONATION_STARTED",
      status: "WARNING",
      actorType: "SUPER_ADMIN",
      actorId: superAdmin.id,
      actorName: superAdminName,
      actorEmail: superAdmin.email,
      entityType: "USUARIO",
      entityId: targetUser.id,
      route: `/admin/tenants/${tenantId}`,
      ipAddress,
      userAgent,
      message: `Super admin ${superAdmin.email} iniciou sessão monitorada como ${targetUser.email} (${targetTenantName}).`,
      payload: {
        superAdminId: superAdmin.id,
        superAdminEmail: superAdmin.email,
        targetUserId: targetUser.id,
        targetUserEmail: targetUser.email,
        targetUserRole: targetUser.role,
        tenantId: targetUser.tenantId,
        tenantSlug: targetUser.tenant.slug,
        tenantName: targetTenantName,
      },
    });

    return {
      success: true,
      data: {
        ticket,
        redirectTo: "/dashboard",
      },
    };
  } catch (error) {
    logger.error("Erro ao iniciar impersonação de usuário do tenant", error);
    return {
      success: false,
      error: "Erro interno ao iniciar sessão monitorada.",
    };
  }
}

export async function endTenantUserImpersonation(): Promise<TenantResponse> {
  try {
    const session = await getServerSession(authOptions);
    const impersonation = (session?.user as any)?.impersonation as
      | ImpersonationSessionSnapshot["impersonation"]
      | undefined;

    if (!session?.user || !impersonation?.active) {
      return {
        success: false,
        error: "Nenhuma sessão monitorada ativa para encerrar.",
      };
    }

    const currentSessionId = session.user.id;
    const currentRole = session.user.role;

    if (!currentSessionId || !currentRole) {
      return {
        success: false,
        error: "Sessão inválida para encerramento da impersonação.",
      };
    }

    const superAdmin = await prisma.superAdmin.findUnique({
      where: { id: impersonation.superAdminId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        image: true,
        status: true,
      },
    });

    if (!superAdmin || superAdmin.status !== "ACTIVE") {
      return {
        success: false,
        error:
          "Não foi possível restaurar o Super Admin. Verifique o status da conta.",
      };
    }

    const headersList = await headers();
    const requestHeaders = new Headers(headersList);
    const ipAddress = extractRequestIp(requestHeaders);
    const userAgent = extractRequestUserAgent(requestHeaders);
    const superAdminName = buildUserDisplayName(
      superAdmin.firstName,
      superAdmin.lastName,
      superAdmin.email,
    );

    const nextSession: ImpersonationSessionSnapshot = {
      id: superAdmin.id,
      email: superAdmin.email,
      name: superAdminName,
      image: superAdmin.image ?? null,
      avatarUrl: superAdmin.image ?? null,
      tenantId: null,
      role: "SUPER_ADMIN",
      tenantSlug: null,
      tenantName: "Magic Lawyer Admin",
      tenantLogoUrl: null,
      tenantFaviconUrl: null,
      permissions: ["*"],
      tenantModules: ["*"],
      sessionVersion: 1,
      tenantSessionVersion: 1,
      tenantPlanRevision: 1,
      tenantStatus: "ACTIVE",
      tenantStatusReason: null,
      impersonation: null,
    };

    const ticket = createImpersonationTicket({
      type: "IMPERSONATION_END",
      issuedForSessionId: currentSessionId,
      issuedForRole: currentRole,
      nextSession,
    });

    await prisma.superAdminAuditLog.create({
      data: {
        superAdminId: superAdmin.id,
        acao: "END_USER_IMPERSONATION",
        entidade: "USUARIO",
        entidadeId: impersonation.targetUserId,
        ipAddress,
        userAgent,
        dadosNovos: {
          tenantId: impersonation.targetTenantId,
          tenantSlug: impersonation.targetTenantSlug,
          tenantName: impersonation.targetTenantName,
          targetUserEmail: impersonation.targetUserEmail,
          targetUserRole: impersonation.targetUserRole,
          startedAt: impersonation.startedAt,
          endedAt: new Date().toISOString(),
        },
      },
    });

    await logOperationalEvent({
      tenantId: impersonation.targetTenantId,
      category: "SUPPORT",
      source: "SUPER_ADMIN_IMPERSONATION",
      action: "SUPER_ADMIN_IMPERSONATION_ENDED",
      status: "INFO",
      actorType: "SUPER_ADMIN",
      actorId: superAdmin.id,
      actorName: superAdminName,
      actorEmail: superAdmin.email,
      entityType: "USUARIO",
      entityId: impersonation.targetUserId,
      route: "/dashboard",
      ipAddress,
      userAgent,
      message: `Sessão monitorada encerrada por ${superAdmin.email} (alvo: ${impersonation.targetUserEmail}).`,
      payload: {
        superAdminId: superAdmin.id,
        superAdminEmail: superAdmin.email,
        targetUserId: impersonation.targetUserId,
        targetUserEmail: impersonation.targetUserEmail,
        targetUserRole: impersonation.targetUserRole,
        tenantId: impersonation.targetTenantId,
        tenantSlug: impersonation.targetTenantSlug,
        tenantName: impersonation.targetTenantName,
        startedAt: impersonation.startedAt,
      },
    });

    return {
      success: true,
      data: {
        ticket,
        redirectTo: `/admin/tenants/${impersonation.targetTenantId}`,
      },
    };
  } catch (error) {
    logger.error("Erro ao encerrar impersonação de usuário do tenant", error);
    return {
      success: false,
      error: "Erro interno ao encerrar sessão monitorada.",
    };
  }
}

// =============================================
// JUIZ MANAGEMENT
// =============================================

export interface CreateJuizData {
  nome: string;
  nomeCompleto?: string;
  cpf?: string;
  email?: string;
  telefone?: string;
  endereco?: string;
  cidade?: string;
  estado?: string;
  cep?: string;
  dataNascimento?: Date;
  dataPosse?: Date;
  status: "ATIVO" | "INATIVO" | "APOSENTADO";
  nivel:
    | "JUIZ_SUBSTITUTO"
    | "JUIZ_TITULAR"
    | "DESEMBARGADOR"
    | "MINISTRO"
    | "OUTROS";
  especialidades: EspecialidadeJuridica[];
  vara?: string;
  comarca?: string;
  biografia?: string;
  formacao?: string;
  experiencia?: string;
  premios?: string;
  publicacoes?: string;
  foto?: string;
  website?: string;
  linkedin?: string;
  twitter?: string;
  instagram?: string;
  observacoes?: string;
  isPublico: boolean;
  isPremium: boolean;
  precoAcesso?: number;
  tribunalId?: string;
}

// Criar novo juiz global
export async function createJuizGlobal(
  data: CreateJuizData,
  superAdminId: string,
): Promise<TenantResponse> {
  try {
    const { especialidades, tribunalId, ...rest } = data;
    const juiz = await prisma.juiz.create({
      data: {
        ...rest,
        especialidades: { set: especialidades },
        superAdminId, // Controlado pelo super admin
        tribunalId: tribunalId ?? null,
      },
    });

    // Log de auditoria
    await prisma.superAdminAuditLog.create({
      data: {
        superAdminId,
        acao: "CREATE_JUIZ",
        entidade: "JUIZ",
        entidadeId: juiz.id,
        dadosNovos: {
          nome: juiz.nome,
          isPublico: juiz.isPublico,
          isPremium: juiz.isPremium,
        },
      },
    });

    return {
      success: true,
      data: juiz,
    };
  } catch (error) {
    logger.error("Erro ao criar juiz:", error);

    return {
      success: false,
      error: "Erro interno do servidor ao criar juiz",
    };
  }
}

// Listar todos os juízes (globais e privados)
export async function getAllJuizes(): Promise<TenantResponse> {
  try {
    const juizes = await prisma.juiz.findMany({
      include: {
        superAdmin: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        tribunal: {
          select: {
            nome: true,
            sigla: true,
          },
        },
        _count: {
          select: {
            processos: true,
            julgamentos: true,
          },
        },
      },
      orderBy: [{ isPublico: "desc" }, { createdAt: "desc" }],
    });

    return {
      success: true,
      data: juizes,
    };
  } catch (error) {
    logger.error("Erro ao buscar juízes:", error);

    return {
      success: false,
      error: "Erro interno do servidor ao buscar juízes",
    };
  }
}

// Atualizar juiz
export async function updateJuizGlobal(
  juizId: string,
  data: Partial<CreateJuizData>,
  superAdminId: string,
): Promise<TenantResponse> {
  try {
    // Verificar se o juiz existe e se o super admin tem permissão
    const juizExistente = await prisma.juiz.findFirst({
      where: {
        id: juizId,
        superAdminId, // Apenas o super admin que criou pode editar
      },
    });

    if (!juizExistente) {
      return {
        success: false,
        error: "Juiz não encontrado ou sem permissão para editar",
      };
    }

    const { especialidades, tribunalId, ...rest } = data;

    const juiz = await prisma.juiz.update({
      where: { id: juizId },
      data: {
        ...rest,
        ...(especialidades ? { especialidades: { set: especialidades } } : {}),
        ...(tribunalId !== undefined ? { tribunalId: tribunalId ?? null } : {}),
      },
    });

    // Log de auditoria
    await prisma.superAdminAuditLog.create({
      data: {
        superAdminId,
        acao: "UPDATE_JUIZ",
        entidade: "JUIZ",
        entidadeId: juizId,
        dadosAntigos: juizExistente,
        dadosNovos: juiz,
      },
    });

    return {
      success: true,
      data: juiz,
    };
  } catch (error) {
    logger.error("Erro ao atualizar juiz:", error);

    return {
      success: false,
      error: "Erro interno do servidor ao atualizar juiz",
    };
  }
}

// =============================================
// AUDIT LOGS
// =============================================

// Buscar logs de auditoria
export async function getAuditLogs(
  superAdminId: string,
  limit: number = 50,
): Promise<TenantResponse> {
  try {
    const logs = await prisma.superAdminAuditLog.findMany({
      where: { superAdminId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return {
      success: true,
      data: logs,
    };
  } catch (error) {
    logger.error("Erro ao buscar logs de auditoria:", error);

    return {
      success: false,
      error: "Erro interno do servidor ao buscar logs",
    };
  }
}
