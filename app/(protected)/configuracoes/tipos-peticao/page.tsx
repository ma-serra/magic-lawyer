"use client";

import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";
import {
  Button,
  Chip,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Select,
  SelectItem,
  Spinner,
  Switch,
  Tab,
  Tabs,
  Textarea,
} from "@heroui/react";
import {
  FileTextIcon,
  GlobeIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  TrashIcon,
} from "lucide-react";
import { toast } from "@/lib/toast";
import {
  configurarTiposGlobaisTenant,
  createTipoPeticao,
  deleteTipoPeticao,
  getCategoriasTipoPeticao,
  listTiposPeticaoConfiguracaoTenant,
  listarTiposGlobais,
  updateTipoPeticao,
} from "@/app/actions/tipos-peticao";
import {
  PeopleEntityCard,
  PeopleEntityCardBody,
  PeopleMetricCard,
  PeoplePageHeader,
  PeoplePanel,
} from "@/components/people-ui";

type CategoriaOption = {
  value: string;
  label: string;
};

type TipoGlobal = {
  id: string;
  nome: string;
  categoria: string | null;
  ordem: number;
  global: boolean;
  ativo: boolean;
  descricao?: string | null;
};

type TipoTenant = {
  id: string;
  nome: string;
  categoria: string | null;
  ordem: number;
  global: boolean;
  ativo: boolean;
  tenantId: string | null;
  descricao?: string | null;
};

type TipoFormData = {
  nome: string;
  categoria: string;
  ordem: number;
  descricao: string;
  ativo: boolean;
};

const DEFAULT_FORM: TipoFormData = {
  nome: "",
  categoria: "OUTROS",
  ordem: 1000,
  descricao: "",
  ativo: true,
};

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function toSingleSelectionValue(selection: "all" | Set<React.Key>) {
  if (selection === "all") return "";
  const first = Array.from(selection)[0];
  return typeof first === "string" ? first : "";
}

function formatCategoria(categoria: string | null, categorias: CategoriaOption[]) {
  if (!categoria) return "Sem categoria";
  return categorias.find((item) => item.value === categoria)?.label ?? categoria;
}

function getCategoriaColor(
  categoria: string | null,
): "default" | "success" | "primary" | "warning" | "secondary" | "danger" {
  if (!categoria) return "default";

  const colors: Record<
    string,
    "default" | "success" | "primary" | "warning" | "secondary" | "danger"
  > = {
    INICIAL: "success",
    RESPOSTA: "warning",
    RECURSO: "danger",
    EXECUCAO: "primary",
    URGENTE: "secondary",
    PROCEDIMENTO: "default",
    OUTROS: "default",
  };

  return colors[categoria] ?? "default";
}

export default function ConfiguracaoTiposPeticaoPage() {
  const [activeTab, setActiveTab] = useState<"globais" | "customizados">(
    "globais",
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [categoriaFiltro, setCategoriaFiltro] = useState("");
  const [somenteAtivosCustomizados, setSomenteAtivosCustomizados] =
    useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<TipoFormData>(DEFAULT_FORM);

  const [savingForm, setSavingForm] = useState(false);
  const [updatingGlobalId, setUpdatingGlobalId] = useState<string | null>(null);
  const [updatingCustomId, setUpdatingCustomId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const {
    data: categoriasResult,
    isLoading: loadingCategorias,
    mutate: mutateCategorias,
  } = useSWR("tipos-peticao-categorias", () => getCategoriasTipoPeticao());
  const {
    data: globaisResult,
    isLoading: loadingGlobais,
    mutate: mutateGlobais,
  } = useSWR("tipos-peticao-globais", () => listarTiposGlobais());
  const {
    data: tenantResult,
    isLoading: loadingTenant,
    mutate: mutateTenant,
  } = useSWR("tipos-peticao-tenant-config", () =>
    listTiposPeticaoConfiguracaoTenant(),
  );

  const categorias = useMemo<CategoriaOption[]>(
    () =>
      categoriasResult?.success
        ? (categoriasResult.data as CategoriaOption[]) ?? []
        : [],
    [categoriasResult],
  );

  const tiposGlobais = useMemo<TipoGlobal[]>(
    () =>
      globaisResult?.success ? ((globaisResult.data as TipoGlobal[]) ?? []) : [],
    [globaisResult],
  );
  const nomesGlobaisSet = useMemo(() => {
    return new Set(tiposGlobais.map((tipo) => normalizeText(tipo.nome)));
  }, [tiposGlobais]);

  const tenantTipos = useMemo<TipoTenant[]>(
    () => (tenantResult?.success ? ((tenantResult.data as TipoTenant[]) ?? []) : []),
    [tenantResult],
  );

  const tiposCustomizados = useMemo(
    () =>
      tenantTipos.filter(
        (tipo) =>
          Boolean(tipo.tenantId) &&
          !tipo.global &&
          !nomesGlobaisSet.has(normalizeText(tipo.nome)),
      ),
    [nomesGlobaisSet, tenantTipos],
  );

  const loadingData = loadingCategorias || loadingGlobais || loadingTenant;

  const tenantOverrideByNome = useMemo(() => {
    const map = new Map<string, TipoTenant>();
    for (const tipo of tenantTipos) {
      map.set(normalizeText(tipo.nome), tipo);
    }
    return map;
  }, [tenantTipos]);

  const nomeFiltro = searchTerm.trim().toLowerCase();

  const filteredGlobais = useMemo(() => {
    return tiposGlobais.filter((tipo) => {
      if (
        categoriaFiltro &&
        categoriaFiltro !== "TODAS" &&
        (tipo.categoria ?? "OUTROS") !== categoriaFiltro
      ) {
        return false;
      }

      if (!nomeFiltro) return true;

      const haystack = `${tipo.nome} ${tipo.categoria ?? ""}`.toLowerCase();
      return haystack.includes(nomeFiltro);
    });
  }, [categoriaFiltro, nomeFiltro, tiposGlobais]);

  const filteredCustomizados = useMemo(() => {
    return tiposCustomizados.filter((tipo) => {
      if (
        categoriaFiltro &&
        categoriaFiltro !== "TODAS" &&
        (tipo.categoria ?? "OUTROS") !== categoriaFiltro
      ) {
        return false;
      }

      if (somenteAtivosCustomizados && !tipo.ativo) {
        return false;
      }

      if (!nomeFiltro) return true;

      const haystack =
        `${tipo.nome} ${tipo.categoria ?? ""} ${tipo.descricao ?? ""}`.toLowerCase();
      return haystack.includes(nomeFiltro);
    });
  }, [
    categoriaFiltro,
    nomeFiltro,
    somenteAtivosCustomizados,
    tiposCustomizados,
  ]);

  const totalGlobaisAtivosTenant = useMemo(
    () =>
      tiposGlobais.filter((tipo) => {
        const override = tenantOverrideByNome.get(normalizeText(tipo.nome));
        return override?.ativo ?? true;
      }).length,
    [tenantOverrideByNome, tiposGlobais],
  );

  const totalCustomizadosAtivos = useMemo(
    () => tiposCustomizados.filter((tipo) => tipo.ativo).length,
    [tiposCustomizados],
  );

  const categoriaFiltroKeys = useMemo(() => {
    const allowed = new Set(["", "TODAS", ...categorias.map((item) => item.value)]);
    if (!allowed.has(categoriaFiltro)) return [];
    return categoriaFiltro ? [categoriaFiltro] : [];
  }, [categoriaFiltro, categorias]);
  const categoriasComTodas = useMemo(
    () => [{ value: "TODAS", label: "Todas as categorias" }, ...categorias],
    [categorias],
  );

  const formCategoriaKeys = useMemo(() => {
    const allowed = new Set(categorias.map((item) => item.value));
    if (!allowed.has(formData.categoria)) return [];
    return [formData.categoria];
  }, [categorias, formData.categoria]);

  const resetForm = useCallback(() => {
    setEditingId(null);
    setFormData(DEFAULT_FORM);
  }, []);

  const openCreateModal = useCallback(() => {
    resetForm();
    setModalOpen(true);
  }, [resetForm]);

  const openEditModal = useCallback((tipo: TipoTenant) => {
    setEditingId(tipo.id);
    setFormData({
      nome: tipo.nome,
      categoria: tipo.categoria ?? "OUTROS",
      ordem: tipo.ordem ?? 1000,
      descricao: tipo.descricao ?? "",
      ativo: tipo.ativo,
    });
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    resetForm();
  }, [resetForm]);

  const refreshData = useCallback(async () => {
    await Promise.all([mutateCategorias(), mutateGlobais(), mutateTenant()]);
  }, [mutateCategorias, mutateGlobais, mutateTenant]);

  const handleToggleGlobal = useCallback(
    async (tipo: TipoGlobal, ativo: boolean) => {
      setUpdatingGlobalId(tipo.id);
      try {
        const result = await configurarTiposGlobaisTenant(tipo.id, ativo);

        if (!result.success) {
          toast.error(result.error || "Erro ao atualizar configuração global");
          return;
        }

        toast.success(
          result.message ||
            `Tipo "${tipo.nome}" ${ativo ? "ativado" : "desativado"} no escritório`,
        );
        await mutateTenant();
      } catch {
        toast.error("Erro inesperado ao atualizar configuração global");
      } finally {
        setUpdatingGlobalId(null);
      }
    },
    [mutateTenant],
  );

  const handleToggleCustom = useCallback(
    async (tipo: TipoTenant, ativo: boolean) => {
      setUpdatingCustomId(tipo.id);
      try {
        const result = await updateTipoPeticao(tipo.id, { ativo });

        if (!result.success) {
          toast.error(result.error || "Erro ao atualizar tipo customizado");
          return;
        }

        toast.success(
          `Tipo "${tipo.nome}" ${ativo ? "ativado" : "desativado"} com sucesso`,
        );
        await mutateTenant();
      } catch {
        toast.error("Erro inesperado ao atualizar tipo customizado");
      } finally {
        setUpdatingCustomId(null);
      }
    },
    [mutateTenant],
  );

  const handleSubmit = useCallback(async () => {
    if (!formData.nome.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }

    setSavingForm(true);
    try {
      if (editingId) {
        const result = await updateTipoPeticao(editingId, {
          nome: formData.nome.trim(),
          categoria: formData.categoria,
          ordem: formData.ordem,
          descricao: formData.descricao.trim() || undefined,
          ativo: formData.ativo,
        });

        if (!result.success) {
          toast.error(result.error || "Erro ao atualizar tipo");
          return;
        }

        toast.success(result.message || "Tipo customizado atualizado com sucesso");
        await mutateTenant();
        closeModal();
        return;
      }

      const createResult = await createTipoPeticao({
        nome: formData.nome.trim(),
        categoria: formData.categoria,
        ordem: formData.ordem,
        descricao: formData.descricao.trim() || undefined,
      });

      if (!createResult.success) {
        toast.error(createResult.error || "Erro ao criar tipo");
        return;
      }

      const createdId = (createResult.data as { id?: string } | undefined)?.id;
      if (!formData.ativo && createdId) {
        await updateTipoPeticao(createdId, { ativo: false });
      }

      toast.success(createResult.message || "Tipo customizado criado com sucesso");
      await mutateTenant();
      closeModal();
    } catch {
      toast.error("Erro inesperado ao salvar tipo");
    } finally {
      setSavingForm(false);
    }
  }, [closeModal, editingId, formData, mutateTenant]);

  const handleDelete = useCallback(
    async (tipo: TipoTenant) => {
      const confirmDelete = window.confirm(
        `Excluir o tipo customizado "${tipo.nome}"?`,
      );
      if (!confirmDelete) return;

      setDeletingId(tipo.id);
      try {
        const result = await deleteTipoPeticao(tipo.id);

        if (!result.success) {
          toast.error(result.error || "Erro ao excluir tipo customizado");
          return;
        }

        toast.success(result.message || "Tipo customizado removido com sucesso");
        await mutateTenant();
      } catch {
        toast.error("Erro inesperado ao excluir tipo customizado");
      } finally {
        setDeletingId(null);
      }
    },
    [mutateTenant],
  );

  return (
    <section className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-3 py-8 sm:px-6">
      <PeoplePageHeader
        tag="Administração"
        title="Tipos de petição"
        description="Padronize os tipos utilizados no escritório. Ative/desative globais e mantenha tipos customizados por contexto operacional."
        actions={
          <Button
            color="primary"
            radius="full"
            startContent={<PlusIcon className="h-4 w-4" />}
            onPress={openCreateModal}
          >
            Novo tipo customizado
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <PeopleMetricCard
          helper="Catálogo padrão do sistema"
          icon={<GlobeIcon className="h-4 w-4" />}
          label="Tipos globais"
          tone="secondary"
          value={tiposGlobais.length}
        />
        <PeopleMetricCard
          helper="Globais ativos no escritório"
          icon={<FileTextIcon className="h-4 w-4" />}
          label="Globais ativos"
          tone="success"
          value={totalGlobaisAtivosTenant}
        />
        <PeopleMetricCard
          helper="Tipos próprios do tenant"
          icon={<PencilIcon className="h-4 w-4" />}
          label="Customizados"
          tone="primary"
          value={tiposCustomizados.length}
        />
        <PeopleMetricCard
          helper="Customizados com status ativo"
          icon={<SlidersHorizontalIcon className="h-4 w-4" />}
          label="Customizados ativos"
          tone="warning"
          value={totalCustomizadosAtivos}
        />
      </div>

      <PeoplePanel
        title="Filtros"
        description="Filtre por nome e categoria para localizar rapidamente o tipo de petição desejado."
        actions={
          <Button
            isDisabled={!searchTerm && !categoriaFiltro && somenteAtivosCustomizados}
            size="sm"
            variant="light"
            onPress={() => {
              setSearchTerm("");
              setCategoriaFiltro("");
              setSomenteAtivosCustomizados(true);
            }}
          >
            Limpar filtros
          </Button>
        }
      >
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <Input
            aria-label="Buscar tipo de petição"
            placeholder="Buscar por nome, categoria ou descrição"
            startContent={<SearchIcon className="h-4 w-4 text-default-400" />}
            value={searchTerm}
            variant="bordered"
            onValueChange={setSearchTerm}
          />
          <Select
            aria-label="Filtrar por categoria"
            disallowEmptySelection={false}
            items={categoriasComTodas}
            placeholder="Categoria"
            selectedKeys={categoriaFiltroKeys}
            variant="bordered"
            onSelectionChange={(keys) =>
              setCategoriaFiltro(toSingleSelectionValue(keys as "all" | Set<React.Key>))
            }
          >
            {(item) => (
              <SelectItem key={item.value} textValue={item.label}>
                {item.label}
              </SelectItem>
            )}
          </Select>
          <div className="flex items-center rounded-xl border border-white/10 px-3">
            <Switch
              isSelected={somenteAtivosCustomizados}
              size="sm"
              onValueChange={setSomenteAtivosCustomizados}
            >
              Apenas ativos em customizados
            </Switch>
          </div>
        </div>
      </PeoplePanel>

      <Tabs
        aria-label="Abas de tipos de petição"
        color="primary"
        selectedKey={activeTab}
        variant="underlined"
        onSelectionChange={(key) =>
          setActiveTab((key as "globais" | "customizados") ?? "globais")
        }
      >
        <Tab
          key="globais"
          title={
            <div className="flex items-center gap-2">
              <GlobeIcon className="h-4 w-4" />
              <span>Globais ({filteredGlobais.length})</span>
            </div>
          }
        >
          <PeoplePanel
            title="Tipos globais do sistema"
            description="Ative ou desative no escopo do escritório. O catálogo global é compartilhado, mas a decisão de uso é do tenant."
            actions={
              <Button
                isLoading={loadingData}
                size="sm"
                variant="flat"
                onPress={refreshData}
              >
                Recarregar
              </Button>
            }
          >
            {loadingData ? (
              <div className="flex items-center justify-center py-10">
                <Spinner label="Carregando tipos globais..." size="lg" />
              </div>
            ) : filteredGlobais.length > 0 ? (
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                {filteredGlobais.map((tipo) => {
                  const override = tenantOverrideByNome.get(normalizeText(tipo.nome));
                  const ativoTenant = override?.ativo ?? true;

                  return (
                    <div
                      key={tipo.id}
                      className="rounded-xl border border-white/10 bg-background/60 p-4 transition-colors hover:border-primary/35"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-2">
                          <p className="text-sm font-semibold text-foreground">
                            {tipo.nome}
                          </p>
                          <div className="flex flex-wrap items-center gap-2">
                            <Chip
                              color={getCategoriaColor(tipo.categoria)}
                              size="sm"
                              variant="flat"
                            >
                              {formatCategoria(tipo.categoria, categorias)}
                            </Chip>
                            <Chip size="sm" variant="flat">
                              Ordem {tipo.ordem}
                            </Chip>
                            {override ? (
                              <Chip color="primary" size="sm" variant="flat">
                                Regra do escritório
                              </Chip>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex min-w-[170px] flex-col items-end gap-1">
                          <span className="text-xs text-default-500">Ativo no escritório</span>
                          <Switch
                            isDisabled={updatingGlobalId === tipo.id}
                            isSelected={ativoTenant}
                            size="sm"
                            onValueChange={(ativo) => handleToggleGlobal(tipo, ativo)}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-8 text-center text-sm text-default-400">
                Nenhum tipo global encontrado com os filtros atuais.
              </div>
            )}
          </PeoplePanel>
        </Tab>

        <Tab
          key="customizados"
          title={
            <div className="flex items-center gap-2">
              <FileTextIcon className="h-4 w-4" />
              <span>Customizados ({filteredCustomizados.length})</span>
            </div>
          }
        >
          <PeoplePanel
            title="Tipos customizados do escritório"
            description="Crie tipos próprios para fluxos específicos da operação. Clique no card para editar."
            actions={
              <Button
                color="primary"
                size="sm"
                startContent={<PlusIcon className="h-4 w-4" />}
                onPress={openCreateModal}
              >
                Novo tipo
              </Button>
            }
          >
            {loadingData ? (
              <div className="flex items-center justify-center py-10">
                <Spinner label="Carregando tipos customizados..." size="lg" />
              </div>
            ) : filteredCustomizados.length > 0 ? (
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                {filteredCustomizados.map((tipo) => (
                  <PeopleEntityCard
                    key={tipo.id}
                    isPressable
                    onPress={() => openEditModal(tipo)}
                  >
                    <PeopleEntityCardBody className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-2">
                          <p className="text-sm font-semibold text-foreground">{tipo.nome}</p>
                          <div className="flex flex-wrap items-center gap-2">
                            <Chip
                              color={getCategoriaColor(tipo.categoria)}
                              size="sm"
                              variant="flat"
                            >
                              {formatCategoria(tipo.categoria, categorias)}
                            </Chip>
                            <Chip size="sm" variant="flat">
                              Ordem {tipo.ordem}
                            </Chip>
                            <Chip
                              color={tipo.ativo ? "success" : "default"}
                              size="sm"
                              variant="flat"
                            >
                              {tipo.ativo ? "Ativo" : "Inativo"}
                            </Chip>
                          </div>
                        </div>
                        <div
                          className="flex items-center gap-2"
                          data-stop-card-press="true"
                        >
                          <Button
                            isIconOnly
                            aria-label={`Editar ${tipo.nome}`}
                            size="sm"
                            variant="flat"
                            onPress={() => openEditModal(tipo)}
                          >
                            <PencilIcon className="h-4 w-4" />
                          </Button>
                          <Button
                            isIconOnly
                            aria-label={`Excluir ${tipo.nome}`}
                            color="danger"
                            isLoading={deletingId === tipo.id}
                            size="sm"
                            variant="flat"
                            onPress={() => handleDelete(tipo)}
                          >
                            <TrashIcon className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      {tipo.descricao ? (
                        <p className="line-clamp-2 text-xs text-default-400">{tipo.descricao}</p>
                      ) : (
                        <p className="text-xs text-default-500">Sem descrição cadastrada</p>
                      )}

                      <div
                        className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2"
                        data-stop-card-press="true"
                      >
                        <span className="text-xs text-default-500">
                          Disponível para seleção
                        </span>
                        <Switch
                          isDisabled={updatingCustomId === tipo.id}
                          isSelected={tipo.ativo}
                          size="sm"
                          onValueChange={(ativo) => handleToggleCustom(tipo, ativo)}
                        />
                      </div>
                    </PeopleEntityCardBody>
                  </PeopleEntityCard>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
                <p className="text-sm text-default-400">
                  Nenhum tipo customizado encontrado com os filtros atuais.
                </p>
                <Button
                  color="primary"
                  startContent={<PlusIcon className="h-4 w-4" />}
                  variant="flat"
                  onPress={openCreateModal}
                >
                  Criar primeiro tipo customizado
                </Button>
              </div>
            )}
          </PeoplePanel>
        </Tab>
      </Tabs>

      <Modal
        isDismissable={!savingForm}
        isOpen={modalOpen}
        size="2xl"
        onClose={closeModal}
      >
        <ModalContent>
          <ModalHeader>
            {editingId ? "Editar tipo customizado" : "Novo tipo customizado"}
          </ModalHeader>
          <ModalBody className="space-y-4">
            <Input
              isRequired
              description="Nome usado nas telas de criação de petições."
              label="Nome do tipo"
              placeholder="Ex.: Petição de prestação de contas"
              value={formData.nome}
              variant="bordered"
              onValueChange={(value) =>
                setFormData((prev) => ({ ...prev, nome: value }))
              }
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Select
                aria-label="Categoria do tipo de petição"
                isRequired
                items={categorias}
                label="Categoria"
                placeholder="Selecione a categoria"
                selectedKeys={formCategoriaKeys}
                variant="bordered"
                onSelectionChange={(keys) =>
                  setFormData((prev) => ({
                    ...prev,
                    categoria:
                      toSingleSelectionValue(keys as "all" | Set<React.Key>) ||
                      "OUTROS",
                  }))
                }
              >
                {(item) => (
                  <SelectItem key={item.value} textValue={item.label}>
                    {item.label}
                  </SelectItem>
                )}
              </Select>

              <Input
                description="Números menores aparecem primeiro."
                label="Ordem de exibição"
                min={0}
                placeholder="1000"
                type="number"
                value={String(formData.ordem)}
                variant="bordered"
                onChange={(event) =>
                  setFormData((prev) => ({
                    ...prev,
                    ordem: Number.parseInt(event.target.value || "1000", 10) || 1000,
                  }))
                }
              />
            </div>

            <Textarea
              description="Opcional. Ajuda o time a entender quando usar este tipo."
              label="Descrição interna"
              minRows={3}
              placeholder="Descreva contexto e finalidade deste tipo customizado."
              value={formData.descricao}
              variant="bordered"
              onValueChange={(value) =>
                setFormData((prev) => ({ ...prev, descricao: value }))
              }
            />

            <div className="rounded-xl border border-white/10 px-3 py-3">
              <Switch
                isSelected={formData.ativo}
                size="sm"
                onValueChange={(ativo) =>
                  setFormData((prev) => ({ ...prev, ativo }))
                }
              >
                Tipo ativo para uso imediato
              </Switch>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button isDisabled={savingForm} variant="light" onPress={closeModal}>
              Cancelar
            </Button>
            <Button color="primary" isLoading={savingForm} onPress={handleSubmit}>
              {editingId ? "Salvar alterações" : "Criar tipo"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </section>
  );
}
