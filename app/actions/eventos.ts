"use server";

import type { Evento, EventoConfirmacaoStatus, Prisma } from "@/generated/prisma";

import { getServerSession } from "next-auth/next";
import { revalidatePath } from "next/cache";

import prisma from "@/app/lib/prisma";
import { authOptions } from "@/auth";
import logger from "@/lib/logger";
import {
  syncEventoWithGoogle,
  removeEventoFromGoogle,
} from "@/app/actions/google-calendar";
import { checkPermission } from "@/app/actions/equipe";
import { getAccessibleAdvogadoIds } from "@/app/lib/advogado-access";

// Usar tipos do Prisma - sempre sincronizado com o banco!

const AGENDA_MODULE = "agenda";
const NO_ACCESS_ADVOGADO_ID = "__NO_ADVOGADO_ACCESS__";
const NO_ACCESS_EVENT_ID = "__NO_AGENDA_ACCESS__";

type AgendaPermissionAction = "visualizar" | "criar" | "editar" | "excluir";

const agendaPermissionErrors: Record<AgendaPermissionAction, string> = {
  visualizar: "Você não tem permissão para visualizar a agenda",
  criar: "Você não tem permissão para criar eventos na agenda",
  editar: "Você não tem permissão para editar eventos na agenda",
  excluir: "Você não tem permissão para excluir eventos na agenda",
};

interface AgendaSessionContext {
  userId: string;
  tenantId: string;
  role: string;
  isAdmin: boolean;
  isCliente: boolean;
  userEmail: string | null;
  currentClienteId: string | null;
  accessibleAdvogadoIds: string[];
}

type EventoRelationshipsValidationResult =
  | {
      valid: false;
      error: string;
    }
  | {
      valid: true;
      inferredClienteId: string | null;
    };

function isAdminRole(role?: string | null) {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isSameEmail(a: string, b: string) {
  return normalizeEmail(a) === normalizeEmail(b);
}

function normalizeParticipantes(participantes: string[] | null | undefined) {
  if (!participantes?.length) {
    return [];
  }

  const unique = new Map<string, string>();

  for (const participante of participantes) {
    const trimmed = participante.trim();

    if (!trimmed) {
      continue;
    }

    const key = normalizeEmail(trimmed);

    if (!unique.has(key)) {
      unique.set(key, trimmed);
    }
  }

  return Array.from(unique.values());
}

// Tipo para criação de evento (sem campos auto-gerados)
export type EventoFormData = Omit<
  Evento,
  | "id"
  | "tenantId"
  | "criadoPorId"
  | "createdAt"
  | "updatedAt"
  | "dataInicio"
  | "dataFim"
> & {
  dataInicio: string; // String para o formulário, será convertido para Date
  dataFim: string; // String para o formulário, será convertido para Date
};

// Função de validação simples usando tipos do Prisma
function validateEvento(data: EventoFormData): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Validações básicas
  if (!data.titulo?.trim()) {
    errors.push("Título é obrigatório");
  }

  if (!data.tipo) {
    errors.push("Tipo de evento é obrigatório");
  }

  if (!data.dataInicio) {
    errors.push("Data de início é obrigatória");
  }

  if (!data.dataFim) {
    errors.push("Data de fim é obrigatória");
  }

  // Validação de datas
  if (data.dataInicio && data.dataFim) {
    const inicio = new Date(data.dataInicio);
    const fim = new Date(data.dataFim);

    if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime())) {
      errors.push("Datas inválidas. Verifique os campos de início e fim");
    } else if (fim <= inicio) {
      errors.push("Data de fim deve ser posterior à data de início");
    }
  }

  // Validação de emails dos participantes
  if (data.participantes) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    for (const email of data.participantes) {
      const sanitizedEmail = email.trim();

      if (!emailRegex.test(sanitizedEmail)) {
        errors.push(`Email inválido: ${sanitizedEmail}`);
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

async function getTenantIdFromUser(userId: string) {
  const usuario = await prisma.usuario.findUnique({
    where: { id: userId },
    select: { tenantId: true },
  });

  return usuario?.tenantId ?? null;
}

// Função auxiliar para buscar o cliente associado ao usuário
async function getCurrentClienteId(userId: string, tenantId: string) {
  const cliente = await prisma.cliente.findFirst({
    where: {
      usuarioId: userId,
      tenantId,
      deletedAt: null, // Não deletado
    },
    select: { id: true },
  });

  return cliente?.id ?? null;
}

async function requireAgendaContext(
  permission?: AgendaPermissionAction,
): Promise<AgendaSessionContext> {
  const session = await getServerSession(authOptions);
  const sessionUser = (session?.user as any) ?? {};
  const userId = sessionUser.id as string | undefined;

  if (!userId) {
    throw new Error("Usuário não autenticado");
  }

  const tenantId =
    (sessionUser.tenantId as string | undefined) ||
    (await getTenantIdFromUser(userId));

  if (!tenantId) {
    throw new Error("Tenant não encontrado");
  }

  const role = (sessionUser.role as string | undefined) ?? "";
  const isAdmin = isAdminRole(role);

  if (permission && !isAdmin) {
    const hasPermission = await checkPermission(AGENDA_MODULE, permission);

    if (!hasPermission) {
      throw new Error(agendaPermissionErrors[permission]);
    }
  }

  const isCliente = role === "CLIENTE";
  const userEmailRaw = sessionUser.email as string | undefined;
  const userEmail = userEmailRaw?.trim() ? userEmailRaw.trim() : null;

  if (isCliente) {
    return {
      userId,
      tenantId,
      role,
      isAdmin,
      isCliente: true,
      userEmail,
      currentClienteId: await getCurrentClienteId(userId, tenantId),
      accessibleAdvogadoIds: [],
    };
  }

  if (isAdmin) {
    return {
      userId,
      tenantId,
      role,
      isAdmin: true,
      isCliente: false,
      userEmail,
      currentClienteId: null,
      accessibleAdvogadoIds: [],
    };
  }

  const accessibleAdvogadoIds = (
    await getAccessibleAdvogadoIds(session as any)
  ).filter((id) => id && id !== NO_ACCESS_ADVOGADO_ID);

  return {
    userId,
    tenantId,
    role,
    isAdmin: false,
    isCliente: false,
    userEmail,
    currentClienteId: null,
    accessibleAdvogadoIds,
  };
}

function buildEventoScopeWhere(
  context: AgendaSessionContext,
  options?: {
    includeParticipantEvents?: boolean;
  },
): Prisma.EventoWhereInput {
  const includeParticipantEvents = options?.includeParticipantEvents ?? true;

  if (context.isAdmin) {
    return { tenantId: context.tenantId };
  }

  if (context.isCliente) {
    if (!context.currentClienteId) {
      return {
        tenantId: context.tenantId,
        id: NO_ACCESS_EVENT_ID,
      };
    }

    return {
      tenantId: context.tenantId,
      clienteId: context.currentClienteId,
    };
  }

  const orConditions: Prisma.EventoWhereInput[] = [
    { criadoPorId: context.userId },
  ];

  if (context.userEmail && includeParticipantEvents) {
    orConditions.push({
      participantes: {
        has: context.userEmail,
      },
    });
  }

  if (context.accessibleAdvogadoIds.length > 0) {
    orConditions.push({
      advogadoResponsavelId: {
        in: context.accessibleAdvogadoIds,
      },
    });
  }

  return {
    tenantId: context.tenantId,
    OR: orConditions,
  };
}

function isAllowedAdvogadoInScope(
  context: AgendaSessionContext,
  advogadoId: string,
) {
  if (context.isAdmin || context.isCliente) {
    return true;
  }

  if (context.accessibleAdvogadoIds.length === 0) {
    return false;
  }

  return context.accessibleAdvogadoIds.includes(advogadoId);
}

function getEventoFormDataFromEvento(evento: Evento): EventoFormData {
  return {
    titulo: evento.titulo,
    descricao: evento.descricao,
    tipo: evento.tipo,
    status: evento.status,
    dataInicio: evento.dataInicio.toISOString(),
    dataFim: evento.dataFim.toISOString(),
    local: evento.local,
    participantes: normalizeParticipantes(evento.participantes),
    processoId: evento.processoId,
    clienteId: evento.clienteId,
    advogadoResponsavelId: evento.advogadoResponsavelId,
    recorrencia: evento.recorrencia,
    recorrenciaFim: evento.recorrenciaFim,
    googleEventId: evento.googleEventId,
    googleCalendarId: evento.googleCalendarId,
    lembreteMinutos: evento.lembreteMinutos,
    observacoes: evento.observacoes,
  };
}

async function validateEventoRelationships(
  context: AgendaSessionContext,
  formData: Pick<EventoFormData, "processoId" | "clienteId" | "advogadoResponsavelId">,
): Promise<EventoRelationshipsValidationResult> {
  if (
    !context.isAdmin &&
    !context.isCliente &&
    context.accessibleAdvogadoIds.length === 0 &&
    (formData.processoId || formData.clienteId || formData.advogadoResponsavelId)
  ) {
    return {
      valid: false,
      error:
        "Sem vínculo com advogado: sua agenda está em modo pessoal. Remova processo/cliente/advogado ou solicite vínculo.",
    };
  }

  if (formData.advogadoResponsavelId) {
    const advogado = await prisma.advogado.findFirst({
      where: {
        id: formData.advogadoResponsavelId,
        tenantId: context.tenantId,
      },
      select: { id: true },
    });

    if (!advogado) {
      return {
        valid: false,
        error:
          "Advogado selecionado não foi encontrado. Verifique se ele pertence ao seu escritório.",
      };
    }

    if (!isAllowedAdvogadoInScope(context, advogado.id)) {
      return {
        valid: false,
        error:
          "Você não tem acesso ao advogado selecionado para vincular este evento.",
      };
    }
  }

  let processo:
    | {
        id: string;
        numero: string;
        titulo: string | null;
        clienteId: string;
        advogadoResponsavelId: string | null;
      }
    | null = null;

  if (formData.processoId) {
    processo = await prisma.processo.findFirst({
      where: {
        id: formData.processoId,
        tenantId: context.tenantId,
        deletedAt: null,
      },
      select: {
        id: true,
        numero: true,
        titulo: true,
        clienteId: true,
        advogadoResponsavelId: true,
      },
    });

    if (!processo) {
      return {
        valid: false,
        error:
          "Processo selecionado não foi encontrado. Verifique se o processo existe e pertence ao seu escritório.",
      };
    }

    if (
      !context.isAdmin &&
      !context.isCliente &&
      processo.advogadoResponsavelId &&
      !context.accessibleAdvogadoIds.includes(processo.advogadoResponsavelId)
    ) {
      return {
        valid: false,
        error: "Você não tem acesso ao processo selecionado.",
      };
    }
  }

  if (formData.clienteId) {
    const cliente = await prisma.cliente.findFirst({
      where: {
        id: formData.clienteId,
        tenantId: context.tenantId,
      },
      select: { id: true },
    });

    if (!cliente) {
      return {
        valid: false,
        error:
          "Cliente selecionado não foi encontrado. Verifique se o cliente existe e pertence ao seu escritório.",
      };
    }
  }

  if (processo && formData.clienteId && processo.clienteId !== formData.clienteId) {
    return {
      valid: false,
      error:
        "O processo selecionado não pertence ao cliente informado. Ajuste os dados e tente novamente.",
    };
  }

  return {
    valid: true,
    inferredClienteId: processo?.clienteId ?? formData.clienteId ?? null,
  };
}

// Buscar eventos do tenant atual
export async function getEventos(filters?: {
  dataInicio?: Date;
  dataFim?: Date;
  status?: string;
  tipo?: string;
  clienteId?: string;
  processoId?: string;
  advogadoId?: string;
  local?: string;
  titulo?: string;
}) {
  try {
    const context = await requireAgendaContext("visualizar");
    const where: Prisma.EventoWhereInput = buildEventoScopeWhere(context);

    if (filters?.dataInicio || filters?.dataFim) {
      where.dataInicio = {} as Prisma.DateTimeFilter;
      if (filters.dataInicio) {
        (where.dataInicio as Prisma.DateTimeFilter).gte = filters.dataInicio;
      }
      if (filters.dataFim) {
        (where.dataInicio as Prisma.DateTimeFilter).lte = filters.dataFim;
      }
    }

    if (filters?.status) {
      where.status = filters.status as any;
    }

    if (filters?.tipo) {
      where.tipo = filters.tipo as any;
    }

    if (filters?.clienteId) {
      where.clienteId = filters.clienteId;
    }

    if (filters?.processoId) {
      where.processoId = filters.processoId;
    }

    if (filters?.advogadoId) {
      if (
        !context.isAdmin &&
        !context.isCliente &&
        !isAllowedAdvogadoInScope(context, filters.advogadoId)
      ) {
        return {
          success: true,
          data: [],
        };
      }
      where.advogadoResponsavelId = filters.advogadoId;
    }

    if (filters?.local) {
      where.local = {
        contains: filters.local,
        mode: "insensitive",
      };
    }

    if (filters?.titulo) {
      where.titulo = {
        contains: filters.titulo,
        mode: "insensitive",
      };
    }

    const eventos = await prisma.evento.findMany({
      where,
      include: {
        processo: {
          select: {
            id: true,
            numero: true,
            titulo: true,
          },
        },
        cliente: {
          select: {
            id: true,
            nome: true,
            email: true,
          },
        },
        advogadoResponsavel: {
          select: {
            id: true,
            usuario: {
              select: {
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
        criadoPor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        confirmacoes: {
          select: {
            id: true,
            participanteEmail: true,
            participanteNome: true,
            status: true,
            confirmadoEm: true,
            observacoes: true,
          },
        },
      },
      orderBy: {
        dataInicio: "asc",
      },
    });

    return { success: true, data: eventos };
  } catch (error) {
    logger.error("Erro ao buscar eventos:", error);

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro interno do servidor",
    };
  }
}

// Buscar evento por ID
export async function getEventoById(id: string) {
  try {
    const context = await requireAgendaContext("visualizar");
    const where: Prisma.EventoWhereInput = {
      ...buildEventoScopeWhere(context),
      id,
    };

    const evento = await prisma.evento.findFirst({
      where,
      include: {
        processo: {
          select: {
            id: true,
            numero: true,
            titulo: true,
          },
        },
        cliente: {
          select: {
            id: true,
            nome: true,
            email: true,
          },
        },
        advogadoResponsavel: {
          select: {
            id: true,
            usuario: {
              select: {
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
        criadoPor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        confirmacoes: {
          select: {
            id: true,
            participanteEmail: true,
            participanteNome: true,
            status: true,
            confirmadoEm: true,
            observacoes: true,
          },
        },
      },
    });

    if (!evento) {
      throw new Error("Evento não encontrado");
    }

    return { success: true, data: evento };
  } catch (error) {
    logger.error("Erro ao buscar evento:", error);

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro interno do servidor",
    };
  }
}

// Criar novo evento
export async function createEvento(formData: EventoFormData) {
  try {
    const context = await requireAgendaContext("criar");

    if (context.isCliente) {
      return {
        success: false,
        error: "Clientes não podem criar eventos.",
      };
    }

    const normalizedParticipantes = normalizeParticipantes(formData.participantes);
    const normalizedFormData: EventoFormData = {
      ...formData,
      titulo: formData.titulo?.trim() ?? "",
      descricao: formData.descricao?.trim() || null,
      local: formData.local?.trim() || null,
      observacoes: formData.observacoes?.trim() || null,
      participantes: normalizedParticipantes,
    };

    if (
      !context.isAdmin &&
      !context.isCliente &&
      !normalizedFormData.advogadoResponsavelId &&
      context.accessibleAdvogadoIds.length === 1
    ) {
      normalizedFormData.advogadoResponsavelId = context.accessibleAdvogadoIds[0];
    }

    const validation = validateEvento(normalizedFormData);

    if (!validation.isValid) {
      return {
        success: false,
        error: validation.errors.join(". "),
      };
    }

    const relationshipsValidation = await validateEventoRelationships(context, {
      processoId: normalizedFormData.processoId,
      clienteId: normalizedFormData.clienteId,
      advogadoResponsavelId: normalizedFormData.advogadoResponsavelId,
    });

    if (!relationshipsValidation.valid) {
      return {
        success: false,
        error: relationshipsValidation.error,
      };
    }

    const evento = await prisma.evento.create({
      data: {
        ...normalizedFormData,
        clienteId: relationshipsValidation.inferredClienteId,
        tenantId: context.tenantId,
        criadoPorId: context.userId,
        dataInicio: new Date(normalizedFormData.dataInicio),
        dataFim: new Date(normalizedFormData.dataFim),
      },
      include: {
        processo: {
          select: {
            id: true,
            numero: true,
            titulo: true,
          },
        },
        cliente: {
          select: {
            id: true,
            nome: true,
            email: true,
          },
        },
        advogadoResponsavel: {
          select: {
            id: true,
            usuario: {
              select: {
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
        criadoPor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        confirmacoes: {
          select: {
            id: true,
            participanteEmail: true,
            participanteNome: true,
            status: true,
            confirmadoEm: true,
            observacoes: true,
          },
        },
      },
    });

    // Criar registros de confirmação para os participantes
    if (normalizedParticipantes.length > 0) {
      const confirmacoesData = normalizedParticipantes.map((email) => ({
        tenantId: context.tenantId,
        eventoId: evento.id,
        participanteEmail: email,
        status: "PENDENTE" as EventoConfirmacaoStatus,
      }));

      await prisma.eventoParticipante.createMany({
        data: confirmacoesData,
      });

      // Criar notificações para os participantes usando sistema híbrido
      const { publishNotification } = await import(
        "@/app/actions/notifications-hybrid"
      );

      for (const email of normalizedParticipantes) {
        await publishNotification({
          type: "evento.created",
          title: "Novo Evento - Confirmação Necessária",
          message: `Você foi convidado para o evento "${evento.titulo}" em ${new Date(evento.dataInicio).toLocaleDateString("pt-BR")} às ${new Date(evento.dataInicio).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}. Por favor, confirme sua participação.`,
          urgency: "MEDIUM",
          channels: ["REALTIME"],
          payload: {
            eventoId: evento.id,
            participanteEmail: email,
            tipoConfirmacao: "INVITE",
            eventoTitulo: evento.titulo,
            eventoData: evento.dataInicio,
            eventoLocal: evento.local,
          },
          referenciaTipo: "evento",
          referenciaId: evento.id,
        });
      }
    }

    // Sincronizar com Google Calendar se estiver habilitado
    try {
      await syncEventoWithGoogle(evento.id);
    } catch (error) {
      logger.warn("Erro ao sincronizar evento com Google Calendar:", error);
      // Não falhar a criação do evento por causa da sincronização
    }

    revalidatePath("/agenda");

    return { success: true, data: evento };
  } catch (error) {
    logger.error("Erro ao criar evento:", error);

    // Tratar erros específicos do Prisma
    if (error instanceof Error) {
      if (error.message.includes("P2003")) {
        return {
          success: false,
          error:
            "Erro de referência: um dos itens selecionados (processo, cliente ou advogado) não existe mais. Por favor, recarregue a página e tente novamente.",
        };
      }
      if (error.message.includes("P2002")) {
        return {
          success: false,
          error:
            "Já existe um evento com essas características. Verifique os dados e tente novamente.",
        };
      }
      if (
        error.message.includes("ZodError") ||
        error.message.includes("Validation")
      ) {
        return {
          success: false,
          error:
            "Dados inválidos. Verifique se todos os campos obrigatórios estão preenchidos corretamente.",
        };
      }
    }

    return {
      success: false,
      error: "Erro interno do servidor. Tente novamente em alguns instantes.",
    };
  }
}

// Atualizar evento
export async function updateEvento(
  id: string,
  formData: Partial<EventoFormData>,
) {
  try {
    const context = await requireAgendaContext("editar");

    if (context.isCliente) {
      return {
        success: false,
        error: "Clientes não podem editar eventos.",
      };
    }

    const eventoExistente = await prisma.evento.findFirst({
      where: {
        ...buildEventoScopeWhere(context, {
          includeParticipantEvents: false,
        }),
        id,
      },
    });

    if (!eventoExistente) {
      throw new Error("Evento não encontrado");
    }

    const normalizedPatch: Partial<EventoFormData> = {
      ...formData,
      titulo:
        formData.titulo !== undefined ? formData.titulo.trim() : undefined,
      descricao:
        formData.descricao !== undefined
          ? formData.descricao?.trim() || null
          : undefined,
      local: formData.local !== undefined ? formData.local?.trim() || null : undefined,
      observacoes:
        formData.observacoes !== undefined
          ? formData.observacoes?.trim() || null
          : undefined,
      participantes:
        formData.participantes !== undefined
          ? normalizeParticipantes(formData.participantes)
          : undefined,
    };

    const mergedFormData: EventoFormData = {
      ...getEventoFormDataFromEvento(eventoExistente),
      ...normalizedPatch,
    };

    const validation = validateEvento(mergedFormData);

    if (!validation.isValid) {
      return {
        success: false,
        error: validation.errors.join(". "),
      };
    }

    const relationshipsValidation = await validateEventoRelationships(context, {
      processoId: mergedFormData.processoId,
      clienteId: mergedFormData.clienteId,
      advogadoResponsavelId: mergedFormData.advogadoResponsavelId,
    });

    if (!relationshipsValidation.valid) {
      return {
        success: false,
        error: relationshipsValidation.error,
      };
    }

    const updateData: Prisma.EventoUncheckedUpdateInput = {};

    if (normalizedPatch.titulo !== undefined) {
      updateData.titulo = normalizedPatch.titulo;
    }

    if (normalizedPatch.descricao !== undefined) {
      updateData.descricao = normalizedPatch.descricao;
    }

    if (normalizedPatch.tipo !== undefined) {
      updateData.tipo = normalizedPatch.tipo;
    }

    if (normalizedPatch.status !== undefined) {
      updateData.status = normalizedPatch.status;
    }

    if (normalizedPatch.dataInicio !== undefined) {
      updateData.dataInicio = new Date(normalizedPatch.dataInicio);
    }

    if (normalizedPatch.dataFim !== undefined) {
      updateData.dataFim = new Date(normalizedPatch.dataFim);
    }

    if (normalizedPatch.local !== undefined) {
      updateData.local = normalizedPatch.local;
    }

    if (normalizedPatch.processoId !== undefined) {
      updateData.processoId = normalizedPatch.processoId;
    }

    if (normalizedPatch.clienteId !== undefined || normalizedPatch.processoId !== undefined) {
      updateData.clienteId = relationshipsValidation.inferredClienteId;
    }

    if (normalizedPatch.advogadoResponsavelId !== undefined) {
      updateData.advogadoResponsavelId = normalizedPatch.advogadoResponsavelId;
    }

    if (normalizedPatch.participantes !== undefined) {
      updateData.participantes = mergedFormData.participantes;
    }

    if (normalizedPatch.recorrencia !== undefined) {
      updateData.recorrencia = normalizedPatch.recorrencia;
    }

    if (normalizedPatch.recorrenciaFim !== undefined) {
      updateData.recorrenciaFim = normalizedPatch.recorrenciaFim;
    }

    if (normalizedPatch.googleEventId !== undefined) {
      updateData.googleEventId = normalizedPatch.googleEventId;
    }

    if (normalizedPatch.googleCalendarId !== undefined) {
      updateData.googleCalendarId = normalizedPatch.googleCalendarId;
    }

    if (normalizedPatch.lembreteMinutos !== undefined) {
      updateData.lembreteMinutos = normalizedPatch.lembreteMinutos;
    }

    if (normalizedPatch.observacoes !== undefined) {
      updateData.observacoes = normalizedPatch.observacoes;
    }

    const participantesAntes = normalizeParticipantes(eventoExistente.participantes);
    const participantesDepois = mergedFormData.participantes;
    const beforeMap = new Map(
      participantesAntes.map((email) => [normalizeEmail(email), email]),
    );
    const afterMap = new Map(
      participantesDepois.map((email) => [normalizeEmail(email), email]),
    );
    const participantesRemovidos = Array.from(beforeMap.entries())
      .filter(([key]) => !afterMap.has(key))
      .map(([, email]) => email);
    const participantesAdicionados = Array.from(afterMap.entries())
      .filter(([key]) => !beforeMap.has(key))
      .map(([, email]) => email);

    if (normalizedPatch.participantes !== undefined) {
      if (participantesRemovidos.length > 0) {
        await prisma.eventoParticipante.deleteMany({
          where: {
            tenantId: context.tenantId,
            eventoId: id,
            participanteEmail: {
              in: participantesRemovidos,
            },
          },
        });
      }

      if (participantesAdicionados.length > 0) {
        await prisma.eventoParticipante.createMany({
          data: participantesAdicionados.map((email) => ({
            tenantId: context.tenantId,
            eventoId: id,
            participanteEmail: email,
            status: "PENDENTE" as EventoConfirmacaoStatus,
          })),
          skipDuplicates: true,
        });
      }
    }

    const dataInicioDepois = new Date(mergedFormData.dataInicio);
    const dataFimDepois = new Date(mergedFormData.dataFim);
    const localDepois = mergedFormData.local || null;
    const mudancasCriticas =
      eventoExistente.dataInicio.getTime() !== dataInicioDepois.getTime() ||
      eventoExistente.dataFim.getTime() !== dataFimDepois.getTime() ||
      (eventoExistente.local || null) !== localDepois ||
      JSON.stringify(participantesAntes.sort()) !==
        JSON.stringify(participantesDepois.sort());

    const evento = await prisma.evento.update({
      where: { id },
      data: updateData,
      include: {
        processo: {
          select: {
            id: true,
            numero: true,
            titulo: true,
          },
        },
        cliente: {
          select: {
            id: true,
            nome: true,
            email: true,
          },
        },
        advogadoResponsavel: {
          select: {
            id: true,
            usuario: {
              select: {
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
        criadoPor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    if (mudancasCriticas) {
      if (participantesDepois.length > 0) {
        await prisma.eventoParticipante.updateMany({
          where: {
            eventoId: id,
            tenantId: context.tenantId,
            participanteEmail: {
              in: participantesDepois,
            },
          },
          data: {
            status: "PENDENTE",
            confirmadoEm: null,
            observacoes: "Evento alterado - confirmação necessária",
          },
        });

        const { publishNotification } = await import(
          "@/app/actions/notifications-hybrid"
        );

        for (const email of participantesDepois) {
          await publishNotification({
            type: "evento.updated",
            title: "Evento Alterado - Nova Confirmação Necessária",
            message: `O evento "${eventoExistente.titulo}" foi alterado. Por favor, confirme novamente sua participação.`,
            urgency: "HIGH",
            channels: ["REALTIME"],
            payload: {
              eventoId: evento.id,
              participanteEmail: email,
              tipoConfirmacao: "RE_CONFIRMACAO",
              motivo: "Evento alterado",
              eventoTitulo: eventoExistente.titulo,
              eventoData: evento.dataInicio,
              eventoLocal: evento.local,
            },
            referenciaTipo: "evento",
            referenciaId: evento.id,
          });
        }
      }
    }

    // Sincronizar com Google Calendar se estiver habilitado
    try {
      await syncEventoWithGoogle(id);
    } catch (error) {
      logger.warn("Erro ao sincronizar evento com Google Calendar:", error);
      // Não falhar a atualização do evento por causa da sincronização
    }

    revalidatePath("/agenda");

    return { success: true, data: evento };
  } catch (error) {
    logger.error("Erro ao atualizar evento:", error);

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro interno do servidor",
    };
  }
}

// Deletar evento
export async function deleteEvento(id: string) {
  try {
    const context = await requireAgendaContext();

    if (context.isCliente) {
      return {
        success: false,
        error: "Clientes não podem excluir eventos.",
      };
    }

    if (!context.isAdmin) {
      const [canDelete, canEdit] = await Promise.all([
        checkPermission(AGENDA_MODULE, "excluir"),
        checkPermission(AGENDA_MODULE, "editar"),
      ]);

      if (!canDelete && !canEdit) {
        throw new Error(agendaPermissionErrors.excluir);
      }
    }

    const evento = await prisma.evento.findFirst({
      where: {
        ...buildEventoScopeWhere(context, {
          includeParticipantEvents: false,
        }),
        id,
      },
    });

    if (!evento) {
      throw new Error("Evento não encontrado");
    }

    // Remover do Google Calendar se estiver sincronizado
    if (evento.googleEventId) {
      try {
        await removeEventoFromGoogle(id);
      } catch (error) {
        logger.warn("Erro ao remover evento do Google Calendar:", error);
        // Continuar com a exclusão local mesmo se houver erro no Google
      }
    }

    await prisma.evento.delete({ where: { id: evento.id } });

    revalidatePath("/agenda");

    return { success: true };
  } catch (error) {
    logger.error("Erro ao deletar evento:", error);

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro interno do servidor",
    };
  }
}

// Marcar evento como realizado
export async function marcarEventoComoRealizado(id: string) {
  try {
    const context = await requireAgendaContext("editar");

    if (context.isCliente) {
      return {
        success: false,
        error: "Clientes não podem alterar o status de eventos.",
      };
    }

    const eventoEscopo = await prisma.evento.findFirst({
      where: {
        ...buildEventoScopeWhere(context, {
          includeParticipantEvents: false,
        }),
        id,
      },
      select: { id: true },
    });

    if (!eventoEscopo) {
      throw new Error("Evento não encontrado");
    }

    const evento = await prisma.evento.update({
      where: { id: eventoEscopo.id },
      data: {
        status: "REALIZADO",
      },
    });

    revalidatePath("/agenda");

    return { success: true, data: evento };
  } catch (error) {
    logger.error("Erro ao marcar evento como realizado:", error);

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro interno do servidor",
    };
  }
}

// Confirmar participação em evento
export async function confirmarParticipacaoEvento(
  eventoId: string,
  participanteEmail: string,
  status: EventoConfirmacaoStatus,
  observacoes?: string,
) {
  try {
    const context = await requireAgendaContext("visualizar");
    const evento = await prisma.evento.findFirst({
      where: {
        ...buildEventoScopeWhere(context),
        id: eventoId,
      },
    });

    if (!evento) {
      throw new Error("Evento não encontrado");
    }

    const participanteCanonical = evento.participantes.find((email) =>
      isSameEmail(email, participanteEmail),
    );

    if (!participanteCanonical) {
      throw new Error(
        "Participante não está na lista de participantes do evento",
      );
    }

    const isConfirmandoProprioEmail =
      !!context.userEmail &&
      isSameEmail(participanteCanonical, context.userEmail);

    if (!isConfirmandoProprioEmail && !context.isAdmin) {
      const canEditEvents = await checkPermission(AGENDA_MODULE, "editar");

      if (!canEditEvents) {
        throw new Error(
          "Você só pode confirmar sua própria participação neste evento.",
        );
      }
    }

    // Atualizar ou criar confirmação
    const confirmacao = await prisma.eventoParticipante.upsert({
      where: {
        eventoId_participanteEmail: {
          eventoId,
          participanteEmail: participanteCanonical,
        },
      },
      update: {
        status,
        confirmadoEm: new Date(),
        observacoes,
      },
      create: {
        tenantId: context.tenantId,
        eventoId,
        participanteEmail: participanteCanonical,
        status,
        confirmadoEm: new Date(),
        observacoes,
      },
    });

    // Criar notificações para todos os outros participantes do evento
    const statusLabels: Record<EventoConfirmacaoStatus, string> = {
      PENDENTE: "atualizou a confirmação",
      CONFIRMADO: "confirmou",
      RECUSADO: "recusou",
      TALVEZ: "marcou como talvez",
    };

    const statusLabel = statusLabels[status];
    const outrosParticipantes = evento.participantes.filter(
      (email) => !isSameEmail(email, participanteCanonical),
    );

    if (outrosParticipantes.length > 0) {
      // Criar notificações para outros participantes usando sistema híbrido
      const { publishNotification } = await import(
        "@/app/actions/notifications-hybrid"
      );

      for (const email of outrosParticipantes) {
        await publishNotification({
          type: "evento.confirmation_updated",
          title: "Atualização de Confirmação",
          message: `${participanteCanonical} ${statusLabel} o evento "${evento.titulo}".`,
          urgency: "INFO",
          channels: ["REALTIME"],
          payload: {
            eventoId,
            participanteEmail: participanteCanonical,
            status,
            tipoConfirmacao: "RESPONSE",
            destinatarioEmail: email,
          },
          referenciaTipo: "evento",
          referenciaId: eventoId,
        });
      }
    }

    revalidatePath("/agenda");

    return { success: true, data: confirmacao };
  } catch (error) {
    logger.error("Erro ao confirmar participação:", error);

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro interno do servidor",
    };
  }
}

// Buscar confirmações de um evento
export async function getConfirmacoesEvento(eventoId: string) {
  try {
    const context = await requireAgendaContext("visualizar");

    const evento = await prisma.evento.findFirst({
      where: {
        ...buildEventoScopeWhere(context),
        id: eventoId,
      },
      select: { id: true },
    });

    if (!evento) {
      throw new Error("Evento não encontrado");
    }

    const confirmacoes = await prisma.eventoParticipante.findMany({
      where: {
        eventoId: evento.id,
        tenantId: context.tenantId,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    return { success: true, data: confirmacoes };
  } catch (error) {
    logger.error("Erro ao buscar confirmações:", error);

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro interno do servidor",
    };
  }
}

// Buscar dados para formulários (processos, clientes, advogados)
export async function getEventoFormData() {
  try {
    const context = await requireAgendaContext("visualizar");

    if (context.isCliente) {
      return {
        success: true,
        data: { processos: [], clientes: [], advogados: [] },
      };
    }

    const processWhere: Prisma.ProcessoWhereInput = {
      tenantId: context.tenantId,
      deletedAt: null,
    };
    const advogadoWhere: Prisma.AdvogadoWhereInput = {
      tenantId: context.tenantId,
    };

    if (!context.isAdmin) {
      if (context.accessibleAdvogadoIds.length === 0) {
        return {
          success: true,
          data: { processos: [], clientes: [], advogados: [] },
        };
      }

      processWhere.advogadoResponsavelId = {
        in: context.accessibleAdvogadoIds,
      };
      advogadoWhere.id = {
        in: context.accessibleAdvogadoIds,
      };
    }

    const processos = await prisma.processo.findMany({
      where: processWhere,
      select: {
        id: true,
        numero: true,
        titulo: true,
        clienteId: true,
      },
      orderBy: { numero: "desc" },
    });

    const clientesPorAdvogado =
      !context.isAdmin && context.accessibleAdvogadoIds.length > 0
        ? await prisma.advogadoCliente.findMany({
            where: {
              tenantId: context.tenantId,
              advogadoId: {
                in: context.accessibleAdvogadoIds,
              },
            },
            select: {
              clienteId: true,
            },
          })
        : [];

    const clienteIds = Array.from(
      new Set([
        ...processos.map((processo) => processo.clienteId).filter(Boolean),
        ...clientesPorAdvogado.map((item) => item.clienteId).filter(Boolean),
      ]),
    );

    const [clientes, advogados] = await Promise.all([
      clienteIds.length > 0
        ? prisma.cliente.findMany({
            where: {
              tenantId: context.tenantId,
              id: { in: clienteIds },
            },
            select: {
              id: true,
              nome: true,
              email: true,
            },
            orderBy: { nome: "asc" },
          })
        : Promise.resolve([]),
      prisma.advogado.findMany({
        where: advogadoWhere,
        select: {
          id: true,
          usuario: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
        orderBy: { usuario: { firstName: "asc" } },
      }),
    ]);

    return {
      success: true,
      data: { processos, clientes, advogados },
    };
  } catch (error) {
    logger.error("Erro ao buscar dados do formulário:", error);

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro interno do servidor",
    };
  }
}
