import { NextRequest, NextResponse } from "next/server";

import {
  getRequestAuditMetadata,
  logOperationalEvent,
} from "@/app/lib/audit/operational-events";
import { EventReminderSchedulerService } from "@/app/lib/notifications/services/event-reminder-scheduler";

/**
 * Cron job para verificação e envio de lembretes de eventos
 * Executa a cada 15 minutos
 */
export async function GET(request: NextRequest) {
  const requestMeta = getRequestAuditMetadata(request);

  try {
    // Verificar se é uma chamada do Vercel Cron
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      await logOperationalEvent({
        category: "CRON",
        source: "VERCEL_CRON",
        action: "CRON_REJECTED",
        status: "WARNING",
        actorType: "CRON",
        route: requestMeta.route,
        ipAddress: requestMeta.ipAddress,
        userAgent: requestMeta.userAgent,
        message: "Cron de lembretes rejeitado por autorização inválida.",
      });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await logOperationalEvent({
      category: "CRON",
      source: "VERCEL_CRON",
      action: "CRON_STARTED",
      status: "INFO",
      actorType: "CRON",
      entityType: "SCHEDULE",
      entityId: "check-event-reminders",
      route: requestMeta.route,
      ipAddress: requestMeta.ipAddress,
      userAgent: requestMeta.userAgent,
      message: "Verificação de lembretes de eventos iniciada.",
    });

    console.log(
      "🕐 [EventReminderScheduler] Iniciando verificação de lembretes de eventos...",
    );

    await EventReminderSchedulerService.checkEventReminders();

    console.log(
      "✅ [EventReminderScheduler] Verificação de lembretes concluída com sucesso",
    );

    await logOperationalEvent({
      category: "CRON",
      source: "VERCEL_CRON",
      action: "CRON_SUCCEEDED",
      status: "SUCCESS",
      actorType: "CRON",
      entityType: "SCHEDULE",
      entityId: "check-event-reminders",
      route: requestMeta.route,
      ipAddress: requestMeta.ipAddress,
      userAgent: requestMeta.userAgent,
      message: "Verificação de lembretes concluída com sucesso.",
    });

    return NextResponse.json({
      success: true,
      message: "Verificação de lembretes de eventos concluída",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(
      "❌ [EventReminderScheduler] Erro na verificação de lembretes:",
      error,
    );

    await logOperationalEvent({
      category: "CRON",
      source: "VERCEL_CRON",
      action: "CRON_FAILED",
      status: "ERROR",
      actorType: "CRON",
      entityType: "SCHEDULE",
      entityId: "check-event-reminders",
      route: requestMeta.route,
      ipAddress: requestMeta.ipAddress,
      userAgent: requestMeta.userAgent,
      message:
        error instanceof Error ? error.message : "Falha na verificação de lembretes.",
    });

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
