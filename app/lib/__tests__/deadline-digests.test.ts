import {
  buildDeadlineDigestPayload,
  buildDeadlineDigestSummary,
} from "@/app/lib/notifications/deadline-digests";

describe("deadline digests", () => {
  it("monta resumo em lista com cliente, processo e prazo final", () => {
    const summary = buildDeadlineDigestSummary([
      {
        prazoId: "prazo-2",
        processoId: "proc-2",
        processoNumero: "002",
        clienteNome: "Bruno Silva",
        titulo: "Manifestação",
        dataVencimento: "2026-04-17T10:00:00.000Z",
      },
      {
        prazoId: "prazo-1",
        processoId: "proc-1",
        processoNumero: "001",
        clienteNome: "Ana Souza",
        titulo: "Contestação",
        dataVencimento: "2026-04-16T10:00:00.000Z",
      },
    ]);

    expect(summary).toContain("• Ana Souza - Processo 001 - Prazo final");
    expect(summary).toContain("Contestação");
    expect(summary.split("\n")[0]).toContain("Ana Souza");
  });

  it("gera payload de digest com chave estável e total", () => {
    const payload = buildDeadlineDigestPayload({
      daysRemaining: 10,
      digestDate: "2026-03-28",
      items: [
        {
          prazoId: "prazo-1",
          processoId: "proc-1",
          processoNumero: "001",
          clienteNome: "Ana Souza",
          titulo: "Contestação",
          dataVencimento: "2026-03-28T10:00:00.000Z",
        },
      ],
    });

    expect(payload.digestKey).toBe("prazo.digest_10d:2026-03-28");
    expect(payload.totalPrazos).toBe(1);
    expect(payload.resumoPrazos).toContain("Processo 001");
  });
});
