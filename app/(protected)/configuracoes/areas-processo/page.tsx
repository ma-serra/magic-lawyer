"use client";

import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";
import { Button, Chip, Input, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, Spinner, Switch, Textarea } from "@heroui/react";
import { BriefcaseIcon, FileSearchIcon, PencilIcon, PlusIcon, SearchIcon, TrashIcon } from "lucide-react";
import { toast } from "@/lib/toast";
import {
  createAreaProcesso,
  deleteAreaProcesso,
  listAreasProcesso,
  updateAreaProcesso,
} from "@/app/actions/areas-processo";
import {
  PeopleEntityCard,
  PeopleEntityCardBody,
  PeopleMetricCard,
  PeoplePageHeader,
  PeoplePanel,
} from "@/components/people-ui";

type AreaProcessoItem = {
  id: string;
  nome: string;
  slug: string;
  descricao: string | null;
  ordem: number | null;
  ativo: boolean;
  _count?: {
    processos?: number;
  };
};

type AreaFormData = {
  nome: string;
  slug: string;
  descricao: string;
  ordem: number;
  ativo: boolean;
};

const DEFAULT_FORM: AreaFormData = {
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

export default function AreasProcessoPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [apenasAtivas, setApenasAtivas] = useState(true);
  const [apenasComUso, setApenasComUso] = useState(false);

  const [editingArea, setEditingArea] = useState<AreaProcessoItem | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [formData, setFormData] = useState<AreaFormData>(DEFAULT_FORM);

  const [savingForm, setSavingForm] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);

  const { data: areasData, isLoading, mutate } = useSWR(
    "configuracoes-areas-processo",
    () => listAreasProcesso(),
  );

  const areas = useMemo<AreaProcessoItem[]>(
    () => (areasData?.success ? ((areasData.areas as AreaProcessoItem[]) ?? []) : []),
    [areasData],
  );

  const termoFiltro = searchTerm.trim().toLowerCase();

  const filteredAreas = useMemo(() => {
    return areas.filter((area) => {
      if (apenasAtivas && !area.ativo) return false;
      if (apenasComUso && (area._count?.processos ?? 0) === 0) return false;
      if (!termoFiltro) return true;
      const haystack = `${area.nome} ${area.slug} ${area.descricao ?? ""}`.toLowerCase();
      return haystack.includes(termoFiltro);
    });
  }, [apenasAtivas, apenasComUso, areas, termoFiltro]);

  const totalProcessos = useMemo(
    () => areas.reduce((acc, area) => acc + (area._count?.processos ?? 0), 0),
    [areas],
  );
  const totalSemUso = useMemo(
    () => areas.filter((area) => (area._count?.processos ?? 0) === 0).length,
    [areas],
  );
  const totalAtivas = useMemo(
    () => areas.filter((area) => area.ativo).length,
    [areas],
  );

  const openCreateModal = useCallback(() => {
    setEditingArea(null);
    setFormData(DEFAULT_FORM);
    setModalOpen(true);
  }, []);

  const openEditModal = useCallback((area: AreaProcessoItem) => {
    setEditingArea(area);
    setFormData({
      nome: area.nome,
      slug: area.slug,
      descricao: area.descricao ?? "",
      ordem: area.ordem ?? 100,
      ativo: area.ativo,
    });
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setEditingArea(null);
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
      if (editingArea) {
        const result = await updateAreaProcesso(editingArea.id, {
          nome: formData.nome,
          slug: formData.slug,
          descricao: formData.descricao || null,
          ordem: formData.ordem,
          ativo: formData.ativo,
        });

        if (!result.success) {
          toast.error(result.error || "Erro ao atualizar área de processo");
          return;
        }

        toast.success("Área de processo atualizada com sucesso");
        await mutate();
        closeModal();
        return;
      }

      const result = await createAreaProcesso({
        nome: formData.nome,
        slug: formData.slug,
        descricao: formData.descricao || null,
        ordem: formData.ordem,
      });

      if (!result.success) {
        toast.error(result.error || "Erro ao criar área de processo");
        return;
      }

      if (!formData.ativo && result.area?.id) {
        await updateAreaProcesso(result.area.id, { ativo: false });
      }

      toast.success("Área de processo criada com sucesso");
      await mutate();
      closeModal();
    } catch {
      toast.error("Erro inesperado ao salvar área");
    } finally {
      setSavingForm(false);
    }
  }, [closeModal, editingArea, formData, mutate]);

  const handleDelete = useCallback(
    async (area: AreaProcessoItem) => {
      const confirmDelete = window.confirm(
        `Excluir a área "${area.nome}"? Esta ação não pode ser desfeita.`,
      );
      if (!confirmDelete) return;

      setDeletingId(area.id);
      try {
        const result = await deleteAreaProcesso(area.id);

        if (!result.success) {
          toast.error(result.error || "Erro ao excluir área de processo");
          return;
        }

        toast.success("Área de processo removida com sucesso");
        await mutate();
      } catch {
        toast.error("Erro inesperado ao excluir área");
      } finally {
        setDeletingId(null);
      }
    },
    [mutate],
  );

  const handleToggleStatus = useCallback(
    async (area: AreaProcessoItem, ativo: boolean) => {
      setUpdatingStatusId(area.id);
      try {
        const result = await updateAreaProcesso(area.id, { ativo });

        if (!result.success) {
          toast.error(result.error || "Erro ao atualizar status da área");
          return;
        }

        toast.success(`Área ${ativo ? "ativada" : "desativada"} com sucesso`);
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
        title="Áreas de processo"
        description="Organize os processos por área jurídica para melhorar busca, triagem, relatórios e regras operacionais do escritório."
        actions={
          <Button
            color="primary"
            radius="full"
            startContent={<PlusIcon className="h-4 w-4" />}
            onPress={openCreateModal}
          >
            Nova área
          </Button>
        }
      />

      <PeoplePanel
        title="Para que esta aba serve"
        description="Catálogo operacional usado nos processos. Impacta filtros, indicadores, cadastros e organização diária da equipe."
      >
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-content2/40 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">
              Organização
            </p>
            <p className="mt-1 text-xs text-default-400">
              Define áreas padronizadas para classificar processos e evitar cadastro
              inconsistente.
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-content2/40 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">
              Relatórios
            </p>
            <p className="mt-1 text-xs text-default-400">
              Permite medir volume por especialidade e acompanhar evolução da
              carteira por área jurídica.
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-content2/40 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">
              Governança
            </p>
            <p className="mt-1 text-xs text-default-400">
              Áreas em uso não podem ser excluídas nem desativadas para proteger
              integridade do histórico.
            </p>
          </div>
        </div>
      </PeoplePanel>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <PeopleMetricCard
          helper="Todas as áreas configuradas"
          icon={<BriefcaseIcon className="h-4 w-4" />}
          label="Total de áreas"
          tone="primary"
          value={areas.length}
        />
        <PeopleMetricCard
          helper="Áreas habilitadas para uso"
          icon={<PencilIcon className="h-4 w-4" />}
          label="Ativas"
          tone="success"
          value={totalAtivas}
        />
        <PeopleMetricCard
          helper="Processos vinculados às áreas"
          icon={<FileSearchIcon className="h-4 w-4" />}
          label="Processos mapeados"
          tone="secondary"
          value={totalProcessos}
        />
        <PeopleMetricCard
          helper="Áreas sem processo vinculado"
          icon={<TrashIcon className="h-4 w-4" />}
          label="Sem uso"
          tone="warning"
          value={totalSemUso}
        />
      </div>

      <PeoplePanel
        title="Filtros"
        description="Use os filtros para revisar catálogo ativo, áreas em uso e detectar itens sem movimentação."
        actions={
          <Button
            isDisabled={!searchTerm && apenasAtivas && !apenasComUso}
            size="sm"
            variant="light"
            onPress={() => {
              setSearchTerm("");
              setApenasAtivas(true);
              setApenasComUso(false);
            }}
          >
            Limpar filtros
          </Button>
        }
      >
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <Input
            aria-label="Buscar área de processo"
            placeholder="Buscar por nome, slug ou descrição"
            startContent={<SearchIcon className="h-4 w-4 text-default-400" />}
            value={searchTerm}
            variant="bordered"
            onValueChange={setSearchTerm}
          />
          <div className="flex items-center rounded-xl border border-white/10 px-3">
            <Switch isSelected={apenasAtivas} size="sm" onValueChange={setApenasAtivas}>
              Mostrar apenas áreas ativas
            </Switch>
          </div>
          <div className="flex items-center rounded-xl border border-white/10 px-3">
            <Switch isSelected={apenasComUso} size="sm" onValueChange={setApenasComUso}>
              Mostrar apenas áreas com uso
            </Switch>
          </div>
        </div>
      </PeoplePanel>

      <PeoplePanel
        title="Catálogo de áreas"
        description="Clique no card para editar. A exclusão é bloqueada quando há processos vinculados."
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Spinner label="Carregando áreas de processo..." size="lg" />
          </div>
        ) : filteredAreas.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {filteredAreas.map((area) => (
              <PeopleEntityCard key={area.id} isPressable onPress={() => openEditModal(area)}>
                <PeopleEntityCardBody className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{area.nome}</p>
                      <p className="text-xs text-default-500">Slug: {area.slug}</p>
                    </div>
                    <div className="flex items-center gap-2" data-stop-card-press="true">
                      <Button
                        isIconOnly
                        aria-label={`Editar ${area.nome}`}
                        size="sm"
                        variant="flat"
                        onPress={() => openEditModal(area)}
                      >
                        <PencilIcon className="h-4 w-4" />
                      </Button>
                      <Button
                        isIconOnly
                        aria-label={`Excluir ${area.nome}`}
                        color="danger"
                        isLoading={deletingId === area.id}
                        size="sm"
                        variant="flat"
                        onPress={() => handleDelete(area)}
                      >
                        <TrashIcon className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {area.descricao ? (
                    <p className="line-clamp-2 text-xs text-default-400">{area.descricao}</p>
                  ) : (
                    <p className="text-xs text-default-500">Sem descrição cadastrada</p>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    <Chip color={area.ativo ? "success" : "default"} size="sm" variant="flat">
                      {area.ativo ? "Ativa" : "Inativa"}
                    </Chip>
                    <Chip size="sm" variant="flat">
                      Ordem {area.ordem ?? 0}
                    </Chip>
                    <Chip size="sm" variant="flat">
                      {area._count?.processos ?? 0} processo(s)
                    </Chip>
                  </div>

                  <div
                    className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2"
                    data-stop-card-press="true"
                  >
                    <span className="text-xs text-default-500">
                      {area.ativo && (area._count?.processos ?? 0) > 0
                        ? "Área em uso: desative após desvincular processos"
                        : "Disponível para novos processos"}
                    </span>
                    <Switch
                      isDisabled={
                        updatingStatusId === area.id ||
                        (area.ativo && (area._count?.processos ?? 0) > 0)
                      }
                      isSelected={area.ativo}
                      size="sm"
                      onValueChange={(ativo) => handleToggleStatus(area, ativo)}
                    />
                  </div>
                </PeopleEntityCardBody>
              </PeopleEntityCard>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
            <p className="text-sm text-default-400">
              Nenhuma área encontrada com os filtros atuais.
            </p>
            <Button
              color="primary"
              startContent={<PlusIcon className="h-4 w-4" />}
              variant="flat"
              onPress={openCreateModal}
            >
              Criar primeira área
            </Button>
          </div>
        )}
      </PeoplePanel>

      <Modal isDismissable={!savingForm} isOpen={modalOpen} size="2xl" onClose={closeModal}>
        <ModalContent>
          <ModalHeader>
            {editingArea ? "Editar área de processo" : "Nova área de processo"}
          </ModalHeader>
          <ModalBody className="space-y-4">
            <Input
              isRequired
              description="Nome exibido no cadastro e filtros de processos."
              label="Nome da área"
              placeholder="Ex.: Direito Civil"
              value={formData.nome}
              variant="bordered"
              onValueChange={(nome) =>
                setFormData((prev) => ({
                  ...prev,
                  nome,
                  slug: editingArea ? prev.slug : toSlug(nome),
                }))
              }
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                isRequired
                description="Identificador técnico usado internamente."
                label="Slug"
                placeholder="direito-civil"
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
              description="Opcional. Ajuda o time a entender quando usar esta área."
              label="Descrição interna"
              minRows={3}
              placeholder="Descreva escopo e contexto desta área."
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
                Área ativa para novos processos
              </Switch>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button isDisabled={savingForm} variant="light" onPress={closeModal}>
              Cancelar
            </Button>
            <Button color="primary" isLoading={savingForm} onPress={handleSubmit}>
              {editingArea ? "Salvar alterações" : "Criar área"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </section>
  );
}
