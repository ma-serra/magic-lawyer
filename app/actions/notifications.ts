"use server";

import type {
  NotificationChannel,
  NotificationUrgency,
} from "@/app/lib/notifications/notification-service";

import { randomUUID } from "crypto";
import { getServerSession } from "next-auth/next";
import { revalidatePath } from "next/cache";

import prisma from "@/app/lib/prisma";
import { authOptions } from "@/auth";
import { NotificationPolicy } from "@/app/lib/notifications/domain/notification-policy";
import {
  canDeliverWebPushToUser,
  deactivateWebPushSubscription,
  getActiveWebPushSubscriptions,
  getWebPushPublicKey,
  isWebPushConfigured,
  registerWebPushSubscription,
  sendWebPushNotification,
} from "@/app/lib/notifications/web-push";

export type NotificationStatus = "NAO_LIDA" | "LIDA" | "ARQUIVADA";

type GetNotificationsOptions = {
  limit?: number;
};

export type NotificationsResponse = {
  notifications: Array<{
    id: string;
    notificacaoId: string;
    titulo: string;
    mensagem: string;
    tipo: string;
    prioridade: string;
    status: NotificationStatus;
    canal: string;
    createdAt: string;
    entregueEm?: string | null;
    lidoEm?: string | null;
    referenciaTipo?: string | null;
    referenciaId?: string | null;
    dados?: unknown;
  }>;
  unreadCount: number;
};

async function ensureSession() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    throw new Error("Não autenticado");
  }

  const userId = (session.user as any)?.id;

  if (!userId) {
    throw new Error("Não autenticado");
  }

  const userRole = (session.user as any)?.role;
  const isSuperAdmin = userRole === "SUPER_ADMIN";

  return {
    userId,
    tenantId: (session.user as any)?.tenantId, // null para SuperAdmin
    isSuperAdmin,
    userRole,
  };
}

export async function getNotifications(
  options: GetNotificationsOptions = {},
): Promise<NotificationsResponse> {
  const { tenantId, userId, isSuperAdmin } = await ensureSession();

  const take = Math.min(options.limit ?? 50, 100);

  // SuperAdmin não tem notificações específicas por enquanto
  // Retorna array vazio para evitar erros
  if (isSuperAdmin) {
    return {
      notifications: [],
      unreadCount: 0,
    };
  }

  // Buscar notificações de AMBOS os sistemas (legado + novo)
  const [
    legacyNotifications,
    newNotifications,
    legacyUnreadCount,
    newUnreadCount,
  ] = await Promise.all([
    // Sistema legado
    prisma.notificacaoUsuario.findMany({
      where: {
        tenantId,
        usuarioId: userId,
        status: {
          in: ["NAO_LIDA", "LIDA"],
        },
      },
      orderBy: [{ createdAt: "desc" }],
      take,
      include: {
        notificacao: true,
      },
    }),
    // Sistema novo
    prisma.notification.findMany({
      where: {
        tenantId,
        userId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: [{ createdAt: "desc" }],
      take,
      include: {
        deliveries: {
          select: {
            channel: true,
            status: true,
            createdAt: true,
          },
        },
      },
    }),
    prisma.notificacaoUsuario.count({
      where: {
        tenantId,
        usuarioId: userId,
        status: "NAO_LIDA",
      },
    }),
    prisma.notification.count({
      where: {
        tenantId,
        userId,
        readAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    }),
  ]);

  // Converter notificações legadas
  const legacyItems = legacyNotifications.map((item) => ({
    id: item.id,
    notificacaoId: item.notificacaoId,
    titulo: item.notificacao.titulo,
    mensagem: item.notificacao.mensagem,
    tipo: item.notificacao.tipo,
    prioridade: item.notificacao.prioridade,
    status: item.status as NotificationStatus,
    canal: item.canal,
    createdAt: item.createdAt.toISOString(),
    entregueEm: item.entregueEm?.toISOString() ?? null,
    lidoEm: item.lidoEm?.toISOString() ?? null,
    referenciaTipo: item.notificacao.referenciaTipo,
    referenciaId: item.notificacao.referenciaId,
    dados: item.notificacao.dados,
    source: "legacy" as const,
  }));

  // Converter notificações novas
  const newItems = newNotifications.map((item) => ({
    id: item.id,
    notificacaoId: item.id, // No novo sistema, o ID da notificação é o mesmo
    titulo:
      item.title ||
      (item.payload as any)?.titulo ||
      (item.payload as any)?.title ||
      item.type,
    mensagem:
      item.message ||
      (item.payload as any)?.mensagem ||
      (item.payload as any)?.message ||
      "Nova notificação",
    tipo: item.type,
    prioridade: item.urgency || "MEDIA",
    status: item.readAt
      ? ("LIDA" as NotificationStatus)
      : ("NAO_LIDA" as NotificationStatus),
    canal: item.deliveries[0]?.channel || "REALTIME",
    createdAt: item.createdAt.toISOString(),
    entregueEm:
      item.deliveries
        .find((d) => d.status === "DELIVERED")
        ?.createdAt?.toISOString() ?? null,
    lidoEm: item.readAt?.toISOString() ?? null,
    referenciaTipo: (item.payload as any)?.referenciaTipo ?? null,
    referenciaId: (item.payload as any)?.referenciaId ?? null,
    dados: item.payload,
    source: "new" as const,
  }));

  // Unificar e ordenar por data (mais recente primeiro)
  const allNotifications = [...legacyItems, ...newItems]
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    .slice(0, take);

  const unreadCount = legacyUnreadCount + newUnreadCount;

  return {
    notifications: allNotifications.map(({ source, ...item }) => item), // Remove campo source antes de retornar
    unreadCount,
  };
}

export async function setNotificationStatus(
  id: string,
  status: NotificationStatus,
): Promise<void> {
  const { tenantId, userId, isSuperAdmin } = await ensureSession();

  // SuperAdmin não tem notificações por enquanto
  if (isSuperAdmin) {
    return;
  }

  if (!id) {
    throw new Error("Notificação inválida");
  }

  if (!["NAO_LIDA", "LIDA", "ARQUIVADA"].includes(status)) {
    throw new Error("Status inválido");
  }

  // Tentar atualizar no sistema legado primeiro
  const legacyResult = await prisma.notificacaoUsuario.updateMany({
    where: {
      id,
      tenantId,
      usuarioId: userId,
    },
    data: {
      status,
      lidoEm:
        status === "LIDA"
          ? new Date()
          : status === "NAO_LIDA"
            ? null
            : undefined,
      reabertoEm: status === "NAO_LIDA" ? new Date() : undefined,
      updatedAt: new Date(),
    },
  });

  // Se não encontrou no legado, tentar no novo sistema
  if (legacyResult.count === 0) {
    const newResult = await prisma.notification.updateMany({
      where: {
        id,
        tenantId,
        userId,
      },
      data: {
        readAt:
          status === "LIDA"
            ? new Date()
            : status === "NAO_LIDA"
              ? null
              : undefined,
      },
    });

    if (newResult.count === 0) {
      throw new Error("Notificação não encontrada");
    }
  }
}

export async function markNotificationAsRead(id: string): Promise<void> {
  await setNotificationStatus(id, "LIDA");
}

export async function markAllNotificationsAsRead(): Promise<void> {
  const { tenantId, userId, isSuperAdmin } = await ensureSession();

  // SuperAdmin não tem notificações por enquanto
  if (isSuperAdmin) {
    return;
  }

  // Marcar todas como lidas nos DOIS sistemas em paralelo
  await Promise.all([
    // Sistema legado
    prisma.notificacaoUsuario.updateMany({
      where: {
        tenantId,
        usuarioId: userId,
        status: "NAO_LIDA",
      },
      data: {
        status: "LIDA",
        lidoEm: new Date(),
        updatedAt: new Date(),
      },
    }),
    // Sistema novo
    prisma.notification.updateMany({
      where: {
        tenantId,
        userId,
        readAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      data: {
        readAt: new Date(),
      },
    }),
  ]);
}

export async function clearAllNotifications(): Promise<void> {
  const { tenantId, userId, isSuperAdmin } = await ensureSession();

  // SuperAdmin não tem notificações por enquanto
  if (isSuperAdmin) {
    return;
  }

  // Limpar todas as notificações nos DOIS sistemas em paralelo
  await Promise.all([
    // Sistema legado
    prisma.notificacaoUsuario.updateMany({
      where: {
        tenantId,
        usuarioId: userId,
      },
      data: {
        status: "ARQUIVADA",
        updatedAt: new Date(),
      },
    }),
    // Sistema novo
    prisma.notification.updateMany({
      where: {
        tenantId,
        userId,
      },
      data: {
        readAt: new Date(),
        expiresAt: new Date(),
      },
    }),
  ]);
}

// ============================================
// SERVER ACTIONS - NOVO SISTEMA DE NOTIFICAÇÕES
// ============================================

/**
 * Marca notificação do novo sistema como lida
 */
export async function markNewNotificationAsRead(
  notificationId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { tenantId, userId } = await ensureSession();

    if (!tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    // Verificar se notificação existe e pertence ao usuário
    const notification = await prisma.notification.findFirst({
      where: {
        id: notificationId,
        tenantId,
        userId,
      },
    });

    if (!notification) {
      return { success: false, error: "Notificação não encontrada" };
    }

    // Marcar como lida
    await prisma.notification.update({
      where: { id: notificationId },
      data: {
        readAt: new Date(),
      },
    });

    // Atualizar status de entrega para READ se houver entrega REALTIME
    await prisma.notificationDelivery.updateMany({
      where: {
        notificationId,
        channel: "REALTIME",
        status: { in: ["PENDING", "SENT", "DELIVERED"] },
      },
      data: {
        status: "READ",
      },
    });

    return { success: true };
  } catch (error) {
    console.error("[markNewNotificationAsRead] Erro:", error);

    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro interno",
    };
  }
}

/**
 * Marca notificação do novo sistema como não lida
 */
export async function markNewNotificationAsUnread(
  notificationId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { tenantId, userId } = await ensureSession();

    if (!tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    // Verificar se notificação existe e pertence ao usuário
    const notification = await prisma.notification.findFirst({
      where: {
        id: notificationId,
        tenantId,
        userId,
      },
    });

    if (!notification) {
      return { success: false, error: "Notificação não encontrada" };
    }

    // Marcar como não lida (remover readAt)
    await prisma.notification.update({
      where: { id: notificationId },
      data: {
        readAt: null,
      },
    });

    return { success: true };
  } catch (error) {
    console.error("[markNewNotificationAsUnread] Erro:", error);

    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro interno",
    };
  }
}

/**
 * Busca preferências de notificações do usuário
 */
export async function getNotificationPreferences(): Promise<{
  success: boolean;
  preferences?: Array<{
    eventType: string;
    enabled: boolean;
    channels: NotificationChannel[];
    urgency: string;
  }>;
  defaultEventTypes?: string[];
  error?: string;
}> {
  try {
    const { tenantId, userId } = await ensureSession();

    if (!tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    // Buscar todas as preferências do usuário
    const preferences = await prisma.notificationPreference.findMany({
      where: {
        tenantId,
        userId,
      },
      orderBy: {
        eventType: "asc",
      },
    });

    // Buscar preferências padrão (globais) para eventos sem preferência específica
    const defaultPreferences = await prisma.notificationTemplate.findMany({
      where: {
        tenantId,
        isDefault: true,
      },
      select: {
        eventType: true,
      },
    });

    const preferencesPayload = preferences.map((p) => {
      const parsedChannels = p.channels as
        | NotificationChannel[]
        | null
        | undefined;
      const channels: NotificationChannel[] =
        parsedChannels && parsedChannels.length > 0
          ? parsedChannels
          : (["REALTIME"] as NotificationChannel[]);

      return {
        eventType: p.eventType,
        enabled: p.enabled,
        channels,
        urgency: p.urgency,
      };
    });

    return {
      success: true,
      preferences: preferencesPayload,
      defaultEventTypes: defaultPreferences.map((t) => t.eventType),
    };
  } catch (error) {
    console.error("[getNotificationPreferences] Erro:", error);

    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro interno",
    };
  }
}

/**
 * Atualiza preferência de notificação do usuário
 */
export async function updateNotificationPreference(data: {
  eventType: string;
  enabled?: boolean;
  channels?: NotificationChannel[];
  urgency?: string;
}): Promise<{
  success: boolean;
  preference?: {
    eventType: string;
    enabled: boolean;
    channels: NotificationChannel[];
    urgency: string;
  };
  error?: string;
}> {
  try {
    const { tenantId, userId } = await ensureSession();

    if (!tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    if (!data.eventType) {
      return { success: false, error: "eventType é obrigatório" };
    }

    // Validar que o evento pode ser desabilitado (eventos críticos não podem)
    if (!data.enabled && !NotificationPolicy.canDisableEvent(data.eventType)) {
      return {
        success: false,
        error: `Evento "${data.eventType}" é crítico e não pode ser desabilitado`,
      };
    }

    // Validar canais
    const channelsToPersist: NotificationChannel[] =
      Array.isArray(data.channels) && data.channels.length > 0
        ? data.channels
        : ["REALTIME"];

    if (channelsToPersist.length === 0) {
      return {
        success: false,
        error: "Pelo menos um canal válido deve ser informado",
      };
    }

    // Validar urgência
    const validUrgencies: NotificationUrgency[] = [
      "CRITICAL",
      "HIGH",
      "MEDIUM",
      "INFO",
    ];
    const validUrgency =
      data.urgency &&
      validUrgencies.includes(data.urgency as NotificationUrgency)
        ? (data.urgency as NotificationUrgency)
        : "MEDIUM";

    // Criar ou atualizar preferência
    const preference = await prisma.notificationPreference.upsert({
      where: {
        tenantId_userId_eventType: {
          tenantId,
          userId,
          eventType: data.eventType,
        },
      },
      create: {
        tenantId,
        userId,
        eventType: data.eventType,
        enabled: data.enabled ?? true,
        channels: channelsToPersist,
        urgency: validUrgency,
      },
      update: {
        enabled: data.enabled ?? true,
        channels: channelsToPersist,
        urgency: validUrgency,
        updatedAt: new Date(),
      },
    });

    return {
      success: true,
      preference: {
        eventType: preference.eventType,
        enabled: preference.enabled,
        channels: preference.channels,
        urgency: preference.urgency,
      },
    };
  } catch (error) {
    console.error("[updateNotificationPreference] Erro:", error);

    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro interno",
    };
  }
}

export async function getMyWebPushStatus(): Promise<{
  success: boolean;
  configured?: boolean;
  publicKey?: string | null;
  activeSubscriptionsCount?: number;
  devices?: Array<{
    id: string;
    deviceLabel: string;
    browserName: string | null;
    osName: string | null;
    createdAt: string;
    lastSeenAt: string;
    lastSuccessAt: string | null;
  }>;
  error?: string;
}> {
  try {
    const { tenantId, userId } = await ensureSession();

    if (!tenantId) {
      return { success: false, error: "Tenant nao encontrado" };
    }

    const devices = await getActiveWebPushSubscriptions({ tenantId, userId });

    return {
      success: true,
      configured: isWebPushConfigured(),
      publicKey: getWebPushPublicKey(),
      activeSubscriptionsCount: devices.length,
      devices: devices.map((device) => ({
        id: device.id,
        deviceLabel: device.deviceLabel || "Dispositivo nao identificado",
        browserName: device.browserName ?? null,
        osName: device.osName ?? null,
        createdAt: device.createdAt.toISOString(),
        lastSeenAt: device.lastSeenAt.toISOString(),
        lastSuccessAt: device.lastSuccessAt?.toISOString() ?? null,
      })),
    };
  } catch (error) {
    console.error("[getMyWebPushStatus] Erro:", error);

    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro interno",
    };
  }
}

export async function registerMyWebPushSubscription(data: {
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
  userAgent?: string | null;
  deviceLabel?: string | null;
  browserName?: string | null;
  osName?: string | null;
}): Promise<{
  success: boolean;
  activeSubscriptionsCount?: number;
  error?: string;
}> {
  try {
    const { tenantId, userId } = await ensureSession();

    if (!tenantId) {
      return { success: false, error: "Tenant nao encontrado" };
    }

    if (!isWebPushConfigured()) {
      return {
        success: false,
        error: "Web Push nao configurado no ambiente.",
      };
    }

    await registerWebPushSubscription({
      tenantId,
      userId,
      subscription: data,
    });

    const devices = await getActiveWebPushSubscriptions({ tenantId, userId });

    revalidatePath("/usuario/preferencias-notificacoes");

    return {
      success: true,
      activeSubscriptionsCount: devices.length,
    };
  } catch (error) {
    console.error("[registerMyWebPushSubscription] Erro:", error);

    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro interno",
    };
  }
}

export async function unregisterMyWebPushSubscription(endpoint: string): Promise<{
  success: boolean;
  activeSubscriptionsCount?: number;
  error?: string;
}> {
  try {
    const { tenantId, userId } = await ensureSession();

    if (!tenantId) {
      return { success: false, error: "Tenant nao encontrado" };
    }

    await deactivateWebPushSubscription({
      tenantId,
      userId,
      endpoint,
    });

    const devices = await getActiveWebPushSubscriptions({ tenantId, userId });

    revalidatePath("/usuario/preferencias-notificacoes");

    return {
      success: true,
      activeSubscriptionsCount: devices.length,
    };
  } catch (error) {
    console.error("[unregisterMyWebPushSubscription] Erro:", error);

    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro interno",
    };
  }
}

export async function sendMyWebPushTestNotification(): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const { tenantId, userId } = await ensureSession();

    if (!tenantId) {
      return { success: false, error: "Tenant nao encontrado" };
    }

    const canDeliver = await canDeliverWebPushToUser(tenantId, userId);

    if (!canDeliver) {
      return {
        success: false,
        error: "Nenhum dispositivo com Web Push ativo para este usuario.",
      };
    }

    const result = await sendWebPushNotification({
      id: `webpush-test-${randomUUID()}`,
      tenantId,
      userId,
      type: "access.push_test",
      title: "Teste de Web Push",
      message:
        "Seu dispositivo recebeu um push do Magic Lawyer. Agora podemos usar esse canal com seguranca.",
      urgency: "INFO",
      payload: {
        url: "/usuario/preferencias-notificacoes",
      },
      createdAt: new Date(),
    });

    return {
      success: result.success,
      error: result.error,
    };
  } catch (error) {
    console.error("[sendMyWebPushTestNotification] Erro:", error);

    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro interno",
    };
  }
}
