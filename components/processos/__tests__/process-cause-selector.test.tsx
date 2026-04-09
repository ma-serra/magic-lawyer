import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ProcessCauseSelector } from "@/components/processos/process-cause-selector";

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

jest.mock("@heroui/button", () => ({
  Button: ({
    children,
    onPress,
    startContent,
    type = "button",
    ...props
  }: any) => (
    <button type={type} onClick={onPress}>
      {startContent}
      {children}
    </button>
  ),
}));

jest.mock("@heroui/input", () => ({
  Input: ({
    description,
    label,
    startContent,
    value,
    onKeyDown,
    onValueChange,
  }: any) => (
    <label>
      <span>{label}</span>
      {startContent}
      <input
        aria-label={label}
        value={value}
        onChange={(event) => onValueChange?.(event.target.value)}
        onKeyDown={onKeyDown}
      />
      {description ? <span>{description}</span> : null}
    </label>
  ),
}));

describe("ProcessCauseSelector", () => {
  const causas = [
    { id: "causa-1", nome: "Direito do Consumidor", codigoCnj: null },
    { id: "causa-2", nome: "Dano Moral", codigoCnj: "1234" },
    { id: "causa-3", nome: "Responsabilidade Civil", codigoCnj: null },
  ];

  it("adiciona e remove assuntos selecionados sem sair do formulario", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();

    render(
      <ProcessCauseSelector
        causas={causas}
        selectedCauseIds={["causa-2"]}
        onChange={onChange}
        onOpenCreate={jest.fn()}
      />,
    );

    expect(screen.getByText("Dano Moral")).toBeTruthy();

    await user.type(screen.getByLabelText("Buscar assunto"), "consumidor");
    await user.click(screen.getByText("Direito do Consumidor"));

    expect(onChange).toHaveBeenCalledWith(["causa-2", "causa-1"]);

    await user.click(screen.getByRole("button", { name: "Remover Dano Moral" }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("mostra CTA de criacao para admin no estado vazio e usa o texto digitado", async () => {
    const user = userEvent.setup();
    const onOpenCreate = jest.fn();

    render(
      <ProcessCauseSelector
        canQuickCreateCatalog
        causas={causas}
        selectedCauseIds={[]}
        onChange={jest.fn()}
        onOpenCreate={onOpenCreate}
      />,
    );

    await user.type(screen.getByLabelText("Buscar assunto"), "fraude bancaria");
    await user.click(screen.getByText('Criar assunto "fraude bancaria"'));

    expect(onOpenCreate).toHaveBeenCalledWith("fraude bancaria");
  });

  it("oculta a criacao para perfis sem permissao", async () => {
    const user = userEvent.setup();

    render(
      <ProcessCauseSelector
        causas={causas}
        selectedCauseIds={[]}
        onChange={jest.fn()}
        onOpenCreate={jest.fn()}
      />,
    );

    await user.type(screen.getByLabelText("Buscar assunto"), "fraude bancaria");

    expect(screen.getByText(/Sem permissao para criar assunto/i)).toBeTruthy();
    expect(
      screen.queryByText('Criar assunto "fraude bancaria"'),
    ).toBeNull();
  });
});
