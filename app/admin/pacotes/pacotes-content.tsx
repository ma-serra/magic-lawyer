"use client";

import type { JuizSerializado } from "@/app/actions/juizes";

import { useMemo, useState } from "react";
import useSWR from "swr";
import NextLink from "next/link";
import { Button } from "@heroui/button";
import { Chip, Input, Spinner, Textarea } from "@heroui/react";
import { Divider } from "@heroui/divider";
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from "@heroui/modal";
import { Switch } from "@heroui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from "@heroui/table";
import {
  BadgeDollarSign,
  Building2,
  CreditCard,
  Edit3,
  Plus,
  Trash2,
  Crown,
  Gem,
  Layers3,
  Scale,
  ShieldAlert,
  Sparkles,
  Users,
} from "lucide-react";

import {
  getAssinaturas,
  getEstatisticasPlanos,
  getPlanos,
} from "@/app/actions/planos";
import {
  getEstatisticasPacotesJuiz,
  getAssinaturasPacotesJuizRecentesAdmin,
  getPacoteJuizById,
  getPacotesJuiz,
  createPacoteJuiz,
  updatePacoteJuiz,
  deletePacoteJuiz,
  adicionarJuizAoPacote,
  removerJuizDoPacote,
  type PacoteJuiz,
  type RecentPacoteSubscriptionAdminItem,
} from "@/app/actions/pacotesJuiz";
import { getJuizesAdmin } from "@/app/actions/juizes";
import { SearchableSelect, type SearchableSelectOption } from "@/components/searchable-select";
import {
  PeopleEmptyState,
  PeopleMetricCard,
  PeoplePageHeader,
  PeoplePanel,
} from "@/components/people-ui";
import { toast } from "@/lib/toast";

type PlanoCatalogItem = {
  id: string;
  nome: string;
  descricao?: string | null;
  valorMensal?: number | null;
  valorAnual?: number | null;
  moeda: string;
  limiteUsuarios?: number | null;
  limiteProcessos?: number | null;
  ativo: boolean;
};

type PlanoStats = {
  totalPlanos: number;
  planosAtivos: number;
  totalAssinaturas: number;
  assinaturasAtivas: number;
  faturamentoMensal: number;
};

type PacoteStats = {
  totalPacotes: number;
  pacotesAtivos: number;
  totalAssinaturas: number;
  assinaturasAtivas: number;
  faturamentoMensal: number;
};

type AssinaturaResumo = {
  id: string;
  status: string;
  tenant: {
    id: string;
    name: string;
    slug: string;
  };
  plano: {
    id: string;
    nome: string;
    valorMensal?: number | null;
    valorAnual?: number | null;
  } | null;
  renovaEm?: string | Date | null;
  trialEndsAt?: string | Date | null;
  createdAt: string | Date;
};

type PacoteFormState = {
  nome: string;
  descricao: string;
  preco: string;
  duracaoDias: string;
  status: "ATIVO" | "INATIVO" | "PROMOCIONAL";
  ordemExibicao: string;
  cor: string;
  icone: string;
  isPublico: boolean;
};

const INITIAL_PACOTE_FORM: PacoteFormState = {
  nome: "",
  descricao: "",
  preco: "",
  duracaoDias: "",
  status: "ATIVO",
  ordemExibicao: "0",
  cor: "primary",
  icone: "",
  isPublico: true,
};

function formatCurrency(value: number | null | undefined, currency = "BRL") {
  if (value == null) return "Sob consulta";

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "Nao definido";
  return new Date(value).toLocaleDateString("pt-BR");
}

function getStatusColor(status: string) {
  switch (status) {
    case "ATIVA":
    case "ATIVO":
      return "success" as const;
    case "TRIAL":
    case "PROMOCIONAL":
      return "primary" as const;
    case "INATIVO":
    case "SUSPENSA":
      return "warning" as const;
    case "INADIMPLENTE":
    case "CANCELADA":
      return "danger" as const;
    default:
      return "default" as const;
  }
}

function LoadingBlock({ label }: { label: string }) {
  return (
    <div className="flex min-h-56 items-center justify-center">
      <Spinner label={label} />
    </div>
  );
}

function parseNumberInput(value: string) {
  const normalized = value.replace(",", ".").trim();
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseIntegerInput(value: string) {
  const normalized = value.trim();
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : undefined;
}

export function PacotesContent() {
  const {
    data: planosResponse,
    error: planosError,
    isLoading: loadingPlanos,
  } = useSWR("admin-planos-catalogo", getPlanos, { revalidateOnFocus: true });
  const {
    data: pacotesResponse,
    error: pacotesError,
    isLoading: loadingPacotes,
    mutate: mutatePacotes,
  } = useSWR("admin-pacotes-juiz-catalogo", getPacotesJuiz, {
    revalidateOnFocus: true,
  });
  const {
    data: statsResponse,
    error: statsError,
    isLoading: loadingStats,
  } = useSWR("admin-planos-estatisticas", getEstatisticasPlanos, {
    revalidateOnFocus: true,
  });
  const {
    data: statsPacotesResponse,
    error: statsPacotesError,
    isLoading: loadingStatsPacotes,
    mutate: mutatePacoteStats,
  } = useSWR("admin-pacotes-estatisticas", getEstatisticasPacotesJuiz, {
    revalidateOnFocus: true,
  });
  const {
    data: assinaturasResponse,
    error: assinaturasError,
    isLoading: loadingAssinaturas,
  } = useSWR("admin-assinaturas-planos", getAssinaturas, {
    revalidateOnFocus: true,
  });

  const {
    data: juizesPremiumResponse,
    error: juizesError,
    isLoading: loadingJuizes,
    mutate: mutateJuizesPremium,
  } = useSWR(
    ["admin-juizes-premium", { isPremium: true }],
    ([, filters]) => getJuizesAdmin(filters),
    {
      revalidateOnFocus: true,
    },
  );
  const {
    data: recentPacoteSubscriptionsResponse,
    error: recentPacoteSubscriptionsError,
    isLoading: loadingRecentPacoteSubscriptions,
    mutate: mutateRecentPacoteSubscriptions,
  } = useSWR(
    "admin-pacotes-assinaturas-recentes",
    getAssinaturasPacotesJuizRecentesAdmin,
    {
      revalidateOnFocus: true,
    },
  );

  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isSavingPacote, setIsSavingPacote] = useState(false);
  const [isDeletingPacote, setIsDeletingPacote] = useState<string | null>(null);
  const [selectedJuizToAdd, setSelectedJuizToAdd] = useState<string | null>(null);
  const [editingPacoteId, setEditingPacoteId] = useState<string | null>(null);
  const [loadedJudgeIds, setLoadedJudgeIds] = useState<string[]>([]);
  const [selectedJudgeIds, setSelectedJudgeIds] = useState<string[]>([]);
  const [pacoteForm, setPacoteForm] =
    useState<PacoteFormState>(INITIAL_PACOTE_FORM);

  const planos: PlanoCatalogItem[] = planosResponse?.data ?? [];
  const pacotesJuiz: PacoteJuiz[] = pacotesResponse?.data ?? [];
  const assinaturas: AssinaturaResumo[] = assinaturasResponse?.data ?? [];
  const juizesPremium: JuizSerializado[] = juizesPremiumResponse?.data ?? [];
  const recentPacoteSubscriptions: RecentPacoteSubscriptionAdminItem[] =
    recentPacoteSubscriptionsResponse?.data ?? [];

  const pacoteStatusOptions: SearchableSelectOption[] = [
    {
      key: "ATIVO",
      label: "Ativo",
      description: "Disponível para venda imediata no tenant.",
    },
    {
      key: "PROMOCIONAL",
      label: "Promocional",
      description: "Ativo no catálogo com apelo comercial de campanha.",
    },
    {
      key: "INATIVO",
      label: "Inativo",
      description: "Fora de venda e preservado apenas para histórico.",
    },
  ];

  const pacoteColorOptions: SearchableSelectOption[] = [
    { key: "primary", label: "Azul" },
    { key: "secondary", label: "Grafite" },
    { key: "success", label: "Verde" },
    { key: "warning", label: "Âmbar" },
    { key: "danger", label: "Vermelho" },
  ];

  const availableJudgeOptions = useMemo(
    () =>
      juizesPremium
        .filter((juiz) => !selectedJudgeIds.includes(juiz.id))
        .map(
          (juiz) =>
            ({
              key: juiz.id,
              label: juiz.nome,
              textValue: [juiz.nome, juiz.comarca, juiz.vara]
                .filter(Boolean)
                .join(" "),
              description:
                [juiz.tipoAutoridade, juiz.comarca, juiz.vara]
                  .filter(Boolean)
                  .join(" · ") || "Sem detalhamento",
            }) satisfies SearchableSelectOption,
        ),
    [juizesPremium, selectedJudgeIds],
  );

  const selectedJudgeCards = useMemo(
    () =>
      selectedJudgeIds
        .map((judgeId) => juizesPremium.find((juiz) => juiz.id === judgeId))
        .filter(Boolean) as JuizSerializado[],
    [juizesPremium, selectedJudgeIds],
  );

  const planoStats: PlanoStats = statsResponse?.data ?? {
    totalPlanos: 0,
    planosAtivos: 0,
    totalAssinaturas: 0,
    assinaturasAtivas: 0,
    faturamentoMensal: 0,
  };

  const pacoteStats: PacoteStats = statsPacotesResponse?.data ?? {
    totalPacotes: 0,
    pacotesAtivos: 0,
    totalAssinaturas: 0,
    assinaturasAtivas: 0,
    faturamentoMensal: 0,
  };

  const totalRevenue =
    planoStats.faturamentoMensal + pacoteStats.faturamentoMensal;
  const activeOffers = planoStats.planosAtivos + pacoteStats.pacotesAtivos;
  const activeSubscriptions =
    planoStats.assinaturasAtivas + pacoteStats.assinaturasAtivas;
  const inactiveOffers =
    planoStats.totalPlanos -
    planoStats.planosAtivos +
    (pacoteStats.totalPacotes - pacoteStats.pacotesAtivos);
  const premiumCoverage = pacotesJuiz.reduce(
    (acc, pacote) => acc + (pacote._count?.juizes ?? 0),
    0,
  );

  const errors = [
    planosError,
    pacotesError,
    statsError,
    statsPacotesError,
    assinaturasError,
    juizesError,
    recentPacoteSubscriptionsError,
  ].filter(Boolean) as Error[];

  const resetPacoteEditor = () => {
    setEditingPacoteId(null);
    setLoadedJudgeIds([]);
    setSelectedJudgeIds([]);
    setSelectedJuizToAdd(null);
    setPacoteForm(INITIAL_PACOTE_FORM);
  };

  const handleOpenCreatePacote = () => {
    resetPacoteEditor();
    setIsEditorOpen(true);
  };

  const handleOpenEditPacote = async (pacoteId: string) => {
    resetPacoteEditor();
    setEditingPacoteId(pacoteId);
    setIsEditorOpen(true);

    try {
      const result = await getPacoteJuizById(pacoteId);

      if (!result.success || !result.data) {
        toast.error(result.error || "Não foi possível carregar o pacote");
        setIsEditorOpen(false);
        return;
      }

      setPacoteForm({
        nome: result.data.nome,
        descricao: result.data.descricao || "",
        preco: String(result.data.preco),
        duracaoDias: result.data.duracaoDias ? String(result.data.duracaoDias) : "",
        status: result.data.status,
        ordemExibicao: String(result.data.ordemExibicao ?? 0),
        cor: result.data.cor || "primary",
        icone: result.data.icone || "",
        isPublico: result.data.isPublico,
      });

      const judgeIds = result.data.juizes.map((item) => item.juizId);
      setLoadedJudgeIds(judgeIds);
      setSelectedJudgeIds(judgeIds);
    } catch (error) {
      toast.error("Erro ao carregar pacote para edição");
      setIsEditorOpen(false);
    }
  };

  const handleAddSelectedJudge = () => {
    if (!selectedJuizToAdd || selectedJudgeIds.includes(selectedJuizToAdd)) {
      return;
    }

    setSelectedJudgeIds((current) => [...current, selectedJuizToAdd]);
    setSelectedJuizToAdd(null);
  };

  const handleRemoveSelectedJudge = (judgeId: string) => {
    setSelectedJudgeIds((current) => current.filter((id) => id !== judgeId));
  };

  const handlePersistPacote = async () => {
    if (!pacoteForm.nome.trim()) {
      toast.error("Informe um nome para o pacote");
      return;
    }

    const preco = parseNumberInput(pacoteForm.preco);
    if (!preco || preco <= 0) {
      toast.error("Informe um preço válido");
      return;
    }

    if (selectedJudgeIds.length === 0) {
      toast.error("Adicione pelo menos uma autoridade ao pacote");
      return;
    }

    setIsSavingPacote(true);

    try {
      const payload = {
        nome: pacoteForm.nome.trim(),
        descricao: pacoteForm.descricao.trim() || undefined,
        preco,
        duracaoDias: parseIntegerInput(pacoteForm.duracaoDias),
        status: pacoteForm.status,
        ordemExibicao: parseIntegerInput(pacoteForm.ordemExibicao) ?? 0,
        cor: pacoteForm.cor,
        icone: pacoteForm.icone.trim() || undefined,
        isPublico: pacoteForm.isPublico,
      };

      const mutationResult = editingPacoteId
        ? await updatePacoteJuiz(editingPacoteId, payload)
        : await createPacoteJuiz(payload);

      if (!mutationResult.success || !mutationResult.data) {
        toast.error(mutationResult.error || "Não foi possível salvar o pacote");
        return;
      }

      const pacoteId = mutationResult.data.id;
      const originalIds = new Set(loadedJudgeIds);
      const nextIds = new Set(selectedJudgeIds);

      const toAdd = selectedJudgeIds.filter((judgeId) => !originalIds.has(judgeId));
      const toRemove = loadedJudgeIds.filter((judgeId) => !nextIds.has(judgeId));

      await Promise.all(
        toAdd.map((judgeId, index) =>
          adicionarJuizAoPacote(pacoteId, judgeId, index),
        ),
      );
      await Promise.all(
        toRemove.map((judgeId) => removerJuizDoPacote(pacoteId, judgeId)),
      );

      toast.success(
        editingPacoteId
          ? "Pacote atualizado com sucesso."
          : "Pacote criado com sucesso.",
      );

      setIsEditorOpen(false);
      resetPacoteEditor();
      mutatePacotes();
      mutatePacoteStats();
      mutateRecentPacoteSubscriptions();
      mutateJuizesPremium();
    } catch (error) {
      toast.error("Erro ao salvar pacote");
    } finally {
      setIsSavingPacote(false);
    }
  };

  const handleDeletePacote = async (pacoteId: string) => {
    if (!window.confirm("Deseja excluir este pacote do catálogo?")) {
      return;
    }

    setIsDeletingPacote(pacoteId);

    try {
      const result = await deletePacoteJuiz(pacoteId);

      if (!result.success) {
        toast.error(result.error || "Não foi possível excluir o pacote");
        return;
      }

      toast.success("Pacote removido do catálogo.");
      mutatePacotes();
      mutatePacoteStats();
      mutateRecentPacoteSubscriptions();
    } catch (error) {
      toast.error("Erro ao excluir pacote");
    } finally {
      setIsDeletingPacote(null);
    }
  };

  return (
    <section className="space-y-6">
      <PeoplePageHeader
        tag="Administração"
        title="Monetização e pacotes premium"
        description="Comando comercial para catálogo de planos, pacotes premium de autoridades e leitura de adesão da base pagante."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              color="secondary"
              radius="full"
              size="sm"
              startContent={<Plus className="h-4 w-4" />}
              onPress={handleOpenCreatePacote}
            >
              Novo pacote
            </Button>
            <Button
              as={NextLink}
              color="primary"
              href="/admin/planos"
              radius="full"
              size="sm"
            >
              Planos e modulos
            </Button>
            <Button
              as={NextLink}
              href="/admin/juizes"
              radius="full"
              size="sm"
              variant="bordered"
            >
              Autoridades premium
            </Button>
          </div>
        }
      />

      {errors.length > 0 ? (
        <PeoplePanel
          title="Falha parcial no painel"
          description="Algumas fontes não responderam. Os blocos abaixo continuam exibindo o que foi possível carregar."
        >
          <div className="space-y-2 rounded-2xl border border-danger/30 bg-danger/5 p-4">
            {errors.map((error, index) => (
              <div
                key={`${error.message}-${index}`}
                className="text-sm text-danger"
              >
                {error.message}
              </div>
            ))}
          </div>
        </PeoplePanel>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <PeopleMetricCard
          label="Receita mensal total"
          value={
            loadingStats || loadingStatsPacotes
              ? "..."
              : formatCurrency(totalRevenue)
          }
          helper="Planos SaaS + pacotes premium"
          icon={<BadgeDollarSign className="h-4 w-4" />}
          tone="success"
        />
        <PeopleMetricCard
          label="Ofertas ativas"
          value={loadingStats || loadingStatsPacotes ? "..." : activeOffers}
          helper="Produtos atualmente vendáveis"
          icon={<Layers3 className="h-4 w-4" />}
          tone="primary"
        />
        <PeopleMetricCard
          label="Assinaturas ativas"
          value={
            loadingStats || loadingStatsPacotes ? "..." : activeSubscriptions
          }
          helper="Clientes pagando no catálogo atual"
          icon={<Building2 className="h-4 w-4" />}
          tone="secondary"
        />
        <PeopleMetricCard
          label="Autoridades premium"
          value={loadingJuizes ? "..." : juizesPremium.length}
          helper="Base monetizável de autoridades"
          icon={<Crown className="h-4 w-4" />}
          tone="warning"
        />
        <PeopleMetricCard
          label="Cobertura premium"
          value={loadingPacotes ? "..." : premiumCoverage}
          helper="Vínculos de autoridades em pacotes"
          icon={<Gem className="h-4 w-4" />}
          tone="primary"
        />
      </div>

      <PeoplePanel
        title="Pulso comercial"
        description="Leitura rápida do mix de monetização e das oportunidades abertas no catálogo atual."
      >
        <div className="grid gap-3 xl:grid-cols-4">
          <div className="rounded-2xl ml-admin-surface-soft p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-default-500">
              Receita de planos
            </p>
            <p className="mt-2 text-2xl font-semibold text-foreground">
              {formatCurrency(planoStats.faturamentoMensal)}
            </p>
            <p className="mt-1 text-xs text-default-400">
              Base principal do SaaS.
            </p>
          </div>
          <div className="rounded-2xl ml-admin-surface-soft p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-default-500">
              Receita premium
            </p>
            <p className="mt-2 text-2xl font-semibold text-foreground">
              {formatCurrency(pacoteStats.faturamentoMensal)}
            </p>
            <p className="mt-1 text-xs text-default-400">
              Camada incremental de ticket.
            </p>
          </div>
          <div className="rounded-2xl ml-admin-surface-soft p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-default-500">
              Ofertas inativas
            </p>
            <p className="mt-2 text-2xl font-semibold text-warning">
              {inactiveOffers}
            </p>
            <p className="mt-1 text-xs text-default-400">
              Catálogo parado e sem gerar caixa.
            </p>
          </div>
          <div className="rounded-2xl ml-admin-surface-soft p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-default-500">
              Oportunidade premium
            </p>
            <p className="mt-2 text-2xl font-semibold text-foreground">
              {Math.max(juizesPremium.length - premiumCoverage, 0)}
            </p>
            <p className="mt-1 text-xs text-default-400">
              Autoridades premium ainda sem cobertura comercial direta.
            </p>
          </div>
        </div>
      </PeoplePanel>

      <PeoplePanel
        title="Governança do catálogo premium"
        description="Monte o pacote, escolha se ele vai para a loja do tenant e controle rapidamente a composição de autoridades."
        actions={
          <Button
            color="primary"
            radius="full"
            size="sm"
            startContent={<Plus className="h-4 w-4" />}
            onPress={handleOpenCreatePacote}
          >
            Criar pacote
          </Button>
        }
      >
        <div className="grid gap-3 xl:grid-cols-3">
          <div className="rounded-2xl ml-admin-surface-soft p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-default-500">
              Regra comercial
            </p>
            <p className="mt-2 text-sm text-default-400">
              O pacote só entra na loja do tenant quando estiver marcado como público e com status ativo ou promocional.
            </p>
          </div>
          <div className="rounded-2xl ml-admin-surface-soft p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-default-500">
              Escopo vendido
            </p>
            <p className="mt-2 text-sm text-default-400">
              A compra libera acesso por escritório às autoridades vinculadas ao pacote, com ativação automática após confirmação da cobrança.
            </p>
          </div>
          <div className="rounded-2xl ml-admin-surface-soft p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-default-500">
              Controle de operação
            </p>
            <p className="mt-2 text-sm text-default-400">
              Pacotes inativos saem da vitrine. Pacotes pagos continuam visíveis no histórico do tenant e no cockpit comercial abaixo.
            </p>
          </div>
        </div>
      </PeoplePanel>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <PeoplePanel
          title="Catálogo de planos"
          description="Planos principais do SaaS com preço, limites e status comercial."
          actions={
            <Button
              as={NextLink}
              href="/admin/planos"
              radius="full"
              size="sm"
              variant="flat"
            >
              Abrir gestão completa
            </Button>
          }
        >
          {loadingPlanos && !planosResponse ? (
            <LoadingBlock label="Carregando planos..." />
          ) : planos.length > 0 ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {planos.map((plano) => (
                <div
                  key={plano.id}
                  className="rounded-3xl border border-default-200/80 bg-content1/85 p-5 shadow-sm shadow-black/5 dark:border-white/10 dark:bg-background/30 dark:shadow-black/20"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold text-foreground">
                        {plano.nome}
                      </p>
                      <p className="mt-1 text-sm text-default-400">
                        {plano.descricao || "Sem copy comercial definida."}
                      </p>
                    </div>
                    <Chip
                      color={plano.ativo ? "success" : "default"}
                      size="sm"
                      variant="flat"
                    >
                      {plano.ativo ? "Ativo" : "Inativo"}
                    </Chip>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-default-200/80 bg-default-100/60 p-3 dark:border-white/10 dark:bg-white/[0.03]">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-default-500">
                        Mensal
                      </p>
                      <p className="mt-2 text-base font-semibold text-foreground">
                        {formatCurrency(plano.valorMensal, plano.moeda)}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-default-200/80 bg-default-100/60 p-3 dark:border-white/10 dark:bg-white/[0.03]">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-default-500">
                        Anual
                      </p>
                      <p className="mt-2 text-base font-semibold text-foreground">
                        {formatCurrency(plano.valorAnual, plano.moeda)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2 text-xs text-default-400">
                    <Chip size="sm" variant="bordered">
                      Usuarios: {plano.limiteUsuarios ?? "Livre"}
                    </Chip>
                    <Chip size="sm" variant="bordered">
                      Processos: {plano.limiteProcessos ?? "Livre"}
                    </Chip>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <PeopleEmptyState
              title="Nenhum plano cadastrado"
              description="Sem planos ativos não existe catálogo comercial de entrada para o SaaS."
              icon={<Layers3 className="h-6 w-6" />}
              action={
                <Button
                  as={NextLink}
                  color="primary"
                  href="/admin/planos"
                  radius="full"
                  size="sm"
                >
                  Ir para planos
                </Button>
              }
            />
          )}
        </PeoplePanel>

        <PeoplePanel
          title="Pacotes premium de autoridades"
          description="Ofertas adicionais de alta margem para monetizar autoridades estratégicas."
          actions={
            <Button
              as={NextLink}
              href="/admin/juizes"
              radius="full"
              size="sm"
              variant="flat"
            >
              Gerir autoridades premium
            </Button>
          }
        >
          {loadingPacotes && !pacotesResponse ? (
            <LoadingBlock label="Carregando pacotes premium..." />
          ) : pacotesJuiz.length > 0 ? (
            <div className="space-y-3">
              {pacotesJuiz.map((pacote) => (
                <div
                  key={pacote.id}
                  data-testid="admin-pacote-card"
                  className="rounded-3xl ml-admin-surface-soft p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold text-foreground">
                        {pacote.nome}
                      </p>
                      <p className="mt-1 text-sm text-default-400">
                        {pacote.descricao ||
                          "Sem descrição comercial definida."}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Chip
                        color={getStatusColor(pacote.status)}
                        size="sm"
                        variant="flat"
                      >
                        {pacote.status}
                      </Chip>
                      <div className="flex gap-2">
                        <Button
                          isIconOnly
                          radius="full"
                          size="sm"
                          variant="light"
                          onPress={() => handleOpenEditPacote(pacote.id)}
                        >
                          <Edit3 className="h-4 w-4" />
                        </Button>
                        <Button
                          isIconOnly
                          color="danger"
                          isLoading={isDeletingPacote === pacote.id}
                          radius="full"
                          size="sm"
                          variant="light"
                          onPress={() => handleDeletePacote(pacote.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-default-500">
                        Preco
                      </p>
                      <p className="mt-2 text-base font-semibold text-foreground">
                        {formatCurrency(pacote.preco, pacote.moeda)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-default-500">
                        Cobertura
                      </p>
                      <p className="mt-2 text-base font-semibold text-foreground">
                        {pacote._count?.juizes ?? 0} autoridade(s) ·{" "}
                        {pacote._count?.assinaturas ?? 0} assinatura(s)
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2 text-xs text-default-400">
                    <Chip size="sm" variant="bordered">
                      Loja: {pacote.isPublico ? "Público" : "Interno"}
                    </Chip>
                    <Chip size="sm" variant="bordered">
                      Vigência:{" "}
                      {pacote.duracaoDias
                        ? `${pacote.duracaoDias} dias`
                        : "Permanente"}
                    </Chip>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <PeopleEmptyState
              title="Nenhum pacote premium configurado"
              description="A camada de monetização premium ainda não foi colocada no mercado."
              icon={<Sparkles className="h-6 w-6" />}
            />
          )}
        </PeoplePanel>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <PeoplePanel
          title="Assinaturas recentes"
          description="Últimas contas que entraram em planos da plataforma."
        >
          {loadingAssinaturas && !assinaturasResponse ? (
            <LoadingBlock label="Carregando assinaturas..." />
          ) : assinaturas.length > 0 ? (
            <Table removeWrapper aria-label="Assinaturas recentes de planos">
              <TableHeader>
                <TableColumn>Tenant</TableColumn>
                <TableColumn>Plano</TableColumn>
                <TableColumn>Status</TableColumn>
                <TableColumn>Criada em</TableColumn>
                <TableColumn>Renovacao / trial</TableColumn>
              </TableHeader>
              <TableBody>
                {assinaturas.slice(0, 8).map((assinatura) => (
                  <TableRow key={assinatura.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-foreground">
                          {assinatura.tenant.name}
                        </p>
                        <p className="text-xs text-default-500">
                          {assinatura.tenant.slug}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      {assinatura.plano?.nome ?? "Sem plano"}
                    </TableCell>
                    <TableCell>
                      <Chip
                        color={getStatusColor(assinatura.status)}
                        size="sm"
                        variant="flat"
                      >
                        {assinatura.status}
                      </Chip>
                    </TableCell>
                    <TableCell>{formatDate(assinatura.createdAt)}</TableCell>
                    <TableCell>
                      {formatDate(
                        assinatura.renovaEm ?? assinatura.trialEndsAt,
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <PeopleEmptyState
              title="Nenhuma assinatura registrada"
              description="Quando os tenants começarem a contratar planos, o fluxo recente aparecerá aqui."
              icon={<Building2 className="h-6 w-6" />}
            />
          )}
        </PeoplePanel>

        <PeoplePanel
          title="Autoridades premium prontas para venda"
          description="Base premium que ainda pode virar pacote, upsell ou combinação comercial específica."
        >
          {loadingJuizes && !juizesPremiumResponse ? (
            <LoadingBlock label="Carregando base premium..." />
          ) : juizesPremium.length > 0 ? (
            <div className="space-y-3">
              {juizesPremium.slice(0, 6).map((juiz) => (
                <div
                  key={juiz.id}
                  className="rounded-2xl ml-admin-surface-soft p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {juiz.nome}
                      </p>
                      <p className="mt-1 text-xs text-default-400">
                        {[juiz.comarca, juiz.vara]
                          .filter(Boolean)
                          .join(" · ") || "Sem comarca/vara definida"}
                      </p>
                    </div>
                    <Chip color="warning" size="sm" variant="flat">
                      Premium
                    </Chip>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(juiz.especialidades ?? [])
                      .slice(0, 3)
                      .map((especialidade) => (
                        <Chip key={especialidade} size="sm" variant="bordered">
                          {especialidade}
                        </Chip>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <PeopleEmptyState
              title="Sem autoridades premium catalogadas"
              description="Quando a base de autoridades premium crescer, esta área vira um radar claro de upsell."
              icon={<Scale className="h-6 w-6" />}
            />
          )}
        </PeoplePanel>
      </div>

      <PeoplePanel
        title="Pacotes vendidos recentemente"
        description="Últimas compras ou ativações de pacotes premium pelos escritórios."
      >
        {loadingRecentPacoteSubscriptions && !recentPacoteSubscriptionsResponse ? (
          <LoadingBlock label="Carregando vendas recentes..." />
        ) : recentPacoteSubscriptions.length > 0 ? (
          <Table removeWrapper aria-label="Pacotes vendidos recentemente">
            <TableHeader>
              <TableColumn>Tenant</TableColumn>
              <TableColumn>Pacote</TableColumn>
              <TableColumn>Status</TableColumn>
              <TableColumn>Preço</TableColumn>
              <TableColumn>Forma</TableColumn>
              <TableColumn>Criada em</TableColumn>
            </TableHeader>
            <TableBody>
              {recentPacoteSubscriptions.map((assinatura) => (
                <TableRow
                  key={assinatura.id}
                  data-testid="admin-pacote-subscription-row"
                >
                  <TableCell>
                    <div>
                      <p className="font-medium text-foreground">
                        {assinatura.tenant.name}
                      </p>
                      <p className="text-xs text-default-500">
                        {assinatura.tenant.slug}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>{assinatura.pacote.nome}</TableCell>
                  <TableCell>
                    <Chip
                      color={getStatusColor(assinatura.status)}
                      size="sm"
                      variant="flat"
                    >
                      {assinatura.status}
                    </Chip>
                  </TableCell>
                  <TableCell>{formatCurrency(assinatura.precoPago)}</TableCell>
                  <TableCell>{assinatura.formaPagamento || "N/D"}</TableCell>
                  <TableCell>{formatDate(assinatura.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <PeopleEmptyState
            title="Nenhuma venda registrada ainda"
            description="Assim que um escritório comprar um pacote premium, ele aparecerá aqui com preço e status."
            icon={<CreditCard className="h-6 w-6" />}
          />
        )}
      </PeoplePanel>

      <PeoplePanel
        title="Leitura estratégica"
        description="Próximas decisões para melhorar receita, catálogo e monetização premium."
      >
        <div className="grid gap-3 xl:grid-cols-3">
          <div className="rounded-2xl ml-admin-surface-soft p-4">
            <div className="mb-2 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold text-foreground">
                Catálogo vivo
              </p>
            </div>
            <p className="text-sm text-default-400">
              {activeOffers > 0
                ? `${activeOffers} oferta(s) estão ativas e prontas para venda.`
                : "Sem ofertas ativas, a frente comercial fica travada."}
            </p>
          </div>
          <div className="rounded-2xl ml-admin-surface-soft p-4">
            <div className="mb-2 flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-warning" />
              <p className="text-sm font-semibold text-foreground">
                Catálogo parado
              </p>
            </div>
            <p className="text-sm text-default-400">
              {inactiveOffers > 0
                ? `${inactiveOffers} oferta(s) seguem inativas e não contribuem para a receita.`
                : "Não há ofertas inativas atrapalhando o catálogo atual."}
            </p>
          </div>
          <div className="rounded-2xl ml-admin-surface-soft p-4">
            <div className="mb-2 flex items-center gap-2">
              <Users className="h-4 w-4 text-success" />
              <p className="text-sm font-semibold text-foreground">
                Espaço de expansão
              </p>
            </div>
            <p className="text-sm text-default-400">
              {Math.max(juizesPremium.length - premiumCoverage, 0) > 0
                ? "Ainda existe espaço claro para converter a base premium em novas ofertas ou bundles."
                : "A cobertura premium já está alta; o foco agora pode ser ticket e retenção."}
            </p>
          </div>
        </div>
      </PeoplePanel>

      <Modal
        isOpen={isEditorOpen}
        scrollBehavior="inside"
        size="4xl"
        onOpenChange={(open) => {
          setIsEditorOpen(open);
          if (!open) {
            resetPacoteEditor();
          }
        }}
      >
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1">
            <p className="text-base font-semibold">
              {editingPacoteId ? "Editar pacote premium" : "Novo pacote premium"}
            </p>
            <p className="text-sm text-default-500">
              Monte a oferta, defina a visibilidade na loja e vincule as autoridades que compõem o pacote.
            </p>
          </ModalHeader>
          <ModalBody className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <Input
                label="Nome do pacote"
                value={pacoteForm.nome}
                onValueChange={(value) =>
                  setPacoteForm((current) => ({ ...current, nome: value }))
                }
              />
              <Input
                label="Preço"
                placeholder="199.90"
                value={pacoteForm.preco}
                onValueChange={(value) =>
                  setPacoteForm((current) => ({ ...current, preco: value }))
                }
              />
            </div>

            <Textarea
              label="Descrição comercial"
              minRows={3}
              value={pacoteForm.descricao}
              onValueChange={(value) =>
                setPacoteForm((current) => ({ ...current, descricao: value }))
              }
            />

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Input
                label="Vigência em dias"
                placeholder="Vazio = permanente"
                value={pacoteForm.duracaoDias}
                onValueChange={(value) =>
                  setPacoteForm((current) => ({
                    ...current,
                    duracaoDias: value,
                  }))
                }
              />
              <Input
                label="Ordem"
                value={pacoteForm.ordemExibicao}
                onValueChange={(value) =>
                  setPacoteForm((current) => ({
                    ...current,
                    ordemExibicao: value,
                  }))
                }
              />
              <Input
                label="Ícone"
                placeholder="⚖️"
                value={pacoteForm.icone}
                onValueChange={(value) =>
                  setPacoteForm((current) => ({ ...current, icone: value }))
                }
              />
              <SearchableSelect
                items={pacoteColorOptions}
                label="Cor"
                selectedKey={pacoteForm.cor}
                onSelectionChange={(key) =>
                  setPacoteForm((current) => ({
                    ...current,
                    cor: key || "primary",
                  }))
                }
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <SearchableSelect
                items={pacoteStatusOptions}
                label="Status comercial"
                selectedKey={pacoteForm.status}
                onSelectionChange={(key) =>
                  setPacoteForm((current) => ({
                    ...current,
                    status: (key as PacoteFormState["status"]) || "ATIVO",
                  }))
                }
              />
              <div className="rounded-2xl ml-admin-surface-muted p-4">
                <Switch
                  isSelected={pacoteForm.isPublico}
                  size="sm"
                  onValueChange={(value) =>
                    setPacoteForm((current) => ({
                      ...current,
                      isPublico: value,
                    }))
                  }
                >
                  Disponibilizar na loja do tenant
                </Switch>
                <p className="mt-2 text-xs text-default-500">
                  Quando desligado, o pacote continua no histórico, mas sai da vitrine de compra dos escritórios.
                </p>
              </div>
            </div>

            <Divider className="ml-admin-divider" />

            <div className="space-y-3">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Autoridades do pacote
                </p>
                <p className="mt-1 text-sm text-default-500">
                  Selecione as autoridades premium que o escritório receberá ao comprar esta oferta.
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                <SearchableSelect
                  emptyContent={
                    loadingJuizes
                      ? "Carregando autoridades premium..."
                      : "Nenhuma autoridade encontrada"
                  }
                  items={availableJudgeOptions}
                  isLoading={loadingJuizes}
                  label="Adicionar autoridade"
                  placeholder="Buscar autoridade premium"
                  selectedKey={selectedJuizToAdd}
                  onSelectionChange={setSelectedJuizToAdd}
                />
                <Button
                  className="md:self-end"
                  color="primary"
                  data-testid="pacote-add-autoridade"
                  isDisabled={!selectedJuizToAdd || loadingJuizes}
                  radius="full"
                  variant="flat"
                  onPress={handleAddSelectedJudge}
                >
                  Adicionar
                </Button>
              </div>

              {selectedJudgeCards.length > 0 ? (
                <div className="space-y-2">
                  {selectedJudgeCards.map((juiz) => (
                    <div
                      key={juiz.id}
                      data-testid="pacote-selected-autoridade"
                      className="flex items-center justify-between gap-3 rounded-2xl ml-admin-surface-muted p-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {juiz.nome}
                        </p>
                        <p className="truncate text-xs text-default-500">
                          {[juiz.tipoAutoridade, juiz.comarca, juiz.vara]
                            .filter(Boolean)
                            .join(" · ") || "Sem detalhamento"}
                        </p>
                      </div>
                      <Button
                        isIconOnly
                        color="danger"
                        radius="full"
                        size="sm"
                        variant="light"
                        onPress={() => handleRemoveSelectedJudge(juiz.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-default-200/80 bg-default-100/35 p-4 text-sm text-default-500 dark:border-white/10 dark:bg-background/30">
                  Nenhuma autoridade adicionada ainda.
                </div>
              )}
            </div>
          </ModalBody>
          <ModalFooter>
            <Button
              radius="full"
              variant="light"
              onPress={() => {
                setIsEditorOpen(false);
                resetPacoteEditor();
              }}
            >
              Cancelar
            </Button>
            <Button
              color="primary"
              data-testid="pacote-save"
              isLoading={isSavingPacote}
              radius="full"
              onPress={handlePersistPacote}
            >
              {editingPacoteId ? "Salvar alterações" : "Criar pacote"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </section>
  );
}
