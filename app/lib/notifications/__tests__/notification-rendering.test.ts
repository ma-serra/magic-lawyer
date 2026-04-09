import {
  getDefaultNotificationTemplate,
  renderNotificationTemplate,
} from "@/app/lib/notifications/notification-rendering";

describe("notification-rendering", () => {
  it("renderiza evento criado usando dataInicio como alias de data", () => {
    const template = getDefaultNotificationTemplate("evento.created");

    expect(template).toBeTruthy();

    const rendered = renderNotificationTemplate(template!, {
      titulo: "Audiencia de conciliacao",
      dataInicio: "2026-06-09T14:30:00.000Z",
    });

    expect(rendered.title).toBe("Novo evento agendado");
    expect(rendered.message).toContain("Audiencia de conciliacao");
    expect(rendered.message).toContain("09/06/2026");
  });

  it("possui templates padrao para os principais evento.*", () => {
    const eventTypes = [
      "evento.created",
      "evento.updated",
      "evento.cancelled",
      "evento.reminder_1h",
      "evento.reminder_1d",
      "evento.reminder_custom",
    ];

    for (const eventType of eventTypes) {
      expect(getDefaultNotificationTemplate(eventType)).toBeTruthy();
    }
  });

  it("gera resumo textual para evento atualizado sem quebrar quando nao ha diff", () => {
    const rendered = renderNotificationTemplate(
      getDefaultNotificationTemplate("evento.updated")!,
      {
        titulo: "Reuniao com cliente",
      },
    );

    expect(rendered.message).toBe("Evento Reuniao com cliente foi atualizado.");
  });
});
