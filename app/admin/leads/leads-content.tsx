"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useSession } from "next-auth/react";
import useSWR from "swr";
import { Input } from "@heroui/input";
import { Select, SelectItem } from "@heroui/select";
import { Button } from "@heroui/button";
import { Chip } from "@heroui/chip";
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Pagination,
} from "@heroui/react";
import { Textarea } from "@heroui/input";
import { addToast } from "@heroui/toast";
import {
  CalendarClock,
  CircleDollarSign,
  Search,
  Target,
  Users,
} from "lucide-react";

import {
  addLeadNote,
  assignLeadToCurrentAdmin,
  getLeadDetails,
  getLeadStats,
  listLeads,
  updateLeadStatus,
  type LeadListFilters,
} from "@/app/actions/leads";
import { getPricingChatFaqItemsByIds } from "@/app/lib/pricing-chat";
import {
  PeopleEntityCard,
  PeopleEntityCardBody,
  PeopleEntityCardHeader,
  PeopleMetricCard,
  PeoplePageHeader,
  PeoplePanel,
} from "@/components/people-ui";

const STATUS_OPTIONS = [
  { key: "ALL", label: "Todos os status" },
  { key: "NEW", label: "Novo" },
  { key: "QUALIFIED", label: "Qualificado" },
  { key: "CONTACTED", label: "Contato iniciado" },
  { key: "NEGOTIATION", label: "Negociação" },
  { key: "WON", label: "Ganho" },
  { key: "LOST", label: "Perdido" },
  { key: "SPAM", label: "Spam" },
] as const;

const SOURCE_OPTIONS = [
  { key: "ALL", label: "Todas as fontes" },
  { key: "PRICING_CHAT", label: "Chat de preços" },
  { key: "MANUAL_ADMIN", label: "Cadastro manual" },
  { key: "IMPORT", label: "Importação" },
] as const;

const PAGE_SIZE_OPTIONS = [
  { key: "10", label: "10 por página" },
  { key: "20", label: "20 por página" },
  { key: "40", label: "40 por página" },
] as const;

type LeadStatusValue =
  | "NEW"
  | "QUALIFIED"
  | "CONTACTED"
  | "NEGOTIATION"
  | "WON"
  | "LOST"
  | "SPAM";

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function formatChatTime(value?: string | null) {
  if (!value) {
    return null;
  }

  return new Date(value).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function qualificationPathLabel(value: "GUIDED" | "HANDOFF") {
  return value === "HANDOFF" ? "Handoff humano" : "Fluxo guiado";
}

function qualificationStepLabel(value: string | null) {
  switch (value) {
    case "objective":
      return "Objetivo";
    case "teamSize":
      return "Tamanho da equipe";
    case "timeline":
      return "Prazo";
    case "plan":
      return "Plano";
    case "contact":
      return "Contato";
    case "done":
      return "Lead enviado";
    default:
      return "Não informado";
  }
}

function statusChipTone(status: LeadStatusValue) {
  switch (status) {
    case "NEW":
      return "default";
    case "QUALIFIED":
      return "primary";
    case "CONTACTED":
      return "secondary";
    case "NEGOTIATION":
      return "warning";
    case "WON":
      return "success";
    case "LOST":
    case "SPAM":
      return "danger";
    default:
      return "default";
  }
}

function statusLabel(status: LeadStatusValue) {
  const found = STATUS_OPTIONS.find((item) => item.key === status);

  return found?.label ?? status;
}

function sourceLabel(source: "PRICING_CHAT" | "MANUAL_ADMIN" | "IMPORT") {
  const found = SOURCE_OPTIONS.find((item) => item.key === source);

  return found?.label ?? source;
}

async function fetchLeadStats() {
  const response = await getLeadStats();

  if (!response.success) {
    throw new Error(response.error);
  }

  return response.data;
}

async function fetchLeads(filters: LeadListFilters) {
  const response = await listLeads(filters);

  if (!response.success) {
    throw new Error(response.error);
  }

  return response.data;
}

async function fetchLeadDetails(leadId: string) {
  const response = await getLeadDetails(leadId);

  if (!response.success) {
    throw new Error(response.error);
  }

  return response.data;
}

export function LeadsContent() {
  const { data: session } = useSession();
  const [search, setSearch] = useState("");
  const [status, setStatus] =
    useState<(typeof STATUS_OPTIONS)[number]["key"]>("ALL");
  const [source, setSource] =
    useState<(typeof SOURCE_OPTIONS)[number]["key"]>("ALL");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [statusDraft, setStatusDraft] = useState<LeadStatusValue>("NEW");
  const [statusObservation, setStatusObservation] = useState("");
  const [newNote, setNewNote] = useState("");
  const [isPending, startTransition] = useTransition();

  const filters = useMemo(
    () => ({
      search: search.trim() || undefined,
      status: status === "ALL" ? undefined : status,
      source: source === "ALL" ? undefined : source,
      page,
      limit,
    }),
    [search, status, source, page, limit],
  );

  const {
    data: stats,
    isLoading: isLoadingStats,
    mutate: mutateStats,
  } = useSWR("admin-leads-stats", fetchLeadStats, {
    refreshInterval: 45_000,
    revalidateOnFocus: true,
  });

  const {
    data: leadsData,
    error: leadsError,
    isLoading: isLoadingLeads,
    mutate: mutateLeads,
  } = useSWR(["admin-leads-list", filters], () => fetchLeads(filters), {
    refreshInterval: 45_000,
    revalidateOnFocus: true,
    keepPreviousData: true,
  });

  const {
    data: leadDetails,
    isLoading: isLoadingDetails,
    mutate: mutateLeadDetails,
  } = useSWR(
    selectedLeadId ? ["admin-lead-details", selectedLeadId] : null,
    () => fetchLeadDetails(selectedLeadId as string),
    {
      revalidateOnFocus: false,
    },
  );

  useEffect(() => {
    if (leadDetails?.status) {
      setStatusDraft(leadDetails.status);
    }
  }, [leadDetails?.status]);

  const leads = leadsData?.items ?? [];
  const pagination = leadsData?.pagination;
  const hasActiveFilters =
    Boolean(search.trim()) || status !== "ALL" || source !== "ALL";
  const hasListMismatch =
    !isLoadingLeads &&
    !leadsError &&
    !hasActiveFilters &&
    leads.length === 0 &&
    (stats?.total ?? 0) > 0;
  const filterDescription = leadsError
    ? `Falha ao carregar a fila comercial. Há ${stats?.total ?? 0} lead(s) consolidados nos indicadores.`
    : hasListMismatch
      ? `Os indicadores mostram ${stats?.total ?? 0} lead(s), mas a fila atual veio vazia. Isso sugere falha transitória de sincronização, não ausência real de leads.`
      : `${pagination?.total ?? 0} lead(s) no resultado atual. Ajuste busca, origem e status para trabalhar o funil.`;
  const currentUserId = session?.user?.id ?? "";
  const viewedFaqItems = useMemo(
    () =>
      leadDetails?.metadata
        ? getPricingChatFaqItemsByIds(leadDetails.metadata.faqTopicIds)
        : [],
    [leadDetails?.metadata],
  );

  const handleSaveStatus = () => {
    if (!selectedLeadId) {
      return;
    }

    startTransition(async () => {
      const response = await updateLeadStatus(
        selectedLeadId,
        statusDraft,
        statusObservation,
      );

      if (!response.success) {
        addToast({
          title: "Falha ao atualizar lead",
          description: response.error,
          color: "danger",
        });

        return;
      }

      setStatusObservation("");
      await Promise.all([mutateLeads(), mutateLeadDetails(), mutateStats()]);
      addToast({
        title: "Status atualizado",
        description: "O lead foi atualizado com sucesso.",
        color: "success",
      });
    });
  };

  const handleAssignToggle = () => {
    if (!selectedLeadId || !leadDetails) {
      return;
    }

    const assignToMe = leadDetails.assignedTo?.id !== currentUserId;

    startTransition(async () => {
      const response = await assignLeadToCurrentAdmin(
        selectedLeadId,
        assignToMe,
      );

      if (!response.success) {
        addToast({
          title: "Falha ao atualizar responsável",
          description: response.error,
          color: "danger",
        });

        return;
      }

      await Promise.all([mutateLeads(), mutateLeadDetails()]);
      addToast({
        title: assignToMe ? "Lead assumido" : "Responsável removido",
        description: assignToMe
          ? "Este lead agora está atribuído a você."
          : "O lead voltou para a fila sem responsável.",
        color: "success",
      });
    });
  };

  const handleAddNote = () => {
    if (!selectedLeadId || !newNote.trim()) {
      return;
    }

    startTransition(async () => {
      const response = await addLeadNote(selectedLeadId, newNote);

      if (!response.success) {
        addToast({
          title: "Falha ao salvar observação",
          description: response.error,
          color: "danger",
        });

        return;
      }

      setNewNote("");
      await Promise.all([mutateLeads(), mutateLeadDetails()]);
      addToast({
        title: "Observação registrada",
        description: "A nota interna foi salva neste lead.",
        color: "success",
      });
    });
  };

  return (
    <section className="space-y-6">
      <PeoplePageHeader
        tag="Administração"
        title="Leads comerciais"
        description="Central de captação da landing. Qualifique, atribua e acompanhe cada oportunidade sem perder contexto."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <PeopleMetricCard
          label="Total de leads"
          value={isLoadingStats ? "..." : (stats?.total ?? 0)}
          helper="Base comercial consolidada"
          icon={<Users size={16} />}
          tone="primary"
        />
        <PeopleMetricCard
          label="Novos"
          value={isLoadingStats ? "..." : (stats?.novos ?? 0)}
          helper="Aguardando primeira qualificação"
          icon={<Target size={16} />}
          tone="warning"
        />
        <PeopleMetricCard
          label="Em negociação"
          value={isLoadingStats ? "..." : (stats?.emNegociacao ?? 0)}
          helper="Leads em avanço comercial"
          icon={<CalendarClock size={16} />}
          tone="secondary"
        />
        <PeopleMetricCard
          label="Ganhos"
          value={isLoadingStats ? "..." : (stats?.ganhos ?? 0)}
          helper={`${stats?.ultimas24h ?? 0} novos nas últimas 24h`}
          icon={<CircleDollarSign size={16} />}
          tone="success"
        />
      </div>

      <PeoplePanel
        title="Filtro de oportunidades"
        description={filterDescription}
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div className="space-y-2 xl:col-span-2">
            <p className="text-sm font-medium text-default-700">Busca</p>
            <Input
              classNames={{
                inputWrapper: "min-h-12",
              }}
              placeholder="Buscar por nome, e-mail, empresa ou plano"
              startContent={<Search className="h-4 w-4 text-default-400" />}
              value={search}
              onValueChange={(value) => {
                setSearch(value);
                setPage(1);
              }}
            />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-default-700">Status</p>
            <Select
              aria-label="Filtrar por status"
              classNames={{
                trigger: "min-h-12",
              }}
              selectedKeys={status ? [status] : []}
              onSelectionChange={(keys) => {
                const next = Array.from(keys)[0];

                if (!next || typeof next !== "string") return;
                setStatus(next as (typeof STATUS_OPTIONS)[number]["key"]);
                setPage(1);
              }}
            >
              {STATUS_OPTIONS.map((item) => (
                <SelectItem key={item.key} textValue={item.label}>
                  {item.label}
                </SelectItem>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-default-700">Origem</p>
            <Select
              aria-label="Filtrar por origem"
              classNames={{
                trigger: "min-h-12",
              }}
              selectedKeys={source ? [source] : []}
              onSelectionChange={(keys) => {
                const next = Array.from(keys)[0];

                if (!next || typeof next !== "string") return;
                setSource(next as (typeof SOURCE_OPTIONS)[number]["key"]);
                setPage(1);
              }}
            >
              {SOURCE_OPTIONS.map((item) => (
                <SelectItem key={item.key} textValue={item.label}>
                  {item.label}
                </SelectItem>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-default-700">Por página</p>
            <Select
              aria-label="Quantidade por página"
              classNames={{
                trigger: "min-h-12",
              }}
              selectedKeys={[String(limit)]}
              onSelectionChange={(keys) => {
                const next = Array.from(keys)[0];

                if (!next || typeof next !== "string") return;
                setLimit(Number(next));
                setPage(1);
              }}
            >
              {PAGE_SIZE_OPTIONS.map((item) => (
                <SelectItem key={item.key} textValue={item.label}>
                  {item.label}
                </SelectItem>
              ))}
            </Select>
          </div>
        </div>
      </PeoplePanel>

      <PeoplePanel
        title="Fila comercial"
        description="Clique no card para abrir detalhes, assumir o lead e registrar evolução da negociação."
      >
        {isLoadingLeads ? (
          <p className="text-sm text-default-400">Carregando leads...</p>
        ) : leadsError ? (
          <div className="rounded-2xl border border-danger/30 bg-danger/5 px-4 py-5">
            <p className="text-sm font-semibold text-danger">
              Não foi possível carregar a fila comercial.
            </p>
            <p className="mt-1 text-sm text-default-400">
              Os indicadores do topo podem continuar visíveis porque usam outra
              consulta. A fila abaixo depende de uma busca separada e falhou
              nesta tentativa.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                color="danger"
                variant="flat"
                onPress={() => mutateLeads()}
              >
                Tentar carregar fila
              </Button>
              <Button
                color="default"
                variant="light"
                onPress={() => mutateStats()}
              >
                Revalidar indicadores
              </Button>
            </div>
          </div>
        ) : hasListMismatch ? (
          <div className="rounded-2xl border border-warning/30 bg-warning/5 px-4 py-5">
            <p className="text-sm font-semibold text-warning">
              A fila veio vazia, mas os indicadores mostram leads cadastrados.
            </p>
            <p className="mt-1 text-sm text-default-400">
              Isso normalmente indica inconsistência transitória entre a
              consulta dos cards e a consulta detalhada da fila. Não trate este
              estado como “sem leads”.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                color="warning"
                variant="flat"
                onPress={() => mutateLeads()}
              >
                Recarregar fila
              </Button>
            </div>
          </div>
        ) : leads.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-default-300/40 px-4 py-8 text-center">
            <p className="text-sm text-default-500">
              Nenhum lead encontrado com os filtros atuais.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {leads.map((lead) => (
              <PeopleEntityCard
                key={lead.id}
                isPressable
                onPress={() => setSelectedLeadId(lead.id)}
              >
                <PeopleEntityCardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <p className="text-base font-semibold text-foreground">
                      {lead.nome}
                    </p>
                    <p className="text-xs text-default-500">{lead.email}</p>
                    <p className="text-xs text-default-500">
                      {lead.empresa || "Empresa não informada"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Chip
                      color={statusChipTone(lead.status as LeadStatusValue)}
                      size="sm"
                      variant="flat"
                    >
                      {statusLabel(lead.status as LeadStatusValue)}
                    </Chip>
                    <Chip size="sm" variant="bordered">
                      {sourceLabel(lead.source)}
                    </Chip>
                  </div>
                </PeopleEntityCardHeader>
                <PeopleEntityCardBody className="space-y-2">
                  <div className="flex flex-wrap gap-3 text-xs text-default-500">
                    <span>Plano: {lead.interessePlano || "Não definido"}</span>
                    <span>Equipe: {lead.tamanhoEquipe || "N/I"}</span>
                    <span>Notas: {lead.notesCount}</span>
                    <span>Criado em {formatDateTime(lead.createdAt)}</span>
                  </div>
                  <p className="text-sm text-default-400">
                    {lead.objetivoPrincipal ||
                      "Objetivo não informado pelo lead."}
                  </p>
                  {lead.assignedTo ? (
                    <p className="text-xs text-success">
                      Responsável: {lead.assignedTo.nome}
                    </p>
                  ) : (
                    <p className="text-xs text-warning">
                      Sem responsável definido.
                    </p>
                  )}
                </PeopleEntityCardBody>
              </PeopleEntityCard>
            ))}
          </div>
        )}

        {pagination && pagination.totalPages > 1 ? (
          <div className="flex justify-center pt-4">
            <Pagination
              showControls
              color="primary"
              page={pagination.page}
              total={pagination.totalPages}
              onChange={setPage}
            />
          </div>
        ) : null}
      </PeoplePanel>

      <Modal
        isOpen={Boolean(selectedLeadId)}
        scrollBehavior="inside"
        size="4xl"
        onOpenChange={(open) => {
          if (!open) {
            setSelectedLeadId(null);
            setStatusObservation("");
            setNewNote("");
          }
        }}
      >
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1">
            <span className="text-base font-semibold">
              {leadDetails?.nome ?? "Detalhes do lead"}
            </span>
            {leadDetails ? (
              <span className="text-xs text-default-500">
                Capturado em {formatDateTime(leadDetails.createdAt)}
              </span>
            ) : null}
          </ModalHeader>
          <ModalBody>
            {isLoadingDetails || !leadDetails ? (
              <p className="text-sm text-default-400">Carregando lead...</p>
            ) : (
              <div className="space-y-5">
                <div className="grid gap-3 rounded-xl border border-default-200/30 bg-default-50/5 p-4 sm:grid-cols-2">
                  <p className="text-sm text-default-600">
                    <span className="font-medium text-foreground">E-mail:</span>{" "}
                    {leadDetails.email}
                  </p>
                  <p className="text-sm text-default-600">
                    <span className="font-medium text-foreground">
                      Telefone:
                    </span>{" "}
                    {leadDetails.telefone || "Não informado"}
                  </p>
                  <p className="text-sm text-default-600">
                    <span className="font-medium text-foreground">
                      Empresa:
                    </span>{" "}
                    {leadDetails.empresa || "Não informada"}
                  </p>
                  <p className="text-sm text-default-600">
                    <span className="font-medium text-foreground">
                      Plano de interesse:
                    </span>{" "}
                    {leadDetails.interessePlano || "Não definido"}
                  </p>
                  <p className="text-sm text-default-600">
                    <span className="font-medium text-foreground">Equipe:</span>{" "}
                    {leadDetails.tamanhoEquipe || "N/I"}
                  </p>
                  <p className="text-sm text-default-600">
                    <span className="font-medium text-foreground">
                      Horizonte:
                    </span>{" "}
                    {leadDetails.horizonteContratacao || "N/I"}
                  </p>
                </div>

                {leadDetails.metadata ? (
                  <div className="space-y-3">
                    <p className="text-sm font-semibold text-foreground">
                      Contexto comercial capturado
                    </p>
                    <div className="grid gap-3 rounded-xl border border-default-200/30 bg-default-50/5 p-4 sm:grid-cols-2 xl:grid-cols-3">
                      <p className="text-sm text-default-600">
                        <span className="font-medium text-foreground">
                          Trilha:
                        </span>{" "}
                        {qualificationPathLabel(
                          leadDetails.metadata.qualificationPath,
                        )}
                      </p>
                      <p className="text-sm text-default-600">
                        <span className="font-medium text-foreground">
                          Etapa alcançada:
                        </span>{" "}
                        {qualificationStepLabel(
                          leadDetails.metadata.stepReached,
                        )}
                      </p>
                      <p className="text-sm text-default-600">
                        <span className="font-medium text-foreground">
                          Respostas concluídas:
                        </span>{" "}
                        {leadDetails.metadata.completedAnswers}/4
                      </p>
                      <p className="text-sm text-default-600">
                        <span className="font-medium text-foreground">
                          Atendimento humano:
                        </span>{" "}
                        {leadDetails.metadata.requestedHumanHandoff
                          ? "Solicitado"
                          : "Não solicitado"}
                      </p>
                      <p className="text-sm text-default-600">
                        <span className="font-medium text-foreground">
                          Canal preferido:
                        </span>{" "}
                        {leadDetails.metadata.preferredContactChannel ||
                          "Não definido"}
                      </p>
                      <p className="text-sm text-default-600">
                        <span className="font-medium text-foreground">
                          Prioridade:
                        </span>{" "}
                        {leadDetails.metadata.responsePriority || "Normal"}
                      </p>
                    </div>

                    {viewedFaqItems.length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-sm font-semibold text-foreground">
                          FAQs consultadas na conversa
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {viewedFaqItems.map((item) => (
                            <Chip
                              key={item.id}
                              color="secondary"
                              variant="flat"
                            >
                              {item.shortLabel}
                            </Chip>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="space-y-2">
                  <p className="text-sm font-semibold text-foreground">
                    Objetivo principal
                  </p>
                  <p className="rounded-xl border border-default-200/30 bg-default-50/5 p-3 text-sm text-default-600">
                    {leadDetails.objetivoPrincipal || "Não informado"}
                  </p>
                  <p className="text-sm font-semibold text-foreground">
                    Mensagem adicional
                  </p>
                  <p className="rounded-xl border border-default-200/30 bg-default-50/5 p-3 text-sm text-default-600">
                    {leadDetails.mensagem || "Sem mensagem livre."}
                  </p>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-semibold text-foreground">
                    Transcrição do chat de captação
                  </p>
                  {leadDetails.transcript &&
                  leadDetails.transcript.length > 0 ? (
                    <div className="max-h-52 space-y-2 overflow-y-auto rounded-xl border border-default-200/30 bg-default-50/5 p-3">
                      {leadDetails.transcript.map((message, index) => (
                        <div
                          key={`${message.author}-${index}`}
                          className={`max-w-[90%] rounded-xl px-3 py-2 text-sm ${
                            message.author === "bot"
                              ? "bg-primary/10 text-default-700"
                              : "ml-auto bg-secondary/20 text-foreground"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.14em]">
                              {message.author === "bot" ? "Lia" : "Lead"}
                            </p>
                            {message.createdAt ? (
                              <span className="text-[11px] text-default-400">
                                {formatChatTime(message.createdAt)}
                              </span>
                            ) : null}
                          </div>
                          <p>{message.text}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-default-400">
                      Este lead não possui histórico de chat registrado.
                    </p>
                  )}
                </div>

                <div className="grid gap-3 rounded-xl border border-default-200/30 bg-default-50/5 p-4 lg:grid-cols-2">
                  <Select
                    aria-label="Atualizar status do lead"
                    label="Status"
                    labelPlacement="outside"
                    selectedKeys={statusDraft ? [statusDraft] : []}
                    onSelectionChange={(keys) => {
                      const next = Array.from(keys)[0];

                      if (!next || typeof next !== "string") return;
                      setStatusDraft(next as LeadStatusValue);
                    }}
                  >
                    {STATUS_OPTIONS.filter((item) => item.key !== "ALL").map(
                      (item) => (
                        <SelectItem key={item.key} textValue={item.label}>
                          {item.label}
                        </SelectItem>
                      ),
                    )}
                  </Select>
                  <div className="flex items-end gap-2">
                    <Button
                      className="w-full"
                      color="primary"
                      isLoading={isPending}
                      onPress={handleSaveStatus}
                    >
                      Salvar status
                    </Button>
                    <Button
                      className="w-full"
                      color="secondary"
                      isLoading={isPending}
                      variant="flat"
                      onPress={handleAssignToggle}
                    >
                      {leadDetails.assignedTo?.id === currentUserId
                        ? "Remover de mim"
                        : "Assumir para mim"}
                    </Button>
                  </div>
                  <Textarea
                    className="lg:col-span-2"
                    label="Observação de atualização"
                    labelPlacement="outside"
                    minRows={2}
                    placeholder="Opcional: registre contexto ao trocar o status."
                    value={statusObservation}
                    onValueChange={setStatusObservation}
                  />
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-semibold text-foreground">
                    Observações internas
                  </p>
                  <Textarea
                    label="Nova observação"
                    labelPlacement="outside"
                    minRows={2}
                    placeholder="Ex.: ligar hoje às 16h para apresentar proposta."
                    value={newNote}
                    onValueChange={setNewNote}
                  />
                  <div className="flex justify-end">
                    <Button
                      color="primary"
                      isLoading={isPending}
                      variant="flat"
                      onPress={handleAddNote}
                    >
                      Adicionar observação
                    </Button>
                  </div>
                  <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                    {leadDetails.notes.length > 0 ? (
                      leadDetails.notes.map((note) => (
                        <div
                          key={note.id}
                          className="rounded-xl border border-default-200/30 bg-default-50/5 px-3 py-2"
                        >
                          <p className="text-xs text-default-500">
                            {note.autor.nome} • {formatDateTime(note.createdAt)}
                          </p>
                          <p className="text-sm text-default-700">
                            {note.conteudo}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-default-400">
                        Nenhuma observação registrada ainda.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={() => setSelectedLeadId(null)}>
              Fechar
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </section>
  );
}
