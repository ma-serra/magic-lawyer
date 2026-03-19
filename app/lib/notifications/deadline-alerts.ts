import type { NotificationItem } from "@/app/hooks/use-notifications";
import {
  getDeadlineNotificationFront,
  getDeadlineNotificationFrontLabel,
} from "@/app/lib/notifications/deadline-fronts";

export const CRITICAL_DEADLINE_EVENT_TYPES = [
  "prazo.expiring_1d",
  "prazo.expiring_2h",
  "prazo.expired",
] as const;

const CRITICAL_DEADLINE_EVENT_SET = new Set<string>(
  CRITICAL_DEADLINE_EVENT_TYPES,
);

export function isCriticalDeadlineNotification(
  notification: Pick<NotificationItem, "tipo" | "status" | "prioridade">,
) {
  return (
    notification.status === "NAO_LIDA" &&
    (CRITICAL_DEADLINE_EVENT_SET.has(notification.tipo) ||
      notification.prioridade === "CRITICAL" ||
      notification.prioridade === "CRITICA")
  );
}

export function getCriticalDeadlineLabel(eventType: string) {
  switch (eventType) {
    case "prazo.expiring_1d":
      return "Prazo vence em 1 dia";
    case "prazo.expiring_2h":
      return "Prazo vence em 2 horas";
    case "prazo.expired":
      return "Prazo vencido";
    default:
      return "Prazo crítico";
  }
}

export function getDeadlineFrontBadgeLabel(eventType: string) {
  return getDeadlineNotificationFrontLabel(getDeadlineNotificationFront(eventType));
}
