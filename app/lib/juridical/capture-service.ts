/**
 * Serviço de captura de processos jurídicos
 * 
 * Coordena a captura de dados de diferentes fontes (API, scraping)
 * e normaliza os dados para o formato unificado
 */

import {
  ProcessoJuridico,
  CapturaResult,
  TribunalSistema,
} from "@/lib/api/juridical/types";
import { consultarProcesso } from "@/lib/api/juridical/scraping";
import { consultarPJe } from "@/lib/api/juridical/pje";
import { normalizarProcesso } from "@/lib/api/juridical/normalization";
import { getTribunalConfig } from "@/lib/api/juridical/config";
import prisma from "@/app/lib/prisma";
import logger from "@/lib/logger";

export interface CapturaProcessoParams {
  numeroProcesso: string;
  tenantId: string;
  tribunalId?: string;
  tribunalSigla?: string;
  certificadoId?: string;
  processoId?: string; // ID do processo no nosso sistema (se já existe)
  oab?: string;
}

function normalizeProcessoNumero(value?: string | null) {
  if (!value) return "";
  return value.replace(/\D/g, "");
}

function normalizeCapturedProcessos(resultado: CapturaResult) {
  const list = resultado.processos?.length
    ? resultado.processos
    : resultado.processo
      ? [resultado.processo]
      : [];
  const seen = new Set<string>();
  const normalized: ProcessoJuridico[] = [];

  for (const processo of list) {
    const processoNormalizado = normalizarProcesso(processo);
    const key = normalizeProcessoNumero(processoNormalizado.numeroProcesso);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    normalized.push(processoNormalizado);
  }

  return normalized;
}

/**
 * Captura processo de qualquer fonte disponível
 */
export async function capturarProcesso(
  params: CapturaProcessoParams,
): Promise<CapturaResult> {
  const {
    numeroProcesso,
    tenantId,
    tribunalId,
    tribunalSigla,
    certificadoId,
    oab,
  } = params;

  try {
    logger.info(
      `[Capture Service] Capturando processo: ${
        numeroProcesso || oab || "não informado"
      } (tenant: ${tenantId})`,
    );

    // Buscar tribunal se não foi fornecido
    if (oab && !numeroProcesso) {
      return {
        success: false,
        error:
          "A descoberta de processos por OAB agora funciona apenas via Jusbrasil.",
      };
    }

    let tribunal;
    if (tribunalId) {
      tribunal = await prisma.tribunal.findFirst({
        where: { id: tribunalId, tenantId },
      });
    }

    const sigla = tribunalSigla || tribunal?.sigla;
    const tribunalConfig = sigla ? getTribunalConfig({ sigla }) : undefined;

    // Decidir qual método usar
    let resultado: CapturaResult;

    if (tribunalConfig?.sistema === TribunalSistema.PJE) {
      // Usar API PJe (requer certificado)
      if (!numeroProcesso) {
        return {
          success: false,
          error: "Número do processo é obrigatório para PJe",
        };
      }
      if (!certificadoId) {
        return {
          success: false,
          error: "Certificado digital é obrigatório para PJe",
        };
      }

      resultado = await consultarPJe({
        numeroProcesso,
        tribunalId,
        certificadoId: certificadoId || undefined,
      });
    } else if (tribunalConfig?.scrapingDisponivel) {
      // Usar web scraping
      resultado = await consultarProcesso(numeroProcesso || "", sigla || undefined, {
        oab,
      });
    } else {
      return {
        success: false,
        error: `Nenhum método de captura disponível para este tribunal`,
      };
    }

    if (!resultado.success) {
      return resultado;
    }

    const processosNormalizados = normalizeCapturedProcessos(resultado);
    if (processosNormalizados.length === 0) {
      return {
        ...resultado,
        success: false,
        error:
          resultado.error ||
          "Captura retornou sucesso sem processos (inconsistência).",
      };
    }

    // Vincular ao nosso processo se já existe
    if (params.processoId) {
      const numero = processosNormalizados[0]?.numeroProcesso ?? "desconhecido";
      logger.info(
        `[Capture Service] Processo ${params.processoId} (${numero}) será sincronizado com dados capturados`,
      );
    }

    return {
      ...resultado,
      processo: processosNormalizados[0],
      processos: processosNormalizados,
    };
  } catch (error) {
    logger.error("[Capture Service] Erro ao capturar processo:", error);

    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro desconhecido",
    };
  }
}

/**
 * Captura apenas andamentos de um processo
 */
export async function capturarAndamentos(
  params: CapturaProcessoParams,
): Promise<CapturaResult> {
  // Similar a capturarProcesso, mas foca apenas em movimentações
  const resultado = await capturarProcesso(params);

  if (!resultado.success || !resultado.processo) {
    return resultado;
  }

  // Retornar apenas movimentações
  return {
    success: true,
    movimentacoes: resultado.processo.movimentacoes || [],
    tempoResposta: resultado.tempoResposta,
  };
}




