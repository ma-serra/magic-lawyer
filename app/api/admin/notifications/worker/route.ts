import { NextRequest, NextResponse } from "next/server";

/**
 * Mantido por compatibilidade: não existe mais worker manual para iniciar.
 */
export async function POST(request: NextRequest) {
  return NextResponse.json({
    success: true,
    message: "Nenhum worker manual é necessário. A Vercel gerencia esse fluxo.",
  });
}

/**
 * Mantido por compatibilidade: não existe mais worker manual para parar.
 */
export async function DELETE(request: NextRequest) {
  return NextResponse.json({
    success: true,
    message: "Nenhum worker manual está em execução.",
  });
}

/**
 * Obtém status do processamento assíncrono após migração para Vercel.
 */
export async function GET(request: NextRequest) {
  return NextResponse.json({
    success: true,
    data: {
      worker: null,
      queue: null,
      status: "managed_by_vercel",
      provider: "workflow",
      requiresWorker: false,
    },
  });
}
