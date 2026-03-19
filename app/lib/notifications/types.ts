export type NotificationUrgency = "CRITICAL" | "HIGH" | "MEDIUM" | "INFO";
export type NotificationChannel = "REALTIME" | "EMAIL" | "TELEGRAM" | "PUSH";

// Tipos do sistema legado para migração
export type LegacyNotificationType =
  | "SISTEMA"
  | "PRAZO"
  | "DOCUMENTO"
  | "MENSAGEM"
  | "FINANCEIRO"
  | "OUTRO";
export type LegacyNotificationPriority = "BAIXA" | "MEDIA" | "ALTA" | "CRITICA";
export type LegacyNotificationChannel =
  | "IN_APP"
  | "EMAIL"
  | "SMS"
  | "WHATSAPP"
  | "TELEGRAM"
  | "PUSH";
export type LegacyNotificationStatus = "NAO_LIDA" | "LIDA" | "ARQUIVADA";

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

export interface NotificationPreference {
  id: string;
  tenantId: string;
  userId: string;
  eventType: string;
  enabled: boolean;
  channels: NotificationChannel[];
  urgency: NotificationUrgency;
  createdAt: Date;
  updatedAt: Date;
}

export interface Notification {
  id: string;
  tenantId: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  payload?: Record<string, any>;
  urgency: NotificationUrgency;
  channels: NotificationChannel[];
  readAt?: Date;
  createdAt: Date;
  expiresAt?: Date;
}

export interface NotificationStats {
  total: number;
  unread: number;
  byUrgency: {
    critical: number;
    high: number;
    medium: number;
    info: number;
  };
  byType: Record<string, number>;
}

// Eventos específicos por módulo
export type ProcessoEventType =
  | "processo.created"
  | "processo.updated"
  | "processo.status_changed"
  | "processo.document_uploaded"
  | "processo.part_added";

export type PrazoEventType =
  | "prazo.created"
  | "prazo.updated"
  | "prazo.digest_30d"
  | "prazo.digest_10d"
  | "prazo.expiring_7d"
  | "prazo.expiring_3d"
  | "prazo.expiring_1d"
  | "prazo.expiring_2h"
  | "prazo.expired";

export type ClienteEventType =
  | "cliente.created"
  | "cliente.updated"
  | "cliente.document_uploaded"
  | "cliente.contact_added";

export type AdvogadoEventType =
  | "advogado.created"
  | "advogado.updated"
  | "advogado.avatar_updated"
  | "advogado.permissions_changed";

export type EquipeEventType =
  | "equipe.cargo_created"
  | "equipe.cargo_updated"
  | "equipe.user_invited"
  | "equipe.user_joined"
  | "equipe.permissions_changed"
  | "equipe.user_removed";

export type FinanceiroEventType =
  | "contrato.created"
  | "contrato.updated"
  | "contrato.status_changed"
  | "contrato.signature_pending"
  | "contrato.signed"
  | "contrato.expired"
  | "pagamento.created"
  | "pagamento.paid"
  | "pagamento.failed"
  | "pagamento.overdue"
  | "boleto.generated"
  | "pix.generated"
  | "honorario.created"
  | "honorario.updated"
  | "honorario.paid";

export type AgendaEventType =
  | "evento.created"
  | "evento.updated"
  | "evento.cancelled"
  | "evento.reminder_1h"
  | "evento.reminder_1d"
  | "evento.google_synced";

export type DocumentoEventType =
  | "documento.uploaded"
  | "documento.approved"
  | "documento.rejected"
  | "documento.expired"
  | "modelo.created"
  | "modelo.updated"
  | "modelo.used";

export type ContratoEventType =
  | "contrato.created"
  | "contrato.updated"
  | "contrato.signed"
  | "contrato.expired"
  | "contrato.cancelled";

export type ProcuracaoEventType =
  | "procuracao.created"
  | "procuracao.updated"
  | "procuracao.signed"
  | "procuracao.expired";

export type JuizEventType =
  | "juiz.created"
  | "juiz.updated"
  | "juiz.favorited"
  | "juiz.unfavorited";

export type TarefaEventType =
  | "tarefa.created"
  | "tarefa.updated"
  | "tarefa.assigned"
  | "tarefa.completed"
  | "tarefa.moved";

export type RelatorioEventType =
  | "relatorio.generated"
  | "relatorio.exported"
  | "relatorio.scheduled"
  | "relatorio.failed";

// Union type com todos os eventos
export type AllEventTypes =
  | ProcessoEventType
  | PrazoEventType
  | ClienteEventType
  | AdvogadoEventType
  | EquipeEventType
  | FinanceiroEventType
  | AgendaEventType
  | DocumentoEventType
  | ContratoEventType
  | ProcuracaoEventType
  | JuizEventType
  | TarefaEventType
  | RelatorioEventType;

// Payloads específicos por tipo de evento
export interface ProcessoCreatedPayload {
  processoId: string;
  numero: string;
  cliente: string;
  advogado?: string;
}

export interface PrazoExpiringPayload {
  prazoId: string;
  processoId: string;
  numero: string;
  descricao: string;
  vencimento: string;
  diasRestantes: number;
}

export interface ClienteCreatedPayload {
  clienteId: string;
  nome: string;
  documento: string;
  advogado?: string;
}

export interface ContratoCreatedPayload {
  contratoId: string;
  numero: string;
  cliente: string;
  valor: number;
  advogado?: string;
}

export interface PagamentoPaidPayload {
  pagamentoId: string;
  valor: number;
  formaPagamento: string;
  cliente: string;
  contrato?: string;
}

export interface EventoCreatedPayload {
  eventoId: string;
  titulo: string;
  data: string;
  hora: string;
  tipo: string;
  participantes: string[];
}

export interface EquipeUserInvitedPayload {
  conviteId: string;
  email: string;
  nome?: string;
  cargo?: string;
  enviadoPor: string;
}

// Union type com todos os payloads
export type AllEventPayloads =
  | ProcessoCreatedPayload
  | PrazoExpiringPayload
  | ClienteCreatedPayload
  | ContratoCreatedPayload
  | PagamentoPaidPayload
  | EventoCreatedPayload
  | EquipeUserInvitedPayload
  | Record<string, any>; // Fallback para payloads genéricos
