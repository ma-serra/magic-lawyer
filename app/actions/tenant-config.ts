"use server";

import { getServerSession } from "next-auth/next";

import { authOptions } from "@/auth";
import prisma from "@/app/lib/prisma";
import { getTenantAccessibleModules } from "@/app/lib/tenant-modules";
import { getModuleRouteMap } from "@/app/lib/module-map";
import logger from "@/lib/logger";
import { logAudit, toAuditJson } from "@/app/lib/audit/log";
import {
  DigitalCertificateLogAction,
  DigitalCertificatePolicy,
  DigitalCertificateScope,
  Prisma,
} from "@/generated/prisma";
import { TENANT_PERMISSIONS } from "@/types";
import { getBrandingPresetByKey } from "@/lib/branding/presets";
import {
  buildBrandingAccessibilityReport,
  normalizeHexColor,
} from "@/lib/branding/accessibility";

export interface TenantConfigData {
  tenant: {
    id: string;
    name: string;
    slug: string;
    domain: string | null;
    email: string | null;
    telefone: string | null;
    documento: string | null;
    tipoPessoa: "FISICA" | "JURIDICA";
    inscricaoEstadual: string | null;
    inscricaoMunicipal: string | null;
    razaoSocial: string | null;
    nomeFantasia: string | null;
    timezone: string;
    status: string;
    statusReason: string | null;
    statusChangedAt: string | null;
    sessionVersion: number;
    planRevision: number;
    digitalCertificatePolicy: DigitalCertificatePolicy;
    createdAt: string;
    updatedAt: string;
  };
  branding: {
    primaryColor: string | null;
    secondaryColor: string | null;
    accentColor: string | null;
    logoUrl: string | null;
    faviconUrl: string | null;
    loginBackgroundUrl: string | null;
    emailFromName: string | null;
    emailFromAddress: string | null;
    activePresetKey: string | null;
    draft: BrandingDraftState | null;
    hasDraft: boolean;
    lastPublishedAt: string | null;
    lastPublishedBy: string | null;
    accessibilityScore: number;
    accessibilityWarnings: string[];
    history: Array<{
      id: string;
      acao: string;
      createdAt: string;
      changedFields: string[];
      usuario: {
        id: string;
        name: string;
        email: string;
      } | null;
      snapshot: BrandingVisualState | null;
      previousSnapshot: BrandingVisualState | null;
      presetKey: string | null;
      mode: "draft" | "publish" | "rollback" | "unknown";
    }>;
  } | null;
  subscription: {
    id: string | null;
    status: string | null;
    planId: string | null;
    planName: string | null;
    valorMensal: number | null;
    valorAnual: number | null;
    moeda: string | null;
    planRevision: number;
    trialEndsAt: string | null;
    renovaEm: string | null;
    planoVersao: {
      id: string;
      numero: number;
      status: string;
      titulo: string | null;
      descricao: string | null;
      publicadoEm: string | null;
    } | null;
  } | null;
  modules: {
    accessible: string[];
    allAvailable: string[];
    moduleDetails: Array<{
      slug: string;
      name: string;
      description: string;
      accessible: boolean;
      routes: string[];
    }>;
  };
  metrics: {
    usuarios: number;
    processos: number;
    clientes: number;
    contratos: number;
  };
  digitalCertificates: Array<{
    id: string;
    tenantId: string;
    responsavelUsuarioId: string | null;
    label: string | null;
    tipo: string;
    scope: string;
    isActive: boolean;
    validUntil: string | null;
    lastValidatedAt: string | null;
    lastUsedAt: string | null;
    createdAt: string;
    updatedAt: string;
    responsavelUsuario: {
      id: string;
      firstName: string | null;
      lastName: string | null;
      email: string;
    } | null;
  }>;
}

type BrandingVisualState = {
  primaryColor: string | null;
  secondaryColor: string | null;
  accentColor: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
  loginBackgroundUrl: string | null;
  emailFromName: string | null;
  emailFromAddress: string | null;
};

type BrandingDraftState = BrandingVisualState & {
  updatedAt: string;
  updatedBy?: string | null;
  presetKey?: string | null;
};

type TenantBrandingSettings = {
  draft?: BrandingDraftState | null;
  lastPublishedAt?: string | null;
  lastPublishedBy?: string | null;
  activePresetKey?: string | null;
};

function getDefaultBrandingState(): BrandingVisualState {
  return {
    primaryColor: "#2563eb",
    secondaryColor: "#1d4ed8",
    accentColor: "#3b82f6",
    logoUrl: null,
    faviconUrl: null,
    loginBackgroundUrl: null,
    emailFromName: null,
    emailFromAddress: null,
  };
}

function sanitizeEmailFromAddress(value?: string | null): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) {
    return null;
  }

  return trimmed.toLowerCase();
}

function normalizeBrandingState(
  value: Partial<BrandingVisualState> | null | undefined,
): BrandingVisualState {
  const defaults = getDefaultBrandingState();

  return {
    primaryColor:
      normalizeHexColor(value?.primaryColor) ?? defaults.primaryColor,
    secondaryColor:
      normalizeHexColor(value?.secondaryColor) ?? defaults.secondaryColor,
    accentColor: normalizeHexColor(value?.accentColor) ?? defaults.accentColor,
    logoUrl: normalizeBrandingUrl(value?.logoUrl),
    faviconUrl: normalizeBrandingUrl(value?.faviconUrl),
    loginBackgroundUrl: normalizeBrandingUrl(value?.loginBackgroundUrl),
    emailFromName: value?.emailFromName?.trim() || null,
    emailFromAddress:
      sanitizeEmailFromAddress(value?.emailFromAddress ?? null) ?? null,
  };
}

function parseTenantBrandingSettings(
  settings: Prisma.JsonValue | null | undefined,
): TenantBrandingSettings {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return {};
  }

  const settingsObj = settings as Record<string, unknown>;
  const draftRaw = settingsObj.draft;
  let draft: BrandingDraftState | null = null;

  if (draftRaw && typeof draftRaw === "object" && !Array.isArray(draftRaw)) {
    const draftObj = draftRaw as Record<string, unknown>;
    const normalizedDraft = normalizeBrandingState({
      primaryColor:
        typeof draftObj.primaryColor === "string"
          ? draftObj.primaryColor
          : null,
      secondaryColor:
        typeof draftObj.secondaryColor === "string"
          ? draftObj.secondaryColor
          : null,
      accentColor:
        typeof draftObj.accentColor === "string" ? draftObj.accentColor : null,
      logoUrl: typeof draftObj.logoUrl === "string" ? draftObj.logoUrl : null,
      faviconUrl:
        typeof draftObj.faviconUrl === "string" ? draftObj.faviconUrl : null,
      loginBackgroundUrl:
        typeof draftObj.loginBackgroundUrl === "string"
          ? draftObj.loginBackgroundUrl
          : null,
      emailFromName:
        typeof draftObj.emailFromName === "string"
          ? draftObj.emailFromName
          : null,
      emailFromAddress:
        typeof draftObj.emailFromAddress === "string"
          ? draftObj.emailFromAddress
          : null,
    });

    const updatedAt =
      typeof draftObj.updatedAt === "string"
        ? draftObj.updatedAt
        : new Date().toISOString();

    draft = {
      ...normalizedDraft,
      updatedAt,
      updatedBy:
        typeof draftObj.updatedBy === "string" ? draftObj.updatedBy : null,
      presetKey:
        typeof draftObj.presetKey === "string" ? draftObj.presetKey : null,
    };
  }

  return {
    draft,
    lastPublishedAt:
      typeof settingsObj.lastPublishedAt === "string"
        ? settingsObj.lastPublishedAt
        : null,
    lastPublishedBy:
      typeof settingsObj.lastPublishedBy === "string"
        ? settingsObj.lastPublishedBy
        : null,
    activePresetKey:
      typeof settingsObj.activePresetKey === "string"
        ? settingsObj.activePresetKey
        : null,
  };
}

function computeBrandingChangedFields(
  previousState: BrandingVisualState,
  nextState: BrandingVisualState,
): string[] {
  const changedFields: string[] = [];

  for (const key of Object.keys(nextState) as Array<keyof BrandingVisualState>) {
    if ((previousState[key] ?? null) !== (nextState[key] ?? null)) {
      changedFields.push(key);
    }
  }

  return changedFields;
}

// Converter campos Decimal para number
function decimalToNullableNumber(value: any): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    const parsed = parseFloat(value);

    return Number.isNaN(parsed) ? null : parsed;
  }

  return null;
}

// Mapear nomes dos módulos para exibição
const MODULE_NAMES: Record<string, { name: string; description: string }> = {
  "dashboard-geral": {
    name: "Dashboard Geral",
    description: "Visão geral do escritório com métricas e indicadores",
  },
  "processos-gerais": {
    name: "Gestão de Processos",
    description: "Criação, edição e acompanhamento de processos judiciais",
  },
  "clientes-gerais": {
    name: "Gestão de Clientes",
    description: "Cadastro e gerenciamento de clientes e suas informações",
  },
  "agenda-compromissos": {
    name: "Agenda e Compromissos",
    description: "Calendário de eventos, audiências e reuniões",
  },
  "documentos-gerais": {
    name: "Documentos Gerais",
    description: "Upload, organização e gestão de documentos",
  },
  "modelos-documentos": {
    name: "Modelos de Documentos",
    description: "Templates de petições, contratos e procurações",
  },
  "tarefas-kanban": {
    name: "Tarefas e Kanban",
    description: "Gestão de tarefas com visualização em quadro",
  },
  "financeiro-completo": {
    name: "Módulo Financeiro",
    description: "Controle de honorários, parcelas e recebimentos",
  },
  "gestao-equipe": {
    name: "Gestão de Equipe",
    description: "Administração de usuários, advogados e permissões",
  },
  "relatorios-basicos": {
    name: "Relatórios Básicos",
    description: "Geração de relatórios e exportação de dados",
  },
  "contratos-honorarios": {
    name: "Contratos e Honorários",
    description: "Criação e gestão de contratos de honorários",
  },
  procuracoes: {
    name: "Procurações",
    description: "Gestão de procurações e representações",
  },
  "comissoes-advogados": {
    name: "Comissões de Advogados",
    description: "Controle de comissões e participações",
  },
  "notificacoes-avancadas": {
    name: "Notificações Avançadas",
    description: "Sistema de alertas e notificações personalizadas",
  },
  "integracoes-externas": {
    name: "Integrações Externas",
    description: "APIs e integrações com sistemas terceiros",
  },
  "analytics-avancado": {
    name: "Analytics Avançado",
    description: "Métricas detalhadas e business intelligence",
  },
};

export async function getTenantConfigData(): Promise<{
  success: boolean;
  data?: TenantConfigData;
  error?: string;
}> {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id || !session.user.tenantId) {
      return { success: false, error: "Não autorizado" };
    }

    const tenantId = session.user.tenantId;

    // Buscar dados do tenant
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        branding: true,
        subscription: {
          include: {
            plano: true,
            planoVersao: true,
          },
        },
        _count: {
          select: {
            usuarios: true,
            processos: true,
            clientes: true,
            contratos: true,
          },
        },
      },
    });

    if (!tenant) {
      return { success: false, error: "Tenant não encontrado" };
    }

    // Buscar módulos acessíveis
    const accessibleModules = await getTenantAccessibleModules(tenantId);
    const moduleRouteMap = await getModuleRouteMap();
    const allAvailableModules = Object.keys(moduleRouteMap);

    // Criar detalhes dos módulos
    const moduleDetails = allAvailableModules.map((slug) => ({
      slug,
      name: MODULE_NAMES[slug]?.name || slug,
      description: MODULE_NAMES[slug]?.description || "Módulo do sistema",
      accessible: accessibleModules.includes(slug),
      routes: moduleRouteMap[slug] || [],
    }));

    const certificates = await prisma.digitalCertificate.findMany({
      where: {
        tenantId,
        scope: DigitalCertificateScope.OFFICE,
      },
      orderBy: [
        {
          isActive: "desc",
        },
        {
          createdAt: "desc",
        },
      ],
      select: {
        id: true,
        tenantId: true,
        responsavelUsuarioId: true,
        label: true,
        tipo: true,
        scope: true,
        isActive: true,
        validUntil: true,
        lastValidatedAt: true,
        lastUsedAt: true,
        createdAt: true,
        updatedAt: true,
        responsavelUsuario: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    const brandingSettings = parseTenantBrandingSettings(tenant.branding?.settings);
    const publishedState = normalizeBrandingState({
      primaryColor: tenant.branding?.primaryColor,
      secondaryColor: tenant.branding?.secondaryColor,
      accentColor: tenant.branding?.accentColor,
      logoUrl: tenant.branding?.logoUrl,
      faviconUrl: tenant.branding?.faviconUrl,
      loginBackgroundUrl: tenant.branding?.loginBackgroundUrl,
      emailFromName: tenant.branding?.emailFromName,
      emailFromAddress: tenant.branding?.emailFromAddress,
    });

    const brandingHistoryRows = await prisma.auditLog.findMany({
      where: {
        tenantId,
        entidade: "TENANT_BRANDING",
        acao: {
          in: [
            "TENANT_BRANDING_DRAFT_SAVED",
            "TENANT_BRANDING_PUBLISHED",
            "TENANT_BRANDING_ROLLBACK",
          ],
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 20,
      select: {
        id: true,
        acao: true,
        createdAt: true,
        changedFields: true,
        dados: true,
        previousValues: true,
        usuario: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    const history = brandingHistoryRows.map((row) => {
      const dados =
        row.dados && typeof row.dados === "object" && !Array.isArray(row.dados)
          ? (row.dados as Record<string, unknown>)
          : null;
      const previous =
        row.previousValues &&
        typeof row.previousValues === "object" &&
        !Array.isArray(row.previousValues)
          ? (row.previousValues as Record<string, unknown>)
          : null;
      const modeRaw = typeof dados?.mode === "string" ? dados.mode : "unknown";
      const snapshotRaw =
        dados?.next && typeof dados.next === "object" && !Array.isArray(dados.next)
          ? (dados.next as Record<string, unknown>)
          : null;
      const previousSnapshotRaw =
        previous?.state &&
        typeof previous.state === "object" &&
        !Array.isArray(previous.state)
          ? (previous.state as Record<string, unknown>)
          : null;

      const mode: "draft" | "publish" | "rollback" | "unknown" =
        modeRaw === "draft" || modeRaw === "publish" || modeRaw === "rollback"
          ? modeRaw
          : "unknown";

      return {
        id: row.id,
        acao: row.acao,
        createdAt: row.createdAt.toISOString(),
        changedFields: row.changedFields,
        usuario: row.usuario
          ? {
              id: row.usuario.id,
              name:
                [row.usuario.firstName, row.usuario.lastName]
                  .filter(Boolean)
                  .join(" ")
                  .trim() || row.usuario.email,
              email: row.usuario.email,
            }
          : null,
        snapshot: snapshotRaw
          ? normalizeBrandingState({
              primaryColor:
                typeof snapshotRaw.primaryColor === "string"
                  ? snapshotRaw.primaryColor
                  : null,
              secondaryColor:
                typeof snapshotRaw.secondaryColor === "string"
                  ? snapshotRaw.secondaryColor
                  : null,
              accentColor:
                typeof snapshotRaw.accentColor === "string"
                  ? snapshotRaw.accentColor
                  : null,
              logoUrl:
                typeof snapshotRaw.logoUrl === "string" ? snapshotRaw.logoUrl : null,
              faviconUrl:
                typeof snapshotRaw.faviconUrl === "string"
                  ? snapshotRaw.faviconUrl
                  : null,
              loginBackgroundUrl:
                typeof snapshotRaw.loginBackgroundUrl === "string"
                  ? snapshotRaw.loginBackgroundUrl
                  : null,
              emailFromName:
                typeof snapshotRaw.emailFromName === "string"
                  ? snapshotRaw.emailFromName
                  : null,
              emailFromAddress:
                typeof snapshotRaw.emailFromAddress === "string"
                  ? snapshotRaw.emailFromAddress
                  : null,
            })
          : null,
        previousSnapshot: previousSnapshotRaw
          ? normalizeBrandingState({
              primaryColor:
                typeof previousSnapshotRaw.primaryColor === "string"
                  ? previousSnapshotRaw.primaryColor
                  : null,
              secondaryColor:
                typeof previousSnapshotRaw.secondaryColor === "string"
                  ? previousSnapshotRaw.secondaryColor
                  : null,
              accentColor:
                typeof previousSnapshotRaw.accentColor === "string"
                  ? previousSnapshotRaw.accentColor
                  : null,
              logoUrl:
                typeof previousSnapshotRaw.logoUrl === "string"
                  ? previousSnapshotRaw.logoUrl
                  : null,
              faviconUrl:
                typeof previousSnapshotRaw.faviconUrl === "string"
                  ? previousSnapshotRaw.faviconUrl
                  : null,
              loginBackgroundUrl:
                typeof previousSnapshotRaw.loginBackgroundUrl === "string"
                  ? previousSnapshotRaw.loginBackgroundUrl
                  : null,
              emailFromName:
                typeof previousSnapshotRaw.emailFromName === "string"
                  ? previousSnapshotRaw.emailFromName
                  : null,
              emailFromAddress:
                typeof previousSnapshotRaw.emailFromAddress === "string"
                  ? previousSnapshotRaw.emailFromAddress
                  : null,
            })
          : null,
        presetKey:
          typeof dados?.presetKey === "string" ? dados.presetKey : null,
        mode,
      };
    });

    const accessibility = buildBrandingAccessibilityReport(publishedState);

    const data: TenantConfigData = {
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        domain: tenant.domain,
        email: tenant.email,
        telefone: tenant.telefone,
        documento: tenant.documento,
        tipoPessoa: tenant.tipoPessoa,
        inscricaoEstadual: tenant.inscricaoEstadual,
        inscricaoMunicipal: tenant.inscricaoMunicipal,
        razaoSocial: tenant.razaoSocial,
        nomeFantasia: tenant.nomeFantasia,
        timezone: tenant.timezone,
        status: tenant.status,
        statusReason: tenant.statusReason,
        statusChangedAt: tenant.statusChangedAt?.toISOString() ?? null,
        sessionVersion: tenant.sessionVersion,
        planRevision: tenant.planRevision,
        digitalCertificatePolicy:
          tenant.digitalCertificatePolicy ?? DigitalCertificatePolicy.OFFICE,
        createdAt: tenant.createdAt.toISOString(),
        updatedAt: tenant.updatedAt.toISOString(),
      },
      branding: {
        primaryColor: publishedState.primaryColor,
        secondaryColor: publishedState.secondaryColor,
        accentColor: publishedState.accentColor,
        logoUrl: publishedState.logoUrl,
        faviconUrl: publishedState.faviconUrl,
        loginBackgroundUrl: publishedState.loginBackgroundUrl,
        emailFromName: publishedState.emailFromName,
        emailFromAddress: publishedState.emailFromAddress,
        activePresetKey: brandingSettings.activePresetKey || null,
        draft: brandingSettings.draft || null,
        hasDraft: Boolean(brandingSettings.draft),
        lastPublishedAt: brandingSettings.lastPublishedAt || null,
        lastPublishedBy: brandingSettings.lastPublishedBy || null,
        accessibilityScore: accessibility.score,
        accessibilityWarnings: accessibility.warnings,
        history,
      },
      subscription: tenant.subscription
        ? {
            id: tenant.subscription.id,
            status: tenant.subscription.status,
            planId: tenant.subscription.planoId,
            planName: tenant.subscription.plano?.nome ?? null,
            valorMensal: decimalToNullableNumber(
              tenant.subscription.plano?.valorMensal,
            ),
            valorAnual: decimalToNullableNumber(
              tenant.subscription.plano?.valorAnual,
            ),
            moeda: tenant.subscription.plano?.moeda ?? null,
            planRevision: tenant.subscription.planRevision,
            trialEndsAt: tenant.subscription.trialEndsAt?.toISOString() ?? null,
            renovaEm: tenant.subscription.renovaEm?.toISOString() ?? null,
            planoVersao: tenant.subscription.planoVersao
              ? {
                  id: tenant.subscription.planoVersao.id,
                  numero: tenant.subscription.planoVersao.numero,
                  status: tenant.subscription.planoVersao.status,
                  titulo: tenant.subscription.planoVersao.titulo,
                  descricao: tenant.subscription.planoVersao.descricao,
                  publicadoEm:
                    tenant.subscription.planoVersao.publicadoEm?.toISOString() ??
                    null,
                }
              : null,
          }
        : null,
      modules: {
        accessible: accessibleModules,
        allAvailable: allAvailableModules,
        moduleDetails,
      },
      metrics: {
        usuarios: tenant._count.usuarios,
        processos: tenant._count.processos,
        clientes: tenant._count.clientes,
        contratos: tenant._count.contratos,
      },
      digitalCertificates: certificates.map((cert) => ({
        id: cert.id,
        tenantId: cert.tenantId,
        responsavelUsuarioId: cert.responsavelUsuarioId,
        label: cert.label,
        tipo: cert.tipo,
        scope: cert.scope,
        isActive: cert.isActive,
        validUntil: cert.validUntil?.toISOString() ?? null,
        lastValidatedAt: cert.lastValidatedAt?.toISOString() ?? null,
        lastUsedAt: cert.lastUsedAt?.toISOString() ?? null,
        createdAt: cert.createdAt.toISOString(),
        updatedAt: cert.updatedAt.toISOString(),
        responsavelUsuario: cert.responsavelUsuario
          ? {
              id: cert.responsavelUsuario.id,
              firstName: cert.responsavelUsuario.firstName,
              lastName: cert.responsavelUsuario.lastName,
              email: cert.responsavelUsuario.email,
            }
          : null,
      })),
    };

    return {
      success: true,
      data,
    };
  } catch (error) {
    logger.error("Erro ao buscar dados de configuração do tenant:", error);

    return {
      success: false,
      error: "Erro interno do servidor",
    };
  }
}

// ===== INTERFACES DE EDIÇÃO =====

export interface UpdateTenantBasicDataInput {
  name?: string;
  email?: string;
  telefone?: string;
  documento?: string;
  tipoPessoa?: "FISICA" | "JURIDICA";
  inscricaoEstadual?: string;
  inscricaoMunicipal?: string;
  razaoSocial?: string;
  nomeFantasia?: string;
  timezone?: string;
}

export interface UpdateTenantCertificatePolicyInput {
  policy: DigitalCertificatePolicy;
}

export interface UpdateTenantBrandingInput {
  mode?: "draft" | "publish";
  presetKey?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  accentColor?: string | null;
  logoUrl?: string | null;
  faviconUrl?: string | null;
  loginBackgroundUrl?: string | null;
  emailFromName?: string | null;
  emailFromAddress?: string | null;
}

function normalizeBrandingUrl(value?: string | null): string | null {
  if (value === undefined) {
    return null;
  }

  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("/")) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return trimmed;
    }
    return null;
  } catch {
    return null;
  }
}

// ===== ACTIONS DE EDIÇÃO =====

/**
 * Atualiza dados básicos do tenant (nome, email, telefone, etc.)
 */
export async function updateTenantBasicData(
  data: UpdateTenantBasicDataInput,
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id || !session.user.tenantId) {
      return { success: false, error: "Não autorizado" };
    }

    const tenantId = session.user.tenantId;

    // Validar permissões
    const role = (session.user as any)?.role as string;

    if (role !== "ADMIN" && role !== "SUPER_ADMIN") {
      return {
        success: false,
        error: "Apenas administradores podem editar essas configurações",
      };
    }

    const updateData: Record<string, unknown> = {};

    if (data.name !== undefined) updateData.name = data.name.trim();
    if (data.email !== undefined) updateData.email = data.email?.trim() || null;
    if (data.telefone !== undefined)
      updateData.telefone = data.telefone?.trim() || null;
    if (data.documento !== undefined) {
      const normalizedDocumento = data.documento.replace(/\D/g, "");
      updateData.documento = normalizedDocumento || null;
    }
    if (data.tipoPessoa !== undefined) updateData.tipoPessoa = data.tipoPessoa;
    if (data.inscricaoEstadual !== undefined) {
      updateData.inscricaoEstadual = data.inscricaoEstadual?.trim() || null;
    }
    if (data.inscricaoMunicipal !== undefined) {
      updateData.inscricaoMunicipal = data.inscricaoMunicipal?.trim() || null;
    }
    if (data.razaoSocial !== undefined)
      updateData.razaoSocial = data.razaoSocial?.trim() || null;
    if (data.nomeFantasia !== undefined)
      updateData.nomeFantasia = data.nomeFantasia?.trim() || null;
    if (data.timezone !== undefined) updateData.timezone = data.timezone;

    // Só atualizar se houver mudanças
    if (Object.keys(updateData).length > 0) {
      await prisma.tenant.update({
        where: { id: tenantId },
        data: updateData,
      });

      // Incrementar sessionVersion para forçar refresh
      await prisma.tenant.update({
        where: { id: tenantId },
        data: { sessionVersion: { increment: 1 } },
      });
    }

    logger.info(`Tenant ${tenantId} atualizado por ${session.user.email}`);

    return { success: true };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        success: false,
        error: "Documento já está sendo usado por outro escritório.",
      };
    }

    logger.error("Erro ao atualizar dados básicos do tenant:", error);

    return {
      success: false,
      error: "Erro interno ao salvar configurações",
    };
  }
}

/**
 * Atualiza branding do tenant (cores, logo, favicon)
 */
export async function updateTenantBranding(
  data: UpdateTenantBrandingInput,
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id || !session.user.tenantId) {
      return { success: false, error: "Não autorizado" };
    }

    const tenantId = session.user.tenantId;

    // Validar permissões
    const role = (session.user as any)?.role as string;

    if (role !== "ADMIN" && role !== "SUPER_ADMIN") {
      return {
        success: false,
        error: "Apenas administradores podem editar o branding",
      };
    }

    const mode = data.mode ?? "publish";
    if (mode !== "draft" && mode !== "publish") {
      return {
        success: false,
        error: "Modo de atualização de branding inválido.",
      };
    }

    const existing = await prisma.tenantBranding.findUnique({
      where: { tenantId },
      select: {
        id: true,
        primaryColor: true,
        secondaryColor: true,
        accentColor: true,
        logoUrl: true,
        faviconUrl: true,
        loginBackgroundUrl: true,
        emailFromName: true,
        emailFromAddress: true,
        settings: true,
      },
    });

    const settings = parseTenantBrandingSettings(existing?.settings);
    const currentPublished = normalizeBrandingState({
      primaryColor: existing?.primaryColor,
      secondaryColor: existing?.secondaryColor,
      accentColor: existing?.accentColor,
      logoUrl: existing?.logoUrl,
      faviconUrl: existing?.faviconUrl,
      loginBackgroundUrl: existing?.loginBackgroundUrl,
      emailFromName: existing?.emailFromName,
      emailFromAddress: existing?.emailFromAddress,
    });
    const currentDraft = settings.draft
      ? normalizeBrandingState(settings.draft)
      : null;

    const explicitPrimary = data.primaryColor !== undefined;
    const explicitSecondary = data.secondaryColor !== undefined;
    const explicitAccent = data.accentColor !== undefined;
    const explicitLogo = data.logoUrl !== undefined;
    const explicitFavicon = data.faviconUrl !== undefined;
    const explicitLoginBackground = data.loginBackgroundUrl !== undefined;
    const explicitEmailFromName = data.emailFromName !== undefined;
    const explicitEmailFromAddress = data.emailFromAddress !== undefined;

    const hasExplicitColorOrMediaChange =
      explicitPrimary ||
      explicitSecondary ||
      explicitAccent ||
      explicitLogo ||
      explicitFavicon ||
      explicitLoginBackground ||
      explicitEmailFromName ||
      explicitEmailFromAddress;

    const preset =
      data.presetKey === undefined ? null : getBrandingPresetByKey(data.presetKey);
    if (data.presetKey && !preset) {
      return {
        success: false,
        error: "Preset de branding inválido.",
      };
    }

    const sourceState =
      mode === "publish" && !hasExplicitColorOrMediaChange && currentDraft
        ? currentDraft
        : mode === "draft"
          ? currentDraft || currentPublished
          : currentPublished;

    const requestedState: BrandingVisualState = {
      primaryColor:
        data.primaryColor !== undefined
          ? normalizeHexColor(data.primaryColor)
          : sourceState.primaryColor,
      secondaryColor:
        data.secondaryColor !== undefined
          ? normalizeHexColor(data.secondaryColor)
          : sourceState.secondaryColor,
      accentColor:
        data.accentColor !== undefined
          ? normalizeHexColor(data.accentColor)
          : sourceState.accentColor,
      logoUrl:
        data.logoUrl !== undefined
          ? normalizeBrandingUrl(data.logoUrl)
          : sourceState.logoUrl,
      faviconUrl:
        data.faviconUrl !== undefined
          ? normalizeBrandingUrl(data.faviconUrl)
          : sourceState.faviconUrl,
      loginBackgroundUrl:
        data.loginBackgroundUrl !== undefined
          ? normalizeBrandingUrl(data.loginBackgroundUrl)
          : sourceState.loginBackgroundUrl,
      emailFromName:
        data.emailFromName !== undefined
          ? data.emailFromName?.trim() || null
          : sourceState.emailFromName,
      emailFromAddress:
        data.emailFromAddress !== undefined
          ? sanitizeEmailFromAddress(data.emailFromAddress)
          : sourceState.emailFromAddress,
    };

    if (explicitPrimary && !requestedState.primaryColor) {
      return {
        success: false,
        error: "Cor primária inválida. Use hexadecimal como #2563eb ou #fff.",
      };
    }
    if (explicitSecondary && !requestedState.secondaryColor) {
      return {
        success: false,
        error:
          "Cor secundária inválida. Use hexadecimal como #1d4ed8 ou #fff.",
      };
    }
    if (explicitAccent && !requestedState.accentColor) {
      return {
        success: false,
        error: "Cor de destaque inválida. Use hexadecimal como #3b82f6 ou #fff.",
      };
    }
    if (
      explicitLogo &&
      data.logoUrl?.trim() &&
      !requestedState.logoUrl
    ) {
      return {
        success: false,
        error:
          "URL da logo inválida. Use URL HTTP/HTTPS ou caminho interno (/uploads/...).",
      };
    }
    if (
      explicitFavicon &&
      data.faviconUrl?.trim() &&
      !requestedState.faviconUrl
    ) {
      return {
        success: false,
        error:
          "URL do favicon inválida. Use URL HTTP/HTTPS ou caminho interno (/uploads/...).",
      };
    }
    if (
      explicitLoginBackground &&
      data.loginBackgroundUrl?.trim() &&
      !requestedState.loginBackgroundUrl
    ) {
      return {
        success: false,
        error:
          "URL de fundo inválida. Use URL HTTP/HTTPS ou caminho interno (/uploads/...).",
      };
    }
    if (
      explicitEmailFromAddress &&
      data.emailFromAddress?.trim() &&
      !requestedState.emailFromAddress
    ) {
      return {
        success: false,
        error: "Email de envio inválido para branding.",
      };
    }

    const updatedSettings: TenantBrandingSettings = {
      ...settings,
      activePresetKey:
        data.presetKey !== undefined
          ? data.presetKey || null
          : (settings.activePresetKey ?? null),
    };

    const previousStateForAudit = mode === "draft" ? currentDraft : currentPublished;
    const changedFields = computeBrandingChangedFields(
      previousStateForAudit || currentPublished,
      requestedState,
    );
    const willChangePreset =
      data.presetKey !== undefined &&
      (data.presetKey || null) !== (settings.activePresetKey || null);

    if (
      mode === "publish" &&
      !settings.draft &&
      changedFields.length === 0 &&
      !willChangePreset
    ) {
      return { success: true };
    }

    if (mode === "draft") {
      const draftSnapshot: BrandingDraftState = {
        ...requestedState,
        updatedAt: new Date().toISOString(),
        updatedBy: session.user.id,
        presetKey:
          data.presetKey !== undefined
            ? data.presetKey || null
            : settings.activePresetKey || null,
      };

      updatedSettings.draft = draftSnapshot;

      await prisma.tenantBranding.upsert({
        where: { tenantId },
        update: {
          settings: toAuditJson(updatedSettings) ?? Prisma.JsonNull,
        },
        create: {
          tenantId,
          primaryColor: currentPublished.primaryColor,
          secondaryColor: currentPublished.secondaryColor,
          accentColor: currentPublished.accentColor,
          logoUrl: currentPublished.logoUrl,
          faviconUrl: currentPublished.faviconUrl,
          loginBackgroundUrl: currentPublished.loginBackgroundUrl,
          emailFromName: currentPublished.emailFromName,
          emailFromAddress: currentPublished.emailFromAddress,
          settings: toAuditJson(updatedSettings) ?? Prisma.JsonNull,
        },
      });

      await logAudit({
        tenantId,
        usuarioId: session.user.id,
        acao: "TENANT_BRANDING_DRAFT_SAVED",
        entidade: "TENANT_BRANDING",
        entidadeId: existing?.id ?? tenantId,
        dados: toAuditJson({
          mode: "draft",
          presetKey: draftSnapshot.presetKey || null,
          next: requestedState,
        }),
        previousValues: toAuditJson({
          state: previousStateForAudit,
        }),
        changedFields,
      });
    } else {
      updatedSettings.lastPublishedAt = new Date().toISOString();
      updatedSettings.lastPublishedBy = session.user.id;
      updatedSettings.draft = null;

      await prisma.tenantBranding.upsert({
        where: { tenantId },
        update: {
          primaryColor: requestedState.primaryColor,
          secondaryColor: requestedState.secondaryColor,
          accentColor: requestedState.accentColor,
          logoUrl: requestedState.logoUrl,
          faviconUrl: requestedState.faviconUrl,
          loginBackgroundUrl: requestedState.loginBackgroundUrl,
          emailFromName: requestedState.emailFromName,
          emailFromAddress: requestedState.emailFromAddress,
          settings: toAuditJson(updatedSettings) ?? Prisma.JsonNull,
        },
        create: {
          tenantId,
          primaryColor: requestedState.primaryColor,
          secondaryColor: requestedState.secondaryColor,
          accentColor: requestedState.accentColor,
          logoUrl: requestedState.logoUrl,
          faviconUrl: requestedState.faviconUrl,
          loginBackgroundUrl: requestedState.loginBackgroundUrl,
          emailFromName: requestedState.emailFromName,
          emailFromAddress: requestedState.emailFromAddress,
          settings: toAuditJson(updatedSettings) ?? Prisma.JsonNull,
        },
      });

      await logAudit({
        tenantId,
        usuarioId: session.user.id,
        acao: "TENANT_BRANDING_PUBLISHED",
        entidade: "TENANT_BRANDING",
        entidadeId: existing?.id ?? tenantId,
        dados: toAuditJson({
          mode: "publish",
          presetKey:
            data.presetKey !== undefined
              ? data.presetKey || null
              : settings.activePresetKey || null,
          next: requestedState,
        }),
        previousValues: toAuditJson({
          state: previousStateForAudit,
        }),
        changedFields,
      });
    }

    logger.info(
      `Branding do tenant ${tenantId} atualizado (${mode}) por ${session.user.email}`,
    );

    return { success: true };
  } catch (error) {
    logger.error("Erro ao atualizar branding do tenant:", error);

    return {
      success: false,
      error: "Erro interno ao salvar branding",
    };
  }
}

export async function rollbackTenantBrandingVersion(
  historyEntryId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id || !session.user.tenantId) {
      return { success: false, error: "Não autorizado" };
    }

    const tenantId = session.user.tenantId;
    const role = (session.user as any)?.role as string;

    if (role !== "ADMIN" && role !== "SUPER_ADMIN") {
      return {
        success: false,
        error: "Apenas administradores podem restaurar versões de branding.",
      };
    }

    const historyEntry = await prisma.auditLog.findFirst({
      where: {
        id: historyEntryId,
        tenantId,
        entidade: "TENANT_BRANDING",
      },
      select: {
        id: true,
        dados: true,
      },
    });

    if (!historyEntry) {
      return {
        success: false,
        error: "Versão de branding não encontrada.",
      };
    }

    const dados =
      historyEntry.dados &&
      typeof historyEntry.dados === "object" &&
      !Array.isArray(historyEntry.dados)
        ? (historyEntry.dados as Record<string, unknown>)
        : null;
    const snapshotRaw =
      dados?.next && typeof dados.next === "object" && !Array.isArray(dados.next)
        ? (dados.next as Record<string, unknown>)
        : null;

    if (!snapshotRaw) {
      return {
        success: false,
        error: "A versão escolhida não possui snapshot para rollback.",
      };
    }

    const snapshot = normalizeBrandingState({
      primaryColor:
        typeof snapshotRaw.primaryColor === "string"
          ? snapshotRaw.primaryColor
          : null,
      secondaryColor:
        typeof snapshotRaw.secondaryColor === "string"
          ? snapshotRaw.secondaryColor
          : null,
      accentColor:
        typeof snapshotRaw.accentColor === "string" ? snapshotRaw.accentColor : null,
      logoUrl: typeof snapshotRaw.logoUrl === "string" ? snapshotRaw.logoUrl : null,
      faviconUrl:
        typeof snapshotRaw.faviconUrl === "string" ? snapshotRaw.faviconUrl : null,
      loginBackgroundUrl:
        typeof snapshotRaw.loginBackgroundUrl === "string"
          ? snapshotRaw.loginBackgroundUrl
          : null,
      emailFromName:
        typeof snapshotRaw.emailFromName === "string"
          ? snapshotRaw.emailFromName
          : null,
      emailFromAddress:
        typeof snapshotRaw.emailFromAddress === "string"
          ? snapshotRaw.emailFromAddress
          : null,
    });

    const currentBranding = await prisma.tenantBranding.findUnique({
      where: { tenantId },
      select: {
        id: true,
        primaryColor: true,
        secondaryColor: true,
        accentColor: true,
        logoUrl: true,
        faviconUrl: true,
        loginBackgroundUrl: true,
        emailFromName: true,
        emailFromAddress: true,
        settings: true,
      },
    });

    const currentState = normalizeBrandingState({
      primaryColor: currentBranding?.primaryColor,
      secondaryColor: currentBranding?.secondaryColor,
      accentColor: currentBranding?.accentColor,
      logoUrl: currentBranding?.logoUrl,
      faviconUrl: currentBranding?.faviconUrl,
      loginBackgroundUrl: currentBranding?.loginBackgroundUrl,
      emailFromName: currentBranding?.emailFromName,
      emailFromAddress: currentBranding?.emailFromAddress,
    });
    const settings = parseTenantBrandingSettings(currentBranding?.settings);
    const updatedSettings: TenantBrandingSettings = {
      ...settings,
      draft: null,
      lastPublishedAt: new Date().toISOString(),
      lastPublishedBy: session.user.id,
      activePresetKey:
        typeof dados?.presetKey === "string" ? dados.presetKey : settings.activePresetKey,
    };

    await prisma.tenantBranding.upsert({
      where: { tenantId },
      update: {
        primaryColor: snapshot.primaryColor,
        secondaryColor: snapshot.secondaryColor,
        accentColor: snapshot.accentColor,
        logoUrl: snapshot.logoUrl,
        faviconUrl: snapshot.faviconUrl,
        loginBackgroundUrl: snapshot.loginBackgroundUrl,
        emailFromName: snapshot.emailFromName,
        emailFromAddress: snapshot.emailFromAddress,
        settings: toAuditJson(updatedSettings) ?? Prisma.JsonNull,
      },
      create: {
        tenantId,
        primaryColor: snapshot.primaryColor,
        secondaryColor: snapshot.secondaryColor,
        accentColor: snapshot.accentColor,
        logoUrl: snapshot.logoUrl,
        faviconUrl: snapshot.faviconUrl,
        loginBackgroundUrl: snapshot.loginBackgroundUrl,
        emailFromName: snapshot.emailFromName,
        emailFromAddress: snapshot.emailFromAddress,
        settings: toAuditJson(updatedSettings) ?? Prisma.JsonNull,
      },
    });

    await logAudit({
      tenantId,
      usuarioId: session.user.id,
      acao: "TENANT_BRANDING_ROLLBACK",
      entidade: "TENANT_BRANDING",
      entidadeId: currentBranding?.id ?? tenantId,
      dados: toAuditJson({
        mode: "rollback",
        sourceAuditId: historyEntry.id,
        presetKey: updatedSettings.activePresetKey || null,
        next: snapshot,
      }),
      previousValues: toAuditJson({
        state: currentState,
      }),
      changedFields: computeBrandingChangedFields(currentState, snapshot),
    });

    return { success: true };
  } catch (error) {
    logger.error("Erro ao restaurar versão de branding:", error);

    return {
      success: false,
      error: "Erro interno ao restaurar versão de branding.",
    };
  }
}

/**
 * Atualiza política de certificados digitais do tenant.
 */
export async function updateTenantCertificatePolicy({
  policy,
}: UpdateTenantCertificatePolicyInput): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id || !session.user.tenantId) {
      return { success: false, error: "Não autorizado" };
    }

    const tenantId = session.user.tenantId;
    const role = (session.user as any)?.role as string | undefined;
    const permissions = ((session.user as any)?.permissions ?? []) as string[];

    const hasPermission =
      role === "SUPER_ADMIN" ||
      permissions.includes(TENANT_PERMISSIONS.manageOfficeSettings);

    if (!hasPermission) {
      return {
        success: false,
        error: "Apenas administradores podem alterar essa política.",
      };
    }

    if (
      ![
        DigitalCertificatePolicy.OFFICE,
        DigitalCertificatePolicy.LAWYER,
        DigitalCertificatePolicy.HYBRID,
      ].includes(policy)
    ) {
      return { success: false, error: "Política inválida." };
    }

    const current = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { digitalCertificatePolicy: true },
    });

    if (!current) {
      return { success: false, error: "Tenant não encontrado." };
    }

    if (current.digitalCertificatePolicy === policy) {
      return { success: true };
    }

    await prisma.$transaction(async (tx) => {
      await tx.tenant.update({
        where: { id: tenantId },
        data: {
          digitalCertificatePolicy: policy,
          sessionVersion: { increment: 1 },
        },
      });

      if (policy === DigitalCertificatePolicy.OFFICE) {
        const activePersonal = await tx.digitalCertificate.findMany({
          where: {
            tenantId,
            scope: DigitalCertificateScope.LAWYER,
            isActive: true,
          },
          select: { id: true },
        });

        if (activePersonal.length > 0) {
          const ids = activePersonal.map((item) => item.id);
          await tx.digitalCertificate.updateMany({
            where: { id: { in: ids } },
            data: { isActive: false },
          });

          await tx.digitalCertificateLog.createMany({
            data: ids.map((id) => ({
              tenantId,
              digitalCertificateId: id,
              action: DigitalCertificateLogAction.DISABLED,
              actorId: session.user.id,
              message:
                "Desativado ao alterar política para certificado do escritório.",
            })),
          });
        }
      }

      if (policy === DigitalCertificatePolicy.LAWYER) {
        const activeOffice = await tx.digitalCertificate.findMany({
          where: {
            tenantId,
            scope: DigitalCertificateScope.OFFICE,
            isActive: true,
          },
          select: { id: true },
        });

        if (activeOffice.length > 0) {
          const ids = activeOffice.map((item) => item.id);
          await tx.digitalCertificate.updateMany({
            where: { id: { in: ids } },
            data: { isActive: false },
          });

          await tx.digitalCertificateLog.createMany({
            data: ids.map((id) => ({
              tenantId,
              digitalCertificateId: id,
              action: DigitalCertificateLogAction.DISABLED,
              actorId: session.user.id,
              message:
                "Desativado ao alterar política para certificados por advogado.",
            })),
          });
        }
      }
    });

    return { success: true };
  } catch (error) {
    logger.error("Erro ao atualizar política de certificados:", error);
    return {
      success: false,
      error: "Erro interno ao salvar política de certificados.",
    };
  }
}
