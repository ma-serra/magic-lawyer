import "server-only";

import {
  buildMaskedSecretPreview,
  getTenantChannelProviderDefinition,
  getTenantChannelProviderOptionsForChannel,
  isProviderCompatibleWithChannel,
  type ProviderDefinition,
  type TenantChannelProviderChannel,
  type TenantChannelProviderHealthStatus,
  type TenantChannelProviderType,
  type TenantChannelValidationMode,
} from "./omnichannel-config";
import { decrypt, encrypt } from "@/lib/crypto";

type UnknownRecord = Record<string, unknown>;

export type TenantChannelProviderRecord = {
  id: string;
  tenantId: string;
  channel: TenantChannelProviderChannel;
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
  createdAt: Date;
  updatedAt: Date;
};

export type TenantChannelProviderView = {
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
  publicConfig: Record<string, string>;
  summaryItems: Array<{ key: string; label: string; value: string }>;
  secretItems: Array<{
    key: string;
    label: string;
    present: boolean;
    preview: string;
  }>;
  healthHint: string;
};

export type TenantChannelProviderDraft = {
  channel: TenantChannelProviderChannel;
  provider: TenantChannelProviderType;
  publicConfig?: Record<string, unknown> | null;
  secretConfig?: Record<string, unknown> | null;
};

export type TenantChannelProviderTestResult = {
  success: boolean;
  mode: TenantChannelValidationMode;
  healthStatus: TenantChannelProviderHealthStatus;
  message: string;
  errors: string[];
  warnings: string[];
};

function toStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.entries(value as UnknownRecord).reduce<Record<string, string>>(
    (acc, [key, entry]) => {
      if (typeof entry === "string") {
        const trimmed = entry.trim();
        if (trimmed) {
          acc[key] = trimmed;
        }
      }

      return acc;
    },
    {},
  );
}

function parseEncryptedSecrets(encryptedValue: string | null | undefined) {
  if (!encryptedValue) {
    return {};
  }

  try {
    return toStringRecord(JSON.parse(decrypt(encryptedValue)));
  } catch {
    return {};
  }
}

function serializeSecrets(secretConfig: Record<string, string>) {
  if (Object.keys(secretConfig).length === 0) {
    return null;
  }

  return encrypt(JSON.stringify(secretConfig));
}

function buildSummaryItems(
  definition: ProviderDefinition,
  publicConfig: Record<string, string>,
) {
  return definition.publicFields
    .filter((field) => Boolean(publicConfig[field.key]))
    .map((field) => ({
      key: field.key,
      label: field.label,
      value: publicConfig[field.key],
    }));
}

function buildSecretItems(
  definition: ProviderDefinition,
  secretConfig: Record<string, string>,
) {
  return definition.secretFields.map((field) => {
    const value = secretConfig[field.key];

    return {
      key: field.key,
      label: field.label,
      present: Boolean(value),
      preview: buildMaskedSecretPreview(value),
    };
  });
}

function validateFieldFormat(
  fieldKey: string,
  value: string,
  fieldKind: "text" | "secret" | "url",
) {
  if (!value) {
    return null;
  }

  if (fieldKind === "url") {
    try {
      const parsed = new URL(value);

      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return "deve usar http ou https";
      }

      return null;
    } catch {
      return "deve ser uma URL válida";
    }
  }

  if (fieldKey === "botToken" && !value.includes(":")) {
    return "deve seguir o formato emitido pelo BotFather";
  }

  if (fieldKey === "accountSid" && !/^AC[a-zA-Z0-9]{16,}$/.test(value)) {
    return "deve parecer um Account SID válido da Twilio";
  }

  if (fieldKey === "fromNumber" && !/^[a-z:+0-9_-]{6,}$/i.test(value)) {
    return "deve informar um remetente válido";
  }

  if (fieldKey === "phoneNumberId" && !/^[0-9]{6,}$/.test(value)) {
    return "deve conter apenas números";
  }

  if (fieldKey === "apiVersion" && !/^v[0-9]+(\.[0-9]+)?$/i.test(value)) {
    return "deve usar o formato vNN ou vNN.N";
  }

  if (
    (fieldKey === "accessToken" || fieldKey === "authToken" || fieldKey === "apiKey") &&
    value.length < 8
  ) {
    return "parece curto demais para uma credencial válida";
  }

  return null;
}

function collectValidationErrors(
  definition: ProviderDefinition,
  publicConfig: Record<string, string>,
  secretConfig: Record<string, string>,
) {
  const errors: string[] = [];

  definition.publicFields.forEach((field) => {
    const value = publicConfig[field.key] ?? "";

    if (field.required && !value) {
      errors.push(`${field.label} é obrigatório.`);
      return;
    }

    const formatError = validateFieldFormat(field.key, value, field.kind);
    if (formatError) {
      errors.push(`${field.label} ${formatError}.`);
    }
  });

  definition.secretFields.forEach((field) => {
    const value = secretConfig[field.key] ?? "";

    if (field.required && !value) {
      errors.push(`${field.label} é obrigatório.`);
      return;
    }

    const formatError = validateFieldFormat(field.key, value, field.kind);
    if (formatError) {
      errors.push(`${field.label} ${formatError}.`);
    }
  });

  return errors;
}

export function buildTenantChannelProviderView(
  channel: TenantChannelProviderChannel,
  record: TenantChannelProviderRecord | null,
): TenantChannelProviderView {
  if (!record) {
    const providerOptions = getTenantChannelProviderOptionsForChannel(channel);

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
      publicConfig: {},
      summaryItems: [],
      secretItems: [],
      healthHint:
        providerOptions[0]?.healthHint ??
        "Canal ainda sem credencial configurada para este tenant.",
    };
  }

  const definition = getTenantChannelProviderDefinition(record.provider);
  const publicConfig = toStringRecord(record.configuration);
  const secretConfig = parseEncryptedSecrets(record.credentialsEncrypted);

  return {
    id: record.id,
    channel,
    provider: record.provider,
    providerLabel: definition.label,
    providerDescription: definition.description,
    displayName: record.displayName,
    active: record.active,
    healthStatus: record.healthStatus,
    dataConfiguracao: record.dataConfiguracao,
    lastValidatedAt: record.lastValidatedAt,
    lastValidationMode: record.lastValidationMode,
    lastErrorAt: record.lastErrorAt,
    lastErrorMessage: record.lastErrorMessage,
    hasCredentials: Object.keys(secretConfig).length > 0,
    publicConfig,
    summaryItems: buildSummaryItems(definition, publicConfig),
    secretItems: buildSecretItems(definition, secretConfig),
    healthHint: definition.healthHint,
  };
}

export function mergeTenantChannelProviderConfigs(params: {
  provider: TenantChannelProviderType;
  currentProvider?: TenantChannelProviderType | null;
  existingPublicConfig?: unknown;
  existingSecretConfig?: string | null;
  nextPublicConfig?: Record<string, unknown> | null;
  nextSecretConfig?: Record<string, unknown> | null;
}) {
  const definition = getTenantChannelProviderDefinition(params.provider);
  const providerChanged =
    Boolean(params.currentProvider) && params.currentProvider !== params.provider;
  const existingPublic = providerChanged
    ? {}
    : toStringRecord(params.existingPublicConfig);
  const existingSecrets = providerChanged
    ? {}
    : parseEncryptedSecrets(params.existingSecretConfig);
  const nextPublicInput = toStringRecord(params.nextPublicConfig);
  const nextSecretInput = toStringRecord(params.nextSecretConfig);

  const publicConfig = definition.publicFields.reduce<Record<string, string>>(
    (acc, field) => {
      const nextValue = nextPublicInput[field.key];
      const resolvedValue =
        nextValue !== undefined ? nextValue : existingPublic[field.key];

      if (resolvedValue) {
        acc[field.key] = resolvedValue;
      }

      return acc;
    },
    {},
  );

  const secretConfig = definition.secretFields.reduce<Record<string, string>>(
    (acc, field) => {
      const nextValue = nextSecretInput[field.key];
      const resolvedValue =
        nextValue !== undefined ? nextValue : existingSecrets[field.key];

      if (resolvedValue) {
        acc[field.key] = resolvedValue;
      }

      return acc;
    },
    {},
  );

  return {
    definition,
    publicConfig,
    secretConfig,
    credentialsEncrypted: serializeSecrets(secretConfig),
  };
}

export function testTenantChannelProviderDraft(
  draft: TenantChannelProviderDraft,
): TenantChannelProviderTestResult {
  if (!isProviderCompatibleWithChannel(draft.channel, draft.provider)) {
    return {
      success: false,
      mode: "STRUCTURAL",
      healthStatus: "ERROR",
      message: "Provider incompatível com o canal selecionado.",
      errors: ["Provider incompatível com o canal selecionado."],
      warnings: [],
    };
  }

  const definition = getTenantChannelProviderDefinition(draft.provider);
  const publicConfig = toStringRecord(draft.publicConfig);
  const secretConfig = toStringRecord(draft.secretConfig);
  const errors = collectValidationErrors(definition, publicConfig, secretConfig);

  if (errors.length > 0) {
    return {
      success: false,
      mode: definition.validationMode,
      healthStatus: "ERROR",
      message: "Configuração inválida para o provider selecionado.",
      errors,
      warnings: [],
    };
  }

  const mode = definition.validationMode;
  const warnings =
    mode === "STRUCTURAL"
      ? [
          "Validação estrutural concluída. O teste online será concluído quando a credencial final estiver em uso.",
        ]
      : [];

  return {
    success: true,
    mode,
    healthStatus: mode === "MOCK" || mode === "NETWORK" ? "HEALTHY" : "PENDING",
    message:
      mode === "MOCK"
        ? "Provider mock validado com sucesso."
        : "Configuração estrutural validada com sucesso.",
    errors: [],
    warnings,
  };
}

export function testStoredTenantChannelProviderRecord(
  record: TenantChannelProviderRecord,
): TenantChannelProviderTestResult {
  const secretConfig = parseEncryptedSecrets(record.credentialsEncrypted);

  return testTenantChannelProviderDraft({
    channel: record.channel,
    provider: record.provider,
    publicConfig: toStringRecord(record.configuration),
    secretConfig,
  });
}

export function buildTenantChannelProviderAuditPayload(params: {
  channel: TenantChannelProviderChannel;
  provider: TenantChannelProviderType;
  active: boolean;
  publicConfig: Record<string, string>;
  secretConfig: Record<string, string>;
  healthStatus: TenantChannelProviderHealthStatus;
  validationMode: TenantChannelValidationMode | null;
}) {
  const definition = getTenantChannelProviderDefinition(params.provider);

  return {
    channel: params.channel,
    provider: params.provider,
    providerLabel: definition.label,
    active: params.active,
    healthStatus: params.healthStatus,
    validationMode: params.validationMode,
    publicConfig: params.publicConfig,
    secrets: buildSecretItems(definition, params.secretConfig).map((item) => ({
      key: item.key,
      label: item.label,
      present: item.present,
    })),
  };
}
