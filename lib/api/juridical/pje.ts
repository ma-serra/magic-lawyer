/**
 * Integração com PJe (Processo Judicial Eletrônico)
 * 
 * Requer certificado digital A1 para autenticação
 * Preparado para quando o certificado da Doutora Sandra estiver disponível
 */

import { ProcessoJuridico, ConsultaProcessoParams, CapturaResult, TribunalSistema } from "./types";
import { decryptBuffer, decryptToString } from "@/lib/certificate-crypto";
import prisma from "@/app/lib/prisma";
import logger from "@/lib/logger";
import { getTribunalConfig } from "./config";
import { fetchComunica } from "@/lib/api/juridical/pje/comunica";
import {
  findProcessoByNumero,
  mapComunicaItemsToProcessos,
} from "@/lib/api/juridical/pje/comunica-normalizer";

/**
 * Autentica no PJe usando certificado A1
 */
async function autenticarPJe(
  certificadoId: string,
  tenantId: string,
): Promise<{ accessToken?: string; error?: string }> {
  try {
    // Buscar certificado do banco
    const certificado = await prisma.digitalCertificate.findFirst({
      where: {
        id: certificadoId,
        tenantId,
        isActive: true,
      },
    });

    if (!certificado) {
      return { error: "Certificado não encontrado ou inativo" };
    }

    // Descriptografar certificado
    const certificadoBuffer = decryptBuffer(
      certificado.encryptedData,
      certificado.iv,
    );
    const senha = decryptToString(
      certificado.encryptedPassword,
      certificado.passwordIv,
    );

    logger.info(`[PJe] Autenticando com certificado ${certificadoId}`);

    // Validação mínima real: certificado descriptografado com sucesso
    // e payload presente para handshake mTLS em clientes específicos.
    if (!certificadoBuffer.length || !senha.trim()) {
      return {
        error: "Certificado inválido para autenticação PJe",
      };
    }

    return {
      accessToken: "MTLS_READY",
    };
  } catch (error) {
    logger.error("[PJe] Erro ao autenticar:", error);
    return {
      error: error instanceof Error ? error.message : "Erro desconhecido",
    };
  }
}

/**
 * Consulta processo no PJe
 */
export async function consultarPJe(
  params: ConsultaProcessoParams,
): Promise<CapturaResult> {
  const { numeroProcesso, tribunalId, certificadoId } = params;

  if (!certificadoId) {
    return {
      success: false,
      error: "Certificado digital é obrigatório para consulta PJe",
    };
  }

  try {
    logger.info(`[PJe] Consultando processo: ${numeroProcesso}`);

    // Buscar tenantId do certificado
    const certificado = await prisma.digitalCertificate.findFirst({
      where: { id: certificadoId },
      select: { tenantId: true },
    });

    if (!certificado) {
      return {
        success: false,
        error: "Certificado não encontrado",
      };
    }

    // Autenticar no PJe
    const auth = await autenticarPJe(certificadoId, certificado.tenantId);

    if (auth.error) {
      return {
        success: false,
        error: auth.error,
      };
    }

    // Buscar configuração do tribunal
    let tribunalConfig;
    if (tribunalId) {
      const tribunal = await prisma.tribunal.findFirst({
        where: { id: tribunalId },
      });
      if (tribunal) {
        tribunalConfig = getTribunalConfig({ sigla: tribunal.sigla || undefined });
      }
    }

    // Consulta real via cliente Comunica (mTLS), com normalização para ProcessoJuridico
    const comunica = await fetchComunica({ tenantId: certificado.tenantId });
    const comunicaItems = comunica.items as Record<string, unknown>[];
    const processosMapeados = mapComunicaItemsToProcessos(comunicaItems);
    const processoComunica = findProcessoByNumero(comunicaItems, numeroProcesso);

    if (!processoComunica) {
      return {
        success: false,
        error: `Processo ${numeroProcesso} não encontrado no retorno do Comunica PJe (itens recebidos: ${processosMapeados.length}).`,
      };
    }

    const processo: ProcessoJuridico = {
      ...processoComunica,
      numeroProcesso: processoComunica.numeroProcesso || numeroProcesso,
      tribunalNome: tribunalConfig?.nome ?? processoComunica.tribunalNome,
      tribunalSigla: tribunalConfig?.sigla ?? processoComunica.tribunalSigla,
      sistema: TribunalSistema.PJE,
      esfera: tribunalConfig?.esfera ?? processoComunica.esfera,
      uf: tribunalConfig?.uf ?? processoComunica.uf,
      fonte: "API_COMUNICA",
      capturadoEm: new Date(),
    };

    return {
      success: true,
      processo,
      processos: processosMapeados,
      tempoResposta: 0,
    };
  } catch (error) {
    logger.error(`[PJe] Erro ao consultar processo ${numeroProcesso}:`, error);

    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro desconhecido",
    };
  }
}

/**
 * Captura andamentos de um processo no PJe
 */
export async function capturarAndamentosPJe(
  params: ConsultaProcessoParams,
): Promise<CapturaResult> {
  const resultado = await consultarPJe(params);

  if (!resultado.success || !resultado.processo) {
    return resultado;
  }

  // TODO: Implementar captura específica de andamentos
  // Fazer requisição adicional para endpoint de movimentações
  // Normalizar e retornar

  return {
    ...resultado,
    movimentacoes: resultado.processo.movimentacoes || [],
  };
}

/**
 * Valida se certificado pode ser usado para PJe
 */
export async function validarCertificadoPJe(
  certificadoId: string,
  tenantId: string,
): Promise<{ valid: boolean; error?: string }> {
  try {
    const certificado = await prisma.digitalCertificate.findFirst({
      where: {
        id: certificadoId,
        tenantId,
      },
    });

    if (!certificado) {
      return { valid: false, error: "Certificado não encontrado" };
    }

    if (!certificado.isActive) {
      return { valid: false, error: "Certificado não está ativo" };
    }

    if (certificado.validUntil && certificado.validUntil < new Date()) {
      return { valid: false, error: "Certificado expirado" };
    }

    if (certificado.tipo !== "PJE") {
      return { valid: false, error: "Certificado não é do tipo PJe" };
    }

    return { valid: true };
  } catch (error) {
    logger.error("[PJe] Erro ao validar certificado:", error);
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Erro desconhecido",
    };
  }
}
