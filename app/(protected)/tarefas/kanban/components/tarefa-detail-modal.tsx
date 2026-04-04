"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import NextLink from "next/link";
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
import {
  AlertCircle,
  Building2,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Copy,
  ExternalLink,
  FileText,
  FolderKanban,
  Gavel,
  MessageSquare,
  Plus,
  Trash2,
  UserRound,
} from "lucide-react";
import dayjs from "dayjs";

import { getTarefa } from "@/app/actions/tarefas";
import {
  addChecklistItem,
  deleteChecklistItem,
  toggleChecklistItem,
} from "@/app/actions/tarefa-features";
import { useJuizDetalhado } from "@/app/hooks/use-juizes";
import { DateUtils } from "@/app/lib/date-utils";
import { toast } from "@/lib/toast";

interface TarefaDetailModalProps {
  tarefa: any;
  isOpen: boolean;
  onClose: () => void;
  onEdit?: (tarefa: any) => void;
}

const statusConfig = {
  PENDENTE: { label: "Pendente", color: "default" as const },
  EM_ANDAMENTO: { label: "Em andamento", color: "primary" as const },
  CONCLUIDA: { label: "Concluída", color: "success" as const },
  CANCELADA: { label: "Cancelada", color: "danger" as const },
};

const prioridadeConfig = {
  BAIXA: { label: "Baixa", color: "default" as const },
  MEDIA: { label: "Média", color: "primary" as const },
  ALTA: { label: "Alta", color: "warning" as const },
  CRITICA: { label: "Crítica", color: "danger" as const },
};

function formatarNomeUsuario(
  usuario?: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
  } | null,
) {
  if (!usuario) return "Não definido";
  const nome = `${usuario.firstName || ""} ${usuario.lastName || ""}`.trim();
  return nome || usuario.email || "Não definido";
}

function extrairCamposPendentes(descricao?: string | null) {
  const match = descricao?.match(
    /Campos m[ií]nimos pendentes:\s*(.+?)(?:\.|$)/i,
  );
  return (
    match?.[1]
      ?.split(",")
      .map((campo) => campo.trim())
      .filter(Boolean) || []
  );
}

function getTipoAutoridadeLabel(tipoAutoridade?: string | null) {
  return tipoAutoridade === "PROMOTOR" ? "Promotor" : "Juiz";
}

function getLotacaoLabel(tipoAutoridade?: string | null) {
  return tipoAutoridade === "PROMOTOR" ? "Promotoria" : "Vara";
}

function getPrazoMeta(dataLimite?: string | Date | null) {
  if (!dataLimite)
    return { helper: "Sem data limite definida", label: "Não definida" };
  const limite = dayjs(dataLimite);
  const agora = dayjs();
  if (limite.isBefore(agora))
    return {
      helper: `Atrasada ${DateUtils.formatRelative(dataLimite)}`,
      label: DateUtils.formatDateTime(dataLimite),
    };
  return {
    helper: `Vence ${DateUtils.formatRelative(dataLimite)}`,
    label: DateUtils.formatDateTime(dataLimite),
  };
}

function buildCamposAutoridade(autoridade?: any | null) {
  if (!autoridade) return [];
  const lotacaoLabel = getLotacaoLabel(autoridade.tipoAutoridade);
  return [
    autoridade.tribunal?.nome
      ? {
          label: "Tribunal",
          value: autoridade.tribunal.sigla
            ? `${autoridade.tribunal.sigla} - ${autoridade.tribunal.nome}`
            : autoridade.tribunal.nome,
        }
      : null,
    autoridade.vara ? { label: lotacaoLabel, value: autoridade.vara } : null,
    autoridade.comarca ? { label: "Comarca", value: autoridade.comarca } : null,
    autoridade.cidade ? { label: "Cidade", value: autoridade.cidade } : null,
    autoridade.estado ? { label: "UF", value: autoridade.estado } : null,
  ].filter(Boolean) as Array<{ label: string; value: string }>;
}

function Surface(props: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  const { title, icon, children } = props;
  return (
    <section className="rounded-3xl border border-divider/70 bg-content1/75 p-5">
      <div className="flex items-center gap-2">
        <span className="text-default-500">{icon}</span>
        <p className="text-sm font-semibold text-foreground">{title}</p>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function EmptyTabState(props: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-divider/70 bg-content2/40 px-4 py-6 text-center">
      <p className="text-sm font-semibold text-foreground">{props.title}</p>
      <p className="mt-1 text-sm text-default-500">{props.description}</p>
    </div>
  );
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
  const autoridadeId = isOpen
    ? tarefaDetalhada?.juiz?.id || tarefaDetalhada?.juizId || null
    : null;
  const { juiz: autoridadeDetalhada, isLoading: isLoadingAutoridade } =
    useJuizDetalhado(autoridadeId);

  const checklistItems = tarefaDetalhada?.checklists || [];
  const anexosItems = tarefaDetalhada?.anexos || [];
  const comentariosItems = tarefaDetalhada?.comentarios || [];
  const atividadesItems = tarefaDetalhada?.atividades || [];
  const statusVisual =
    statusConfig[tarefaDetalhada?.status as keyof typeof statusConfig] ||
    statusConfig.PENDENTE;
  const prioridadeVisual =
    prioridadeConfig[
      tarefaDetalhada?.prioridade as keyof typeof prioridadeConfig
    ] || prioridadeConfig.MEDIA;
  const prazoMeta = getPrazoMeta(tarefaDetalhada?.dataLimite);
  const camposPendentesAutoridade = autoridadeDetalhada?.camposPendentes?.length
    ? autoridadeDetalhada.camposPendentes
    : extrairCamposPendentes(tarefaDetalhada?.descricao);
  const camposAutoridade = buildCamposAutoridade(autoridadeDetalhada);
  const isAuthorityPendingTask = Boolean(
    autoridadeId &&
      (camposPendentesAutoridade.length ||
        `${tarefaDetalhada?.titulo || ""} ${tarefaDetalhada?.descricao || ""}`
          .toLowerCase()
          .includes("autoridade")),
  );

  const summaryCards = useMemo(
    () => [
      {
        label: "Responsável",
        value: formatarNomeUsuario(tarefaDetalhada?.responsavel),
        helper: tarefaDetalhada?.criadoPor
          ? `Criada por ${formatarNomeUsuario(tarefaDetalhada.criadoPor)}`
          : "Sem criador informado",
        icon: <UserRound className="h-4 w-4" />,
      },
      {
        label: "Data limite",
        value: prazoMeta.label,
        helper: prazoMeta.helper,
        icon: <CalendarClock className="h-4 w-4" />,
      },
      {
        label: "Categoria",
        value: tarefaDetalhada?.categoria
          ? tarefaDetalhada.categoria.nome
          : "Não definida",
        helper: tarefaDetalhada?.categoria
          ? "Classificação ativa"
          : "Sem categoria",
        icon: <Building2 className="h-4 w-4" />,
      },
      {
        label: "Tempo estimado",
        value: tarefaDetalhada?.estimativaHoras
          ? `${tarefaDetalhada.estimativaHoras}h`
          : "Não informado",
        helper: tarefaDetalhada?.horasGastas
          ? `${tarefaDetalhada.horasGastas}h lançadas`
          : "Sem horas lançadas",
        icon: <CalendarClock className="h-4 w-4" />,
      },
    ],
    [prazoMeta.helper, prazoMeta.label, tarefaDetalhada],
  );

  const handleAddChecklist = useCallback(async () => {
    const titulo = novoChecklistTitulo.trim();
    if (!titulo || !tarefaDetalhada?.id) return;
    setSalvandoChecklist(true);
    try {
      const result = await addChecklistItem(tarefaDetalhada.id, titulo);
      if (!result.success)
        return toast.error(
          result.error || "Não foi possível adicionar o item.",
        );
      setNovoChecklistTitulo("");
      await mutate();
      toast.success("Item de checklist adicionado.");
    } catch {
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
        if (!result.success)
          return toast.error(
            result.error || "Não foi possível atualizar o item.",
          );
        await mutate();
      } catch {
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
        if (!result.success)
          return toast.error(
            result.error || "Não foi possível remover o item.",
          );
        await mutate();
        toast.success("Item removido.");
      } catch {
        toast.error("Erro ao remover item do checklist.");
      } finally {
        setItemChecklistEmMutacao(null);
      }
    },
    [mutate],
  );

  const handleEditPress = useCallback(() => {
    if (!onEdit) return;
    onClose();
    setTimeout(() => onEdit(tarefaDetalhada), 0);
  }, [onClose, onEdit, tarefaDetalhada]);

  const handleCopyAuthoritySummary = useCallback(async () => {
    const nome =
      autoridadeDetalhada?.nome || tarefaDetalhada?.juiz?.nome || "Autoridade";
    const responsavel =
      autoridadeDetalhada?.responsavelPendencia?.nome ||
      formatarNomeUsuario(tarefaDetalhada?.responsavel);
    const resumo = [
      "Pendência de autoridade",
      `Autoridade: ${nome}`,
      `Responsável: ${responsavel}`,
      camposPendentesAutoridade.length
        ? `Falta preencher: ${camposPendentesAutoridade.join(", ")}`
        : "Falta revisar o cadastro vinculado",
    ].join("\n");
    try {
      await navigator.clipboard.writeText(resumo);
      toast.success("Resumo da pendência copiado.");
    } catch {
      toast.error("Não foi possível copiar o resumo.");
    }
  }, [
    autoridadeDetalhada?.nome,
    autoridadeDetalhada?.responsavelPendencia?.nome,
    camposPendentesAutoridade,
    tarefaDetalhada?.juiz?.nome,
    tarefaDetalhada?.responsavel,
  ]);

  return (
    <Modal isOpen={isOpen} scrollBehavior="inside" size="4xl" onClose={onClose}>
      <ModalContent>
        <ModalHeader className="pb-2">
          <div className="flex w-full flex-col gap-4 pr-8">
            <div className="flex flex-wrap items-center gap-2">
              <Chip color={statusVisual.color} size="sm" variant="flat">
                {statusVisual.label}
              </Chip>
              <Chip color={prioridadeVisual.color} size="sm" variant="flat">
                {prioridadeVisual.label}
              </Chip>
              {isAuthorityPendingTask ? (
                <Chip
                  color="warning"
                  size="sm"
                  startContent={<AlertCircle className="h-3 w-3" />}
                  variant="flat"
                >
                  Pendência de autoridade
                </Chip>
              ) : null}
            </div>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="text-xl font-bold text-foreground">
                  {tarefaDetalhada?.titulo || "Detalhes da tarefa"}
                </h2>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-default-500">
                  {tarefaDetalhada?.numeroSequencial ? (
                    <span>#{tarefaDetalhada.numeroSequencial}</span>
                  ) : null}
                  {tarefaDetalhada?.juiz?.nome ? (
                    <span>{tarefaDetalhada.juiz.nome}</span>
                  ) : null}
                  {tarefaDetalhada?.processo?.numero ? (
                    <span>{tarefaDetalhada.processo.numero}</span>
                  ) : null}
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {summaryCards.slice(0, 2).map((card) => (
                  <div
                    key={card.label}
                    className="rounded-2xl border border-divider/70 bg-content2/60 px-4 py-3"
                  >
                    <div className="mb-2 flex items-center gap-2 text-default-500">
                      <span>{card.icon}</span>
                      <span className="text-xs font-medium uppercase tracking-wide">
                        {card.label}
                      </span>
                    </div>
                    <div className="text-sm font-semibold text-foreground">
                      {card.value}
                    </div>
                    <p className="mt-1 text-xs text-default-500">
                      {card.helper}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </ModalHeader>
        <ModalBody className="pt-2">
          {isLoading ? (
            <div className="flex min-h-[240px] items-center justify-center">
              <Spinner label="Carregando detalhes da tarefa..." size="lg" />
            </div>
          ) : (
            <Tabs aria-label="Detalhes da tarefa" variant="underlined">
              <Tab key="info" title="Informações">
                <div className="space-y-4 py-4">
                  {isAuthorityPendingTask ? (
                    <Surface
                      icon={<Gavel className="h-4 w-4" />}
                      title="Pendência de autoridade"
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <p className="max-w-2xl text-sm text-default-600">
                          {autoridadeDetalhada?.nome ||
                            tarefaDetalhada?.juiz?.nome ||
                            "Esta autoridade"}{" "}
                          ainda está sem os dados mínimos para uso completo no
                          escritório. O modal agora mostra exatamente o que
                          falta.
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            as={NextLink}
                            color="warning"
                            href="/juizes"
                            startContent={<ExternalLink className="h-4 w-4" />}
                            variant="flat"
                            onPress={onClose}
                          >
                            Ir para Autoridades
                          </Button>
                          <Button
                            startContent={<Copy className="h-4 w-4" />}
                            variant="bordered"
                            onPress={() => void handleCopyAuthoritySummary()}
                          >
                            Copiar pendência
                          </Button>
                        </div>
                      </div>
                      <div className="mt-4 grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
                        <div className="rounded-2xl border border-warning/20 bg-warning/5 p-4">
                          <div className="flex items-center gap-2">
                            <ClipboardList className="h-4 w-4 text-warning-600" />
                            <p className="text-sm font-semibold text-foreground">
                              Campos pendentes
                            </p>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {camposPendentesAutoridade.length ? (
                              camposPendentesAutoridade.map((campo) => (
                                <Chip
                                  key={campo}
                                  color="warning"
                                  size="sm"
                                  variant="flat"
                                >
                                  {campo}
                                </Chip>
                              ))
                            ) : (
                              <Chip color="default" size="sm" variant="flat">
                                Revisar cadastro vinculado
                              </Chip>
                            )}
                          </div>
                          <p className="mt-4 text-sm text-default-600">
                            Próximo passo: abrir a autoridade, completar os
                            campos destacados e salvar.
                          </p>
                        </div>
                        <div className="rounded-2xl border border-divider/70 bg-content2/40 p-4">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-success-500" />
                            <p className="text-sm font-semibold text-foreground">
                              Dados já vinculados
                            </p>
                          </div>
                          {isLoadingAutoridade ? (
                            <div className="flex min-h-[88px] items-center justify-center">
                              <Spinner label="Lendo autoridade..." size="sm" />
                            </div>
                          ) : camposAutoridade.length ? (
                            <div className="mt-3 space-y-3">
                              {camposAutoridade.map((campo) => (
                                <div
                                  key={campo.label}
                                  className="rounded-2xl border border-divider/60 bg-content1/60 px-3 py-3"
                                >
                                  <p className="text-xs font-semibold uppercase tracking-wide text-default-500">
                                    {campo.label}
                                  </p>
                                  <p className="mt-1 text-sm font-medium text-foreground">
                                    {campo.value}
                                  </p>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="mt-3 text-sm text-default-500">
                              Ainda não há dados operacionais suficientes além
                              do nome da autoridade.
                            </p>
                          )}
                        </div>
                      </div>
                    </Surface>
                  ) : null}

                  {tarefaDetalhada?.descricao ? (
                    <Surface
                      icon={<FileText className="h-4 w-4" />}
                      title="Descrição"
                    >
                      <p className="whitespace-pre-wrap text-sm leading-6 text-default-600">
                        {tarefaDetalhada.descricao}
                      </p>
                    </Surface>
                  ) : null}

                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    {summaryCards.map((card) => (
                      <div
                        key={card.label}
                        className="rounded-2xl border border-divider/70 bg-content1/75 px-4 py-3"
                      >
                        <div className="mb-2 flex items-center gap-2 text-default-500">
                          <span>{card.icon}</span>
                          <span className="text-xs font-medium uppercase tracking-wide">
                            {card.label}
                          </span>
                        </div>
                        <div className="text-sm font-semibold text-foreground">
                          {card.value}
                        </div>
                        <p className="mt-1 text-xs text-default-500">
                          {card.helper}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="grid gap-3 lg:grid-cols-2">
                    <Surface
                      icon={<FolderKanban className="h-4 w-4" />}
                      title="Contexto interno"
                    >
                      <div className="grid gap-3 sm:grid-cols-2">
                        {[
                          {
                            label: "Quadro",
                            value:
                              tarefaDetalhada?.board?.nome || "Não definido",
                          },
                          {
                            label: "Coluna",
                            value:
                              tarefaDetalhada?.column?.nome || "Não definida",
                          },
                        ].map((item) => (
                          <div
                            key={item.label}
                            className="rounded-2xl border border-divider/60 bg-content2/50 px-3 py-3"
                          >
                            <p className="text-xs font-semibold uppercase tracking-wide text-default-500">
                              {item.label}
                            </p>
                            <p className="mt-1 text-sm font-medium text-foreground">
                              {item.value}
                            </p>
                          </div>
                        ))}
                      </div>
                    </Surface>
                    <Surface
                      icon={<Gavel className="h-4 w-4" />}
                      title="Contexto jurídico"
                    >
                      <div className="space-y-3">
                        <div className="rounded-2xl border border-divider/60 bg-content2/50 px-3 py-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-default-500">
                            Processo
                          </p>
                          <p className="mt-1 text-sm font-medium text-foreground">
                            {tarefaDetalhada?.processo
                              ? `${tarefaDetalhada.processo.numero} • ${tarefaDetalhada.processo.titulo || "Sem título"}`
                              : "Não vinculado"}
                          </p>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="rounded-2xl border border-divider/60 bg-content2/50 px-3 py-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-default-500">
                              Cliente
                            </p>
                            <p className="mt-1 text-sm font-medium text-foreground">
                              {tarefaDetalhada?.cliente?.nome ||
                                "Não vinculado"}
                            </p>
                          </div>
                          <div className="rounded-2xl border border-divider/60 bg-content2/50 px-3 py-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-default-500">
                              Autoridade
                            </p>
                            <p className="mt-1 text-sm font-medium text-foreground">
                              {tarefaDetalhada?.juiz?.nome ||
                                autoridadeDetalhada?.nome ||
                                "Não vinculada"}
                            </p>
                            {autoridadeId ? (
                              <p className="mt-1 text-xs text-default-500">
                                {getTipoAutoridadeLabel(
                                  autoridadeDetalhada?.tipoAutoridade ||
                                    tarefaDetalhada?.juiz?.tipoAutoridade,
                                )}
                                {typeof autoridadeDetalhada?._count
                                  ?.processos === "number"
                                  ? ` • ${autoridadeDetalhada._count.processos} processo(s) vinculados`
                                  : ""}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </Surface>
                  </div>
                </div>
              </Tab>
              <Tab
                key="checklist"
                title={`Checklist (${checklistItems.length})`}
              >
                <div className="space-y-3 py-4">
                  <div className="rounded-2xl border border-divider/70 bg-content1/75 p-3">
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input
                        className="flex-1"
                        placeholder="Adicionar item ao checklist"
                        value={novoChecklistTitulo}
                        onChange={(event) =>
                          setNovoChecklistTitulo(event.target.value)
                        }
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
                  </div>
                  {!checklistItems.length ? (
                    <EmptyTabState
                      description="Use o checklist para quebrar a execução em passos simples."
                      title="Nenhum item no checklist"
                    />
                  ) : (
                    checklistItems.map((item: any) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between gap-3 rounded-2xl border border-divider/70 bg-content1/75 px-3 py-3"
                      >
                        <Checkbox
                          isSelected={item.concluida}
                          isDisabled={itemChecklistEmMutacao === item.id}
                          onValueChange={() =>
                            void handleToggleChecklist(item.id)
                          }
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
                <div className="space-y-3 py-4">
                  {!anexosItems.length ? (
                    <EmptyTabState
                      description="Anexos úteis da tarefa aparecerão aqui."
                      title="Nenhum anexo cadastrado"
                    />
                  ) : (
                    anexosItems.map((anexo: any) => (
                      <div
                        key={anexo.id}
                        className="rounded-2xl border border-divider/70 bg-content1/75 px-4 py-3"
                      >
                        <a
                          className="text-sm font-medium text-primary hover:underline"
                          href={anexo.url}
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          {anexo.nome}
                        </a>
                        <p className="mt-1 text-xs text-default-500">
                          Enviado em{" "}
                          {dayjs(anexo.createdAt).format("DD/MM/YYYY HH:mm")}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </Tab>
              <Tab
                key="comentarios"
                title={`Comentários (${comentariosItems.length})`}
              >
                <div className="space-y-3 py-4">
                  {!comentariosItems.length ? (
                    <EmptyTabState
                      description="Comentários do time e observações desta tarefa aparecerão aqui."
                      title="Nenhum comentário cadastrado"
                    />
                  ) : (
                    comentariosItems.map((comentario: any) => (
                      <div
                        key={comentario.id}
                        className="rounded-2xl border border-divider/70 bg-content1/75 px-4 py-3"
                      >
                        <p className="text-sm text-foreground">
                          {comentario.conteudo}
                        </p>
                        <p className="mt-2 text-xs text-default-500">
                          {formatarNomeUsuario(comentario.usuario)} •{" "}
                          {dayjs(comentario.createdAt).format(
                            "DD/MM/YYYY HH:mm",
                          )}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </Tab>
              <Tab
                key="atividades"
                title={`Atividades (${atividadesItems.length})`}
              >
                <div className="space-y-3 py-4">
                  {!atividadesItems.length ? (
                    <EmptyTabState
                      description="O histórico de movimentações desta tarefa será mostrado aqui."
                      title="Nenhuma atividade registrada"
                    />
                  ) : (
                    atividadesItems.map((atividade: any) => (
                      <div
                        key={atividade.id}
                        className="rounded-2xl border border-divider/70 bg-content1/75 px-4 py-3"
                      >
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-divider/70 bg-content2/70 text-default-500">
                            <MessageSquare className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-foreground">
                              {atividade.descricao}
                            </p>
                            <p className="mt-2 text-xs text-default-500">
                              {formatarNomeUsuario(atividade.usuario)} •{" "}
                              {dayjs(atividade.createdAt).format(
                                "DD/MM/YYYY HH:mm",
                              )}
                            </p>
                          </div>
                        </div>
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
