import { NextRequest, NextResponse } from "next/server";

import {
  getRequestAuditMetadata,
  logOperationalEvent,
} from "@/app/lib/audit/operational-events";
import { processTelegramWebhookUpdate } from "@/app/lib/notifications/telegram-bot";

export const dynamic = "force-dynamic";

function validateSecretToken(request: NextRequest) {
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!expectedSecret) {
    return true;
  }

  const providedSecret =
    request.headers.get("x-telegram-bot-api-secret-token")?.trim() || "";

  return providedSecret.length > 0 && providedSecret === expectedSecret;
}

export async function POST(request: NextRequest) {
  const metadata = getRequestAuditMetadata(request);

  if (!validateSecretToken(request)) {
    await logOperationalEvent({
      category: "WEBHOOK",
      source: "TELEGRAM_WEBHOOK",
      action: "WEBHOOK_RECEIVED",
      status: "WARNING",
      route: metadata.route,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
      message: "Webhook Telegram rejeitado por token secreto inválido.",
    });

    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    await logOperationalEvent({
      category: "WEBHOOK",
      source: "TELEGRAM_WEBHOOK",
      action: "WEBHOOK_RECEIVED",
      status: "WARNING",
      route: metadata.route,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
      message: "Webhook Telegram recebeu payload inválido.",
    });

    return NextResponse.json({ ok: false }, { status: 400 });
  }

  try {
    await processTelegramWebhookUpdate(payload as any);

    await logOperationalEvent({
      category: "WEBHOOK",
      source: "TELEGRAM_WEBHOOK",
      action: "WEBHOOK_PROCESSED",
      status: "SUCCESS",
      route: metadata.route,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
      message: "Webhook Telegram processado com sucesso.",
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    await logOperationalEvent({
      category: "WEBHOOK",
      source: "TELEGRAM_WEBHOOK",
      action: "WEBHOOK_PROCESSED",
      status: "ERROR",
      route: metadata.route,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
      message: "Erro ao processar webhook Telegram.",
      payload: {
        error: error instanceof Error ? error.message : "Erro desconhecido",
      },
    });

    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
