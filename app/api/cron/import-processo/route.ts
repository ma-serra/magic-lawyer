import { NextRequest, NextResponse } from "next/server";
import prisma from "@/app/lib/prisma";
import {
  getRequestAuditMetadata,
  logOperationalEvent,
} from "@/app/lib/audit/operational-events";
import { capturarProcesso } from "@/app/lib/juridical/capture-service";
import { upsertProcessoFromCapture } from "@/app/lib/juridical/processo-persistence";
import { ProcessoJuridico } from "@/lib/api/juridical/types";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";
const MAX_BATCH_PROCESSOS = Math.max(
  1,
  Number.parseInt(process.env.IMPORT_PROCESSO_MAX_BATCH ?? "100", 10) || 100,
);

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

async function resolveTenantId(tenantId?: string | null) {
  if (tenantId) {
    return tenantId;
  }
  const tenant = await prisma.tenant.findFirst({
    where: { status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  return tenant?.id || null;
}

type CapturePayload = {
  tenantId?: string | null;
  numeroProcesso?: string | null;
  oab?: string | null;
  tribunalSigla?: string | null;
  clienteNome?: string | null;
  advogadoId?: string | null;
  usuarioId?: string | null;
};

async function parsePayload(request: NextRequest): Promise<CapturePayload> {
  if (request.method === "POST") {
    try {
      const body = (await request.json()) as CapturePayload;
      return body ?? {};
    } catch {
      return {};
    }
  }

  const params = request.nextUrl.searchParams;

  return {
    tenantId: params.get("tenantId"),
    numeroProcesso: params.get("numeroProcesso"),
    oab: params.get("oab"),
    tribunalSigla: params.get("tribunalSigla"),
    clienteNome: params.get("clienteNome"),
    advogadoId: params.get("advogadoId"),
    usuarioId: params.get("usuarioId"),
  };
}

async function handle(request: NextRequest) {
  const requestMeta = getRequestAuditMetadata(request);
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (!cronSecret) {
    logger.error("[Cron Import Processo] CRON_SECRET nao configurado.");
    await logOperationalEvent({
      category: "CRON",
      source: "VERCEL_CRON",
      action: "CRON_FAILED",
      status: "ERROR",
      actorType: "CRON",
      entityType: "SCHEDULE",
      entityId: "import-processo",
      route: requestMeta.route,
      ipAddress: requestMeta.ipAddress,
      userAgent: requestMeta.userAgent,
      message: "Importação de processo falhou porque CRON_SECRET não está configurado.",
    });
    return NextResponse.json(
      { success: false, error: "CRON_SECRET não configurado." },
      { status: 503 },
    );
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    await logOperationalEvent({
      category: "CRON",
      source: "VERCEL_CRON",
      action: "CRON_REJECTED",
      status: "WARNING",
      actorType: "CRON",
      entityType: "SCHEDULE",
      entityId: "import-processo",
      route: requestMeta.route,
      ipAddress: requestMeta.ipAddress,
      userAgent: requestMeta.userAgent,
      message: "Importação de processo rejeitada por autorização inválida.",
    });
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  await logOperationalEvent({
    category: "CRON",
    source: "VERCEL_CRON",
    action: "CRON_STARTED",
    status: "INFO",
    actorType: "CRON",
    entityType: "SCHEDULE",
    entityId: "import-processo",
    route: requestMeta.route,
    ipAddress: requestMeta.ipAddress,
    userAgent: requestMeta.userAgent,
    message: "Importação automática de processo iniciada.",
  });

  const payload = await parsePayload(request);
  let tenantId = await resolveTenantId(payload.tenantId ?? undefined);

  let numeroProcesso = payload.numeroProcesso?.trim();
  let oab = payload.oab?.trim();
  const tribunalSigla = payload.tribunalSigla?.trim() || "TJSP";
  const clienteNome = payload.clienteNome?.trim();
  let advogadoId = payload.advogadoId?.trim();

  if (!advogadoId && payload.usuarioId) {
    const advogado = await prisma.advogado.findFirst({
      where: {
        usuarioId: payload.usuarioId,
      },
      select: {
        id: true,
        tenantId: true,
        oabNumero: true,
        oabUf: true,
      },
    });

    if (advogado) {
      advogadoId = advogado.id;
      tenantId = await resolveTenantId(advogado.tenantId);
      if (!oab && advogado.oabNumero && advogado.oabUf) {
        oab = `${advogado.oabNumero}${advogado.oabUf}`;
      }
    }
  }

  if (advogadoId && !oab) {
    const advogado = await prisma.advogado.findFirst({
      where: {
        id: advogadoId,
      },
      select: {
        tenantId: true,
        oabNumero: true,
        oabUf: true,
      },
    });

    if (advogado) {
      tenantId = await resolveTenantId(advogado.tenantId);
      if (advogado.oabNumero && advogado.oabUf) {
        oab = `${advogado.oabNumero}${advogado.oabUf}`;
      }
    }
  }

  if (!tenantId) {
    await logOperationalEvent({
      category: "CRON",
      source: "VERCEL_CRON",
      action: "CRON_FAILED",
      status: "ERROR",
      actorType: "CRON",
      entityType: "SCHEDULE",
      entityId: "import-processo",
      route: requestMeta.route,
      ipAddress: requestMeta.ipAddress,
      userAgent: requestMeta.userAgent,
      message: "Importação automática sem tenant resolvido.",
      payload,
    });
    return NextResponse.json(
      { success: false, error: "Tenant não encontrado para captura." },
      { status: 400 },
    );
  }

  if (!numeroProcesso && !oab) {
    await logOperationalEvent({
      category: "CRON",
      source: "VERCEL_CRON",
      action: "CRON_FAILED",
      status: "ERROR",
      actorType: "CRON",
      entityType: "SCHEDULE",
      entityId: "import-processo",
      route: requestMeta.route,
      ipAddress: requestMeta.ipAddress,
      userAgent: requestMeta.userAgent,
      message: "Importação automática sem número do processo nem OAB.",
      payload,
    });
    return NextResponse.json(
      {
        success: false,
        error: "Informe numeroProcesso, oab ou advogadoId/usuarioId.",
      },
      { status: 400 },
    );
  }

  try {
    const resultado = await capturarProcesso({
      numeroProcesso: numeroProcesso || "",
      oab,
      tenantId,
      tribunalSigla,
    });

    if (!resultado.success) {
      await logOperationalEvent({
        tenantId,
        category: "CRON",
        source: "VERCEL_CRON",
        action: "CRON_FAILED",
        status: "ERROR",
        actorType: "CRON",
        entityType: "SCHEDULE",
        entityId: "import-processo",
        route: requestMeta.route,
        ipAddress: requestMeta.ipAddress,
        userAgent: requestMeta.userAgent,
        message: resultado.error || "Falha ao capturar processo.",
        payload: {
          numeroProcesso,
          oab,
          tribunalSigla,
        },
      });
      return NextResponse.json(
        {
          success: false,
          error: resultado.error || "Falha ao capturar processo.",
        },
        { status: 400 },
      );
    }

    const processosCapturados = dedupeProcessos(
      resultado.processos?.length
        ? resultado.processos
        : resultado.processo
          ? [resultado.processo]
          : [],
    );

    if (processosCapturados.length === 0) {
      await logOperationalEvent({
        tenantId,
        category: "CRON",
        source: "VERCEL_CRON",
        action: "CRON_FAILED",
        status: "ERROR",
        actorType: "CRON",
        entityType: "SCHEDULE",
        entityId: "import-processo",
        route: requestMeta.route,
        ipAddress: requestMeta.ipAddress,
        userAgent: requestMeta.userAgent,
        message: "Captura não retornou processos válidos para persistência.",
        payload: {
          numeroProcesso,
          oab,
          tribunalSigla,
        },
      });
      return NextResponse.json(
        {
          success: false,
          error: "Captura não retornou processos válidos para persistência.",
        },
        { status: 400 },
      );
    }

    const limitedProcessos = processosCapturados.slice(0, MAX_BATCH_PROCESSOS);
    const itens = [];
    let createdCount = 0;
    let updatedCount = 0;

    for (const processoCapturado of limitedProcessos) {
      const persistido = await upsertProcessoFromCapture({
        tenantId,
        processo: processoCapturado,
        clienteNome,
        advogadoId: advogadoId || undefined,
        updateIfExists: true,
      });

      if (persistido.created) {
        createdCount += 1;
      } else if (persistido.updated) {
        updatedCount += 1;
      }

      itens.push({
        processoId: persistido.processoId,
        numeroProcesso: processoCapturado.numeroProcesso,
        created: persistido.created,
        updated: persistido.updated,
        tribunal: processoCapturado.tribunalSigla,
        linkConsulta: processoCapturado.linkConsulta,
      });
    }

    const firstItem = itens[0];

    await logOperationalEvent({
      tenantId,
      category: "CRON",
      source: "VERCEL_CRON",
      action: "CRON_SUCCEEDED",
      status: "SUCCESS",
      actorType: "CRON",
      entityType: "SCHEDULE",
      entityId: "import-processo",
      route: requestMeta.route,
      ipAddress: requestMeta.ipAddress,
      userAgent: requestMeta.userAgent,
      message: `Importação automática concluiu ${itens.length} processo(s).`,
      payload: {
        createdCount,
        updatedCount,
        total: itens.length,
        tenantId,
      },
    });

    return NextResponse.json({
      success: true,
      mode: numeroProcesso ? "single" : "batch",
      totalCapturados: processosCapturados.length,
      totalPersistidos: itens.length,
      truncated: processosCapturados.length > limitedProcessos.length,
      createdCount,
      updatedCount,
      created: Boolean(firstItem?.created),
      updated: Boolean(firstItem?.updated),
      processoId: firstItem?.processoId,
      numeroProcesso: firstItem?.numeroProcesso,
      tribunal: firstItem?.tribunal,
      linkConsulta: firstItem?.linkConsulta,
      itens,
    });
  } catch (error) {
    logger.error("[Cron Import Processo] Erro:", error);

    await logOperationalEvent({
      category: "CRON",
      source: "VERCEL_CRON",
      action: "CRON_FAILED",
      status: "ERROR",
      actorType: "CRON",
      entityType: "SCHEDULE",
      entityId: "import-processo",
      route: requestMeta.route,
      ipAddress: requestMeta.ipAddress,
      userAgent: requestMeta.userAgent,
      message:
        error instanceof Error ? error.message : "Falha geral na importação de processo.",
    });

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro desconhecido",
      },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
