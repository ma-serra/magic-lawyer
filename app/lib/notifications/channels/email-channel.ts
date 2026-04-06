import { NotificationEvent } from "../types";

import prisma from "@/app/lib/prisma";
import { emailService } from "@/app/lib/email-service";
import {
  resolveNotificationActionText,
  resolveNotificationUrl,
  resolveTenantBaseUrl as resolveNotificationTenantBaseUrl,
} from "@/app/lib/notifications/notification-links";

/**
 * Canal de EMAIL para notificações
 * Integra com o serviço de email existente (Resend)
 */
export class EmailChannel {
  /**
   * Envia notificação por email
   */
  static async send(
    event: NotificationEvent,
    userEmail: string,
    userName: string,
    title: string,
    message: string,
  ): Promise<{ success: boolean; error?: string; messageId?: string }> {
    try {
      const tenant = event.tenantId
        ? await prisma.tenant.findUnique({
            where: { id: event.tenantId },
            select: {
              slug: true,
              domain: true,
              branding: { select: { customDomainText: true } },
            },
          })
        : null;

      const tenantBaseUrl = this.resolveTenantBaseUrl(tenant);

      // Gerar link de ação baseado no tipo de evento
      const linkAcao = tenantBaseUrl
        ? this.generateActionLink(event, tenantBaseUrl)
        : undefined;
      const textoAcao =
        tenantBaseUrl && linkAcao
          ? resolveNotificationActionText(event.type, event.payload)
          : undefined;

      const enrichedMessage = this.enrichMessage(message, event, linkAcao);

      // Enviar email usando o novo serviço per-tenant
      const result = await emailService.sendNotificacaoAdvogado(
        event.tenantId,
        {
          nome: userName,
          email: userEmail,
          tipo: event.type,
          titulo: title,
          mensagem: enrichedMessage,
          linkAcao,
          textoAcao,
        },
      );

      if (result.success) {
        console.log(
          `[EmailChannel] Email enviado com sucesso para ${userEmail}`,
        );

        return { success: true, messageId: result.messageId };
      }

      console.error(
        `[EmailChannel] Falha ao enviar email para ${userEmail}: ${result.error}`,
      );

      return { success: false, error: result.error || "Falha ao enviar email" };
    } catch (error) {
      console.error("[EmailChannel] Erro ao enviar email:", error);

      return {
        success: false,
        error: error instanceof Error ? error.message : "Erro desconhecido",
      };
    }
  }

  /**
   * Gera link de ação baseado no tipo de evento
   */
  private static generateActionLink(
    event: NotificationEvent,
    baseUrl?: string,
  ): string | undefined {
    if (!baseUrl) {
      return undefined;
    }
    const normalizedBase = baseUrl.replace(/\/+$/, "");
    return resolveNotificationUrl(event.type, event.payload, baseUrl);

    switch (event.type) {
      case "processo.created":
        return event.payload.processoId
          ? `${normalizedBase}/processos/${event.payload.processoId}`
          : undefined;

      case "prazo.expiring":
      case "prazo.digest_30d":
      case "prazo.digest_10d":
      case "prazo.expiring_7d":
      case "prazo.expiring_3d":
      case "prazo.expiring_1d":
      case "prazo.expiring_2h":
      case "prazo.expired":
      case "prazo.created":
      case "prazo.updated":
        if (event.type === "prazo.digest_30d" || event.type === "prazo.digest_10d") {
          return `${normalizedBase}/processos`;
        }

        return event.payload.processoId
          ? `${normalizedBase}/processos/${event.payload.processoId}?tab=prazos`
          : `${normalizedBase}/andamentos`;

      case "documento.uploaded":
        return event.payload.processoId
          ? `${normalizedBase}/processos/${event.payload.processoId}`
          : undefined;

      case "pagamento.paid":
      case "pagamento.pending":
      case "pagamento.overdue":
        return `${normalizedBase}/financeiro`;

      case "evento.created":
      case "evento.updated":
      case "evento.confirmation_updated":
        return event.payload.eventoId
          ? `${normalizedBase}/agenda/${event.payload.eventoId}`
          : `${normalizedBase}/agenda`;
      case "andamento.created":
      case "andamento.updated":
        return event.payload.processoId
          ? `${normalizedBase}/processos/${event.payload.processoId}`
          : `${normalizedBase}/andamentos`;
      case "access.login_new":
        return typeof event.payload.securityActionUrl === "string"
          ? event.payload.securityActionUrl
          : `${normalizedBase}/dashboard`;

      default:
        return `${normalizedBase}/dashboard`;
    }
  }

  /**
   * Gera texto do botão de ação baseado no tipo de evento
   */
  private static generateActionText(
    event: NotificationEvent,
  ): string | undefined {
    switch (event.type) {
      case "processo.created":
        return "Ver Processo";

      case "prazo.expiring":
      case "prazo.digest_30d":
      case "prazo.digest_10d":
      case "prazo.expiring_7d":
      case "prazo.expiring_3d":
      case "prazo.expiring_1d":
      case "prazo.expiring_2h":
      case "prazo.expired":
      case "prazo.created":
      case "prazo.updated":
        if (event.type === "prazo.digest_30d" || event.type === "prazo.digest_10d") {
          return "Revisar lista de prazos";
        }

        return "Ver Prazos";

      case "documento.uploaded":
        return "Ver Documento";

      case "pagamento.paid":
      case "pagamento.pending":
      case "pagamento.overdue":
        return "Ver Financeiro";

      case "evento.created":
      case "evento.updated":
      case "evento.confirmation_updated":
        return "Ver Evento";

      case "andamento.created":
      case "andamento.updated":
        return "Ver andamento";
      case "access.login_new":
        return "Nao fui eu";

      default:
        return "Acessar Plataforma";
    }
  }

  /**
   * Valida se o email é válido
   */
  static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    return emailRegex.test(email);
  }

  private static resolveTenantBaseUrl(
    tenant:
      | {
          slug: string | null;
          domain: string | null;
          branding: { customDomainText: string | null } | null;
        }
      | null
      | undefined,
  ): string | undefined {
    return resolveNotificationTenantBaseUrl(tenant);
  }

  private static enrichMessage(
    originalMessage: string,
    event: NotificationEvent,
    actionUrl?: string,
  ): string {
    const details: string[] = [];
    const payload = event.payload || {};

    if (event.type.startsWith("prazo.")) {
      if (payload.clienteNome) {
        details.push(`Cliente: ${payload.clienteNome}`);
      }

      if (payload.processoNumero || payload.numero) {
        details.push(`Processo: ${payload.processoNumero || payload.numero}`);
      }

      if (payload.titulo) {
        details.push(`Prazo: ${payload.titulo}`);
      }

      const effectiveDate = this.formatDate(
        payload.effectiveDate || payload.dataVencimento,
      );

      if (effectiveDate) {
        details.push(`Vencimento: ${effectiveDate}`);
      }

      if (actionUrl) {
        details.push(`Acesso direto: ${actionUrl}`);
      }
    }

    if (
      event.type === "andamento.created" ||
      event.type === "andamento.updated"
    ) {
      if (payload.processoNumero) {
        details.push(`Processo: ${payload.processoNumero}`);
      }

      if (payload.titulo) {
        details.push(`Andamento: ${payload.titulo}`);
      }

      if (payload.tipo) {
        details.push(`Tipo: ${payload.tipo}`);
      }

      const formattedDate = this.formatDate(payload.dataMovimentacao);

      if (formattedDate) {
        details.push(`Data/Hora: ${formattedDate}`);
      }

      if (payload.descricao) {
        details.push(`Descrição: ${payload.descricao}`);
      }
    }

    if (event.type === "access.login_new") {
      if (payload.locationLabel) {
        details.push(`Local aproximado: ${payload.locationLabel}`);
      }

      if (payload.ipAddress) {
        details.push(`IP: ${payload.ipAddress}`);
      }

      if (payload.userAgent) {
        details.push(`Dispositivo: ${payload.userAgent}`);
      }

      const formattedDate = this.formatDate(payload.loggedAt);

      if (formattedDate) {
        details.push(`Data/Hora: ${formattedDate}`);
      }
    }

    if (!details.length) {
      return originalMessage;
    }

    return `${originalMessage}\n\n${details.join("\n")}`;
  }

  private static formatDate(value: unknown): string | null {
    if (!value) {
      return null;
    }

    const date = new Date(value as any);

    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(date);
  }
}
