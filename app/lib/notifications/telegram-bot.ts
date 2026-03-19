import crypto from "crypto";

import prisma from "@/app/lib/prisma";
import { getRedisInstance } from "@/app/lib/notifications/redis-singleton";
import {
  getGlobalTelegramProviderContext,
  normalizeTelegramUsername,
  type TelegramProviderContext,
} from "@/app/lib/notifications/telegram-provider";
import { decrypt } from "@/lib/crypto";

const TELEGRAM_CONNECT_TTL_SECONDS = 15 * 60;
const TELEGRAM_MAX_UPDATES = 100;

type TelegramConnectionPayload = {
  code: string;
  createdAt: string;
};

type TelegramUserBinding = {
  chatId: string | null;
  username: string | null;
  alertsEnabled: boolean;
};

type TelegramSendMessageResult = {
  success: boolean;
  messageId?: string;
  error?: string;
  metadata?: Record<string, unknown>;
};

type TelegramUpdate = {
  update_id: number;
  message?: {
    date?: number;
    text?: string;
    chat?: {
      id?: number | string;
      type?: string;
    };
    from?: {
      username?: string;
      first_name?: string;
      last_name?: string;
    };
  };
};

function getTelegramConnectKey(tenantId: string, userId: string) {
  return `notif:telegram:connect:${tenantId}:${userId}`;
}

function safeParseRecord(value: string | null | undefined) {
  if (!value) {
    return {} as Record<string, string>;
  }

  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {} as Record<string, string>;
    }

    return Object.entries(parsed as Record<string, unknown>).reduce<
      Record<string, string>
    >((acc, [key, entry]) => {
      if (typeof entry === "string" && entry.trim()) {
        acc[key] = entry.trim();
      }
      return acc;
    }, {});
  } catch {
    return {} as Record<string, string>;
  }
}

function readProviderSecrets(value: string | null) {
  if (!value) {
    return {} as Record<string, string>;
  }

  try {
    return safeParseRecord(decrypt(value));
  } catch {
    return {} as Record<string, string>;
  }
}

function toStartPayload(code: string) {
  return `ml_notify_${code}`;
}

function escapeTelegramHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatTelegramValue(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (value instanceof Date) {
    return value.toLocaleString("pt-BR");
  }

  if (typeof value === "string") {
    const asDate = new Date(value);

    if (!Number.isNaN(asDate.getTime()) && value.includes("T")) {
      return asDate.toLocaleString("pt-BR");
    }

    return value.trim() || null;
  }

  return String(value);
}

function getUrgencyBadge(urgency?: string) {
  switch (urgency) {
    case "CRITICAL":
      return { icon: "🔴", label: "Crítico" };
    case "HIGH":
      return { icon: "🟡", label: "Alta atenção" };
    case "MEDIUM":
      return { icon: "🟢", label: "Acompanhamento" };
    default:
      return { icon: "⚪️", label: "Informativo" };
  }
}

function getTelegramEventLabel(type: string) {
  const labels: Record<string, string> = {
    "processo.updated": "Processo atualizado",
    "processo.status_changed": "Status do processo alterado",
    "andamento.created": "Nova movimentação no processo",
    "andamento.updated": "Movimentação atualizada",
    "prazo.created": "Novo prazo registrado",
    "prazo.updated": "Prazo atualizado",
    "prazo.digest_30d": "Radar de prazo em 30 dias",
    "prazo.digest_10d": "Radar de prazo em 10 dias",
    "prazo.expiring_7d": "Prazo em 7 dias",
    "prazo.expiring_3d": "Prazo em 3 dias",
    "prazo.expiring_1d": "Prazo em 1 dia",
    "prazo.expiring_2h": "Prazo no limite",
    "prazo.expired": "Prazo vencido",
  };

  return labels[type] || type.replace(/\./g, " • ").replace(/_/g, " ");
}

function buildTelegramDetailLines(
  payload?: Record<string, unknown> | null,
): string[] {
  if (!payload) {
    return [];
  }

  const detailLines = Array.isArray(payload.detailLines)
    ? payload.detailLines
        .map((line) => formatTelegramValue(line))
        .filter((line): line is string => Boolean(line))
    : [];

  if (detailLines.length > 0) {
    return detailLines;
  }

  if (Array.isArray(payload.diff)) {
    const diffLines = payload.diff
      .map((item) => {
        if (!item || typeof item !== "object") {
          return null;
        }

        const maybeItem = item as Record<string, unknown>;
        const label = formatTelegramValue(maybeItem.label || maybeItem.field);
        const before = formatTelegramValue(maybeItem.before);
        const after = formatTelegramValue(maybeItem.after);

        if (!label || (!before && !after)) {
          return null;
        }

        return `${label}: ${before || "—"} → ${after || "—"}`;
      })
      .filter((line): line is string => Boolean(line));

    if (diffLines.length > 0) {
      return diffLines;
    }
  }

  return [];
}

function buildTelegramMessage(params: {
  title: string;
  message: string;
  type: string;
  urgency?: string;
  payload?: Record<string, unknown> | null;
}) {
  const payload = params.payload ?? {};
  const badge = getUrgencyBadge(params.urgency);
  const rows: string[] = [];

  const addRow = (label: string, value: unknown) => {
    const formatted = formatTelegramValue(value);

    if (!formatted) {
      return;
    }

    rows.push(`<b>${escapeTelegramHtml(label)}:</b> ${escapeTelegramHtml(formatted)}`);
  };

  addRow("Evento", getTelegramEventLabel(params.type));
  addRow("Processo", payload.processoNumero || payload.numero);
  addRow("Cliente", payload.clienteNome);
  addRow("Título", payload.titulo || payload.processoTitulo);
  addRow("Origem", payload.sourceLabel);
  addRow("Modificado por", payload.actorName);
  addRow(
    "Data da movimentação",
    payload.dataMovimentacao || payload.dataVencimento,
  );
  addRow("Status", payload.statusSummary || payload.statusLabel || payload.status);
  addRow("Resumo", payload.changesSummary || payload.additionalChangesSummary);

  const detailLines = buildTelegramDetailLines(payload).slice(0, 8);
  const detailBlock =
    detailLines.length > 0
      ? [
          "",
          "<b>Detalhes do processo</b>",
          ...detailLines.map((line) => `• ${escapeTelegramHtml(line)}`),
        ].join("\n")
      : "";

  return [
    `${badge.icon} <b>${escapeTelegramHtml(params.title.trim())}</b>`,
    `<i>${escapeTelegramHtml(badge.label)}</i>`,
    "",
    escapeTelegramHtml(params.message.trim()),
    ...(rows.length > 0 ? ["", ...rows] : []),
    detailBlock,
    "",
    "<i>Magic Lawyer</i>",
  ]
    .filter(Boolean)
    .join("\n");
}

async function callTelegramApi<T>(
  botToken: string,
  method: string,
  body?: URLSearchParams,
): Promise<T> {
  const response = await fetch(
    `https://api.telegram.org/bot${botToken}/${method}`,
    {
      method: body ? "POST" : "GET",
      headers: body
        ? {
            "Content-Type": "application/x-www-form-urlencoded",
          }
        : undefined,
      body,
      cache: "no-store",
    },
  );

  const payload = (await response.json().catch(() => null)) as
    | { ok?: boolean; result?: T; description?: string }
    | null;

  if (!response.ok || !payload?.ok) {
    throw new Error(
      payload?.description ||
        `Telegram API ${method} falhou com status ${response.status}`,
    );
  }

  return payload.result as T;
}

async function getTenantTelegramProvider(
  tenantId: string,
): Promise<TelegramProviderContext | null> {
  const provider = await prisma.tenantChannelProvider.findFirst({
    where: {
      tenantId,
      channel: "TELEGRAM",
      provider: "TELEGRAM_BOT",
      active: true,
    },
    select: {
      id: true,
      displayName: true,
      configuration: true,
      credentialsEncrypted: true,
    },
  });

  if (!provider) {
    return null;
  }

  const config = safeParseRecord(
    provider.configuration ? JSON.stringify(provider.configuration) : null,
  );
  const secrets = readProviderSecrets(provider.credentialsEncrypted);
  const botToken = secrets.botToken?.trim();

  if (!botToken) {
    return null;
  }

  return {
    providerId: provider.id,
    botToken,
    botUsername: normalizeTelegramUsername(config.botUsername),
    source: "TENANT",
    displayName:
      provider.displayName?.trim() || config.botUsername?.trim() || "Telegram do escritório",
  };
}

export async function getActiveTelegramProvider(
  tenantId: string,
): Promise<TelegramProviderContext | null> {
  const tenantProvider = await getTenantTelegramProvider(tenantId);

  if (tenantProvider) {
    return tenantProvider;
  }

  return getGlobalTelegramProviderContext();
}

export async function getTelegramUserBinding(
  tenantId: string,
  userId: string,
): Promise<TelegramUserBinding> {
  const user = await prisma.usuario.findFirst({
    where: {
      id: userId,
      tenantId,
    },
    select: {
      telegramChatId: true,
      telegramUsername: true,
      telegramAlertsEnabled: true,
    },
  });

  return {
    chatId: user?.telegramChatId ?? null,
    username: user?.telegramUsername ?? null,
    alertsEnabled: user?.telegramAlertsEnabled ?? true,
  };
}

export async function getTelegramConnectionStatus(
  tenantId: string,
  userId: string,
) {
  const [provider, binding] = await Promise.all([
    getActiveTelegramProvider(tenantId),
    getTelegramUserBinding(tenantId, userId),
  ]);

  return {
    providerReady: Boolean(provider),
    botUsername: provider?.botUsername ?? null,
    providerSource: provider?.source ?? null,
    providerDisplayName: provider?.displayName ?? null,
    connected: Boolean(binding.chatId),
    chatIdMasked: binding.chatId
      ? `${binding.chatId.slice(0, 3)}••••${binding.chatId.slice(-3)}`
      : null,
    username: binding.username,
    alertsEnabled: binding.alertsEnabled,
  };
}

export async function createTelegramConnectionCode(
  tenantId: string,
  userId: string,
) {
  const provider = await getActiveTelegramProvider(tenantId);

  if (!provider) {
    return {
      success: false as const,
      error:
        "O escritório ainda não configurou um bot ativo do Telegram para notificações.",
    };
  }

  const code = crypto.randomBytes(4).toString("hex").toUpperCase();
  const redis = getRedisInstance();
  const payload: TelegramConnectionPayload = {
    code,
    createdAt: new Date().toISOString(),
  };

  await redis.set(
    getTelegramConnectKey(tenantId, userId),
    JSON.stringify(payload),
    "EX",
    TELEGRAM_CONNECT_TTL_SECONDS,
  );

  return {
    success: true as const,
    code,
    botUsername: provider.botUsername,
    providerSource: provider.source,
    providerDisplayName: provider.displayName,
    deepLink: provider.botUsername
      ? `https://t.me/${provider.botUsername.replace(/^@/, "")}?start=${toStartPayload(code)}`
      : null,
    expiresInSeconds: TELEGRAM_CONNECT_TTL_SECONDS,
  };
}

export async function confirmTelegramConnection(
  tenantId: string,
  userId: string,
) {
  const redis = getRedisInstance();
  const storedPayload = await redis.get(getTelegramConnectKey(tenantId, userId));

  if (!storedPayload) {
    return {
      success: false as const,
      error:
        "Código de conexão expirado. Gere um novo código e envie /start novamente ao bot.",
    };
  }

  const provider = await getActiveTelegramProvider(tenantId);

  if (!provider) {
    return {
      success: false as const,
      error:
        "O bot do Telegram não está configurado ou ativo para este escritório.",
    };
  }

  const pending = JSON.parse(storedPayload) as TelegramConnectionPayload;
  const expectedPayload = toStartPayload(pending.code);
  const updates = await callTelegramApi<TelegramUpdate[]>(
    provider.botToken,
    "getUpdates",
  );

  const matchedUpdate = updates
    .slice(-TELEGRAM_MAX_UPDATES)
    .reverse()
    .find((update) => {
      const text = update.message?.text?.trim() ?? "";
      return (
        text === `/start ${expectedPayload}` ||
        text === expectedPayload ||
        text.endsWith(expectedPayload)
      );
    });

  const chatId = matchedUpdate?.message?.chat?.id;

  if (!matchedUpdate || chatId === undefined || chatId === null) {
    return {
      success: false as const,
      error:
        "Não encontrei sua mensagem recente no bot. Abra o link, envie /start e tente confirmar novamente.",
    };
  }

  const username = matchedUpdate.message?.from?.username
    ? `@${matchedUpdate.message.from.username.replace(/^@+/, "")}`
    : null;

  await prisma.usuario.update({
    where: { id: userId },
    data: {
      telegramChatId: String(chatId),
      telegramUsername: username,
      telegramAlertsEnabled: true,
      updatedAt: new Date(),
    },
  });

  await redis.del(getTelegramConnectKey(tenantId, userId));

  return {
    success: true as const,
    username,
    chatId: String(chatId),
  };
}

export async function disconnectTelegramConnection(
  tenantId: string,
  userId: string,
) {
  await prisma.usuario.updateMany({
    where: {
      id: userId,
      tenantId,
    },
    data: {
      telegramChatId: null,
      telegramUsername: null,
      telegramAlertsEnabled: false,
      updatedAt: new Date(),
    },
  });

  const redis = getRedisInstance();
  await redis.del(getTelegramConnectKey(tenantId, userId));

  return { success: true as const };
}

export async function sendTelegramNotification(params: {
  tenantId: string;
  userId: string;
  title: string;
  message: string;
  type: string;
  urgency?: "CRITICAL" | "HIGH" | "MEDIUM" | "INFO";
  payload?: Record<string, unknown> | null;
}) : Promise<TelegramSendMessageResult> {
  const [provider, binding] = await Promise.all([
    getActiveTelegramProvider(params.tenantId),
    getTelegramUserBinding(params.tenantId, params.userId),
  ]);

  if (!provider) {
    return {
      success: false,
      error: "Bot do Telegram não configurado para o escritório.",
    };
  }

  if (!binding.chatId || !binding.alertsEnabled) {
    return {
      success: false,
      error: "Usuário sem vínculo ativo do Telegram para alertas.",
    };
  }

  const body = new URLSearchParams({
    chat_id: binding.chatId,
    text: buildTelegramMessage({
      title: params.title,
      message: params.message,
      type: params.type,
      urgency: params.urgency,
      payload: params.payload,
    }),
    parse_mode: "HTML",
    disable_web_page_preview: "true",
  });

  try {
    const result = await callTelegramApi<{
      message_id?: number;
      chat?: { id?: number | string };
      date?: number;
    }>(provider.botToken, "sendMessage", body);

    return {
      success: true,
      messageId: result.message_id ? String(result.message_id) : undefined,
      metadata: {
        chatId: binding.chatId,
        telegramUsername: binding.username,
      },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Falha desconhecida no Telegram.",
      metadata: {
        chatId: binding.chatId,
        telegramUsername: binding.username,
      },
    };
  }
}

export async function canDeliverTelegramToUser(
  tenantId: string,
  userId: string,
) {
  const [provider, binding] = await Promise.all([
    getActiveTelegramProvider(tenantId),
    getTelegramUserBinding(tenantId, userId),
  ]);

  return Boolean(provider && binding.chatId && binding.alertsEnabled);
}
