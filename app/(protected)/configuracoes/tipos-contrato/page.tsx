"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  Building2,
  FileTextIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
} from "lucide-react";
import { toast } from "@/lib/toast";
import {
  createTipoContrato,
  deleteTipoContrato,
  listTiposContrato,
  updateTipoContrato,
} from "@/app/actions/tipos-contrato";
import {
  PeopleEntityCard,
  PeopleEntityCardBody,
  PeopleMetricCard,
  PeoplePageHeader,
  PeoplePanel,
} from "@/components/people-ui";

type TipoContratoItem = {
  id: string;
  tenantId: string | null;
  nome: string;
  slug: string;
  descricao: string | null;
  ordem: number | null;
  ativo: boolean;
  isGlobal?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  _count?: {
    contratos?: number;
    modelos?: number;
  };
};

type TipoContratoForm = {
  nome: string;
  slug: string;
  descricao: string;
  ordem: number;
  ativo: boolean;
};

const DEFAULT_FORM: TipoContratoForm = {
  nome: "",
  slug: "",
  descricao: "",
  ordem: 100,
  ativo: true,
};

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

export default function TiposContratoPage() {
  const [activeTab, setActiveTab] = useState<"globais" | "escritorio">(
    "escritorio",
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [apenasAtivos, setApenasAtivos] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingTipo, setEditingTipo] = useState<TipoContratoItem | null>(null);
  const [formData, setFormData] = useState<TipoContratoForm>(DEFAULT_FORM);

  const [savingForm, setSavingForm] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);

  const {
    data: tiposResult,
    isLoading,
    mutate,
  } = useSWR("configuracoes-tipos-contrato", () => listTiposContrato());

  const tipos = useMemo<TipoContratoItem[]>(
    () => (tiposResult?.success ? ((tiposResult.tipos as TipoContratoItem[]) ?? []) : []),
    [tiposResult],
  );

  const tiposGlobais = useMemo(
    () => tipos.filter((tipo) => Boolean(tipo.isGlobal)),
    [tipos],
  );
  const hasGlobais = tiposGlobais.length > 0;
  const tiposEscritorio = useMemo(
    () => tipos.filter((tipo) => !tipo.isGlobal),
    [tipos],
  );

  const termoFiltro = searchTerm.trim().toLowerCase();

  const filteredGlobais = useMemo(() => {
    return tiposGlobais.filter((tipo) => {
      if (apenasAtivos && !tipo.ativo) return false;
      if (!termoFiltro) return true;
      const haystack = `${tipo.nome} ${tipo.slug} ${tipo.descricao ?? ""}`.toLowerCase();
      return haystack.includes(termoFiltro);
    });
  }, [apenasAtivos, termoFiltro, tiposGlobais]);

  const filteredEscritorio = useMemo(() => {
    return tiposEscritorio.filter((tipo) => {
      if (apenasAtivos && !tipo.ativo) return false;
      if (!termoFiltro) return true;
      const haystack = `${tipo.nome} ${tipo.slug} ${tipo.descricao ?? ""}`.toLowerCase();
      return haystack.includes(termoFiltro);
    });
  }, [apenasAtivos, termoFiltro, tiposEscritorio]);

  const totalSemUso = useMemo(
    () =>
      tiposEscritorio.filter(
        (tipo) => (tipo._count?.contratos ?? 0) + (tipo._count?.modelos ?? 0) === 0,
      ).length,
    [tiposEscritorio],
  );

  useEffect(() => {
    if (!hasGlobais && activeTab === "globais") {
      setActiveTab("escritorio");
    }
  }, [activeTab, hasGlobais]);

  const openCreateModal = useCallback(() => {
    setEditingTipo(null);
    setFormData(DEFAULT_FORM);
    setModalOpen(true);
  }, []);

  const openEditModal = useCallback((tipo: TipoContratoItem) => {
    if (!tipo.canEdit) {
      toast.error("Tipos globais são somente leitura nesta tela");
      return;
    }

    setEditingTipo(tipo);
    setFormData({
      nome: tipo.nome,
      slug: tipo.slug,
      descricao: tipo.descricao ?? "",
      ordem: tipo.ordem ?? 100,
      ativo: tipo.ativo,
    });
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setEditingTipo(null);
    setFormData(DEFAULT_FORM);
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
      if (editingTipo) {
        const result = await updateTipoContrato(editingTipo.id, {
          nome: formData.nome,
          slug: formData.slug,
          descricao: formData.descricao || null,
          ordem: formData.ordem,
          ativo: formData.ativo,
        });

        if (!result.success) {
          toast.error(result.error || "Erro ao atualizar tipo de contrato");
          return;
        }

        toast.success("Tipo de contrato atualizado com sucesso");
        await mutate();
        closeModal();
        return;
      }

      const result = await createTipoContrato({
        nome: formData.nome,
        slug: formData.slug,
        descricao: formData.descricao || null,
        ordem: formData.ordem,
      });

      if (!result.success) {
        toast.error(result.error || "Erro ao criar tipo de contrato");
        return;
      }

      if (!formData.ativo && result.tipo?.id) {
        await updateTipoContrato(result.tipo.id, { ativo: false });
      }

      toast.success("Tipo de contrato criado com sucesso");
      await mutate();
      closeModal();
    } catch {
      toast.error("Erro inesperado ao salvar tipo de contrato");
    } finally {
      setSavingForm(false);
    }
  }, [closeModal, editingTipo, formData, mutate]);

  const handleDelete = useCallback(
    async (tipo: TipoContratoItem) => {
      if (!tipo.canDelete) {
        toast.error("Tipos globais não podem ser removidos nesta tela");
        return;
      }

      const confirmDelete = window.confirm(
        `Excluir o tipo "${tipo.nome}"? Esta ação não pode ser desfeita.`,
      );
      if (!confirmDelete) return;

      setDeletingId(tipo.id);
      try {
        const result = await deleteTipoContrato(tipo.id);
        if (!result.success) {
          toast.error(result.error || "Erro ao excluir tipo de contrato");
          return;
        }

        toast.success("Tipo de contrato removido com sucesso");
        await mutate();
      } catch {
        toast.error("Erro inesperado ao excluir tipo de contrato");
      } finally {
        setDeletingId(null);
      }
    },
    [mutate],
  );

  const handleToggleStatus = useCallback(
    async (tipo: TipoContratoItem, ativo: boolean) => {
      if (!tipo.canEdit) {
        toast.error("Tipos globais são somente leitura");
        return;
      }

      setUpdatingStatusId(tipo.id);
      try {
        const result = await updateTipoContrato(tipo.id, { ativo });
        if (!result.success) {
          toast.error(result.error || "Erro ao atualizar status do tipo");
          return;
        }
        toast.success(`Tipo ${ativo ? "ativado" : "desativado"} com sucesso`);
        await mutate();
      } catch {
        toast.error("Erro inesperado ao atualizar status");
      } finally {
        setUpdatingStatusId(null);
      }
    },
    [mutate],
  );

  return (
    <section className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-3 py-8 sm:px-6">
      <PeoplePageHeader
        tag="Administração"
        title="Tipos de contrato"
        description="Padronize os tipos usados nos contratos do escritório. Tipos globais ficam disponíveis em modo leitura e tipos do escritório podem ser gerenciados aqui."
        actions={
          <Button
            color="primary"
            radius="full"
            startContent={<PlusIcon className="h-4 w-4" />}
            onPress={openCreateModal}
          >
            Novo tipo do escritório
          </Button>
        }
      />

      <PeoplePanel
        title="Para que esta aba serve"
        description="Uso prático para não virar poluição visual."
      >
        <div className="space-y-2 text-sm text-default-300">
          <p>
            1. <span className="font-semibold text-foreground">Padronizar contratos</span>: o tipo organiza criação, filtros e relatórios financeiros.
          </p>
          <p>
            2. <span className="font-semibold text-foreground">Separar produtos jurídicos</span>: ex. Consultoria, Contencioso, Êxito, Mensalidade.
          </p>
          <p>
            3. <span className="font-semibold text-foreground">Evitar excesso</span>: se um tipo não tem uso (0 contratos e 0 modelos), revise ou remova.
          </p>
          <p>
            4. <span className="font-semibold text-foreground">Quando NÃO criar tipo novo</span>: diferença só de cliente ou de texto pontual não justifica novo tipo.
          </p>
        </div>
      </PeoplePanel>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <PeopleMetricCard
          helper="Todos os tipos disponíveis para seleção"
          icon={<FileTextIcon className="h-4 w-4" />}
          label="Total de tipos"
          tone="primary"
          value={tipos.length}
        />
        <PeopleMetricCard
          helper="Catálogo compartilhado do sistema"
          icon={<Building2 className="h-4 w-4" />}
          label="Tipos globais"
          tone="secondary"
          value={tiposGlobais.length}
        />
        <PeopleMetricCard
          helper="Tipos criados pelo escritório"
          icon={<PencilIcon className="h-4 w-4" />}
          label="Tipos do escritório"
          tone="success"
          value={tiposEscritorio.length}
        />
        <PeopleMetricCard
          helper="Tipos próprios sem contratos e sem modelos"
          icon={<FileTextIcon className="h-4 w-4" />}
          label="Sem uso"
          tone="warning"
          value={totalSemUso}
        />
      </div>

      <PeoplePanel
        title="Filtros"
        description="Pesquise por nome, slug ou descrição e restrinja para tipos ativos."
        actions={
          <Button
            isDisabled={!searchTerm && apenasAtivos}
            size="sm"
            variant="light"
            onPress={() => {
              setSearchTerm("");
              setApenasAtivos(true);
            }}
          >
            Limpar filtros
          </Button>
        }
      >
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <Input
            aria-label="Buscar tipo de contrato"
            placeholder="Buscar por nome, slug ou descrição"
            startContent={<SearchIcon className="h-4 w-4 text-default-400" />}
            value={searchTerm}
            variant="bordered"
            onValueChange={setSearchTerm}
          />
          <div className="flex items-center rounded-xl border border-white/10 px-3 lg:col-span-2">
            <Switch isSelected={apenasAtivos} size="sm" onValueChange={setApenasAtivos}>
              Mostrar apenas tipos ativos
            </Switch>
          </div>
        </div>
      </PeoplePanel>

      <Tabs
        aria-label="Abas de tipos de contrato"
        color="primary"
        selectedKey={activeTab}
        variant="underlined"
        onSelectionChange={(key) =>
          setActiveTab((key as "globais" | "escritorio") ?? "escritorio")
        }
      >
        <Tab
          key="escritorio"
          title={
            <div className="flex items-center gap-2">
              <PencilIcon className="h-4 w-4" />
              <span>Escritório ({filteredEscritorio.length})</span>
            </div>
          }
        >
          <PeoplePanel
            title="Tipos do escritório"
            description="Clique no card para editar. Tipos com contratos/modelos vinculados não podem ser removidos."
          >
            {isLoading ? (
              <div className="flex items-center justify-center py-10">
                <Spinner label="Carregando tipos do escritório..." size="lg" />
              </div>
            ) : filteredEscritorio.length > 0 ? (
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                {filteredEscritorio.map((tipo) => (
                  <PeopleEntityCard
                    key={tipo.id}
                    isPressable
                    onPress={() => openEditModal(tipo)}
                  >
                    <PeopleEntityCardBody className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-foreground">{tipo.nome}</p>
                          <p className="text-xs text-default-500">Slug: {tipo.slug}</p>
                        </div>
                        <div className="flex items-center gap-2" data-stop-card-press="true">
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

                      <div className="flex flex-wrap items-center gap-2">
                        <Chip color={tipo.ativo ? "success" : "default"} size="sm" variant="flat">
                          {tipo.ativo ? "Ativo" : "Inativo"}
                        </Chip>
                        <Chip size="sm" variant="flat">
                          Ordem {tipo.ordem ?? 0}
                        </Chip>
                        <Chip size="sm" variant="flat">
                          {tipo._count?.contratos ?? 0} contrato(s)
                        </Chip>
                        <Chip size="sm" variant="flat">
                          {tipo._count?.modelos ?? 0} modelo(s)
                        </Chip>
                      </div>

                      <div
                        className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2"
                        data-stop-card-press="true"
                      >
                        <span className="text-xs text-default-500">Disponível para uso</span>
                        <Switch
                          isDisabled={updatingStatusId === tipo.id}
                          isSelected={tipo.ativo}
                          size="sm"
                          onValueChange={(ativo) => handleToggleStatus(tipo, ativo)}
                        />
                      </div>
                    </PeopleEntityCardBody>
                  </PeopleEntityCard>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
                <p className="text-sm text-default-400">
                  Nenhum tipo do escritório encontrado com os filtros atuais.
                </p>
                <Button
                  color="primary"
                  startContent={<PlusIcon className="h-4 w-4" />}
                  variant="flat"
                  onPress={openCreateModal}
                >
                  Criar primeiro tipo
                </Button>
              </div>
            )}
          </PeoplePanel>
        </Tab>

        {hasGlobais ? (
          <Tab
            key="globais"
            title={
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                <span>Globais ({filteredGlobais.length})</span>
              </div>
            }
          >
            <PeoplePanel
              title="Catálogo global"
              description="Tipos globais são controlados pelo sistema e aparecem como somente leitura no escritório."
            >
              {isLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Spinner label="Carregando tipos globais..." size="lg" />
                </div>
              ) : filteredGlobais.length > 0 ? (
                <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                  {filteredGlobais.map((tipo) => (
                    <div
                      key={tipo.id}
                      className="rounded-xl border border-white/10 bg-background/60 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-foreground">{tipo.nome}</p>
                          <p className="text-xs text-default-500">Slug: {tipo.slug}</p>
                        </div>
                        <Chip color="secondary" size="sm" variant="flat">
                          Global
                        </Chip>
                      </div>
                      {tipo.descricao ? (
                        <p className="mt-2 line-clamp-2 text-xs text-default-400">
                          {tipo.descricao}
                        </p>
                      ) : null}
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Chip color={tipo.ativo ? "success" : "default"} size="sm" variant="flat">
                          {tipo.ativo ? "Ativo" : "Inativo"}
                        </Chip>
                        <Chip size="sm" variant="flat">
                          Ordem {tipo.ordem ?? 0}
                        </Chip>
                        <Chip size="sm" variant="flat">
                          {tipo._count?.contratos ?? 0} contrato(s)
                        </Chip>
                        <Chip size="sm" variant="flat">
                          {tipo._count?.modelos ?? 0} modelo(s)
                        </Chip>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center text-sm text-default-400">
                  Nenhum tipo global encontrado com os filtros atuais.
                </div>
              )}
            </PeoplePanel>
          </Tab>
        ) : null}
      </Tabs>

      <Modal isDismissable={!savingForm} isOpen={modalOpen} size="2xl" onClose={closeModal}>
        <ModalContent>
          <ModalHeader>
            {editingTipo ? "Editar tipo de contrato" : "Novo tipo de contrato"}
          </ModalHeader>
          <ModalBody className="space-y-4">
            <Input
              isRequired
              description="Nome exibido nos contratos e filtros do módulo financeiro."
              label="Nome do tipo"
              placeholder="Ex.: Honorários de consultoria"
              value={formData.nome}
              variant="bordered"
              onValueChange={(nome) =>
                setFormData((prev) => ({
                  ...prev,
                  nome,
                  slug: editingTipo ? prev.slug : toSlug(nome),
                }))
              }
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                isRequired
                description="Identificador técnico sem espaços."
                label="Slug"
                placeholder="honorarios-consultoria"
                value={formData.slug}
                variant="bordered"
                onValueChange={(slug) =>
                  setFormData((prev) => ({ ...prev, slug: toSlug(slug) }))
                }
              />
              <Input
                description="Números menores aparecem primeiro."
                label="Ordem"
                min={0}
                placeholder="100"
                type="number"
                value={String(formData.ordem)}
                variant="bordered"
                onChange={(event) =>
                  setFormData((prev) => ({
                    ...prev,
                    ordem: Number.parseInt(event.target.value || "100", 10) || 100,
                  }))
                }
              />
            </div>

            <Textarea
              description="Opcional. Descreva quando usar este tipo."
              label="Descrição interna"
              minRows={3}
              placeholder="Contexto de uso deste tipo de contrato."
              value={formData.descricao}
              variant="bordered"
              onValueChange={(descricao) =>
                setFormData((prev) => ({ ...prev, descricao }))
              }
            />

            <div className="rounded-xl border border-white/10 px-3 py-3">
              <Switch
                isSelected={formData.ativo}
                size="sm"
                onValueChange={(ativo) => setFormData((prev) => ({ ...prev, ativo }))}
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
              {editingTipo ? "Salvar alterações" : "Criar tipo"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </section>
  );
}
