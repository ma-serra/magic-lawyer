import { NextRequest, NextResponse } from "next/server";

import {
  getRequestAuditMetadata,
  logOperationalEvent,
} from "@/app/lib/audit/operational-events";
import {
  getPortalProcessSyncState,
  savePortalProcessSyncState,
  withPortalProcessSyncStatus,
} from "@/app/lib/juridical/process-sync-status-store";
import {
  buildJusbrasilExpectedWebhookUrl,
  createOabSyncAuditEntry,
  resolveJusbrasilSyncBinding,
} from "@/app/lib/juridical/jusbrasil-oab-sync";
import type { JusbrasilWebhookImportJobInput } from "@/app/lib/juridical/jusbrasil-webhook-import-step";
import { extractJusbrasilWebhookBatches } from "@/lib/api/juridical/jusbrasil-webhook-normalizer";

export const dynamic = "force-dynamic";

type BatchQueueSummary = {
  correlationId: string;
  tenantId: string;
  syncId?: string;
  processCount: number;
  runId: string;
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

async function markBatchQueued(params: {
  correlationId: string;
  tenantId: string;
  syncId?: string;
  runId: string;
}) {
  if (!params.syncId) {
    return;
  }

  const state = await getPortalProcessSyncState(params.syncId);

  if (!state || state.tenantId !== params.tenantId) {
    return;
  }

  await savePortalProcessSyncState({
    ...state,
    provider: "JUSBRASIL",
    correlationId: params.correlationId,
    queueJobId: params.runId,
    webhookUrl: state.webhookUrl || buildJusbrasilExpectedWebhookUrl(),
    message: "Webhook Jusbrasil recebido e enviado para processamento em background.",
    updatedAt: new Date().toISOString(),
  });
}

async function markBatchFailure(params: {
  correlationId: string;
  tenantId: string;
  usuarioId?: string | null;
  advogadoId?: string;
  clienteNome?: string;
  syncId?: string;
  tribunalSigla: string;
  oab: string;
  error: string;
}) {
  await createOabSyncAuditEntry({
    tenantId: params.tenantId,
    usuarioId: params.usuarioId ?? null,
    tribunalSigla: params.tribunalSigla,
    oab: params.oab,
    status: "ERRO",
    origem: "JUSBRASIL_WEBHOOK",
    provider: "JUSBRASIL",
    mode: "ASYNC_WEBHOOK",
    entidadeId: params.correlationId,
    correlationId: params.correlationId,
    syncId: params.syncId,
    advogadoId: params.advogadoId,
    clienteNome: params.clienteNome,
    error: params.error,
    webhookUrl: buildJusbrasilExpectedWebhookUrl(),
  });

  if (params.syncId) {
    const state = await getPortalProcessSyncState(params.syncId);

    if (state && state.tenantId === params.tenantId) {
      const failedState = withPortalProcessSyncStatus(state, "FAILED", {
        provider: "JUSBRASIL",
        correlationId: params.correlationId,
        webhookUrl: state.webhookUrl || buildJusbrasilExpectedWebhookUrl(),
        error: params.error,
      });

      await savePortalProcessSyncState(failedState);
    }
  }
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
      enqueuedBatches: 0,
      enqueuedProcesses: 0,
    });
  }

  let startWorkflow: typeof import("workflow/api").start;
  let jusbrasilWebhookImportWorkflow: typeof import("@/workflows/jusbrasil-webhook-import").jusbrasilWebhookImportWorkflow;

  try {
    ({ start: startWorkflow } = await import("workflow/api"));
    ({ jusbrasilWebhookImportWorkflow } = await import(
      "@/workflows/jusbrasil-webhook-import"
    ));
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Falha ao carregar o workflow de importacao do Jusbrasil.";

    await logOperationalEvent({
      category: "WEBHOOK",
      source: "JUSBRASIL",
      action: "WEBHOOK_QUEUE_UNAVAILABLE",
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
        enqueuedBatches: 0,
        enqueuedProcesses: 0,
        error: message,
      },
      { status: 500 },
    );
  }

  const enqueued: BatchQueueSummary[] = [];
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
      const run = await startWorkflow(jusbrasilWebhookImportWorkflow, [job]);

      await markBatchQueued({
        correlationId: batch.correlationId,
        tenantId: binding.tenantId,
        syncId: binding.syncId,
        runId: run.runId,
      });

      enqueued.push({
        correlationId: batch.correlationId,
        tenantId: binding.tenantId,
        syncId: binding.syncId,
        processCount: batch.processos.length,
        runId: run.runId,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Erro desconhecido ao enfileirar lote Jusbrasil.";

      failures.push({
        correlationId: batch.correlationId,
        error: message,
      });

      await markBatchFailure({
        correlationId: batch.correlationId,
        tenantId: binding.tenantId,
        usuarioId: binding.usuarioId,
        advogadoId: binding.advogadoId,
        clienteNome: binding.clienteNome,
        syncId: binding.syncId,
        tribunalSigla: binding.tribunalSigla,
        oab: binding.oab,
        error: message,
      });
    }
  }

  const enqueuedProcessCount = enqueued.reduce(
    (total, item) => total + item.processCount,
    0,
  );

  const action =
    failures.length > 0
      ? enqueued.length > 0
        ? "WEBHOOK_QUEUE_PARTIAL"
        : "WEBHOOK_QUEUE_FAILED"
      : "WEBHOOK_BATCHES_ENQUEUED";

  const status =
    failures.length > 0
      ? enqueued.length > 0
        ? "WARNING"
        : "ERROR"
      : "SUCCESS";

  await logOperationalEvent({
    category: "WEBHOOK",
    source: "JUSBRASIL",
    action,
    status,
    actorType: "WEBHOOK",
    entityType: "JUSBRASIL_BATCH",
    entityId: batches[0]?.correlationId ?? null,
    route: metadata.route,
    ipAddress: metadata.ipAddress,
    userAgent: metadata.userAgent,
    message: "Webhook Jusbrasil recebido e encaminhado para processamento.",
    payload: {
      ...summary,
      enqueuedBatches: enqueued.length,
      enqueuedProcesses: enqueuedProcessCount,
      unboundBatches,
      failures,
    },
  });

  return NextResponse.json(
    {
      ok: failures.length === 0,
      received: true,
      enqueuedBatches: enqueued.length,
      enqueuedProcesses: enqueuedProcessCount,
      unboundBatches,
      failures,
    },
    { status: failures.length > 0 ? 500 : 200 },
  );
}
