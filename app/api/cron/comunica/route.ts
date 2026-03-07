import { NextRequest, NextResponse } from "next/server";

import { fetchComunica } from "@/lib/api/juridical/pje/comunica";
import { mapComunicaItemsToProcessos } from "@/lib/api/juridical/pje/comunica-normalizer";
import { upsertProcessoFromCapture } from "@/app/lib/juridical/processo-persistence";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { DigitalCertificateScope } from "@/generated/prisma";

export const dynamic = "force-dynamic";

type TenantSyncSummary = {
  tenantId: string;
  tenantName: string | null;
  itensRetornados: number;
  processosNormalizados: number;
  processosCriados: number;
  processosAtualizados: number;
};

async function syncTenantComunica(tenantId: string, tenantName: string | null) {
  const result = await fetchComunica({ tenantId });
  const processos = mapComunicaItemsToProcessos(
    result.items as Record<string, unknown>[],
  );

  let createdCount = 0;
  let updatedCount = 0;

  for (const processo of processos) {
    const persisted = await upsertProcessoFromCapture({
      tenantId,
      processo,
      updateIfExists: true,
    });

    if (persisted.created) createdCount += 1;
    if (persisted.updated) updatedCount += 1;
  }

  const summary: TenantSyncSummary = {
    tenantId,
    tenantName,
    itensRetornados: result.items.length,
    processosNormalizados: processos.length,
    processosCriados: createdCount,
    processosAtualizados: updatedCount,
  };

  await prisma.auditLog.create({
    data: {
      tenantId,
      usuarioId: null,
      acao: "COMUNICA_FETCH",
      entidade: "comunica",
      entidadeId: "comunica-api",
      dados: {
        raw: result.raw,
        resumo: summary,
      } as object,
      previousValues: {},
      changedFields: [],
    },
  });

  return summary;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    logger.error("[Cron Comunica] CRON_SECRET nao configurado.");
    return NextResponse.json(
      { success: false, error: "CRON_SECRET não configurado." },
      { status: 503 },
    );
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { success: false, error: "Não autorizado" },
      { status: 401 },
    );
  }

  const certificates = await prisma.digitalCertificate.findMany({
    where: {
      isActive: true,
      tipo: "PJE",
      scope: DigitalCertificateScope.OFFICE,
    },
    select: {
      tenantId: true,
      tenant: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    distinct: ["tenantId"],
  });

  if (certificates.length === 0) {
    return NextResponse.json(
      { success: false, error: "Nenhum certificado PJE ativo encontrado." },
      { status: 400 },
    );
  }

  const summaries: TenantSyncSummary[] = [];
  const failures: Array<{ tenantId: string; tenantName: string | null; error: string }> = [];

  for (const certificate of certificates) {
    try {
      const summary = await syncTenantComunica(
        certificate.tenantId,
        certificate.tenant?.name ?? null,
      );
      summaries.push(summary);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Erro desconhecido ao coletar Comunica";

      failures.push({
        tenantId: certificate.tenantId,
        tenantName: certificate.tenant?.name ?? null,
        error: message,
      });

      logger.error(
        {
          tenantId: certificate.tenantId,
          tenantName: certificate.tenant?.name ?? null,
          error,
        },
        "Falha ao coletar Comunica PJe para tenant",
      );

      await prisma.auditLog.create({
        data: {
          tenantId: certificate.tenantId,
          usuarioId: null,
          acao: "COMUNICA_FETCH",
          entidade: "comunica",
          entidadeId: "comunica-api",
          dados: {
            erro: message,
          } as object,
          previousValues: {},
          changedFields: [],
        },
      });
    }
  }

  const status = summaries.length > 0 ? 200 : 500;

  return NextResponse.json(
    {
      success: summaries.length > 0,
      totalTenants: certificates.length,
      tenantsSincronizados: summaries.length,
      tenantsComFalha: failures.length,
      resultados: summaries,
      falhas: failures,
    },
    { status },
  );
}
