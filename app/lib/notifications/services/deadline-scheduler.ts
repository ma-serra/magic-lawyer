/**
 * Serviço de agendamento de notificações de prazos
 * Executa verificações periódicas de prazos próximos do vencimento
 */

import { NotificationService } from "../notification-service";
import { buildDeadlineDigestPayload } from "../deadline-digests";
import {
  getDeadlineNotificationFront,
  getDeadlineNotificationFrontLabel,
} from "../deadline-fronts";
import {
  getMutedDeadlineProcessPreferenceIndex,
} from "../deadline-process-preferences";
import { isDeadlineProcessMuted } from "../deadline-process-preference-keys";
import { NotificationFactory } from "../domain/notification-factory";
import { getRedisInstance } from "../redis-singleton";
import { extractLawyerUserIdsFromProcessScope } from "@/app/lib/juridical/process-movement-sync";

import prisma from "@/app/lib/prisma";

/**
 * Intervals em milissegundos para verificação de prazos
 */
const CHECK_INTERVALS = {
  THIRTY_DAYS: 30 * 24 * 60 * 60 * 1000, // 30 dias
  TEN_DAYS: 10 * 24 * 60 * 60 * 1000, // 10 dias
  SEVEN_DAYS: 7 * 24 * 60 * 60 * 1000, // 7 dias
  THREE_DAYS: 3 * 24 * 60 * 60 * 1000, // 3 dias
  ONE_DAY: 1 * 24 * 60 * 60 * 1000, // 1 dia
  TWO_HOURS: 2 * 60 * 60 * 1000, // 2 horas
};

function resolveDeadlineTargetUserIds(
  prazo: {
    tenantId: string;
    responsavel?: {
      id: string;
      active: boolean;
    } | null;
    processo: {
      advogadoResponsavel?: {
        usuario?: {
          id: string;
          active: boolean;
        } | null;
      } | null;
      partes?: Array<{
        advogado?: {
          usuario?: {
            id: string;
            active: boolean;
          } | null;
        } | null;
      }>;
      procuracoesVinculadas?: Array<{
        procuracao?: {
          outorgados?: Array<{
            advogado?: {
              usuario?: {
                id: string;
                active: boolean;
              } | null;
            } | null;
          }>;
        } | null;
      }>;
    };
  },
) {
  const ids = new Set<string>(
    extractLawyerUserIdsFromProcessScope(prazo.processo),
  );

  if (prazo.responsavel?.id && prazo.responsavel.active !== false) {
    ids.add(prazo.responsavel.id);
  }

  return Array.from(ids);
}

async function buildMutedDeadlineIndex(
  candidates: Array<{
    tenantId: string;
    userId: string;
    processoId: string;
  }>,
) {
  return getMutedDeadlineProcessPreferenceIndex({
    tenantIds: Array.from(new Set(candidates.map((item) => item.tenantId))),
    userIds: Array.from(new Set(candidates.map((item) => item.userId))),
    processoIds: Array.from(new Set(candidates.map((item) => item.processoId))),
  });
}

export class DeadlineSchedulerService {
  /**
   * Verifica e dispara notificações para prazos próximos do vencimento
   * Deve ser executado via cron job periódico
   */
  static async checkExpiringDeadlines(): Promise<void> {
    const now = new Date();

    // Calcular datas de alerta
    const thirtyDaysFromNow = new Date(
      now.getTime() + CHECK_INTERVALS.THIRTY_DAYS,
    );
    const tenDaysFromNow = new Date(
      now.getTime() + CHECK_INTERVALS.TEN_DAYS,
    );
    const sevenDaysFromNow = new Date(
      now.getTime() + CHECK_INTERVALS.SEVEN_DAYS,
    );
    const threeDaysFromNow = new Date(
      now.getTime() + CHECK_INTERVALS.THREE_DAYS,
    );
    const oneDayFromNow = new Date(now.getTime() + CHECK_INTERVALS.ONE_DAY);
    const twoHoursFromNow = new Date(now.getTime() + CHECK_INTERVALS.TWO_HOURS);

    // Horizonte gerencial em lista
    await this.notifyDeadlineDigestForDay(
      thirtyDaysFromNow,
      "prazo.digest_30d",
      30,
      now,
    );

    await this.notifyDeadlineDigestForDay(
      tenDaysFromNow,
      "prazo.digest_10d",
      10,
      now,
    );

    await this.notifyDeadlinesExpiringIn(
      sevenDaysFromNow,
      "prazo.expiring_7d",
      7,
      now,
    );

    await this.notifyDeadlinesExpiringIn(
      threeDaysFromNow,
      "prazo.expiring_3d",
      3,
      now,
    );

    // Alertas críticos individuais
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

  private static async notifyDeadlineDigestForDay(
    targetDate: Date,
    eventType: "prazo.digest_30d" | "prazo.digest_10d",
    daysRemaining: number,
    now: Date,
  ): Promise<void> {
    const rangeStart = new Date(targetDate);
    rangeStart.setHours(0, 0, 0, 0);

    const rangeEnd = new Date(targetDate);
    rangeEnd.setHours(23, 59, 59, 999);

    const digestDate = rangeStart.toISOString().slice(0, 10);
    const deadlineFront = getDeadlineNotificationFront(eventType);
    const deadlineFrontLabel = getDeadlineNotificationFrontLabel(deadlineFront);

    const expiringPrazos = await prisma.processoPrazo.findMany({
      where: {
        status: "ABERTO",
        dataVencimento: {
          gte: rangeStart,
          lte: rangeEnd,
        },
      },
      include: {
        responsavel: {
          select: {
            id: true,
            active: true,
          },
        },
        processo: {
          select: {
            id: true,
            numero: true,
            tenantId: true,
            cliente: {
              select: {
                nome: true,
              },
            },
            advogadoResponsavel: {
              select: {
                usuario: {
                  select: {
                    id: true,
                    active: true,
                  },
                },
              },
            },
            partes: {
              where: {
                advogadoId: {
                  not: null,
                },
              },
              select: {
                advogado: {
                  select: {
                    usuario: {
                      select: {
                        id: true,
                        active: true,
                      },
                    },
                  },
                },
              },
            },
            procuracoesVinculadas: {
              select: {
                procuracao: {
                  select: {
                    outorgados: {
                      select: {
                        advogado: {
                          select: {
                            usuario: {
                              select: {
                                id: true,
                                active: true,
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    const grouped = new Map<
      string,
      {
        tenantId: string;
        userId: string;
        items: Array<{
          prazoId: string;
          processoId: string;
          processoNumero: string;
          clienteNome: string | null;
          titulo: string | null;
          dataVencimento: string;
        }>;
      }
    >();

    const recipientCandidates = expiringPrazos.flatMap((prazo) =>
      resolveDeadlineTargetUserIds(prazo).map((userId) => ({
        tenantId: prazo.tenantId,
        userId,
        processoId: prazo.processo.id,
      })),
    );
    const mutedProcessIndex = await buildMutedDeadlineIndex(recipientCandidates);

    for (const prazo of expiringPrazos) {
      const targetUserIds = resolveDeadlineTargetUserIds(prazo);

      for (const userId of targetUserIds) {
        if (
          isDeadlineProcessMuted(mutedProcessIndex, {
            tenantId: prazo.tenantId,
            userId,
            processoId: prazo.processo.id,
          })
        ) {
          continue;
        }

        const groupKey = `${prazo.tenantId}:${userId}`;
        const entry = grouped.get(groupKey) ?? {
          tenantId: prazo.tenantId,
          userId,
          items: [],
        };

        entry.items.push({
          prazoId: prazo.id,
          processoId: prazo.processo.id,
          processoNumero: prazo.processo.numero,
          clienteNome: prazo.processo.cliente.nome,
          titulo: prazo.titulo,
          dataVencimento: prazo.dataVencimento.toISOString(),
        });

        grouped.set(groupKey, entry);
      }
    }

    console.log(
      `[DeadlineScheduler] Encontrados ${expiringPrazos.length} prazos para digest ${daysRemaining}d (${grouped.size} destinatário(s))`,
    );

    for (const group of grouped.values()) {
      const payload = buildDeadlineDigestPayload({
        daysRemaining,
        digestDate,
        items: group.items,
      });
      payload.frentePrazo = deadlineFront;
      payload.frentePrazoLabel = deadlineFrontLabel;

      const alreadyNotified = await this.hasRecentDigestNotification(
        group.tenantId,
        group.userId,
        eventType,
        payload.digestKey,
        now,
      );

      if (alreadyNotified) {
        continue;
      }

      try {
        const event = NotificationFactory.createEvent(
          eventType,
          group.tenantId,
          group.userId,
          payload,
          {
            urgency: daysRemaining <= 10 ? "HIGH" : "MEDIUM",
            channels: ["REALTIME", "EMAIL", "TELEGRAM"],
          },
        );

        await NotificationService.publishNotification(event);
        await this.recordDigestNotificationTime(
          group.tenantId,
          group.userId,
          payload.digestKey,
        );

        console.log(
          `[DeadlineScheduler] Digest ${eventType} enviado para ${group.userId} com ${payload.totalPrazos} prazo(s)`,
        );
      } catch (error) {
        console.error(
          `[DeadlineScheduler] Erro ao enviar digest ${eventType} para ${group.userId}:`,
          error,
        );
      }
    }
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
        responsavel: {
          select: {
            id: true,
            active: true,
          },
        },
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
                    active: true,
                  },
                },
              },
            },
            partes: {
              where: {
                advogadoId: {
                  not: null,
                },
              },
              select: {
                advogado: {
                  select: {
                    usuario: {
                      select: {
                        id: true,
                        active: true,
                      },
                    },
                  },
                },
              },
            },
            procuracoesVinculadas: {
              select: {
                procuracao: {
                  select: {
                    outorgados: {
                      select: {
                        advogado: {
                          select: {
                            usuario: {
                              select: {
                                id: true,
                                active: true,
                              },
                            },
                          },
                        },
                      },
                    },
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

    const recipientCandidates = expiringPrazos.flatMap((prazo) =>
      resolveDeadlineTargetUserIds(prazo).map((userId) => ({
        tenantId: prazo.tenantId,
        userId,
        processoId: prazo.processo.id,
      })),
    );
    const mutedProcessIndex = await buildMutedDeadlineIndex(recipientCandidates);
    const deadlineFront = getDeadlineNotificationFront(eventType);
    const deadlineFrontLabel = getDeadlineNotificationFrontLabel(deadlineFront);

    for (const prazo of expiringPrazos) {
      // Verificar se já notificamos este prazo neste intervalo
      const notificationKey = `prazo:${prazo.id}:${eventType}`;

      const targetUserIds = resolveDeadlineTargetUserIds(prazo);

      if (targetUserIds.length === 0) {
        console.warn(
          `[DeadlineScheduler] Prazo ${prazo.id} sem responsável, ignorando`,
        );
        continue;
      }

      for (const targetUserId of targetUserIds) {
        if (
          isDeadlineProcessMuted(mutedProcessIndex, {
            tenantId: prazo.tenantId,
            userId: targetUserId,
            processoId: prazo.processo.id,
          })
        ) {
          continue;
        }

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
              frentePrazo: deadlineFront,
              frentePrazoLabel: deadlineFrontLabel,
              referenciaTipo: "prazo",
              referenciaId: prazo.id,
            },
            {
              channels: ["REALTIME", "EMAIL", "TELEGRAM"],
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
        responsavel: {
          select: {
            id: true,
            active: true,
          },
        },
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
                    active: true,
                  },
                },
              },
            },
            partes: {
              where: {
                advogadoId: {
                  not: null,
                },
              },
              select: {
                advogado: {
                  select: {
                    usuario: {
                      select: {
                        id: true,
                        active: true,
                      },
                    },
                  },
                },
              },
            },
            procuracoesVinculadas: {
              select: {
                procuracao: {
                  select: {
                    outorgados: {
                      select: {
                        advogado: {
                          select: {
                            usuario: {
                              select: {
                                id: true,
                                active: true,
                              },
                            },
                          },
                        },
                      },
                    },
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

    const recipientCandidates = expiredPrazos.flatMap((prazo) =>
      resolveDeadlineTargetUserIds(prazo).map((userId) => ({
        tenantId: prazo.tenantId,
        userId,
        processoId: prazo.processo.id,
      })),
    );
    const mutedProcessIndex = await buildMutedDeadlineIndex(recipientCandidates);
    const deadlineFront = getDeadlineNotificationFront("prazo.expired");
    const deadlineFrontLabel = getDeadlineNotificationFrontLabel(deadlineFront);

    for (const prazo of expiredPrazos) {
      const targetUserIds = resolveDeadlineTargetUserIds(prazo);

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
        if (
          isDeadlineProcessMuted(mutedProcessIndex, {
            tenantId: prazo.tenantId,
            userId: targetUserId,
            processoId: prazo.processo.id,
          })
        ) {
          continue;
        }

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
              frentePrazo: deadlineFront,
              frentePrazoLabel: deadlineFrontLabel,
              referenciaTipo: "prazo",
              referenciaId: prazo.id,
            },
            {
              channels: ["REALTIME", "EMAIL", "TELEGRAM"],
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

  private static getDigestCacheKey(
    tenantId: string,
    userId: string,
    digestKey: string,
  ) {
    return `notif:deadline-digest:${tenantId}:${userId}:${digestKey}`;
  }

  private static async hasRecentDigestNotification(
    tenantId: string,
    userId: string,
    eventType: string,
    digestKey: string,
    now: Date,
  ) {
    try {
      const redis = getRedisInstance();
      const cached = await redis.get(
        this.getDigestCacheKey(tenantId, userId, digestKey),
      );

      if (cached) {
        return true;
      }
    } catch {
      // fallback para consulta no banco
    }

    const notifications = await prisma.notification.findMany({
      where: {
        tenantId,
        userId,
        type: eventType,
        createdAt: {
          gte: new Date(now.getTime() - 36 * 60 * 60 * 1000),
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 20,
    });

    return notifications.some((notification) => {
      const payload =
        notification.payload &&
        typeof notification.payload === "object" &&
        !Array.isArray(notification.payload)
          ? (notification.payload as Record<string, unknown>)
          : null;

      return payload?.digestKey === digestKey;
    });
  }

  private static async recordDigestNotificationTime(
    tenantId: string,
    userId: string,
    digestKey: string,
  ) {
    try {
      const redis = getRedisInstance();

      await redis.set(
        this.getDigestCacheKey(tenantId, userId, digestKey),
        Date.now().toString(),
        "EX",
        36 * 60 * 60,
      );
    } catch (error) {
      console.warn(
        `[DeadlineScheduler] Erro ao registrar digest de prazo no Redis: ${error}`,
      );
    }
  }
}
