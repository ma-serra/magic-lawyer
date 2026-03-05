import { TipoFeriado } from "@/generated/prisma";
import {
  holidayMatchesScope,
  isSameDateOrRecurringMatch,
  isWeekendDate,
} from "@/app/lib/feriados/scope";

describe("holiday scope", () => {
  it("applies national holidays regardless of scope", () => {
    expect(
      holidayMatchesScope(
        { tipo: TipoFeriado.NACIONAL },
        { uf: "BA", municipio: "Salvador" },
      ),
    ).toBe(true);
  });

  it("matches tribunal-specific holidays only when tribunalId matches", () => {
    expect(
      holidayMatchesScope(
        {
          tipo: TipoFeriado.JUDICIARIO,
          tribunalId: "tribunal-1",
        },
        {
          tribunalId: "tribunal-1",
          uf: "BA",
        },
      ),
    ).toBe(true);

    expect(
      holidayMatchesScope(
        {
          tipo: TipoFeriado.JUDICIARIO,
          tribunalId: "tribunal-1",
        },
        {
          tribunalId: "tribunal-2",
          uf: "BA",
        },
      ),
    ).toBe(false);
  });

  it("matches municipal holidays by municipio and uf", () => {
    expect(
      holidayMatchesScope(
        {
          tipo: TipoFeriado.MUNICIPAL,
          municipio: "Salvador",
          uf: "BA",
        },
        {
          municipio: "SALVADOR",
          uf: "ba",
        },
      ),
    ).toBe(true);

    expect(
      holidayMatchesScope(
        {
          tipo: TipoFeriado.MUNICIPAL,
          municipio: "Salvador",
          uf: "BA",
        },
        {
          municipio: "Feira de Santana",
          uf: "BA",
        },
      ),
    ).toBe(false);
  });

  it("matches state holidays by uf", () => {
    expect(
      holidayMatchesScope(
        {
          tipo: TipoFeriado.ESTADUAL,
          uf: "SP",
        },
        {
          uf: "sp",
        },
      ),
    ).toBe(true);

    expect(
      holidayMatchesScope(
        {
          tipo: TipoFeriado.ESTADUAL,
          uf: "SP",
        },
        {
          uf: "RJ",
        },
      ),
    ).toBe(false);
  });
});

describe("holiday date helpers", () => {
  it("supports recurring and non-recurring date matching", () => {
    const target = new Date("2026-09-07T10:00:00.000Z");
    const sameDay = new Date("2026-09-07T12:00:00.000Z");
    const sameDayOtherYear = new Date("2020-09-07T12:00:00.000Z");

    expect(isSameDateOrRecurringMatch(target, sameDay, false)).toBe(true);
    expect(isSameDateOrRecurringMatch(target, sameDayOtherYear, false)).toBe(
      false,
    );
    expect(isSameDateOrRecurringMatch(target, sameDayOtherYear, true)).toBe(
      true,
    );
  });

  it("detects weekends", () => {
    expect(isWeekendDate(new Date("2026-03-07T12:00:00.000Z"))).toBe(true); // Saturday
    expect(isWeekendDate(new Date("2026-03-08T12:00:00.000Z"))).toBe(true); // Sunday
    expect(isWeekendDate(new Date("2026-03-09T12:00:00.000Z"))).toBe(false); // Monday
  });
});
