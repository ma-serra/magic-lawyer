import { capturarProcesso } from "@/app/lib/juridical/capture-service";
import prisma from "@/app/lib/prisma";
import { upsertProcessoFromCapture } from "@/app/lib/juridical/processo-persistence";
import logger from "@/lib/logger";
import { resolverCaptchaEsaj } from "@/lib/api/juridical/scraping";
import { CapturaResult, ProcessoJuridico } from "@/lib/api/juridical/types";

export type PortalProcessSyncAuditStatus =
  | "SUCESSO"
  | "ERRO"
  | "PENDENTE_CAPTCHA";

export function normalizeNumeroProcesso(value?: string | null) {
  if (!value) return "";
  return value.replace(/\D/g, "");
}

function dedupeProcessos(processos: ProcessoJuridico[]) {
  const seen = new Set<string>();
  const deduped: ProcessoJuridico[] = [];

  for (const processo of processos) {
    const key = normalizeNumeroProcesso(processo.numeroProcesso);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(processo);
  }

  return deduped;
}

export function extractProcessosFromResult(result: {
  processo?: ProcessoJuridico;
  processos?: ProcessoJuridico[];
}) {
  return dedupeProcessos(
    result.processos?.length
      ? result.processos
      : result.processo
        ? [result.processo]
        : [],
  );
}

export async function persistPortalProcessos(params: {
  tenantId: string;
  processos: ProcessoJuridico[];
  clienteNome?: string;
  advogadoId?: string | null;
}) {
  const persisted = [];
  let createdCount = 0;
  let updatedCount = 0;

  for (const processo of params.processos) {
    const result = await upsertProcessoFromCapture({
      tenantId: params.tenantId,
      processo,
      clienteNome: params.clienteNome,
      advogadoId: params.advogadoId || undefined,
      updateIfExists: true,
    });

    persisted.push({
      numeroProcesso: processo.numeroProcesso,
      ...result,
    });

    if (result.created) {
      createdCount += 1;
    } else if (result.updated) {
      updatedCount += 1;
    }
  }

  return {
    persisted,
    createdCount,
    updatedCount,
  };
}

export async function createPortalProcessSyncAudit(params: {
  tenantId: string;
  usuarioId: string;
  syncId: string;
  tribunalSigla: string;
  oab: string;
  status: PortalProcessSyncAuditStatus;
  origem: "BACKGROUND_INITIAL" | "BACKGROUND_CAPTCHA";
  syncedCount?: number;
  createdCount?: number;
  updatedCount?: number;
  processosNumeros?: string[];
  error?: string;
}) {
  await prisma.auditLog.create({
    data: {
      tenantId: params.tenantId,
      usuarioId: params.usuarioId,
      acao: "SINCRONIZACAO_INICIAL_OAB_PROCESSOS",
      entidade: "Processo",
      dados: {
        origem: params.origem,
        status: params.status,
        syncId: params.syncId,
        tribunalSigla: params.tribunalSigla,
        oab: params.oab,
        syncedCount: params.syncedCount ?? 0,
        createdCount: params.createdCount ?? 0,
        updatedCount: params.updatedCount ?? 0,
        processosNumeros: (params.processosNumeros ?? []).slice(0, 50),
        error: params.error ?? null,
      },
      changedFields: [],
    },
  });
}

export async function executePortalProcessSyncCapture(params: {
  mode: "INITIAL" | "CAPTCHA";
  tenantId: string;
  tribunalSigla: string;
  oab: string;
  captchaId?: string;
  captchaText?: string;
}): Promise<CapturaResult> {
  if (params.mode === "CAPTCHA") {
    if (!params.captchaId || !params.captchaText) {
      return {
        success: false,
        error: "Captcha incompleto para continuar a sincronização.",
      };
    }

    return resolverCaptchaEsaj({
      captchaId: params.captchaId,
      captchaText: params.captchaText,
    });
  }

  try {
    return await capturarProcesso({
      numeroProcesso: "",
      oab: params.oab,
      tenantId: params.tenantId,
      tribunalSigla: params.tribunalSigla,
    });
  } catch (error) {
    logger.error("[PortalProcessSync] Erro na captura principal:", error);
    throw error;
  }
}
