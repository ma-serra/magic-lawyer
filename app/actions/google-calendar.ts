"use server";

import { getServerSession } from "next-auth/next";
import { revalidatePath } from "next/cache";

import prisma from "@/app/lib/prisma";
import { authOptions } from "@/auth";
import logger from "@/lib/logger";
import {
  getAuthUrl,
  getTokensFromCode,
  refreshAccessToken,
  isTokenExpired,
  listCalendars,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  listEvents,
  type GoogleCalendarEvent,
  type CalendarApiResponse,
} from "@/app/lib/google-calendar";

// Tipos para tokens do Google
export interface GoogleTokens {
  access_token: string;
  refresh_token: string;
  expiry_date: number;
  scope: string;
  token_type: string;
}

// Função auxiliar para buscar o tenant do usuário atual
async function getCurrentTenant(userId: string) {
  const usuario = await prisma.usuario.findUnique({
    where: { id: userId },
    select: { tenantId: true },
  });

  if (!usuario) {
    return null;
  }

  return await prisma.tenant.findUnique({
    where: { id: usuario.tenantId },
  });
}

// Obter URL de autorização do Google Calendar
export async function getGoogleCalendarAuthUrl(currentDomain?: string) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      throw new Error("Usuário não autenticado");
    }

    const authUrl = getAuthUrl(session.user.id, currentDomain);

    return { success: true, data: { authUrl } };
  } catch (error) {
    logger.error("Erro ao obter URL de autorização:", error);

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro interno do servidor",
    };
  }
}

// Processar callback do Google OAuth
export async function handleGoogleCalendarCallback(
  code: string,
  state: string,
) {
  try {
    // Extrair userId do state (formato: userId|domain)
    const [userId, originalDomain] = state.split("|");

    logger.info(
      `[DEBUG] handleGoogleCalendarCallback - state: ${state}, userId: ${userId}, originalDomain: ${originalDomain}`,
    );

    if (!userId) {
      throw new Error("Estado de autorização inválido - userId não encontrado");
    }

    // Verificar se o state corresponde ao usuário atual
    const session = await getServerSession(authOptions);

    logger.info(
      `[DEBUG] Session userId: ${session?.user?.id}, expected userId: ${userId}`,
    );

    // Se a sessão mudou, verificar se o userId do state corresponde a um usuário válido
    if (!session?.user?.id) {
      // Tentar buscar o usuário pelo userId do state
      const usuario = await prisma.usuario.findUnique({
        where: { id: userId },
      });

      if (!usuario) {
        throw new Error(
          "Estado de autorização inválido - usuário não encontrado",
        );
      }

      logger.info(`[DEBUG] Usuário encontrado pelo state: ${usuario.email}`);
    } else if (session.user.id !== userId) {
      // Sessão existe mas é diferente - verificar se o userId do state é válido
      const usuario = await prisma.usuario.findUnique({
        where: { id: userId },
      });

      if (!usuario) {
        throw new Error(
          "Estado de autorização inválido - usuário não encontrado",
        );
      }

      logger.info(
        `[DEBUG] Sessão diferente, mas usuário válido: ${usuario.email}`,
      );
    }

    // Trocar código por tokens
    const tokenResult = await getTokensFromCode(code);

    if (!tokenResult.success || !tokenResult.tokens) {
      throw new Error("Erro ao obter tokens de acesso");
    }

    const tokens = tokenResult.tokens as GoogleTokens;

    // Buscar calendários do usuário
    const calendarsResult = await listCalendars(
      tokens.access_token,
      tokens.refresh_token,
    );

    if (!calendarsResult.success) {
      throw new Error("Erro ao buscar calendários");
    }

    const calendars = calendarsResult.data || [];
    const primaryCalendar =
      calendars.find((cal: any) => cal.primary) || calendars[0];

    if (!primaryCalendar) {
      throw new Error("Nenhum calendário encontrado");
    }

    // Salvar tokens e configurações no banco
    const usuario = await prisma.usuario.update({
      where: { id: userId },
      data: {
        googleCalendarConnected: true,
        googleCalendarTokens: tokens as any,
        googleCalendarId: primaryCalendar.id,
        googleCalendarSyncEnabled: true,
      },
    });

    logger.info(`Google Calendar conectado para usuário ${userId}`);

    revalidatePath("/agenda");
    revalidatePath("/configuracoes");

    return {
      success: true,
      data: {
        calendarName: primaryCalendar.summary,
        calendarId: primaryCalendar.id,
      },
    };
  } catch (error) {
    logger.error("Erro ao processar callback do Google Calendar:", error);

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro interno do servidor",
    };
  }
}

// Desconectar Google Calendar
export async function disconnectGoogleCalendar() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      throw new Error("Usuário não autenticado");
    }

    // Remover tokens e configurações do banco
    await prisma.usuario.update({
      where: { id: session.user.id },
      data: {
        googleCalendarConnected: false,
        googleCalendarTokens: null as any,
        googleCalendarId: null,
        googleCalendarSyncEnabled: false,
      },
    });

    // Remover googleEventId de todos os eventos do usuário
    const tenant = await getCurrentTenant(session.user.id);

    if (tenant) {
      await prisma.evento.updateMany({
        where: {
          tenantId: tenant.id,
          googleEventId: { not: null },
        },
        data: {
          googleEventId: null,
          googleCalendarId: null,
        },
      });
    }

    logger.info(`Google Calendar desconectado para usuário ${session.user.id}`);

    revalidatePath("/agenda");
    revalidatePath("/configuracoes");

    return { success: true };
  } catch (error) {
    logger.error("Erro ao desconectar Google Calendar:", error);

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro interno do servidor",
    };
  }
}

// Alternar sincronização
export async function toggleGoogleCalendarSync(enabled: boolean) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      throw new Error("Usuário não autenticado");
    }

    await prisma.usuario.update({
      where: { id: session.user.id },
      data: {
        googleCalendarSyncEnabled: enabled,
      },
    });

    logger.info(
      `Sincronização Google Calendar ${enabled ? "habilitada" : "desabilitada"} para usuário ${session.user.id}`,
    );

    revalidatePath("/agenda");
    revalidatePath("/configuracoes");

    return { success: true };
  } catch (error) {
    logger.error("Erro ao alternar sincronização:", error);

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro interno do servidor",
    };
  }
}

// Sincronizar evento específico com Google Calendar
export async function syncEventoWithGoogle(eventoId: string) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      throw new Error("Usuário não autenticado");
    }

    const tenant = await getCurrentTenant(session.user.id);

    if (!tenant) {
      throw new Error("Tenant não encontrado");
    }

    // Buscar usuário e tokens
    const usuario = await prisma.usuario.findUnique({
      where: { id: session.user.id },
      select: {
        googleCalendarConnected: true,
        googleCalendarTokens: true,
        googleCalendarId: true,
        googleCalendarSyncEnabled: true,
      },
    });

    if (
      !usuario?.googleCalendarConnected ||
      !usuario?.googleCalendarSyncEnabled
    ) {
      throw new Error(
        "Google Calendar não está conectado ou sincronização desabilitada",
      );
    }

    const tokens = usuario.googleCalendarTokens as unknown as GoogleTokens;

    if (!tokens?.access_token || !tokens?.refresh_token) {
      throw new Error("Tokens do Google Calendar não encontrados");
    }

    // TODOS os usuários (incluindo admin) devem sincronizar apenas eventos onde são o advogado responsável
    // Buscar o advogado pelo usuarioId
    const advogado = await prisma.advogado.findFirst({
      where: { usuarioId: session.user.id },
      select: { id: true },
    });

    if (!advogado) {
      throw new Error("Usuário não é um advogado registrado");
    }

    // Verificar se o evento pertence ao advogado logado
    let whereClause: any = {
      id: eventoId,
      tenantId: tenant.id,
      advogadoResponsavelId: advogado.id, // Apenas eventos onde o usuário é responsável
    };

    // Buscar evento
    const evento = await prisma.evento.findFirst({
      where: whereClause,
      include: {
        processo: {
          select: { numero: true, titulo: true },
        },
        cliente: {
          select: { nome: true },
        },
      },
    });

    if (!evento) {
      throw new Error("Evento não encontrado");
    }

    // Preparar dados para Google Calendar
    const lembretesMinutos = Array.from(
      new Set(
        (((evento as typeof evento & { lembretesMinutos?: number[] }).lembretesMinutos
          ?.length
          ? (evento as typeof evento & { lembretesMinutos?: number[] }).lembretesMinutos
          : evento.lembreteMinutos && evento.lembreteMinutos > 0
            ? [evento.lembreteMinutos]
            : []) as number[])
          .map((value) => Number(value))
          .filter((value) => Number.isFinite(value) && value > 0),
      ),
    ).sort((a, b) => b - a);

    const googleEvent: GoogleCalendarEvent = {
      summary: evento.titulo,
      description:
        evento.isOnline && evento.linkAcesso
          ? [evento.descricao || undefined, `Link do evento online: ${evento.linkAcesso}`]
              .filter(Boolean)
              .join("\n\n")
          : evento.descricao || undefined,
      start: {
        dateTime: evento.dataInicio.toISOString(),
        timeZone: "America/Sao_Paulo",
      },
      end: {
        dateTime: evento.dataFim.toISOString(),
        timeZone: "America/Sao_Paulo",
      },
      location: evento.local || undefined,
      attendees: evento.participantes.map((email) => ({ email })),
      reminders: {
        useDefault: false,
        overrides: lembretesMinutos.length > 0
          ? lembretesMinutos.flatMap((minutes) => [
              {
                method: "email" as const,
                minutes,
              },
              {
                method: "popup" as const,
                minutes,
              },
            ])
          : [
              {
                method: "email" as const,
                minutes: 60,
              },
            ],
      },
    };

    // Adicionar informações do processo/cliente na descrição se disponível
    if (evento.processo || evento.cliente) {
      const additionalInfo = [];

      if (evento.processo) {
        additionalInfo.push(
          `Processo: ${evento.processo.numero} - ${evento.processo.titulo}`,
        );
      }
      if (evento.cliente) {
        additionalInfo.push(`Cliente: ${evento.cliente.nome}`);
      }

      if (googleEvent.description) {
        googleEvent.description += `\n\n${additionalInfo.join("\n")}`;
      } else {
        googleEvent.description = additionalInfo.join("\n");
      }
    }

    let googleEventResult: CalendarApiResponse;

    if (evento.googleEventId) {
      // Atualizar evento existente
      googleEventResult = await updateCalendarEvent(
        tokens.access_token,
        tokens.refresh_token,
        evento.googleEventId,
        googleEvent,
        usuario.googleCalendarId || "primary",
      );
    } else {
      // Criar novo evento
      googleEventResult = await createCalendarEvent(
        tokens.access_token,
        tokens.refresh_token,
        googleEvent,
        usuario.googleCalendarId || "primary",
      );
    }

    if (!googleEventResult.success) {
      throw new Error(`Erro na API do Google: ${googleEventResult.error}`);
    }

    // Atualizar evento local com ID do Google
    const updatedEvento = await prisma.evento.update({
      where: { id: eventoId },
      data: {
        googleEventId: googleEventResult.data?.id,
        googleCalendarId: usuario.googleCalendarId,
      },
    });

    logger.info(`Evento ${eventoId} sincronizado com Google Calendar`);

    return { success: true, data: updatedEvento };
  } catch (error) {
    logger.error("Erro ao sincronizar evento com Google Calendar:", error);

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro interno do servidor",
    };
  }
}

// Remover evento do Google Calendar
export async function removeEventoFromGoogle(eventoId: string) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      throw new Error("Usuário não autenticado");
    }

    const tenant = await getCurrentTenant(session.user.id);

    if (!tenant) {
      throw new Error("Tenant não encontrado");
    }

    // Buscar evento
    const evento = await prisma.evento.findFirst({
      where: {
        id: eventoId,
        tenantId: tenant.id,
        googleEventId: { not: null },
      },
    });

    if (!evento || !evento.googleEventId) {
      return { success: true, message: "Evento não está no Google Calendar" };
    }

    // Buscar tokens do usuário
    const usuario = await prisma.usuario.findUnique({
      where: { id: session.user.id },
      select: {
        googleCalendarTokens: true,
        googleCalendarId: true,
      },
    });

    if (!usuario?.googleCalendarTokens) {
      throw new Error("Tokens do Google Calendar não encontrados");
    }

    const tokens = usuario.googleCalendarTokens as unknown as GoogleTokens;

    // Deletar evento do Google Calendar
    const deleteResult = await deleteCalendarEvent(
      tokens.access_token,
      tokens.refresh_token,
      evento.googleEventId,
      usuario.googleCalendarId || "primary",
    );

    if (!deleteResult.success) {
      logger.warn(
        `Erro ao deletar evento do Google Calendar: ${deleteResult.error}`,
      );
      // Continuar mesmo se houver erro no Google - limpar referência local
    }

    // Remover referências do Google do evento local
    await prisma.evento.update({
      where: { id: eventoId },
      data: {
        googleEventId: null,
        googleCalendarId: null,
      },
    });

    logger.info(`Evento ${eventoId} removido do Google Calendar`);

    return { success: true };
  } catch (error) {
    logger.error("Erro ao remover evento do Google Calendar:", error);

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro interno do servidor",
    };
  }
}

// Sincronizar todos os eventos pendentes
export async function syncAllEventosWithGoogle() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      throw new Error("Usuário não autenticado");
    }

    const tenant = await getCurrentTenant(session.user.id);

    if (!tenant) {
      throw new Error("Tenant não encontrado");
    }

    // Buscar usuário e verificar configurações
    const usuario = await prisma.usuario.findUnique({
      where: { id: session.user.id },
      select: {
        googleCalendarConnected: true,
        googleCalendarSyncEnabled: true,
      },
    });

    if (
      !usuario?.googleCalendarConnected ||
      !usuario?.googleCalendarSyncEnabled
    ) {
      throw new Error(
        "Google Calendar não está conectado ou sincronização desabilitada",
      );
    }

    // Determinar quais eventos o usuário pode sincronizar
    let whereClause: any = {
      tenantId: tenant.id,
      googleEventId: null,
      dataInicio: {
        gte: new Date(), // Apenas eventos futuros
      },
    };

    // TODOS os usuários (incluindo admin) devem sincronizar apenas eventos onde são o advogado responsável
    // Buscar o advogado pelo usuarioId
    const advogado = await prisma.advogado.findFirst({
      where: { usuarioId: session.user.id },
      select: { id: true },
    });

    if (advogado) {
      whereClause.advogadoResponsavelId = advogado.id;
    } else {
      // Usuário sem registro na tabela Advogado - não tem eventos para sincronizar
      return {
        success: true,
        data: {
          total: 0,
          sincronizados: 0,
          erros: 0,
        },
      };
    }

    // Buscar eventos que não estão no Google Calendar
    const eventosPendentes = await prisma.evento.findMany({
      where: whereClause,
      orderBy: {
        dataInicio: "asc",
      },
    });

    let sincronizados = 0;
    let erros = 0;

    // Sincronizar cada evento
    for (const evento of eventosPendentes) {
      const result = await syncEventoWithGoogle(evento.id);

      if (result.success) {
        sincronizados++;
      } else {
        erros++;
        logger.warn(`Erro ao sincronizar evento ${evento.id}: ${result.error}`);
      }
    }

    logger.info(
      `Sincronização em lote concluída: ${sincronizados} eventos sincronizados, ${erros} erros`,
    );

    return {
      success: true,
      data: {
        total: eventosPendentes.length,
        sincronizados,
        erros,
      },
    };
  } catch (error) {
    logger.error("Erro na sincronização em lote:", error);

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro interno do servidor",
    };
  }
}

// Buscar status da integração
export async function getGoogleCalendarStatus() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      throw new Error("Usuário não autenticado");
    }

    const usuario = await prisma.usuario.findUnique({
      where: { id: session.user.id },
      select: {
        googleCalendarConnected: true,
        googleCalendarSyncEnabled: true,
        googleCalendarId: true,
      },
    });

    if (!usuario) {
      throw new Error("Usuário não encontrado");
    }

    // Contar eventos sincronizados
    const tenant = await getCurrentTenant(session.user.id);
    let eventosSincronizados = 0;

    if (tenant) {
      eventosSincronizados = await prisma.evento.count({
        where: {
          tenantId: tenant.id,
          googleEventId: { not: null },
        },
      });
    }

    return {
      success: true,
      data: {
        connected: usuario.googleCalendarConnected,
        syncEnabled: usuario.googleCalendarSyncEnabled,
        calendarId: usuario.googleCalendarId,
        eventosSincronizados,
      },
    };
  } catch (error) {
    logger.error("Erro ao buscar status do Google Calendar:", error);

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro interno do servidor",
    };
  }
}

// Buscar eventos do Google Calendar para sincronização reversa
export async function importEventosFromGoogle() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      throw new Error("Usuário não autenticado");
    }

    const tenant = await getCurrentTenant(session.user.id);

    if (!tenant) {
      throw new Error("Tenant não encontrado");
    }

    // Buscar usuário e tokens
    const usuario = await prisma.usuario.findUnique({
      where: { id: session.user.id },
      select: {
        googleCalendarConnected: true,
        googleCalendarTokens: true,
        googleCalendarId: true,
        googleCalendarSyncEnabled: true,
      },
    });

    if (
      !usuario?.googleCalendarConnected ||
      !usuario?.googleCalendarSyncEnabled
    ) {
      throw new Error(
        "Google Calendar não está conectado ou sincronização desabilitada",
      );
    }

    const tokens = usuario.googleCalendarTokens as unknown as GoogleTokens;

    if (!tokens?.access_token) {
      throw new Error("Access token do Google Calendar não encontrado");
    }

    // Verificar se o token expirou
    if (tokens.expiry_date && isTokenExpired(tokens.expiry_date)) {
      if (!tokens.refresh_token) {
        throw new Error(
          "Token expirado e sem refresh token. " +
            "É necessário reautorizar o Google Calendar. " +
            "Desconecte e conecte novamente.",
        );
      }

      // Tentar renovar o token
      const refreshResult = await refreshAccessToken(tokens.refresh_token);

      if (!refreshResult.success) {
        throw new Error(
          "Não foi possível renovar o token. " +
            "É necessário reautorizar o Google Calendar. " +
            "Desconecte e conecte novamente.",
        );
      }

      // Atualizar tokens no banco
      await prisma.usuario.update({
        where: { id: session.user.id },
        data: {
          googleCalendarTokens: refreshResult.tokens as any,
        },
      });

      // Usar os novos tokens
      if (refreshResult.tokens) {
        tokens.access_token = refreshResult.tokens.access_token!;
        tokens.expiry_date = refreshResult.tokens.expiry_date!;
      }
    }

    // Buscar eventos dos próximos 30 dias
    const timeMin = new Date();
    const timeMax = new Date();

    timeMax.setDate(timeMax.getDate() + 30);

    const eventosResult = await listEvents(
      tokens.access_token,
      tokens.refresh_token,
      timeMin.toISOString(),
      timeMax.toISOString(),
      usuario.googleCalendarId || "primary",
    );

    if (!eventosResult.success) {
      throw new Error(
        `Erro ao buscar eventos do Google: ${eventosResult.error}`,
      );
    }

    const eventosGoogle = eventosResult.data || [];
    let importados = 0;
    let erros = 0;

    // Importar eventos que não existem localmente
    for (const eventoGoogle of eventosGoogle) {
      try {
        // Verificar se evento já existe
        const eventoExistente = await prisma.evento.findFirst({
          where: {
            tenantId: tenant.id,
            googleEventId: eventoGoogle.id,
          },
        });

        if (eventoExistente) {
          continue; // Evento já existe, pular
        }

        // Verificar se é um evento criado pelo nosso sistema (não importar)
        if (
          eventoGoogle.description?.includes("Processo:") ||
          eventoGoogle.description?.includes("Cliente:")
        ) {
          continue; // Pular eventos que parecem ser do nosso sistema
        }

        // Criar evento local
        const dataInicio = eventoGoogle.start?.dateTime
          ? new Date(eventoGoogle.start.dateTime)
          : new Date();
        const dataFim = eventoGoogle.end?.dateTime
          ? new Date(eventoGoogle.end.dateTime)
          : new Date(dataInicio.getTime() + 60 * 60 * 1000);

        const participantes =
          eventoGoogle.attendees?.map((a: any) => a.email) || [];

        await prisma.evento.create({
          data: {
            tenantId: tenant.id,
            titulo: eventoGoogle.summary || "Evento do Google Calendar",
            descricao: eventoGoogle.description || undefined,
            tipo: "REUNIAO",
            status: "AGENDADO",
            dataInicio,
            dataFim,
            local: eventoGoogle.location || undefined,
            isOnline: Boolean((eventoGoogle as any).hangoutLink),
            linkAcesso:
              typeof (eventoGoogle as any).hangoutLink === "string"
                ? (eventoGoogle as any).hangoutLink
                : undefined,
            participantes,
            criadoPorId: session.user.id,
            googleEventId: eventoGoogle.id,
            googleCalendarId: usuario.googleCalendarId,
          },
        });

        importados++;
      } catch (error) {
        erros++;
        logger.warn(`Erro ao importar evento ${eventoGoogle.id}:`, error);
      }
    }

    logger.info(
      `Importação do Google Calendar concluída: ${importados} eventos importados, ${erros} erros`,
    );

    revalidatePath("/agenda");

    return {
      success: true,
      data: {
        total: eventosGoogle.length,
        importados,
        erros,
      },
    };
  } catch (error) {
    logger.error("Erro ao importar eventos do Google Calendar:", error);

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro interno do servidor",
    };
  }
}
