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
import { buildSoftDeletePayload } from "@/app/lib/soft-delete";

// Usar tipos do Prisma - sempre sincronizado com o banco!

const AGENDA_MODULE = "agenda";
const NO_ACCESS_ADVOGADO_ID = "__NO_ADVOGADO_ACCESS__";
const NO_ACCESS_EVENT_ID = "__NO_AGENDA_ACCESS__";
const EVENTOS_DEFAULT_PAGE_SIZE = 20;
const EVENTOS_MAX_PAGE_SIZE = 100;
const MAX_RECORRENCIA_OCORRENCIAS = 180;

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

export interface EventoListMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface EventoListResponse {
  success: boolean;
  data?: any[];
  meta?: EventoListMeta;
  error?: string;
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

function normalizeEventAccessLink(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const candidate =
    trimmed.startsWith("http://") || trimmed.startsWith("https://")
      ? trimmed
      : `https://${trimmed}`;

  try {
    const parsed = new URL(candidate);

    return parsed.hostname ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function normalizePage(page?: number) {
  if (!page || !Number.isFinite(page) || page < 1) {
    return 1;
  }

  return Math.floor(page);
}

function normalizePageSize(pageSize?: number) {
  if (!pageSize || !Number.isFinite(pageSize) || pageSize < 1) {
    return EVENTOS_DEFAULT_PAGE_SIZE;
  }

  return Math.min(EVENTOS_MAX_PAGE_SIZE, Math.floor(pageSize));
}

function buildEventoListMeta(
  total: number,
  page: number,
  pageSize: number,
): EventoListMeta {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);

  return {
    total,
    page: safePage,
    pageSize,
    totalPages,
    hasNextPage: safePage < totalPages,
    hasPreviousPage: safePage > 1,
  };
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
  | "deletedAt"
  | "deletedByActorType"
  | "deletedByActorId"
  | "deleteReason"
> & {
  dataInicio: string; // String para o formulário, será convertido para Date
  dataFim: string; // String para o formulário, será convertido para Date
  lembretesMinutos?: number[];
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

  const recorrenciaAtual = (data.recorrencia || "NENHUMA") as EventoRecorrenciaTipo;
  if (recorrenciaAtual !== "NENHUMA") {
    if (!data.recorrenciaFim) {
      errors.push("Informe a data final da recorrência");
    } else {
      const recorrenciaFimDate = new Date(data.recorrenciaFim);
      const inicio = new Date(data.dataInicio);
      if (
        Number.isNaN(recorrenciaFimDate.getTime()) ||
        recorrenciaFimDate <= inicio
      ) {
        errors.push("Data final da recorrência deve ser posterior ao início");
      }
    }
  }

  if (data.isOnline) {
    if (!data.linkAcesso?.trim()) {
      errors.push("Informe o link do evento online");
    } else if (!normalizeEventAccessLink(data.linkAcesso)) {
      errors.push("Link do evento online inválido");
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
    return { tenantId: context.tenantId, deletedAt: null };
  }

  if (context.isCliente) {
    if (!context.currentClienteId) {
      return {
        tenantId: context.tenantId,
        id: NO_ACCESS_EVENT_ID,
        deletedAt: null,
      };
    }

    return {
      tenantId: context.tenantId,
      clienteId: context.currentClienteId,
      deletedAt: null,
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
    deletedAt: null,
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

type EventoRecorrenciaTipo =
  | "NENHUMA"
  | "DIARIA"
  | "SEMANAL"
  | "MENSAL"
  | "ANUAL";

function advanceRecurrenceDate(base: Date, recorrencia: EventoRecorrenciaTipo) {
  const next = new Date(base);

  switch (recorrencia) {
    case "DIARIA":
      next.setDate(next.getDate() + 1);
      break;
    case "SEMANAL":
      next.setDate(next.getDate() + 7);
      break;
    case "MENSAL":
      next.setMonth(next.getMonth() + 1);
      break;
    case "ANUAL":
      next.setFullYear(next.getFullYear() + 1);
      break;
    default:
      break;
  }

  return next;
}

function buildRecurrenceOccurrences(params: {
  dataInicio: Date;
  dataFim: Date;
  recorrencia?: EventoRecorrenciaTipo | null;
  recorrenciaFim?: Date | null;
}) {
  const {
    dataInicio,
    dataFim,
    recorrencia = "NENHUMA",
    recorrenciaFim,
  } = params;
  const recorrenciaTipo: EventoRecorrenciaTipo = recorrencia ?? "NENHUMA";

  const baseDurationMs = dataFim.getTime() - dataInicio.getTime();
  const occurrences = [{ dataInicio, dataFim }];

  if (recorrenciaTipo === "NENHUMA" || !recorrenciaFim) {
    return occurrences;
  }

  let nextStart = advanceRecurrenceDate(dataInicio, recorrenciaTipo);
  let guard = 0;

  while (
    nextStart.getTime() <= recorrenciaFim.getTime() &&
    guard < MAX_RECORRENCIA_OCORRENCIAS
  ) {
    const nextEnd = new Date(nextStart.getTime() + baseDurationMs);
    occurrences.push({
      dataInicio: new Date(nextStart),
      dataFim: nextEnd,
    });
    nextStart = advanceRecurrenceDate(nextStart, recorrenciaTipo);
    guard += 1;
  }

  return occurrences;
}

async function findEventoConflitante(params: {
  context: AgendaSessionContext;
  dataInicio: Date;
  dataFim: Date;
  advogadoResponsavelId?: string | null;
  excludeEventoId?: string;
}) {
  const { context, dataInicio, dataFim, advogadoResponsavelId, excludeEventoId } =
    params;
  const where: Prisma.EventoWhereInput = {
    tenantId: context.tenantId,
    deletedAt: null,
    status: {
      not: "CANCELADO",
    },
    dataInicio: {
      lt: dataFim,
    },
    dataFim: {
      gt: dataInicio,
    },
  };

  if (excludeEventoId) {
    where.id = {
      not: excludeEventoId,
    };
  }

  if (advogadoResponsavelId) {
    where.advogadoResponsavelId = advogadoResponsavelId;
  } else {
    where.criadoPorId = context.userId;
  }

  return prisma.evento.findFirst({
    where,
    select: {
      id: true,
      titulo: true,
      dataInicio: true,
      dataFim: true,
    },
    orderBy: {
      dataInicio: "asc",
    },
  });
}

function parseTimeToMinutes(value: string | null | undefined) {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) {
    return null;
  }

  const [hoursText, minutesText] = value.split(":");
  const hours = Number.parseInt(hoursText, 10);
  const minutes = Number.parseInt(minutesText, 10);

  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  return hours * 60 + minutes;
}

async function validateEventoAgainstAvailability(params: {
  context: AgendaSessionContext;
  dataInicio: Date;
  dataFim: Date;
  advogadoResponsavelId?: string | null;
}): Promise<{ valid: true } | { valid: false; error: string }> {
  const { context, dataInicio, dataFim, advogadoResponsavelId } = params;
  let targetUsuarioId = context.userId;

  if (advogadoResponsavelId) {
    const advogado = await prisma.advogado.findFirst({
      where: {
        id: advogadoResponsavelId,
        tenantId: context.tenantId,
      },
      select: {
        usuarioId: true,
      },
    });

    if (!advogado) {
      return {
        valid: false,
        error: "Advogado responsável não encontrado para validar disponibilidade.",
      };
    }

    targetUsuarioId = advogado.usuarioId;
  }

  const diaSemana = dataInicio.getDay();
  const disponibilidade = await prisma.agendaDisponibilidade.findFirst({
    where: {
      tenantId: context.tenantId,
      usuarioId: targetUsuarioId,
      diaSemana,
    },
    select: {
      ativo: true,
      horaInicio: true,
      horaFim: true,
      intervaloInicio: true,
      intervaloFim: true,
    },
  });

  // Se não há disponibilidade configurada para o dia, manter comportamento atual.
  if (!disponibilidade) {
    return { valid: true };
  }

  if (!disponibilidade.ativo) {
    return {
      valid: false,
      error:
        "Este dia está bloqueado na disponibilidade do responsável. Ajuste o horário ou a disponibilidade.",
    };
  }

  const sameDay =
    dataInicio.getFullYear() === dataFim.getFullYear() &&
    dataInicio.getMonth() === dataFim.getMonth() &&
    dataInicio.getDate() === dataFim.getDate();
  if (!sameDay) {
    return {
      valid: false,
      error:
        "Eventos que atravessam mais de um dia não são permitidos com a disponibilidade ativa. Divida em eventos menores.",
    };
  }

  const startMinutes = dataInicio.getHours() * 60 + dataInicio.getMinutes();
  const endMinutes = dataFim.getHours() * 60 + dataFim.getMinutes();
  const jornadaInicio = parseTimeToMinutes(disponibilidade.horaInicio);
  const jornadaFim = parseTimeToMinutes(disponibilidade.horaFim);

  if (jornadaInicio === null || jornadaFim === null) {
    return {
      valid: false,
      error:
        "Disponibilidade com horários inválidos. Revise a configuração de jornada.",
    };
  }

  if (startMinutes < jornadaInicio || endMinutes > jornadaFim) {
    return {
      valid: false,
      error:
        "Evento fora da janela de disponibilidade do responsável. Ajuste início/fim dentro da jornada.",
    };
  }

  const intervaloInicio = parseTimeToMinutes(disponibilidade.intervaloInicio);
  const intervaloFim = parseTimeToMinutes(disponibilidade.intervaloFim);
  if (intervaloInicio !== null && intervaloFim !== null) {
    const intersectsInterval =
      startMinutes < intervaloFim && endMinutes > intervaloInicio;
    if (intersectsInterval) {
      return {
        valid: false,
        error:
          "Evento colide com o intervalo bloqueado da agenda do responsável.",
      };
    }
  }

  return { valid: true };
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
    isOnline: evento.isOnline,
    linkAcesso: evento.linkAcesso,
    recorrencia: evento.recorrencia,
    recorrenciaFim: evento.recorrenciaFim,
    googleEventId: evento.googleEventId,
    googleCalendarId: evento.googleCalendarId,
    lembreteMinutos: evento.lembreteMinutos,
    lembretesMinutos:
      (evento as Evento & { lembretesMinutos?: number[] }).lembretesMinutos
        ?.length
        ? [...(evento as Evento & { lembretesMinutos?: number[] }).lembretesMinutos]
        : evento.lembreteMinutos !== null &&
            evento.lembreteMinutos !== undefined &&
            evento.lembreteMinutos > 0
          ? [evento.lembreteMinutos]
          : [],
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
  origem?: "google" | "local";
},
pagination?: {
  page?: number;
  pageSize?: number;
}): Promise<EventoListResponse> {
  try {
    const context = await requireAgendaContext("visualizar");
    const where: Prisma.EventoWhereInput = buildEventoScopeWhere(context);

    if (filters?.dataInicio || filters?.dataFim) {
      // Filtra por sobreposição de intervalo para não ocultar eventos que
      // iniciam antes do período e terminam dentro/depois dele.
      const intervalClauses: Prisma.EventoWhereInput[] = [];

      if (filters.dataFim) {
        intervalClauses.push({
          dataInicio: {
            lte: filters.dataFim,
          },
        });
      }

      if (filters.dataInicio) {
        intervalClauses.push({
          dataFim: {
            gte: filters.dataInicio,
          },
        });
      }

      if (intervalClauses.length > 0) {
        const existingAnd = Array.isArray(where.AND)
          ? where.AND
          : where.AND
            ? [where.AND]
            : [];

        where.AND = [...existingAnd, ...intervalClauses];
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
        const page = normalizePage(pagination?.page);
        const pageSize = normalizePageSize(pagination?.pageSize);
        return {
          success: true,
          data: [],
          meta: buildEventoListMeta(0, page, pageSize),
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

    if (filters?.origem === "google") {
      where.googleEventId = {
        not: null,
      };
    } else if (filters?.origem === "local") {
      where.googleEventId = null;
    }

    const page = normalizePage(pagination?.page);
    const pageSize = normalizePageSize(pagination?.pageSize);
    const skip = (page - 1) * pageSize;
    const [total, eventos] = await prisma.$transaction([
      prisma.evento.count({ where }),
      prisma.evento.findMany({
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
        skip,
        take: pageSize,
      }),
    ]);

    const meta = buildEventoListMeta(total, page, pageSize);

    return { success: true, data: eventos, meta };
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
      isOnline: Boolean(formData.isOnline),
      linkAcesso: normalizeEventAccessLink(formData.linkAcesso),
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

    const dataInicioEvento = new Date(normalizedFormData.dataInicio);
    const dataFimEvento = new Date(normalizedFormData.dataFim);
    const disponibilidadeValidation = await validateEventoAgainstAvailability({
      context,
      dataInicio: dataInicioEvento,
      dataFim: dataFimEvento,
      advogadoResponsavelId: normalizedFormData.advogadoResponsavelId,
    });

    if (!disponibilidadeValidation.valid) {
      return {
        success: false,
        error: disponibilidadeValidation.error,
      };
    }

    const conflito = await findEventoConflitante({
      context,
      dataInicio: dataInicioEvento,
      dataFim: dataFimEvento,
      advogadoResponsavelId: normalizedFormData.advogadoResponsavelId,
    });

    if (conflito) {
      return {
        success: false,
        error: `Conflito de agenda com "${conflito.titulo}" (${new Date(
          conflito.dataInicio,
        ).toLocaleString("pt-BR")} - ${new Date(conflito.dataFim).toLocaleString(
          "pt-BR",
        )}).`,
      };
    }

    const recorrenciaTipo = (normalizedFormData.recorrencia ||
      "NENHUMA") as EventoRecorrenciaTipo;
    const lembretesMinutosNormalizados = Array.from(
      new Set(
        (normalizedFormData.lembretesMinutos || [])
          .map((value) => Number(value))
          .filter((value) => Number.isFinite(value) && value > 0),
      ),
    ).sort((a, b) => b - a);
    const lembreteMinutosFallback =
      normalizedFormData.lembreteMinutos && normalizedFormData.lembreteMinutos > 0
        ? normalizedFormData.lembreteMinutos
        : lembretesMinutosNormalizados.length > 0
          ? Math.min(...lembretesMinutosNormalizados)
          : 0;
    const recorrenciaFimDate = normalizedFormData.recorrenciaFim
      ? new Date(normalizedFormData.recorrenciaFim)
      : null;
    const occurrences = buildRecurrenceOccurrences({
      dataInicio: dataInicioEvento,
      dataFim: dataFimEvento,
      recorrencia: recorrenciaTipo,
      recorrenciaFim: recorrenciaFimDate,
    });

    for (let index = 1; index < occurrences.length; index += 1) {
      const occurrence = occurrences[index];
      const availabilityForOccurrence = await validateEventoAgainstAvailability({
        context,
        dataInicio: occurrence.dataInicio,
        dataFim: occurrence.dataFim,
        advogadoResponsavelId: normalizedFormData.advogadoResponsavelId,
      });

      if (!availabilityForOccurrence.valid) {
        return {
          success: false,
          error: `${availabilityForOccurrence.error} (ocorrência em ${occurrence.dataInicio.toLocaleString(
            "pt-BR",
          )})`,
        };
      }

      const conflitoOcorrencia = await findEventoConflitante({
        context,
        dataInicio: occurrence.dataInicio,
        dataFim: occurrence.dataFim,
        advogadoResponsavelId: normalizedFormData.advogadoResponsavelId,
      });

      if (conflitoOcorrencia) {
        return {
          success: false,
          error: `Conflito de agenda em recorrência com "${
            conflitoOcorrencia.titulo
          }" (${new Date(conflitoOcorrencia.dataInicio).toLocaleString(
            "pt-BR",
          )} - ${new Date(conflitoOcorrencia.dataFim).toLocaleString(
            "pt-BR",
          )}).`,
        };
      }
    }

    const createdEventIds = await prisma.$transaction(async (tx) => {
      const createdIds: string[] = [];

      for (const occurrence of occurrences) {
        const created = await tx.evento.create({
          data: {
            tenantId: context.tenantId,
            criadoPorId: context.userId,
            titulo: normalizedFormData.titulo,
            descricao: normalizedFormData.descricao,
            tipo: normalizedFormData.tipo,
            status: normalizedFormData.status,
            dataInicio: occurrence.dataInicio,
            dataFim: occurrence.dataFim,
            local: normalizedFormData.local,
            participantes: normalizedParticipantes,
            processoId: normalizedFormData.processoId,
            clienteId: relationshipsValidation.inferredClienteId,
            advogadoResponsavelId: normalizedFormData.advogadoResponsavelId,
            isOnline: normalizedFormData.isOnline,
            linkAcesso: normalizedFormData.linkAcesso,
            recorrencia: recorrenciaTipo,
            recorrenciaFim: recorrenciaTipo === "NENHUMA" ? null : recorrenciaFimDate,
            googleEventId: normalizedFormData.googleEventId,
            googleCalendarId: normalizedFormData.googleCalendarId,
            lembreteMinutos:
              lembreteMinutosFallback > 0 ? lembreteMinutosFallback : null,
            lembretesMinutos: lembretesMinutosNormalizados,
            observacoes: normalizedFormData.observacoes,
          },
          select: {
            id: true,
          },
        });
        createdIds.push(created.id);
      }

      if (normalizedParticipantes.length > 0) {
        for (const eventoId of createdIds) {
          await tx.eventoParticipante.createMany({
            data: normalizedParticipantes.map((email) => ({
              tenantId: context.tenantId,
              eventoId,
              participanteEmail: email,
              status: "PENDENTE" as EventoConfirmacaoStatus,
            })),
            skipDuplicates: true,
          });
        }
      }

      return createdIds;
    });

    const eventoPrincipal = await prisma.evento.findFirst({
      where: {
        id: createdEventIds[0],
        tenantId: context.tenantId,
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

    if (!eventoPrincipal) {
      return {
        success: false,
        error: "Evento principal não encontrado após criação.",
      };
    }

    if (normalizedParticipantes.length > 0) {
      try {
        // Falha de notificação não deve quebrar criação do evento.
        const { publishNotification } = await import(
          "@/app/actions/notifications-hybrid"
        );

        for (const email of normalizedParticipantes) {
          await publishNotification({
            type: "evento.created",
            title: "Novo Evento - Confirmação Necessária",
            message: `Você foi convidado para o evento "${eventoPrincipal.titulo}" em ${new Date(
              eventoPrincipal.dataInicio,
            ).toLocaleDateString("pt-BR")} às ${new Date(
              eventoPrincipal.dataInicio,
            ).toLocaleTimeString("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
            })}. Por favor, confirme sua participação.`,
            urgency: "MEDIUM",
            channels: ["REALTIME"],
            payload: {
              eventoId: eventoPrincipal.id,
              participanteEmail: email,
              tipoConfirmacao: "INVITE",
              eventoTitulo: eventoPrincipal.titulo,
              eventoData: eventoPrincipal.dataInicio,
              eventoLocal: eventoPrincipal.local,
              isOnline: eventoPrincipal.isOnline,
              linkAcesso: eventoPrincipal.linkAcesso,
              detailLines: eventoPrincipal.isOnline
                ? [
                    "Evento online",
                    ...(eventoPrincipal.linkAcesso
                      ? [`Link: ${eventoPrincipal.linkAcesso}`]
                      : []),
                  ]
                : [],
            },
            referenciaTipo: "evento",
            referenciaId: eventoPrincipal.id,
          });
        }
      } catch (notificationError) {
        logger.warn(
          "Erro ao publicar notificações de criação de evento:",
          notificationError,
        );
      }
    }

    // Sincronizar com Google Calendar se estiver habilitado
    try {
      await syncEventoWithGoogle(eventoPrincipal.id);
    } catch (error) {
      logger.warn("Erro ao sincronizar evento com Google Calendar:", error);
      // Não falhar a criação do evento por causa da sincronização
    }

    revalidatePath("/agenda");

    return {
      success: true,
      data: eventoPrincipal,
      recorrenciasCriadas: Math.max(0, createdEventIds.length - 1),
    };
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
      isOnline:
        formData.isOnline !== undefined ? Boolean(formData.isOnline) : undefined,
      linkAcesso:
        formData.linkAcesso !== undefined
          ? normalizeEventAccessLink(formData.linkAcesso)
          : undefined,
      observacoes:
        formData.observacoes !== undefined
          ? formData.observacoes?.trim() || null
          : undefined,
      participantes:
        formData.participantes !== undefined
          ? normalizeParticipantes(formData.participantes)
          : undefined,
      lembretesMinutos:
        formData.lembretesMinutos !== undefined
          ? Array.from(
              new Set(
                formData.lembretesMinutos
                  .map((value) => Number(value))
                  .filter((value) => Number.isFinite(value) && value > 0),
              ),
            ).sort((a, b) => b - a)
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

    const dataInicioDepois = new Date(mergedFormData.dataInicio);
    const dataFimDepois = new Date(mergedFormData.dataFim);
    const disponibilidadeValidation = await validateEventoAgainstAvailability({
      context,
      dataInicio: dataInicioDepois,
      dataFim: dataFimDepois,
      advogadoResponsavelId: mergedFormData.advogadoResponsavelId,
    });

    if (!disponibilidadeValidation.valid) {
      return {
        success: false,
        error: disponibilidadeValidation.error,
      };
    }

    const conflito = await findEventoConflitante({
      context,
      dataInicio: dataInicioDepois,
      dataFim: dataFimDepois,
      advogadoResponsavelId: mergedFormData.advogadoResponsavelId,
      excludeEventoId: id,
    });

    if (conflito) {
      return {
        success: false,
        error: `Conflito de agenda com "${conflito.titulo}" (${new Date(
          conflito.dataInicio,
        ).toLocaleString("pt-BR")} - ${new Date(conflito.dataFim).toLocaleString(
          "pt-BR",
        )}).`,
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

    if (normalizedPatch.googleEventId !== undefined) {
      updateData.googleEventId = normalizedPatch.googleEventId;
    }

    if (normalizedPatch.googleCalendarId !== undefined) {
      updateData.googleCalendarId = normalizedPatch.googleCalendarId;
    }

    if (normalizedPatch.isOnline !== undefined) {
      updateData.isOnline = normalizedPatch.isOnline;
    }

    if (normalizedPatch.linkAcesso !== undefined) {
      updateData.linkAcesso = normalizedPatch.linkAcesso;
    }

    if (normalizedPatch.lembreteMinutos !== undefined) {
      updateData.lembreteMinutos = normalizedPatch.lembreteMinutos;
    }

    if (normalizedPatch.lembretesMinutos !== undefined) {
      updateData.lembretesMinutos = normalizedPatch.lembretesMinutos;

      if (normalizedPatch.lembretesMinutos.length > 0) {
        updateData.lembreteMinutos = Math.min(...normalizedPatch.lembretesMinutos);
      } else if (normalizedPatch.lembreteMinutos === undefined) {
        updateData.lembreteMinutos = null;
      }
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
        await prisma.eventoParticipante.updateMany({
          where: {
            tenantId: context.tenantId,
            eventoId: id,
            deletedAt: null,
            participanteEmail: {
              in: participantesRemovidos,
            },
          },
          data: buildSoftDeletePayload(
            { actorId: context.userId, actorType: "USER" },
            "Remoção lógica de participante do evento",
          ),
        });
      }

      if (participantesAdicionados.length > 0) {
        await prisma.eventoParticipante.updateMany({
          where: {
            tenantId: context.tenantId,
            eventoId: id,
            participanteEmail: {
              in: participantesAdicionados,
            },
            NOT: {
              deletedAt: null,
            },
          },
          data: {
            deletedAt: null,
            deletedByActorType: null,
            deletedByActorId: null,
            deleteReason: null,
            status: "PENDENTE",
            confirmadoEm: null,
            observacoes: null,
          },
        });

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
            deletedAt: null,
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

        try {
          // Falha de notificação não deve quebrar atualização do evento.
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
                isOnline: evento.isOnline,
                linkAcesso: evento.linkAcesso,
              },
              referenciaTipo: "evento",
              referenciaId: evento.id,
            });
          }
        } catch (notificationError) {
          logger.warn(
            "Erro ao publicar notificações de atualização de evento:",
            notificationError,
          );
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

    await prisma.evento.update({
      where: { id: evento.id },
      data: buildSoftDeletePayload(
        { actorId: context.userId, actorType: "USER" },
        "Remoção lógica de evento da agenda",
      ),
    });

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
      try {
        // Falha de notificação não deve quebrar a confirmação de presença.
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
              isOnline: evento.isOnline,
              linkAcesso: evento.linkAcesso,
            },
            referenciaTipo: "evento",
            referenciaId: eventoId,
          });
        }
      } catch (notificationError) {
        logger.warn(
          "Erro ao publicar notificações de confirmação de evento:",
          notificationError,
        );
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
        deletedAt: null,
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
