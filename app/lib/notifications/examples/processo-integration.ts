import { HybridNotificationService } from "@/app/lib/notifications/hybrid-notification-service";
import { NotificationEvent } from "@/app/lib/notifications/types";

/**
 * Exemplo de integração do sistema híbrido em um módulo existente
 * Este arquivo demonstra como migrar gradualmente do sistema legado para o novo
 */

export class ProcessoNotificationIntegration {
  /**
   * Notifica quando um processo é criado
   * Usa o sistema híbrido para compatibilidade durante a transição
   */
  static async notifyProcessoCreated(data: {
    processoId: string;
    numero: string;
    tenantId: string;
    userId: string;
    clienteNome?: string;
    advogadoNome?: string;
  }): Promise<void> {
    const event: NotificationEvent = {
      type: "processo.created",
      tenantId: data.tenantId,
      userId: data.userId,
      payload: {
        processoId: data.processoId,
        numero: data.numero,
        cliente: data.clienteNome,
        clienteNome: data.clienteNome,
        advogado: data.advogadoNome,
        advogadoNome: data.advogadoNome,
        titulo: "Novo Processo Criado",
        mensagem: `Processo ${data.numero} foi criado com sucesso.`,
        referenciaTipo: "processo",
        referenciaId: data.processoId,
      },
      urgency: "MEDIUM",
      channels: ["REALTIME"],
    };

    await HybridNotificationService.publishNotification(event);
  }

  /**
   * Notifica quando um prazo está próximo do vencimento
   */
  static async notifyPrazoExpiring(data: {
    prazoId: string;
    processoId: string;
    processoNumero: string;
    titulo: string;
    diasRestantes: number;
    tenantId: string;
    userId: string;
  }): Promise<void> {
    const urgency =
      data.diasRestantes <= 1
        ? "CRITICAL"
        : data.diasRestantes <= 3
          ? "HIGH"
          : "MEDIUM";

    const event: NotificationEvent = {
      type: "prazo.expiring",
      tenantId: data.tenantId,
      userId: data.userId,
      payload: {
        prazoId: data.prazoId,
        processoId: data.processoId,
        processoNumero: data.processoNumero,
        tituloOriginal: data.titulo,
        diasRestantes: data.diasRestantes,
        titulo: `Prazo Próximo do Vencimento`,
        mensagem: `Prazo "${data.titulo}" do processo ${data.processoNumero} vence em ${data.diasRestantes} dias.`,
        referenciaTipo: "prazo",
        referenciaId: data.prazoId,
      },
      urgency,
      channels: ["REALTIME", "EMAIL"], // Email para prazos críticos
    };

    await HybridNotificationService.publishNotification(event);
  }

  /**
   * Notifica quando um documento é enviado
   */
  static async notifyDocumentoUploaded(data: {
    documentoId: string;
    processoId: string;
    processoNumero: string;
    nomeArquivo: string;
    tenantId: string;
    userId: string;
  }): Promise<void> {
    const event: NotificationEvent = {
      type: "documento.uploaded",
      tenantId: data.tenantId,
      userId: data.userId,
      payload: {
        documentoId: data.documentoId,
        processoId: data.processoId,
        processoNumero: data.processoNumero,
        nomeArquivo: data.nomeArquivo,
        titulo: "Novo Documento Enviado",
        mensagem: `Documento "${data.nomeArquivo}" foi enviado para o processo ${data.processoNumero}.`,
        referenciaTipo: "documento",
        referenciaId: data.documentoId,
      },
      urgency: "MEDIUM",
      channels: ["REALTIME"],
    };

    await HybridNotificationService.publishNotification(event);
  }

  /**
   * Notifica quando um pagamento é confirmado
   */
  static async notifyPagamentoPaid(data: {
    pagamentoId: string;
    valor: number;
    processoId?: string;
    processoNumero?: string;
    tenantId: string;
    userId: string;
  }): Promise<void> {
    const event: NotificationEvent = {
      type: "pagamento.paid",
      tenantId: data.tenantId,
      userId: data.userId,
      payload: {
        pagamentoId: data.pagamentoId,
        valor: data.valor,
        processoId: data.processoId,
        processoNumero: data.processoNumero,
        titulo: "Pagamento Confirmado",
        mensagem: `Pagamento de R$ ${data.valor.toFixed(2)} foi confirmado${data.processoNumero ? ` para o processo ${data.processoNumero}` : ""}.`,
        referenciaTipo: "pagamento",
        referenciaId: data.pagamentoId,
      },
      urgency: "HIGH",
      channels: ["REALTIME", "EMAIL"],
    };

    await HybridNotificationService.publishNotification(event);
  }

  /**
   * Notifica quando um evento é criado
   */
  static async notifyEventoCreated(data: {
    eventoId: string;
    titulo: string;
    dataInicio: Date;
    local?: string;
    tenantId: string;
    userId: string;
  }): Promise<void> {
    const event: NotificationEvent = {
      type: "evento.created",
      tenantId: data.tenantId,
      userId: data.userId,
      payload: {
        eventoId: data.eventoId,
        tituloOriginal: data.titulo,
        dataInicio: data.dataInicio.toISOString(),
        local: data.local,
        titulo: "Novo Evento Agendado",
        mensagem: `Evento "${data.titulo}" foi agendado para ${data.dataInicio.toLocaleDateString("pt-BR")}${data.local ? ` em ${data.local}` : ""}.`,
        referenciaTipo: "evento",
        referenciaId: data.eventoId,
      },
      urgency: "MEDIUM",
      channels: ["REALTIME"],
    };

    await HybridNotificationService.publishNotification(event);
  }
}

/**
 * Exemplo de como usar em uma action existente
 */
export async function exemploIntegracaoProcesso() {
  // Exemplo: após criar um processo
  await ProcessoNotificationIntegration.notifyProcessoCreated({
    processoId: "proc_123",
    numero: "1234567-89.2024.8.05.0001",
    tenantId: "tenant_123",
    userId: "user_123",
    clienteNome: "João Silva",
    advogadoNome: "Maria Santos",
  });

  // Exemplo: após criar um prazo
  await ProcessoNotificationIntegration.notifyPrazoExpiring({
    prazoId: "prazo_123",
    processoId: "proc_123",
    processoNumero: "1234567-89.2024.8.05.0001",
    titulo: "Contestação",
    diasRestantes: 2,
    tenantId: "tenant_123",
    userId: "user_123",
  });
}
