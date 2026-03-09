"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import useSWR from "swr";
import {
  Button,
  Card,
  CardBody,
  Chip,
  Divider,
  Input,
  Skeleton,
  Tooltip,
} from "@heroui/react";
import {
  Activity,
  Boxes,
  CheckCircle2,
  Database,
  FolderTree,
  Layers3,
  Puzzle,
  RefreshCw,
  Route,
  Search,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Workflow,
} from "lucide-react";

import {
  getDashboardModulos,
  getModulo,
  getModuloCatalogDiagnostics,
  listModulos,
  updateModuloGrouping,
  type ModuloCatalogDiagnosticsResponse,
  type ModuloDetailResponse,
} from "@/app/actions/modulos";
import {
  autoDetectModules,
  getAutoDetectStatus,
} from "@/app/actions/auto-detect-modules";
import { forceSyncModuleMap } from "@/app/actions/sync-module-map";
import { getCategoryClasses, getCategoryIcon } from "@/app/lib/category-utils";
import {
  PeopleMetricCard,
  PeoplePageHeader,
  PeoplePanel,
} from "@/components/people-ui";
import { toast } from "@/lib/toast";

type ModulosContentProps = {
  embedded?: boolean;
};

type DashboardData = NonNullable<
  Awaited<ReturnType<typeof getDashboardModulos>>["data"]
>;
type ModuloDetailData = NonNullable<ModuloDetailResponse["data"]>;
type ModuloCatalogDiagnostics = NonNullable<
  ModuloCatalogDiagnosticsResponse["data"]
>;
type AutoDetectStatus = NonNullable<
  Awaited<ReturnType<typeof getAutoDetectStatus>>["data"]
>;

type StatusFilter = "ALL" | "ACTIVE" | "INACTIVE" | "UNGROUPED";
type PendingAction = "detect" | "cache" | "grouping" | null;

async function fetchModulos(search: string) {
  const response = await listModulos({
    search: search.trim() || undefined,
    limit: 200,
  });

  if (!response.success || !response.data) {
    throw new Error(response.error ?? "Não foi possível carregar os módulos");
  }

  return response.data;
}

async function fetchDashboard() {
  const response = await getDashboardModulos();

  if (!response.success || !response.data) {
    throw new Error(response.error ?? "Não foi possível carregar o resumo");
  }

  return response.data as DashboardData;
}

async function fetchDiagnostics() {
  const response = await getModuloCatalogDiagnostics();

  if (!response.success || !response.data) {
    throw new Error(
      response.error ?? "Não foi possível carregar o diagnóstico técnico",
    );
  }

  return response.data as ModuloCatalogDiagnostics;
}

async function fetchAutoDetectStatus() {
  const response = await getAutoDetectStatus();

  if (!response.success || !response.data) {
    throw new Error(
      response.error ?? "Não foi possível carregar o status de detecção",
    );
  }

  return response.data as AutoDetectStatus;
}

async function fetchModuloDetail(moduloId: string) {
  const response = await getModulo(moduloId);

  if (!response.success || !response.data) {
    throw new Error(response.error ?? "Não foi possível carregar o módulo");
  }

  return response.data as ModuloDetailData;
}

function formatDateTime(value?: Date | string | null) {
  if (!value) {
    return "Nunca executado";
  }

  return new Date(value).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function countOpenIssues(diagnostics?: ModuloCatalogDiagnostics) {
  if (!diagnostics) {
    return 0;
  }

  return (
    diagnostics.missingInDatabase.length +
    diagnostics.missingInCode.length +
    diagnostics.routeDiffs.length
  );
}

function emptyToNull(value: string) {
  const normalized = value.trim();

  return normalized.length > 0 ? normalized : null;
}

export function ModulosContent({ embedded = false }: ModulosContentProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [groupingFilter, setGroupingFilter] = useState<string>("ALL");
  const [selectedModuloId, setSelectedModuloId] = useState<string | null>(null);
  const [groupingDraft, setGroupingDraft] = useState("");
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [, startTransition] = useTransition();

  const {
    data: modulosData,
    isLoading: isLoadingModulos,
    mutate: mutateModulos,
  } = useSWR(["admin-modulos", searchTerm], () => fetchModulos(searchTerm), {
    keepPreviousData: true,
    revalidateOnFocus: true,
  });

  const { data: dashboard, mutate: mutateDashboard } = useSWR(
    "admin-modulos-dashboard",
    fetchDashboard,
    {
      revalidateOnFocus: true,
    },
  );

  const {
    data: diagnostics,
    isLoading: isLoadingDiagnostics,
    mutate: mutateDiagnostics,
  } = useSWR("admin-modulos-diagnostics", fetchDiagnostics, {
    revalidateOnFocus: true,
  });

  const { data: autoDetectStatus, mutate: mutateAutoDetectStatus } = useSWR(
    "admin-modulos-auto-detect-status",
    fetchAutoDetectStatus,
    {
      revalidateOnFocus: true,
    },
  );

  const { data: moduloDetail, mutate: mutateModuloDetail } = useSWR(
    selectedModuloId ? ["admin-modulo-detail", selectedModuloId] : null,
    ([, moduloId]) => fetchModuloDetail(moduloId),
    {
      revalidateOnFocus: false,
    },
  );

  const modulos = modulosData?.modulos ?? [];
  const groupingOptions =
    modulosData?.categorias
      ?.filter((categoria) => categoria.totalModulos > 0)
      .sort((left, right) => right.totalModulos - left.totalModulos) ?? [];

  const attentionSlugs = useMemo(() => {
    const slugs = new Set<string>();

    diagnostics?.missingInCode.forEach((item) => slugs.add(item.slug));
    diagnostics?.routeDiffs.forEach((item) => slugs.add(item.slug));

    return slugs;
  }, [diagnostics]);

  const filteredModulos = useMemo(() => {
    return modulos.filter((modulo) => {
      if (statusFilter === "ACTIVE" && !modulo.ativo) {
        return false;
      }

      if (statusFilter === "INACTIVE" && modulo.ativo) {
        return false;
      }

      if (statusFilter === "UNGROUPED" && modulo.categoriaInfo?.nome) {
        return false;
      }

      if (
        groupingFilter !== "ALL" &&
        modulo.categoriaInfo?.nome !== groupingFilter
      ) {
        return false;
      }

      return true;
    });
  }, [groupingFilter, modulos, statusFilter]);

  const selectedModulo = useMemo(() => {
    return (
      filteredModulos.find((modulo) => modulo.id === selectedModuloId) ??
      filteredModulos[0] ??
      null
    );
  }, [filteredModulos, selectedModuloId]);

  const selectedRouteDiff = useMemo(() => {
    if (!selectedModulo || !diagnostics) {
      return null;
    }

    return diagnostics.routeDiffs.find(
      (routeDiff) => routeDiff.slug === selectedModulo.slug,
    );
  }, [diagnostics, selectedModulo]);

  useEffect(() => {
    if (!selectedModuloId && filteredModulos[0]) {
      setSelectedModuloId(filteredModulos[0].id);
      return;
    }

    if (
      selectedModuloId &&
      !filteredModulos.some((modulo) => modulo.id === selectedModuloId)
    ) {
      setSelectedModuloId(filteredModulos[0]?.id ?? null);
    }
  }, [filteredModulos, selectedModuloId]);

  useEffect(() => {
    setGroupingDraft(selectedModulo?.categoriaInfo?.nome ?? "");
  }, [selectedModulo?.categoriaInfo?.nome, selectedModulo?.id]);

  const refreshAll = async () => {
    await Promise.all([
      mutateModulos(),
      mutateDashboard(),
      mutateDiagnostics(),
      mutateAutoDetectStatus(),
      mutateModuloDetail(),
    ]);
  };

  const handleDetectCatalog = () => {
    startTransition(async () => {
      setPendingAction("detect");
      try {
        const result = await autoDetectModules();

        if (!result.success || !result.data) {
          toast.error(
            result.error ?? "Não foi possível sincronizar o catálogo",
          );
          return;
        }

        toast.success(
          `Catálogo atualizado: ${result.data.created} criados, ${result.data.updated} atualizados e ${result.data.removed} removidos.`,
        );
        await refreshAll();
      } catch (error) {
        toast.error("Erro interno ao detectar módulos do código");
      } finally {
        setPendingAction(null);
      }
    });
  };

  const handleRefreshAccessCache = () => {
    startTransition(async () => {
      setPendingAction("cache");
      try {
        const result = await forceSyncModuleMap();

        if (!result.success) {
          toast.error(result.error ?? "Não foi possível recarregar o cache");
          return;
        }

        toast.success("Cache de acesso recarregado com sucesso.");
        await refreshAll();
      } catch (error) {
        toast.error("Erro interno ao recarregar o cache de acesso");
      } finally {
        setPendingAction(null);
      }
    });
  };

  const handleSaveGrouping = () => {
    if (!selectedModulo) {
      return;
    }

    startTransition(async () => {
      setPendingAction("grouping");
      try {
        const result = await updateModuloGrouping(
          selectedModulo.id,
          emptyToNull(groupingDraft),
        );

        if (!result.success) {
          toast.error(result.error ?? "Não foi possível salvar o agrupamento");
          return;
        }

        toast.success(
          result.data?.categoriaNome
            ? `Agrupamento salvo em ${result.data.categoriaNome}.`
            : "Agrupamento removido do módulo.",
        );
        await refreshAll();
      } catch (error) {
        toast.error("Erro interno ao salvar o agrupamento");
      } finally {
        setPendingAction(null);
      }
    });
  };

  const issuesCount = countOpenIssues(diagnostics);

  const headerActions = (
    <>
      <Tooltip content="Escaneia app/(protected), cria o que falta, atualiza o que mudou e remove órfãos sem uso em planos.">
        <Button
          color="primary"
          isLoading={pendingAction === "detect"}
          startContent={<Sparkles className="h-4 w-4" />}
          onPress={handleDetectCatalog}
        >
          Detectar catálogo do código
        </Button>
      </Tooltip>
      <Tooltip content="Limpa os caches de acesso do servidor e do edge. Use quando precisar propagar o catálogo imediatamente.">
        <Button
          isLoading={pendingAction === "cache"}
          startContent={<RefreshCw className="h-4 w-4" />}
          variant="bordered"
          onPress={handleRefreshAccessCache}
        >
          Recarregar cache de acesso
        </Button>
      </Tooltip>
    </>
  );

  return (
    <div className={embedded ? "space-y-6" : "space-y-6 p-6"}>
      {embedded ? (
        <PeoplePanel
          title="Catálogo de módulos"
          description="Catálogo técnico do produto, agrupamentos internos e diagnóstico de sincronização. A composição comercial de cada plano continua na aba de planos."
          actions={headerActions}
        >
          <div className="text-sm text-default-400">
            Ajuste aqui o catálogo oficial de módulos e a organização interna do
            admin. Para colocar um módulo para dentro ou para fora de um plano
            específico, volte para a aba <strong>Planos</strong>.
          </div>
        </PeoplePanel>
      ) : (
        <PeoplePageHeader
          tag="Catálogo técnico"
          title="Gestão de módulos"
          description="Uma única superfície para catálogo, agrupamento visual e sincronização técnica. O acesso do sistema é lido do banco em tempo real com cache controlado, sem telas paralelas para categorias."
          actions={headerActions}
        />
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <PeopleMetricCard
          helper="Total cadastrado no banco"
          icon={<Puzzle className="h-4 w-4" />}
          label="Módulos"
          tone="primary"
          value={dashboard?.total ?? "-"}
        />
        <PeopleMetricCard
          helper="Rotas ativas protegidas por módulo"
          icon={<Route className="h-4 w-4" />}
          label="Rotas"
          tone="success"
          value={dashboard?.totalRotas ?? "-"}
        />
        <PeopleMetricCard
          helper="Agrupamentos realmente em uso"
          icon={<FolderTree className="h-4 w-4" />}
          label="Agrupamentos"
          tone="secondary"
          value={dashboard?.agrupamentosEmUso ?? "-"}
        />
        <PeopleMetricCard
          helper={
            issuesCount === 0
              ? "Código, banco e rotas estão coerentes"
              : "Existem divergências para tratar"
          }
          icon={
            issuesCount === 0 ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <TriangleAlert className="h-4 w-4" />
            )
          }
          label="Pendências"
          tone={issuesCount === 0 ? "success" : "warning"}
          value={issuesCount}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[360px,minmax(0,1fr)]">
        <PeoplePanel
          title="Catálogo"
          description="A lista abaixo já incorpora os agrupamentos. Categoria deixou de ser uma tela separada e virou metadado editável do próprio módulo."
        >
          <div className="space-y-4">
            <Input
              placeholder="Buscar por nome, slug ou descrição"
              startContent={<Search className="h-4 w-4 text-default-400" />}
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />

            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["ALL", "Todos"],
                  ["ACTIVE", "Ativos"],
                  ["INACTIVE", "Inativos"],
                  ["UNGROUPED", "Sem agrupamento"],
                ] as Array<[StatusFilter, string]>
              ).map(([value, label]) => (
                <Button
                  key={value}
                  color={statusFilter === value ? "primary" : "default"}
                  size="sm"
                  variant={statusFilter === value ? "solid" : "flat"}
                  onPress={() => setStatusFilter(value)}
                >
                  {label}
                </Button>
              ))}
            </div>

            {groupingOptions.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-default-500">
                  Agrupamentos em uso
                </p>
                <div className="flex flex-wrap gap-2">
                  <Chip
                    className="cursor-pointer"
                    color={groupingFilter === "ALL" ? "primary" : "default"}
                    variant={groupingFilter === "ALL" ? "solid" : "flat"}
                    onClick={() => setGroupingFilter("ALL")}
                  >
                    Todos
                  </Chip>
                  {groupingOptions.map((grouping) => (
                    <Chip
                      key={grouping.id}
                      className="cursor-pointer"
                      color={
                        groupingFilter === grouping.nome ? "primary" : "default"
                      }
                      variant={
                        groupingFilter === grouping.nome ? "solid" : "flat"
                      }
                      onClick={() => setGroupingFilter(grouping.nome)}
                    >
                      {grouping.nome} • {grouping.totalModulos}
                    </Chip>
                  ))}
                </div>
              </div>
            ) : null}

            <Divider className="border-white/10" />

            <div className="max-h-[54rem] space-y-3 overflow-y-auto pr-1">
              {isLoadingModulos
                ? Array.from({ length: 6 }).map((_, index) => (
                    <Card
                      key={`module-skeleton-${index}`}
                      className="border border-white/10 bg-background/40"
                    >
                      <CardBody className="space-y-3 p-4">
                        <Skeleton
                          className="h-4 w-28 rounded-lg"
                          isLoaded={false}
                        />
                        <Skeleton
                          className="h-4 w-40 rounded-lg"
                          isLoaded={false}
                        />
                        <Skeleton
                          className="h-16 rounded-xl"
                          isLoaded={false}
                        />
                      </CardBody>
                    </Card>
                  ))
                : filteredModulos.map((modulo) => {
                    const CategoryIcon = getCategoryIcon(modulo.categoriaInfo);
                    const categoryClasses = getCategoryClasses(
                      modulo.categoriaInfo,
                    );
                    const hasAttention = attentionSlugs.has(modulo.slug);
                    const isSelected = modulo.id === selectedModulo?.id;

                    return (
                      <button
                        key={modulo.id}
                        type="button"
                        className={`w-full rounded-2xl border text-left transition ${
                          isSelected
                            ? "border-primary/50 bg-primary/10 shadow-lg shadow-primary/10"
                            : "border-white/10 bg-background/40 hover:border-primary/25 hover:bg-background/70"
                        }`}
                        onClick={() => setSelectedModuloId(modulo.id)}
                      >
                        <div className="space-y-3 p-4">
                          <div className="flex items-start gap-3">
                            <span
                              className={`mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl ${categoryClasses.bg}`}
                            >
                              <CategoryIcon
                                className={`h-4 w-4 ${categoryClasses.text}`}
                              />
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="truncate text-sm font-semibold text-foreground">
                                  {modulo.nome}
                                </p>
                                <Chip
                                  color={modulo.ativo ? "success" : "default"}
                                  size="sm"
                                  variant="flat"
                                >
                                  {modulo.ativo ? "Ativo" : "Inativo"}
                                </Chip>
                                {hasAttention ? (
                                  <Chip
                                    color="warning"
                                    size="sm"
                                    variant="flat"
                                  >
                                    Atenção
                                  </Chip>
                                ) : null}
                              </div>
                              <p className="mt-1 text-xs font-medium uppercase tracking-[0.16em] text-default-500">
                                /{modulo.slug}
                              </p>
                              <p className="mt-2 line-clamp-2 text-sm text-default-400">
                                {modulo.descricao ||
                                  "Sem descrição operacional registrada para este módulo."}
                              </p>
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <Chip size="sm" variant="flat">
                              {modulo._count.rotas} rota(s)
                            </Chip>
                            <Chip size="sm" variant="flat">
                              {modulo._count.planos} plano(s)
                            </Chip>
                            <Chip size="sm" variant="bordered">
                              {modulo.categoriaInfo?.nome || "Sem agrupamento"}
                            </Chip>
                          </div>
                        </div>
                      </button>
                    );
                  })}

              {!isLoadingModulos && filteredModulos.length === 0 ? (
                <Card className="border border-dashed border-white/10 bg-background/30">
                  <CardBody className="space-y-2 p-5 text-sm text-default-400">
                    <p className="font-medium text-foreground">
                      Nenhum módulo encontrado com os filtros atuais.
                    </p>
                    <p>
                      Ajuste a busca ou o agrupamento. Se você acabou de criar
                      um módulo no código, execute a detecção do catálogo acima.
                    </p>
                  </CardBody>
                </Card>
              ) : null}
            </div>
          </div>
        </PeoplePanel>

        <PeoplePanel
          title={selectedModulo?.nome ?? "Detalhe do módulo"}
          description={
            selectedModulo
              ? "Slug, agrupamento, rotas protegidas e impacto em planos no mesmo painel."
              : "Selecione um módulo à esquerda para inspecionar ou ajustar o catálogo."
          }
        >
          {selectedModulo ? (
            <div className="space-y-6">
              <Card className="border border-white/10 bg-background/40">
                <CardBody className="space-y-4 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                        <Puzzle className="h-5 w-5" />
                      </span>
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-xl font-semibold text-foreground">
                            {selectedModulo.nome}
                          </h3>
                          <Chip
                            color={selectedModulo.ativo ? "success" : "default"}
                            variant="flat"
                          >
                            {selectedModulo.ativo ? "Ativo" : "Inativo"}
                          </Chip>
                          {attentionSlugs.has(selectedModulo.slug) ? (
                            <Chip color="warning" variant="flat">
                              Requer revisão técnica
                            </Chip>
                          ) : null}
                        </div>
                        <p className="text-sm text-default-400">
                          {selectedModulo.descricao ||
                            "Sem descrição operacional registrada."}
                        </p>
                        <div className="flex flex-wrap gap-2 text-xs text-default-500">
                          <span className="rounded-full border border-white/10 px-3 py-1 font-medium uppercase tracking-[0.14em]">
                            /{selectedModulo.slug}
                          </span>
                          <span className="rounded-full border border-white/10 px-3 py-1">
                            Ordem {selectedModulo.ordem ?? "-"}
                          </span>
                          <span className="rounded-full border border-white/10 px-3 py-1">
                            Atualizado em{" "}
                            {formatDateTime(selectedModulo.updatedAt)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="grid min-w-[220px] grid-cols-2 gap-3">
                      <Card className="border border-white/10 bg-background/50">
                        <CardBody className="p-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-default-500">
                            Rotas
                          </p>
                          <p className="mt-2 text-2xl font-semibold text-foreground">
                            {selectedModulo._count.rotas}
                          </p>
                        </CardBody>
                      </Card>
                      <Card className="border border-white/10 bg-background/50">
                        <CardBody className="p-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-default-500">
                            Planos
                          </p>
                          <p className="mt-2 text-2xl font-semibold text-foreground">
                            {selectedModulo._count.planos}
                          </p>
                        </CardBody>
                      </Card>
                    </div>
                  </div>
                </CardBody>
              </Card>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,360px),1fr]">
                <Card className="border border-white/10 bg-background/40">
                  <CardBody className="space-y-4 p-5">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-foreground">
                        Agrupamento visual do módulo
                      </p>
                      <p className="text-sm text-default-400">
                        Isso é só organização interna do admin. Não muda o que
                        aparece para cliente, chat ou plano. Se quiser agrupar
                        módulos por família, informe o nome aqui.
                      </p>
                    </div>
                    <Input
                      list="module-groupings"
                      placeholder="Ex.: Core, Financeiro, Jurídico"
                      value={groupingDraft}
                      onChange={(event) => setGroupingDraft(event.target.value)}
                    />
                    <datalist id="module-groupings">
                      {groupingOptions.map((grouping) => (
                        <option key={grouping.id} value={grouping.nome} />
                      ))}
                    </datalist>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        color="primary"
                        isLoading={pendingAction === "grouping"}
                        onPress={handleSaveGrouping}
                      >
                        Salvar agrupamento
                      </Button>
                      <Button
                        variant="flat"
                        onPress={() => setGroupingDraft("")}
                      >
                        Limpar campo
                      </Button>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-background/30 p-3 text-sm text-default-400">
                      <p className="font-medium text-foreground">
                        Estado atual
                      </p>
                      <p className="mt-1">
                        {selectedModulo.categoriaInfo?.nome ||
                          "Sem agrupamento definido no momento."}
                      </p>
                    </div>
                  </CardBody>
                </Card>

                <Card className="border border-white/10 bg-background/40">
                  <CardBody className="space-y-4 p-5">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-foreground">
                        Saúde técnica deste módulo
                      </p>
                      <p className="text-sm text-default-400">
                        O objetivo aqui é te mostrar divergência real entre o
                        que está no código, o que foi detectado e o que protege
                        o acesso hoje.
                      </p>
                    </div>

                    {selectedRouteDiff ? (
                      <div className="rounded-2xl border border-warning/30 bg-warning/10 p-4 text-sm">
                        <p className="font-semibold text-warning-700 dark:text-warning-300">
                          Rotas divergentes para {selectedModulo.slug}
                        </p>
                        <div className="mt-3 space-y-2 text-default-500">
                          {selectedRouteDiff.missingInDatabase.length > 0 ? (
                            <p>
                              Faltando no banco:{" "}
                              {selectedRouteDiff.missingInDatabase.join(", ")}
                            </p>
                          ) : null}
                          {selectedRouteDiff.staleInDatabase.length > 0 ? (
                            <p>
                              Sobrando no banco:{" "}
                              {selectedRouteDiff.staleInDatabase.join(", ")}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-success/30 bg-success/10 p-4 text-sm text-success-700 dark:text-success-300">
                        As rotas deste módulo estão coerentes entre código e
                        banco.
                      </div>
                    )}

                    {diagnostics?.missingInCode.some(
                      (item) => item.slug === selectedModulo.slug,
                    ) ? (
                      <div className="rounded-2xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger-700 dark:text-danger-300">
                        Este módulo existe no banco, mas não foi mais encontrado
                        em <code>app/(protected)</code>. Se ele ainda estiver em
                        planos, o catálogo precisa ser revisado antes de
                        remover.
                      </div>
                    ) : null}

                    <div className="rounded-2xl border border-white/10 bg-background/30 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-default-500">
                        Última detecção completa
                      </p>
                      <p className="mt-2 text-sm text-foreground">
                        {formatDateTime(autoDetectStatus?.lastDetection)}
                      </p>
                      {autoDetectStatus?.lastRunSummary ? (
                        <p className="mt-2 text-sm text-default-400">
                          Última execução:{" "}
                          {autoDetectStatus.lastRunSummary.created} criados,{" "}
                          {autoDetectStatus.lastRunSummary.updated} atualizados
                          e {autoDetectStatus.lastRunSummary.removed} removidos.
                        </p>
                      ) : null}
                    </div>
                  </CardBody>
                </Card>
              </div>

              <div className="grid gap-4 xl:grid-cols-[1.1fr,0.9fr]">
                <Card className="border border-white/10 bg-background/40">
                  <CardBody className="space-y-4 p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          Rotas protegidas
                        </p>
                        <p className="text-sm text-default-400">
                          Tudo o que o middleware usa para bloquear ou liberar
                          este módulo.
                        </p>
                      </div>
                      <Chip variant="flat">
                        {selectedModulo._count.rotas} rota(s)
                      </Chip>
                    </div>
                    <div className="space-y-2">
                      {(moduloDetail?.rotas ?? selectedModulo.rotas).map(
                        (rota) => (
                          <div
                            key={rota.id}
                            className="rounded-2xl border border-white/10 bg-background/30 px-4 py-3"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <code className="text-sm font-medium text-foreground">
                                {rota.rota}
                              </code>
                              <Chip
                                color={rota.ativo ? "success" : "default"}
                                size="sm"
                                variant="flat"
                              >
                                {rota.ativo ? "Ativa" : "Inativa"}
                              </Chip>
                            </div>
                            {rota.descricao ? (
                              <p className="mt-2 text-sm text-default-400">
                                {rota.descricao}
                              </p>
                            ) : null}
                          </div>
                        ),
                      )}
                    </div>
                  </CardBody>
                </Card>

                <Card className="border border-white/10 bg-background/40">
                  <CardBody className="space-y-4 p-5">
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        Impacto comercial
                      </p>
                      <p className="text-sm text-default-400">
                        Esta tela organiza o catálogo do produto. Para colocar o
                        módulo para dentro ou para fora de um plano, o ajuste é
                        feito em Planos &gt; Módulos e Versões.
                      </p>
                    </div>
                    <div className="rounded-2xl border border-primary/20 bg-primary/10 p-4 text-sm text-default-300">
                      <p className="font-medium text-foreground">
                        Quer tirar {selectedModulo.nome} do plano Pro?
                      </p>
                      <p className="mt-1">
                        Abra o plano desejado e desative o módulo na coluna de
                        módulos ativos. O catálogo do sistema fica aqui; a
                        composição comercial do plano fica em{" "}
                        <code>/admin/planos</code>.
                      </p>
                    </div>
                    {moduloDetail ? (
                      moduloDetail.planos.length > 0 ? (
                        <div className="space-y-2">
                          {moduloDetail.planos.map((plano) => (
                            <div
                              key={plano.id}
                              className="grid gap-3 rounded-2xl border border-white/10 bg-background/30 px-4 py-3 md:grid-cols-[minmax(0,1fr)_120px_auto] md:items-center"
                            >
                              <div className="min-w-0">
                                <p className="font-medium text-foreground">
                                  {plano.nome}
                                </p>
                                <p className="text-xs uppercase tracking-[0.14em] text-default-500">
                                  {plano.slug}
                                </p>
                              </div>
                              <div className="flex md:justify-center">
                                <Chip
                                  color={plano.ativo ? "success" : "default"}
                                  size="sm"
                                  variant="flat"
                                >
                                  {plano.ativo ? "Ativo" : "Inativo"}
                                </Chip>
                              </div>
                              <div className="flex md:justify-end">
                                <Button
                                  as={Link}
                                  color="primary"
                                  href={`/admin/planos?plano=${encodeURIComponent(plano.slug)}&tab=modules&module=${encodeURIComponent(selectedModulo.slug)}`}
                                  size="sm"
                                  variant="bordered"
                                >
                                  Editar no plano
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-dashed border-white/10 bg-background/30 p-4 text-sm text-default-400">
                          Nenhum plano usa este módulo no momento.
                        </div>
                      )
                    ) : (
                      <Skeleton className="h-32 rounded-2xl" isLoaded={false} />
                    )}
                    <div className="flex justify-end">
                      <Button
                        as={Link}
                        href="/admin/planos?tab=modules"
                        size="sm"
                        variant="flat"
                      >
                        Abrir gestão de planos
                      </Button>
                    </div>
                  </CardBody>
                </Card>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-white/10 bg-background/30 p-6 text-sm text-default-400">
              Nenhum módulo disponível para exibir. Se você acabou de subir uma
              nova funcionalidade em <code>app/(protected)</code>, execute a
              detecção do catálogo.
            </div>
          )}
        </PeoplePanel>
      </div>

      <PeoplePanel
        title="Diagnóstico técnico"
        description="Código, banco e cache de acesso comparados de forma explícita. Aqui fica o que antes estava espalhado entre cards, tooltips e automações escondidas."
      >
        <div className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="border border-white/10 bg-background/40">
              <CardBody className="space-y-3 p-5">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Workflow className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      Código-fonte
                    </p>
                    <p className="text-sm text-default-400">
                      Estrutura real lida em <code>app/(protected)</code>
                    </p>
                  </div>
                </div>
                {isLoadingDiagnostics ? (
                  <Skeleton className="h-24 rounded-2xl" isLoaded={false} />
                ) : (
                  <>
                    <p className="text-2xl font-semibold text-foreground">
                      {diagnostics?.filesystemModules ?? 0} módulos
                    </p>
                    <p className="text-sm text-default-400">
                      {diagnostics?.filesystemRoutes ?? 0} rota(s) detectadas no
                      código.
                    </p>
                    <Chip
                      color={
                        diagnostics?.needsCatalogSync ? "warning" : "success"
                      }
                      variant="flat"
                    >
                      {diagnostics?.needsCatalogSync
                        ? "Banco precisa refletir o código"
                        : "Banco alinhado com o código"}
                    </Chip>
                  </>
                )}
              </CardBody>
            </Card>

            <Card className="border border-white/10 bg-background/40">
              <CardBody className="space-y-3 p-5">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-secondary/10 text-secondary">
                    <Database className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      Banco de dados
                    </p>
                    <p className="text-sm text-default-400">
                      Catálogo lido hoje pelo sistema de permissões
                    </p>
                  </div>
                </div>
                {isLoadingDiagnostics ? (
                  <Skeleton className="h-24 rounded-2xl" isLoaded={false} />
                ) : (
                  <>
                    <p className="text-2xl font-semibold text-foreground">
                      {diagnostics?.databaseModules ?? 0} módulos
                    </p>
                    <p className="text-sm text-default-400">
                      {diagnostics?.databaseRoutes ?? 0} rota(s) cadastradas,{" "}
                      {diagnostics?.activeRoutes ?? 0} ativas no acesso.
                    </p>
                    <Chip color="secondary" variant="flat">
                      {diagnostics?.activeModules ?? 0} módulo(s) ativos no
                      runtime
                    </Chip>
                  </>
                )}
              </CardBody>
            </Card>

            <Card className="border border-white/10 bg-background/40">
              <CardBody className="space-y-3 p-5">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-success/10 text-success">
                    <ShieldCheck className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      Acesso e cache
                    </p>
                    <p className="text-sm text-default-400">
                      O module map é dinâmico. Sincronização manual agora serve
                      só para limpar cache, não para “gerar arquivo”.
                    </p>
                  </div>
                </div>
                {isLoadingDiagnostics ? (
                  <Skeleton className="h-24 rounded-2xl" isLoaded={false} />
                ) : (
                  <>
                    <p className="text-2xl font-semibold text-foreground">
                      Dinâmico
                    </p>
                    <p className="text-sm text-default-400">
                      Node cache:{" "}
                      {diagnostics?.cacheStrategy.nodeCacheWindowSeconds ?? 0}s
                      • Edge cache:{" "}
                      {diagnostics?.cacheStrategy.edgeCacheWindowSeconds ?? 0}s
                    </p>
                    <Chip color="success" variant="flat">
                      Sem heurística artificial de “5 minutos”
                    </Chip>
                  </>
                )}
              </CardBody>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="border border-white/10 bg-background/40">
              <CardBody className="space-y-3 p-5">
                <div className="flex items-center gap-2">
                  <Boxes className="h-4 w-4 text-primary" />
                  <p className="font-semibold text-foreground">
                    Existe no código e falta no banco
                  </p>
                </div>
                {diagnostics?.missingInDatabase.length ? (
                  <div className="flex flex-wrap gap-2">
                    {diagnostics.missingInDatabase.map((slug) => (
                      <Chip key={slug} color="warning" variant="flat">
                        {slug}
                      </Chip>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-default-400">
                    Nenhum módulo novo pendente de persistência.
                  </p>
                )}
              </CardBody>
            </Card>

            <Card className="border border-white/10 bg-background/40">
              <CardBody className="space-y-3 p-5">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-warning" />
                  <p className="font-semibold text-foreground">
                    Existe no banco e sumiu do código
                  </p>
                </div>
                {diagnostics?.missingInCode.length ? (
                  <div className="space-y-2">
                    {diagnostics.missingInCode.map((item) => (
                      <div
                        key={item.slug}
                        className="rounded-2xl border border-white/10 bg-background/30 px-3 py-2 text-sm"
                      >
                        <p className="font-medium text-foreground">
                          {item.slug}
                        </p>
                        <p className="text-default-400">
                          Vinculado a {item.planCount} plano(s)
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-default-400">
                    Nenhum módulo órfão no banco.
                  </p>
                )}
              </CardBody>
            </Card>

            <Card className="border border-white/10 bg-background/40">
              <CardBody className="space-y-3 p-5">
                <div className="flex items-center gap-2">
                  <Layers3 className="h-4 w-4 text-secondary" />
                  <p className="font-semibold text-foreground">
                    Diferenças de rota
                  </p>
                </div>
                {diagnostics?.routeDiffs.length ? (
                  <div className="space-y-2">
                    {diagnostics.routeDiffs.map((item) => (
                      <div
                        key={item.slug}
                        className="rounded-2xl border border-white/10 bg-background/30 px-3 py-2 text-sm"
                      >
                        <p className="font-medium text-foreground">
                          {item.slug}
                        </p>
                        <p className="text-default-400">
                          +{item.missingInDatabase.length} faltando no banco • -
                          {item.staleInDatabase.length} sobrando no banco
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-default-400">
                    Nenhuma divergência de rota detectada.
                  </p>
                )}
              </CardBody>
            </Card>
          </div>

          <div className="rounded-2xl border border-white/10 bg-background/30 p-4 text-sm text-default-400">
            <p className="font-medium text-foreground">Leitura operacional</p>
            <p className="mt-1">
              Última detecção completa:{" "}
              {formatDateTime(diagnostics?.lastDetection)}.{" "}
              {autoDetectStatus?.needsSync
                ? "Há mudanças no código ainda não refletidas no banco."
                : "Não há mudanças pendentes entre código e banco neste momento."}
            </p>
          </div>
        </div>
      </PeoplePanel>
    </div>
  );
}
