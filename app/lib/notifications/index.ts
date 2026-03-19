// Exportações principais
export { NotificationService } from "./notification-service";
export { NotificationHelper } from "./notification-helper";
export { NotificationMigrationService } from "./notification-migration";
export { HybridNotificationService } from "./hybrid-notification-service";

// Tipos e interfaces
export type {
  NotificationUrgency,
  NotificationChannel,
  NotificationEvent,
  NotificationTemplate,
  NotificationPreference,
  Notification,
  NotificationStats,
  AllEventTypes,
  AllEventPayloads,
  ProcessoEventType,
  PrazoEventType,
  ClienteEventType,
  AdvogadoEventType,
  EquipeEventType,
  FinanceiroEventType,
  AgendaEventType,
  DocumentoEventType,
  ContratoEventType,
  ProcuracaoEventType,
  JuizEventType,
  TarefaEventType,
  RelatorioEventType,
  ProcessoCreatedPayload,
  PrazoExpiringPayload,
  ClienteCreatedPayload,
  ContratoCreatedPayload,
  PagamentoPaidPayload,
  EventoCreatedPayload,
  EquipeUserInvitedPayload,
} from "./types";

// Constantes úteis
export const NOTIFICATION_URGENCY = {
  CRITICAL: "CRITICAL" as const,
  HIGH: "HIGH" as const,
  MEDIUM: "MEDIUM" as const,
  INFO: "INFO" as const,
} as const;

export const NOTIFICATION_CHANNEL = {
  REALTIME: "REALTIME" as const,
  EMAIL: "EMAIL" as const,
  PUSH: "PUSH" as const,
} as const;

// Eventos por módulo para facilitar o uso
export const NOTIFICATION_EVENTS = {
  PROCESSO: {
    CREATED: "processo.created",
    UPDATED: "processo.updated",
    STATUS_CHANGED: "processo.status_changed",
    DOCUMENT_UPLOADED: "processo.document_uploaded",
    PART_ADDED: "processo.part_added",
  },
  PRAZO: {
    CREATED: "prazo.created",
    UPDATED: "prazo.updated",
    DIGEST_30D: "prazo.digest_30d",
    DIGEST_10D: "prazo.digest_10d",
    EXPIRING_7D: "prazo.expiring_7d",
    EXPIRING_3D: "prazo.expiring_3d",
    EXPIRING_1D: "prazo.expiring_1d",
    EXPIRING_2H: "prazo.expiring_2h",
    EXPIRED: "prazo.expired",
  },
  CLIENTE: {
    CREATED: "cliente.created",
    UPDATED: "cliente.updated",
    DOCUMENT_UPLOADED: "cliente.document_uploaded",
    CONTACT_ADDED: "cliente.contact_added",
  },
  ADVOGADO: {
    CREATED: "advogado.created",
    UPDATED: "advogado.updated",
    AVATAR_UPDATED: "advogado.avatar_updated",
    PERMISSIONS_CHANGED: "advogado.permissions_changed",
  },
  EQUIPE: {
    CARGO_CREATED: "equipe.cargo_created",
    CARGO_UPDATED: "equipe.cargo_updated",
    USER_INVITED: "equipe.user_invited",
    USER_JOINED: "equipe.user_joined",
    PERMISSIONS_CHANGED: "equipe.permissions_changed",
    USER_REMOVED: "equipe.user_removed",
  },
  FINANCEIRO: {
    CONTRATO_CREATED: "contrato.created",
    CONTRATO_UPDATED: "contrato.updated",
    CONTRATO_STATUS_CHANGED: "contrato.status_changed",
    CONTRATO_SIGNATURE_PENDING: "contrato.signature_pending",
    CONTRATO_SIGNED: "contrato.signed",
    CONTRATO_EXPIRED: "contrato.expired",
    PAGAMENTO_CREATED: "pagamento.created",
    PAGAMENTO_PAID: "pagamento.paid",
    PAGAMENTO_FAILED: "pagamento.failed",
    PAGAMENTO_OVERDUE: "pagamento.overdue",
    BOLETO_GENERATED: "boleto.generated",
    PIX_GENERATED: "pix.generated",
    HONORARIO_CREATED: "honorario.created",
    HONORARIO_UPDATED: "honorario.updated",
    HONORARIO_PAID: "honorario.paid",
  },
  AGENDA: {
    EVENTO_CREATED: "evento.created",
    EVENTO_UPDATED: "evento.updated",
    EVENTO_CANCELLED: "evento.cancelled",
    EVENTO_REMINDER_1H: "evento.reminder_1h",
    EVENTO_REMINDER_1D: "evento.reminder_1d",
    EVENTO_GOOGLE_SYNCED: "evento.google_synced",
  },
  DOCUMENTO: {
    UPLOADED: "documento.uploaded",
    APPROVED: "documento.approved",
    REJECTED: "documento.rejected",
    EXPIRED: "documento.expired",
    MODELO_CREATED: "modelo.created",
    MODELO_UPDATED: "modelo.updated",
    MODELO_USED: "modelo.used",
  },
  CONTRATO: {
    CREATED: "contrato.created",
    UPDATED: "contrato.updated",
    SIGNED: "contrato.signed",
    EXPIRED: "contrato.expired",
    CANCELLED: "contrato.cancelled",
  },
  PROCURACAO: {
    CREATED: "procuracao.created",
    UPDATED: "procuracao.updated",
    SIGNED: "procuracao.signed",
    EXPIRED: "procuracao.expired",
  },
  JUIZ: {
    CREATED: "juiz.created",
    UPDATED: "juiz.updated",
    FAVORITED: "juiz.favorited",
    UNFAVORITED: "juiz.unfavorited",
  },
  TAREFA: {
    CREATED: "tarefa.created",
    UPDATED: "tarefa.updated",
    ASSIGNED: "tarefa.assigned",
    COMPLETED: "tarefa.completed",
    MOVED: "tarefa.moved",
  },
  RELATORIO: {
    GENERATED: "relatorio.generated",
    EXPORTED: "relatorio.exported",
    SCHEDULED: "relatorio.scheduled",
    FAILED: "relatorio.failed",
  },
} as const;
