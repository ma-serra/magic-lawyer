import { NextRequest, NextResponse } from "next/server";

import {
  getRequestAuditMetadata,
  logOperationalEvent,
} from "@/app/lib/audit/operational-events";
import { DocumentSchedulerService } from "@/app/lib/notifications/services/document-scheduler";

/**
 * Cron job para verificação e notificação de documentos expirados
 * Executa diariamente às 10:00 UTC (7:00 BRT)
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
        message: "Cron de documentos rejeitado por autorização inválida.",
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
      entityId: "check-documents",
      route: requestMeta.route,
      ipAddress: requestMeta.ipAddress,
      userAgent: requestMeta.userAgent,
      message: "Verificação de documentos iniciada.",
    });

    console.log(
      "🕐 [DocumentScheduler] Iniciando verificação de documentos expirados...",
    );

    await DocumentSchedulerService.checkExpiredDocuments();

    console.log(
      "✅ [DocumentScheduler] Verificação de documentos concluída com sucesso",
    );

    await logOperationalEvent({
      category: "CRON",
      source: "VERCEL_CRON",
      action: "CRON_SUCCEEDED",
      status: "SUCCESS",
      actorType: "CRON",
      entityType: "SCHEDULE",
      entityId: "check-documents",
      route: requestMeta.route,
      ipAddress: requestMeta.ipAddress,
      userAgent: requestMeta.userAgent,
      message: "Verificação de documentos concluída com sucesso.",
    });

    return NextResponse.json({
      success: true,
      message: "Verificação de documentos concluída",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(
      "❌ [DocumentScheduler] Erro na verificação de documentos:",
      error,
    );

    await logOperationalEvent({
      category: "CRON",
      source: "VERCEL_CRON",
      action: "CRON_FAILED",
      status: "ERROR",
      actorType: "CRON",
      entityType: "SCHEDULE",
      entityId: "check-documents",
      route: requestMeta.route,
      ipAddress: requestMeta.ipAddress,
      userAgent: requestMeta.userAgent,
      message:
        error instanceof Error ? error.message : "Falha na verificação de documentos.",
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
