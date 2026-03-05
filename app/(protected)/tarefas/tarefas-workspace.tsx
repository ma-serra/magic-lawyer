"use client";

import { useCallback, useEffect, useMemo, useState, type Key } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { Button } from "@heroui/button";
import { Input, Textarea } from "@heroui/input";
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  useDisclosure,
} from "@heroui/modal";
import { Select, SelectItem, Tab, Tabs } from "@heroui/react";
import {
  Briefcase,
  History,
  KanbanSquare,
  ListTodo,
  PencilLine,
  Plus,
} from "lucide-react";
import dayjs from "dayjs";
import "dayjs/locale/pt-br";

import TarefasContent from "./tarefas-content";
import KanbanView from "./kanban/kanban-view";

import {
  createBoard,
  getBoardHistorico,
  listBoards,
  updateBoard,
} from "@/app/actions/boards";
import { PeoplePageHeader } from "@/components/people-ui";
import { toast } from "@/lib/toast";

type TarefasViewKey = "lista" | "kanban";

dayjs.locale("pt-br");

export default function TarefasWorkspace() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [novaListaNome, setNovaListaNome] = useState("");
  const [novaListaDescricao, setNovaListaDescricao] = useState("");
  const [criandoLista, setCriandoLista] = useState(false);
  const [editandoListaNome, setEditandoListaNome] = useState("");
  const [editandoListaDescricao, setEditandoListaDescricao] = useState("");
  const [salvandoEdicaoLista, setSalvandoEdicaoLista] = useState(false);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const {
    isOpen: isEditOpen,
    onOpen: onEditOpen,
    onClose: onEditClose,
  } = useDisclosure();

  const { data: boardsData, mutate: mutateBoards } = useSWR(
    "boards-workspace-selector",
    () => listBoards({ ativo: true }),
  );

  const boards = useMemo<any[]>(
    () =>
      boardsData?.success && Array.isArray(boardsData.boards)
        ? boardsData.boards
        : [],
    [boardsData],
  );
  const boardKeySet = useMemo(
    () => new Set(boards.map((board: any) => board.id)),
    [boards],
  );
  const boardFromQuery = searchParams.get("board");
  const selectedBoardId = useMemo(() => {
    if (boardFromQuery && boardKeySet.has(boardFromQuery)) {
      return boardFromQuery;
    }

    return boards[0]?.id || "";
  }, [boardFromQuery, boardKeySet, boards]);

  const selectedKey = useMemo<TarefasViewKey>(() => {
    const view = searchParams.get("view");
    return view === "kanban" ? "kanban" : "lista";
  }, [searchParams]);
  const selectedBoard = useMemo(
    () => boards.find((board: any) => board.id === selectedBoardId) || null,
    [boards, selectedBoardId],
  );
  const { data: historicoData, mutate: mutateHistorico } = useSWR(
    selectedBoardId ? ["board-historico", selectedBoardId] : null,
    () => getBoardHistorico(selectedBoardId, 6),
  );
  const historico = useMemo<any[]>(
    () =>
      historicoData?.success && Array.isArray(historicoData.historico)
        ? historicoData.historico
        : [],
    [historicoData],
  );

  const handleBoardChange = useCallback(
    (boardId: string) => {
      const params = new URLSearchParams(searchParams.toString());

      if (boardId) {
        params.set("board", boardId);
      } else {
        params.delete("board");
      }

      const query = params.toString();
      const target = query ? `${pathname}?${query}` : pathname || "/tarefas";

      router.replace(target, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    if (!boardFromQuery && boards.length > 0) {
      handleBoardChange(boards[0].id);
    }
  }, [boardFromQuery, boards, handleBoardChange]);

  const handleTabChange = (key: Key) => {
    const nextKey = key === "kanban" ? "kanban" : "lista";

    const params = new URLSearchParams(searchParams.toString());

    if (nextKey === "kanban") {
      params.set("view", "kanban");
    } else {
      params.delete("view");
    }

    const query = params.toString();
    const target = query ? `${pathname}?${query}` : pathname || "/tarefas";

    router.replace(target, { scroll: false });
  };

  const handleCriarLista = useCallback(async () => {
    const nome = novaListaNome.trim();

    if (!nome) {
      toast.error("Informe o nome da lista de trabalho.");

      return;
    }

    setCriandoLista(true);

    try {
      const result = await createBoard({
        nome,
        descricao: novaListaDescricao.trim() || null,
        tipo: "PROJETO",
        visibilidade: "EQUIPE",
        criarColunasDefault: true,
      });

      if (!result.success || !result.board?.id) {
        toast.error(result.error || "Não foi possível criar a lista.");

        return;
      }

      toast.success("Lista de trabalho criada com sucesso.");
      setNovaListaNome("");
      setNovaListaDescricao("");
      onClose();
      await mutateBoards();
      handleBoardChange(result.board.id);
    } catch (error) {
      toast.error("Erro ao criar lista de trabalho.");
    } finally {
      setCriandoLista(false);
    }
  }, [
    handleBoardChange,
    mutateBoards,
    novaListaDescricao,
    novaListaNome,
    onClose,
  ]);
  const handleOpenEditarLista = useCallback(() => {
    if (!selectedBoard) {
      toast.warning("Selecione uma lista para editar.");

      return;
    }

    setEditandoListaNome(selectedBoard.nome || "");
    setEditandoListaDescricao(selectedBoard.descricao || "");
    onEditOpen();
  }, [onEditOpen, selectedBoard]);

  const handleSalvarEdicaoLista = useCallback(async () => {
    const nome = editandoListaNome.trim();

    if (!selectedBoardId) {
      toast.error("Lista de trabalho não selecionada.");

      return;
    }

    if (!nome) {
      toast.error("Informe o nome da lista de trabalho.");

      return;
    }

    setSalvandoEdicaoLista(true);

    try {
      const result = await updateBoard(selectedBoardId, {
        nome,
        descricao: editandoListaDescricao.trim() || null,
      });

      if (!result.success) {
        toast.error(result.error || "Não foi possível atualizar a lista.");

        return;
      }

      toast.success("Lista de trabalho atualizada com sucesso.");
      onEditClose();
      await Promise.all([mutateBoards(), mutateHistorico()]);
    } catch (error) {
      toast.error("Erro ao atualizar lista de trabalho.");
    } finally {
      setSalvandoEdicaoLista(false);
    }
  }, [
    editandoListaDescricao,
    editandoListaNome,
    mutateBoards,
    mutateHistorico,
    onEditClose,
    selectedBoardId,
  ]);

  const getHistoricoLabel = useCallback((acao: string) => {
    switch (acao) {
      case "board.create":
        return "Lista criada";
      case "board.update":
        return "Lista atualizada";
      case "board.delete":
        return "Lista removida";
      case "board.duplicate":
        return "Lista duplicada";
      case "board.create_default":
        return "Lista padrão criada";
      default:
        return acao;
    }
  }, []);

  const getHistoricoAutor = useCallback((entry: any) => {
    const firstName = entry?.usuario?.firstName || "";
    const lastName = entry?.usuario?.lastName || "";
    const nome = `${firstName} ${lastName}`.trim();

    return nome || entry?.usuario?.email || "Sistema";
  }, []);

  return (
    <div className="space-y-6">
      <PeoplePageHeader
        tag="Operacional"
        title="Tarefas"
        description="Organize a operação do escritório por lista de trabalho e alterne entre visualização em Lista e Kanban no mesmo contexto."
        actions={
          <Button
            color="primary"
            size="sm"
            startContent={<Plus className="h-4 w-4" />}
            onPress={onOpen}
          >
            Nova Lista
          </Button>
        }
      />

      <div className="rounded-2xl border border-divider/70 bg-content1/75 p-4 shadow-sm backdrop-blur-md sm:p-5">
        <div className="mb-3 flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
            <Briefcase className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground sm:text-base">
              Lista de trabalho ativa
            </h2>
            <p className="text-xs text-default-500 sm:text-sm">
              Tudo exibido abaixo segue a lista selecionada.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Select
            className="w-full sm:max-w-xl"
            label="Contexto de trabalho"
            placeholder="Selecione uma lista"
            selectedKeys={
              selectedBoardId && boardKeySet.has(selectedBoardId)
                ? [selectedBoardId]
                : []
            }
            variant="bordered"
            onSelectionChange={(keys) => {
              const value = Array.from(keys)[0];

              if (typeof value === "string") {
                handleBoardChange(value);
              }
            }}
          >
            {boards.map((board: any) => (
              <SelectItem key={board.id} textValue={board.nome}>
                {board.nome}
              </SelectItem>
            ))}
          </Select>
          <Button
            isDisabled={!selectedBoardId}
            size="sm"
            startContent={<PencilLine className="h-4 w-4" />}
            variant="flat"
            onPress={handleOpenEditarLista}
          >
            Editar Lista
          </Button>
        </div>

        <div className="mt-4 rounded-xl border border-divider/60 bg-content2/35 p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-default-500">
            <History className="h-3.5 w-3.5" />
            Histórico da Lista
          </div>
          {historico.length === 0 ? (
            <p className="text-xs text-default-500">
              Sem alterações registradas para esta lista até o momento.
            </p>
          ) : (
            <div className="max-h-44 space-y-2 overflow-y-auto pr-1">
              {historico.map((entry: any) => (
                <div
                  key={entry.id}
                  className="rounded-lg border border-divider/60 bg-content1/55 px-3 py-2"
                >
                  <p className="text-xs font-medium text-foreground">
                    {getHistoricoLabel(entry.acao)}
                  </p>
                  <p className="text-[11px] text-default-500">
                    {getHistoricoAutor(entry)} ·{" "}
                    {dayjs(entry.createdAt).format("DD/MM/YYYY HH:mm")}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Tabs
        aria-label="Visualização de tarefas"
        color="primary"
        destroyInactiveTabPanel
        selectedKey={selectedKey}
        variant="underlined"
        onSelectionChange={handleTabChange}
      >
        <Tab
          key="lista"
          title={
            <div className="flex items-center gap-2">
              <ListTodo className="h-4 w-4" />
              <span>Lista</span>
            </div>
          }
        >
          <TarefasContent
            embedded
            selectedBoardId={selectedBoardId || undefined}
          />
        </Tab>
        <Tab
          key="kanban"
          title={
            <div className="flex items-center gap-2">
              <KanbanSquare className="h-4 w-4" />
              <span>Kanban</span>
            </div>
          }
        >
          <KanbanView
            embedded
            selectedBoardId={selectedBoardId || undefined}
            onSelectedBoardChange={handleBoardChange}
          />
        </Tab>
      </Tabs>

      <Modal
        isOpen={isOpen}
        scrollBehavior="inside"
        size="lg"
        onClose={onClose}
      >
        <ModalContent>
          <ModalHeader>Nova Lista de Trabalho</ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <Input
                isRequired
                label="Nome da lista"
                placeholder="Ex.: Estratégia Defesa Trabalhista"
                value={novaListaNome}
                onChange={(event) => setNovaListaNome(event.target.value)}
              />
              <Textarea
                label="Descrição"
                minRows={3}
                placeholder="Contexto da lista e objetivo operacional"
                value={novaListaDescricao}
                onChange={(event) => setNovaListaDescricao(event.target.value)}
              />
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={onClose}>
              Cancelar
            </Button>
            <Button
              color="primary"
              isLoading={criandoLista}
              onPress={handleCriarLista}
            >
              Criar Lista
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal
        isOpen={isEditOpen}
        scrollBehavior="inside"
        size="lg"
        onClose={onEditClose}
      >
        <ModalContent>
          <ModalHeader>Editar Lista de Trabalho</ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <Input
                isRequired
                label="Nome da lista"
                placeholder="Ex.: Estratégia Defesa Trabalhista"
                value={editandoListaNome}
                onChange={(event) => setEditandoListaNome(event.target.value)}
              />
              <Textarea
                label="Descrição"
                minRows={3}
                placeholder="Contexto da lista e objetivo operacional"
                value={editandoListaDescricao}
                onChange={(event) =>
                  setEditandoListaDescricao(event.target.value)
                }
              />
              <p className="text-xs text-default-500">
                Alterar nome/descrição não impacta tarefas, colunas ou vínculos já
                existentes. Todas as mudanças ficam registradas no histórico.
              </p>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={onEditClose}>
              Cancelar
            </Button>
            <Button
              color="primary"
              isLoading={salvandoEdicaoLista}
              onPress={handleSalvarEdicaoLista}
            >
              Salvar alterações
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
