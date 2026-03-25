import prisma from "./prisma";
import { emailTemplates } from "./email";
import { syncEventWithGoogle } from "./google-calendar";

import { emailService } from "@/app/lib/email-service";
import { buildSoftDeletePayload } from "@/app/lib/soft-delete";
import logger from "@/lib/logger";

// Interface para criar evento
export interface CreateEventoData {
  tenantId: string;
  titulo: string;
  descricao?: string;
  tipo: "AUDIENCIA" | "REUNIAO" | "CONSULTA" | "PRAZO" | "LEMBRETE" | "OUTRO";
  dataInicio: Date;
  dataFim: Date;
  local?: string;
  participantes: string[];
  processoId?: string;
  clienteId?: string;
  advogadoResponsavelId?: string;
  criadoPorId: string;
  recorrencia?: "NENHUMA" | "DIARIA" | "SEMANAL" | "MENSAL" | "ANUAL";
  recorrenciaFim?: Date;
  lembreteMinutos?: number;
  observacoes?: string;
  syncWithGoogle?: boolean;
  googleTokens?: {
    accessToken: string;
    refreshToken: string;
  };
}

// Interface para atualizar evento
export interface UpdateEventoData extends Partial<CreateEventoData> {
  id: string;
}

// Função para criar evento
export const createEvento = async (data: CreateEventoData) => {
  try {
    const evento = await prisma.evento.create({
      data: {
        tenantId: data.tenantId,
        titulo: data.titulo,
        descricao: data.descricao,
        tipo: data.tipo,
        dataInicio: data.dataInicio,
        dataFim: data.dataFim,
        local: data.local,
        participantes: data.participantes,
        processoId: data.processoId,
        clienteId: data.clienteId,
        advogadoResponsavelId: data.advogadoResponsavelId,
        criadoPorId: data.criadoPorId,
        recorrencia: data.recorrencia || "NENHUMA",
        recorrenciaFim: data.recorrenciaFim,
        lembreteMinutos: data.lembreteMinutos,
        observacoes: data.observacoes,
      },
      include: {
        processo: true,
        cliente: true,
        advogadoResponsavel: {
          include: {
            usuario: true,
          },
        },
        criadoPor: true,
      },
    });

    // Sincronizar com Google Calendar se solicitado
    if (data.syncWithGoogle && data.googleTokens) {
      try {
        const googleResult = await syncEventWithGoogle(
          {
            id: evento.id,
            titulo: evento.titulo,
            descricao: evento.descricao || undefined,
            dataInicio: evento.dataInicio,
            dataFim: evento.dataFim,
            local: evento.local || undefined,
            participantes: evento.participantes,
            lembreteMinutos: evento.lembreteMinutos || undefined,
          },
          data.googleTokens,
        );

        if (googleResult.success && googleResult.data) {
          await prisma.evento.update({
            where: { id: evento.id },
            data: {
              googleEventId: googleResult.data.id,
            },
          });
        }
      } catch (error) {
        logger.error("Erro ao sincronizar com Google Calendar:", error);
        // Não falha a criação do evento local se a sincronização falhar
      }
    }

    // Enviar notificações por email para participantes
    if (data.participantes.length > 0) {
      try {
        const emailPromises = data.participantes.map((email) => {
          const template = emailTemplates.novoEvento({
            titulo: evento.titulo,
            dataInicio: evento.dataInicio.toLocaleString("pt-BR"),
            local: evento.local || undefined,
            descricao: evento.descricao || undefined,
          });

          return emailService.sendEmailPerTenant(evento.tenantId, {
            to: email,
            subject: template.subject,
            html: template.html,
            credentialType: "DEFAULT",
          });
        });

        await Promise.all(emailPromises);
      } catch (error) {
        logger.error("Erro ao enviar emails de notificação:", error);
        // Não falha a criação do evento se o email falhar
      }
    }

    return { success: true, data: evento };
  } catch (error) {
    logger.error("Erro ao criar evento:", error);

    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro desconhecido",
    };
  }
};

// Função para atualizar evento
export const updateEvento = async (data: UpdateEventoData) => {
  try {
    const eventoExistente = await prisma.evento.findUnique({
      where: { id: data.id },
    });

    if (!eventoExistente) {
      return { success: false, error: "Evento não encontrado" };
    }

    const evento = await prisma.evento.update({
      where: { id: data.id },
      data: {
        titulo: data.titulo,
        descricao: data.descricao,
        tipo: data.tipo,
        dataInicio: data.dataInicio,
        dataFim: data.dataFim,
        local: data.local,
        participantes: data.participantes,
        processoId: data.processoId,
        clienteId: data.clienteId,
        advogadoResponsavelId: data.advogadoResponsavelId,
        recorrencia: data.recorrencia,
        recorrenciaFim: data.recorrenciaFim,
        lembreteMinutos: data.lembreteMinutos,
        observacoes: data.observacoes,
      },
      include: {
        processo: true,
        cliente: true,
        advogadoResponsavel: {
          include: {
            usuario: true,
          },
        },
        criadoPor: true,
      },
    });

    // Sincronizar com Google Calendar se o evento já estava sincronizado
    if (eventoExistente.googleEventId && data.googleTokens) {
      try {
        await syncEventWithGoogle(
          {
            id: evento.id,
            titulo: evento.titulo,
            descricao: evento.descricao || undefined,
            dataInicio: evento.dataInicio,
            dataFim: evento.dataFim,
            local: evento.local || undefined,
            participantes: evento.participantes,
            lembreteMinutos: evento.lembreteMinutos || undefined,
          },
          data.googleTokens,
          eventoExistente.googleEventId,
        );
      } catch (error) {
        logger.error("Erro ao atualizar evento no Google Calendar:", error);
      }
    }

    return { success: true, data: evento };
  } catch (error) {
    logger.error("Erro ao atualizar evento:", error);

    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro desconhecido",
    };
  }
};

// Função para deletar evento
export const deleteEvento = async (
  eventoId: string,
  googleTokens?: { accessToken: string; refreshToken: string },
) => {
  try {
    const evento = await prisma.evento.findUnique({
      where: { id: eventoId },
    });

    if (!evento || evento.deletedAt) {
      return { success: false, error: "Evento não encontrado" };
    }

    // Deletar do Google Calendar se estiver sincronizado
    if (evento.googleEventId && googleTokens) {
      try {
        const { deleteCalendarEvent } = await import("./google-calendar");

        await deleteCalendarEvent(
          googleTokens.accessToken,
          googleTokens.refreshToken,
          evento.googleEventId,
        );
      } catch (error) {
        logger.error("Erro ao deletar evento do Google Calendar:", error);
        // Continua com a deleção local mesmo se falhar no Google
      }
    }

    await prisma.evento.update({
      where: { id: eventoId },
      data: buildSoftDeletePayload(
        {
          actorType: "SYSTEM",
          actorId: null,
        },
        "Exclusão via serviço de agenda",
      ),
    });

    return { success: true };
  } catch (error) {
    logger.error("Erro ao deletar evento:", error);

    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro desconhecido",
    };
  }
};

// Função para listar eventos por período
export const listEventos = async (
  tenantId: string,
  dataInicio: Date,
  dataFim: Date,
  filtros?: {
    processoId?: string;
    clienteId?: string;
    advogadoResponsavelId?: string;
    tipo?: string;
    status?: string;
  },
) => {
  try {
    const eventos = await prisma.evento.findMany({
      where: {
        tenantId,
        deletedAt: null,
        dataInicio: {
          gte: dataInicio,
        },
        dataFim: {
          lte: dataFim,
        },
        ...(filtros?.processoId && { processoId: filtros.processoId }),
        ...(filtros?.clienteId && { clienteId: filtros.clienteId }),
        ...(filtros?.advogadoResponsavelId && {
          advogadoResponsavelId: filtros.advogadoResponsavelId,
        }),
        ...(filtros?.tipo && {
          tipo: filtros.tipo as
            | "AUDIENCIA"
            | "REUNIAO"
            | "CONSULTA"
            | "PRAZO"
            | "LEMBRETE"
            | "OUTRO",
        }),
        ...(filtros?.status && {
          status: filtros.status as
            | "AGENDADO"
            | "CONFIRMADO"
            | "REALIZADO"
            | "CANCELADO",
        }),
      },
      include: {
        processo: true,
        cliente: true,
        advogadoResponsavel: {
          include: {
            usuario: true,
          },
        },
        criadoPor: true,
      },
      orderBy: {
        dataInicio: "asc",
      },
    });

    return { success: true, data: eventos };
  } catch (error) {
    logger.error("Erro ao listar eventos:", error);

    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro desconhecido",
    };
  }
};

// Função para obter evento por ID
export const getEventoById = async (eventoId: string) => {
  try {
    const evento = await prisma.evento.findUnique({
      where: { id: eventoId },
      include: {
        processo: true,
        cliente: true,
        advogadoResponsavel: {
          include: {
            usuario: true,
          },
        },
        criadoPor: true,
      },
    });

    if (!evento) {
      return { success: false, error: "Evento não encontrado" };
    }

    return { success: true, data: evento };
  } catch (error) {
    logger.error("Erro ao obter evento:", error);

    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro desconhecido",
    };
  }
};

// Função para enviar lembretes de eventos
export const enviarLembretesEventos = async () => {
  try {
    const agora = new Date();
    const proximos30Minutos = new Date(agora.getTime() + 30 * 60 * 1000);

    // Buscar eventos que começam nos próximos 30 minutos e têm lembrete configurado
    const eventos = await prisma.evento.findMany({
      where: {
        dataInicio: {
          gte: agora,
          lte: proximos30Minutos,
        },
        status: {
          in: ["AGENDADO", "CONFIRMADO"],
        },
        lembreteMinutos: {
          not: null,
        },
        // Verificar se o lembrete já foi enviado (poderia adicionar um campo para isso)
      },
      include: {
        processo: true,
        cliente: true,
        advogadoResponsavel: {
          include: {
            usuario: true,
          },
        },
      },
    });

    const lembretesEnviados = [];

    for (const evento of eventos) {
      const minutosRestantes = Math.round(
        (evento.dataInicio.getTime() - agora.getTime()) / (1000 * 60),
      );

      // Verificar se está na hora de enviar o lembrete
      if (
        evento.lembreteMinutos &&
        minutosRestantes <= evento.lembreteMinutos
      ) {
        try {
          const template = emailTemplates.lembreteEvento({
            titulo: evento.titulo,
            dataInicio: evento.dataInicio.toLocaleString("pt-BR"),
            local: evento.local ?? undefined,
            minutosRestantes,
          });

          // Enviar para todos os participantes
          const emailPromises = evento.participantes.map((email) => {
            return emailService.sendEmailPerTenant(evento.tenantId, {
              to: email,
              subject: template.subject,
              html: template.html,
              credentialType: "DEFAULT",
            });
          });

          await Promise.all(emailPromises);
          lembretesEnviados.push(evento.id);
        } catch (error) {
          logger.error(
            `Erro ao enviar lembrete para evento ${evento.id}:`,
            error,
          );
        }
      }
    }

    return {
      success: true,
      data: {
        eventosProcessados: eventos.length,
        lembretesEnviados: lembretesEnviados.length,
      },
    };
  } catch (error) {
    logger.error("Erro ao enviar lembretes:", error);

    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro desconhecido",
    };
  }
};

// Função para marcar evento como realizado
export const marcarEventoComoRealizado = async (eventoId: string) => {
  try {
    const evento = await prisma.evento.update({
      where: { id: eventoId },
      data: {
        status: "REALIZADO",
      },
    });

    return { success: true, data: evento };
  } catch (error) {
    logger.error("Erro ao marcar evento como realizado:", error);

    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro desconhecido",
    };
  }
};
