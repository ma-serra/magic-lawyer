"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Input,
  Spinner,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Select,
  SelectItem,
  Textarea,
  Checkbox,
} from "@heroui/react";
import {
  AlertCircle,
  Copy,
  Edit,
  Eye,
  FileCheck,
  FileText,
  Filter,
  MoreVertical,
  Plus,
  Power,
  PowerOff,
  Search,
  Trash2,
  Variable,
} from "lucide-react";
import { toast } from "@/lib/toast";

import {
  deleteModeloPeticao,
  duplicateModeloPeticao,
  toggleModeloPeticaoStatus,
  updateModeloPeticao,
  type ModeloPeticaoFilters,
  type ModeloPeticaoListItem,
} from "@/app/actions/modelos-peticao";
import {
  useCategoriasModeloPeticao,
  useModelosPeticao,
  useTiposModeloPeticao,
} from "@/app/hooks/use-modelos-peticao";
import { PeopleMetricCard, PeoplePageHeader } from "@/components/people-ui";
import {
  mergeModeloPeticaoVariaveisWithConteudo,
  normalizeModeloPeticaoVariaveis,
  type ModeloPeticaoVariavel,
} from "@/components/modelos-peticao/modelo-peticao-document-workspace";

type ModeloPeticaoCardItem = ModeloPeticaoListItem & {
  conteudo?: string;
  variaveis?: unknown;
};

interface EditModeloFormState {
  nome: string;
  descricao: string;
  categoria: string;
  tipo: string;
  conteudo: string;
  ativo: boolean;
  publico: boolean;
}

const EMPTY_EDIT_FORM: EditModeloFormState = {
  nome: "",
  descricao: "",
  categoria: "",
  tipo: "",
  conteudo: "",
  ativo: true,
  publico: false,
};

function extractVariaveis(modelo: ModeloPeticaoCardItem): string[] {
  const names = new Set<string>();

  if (Array.isArray(modelo.variaveis)) {
    for (const entry of modelo.variaveis) {
      if (typeof entry === "string" && entry.trim()) {
        names.add(entry.trim());
      } else if (
        entry &&
        typeof entry === "object" &&
        "nome" in entry &&
        typeof entry.nome === "string" &&
        entry.nome.trim()
      ) {
        names.add(entry.nome.trim());
      }
    }
  }

  if (modelo.conteudo) {
    const matches = modelo.conteudo.matchAll(/{{\s*([^{}]+?)\s*}}/g);
    for (const match of matches) {
      const raw = match[1]?.trim();
      if (raw) {
        names.add(raw);
      }
    }
  }

  return Array.from(names);
}

export default function ModelosPeticaoPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [filtros, setFiltros] = useState<ModeloPeticaoFilters>({
    search: "",
    categoria: undefined,
    tipo: undefined,
    ativo: undefined,
  });
  const [mostrarFiltros, setMostrarFiltros] = useState(false);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [modeloToDelete, setModeloToDelete] = useState<ModeloPeticaoCardItem | null>(null);

  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedModelo, setSelectedModelo] = useState<ModeloPeticaoCardItem | null>(
    null,
  );
  const [editForm, setEditForm] = useState<EditModeloFormState>(EMPTY_EDIT_FORM);
  const [editVariaveis, setEditVariaveis] = useState<ModeloPeticaoVariavel[]>([]);

  const { modelos, isLoading, isError, error, mutate } = useModelosPeticao(filtros);
  const { categorias } = useCategoriasModeloPeticao();
  const { tipos } = useTiposModeloPeticao();

  const modelosLista = useMemo(
    () => ((modelos || []) as ModeloPeticaoCardItem[]),
    [modelos],
  );

  const resumo = useMemo(() => {
    const total = modelosLista.length;
    const ativos = modelosLista.filter((modelo) => modelo.ativo).length;
    const inativos = total - ativos;
    const publicos = modelosLista.filter((modelo) => modelo.publico).length;
    const emUso = modelosLista.filter(
      (modelo) => (modelo._count?.peticoes || 0) > 0,
    ).length;

    return { total, ativos, inativos, publicos, emUso };
  }, [modelosLista]);

  const categoriaSet = useMemo(() => new Set(categorias), [categorias]);
  const tipoSet = useMemo(() => new Set(tipos), [tipos]);

  const selectedCategoriaKey =
    filtros.categoria && categoriaSet.has(filtros.categoria)
      ? filtros.categoria
      : "all";
  const selectedTipoKey =
    filtros.tipo && tipoSet.has(filtros.tipo) ? filtros.tipo : "all";
  const selectedStatusKey =
    filtros.ativo === true ? "ativo" : filtros.ativo === false ? "inativo" : "all";

  const categoriaItems = useMemo(
    () => [
      { key: "all", label: "Todas" },
      ...categorias.map((categoria) => ({ key: categoria, label: categoria })),
    ],
    [categorias],
  );
  const tipoItems = useMemo(
    () => [{ key: "all", label: "Todos" }, ...tipos.map((tipo) => ({ key: tipo, label: tipo }))],
    [tipos],
  );
  const statusItems = useMemo(
    () => [
      { key: "all", label: "Todos" },
      { key: "ativo", label: "Ativo" },
      { key: "inativo", label: "Inativo" },
    ],
    [],
  );

  const temFiltrosAtivos = Boolean(
    filtros.search || filtros.categoria || filtros.tipo || filtros.ativo !== undefined,
  );

  const selectedVariaveis = useMemo(() => {
    if (!selectedModelo) return [];
    return extractVariaveis(selectedModelo);
  }, [selectedModelo]);

  const limparFiltros = () => {
    setFiltros({
      search: "",
      categoria: undefined,
      tipo: undefined,
      ativo: undefined,
    });
  };

  const openViewModal = (modelo: ModeloPeticaoCardItem) => {
    setSelectedModelo(modelo);
    setViewModalOpen(true);
  };

  const openEditModal = (modelo: ModeloPeticaoCardItem) => {
    setSelectedModelo(modelo);
    setEditForm({
      nome: modelo.nome || "",
      descricao: modelo.descricao || "",
      categoria: modelo.categoria || "",
      tipo: modelo.tipo || "",
      conteudo: modelo.conteudo || "",
      ativo: Boolean(modelo.ativo),
      publico: Boolean(modelo.publico),
    });
    setEditVariaveis(normalizeModeloPeticaoVariaveis(modelo.variaveis));
    setEditModalOpen(true);
  };

  const handleDuplicate = async (id: string) => {
    startTransition(async () => {
      const result = await duplicateModeloPeticao(id);

      if (result.success) {
        toast.success("Modelo duplicado com sucesso!");
        mutate();
      } else {
        toast.error(result.error || "Erro ao duplicar modelo");
      }
    });
  };

  const handleToggleStatus = async (id: string) => {
    startTransition(async () => {
      const result = await toggleModeloPeticaoStatus(id);

      if (result.success) {
        toast.success(
          result.data?.ativo
            ? "Modelo ativado com sucesso!"
            : "Modelo desativado com sucesso!",
        );
        mutate();
      } else {
        toast.error(result.error || "Erro ao alterar status do modelo");
      }
    });
  };

  const handleDelete = async () => {
    if (!modeloToDelete?.id) return;

    startTransition(async () => {
      const result = await deleteModeloPeticao(modeloToDelete.id);

      if (result.success) {
        toast.success("Modelo excluído com sucesso!");
        setDeleteModalOpen(false);
        setModeloToDelete(null);
        mutate();
      } else {
        toast.error(result.error || "Erro ao excluir modelo");
      }
    });
  };

  const handleSaveEdit = async () => {
    if (!selectedModelo?.id) return;

    if (!editForm.nome.trim()) {
      toast.error("Informe o nome do modelo");
      return;
    }

    if (!editForm.conteudo.trim()) {
      toast.error("Informe o conteúdo do modelo");
      return;
    }

    startTransition(async () => {
      const mergedVariaveis = mergeModeloPeticaoVariaveisWithConteudo(
        editVariaveis,
        editForm.conteudo,
      );

      const result = await updateModeloPeticao(selectedModelo.id, {
        nome: editForm.nome.trim(),
        descricao: editForm.descricao.trim() || null,
        categoria: editForm.categoria.trim() || null,
        tipo: editForm.tipo.trim() || null,
        conteudo: editForm.conteudo,
        variaveis: mergedVariaveis,
        ativo: editForm.ativo,
        publico: editForm.publico,
      });

      if (result.success) {
        toast.success("Modelo atualizado com sucesso!");
        setEditModalOpen(false);
        setSelectedModelo(null);
        setEditVariaveis([]);
        mutate();
      } else {
        toast.error(result.error || "Erro ao atualizar modelo");
      }
    });
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-[1600px] p-6">
        <div className="flex min-h-[400px] items-center justify-center">
          <Spinner label="Carregando modelos..." size="lg" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="mx-auto max-w-[1600px] p-6">
        <div className="flex min-h-[400px] flex-col items-center justify-center space-y-4">
          <AlertCircle className="h-12 w-12 text-danger" />
          <p className="text-danger">Erro ao carregar modelos de petição</p>
          <p className="text-sm text-default-500">{error?.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-6">
      <PeoplePageHeader
        tag="Atividades jurídicas"
        title="Modelos de Petição"
        description={`${resumo.total} modelos no resultado atual${temFiltrosAtivos ? " (filtrado)" : ""}`}
        actions={
          <>
            <div className="flex items-center rounded-xl border border-default-200 bg-content1 p-0.5">
              <Button
                as={Link}
                href="/peticoes"
                size="sm"
                variant="light"
              >
                Petições
              </Button>
              <Button color="primary" size="sm" variant="solid">
                Modelos
              </Button>
            </div>
            <Button
              size="sm"
              startContent={<Filter className="h-4 w-4" />}
              variant="bordered"
              onPress={() => setMostrarFiltros((prev) => !prev)}
            >
              Filtros
            </Button>
            <Button
              color="primary"
              size="sm"
              startContent={<Plus className="h-4 w-4" />}
              onPress={() => router.push("/modelos-peticao/novo")}
            >
              Novo Modelo
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <PeopleMetricCard
          helper="Biblioteca atual"
          icon={<FileText className="h-4 w-4" />}
          label="Total de modelos"
          tone="primary"
          value={resumo.total}
        />
        <PeopleMetricCard
          helper={`${resumo.inativos} inativo(s)`}
          icon={<Power className="h-4 w-4" />}
          label="Modelos ativos"
          tone="success"
          value={resumo.ativos}
        />
        <PeopleMetricCard
          helper="Vinculados a petições"
          icon={<FileCheck className="h-4 w-4" />}
          label="Modelos em uso"
          tone="warning"
          value={resumo.emUso}
        />
        <PeopleMetricCard
          helper="Compartilhamento habilitado"
          icon={<Variable className="h-4 w-4" />}
          label="Modelos públicos"
          tone="secondary"
          value={resumo.publicos}
        />
      </div>

      <Card className="border border-white/10 bg-background/70">
        <CardBody className="space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              isClearable
              className="min-w-[260px] flex-1"
              placeholder="Buscar por nome, descrição ou categoria..."
              startContent={<Search className="h-4 w-4 text-default-400" />}
              value={filtros.search || ""}
              onClear={() => setFiltros((prev) => ({ ...prev, search: "" }))}
              onValueChange={(value) =>
                setFiltros((prev) => ({ ...prev, search: value }))
              }
            />
            {temFiltrosAtivos ? (
              <Button size="sm" variant="light" onPress={limparFiltros}>
                Limpar filtros
              </Button>
            ) : null}
          </div>

          {mostrarFiltros ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <Select
                items={categoriaItems}
                label="Categoria"
                selectedKeys={[selectedCategoriaKey]}
                onSelectionChange={(keys) => {
                  const value = String(Array.from(keys)[0] || "all");
                  setFiltros((prev) => ({
                    ...prev,
                    categoria: value === "all" ? undefined : value,
                  }));
                }}
              >
                {(item) => (
                  <SelectItem key={item.key} textValue={item.label}>
                    {item.label}
                  </SelectItem>
                )}
              </Select>

              <Select
                items={tipoItems}
                label="Tipo"
                selectedKeys={[selectedTipoKey]}
                onSelectionChange={(keys) => {
                  const value = String(Array.from(keys)[0] || "all");
                  setFiltros((prev) => ({
                    ...prev,
                    tipo: value === "all" ? undefined : value,
                  }));
                }}
              >
                {(item) => (
                  <SelectItem key={item.key} textValue={item.label}>
                    {item.label}
                  </SelectItem>
                )}
              </Select>

              <Select
                items={statusItems}
                label="Status"
                selectedKeys={[selectedStatusKey]}
                onSelectionChange={(keys) => {
                  const value = String(Array.from(keys)[0] || "all");
                  setFiltros((prev) => ({
                    ...prev,
                    ativo:
                      value === "ativo"
                        ? true
                        : value === "inativo"
                          ? false
                          : undefined,
                  }));
                }}
              >
                {(item) => (
                  <SelectItem key={item.key} textValue={item.label}>
                    {item.label}
                  </SelectItem>
                )}
              </Select>
            </div>
          ) : null}
        </CardBody>
      </Card>

      <Card className="border border-white/10 bg-background/70">
        <CardHeader className="border-b border-white/10 px-5 py-4">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-white">
              Biblioteca de modelos ({resumo.total})
            </h2>
            <p className="text-sm text-default-400">
              Abra um modelo para revisar conteúdo, editar ou controlar status.
            </p>
          </div>
        </CardHeader>
        <CardBody className="p-5">
          {!modelosLista.length ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <FileText className="mb-4 h-12 w-12 text-default-400" />
              <p className="text-default-300">
                {temFiltrosAtivos
                  ? "Nenhum modelo encontrado com os filtros aplicados"
                  : "Nenhum modelo de petição cadastrado"}
              </p>
              <p className="mt-1 text-sm text-default-500">
                {temFiltrosAtivos
                  ? "Ajuste os filtros para ampliar o resultado."
                  : "Crie seu primeiro modelo para agilizar petições recorrentes."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
              {modelosLista.map((modelo) => {
                const variaveisModelo = extractVariaveis(modelo);

                return (
                  <Card
                    key={modelo.id}
                    className="border border-white/10 bg-background/60 transition-all duration-300 hover:border-primary/40 hover:bg-background/80"
                  >
                    <CardHeader className="items-start justify-between gap-3 p-4 pb-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                          <FileText className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="truncate text-base font-semibold text-white">
                            {modelo.nome}
                          </h3>
                          <p className="mt-1 line-clamp-2 text-sm text-default-400">
                            {modelo.descricao || "Sem descrição cadastrada"}
                          </p>
                        </div>
                      </div>

                      <Dropdown>
                        <DropdownTrigger>
                          <Button isIconOnly size="sm" variant="light">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownTrigger>
                        <DropdownMenu aria-label={`Ações para ${modelo.nome}`}>
                          <DropdownItem
                            key="view"
                            startContent={<Eye className="h-4 w-4" />}
                            onPress={() => openViewModal(modelo)}
                          >
                            Ver detalhes
                          </DropdownItem>
                          <DropdownItem
                            key="edit"
                            startContent={<Edit className="h-4 w-4" />}
                            onPress={() => openEditModal(modelo)}
                          >
                            Editar
                          </DropdownItem>
                          <DropdownItem
                            key="duplicate"
                            startContent={<Copy className="h-4 w-4" />}
                            onPress={() => handleDuplicate(modelo.id)}
                          >
                            Duplicar
                          </DropdownItem>
                          <DropdownItem
                            key="toggle"
                            startContent={
                              modelo.ativo ? (
                                <PowerOff className="h-4 w-4" />
                              ) : (
                                <Power className="h-4 w-4" />
                              )
                            }
                            onPress={() => handleToggleStatus(modelo.id)}
                          >
                            {modelo.ativo ? "Desativar" : "Ativar"}
                          </DropdownItem>
                          <DropdownItem
                            key="delete"
                            className="text-danger"
                            color="danger"
                            startContent={<Trash2 className="h-4 w-4" />}
                            onPress={() => {
                              setModeloToDelete(modelo);
                              setDeleteModalOpen(true);
                            }}
                          >
                            Excluir
                          </DropdownItem>
                        </DropdownMenu>
                      </Dropdown>
                    </CardHeader>

                    <CardBody className="space-y-4 p-4 pt-0">
                      <div className="flex flex-wrap gap-2">
                        {modelo.categoria ? (
                          <Chip color="primary" size="sm" variant="flat">
                            {modelo.categoria}
                          </Chip>
                        ) : null}
                        {modelo.tipo ? (
                          <Chip color="secondary" size="sm" variant="flat">
                            {modelo.tipo}
                          </Chip>
                        ) : null}
                        <Chip
                          color={modelo.ativo ? "success" : "default"}
                          size="sm"
                          startContent={
                            modelo.ativo ? (
                              <Power className="h-3 w-3" />
                            ) : (
                              <PowerOff className="h-3 w-3" />
                            )
                          }
                          variant="flat"
                        >
                          {modelo.ativo ? "Ativo" : "Inativo"}
                        </Chip>
                        {modelo.publico ? (
                          <Chip color="warning" size="sm" variant="flat">
                            Público
                          </Chip>
                        ) : null}
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-xs text-default-400">
                        <div className="rounded-xl border border-white/10 bg-background/40 px-3 py-2">
                          <p className="font-medium text-default-300">Uso</p>
                          <p className="mt-1">
                            {modelo._count?.peticoes || 0} petição(ões)
                          </p>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-background/40 px-3 py-2">
                          <p className="font-medium text-default-300">Variáveis</p>
                          <p className="mt-1">{variaveisModelo.length} detectada(s)</p>
                        </div>
                      </div>

                      <p className="text-xs text-default-500">
                        Atualizado em{" "}
                        {new Date(modelo.updatedAt).toLocaleDateString("pt-BR")}
                      </p>

                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          startContent={<Eye className="h-4 w-4" />}
                          variant="flat"
                          onPress={() => openViewModal(modelo)}
                        >
                          Visualizar
                        </Button>
                        <Button
                          size="sm"
                          startContent={<Edit className="h-4 w-4" />}
                          variant="light"
                          onPress={() => openEditModal(modelo)}
                        >
                          Editar
                        </Button>
                      </div>
                    </CardBody>
                  </Card>
                );
              })}
            </div>
          )}
        </CardBody>
      </Card>

      <Modal isOpen={viewModalOpen} size="4xl" onOpenChange={setViewModalOpen}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>Detalhes do Modelo</ModalHeader>
              <ModalBody className="gap-4">
                {selectedModelo ? (
                  <>
                    <div className="space-y-1">
                      <h3 className="text-lg font-semibold text-white">
                        {selectedModelo.nome}
                      </h3>
                      <p className="text-sm text-default-400">
                        {selectedModelo.descricao || "Sem descrição"}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {selectedModelo.categoria ? (
                        <Chip color="primary" size="sm" variant="flat">
                          {selectedModelo.categoria}
                        </Chip>
                      ) : null}
                      {selectedModelo.tipo ? (
                        <Chip color="secondary" size="sm" variant="flat">
                          {selectedModelo.tipo}
                        </Chip>
                      ) : null}
                      <Chip
                        color={selectedModelo.ativo ? "success" : "default"}
                        size="sm"
                        variant="flat"
                      >
                        {selectedModelo.ativo ? "Ativo" : "Inativo"}
                      </Chip>
                      {selectedModelo.publico ? (
                        <Chip color="warning" size="sm" variant="flat">
                          Público
                        </Chip>
                      ) : null}
                    </div>

                    <div className="grid gap-3 rounded-xl border border-white/10 bg-background/40 p-3 sm:grid-cols-3">
                      <div>
                        <p className="text-xs text-default-500">Petições vinculadas</p>
                        <p className="text-sm font-semibold text-default-200">
                          {selectedModelo._count?.peticoes || 0}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-default-500">Criado em</p>
                        <p className="text-sm font-semibold text-default-200">
                          {new Date(selectedModelo.createdAt).toLocaleDateString(
                            "pt-BR",
                          )}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-default-500">Atualizado em</p>
                        <p className="text-sm font-semibold text-default-200">
                          {new Date(selectedModelo.updatedAt).toLocaleDateString(
                            "pt-BR",
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-sm font-medium text-default-300">Conteúdo</p>
                      <Textarea
                        isReadOnly
                        classNames={{ input: "font-mono text-xs" }}
                        minRows={12}
                        value={selectedModelo.conteudo || ""}
                      />
                    </div>

                    <div className="space-y-2">
                      <p className="text-sm font-medium text-default-300">
                        Variáveis detectadas
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {selectedVariaveis.length ? (
                          selectedVariaveis.map((variavel) => (
                            <Chip key={variavel} size="sm" variant="flat">
                              {`{{${variavel}}}`}
                            </Chip>
                          ))
                        ) : (
                          <p className="text-sm text-default-500">
                            Nenhuma variável detectada no modelo.
                          </p>
                        )}
                      </div>
                    </div>
                  </>
                ) : null}
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  Fechar
                </Button>
                {selectedModelo ? (
                  <Button
                    color="primary"
                    startContent={<Edit className="h-4 w-4" />}
                    onPress={() => {
                      openEditModal(selectedModelo);
                      onClose();
                    }}
                  >
                    Editar modelo
                  </Button>
                ) : null}
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      <Modal
        isOpen={editModalOpen}
        scrollBehavior="inside"
        size="5xl"
        onOpenChange={setEditModalOpen}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>Editar Modelo</ModalHeader>
              <ModalBody className="gap-4">
                <Input
                  isRequired
                  label="Nome do modelo"
                  placeholder="Ex: Contestação cível padrão"
                  value={editForm.nome}
                  onValueChange={(value) =>
                    setEditForm((prev) => ({ ...prev, nome: value }))
                  }
                />

                <Textarea
                  label="Descrição"
                  minRows={2}
                  placeholder="Resumo de quando usar este modelo"
                  value={editForm.descricao}
                  onValueChange={(value) =>
                    setEditForm((prev) => ({ ...prev, descricao: value }))
                  }
                />

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <Input
                    label="Categoria"
                    placeholder="Ex: INICIAL"
                    value={editForm.categoria}
                    onValueChange={(value) =>
                      setEditForm((prev) => ({ ...prev, categoria: value }))
                    }
                  />
                  <Input
                    label="Tipo"
                    placeholder="Ex: CÍVEL"
                    value={editForm.tipo}
                    onValueChange={(value) =>
                      setEditForm((prev) => ({ ...prev, tipo: value }))
                    }
                  />
                </div>

                <Textarea
                  isRequired
                  classNames={{ input: "font-mono text-sm" }}
                  label="Conteúdo do template"
                  minRows={12}
                  placeholder="Use variáveis no formato {{variavel}}"
                  value={editForm.conteudo}
                  onValueChange={(value) =>
                    setEditForm((prev) => ({ ...prev, conteudo: value }))
                  }
                />

                <div className="flex flex-wrap gap-4">
                  <Checkbox
                    isSelected={editForm.ativo}
                    onValueChange={(value) =>
                      setEditForm((prev) => ({ ...prev, ativo: value }))
                    }
                  >
                    Modelo ativo
                  </Checkbox>
                  <Checkbox
                    isSelected={editForm.publico}
                    onValueChange={(value) =>
                      setEditForm((prev) => ({ ...prev, publico: value }))
                    }
                  >
                    Modelo público
                  </Checkbox>
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  Cancelar
                </Button>
                <Button
                  color="primary"
                  isLoading={isPending}
                  onPress={handleSaveEdit}
                >
                  Salvar alterações
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      <Modal isOpen={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>Confirmar Exclusão</ModalHeader>
              <ModalBody>
                <p>Tem certeza que deseja excluir este modelo de petição?</p>
                {modeloToDelete ? (
                  <p className="text-sm text-default-500">
                    Modelo: <span className="font-medium">{modeloToDelete.nome}</span>
                  </p>
                ) : null}
                <p className="text-sm text-danger">
                  Esta ação não pode ser desfeita. O modelo será removido
                  permanentemente.
                </p>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  Cancelar
                </Button>
                <Button color="danger" isLoading={isPending} onPress={handleDelete}>
                  Excluir
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
