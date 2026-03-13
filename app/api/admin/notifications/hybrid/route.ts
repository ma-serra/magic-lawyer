import { NextRequest, NextResponse } from "next/server";

import { HybridNotificationService } from "@/app/lib/notifications/hybrid-notification-service";
import { NotificationEvent } from "@/app/lib/notifications/types";

export async function POST(request: NextRequest) {
  // Verificar se está em ambiente de desenvolvimento
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json(
      {
        success: false,
        error: "Endpoint disponível apenas em desenvolvimento",
      },
      { status: 403 },
    );
  }

  // Verificar token de admin interno
  const authHeader = request.headers.get("authorization");
  const expectedToken = process.env.INTERNAL_ADMIN_TOKEN;

  if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json(
      { success: false, error: "Token de autorização inválido" },
      { status: 401 },
    );
  }

  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case "publish_test":
        const event: NotificationEvent = {
          type: body.type || "test.hybrid",
          tenantId: body.tenantId || "test-tenant",
          userId: body.userId || "test-user",
          payload: body.payload || { message: "Teste do sistema híbrido" },
          urgency: body.urgency || "MEDIUM",
          channels: body.channels || ["REALTIME"],
        };

        await HybridNotificationService.publishNotification(event);

        return NextResponse.json({
          success: true,
          message: "Notificação publicada via sistema híbrido",
          data: {
            system: "NOVO_COM_REPLICACAO_LEGADA",
            event,
          },
        });

      case "get_status":
        return NextResponse.json({
          success: true,
          data: {
            useNewSystem: HybridNotificationService.isUsingNewSystem(),
            mode: "NOVO_COM_REPLICACAO_LEGADA",
          },
        });

      case "migrate":
        const result =
          await HybridNotificationService.migrateLegacyNotifications();

        return NextResponse.json({
          success: true,
          message: "Migração concluída",
          data: result,
        });

      default:
        return NextResponse.json(
          { success: false, error: "Ação não reconhecida" },
          { status: 400 },
        );
    }
  } catch (error) {
    console.error("Erro no sistema híbrido:", error);

    return NextResponse.json(
      { success: false, error: "Erro interno do servidor" },
      { status: 500 },
    );
  }
}
