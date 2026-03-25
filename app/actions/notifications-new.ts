"use server";

import { getServerSession } from "next-auth/next";

import { authOptions } from "@/auth";
import prisma from "@/app/lib/prisma";

export type NotificationStatus = "NAO_LIDA" | "LIDA" | "ARQUIVADA";

type GetOptions = { limit?: number };

export type NotificationsResponse = {
  notifications: Array<{
    id: string;
    notificacaoId: string; // compat
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

  if (!session?.user?.id) {
    throw new Error("Não autenticado");
  }

  const userRole = (session.user as any)?.role;
  const isSuperAdmin = userRole === "SUPER_ADMIN";
  const tenantId = (session.user as any)?.tenantId as string | null;

  // SuperAdmin não tem tenantId, mas está autenticado
  if (isSuperAdmin) {
    return {
      userId: (session.user as any).id as string,
      tenantId: null, // SuperAdmin não tem tenant
      isSuperAdmin: true,
    };
  }

  // Usuários comuns precisam de tenantId
  if (!tenantId) {
    throw new Error("Não autenticado");
  }

  return {
    userId: (session.user as any).id as string,
    tenantId: tenantId,
    isSuperAdmin: false,
  };
}

export async function getNotifications(
  options: GetOptions = {},
): Promise<NotificationsResponse> {
  const { userId, tenantId, isSuperAdmin } = await ensureSession();
  const take = Math.min(options.limit ?? 50, 100);

  // SuperAdmin não tem notificações específicas (sistema multi-tenant)
  // Retorna array vazio para evitar erros
  if (isSuperAdmin) {
    return {
      notifications: [],
      unreadCount: 0,
    };
  }

  if (!tenantId) {
    throw new Error("Tenant não encontrado");
  }

  const notifications = await prisma.notification.findMany({
    where: {
      tenantId: tenantId ?? undefined,
      userId,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    orderBy: { createdAt: "desc" },
    take,
  });

  const unreadCount = await prisma.notification.count({
    where: {
      tenantId: tenantId ?? undefined,
      userId,
      readAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
  });

  return {
    notifications: notifications.map((n) => ({
      id: n.id,
      notificacaoId: n.id,
      titulo: n.title,
      mensagem: n.message,
      tipo: n.type,
      prioridade: (n.urgency as string) ?? "MEDIUM",
      status: (n.readAt ? "LIDA" : "NAO_LIDA") as NotificationStatus,
      canal: (n.channels?.[0] as string) ?? "IN_APP",
      createdAt: n.createdAt.toISOString(),
      entregueEm: null,
      lidoEm: n.readAt ? n.readAt.toISOString() : null,
      referenciaTipo: n.payload && (n.payload as any).referenciaTipo,
      referenciaId: n.payload && (n.payload as any).referenciaId,
      dados: n.payload,
    })),
    unreadCount,
  };
}

export async function setNotificationStatus(
  id: string,
  status: NotificationStatus,
): Promise<void> {
  const { userId, tenantId, isSuperAdmin } = await ensureSession();

  // SuperAdmin não tem notificações para atualizar
  if (isSuperAdmin) {
    return;
  }

  await prisma.notification.updateMany({
    where: {
      id,
      tenantId: tenantId ?? undefined,
      userId,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    data: {
      readAt:
        status === "LIDA"
          ? new Date()
          : status === "NAO_LIDA"
            ? null
            : new Date(),
    },
  });
}

export async function markAllNotificationsAsRead(): Promise<void> {
  const { userId, tenantId, isSuperAdmin } = await ensureSession();

  // SuperAdmin não tem notificações para marcar
  if (isSuperAdmin) {
    return;
  }

  await prisma.notification.updateMany({
    where: {
      tenantId: tenantId ?? undefined,
      userId,
      readAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    data: { readAt: new Date() },
  });
}

export async function clearAllNotifications(): Promise<void> {
  const { userId, tenantId, isSuperAdmin } = await ensureSession();

  // SuperAdmin não tem notificações para limpar
  if (isSuperAdmin) {
    return;
  }

  await prisma.notification.updateMany({
    where: {
      tenantId: tenantId ?? undefined,
      userId,
    },
    data: {
      readAt: new Date(),
      expiresAt: new Date(),
    },
  });
}
