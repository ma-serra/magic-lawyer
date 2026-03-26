import { NextRequest, NextResponse } from "next/server";

import {
  getRequestAuditMetadata,
  logOperationalEvent,
} from "@/app/lib/audit/operational-events";
import {
  processJusbrasilWebhookImport,
  type JusbrasilWebhookImportJobInput,
} from "@/app/lib/juridical/jusbrasil-webhook-import-step";
import {
  getTenantJusbrasilIntegrationState,
  resolveJusbrasilSyncBinding,
  touchTenantJusbrasilWebhookActivity,
} from "@/app/lib/juridical/jusbrasil-oab-sync";
import { processJusbrasilSupportedProcessEvent } from "@/app/lib/juridical/jusbrasil-process-events-import";
import { resolveJusbrasilProcessBinding } from "@/app/lib/juridical/jusbrasil-process-monitoring";
import { extractJusbrasilSupportedProcessEvents } from "@/lib/api/juridical/jusbrasil-webhook-events";
import { extractJusbrasilWebhookBatches } from "@/lib/api/juridical/jusbrasil-webhook-normalizer";

export const dynamic = "force-dynamic";

type BatchImportSummary = {
  correlationId: string;
  syncedCount: number;
  createdCount: number;
  updatedCount: number;
  processNumbers: string[];
};

type ProcessEventImportSummary = {
  evtType: 1 | 2 | 7;
  processoId: string;
  createdMovimentacoes: number;
  skippedMovimentacoes: number;
  updatedProcess: boolean;
};

function summarizePayload(payload: unknown) {
  const batches = extractJusbrasilWebhookBatches(payload);
  const processEvents = extractJusbrasilSupportedProcessEvents(payload);

  if (batches.length === 0 && processEvents.length === 0) {
    return {
      payloadType: Array.isArray(payload) ? "array" : typeof payload,
      batchCount: 0,
      processCount: 0,
      correlationIds: [],
      processEventCount: 0,
      evtTypes: [],
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
    processEventCount: processEvents.length,
    evtTypes: Array.from(new Set(processEvents.map((event) => event.evtType))),
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
  const processEvents = extractJusbrasilSupportedProcessEvents(payload);

  if (batches.length === 0 && processEvents.length === 0) {
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

  const imported: BatchImportSummary[] = [];
  const importedEvents: ProcessEventImportSummary[] = [];
  const failures: Array<{ correlationId: string; error: string }> = [];
  let unboundBatches = 0;
  let unboundEvents = 0;
  let disabledBatches = 0;
  let disabledEvents = 0;

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

    const integrationState = await getTenantJusbrasilIntegrationState(
      binding.tenantId,
    );

    await touchTenantJusbrasilWebhookActivity({
      tenantId: binding.tenantId,
      event: "OAB_BATCH",
    });

    if (!integrationState.enabled) {
      disabledBatches += 1;

      await logOperationalEvent({
        category: "WEBHOOK",
        source: "JUSBRASIL",
        action: "WEBHOOK_DISABLED_TENANT_BATCH",
        status: "WARNING",
        actorType: "WEBHOOK",
        entityType: "JUSBRASIL_CORRELATION",
        entityId: batch.correlationId,
        route: metadata.route,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        message:
          "Lote Jusbrasil ignorado porque a integracao esta desativada para este tenant.",
        payload: {
          correlationId: batch.correlationId,
          tenantId: binding.tenantId,
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

  for (const event of processEvents) {
    const binding = await resolveJusbrasilProcessBinding({
      sourceUserCustom: event.sourceUserCustom,
      targetNumber: event.targetNumber,
    });

    if (!binding) {
      unboundEvents += 1;

      await logOperationalEvent({
        category: "WEBHOOK",
        source: "JUSBRASIL",
        action: "WEBHOOK_UNBOUND_EVENT",
        status: "WARNING",
        actorType: "WEBHOOK",
        entityType: "JUSBRASIL_EVENT",
        entityId:
          typeof event.id === "number" || typeof event.id === "string"
            ? String(event.id)
            : null,
        route: metadata.route,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        message:
          "Evento Jusbrasil recebido sem vinculo local para source_user_custom.",
        payload: {
          evtType: event.evtType,
          sourceUserCustom: event.sourceUserCustom ?? null,
          targetNumber: event.targetNumber ?? null,
        },
      });

      continue;
    }

    const integrationState = await getTenantJusbrasilIntegrationState(
      binding.tenantId,
    );

    await touchTenantJusbrasilWebhookActivity({
      tenantId: binding.tenantId,
      event: `EVT_${event.evtType}`,
    });

    if (!integrationState.enabled) {
      disabledEvents += 1;

      await logOperationalEvent({
        category: "WEBHOOK",
        source: "JUSBRASIL",
        action: "WEBHOOK_DISABLED_TENANT_EVENT",
        status: "WARNING",
        actorType: "WEBHOOK",
        entityType: "JUSBRASIL_EVENT",
        entityId:
          typeof event.id === "number" || typeof event.id === "string"
            ? String(event.id)
            : null,
        route: metadata.route,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        message:
          "Evento Jusbrasil ignorado porque a integracao esta desativada para este tenant.",
        payload: {
          evtType: event.evtType,
          tenantId: binding.tenantId,
          processoId: binding.processoId,
        },
      });

      continue;
    }

    try {
      const importedEvent = await processJusbrasilSupportedProcessEvent({
        binding,
        event,
      });

      importedEvents.push({
        evtType: importedEvent.evtType,
        processoId: importedEvent.processoId,
        createdMovimentacoes: importedEvent.createdMovimentacoes,
        skippedMovimentacoes: importedEvent.skippedMovimentacoes,
        updatedProcess: importedEvent.updatedProcess,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Erro desconhecido ao importar evento Jusbrasil.";

      failures.push({
        correlationId:
          typeof event.id === "number" || typeof event.id === "string"
            ? String(event.id)
            : `evt:${event.evtType}:${binding.processoId}`,
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
      processedEvents: importedEvents.length,
      createdMovimentacoes: importedEvents.reduce(
        (total, item) => total + item.createdMovimentacoes,
        0,
      ),
      unboundBatches,
      unboundEvents,
      disabledBatches,
      disabledEvents,
      failures,
    },
  });

  return NextResponse.json(
    {
      ok: failures.length === 0,
      received: true,
      processedBatches: imported.length,
      processedEvents: importedEvents.length,
      importedProcesses: imported.reduce(
        (total, item) => total + item.syncedCount,
        0,
      ),
      createdMovimentacoes: importedEvents.reduce(
        (total, item) => total + item.createdMovimentacoes,
        0,
      ),
      unboundBatches,
      unboundEvents,
      disabledBatches,
      disabledEvents,
      failures,
    },
    { status: failures.length > 0 ? 500 : 200 },
  );
}
