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
  Spinner,
  Switch,
  Tab,
  Tabs,
  Textarea,
} from "@heroui/react";
import {
  FileStackIcon,
  GlobeIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  TrashIcon,
} from "lucide-react";

import { toast } from "@/lib/toast";
import {
  configurarClassesProcessuaisGlobaisTenant,
  createClasseProcessual,
  deleteClasseProcessual,
  listClassesProcessuaisConfiguracaoTenant,
  listarClassesProcessuaisGlobais,
  updateClasseProcessual,
} from "@/app/actions/classes-processuais";
import {
  PeopleEntityCard,
  PeopleEntityCardBody,
  PeopleMetricCard,
  PeoplePageHeader,
  PeoplePanel,
} from "@/components/people-ui";

type ClasseGlobal = {
  id: string;
  slug: string;
  nome: string;
  descricao: string | null;
  ordem: number | null;
  ativo: boolean;
  global: boolean;
};

type ClasseTenant = ClasseGlobal & {
  tenantId: string | null;
};

type ClasseFormData = {
  nome: string;
  slug: string;
  descricao: string;
  ordem: number;
  ativo: boolean;
};

const DEFAULT_FORM: ClasseFormData = {
  nome: "",
  slug: "",
  descricao: "",
  ordem: 1000,
  ativo: true,
};

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function toSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export default function ClassesProcessuaisPage() {
  const [activeTab, setActiveTab] = useState<"globais" | "customizadas">(
    "globais",
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [somenteAtivasCustomizadas, setSomenteAtivasCustomizadas] =
    useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<ClasseFormData>(DEFAULT_FORM);
  const [savingForm, setSavingForm] = useState(false);
  const [updatingGlobalId, setUpdatingGlobalId] = useState<string | null>(null);
  const [updatingCustomId, setUpdatingCustomId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const {
    data: globaisResult,
    isLoading: loadingGlobais,
    mutate: mutateGlobais,
  } = useSWR("classes-processuais-globais", () => listarClassesProcessuaisGlobais());
  const {
    data: tenantResult,
    isLoading: loadingTenant,
    mutate: mutateTenant,
  } = useSWR("classes-processuais-tenant", () =>
    listClassesProcessuaisConfiguracaoTenant(),
  );

  const loadingData = loadingGlobais || loadingTenant;

  const classesGlobais = useMemo<ClasseGlobal[]>(
    () =>
      globaisResult?.success
        ? ((globaisResult.data as ClasseGlobal[]) ?? [])
        : [],
    [globaisResult],
  );

  const classesTenant = useMemo<ClasseTenant[]>(
    () =>
      tenantResult?.success
        ? ((tenantResult.data as ClasseTenant[]) ?? [])
        : [],
    [tenantResult],
  );

  const tenantOverrideBySlug = useMemo(() => {
    const map = new Map<string, ClasseTenant>();

    for (const item of classesTenant) {
      map.set(item.slug, item);
    }

    return map;
  }, [classesTenant]);

  const slugsGlobais = useMemo(
    () => new Set(classesGlobais.map((item) => item.slug)),
    [classesGlobais],
  );

  const classesCustomizadas = useMemo(
    () =>
      classesTenant.filter(
        (item) => item.tenantId && !item.global && !slugsGlobais.has(item.slug),
      ),
    [classesTenant, slugsGlobais],
  );

  const normalizedSearch = searchTerm.trim().toLowerCase();

  const filteredGlobais = useMemo(() => {
    return classesGlobais.filter((item) => {
      if (!normalizedSearch) return true;

      const haystack =
        `${item.nome} ${item.slug} ${item.descricao ?? ""}`.toLowerCase();

      return haystack.includes(normalizedSearch);
    });
  }, [classesGlobais, normalizedSearch]);

  const filteredCustomizadas = useMemo(() => {
    return classesCustomizadas.filter((item) => {
      if (somenteAtivasCustomizadas && !item.ativo) {
        return false;
      }

      if (!normalizedSearch) return true;

      const haystack =
        `${item.nome} ${item.slug} ${item.descricao ?? ""}`.toLowerCase();

      return haystack.includes(normalizedSearch);
    });
  }, [classesCustomizadas, normalizedSearch, somenteAtivasCustomizadas]);

  const totalGlobaisAtivas = useMemo(
    () =>
      classesGlobais.filter((item) => {
        const override = tenantOverrideBySlug.get(item.slug);
        return override?.ativo ?? true;
      }).length,
    [classesGlobais, tenantOverrideBySlug],
  );

  const totalCustomizadasAtivas = useMemo(
    () => classesCustomizadas.filter((item) => item.ativo).length,
    [classesCustomizadas],
  );

  const totalOverrideDesativadas = useMemo(
    () =>
      classesTenant.filter(
        (item) => slugsGlobais.has(item.slug) && item.ativo === false,
      ).length,
    [classesTenant, slugsGlobais],
  );

  const resetForm = useCallback(() => {
    setEditingId(null);
    setFormData(DEFAULT_FORM);
  }, []);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    resetForm();
  }, [resetForm]);

  const refreshData = useCallback(async () => {
    await Promise.all([mutateGlobais(), mutateTenant()]);
  }, [mutateGlobais, mutateTenant]);

  const openCreateModal = useCallback(() => {
    resetForm();
    setModalOpen(true);
  }, [resetForm]);

  const openEditModal = useCallback((item: ClasseTenant) => {
    setEditingId(item.id);
    setFormData({
      nome: item.nome,
      slug: item.slug,
      descricao: item.descricao ?? "",
      ordem: item.ordem ?? 1000,
      ativo: item.ativo,
    });
    setModalOpen(true);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!formData.nome.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }

    if (!formData.slug.trim()) {
      toast.error("Slug é obrigatório");
      return;
    }

    setSavingForm(true);
    try {
      if (editingId) {
        const result = await updateClasseProcessual(editingId, {
          nome: formData.nome,
          slug: formData.slug,
          descricao: formData.descricao || null,
          ordem: formData.ordem,
          ativo: formData.ativo,
        });

        if (!result.success) {
          toast.error(result.error || "Erro ao atualizar classe processual");
          return;
        }

        toast.success("Classe processual atualizada com sucesso");
        await refreshData();
        closeModal();
        return;
      }

      const result = await createClasseProcessual({
        nome: formData.nome,
        slug: formData.slug,
        descricao: formData.descricao || null,
        ordem: formData.ordem,
      });

      if (!result.success) {
        toast.error(result.error || "Erro ao criar classe processual");
        return;
      }

      if (!formData.ativo && result.data?.id) {
        await updateClasseProcessual(result.data.id, { ativo: false });
      }

      toast.success("Classe processual criada com sucesso");
      await refreshData();
      closeModal();
    } catch {
      toast.error("Erro inesperado ao salvar classe processual");
    } finally {
      setSavingForm(false);
    }
  }, [closeModal, editingId, formData, refreshData]);

  const handleToggleGlobal = useCallback(
    async (item: ClasseGlobal, ativo: boolean) => {
      setUpdatingGlobalId(item.id);
      try {
        const result = await configurarClassesProcessuaisGlobaisTenant(
          item.id,
          ativo,
        );

        if (!result.success) {
          toast.error(result.error || "Erro ao atualizar classe padrão");
          return;
        }

        toast.success(
          `Classe padrão ${ativo ? "ativada" : "desativada"} no escritório`,
        );
        await refreshData();
      } catch {
        toast.error("Erro inesperado ao atualizar classe padrão");
      } finally {
        setUpdatingGlobalId(null);
      }
    },
    [refreshData],
  );

  const handleToggleCustom = useCallback(
    async (item: ClasseTenant, ativo: boolean) => {
      setUpdatingCustomId(item.id);
      try {
        const result = await updateClasseProcessual(item.id, { ativo });

        if (!result.success) {
          toast.error(result.error || "Erro ao atualizar classe processual");
          return;
        }

        toast.success(`Classe ${ativo ? "ativada" : "desativada"} com sucesso`);
        await refreshData();
      } catch {
        toast.error("Erro inesperado ao atualizar classe processual");
      } finally {
        setUpdatingCustomId(null);
      }
    },
    [refreshData],
  );

  const handleDelete = useCallback(
    async (item: ClasseTenant) => {
      const confirmed = window.confirm(
        `Excluir a classe processual "${item.nome}"?`,
      );

      if (!confirmed) return;

      setDeletingId(item.id);
      try {
        const result = await deleteClasseProcessual(item.id);

        if (!result.success) {
          toast.error(result.error || "Erro ao excluir classe processual");
          return;
        }

        toast.success("Classe processual removida com sucesso");
        await refreshData();
      } catch {
        toast.error("Erro inesperado ao excluir classe processual");
      } finally {
        setDeletingId(null);
      }
    },
    [refreshData],
  );

  return (
    <section className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-3 py-8 sm:px-6">
      <PeoplePageHeader
        tag="Configurações"
        title="Classes processuais"
        description="Padronize as classes usadas no cadastro de processos. O catálogo mistura padrões base e classes customizadas do seu escritório."
        actions={
          <Button
            color="primary"
            radius="full"
            startContent={<PlusIcon className="h-4 w-4" />}
            onPress={openCreateModal}
          >
            Nova classe
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <PeopleMetricCard
          helper="Catálogo base disponível"
          icon={<GlobeIcon className="h-4 w-4" />}
          label="Padrões"
          tone="primary"
          value={classesGlobais.length}
        />
        <PeopleMetricCard
          helper="Padrões ativos neste escritório"
          icon={<FileStackIcon className="h-4 w-4" />}
          label="Padrões ativos"
          tone="success"
          value={totalGlobaisAtivas}
        />
        <PeopleMetricCard
          helper="Criadas pelo escritório"
          icon={<PlusIcon className="h-4 w-4" />}
          label="Customizadas"
          tone="secondary"
          value={classesCustomizadas.length}
        />
        <PeopleMetricCard
          helper="Padrões desligados localmente"
          icon={<SlidersHorizontalIcon className="h-4 w-4" />}
          label="Overrides"
          tone="warning"
          value={totalOverrideDesativadas}
        />
      </div>

      <PeoplePanel
        title="Como usar"
        description="Os padrões ajudam no preenchimento rápido do processo. As classes customizadas cobrem teses internas, variações do escritório e nomenclaturas próprias."
      >
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-default-200/70 bg-content1/60 p-4 dark:border-white/10 dark:bg-white/[0.03]">
            <p className="text-sm font-semibold text-foreground">Padrões</p>
            <p className="mt-2 text-sm text-default-500">
              Entram no select de processos e podem ser ligados ou desligados por escritório.
            </p>
          </div>
          <div className="rounded-2xl border border-default-200/70 bg-content1/60 p-4 dark:border-white/10 dark:bg-white/[0.03]">
            <p className="text-sm font-semibold text-foreground">Customizadas</p>
            <p className="mt-2 text-sm text-default-500">
              Classes próprias do escritório, com nome, slug, ordem e descrição.
            </p>
          </div>
          <div className="rounded-2xl border border-default-200/70 bg-content1/60 p-4 dark:border-white/10 dark:bg-white/[0.03]">
            <p className="text-sm font-semibold text-foreground">Reflexo no processo</p>
            <p className="mt-2 text-sm text-default-500">
              O formulário passa a usar esse catálogo em vez de texto livre.
            </p>
          </div>
        </div>
      </PeoplePanel>

      <PeoplePanel
        title="Catálogo"
        description="Pesquise, ative padrões e mantenha o escritório com um vocabulário consistente."
      >
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <Input
            className="max-w-xl"
            placeholder="Buscar por nome, slug ou descrição"
            startContent={<SearchIcon className="h-4 w-4 text-default-400" />}
            value={searchTerm}
            onValueChange={setSearchTerm}
          />
          {activeTab === "customizadas" ? (
            <Switch
              isSelected={somenteAtivasCustomizadas}
              onValueChange={setSomenteAtivasCustomizadas}
            >
              Somente customizadas ativas
            </Switch>
          ) : null}
        </div>

        <Tabs
          className="mt-6"
          selectedKey={activeTab}
          variant="underlined"
          onSelectionChange={(key) =>
            setActiveTab(String(key) as "globais" | "customizadas")
          }
        >
          <Tab key="globais" title="Padrões">
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {loadingData ? (
                <div className="col-span-full flex items-center justify-center py-12">
                  <Spinner />
                </div>
              ) : filteredGlobais.length === 0 ? (
                <div className="col-span-full rounded-2xl border border-dashed border-default-200/70 p-8 text-sm text-default-500 dark:border-white/10">
                  Nenhuma classe padrão encontrada.
                </div>
              ) : (
                filteredGlobais.map((item) => {
                  const override = tenantOverrideBySlug.get(item.slug);
                  const ativoNoTenant = override?.ativo ?? true;

                  return (
                    <PeopleEntityCard key={item.id}>
                      <PeopleEntityCardBody className="space-y-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-base font-semibold text-foreground">
                                {item.nome}
                              </h3>
                              <Chip color="primary" size="sm" variant="flat">
                                Padrão
                              </Chip>
                              {ativoNoTenant ? (
                                <Chip color="success" size="sm" variant="flat">
                                  Ativa
                                </Chip>
                              ) : (
                                <Chip color="default" size="sm" variant="flat">
                                  Desativada
                                </Chip>
                              )}
                            </div>
                            <p className="text-xs text-default-500">
                              slug: {item.slug}
                            </p>
                          </div>
                          <Switch
                            isDisabled={updatingGlobalId === item.id}
                            isSelected={ativoNoTenant}
                            size="sm"
                            onValueChange={(checked) =>
                              handleToggleGlobal(item, checked)
                            }
                          />
                        </div>
                        <p className="text-sm text-default-500">
                          {item.descricao || "Sem descrição cadastrada."}
                        </p>
                      </PeopleEntityCardBody>
                    </PeopleEntityCard>
                  );
                })
              )}
            </div>
          </Tab>

          <Tab key="customizadas" title="Customizadas">
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {loadingData ? (
                <div className="col-span-full flex items-center justify-center py-12">
                  <Spinner />
                </div>
              ) : filteredCustomizadas.length === 0 ? (
                <div className="col-span-full rounded-2xl border border-dashed border-default-200/70 p-8 text-sm text-default-500 dark:border-white/10">
                  Nenhuma classe customizada encontrada.
                </div>
              ) : (
                filteredCustomizadas.map((item) => (
                  <PeopleEntityCard key={item.id}>
                    <PeopleEntityCardBody className="space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-semibold text-foreground">
                              {item.nome}
                            </h3>
                            <Chip color="secondary" size="sm" variant="flat">
                              Customizada
                            </Chip>
                            {item.ativo ? (
                              <Chip color="success" size="sm" variant="flat">
                                Ativa
                              </Chip>
                            ) : (
                              <Chip color="default" size="sm" variant="flat">
                                Inativa
                              </Chip>
                            )}
                          </div>
                          <p className="text-xs text-default-500">
                            slug: {item.slug}
                          </p>
                        </div>
                        <Switch
                          isDisabled={updatingCustomId === item.id}
                          isSelected={item.ativo}
                          size="sm"
                          onValueChange={(checked) =>
                            handleToggleCustom(item, checked)
                          }
                        />
                      </div>
                      <p className="text-sm text-default-500">
                        {item.descricao || "Sem descrição cadastrada."}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          startContent={<PencilIcon className="h-4 w-4" />}
                          variant="flat"
                          onPress={() => openEditModal(item)}
                        >
                          Editar
                        </Button>
                        <Button
                          color="danger"
                          isDisabled={deletingId === item.id}
                          size="sm"
                          startContent={<TrashIcon className="h-4 w-4" />}
                          variant="light"
                          onPress={() => handleDelete(item)}
                        >
                          Excluir
                        </Button>
                      </div>
                    </PeopleEntityCardBody>
                  </PeopleEntityCard>
                ))
              )}
            </div>
          </Tab>
        </Tabs>
      </PeoplePanel>

      <Modal isOpen={modalOpen} size="2xl" onOpenChange={setModalOpen}>
        <ModalContent>
          <ModalHeader>
            {editingId ? "Editar classe processual" : "Nova classe processual"}
          </ModalHeader>
          <ModalBody className="space-y-4">
            <Input
              isRequired
              label="Nome"
              placeholder="Ex: Procedimento comum estratégico"
              value={formData.nome}
              onValueChange={(value) =>
                setFormData((prev) => ({
                  ...prev,
                  nome: value,
                  slug: editingId ? prev.slug : toSlug(value),
                }))
              }
            />
            <Input
              isRequired
              label="Slug"
              placeholder="procedimento-comum-estrategico"
              value={formData.slug}
              onValueChange={(value) =>
                setFormData((prev) => ({ ...prev, slug: toSlug(value) }))
              }
            />
            <Input
              label="Ordem"
              type="number"
              value={String(formData.ordem)}
              onValueChange={(value) =>
                setFormData((prev) => ({
                  ...prev,
                  ordem: Number(value || 0),
                }))
              }
            />
            <Textarea
              label="Descrição"
              minRows={3}
              placeholder="Explique quando essa classe deve ser usada."
              value={formData.descricao}
              onValueChange={(value) =>
                setFormData((prev) => ({ ...prev, descricao: value }))
              }
            />
            <Switch
              isSelected={formData.ativo}
              onValueChange={(checked) =>
                setFormData((prev) => ({ ...prev, ativo: checked }))
              }
            >
              Criar já como ativa
            </Switch>
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={closeModal}>
              Cancelar
            </Button>
            <Button
              color="primary"
              isLoading={savingForm}
              onPress={handleSubmit}
            >
              {editingId ? "Salvar alterações" : "Criar classe"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </section>
  );
}
