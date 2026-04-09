import prisma from "@/app/lib/prisma";

import type { NotificationTemplate } from "./types";

const DEFAULT_NOTIFICATION_TEMPLATES: Record<string, NotificationTemplate> = {
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
      'Cliente {clienteNome}: o prazo "{titulo}" foi criado no processo {processoNumero} (vencimento: {dataVencimento}).',
  },
  "prazo.updated": {
    title: "Prazo atualizado",
    message:
      'Cliente {clienteNome}: o prazo "{titulo}" do processo {processoNumero} foi atualizado.',
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
    title: "Frente 2 · Prazo proximo do vencimento",
    message:
      'Cliente {clienteNome}: o prazo "{titulo}" do processo {processoNumero} vence em 7 dias ({dataVencimento}).',
  },
  "prazo.expiring": {
    title: "Prazo proximo do vencimento",
    message:
      'Cliente {clienteNome}: o prazo "{titulo}" do processo {processoNumero} esta proximo do vencimento.',
  },
  "prazo.expiring_3d": {
    title: "Frente 2 · Prazo muito proximo do vencimento",
    message:
      'Cliente {clienteNome}: o prazo "{titulo}" do processo {processoNumero} vence em 3 dias ({dataVencimento}).',
  },
  "prazo.expiring_1d": {
    title: "Frente 3 · Prazo critico",
    message:
      'Cliente {clienteNome}: o prazo "{titulo}" do processo {processoNumero} vence em 1 dia ({dataVencimento}).',
  },
  "prazo.expiring_2h": {
    title: "Frente 3 · Prazo no limite",
    message:
      'Cliente {clienteNome}: o prazo "{titulo}" do processo {processoNumero} vence em ate 2 horas.',
  },
  "prazo.expired": {
    title: "Frente 3 · Prazo vencido",
    message:
      'Cliente {clienteNome}: o prazo "{titulo}" do processo {processoNumero} venceu em {dataVencimento}.',
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
    message: "Pagamento de R$ {valor} esta em atraso",
  },
  "evento.created": {
    title: "Novo evento agendado",
    message: "Evento {titulo} foi agendado para {data}",
  },
  "evento.updated": {
    title: "Evento atualizado",
    message: "Evento {titulo} foi atualizado{changesSummarySuffix}",
  },
  "evento.cancelled": {
    title: "Evento cancelado",
    message: "Evento {titulo} foi cancelado.",
  },
  "evento.confirmation_updated": {
    title: "Confirmacao do evento atualizada",
    message: "Evento {titulo} agora esta com status {confirmacaoStatus}.",
  },
  "evento.reminder_1h": {
    title: "Lembrete de evento",
    message: "Evento {titulo} em 1 hora ({dataInicio}).",
  },
  "evento.reminder_1d": {
    title: "Lembrete de evento",
    message: "Evento {titulo} amanha, em {dataInicio}.",
  },
  "evento.reminder_custom": {
    title: "Lembrete de evento",
    message: "Evento {titulo} em {reminderLabel}.",
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

const PAYLOAD_ALIASES: Array<[string, string[]]> = [
  ["cliente", ["clienteNome", "cliente"]],
  ["clienteNome", ["clienteNome", "cliente"]],
  ["advogado", ["advogadoNome", "advogado"]],
  ["advogadoNome", ["advogadoNome", "advogado"]],
  ["processoNumero", ["processoNumero", "numero"]],
  ["numero", ["numero", "processoNumero"]],
  ["data", ["data", "dataInicio", "dataVencimento", "effectiveDate"]],
  ["eventoLocal", ["eventoLocal", "local"]],
  ["local", ["local", "eventoLocal"]],
];

function hasRenderableValue(value: unknown) {
  if (value === undefined || value === null) {
    return false;
  }

  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  return true;
}

function formatDateValue(value: unknown) {
  if (!hasRenderableValue(value)) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(String(value));

  if (Number.isNaN(date.getTime())) {
    return typeof value === "string" ? value.trim() : String(value);
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function formatReminderLabel(reminderMinutes: number) {
  if (reminderMinutes % (24 * 60) === 0) {
    const days = reminderMinutes / (24 * 60);
    return `${days} dia${days === 1 ? "" : "s"}`;
  }

  if (reminderMinutes % 60 === 0) {
    const hours = reminderMinutes / 60;
    return `${hours} hora${hours === 1 ? "" : "s"}`;
  }

  return `${reminderMinutes} minuto${reminderMinutes === 1 ? "" : "s"}`;
}

export function normalizeNotificationPayload(payload: Record<string, any>) {
  const normalized: Record<string, any> = { ...payload };

  for (const [target, sources] of PAYLOAD_ALIASES) {
    if (hasRenderableValue(normalized[target])) {
      continue;
    }

    const sourceKey = sources.find((key) => hasRenderableValue(normalized[key]));
    if (sourceKey) {
      normalized[target] = normalized[sourceKey];
    }
  }

  const dateFields = [
    "data",
    "dataInicio",
    "dataVencimento",
    "loggedAt",
    "effectiveDate",
  ];

  for (const field of dateFields) {
    if (!hasRenderableValue(normalized[field])) {
      continue;
    }

    normalized[field] = formatDateValue(normalized[field]);
  }

  if (
    !hasRenderableValue(normalized.reminderLabel) &&
    typeof normalized.reminderMinutes === "number" &&
    Number.isFinite(normalized.reminderMinutes)
  ) {
    normalized.reminderLabel = formatReminderLabel(normalized.reminderMinutes);
  }

  const changesSummary =
    typeof normalized.changesSummary === "string"
      ? normalized.changesSummary.trim()
      : "";

  normalized.changesSummarySuffix = changesSummary
    ? `: ${changesSummary}`
    : ".";

  return normalized;
}

export function renderNotificationTemplate(
  template: NotificationTemplate,
  payload: Record<string, any>,
) {
  const normalizedPayload = normalizeNotificationPayload(payload);
  let title = template.title;
  let message = template.message;

  for (const [key, value] of Object.entries(normalizedPayload)) {
    if (!hasRenderableValue(value)) {
      continue;
    }

    const pattern = new RegExp(`{${key}}`, "g");
    title = title.replace(pattern, String(value));
    message = message.replace(pattern, String(value));
  }

  title = title.replace(/\{[^}]+\}/g, "informacao nao disponivel");
  message = message.replace(/\{[^}]+\}/g, "informacao nao disponivel");

  return {
    title,
    message,
    normalizedPayload,
  };
}

export function buildFallbackNotificationTemplate(
  eventType: string,
  payload: Record<string, any>,
): NotificationTemplate {
  const prettyType = eventType
    .split(".")
    .map((segment) => segment.replace(/_/g, " "))
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" - ");

  const defaultTitle =
    (payload.title as string | undefined) ||
    (payload.titulo as string | undefined) ||
    `Atualizacao: ${prettyType}`;

  const defaultMessage =
    (payload.message as string | undefined) ||
    (payload.mensagem as string | undefined) ||
    `Voce recebeu uma nova atualizacao (${prettyType}).`;

  return {
    title: defaultTitle,
    message: defaultMessage,
  };
}

export function getDefaultNotificationTemplate(eventType: string) {
  return DEFAULT_NOTIFICATION_TEMPLATES[eventType] || null;
}

export async function getNotificationTemplate(
  tenantId: string,
  eventType: string,
): Promise<NotificationTemplate | null> {
  const template = await prisma.notificationTemplate.findUnique({
    where: {
      tenantId_eventType: {
        tenantId,
        eventType,
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

  return getDefaultNotificationTemplate(eventType);
}
