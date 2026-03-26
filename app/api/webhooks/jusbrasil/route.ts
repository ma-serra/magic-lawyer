import { NextRequest, NextResponse } from "next/server";

import {
  getRequestAuditMetadata,
  logOperationalEvent,
} from "@/app/lib/audit/operational-events";
import {
  processJusbrasilWebhookImport,
  type JusbrasilWebhookImportJobInput,
} from "@/app/lib/juridical/jusbrasil-webhook-import-step";
import { resolveJusbrasilSyncBinding } from "@/app/lib/juridical/jusbrasil-oab-sync";
import { extractJusbrasilWebhookBatches } from "@/lib/api/juridical/jusbrasil-webhook-normalizer";

export const dynamic = "force-dynamic";

type BatchImportSummary = {
  correlationId: string;
  syncedCount: number;
  createdCount: number;
  updatedCount: number;
  processNumbers: string[];
};

function summarizePayload(payload: unknown) {
  const batches = extractJusbrasilWebhookBatches(payload);

  if (batches.length === 0) {
    return {
      payloadType: Array.isArray(payload) ? "array" : typeof payload,
      batchCount: 0,
      processCount: 0,
      correlationIds: [],
    };
  }

  return {
    payloadType: Array.isArray(payload) ? "array" : "object",
    batchCount: batches.length,
    processCount: batches.reduce(
      (total, batch) => total + batch.processos.length,
      0,
    ),
    correlationIds: batches.map((batch) => batch.correlationId).slice(0, 10),
  };
}

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

  const summary = summarizePayload(payload);
  const batches = extractJusbrasilWebhookBatches(payload);

  if (batches.length === 0) {
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
      importedProcesses: 0,
    });
  }

  const imported: BatchImportSummary[] = [];
  const failures: Array<{ correlationId: string; error: string }> = [];
  let unboundBatches = 0;

  for (const batch of batches) {
    const binding = await resolveJusbrasilSyncBinding(batch.correlationId);

    if (!binding) {
      unboundBatches += 1;

      await logOperationalEvent({
        category: "WEBHOOK",
        source: "JUSBRASIL",
        action: "WEBHOOK_UNBOUND_BATCH",
        status: "WARNING",
        actorType: "WEBHOOK",
        entityType: "JUSBRASIL_CORRELATION",
        entityId: batch.correlationId,
        route: metadata.route,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        message:
          "Webhook Jusbrasil recebido sem vinculo local para correlation_id.",
        payload: {
          correlationId: batch.correlationId,
          processCount: batch.processos.length,
        },
      });

      continue;
    }

    const job: JusbrasilWebhookImportJobInput = {
      correlationId: batch.correlationId,
      tenantId: binding.tenantId,
      usuarioId: binding.usuarioId,
      advogadoId: binding.advogadoId,
      clienteNome: binding.clienteNome,
      syncId: binding.syncId,
      tribunalSigla: binding.tribunalSigla,
      oab: binding.oab,
      processosPayload: batch.processos,
    };

    try {
      const importedBatch = await processJusbrasilWebhookImport(job);
      imported.push(importedBatch);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Erro desconhecido ao importar lote Jusbrasil.";

      failures.push({
        correlationId: batch.correlationId,
        error: message,
      });
    }
  }

  await logOperationalEvent({
    category: "WEBHOOK",
    source: "JUSBRASIL",
    action:
      failures.length > 0
        ? imported.length > 0
          ? "WEBHOOK_PARTIAL"
          : "WEBHOOK_FAILED"
        : "WEBHOOK_PROCESSED",
    status:
      failures.length > 0
        ? imported.length > 0
          ? "WARNING"
          : "ERROR"
        : "SUCCESS",
    actorType: "WEBHOOK",
    entityType: "JUSBRASIL_BATCH",
    entityId: batches[0]?.correlationId ?? null,
    route: metadata.route,
    ipAddress: metadata.ipAddress,
    userAgent: metadata.userAgent,
    message: "Webhook Jusbrasil processado.",
    payload: {
      ...summary,
      importedBatches: imported.length,
      importedProcesses: imported.reduce(
        (total, item) => total + item.syncedCount,
        0,
      ),
      unboundBatches,
      failures,
    },
  });

  return NextResponse.json(
    {
      ok: failures.length === 0,
      received: true,
      processedBatches: imported.length,
      importedProcesses: imported.reduce(
        (total, item) => total + item.syncedCount,
        0,
      ),
      unboundBatches,
      failures,
    },
    { status: failures.length > 0 ? 500 : 200 },
  );
}
