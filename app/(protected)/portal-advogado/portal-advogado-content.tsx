"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardBody,
  Button,
  Chip,
  Spinner,
  Input,
  Select,
  SelectItem,
} from "@heroui/react";
import {
  Building2,
  Calendar,
  CalendarClock,
  FileText,
  Link as LinkIcon,
  Info,
  ExternalLink,
  RefreshCw,
  ShieldAlert,
  CheckCircle2,
  Clock3,
  CircleDashed,
  AlertTriangle,
  FolderOpen,
  UserX,
  Siren,
  Activity,
} from "lucide-react";
import useSWR from "swr";
import { addToast } from "@heroui/toast";

import { UFSelector } from "./uf-selector";

import {
  getStatusSincronizacaoMeusProcessos,
  getPainelOperacionalPortalAdvogado,
  getProcessosSincronizadosPortalAdvogado,
  getRecursosOficiaisPortalAdvogado,
  gerarNovoCaptchaSincronizacaoMeusProcessos,
  getTribunaisSincronizacaoPortalAdvogado,
  getTribunaisPorUF,
  getUFsDisponiveis,
  iniciarSincronizacaoMeusProcessos,
  resolverCaptchaSincronizacaoMeusProcessos,
} from "@/app/actions/portal-advogado";
import { REALTIME_POLLING } from "@/app/lib/realtime/polling-policy";
import {
  isPollingGloballyEnabled,
  resolvePollingInterval,
  subscribePollingControl,
  tracePollingAttempt,
} from "@/app/lib/realtime/polling-telemetry";
import {
  PeopleMetricCard,
  PeoplePageHeader,
  PeoplePanel,
} from "@/components/people-ui";

export function PortalAdvogadoContent() {
  const router = useRouter();
  const [ufSelecionada, setUfSelecionada] = useState<string | undefined>();
  const [syncTribunalSigla] = useState("JUSBRASIL");
  const [syncOab, setSyncOab] = useState("");
  const [syncClienteNome, setSyncClienteNome] = useState("");
  const [captchaText, setCaptchaText] = useState("");
  const [syncId, setSyncId] = useState<string | undefined>();
  const [isStartingSync, setIsStartingSync] = useState(false);
  const [isResolvingCaptcha, setIsResolvingCaptcha] = useState(false);
  const [isRefreshingCaptcha, setIsRefreshingCaptcha] = useState(false);
  const [isPollingEnabled, setIsPollingEnabled] = useState(() =>
    isPollingGloballyEnabled(),
  );

  useEffect(() => {
    return subscribePollingControl(setIsPollingEnabled);
  }, []);

  // Buscar tribunais da UF selecionada
  const { data: ufs } = useSWR<string[]>(
    "portal-advogado-ufs",
    getUFsDisponiveis,
  );

  const { data: syncTribunaisResponse, isLoading: isLoadingSyncTribunais } =
    useSWR<
      Awaited<ReturnType<typeof getTribunaisSincronizacaoPortalAdvogado>>,
      Error
    >(
      "portal-advogado-sync-tribunais",
      getTribunaisSincronizacaoPortalAdvogado,
    );

  const {
    data: syncStatusResponse,
    mutate: refreshSyncStatus,
    isLoading: isLoadingSyncStatus,
  } = useSWR<
    Awaited<ReturnType<typeof getStatusSincronizacaoMeusProcessos>>,
    Error
  >(
    `portal-advogado-sync-status:${syncId ?? "latest"}`,
    async (key) => {
      const currentSyncId = key.split(":").pop() || "latest";
      return await tracePollingAttempt(
        {
          hookName: "PortalAdvogadoContent",
          endpoint: `/portal-advogado/sync-status/${currentSyncId}`,
          source: "swr",
          intervalMs: REALTIME_POLLING.PORTAL_SYNC_STATUS_POLLING_MS,
        },
        () =>
          getStatusSincronizacaoMeusProcessos({
            syncId: currentSyncId === "latest" ? undefined : currentSyncId,
          }),
      );
    },
    {
      refreshInterval: (latestData) => {
        const status = latestData?.status?.status;
        const shouldPoll =
          isPollingEnabled &&
          (status === "QUEUED" || status === "RUNNING");

        return shouldPoll
          ? resolvePollingInterval({
              isConnected: false,
            enabled: true,
            fallbackMs: REALTIME_POLLING.PORTAL_SYNC_STATUS_POLLING_MS,
            minimumMs: REALTIME_POLLING.PORTAL_SYNC_STATUS_POLLING_MS,
          })
          : 0;
      },
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    },
  );

  const { data: tribunais, isLoading: isLoadingTribunais } = useSWR<
    Awaited<ReturnType<typeof getTribunaisPorUF>>,
    Error
  >(
    ufSelecionada
      ? (["portal-advogado-tribunais", ufSelecionada] as const)
      : null,
    async ([, uf]: readonly [string, string]) => {
      return await getTribunaisPorUF(uf);
    },
  );

  const ufOptions = useMemo(() => ufs ?? [], [ufs]);
  const syncTribunais = useMemo(
    () => (syncTribunaisResponse?.success ? syncTribunaisResponse.tribunais : []),
    [syncTribunaisResponse],
  );
  const syncStatus = syncStatusResponse?.status;

  const isSyncRunning =
    syncStatus?.status === "QUEUED" ||
    syncStatus?.status === "RUNNING" ||
    syncStatus?.status === "AWAITING_WEBHOOK";
  const isWaitingCaptcha = syncStatus?.status === "WAITING_CAPTCHA";
  const activeRadarTribunalSigla = syncStatus?.tribunalSigla || syncTribunalSigla;

  const {
    data: processosSincronizadosResponse,
    mutate: refreshProcessosSincronizados,
    isLoading: isLoadingProcessosSincronizados,
  } = useSWR<
    Awaited<ReturnType<typeof getProcessosSincronizadosPortalAdvogado>>,
    Error
  >(
    syncStatus?.syncId
      ? `portal-advogado-sync-processos:${syncStatus.syncId}`
      : null,
    async () =>
      getProcessosSincronizadosPortalAdvogado({
        syncId: syncStatus?.syncId,
        limit: 24,
      }),
    {
      refreshInterval: () =>
        isSyncRunning
          ? resolvePollingInterval({
              isConnected: false,
              enabled: isPollingEnabled,
              fallbackMs: REALTIME_POLLING.PORTAL_SYNC_STATUS_POLLING_MS,
              minimumMs: REALTIME_POLLING.PORTAL_SYNC_STATUS_POLLING_MS,
            })
          : 0,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    },
  );

  const { data: recursosOficiaisResponse, isLoading: isLoadingRecursosOficiais } =
    useSWR<Awaited<ReturnType<typeof getRecursosOficiaisPortalAdvogado>>, Error>(
      `portal-advogado-recursos-oficiais:${activeRadarTribunalSigla || "TJSP"}`,
      async () =>
        getRecursosOficiaisPortalAdvogado({
          tribunalSigla: activeRadarTribunalSigla || "TJSP",
        }),
      {
        revalidateOnFocus: false,
      },
    );

  const {
    data: painelOperacionalResponse,
    mutate: refreshPainelOperacional,
    isLoading: isLoadingPainelOperacional,
  } = useSWR<Awaited<ReturnType<typeof getPainelOperacionalPortalAdvogado>>, Error>(
    "portal-advogado-painel-operacional",
    () => getPainelOperacionalPortalAdvogado({ limit: 8 }),
    {
      refreshInterval: resolvePollingInterval({
        isConnected: false,
        enabled: isPollingEnabled,
        fallbackMs: 60 * 1000,
        minimumMs: 60 * 1000,
      }),
      revalidateOnFocus: false,
    },
  );

  useEffect(() => {
    if (syncStatus?.status === "COMPLETED") {
      void refreshProcessosSincronizados();
      void refreshPainelOperacional();
    }
  }, [syncStatus?.status, refreshPainelOperacional, refreshProcessosSincronizados]);

  const syncStatusMeta = useMemo(() => {
    if (!syncStatus) return null;

    switch (syncStatus.status) {
      case "QUEUED":
        return {
          color: "default" as const,
          label: "Na fila",
          icon: <CircleDashed className="h-4 w-4" />,
        };
      case "RUNNING":
        return {
          color: "primary" as const,
          label: "Executando",
          icon: <Clock3 className="h-4 w-4" />,
        };
      case "WAITING_CAPTCHA":
        return {
          color: "warning" as const,
          label: "Captcha pendente",
          icon: <ShieldAlert className="h-4 w-4" />,
        };
      case "AWAITING_WEBHOOK":
        return {
          color: "primary" as const,
          label: "Aguardando webhook",
          icon: <CircleDashed className="h-4 w-4" />,
        };
      case "COMPLETED":
        return {
          color: "success" as const,
          label: "Concluído",
          icon: <CheckCircle2 className="h-4 w-4" />,
        };
      case "FAILED":
      default:
        return {
          color: "danger" as const,
          label: "Falhou",
          icon: <AlertTriangle className="h-4 w-4" />,
        };
    }
  }, [syncStatus]);

  const iniciarSync = async () => {
    setIsStartingSync(true);

    try {
      const response = await iniciarSincronizacaoMeusProcessos({
        tribunalSigla: syncTribunalSigla,
        oab: syncOab || undefined,
        clienteNome: syncClienteNome || undefined,
      });

      if (!response.success) {
        if (response.syncId) {
          setSyncId(response.syncId);
        }
        addToast({
          title: "Não foi possível iniciar",
          description:
            response.error || "Já existe uma sincronização em andamento.",
          color: "warning",
        });
        await refreshSyncStatus();
        return;
      }

      if (response.syncId) {
        setSyncId(response.syncId);
      }

      setCaptchaText("");
      addToast({
        title: "Sincronização iniciada",
        description:
          "Aguarde enquanto buscamos seus processos em background.",
        color: "success",
      });
      await refreshSyncStatus();
    } catch (error) {
      addToast({
        title: "Erro interno",
        description: "Falha ao iniciar sincronização.",
        color: "danger",
      });
    } finally {
      setIsStartingSync(false);
    }
  };

  const resolverCaptcha = async () => {
    if (!syncStatus?.syncId) {
      addToast({
        title: "Sincronização ausente",
        description: "Inicie uma sincronização para resolver captcha.",
        color: "warning",
      });
      return;
    }

    if (!captchaText.trim()) {
      addToast({
        title: "Informe o captcha",
        description: "Digite os caracteres da imagem para continuar.",
        color: "warning",
      });
      return;
    }

    setIsResolvingCaptcha(true);

    try {
      const response = await resolverCaptchaSincronizacaoMeusProcessos({
        syncId: syncStatus.syncId,
        captchaText: captchaText.trim(),
      });

      if (!response.success) {
        addToast({
          title: "Falha ao validar captcha",
          description: response.error || "Não foi possível continuar.",
          color: "danger",
        });
        await refreshSyncStatus();
        return;
      }

      setCaptchaText("");
      addToast({
        title: "Captcha enviado",
        description: "Processamento retomado em background.",
        color: "success",
      });
      await refreshSyncStatus();
    } catch (error) {
      addToast({
        title: "Erro interno",
        description: "Falha ao enviar captcha.",
        color: "danger",
      });
    } finally {
      setIsResolvingCaptcha(false);
    }
  };

  const gerarNovoCaptcha = async () => {
    if (!syncStatus?.syncId) {
      addToast({
        title: "Sincronização ausente",
        description: "Inicie uma sincronização para gerar um novo captcha.",
        color: "warning",
      });
      return;
    }

    setIsRefreshingCaptcha(true);

    try {
      const response = await gerarNovoCaptchaSincronizacaoMeusProcessos({
        syncId: syncStatus.syncId,
      });

      if (!response.success) {
        addToast({
          title: "Falha ao gerar captcha",
          description: response.error || "Não foi possível gerar novo desafio.",
          color: "danger",
        });
        await refreshSyncStatus();
        return;
      }

      setCaptchaText("");
      addToast({
        title: "Novo captcha solicitado",
        description: "Aguarde alguns segundos para o novo desafio aparecer.",
        color: "success",
      });
      await refreshSyncStatus();
    } catch (error) {
      addToast({
        title: "Erro interno",
        description: "Falha ao gerar novo captcha.",
        color: "danger",
      });
    } finally {
      setIsRefreshingCaptcha(false);
    }
  };

  const resumoSync = useMemo(
    () => ({
      capturados: syncStatus?.syncedCount ?? 0,
      criados: syncStatus?.createdCount ?? 0,
      atualizados: syncStatus?.updatedCount ?? 0,
      tribunaisDisponiveis: syncTribunais.length,
    }),
    [syncStatus, syncTribunais.length],
  );

  const processosSincronizados = useMemo(
    () =>
      processosSincronizadosResponse?.success
        ? processosSincronizadosResponse.processos
        : [],
    [processosSincronizadosResponse],
  );

  const recursosOficiais = useMemo(
    () =>
      recursosOficiaisResponse?.success ? recursosOficiaisResponse.recursos : [],
    [recursosOficiaisResponse],
  );

  const calendarioRecursos = useMemo(
    () => recursosOficiais.filter((item) => item.categoria === "calendario"),
    [recursosOficiais],
  );
  const comunicadosRecursos = useMemo(
    () => recursosOficiais.filter((item) => item.categoria === "comunicados"),
    [recursosOficiais],
  );
  const linksRecursos = useMemo(
    () => recursosOficiais.filter((item) => item.categoria === "links"),
    [recursosOficiais],
  );
  const painelOperacional = useMemo(
    () => (painelOperacionalResponse?.success ? painelOperacionalResponse : null),
    [painelOperacionalResponse],
  );

  const getProcessoStatusLabel = (status?: string | null) => {
    if (!status) return "Sem status";

    switch (status) {
      case "RASCUNHO":
        return "Rascunho";
      case "EM_ANDAMENTO":
        return "Em andamento";
      case "SUSPENSO":
        return "Suspenso";
      case "ARQUIVADO":
        return "Arquivado";
      case "ENCERRADO":
        return "Encerrado";
      default:
        return status.replace(/_/g, " ").toLowerCase();
    }
  };

  const getMovimentacaoPrioridadeColor = (prioridade?: string | null) => {
    switch (prioridade) {
      case "CRITICA":
        return "danger" as const;
      case "ALTA":
        return "warning" as const;
      case "MEDIA":
        return "primary" as const;
      default:
        return "default" as const;
    }
  };

  return (
    <section className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 py-8 px-3 sm:px-6">
      <PeoplePageHeader
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {isSyncRunning || isWaitingCaptcha ? (
              <Chip
                color={isWaitingCaptcha ? "warning" : "primary"}
                startContent={
                  isSyncRunning ? (
                    <Spinner color="primary" size="sm" />
                  ) : (
                    <ShieldAlert className="h-4 w-4" />
                  )
                }
                variant="flat"
              >
                {isWaitingCaptcha
                  ? "Sincronização pausada por captcha"
                  : "Sincronização em andamento no background"}
              </Chip>
            ) : null}
            <Button
              endContent={<ExternalLink className="h-4 w-4" />}
              variant="bordered"
              onPress={() => router.push("/portal-advogado/operacoes")}
            >
              Operações jurídicas
            </Button>
          </div>
        }
        description="Operação de captura de processos por OAB, monitoramento da sincronização e acesso rápido aos portais dos tribunais."
        tag="Atividade juridica"
        title="Portal do Advogado"
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <PeopleMetricCard
          helper="Última sincronização"
          icon={<RefreshCw className="h-4 w-4" />}
          label="Processos capturados"
          tone="primary"
          value={resumoSync.capturados}
        />
        <PeopleMetricCard
          helper="Incluídos no sistema"
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="Novos processos"
          tone="success"
          value={resumoSync.criados}
        />
        <PeopleMetricCard
          helper="Dados já existentes"
          icon={<Clock3 className="h-4 w-4" />}
          label="Processos atualizados"
          tone="secondary"
          value={resumoSync.atualizados}
        />
        <PeopleMetricCard
          helper="Disponíveis para consulta"
          icon={<Building2 className="h-4 w-4" />}
          label="Tribunais de sync"
          tone="warning"
          value={resumoSync.tribunaisDisponiveis}
        />
      </div>

      <PeoplePanel
        description="Visão operacional para agir no mesmo dia: prazos, audiências e intimações."
        title="Prioridades do Dia"
      >
        {isLoadingPainelOperacional ? (
          <div className="flex items-center gap-2 text-sm text-default-500">
            <Spinner size="sm" />
            Carregando prioridades...
          </div>
        ) : painelOperacional ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <PeopleMetricCard
                helper="Abertos e vencidos"
                icon={<Siren className="h-4 w-4" />}
                label="Prazos vencidos"
                tone={painelOperacional.prioridade.prazosVencidos > 0 ? "danger" : "success"}
                value={painelOperacional.prioridade.prazosVencidos}
              />
              <PeopleMetricCard
                helper="Janela de 7 dias"
                icon={<CalendarClock className="h-4 w-4" />}
                label="Prazos próximos"
                tone={painelOperacional.prioridade.prazos7Dias > 0 ? "warning" : "default"}
                value={painelOperacional.prioridade.prazos7Dias}
              />
              <PeopleMetricCard
                helper="AGENDADO/CONFIRMADO"
                icon={<Calendar className="h-4 w-4" />}
                label="Audiências da semana"
                tone="primary"
                value={painelOperacional.prioridade.audienciasSemana}
              />
              <PeopleMetricCard
                helper="Últimas 24h"
                icon={<AlertTriangle className="h-4 w-4" />}
                label="Intimações novas"
                tone={painelOperacional.prioridade.intimacoesNovas24h > 0 ? "warning" : "default"}
                value={painelOperacional.prioridade.intimacoesNovas24h}
              />
            </div>

            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              <Card className="border border-white/10 bg-background/55">
                <CardBody className="space-y-3 p-4">
                  <p className="text-sm font-semibold text-white">Próximos prazos</p>
                  {painelOperacional.listas.proximosPrazos.length > 0 ? (
                    <div className="space-y-2">
                      {painelOperacional.listas.proximosPrazos.map((item) => (
                        <button
                          key={item.id}
                          className="w-full rounded-lg border border-white/10 bg-background/40 p-3 text-left transition hover:border-primary/40 hover:bg-background/70"
                          type="button"
                          onClick={() => router.push(`/processos/${item.processo.id}`)}
                        >
                          <p className="text-sm font-medium text-white">
                            {item.processo.numero}
                          </p>
                          <p className="text-xs text-default-400">{item.titulo}</p>
                          <p className="mt-1 text-xs text-warning-600">
                            Vence em {new Date(item.dataVencimento).toLocaleString("pt-BR")}
                          </p>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-default-500">
                      Sem prazos próximos no seu escopo.
                    </p>
                  )}
                </CardBody>
              </Card>

              <Card className="border border-white/10 bg-background/55">
                <CardBody className="space-y-3 p-4">
                  <p className="text-sm font-semibold text-white">Audiências da semana</p>
                  {painelOperacional.listas.audienciasSemana.length > 0 ? (
                    <div className="space-y-2">
                      {painelOperacional.listas.audienciasSemana.map((item) => (
                        <button
                          key={item.id}
                          className="w-full rounded-lg border border-white/10 bg-background/40 p-3 text-left transition hover:border-primary/40 hover:bg-background/70"
                          disabled={!item.processo}
                          type="button"
                          onClick={() =>
                            item.processo
                              ? router.push(`/processos/${item.processo.id}`)
                              : undefined
                          }
                        >
                          <p className="text-sm font-medium text-white">{item.titulo}</p>
                          <p className="text-xs text-default-400">
                            {item.processo?.numero || "Sem processo vinculado"}
                          </p>
                          <div className="mt-1 flex items-center gap-2">
                            <Chip size="sm" variant="flat">
                              {new Date(item.dataInicio).toLocaleString("pt-BR")}
                            </Chip>
                            <Chip color="primary" size="sm" variant="flat">
                              {item.status}
                            </Chip>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-default-500">
                      Nenhuma audiência agendada para os próximos 7 dias.
                    </p>
                  )}
                </CardBody>
              </Card>
            </div>
          </div>
        ) : (
          <p className="text-sm text-default-500">
            Não foi possível carregar as prioridades agora.
          </p>
        )}
      </PeoplePanel>

      <PeoplePanel
        description="Movimentações que exigem atenção imediata."
        title="Feed Crítico"
      >
        {isLoadingPainelOperacional ? (
          <div className="flex items-center gap-2 text-sm text-default-500">
            <Spinner size="sm" />
            Carregando feed crítico...
          </div>
        ) : painelOperacional && painelOperacional.listas.feedCritico.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {painelOperacional.listas.feedCritico.map((item) => (
              <Card key={item.id} className="border border-white/10 bg-background/55">
                <CardBody className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-white">{item.titulo}</p>
                      <p className="text-xs text-default-400">{item.processo.numero}</p>
                    </div>
                    <Chip
                      color={getMovimentacaoPrioridadeColor(item.prioridade)}
                      size="sm"
                      variant="flat"
                    >
                      {item.prioridade}
                    </Chip>
                  </div>
                  {item.descricao ? (
                    <p className="line-clamp-2 text-xs text-default-400">{item.descricao}</p>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-2">
                    {item.tipo ? (
                      <Chip size="sm" variant="flat">
                        {item.tipo}
                      </Chip>
                    ) : null}
                    <Chip color="primary" size="sm" variant="flat">
                      {item.statusOperacional}
                    </Chip>
                    <Chip size="sm" variant="flat">
                      {new Date(item.dataMovimentacao).toLocaleString("pt-BR")}
                    </Chip>
                  </div>
                  <Button
                    color="primary"
                    size="sm"
                    startContent={<Activity className="h-4 w-4" />}
                    variant="flat"
                    onPress={() => router.push(`/processos/${item.processo.id}`)}
                  >
                    Abrir processo
                  </Button>
                </CardBody>
              </Card>
            ))}
          </div>
        ) : (
          <p className="text-sm text-default-500">
            Sem itens críticos no momento.
          </p>
        )}
      </PeoplePanel>

      <PeoplePanel
        description="Riscos de carteira para evitar perda de prazo e falta de dono."
        title="Saúde da Carteira"
      >
        {isLoadingPainelOperacional ? (
          <div className="flex items-center gap-2 text-sm text-default-500">
            <Spinner size="sm" />
            Carregando saúde da carteira...
          </div>
        ) : painelOperacional ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <PeopleMetricCard
                helper="No seu escopo"
                icon={<Building2 className="h-4 w-4" />}
                label="Processos ativos"
                tone="primary"
                value={painelOperacional.saude.processosAtivos}
              />
              <PeopleMetricCard
                helper="Sem movimentação >= 30 dias"
                icon={<Clock3 className="h-4 w-4" />}
                label="Inativos 30d"
                tone={painelOperacional.saude.semMovimento30d > 0 ? "warning" : "success"}
                value={painelOperacional.saude.semMovimento30d}
              />
              <PeopleMetricCard
                helper="Sem advogado definido"
                icon={<UserX className="h-4 w-4" />}
                label="Sem responsável"
                tone={painelOperacional.saude.semResponsavel > 0 ? "danger" : "success"}
                value={painelOperacional.saude.semResponsavel}
              />
              <PeopleMetricCard
                helper="Nunca receberam andamento"
                icon={<Activity className="h-4 w-4" />}
                label="Sem histórico"
                tone={painelOperacional.saude.semMovimentacaoHistorica > 0 ? "warning" : "success"}
                value={painelOperacional.saude.semMovimentacaoHistorica}
              />
            </div>

            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              <Card className="border border-white/10 bg-background/55">
                <CardBody className="space-y-3 p-4">
                  <p className="text-sm font-semibold text-white">
                    Processos sem movimentação recente
                  </p>
                  {painelOperacional.listas.processosSemMovimento30d.length > 0 ? (
                    <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                      {painelOperacional.listas.processosSemMovimento30d.map((item) => (
                        <button
                          key={item.id}
                          className="w-full rounded-lg border border-white/10 bg-background/40 p-3 text-left transition hover:border-primary/40 hover:bg-background/70"
                          type="button"
                          onClick={() => router.push(`/processos/${item.id}`)}
                        >
                          <p className="text-sm font-medium text-white">{item.numero}</p>
                          <p className="text-xs text-default-400">
                            {item.clienteNome} · {item.titulo || "Sem título"}
                          </p>
                          <p className="mt-1 text-xs text-warning-600">
                            {typeof item.diasSemMovimento === "number"
                              ? `${item.diasSemMovimento} dia(s) sem movimento`
                              : "Sem movimentação registrada"}
                          </p>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-default-500">
                      Nenhum processo inativo acima de 30 dias.
                    </p>
                  )}
                </CardBody>
              </Card>

              <Card className="border border-white/10 bg-background/55">
                <CardBody className="space-y-3 p-4">
                  <p className="text-sm font-semibold text-white">
                    Processos sem responsável
                  </p>
                  {painelOperacional.listas.processosSemResponsavel.length > 0 ? (
                    <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                      {painelOperacional.listas.processosSemResponsavel.map((item) => (
                        <button
                          key={item.id}
                          className="w-full rounded-lg border border-white/10 bg-background/40 p-3 text-left transition hover:border-primary/40 hover:bg-background/70"
                          type="button"
                          onClick={() => router.push(`/processos/${item.id}`)}
                        >
                          <p className="text-sm font-medium text-white">{item.numero}</p>
                          <p className="text-xs text-default-400">
                            {item.clienteNome} · {item.titulo || "Sem título"}
                          </p>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-default-500">
                      Todos os processos ativos possuem responsável.
                    </p>
                  )}
                </CardBody>
              </Card>
            </div>
          </div>
        ) : (
          <p className="text-sm text-default-500">
            Não foi possível carregar a saúde da carteira agora.
          </p>
        )}
      </PeoplePanel>

            <PeoplePanel
        description="Execute a sincronização por OAB via Jusbrasil e aguarde o retorno dos processos por webhook."
        title="Trazer Meus Processos"
      >
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <Input
              isDisabled={isStartingSync || isSyncRunning}
              label="OAB (opcional)"
              placeholder="Ex: 123456SP"
              value={syncOab}
              onChange={(event) => setSyncOab(event.target.value)}
            />

            <Input
              isDisabled={isStartingSync || isSyncRunning}
              label="Cliente padrão (opcional)"
              placeholder="Nome do cliente padrão"
              value={syncClienteNome}
              onChange={(event) => setSyncClienteNome(event.target.value)}
            />
          </div>

          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm text-primary-800">
            Origem da sincronização: Jusbrasil via webhook assíncrono.
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              color="primary"
              isLoading={isStartingSync}
              size="sm"
              startContent={<RefreshCw className="h-4 w-4" />}
              onPress={iniciarSync}
            >
              Iniciar sincronização
            </Button>
            {isLoadingSyncStatus && (
              <div className="flex items-center gap-2 text-sm text-default-500">
                <Spinner size="sm" />
                Carregando estado da sincronização...
              </div>
            )}
          </div>

          {isSyncRunning ? (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
              <div className="flex items-center gap-2 text-primary">
                <Spinner color="primary" size="sm" />
                <p className="text-sm font-semibold">
                  Processamento em background ativo
                </p>
              </div>
              <p className="mt-1 text-xs text-default-400">
                O monitoramento já foi registrado e a chegada dos processos depende
                do webhook do Jusbrasil. Você pode usar o sistema normalmente e
                acompanhar o progresso por aqui.
              </p>
            </div>
          ) : null}
          {syncStatus && (
            <div className="rounded-xl border border-white/10 bg-background/50 p-3 sm:p-4 space-y-3">
              <p className="text-xs text-default-500">
                Atualizado em{" "}
                {new Date(syncStatus.updatedAt).toLocaleString("pt-BR")}
              </p>
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-lg border border-white/10 bg-background/40 p-2.5">
                  <p className="text-[11px] uppercase tracking-wide text-default-500">
                    Capturados
                  </p>
                  <p className="text-lg font-semibold text-white">
                    {syncStatus.syncedCount ?? 0}
                  </p>
                </div>
                <div className="rounded-lg border border-success/20 bg-success/5 p-2.5">
                  <p className="text-[11px] uppercase tracking-wide text-success-700 dark:text-success-300">
                    Criados
                  </p>
                  <p className="text-lg font-semibold text-success">
                    {syncStatus.createdCount ?? 0}
                  </p>
                </div>
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-2.5">
                  <p className="text-[11px] uppercase tracking-wide text-primary-700 dark:text-primary-300">
                    Atualizados
                  </p>
                  <p className="text-lg font-semibold text-primary">
                    {syncStatus.updatedCount ?? 0}
                  </p>
                </div>
              </div>

              {syncStatus.error && (
                <div className="rounded-lg border border-danger/30 bg-danger/5 p-2 text-xs text-danger-700">
                  {syncStatus.error}
                </div>
              )}

              {Array.isArray(syncStatus.processosNumeros) &&
                syncStatus.processosNumeros.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {syncStatus.processosNumeros.slice(0, 6).map((numero) => (
                      <Chip key={numero} size="sm" variant="flat">
                        {numero}
                      </Chip>
                    ))}
                  </div>
                )}
            </div>
          )}
        </div>
      </PeoplePanel>

      <PeoplePanel
        description="Resultado real da sincronização mais recente. Clique para abrir o processo completo."
        title="Processos Sincronizados"
      >
        <div className="space-y-4">
          {!syncStatus?.syncId ? (
            <div className="flex items-center justify-center rounded-xl border border-white/10 bg-background/50 py-8">
              <div className="text-center">
                <Info className="mx-auto mb-3 h-10 w-10 text-default-300" />
                <p className="text-sm text-default-500">
                  Inicie uma sincronização para visualizar os processos capturados.
                </p>
              </div>
            </div>
          ) : isLoadingProcessosSincronizados ? (
            <div className="flex items-center justify-center py-8">
              <Spinner size="lg" />
            </div>
          ) : processosSincronizados.length > 0 ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-white/10 bg-background/40 px-3 py-2 text-xs text-default-500">
                {processosSincronizados.length} processo(s) encontrado(s) na
                sincronização {processosSincronizadosResponse?.syncId?.slice(0, 8) ?? "--"}
              </div>

              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {processosSincronizados.map((processo) => (
                  <Card
                    key={processo.id}
                    className="border border-white/10 bg-background/55"
                  >
                    <CardBody className="space-y-3 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-white">
                            {processo.numero}
                          </p>
                          <p className="line-clamp-2 text-xs text-default-400">
                            {processo.titulo || "Processo sem título cadastrado"}
                          </p>
                        </div>
                        <Chip color="primary" size="sm" variant="flat">
                          {getProcessoStatusLabel(processo.status)}
                        </Chip>
                      </div>

                      {processo.origemExterna ? (
                        <Chip color="warning" size="sm" variant="flat">
                          Criado via sincronização externa
                        </Chip>
                      ) : null}

                      <div className="flex flex-wrap items-center gap-2">
                        <Chip size="sm" variant="flat">
                          Cliente: {processo.cliente.nome}
                        </Chip>
                        {processo.tribunal?.sigla ? (
                          <Chip color="secondary" size="sm" variant="flat">
                            {processo.tribunal.sigla}
                            {processo.tribunal.uf ? `/${processo.tribunal.uf}` : ""}
                          </Chip>
                        ) : null}
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-default-500">
                          Atualizado em{" "}
                          {new Date(processo.updatedAt).toLocaleString("pt-BR")}
                        </p>
                        <Button
                          color="primary"
                          size="sm"
                          startContent={<FolderOpen className="h-4 w-4" />}
                          variant="flat"
                          onPress={() => router.push(`/processos/${processo.id}`)}
                        >
                          Abrir processo
                        </Button>
                      </div>
                    </CardBody>
                  </Card>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center rounded-xl border border-warning/30 bg-warning/5 py-8">
              <div className="space-y-2 text-center">
                <AlertTriangle className="mx-auto h-10 w-10 text-warning" />
                <p className="text-sm text-warning-700 dark:text-warning-300">
                  A sincronização retornou números, mas nenhum processo foi
                  localizado no cadastro do tenant.
                </p>
                <p className="text-xs text-default-500">
                  Referências da sync:{" "}
                  {processosSincronizadosResponse?.totalReferencias ?? 0}
                </p>
              </div>
            </div>
          )}
        </div>
      </PeoplePanel>

      <PeoplePanel
        description="Escolha a UF para listar os portais oficiais disponíveis para consulta."
        title="Tribunais por UF"
      >
        <div className="space-y-4">
          <UFSelector
            label="Filtrar por UF"
            ufs={ufOptions}
            value={ufSelecionada}
            onChange={(uf) => setUfSelecionada(uf)}
          />

          {!ufSelecionada ? (
            <div className="flex items-center justify-center rounded-xl border border-white/10 bg-background/50 py-8">
              <div className="text-center">
                <Info className="w-12 h-12 text-default-300 mx-auto mb-4" />
                <p className="text-default-500">
                  Selecione uma UF para ver os tribunais disponíveis
                </p>
              </div>
            </div>
          ) : isLoadingTribunais ? (
            <div className="flex items-center justify-center py-8">
              <Spinner size="lg" />
            </div>
          ) : tribunais && tribunais.length > 0 ? (
            <div className="space-y-3">
              {tribunais.map((tribunal) => (
                <Card
                  key={tribunal.id}
                  className="border border-white/10 bg-background/55"
                >
                  <CardBody className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-white">{tribunal.nome}</h3>
                        {tribunal.sigla && (
                          <Chip size="sm" variant="flat">
                            {tribunal.sigla}
                          </Chip>
                        )}
                        {tribunal.esfera && (
                          <Chip color="secondary" size="sm" variant="flat">
                            {tribunal.esfera}
                          </Chip>
                        )}
                      </div>
                      {tribunal.uf && (
                        <p className="text-sm text-default-500">UF: {tribunal.uf}</p>
                      )}
                    </div>

                    {tribunal.siteUrl ? (
                      <Button
                        as="a"
                        color="primary"
                        endContent={<ExternalLink className="w-4 h-4" />}
                        href={tribunal.siteUrl}
                        rel="noopener noreferrer"
                        size="sm"
                        target="_blank"
                        variant="flat"
                      >
                        Abrir portal
                      </Button>
                    ) : (
                      <Chip color="default" size="sm" variant="flat">
                        Sem portal
                      </Chip>
                    )}
                  </CardBody>
                </Card>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center rounded-xl border border-white/10 bg-background/50 py-8">
              <div className="text-center">
                <Info className="w-12 h-12 text-default-300 mx-auto mb-4" />
                <p className="text-default-500">
                  Nenhum tribunal encontrado para esta UF
                </p>
              </div>
            </div>
          )}
        </div>
      </PeoplePanel>

      <PeoplePanel
        description="Fontes oficiais para consulta operacional no dia a dia do escritório."
        title="Radar Jurídico"
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          <Card className="border border-white/10 bg-background/55">
            <CardBody className="space-y-2 p-4">
              <div className="flex items-center gap-2 text-warning-600">
                <Calendar className="h-4 w-4" />
                <p className="text-sm font-semibold">Calendário de Recessos</p>
              </div>
              {isLoadingRecursosOficiais ? (
                <div className="flex items-center gap-2 text-xs text-default-500">
                  <Spinner size="sm" />
                  Carregando fontes oficiais...
                </div>
              ) : calendarioRecursos.length > 0 ? (
                <div className="space-y-2">
                  {calendarioRecursos.map((item) => (
                    <a
                      key={item.id}
                      className="block rounded-lg border border-white/10 bg-background/40 px-3 py-2 text-sm text-primary hover:bg-background/70"
                      href={item.url}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{item.titulo}</span>
                        <Chip color="success" size="sm" variant="flat">
                          Oficial
                        </Chip>
                      </div>
                      <p className="mt-1 text-xs text-default-500">
                        {item.descricao}
                      </p>
                    </a>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-default-500">
                  Sem fonte oficial configurada para o tribunal selecionado.
                </p>
              )}
            </CardBody>
          </Card>
          <Card className="border border-white/10 bg-background/55">
            <CardBody className="space-y-2 p-4">
              <div className="flex items-center gap-2 text-success-600">
                <FileText className="h-4 w-4" />
                <p className="text-sm font-semibold">Comunicados e Editais</p>
              </div>
              {isLoadingRecursosOficiais ? (
                <div className="flex items-center gap-2 text-xs text-default-500">
                  <Spinner size="sm" />
                  Carregando fontes oficiais...
                </div>
              ) : comunicadosRecursos.length > 0 ? (
                <div className="space-y-2">
                  {comunicadosRecursos.map((item) => (
                    <a
                      key={item.id}
                      className="block rounded-lg border border-white/10 bg-background/40 px-3 py-2 text-sm text-primary hover:bg-background/70"
                      href={item.url}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{item.titulo}</span>
                        <Chip color="success" size="sm" variant="flat">
                          Oficial
                        </Chip>
                      </div>
                      <p className="mt-1 text-xs text-default-500">
                        {item.descricao}
                      </p>
                    </a>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-default-500">
                  Sem fonte oficial configurada para o tribunal selecionado.
                </p>
              )}
            </CardBody>
          </Card>
          <Card className="border border-white/10 bg-background/55">
            <CardBody className="space-y-2 p-4">
              <div className="flex items-center gap-2 text-secondary-600">
                <LinkIcon className="h-4 w-4" />
                <p className="text-sm font-semibold">Links Úteis</p>
              </div>
              {isLoadingRecursosOficiais ? (
                <div className="flex items-center gap-2 text-xs text-default-500">
                  <Spinner size="sm" />
                  Carregando fontes oficiais...
                </div>
              ) : (
                <div className="space-y-2">
                  {linksRecursos.map((item) => (
                    <a
                      key={item.id}
                      className="block rounded-lg border border-white/10 bg-background/40 px-3 py-2 text-sm text-primary hover:bg-background/70"
                      href={item.url}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{item.titulo}</span>
                        <Chip color="success" size="sm" variant="flat">
                          Oficial
                        </Chip>
                      </div>
                      <p className="mt-1 text-xs text-default-500">
                        {item.descricao}
                      </p>
                    </a>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      </PeoplePanel>
    </section>
  );
}



