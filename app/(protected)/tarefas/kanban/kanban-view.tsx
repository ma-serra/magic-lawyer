"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Button } from "@heroui/button";
import { Input, Textarea } from "@heroui/input";

import {
  Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, useDisclosure, } from "@heroui/modal";
import { Skeleton, Select, SelectItem } from "@heroui/react";
import {
  Plus,
  List,
  Kanban,
  Clock3,
  AlertTriangle,
  CheckCircle2,
  Filter,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { parseAbsoluteToLocal } from "@internationalized/date";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from "@dnd-kit/core";

import { KanbanColumn } from "./components/kanban-column";
import { TarefaCard } from "./components/tarefa-card";
import { TarefaDetailModal } from "./components/tarefa-detail-modal";

import { criarBoardPadrao } from "@/app/actions/boards";
import {
  moverTarefa,
  createTarefa,
  updateTarefa,
  reordenarTarefas,
} from "@/app/actions/tarefas";
import { listCategoriasTarefa } from "@/app/actions/categorias-tarefa";
import { getAllProcessos } from "@/app/actions/processos";
import { searchClientes } from "@/app/actions/clientes";
import { PeopleMetricCard, PeoplePageHeader } from "@/components/people-ui";
import { useKanban } from "@/app/hooks/use-kanban";
import { DateInput } from "@/components/ui/date-input";

const prioridadeConfig = {
  BAIXA: { label: "Baixa", color: "default" as const },
  MEDIA: { label: "Média", color: "primary" as const },
  ALTA: { label: "Alta", color: "warning" as const },
  CRITICA: { label: "Crítica", color: "danger" as const },
};

interface KanbanViewProps {
  embedded?: boolean;
  selectedBoardId?: string;
  onSelectedBoardChange?: (boardId: string) => void;
}

export default function KanbanView({
  embedded = false,
  selectedBoardId: selectedBoardIdProp,
  onSelectedBoardChange,
}: KanbanViewProps) {
  const [boardSelecionadoIdInterno, setBoardSelecionadoIdInterno] =
    useState<string>("");
  const boardSelecionadoId = selectedBoardIdProp ?? boardSelecionadoIdInterno;
  const [tarefaSelecionada, setTarefaSelecionada] = useState<any>(null);
  const [tarefaEditando, setTarefaEditando] = useState<any>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [criandoBoard, setCriandoBoard] = useState(false);
  const [autoSetupStatus, setAutoSetupStatus] = useState<
    "idle" | "running" | "success" | "error"
  >("idle");
  const [autoSetupError, setAutoSetupError] = useState<string | null>(null);
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

  const { isOpen, onOpen, onClose } = useDisclosure();
  const { boards, board, tarefas, isLoading, refreshAll } = useKanban(
    boardSelecionadoId,
  );

  const setBoardSelecionadoId = useCallback(
    (nextBoardId: string) => {
      if (onSelectedBoardChange) {
        onSelectedBoardChange(nextBoardId);

        return;
      }

      setBoardSelecionadoIdInterno(nextBoardId);
    },
    [onSelectedBoardChange],
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
  const { data: colunasData } = useSWR(
    formData.boardId ? ["columns-for-select", formData.boardId] : null,
    async () => {
      const { listColumns } = await import("@/app/actions/board-columns");

      return listColumns(formData.boardId);
    },
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
  const colunas = useMemo(
    () => (colunasData?.success ? colunasData.columns : []),
    [colunasData],
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

  // Garantir que selectedKeys sempre exista na coleção
  const processoKeySet = useMemo(
    () => new Set((processosDisponiveis || []).map((p: any) => p.id)),
    [processosDisponiveis],
  );
  const clienteKeySet = useMemo(
    () => new Set((clientes || []).map((c: any) => c.id)),
    [clientes],
  );
  const categoriaKeySet = useMemo(
    () => new Set((categorias || []).map((c: any) => c.id)),
    [categorias],
  );
  const boardKeySet = useMemo(
    () => new Set((boards || []).map((b: any) => b.id)),
    [boards],
  );
  const colunaKeySet = useMemo(
    () => new Set((colunas || []).map((c: any) => c.id)),
    [colunas],
  );

  const selectedProcessKeys = useMemo(
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
    [formData.clienteId, clienteKeySet],
  );
  const selectedCategoriaKeys = useMemo(
    () =>
      formData.categoriaId && categoriaKeySet.has(formData.categoriaId)
        ? [formData.categoriaId]
        : [],
    [formData.categoriaId, categoriaKeySet],
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

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px de movimento antes de iniciar drag
      },
    }),
  );
  const shouldDisableDnd =
    isOpen || !!tarefaSelecionada || !!tarefaEditando || salvando;

  // Selecionar primeiro board automaticamente
  useEffect(() => {
    if (boards && boards.length > 0 && !boardSelecionadoId) {
      setBoardSelecionadoId(boards[0].id);
    }
  }, [boards, boardSelecionadoId, setBoardSelecionadoId]);

  // Organizar tarefas por coluna
  const tarefasPorColuna = useMemo(() => {
    const map = new Map<string, any[]>();

    board?.colunas?.forEach((col: any) => {
      map.set(col.id, []);
    });

    tarefas?.forEach((tarefa: any) => {
      if (tarefa.columnId && map.has(tarefa.columnId)) {
        map.get(tarefa.columnId)!.push(tarefa);
      }
    });

    return map;
  }, [board, tarefas]);

  const handleDragStart = (event: DragStartEvent) => {
    if (shouldDisableDnd) {
      setActiveId(null);

      return;
    }

    setActiveId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    if (shouldDisableDnd) {
      setActiveId(null);

      return;
    }

    const { active, over } = event;

    setActiveId(null);

    if (!over) {
      return;
    }

    const draggedTaskId = String(active.id);
    const overId = String(over.id);

    const tarefaArrastada = (tarefas || []).find(
      (tarefa: any) => tarefa.id === draggedTaskId,
    );

    if (!tarefaArrastada?.columnId) {
      return;
    }

    const colunaEhDestinoDireto = board?.colunas?.some(
      (coluna: any) => coluna.id === overId,
    );
    const tarefaDestino = (tarefas || []).find(
      (tarefa: any) => tarefa.id === overId,
    );

    let columnIdDestino: string | null = null;
    let indiceDestino = 0;

    if (colunaEhDestinoDireto) {
      columnIdDestino = overId;
      indiceDestino = (tarefasPorColuna.get(columnIdDestino) || []).length;
    } else if (tarefaDestino?.columnId) {
      columnIdDestino = tarefaDestino.columnId;
      const tarefasDestino = tarefasPorColuna.get(columnIdDestino) || [];
      const indiceEncontrado = tarefasDestino.findIndex(
        (item: any) => item.id === tarefaDestino.id,
      );

      indiceDestino = indiceEncontrado >= 0 ? indiceEncontrado : tarefasDestino.length;
    }

    if (!columnIdDestino) {
      return;
    }

    const columnIdOrigem = tarefaArrastada.columnId;
    const tarefasOrigem = [...(tarefasPorColuna.get(columnIdOrigem) || [])];
    const indiceOrigem = tarefasOrigem.findIndex(
      (item: any) => item.id === draggedTaskId,
    );

    if (indiceOrigem < 0) {
      return;
    }

    const [movida] = tarefasOrigem.splice(indiceOrigem, 1);

    try {
      if (columnIdOrigem === columnIdDestino) {
        const indiceAjustado =
          indiceOrigem < indiceDestino ? indiceDestino - 1 : indiceDestino;
        const indiceFinal = Math.max(
          0,
          Math.min(indiceAjustado, tarefasOrigem.length),
        );

        tarefasOrigem.splice(indiceFinal, 0, movida);

        const reordenacao = await reordenarTarefas(
          columnIdOrigem,
          tarefasOrigem.map((item: any, ordem: number) => ({
            id: item.id,
            ordem,
          })),
        );

        if (!reordenacao.success) {
          toast.error(reordenacao.error || "Erro ao reordenar tarefa");

          return;
        }
      } else {
        const tarefasDestino = [...(tarefasPorColuna.get(columnIdDestino) || [])];
        const indiceFinal = Math.max(
          0,
          Math.min(indiceDestino, tarefasDestino.length),
        );

        tarefasDestino.splice(indiceFinal, 0, {
          ...movida,
          columnId: columnIdDestino,
        });

        const movimentacao = await moverTarefa(
          draggedTaskId,
          columnIdDestino,
          indiceFinal,
        );

        if (!movimentacao.success) {
          toast.error(movimentacao.error || "Erro ao mover tarefa");

          return;
        }

        const [reordOrigem, reordDestino] = await Promise.all([
          reordenarTarefas(
            columnIdOrigem,
            tarefasOrigem.map((item: any, ordem: number) => ({
              id: item.id,
              ordem,
            })),
          ),
          reordenarTarefas(
            columnIdDestino,
            tarefasDestino.map((item: any, ordem: number) => ({
              id: item.id,
              ordem,
            })),
          ),
        ]);

        if (!reordOrigem.success || !reordDestino.success) {
          toast.error(
            reordOrigem.error || reordDestino.error || "Erro ao reordenar tarefas",
          );

          return;
        }
      }

      await refreshAll();
      toast.success("Tarefa movida!");
    } catch (error) {
      toast.error("Erro ao mover tarefa");
    }
  };

  const tarefaAtiva = useMemo(() => {
    return tarefas?.find((t: any) => t.id === activeId);
  }, [activeId, tarefas]);

  const handleCriarBoardPadrao = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;

    if (silent) {
      setAutoSetupStatus("running");
      setAutoSetupError(null);
    }

    setCriandoBoard(true);
    const result = await criarBoardPadrao();

    if (result.success) {
      if (!silent) {
        toast.success("Board criado com sucesso!");
      }
      await refreshAll();
      if (result.board) {
        setBoardSelecionadoId(result.board.id);
      }
      if (silent) {
        setAutoSetupStatus("success");
      }
    } else if (result.error === "Já existem boards criados") {
      await refreshAll();
      if (silent) {
        setAutoSetupStatus("success");
      }
    } else {
      if (!silent) {
        toast.error(result.error || "Erro ao criar board");
      }
      setAutoSetupError(result.error || "Erro ao preparar quadro padrão.");
      setAutoSetupStatus("error");
    }
    setCriandoBoard(false);
  }, [refreshAll]);

  useEffect(() => {
    if (isLoading || criandoBoard) {
      return;
    }

    if (boards && boards.length === 0 && autoSetupStatus === "idle") {
      void handleCriarBoardPadrao({ silent: true });
    }
  }, [autoSetupStatus, boards, criandoBoard, handleCriarBoardPadrao, isLoading]);

  const handleOpenNova = useCallback(() => {
    setTarefaEditando(null);
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
        boardSelecionadoId || (boards && boards.length > 0 ? boards[0].id : ""),
      columnId: board?.colunas?.[0]?.id || "",
    });
    onOpen();
  }, [onOpen, boards, boardSelecionadoId, board]);

  const handleOpenNovaNaColuna = useCallback(
    (columnId: string) => {
      setTarefaEditando(null);
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
          boardSelecionadoId || (boards && boards.length > 0 ? boards[0].id : ""),
        columnId,
      });
      onOpen();
    },
    [onOpen, boards, boardSelecionadoId],
  );

  const handleOpenEditar = useCallback(
    (tarefa: any) => {
      setTarefaSelecionada(null);
      setTarefaEditando(tarefa);
      setFormData({
        titulo: tarefa.titulo || "",
        descricao: tarefa.descricao || "",
        prioridade: tarefa.prioridade || "MEDIA",
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
        boardId: tarefa.boardId || boardSelecionadoId || "",
        columnId: tarefa.columnId || "",
      });
      setTimeout(() => onOpen(), 0);
    },
    [boardSelecionadoId, onOpen],
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

      const result = tarefaEditando?.id
        ? await updateTarefa(tarefaEditando.id, payload)
        : await createTarefa(payload);

      if (result.success) {
        toast.success(
          tarefaEditando?.id
            ? "Tarefa atualizada com sucesso!"
            : "Tarefa criada com sucesso!",
        );
        refreshAll();
        setTarefaSelecionada(null);
        setTarefaEditando(null);
        onClose();
      } else {
        toast.error(result.error || "Erro ao salvar tarefa");
      }
    } catch (error) {
      toast.error("Erro ao salvar tarefa");
    } finally {
      setSalvando(false);
    }
  }, [formData, onClose, refreshAll, tarefaEditando]);

  if (!boards || (boards.length === 0 && !isLoading)) {
    if (
      criandoBoard ||
      autoSetupStatus === "idle" ||
      autoSetupStatus === "running"
    ) {
      return (
        <div className="space-y-6">
          <div className="flex h-80 flex-col items-center justify-center gap-3">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              Preparando o quadro de tarefas
            </h1>
            <p className="max-w-md text-center text-default-500">
              Estamos configurando seu Kanban automaticamente para você começar sem
              etapas manuais.
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <div className="flex h-80 flex-col items-center justify-center gap-4">
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            Não foi possível preparar seu Kanban
          </h1>
          <p className="max-w-md text-center text-default-500">
            {autoSetupError ||
              "Houve uma falha ao configurar o quadro inicial automaticamente."}
          </p>
          <Button
            color="primary"
            isLoading={criandoBoard}
            size="lg"
            startContent={<Plus size={20} />}
            onPress={() => {
              void handleCriarBoardPadrao();
            }}
          >
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {!embedded ? (
        <PeoplePageHeader
          tag="Operacional"
          title="Tarefas em Kanban"
          description={`Visualização por fluxo para a lista "${board?.nome || "Carregando..."}".`}
          actions={
            <>
              <Button
                as="a"
                color="secondary"
                href="/tarefas"
                size="sm"
                startContent={<List className="h-4 w-4" />}
                variant="flat"
              >
                Ver Lista
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <PeopleMetricCard
          helper="Itens no quadro ativo"
          icon={<Kanban className="h-4 w-4" />}
          label="Total no quadro"
          tone="primary"
          value={tarefas?.length || 0}
        />
        <PeopleMetricCard
          helper="Aguardando execução"
          icon={<Clock3 className="h-4 w-4" />}
          label="Pendentes"
          tone="warning"
          value={
            tarefas?.filter((tarefa: any) => tarefa.status === "PENDENTE")
              .length || 0
          }
        />
        <PeopleMetricCard
          helper="Com prazo já vencido"
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Atrasadas"
          tone="danger"
          value={
            tarefas?.filter(
              (tarefa: any) =>
                tarefa.status !== "CONCLUIDA" &&
                tarefa.status !== "CANCELADA" &&
                tarefa.dataLimite &&
                new Date(tarefa.dataLimite) < new Date(),
            ).length || 0
          }
        />
        <PeopleMetricCard
          helper="Encerradas com sucesso"
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="Concluídas"
          tone="success"
          value={
            tarefas?.filter((tarefa: any) => tarefa.status === "CONCLUIDA")
              .length || 0
          }
        />
      </div>

      {/* Seletor de Board */}
      {!embedded && boards && boards.length > 1 && (
        <Card className="border border-divider/70 bg-content1/75 shadow-sm backdrop-blur-md">
          <CardHeader className="border-b border-divider/70 px-4 py-4 sm:px-6">
            <div className="flex w-full items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
                <Filter className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-foreground sm:text-lg">
                  Contexto Kanban
                </h3>
                <p className="text-xs text-default-500 sm:text-sm">
                  Troque o quadro para visualizar outro fluxo de execução.
                </p>
              </div>
            </div>
          </CardHeader>
          <CardBody className="p-4 sm:p-6">
            <div className="flex items-center gap-2">
              <Kanban className="text-default-400" size={16} />
              <Select
                className="max-w-xs"
                label="Quadro"
                selectedKeys={
                  boardSelecionadoId && boardKeySet.has(boardSelecionadoId)
                    ? [boardSelecionadoId]
                    : []
                }
                size="sm"
                variant="bordered"
                onSelectionChange={(keys) => {
                  const value = Array.from(keys)[0];

                  if (typeof value === "string") {
                    setBoardSelecionadoId(value);
                  }
                }}
              >
                {boards.map((b: any) => (
                  <SelectItem key={b.id} textValue={b.nome}>
                    {b.favorito ? "⭐ " : ""}
                    {b.nome}
                  </SelectItem>
                ))}
              </Select>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Kanban Board */}
      {isLoading ? (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex-shrink-0 w-80">
              <Skeleton className="h-[600px] rounded-xl" />
            </div>
          ))}
        </div>
      ) : (
        <DndContext
          collisionDetection={closestCorners}
          sensors={sensors}
          onDragEnd={handleDragEnd}
          onDragStart={handleDragStart}
        >
          <div className="flex gap-4 overflow-x-auto pb-4 min-h-[600px]">
            {board?.colunas?.map((coluna: any) => {
              const tarefasDaColuna = tarefasPorColuna.get(coluna.id) || [];

              return (
                <KanbanColumn
                  key={coluna.id}
                  column={coluna}
                  onAddTask={handleOpenNovaNaColuna}
                  tarefas={tarefasDaColuna}
                  onTarefaClick={(tarefa) => setTarefaSelecionada(tarefa)}
                />
              );
            })}
          </div>

          <DragOverlay>
            {activeId && tarefaAtiva ? (
              <div className="rotate-3 scale-105 opacity-90">
                <TarefaCard isDragging tarefa={tarefaAtiva} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* Modal de Detalhes */}
      {tarefaSelecionada && (
        <TarefaDetailModal
          isOpen={!!tarefaSelecionada}
          onEdit={handleOpenEditar}
          tarefa={tarefaSelecionada}
          onClose={() => setTarefaSelecionada(null)}
        />
      )}

      {/* Modal Criar Tarefa */}
      <Modal
        isOpen={isOpen}
        isDismissable={false}
        scrollBehavior="inside"
        size="2xl"
        onClose={onClose}
      >
        <ModalContent>
          <ModalHeader>
            {tarefaEditando ? "Editar Tarefa" : "Nova Tarefa"}
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

                    setFormData({
                      ...formData,
                      prioridade: value as
                        | "BAIXA"
                        | "MEDIA"
                        | "ALTA"
                        | "CRITICA",
                    });
                  }}
                >
                  {Object.entries(prioridadeConfig).map(([key, config]) => (
                    <SelectItem key={key} textValue={config.label}>
                      {config.label}
                    </SelectItem>
                  ))}
                </Select>

                <Select
                  label="Categoria"
                  onMouseDownCapture={handleSelectMouseFallback}
                  placeholder="Selecione uma categoria"
                  selectedKeys={selectedCategoriaKeys}
                  onSelectionChange={(keys) => {
                    const value = Array.from(keys)[0];

                    setFormData({ ...formData, categoriaId: value as string });
                  }}
                >
                  {(categorias || []).map((cat: any) => (
                    <SelectItem key={cat.id} textValue={cat.nome}>
                      {cat.nome}
                    </SelectItem>
                  ))}
                </Select>
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

              <Select
                label="Cliente"
                onMouseDownCapture={handleSelectMouseFallback}
                placeholder="Vincular a um cliente (opcional)"
                selectedKeys={selectedClienteKeys}
                onSelectionChange={(keys) => {
                  const value = Array.from(keys)[0];
                  const nextClienteId =
                    typeof value === "string" ? value : "";
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
              >
                {(clientes || []).map((cli: any) => (
                  <SelectItem key={cli.id} textValue={cli.nome}>
                    {cli.nome}
                  </SelectItem>
                ))}
              </Select>

              <Select
                isDisabled={!formData.clienteId}
                label="Processo"
                onMouseDownCapture={handleSelectMouseFallback}
                placeholder={
                  formData.clienteId
                    ? "Vincular a um processo do cliente (opcional)"
                    : "Selecione primeiro o cliente"
                }
                selectedKeys={selectedProcessKeys}
                onSelectionChange={(keys) => {
                  const value = Array.from(keys)[0];
                  const processoIdSelecionado =
                    typeof value === "string" ? value : "";
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
              >
                {(processosDisponiveis || []).map((proc: any) => (
                  <SelectItem
                    key={proc.id}
                    textValue={`${proc.numero}${proc.titulo ? ` - ${proc.titulo}` : ""}`}
                  >
                    {proc.numero} - {proc.titulo || "Sem título"}
                  </SelectItem>
                ))}
              </Select>

              <div className="border-t pt-4 mt-4">
                <p className="text-sm font-semibold mb-3">📊 Quadro Kanban</p>
                <div className="grid grid-cols-2 gap-4">
                  <Select
                    label="Board"
                    onMouseDownCapture={handleSelectMouseFallback}
                    placeholder="Selecionar quadro"
                    selectedKeys={selectedBoardKeys}
                    onSelectionChange={(keys) => {
                      const value = Array.from(keys)[0];

                      if (typeof value !== "string") {
                        setFormData({
                          ...formData,
                          boardId: "",
                          columnId: "",
                        });

                        return;
                      }

                      setFormData({
                        ...formData,
                        boardId: value,
                        columnId: "",
                      });
                    }}
                  >
                    {(boards || []).length > 0
                      ? (boards || []).map((b: any) => (
                          <SelectItem key={b.id} textValue={b.nome}>
                            {b.nome}
                          </SelectItem>
                        ))
                      : null}
                  </Select>

                  <Select
                    isDisabled={!formData.boardId}
                    label="Coluna"
                    onMouseDownCapture={handleSelectMouseFallback}
                    placeholder="Selecionar coluna"
                    selectedKeys={selectedColunaKeys}
                    onSelectionChange={(keys) => {
                      const value = Array.from(keys)[0];

                      setFormData({
                        ...formData,
                        columnId: typeof value === "string" ? value : "",
                      });
                    }}
                  >
                    {(colunas || []).length > 0
                      ? (colunas || []).map((col: any) => (
                          <SelectItem key={col.id} textValue={col.nome}>
                            {col.nome}
                          </SelectItem>
                        ))
                      : null}
                  </Select>
                </div>
                <p className="text-xs text-default-400 mt-2">
                  💡 A tarefa será criada na coluna selecionada
                </p>
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={onClose}>
              Cancelar
            </Button>
            <Button color="primary" isLoading={salvando} onPress={handleSalvar}>
              {tarefaEditando ? "Salvar alterações" : "Criar Tarefa"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
