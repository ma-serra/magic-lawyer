export const TENANT_CHANNEL_PROVIDER_CHANNELS = [
  "WHATSAPP",
  "TELEGRAM",
  "SMS",
] as const;

export type TenantChannelProviderChannel =
  (typeof TENANT_CHANNEL_PROVIDER_CHANNELS)[number];

export const TENANT_CHANNEL_PROVIDER_TYPES = [
  "INTERNAL_MOCK",
  "META_CLOUD_API",
  "EVOLUTION_API",
  "TWILIO_WHATSAPP",
  "TELEGRAM_BOT",
  "TWILIO_SMS",
] as const;

export type TenantChannelProviderType =
  (typeof TENANT_CHANNEL_PROVIDER_TYPES)[number];

export const TENANT_CHANNEL_PROVIDER_HEALTH_STATUSES = [
  "NOT_CONFIGURED",
  "INACTIVE",
  "PENDING",
  "HEALTHY",
  "ERROR",
] as const;

export type TenantChannelProviderHealthStatus =
  (typeof TENANT_CHANNEL_PROVIDER_HEALTH_STATUSES)[number];

export const TENANT_CHANNEL_VALIDATION_MODES = [
  "MOCK",
  "STRUCTURAL",
  "NETWORK",
] as const;

export type TenantChannelValidationMode =
  (typeof TENANT_CHANNEL_VALIDATION_MODES)[number];

export type ProviderFieldKind = "text" | "secret" | "url";

export type ProviderFieldDefinition = {
  key: string;
  label: string;
  placeholder?: string;
  description: string;
  kind: ProviderFieldKind;
  required: boolean;
};

export type ProviderDefinition = {
  provider: TenantChannelProviderType;
  label: string;
  description: string;
  channels: TenantChannelProviderChannel[];
  validationMode: TenantChannelValidationMode;
  publicFields: ProviderFieldDefinition[];
  secretFields: ProviderFieldDefinition[];
  healthHint: string;
};

export const TENANT_CHANNEL_INTEGRATION_KEY_BY_CHANNEL: Record<
  TenantChannelProviderChannel,
  "whatsapp" | "telegram" | "sms"
> = {
  WHATSAPP: "whatsapp",
  TELEGRAM: "telegram",
  SMS: "sms",
};

export const TENANT_CHANNEL_CHANNEL_BY_INTEGRATION_KEY: Record<
  "whatsapp" | "telegram" | "sms",
  TenantChannelProviderChannel
> = {
  whatsapp: "WHATSAPP",
  telegram: "TELEGRAM",
  sms: "SMS",
};

export const TENANT_CHANNEL_PROVIDER_DEFINITIONS: Record<
  TenantChannelProviderType,
  ProviderDefinition
> = {
  INTERNAL_MOCK: {
    provider: "INTERNAL_MOCK",
    label: "Mock local",
    description:
      "Modo local para preparar fluxo omnichannel sem depender de API externa.",
    channels: ["WHATSAPP", "TELEGRAM", "SMS"],
    validationMode: "MOCK",
    publicFields: [],
    secretFields: [],
    healthHint:
      "Ideal para preparar tenant, testes locais e homologação inicial do fluxo.",
  },
  META_CLOUD_API: {
    provider: "META_CLOUD_API",
    label: "Meta Cloud API",
    description:
      "Integração oficial do WhatsApp Business via Meta, com token e Phone Number ID.",
    channels: ["WHATSAPP"],
    validationMode: "STRUCTURAL",
    publicFields: [
      {
        key: "phoneNumberId",
        label: "Phone Number ID",
        placeholder: "123456789012345",
        description: "Identificador do número aprovado no WhatsApp Business.",
        kind: "text",
        required: true,
      },
      {
        key: "businessAccountId",
        label: "Business Account ID",
        placeholder: "987654321098765",
        description: "Identificador da conta Business Manager vinculada.",
        kind: "text",
        required: false,
      },
      {
        key: "apiVersion",
        label: "Versão da API",
        placeholder: "v23.0",
        description: "Versão usada nas chamadas da Graph API.",
        kind: "text",
        required: false,
      },
    ],
    secretFields: [
      {
        key: "accessToken",
        label: "Access token",
        placeholder: "EAAG...",
        description: "Token do app com permissão para o WhatsApp Business.",
        kind: "secret",
        required: true,
      },
    ],
    healthHint:
      "Validação estrutural pronta. Teste de rede real depende das credenciais finais.",
  },
  EVOLUTION_API: {
    provider: "EVOLUTION_API",
    label: "Evolution API",
    description:
      "Provider intermediário para WhatsApp com instância própria e webhook dedicado.",
    channels: ["WHATSAPP"],
    validationMode: "STRUCTURAL",
    publicFields: [
      {
        key: "baseUrl",
        label: "Base URL",
        placeholder: "https://evolution.exemplo.com",
        description: "URL base da instância Evolution do tenant ou parceiro.",
        kind: "url",
        required: true,
      },
      {
        key: "instanceName",
        label: "Instance name",
        placeholder: "magic-lawyer-tenant-a",
        description: "Nome da instância registrada no provider.",
        kind: "text",
        required: true,
      },
      {
        key: "webhookUrl",
        label: "Webhook URL",
        placeholder: "https://app.exemplo.com/api/webhooks/whatsapp",
        description: "Endpoint que receberá eventos de entrega e inbound.",
        kind: "url",
        required: false,
      },
    ],
    secretFields: [
      {
        key: "apiKey",
        label: "API key",
        placeholder: "evo_...",
        description: "Chave de acesso da instância Evolution.",
        kind: "secret",
        required: true,
      },
    ],
    healthHint:
      "Base pronta para WhatsApp por tenant com instância e webhook segregados.",
  },
  TWILIO_WHATSAPP: {
    provider: "TWILIO_WHATSAPP",
    label: "Twilio WhatsApp",
    description:
      "Canal WhatsApp via Twilio, útil quando a operação já usa mensageria Twilio.",
    channels: ["WHATSAPP"],
    validationMode: "STRUCTURAL",
    publicFields: [
      {
        key: "fromNumber",
        label: "Remetente WhatsApp",
        placeholder: "whatsapp:+14155238886",
        description: "Origem aprovada na Twilio para envio no WhatsApp.",
        kind: "text",
        required: true,
      },
      {
        key: "messagingServiceSid",
        label: "Messaging Service SID",
        placeholder: "MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        description: "Opcional quando a conta usa serviço centralizado de envio.",
        kind: "text",
        required: false,
      },
    ],
    secretFields: [
      {
        key: "accountSid",
        label: "Account SID",
        placeholder: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        description: "Identificador da conta Twilio.",
        kind: "secret",
        required: true,
      },
      {
        key: "authToken",
        label: "Auth token",
        placeholder: "********************************",
        description: "Token secreto da conta Twilio.",
        kind: "secret",
        required: true,
      },
    ],
    healthHint:
      "Estrutura pronta para Twilio sem depender ainda do teste online com conta real.",
  },
  TELEGRAM_BOT: {
    provider: "TELEGRAM_BOT",
    label: "Telegram Bot",
    description:
      "Bot do Telegram por tenant, com token dedicado e possibilidade de inbox bidirecional.",
    channels: ["TELEGRAM"],
    validationMode: "STRUCTURAL",
    publicFields: [
      {
        key: "botUsername",
        label: "Bot username",
        placeholder: "@magiclawyer_bot",
        description: "Username público do bot usado pelo escritório.",
        kind: "text",
        required: false,
      },
      {
        key: "webhookUrl",
        label: "Webhook URL",
        placeholder: "https://app.exemplo.com/api/webhooks/telegram",
        description: "Endpoint que receberá updates do bot.",
        kind: "url",
        required: false,
      },
    ],
    secretFields: [
      {
        key: "botToken",
        label: "Bot token",
        placeholder: "123456789:AA....",
        description: "Token emitido pelo BotFather para o bot do tenant.",
        kind: "secret",
        required: true,
      },
    ],
    healthHint:
      "Pronto para configurar o bot por tenant; teste real depende do token definitivo.",
  },
  TWILIO_SMS: {
    provider: "TWILIO_SMS",
    label: "Twilio SMS",
    description:
      "Canal SMS transacional via Twilio, posicionado como contingência operacional.",
    channels: ["SMS"],
    validationMode: "STRUCTURAL",
    publicFields: [
      {
        key: "fromNumber",
        label: "Número de origem",
        placeholder: "+15551234567",
        description: "Número ou short code habilitado para envio SMS.",
        kind: "text",
        required: true,
      },
      {
        key: "messagingServiceSid",
        label: "Messaging Service SID",
        placeholder: "MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        description: "Opcional quando a conta usa service pool de remetentes.",
        kind: "text",
        required: false,
      },
    ],
    secretFields: [
      {
        key: "accountSid",
        label: "Account SID",
        placeholder: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        description: "Identificador da conta Twilio SMS.",
        kind: "secret",
        required: true,
      },
      {
        key: "authToken",
        label: "Auth token",
        placeholder: "********************************",
        description: "Token secreto da conta Twilio.",
        kind: "secret",
        required: true,
      },
    ],
    healthHint:
      "Canal desenhado como fallback crítico, com rastreabilidade e política por tenant.",
  },
};

export function isTenantChannelProviderChannel(
  value: string | null | undefined,
): value is TenantChannelProviderChannel {
  return (
    typeof value === "string" &&
    (TENANT_CHANNEL_PROVIDER_CHANNELS as readonly string[]).includes(value)
  );
}

export function isTenantChannelProviderType(
  value: string | null | undefined,
): value is TenantChannelProviderType {
  return (
    typeof value === "string" &&
    (TENANT_CHANNEL_PROVIDER_TYPES as readonly string[]).includes(value)
  );
}

export function getTenantChannelProviderDefinition(
  provider: TenantChannelProviderType,
): ProviderDefinition {
  return TENANT_CHANNEL_PROVIDER_DEFINITIONS[provider];
}

export function getTenantChannelProviderOptionsForChannel(
  channel: TenantChannelProviderChannel,
): ProviderDefinition[] {
  return Object.values(TENANT_CHANNEL_PROVIDER_DEFINITIONS).filter((definition) =>
    definition.channels.includes(channel),
  );
}

export function isProviderCompatibleWithChannel(
  channel: TenantChannelProviderChannel,
  provider: TenantChannelProviderType,
): boolean {
  return getTenantChannelProviderDefinition(provider).channels.includes(channel);
}

export function buildMaskedSecretPreview(value: string | null | undefined) {
  if (!value) {
    return "Ausente";
  }

  if (value.length <= 6) {
    return "Presente";
  }

  return `${value.slice(0, 2)}...${value.slice(-2)}`;
}
