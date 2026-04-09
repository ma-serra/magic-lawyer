import {
  resolveNotificationActionText,
  resolveNotificationPath,
} from "@/app/lib/notifications/notification-links";

describe("notification-links eventos", () => {
  it("prioriza agenda para eventos mesmo quando existe processoId no payload", () => {
    expect(
      resolveNotificationPath("evento.reminder_1h", {
        eventoId: "evt_123",
        processoId: "proc_456",
      }),
    ).toBe("/agenda/evt_123");
  });

  it("usa agenda como fallback para evento sem eventoId", () => {
    expect(
      resolveNotificationPath("evento.cancelled", {
        processoId: "proc_456",
      }),
    ).toBe("/agenda");
  });

  it("expoe CTA de evento para todos os principais tipos evento.*", () => {
    expect(resolveNotificationActionText("evento.created", {})).toBe(
      "Ver evento",
    );
    expect(resolveNotificationActionText("evento.reminder_1d", {})).toBe(
      "Ver evento",
    );
    expect(resolveNotificationActionText("evento.cancelled", {})).toBe(
      "Ver evento",
    );
  });
});
