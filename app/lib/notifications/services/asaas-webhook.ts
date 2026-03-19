/**
 * Serviço de escuta de webhooks Asaas para eventos de pagamento
 * Processa webhooks do Asaas e dispara notificações correspondentes
 */

import { NotificationService } from "../notification-service";
import { NotificationFactory } from "../domain/notification-factory";

import prisma from "@/app/lib/prisma";

/**
 * Tipos de eventos do webhook Asaas
 */
export type AsaasWebhookEvent =
  | "PAYMENT_CREATED"
  | "PAYMENT_UPDATED"
  | "PAYMENT_CONFIRMED"
  | "PAYMENT_RECEIVED"
  | "PAYMENT_OVERDUE"
  | "PAYMENT_DELETED"
  | "PAYMENT_RESTORED"
  | "PAYMENT_REFUNDED"
  | "PAYMENT_CHARGEBACK_REQUESTED"
  | "PAYMENT_CHARGEBACK_DISPUTE"
  | "PAYMENT_AWAITING_RISK_ANALYSIS"
  | "PAYMENT_APPROVED_BY_RISK_ANALYSIS"
  | "PAYMENT_REPROVED_BY_RISK_ANALYSIS";

export interface AsaasWebhookPayload {
  event: AsaasWebhookEvent;
  payment: {
    id: string;
    customer: string; // ID do cliente no Asaas
    billingType: string; // BOLETO, CREDIT_CARD, DEBIT_CARD, PIX, etc
    value: number;
    netValue?: number;
    originalValue?: number;
    interestValue?: number;
    description?: string;
    dueDate: string; // ISO date string
    paymentDate?: string; // ISO date string
    clientPaymentDate?: string; // ISO date string
    installmentNumber?: number;
    invoiceUrl?: string;
    bankSlipUrl?: string;
    transactionReceiptUrl?: string;
    invoiceNumber?: string;
    externalReference?: string; // ID da parcela no nosso sistema
    status:
      | "PENDING"
      | "CONFIRMED"
      | "RECEIVED"
      | "OVERDUE"
      | "REFUNDED"
      | "RECEIVED_IN_CASH_UNDONE"
      | "CHARGEBACK_REQUESTED"
      | "CHARGEBACK_DISPUTE"
      | "AWAITING_RISK_ANALYSIS"
      | "APPROVED_BY_RISK_ANALYSIS"
      | "REPROVED_BY_RISK_ANALYSIS"
      | "REFUND_REQUESTED"
      | "CHARGEBACK_DISPUTE_LOST"
      | "REFUNDED";
    pixTransaction?: {
      id: string;
      qrCode: string;
      qrCodeBase64?: string;
      endToEndId?: string;
    };
  };
}

export class AsaasWebhookService {
  /**
   * Processa webhook do Asaas e dispara notificações
   */
  static async processWebhook(
    payload: AsaasWebhookPayload,
    tenantId: string,
  ): Promise<void> {
    try {
      console.log(
        `[AsaasWebhook] Processando evento ${payload.event} para pagamento ${payload.payment.id}`,
      );

      // Buscar parcela relacionada ao pagamento
      const parcela = await prisma.contratoParcela.findFirst({
        where: {
          tenantId,
          asaasPaymentId: payload.payment.id,
        },
        include: {
          contrato: {
            include: {
              cliente: {
                select: {
                  id: true,
                  nome: true,
                  usuarioId: true,
                },
              },
            },
          },
        },
      });

      if (!parcela) {
        console.warn(
          `[AsaasWebhook] Parcela não encontrada para pagamento ${payload.payment.id}`,
        );

        return;
      }

      // Mapear evento do Asaas para evento de notificação
      const notificationEvent = this.mapAsaasEventToNotification(
        payload.event,
        payload.payment,
        parcela,
        tenantId,
      );

      if (!notificationEvent) {
        console.log(
          `[AsaasWebhook] Evento ${payload.event} não mapeado para notificação`,
        );

        return;
      }

      // Determinar usuários que devem receber a notificação
      const userIds = await this.getNotificationRecipients(
        tenantId,
        parcela.contratoId,
        parcela.contrato.cliente.usuarioId,
      );

      // Enviar notificações para cada usuário
      for (const userId of userIds) {
        try {
          const event = NotificationFactory.createEvent(
            notificationEvent.type,
            tenantId,
            userId,
            {
              ...notificationEvent.payload,
              parcelaId: parcela.id,
              parcelaNumero: parcela.numeroParcela,
            },
            {
              urgency: notificationEvent.urgency,
              channels: notificationEvent.channels,
            },
          );

          await NotificationService.publishNotification(event);

          console.log(
            `[AsaasWebhook] Notificação ${notificationEvent.type} enviada para usuário ${userId}`,
          );
        } catch (error) {
          console.error(
            `[AsaasWebhook] Erro ao enviar notificação para usuário ${userId}:`,
            error,
          );
        }
      }
    } catch (error) {
      console.error("[AsaasWebhook] Erro ao processar webhook:", error);
      throw error;
    }
  }

  /**
   * Mapeia evento do Asaas para evento de notificação
   */
  private static mapAsaasEventToNotification(
    asaasEvent: AsaasWebhookEvent,
    payment: AsaasWebhookPayload["payment"],
    parcela: any,
    tenantId: string,
  ): {
    type: string;
    urgency: "CRITICAL" | "HIGH" | "MEDIUM" | "INFO";
    channels: Array<"REALTIME" | "EMAIL" | "TELEGRAM" | "PUSH">;
    payload: Record<string, any>;
  } | null {
    const basePayload = {
      pagamentoId: payment.id,
      valor: payment.value,
      metodo: payment.billingType,
      contratoId: parcela.contratoId,
      clienteId: parcela.contrato.clienteId,
      clienteNome: parcela.contrato.cliente.nome,
    };

    switch (asaasEvent) {
      case "PAYMENT_CONFIRMED":
      case "PAYMENT_RECEIVED":
        return {
          type: "pagamento.paid",
          urgency: "HIGH",
          channels: ["REALTIME", "EMAIL"],
          payload: {
            ...basePayload,
            dataPagamento:
              payment.paymentDate ||
              payment.clientPaymentDate ||
              new Date().toISOString(),
            transactionId: payment.id,
          },
        };

      case "PAYMENT_OVERDUE":
        return {
          type: "pagamento.overdue",
          urgency: "CRITICAL",
          channels: ["REALTIME", "EMAIL"],
          payload: {
            ...basePayload,
            diasAtraso: this.calculateDaysOverdue(payment.dueDate),
            vencimento: payment.dueDate,
          },
        };

      case "PAYMENT_UPDATED":
        // Verificar se mudou de status para "failed"
        if (payment.status === "REPROVED_BY_RISK_ANALYSIS") {
          return {
            type: "pagamento.failed",
            urgency: "CRITICAL",
            channels: ["REALTIME", "EMAIL"],
            payload: {
              ...basePayload,
              motivo: "Pagamento reprovado pela análise de risco",
            },
          };
        }

        // Verificar outros status de falha
        if (
          payment.status === "CHARGEBACK_DISPUTE_LOST" ||
          payment.status === "REFUND_REQUESTED"
        ) {
          return {
            type: "pagamento.failed",
            urgency: "CRITICAL",
            channels: ["REALTIME", "EMAIL"],
            payload: {
              ...basePayload,
              motivo:
                payment.status === "CHARGEBACK_DISPUTE_LOST"
                  ? "Chargeback perdido"
                  : "Estorno solicitado",
            },
          };
        }

        return null; // Atualizações sem mudança de status não notificam

      case "PAYMENT_REFUNDED":
        return {
          type: "pagamento.estornado",
          urgency: "HIGH",
          channels: ["REALTIME", "EMAIL"],
          payload: {
            ...basePayload,
            dataEstorno: new Date().toISOString(),
          },
        };

      case "PAYMENT_CREATED":
        // Verificar se é boleto ou PIX gerado
        if (payment.billingType === "BOLETO") {
          return {
            type: "boleto.generated",
            urgency: "MEDIUM",
            channels: ["REALTIME", "EMAIL"],
            payload: {
              ...basePayload,
              boletoId: payment.id,
              vencimento: payment.dueDate,
              boletoUrl: payment.bankSlipUrl,
            },
          };
        }

        if (payment.billingType === "PIX" && payment.pixTransaction) {
          return {
            type: "pix.generated",
            urgency: "MEDIUM",
            channels: ["REALTIME"],
            payload: {
              ...basePayload,
              qrCode: payment.pixTransaction.qrCode,
              qrCodeUrl: payment.pixTransaction.qrCodeBase64,
              expiraEm: payment.dueDate, // PIX geralmente expira na data de vencimento
            },
          };
        }

        return {
          type: "pagamento.created",
          urgency: "MEDIUM",
          channels: ["REALTIME"],
          payload: basePayload,
        };

      default:
        // Outros eventos não mapeados
        return null;
    }
  }

  /**
   * Calcula dias de atraso baseado na data de vencimento
   */
  private static calculateDaysOverdue(dueDate: string): number {
    const due = new Date(dueDate);
    const now = new Date();
    const diff = now.getTime() - due.getTime();

    return Math.max(0, Math.floor(diff / (24 * 60 * 60 * 1000)));
  }

  /**
   * Determina usuários que devem receber a notificação de pagamento
   */
  private static async getNotificationRecipients(
    tenantId: string,
    contratoId: string,
    clienteUserId: string | null,
  ): Promise<string[]> {
    const recipients: string[] = [];

    // Buscar admin do tenant
    const admin = await prisma.usuario.findFirst({
      where: {
        tenantId,
        role: "ADMIN",
        active: true,
      },
      select: { id: true },
    });

    if (admin) {
      recipients.push(admin.id);
    }

    // Buscar usuário financeiro
    const financeiro = await prisma.usuario.findFirst({
      where: {
        tenantId,
        role: "FINANCEIRO",
        active: true,
      },
      select: { id: true },
    });

    if (financeiro) {
      recipients.push(financeiro.id);
    }

    // Adicionar cliente se tiver usuário
    if (clienteUserId) {
      recipients.push(clienteUserId);
    }

    // Buscar advogado responsável pelo contrato
    const contrato = await prisma.contrato.findFirst({
      where: {
        id: contratoId,
        tenantId,
      },
      select: {
        processo: {
          select: {
            advogadoResponsavel: {
              select: {
                usuario: {
                  select: { id: true },
                },
              },
            },
          },
        },
      },
    });

    const advogadoUserId = (
      contrato?.processo?.advogadoResponsavel?.usuario as any
    )?.id;

    if (advogadoUserId && !recipients.includes(advogadoUserId)) {
      recipients.push(advogadoUserId);
    }

    return Array.from(new Set(recipients)); // Remover duplicatas
  }
}
