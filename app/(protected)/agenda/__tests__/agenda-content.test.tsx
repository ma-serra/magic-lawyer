import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import AgendaPage from "../agenda-content";

const useSessionMock = jest.fn();
const useUserPermissionsMock = jest.fn();
const useHolidayExperienceRolloutMock = jest.fn();
const useEventoFormDataMock = jest.fn();
const useEventosMock = jest.fn();
const useAgendaResumoMock = jest.fn();
const useAgendaDisponibilidadeMock = jest.fn();
const eventoFormMock = jest.fn();

jest.mock("next-auth/react", () => ({
  useSession: () => useSessionMock(),
}));

jest.mock("@heroui/react", () => {
  const actual = jest.requireActual("@heroui/react");

  return {
    ...actual,
    Tooltip: ({ children }: any) => children,
  };
});

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
  m: new Proxy(
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

jest.mock("@/app/hooks/use-user-permissions", () => ({
  useUserPermissions: () => useUserPermissionsMock(),
}));

jest.mock("@/app/hooks/use-holiday-experience", () => ({
  useHolidayExperienceRollout: () => useHolidayExperienceRolloutMock(),
}));

jest.mock("@/app/hooks/use-eventos", () => ({
  useEventoFormData: () => useEventoFormDataMock(),
  useEventos: (...args: any[]) => useEventosMock(...args),
  useAgendaResumo: (...args: any[]) => useAgendaResumoMock(...args),
}));

jest.mock("@/app/hooks/use-agenda-disponibilidade", () => ({
  useAgendaDisponibilidade: (...args: any[]) =>
    useAgendaDisponibilidadeMock(...args),
}));

jest.mock("@/app/actions/eventos", () => ({
  confirmarParticipacaoEvento: jest.fn(),
  deleteEvento: jest.fn(),
  getEventoById: jest.fn(),
  marcarEventoComoRealizado: jest.fn(),
}));

jest.mock("@/app/actions/agenda-disponibilidade", () => ({
  salvarMinhaDisponibilidadeAgenda: jest.fn(),
}));

jest.mock("@/components/evento-form", () => (props: any) => {
  eventoFormMock(props);
  return null;
});

jest.mock("@/components/google-calendar-button", () => () => (
  <div>Google Calendar</div>
));

jest.mock("@/components/google-calendar-status", () => () => (
  <div>Status Google Calendar</div>
));

jest.mock("@/components/holiday-impact/holiday-impact-panel", () => ({
  HolidayImpactPanel: () => null,
}));

jest.mock("@/components/searchable-select", () => ({
  SearchableSelect: ({
    "aria-label": ariaLabel,
    placeholder,
  }: {
    "aria-label": string;
    placeholder: string;
  }) => <div aria-label={ariaLabel}>{placeholder}</div>,
}));

jest.mock("@/components/ui/date-range-input", () => ({
  DateRangeInput: () => <div>Período livre</div>,
}));

jest.mock("@/lib/toast", () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

function buildEventosResponse(enabled?: boolean) {
  return {
    eventos: enabled
      ? [
          {
            id: "evento-1",
            titulo: "Audiencia mensal",
            descricao: "Resumo do evento",
            tipo: "AUDIENCIA",
            status: "AGENDADO",
            dataInicio: new Date(2026, 3, 8, 14, 0, 0),
            dataFim: new Date(2026, 3, 8, 15, 0, 0),
            local: "Forum central",
            isOnline: false,
            linkAcesso: null,
            participantes: [],
            confirmacoes: [],
            prazosOriginados: [],
            cliente: {
              id: "cliente-1",
              nome: "Cliente Teste",
            },
            processo: {
              id: "processo-1",
              numero: "0001234-56.2026.8.05.0001",
              titulo: "Processo Teste",
            },
          },
        ]
      : [],
    meta: {
      total: enabled ? 1 : 0,
      page: 1,
      pageSize: 20,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    },
    isLoading: false,
    error: null,
    mutate: jest.fn(),
  };
}

describe("AgendaPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    useSessionMock.mockReturnValue({
      data: {
        user: {
          email: "admin@magiclawyer.com.br",
        },
      },
    });
    useUserPermissionsMock.mockReturnValue({
      permissions: {
        canCreateEvents: true,
        canEditAllEvents: false,
      },
      isCliente: false,
      isAdvogado: false,
    });
    useHolidayExperienceRolloutMock.mockReturnValue({
      rollout: {
        surfaces: [],
      },
    });
    useEventoFormDataMock.mockReturnValue({
      formData: {
        processos: [],
        clientes: [],
        advogados: [],
      },
    });
    useEventosMock.mockImplementation(
      (_filters: any, options?: { enabled?: boolean }) =>
        buildEventosResponse(options?.enabled),
    );
    useAgendaResumoMock.mockReturnValue({
      resumo: {
        totalPeriodo: 1,
        audienciasPeriodo: 1,
        eventosHoje: 1,
        proximoEvento: {
          id: "evento-1",
          titulo: "Audiencia mensal",
          dataInicio: new Date(2026, 3, 8, 14, 0, 0),
          dataFim: new Date(2026, 3, 8, 15, 0, 0),
          tipo: "AUDIENCIA",
          status: "AGENDADO",
        },
      },
      isLoading: false,
      mutate: jest.fn(),
    });
    useAgendaDisponibilidadeMock.mockReturnValue({
      disponibilidade: [
        {
          diaSemana: 1,
          nomeDia: "Segunda",
          ativo: true,
          horaInicio: "08:00",
          horaFim: "18:00",
          intervaloInicio: "12:00",
          intervaloFim: "13:00",
          observacoes: null,
        },
      ],
      fromDefault: false,
      mutate: jest.fn(),
    });
  });

  it("abre na aba Geral e mantem filtros visiveis sem expansao extra", async () => {
    const user = userEvent.setup();

    render(<AgendaPage />);

    expect(await screen.findByText(/Visão geral do mês/i)).toBeTruthy();
    expect(screen.getByText(/Busca por título/i)).toBeTruthy();
    expect(screen.getByLabelText(/Filtrar por origem do evento/i)).toBeTruthy();

    await waitFor(() =>
      expect(
        screen
          .getByRole("tab", { name: /geral/i })
          .getAttribute("aria-selected"),
      ).toBe("true"),
    );

    await user.click(screen.getByRole("tab", { name: /lista/i }));

    expect(
      await screen.findByRole("heading", { name: /Lista cronológica/i }),
    ).toBeTruthy();
    expect(screen.getAllByText(/Período livre/i).length).toBeGreaterThan(0);
    expect(eventoFormMock).toHaveBeenCalled();
    expect(eventoFormMock.mock.calls.at(-1)?.[0]?.preset).toBeUndefined();
    expect(eventoFormMock.mock.calls.at(-1)?.[0]?.locks).toBeUndefined();
  });
});
