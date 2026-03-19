"use server";

import { getSession } from "@/app/lib/auth";
import prisma from "@/app/lib/prisma";
import logger from "@/lib/logger";
import { capturarProcesso, capturarAndamentos } from "@/app/lib/juridical/capture-service";
import { persistCapturedMovimentacoes } from "@/app/lib/juridical/process-movement-sync";
import { upsertProcessoFromCapture } from "@/app/lib/juridical/processo-persistence";
import { getAdvogadoIdFromSession } from "@/app/lib/advogado-access";
import { resolverCaptchaEsaj } from "@/lib/api/juridical/scraping";
import { ProcessoJuridico } from "@/lib/api/juridical/types";
import { checkPermission } from "@/app/actions/equipe";

function normalizeNumeroProcesso(value?: string | null) {
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

async function persistCapturedProcessos(params: {
  tenantId: string;
  processos: ProcessoJuridico[];
  clienteNome?: string;
  advogadoId?: string;
  criadoPorId: string;
}) {
  const { tenantId, processos, clienteNome, advogadoId, criadoPorId } = params;

  const persisted = [];
  let createdCount = 0;
  let updatedCount = 0;
  let createdMovimentacoes = 0;
  let skippedMovimentacoes = 0;
  let notifiedRecipients = 0;

  for (const processo of processos) {
    const result = await upsertProcessoFromCapture({
      tenantId,
      processo,
      clienteNome,
      advogadoId,
      updateIfExists: true,
    });
    persisted.push({
      numeroProcesso: processo.numeroProcesso,
      ...result,
    });

    const movimentacaoSummary = await persistCapturedMovimentacoes({
      tenantId,
      processoId: result.processoId,
      criadoPorId,
      movimentacoes: processo.movimentacoes,
      notifyLawyers: result.updated,
    });

    createdMovimentacoes += movimentacaoSummary.created;
    skippedMovimentacoes += movimentacaoSummary.skipped;
    notifiedRecipients += movimentacaoSummary.notifiedRecipients;

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
    createdMovimentacoes,
    skippedMovimentacoes,
    notifiedRecipients,
  };
}

/**
 * Captura processo via Server Action
 */
export async function capturarProcessoAction(params: {
  numeroProcesso?: string;
  tribunalId?: string;
  tribunalSigla?: string;
  certificadoId?: string;
  oab?: string;
  clienteNome?: string;
  debug?: boolean;
}) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;

    if (!user.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    const podeCapturar = await checkPermission("processos", "editar");
    if (!podeCapturar) {
      return {
        success: false,
        error: "Sem permissão para capturar/sincronizar processos.",
      };
    }

    const advogadoId = await getAdvogadoIdFromSession(session);
    let oab = params.oab;

    if (!oab && !params.numeroProcesso && advogadoId) {
      const advogado = await prisma.advogado.findFirst({
        where: {
          id: advogadoId,
          tenantId: user.tenantId,
        },
        select: {
          oabNumero: true,
          oabUf: true,
        },
      });

      if (advogado?.oabNumero && advogado.oabUf) {
        oab = `${advogado.oabNumero}${advogado.oabUf}`;
      }
    }

    const resultado = await capturarProcesso({
      numeroProcesso: params.numeroProcesso || "",
      tenantId: user.tenantId,
      tribunalId: params.tribunalId,
      tribunalSigla: params.tribunalSigla,
      certificadoId: params.certificadoId,
      oab,
    });

    if (!resultado.success) {
      return resultado;
    }

    const processosCapturados = dedupeProcessos(
      resultado.processos?.length
        ? resultado.processos
        : resultado.processo
          ? [resultado.processo]
          : [],
    );

    if (processosCapturados.length === 0) {
      return {
        success: false,
        error: "Captura retornou sucesso sem processo (inconsistência).",
      };
    }

    const persistedSummary = await persistCapturedProcessos({
      tenantId: user.tenantId,
      processos: processosCapturados,
      clienteNome: params.clienteNome,
      advogadoId: advogadoId || undefined,
      criadoPorId: session.user.id!,
    });
    const firstPersisted = persistedSummary.persisted[0];

    logger.info(
      `[Juridical Capture] ${processosCapturados.length} processo(s) sincronizado(s) para tenant ${user.tenantId} (criados: ${persistedSummary.createdCount}, atualizados: ${persistedSummary.updatedCount})`,
    );

    return {
      success: true,
      processo: processosCapturados[0],
      processos: processosCapturados,
      processoId: firstPersisted?.processoId,
      created: Boolean(firstPersisted?.created),
      createdCount: persistedSummary.createdCount,
      updatedCount: persistedSummary.updatedCount,
      createdMovimentacoes: persistedSummary.createdMovimentacoes,
      skippedMovimentacoes: persistedSummary.skippedMovimentacoes,
      notifiedRecipients: persistedSummary.notifiedRecipients,
      syncedCount: processosCapturados.length,
      persisted: persistedSummary.persisted,
      movimentacoes: resultado.movimentacoes,
      debug: resultado.debug,
    };
  } catch (error) {
    logger.error("[Juridical Capture] Erro:", error);

    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro desconhecido",
    };
  }
}

/**
 * Resolve captcha do e-SAJ e repete a consulta.
 * Fluxo pensado para o /teste-captura (manual).
 */
export async function resolverCaptchaEsajAction(params: {
  captchaId: string;
  captchaText: string;
  clienteNome?: string;
}) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;
    if (!user.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    const podeCapturar = await checkPermission("processos", "editar");
    if (!podeCapturar) {
      return {
        success: false,
        error: "Sem permissão para capturar/sincronizar processos.",
      };
    }

    const advogadoId = await getAdvogadoIdFromSession(session);

    const resultado = await resolverCaptchaEsaj({
      captchaId: params.captchaId,
      captchaText: params.captchaText,
    });

    if (!resultado.success) {
      return resultado;
    }

    const processosCapturados = dedupeProcessos(
      resultado.processos?.length
        ? resultado.processos
        : resultado.processo
          ? [resultado.processo]
          : [],
    );

    if (processosCapturados.length === 0) {
      return {
        success: false,
        error: "Captcha resolvido sem processos retornados.",
      };
    }

    const persistedSummary = await persistCapturedProcessos({
      tenantId: user.tenantId,
      processos: processosCapturados,
      clienteNome: params.clienteNome,
      advogadoId: advogadoId || undefined,
      criadoPorId: session.user.id!,
    });
    const firstPersisted = persistedSummary.persisted[0];

    return {
      success: true,
      processo: processosCapturados[0],
      processos: processosCapturados,
      processoId: firstPersisted?.processoId,
      created: Boolean(firstPersisted?.created),
      createdCount: persistedSummary.createdCount,
      updatedCount: persistedSummary.updatedCount,
      createdMovimentacoes: persistedSummary.createdMovimentacoes,
      skippedMovimentacoes: persistedSummary.skippedMovimentacoes,
      notifiedRecipients: persistedSummary.notifiedRecipients,
      syncedCount: processosCapturados.length,
      persisted: persistedSummary.persisted,
      movimentacoes: resultado.movimentacoes,
      debug: resultado.debug,
    };
  } catch (error) {
    logger.error("[Juridical Capture] Erro ao resolver captcha:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro desconhecido",
    };
  }
}

/**
 * Captura apenas andamentos de um processo
 */
export async function capturarAndamentosAction(params: {
  processoId: string;
  certificadoId?: string;
}) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;

    if (!user.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    const podeCapturar = await checkPermission("processos", "editar");
    if (!podeCapturar) {
      return {
        success: false,
        error: "Sem permissão para capturar andamentos.",
      };
    }

    const processo = await prisma.processo.findFirst({
      where: {
        id: params.processoId,
        tenantId: user.tenantId,
      },
    });

    if (!processo) {
      return { success: false, error: "Processo não encontrado" };
    }

    const resultado = await capturarAndamentos({
      numeroProcesso: processo.numeroCnj || processo.numero,
      tenantId: user.tenantId,
      tribunalId: processo.tribunalId || undefined,
      certificadoId: params.certificadoId,
      processoId: params.processoId,
    });

    if (!resultado.success) {
      return resultado;
    }

    const persistSummary = await persistCapturedMovimentacoes({
      tenantId: user.tenantId,
      processoId: params.processoId,
      criadoPorId: session.user.id!,
      movimentacoes: resultado.movimentacoes,
      notifyLawyers: true,
    });

    logger.info(
      `[Juridical Capture] Andamentos do processo ${params.processoId} capturados (novos: ${persistSummary.created}, ignorados: ${persistSummary.skipped})`,
    );

    return {
      success: true,
      movimentacoes: resultado.movimentacoes,
      createdMovimentacoes: persistSummary.created,
      skippedMovimentacoes: persistSummary.skipped,
      notifiedRecipients: persistSummary.notifiedRecipients,
    };
  } catch (error) {
    logger.error("[Juridical Capture] Erro:", error);

    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro desconhecido",
    };
  }
}
