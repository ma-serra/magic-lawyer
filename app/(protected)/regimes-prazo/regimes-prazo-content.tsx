"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { AlertTriangle, CalendarClock, Clock3, Edit3, Plus, Search, ShieldCheck, Trash2 } from "lucide-react";
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
  Skeleton,
  Switch,
  Textarea,
} from "@heroui/react";

import { DateInput } from "@/components/ui/date-input";
import {
  PeopleEntityCard,
  PeopleEntityCardBody,
  PeopleEntityCardHeader,
  PeopleMetricCard,
  PeoplePageHeader,
  PeoplePanel,
} from "@/components/people-ui";
import {
  createRegimePrazo,
  deleteRegimePrazo,
  ensureDefaultRegimesCatalog,
  listRegimesPrazo,
  simulateRegimePrazo,
  syncRegimesNationalHolidays,
  updateRegimePrazo,
  type RegimePrazoPayload,
} from "@/app/actions/regimes-prazo";
import { toast } from "@/lib/toast";

interface RegimePrazoDto {
  id: string;
  tenantId: string | null;
  nome: string;
  tipo: string;
  contarDiasUteis: boolean;
  descricao: string | null;
  createdAt: string;
  updatedAt: string;
  totalPrazosVinculados: number;
  totalDiligenciasVinculadas: number;
  totalVinculos: number;
}

interface RegimesInsightsDto {
  prazosAbertos: number;
  prazosVencidos: number;
  prazosVencendoHoje: number;
  prazosVencendo3Dias: number;
  feriadosAtivosAno: number;
}

interface RegimesPrazoResponseDto {
  regimes: RegimePrazoDto[];
  insights: RegimesInsightsDto;
}

interface SimulacaoResultadoDto {
  regimeId: string;
  regimeNome: string;
  tipo: string;
  contarDiasUteis: boolean;
  incluirDataInicio: boolean;
  quantidadeDias: number;
  dataInicio: string;
  dataInicioFormatada: string;
  dataVencimento: string;
  dataVencimentoFormatada: string;
  diasCorridosPercorridos: number;
  finaisSemanaIgnorados: number;
  feriadosIgnorados: number;
}

const TIPO_OPTIONS = [
  { key: "JUSTICA_COMUM", label: "Justiça Comum" },
  { key: "JUIZADO_ESPECIAL", label: "Juizado Especial" },
  { key: "TRABALHISTA", label: "Trabalhista" },
  { key: "FEDERAL", label: "Federal" },
  { key: "OUTRO", label: "Outro" },
] as const;

const TIPO_FILTER_OPTIONS = [
  { key: "all", label: "Todos os tipos" },
  ...TIPO_OPTIONS,
];

const CONTAGEM_FILTER_OPTIONS = [
  { key: "all", label: "Qualquer contagem" },
  { key: "uteis", label: "Somente dias úteis" },
  { key: "corridos", label: "Dias corridos" },
];

const ORIGEM_FILTER_OPTIONS = [
  { key: "all", label: "Todas as origens" },
  { key: "tenant", label: "Personalizados do escritório" },
  { key: "globais", label: "Base global do sistema" },
];

const PER_PAGE_OPTIONS = [8, 12, 20];

const defaultInsights: RegimesInsightsDto = {
  prazosAbertos: 0,
  prazosVencidos: 0,
  prazosVencendoHoje: 0,
  prazosVencendo3Dias: 0,
  feriadosAtivosAno: 0,
};

const regimeFetcher = async (): Promise<RegimesPrazoResponseDto> => {
  const result = await listRegimesPrazo();

  if (!result.success) {
    throw new Error(result.error || "Erro ao carregar regimes de prazo");
  }

  const regimes = (result.regimes || []).map((regime) => ({
    id: regime.id,
    tenantId: regime.tenantId ?? null,
    nome: regime.nome,
    tipo: regime.tipo,
    contarDiasUteis: regime.contarDiasUteis,
    descricao: regime.descricao ?? null,
    createdAt: regime.createdAt.toISOString(),
    updatedAt: regime.updatedAt.toISOString(),
    totalPrazosVinculados: regime.totalPrazosVinculados ?? 0,
    totalDiligenciasVinculadas: regime.totalDiligenciasVinculadas ?? 0,
    totalVinculos: regime.totalVinculos ?? 0,
  }));

  return {
    regimes,
    insights: result.insights ?? defaultInsights,
  };
};

function mapTipoLabel(tipo: string) {
  return TIPO_OPTIONS.find((option) => option.key === tipo)?.label ?? tipo;
}

function buildRegimeDisplayLabel(regime: RegimePrazoDto): string {
  const tipoLabel = mapTipoLabel(regime.tipo);
  const nomeNormalizado = regime.nome.trim().toLowerCase();
  const tipoNormalizado = tipoLabel.trim().toLowerCase();

  if (nomeNormalizado === tipoNormalizado) {
    return regime.nome;
  }

  return `${regime.nome} • ${tipoLabel}`;
}

function hasTypeLabelDuplication(regime: RegimePrazoDto): boolean {
  return regime.nome.trim().toLowerCase() === mapTipoLabel(regime.tipo).trim().toLowerCase();
}

export function RegimesPrazoContent() {
  const { data, mutate, isLoading } = useSWR("regimes-prazo", regimeFetcher);
  const currentYear = new Date().getFullYear();
  const syncYearOptions = useMemo(
    () => [currentYear - 1, currentYear, currentYear + 1, currentYear + 2],
    [currentYear],
  );

  const regimes = useMemo(() => data?.regimes ?? [], [data]);
  const insights = data?.insights ?? defaultInsights;
  const regimeIdSet = useMemo(
    () => new Set(regimes.map((regime) => regime.id)),
    [regimes],
  );

  const [form, setForm] = useState({
    nome: "",
    tipo: "JUSTICA_COMUM" as RegimePrazoPayload["tipo"],
    contarDiasUteis: true,
    descricao: "",
  });
  const [isCreating, setIsCreating] = useState(false);
  const [editingRegime, setEditingRegime] = useState<RegimePrazoDto | null>(
    null,
  );
  const [deletingRegime, setDeletingRegime] = useState<RegimePrazoDto | null>(
    null,
  );
  const [isDeleting, setIsDeleting] = useState(false);

  const [filtros, setFiltros] = useState({
    search: "",
    tipo: "all",
    contagem: "all",
    origem: "all",
    somenteComUso: false,
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [perPage, setPerPage] = useState(8);

  const [simulador, setSimulador] = useState({
    regimeId: "",
    dataInicio: "",
    quantidadeDias: "15",
    incluirDataInicio: false,
  });
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulacaoResultado, setSimulacaoResultado] =
    useState<SimulacaoResultadoDto | null>(null);
  const [syncYear, setSyncYear] = useState(String(currentYear));
  const [isSyncingHolidays, setIsSyncingHolidays] = useState(false);
  const [isEnsuringCatalog, setIsEnsuringCatalog] = useState(false);

  const selectedCreateTipoKeys = TIPO_OPTIONS.some(
    (option) => option.key === form.tipo,
  )
    ? [form.tipo]
    : ["JUSTICA_COMUM"];

  const selectedTipoFilterKeys = TIPO_FILTER_OPTIONS.some(
    (option) => option.key === filtros.tipo,
  )
    ? [filtros.tipo]
    : ["all"];

  const selectedContagemFilterKeys = CONTAGEM_FILTER_OPTIONS.some(
    (option) => option.key === filtros.contagem,
  )
    ? [filtros.contagem]
    : ["all"];

  const selectedOrigemFilterKeys = ORIGEM_FILTER_OPTIONS.some(
    (option) => option.key === filtros.origem,
  )
    ? [filtros.origem]
    : ["all"];

  const selectedPerPageKeys = PER_PAGE_OPTIONS.includes(perPage)
    ? [String(perPage)]
    : [String(PER_PAGE_OPTIONS[0])];

  const selectedSimRegimeKeys =
    simulador.regimeId && regimeIdSet.has(simulador.regimeId)
      ? [simulador.regimeId]
      : [];
  const selectedSyncYearKeys = syncYearOptions.includes(Number(syncYear))
    ? [syncYear]
    : [String(currentYear)];

  const hasActiveFilters = useMemo(
    () =>
      Boolean(
        filtros.search.trim() ||
          filtros.tipo !== "all" ||
          filtros.contagem !== "all" ||
          filtros.origem !== "all" ||
          filtros.somenteComUso,
      ),
    [filtros],
  );

  const filteredRegimes = useMemo(() => {
    const term = filtros.search.trim().toLowerCase();

    return regimes.filter((regime) => {
      if (term) {
        const text = [
          regime.nome,
          mapTipoLabel(regime.tipo),
          regime.descricao ?? "",
        ]
          .join(" ")
          .toLowerCase();

        if (!text.includes(term)) {
          return false;
        }
      }

      if (filtros.tipo !== "all" && regime.tipo !== filtros.tipo) {
        return false;
      }

      if (filtros.contagem === "uteis" && !regime.contarDiasUteis) {
        return false;
      }

      if (filtros.contagem === "corridos" && regime.contarDiasUteis) {
        return false;
      }

      if (filtros.origem === "tenant" && !regime.tenantId) {
        return false;
      }

      if (filtros.origem === "globais" && regime.tenantId) {
        return false;
      }

      if (filtros.somenteComUso && regime.totalVinculos <= 0) {
        return false;
      }

      return true;
    });
  }, [regimes, filtros]);

  const totalPages = Math.max(1, Math.ceil(filteredRegimes.length / perPage));

  const paginatedRegimes = useMemo(() => {
    const start = (currentPage - 1) * perPage;
    return filteredRegimes.slice(start, start + perPage);
  }, [filteredRegimes, currentPage, perPage]);

  useEffect(() => {
    setCurrentPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  const totalRegimes = regimes.length;
  const totalRegimesCustom = regimes.filter((regime) => regime.tenantId).length;
  const totalRegimesGlobais = regimes.filter((regime) => !regime.tenantId).length;
  const totalRegimesEmUso = regimes.filter(
    (regime) => regime.totalVinculos > 0,
  ).length;

  const clearFilters = useCallback(() => {
    setFiltros({
      search: "",
      tipo: "all",
      contagem: "all",
      origem: "all",
      somenteComUso: false,
    });
    setCurrentPage(1);
  }, []);

  const scrollToNovoRegime = useCallback(() => {
    document.getElementById("novo-regime-panel")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, []);

  const handleCreate = useCallback(async () => {
    if (!form.nome.trim()) {
      toast.error("Informe o nome do regime");
      return;
    }

    setIsCreating(true);

    try {
      const result = await createRegimePrazo({
        nome: form.nome.trim(),
        tipo: form.tipo,
        contarDiasUteis: form.contarDiasUteis,
        descricao: form.descricao.trim() || undefined,
      });

      if (!result.success) {
        toast.error(result.error || "Erro ao criar regime");
        return;
      }

      toast.success("Regime criado com sucesso");
      setForm((prev) => ({
        ...prev,
        nome: "",
        contarDiasUteis: true,
        descricao: "",
      }));
      await mutate();
    } catch {
      toast.error("Erro ao criar regime");
    } finally {
      setIsCreating(false);
    }
  }, [form, mutate]);

  const handleOpenEdit = useCallback((regime: RegimePrazoDto) => {
    if (!regime.tenantId) {
      toast.info("Regimes globais são somente leitura neste módulo.");
      return;
    }
    setEditingRegime(regime);
  }, []);

  const handleSaveEdit = useCallback(
    async (payload: {
      nome: string;
      tipo: RegimePrazoPayload["tipo"];
      contarDiasUteis: boolean;
      descricao: string;
    }) => {
      if (!editingRegime) return;

      const result = await updateRegimePrazo(editingRegime.id, {
        nome: payload.nome,
        tipo: payload.tipo,
        contarDiasUteis: payload.contarDiasUteis,
        descricao: payload.descricao,
      });

      if (!result.success) {
        toast.error(result.error || "Erro ao atualizar regime");
        return;
      }

      toast.success("Regime atualizado");
      setEditingRegime(null);
      await mutate();
    },
    [editingRegime, mutate],
  );

  const handleRequestDelete = useCallback((regime: RegimePrazoDto) => {
    if (!regime.tenantId) {
      toast.info("Regimes globais não podem ser removidos pelo escritório.");
      return;
    }
    setDeletingRegime(regime);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!deletingRegime) return;

    setIsDeleting(true);

    try {
      const result = await deleteRegimePrazo(deletingRegime.id);

      if (!result.success) {
        toast.error(result.error || "Não foi possível remover o regime");
        return;
      }

      toast.success("Regime removido");
      setDeletingRegime(null);
      await mutate();
    } catch {
      toast.error("Erro ao remover regime");
    } finally {
      setIsDeleting(false);
    }
  }, [deletingRegime, mutate]);

  const handleSimulate = useCallback(async () => {
    if (!simulador.regimeId || !regimeIdSet.has(simulador.regimeId)) {
      toast.error("Selecione um regime para simular");
      return;
    }

    const quantidadeDias = Number(simulador.quantidadeDias);

    if (!Number.isInteger(quantidadeDias) || quantidadeDias <= 0) {
      toast.error("Informe uma quantidade de dias válida");
      return;
    }

    if (!simulador.dataInicio) {
      toast.error("Informe a data inicial do prazo");
      return;
    }

    setIsSimulating(true);

    try {
      const result = await simulateRegimePrazo({
        regimeId: simulador.regimeId,
        dataInicio: simulador.dataInicio,
        quantidadeDias,
        incluirDataInicio: simulador.incluirDataInicio,
      });

      if (!result.success || !result.simulation) {
        toast.error(result.error || "Erro ao simular prazo");
        return;
      }

      setSimulacaoResultado(result.simulation as SimulacaoResultadoDto);
    } catch {
      toast.error("Erro ao simular prazo");
    } finally {
      setIsSimulating(false);
    }
  }, [simulador, regimeIdSet]);

  const handleSyncOfficialHolidays = useCallback(async () => {
    const year = Number(syncYear);

    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      toast.error("Selecione um ano válido para sincronização");
      return;
    }

    setIsSyncingHolidays(true);

    try {
      const result = await syncRegimesNationalHolidays(year);

      if (!result.success || !result.data) {
        toast.error(result.error || "Falha ao sincronizar feriados oficiais");
        return;
      }

      toast.success(
        `Sincronização ${result.data.ano}: ${result.data.created} novo(s), ${result.data.updated} atualizado(s), ${result.data.ignored} já existente(s).`,
      );
      await mutate();
    } catch {
      toast.error("Erro ao sincronizar feriados oficiais");
    } finally {
      setIsSyncingHolidays(false);
    }
  }, [syncYear, mutate]);

  const handleEnsureDefaultCatalog = useCallback(async () => {
    setIsEnsuringCatalog(true);

    try {
      const result = await ensureDefaultRegimesCatalog();

      if (!result.success || !result.data) {
        toast.error(result.error || "Falha ao garantir catálogo padrão");
        return;
      }

      toast.success(
        `Catálogo padrão: ${result.data.created} novo(s) criado(s), ${result.data.ignored} já existente(s).`,
      );
      await mutate();
    } catch {
      toast.error("Erro ao garantir catálogo padrão");
    } finally {
      setIsEnsuringCatalog(false);
    }
  }, [mutate]);

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-6">
      <PeoplePageHeader
        tag="Atividade jurídica"
        title="Regimes de prazo"
        description="Padronize regras de contagem, reduza risco operacional e simule vencimentos com base em dias úteis, dias corridos e feriados."
        actions={
          <Button
            color="primary"
            size="sm"
            startContent={<Plus className="h-4 w-4" />}
            onPress={scrollToNovoRegime}
          >
            Novo regime
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <PeopleMetricCard
          icon={<CalendarClock className="h-4 w-4" />}
          label="Regimes cadastrados"
          value={totalRegimes}
          tone="primary"
          helper="Base total disponível para seleção"
        />
        <PeopleMetricCard
          icon={<ShieldCheck className="h-4 w-4" />}
          label="Personalizados"
          value={totalRegimesCustom}
          tone="success"
          helper="Criados pelo seu escritório"
        />
        <PeopleMetricCard
          icon={<Clock3 className="h-4 w-4" />}
          label="Regimes em uso"
          value={totalRegimesEmUso}
          tone="warning"
          helper="Com vínculos em prazos ou diligências"
        />
        <PeopleMetricCard
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Globais"
          value={totalRegimesGlobais}
          tone="secondary"
          helper="Base comum do sistema"
        />
      </div>

      <PeoplePanel
        title="Radar de risco de prazo"
        description="Acompanhamento operacional da carteira de prazos processuais do escritório."
        actions={
          <div className="flex flex-wrap items-end gap-2">
            <Select
              className="min-w-[130px]"
              label="Ano"
              selectedKeys={selectedSyncYearKeys}
              onSelectionChange={(keys) => {
                const [value] = Array.from(keys) as string[];
                setSyncYear(value || String(currentYear));
              }}
            >
              {syncYearOptions.map((year) => (
                <SelectItem key={String(year)} textValue={String(year)}>
                  {year}
                </SelectItem>
              ))}
            </Select>
            <Button
              color="primary"
              isLoading={isSyncingHolidays}
              size="sm"
              variant="flat"
              onPress={handleSyncOfficialHolidays}
            >
              Sincronizar feriados oficiais
            </Button>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <PeopleMetricCard
            icon={<CalendarClock className="h-4 w-4" />}
            label="Prazos abertos"
            value={insights.prazosAbertos}
            tone="primary"
          />
          <PeopleMetricCard
            icon={<AlertTriangle className="h-4 w-4" />}
            label="Vencidos"
            value={insights.prazosVencidos}
            tone="danger"
          />
          <PeopleMetricCard
            icon={<Clock3 className="h-4 w-4" />}
            label="Vencem hoje"
            value={insights.prazosVencendoHoje}
            tone="warning"
          />
          <PeopleMetricCard
            icon={<Clock3 className="h-4 w-4" />}
            label="Vencem em 3 dias"
            value={insights.prazosVencendo3Dias}
            tone="secondary"
          />
          <PeopleMetricCard
            icon={<ShieldCheck className="h-4 w-4" />}
            label="Feriados no ano"
            value={insights.feriadosAtivosAno}
            tone="default"
            helper="Base usada nas simulações em dias úteis"
          />
        </div>
      </PeoplePanel>

      <PeoplePanel
        title="Simulador de vencimento"
        description="Use antes de lançar prazo no processo para validar data final e impacto de finais de semana/feriados."
      >
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1.3fr_1fr_1fr_auto]">
            <Select
              className="w-full"
              isRequired
              label="Regime"
              placeholder="Selecione o regime"
              selectedKeys={selectedSimRegimeKeys}
              onSelectionChange={(keys) => {
                const [value] = Array.from(keys) as string[];
                setSimulador((prev) => ({
                  ...prev,
                  regimeId: value || "",
                }));
              }}
            >
              {regimes.map((regime) => (
                <SelectItem
                  key={regime.id}
                  textValue={buildRegimeDisplayLabel(regime)}
                >
                  {buildRegimeDisplayLabel(regime)}
                </SelectItem>
              ))}
            </Select>

            <DateInput
              className="w-full"
              isRequired
              label="Data inicial"
              value={simulador.dataInicio}
              onValueChange={(value) =>
                setSimulador((prev) => ({
                  ...prev,
                  dataInicio: value,
                }))
              }
            />

            <Input
              className="w-full"
              isRequired
              label="Quantidade de dias"
              min={1}
              placeholder="Ex.: 15"
              type="number"
              value={simulador.quantidadeDias}
              onValueChange={(value) =>
                setSimulador((prev) => ({
                  ...prev,
                  quantidadeDias: value,
                }))
              }
            />

            <div className="flex items-center md:items-end">
              <Switch
                isSelected={simulador.incluirDataInicio}
                onValueChange={(selected) =>
                  setSimulador((prev) => ({
                    ...prev,
                    incluirDataInicio: selected,
                  }))
                }
              >
                Incluir dia inicial
              </Switch>
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="flat"
              onPress={() => {
                setSimulador({
                  regimeId: "",
                  dataInicio: "",
                  quantidadeDias: "15",
                  incluirDataInicio: false,
                });
                setSimulacaoResultado(null);
              }}
            >
              Limpar simulador
            </Button>
            <Button
              color="primary"
              isLoading={isSimulating}
              onPress={handleSimulate}
            >
              Simular vencimento
            </Button>
          </div>

          {simulacaoResultado ? (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-primary/80">
                    Data de início
                  </p>
                  <p className="text-sm font-semibold text-white">
                    {simulacaoResultado.dataInicioFormatada}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-success/80">
                    Data de vencimento
                  </p>
                  <p className="text-sm font-semibold text-success">
                    {simulacaoResultado.dataVencimentoFormatada}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-default-400">
                    Dias corridos percorridos
                  </p>
                  <p className="text-sm font-semibold text-white">
                    {simulacaoResultado.diasCorridosPercorridos}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-default-400">
                    Filtro aplicado
                  </p>
                  <p className="text-sm font-semibold text-white">
                    {simulacaoResultado.contarDiasUteis
                      ? "Dias úteis"
                      : "Dias corridos"}
                  </p>
                </div>
              </div>
              {simulacaoResultado.contarDiasUteis ? (
                <>
                  <Divider className="my-4 border-white/10" />
                  <div className="flex flex-wrap gap-2 text-xs text-default-300">
                    <Chip color="warning" size="sm" variant="flat">
                      {simulacaoResultado.finaisSemanaIgnorados} finais de semana
                      ignorados
                    </Chip>
                    <Chip color="secondary" size="sm" variant="flat">
                      {simulacaoResultado.feriadosIgnorados} feriados ignorados
                    </Chip>
                    <Chip color="primary" size="sm" variant="flat">
                      Regime: {simulacaoResultado.regimeNome}
                    </Chip>
                  </div>
                  <div className="mt-3 rounded-lg border border-white/10 bg-white/5 p-3 text-xs text-default-300">
                    <p>
                      <span className="font-semibold text-white/90">Legenda:</span>{" "}
                      <span className="font-semibold">Finais de semana ignorados</span>{" "}
                      são sábados e domingos não contabilizados no prazo.
                    </p>
                    <p className="mt-1">
                      <span className="font-semibold">Feriados ignorados</span>{" "}
                      são datas cadastradas como feriado (nacional, estadual,
                      municipal ou judiciário) que caíram no período e foram
                      desconsideradas porque o regime está em dias úteis.
                    </p>
                  </div>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </PeoplePanel>

      <div id="novo-regime-panel">
        <PeoplePanel
          title="Novo regime"
          description="Cadastre regras de contagem para padronizar cálculos e reduzir retrabalho operacional."
        >
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                isRequired
                label="Nome"
                placeholder="Ex.: Justiça Comum"
                value={form.nome}
                onValueChange={(value) =>
                  setForm((prev) => ({
                    ...prev,
                    nome: value,
                  }))
                }
              />
              <Select
                label="Tipo"
                selectedKeys={selectedCreateTipoKeys}
                onSelectionChange={(keys) => {
                  const [value] = Array.from(keys) as string[];
                  setForm((prev) => ({
                    ...prev,
                    tipo:
                      (value as RegimePrazoPayload["tipo"]) || "JUSTICA_COMUM",
                  }));
                }}
              >
                {TIPO_OPTIONS.map((option) => (
                  <SelectItem key={option.key} textValue={option.label}>
                    {option.label}
                  </SelectItem>
                ))}
              </Select>
            </div>

            <Switch
              isSelected={form.contarDiasUteis}
              onValueChange={(selected) =>
                setForm((prev) => ({
                  ...prev,
                  contarDiasUteis: selected,
                }))
              }
            >
              Contar apenas dias úteis
            </Switch>

            <Textarea
              label="Descrição"
              placeholder="Ex.: usar este regime em prazos cíveis comuns do TJ local."
              value={form.descricao}
              onValueChange={(value) =>
                setForm((prev) => ({
                  ...prev,
                  descricao: value,
                }))
              }
            />

            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="flat"
                onPress={() =>
                  setForm((prev) => ({
                    ...prev,
                    nome: "",
                    descricao: "",
                    contarDiasUteis: true,
                  }))
                }
              >
                Limpar
              </Button>
              <Button
                color="primary"
                isLoading={isCreating}
                onPress={handleCreate}
              >
                Salvar regime
              </Button>
            </div>
          </div>
        </PeoplePanel>
      </div>

      <PeoplePanel
        title="Regimes cadastrados"
        description={`${filteredRegimes.length} regime(s) no resultado atual. Catálogo base do Magic Lawyer pode ser reaplicado a qualquer momento.`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              color="primary"
              isLoading={isEnsuringCatalog}
              size="sm"
              variant="flat"
              onPress={handleEnsureDefaultCatalog}
            >
              Garantir catálogo base
            </Button>
            <Button
              isDisabled={!hasActiveFilters}
              size="sm"
              variant="flat"
              onPress={clearFilters}
            >
              Limpar filtros
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <Input
              className="w-full"
              isClearable
              label="Buscar"
              placeholder="Nome, tipo ou descrição"
              startContent={<Search className="h-4 w-4 text-default-400" />}
              value={filtros.search}
              onValueChange={(value) => {
                setFiltros((prev) => ({
                  ...prev,
                  search: value,
                }));
                setCurrentPage(1);
              }}
            />

            <Select
              className="w-full"
              label="Tipo"
              selectedKeys={selectedTipoFilterKeys}
              onSelectionChange={(keys) => {
                const [value] = Array.from(keys) as string[];
                setFiltros((prev) => ({
                  ...prev,
                  tipo: value || "all",
                }));
                setCurrentPage(1);
              }}
            >
              {TIPO_FILTER_OPTIONS.map((option) => (
                <SelectItem key={option.key} textValue={option.label}>
                  {option.label}
                </SelectItem>
              ))}
            </Select>

            <Select
              className="w-full"
              label="Contagem"
              selectedKeys={selectedContagemFilterKeys}
              onSelectionChange={(keys) => {
                const [value] = Array.from(keys) as string[];
                setFiltros((prev) => ({
                  ...prev,
                  contagem: value || "all",
                }));
                setCurrentPage(1);
              }}
            >
              {CONTAGEM_FILTER_OPTIONS.map((option) => (
                <SelectItem key={option.key} textValue={option.label}>
                  {option.label}
                </SelectItem>
              ))}
            </Select>

            <Select
              className="w-full"
              label="Origem"
              selectedKeys={selectedOrigemFilterKeys}
              onSelectionChange={(keys) => {
                const [value] = Array.from(keys) as string[];
                setFiltros((prev) => ({
                  ...prev,
                  origem: value || "all",
                }));
                setCurrentPage(1);
              }}
            >
              {ORIGEM_FILTER_OPTIONS.map((option) => (
                <SelectItem key={option.key} textValue={option.label}>
                  {option.label}
                </SelectItem>
              ))}
            </Select>

            <Select
              className="w-full min-w-[140px] xl:max-w-[180px]"
              label="Por página"
              selectedKeys={selectedPerPageKeys}
              onSelectionChange={(keys) => {
                const [value] = Array.from(keys) as string[];
                const parsed = Number(value);
                setPerPage(PER_PAGE_OPTIONS.includes(parsed) ? parsed : 8);
                setCurrentPage(1);
              }}
            >
              {PER_PAGE_OPTIONS.map((option) => (
                <SelectItem key={String(option)} textValue={String(option)}>
                  {option}
                </SelectItem>
              ))}
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              isSelected={filtros.somenteComUso}
              onValueChange={(selected) => {
                setFiltros((prev) => ({
                  ...prev,
                  somenteComUso: selected,
                }));
                setCurrentPage(1);
              }}
            >
              Mostrar apenas regimes em uso
            </Switch>
            {hasActiveFilters ? (
              <Chip color="primary" size="sm" variant="flat">
                Filtro ativo
              </Chip>
            ) : null}
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={`regime-skeleton-${index}`} className="h-32 rounded-xl" />
              ))}
            </div>
          ) : paginatedRegimes.length > 0 ? (
            <div className="space-y-3">
              {paginatedRegimes.map((regime) => {
                const isCustom = Boolean(regime.tenantId);
                const showTypeChip = !hasTypeLabelDuplication(regime);
                return (
                  <PeopleEntityCard
                    key={regime.id}
                    isPressable={isCustom}
                    onPress={() => handleOpenEdit(regime)}
                  >
                    <PeopleEntityCardHeader>
                      <div className="flex w-full flex-wrap items-start justify-between gap-3">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-semibold text-white">
                              {regime.nome}
                            </h3>
                            {showTypeChip ? (
                              <Chip color="secondary" size="sm" variant="flat">
                                {mapTipoLabel(regime.tipo)}
                              </Chip>
                            ) : null}
                            <Chip
                              color={isCustom ? "primary" : "default"}
                              size="sm"
                              variant="flat"
                            >
                              {isCustom ? "Personalizado" : "Global"}
                            </Chip>
                          </div>
                          <p className="text-xs text-default-400">
                            {regime.contarDiasUteis
                              ? "Contagem em dias úteis"
                              : "Contagem contínua (dias corridos)"}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Chip color="warning" size="sm" variant="flat">
                            {regime.totalPrazosVinculados} prazo(s)
                          </Chip>
                          <Chip color="primary" size="sm" variant="flat">
                            {regime.totalDiligenciasVinculadas} diligência(s)
                          </Chip>
                        </div>
                      </div>
                    </PeopleEntityCardHeader>

                    <PeopleEntityCardBody className="space-y-3">
                      {regime.descricao ? (
                        <p className="text-sm text-default-400">
                          {regime.descricao}
                        </p>
                      ) : (
                        <p className="text-sm text-default-500">
                          Sem descrição cadastrada.
                        </p>
                      )}

                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          isDisabled={!isCustom}
                          size="sm"
                          startContent={<Edit3 className="h-3.5 w-3.5" />}
                          variant="flat"
                          onPress={() => handleOpenEdit(regime)}
                        >
                          Editar
                        </Button>
                        <Button
                          color="danger"
                          isDisabled={!isCustom}
                          size="sm"
                          startContent={<Trash2 className="h-3.5 w-3.5" />}
                          variant="flat"
                          onPress={() => handleRequestDelete(regime)}
                        >
                          Remover
                        </Button>
                      </div>
                    </PeopleEntityCardBody>
                  </PeopleEntityCard>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-white/10 bg-background/40 p-6">
              <p className="text-sm text-default-400">
                Nenhum regime encontrado com os filtros aplicados.
              </p>
              {hasActiveFilters ? (
                <Button className="mt-3" size="sm" variant="flat" onPress={clearFilters}>
                  Limpar filtros
                </Button>
              ) : null}
            </div>
          )}

          {filteredRegimes.length > perPage ? (
            <div className="flex justify-center pt-2">
              <Pagination
                page={currentPage}
                total={totalPages}
                onChange={setCurrentPage}
              />
            </div>
          ) : null}
        </div>
      </PeoplePanel>

      <EditRegimeModal
        regime={editingRegime}
        onClose={() => setEditingRegime(null)}
        onSave={handleSaveEdit}
      />

      <Modal isOpen={Boolean(deletingRegime)} onOpenChange={() => setDeletingRegime(null)}>
        <ModalContent>
          <ModalHeader className="text-danger">Excluir regime de prazo</ModalHeader>
          <ModalBody>
            <p className="text-sm text-default-500">
              Esta ação remove o regime{" "}
              <span className="font-semibold text-default-800">
                {deletingRegime?.nome}
              </span>
              . O sistema bloqueia a exclusão se houver prazos/diligências vinculados.
            </p>
          </ModalBody>
          <ModalFooter>
            <Button
              isDisabled={isDeleting}
              variant="light"
              onPress={() => setDeletingRegime(null)}
            >
              Cancelar
            </Button>
            <Button
              color="danger"
              isLoading={isDeleting}
              onPress={handleConfirmDelete}
            >
              Confirmar exclusão
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}

interface EditRegimeModalProps {
  regime: RegimePrazoDto | null;
  onClose: () => void;
  onSave: (payload: {
    nome: string;
    tipo: RegimePrazoPayload["tipo"];
    contarDiasUteis: boolean;
    descricao: string;
  }) => Promise<void>;
}

function EditRegimeModal({ regime, onClose, onSave }: EditRegimeModalProps) {
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<RegimePrazoPayload["tipo"]>(
    "JUSTICA_COMUM",
  );
  const [contarDiasUteis, setContarDiasUteis] = useState(true);
  const [descricao, setDescricao] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setNome(regime?.nome ?? "");
    setTipo(
      (regime?.tipo as RegimePrazoPayload["tipo"]) ?? "JUSTICA_COMUM",
    );
    setContarDiasUteis(regime?.contarDiasUteis ?? true);
    setDescricao(regime?.descricao ?? "");
  }, [regime]);

  const selectedTipoKeys = TIPO_OPTIONS.some((option) => option.key === tipo)
    ? [tipo]
    : ["JUSTICA_COMUM"];

  const handleConfirm = async () => {
    if (!regime) return;
    if (!nome.trim()) {
      toast.error("Informe o nome do regime");
      return;
    }

    setIsSaving(true);

    try {
      await onSave({
        nome: nome.trim(),
        tipo,
        contarDiasUteis,
        descricao: descricao.trim(),
      });
    } catch {
      toast.error("Erro ao atualizar regime");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal isOpen={Boolean(regime)} onOpenChange={onClose}>
      <ModalContent>
        <ModalHeader>Editar regime de prazo</ModalHeader>
        <ModalBody className="space-y-3">
          <Input isRequired label="Nome" value={nome} onValueChange={setNome} />

          <Select
            label="Tipo"
            selectedKeys={selectedTipoKeys}
            onSelectionChange={(keys) => {
              const [value] = Array.from(keys) as string[];
              setTipo((value as RegimePrazoPayload["tipo"]) || "JUSTICA_COMUM");
            }}
          >
            {TIPO_OPTIONS.map((option) => (
              <SelectItem key={option.key} textValue={option.label}>
                {option.label}
              </SelectItem>
            ))}
          </Select>

          <Switch
            isSelected={contarDiasUteis}
            onValueChange={setContarDiasUteis}
          >
            Contar apenas dias úteis
          </Switch>

          <Textarea
            label="Descrição"
            value={descricao}
            onValueChange={setDescricao}
          />
        </ModalBody>
        <ModalFooter>
          <Button isDisabled={isSaving} variant="light" onPress={onClose}>
            Cancelar
          </Button>
          <Button color="primary" isLoading={isSaving} onPress={handleConfirm}>
            Salvar alterações
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
