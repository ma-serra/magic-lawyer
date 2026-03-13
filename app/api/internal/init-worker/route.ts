/**
 * Endpoint interno de compatibilidade.
 * O app não precisa mais subir workers locais.
 */

import { NextResponse } from "next/server";

import { initNotificationWorker } from "@/app/lib/notifications/init-worker";

/**
 * GET /api/internal/init-worker
 * Mantém compatibilidade com checks antigos, sem iniciar processos locais.
 */
export async function GET() {
  try {
    await initNotificationWorker();

    return NextResponse.json({
      success: true,
      message: "Processamento assíncrono é gerenciado pela Vercel.",
    });
  } catch (error) {
    console.error("[InitWorker] Erro:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro desconhecido",
      },
      { status: 500 },
    );
  }
}








