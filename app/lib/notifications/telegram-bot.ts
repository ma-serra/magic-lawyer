import crypto from "crypto";

import prisma from "@/app/lib/prisma";
import {
  resolveNotificationActionText,
  resolveNotificationUrl,
  resolveTenantBaseUrl,
} from "@/app/lib/notifications/notification-links";
import { getRedisInstance } from "@/app/lib/notifications/redis-singleton";
import {
  getGlobalTelegramProviderContext,
  normalizeTelegramUsername,
  type TelegramProviderContext,
} from "@/app/lib/notifications/telegram-provider";
import { decrypt } from "@/lib/crypto";

const TELEGRAM_CONNECT_TTL_SECONDS = 15 * 60;
const TELEGRAM_MAX_UPDATES = 100;
const TELEGRAM_UPDATE_DEDUP_TTL_SECONDS = 24 * 60 * 60;

type TelegramConnectionPayload = {
  code: string;
  createdAt: string;
};

type TelegramConnectionCodePayload = {
  tenantId: string;
  userId: string;
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

type TelegramRenderedNotification = {
  text: string;
  actionUrl?: string | null;
  actionText?: string | null;
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

function getTelegramConnectCodeKey(code: string) {
  return `notif:telegram:connect-code:${code.toUpperCase()}`;
}

function getTelegramUpdateDedupKey(updateId: number) {
  return `notif:telegram:update:${updateId}`;
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

function parseStartCommandPayload(text?: string | null) {
  const normalized = text?.trim() ?? "";
  if (!normalized) return null;

  const startMatch = normalized.match(/^\/start(?:@\w+)?(?:\s+(.+))?$/i);
  if (startMatch) {
    return startMatch[1]?.trim() ?? "";
  }

  if (normalized.startsWith("ml_notify_")) {
    return normalized;
  }

  return null;
}

function extractConnectCode(startPayload?: string | null) {
  const normalized = (startPayload ?? "").trim();
  if (!normalized) return null;
  if (!normalized.toLowerCase().startsWith("ml_notify_")) {
    return null;
  }

  const rawCode = normalized.slice("ml_notify_".length).trim();
  if (!rawCode) return null;

  return rawCode.toUpperCase();
}

function resolveTelegramWebhookBaseUrl() {
  const candidates = [
    process.env.NEXT_PUBLIC_APP_URL?.trim(),
    process.env.NEXTAUTH_URL?.trim(),
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim(),
    process.env.VERCEL_URL?.trim(),
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => {
      if (value.startsWith("http://") || value.startsWith("https://")) {
        return value;
      }
      return `https://${value}`;
    });

  for (const candidate of candidates) {
    if (candidate.startsWith("https://")) {
      return candidate.replace(/\/$/, "");
    }
  }

  return null;
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
      return { icon: "[CRITICO]", label: "Critico" };
    case "HIGH":
      return { icon: "[ALTA]", label: "Alta atencao" };
    case "MEDIUM":
      return { icon: "[MEDIA]", label: "Acompanhamento" };
    default:
      return { icon: "[INFO]", label: "Informativo" };
  }
}

function getTelegramEventLabel(type: string) {
  const labels: Record<string, string> = {
    "processo.updated": "Processo atualizado",
    "processo.status_changed": "Status do processo alterado",
    "andamento.created": "Nova movimentacao no processo",
    "andamento.updated": "Movimentacao atualizada",
    "evento.created": "Novo evento agendado",
    "evento.updated": "Evento atualizado",
    "evento.cancelled": "Evento cancelado",
    "evento.confirmation_updated": "Confirmacao do evento atualizada",
    "evento.reminder_1h": "Lembrete de evento",
    "evento.reminder_1d": "Lembrete de evento",
    "evento.reminder_custom": "Lembrete de evento",
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

  return labels[type] || type.replace(/\./g, " - ").replace(/_/g, " ");
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

        return `${label}: ${before || "-"} -> ${after || "-"}`;
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
  actionUrl?: string | null;
  actionText?: string | null;
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
  addRow("Titulo", payload.titulo || payload.processoTitulo);
  addRow("Origem", payload.sourceLabel);
  addRow("Modificado por", payload.actorName);
  addRow(
    payload.dataMovimentacao ? "Data da movimentacao" : "Data do vencimento",
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
          ...detailLines.map((line) => `- ${escapeTelegramHtml(line)}`),
        ].join("\n")
      : "";
  const actionBlock =
    params.actionUrl && params.actionText
      ? [
          "",
          `<a href="${escapeTelegramHtml(params.actionUrl)}">${escapeTelegramHtml(params.actionText)}</a>`,
        ].join("\n")
      : "";

  return [
    `${badge.icon} <b>${escapeTelegramHtml(params.title.trim())}</b>`,
    `<i>${escapeTelegramHtml(badge.label)}</i>`,
    "",
    escapeTelegramHtml(params.message.trim()),
    ...(rows.length > 0 ? ["", ...rows] : []),
    detailBlock,
    actionBlock,
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

async function ensureGlobalTelegramWebhookConfigured() {
  const provider = getGlobalTelegramProviderContext();

  if (!provider?.botToken) {
    return;
  }

  const baseUrl = resolveTelegramWebhookBaseUrl();
  if (!baseUrl) {
    return;
  }

  const webhookUrl = `${baseUrl}/api/webhooks/telegram`;
  const body = new URLSearchParams({
    url: webhookUrl,
    allowed_updates: JSON.stringify(["message"]),
    drop_pending_updates: "false",
  });
  const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();

  if (secretToken) {
    body.set("secret_token", secretToken);
  }

  try {
    await callTelegramApi(provider.botToken, "setWebhook", body);
  } catch {
    // Falha de webhook não deve bloquear fluxo de conexão manual.
  }
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

async function bindTelegramChatToUser(params: {
  tenantId: string;
  userId: string;
  chatId: string;
  username: string | null;
}) {
  const user = await prisma.usuario.findFirst({
    where: {
      id: params.userId,
      tenantId: params.tenantId,
      active: true,
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      tenant: {
        select: {
          id: true,
          slug: true,
          name: true,
          nomeFantasia: true,
          razaoSocial: true,
        },
      },
    },
  });

  if (!user) {
    return {
      success: false as const,
      error: "Usuário alvo não encontrado ou inativo.",
    };
  }

  await prisma.usuario.update({
    where: { id: user.id },
    data: {
      telegramChatId: params.chatId,
      telegramUsername: params.username,
      telegramAlertsEnabled: true,
      updatedAt: new Date(),
    },
  });

  const tenantName =
    user.tenant.nomeFantasia ||
    user.tenant.razaoSocial ||
    user.tenant.name ||
    user.tenant.slug;
  const fullName = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();

  return {
    success: true as const,
    user: {
      id: user.id,
      email: user.email,
      name: fullName || user.email,
      tenantId: user.tenant.id,
      tenantSlug: user.tenant.slug,
      tenantName,
    },
  };
}

async function findBoundUserByTelegramChatId(chatId: string) {
  const user = await prisma.usuario.findFirst({
    where: {
      telegramChatId: chatId,
      active: true,
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      tenant: {
        select: {
          id: true,
          slug: true,
          name: true,
          nomeFantasia: true,
          razaoSocial: true,
        },
      },
    },
  });

  if (!user) {
    return null;
  }

  const tenantName =
    user.tenant.nomeFantasia ||
    user.tenant.razaoSocial ||
    user.tenant.name ||
    user.tenant.slug;
  const fullName = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();

  return {
    id: user.id,
    email: user.email,
    name: fullName || user.email,
    tenantName,
  };
}

async function sendTelegramTextMessage(params: {
  provider: TelegramProviderContext;
  chatId: string;
  text: string;
}) {
  const body = new URLSearchParams({
    chat_id: params.chatId,
    text: params.text,
    parse_mode: "HTML",
    disable_web_page_preview: "true",
  });

  try {
    await callTelegramApi(params.provider.botToken, "sendMessage", body);
  } catch {
    // Evita quebrar o fluxo de onboarding se o envio de resposta falhar.
  }
}

async function sendTelegramGuideMessage(
  provider: TelegramProviderContext,
  chatId: string,
) {
  const botUsername = provider.botUsername
    ? `@${provider.botUsername.replace(/^@/, "")}`
    : "bot do escritório";

  await sendTelegramTextMessage({
    provider,
    chatId,
    text: [
      "👋 <b>Olá! Eu sou o Magic Radar.</b>",
      "",
      "Para conectar seu usuário do Magic Lawyer:",
      "1) Acesse seu escritório no sistema.",
      "2) Vá em <b>Usuário → Perfil → Editar → Telegram</b>.",
      "3) Clique em <b>Conectar Telegram</b> para gerar um código.",
      `4) Volte aqui e envie: <code>/start ml_notify_SEU_CODIGO</code>`,
      "",
      `Se já gerou o código, envie agora para ${botUsername}.`,
    ].join("\n"),
  });
}

async function sendTelegramConnectedMessage(params: {
  provider: TelegramProviderContext;
  chatId: string;
  userName: string;
  tenantName: string;
}) {
  await sendTelegramTextMessage({
    provider: params.provider,
    chatId: params.chatId,
    text: [
      "✅ <b>Integração concluída com sucesso.</b>",
      "",
      `Usuário: <b>${escapeTelegramHtml(params.userName)}</b>`,
      `Escritório: <b>${escapeTelegramHtml(params.tenantName)}</b>`,
      "",
      "A partir de agora você receberá alertas aqui no Telegram.",
    ].join("\n"),
  });
}

async function sendTelegramAlreadyConnectedMessage(params: {
  provider: TelegramProviderContext;
  chatId: string;
  userName: string;
  tenantName: string;
}) {
  await sendTelegramTextMessage({
    provider: params.provider,
    chatId: params.chatId,
    text: [
      "✅ <b>Você já está integrado ao Magic Lawyer.</b>",
      "",
      `Usuário: <b>${escapeTelegramHtml(params.userName)}</b>`,
      `Escritório: <b>${escapeTelegramHtml(params.tenantName)}</b>`,
      "",
      "Se quiser trocar o vínculo, gere um novo código no sistema.",
    ].join("\n"),
  });
}

async function sendTelegramInvalidCodeMessage(
  provider: TelegramProviderContext,
  chatId: string,
) {
  await sendTelegramTextMessage({
    provider,
    chatId,
    text: [
      "⚠️ <b>Não consegui validar esse código.</b>",
      "",
      "Ele pode estar expirado ou já utilizado.",
      "Volte ao Magic Lawyer em <b>Usuário → Perfil → Editar → Telegram</b>",
      "e clique em <b>Conectar Telegram</b> para gerar um novo código.",
    ].join("\n"),
  });
}

async function claimTelegramUpdate(updateId: number) {
  const redis = getRedisInstance();
  const result = await redis.set(
    getTelegramUpdateDedupKey(updateId),
    "1",
    "EX",
    TELEGRAM_UPDATE_DEDUP_TTL_SECONDS,
    "NX",
  );

  return result === "OK";
}

type TelegramStartProcessingResult = {
  processed: boolean;
  matchedCode?: boolean;
  chatId?: string | null;
  username?: string | null;
};

async function processTelegramStartUpdate(
  provider: TelegramProviderContext,
  update: TelegramUpdate,
): Promise<TelegramStartProcessingResult> {
  const text = update.message?.text?.trim() ?? "";
  const chatIdRaw = update.message?.chat?.id;

  if (!text || chatIdRaw === undefined || chatIdRaw === null) {
    return { processed: false };
  }

  const startPayload = parseStartCommandPayload(text);
  if (startPayload === null) {
    return { processed: false };
  }

  const chatId = String(chatIdRaw);
  const username = update.message?.from?.username
    ? `@${update.message.from.username.replace(/^@+/, "")}`
    : null;
  const code = extractConnectCode(startPayload);

  if (!code) {
    const boundUser = await findBoundUserByTelegramChatId(chatId);
    if (boundUser) {
      await sendTelegramAlreadyConnectedMessage({
        provider,
        chatId,
        userName: boundUser.name,
        tenantName: boundUser.tenantName,
      });

      return { processed: true, matchedCode: false, chatId, username };
    }

    await sendTelegramGuideMessage(provider, chatId);
    return { processed: true, matchedCode: false, chatId, username };
  }

  const redis = getRedisInstance();
  const codeRaw = await redis.get(getTelegramConnectCodeKey(code));

  if (!codeRaw) {
    await sendTelegramInvalidCodeMessage(provider, chatId);
    return { processed: true, matchedCode: false, chatId, username };
  }

  let codePayload: TelegramConnectionCodePayload | null = null;
  try {
    codePayload = JSON.parse(codeRaw) as TelegramConnectionCodePayload;
  } catch {
    await sendTelegramInvalidCodeMessage(provider, chatId);
    return { processed: true, matchedCode: false, chatId, username };
  }

  if (!codePayload?.tenantId || !codePayload?.userId) {
    await sendTelegramInvalidCodeMessage(provider, chatId);
    return { processed: true, matchedCode: false, chatId, username };
  }

  const bindResult = await bindTelegramChatToUser({
    tenantId: codePayload.tenantId,
    userId: codePayload.userId,
    chatId,
    username,
  });

  if (!bindResult.success) {
    await sendTelegramInvalidCodeMessage(provider, chatId);
    return { processed: true, matchedCode: false, chatId, username };
  }

  await redis.del(getTelegramConnectCodeKey(code));
  await redis.del(getTelegramConnectKey(codePayload.tenantId, codePayload.userId));

  await sendTelegramConnectedMessage({
    provider,
    chatId,
    userName: bindResult.user.name,
    tenantName: bindResult.user.tenantName,
  });

  return { processed: true, matchedCode: true, chatId, username };
}

export async function processTelegramWebhookUpdate(update: TelegramUpdate) {
  if (typeof update.update_id !== "number") {
    return;
  }

  const shouldProcess = await claimTelegramUpdate(update.update_id);
  if (!shouldProcess) {
    return;
  }

  const provider = getGlobalTelegramProviderContext();
  if (!provider) {
    return;
  }

  await processTelegramStartUpdate(provider, update);
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
  await ensureGlobalTelegramWebhookConfigured();

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
  const existingPayloadRaw = await redis.get(getTelegramConnectKey(tenantId, userId));
  const payload: TelegramConnectionPayload = {
    code,
    createdAt: new Date().toISOString(),
  };
  const codePayload: TelegramConnectionCodePayload = {
    tenantId,
    userId,
    code,
    createdAt: payload.createdAt,
  };

  let existingCode: string | null = null;
  if (existingPayloadRaw) {
    try {
      const existingPayload = JSON.parse(existingPayloadRaw) as TelegramConnectionPayload;
      existingCode = existingPayload.code?.trim()?.toUpperCase() || null;
    } catch {
      existingCode = null;
    }
  }

  const transaction = redis.multi();

  if (existingCode) {
    transaction.del(getTelegramConnectCodeKey(existingCode));
  }

  await transaction
    .set(
      getTelegramConnectKey(tenantId, userId),
      JSON.stringify(payload),
      "EX",
      TELEGRAM_CONNECT_TTL_SECONDS,
    )
    .set(
      getTelegramConnectCodeKey(code),
      JSON.stringify(codePayload),
      "EX",
      TELEGRAM_CONNECT_TTL_SECONDS,
    )
    .exec();

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
    const binding = await getTelegramUserBinding(tenantId, userId);
    if (binding.chatId) {
      return {
        success: true as const,
        username: binding.username,
        chatId: binding.chatId,
      };
    }

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

  let pending: TelegramConnectionPayload | null = null;
  try {
    pending = JSON.parse(storedPayload) as TelegramConnectionPayload;
  } catch {
    pending = null;
  }

  if (!pending?.code) {
    return {
      success: false as const,
      error:
        "Não foi possível validar o código pendente. Gere um novo vínculo e tente novamente.",
    };
  }

  let updates: TelegramUpdate[] = [];
  try {
    updates = await callTelegramApi<TelegramUpdate[]>(
      provider.botToken,
      "getUpdates",
    );
  } catch {
    const binding = await getTelegramUserBinding(tenantId, userId);
    if (binding.chatId) {
      return {
        success: true as const,
        username: binding.username,
        chatId: binding.chatId,
      };
    }

    return {
      success: false as const,
      error:
        "Não consegui consultar mensagens do bot agora. Envie /start com o código e tente confirmar novamente em alguns segundos.",
    };
  }

  let matched = false;
  const recentUpdates = updates.slice(-TELEGRAM_MAX_UPDATES).reverse();
  for (const update of recentUpdates) {
    if (typeof update.update_id !== "number") {
      continue;
    }

    const claimed = await claimTelegramUpdate(update.update_id);
    if (!claimed) {
      continue;
    }

    const result = await processTelegramStartUpdate(provider, update);
    if (result.matchedCode) {
      matched = true;
      break;
    }
  }

  const binding = await getTelegramUserBinding(tenantId, userId);
  if (binding.chatId) {
    await redis.del(getTelegramConnectKey(tenantId, userId));
    await redis.del(getTelegramConnectCodeKey(pending.code));

    return {
      success: true as const,
      username: binding.username,
      chatId: binding.chatId,
    };
  }

  if (matched) {
    return {
      success: false as const,
      error:
        "Recebi seu comando, mas o vínculo ainda não foi confirmado no usuário. Tente novamente em alguns segundos.",
    };
  }

  return {
    success: false as const,
    error:
      "Ainda não encontrei o comando válido. No Telegram, envie /start ml_notify_SEU_CODIGO e tente confirmar novamente.",
  };
}

export async function disconnectTelegramConnection(
  tenantId: string,
  userId: string,
) {
  const redis = getRedisInstance();
  const pendingRaw = await redis.get(getTelegramConnectKey(tenantId, userId));

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

  if (pendingRaw) {
    try {
      const pendingPayload = JSON.parse(pendingRaw) as TelegramConnectionPayload;
      if (pendingPayload.code) {
        await redis.del(getTelegramConnectCodeKey(pendingPayload.code));
      }
    } catch {
      // ignora payload inválido
    }
  }

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
  const [provider, binding, tenant] = await Promise.all([
    getActiveTelegramProvider(params.tenantId),
    getTelegramUserBinding(params.tenantId, params.userId),
    prisma.tenant.findUnique({
      where: { id: params.tenantId },
      select: {
        slug: true,
        domain: true,
        branding: { select: { customDomainText: true } },
      },
    }),
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

  const tenantBaseUrl = resolveTenantBaseUrl(tenant);
  const actionUrl = resolveNotificationUrl(
    params.type,
    params.payload ?? {},
    tenantBaseUrl,
  );
  const actionText = resolveNotificationActionText(
    params.type,
    params.payload ?? {},
  );

  const body = new URLSearchParams({
    chat_id: binding.chatId,
    text: buildTelegramMessage({
      title: params.title,
      message: params.message,
      type: params.type,
      urgency: params.urgency,
      payload: params.payload,
      actionUrl,
      actionText,
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

export async function renderTelegramNotification(params: {
  tenantId: string;
  title: string;
  message: string;
  type: string;
  urgency?: "CRITICAL" | "HIGH" | "MEDIUM" | "INFO";
  payload?: Record<string, unknown> | null;
  actionUrl?: string | null;
  actionText?: string | null;
}): Promise<TelegramRenderedNotification> {
  let actionUrl = params.actionUrl ?? null;
  const actionText =
    params.actionText ??
    resolveNotificationActionText(params.type, params.payload ?? {});

  if (!actionUrl) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: params.tenantId },
      select: {
        slug: true,
        domain: true,
        branding: { select: { customDomainText: true } },
      },
    });

    const tenantBaseUrl = resolveTenantBaseUrl(tenant);
    actionUrl = resolveNotificationUrl(
      params.type,
      params.payload ?? {},
      tenantBaseUrl,
    );
  }

  return {
    text: buildTelegramMessage({
      title: params.title,
      message: params.message,
      type: params.type,
      urgency: params.urgency,
      payload: params.payload,
      actionUrl,
      actionText,
    }),
    actionUrl,
    actionText,
  };
}

export async function sendTelegramNotificationToChatId(params: {
  tenantId: string;
  chatId: string;
  title: string;
  message: string;
  type: string;
  urgency?: "CRITICAL" | "HIGH" | "MEDIUM" | "INFO";
  payload?: Record<string, unknown> | null;
  username?: string | null;
  actionUrl?: string | null;
  actionText?: string | null;
}): Promise<TelegramSendMessageResult> {
  const provider = await getActiveTelegramProvider(params.tenantId);

  if (!provider) {
    return {
      success: false,
      error: "Bot do Telegram nao configurado para o escritorio.",
      metadata: {
        chatId: params.chatId,
        telegramUsername: params.username ?? null,
      },
    };
  }

  const rendered = await renderTelegramNotification({
    tenantId: params.tenantId,
    title: params.title,
    message: params.message,
    type: params.type,
    urgency: params.urgency,
    payload: params.payload,
    actionUrl: params.actionUrl,
    actionText: params.actionText,
  });

  const body = new URLSearchParams({
    chat_id: params.chatId,
    text: rendered.text,
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
        chatId: params.chatId,
        telegramUsername: params.username ?? null,
      },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Falha desconhecida no Telegram.",
      metadata: {
        chatId: params.chatId,
        telegramUsername: params.username ?? null,
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
