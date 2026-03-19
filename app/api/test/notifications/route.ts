/**
 * Endpoint de teste para notificações (apenas desenvolvimento)
 * GET /api/test/notifications?type=processo.created&tenantId=xxx&userId=xxx
 */

import { NextRequest, NextResponse } from "next/server";

import { NotificationFactory } from "@/app/lib/notifications/domain/notification-factory";
import { NotificationService } from "@/app/lib/notifications/notification-service";

export async function GET(request: NextRequest) {
  // Apenas em desenvolvimento
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Not available in production" },
      { status: 403 },
    );
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "processo.created";
  const tenantId = searchParams.get("tenantId");
  const userId = searchParams.get("userId");

  if (!tenantId || !userId) {
    return NextResponse.json(
      {
        error: "Missing required parameters",
        required: ["tenantId", "userId"],
        optional: ["type"],
      },
      { status: 400 },
    );
  }

  try {
    // Payload de teste baseado no tipo
    const testPayloads: Record<string, Record<string, any>> = {
      "processo.created": {
        processoId: "test-proc-123",
        numero: "1234567-89.2024.8.05.0001",
        clienteNome: "Teste Cliente",
      },
      "processo.updated": {
        processoId: "test-proc-123",
        numero: "1234567-89.2024.8.05.0001",
        clienteNome: "Teste Cliente",
        processoTitulo: "Ação de obrigação de fazer",
        changesSummary: "Status, vara e valor da causa atualizados",
        sourceLabel: "Alteração manual no cadastro do processo",
        sourceKind: "MANUAL",
        actorName: "Robson Nonato",
        detailLines: [
          "Status: Em andamento → Suspenso",
          "Vara: 2ª Vara Cível → 3ª Vara Cível",
          "Valor da causa: R$ 8.000,00 → R$ 12.500,00",
        ],
      },
      "prazo.expiring_7d": {
        prazoId: "test-prazo-123",
        processoId: "test-proc-123",
        processoNumero: "1234567-89.2024.8.05.0001",
        titulo: "Prazo de Teste",
        dataVencimento: new Date(
          Date.now() + 7 * 24 * 60 * 60 * 1000,
        ).toISOString(),
      },
      "prazo.digest_30d": {
        diasRestantes: 30,
        digestDate: new Date(
          Date.now() + 30 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        digestKey: "prazo.digest_30d:test",
        totalPrazos: 2,
        resumoPrazos:
          "• Cliente Teste - Processo 1234567-89.2024.8.05.0001 - Prazo final 17/04/2026\n• Cliente XPTO - Processo 9876543-21.2024.8.05.0001 - Prazo final 17/04/2026",
      },
      "prazo.digest_10d": {
        diasRestantes: 10,
        digestDate: new Date(
          Date.now() + 10 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        digestKey: "prazo.digest_10d:test",
        totalPrazos: 2,
        resumoPrazos:
          "• Cliente Teste - Processo 1234567-89.2024.8.05.0001 - Prazo final 28/03/2026\n• Cliente XPTO - Processo 9876543-21.2024.8.05.0001 - Prazo final 28/03/2026",
      },
      "pagamento.paid": {
        pagamentoId: "test-pay-123",
        valor: 100.0,
        metodo: "BOLETO",
        dataPagamento: new Date().toISOString(),
      },
      "evento.created": {
        eventoId: "test-evento-123",
        titulo: "Evento de Teste",
        dataInicio: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      },
    };

    const payload = testPayloads[type] || {
      teste: true,
      tipo: type,
      timestamp: new Date().toISOString(),
    };

    // Criar evento via Factory
    const event = NotificationFactory.createEvent(
      type,
      tenantId,
      userId,
      payload,
    );

    // Publicar notificação
    await NotificationService.publishNotification(event);

    return NextResponse.json({
      success: true,
      message: "Notificação de teste enviada",
      event: {
        type: event.type,
        urgency: event.urgency,
        channels: event.channels,
        payload: event.payload,
      },
    });
  } catch (error) {
    console.error("[TestNotifications] Erro:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro desconhecido",
      },
      { status: 500 },
    );
  }
}
