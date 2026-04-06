"use client";

import type {
  SupportTicketFilters,
  SupportTicketListItem,
  SupportTicketThread,
} from "@/app/actions/tickets";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type Dispatch,
  type SetStateAction,
} from "react";
import useSWR from "swr";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Button,
  Chip,
  Divider,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Pagination,
  Select,
  SelectItem,
  Spinner,
  Switch,
  Textarea,
  Tooltip,
  useDisclosure,
} from "@heroui/react";
import { UploadProgress } from "@/components/ui/upload-progress";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Filter,
  ImagePlus,
  LifeBuoy,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  addSupportMessageWithImages,
  addSupportMessage,
  createSupportTicketWithImages,
  createSupportTicket,
  getSupportTicketThread,
  getTenantSupportStats,
  getTenantSupportTickets,
  markSupportTicketViewed,
  rateSupportTicket,
  updateSupportTicketStatus,
} from "@/app/actions/tickets";
import {
  TicketCategory,
  TicketPriority,
  TicketResolutionOutcome,
  TicketStatus,
  TicketSupportLevel,
} from "@/generated/prisma";
import {
  PeopleEntityCard,
  PeopleEntityCardBody,
  PeopleEntityCardHeader,
  PeopleMetricCard,
  PeoplePageHeader,
  PeoplePanel,
} from "@/components/people-ui";

const STATUS_OPTIONS: Array<{ key: TicketStatus | "ALL"; label: string }> = [
  { key: "ALL", label: "Todos os status" },
  { key: TicketStatus.OPEN, label: "Aberto" },
  { key: TicketStatus.IN_PROGRESS, label: "Em andamento" },
  { key: TicketStatus.WAITING_CUSTOMER, label: "Aguardando cliente" },
  { key: TicketStatus.WAITING_EXTERNAL, label: "Aguardando terceiro" },
  { key: TicketStatus.RESOLVED, label: "Resolvido" },
  { key: TicketStatus.CLOSED, label: "Encerrado" },
];

const PRIORITY_OPTIONS: Array<{ key: TicketPriority | "ALL"; label: string }> = [
  { key: "ALL", label: "Todas as prioridades" },
  { key: TicketPriority.LOW, label: "Baixa" },
  { key: TicketPriority.MEDIUM, label: "Média" },
  { key: TicketPriority.HIGH, label: "Alta" },
  { key: TicketPriority.URGENT, label: "Urgente" },
];

const CATEGORY_OPTIONS: Array<{ key: TicketCategory | "ALL"; label: string }> = [
  { key: "ALL", label: "Todas as categorias" },
  { key: TicketCategory.TECHNICAL, label: "Técnico" },
  { key: TicketCategory.BILLING, label: "Financeiro" },
  { key: TicketCategory.FEATURE_REQUEST, label: "Solicitação de melhoria" },
  { key: TicketCategory.BUG_REPORT, label: "Bug" },
  { key: TicketCategory.GENERAL, label: "Geral" },
];

const SUPPORT_LEVEL_OPTIONS: Array<{
  key: TicketSupportLevel | "ALL";
  label: string;
}> = [
  { key: "ALL", label: "Todos os níveis" },
  { key: TicketSupportLevel.N1, label: "Atendimento padrão" },
  { key: TicketSupportLevel.N2, label: "Atendimento especializado" },
  { key: TicketSupportLevel.N3, label: "Atendimento avançado" },
];

const PAGE_SIZE_OPTIONS = [8, 12, 20, 30];
const SUPPORT_POLL_INTERVAL_MS = 4000;
const THREAD_POLL_INTERVAL_MS = 2500;
const SUPPORT_MAX_IMAGES_PER_BATCH = 5;
const STATUS_TRANSITION_GUIDE: Array<{ title: string; description: string }> = [
  { title: "Aberto", description: "Ticket recém-criado, sem tratativa iniciada." },
  { title: "Em andamento", description: "Atendimento ativo do suporte." },
  { title: "Aguardando cliente", description: "Depende de retorno do solicitante." },
  {
    title: "Aguardando terceiro",
    description:
      "Depende de tribunal/integrador/fornecedor externo. Motivo obrigatório.",
  },
  { title: "Resolvido", description: "Solução aplicada, aguardando encerramento final." },
  { title: "Encerrado", description: "Fluxo concluído e sem pendências." },
];
const RESOLUTION_OUTCOME_LABELS: Record<TicketResolutionOutcome, string> = {
  RESOLVED: "Resolvido",
  PARTIALLY_RESOLVED: "Parcialmente resolvido",
  UNRESOLVED: "Não resolvido",
};

function getStatusLabel(status: TicketStatus) {
  return (
    STATUS_OPTIONS.find((option) => option.key === status)?.label ?? status
  );
}

function getPriorityLabel(priority: TicketPriority) {
  return (
    PRIORITY_OPTIONS.find((option) => option.key === priority)?.label ??
    priority
  );
}

function getCategoryLabel(category: TicketCategory) {
  return (
    CATEGORY_OPTIONS.find((option) => option.key === category)?.label ??
    category
  );
}

function getSupportLevelLabel(level: TicketSupportLevel) {
  return (
    SUPPORT_LEVEL_OPTIONS.find((option) => option.key === level)?.label ??
    level
  );
}

function getStatusColor(status: TicketStatus) {
  switch (status) {
    case TicketStatus.OPEN:
      return "primary" as const;
    case TicketStatus.IN_PROGRESS:
      return "warning" as const;
    case TicketStatus.WAITING_CUSTOMER:
      return "warning" as const;
    case TicketStatus.WAITING_EXTERNAL:
      return "default" as const;
    case TicketStatus.RESOLVED:
      return "success" as const;
    case TicketStatus.CLOSED:
      return "default" as const;
    default:
      return "default" as const;
  }
}

function getPriorityColor(priority: TicketPriority) {
  switch (priority) {
    case TicketPriority.LOW:
      return "default" as const;
    case TicketPriority.MEDIUM:
      return "primary" as const;
    case TicketPriority.HIGH:
      return "warning" as const;
    case TicketPriority.URGENT:
      return "danger" as const;
    default:
      return "default" as const;
  }
}

function getQueueLabel(ticket: SupportTicketListItem): string {
  if (ticket.status === TicketStatus.WAITING_EXTERNAL) {
    return "Aguardando terceiro";
  }

  if (ticket.status === TicketStatus.RESOLVED) {
    return "Resolvido";
  }

  if (ticket.status === TicketStatus.CLOSED) {
    return "Encerrado";
  }

  if (ticket.waitingFor === "SUPPORT") {
    return "Aguardando suporte";
  }

  if (ticket.waitingFor === "REQUESTER") {
    return "Aguardando seu retorno";
  }

  return "Em andamento";
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";

  return new Date(value).toLocaleString("pt-BR");
}

function formatElapsedTime(from?: string | null, to?: string | null) {
  if (!from) return "-";

  const start = new Date(from).getTime();
  const end = to ? new Date(to).getTime() : Date.now();

  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return "-";
  }

  const seconds = Math.floor((end - start) / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const restSeconds = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${restSeconds}s`;
  }

  if (minutes > 0) {
    return `${minutes}m ${restSeconds}s`;
  }

  return `${restSeconds}s`;
}

function isSupportMessage(authorType: SupportTicketThread["messages"][number]["authorType"]) {
  return authorType === "SUPER_ADMIN" || authorType === "SYSTEM";
}

export function SuporteContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const role = String((session?.user as any)?.role ?? "");
  const canManage = role === "ADMIN";

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<TicketStatus | "ALL">("ALL");
  const [priorityFilter, setPriorityFilter] = useState<TicketPriority | "ALL">(
    "ALL",
  );
  const [categoryFilter, setCategoryFilter] = useState<TicketCategory | "ALL">(
    "ALL",
  );
  const [supportLevelFilter, setSupportLevelFilter] = useState<
    TicketSupportLevel | "ALL"
  >("ALL");
  const [mineOnly, setMineOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);

  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [statusDraft, setStatusDraft] = useState<TicketStatus | "">("");
  const [statusReasonDraft, setStatusReasonDraft] = useState("");
  const [isSavingStatus, setIsSavingStatus] = useState(false);
  const [isSavingRating, setIsSavingRating] = useState(false);
  const [ratingDraft, setRatingDraft] = useState(0);
  const [ratingCommentDraft, setRatingCommentDraft] = useState("");
  const [threadClockTick, setThreadClockTick] = useState(() => Date.now());
  const ticketIdFromUrl = searchParams.get("ticketId");

  const {
    isOpen: isCreateOpen,
    onOpen: onCreateOpen,
    onClose: onCreateClose,
  } = useDisclosure();
  const {
    isOpen: isThreadOpen,
    onOpen: onThreadOpen,
    onClose: onThreadClose,
  } = useDisclosure();

  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newPriority, setNewPriority] = useState<TicketPriority>(
    TicketPriority.MEDIUM,
  );
  const [newCategory, setNewCategory] = useState<TicketCategory>(
    TicketCategory.GENERAL,
  );
  const [isCreating, setIsCreating] = useState(false);
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [newImages, setNewImages] = useState<File[]>([]);
  const [replyImages, setReplyImages] = useState<File[]>([]);
  const createImagesInputRef = useRef<HTMLInputElement | null>(null);
  const replyImagesInputRef = useRef<HTMLInputElement | null>(null);
  const seenUnreadSupportIdsRef = useRef<Set<string>>(new Set());
  const unreadNotifierReadyRef = useRef(false);

  const hasActiveFilters =
    query.trim().length > 0 ||
    statusFilter !== "ALL" ||
    priorityFilter !== "ALL" ||
    categoryFilter !== "ALL" ||
    supportLevelFilter !== "ALL" ||
    mineOnly;

  useEffect(() => {
    setPage(1);
  }, [query, statusFilter, priorityFilter, categoryFilter, supportLevelFilter, mineOnly]);

  const listFilters: SupportTicketFilters = useMemo(
    () => ({
      page,
      pageSize,
      query,
      status: statusFilter,
      priority: priorityFilter,
      category: categoryFilter,
      supportLevel: supportLevelFilter,
      mineOnly,
    }),
    [
      page,
      pageSize,
      query,
      statusFilter,
      priorityFilter,
      categoryFilter,
      supportLevelFilter,
      mineOnly,
    ],
  );

  const { data: stats, isLoading: isLoadingStats, mutate: mutateStats } = useSWR(
    "tenant-support-stats",
    () => getTenantSupportStats(),
    {
      revalidateOnFocus: true,
      refreshInterval: SUPPORT_POLL_INTERVAL_MS,
      dedupingInterval: 1000,
    },
  );

  const {
    data: listData,
    isLoading: isLoadingList,
    mutate: mutateList,
  } = useSWR(
    [
      "tenant-support-list",
      listFilters.page,
      listFilters.pageSize,
      listFilters.query,
      listFilters.status,
      listFilters.priority,
      listFilters.category,
      listFilters.supportLevel,
      listFilters.mineOnly,
    ],
    () => getTenantSupportTickets(listFilters),
    {
      revalidateOnFocus: true,
      refreshInterval: SUPPORT_POLL_INTERVAL_MS,
      dedupingInterval: 1000,
      keepPreviousData: true,
    },
  );

  const {
    data: selectedTicket,
    isLoading: isLoadingThread,
    mutate: mutateThread,
  } = useSWR(
    selectedTicketId ? ["tenant-support-thread", selectedTicketId] : null,
    () => getSupportTicketThread(selectedTicketId!),
    {
      revalidateOnFocus: true,
      refreshInterval: isThreadOpen ? THREAD_POLL_INTERVAL_MS : 0,
      dedupingInterval: 500,
    },
  );

  useEffect(() => {
    if (!selectedTicket) {
      setStatusDraft("");
      setStatusReasonDraft("");
      setRatingDraft(0);
      setRatingCommentDraft("");
      return;
    }

    setStatusDraft(selectedTicket.status);
    setStatusReasonDraft("");
    setRatingDraft(selectedTicket.requesterRating ?? 0);
    setRatingCommentDraft(selectedTicket.requesterRatingComment ?? "");
  }, [selectedTicket]);

  useEffect(() => {
    if (!isThreadOpen) return;

    const interval = window.setInterval(() => {
      setThreadClockTick(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [isThreadOpen]);

  useEffect(() => {
    if (!selectedTicket?.id || !isThreadOpen) {
      return;
    }

    markSupportTicketViewed(selectedTicket.id)
      .then(() => {
        void mutateList();
        void mutateThread();
      })
      .catch(() => {
        // silencioso para evitar ruído no usuário
      });
  }, [selectedTicket?.id, isThreadOpen, mutateList, mutateThread]);

  const tickets = listData?.items ?? [];

  const unreadSupportTickets = useMemo(
    () => tickets.filter((ticket) => ticket.hasUnreadForRequester),
    [tickets],
  );

  useEffect(() => {
    if (!unreadNotifierReadyRef.current) {
      unreadNotifierReadyRef.current = true;
      seenUnreadSupportIdsRef.current = new Set(
        unreadSupportTickets.map((ticket) => ticket.id),
      );
      return;
    }

    for (const ticket of unreadSupportTickets) {
      if (seenUnreadSupportIdsRef.current.has(ticket.id)) {
        continue;
      }

      seenUnreadSupportIdsRef.current.add(ticket.id);
      toast.info("Nova resposta do suporte", {
        description: ticket.title,
      });
    }

    const active = new Set(unreadSupportTickets.map((ticket) => ticket.id));

    for (const id of Array.from(seenUnreadSupportIdsRef.current)) {
      if (!active.has(id)) {
        seenUnreadSupportIdsRef.current.delete(id);
      }
    }
  }, [unreadSupportTickets]);

  useEffect(() => {
    if (!ticketIdFromUrl) return;

    if (selectedTicketId === ticketIdFromUrl && isThreadOpen) {
      return;
    }

    setSelectedTicketId(ticketIdFromUrl);
    onThreadOpen();
  }, [ticketIdFromUrl, selectedTicketId, isThreadOpen, onThreadOpen]);

  const replaceTicketInUrl = (ticketId: string | null) => {
    const next = new URLSearchParams(searchParams.toString());

    if (ticketId) {
      next.set("ticketId", ticketId);
    } else {
      next.delete("ticketId");
    }

    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const openThread = (ticket: SupportTicketListItem) => {
    setSelectedTicketId(ticket.id);
    replaceTicketInUrl(ticket.id);
    onThreadOpen();
  };

  const closeThread = () => {
    onThreadClose();
    setSelectedTicketId(null);
    setReply("");
    setReplyImages([]);
    setStatusDraft("");
    setStatusReasonDraft("");
    setRatingDraft(0);
    setRatingCommentDraft("");
    replaceTicketInUrl(null);
  };

  const closeCreateModal = () => {
    onCreateClose();
    setNewTitle("");
    setNewDescription("");
    setNewPriority(TicketPriority.MEDIUM);
    setNewCategory(TicketCategory.GENERAL);
    setNewImages([]);
  };

  const appendImages = (
    current: File[],
    event: ChangeEvent<HTMLInputElement>,
    setter: Dispatch<SetStateAction<File[]>>,
  ) => {
    const incoming = Array.from(event.target.files ?? []);

    if (!incoming.length) return;

    const merged = [...current, ...incoming].slice(0, SUPPORT_MAX_IMAGES_PER_BATCH);

    if (current.length + incoming.length > SUPPORT_MAX_IMAGES_PER_BATCH) {
      toast.warning(
        `Limite de ${SUPPORT_MAX_IMAGES_PER_BATCH} imagens por envio.`,
      );
    }

    setter(merged);
    event.target.value = "";
  };

  const clearFilters = () => {
    setQuery("");
    setStatusFilter("ALL");
    setPriorityFilter("ALL");
    setCategoryFilter("ALL");
    setSupportLevelFilter("ALL");
    setMineOnly(false);
    setPage(1);
  };

  const handleCreateTicket = async () => {
    if (!newTitle.trim()) {
      toast.error("Informe o título do ticket.");
      return;
    }

    setIsCreating(true);

    try {
      const result =
        newImages.length > 0
          ? await (() => {
              const formData = new FormData();
              formData.append("title", newTitle);
              formData.append("description", newDescription);
              formData.append("priority", newPriority);
              formData.append("category", newCategory);
              newImages.forEach((file) => formData.append("images", file));
              return createSupportTicketWithImages(formData);
            })()
          : await createSupportTicket({
              title: newTitle,
              description: newDescription,
              priority: newPriority,
              category: newCategory,
            });

      toast.success("Ticket aberto com sucesso.");

      closeCreateModal();

      await Promise.all([mutateList(), mutateStats()]);

      setSelectedTicketId(result.ticketId);
      replaceTicketInUrl(result.ticketId);
      onThreadOpen();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao abrir ticket";
      toast.error(message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleSendReply = async () => {
    if (!selectedTicket?.id) return;

    if (selectedTicket.status === TicketStatus.CLOSED) {
      toast.error("Este chat já foi finalizado e está bloqueado.");
      return;
    }

    if (!reply.trim() && replyImages.length === 0) {
      toast.error("Digite uma mensagem ou envie uma imagem.");
      return;
    }

    setIsSendingReply(true);

    try {
      if (replyImages.length > 0) {
        const formData = new FormData();
        formData.append("content", reply);
        replyImages.forEach((file) => formData.append("images", file));
        await addSupportMessageWithImages(selectedTicket.id, formData);
      } else {
        await addSupportMessage(selectedTicket.id, {
          content: reply,
        });
      }

      setReply("");
      setReplyImages([]);

      await Promise.all([mutateThread(), mutateList(), mutateStats()]);

      toast.success("Mensagem enviada.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao enviar mensagem";
      toast.error(message);
    } finally {
      setIsSendingReply(false);
    }
  };

  const handleSaveStatus = async () => {
    if (!selectedTicket?.id || !statusDraft || !canManage) return;

    if (selectedTicket.status === TicketStatus.CLOSED) {
      toast.error("Chat finalizado. Reabra o ticket antes de alterar status.");
      return;
    }

    if (
      statusDraft === TicketStatus.WAITING_EXTERNAL &&
      !statusReasonDraft.trim()
    ) {
      toast.error("Informe o motivo para Aguardando terceiro.");
      return;
    }

    setIsSavingStatus(true);

    try {
      await updateSupportTicketStatus(selectedTicket.id, statusDraft, {
        reason: statusReasonDraft.trim() || undefined,
      });
      await Promise.all([mutateThread(), mutateList(), mutateStats()]);
      setStatusReasonDraft("");
      toast.success("Status atualizado.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro ao atualizar status";
      toast.error(message);
    } finally {
      setIsSavingStatus(false);
    }
  };

  const handleSubmitRating = async () => {
    if (!selectedTicket?.id) return;

    if (selectedTicket.status !== TicketStatus.CLOSED) {
      toast.error("A avaliação só pode ser enviada após o encerramento.");
      return;
    }

    if (ratingDraft < 1 || ratingDraft > 5) {
      toast.error("Selecione uma nota de 1 a 5.");
      return;
    }

    setIsSavingRating(true);

    try {
      await rateSupportTicket(selectedTicket.id, {
        rating: ratingDraft,
        comment: ratingCommentDraft.trim() || undefined,
      });

      await Promise.all([mutateThread(), mutateList(), mutateStats()]);
      toast.success("Avaliação enviada com sucesso.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro ao enviar avaliação";
      toast.error(message);
    } finally {
      setIsSavingRating(false);
    }
  };

  return (
    <section className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 py-8 px-3 sm:px-6">
      <PeoplePageHeader
        tag="Administração"
        title="Suporte"
        description="Abra chamados e converse com o time do Magic Lawyer sem sair do sistema."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              color="primary"
              startContent={<Plus className="h-4 w-4" />}
              onPress={onCreateOpen}
            >
              Novo ticket
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <PeopleMetricCard
          label="Tickets"
          value={isLoadingStats ? "..." : stats?.total ?? 0}
          helper="Base do escritório"
          tone="primary"
          icon={<LifeBuoy className="h-4 w-4" />}
        />
        <PeopleMetricCard
          label="Aguardando suporte"
          value={isLoadingStats ? "..." : stats?.pendingSupport ?? 0}
          helper="Fila de espera aguardando suporte"
          tone="warning"
          icon={<Clock3 className="h-4 w-4" />}
        />
        <PeopleMetricCard
          label="Aguardando seu retorno"
          value={isLoadingStats ? "..." : stats?.pendingRequester ?? 0}
          helper="Suporte já respondeu"
          tone="success"
          icon={<MessageSquare className="h-4 w-4" />}
        />
        <PeopleMetricCard
          label="Encerrados"
          value={isLoadingStats ? "..." : stats?.closed ?? 0}
          helper="Chamados finalizados"
          tone="default"
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
      </div>

      <PeoplePanel
        title="Filtros operacionais"
        description="Localize chamados por status, prioridade, categoria e fila de atendimento."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              isDisabled={!hasActiveFilters}
              size="sm"
              startContent={<Filter className="h-4 w-4" />}
              variant="flat"
              onPress={clearFilters}
            >
              Limpar filtros
            </Button>
            <Button
              isIconOnly
              size="sm"
              variant="flat"
              onPress={() => {
                void mutateList();
                void mutateStats();
              }}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        }
      >
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-6">
          <Input
            className="lg:col-span-2"
            placeholder="Buscar por título, descrição ou e-mail"
            startContent={<Search className="h-4 w-4 text-default-400" />}
            value={query}
            onValueChange={setQuery}
          />

          <Select
            label="Status"
            selectedKeys={[statusFilter]}
            onSelectionChange={(keys) =>
              setStatusFilter((Array.from(keys)[0] as TicketStatus | "ALL") ?? "ALL")
            }
          >
            {STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.key} textValue={option.label}>
                {option.label}
              </SelectItem>
            ))}
          </Select>

          <Select
            label="Prioridade"
            selectedKeys={[priorityFilter]}
            onSelectionChange={(keys) =>
              setPriorityFilter(
                (Array.from(keys)[0] as TicketPriority | "ALL") ?? "ALL",
              )
            }
          >
            {PRIORITY_OPTIONS.map((option) => (
              <SelectItem key={option.key} textValue={option.label}>
                {option.label}
              </SelectItem>
            ))}
          </Select>

          <Select
            label="Categoria"
            selectedKeys={[categoryFilter]}
            onSelectionChange={(keys) =>
              setCategoryFilter(
                (Array.from(keys)[0] as TicketCategory | "ALL") ?? "ALL",
              )
            }
          >
            {CATEGORY_OPTIONS.map((option) => (
              <SelectItem key={option.key} textValue={option.label}>
                {option.label}
              </SelectItem>
            ))}
          </Select>

          <Select
            label="Nível"
            selectedKeys={[supportLevelFilter]}
            onSelectionChange={(keys) =>
              setSupportLevelFilter(
                (Array.from(keys)[0] as TicketSupportLevel | "ALL") ?? "ALL",
              )
            }
          >
            {SUPPORT_LEVEL_OPTIONS.map((option) => (
              <SelectItem key={option.key} textValue={option.label}>
                {option.label}
              </SelectItem>
            ))}
          </Select>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <Switch
            isSelected={mineOnly}
            isDisabled={!canManage}
            size="sm"
            onValueChange={setMineOnly}
          >
            Mostrar apenas tickets criados por mim
          </Switch>

          <div className="flex items-center gap-2">
            <span className="text-xs text-default-400">Por página</span>
            <Select
              className="w-28"
              selectedKeys={[String(pageSize)]}
              onSelectionChange={(keys) => {
                const next = Number(Array.from(keys)[0] ?? pageSize);

                setPageSize(Number.isNaN(next) ? 12 : next);
                setPage(1);
              }}
            >
              {PAGE_SIZE_OPTIONS.map((value) => (
                <SelectItem key={String(value)} textValue={String(value)}>
                  {String(value)}
                </SelectItem>
              ))}
            </Select>
          </div>
        </div>
      </PeoplePanel>

      <PeoplePanel
        title="Chamados do escritório"
        description={`Total no resultado: ${listData?.total ?? 0} ticket(s).`}
      >
        {isLoadingList ? (
          <div className="flex min-h-44 items-center justify-center">
            <Spinner label="Carregando chamados..." />
          </div>
        ) : tickets.length === 0 ? (
          <div className="flex min-h-44 flex-col items-center justify-center gap-2 text-center text-default-400">
            <AlertCircle className="h-5 w-5" />
            <p>Nenhum ticket encontrado com os filtros atuais.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {tickets.map((ticket) => (
                <PeopleEntityCard
                  key={ticket.id}
                  isPressable
                  onPress={() => openThread(ticket)}
                >
                  <PeopleEntityCardHeader className="items-start justify-between gap-2">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-white">{ticket.title}</p>
                      <p className="text-xs text-default-400">#{ticket.id.slice(-8)}</p>
                    </div>
                    <div className="flex flex-wrap justify-end gap-1">
                      <Chip color={getStatusColor(ticket.status)} size="sm" variant="flat">
                        {getStatusLabel(ticket.status)}
                      </Chip>
                      <Chip color={getPriorityColor(ticket.priority)} size="sm" variant="flat">
                        {getPriorityLabel(ticket.priority)}
                      </Chip>
                      <Chip size="sm" variant="bordered">
                        {getSupportLevelLabel(ticket.supportLevel)}
                      </Chip>
                    </div>
                  </PeopleEntityCardHeader>
                  <PeopleEntityCardBody className="space-y-3">
                    <p className="line-clamp-2 text-sm text-default-300">
                      {ticket.description || "Sem descrição detalhada."}
                    </p>

                    <div className="grid grid-cols-2 gap-2 text-xs text-default-400 sm:grid-cols-4">
                      <div>
                        <p className="uppercase tracking-[0.12em]">Categoria</p>
                        <p className="text-default-200">{getCategoryLabel(ticket.category)}</p>
                      </div>
                      <div>
                        <p className="uppercase tracking-[0.12em]">Mensagens</p>
                        <p className="text-default-200">{ticket.messageCount}</p>
                      </div>
                      <div>
                        <p className="uppercase tracking-[0.12em]">Abertura</p>
                        <p className="text-default-200">
                          {new Date(ticket.createdAt).toLocaleDateString("pt-BR")}
                        </p>
                      </div>
                      <div>
                        <p className="uppercase tracking-[0.12em]">Fila</p>
                        <p className="text-default-200">{getQueueLabel(ticket)}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {ticket.hasUnreadForRequester ? (
                        <Chip color="primary" size="sm" variant="flat">
                          Nova mensagem do suporte
                        </Chip>
                      ) : null}
                    </div>
                  </PeopleEntityCardBody>
                </PeopleEntityCard>
              ))}
            </div>

            {listData && listData.totalPages > 1 ? (
              <div className="mt-4 flex justify-center">
                <Pagination
                  page={page}
                  total={listData.totalPages}
                  onChange={setPage}
                />
              </div>
            ) : null}
          </>
        )}
      </PeoplePanel>

      <Modal isOpen={isCreateOpen} size="3xl" onClose={closeCreateModal}>
        <ModalContent>
          <ModalHeader>Novo ticket de suporte</ModalHeader>
          <ModalBody className="space-y-4">
            <Input
              isRequired
              label="Título"
              placeholder="Ex.: Falha ao importar planilha de clientes"
              value={newTitle}
              onValueChange={setNewTitle}
            />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Select
                label="Categoria"
                selectedKeys={[newCategory]}
                onSelectionChange={(keys) =>
                  setNewCategory(
                    (Array.from(keys)[0] as TicketCategory) ?? TicketCategory.GENERAL,
                  )
                }
              >
                {CATEGORY_OPTIONS.filter((option) => option.key !== "ALL").map(
                  (option) => (
                    <SelectItem key={option.key} textValue={option.label}>
                      {option.label}
                    </SelectItem>
                  ),
                )}
              </Select>

              <Select
                label="Prioridade"
                selectedKeys={[newPriority]}
                onSelectionChange={(keys) =>
                  setNewPriority(
                    (Array.from(keys)[0] as TicketPriority) ?? TicketPriority.MEDIUM,
                  )
                }
              >
                {PRIORITY_OPTIONS.filter((option) => option.key !== "ALL").map(
                  (option) => (
                    <SelectItem key={option.key} textValue={option.label}>
                      {option.label}
                    </SelectItem>
                  ),
                )}
              </Select>
            </div>

            <Textarea
              label="Descrição"
              minRows={6}
              placeholder="Descreva o cenário, passos para reproduzir, impacto e urgência."
              value={newDescription}
              onValueChange={setNewDescription}
            />

            <input
              ref={createImagesInputRef}
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              multiple
              type="file"
              onChange={(event) => appendImages(newImages, event, setNewImages)}
            />
            <div className="space-y-2 rounded-xl border border-white/10 bg-background/40 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-default-400">
                  Imagens do ticket (até {SUPPORT_MAX_IMAGES_PER_BATCH})
                </p>
                <Button
                  size="sm"
                  startContent={<ImagePlus className="h-4 w-4" />}
                  variant="flat"
                  onPress={() => createImagesInputRef.current?.click()}
                >
                  Adicionar imagens
                </Button>
              </div>
              {newImages.length > 0 ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {newImages.map((file, index) => (
                    <div
                      key={`${file.name}-${index}`}
                      className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-background/60 px-2 py-1"
                    >
                      <p className="truncate text-xs text-default-300">{file.name}</p>
                      <Button
                        isIconOnly
                        size="sm"
                        variant="light"
                        onPress={() =>
                          setNewImages((previous) =>
                            previous.filter((_, currentIndex) => currentIndex !== index),
                          )
                        }
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-default-500">Nenhuma imagem selecionada.</p>
              )}

              {isCreating && newImages.length > 0 ? (
                <UploadProgress
                  label="Enviando imagens do ticket"
                  description="As imagens estão sendo anexadas à abertura do chamado."
                />
              ) : null}
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={closeCreateModal}>
              Cancelar
            </Button>
            <Button
              color="primary"
              isLoading={isCreating}
              onPress={handleCreateTicket}
            >
              Abrir ticket
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={isThreadOpen} scrollBehavior="inside" size="5xl" onClose={closeThread}>
        <ModalContent>
          <ModalHeader className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-base font-semibold text-white">
                {selectedTicket?.title ?? "Detalhes do ticket"}
              </p>
              <div className="flex flex-wrap gap-1">
                {selectedTicket ? (
                  <>
                    <Chip color={getStatusColor(selectedTicket.status)} size="sm" variant="flat">
                      {getStatusLabel(selectedTicket.status)}
                    </Chip>
                    <Chip color={getPriorityColor(selectedTicket.priority)} size="sm" variant="flat">
                      {getPriorityLabel(selectedTicket.priority)}
                    </Chip>
                    <Chip size="sm" variant="bordered">
                      {getSupportLevelLabel(selectedTicket.supportLevel)}
                    </Chip>
                  </>
                ) : null}
              </div>
            </div>
            {selectedTicket ? (
              <p className="text-xs text-default-400">#{selectedTicket.id}</p>
            ) : null}
          </ModalHeader>

          <ModalBody>
            {isLoadingThread || !selectedTicket ? (
              <div className="flex min-h-56 items-center justify-center">
                <Spinner label="Carregando conversa..." />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-3 rounded-xl border border-white/10 bg-background/40 p-3 text-xs text-default-300 sm:grid-cols-5">
                  <div>
                    <p className="uppercase tracking-[0.16em] text-default-500">Abertura</p>
                    <p>{formatDateTime(selectedTicket.createdAt)}</p>
                  </div>
                  <div>
                    <p className="uppercase tracking-[0.16em] text-default-500">Última atualização</p>
                    <p>{formatDateTime(selectedTicket.updatedAt)}</p>
                  </div>
                  <div>
                    <p className="uppercase tracking-[0.16em] text-default-500">Tempo de atendimento</p>
                    <p key={threadClockTick}>
                      {formatElapsedTime(
                        selectedTicket.createdAt,
                        selectedTicket.closedAt,
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="uppercase tracking-[0.16em] text-default-500">Status</p>
                    <p>{getStatusLabel(selectedTicket.status)}</p>
                  </div>
                  <div>
                    <p className="uppercase tracking-[0.16em] text-default-500">Solicitante</p>
                    <Tooltip content={selectedTicket.requester.email}>
                      <p className="truncate">{selectedTicket.requester.name}</p>
                    </Tooltip>
                  </div>
                </div>

                {selectedTicket.status === TicketStatus.CLOSED ? (
                  <div className="rounded-xl border border-success/30 bg-success/10 p-3 text-sm text-success-200">
                    <p className="font-semibold text-success-100">
                      Chat finalizado pelo suporte
                    </p>
                    <p className="mt-1 text-xs text-success-200">
                      Encerrado em {formatDateTime(selectedTicket.closedAt)}. Este chat está bloqueado para novas mensagens.
                    </p>
                    {selectedTicket.resolutionOutcome ? (
                      <p className="mt-1 text-xs text-success-200">
                        Desfecho: {RESOLUTION_OUTCOME_LABELS[selectedTicket.resolutionOutcome]}
                        {selectedTicket.closureCategory
                          ? ` · Categoria: ${getCategoryLabel(selectedTicket.closureCategory)}`
                          : ""}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {canManage ? (
                  <div className="flex flex-wrap items-end gap-2 rounded-xl border border-white/10 bg-background/40 p-3">
                    <Select
                      className="min-w-[220px]"
                      isDisabled={selectedTicket.status === TicketStatus.CLOSED}
                      label="Status do ticket"
                      selectedKeys={
                        statusDraft && statusDraft !== TicketStatus.CLOSED
                          ? [statusDraft]
                          : []
                      }
                      onSelectionChange={(keys) => {
                        const nextStatus =
                          (Array.from(keys)[0] as TicketStatus) ?? selectedTicket.status;
                        setStatusDraft(nextStatus);
                        if (nextStatus !== TicketStatus.WAITING_EXTERNAL) {
                          setStatusReasonDraft("");
                        }
                      }}
                    >
                      {STATUS_OPTIONS.filter(
                        (option) =>
                          option.key !== "ALL" && option.key !== TicketStatus.CLOSED,
                      ).map(
                        (option) => (
                          <SelectItem key={option.key} textValue={option.label}>
                            {option.label}
                          </SelectItem>
                        ),
                      )}
                    </Select>
                    {statusDraft === TicketStatus.WAITING_EXTERNAL ? (
                      <Textarea
                        className="min-w-[280px] flex-1"
                        isRequired
                        label="Motivo (obrigatório)"
                        minRows={2}
                        placeholder="Ex.: aguardando posicionamento do tribunal ou retorno de integração externa."
                        value={statusReasonDraft}
                        onValueChange={setStatusReasonDraft}
                      />
                    ) : null}
                    <Button
                      color="primary"
                      isDisabled={
                        selectedTicket.status === TicketStatus.CLOSED ||
                        !statusDraft ||
                        statusDraft === selectedTicket.status ||
                        (statusDraft === TicketStatus.WAITING_EXTERNAL &&
                          !statusReasonDraft.trim())
                      }
                      isLoading={isSavingStatus}
                      onPress={handleSaveStatus}
                    >
                      Atualizar status
                    </Button>
                    <div className="w-full rounded-lg border border-white/10 bg-background/70 p-2 text-xs text-default-300">
                      <p className="mb-1 uppercase tracking-[0.12em] text-default-500">
                        Guia de transição de status
                      </p>
                      <div className="space-y-1">
                        {STATUS_TRANSITION_GUIDE.map((item) => (
                          <p key={item.title}>
                            <span className="font-semibold text-default-100">{item.title}:</span>{" "}
                            {item.description}
                          </p>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}

                <Divider className="border-white/10" />

                <div className="max-h-[45vh] space-y-3 overflow-y-auto rounded-xl border border-white/10 bg-background/40 p-3">
                  {selectedTicket.messages.length === 0 ? (
                    <div className="py-8 text-center text-sm text-default-400">
                      Ainda não há mensagens neste ticket.
                    </div>
                  ) : (
                    selectedTicket.messages.map((message) => {
                      const fromSupport = isSupportMessage(message.authorType);

                      return (
                        <div
                          key={message.id}
                          className={`flex ${fromSupport ? "justify-start" : "justify-end"}`}
                        >
                          <div
                            className={`w-full max-w-3xl rounded-xl border p-3 ${
                              fromSupport
                                ? "border-primary/40 bg-primary/15"
                                : "border-success/40 bg-success/15"
                            }`}
                          >
                            <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
                              <span className="font-semibold text-foreground">
                                {message.author.name}
                              </span>
                              <span className="text-default-600">
                                {formatDateTime(message.createdAt)}
                              </span>
                              {message.isInternal ? (
                                <Chip color="warning" size="sm" variant="flat">
                                  Interna
                                </Chip>
                              ) : null}
                            </div>
                            <p className="break-words whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                              {message.content}
                            </p>
                            {message.attachments.length > 0 ? (
                              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                                {message.attachments.map((attachment) => (
                                  <a
                                    key={attachment.id}
                                    className="block overflow-hidden rounded-lg border border-white/10"
                                    href={attachment.url}
                                    rel="noreferrer"
                                    target="_blank"
                                  >
                                    <img
                                      alt={attachment.originalName}
                                      className="h-24 w-full object-cover"
                                      loading="lazy"
                                      src={attachment.url}
                                    />
                                  </a>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="space-y-2">
                  <input
                    ref={replyImagesInputRef}
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    multiple
                    type="file"
                    onChange={(event) => appendImages(replyImages, event, setReplyImages)}
                  />
                  <Textarea
                    isDisabled={selectedTicket.status === TicketStatus.CLOSED}
                    minRows={4}
                    placeholder={
                      selectedTicket.status === TicketStatus.CLOSED
                        ? "Chat finalizado. Mensagens bloqueadas."
                        : "Escreva sua mensagem para o suporte"
                    }
                    value={reply}
                    onValueChange={setReply}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      isDisabled={selectedTicket.status === TicketStatus.CLOSED}
                      size="sm"
                      startContent={<ImagePlus className="h-4 w-4" />}
                      variant="flat"
                      onPress={() => replyImagesInputRef.current?.click()}
                    >
                      Anexar imagens
                    </Button>
                    <p className="text-xs text-default-500">
                      Até {SUPPORT_MAX_IMAGES_PER_BATCH} imagens por envio
                    </p>
                  </div>
                  {replyImages.length > 0 ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {replyImages.map((file, index) => (
                        <div
                          key={`${file.name}-${index}`}
                          className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-background/60 px-2 py-1"
                        >
                          <p className="truncate text-xs text-default-300">{file.name}</p>
                          <Button
                            isIconOnly
                            size="sm"
                            variant="light"
                            onPress={() =>
                              setReplyImages((previous) =>
                                previous.filter((_, currentIndex) => currentIndex !== index),
                              )
                            }
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {isSendingReply && replyImages.length > 0 ? (
                    <UploadProgress
                      label="Enviando imagens da resposta"
                      description="Os anexos estão sendo enviados junto com a sua mensagem."
                    />
                  ) : null}
                  <div className="flex justify-end">
                    <Button
                      color="primary"
                      isDisabled={selectedTicket.status === TicketStatus.CLOSED}
                      isLoading={isSendingReply}
                      startContent={isSendingReply ? undefined : <MessageSquare className="h-4 w-4" />}
                      onPress={handleSendReply}
                    >
                      Enviar mensagem
                    </Button>
                  </div>
                </div>

                {selectedTicket.status === TicketStatus.CLOSED ? (
                  <div className="space-y-3 rounded-xl border border-white/10 bg-background/40 p-3">
                    <p className="text-sm font-semibold text-white">Avalie este atendimento</p>
                    <div className="flex flex-wrap gap-2">
                      {[1, 2, 3, 4, 5].map((score) => (
                        <Button
                          key={score}
                          color={ratingDraft === score ? "warning" : "default"}
                          size="sm"
                          variant={ratingDraft === score ? "solid" : "flat"}
                          onPress={() => setRatingDraft(score)}
                        >
                          {score} estrela{score > 1 ? "s" : ""}
                        </Button>
                      ))}
                    </div>
                    <Textarea
                      description="Comentário opcional sobre o atendimento."
                      label="Comentário da avaliação"
                      minRows={2}
                      placeholder="Ex.: atendimento rápido e objetivo."
                      value={ratingCommentDraft}
                      onValueChange={setRatingCommentDraft}
                    />
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-default-400">
                        {selectedTicket.requesterRatedAt
                          ? `Última avaliação em ${formatDateTime(selectedTicket.requesterRatedAt)}`
                          : "Sua avaliação ficará registrada para melhoria contínua do suporte."}
                      </p>
                      <Button
                        color="primary"
                        isLoading={isSavingRating}
                        onPress={handleSubmitRating}
                      >
                        {selectedTicket.requesterRating ? "Atualizar avaliação" : "Enviar avaliação"}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </ModalBody>

          <ModalFooter>
            <Button variant="light" onPress={closeThread}>
              Fechar
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {!isLoadingStats && stats && stats.pendingRequester > 0 ? (
        <div className="rounded-xl border border-primary/30 bg-primary/10 p-3 text-xs text-primary-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            <p>
              Você tem {stats.pendingRequester} ticket(s) aguardando retorno do escritório.
            </p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
