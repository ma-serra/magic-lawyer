import {
  buildAgendaMonthRange,
  formatAgendaMonthLabel,
  groupEventosByDay,
} from "../agenda-view";

describe("agenda view helpers", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 3, 8, 12, 0, 0));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("monta os limites do mes de referencia", () => {
    const range = buildAgendaMonthRange(new Date(2026, 3, 15, 10, 30, 0));

    expect(range.start.getFullYear()).toBe(2026);
    expect(range.start.getMonth()).toBe(3);
    expect(range.start.getDate()).toBe(1);
    expect(range.start.getHours()).toBe(0);
    expect(range.start.getMinutes()).toBe(0);

    expect(range.end.getFullYear()).toBe(2026);
    expect(range.end.getMonth()).toBe(3);
    expect(range.end.getDate()).toBe(30);
    expect(range.end.getHours()).toBe(23);
    expect(range.end.getMinutes()).toBe(59);
  });

  it("agrupa eventos por dia em ordem cronologica e preserva contexto", () => {
    const grouped = groupEventosByDay([
      { id: "evento-2", dataInicio: new Date(2026, 3, 9, 9, 0, 0) } as any,
      { id: "evento-1", dataInicio: new Date(2026, 3, 8, 14, 0, 0) } as any,
      { id: "evento-3", dataInicio: new Date(2026, 3, 8, 16, 30, 0) } as any,
    ]);

    expect(grouped).toHaveLength(2);
    expect(grouped[0].eventos.map((evento) => evento.id)).toEqual([
      "evento-1",
      "evento-3",
    ]);
    expect(grouped[0].contextualLabel).toBe("Hoje");
    expect(grouped[1].eventos.map((evento) => evento.id)).toEqual(["evento-2"]);
    expect(grouped[1].contextualLabel).toBe("Amanhã");
  });

  it("formata o rotulo mensal em portugues", () => {
    expect(formatAgendaMonthLabel(new Date(2026, 3, 1))).toMatch(/abril/i);
    expect(formatAgendaMonthLabel(new Date(2026, 3, 1))).toMatch(/2026/);
  });
});
