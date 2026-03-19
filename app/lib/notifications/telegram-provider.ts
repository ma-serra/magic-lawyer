export type TelegramProviderSource = "TENANT" | "GLOBAL";

export type TelegramProviderContext = {
  providerId: string | null;
  botToken: string;
  botUsername: string | null;
  source: TelegramProviderSource;
  displayName: string;
};

export type TelegramProviderFallbackSummary = {
  available: boolean;
  source: "GLOBAL";
  provider: "TELEGRAM_BOT";
  providerLabel: string;
  botUsername: string | null;
  displayName: string;
  healthHint: string;
};

export function normalizeTelegramUsername(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim().replace(/^@+/, "");
  return trimmed ? `@${trimmed}` : null;
}

export function getGlobalTelegramProviderContext():
  | TelegramProviderContext
  | null {
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();

  if (!botToken) {
    return null;
  }

  return {
    providerId: null,
    botToken,
    botUsername: normalizeTelegramUsername(process.env.TELEGRAM_BOT_USERNAME),
    source: "GLOBAL",
    displayName: process.env.TELEGRAM_BOT_DISPLAY_NAME?.trim() || "Magic Radar",
  };
}

export function getGlobalTelegramProviderSummary(): TelegramProviderFallbackSummary {
  const provider = getGlobalTelegramProviderContext();

  return {
    available: Boolean(provider),
    source: "GLOBAL",
    provider: "TELEGRAM_BOT",
    providerLabel: "Telegram Bot",
    botUsername: provider?.botUsername ?? null,
    displayName: provider?.displayName ?? "Magic Radar",
    healthHint: provider
      ? "Bot global da plataforma pronto para operação multi-tenant. Use override por escritório apenas em casos enterprise."
      : "Bot global da plataforma ainda não configurado no ambiente.",
  };
}
