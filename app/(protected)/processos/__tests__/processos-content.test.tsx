import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ProcessosContent } from "../processos-content";

const useAllProcessosMock = jest.fn();
const processoAudienciasModalMock = jest.fn();
const addToastMock = jest.fn();

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

jest.mock("@/app/hooks/use-processos", () => ({
  useAllProcessos: () => useAllProcessosMock(),
}));

jest.mock("@/app/hooks/use-clientes", () => ({
  useClientesParaSelect: () => ({ clientes: [] }),
}));

jest.mock("@/app/hooks/use-advogados-select", () => ({
  useAdvogadosParaSelect: () => ({ advogados: [] }),
}));

jest.mock("@/components/people-ui", () => ({
  PeoplePageHeader: ({ actions, title }: any) => (
    <div>
      <h1>{title}</h1>
      <div>{actions}</div>
    </div>
  ),
}));

jest.mock("@/components/searchable-select", () => ({
  SearchableSelect: ({ label }: any) => <div>{label}</div>,
}));

jest.mock("@/components/ui/date-range-input", () => ({
  DateRangeInput: ({ label }: any) => <div>{label}</div>,
}));

jest.mock("../processos-import-modal", () => ({
  ProcessosImportModal: () => null,
}));

jest.mock("../processos-sync-oab-modal", () => ({
  ProcessosSyncOabModal: () => null,
}));

jest.mock(
  "@/components/processos/processo-audiencias-modal",
  () => ({
    ProcessoAudienciasModal: (props: any) => {
      processoAudienciasModalMock(props);
      return props.isOpen ? (
        <div data-testid="processo-audiencias-modal">{props.processoId}</div>
      ) : null;
    },
  }),
);

jest.mock("@heroui/card", () => ({
  Card: ({ children }: any) => <div>{children}</div>,
  CardBody: ({ children }: any) => <div>{children}</div>,
  CardHeader: ({ children }: any) => <div>{children}</div>,
}));

jest.mock("@heroui/chip", () => ({
  Chip: ({ children }: any) => <span>{children}</span>,
}));

jest.mock("@heroui/divider", () => ({
  Divider: () => <hr />,
}));

jest.mock("@heroui/spinner", () => ({
  Spinner: ({ label }: any) => <div>{label || "Loading"}</div>,
}));

jest.mock("@heroui/button", () => ({
  Button: ({
    "aria-label": ariaLabel,
    children,
    onClick,
    onPress,
  }: any) => (
    <button aria-label={ariaLabel} onClick={onClick ?? onPress}>
      {children}
    </button>
  ),
}));

jest.mock("@heroui/input", () => ({
  Input: ({ placeholder, value, onChange }: any) => (
    <input placeholder={placeholder} value={value ?? ""} onChange={onChange} />
  ),
}));

jest.mock("@heroui/react", () => ({
  Pagination: () => null,
  Select: ({ children, label }: any) => (
    <label>
      {label}
      <div>{children}</div>
    </label>
  ),
  SelectItem: ({ children }: any) => <div>{children}</div>,
}));

jest.mock("@heroui/toast", () => ({
  addToast: (...args: any[]) => addToastMock(...args),
}));

jest.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: any) => children,
  motion: new Proxy(
    {},
    {
      get:
        () =>
        ({
          animate,
          exit,
          initial,
          layout,
          transition,
          variants,
          whileHover,
          whileTap,
          whileInView,
          children,
          ...props
        }: any) => <div {...props}>{children}</div>,
    },
  ),
}));

describe("ProcessosContent", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    useAllProcessosMock.mockReturnValue({
      processos: [
        {
          id: "processo-1",
          numero: "0001",
          numeroCnj: null,
          titulo: "Processo com uma audiência",
          status: "EM_ANDAMENTO",
          arquivamentoTipo: null,
          classeProcessual: "Ação",
          comarca: "Belém",
          dataDistribuicao: "2026-04-01T00:00:00.000Z",
          prazoPrincipal: "2026-04-20T00:00:00.000Z",
          valorCausa: 1000,
          segredoJustica: false,
          area: { nome: "Trabalhista" },
          clienteId: "cliente-1",
          advogadoResponsavelId: "adv-1",
          cliente: { id: "cliente-1", nome: "Cliente Um", tipoPessoa: "FISICA" },
          advogadoResponsavel: {
            id: "adv-1",
            usuario: { firstName: "Sandra", lastName: "Costa" },
          },
          partes: [],
          tags: null,
          _count: {
            documentos: 1,
            eventos: 2,
          },
          audienciasCount: 1,
        },
        {
          id: "processo-2",
          numero: "0002",
          numeroCnj: null,
          titulo: "Processo com duas audiências",
          status: "EM_ANDAMENTO",
          arquivamentoTipo: null,
          classeProcessual: "Ação",
          comarca: "Belém",
          dataDistribuicao: "2026-04-02T00:00:00.000Z",
          prazoPrincipal: "2026-04-21T00:00:00.000Z",
          valorCausa: 2000,
          segredoJustica: false,
          area: { nome: "Cível" },
          clienteId: "cliente-2",
          advogadoResponsavelId: "adv-2",
          cliente: { id: "cliente-2", nome: "Cliente Dois", tipoPessoa: "JURIDICA" },
          advogadoResponsavel: {
            id: "adv-2",
            usuario: { firstName: "Luciano", lastName: "Santos" },
          },
          partes: [],
          tags: null,
          _count: {
            documentos: 0,
            eventos: 3,
          },
          audienciasCount: 2,
        },
        {
          id: "processo-3",
          numero: "0003",
          numeroCnj: null,
          titulo: "Processo sem audiência",
          status: "EM_ANDAMENTO",
          arquivamentoTipo: null,
          classeProcessual: "Ação",
          comarca: "Belém",
          dataDistribuicao: "2026-04-03T00:00:00.000Z",
          prazoPrincipal: null,
          valorCausa: null,
          segredoJustica: false,
          area: { nome: "Família" },
          clienteId: "cliente-3",
          advogadoResponsavelId: null,
          cliente: { id: "cliente-3", nome: "Cliente Três", tipoPessoa: "FISICA" },
          advogadoResponsavel: null,
          partes: [],
          tags: null,
          _count: {
            documentos: 0,
            eventos: 0,
          },
          audienciasCount: 0,
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
      refresh: jest.fn(),
    });
  });

  it("renderiza o botão de audiências apenas quando houver contagem e funciona em cards e lista", async () => {
    const user = userEvent.setup();

    render(
      <ProcessosContent
        canCreateAgendaEvento
        canCreateProcesso
        canEditAgendaEvento
        canSyncOab={false}
      />,
    );

    expect(screen.getByText("1 audiência")).toBeTruthy();
    expect(screen.getByText("2 audiências")).toBeTruthy();
    expect(screen.queryByText("0 audiência")).toBeNull();

    await user.click(screen.getByText("1 audiência"));

    expect(
      screen.getByTestId("processo-audiencias-modal").textContent,
    ).toContain("processo-1");

    await user.click(screen.getByLabelText(/Visualizar em lista/i));
    await user.click(screen.getByText("2 audiências"));

    expect(
      screen.getByTestId("processo-audiencias-modal").textContent,
    ).toContain("processo-2");
  });
});
