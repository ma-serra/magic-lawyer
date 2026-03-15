"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import useSWR from "swr";
import { motion, AnimatePresence } from "framer-motion";
import {
  Card, CardBody, CardHeader, Button, Input, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Textarea, Chip, Tooltip, Skeleton, Select, SelectItem, Pagination } from "@heroui/react";
import { parseDate, getLocalTimeZone, today } from "@internationalized/date";
import { toast } from "@/lib/toast";
import {
  Clock,
  FileText,
  Calendar,
  Plus,
  Search,
  Filter,
  Trash2,
  AlertCircle,
  Activity,
  Bell,
  Paperclip,
  MessageSquare,
  Mail,
  Smartphone,
  Timer,
  Megaphone,
  CalendarDays,
  Star,
  Eye,
  Edit3,
  Tag,
  RotateCcw,
  XCircle,
  Sparkles,
  UserCheck,
  AlertTriangle,
  CheckCircle2,
  ListChecks,
  FolderOpen,
} from "lucide-react";

import {
  listAndamentos,
  createAndamento,
  createTarefaFromAndamento,
  updateAndamento,
  deleteAndamento,
  marcarAndamentoResolvido,
  reabrirAndamento,
  getDashboardAndamentos,
  getTiposMovimentacao,
  type AndamentoFilters,
  type AndamentoCreateInput,
} from "@/app/actions/andamentos";
import { getAllProcessos } from "@/app/actions/processos";
import { usePermissionsCheck } from "@/app/hooks/use-permission-check";
import {
  MovimentacaoPrioridade,
  MovimentacaoStatusOperacional,
  MovimentacaoTipo,
  UserRole,
} from "@/generated/prisma";
import { PeopleMetricCard, PeoplePageHeader } from "@/components/people-ui";
import { SearchableSelect } from "@/components/searchable-select";
import { DateInput } from "@/components/ui/date-input";
import { DateRangeInput } from "@/components/ui/date-range-input";

// ============================================
// TIPOS
// ============================================

interface Andamento {
  id: string;
  titulo: string;
  descricao: string | null;
  observacaoResolucao?: string | null;
  observacaoReabertura?: string | null;
  tipo: MovimentacaoTipo | null;
  statusOperacional: MovimentacaoStatusOperacional;
  prioridade: MovimentacaoPrioridade;
  dataMovimentacao: Date | string;
  slaEm: Date | string | null;
  resolvidoEm: Date | string | null;
  prazo: Date | string | null;
  processo: {
    id: string;
    numero: string;
    titulo: string | null;
  };
  criadoPor: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
  } | null;
  responsavel: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    role: UserRole;
  } | null;
  tarefaRelacionada: {
    id: string;
    titulo: string;
    status: string;
  } | null;
  documentos: Array<{
    id: string;
    nome: string;
    tipo: string | null;
    url: string;
  }>;
  prazosRelacionados: Array<{
    id: string;
    titulo: string;
    dataVencimento: Date | string;
    status: string;
  }>;
  createdAt: Date | string;
  // Campos para notificações
  notificarCliente?: boolean;
  notificarEmail?: boolean;
  notificarWhatsapp?: boolean;
  mensagemPersonalizada?: string;
}

interface DashboardData {
  total: number;
  atrasados: number;
  semResponsavel: number;
  porTipo: Array<{
    tipo: string | null;
    _count: number;
  }>;
  porStatus?: Array<{
    statusOperacional: MovimentacaoStatusOperacional;
    _count: number;
  }>;
  ultimosAndamentos: Andamento[];
}

interface AndamentosPaginationMeta {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}

interface ProcessoFiltroDisponivel {
  id: string;
  numero: string;
  titulo: string | null;
}

interface ResponsavelDisponivel {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  role: UserRole;
}

interface AndamentosListResponse {
  success?: boolean;
  data?: Andamento[];
  pagination?: AndamentosPaginationMeta;
  processosDisponiveis?: ProcessoFiltroDisponivel[];
  responsaveisDisponiveis?: ResponsavelDisponivel[];
}

const ANDAMENTOS_PER_PAGE = 12;
const ALL_PROCESSOS_KEY = "__ALL_PROCESSOS__";
const ALL_STATUS_KEY = "__ALL_STATUS__";
const ALL_PRIORIDADE_KEY = "__ALL_PRIORIDADE__";
const ALL_TIPO_KEY = "__ALL_TIPO__";
const ALL_RESPONSAVEL_KEY = "__ALL_RESPONSAVEL__";
const UNASSIGNED_RESPONSAVEL_KEY = "__SEM_RESPONSAVEL__";
const REOPEN_STATUS_OPTIONS: MovimentacaoStatusOperacional[] = [
  "NOVO",
  "EM_TRIAGEM",
  "EM_EXECUCAO",
  "BLOQUEADO",
];

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

export default function AndamentosPage() {
  const { data: session } = useSession();
  const userRole = (session?.user as any)?.role as string | undefined;
  const clienteIdFromSession = (session?.user as any)?.clienteId as
    | string
    | undefined;
  const isClient = userRole === "CLIENTE";
  const isAdminLike = userRole === "ADMIN" || userRole === "SUPER_ADMIN";

  const permissionChecks = useMemo(
    () =>
      isClient || isAdminLike
        ? []
        : [
            { modulo: "processos", acao: "criar" },
            { modulo: "processos", acao: "editar" },
            { modulo: "processos", acao: "excluir" },
          ],
    [isClient, isAdminLike],
  );

  const { hasPermissionFor } = usePermissionsCheck(permissionChecks, {
    enabled: !isClient && !isAdminLike,
    enableEarlyAccess: true,
  });

  const canCreateAndamento =
    !isClient && (isAdminLike || hasPermissionFor("processos", "criar"));
  const canEditAndamento =
    !isClient && (isAdminLike || hasPermissionFor("processos", "editar"));
  const canDeleteAndamento =
    !isClient && (isAdminLike || hasPermissionFor("processos", "excluir"));
  // Estado dos filtros
  const [filters, setFilters] = useState<AndamentoFilters>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [dateRange, setDateRange] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [quickFilter, setQuickFilter] = useState<
    "ALL" | "MINE" | "OVERDUE" | "UNASSIGNED"
  >("ALL");

  // Estado do modal
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit" | "view">(
    "create",
  );
  const [selectedAndamento, setSelectedAndamento] = useState<Andamento | null>(
    null,
  );
  const [resolveModalOpen, setResolveModalOpen] = useState(false);
  const [resolvingAndamento, setResolvingAndamento] = useState<Andamento | null>(
    null,
  );
  const [resolucaoObservacao, setResolucaoObservacao] = useState("");
  const [resolving, setResolving] = useState(false);
  const [reopenModalOpen, setReopenModalOpen] = useState(false);
  const [reopeningAndamento, setReopeningAndamento] = useState<Andamento | null>(
    null,
  );
  const [reopenStatus, setReopenStatus] =
    useState<MovimentacaoStatusOperacional>("EM_EXECUCAO");
  const [reopenMotivo, setReopenMotivo] = useState("");
  const [reopening, setReopening] = useState(false);

  // SWR - Fetch data
  const {
    data: andamentosData,
    mutate: mutateAndamentos,
    isLoading: loadingAndamentos,
  } = useSWR(["andamentos", filters, currentPage], () =>
    listAndamentos({
      ...filters,
      page: currentPage,
      perPage: ANDAMENTOS_PER_PAGE,
    }),
  );

  const { data: dashboardData, isLoading: loadingDashboard } = useSWR(
    "dashboard-andamentos",
    getDashboardAndamentos,
  );

  // Debug temporário removido para produção

  const { data: processosData } = useSWR("processos-list", getAllProcessos);

  const { data: tiposData } = useSWR(
    "tipos-movimentacao",
    getTiposMovimentacao,
  );

  const andamentosResponse = andamentosData as AndamentosListResponse | undefined;
  const allAndamentos = (andamentosResponse?.data || []) as Andamento[];
  const serverPagination = andamentosResponse?.pagination;
  const processosDisponiveisFiltro =
    andamentosResponse?.processosDisponiveis || [];
  const responsaveisDisponiveis =
    andamentosResponse?.responsaveisDisponiveis || [];
  const dashboard = dashboardData?.data as DashboardData | undefined;
  const processos = useMemo(() => {
    const list = processosData?.processos || [];

    if (isClient && clienteIdFromSession) {
      return list.filter((proc: any) =>
        proc?.partes?.some(
          (parte: any) => parte?.clienteId === clienteIdFromSession,
        ),
      );
    }

    return list;
  }, [processosData?.processos, isClient, clienteIdFromSession]);
  const tipos = tiposData?.data || [];

  // Dados da página atual
  const andamentos = allAndamentos;

  const pagination = useMemo(
    () => ({
      page: serverPagination?.page ?? currentPage,
      perPage: serverPagination?.perPage ?? ANDAMENTOS_PER_PAGE,
      total: serverPagination?.total ?? andamentos.length,
      totalPages: serverPagination?.totalPages ?? 1,
      hasPreviousPage: serverPagination?.hasPreviousPage ?? false,
      hasNextPage: serverPagination?.hasNextPage ?? false,
    }),
    [serverPagination, currentPage, andamentos.length],
  );

  const firstVisibleItem =
    pagination.total > 0 ? (pagination.page - 1) * pagination.perPage + 1 : 0;
  const lastVisibleItem =
    pagination.total > 0
      ? Math.min(pagination.total, pagination.page * pagination.perPage)
      : 0;

  const calculatedDashboard = useMemo(() => {
    if (!andamentos.length) {
      return {
        total: 0,
        atrasados: 0,
        semResponsavel: 0,
        porTipo: [],
        porStatus: [],
        ultimosAndamentos: [],
      };
    }

    const total = andamentos.length;
    const porTipo = andamentos.reduce((acc: any, andamento: any) => {
      const tipo = andamento.tipo;

      acc[tipo] = (acc[tipo] || 0) + 1;

      return acc;
    }, {});

    const porTipoArray = Object.entries(porTipo).map(([tipo, count]) => ({
      tipo,
      _count: count,
    }));

    const ultimosAndamentos = andamentos
      .sort(
        (a: any, b: any) =>
          new Date(b.dataMovimentacao).getTime() -
          new Date(a.dataMovimentacao).getTime(),
      )
      .slice(0, 10);

    return {
      total,
      atrasados: andamentos.filter(
        (item) =>
          item.slaEm &&
          new Date(item.slaEm).getTime() < Date.now() &&
          item.statusOperacional !== "RESOLVIDO",
      ).length,
      semResponsavel: andamentos.filter((item) => !item.responsavel).length,
      porTipo: porTipoArray,
      porStatus: [],
      ultimosAndamentos,
    };
  }, [andamentos]);

  // Quando a action de dashboard falha, usamos os dados da listagem atual.
  const finalDashboard =
    dashboard && typeof dashboard.total === "number"
      ? dashboard
      : calculatedDashboard;

  // Função auxiliar para obter contagem por tipo
  const getCountByType = (tipo: string): number => {
    const item = finalDashboard?.porTipo.find((t: any) => t.tipo === tipo);

    return (item as any)?._count || 0;
  };

  // Handlers de filtro
  const handleSearch = (value: string) => {
    setSearchTerm(value);
    if (value.length >= 2 || value.length === 0) {
      setCurrentPage(1);
      setFilters((prev) => ({ ...prev, searchTerm: value || undefined }));
    }
  };

  const handleFilterChange = (key: keyof AndamentoFilters, value: any) => {
    setCurrentPage(1);
    setFilters((prev) => ({ ...prev, [key]: value || undefined }));
  };

  const clearFilters = () => {
    setFilters({});
    setSearchTerm("");
    setDateRange(null);
    setShowFilters(false);
    setQuickFilter("ALL");
    setCurrentPage(1);
  };

  const applyQuickFilter = (
    mode: "ALL" | "MINE" | "OVERDUE" | "UNASSIGNED",
  ) => {
    setQuickFilter(mode);
    setCurrentPage(1);
    setFilters((prev) => ({
      ...prev,
      somenteMinhas: mode === "MINE" ? true : undefined,
      somenteAtrasados: mode === "OVERDUE" ? true : undefined,
      somenteSemResponsavel: mode === "UNASSIGNED" ? true : undefined,
    }));
  };

  // Verificar se há filtros ativos
  const hasActiveFilters =
    filters.processoId ||
    filters.tipo ||
    filters.statusOperacional ||
    filters.prioridade ||
    filters.responsavelId ||
    filters.somenteAtrasados ||
    filters.somenteSemResponsavel ||
    filters.somenteMinhas ||
    searchTerm ||
    dateRange;

  // Handlers do modal
  const openCreateModal = () => {
    if (!canCreateAndamento) {
      toast.error("Você não tem permissão para criar andamentos");
      return;
    }

    setModalMode("create");
    setSelectedAndamento(null);
    setModalOpen(true);
  };

  const openEditModal = (andamento: Andamento) => {
    if (!canEditAndamento) {
      toast.error("Você não tem permissão para editar andamentos");
      return;
    }

    setModalMode("edit");
    setSelectedAndamento(andamento);
    setModalOpen(true);
  };

  const openViewModal = (andamento: Andamento) => {
    setModalMode("view");
    setSelectedAndamento(andamento);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setSelectedAndamento(null);
  };

  const openResolveModal = (andamento: Andamento) => {
    if (!canEditAndamento) {
      toast.error("Você não tem permissão para resolver andamentos");
      return;
    }

    setResolvingAndamento(andamento);
    setResolucaoObservacao(andamento.observacaoResolucao || "");
    setResolveModalOpen(true);
  };

  const closeResolveModal = () => {
    setResolveModalOpen(false);
    setResolvingAndamento(null);
    setResolucaoObservacao("");
    setResolving(false);
  };

  const openReopenModal = (andamento: Andamento) => {
    if (!canEditAndamento) {
      toast.error("Você não tem permissão para reabrir andamentos");
      return;
    }

    setReopeningAndamento(andamento);
    setReopenStatus("EM_EXECUCAO");
    setReopenMotivo("");
    setReopenModalOpen(true);
  };

  const closeReopenModal = () => {
    setReopenModalOpen(false);
    setReopeningAndamento(null);
    setReopenStatus("EM_EXECUCAO");
    setReopenMotivo("");
    setReopening(false);
  };

  useEffect(() => {
    if (serverPagination?.page && serverPagination.page !== currentPage) {
      setCurrentPage(serverPagination.page);
    }
  }, [serverPagination?.page, currentPage]);

  // Handler de exclusão
  const handleDelete = async (andamentoId: string) => {
    if (!canDeleteAndamento) {
      toast.error("Você não tem permissão para excluir andamentos");
      return;
    }

    if (!confirm("Tem certeza que deseja excluir este andamento?")) return;

    const result = await deleteAndamento(andamentoId);

    if (result.success) {
      toast.success("Andamento excluído com sucesso!");
      mutateAndamentos();
    } else {
      toast.error(result.error || "Erro ao excluir andamento");
    }
  };

  // Helpers
  const getTipoColor = (tipo: MovimentacaoTipo | null) => {
    switch (tipo) {
      case "ANDAMENTO":
        return "primary";
      case "PRAZO":
        return "warning";
      case "INTIMACAO":
        return "danger";
      case "AUDIENCIA":
        return "secondary";
      case "ANEXO":
        return "success";
      case "OUTRO":
        return "default";
      default:
        return "default";
    }
  };

  const getTipoIcon = (tipo: MovimentacaoTipo | null) => {
    switch (tipo) {
      case "ANDAMENTO":
        return (
          <Activity className="text-blue-600 dark:text-blue-400" size={16} />
        );
      case "PRAZO":
        return (
          <Timer className="text-amber-600 dark:text-amber-400" size={16} />
        );
      case "INTIMACAO":
        return (
          <Megaphone className="text-red-600 dark:text-red-400" size={16} />
        );
      case "AUDIENCIA":
        return (
          <CalendarDays
            className="text-purple-600 dark:text-purple-400"
            size={16}
          />
        );
      case "ANEXO":
        return (
          <Paperclip className="text-green-600 dark:text-green-400" size={16} />
        );
      case "OUTRO":
        return (
          <Sparkles className="text-gray-600 dark:text-gray-400" size={16} />
        );
      default:
        return <FileText className="text-gray-500" size={16} />;
    }
  };

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString("pt-BR");
  };

  const formatDateTime = (date: Date | string) => {
    return new Date(date).toLocaleString("pt-BR");
  };

  const getStatusColor = (status: MovimentacaoStatusOperacional) => {
    switch (status) {
      case "NOVO":
        return "default";
      case "EM_TRIAGEM":
        return "secondary";
      case "EM_EXECUCAO":
        return "primary";
      case "RESOLVIDO":
        return "success";
      case "BLOQUEADO":
        return "danger";
      default:
        return "default";
    }
  };

  const getStatusLabel = (status: MovimentacaoStatusOperacional) => {
    switch (status) {
      case "NOVO":
        return "Novo";
      case "EM_TRIAGEM":
        return "Em triagem";
      case "EM_EXECUCAO":
        return "Em execução";
      case "RESOLVIDO":
        return "Resolvido";
      case "BLOQUEADO":
        return "Bloqueado";
      default:
        return status;
    }
  };

  const getPrioridadeColor = (prioridade: MovimentacaoPrioridade) => {
    switch (prioridade) {
      case "BAIXA":
        return "default";
      case "MEDIA":
        return "secondary";
      case "ALTA":
        return "warning";
      case "CRITICA":
        return "danger";
      default:
        return "default";
    }
  };

  const getPrioridadeLabel = (prioridade: MovimentacaoPrioridade) => {
    switch (prioridade) {
      case "BAIXA":
        return "Baixa";
      case "MEDIA":
        return "Média";
      case "ALTA":
        return "Alta";
      case "CRITICA":
        return "Crítica";
      default:
        return prioridade;
    }
  };

  const formatPerson = (person?: {
    firstName: string | null;
    lastName: string | null;
    email: string;
  } | null) => {
    if (!person) return "Não definido";
    const fullName = `${person.firstName ?? ""} ${person.lastName ?? ""}`.trim();

    return fullName || person.email;
  };

  const isSlaAtrasado = (andamento: Andamento) =>
    Boolean(
      andamento.slaEm &&
        new Date(andamento.slaEm).getTime() < Date.now() &&
        andamento.statusOperacional !== "RESOLVIDO",
    );

  const handleCreateTaskFromAndamento = async (andamentoId: string) => {
    if (!canEditAndamento) {
      toast.error("Você não tem permissão para criar tarefa a partir do andamento");
      return;
    }

    const result = await createTarefaFromAndamento(andamentoId);

    if (result.success && result.data?.tarefaId) {
      toast.success("Tarefa vinculada ao andamento");
      mutateAndamentos();
    } else {
      toast.error(result.error || "Não foi possível criar tarefa");
    }
  };

  const handleResolveAndamento = async () => {
    if (!canEditAndamento) {
      toast.error("Você não tem permissão para resolver andamentos");
      return;
    }

    if (!resolvingAndamento?.id) {
      return;
    }

    setResolving(true);
    const result = await marcarAndamentoResolvido(
      resolvingAndamento.id,
      resolucaoObservacao || undefined,
    );
    setResolving(false);

    if (result.success) {
      toast.success("Andamento marcado como resolvido");
      mutateAndamentos();
      closeResolveModal();
    } else {
      toast.error(result.error || "Não foi possível resolver andamento");
    }
  };

  const handleReopenAndamento = async () => {
    if (!canEditAndamento) {
      toast.error("Você não tem permissão para reabrir andamentos");
      return;
    }

    if (!reopeningAndamento?.id) {
      return;
    }

    const motivo = reopenMotivo.trim();

    if (!motivo) {
      toast.error("Informe o motivo da reabertura");
      return;
    }

    setReopening(true);
    const result = await reabrirAndamento(
      reopeningAndamento.id,
      reopenStatus,
      motivo,
    );
    setReopening(false);

    if (result.success) {
      toast.success("Andamento reaberto com sucesso");
      mutateAndamentos();
      closeReopenModal();
    } else {
      toast.error(result.error || "Não foi possível reabrir andamento");
    }
  };

  const getProcessLabel = (proc: any) => {
    const numero = String(proc?.numero ?? "")
      .replace(/\s+/g, " ")
      .trim();
    const titulo = String(proc?.titulo ?? "")
      .replace(/\s+/g, " ")
      .trim();

    if (numero && titulo) {
      return `${numero} - ${titulo}`;
    }

    return numero || titulo || "Processo sem identificação";
  };

  const getProcessNumber = (proc: any) => {
    const numero = String(proc?.numero ?? "")
      .replace(/\s+/g, " ")
      .trim();

    return numero || "Processo sem número";
  };

  const processFilterIds = useMemo(
    () => new Set(processosDisponiveisFiltro.map((proc: any) => proc.id)),
    [processosDisponiveisFiltro],
  );

  const responsavelFilterIds = useMemo(
    () => new Set(responsaveisDisponiveis.map((responsavel) => responsavel.id)),
    [responsaveisDisponiveis],
  );

  const selectedProcessFilterKeys =
    filters.processoId && processFilterIds.has(filters.processoId)
      ? [filters.processoId]
      : [ALL_PROCESSOS_KEY];

  const selectedResponsavelFilterKeys =
    filters.responsavelId && responsavelFilterIds.has(filters.responsavelId)
      ? [filters.responsavelId]
      : [ALL_RESPONSAVEL_KEY];
  const processoFilterOptions = useMemo(
    () => [
      {
        key: ALL_PROCESSOS_KEY,
        label: "Todos os processos",
        textValue: "Todos os processos",
        description: "Remove o filtro de processo",
      },
      ...processosDisponiveisFiltro.map((proc: any) => ({
        key: proc.id,
        label: getProcessNumber(proc),
        textValue: getProcessLabel(proc),
        description: String(proc?.titulo ?? "").trim() || undefined,
      })),
    ],
    [processosDisponiveisFiltro],
  );
  const responsavelFilterOptions = useMemo(
    () => [
      {
        key: ALL_RESPONSAVEL_KEY,
        label: "Todos os responsáveis",
        textValue: "Todos os responsáveis",
        description: "Remove o filtro de responsável",
      },
      ...responsaveisDisponiveis.map((responsavel) => ({
        key: responsavel.id,
        label: formatPerson(responsavel),
        textValue: [
          formatPerson(responsavel),
          responsavel.email,
          responsavel.role,
        ]
          .filter(Boolean)
          .join(" "),
        description: responsavel.email,
      })),
    ],
    [responsaveisDisponiveis],
  );

  useEffect(() => {
    if (filters.processoId && !processFilterIds.has(filters.processoId)) {
      setFilters((prev) => {
        const { processoId, ...rest } = prev;

        return rest;
      });
      setCurrentPage(1);
    }
  }, [filters.processoId, processFilterIds]);

  useEffect(() => {
    if (filters.responsavelId && !responsavelFilterIds.has(filters.responsavelId)) {
      setFilters((prev) => {
        const { responsavelId, ...rest } = prev;

        return rest;
      });
      setCurrentPage(1);
    }
  }, [filters.responsavelId, responsavelFilterIds]);

  const activeFilterCount = [
    filters.processoId,
    filters.tipo,
    filters.statusOperacional,
    filters.prioridade,
    filters.responsavelId,
    filters.somenteAtrasados,
    filters.somenteSemResponsavel,
    filters.somenteMinhas,
    searchTerm,
    dateRange,
  ].filter(Boolean).length;

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-6">
      <PeoplePageHeader
        tag="Atividades jurídicas"
        title="Andamentos"
        description={`${pagination.total} andamento(s)${hasActiveFilters ? " no resultado filtrado" : " registrados na timeline"}`}
        actions={
          canCreateAndamento ? (
            <Button
              color="primary"
              size="sm"
              startContent={<Plus className="h-4 w-4" />}
              onPress={openCreateModal}
            >
              Novo andamento
            </Button>
          ) : undefined
        }
      />

      <Card className="border border-white/10 bg-background/70">
        <CardBody className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant={quickFilter === "ALL" ? "solid" : "flat"}
              color={quickFilter === "ALL" ? "primary" : "default"}
              onPress={() => applyQuickFilter("ALL")}
            >
              Todos
            </Button>
            <Button
              size="sm"
              variant={quickFilter === "MINE" ? "solid" : "flat"}
              color={quickFilter === "MINE" ? "primary" : "default"}
              onPress={() => applyQuickFilter("MINE")}
            >
              Meus andamentos
            </Button>
            <Button
              size="sm"
              variant={quickFilter === "OVERDUE" ? "solid" : "flat"}
              color={quickFilter === "OVERDUE" ? "danger" : "default"}
              onPress={() => applyQuickFilter("OVERDUE")}
            >
              Atrasados
            </Button>
            <Button
              size="sm"
              variant={quickFilter === "UNASSIGNED" ? "solid" : "flat"}
              color={quickFilter === "UNASSIGNED" ? "warning" : "default"}
              onPress={() => applyQuickFilter("UNASSIGNED")}
            >
              Sem responsável
            </Button>
          </div>
        </CardBody>
      </Card>

      {loadingDashboard ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <PeopleMetricCard
            helper="Movimentações registradas"
            icon={<Activity className="h-4 w-4" />}
            label="Total de andamentos"
            tone="primary"
            value={finalDashboard?.total || 0}
          />
          <PeopleMetricCard
            helper="Com prazo relacionado"
            icon={<Timer className="h-4 w-4" />}
            label="Com prazo"
            tone="warning"
            value={getCountByType("PRAZO")}
          />
          <PeopleMetricCard
            helper="SLA vencido e não resolvido"
            icon={<AlertTriangle className="h-4 w-4" />}
            label="Atrasados"
            tone="danger"
            value={finalDashboard?.atrasados || 0}
          />
          <PeopleMetricCard
            helper="Itens sem dono definido"
            icon={<UserCheck className="h-4 w-4" />}
            label="Sem responsável"
            tone="secondary"
            value={finalDashboard?.semResponsavel || 0}
          />
        </div>
      )}

      <motion.div
        animate={{ opacity: 1, y: 0 }}
        initial={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.3 }}
      >
        <Card className="border border-white/10 bg-background/70 backdrop-blur-xl">
          <CardHeader className="border-b border-white/10 px-5 py-4">
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
                    Refine a timeline por processo, tipo e período.
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
                  color="warning"
                  isDisabled={!hasActiveFilters}
                  size="sm"
                  startContent={<RotateCcw className="w-4 h-4" />}
                  variant="light"
                  onPress={clearFilters}
                >
                  Limpar
                </Button>
                <Button
                  color="primary"
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

          <AnimatePresence initial={false}>
            {showFilters ? (
              <motion.div
                animate={{ opacity: 1, height: "auto" }}
                className="overflow-hidden"
                exit={{ opacity: 0, height: 0 }}
                initial={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
              >
                <CardBody className="p-5">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
                    <div className="space-y-2">
                      <label
                        className="text-sm font-medium flex items-center gap-2"
                        htmlFor="filtro-titulo"
                      >
                        <Search className="w-4 h-4" />
                        Título
                      </label>
                      <Input
                        id="filtro-titulo"
                        placeholder="Buscar por título..."
                        size="sm"
                        startContent={
                          <Search className="w-4 h-4 text-default-400" />
                        }
                        value={searchTerm}
                        variant="bordered"
                        onValueChange={handleSearch}
                      />
                    </div>

                    <div className="space-y-2">
                      <label
                        className="text-sm font-medium flex items-center gap-2"
                        htmlFor="filtro-processo"
                      >
                        <FileText className="w-4 h-4" />
                        Processo
                      </label>
                      <SearchableSelect
                        id="filtro-processo"
                        emptyContent="Nenhum processo encontrado"
                        items={processoFilterOptions}
                        placeholder="Todos os processos"
                        selectedKey={selectedProcessFilterKeys[0] ?? ALL_PROCESSOS_KEY}
                        size="sm"
                        variant="bordered"
                        onSelectionChange={(selectedKey) => {
                          handleFilterChange(
                            "processoId",
                            selectedKey === ALL_PROCESSOS_KEY
                              ? undefined
                              : (selectedKey ?? undefined),
                          );
                        }}
                      />
                    </div>

                    <div className="space-y-2">
                      <label
                        className="text-sm font-medium flex items-center gap-2"
                        htmlFor="filtro-status-operacional"
                      >
                        <ListChecks className="w-4 h-4" />
                        Status operacional
                      </label>
                      <Select
                        id="filtro-status-operacional"
                        placeholder="Todos"
                        selectedKeys={
                          filters.statusOperacional
                            ? [filters.statusOperacional]
                            : [ALL_STATUS_KEY]
                        }
                        size="sm"
                        variant="bordered"
                        onSelectionChange={(keys) => {
                          const value = Array.from(keys)[0] as string;

                          handleFilterChange(
                            "statusOperacional",
                            value === ALL_STATUS_KEY ? undefined : value,
                          );
                        }}
                      >
                        <SelectItem key={ALL_STATUS_KEY} textValue="Todos os status">
                          Todos os status
                        </SelectItem>
                        <SelectItem key="NOVO" textValue="Novo">
                          Novo
                        </SelectItem>
                        <SelectItem key="EM_TRIAGEM" textValue="Em triagem">
                          Em triagem
                        </SelectItem>
                        <SelectItem key="EM_EXECUCAO" textValue="Em execução">
                          Em execução
                        </SelectItem>
                        <SelectItem key="RESOLVIDO" textValue="Resolvido">
                          Resolvido
                        </SelectItem>
                        <SelectItem key="BLOQUEADO" textValue="Bloqueado">
                          Bloqueado
                        </SelectItem>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <label
                        className="text-sm font-medium flex items-center gap-2"
                        htmlFor="filtro-prioridade"
                      >
                        <AlertTriangle className="w-4 h-4" />
                        Prioridade
                      </label>
                      <Select
                        id="filtro-prioridade"
                        placeholder="Todas"
                        selectedKeys={
                          filters.prioridade
                            ? [filters.prioridade]
                            : [ALL_PRIORIDADE_KEY]
                        }
                        size="sm"
                        variant="bordered"
                        onSelectionChange={(keys) => {
                          const value = Array.from(keys)[0] as string;

                          handleFilterChange(
                            "prioridade",
                            value === ALL_PRIORIDADE_KEY ? undefined : value,
                          );
                        }}
                      >
                        <SelectItem key={ALL_PRIORIDADE_KEY} textValue="Todas as prioridades">
                          Todas as prioridades
                        </SelectItem>
                        <SelectItem key="BAIXA" textValue="Baixa">
                          Baixa
                        </SelectItem>
                        <SelectItem key="MEDIA" textValue="Média">
                          Média
                        </SelectItem>
                        <SelectItem key="ALTA" textValue="Alta">
                          Alta
                        </SelectItem>
                        <SelectItem key="CRITICA" textValue="Crítica">
                          Crítica
                        </SelectItem>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <label
                        className="text-sm font-medium flex items-center gap-2"
                        htmlFor="filtro-tipo"
                      >
                        <Tag className="w-4 h-4" />
                        Tipo
                      </label>
                      <Select
                        id="filtro-tipo"
                        placeholder="Todos os tipos"
                        selectedKeys={filters.tipo ? [filters.tipo] : [ALL_TIPO_KEY]}
                        size="sm"
                        variant="bordered"
                        onSelectionChange={(keys) => {
                          const value = Array.from(keys)[0] as string;

                          handleFilterChange(
                            "tipo",
                            value === ALL_TIPO_KEY ? undefined : value,
                          );
                        }}
                      >
                        {[ALL_TIPO_KEY, ...tipos].map((tipoValue) => {
                          const label =
                            tipoValue === ALL_TIPO_KEY ? "Todos os tipos" : tipoValue;

                          return (
                            <SelectItem key={tipoValue} textValue={label}>
                              {label}
                            </SelectItem>
                          );
                        })}
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <label
                        className="text-sm font-medium flex items-center gap-2"
                        htmlFor="filtro-data"
                      >
                        <Calendar className="w-4 h-4" />
                        Período
                      </label>
                      <DateRangeInput
                        className="w-full"
                        id="filtro-data"
                        rangeValue={dateRange}
                        size="sm"
                        variant="bordered"
                        onRangeValueChange={(range) => {
                          setDateRange(range);
                          setCurrentPage(1);
                          if (range?.start && range?.end) {
                            setFilters((prev) => ({
                              ...prev,
                              dataInicio: new Date(range.start as any),
                              dataFim: new Date(range.end as any),
                            }));
                          } else {
                            setFilters((prev) => {
                              const { dataInicio, dataFim, ...restFilters } =
                                prev;

                              return restFilters;
                            });
                          }
                        }}
                      />
                    </div>

                    {responsaveisDisponiveis.length > 0 ? (
                      <div className="space-y-2">
                        <label
                          className="text-sm font-medium flex items-center gap-2"
                          htmlFor="filtro-responsavel"
                        >
                          <UserCheck className="w-4 h-4" />
                          Responsável
                        </label>
                        <SearchableSelect
                          id="filtro-responsavel"
                          emptyContent="Nenhum responsável encontrado"
                          items={responsavelFilterOptions}
                          placeholder="Todos os responsáveis"
                          selectedKey={
                            selectedResponsavelFilterKeys[0] ??
                            ALL_RESPONSAVEL_KEY
                          }
                          size="sm"
                          variant="bordered"
                        onSelectionChange={(selectedKey) => {
                            handleFilterChange(
                              "responsavelId",
                              selectedKey === ALL_RESPONSAVEL_KEY
                                ? undefined
                                : (selectedKey ?? undefined),
                            );
                          }}
                        />
                      </div>
                    ) : null}
                  </div>
                </CardBody>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </Card>
      </motion.div>

      <motion.div
        animate={{ opacity: 1, y: 0 }}
        initial={{ opacity: 0, y: 20 }}
        transition={{ duration: 0.4, delay: 0.1 }}
      >
        <Card className="overflow-hidden border border-white/10 bg-background/70 backdrop-blur-xl">
          <CardHeader className="border-b border-white/10 px-5 py-4">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-white">
                Timeline de andamentos
              </h2>
              <p className="text-sm text-default-400">
                {pagination.total} itens listados em ordem cronológica.
              </p>
            </div>
          </CardHeader>
          <CardBody className="p-5">
            {loadingAndamentos ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-32 rounded-lg" />
                ))}
              </div>
            ) : andamentos.length === 0 ? (
              <motion.div
                animate={{ opacity: 1, scale: 1 }}
                className="py-12 text-center"
                initial={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.3 }}
              >
                <Activity className="mx-auto mb-4 text-default-400" size={48} />
                <p className="text-default-500">Nenhum andamento encontrado</p>
              </motion.div>
            ) : (
              <div className="relative space-y-4 md:space-y-6">
                <div className="absolute bottom-0 left-5 top-0 w-0.5 bg-white/10 md:left-6" />

                <AnimatePresence>
                  {andamentos.map((andamento, index) => (
                    <motion.div
                      key={andamento.id}
                      animate={{ opacity: 1, x: 0 }}
                      className="relative flex gap-4 md:gap-6"
                      exit={{ opacity: 0, x: 50 }}
                      initial={{ opacity: 0, x: -50 }}
                      transition={{ duration: 0.3, delay: index * 0.08 }}
                    >
                      <div
                        className={`relative z-10 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border-2 bg-background shadow-sm md:h-12 md:w-12 ${
                          andamento.tipo === "ANDAMENTO"
                            ? "border-blue-500/60"
                            : andamento.tipo === "PRAZO"
                              ? "border-amber-500/60"
                              : andamento.tipo === "INTIMACAO"
                                ? "border-red-500/60"
                                : andamento.tipo === "AUDIENCIA"
                                  ? "border-purple-500/60"
                                  : andamento.tipo === "ANEXO"
                                    ? "border-green-500/60"
                                    : "border-default-400/60"
                        }`}
                      >
                        {getTipoIcon(andamento.tipo)}
                      </div>

                      <Card
                        className={`ml-wave-surface flex-1 border border-white/10 bg-content1/40 transition-colors duration-300 hover:bg-content1/70 ${
                          andamento.tipo === "ANDAMENTO"
                            ? "border-l-4 border-l-blue-500"
                            : andamento.tipo === "PRAZO"
                              ? "border-l-4 border-l-amber-500"
                              : andamento.tipo === "INTIMACAO"
                                ? "border-l-4 border-l-red-500"
                                : andamento.tipo === "AUDIENCIA"
                                  ? "border-l-4 border-l-purple-500"
                                  : andamento.tipo === "ANEXO"
                                    ? "border-l-4 border-l-green-500"
                                    : "border-l-4 border-l-default-400"
                        }`}
                      >
                        <CardBody className="p-3 md:p-4">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div
                              className="flex-1 cursor-pointer space-y-2"
                              onClick={() => openViewModal(andamento)}
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-base font-semibold md:text-lg">
                                  {andamento.titulo}
                                </h3>
                                {andamento.tipo ? (
                                  <Chip
                                    color={getTipoColor(andamento.tipo)}
                                    size="sm"
                                    variant="flat"
                                  >
                                    {andamento.tipo}
                                  </Chip>
                                ) : null}
                                <Chip
                                  color={getStatusColor(andamento.statusOperacional)}
                                  size="sm"
                                  variant="flat"
                                >
                                  {getStatusLabel(andamento.statusOperacional)}
                                </Chip>
                                <Chip
                                  color={getPrioridadeColor(andamento.prioridade)}
                                  size="sm"
                                  variant="bordered"
                                >
                                  {getPrioridadeLabel(andamento.prioridade)}
                                </Chip>
                                {isSlaAtrasado(andamento) ? (
                                  <Chip color="danger" size="sm" variant="solid">
                                    SLA atrasado
                                  </Chip>
                                ) : null}
                              </div>

                              <p className="text-xs text-default-400 md:text-sm">
                                Processo: {andamento.processo.numero}
                                {andamento.processo.titulo
                                  ? ` - ${andamento.processo.titulo}`
                                  : ""}
                              </p>

                              {andamento.descricao ? (
                                <p className="text-xs text-default-500 md:text-sm">
                                  {andamento.descricao}
                                </p>
                              ) : null}

                              {andamento.statusOperacional === "RESOLVIDO" &&
                              andamento.observacaoResolucao ? (
                                <p className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300 md:text-sm">
                                  <span className="font-semibold">
                                    Observação da resolução:
                                  </span>{" "}
                                  {andamento.observacaoResolucao}
                                </p>
                              ) : null}

                              {andamento.statusOperacional !== "RESOLVIDO" &&
                              andamento.observacaoReabertura ? (
                                <p className="rounded-md border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 md:text-sm">
                                  <span className="font-semibold">
                                    Motivo da reabertura:
                                  </span>{" "}
                                  {andamento.observacaoReabertura}
                                </p>
                              ) : null}

                              <div className="flex flex-wrap gap-3 text-xs text-default-400">
                                <span className="flex items-center gap-1">
                                  <Calendar size={14} />
                                  {formatDateTime(andamento.dataMovimentacao)}
                                </span>

                                {andamento.prazo ? (
                                  <span className="flex items-center gap-1 text-warning">
                                    <Clock size={14} />
                                    Prazo: {formatDate(andamento.prazo)}
                                  </span>
                                ) : null}

                                {andamento.slaEm ? (
                                  <span
                                    className={`flex items-center gap-1 ${
                                      isSlaAtrasado(andamento)
                                        ? "text-danger"
                                        : "text-default-400"
                                    }`}
                                  >
                                    <Timer size={14} />
                                    SLA: {formatDateTime(andamento.slaEm)}
                                  </span>
                                ) : null}

                                {andamento.documentos.length > 0 ? (
                                  <span className="flex items-center gap-1">
                                    <Paperclip size={14} />
                                    {andamento.documentos.length} documento(s)
                                  </span>
                                ) : null}

                                {andamento.prazosRelacionados.length > 0 ? (
                                  <span className="flex items-center gap-1">
                                    <AlertCircle size={14} />
                                    {andamento.prazosRelacionados.length} prazo(s)
                                  </span>
                                ) : null}

                                {andamento.criadoPor ? (
                                  <span>
                                    Por: {andamento.criadoPor.firstName}{" "}
                                    {andamento.criadoPor.lastName}
                                  </span>
                                ) : null}

                                <span>
                                  Responsável: {formatPerson(andamento.responsavel)}
                                </span>
                              </div>
                            </div>

                            <div className="flex w-full shrink-0 flex-col gap-2 sm:w-[176px] sm:items-stretch">
                              <Button
                                as={Link}
                                className="w-full justify-center sm:justify-start"
                                href={`/processos/${andamento.processo.id}`}
                                size="sm"
                                startContent={<FolderOpen size={14} />}
                                variant="flat"
                              >
                                Processo
                              </Button>

                              {andamento.tarefaRelacionada?.id ? (
                                <Button
                                  as={Link}
                                  className="w-full justify-center sm:justify-start"
                                  href="/tarefas"
                                  size="sm"
                                  startContent={<ListChecks size={14} />}
                                  variant="flat"
                                >
                                  Tarefa
                                </Button>
                              ) : canEditAndamento ? (
                                <Button
                                  className="w-full justify-center sm:justify-start"
                                  size="sm"
                                  startContent={<ListChecks size={14} />}
                                  variant="flat"
                                  onPress={() =>
                                    handleCreateTaskFromAndamento(andamento.id)
                                  }
                                >
                                  Criar tarefa
                                </Button>
                              ) : null}

                              {canEditAndamento &&
                              andamento.statusOperacional !== "RESOLVIDO" ? (
                                <Button
                                  color="success"
                                  className="w-full justify-center sm:justify-start"
                                  size="sm"
                                  startContent={<CheckCircle2 size={14} />}
                                  variant="flat"
                                  onPress={() => openResolveModal(andamento)}
                                >
                                  Resolver
                                </Button>
                              ) : null}

                              {canEditAndamento &&
                              andamento.statusOperacional === "RESOLVIDO" ? (
                                <Button
                                  color="warning"
                                  className="w-full justify-center sm:justify-start"
                                  size="sm"
                                  startContent={<RotateCcw size={14} />}
                                  variant="flat"
                                  onPress={() => openReopenModal(andamento)}
                                >
                                  Reabrir
                                </Button>
                              ) : null}

                              {canEditAndamento || canDeleteAndamento ? (
                                <div
                                  className={`grid gap-2 ${
                                    canEditAndamento && canDeleteAndamento
                                      ? "grid-cols-2"
                                      : "grid-cols-1"
                                  }`}
                                >
                                  {canEditAndamento ? (
                                    <Tooltip color="primary" content="Editar">
                                      <Button
                                        isIconOnly
                                        className="w-full text-blue-600 hover:bg-blue-100 dark:text-blue-400 dark:hover:bg-blue-900/20"
                                        size="sm"
                                        variant="light"
                                        onPress={() => {
                                          openEditModal(andamento);
                                        }}
                                      >
                                        <Edit3 size={16} />
                                      </Button>
                                    </Tooltip>
                                  ) : null}

                                  {canDeleteAndamento ? (
                                    <Tooltip color="danger" content="Excluir">
                                      <Button
                                        isIconOnly
                                        className="w-full text-red-600 hover:bg-red-100 dark:text-red-400 dark:hover:bg-red-900/20"
                                        color="danger"
                                        size="sm"
                                        variant="light"
                                        onPress={() => {
                                          handleDelete(andamento.id);
                                        }}
                                      >
                                        <Trash2 size={16} />
                                      </Button>
                                    </Tooltip>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </CardBody>
                      </Card>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </CardBody>
          {pagination.totalPages > 1 ? (
            <div className="flex flex-col gap-3 border-t border-white/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-default-400">
                Exibindo {firstVisibleItem}-{lastVisibleItem} de {pagination.total}
              </p>
              <Pagination
                showControls
                page={pagination.page}
                total={pagination.totalPages}
                onChange={setCurrentPage}
              />
            </div>
          ) : null}
        </Card>
      </motion.div>

      {/* Modal de Criar/Editar/Visualizar */}
      <AndamentoModal
        andamento={selectedAndamento}
        isOpen={modalOpen}
        mode={modalMode}
        processos={processos}
        responsaveis={responsaveisDisponiveis}
        tipos={tipos}
        onClose={closeModal}
        onSuccess={mutateAndamentos}
      />

      <ResolveAndamentoModal
        andamento={resolvingAndamento}
        isOpen={resolveModalOpen}
        isSaving={resolving}
        observacao={resolucaoObservacao}
        onClose={closeResolveModal}
        onConfirm={handleResolveAndamento}
        onObservacaoChange={setResolucaoObservacao}
      />

      <ReopenAndamentoModal
        andamento={reopeningAndamento}
        isOpen={reopenModalOpen}
        isSaving={reopening}
        motivo={reopenMotivo}
        selectedStatus={reopenStatus}
        onClose={closeReopenModal}
        onConfirm={handleReopenAndamento}
        onMotivoChange={setReopenMotivo}
        onStatusChange={setReopenStatus}
      />
    </div>
  );
}

// ============================================
// MODAL DE RESOLUCAO RAPIDA
// ============================================

interface ResolveAndamentoModalProps {
  isOpen: boolean;
  isSaving: boolean;
  andamento: Andamento | null;
  observacao: string;
  onClose: () => void;
  onConfirm: () => void;
  onObservacaoChange: (value: string) => void;
}

function ResolveAndamentoModal({
  isOpen,
  isSaving,
  andamento,
  observacao,
  onClose,
  onConfirm,
  onObservacaoChange,
}: ResolveAndamentoModalProps) {
  return (
    <Modal isOpen={isOpen} size="lg" onClose={onClose}>
      <ModalContent>
        <ModalHeader className="flex items-center gap-2">
          <CheckCircle2 className="text-success" size={18} />
          Resolver andamento
        </ModalHeader>
        <ModalBody className="space-y-3">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">
              {andamento?.titulo || "Andamento"}
            </p>
            <p className="text-xs text-default-500">
              {andamento?.processo.numero}
              {andamento?.processo.titulo ? ` - ${andamento.processo.titulo}` : ""}
            </p>
          </div>
          <Textarea
            description="Opcional: registre como a demanda foi solucionada."
            minRows={4}
            placeholder="Ex: Audiência realizada, acordo parcial homologado e visitas restabelecidas."
            value={observacao}
            onValueChange={onObservacaoChange}
          />
        </ModalBody>
        <ModalFooter>
          <Button isDisabled={isSaving} variant="light" onPress={onClose}>
            Cancelar
          </Button>
          <Button
            color="success"
            isLoading={isSaving}
            startContent={<CheckCircle2 size={14} />}
            onPress={onConfirm}
          >
            Marcar como resolvido
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

interface ReopenAndamentoModalProps {
  isOpen: boolean;
  isSaving: boolean;
  andamento: Andamento | null;
  motivo: string;
  selectedStatus: MovimentacaoStatusOperacional;
  onClose: () => void;
  onConfirm: () => void;
  onMotivoChange: (value: string) => void;
  onStatusChange: (status: MovimentacaoStatusOperacional) => void;
}

function ReopenAndamentoModal({
  isOpen,
  isSaving,
  andamento,
  motivo,
  selectedStatus,
  onClose,
  onConfirm,
  onMotivoChange,
  onStatusChange,
}: ReopenAndamentoModalProps) {
  const getStatusLabel = (status: MovimentacaoStatusOperacional) => {
    switch (status) {
      case "NOVO":
        return "Novo";
      case "EM_TRIAGEM":
        return "Em triagem";
      case "EM_EXECUCAO":
        return "Em execução";
      case "BLOQUEADO":
        return "Bloqueado";
      default:
        return status;
    }
  };

  return (
    <Modal isOpen={isOpen} size="lg" onClose={onClose}>
      <ModalContent>
        <ModalHeader className="flex items-center gap-2">
          <RotateCcw className="text-warning" size={18} />
          Reabrir andamento
        </ModalHeader>
        <ModalBody className="space-y-3">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">
              {andamento?.titulo || "Andamento"}
            </p>
            <p className="text-xs text-default-500">
              {andamento?.processo.numero}
              {andamento?.processo.titulo ? ` - ${andamento.processo.titulo}` : ""}
            </p>
          </div>
          <Select
            label="Novo status operacional"
            placeholder="Selecione o status"
            selectedKeys={[selectedStatus]}
            onSelectionChange={(keys) => {
              const next = Array.from(keys)[0] as MovimentacaoStatusOperacional;

              if (next && REOPEN_STATUS_OPTIONS.includes(next)) {
                onStatusChange(next);
              }
            }}
          >
            {REOPEN_STATUS_OPTIONS.map((status) => {
              const label = getStatusLabel(status);

              return (
                <SelectItem key={status} textValue={label}>
                  {label}
                </SelectItem>
              );
            })}
          </Select>
          <Textarea
            isRequired
            description="Obrigatório: registre por que o andamento está sendo reaberto."
            minRows={4}
            placeholder="Ex: Cliente informou novo fato e será necessária nova audiência."
            value={motivo}
            onValueChange={onMotivoChange}
          />
        </ModalBody>
        <ModalFooter>
          <Button isDisabled={isSaving} variant="light" onPress={onClose}>
            Cancelar
          </Button>
          <Button
            color="warning"
            isDisabled={!motivo.trim()}
            isLoading={isSaving}
            startContent={<RotateCcw size={14} />}
            variant="flat"
            onPress={onConfirm}
          >
            Reabrir andamento
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

// ============================================
// MODAL DE ANDAMENTO
// ============================================

interface AndamentoModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: "create" | "edit" | "view";
  andamento: Andamento | null;
  processos: any[];
  responsaveis: ResponsavelDisponivel[];
  tipos: MovimentacaoTipo[];
  onSuccess: () => void;
}

function AndamentoModal({
  isOpen,
  onClose,
  mode,
  andamento,
  processos,
  responsaveis,
  tipos,
  onSuccess,
}: AndamentoModalProps) {
  const isReadOnly = mode === "view";

  // Calcular dados iniciais do formulário
  const initialFormData = useMemo(() => {
    if (mode === "create") {
      return {
        processoId: "",
        titulo: "",
        descricao: "",
        observacaoResolucao: "",
        tipo: "",
        statusOperacional: "NOVO",
        prioridade: "MEDIA",
        responsavelId: "",
        dataMovimentacao: today(getLocalTimeZone()),
        slaEm: null,
        prazo: null,
        resolvidoEm: null,
        geraPrazo: false,
        // Campos para notificações
        notificarCliente: false,
        notificarEmail: false,
        notificarWhatsapp: false,
        mensagemPersonalizada: "",
      };
    } else if (andamento) {
      return {
        processoId: andamento.processo.id,
        titulo: andamento.titulo,
        descricao: andamento.descricao || "",
        observacaoResolucao: andamento.observacaoResolucao || "",
        tipo: andamento.tipo || "",
        statusOperacional: andamento.statusOperacional || "NOVO",
        prioridade: andamento.prioridade || "MEDIA",
        responsavelId: andamento.responsavel?.id || "",
        dataMovimentacao: parseDate(
          new Date(andamento.dataMovimentacao).toISOString().split("T")[0],
        ),
        slaEm: andamento.slaEm
          ? parseDate(new Date(andamento.slaEm).toISOString().split("T")[0])
          : null,
        prazo: andamento.prazo
          ? parseDate(new Date(andamento.prazo).toISOString().split("T")[0])
          : null,
        resolvidoEm: andamento.resolvidoEm
          ? parseDate(new Date(andamento.resolvidoEm).toISOString().split("T")[0])
          : null,
        geraPrazo: false,
        // Campos para notificações
        notificarCliente: andamento.notificarCliente || false,
        notificarEmail: andamento.notificarEmail || false,
        notificarWhatsapp: andamento.notificarWhatsapp || false,
        mensagemPersonalizada: andamento.mensagemPersonalizada || "",
      };
    }

    return {
      processoId: "",
      titulo: "",
      descricao: "",
      observacaoResolucao: "",
      tipo: "",
      statusOperacional: "NOVO",
      prioridade: "MEDIA",
      responsavelId: "",
      dataMovimentacao: today(getLocalTimeZone()),
      slaEm: null,
      prazo: null,
      resolvidoEm: null,
      geraPrazo: false,
      notificarCliente: false,
      notificarEmail: false,
      notificarWhatsapp: false,
      mensagemPersonalizada: "",
    };
  }, [mode, andamento]);

  const [formData, setFormData] = useState<any>(initialFormData);
  const [saving, setSaving] = useState(false);

  const getProcessLabel = (proc: any) => {
    const numero = String(proc?.numero ?? "")
      .replace(/\s+/g, " ")
      .trim();
    const titulo = String(proc?.titulo ?? "")
      .replace(/\s+/g, " ")
      .trim();

    if (numero && titulo) {
      return `${numero} - ${titulo}`;
    }

    return numero || titulo || "Processo sem identificação";
  };

  const formatResponsavelLabel = (responsavel: ResponsavelDisponivel) => {
    const fullName =
      `${responsavel.firstName ?? ""} ${responsavel.lastName ?? ""}`.trim();

    return fullName || responsavel.email;
  };

  const processIds = useMemo(
    () => new Set((processos || []).map((proc: any) => proc.id)),
    [processos],
  );
  const responsavelIds = useMemo(
    () => new Set((responsaveis || []).map((responsavel) => responsavel.id)),
    [responsaveis],
  );

  const selectedProcessKeys =
    formData.processoId && processIds.has(formData.processoId)
      ? [formData.processoId]
      : [];
  const selectedResponsavelKeys =
    formData.responsavelId && responsavelIds.has(formData.responsavelId)
      ? [formData.responsavelId]
      : [UNASSIGNED_RESPONSAVEL_KEY];
  const processoModalOptions = useMemo(
    () =>
      processos.map((proc: any) => {
        const processLabel = getProcessLabel(proc);

        return {
          key: proc.id,
          label:
            String(proc?.numero ?? "")
              .replace(/\s+/g, " ")
              .trim() || "Processo sem número",
          textValue: processLabel,
          description: String(proc?.titulo ?? "").trim() || undefined,
        };
      }),
    [processos],
  );
  const responsavelModalOptions = useMemo(
    () => [
      {
        key: UNASSIGNED_RESPONSAVEL_KEY,
        label: "Sem responsável",
        textValue: "Sem responsável",
      },
      ...responsaveis.map((responsavel) => ({
        key: responsavel.id,
        label: formatResponsavelLabel(responsavel),
        textValue: [
          formatResponsavelLabel(responsavel),
          responsavel.email,
          responsavel.role,
        ]
          .filter(Boolean)
          .join(" "),
        description: responsavel.email,
      })),
    ],
    [responsaveis],
  );

  // Atualizar formData quando initialFormData mudar
  useEffect(() => {
    setFormData(initialFormData);
  }, [initialFormData]);

  const handleSubmit = async () => {
    if (!formData.processoId || !formData.titulo) {
      toast.error("Preencha os campos obrigatórios");

      return;
    }

    setSaving(true);

    const input: AndamentoCreateInput = {
      processoId: formData.processoId,
      titulo: formData.titulo,
      descricao: formData.descricao || undefined,
      observacaoResolucao: formData.observacaoResolucao || undefined,
      tipo: formData.tipo || undefined,
      statusOperacional: formData.statusOperacional || undefined,
      prioridade: formData.prioridade || undefined,
      responsavelId: formData.responsavelId || undefined,
      dataMovimentacao: formData.dataMovimentacao
        ? new Date(formData.dataMovimentacao.toString())
        : undefined,
      slaEm: formData.slaEm ? new Date(formData.slaEm.toString()) : undefined,
      resolvidoEm: formData.resolvidoEm
        ? new Date(formData.resolvidoEm.toString())
        : undefined,
      prazo: formData.prazo ? new Date(formData.prazo.toString()) : undefined,
      geraPrazo: formData.geraPrazo,
      // Campos para notificações
      notificarCliente: formData.notificarCliente,
      notificarEmail: formData.notificarEmail,
      notificarWhatsapp: formData.notificarWhatsapp,
      mensagemPersonalizada: formData.mensagemPersonalizada || undefined,
    };

    const result =
      mode === "create"
        ? await createAndamento(input)
        : await updateAndamento(andamento!.id, input);

    setSaving(false);

    if (result.success) {
      toast.success(
        mode === "create"
          ? "Andamento criado com sucesso!"
          : "Andamento atualizado com sucesso!",
      );
      onSuccess();
      onClose();
    } else {
      toast.error(result.error || "Erro ao salvar andamento");
    }
  };

  return (
    <Modal isOpen={isOpen} scrollBehavior="inside" size="2xl" onClose={onClose}>
      <motion.div
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        initial={{ opacity: 0, scale: 0.9 }}
        transition={{ duration: 0.2 }}
      >
        <ModalContent>
          <ModalHeader>
            <div className="flex items-center gap-3">
              {mode === "create" && (
                <>
                  <div className="p-2 bg-linear-to-br from-green-500 to-emerald-600 rounded-lg">
                    <Plus className="text-white" size={20} />
                  </div>
                  <span className="text-xl font-semibold">Novo Andamento</span>
                </>
              )}
              {mode === "edit" && (
                <>
                  <div className="p-2 bg-linear-to-br from-blue-500 to-indigo-600 rounded-lg">
                    <Edit3 className="text-white" size={20} />
                  </div>
                  <span className="text-xl font-semibold">
                    Editar Andamento
                  </span>
                </>
              )}
              {mode === "view" && (
                <>
                  <div className="p-2 bg-linear-to-br from-purple-500 to-pink-600 rounded-lg">
                    <Eye className="text-white" size={20} />
                  </div>
                  <span className="text-xl font-semibold">
                    Detalhes do Andamento
                  </span>
                </>
              )}
            </div>
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <div className="space-y-2">
                <label
                  className="text-sm font-medium text-slate-600 dark:text-slate-400 flex items-center gap-2"
                  htmlFor="modal-processo"
                >
                  <FileText className="text-blue-500" size={16} />
                  Processo
                </label>
                <SearchableSelect
                  isRequired
                  id="modal-processo"
                  emptyContent="Nenhum processo encontrado"
                  items={processoModalOptions}
                  isDisabled={isReadOnly || mode === "edit"}
                  placeholder="Selecione o processo"
                  selectedKey={selectedProcessKeys[0] ?? null}
                  onSelectionChange={(selectedKey) => {
                    setFormData({ ...formData, processoId: selectedKey || "" });
                  }}
                />
              </div>

              <div className="space-y-2">
                <label
                  className="text-sm font-medium text-slate-600 dark:text-slate-400 flex items-center gap-2"
                  htmlFor="modal-titulo"
                >
                  <Star className="text-yellow-500" size={16} />
                  Título
                </label>
                <Input
                  isRequired
                  classNames={{
                    input: "text-slate-700 dark:text-slate-300",
                    inputWrapper:
                      "bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600",
                  }}
                  id="modal-titulo"
                  isReadOnly={isReadOnly}
                  placeholder="Ex: Sentença proferida, Intimação recebida, etc"
                  value={formData.titulo}
                  onValueChange={(value) =>
                    setFormData({ ...formData, titulo: value })
                  }
                />
              </div>

              <div className="space-y-2">
                <label
                  className="text-sm font-medium text-slate-600 dark:text-slate-400 flex items-center gap-2"
                  htmlFor="modal-descricao"
                >
                  <FileText className="text-green-500" size={16} />
                  Descrição
                </label>
                <Textarea
                  classNames={{
                    input: "text-slate-700 dark:text-slate-300",
                    inputWrapper:
                      "bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600",
                  }}
                  id="modal-descricao"
                  isReadOnly={isReadOnly}
                  minRows={3}
                  placeholder="Descreva o andamento em detalhes..."
                  value={formData.descricao}
                  onValueChange={(value) =>
                    setFormData({ ...formData, descricao: value })
                  }
                />
              </div>

              <div className="space-y-2">
                <label
                  className="text-sm font-medium text-slate-600 dark:text-slate-400 flex items-center gap-2"
                  htmlFor="modal-tipo"
                >
                  <Tag className="text-purple-500" size={16} />
                  Tipo
                </label>
                <Select
                  id="modal-tipo"
                  isDisabled={isReadOnly}
                  placeholder="Selecione o tipo"
                  selectedKeys={formData.tipo ? [formData.tipo] : []}
                  onSelectionChange={(keys) => {
                    const value = Array.from(keys)[0] as string;

                    setFormData({ ...formData, tipo: value });
                  }}
                >
                  {tipos.map((tipo) => (
                    <SelectItem key={tipo} textValue={tipo}>
                      {tipo}
                    </SelectItem>
                  ))}
                </Select>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <label
                    className="text-sm font-medium text-slate-600 dark:text-slate-400 flex items-center gap-2"
                    htmlFor="modal-status-operacional"
                  >
                    <ListChecks className="text-blue-500" size={16} />
                    Status operacional
                  </label>
                  <Select
                    id="modal-status-operacional"
                    isDisabled={isReadOnly}
                    placeholder="Selecione"
                    selectedKeys={
                      formData.statusOperacional ? [formData.statusOperacional] : []
                    }
                    onSelectionChange={(keys) => {
                      const value = Array.from(keys)[0] as string;

                      setFormData({ ...formData, statusOperacional: value });
                    }}
                  >
                    <SelectItem key="NOVO" textValue="Novo">
                      Novo
                    </SelectItem>
                    <SelectItem key="EM_TRIAGEM" textValue="Em triagem">
                      Em triagem
                    </SelectItem>
                    <SelectItem key="EM_EXECUCAO" textValue="Em execução">
                      Em execução
                    </SelectItem>
                    <SelectItem key="RESOLVIDO" textValue="Resolvido">
                      Resolvido
                    </SelectItem>
                    <SelectItem key="BLOQUEADO" textValue="Bloqueado">
                      Bloqueado
                    </SelectItem>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label
                    className="text-sm font-medium text-slate-600 dark:text-slate-400 flex items-center gap-2"
                    htmlFor="modal-prioridade"
                  >
                    <AlertTriangle className="text-orange-500" size={16} />
                    Prioridade
                  </label>
                  <Select
                    id="modal-prioridade"
                    isDisabled={isReadOnly}
                    placeholder="Selecione"
                    selectedKeys={formData.prioridade ? [formData.prioridade] : []}
                    onSelectionChange={(keys) => {
                      const value = Array.from(keys)[0] as string;

                      setFormData({ ...formData, prioridade: value });
                    }}
                  >
                    <SelectItem key="BAIXA" textValue="Baixa">
                      Baixa
                    </SelectItem>
                    <SelectItem key="MEDIA" textValue="Média">
                      Média
                    </SelectItem>
                    <SelectItem key="ALTA" textValue="Alta">
                      Alta
                    </SelectItem>
                    <SelectItem key="CRITICA" textValue="Crítica">
                      Crítica
                    </SelectItem>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label
                    className="text-sm font-medium text-slate-600 dark:text-slate-400 flex items-center gap-2"
                    htmlFor="modal-responsavel"
                  >
                    <UserCheck className="text-emerald-500" size={16} />
                    Responsável
                  </label>
                  <SearchableSelect
                    id="modal-responsavel"
                    emptyContent="Nenhum responsável encontrado"
                    items={responsavelModalOptions}
                    isDisabled={isReadOnly}
                    placeholder="Defina responsável"
                    selectedKey={
                      selectedResponsavelKeys[0] ?? UNASSIGNED_RESPONSAVEL_KEY
                    }
                    onSelectionChange={(selectedKey) => {
                      setFormData({
                        ...formData,
                        responsavelId:
                          selectedKey === UNASSIGNED_RESPONSAVEL_KEY
                            ? ""
                            : (selectedKey ?? ""),
                      });
                    }}
                  />
                </div>
              </div>

              {(formData.statusOperacional === "RESOLVIDO" ||
                (isReadOnly && Boolean(andamento?.observacaoResolucao))) && (
                <div className="space-y-2">
                  <label
                    className="text-sm font-medium text-slate-600 dark:text-slate-400 flex items-center gap-2"
                    htmlFor="modal-observacao-resolucao"
                  >
                    <CheckCircle2 className="text-emerald-500" size={16} />
                    Observação da resolução
                  </label>
                  <Textarea
                    classNames={{
                      input: "text-slate-700 dark:text-slate-300",
                      inputWrapper:
                        "bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600",
                    }}
                    description={
                      isReadOnly
                        ? undefined
                        : "Opcional: registre o resultado prático da resolução."
                    }
                    id="modal-observacao-resolucao"
                    isReadOnly={isReadOnly}
                    minRows={3}
                    placeholder="Ex: Audiência realizada com resultado favorável ao cliente."
                    value={formData.observacaoResolucao}
                    onValueChange={(value) =>
                      setFormData({ ...formData, observacaoResolucao: value })
                    }
                  />
                </div>
              )}

              <div className="space-y-2">
                <label
                  className="text-sm font-medium text-slate-600 dark:text-slate-400 flex items-center gap-2"
                  htmlFor="modal-data-movimentacao"
                >
                  <Calendar className="text-blue-500" size={16} />
                  Data da Movimentação
                </label>
                <DateInput
                  className="w-full"
                  id="modal-data-movimentacao"
                  isReadOnly={isReadOnly}
                  dateValue={formData.dataMovimentacao}
                  onDateChange={(date) => {
                    if (date) {
                      setFormData({ ...formData, dataMovimentacao: date });
                    }
                  }}
                />
              </div>

              <div className="space-y-2">
                <label
                  className="text-sm font-medium text-slate-600 dark:text-slate-400 flex items-center gap-2"
                  htmlFor="modal-sla"
                >
                  <Timer className="text-red-500" size={16} />
                  SLA interno
                </label>
                <DateInput
                  className="w-full"
                  description="Use para controlar prazo operacional da equipe."
                  id="modal-sla"
                  isReadOnly={isReadOnly}
                  dateValue={formData.slaEm}
                  onDateChange={(date) => {
                    setFormData({ ...formData, slaEm: date });
                  }}
                />
              </div>

              <div className="space-y-2">
                <label
                  className="text-sm font-medium text-slate-600 dark:text-slate-400 flex items-center gap-2"
                  htmlFor="modal-prazo"
                >
                  <Clock className="text-amber-500" size={16} />
                  Prazo (opcional)
                </label>
                <DateInput
                  className="w-full"
                  description="Se houver prazo relacionado a este andamento"
                  id="modal-prazo"
                  isReadOnly={isReadOnly}
                  dateValue={formData.prazo}
                  onDateChange={(date) => {
                    setFormData({ ...formData, prazo: date });
                  }}
                />
              </div>

              {!isReadOnly && formData.prazo && mode === "create" && (
                <label
                  className="flex items-center gap-2 cursor-pointer"
                  htmlFor="gera-prazo"
                >
                  <input
                    checked={formData.geraPrazo}
                    className="w-4 h-4"
                    id="gera-prazo"
                    type="checkbox"
                    onChange={(e) =>
                      setFormData({ ...formData, geraPrazo: e.target.checked })
                    }
                  />
                  <span className="text-sm">
                    Gerar prazo automático no sistema
                  </span>
                </label>
              )}

              {/* Seção de Notificações */}
              {!isReadOnly && (
                <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
                      <Bell
                        className="text-blue-600 dark:text-blue-400"
                        size={20}
                      />
                    </div>
                    <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300">
                      Notificações
                    </h3>
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4 space-y-3">
                    <label
                      className="flex items-center gap-3 cursor-pointer p-2 rounded-lg hover:bg-white dark:hover:bg-slate-700 transition-colors"
                      htmlFor="notificar-cliente"
                    >
                      <input
                        checked={formData.notificarCliente}
                        className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                        id="notificar-cliente"
                        type="checkbox"
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            notificarCliente: e.target.checked,
                          })
                        }
                      />
                      <MessageSquare
                        className="text-slate-600 dark:text-slate-400"
                        size={18}
                      />
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Notificar cliente sobre este andamento
                      </span>
                    </label>

                    {formData.notificarCliente && (
                      <div className="ml-6 space-y-3 border-l-2 border-blue-200 dark:border-blue-700 pl-4">
                        <label
                          className="flex items-center gap-3 cursor-pointer p-2 rounded-lg hover:bg-white dark:hover:bg-slate-700 transition-colors"
                          htmlFor="notificar-email"
                        >
                          <input
                            checked={formData.notificarEmail}
                            className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                            id="notificar-email"
                            type="checkbox"
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                notificarEmail: e.target.checked,
                              })
                            }
                          />
                          <Mail
                            className="text-blue-600 dark:text-blue-400"
                            size={18}
                          />
                          <span className="text-sm text-slate-700 dark:text-slate-300">
                            Enviar notificação por email
                          </span>
                        </label>

                        <label
                          className="flex items-center gap-3 cursor-pointer p-2 rounded-lg hover:bg-white dark:hover:bg-slate-700 transition-colors"
                          htmlFor="notificar-whatsapp"
                        >
                          <input
                            checked={formData.notificarWhatsapp}
                            className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 rounded focus:ring-green-500 dark:focus:ring-green-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                            id="notificar-whatsapp"
                            type="checkbox"
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                notificarWhatsapp: e.target.checked,
                              })
                            }
                          />
                          <Smartphone
                            className="text-green-600 dark:text-green-400"
                            size={18}
                          />
                          <span className="text-sm text-slate-700 dark:text-slate-300">
                            Enviar notificação por WhatsApp
                          </span>
                        </label>

                        <div className="mt-4 space-y-2">
                          <label
                            className="text-sm font-medium text-slate-600 dark:text-slate-400 flex items-center gap-2"
                            htmlFor="modal-mensagem-personalizada"
                          >
                            <MessageSquare
                              className="text-purple-500"
                              size={16}
                            />
                            Mensagem personalizada (opcional)
                          </label>
                          <Textarea
                            classNames={{
                              input: "text-slate-700 dark:text-slate-300",
                              inputWrapper:
                                "bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600",
                            }}
                            id="modal-mensagem-personalizada"
                            isReadOnly={isReadOnly}
                            minRows={2}
                            placeholder="Deixe em branco para usar mensagem padrão..."
                            value={formData.mensagemPersonalizada}
                            onValueChange={(value) =>
                              setFormData({
                                ...formData,
                                mensagemPersonalizada: value,
                              })
                            }
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {mode === "view" && andamento && (
                <>
                  {andamento.documentos.length > 0 && (
                    <div>
                      <p className="text-sm font-semibold mb-2">
                        Documentos Anexados:
                      </p>
                      <div className="space-y-1">
                        {andamento.documentos.map((doc) => (
                          <a
                            key={doc.id}
                            className="flex items-center gap-2 text-sm text-primary hover:underline"
                            href={doc.url}
                            rel="noopener noreferrer"
                            target="_blank"
                          >
                            <Paperclip size={14} />
                            {doc.nome}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {andamento.prazosRelacionados.length > 0 && (
                    <div>
                      <p className="text-sm font-semibold mb-2">
                        Prazos Relacionados:
                      </p>
                      <div className="space-y-2">
                        {andamento.prazosRelacionados.map((prazo) => (
                          <div
                            key={prazo.id}
                            className="p-2 bg-gray-100 dark:bg-gray-800 rounded"
                          >
                            <p className="text-sm font-medium">
                              {prazo.titulo}
                            </p>
                            <p className="text-xs text-gray-600 dark:text-gray-400">
                              Vencimento:{" "}
                              {new Date(
                                prazo.dataVencimento,
                              ).toLocaleDateString("pt-BR")}
                            </p>
                            <Chip
                              color={
                                prazo.status === "ABERTO"
                                  ? "warning"
                                  : "success"
                              }
                              size="sm"
                            >
                              {prazo.status}
                            </Chip>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={onClose}>
              {isReadOnly ? "Fechar" : "Cancelar"}
            </Button>
            {!isReadOnly && (
              <Button color="primary" isLoading={saving} onPress={handleSubmit}>
                {mode === "create" ? "Criar" : "Salvar"}
              </Button>
            )}
          </ModalFooter>
        </ModalContent>
      </motion.div>
    </Modal>
  );
}
