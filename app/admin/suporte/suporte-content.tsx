"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import useSWR from "swr";
import { useRouter } from "next/navigation";
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
  useDisclosure,
} from "@heroui/react";
import { UploadProgress } from "@/components/ui/upload-progress";
import {
  AlertCircle,
  ArrowRightLeft,
  Bell,
  CheckCircle2,
  Clock3,
  Filter,
  ImagePlus,
  LifeBuoy,
  MessageSquare,
  PauseCircle,
  RefreshCw,
  Search,
  ShieldAlert,
  Timer,
  WifiOff,
  X,
  Zap,
  UserRoundCheck,
} from "lucide-react";
import { toast } from "sonner";

import {
  addSupportMessageWithImages,
  addSupportMessage,
  claimSupportTicket,
  getGlobalSupportStats,
  getGlobalSupportTickets,
  getSupportSuperAdminAgents,
  getSupportTenantOptions,
  getSupportTicketThread,
  markSupportTicketViewed,
  finalizeSupportTicket,
  updateSupportTicketRouting,
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
import { SearchableSelect } from "@/components/searchable-select";

const STATUS_OPTIONS: Array<{ key: TicketStatus | "ALL"; label: string }> = [
  { key: "ALL", label: "Todos os status" },
  { key: TicketStatus.OPEN, label: "Aberto" },
  { key: TicketStatus.IN_PROGRESS, label: "Em andamento" },
  { key: TicketStatus.WAITING_CUSTOMER, label: "Aguardando cliente" },
  { key: TicketStatus.WAITING_EXTERNAL, label: "Aguardando terceiro" },
  { key: TicketStatus.RESOLVED, label: "Resolvido" },
  { key: TicketStatus.CLOSED, label: "Encerrado" },
];

const PRIORITY_OPTIONS: Array<{ key: TicketPriority | "ALL"; label: string }> =
  [
    { key: "ALL", label: "Todas as prioridades" },
    { key: TicketPriority.LOW, label: "Baixa" },
    { key: TicketPriority.MEDIUM, label: "Média" },
    { key: TicketPriority.HIGH, label: "Alta" },
    { key: TicketPriority.URGENT, label: "Urgente" },
  ];

const CATEGORY_OPTIONS: Array<{ key: TicketCategory | "ALL"; label: string }> =
  [
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
  {
    title: "Aberto",
    description: "Ticket recém-criado, sem tratativa iniciada.",
  },
  { title: "Em andamento", description: "Atendimento ativo pelo suporte." },
  {
    title: "Aguardando cliente",
    description: "Depende de retorno do solicitante.",
  },
  {
    title: "Aguardando terceiro",
    description:
      "Depende de agente externo (tribunal/integrador/fornecedor). Motivo obrigatório.",
  },
  {
    title: "Resolvido",
    description: "Solução aplicada, aguardando confirmação final.",
  },
  { title: "Encerrado", description: "Ciclo finalizado sem pendências." },
];
const SUPPORT_REPLY_MACROS: Array<{
  key: "HANDOFF_INTERNAL" | "RETURN_TO_CUSTOMER";
  label: string;
  isInternal: boolean;
  content: string;
}> = [
  {
    key: "HANDOFF_INTERNAL",
    label: "Macro: Handoff interno",
    isInternal: true,
    content:
      "Encaminhando este caso para o time especializado. Assim que houver retorno técnico, atualizaremos o ticket.",
  },
  {
    key: "RETURN_TO_CUSTOMER",
    label: "Macro: Retorno ao cliente",
    isInternal: false,
    content:
      "Recebemos sua solicitação e já iniciamos a tratativa. Seguiremos atualizando este ticket com os próximos passos.",
  },
];
const RESOLUTION_OUTCOME_OPTIONS: Array<{
  key: TicketResolutionOutcome;
  label: string;
}> = [
  { key: TicketResolutionOutcome.RESOLVED, label: "Resolvido" },
  {
    key: TicketResolutionOutcome.PARTIALLY_RESOLVED,
    label: "Parcialmente resolvido",
  },
  { key: TicketResolutionOutcome.UNRESOLVED, label: "Não resolvido" },
];

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
    SUPPORT_LEVEL_OPTIONS.find((option) => option.key === level)?.label ?? level
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

function getQueueLabel(ticket: {
  status: TicketStatus;
  waitingFor: "SUPPORT" | "REQUESTER" | "NONE";
}): string {
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
    return "Aguardando cliente";
  }

  return "Em andamento";
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";

  return new Date(value).toLocaleString("pt-BR");
}

function formatDuration(minutes: number | null) {
  if (minutes === null || Number.isNaN(minutes)) {
    return "Sem resposta";
  }

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  return rest > 0 ? `${hours}h ${rest}min` : `${hours}h`;
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

function isSupportMessage(authorType: string) {
  return authorType === "SUPER_ADMIN" || authorType === "SYSTEM";
}

type SupportAvailability = "AVAILABLE" | "BUSY" | "LUNCH_BREAK" | "OFFLINE";

function getSaoPauloHour(date: Date): number {
  const hourPart = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    hour12: false,
    timeZone: "America/Sao_Paulo",
  })
    .formatToParts(date)
    .find((part) => part.type === "hour")?.value;

  const parsed = Number(hourPart ?? "0");
  return Number.isNaN(parsed) ? 0 : parsed;
}

function getAvailabilityMeta(status: SupportAvailability): {
  label: string;
  description: string;
  color: "success" | "warning" | "default" | "danger";
  icon: ReactNode;
} {
  switch (status) {
    case "BUSY":
      return {
        label: "Em atendimento",
        description: "Você possui tickets ativos atribuídos.",
        color: "warning",
        icon: <Clock3 className="h-3.5 w-3.5" />,
      };
    case "LUNCH_BREAK":
      return {
        label: "Pausa para almoço",
        description: "Faixa automática de almoço sem ticket ativo atribuído.",
        color: "default",
        icon: <PauseCircle className="h-3.5 w-3.5" />,
      };
    case "OFFLINE":
      return {
        label: "Indisponível",
        description: "Sem conexão detectada no navegador.",
        color: "danger",
        icon: <WifiOff className="h-3.5 w-3.5" />,
      };
    default:
      return {
        label: "Disponível",
        description: "Online e sem ticket ativo atribuído no momento.",
        color: "success",
        icon: <Zap className="h-3.5 w-3.5" />,
      };
  }
}

export function SuporteContent() {
  const router = useRouter();
  const { data: session } = useSession();
  const currentSuperAdminId = String((session?.user as any)?.id ?? "");
  const [isBrowserOnline, setIsBrowserOnline] = useState(true);
  const [clockTick, setClockTick] = useState(() => Date.now());

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
  const [tenantFilter, setTenantFilter] = useState<string>("ALL");
  const [assignedToMe, setAssignedToMe] = useState(false);
  const [assignedOnly, setAssignedOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);

  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [isInternalReply, setIsInternalReply] = useState(false);
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [replyImages, setReplyImages] = useState<File[]>([]);
  const replyImagesInputRef = useRef<HTMLInputElement | null>(null);

  const [statusDraft, setStatusDraft] = useState<TicketStatus | "">("");
  const [statusReasonDraft, setStatusReasonDraft] = useState("");
  const [routingLevelDraft, setRoutingLevelDraft] = useState<
    TicketSupportLevel | ""
  >("");
  const [routingAssigneeDraft, setRoutingAssigneeDraft] = useState<string>("");
  const [closureCategoryDraft, setClosureCategoryDraft] = useState<
    TicketCategory | ""
  >("");
  const [resolutionOutcomeDraft, setResolutionOutcomeDraft] =
    useState<TicketResolutionOutcome>(TicketResolutionOutcome.RESOLVED);
  const [closureSummaryDraft, setClosureSummaryDraft] = useState("");
  const [threadClockTick, setThreadClockTick] = useState(() => Date.now());

  const [isSavingStatus, setIsSavingStatus] = useState(false);
  const [isSavingRouting, setIsSavingRouting] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);

  const {
    isOpen: isThreadOpen,
    onOpen: onThreadOpen,
    onClose: onThreadClose,
  } = useDisclosure();
  const {
    isOpen: isQueueOpen,
    onOpen: onQueueOpen,
    onClose: onQueueClose,
  } = useDisclosure();

  const seenQueueTicketIdsRef = useRef<Set<string>>(new Set());
  const seenAssignedToMeTicketIdsRef = useRef<Set<string>>(new Set());
  const queueNotifierReadyRef = useRef(false);
  const assignedNotifierReadyRef = useRef(false);

  const hasActiveFilters =
    query.trim().length > 0 ||
    statusFilter !== "ALL" ||
    priorityFilter !== "ALL" ||
    categoryFilter !== "ALL" ||
    supportLevelFilter !== "ALL" ||
    tenantFilter !== "ALL" ||
    assignedToMe ||
    assignedOnly;

  useEffect(() => {
    setPage(1);
  }, [
    query,
    statusFilter,
    priorityFilter,
    categoryFilter,
    supportLevelFilter,
    tenantFilter,
    assignedToMe,
    assignedOnly,
  ]);

  const {
    data: stats,
    isLoading: isLoadingStats,
    mutate: mutateStats,
  } = useSWR("global-support-stats", () => getGlobalSupportStats(), {
    revalidateOnFocus: true,
    refreshInterval: SUPPORT_POLL_INTERVAL_MS,
    dedupingInterval: 1000,
  });

  const {
    data: listData,
    isLoading: isLoadingList,
    mutate: mutateList,
  } = useSWR(
    [
      "global-support-list",
      page,
      pageSize,
      query,
      statusFilter,
      priorityFilter,
      categoryFilter,
      supportLevelFilter,
      tenantFilter,
      assignedToMe,
      assignedOnly,
    ],
    () =>
      getGlobalSupportTickets({
        page,
        pageSize,
        query,
        status: statusFilter,
        priority: priorityFilter,
        category: categoryFilter,
        supportLevel: supportLevelFilter,
        tenantId: tenantFilter,
        assignedToMe,
        assignedOnly,
      }),
    {
      revalidateOnFocus: true,
      refreshInterval: SUPPORT_POLL_INTERVAL_MS,
      dedupingInterval: 1000,
      keepPreviousData: true,
    },
  );

  const { data: queueRealtimeData, mutate: mutateQueueRealtime } = useSWR(
    "global-support-realtime-queue",
    () =>
      getGlobalSupportTickets({
        page: 1,
        pageSize: 50,
        status: "ALL",
        priority: "ALL",
        category: "ALL",
        supportLevel: "ALL",
        tenantId: "ALL",
      }),
    {
      revalidateOnFocus: true,
      refreshInterval: SUPPORT_POLL_INTERVAL_MS,
      dedupingInterval: 1000,
    },
  );

  const { data: tenants } = useSWR(
    "support-tenants",
    () => getSupportTenantOptions(),
    {
      revalidateOnFocus: false,
    },
  );

  const { data: agents } = useSWR(
    "support-agents",
    () => getSupportSuperAdminAgents(),
    {
      revalidateOnFocus: false,
    },
  );

  const tenantSelectItems = useMemo(
    () => [
      { key: "ALL", label: "Todos os tenants" },
      ...(tenants ?? []).map((tenant) => ({
        key: tenant.id,
        label: tenant.name,
      })),
    ],
    [tenants],
  );

  const assigneeSelectItems = useMemo(
    () => [
      { key: "unassigned", label: "Não atribuído" },
      ...(agents ?? []).map((agent) => ({
        key: agent.id,
        label: agent.name,
      })),
    ],
    [agents],
  );
  const tenantFilterOptions = useMemo(
    () =>
      tenantSelectItems.map((item) => ({
        key: item.key,
        label: item.label,
        textValue: item.label,
      })),
    [tenantSelectItems],
  );
  const assigneeFilterOptions = useMemo(
    () =>
      assigneeSelectItems.map((item) => ({
        key: item.key,
        label: item.label,
        textValue: item.label,
      })),
    [assigneeSelectItems],
  );

  const {
    data: selectedTicket,
    isLoading: isLoadingThread,
    mutate: mutateThread,
  } = useSWR(
    selectedTicketId ? ["global-support-thread", selectedTicketId] : null,
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
      setRoutingLevelDraft("");
      setRoutingAssigneeDraft("");
      setClosureCategoryDraft("");
      setResolutionOutcomeDraft(TicketResolutionOutcome.RESOLVED);
      setClosureSummaryDraft("");
      return;
    }

    setStatusDraft(selectedTicket.status);
    setStatusReasonDraft("");
    setRoutingLevelDraft(selectedTicket.supportLevel);
    setRoutingAssigneeDraft(selectedTicket.assignedTo?.id ?? "");
    setClosureCategoryDraft(
      selectedTicket.closureCategory ?? selectedTicket.category,
    );
    setResolutionOutcomeDraft(
      selectedTicket.resolutionOutcome ?? TicketResolutionOutcome.RESOLVED,
    );
    setClosureSummaryDraft(selectedTicket.closureSummary ?? "");
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
        void mutateQueueRealtime();
        void mutateThread();
      })
      .catch(() => {
        // silencioso
      });
  }, [
    selectedTicket?.id,
    isThreadOpen,
    mutateList,
    mutateQueueRealtime,
    mutateThread,
  ]);

  const tickets = listData?.items ?? [];
  const queueSourceTickets = queueRealtimeData?.items ?? [];

  const queueTickets = useMemo(
    () =>
      queueSourceTickets.filter(
        (ticket) =>
          ticket.waitingFor === "SUPPORT" && ticket.assignedTo === null,
      ),
    [queueSourceTickets],
  );

  const assignedToMeTickets = useMemo(
    () =>
      queueSourceTickets.filter(
        (ticket) =>
          ticket.waitingFor === "SUPPORT" &&
          ticket.assignedTo?.id === currentSuperAdminId,
      ),
    [queueSourceTickets, currentSuperAdminId],
  );

  const queueTotal = queueTickets.length;

  const showTicketActionToast = useCallback(
    (data: {
      ticketId: string;
      title: string;
      tenantName: string;
      type: "queue" | "assigned";
    }) => {
      const toastId = toast.custom((id) => (
        <div className="w-[min(92vw,440px)] rounded-2xl border border-white/15 bg-content1 p-3 shadow-2xl">
          <div className="flex items-start gap-3">
            <div
              className={`mt-0.5 rounded-full p-2 ${
                data.type === "assigned"
                  ? "bg-success/20 text-success"
                  : "bg-primary/20 text-primary"
              }`}
            >
              {data.type === "assigned" ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <Bell className="h-4 w-4" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white">
                {data.type === "assigned"
                  ? "Ticket atribuído para você"
                  : "Cliente aguardando no chat"}
              </p>
              <p className="line-clamp-2 text-sm text-default-300">
                {data.tenantName} · {data.title}
              </p>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-end gap-2">
            <Button size="sm" variant="flat" onPress={() => toast.dismiss(id)}>
              Dispensar
            </Button>
            <Button
              color="primary"
              size="sm"
              onPress={() => {
                setSelectedTicketId(data.ticketId);
                onThreadOpen();
                toast.dismiss(id);
              }}
            >
              Ver ticket
            </Button>
          </div>
        </div>
      ));

      return toastId;
    },
    [onThreadOpen],
  );

  useEffect(() => {
    if (typeof navigator !== "undefined") {
      setIsBrowserOnline(navigator.onLine);
    }
  }, []);

  useEffect(() => {
    const handleOnline = () => setIsBrowserOnline(true);
    const handleOffline = () => setIsBrowserOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setClockTick(Date.now());
    }, 60_000);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  const supportAvailability = useMemo<SupportAvailability>(() => {
    if (!isBrowserOnline) {
      return "OFFLINE";
    }

    if (assignedToMeTickets.length > 0) {
      return "BUSY";
    }

    const hour = getSaoPauloHour(new Date(clockTick));
    if (hour >= 12 && hour < 14) {
      return "LUNCH_BREAK";
    }

    return "AVAILABLE";
  }, [assignedToMeTickets.length, clockTick, isBrowserOnline]);

  const supportAvailabilityMeta = useMemo(
    () => getAvailabilityMeta(supportAvailability),
    [supportAvailability],
  );

  const queueInsights = useMemo(
    () => ({
      unassigned: queueTickets.length,
      assignedToMe: assignedToMeTickets.length,
      breachedInView: tickets.filter((ticket) => ticket.slaBreached).length,
      unreadInView: tickets.filter((ticket) => ticket.hasUnreadForSupport)
        .length,
    }),
    [assignedToMeTickets.length, queueTickets.length, tickets],
  );

  useEffect(() => {
    if (!queueNotifierReadyRef.current) {
      queueNotifierReadyRef.current = true;
      seenQueueTicketIdsRef.current = new Set(
        queueTickets.map((ticket) => ticket.id),
      );
      return;
    }

    if (queueTickets.length === 0) {
      seenQueueTicketIdsRef.current.clear();
      return;
    }

    for (const ticket of queueTickets) {
      if (seenQueueTicketIdsRef.current.has(ticket.id)) {
        continue;
      }

      seenQueueTicketIdsRef.current.add(ticket.id);
      showTicketActionToast({
        ticketId: ticket.id,
        tenantName: ticket.tenant.name,
        title: ticket.title,
        type: "queue",
      });
    }

    const active = new Set(queueTickets.map((ticket) => ticket.id));

    for (const id of Array.from(seenQueueTicketIdsRef.current)) {
      if (!active.has(id)) {
        seenQueueTicketIdsRef.current.delete(id);
      }
    }
  }, [queueTickets, showTicketActionToast]);

  useEffect(() => {
    if (!currentSuperAdminId) {
      return;
    }

    if (!assignedNotifierReadyRef.current) {
      assignedNotifierReadyRef.current = true;
      seenAssignedToMeTicketIdsRef.current = new Set(
        assignedToMeTickets.map((ticket) => ticket.id),
      );
      return;
    }

    for (const ticket of assignedToMeTickets) {
      if (seenAssignedToMeTicketIdsRef.current.has(ticket.id)) {
        continue;
      }

      seenAssignedToMeTicketIdsRef.current.add(ticket.id);
      showTicketActionToast({
        ticketId: ticket.id,
        tenantName: ticket.tenant.name,
        title: ticket.title,
        type: "assigned",
      });
    }

    const active = new Set(assignedToMeTickets.map((ticket) => ticket.id));

    for (const id of Array.from(seenAssignedToMeTicketIdsRef.current)) {
      if (!active.has(id)) {
        seenAssignedToMeTicketIdsRef.current.delete(id);
      }
    }
  }, [assignedToMeTickets, currentSuperAdminId, showTicketActionToast]);

  const openThread = (ticketId: string) => {
    setSelectedTicketId(ticketId);
    onThreadOpen();
  };

  const closeThread = () => {
    onThreadClose();
    setSelectedTicketId(null);
    setReply("");
    setReplyImages([]);
    setIsInternalReply(false);
    setStatusReasonDraft("");
    setClosureSummaryDraft("");
  };

  const openThreadFullscreen = (ticketId: string) => {
    const returnTo = "/admin/suporte";
    router.push(
      `/admin/suporte/chat/${ticketId}?returnTo=${encodeURIComponent(returnTo)}`,
    );
  };

  const appendImages = (
    current: File[],
    event: ChangeEvent<HTMLInputElement>,
    setter: Dispatch<SetStateAction<File[]>>,
  ) => {
    const incoming = Array.from(event.target.files ?? []);

    if (!incoming.length) return;

    const merged = [...current, ...incoming].slice(
      0,
      SUPPORT_MAX_IMAGES_PER_BATCH,
    );

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
    setTenantFilter("ALL");
    setAssignedToMe(false);
    setAssignedOnly(false);
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
        formData.append("isInternal", String(isInternalReply));
        replyImages.forEach((file) => formData.append("images", file));
        await addSupportMessageWithImages(selectedTicket.id, formData);
      } else {
        await addSupportMessage(selectedTicket.id, {
          content: reply,
          isInternal: isInternalReply,
        });
      }

      setReply("");
      setReplyImages([]);
      setIsInternalReply(false);

      await Promise.all([
        mutateThread(),
        mutateList(),
        mutateQueueRealtime(),
        mutateStats(),
      ]);
      toast.success("Resposta enviada.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao enviar";
      toast.error(message);
    } finally {
      setIsSendingReply(false);
    }
  };

  const handleSaveStatus = async () => {
    if (!selectedTicket?.id || !statusDraft) return;

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
      await Promise.all([
        mutateThread(),
        mutateList(),
        mutateQueueRealtime(),
        mutateStats(),
      ]);
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

  const handleSaveRouting = async () => {
    if (!selectedTicket?.id || !routingLevelDraft) return;

    if (selectedTicket.status === TicketStatus.CLOSED) {
      toast.error(
        "Chat finalizado. Reabra o ticket antes de alterar roteamento.",
      );
      return;
    }

    setIsSavingRouting(true);

    try {
      await updateSupportTicketRouting(selectedTicket.id, {
        supportLevel: routingLevelDraft,
        assignedToSuperAdminId: routingAssigneeDraft || null,
      });

      await Promise.all([
        mutateThread(),
        mutateList(),
        mutateQueueRealtime(),
        mutateStats(),
      ]);
      toast.success("Roteamento salvo.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro ao salvar roteamento";
      toast.error(message);
    } finally {
      setIsSavingRouting(false);
    }
  };

  const handleFinalizeTicket = async () => {
    if (!selectedTicket?.id) return;

    if (selectedTicket.status === TicketStatus.CLOSED) {
      toast.warning("Este ticket já está encerrado.");
      return;
    }

    if (!closureCategoryDraft) {
      toast.error("Selecione a categoria de fechamento.");
      return;
    }

    if (!resolutionOutcomeDraft) {
      toast.error("Selecione o desfecho do atendimento.");
      return;
    }

    setIsFinalizing(true);

    try {
      await finalizeSupportTicket(selectedTicket.id, {
        closureCategory: closureCategoryDraft,
        resolutionOutcome: resolutionOutcomeDraft,
        closureSummary: closureSummaryDraft.trim() || undefined,
      });

      await Promise.all([
        mutateThread(),
        mutateList(),
        mutateQueueRealtime(),
        mutateStats(),
      ]);
      toast.success("Atendimento finalizado e chat bloqueado.");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Erro ao finalizar atendimento";
      toast.error(message);
    } finally {
      setIsFinalizing(false);
    }
  };

  const handleClaimTicket = async (ticketId: string) => {
    if (!currentSuperAdminId) {
      toast.error("Sessão inválida para assumir ticket.");
      return;
    }

    try {
      const result = await claimSupportTicket(ticketId);

      if (!result.claimed) {
        toast.warning(
          result.assignedToName
            ? `Ticket já assumido por ${result.assignedToName}.`
            : "Ticket já foi assumido por outro agente.",
        );
      } else {
        toast.success("Ticket assumido com sucesso.");
      }

      await Promise.all([
        mutateList(),
        mutateQueueRealtime(),
        mutateStats(),
        mutateThread(),
      ]);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro ao assumir ticket";
      toast.error(message);
    }
  };

  const handleInviteAssignedAgent = async () => {
    if (!selectedTicket?.id || !routingAssigneeDraft) {
      toast.error("Selecione um agente para convidar.");
      return;
    }

    const agent = (agents ?? []).find(
      (candidate) => candidate.id === routingAssigneeDraft,
    );

    try {
      await updateSupportTicketRouting(selectedTicket.id, {
        supportLevel: routingLevelDraft || selectedTicket.supportLevel,
        assignedToSuperAdminId: routingAssigneeDraft,
      });

      await addSupportMessage(selectedTicket.id, {
        content: `Convite interno: ${agent?.name ?? "agente selecionado"}, favor assumir este atendimento.`,
        isInternal: true,
      });

      await Promise.all([
        mutateList(),
        mutateQueueRealtime(),
        mutateStats(),
        mutateThread(),
      ]);
      toast.success("Convite interno enviado para o suporte.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro ao convidar agente";
      toast.error(message);
    }
  };

  const applyReplyMacro = (macro: (typeof SUPPORT_REPLY_MACROS)[number]) => {
    setReply(macro.content);
    setIsInternalReply(macro.isInternal);
  };

  return (
    <section className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 py-8 px-3 sm:px-6">
      <PeoplePageHeader
        tag="Administração"
        title="Suporte operacional"
        description="Fila global de tickets por tenant, com foco em SLA, retenção e resposta operacional em tempo real."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Chip
              color={supportAvailabilityMeta.color}
              size="sm"
              startContent={supportAvailabilityMeta.icon}
              variant="flat"
            >
              Disponibilidade: {supportAvailabilityMeta.label}
            </Chip>
            <div className="relative inline-flex">
              <Button
                className="overflow-visible"
                size="sm"
                startContent={<Bell className="h-4 w-4" />}
                variant="flat"
                onPress={onQueueOpen}
              >
                Painel de chats
              </Button>
              {queueTotal > 0 ? (
                <span className="pointer-events-none absolute -right-2 -top-2 z-20 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">
                  {queueTotal > 99 ? "99+" : queueTotal}
                </span>
              ) : null}
            </div>
          </div>
        }
      />

      <PeoplePanel
        title="Leitura de retenção"
        description="Antes de abrir a fila, veja onde a operação pode perder tempo, receita ou confiança do tenant."
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-background/30 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-default-500">
              Chats sem dono
            </p>
            <p className="mt-2 text-2xl font-semibold text-warning">
              {queueInsights.unassigned}
            </p>
            <p className="mt-1 text-xs text-default-400">
              Conversas aguardando alguém assumir.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-background/30 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-default-500">
              Em atendimento por você
            </p>
            <p className="mt-2 text-2xl font-semibold text-primary">
              {queueInsights.assignedToMe}
            </p>
            <p className="mt-1 text-xs text-default-400">
              Tickets ativos sob sua responsabilidade.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-background/30 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-default-500">
              SLA em risco na visão atual
            </p>
            <p className="mt-2 text-2xl font-semibold text-danger">
              {queueInsights.breachedInView}
            </p>
            <p className="mt-1 text-xs text-default-400">
              Tickets filtrados já fora do tempo ideal.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-background/30 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-default-500">
              Mensagens novas
            </p>
            <p className="mt-2 text-2xl font-semibold text-success">
              {queueInsights.unreadInView}
            </p>
            <p className="mt-1 text-xs text-default-400">
              Tickets no filtro atual com resposta pendente do suporte.
            </p>
          </div>
        </div>
      </PeoplePanel>

      <PeoplePanel
        title="Disponibilidade"
        description={supportAvailabilityMeta.description}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Chip
            color={supportAvailability === "AVAILABLE" ? "success" : "default"}
            size="sm"
            variant={supportAvailability === "AVAILABLE" ? "flat" : "bordered"}
          >
            Disponível
          </Chip>
          <Chip
            color={supportAvailability === "BUSY" ? "warning" : "default"}
            size="sm"
            variant={supportAvailability === "BUSY" ? "flat" : "bordered"}
          >
            Em atendimento
          </Chip>
          <Chip
            color={
              supportAvailability === "LUNCH_BREAK" ? "default" : "default"
            }
            size="sm"
            variant={
              supportAvailability === "LUNCH_BREAK" ? "flat" : "bordered"
            }
          >
            Pausa para almoço
          </Chip>
          <Chip
            color={supportAvailability === "OFFLINE" ? "danger" : "default"}
            size="sm"
            variant={supportAvailability === "OFFLINE" ? "flat" : "bordered"}
          >
            Indisponível
          </Chip>
        </div>
      </PeoplePanel>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <PeopleMetricCard
          label="Backlog total"
          value={isLoadingStats ? "..." : (stats?.total ?? 0)}
          helper="Chamados em base"
          tone="primary"
          icon={<LifeBuoy className="h-4 w-4" />}
        />
        <PeopleMetricCard
          label="Aguardando suporte"
          value={isLoadingStats ? "..." : (stats?.pendingSupport ?? 0)}
          helper="Fila de espera aguardando suporte"
          tone="warning"
          icon={<Clock3 className="h-4 w-4" />}
        />
        <PeopleMetricCard
          label="SLA estourado"
          value={isLoadingStats ? "..." : (stats?.slaBreached ?? 0)}
          helper="Escalonar imediatamente"
          tone="danger"
          icon={<ShieldAlert className="h-4 w-4" />}
        />
        <PeopleMetricCard
          label="1ª resposta média"
          value={
            isLoadingStats
              ? "..."
              : formatDuration(stats?.avgFirstResponseMinutes ?? 0)
          }
          helper="Tempo médio global"
          tone="success"
          icon={<Timer className="h-4 w-4" />}
        />
      </div>

      <PeoplePanel
        title="Filtros da fila"
        description="Refine por tenant, prioridade, categoria e status de atribuição."
        actions={
          <div className="flex flex-wrap gap-2">
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
                void mutateQueueRealtime();
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
            classNames={{ inputWrapper: "min-h-12" }}
            placeholder="Buscar por ticket, tenant, e-mail ou título"
            startContent={<Search className="h-4 w-4 text-default-400" />}
            value={query}
            onValueChange={setQuery}
          />

          <SearchableSelect
            classNames={{ selectorButton: "min-h-12" }}
            emptyContent="Nenhum tenant encontrado"
            isClearable={false}
            items={tenantFilterOptions}
            label="Tenant"
            selectedKey={tenantFilter}
            onSelectionChange={(selectedKey) =>
              setTenantFilter(selectedKey || "ALL")
            }
          />

          <Select
            classNames={{ trigger: "min-h-12" }}
            label="Status"
            selectedKeys={[statusFilter]}
            onSelectionChange={(keys) =>
              setStatusFilter(
                (Array.from(keys)[0] as TicketStatus | "ALL") || "ALL",
              )
            }
          >
            {STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.key} textValue={option.label}>
                {option.label}
              </SelectItem>
            ))}
          </Select>

          <Select
            classNames={{ trigger: "min-h-12" }}
            label="Prioridade"
            selectedKeys={[priorityFilter]}
            onSelectionChange={(keys) =>
              setPriorityFilter(
                (Array.from(keys)[0] as TicketPriority | "ALL") || "ALL",
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
            classNames={{ trigger: "min-h-12" }}
            label="Categoria"
            selectedKeys={[categoryFilter]}
            onSelectionChange={(keys) =>
              setCategoryFilter(
                (Array.from(keys)[0] as TicketCategory | "ALL") || "ALL",
              )
            }
          >
            {CATEGORY_OPTIONS.map((option) => (
              <SelectItem key={option.key} textValue={option.label}>
                {option.label}
              </SelectItem>
            ))}
          </Select>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-5">
          <Select
            classNames={{ trigger: "min-h-12" }}
            label="Fila de atendimento"
            selectedKeys={[supportLevelFilter]}
            onSelectionChange={(keys) =>
              setSupportLevelFilter(
                (Array.from(keys)[0] as TicketSupportLevel | "ALL") || "ALL",
              )
            }
          >
            {SUPPORT_LEVEL_OPTIONS.map((option) => (
              <SelectItem key={option.key} textValue={option.label}>
                {option.label}
              </SelectItem>
            ))}
          </Select>

          <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-background/40 px-3 py-2 lg:col-span-2">
            <Switch
              isSelected={assignedToMe}
              size="sm"
              onValueChange={setAssignedToMe}
            >
              Atribuídos a mim
            </Switch>
            <Switch
              isSelected={assignedOnly}
              size="sm"
              onValueChange={setAssignedOnly}
            >
              Apenas atribuídos
            </Switch>
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-background/40 px-3 py-2 lg:col-span-2">
            <span className="text-xs text-default-400">Por página</span>
            <Select
              className="w-28"
              classNames={{ trigger: "min-h-12" }}
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
        title="Fila global"
        description={`Total no resultado: ${listData?.total ?? 0} ticket(s).`}
      >
        {isLoadingList ? (
          <div className="flex min-h-44 items-center justify-center">
            <Spinner label="Carregando fila de suporte..." />
          </div>
        ) : tickets.length === 0 ? (
          <div className="flex min-h-44 flex-col items-center justify-center gap-2 text-center text-default-400">
            <AlertCircle className="h-5 w-5" />
            <p>Nenhum ticket encontrado para os filtros atuais.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {tickets.map((ticket) => (
                <PeopleEntityCard
                  key={ticket.id}
                  isPressable
                  onPress={() => openThread(ticket.id)}
                >
                  <PeopleEntityCardHeader className="items-start justify-between gap-2">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-white">
                        {ticket.title}
                      </p>
                      <p className="text-xs text-default-400">
                        #{ticket.id.slice(-8)} · {ticket.tenant.name}
                      </p>
                    </div>
                    <div className="flex flex-wrap justify-end gap-1">
                      <Chip
                        color={getStatusColor(ticket.status)}
                        size="sm"
                        variant="flat"
                      >
                        {getStatusLabel(ticket.status)}
                      </Chip>
                      <Chip
                        color={getPriorityColor(ticket.priority)}
                        size="sm"
                        variant="flat"
                      >
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
                        <p className="uppercase tracking-[0.12em]">
                          Solicitante
                        </p>
                        <p className="truncate text-default-200">
                          {ticket.requester.name}
                        </p>
                      </div>
                      <div>
                        <p className="uppercase tracking-[0.12em]">Categoria</p>
                        <p className="text-default-200">
                          {getCategoryLabel(ticket.category)}
                        </p>
                      </div>
                      <div>
                        <p className="uppercase tracking-[0.12em]">Fila</p>
                        <p className="text-default-200">
                          {getQueueLabel(ticket)}
                        </p>
                      </div>
                      <div>
                        <p className="uppercase tracking-[0.12em]">Atribuído</p>
                        <p className="truncate text-default-200">
                          {ticket.assignedTo?.name ?? "Não atribuído"}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {ticket.slaBreached ? (
                        <Chip color="danger" size="sm" variant="flat">
                          SLA fora do prazo
                        </Chip>
                      ) : (
                        <Chip color="success" size="sm" variant="flat">
                          SLA dentro do prazo
                        </Chip>
                      )}

                      {ticket.hasUnreadForSupport ? (
                        <Chip color="primary" size="sm" variant="flat">
                          Nova mensagem do tenant
                        </Chip>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {ticket.assignedTo?.id === currentSuperAdminId ? (
                        <Chip color="success" size="sm" variant="flat">
                          Em atendimento por você
                        </Chip>
                      ) : null}
                      {ticket.waitingFor === "SUPPORT" &&
                      ticket.assignedTo === null ? (
                        <Button
                          color="primary"
                          data-stop-card-press="true"
                          size="sm"
                          onPress={() => handleClaimTicket(ticket.id)}
                        >
                          Assumir chat
                        </Button>
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

      <Modal
        isOpen={isQueueOpen}
        scrollBehavior="inside"
        size="4xl"
        onClose={onQueueClose}
      >
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1">
            <p className="text-base font-semibold text-white">
              Painel de chats de suporte
            </p>
            <p className="text-xs text-default-400">
              Clientes aguardando resposta e tickets já assumidos por você.
            </p>
          </ModalHeader>
          <ModalBody className="space-y-4">
            <div className="rounded-xl border border-white/10 bg-background/40 p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-white">
                  Aguardando suporte
                </p>
                <Chip
                  color={queueTotal > 0 ? "danger" : "default"}
                  size="sm"
                  variant="flat"
                >
                  {queueTotal}
                </Chip>
              </div>

              {queueTickets.length === 0 ? (
                <p className="text-sm text-default-400">
                  Nenhum cliente aguardando neste momento.
                </p>
              ) : (
                <div className="space-y-2">
                  {queueTickets.map((ticket) => (
                    <div
                      key={ticket.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-background/60 p-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-white">
                          {ticket.tenant.name} · {ticket.title}
                        </p>
                        <p className="truncate text-xs text-default-400">
                          {ticket.requester.name} ·{" "}
                          {formatDateTime(ticket.updatedAt)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          color="primary"
                          data-stop-card-press="true"
                          size="sm"
                          onPress={() => handleClaimTicket(ticket.id)}
                        >
                          Assumir
                        </Button>
                        <Button
                          data-stop-card-press="true"
                          size="sm"
                          variant="flat"
                          onPress={() => {
                            onQueueClose();
                            openThread(ticket.id);
                          }}
                        >
                          Abrir
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-white/10 bg-background/40 p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-white">
                  Assumidos por você
                </p>
                <Chip
                  color={assignedToMeTickets.length > 0 ? "success" : "default"}
                  size="sm"
                  variant="flat"
                >
                  {assignedToMeTickets.length}
                </Chip>
              </div>

              {assignedToMeTickets.length === 0 ? (
                <p className="text-sm text-default-400">
                  Você ainda não assumiu nenhum atendimento pendente.
                </p>
              ) : (
                <div className="space-y-2">
                  {assignedToMeTickets.map((ticket) => (
                    <div
                      key={ticket.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-background/60 p-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-white">
                          {ticket.tenant.name} · {ticket.title}
                        </p>
                        <p className="truncate text-xs text-default-400">
                          {ticket.requester.name} ·{" "}
                          {formatDateTime(ticket.updatedAt)}
                        </p>
                      </div>
                      <Button
                        data-stop-card-press="true"
                        size="sm"
                        variant="flat"
                        onPress={() => {
                          onQueueClose();
                          openThread(ticket.id);
                        }}
                      >
                        Abrir chat
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={onQueueClose}>
              Fechar
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal
        isOpen={isThreadOpen}
        scrollBehavior="inside"
        size="5xl"
        onClose={closeThread}
      >
        <ModalContent>
          <ModalHeader className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-base font-semibold text-white">
                {selectedTicket?.title ?? "Detalhes do ticket"}
              </p>
              <div className="flex flex-wrap items-center gap-1">
                {selectedTicket ? (
                  <>
                    <Chip
                      color={getStatusColor(selectedTicket.status)}
                      size="sm"
                      variant="flat"
                    >
                      {getStatusLabel(selectedTicket.status)}
                    </Chip>
                    <Chip
                      color={getPriorityColor(selectedTicket.priority)}
                      size="sm"
                      variant="flat"
                    >
                      {getPriorityLabel(selectedTicket.priority)}
                    </Chip>
                    <Chip size="sm" variant="bordered">
                      {getSupportLevelLabel(selectedTicket.supportLevel)}
                    </Chip>
                    <Button
                      color="primary"
                      size="sm"
                      variant="flat"
                      onPress={() => openThreadFullscreen(selectedTicket.id)}
                    >
                      Tela cheia
                    </Button>
                  </>
                ) : null}
              </div>
            </div>
            {selectedTicket ? (
              <p className="text-xs text-default-400">
                #{selectedTicket.id} · {selectedTicket.tenant.name} ·{" "}
                {selectedTicket.requester.email}
              </p>
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
                    <p className="uppercase tracking-[0.16em] text-default-500">
                      Abertura
                    </p>
                    <p>{formatDateTime(selectedTicket.createdAt)}</p>
                  </div>
                  <div>
                    <p className="uppercase tracking-[0.16em] text-default-500">
                      1ª resposta
                    </p>
                    <p>{formatDuration(selectedTicket.firstResponseMinutes)}</p>
                  </div>
                  <div>
                    <p className="uppercase tracking-[0.16em] text-default-500">
                      Tempo de atendimento
                    </p>
                    <p key={threadClockTick}>
                      {formatElapsedTime(
                        selectedTicket.createdAt,
                        selectedTicket.closedAt,
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="uppercase tracking-[0.16em] text-default-500">
                      SLA
                    </p>
                    <p>{formatDateTime(selectedTicket.firstResponseDueAt)}</p>
                  </div>
                  <div>
                    <p className="uppercase tracking-[0.16em] text-default-500">
                      Atualizado
                    </p>
                    <p>{formatDateTime(selectedTicket.updatedAt)}</p>
                  </div>
                </div>

                {selectedTicket.status === TicketStatus.CLOSED ? (
                  <div className="rounded-xl border border-success/30 bg-success/10 p-3 text-sm text-success-200">
                    <p className="font-semibold text-success-100">
                      Atendimento encerrado
                    </p>
                    <p className="mt-1 text-xs text-success-200">
                      Finalizado em {formatDateTime(selectedTicket.closedAt)}{" "}
                      por {selectedTicket.closedBy?.name ?? "suporte"}.
                    </p>
                    {selectedTicket.resolutionOutcome ? (
                      <p className="mt-1 text-xs text-success-200">
                        Desfecho:{" "}
                        {RESOLUTION_OUTCOME_OPTIONS.find(
                          (option) =>
                            option.key === selectedTicket.resolutionOutcome,
                        )?.label ?? selectedTicket.resolutionOutcome}
                        {selectedTicket.closureCategory
                          ? ` · Categoria: ${getCategoryLabel(selectedTicket.closureCategory)}`
                          : ""}
                      </p>
                    ) : null}
                    {selectedTicket.requesterRating ? (
                      <p className="mt-1 text-xs text-success-200">
                        Avaliação do cliente: {selectedTicket.requesterRating}/5
                        {selectedTicket.requesterRatedAt
                          ? ` em ${formatDateTime(selectedTicket.requesterRatedAt)}`
                          : ""}
                        {selectedTicket.requesterRatingComment
                          ? ` · "${selectedTicket.requesterRatingComment}"`
                          : ""}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                <div className="grid grid-cols-1 gap-3 rounded-xl border border-white/10 bg-background/40 p-3 lg:grid-cols-3">
                  <Select
                    isDisabled={selectedTicket.status === TicketStatus.CLOSED}
                    label="Status"
                    selectedKeys={
                      statusDraft && statusDraft !== TicketStatus.CLOSED
                        ? [statusDraft]
                        : []
                    }
                    onSelectionChange={(keys) => {
                      const nextStatus =
                        (Array.from(keys)[0] as TicketStatus) ??
                        selectedTicket.status;
                      setStatusDraft(nextStatus);
                      if (nextStatus !== TicketStatus.WAITING_EXTERNAL) {
                        setStatusReasonDraft("");
                      }
                    }}
                  >
                    {STATUS_OPTIONS.filter(
                      (option) =>
                        option.key !== "ALL" &&
                        option.key !== TicketStatus.CLOSED,
                    ).map((option) => (
                      <SelectItem key={option.key} textValue={option.label}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </Select>
                  {statusDraft === TicketStatus.WAITING_EXTERNAL ? (
                    <Textarea
                      className="lg:col-span-3"
                      isRequired
                      label="Motivo de aguardando terceiro"
                      minRows={2}
                      placeholder="Ex.: aguardando retorno de integração, tribunal ou fornecedor externo."
                      value={statusReasonDraft}
                      onValueChange={setStatusReasonDraft}
                    />
                  ) : null}

                  <Select
                    isDisabled={selectedTicket.status === TicketStatus.CLOSED}
                    label="Nível"
                    selectedKeys={routingLevelDraft ? [routingLevelDraft] : []}
                    onSelectionChange={(keys) =>
                      setRoutingLevelDraft(
                        (Array.from(keys)[0] as TicketSupportLevel) ??
                          selectedTicket.supportLevel,
                      )
                    }
                  >
                    {SUPPORT_LEVEL_OPTIONS.filter(
                      (option) => option.key !== "ALL",
                    ).map((option) => (
                      <SelectItem key={option.key} textValue={option.label}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </Select>

                  <SearchableSelect
                    isDisabled={selectedTicket.status === TicketStatus.CLOSED}
                    emptyContent="Nenhum agente encontrado"
                    isClearable={false}
                    label="Atribuir para"
                    items={assigneeFilterOptions}
                    selectedKey={routingAssigneeDraft || "unassigned"}
                    onSelectionChange={(selected) => {
                      setRoutingAssigneeDraft(
                        selected && selected !== "unassigned" ? selected : "",
                      );
                    }}
                  />

                  <div className="flex flex-wrap items-end gap-2 lg:col-span-3">
                    <Button
                      color="primary"
                      isDisabled={
                        selectedTicket.status === TicketStatus.CLOSED ||
                        selectedTicket.assignedTo?.id === currentSuperAdminId
                      }
                      variant="flat"
                      onPress={() => handleClaimTicket(selectedTicket.id)}
                    >
                      Assumir chat agora
                    </Button>
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
                      startContent={<ArrowRightLeft className="h-4 w-4" />}
                      onPress={handleSaveStatus}
                    >
                      Atualizar status
                    </Button>
                    <Button
                      color="secondary"
                      isDisabled={
                        selectedTicket.status === TicketStatus.CLOSED ||
                        !routingLevelDraft ||
                        (routingLevelDraft === selectedTicket.supportLevel &&
                          routingAssigneeDraft ===
                            (selectedTicket.assignedTo?.id ?? ""))
                      }
                      isLoading={isSavingRouting}
                      startContent={<UserRoundCheck className="h-4 w-4" />}
                      onPress={handleSaveRouting}
                    >
                      Salvar roteamento
                    </Button>
                    <Button
                      isDisabled={
                        selectedTicket.status === TicketStatus.CLOSED ||
                        !routingAssigneeDraft
                      }
                      variant="flat"
                      onPress={handleInviteAssignedAgent}
                    >
                      Convidar suporte
                    </Button>
                    <Button
                      isDisabled={
                        selectedTicket.status === TicketStatus.CLOSED ||
                        !currentSuperAdminId
                      }
                      variant="flat"
                      onPress={() =>
                        setRoutingAssigneeDraft(currentSuperAdminId)
                      }
                    >
                      Atribuir para mim
                    </Button>
                  </div>
                  <div className="rounded-lg border border-warning/25 bg-warning/10 p-2 text-xs text-warning-100 lg:col-span-3">
                    <p className="mb-2 uppercase tracking-[0.12em] text-warning-200">
                      Fechar atendimento
                    </p>
                    <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
                      <Select
                        isDisabled={
                          selectedTicket.status === TicketStatus.CLOSED
                        }
                        label="Categoria de fechamento"
                        selectedKeys={
                          closureCategoryDraft ? [closureCategoryDraft] : []
                        }
                        onSelectionChange={(keys) =>
                          setClosureCategoryDraft(
                            (Array.from(keys)[0] as TicketCategory) ??
                              selectedTicket.category,
                          )
                        }
                      >
                        {CATEGORY_OPTIONS.filter(
                          (option) => option.key !== "ALL",
                        ).map((option) => (
                          <SelectItem key={option.key} textValue={option.label}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </Select>
                      <Select
                        isDisabled={
                          selectedTicket.status === TicketStatus.CLOSED
                        }
                        label="Desfecho"
                        selectedKeys={[resolutionOutcomeDraft]}
                        onSelectionChange={(keys) =>
                          setResolutionOutcomeDraft(
                            (Array.from(keys)[0] as TicketResolutionOutcome) ??
                              TicketResolutionOutcome.RESOLVED,
                          )
                        }
                      >
                        {RESOLUTION_OUTCOME_OPTIONS.map((option) => (
                          <SelectItem key={option.key} textValue={option.label}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </Select>
                      <Button
                        className="self-end"
                        color="success"
                        isDisabled={
                          selectedTicket.status === TicketStatus.CLOSED
                        }
                        isLoading={isFinalizing}
                        onPress={handleFinalizeTicket}
                      >
                        Finalizar chat
                      </Button>
                    </div>
                    <Textarea
                      className="mt-2"
                      description="Resumo opcional para auditoria e contexto de fechamento."
                      isDisabled={selectedTicket.status === TicketStatus.CLOSED}
                      label="Resumo do fechamento"
                      minRows={2}
                      placeholder="Ex.: cliente orientado, erro corrigido e validação concluída."
                      value={closureSummaryDraft}
                      onValueChange={setClosureSummaryDraft}
                    />
                  </div>
                  <div className="rounded-lg border border-white/10 bg-background/70 p-2 text-xs text-default-300 lg:col-span-3">
                    <p className="mb-1 uppercase tracking-[0.12em] text-default-500">
                      Guia de transição de status
                    </p>
                    <div className="space-y-1">
                      {STATUS_TRANSITION_GUIDE.map((item) => (
                        <p key={item.title}>
                          <span className="font-semibold text-default-100">
                            {item.title}:
                          </span>{" "}
                          {item.description}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>

                <Divider className="border-white/10" />

                <div className="max-h-[42vh] space-y-3 overflow-y-auto rounded-xl border border-white/10 bg-background/40 p-3">
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

                <div className="space-y-2 rounded-xl border border-white/10 bg-background/40 p-3">
                  <input
                    ref={replyImagesInputRef}
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    multiple
                    type="file"
                    onChange={(event) =>
                      appendImages(replyImages, event, setReplyImages)
                    }
                  />
                  <Textarea
                    isDisabled={selectedTicket.status === TicketStatus.CLOSED}
                    minRows={4}
                    placeholder={
                      selectedTicket.status === TicketStatus.CLOSED
                        ? "Chat finalizado. Mensagens bloqueadas."
                        : "Responder ticket"
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
                  <div className="flex flex-wrap gap-2">
                    {SUPPORT_REPLY_MACROS.map((macro) => (
                      <Button
                        key={macro.key}
                        isDisabled={
                          selectedTicket.status === TicketStatus.CLOSED
                        }
                        size="sm"
                        variant="flat"
                        onPress={() => applyReplyMacro(macro)}
                      >
                        {macro.label}
                      </Button>
                    ))}
                  </div>
                  {replyImages.length > 0 ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {replyImages.map((file, index) => (
                        <div
                          key={`${file.name}-${index}`}
                          className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-background/60 px-2 py-1"
                        >
                          <p className="truncate text-xs text-default-300">
                            {file.name}
                          </p>
                          <Button
                            isIconOnly
                            size="sm"
                            variant="light"
                            onPress={() =>
                              setReplyImages((previous) =>
                                previous.filter(
                                  (_, currentIndex) => currentIndex !== index,
                                ),
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
                      description="Os anexos do atendimento estão sendo enviados com a mensagem."
                    />
                  ) : null}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Switch
                      isDisabled={selectedTicket.status === TicketStatus.CLOSED}
                      isSelected={isInternalReply}
                      size="sm"
                      onValueChange={setIsInternalReply}
                    >
                      Mensagem interna da equipe
                    </Switch>
                    <Button
                      color="primary"
                      isDisabled={selectedTicket.status === TicketStatus.CLOSED}
                      isLoading={isSendingReply}
                      startContent={
                        isSendingReply ? undefined : (
                          <MessageSquare className="h-4 w-4" />
                        )
                      }
                      onPress={handleSendReply}
                    >
                      Enviar resposta
                    </Button>
                  </div>
                </div>
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

      {!isLoadingStats && stats && stats.pendingSupport > 0 ? (
        <div className="rounded-xl border border-warning/30 bg-warning/10 p-3 text-xs text-warning-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            <p>
              {stats.pendingSupport} ticket(s) aguardando atendimento da
              operação.
            </p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
