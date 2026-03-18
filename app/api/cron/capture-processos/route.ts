import { NextRequest, NextResponse } from "next/server";
import prisma from "@/app/lib/prisma";
import {
  getRequestAuditMetadata,
  logOperationalEvent,
} from "@/app/lib/audit/operational-events";
import { capturarProcesso } from "@/app/lib/juridical/capture-service";
import { upsertProcessoFromCapture } from "@/app/lib/juridical/processo-persistence";
import logger from "@/lib/logger";
import { DigitalCertificateScope } from "@/generated/prisma";

/**
 * Endpoint para captura automática de processos
 * 
 * Deve ser chamado por cron job (Vercel Cron, GitHub Actions, etc.)
 * Protegido por token interno
 */
export async function POST(request: NextRequest) {
  const requestMeta = getRequestAuditMetadata(request);

  try {
    // Verificar token de autenticação
    const authHeader = request.headers.get("authorization");
    const expectedToken = process.env.INTERNAL_API_TOKEN;

    if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
      await logOperationalEvent({
        category: "CRON",
        source: "INTERNAL_API",
        action: "CRON_REJECTED",
        status: "WARNING",
        actorType: "CRON",
        route: requestMeta.route,
        ipAddress: requestMeta.ipAddress,
        userAgent: requestMeta.userAgent,
        message: "Captura automática de processos rejeitada por token inválido.",
      });
      return NextResponse.json(
        { error: "Não autorizado" },
        { status: 401 },
      );
    }

    await logOperationalEvent({
      category: "CRON",
      source: "INTERNAL_API",
      action: "CRON_STARTED",
      status: "INFO",
      actorType: "CRON",
      entityType: "SCHEDULE",
      entityId: "capture-processos",
      route: requestMeta.route,
      ipAddress: requestMeta.ipAddress,
      userAgent: requestMeta.userAgent,
      message: "Captura automática de processos iniciada.",
    });

    // Buscar processos que precisam ser atualizados
    // Por enquanto, busca processos com data de última atualização antiga
    const processos = await prisma.processo.findMany({
      where: {
        deletedAt: null,
        // Buscar processos que não foram atualizados nos últimos 7 dias
        updatedAt: {
          lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        },
      },
      take: 10, // Limitar a 10 por execução
      include: {
        tribunal: {
          select: {
            esfera: true,
          },
        },
      },
    });

    logger.info(`[Cron Capture] Processando ${processos.length} processos`);

    const resultados = [];

    for (const processo of processos) {
      try {
        // Buscar certificado ativo do tenant (se necessário)
        let certificadoId: string | undefined;
        if (processo.tribunal?.esfera === "FEDERAL" || processo.tribunal?.esfera === "TRABALHISTA") {
          // Tribunais federais/trabalhistas geralmente usam PJe
          const certificado = await prisma.digitalCertificate.findFirst({
            where: {
              tenantId: processo.tenantId,
              tipo: "PJE",
              isActive: true,
              scope: DigitalCertificateScope.OFFICE,
            },
            orderBy: { createdAt: "desc" },
          });
          certificadoId = certificado?.id;
        }

        const resultado = await capturarProcesso({
          numeroProcesso: processo.numeroCnj || processo.numero,
          tenantId: processo.tenantId,
          tribunalId: processo.tribunalId || undefined,
          certificadoId,
          processoId: processo.id,
        });

        if (resultado.success && resultado.processo) {
          const persistido = await upsertProcessoFromCapture({
            tenantId: processo.tenantId,
            processo: resultado.processo,
            advogadoId: processo.advogadoResponsavelId || undefined,
            updateIfExists: true,
          });

          resultados.push({
            processoId: persistido.processoId,
            numeroProcesso: resultado.processo.numeroProcesso,
            success: true,
            created: persistido.created,
            updated: persistido.updated,
          });
        } else {
          resultados.push({
            processoId: processo.id,
            numeroProcesso: processo.numeroCnj || processo.numero,
            success: false,
            error: resultado.error,
          });
        }
      } catch (error) {
        logger.error(
          `[Cron Capture] Erro ao processar processo ${processo.id}:`,
          error,
        );

        resultados.push({
          processoId: processo.id,
          numeroProcesso: processo.numeroCnj || processo.numero,
          success: false,
          error: error instanceof Error ? error.message : "Erro desconhecido",
        });
      }
    }

    const sucessos = resultados.filter((r) => r.success).length;
    const falhas = resultados.filter((r) => !r.success).length;

    logger.info(
      `[Cron Capture] Concluído: ${sucessos} sucessos, ${falhas} falhas`,
    );

    await logOperationalEvent({
      category: "CRON",
      source: "INTERNAL_API",
      action: falhas > 0 ? "CRON_PARTIAL" : "CRON_SUCCEEDED",
      status: falhas > 0 ? "WARNING" : "SUCCESS",
      actorType: "CRON",
      entityType: "SCHEDULE",
      entityId: "capture-processos",
      route: requestMeta.route,
      ipAddress: requestMeta.ipAddress,
      userAgent: requestMeta.userAgent,
      message: `Captura automática concluída com ${sucessos} sucesso(s) e ${falhas} falha(s).`,
      payload: {
        processados: resultados.length,
        sucessos,
        falhas,
      },
    });

    return NextResponse.json({
      success: true,
      processados: resultados.length,
      sucessos,
      falhas,
      resultados,
    });
  } catch (error) {
    logger.error("[Cron Capture] Erro geral:", error);

    await logOperationalEvent({
      category: "CRON",
      source: "INTERNAL_API",
      action: "CRON_FAILED",
      status: "ERROR",
      actorType: "CRON",
      entityType: "SCHEDULE",
      entityId: "capture-processos",
      route: requestMeta.route,
      ipAddress: requestMeta.ipAddress,
      userAgent: requestMeta.userAgent,
      message:
        error instanceof Error ? error.message : "Falha geral na captura automática.",
    });

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Erro desconhecido",
      },
      { status: 500 },
    );
  }
}
