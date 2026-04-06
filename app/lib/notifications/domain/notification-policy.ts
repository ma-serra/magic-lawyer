import type { NotificationUrgency } from "../notification-service";

/**
 * Policy para definir regras de negócio de notificações
 * Centraliza validações, urgências, canais e campos obrigatórios
 */
export class NotificationPolicy {
  /**
   * Retorna urgência padrão para um tipo de evento
   */
  static getDefaultUrgency(eventType: string): NotificationUrgency {
    // Reutiliza o mapeamento centralizado
    const urgencyMap = this.getDefaultUrgencyMap();

    return urgencyMap[eventType] || "MEDIUM";
  }

  /**
   * Retorna canais padrão para um tipo de evento baseado na urgência
   */
  static getDefaultChannels(
    eventType: string,
    urgency?: NotificationUrgency,
  ): Array<"REALTIME" | "EMAIL" | "TELEGRAM" | "PUSH"> {
    const effectiveUrgency = urgency || this.getDefaultUrgency(eventType);

    // CRÍTICOS: sempre REALTIME + EMAIL
    if (effectiveUrgency === "CRITICAL") {
      return ["REALTIME", "EMAIL"];
    }

    // ALTOS: REALTIME + EMAIL (email configurável)
    if (effectiveUrgency === "HIGH") {
      return ["REALTIME", "EMAIL"];
    }

    // MÉDIOS: apenas REALTIME (email opcional por preferência)
    if (effectiveUrgency === "MEDIUM") {
      return ["REALTIME"];
    }

    // INFORMATIVOS: apenas REALTIME (sem email)
    return ["REALTIME"];
  }

  /**
   * Retorna campos obrigatórios do payload para um tipo de evento
   */
  static getRequiredFields(eventType: string): string[] {
    const requiredFieldsMap: Record<string, string[]> = {
      // PROCESSOS
      "processo.created": ["processoId", "numero", "clienteNome"],
      "processo.updated": ["processoId", "numero"],
      "processo.status_changed": [
        "processoId",
        "numero",
        "oldStatus",
        "newStatus",
      ],
      "processo.document_uploaded": [
        "processoId",
        "numero",
        "documentoId",
        "documentoNome",
      ],

      // PRAZOS
      "prazo.created": [
        "prazoId",
        "processoId",
        "processoNumero",
        "clienteNome",
        "titulo",
        "dataVencimento",
      ],
      "prazo.updated": [
        "prazoId",
        "processoId",
        "processoNumero",
        "clienteNome",
        "titulo",
      ],
      "prazo.digest_30d": [
        "diasRestantes",
        "digestDate",
        "digestKey",
        "totalPrazos",
        "resumoPrazos",
      ],
      "prazo.digest_10d": [
        "diasRestantes",
        "digestDate",
        "digestKey",
        "totalPrazos",
        "resumoPrazos",
      ],
      "prazo.expiring_7d": [
        "prazoId",
        "processoId",
        "processoNumero",
        "clienteNome",
        "titulo",
        "dataVencimento",
      ],
      "prazo.expiring_3d": [
        "prazoId",
        "processoId",
        "processoNumero",
        "clienteNome",
        "titulo",
        "dataVencimento",
      ],
      "prazo.expiring_1d": [
        "prazoId",
        "processoId",
        "processoNumero",
        "clienteNome",
        "titulo",
        "dataVencimento",
      ],
      "prazo.expiring_2h": [
        "prazoId",
        "processoId",
        "processoNumero",
        "clienteNome",
        "titulo",
        "dataVencimento",
      ],
      "prazo.expired": [
        "prazoId",
        "processoId",
        "processoNumero",
        "clienteNome",
        "titulo",
        "dataVencimento",
      ],

      // ANDAMENTOS
      "andamento.created": [
        "andamentoId",
        "processoId",
        "processoNumero",
        "titulo",
      ],
      "andamento.updated": [
        "andamentoId",
        "processoId",
        "processoNumero",
        "titulo",
      ],
      // MOVIMENTAÇÕES (alias de andamentos - MovimentacaoProcesso)
      "movimentacao.created": [
        "movimentacaoId",
        "processoId",
        "processoNumero",
        "titulo",
      ],
      "movimentacao.updated": [
        "movimentacaoId",
        "processoId",
        "processoNumero",
        "titulo",
      ],

      // CLIENTES
      "cliente.created": ["clienteId", "nome"],
      "cliente.updated": ["clienteId", "nome"],
      "cliente.document_uploaded": [
        "clienteId",
        "nome",
        "documentoId",
        "documentoNome",
      ],
      "cliente.contact_added": ["clienteId", "nome", "contatoTipo"],

      // ADVOGADOS
      "advogado.created": ["advogadoId", "nome"],
      "advogado.updated": ["advogadoId", "nome"],
      "advogado.avatar_updated": ["advogadoId", "nome"],
      "advogado.permissions_changed": [
        "advogadoId",
        "nome",
        "oldPermissions",
        "newPermissions",
      ],

      // EQUIPE
      "equipe.cargo_created": ["cargoId", "cargoNome"],
      "equipe.cargo_updated": ["cargoId", "cargoNome"],
      "equipe.user_invited": ["userId", "email", "role"],
      "equipe.user_joined": ["userId", "nome", "role"],
      "equipe.permissions_changed": [
        "userId",
        "nome",
        "oldPermissions",
        "newPermissions",
      ],
      "equipe.user_removed": ["userId", "nome", "role"],

      // CONTRATOS
      "contrato.created": ["contratoId", "clienteId", "clienteNome"],
      "contrato.updated": ["contratoId", "clienteId"],
      "contrato.status_changed": ["contratoId", "oldStatus", "newStatus"],
      "contrato.signature_pending": [
        "contratoId",
        "clienteId",
        "clienteNome",
        "dataVencimento",
      ],
      "contrato.signed": [
        "contratoId",
        "clienteId",
        "clienteNome",
        "dataAssinatura",
      ],
      "contrato.expired": ["contratoId", "clienteId", "clienteNome"],
      "contrato.expiring": [
        "contratoId",
        "clienteId",
        "clienteNome",
        "dataFim",
        "diasRestantes",
      ],
      "contrato.cancelled": ["contratoId", "clienteId", "clienteNome"],

      // PAGAMENTOS
      "pagamento.created": ["pagamentoId", "valor", "metodo"],
      "pagamento.paid": ["pagamentoId", "valor", "metodo", "dataPagamento"],
      "pagamento.failed": ["pagamentoId", "valor", "motivo"],
      "pagamento.overdue": ["pagamentoId", "valor", "diasAtraso"],
      "pagamento.estornado": ["pagamentoId", "valor", "dataEstorno"],
      "boleto.generated": ["pagamentoId", "boletoId", "valor", "vencimento"],
      "pix.generated": ["pagamentoId", "valor", "qrCode"],

      // HONORÁRIOS
      "honorario.created": ["honorarioId", "contratoId", "valor"],
      "honorario.updated": ["honorarioId", "contratoId"],
      "honorario.paid": ["honorarioId", "contratoId", "valor", "dataPagamento"],

      // AGENDA
      "evento.created": ["eventoId", "titulo", "dataInicio"],
      "evento.updated": ["eventoId", "titulo"],
      "evento.cancelled": ["eventoId", "titulo"],
      "evento.confirmation_updated": [
        "eventoId",
        "titulo",
        "confirmacaoStatus",
      ],
      "evento.reminder_1h": ["eventoId", "titulo", "dataInicio"],
      "evento.reminder_1d": ["eventoId", "titulo", "dataInicio"],
      "evento.reminder_custom": ["eventoId", "titulo", "dataInicio"],
      "evento.google_synced": ["eventoId", "titulo", "googleEventId"],

      // DOCUMENTOS
      "documento.uploaded": ["documentoId", "nome"],
      "documento.approved": ["documentoId", "nome", "aprovadoPor"],
      "documento.rejected": ["documentoId", "nome", "motivo"],
      "documento.expired": ["documentoId", "nome", "dataExpiracao"],

      // MODELOS
      "modelo.created": ["modeloId", "nome", "tipo"],
      "modelo.updated": ["modeloId", "nome"],
      "modelo.used": ["modeloId", "nome", "processoId"],

      // PROCURAÇÕES
      "procuracao.created": ["procuracaoId", "numero"],
      "procuracao.updated": ["procuracaoId", "numero"],
      "procuracao.signed": ["procuracaoId", "numero", "dataAssinatura"],
      "procuracao.expired": ["procuracaoId", "numero", "dataExpiracao"],
      "procuracao.revogada": ["procuracaoId", "numero", "dataRevogacao"],

      // JUIZES
      "juiz.created": ["juizId", "nome"],
      "juiz.updated": ["juizId", "nome"],
      "juiz.favorited": ["juizId", "nome", "userId"],
      "juiz.unfavorited": ["juizId", "nome", "userId"],

      // TAREFAS
      "tarefa.created": ["tarefaId", "titulo"],
      "tarefa.updated": ["tarefaId", "titulo"],
      "tarefa.assigned": [
        "tarefaId",
        "titulo",
        "responsavelId",
        "responsavelNome",
      ],
      "tarefa.completed": [
        "tarefaId",
        "titulo",
        "responsavelId",
        "responsavelNome",
      ],
      "tarefa.moved": ["tarefaId", "titulo", "oldStatus", "newStatus"],
      "tarefa.cancelled": ["tarefaId", "titulo"],

      // RELATÓRIOS
      "relatorio.generated": ["relatorioId", "tipo", "dataGeracao"],
      "relatorio.exported": ["relatorioId", "tipo", "formato"],
      "relatorio.scheduled": ["relatorioId", "tipo", "dataAgendamento"],
      "relatorio.failed": ["relatorioId", "tipo", "erro"],
      // ACESSO
      "access.login_new": ["ipAddress", "locationLabel", "loggedAt"],
    };

    return requiredFieldsMap[eventType] || [];
  }

  /**
   * Retorna lista de tipos de eventos válidos
   */
  static getValidEventTypes(): string[] {
    // Retorna todos os tipos que têm definição de campos obrigatórios ou urgência padrão
    const typesFromRequiredFields = Object.keys(
      this.getRequiredFieldsMapping(),
    );
    const typesFromUrgency = Object.keys(this.getDefaultUrgencyMap());

    // Unir ambos e remover duplicatas
    return Array.from(
      new Set([...typesFromRequiredFields, ...typesFromUrgency]),
    );
  }

  /**
   * Mapeamento interno de urgência padrão (reutilizado de getDefaultUrgency)
   */
  private static getDefaultUrgencyMap(): Record<string, NotificationUrgency> {
    return {
      // CRÍTICOS
      "prazo.expired": "CRITICAL",
      "prazo.expiring_2h": "CRITICAL",
      "prazo.expiring_1d": "CRITICAL",
      "pagamento.overdue": "CRITICAL",
      "pagamento.failed": "CRITICAL",
      "contrato.expired": "CRITICAL",
      "contrato.expiring": "HIGH",
      "procuracao.expired": "CRITICAL",
      "sistema.critical_error": "CRITICAL",
      // ALTOS
      "prazo.digest_10d": "HIGH",
      "prazo.expiring_3d": "HIGH",
      "prazo.expiring_7d": "HIGH",
      "prazo.created": "HIGH",
      "contrato.signature_pending": "HIGH",
      "contrato.signed": "HIGH",
      "contrato.status_changed": "HIGH",
      "contrato.cancelled": "HIGH",
      "pagamento.paid": "HIGH",
      "pagamento.estornado": "HIGH",
      "honorario.paid": "HIGH",
      "processo.status_changed": "HIGH",
      "documento.rejected": "HIGH",
      "evento.cancelled": "HIGH",
      "evento.reminder_1h": "HIGH",
      "evento.reminder_custom": "HIGH",
      "equipe.user_invited": "HIGH",
      "equipe.permissions_changed": "HIGH",
      "equipe.user_removed": "HIGH",
      "advogado.permissions_changed": "HIGH",
      "relatorio.failed": "HIGH",
      "access.login_new": "HIGH",
      // MÉDIOS e INFORMATIVOS (todos os outros do getRequiredFields)
      "prazo.digest_30d": "MEDIUM",
      "processo.created": "MEDIUM",
      "processo.updated": "MEDIUM",
      "processo.document_uploaded": "MEDIUM",
      "andamento.created": "MEDIUM",
      "andamento.updated": "MEDIUM",
      "movimentacao.created": "MEDIUM",
      "movimentacao.updated": "MEDIUM",
      "cliente.created": "MEDIUM",
      "cliente.updated": "MEDIUM",
      "cliente.document_uploaded": "MEDIUM",
      "advogado.created": "MEDIUM",
      "advogado.updated": "MEDIUM",
      "contrato.created": "MEDIUM",
      "contrato.updated": "MEDIUM",
      "pagamento.created": "MEDIUM",
      "boleto.generated": "MEDIUM",
      "pix.generated": "MEDIUM",
      "honorario.created": "MEDIUM",
      "honorario.updated": "MEDIUM",
      "evento.created": "MEDIUM",
      "evento.updated": "MEDIUM",
      "evento.confirmation_updated": "MEDIUM",
      "evento.reminder_1d": "MEDIUM",
      "documento.uploaded": "MEDIUM",
      "documento.approved": "MEDIUM",
      "documento.expired": "MEDIUM",
      "tarefa.created": "MEDIUM",
      "tarefa.updated": "MEDIUM",
      "tarefa.assigned": "MEDIUM",
      "tarefa.completed": "MEDIUM",
      "tarefa.moved": "MEDIUM",
      "tarefa.cancelled": "MEDIUM",
      "relatorio.generated": "MEDIUM",
      "relatorio.scheduled": "MEDIUM",
      "procuracao.created": "MEDIUM",
      "procuracao.updated": "MEDIUM",
      "procuracao.signed": "MEDIUM",
      "procuracao.revogada": "MEDIUM",
      "equipe.cargo_created": "MEDIUM",
      "equipe.cargo_updated": "MEDIUM",
      "equipe.user_joined": "MEDIUM",
      // INFORMATIVOS
      "cliente.contact_added": "INFO",
      "advogado.avatar_updated": "INFO",
      "evento.google_synced": "INFO",
      "modelo.created": "INFO",
      "modelo.updated": "INFO",
      "modelo.used": "INFO",
      "juiz.created": "INFO",
      "juiz.updated": "INFO",
      "juiz.favorited": "INFO",
      "juiz.unfavorited": "INFO",
      "relatorio.exported": "INFO",
    };
  }

  /**
   * Mapeamento interno de campos obrigatórios (completo)
   */
  private static getRequiredFieldsMapping(): Record<string, string[]> {
    return {
      // PROCESSOS
      "processo.created": ["processoId", "numero", "clienteNome"],
      "processo.updated": ["processoId", "numero"],
      "processo.status_changed": [
        "processoId",
        "numero",
        "oldStatus",
        "newStatus",
      ],
      "processo.document_uploaded": [
        "processoId",
        "numero",
        "documentoId",
        "documentoNome",
      ],
      // PRAZOS
      "prazo.created": [
        "prazoId",
        "processoId",
        "processoNumero",
        "clienteNome",
        "titulo",
        "dataVencimento",
      ],
      "prazo.updated": [
        "prazoId",
        "processoId",
        "processoNumero",
        "clienteNome",
        "titulo",
      ],
      "prazo.digest_30d": [
        "diasRestantes",
        "digestDate",
        "digestKey",
        "totalPrazos",
        "resumoPrazos",
      ],
      "prazo.digest_10d": [
        "diasRestantes",
        "digestDate",
        "digestKey",
        "totalPrazos",
        "resumoPrazos",
      ],
      "prazo.expiring_7d": [
        "prazoId",
        "processoId",
        "processoNumero",
        "clienteNome",
        "titulo",
        "dataVencimento",
      ],
      "prazo.expiring_3d": [
        "prazoId",
        "processoId",
        "processoNumero",
        "clienteNome",
        "titulo",
        "dataVencimento",
      ],
      "prazo.expiring_1d": [
        "prazoId",
        "processoId",
        "processoNumero",
        "clienteNome",
        "titulo",
        "dataVencimento",
      ],
      "prazo.expiring_2h": [
        "prazoId",
        "processoId",
        "processoNumero",
        "clienteNome",
        "titulo",
        "dataVencimento",
      ],
      "prazo.expired": [
        "prazoId",
        "processoId",
        "processoNumero",
        "clienteNome",
        "titulo",
        "dataVencimento",
      ],
      // ANDAMENTOS
      "andamento.created": [
        "andamentoId",
        "processoId",
        "processoNumero",
        "titulo",
      ],
      "andamento.updated": [
        "andamentoId",
        "processoId",
        "processoNumero",
        "titulo",
      ],
      // CLIENTES
      "cliente.created": ["clienteId", "nome"],
      "cliente.updated": ["clienteId", "nome"],
      "cliente.document_uploaded": [
        "clienteId",
        "nome",
        "documentoId",
        "documentoNome",
      ],
      "cliente.contact_added": ["clienteId", "nome", "contatoTipo"],
      // ADVOGADOS
      "advogado.created": ["advogadoId", "nome"],
      "advogado.updated": ["advogadoId", "nome"],
      "advogado.avatar_updated": ["advogadoId", "nome"],
      "advogado.permissions_changed": [
        "advogadoId",
        "nome",
        "oldPermissions",
        "newPermissions",
      ],
      // EQUIPE
      "equipe.cargo_created": ["cargoId", "cargoNome"],
      "equipe.cargo_updated": ["cargoId", "cargoNome"],
      "equipe.user_invited": ["userId", "email", "role"],
      "equipe.user_joined": ["userId", "nome", "role"],
      "equipe.permissions_changed": [
        "userId",
        "nome",
        "oldPermissions",
        "newPermissions",
      ],
      "equipe.user_removed": ["userId", "nome", "role"],
      // CONTRATOS
      "contrato.created": ["contratoId", "clienteId", "clienteNome"],
      "contrato.updated": ["contratoId", "clienteId"],
      "contrato.status_changed": ["contratoId", "oldStatus", "newStatus"],
      "contrato.signature_pending": [
        "contratoId",
        "clienteId",
        "clienteNome",
        "dataVencimento",
      ],
      "contrato.signed": [
        "contratoId",
        "clienteId",
        "clienteNome",
        "dataAssinatura",
      ],
      "contrato.expired": ["contratoId", "clienteId", "clienteNome"],
      "contrato.expiring": [
        "contratoId",
        "clienteId",
        "clienteNome",
        "dataFim",
        "diasRestantes",
      ],
      "contrato.cancelled": ["contratoId", "clienteId", "clienteNome"],
      // PAGAMENTOS
      "pagamento.created": ["pagamentoId", "valor", "metodo"],
      "pagamento.paid": ["pagamentoId", "valor", "metodo", "dataPagamento"],
      "pagamento.failed": ["pagamentoId", "valor", "motivo"],
      "pagamento.overdue": ["pagamentoId", "valor", "diasAtraso"],
      "pagamento.estornado": ["pagamentoId", "valor", "dataEstorno"],
      "boleto.generated": ["pagamentoId", "boletoId", "valor", "vencimento"],
      "pix.generated": ["pagamentoId", "valor", "qrCode"],
      // HONORÁRIOS
      "honorario.created": ["honorarioId", "contratoId", "valor"],
      "honorario.updated": ["honorarioId", "contratoId"],
      "honorario.paid": ["honorarioId", "contratoId", "valor", "dataPagamento"],
      // AGENDA
      "evento.created": ["eventoId", "titulo", "dataInicio"],
      "evento.updated": ["eventoId", "titulo"],
      "evento.cancelled": ["eventoId", "titulo"],
      "evento.confirmation_updated": [
        "eventoId",
        "titulo",
        "confirmacaoStatus",
      ],
      "evento.reminder_1h": ["eventoId", "titulo", "dataInicio"],
      "evento.reminder_1d": ["eventoId", "titulo", "dataInicio"],
      "evento.reminder_custom": ["eventoId", "titulo", "dataInicio"],
      "evento.google_synced": ["eventoId", "titulo", "googleEventId"],
      // DOCUMENTOS
      "documento.uploaded": ["documentoId", "nome"],
      "documento.approved": ["documentoId", "nome", "aprovadoPor"],
      "documento.rejected": ["documentoId", "nome", "motivo"],
      "documento.expired": ["documentoId", "nome", "dataExpiracao"],
      // MODELOS
      "modelo.created": ["modeloId", "nome", "tipo"],
      "modelo.updated": ["modeloId", "nome"],
      "modelo.used": ["modeloId", "nome", "processoId"],
      // PROCURAÇÕES
      "procuracao.created": ["procuracaoId", "numero"],
      "procuracao.updated": ["procuracaoId", "numero"],
      "procuracao.signed": ["procuracaoId", "numero", "dataAssinatura"],
      "procuracao.expired": ["procuracaoId", "numero", "dataExpiracao"],
      "procuracao.revogada": ["procuracaoId", "numero", "dataRevogacao"],
      // JUIZES
      "juiz.created": ["juizId", "nome"],
      "juiz.updated": ["juizId", "nome"],
      "juiz.favorited": ["juizId", "nome", "userId"],
      "juiz.unfavorited": ["juizId", "nome", "userId"],
      // TAREFAS
      "tarefa.created": ["tarefaId", "titulo"],
      "tarefa.updated": ["tarefaId", "titulo"],
      "tarefa.assigned": [
        "tarefaId",
        "titulo",
        "responsavelId",
        "responsavelNome",
      ],
      "tarefa.completed": [
        "tarefaId",
        "titulo",
        "responsavelId",
        "responsavelNome",
      ],
      "tarefa.moved": ["tarefaId", "titulo", "oldStatus", "newStatus"],
      "tarefa.cancelled": ["tarefaId", "titulo"],
      // RELATÓRIOS
      "relatorio.generated": ["relatorioId", "tipo", "dataGeracao"],
      "relatorio.exported": ["relatorioId", "tipo", "formato"],
      "relatorio.scheduled": ["relatorioId", "tipo", "dataAgendamento"],
      "relatorio.failed": ["relatorioId", "tipo", "erro"],
      // ACESSO
      "access.login_new": ["ipAddress", "locationLabel", "loggedAt"],
    };
  }

  /**
   * Verifica se um evento crítico pode ser desabilitado pelo usuário
   */
  static canDisableEvent(eventType: string): boolean {
    const urgency = this.getDefaultUrgency(eventType);

    // Eventos críticos não podem ser desabilitados
    return urgency !== "CRITICAL";
  }

  static shouldMirrorToTelegram(
    eventType: string,
    urgency: NotificationUrgency,
  ): boolean {
    if (urgency === "CRITICAL" || urgency === "HIGH") {
      return true;
    }

    return [
      "processo.",
      "prazo.",
      "andamento.",
      "movimentacao.",
      "documento.",
    ].some((prefix) => eventType.startsWith(prefix));
  }

  /**
   * Retorna prioridade na fila baseada na urgência
   */
  static getQueuePriority(urgency: NotificationUrgency): number {
    const priorityMap: Record<NotificationUrgency, number> = {
      CRITICAL: 1,
      HIGH: 2,
      MEDIUM: 3,
      INFO: 4,
    };

    return priorityMap[urgency];
  }
}
