/**
 * Serviço de agendamento para lembretes de eventos
 * Executa periodicamente via cron job
 */

import { NotificationService } from "../notification-service";
import { NotificationFactory } from "../domain/notification-factory";

import prisma from "@/app/lib/prisma";

const REMINDER_CHECK_WINDOW_MS = 15 * 60 * 1000;

function resolveReminderType(minutesBefore: number) {
  if (minutesBefore === 1440) {
    return "evento.reminder_1d";
  }

  if (minutesBefore === 60) {
    return "evento.reminder_1h";
  }

  return "evento.reminder_custom";
}

function formatReminderLabel(minutesBefore: number) {
  if (minutesBefore >= 1440 && minutesBefore % 1440 === 0) {
    const days = minutesBefore / 1440;

    return days === 1 ? "1 dia antes" : `${days} dias antes`;
  }

  if (minutesBefore >= 60 && minutesBefore % 60 === 0) {
    const hours = minutesBefore / 60;

    return hours === 1 ? "1 hora antes" : `${hours} horas antes`;
  }

  return `${minutesBefore} minutos antes`;
}

function resolveEventReminderSchedule(evento: {
  lembreteMinutos: number | null;
  lembretesMinutos?: number[];
}) {
  const schedule = Array.from(
    new Set(
      ((evento.lembretesMinutos && evento.lembretesMinutos.length > 0
        ? evento.lembretesMinutos
        : evento.lembreteMinutos && evento.lembreteMinutos > 0
          ? [evento.lembreteMinutos]
          : []) as number[])
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0),
    ),
  ).sort((a, b) => b - a);

  return schedule;
}

export class EventReminderSchedulerService {
  /**
   * Verifica e envia lembretes de eventos conforme configurado em cada evento.
   */
  static async checkEventReminders(): Promise<void> {
    try {
      console.log(
        "[EventReminderScheduler] 🔍 Iniciando verificação de lembretes de eventos...",
      );

      const now = new Date();
      const maxReminderMinutes = 1440;
      const horizon = new Date(
        now.getTime() + maxReminderMinutes * 60 * 1000 + REMINDER_CHECK_WINDOW_MS,
      );

      const eventos = await prisma.evento.findMany({
        where: {
          dataInicio: {
            gte: now,
            lte: horizon,
          },
          status: {
            in: ["AGENDADO", "CONFIRMADO"],
          },
          OR: [
            {
              lembretesMinutos: {
                isEmpty: false,
              },
            },
            {
              lembreteMinutos: {
                gt: 0,
              },
            },
          ],
        },
        include: {
          processo: {
            select: {
              id: true,
              numero: true,
            },
          },
          cliente: {
            select: {
              id: true,
              nome: true,
              usuarioId: true,
            },
          },
          advogadoResponsavel: {
            include: {
              usuario: {
                select: {
                  id: true,
                },
              },
            },
          },
        },
      });

      console.log(
        `[EventReminderScheduler] 📋 Encontrados ${eventos.length} eventos com avisos configurados`,
      );

      let lembretesEnviados = 0;

      for (const evento of eventos) {
        const reminderSchedule = resolveEventReminderSchedule(evento);

        if (reminderSchedule.length === 0) {
          continue;
        }

        const recipients = await this.getEventRecipients(evento);

        if (recipients.length === 0) {
          continue;
        }

        for (const minutesBefore of reminderSchedule) {
          const scheduledAt = new Date(
            evento.dataInicio.getTime() - minutesBefore * 60 * 1000,
          );
          const scheduledWindowEnd = new Date(
            scheduledAt.getTime() + REMINDER_CHECK_WINDOW_MS,
          );

          if (scheduledAt > now || scheduledWindowEnd < now) {
            continue;
          }

          const notificationType = resolveReminderType(minutesBefore);
          const ultimaNotificacao = await prisma.notification.findFirst({
            where: {
              tenantId: evento.tenantId,
              type: notificationType,
              payload: {
                path: ["eventoId"],
                equals: evento.id,
              },
              ...(notificationType === "evento.reminder_custom"
                ? {
                    AND: [
                      {
                        payload: {
                          path: ["reminderMinutes"],
                          equals: minutesBefore,
                        },
                      },
                    ],
                  }
                : {}),
            },
            orderBy: {
              createdAt: "desc",
            },
          });

          if (
            ultimaNotificacao &&
            new Date(ultimaNotificacao.createdAt).getTime() >
              now.getTime() - REMINDER_CHECK_WINDOW_MS
          ) {
            continue;
          }

          for (const userId of recipients) {
            try {
              const event = NotificationFactory.createEvent(
                notificationType,
                evento.tenantId,
                userId,
                {
                  eventoId: evento.id,
                  titulo: evento.titulo,
                  dataInicio: evento.dataInicio.toISOString(),
                  local: evento.local ?? undefined,
                  isOnline: evento.isOnline,
                  linkAcesso: evento.linkAcesso ?? undefined,
                  processoId: evento.processoId ?? undefined,
                  processoNumero: evento.processo?.numero ?? undefined,
                  reminderMinutes: minutesBefore,
                  reminderLabel: formatReminderLabel(minutesBefore),
                  detailLines: evento.isOnline
                    ? [
                        "Evento online",
                        ...(evento.linkAcesso
                          ? [`Link: ${evento.linkAcesso}`]
                          : []),
                        `Aviso configurado para ${formatReminderLabel(minutesBefore)}`,
                      ]
                    : [`Aviso configurado para ${formatReminderLabel(minutesBefore)}`],
                },
              );

              await NotificationService.publishNotification(event);
              lembretesEnviados++;
            } catch (error) {
              console.error(
                `[EventReminderScheduler] Erro ao enviar lembrete ${minutesBefore}m para evento ${evento.id}:`,
                error,
              );
            }
          }
        }
      }

      console.log(
        `[EventReminderScheduler] ✅ Verificação concluída: ${lembretesEnviados} lembrete(s) enviados`,
      );
    } catch (error) {
      console.error(
        "[EventReminderScheduler] ❌ Erro ao verificar lembretes de eventos:",
        error,
      );
      throw error;
    }
  }

  /**
   * Obtém lista de destinatários para notificação de evento
   */
  private static async getEventRecipients(evento: any): Promise<string[]> {
    const recipients: string[] = [];

    // Admin do tenant
    const admin = await prisma.usuario.findFirst({
      where: {
        tenantId: evento.tenantId,
        role: "ADMIN",
        active: true,
      },
      select: { id: true },
    });

    if (admin) recipients.push(admin.id);

    // Advogado responsável
    if (evento.advogadoResponsavel?.usuario?.id) {
      recipients.push(evento.advogadoResponsavel.usuario.id);
    }

    // Cliente (se tiver usuário)
    if (evento.cliente?.usuarioId) {
      recipients.push(evento.cliente.usuarioId);
    }

    // Buscar usuários por email dos participantes
    if (evento.participantes && evento.participantes.length > 0) {
      const usuariosParticipantes = await prisma.usuario.findMany({
        where: {
          tenantId: evento.tenantId,
          email: {
            in: evento.participantes,
          },
          active: true,
        },
        select: { id: true },
      });

      usuariosParticipantes.forEach((u) => {
        if (u.id && !recipients.includes(u.id)) {
          recipients.push(u.id);
        }
      });
    }

    return Array.from(new Set(recipients)); // Remover duplicatas
  }
}
