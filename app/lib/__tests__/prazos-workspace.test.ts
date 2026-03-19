import { ProcessoPrazoStatus } from "@/generated/prisma";

import {
  buildPrazoWorkspaceSummary,
  formatPrazoRelativeLabel,
  getPrazoOperationalBucket,
} from "@/app/lib/prazos/workspace";

describe("prazos workspace helpers", () => {
  const now = new Date("2026-03-18T10:00:00.000Z");

  it("classifica buckets operacionais corretamente", () => {
    expect(
      getPrazoOperationalBucket(
        {
          status: ProcessoPrazoStatus.ABERTO,
          dataVencimento: "2026-03-17T12:00:00.000Z",
        },
        now,
      ),
    ).toBe("overdue");

    expect(
      getPrazoOperationalBucket(
        {
          status: ProcessoPrazoStatus.ABERTO,
          dataVencimento: "2026-03-18T12:00:00.000Z",
        },
        now,
      ),
    ).toBe("today");

    expect(
      getPrazoOperationalBucket(
        {
          status: ProcessoPrazoStatus.ABERTO,
          dataVencimento: "2026-03-24T12:00:00.000Z",
        },
        now,
      ),
    ).toBe("next_7d");

    expect(
      getPrazoOperationalBucket(
        {
          status: ProcessoPrazoStatus.CONCLUIDO,
          dataVencimento: "2026-03-10T12:00:00.000Z",
        },
        now,
      ),
    ).toBe("completed");
  });

  it("resume a carteira de prazos", () => {
    const summary = buildPrazoWorkspaceSummary(
      [
        {
          status: ProcessoPrazoStatus.ABERTO,
          dataVencimento: "2026-03-17T12:00:00.000Z",
          responsavelId: "u1",
        },
        {
          status: ProcessoPrazoStatus.ABERTO,
          dataVencimento: "2026-03-18T12:00:00.000Z",
          responsavelId: null,
        },
        {
          status: ProcessoPrazoStatus.PRORROGADO,
          dataVencimento: "2026-03-24T12:00:00.000Z",
          responsavelId: "u2",
        },
        {
          status: ProcessoPrazoStatus.CONCLUIDO,
          dataVencimento: "2026-03-15T12:00:00.000Z",
          responsavelId: "u3",
        },
      ],
      now,
    );

    expect(summary).toEqual({
      total: 4,
      abertos: 3,
      vencidos: 1,
      venceHoje: 1,
      proximos7Dias: 1,
      proximos30Dias: 0,
      concluidos: 1,
      semResponsavel: 1,
    });
  });

  it("gera label relativa legível", () => {
    expect(
      formatPrazoRelativeLabel(
        "2026-03-18T12:00:00.000Z",
        ProcessoPrazoStatus.ABERTO,
        now,
      ),
    ).toBe("Vence hoje");

    expect(
      formatPrazoRelativeLabel(
        "2026-03-20T12:00:00.000Z",
        ProcessoPrazoStatus.ABERTO,
        now,
      ),
    ).toBe("Vence em 2 dias");
  });
});
