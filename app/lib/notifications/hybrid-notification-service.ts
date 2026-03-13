import { NotificationService } from "./notification-service";
import { NotificationMigrationService } from "./notification-migration";
import { NotificationEvent } from "./types";

/**
 * Serviço híbrido que permite usar tanto o sistema legado quanto o novo
 * durante o período de transição
 */
export class HybridNotificationService {
  /**
   * Publica no sistema novo e replica no legado enquanto a central
   * de notificações ainda consome ambos os modelos.
   */
  static async publishNotification(event: NotificationEvent): Promise<void> {
    await NotificationService.publishNotification(event);
    console.log(`[Hybrid] Notificação ${event.type} publicada no sistema novo`);

    try {
      await this.publishLegacyNotification(event);
      console.log(
        `[Hybrid] Notificação ${event.type} replicada no sistema legado para compatibilidade`,
      );
    } catch (legacyError) {
      console.error(
        "[Hybrid] Falha ao replicar notificação no sistema legado:",
        legacyError,
      );
    }
  }

  /**
   * Publica notificação no sistema legado
   */
  private static async publishLegacyNotification(
    event: NotificationEvent,
  ): Promise<void> {
    try {
      // Mapear evento para formato legado
      const legacyData = this.mapEventToLegacy(event);

      // Criar notificação no sistema legado
      await NotificationMigrationService.createLegacyNotification({
        tenantId: event.tenantId,
        titulo: legacyData.titulo,
        mensagem: legacyData.mensagem,
        tipo: legacyData.tipo,
        prioridade: legacyData.prioridade,
        canais: legacyData.canais,
        userIds: [event.userId],
        dados: event.payload,
        referenciaTipo: event.payload.referenciaTipo,
        referenciaId: event.payload.referenciaId,
      });
    } catch (error) {
      console.error("[Hybrid] Erro ao publicar no sistema legado:", error);
      throw error;
    }
  }

  /**
   * Mapeia evento do novo sistema para formato legado
   */
  private static mapEventToLegacy(event: NotificationEvent): {
    titulo: string;
    mensagem: string;
    tipo: string;
    prioridade: string;
    canais: string[];
  } {
    // Mapear tipo
    const typeMapping: Record<string, string> = {
      "system.notification": "SISTEMA",
      "prazo.expiring": "PRAZO",
      "documento.uploaded": "DOCUMENTO",
      "mensagem.received": "MENSAGEM",
      "financeiro.payment": "FINANCEIRO",
      "general.notification": "OUTRO",
      "processo.created": "SISTEMA",
      "processo.updated": "SISTEMA",
      "processo.status_changed": "SISTEMA",
      "prazo.created": "PRAZO",
      "prazo.updated": "PRAZO",
      "pagamento.paid": "FINANCEIRO",
      "evento.created": "OUTRO",
      "test.simple": "SISTEMA",
    };

    // Mapear urgência
    const urgencyMapping: Record<string, string> = {
      CRITICAL: "CRITICA",
      HIGH: "ALTA",
      MEDIUM: "MEDIA",
      INFO: "BAIXA",
    };

    // Mapear canais
    const channelMapping: Record<string, string> = {
      REALTIME: "IN_APP",
      EMAIL: "EMAIL",
      PUSH: "PUSH",
    };

    // Gerar título e mensagem baseados no tipo
    const { titulo, mensagem } = this.generateLegacyContent(event);

    return {
      titulo,
      mensagem,
      tipo: typeMapping[event.type] || "OUTRO",
      prioridade: urgencyMapping[event.urgency || "MEDIUM"] || "MEDIA",
      canais: event.channels?.map((ch) => channelMapping[ch] || "IN_APP") || [
        "IN_APP",
      ],
    };
  }

  /**
   * Gera conteúdo legado baseado no evento
   */
  private static generateLegacyContent(event: NotificationEvent): {
    titulo: string;
    mensagem: string;
  } {
    const payload = event.payload;

    switch (event.type) {
      case "prazo.expiring":
        return {
          titulo: "Prazo Próximo do Vencimento",
          mensagem: `Prazo "${payload.titulo || "sem título"}" vence em ${payload.diasRestantes || "poucos"} dias.`,
        };
      case "prazo.created":
        return {
          titulo: "Novo Prazo Registrado",
          mensagem: `Prazo "${payload.titulo || "sem título"}" foi vinculado ao processo ${payload.processoNumero || "sem número"}.`,
        };
      case "prazo.updated":
        return {
          titulo: "Prazo Atualizado",
          mensagem: `Prazo "${payload.titulo || "sem título"}" do processo ${payload.processoNumero || "sem número"} foi atualizado.`,
        };

      case "processo.created":
        return {
          titulo: "Novo Processo Criado",
          mensagem: `Processo "${payload.numero || "sem número"}" foi criado com sucesso.`,
        };
      case "processo.updated": {
        const summary =
          payload.changesSummary ||
          payload.additionalChangesSummary ||
          (Array.isArray(payload.changes) ? payload.changes.join(", ") : "");
        const detalhes = summary ? `: ${summary}` : "";

        return {
          titulo: "Processo Atualizado",
          mensagem: `Processo "${payload.numero || "sem número"}" foi atualizado${detalhes}.`,
        };
      }
      case "processo.status_changed": {
        const oldLabel =
          payload.oldStatusLabel || payload.oldStatus || "status anterior";
        const newLabel =
          payload.newStatusLabel ||
          payload.status ||
          payload.newStatus ||
          "novo status";
        const extras = payload.additionalChangesSummary
          ? ` (outras alterações: ${payload.additionalChangesSummary})`
          : "";

        return {
          titulo: "Status do Processo Alterado",
          mensagem: `Processo "${payload.numero || "sem número"}" mudou de ${oldLabel} para ${newLabel}${extras}.`,
        };
      }

      case "pagamento.paid":
        return {
          titulo: "Pagamento Confirmado",
          mensagem: `Pagamento de R$ ${payload.valor || "0,00"} foi confirmado.`,
        };

      case "evento.created":
        return {
          titulo: "Novo Evento Agendado",
          mensagem: `Evento "${payload.titulo || "sem título"}" foi agendado para ${payload.data || "data não informada"}.`,
        };

      default:
        return {
          titulo: payload.titulo || "Notificação",
          mensagem:
            payload.mensagem ||
            payload.message ||
            "Nova notificação disponível.",
        };
    }
  }

  /**
   * O modo legado-only foi removido; a execução oficial é novo + replicação.
   */
  static isUsingNewSystem(): boolean {
    return true;
  }

  /**
   * Migra notificações legadas para o novo sistema
   */
  static async migrateLegacyNotifications(): Promise<{
    migrated: number;
    errors: number;
  }> {
    console.log("[Hybrid] Iniciando migração de notificações legadas...");
    const result =
      await NotificationMigrationService.migrateAllLegacyNotifications();

    if (result.migrated > 0) {
      console.log(
        `[Hybrid] Migração concluída: ${result.migrated} notificações migradas`,
      );
    }

    return result;
  }
}
