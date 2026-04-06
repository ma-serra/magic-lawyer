import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/auth";
import prisma from "@/app/lib/prisma";

/**
 * Endpoint para métricas da fila de notificações
 * Acesso: Admin/SuperAdmin apenas
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userRole = (session.user as any)?.role;
    const isAdmin = ["ADMIN", "SUPER_ADMIN"].includes(userRole);

    if (!isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const tenantId = (session.user as any)?.tenantId;

    // Métricas gerais
    const [
      totalNotifications,
      pendingNotifications,
      sentNotifications,
      failedNotifications,
      recentNotifications,
      queueSize,
    ] = await Promise.all([
      // Total de notificações
      prisma.notification.count({
        where: tenantId ? { tenantId } : undefined,
      }),

      // Notificações pendentes (criadas mas não enviadas)
      prisma.notification.count({
        where: {
          ...(tenantId ? { tenantId } : {}),
          deliveries: {
            none: {
              status: {
                in: ["SENT", "DELIVERED"],
              },
            },
          },
        },
      }),

      // Notificações enviadas com sucesso
      prisma.notificationDelivery.count({
        where: {
          status: {
            in: ["SENT", "DELIVERED"],
          },
          ...(tenantId
            ? {
                notification: {
                  tenantId,
                },
              }
            : {}),
        },
      }),

      // Notificações que falharam
      prisma.notificationDelivery.count({
        where: {
          status: "FAILED",
          ...(tenantId
            ? {
                notification: {
                  tenantId,
                },
              }
            : {}),
        },
      }),

      // Notificações criadas nas últimas 24h
      prisma.notification.count({
        where: {
          ...(tenantId ? { tenantId } : {}),
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
          },
        },
      }),

      // Tamanho estimado da fila BullMQ (se disponível)
      // Por enquanto retornamos 0 - implementar quando BullMQ dashboard estiver disponível
      0,
    ]);

    // Taxa de sucesso
    const totalDeliveries = sentNotifications + failedNotifications;
    const successRate =
      totalDeliveries > 0
        ? ((sentNotifications / totalDeliveries) * 100).toFixed(2)
        : "0.00";

    // Notificações por canal (últimas 24h)
    const deliveriesByChannel = await prisma.notificationDelivery.groupBy({
      by: ["channel"],
      where: {
        ...(tenantId
          ? {
              notification: {
                tenantId,
              },
            }
          : {}),
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
        status: {
          not: "SKIPPED",
        },
      },
      _count: {
        id: true,
      },
    });

    // Notificações por tipo (últimas 24h)
    const notificationsByType = await prisma.notification.groupBy({
      by: ["type"],
      where: {
        ...(tenantId ? { tenantId } : {}),
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      },
      _count: {
        id: true,
      },
    });

    return NextResponse.json({
      success: true,
      metrics: {
        overview: {
          total: totalNotifications,
          pending: pendingNotifications,
          sent: sentNotifications,
          failed: failedNotifications,
          recent24h: recentNotifications,
          queueSize,
          successRate: `${successRate}%`,
        },
        byChannel: deliveriesByChannel.map((item) => ({
          channel: item.channel,
          count: item._count.id,
        })),
        byType: notificationsByType.map((item) => ({
          type: item.type,
          count: item._count.id,
        })),
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Erro ao buscar métricas de notificações:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Erro interno do servidor",
      },
      { status: 500 },
    );
  }
}
