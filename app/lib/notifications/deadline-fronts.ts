export const DEADLINE_NOTIFICATION_FRONTS = {
  MONITORAMENTO: "MONITORAMENTO",
  ATENCAO: "ATENCAO",
  CRITICA: "CRITICA",
} as const;

export type DeadlineNotificationFront =
  (typeof DEADLINE_NOTIFICATION_FRONTS)[keyof typeof DEADLINE_NOTIFICATION_FRONTS];

const DEADLINE_FRONT_EVENT_MAP: Record<string, DeadlineNotificationFront> = {
  "prazo.digest_30d": DEADLINE_NOTIFICATION_FRONTS.MONITORAMENTO,
  "prazo.digest_10d": DEADLINE_NOTIFICATION_FRONTS.ATENCAO,
  "prazo.expiring_7d": DEADLINE_NOTIFICATION_FRONTS.ATENCAO,
  "prazo.expiring_3d": DEADLINE_NOTIFICATION_FRONTS.ATENCAO,
  "prazo.expiring_1d": DEADLINE_NOTIFICATION_FRONTS.CRITICA,
  "prazo.expiring_2h": DEADLINE_NOTIFICATION_FRONTS.CRITICA,
  "prazo.expired": DEADLINE_NOTIFICATION_FRONTS.CRITICA,
};

export function isDeadlineNotificationEvent(eventType: string) {
  return eventType.startsWith("prazo.");
}

export function getDeadlineNotificationFront(
  eventType: string,
): DeadlineNotificationFront | null {
  return DEADLINE_FRONT_EVENT_MAP[eventType] ?? null;
}

export function getDeadlineNotificationFrontLabel(
  front: DeadlineNotificationFront | null,
) {
  switch (front) {
    case DEADLINE_NOTIFICATION_FRONTS.MONITORAMENTO:
      return "Frente 1 · Monitoramento";
    case DEADLINE_NOTIFICATION_FRONTS.ATENCAO:
      return "Frente 2 · Atenção";
    case DEADLINE_NOTIFICATION_FRONTS.CRITICA:
      return "Frente 3 · Crítica";
    default:
      return "Prazo";
  }
}

export function isCriticalDeadlineFront(front: DeadlineNotificationFront | null) {
  return front === DEADLINE_NOTIFICATION_FRONTS.CRITICA;
}
