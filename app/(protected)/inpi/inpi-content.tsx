"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import {
  Autocomplete,
  AutocompleteItem,
  Button,
  Chip,
  CircularProgress,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Pagination,
  Select,
  SelectItem,
  Skeleton,
  Textarea,
} from "@heroui/react";
import {
  Database,
  LoaderCircle,
  RefreshCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";

import {
  cancelInpiCatalogBackgroundSearch,
  createInpiDossie,
  getInpiCatalogBackgroundSearchStatus,
  getInpiBuscaHistoryDetails,
  getInpiDashboardStats,
  getInpiLatestCatalogBackgroundSearchStatus,
  listInpiBuscaHistory,
  listInpiDossieColisoes,
  listInpiNiceClasses,
  listInpiDossies,
  reanalyzeInpiDossie,
  searchInpiCatalog,
  startInpiCatalogBackgroundSearch,
  syncInpiCatalogBase,
  updateInpiDossieStatus,
  type InpiCatalogSearchItem,
  type InpiCatalogSearchSyncStatus,
  type InpiBuscaHistoryDetailsData,
  type InpiBuscaHistoryItem,
  type InpiDashboardStats,
  type InpiDossieColisaoDetalheItem,
  type InpiDossieItem,
  type InpiNiceClassItem,
} from "@/app/actions/inpi";
import { estimateInpiCatalogSyncEtaSeconds } from "@/app/lib/inpi/catalog-sync-runtime";
import {
  PeopleEntityCard,
  PeopleEntityCardBody,
  PeopleMetricCard,
  PeoplePageHeader,
  PeoplePanel,
} from "@/components/people-ui";
import type { InpiDossieStatus, InpiRisco } from "@/generated/prisma";
import { toast } from "@/lib/toast";

type DossieStatusFilter = InpiDossieStatus | "all";
type DossieRiscoFilter = InpiRisco | "all";

const PAGE_SIZE_OPTIONS = [8, 12, 24];

const STATUS_OPTIONS: Array<{ key: DossieStatusFilter; label: string }> = [
  { key: "all", label: "Todos os status" },
  { key: "EM_ANALISE", label: "Em análise" },
  { key: "VIAVEL", label: "Viável" },
  { key: "RISCO_MODERADO", label: "Risco moderado" },
  { key: "RISCO_ALTO", label: "Risco alto" },
  { key: "PROTOCOLADO", label: "Protocolado" },
  { key: "DEFERIDO", label: "Deferido" },
  { key: "INDEFERIDO", label: "Indeferido" },
];

const RISCO_OPTIONS: Array<{ key: DossieRiscoFilter; label: string }> = [
  { key: "all", label: "Todos os riscos" },
  { key: "BAIXO", label: "Baixo" },
  { key: "MEDIO", label: "Médio" },
  { key: "ALTO", label: "Alto" },
  { key: "CRITICO", label: "Crítico" },
];

const HISTORICO_SOURCE_OPTIONS = [
  { key: "all", label: "Todas as fontes" },
  { key: "catalogo_global", label: "Catálogo local" },
  { key: "inpi_oficial_background", label: "Busca oficial background" },
  { key: "inpi_oficial_live", label: "Busca oficial direta" },
  { key: "base_inicial_magiclawyer", label: "Carga base local" },
];

const STATUS_LABELS: Record<InpiDossieStatus, string> = {
  EM_ANALISE: "Em análise",
  VIAVEL: "Viável",
  RISCO_MODERADO: "Risco moderado",
  RISCO_ALTO: "Risco alto",
  PROTOCOLADO: "Protocolado",
  INDEFERIDO: "Indeferido",
  DEFERIDO: "Deferido",
};

const RISCO_LABELS: Record<InpiRisco, string> = {
  BAIXO: "Baixo",
  MEDIO: "Médio",
  ALTO: "Alto",
  CRITICO: "Crítico",
};

function getSingleSelectionKey(value: unknown): string | undefined {
  if (!value || value === "all") {
    return undefined;
  }

  if (value instanceof Set) {
    const first = Array.from(value)[0];

    if (typeof first === "string") {
      return first;
    }
  }

  return typeof value === "string" ? value : undefined;
}

function getRiscoColor(risco: InpiRisco) {
  if (risco === "CRITICO") {
    return "danger";
  }

  if (risco === "ALTO") {
    return "warning";
  }

  if (risco === "MEDIO") {
    return "secondary";
  }

  return "success";
}

function getStatusColor(status: InpiDossieStatus) {
  if (status === "DEFERIDO" || status === "VIAVEL" || status === "PROTOCOLADO") {
    return "success";
  }

  if (status === "RISCO_ALTO" || status === "INDEFERIDO") {
    return "danger";
  }

  if (status === "RISCO_MODERADO") {
    return "warning";
  }

  return "secondary";
}

function getFonteLabel(fonte: string) {
  const match = HISTORICO_SOURCE_OPTIONS.find((item) => item.key === fonte);
  if (match) {
    return match.label;
  }

  return fonte;
}

function getFonteChipColor(fonte: string) {
  if (fonte === "inpi_oficial_background" || fonte === "inpi_oficial_live") {
    return "warning";
  }

  if (fonte === "catalogo_global") {
    return "secondary";
  }

  if (fonte === "base_inicial_magiclawyer") {
    return "primary";
  }

  return "default";
}

function formatRetryAfter(seconds?: number) {
  if (!seconds || seconds <= 0) {
    return "";
  }

  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.ceil(seconds / 60);
  return `${minutes}min`;
}

function formatEta(seconds?: number) {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) {
    return "calculando...";
  }

  if (seconds < 60) {
    return `${Math.ceil(seconds)}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.ceil(seconds % 60);

  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const restMinutes = minutes % 60;
    return `${hours}h ${restMinutes}min`;
  }

  return `${minutes}min ${remainingSeconds}s`;
}

interface InpiContentProps {
  canSyncCatalog?: boolean;
  canWrite?: boolean;
}

export function InpiContent({
  canSyncCatalog = false,
  canWrite = true,
}: InpiContentProps) {
  const [filtros, setFiltros] = useState<{
    search: string;
    status: DossieStatusFilter;
    risco: DossieRiscoFilter;
  }>({
    search: "",
    status: "all",
    risco: "all",
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isReanalyzingId, setIsReanalyzingId] = useState<string | null>(null);
  const [selectedDossie, setSelectedDossie] = useState<InpiDossieItem | null>(
    null,
  );
  const [isSavingStatus, setIsSavingStatus] = useState(false);

  const [newDossieForm, setNewDossieForm] = useState({
    nomePretendido: "",
    classeNice: "",
    segmento: "",
    observacoes: "",
  });

  const [catalogSearch, setCatalogSearch] = useState({
    termo: "",
    classeNice: "",
  });
  const [catalogResults, setCatalogResults] = useState<InpiCatalogSearchItem[]>(
    [],
  );
  const [isCatalogLoading, setIsCatalogLoading] = useState(false);
  const [isCatalogSyncStarting, setIsCatalogSyncStarting] = useState(false);
  const [isCatalogSyncCanceling, setIsCatalogSyncCanceling] = useState(false);
  const [catalogExecution, setCatalogExecution] = useState<{
    termo: string;
    classeNice: string;
    startedAt: number;
  } | null>(null);
  const [activeCatalogSyncId, setActiveCatalogSyncId] = useState<string | null>(
    null,
  );
  const [historyFilters, setHistoryFilters] = useState<{
    search: string;
    source: string;
    processNumber: string;
  }>({
    search: "",
    source: "all",
    processNumber: "",
  });
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(8);
  const [selectedHistoryLog, setSelectedHistoryLog] =
    useState<InpiBuscaHistoryItem | null>(null);
  const [historyDetailsPage, setHistoryDetailsPage] = useState(1);
  const [historyDetailsPageSize, setHistoryDetailsPageSize] = useState(12);
  const [historyDetailsProcessFilter, setHistoryDetailsProcessFilter] =
    useState("");
  const [modalStatus, setModalStatus] = useState<InpiDossieStatus | "">("");
  const [modalClasseNice, setModalClasseNice] = useState("");
  const [modalObservacoes, setModalObservacoes] = useState("");
  const [dossieColisoesPage, setDossieColisoesPage] = useState(1);
  const [dossieColisoesPageSize, setDossieColisoesPageSize] = useState(12);
  const [dossieColisoesSearch, setDossieColisoesSearch] = useState("");
  const lastCatalogSyncStatusRef = useRef<InpiCatalogSearchSyncStatus["status"] | null>(
    null,
  );
  const handledCatalogTerminalRef = useRef<string | null>(null);

  const dossiesKey = useMemo(
    () => [
      "inpi-dossies",
      filtros.search.trim().toLowerCase(),
      filtros.status,
      filtros.risco,
      page,
      pageSize,
    ],
    [filtros.search, filtros.status, filtros.risco, page, pageSize],
  );

  const { data: statsData, mutate: mutateStats } = useSWR<InpiDashboardStats>(
    "inpi-stats",
    async () => {
      const result = await getInpiDashboardStats();

      if (!result.success || !result.data) {
        throw new Error(result.error || "Erro ao carregar métricas do INPI");
      }

      return result.data;
    },
    {
      revalidateOnFocus: false,
    },
  );

  const { data: niceClassesData } = useSWR<InpiNiceClassItem[]>(
    "inpi-nice-classes",
    async () => {
      const result = await listInpiNiceClasses();

      if (!result.success || !result.data) {
        throw new Error(result.error || "Erro ao carregar classes NICE");
      }

      return result.data;
    },
    {
      revalidateOnFocus: false,
    },
  );

  const {
    data: dossiesData,
    mutate: mutateDossies,
    isLoading: isDossiesLoading,
  } = useSWR(
    dossiesKey,
    async () => {
      const result = await listInpiDossies({
        search: filtros.search,
        status: filtros.status,
        risco: filtros.risco,
        page,
        pageSize,
      });

      if (!result.success || !result.data) {
        throw new Error(result.error || "Erro ao carregar dossiês");
      }

      return result.data;
    },
    {
      revalidateOnFocus: false,
      keepPreviousData: true,
    },
  );

  const { data: catalogSyncStatus, mutate: mutateCatalogSyncStatus } = useSWR<
    InpiCatalogSearchSyncStatus | undefined
  >(
    activeCatalogSyncId ? ["inpi-catalog-sync-status", activeCatalogSyncId] : null,
    async (key) => {
      const [, syncId] = key as [string, string];
      const result = await getInpiCatalogBackgroundSearchStatus({ syncId });

      if (!result.success) {
        throw new Error(
          result.error || "Erro ao carregar status da busca de catálogo.",
        );
      }

      return result.status;
    },
    {
      revalidateOnFocus: false,
      refreshInterval: (data) => {
        if (!data) return 0;
        return data.status === "QUEUED" || data.status === "RUNNING" ? 1500 : 0;
      },
    },
  );

  const { data: latestCatalogSyncStatus, mutate: mutateLatestCatalogSyncStatus } = useSWR<
    InpiCatalogSearchSyncStatus | undefined
  >(
    "inpi-catalog-sync-latest",
    async () => {
      const result = await getInpiLatestCatalogBackgroundSearchStatus();

      if (!result.success) {
        throw new Error(
          result.error || "Erro ao carregar último status de busca INPI.",
        );
      }

      return result.status;
    },
    {
      revalidateOnFocus: false,
    },
  );

  const historyKey = useMemo(
    () => [
      "inpi-busca-history",
      historyFilters.search.trim().toLowerCase(),
      historyFilters.source,
      historyFilters.processNumber.trim(),
      historyPage,
      historyPageSize,
    ],
    [
      historyFilters.processNumber,
      historyFilters.search,
      historyFilters.source,
      historyPage,
      historyPageSize,
    ],
  );

  const {
    data: historyData,
    mutate: mutateHistory,
    isLoading: isHistoryLoading,
  } = useSWR(
    historyKey,
    async () => {
      const result = await listInpiBuscaHistory({
        search: historyFilters.search,
        source: historyFilters.source,
        processNumber: historyFilters.processNumber,
        page: historyPage,
        pageSize: historyPageSize,
      });

      if (!result.success || !result.data) {
        throw new Error(
          result.error || "Erro ao carregar histórico de buscas INPI",
        );
      }

      return {
        ...result.data,
        warning: result.warning,
      };
    },
    {
      revalidateOnFocus: false,
      keepPreviousData: true,
    },
  );

  const historyDetailsKey = useMemo(
    () =>
      selectedHistoryLog
        ? [
            "inpi-busca-history-details",
            selectedHistoryLog.id,
            historyDetailsProcessFilter.trim(),
            historyDetailsPage,
            historyDetailsPageSize,
          ]
        : null,
    [
      historyDetailsPage,
      historyDetailsPageSize,
      historyDetailsProcessFilter,
      selectedHistoryLog,
    ],
  );

  const { data: historyDetailsData, isLoading: isHistoryDetailsLoading } = useSWR<
    InpiBuscaHistoryDetailsData | undefined
  >(
    historyDetailsKey,
    async (key) => {
      const [, logId, processNumber, page, pageSize] = key as [
        string,
        string,
        string,
        number,
        number,
      ];
      const result = await getInpiBuscaHistoryDetails({
        logId,
        processNumber: processNumber || undefined,
        page,
        pageSize,
      });

      if (!result.success || !result.data) {
        throw new Error(
          result.error || "Erro ao carregar detalhes da busca histórica.",
        );
      }

      return result.data;
    },
    {
      revalidateOnFocus: false,
      keepPreviousData: true,
    },
  );

  const dossieColisoesKey = useMemo(
    () =>
      selectedDossie
        ? [
            "inpi-dossie-colisoes",
            selectedDossie.id,
            dossieColisoesSearch.trim(),
            dossieColisoesPage,
            dossieColisoesPageSize,
          ]
        : null,
    [
      dossieColisoesPage,
      dossieColisoesPageSize,
      dossieColisoesSearch,
      selectedDossie,
    ],
  );

  const {
    data: dossieColisoesData,
    isLoading: isDossieColisoesLoading,
    mutate: mutateDossieColisoes,
  } = useSWR<
    | {
        items: InpiDossieColisaoDetalheItem[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
      }
    | undefined
  >(
    dossieColisoesKey,
    async (key) => {
      const [, dossieId, search, page, pageSize] = key as [
        string,
        string,
        string,
        number,
        number,
      ];

      const result = await listInpiDossieColisoes({
        dossieId,
        search: search || undefined,
        page,
        pageSize,
      });

      if (!result.success || !result.data) {
        throw new Error(result.error || "Erro ao carregar colisões do dossiê.");
      }

      return result.data;
    },
    {
      revalidateOnFocus: false,
      keepPreviousData: true,
    },
  );

  const refreshAll = useCallback(async () => {
    await Promise.all([mutateStats(), mutateDossies(), mutateHistory()]);
  }, [mutateDossies, mutateHistory, mutateStats]);

  const handleSyncCatalog = useCallback(async () => {
    setIsSyncing(true);

    try {
      const result = await syncInpiCatalogBase();

      if (!result.success) {
        toast.error(result.error || "Erro ao sincronizar catálogo INPI");
        return;
      }

      toast.success(
        `Catálogo sincronizado. ${result.created ?? 0} nova(s), ${
          result.updated ?? 0
        } atualizada(s).`,
      );
      await refreshAll();
    } catch {
      toast.error("Erro ao sincronizar catálogo INPI");
    } finally {
      setIsSyncing(false);
    }
  }, [refreshAll]);

  const handleCreateDossie = useCallback(async () => {
    if (!newDossieForm.nomePretendido.trim()) {
      toast.error("Informe o nome pretendido para análise");
      return;
    }

    setIsCreating(true);

    try {
      const result = await createInpiDossie({
        nomePretendido: newDossieForm.nomePretendido.trim(),
        classeNice: newDossieForm.classeNice.trim() || undefined,
        segmento: newDossieForm.segmento.trim() || undefined,
        observacoes: newDossieForm.observacoes.trim() || undefined,
      });

      if (!result.success) {
        toast.error(result.error || "Erro ao criar dossiê");
        return;
      }

      toast.success("Dossiê criado e analisado com sucesso");
      setNewDossieForm({
        nomePretendido: "",
        classeNice: "",
        segmento: "",
        observacoes: "",
      });
      await refreshAll();
    } catch {
      toast.error("Erro ao criar dossiê");
    } finally {
      setIsCreating(false);
    }
  }, [newDossieForm, refreshAll]);

  const runLocalCatalogSearch = useCallback(
    async (params: {
      termo: string;
      classeNice: string;
      recordHistory?: boolean;
    }) => {
      const result = await searchInpiCatalog({
        termo: params.termo,
        classeNice: params.classeNice || undefined,
        recordHistory: params.recordHistory,
      });

      if (!result.success || !result.data) {
        toast.error(result.error || "Erro ao pesquisar catálogo INPI");
        return false;
      }

      setCatalogResults(result.data);
      if (result.warning) {
        toast.warning(result.warning);
      }

      await Promise.all([mutateStats(), mutateHistory()]);
      return true;
    },
    [mutateHistory, mutateStats],
  );

  const enqueueCatalogBackgroundSearch = useCallback(
    async (params: {
      termo: string;
      classeNice: string;
      forceRefresh?: boolean;
    }) => {
      setIsCatalogSyncStarting(true);

      try {
        const start = await startInpiCatalogBackgroundSearch({
          termo: params.termo,
          classeNice: params.classeNice || undefined,
          forceRefresh: params.forceRefresh,
        });

        if (!start.success || !start.syncId) {
          const retryLabel = formatRetryAfter(start.retryAfterSeconds);
          const retryMessage = retryLabel
            ? ` Tente novamente em ${retryLabel}.`
            : "";
          toast.error(
            `${start.error || "Não foi possível iniciar a busca completa."}${retryMessage}`,
          );
          return false;
        }

        setActiveCatalogSyncId(start.syncId);
        await Promise.all([
          mutateCatalogSyncStatus(),
          mutateLatestCatalogSyncStatus(),
        ]);

        if (start.alreadyRunning) {
          toast.info("Já existe uma varredura completa em andamento para este termo.");
        } else if (params.forceRefresh) {
          toast.info("Reprocessamento completo iniciado em background.");
        } else {
          toast.info("Varredura completa iniciada em background.");
        }

        return true;
      } finally {
        setIsCatalogSyncStarting(false);
      }
    },
    [mutateCatalogSyncStatus, mutateLatestCatalogSyncStatus],
  );

  const handleCancelCatalogSync = useCallback(async () => {
    if (!catalogSyncStatus?.syncId) {
      return;
    }

    setIsCatalogSyncCanceling(true);

    try {
      const result = await cancelInpiCatalogBackgroundSearch({
        syncId: catalogSyncStatus.syncId,
      });

      if (!result.success || !result.status) {
        toast.error(result.error || "Não foi possível cancelar a busca oficial.");
        return;
      }

      await Promise.all([
        mutateCatalogSyncStatus(result.status, { revalidate: false }),
        mutateLatestCatalogSyncStatus(),
      ]);

      if (result.status.status === "CANCELED") {
        toast.success("Busca oficial cancelada.");
      } else {
        toast.info("Cancelamento solicitado. Encerrando o processamento.");
      }
    } catch {
      toast.error("Não foi possível cancelar a busca oficial.");
    } finally {
      setIsCatalogSyncCanceling(false);
    }
  }, [catalogSyncStatus, mutateCatalogSyncStatus, mutateLatestCatalogSyncStatus]);

  const handleCatalogSearch = useCallback(async () => {
    const termo = catalogSearch.termo.trim();
    const classeNice = catalogSearch.classeNice.trim();

    if (termo.length < 2) {
      toast.error("Digite ao menos 2 caracteres para pesquisar no catálogo");
      return;
    }

    setIsCatalogLoading(true);
    setCatalogExecution({
      termo,
      classeNice,
      startedAt: Date.now(),
    });

    try {
      await runLocalCatalogSearch({
        termo,
        classeNice,
      });
      await enqueueCatalogBackgroundSearch({
        termo,
        classeNice,
        forceRefresh: false,
      });
    } catch {
      toast.error("Erro ao pesquisar catálogo INPI");
    } finally {
      setIsCatalogLoading(false);
      setCatalogExecution(null);
    }
  }, [catalogSearch, enqueueCatalogBackgroundSearch, runLocalCatalogSearch]);

  const handleForceCatalogResync = useCallback(async () => {
    const termo = catalogSearch.termo.trim();
    const classeNice = catalogSearch.classeNice.trim();

    if (termo.length < 2) {
      toast.error("Digite ao menos 2 caracteres para reprocessar a busca.");
      return;
    }

    await enqueueCatalogBackgroundSearch({
      termo,
      classeNice,
      forceRefresh: true,
    });
  }, [catalogSearch, enqueueCatalogBackgroundSearch]);

  const handleRunFromHistory = useCallback(
    async (item: InpiBuscaHistoryItem) => {
      const termo = item.termo.trim();
      const classeNice = item.classeNice || "";

      if (termo.length < 2) {
        toast.error("Termo histórico inválido para nova consulta.");
        return;
      }

      setCatalogSearch({
        termo,
        classeNice,
      });
      setCatalogExecution({
        termo,
        classeNice,
        startedAt: Date.now(),
      });
      setIsCatalogLoading(true);

      try {
        await runLocalCatalogSearch({ termo, classeNice });
        await enqueueCatalogBackgroundSearch({
          termo,
          classeNice,
          forceRefresh: true,
        });
      } catch {
        toast.error("Erro ao executar consulta a partir do histórico.");
      } finally {
        setIsCatalogLoading(false);
        setCatalogExecution(null);
      }
    },
    [enqueueCatalogBackgroundSearch, runLocalCatalogSearch],
  );

  const handleOpenHistoryDetails = useCallback((item: InpiBuscaHistoryItem) => {
    setSelectedHistoryLog(item);
    setHistoryDetailsPage(1);
    setHistoryDetailsProcessFilter("");
  }, []);

  useEffect(() => {
    if (!catalogSyncStatus) {
      lastCatalogSyncStatusRef.current = null;
      handledCatalogTerminalRef.current = null;
      return;
    }

    const previous = lastCatalogSyncStatusRef.current;
    const current = catalogSyncStatus.status;
    lastCatalogSyncStatusRef.current = current;
    const statusChanged = previous !== current;
    const isTerminal =
      current === "COMPLETED" ||
      current === "CANCELED" ||
      current === "FAILED";
    const terminalFingerprint = isTerminal
      ? `${catalogSyncStatus.syncId}:${current}:${catalogSyncStatus.updatedAt}`
      : null;

    if (!statusChanged && !isTerminal) {
      return;
    }

    if (
      isTerminal &&
      terminalFingerprint &&
      handledCatalogTerminalRef.current === terminalFingerprint
    ) {
      return;
    }

    if (isTerminal && terminalFingerprint) {
      handledCatalogTerminalRef.current = terminalFingerprint;
    }

    if (current === "COMPLETED") {
      const classeNice = catalogSyncStatus.classeNice || "";
      void runLocalCatalogSearch({
        termo: catalogSyncStatus.termo,
        classeNice,
        recordHistory: false,
      });
      void mutateHistory();

      const warningMessage = catalogSyncStatus.warning?.trim();

      if (warningMessage) {
        toast.warning(warningMessage);
      } else {
        toast.success(
          `Busca completa finalizada. ${catalogSyncStatus.persistedRows} item(ns) sincronizado(s).`,
        );
      }
    }

    if (current === "FAILED") {
      toast.error(
        catalogSyncStatus.error || "A busca completa oficial falhou no background.",
      );
      void mutateHistory();
    }

    if (current === "CANCELED") {
      toast.info(
        catalogSyncStatus.warning || "A busca completa oficial foi cancelada.",
      );
    }
  }, [catalogSyncStatus, mutateHistory, runLocalCatalogSearch]);

  useEffect(() => {
    if (activeCatalogSyncId || !latestCatalogSyncStatus?.syncId) {
      return;
    }

    setActiveCatalogSyncId(latestCatalogSyncStatus.syncId);
  }, [activeCatalogSyncId, latestCatalogSyncStatus]);

  const handleReanalyze = useCallback(
    async (dossieId: string) => {
      setIsReanalyzingId(dossieId);

      try {
        const result = await reanalyzeInpiDossie(dossieId);

        if (!result.success) {
          toast.error(result.error || "Erro ao reanalisar dossiê");
          return;
        }

        toast.success("Análise refeita com base no catálogo global");
        await refreshAll();
        await mutateDossieColisoes();
        setSelectedDossie((prev) =>
          prev && prev.id === dossieId && result.data
            ? {
                ...prev,
                riscoAtual: result.data.riscoAtual,
                status: result.data.status,
                resumoAnalise: result.data.resumoAnalise,
                colisoesCount: result.data.colisoesCount,
                topColisoes: result.data.topColisoes,
              }
            : prev,
        );
      } catch {
        toast.error("Erro ao reanalisar dossiê");
      } finally {
        setIsReanalyzingId(null);
      }
    },
    [mutateDossieColisoes, refreshAll],
  );

  const openDossieModal = useCallback((dossie: InpiDossieItem) => {
    setSelectedDossie(dossie);
    setModalStatus(dossie.status);
    setModalClasseNice(dossie.classeNice || "");
    setModalObservacoes(dossie.observacoes || "");
    setDossieColisoesPage(1);
    setDossieColisoesSearch("");
  }, []);

  const handleSaveModalStatus = useCallback(async () => {
    if (!selectedDossie || !modalStatus) {
      return;
    }

    setIsSavingStatus(true);

    try {
      const result = await updateInpiDossieStatus({
        dossieId: selectedDossie.id,
        status: modalStatus,
        classeNice: modalClasseNice || undefined,
        observacoes: modalObservacoes.trim() || undefined,
      });

      if (!result.success) {
        toast.error(result.error || "Erro ao atualizar status do dossiê");
        return;
      }

      if (result.data?.reanalyzed) {
        toast.success("Classe atualizada e análise refeita automaticamente");
      } else {
        toast.success("Status do dossiê atualizado");
      }
      await refreshAll();
      setSelectedDossie((prev) =>
        prev
          ? (() => {
              const fallbackObservacoes = modalObservacoes.trim() || null;
              const nextObservacoes =
                result.data?.observacoes !== undefined
                  ? result.data.observacoes
                  : fallbackObservacoes;
              const nextClasse =
                result.data?.classeNice !== undefined
                  ? result.data.classeNice
                  : modalClasseNice || null;

              return {
                ...prev,
                status: result.data?.analysis?.status || modalStatus,
                observacoes: nextObservacoes,
                classeNice: nextClasse,
                ...(result.data?.analysis
                  ? {
                      riscoAtual: result.data.analysis.riscoAtual,
                      resumoAnalise: result.data.analysis.resumoAnalise,
                      colisoesCount: result.data.analysis.colisoesCount,
                      topColisoes: result.data.analysis.topColisoes,
                    }
                  : {}),
              };
            })()
          : prev,
      );
    } catch {
      toast.error("Erro ao atualizar status do dossiê");
    } finally {
      setIsSavingStatus(false);
    }
  }, [
    modalClasseNice,
    modalObservacoes,
    modalStatus,
    refreshAll,
    selectedDossie,
  ]);

  const dossieItems = dossiesData?.items || [];
  const totalPages = dossiesData?.totalPages || 1;
  const totalDossies = dossiesData?.total || 0;
  const dossieColisoesItems = dossieColisoesData?.items || [];
  const dossieColisoesTotal =
    dossieColisoesData?.total ?? selectedDossie?.colisoesCount ?? 0;
  const dossieColisoesTotalPages = dossieColisoesData?.totalPages || 1;
  const historyItems = historyData?.items || [];
  const historyTotal = historyData?.total || 0;
  const historyTotalPages = historyData?.totalPages || 1;
  const niceClasses = niceClassesData || [];
  const niceClassByCode = useMemo(
    () =>
      new Map(
        niceClasses.map((item) => [
          item.code,
          item,
        ]),
      ),
    [niceClasses],
  );
  const selectedNewDossieClass =
    niceClassByCode.get(newDossieForm.classeNice) || null;
  const selectedSearchClass = niceClassByCode.get(catalogSearch.classeNice) || null;
  const selectedModalClass = niceClassByCode.get(modalClasseNice) || null;
  const niceProductsCount = useMemo(
    () =>
      niceClasses.length
        ? niceClasses.filter((item) => item.type === "PRODUTO").length
        : 34,
    [niceClasses],
  );
  const niceServicesCount = useMemo(
    () =>
      niceClasses.length
        ? niceClasses.filter((item) => item.type === "SERVICO").length
        : 11,
    [niceClasses],
  );
  const isCatalogSyncRunning = Boolean(
    catalogSyncStatus &&
      (catalogSyncStatus.status === "QUEUED" ||
        catalogSyncStatus.status === "RUNNING"),
  );
  const canCancelCatalogSync = Boolean(
    catalogSyncStatus &&
      (catalogSyncStatus.status === "QUEUED" ||
        catalogSyncStatus.status === "RUNNING"),
  );
  const isCatalogSyncCancellationPending = Boolean(
    canCancelCatalogSync &&
      catalogSyncStatus?.warning?.startsWith("Cancelamento solicitado"),
  );
  const queuedElapsedSeconds = useMemo(() => {
    if (!catalogSyncStatus || catalogSyncStatus.status !== "QUEUED") {
      return 0;
    }

    const queuedAt = new Date(catalogSyncStatus.createdAt).getTime();
    if (!Number.isFinite(queuedAt) || queuedAt <= 0) {
      return 0;
    }

    return Math.max(0, Math.floor((Date.now() - queuedAt) / 1000));
  }, [catalogSyncStatus]);
  const catalogSyncEtaSeconds = useMemo(() => {
    return estimateInpiCatalogSyncEtaSeconds(catalogSyncStatus);
  }, [catalogSyncStatus]);

  const clearFilters = () => {
    setFiltros({
      search: "",
      status: "all",
      risco: "all",
    });
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <PeoplePageHeader
        tag="Atividade jurídica"
        title="INPI"
        description="Dossiês de marca por escritório, com catálogo global compartilhado e análise automática de risco de colisão."
        actions={
          <>
            {canSyncCatalog ? (
              <Button
                color="secondary"
                isLoading={isSyncing}
                startContent={<Database className="h-4 w-4" />}
                onPress={handleSyncCatalog}
              >
                Carregar catálogo base local
              </Button>
            ) : null}
            <Button
              variant="flat"
              startContent={<RefreshCcw className="h-4 w-4" />}
              onPress={refreshAll}
            >
              Recarregar dados
            </Button>
          </>
        }
      />

      <PeoplePanel
        title="Indicadores de marca"
        description="Visão operacional da carteira de dossiês do escritório e atividade recente."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <PeopleMetricCard
            label="Catálogo global"
            value={statsData?.catalogoGlobalTotal ?? 0}
            helper="Itens compartilhados entre tenants"
            tone="primary"
          />
          <PeopleMetricCard
            label="Dossiês"
            value={statsData?.dossiesTotal ?? totalDossies}
            helper="Carteira do escritório"
            tone="default"
          />
          <PeopleMetricCard
            label="Viáveis"
            value={statsData?.dossiesViaveis ?? 0}
            helper="Sem colisão relevante"
            tone="success"
          />
          <PeopleMetricCard
            label="Risco alto/crítico"
            value={statsData?.dossiesRiscoAltoOuCritico ?? 0}
            helper="Exigem análise jurídica forte"
            tone="danger"
          />
          <PeopleMetricCard
            label="Protocolados"
            value={statsData?.dossiesProtocolados ?? 0}
            helper="Em trâmite no INPI"
            tone="secondary"
          />
          <PeopleMetricCard
            label="Buscas 24h"
            value={statsData?.buscasUltimas24h ?? 0}
            helper="Consultas recentes"
            tone="warning"
          />
        </div>
      </PeoplePanel>

      <PeoplePanel
        title="Tutorial rápido do módulo INPI"
        description="Fluxo recomendado para análise de marca e tomada de decisão."
      >
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-background/50 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-default-500">
              1. Busca inicial
            </p>
            <p className="mt-1 text-sm text-default-300">
              Pesquise o nome no catálogo. Se a base local não for suficiente, o
              sistema consulta a fonte oficial do INPI.
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-background/50 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-default-500">
              2. Criar dossiê
            </p>
            <p className="mt-1 text-sm text-default-300">
              Cadastre nome pretendido e classe NICE. O dossiê gera análise de
              colisão com score e risco automaticamente.
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-background/50 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-default-500">
              3. Decisão operacional
            </p>
            <p className="mt-1 text-sm text-default-300">
              Reanalise quando necessário, registre observações internas e avance
              status até protocolado/deferido.
            </p>
          </div>
        </div>
      </PeoplePanel>

      <PeoplePanel
        title="Guia NICE completo"
        description={`Catálogo com ${niceClasses.length || 45} classes (${niceProductsCount} de produtos e ${niceServicesCount} de serviços).`}
      >
        {niceClasses.length > 0 ? (
          <div className="max-h-[260px] space-y-2 overflow-y-auto pr-1">
            {niceClasses.map((item) => (
              <div
                key={item.code}
                className="rounded-xl border border-white/10 bg-background/50 px-3 py-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground">
                    Classe {item.codeDisplay} - {item.heading}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <Chip
                      color={item.type === "SERVICO" ? "secondary" : "primary"}
                      size="sm"
                      variant="flat"
                    >
                      {item.type === "SERVICO" ? "Servico" : "Produto"}
                    </Chip>
                    {item.usageTotal > 0 ? (
                      <Chip color="success" size="sm" variant="flat">
                        Uso {item.usageTotal}
                      </Chip>
                    ) : null}
                  </div>
                </div>
                <p className="text-xs text-default-500">{item.description}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton
                key={`nice-class-skeleton-${index}`}
                className="h-16 rounded-xl"
                isLoaded={false}
              />
            ))}
          </div>
        )}
      </PeoplePanel>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <PeoplePanel
          title="Novo dossiê de marca"
          description="Cadastre o nome pretendido e rode análise automática contra o catálogo global."
        >
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                isRequired
                label="Nome pretendido"
                placeholder="Ex.: Magic Lawyer"
                value={newDossieForm.nomePretendido}
                onValueChange={(value) =>
                  setNewDossieForm((prev) => ({
                    ...prev,
                    nomePretendido: value,
                  }))
                }
              />
              <Autocomplete
                allowsCustomValue={false}
                isClearable
                items={niceClasses}
                label="Classe NICE"
                listboxProps={{
                  emptyContent: "Nenhuma classe NICE encontrada",
                }}
                placeholder="Selecione a classe"
                selectedKey={newDossieForm.classeNice || null}
                onSelectionChange={(key) => {
                  setNewDossieForm((prev) => ({
                    ...prev,
                    classeNice: key ? String(key) : "",
                  }));
                }}
              >
                {(item) => (
                  <AutocompleteItem
                    key={item.code}
                    textValue={`Classe ${item.codeDisplay} - ${item.heading}`}
                  >
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-foreground">
                        Classe {item.codeDisplay} - {item.heading}
                      </span>
                      <span className="text-xs text-default-500">
                        {item.type === "SERVICO" ? "Servico" : "Produto"} •{" "}
                        {item.description}
                      </span>
                    </div>
                  </AutocompleteItem>
                )}
              </Autocomplete>
            </div>
            {selectedNewDossieClass ? (
              <div className="rounded-xl border border-primary/25 bg-primary/10 px-3 py-2">
                <p className="text-xs font-semibold text-primary">
                  Classe {selectedNewDossieClass.codeDisplay} •{" "}
                  {selectedNewDossieClass.heading}
                </p>
                <p className="text-[11px] text-primary/80">
                  {selectedNewDossieClass.description}
                </p>
              </div>
            ) : (
              <p className="text-[11px] text-default-400">
                Dica: selecione uma classe para deixar o dossie juridicamente mais
                preciso.
              </p>
            )}
            <Input
              label="Segmento"
              placeholder="Ex.: Software jurídico"
              value={newDossieForm.segmento}
              onValueChange={(value) =>
                setNewDossieForm((prev) => ({
                  ...prev,
                  segmento: value,
                }))
              }
            />
            <Textarea
              label="Observações internas"
              minRows={2}
              placeholder="Escopo comercial, estratégia de proteção, cliente responsável..."
              value={newDossieForm.observacoes}
              onValueChange={(value) =>
                setNewDossieForm((prev) => ({
                  ...prev,
                  observacoes: value,
                }))
              }
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="flat"
                onPress={() =>
                  setNewDossieForm({
                    nomePretendido: "",
                    classeNice: "",
                    segmento: "",
                    observacoes: "",
                  })
                }
              >
                Limpar
              </Button>
              <Button
                color="primary"
                isDisabled={!canWrite}
                isLoading={isCreating}
                onPress={handleCreateDossie}
              >
                Criar dossiê
              </Button>
            </div>
          </div>
        </PeoplePanel>

        <PeoplePanel
          title="Pesquisa no catálogo global"
          description="Consulta imediata na base local e varredura completa em background na fonte oficial do INPI."
        >
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_260px]">
              <Input
                label="Pesquisar nome/processo"
                placeholder="Digite nome, variação ou nº de processo"
                value={catalogSearch.termo}
                onValueChange={(value) =>
                  setCatalogSearch((prev) => ({
                    ...prev,
                    termo: value,
                  }))
                }
              />
              <Autocomplete
                allowsCustomValue={false}
                isClearable
                items={niceClasses}
                label="Classe NICE"
                listboxProps={{
                  emptyContent: "Nenhuma classe NICE encontrada",
                }}
                placeholder="Opcional"
                selectedKey={catalogSearch.classeNice || null}
                onSelectionChange={(key) => {
                  setCatalogSearch((prev) => ({
                    ...prev,
                    classeNice: key ? String(key) : "",
                  }));
                }}
              >
                {(item) => (
                  <AutocompleteItem
                    key={item.code}
                    textValue={`Classe ${item.codeDisplay} - ${item.heading}`}
                  >
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-foreground">
                        Classe {item.codeDisplay} - {item.heading}
                      </span>
                      <span className="text-xs text-default-500">
                        {item.type === "SERVICO" ? "Servico" : "Produto"} •{" "}
                        Uso no escritorio: {item.usageTotal}
                      </span>
                    </div>
                  </AutocompleteItem>
                )}
              </Autocomplete>
            </div>
            {selectedSearchClass ? (
              <div className="rounded-xl border border-secondary/25 bg-secondary/10 px-3 py-2">
                <p className="text-xs font-semibold text-secondary">
                  Classe {selectedSearchClass.codeDisplay} •{" "}
                  {selectedSearchClass.heading}
                </p>
                <p className="text-[11px] text-secondary/80">
                  {selectedSearchClass.description}
                </p>
              </div>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                isDisabled={
                  !catalogSearch.termo.trim() ||
                  isCatalogSyncStarting ||
                  isCatalogSyncRunning
                }
                isLoading={isCatalogSyncStarting}
                variant="flat"
                onPress={handleForceCatalogResync}
              >
                Reprocessar busca completa
              </Button>
              <Button
                color="secondary"
                isLoading={isCatalogLoading}
                startContent={<Search className="h-4 w-4" />}
                onPress={handleCatalogSearch}
              >
                Consultar catálogo
              </Button>
            </div>
            <p className="text-[11px] text-default-400">
              O resultado local aparece na hora. Em paralelo, a varredura completa
              oficial roda em background para evitar travamento.
            </p>

            {isCatalogLoading && catalogExecution ? (
              <div className="flex items-start gap-2 rounded-xl border border-primary/30 bg-primary/10 p-3">
                <LoaderCircle className="mt-0.5 h-4 w-4 animate-spin text-primary" />
                <div className="space-y-1">
                  <p className="text-xs font-medium text-primary">
                    Executando pesquisa para "{catalogExecution.termo}"
                    {catalogExecution.classeNice
                      ? ` · Classe ${catalogExecution.classeNice}`
                      : ""}
                  </p>
                  <p className="text-[11px] text-primary/80">
                    Primeiro mostramos o resultado local. A busca oficial completa
                    continua em background sem bloquear a tela.
                  </p>
                </div>
              </div>
            ) : null}

            {catalogSyncStatus ? (
              <div className="rounded-xl border border-warning/30 bg-warning/10 p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-warning-700 dark:text-warning-300">
                      Busca Oficial INPI
                    </p>
                    <p className="text-sm text-foreground">
                      {catalogSyncStatus.status === "QUEUED"
                        ? catalogSyncStatus.waitForGlobalSync
                          ? "Aguardando término de sincronização global já em execução."
                          : "Busca enfileirada para execução."
                        : catalogSyncStatus.status === "RUNNING"
                          ? "Varredura completa em execução."
                          : catalogSyncStatus.status === "CANCELED"
                            ? "Varredura completa cancelada."
                          : catalogSyncStatus.status === "COMPLETED"
                            ? "Varredura completa concluída."
                            : "Varredura completa falhou."}
                    </p>
                    <p className="text-[11px] text-default-500">
                      Termo: "{catalogSyncStatus.termo}"
                      {catalogSyncStatus.classeNice
                        ? ` · Classe ${catalogSyncStatus.classeNice.padStart(2, "0")}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {canCancelCatalogSync ? (
                      <Button
                        color="danger"
                        isDisabled={
                          isCatalogSyncCanceling || isCatalogSyncCancellationPending
                        }
                        isLoading={isCatalogSyncCanceling}
                        size="sm"
                        variant="flat"
                        onPress={handleCancelCatalogSync}
                      >
                        {isCatalogSyncCancellationPending ? "Cancelando..." : "Cancelar"}
                      </Button>
                    ) : null}
                    <CircularProgress
                      aria-label="Progresso da busca oficial INPI"
                      color="warning"
                      showValueLabel
                      size="lg"
                      value={Math.max(
                        1,
                        Math.min(100, catalogSyncStatus.progressPct || 0),
                      )}
                    />
                  </div>
                </div>

                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  <div className="rounded-lg border border-white/10 bg-background/50 p-2">
                    <p className="text-[11px] uppercase tracking-wide text-default-500">
                      Linhas varridas
                    </p>
                    <p className="text-sm font-semibold text-foreground">
                      {catalogSyncStatus.scannedRows.toLocaleString("pt-BR")}
                    </p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-background/50 p-2">
                    <p className="text-[11px] uppercase tracking-wide text-default-500">
                      Matches
                    </p>
                    <p className="text-sm font-semibold text-foreground">
                      {catalogSyncStatus.matchedRows.toLocaleString("pt-BR")}
                    </p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-background/50 p-2">
                    <p className="text-[11px] uppercase tracking-wide text-default-500">
                      ETA aproximado
                    </p>
                    <p className="text-sm font-semibold text-foreground">
                      {catalogSyncStatus.status === "RUNNING"
                        ? formatEta(catalogSyncEtaSeconds)
                        : catalogSyncStatus.status === "QUEUED"
                          ? "na fila"
                          : catalogSyncStatus.status === "CANCELED"
                            ? "cancelado"
                            : catalogSyncStatus.status === "FAILED"
                              ? "falhou"
                              : "finalizado"}
                    </p>
                  </div>
                </div>

                {catalogSyncStatus.status === "QUEUED" &&
                !catalogSyncStatus.waitForGlobalSync &&
                queuedElapsedSeconds >= 90 ? (
                  <p className="mt-2 text-[11px] text-warning-700 dark:text-warning-300">
                    Busca ainda na fila há {formatEta(queuedElapsedSeconds)}. Se
                    continuar assim, verifique se o worker assíncrono do ambiente
                    está ativo para consumir a fila.
                  </p>
                ) : null}

                {catalogSyncStatus.status === "QUEUED" &&
                catalogSyncStatus.waitForGlobalSync ? (
                  <p className="mt-2 text-[11px] text-warning-700 dark:text-warning-300">
                    Outro escritório já disparou este termo/classe. Este tenant
                    reaproveitará o resultado oficial ao concluir, sem duplicar
                    requisição no INPI.
                  </p>
                ) : null}

                {catalogSyncStatus.warning ? (
                  <p className="mt-2 text-[11px] text-warning-700 dark:text-warning-300">
                    {catalogSyncStatus.warning}
                  </p>
                ) : null}
                {catalogSyncStatus.error ? (
                  <p className="mt-2 text-[11px] text-danger-600 dark:text-danger-300">
                    {catalogSyncStatus.error}
                  </p>
                ) : null}
              </div>
            ) : null}

            {isCatalogLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, index) => (
                  <Skeleton
                    key={`catalog-skeleton-${index}`}
                    className="h-14 rounded-xl"
                    isLoaded={false}
                  />
                ))}
              </div>
            ) : catalogResults.length > 0 ? (
              <div className="max-h-[340px] space-y-2 overflow-y-auto pr-1">
                {catalogResults.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-xl border border-white/10 bg-background/50 px-3 py-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-foreground">
                        {item.nome}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        <Chip color="secondary" size="sm" variant="flat">
                          Score {item.score}
                        </Chip>
                        <Chip color="primary" size="sm" variant="flat">
                          Classe {item.classeNice || "N/I"}
                        </Chip>
                      </div>
                    </div>
                    <p className="text-xs text-default-400">
                      Processo: {item.processoNumero || "Não informado"} • Status:{" "}
                      {item.status}
                    </p>
                    {item.titular ? (
                      <p className="text-xs text-default-500">
                        Titular: {item.titular}
                      </p>
                    ) : null}
                    <p className="text-[11px] text-default-400">
                      Fonte:{" "}
                      {item.fonte === "inpi_dados_abertos_live"
                        ? "INPI Dados Abertos (catálogo oficial sincronizado)"
                        : item.fonte}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-default-400">
                Pesquise no catálogo para comparar nomes e apoiar a viabilidade.
              </p>
            )}
          </div>
        </PeoplePanel>
      </div>

      <PeoplePanel
        title="Histórico de buscas INPI"
        description="Rastreabilidade operacional das consultas executadas no escritório, com reprocessamento rápido."
      >
        <div className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_minmax(220px,1fr)_220px_180px]">
            <Input
              label="Buscar no histórico"
              placeholder="Termo, classe ou parte do nome"
              value={historyFilters.search}
              onValueChange={(value) => {
                setHistoryFilters((prev) => ({ ...prev, search: value }));
                setHistoryPage(1);
              }}
            />
            <Input
              label="Nº do processo INPI"
              placeholder="Ex.: 914102931"
              value={historyFilters.processNumber}
              onValueChange={(value) => {
                setHistoryFilters((prev) => ({ ...prev, processNumber: value }));
                setHistoryPage(1);
              }}
            />
            <Select
              label="Fonte"
              selectedKeys={
                HISTORICO_SOURCE_OPTIONS.some(
                  (option) => option.key === historyFilters.source,
                )
                  ? [historyFilters.source]
                  : ["all"]
              }
              onSelectionChange={(value) => {
                const selected = getSingleSelectionKey(value) || "all";
                setHistoryFilters((prev) => ({
                  ...prev,
                  source: selected,
                }));
                setHistoryPage(1);
              }}
            >
              {HISTORICO_SOURCE_OPTIONS.map((option) => (
                <SelectItem key={option.key} textValue={option.label}>
                  {option.label}
                </SelectItem>
              ))}
            </Select>
            <Select
              label="Por página"
              selectedKeys={[String(historyPageSize)]}
              onSelectionChange={(value) => {
                const selected = getSingleSelectionKey(value);
                if (!selected) {
                  return;
                }

                const parsed = Number(selected);
                if (!Number.isFinite(parsed) || parsed <= 0) {
                  return;
                }

                setHistoryPageSize(parsed);
                setHistoryPage(1);
              }}
            >
              {PAGE_SIZE_OPTIONS.map((option) => (
                <SelectItem key={String(option)} textValue={String(option)}>
                  {option}
                </SelectItem>
              ))}
            </Select>
          </div>

          <p className="text-xs text-default-400">
            Total no histórico: {historyTotal.toLocaleString("pt-BR")} registro(s).
          </p>
          {historyData?.warning ? (
            <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-[11px] text-warning-700 dark:text-warning-300">
              {historyData.warning}
            </p>
          ) : null}

          {isHistoryLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton
                  key={`history-skeleton-${index}`}
                  className="h-16 rounded-xl"
                  isLoaded={false}
                />
              ))}
            </div>
          ) : historyItems.length > 0 ? (
            <div className="space-y-2">
              {historyItems.map((item) => (
                <PeopleEntityCard
                  key={item.id}
                  isPressable
                  onPress={() => handleOpenHistoryDetails(item)}
                >
                  <PeopleEntityCardBody className="space-y-2">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-foreground">
                            {item.termo}
                          </p>
                          <Chip
                            color={getFonteChipColor(item.fonte)}
                            size="sm"
                            variant="flat"
                          >
                            {getFonteLabel(item.fonte)}
                          </Chip>
                          <Chip color="primary" size="sm" variant="flat">
                            Classe {item.classeNice || "N/I"}
                          </Chip>
                        </div>
                        <p className="text-xs text-default-500">
                          {item.totalEncontrado.toLocaleString("pt-BR")} resultado(s)
                          {" • "}
                          {new Date(item.createdAt).toLocaleString("pt-BR")}
                        </p>
                        <p className="text-[11px] text-default-400">
                          Responsável: {item.userName}
                          {item.userEmail ? ` (${item.userEmail})` : ""}
                        </p>
                      </div>
                      <div
                        className="flex items-center gap-2"
                        data-stop-card-press="true"
                      >
                        <Button
                          size="sm"
                          variant="flat"
                          isDisabled={isCatalogLoading || isCatalogSyncStarting}
                          onPress={() => handleRunFromHistory(item)}
                        >
                          Pesquisar novamente
                        </Button>
                        <Button
                          size="sm"
                          color="primary"
                          variant="flat"
                          onPress={() => handleOpenHistoryDetails(item)}
                        >
                          Ver resultados
                        </Button>
                      </div>
                    </div>
                  </PeopleEntityCardBody>
                </PeopleEntityCard>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-white/10 bg-background/50 p-5">
              <p className="text-sm text-default-400">
                Nenhuma busca encontrada com os filtros atuais.
              </p>
            </div>
          )}

          {historyTotalPages > 1 ? (
            <div className="flex justify-center">
              <Pagination
                isCompact
                showControls
                page={historyPage}
                total={historyTotalPages}
                onChange={setHistoryPage}
              />
            </div>
          ) : null}
        </div>
      </PeoplePanel>

      <Modal
        isOpen={Boolean(selectedHistoryLog)}
        size="5xl"
        scrollBehavior="inside"
        classNames={{
          wrapper: "items-end sm:items-center",
          base: "mx-2 my-2 w-[calc(100%-1rem)] max-h-[94dvh] sm:mx-0 sm:w-full sm:max-h-[90dvh]",
          body: "overflow-y-auto",
        }}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedHistoryLog(null);
            setHistoryDetailsPage(1);
            setHistoryDetailsProcessFilter("");
          }
        }}
      >
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1">
            <span className="text-base font-semibold">
              Resultados detalhados da busca INPI
            </span>
            <span className="text-xs font-normal text-default-500">
              Termo: "{historyDetailsData?.log.termo || selectedHistoryLog?.termo}"
              {" • "}
              Fonte:{" "}
              {getFonteLabel(
                historyDetailsData?.log.fonte || selectedHistoryLog?.fonte || "",
              )}
            </span>
          </ModalHeader>
          <ModalBody className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Chip color="primary" variant="flat">
                Classe{" "}
                {historyDetailsData?.log.classeNice ||
                  selectedHistoryLog?.classeNice ||
                  "N/I"}
              </Chip>
              <Chip
                color={getFonteChipColor(
                  historyDetailsData?.log.fonte || selectedHistoryLog?.fonte || "",
                )}
                variant="flat"
              >
                {getFonteLabel(
                  historyDetailsData?.log.fonte || selectedHistoryLog?.fonte || "",
                )}
              </Chip>
              <Chip color="secondary" variant="flat">
                {historyDetailsData?.total.toLocaleString("pt-BR") || "0"} item(ns)
              </Chip>
              <Chip color="default" variant="flat">
                {historyDetailsData?.log.userName ||
                  selectedHistoryLog?.userName ||
                  "Sistema"}
              </Chip>
            </div>

            <Input
              label="Filtrar por nº do processo INPI"
              placeholder="Ex.: 914102931"
              value={historyDetailsProcessFilter}
              onValueChange={(value) => {
                setHistoryDetailsProcessFilter(value);
                setHistoryDetailsPage(1);
              }}
            />

            {historyDetailsData?.warning ? (
              <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-[11px] text-warning-700 dark:text-warning-300">
                {historyDetailsData.warning}
              </p>
            ) : null}

            {isHistoryDetailsLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton
                    key={`history-detail-skeleton-${index}`}
                    className="h-16 rounded-xl"
                    isLoaded={false}
                  />
                ))}
              </div>
            ) : historyDetailsData?.items.length ? (
              <div className="max-h-[36dvh] space-y-2 overflow-y-auto pr-1 sm:max-h-[52vh]">
                {historyDetailsData.items.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-xl border border-white/10 bg-background/50 px-3 py-2"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-foreground">
                          {item.nome}
                        </p>
                        <p className="text-xs text-default-500">
                          Processo: {item.processoNumero || "Não informado"}
                          {" • "}
                          Status: {item.status}
                        </p>
                        <p className="text-[11px] text-default-400">
                          Titular: {item.titular || "Não informado"}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Chip color="secondary" size="sm" variant="flat">
                          Score {item.score}
                        </Chip>
                        <Chip color="primary" size="sm" variant="flat">
                          Classe {item.classeNice || "N/I"}
                        </Chip>
                        <Chip
                          color={getFonteChipColor(item.fonte)}
                          size="sm"
                          variant="flat"
                        >
                          {getFonteLabel(item.fonte)}
                        </Chip>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-white/10 bg-background/50 p-5">
                <p className="text-sm text-default-400">
                  Não há itens detalhados para este termo na base atual.
                </p>
              </div>
            )}

            {historyDetailsData && historyDetailsData.totalPages > 1 ? (
              <div className="flex justify-center">
                <Pagination
                  isCompact
                  showControls
                  page={historyDetailsData.page}
                  total={historyDetailsData.totalPages}
                  onChange={setHistoryDetailsPage}
                />
              </div>
            ) : null}
          </ModalBody>
          <ModalFooter>
            <Button
              variant="flat"
              onPress={() => {
                if (!selectedHistoryLog) {
                  return;
                }
                handleRunFromHistory(selectedHistoryLog);
              }}
            >
              Pesquisar novamente
            </Button>
            <Button
              color="primary"
              onPress={() => {
                setSelectedHistoryLog(null);
                setHistoryDetailsPage(1);
              }}
            >
              Fechar
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <PeoplePanel
        title="Dossiês do escritório"
        description="Gestão multi-tenant: cada tenant só visualiza e opera seus próprios dossiês."
      >
        <div className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(280px,1fr)_220px_220px_180px]">
            <Input
              label="Buscar dossiê"
              placeholder="Nome pretendido"
              value={filtros.search}
              onValueChange={(value) => {
                setFiltros((prev) => ({ ...prev, search: value }));
                setPage(1);
              }}
            />
            <Select
              label="Status"
              selectedKeys={
                STATUS_OPTIONS.some((option) => option.key === filtros.status)
                  ? [filtros.status]
                  : ["all"]
              }
              onSelectionChange={(value) => {
                const selected = getSingleSelectionKey(value) || "all";
                setFiltros((prev) => ({
                  ...prev,
                  status: selected as DossieStatusFilter,
                }));
                setPage(1);
              }}
            >
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.key} textValue={option.label}>
                  {option.label}
                </SelectItem>
              ))}
            </Select>
            <Select
              label="Risco"
              selectedKeys={
                RISCO_OPTIONS.some((option) => option.key === filtros.risco)
                  ? [filtros.risco]
                  : ["all"]
              }
              onSelectionChange={(value) => {
                const selected = getSingleSelectionKey(value) || "all";
                setFiltros((prev) => ({
                  ...prev,
                  risco: selected as DossieRiscoFilter,
                }));
                setPage(1);
              }}
            >
              {RISCO_OPTIONS.map((option) => (
                <SelectItem key={option.key} textValue={option.label}>
                  {option.label}
                </SelectItem>
              ))}
            </Select>
            <Select
              label="Por página"
              selectedKeys={[String(pageSize)]}
              onSelectionChange={(value) => {
                const selected = getSingleSelectionKey(value);

                if (!selected) {
                  return;
                }

                const parsed = Number(selected);

                if (!Number.isFinite(parsed) || parsed <= 0) {
                  return;
                }

                setPageSize(parsed);
                setPage(1);
              }}
            >
              {PAGE_SIZE_OPTIONS.map((option) => (
                <SelectItem key={String(option)} textValue={String(option)}>
                  {option}
                </SelectItem>
              ))}
            </Select>
          </div>

          <div className="flex justify-end">
            <Button variant="flat" onPress={clearFilters}>
              Limpar filtros
            </Button>
          </div>

          {isDossiesLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton
                  key={`dossie-skeleton-${index}`}
                  className="h-28 rounded-xl"
                  isLoaded={false}
                />
              ))}
            </div>
          ) : dossieItems.length > 0 ? (
            <div className="space-y-3">
              {dossieItems.map((dossie) => (
                <PeopleEntityCard
                  key={dossie.id}
                  isPressable
                  onPress={() => openDossieModal(dossie)}
                >
                  <PeopleEntityCardBody className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-semibold text-foreground">
                            {dossie.nomePretendido}
                          </h3>
                          <Chip color="primary" size="sm" variant="flat">
                            Classe {dossie.classeNice || "N/I"}
                          </Chip>
                          <Chip
                            color={getStatusColor(dossie.status)}
                            size="sm"
                            variant="flat"
                          >
                            {STATUS_LABELS[dossie.status]}
                          </Chip>
                          <Chip
                            color={getRiscoColor(dossie.riscoAtual)}
                            size="sm"
                            variant="flat"
                          >
                            Risco {RISCO_LABELS[dossie.riscoAtual]}
                          </Chip>
                        </div>
                        <p className="text-xs text-default-400">
                          Segmento: {dossie.segmento || "Não informado"}
                        </p>
                        <p className="text-xs text-default-500">
                          {dossie.resumoAnalise || "Aguardando análise do catálogo."}
                        </p>
                      </div>
                      <div
                        className="flex flex-wrap gap-2"
                        data-stop-card-press="true"
                      >
                        <Button
                          size="sm"
                          variant="flat"
                          isDisabled={!canWrite}
                          isLoading={isReanalyzingId === dossie.id}
                          onPress={() => handleReanalyze(dossie.id)}
                        >
                          Reanalisar
                        </Button>
                        <Button
                          size="sm"
                          color="primary"
                          variant="flat"
                          onPress={() => openDossieModal(dossie)}
                        >
                          Ver detalhes
                        </Button>
                      </div>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2">
                      {dossie.topColisoes.length ? (
                        dossie.topColisoes.map((colisao) => (
                          <div
                            key={colisao.id}
                            className="rounded-lg border border-white/10 bg-background/40 px-3 py-2"
                          >
                            <p className="text-xs font-semibold text-foreground">
                              {colisao.marcaNome}
                            </p>
                            <p className="text-[11px] text-default-400">
                              Score {colisao.score} • Classe{" "}
                              {colisao.marcaClasseNice || "N/I"} •{" "}
                              {colisao.marcaStatus}
                            </p>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-lg border border-success/20 bg-success/10 px-3 py-2">
                          <p className="text-xs text-success">
                            Nenhuma colisão relevante detectada.
                          </p>
                        </div>
                      )}
                    </div>

                    <p className="text-[11px] text-default-400">
                      Colisões mapeadas: {dossie.colisoesCount} (card mostra prévia) • Atualizado em{" "}
                      {new Date(dossie.updatedAt).toLocaleString("pt-BR")}
                    </p>
                  </PeopleEntityCardBody>
                </PeopleEntityCard>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-white/10 bg-background/50 p-5">
              <p className="text-sm text-default-400">
                Nenhum dossiê encontrado com os filtros atuais.
              </p>
            </div>
          )}

          {totalPages > 1 ? (
            <div className="flex justify-center">
              <Pagination
                isCompact
                showControls
                page={page}
                total={totalPages}
                onChange={setPage}
              />
            </div>
          ) : null}
        </div>
      </PeoplePanel>

      <Modal
        isOpen={Boolean(selectedDossie)}
        size="4xl"
        scrollBehavior="inside"
        classNames={{
          wrapper: "items-end sm:items-center",
          base: "mx-2 my-2 w-[calc(100%-1rem)] max-h-[94dvh] sm:mx-0 sm:w-full sm:max-h-[90dvh]",
          body: "overflow-y-auto",
        }}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedDossie(null);
            setDossieColisoesPage(1);
            setDossieColisoesSearch("");
          }
        }}
      >
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1">
            <span className="text-base font-semibold">
              Dossiê INPI • {selectedDossie?.nomePretendido}
            </span>
            <span className="text-xs font-normal text-default-500">
              Atualize status, registre observações e reanalise colisões do
              catálogo global.
            </span>
          </ModalHeader>
          <ModalBody className="space-y-4">
            {selectedDossie ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Chip color="primary" variant="flat">
                    Classe {selectedDossie.classeNice || "N/I"}
                  </Chip>
                  <Chip
                    color={getStatusColor(selectedDossie.status)}
                    variant="flat"
                  >
                    {STATUS_LABELS[selectedDossie.status]}
                  </Chip>
                  <Chip
                    color={getRiscoColor(selectedDossie.riscoAtual)}
                    variant="flat"
                  >
                    Risco {RISCO_LABELS[selectedDossie.riscoAtual]}
                  </Chip>
                </div>

                <div className="grid gap-3 lg:grid-cols-3">
                  <Select
                    label="Status operacional"
                    selectedKeys={
                      modalStatus &&
                      STATUS_OPTIONS.some((option) => option.key === modalStatus)
                        ? [modalStatus]
                        : []
                    }
                    onSelectionChange={(value) => {
                      const selected = getSingleSelectionKey(value);

                      if (!selected) {
                        return;
                      }

                      setModalStatus(selected as InpiDossieStatus);
                    }}
                  >
                    {STATUS_OPTIONS.filter((option) => option.key !== "all").map(
                      (option) => (
                        <SelectItem key={option.key} textValue={option.label}>
                          {option.label}
                        </SelectItem>
                      ),
                    )}
                  </Select>
                  <Autocomplete
                    allowsCustomValue={false}
                    isClearable
                    items={niceClasses}
                    label="Classe NICE"
                    listboxProps={{
                      emptyContent: "Nenhuma classe NICE encontrada",
                    }}
                    placeholder="Sem classe"
                    selectedKey={modalClasseNice || null}
                    onSelectionChange={(key) => {
                      setModalClasseNice(key ? String(key) : "");
                    }}
                  >
                    {(item) => (
                      <AutocompleteItem
                        key={item.code}
                        textValue={`Classe ${item.codeDisplay} - ${item.heading}`}
                      >
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-foreground">
                            Classe {item.codeDisplay} - {item.heading}
                          </span>
                          <span className="text-xs text-default-500">
                            {item.type === "SERVICO" ? "Servico" : "Produto"}
                          </span>
                        </div>
                      </AutocompleteItem>
                    )}
                  </Autocomplete>
                  <Input
                    isReadOnly
                    label="Segmento"
                    value={selectedDossie.segmento || "Não informado"}
                  />
                </div>

                {selectedModalClass ? (
                  <div className="rounded-xl border border-secondary/25 bg-secondary/10 px-3 py-2">
                    <p className="text-xs font-semibold text-secondary">
                      Classe {selectedModalClass.codeDisplay} •{" "}
                      {selectedModalClass.heading}
                    </p>
                    <p className="text-[11px] text-secondary/80">
                      {selectedModalClass.description}
                    </p>
                  </div>
                ) : (
                  <p className="text-[11px] text-default-400">
                    Sem classe definida. Defina uma classe para análise de colisão
                    mais precisa.
                  </p>
                )}
                <p className="text-[11px] text-warning-500">
                  Ao alterar a classe NICE, o sistema reanalisa automaticamente as
                  colisões do dossiê.
                </p>

                <Textarea
                  label="Observações do escritório"
                  minRows={3}
                  value={modalObservacoes}
                  onValueChange={setModalObservacoes}
                />

                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-default-500">
                    Colisões encontradas ({dossieColisoesTotal})
                  </p>
                  <Input
                    label="Filtrar colisões (nome/titular/processo)"
                    placeholder="Ex.: NONATOS ou 917654706"
                    value={dossieColisoesSearch}
                    onValueChange={(value) => {
                      setDossieColisoesSearch(value);
                      setDossieColisoesPage(1);
                    }}
                  />
                  {isDossieColisoesLoading ? (
                    <div className="space-y-2">
                      {Array.from({ length: 3 }).map((_, index) => (
                        <Skeleton
                          key={`dossie-colisoes-skeleton-${index}`}
                          className="h-16 rounded-xl"
                          isLoaded={false}
                        />
                      ))}
                    </div>
                  ) : dossieColisoesItems.length ? (
                    <div className="max-h-[34dvh] space-y-2 overflow-y-auto pr-1 sm:max-h-[42vh]">
                      {dossieColisoesItems.map((colisao) => (
                        <div
                          key={colisao.id}
                          className="rounded-lg border border-white/10 bg-background/50 px-3 py-2"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm text-foreground">
                              {colisao.marcaNome}
                            </p>
                            <div className="flex gap-1.5">
                              <Chip size="sm" variant="flat">
                                Score {colisao.score}
                              </Chip>
                              <Chip
                                color={getRiscoColor(colisao.nivelRisco)}
                                size="sm"
                                variant="flat"
                              >
                                {RISCO_LABELS[colisao.nivelRisco]}
                              </Chip>
                            </div>
                          </div>
                          <p className="text-xs text-default-500">
                            Processo {colisao.marcaProcessoNumero || "N/I"} • Classe{" "}
                            {colisao.marcaClasseNice || "N/I"} • {colisao.marcaStatus}
                          </p>
                          <p className="text-[11px] text-default-400">
                            Titular: {colisao.marcaTitular || "Não informado"}
                          </p>
                          {colisao.justificativa ? (
                            <p className="text-[11px] text-default-500">
                              {colisao.justificativa}
                            </p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-success/20 bg-success/10 p-3 text-xs text-success">
                      Sem colisões relevantes neste momento.
                    </div>
                  )}
                  {dossieColisoesTotalPages > 1 ? (
                    <div className="flex justify-center">
                      <Pagination
                        isCompact
                        showControls
                        page={dossieColisoesData?.page || dossieColisoesPage}
                        total={dossieColisoesTotalPages}
                        onChange={setDossieColisoesPage}
                      />
                    </div>
                  ) : null}
                </div>

                <div className="rounded-lg border border-white/10 bg-background/50 px-3 py-2 text-[11px] text-default-500">
                  Criado em{" "}
                  {new Date(selectedDossie.createdAt).toLocaleString("pt-BR")} •
                  Atualizado em{" "}
                  {new Date(selectedDossie.updatedAt).toLocaleString("pt-BR")}
                </div>
              </>
            ) : null}
          </ModalBody>
          <ModalFooter>
            <Button
              variant="flat"
              startContent={
                selectedDossie?.colisoesCount ? (
                  <ShieldAlert className="h-4 w-4" />
                ) : (
                  <ShieldCheck className="h-4 w-4" />
                )
              }
              isDisabled={!selectedDossie || !canWrite}
              isLoading={Boolean(selectedDossie && isReanalyzingId === selectedDossie.id)}
              onPress={() => {
                if (!selectedDossie) {
                  return;
                }

                handleReanalyze(selectedDossie.id);
              }}
            >
              Reanalisar agora
            </Button>
            <Button
              color="primary"
              isDisabled={!selectedDossie || !canWrite}
              isLoading={isSavingStatus}
              onPress={handleSaveModalStatus}
            >
              Salvar alterações
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
