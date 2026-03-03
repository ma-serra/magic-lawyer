"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import {
  Button,
  Card,
  CardBody,
  Chip,
  Divider,
  Input,
  Modal,
  Snippet,
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
import { Edit3, Filter, Search } from "lucide-react";

import {
  createCausa,
  listCausas,
  setCausaAtiva,
  syncCausasOficiais,
  updateCausa,
  type CausasListResult,
  type CausasListParams,
} from "@/app/actions/causas";
import {
  PeopleMetricCard,
  PeoplePageHeader,
  PeoplePanel,
} from "@/components/people-ui";
import { toast } from "@/lib/toast";

const PAGE_SIZE_OPTIONS = [12, 24, 48];

type CausaStatusFilter = "all" | "ativas" | "arquivadas";
type CausaOrigemFilter = "all" | "oficiais" | "internas";
type CausaOrderBy = "nome" | "createdAt" | "updatedAt";
type CausaOrderDirection = "asc" | "desc";

interface CausaDto {
  id: string;
  nome: string;
  codigoCnj: string | null;
  descricao: string | null;
  ativo: boolean;
  isOficial: boolean;
  createdAt: string;
  updatedAt: string;
  processoCount?: number | null;
  diligenciaCount?: number | null;
  peticaoCount?: number | null;
  prazoCount?: number | null;
}

interface CausasPagedResponse {
  causas: CausaDto[];
  total?: number;
  page?: number;
  pageSize?: number;
  totalPages?: number;
  filtros?: {
    totalAtivas?: number;
    totalArquivadas?: number;
    totalOficiais?: number;
  };
}

interface FormState {
  nome: string;
  codigoCnj: string;
  descricao: string;
}

function getSingleSelectionKey(value: unknown): string | undefined {
  if (!value || value === "all") {
    return undefined;
  }

  if (value instanceof Set) {
    const first = Array.from(value)[0];

    if (typeof first === "string" && first !== "all") {
      return first;
    }
  }

  return typeof value === "string" ? value : undefined;
}

interface CausasContentProps {
  canSyncOficiais?: boolean;
}

export function CausasContent({ canSyncOficiais = false }: CausasContentProps) {
  const [filtros, setFiltros] = useState({
    search: "",
    status: "all" as CausaStatusFilter,
    origem: "all" as CausaOrigemFilter,
    orderBy: "nome" as CausaOrderBy,
    orderDirection: "asc" as CausaOrderDirection,
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]);
  const [createForm, setCreateForm] = useState<FormState>({
    nome: "",
    codigoCnj: "",
    descricao: "",
  });
  const [editingCausa, setEditingCausa] = useState<CausaDto | null>(null);
  const [detailCausa, setDetailCausa] = useState<CausaDto | null>(null);
  const [editForm, setEditForm] = useState<FormState>({
    nome: "",
    codigoCnj: "",
    descricao: "",
  });
  const [isCreating, setIsCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncingOficiais, setIsSyncingOficiais] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<Set<string>>(
    new Set(),
  );

  const swrKey = useMemo(
    () => [
      "causas",
      filtros.search.trim().toLowerCase(),
      filtros.status,
      filtros.origem,
      filtros.orderBy,
      filtros.orderDirection,
      page,
      pageSize,
    ],
    [
      filtros.search,
      filtros.status,
      filtros.origem,
      filtros.orderBy,
      filtros.orderDirection,
      page,
      pageSize,
    ],
  );

  const fetcher = useCallback(async () => {
    const params: CausasListParams = {
      search: filtros.search || undefined,
      status: filtros.status,
      origem: filtros.origem,
      orderBy: filtros.orderBy,
      orderDirection: filtros.orderDirection,
      page,
      pageSize,
    };
    const result = await listCausas(params);

    if (!result.success) {
      throw new Error(result.error || "Erro ao carregar causas");
    }

    const paginated = result as CausasListResult;
    const causaItems = paginated.causas.map((causa) => ({
      ...causa,
      createdAt: causa.createdAt.toISOString(),
      updatedAt: causa.updatedAt.toISOString(),
    }));

    return {
      causas: causaItems,
      total: paginated.total ?? causaItems.length,
      page: paginated.page ?? page,
      pageSize: paginated.pageSize ?? pageSize,
      totalPages:
        paginated.totalPages ??
        Math.max(
          1,
          Math.ceil((paginated.total ?? causaItems.length) / pageSize),
        ),
      filtros: paginated.filtros,
    } satisfies CausasPagedResponse;
  }, [
    filtros.search,
    filtros.status,
    filtros.origem,
    filtros.orderBy,
    filtros.orderDirection,
    page,
    pageSize,
  ]);

  const { data, mutate, isLoading } = useSWR<CausasPagedResponse>(
    swrKey,
    fetcher,
    {
      revalidateOnFocus: false,
      keepPreviousData: true,
    },
  );

  const causas = useMemo<CausaDto[]>(() => data?.causas ?? [], [data]);
  const total = data?.total ?? causas.length;
  const totalPages = data?.totalPages ?? 1;
  const totalAtivas =
    data?.filtros?.totalAtivas ?? causas.filter((item) => item.ativo).length;
  const totalArquivadas =
    data?.filtros?.totalArquivadas ??
    causas.filter((item) => !item.ativo).length;
  const totalOficiais =
    data?.filtros?.totalOficiais ??
    causas.filter((item) => item.isOficial).length;

  useEffect(() => {
    setPage(1);
  }, [
    filtros.search,
    filtros.status,
    filtros.origem,
    filtros.orderBy,
    filtros.orderDirection,
    pageSize,
  ]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(Math.max(totalPages, 1));
    }
  }, [page, totalPages]);

  const limparForm = useCallback(() => {
    setCreateForm({ nome: "", codigoCnj: "", descricao: "" });
  }, []);

  const setFiltroStatus = (value: unknown) => {
    const nextStatus = getSingleSelectionKey(value) || "all";
    setFiltros((prev) => ({
      ...prev,
      status: nextStatus as CausaStatusFilter,
    }));
  };

  const setFiltroOrigem = (value: unknown) => {
    const nextOrigem = getSingleSelectionKey(value) || "all";
    setFiltros((prev) => ({
      ...prev,
      origem: nextOrigem as CausaOrigemFilter,
    }));
  };

  const setFiltroOrdem = (value: unknown) => {
    const next = getSingleSelectionKey(value);

    if (!next) {
      return;
    }

    if (next === "nome") {
      setFiltros((prev) => ({
        ...prev,
        orderBy: "nome",
        orderDirection: "asc",
      }));
      return;
    }

    if (next === "createdAt") {
      setFiltros((prev) => ({
        ...prev,
        orderBy: "createdAt",
        orderDirection: "desc",
      }));
      return;
    }

    if (next === "updatedAt") {
      setFiltros((prev) => ({
        ...prev,
        orderBy: "updatedAt",
        orderDirection: "desc",
      }));
    }
  };

  const setPageSizeValue = (value: unknown) => {
    const next = getSingleSelectionKey(value);

    if (!next) {
      return;
    }

    const parsed = Number(next);

    if (!Number.isFinite(parsed) || parsed <= 0) {
      return;
    }

    setPageSize(parsed);
  };

  const handleCreate = useCallback(async () => {
    if (!createForm.nome.trim()) {
      toast.error("Informe o nome da causa");

      return;
    }

    setIsCreating(true);

    try {
      const result = await createCausa({
        nome: createForm.nome.trim(),
        codigoCnj: createForm.codigoCnj.trim() || undefined,
        descricao: createForm.descricao.trim() || undefined,
      });

      if (!result.success) {
        toast.error(result.error || "Erro ao criar causa");

        return;
      }

      toast.success("Causa criada com sucesso");
      limparForm();
      await mutate();
    } catch {
      toast.error("Erro ao criar causa");
    } finally {
      setIsCreating(false);
    }
  }, [createForm, limparForm, mutate]);

  const handleToggleAtiva = useCallback(
    async (causa: CausaDto, ativo: boolean) => {
      if (causa.ativo === ativo) {
        return;
      }

      setIsUpdatingStatus((prev) => {
        const next = new Set(prev);

        next.add(causa.id);

        return next;
      });

      try {
        const result = await setCausaAtiva(causa.id, ativo);

        if (!result.success) {
          toast.error(result.error || "Erro ao atualizar status");

          return;
        }

        await mutate();
        toast.success("Status atualizado");
      } catch {
        toast.error("Erro ao atualizar status");
      } finally {
        setIsUpdatingStatus((prev) => {
          const next = new Set(prev);

          next.delete(causa.id);

          return next;
        });
      }
    },
    [mutate],
  );

  const causaMetaRows = (causa: CausaDto) => {
    const rows = [
      `Processos: ${causa.processoCount ?? 0}`,
      `Diligências: ${causa.diligenciaCount ?? 0}`,
      `Petições: ${causa.peticaoCount ?? 0}`,
    ].filter(Boolean);

    return rows.join(" • ");
  };

  const openEdit = useCallback((causa: CausaDto) => {
    setEditingCausa(causa);
    setEditForm({
      nome: causa.nome,
      codigoCnj: causa.codigoCnj ?? "",
      descricao: causa.descricao ?? "",
    });
  }, []);

  const openDetail = useCallback((causa: CausaDto) => {
    setDetailCausa(causa);
  }, []);

  const closeDetail = useCallback(() => {
    setDetailCausa(null);
  }, []);

  const blockMousePropagation = useCallback(
    (event: { stopPropagation: () => void; preventDefault: () => void }) => {
      event.preventDefault();
      event.stopPropagation();
    },
    [],
  );

  const closeEdit = useCallback(() => {
    setEditingCausa(null);
    setEditForm({
      nome: "",
      codigoCnj: "",
      descricao: "",
    });
  }, []);

  const handleEditSave = useCallback(async () => {
    if (!editingCausa) {
      return;
    }

    if (!editForm.nome.trim()) {
      toast.error("Informe o nome da causa");

      return;
    }

    setIsSaving(true);

    try {
      const result = await updateCausa(editingCausa.id, {
        nome: editForm.nome.trim(),
        codigoCnj: editForm.codigoCnj.trim(),
        descricao: editForm.descricao.trim(),
      });

      if (!result.success) {
        toast.error(result.error || "Erro ao atualizar causa");

        return;
      }

      toast.success("Causa atualizada");
      closeEdit();
      await mutate();
    } catch {
      toast.error("Erro ao atualizar causa");
    } finally {
      setIsSaving(false);
    }
  }, [editingCausa, editForm, closeEdit, mutate]);

  const hasActiveFilters =
    filtros.search.trim().length > 0 ||
    filtros.status !== "all" ||
    filtros.origem !== "all";

  const clearFilters = useCallback(() => {
    setFiltros({
      search: "",
      status: "all",
      origem: "all",
      orderBy: "nome",
      orderDirection: "asc",
    });
  }, []);

  const handleSyncOficiais = useCallback(async () => {
    setIsSyncingOficiais(true);

    try {
      const result = await syncCausasOficiais();

      if (!result.success) {
        const retryText =
          typeof result.retryAfterSeconds === "number" &&
          result.retryAfterSeconds > 0
            ? ` Aguarde ${result.retryAfterSeconds}s e tente novamente.`
            : "";
        const extraLabel =
          result.errorCode === "SYNC_ALREADY_RUNNING"
            ? "A sincronização já está em andamento."
            : result.errorCode === "SYNC_COOLDOWN_BLOCKED"
              ? "Sincronizações estão em contenção para segurança."
              : "";

        toast.error(
          [
            result.error || "Erro ao sincronizar causas oficiais",
            extraLabel,
            retryText,
          ]
            .filter(Boolean)
            .join(" "),
        );

        return;
      }

      toast.success(
        `Catálogo oficial sincronizado. Criadas: ${result.criadas ?? 0}, atualizadas: ${
          result.atualizadas ?? 0
        }`,
      );
      await mutate();
    } catch {
      toast.error("Erro ao sincronizar causas oficiais");
    } finally {
      setIsSyncingOficiais(false);
    }
  }, [mutate]);

  const renderResult = isLoading ? (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <Card
          key={`causa-skeleton-${index}`}
          className="border border-white/10 bg-background/60"
        >
          <CardBody className="space-y-2 p-4">
            <Skeleton className="h-5 w-52 rounded-lg" isLoaded={false} />
            <Skeleton className="h-3 w-72 rounded-lg" isLoaded={false} />
            <Skeleton className="h-3 w-20 rounded-lg" isLoaded={false} />
          </CardBody>
        </Card>
      ))}
    </div>
  ) : causas.length ? (
    <div className="space-y-3">
      {causas.map((causa) => (
        <div
          key={causa.id}
          role="button"
          tabIndex={0}
          onClick={() => openDetail(causa)}
          onPointerDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              openDetail(causa);
            }
          }}
          className="cursor-pointer rounded-xl border border-white/10 bg-background/60 transition-all duration-300 hover:border-primary/40 hover:bg-background/80 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        >
          <Card className="border-0 bg-transparent">
            <CardBody className="flex cursor-pointer flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="text-base font-semibold text-foreground">
                    {causa.nome}
                  </h3>
                  {causa.isOficial ? (
                    <Chip color="primary" size="sm" variant="flat">
                      OFICIAL
                    </Chip>
                  ) : null}
                  <Chip
                    color={causa.ativo ? "success" : "default"}
                    size="sm"
                    variant="flat"
                  >
                    {causa.ativo ? "Ativa" : "Arquivada"}
                  </Chip>
                </div>
                {causa.codigoCnj && (
                  <div className="w-fit max-w-full">
                    <Chip color="primary" size="sm" variant="flat">
                      Código CNJ {causa.codigoCnj}
                    </Chip>
                  </div>
                )}
                {causa.descricao ? (
                  <p className="line-clamp-2 text-sm text-default-500">
                    {causa.descricao}
                  </p>
                ) : null}
                <p className="text-[11px] text-default-400">
                  {causaMetaRows(causa)}
                </p>
                <p className="text-[11px] text-default-400">
                  Atualizada em{" "}
                  {new Date(causa.updatedAt).toLocaleDateString("pt-BR")}
                </p>
              </div>
              <div className="flex flex-shrink-0 flex-wrap justify-end gap-2 sm:flex-nowrap">
                <Switch
                  isDisabled={isUpdatingStatus.has(causa.id)}
                  isSelected={causa.ativo}
                  size="sm"
                  className="cursor-default flex-shrink-0 whitespace-nowrap"
                  onPointerDown={blockMousePropagation}
                  onClick={blockMousePropagation}
                  onKeyDown={(event) => {
                    if (event.key === " " || event.key === "Enter") {
                      blockMousePropagation(event);
                    }
                  }}
                  onValueChange={(value) => handleToggleAtiva(causa, value)}
                >
                  Ativa
                </Switch>
                <Button
                  size="sm"
                  startContent={<Edit3 className="h-3.5 w-3.5" />}
                  variant="flat"
                  className="flex-shrink-0 whitespace-nowrap"
                  onClick={blockMousePropagation}
                  onPointerDown={blockMousePropagation}
                  onKeyDown={blockMousePropagation}
                  onPress={() => {
                    openEdit(causa);
                  }}
                >
                  Editar
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>
      ))}
    </div>
  ) : (
    <Card className="border border-white/10 bg-background/60">
      <CardBody className="space-y-2 p-6">
        <p className="text-sm text-default-500">
          Nenhuma causa encontrada com os filtros selecionados.
        </p>
        {hasActiveFilters ? (
          <Button size="sm" variant="light" onPress={clearFilters}>
            Limpar filtros
          </Button>
        ) : (
          <p className="text-xs text-default-400">
            Cadastre a primeira causa para começar o catálogo jurídico.
          </p>
        )}
      </CardBody>
    </Card>
  );

  return (
    <div className="space-y-6">
      <PeoplePageHeader
        description="Catálogo padrão para classificar processos, diligências, petições e documentos."
        title="Causas"
      />

      <PeoplePanel
        title="Métricas do catálogo"
        description="Visão rápida da base ativa e arquivada"
      >
        <div className="grid gap-3 sm:grid-cols-4">
          <PeopleMetricCard
            icon={<Filter className="h-4 w-4" />}
            label="Total de causas"
            value={total}
            tone="primary"
          />
          <PeopleMetricCard
            icon={<Filter className="h-4 w-4" />}
            label="Ativas"
            value={totalAtivas}
            tone="success"
            helper="Disponíveis para uso nos cadastros"
          />
          <PeopleMetricCard
            icon={<Filter className="h-4 w-4" />}
            label="Arquivadas"
            value={totalArquivadas}
            tone="default"
            helper="Encerradas no catálogo"
          />
          <PeopleMetricCard
            icon={<Filter className="h-4 w-4" />}
            label="Oficiais"
            value={totalOficiais}
            tone="secondary"
            helper="Importadas da fonte oficial"
          />
        </div>
      </PeoplePanel>

      <PeoplePanel
        title="Nova causa"
        description="Preencha o cadastro inicial. O nome deve ser único por tenant."
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              isRequired
              label="Nome"
              placeholder="Ex.: Ameaça, Ação de Divórcio..."
              value={createForm.nome}
              onValueChange={(value) =>
                setCreateForm((prev) => ({
                  ...prev,
                  nome: value,
                }))
              }
            />
            <Input
              label="Código CNJ"
              placeholder="Opcional"
              value={createForm.codigoCnj}
              onValueChange={(value) =>
                setCreateForm((prev) => ({
                  ...prev,
                  codigoCnj: value,
                }))
              }
            />
          </div>
          <Textarea
            label="Descrição"
            placeholder="Observação breve para uso interno"
            value={createForm.descricao}
            onValueChange={(value) =>
              setCreateForm((prev) => ({
                ...prev,
                descricao: value,
              }))
            }
          />
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="flat"
              onPress={limparForm}
              disabled={isCreating || isLoading}
            >
              Limpar
            </Button>
            <Button
              color="primary"
              isLoading={isCreating}
              onPress={handleCreate}
            >
              Salvar causa
            </Button>
          </div>
        </div>
      </PeoplePanel>

      <PeoplePanel
        title="Causas cadastradas"
        description="A busca é parcial e já inclui nome, código CNJ e descrição."
        actions={
          <>
            <Button size="sm" variant="flat" onPress={clearFilters}>
              Limpar filtros
            </Button>
            {canSyncOficiais ? (
              <Button
                color="primary"
                size="sm"
                isLoading={isSyncingOficiais}
                variant="flat"
                isDisabled={isSyncingOficiais}
                onPress={handleSyncOficiais}
              >
                Sincronizar oficiais
              </Button>
            ) : null}
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-3 xl:grid-cols-[1.5fr_1fr_1fr_1fr_0.95fr_auto] lg:grid-cols-[1.3fr_1fr_1fr_1fr_auto_auto] md:grid-cols-3">
            <Input
              isClearable
              className="w-full"
              label="Buscar causa"
              placeholder="Digite nome, código CNJ ou descrição"
              startContent={<Search className="h-4 w-4 text-default-400" />}
              value={filtros.search}
              onValueChange={(value) =>
                setFiltros((prev) => ({
                  ...prev,
                  search: value,
                }))
              }
            />

            <Select
              className="w-full"
              label="Status"
              selectedKeys={new Set([filtros.status])}
              onSelectionChange={setFiltroStatus}
            >
              <SelectItem key="all" textValue="Todas">
                Todas
              </SelectItem>
              <SelectItem key="ativas" textValue="Ativas">
                Ativas
              </SelectItem>
              <SelectItem key="arquivadas" textValue="Arquivadas">
                Arquivadas
              </SelectItem>
            </Select>

            <Select
              className="w-full"
              label="Origem"
              selectedKeys={new Set([filtros.origem])}
              onSelectionChange={setFiltroOrigem}
            >
              <SelectItem key="all" textValue="Todas">
                Todas
              </SelectItem>
              <SelectItem key="oficiais" textValue="Oficiais">
                Mostrar apenas oficiais
              </SelectItem>
              <SelectItem key="internas" textValue="Internas">
                Mostrar apenas internas
              </SelectItem>
            </Select>

            <Select
              className="w-full"
              label="Ordenar"
              selectedKeys={new Set([filtros.orderBy])}
              onSelectionChange={setFiltroOrdem}
            >
              <SelectItem key="nome" textValue="Nome">
                Nome
              </SelectItem>
              <SelectItem key="createdAt" textValue="Mais recentes">
                Mais recentes
              </SelectItem>
              <SelectItem key="updatedAt" textValue="Atualização">
                Última atualização
              </SelectItem>
            </Select>

            <Select
              className="w-full"
              label="Por página"
              selectedKeys={new Set([String(pageSize)])}
              onSelectionChange={setPageSizeValue}
            >
              {PAGE_SIZE_OPTIONS.map((item) => (
                <SelectItem key={String(item)} textValue={`${item} por página`}>
                  {item} por página
                </SelectItem>
              ))}
            </Select>

            <div className="flex items-end">
              <Chip color="primary" size="sm" variant="flat">
                {total} encontrados
              </Chip>
            </div>
          </div>

          <Divider className="border-white/10" />

          {renderResult}

          {totalPages > 1 ? (
            <div className="flex justify-end">
              <Pagination
                showControls
                total={totalPages}
                page={page}
                onChange={setPage}
              />
            </div>
          ) : null}
        </div>
      </PeoplePanel>

      <Modal isOpen={!!editingCausa} size="md" onOpenChange={closeEdit}>
        <ModalContent>
          {() => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <h3 className="text-lg font-semibold text-foreground">
                  Editar causa
                </h3>
                {editingCausa ? (
                  <p className="text-sm text-default-400">
                    Atualizado em{" "}
                    {new Date(editingCausa.updatedAt).toLocaleDateString(
                      "pt-BR",
                    )}
                  </p>
                ) : null}
              </ModalHeader>
              <ModalBody className="space-y-3">
                <Input
                  isRequired
                  label="Nome"
                  value={editForm.nome}
                  onValueChange={(value) =>
                    setEditForm((prev) => ({
                      ...prev,
                      nome: value,
                    }))
                  }
                />
                <Input
                  label="Código CNJ"
                  value={editForm.codigoCnj}
                  onValueChange={(value) =>
                    setEditForm((prev) => ({
                      ...prev,
                      codigoCnj: value,
                    }))
                  }
                />
                <Textarea
                  label="Descrição"
                  value={editForm.descricao}
                  onValueChange={(value) =>
                    setEditForm((prev) => ({
                      ...prev,
                      descricao: value,
                    }))
                  }
                />
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={closeEdit}>
                  Cancelar
                </Button>
                <Button
                  color="primary"
                  isLoading={isSaving}
                  onPress={handleEditSave}
                >
                  Salvar alterações
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      <Modal
        isOpen={!!detailCausa}
        size="2xl"
        scrollBehavior="inside"
        onOpenChange={closeDetail}
      >
        <ModalContent>
          {() =>
            detailCausa ? (
              <>
                <ModalHeader className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold text-foreground">
                      {detailCausa.nome}
                    </h3>
                    {detailCausa.isOficial ? (
                      <Chip color="primary" size="sm" variant="flat">
                        OFICIAL
                      </Chip>
                    ) : null}
                    <Chip
                      color={detailCausa.ativo ? "success" : "default"}
                      size="sm"
                      variant="flat"
                    >
                      {detailCausa.ativo ? "Ativa" : "Arquivada"}
                    </Chip>
                  </div>
                  <p className="text-sm text-default-400">
                    Atualizada em{" "}
                    {new Date(detailCausa.updatedAt).toLocaleDateString(
                      "pt-BR",
                    )}
                  </p>
                </ModalHeader>
                <ModalBody className="space-y-4">
                  {detailCausa.codigoCnj ? (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-default-500">
                        Código CNJ
                      </p>
                      <Snippet
                        codeString={detailCausa.codigoCnj}
                        color="primary"
                        variant="flat"
                        hideSymbol
                      >
                        {`CNJ ${detailCausa.codigoCnj}`}
                      </Snippet>
                    </div>
                  ) : null}
                  <div>
                    <p className="mb-2 text-sm font-semibold text-foreground">
                      Descrição completa
                    </p>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                      {detailCausa.descricao ||
                        "Sem descrição cadastrada para esta causa."}
                    </p>
                  </div>
                  <Divider className="border-white/10" />
                  <div className="text-sm text-foreground/90">
                    {causaMetaRows(detailCausa)}
                  </div>
                  <div className="text-xs text-foreground/70">
                    Criada em{" "}
                    {new Date(detailCausa.createdAt).toLocaleDateString(
                      "pt-BR",
                    )}{" "}
                    · Atualizada em{" "}
                    {new Date(detailCausa.updatedAt).toLocaleDateString(
                      "pt-BR",
                    )}
                  </div>
                </ModalBody>
                <ModalFooter>
                  <Button variant="light" onPress={closeDetail}>
                    Fechar
                  </Button>
                  <Button
                    color="primary"
                    variant="flat"
                    onPress={() => {
                      closeDetail();
                      openEdit(detailCausa);
                    }}
                  >
                    Editar
                  </Button>
                </ModalFooter>
              </>
            ) : null
          }
        </ModalContent>
      </Modal>
    </div>
  );
}
