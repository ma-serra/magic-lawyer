import {
  DEADLINE_NOTIFICATION_FRONTS,
  getDeadlineNotificationFront,
  getDeadlineNotificationFrontLabel,
  isCriticalDeadlineFront,
  isDeadlineNotificationEvent,
} from "@/app/lib/notifications/deadline-fronts";

describe("deadline fronts", () => {
  it("mapeia eventos para as tres frentes", () => {
    expect(getDeadlineNotificationFront("prazo.digest_30d")).toBe(
      DEADLINE_NOTIFICATION_FRONTS.MONITORAMENTO,
    );
    expect(getDeadlineNotificationFront("prazo.expiring_7d")).toBe(
      DEADLINE_NOTIFICATION_FRONTS.ATENCAO,
    );
    expect(getDeadlineNotificationFront("prazo.expired")).toBe(
      DEADLINE_NOTIFICATION_FRONTS.CRITICA,
    );
  });

  it("rotula a frente de forma amigavel", () => {
    expect(
      getDeadlineNotificationFrontLabel(DEADLINE_NOTIFICATION_FRONTS.ATENCAO),
    ).toBe("Frente 2 · Atenção");
  });

  it("identifica evento de prazo e frente critica", () => {
    expect(isDeadlineNotificationEvent("prazo.expiring_2h")).toBe(true);
    expect(
      isCriticalDeadlineFront(
        getDeadlineNotificationFront("prazo.expiring_2h"),
      ),
    ).toBe(true);
    expect(isDeadlineNotificationEvent("processo.updated")).toBe(false);
  });
});
