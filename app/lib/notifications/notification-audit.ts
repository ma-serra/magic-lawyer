import type { NotificationChannel } from "./types";

export const AUDITABLE_NOTIFICATION_CHANNELS: NotificationChannel[] = [
  "REALTIME",
  "EMAIL",
  "TELEGRAM",
  "PUSH",
];

export const NOTIFICATION_AUDIT_REASON_LABELS: Record<string, string> = {
  NO_PERMISSION: "Sem permissao para receber o evento",
  EVENT_DISABLED_BY_PREFERENCE: "Evento desabilitado por preferencia",
  NO_CHANNELS_RESOLVED: "Nenhum canal resolvido para entrega",
  NOT_REQUESTED: "Canal nao solicitado para este evento",
  DISABLED_BY_PREFERENCE: "Canal desabilitado por preferencia",
  RECIPIENT_MISSING: "Destinatario ausente",
  INVALID_RECIPIENT: "Destinatario invalido",
  NO_ACTIVE_BINDING: "Canal sem vinculo ativo",
  PROVIDER_INACTIVE: "Provider inativo ou nao configurado",
  CHANNEL_UNSUPPORTED: "Canal nao suportado",
  PROCESSING_FAILED: "Falha interna durante o processamento",
};

export const NOTIFICATION_CHANNEL_LABELS: Record<NotificationChannel, string> = {
  REALTIME: "Tempo real",
  EMAIL: "Email",
  TELEGRAM: "Telegram",
  PUSH: "Push",
};

const DELIVERY_COST_ESTIMATES: Partial<
  Record<NotificationChannel, Partial<Record<string, { amount: number; currency: string }>>>
> = {
  REALTIME: {
    ABLY: { amount: 0.00005, currency: "USD" },
  },
  EMAIL: {
    RESEND: { amount: 0.001, currency: "USD" },
  },
  TELEGRAM: {
    TELEGRAM_BOT: { amount: 0, currency: "USD" },
  },
  PUSH: {
    WEB_PUSH_VAPID: { amount: 0, currency: "USD" },
  },
};

function summarizeString(value: string) {
  const normalized = value.trim();

  if (normalized.length <= 240) {
    return normalized;
  }

  return `${normalized.slice(0, 237)}...`;
}

function summarizeUnknown(value: unknown, depth = 0): unknown {
  if (
    value === null ||
    value === undefined ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "string") {
    return summarizeString(value);
  }

  if (depth >= 2) {
    return "[truncated]";
  }

  if (Array.isArray(value)) {
    return value.slice(0, 5).map((item) => summarizeUnknown(item, depth + 1));
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).slice(0, 12);

    return Object.fromEntries(
      entries.map(([key, itemValue]) => [key, summarizeUnknown(itemValue, depth + 1)]),
    );
  }

  return String(value);
}

export function summarizeNotificationPayload(payload: Record<string, unknown> | null | undefined) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  return summarizeUnknown(payload);
}

export function getNotificationAuditReasonLabel(reasonCode?: string | null) {
  if (!reasonCode) {
    return "Sem motivo registrado";
  }

  return NOTIFICATION_AUDIT_REASON_LABELS[reasonCode] || reasonCode;
}

export function estimateNotificationDeliveryCost(
  channel: NotificationChannel,
  provider: string,
) {
  const estimate = DELIVERY_COST_ESTIMATES[channel]?.[provider];

  if (!estimate) {
    return null;
  }

  return {
    amount: estimate.amount,
    currency: estimate.currency,
    source: "ESTIMATED" as const,
  };
}

export function sortNotificationChannels(channels: NotificationChannel[]) {
  const order = new Map(
    AUDITABLE_NOTIFICATION_CHANNELS.map((channel, index) => [channel, index]),
  );

  return [...new Set(channels)].sort(
    (left, right) => (order.get(left) ?? 999) - (order.get(right) ?? 999),
  );
}
