import {
  estimateNotificationDeliveryCost,
  getNotificationAuditReasonLabel,
  sortNotificationChannels,
  summarizeNotificationPayload,
} from "@/app/lib/notifications/notification-audit";

describe("notification audit helpers", () => {
  it("retorna custo estimado por canal/provider conhecido", () => {
    expect(estimateNotificationDeliveryCost("EMAIL", "RESEND")).toEqual({
      amount: 0.001,
      currency: "USD",
      source: "ESTIMATED",
    });
    expect(estimateNotificationDeliveryCost("TELEGRAM", "TELEGRAM_BOT")).toEqual({
      amount: 0,
      currency: "USD",
      source: "ESTIMATED",
    });
  });

  it("mantem razoes auditaveis legiveis", () => {
    expect(getNotificationAuditReasonLabel("PROCESSING_FAILED")).toBe(
      "Falha interna durante o processamento",
    );
    expect(getNotificationAuditReasonLabel("UNKNOWN_REASON")).toBe(
      "UNKNOWN_REASON",
    );
  });

  it("ordena e remove duplicidade de canais auditaveis", () => {
    expect(
      sortNotificationChannels(["PUSH", "EMAIL", "REALTIME", "EMAIL"]),
    ).toEqual(["REALTIME", "EMAIL", "PUSH"]);
  });

  it("resume payload profundo sem explodir o tamanho", () => {
    const summary = summarizeNotificationPayload({
      titulo: "Prazo importante",
      mensagem: "x".repeat(260),
      nested: {
        a: {
          b: {
            c: "valor profundo",
          },
        },
      },
      lista: Array.from({ length: 8 }, (_, index) => `item-${index}`),
    }) as Record<string, unknown>;

    expect(String(summary.mensagem)).toContain("...");
    expect(summary.lista).toHaveLength(5);
    expect(summary.nested).toEqual({
      a: "[truncated]",
    });
  });
});
