import { after, NextRequest, NextResponse } from "next/server";

import {
  getRequestAuditMetadata,
  logOperationalEvent,
} from "@/app/lib/audit/operational-events";
import {
  processJusbrasilWebhookPayload,
  summarizeJusbrasilWebhookPayload,
} from "@/app/lib/juridical/jusbrasil-webhook-processor";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const metadata = getRequestAuditMetadata(request);

  await logOperationalEvent({
    category: "WEBHOOK",
    source: "JUSBRASIL",
    action: "WEBHOOK_HEALTHCHECK",
    status: "INFO",
    actorType: "WEBHOOK",
    route: metadata.route,
    ipAddress: metadata.ipAddress,
    userAgent: metadata.userAgent,
    message: "Endpoint de webhook Jusbrasil verificado via GET.",
  });

  return NextResponse.json({
    ok: true,
    provider: "jusbrasil",
    route: "/api/webhooks/jusbrasil",
  });
}

export async function POST(request: NextRequest) {
  const metadata = getRequestAuditMetadata(request);

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    await logOperationalEvent({
      category: "WEBHOOK",
      source: "JUSBRASIL",
      action: "WEBHOOK_INVALID_PAYLOAD",
      status: "WARNING",
      actorType: "WEBHOOK",
      route: metadata.route,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
      message: "Webhook Jusbrasil recebeu payload invalido.",
    });

    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const summary = summarizeJusbrasilWebhookPayload(payload);

  if (summary.batchCount === 0 && summary.processEventCount === 0) {
    await logOperationalEvent({
      category: "WEBHOOK",
      source: "JUSBRASIL",
      action: "WEBHOOK_RECEIVED",
      status: "INFO",
      actorType: "WEBHOOK",
      route: metadata.route,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
      message: "Webhook Jusbrasil recebido sem lotes processaveis.",
      payload: summary,
    });

    return NextResponse.json({
      ok: true,
      received: true,
      processedBatches: 0,
      processedEvents: 0,
      importedProcesses: 0,
      createdMovimentacoes: 0,
    });
  }
  await logOperationalEvent({
    category: "WEBHOOK",
    source: "JUSBRASIL",
    action: "WEBHOOK_QUEUED",
    status: "INFO",
    actorType: "WEBHOOK",
    route: metadata.route,
    ipAddress: metadata.ipAddress,
    userAgent: metadata.userAgent,
    message: "Webhook Jusbrasil recebido e enfileirado para processamento.",
    payload: summary,
  });

  try {
    after(async () => {
      try {
        await processJusbrasilWebhookPayload({
          payload,
          metadata,
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Falha inesperada ao processar webhook Jusbrasil em background.";

        await logOperationalEvent({
          category: "WEBHOOK",
          source: "JUSBRASIL",
          action: "WEBHOOK_PROCESSING_CRASHED",
          status: "ERROR",
          actorType: "WEBHOOK",
          route: metadata.route,
          ipAddress: metadata.ipAddress,
          userAgent: metadata.userAgent,
          message,
          payload: {
            ...summary,
            crash: true,
          },
        });
      }
    });

    return NextResponse.json({
      ok: true,
      received: true,
      queued: true,
      processedBatches: 0,
      processedEvents: 0,
      importedProcesses: 0,
      createdMovimentacoes: 0,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Falha ao enfileirar processamento do webhook Jusbrasil.";

    await logOperationalEvent({
      category: "WEBHOOK",
      source: "JUSBRASIL",
      action: "WEBHOOK_QUEUE_FAILED",
      status: "ERROR",
      actorType: "WEBHOOK",
      route: metadata.route,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
      message,
      payload: summary,
    });

    return NextResponse.json(
      {
        ok: false,
        received: true,
        queued: false,
        error: message,
      },
      { status: 500 },
    );
  }
}
