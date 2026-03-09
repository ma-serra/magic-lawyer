import type { ClicksignAmbiente } from "./clicksign-config";
import {
  getTenantChannelProviderDefinition,
  type TenantChannelProviderChannel,
  type TenantChannelProviderHealthStatus,
  type TenantChannelProviderType,
  type TenantChannelValidationMode,
} from "./omnichannel-config";
import type { DigitalCertificatePolicy } from "@/generated/prisma";

export type AdminClicksignEffectiveSource =
  | "TENANT"
  | "GLOBAL"
  | "MOCK"
  | "DISABLED"
  | "NONE";

export type AdminClicksignSummary = {
  id: string | null;
  apiBase: string | null;
  ambiente: ClicksignAmbiente;
  integracaoAtiva: boolean;
  dataConfiguracao: Date | null;
  ultimaValidacao: Date | null;
  hasAccessToken: boolean;
  hasTenantConfig: boolean;
  effectiveSource: AdminClicksignEffectiveSource;
  fallbackAvailable: boolean;
  fallbackSource: "GLOBAL" | "MOCK";
  mockMode: boolean;
  fallbackApiBase: string;
  fallbackAmbiente: ClicksignAmbiente;
};

export type AdminAsaasSummary = {
  id: string | null;
  asaasAccountId: string | null;
  asaasWalletId: string | null;
  ambiente: "SANDBOX" | "PRODUCAO";
  integracaoAtiva: boolean;
  dataConfiguracao: Date | null;
  ultimaValidacao: Date | null;
  hasApiKey: boolean;
  hasWebhookAccessToken: boolean;
  webhookConfiguredAt: Date | null;
  lastWebhookAt: Date | null;
  lastWebhookEvent: string | null;
  webhookUrl: string;
  globalWebhookSecretConfigured: boolean;
  isWebhookProtected: boolean;
};

export type AdminCertificatesSummary = {
  policy: DigitalCertificatePolicy;
  totalCertificates: number;
  activeCertificates: number;
  expiredCertificates: number;
  officeCertificates: number;
  lawyerCertificates: number;
  hasActiveOfficeCertificate: boolean;
  latestValidationAt: Date | null;
  latestUseAt: Date | null;
};

export type AdminTenantChannelProviderSummary = {
  id: string | null;
  channel: TenantChannelProviderChannel;
  provider: TenantChannelProviderType | null;
  providerLabel: string | null;
  providerDescription: string | null;
  displayName: string | null;
  active: boolean;
  healthStatus: TenantChannelProviderHealthStatus;
  dataConfiguracao: Date | null;
  lastValidatedAt: Date | null;
  lastValidationMode: TenantChannelValidationMode | null;
  lastErrorAt: Date | null;
  lastErrorMessage: string | null;
  hasCredentials: boolean;
  configSummary: Array<{ key: string; label: string; value: string }>;
  healthHint: string;
};

function toStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.entries(value as Record<string, unknown>).reduce<
    Record<string, string>
  >((acc, [key, entry]) => {
    if (typeof entry === "string") {
      const trimmed = entry.trim();
      if (trimmed) {
        acc[key] = trimmed;
      }
    }

    return acc;
  }, {});
}

function resolveClicksignEffectiveSource(params: {
  hasTenantConfig: boolean;
  integracaoAtiva: boolean;
  fallbackAvailable: boolean;
  fallbackSource: "GLOBAL" | "MOCK";
}): AdminClicksignEffectiveSource {
  if (params.hasTenantConfig) {
    return params.integracaoAtiva ? "TENANT" : "DISABLED";
  }

  return params.fallbackAvailable ? params.fallbackSource : "NONE";
}

export function buildAdminClicksignSummary(
  config: {
    id: string;
    apiBase: string;
    ambiente: ClicksignAmbiente;
    integracaoAtiva: boolean;
    dataConfiguracao: Date;
    ultimaValidacao: Date | null;
    accessTokenEncrypted: string;
  } | null,
  fallback: {
    available: boolean;
    source: "GLOBAL" | "MOCK";
    mockMode: boolean;
    apiBase: string;
    ambiente: ClicksignAmbiente;
  },
): AdminClicksignSummary {
  return {
    id: config?.id ?? null,
    apiBase: config?.apiBase ?? null,
    ambiente: config?.ambiente ?? fallback.ambiente,
    integracaoAtiva: config?.integracaoAtiva ?? false,
    dataConfiguracao: config?.dataConfiguracao ?? null,
    ultimaValidacao: config?.ultimaValidacao ?? null,
    hasAccessToken: Boolean(config?.accessTokenEncrypted),
    hasTenantConfig: Boolean(config),
    effectiveSource: resolveClicksignEffectiveSource({
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
  };
}

export function buildAdminAsaasSummary(
  config: {
    id: string;
    asaasApiKey: string;
    webhookAccessToken: string | null;
    asaasAccountId: string;
    asaasWalletId: string | null;
    ambiente: "SANDBOX" | "PRODUCAO";
    integracaoAtiva: boolean;
    dataConfiguracao: Date;
    webhookConfiguredAt: Date | null;
    lastWebhookAt: Date | null;
    lastWebhookEvent: string | null;
    ultimaValidacao: Date | null;
  } | null,
  options: {
    webhookUrl: string;
    globalWebhookSecretConfigured: boolean;
  },
): AdminAsaasSummary {
  const hasWebhookAccessToken = Boolean(config?.webhookAccessToken);

  return {
    id: config?.id ?? null,
    asaasAccountId: config?.asaasAccountId ?? null,
    asaasWalletId: config?.asaasWalletId ?? null,
    ambiente: config?.ambiente ?? "SANDBOX",
    integracaoAtiva: config?.integracaoAtiva ?? false,
    dataConfiguracao: config?.dataConfiguracao ?? null,
    ultimaValidacao: config?.ultimaValidacao ?? null,
    hasApiKey: Boolean(config?.asaasApiKey),
    hasWebhookAccessToken,
    webhookConfiguredAt: config?.webhookConfiguredAt ?? null,
    lastWebhookAt: config?.lastWebhookAt ?? null,
    lastWebhookEvent: config?.lastWebhookEvent ?? null,
    webhookUrl: options.webhookUrl,
    globalWebhookSecretConfigured: options.globalWebhookSecretConfigured,
    isWebhookProtected:
      hasWebhookAccessToken || options.globalWebhookSecretConfigured,
  };
}

export function buildAdminCertificatesSummary(params: {
  policy: DigitalCertificatePolicy;
  certificates: Array<{
    scope: "OFFICE" | "LAWYER";
    isActive: boolean;
    validUntil: Date | null;
    lastValidatedAt: Date | null;
    lastUsedAt: Date | null;
  }>;
}): AdminCertificatesSummary {
  const { policy, certificates } = params;
  const now = Date.now();
  const officeCertificates = certificates.filter((item) => item.scope === "OFFICE");
  const lawyerCertificates = certificates.filter((item) => item.scope === "LAWYER");

  const latestValidationAt = certificates.reduce<Date | null>((latest, item) => {
    if (!item.lastValidatedAt) {
      return latest;
    }

    if (!latest || item.lastValidatedAt > latest) {
      return item.lastValidatedAt;
    }

    return latest;
  }, null);

  const latestUseAt = certificates.reduce<Date | null>((latest, item) => {
    if (!item.lastUsedAt) {
      return latest;
    }

    if (!latest || item.lastUsedAt > latest) {
      return item.lastUsedAt;
    }

    return latest;
  }, null);

  return {
    policy,
    totalCertificates: certificates.length,
    activeCertificates: certificates.filter((item) => item.isActive).length,
    expiredCertificates: certificates.filter(
      (item) => Boolean(item.validUntil) && item.validUntil!.getTime() < now,
    ).length,
    officeCertificates: officeCertificates.length,
    lawyerCertificates: lawyerCertificates.length,
    hasActiveOfficeCertificate: officeCertificates.some((item) => item.isActive),
    latestValidationAt,
    latestUseAt,
  };
}

export function buildAdminTenantChannelProviderSummary(
  channel: TenantChannelProviderChannel,
  config: {
    id: string;
    provider: TenantChannelProviderType;
    displayName: string | null;
    credentialsEncrypted: string | null;
    configuration: unknown;
    active: boolean;
    healthStatus: TenantChannelProviderHealthStatus;
    dataConfiguracao: Date;
    lastValidatedAt: Date | null;
    lastValidationMode: TenantChannelValidationMode | null;
    lastErrorAt: Date | null;
    lastErrorMessage: string | null;
  } | null,
): AdminTenantChannelProviderSummary {
  if (!config) {
    return {
      id: null,
      channel,
      provider: null,
      providerLabel: null,
      providerDescription: null,
      displayName: null,
      active: false,
      healthStatus: "NOT_CONFIGURED",
      dataConfiguracao: null,
      lastValidatedAt: null,
      lastValidationMode: null,
      lastErrorAt: null,
      lastErrorMessage: null,
      hasCredentials: false,
      configSummary: [],
      healthHint: "Canal ainda não foi configurado pelo tenant.",
    };
  }

  const definition = getTenantChannelProviderDefinition(config.provider);
  const publicConfig = toStringRecord(config.configuration);

  return {
    id: config.id,
    channel,
    provider: config.provider,
    providerLabel: definition.label,
    providerDescription: definition.description,
    displayName: config.displayName,
    active: config.active,
    healthStatus: config.healthStatus,
    dataConfiguracao: config.dataConfiguracao,
    lastValidatedAt: config.lastValidatedAt,
    lastValidationMode: config.lastValidationMode,
    lastErrorAt: config.lastErrorAt,
    lastErrorMessage: config.lastErrorMessage,
    hasCredentials: Boolean(config.credentialsEncrypted),
    configSummary: definition.publicFields
      .filter((field) => Boolean(publicConfig[field.key]))
      .map((field) => ({
        key: field.key,
        label: field.label,
        value: publicConfig[field.key],
      })),
    healthHint: definition.healthHint,
  };
}
