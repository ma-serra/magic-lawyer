"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Button } from "@heroui/button";
import { Input, Textarea } from "@heroui/input";
import { Chip } from "@heroui/chip";

import {
  Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, useDisclosure, } from "@heroui/modal";
import { Pagination, Skeleton, Select, SelectItem } from "@heroui/react";
import {
  Plus,
  CheckCircle2,
  Circle,
  Clock,
  XCircle,
  AlertCircle,
  Calendar,
  Target,
  TrendingUp,
  AlertTriangle,
  Kanban,
  Filter,
} from "lucide-react";
import { toast } from "@/lib/toast";
import dayjs from "dayjs";
import "dayjs/locale/pt-br";
import isSameOrBefore from "dayjs/plugin/isSameOrBefore";
import isSameOrAfter from "dayjs/plugin/isSameOrAfter";
import { parseAbsoluteToLocal } from "@internationalized/date";

import {
  listTarefas,
  createTarefa,
  updateTarefa,
  deleteTarefa,
  marcarTarefaConcluida,
  getDashboardTarefas,
} from "@/app/actions/tarefas";
import { listCategoriasTarefa } from "@/app/actions/categorias-tarefa";
import { getAllProcessos } from "@/app/actions/processos";
import { searchClientes } from "@/app/actions/clientes";
import { PeopleMetricCard, PeoplePageHeader } from "@/components/people-ui";
import { DateInput } from "@/components/ui/date-input";
import { TarefaDetailModal } from "@/app/(protected)/tarefas/kanban/components/tarefa-detail-modal";
import { SearchableSelect } from "@/components/searchable-select";

// Configurar dayjs
dayjs.extend(isSameOrBefore);
dayjs.extend(isSameOrAfter);
dayjs.locale("pt-br");

interface TarefaDto {
  id: string;
  titulo: string;
  descricao: string | null;
  status: "PENDENTE" | "EM_ANDAMENTO" | "CONCLUIDA" | "CANCELADA";
  prioridade: "BAIXA" | "MEDIA" | "ALTA" | "CRITICA";
  dataLimite: string | null;
  lembreteEm: string | null;
  completedAt: string | null;
  boardId?: string | null;
  columnId?: string | null;
  categoria?: {
    id: string;
    nome: string;
    corHex: string | null;
  } | null;
  responsavel?: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    avatarUrl: string | null;
  } | null;
  processo?: {
    id: string;
    numero: string;
    titulo: string | null;
  } | null;
  cliente?: {
    id: string;
    nome: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

const statusConfig = {
  PENDENTE: {
    label: "Pendente",
    color: "default" as const,
    icon: Circle,
  },
  EM_ANDAMENTO: {
    label: "Em Andamento",
    color: "primary" as const,
    icon: Clock,
  },
  CONCLUIDA: {
    label: "Concluída",
    color: "success" as const,
    icon: CheckCircle2,
  },
  CANCELADA: {
    label: "Cancelada",
    color: "danger" as const,
    icon: XCircle,
  },
};

const prioridadeConfig = {
  BAIXA: {
    label: "Baixa",
    color: "default" as const,
  },
  MEDIA: {
    label: "Média",
    color: "primary" as const,
  },
  ALTA: {
    label: "Alta",
    color: "warning" as const,
  },
  CRITICA: {
    label: "Crítica",
    color: "danger" as const,
  },
};

interface TarefasContentProps {
  embedded?: boolean;
  selectedBoardId?: string;
}

export default function TarefasContent({
  embedded = false,
  selectedBoardId,
}: TarefasContentProps) {
  const [filtroStatus, setFiltroStatus] = useState<string>("");
  const [filtroPrioridade, setFiltroPrioridade] = useState<string>("");
  const [filtroMinhas, setFiltroMinhas] = useState(false);
  const [filtroAtrasadas, setFiltroAtrasadas] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(12);
  const [tarefaSelecionada, setTarefaSelecionada] = useState<TarefaDto | null>(
    null,
  );
  const [formData, setFormData] = useState({
    titulo: "",
    descricao: "",
    prioridade: "MEDIA" as "BAIXA" | "MEDIA" | "ALTA" | "CRITICA",
    dataLimite: null as any,
    lembreteEm: null as any,
    categoriaId: "",
    responsavelId: "",
    processoId: "",
    clienteId: "",
    boardId: "",
    columnId: "",
  });
  const [salvando, setSalvando] = useState(false);
  const [tarefaParaExcluir, setTarefaParaExcluir] = useState<TarefaDto | null>(
    null,
  );

  const { isOpen, onOpen, onClose } = useDisclosure();
  const {
    isOpen: isViewOpen,
    onOpen: onViewOpen,
    onClose: onViewClose,
  } = useDisclosure();
  const {
    isOpen: isDeleteOpen,
    onOpen: onDeleteOpen,
    onClose: onDeleteClose,
  } = useDisclosure();

  const filtrosParams = useMemo(() => {
    const params: any = {};

    if (filtroStatus) params.status = filtroStatus;
    if (filtroPrioridade) params.prioridade = filtroPrioridade;
    if (filtroMinhas) params.minhas = true;
    if (filtroAtrasadas) params.atrasadas = true;
    if (selectedBoardId) params.boardId = selectedBoardId;
    params.page = currentPage;
    params.perPage = rowsPerPage;

    return params;
  }, [
    filtroStatus,
    filtroPrioridade,
    filtroMinhas,
    filtroAtrasadas,
    selectedBoardId,
    currentPage,
    rowsPerPage,
  ]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filtroStatus, filtroPrioridade, filtroMinhas, filtroAtrasadas, selectedBoardId, rowsPerPage]);

  const {
    data: tarefasData,
    error: tarefasError,
    isLoading: tarefasLoading,
    mutate: mutateTarefas,
  } = useSWR(["tarefas", filtrosParams], () => listTarefas(filtrosParams));

  const { data: dashboardData, mutate: mutateDashboard } = useSWR(
    ["tarefas-dashboard", selectedBoardId || "all"],
    () => getDashboardTarefas({ boardId: selectedBoardId }),
  );

  const { data: categoriasData } = useSWR("categorias-tarefa-ativas", () =>
    listCategoriasTarefa({ ativo: true }),
  );

  const { data: processosData } = useSWR("processos-para-tarefa", () =>
    getAllProcessos(),
  );

  const { data: clientesData } = useSWR("clientes-para-tarefa", () =>
    searchClientes({}),
  );

  const { data: boardsData } = useSWR("boards-for-select", async () => {
    const { listBoards } = await import("@/app/actions/boards");

    return listBoards({ ativo: true });
  });

  const { data: colunasData } = useSWR(
    formData.boardId ? ["columns-for-select", formData.boardId] : null,
    async () => {
      const { listColumns } = await import("@/app/actions/board-columns");

      return listColumns(formData.boardId);
    },
  );

  const tarefas = useMemo<any[]>(
    () =>
      tarefasData?.success && Array.isArray(tarefasData.tarefas)
        ? tarefasData.tarefas
        : [],
    [tarefasData],
  );
  const pagination = useMemo(
    () => (tarefasData?.success ? tarefasData.pagination : null),
    [tarefasData],
  );

  const categorias = useMemo(
    () => (categoriasData?.success ? categoriasData.categorias : []),
    [categoriasData],
  );

  const processos = useMemo(
    () => (processosData?.success ? processosData.processos : []),
    [processosData],
  );

  const clientes = useMemo(
    () => (clientesData?.success ? clientesData.clientes : []),
    [clientesData],
  );

  const dashboard = useMemo(
    () => (dashboardData?.success ? dashboardData.dashboard : null),
    [dashboardData],
  );
  const totalTarefas = pagination?.total ?? tarefas.length;
  const totalPages = Math.max(1, pagination?.totalPages ?? 1);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const boards = useMemo<any[]>(
    () =>
      boardsData?.success && Array.isArray(boardsData.boards)
        ? boardsData.boards
        : [],
    [boardsData],
  );

  const colunas = useMemo(
    () => (colunasData?.success ? colunasData.columns : []),
    [colunasData],
  );
  const selectedBoardName = useMemo(
    () => boards.find((board: any) => board.id === selectedBoardId)?.nome || "",
    [boards, selectedBoardId],
  );

  const boardKeySet = useMemo(
    () => new Set((boards || []).map((board: any) => board.id)),
    [boards],
  );
  const processosDisponiveis = useMemo(() => {
    if (!formData.clienteId) {
      return processos || [];
    }

    return (processos || []).filter((processo: any) => {
      const processoClienteId = processo?.cliente?.id || processo?.clienteId;

      return processoClienteId === formData.clienteId;
    });
  }, [formData.clienteId, processos]);
  const categoriaKeySet = useMemo(
    () => new Set((categorias || []).map((categoria: any) => categoria.id)),
    [categorias],
  );
  const processoKeySet = useMemo(
    () =>
      new Set(
        (processosDisponiveis || []).map((processo: any) => processo.id),
      ),
    [processosDisponiveis],
  );
  const clienteKeySet = useMemo(
    () => new Set((clientes || []).map((cliente: any) => cliente.id)),
    [clientes],
  );
  const colunaKeySet = useMemo(
    () => new Set((colunas || []).map((coluna: any) => coluna.id)),
    [colunas],
  );
  const selectedCategoriaKeys = useMemo(
    () =>
      formData.categoriaId && categoriaKeySet.has(formData.categoriaId)
        ? [formData.categoriaId]
        : [],
    [categoriaKeySet, formData.categoriaId],
  );
  const selectedProcessoKeys = useMemo(
    () =>
      formData.processoId && processoKeySet.has(formData.processoId)
        ? [formData.processoId]
        : [],
    [formData.processoId, processoKeySet],
  );
  const selectedClienteKeys = useMemo(
    () =>
      formData.clienteId && clienteKeySet.has(formData.clienteId)
        ? [formData.clienteId]
        : [],
    [clienteKeySet, formData.clienteId],
  );
  const selectedBoardKeys = useMemo(
    () =>
      formData.boardId && boardKeySet.has(formData.boardId)
        ? [formData.boardId]
        : [],
    [formData.boardId, boardKeySet],
  );
  const selectedColunaKeys = useMemo(
    () =>
      formData.columnId && colunaKeySet.has(formData.columnId)
        ? [formData.columnId]
        : [],
    [formData.columnId, colunaKeySet],
  );
  const categoriaOptions = useMemo(
    () =>
      (categorias || []).map((categoria: any) => ({
        key: categoria.id,
        label: categoria.nome,
        textValue: categoria.nome,
      })),
    [categorias],
  );
  const clienteOptions = useMemo(
    () =>
      (clientes || []).map((cliente: any) => ({
        key: cliente.id,
        label: cliente.nome,
        textValue: [cliente.nome, cliente.email || "", cliente.documento || ""]
          .filter(Boolean)
          .join(" "),
      })),
    [clientes],
  );
  const processoOptions = useMemo(
    () =>
      (processosDisponiveis || []).map((processo: any) => ({
        key: processo.id,
        label: processo.numero,
        textValue: [processo.numero, processo.titulo || ""].filter(Boolean).join(" "),
        description: processo.titulo || "Sem título",
      })),
    [processosDisponiveis],
  );
  const boardOptions = useMemo(
    () =>
      (boards || []).map((board: any) => ({
        key: board.id,
        label: board.nome,
        textValue: board.nome,
      })),
    [boards],
  );
  const colunaOptions = useMemo(
    () =>
      (colunas || []).map((coluna: any) => ({
        key: coluna.id,
        label: coluna.nome,
        textValue: coluna.nome,
      })),
    [colunas],
  );

  useEffect(() => {
    if (!formData.processoId) {
      return;
    }

    if (!processoKeySet.has(formData.processoId)) {
      setFormData((prev) => ({
        ...prev,
        processoId: "",
      }));
    }
  }, [formData.processoId, processoKeySet]);

  const handleOpenNova = useCallback(() => {
    setTarefaSelecionada(null);
    setFormData({
      titulo: "",
      descricao: "",
      prioridade: "MEDIA",
      dataLimite: null,
      lembreteEm: null,
      categoriaId: "",
      responsavelId: "",
      processoId: "",
      clienteId: "",
      boardId:
        selectedBoardId || (boards && boards.length > 0 ? boards[0].id : ""),
      columnId: "",
    });
    onOpen();
  }, [onOpen, boards, selectedBoardId]);

  const handleOpenEditar = useCallback(
    (tarefa: TarefaDto) => {
      setTarefaSelecionada(tarefa);
      setFormData({
        titulo: tarefa.titulo,
        descricao: tarefa.descricao || "",
        prioridade: tarefa.prioridade,
        dataLimite: tarefa.dataLimite
          ? parseAbsoluteToLocal(new Date(tarefa.dataLimite).toISOString())
          : null,
        lembreteEm: tarefa.lembreteEm
          ? parseAbsoluteToLocal(new Date(tarefa.lembreteEm).toISOString())
          : null,
        categoriaId: tarefa.categoria?.id || "",
        responsavelId: tarefa.responsavel?.id || "",
        processoId: tarefa.processo?.id || "",
        clienteId: tarefa.cliente?.id || "",
        boardId: tarefa.boardId || "",
        columnId: tarefa.columnId || "",
      });
      onOpen();
    },
    [onOpen],
  );
  const handleSelectMouseFallback = useCallback((event: any) => {
    if (event.button !== 0) {
      return;
    }

    const target = event.target as HTMLElement;
    const trigger = target.closest("button[data-slot='trigger']") as
      | HTMLButtonElement
      | null;

    if (!trigger) {
      return;
    }

    requestAnimationFrame(() => {
      if (trigger.getAttribute("aria-expanded") === "true") {
        return;
      }

      trigger.focus();
      trigger.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
        }),
      );
    });
  }, []);

  const handleSalvar = useCallback(async () => {
    if (!formData.titulo.trim()) {
      toast.error("Título é obrigatório");

      return;
    }

    setSalvando(true);

    try {
      const payload = {
        titulo: formData.titulo,
        descricao: formData.descricao || null,
        prioridade: formData.prioridade,
        dataLimite: formData.dataLimite
          ? formData.dataLimite.toDate().toISOString()
          : null,
        lembreteEm: formData.lembreteEm
          ? formData.lembreteEm.toDate().toISOString()
          : null,
        categoriaId: formData.categoriaId || null,
        responsavelId: formData.responsavelId || null,
        processoId: formData.processoId || null,
        clienteId: formData.clienteId || null,
        boardId: formData.boardId || null,
        columnId: formData.columnId || null,
      };

      const result = tarefaSelecionada
        ? await updateTarefa(tarefaSelecionada.id, payload)
        : await createTarefa(payload);

      if (result.success) {
        toast.success(
          tarefaSelecionada
            ? "Tarefa atualizada com sucesso!"
            : "Tarefa criada com sucesso!",
        );
        mutateTarefas();
        mutateDashboard();
        onClose();
      } else {
        toast.error(result.error || "Erro ao salvar tarefa");
      }
    } catch (error) {
      toast.error("Erro ao salvar tarefa");
    } finally {
      setSalvando(false);
    }
  }, [formData, tarefaSelecionada, mutateTarefas, mutateDashboard, onClose]);

  const handleMarcarConcluida = useCallback(
    async (tarefa: TarefaDto) => {
      const result = await marcarTarefaConcluida(tarefa.id);

      if (result.success) {
        toast.success("Tarefa marcada como concluída!");
        mutateTarefas();
        mutateDashboard();
      } else {
        toast.error(result.error || "Erro ao marcar tarefa como concluída");
      }
    },
    [mutateTarefas, mutateDashboard],
  );

  const handleSolicitarExclusao = useCallback(
    (tarefa: TarefaDto) => {
      setTarefaParaExcluir(tarefa);
      onDeleteOpen();
    },
    [onDeleteOpen],
  );

  const handleConfirmarExclusao = useCallback(async () => {
    if (!tarefaParaExcluir?.id) {
      return;
    }

    const result = await deleteTarefa(tarefaParaExcluir.id);

    if (result.success) {
      toast.success("Tarefa excluída com sucesso!");
      mutateTarefas();
      mutateDashboard();
      onDeleteClose();
      onViewClose();
      setTarefaParaExcluir(null);
    } else {
      toast.error(result.error || "Erro ao excluir tarefa");
    }
  }, [
    mutateDashboard,
    mutateTarefas,
    onDeleteClose,
    onViewClose,
    tarefaParaExcluir,
  ]);

  const getDataLimiteInfo = useCallback((dataLimite: string | null) => {
    if (!dataLimite) return null;

    const data = dayjs(dataLimite);
    const hoje = dayjs().startOf("day");
    const amanha = hoje.add(1, "day");

    if (data.isBefore(hoje)) {
      return {
        text: "Atrasada",
        colorClass: "text-danger",
        icon: AlertCircle,
      };
    }

    if (data.isSame(hoje, "day")) {
      return {
        text: "Hoje",
        colorClass: "text-warning",
        icon: Calendar,
      };
    }

    if (data.isSame(amanha, "day")) {
      return {
        text: "Amanhã",
        colorClass: "text-primary",
        icon: Calendar,
      };
    }

    return {
      text: data.format("DD/MM/YYYY"),
      colorClass: "text-default-500",
      icon: Calendar,
    };
  }, []);

  if (tarefasError) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-danger">Erro ao carregar tarefas</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {!embedded ? (
        <PeoplePageHeader
          tag="Operacional"
          title="Tarefas em Lista"
          description={
            selectedBoardId && selectedBoardName
              ? `Gestão operacional da lista "${selectedBoardName}".`
              : "Gerencie prioridades, prazos e execução diária da equipe."
          }
          actions={
            <>
              <Button
                as="a"
                color="secondary"
                href="/tarefas?view=kanban"
                size="sm"
                startContent={<Kanban className="h-4 w-4" />}
                variant="flat"
              >
                Ver Kanban
              </Button>
              <Button
                color="primary"
                size="sm"
                startContent={<Plus className="h-4 w-4" />}
                onPress={handleOpenNova}
              >
                Nova Tarefa
              </Button>
            </>
          }
        />
      ) : (
        <div className="flex justify-end">
          <Button
            color="primary"
            size="sm"
            startContent={<Plus className="h-4 w-4" />}
            onPress={handleOpenNova}
          >
            Nova Tarefa
          </Button>
        </div>
      )}

      {/* Dashboard Cards */}
      {dashboard && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <PeopleMetricCard
            helper="Sob sua responsabilidade"
            icon={<Target className="h-4 w-4" />}
            label="Minhas tarefas"
            tone="primary"
            value={dashboard.minhasTarefas}
          />
          <PeopleMetricCard
            helper="Exigem ação imediata"
            icon={<AlertTriangle className="h-4 w-4" />}
            label="Atrasadas"
            tone="danger"
            value={dashboard.atrasadas}
          />
          <PeopleMetricCard
            helper="Entregas com vencimento hoje"
            icon={<Calendar className="h-4 w-4" />}
            label="Hoje"
            tone="warning"
            value={dashboard.hoje}
          />
          <PeopleMetricCard
            helper="Janela operacional da semana"
            icon={<TrendingUp className="h-4 w-4" />}
            label="Próximos 7 dias"
            tone="success"
            value={dashboard.proximosDias}
          />
        </div>
      )}

      {/* Filtros */}
      <Card className="border border-divider/70 bg-content1/75 shadow-sm backdrop-blur-md">
        <CardHeader className="border-b border-divider/70 px-4 py-4 sm:px-6">
          <div className="flex w-full items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
              <Filter className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground sm:text-lg">
                Filtros operacionais
              </h3>
              <p className="text-xs text-default-500 sm:text-sm">
                Refine tarefas por status, prioridade e responsabilidade.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardBody className="p-4 sm:p-6">
          <div className="flex flex-wrap gap-3 items-end">
            <Select
              className="w-full sm:max-w-[200px]"
              label="📊 Status"
              placeholder="Todos os status"
              selectedKeys={filtroStatus ? [filtroStatus] : []}
              size="sm"
              onSelectionChange={(keys) => {
                const value = Array.from(keys)[0];

                setFiltroStatus(typeof value === "string" ? value : "");
              }}
            >
              {Object.entries(statusConfig).map(([key, config]) => (
                <SelectItem key={key} textValue={config.label}>{config.label}</SelectItem>
              ))}
            </Select>

            <Select
              className="w-full sm:max-w-[200px]"
              label="🎯 Prioridade"
              placeholder="Todas prioridades"
              selectedKeys={filtroPrioridade ? [filtroPrioridade] : []}
              size="sm"
              onSelectionChange={(keys) => {
                const value = Array.from(keys)[0];

                setFiltroPrioridade(typeof value === "string" ? value : "");
              }}
            >
              {Object.entries(prioridadeConfig).map(([key, config]) => (
                <SelectItem key={key} textValue={config.label}>{config.label}</SelectItem>
              ))}
            </Select>

            <div className="flex gap-2">
              <Button
                color={filtroMinhas ? "primary" : "default"}
                startContent={<Target size={16} />}
                variant={filtroMinhas ? "solid" : "bordered"}
                onPress={() => setFiltroMinhas(!filtroMinhas)}
              >
                Minhas
              </Button>
              <Button
                color={filtroAtrasadas ? "danger" : "default"}
                startContent={<AlertTriangle size={16} />}
                variant={filtroAtrasadas ? "solid" : "bordered"}
                onPress={() => setFiltroAtrasadas(!filtroAtrasadas)}
              >
                Atrasadas
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Lista de Tarefas */}
      <div className="space-y-3">
        {tarefasLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}>
              <CardBody>
                <Skeleton className="h-20 w-full rounded-lg" />
              </CardBody>
            </Card>
          ))
        ) : !tarefas || tarefas.length === 0 ? (
          <Card>
            <CardBody className="text-center py-12">
              <p className="text-default-400">
                {selectedBoardId
                  ? "Nenhuma tarefa nesta lista de trabalho"
                  : "Nenhuma tarefa encontrada"}
              </p>
            </CardBody>
          </Card>
        ) : (
          tarefas.map((tarefa: any) => {
            const StatusIcon =
              statusConfig[tarefa.status as keyof typeof statusConfig].icon;
            const dataInfo = getDataLimiteInfo(tarefa.dataLimite);

            return (
              <Card
                key={tarefa.id}
                aria-label={`Ver detalhes da tarefa ${tarefa.titulo}`}
                className="hover:border-primary/50 transition-colors cursor-pointer"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setTarefaSelecionada(tarefa);
                    onViewOpen();
                  }
                }}
              >
                <CardBody
                  onClick={() => {
                    setTarefaSelecionada(tarefa);
                    onViewOpen();
                  }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1">
                      <button
                        className="mt-1 hover:scale-110 transition-transform"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (tarefa.status !== "CONCLUIDA") {
                            handleMarcarConcluida(tarefa);
                          }
                        }}
                      >
                        <StatusIcon
                          className={
                            tarefa.status === "CONCLUIDA"
                              ? "text-success"
                              : "text-default-400 hover:text-success"
                          }
                          size={20}
                        />
                      </button>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <h3 className="font-semibold">{tarefa.titulo}</h3>
                          <Chip
                            color={
                              prioridadeConfig[
                                tarefa.prioridade as keyof typeof prioridadeConfig
                              ].color
                            }
                            size="sm"
                            variant="flat"
                          >
                            {
                              prioridadeConfig[
                                tarefa.prioridade as keyof typeof prioridadeConfig
                              ].label
                            }
                          </Chip>
                          {tarefa.categoria && (
                            <Chip
                              size="sm"
                              style={{
                                backgroundColor: tarefa.categoria.corHex + "20",
                                color: tarefa.categoria.corHex || undefined,
                              }}
                            >
                              {tarefa.categoria.nome}
                            </Chip>
                          )}
                        </div>

                        {tarefa.descricao && (
                          <p className="text-sm text-default-500 line-clamp-2 mb-2">
                            {tarefa.descricao}
                          </p>
                        )}

                        <div className="flex items-center gap-4 text-xs text-default-400">
                          {dataInfo && (
                            <div className="flex items-center gap-1">
                              <dataInfo.icon size={14} />
                              <span className={dataInfo.colorClass}>
                                {dataInfo.text}
                              </span>
                            </div>
                          )}
                          {tarefa.responsavel && (
                            <span>
                              {tarefa.responsavel.firstName}{" "}
                              {tarefa.responsavel.lastName}
                            </span>
                          )}
                          {tarefa.processo && (
                            <span>Processo: {tarefa.processo.numero}</span>
                          )}
                          {tarefa.cliente && (
                            <span>Cliente: {tarefa.cliente.nome}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <Chip
                      color={
                        statusConfig[tarefa.status as keyof typeof statusConfig]
                          .color
                      }
                      size="sm"
                      variant="flat"
                    >
                      {
                        statusConfig[tarefa.status as keyof typeof statusConfig]
                          .label
                      }
                    </Chip>
                  </div>
                </CardBody>
              </Card>
            );
          })
        )}
      </div>

      {!tarefasLoading && totalTarefas > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-divider/70 bg-content1/75 px-4 py-3 shadow-sm">
          <p className="text-xs text-default-500 sm:text-sm">
            Total: <span className="font-semibold text-foreground">{totalTarefas}</span>{" "}
            tarefa(s)
          </p>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <Select
              aria-label="Quantidade por página"
              className="w-32"
              label="Por página"
              selectedKeys={[String(rowsPerPage)]}
              size="sm"
              onSelectionChange={(keys) => {
                const value = Array.from(keys)[0];

                if (typeof value === "string") {
                  setRowsPerPage(Number(value));
                }
              }}
            >
              {[8, 12, 20, 40].map((size) => (
                <SelectItem key={String(size)} textValue={`${size}`}>
                  {size}
                </SelectItem>
              ))}
            </Select>
            <Pagination
              isCompact
              showControls
              classNames={{
                item: "text-default-500",
              }}
              page={currentPage}
              total={totalPages}
              onChange={setCurrentPage}
            />
          </div>
        </div>
      ) : null}

      {/* Modal Criar/Editar */}
      <Modal
        isOpen={isOpen}
        isDismissable={false}
        scrollBehavior="inside"
        size="2xl"
        onClose={onClose}
      >
        <ModalContent>
          <div data-testid="tarefa-form-modal">
            <ModalHeader>
              {tarefaSelecionada ? "Editar Tarefa" : "Nova Tarefa"}
            </ModalHeader>
            <ModalBody>
              <div className="space-y-4">
              <Input
                isRequired
                label="Título"
                placeholder="Digite o título da tarefa"
                value={formData.titulo}
                onChange={(e) =>
                  setFormData({ ...formData, titulo: e.target.value })
                }
              />

              <Textarea
                label="Descrição"
                minRows={3}
                placeholder="Digite uma descrição (opcional)"
                value={formData.descricao}
                onChange={(e) =>
                  setFormData({ ...formData, descricao: e.target.value })
                }
              />

              <div className="grid grid-cols-2 gap-4">
                <Select
                  isRequired
                  label="Prioridade"
                  onMouseDownCapture={handleSelectMouseFallback}
                  selectedKeys={[formData.prioridade]}
                  onSelectionChange={(keys) => {
                    const value = Array.from(keys)[0];

                    if (typeof value !== "string") {
                      return;
                    }

                    setFormData({
                      ...formData,
                      prioridade: value as any,
                    });
                  }}
                >
                  {Object.entries(prioridadeConfig).map(([key, config]) => (
                    <SelectItem key={key} textValue={config.label}>{config.label}</SelectItem>
                  ))}
                </Select>

                <SearchableSelect
                  emptyContent="Nenhuma categoria encontrada"
                  items={categoriaOptions}
                  label="Categoria"
                  placeholder="Selecione uma categoria"
                  selectedKey={selectedCategoriaKeys[0] ?? null}
                  onSelectionChange={(value) => {
                    setFormData({
                      ...formData,
                      categoriaId: value || "",
                    });
                  }}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <DateInput
                  hideTimeZone
                  showMonthAndYearPickers
                  label="Data Limite"
                  dateValue={formData.dataLimite}
                  variant="bordered"
                  onDateChange={(value) =>
                    setFormData({ ...formData, dataLimite: value })
                  }
                />

                <DateInput
                  hideTimeZone
                  showMonthAndYearPickers
                  label="Lembrete"
                  dateValue={formData.lembreteEm}
                  variant="bordered"
                  onDateChange={(value) =>
                    setFormData({ ...formData, lembreteEm: value })
                  }
                />
              </div>

              <SearchableSelect
                emptyContent="Nenhum cliente encontrado"
                items={clienteOptions}
                label="Cliente"
                placeholder="Vincular a um cliente (opcional)"
                selectedKey={selectedClienteKeys[0] ?? null}
                onSelectionChange={(value) => {
                  const nextClienteId = value || "";
                  const processoPertenceAoClienteSelecionado =
                    !nextClienteId ||
                    !formData.processoId ||
                    (processos || []).some((processo: any) => {
                      const processoClienteId =
                        processo?.cliente?.id || processo?.clienteId;

                      return (
                        processo.id === formData.processoId &&
                        processoClienteId === nextClienteId
                      );
                    });

                  setFormData({
                    ...formData,
                    clienteId: nextClienteId,
                    processoId: processoPertenceAoClienteSelecionado
                      ? formData.processoId
                      : "",
                  });
                }}
              />

              <SearchableSelect
                emptyContent="Nenhum processo encontrado"
                items={processoOptions}
                isDisabled={!formData.clienteId}
                label="Processo"
                placeholder={
                  formData.clienteId
                    ? "Vincular a um processo do cliente (opcional)"
                    : "Selecione primeiro o cliente"
                }
                selectedKey={selectedProcessoKeys[0] ?? null}
                onSelectionChange={(value) => {
                  const processoIdSelecionado = value || "";
                  const processoSelecionado = (processosDisponiveis || []).find(
                    (processo: any) => processo.id === processoIdSelecionado,
                  );
                  const processoSelecionadoAny = processoSelecionado as any;

                  setFormData({
                    ...formData,
                    processoId: processoIdSelecionado,
                    clienteId:
                      formData.clienteId ||
                      processoSelecionadoAny?.cliente?.id ||
                      processoSelecionadoAny?.clienteId ||
                      "",
                  });
                }}
              />

              <div className="border-t pt-4 mt-4">
                <p className="text-sm font-semibold mb-3">
                  📊 Quadro Kanban (Opcional)
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <SearchableSelect
                    emptyContent="Nenhum quadro encontrado"
                    items={boardOptions}
                    label="Board"
                    placeholder="Selecionar quadro"
                    selectedKey={selectedBoardKeys[0] ?? null}
                    onSelectionChange={(value) => {
                      setFormData({
                        ...formData,
                        boardId: value || "",
                        columnId: "",
                      });
                    }}
                  />

                  <SearchableSelect
                    emptyContent="Nenhuma coluna encontrada"
                    items={colunaOptions}
                    isDisabled={!formData.boardId}
                    label="Coluna"
                    placeholder="Selecionar coluna"
                    selectedKey={selectedColunaKeys[0] ?? null}
                    onSelectionChange={(value) => {
                      setFormData({
                        ...formData,
                        columnId: value || "",
                      });
                    }}
                  />
                </div>
                <p className="text-xs text-default-400 mt-2">
                  💡 Tarefas com board/coluna aparecem automaticamente no Kanban
                  visual
                </p>
              </div>
              </div>
            </ModalBody>
            <ModalFooter>
              <Button variant="light" onPress={onClose}>
                Cancelar
              </Button>
              <Button color="primary" isLoading={salvando} onPress={handleSalvar}>
                {tarefaSelecionada ? "Atualizar" : "Criar"}
              </Button>
            </ModalFooter>
          </div>
        </ModalContent>
      </Modal>

      {tarefaSelecionada && (
        <TarefaDetailModal
          isOpen={isViewOpen}
          tarefa={tarefaSelecionada}
          onClose={() => {
            onViewClose();
            setTarefaSelecionada(null);
          }}
          onEdit={(tarefa) => handleOpenEditar(tarefa as TarefaDto)}
        />
      )}

      <Modal
        isOpen={isDeleteOpen}
        size="md"
        onClose={() => {
          setTarefaParaExcluir(null);
          onDeleteClose();
        }}
      >
        <ModalContent>
          <ModalHeader>Excluir tarefa</ModalHeader>
          <ModalBody>
            <p className="text-sm text-default-600">
              Tem certeza que deseja excluir a tarefa{" "}
              <span className="font-semibold text-foreground">
                {tarefaParaExcluir?.titulo || "selecionada"}
              </span>
              ? Esta ação remove a tarefa da operação ativa.
            </p>
          </ModalBody>
          <ModalFooter>
            <Button
              variant="light"
              onPress={() => {
                setTarefaParaExcluir(null);
                onDeleteClose();
              }}
            >
              Cancelar
            </Button>
            <Button color="danger" onPress={handleConfirmarExclusao}>
              Excluir tarefa
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
