import { NotificationPolicy } from "@/app/lib/notifications/domain/notification-policy";

describe("notification policy telegram mirroring", () => {
  it("espelha eventos críticos para Telegram", () => {
    expect(
      NotificationPolicy.shouldMirrorToTelegram(
        "pagamento.overdue",
        "CRITICAL",
      ),
    ).toBe(true);
  });

  it("espelha eventos de processo mesmo quando médios", () => {
    expect(
      NotificationPolicy.shouldMirrorToTelegram("processo.updated", "MEDIUM"),
    ).toBe(true);
    expect(
      NotificationPolicy.shouldMirrorToTelegram("andamento.updated", "MEDIUM"),
    ).toBe(true);
  });

  it("não espelha eventos informativos genéricos", () => {
    expect(
      NotificationPolicy.shouldMirrorToTelegram("relatorio.exported", "INFO"),
    ).toBe(false);
  });
});
