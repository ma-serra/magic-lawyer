import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import EventoForm from "@/components/evento-form";
import { EventoTipo } from "@/generated/prisma";

const createEventoMock = jest.fn();
const updateEventoMock = jest.fn();
const useEventoFormDataMock = jest.fn();
const useUserPermissionsMock = jest.fn();
const toastSuccessMock = jest.fn();
const toastErrorMock = jest.fn();

jest.mock("@heroui/react", () => {
  const React = require("react");

  return {
    Modal: ({ children, isOpen }: any) =>
      isOpen ? <div>{children}</div> : null,
    ModalContent: ({ children }: any) => <div>{children}</div>,
    ModalHeader: ({ children }: any) => <div>{children}</div>,
    ModalBody: ({ children }: any) => <div>{children}</div>,
    ModalFooter: ({ children }: any) => <div>{children}</div>,
    Button: ({
      children,
      isDisabled,
      isLoading,
      onPress,
      type = "button",
    }: any) => (
      <button
        disabled={Boolean(isDisabled || isLoading)}
        type={type}
        onClick={onPress}
      >
        {children}
      </button>
    ),
    Input: ({
      label,
      value,
      onChange,
      isReadOnly,
      "data-testid": testId,
    }: any) => (
      <label>
        {label}
        <input
          data-testid={testId}
          readOnly={isReadOnly}
          value={value ?? ""}
          onChange={onChange}
        />
      </label>
    ),
    Textarea: ({ label, value, onChange }: any) => (
      <label>
        {label}
        <textarea value={value ?? ""} onChange={onChange} />
      </label>
    ),
    Chip: ({ children }: any) => <span>{children}</span>,
    Spinner: () => <div>Loading</div>,
    Select: ({ label }: any) => <div>{label}</div>,
    SelectItem: () => null,
    Switch: ({ children }: any) => <div>{children}</div>,
  };
});

jest.mock("@/app/actions/eventos", () => ({
  createEvento: (...args: any[]) => createEventoMock(...args),
  updateEvento: (...args: any[]) => updateEventoMock(...args),
}));

jest.mock("@/app/hooks/use-eventos", () => ({
  useEventoFormData: () => useEventoFormDataMock(),
}));

jest.mock("@/app/hooks/use-user-permissions", () => ({
  useUserPermissions: () => useUserPermissionsMock(),
}));

jest.mock("@/components/ui/date-input", () => ({
  DateInput: ({ label }: { label: string }) => <div>{label}</div>,
}));

jest.mock("@/components/searchable-select", () => ({
  SearchableSelect: ({ label }: { label: string }) => <div>{label}</div>,
}));

jest.mock("@/lib/toast", () => ({
  toast: {
    success: (...args: any[]) => toastSuccessMock(...args),
    error: (...args: any[]) => toastErrorMock(...args),
  },
}));

describe("EventoForm", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    createEventoMock.mockResolvedValue({ success: true });
    updateEventoMock.mockResolvedValue({ success: true });
    useUserPermissionsMock.mockReturnValue({
      isCliente: false,
    });
    useEventoFormDataMock.mockReturnValue({
      formData: {
        processos: [
          {
            id: "processo-1",
            numero: "0001234-56.2026.8.05.0001",
            titulo: "Processo teste",
            clienteId: "cliente-1",
          },
        ],
        clientes: [
          {
            id: "cliente-1",
            nome: "Cliente Teste",
            email: "cliente@teste.com",
          },
        ],
        advogados: [
          {
            id: "adv-1",
            usuario: {
              firstName: "Sandra",
              lastName: "Costa",
              email: "sandra@adv.br",
            },
          },
        ],
      },
      isLoading: false,
    });
  });

  it("abre com audiência/processo/cliente travados e envia o contexto correto", async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    const onSuccess = jest.fn();

    render(
      <EventoForm
        copy={{
          createTitle: "Nova audiência",
          createSubmitLabel: "Criar audiência",
        }}
        initialDate={new Date("2026-04-08T12:00:00.000Z")}
        isOpen
        locks={{
          tipo: true,
          processo: true,
          cliente: true,
        }}
        onClose={onClose}
        onSuccess={onSuccess}
        preset={{
          tipo: EventoTipo.AUDIENCIA,
          processoId: "processo-1",
          clienteId: "cliente-1",
          advogadoResponsavelId: "adv-1",
        }}
      />,
    );

    expect(screen.getByText("Nova audiência")).toBeTruthy();
    expect(
      (screen.getByTestId("evento-form-tipo-locked") as HTMLInputElement).value,
    ).toBe("Audiência");
    expect(
      (screen.getByTestId("evento-form-cliente-locked") as HTMLInputElement)
        .value,
    ).toBe("Cliente Teste");
    expect(
      (screen.getByTestId("evento-form-processo-locked") as HTMLInputElement)
        .value,
    ).toBe("0001234-56.2026.8.05.0001");

    await user.type(
      screen.getByLabelText(/Título do Evento/i),
      "Audiência de conciliação",
    );
    await user.click(screen.getByRole("button", { name: /Criar audiência/i }));

    await waitFor(() => expect(createEventoMock).toHaveBeenCalledTimes(1));
    expect(createEventoMock.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        tipo: EventoTipo.AUDIENCIA,
        processoId: "processo-1",
        clienteId: "cliente-1",
        advogadoResponsavelId: "adv-1",
        titulo: "Audiência de conciliação",
      }),
    );
    expect(onSuccess).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
