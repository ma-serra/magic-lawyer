"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/app/lib/auth";
import prisma from "@/app/lib/prisma";
import {
  MovimentacaoPrioridade,
  MovimentacaoStatusOperacional,
  MovimentacaoTipo,
  UserRole,
} from "@/generated/prisma";
import { checkPermission } from "@/app/actions/equipe";
import {
  extractChangedFieldsFromDiff,
  logAudit,
  toAuditJson,
} from "@/app/lib/audit/log";
import { buildAndamentoDiff } from "@/app/lib/andamentos/diff";
import {
  notifyLawyersAboutProcessMovement,
  publishProcessNotificationToLawyers,
} from "@/app/lib/juridical/process-movement-sync";

// ============================================
// TIPOS
// ============================================

export interface AndamentoFilters {
  processoId?: string;
  tipo?: MovimentacaoTipo;
  statusOperacional?: MovimentacaoStatusOperacional;
  prioridade?: MovimentacaoPrioridade;
  responsavelId?: string;
  somenteAtrasados?: boolean;
  somenteSemResponsavel?: boolean;
  somenteMinhas?: boolean;
  dataInicio?: Date;
  dataFim?: Date;
  searchTerm?: string;
  page?: number;
  perPage?: number;
}

export interface AndamentoCreateInput {
  processoId: string;
  titulo: string;
  descricao?: string;
  observacaoResolucao?: string;
  observacaoReabertura?: string;
  tipo?: MovimentacaoTipo;
  statusOperacional?: MovimentacaoStatusOperacional;
  prioridade?: MovimentacaoPrioridade;
  responsavelId?: string;
  dataMovimentacao?: Date;
  slaEm?: Date;
  resolvidoEm?: Date;
  prazo?: Date;
  geraPrazo?: boolean; // Flag para indicar se deve gerar prazo automático
  // Campos para notificações
  notificarCliente?: boolean;
  notificarEmail?: boolean;
  notificarWhatsapp?: boolean;
  mensagemPersonalizada?: string;
}

export interface AndamentoUpdateInput {
  titulo?: string;
  descricao?: string;
  observacaoResolucao?: string;
  observacaoReabertura?: string;
  tipo?: MovimentacaoTipo;
  statusOperacional?: MovimentacaoStatusOperacional;
  prioridade?: MovimentacaoPrioridade;
  responsavelId?: string;
  dataMovimentacao?: Date;
  slaEm?: Date;
  resolvidoEm?: Date;
  prazo?: Date;
  // Campos para notificações
  notificarCliente?: boolean;
  notificarEmail?: boolean;
  notificarWhatsapp?: boolean;
  mensagemPersonalizada?: string;
}

export interface ActionResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

interface AndamentoPagination {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}

interface ProcessoDisponivel {
  id: string;
  numero: string;
  titulo: string | null;
}

interface ResponsavelDisponivel {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  role: UserRole;
}

// ============================================
// VALIDAÇÃO DE TENANT
// ============================================

async function getTenantId(): Promise<string> {
  const session = await getSession();

  if (!session?.user?.tenantId) {
    throw new Error("Usuário não autenticado ou tenant não encontrado");
  }

  return session.user.tenantId;
}

async function getUserId(): Promise<string> {
  const session = await getSession();

  if (!session?.user?.id) {
    throw new Error("Usuário não autenticado");
  }

  return session.user.id;
}

function isAdminRole(role?: string | null): boolean {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

function mergeProcessoScope(where: any, processoScope?: Record<string, unknown>) {
  if (!processoScope) {
    return;
  }

  where.processo = {
    ...(where.processo || {}),
    ...processoScope,
  };
}

function normalizeOptionalText(value?: string | null): string | undefined {
  const normalized = value?.trim();

  return normalized ? normalized : undefined;
}

const REOPEN_STATUS_OPTIONS: MovimentacaoStatusOperacional[] = [
  "NOVO",
  "EM_TRIAGEM",
  "EM_EXECUCAO",
  "BLOQUEADO",
];

async function getProcessoScopeForSession(
  session: Awaited<ReturnType<typeof getSession>>,
): Promise<Record<string, unknown> | undefined> {
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

  // Em operações diárias (andamentos), colaborador sem vínculo explícito
  // mantém visão geral do escritório para não bloquear trabalho.
  if (
    accessibleAdvogados.length === 0 ||
    (accessibleAdvogados.length === 1 &&
      String(accessibleAdvogados[0]).startsWith("__"))
  ) {
    return undefined;
  }

  return {
    advogadoResponsavelId: {
      in: accessibleAdvogados,
    },
  };
}

async function ensurePermissionOrThrow(acao: "visualizar" | "criar" | "editar" | "excluir") {
  const session = await getSession();
  const user = session?.user as any;

  if (isAdminRole(user?.role)) {
    return;
  }

  if (user?.role === "CLIENTE") {
    if (acao === "visualizar") {
      return;
    }

    throw new Error("Clientes não possuem permissão para alterar andamentos");
  }

  const allowed = await checkPermission("processos", acao);

  if (!allowed) {
    throw new Error("Você não tem permissão para executar esta ação");
  }
}

// ============================================
// LISTAGEM
// ============================================

export async function listAndamentos(
  filters: AndamentoFilters,
): Promise<
  ActionResponse<any[]> & {
    pagination?: AndamentoPagination;
    processosDisponiveis?: ProcessoDisponivel[];
    responsaveisDisponiveis?: ResponsavelDisponivel[];
  }
> {
  try {
    await ensurePermissionOrThrow("visualizar");

    const session = await getSession();
    const tenantId = await getTenantId();
    const page = Math.max(1, Number(filters.page || 1));
    const perPage = Math.min(100, Math.max(1, Number(filters.perPage || 12)));
    const processoScope = await getProcessoScopeForSession(session);

    const baseScopeWhere: any = {
      tenantId,
    };
    mergeProcessoScope(baseScopeWhere, processoScope);

    const where: any = {
      ...baseScopeWhere,
      ...(filters.processoId && { processoId: filters.processoId }),
      ...(filters.tipo && { tipo: filters.tipo }),
      ...(filters.statusOperacional && {
        statusOperacional: filters.statusOperacional,
      }),
      ...(filters.prioridade && { prioridade: filters.prioridade }),
      ...(filters.responsavelId && { responsavelId: filters.responsavelId }),
    };
    mergeProcessoScope(where, processoScope);

    if (filters.somenteMinhas && session?.user?.id) {
      where.responsavelId = session.user.id;
    }

    if (filters.somenteSemResponsavel) {
      where.responsavelId = null;
    }

    // Filtro de data
    if (filters.dataInicio || filters.dataFim) {
      baseScopeWhere.dataMovimentacao = {};
      where.dataMovimentacao = {};
      if (filters.dataInicio) {
        baseScopeWhere.dataMovimentacao.gte = filters.dataInicio;
        where.dataMovimentacao.gte = filters.dataInicio;
      }
      if (filters.dataFim) {
        baseScopeWhere.dataMovimentacao.lte = filters.dataFim;
        where.dataMovimentacao.lte = filters.dataFim;
      }
    }

    if (filters.somenteAtrasados) {
      where.slaEm = {
        lt: new Date(),
      };
      where.statusOperacional = {
        not: "RESOLVIDO",
      };
    }

    // Busca textual
    if (filters.searchTerm) {
      const searchWhere = [
        { titulo: { contains: filters.searchTerm, mode: "insensitive" } },
        { descricao: { contains: filters.searchTerm, mode: "insensitive" } },
        {
          processo: {
            numero: { contains: filters.searchTerm, mode: "insensitive" },
          },
        },
      ];
      baseScopeWhere.OR = searchWhere;
      where.OR = searchWhere;
    }

    const total = await prisma.movimentacaoProcesso.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / perPage));
    const safePage = Math.min(page, totalPages);

    let andamentosRaw: any[] = [];

    try {
      andamentosRaw = await prisma.movimentacaoProcesso.findMany({
        where,
        include: {
          criadoPor: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          processo: {
            select: {
              id: true,
              numero: true,
              titulo: true,
            },
          },
          responsavel: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              role: true,
            },
          },
          tarefaRelacionada: {
            select: {
              id: true,
              titulo: true,
              status: true,
              deletedAt: true,
            },
          },
          documentos: {
            select: {
              id: true,
              nome: true,
              tipo: true,
              url: true,
            },
          },
          prazosRelacionados: {
            select: {
              id: true,
              titulo: true,
              dataVencimento: true,
              status: true,
            },
          },
        },
        orderBy: {
          dataMovimentacao: "desc",
        },
        skip: (safePage - 1) * perPage,
        take: perPage,
      });
    } catch (queryError: any) {
      const errorMessage = String(queryError?.message || "");
      const isLegacyPrismaClient =
        errorMessage.includes("Unknown field `responsavel`") ||
        errorMessage.includes("Unknown field `tarefaRelacionada`");

      if (!isLegacyPrismaClient) {
        throw queryError;
      }

      andamentosRaw = await prisma.movimentacaoProcesso.findMany({
        where,
        include: {
          criadoPor: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          processo: {
            select: {
              id: true,
              numero: true,
              titulo: true,
            },
          },
          documentos: {
            select: {
              id: true,
              nome: true,
              tipo: true,
              url: true,
            },
          },
          prazosRelacionados: {
            select: {
              id: true,
              titulo: true,
              dataVencimento: true,
              status: true,
            },
          },
        },
        orderBy: {
          dataMovimentacao: "desc",
        },
        skip: (safePage - 1) * perPage,
        take: perPage,
      });
    }

    const andamentos = andamentosRaw.map((andamento: any) => ({
      ...andamento,
      statusOperacional: andamento.statusOperacional || "NOVO",
      prioridade: andamento.prioridade || "MEDIA",
      slaEm: andamento.slaEm ?? andamento.prazo ?? null,
      resolvidoEm: andamento.resolvidoEm ?? null,
      observacaoResolucao: andamento.observacaoResolucao ?? null,
      observacaoReabertura: andamento.observacaoReabertura ?? null,
      responsavel: andamento.responsavel ?? null,
      tarefaRelacionada:
        andamento.tarefaRelacionada &&
        !andamento.tarefaRelacionada.deletedAt
          ? {
              id: andamento.tarefaRelacionada.id,
              titulo: andamento.tarefaRelacionada.titulo,
              status: andamento.tarefaRelacionada.status,
            }
          : null,
    }));

    const processosComAndamentoIds = await prisma.movimentacaoProcesso.findMany({
      where: baseScopeWhere,
      select: {
        processoId: true,
      },
      distinct: ["processoId"],
    });

    const processosDisponiveis =
      processosComAndamentoIds.length > 0
        ? await prisma.processo.findMany({
            where: {
              tenantId,
              id: {
                in: processosComAndamentoIds.map((item) => item.processoId),
              },
            },
            select: {
              id: true,
              numero: true,
              titulo: true,
            },
            orderBy: {
              numero: "asc",
            },
          })
        : [];

    const responsaveisDisponiveis = await prisma.usuario.findMany({
      where: {
        tenantId,
        active: true,
        role: {
          not: UserRole.CLIENTE,
        },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
      },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    });

    return {
      success: true,
      data: andamentos,
      pagination: {
        page: safePage,
        perPage,
        total,
        totalPages,
        hasPreviousPage: safePage > 1,
        hasNextPage: safePage < totalPages,
      },
      processosDisponiveis,
      responsaveisDisponiveis,
    };
  } catch (error: any) {
    console.error("Erro ao listar andamentos:", error);

    return {
      success: false,
      error: error.message || "Erro ao listar andamentos",
    };
  }
}

// ============================================
// BUSCAR INDIVIDUAL
// ============================================

export async function getAndamento(
  andamentoId: string,
): Promise<ActionResponse<any>> {
  try {
    await ensurePermissionOrThrow("visualizar");

    const session = await getSession();
    const tenantId = await getTenantId();
    const processoScope = await getProcessoScopeForSession(session);

    const where: any = {
      id: andamentoId,
      tenantId,
    };
    mergeProcessoScope(where, processoScope);

    const andamento = await prisma.movimentacaoProcesso.findFirst({
      where,
      include: {
        criadoPor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        processo: {
          select: {
            id: true,
            numero: true,
            titulo: true,
            cliente: {
              select: {
                id: true,
                nome: true,
              },
            },
          },
        },
        responsavel: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
          },
        },
        tarefaRelacionada: {
          select: {
            id: true,
            titulo: true,
            status: true,
            deletedAt: true,
          },
        },
        documentos: {
          select: {
            id: true,
            nome: true,
            tipo: true,
            url: true,
            createdAt: true,
          },
        },
        prazosRelacionados: {
          select: {
            id: true,
            titulo: true,
            descricao: true,
            dataVencimento: true,
            status: true,
            responsavel: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    if (!andamento) {
      return {
        success: false,
        error: "Andamento não encontrado",
      };
    }

    return {
      success: true,
      data: {
        ...andamento,
        tarefaRelacionada:
          andamento.tarefaRelacionada && !andamento.tarefaRelacionada.deletedAt
            ? {
                id: andamento.tarefaRelacionada.id,
                titulo: andamento.tarefaRelacionada.titulo,
                status: andamento.tarefaRelacionada.status,
              }
            : null,
      },
    };
  } catch (error: any) {
    console.error("Erro ao buscar andamento:", error);

    return {
      success: false,
      error: error.message || "Erro ao buscar andamento",
    };
  }
}

// ============================================
// CRIAR ANDAMENTO
// ============================================

export async function createAndamento(
  input: AndamentoCreateInput,
): Promise<ActionResponse<any>> {
  try {
    await ensurePermissionOrThrow("criar");

    const tenantId = await getTenantId();
    const userId = await getUserId();
    const session = await getSession();
    const actor = session?.user as any;
    const processoScope = await getProcessoScopeForSession(session);
    const actorName =
      `${actor?.firstName ?? ""} ${actor?.lastName ?? ""}`.trim() ||
      (actor?.email as string | undefined) ||
      "Usuário";

    if (input.tipo === "PRAZO" && !input.prazo) {
      return {
        success: false,
        error: "Para movimentação do tipo PRAZO, informe a data de prazo",
      };
    }

    if (!input.titulo?.trim()) {
      return {
        success: false,
        error: "Título é obrigatório",
      };
    }

    const processoWhere: any = {
      id: input.processoId,
      tenantId,
    };
    mergeProcessoScope(processoWhere, processoScope);

    // Verificar se processo existe e pertence ao tenant
    const processo = await prisma.processo.findFirst({
      where: processoWhere,
    });

    if (!processo) {
      return {
        success: false,
        error: "Processo não encontrado ou sem acesso",
      };
    }

    if (input.responsavelId) {
      const responsavel = await prisma.usuario.findFirst({
        where: {
          id: input.responsavelId,
          tenantId,
          active: true,
          role: {
            not: UserRole.CLIENTE,
          },
        },
        select: { id: true },
      });

      if (!responsavel) {
        return {
          success: false,
          error: "Responsável inválido para este tenant",
        };
      }
    }

    const finalStatus = input.statusOperacional || "NOVO";
    const finalSla = input.slaEm || input.prazo || undefined;
    const finalResolvidoEm =
      finalStatus === "RESOLVIDO" ? input.resolvidoEm || new Date() : null;
    const finalObservacaoResolucao =
      finalStatus === "RESOLVIDO"
        ? normalizeOptionalText(input.observacaoResolucao)
        : undefined;

    const andamento = await prisma.movimentacaoProcesso.create({
      data: {
        tenantId,
        processoId: input.processoId,
        titulo: input.titulo,
        descricao: input.descricao,
        tipo: input.tipo,
        statusOperacional: finalStatus,
        prioridade: input.prioridade || "MEDIA",
        responsavelId: input.responsavelId,
        dataMovimentacao: input.dataMovimentacao || new Date(),
        slaEm: finalSla,
        resolvidoEm: finalResolvidoEm,
        observacaoResolucao: finalObservacaoResolucao,
        observacaoReabertura: normalizeOptionalText(input.observacaoReabertura),
        prazo: input.prazo,
        criadoPorId: userId,
        // Campos para notificações
        notificarCliente: input.notificarCliente || false,
        notificarEmail: input.notificarEmail || false,
        notificarWhatsapp: input.notificarWhatsapp || false,
        mensagemPersonalizada: input.mensagemPersonalizada,
      },
      include: {
        criadoPor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        processo: {
          select: {
            id: true,
            numero: true,
            titulo: true,
          },
        },
        responsavel: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
          },
        },
        tarefaRelacionada: {
          select: {
            id: true,
            titulo: true,
            status: true,
            deletedAt: true,
          },
        },
      },
    });

    // Se marcado para gerar prazo automático
    if (input.geraPrazo && input.prazo) {
      const prazo = await prisma.processoPrazo.create({
        data: {
          tenantId,
          processoId: input.processoId,
          titulo: `Prazo: ${input.titulo}`,
          descricao: input.descricao,
          dataVencimento: input.prazo,
          status: "ABERTO",
          origemMovimentacaoId: andamento.id,
        },
      });

      // Notificar sobre o novo prazo usando sistema híbrido
      const { publishNotification } = await import(
        "@/app/actions/notifications-hybrid"
      );

      await publishNotification({
        type: "prazo.created",
        title: "Novo Prazo Criado",
        message: `Prazo "${input.titulo}" foi criado para o processo ${processo.numero}. Vencimento: ${input.prazo.toLocaleDateString("pt-BR")}.`,
        urgency: "HIGH",
        channels: ["REALTIME"],
        payload: {
          prazoId: prazo.id,
          processoId: input.processoId,
          processoNumero: processo.numero,
          titulo: input.titulo,
          dataVencimento: input.prazo,
        },
        referenciaTipo: "prazo",
        referenciaId: prazo.id,
      });
    }

    // Notificar todos os advogados vinculados ao processo.
    try {
      await notifyLawyersAboutProcessMovement({
        tenantId,
        processoId: input.processoId,
        movement: {
          id: andamento.id,
          titulo: input.titulo,
          descricao: input.descricao ?? andamento.descricao ?? null,
          tipo: andamento.tipo,
          statusOperacional: andamento.statusOperacional,
          prioridade: andamento.prioridade,
          responsavelId: andamento.responsavelId,
          slaEm: andamento.slaEm,
          dataMovimentacao: input.dataMovimentacao || andamento.dataMovimentacao,
        },
        urgency: "HIGH",
        actorName,
        sourceLabel: "Andamento criado manualmente no processo",
        sourceKind: "MANUAL",
      });
    } catch (e) {
      console.warn(
        "Falha ao emitir notificações de andamento criado para advogados do processo",
        e,
      );
    }

    try {
      const auditDados = toAuditJson({
        andamentoId: andamento.id,
        processoId: input.processoId,
        numeroProcesso: processo.numero,
        titulo: andamento.titulo,
        descricao: andamento.descricao ?? null,
        tipo: andamento.tipo ?? null,
        statusOperacional: andamento.statusOperacional,
        prioridade: andamento.prioridade,
        responsavelId: andamento.responsavelId,
        dataMovimentacao: andamento.dataMovimentacao,
        slaEm: andamento.slaEm ?? null,
        resolvidoEm: andamento.resolvidoEm ?? null,
        observacaoResolucao: andamento.observacaoResolucao ?? null,
        observacaoReabertura: andamento.observacaoReabertura ?? null,
        prazo: andamento.prazo ?? null,
        notificacoes: {
          cliente: andamento.notificarCliente,
          email: andamento.notificarEmail,
          whatsapp: andamento.notificarWhatsapp,
          mensagemPersonalizada: andamento.mensagemPersonalizada ?? null,
        },
        gerouPrazo: Boolean(input.geraPrazo && input.prazo),
        criadoPor: actorName,
        criadoPorId: userId,
      });

      const changedFields = [
        "processoId",
        "titulo",
        "descricao",
        "tipo",
        "statusOperacional",
        "prioridade",
        "responsavelId",
        "dataMovimentacao",
        "slaEm",
        "resolvidoEm",
        "observacaoResolucao",
        "observacaoReabertura",
        "prazo",
        "notificarCliente",
        "notificarEmail",
        "notificarWhatsapp",
        "mensagemPersonalizada",
      ];

      if (input.geraPrazo) {
        changedFields.push("geraPrazo");
      }

      await logAudit({
        tenantId,
        usuarioId: userId,
        acao: "ANDAMENTO_CRIADO",
        entidade: "Andamento",
        entidadeId: andamento.id,
        dados: auditDados,
        previousValues: null,
        changedFields,
      });
    } catch (auditError) {
      console.warn(
        "Falha ao registrar auditoria de criação de andamento",
        auditError,
      );
    }

    revalidatePath("/processos");
    revalidatePath(`/processos/${input.processoId}`);

    return {
      success: true,
      data: {
        ...andamento,
        tarefaRelacionada:
          andamento.tarefaRelacionada && !andamento.tarefaRelacionada.deletedAt
            ? {
                id: andamento.tarefaRelacionada.id,
                titulo: andamento.tarefaRelacionada.titulo,
                status: andamento.tarefaRelacionada.status,
              }
            : null,
      },
    };
  } catch (error: any) {
    console.error("Erro ao criar andamento:", error);

    return {
      success: false,
      error: error.message || "Erro ao criar andamento",
    };
  }
}

// ============================================
// ATUALIZAR ANDAMENTO
// ============================================

export async function updateAndamento(
  andamentoId: string,
  input: AndamentoUpdateInput,
): Promise<ActionResponse<any>> {
  try {
    await ensurePermissionOrThrow("editar");

    const tenantId = await getTenantId();
    const session = await getSession();
    const userId = session?.user?.id;
    const processoScope = await getProcessoScopeForSession(session);

    if (!userId) {
      return { success: false, error: "Usuário não autenticado" };
    }

    const actor = session.user as any;
    const actorName =
      `${actor?.firstName ?? ""} ${actor?.lastName ?? ""}`.trim() ||
      (actor?.email as string | undefined) ||
      "Usuário";

    // Verificar se andamento existe e pertence ao tenant
    const andamentoWhere: any = {
      id: andamentoId,
      tenantId,
    };
    mergeProcessoScope(andamentoWhere, processoScope);

    const andamentoExistente = await prisma.movimentacaoProcesso.findFirst({
      where: andamentoWhere,
      select: {
        id: true,
        processoId: true,
        titulo: true,
        descricao: true,
        tipo: true,
        statusOperacional: true,
        prioridade: true,
        responsavelId: true,
        dataMovimentacao: true,
        slaEm: true,
        resolvidoEm: true,
        observacaoResolucao: true,
        observacaoReabertura: true,
        prazo: true,
        notificarCliente: true,
        notificarEmail: true,
        notificarWhatsapp: true,
        mensagemPersonalizada: true,
      },
    });

    if (!andamentoExistente) {
      return {
        success: false,
        error: "Andamento não encontrado",
      };
    }

    if (input.responsavelId) {
      const responsavel = await prisma.usuario.findFirst({
        where: {
          id: input.responsavelId,
          tenantId,
          active: true,
          role: {
            not: UserRole.CLIENTE,
          },
        },
        select: { id: true },
      });

      if (!responsavel) {
        return {
          success: false,
          error: "Responsável inválido para este tenant",
        };
      }
    }

    const nextStatus =
      input.statusOperacional ?? andamentoExistente.statusOperacional;

    if (
      andamentoExistente.statusOperacional === "RESOLVIDO" &&
      input.statusOperacional &&
      input.statusOperacional !== "RESOLVIDO"
    ) {
      return {
        success: false,
        error:
          "Use a ação de reabrir andamento para alterar status de itens resolvidos.",
      };
    }

    const nextResolvidoEm =
      nextStatus === "RESOLVIDO"
        ? input.resolvidoEm ||
          andamentoExistente.resolvidoEm ||
          new Date()
        : null;
    const nextObservacaoResolucao =
      nextStatus === "RESOLVIDO"
        ? normalizeOptionalText(input.observacaoResolucao) ??
          andamentoExistente.observacaoResolucao ??
          null
        : null;

    const andamento = await prisma.movimentacaoProcesso.update({
      where: { id: andamentoId },
      data: {
        titulo: input.titulo,
        descricao: input.descricao,
        tipo: input.tipo,
        statusOperacional: input.statusOperacional,
        prioridade: input.prioridade,
        responsavelId: input.responsavelId,
        dataMovimentacao: input.dataMovimentacao,
        slaEm: input.slaEm,
        resolvidoEm: nextResolvidoEm,
        observacaoResolucao: nextObservacaoResolucao,
        prazo: input.prazo,
        // Campos para notificações
        notificarCliente: input.notificarCliente,
        notificarEmail: input.notificarEmail,
        notificarWhatsapp: input.notificarWhatsapp,
        mensagemPersonalizada: input.mensagemPersonalizada,
      },
      include: {
        criadoPor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        processo: {
          select: {
            id: true,
            numero: true,
            titulo: true,
          },
        },
        responsavel: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
          },
        },
        tarefaRelacionada: {
          select: {
            id: true,
            titulo: true,
            status: true,
            deletedAt: true,
          },
        },
      },
    });

    const diff = buildAndamentoDiff(andamentoExistente, andamento);
    const hasChanges = diff.items.length > 0;

    // Notificar atualização de andamento para envolvidos (advogado responsável e cliente)
    if (hasChanges) {
      try {
        const actorName =
          `${(session?.user as any)?.firstName ?? ""} ${(session?.user as any)?.lastName ?? ""}`.trim() ||
          ((session?.user as any)?.email as string | undefined) ||
          "Usuário";
        const proc = await prisma.processo.findFirst({
          where: { id: andamento.processo.id, tenantId },
          select: {
            numero: true,
            cliente: { select: { usuarioId: true } },
          },
        });

        const targetUserIds: string[] = [];
        if (proc?.cliente?.usuarioId)
          targetUserIds.push(proc.cliente.usuarioId);

        await publishProcessNotificationToLawyers({
          type: "andamento.updated",
          tenantId,
          processoId: andamento.processo.id,
          payload: {
            andamentoId: andamento.id,
            processoNumero: proc?.numero || andamento.processo.numero,
            titulo: andamento.titulo,
            descricao: andamento.descricao ?? null,
            tipo: andamento.tipo,
            statusOperacional: andamento.statusOperacional,
            prioridade: andamento.prioridade,
            responsavelId: andamento.responsavelId,
            slaEm: andamento.slaEm,
            dataMovimentacao: andamento.dataMovimentacao,
            diff: diff.items,
            changes: diff.items.map((item) => item.field),
            detailLines: diff.items.map(
              (item) => `${item.label}: ${item.before} → ${item.after}`,
            ),
            changesSummary:
              diff.summary || "Informações do andamento foram atualizadas",
            actorName,
            actorUserId: userId,
            sourceLabel: "Andamento atualizado manualmente no processo",
            sourceKind: "MANUAL",
          },
          urgency: "HIGH",
          channels: ["REALTIME", "EMAIL", "TELEGRAM"],
        });

        if (targetUserIds.length > 0) {
          const { HybridNotificationService } = await import(
            "@/app/lib/notifications/hybrid-notification-service"
          );

          await Promise.all(
            Array.from(new Set(targetUserIds)).map((uid) =>
              HybridNotificationService.publishNotification({
                type: "andamento.updated",
                tenantId,
                userId: uid,
                payload: {
                  andamentoId: andamento.id,
                  processoId: andamento.processo.id,
                  processoNumero: proc?.numero || andamento.processo.numero,
                  titulo: andamento.titulo,
                  descricao: andamento.descricao ?? null,
                  tipo: andamento.tipo,
                  statusOperacional: andamento.statusOperacional,
                  prioridade: andamento.prioridade,
                  responsavelId: andamento.responsavelId,
                  slaEm: andamento.slaEm,
                  dataMovimentacao: andamento.dataMovimentacao,
                  referenciaTipo: "processo",
                  referenciaId: andamento.processo.id,
                  diff: diff.items,
                  changes: diff.items.map((item) => item.field),
                  changesSummary:
                    diff.summary ||
                    "Informações do andamento foram atualizadas",
                  actorName,
                  actorUserId: userId,
                  sourceLabel: "Andamento atualizado manualmente no processo",
                  sourceKind: "MANUAL",
                },
                urgency: "HIGH",
                channels: ["REALTIME", "EMAIL", "TELEGRAM"],
              } as any),
            ),
          );
        }
      } catch (e) {
        console.warn(
          "Falha ao emitir notificações de andamento atualizado para envolvidos",
          e,
        );
      }

      try {
        const auditDados = toAuditJson({
          andamentoId: andamento.id,
          processoId: andamento.processo.id,
          processoNumero: andamento.processo.numero,
          diff: diff.items,
          changesSummary:
            diff.summary || "Informações do andamento foram atualizadas",
          valoresAtuais: andamento,
          atualizadoPor: actorName,
          atualizadoPorId: userId,
          atualizadoEm: new Date().toISOString(),
        });

        await logAudit({
          tenantId,
          usuarioId: userId,
          acao: "ANDAMENTO_ATUALIZADO",
          entidade: "Andamento",
          entidadeId: andamento.id,
          dados: auditDados,
          previousValues: toAuditJson({
            ...andamentoExistente,
            processoId: andamentoExistente.processoId,
          }),
          changedFields: extractChangedFieldsFromDiff(diff.items),
        });
      } catch (auditError) {
        console.warn(
          "Falha ao registrar auditoria de atualização de andamento",
          auditError,
        );
      }
    }

    revalidatePath("/processos");
    revalidatePath(`/processos/${andamento.processoId}`);

    return {
      success: true,
      data: {
        ...andamento,
        tarefaRelacionada:
          andamento.tarefaRelacionada && !andamento.tarefaRelacionada.deletedAt
            ? {
                id: andamento.tarefaRelacionada.id,
                titulo: andamento.tarefaRelacionada.titulo,
                status: andamento.tarefaRelacionada.status,
              }
            : null,
      },
    };
  } catch (error: any) {
    console.error("Erro ao atualizar andamento:", error);

    return {
      success: false,
      error: error.message || "Erro ao atualizar andamento",
    };
  }
}

// ============================================
// EXCLUIR ANDAMENTO
// ============================================

export async function deleteAndamento(
  andamentoId: string,
): Promise<ActionResponse<null>> {
  try {
    await ensurePermissionOrThrow("excluir");

    const tenantId = await getTenantId();
    const session = await getSession();
    const userId = session?.user?.id;
    const processoScope = await getProcessoScopeForSession(session);

    if (!userId) {
      return { success: false, error: "Usuário não autenticado" };
    }

    const actor = session.user as any;
    const actorName =
      `${actor?.firstName ?? ""} ${actor?.lastName ?? ""}`.trim() ||
      (actor?.email as string | undefined) ||
      "Usuário";

    // Verificar se andamento existe e pertence ao tenant
    const andamentoWhere: any = {
      id: andamentoId,
      tenantId,
    };
    mergeProcessoScope(andamentoWhere, processoScope);

    const andamento = await prisma.movimentacaoProcesso.findFirst({
      where: andamentoWhere,
    });

    if (!andamento) {
      return {
        success: false,
        error: "Andamento não encontrado",
      };
    }

    await prisma.movimentacaoProcesso.delete({
      where: { id: andamentoId },
    });

    try {
      await logAudit({
        tenantId,
        usuarioId: userId,
        acao: "ANDAMENTO_EXCLUIDO",
        entidade: "Andamento",
        entidadeId: andamentoId,
        dados: toAuditJson({
          andamentoId,
          processoId: andamento.processoId,
          removidoEm: new Date().toISOString(),
          removidoPor: actorName,
          removidoPorId: userId,
        }),
        previousValues: toAuditJson(andamento),
        changedFields: ["deleted"],
      });
    } catch (auditError) {
      console.warn(
        "Falha ao registrar auditoria de exclusão de andamento",
        auditError,
      );
    }

    revalidatePath("/processos");
    revalidatePath(`/processos/${andamento.processoId}`);

    return {
      success: true,
      data: null,
    };
  } catch (error: any) {
    console.error("Erro ao excluir andamento:", error);

    return {
      success: false,
      error: error.message || "Erro ao excluir andamento",
    };
  }
}

// ============================================
// AÇÕES RÁPIDAS
// ============================================

export async function createTarefaFromAndamento(
  andamentoId: string,
): Promise<ActionResponse<{ tarefaId: string }>> {
  try {
    await ensurePermissionOrThrow("editar");

    const session = await getSession();
    const tenantId = await getTenantId();
    const userId = await getUserId();
    const processoScope = await getProcessoScopeForSession(session);

    const andamentoWhere: any = {
      id: andamentoId,
      tenantId,
    };
    mergeProcessoScope(andamentoWhere, processoScope);

    const andamento = await prisma.movimentacaoProcesso.findFirst({
      where: andamentoWhere,
      include: {
        processo: {
          select: {
            id: true,
            clienteId: true,
            numero: true,
          },
        },
      },
    });

    if (!andamento) {
      return { success: false, error: "Andamento não encontrado" };
    }

    if (andamento.tarefaRelacionadaId) {
      const tarefaAtiva = await prisma.tarefa.findFirst({
        where: {
          id: andamento.tarefaRelacionadaId,
          tenantId,
          deletedAt: null,
        },
        select: {
          id: true,
        },
      });

      if (tarefaAtiva) {
        return {
          success: true,
          data: { tarefaId: tarefaAtiva.id },
        };
      }

      await prisma.movimentacaoProcesso.update({
        where: { id: andamento.id },
        data: { tarefaRelacionadaId: null },
      });
    }

    const tarefa = await prisma.tarefa.create({
      data: {
        tenantId,
        titulo: `Ação do andamento: ${andamento.titulo}`,
        descricao:
          andamento.descricao ||
          `Gerada automaticamente a partir do andamento no processo ${andamento.processo.numero}.`,
        status: "PENDENTE",
        prioridade: "MEDIA",
        processoId: andamento.processo.id,
        clienteId: andamento.processo.clienteId,
        responsavelId: andamento.responsavelId || userId,
        criadoPorId: userId,
        dataLimite: andamento.slaEm || andamento.prazo || null,
      },
      select: {
        id: true,
      },
    });

    await prisma.movimentacaoProcesso.update({
      where: { id: andamento.id },
      data: {
        tarefaRelacionadaId: tarefa.id,
      },
    });

    revalidatePath("/andamentos");
    revalidatePath("/tarefas");
    revalidatePath(`/processos/${andamento.processo.id}`);

    return {
      success: true,
      data: { tarefaId: tarefa.id },
    };
  } catch (error: any) {
    console.error("Erro ao criar tarefa a partir do andamento:", error);
    return {
      success: false,
      error: error.message || "Erro ao criar tarefa",
    };
  }
}

export async function marcarAndamentoResolvido(
  andamentoId: string,
  observacaoResolucao?: string,
): Promise<ActionResponse<any>> {
  try {
    await ensurePermissionOrThrow("editar");

    const session = await getSession();
    const tenantId = await getTenantId();
    const processoScope = await getProcessoScopeForSession(session);

    const where: any = {
      id: andamentoId,
      tenantId,
    };
    mergeProcessoScope(where, processoScope);

    const andamento = await prisma.movimentacaoProcesso.findFirst({
      where,
      select: {
        id: true,
        processoId: true,
      },
    });

    if (!andamento) {
      return { success: false, error: "Andamento não encontrado" };
    }

    const updated = await prisma.movimentacaoProcesso.update({
      where: { id: andamento.id },
      data: {
        statusOperacional: "RESOLVIDO",
        resolvidoEm: new Date(),
        observacaoResolucao: normalizeOptionalText(observacaoResolucao),
      },
      select: {
        id: true,
        statusOperacional: true,
        resolvidoEm: true,
        observacaoResolucao: true,
      },
    });

    revalidatePath("/andamentos");
    revalidatePath(`/processos/${andamento.processoId}`);

    return {
      success: true,
      data: updated,
    };
  } catch (error: any) {
    console.error("Erro ao marcar andamento como resolvido:", error);
    return {
      success: false,
      error: error.message || "Erro ao resolver andamento",
    };
  }
}

export async function reabrirAndamento(
  andamentoId: string,
  novoStatus: MovimentacaoStatusOperacional,
  observacaoReabertura: string,
): Promise<ActionResponse<any>> {
  try {
    await ensurePermissionOrThrow("editar");

    if (!REOPEN_STATUS_OPTIONS.includes(novoStatus)) {
      return { success: false, error: "Status de reabertura inválido" };
    }

    const motivo = normalizeOptionalText(observacaoReabertura);

    if (!motivo) {
      return {
        success: false,
        error: "Informe o motivo da reabertura",
      };
    }

    const tenantId = await getTenantId();
    const session = await getSession();
    const userId = session?.user?.id;
    const processoScope = await getProcessoScopeForSession(session);

    if (!userId) {
      return { success: false, error: "Usuário não autenticado" };
    }

    const actor = session.user as any;
    const actorName =
      `${actor?.firstName ?? ""} ${actor?.lastName ?? ""}`.trim() ||
      (actor?.email as string | undefined) ||
      "Usuário";

    const where: any = {
      id: andamentoId,
      tenantId,
    };
    mergeProcessoScope(where, processoScope);

    const andamentoExistente = await prisma.movimentacaoProcesso.findFirst({
      where,
      select: {
        id: true,
        processoId: true,
        titulo: true,
        descricao: true,
        tipo: true,
        statusOperacional: true,
        prioridade: true,
        responsavelId: true,
        dataMovimentacao: true,
        slaEm: true,
        resolvidoEm: true,
        observacaoResolucao: true,
        observacaoReabertura: true,
        prazo: true,
        notificarCliente: true,
        notificarEmail: true,
        notificarWhatsapp: true,
        mensagemPersonalizada: true,
        processo: {
          select: {
            id: true,
            numero: true,
          },
        },
      },
    });

    if (!andamentoExistente) {
      return { success: false, error: "Andamento não encontrado" };
    }

    if (andamentoExistente.statusOperacional !== "RESOLVIDO") {
      return {
        success: false,
        error: "Apenas andamentos resolvidos podem ser reabertos",
      };
    }

    const atualizado = await prisma.movimentacaoProcesso.update({
      where: { id: andamentoExistente.id },
      data: {
        statusOperacional: novoStatus,
        resolvidoEm: null,
        observacaoResolucao: null,
        observacaoReabertura: motivo,
      },
      include: {
        processo: {
          select: {
            id: true,
            numero: true,
            titulo: true,
          },
        },
      },
    });

    try {
      const diff = buildAndamentoDiff(andamentoExistente, atualizado);
      const changedFields = extractChangedFieldsFromDiff(diff.items);
      const auditDados = toAuditJson({
        andamentoId: atualizado.id,
        processoId: atualizado.processo.id,
        processoNumero: atualizado.processo.numero,
        statusAnterior: andamentoExistente.statusOperacional,
        statusAtual: atualizado.statusOperacional,
        motivoReabertura: motivo,
        reabertoPor: actorName,
        reabertoPorId: userId,
        reabertoEm: new Date().toISOString(),
        diff: diff.items,
        changesSummary: diff.summary || "Andamento reaberto",
      });

      await logAudit({
        tenantId,
        usuarioId: userId,
        acao: "ANDAMENTO_REABERTO",
        entidade: "Andamento",
        entidadeId: atualizado.id,
        dados: auditDados,
        previousValues: toAuditJson(andamentoExistente),
        changedFields,
      });
    } catch (auditError) {
      console.warn(
        "Falha ao registrar auditoria de reabertura de andamento",
        auditError,
      );
    }

    revalidatePath("/andamentos");
    revalidatePath(`/processos/${atualizado.processo.id}`);

    return {
      success: true,
      data: {
        id: atualizado.id,
        statusOperacional: atualizado.statusOperacional,
        resolvidoEm: atualizado.resolvidoEm,
        observacaoResolucao: atualizado.observacaoResolucao,
        observacaoReabertura: atualizado.observacaoReabertura,
      },
    };
  } catch (error: any) {
    console.error("Erro ao reabrir andamento:", error);
    return {
      success: false,
      error: error.message || "Erro ao reabrir andamento",
    };
  }
}

// ============================================
// DASHBOARD/MÉTRICAS
// ============================================

export async function getDashboardAndamentos(
  processoId?: string,
): Promise<ActionResponse<any>> {
  try {
    await ensurePermissionOrThrow("visualizar");

    const session = await getSession();
    const tenantId = await getTenantId();
    const processoScope = await getProcessoScopeForSession(session);

    const where: any = { tenantId };
    mergeProcessoScope(where, processoScope);

    if (processoId) {
      where.processoId = processoId;
    }

    const [total, atrasados, semResponsavel, porTipo, porStatus, ultimosAndamentos] =
      await Promise.all([
        prisma.movimentacaoProcesso.count({ where }),
        prisma.movimentacaoProcesso.count({
          where: {
            ...where,
            slaEm: { lt: new Date() },
            statusOperacional: {
              not: "RESOLVIDO",
            },
          },
        }),
        prisma.movimentacaoProcesso.count({
          where: {
            ...where,
            responsavelId: null,
          },
        }),
        prisma.movimentacaoProcesso.groupBy({
          by: ["tipo"],
          where,
          _count: { _all: true },
        }),
        prisma.movimentacaoProcesso.groupBy({
          by: ["statusOperacional"],
          where,
          _count: { _all: true },
        }),
        prisma.movimentacaoProcesso.findMany({
          where,
          include: {
            criadoPor: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
            processo: {
              select: {
                id: true,
                numero: true,
                titulo: true,
              },
            },
            responsavel: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                role: true,
              },
            },
          },
          orderBy: {
            dataMovimentacao: "desc",
          },
          take: 10,
        }),
      ]);

    const porTipoArray = porTipo.map((item) => ({
      tipo: item.tipo,
      _count: item._count._all,
    }));

    const porStatusArray = porStatus.map((item) => ({
      statusOperacional: item.statusOperacional,
      _count: item._count._all,
    }));

    return {
      success: true,
      data: {
        total,
        atrasados,
        semResponsavel,
        porTipo: porTipoArray,
        porStatus: porStatusArray,
        ultimosAndamentos,
      },
    };
  } catch (error: any) {
    console.error("Erro ao buscar dashboard de andamentos:", error);

    return {
      success: false,
      error: error.message || "Erro ao buscar dashboard de andamentos",
    };
  }
}

// ============================================
// TIPOS DE MOVIMENTAÇÃO
// ============================================

export async function getTiposMovimentacao(): Promise<
  ActionResponse<MovimentacaoTipo[]>
> {
  try {
    // Retornar os tipos do enum
    const tipos: MovimentacaoTipo[] = [
      "ANDAMENTO",
      "PRAZO",
      "INTIMACAO",
      "AUDIENCIA",
      "ANEXO",
      "OUTRO",
    ];

    return {
      success: true,
      data: tipos,
    };
  } catch (error: any) {
    console.error("Erro ao buscar tipos de movimentação:", error);

    return {
      success: false,
      error: error.message || "Erro ao buscar tipos de movimentação",
    };
  }
}
