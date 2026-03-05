"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  Card, CardBody, CardHeader, Button, Input, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Textarea, Chip, Skeleton, Tooltip, Select, SelectItem } from "@heroui/react";
import { toast } from "@/lib/toast";
import {
  Calendar,
  Plus,
  Search,
  Filter,
  X,
  Pencil,
  Trash2,
  Download,
  CalendarCheck,
  MapPin,
  Building,
} from "lucide-react";

import {
  listFeriados,
  createFeriado,
  updateFeriado,
  deleteFeriado,
  getDashboardFeriados,
  getTiposFeriado,
  importarFeriadosNacionais,
  type FeriadoFilters,
  type FeriadoCreateInput,
} from "@/app/actions/feriados";
import { getEstadosBrasilCached } from "@/lib/api/brazil-states";
import { TipoFeriado } from "@/generated/prisma";
import { title, subtitle } from "@/components/primitives";
import { DateInput } from "@/components/ui/date-input";

// ============================================
// TIPOS
// ============================================

interface Feriado {
  id: string;
  nome: string;
  data: Date | string;
  tipo: TipoFeriado;
  uf: string | null;
  municipio: string | null;
  descricao: string | null;
  recorrente: boolean;
  tribunal: {
    id: string;
    nome: string;
    sigla: string | null;
  } | null;
}

interface DashboardData {
  total: number;
  ano: number;
  porTipo: Array<{
    tipo: TipoFeriado;
    _count: number;
  }>;
  proximosFeriados: Feriado[];
}

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

export default function FeriadosPage() {
  const currentYear = new Date().getFullYear();
  const [filters, setFilters] = useState<FeriadoFilters>({ ano: currentYear });
  const [searchTerm, setSearchTerm] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // Estado do modal
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit" | "view">(
    "create",
  );
  const [selectedFeriado, setSelectedFeriado] = useState<Feriado | null>(null);

  // SWR - Fetch data
  const {
    data: feriadosData,
    mutate: mutateFeriados,
    isLoading: loadingFeriados,
  } = useSWR(["feriados", filters], () => listFeriados(filters));

  const {
    data: dashboardData,
    isLoading: loadingDashboard,
    mutate: mutateDashboard,
  } = useSWR(["dashboard-feriados", filters.ano], () =>
    getDashboardFeriados(filters.ano),
  );

  const { data: tiposData } = useSWR("tipos-feriado", getTiposFeriado);
  const { data: estadosData } = useSWR(
    "estados-brasil",
    getEstadosBrasilCached,
  );

  const feriados = (feriadosData?.data || []) as Feriado[];
  const dashboard = dashboardData?.data as DashboardData | undefined;
  const tipos = tiposData?.data || [];
  const estados = estadosData || [];

  // Handlers de filtro
  const handleSearch = (value: string) => {
    setSearchTerm(value);
    if (value.length >= 2 || value.length === 0) {
      setFilters({ ...filters, searchTerm: value || undefined });
    }
  };

  const handleFilterChange = (key: keyof FeriadoFilters, value: any) => {
    setFilters({ ...filters, [key]: value || undefined });
  };

  const clearFilters = () => {
    setFilters({ ano: currentYear });
    setSearchTerm("");
    setShowFilters(false);
  };

  // Handlers do modal
  const openCreateModal = () => {
    setModalMode("create");
    setSelectedFeriado(null);
    setModalOpen(true);
  };

  const openEditModal = (feriado: Feriado) => {
    setModalMode("edit");
    setSelectedFeriado(feriado);
    setModalOpen(true);
  };

  const openViewModal = (feriado: Feriado) => {
    setModalMode("view");
    setSelectedFeriado(feriado);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setSelectedFeriado(null);
  };

  // Handler de exclusão
  const handleDelete = async (feriadoId: string) => {
    if (!confirm("Tem certeza que deseja excluir este feriado?")) return;

    const result = await deleteFeriado(feriadoId);

    if (result.success) {
      toast.success("Feriado excluído com sucesso!");
      mutateFeriados();
      mutateDashboard();
    } else {
      toast.error(result.error || "Erro ao excluir feriado");
    }
  };

  // Handler de importação
  const handleImportar = async () => {
    const ano = filters.ano || currentYear;

    if (!confirm(`Deseja importar os feriados nacionais de ${ano}?`)) return;

    toast.loading("Importando feriados...");
    const result = await importarFeriadosNacionais(ano);

    toast.dismiss();

    if (result.success) {
      const created = result.data?.created ?? result.data?.total ?? 0;
      const updated = result.data?.updated ?? 0;
      const ignored = result.data?.ignored ?? 0;

      toast.success(
        `Sincronização concluída: ${created} novo(s), ${updated} atualizado(s), ${ignored} já existente(s).`,
      );
      mutateFeriados();
      mutateDashboard();
    } else {
      toast.error(result.error || "Erro ao importar feriados");
    }
  };

  // Helpers
  const getTipoColor = (tipo: TipoFeriado) => {
    switch (tipo) {
      case "NACIONAL":
        return "success";
      case "ESTADUAL":
        return "primary";
      case "MUNICIPAL":
        return "secondary";
      case "JUDICIARIO":
        return "warning";
      default:
        return "default";
    }
  };

  const getTipoLabel = (tipo: TipoFeriado) => {
    switch (tipo) {
      case "NACIONAL":
        return "Nacional";
      case "ESTADUAL":
        return "Estadual";
      case "MUNICIPAL":
        return "Municipal";
      case "JUDICIARIO":
        return "Judiciário";
      default:
        return tipo;
    }
  };

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  };

  const formatDateShort = (date: Date | string) => {
    return new Date(date).toLocaleDateString("pt-BR");
  };

  // Agrupar feriados por mês
  const feriadosPorMes = feriados.reduce(
    (acc, feriado) => {
      const mes = new Date(feriado.data).toLocaleDateString("pt-BR", {
        month: "long",
        year: "numeric",
      });

      if (!acc[mes]) {
        acc[mes] = [];
      }
      acc[mes].push(feriado);

      return acc;
    },
    {} as Record<string, Feriado[]>,
  );

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className={title({ size: "lg", color: "blue" })}>Feriados</h1>
          <p className={subtitle({ fullWidth: true })}>
            Gestão de feriados e dias não úteis
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            color="secondary"
            startContent={<Download size={20} />}
            variant="flat"
            onPress={handleImportar}
          >
            Importar Nacionais
          </Button>
          <Button
            color="primary"
            startContent={<Plus size={20} />}
            onPress={openCreateModal}
          >
            Novo Feriado
          </Button>
        </div>
      </div>

      {/* Dashboard Cards */}
      {loadingDashboard ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      ) : dashboard ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardBody className="flex flex-row items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Total {dashboard.ano}
                </p>
                <p className="text-2xl font-bold">{dashboard.total}</p>
              </div>
              <Calendar className="text-primary" size={32} />
            </CardBody>
          </Card>

          <Card>
            <CardBody className="flex flex-row items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Nacionais
                </p>
                <p className="text-2xl font-bold">
                  {dashboard.porTipo.find((t) => t.tipo === "NACIONAL")
                    ?._count || 0}
                </p>
              </div>
              <CalendarCheck className="text-success" size={32} />
            </CardBody>
          </Card>

          <Card>
            <CardBody className="flex flex-row items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Estaduais
                </p>
                <p className="text-2xl font-bold">
                  {dashboard.porTipo.find((t) => t.tipo === "ESTADUAL")
                    ?._count || 0}
                </p>
              </div>
              <MapPin className="text-primary" size={32} />
            </CardBody>
          </Card>

          <Card>
            <CardBody className="flex flex-row items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Judiciários
                </p>
                <p className="text-2xl font-bold">
                  {dashboard.porTipo.find((t) => t.tipo === "JUDICIARIO")
                    ?._count || 0}
                </p>
              </div>
              <Building className="text-warning" size={32} />
            </CardBody>
          </Card>
        </div>
      ) : null}

      {/* Filtros */}
      <Card>
        <CardHeader className="flex flex-col gap-3">
          <div className="flex gap-2 w-full">
            <Input
              className="flex-1"
              placeholder="Buscar feriado..."
              startContent={<Search size={18} />}
              value={searchTerm}
              onValueChange={handleSearch}
            />
            <Select
              className="w-32"
              label="Ano"
              selectedKeys={filters.ano ? [filters.ano.toString()] : []}
              onChange={(e) =>
                handleFilterChange(
                  "ano",
                  e.target.value ? parseInt(e.target.value) : undefined,
                )
              }
            >
              {[
                currentYear - 1,
                currentYear,
                currentYear + 1,
                currentYear + 2,
              ].map((ano) => (
                <SelectItem key={ano.toString()} textValue={ano.toString()}>
                  {ano}
                </SelectItem>
              ))}
            </Select>
            <Button
              color={showFilters ? "primary" : "default"}
              startContent={<Filter size={18} />}
              variant={showFilters ? "solid" : "flat"}
              onPress={() => setShowFilters(!showFilters)}
            >
              Filtros
            </Button>
          </div>

          {showFilters && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 w-full pt-3 border-t">
              <Select
                label="Tipo"
                placeholder="Todos os tipos"
                selectedKeys={filters.tipo ? [filters.tipo] : []}
                onChange={(e) => handleFilterChange("tipo", e.target.value)}
              >
                {tipos.map((tipo) => (
                  <SelectItem key={tipo} textValue={getTipoLabel(tipo)}>{getTipoLabel(tipo)}</SelectItem>
                ))}
              </Select>

              <Select
                label="Estado"
                placeholder="Todos os estados"
                selectedKeys={filters.uf ? [filters.uf] : []}
                onChange={(e) => handleFilterChange("uf", e.target.value)}
              >
                {estados.map((estado) => (
                  <SelectItem key={estado.sigla} textValue={estado.nome}>{estado.nome}</SelectItem>
                ))}
              </Select>

              <Button
                color="danger"
                startContent={<X size={18} />}
                variant="flat"
                onPress={clearFilters}
              >
                Limpar Filtros
              </Button>
            </div>
          )}
        </CardHeader>
      </Card>

      {/* Lista de Feriados Agrupada por Mês */}
      <div className="space-y-4">
        {loadingFeriados ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32 rounded-lg" />
            ))}
          </div>
        ) : Object.keys(feriadosPorMes).length === 0 ? (
          <Card>
            <CardBody>
              <div className="text-center py-12">
                <Calendar className="mx-auto text-gray-400 mb-4" size={48} />
                <p className="text-gray-600 dark:text-gray-400">
                  Nenhum feriado encontrado
                </p>
                <Button
                  className="mt-4"
                  color="primary"
                  variant="flat"
                  onPress={handleImportar}
                >
                  Importar Feriados Nacionais
                </Button>
              </div>
            </CardBody>
          </Card>
        ) : (
          Object.entries(feriadosPorMes).map(([mes, feriadosDoMes]) => (
            <Card key={mes}>
              <CardHeader>
                <h2 className="text-xl font-semibold capitalize">{mes}</h2>
              </CardHeader>
              <CardBody>
                <div className="space-y-3">
                  {feriadosDoMes.map((feriado) => (
                    <div
                      key={feriado.id}
                      aria-label={`Ver detalhes do feriado ${feriado.nome}`}
                      className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg hover:shadow-md transition-shadow cursor-pointer"
                      role="button"
                      tabIndex={0}
                      onClick={() => openViewModal(feriado)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openViewModal(feriado);
                        }
                      }}
                    >
                      <div className="flex items-center gap-4 flex-1">
                        <div className="flex flex-col items-center justify-center bg-white dark:bg-gray-700 rounded-lg p-3 min-w-[80px]">
                          <span className="text-3xl font-bold text-primary">
                            {new Date(feriado.data).getDate()}
                          </span>
                          <span className="text-xs text-gray-600 dark:text-gray-400 uppercase">
                            {new Date(feriado.data).toLocaleDateString(
                              "pt-BR",
                              { weekday: "short" },
                            )}
                          </span>
                        </div>

                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold text-lg">
                              {feriado.nome}
                            </h3>
                            <Chip
                              color={getTipoColor(feriado.tipo)}
                              size="sm"
                              variant="flat"
                            >
                              {getTipoLabel(feriado.tipo)}
                            </Chip>
                            {feriado.recorrente && (
                              <Chip size="sm" variant="flat">
                                Anual
                              </Chip>
                            )}
                          </div>

                          <div className="flex gap-4 text-sm text-gray-600 dark:text-gray-400">
                            {feriado.uf && (
                              <span className="flex items-center gap-1">
                                <MapPin size={14} />
                                {feriado.uf}
                                {feriado.municipio && ` - ${feriado.municipio}`}
                              </span>
                            )}
                            {feriado.tribunal && (
                              <span className="flex items-center gap-1">
                                <Building size={14} />
                                {feriado.tribunal.sigla ||
                                  feriado.tribunal.nome}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-2" role="group">
                        <Tooltip content="Editar">
                          <Button
                            isIconOnly
                            size="sm"
                            variant="light"
                            onPress={() => openEditModal(feriado)}
                          >
                            <Pencil size={16} />
                          </Button>
                        </Tooltip>

                        <Tooltip content="Excluir">
                          <Button
                            isIconOnly
                            color="danger"
                            size="sm"
                            variant="light"
                            onPress={() => handleDelete(feriado.id)}
                          >
                            <Trash2 size={16} />
                          </Button>
                        </Tooltip>
                      </div>
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>
          ))
        )}
      </div>

      {/* Modal de Criar/Editar/Visualizar */}
      <FeriadoModal
        estados={estados}
        feriado={selectedFeriado}
        isOpen={modalOpen}
        mode={modalMode}
        tipos={tipos}
        onClose={closeModal}
        onSuccess={() => {
          mutateFeriados();
          mutateDashboard();
        }}
      />
    </div>
  );
}

// ============================================
// MODAL DE FERIADO
// ============================================

interface FeriadoModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: "create" | "edit" | "view";
  feriado: Feriado | null;
  tipos: TipoFeriado[];
  estados: any[];
  onSuccess: () => void;
}

function FeriadoModal({
  isOpen,
  onClose,
  mode,
  feriado,
  tipos,
  estados,
  onSuccess,
}: FeriadoModalProps) {
  const isReadOnly = mode === "view";

  const [formData, setFormData] = useState<any>({
    nome: "",
    data: new Date().toISOString().slice(0, 10),
    tipo: "NACIONAL",
    uf: "",
    municipio: "",
    descricao: "",
    recorrente: true,
  });
  const [saving, setSaving] = useState(false);

  // Resetar formulário quando modal abre/fecha
  useState(() => {
    if (isOpen) {
      if (mode === "create") {
        setFormData({
          nome: "",
          data: new Date().toISOString().slice(0, 10),
          tipo: "NACIONAL",
          uf: "",
          municipio: "",
          descricao: "",
          recorrente: true,
        });
      } else if (feriado) {
        setFormData({
          nome: feriado.nome,
          data: new Date(feriado.data).toISOString().slice(0, 10),
          tipo: feriado.tipo,
          uf: feriado.uf || "",
          municipio: feriado.municipio || "",
          descricao: feriado.descricao || "",
          recorrente: feriado.recorrente,
        });
      }
    }
  });

  const handleSubmit = async () => {
    if (!formData.nome || !formData.data || !formData.tipo) {
      toast.error("Preencha os campos obrigatórios");

      return;
    }

    setSaving(true);

    const input: FeriadoCreateInput = {
      nome: formData.nome,
      data: new Date(formData.data),
      tipo: formData.tipo,
      uf: formData.uf || undefined,
      municipio: formData.municipio || undefined,
      descricao: formData.descricao || undefined,
      recorrente: formData.recorrente,
    };

    const result =
      mode === "create"
        ? await createFeriado(input)
        : await updateFeriado(feriado!.id, input);

    setSaving(false);

    if (result.success) {
      toast.success(
        mode === "create"
          ? "Feriado criado com sucesso!"
          : "Feriado atualizado com sucesso!",
      );
      onSuccess();
      onClose();
    } else {
      toast.error(result.error || "Erro ao salvar feriado");
    }
  };

  const getTipoLabel = (tipo: TipoFeriado) => {
    switch (tipo) {
      case "NACIONAL":
        return "Nacional";
      case "ESTADUAL":
        return "Estadual";
      case "MUNICIPAL":
        return "Municipal";
      case "JUDICIARIO":
        return "Judiciário";
      default:
        return tipo;
    }
  };

  return (
    <Modal isOpen={isOpen} size="lg" onClose={onClose}>
      <ModalContent>
        <ModalHeader>
          {mode === "create" && "Novo Feriado"}
          {mode === "edit" && "Editar Feriado"}
          {mode === "view" && "Detalhes do Feriado"}
        </ModalHeader>
        <ModalBody>
          <div className="space-y-4">
            <Input
              isRequired
              isReadOnly={isReadOnly}
              label="Nome do Feriado"
              placeholder="Ex: Dia do Trabalho, Carnaval, etc"
              value={formData.nome}
              onValueChange={(value) =>
                setFormData({ ...formData, nome: value })
              }
            />

            <DateInput
              isRequired
              isReadOnly={isReadOnly}
              label="Data"
              value={formData.data}
              onValueChange={(value) =>
                setFormData({ ...formData, data: value })
              }
             />

            <Select
              isRequired
              isDisabled={isReadOnly}
              label="Tipo"
              placeholder="Selecione o tipo"
              selectedKeys={formData.tipo ? [formData.tipo] : []}
              onChange={(e) =>
                setFormData({ ...formData, tipo: e.target.value })
              }
            >
              {tipos.map((tipo) => (
                <SelectItem key={tipo} textValue={getTipoLabel(tipo)}>{getTipoLabel(tipo)}</SelectItem>
              ))}
            </Select>

            {(formData.tipo === "ESTADUAL" ||
              formData.tipo === "MUNICIPAL") && (
              <Select
                isDisabled={isReadOnly}
                label="Estado (UF)"
                placeholder="Selecione o estado"
                selectedKeys={formData.uf ? [formData.uf] : []}
                onChange={(e) =>
                  setFormData({ ...formData, uf: e.target.value })
                }
              >
                {estados.map((estado) => (
                  <SelectItem key={estado.sigla} textValue={estado.nome}>{estado.nome}</SelectItem>
                ))}
              </Select>
            )}

            {formData.tipo === "MUNICIPAL" && (
              <Input
                isReadOnly={isReadOnly}
                label="Município"
                placeholder="Ex: São Paulo, Rio de Janeiro"
                value={formData.municipio}
                onValueChange={(value) =>
                  setFormData({ ...formData, municipio: value })
                }
              />
            )}

            <Textarea
              isReadOnly={isReadOnly}
              label="Descrição (opcional)"
              minRows={2}
              placeholder="Informações adicionais sobre o feriado"
              value={formData.descricao}
              onValueChange={(value) =>
                setFormData({ ...formData, descricao: value })
              }
            />

            {!isReadOnly && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  checked={formData.recorrente}
                  className="w-4 h-4"
                  type="checkbox"
                  onChange={(e) =>
                    setFormData({ ...formData, recorrente: e.target.checked })
                  }
                />
                <span className="text-sm">
                  Feriado anual (repete todos os anos)
                </span>
              </label>
            )}
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="light" onPress={onClose}>
            {isReadOnly ? "Fechar" : "Cancelar"}
          </Button>
          {!isReadOnly && (
            <Button color="primary" isLoading={saving} onPress={handleSubmit}>
              {mode === "create" ? "Criar" : "Salvar"}
            </Button>
          )}
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
