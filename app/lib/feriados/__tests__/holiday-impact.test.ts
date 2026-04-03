import { computeHolidayImpactFromCalendar } from "@/app/lib/feriados/holiday-impact";

describe("holiday-impact", () => {
  it("prioritizes tenant holidays over shared entries on the same date", () => {
    const impact = computeHolidayImpactFromCalendar({
      baseDate: new Date("2026-06-24T12:00:00.000Z"),
      contarDiasUteis: true,
      scope: {
        uf: "BA",
        municipio: "Salvador",
      },
      entries: [
        {
          id: "shared-municipal",
          nome: "Sao Joao",
          tenantId: null,
          data: new Date("2026-06-24T12:00:00.000Z"),
          tipo: "MUNICIPAL",
          uf: "BA",
          municipio: "Salvador",
          source: "SHARED_OFFICIAL",
        },
        {
          id: "tenant-municipal",
          nome: "Sao Joao do escritorio",
          tenantId: "tenant-1",
          data: new Date("2026-06-24T12:00:00.000Z"),
          tipo: "MUNICIPAL",
          uf: "BA",
          municipio: "Salvador",
          source: "TENANT_MANUAL",
        },
      ],
    });

    expect(impact.wasShifted).toBe(true);
    expect(impact.shiftDays).toBe(1);
    expect(impact.overrideMode).toBe("TENANT_OVERRIDES_SHARED");
    expect(impact.reasons).toHaveLength(1);
    expect(impact.reasons[0]?.holidayName).toBe("Sao Joao do escritorio");
  });

  it("does not generate summary when the effective date does not move", () => {
    const impact = computeHolidayImpactFromCalendar({
      baseDate: new Date("2026-06-25T12:00:00.000Z"),
      contarDiasUteis: true,
      scope: {
        uf: "BA",
        municipio: "Salvador",
      },
      entries: [],
    });

    expect(impact.wasShifted).toBe(false);
    expect(impact.shiftDays).toBe(0);
    expect(impact.summary).toBeNull();
    expect(impact.reasons).toHaveLength(0);
  });
});
