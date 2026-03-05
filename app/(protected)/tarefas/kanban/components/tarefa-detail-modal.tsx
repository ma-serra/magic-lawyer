"use client";

import { useCallback, useState } from "react";
import useSWR from "swr";
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from "@heroui/modal";
import { Button } from "@heroui/button";
import { Chip } from "@heroui/chip";
import { Checkbox } from "@heroui/checkbox";
import { Input } from "@heroui/input";
import { Spinner } from "@heroui/spinner";
import { Tabs, Tab } from "@heroui/tabs";
import { Plus, Trash2 } from "lucide-react";
import dayjs from "dayjs";

import { getTarefa } from "@/app/actions/tarefas";
import {
  addChecklistItem,
  deleteChecklistItem,
  toggleChecklistItem,
} from "@/app/actions/tarefa-features";
import { toast } from "@/lib/toast";

interface TarefaDetailModalProps {
  tarefa: any;
  isOpen: boolean;
  onClose: () => void;
  onEdit?: (tarefa: any) => void;
}

const statusConfig = {
  PENDENTE: { label: "Pendente", color: "default" as const },
  EM_ANDAMENTO: { label: "Em Andamento", color: "primary" as const },
  CONCLUIDA: { label: "Concluída", color: "success" as const },
  CANCELADA: { label: "Cancelada", color: "danger" as const },
};

const prioridadeConfig = {
  BAIXA: { label: "Baixa", color: "default" as const },
  MEDIA: { label: "Média", color: "primary" as const },
  ALTA: { label: "Alta", color: "warning" as const },
  CRITICA: { label: "Crítica", color: "danger" as const },
};

function formatarNomeUsuario(usuario?: {
  firstName?: string | null;
  lastName?: string | null;
} | null) {
  if (!usuario) {
    return "Usuário não identificado";
  }

  const nome = `${usuario.firstName || ""} ${usuario.lastName || ""}`.trim();

  return nome || "Usuário não identificado";
}

export function TarefaDetailModal({
  tarefa,
  isOpen,
  onClose,
  onEdit,
}: TarefaDetailModalProps) {
  const { data, isLoading, mutate } = useSWR(
    isOpen && tarefa?.id ? ["tarefa-detail-modal", tarefa.id] : null,
    () => getTarefa(tarefa.id),
  );
  const [novoChecklistTitulo, setNovoChecklistTitulo] = useState("");
  const [salvandoChecklist, setSalvandoChecklist] = useState(false);
  const [itemChecklistEmMutacao, setItemChecklistEmMutacao] = useState<
    string | null
  >(null);

  const tarefaDetalhada = data?.success ? data.tarefa : tarefa;
  const checklistItems = tarefaDetalhada?.checklists || [];
  const anexosItems = tarefaDetalhada?.anexos || [];
  const comentariosItems = tarefaDetalhada?.comentarios || [];
  const atividadesItems = tarefaDetalhada?.atividades || [];
  const statusVisual =
    statusConfig[tarefaDetalhada?.status as keyof typeof statusConfig] ||
    statusConfig.PENDENTE;
  const prioridadeVisual =
    prioridadeConfig[tarefaDetalhada?.prioridade as keyof typeof prioridadeConfig] ||
    prioridadeConfig.MEDIA;
  const handleAddChecklist = useCallback(async () => {
    const titulo = novoChecklistTitulo.trim();

    if (!titulo || !tarefaDetalhada?.id) {
      return;
    }

    setSalvandoChecklist(true);

    try {
      const result = await addChecklistItem(tarefaDetalhada.id, titulo);

      if (!result.success) {
        toast.error(result.error || "Não foi possível adicionar o item.");

        return;
      }

      setNovoChecklistTitulo("");
      await mutate();
      toast.success("Item de checklist adicionado.");
    } catch (_error) {
      toast.error("Erro ao adicionar item de checklist.");
    } finally {
      setSalvandoChecklist(false);
    }
  }, [mutate, novoChecklistTitulo, tarefaDetalhada?.id]);

  const handleToggleChecklist = useCallback(
    async (itemId: string) => {
      setItemChecklistEmMutacao(itemId);

      try {
        const result = await toggleChecklistItem(itemId);

        if (!result.success) {
          toast.error(result.error || "Não foi possível atualizar o item.");

          return;
        }

        await mutate();
      } catch (_error) {
        toast.error("Erro ao atualizar item de checklist.");
      } finally {
        setItemChecklistEmMutacao(null);
      }
    },
    [mutate],
  );

  const handleDeleteChecklist = useCallback(
    async (itemId: string) => {
      setItemChecklistEmMutacao(itemId);

      try {
        const result = await deleteChecklistItem(itemId);

        if (!result.success) {
          toast.error(result.error || "Não foi possível remover o item.");

          return;
        }

        await mutate();
        toast.success("Item removido.");
      } catch (_error) {
        toast.error("Erro ao remover item do checklist.");
      } finally {
        setItemChecklistEmMutacao(null);
      }
    },
    [mutate],
  );

  const handleEditPress = useCallback(() => {
    if (!onEdit) {
      return;
    }

    onClose();
    setTimeout(() => {
      onEdit(tarefaDetalhada);
    }, 0);
  }, [onClose, onEdit, tarefaDetalhada]);

  return (
    <Modal isOpen={isOpen} scrollBehavior="inside" size="3xl" onClose={onClose}>
      <ModalContent>
        <ModalHeader>
          <div className="flex w-full items-start justify-between gap-4 pr-8">
            <div className="flex-1">
              <h2 className="text-xl font-bold">{tarefaDetalhada.titulo}</h2>
              {tarefaDetalhada.numeroSequencial ? (
                <p className="text-sm text-default-400">
                  #{tarefaDetalhada.numeroSequencial}
                </p>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Chip
                color={statusVisual.color}
              >
                {statusVisual.label}
              </Chip>
              <Chip color={prioridadeVisual.color}>{prioridadeVisual.label}</Chip>
            </div>
          </div>
        </ModalHeader>
        <ModalBody>
          {isLoading ? (
            <div className="flex min-h-[240px] items-center justify-center">
              <Spinner label="Carregando detalhes da tarefa..." size="lg" />
            </div>
          ) : (
            <Tabs aria-label="Detalhes da tarefa" variant="underlined">
              <Tab key="info" title="Informações">
                <div className="space-y-4 py-4">
                  {tarefaDetalhada.descricao ? (
                    <div>
                      <p className="mb-1 text-sm font-semibold">Descrição</p>
                      <p className="text-sm text-default-600">
                        {tarefaDetalhada.descricao}
                      </p>
                    </div>
                  ) : null}

                  {tarefaDetalhada.board || tarefaDetalhada.column ? (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      {tarefaDetalhada.board ? (
                        <div>
                          <p className="mb-1 text-sm font-semibold">Quadro</p>
                          <p className="text-sm text-default-600">
                            {tarefaDetalhada.board.nome}
                          </p>
                        </div>
                      ) : null}
                      {tarefaDetalhada.column ? (
                        <div>
                          <p className="mb-1 text-sm font-semibold">Coluna</p>
                          <p className="text-sm text-default-600">
                            {tarefaDetalhada.column.nome}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="mb-1 text-sm font-semibold">Responsável</p>
                      <p className="text-sm text-default-600">
                        {tarefaDetalhada.responsavel
                          ? formatarNomeUsuario(tarefaDetalhada.responsavel)
                          : "Não definido"}
                      </p>
                    </div>

                    <div>
                      <p className="mb-1 text-sm font-semibold">Data Limite</p>
                      <p className="text-sm text-default-600">
                        {tarefaDetalhada.dataLimite
                          ? dayjs(tarefaDetalhada.dataLimite).format(
                              "DD/MM/YYYY HH:mm",
                            )
                          : "Não definida"}
                      </p>
                    </div>

                    <div>
                      <p className="mb-1 text-sm font-semibold">Categoria</p>
                      {tarefaDetalhada.categoria ? (
                        <Chip
                          size="sm"
                          style={{
                            backgroundColor:
                              (tarefaDetalhada.categoria.corHex || "#3b82f6") +
                              "20",
                            color: tarefaDetalhada.categoria.corHex || "#3b82f6",
                          }}
                        >
                          {tarefaDetalhada.categoria.nome}
                        </Chip>
                      ) : (
                        <p className="text-sm text-default-600">Não definida</p>
                      )}
                    </div>

                    <div>
                      <p className="mb-1 text-sm font-semibold">
                        Tempo estimado
                      </p>
                      <p className="text-sm text-default-600">
                        {tarefaDetalhada.estimativaHoras
                          ? `${tarefaDetalhada.estimativaHoras}h`
                          : "Não informado"}
                        {tarefaDetalhada.horasGastas
                          ? ` / ${tarefaDetalhada.horasGastas}h gastos`
                          : ""}
                      </p>
                    </div>
                  </div>

                  {tarefaDetalhada.processo ? (
                    <div>
                      <p className="mb-1 text-sm font-semibold">Processo</p>
                      <p className="text-sm text-default-600">
                        {tarefaDetalhada.processo.numero} -{" "}
                        {tarefaDetalhada.processo.titulo || "Sem título"}
                      </p>
                    </div>
                  ) : null}

                  {tarefaDetalhada.cliente ? (
                    <div>
                      <p className="mb-1 text-sm font-semibold">Cliente</p>
                      <p className="text-sm text-default-600">
                        {tarefaDetalhada.cliente.nome}
                      </p>
                    </div>
                  ) : null}
                </div>
              </Tab>

              <Tab key="checklist" title={`Checklist (${checklistItems.length})`}>
                <div className="space-y-2 py-4">
                  <div className="flex flex-col gap-2 rounded-xl border border-divider/70 p-3 sm:flex-row">
                    <Input
                      className="flex-1"
                      placeholder="Adicionar item ao checklist"
                      value={novoChecklistTitulo}
                      onChange={(event) => setNovoChecklistTitulo(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void handleAddChecklist();
                        }
                      }}
                    />
                    <Button
                      color="primary"
                      isLoading={salvandoChecklist}
                      startContent={<Plus className="h-4 w-4" />}
                      onPress={() => void handleAddChecklist()}
                    >
                      Adicionar
                    </Button>
                  </div>
                  {checklistItems.length === 0 ? (
                    <p className="text-sm text-default-400">
                      Nenhum item de checklist cadastrado.
                    </p>
                  ) : (
                    checklistItems.map((item: any) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-divider/70 px-3 py-2"
                      >
                        <Checkbox
                          isSelected={item.concluida}
                          isDisabled={itemChecklistEmMutacao === item.id}
                          onValueChange={() => void handleToggleChecklist(item.id)}
                        >
                          <span
                            className={`text-sm ${item.concluida ? "line-through text-default-400" : "text-foreground"}`}
                          >
                            {item.titulo}
                          </span>
                        </Checkbox>
                        <div className="flex items-center gap-2">
                          <Chip
                            color={item.concluida ? "success" : "default"}
                            size="sm"
                            variant="flat"
                          >
                            {item.concluida ? "Concluído" : "Pendente"}
                          </Chip>
                          <Button
                            isIconOnly
                            color="danger"
                            isDisabled={itemChecklistEmMutacao === item.id}
                            size="sm"
                            variant="light"
                            onPress={() => void handleDeleteChecklist(item.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </Tab>

              <Tab key="anexos" title={`Anexos (${anexosItems.length})`}>
                <div className="space-y-2 py-4">
                  {anexosItems.length === 0 ? (
                    <p className="text-sm text-default-400">
                      Nenhum anexo cadastrado.
                    </p>
                  ) : (
                    anexosItems.map((anexo: any) => (
                      <div
                        key={anexo.id}
                        className="rounded-xl border border-divider/70 px-3 py-2"
                      >
                        <a
                          className="text-sm font-medium text-primary hover:underline"
                          href={anexo.url}
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          {anexo.nome}
                        </a>
                        <p className="text-xs text-default-500">
                          Enviado em{" "}
                          {dayjs(anexo.createdAt).format("DD/MM/YYYY HH:mm")}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </Tab>

              <Tab key="comentarios" title={`Comentários (${comentariosItems.length})`}>
                <div className="space-y-2 py-4">
                  {comentariosItems.length === 0 ? (
                    <p className="text-sm text-default-400">
                      Nenhum comentário cadastrado.
                    </p>
                  ) : (
                    comentariosItems.map((comentario: any) => (
                      <div
                        key={comentario.id}
                        className="rounded-xl border border-divider/70 px-3 py-2"
                      >
                        <p className="text-sm text-foreground">
                          {comentario.conteudo}
                        </p>
                        <p className="mt-1 text-xs text-default-500">
                          {formatarNomeUsuario(comentario.usuario)} ·{" "}
                          {dayjs(comentario.createdAt).format(
                            "DD/MM/YYYY HH:mm",
                          )}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </Tab>

              <Tab key="atividades" title="Atividades">
                <div className="space-y-2 py-4">
                  {atividadesItems.length === 0 ? (
                    <p className="text-sm text-default-400">
                      Nenhuma atividade registrada.
                    </p>
                  ) : (
                    atividadesItems.map((atividade: any) => (
                      <div
                        key={atividade.id}
                        className="rounded-xl border border-divider/70 px-3 py-2"
                      >
                        <p className="text-sm text-foreground">
                          {atividade.descricao}
                        </p>
                        <p className="mt-1 text-xs text-default-500">
                          {formatarNomeUsuario(atividade.usuario)} ·{" "}
                          {dayjs(atividade.createdAt).format(
                            "DD/MM/YYYY HH:mm",
                          )}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </Tab>
            </Tabs>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="light" onPress={onClose}>
            Fechar
          </Button>
          {onEdit ? (
            <Button color="primary" onPress={handleEditPress}>
              Editar
            </Button>
          ) : null}
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
