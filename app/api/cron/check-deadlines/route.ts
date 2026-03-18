import { NextRequest, NextResponse } from "next/server";

import {
  getRequestAuditMetadata,
  logOperationalEvent,
} from "@/app/lib/audit/operational-events";
import { DeadlineSchedulerService } from "@/app/lib/notifications/services/deadline-scheduler";

/**
 * Cron job para verificação e notificação de prazos próximos do vencimento
 * Executa diariamente às 8:00 UTC (5:00 BRT)
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
        message: "Cron de prazos rejeitado por autorização inválida.",
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
      entityId: "check-deadlines",
      route: requestMeta.route,
      ipAddress: requestMeta.ipAddress,
      userAgent: requestMeta.userAgent,
      message: "Verificação de prazos iniciada.",
    });

    console.log("🕐 [DeadlineScheduler] Iniciando verificação de prazos...");

    await DeadlineSchedulerService.checkExpiringDeadlines();

    console.log(
      "✅ [DeadlineScheduler] Verificação de prazos concluída com sucesso",
    );

    await logOperationalEvent({
      category: "CRON",
      source: "VERCEL_CRON",
      action: "CRON_SUCCEEDED",
      status: "SUCCESS",
      actorType: "CRON",
      entityType: "SCHEDULE",
      entityId: "check-deadlines",
      route: requestMeta.route,
      ipAddress: requestMeta.ipAddress,
      userAgent: requestMeta.userAgent,
      message: "Verificação de prazos concluída com sucesso.",
    });

    return NextResponse.json({
      success: true,
      message: "Verificação de prazos concluída",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(
      "❌ [DeadlineScheduler] Erro na verificação de prazos:",
      error,
    );

    await logOperationalEvent({
      category: "CRON",
      source: "VERCEL_CRON",
      action: "CRON_FAILED",
      status: "ERROR",
      actorType: "CRON",
      entityType: "SCHEDULE",
      entityId: "check-deadlines",
      route: requestMeta.route,
      ipAddress: requestMeta.ipAddress,
      userAgent: requestMeta.userAgent,
      message:
        error instanceof Error ? error.message : "Falha na verificação de prazos.",
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
