/**
 * Serviço de agendamento de notificações de prazos
 * Executa verificações periódicas de prazos próximos do vencimento
 */

import { NotificationService } from "../notification-service";
import { NotificationFactory } from "../domain/notification-factory";
import { getRedisInstance } from "../redis-singleton";

import prisma from "@/app/lib/prisma";

/**
 * Intervals em milissegundos para verificação de prazos
 */
const CHECK_INTERVALS = {
  SEVEN_DAYS: 7 * 24 * 60 * 60 * 1000, // 7 dias
  THREE_DAYS: 3 * 24 * 60 * 60 * 1000, // 3 dias
  ONE_DAY: 1 * 24 * 60 * 60 * 1000, // 1 dia
  TWO_HOURS: 2 * 60 * 60 * 1000, // 2 horas
};

export class DeadlineSchedulerService {
  /**
   * Verifica e dispara notificações para prazos próximos do vencimento
   * Deve ser executado via cron job diariamente
   */
  static async checkExpiringDeadlines(): Promise<void> {
    const now = new Date();

    // Calcular datas de alerta
    const sevenDaysFromNow = new Date(
      now.getTime() + CHECK_INTERVALS.SEVEN_DAYS,
    );
    const threeDaysFromNow = new Date(
      now.getTime() + CHECK_INTERVALS.THREE_DAYS,
    );
    const oneDayFromNow = new Date(now.getTime() + CHECK_INTERVALS.ONE_DAY);
    const twoHoursFromNow = new Date(now.getTime() + CHECK_INTERVALS.TWO_HOURS);

    // Buscar prazos que expiram em 7 dias
    await this.notifyDeadlinesExpiringIn(
      sevenDaysFromNow,
      "prazo.expiring_7d",
      7,
      now,
    );

    // Buscar prazos que expiram em 3 dias
    await this.notifyDeadlinesExpiringIn(
      threeDaysFromNow,
      "prazo.expiring_3d",
      3,
      now,
    );

    // Buscar prazos que expiram em 1 dia
    await this.notifyDeadlinesExpiringIn(
      oneDayFromNow,
      "prazo.expiring_1d",
      1,
      now,
    );

    // Buscar prazos que expiram em 2 horas
    await this.notifyDeadlinesExpiringIn(
      twoHoursFromNow,
      "prazo.expiring_2h",
      0.083, // ~2 horas em dias
      now,
    );

    // Buscar prazos vencidos
    await this.notifyExpiredDeadlines(now);
  }

  /**
   * Notifica sobre prazos que expiram em uma data específica
   */
  private static async notifyDeadlinesExpiringIn(
    targetDate: Date,
    eventType: string,
    daysRemaining: number,
    now: Date,
  ): Promise<void> {
    // Criar range de ±30 minutos para evitar múltiplas notificações por pequenas diferenças
    const rangeStart = new Date(targetDate.getTime() - 30 * 60 * 1000);
    const rangeEnd = new Date(targetDate.getTime() + 30 * 60 * 1000);

    const expiringPrazos = await prisma.processoPrazo.findMany({
      where: {
        status: "ABERTO", // Apenas prazos ainda abertos
        dataVencimento: {
          gte: rangeStart,
          lte: rangeEnd,
        },
      },
      include: {
        processo: {
          select: {
            id: true,
            numero: true,
            tenantId: true,
            advogadoResponsavel: {
              select: {
                usuario: {
                  select: {
                    id: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    console.log(
      `[DeadlineScheduler] Encontrados ${expiringPrazos.length} prazos expirando em ${daysRemaining} dias`,
    );

    for (const prazo of expiringPrazos) {
      // Verificar se já notificamos este prazo neste intervalo
      const notificationKey = `prazo:${prazo.id}:${eventType}`;

      const targetUserIds = Array.from(
        new Set(
          [
            prazo.responsavelId ?? null,
            prazo.processo.advogadoResponsavel?.usuario?.id ?? null,
          ].filter((value): value is string => Boolean(value)),
        ),
      );

      if (targetUserIds.length === 0) {
        console.warn(
          `[DeadlineScheduler] Prazo ${prazo.id} sem responsável, ignorando`,
        );
        continue;
      }

      for (const targetUserId of targetUserIds) {
        const lastNotification = await this.getLastNotificationTime(
          prazo.tenantId,
          targetUserId,
          notificationKey,
        );

        // Se já notificamos nas últimas 23 horas, pular (evitar duplicatas)
        if (lastNotification) {
          const hoursSinceLastNotification =
            (now.getTime() - lastNotification.getTime()) / (60 * 60 * 1000);

          if (hoursSinceLastNotification < 23) {
            continue;
          }
        }

        try {
          const event = NotificationFactory.createEvent(
            eventType,
            prazo.tenantId,
            targetUserId,
            {
              prazoId: prazo.id,
              processoId: prazo.processo.id,
              processoNumero: prazo.processo.numero,
              numero: prazo.processo.numero,
              titulo: prazo.titulo,
              dataVencimento: prazo.dataVencimento.toISOString(),
              diasRestantes: daysRemaining,
              referenciaTipo: "prazo",
              referenciaId: prazo.id,
            },
          );

          await NotificationService.publishNotification(event);

          // Registrar que notificamos este prazo para o usuário alvo
          await this.recordNotificationTime(
            prazo.tenantId,
            targetUserId,
            notificationKey,
          );

          console.log(
            `[DeadlineScheduler] Notificação ${eventType} enviada para prazo ${prazo.id} (usuário ${targetUserId})`,
          );
        } catch (error) {
          console.error(
            `[DeadlineScheduler] Erro ao enviar notificação para prazo ${prazo.id} (usuário ${targetUserId}):`,
            error,
          );
        }
      }
    }
  }

  /**
   * Notifica sobre prazos já vencidos
   */
  private static async notifyExpiredDeadlines(now: Date): Promise<void> {
    // Buscar prazos que venceram nas últimas 24 horas (evitar notificações antigas)
    const expiredSince = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const expiredPrazos = await prisma.processoPrazo.findMany({
      where: {
        status: "ABERTO", // Apenas prazos ainda marcados como abertos (não tratados)
        dataVencimento: {
          lt: now, // Vencido
          gte: expiredSince, // Venceu nas últimas 24h
        },
      },
      include: {
        processo: {
          select: {
            id: true,
            numero: true,
            tenantId: true,
            advogadoResponsavel: {
              select: {
                usuario: {
                  select: {
                    id: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    console.log(
      `[DeadlineScheduler] Encontrados ${expiredPrazos.length} prazos vencidos`,
    );

    for (const prazo of expiredPrazos) {
      const targetUserIds = Array.from(
        new Set(
          [
            prazo.responsavelId ?? null,
            prazo.processo.advogadoResponsavel?.usuario?.id ?? null,
          ].filter((value): value is string => Boolean(value)),
        ),
      );

      if (targetUserIds.length === 0) {
        continue;
      }

      // Verificar se já notificamos este prazo como vencido
      const notificationKey = `prazo:${prazo.id}:prazo.expired`;

      const diasAtraso = Math.floor(
        (now.getTime() - prazo.dataVencimento.getTime()) /
          (24 * 60 * 60 * 1000),
      );

      for (const targetUserId of targetUserIds) {
        const lastNotification = await this.getLastNotificationTime(
          prazo.tenantId,
          targetUserId,
          notificationKey,
        );

        // Se já notificamos nas últimas 6 horas, pular
        if (lastNotification) {
          const hoursSinceLastNotification =
            (now.getTime() - lastNotification.getTime()) / (60 * 60 * 1000);

          if (hoursSinceLastNotification < 6) {
            continue;
          }
        }

        try {
          const event = NotificationFactory.createEvent(
            "prazo.expired",
            prazo.tenantId,
            targetUserId,
            {
              prazoId: prazo.id,
              processoId: prazo.processo.id,
              processoNumero: prazo.processo.numero,
              numero: prazo.processo.numero,
              titulo: prazo.titulo,
              dataVencimento: prazo.dataVencimento.toISOString(),
              diasAtraso,
              referenciaTipo: "prazo",
              referenciaId: prazo.id,
            },
          );

          await NotificationService.publishNotification(event);

          // Registrar que notificamos este prazo para o usuário alvo
          await this.recordNotificationTime(
            prazo.tenantId,
            targetUserId,
            notificationKey,
          );

          console.log(
            `[DeadlineScheduler] Notificação de prazo expirado enviada para ${prazo.id} (usuário ${targetUserId})`,
          );
        } catch (error) {
          console.error(
            `[DeadlineScheduler] Erro ao enviar notificação de prazo expirado ${prazo.id} (usuário ${targetUserId}):`,
            error,
          );
        }
      }
    }
  }

  /**
   * Verifica se já notificamos este prazo recentemente
   */
  private static async getLastNotificationTime(
    tenantId: string,
    userId: string,
    notificationKey: string,
  ): Promise<Date | null> {
    // Extrair prazoId do notificationKey (formato: "prazo:{prazoId}:{eventType}")
    const match = notificationKey.match(/^prazo:([^:]+):/);

    if (!match || !match[1]) {
      return null;
    }

    const prazoId = match[1];

    // Extrair eventType do notificationKey
    const eventType = notificationKey.split(":").pop();

    // Buscar última notificação deste tipo para este prazo
    const notifications = await prisma.notification.findMany({
      where: {
        tenantId,
        userId,
        type: eventType || undefined,
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Últimas 24h
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 50, // Limitar busca para performance
    });

    // Filtrar notificações que têm o prazoId correto no payload
    for (const notification of notifications) {
      const payload = notification.payload as Record<string, any>;

      if (payload?.prazoId === prazoId) {
        return notification.createdAt;
      }
    }

    return null;
  }

  /**
   * Registra timestamp da notificação (usado para evitar duplicatas)
   * Usa Redis para cache temporário com TTL de 24h
   */
  private static async recordNotificationTime(
    tenantId: string,
    userId: string,
    notificationKey: string,
  ): Promise<void> {
    try {
      const redis = getRedisInstance();

      const cacheKey = `notif:deadline:${tenantId}:${userId}:${notificationKey}`;

      // Armazenar timestamp atual com TTL de 24 horas
      await redis.set(cacheKey, Date.now().toString(), "EX", 24 * 60 * 60);
    } catch (error) {
      // Se Redis falhar, logar mas não bloquear
      console.warn(
        `[DeadlineScheduler] Erro ao registrar timestamp no Redis: ${error}`,
      );
      // Não propagar erro - a verificação via Prisma ainda funciona
    }
  }
}
