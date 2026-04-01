import { NextRequest, NextResponse } from "next/server";

import {
  getRequestAuditMetadata,
  logOperationalEvent,
} from "@/app/lib/audit/operational-events";
import { AuthorityProfilePendencySchedulerService } from "@/app/lib/notifications/services/authority-profile-pendency-scheduler";

export async function GET(request: NextRequest) {
  const requestMeta = getRequestAuditMetadata(request);

  try {
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
        message:
          "Cron de pendencias de autoridades rejeitado por autorizacao invalida.",
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
      entityId: "check-authority-profile-pendencies",
      route: requestMeta.route,
      ipAddress: requestMeta.ipAddress,
      userAgent: requestMeta.userAgent,
      message: "Verificacao de pendencias de autoridades iniciada.",
    });

    const summary =
      await AuthorityProfilePendencySchedulerService.checkAuthorityPendencies();

    await logOperationalEvent({
      category: "CRON",
      source: "VERCEL_CRON",
      action: "CRON_SUCCEEDED",
      status: "SUCCESS",
      actorType: "CRON",
      entityType: "SCHEDULE",
      entityId: "check-authority-profile-pendencies",
      route: requestMeta.route,
      ipAddress: requestMeta.ipAddress,
      userAgent: requestMeta.userAgent,
      message: `Pendencias de autoridades verificadas. Tenants: ${summary.tenants}, checadas: ${summary.checked}, criadas: ${summary.created}, lembradas: ${summary.reminded}.`,
    });

    return NextResponse.json({
      success: true,
      message: "Pendencias de autoridades verificadas com sucesso",
      summary,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    await logOperationalEvent({
      category: "CRON",
      source: "VERCEL_CRON",
      action: "CRON_FAILED",
      status: "ERROR",
      actorType: "CRON",
      entityType: "SCHEDULE",
      entityId: "check-authority-profile-pendencies",
      route: requestMeta.route,
      ipAddress: requestMeta.ipAddress,
      userAgent: requestMeta.userAgent,
      message:
        error instanceof Error
          ? error.message
          : "Falha na verificacao de pendencias de autoridades.",
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
