import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";

import logger from "@/lib/logger";

// Configuração do OAuth2 para Google Calendar
export const createOAuth2Client = () => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Variáveis de ambiente do Google Calendar não configuradas. " +
        "Verifique se GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e GOOGLE_REDIRECT_URI estão definidas no arquivo .env.local",
    );
  }

  return new OAuth2Client(clientId, clientSecret, redirectUri);
};

// Interface para dados do evento
export interface GoogleCalendarEvent {
  id?: string;
  summary: string;
  description?: string;
  start: {
    dateTime: string;
    timeZone: string;
  };
  end: {
    dateTime: string;
    timeZone: string;
  };
  location?: string;
  attendees?: Array<{
    email: string;
    displayName?: string;
  }>;
  reminders?: {
    useDefault: boolean;
    overrides?: Array<{
      method: "email" | "popup";
      minutes: number;
    }>;
  };
}

// Interface para resposta da API
export interface CalendarApiResponse {
  success: boolean;
  data?: any;
  error?: string;
}

// Função para obter URL de autorização
export const getAuthUrl = (userId: string, currentDomain?: string) => {
  const oauth2Client = createOAuth2Client();

  const scopes = [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/calendar.events",
  ];

  // Determinar o domínio base para OAuth
  // Em desenvolvimento, sempre usar localhost:9192 para simplicidade
  // Em produção, sempre usar o domínio principal para OAuth
  const oauthDomain =
    process.env.NODE_ENV === "production"
      ? "https://magiclawyer.vercel.app"
      : "http://localhost:9192";

  const state = `${userId}|${currentDomain || ""}`;

  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: scopes,
    state: state,
    redirect_uri: `${oauthDomain}/api/google-calendar/callback`,
  });
};

// Função para trocar código por tokens
export const getTokensFromCode = async (code: string) => {
  try {
    const oauth2Client = createOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);

    oauth2Client.setCredentials(tokens);

    return { success: true, tokens };
  } catch (error) {
    logger.error("Erro ao obter tokens:", error);

    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro desconhecido",
    };
  }
};

// Função para renovar tokens automaticamente
export const refreshAccessToken = async (refreshToken: string) => {
  try {
    const oauth2Client = createOAuth2Client();

    oauth2Client.setCredentials({
      refresh_token: refreshToken,
    });

    const { credentials } = await oauth2Client.refreshAccessToken();

    return {
      success: true,
      tokens: credentials,
    };
  } catch (error) {
    logger.error("Erro ao renovar token:", error);

    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro desconhecido",
    };
  }
};

// Função para verificar se o token está expirado
export const isTokenExpired = (expiryDate: number): boolean => {
  const now = new Date().getTime();

  return now >= expiryDate;
};

// Função para criar evento no Google Calendar
export const createCalendarEvent = async (
  accessToken: string,
  refreshToken: string,
  event: GoogleCalendarEvent,
  calendarId: string = "primary",
): Promise<CalendarApiResponse> => {
  try {
    const oauth2Client = createOAuth2Client();

    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    const calendar = google.calendar({ version: "v3", auth: oauth2Client });

    const response = await calendar.events.insert({
      calendarId,
      requestBody: event,
    });

    return {
      success: true,
      data: response.data,
    };
  } catch (error) {
    logger.error("Erro ao criar evento no Google Calendar:", error);

    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro desconhecido",
    };
  }
};

// Função para atualizar evento no Google Calendar
export const updateCalendarEvent = async (
  accessToken: string,
  refreshToken: string,
  eventId: string,
  event: Partial<GoogleCalendarEvent>,
  calendarId: string = "primary",
): Promise<CalendarApiResponse> => {
  try {
    const oauth2Client = createOAuth2Client();

    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    const calendar = google.calendar({ version: "v3", auth: oauth2Client });

    const response = await calendar.events.update({
      calendarId,
      eventId,
      requestBody: event,
    });

    return {
      success: true,
      data: response.data,
    };
  } catch (error) {
    logger.error("Erro ao atualizar evento no Google Calendar:", error);

    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro desconhecido",
    };
  }
};

// Função para deletar evento no Google Calendar
export const deleteCalendarEvent = async (
  accessToken: string,
  refreshToken: string,
  eventId: string,
  calendarId: string = "primary",
): Promise<CalendarApiResponse> => {
  try {
    const oauth2Client = createOAuth2Client();

    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    const calendar = google.calendar({ version: "v3", auth: oauth2Client });

    await calendar.events.delete({
      calendarId,
      eventId,
    });

    return {
      success: true,
    };
  } catch (error) {
    logger.error("Erro ao deletar evento no Google Calendar:", error);

    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro desconhecido",
    };
  }
};

// Função para listar calendários do usuário
export const listCalendars = async (
  accessToken: string,
  refreshToken: string,
): Promise<CalendarApiResponse> => {
  try {
    const oauth2Client = createOAuth2Client();

    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    const calendar = google.calendar({ version: "v3", auth: oauth2Client });

    const response = await calendar.calendarList.list();

    return {
      success: true,
      data: response.data.items,
    };
  } catch (error) {
    logger.error("Erro ao listar calendários:", error);

    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro desconhecido",
    };
  }
};

// Função para listar eventos de um período
export const listEvents = async (
  accessToken: string,
  refreshToken: string,
  timeMin: string,
  timeMax: string,
  calendarId: string = "primary",
): Promise<CalendarApiResponse> => {
  try {
    const oauth2Client = createOAuth2Client();

    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    const calendar = google.calendar({ version: "v3", auth: oauth2Client });

    const response = await calendar.events.list({
      calendarId,
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: "startTime",
    });

    return {
      success: true,
      data: response.data.items,
    };
  } catch (error) {
    logger.error("Erro ao listar eventos:", error);

    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro desconhecido",
    };
  }
};

// Função para sincronizar eventos locais com Google Calendar
export const syncEventWithGoogle = async (
localEvent: {
    id: string;
    titulo: string;
    descricao?: string;
    dataInicio: Date;
    dataFim: Date;
    local?: string;
    isOnline?: boolean;
    linkAcesso?: string;
    participantes: string[];
    lembreteMinutos?: number;
    lembretesMinutos?: number[];
  },
  googleTokens: {
    accessToken: string;
    refreshToken: string;
  },
  googleEventId?: string,
  calendarId: string = "primary",
): Promise<CalendarApiResponse> => {
  const lembretesMinutos = Array.from(
    new Set(
      ((localEvent.lembretesMinutos?.length
        ? localEvent.lembretesMinutos
        : localEvent.lembreteMinutos && localEvent.lembreteMinutos > 0
          ? [localEvent.lembreteMinutos]
          : []) as number[])
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0),
    ),
  ).sort((a, b) => b - a);

  const googleEvent: GoogleCalendarEvent = {
    summary: localEvent.titulo,
    description:
      localEvent.isOnline && localEvent.linkAcesso
        ? [localEvent.descricao, `Link do evento online: ${localEvent.linkAcesso}`]
            .filter(Boolean)
            .join("\n\n")
        : localEvent.descricao,
    start: {
      dateTime: localEvent.dataInicio.toISOString(),
      timeZone: "America/Sao_Paulo",
    },
    end: {
      dateTime: localEvent.dataFim.toISOString(),
      timeZone: "America/Sao_Paulo",
    },
    location: localEvent.local,
    attendees: localEvent.participantes.map((email) => ({ email })),
    reminders: {
      useDefault: false,
      overrides: lembretesMinutos.length > 0
        ? lembretesMinutos.flatMap((minutes) => [
            {
              method: "email",
              minutes,
            },
            {
              method: "popup",
              minutes,
            },
          ])
        : undefined,
    },
  };

  if (googleEventId) {
    // Atualizar evento existente
    return updateCalendarEvent(
      googleTokens.accessToken,
      googleTokens.refreshToken,
      googleEventId,
      googleEvent,
      calendarId,
    );
  } else {
    // Criar novo evento
    return createCalendarEvent(
      googleTokens.accessToken,
      googleTokens.refreshToken,
      googleEvent,
      calendarId,
    );
  }
};
