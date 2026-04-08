import { render, screen } from "@testing-library/react";

import {
  deriveProcessoAudienciasOverview,
  ProcessoAudienciasList,
} from "@/components/processos/processo-audiencias-list";

jest.mock("@heroui/button", () => ({
  Button: ({ children, onPress }: any) => (
    <button onClick={onPress}>{children}</button>
  ),
}));

jest.mock("@heroui/card", () => ({
  Card: ({ children }: any) => <div>{children}</div>,
  CardBody: ({ children }: any) => <div>{children}</div>,
}));

jest.mock("@heroui/chip", () => ({
  Chip: ({ children }: any) => <span>{children}</span>,
}));

jest.mock("@heroui/divider", () => ({
  Divider: () => <hr />,
}));

describe("ProcessoAudienciasList", () => {
  const audiencias = [
    {
      id: "aud-1",
      titulo: "Audiência de conciliação",
      status: "AGENDADO",
      dataInicio: "2026-04-10T14:00:00.000Z",
      dataFim: "2026-04-10T15:00:00.000Z",
      local: "Fórum Central",
      advogadoResponsavel: {
        usuario: {
          firstName: "Sandra",
          lastName: "Costa",
        },
      },
    },
    {
      id: "aud-2",
      titulo: "Audiência de instrução",
      status: "REALIZADO",
      dataInicio: "2026-04-01T14:00:00.000Z",
      dataFim: "2026-04-01T15:00:00.000Z",
      local: "Sala 02",
    },
    {
      id: "aud-3",
      titulo: "Audiência de saneamento",
      status: "CONFIRMADO",
      dataInicio: "2026-04-12T09:00:00.000Z",
      dataFim: "2026-04-12T10:00:00.000Z",
      isOnline: true,
      linkAcesso: "https://meet.google.com/teste",
    },
  ];

  it("separa próximas audiências do histórico e identifica a próxima audiência", () => {
    const overview = deriveProcessoAudienciasOverview(
      audiencias,
      new Date("2026-04-08T12:00:00.000Z"),
    );

    expect(overview.proximaAudiencia?.id).toBe("aud-1");
    expect(overview.proximas.map((item) => item.id)).toEqual([
      "aud-1",
      "aud-3",
    ]);
    expect(overview.historico.map((item) => item.id)).toEqual(["aud-2"]);
  });

  it("renderiza as seções de próximas audiências e histórico", () => {
    render(
      <ProcessoAudienciasList
        audiencias={audiencias}
        now={new Date("2026-04-08T12:00:00.000Z")}
      />,
    );

    expect(screen.getByText(/Próximas audiências/i)).toBeTruthy();
    expect(screen.getByText(/Histórico de audiências/i)).toBeTruthy();
    expect(screen.getByText("Audiência de conciliação")).toBeTruthy();
    expect(screen.getByText("Audiência de instrução")).toBeTruthy();
    expect(screen.getAllByText("1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2").length).toBeGreaterThan(0);
  });
});
