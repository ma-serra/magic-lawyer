import type { NotificationJobData } from "./notification-job";

import crypto from "crypto";
import { start } from "workflow/api";

import { EmailChannel } from "./channels/email-channel";
import { NotificationFactory } from "./domain/notification-factory";
import { NotificationPolicy } from "./domain/notification-policy";
import {
  estimateNotificationDeliveryCost,
  sortNotificationChannels,
  summarizeNotificationPayload,
} from "./notification-audit";
import { getRedisInstance } from "./redis-singleton";
import {
  getActiveTelegramProvider,
  getTelegramUserBinding,
  sendTelegramNotification,
} from "./telegram-bot";
import {
  getActiveWebPushSubscriptions,
  isWebPushConfigured,
  sendWebPushNotification,
} from "./web-push";

import type { Prisma } from "@/generated/prisma";
import prisma from "@/app/lib/prisma";
import { publishRealtimeEvent } from "@/app/lib/realtime/publisher";

export type NotificationUrgency = "CRITICAL" | "HIGH" | "MEDIUM" | "INFO";
export type NotificationChannel = "REALTIME" | "EMAIL" | "TELEGRAM" | "PUSH";

export interface NotificationEvent {
  type: string;
  tenantId: string;
  userId: string;
  payload: Record<string, any>;
  urgency?: NotificationUrgency;
  channels?: NotificationChannel[];
}

export interface NotificationTemplate {
  title: string;
  message: string;
  variables?: Record<string, any>;
}

type DispatchAuditDecision = "CREATED" | "SUPPRESSED" | "FAILED";
type DeliveryCostSource = "EXACT" | "ESTIMATED";
type ChannelPlanStatus = "ATTEMPT" | "SKIP";

type ChannelPlanEntry = {
  channel: NotificationChannel;
  provider: string;
  status: ChannelPlanStatus;
  requested: boolean;
  reasonCode?: string;
  reasonMessage?: string;
  recipientTarget?: string | null;
  recipientSnapshot?: Record<string, any> | null;
};

type ChannelResolutionResult = {
  requestedChannels: NotificationChannel[];
  resolvedChannels: NotificationChannel[];
  channelPlans: ChannelPlanEntry[];
};

type DeliveryExecutionResult = {
  success: boolean;
  status?: "SENT" | "DELIVERED" | "READ";
  messageId?: string;
  error?: string;
  metadata?: Record<string, any>;
  reasonCode?: string;
  reasonMessage?: string;
  recipientTarget?: string | null;
  recipientSnapshot?: Record<string, any> | null;
  providerStatus?: string;
  providerResponseCode?: string;
  costAmount?: number;
  costCurrency?: string;
  costSource?: DeliveryCostSource;
  sentAt?: Date;
  deliveredAt?: Date;
  readAt?: Date;
};

function asPrismaJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  return value as Prisma.InputJsonValue;
}

/**
 * Serviço principal de notificações
 */

export class NotificationService {
  /**
   * Publica uma notificação para um usuário (assíncrono via fila)
   * Usa NotificationFactory para criar e validar o evento
   */
  static async publishNotification(event: NotificationEvent): Promise<void> {
    try {
      // Usar Factory para criar/validar evento (aplica validações e sanitizações)
      const validatedEvent = NotificationFactory.createEvent(
        event.type,
        event.tenantId,
        event.userId,
        event.payload,
        {
          urgency: event.urgency,
          channels: event.channels,
        },
      );

      // Deduplicação simples: chave única por (tenantId, userId, type, payloadHash) com TTL de 5 minutos
      const redis = getRedisInstance();

      const payloadHash = crypto
        .createHash("sha256")
        .update(JSON.stringify(validatedEvent.payload))
        .digest("hex");
      const dedupKey = `notif:d:${validatedEvent.tenantId}:${validatedEvent.userId}:${validatedEvent.type}:${payloadHash}`;

      // SET NX PX=300000 => só seta se não existir (evita duplicatas)
      const setResult = await redis.set(
        dedupKey,
        "1",
        "PX",
        5 * 60 * 1000,
        "NX",
      );

      if (setResult !== "OK") {
        console.log(
          `[NotificationService] 🔁 Evento duplicado ignorado (${validatedEvent.type}) para usuário ${validatedEvent.userId}`,
        );

        return;
      }

      const jobPayload: NotificationJobData = {
        type: validatedEvent.type,
        tenantId: validatedEvent.tenantId,
        userId: validatedEvent.userId,
        payload: validatedEvent.payload,
        urgency: validatedEvent.urgency || "MEDIUM",
        channels: validatedEvent.channels || ["REALTIME"],
      };

      try {
        const { notificationProcessingWorkflow } = await import(
          "@/workflows/notification-processing"
        );

        await start(notificationProcessingWorkflow, [jobPayload]);
      } catch (workflowError) {
        console.error(
          "[NotificationService] Falha ao iniciar Workflow de notificação, processando de forma síncrona:",
          workflowError,
        );
        await this.processNotificationSync(jobPayload);
      }
    } catch (error) {
      console.error(
        `[NotificationService] Erro ao adicionar job à fila:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Processa notificação de forma síncrona (usado pelo worker)
   */
  static async processNotificationSync(
    event: NotificationEvent,
  ): Promise<void> {
    let requestedChannels: NotificationChannel[] = [];
    let resolvedChannels: NotificationChannel[] = [];
    let dispatchRecorded = false;

    try {
      console.log(
        `[NotificationService] Processando notificacao ${event.type} para usuario ${event.userId}`,
      );

      const hasPermission = await this.checkUserPermission(event);

      if (!hasPermission) {
        await this.recordDispatchAudit({
          event,
          decision: "SUPPRESSED",
          requestedChannels: event.channels ?? [],
          resolvedChannels: [],
          reasonCode: "NO_PERMISSION",
          reasonMessage:
            "O usuario nao esta ativo ou nao pertence ao tenant deste evento.",
        });
        return;
      }

      const preferences = await this.getUserPreferences(
        event.tenantId,
        event.userId,
        event.type,
      );
      const canDisable = NotificationPolicy.canDisableEvent(event.type);

      if (!preferences.enabled && canDisable) {
        await this.recordDispatchAudit({
          event,
          decision: "SUPPRESSED",
          requestedChannels: preferences.channels,
          resolvedChannels: [],
          reasonCode: "EVENT_DISABLED_BY_PREFERENCE",
          reasonMessage:
            "O usuario desabilitou este tipo de evento nas preferencias de notificacao.",
        });
        return;
      }

      if (!preferences.enabled && !canDisable) {
        preferences.enabled = true;
      }

      const template =
        (await this.generateTemplate(event)) ??
        this.buildFallbackTemplate(event);
      const { title, message } = this.replaceVariables(template, event.payload);
      const resolution = await this.resolveChannelsForDelivery({
        event,
        preferenceChannels: preferences.channels,
        urgency: event.urgency || preferences.urgency,
      });

      requestedChannels = resolution.requestedChannels;
      resolvedChannels = resolution.resolvedChannels;

      if (resolvedChannels.length === 0) {
        await this.recordDispatchAudit({
          event,
          decision: "SUPPRESSED",
          requestedChannels,
          resolvedChannels,
          reasonCode: "NO_CHANNELS_RESOLVED",
          reasonMessage:
            "A notificacao nao encontrou nenhum canal apto apos validar preferencia, provider e vinculos do destinatario.",
        });
        return;
      }

      const notification = await prisma.notification.create({
        data: {
          tenantId: event.tenantId,
          userId: event.userId,
          type: event.type,
          title,
          message,
          payload: event.payload,
          urgency: event.urgency || preferences.urgency,
          channels: resolvedChannels,
          expiresAt: this.calculateExpiration(
            event.urgency || preferences.urgency,
          ),
        },
      });

      await this.recordDispatchAudit({
        event,
        decision: "CREATED",
        notificationId: notification.id,
        requestedChannels,
        resolvedChannels,
      });
      dispatchRecorded = true;

      await this.deliverNotification(notification, resolution.channelPlans);

      console.log(
        `[NotificationService] Notificacao ${notification.id} processada para usuario ${event.userId}`,
      );
    } catch (error) {
      if (!dispatchRecorded) {
        await this.recordDispatchAudit({
          event,
          decision: "FAILED",
          requestedChannels,
          resolvedChannels,
          reasonCode: "PROCESSING_FAILED",
          reasonMessage:
            error instanceof Error
              ? error.message
              : "Falha desconhecida ao processar a notificacao.",
        });
      }

      console.error("[NotificationService] Erro ao processar notificacao:", error);
      throw error;
    }
  }
  /**
   * Publica notificação para múltiplos usuários
   */
  static async publishToMultipleUsers(
    eventType: string,
    tenantId: string,
    userIds: string[],
    payload: Record<string, any>,
    urgency: NotificationUrgency = "MEDIUM",
  ): Promise<void> {
    const promises = userIds.map((userId) =>
      this.publishNotification({
        type: eventType,
        tenantId,
        userId,
        payload,
        urgency,
      }),
    );

    await Promise.allSettled(promises);
  }

  /**
   * Publica notificação para todos os usuários de um tenant com um role específico
   */
  static async publishToRole(
    eventType: string,
    tenantId: string,
    role: string,
    payload: Record<string, any>,
    urgency: NotificationUrgency = "MEDIUM",
  ): Promise<void> {
    const users = await prisma.usuario.findMany({
      where: {
        tenantId,
        role: role as any,
        active: true,
      },
      select: { id: true },
    });

    const userIds = users.map((user) => user.id);

    await this.publishToMultipleUsers(
      eventType,
      tenantId,
      userIds,
      payload,
      urgency,
    );
  }

  /**
   * Verifica se o usuário tem permissão para receber a notificação
   */
  private static async checkUserPermission(
    event: NotificationEvent,
  ): Promise<boolean> {
    // Verificar se o usuário existe e está ativo
    const user = await prisma.usuario.findFirst({
      where: {
        id: event.userId,
        tenantId: event.tenantId,
        active: true,
      },
    });

    return !!user;
  }

  /**
   * Obtém as preferências do usuário para um tipo de evento
   */
  private static async getUserPreferences(
    tenantId: string,
    userId: string,
    eventType: string,
  ): Promise<{
    enabled: boolean;
    channels: NotificationChannel[];
    urgency: NotificationUrgency;
  }> {
    // Buscar preferência específica
    const preference = await prisma.notificationPreference.findUnique({
      where: {
        tenantId_userId_eventType: {
          tenantId,
          userId,
          eventType,
        },
      },
    });

    if (preference) {
      return {
        enabled: preference.enabled,
        channels: preference.channels as NotificationChannel[],
        urgency: preference.urgency as NotificationUrgency,
      };
    }

    // Tentar buscar preferências wildcard (ex: processo.*) ou default
    const wildcardCandidates = this.buildWildcardEventTypes(eventType);

    if (wildcardCandidates.length > 0) {
      const wildcardPreferences = await prisma.notificationPreference.findMany({
        where: {
          tenantId,
          userId,
          eventType: { in: wildcardCandidates },
        },
      });

      const matchedPreference = this.selectPreferenceFromCandidates(
        wildcardCandidates,
        wildcardPreferences.map((pref) => ({
          eventType: pref.eventType,
          enabled: pref.enabled,
          channels: pref.channels as NotificationChannel[],
          urgency: pref.urgency as NotificationUrgency,
        })),
      );

      if (matchedPreference) {
        return matchedPreference;
      }
    }

    // Usar preferências padrão baseadas no role
    const user = await prisma.usuario.findFirst({
      where: { id: userId, tenantId },
      select: { role: true },
    });

    return this.resolvePreferenceFromRoleDefaults(
      this.getDefaultPreferencesByRole(user?.role || "SECRETARIA"),
      eventType,
      wildcardCandidates,
    );
  }

  /**
   * Gera template para a notificação
   */
  private static async generateTemplate(
    event: NotificationEvent,
  ): Promise<NotificationTemplate | null> {
    // Buscar template específico do tenant
    const template = await prisma.notificationTemplate.findUnique({
      where: {
        tenantId_eventType: {
          tenantId: event.tenantId,
          eventType: event.type,
        },
      },
    });

    if (template) {
      return {
        title: template.title,
        message: template.message,
        variables: template.variables as Record<string, any>,
      };
    }

    // Usar template padrão
    const defaultTemplates = this.getDefaultTemplates();

    return defaultTemplates[event.type] || null;
  }

  /**
   * Substitui variáveis no template
   */
  private static replaceVariables(
    template: NotificationTemplate,
    payload: Record<string, any>,
  ): { title: string; message: string } {
    let title = template.title;
    let message = template.message;
    const normalizedPayload: Record<string, any> = { ...payload };

    const aliasMap: Array<[string, string[]]> = [
      ["cliente", ["clienteNome", "cliente"]],
      ["clienteNome", ["clienteNome", "cliente"]],
      ["advogado", ["advogadoNome", "advogado"]],
      ["advogadoNome", ["advogadoNome", "advogado"]],
      ["processoNumero", ["processoNumero", "numero"]],
      ["numero", ["numero", "processoNumero"]],
    ];

    for (const [target, sources] of aliasMap) {
      if (
        normalizedPayload[target] !== undefined &&
        normalizedPayload[target] !== null &&
        String(normalizedPayload[target]).trim().length > 0
      ) {
        continue;
      }

      const sourceKey = sources.find((key) => {
        const value = normalizedPayload[key];
        return value !== undefined && value !== null && String(value).trim().length > 0;
      });

      if (sourceKey) {
        normalizedPayload[target] = normalizedPayload[sourceKey];
      }
    }

    // Substituir variáveis no formato {variavel}
    Object.entries(normalizedPayload).forEach(([key, value]) => {
      const regex = new RegExp(`{${key}}`, "g");

      title = title.replace(regex, String(value));
      message = message.replace(regex, String(value));
    });

    title = title.replace(/\{[^}]+\}/g, "informação não disponível");
    message = message.replace(/\{[^}]+\}/g, "informação não disponível");

    return { title, message };
  }

  /**
   * Template genérico quando não existir um específico para o evento
   */
  private static buildFallbackTemplate(
    event: NotificationEvent,
  ): NotificationTemplate {
    const prettyType = event.type
      .split(".")
      .map((segment) => segment.replace(/_/g, " "))
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join(" - ");

    const defaultTitle =
      (event.payload.title as string | undefined) ||
      (event.payload.titulo as string | undefined) ||
      `Atualização: ${prettyType}`;

    const defaultMessage =
      (event.payload.message as string | undefined) ||
      (event.payload.mensagem as string | undefined) ||
      `Você recebeu uma nova atualização (${prettyType}).`;

    return {
      title: defaultTitle,
      message: defaultMessage,
    };
  }

  /**
   * Calcula data de expiração baseada na urgência
   */
  private static calculateExpiration(urgency: NotificationUrgency): Date {
    const now = new Date();
    const days = {
      CRITICAL: 30,
      HIGH: 30,
      MEDIUM: 30,
      INFO: 30,
    };

    return new Date(now.getTime() + days[urgency] * 24 * 60 * 60 * 1000);
  }

  /**
   * Entrega a notificação pelos canais configurados
   */
  private static async recordDispatchAudit(params: {
    event: NotificationEvent;
    decision: DispatchAuditDecision;
    requestedChannels: NotificationChannel[];
    resolvedChannels: NotificationChannel[];
    notificationId?: string;
    reasonCode?: string;
    reasonMessage?: string;
  }) {
    await prisma.notificationDispatchAudit.create({
      data: {
        tenantId: params.event.tenantId,
        userId: params.event.userId,
        notificationId: params.notificationId,
        eventType: params.event.type,
        urgency: params.event.urgency || "MEDIUM",
        payloadSummary: asPrismaJson(
          summarizeNotificationPayload(params.event.payload),
        ),
        requestedChannels: sortNotificationChannels(params.requestedChannels),
        resolvedChannels: sortNotificationChannels(params.resolvedChannels),
        decision: params.decision,
        reasonCode: params.reasonCode,
        reasonMessage: params.reasonMessage?.slice(0, 500),
      },
    });
  }

  private static async deliverNotification(
    notification: any,
    channelPlans: ChannelPlanEntry[],
  ): Promise<void> {
    const channels = channelPlans.map((channelPlan) => channelPlan.channel);

    console.log(
      `[NotificationService] 📱 Processando canais: ${channels.join(",")}`,
    );

    await Promise.allSettled(
      channelPlans.map((channelPlan) =>
        this.processChannelDelivery(notification, channelPlan),
      ),
    );
  }

  private static getProviderForChannel(channel: NotificationChannel): string {
    switch (channel) {
      case "EMAIL":
        return "RESEND";
      case "TELEGRAM":
        return "TELEGRAM_BOT";
      case "PUSH":
        return "WEB_PUSH_VAPID";
      case "REALTIME":
      default:
        return "ABLY";
    }
  }

  private static async processChannelDelivery(
    notification: any,
    channelPlan: ChannelPlanEntry,
  ): Promise<void> {
    const channel = channelPlan.channel;
    const provider = channelPlan.provider;
    console.log(`[NotificationService] 🔄 Processando canal: ${channel}`);

    const delivery = await prisma.notificationDelivery.create({
      data: {
        notificationId: notification.id,
        channel,
        provider,
        status: channelPlan.status === "SKIP" ? "SKIPPED" : "PENDING",
        recipientTarget: channelPlan.recipientTarget,
        recipientSnapshot: asPrismaJson(channelPlan.recipientSnapshot),
        reasonCode: channelPlan.status === "SKIP" ? channelPlan.reasonCode : null,
        reasonMessage:
          channelPlan.status === "SKIP"
            ? channelPlan.reasonMessage?.slice(0, 500)
            : null,
      },
    });

    if (channelPlan.status === "SKIP") {
      return;
    }

    try {
      let result: DeliveryExecutionResult;

      switch (channel) {
        case "REALTIME":
          result = await this.deliverRealtime(notification);
          break;
        case "EMAIL":
          result = await this.deliverEmail(notification);
          break;
        case "TELEGRAM":
          result = await this.deliverTelegram(notification);
          break;
        case "PUSH":
          result = await this.deliverPush(notification);
          break;
        default:
          result = {
            success: false,
            error: `Canal ${channel} nao suportado`,
            reasonCode: "CHANNEL_UNSUPPORTED",
            reasonMessage: `Canal ${channel} nao suportado`,
          };
          break;
          /* legacy unsupported branch
          result = { success: false, error: `Canal ${channel} não suportado` };
          break;
      */
      }

      const estimatedCost = estimateNotificationDeliveryCost(
        channelPlan.channel,
        channelPlan.provider,
      );
      const mergedRecipientSnapshot = {
        ...(channelPlan.recipientSnapshot ?? {}),
        ...(result.recipientSnapshot ?? {}),
      };

      if (result.success) {
        await prisma.notificationDelivery.update({
          where: { id: delivery.id },
          data: {
            status: result.status || "SENT",
            providerMessageId: result.messageId,
            metadata: result.metadata,
            providerStatus: result.providerStatus || "ACCEPTED",
            providerResponseCode: result.providerResponseCode,
            recipientTarget: result.recipientTarget ?? channelPlan.recipientTarget,
            recipientSnapshot: asPrismaJson(
              Object.keys(mergedRecipientSnapshot).length > 0
                ? mergedRecipientSnapshot
                : undefined,
            ),
            sentAt: result.sentAt ?? new Date(),
            deliveredAt: result.deliveredAt,
            readAt: result.readAt,
            costAmount: result.costAmount ?? estimatedCost?.amount,
            costCurrency: result.costCurrency ?? estimatedCost?.currency,
            costSource: result.costSource ?? estimatedCost?.source,
          },
        });
      } else {
        await prisma.notificationDelivery.update({
          where: { id: delivery.id },
          data: {
            status: "FAILED",
            providerMessageId: result.messageId,
            errorCode:
              result.reasonCode?.slice(0, 100) ??
              result.providerResponseCode?.slice(0, 100),
            errorMessage: result.error?.slice(0, 500),
            metadata: result.metadata,
            reasonCode: result.reasonCode,
            reasonMessage: result.reasonMessage?.slice(0, 500),
            providerStatus: result.providerStatus || "ERROR",
            providerResponseCode: result.providerResponseCode,
            recipientTarget: result.recipientTarget ?? channelPlan.recipientTarget,
            recipientSnapshot: asPrismaJson(
              Object.keys(mergedRecipientSnapshot).length > 0
                ? mergedRecipientSnapshot
                : undefined,
            ),
            costAmount: result.costAmount ?? estimatedCost?.amount,
            costCurrency: result.costCurrency ?? estimatedCost?.currency,
            costSource: result.costSource ?? estimatedCost?.source,
          },
        });
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro desconhecido";
      const estimatedCost = estimateNotificationDeliveryCost(
        channelPlan.channel,
        channelPlan.provider,
      );

      await prisma.notificationDelivery.update({
        where: { id: delivery.id },
        data: {
          status: "FAILED",
          errorCode: "PROCESSING_FAILED",
          errorMessage: message.slice(0, 500),
          reasonCode: "PROCESSING_FAILED",
          reasonMessage: "Falha durante a tentativa de entrega do canal.",
          providerStatus: "ERROR",
          costAmount: estimatedCost?.amount,
          costCurrency: estimatedCost?.currency,
          costSource: estimatedCost?.source,
        },
      });

      console.error(
        `[NotificationService] Erro no canal ${channelPlan.channel}:`,
        error,
      );
    }
  }

  /**
   * Entrega via tempo real (Ably)
   */
  private static async deliverRealtime(
    notification: any,
  ): Promise<{ success: boolean }> {
    await publishRealtimeEvent("notification.new", {
      tenantId: notification.tenantId,
      userId: notification.userId,
      payload: {
        id: notification.id,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        urgency: notification.urgency,
        payload: notification.payload,
        createdAt: notification.createdAt,
      },
    });

    return { success: true };
  }

  /**
   * Entrega via email
   */
  private static async deliverEmail(
    notification: any,
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      // Buscar dados do usuário para obter email e nome
      const user = await prisma.usuario.findUnique({
        where: { id: notification.userId },
        select: {
          email: true,
          firstName: true,
          lastName: true,
        },
      });

      if (!user || !user.email) {
        console.warn(
          `[NotificationService] Usuário ${notification.userId} não tem email configurado`,
        );

        return { success: false, error: "Usuário sem email configurado" };
      }

      // Validar email
      if (!EmailChannel.isValidEmail(user.email)) {
        console.warn(
          `[NotificationService] Email inválido para usuário ${notification.userId}: ${user.email}`,
        );

        return { success: false, error: `Email inválido: ${user.email}` };
      }

      const userName = `${user.firstName} ${user.lastName}`.trim();

      // Enviar email
      const result = await EmailChannel.send(
        {
          type: notification.type,
          tenantId: notification.tenantId,
          userId: notification.userId,
          payload: notification.payload,
          urgency: notification.urgency,
          channels: notification.channels,
        },
        user.email,
        userName,
        notification.title,
        notification.message,
      );

      if (result.success) {
        console.log(
          `[NotificationService] ✅ Email enviado com sucesso para ${user.email} (notificação ${notification.id})`,
        );

        return { success: true, messageId: result.messageId };
      }

      console.error(
        `[NotificationService] ❌ Falha ao enviar email para ${user.email}: ${result.error}`,
      );

      return {
        success: false,
        error: result.error,
        messageId: result.messageId,
      };
    } catch (error) {
      console.error(
        `[NotificationService] Erro ao processar envio de email:`,
        error,
      );

      return {
        success: false,
        error: error instanceof Error ? error.message : "Erro desconhecido",
      };
    }
  }

  private static async deliverTelegram(
    notification: any,
  ): Promise<{
    success: boolean;
    messageId?: string;
    error?: string;
    metadata?: Record<string, any>;
  }> {
    const result = await sendTelegramNotification({
      tenantId: notification.tenantId,
      userId: notification.userId,
      title: notification.title,
      message: notification.message,
      type: notification.type,
      urgency: notification.urgency,
      payload: notification.payload,
    });

    return result;
  }

  /**
   * Entrega via push mobile
   */
  private static async deliverPush(
    notification: any,
  ): Promise<{
    success: boolean;
    error?: string;
    messageId?: string;
    metadata?: Record<string, any>;
  }> {
    return sendWebPushNotification({
      id: notification.id,
      tenantId: notification.tenantId,
      userId: notification.userId,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      urgency: notification.urgency,
      payload: notification.payload,
      createdAt: notification.createdAt,
    });
  }

  /**
   * Preferências padrão por role
   */
  private static getDefaultPreferencesByRole(
    role: string,
  ): Record<string, any> {
    const preferences = {
      SUPER_ADMIN: {
        default: {
          enabled: true,
          channels: ["REALTIME", "EMAIL"],
          urgency: "HIGH",
        },
        "processo.*": {
          enabled: true,
          channels: ["REALTIME", "EMAIL"],
          urgency: "HIGH",
        },
        "andamento.*": {
          enabled: true,
          channels: ["REALTIME", "EMAIL", "TELEGRAM"],
          urgency: "HIGH",
        },
        "movimentacao.*": {
          enabled: true,
          channels: ["REALTIME", "EMAIL", "TELEGRAM"],
          urgency: "HIGH",
        },
        "cliente.*": {
          enabled: true,
          channels: ["REALTIME"],
          urgency: "MEDIUM",
        },
        "financeiro.*": {
          enabled: true,
          channels: ["REALTIME", "EMAIL"],
          urgency: "HIGH",
        },
        "equipe.*": {
          enabled: true,
          channels: ["REALTIME", "EMAIL"],
          urgency: "HIGH",
        },
        "access.*": {
          enabled: true,
          channels: ["REALTIME", "EMAIL", "TELEGRAM"],
          urgency: "HIGH",
        },
      },
      ADMIN: {
        default: {
          enabled: true,
          channels: ["REALTIME", "EMAIL"],
          urgency: "HIGH",
        },
        "processo.*": {
          enabled: true,
          channels: ["REALTIME", "EMAIL"],
          urgency: "HIGH",
        },
        "andamento.*": {
          enabled: true,
          channels: ["REALTIME", "EMAIL", "TELEGRAM"],
          urgency: "HIGH",
        },
        "movimentacao.*": {
          enabled: true,
          channels: ["REALTIME", "EMAIL", "TELEGRAM"],
          urgency: "HIGH",
        },
        "cliente.*": {
          enabled: true,
          channels: ["REALTIME"],
          urgency: "MEDIUM",
        },
        "financeiro.*": {
          enabled: true,
          channels: ["REALTIME", "EMAIL"],
          urgency: "HIGH",
        },
        "equipe.*": {
          enabled: true,
          channels: ["REALTIME", "EMAIL"],
          urgency: "HIGH",
        },
        "access.*": {
          enabled: true,
          channels: ["REALTIME", "EMAIL", "TELEGRAM"],
          urgency: "HIGH",
        },
      },
      ADVOGADO: {
        default: { enabled: true, channels: ["REALTIME"], urgency: "MEDIUM" },
        "processo.*": {
          enabled: true,
          channels: ["REALTIME", "EMAIL"],
          urgency: "HIGH",
        },
        "andamento.*": {
          enabled: true,
          channels: ["REALTIME", "EMAIL", "TELEGRAM"],
          urgency: "HIGH",
        },
        "movimentacao.*": {
          enabled: true,
          channels: ["REALTIME", "EMAIL", "TELEGRAM"],
          urgency: "HIGH",
        },
        "cliente.*": {
          enabled: true,
          channels: ["REALTIME"],
          urgency: "MEDIUM",
        },
        "agenda.*": {
          enabled: true,
          channels: ["REALTIME", "EMAIL"],
          urgency: "HIGH",
        },
        "prazo.*": {
          enabled: true,
          channels: ["REALTIME", "EMAIL"],
          urgency: "CRITICAL",
        },
        "access.*": {
          enabled: true,
          channels: ["REALTIME", "EMAIL", "TELEGRAM"],
          urgency: "HIGH",
        },
      },
      SECRETARIA: {
        default: { enabled: true, channels: ["REALTIME"], urgency: "MEDIUM" },
        "processo.*": {
          enabled: true,
          channels: ["REALTIME"],
          urgency: "MEDIUM",
        },
        "cliente.*": {
          enabled: true,
          channels: ["REALTIME"],
          urgency: "MEDIUM",
        },
        "agenda.*": { enabled: true, channels: ["REALTIME"], urgency: "HIGH" },
        "equipe.*": {
          enabled: true,
          channels: ["REALTIME"],
          urgency: "MEDIUM",
        },
        "access.*": {
          enabled: true,
          channels: ["REALTIME", "EMAIL", "TELEGRAM"],
          urgency: "HIGH",
        },
      },
      FINANCEIRO: {
        default: { enabled: true, channels: ["REALTIME"], urgency: "MEDIUM" },
        "financeiro.*": {
          enabled: true,
          channels: ["REALTIME", "EMAIL"],
          urgency: "HIGH",
        },
        "contrato.*": {
          enabled: true,
          channels: ["REALTIME", "EMAIL"],
          urgency: "HIGH",
        },
        "pagamento.*": {
          enabled: true,
          channels: ["REALTIME", "EMAIL"],
          urgency: "CRITICAL",
        },
        "access.*": {
          enabled: true,
          channels: ["REALTIME", "EMAIL", "TELEGRAM"],
          urgency: "HIGH",
        },
      },
      CLIENTE: {
        default: { enabled: true, channels: ["REALTIME"], urgency: "MEDIUM" },
        "processo.*": {
          enabled: true,
          channels: ["REALTIME"],
          urgency: "MEDIUM",
        },
        "contrato.*": {
          enabled: true,
          channels: ["REALTIME"],
          urgency: "MEDIUM",
        },
        "pagamento.*": {
          enabled: true,
          channels: ["REALTIME"],
          urgency: "HIGH",
        },
        "access.*": {
          enabled: true,
          channels: ["REALTIME", "EMAIL", "TELEGRAM"],
          urgency: "HIGH",
        },
      },
    };

    return (
      preferences[role as keyof typeof preferences] || preferences.SECRETARIA
    );
  }

  /**
   * Templates padrão para cada tipo de evento
   */
  private static getDefaultTemplates(): Record<string, NotificationTemplate> {
    return {
      "processo.created": {
        title: "Novo processo criado",
        message: "Processo {numero} foi criado para {clienteNome}",
      },
      "access.login_new": {
        title: "Novo acesso identificado",
        message:
          "Detectamos um novo acesso na sua conta em {locationLabel} ({ipAddress}) em {loggedAt}.",
      },
      "processo.updated": {
        title: "Processo atualizado",
        message: "Processo {numero} foi atualizado: {changesSummary}",
      },
      "processo.status_changed": {
        title: "Status do processo alterado",
        message:
          "Processo {numero} mudou de {oldStatusLabel} para {newStatusLabel}",
      },
      "prazo.created": {
        title: "Novo prazo registrado",
        message:
          'Prazo "{titulo}" foi criado no processo {processoNumero} (vencimento: {dataVencimento})',
      },
      "prazo.updated": {
        title: "Prazo atualizado",
        message:
          'Prazo "{titulo}" do processo {processoNumero} foi atualizado',
      },
      "prazo.digest_30d": {
        title: "Frente 1 · Prazos com vencimento em 30 dias",
        message:
          "Os seguintes prazos vencem em 30 dias:\n{resumoPrazos}\n\nTotal: {totalPrazos} prazo(s).",
      },
      "prazo.digest_10d": {
        title: "Frente 2 · Prazos com vencimento em 10 dias",
        message:
          "Os seguintes prazos vencem em 10 dias:\n{resumoPrazos}\n\nTotal: {totalPrazos} prazo(s).",
      },
      "prazo.expiring_7d": {
        title: "Frente 2 · Prazo próximo do vencimento",
        message:
          'Prazo "{titulo}" do processo {processoNumero} vence em 7 dias.',
      },
      "prazo.expiring": {
        title: "Prazo próximo do vencimento",
        message:
          "Prazo do processo {processoNumero} está próximo do vencimento",
      },
      "prazo.expiring_3d": {
        title: "Frente 2 · Prazo muito próximo do vencimento",
        message:
          'Prazo "{titulo}" do processo {processoNumero} vence em 3 dias.',
      },
      "prazo.expiring_1d": {
        title: "Frente 3 · Prazo crítico",
        message:
          'Prazo "{titulo}" do processo {processoNumero} vence em 1 dia.',
      },
      "prazo.expiring_2h": {
        title: "Frente 3 · Prazo no limite",
        message:
          'Prazo "{titulo}" do processo {processoNumero} vence em até 2 horas.',
      },
      "prazo.expired": {
        title: "Frente 3 · Prazo vencido",
        message: 'Prazo "{titulo}" do processo {processoNumero} venceu.',
      },
      "cliente.created": {
        title: "Novo cliente cadastrado",
        message: "Cliente {nome} foi cadastrado",
      },
      "contrato.created": {
        title: "Novo contrato criado",
        message: "Contrato {numero} foi criado para {cliente}",
      },
      "contrato.signed": {
        title: "Contrato assinado",
        message: "Contrato {numero} foi assinado",
      },
      "pagamento.paid": {
        title: "Pagamento confirmado",
        message: "Pagamento de R$ {valor} foi confirmado",
      },
      "pagamento.overdue": {
        title: "Pagamento em atraso",
        message: "Pagamento de R$ {valor} está em atraso",
      },
      "evento.created": {
        title: "Novo evento agendado",
        message: "Evento {titulo} foi agendado para {data}",
      },
      "evento.reminder_1h": {
        title: "Lembrete de evento",
        message: "Evento {titulo} em 1 hora",
      },
      "evento.reminder_custom": {
        title: "Lembrete de evento",
        message: "Evento {titulo} em {reminderLabel}",
      },
      "equipe.user_invited": {
        title: "Novo convite de equipe",
        message: "Convite enviado para {email}",
      },
      "equipe.user_joined": {
        title: "Novo membro da equipe",
        message: "{nome} aceitou o convite e entrou na equipe",
      },
      "andamento.created": {
        title: "Novo andamento registrado",
        message:
          'Um novo andamento "{titulo}" foi adicionado ao processo {processoNumero}.',
      },
      "andamento.updated": {
        title: "Andamento atualizado",
        message:
          'O andamento "{titulo}" do processo {processoNumero} foi atualizado: {changesSummary}',
      },
    };
  }

  private static upsertChannelPlan(
    planMap: Map<NotificationChannel, ChannelPlanEntry>,
    channel: NotificationChannel,
    updates: Partial<ChannelPlanEntry>,
  ) {
    const current = planMap.get(channel);

    planMap.set(channel, {
      channel,
      provider: current?.provider || this.getProviderForChannel(channel),
      requested: current?.requested || updates.requested || false,
      status: updates.status || current?.status || "ATTEMPT",
      reasonCode:
        updates.status === "ATTEMPT"
          ? updates.reasonCode
          : updates.reasonCode ?? current?.reasonCode,
      reasonMessage:
        updates.status === "ATTEMPT"
          ? updates.reasonMessage
          : updates.reasonMessage ?? current?.reasonMessage,
      recipientTarget: updates.recipientTarget ?? current?.recipientTarget,
      recipientSnapshot: updates.recipientSnapshot ?? current?.recipientSnapshot,
    });
  }

  private static async inspectChannelAvailability(
    tenantId: string,
    userId: string,
    channel: NotificationChannel,
  ): Promise<
    | {
        canAttempt: true;
        recipientTarget: string;
        recipientSnapshot: Record<string, any>;
      }
    | {
        canAttempt: false;
        reasonCode: string;
        reasonMessage: string;
        recipientTarget?: string;
        recipientSnapshot?: Record<string, any>;
      }
  > {
    switch (channel) {
      case "REALTIME":
        return {
          canAttempt: true,
          recipientTarget: `user:${userId}`,
          recipientSnapshot: { userId },
        };
      case "EMAIL": {
        const user = await prisma.usuario.findUnique({
          where: { id: userId },
          select: {
            email: true,
            firstName: true,
            lastName: true,
          },
        });

        if (!user?.email) {
          return {
            canAttempt: false,
            reasonCode: "RECIPIENT_MISSING",
            reasonMessage: "O usuario nao possui email configurado.",
          };
        }

        if (!EmailChannel.isValidEmail(user.email)) {
          return {
            canAttempt: false,
            reasonCode: "INVALID_RECIPIENT",
            reasonMessage: `Email invalido: ${user.email}`,
            recipientTarget: user.email,
            recipientSnapshot: { email: user.email },
          };
        }

        const credential =
          (await prisma.tenantEmailCredential.findUnique({
            where: { tenantId_type: { tenantId, type: "DEFAULT" } },
            select: { id: true, fromAddress: true, fromName: true },
          })) ||
          (await prisma.tenantEmailCredential.findUnique({
            where: { tenantId_type: { tenantId, type: "ADMIN" } },
            select: { id: true, fromAddress: true, fromName: true },
          }));

        if (!credential) {
          return {
            canAttempt: false,
            reasonCode: "PROVIDER_INACTIVE",
            reasonMessage:
              "O tenant nao possui credencial ativa de email para disparo.",
            recipientTarget: user.email,
            recipientSnapshot: { email: user.email },
          };
        }

        const userName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();

        return {
          canAttempt: true,
          recipientTarget: user.email,
          recipientSnapshot: {
            email: user.email,
            userName,
            credentialId: credential.id,
            fromAddress: credential.fromAddress,
            fromName: credential.fromName,
          },
        };
      }
      case "TELEGRAM": {
        const [provider, binding] = await Promise.all([
          getActiveTelegramProvider(tenantId),
          getTelegramUserBinding(tenantId, userId),
        ]);

        if (!provider) {
          return {
            canAttempt: false,
            reasonCode: "PROVIDER_INACTIVE",
            reasonMessage: "Bot do Telegram nao configurado para o tenant.",
          };
        }

        if (!binding.chatId) {
          return {
            canAttempt: false,
            reasonCode: "NO_ACTIVE_BINDING",
            reasonMessage: "O usuario nao vinculou um chat do Telegram.",
            recipientSnapshot: {
              telegramUsername: binding.username,
              alertsEnabled: binding.alertsEnabled,
            },
          };
        }

        if (!binding.alertsEnabled) {
          return {
            canAttempt: false,
            reasonCode: "DISABLED_BY_PREFERENCE",
            reasonMessage: "Os alertas do Telegram foram desativados pelo usuario.",
            recipientTarget: binding.chatId,
            recipientSnapshot: {
              chatId: binding.chatId,
              telegramUsername: binding.username,
              alertsEnabled: false,
            },
          };
        }

        return {
          canAttempt: true,
          recipientTarget: binding.chatId,
          recipientSnapshot: {
            chatId: binding.chatId,
            telegramUsername: binding.username,
            providerSource: provider.source,
          },
        };
      }
      case "PUSH": {
        if (!isWebPushConfigured()) {
          return {
            canAttempt: false,
            reasonCode: "PROVIDER_INACTIVE",
            reasonMessage: "Web Push nao configurado no ambiente.",
          };
        }

        const subscriptions = await getActiveWebPushSubscriptions({
          tenantId,
          userId,
        });

        if (subscriptions.length === 0) {
          return {
            canAttempt: false,
            reasonCode: "NO_ACTIVE_BINDING",
            reasonMessage: "O usuario nao possui dispositivo com push ativo.",
          };
        }

        return {
          canAttempt: true,
          recipientTarget: `${subscriptions.length} dispositivo(s)`,
          recipientSnapshot: {
            totalSubscriptions: subscriptions.length,
            endpointHashes: subscriptions.slice(0, 5).map((item) => item.endpointHash),
            subscriptionIds: subscriptions.slice(0, 5).map((item) => item.id),
          },
        };
      }
      default:
        return {
          canAttempt: false,
          reasonCode: "CHANNEL_UNSUPPORTED",
          reasonMessage: `Canal ${channel} nao suportado`,
        };
    }
  }

  private static async resolveChannelsForDelivery(params: {
    event: NotificationEvent;
    preferenceChannels: NotificationChannel[];
    urgency: NotificationUrgency;
  }): Promise<ChannelResolutionResult> {
    const planMap = new Map<NotificationChannel, ChannelPlanEntry>();
    const explicitChannels = params.event.channels ?? [];

    const addAttempt = (channel: NotificationChannel, requested = true) => {
      this.upsertChannelPlan(planMap, channel, {
        requested,
        status: "ATTEMPT",
        reasonCode: undefined,
        reasonMessage: undefined,
      });
    };

    const addSkip = (
      channel: NotificationChannel,
      reasonCode: string,
      reasonMessage: string,
    ) => {
      this.upsertChannelPlan(planMap, channel, {
        requested: true,
        status: "SKIP",
        reasonCode,
        reasonMessage,
      });
    };

    if (params.urgency === "CRITICAL") {
      addAttempt("REALTIME");
      addAttempt("EMAIL");

      if (explicitChannels.includes("TELEGRAM")) {
        addAttempt("TELEGRAM");
      }
    } else if (explicitChannels.length > 0) {
      const enabledChannels = new Set(params.preferenceChannels);
      const shouldForceDeadlineTelegram =
        params.event.type.startsWith("prazo.") &&
        explicitChannels.includes("TELEGRAM");

      for (const channel of explicitChannels) {
        if (
          enabledChannels.has(channel) ||
          (shouldForceDeadlineTelegram && channel === "TELEGRAM")
        ) {
          addAttempt(channel);
        } else {
          addSkip(
            channel,
            "DISABLED_BY_PREFERENCE",
            `Canal ${channel} desabilitado pelas preferencias do usuario.`,
          );
        }
      }

      if (Array.from(planMap.values()).every((plan) => plan.status !== "ATTEMPT")) {
        for (const channel of params.preferenceChannels) {
          addAttempt(channel);
        }
      }
    } else {
      for (const channel of params.preferenceChannels) {
        addAttempt(channel);
      }
    }

    if (NotificationPolicy.shouldMirrorToTelegram(params.event.type, params.urgency)) {
      const telegramPlan = planMap.get("TELEGRAM");

      if (!telegramPlan || telegramPlan.status !== "ATTEMPT") {
        addAttempt("TELEGRAM");
      }
    }

    for (const plan of planMap.values()) {
      if (plan.status !== "ATTEMPT") {
        continue;
      }

      const inspection = await this.inspectChannelAvailability(
        params.event.tenantId,
        params.event.userId,
        plan.channel,
      );

      if (!inspection.canAttempt) {
        this.upsertChannelPlan(planMap, plan.channel, {
          requested: plan.requested,
          status: "SKIP",
          reasonCode: inspection.reasonCode,
          reasonMessage: inspection.reasonMessage,
          recipientTarget: inspection.recipientTarget,
          recipientSnapshot: inspection.recipientSnapshot,
        });
        continue;
      }

      this.upsertChannelPlan(planMap, plan.channel, {
        requested: plan.requested,
        status: "ATTEMPT",
        recipientTarget: inspection.recipientTarget,
        recipientSnapshot: inspection.recipientSnapshot,
      });
    }

    const resolvedChannels = Array.from(planMap.values())
      .filter((plan) => plan.status === "ATTEMPT")
      .map((plan) => plan.channel);
    const channelOrder = new Map(
      sortNotificationChannels(Array.from(planMap.keys())).map((channel, index) => [
        channel,
        index,
      ]),
    );

    return {
      requestedChannels: sortNotificationChannels(
        Array.from(planMap.values())
          .filter((plan) => plan.requested)
          .map((plan) => plan.channel),
      ),
      resolvedChannels: sortNotificationChannels(resolvedChannels),
      channelPlans: Array.from(planMap.values()).sort(
        (left, right) =>
          (channelOrder.get(left.channel) ?? 999) -
          (channelOrder.get(right.channel) ?? 999),
      ),
    };
  }
  private static buildWildcardEventTypes(eventType: string): string[] {
    const wildcards: string[] = [];
    const segments = eventType.split(".");

    if (segments.length > 0 && segments[0]) {
      wildcards.push(`${segments[0]}.*`);
    }

    // Suporte a padrões mais específicos (ex: processo.status.*) se definidos
    if (segments.length > 1) {
      const partial = segments.slice(0, segments.length - 1).join(".");

      wildcards.push(`${partial}.*`);
    }

    wildcards.push("default");

    return Array.from(new Set(wildcards));
  }

  private static selectPreferenceFromCandidates(
    orderedCandidates: string[],
    preferences: {
      eventType: string;
      enabled: boolean;
      channels: NotificationChannel[];
      urgency: NotificationUrgency;
    }[],
  ): {
    enabled: boolean;
    channels: NotificationChannel[];
    urgency: NotificationUrgency;
  } | null {
    for (const candidate of orderedCandidates) {
      const match = preferences.find((pref) => pref.eventType === candidate);

      if (match) {
        return {
          enabled: match.enabled,
          channels: match.channels,
          urgency: match.urgency,
        };
      }
    }

    return null;
  }

  private static resolvePreferenceFromRoleDefaults(
    defaults: Record<
      string,
      {
        enabled: boolean;
        channels: NotificationChannel[];
        urgency: NotificationUrgency;
      }
    >,
    eventType: string,
    wildcardCandidates: string[],
  ): {
    enabled: boolean;
    channels: NotificationChannel[];
    urgency: NotificationUrgency;
  } {
    if (defaults[eventType]) {
      return defaults[eventType];
    }

    const match = this.selectPreferenceFromCandidates(
      wildcardCandidates,
      Object.entries(defaults).map(([key, value]) => ({
        eventType: key,
        ...value,
      })),
    );

    if (match) {
      return match;
    }

    return (
      defaults.default || {
        enabled: true,
        channels: ["REALTIME"],
        urgency: "MEDIUM",
      }
    );
  }
}
