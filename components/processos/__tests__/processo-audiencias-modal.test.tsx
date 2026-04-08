import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ProcessoAudienciasModal } from "@/components/processos/processo-audiencias-modal";
import { EventoTipo } from "@/generated/prisma";

const useEventosProcessoMock = jest.fn();
const marcarEventoComoRealizadoMock = jest.fn();
const eventoFormMock = jest.fn();
const toastSuccessMock = jest.fn();
const toastErrorMock = jest.fn();

jest.mock("@/app/hooks/use-processos", () => ({
  useEventosProcesso: (...args: any[]) => useEventosProcessoMock(...args),
}));

jest.mock("@/app/actions/eventos", () => ({
  marcarEventoComoRealizado: (...args: any[]) =>
    marcarEventoComoRealizadoMock(...args),
}));

jest.mock("@/components/evento-form", () => (props: any) => {
  eventoFormMock(props);
  return props.isOpen ? <div>EventoForm aberto</div> : null;
});

jest.mock("@/components/ui/modal", () => ({
  Modal: ({ children, footer, isOpen, title }: any) =>
    isOpen ? (
      <div>
        <div>{title}</div>
        {children}
        {footer}
      </div>
    ) : null,
}));

jest.mock("@/lib/toast", () => ({
  toast: {
    success: (...args: any[]) => toastSuccessMock(...args),
    error: (...args: any[]) => toastErrorMock(...args),
  },
}));

jest.mock("@heroui/button", () => ({
  Button: ({
    children,
    isLoading,
    onClick,
    onPress,
  }: any) => (
    <button disabled={Boolean(isLoading)} onClick={onClick ?? onPress}>
      {children}
    </button>
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

jest.mock("@heroui/spinner", () => ({
  Spinner: ({ label }: { label?: string }) => <div>{label || "Loading"}</div>,
}));

describe("ProcessoAudienciasModal", () => {
  const mutateMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    useEventosProcessoMock.mockReturnValue({
      eventos: [
        {
          id: "aud-1",
          titulo: "Audiência de conciliação",
          tipo: EventoTipo.AUDIENCIA,
          status: "AGENDADO",
          dataInicio: "2026-04-10T14:00:00.000Z",
          dataFim: "2026-04-10T15:00:00.000Z",
          processoId: "processo-1",
          clienteId: "cliente-1",
          advogadoResponsavelId: "adv-1",
          participantes: [],
          isOnline: false,
          linkAcesso: null,
          local: "Fórum Central",
          descricao: "Primeira audiência",
        },
        {
          id: "evento-1",
          titulo: "Reunião interna",
          tipo: EventoTipo.REUNIAO,
          status: "AGENDADO",
          dataInicio: "2026-04-09T10:00:00.000Z",
          dataFim: "2026-04-09T11:00:00.000Z",
          processoId: "processo-1",
          clienteId: "cliente-1",
          advogadoResponsavelId: "adv-1",
          participantes: [],
          isOnline: false,
          linkAcesso: null,
          local: null,
          descricao: null,
        },
      ],
      isLoading: false,
      mutate: mutateMock,
    });
    marcarEventoComoRealizadoMock.mockResolvedValue({ success: true });
  });

  it("filtra apenas audiências e conclui o item com revalidação", async () => {
    const user = userEvent.setup();
    const onChanged = jest.fn();

    render(
      <ProcessoAudienciasModal
        canComplete
        canEdit
        isOpen
        onChanged={onChanged}
        onClose={jest.fn()}
        processoId="processo-1"
        processoNumero="0001234-56.2026.8.05.0001"
      />,
    );

    expect(screen.getByText("Audiência de conciliação")).toBeTruthy();
    expect(screen.queryByText("Reunião interna")).toBeNull();

    await user.click(screen.getByText(/Concluir/i));

    await waitFor(() =>
      expect(marcarEventoComoRealizadoMock).toHaveBeenCalledWith("aud-1"),
    );
    await waitFor(() => expect(mutateMock).toHaveBeenCalled());
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(toastSuccessMock).toHaveBeenCalled();
  });

  it("abre o EventoForm contextualizado no modo create", async () => {
    render(
      <ProcessoAudienciasModal
        advogadoResponsavelId="adv-1"
        canCreate
        clienteId="cliente-1"
        defaultMode="create"
        isOpen
        onClose={jest.fn()}
        processoId="processo-1"
        processoNumero="0001234-56.2026.8.05.0001"
      />,
    );

    await waitFor(() => expect(screen.getByText("EventoForm aberto")).toBeTruthy());

    const latestProps = eventoFormMock.mock.calls.at(-1)?.[0];

    expect(latestProps.preset).toEqual(
      expect.objectContaining({
        tipo: EventoTipo.AUDIENCIA,
        processoId: "processo-1",
        clienteId: "cliente-1",
        advogadoResponsavelId: "adv-1",
      }),
    );
    expect(latestProps.locks).toEqual({
      tipo: true,
      processo: true,
      cliente: true,
    });
  });
});
