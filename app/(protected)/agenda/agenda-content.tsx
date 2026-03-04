"use client";

import { useState, useMemo } from "react";
import {
  Calendar, Plus, Clock, MapPin, Users, Edit, Trash2, CheckCircle, MoreVertical, Check, X, HelpCircle, AlertCircle, Info, Filter, Search, CalendarDays, User, Building, Scale, FileText, MapPin as LocationIcon, XCircle, RotateCcw, } from "lucide-react";
import { FaGoogle } from "react-icons/fa";
import { motion, AnimatePresence } from "framer-motion";
import {
  Card, CardBody, CardHeader, Button, ButtonGroup, Chip, Spinner, Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, Tooltip, Input, Select, SelectItem } from "@heroui/react";
import { Calendar as CalendarComponent } from "@heroui/react";
import {
  today,
  getLocalTimeZone,
  startOfWeek,
  startOfMonth,
} from "@internationalized/date";
import { useLocale } from "@react-aria/i18n";
import { useSession } from "next-auth/react";
import { toast } from "@/lib/toast";

import { useEventos } from "@/app/hooks/use-eventos";
import { PeopleMetricCard, PeoplePageHeader } from "@/components/people-ui";
import {
  deleteEvento,
  marcarEventoComoRealizado,
  getEventoById,
  confirmarParticipacaoEvento,
} from "@/app/actions/eventos";
import EventoForm from "@/components/evento-form";
import GoogleCalendarButton from "@/components/google-calendar-button";
import GoogleCalendarStatusCard from "@/components/google-calendar-status";
import { useUserPermissions } from "@/app/hooks/use-user-permissions";
import { DateUtils } from "@/app/lib/date-utils";
import { Evento, EventoConfirmacaoStatus } from "@/generated/prisma";
import { DateRangeInput } from "@/components/ui/date-range-input";

type ViewMode = "calendar" | "list";

// Tipo estendido para incluir confirmações
type EventoComConfirmacoes = Evento & {
  confirmacoes?: Array<{
    id: string;
    participanteEmail: string;
    participanteNome?: string | null;
    status: EventoConfirmacaoStatus;
    confirmadoEm?: Date | null;
    observacoes?: string | null;
  }>;
};

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
  const [viewMode, setViewMode] = useState<ViewMode>("calendar");
  const [selectedDate, setSelectedDate] = useState(today(getLocalTimeZone()));
  const [isEventoFormOpen, setIsEventoFormOpen] = useState(false);
  const [eventoEditando, setEventoEditando] = useState<Evento | null>(null);

  // Estados dos filtros
  const [filtroTipo, setFiltroTipo] = useState<string>("");
  const [filtroStatus, setFiltroStatus] = useState<string>("");
  const [filtroCliente, setFiltroCliente] = useState<string>("");
  const [filtroProcesso, setFiltroProcesso] = useState<string>("");
  const [filtroAdvogado, setFiltroAdvogado] = useState<string>("");
  const [filtroLocal, setFiltroLocal] = useState<string>("");
  const [filtroTitulo, setFiltroTitulo] = useState<string>("");
  const [filtroDataRange, setFiltroDataRange] = useState<any>(null);
  const [filtroGoogle, setFiltroGoogle] = useState<string>("");
  const [showFilters, setShowFilters] = useState(false);

  // Estados para menu contextual
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState({
    x: 0,
    y: 0,
  });
  const [selectedDateForEvent, setSelectedDateForEvent] = useState<Date | null>(
    null,
  );

  const locale = useLocale();
  const { permissions, isCliente, isAdvogado, isSecretaria, isAdmin } =
    useUserPermissions();
  const session = useSession();
  const userEmail = session?.data?.user?.email;

  // Memoizar as datas para evitar re-criação a cada render
  const datasMemo = useMemo(() => {
    const agora = new Date();
    const inicioHoje = new Date(
      agora.getFullYear(),
      agora.getMonth(),
      agora.getDate(),
    );
    const fimHoje = new Date(
      agora.getFullYear(),
      agora.getMonth(),
      agora.getDate(),
      23,
      59,
      59,
      999,
    );

    const inicioSemana = new Date(agora.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fimSemana = new Date(agora.getTime() + 7 * 24 * 60 * 60 * 1000);

    const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1);
    const fimMes = new Date(agora.getFullYear(), agora.getMonth() + 1, 0);

    return {
      inicioHoje,
      fimHoje,
      inicioSemana,
      fimSemana,
      inicioMes,
      fimMes,
    };
  }, []); // Apenas uma vez

  // Filtros principais
  const filtrosPrincipais = useMemo(
    () => ({
      tipo: filtroTipo || undefined,
      status: filtroStatus || undefined,
      clienteId: filtroCliente || undefined,
      processoId: filtroProcesso || undefined,
      advogadoId: filtroAdvogado || undefined,
      local: filtroLocal || undefined,
      titulo: filtroTitulo || undefined,
      dataInicio: filtroDataRange?.start
        ? new Date(filtroDataRange.start.toString())
        : undefined,
      dataFim: filtroDataRange?.end
        ? new Date(filtroDataRange.end.toString())
        : undefined,
    }),
    [
      filtroTipo,
      filtroStatus,
      filtroCliente,
      filtroProcesso,
      filtroAdvogado,
      filtroLocal,
      filtroTitulo,
      filtroDataRange,
    ],
  );

  // Apenas UMA chamada para buscar todos os eventos
  const { eventos, isLoading, error, mutate } = useEventos(filtrosPrincipais);

  // Calcular estatísticas a partir dos eventos já carregados
  const estatisticas = useMemo(() => {
    if (!eventos) return { hoje: 0, semana: 0, mes: 0, confirmacoes: 0 };

    const agora = new Date();
    const hoje = eventos.filter((evento) => {
      const dataEvento = new Date(evento.dataInicio);

      return (
        dataEvento >= datasMemo.inicioHoje && dataEvento <= datasMemo.fimHoje
      );
    }).length;

    const semana = eventos.filter((evento) => {
      const dataEvento = new Date(evento.dataInicio);

      return (
        dataEvento >= datasMemo.inicioSemana &&
        dataEvento <= datasMemo.fimSemana
      );
    }).length;

    const mes = eventos.filter((evento) => {
      const dataEvento = new Date(evento.dataInicio);

      return (
        dataEvento >= datasMemo.inicioMes && dataEvento <= datasMemo.fimMes
      );
    }).length;

    const confirmacoes = eventos.reduce(
      (total, evento) => total + (evento.confirmacoes?.length || 0),
      0,
    );

    return { hoje, semana, mes, confirmacoes };
  }, [eventos, datasMemo]);

  const handleCreateEvento = () => {
    setEventoEditando(null);
    setIsEventoFormOpen(true);
  };

  const handleEditEvento = async (evento: Evento) => {
    try {
      // Buscar o evento completo com todos os relacionamentos
      const result = await getEventoById(evento.id);

      if (result.success && result.data) {
        setEventoEditando(result.data);
        setIsEventoFormOpen(true);
      } else {
        toast.error("Erro ao carregar dados do evento");
      }
    } catch (error) {
      toast.error("Erro ao carregar dados do evento");
    }
  };

  // Função para lidar com clique direito na data
  const handleDateRightClick = (event: React.MouseEvent, date: Date) => {
    event.preventDefault();
    if (permissions.canCreateEvents && !isCliente) {
      setSelectedDateForEvent(date);
      setContextMenuPosition({ x: event.clientX, y: event.clientY });
      setContextMenuOpen(true);
    }
  };

  // Função para criar evento na data selecionada
  const handleCreateEventoNaData = (date: Date) => {
    setSelectedDateForEvent(date);
    setEventoEditando(null);
    setIsEventoFormOpen(true);
    setContextMenuOpen(false);
  };

  // Função para fechar o menu contextual
  const handleCloseContextMenu = () => {
    setContextMenuOpen(false);
    setSelectedDateForEvent(null);
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
      } else {
        toast.error(result.error || "Erro ao excluir evento");
      }
    } catch (error) {
      toast.error("Erro interno do servidor");
    }
  };

  const handleMarcarComoRealizado = async (eventoId: string) => {
    try {
      const result = await marcarEventoComoRealizado(eventoId);

      if (result.success) {
        toast.success("Evento marcado como realizado!");
        mutate();
      } else {
        toast.error(result.error || "Erro ao atualizar evento");
      }
    } catch (error) {
      toast.error("Erro interno do servidor");
    }
  };

  const handleEventoFormSuccess = () => {
    mutate();
    setIsEventoFormOpen(false);
    setEventoEditando(null);
  };

  // Função para limpar todos os filtros
  const clearAllFilters = () => {
    setFiltroTipo("");
    setFiltroStatus("");
    setFiltroCliente("");
    setFiltroProcesso("");
    setFiltroAdvogado("");
    setFiltroLocal("");
    setFiltroTitulo("");
    setFiltroDataRange(null);
  };

  // Verificar se há filtros ativos
  const hasActiveFilters = Boolean(
    filtroTipo ||
      filtroStatus ||
      filtroCliente ||
      filtroProcesso ||
      filtroAdvogado ||
      filtroLocal ||
      filtroTitulo ||
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
    filtroDataRange,
  ].filter(Boolean).length;

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
      } else {
        toast.error(result.error || "Erro ao confirmar participação");
      }
    } catch (error) {
      toast.error("Erro interno do servidor");
    }
  };

  // Função para aplicar todos os filtros
  const aplicarFiltros = (eventos: EventoComConfirmacoes[]) => {
    return eventos.filter((evento) => {
      // Filtro por tipo
      if (filtroTipo && evento.tipo !== filtroTipo) return false;

      // Filtro por status
      if (filtroStatus && evento.status !== filtroStatus) return false;

      // Filtro por cliente
      if (filtroCliente && evento.clienteId !== filtroCliente) return false;

      // Filtro por processo
      if (filtroProcesso && evento.processoId !== filtroProcesso) return false;

      // Filtro por advogado
      if (filtroAdvogado && evento.advogadoResponsavelId !== filtroAdvogado)
        return false;

      // Filtro por local
      if (
        filtroLocal &&
        evento.local &&
        !evento.local.toLowerCase().includes(filtroLocal.toLowerCase())
      )
        return false;

      // Filtro por título
      if (
        filtroTitulo &&
        !evento.titulo.toLowerCase().includes(filtroTitulo.toLowerCase())
      )
        return false;

      // Filtro por Google Calendar
      if (filtroGoogle === "google" && !evento.googleEventId) return false;
      if (filtroGoogle === "local" && evento.googleEventId) return false;

      // Filtro por data range
      if (filtroDataRange && filtroDataRange.start && filtroDataRange.end) {
        const dataEvento = new Date(evento.dataInicio);
        const dataInicio = new Date(filtroDataRange.start);
        const dataFim = new Date(filtroDataRange.end);

        if (dataEvento < dataInicio || dataEvento > dataFim) return false;
      }

      return true;
    });
  };

  const eventosFiltrados = (eventos || []).filter((evento) => {
    const dataEvento = DateUtils.parse(evento.dataInicio as any);
    const dataSelecionada = DateUtils.fromCalendarDate(selectedDate);

    return dataEvento && DateUtils.isSameDay(dataEvento, dataSelecionada);
  });

  const eventosListaFiltrados = aplicarFiltros(eventos || []);

  const formatarHora = (data: string) => {
    return DateUtils.formatTime(data);
  };

  const formatarData = (data: string) => {
    return DateUtils.formatDate(data);
  };

  const formatarDataSelecionada = (data: any) => {
    return DateUtils.formatCalendarDate(data);
  };

  const renderConfirmacoes = (evento: EventoComConfirmacoes) => {
    if (!evento.confirmacoes || evento.confirmacoes.length === 0) {
      return null;
    }

    // Verificar se o usuário atual é participante do evento
    const userConfirmacao = evento.confirmacoes.find(
      (c) => c.participanteEmail === userEmail,
    );

    return (
      <div className="mt-2">
        <div className="text-xs text-default-500 mb-1">Confirmações:</div>

        {/* Botões de confirmação para o usuário atual se for participante */}
        {userConfirmacao && (
          <div className="mb-2 p-2 bg-default-50 rounded-lg">
            <div className="text-xs text-default-600 mb-2">
              Sua confirmação:
            </div>
            <div className="flex gap-1">
              <Button
                className="text-xs"
                color={
                  userConfirmacao.status === "CONFIRMADO"
                    ? "success"
                    : "default"
                }
                size="sm"
                startContent={<Check className="w-3 h-3" />}
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
                startContent={<X className="w-3 h-3" />}
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
                startContent={<HelpCircle className="w-3 h-3" />}
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
        )}

        {/* Lista de confirmações */}
        <div className="flex flex-wrap gap-1">
          {evento.confirmacoes.map((confirmacao) => {
            const statusInfo =
              statusConfirmacao[
                confirmacao.status as keyof typeof statusConfirmacao
              ];
            const IconComponent = statusInfo?.icon || AlertCircle;

            const tooltipContent = (
              <div className="text-xs">
                <div className="font-semibold">
                  {statusInfo?.label || confirmacao.status}
                </div>
                {confirmacao.observacoes && (
                  <div className="text-default-400 mt-1">
                    {confirmacao.observacoes}
                  </div>
                )}
                {confirmacao.confirmadoEm && (
                  <div className="text-default-400 mt-1">
                    Confirmado em:{" "}
                    {new Date(confirmacao.confirmadoEm).toLocaleString("pt-BR")}
                  </div>
                )}
              </div>
            );

            return (
              <Tooltip
                key={confirmacao.id}
                color={statusInfo?.color || "default"}
                content={tooltipContent}
                placement="top"
              >
                <Chip
                  className="cursor-help"
                  color={statusInfo?.color || "default"}
                  size="sm"
                  startContent={<IconComponent className="w-3 h-3" />}
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

  if (error) {
    return (
      <div className="p-6">
        <Card>
          <CardBody className="text-center py-12">
            <p className="text-danger">Erro ao carregar eventos: {error}</p>
            <Button className="mt-4" color="primary" onPress={() => mutate()}>
              Tentar Novamente
            </Button>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-4 sm:p-6 sm:space-y-6 min-w-0 overflow-hidden">
      <PeoplePageHeader
        description="Gerencie compromissos, audiências e lembretes com controle por período, responsável e integrações."
        tag="Operacional"
        title="Agenda"
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <ButtonGroup className="w-full sm:w-auto">
              <Button
                size="sm"
                variant={viewMode === "calendar" ? "solid" : "bordered"}
                onPress={() => setViewMode("calendar")}
              >
                Calendário
              </Button>
              <Button
                size="sm"
                variant={viewMode === "list" ? "solid" : "bordered"}
                onPress={() => setViewMode("list")}
              >
                Lista
              </Button>
            </ButtonGroup>

            <div className="flex w-full gap-2 sm:w-auto">
              {permissions.canCreateEvents && !isCliente ? (
                <Button
                  className="flex-1 sm:flex-none"
                  color="primary"
                  size="sm"
                  startContent={<Plus className="w-4 h-4" />}
                  onPress={handleCreateEvento}
                >
                  Novo Evento
                </Button>
              ) : null}
              <GoogleCalendarButton />
            </div>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <PeopleMetricCard
          helper="Compromissos para o dia atual"
          icon={<Calendar className="h-4 w-4" />}
          label="Eventos hoje"
          tone="primary"
          value={estatisticas.hoje}
        />
        <PeopleMetricCard
          helper="Janela de 7 dias"
          icon={<CalendarDays className="h-4 w-4" />}
          label="Esta semana"
          tone="warning"
          value={estatisticas.semana}
        />
        <PeopleMetricCard
          helper="Total no mês corrente"
          icon={<Clock className="h-4 w-4" />}
          label="Este mês"
          tone="success"
          value={estatisticas.mes}
        />
        <PeopleMetricCard
          helper="Respostas registradas de convidados"
          icon={<Users className="h-4 w-4" />}
          label="Confirmações"
          tone="secondary"
          value={estatisticas.confirmacoes}
        />
      </div>

      {/* Legenda de Confirmações */}
      <Card className="border border-divider/70 bg-content1/75 shadow-sm backdrop-blur-md">
        <CardBody className="py-3">
          <div className="flex items-center gap-2 mb-2">
            <Info className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium">Legenda de Confirmações</span>
          </div>
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
                startContent={<Check className="w-3 h-3" />}
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
                startContent={<X className="w-3 h-3" />}
                variant="flat"
              >
                Recusado
              </Chip>
            </Tooltip>
            <Tooltip
              color="secondary"
              content="Participante marcou como 'talvez' - aguardando confirmação"
              placement="top"
            >
              <Chip
                className="cursor-help"
                color="secondary"
                size="sm"
                startContent={<HelpCircle className="w-3 h-3" />}
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
                startContent={<AlertCircle className="w-3 h-3" />}
                variant="flat"
              >
                Pendente
              </Chip>
            </Tooltip>
          </div>
          <p className="text-xs text-default-400 mt-2">
            Passe o mouse sobre os chips para ver mais detalhes sobre cada
            confirmação
          </p>
        </CardBody>
      </Card>

      {/* Status do Google Calendar */}
      <GoogleCalendarStatusCard />

      {/* Layout Principal */}
      <div className="space-y-6">
        {/* Filtros Avançados */}
        <Card className="border border-divider/70 bg-content1/75 shadow-sm backdrop-blur-md">
          <CardHeader className="border-b border-divider/70 px-4 py-4 sm:px-6">
            <div className="flex w-full flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 items-start gap-3 sm:items-center">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
                  <Filter className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground sm:text-lg">
                    Filtros operacionais
                  </h3>
                  <p className="text-xs text-default-500 sm:text-sm">
                    Refine por período, título, cliente, processo, responsável e origem.
                  </p>
                </div>
                {hasActiveFilters ? (
                  <Chip className="ml-1" color="primary" size="sm" variant="flat">
                    {activeFilterCount} ativo(s)
                  </Chip>
                ) : null}
              </div>
              <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
              <Button
                isDisabled={!hasActiveFilters}
                size="sm"
                startContent={<RotateCcw className="w-4 h-4" />}
                variant="light"
                onPress={clearAllFilters}
              >
                Limpar
              </Button>
              <Button
                size="sm"
                startContent={
                  showFilters ? (
                    <XCircle className="w-4 h-4" />
                  ) : (
                    <Filter className="w-4 h-4" />
                  )
                }
                variant="light"
                onPress={() => setShowFilters(!showFilters)}
              >
                {showFilters ? "Ocultar" : "Mostrar"}
              </Button>
            </div>
            </div>
          </CardHeader>

          <AnimatePresence>
            {showFilters && (
              <motion.div
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                initial={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3 }}
              >
                <CardBody className="p-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {/* Filtro por Período */}
                    <div className="space-y-2">
                      <label
                        className="text-sm font-medium flex items-center gap-2"
                        htmlFor="periodo"
                      >
                        <CalendarDays className="w-4 h-4" />
                        Período
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

                    {/* Filtro por Título */}
                    <div className="space-y-2">
                      <label
                        className="text-sm font-medium flex items-center gap-2"
                        htmlFor="filtro"
                      >
                        <Search className="w-4 h-4" />
                        Título
                      </label>
                      <Input
                        placeholder="Buscar por título..."
                        size="sm"
                        startContent={
                          <Search className="w-4 h-4 text-default-400" />
                        }
                        value={filtroTitulo}
                        variant="bordered"
                        onChange={(e) => setFiltroTitulo(e.target.value)}
                      />
                    </div>

                    {/* Filtro por Cliente */}
                    <div className="space-y-2">
                      <label
                        className="text-sm font-medium flex items-center gap-2"
                        htmlFor="cliente"
                      >
                        <User className="w-4 h-4" />
                        Cliente
                      </label>
                      <Select
                        placeholder="Selecione um cliente"
                        selectedKeys={(() => {
                          const clientesComEventos =
                            eventos
                              ?.filter((e) => e.clienteId)
                              .map((e) => e.clienteId) || [];
                          const clienteKeySet = new Set(clientesComEventos);

                          return filtroCliente &&
                            clienteKeySet.has(filtroCliente)
                            ? [filtroCliente]
                            : [];
                        })()}
                        size="sm"
                        variant="bordered"
                        onSelectionChange={(keys) =>
                          setFiltroCliente(
                            (Array.from(keys)[0] as string) || "",
                          )
                        }
                      >
                        <SelectItem key="" textValue="Todos os clientes">
                          Todos os clientes
                        </SelectItem>
                        {(() => {
                          // Filtrar apenas clientes que têm eventos
                          const clientesComEventos =
                            eventos
                              ?.filter((e) => e.clienteId && e.cliente)
                              .map((e) => e.cliente) || [];
                          const clientesUnicos = clientesComEventos.filter(
                            (cliente, index, self) =>
                              cliente &&
                              index ===
                                self.findIndex((c) => c && c.id === cliente.id),
                          );

                          return clientesUnicos.map(
                            (cliente) =>
                              cliente && (
                                <SelectItem
                                  key={cliente.id}
                                  textValue={cliente.nome}
                                >
                                  {cliente.nome}
                                </SelectItem>
                              ),
                          ) as any;
                        })()}
                      </Select>
                    </div>

                    {/* Filtro por Processo */}
                    <div className="space-y-2">
                      <label
                        className="text-sm font-medium flex items-center gap-2"
                        htmlFor="filtro"
                      >
                        <Scale className="w-4 h-4" />
                        Processo
                      </label>
                      <Select
                        placeholder="Selecione um processo"
                        selectedKeys={(() => {
                          const processosComEventos =
                            eventos
                              ?.filter((e) => e.processoId)
                              .map((e) => e.processoId) || [];
                          const processoKeySet = new Set(processosComEventos);

                          return filtroProcesso &&
                            processoKeySet.has(filtroProcesso)
                            ? [filtroProcesso]
                            : [];
                        })()}
                        size="sm"
                        variant="bordered"
                        onSelectionChange={(keys) =>
                          setFiltroProcesso(
                            (Array.from(keys)[0] as string) || "",
                          )
                        }
                      >
                        <SelectItem key="" textValue="Todos os processos">
                          Todos os processos
                        </SelectItem>
                        {(() => {
                          // Filtrar apenas processos que têm eventos
                          const processosComEventos =
                            eventos
                              ?.filter((e) => e.processoId && e.processo)
                              .map((e) => e.processo) || [];
                          const processosUnicos = processosComEventos.filter(
                            (processo, index, self) =>
                              processo &&
                              index ===
                                self.findIndex(
                                  (p) => p && p.id === processo.id,
                                ),
                          );

                          return processosUnicos.map(
                            (processo) =>
                              processo && (
                                <SelectItem
                                  key={processo.id}
                                  textValue={`${processo.numero} - ${processo.titulo || "Sem título"}`}
                                >
                                  {processo.numero} -{" "}
                                  {processo.titulo || "Sem título"}
                                </SelectItem>
                              ),
                          ) as any;
                        })()}
                      </Select>
                    </div>

                    {/* Filtro por Advogado - apenas para Admin/SuperAdmin */}
                    {!isAdvogado && (
                      <div className="space-y-2">
                        <label
                          className="text-sm font-medium flex items-center gap-2"
                          htmlFor="filtro"
                        >
                          <Building className="w-4 h-4" />
                          Advogado
                        </label>
                        <Select
                          placeholder="Selecione um advogado"
                          selectedKeys={(() => {
                            const advogadosComEventos =
                              eventos
                                ?.filter((e) => e.advogadoResponsavelId)
                                .map((e) => e.advogadoResponsavelId) || [];
                            const advogadoKeySet = new Set(advogadosComEventos);

                            return filtroAdvogado &&
                              advogadoKeySet.has(filtroAdvogado)
                              ? [filtroAdvogado]
                              : [];
                          })()}
                          size="sm"
                          variant="bordered"
                          onSelectionChange={(keys) =>
                            setFiltroAdvogado(
                              (Array.from(keys)[0] as string) || "",
                            )
                          }
                        >
                          <SelectItem key="" textValue="Todos os advogados">
                            Todos os advogados
                          </SelectItem>
                          {(() => {
                            // Filtrar apenas advogados que têm eventos
                            const advogadosComEventos =
                              eventos
                                ?.filter(
                                  (e) =>
                                    e.advogadoResponsavelId &&
                                    e.advogadoResponsavel,
                                )
                                .map((e) => e.advogadoResponsavel) || [];
                            const advogadosUnicos = advogadosComEventos.filter(
                              (advogado, index, self) =>
                                advogado &&
                                index ===
                                  self.findIndex(
                                    (a) => a && a.id === advogado.id,
                                  ),
                            );

                            return advogadosUnicos.map(
                              (advogado: any) =>
                                advogado &&
                                (() => {
                                  const nomeCompleto = `${advogado.usuario.firstName} ${advogado.usuario.lastName}`;

                                  return (
                                    <SelectItem
                                      key={advogado.id}
                                      textValue={nomeCompleto}
                                    >
                                      {nomeCompleto}
                                    </SelectItem>
                                  );
                                })(),
                            ) as any;
                          })()}
                        </Select>
                      </div>
                    )}

                    {/* Filtro por Local */}
                    <div className="space-y-2">
                      <label
                        className="text-sm font-medium flex items-center gap-2"
                        htmlFor="filtro"
                      >
                        <LocationIcon className="w-4 h-4" />
                        Local
                      </label>
                      <Input
                        placeholder="Buscar por local..."
                        size="sm"
                        startContent={
                          <LocationIcon className="w-4 h-4 text-default-400" />
                        }
                        value={filtroLocal}
                        variant="bordered"
                        onChange={(e) => setFiltroLocal(e.target.value)}
                      />
                    </div>

                    {/* Filtro por Tipo */}
                    <div className="space-y-2">
                      <label
                        className="text-sm font-medium flex items-center gap-2"
                        htmlFor="filtro"
                      >
                        <FileText className="w-4 h-4" />
                        Tipo
                      </label>
                      <Select
                        placeholder="Selecione um tipo"
                        selectedKeys={filtroTipo ? [filtroTipo] : []}
                        size="sm"
                        variant="bordered"
                        onSelectionChange={(keys) =>
                          setFiltroTipo((Array.from(keys)[0] as string) || "")
                        }
                      >
                        <SelectItem key="" textValue="Todos os tipos">
                          Todos os tipos
                        </SelectItem>
                        {
                          Object.entries(tiposEvento).map(([key, tipo]) => (
                            <SelectItem key={key} textValue={tipo.label}>
                              {tipo.label}
                            </SelectItem>
                          )) as any
                        }
                      </Select>
                    </div>

                    {/* Filtro por Status */}
                    <div className="space-y-2">
                      <label
                        className="text-sm font-medium flex items-center gap-2"
                        htmlFor="filtro"
                      >
                        <CheckCircle className="w-4 h-4" />
                        Status
                      </label>
                      <Select
                        placeholder="Selecione um status"
                        selectedKeys={filtroStatus ? [filtroStatus] : []}
                        size="sm"
                        variant="bordered"
                        onSelectionChange={(keys) =>
                          setFiltroStatus((Array.from(keys)[0] as string) || "")
                        }
                      >
                        <SelectItem key="" textValue="Todos os status">
                          Todos os status
                        </SelectItem>
                        {
                          Object.entries(statusEvento).map(([key, status]) => (
                            <SelectItem key={key} textValue={status.label}>
                              {status.label}
                            </SelectItem>
                          )) as any
                        }
                      </Select>
                    </div>

                    {/* Filtro por Google Calendar */}
                    <div className="space-y-2">
                      <label
                        className="text-sm font-medium flex items-center gap-2"
                        htmlFor="filtro"
                      >
                        <FaGoogle className="w-4 h-4" />
                        Origem
                      </label>
                      <Select
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
              </motion.div>
            )}
          </AnimatePresence>
        </Card>

        {/* Conteúdo Principal */}
        {viewMode === "calendar" ? (
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-6 min-w-0"
            initial={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.5 }}
          >
            {/* Calendário */}
            <motion.div
              animate={{ opacity: 1, x: 0 }}
              className="lg:col-span-2"
              initial={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              <Card>
                <CardHeader>
                  <h3 className="text-lg font-semibold">Calendário</h3>
                </CardHeader>
                <CardBody>
                  <CalendarComponent
                    aria-label="Agenda"
                    classNames={{
                      content: "w-full max-w-full overflow-hidden",
                      base: "w-full max-w-full",
                      grid: "w-full max-w-full",
                      cell: "w-full h-16 text-center text-lg font-medium min-w-0",
                    }}
                    focusedValue={selectedDate as any}
                    nextButtonProps={{
                      variant: "bordered",
                      size: "lg",
                    }}
                    prevButtonProps={{
                      variant: "bordered",
                      size: "lg",
                    }}
                    topContent={
                      <ButtonGroup
                        fullWidth
                        className="px-4 pb-4 pt-4 bg-content1 [&>button]:text-default-500 [&>button]:border-default-200/60"
                        radius="full"
                        size="lg"
                        variant="bordered"
                      >
                        <Button
                          onPress={() =>
                            setSelectedDate(today(getLocalTimeZone()))
                          }
                        >
                          Hoje
                        </Button>
                        <Button
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
                      </ButtonGroup>
                    }
                    value={selectedDate as any}
                    onChange={setSelectedDate as any}
                    onFocusChange={setSelectedDate as any}
                  />
                </CardBody>
              </Card>
            </motion.div>

            {/* Eventos do Dia */}
            <motion.div
              animate={{ opacity: 1, x: 0 }}
              initial={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <Card>
                <CardHeader className="flex-row justify-between items-center">
                  <h3 className="text-lg font-semibold">
                    Eventos - {formatarDataSelecionada(selectedDate)}
                  </h3>
                  {permissions.canCreateEvents && !isCliente && (
                    <motion.div
                      animate={{ opacity: 1, scale: 1 }}
                      initial={{ opacity: 0, scale: 0.8 }}
                      transition={{ duration: 0.3, delay: 0.5 }}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <Button
                        color="primary"
                        size="sm"
                        startContent={<Plus className="w-4 h-4" />}
                        onPress={() => {
                          const date = new Date(
                            selectedDate.year,
                            selectedDate.month - 1,
                            selectedDate.day,
                          );

                          handleCreateEventoNaData(date);
                        }}
                      >
                        Criar Evento
                      </Button>
                    </motion.div>
                  )}
                </CardHeader>
                <CardBody>
                  {isLoading ? (
                    <div className="flex justify-center py-8">
                      <Spinner size="lg" />
                    </div>
                  ) : eventosFiltrados.length === 0 ? (
                    <div className="text-center py-8 text-default-500">
                      <Calendar className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>Nenhum evento para este dia</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <AnimatePresence>
                        {eventosFiltrados.map((evento, index) => (
                          <motion.div
                            key={evento.id}
                            layout
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            initial={{ opacity: 0, x: -20 }}
                            transition={{ duration: 0.3, delay: index * 0.1 }}
                            whileHover={{ scale: 1.02, x: 5 }}
                          >
                            <Card className="border-l-4 border-l-primary">
                              <CardBody className="p-4">
                                <div className="flex justify-between items-start mb-2">
                                  <div className="flex-1">
                                    <h4 className="font-semibold text-sm flex items-center gap-2">
                                      {evento.titulo}
                                      {evento.googleEventId && (
                                        <Tooltip content="Evento do Google Calendar">
                                          <FaGoogle className="w-3 h-3 text-blue-500" />
                                        </Tooltip>
                                      )}
                                    </h4>
                                    <div className="flex items-center gap-2 mt-1">
                                      <Chip
                                        color={
                                          tiposEvento[
                                            evento.tipo as keyof typeof tiposEvento
                                          ]?.color || "default"
                                        }
                                        size="sm"
                                        variant="flat"
                                      >
                                        {tiposEvento[
                                          evento.tipo as keyof typeof tiposEvento
                                        ]?.label || evento.tipo}
                                      </Chip>
                                      <Chip
                                        color={
                                          statusEvento[
                                            evento.status as keyof typeof statusEvento
                                          ]?.color || "default"
                                        }
                                        size="sm"
                                        variant="flat"
                                      >
                                        {statusEvento[
                                          evento.status as keyof typeof statusEvento
                                        ]?.label || evento.status}
                                      </Chip>
                                    </div>
                                  </div>

                                  <Dropdown>
                                    <DropdownTrigger>
                                      <Button
                                        isIconOnly
                                        size="sm"
                                        variant="light"
                                      >
                                        <MoreVertical className="w-4 h-4" />
                                      </Button>
                                    </DropdownTrigger>
                                    <DropdownMenu>
                                      {permissions.canEditAllEvents &&
                                      !isCliente ? (
                                        <>
                                          <DropdownItem
                                            key="edit"
                                            startContent={
                                              <Edit className="w-4 h-4" />
                                            }
                                            onPress={() =>
                                              handleEditEvento(evento)
                                            }
                                          >
                                            Editar
                                          </DropdownItem>
                                          {evento.status !== "REALIZADO" && (
                                            <DropdownItem
                                              key="realizado"
                                              startContent={
                                                <CheckCircle className="w-4 h-4" />
                                              }
                                              onPress={() =>
                                                handleMarcarComoRealizado(
                                                  evento.id,
                                                )
                                              }
                                            >
                                              Marcar como Realizado
                                            </DropdownItem>
                                          )}
                                          <DropdownItem
                                            key="delete"
                                            className="text-danger"
                                            color="danger"
                                            startContent={
                                              <Trash2 className="w-4 h-4" />
                                            }
                                            onPress={() =>
                                              handleDeleteEvento(evento.id)
                                            }
                                          >
                                            Excluir
                                          </DropdownItem>
                                        </>
                                      ) : null}
                                    </DropdownMenu>
                                  </Dropdown>
                                </div>

                                <div className="space-y-1 text-xs text-default-500">
                                  <div className="flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {formatarHora(
                                      evento.dataInicio.toString(),
                                    )}{" "}
                                    - {formatarHora(evento.dataFim.toString())}
                                  </div>
                                  {evento.local && (
                                    <div className="flex items-center gap-1">
                                      <MapPin className="w-3 h-3" />
                                      {evento.local}
                                    </div>
                                  )}
                                  {evento.participantes.length > 0 && (
                                    <div className="flex items-center gap-1">
                                      <Users className="w-3 h-3" />
                                      {evento.participantes.length}{" "}
                                      participante(s)
                                    </div>
                                  )}
                                </div>

                                {renderConfirmacoes(evento)}
                              </CardBody>
                            </Card>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  )}
                </CardBody>
              </Card>
            </motion.div>
          </motion.div>
        ) : (
          /* Lista de Eventos */
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            initial={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.5 }}
          >
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold">Todos os Eventos</h3>
              </CardHeader>
              <CardBody>
                {isLoading ? (
                  <div className="flex justify-center py-12">
                    <Spinner size="lg" />
                  </div>
                ) : eventosListaFiltrados.length === 0 ? (
                  <div className="text-center py-12 text-default-500">
                    <Calendar className="w-16 h-16 mx-auto mb-4 opacity-50" />
                    <p className="text-lg">Nenhum evento encontrado</p>
                    <p className="text-sm">
                      Crie seu primeiro evento para começar
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <AnimatePresence>
                      {eventosListaFiltrados.map((evento, index) => (
                        <motion.div
                          key={evento.id}
                          layout
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -20 }}
                          initial={{ opacity: 0, y: 20 }}
                          transition={{ duration: 0.4, delay: index * 0.1 }}
                          whileHover={{ scale: 1.02, y: -2 }}
                        >
                          <Card className="border-l-4 border-l-primary">
                            <CardBody className="p-6">
                              <div className="flex justify-between items-start">
                                <div className="flex-1">
                                  <div className="flex items-center gap-3 mb-2">
                                    <h4 className="font-semibold text-lg flex items-center gap-2">
                                      {evento.titulo}
                                      {evento.googleEventId && (
                                        <Tooltip content="Evento do Google Calendar">
                                          <FaGoogle className="w-4 h-4 text-blue-500" />
                                        </Tooltip>
                                      )}
                                    </h4>
                                    <Chip
                                      color={
                                        tiposEvento[
                                          evento.tipo as keyof typeof tiposEvento
                                        ]?.color || "default"
                                      }
                                      size="sm"
                                      variant="flat"
                                    >
                                      {tiposEvento[
                                        evento.tipo as keyof typeof tiposEvento
                                      ]?.label || evento.tipo}
                                    </Chip>
                                    <Chip
                                      color={
                                        statusEvento[
                                          evento.status as keyof typeof statusEvento
                                        ]?.color || "default"
                                      }
                                      size="sm"
                                      variant="flat"
                                    >
                                      {statusEvento[
                                        evento.status as keyof typeof statusEvento
                                      ]?.label || evento.status}
                                    </Chip>
                                  </div>

                                  {evento.descricao && (
                                    <p className="text-default-600 mb-3">
                                      {evento.descricao}
                                    </p>
                                  )}

                                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                                    <div className="flex items-center gap-2">
                                      <Calendar className="w-4 h-4 text-default-400" />
                                      <span>
                                        {formatarData(
                                          evento.dataInicio.toString(),
                                        )}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Clock className="w-4 h-4 text-default-400" />
                                      <span>
                                        {formatarHora(
                                          evento.dataInicio.toString(),
                                        )}{" "}
                                        -{" "}
                                        {formatarHora(
                                          evento.dataFim.toString(),
                                        )}
                                      </span>
                                    </div>
                                    {evento.local && (
                                      <div className="flex items-center gap-2">
                                        <MapPin className="w-4 h-4 text-default-400" />
                                        <span>{evento.local}</span>
                                      </div>
                                    )}
                                    {evento.participantes.length > 0 && (
                                      <div className="flex items-center gap-2">
                                        <Users className="w-4 h-4 text-default-400" />
                                        <span>
                                          {evento.participantes.length}{" "}
                                          participante(s)
                                        </span>
                                      </div>
                                    )}
                                  </div>

                                  {(evento as any).cliente && (
                                    <div className="mt-3">
                                      <span className="text-xs text-default-500">
                                        Cliente: {(evento as any).cliente?.nome}
                                      </span>
                                    </div>
                                  )}

                                  {renderConfirmacoes(evento)}
                                </div>

                                <Dropdown>
                                  <DropdownTrigger>
                                    <Button
                                      isIconOnly
                                      size="sm"
                                      variant="light"
                                    >
                                      <MoreVertical className="w-4 h-4" />
                                    </Button>
                                  </DropdownTrigger>
                                  <DropdownMenu>
                                    {permissions.canEditAllEvents &&
                                    !isCliente ? (
                                      <>
                                        <DropdownItem
                                          key="edit"
                                          startContent={
                                            <Edit className="w-4 h-4" />
                                          }
                                          onPress={() =>
                                            handleEditEvento(evento)
                                          }
                                        >
                                          Editar
                                        </DropdownItem>
                                        {evento.status !== "REALIZADO" && (
                                          <DropdownItem
                                            key="realizado"
                                            startContent={
                                              <CheckCircle className="w-4 h-4" />
                                            }
                                            onPress={() =>
                                              handleMarcarComoRealizado(
                                                evento.id,
                                              )
                                            }
                                          >
                                            Marcar como Realizado
                                          </DropdownItem>
                                        )}
                                        <DropdownItem
                                          key="delete"
                                          className="text-danger"
                                          color="danger"
                                          startContent={
                                            <Trash2 className="w-4 h-4" />
                                          }
                                          onPress={() =>
                                            handleDeleteEvento(evento.id)
                                          }
                                        >
                                          Excluir
                                        </DropdownItem>
                                      </>
                                    ) : null}
                                  </DropdownMenu>
                                </Dropdown>
                              </div>
                            </CardBody>
                          </Card>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                )}
              </CardBody>
            </Card>
          </motion.div>
        )}
      </div>

      {/* Modal do Formulário */}
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
