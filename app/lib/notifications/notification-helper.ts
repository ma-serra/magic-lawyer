import { NotificationService } from "./notification-service";

/**
 * Helper para facilitar o uso do serviço de notificações
 */
export class NotificationHelper {
  /**
   * Notifica sobre criação de processo
   */
  static async notifyProcessoCreated(
    tenantId: string,
    userId: string,
    payload: {
      processoId: string;
      numero: string;
      cliente: string;
      advogado?: string;
    },
  ): Promise<void> {
    await NotificationService.publishNotification({
      type: "processo.created",
      tenantId,
      userId,
      payload: {
        ...payload,
        clienteNome: payload.cliente,
      },
      urgency: "MEDIUM",
    });
  }

  /**
   * Notifica sobre prazo próximo do vencimento
   */
  static async notifyPrazoExpiring(
    tenantId: string,
    userId: string,
    payload: {
      prazoId: string;
      processoId: string;
      numero: string;
      descricao: string;
      vencimento: string;
      diasRestantes: number;
    },
    urgency: "CRITICAL" | "HIGH" | "MEDIUM" = "HIGH",
  ): Promise<void> {
    const eventType = this.getPrazoEventType(payload.diasRestantes);

    await NotificationService.publishNotification({
      type: eventType,
      tenantId,
      userId,
      payload,
      urgency,
    });
  }

  /**
   * Notifica sobre prazo vencido
   */
  static async notifyPrazoExpired(
    tenantId: string,
    userId: string,
    payload: {
      prazoId: string;
      processoId: string;
      numero: string;
      descricao: string;
      vencimento: string;
    },
  ): Promise<void> {
    await NotificationService.publishNotification({
      type: "prazo.expired",
      tenantId,
      userId,
      payload,
      urgency: "CRITICAL",
    });
  }

  /**
   * Notifica sobre criação de cliente
   */
  static async notifyClienteCreated(
    tenantId: string,
    userId: string,
    payload: {
      clienteId: string;
      nome: string;
      documento: string;
      advogado?: string;
    },
  ): Promise<void> {
    await NotificationService.publishNotification({
      type: "cliente.created",
      tenantId,
      userId,
      payload,
      urgency: "MEDIUM",
    });
  }

  /**
   * Notifica sobre criação de contrato
   */
  static async notifyContratoCreated(
    tenantId: string,
    userId: string,
    payload: {
      contratoId: string;
      numero: string;
      cliente: string;
      valor: number;
      advogado?: string;
    },
  ): Promise<void> {
    await NotificationService.publishNotification({
      type: "contrato.created",
      tenantId,
      userId,
      payload,
      urgency: "MEDIUM",
    });
  }

  /**
   * Notifica sobre contrato assinado
   */
  static async notifyContratoSigned(
    tenantId: string,
    userId: string,
    payload: {
      contratoId: string;
      numero: string;
      cliente: string;
      assinadoPor: string;
    },
  ): Promise<void> {
    await NotificationService.publishNotification({
      type: "contrato.signed",
      tenantId,
      userId,
      payload,
      urgency: "HIGH",
    });
  }

  /**
   * Notifica sobre pagamento confirmado
   */
  static async notifyPagamentoPaid(
    tenantId: string,
    userId: string,
    payload: {
      pagamentoId: string;
      valor: number;
      formaPagamento: string;
      cliente: string;
      contrato?: string;
    },
  ): Promise<void> {
    await NotificationService.publishNotification({
      type: "pagamento.paid",
      tenantId,
      userId,
      payload,
      urgency: "HIGH",
    });
  }

  /**
   * Notifica sobre pagamento em atraso
   */
  static async notifyPagamentoOverdue(
    tenantId: string,
    userId: string,
    payload: {
      pagamentoId: string;
      valor: number;
      cliente: string;
      diasAtraso: number;
      contrato?: string;
    },
  ): Promise<void> {
    await NotificationService.publishNotification({
      type: "pagamento.overdue",
      tenantId,
      userId,
      payload,
      urgency: "CRITICAL",
    });
  }

  /**
   * Notifica sobre criação de evento
   */
  static async notifyEventoCreated(
    tenantId: string,
    userId: string,
    payload: {
      eventoId: string;
      titulo: string;
      data: string;
      hora: string;
      tipo: string;
      participantes: string[];
    },
  ): Promise<void> {
    await NotificationService.publishNotification({
      type: "evento.created",
      tenantId,
      userId,
      payload,
      urgency: "MEDIUM",
    });
  }

  /**
   * Notifica sobre lembrete de evento
   */
  static async notifyEventoReminder(
    tenantId: string,
    userId: string,
    payload: {
      eventoId: string;
      titulo: string;
      data: string;
      hora: string;
      minutosRestantes: number;
    },
    reminderType: "1h" | "1d" = "1h",
  ): Promise<void> {
    await NotificationService.publishNotification({
      type: `evento.reminder_${reminderType}`,
      tenantId,
      userId,
      payload,
      urgency: reminderType === "1h" ? "HIGH" : "MEDIUM",
    });
  }

  /**
   * Notifica sobre convite de equipe
   */
  static async notifyEquipeUserInvited(
    tenantId: string,
    userId: string,
    payload: {
      conviteId: string;
      email: string;
      nome?: string;
      cargo?: string;
      enviadoPor: string;
    },
  ): Promise<void> {
    await NotificationService.publishNotification({
      type: "equipe.user_invited",
      tenantId,
      userId,
      payload,
      urgency: "MEDIUM",
    });
  }

  /**
   * Notifica sobre novo membro da equipe
   */
  static async notifyEquipeUserJoined(
    tenantId: string,
    userId: string,
    payload: {
      usuarioId: string;
      nome: string;
      email: string;
      cargo?: string;
    },
  ): Promise<void> {
    await NotificationService.publishNotification({
      type: "equipe.user_joined",
      tenantId,
      userId,
      payload,
      urgency: "MEDIUM",
    });
  }

  /**
   * Notifica sobre mudança de permissões
   */
  static async notifyEquipePermissionsChanged(
    tenantId: string,
    userId: string,
    payload: {
      usuarioId: string;
      nome: string;
      permissoesAntigas: string[];
      permissoesNovas: string[];
      alteradoPor: string;
    },
  ): Promise<void> {
    await NotificationService.publishNotification({
      type: "equipe.permissions_changed",
      tenantId,
      userId,
      payload: {
        userId: payload.usuarioId,
        nome: payload.nome,
        oldPermissions: payload.permissoesAntigas,
        newPermissions: payload.permissoesNovas,
        alteradoPor: payload.alteradoPor,
      },
      urgency: "HIGH",
    });
  }

  /**
   * Notifica sobre remoção de usuário da equipe
   */
  static async notifyEquipeUserRemoved(
    tenantId: string,
    userId: string,
    payload: {
      usuarioId: string;
      nome: string;
      role: string;
      motivo: string;
      removidoPor: string;
    },
  ): Promise<void> {
    await NotificationService.publishNotification({
      type: "equipe.user_removed",
      tenantId,
      userId,
      payload,
      urgency: "MEDIUM",
    });
  }

  /**
   * Notifica sobre criação de tarefa
   */
  static async notifyTarefaCreated(
    tenantId: string,
    userId: string,
    payload: {
      tarefaId: string;
      titulo: string;
      descricao?: string;
      categoria?: string;
      atribuidoPara?: string;
      criadoPor: string;
    },
  ): Promise<void> {
    await NotificationService.publishNotification({
      type: "tarefa.created",
      tenantId,
      userId,
      payload,
      urgency: "MEDIUM",
    });
  }

  /**
   * Notifica sobre tarefa atribuída
   */
  static async notifyTarefaAssigned(
    tenantId: string,
    userId: string,
    payload: {
      tarefaId: string;
      titulo: string;
      atribuidoPara: string;
      atribuidoPor: string;
    },
  ): Promise<void> {
    await NotificationService.publishNotification({
      type: "tarefa.assigned",
      tenantId,
      userId,
      payload,
      urgency: "MEDIUM",
    });
  }

  /**
   * Notifica sobre tarefa concluída
   */
  static async notifyTarefaCompleted(
    tenantId: string,
    userId: string,
    payload: {
      tarefaId: string;
      titulo: string;
      concluidoPor: string;
      tempoGasto?: number;
    },
  ): Promise<void> {
    await NotificationService.publishNotification({
      type: "tarefa.completed",
      tenantId,
      userId,
      payload,
      urgency: "MEDIUM",
    });
  }

  /**
   * Notifica sobre relatório gerado
   */
  static async notifyRelatorioGenerated(
    tenantId: string,
    userId: string,
    payload: {
      relatorioId: string;
      tipo: string;
      nome: string;
      formato: string;
      tamanho: number;
      geradoPor: string;
    },
  ): Promise<void> {
    await NotificationService.publishNotification({
      type: "relatorio.generated",
      tenantId,
      userId,
      payload,
      urgency: "MEDIUM",
    });
  }

  /**
   * Notifica sobre falha na geração de relatório
   */
  static async notifyRelatorioFailed(
    tenantId: string,
    userId: string,
    payload: {
      relatorioId: string;
      tipo: string;
      nome: string;
      erro: string;
      geradoPor: string;
    },
  ): Promise<void> {
    await NotificationService.publishNotification({
      type: "relatorio.failed",
      tenantId,
      userId,
      payload,
      urgency: "HIGH",
    });
  }

  /**
   * Notifica sobre upload de documento
   */
  static async notifyDocumentoUploaded(
    tenantId: string,
    userId: string,
    payload: {
      documentoId: string;
      nome: string;
      tipo: string;
      tamanho: number;
      processoId?: string;
      clienteId?: string;
      uploadadoPor: string;
    },
  ): Promise<void> {
    await NotificationService.publishNotification({
      type: "documento.uploaded",
      tenantId,
      userId,
      payload,
      urgency: "MEDIUM",
    });
  }

  /**
   * Notifica sobre aprovação de documento
   */
  static async notifyDocumentoApproved(
    tenantId: string,
    userId: string,
    payload: {
      documentoId: string;
      nome: string;
      aprovadoPor: string;
      observacoes?: string;
    },
  ): Promise<void> {
    await NotificationService.publishNotification({
      type: "documento.approved",
      tenantId,
      userId,
      payload,
      urgency: "MEDIUM",
    });
  }

  /**
   * Notifica sobre rejeição de documento
   */
  static async notifyDocumentoRejected(
    tenantId: string,
    userId: string,
    payload: {
      documentoId: string;
      nome: string;
      rejeitadoPor: string;
      motivo: string;
    },
  ): Promise<void> {
    await NotificationService.publishNotification({
      type: "documento.rejected",
      tenantId,
      userId,
      payload,
      urgency: "HIGH",
    });
  }

  /**
   * Notifica sobre expiração de documento
   */
  static async notifyDocumentoExpired(
    tenantId: string,
    userId: string,
    payload: {
      documentoId: string;
      nome: string;
      dataExpiracao?: string;
      processoId?: string;
      processoNumero?: string;
    },
  ): Promise<void> {
    await NotificationService.publishNotification({
      type: "documento.expired",
      tenantId,
      userId,
      payload,
      urgency: "MEDIUM",
    });
  }

  private static getPrazoEventType(diasRestantes: number): string {
    switch (diasRestantes) {
      case 7:
        return "prazo.expiring_7d";
      case 3:
        return "prazo.expiring_3d";
      case 1:
        return "prazo.expiring_1d";
      default:
        return "prazo.expiring";
    }
  }
}
