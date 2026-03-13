"use server";

import { randomUUID } from "crypto";
import { resumeHook, start } from "workflow/api";

import { getSession } from "@/app/lib/auth";
import {
  buildInitialPortalProcessSyncState,
  getLatestPortalProcessSyncState,
  getPortalProcessSyncState,
  savePortalProcessSyncState,
  withPortalProcessSyncStatus,
} from "@/app/lib/juridical/process-sync-status-store";
import prisma from "@/app/lib/prisma";
import {
  PortalProcessSyncState,
  isPortalProcessSyncTerminalStatus,
} from "@/app/lib/juridical/process-sync-types";
import {
  buildPortalProcessSyncHookToken,
  type PortalProcessSyncWorkflowInput,
} from "@/app/lib/juridical/process-sync-workflow-shared";
import type { Prisma } from "@/generated/prisma";
import { portalProcessSyncWorkflow } from "@/workflows/portal-process-sync";
import {
  TRIBUNAIS_CONFIG,
  getTribunalConfig,
  getTribunaisScrapingDisponiveis,
} from "@/lib/api/juridical/config";
import logger from "@/lib/logger";

/**
 * Busca a UF principal do tenant (baseada no endereço principal)
 */
export async function getTenantUF(): Promise<string | null> {
  const session = await getSession();

  if (!session?.user?.tenantId) {
    throw new Error("Usuário não autenticado");
  }

  // Buscar endereço principal
  const enderecoPrincipal = await prisma.endereco.findFirst({
    where: {
      tenantId: session.user.tenantId,
      principal: true,
    },
    select: {
      estado: true,
    },
  });

  if (enderecoPrincipal?.estado) {
    return enderecoPrincipal.estado;
  }

  // Fallback: buscar o primeiro endereço se não houver principal
  const primeiroEndereco = await prisma.endereco.findFirst({
    where: {
      tenantId: session.user.tenantId,
    },
    select: {
      estado: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  return primeiroEndereco?.estado || null;
}

/**
 * Lista todas as UFs onde o tenant tem processos
 */
export async function getProcessosUFs(): Promise<string[]> {
  const session = await getSession();

  if (!session?.user?.tenantId) {
    throw new Error("Usuário não autenticado");
  }

  // Buscar processos com tribunal
  const processos = await prisma.processo.findMany({
    where: {
      tenantId: session.user.tenantId,
      tribunalId: { not: null },
      deletedAt: null,
    },
    include: {
      tribunal: {
        select: {
          uf: true,
        },
      },
    },
  });

  // Extrair UFs únicas e válidas
  const ufs = new Set<string>();

  processos.forEach((processo) => {
    if (processo.tribunal?.uf) {
      ufs.add(processo.tribunal.uf);
    }
  });

  return Array.from(ufs).sort();
}

/**
 * Lista todos os tribunais de uma UF específica
 */
export async function getTribunaisPorUF(uf: string): Promise<
  Array<{
    id: string;
    nome: string;
    sigla: string | null;
    uf: string | null;
    siteUrl: string | null;
    esfera: string | null;
  }>
> {
  const session = await getSession();

  if (!session?.user?.tenantId) {
    throw new Error("Usuário não autenticado");
  }

  const normalizedUf = (uf || "").trim().toUpperCase();

  const tribunaisTenant = await prisma.tribunal.findMany({
    where: {
      uf: normalizedUf,
      OR: [{ tenantId: session.user.tenantId }, { tenantId: null }],
    },
    select: {
      id: true,
      nome: true,
      sigla: true,
      uf: true,
      siteUrl: true,
      esfera: true,
    },
    orderBy: {
      nome: "asc",
    },
  });

  const tribunaisOficiais = TRIBUNAIS_CONFIG.filter(
    (tribunal) => tribunal.uf.toUpperCase() === normalizedUf,
  ).map((tribunal) => ({
    id: `official-${tribunal.sigla.toLowerCase()}`,
    nome: tribunal.nome,
    sigla: tribunal.sigla,
    uf: tribunal.uf,
    siteUrl: tribunal.urlConsulta || tribunal.urlBase || null,
    esfera: tribunal.esfera,
  }));

  const mergedByKey = new Map<
    string,
    {
      id: string;
      nome: string;
      sigla: string | null;
      uf: string | null;
      siteUrl: string | null;
      esfera: string | null;
    }
  >();

  for (const tribunal of tribunaisOficiais) {
    const key = (tribunal.sigla || tribunal.nome).toUpperCase();
    mergedByKey.set(key, tribunal);
  }

  for (const tribunal of tribunaisTenant) {
    const key = (tribunal.sigla || tribunal.nome).toUpperCase();
    const existing = mergedByKey.get(key);

    if (!existing) {
      mergedByKey.set(key, tribunal);
      continue;
    }

    mergedByKey.set(key, {
      ...existing,
      id: tribunal.id,
      nome: tribunal.nome || existing.nome,
      sigla: tribunal.sigla ?? existing.sigla,
      uf: tribunal.uf ?? existing.uf,
      siteUrl: tribunal.siteUrl || existing.siteUrl,
      esfera: tribunal.esfera ?? existing.esfera,
    });
  }

  return Array.from(mergedByKey.values()).sort((a, b) =>
    a.nome.localeCompare(b.nome, "pt-BR"),
  );
}

/**
 * Busca todas as UFs disponíveis (tenant + processos)
 */
export async function getUFsDisponiveis(): Promise<string[]> {
  const session = await getSession();

  if (!session?.user?.tenantId) {
    throw new Error("Usuário não autenticado");
  }

  const [tenantUF, processosUFs] = await Promise.all([
    getTenantUF(),
    getProcessosUFs(),
  ]);

  // Combinar e remover duplicatas
  const ufs = new Set<string>();

  if (tenantUF) {
    ufs.add(tenantUF);
  }
  processosUFs.forEach((uf) => ufs.add(uf));

  return Array.from(ufs).sort();
}

function sanitizeOab(value?: string | null) {
  if (!value) return "";
  return value.replace(/[^0-9A-Za-z]/g, "").toUpperCase().trim();
}

function normalizeNumeroProcesso(value?: string | null) {
  if (!value) return "";
  return value.replace(/\D/g, "");
}

function hasExternalSyncTag(tags: Prisma.JsonValue | null | undefined) {
  if (!Array.isArray(tags)) {
    return false;
  }

  return tags.some(
    (tag) =>
      typeof tag === "string" &&
      tag.trim().toLowerCase() === "origem:sincronizacao_externa",
  );
}

function toPublicSyncState(state: PortalProcessSyncState) {
  return {
    syncId: state.syncId,
    tribunalSigla: state.tribunalSigla,
    oab: state.oab,
    status: state.status,
    syncedCount: state.syncedCount,
    createdCount: state.createdCount,
    updatedCount: state.updatedCount,
    processosNumeros: state.processosNumeros,
    error: state.error,
    captchaId: state.captchaId,
    captchaImage: state.captchaImage,
    createdAt: state.createdAt,
    startedAt: state.startedAt,
    finishedAt: state.finishedAt,
    updatedAt: state.updatedAt,
  };
}

async function resolveAdvogadoContext(params: {
  tenantId: string;
  usuarioId: string;
  oab?: string;
}) {
  const providedOab = sanitizeOab(params.oab);

  const advogado = await prisma.advogado.findFirst({
    where: {
      tenantId: params.tenantId,
      usuarioId: params.usuarioId,
    },
    select: {
      id: true,
      oabNumero: true,
      oabUf: true,
    },
  });

  const advogadoOab =
    advogado?.oabNumero && advogado.oabUf
      ? sanitizeOab(`${advogado.oabNumero}${advogado.oabUf}`)
      : "";

  return {
    advogadoId: advogado?.id ?? null,
    oab: providedOab || advogadoOab,
  };
}

function isAdminRole(role?: string | null): boolean {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

async function getProcessoScopeForPortal(
  session: Awaited<ReturnType<typeof getSession>>,
): Promise<Prisma.ProcessoWhereInput | undefined> {
  const user = session?.user as any;

  if (!session?.user || isAdminRole(user?.role)) {
    return undefined;
  }

  if (user?.role === "CLIENTE") {
    if (!user?.clienteId) {
      return { id: "__CLIENTE_SEM_ACESSO__" };
    }

    return { clienteId: user.clienteId };
  }

  const { getAccessibleAdvogadoIds } = await import("@/app/lib/advogado-access");
  const accessibleAdvogados = await getAccessibleAdvogadoIds(session);

  if (
    accessibleAdvogados.length === 0 ||
    (accessibleAdvogados.length === 1 &&
      String(accessibleAdvogados[0]).startsWith("__"))
  ) {
    return { id: "__SEM_ACESSO_A_PROCESSOS__" };
  }

  return {
    advogadoResponsavelId: {
      in: accessibleAdvogados,
    },
  };
}

export async function getTribunaisSincronizacaoPortalAdvogado(): Promise<{
  success: boolean;
  tribunais: Array<{
    sigla: string;
    nome: string;
    uf: string;
    urlBase?: string;
    urlConsulta?: string;
  }>;
  error?: string;
}> {
  const session = await getSession();

  if (!session?.user?.tenantId) {
    return {
      success: false,
      tribunais: [],
      error: "Não autorizado.",
    };
  }

  const tribunais = getTribunaisScrapingDisponiveis()
    .map((item) => ({
      sigla: item.sigla,
      nome: item.nome,
      uf: item.uf,
      urlBase: item.urlBase,
      urlConsulta: item.urlConsulta,
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  return {
    success: true,
    tribunais,
  };
}

export async function iniciarSincronizacaoMeusProcessos(params?: {
  tribunalSigla?: string;
  oab?: string;
  clienteNome?: string;
}): Promise<{
  success: boolean;
  syncId?: string;
  status?: ReturnType<typeof toPublicSyncState>;
  error?: string;
}> {
  try {
    const session = await getSession();

    if (!session?.user?.tenantId || !session.user.id) {
      return { success: false, error: "Não autorizado." };
    }

    const tenantId = session.user.tenantId;
    const usuarioId = session.user.id;
    const tribunalSigla = (params?.tribunalSigla || "TJSP").trim().toUpperCase();

    const tribunaisSuportados = getTribunaisScrapingDisponiveis().map(
      (item) => item.sigla,
    );

    if (!tribunaisSuportados.includes(tribunalSigla)) {
      return {
        success: false,
        error: `Tribunal ${tribunalSigla} não está habilitado para sincronização por OAB.`,
      };
    }

    const latestState = await getLatestPortalProcessSyncState({
      tenantId,
      usuarioId,
    });

    if (
      latestState &&
      !isPortalProcessSyncTerminalStatus(latestState.status)
    ) {
      return {
        success: false,
        syncId: latestState.syncId,
        status: toPublicSyncState(latestState),
        error:
          latestState.status === "WAITING_CAPTCHA"
            ? "Existe uma sincronização aguardando captcha. Resolva para continuar."
            : "Já existe uma sincronização em andamento.",
      };
    }

    const ctx = await resolveAdvogadoContext({
      tenantId,
      usuarioId,
      oab: params?.oab,
    });

    if (!ctx.oab) {
      return {
        success: false,
        error:
          "Não encontramos OAB válida no seu perfil. Atualize seu cadastro ou informe manualmente.",
      };
    }

    const syncId = randomUUID();
    const initialState = buildInitialPortalProcessSyncState({
      syncId,
      tenantId,
      usuarioId,
      advogadoId: ctx.advogadoId,
      tribunalSigla,
      oab: ctx.oab,
      mode: "INITIAL",
    });

    await savePortalProcessSyncState(initialState);

    const workflowInput: PortalProcessSyncWorkflowInput = {
      syncId,
      tenantId,
      usuarioId,
      advogadoId: ctx.advogadoId,
      tribunalSigla,
      oab: ctx.oab,
      clienteNome: params?.clienteNome?.trim() || undefined,
    };

    let runId: string;
    try {
      const run = await start(portalProcessSyncWorkflow, [workflowInput]);
      runId = run.runId;
    } catch (error) {
      const failedState = withPortalProcessSyncStatus(initialState, "FAILED", {
        error:
          error instanceof Error
            ? error.message
            : "Falha ao iniciar a sincronização no Workflow.",
      });
      await savePortalProcessSyncState(failedState);

      throw error;
    }

    const persistedState =
      (await getPortalProcessSyncState(syncId)) ?? initialState;
    const queuedState: PortalProcessSyncState = {
      ...persistedState,
      queueJobId: runId,
      updatedAt: new Date().toISOString(),
    };

    await savePortalProcessSyncState(queuedState);

    return {
      success: true,
      syncId,
      status: toPublicSyncState(queuedState),
    };
  } catch (error) {
    logger.error("[Portal Advogado] Erro ao iniciar sincronização:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro desconhecido.",
    };
  }
}

export async function getStatusSincronizacaoMeusProcessos(params?: {
  syncId?: string;
}): Promise<{
  success: boolean;
  status?: ReturnType<typeof toPublicSyncState>;
  error?: string;
}> {
  try {
    const session = await getSession();

    if (!session?.user?.tenantId || !session.user.id) {
      return { success: false, error: "Não autorizado." };
    }

    const tenantId = session.user.tenantId;
    const usuarioId = session.user.id;

    const state = params?.syncId
      ? await getPortalProcessSyncState(params.syncId)
      : await getLatestPortalProcessSyncState({ tenantId, usuarioId });

    if (!state) {
      return {
        success: true,
        status: undefined,
      };
    }

    if (state.tenantId !== tenantId || state.usuarioId !== usuarioId) {
      return {
        success: false,
        error: "Sincronização não pertence ao usuário atual.",
      };
    }

    return {
      success: true,
      status: toPublicSyncState(state),
    };
  } catch (error) {
    logger.error("[Portal Advogado] Erro ao buscar status da sincronização:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro desconhecido.",
    };
  }
}

export async function resolverCaptchaSincronizacaoMeusProcessos(params: {
  syncId: string;
  captchaText: string;
}): Promise<{
  success: boolean;
  status?: ReturnType<typeof toPublicSyncState>;
  error?: string;
}> {
  try {
    const session = await getSession();

    if (!session?.user?.tenantId || !session.user.id) {
      return { success: false, error: "Não autorizado." };
    }

    const tenantId = session.user.tenantId;
    const usuarioId = session.user.id;
    const captchaText = (params.captchaText || "").trim();

    if (!captchaText) {
      return {
        success: false,
        error: "Informe o captcha para continuar.",
      };
    }

    const state = await getPortalProcessSyncState(params.syncId);

    if (!state) {
      return {
        success: false,
        error: "Sincronização não encontrada ou expirada.",
      };
    }

    if (state.tenantId !== tenantId || state.usuarioId !== usuarioId) {
      return {
        success: false,
        error: "Sincronização não pertence ao usuário atual.",
      };
    }

    if (state.status !== "WAITING_CAPTCHA" || !state.captchaId) {
      return {
        success: false,
        status: toPublicSyncState(state),
        error: "Esta sincronização não está aguardando captcha.",
      };
    }

    const queuedState: PortalProcessSyncState = {
      ...state,
      mode: "CAPTCHA",
      status: "QUEUED",
      error: undefined,
      updatedAt: new Date().toISOString(),
    };
    await savePortalProcessSyncState(queuedState);

    try {
      await resumeHook(buildPortalProcessSyncHookToken(state.syncId), {
        action: "SOLVE",
        captchaText,
      });
    } catch (error) {
      await savePortalProcessSyncState(state);
      throw error;
    }

    return {
      success: true,
      status: toPublicSyncState(queuedState),
    };
  } catch (error) {
    logger.error("[Portal Advogado] Erro ao resolver captcha:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro desconhecido.",
    };
  }
}

export async function gerarNovoCaptchaSincronizacaoMeusProcessos(params: {
  syncId: string;
}): Promise<{
  success: boolean;
  status?: ReturnType<typeof toPublicSyncState>;
  error?: string;
}> {
  try {
    const session = await getSession();

    if (!session?.user?.tenantId || !session.user.id) {
      return { success: false, error: "Não autorizado." };
    }

    const tenantId = session.user.tenantId;
    const usuarioId = session.user.id;

    const state = await getPortalProcessSyncState(params.syncId);

    if (!state) {
      return {
        success: false,
        error: "Sincronização não encontrada ou expirada.",
      };
    }

    if (state.tenantId !== tenantId || state.usuarioId !== usuarioId) {
      return {
        success: false,
        error: "Sincronização não pertence ao usuário atual.",
      };
    }

    if (state.status !== "WAITING_CAPTCHA") {
      return {
        success: false,
        status: toPublicSyncState(state),
        error: "Esta sincronização não está aguardando captcha.",
      };
    }

    const queuedState: PortalProcessSyncState = {
      ...state,
      mode: "INITIAL",
      status: "QUEUED",
      error: undefined,
      captchaId: undefined,
      captchaImage: undefined,
      updatedAt: new Date().toISOString(),
    };
    await savePortalProcessSyncState(queuedState);

    try {
      await resumeHook(buildPortalProcessSyncHookToken(state.syncId), {
        action: "REFRESH",
      });
    } catch (error) {
      await savePortalProcessSyncState(state);
      throw error;
    }

    return {
      success: true,
      status: toPublicSyncState(queuedState),
    };
  } catch (error) {
    logger.error("[Portal Advogado] Erro ao gerar novo captcha:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro desconhecido.",
    };
  }
}

type PortalProcessoSincronizado = {
  id: string;
  numero: string;
  numeroCnj: string | null;
  titulo: string | null;
  status: string;
  origemExterna: boolean;
  updatedAt: string;
  cliente: {
    id: string;
    nome: string;
  };
  tribunal: {
    id: string;
    nome: string;
    sigla: string | null;
    uf: string | null;
  } | null;
};

export async function getProcessosSincronizadosPortalAdvogado(params?: {
  syncId?: string;
  limit?: number;
}): Promise<{
  success: boolean;
  syncId?: string;
  totalReferencias: number;
  processos: PortalProcessoSincronizado[];
  error?: string;
}> {
  try {
    const session = await getSession();

    if (!session?.user?.tenantId || !session.user.id) {
      return {
        success: false,
        totalReferencias: 0,
        processos: [],
        error: "Não autorizado.",
      };
    }

    const tenantId = session.user.tenantId;
    const usuarioId = session.user.id;
    const limit = Math.min(Math.max(params?.limit ?? 30, 1), 100);

    const state = params?.syncId
      ? await getPortalProcessSyncState(params.syncId)
      : await getLatestPortalProcessSyncState({ tenantId, usuarioId });

    if (!state) {
      return {
        success: true,
        totalReferencias: 0,
        processos: [],
      };
    }

    if (state.tenantId !== tenantId || state.usuarioId !== usuarioId) {
      return {
        success: false,
        totalReferencias: 0,
        processos: [],
        error: "Sincronização não pertence ao usuário atual.",
      };
    }

    const numerosReferencia = Array.from(
      new Set(
        (state.processosNumeros ?? [])
          .map((numero) => numero?.trim())
          .filter((numero): numero is string => Boolean(numero)),
      ),
    );

    if (numerosReferencia.length === 0) {
      return {
        success: true,
        syncId: state.syncId,
        totalReferencias: 0,
        processos: [],
      };
    }

    const whereByNumero = numerosReferencia.flatMap((numero) => [
      { numero },
      { numeroCnj: numero },
    ]);

    const processosByNumero = await prisma.processo.findMany({
      where: {
        tenantId,
        deletedAt: null,
        OR: whereByNumero,
      },
      select: {
        id: true,
        numero: true,
        numeroCnj: true,
        titulo: true,
        status: true,
        tags: true,
        updatedAt: true,
        cliente: {
          select: {
            id: true,
            nome: true,
          },
        },
        tribunal: {
          select: {
            id: true,
            nome: true,
            sigla: true,
            uf: true,
          },
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
      take: 150,
    });

    const normalizedRefs = new Set(
      numerosReferencia
        .map((numero) => normalizeNumeroProcesso(numero))
        .filter(Boolean),
    );

    let processos = processosByNumero;

    if (processos.length < Math.min(numerosReferencia.length, limit)) {
      const fallbackProcessos = await prisma.processo.findMany({
        where: {
          tenantId,
          deletedAt: null,
        },
        select: {
          id: true,
          numero: true,
          numeroCnj: true,
          titulo: true,
          status: true,
          tags: true,
          updatedAt: true,
          cliente: {
            select: {
              id: true,
              nome: true,
            },
          },
          tribunal: {
            select: {
              id: true,
              nome: true,
              sigla: true,
              uf: true,
            },
          },
        },
        orderBy: {
          updatedAt: "desc",
        },
        take: 300,
      });

      const fallbackMatched = fallbackProcessos.filter((processo) => {
        const numeroNormalizado = normalizeNumeroProcesso(processo.numero);
        const numeroCnjNormalizado = normalizeNumeroProcesso(processo.numeroCnj);
        return (
          normalizedRefs.has(numeroNormalizado) ||
          normalizedRefs.has(numeroCnjNormalizado)
        );
      });

      const mergedById = new Map<string, (typeof fallbackMatched)[number]>();
      for (const item of [...processosByNumero, ...fallbackMatched]) {
        mergedById.set(item.id, item);
      }
      processos = Array.from(mergedById.values()).sort(
        (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
      );
    }

    return {
      success: true,
      syncId: state.syncId,
      totalReferencias: numerosReferencia.length,
      processos: processos.slice(0, limit).map((processo) => ({
        id: processo.id,
        numero: processo.numero,
        numeroCnj: processo.numeroCnj,
        titulo: processo.titulo,
        status: processo.status,
        origemExterna:
          hasExternalSyncTag(processo.tags) ||
          normalizedRefs.has(normalizeNumeroProcesso(processo.numero)) ||
          normalizedRefs.has(normalizeNumeroProcesso(processo.numeroCnj)),
        updatedAt: processo.updatedAt.toISOString(),
        cliente: {
          id: processo.cliente.id,
          nome: processo.cliente.nome,
        },
        tribunal: processo.tribunal
          ? {
              id: processo.tribunal.id,
              nome: processo.tribunal.nome,
              sigla: processo.tribunal.sigla,
              uf: processo.tribunal.uf,
            }
          : null,
      })),
    };
  } catch (error) {
    logger.error(
      "[Portal Advogado] Erro ao listar processos sincronizados:",
      error,
    );
    return {
      success: false,
      totalReferencias: 0,
      processos: [],
      error: error instanceof Error ? error.message : "Erro desconhecido.",
    };
  }
}

type RecursoOficialRadar = {
  id: string;
  titulo: string;
  descricao: string;
  url: string;
  categoria: "calendario" | "comunicados" | "links";
  oficial: true;
};

export async function getRecursosOficiaisPortalAdvogado(params?: {
  tribunalSigla?: string;
}): Promise<{
  success: boolean;
  tribunalSigla: string;
  tribunalNome: string;
  recursos: RecursoOficialRadar[];
  error?: string;
}> {
  try {
    const session = await getSession();

    if (!session?.user?.tenantId || !session.user.id) {
      return {
        success: false,
        tribunalSigla: "TJSP",
        tribunalNome: "Tribunal não identificado",
        recursos: [],
        error: "Não autorizado.",
      };
    }

    const tribunalSigla = (params?.tribunalSigla || "TJSP").toUpperCase();
    const tribunalConfig = getTribunalConfig({ sigla: tribunalSigla });
    const tribunalNome = tribunalConfig?.nome ?? tribunalSigla;

    const recursos: RecursoOficialRadar[] = [];

    if (tribunalConfig?.urlBase) {
      recursos.push(
        {
          id: "calendario-tribunal",
          categoria: "calendario",
          titulo: `Recesso e expediente no ${tribunalSigla}`,
          descricao:
            "Consulta oficial no portal do tribunal sobre funcionamento, expediente e atos administrativos.",
          url: tribunalConfig.urlBase,
          oficial: true,
        },
        {
          id: "comunicados-tribunal",
          categoria: "comunicados",
          titulo: `Comunicados e avisos do ${tribunalSigla}`,
          descricao:
            "Fonte oficial do tribunal para avisos operacionais, notas e comunicados institucionais.",
          url: tribunalConfig.urlBase,
          oficial: true,
        },
      );
    }

    if (tribunalConfig?.urlConsulta) {
      recursos.push({
        id: "consulta-publica-tribunal",
        categoria: "links",
        titulo: `Consulta processual ${tribunalSigla}`,
        descricao:
          "Acesso direto ao ambiente oficial de consulta processual pública.",
        url: tribunalConfig.urlConsulta,
        oficial: true,
      });
    }

    recursos.push(
      {
        id: "cnj-agenda",
        categoria: "calendario",
        titulo: "Agenda oficial CNJ",
        descricao:
          "Calendário institucional do Conselho Nacional de Justiça.",
        url: "https://www.cnj.jus.br/agenda-cnj/",
        oficial: true,
      },
      {
        id: "cnj-noticias",
        categoria: "comunicados",
        titulo: "Comunicados e notícias CNJ",
        descricao:
          "Atualizações oficiais do CNJ sobre atos, resoluções e comunicados.",
        url: "https://www.cnj.jus.br/category/noticias/",
        oficial: true,
      },
      {
        id: "cnj-home",
        categoria: "links",
        titulo: "Conselho Nacional de Justiça (CNJ)",
        descricao: "Portal institucional oficial do CNJ.",
        url: "https://www.cnj.jus.br/",
        oficial: true,
      },
      {
        id: "oab-home",
        categoria: "links",
        titulo: "OAB Nacional",
        descricao: "Portal oficial da Ordem dos Advogados do Brasil.",
        url: "https://www.oab.org.br/",
        oficial: true,
      },
      {
        id: "pje-home",
        categoria: "links",
        titulo: "PJe",
        descricao: "Portal oficial do Processo Judicial Eletrônico.",
        url: "https://pje.jus.br/",
        oficial: true,
      },
    );

    return {
      success: true,
      tribunalSigla,
      tribunalNome,
      recursos,
    };
  } catch (error) {
    logger.error("[Portal Advogado] Erro ao buscar recursos oficiais:", error);
    return {
      success: false,
      tribunalSigla: "TJSP",
      tribunalNome: "Tribunal não identificado",
      recursos: [],
      error: error instanceof Error ? error.message : "Erro desconhecido.",
    };
  }
}

type PortalProcessoResumo = {
  id: string;
  numero: string;
  titulo: string | null;
  status: string;
  clienteNome: string;
  advogadoResponsavelNome?: string | null;
};

type PortalPrazoResumo = {
  id: string;
  titulo: string;
  dataVencimento: string;
  processo: PortalProcessoResumo;
};

type PortalAudienciaResumo = {
  id: string;
  titulo: string;
  dataInicio: string;
  status: string;
  processo: PortalProcessoResumo | null;
};

type PortalFeedCriticoItem = {
  id: string;
  titulo: string;
  descricao: string | null;
  tipo: string | null;
  prioridade: string;
  statusOperacional: string;
  dataMovimentacao: string;
  processo: PortalProcessoResumo;
};

type PortalSaudeItem = {
  id: string;
  numero: string;
  titulo: string | null;
  clienteNome: string;
  diasSemMovimento?: number;
};

export async function getPainelOperacionalPortalAdvogado(params?: {
  limit?: number;
}): Promise<{
  success: boolean;
  prioridade: {
    prazosVencidos: number;
    prazos7Dias: number;
    audienciasSemana: number;
    intimacoesNovas24h: number;
  };
  listas: {
    proximosPrazos: PortalPrazoResumo[];
    audienciasSemana: PortalAudienciaResumo[];
    feedCritico: PortalFeedCriticoItem[];
    processosSemMovimento30d: PortalSaudeItem[];
    processosSemResponsavel: PortalSaudeItem[];
  };
  saude: {
    processosAtivos: number;
    semMovimento30d: number;
    semResponsavel: number;
    semMovimentacaoHistorica: number;
  };
  error?: string;
}> {
  try {
    const session = await getSession();

    if (!session?.user?.tenantId || !session.user.id) {
      return {
        success: false,
        prioridade: {
          prazosVencidos: 0,
          prazos7Dias: 0,
          audienciasSemana: 0,
          intimacoesNovas24h: 0,
        },
        listas: {
          proximosPrazos: [],
          audienciasSemana: [],
          feedCritico: [],
          processosSemMovimento30d: [],
          processosSemResponsavel: [],
        },
        saude: {
          processosAtivos: 0,
          semMovimento30d: 0,
          semResponsavel: 0,
          semMovimentacaoHistorica: 0,
        },
        error: "Não autorizado.",
      };
    }

    const tenantId = session.user.tenantId;
    const limit = Math.min(Math.max(params?.limit ?? 8, 3), 20);
    const now = new Date();
    const startToday = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const end7Days = new Date(startToday);
    end7Days.setUTCDate(end7Days.getUTCDate() + 7);
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const processoScope = await getProcessoScopeForPortal(session);
    const baseProcessoWhere: Prisma.ProcessoWhereInput = {
      tenantId,
      deletedAt: null,
      status: {
        in: ["EM_ANDAMENTO", "SUSPENSO"],
      },
      ...(processoScope ? processoScope : {}),
    };

    const prazoWhereBase: Prisma.ProcessoPrazoWhereInput = {
      tenantId,
      status: "ABERTO",
      processo: baseProcessoWhere,
    };

    const [prazosVencidos, prazos7Dias, audienciasSemana, intimacoesNovas24h] =
      await Promise.all([
        prisma.processoPrazo.count({
          where: {
            ...prazoWhereBase,
            dataVencimento: {
              lt: now,
            },
          },
        }),
        prisma.processoPrazo.count({
          where: {
            ...prazoWhereBase,
            dataVencimento: {
              gte: now,
              lte: end7Days,
            },
          },
        }),
        prisma.evento.count({
          where: {
            tenantId,
            tipo: "AUDIENCIA",
            status: {
              in: ["AGENDADO", "CONFIRMADO"],
            },
            dataInicio: {
              gte: startToday,
              lte: end7Days,
            },
            processo: baseProcessoWhere,
          },
        }),
        prisma.movimentacaoProcesso.count({
          where: {
            tenantId,
            tipo: "INTIMACAO",
            dataMovimentacao: {
              gte: last24h,
            },
            processo: baseProcessoWhere,
          },
        }),
      ]);

    const [
      proximosPrazosRaw,
      audienciasSemanaRaw,
      feedCriticoRaw,
      processosAtivosCount,
      processosSemMovimentoCount,
      processosSemResponsavelCount,
      processosSemHistoricoCount,
      processosSemMovimentoRaw,
      processosSemResponsavelRaw,
    ] = await Promise.all([
      prisma.processoPrazo.findMany({
        where: {
          ...prazoWhereBase,
          dataVencimento: {
            gte: now,
            lte: end7Days,
          },
        },
        select: {
          id: true,
          titulo: true,
          dataVencimento: true,
          processo: {
            select: {
              id: true,
              numero: true,
              titulo: true,
              status: true,
              cliente: {
                select: {
                  nome: true,
                },
              },
              advogadoResponsavel: {
                select: {
                  usuario: {
                    select: {
                      firstName: true,
                      lastName: true,
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: {
          dataVencimento: "asc",
        },
        take: limit,
      }),
      prisma.evento.findMany({
        where: {
          tenantId,
          tipo: "AUDIENCIA",
          status: {
            in: ["AGENDADO", "CONFIRMADO"],
          },
          dataInicio: {
            gte: startToday,
            lte: end7Days,
          },
          processo: baseProcessoWhere,
        },
        select: {
          id: true,
          titulo: true,
          dataInicio: true,
          status: true,
          processo: {
            select: {
              id: true,
              numero: true,
              titulo: true,
              status: true,
              cliente: {
                select: {
                  nome: true,
                },
              },
              advogadoResponsavel: {
                select: {
                  usuario: {
                    select: {
                      firstName: true,
                      lastName: true,
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: {
          dataInicio: "asc",
        },
        take: limit,
      }),
      prisma.movimentacaoProcesso.findMany({
        where: {
          tenantId,
          statusOperacional: {
            not: "RESOLVIDO",
          },
          processo: baseProcessoWhere,
          OR: [
            {
              prioridade: {
                in: ["CRITICA", "ALTA"],
              },
            },
            {
              tipo: {
                in: ["INTIMACAO", "AUDIENCIA"],
              },
            },
          ],
        },
        select: {
          id: true,
          titulo: true,
          descricao: true,
          tipo: true,
          prioridade: true,
          statusOperacional: true,
          dataMovimentacao: true,
          processo: {
            select: {
              id: true,
              numero: true,
              titulo: true,
              status: true,
              cliente: {
                select: {
                  nome: true,
                },
              },
              advogadoResponsavel: {
                select: {
                  usuario: {
                    select: {
                      firstName: true,
                      lastName: true,
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: {
          dataMovimentacao: "desc",
        },
        take: Math.max(limit, 10),
      }),
      prisma.processo.count({
        where: baseProcessoWhere,
      }),
      prisma.processo.count({
        where: {
          ...baseProcessoWhere,
          NOT: {
            movimentacoes: {
              some: {
                dataMovimentacao: {
                  gte: last30Days,
                },
              },
            },
          },
        },
      }),
      prisma.processo.count({
        where: {
          ...baseProcessoWhere,
          advogadoResponsavelId: null,
        },
      }),
      prisma.processo.count({
        where: {
          ...baseProcessoWhere,
          movimentacoes: {
            none: {},
          },
        },
      }),
      prisma.processo.findMany({
        where: {
          ...baseProcessoWhere,
          NOT: {
            movimentacoes: {
              some: {
                dataMovimentacao: {
                  gte: last30Days,
                },
              },
            },
          },
        },
        select: {
          id: true,
          numero: true,
          titulo: true,
          cliente: {
            select: {
              nome: true,
            },
          },
          movimentacoes: {
            select: {
              dataMovimentacao: true,
            },
            orderBy: {
              dataMovimentacao: "desc",
            },
            take: 1,
          },
        },
        orderBy: {
          updatedAt: "desc",
        },
        take: limit,
      }),
      prisma.processo.findMany({
        where: {
          ...baseProcessoWhere,
          advogadoResponsavelId: null,
        },
        select: {
          id: true,
          numero: true,
          titulo: true,
          cliente: {
            select: {
              nome: true,
            },
          },
        },
        orderBy: {
          updatedAt: "desc",
        },
        take: limit,
      }),
    ]);

    const formatResponsavel = (first?: string | null, last?: string | null) => {
      const full = `${first || ""} ${last || ""}`.trim();
      return full || null;
    };

    return {
      success: true,
      prioridade: {
        prazosVencidos,
        prazos7Dias,
        audienciasSemana,
        intimacoesNovas24h,
      },
      listas: {
        proximosPrazos: proximosPrazosRaw.map((item) => ({
          id: item.id,
          titulo: item.titulo,
          dataVencimento: item.dataVencimento.toISOString(),
          processo: {
            id: item.processo.id,
            numero: item.processo.numero,
            titulo: item.processo.titulo,
            status: item.processo.status,
            clienteNome: item.processo.cliente.nome,
            advogadoResponsavelNome: formatResponsavel(
              item.processo.advogadoResponsavel?.usuario.firstName,
              item.processo.advogadoResponsavel?.usuario.lastName,
            ),
          },
        })),
        audienciasSemana: audienciasSemanaRaw.map((item) => ({
          id: item.id,
          titulo: item.titulo,
          dataInicio: item.dataInicio.toISOString(),
          status: item.status,
          processo: item.processo
            ? {
                id: item.processo.id,
                numero: item.processo.numero,
                titulo: item.processo.titulo,
                status: item.processo.status,
                clienteNome: item.processo.cliente.nome,
                advogadoResponsavelNome: formatResponsavel(
                  item.processo.advogadoResponsavel?.usuario.firstName,
                  item.processo.advogadoResponsavel?.usuario.lastName,
                ),
              }
            : null,
        })),
        feedCritico: feedCriticoRaw.map((item) => ({
          id: item.id,
          titulo: item.titulo,
          descricao: item.descricao,
          tipo: item.tipo,
          prioridade: item.prioridade,
          statusOperacional: item.statusOperacional,
          dataMovimentacao: item.dataMovimentacao.toISOString(),
          processo: {
            id: item.processo.id,
            numero: item.processo.numero,
            titulo: item.processo.titulo,
            status: item.processo.status,
            clienteNome: item.processo.cliente.nome,
            advogadoResponsavelNome: formatResponsavel(
              item.processo.advogadoResponsavel?.usuario.firstName,
              item.processo.advogadoResponsavel?.usuario.lastName,
            ),
          },
        })),
        processosSemMovimento30d: processosSemMovimentoRaw.map((item) => {
          const lastMovementDate = item.movimentacoes[0]?.dataMovimentacao;
          const diasSemMovimento = lastMovementDate
            ? Math.floor(
                (now.getTime() - lastMovementDate.getTime()) /
                  (1000 * 60 * 60 * 24),
              )
            : undefined;

          return {
            id: item.id,
            numero: item.numero,
            titulo: item.titulo,
            clienteNome: item.cliente.nome,
            diasSemMovimento,
          };
        }),
        processosSemResponsavel: processosSemResponsavelRaw.map((item) => ({
          id: item.id,
          numero: item.numero,
          titulo: item.titulo,
          clienteNome: item.cliente.nome,
        })),
      },
      saude: {
        processosAtivos: processosAtivosCount,
        semMovimento30d: processosSemMovimentoCount,
        semResponsavel: processosSemResponsavelCount,
        semMovimentacaoHistorica: processosSemHistoricoCount,
      },
    };
  } catch (error) {
    logger.error("[Portal Advogado] Erro ao carregar painel operacional:", error);
    return {
      success: false,
      prioridade: {
        prazosVencidos: 0,
        prazos7Dias: 0,
        audienciasSemana: 0,
        intimacoesNovas24h: 0,
      },
      listas: {
        proximosPrazos: [],
        audienciasSemana: [],
        feedCritico: [],
        processosSemMovimento30d: [],
        processosSemResponsavel: [],
      },
      saude: {
        processosAtivos: 0,
        semMovimento30d: 0,
        semResponsavel: 0,
        semMovimentacaoHistorica: 0,
      },
      error: error instanceof Error ? error.message : "Erro desconhecido.",
    };
  }
}
