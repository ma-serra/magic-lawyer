"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import {
  AlertTriangle,
  ArrowUpRight,
  BellRing,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  ExternalLink,
  FileSearch,
  FileText,
  FolderSync,
  Gavel,
  Radar,
  RefreshCw,
  Scale,
  Search,
  Send,
  ShieldAlert,
} from "lucide-react";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  Chip,
  Input,
  Pagination,
  Spinner,
  Tab,
  Tabs,
} from "@heroui/react";

import { getOperacoesJuridicasWorkspace } from "@/app/actions/operacoes-juridicas";
import {
  gerarNovoCaptchaSincronizacaoMeusProcessos,
  getStatusSincronizacaoMeusProcessos,
  getTribunaisSincronizacaoPortalAdvogado,
  iniciarSincronizacaoMeusProcessos,
  resolverCaptchaSincronizacaoMeusProcessos,
} from "@/app/actions/portal-advogado";
import { capturarProcessoAction } from "@/app/actions/juridical-capture";
import { importarProcessosPlanilha } from "@/app/actions/processos-importacao";
import { marcarAndamentoResolvido } from "@/app/actions/andamentos";
import { protocolarPeticao } from "@/app/actions/peticoes";
import { usePermissionCheck } from "@/app/hooks/use-permission-check";
import {
  getCommunicationKindTone,
  getCommunicationStatusTone,
  getProtocolReadinessTone,
} from "@/app/lib/juridical/operations-hub";
import {
  PeopleEmptyState,
  PeopleMetricCard,
  PeoplePageHeader,
  PeoplePanel,
} from "@/components/people-ui";
import {
  SearchableSelect,
  type SearchableSelectOption,
} from "@/components/searchable-select";
import { toast } from "@/lib/toast";

type WorkspaceResponse = Awaited<ReturnType<typeof getOperacoesJuridicasWorkspace>>;
type WorkspaceData = NonNullable<WorkspaceResponse["data"]>;

type CommunicationItem = WorkspaceData["communications"]["items"][number];
type DiscoveryItem = WorkspaceData["discovery"]["recentProcesses"][number];
type DiscoveryBacklogItem = WorkspaceData["discovery"]["backlog"][number];
type SyncHistoryItem = WorkspaceData["discovery"]["syncHistory"][number];
type ProtocolItem = WorkspaceData["protocols"]["items"][number];

const COMMUNICATION_TYPE_OPTIONS: SearchableSelectOption[] = [
  { key: "all", label: "Todas as categorias" },
  { key: "INTIMACAO", label: "Intimações" },
  { key: "PUBLICACAO", label: "Publicações" },
  { key: "AUDIENCIA", label: "Audiências" },
  { key: "PRAZO", label: "Prazos" },
  { key: "MOVIMENTACAO_RELEVANTE", label: "Movimentações relevantes" },
];

const COMMUNICATION_STATUS_OPTIONS: SearchableSelectOption[] = [
  { key: "all", label: "Todos os status" },
  { key: "NOVO", label: "Novo" },
  { key: "EM_TRIAGEM", label: "Em triagem" },
  { key: "EM_EXECUCAO", label: "Em execução" },
  { key: "RESOLVIDO", label: "Resolvido" },
  { key: "BLOQUEADO", label: "Bloqueado" },
];

const PROTOCOL_BUCKET_OPTIONS: SearchableSelectOption[] = [
  { key: "all", label: "Toda a fila" },
  { key: "READY", label: "Prontas" },
  { key: "ATTENTION", label: "Em revisão" },
  { key: "BLOCKED", label: "Bloqueadas" },
  { key: "PROTOCOLADA", label: "Protocoladas" },
  { key: "ARQUIVADA", label: "Arquivadas" },
];

const PAGE_SIZE = 12;

function formatDateTime(value?: string | null) {
  if (!value) return "Sem registro";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatDate(value?: string | null) {
  if (!value) return "Sem data";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function formatRelativeDays(value?: string | null) {
  if (!value) return null;
  const now = new Date();
  const date = new Date(value);
  const diff = Math.ceil((date.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

  if (diff < 0) return `${Math.abs(diff)} dia(s) atrás`;
  if (diff === 0) return "Hoje";
  return `Em ${diff} dia(s)`;
}

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function buildCommunicationSearchBlob(item: CommunicationItem) {
  return normalizeSearch(
    [
      item.kindLabel,
      item.titulo,
      item.descricao,
      item.processo.numero,
      item.processo.titulo,
      item.processo.clienteNome,
      item.processo.tribunalSigla,
      item.processo.advogadoResponsavelNome,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function buildProtocolSearchBlob(item: ProtocolItem) {
  return normalizeSearch(
    [
      item.titulo,
      item.tipo,
      item.processo.numero,
      item.processo.titulo,
      item.processo.clienteNome,
      item.causaNome,
      item.modeloNome,
      item.criadoPorNome,
      item.readiness.label,
      item.readiness.blockers.join(" "),
      item.readiness.attentionPoints.join(" "),
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function paginate<T>(items: T[], page: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * PAGE_SIZE;

  return {
    page: safePage,
    totalPages,
    items: items.slice(start, start + PAGE_SIZE),
  };
}

export function OperacoesJuridicasContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { hasPermission: canEditProcesses } = usePermissionCheck(
    "processos",
    "editar",
    { enableEarlyAccess: true },
  );
  const [selectedTab, setSelectedTab] = useState<
    "communications" | "discovery" | "protocols"
  >("communications");
  const [communicationSearch, setCommunicationSearch] = useState("");
  const [communicationType, setCommunicationType] = useState<string>("all");
  const [communicationStatus, setCommunicationStatus] = useState<string>("all");
  const [communicationPage, setCommunicationPage] = useState(1);
  const [protocolSearch, setProtocolSearch] = useState("");
  const [protocolBucket, setProtocolBucket] = useState<string>("all");
  const [protocolPage, setProtocolPage] = useState(1);
  const [captureNumero, setCaptureNumero] = useState("");
  const [captureTribunal, setCaptureTribunal] = useState<string | null>(null);
  const [captureCliente, setCaptureCliente] = useState("");
  const [syncTribunal, setSyncTribunal] = useState<string | null>(null);
  const [syncOab, setSyncOab] = useState("");
  const [syncCliente, setSyncCliente] = useState("");
  const [captchaText, setCaptchaText] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [createClientAccess, setCreateClientAccess] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isResolvingCaptcha, setIsResolvingCaptcha] = useState(false);
  const [isRefreshingCaptcha, setIsRefreshingCaptcha] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [protocolDraft, setProtocolDraft] = useState<{
    peticaoId: string;
    numero: string;
  } | null>(null);
  const [protocolSubmittingId, setProtocolSubmittingId] = useState<string | null>(
    null,
  );
  const [resolvingMovementId, setResolvingMovementId] = useState<string | null>(
    null,
  );

  const {
    data: workspace,
    error,
    isLoading,
    mutate,
  } = useSWR("operacoes-juridicas-workspace", async () => {
    const result = await getOperacoesJuridicasWorkspace();
    if (!result.success || !result.data) {
      throw new Error(result.error || "Falha ao montar operações jurídicas");
    }
    return result.data;
  });

  const { data: syncStatusResponse, mutate: mutateSyncStatus } = useSWR(
    "portal-advogado-operacoes-sync-status",
    () => getStatusSincronizacaoMeusProcessos(),
    {
      refreshInterval: (latestData) => {
        const status = latestData?.status?.status;
        return status === "QUEUED" || status === "RUNNING" || status === "WAITING_CAPTCHA"
          ? 5000
          : 0;
      },
    },
  );

  const { data: tribunaisResponse } = useSWR(
    "portal-advogado-operacoes-tribunais",
    getTribunaisSincronizacaoPortalAdvogado,
  );

  const tribunalOptions = useMemo<SearchableSelectOption[]>(
    () =>
      (tribunaisResponse?.success ? tribunaisResponse.tribunais : []).map(
        (tribunal) => ({
          key: tribunal.sigla,
          label: tribunal.sigla,
          textValue: `${tribunal.sigla} ${tribunal.nome} ${tribunal.uf}`,
          description: `${tribunal.nome} • ${tribunal.uf}`,
        }),
      ),
    [tribunaisResponse],
  );

  const selectedSyncStatus = syncStatusResponse?.status;

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "discovery" || tab === "protocols") {
      setSelectedTab(tab);
      return;
    }
    if (tab === "communications") {
      setSelectedTab("communications");
    }
  }, [searchParams]);

  useEffect(() => {
    if (!captureTribunal && tribunalOptions.length > 0) {
      setCaptureTribunal(String(tribunalOptions[0].key));
    }

    if (!syncTribunal && tribunalOptions.length > 0) {
      setSyncTribunal(String(tribunalOptions[0].key));
    }
  }, [captureTribunal, syncTribunal, tribunalOptions]);

  const filteredCommunications = useMemo(() => {
    const searchTerm = normalizeSearch(communicationSearch);
    const items = workspace?.communications.items ?? [];

    return items.filter((item) => {
      if (communicationType !== "all" && item.kind !== communicationType) {
        return false;
      }

      if (
        communicationStatus !== "all" &&
        item.statusOperacional !== communicationStatus
      ) {
        return false;
      }

      if (!searchTerm) return true;
      return buildCommunicationSearchBlob(item).includes(searchTerm);
    });
  }, [
    communicationSearch,
    communicationStatus,
    communicationType,
    workspace?.communications.items,
  ]);

  const filteredProtocols = useMemo(() => {
    const searchTerm = normalizeSearch(protocolSearch);
    const items = workspace?.protocols.items ?? [];

    return items.filter((item) => {
      if (protocolBucket !== "all" && item.readiness.status !== protocolBucket) {
        return false;
      }

      if (!searchTerm) return true;
      return buildProtocolSearchBlob(item).includes(searchTerm);
    });
  }, [protocolBucket, protocolSearch, workspace?.protocols.items]);

  const pagedCommunications = useMemo(
    () => paginate(filteredCommunications, communicationPage),
    [communicationPage, filteredCommunications],
  );

  const pagedProtocols = useMemo(
    () => paginate(filteredProtocols, protocolPage),
    [filteredProtocols, protocolPage],
  );

  const activeMetrics = useMemo(() => {
    if (!workspace) return [];

    if (selectedTab === "communications") {
      return [
        {
          label: "No radar",
          value: workspace.communications.summary.total,
          helper: "Itens operacionais classificados como comunicação",
          tone: "primary" as const,
          icon: <BellRing className="h-4 w-4" />,
        },
        {
          label: "Últimas 24h",
          value: workspace.communications.summary.last24h,
          helper: "Novas publicações, intimações e sinais relevantes",
          tone: "secondary" as const,
          icon: <Radar className="h-4 w-4" />,
        },
        {
          label: "Triagem pendente",
          value: workspace.communications.summary.triage,
          helper: "Itens ainda não encerrados operacionalmente",
          tone: "warning" as const,
          icon: <ShieldAlert className="h-4 w-4" />,
        },
        {
          label: "Críticos",
          value: workspace.communications.summary.critical,
          helper: "Prazos ou eventos que exigem reação imediata",
          tone: "danger" as const,
          icon: <AlertTriangle className="h-4 w-4" />,
        },
      ];
    }

    if (selectedTab === "discovery") {
      return [
        {
          label: "Processos base",
          value: workspace.discovery.summary.totalProcessos,
          helper: "Carteira total observada pelo hub",
          tone: "primary" as const,
          icon: <FolderSync className="h-4 w-4" />,
        },
        {
          label: "Com tribunal",
          value: workspace.discovery.summary.processosComTribunal,
          helper: "Já vinculados a uma origem jurídica concreta",
          tone: "success" as const,
          icon: <Scale className="h-4 w-4" />,
        },
        {
          label: "Sem movimentação",
          value: workspace.discovery.summary.processosSemMovimentacao,
          helper: "Backlog que ainda depende de captura real",
          tone: "warning" as const,
          icon: <Clock3 className="h-4 w-4" />,
        },
        {
          label: "Sem responsável",
          value: workspace.discovery.summary.processosSemResponsavel,
          helper: "Risco operacional de carteira sem dono",
          tone: "danger" as const,
          icon: <Gavel className="h-4 w-4" />,
        },
      ];
    }

    return [
      {
        label: "Prontas",
        value: workspace.protocols.summary.prontas,
        helper: "Pacotes com documento e contexto mínimos para protocolar",
        tone: "success" as const,
        icon: <ClipboardCheck className="h-4 w-4" />,
      },
      {
        label: "Em revisão",
        value: workspace.protocols.summary.revisao,
        helper: "Atenções antes de gerar número de protocolo",
        tone: "warning" as const,
        icon: <FileSearch className="h-4 w-4" />,
      },
      {
        label: "Bloqueadas",
        value: workspace.protocols.summary.bloqueadas,
        helper: "Faltam documento principal ou saneamento da peça",
        tone: "danger" as const,
        icon: <AlertTriangle className="h-4 w-4" />,
      },
      {
        label: "Protocoladas",
        value: workspace.protocols.summary.protocoladas,
        helper: "Peças já encerradas com número registrado",
        tone: "primary" as const,
        icon: <Send className="h-4 w-4" />,
      },
    ];
  }, [selectedTab, workspace]);

  const handleCaptureByNumero = async () => {
    if (!captureNumero.trim()) {
      toast.error("Informe o número do processo para capturar.");
      return;
    }

    setIsCapturing(true);
    try {
      const result = await capturarProcessoAction({
        numeroProcesso: captureNumero.trim(),
        tribunalSigla: captureTribunal || undefined,
        clienteNome: captureCliente.trim() || undefined,
      });

      if (!result.success) {
        throw new Error(
          "error" in result && result.error
            ? result.error
            : "Falha na captura manual.",
        );
      }

      toast.success(
        `${"syncedCount" in result ? result.syncedCount ?? 1 : 1} processo(s) sincronizado(s) com sucesso.`,
      );
      setCaptureNumero("");
      setCaptureCliente("");
      await mutate();
    } catch (captureError) {
      toast.error(
        captureError instanceof Error
          ? captureError.message
          : "Falha na captura manual.",
      );
    } finally {
      setIsCapturing(false);
    }
  };

  const handleStartOabSync = async () => {
    setIsSyncing(true);
    try {
      const result = await iniciarSincronizacaoMeusProcessos({
        tribunalSigla: syncTribunal || undefined,
        oab: syncOab.trim() || undefined,
        clienteNome: syncCliente.trim() || undefined,
      });

      if (!result.success) {
        throw new Error(result.error || "Falha ao iniciar discovery por OAB.");
      }

      toast.success("Discovery por OAB iniciado.");
      setCaptchaText("");
      await Promise.all([mutateSyncStatus(), mutate()]);
    } catch (syncError) {
      toast.error(
        syncError instanceof Error
          ? syncError.message
          : "Falha ao iniciar discovery por OAB.",
      );
    } finally {
      setIsSyncing(false);
    }
  };

  const handleResolveCaptcha = async () => {
    if (!selectedSyncStatus?.syncId || !captchaText.trim()) {
      toast.error("Informe o captcha para retomar o discovery.");
      return;
    }

    setIsResolvingCaptcha(true);
    try {
      const result = await resolverCaptchaSincronizacaoMeusProcessos({
        syncId: selectedSyncStatus.syncId,
        captchaText: captchaText.trim(),
      });

      if (!result.success) {
        throw new Error(result.error || "Falha ao resolver captcha.");
      }

      toast.success("Captcha enviado. O workflow voltou para a fila.");
      setCaptchaText("");
      await Promise.all([mutateSyncStatus(), mutate()]);
    } catch (captchaError) {
      toast.error(
        captchaError instanceof Error
          ? captchaError.message
          : "Falha ao resolver captcha.",
      );
    } finally {
      setIsResolvingCaptcha(false);
    }
  };

  const handleRefreshCaptcha = async () => {
    if (!selectedSyncStatus?.syncId) return;

    setIsRefreshingCaptcha(true);
    try {
      const result = await gerarNovoCaptchaSincronizacaoMeusProcessos({
        syncId: selectedSyncStatus.syncId,
      });

      if (!result.success) {
        throw new Error(result.error || "Falha ao renovar captcha.");
      }

      toast.success("Novo captcha solicitado.");
      await mutateSyncStatus();
    } catch (captchaError) {
      toast.error(
        captchaError instanceof Error
          ? captchaError.message
          : "Falha ao renovar captcha.",
      );
    } finally {
      setIsRefreshingCaptcha(false);
    }
  };

  const handleImportSpreadsheet = async () => {
    if (!importFile) {
      toast.error("Selecione a planilha para importar.");
      return;
    }

    setIsImporting(true);
    try {
      const formData = new FormData();
      formData.set("arquivo", importFile);
      formData.set("criarAcessoClientes", String(createClientAccess));

      const result = await importarProcessosPlanilha(formData);

      if (!result.success) {
        throw new Error(
          result.erros?.join(" ") || "Falha ao importar a planilha.",
        );
      }

      toast.success(
        `${result.createdProcessos} criado(s), ${result.updatedProcessos} atualizado(s).`,
      );
      setImportFile(null);
      setCreateClientAccess(false);
      await mutate();
    } catch (importError) {
      toast.error(
        importError instanceof Error
          ? importError.message
          : "Falha ao importar a planilha.",
      );
    } finally {
      setIsImporting(false);
    }
  };

  const handleResolveMovement = async (movementId: string) => {
    setResolvingMovementId(movementId);
    try {
      const result = await marcarAndamentoResolvido(movementId);
      if (!result.success) {
        throw new Error(result.error || "Falha ao resolver a comunicação.");
      }
      toast.success("Item resolvido no fluxo operacional.");
      await mutate();
    } catch (actionError) {
      toast.error(
        actionError instanceof Error
          ? actionError.message
          : "Falha ao resolver a comunicação.",
      );
    } finally {
      setResolvingMovementId(null);
    }
  };

  const handleProtocol = async (peticaoId: string) => {
    const numero = protocolDraft?.peticaoId === peticaoId ? protocolDraft.numero : "";

    if (!numero.trim()) {
      toast.error("Informe o número do protocolo.");
      return;
    }

    setProtocolSubmittingId(peticaoId);
    try {
      const result = await protocolarPeticao(peticaoId, numero.trim());
      if (!result.success) {
        throw new Error(result.error || "Falha ao protocolar a petição.");
      }

      toast.success(result.message || "Petição protocolada.");
      setProtocolDraft(null);
      await mutate();
    } catch (protocolError) {
      toast.error(
        protocolError instanceof Error
          ? protocolError.message
          : "Falha ao protocolar a petição.",
      );
    } finally {
      setProtocolSubmittingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PeoplePageHeader
        title="Operações Jurídicas"
        description="Central operacional para atacar as três frentes que mais pesam no escritório: comunicações processuais, discovery em escala e fila de protocolos. Tudo aqui usa dados reais do tenant e não inventa trilhas que o sistema ainda não tem."
        tag="Core operacional"
        actions={
          <>
            <Button
              variant="bordered"
              startContent={<ExternalLink className="h-4 w-4" />}
              onPress={() => router.push("/portal-advogado")}
            >
              Abrir Portal do Advogado
            </Button>
            <Button
              color="primary"
              startContent={<RefreshCw className="h-4 w-4" />}
              onPress={() => {
                void mutate();
                void mutateSyncStatus();
              }}
            >
              Atualizar leitura
            </Button>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {activeMetrics.map((metric) => (
          <PeopleMetricCard
            key={metric.label}
            helper={metric.helper}
            icon={metric.icon}
            label={metric.label}
            tone={metric.tone}
            value={metric.value}
          />
        ))}
      </div>

      <PeoplePanel
        title="Hub operacional"
        description="Escolha a frente crítica e opere dentro do mesmo cockpit."
      >
        {error ? (
          <PeopleEmptyState
            title="Falha ao montar as operações jurídicas"
            description={
              error instanceof Error
                ? error.message
                : "Tente atualizar a leitura operacional."
            }
            icon={<AlertTriangle className="h-6 w-6" />}
          />
        ) : isLoading || !workspace ? (
          <div className="flex min-h-80 items-center justify-center">
            <Spinner size="lg" />
          </div>
        ) : (
          <Tabs
            aria-label="Abas da central operacional jurídica"
            color="primary"
            selectedKey={selectedTab}
            variant="underlined"
            onSelectionChange={(key) => setSelectedTab(key as typeof selectedTab)}
          >
            <Tab
              key="communications"
              title={
                <div className="flex items-center gap-2">
                  <BellRing className="h-4 w-4" />
                  <span>Publicações & Intimações</span>
                </div>
              }
            >
              <div className="mt-4 space-y-4">
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_220px_220px]">
                  <Input
                    label="Buscar comunicação"
                    placeholder="Cliente, processo, tribunal, despacho..."
                    startContent={<Search className="h-4 w-4 text-default-400" />}
                    value={communicationSearch}
                    onValueChange={(value) => {
                      setCommunicationSearch(value);
                      setCommunicationPage(1);
                    }}
                  />
                  <SearchableSelect
                    items={COMMUNICATION_TYPE_OPTIONS}
                    label="Categoria"
                    placeholder="Filtrar"
                    selectedKey={communicationType}
                    onSelectionChange={(value) => {
                      setCommunicationType(value || "all");
                      setCommunicationPage(1);
                    }}
                  />
                  <SearchableSelect
                    items={COMMUNICATION_STATUS_OPTIONS}
                    label="Status operacional"
                    placeholder="Filtrar"
                    selectedKey={communicationStatus}
                    onSelectionChange={(value) => {
                      setCommunicationStatus(value || "all");
                      setCommunicationPage(1);
                    }}
                  />
                </div>

                {pagedCommunications.items.length ? (
                  <div className="space-y-4">
                    <div className="grid gap-4 xl:grid-cols-2">
                      {pagedCommunications.items.map((item) => (
                        <Card
                          key={item.id}
                          className="border border-white/10 bg-background/50"
                        >
                          <CardHeader className="flex flex-col gap-3 border-b border-white/10">
                            <div className="flex items-start justify-between gap-3">
                              <div className="space-y-1">
                                <p className="text-sm font-semibold text-foreground">
                                  {item.titulo}
                                </p>
                                <p className="text-xs text-default-500">
                                  {item.processo.numero} • {item.processo.clienteNome}
                                </p>
                              </div>
                              <div className="flex flex-wrap justify-end gap-2">
                                <Chip
                                  color={getCommunicationKindTone(item.kind)}
                                  variant="flat"
                                >
                                  {item.kindLabel}
                                </Chip>
                                <Chip
                                  color={getCommunicationStatusTone(
                                    item.statusOperacional as never,
                                  )}
                                  variant="flat"
                                >
                                  {item.statusLabel}
                                </Chip>
                              </div>
                            </div>
                          </CardHeader>
                          <CardBody className="space-y-4">
                            <p className="text-sm text-default-500">
                              {item.descricao || "Sem descrição complementar."}
                            </p>
                            <div className="grid gap-2 text-xs text-default-500 md:grid-cols-2">
                              <p>
                                Tribunal:{" "}
                                <span className="font-medium text-default-700">
                                  {item.processo.tribunalSigla || "Não vinculado"}
                                </span>
                              </p>
                              <p>
                                Responsável:{" "}
                                <span className="font-medium text-default-700">
                                  {item.responsavelNome ||
                                    item.processo.advogadoResponsavelNome ||
                                    "Sem responsável"}
                                </span>
                              </p>
                              <p>
                                Movimento:{" "}
                                <span className="font-medium text-default-700">
                                  {formatDateTime(item.dataMovimentacao)}
                                </span>
                              </p>
                              <p>
                                Prazo/SLA:{" "}
                                <span className="font-medium text-default-700">
                                  {item.prazo
                                    ? `${formatDate(item.prazo)} (${formatRelativeDays(item.prazo)})`
                                    : item.slaEm
                                      ? formatDateTime(item.slaEm)
                                      : "Sem prazo derivado"}
                                </span>
                              </p>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                variant="bordered"
                                onPress={() =>
                                  router.push(`/processos/${item.processo.id}`)
                                }
                              >
                                Abrir processo
                              </Button>
                              {item.statusOperacional !== "RESOLVIDO" &&
                              canEditProcesses ? (
                                <Button
                                  color="success"
                                  isLoading={resolvingMovementId === item.id}
                                  size="sm"
                                  startContent={<CheckCircle2 className="h-4 w-4" />}
                                  onPress={() => handleResolveMovement(item.id)}
                                >
                                  Marcar como resolvido
                                </Button>
                              ) : null}
                            </div>
                          </CardBody>
                        </Card>
                      ))}
                    </div>

                    {pagedCommunications.totalPages > 1 ? (
                      <div className="flex justify-center">
                        <Pagination
                          page={pagedCommunications.page}
                          total={pagedCommunications.totalPages}
                          onChange={setCommunicationPage}
                        />
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <PeopleEmptyState
                    title="Nenhuma comunicação encontrada"
                    description="Ajuste a busca ou os filtros. O hub só mostra publicações, intimações, audiências, prazos e movimentações realmente relevantes."
                    icon={<BellRing className="h-6 w-6" />}
                  />
                )}
              </div>
            </Tab>

            <Tab
              key="discovery"
              title={
                <div className="flex items-center gap-2">
                  <Radar className="h-4 w-4" />
                  <span>Discovery Full</span>
                </div>
              }
            >
              <div className="mt-4 space-y-4">
                <div className="grid gap-4 xl:grid-cols-3">
                  <Card className="border border-white/10 bg-background/50">
                    <CardHeader className="border-b border-white/10">
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          Captura por número
                        </p>
                        <p className="text-xs text-default-500">
                          Busca pontual para cadastrar ou atualizar a capa do processo.
                        </p>
                      </div>
                    </CardHeader>
                    <CardBody className="space-y-3">
                      <Input
                        label="Número do processo"
                        placeholder="0000000-00.0000.0.00.0000"
                        value={captureNumero}
                        onValueChange={setCaptureNumero}
                      />
                      <SearchableSelect
                        items={tribunalOptions}
                        label="Tribunal"
                        placeholder="Opcional"
                        selectedKey={captureTribunal}
                        onSelectionChange={setCaptureTribunal}
                      />
                      <Input
                        label="Cliente alvo"
                        placeholder="Opcional"
                        value={captureCliente}
                        onValueChange={setCaptureCliente}
                      />
                      <Button
                        color="primary"
                        isLoading={isCapturing}
                        startContent={<FileSearch className="h-4 w-4" />}
                        onPress={handleCaptureByNumero}
                      >
                        Capturar agora
                      </Button>
                    </CardBody>
                  </Card>

                  <Card className="border border-white/10 bg-background/50">
                    <CardHeader className="border-b border-white/10">
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          Discovery por OAB
                        </p>
                        <p className="text-xs text-default-500">
                          Dispare uma busca em lote por tribunal e OAB, com workflow e captcha quando necessário.
                        </p>
                      </div>
                    </CardHeader>
                    <CardBody className="space-y-3">
                      <SearchableSelect
                        items={tribunalOptions}
                        label="Tribunal"
                        placeholder="Escolha o tribunal"
                        selectedKey={syncTribunal}
                        onSelectionChange={setSyncTribunal}
                      />
                      <Input
                        label="OAB"
                        placeholder="000000SP"
                        value={syncOab}
                        onValueChange={setSyncOab}
                      />
                      <Input
                        label="Cliente alvo"
                        placeholder="Opcional"
                        value={syncCliente}
                        onValueChange={setSyncCliente}
                      />
                      <Button
                        color="primary"
                        isLoading={isSyncing}
                        startContent={<FolderSync className="h-4 w-4" />}
                        onPress={handleStartOabSync}
                      >
                        Iniciar discovery
                      </Button>

                      {selectedSyncStatus ? (
                        <Card className="border border-primary/20 bg-primary/5">
                          <CardBody className="space-y-2 p-4">
                            <div className="flex flex-wrap items-center gap-2">
                              <Chip color="primary" variant="flat">
                                {selectedSyncStatus.status}
                              </Chip>
                              <Chip variant="flat">
                                {selectedSyncStatus.tribunalSigla}
                              </Chip>
                              <Chip variant="flat">{selectedSyncStatus.oab}</Chip>
                            </div>
                            <p className="text-xs text-default-500">
                              {selectedSyncStatus.syncedCount} processo(s) no radar •{" "}
                              {selectedSyncStatus.createdCount} criado(s) •{" "}
                              {selectedSyncStatus.updatedCount} atualizado(s)
                            </p>
                            {selectedSyncStatus.error ? (
                              <p className="text-xs text-danger">
                                {selectedSyncStatus.error}
                              </p>
                            ) : null}
                          </CardBody>
                        </Card>
                      ) : null}

                      {selectedSyncStatus?.status === "WAITING_CAPTCHA" &&
                      selectedSyncStatus.captchaImage ? (
                        <Card className="border border-warning/20 bg-warning/5">
                          <CardBody className="space-y-3 p-4">
                            <p className="text-sm font-semibold text-warning">
                              Captcha pendente
                            </p>
                            <img
                              alt="Captcha do tribunal"
                              className="max-h-24 rounded-xl border border-white/10 bg-white"
                              src={selectedSyncStatus.captchaImage}
                            />
                            <Input
                              label="Texto do captcha"
                              value={captchaText}
                              onValueChange={setCaptchaText}
                            />
                            <div className="flex flex-wrap gap-2">
                              <Button
                                color="warning"
                                isLoading={isResolvingCaptcha}
                                onPress={handleResolveCaptcha}
                              >
                                Enviar captcha
                              </Button>
                              <Button
                                isLoading={isRefreshingCaptcha}
                                variant="bordered"
                                onPress={handleRefreshCaptcha}
                              >
                                Renovar captcha
                              </Button>
                            </div>
                          </CardBody>
                        </Card>
                      ) : null}
                    </CardBody>
                  </Card>

                  <Card className="border border-white/10 bg-background/50">
                    <CardHeader className="border-b border-white/10">
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          Importação em lote
                        </p>
                        <p className="text-xs text-default-500">
                          Traga processos por planilha para acelerar discovery de carteira.
                        </p>
                      </div>
                    </CardHeader>
                    <CardBody className="space-y-3">
                      <input
                        accept=".csv,.xls,.xlsx"
                        className="block w-full rounded-2xl border border-white/10 bg-background/40 px-3 py-3 text-sm text-default-500"
                        type="file"
                        onChange={(event) =>
                          setImportFile(event.target.files?.[0] ?? null)
                        }
                      />
                      <Checkbox
                        isSelected={createClientAccess}
                        onValueChange={setCreateClientAccess}
                      >
                        Criar acesso automático para clientes importados
                      </Checkbox>
                      <Button
                        color="primary"
                        isLoading={isImporting}
                        startContent={<ArrowUpRight className="h-4 w-4" />}
                        onPress={handleImportSpreadsheet}
                      >
                        Importar planilha
                      </Button>
                    </CardBody>
                  </Card>
                </div>

                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
                  <Card className="border border-white/10 bg-background/50">
                    <CardHeader className="border-b border-white/10">
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          Últimas entradas no radar
                        </p>
                        <p className="text-xs text-default-500">
                          Processos recentes com sinais de captura, planilha ou sincronização.
                        </p>
                      </div>
                    </CardHeader>
                    <CardBody className="space-y-3">
                      {workspace.discovery.recentProcesses.length ? (
                        workspace.discovery.recentProcesses.map((item) => (
                          <Card
                            key={item.id}
                            className="border border-white/10 bg-background/40"
                          >
                            <CardBody className="space-y-3 p-4">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold text-foreground">
                                    {item.numero}
                                  </p>
                                  <p className="text-xs text-default-500">
                                    {item.clienteNome} • {item.tribunalSigla || "Sem tribunal"}
                                  </p>
                                </div>
                                {item.hasExternalSignal ? (
                                  <Chip color="success" variant="flat">
                                    Sinal externo
                                  </Chip>
                                ) : (
                                  <Chip variant="flat">Sem sinal externo</Chip>
                                )}
                              </div>
                              <div className="grid gap-2 text-xs text-default-500 md:grid-cols-2">
                                <p>Movimentações: {item.movimentacoesCount}</p>
                                <p>Petições: {item.peticoesCount}</p>
                                <p>Prazos: {item.prazosCount}</p>
                                <p>
                                  Último movimento:{" "}
                                  {item.lastMovementAt
                                    ? formatDateTime(item.lastMovementAt)
                                    : "Ainda não capturado"}
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {item.tags.slice(0, 3).map((tag) => (
                                  <Chip key={tag} size="sm" variant="flat">
                                    {tag}
                                  </Chip>
                                ))}
                              </div>
                              <Button
                                size="sm"
                                variant="bordered"
                                onPress={() => router.push(`/processos/${item.id}`)}
                              >
                                Abrir processo
                              </Button>
                            </CardBody>
                          </Card>
                        ))
                      ) : (
                        <PeopleEmptyState
                          title="Sem entradas recentes"
                          description="As próximas capturas, planilhas e descobertas por OAB aparecerão aqui."
                          icon={<Radar className="h-6 w-6" />}
                        />
                      )}
                    </CardBody>
                  </Card>

                  <div className="space-y-4">
                    <Card className="border border-white/10 bg-background/50">
                      <CardHeader className="border-b border-white/10">
                        <div>
                          <p className="text-sm font-semibold text-foreground">
                            Backlog de discovery
                          </p>
                          <p className="text-xs text-default-500">
                            Processos que ainda dependem de saneamento operacional.
                          </p>
                        </div>
                      </CardHeader>
                      <CardBody className="space-y-3">
                        {workspace.discovery.backlog.length ? (
                          workspace.discovery.backlog.map((item) => (
                            <div
                              key={item.id}
                              className="rounded-2xl border border-white/10 bg-background/40 p-3"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold text-foreground">
                                    {item.numero}
                                  </p>
                                  <p className="text-xs text-default-500">
                                    {item.clienteNome}
                                  </p>
                                </div>
                                <Button
                                  size="sm"
                                  variant="light"
                                  onPress={() => router.push(`/processos/${item.id}`)}
                                >
                                  Abrir
                                </Button>
                              </div>
                              <div className="mt-3 flex flex-wrap gap-2">
                                {item.reasons.map((reason) => (
                                  <Chip key={reason} color="warning" size="sm" variant="flat">
                                    {reason}
                                  </Chip>
                                ))}
                              </div>
                            </div>
                          ))
                        ) : (
                          <PeopleEmptyState
                            title="Sem backlog crítico"
                            description="Os gargalos de discovery vão aparecer aqui quando a carteira começar a ficar sem tribunal, sem dono ou sem movimentação."
                            icon={<CheckCircle2 className="h-5 w-5" />}
                            className="min-h-32"
                          />
                        )}
                      </CardBody>
                    </Card>

                    <Card className="border border-white/10 bg-background/50">
                      <CardHeader className="border-b border-white/10">
                        <div>
                          <p className="text-sm font-semibold text-foreground">
                            Histórico recente de sync
                          </p>
                          <p className="text-xs text-default-500">
                            Últimos runs do discovery por OAB neste usuário.
                          </p>
                        </div>
                      </CardHeader>
                      <CardBody className="space-y-3">
                        {workspace.discovery.syncHistory.length ? (
                          workspace.discovery.syncHistory.map((item) => (
                            <div
                              key={item.syncId}
                              className="rounded-2xl border border-white/10 bg-background/40 p-3"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold text-foreground">
                                    {item.tribunalSigla} • {item.oab}
                                  </p>
                                  <p className="text-xs text-default-500">
                                    {formatDateTime(item.updatedAt)}
                                  </p>
                                </div>
                                <Chip
                                  color={
                                    item.status === "COMPLETED"
                                      ? "success"
                                      : item.status === "FAILED"
                                        ? "danger"
                                        : item.status === "WAITING_CAPTCHA"
                                          ? "warning"
                                          : "primary"
                                  }
                                  variant="flat"
                                >
                                  {item.status}
                                </Chip>
                              </div>
                              <p className="mt-2 text-xs text-default-500">
                                {item.syncedCount} sincronizado(s) • {item.createdCount} criado(s) •{" "}
                                {item.updatedCount} atualizado(s)
                              </p>
                              {item.error ? (
                                <p className="mt-1 text-xs text-danger">{item.error}</p>
                              ) : null}
                            </div>
                          ))
                        ) : (
                          <PeopleEmptyState
                            title="Sem histórico ainda"
                            description="Os próximos jobs de discovery por OAB ficarão visíveis aqui."
                            icon={<FolderSync className="h-5 w-5" />}
                            className="min-h-32"
                          />
                        )}
                      </CardBody>
                    </Card>
                  </div>
                </div>
              </div>
            </Tab>

            <Tab
              key="protocols"
              title={
                <div className="flex items-center gap-2">
                  <Send className="h-4 w-4" />
                  <span>Protocolos</span>
                </div>
              }
            >
              <div className="mt-4 space-y-4">
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_260px]">
                  <Input
                    label="Buscar peça"
                    placeholder="Petição, processo, cliente, causa..."
                    startContent={<Search className="h-4 w-4 text-default-400" />}
                    value={protocolSearch}
                    onValueChange={(value) => {
                      setProtocolSearch(value);
                      setProtocolPage(1);
                    }}
                  />
                  <SearchableSelect
                    items={PROTOCOL_BUCKET_OPTIONS}
                    label="Leitura operacional"
                    placeholder="Filtrar"
                    selectedKey={protocolBucket}
                    onSelectionChange={(value) => {
                      setProtocolBucket(value || "all");
                      setProtocolPage(1);
                    }}
                  />
                </div>

                <Card className="border border-warning/20 bg-warning/5">
                  <CardBody className="flex flex-col gap-2 p-4 text-sm text-default-600">
                    <p className="font-semibold text-warning">
                      Checklist operacional de protocolo
                    </p>
                    <p>
                      Este hub não inventa protocolo automático. Ele separa o que já pode ser protocolado, o que precisa de revisão e o que está bloqueado por falta de documento principal ou saneamento da peça.
                    </p>
                  </CardBody>
                </Card>

                {pagedProtocols.items.length ? (
                  <div className="space-y-4">
                    <div className="grid gap-4 xl:grid-cols-2">
                      {pagedProtocols.items.map((item) => {
                        const isProtocoling = protocolSubmittingId === item.id;
                        const isDraftOpen = protocolDraft?.peticaoId === item.id;

                        return (
                          <Card
                            key={item.id}
                            className="border border-white/10 bg-background/50"
                          >
                            <CardHeader className="flex flex-col gap-3 border-b border-white/10">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold text-foreground">
                                    {item.titulo}
                                  </p>
                                  <p className="text-xs text-default-500">
                                    {item.processo.numero} • {item.processo.clienteNome}
                                  </p>
                                </div>
                                <div className="flex flex-wrap justify-end gap-2">
                                  <Chip
                                    color={getProtocolReadinessTone(item.readiness.status)}
                                    variant="flat"
                                  >
                                    {item.readiness.label}
                                  </Chip>
                                  <Chip variant="flat">{item.status}</Chip>
                                </div>
                              </div>
                            </CardHeader>
                            <CardBody className="space-y-4">
                              <div className="grid gap-2 text-xs text-default-500 md:grid-cols-2">
                                <p>
                                  Tipo:{" "}
                                  <span className="font-medium text-default-700">
                                    {item.tipo || "Não informado"}
                                  </span>
                                </p>
                                <p>
                                  Documento:{" "}
                                  <span className="font-medium text-default-700">
                                    {item.documento?.nome || "Sem documento"}
                                  </span>
                                </p>
                                <p>
                                  Modelo:{" "}
                                  <span className="font-medium text-default-700">
                                    {item.modeloNome || "Sem modelo"}
                                  </span>
                                </p>
                                <p>
                                  Causa:{" "}
                                  <span className="font-medium text-default-700">
                                    {item.causaNome || "Sem causa"}
                                  </span>
                                </p>
                              </div>

                              {item.readiness.blockers.length ? (
                                <div className="flex flex-wrap gap-2">
                                  {item.readiness.blockers.map((reason) => (
                                    <Chip key={reason} color="danger" size="sm" variant="flat">
                                      {reason}
                                    </Chip>
                                  ))}
                                </div>
                              ) : null}

                              {item.readiness.attentionPoints.length ? (
                                <div className="flex flex-wrap gap-2">
                                  {item.readiness.attentionPoints.map((reason) => (
                                    <Chip key={reason} color="warning" size="sm" variant="flat">
                                      {reason}
                                    </Chip>
                                  ))}
                                </div>
                              ) : null}

                              {item.protocoladoEm ? (
                                <p className="text-xs text-default-500">
                                  Protocolada em {formatDateTime(item.protocoladoEm)}
                                  {item.protocoloNumero
                                    ? ` • Nº ${item.protocoloNumero}`
                                    : ""}
                                </p>
                              ) : null}

                              <div className="flex flex-wrap gap-2">
                                <Button
                                  size="sm"
                                  variant="bordered"
                                  onPress={() =>
                                    router.push(`/processos/${item.processo.id}`)
                                  }
                                >
                                  Abrir processo
                                </Button>
                                {item.documento?.url ? (
                                  <Button
                                    as="a"
                                    href={item.documento.url}
                                    rel="noreferrer"
                                    size="sm"
                                    startContent={<ExternalLink className="h-4 w-4" />}
                                    target="_blank"
                                    variant="light"
                                  >
                                    Documento
                                  </Button>
                                ) : null}
                                {item.readiness.status !== "BLOCKED" &&
                                item.readiness.status !== "PROTOCOLADA" &&
                                item.readiness.status !== "ARQUIVADA" &&
                                canEditProcesses ? (
                                  <Button
                                    color="primary"
                                    size="sm"
                                    startContent={<Send className="h-4 w-4" />}
                                    onPress={() =>
                                      setProtocolDraft({
                                        peticaoId: item.id,
                                        numero:
                                          protocolDraft?.peticaoId === item.id
                                            ? protocolDraft.numero
                                            : "",
                                      })
                                    }
                                  >
                                    Informar protocolo
                                  </Button>
                                ) : null}
                              </div>

                              {isDraftOpen ? (
                                <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
                                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                                    <Input
                                      label="Número do protocolo"
                                      placeholder="Informe o número retornado pelo tribunal"
                                      value={protocolDraft.numero}
                                      onValueChange={(value) =>
                                        setProtocolDraft({
                                          peticaoId: item.id,
                                          numero: value,
                                        })
                                      }
                                    />
                                    <div className="flex items-end gap-2">
                                      <Button
                                        isLoading={isProtocoling}
                                        color="primary"
                                        onPress={() => handleProtocol(item.id)}
                                      >
                                        Confirmar
                                      </Button>
                                      <Button
                                        variant="light"
                                        onPress={() => setProtocolDraft(null)}
                                      >
                                        Cancelar
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              ) : null}
                            </CardBody>
                          </Card>
                        );
                      })}
                    </div>

                    {pagedProtocols.totalPages > 1 ? (
                      <div className="flex justify-center">
                        <Pagination
                          page={pagedProtocols.page}
                          total={pagedProtocols.totalPages}
                          onChange={setProtocolPage}
                        />
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <PeopleEmptyState
                    title="Nenhuma petição encontrada"
                    description="Ajuste a busca ou a leitura operacional. Esta fila mostra somente peças reais já cadastradas no tenant."
                    icon={<FileText className="h-6 w-6" />}
                  />
                )}
              </div>
            </Tab>
          </Tabs>
        )}
      </PeoplePanel>
    </div>
  );
}
