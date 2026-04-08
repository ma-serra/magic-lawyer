"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Building,
  Calendar,
  CalendarDays,
  Check,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  Edit,
  ExternalLink,
  FileText,
  HelpCircle,
  Info,
  MapPin,
  MoreVertical,
  Plus,
  RotateCcw,
  Scale,
  Search,
  User,
  Users,
  Video,
  X,
  XCircle,
  MapPin as PlaceIcon,
} from "lucide-react";
import { FaGoogle } from "react-icons/fa";
import { AnimatePresence, motion } from "framer-motion";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
  Input,
  Pagination,
  Select,
  SelectItem,
  Spinner,
  Tab,
  Tabs,
  Tooltip,
} from "@heroui/react";
import { Calendar as CalendarComponent } from "@heroui/react";
import {
  getLocalTimeZone,
  startOfMonth,
  startOfWeek,
  today,
} from "@internationalized/date";
import { useSession } from "next-auth/react";

import {
  confirmarParticipacaoEvento,
  deleteEvento,
  getEventoById,
  marcarEventoComoRealizado,
} from "@/app/actions/eventos";
import {
  salvarMinhaDisponibilidadeAgenda,
  type AgendaDisponibilidadeView,
} from "@/app/actions/agenda-disponibilidade";
import { useAgendaDisponibilidade } from "@/app/hooks/use-agenda-disponibilidade";
import {
  useAgendaResumo,
  useEventos,
  useEventoFormData,
} from "@/app/hooks/use-eventos";
import { useHolidayExperienceRollout } from "@/app/hooks/use-holiday-experience";
import { useUserPermissions } from "@/app/hooks/use-user-permissions";
import {
  buildAgendaMonthRange,
  formatAgendaMonthLabel,
  groupEventosByDay,
} from "@/app/lib/agenda-view";
import { DateUtils } from "@/app/lib/date-utils";
import { Evento, EventoConfirmacaoStatus } from "@/generated/prisma";
import EventoForm from "@/components/evento-form";
import GoogleCalendarButton from "@/components/google-calendar-button";
import GoogleCalendarStatusCard from "@/components/google-calendar-status";
import { HolidayImpactPanel } from "@/components/holiday-impact/holiday-impact-panel";
import {
  PeopleEmptyState,
  PeopleMetricCard,
  PeoplePageHeader,
} from "@/components/people-ui";
import { SearchableSelect } from "@/components/searchable-select";
import { DateRangeInput } from "@/components/ui/date-range-input";
import { toast } from "@/lib/toast";

type ViewMode = "general" | "calendar" | "list";

type EventoComConfirmacoes = Evento & {
  confirmacoes?: Array<{
    id: string;
    participanteEmail: string;
    participanteNome?: string | null;
    status: EventoConfirmacaoStatus;
    confirmadoEm?: Date | null;
    observacoes?: string | null;
  }>;
  prazosOriginados?: Array<{
    id: string;
    titulo: string;
    dataVencimento: Date | string;
    status: string;
    holidayImpact?: unknown;
  }>;
  cliente?: {
    id: string;
    nome: string;
    email?: string | null;
  } | null;
  processo?: {
    id: string;
    numero: string;
    titulo?: string | null;
  } | null;
};

const panelClassName =
  "border border-divider/70 bg-content1/75 shadow-sm backdrop-blur-md";

const tiposEvento = {
  REUNIAO: { label: "Reunião", color: "primary" as const },
  AUDIENCIA: { label: "Audiência", color: "warning" as const },
  CONSULTA: { label: "Consulta", color: "success" as const },
  PRAZO: { label: "Prazo", color: "danger" as const },
  LEMBRETE: { label: "Lembrete", color: "secondary" as const },
};

const statusEvento = {
  AGENDADO: { label: "Agendado", color: "default" as const },
  CONFIRMADO: { label: "Confirmado", color: "primary" as const },
  REALIZADO: { label: "Realizado", color: "success" as const },
  CANCELADO: { label: "Cancelado", color: "danger" as const },
};

const statusConfirmacao = {
  PENDENTE: { label: "Pendente", color: "warning" as const, icon: AlertCircle },
  CONFIRMADO: { label: "Confirmado", color: "success" as const, icon: Check },
  RECUSADO: { label: "Recusado", color: "danger" as const, icon: X },
  TALVEZ: { label: "Talvez", color: "secondary" as const, icon: HelpCircle },
};

export default function AgendaPage() {
  const [isHydrated, setIsHydrated] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("general");
  const [selectedDate, setSelectedDate] = useState(today(getLocalTimeZone()));
  const [generalReferenceDate, setGeneralReferenceDate] = useState(() =>
    DateUtils.startOfMonth(new Date()).toDate(),
  );
  const [isEventoFormOpen, setIsEventoFormOpen] = useState(false);
  const [eventoEditando, setEventoEditando] = useState<Evento | null>(null);
  const [selectedDateForEvent, setSelectedDateForEvent] = useState<Date | null>(
    null,
  );

  const [filtroTipo, setFiltroTipo] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("");
  const [filtroCliente, setFiltroCliente] = useState("");
  const [filtroProcesso, setFiltroProcesso] = useState("");
  const [filtroAdvogado, setFiltroAdvogado] = useState("");
  const [filtroLocal, setFiltroLocal] = useState("");
  const [filtroTitulo, setFiltroTitulo] = useState("");
  const [filtroDataRange, setFiltroDataRange] = useState<any>(null);
  const [filtroGoogle, setFiltroGoogle] = useState("");

  const [generalPage, setGeneralPage] = useState(1);
  const [generalPageSize, setGeneralPageSize] = useState(40);
  const [dayPage, setDayPage] = useState(1);
  const [dayPageSize, setDayPageSize] = useState(8);
  const [listPage, setListPage] = useState(1);
  const [listPageSize, setListPageSize] = useState(12);

  const [disponibilidadeDraft, setDisponibilidadeDraft] = useState<
    AgendaDisponibilidadeView[]
  >([]);
  const [savingDisponibilidade, setSavingDisponibilidade] = useState(false);

  const session = useSession();
  const userEmail = session?.data?.user?.email;
  const { permissions, isCliente, isAdvogado } = useUserPermissions();
  const { rollout: holidayExperienceRollout } = useHolidayExperienceRollout();
  const { formData: eventoFormData } = useEventoFormData();
  const {
    disponibilidade,
    fromDefault: disponibilidadePadrao,
    mutate: mutateDisponibilidade,
  } = useAgendaDisponibilidade(!isCliente);

  const filtroOrigem = useMemo<"google" | "local" | undefined>(
    () =>
      filtroGoogle === "google" || filtroGoogle === "local"
        ? filtroGoogle
        : undefined,
    [filtroGoogle],
  );
  const holidayAgendaEnabled =
    holidayExperienceRollout?.surfaces.find((surface) => surface.key === "agenda")
      ?.enabled ?? false;

  const filtrosBase = useMemo(
    () => ({
      tipo: filtroTipo || undefined,
      status: filtroStatus || undefined,
      clienteId: filtroCliente || undefined,
      processoId: filtroProcesso || undefined,
      advogadoId: filtroAdvogado || undefined,
      local: filtroLocal || undefined,
      titulo: filtroTitulo || undefined,
      origem: filtroOrigem,
    }),
    [
      filtroAdvogado,
      filtroCliente,
      filtroLocal,
      filtroOrigem,
      filtroProcesso,
      filtroStatus,
      filtroTipo,
      filtroTitulo,
    ],
  );

  const generalMonthRange = useMemo(
    () => buildAgendaMonthRange(generalReferenceDate),
    [generalReferenceDate],
  );
  const generalMonthLabel = useMemo(
    () => formatAgendaMonthLabel(generalReferenceDate),
    [generalReferenceDate],
  );
  const selectedDateDayjs = useMemo(
    () => DateUtils.fromCalendarDate(selectedDate),
    [selectedDate],
  );

  const filtrosGeneral = useMemo(
    () => ({
      ...filtrosBase,
      dataInicio: generalMonthRange.start,
      dataFim: generalMonthRange.end,
    }),
    [filtrosBase, generalMonthRange.end, generalMonthRange.start],
  );
  const filtrosDia = useMemo(
    () => ({
      ...filtrosBase,
      dataInicio: selectedDateDayjs.startOf("day").toDate(),
      dataFim: selectedDateDayjs.endOf("day").toDate(),
    }),
    [filtrosBase, selectedDateDayjs],
  );
  const filtrosLista = useMemo(
    () => ({
      ...filtrosBase,
      dataInicio: filtroDataRange?.start
        ? DateUtils.fromCalendarDate(filtroDataRange.start).startOf("day").toDate()
        : undefined,
      dataFim: filtroDataRange?.end
        ? DateUtils.fromCalendarDate(filtroDataRange.end).endOf("day").toDate()
        : undefined,
    }),
    [filtroDataRange, filtrosBase],
  );

  const {
    eventos: eventosGerais,
    meta: geralMeta,
    isLoading: isLoadingGeneral,
    error: errorGeneral,
    mutate: mutateGeneral,
  } = useEventos(filtrosGeneral, {
    page: generalPage,
    pageSize: generalPageSize,
    enabled: viewMode === "general",
  });
  const {
    eventos: eventosDia,
    meta: diaMeta,
    isLoading: isLoadingDia,
    error: errorDia,
    mutate: mutateDia,
  } = useEventos(filtrosDia, {
    page: dayPage,
    pageSize: dayPageSize,
    enabled: viewMode === "calendar",
  });
  const {
    eventos: eventosLista,
    meta: listaMeta,
    isLoading: isLoadingLista,
    error: errorLista,
    mutate: mutateLista,
  } = useEventos(filtrosLista, {
    page: listPage,
    pageSize: listPageSize,
    enabled: viewMode === "list",
  });
  const {
    resumo,
    isLoading: isLoadingResumo,
    mutate: mutateResumo,
  } = useAgendaResumo(filtrosBase, {
    periodoInicio: generalMonthRange.start,
    periodoFim: generalMonthRange.end,
    enabled: isHydrated,
  });

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (disponibilidade.length > 0) {
      setDisponibilidadeDraft(disponibilidade);
    }
  }, [disponibilidade]);

  useEffect(() => {
    setGeneralPage(1);
  }, [
    filtroAdvogado,
    filtroCliente,
    filtroGoogle,
    filtroLocal,
    filtroProcesso,
    filtroStatus,
    filtroTipo,
    filtroTitulo,
    generalPageSize,
    generalReferenceDate,
  ]);

  useEffect(() => {
    setDayPage(1);
  }, [
    dayPageSize,
    filtroAdvogado,
    filtroCliente,
    filtroGoogle,
    filtroLocal,
    filtroProcesso,
    filtroStatus,
    filtroTipo,
    filtroTitulo,
    selectedDate,
  ]);

  useEffect(() => {
    setListPage(1);
  }, [
    filtroAdvogado,
    filtroCliente,
    filtroDataRange,
    filtroGoogle,
    filtroLocal,
    filtroProcesso,
    filtroStatus,
    filtroTipo,
    filtroTitulo,
    listPageSize,
  ]);

  useEffect(() => {
    setGeneralPage((prev) => Math.min(prev, geralMeta.totalPages));
  }, [geralMeta.totalPages]);

  useEffect(() => {
    setDayPage((prev) => Math.min(prev, diaMeta.totalPages));
  }, [diaMeta.totalPages]);

  useEffect(() => {
    setListPage((prev) => Math.min(prev, listaMeta.totalPages));
  }, [listaMeta.totalPages]);

  const eventosGeraisFiltrados = (eventosGerais || []) as EventoComConfirmacoes[];
  const eventosDiaFiltrados = (eventosDia || []) as EventoComConfirmacoes[];
  const eventosListaFiltrados = (eventosLista || []) as EventoComConfirmacoes[];

  const eventosAtivos = useMemo(() => {
    if (viewMode === "general") {
      return eventosGeraisFiltrados;
    }

    if (viewMode === "calendar") {
      return eventosDiaFiltrados;
    }

    return eventosListaFiltrados;
  }, [eventosDiaFiltrados, eventosGeraisFiltrados, eventosListaFiltrados, viewMode]);

  const generalDayGroups = useMemo(
    () => groupEventosByDay(eventosGeraisFiltrados),
    [eventosGeraisFiltrados],
  );
  const confirmacoesVisiveis = useMemo(
    () =>
      eventosAtivos.reduce(
        (total, evento) => total + (evento.confirmacoes?.length || 0),
        0,
      ),
    [eventosAtivos],
  );

  const clientesFiltro = useMemo(
    () => eventoFormData?.clientes || [],
    [eventoFormData?.clientes],
  );
  const processosFiltro = useMemo(() => {
    const todosProcessos = eventoFormData?.processos || [];

    if (!filtroCliente) {
      return todosProcessos;
    }

    return todosProcessos.filter((processo) => processo.clienteId === filtroCliente);
  }, [eventoFormData?.processos, filtroCliente]);
  const advogadosFiltro = useMemo(
    () => eventoFormData?.advogados || [],
    [eventoFormData?.advogados],
  );

  const clienteFilterOptions = useMemo(
    () =>
      clientesFiltro.map((cliente) => ({
        key: cliente.id,
        label: cliente.nome,
        textValue: [cliente.nome, cliente.email || ""].filter(Boolean).join(" "),
        description: cliente.email || undefined,
      })),
    [clientesFiltro],
  );
  const processoFilterOptions = useMemo(
    () =>
      processosFiltro.map((processo) => ({
        key: processo.id,
        label: processo.numero,
        textValue: [processo.numero, processo.titulo || "Sem titulo"]
          .filter(Boolean)
          .join(" "),
        description: processo.titulo || "Sem titulo",
      })),
    [processosFiltro],
  );
  const advogadoFilterOptions = useMemo(
    () =>
      advogadosFiltro.map((advogado: any) => {
        const nomeCompleto =
          `${advogado.usuario.firstName || ""} ${
            advogado.usuario.lastName || ""
          }`.trim() || advogado.usuario.email;

        return {
          key: advogado.id,
          label: nomeCompleto,
          textValue: [nomeCompleto, advogado.usuario.email || ""]
            .filter(Boolean)
            .join(" "),
          description: advogado.usuario.email || undefined,
        };
      }),
    [advogadosFiltro],
  );

  const hasActiveFilters = Boolean(
    filtroTipo ||
      filtroStatus ||
      filtroCliente ||
      filtroProcesso ||
      filtroAdvogado ||
      filtroLocal ||
      filtroTitulo ||
      filtroGoogle ||
      filtroDataRange,
  );
  const activeFilterCount = [
    filtroTipo,
    filtroStatus,
    filtroCliente,
    filtroProcesso,
    filtroAdvogado,
    filtroLocal,
    filtroTitulo,
    filtroGoogle,
    filtroDataRange,
  ].filter(Boolean).length;
  const proximoEventoMetricValue = resumo.proximoEvento
    ? DateUtils.formatDate(resumo.proximoEvento.dataInicio)
    : "Sem agenda";
  const proximoEventoMetricHelper = resumo.proximoEvento
    ? `${DateUtils.formatTime(resumo.proximoEvento.dataInicio)} • ${
        resumo.proximoEvento.titulo
      }`
    : "Nenhum evento futuro nos filtros atuais";

  const mutate = () =>
    Promise.all([
      mutateGeneral(),
      mutateDia(),
      mutateLista(),
      mutateResumo(),
    ]).then(() => undefined);

  const handleCreateEvento = () => {
    setEventoEditando(null);
    setSelectedDateForEvent(null);
    setIsEventoFormOpen(true);
  };

  const handleCreateEventoNaData = (date: Date) => {
    setSelectedDateForEvent(date);
    setEventoEditando(null);
    setIsEventoFormOpen(true);
  };

  const handleEditEvento = async (evento: Evento) => {
    try {
      const result = await getEventoById(evento.id);

      if (result.success && result.data) {
        setEventoEditando(result.data);
        setIsEventoFormOpen(true);
        return;
      }

      toast.error("Erro ao carregar dados do evento");
    } catch {
      toast.error("Erro ao carregar dados do evento");
    }
  };

  const handleDeleteEvento = async (eventoId: string) => {
    if (!confirm("Tem certeza que deseja excluir este evento?")) {
      return;
    }

    try {
      const result = await deleteEvento(eventoId);

      if (result.success) {
        toast.success("Evento excluído com sucesso!");
        mutate();
        return;
      }

      toast.error(result.error || "Erro ao excluir evento");
    } catch {
      toast.error("Erro interno do servidor");
    }
  };

  const handleMarcarComoRealizado = async (eventoId: string) => {
    try {
      const result = await marcarEventoComoRealizado(eventoId);

      if (result.success) {
        toast.success("Evento marcado como realizado!");
        mutate();
        return;
      }

      toast.error(result.error || "Erro ao atualizar evento");
    } catch {
      toast.error("Erro interno do servidor");
    }
  };

  const handleEventoFormSuccess = () => {
    mutate();
    setIsEventoFormOpen(false);
    setEventoEditando(null);
    setSelectedDateForEvent(null);
  };

  const handleConfirmarParticipacao = async (
    eventoId: string,
    participanteEmail: string,
    status: EventoConfirmacaoStatus,
  ) => {
    try {
      const result = await confirmarParticipacaoEvento(
        eventoId,
        participanteEmail,
        status,
      );

      if (result.success) {
        toast.success("Confirmação atualizada com sucesso!");
        mutate();
        return;
      }

      toast.error(result.error || "Erro ao confirmar participação");
    } catch {
      toast.error("Erro interno do servidor");
    }
  };

  const updateDisponibilidadeField = (
    diaSemana: number,
    field: keyof AgendaDisponibilidadeView,
    value: string | boolean | null,
  ) => {
    setDisponibilidadeDraft((prev) =>
      prev.map((item) =>
        item.diaSemana === diaSemana ? { ...item, [field]: value } : item,
      ),
    );
  };

  const handleSalvarDisponibilidade = async () => {
    if (isCliente || disponibilidadeDraft.length === 0) {
      return;
    }

    setSavingDisponibilidade(true);
    try {
      const result = await salvarMinhaDisponibilidadeAgenda(
        disponibilidadeDraft.map((item) => ({
          diaSemana: item.diaSemana,
          ativo: item.ativo,
          horaInicio: item.horaInicio,
          horaFim: item.horaFim,
          intervaloInicio: item.intervaloInicio,
          intervaloFim: item.intervaloFim,
          observacoes: item.observacoes,
        })),
      );

      if (!result.success) {
        toast.error(
          "error" in result ? result.error : "Falha ao salvar disponibilidade.",
        );
        return;
      }

      toast.success("Disponibilidade da agenda salva com sucesso.");
      await mutateDisponibilidade();
    } catch {
      toast.error("Erro interno ao salvar disponibilidade.");
    } finally {
      setSavingDisponibilidade(false);
    }
  };

  const clearAllFilters = () => {
    setFiltroTipo("");
    setFiltroStatus("");
    setFiltroCliente("");
    setFiltroProcesso("");
    setFiltroAdvogado("");
    setFiltroLocal("");
    setFiltroTitulo("");
    setFiltroGoogle("");
    setFiltroDataRange(null);
  };

  const moveGeneralMonth = (direction: -1 | 1) => {
    setGeneralReferenceDate((current) =>
      DateUtils.addMonths(current, direction).startOf("month").toDate(),
    );
  };

  const resetGeneralMonth = () => {
    setGeneralReferenceDate(DateUtils.startOfMonth(new Date()).toDate());
  };

  const renderConfirmacoes = (evento: EventoComConfirmacoes) => {
    if (!evento.confirmacoes || evento.confirmacoes.length === 0) {
      return null;
    }

    const userConfirmacao = evento.confirmacoes.find(
      (confirmacao) => confirmacao.participanteEmail === userEmail,
    );

    return (
      <div className="mt-3">
        <div className="mb-2 text-xs text-default-500">Confirmações</div>
        {userConfirmacao ? (
          <div className="mb-2 rounded-xl bg-default-50 p-2">
            <div className="mb-2 text-xs text-default-600">Sua confirmação</div>
            <div className="flex flex-wrap gap-1">
              <Button
                className="text-xs"
                color={
                  userConfirmacao.status === "CONFIRMADO" ? "success" : "default"
                }
                size="sm"
                startContent={<Check className="h-3 w-3" />}
                variant={
                  userConfirmacao.status === "CONFIRMADO" ? "solid" : "flat"
                }
                onPress={() =>
                  handleConfirmarParticipacao(
                    evento.id,
                    userEmail || "",
                    "CONFIRMADO",
                  )
                }
              >
                Confirmar
              </Button>
              <Button
                className="text-xs"
                color={
                  userConfirmacao.status === "RECUSADO" ? "danger" : "default"
                }
                size="sm"
                startContent={<X className="h-3 w-3" />}
                variant={
                  userConfirmacao.status === "RECUSADO" ? "solid" : "flat"
                }
                onPress={() =>
                  handleConfirmarParticipacao(
                    evento.id,
                    userEmail || "",
                    "RECUSADO",
                  )
                }
              >
                Recusar
              </Button>
              <Button
                className="text-xs"
                color={
                  userConfirmacao.status === "TALVEZ" ? "secondary" : "default"
                }
                size="sm"
                startContent={<HelpCircle className="h-3 w-3" />}
                variant={userConfirmacao.status === "TALVEZ" ? "solid" : "flat"}
                onPress={() =>
                  handleConfirmarParticipacao(
                    evento.id,
                    userEmail || "",
                    "TALVEZ",
                  )
                }
              >
                Talvez
              </Button>
            </div>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-1">
          {evento.confirmacoes.map((confirmacao) => {
            const statusInfo =
              statusConfirmacao[
                confirmacao.status as keyof typeof statusConfirmacao
              ];
            const IconComponent = statusInfo?.icon || AlertCircle;

            return (
              <Tooltip
                key={confirmacao.id}
                color={statusInfo?.color || "default"}
                content={
                  <div className="text-xs">
                    <div className="font-semibold">
                      {statusInfo?.label || confirmacao.status}
                    </div>
                    {confirmacao.observacoes ? (
                      <div className="mt-1 text-default-400">
                        {confirmacao.observacoes}
                      </div>
                    ) : null}
                    {confirmacao.confirmadoEm ? (
                      <div className="mt-1 text-default-400">
                        Confirmado em{" "}
                        {new Date(confirmacao.confirmadoEm).toLocaleString("pt-BR")}
                      </div>
                    ) : null}
                  </div>
                }
                placement="top"
              >
                <Chip
                  className="cursor-help"
                  color={statusInfo?.color || "default"}
                  size="sm"
                  startContent={<IconComponent className="h-3 w-3" />}
                  variant="flat"
                >
                  {confirmacao.participanteEmail}
                </Chip>
              </Tooltip>
            );
          })}
        </div>
      </div>
    );
  };

  const renderHolidayDeadlinePanels = (evento: EventoComConfirmacoes) => {
    if (!holidayAgendaEnabled || !evento.prazosOriginados?.length) {
      return null;
    }

    return (
      <div className="mt-3 space-y-2">
        {evento.prazosOriginados.map((prazo) => (
          <HolidayImpactPanel
            key={`${evento.id}-${prazo.id}`}
            audience={isCliente ? "client" : "internal"}
            compact
            impact={prazo.holidayImpact as any}
          />
        ))}
      </div>
    );
  };

  const renderEventActions = (evento: EventoComConfirmacoes) => {
    if (!permissions.canEditAllEvents || isCliente) {
      return null;
    }

    return (
      <Dropdown>
        <DropdownTrigger>
          <Button isIconOnly className="self-start" size="sm" variant="light">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownTrigger>
        <DropdownMenu aria-label={`Ações do evento ${evento.titulo}`}>
          <DropdownItem
            key="edit"
            startContent={<Edit className="h-4 w-4" />}
            onPress={() => handleEditEvento(evento)}
          >
            Editar
          </DropdownItem>
          {evento.status !== "REALIZADO" ? (
            <DropdownItem
              key="realizado"
              startContent={<CheckCircle className="h-4 w-4" />}
              onPress={() => handleMarcarComoRealizado(evento.id)}
            >
              Marcar como realizado
            </DropdownItem>
          ) : null}
          <DropdownItem
            key="delete"
            className="text-danger"
            color="danger"
            startContent={<XCircle className="h-4 w-4" />}
            onPress={() => handleDeleteEvento(evento.id)}
          >
            Excluir
          </DropdownItem>
        </DropdownMenu>
      </Dropdown>
    );
  };

  const renderEventCompactCard = (evento: EventoComConfirmacoes) => (
    <motion.div
      key={evento.id}
      layout
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      initial={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3 }}
      whileHover={{ scale: 1.01, x: 2 }}
    >
      <Card className="border-l-4 border-l-primary">
        <CardBody className="p-4">
          <div className="mb-2 flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h4 className="flex items-center gap-2 text-sm font-semibold">
                <span className="truncate">{evento.titulo}</span>
                {evento.googleEventId ? (
                  <Tooltip content="Evento do Google Calendar">
                    <FaGoogle className="h-3 w-3 shrink-0 text-blue-500" />
                  </Tooltip>
                ) : null}
              </h4>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Chip
                  color={
                    tiposEvento[evento.tipo as keyof typeof tiposEvento]?.color ||
                    "default"
                  }
                  size="sm"
                  variant="flat"
                >
                  {tiposEvento[evento.tipo as keyof typeof tiposEvento]?.label ||
                    evento.tipo}
                </Chip>
                <Chip
                  color={
                    statusEvento[evento.status as keyof typeof statusEvento]
                      ?.color || "default"
                  }
                  size="sm"
                  variant="flat"
                >
                  {statusEvento[evento.status as keyof typeof statusEvento]
                    ?.label || evento.status}
                </Chip>
              </div>
            </div>
            {renderEventActions(evento)}
          </div>

          <div className="space-y-1 text-xs text-default-500">
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {DateUtils.formatTime(evento.dataInicio)} -{" "}
              {DateUtils.formatTime(evento.dataFim)}
            </div>
            {evento.local ? (
              <div className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {evento.local}
              </div>
            ) : null}
            {evento.isOnline && evento.linkAcesso ? (
              <div className="flex items-center gap-2">
                <Video className="h-3 w-3" />
                <a
                  className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                  href={evento.linkAcesso}
                  rel="noreferrer"
                  target="_blank"
                >
                  Abrir link do evento
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            ) : null}
            {evento.participantes.length > 0 ? (
              <div className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {evento.participantes.length} participante(s)
              </div>
            ) : null}
          </div>

          {renderConfirmacoes(evento)}
          {renderHolidayDeadlinePanels(evento)}
        </CardBody>
      </Card>
    </motion.div>
  );

  const renderEventFullCard = (evento: EventoComConfirmacoes) => (
    <motion.div
      key={evento.id}
      className="min-w-0"
      layout
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      initial={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.35 }}
      whileHover={{ y: -2 }}
    >
      <Card className="min-w-0 overflow-hidden border-l-4 border-l-primary">
        <CardBody className="p-6">
          <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
                <h4 className="min-w-0 break-words text-lg font-semibold">
                  {evento.titulo}
                </h4>
                {evento.googleEventId ? (
                  <Tooltip content="Evento do Google Calendar">
                    <FaGoogle className="h-4 w-4 shrink-0 text-blue-500" />
                  </Tooltip>
                ) : null}
                <Chip
                  className="shrink-0"
                  color={
                    tiposEvento[evento.tipo as keyof typeof tiposEvento]?.color ||
                    "default"
                  }
                  size="sm"
                  variant="flat"
                >
                  {tiposEvento[evento.tipo as keyof typeof tiposEvento]?.label ||
                    evento.tipo}
                </Chip>
                <Chip
                  className="shrink-0"
                  color={
                    statusEvento[evento.status as keyof typeof statusEvento]
                      ?.color || "default"
                  }
                  size="sm"
                  variant="flat"
                >
                  {statusEvento[evento.status as keyof typeof statusEvento]
                    ?.label || evento.status}
                </Chip>
              </div>

              {evento.descricao ? (
                <p className="mb-3 break-words text-default-600">
                  {evento.descricao}
                </p>
              ) : null}

              <div className="grid min-w-0 grid-cols-1 gap-3 text-sm md:grid-cols-2 xl:grid-cols-3">
                <div className="flex min-w-0 items-start gap-2">
                  <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-default-400" />
                  <span className="min-w-0 break-words">
                    {DateUtils.formatDate(evento.dataInicio)}
                  </span>
                </div>
                <div className="flex min-w-0 items-start gap-2">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-default-400" />
                  <span className="min-w-0 break-words">
                    {DateUtils.formatTime(evento.dataInicio)} -{" "}
                    {DateUtils.formatTime(evento.dataFim)}
                  </span>
                </div>
                {evento.local ? (
                  <div className="flex min-w-0 items-start gap-2">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-default-400" />
                    <span className="min-w-0 break-words">{evento.local}</span>
                  </div>
                ) : null}
                {evento.isOnline && evento.linkAcesso ? (
                  <div className="flex min-w-0 items-start gap-2">
                    <Video className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <a
                      className="inline-flex min-w-0 flex-wrap items-center gap-1 break-all font-medium text-primary hover:underline"
                      href={evento.linkAcesso}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Abrir link do evento
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                ) : null}
                {evento.participantes.length > 0 ? (
                  <div className="flex min-w-0 items-start gap-2">
                    <Users className="mt-0.5 h-4 w-4 shrink-0 text-default-400" />
                    <span className="min-w-0 break-words">
                      {evento.participantes.length} participante(s)
                    </span>
                  </div>
                ) : null}
              </div>

              {evento.cliente ? (
                <div className="mt-3 text-xs text-default-500">
                  Cliente: {evento.cliente.nome}
                </div>
              ) : null}
              {evento.processo ? (
                <div className="mt-1 text-xs text-default-500">
                  Processo: {evento.processo.numero}
                </div>
              ) : null}

              {renderConfirmacoes(evento)}
              {renderHolidayDeadlinePanels(evento)}

              {permissions.canEditAllEvents &&
              !isCliente &&
              evento.status !== "REALIZADO" ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    color="success"
                    size="sm"
                    startContent={<CheckCircle className="h-4 w-4" />}
                    variant="flat"
                    onPress={() => handleMarcarComoRealizado(evento.id)}
                  >
                    Marcar como realizado
                  </Button>
                </div>
              ) : null}
            </div>

            {renderEventActions(evento)}
          </div>
        </CardBody>
      </Card>
    </motion.div>
  );

  const renderViewError = (error: string | null) => {
    if (!error) {
      return null;
    }

    return (
      <Card className={panelClassName}>
        <CardBody className="py-12 text-center">
          <p className="text-danger">Erro ao carregar eventos: {error}</p>
          <Button className="mt-4" color="primary" onPress={() => mutate()}>
            Tentar novamente
          </Button>
        </CardBody>
      </Card>
    );
  };

  const renderGeneralView = () => {
    if (errorGeneral) {
      return renderViewError(errorGeneral as string);
    }

    return (
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        initial={{ opacity: 0, y: 20 }}
        transition={{ duration: 0.35 }}
      >
        <Card className={panelClassName}>
          <CardHeader className="flex flex-col gap-4 border-b border-divider/70 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1">
              <h3 className="text-lg font-semibold">Visão geral do mês</h3>
              <p className="text-sm text-default-500">
                Todos os compromissos do período principal, agrupados por dia.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                isIconOnly
                aria-label="Mês anterior"
                size="sm"
                variant="bordered"
                onPress={() => moveGeneralMonth(-1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Chip color="primary" size="lg" variant="flat">
                {generalMonthLabel}
              </Chip>
              <Button size="sm" variant="bordered" onPress={resetGeneralMonth}>
                Mês atual
              </Button>
              <Button
                isIconOnly
                aria-label="Próximo mês"
                size="sm"
                variant="bordered"
                onPress={() => moveGeneralMonth(1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardBody className="space-y-6 p-4 sm:p-6">
            {isLoadingGeneral ? (
              <div className="flex justify-center py-16">
                <Spinner label="Carregando visão geral..." size="lg" />
              </div>
            ) : generalDayGroups.length === 0 ? (
              <PeopleEmptyState
                action={
                  <div className="flex flex-wrap justify-center gap-2">
                    {hasActiveFilters ? (
                      <Button
                        size="sm"
                        startContent={<RotateCcw className="h-4 w-4" />}
                        variant="flat"
                        onPress={clearAllFilters}
                      >
                        Limpar filtros
                      </Button>
                    ) : null}
                    {permissions.canCreateEvents && !isCliente ? (
                      <Button
                        color="primary"
                        size="sm"
                        startContent={<Plus className="h-4 w-4" />}
                        onPress={handleCreateEvento}
                      >
                        Novo evento
                      </Button>
                    ) : null}
                  </div>
                }
                description="A agenda principal abre por mês. Ajuste o recorte ou crie um novo compromisso."
                icon={<CalendarDays className="h-6 w-6" />}
                title="Nenhum evento neste mês"
              />
            ) : (
              <>
                <div className="space-y-6">
                  {generalDayGroups.map((group) => (
                    <section key={group.key} className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2 border-b border-divider/70 pb-3">
                        <h4 className="text-base font-semibold text-foreground">
                          {group.label}
                        </h4>
                        {group.contextualLabel ? (
                          <Chip color="primary" size="sm" variant="flat">
                            {group.contextualLabel}
                          </Chip>
                        ) : null}
                        <Chip size="sm" variant="bordered">
                          {group.eventos.length} evento(s)
                        </Chip>
                      </div>
                      <div className="space-y-4">
                        {group.eventos.map((evento) => renderEventFullCard(evento))}
                      </div>
                    </section>
                  ))}
                </div>
                <div className="flex flex-col gap-3 border-t border-divider/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2 text-xs text-default-500">
                    <span>Total no mês: {geralMeta.total}</span>
                    <Select
                      aria-label="Por página (geral)"
                      className="w-24"
                      selectedKeys={[String(generalPageSize)]}
                      size="sm"
                      variant="bordered"
                      onSelectionChange={(keys) => {
                        const nextSize = Number(Array.from(keys)[0] as string);
                        if (!Number.isNaN(nextSize)) {
                          setGeneralPageSize(nextSize);
                        }
                      }}
                    >
                      <SelectItem key="20" textValue="20">
                        20
                      </SelectItem>
                      <SelectItem key="40" textValue="40">
                        40
                      </SelectItem>
                      <SelectItem key="60" textValue="60">
                        60
                      </SelectItem>
                      <SelectItem key="80" textValue="80">
                        80
                      </SelectItem>
                    </Select>
                  </div>
                  <Pagination
                    isCompact
                    page={geralMeta.page}
                    total={geralMeta.totalPages}
                    onChange={setGeneralPage}
                  />
                </div>
              </>
            )}
          </CardBody>
        </Card>
      </motion.div>
    );
  };

  const renderCalendarView = () => {
    if (errorDia) {
      return renderViewError(errorDia as string);
    }

    return (
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-3"
        initial={{ opacity: 0, y: 20 }}
        transition={{ duration: 0.35 }}
      >
        <motion.div
          animate={{ opacity: 1, x: 0 }}
          className="lg:col-span-2"
          initial={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.35, delay: 0.05 }}
        >
          <Card className={panelClassName}>
            <CardHeader className="border-b border-divider/70 px-4 py-4 sm:px-6">
              <div>
                <h3 className="text-lg font-semibold">Calendário diário</h3>
                <p className="text-sm text-default-500">
                  Use esta aba para inspecionar um dia específico da agenda.
                </p>
              </div>
            </CardHeader>
            <CardBody className="p-0">
              <CalendarComponent
                aria-label="Agenda"
                classNames={{
                  base: "w-full max-w-full",
                  cell: "h-16 min-w-0 w-full text-center text-lg font-medium",
                  content: "w-full max-w-full overflow-hidden",
                  grid: "w-full max-w-full",
                }}
                focusedValue={selectedDate as any}
                nextButtonProps={{
                  size: "lg",
                  variant: "bordered",
                }}
                prevButtonProps={{
                  size: "lg",
                  variant: "bordered",
                }}
                topContent={
                  <div className="border-b border-divider/70 bg-content1 px-4 py-4">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        radius="full"
                        size="sm"
                        variant="bordered"
                        onPress={() => setSelectedDate(today(getLocalTimeZone()))}
                      >
                        Hoje
                      </Button>
                      <Button
                        radius="full"
                        size="sm"
                        variant="bordered"
                        onPress={() =>
                          setSelectedDate(
                            startOfWeek(
                              today(getLocalTimeZone()).add({ weeks: 1 }),
                              "pt-BR",
                            ),
                          )
                        }
                      >
                        Próxima semana
                      </Button>
                      <Button
                        radius="full"
                        size="sm"
                        variant="bordered"
                        onPress={() =>
                          setSelectedDate(
                            startOfMonth(
                              today(getLocalTimeZone()).add({ months: 1 }),
                            ),
                          )
                        }
                      >
                        Próximo mês
                      </Button>
                    </div>
                  </div>
                }
                value={selectedDate as any}
                onChange={setSelectedDate as any}
                onFocusChange={setSelectedDate as any}
              />
            </CardBody>
          </Card>
        </motion.div>
        <motion.div
          animate={{ opacity: 1, x: 0 }}
          initial={{ opacity: 0, x: 20 }}
          transition={{ duration: 0.35, delay: 0.1 }}
        >
          <Card className={panelClassName}>
            <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-divider/70 px-4 py-4 sm:px-6">
              <div className="space-y-1">
                <h3 className="text-lg font-semibold">
                  Eventos de {DateUtils.formatCalendarDate(selectedDate)}
                </h3>
                <p className="text-sm text-default-500">
                  {diaMeta.total} evento(s) no dia selecionado
                </p>
              </div>
              {permissions.canCreateEvents && !isCliente ? (
                <Button
                  color="primary"
                  size="sm"
                  startContent={<Plus className="h-4 w-4" />}
                  onPress={() => {
                    const date = new Date(
                      selectedDate.year,
                      selectedDate.month - 1,
                      selectedDate.day,
                    );

                    handleCreateEventoNaData(date);
                  }}
                >
                  Criar evento
                </Button>
              ) : null}
            </CardHeader>
            <CardBody className="space-y-4 p-4 sm:p-6">
              {isLoadingDia ? (
                <div className="flex justify-center py-12">
                  <Spinner size="lg" />
                </div>
              ) : eventosDiaFiltrados.length === 0 ? (
                <PeopleEmptyState
                  description="Use o calendário para navegar e inspecionar datas específicas."
                  icon={<Calendar className="h-6 w-6" />}
                  title="Nenhum evento para este dia"
                />
              ) : (
                <div className="space-y-3">
                  {eventosDiaFiltrados.map((evento) => renderEventCompactCard(evento))}
                </div>
              )}
              <div className="flex flex-col gap-3 border-t border-divider/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 text-xs text-default-500">
                  <span>Itens por página</span>
                  <Select
                    aria-label="Por página (dia)"
                    className="w-24"
                    selectedKeys={[String(dayPageSize)]}
                    size="sm"
                    variant="bordered"
                    onSelectionChange={(keys) => {
                      const nextSize = Number(Array.from(keys)[0] as string);
                      if (!Number.isNaN(nextSize)) {
                        setDayPageSize(nextSize);
                      }
                    }}
                  >
                    <SelectItem key="4" textValue="4">
                      4
                    </SelectItem>
                    <SelectItem key="8" textValue="8">
                      8
                    </SelectItem>
                    <SelectItem key="12" textValue="12">
                      12
                    </SelectItem>
                    <SelectItem key="20" textValue="20">
                      20
                    </SelectItem>
                  </Select>
                </div>
                <Pagination
                  isCompact
                  page={diaMeta.page}
                  total={diaMeta.totalPages}
                  onChange={setDayPage}
                />
              </div>
            </CardBody>
          </Card>
        </motion.div>
      </motion.div>
    );
  };

  const renderListView = () => {
    if (errorLista) {
      return renderViewError(errorLista as string);
    }

    return (
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        initial={{ opacity: 0, y: 20 }}
        transition={{ duration: 0.35 }}
      >
        <Card className={panelClassName}>
          <CardHeader className="border-b border-divider/70 px-4 py-4 sm:px-6">
            <div>
              <h3 className="text-lg font-semibold">Lista cronológica</h3>
              <p className="text-sm text-default-500">
                Use esta visualização para recortes livres por período.
              </p>
            </div>
          </CardHeader>
          <CardBody className="space-y-4 p-4 sm:p-6">
            {isLoadingLista ? (
              <div className="flex justify-center py-12">
                <Spinner size="lg" />
              </div>
            ) : eventosListaFiltrados.length === 0 ? (
              <PeopleEmptyState
                description="Ajuste o período ou os filtros para ampliar o recorte."
                icon={<CalendarDays className="h-6 w-6" />}
                title="Nenhum evento encontrado"
              />
            ) : (
              <div className="space-y-4">
                {eventosListaFiltrados.map((evento) => renderEventFullCard(evento))}
              </div>
            )}
            <div className="flex flex-col gap-3 border-t border-divider/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-xs text-default-500">
                <span>Total no filtro: {listaMeta.total}</span>
                <Select
                  aria-label="Por página (lista)"
                  className="w-24"
                  selectedKeys={[String(listPageSize)]}
                  size="sm"
                  variant="bordered"
                  onSelectionChange={(keys) => {
                    const nextSize = Number(Array.from(keys)[0] as string);
                    if (!Number.isNaN(nextSize)) {
                      setListPageSize(nextSize);
                    }
                  }}
                >
                  <SelectItem key="8" textValue="8">
                    8
                  </SelectItem>
                  <SelectItem key="12" textValue="12">
                    12
                  </SelectItem>
                  <SelectItem key="20" textValue="20">
                    20
                  </SelectItem>
                  <SelectItem key="30" textValue="30">
                    30
                  </SelectItem>
                </Select>
              </div>
              <Pagination
                isCompact
                page={listaMeta.page}
                total={listaMeta.totalPages}
                onChange={setListPage}
              />
            </div>
          </CardBody>
        </Card>
      </motion.div>
    );
  };

  const renderVisibilityTabs = () => (
    <Card className={panelClassName}>
      <CardBody className="p-4 sm:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">
              Visualização principal da agenda
            </p>
            <p className="text-xs text-default-500">
              A agenda agora abre no modo geral do mês e mantém calendário e lista como apoios operacionais.
            </p>
          </div>
          <Chip color="primary" size="sm" variant="flat">
            {confirmacoesVisiveis} confirmações visíveis
          </Chip>
        </div>
        <Tabs
          aria-label="Modos de visualização da agenda"
          className="mt-4"
          color="primary"
          selectedKey={viewMode}
          variant="underlined"
          classNames={{
            base: "w-full",
            panel: "hidden",
            tab: "px-2 sm:px-3",
            tabList:
              "w-full justify-start gap-2 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]",
          }}
          onSelectionChange={(key) => setViewMode(String(key) as ViewMode)}
        >
          <Tab
            key="general"
            title={
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4" />
                <span>Geral</span>
              </div>
            }
          />
          <Tab
            key="calendar"
            title={
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                <span>Calendário</span>
              </div>
            }
          />
          <Tab
            key="list"
            title={
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                <span>Lista</span>
              </div>
            }
          />
        </Tabs>
      </CardBody>
    </Card>
  );

  const renderFilters = () => (
    <Card className={panelClassName}>
      <CardHeader className="border-b border-divider/70 px-4 py-4 sm:px-6">
        <div className="flex w-full flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-3 sm:items-center">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
              <Search className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground sm:text-lg">
                Filtros operacionais
              </h3>
              <p className="text-xs text-default-500 sm:text-sm">
                Refinamento inline por título, responsável, cliente, processo, status e origem.
              </p>
            </div>
            {hasActiveFilters ? (
              <Chip className="ml-1" color="primary" size="sm" variant="flat">
                {activeFilterCount} ativo(s)
              </Chip>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              isDisabled={!hasActiveFilters}
              size="sm"
              startContent={<RotateCcw className="h-4 w-4" />}
              variant="light"
              onPress={clearAllFilters}
            >
              Limpar filtros
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardBody className="p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {viewMode === "list" ? (
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium">
                <CalendarDays className="h-4 w-4" />
                Período livre
              </label>
              <DateRangeInput
                className="w-full"
                label="Selecione o período"
                rangeValue={filtroDataRange}
                size="sm"
                variant="bordered"
                onRangeValueChange={setFiltroDataRange}
              />
            </div>
          ) : null}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Search className="h-4 w-4" />
              Busca por título
            </label>
            <Input
              placeholder="Buscar por título..."
              size="sm"
              startContent={<Search className="h-4 w-4 text-default-400" />}
              value={filtroTitulo}
              variant="bordered"
              onChange={(event) => setFiltroTitulo(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label
              id="agenda-filtro-cliente-label"
              className="flex items-center gap-2 text-sm font-medium"
            >
              <User className="h-4 w-4" />
              Cliente
            </label>
            <SearchableSelect
              aria-label="Filtrar por cliente"
              aria-labelledby="agenda-filtro-cliente-label"
              emptyContent="Nenhum cliente encontrado"
              items={clienteFilterOptions}
              placeholder="Selecione um cliente"
              selectedKey={filtroCliente || null}
              size="sm"
              variant="bordered"
              onSelectionChange={(selectedKey) => {
                const nextCliente = selectedKey || "";
                setFiltroCliente(nextCliente);
                setFiltroProcesso("");
              }}
            />
          </div>
          <div className="space-y-2">
            <label
              id="agenda-filtro-processo-label"
              className="flex items-center gap-2 text-sm font-medium"
            >
              <Scale className="h-4 w-4" />
              Processo
            </label>
            <SearchableSelect
              aria-label="Filtrar por processo"
              aria-labelledby="agenda-filtro-processo-label"
              emptyContent="Nenhum processo encontrado"
              items={processoFilterOptions}
              placeholder="Selecione um processo"
              selectedKey={filtroProcesso || null}
              size="sm"
              variant="bordered"
              onSelectionChange={(selectedKey) => setFiltroProcesso(selectedKey || "")}
            />
          </div>
          {!isAdvogado ? (
            <div className="space-y-2">
              <label
                id="agenda-filtro-advogado-label"
                className="flex items-center gap-2 text-sm font-medium"
              >
                <Building className="h-4 w-4" />
                Advogado
              </label>
              <SearchableSelect
                aria-label="Filtrar por advogado"
                aria-labelledby="agenda-filtro-advogado-label"
                emptyContent="Nenhum advogado encontrado"
                items={advogadoFilterOptions}
                placeholder="Selecione um advogado"
                selectedKey={filtroAdvogado || null}
                size="sm"
                variant="bordered"
                onSelectionChange={(selectedKey) =>
                  setFiltroAdvogado(selectedKey || "")
                }
              />
            </div>
          ) : null}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium">
              <PlaceIcon className="h-4 w-4" />
              Local
            </label>
            <Input
              placeholder="Buscar por local..."
              size="sm"
              startContent={<PlaceIcon className="h-4 w-4 text-default-400" />}
              value={filtroLocal}
              variant="bordered"
              onChange={(event) => setFiltroLocal(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label
              id="agenda-filtro-tipo-label"
              className="flex items-center gap-2 text-sm font-medium"
            >
              <FileText className="h-4 w-4" />
              Tipo
            </label>
            <Select
              aria-label="Filtrar por tipo de evento"
              aria-labelledby="agenda-filtro-tipo-label"
              placeholder="Selecione um tipo"
              selectedKeys={filtroTipo ? [filtroTipo] : []}
              size="sm"
              variant="bordered"
              onSelectionChange={(keys) =>
                setFiltroTipo((Array.from(keys)[0] as string) || "")
              }
            >
              <>
                <SelectItem key="" textValue="Todos os tipos">
                  Todos os tipos
                </SelectItem>
                {Object.entries(tiposEvento).map(([key, tipo]) => (
                  <SelectItem key={key} textValue={tipo.label}>
                    {tipo.label}
                  </SelectItem>
                ))}
              </>
            </Select>
          </div>
          <div className="space-y-2">
            <label
              id="agenda-filtro-status-label"
              className="flex items-center gap-2 text-sm font-medium"
            >
              <CheckCircle className="h-4 w-4" />
              Status
            </label>
            <Select
              aria-label="Filtrar por status do evento"
              aria-labelledby="agenda-filtro-status-label"
              placeholder="Selecione um status"
              selectedKeys={filtroStatus ? [filtroStatus] : []}
              size="sm"
              variant="bordered"
              onSelectionChange={(keys) =>
                setFiltroStatus((Array.from(keys)[0] as string) || "")
              }
            >
              <>
                <SelectItem key="" textValue="Todos os status">
                  Todos os status
                </SelectItem>
                {Object.entries(statusEvento).map(([key, status]) => (
                  <SelectItem key={key} textValue={status.label}>
                    {status.label}
                  </SelectItem>
                ))}
              </>
            </Select>
          </div>
          <div className="space-y-2">
            <label
              id="agenda-filtro-origem-label"
              className="flex items-center gap-2 text-sm font-medium"
            >
              <FaGoogle className="h-4 w-4" />
              Origem
            </label>
            <Select
              aria-label="Filtrar por origem do evento"
              aria-labelledby="agenda-filtro-origem-label"
              placeholder="Selecione a origem"
              selectedKeys={filtroGoogle ? [filtroGoogle] : []}
              size="sm"
              variant="bordered"
              onSelectionChange={(keys) =>
                setFiltroGoogle((Array.from(keys)[0] as string) || "")
              }
            >
              <SelectItem key="" textValue="Todos os eventos">
                Todos os eventos
              </SelectItem>
              <SelectItem key="google" textValue="Do Google Calendar">
                Do Google Calendar
              </SelectItem>
              <SelectItem key="local" textValue="Locais">
                Locais
              </SelectItem>
            </Select>
          </div>
        </div>
      </CardBody>
    </Card>
  );

  const renderUtilityArea = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card className={panelClassName}>
          <CardHeader className="border-b border-divider/70 px-4 py-4 sm:px-6">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
                <Info className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-foreground sm:text-lg">
                  Legenda de confirmações
                </h3>
                <p className="text-xs text-default-500 sm:text-sm">
                  Identifique rapidamente o status de resposta dos participantes.
                </p>
              </div>
            </div>
          </CardHeader>
          <CardBody className="space-y-4 p-4 sm:p-6">
            <div className="flex flex-wrap gap-2">
              <Tooltip
                color="success"
                content="Participante confirmou presença no evento"
                placement="top"
              >
                <Chip
                  className="cursor-help"
                  color="success"
                  size="sm"
                  startContent={<Check className="h-3 w-3" />}
                  variant="flat"
                >
                  Confirmado
                </Chip>
              </Tooltip>
              <Tooltip
                color="danger"
                content="Participante recusou o convite para o evento"
                placement="top"
              >
                <Chip
                  className="cursor-help"
                  color="danger"
                  size="sm"
                  startContent={<X className="h-3 w-3" />}
                  variant="flat"
                >
                  Recusado
                </Chip>
              </Tooltip>
              <Tooltip
                color="secondary"
                content="Participante marcou como talvez"
                placement="top"
              >
                <Chip
                  className="cursor-help"
                  color="secondary"
                  size="sm"
                  startContent={<HelpCircle className="h-3 w-3" />}
                  variant="flat"
                >
                  Talvez
                </Chip>
              </Tooltip>
              <Tooltip
                color="warning"
                content="Aguardando confirmação do participante"
                placement="top"
              >
                <Chip
                  className="cursor-help"
                  color="warning"
                  size="sm"
                  startContent={<AlertCircle className="h-3 w-3" />}
                  variant="flat"
                >
                  Pendente
                </Chip>
              </Tooltip>
            </div>
            <p className="text-xs text-default-400">
              Passe o cursor nos chips para ver a explicação de cada status.
            </p>
          </CardBody>
        </Card>

        <GoogleCalendarStatusCard />
      </div>

      {!isCliente ? (
        <Card className={panelClassName}>
          <CardHeader className="border-b border-divider/70 px-4 py-4 sm:px-6">
            <div className="flex w-full flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-foreground sm:text-lg">
                  Minha disponibilidade
                </h3>
                <p className="text-xs text-default-500 sm:text-sm">
                  Defina sua jornada semanal para orientar bloqueios e sugestões
                  de horário na agenda.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {disponibilidadePadrao ? (
                  <Chip color="warning" size="sm" variant="flat">
                    Padrão inicial
                  </Chip>
                ) : (
                  <Chip color="success" size="sm" variant="flat">
                    Configuração salva
                  </Chip>
                )}
                <Button
                  color="primary"
                  isDisabled={disponibilidadeDraft.length === 0}
                  isLoading={savingDisponibilidade}
                  size="sm"
                  onPress={handleSalvarDisponibilidade}
                >
                  Salvar disponibilidade
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardBody className="p-4 sm:p-6">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
              {disponibilidadeDraft.map((dia) => (
                <div
                  key={dia.diaSemana}
                  className="rounded-2xl border border-divider/70 bg-content2/35 p-4"
                >
                  <div className="mb-4 flex flex-col gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Chip
                        color={dia.ativo ? "success" : "default"}
                        size="sm"
                        variant={dia.ativo ? "flat" : "bordered"}
                      >
                        {dia.nomeDia}
                      </Chip>
                      <Chip
                        color={dia.ativo ? "success" : "default"}
                        size="sm"
                        variant="dot"
                      >
                        {dia.ativo ? "Disponível" : "Indisponível"}
                      </Chip>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        aria-label={`Definir ${dia.nomeDia} como ativo`}
                        color={dia.ativo ? "success" : "default"}
                        size="sm"
                        startContent={<CheckCircle className="h-3.5 w-3.5" />}
                        variant={dia.ativo ? "solid" : "bordered"}
                        onPress={() =>
                          updateDisponibilidadeField(dia.diaSemana, "ativo", true)
                        }
                      >
                        Ativo
                      </Button>
                      <Button
                        aria-label={`Definir ${dia.nomeDia} como inativo`}
                        color={!dia.ativo ? "danger" : "default"}
                        size="sm"
                        startContent={<XCircle className="h-3.5 w-3.5" />}
                        variant={!dia.ativo ? "solid" : "bordered"}
                        onPress={() =>
                          updateDisponibilidadeField(dia.diaSemana, "ativo", false)
                        }
                      >
                        Inativo
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      isDisabled={!dia.ativo}
                      label="Início"
                      size="sm"
                      type="time"
                      value={dia.horaInicio}
                      variant="bordered"
                      onChange={(event) =>
                        updateDisponibilidadeField(
                          dia.diaSemana,
                          "horaInicio",
                          event.target.value,
                        )
                      }
                    />
                    <Input
                      isDisabled={!dia.ativo}
                      label="Fim"
                      size="sm"
                      type="time"
                      value={dia.horaFim}
                      variant="bordered"
                      onChange={(event) =>
                        updateDisponibilidadeField(
                          dia.diaSemana,
                          "horaFim",
                          event.target.value,
                        )
                      }
                    />
                    <Input
                      isDisabled={!dia.ativo}
                      label="Intervalo início"
                      size="sm"
                      type="time"
                      value={dia.intervaloInicio || ""}
                      variant="bordered"
                      onChange={(event) =>
                        updateDisponibilidadeField(
                          dia.diaSemana,
                          "intervaloInicio",
                          event.target.value || null,
                        )
                      }
                    />
                    <Input
                      isDisabled={!dia.ativo}
                      label="Intervalo fim"
                      size="sm"
                      type="time"
                      value={dia.intervaloFim || ""}
                      variant="bordered"
                      onChange={(event) =>
                        updateDisponibilidadeField(
                          dia.diaSemana,
                          "intervaloFim",
                          event.target.value || null,
                        )
                      }
                    />
                  </div>

                  <Input
                    className="mt-3"
                    isDisabled={!dia.ativo}
                    label="Observações"
                    placeholder="Ex.: audiência externa, plantão, agenda reduzida..."
                    size="sm"
                    value={dia.observacoes || ""}
                    variant="bordered"
                    onChange={(event) =>
                      updateDisponibilidadeField(
                        dia.diaSemana,
                        "observacoes",
                        event.target.value || null,
                      )
                    }
                  />
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );

  if (!isHydrated) {
    return (
      <div className="space-y-6">
        <PeoplePageHeader
          description="A agenda agora prioriza a visão mensal geral para destacar todos os eventos do usuário."
          tag="Agenda mensal"
          title="Agenda"
        />
        <Card className={panelClassName}>
          <CardBody className="flex justify-center py-20">
            <Spinner label="Carregando agenda..." size="lg" />
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PeoplePageHeader
        description="Visualize todos os eventos do mês na aba Geral e aprofunde a análise pelo calendário diário ou pela lista cronológica."
        tag="Agenda mensal"
        title="Agenda"
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            {permissions.canCreateEvents && !isCliente ? (
              <Button
                className="w-full sm:w-auto"
                color="primary"
                size="sm"
                startContent={<Plus className="h-4 w-4" />}
                onPress={handleCreateEvento}
              >
                Novo evento
              </Button>
            ) : null}
            <GoogleCalendarButton />
          </div>
        }
      />

      {renderVisibilityTabs()}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <PeopleMetricCard
          helper={generalMonthLabel}
          icon={<CalendarDays className="h-4 w-4" />}
          label="Eventos no mês"
          tone="primary"
          value={isLoadingResumo ? "..." : resumo.totalPeriodo}
        />
        <PeopleMetricCard
          helper="Compromissos do tipo audiência no período principal"
          icon={<Scale className="h-4 w-4" />}
          label="Audiências no mês"
          tone="warning"
          value={isLoadingResumo ? "..." : resumo.audienciasPeriodo}
        />
        <PeopleMetricCard
          helper="Aplicando os filtros visíveis da agenda"
          icon={<Clock className="h-4 w-4" />}
          label="Eventos hoje"
          tone="success"
          value={isLoadingResumo ? "..." : resumo.eventosHoje}
        />
        <PeopleMetricCard
          helper={isLoadingResumo ? "Carregando próximo compromisso..." : proximoEventoMetricHelper}
          icon={<Calendar className="h-4 w-4" />}
          label="Próximo evento"
          tone="secondary"
          value={isLoadingResumo ? "..." : proximoEventoMetricValue}
        />
      </div>

      {renderFilters()}

      {viewMode === "general"
        ? renderGeneralView()
        : viewMode === "calendar"
          ? renderCalendarView()
          : renderListView()}

      {renderUtilityArea()}

      <EventoForm
        evento={eventoEditando || undefined}
        initialDate={selectedDateForEvent || undefined}
        isOpen={isEventoFormOpen}
        onClose={() => {
          setIsEventoFormOpen(false);
          setEventoEditando(null);
          setSelectedDateForEvent(null);
        }}
        onSuccess={handleEventoFormSuccess}
      />
    </div>
  );
}
