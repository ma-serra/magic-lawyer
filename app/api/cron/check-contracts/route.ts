import { NextRequest, NextResponse } from "next/server";

import {
  getRequestAuditMetadata,
  logOperationalEvent,
} from "@/app/lib/audit/operational-events";
import { ContratoSchedulerService } from "@/app/lib/notifications/services/contrato-scheduler";

/**
 * Cron job para verificação e notificação de contratos expirados ou próximos do vencimento
 * Executa diariamente às 9:00 UTC (6:00 BRT)
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
        message: "Cron de contratos rejeitado por autorização inválida.",
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
      entityId: "check-contracts",
      route: requestMeta.route,
      ipAddress: requestMeta.ipAddress,
      userAgent: requestMeta.userAgent,
      message: "Verificação de contratos iniciada.",
    });

    console.log("🕐 [ContratoScheduler] Iniciando verificação de contratos...");

    await ContratoSchedulerService.checkExpiringContracts();

    console.log(
      "✅ [ContratoScheduler] Verificação de contratos concluída com sucesso",
    );

    await logOperationalEvent({
      category: "CRON",
      source: "VERCEL_CRON",
      action: "CRON_SUCCEEDED",
      status: "SUCCESS",
      actorType: "CRON",
      entityType: "SCHEDULE",
      entityId: "check-contracts",
      route: requestMeta.route,
      ipAddress: requestMeta.ipAddress,
      userAgent: requestMeta.userAgent,
      message: "Verificação de contratos concluída com sucesso.",
    });

    return NextResponse.json({
      success: true,
      message: "Verificação de contratos concluída",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(
      "❌ [ContratoScheduler] Erro na verificação de contratos:",
      error,
    );

    await logOperationalEvent({
      category: "CRON",
      source: "VERCEL_CRON",
      action: "CRON_FAILED",
      status: "ERROR",
      actorType: "CRON",
      entityType: "SCHEDULE",
      entityId: "check-contracts",
      route: requestMeta.route,
      ipAddress: requestMeta.ipAddress,
      userAgent: requestMeta.userAgent,
      message:
        error instanceof Error ? error.message : "Falha na verificação de contratos.",
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
