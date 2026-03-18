import { NextRequest, NextResponse } from "next/server";

import { cleanupOrphanedDocuments } from "@/app/actions/documentos-procuracao";
import {
  getRequestAuditMetadata,
  logOperationalEvent,
} from "@/app/lib/audit/operational-events";

/**
 * Cron job para limpeza automática de documentos órfãos
 * Executa diariamente às 2:00 UTC
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
        message: "Cron de limpeza de documentos rejeitado por autorização inválida.",
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
      entityId: "cleanup-documents",
      route: requestMeta.route,
      ipAddress: requestMeta.ipAddress,
      userAgent: requestMeta.userAgent,
      message: "Limpeza de documentos iniciada.",
    });

    console.log("🕐 Iniciando cron job de limpeza de documentos...");

    const result = await cleanupOrphanedDocuments();

    if (result.success) {
      console.log("✅ Cron job concluído com sucesso:", result);

      await logOperationalEvent({
        category: "CRON",
        source: "VERCEL_CRON",
        action: "CRON_SUCCEEDED",
        status: "SUCCESS",
        actorType: "CRON",
        entityType: "SCHEDULE",
        entityId: "cleanup-documents",
        route: requestMeta.route,
        ipAddress: requestMeta.ipAddress,
        userAgent: requestMeta.userAgent,
        message: "Limpeza de documentos concluída com sucesso.",
        payload: result,
      });

      return NextResponse.json({
        success: true,
        message: "Limpeza de documentos concluída",
        data: result,
      });
    } else {
      const errorMessage =
        "error" in result ? result.error : "Erro desconhecido";

      console.error("❌ Cron job falhou:", errorMessage);

      await logOperationalEvent({
        category: "CRON",
        source: "VERCEL_CRON",
        action: "CRON_FAILED",
        status: "ERROR",
        actorType: "CRON",
        entityType: "SCHEDULE",
        entityId: "cleanup-documents",
        route: requestMeta.route,
        ipAddress: requestMeta.ipAddress,
        userAgent: requestMeta.userAgent,
        message: errorMessage,
      });

      return NextResponse.json(
        {
          success: false,
          error: errorMessage,
        },
        { status: 500 },
      );
    }
  } catch (error) {
    console.error("❌ Erro no cron job de limpeza:", error);

    await logOperationalEvent({
      category: "CRON",
      source: "VERCEL_CRON",
      action: "CRON_FAILED",
      status: "ERROR",
      actorType: "CRON",
      entityType: "SCHEDULE",
      entityId: "cleanup-documents",
      route: requestMeta.route,
      ipAddress: requestMeta.ipAddress,
      userAgent: requestMeta.userAgent,
      message:
        error instanceof Error ? error.message : "Falha na limpeza de documentos.",
    });

    return NextResponse.json(
      {
        success: false,
        error: "Erro interno do servidor",
      },
      { status: 500 },
    );
  }
}
