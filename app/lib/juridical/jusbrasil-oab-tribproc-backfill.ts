import {
  getPortalProcessSyncState,
  savePortalProcessSyncState,
  withPortalProcessSyncStatus,
} from "@/app/lib/juridical/process-sync-status-store";
import { persistCapturedMovimentacoes } from "@/app/lib/juridical/process-movement-sync";
import { upsertProcessoFromCapture } from "@/app/lib/juridical/processo-persistence";
import {
  buildJusbrasilExpectedWebhookUrl,
  createOabSyncAuditEntry,
  getJusbrasilClientFromEnv,
} from "@/app/lib/juridical/jusbrasil-oab-sync";
import logger from "@/lib/logger";
import { normalizarProcesso } from "@/lib/api/juridical/normalization";
import { mapJusbrasilTribprocProcessoToProcesso } from "@/lib/api/juridical/jusbrasil-tribproc-normalizer";

const BACKFILL_PAGE_SIZE = 25;
const BACKFILL_CONCURRENCY = 5;
const MAX_PROCESS_NUMBERS_IN_SUMMARY = 50;

export type JusbrasilOabTribprocBackfillJob = {
  syncId?: string | null;
  tenantId: string;
  usuarioId?: string | null;
  advogadoId?: string | null;
  tribunalSigla: string;
  oab: string;
  correlationId: string;
  clienteNome?: string | null;
  webhookUrl?: string | null;
};

export type JusbrasilOabTribprocBackfillProgress = {
  fetchedLinks: number;
  importedProcesses: number;
  createdCount: number;
  updatedCount: number;
  failedCount: number;
  processNumbers: string[];
};

export type JusbrasilOabTribprocBackfillRequest = {
  job: JusbrasilOabTribprocBackfillJob;
  page?: number;
  progress?: JusbrasilOabTribprocBackfillProgress;
};

function normalizeRouteOrigin(value?: string | null) {
  const trimmed = (value || "").replace(/^['"]+|['"]+$/g, "").trim();
  if (!trimmed) {
    return "";
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed.replace(/\/+$/, "");
  }

  return `https://${trimmed.replace(/^\/+/, "").replace(/\/+$/, "")}`;
}

function normalizeCnjDigits(value?: string | null) {
  return (value || "").replace(/\D/g, "");
}

function appendProcessNumber(
  processNumbers: string[],
  seenNumbers: Set<string>,
  numeroProcesso?: string | null,
) {
  const normalized = (numeroProcesso || "").trim();
  if (!normalized || seenNumbers.has(normalized)) {
    return;
  }

  seenNumbers.add(normalized);
  if (processNumbers.length < MAX_PROCESS_NUMBERS_IN_SUMMARY) {
    processNumbers.push(normalized);
  }
}

async function updateSyncState(
  job: JusbrasilOabTribprocBackfillJob,
  status: "RUNNING" | "COMPLETED" | "FAILED",
  patch: Record<string, unknown>,
) {
  if (!job.syncId) {
    return;
  }

  const state = await getPortalProcessSyncState(job.syncId);

  if (!state || state.tenantId !== job.tenantId) {
    return;
  }

  const nextState = withPortalProcessSyncStatus(state, status, {
    provider: "JUSBRASIL",
    correlationId: job.correlationId,
    webhookUrl: job.webhookUrl || buildJusbrasilExpectedWebhookUrl(),
    ...patch,
  });

  await savePortalProcessSyncState(nextState);
}

export function buildBackfillRouteUrl() {
  const publicOrigin = buildJusbrasilExpectedWebhookUrl().replace(
    /\/api\/webhooks\/jusbrasil$/,
    "",
  );
  const candidates = [
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    "https://magiclawyer.vercel.app",
    publicOrigin,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXTAUTH_URL,
    process.env.BASE_URL,
    process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL.replace(/^https?:\/\//, "")}`
      : null,
    "http://localhost:9192",
  ];

  for (const candidate of candidates) {
    const origin = normalizeRouteOrigin(candidate);
    if (!origin) continue;

    return `${origin}/api/internal/jusbrasil/oab-backfill`;
  }

  return "https://magiclawyer.vercel.app/api/internal/jusbrasil/oab-backfill";
}

function getInternalBackfillAuthToken() {
  return (
    process.env.JUSBRASIL_INTERNAL_BACKFILL_SECRET ||
    process.env.CRON_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    ""
  ).trim();
}

export function isValidInternalBackfillAuthHeader(value?: string | null) {
  const token = getInternalBackfillAuthToken();
  return Boolean(token) && value === `Bearer ${token}`;
}

async function importTribprocProcess(
  job: JusbrasilOabTribprocBackfillJob,
  cnj: string,
) {
  const client = getJusbrasilClientFromEnv();

  if (!client) {
    throw new Error("JUSBRASIL_API_KEY nao configurada");
  }

  const { data } = await client.getProcessByCnj(cnj);
  const mappedProcess = mapJusbrasilTribprocProcessoToProcesso(
    (data || {}) as Record<string, unknown>,
  );

  if (!mappedProcess) {
    return {
      imported: false,
      created: false,
      updated: false,
      numeroProcesso: null,
    };
  }

  const processo = normalizarProcesso(mappedProcess);
  const persisted = await upsertProcessoFromCapture({
    tenantId: job.tenantId,
    processo,
    clienteNome: job.clienteNome || undefined,
    advogadoId: job.advogadoId || undefined,
    updateIfExists: true,
    syncJusbrasilProcessMonitor: false,
  });

  await persistCapturedMovimentacoes({
    tenantId: job.tenantId,
    processoId: persisted.processoId,
    criadoPorId: job.usuarioId ?? null,
    movimentacoes: processo.movimentacoes,
    notifyLawyers: false,
    actorName: "Backfill Jusbrasil",
    sourceLabel: "Importacao inicial por OAB via tribproc",
    sourceKind: "EXTERNAL",
  });

  return {
    imported: persisted.created || persisted.updated,
    created: persisted.created,
    updated: persisted.updated,
    numeroProcesso: processo.numeroProcesso || null,
  };
}

async function finalizeBackfillSuccess(
  job: JusbrasilOabTribprocBackfillJob,
  progress: JusbrasilOabTribprocBackfillProgress,
) {
  const webhookUrl = job.webhookUrl || buildJusbrasilExpectedWebhookUrl();

  await createOabSyncAuditEntry({
    tenantId: job.tenantId,
    usuarioId: job.usuarioId ?? null,
    tribunalSigla: job.tribunalSigla,
    oab: job.oab,
    status: "SUCESSO",
    origem: "JUSBRASIL_TRIBPROC_BACKFILL",
    provider: "JUSBRASIL",
    mode: "ASYNC_WEBHOOK",
    entidadeId: job.correlationId,
    correlationId: job.correlationId,
    syncId: job.syncId ?? null,
    advogadoId: job.advogadoId ?? null,
    clienteNome: job.clienteNome ?? null,
    syncedCount: progress.importedProcesses,
    createdCount: progress.createdCount,
    updatedCount: progress.updatedCount,
    processosNumeros: progress.processNumbers,
    webhookUrl,
  });

  await updateSyncState(job, "COMPLETED", {
    syncedCount: progress.importedProcesses,
    createdCount: progress.createdCount,
    updatedCount: progress.updatedCount,
    processosNumeros: progress.processNumbers,
    message:
      progress.failedCount > 0
        ? `Busca concluida com ${progress.failedCount} pendencia(s) pontuais. As proximas atualizacoes continuarao chegando automaticamente.`
        : "Busca concluida. As proximas atualizacoes continuarao chegando automaticamente.",
    error: undefined,
  });
}

export async function failJusbrasilOabTribprocBackfill(
  job: JusbrasilOabTribprocBackfillJob,
  error: unknown,
  progress?: JusbrasilOabTribprocBackfillProgress,
) {
  const message =
    error instanceof Error
      ? error.message
      : "Falha ao processar a busca inicial de processos.";

  await createOabSyncAuditEntry({
    tenantId: job.tenantId,
    usuarioId: job.usuarioId ?? null,
    tribunalSigla: job.tribunalSigla,
    oab: job.oab,
    status: "ERRO",
    origem: "JUSBRASIL_TRIBPROC_BACKFILL",
    provider: "JUSBRASIL",
    mode: "ASYNC_WEBHOOK",
    entidadeId: job.correlationId,
    correlationId: job.correlationId,
    syncId: job.syncId ?? null,
    advogadoId: job.advogadoId ?? null,
    clienteNome: job.clienteNome ?? null,
    syncedCount: progress?.importedProcesses ?? 0,
    createdCount: progress?.createdCount ?? 0,
    updatedCount: progress?.updatedCount ?? 0,
    processosNumeros: progress?.processNumbers ?? [],
    error: message,
    webhookUrl: job.webhookUrl || buildJusbrasilExpectedWebhookUrl(),
  });

  await updateSyncState(job, "FAILED", {
    syncedCount: progress?.importedProcesses ?? 0,
    createdCount: progress?.createdCount ?? 0,
    updatedCount: progress?.updatedCount ?? 0,
    processosNumeros: progress?.processNumbers ?? [],
    message: "A busca foi iniciada, mas tivemos um problema ao trazer os processos.",
    error: message,
  });
}

export async function processJusbrasilOabTribprocBackfill(
  request: JusbrasilOabTribprocBackfillRequest,
): Promise<{
  done: boolean;
  nextPage?: number;
  progress: JusbrasilOabTribprocBackfillProgress;
}> {
  const client = getJusbrasilClientFromEnv();

  if (!client) {
    throw new Error("JUSBRASIL_API_KEY nao configurada");
  }

  const { job } = request;
  const page = request.page ?? 1;
  const seenProcessNumbers = new Set(request.progress?.processNumbers ?? []);
  const progress: JusbrasilOabTribprocBackfillProgress = {
    fetchedLinks: request.progress?.fetchedLinks ?? 0,
    importedProcesses: request.progress?.importedProcesses ?? 0,
    createdCount: request.progress?.createdCount ?? 0,
    updatedCount: request.progress?.updatedCount ?? 0,
    failedCount: request.progress?.failedCount ?? 0,
    processNumbers: [...(request.progress?.processNumbers ?? [])],
  };

  await updateSyncState(job, "RUNNING", {
    message:
      "A busca inicial de processos ja comecou. Voce pode continuar usando o sistema enquanto os dados chegam.",
    syncedCount: progress.importedProcesses,
    createdCount: progress.createdCount,
    updatedCount: progress.updatedCount,
    processosNumeros: progress.processNumbers,
    error: undefined,
  });

  const pageResult = await client.listOabProcessLinksByMonitor({
    correlationId: job.correlationId,
    page,
    perPage: BACKFILL_PAGE_SIZE,
  });

  const totalCountHint = pageResult.totalCount ?? null;
  const links = pageResult.items;

  if (links.length === 0) {
    await finalizeBackfillSuccess(job, progress);

    return {
      done: true,
      progress,
    };
  }

  progress.fetchedLinks += links.length;

  const pageCnjs = Array.from(
    new Set(
      links
        .map((link) => normalizeCnjDigits(link.cnj))
        .filter((cnj) => cnj.length === 20),
    ),
  );

  for (let index = 0; index < pageCnjs.length; index += BACKFILL_CONCURRENCY) {
    const chunk = pageCnjs.slice(index, index + BACKFILL_CONCURRENCY);
    const results = await Promise.allSettled(
      chunk.map((cnj) => importTribprocProcess(job, cnj)),
    );

    results.forEach((result, chunkIndex) => {
      const cnj = chunk[chunkIndex] || "desconhecido";

      if (result.status === "rejected") {
        progress.failedCount += 1;
        logger.warn(
          {
            tenantId: job.tenantId,
            correlationId: job.correlationId,
            cnj,
            error:
              result.reason instanceof Error
                ? result.reason.message
                : String(result.reason),
          },
          "Falha ao importar processo via tribproc no backfill Jusbrasil.",
        );
        return;
      }

      if (result.value.imported) {
        progress.importedProcesses += 1;
      }

      if (result.value.created) {
        progress.createdCount += 1;
      } else if (result.value.updated) {
        progress.updatedCount += 1;
      }

      appendProcessNumber(
        progress.processNumbers,
        seenProcessNumbers,
        result.value.numeroProcesso,
      );
    });
  }

  await updateSyncState(job, "RUNNING", {
    syncedCount: progress.importedProcesses,
    createdCount: progress.createdCount,
    updatedCount: progress.updatedCount,
    processosNumeros: progress.processNumbers,
    message:
      totalCountHint && totalCountHint > 0
        ? `Buscando processos: ${Math.min(progress.fetchedLinks, totalCountHint)} de ${totalCountHint} referencias analisadas.`
        : "Buscando processos para o seu escritorio.",
  });

  if (links.length < BACKFILL_PAGE_SIZE) {
    if (progress.importedProcesses === 0 && progress.failedCount > 0) {
      throw new Error(
        "Nao conseguimos trazer nenhum processo nesta tentativa inicial.",
      );
    }

    await finalizeBackfillSuccess(job, progress);

    return {
      done: true,
      progress,
    };
  }

  return {
    done: false,
    nextPage: page + 1,
    progress,
  };
}

export async function enqueueJusbrasilOabTribprocBackfill(
  request: JusbrasilOabTribprocBackfillRequest,
) {
  const token = getInternalBackfillAuthToken();
  if (!token) {
    throw new Error(
      "Nenhum token interno configurado para enfileirar o backfill Jusbrasil.",
    );
  }

  try {
    const response = await fetch(buildBackfillRouteUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(request),
      cache: "no-store",
    });

    if (!response.ok) {
      const raw = await response.text();
      throw new Error(
        `Fila interna do backfill Jusbrasil respondeu ${response.status}: ${raw || "sem corpo"}`,
      );
    }
  } catch (error) {
    await updateSyncState(request.job, "FAILED", {
      error:
        error instanceof Error
          ? error.message
          : "Falha ao iniciar a busca inicial de processos.",
      message: "A busca foi registrada, mas nao conseguiu comecar corretamente.",
    }).catch(() => undefined);

    throw error;
  }
}
