import prisma from "@/app/lib/prisma";
import {
  emailService,
  getNotificacaoTemplate,
} from "@/app/lib/email-service";
import { NotificationPolicy } from "@/app/lib/notifications/domain/notification-policy";
import {
  resolveNotificationActionText,
  resolveNotificationUrl,
  resolveTenantBaseUrl,
} from "@/app/lib/notifications/notification-links";
import {
  buildFallbackNotificationTemplate,
  getNotificationTemplate,
  renderNotificationTemplate,
} from "@/app/lib/notifications/notification-rendering";
import {
  getActiveTelegramProvider,
  renderTelegramNotification,
  sendTelegramNotificationToChatId,
} from "@/app/lib/notifications/telegram-bot";

import type { NotificationUrgency } from "@/app/lib/notifications/types";

const DEFAULT_EVENT_TYPE = "evento.reminder_1h";

type PreviewMode = "preview" | "send";
type PreviewChannel = "EMAIL" | "TELEGRAM" | "REALTIME" | "PUSH" | "WHATSAPP";
type ChannelStatus = "ready" | "preview_only" | "unavailable" | "unsupported";

type ManualRecipients = {
  emails?: string[];
  telegramChatIds?: string[];
};

type DeliveryResult = {
  channel: "EMAIL" | "TELEGRAM";
  target: string;
  success: boolean;
  messageId?: string;
  error?: string;
};

type InternalRecipientMatch = {
  id: string;
  email: string | null;
  role: string;
  telegramChatId: string | null;
};

export type EventNotificationPreviewInput = {
  tenantId?: string;
  tenantSlug?: string;
  eventType?: string;
  payload?: Record<string, unknown>;
  recipients?: ManualRecipients;
  mode?: PreviewMode;
  baseUrl?: string;
  testNotice?: string;
};

export type EventNotificationPreviewResult = {
  tenant: {
    id: string;
    name: string;
    slug: string;
  };
  mode: PreviewMode;
  eventType: string;
  urgency: NotificationUrgency;
  payload: Record<string, unknown>;
  rendered: {
    title: string;
    message: string;
    actionUrl?: string;
    actionText?: string;
    channels: {
      EMAIL: {
        subject: string;
        html: string;
        text: string;
      };
      TELEGRAM: {
        text: string;
      };
    };
  };
  channelAssessment: Record<
    PreviewChannel,
    {
      status: ChannelStatus;
      reason: string;
      recipients: string[];
    }
  >;
  deliveries: DeliveryResult[];
};

function dedupeStrings(values: string[] | undefined) {
  return Array.from(
    new Set(
      (values ?? [])
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    ),
  );
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function ensureEventoType(eventType: string) {
  if (!eventType.startsWith("evento.")) {
    throw new Error(
      `O tipo ${eventType} nao pertence ao dominio de eventos da agenda.`,
    );
  }
}

function buildSamplePayload(eventType: string): Record<string, unknown> {
  const baseDate = new Date("2026-06-09T14:30:00.000Z").toISOString();
  const basePayload: Record<string, unknown> = {
    eventoId: "preview-evento-001",
    titulo: "Audiencia de conciliacao",
    dataInicio: baseDate,
    processoId: "processo-preview-001",
    processoNumero: "0002713920265080005",
    clienteNome: "Dayane Costa Assis",
    local: "Forum Civel - 6a vara de familia",
  };

  switch (eventType) {
    case "evento.updated":
      return {
        ...basePayload,
        changesSummary: "Horario alterado para 14:30 e sala atualizada.",
      };
    case "evento.cancelled":
      return {
        ...basePayload,
        motivo: "Cancelamento para redesignacao.",
      };
    case "evento.confirmation_updated":
      return {
        ...basePayload,
        confirmacaoStatus: "CONFIRMADO",
      };
    case "evento.reminder_1d":
      return {
        ...basePayload,
        reminderMinutes: 24 * 60,
        reminderLabel: "1 dia",
      };
    case "evento.reminder_custom":
      return {
        ...basePayload,
        reminderMinutes: 90,
        reminderLabel: "1 hora e 30 minutos",
      };
    case "evento.reminder_1h":
      return {
        ...basePayload,
        reminderMinutes: 60,
        reminderLabel: "1 hora",
      };
    default:
      return basePayload;
  }
}

function normalizeBaseUrl(baseUrl: string | undefined) {
  const normalized = baseUrl?.trim();

  if (!normalized) {
    return undefined;
  }

  if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
    return normalized;
  }

  return `https://${normalized}`;
}

function applyTestNotice(params: {
  title: string;
  message: string;
  testNotice?: string;
}) {
  const notice = params.testNotice?.trim();

  if (!notice) {
    return {
      title: params.title,
      message: params.message,
    };
  }

  return {
    title: `[TESTE INTERNO] ${params.title}`,
    message: `${notice}\n\n${params.message}`,
  };
}

async function resolveTenant(params: {
  tenantId?: string;
  tenantSlug?: string;
}) {
  const tenantId = params.tenantId?.trim();
  const tenantSlug = params.tenantSlug?.trim() || "dayane-assis-advocacia";

  const tenant = await prisma.tenant.findFirst({
    where: tenantId ? { id: tenantId } : { slug: tenantSlug },
    select: {
      id: true,
      name: true,
      slug: true,
      domain: true,
      branding: {
        select: {
          customDomainText: true,
          logoUrl: true,
          primaryColor: true,
          secondaryColor: true,
          accentColor: true,
        },
      },
    },
  });

  if (!tenant) {
    throw new Error("Tenant informado nao foi encontrado.");
  }

  return tenant;
}

async function resolveInternalRecipientMatches(
  tenantId: string,
  recipients: Required<ManualRecipients>,
): Promise<InternalRecipientMatch[]> {
  if (
    recipients.emails.length === 0 &&
    recipients.telegramChatIds.length === 0
  ) {
    return [];
  }

  return prisma.usuario.findMany({
    where: {
      tenantId,
      OR: [
        ...(recipients.emails.length > 0
          ? [{ email: { in: recipients.emails } }]
          : []),
        ...(recipients.telegramChatIds.length > 0
          ? [{ telegramChatId: { in: recipients.telegramChatIds } }]
          : []),
      ],
    },
    select: {
      id: true,
      email: true,
      role: true,
      telegramChatId: true,
    },
  });
}

function validateEventPayload(
  eventType: string,
  payload: Record<string, unknown>,
) {
  const requiredFields = NotificationPolicy.getRequiredFields(eventType);
  const missingFields = requiredFields.filter((field) => {
    const value = payload[field];
    return value === undefined || value === null || value === "";
  });

  if (missingFields.length > 0) {
    throw new Error(
      `Payload invalido para ${eventType}. Campos faltando: ${missingFields.join(", ")}.`,
    );
  }
}

export class EventNotificationPreviewService {
  static getDefaultEventType() {
    return DEFAULT_EVENT_TYPE;
  }

  static createSamplePayload(eventType = DEFAULT_EVENT_TYPE) {
    ensureEventoType(eventType);
    return buildSamplePayload(eventType);
  }

  static async execute(
    input: EventNotificationPreviewInput,
  ): Promise<EventNotificationPreviewResult> {
    const mode = input.mode ?? "preview";
    const eventType = (input.eventType?.trim() || DEFAULT_EVENT_TYPE).trim();

    ensureEventoType(eventType);

    const tenant = await resolveTenant(input);
    const payload = {
      ...buildSamplePayload(eventType),
      ...(input.payload ?? {}),
    };

    validateEventPayload(eventType, payload);

    const emails = dedupeStrings(input.recipients?.emails).map((email) =>
      email.toLowerCase(),
    );
    const telegramChatIds = dedupeStrings(input.recipients?.telegramChatIds);

    const invalidEmails = emails.filter((email) => !isValidEmail(email));
    if (invalidEmails.length > 0) {
      throw new Error(`Emails invalidos: ${invalidEmails.join(", ")}.`);
    }

    if (mode === "send" && emails.length === 0 && telegramChatIds.length === 0) {
      throw new Error(
        "Informe ao menos um email ou chatId do Telegram para o envio manual.",
      );
    }

    const internalRecipients = await resolveInternalRecipientMatches(tenant.id, {
      emails,
      telegramChatIds,
    });
    const matchedClientTargets = internalRecipients
      .filter((user) => user.role === "CLIENTE")
      .flatMap((user) =>
        [user.email, user.telegramChatId].filter(
          (value): value is string => Boolean(value),
        ),
      );

    if (matchedClientTargets.length > 0) {
      throw new Error(
        `Nao e permitido disparar testes para clientes: ${matchedClientTargets.join(", ")}.`,
      );
    }

    const urgency = NotificationPolicy.getDefaultUrgency(
      eventType,
    ) as NotificationUrgency;
    const template =
      (await getNotificationTemplate(tenant.id, eventType)) ??
      buildFallbackNotificationTemplate(eventType, payload);
    const renderedBase = renderNotificationTemplate(template, payload);
    const rendered = applyTestNotice({
      title: renderedBase.title,
      message: renderedBase.message,
      testNotice: input.testNotice,
    });
    const tenantBaseUrl =
      normalizeBaseUrl(input.baseUrl) ?? resolveTenantBaseUrl(tenant);
    const actionUrl = resolveNotificationUrl(eventType, payload, tenantBaseUrl);
    const actionText = resolveNotificationActionText(eventType, payload);
    const telegramPreview = await renderTelegramNotification({
      tenantId: tenant.id,
      title: rendered.title,
      message: rendered.message,
      type: eventType,
      urgency,
      payload,
      actionUrl,
      actionText,
    });
    const emailPreview = getNotificacaoTemplate({
      nome: "Operador interno",
      email: emails[0] || "preview@magiclawyer.local",
      tipo: eventType,
      titulo: rendered.title,
      mensagem: rendered.message,
      linkAcao: actionUrl,
      textoAcao: actionText,
      tenantName: tenant.name,
      branding: {
        logoUrl: tenant.branding?.logoUrl,
        primaryColor: tenant.branding?.primaryColor,
        secondaryColor: tenant.branding?.secondaryColor,
        accentColor: tenant.branding?.accentColor,
      },
    });

    const [emailCredential, telegramProvider, pushSubscriptionCount] =
      await Promise.all([
        prisma.tenantEmailCredential.findFirst({
          where: {
            tenantId: tenant.id,
            deletedAt: null,
          },
          select: { id: true },
        }),
        getActiveTelegramProvider(tenant.id),
        internalRecipients.length > 0
          ? prisma.webPushSubscription.count({
              where: {
                tenantId: tenant.id,
                userId: {
                  in: internalRecipients.map((user) => user.id),
                },
                active: true,
              },
            })
          : Promise.resolve(0),
      ]);

    const channelAssessment: EventNotificationPreviewResult["channelAssessment"] =
      {
        EMAIL: {
          status:
            emails.length === 0
              ? "unavailable"
              : emailCredential
                ? "ready"
                : "unavailable",
          reason:
            emails.length === 0
              ? "Nenhum email manual informado."
              : emailCredential
                ? "Credencial de email ativa e pronta para envio."
                : "Tenant sem credencial de email pronta para envio.",
          recipients: emails,
        },
        TELEGRAM: {
          status:
            telegramChatIds.length === 0
              ? "unavailable"
              : telegramProvider
                ? "ready"
                : "unavailable",
          reason:
            telegramChatIds.length === 0
              ? "Nenhum chatId manual informado."
              : telegramProvider
                ? "Bot do Telegram pronto para envio manual."
                : "Nenhum bot do Telegram ativo para este tenant.",
          recipients: telegramChatIds,
        },
        REALTIME: {
          status: "preview_only",
          reason:
            "Canal in-app apenas informativo nesta ferramenta; depende do usuario logado na plataforma.",
          recipients: [],
        },
        PUSH: {
          status: pushSubscriptionCount > 0 ? "preview_only" : "unavailable",
          reason:
            pushSubscriptionCount > 0
              ? `${pushSubscriptionCount} subscription(s) ativa(s) encontrada(s) para destinatarios internos correspondentes.`
              : "Nenhuma subscription ativa de Web Push encontrada para os destinatarios internos correspondentes.",
          recipients: [],
        },
        WHATSAPP: {
          status: "unsupported",
          reason:
            "WhatsApp nao e canal operacional do motor atual de notificacoes de eventos.",
          recipients: [],
        },
      };

    const deliveries: DeliveryResult[] = [];

    if (mode === "send") {
      for (const email of emails) {
        const result = await emailService.sendNotificacaoAdvogado(tenant.id, {
          nome: email,
          email,
          tipo: eventType,
          titulo: rendered.title,
          mensagem: rendered.message,
          linkAcao: actionUrl,
          textoAcao: actionText,
          skipOperationalLog: true,
        });

        deliveries.push({
          channel: "EMAIL",
          target: email,
          success: result.success,
          messageId: result.messageId,
          error: result.error,
        });
      }

      for (const chatId of telegramChatIds) {
        const result = await sendTelegramNotificationToChatId({
          tenantId: tenant.id,
          chatId,
          title: rendered.title,
          message: rendered.message,
          type: eventType,
          urgency,
          payload,
          actionUrl,
          actionText,
        });

        deliveries.push({
          channel: "TELEGRAM",
          target: chatId,
          success: result.success,
          messageId: result.messageId,
          error: result.error,
        });
      }
    }

    return {
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
      },
      mode,
      eventType,
      urgency,
      payload,
      rendered: {
        title: rendered.title,
        message: rendered.message,
        actionUrl,
        actionText,
        channels: {
          EMAIL: {
            subject: emailPreview.subject,
            html: emailPreview.html,
            text: emailPreview.text,
          },
          TELEGRAM: {
            text: telegramPreview.text,
          },
        },
      },
      channelAssessment,
      deliveries,
    };
  }
}
