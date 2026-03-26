import { createHash } from "crypto";

import webpush from "web-push";

import prisma from "@/app/lib/prisma";

type WebPushSubscriptionKeys = {
  p256dh: string;
  auth: string;
};

export type WebPushSubscriptionInput = {
  endpoint: string;
  expirationTime?: number | null;
  keys: WebPushSubscriptionKeys;
  userAgent?: string | null;
  deviceLabel?: string | null;
  browserName?: string | null;
  osName?: string | null;
};

type NotificationLike = {
  id: string;
  tenantId: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  urgency?: string | null;
  payload?: unknown;
  createdAt?: Date | null;
};

type WebPushRuntimeConfig = {
  publicKey: string;
  privateKey: string;
  subject: string;
};

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function getWebPushRuntimeConfig(): WebPushRuntimeConfig | null {
  const publicKey = readString(process.env.WEB_PUSH_VAPID_PUBLIC_KEY);
  const privateKey = readString(process.env.WEB_PUSH_VAPID_PRIVATE_KEY);
  const subject =
    readString(process.env.WEB_PUSH_VAPID_SUBJECT) ||
    readString(process.env.RESEND_FROM_EMAIL)?.match(/<([^>]+)>/)?.[1] ||
    "mailto:seguranca@magiclawyer.com.br";

  if (!publicKey || !privateKey || !subject) {
    return null;
  }

  return {
    publicKey,
    privateKey,
    subject: subject.startsWith("mailto:") || subject.startsWith("https://")
      ? subject
      : `mailto:${subject}`,
  };
}

let vapidConfigured = false;

function ensureWebPushConfigured() {
  const config = getWebPushRuntimeConfig();

  if (!config) {
    return null;
  }

  if (!vapidConfigured) {
    webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
    vapidConfigured = true;
  }

  return config;
}

function hashPushEndpoint(endpoint: string) {
  return createHash("sha256").update(endpoint).digest("hex");
}

function toExpirationDate(expirationTime?: number | null) {
  if (!expirationTime || !Number.isFinite(expirationTime) || expirationTime <= 0) {
    return null;
  }

  return new Date(expirationTime);
}

function resolveNotificationUrl(
  notificationType: string,
  payload: Record<string, unknown>,
) {
  const securityActionUrl = readString(payload.securityActionUrl);

  if (securityActionUrl) {
    return securityActionUrl;
  }

  const processoId = readString(payload.processoId);
  const clienteId = readString(payload.clienteId);
  const prazoId = readString(payload.prazoId);

  if (
    (notificationType.startsWith("prazo.") || readString(payload.referenciaTipo) === "prazo") &&
    processoId
  ) {
    return prazoId
      ? `/processos/${processoId}?tab=prazos&prazoId=${encodeURIComponent(prazoId)}`
      : `/processos/${processoId}?tab=prazos`;
  }

  if (
    (notificationType.startsWith("andamento.") ||
      notificationType.startsWith("movimentacao.") ||
      readString(payload.referenciaTipo) === "movimentacao" ||
      readString(payload.referenciaTipo) === "andamento") &&
    processoId
  ) {
    return `/processos/${processoId}?tab=eventos`;
  }

  if (processoId) {
    return `/processos/${processoId}`;
  }

  if (clienteId) {
    return `/clientes/${clienteId}`;
  }

  return "/dashboard";
}

function mapUrgencyToWebPush(urgency?: string | null): "very-low" | "low" | "normal" | "high" {
  switch ((urgency || "").toUpperCase()) {
    case "CRITICAL":
      return "high";
    case "HIGH":
      return "high";
    case "INFO":
      return "low";
    case "MEDIUM":
    default:
      return "normal";
  }
}

function buildWebPushPayload(notification: NotificationLike) {
  const payload = asRecord(notification.payload);
  const securityActionUrl = readString(payload.securityActionUrl);
  const targetUrl = resolveNotificationUrl(notification.type, payload);

  return JSON.stringify({
    title: notification.title,
    body: notification.message,
    icon: "/favicon.svg",
    badge: "/favicon.svg",
    tag: `ml-notification-${notification.id}`,
    renotify: (notification.urgency || "").toUpperCase() === "CRITICAL",
    requireInteraction:
      (notification.urgency || "").toUpperCase() === "CRITICAL",
    data: {
      notificationId: notification.id,
      type: notification.type,
      tenantId: notification.tenantId,
      userId: notification.userId,
      createdAt:
        notification.createdAt instanceof Date
          ? notification.createdAt.toISOString()
          : new Date().toISOString(),
      url: targetUrl,
      securityActionUrl,
    },
    actions: securityActionUrl
      ? [
          {
            action: "security-review",
            title: "Nao fui eu",
          },
          {
            action: "open",
            title: "Abrir",
          },
        ]
      : [
          {
            action: "open",
            title: "Abrir",
          },
        ],
  });
}

function normalizeWebPushError(error: unknown) {
  const statusCode =
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    typeof (error as { statusCode?: unknown }).statusCode === "number"
      ? (error as { statusCode: number }).statusCode
      : null;
  const body =
    typeof error === "object" &&
    error !== null &&
    "body" in error &&
    typeof (error as { body?: unknown }).body === "string"
      ? (error as { body: string }).body
      : null;
  const message =
    error instanceof Error ? error.message : body || "Falha ao enviar Web Push.";

  return { statusCode, message, body };
}

export function getWebPushPublicKey() {
  return getWebPushRuntimeConfig()?.publicKey ?? null;
}

export function isWebPushConfigured() {
  return Boolean(getWebPushRuntimeConfig());
}

export async function registerWebPushSubscription(params: {
  tenantId: string;
  userId: string;
  subscription: WebPushSubscriptionInput;
}) {
  const endpoint = readString(params.subscription.endpoint);
  const p256dh = readString(params.subscription.keys?.p256dh);
  const auth = readString(params.subscription.keys?.auth);

  if (!endpoint || !p256dh || !auth) {
    throw new Error("Subscription Web Push invalida.");
  }

  const endpointHash = hashPushEndpoint(endpoint);
  const now = new Date();

  return prisma.webPushSubscription.upsert({
    where: {
      endpointHash,
    },
    create: {
      tenantId: params.tenantId,
      userId: params.userId,
      endpoint,
      endpointHash,
      p256dh,
      auth,
      expiresAt: toExpirationDate(params.subscription.expirationTime),
      userAgent: readString(params.subscription.userAgent),
      deviceLabel: readString(params.subscription.deviceLabel),
      browserName: readString(params.subscription.browserName),
      osName: readString(params.subscription.osName),
      active: true,
      failureCount: 0,
      lastSeenAt: now,
    },
    update: {
      tenantId: params.tenantId,
      userId: params.userId,
      endpoint,
      p256dh,
      auth,
      expiresAt: toExpirationDate(params.subscription.expirationTime),
      userAgent: readString(params.subscription.userAgent),
      deviceLabel: readString(params.subscription.deviceLabel),
      browserName: readString(params.subscription.browserName),
      osName: readString(params.subscription.osName),
      active: true,
      failureCount: 0,
      lastSeenAt: now,
      updatedAt: now,
    },
  });
}

export async function deactivateWebPushSubscription(params: {
  tenantId: string;
  userId: string;
  endpoint: string;
}) {
  const endpoint = readString(params.endpoint);

  if (!endpoint) {
    return { count: 0 };
  }

  return prisma.webPushSubscription.updateMany({
    where: {
      tenantId: params.tenantId,
      userId: params.userId,
      endpointHash: hashPushEndpoint(endpoint),
    },
    data: {
      active: false,
      updatedAt: new Date(),
    },
  });
}

export async function getActiveWebPushSubscriptions(params: {
  tenantId: string;
  userId: string;
}) {
  return prisma.webPushSubscription.findMany({
    where: {
      tenantId: params.tenantId,
      userId: params.userId,
      active: true,
    },
    orderBy: [{ lastSeenAt: "desc" }],
  });
}

export async function canDeliverWebPushToUser(tenantId: string, userId: string) {
  if (!isWebPushConfigured()) {
    return false;
  }

  const count = await prisma.webPushSubscription.count({
    where: {
      tenantId,
      userId,
      active: true,
    },
  });

  return count > 0;
}

export async function sendWebPushNotification(notification: NotificationLike): Promise<{
  success: boolean;
  error?: string;
  messageId?: string;
  metadata?: Record<string, unknown>;
}> {
  const config = ensureWebPushConfigured();

  if (!config) {
    return {
      success: false,
      error: "Web Push nao configurado no ambiente.",
    };
  }

  const subscriptions = await prisma.webPushSubscription.findMany({
    where: {
      tenantId: notification.tenantId,
      userId: notification.userId,
      active: true,
    },
    orderBy: [{ lastSeenAt: "desc" }],
  });

  if (subscriptions.length === 0) {
    return {
      success: false,
      error: "Nenhum dispositivo com Web Push ativo para este usuario.",
      metadata: {
        totalSubscriptions: 0,
      },
    };
  }

  const payload = buildWebPushPayload(notification);
  let successCount = 0;
  let failureCount = 0;
  let deactivatedCount = 0;
  const errors: string[] = [];

  await Promise.allSettled(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            expirationTime: subscription.expiresAt?.getTime() ?? undefined,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          },
          payload,
          {
            TTL: 60,
            urgency: mapUrgencyToWebPush(notification.urgency),
          },
        );

        successCount += 1;

        await prisma.webPushSubscription.update({
          where: {
            id: subscription.id,
          },
          data: {
            active: true,
            failureCount: 0,
            lastSeenAt: new Date(),
            lastSuccessAt: new Date(),
          },
        });
      } catch (error) {
        failureCount += 1;
        const normalizedError = normalizeWebPushError(error);

        errors.push(normalizedError.message);

        const shouldDeactivate =
          normalizedError.statusCode === 404 || normalizedError.statusCode === 410;

        if (shouldDeactivate) {
          deactivatedCount += 1;
        }

        await prisma.webPushSubscription.update({
          where: {
            id: subscription.id,
          },
          data: {
            active: shouldDeactivate ? false : subscription.active,
            failureCount: {
              increment: 1,
            },
            lastSeenAt: new Date(),
          },
        });
      }
    }),
  );

  if (successCount === 0) {
    return {
      success: false,
      error: errors[0] || "Falha ao enviar Web Push.",
      metadata: {
        totalSubscriptions: subscriptions.length,
        successCount,
        failureCount,
        deactivatedCount,
        errors,
      },
    };
  }

  return {
    success: true,
    messageId: `webpush:${notification.id}:${successCount}`,
    metadata: {
      totalSubscriptions: subscriptions.length,
      successCount,
      failureCount,
      deactivatedCount,
    },
  };
}
