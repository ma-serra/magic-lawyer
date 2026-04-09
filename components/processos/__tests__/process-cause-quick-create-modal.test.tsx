import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ProcessCauseQuickCreateModal } from "@/components/processos/process-cause-quick-create-modal";

const createCausaMock = jest.fn();
const toastSuccessMock = jest.fn();
const toastErrorMock = jest.fn();

jest.mock("@/app/actions/causas", () => ({
  createCausa: (...args: any[]) => createCausaMock(...args),
}));

jest.mock("@/components/processos/process-cause-form-fields", () => ({
  ProcessCauseFormFields: ({ value, onChange }: any) => (
    <label>
      <span>Nome do assunto</span>
      <input
        aria-label="Nome do assunto"
        value={value.nome}
        onChange={(event) =>
          onChange({
            ...value,
            nome: event.target.value,
          })
        }
      />
    </label>
  ),
}));

jest.mock("@/components/ui/modal", () => ({
  Modal: ({ children, footerContent, isOpen, title }: any) =>
    isOpen ? (
      <div>
        <div>{title}</div>
        {children}
        {footerContent}
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
  Button: ({ children, isLoading, onPress }: any) => (
    <button disabled={Boolean(isLoading)} onClick={onPress}>
      {children}
    </button>
  ),
}));

describe("ProcessCauseQuickCreateModal", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("prefill o nome digitado e devolve o assunto criado", async () => {
    const user = userEvent.setup();
    const onCreated = jest.fn();
    const onClose = jest.fn();

    createCausaMock.mockResolvedValue({
      success: true,
      causa: {
        id: "causa-99",
        nome: "Fraude bancaria",
        codigoCnj: null,
        descricao: null,
        ativo: true,
        isOficial: false,
      },
    });

    render(
      <ProcessCauseQuickCreateModal
        initialNome="Fraude bancaria"
        isOpen
        onClose={onClose}
        onCreated={onCreated}
      />,
    );

    expect(
      (screen.getByLabelText("Nome do assunto") as HTMLInputElement).value,
    ).toBe("Fraude bancaria");

    await user.click(screen.getByText("Salvar assunto"));

    await waitFor(() =>
      expect(createCausaMock).toHaveBeenCalledWith({
        nome: "Fraude bancaria",
        descricao: null,
      }),
    );
    await waitFor(() =>
      expect(onCreated).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "causa-99",
          nome: "Fraude bancaria",
        }),
      ),
    );
    expect(onClose).toHaveBeenCalled();
    expect(toastSuccessMock).toHaveBeenCalled();
  });
});
