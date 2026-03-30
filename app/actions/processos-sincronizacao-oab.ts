"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/app/lib/auth";
import { getAdvogadoIdFromSession } from "@/app/lib/advogado-access";
import prisma from "@/app/lib/prisma";
import { checkPermission } from "@/app/actions/equipe";
import {
  AUDIT_ACTION_SYNC_OAB,
  buildJusbrasilExpectedWebhookUrl,
  createOabSyncAuditEntry,
  isJusbrasilIntegrationEnabledForTenant,
  readOabSyncAuditPayload,
  registerOrRefreshJusbrasilMonitor,
  type OabSyncAuditStatus,
} from "@/app/lib/juridical/jusbrasil-oab-sync";
import { enqueueJusbrasilOabTribprocBackfill } from "@/app/lib/juridical/jusbrasil-oab-tribproc-backfill";
import logger from "@/lib/logger";

type SyncStatus = OabSyncAuditStatus;
const JUSBRASIL_DISCOVERY_SIGLA = "JUSBRASIL";

type SyncActionLikeResult = {
  success: boolean;
  error?: string;
  captchaRequired?: boolean;
  captchaId?: string;
  captchaImage?: string;
  syncedCount?: number;
  createdCount?: number;
  updatedCount?: number;
  processos?: Array<{ numeroProcesso?: string | null }>;
  persisted?: Array<{ numeroProcesso?: string | null }>;
};

type ResolvedSyncContext = {
  oab: string;
  advogadoId: string | null;
  advogadoDisplayName: string;
};

export interface TribunalSincronizacaoOption {
  sigla: string;
  nome: string;
  uf: string;
}

export interface SincronizacaoInicialOabResponse {
  success: boolean;
  tribunalSigla?: string;
  oab?: string;
  syncedCount?: number;
  createdCount?: number;
  updatedCount?: number;
  processosNumeros?: string[];
  error?: string;
  captchaRequired?: boolean;
  captchaId?: string;
  captchaImage?: string;
  provider?: "SCRAPING" | "JUSBRASIL";
  mode?: "SYNC" | "ASYNC_WEBHOOK";
  message?: string;
  monitoramentoRegistrado?: boolean;
  backfillStarted?: boolean;
  correlationId?: string;
  webhookUrl?: string;
}

export interface SincronizacaoInicialHistoricoItem {
  id: string;
  createdAt: string;
  status: SyncStatus;
  tribunalSigla: string;
  oab: string;
  syncedCount: number;
  createdCount: number;
  updatedCount: number;
  error?: string;
  executadoPor: string;
}

export interface SincronizacaoInicialHistoricoResponse {
  success: boolean;
  itens: SincronizacaoInicialHistoricoItem[];
  error?: string;
}

function sanitizeOab(value?: string | null) {
  if (!value) return "";
  return value.replace(/[^0-9A-Za-z]/g, "").toUpperCase().trim();
}

function buildDisplayName(user: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}) {
  const full = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();
  return full || user.email || "Usuario";
}

function toSafeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function extractProcessNumbers(result: SyncActionLikeResult) {
  if (Array.isArray(result.processos) && result.processos.length > 0) {
    return result.processos
      .map((item) =>
        typeof item?.numeroProcesso === "string" ? item.numeroProcesso : "",
      )
      .filter(Boolean);
  }

  if (Array.isArray(result.persisted) && result.persisted.length > 0) {
    return result.persisted
      .map((item) =>
        typeof item?.numeroProcesso === "string" ? item.numeroProcesso : "",
      )
      .filter(Boolean);
  }

  return [];
}

async function resolveSyncContext(params: {
  tenantId: string;
  session: NonNullable<Awaited<ReturnType<typeof getSession>>>;
  oab?: string;
}): Promise<ResolvedSyncContext> {
  const provided = sanitizeOab(params.oab);
  const advogadoId = await getAdvogadoIdFromSession(params.session);
  const sessionDisplayName = buildDisplayName(params.session?.user as any);

  if (!advogadoId) {
    return {
      oab: provided,
      advogadoId: null,
      advogadoDisplayName: sessionDisplayName,
    };
  }

  const advogado = await prisma.advogado.findFirst({
    where: {
      id: advogadoId,
      tenantId: params.tenantId,
    },
    select: {
      id: true,
      oabNumero: true,
      oabUf: true,
      usuario: {
        select: {
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
  });

  const advogadoOab =
    advogado?.oabNumero && advogado.oabUf
      ? sanitizeOab(`${advogado.oabNumero}${advogado.oabUf}`)
      : "";

  return {
    oab: provided || advogadoOab,
    advogadoId: advogado?.id ?? null,
    advogadoDisplayName: advogado?.usuario
      ? buildDisplayName(advogado.usuario)
      : sessionDisplayName,
  };
}

function toPublicResponse(params: {
  tribunalSigla: string;
  oab: string;
  result: SyncActionLikeResult;
  provider?: "SCRAPING" | "JUSBRASIL";
  mode?: "SYNC" | "ASYNC_WEBHOOK";
  message?: string;
  monitoramentoRegistrado?: boolean;
  correlationId?: string;
  webhookUrl?: string;
}): SincronizacaoInicialOabResponse {
  const processosNumeros = extractProcessNumbers(params.result);
  const syncedCount = toSafeNumber(params.result.syncedCount) || processosNumeros.length;

  return {
    success: params.result.success,
    tribunalSigla: params.tribunalSigla,
    oab: params.oab,
    syncedCount,
    createdCount: toSafeNumber(params.result.createdCount),
    updatedCount: toSafeNumber(params.result.updatedCount),
    processosNumeros: processosNumeros.slice(0, 50),
    error: params.result.error,
    captchaRequired: Boolean(params.result.captchaRequired),
    captchaId: params.result.captchaId,
    captchaImage: params.result.captchaImage,
    provider: params.provider,
    mode: params.mode,
    message: params.message,
    monitoramentoRegistrado: params.monitoramentoRegistrado,
    correlationId: params.correlationId,
    webhookUrl: params.webhookUrl,
  };
}

function parseHistoryData(
  value: unknown,
): {
  status: SyncStatus;
  tribunalSigla: string;
  oab: string;
  syncedCount: number;
  createdCount: number;
  updatedCount: number;
  error?: string;
  origem?: string;
} {
  const fallback = {
    status: "ERRO" as SyncStatus,
    tribunalSigla: "-",
    oab: "-",
    syncedCount: 0,
    createdCount: 0,
    updatedCount: 0,
    error: "Dados de historico indisponiveis.",
    origem: undefined,
  };

  const parsed = readOabSyncAuditPayload(value);
  if (!parsed) {
    return fallback;
  }

  return {
    status: parsed.status,
    tribunalSigla: parsed.tribunalSigla,
    oab: parsed.oab,
    syncedCount: parsed.syncedCount,
    createdCount: parsed.createdCount,
    updatedCount: parsed.updatedCount,
    error: parsed.error,
    origem: parsed.origem,
  };
}

export async function listarTribunaisSincronizacaoOab(): Promise<{
  success: boolean;
  tribunais: TribunalSincronizacaoOption[];
  error?: string;
}> {
  const session = await getSession();

  if (!session?.user?.tenantId) {
    return {
      success: false,
      tribunais: [],
      error: "Nao autorizado.",
    };
  }

  const podeSincronizar = await checkPermission("processos", "editar");

  if (!podeSincronizar) {
    return {
      success: false,
      tribunais: [],
      error: "Voce nao tem permissao para sincronizar processos por OAB.",
    };
  }

  return {
    success: true,
    tribunais: [
      {
        sigla: JUSBRASIL_DISCOVERY_SIGLA,
        nome: "Jusbrasil",
        uf: "BR",
      },
    ],
  };
}

export async function sincronizarProcessosIniciaisPorOab(params: {
  tribunalSigla: string;
  oab?: string;
  clienteNome?: string;
}): Promise<SincronizacaoInicialOabResponse> {
  try {
    const session = await getSession();

    if (!session?.user?.tenantId || !session.user.id) {
      return {
        success: false,
        error: "Nao autorizado.",
      };
    }

    const podeSincronizar = await checkPermission("processos", "editar");

    if (!podeSincronizar) {
      return {
        success: false,
        error: "Voce nao tem permissao para sincronizar processos por OAB.",
      };
    }

    const tenantId = session.user.tenantId;
    const usuarioId = session.user.id;
    const tribunalSigla = JUSBRASIL_DISCOVERY_SIGLA;

    const context = await resolveSyncContext({
      tenantId,
      session,
      oab: params.oab,
    });

    if (!context.oab) {
      return {
        success: false,
        tribunalSigla,
        error: "Informe a OAB ou complete o cadastro de OAB do advogado logado.",
      };
    }

    const clienteNome = params.clienteNome?.trim() || undefined;

    if (!(await isJusbrasilIntegrationEnabledForTenant(tenantId))) {
      return {
        success: false,
        tribunalSigla,
        oab: context.oab,
        error:
          "A integracao Jusbrasil esta desativada para este escritorio. Ative em Configuracoes > Jusbrasil para sincronizar processos por OAB.",
      };
    }

    const { monitor, existed } = await registerOrRefreshJusbrasilMonitor({
      oab: context.oab,
      name: context.advogadoDisplayName,
    });

    if (!monitor.correlation_id) {
      throw new Error(
        "Jusbrasil nao retornou correlation_id para o monitoramento da OAB.",
      );
    }

    const webhookUrl = buildJusbrasilExpectedWebhookUrl();

    await createOabSyncAuditEntry({
      tenantId,
      usuarioId,
      tribunalSigla,
      oab: context.oab,
      status: "AGUARDANDO_WEBHOOK",
      origem: "JUSBRASIL_REGISTRO",
      provider: "JUSBRASIL",
      mode: "ASYNC_WEBHOOK",
      entidadeId: monitor.correlation_id,
      correlationId: monitor.correlation_id,
      monitorId: monitor.id,
      advogadoId: context.advogadoId,
      clienteNome,
      webhookUrl,
      existingMonitor: existed,
    });

    await enqueueJusbrasilOabTribprocBackfill({
      job: {
        tenantId,
        usuarioId,
        advogadoId: context.advogadoId,
        tribunalSigla,
        oab: context.oab,
        correlationId: monitor.correlation_id,
        clienteNome: clienteNome ?? null,
        webhookUrl,
      },
    });

    return {
      success: true,
      tribunalSigla,
      oab: context.oab,
      syncedCount: 0,
      createdCount: 0,
      updatedCount: 0,
      processosNumeros: [],
      provider: "JUSBRASIL",
      mode: "ASYNC_WEBHOOK",
      monitoramentoRegistrado: true,
      backfillStarted: true,
      correlationId: monitor.correlation_id,
      webhookUrl,
      message: existed
        ? "Monitoramento Jusbrasil atualizado. O backfill inicial via tribproc foi iniciado e o webhook seguira ativo para novas atualizacoes."
        : "Monitoramento Jusbrasil criado. O backfill inicial via tribproc foi iniciado e o webhook seguira ativo para novas atualizacoes.",
    };
  } catch (error) {
    logger.error("[Processos Sync OAB] Erro ao sincronizar:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro desconhecido.",
    };
  }
}

export async function listarHistoricoSincronizacaoOab(
  limit = 12,
): Promise<SincronizacaoInicialHistoricoResponse> {
  try {
    const session = await getSession();

    if (!session?.user?.tenantId) {
      return {
        success: false,
        itens: [],
        error: "Nao autorizado.",
      };
    }

    const podeSincronizar = await checkPermission("processos", "editar");

    if (!podeSincronizar) {
      return {
        success: false,
        itens: [],
        error: "Voce nao tem permissao para acessar o historico de sincronizacao por OAB.",
      };
    }

    const tenantId = session.user.tenantId;
    const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 30);

    const logs = await prisma.auditLog.findMany({
      where: {
        tenantId,
        acao: AUDIT_ACTION_SYNC_OAB,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: safeLimit,
      select: {
        id: true,
        createdAt: true,
        dados: true,
        usuario: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    const itens: SincronizacaoInicialHistoricoItem[] = logs.map((entry) => {
      const parsed = parseHistoryData(entry.dados);

      return {
        id: entry.id,
        createdAt: entry.createdAt.toISOString(),
        status: parsed.status,
        tribunalSigla: parsed.tribunalSigla,
        oab: parsed.oab,
        syncedCount: parsed.syncedCount,
        createdCount: parsed.createdCount,
        updatedCount: parsed.updatedCount,
        error: parsed.error,
        executadoPor: entry.usuario
          ? buildDisplayName(entry.usuario)
          : parsed.origem === "JUSBRASIL_WEBHOOK"
            ? "Webhook Jusbrasil"
            : "Usuario removido",
      };
    });

    return {
      success: true,
      itens,
    };
  } catch (error) {
    logger.error("[Processos Sync OAB] Erro ao listar historico:", error);
    return {
      success: false,
      itens: [],
      error: error instanceof Error ? error.message : "Erro desconhecido.",
    };
  }
}
