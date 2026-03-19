import {
  getCriticalDeadlineLabel,
  isCriticalDeadlineNotification,
} from "@/app/lib/notifications/deadline-alerts";

describe("deadline alerts", () => {
  it("identifica notificacao de prazo critico nao lida", () => {
    expect(
      isCriticalDeadlineNotification({
        tipo: "prazo.expiring_2h",
        status: "NAO_LIDA",
        prioridade: "CRITICAL",
      }),
    ).toBe(true);
  });

  it("ignora notificacao ja lida", () => {
    expect(
      isCriticalDeadlineNotification({
        tipo: "prazo.expiring_1d",
        status: "LIDA",
        prioridade: "CRITICAL",
      }),
    ).toBe(false);
  });

  it("retorna label amigavel do evento", () => {
    expect(getCriticalDeadlineLabel("prazo.expired")).toBe("Prazo vencido");
  });
});
