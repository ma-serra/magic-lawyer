"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import {
  Card,
  CardBody,
  Button,
  Input,
  Chip,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Textarea,
  Autocomplete,
  AutocompleteItem,
  Skeleton,
  Divider,
  Select,
  SelectItem,
  Pagination,
} from "@heroui/react";
import { toast } from "@/lib/toast";
import {
  Search as MagnifyingGlassIcon,
  Filter as FilterIcon,
  Plus as PlusIcon,
  FileText as DocumentTextIcon,
  X as XMarkIcon,
  Pencil as PencilIcon,
  Trash2 as TrashIcon,
  FileCheck as DocumentCheckIcon,
  Clock as ClockIcon,
  CheckCircle as CheckCircleIcon,
  XCircle as XCircleIcon,
  Archive as ArchiveBoxIcon,
  Upload as ArrowUpTrayIcon,
  PenTool as PenToolIcon,
  Shield as ShieldCheckIcon,
  Users as UsersIcon,
} from "lucide-react";

import {
  listPeticoes,
  createPeticao,
  updatePeticao,
  deletePeticao,
  protocolarPeticao,
  getDashboardPeticoes,
  listTiposPeticao,
  type PeticaoFilters,
  type PeticaoCreateInput,
} from "@/app/actions/peticoes";
import {
  uploadDocumentoPeticao,
  removerDocumentoPeticao,
} from "@/app/actions/upload-documento-peticao";
import { getAllProcessos } from "@/app/actions/processos";
import { PeticaoStatus } from "@/generated/prisma";
import { useModelosPeticaoAtivos } from "@/app/hooks/use-modelos-peticao";
import { processarTemplate } from "@/app/actions/modelos-peticao";
import {
  useAssinaturas,
  usePeticaoAssinada,
} from "@/app/hooks/use-assinaturas";
import { PeopleMetricCard, PeoplePageHeader } from "@/components/people-ui";

// ============================================
// TIPOS
// ============================================

interface Peticao {
  id: string;
  titulo: string;
  tipo: string | null;
  status: PeticaoStatus;
  descricao: string | null;
  protocoloNumero: string | null;
  protocoladoEm: Date | null;
  observacoes: string | null;
  createdAt: Date;
  updatedAt: Date;
  processo: {
    id: string;
    numero: string;
    titulo: string | null;
    status: string;
  };
  causa: {
    id: string;
    nome: string;
  } | null;
  documento: {
    id: string;
    nome: string;
    url: string;
    contentType: string | null;
    tamanhoBytes: number | null;
  } | null;
  criadoPor: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
  } | null;
}

interface DashboardData {
  total: number;
  recentes: number;
  protocoladasRecentes: number;
  emAnalise: number;
  rascunhos: number;
  porStatus: Array<{
    status: PeticaoStatus;
    quantidade: number;
  }>;
  topProcessos: Array<{
    processoId: string;
    numero: string;
    titulo: string;
    quantidade: number;
  }>;
}

interface PeticoesContentProps {
  canCreatePeticao?: boolean;
  canEditPeticao?: boolean;
  canDeletePeticao?: boolean;
}

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

export default function PeticoesPage({
  canCreatePeticao = true,
  canEditPeticao = true,
  canDeletePeticao = true,
}: PeticoesContentProps) {
  // Estado dos filtros
  const [filters, setFilters] = useState<PeticaoFilters>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;

  // Estado do modal
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit" | "view">(
    "create",
  );
  const [selectedPeticao, setSelectedPeticao] = useState<Peticao | null>(null);

  // Estado do modal de protocolo
  const [protocoloModalOpen, setProtocoloModalOpen] = useState(false);
  const [protocoloPeticaoId, setProtocoloPeticaoId] = useState<string>("");
  const [protocoloNumero, setProtocoloNumero] = useState("");

  // Estado do modal de assinatura
  const [assinaturaModalOpen, setAssinaturaModalOpen] = useState(false);
  const [assinaturaPeticaoId, setAssinaturaPeticaoId] = useState<string>("");

  // SWR - Fetch data
  const {
    data: peticoesData,
    mutate: mutatePeticoes,
    isLoading: loadingPeticoes,
  } = useSWR(["peticoes", filters, currentPage, itemsPerPage], () =>
    listPeticoes({
      ...filters,
      page: currentPage,
      perPage: itemsPerPage,
    }),
  );

  const { data: dashboardData, isLoading: loadingDashboard } = useSWR(
    "dashboard-peticoes",
    getDashboardPeticoes,
  );

  const { data: processosData } = useSWR("processos-list", getAllProcessos);

  const { data: tiposData } = useSWR("tipos-peticao", listTiposPeticao);

  const peticoes = (peticoesData?.data || []) as Peticao[];
  const dashboard = dashboardData?.data as DashboardData | undefined;
  const processos = processosData?.processos || [];
  const tipos = tiposData?.data || [];
  const pagination = peticoesData?.pagination || {
    page: currentPage,
    perPage: itemsPerPage,
    total: peticoes.length,
    totalPages: 1,
    hasPreviousPage: false,
    hasNextPage: false,
  };
  const firstVisibleItem =
    pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.perPage + 1;
  const lastVisibleItem =
    pagination.total === 0
      ? 0
      : Math.min(pagination.page * pagination.perPage, pagination.total);

  useEffect(() => {
    if (pagination.totalPages > 0 && currentPage > pagination.totalPages) {
      setCurrentPage(pagination.totalPages);
    }
  }, [currentPage, pagination.totalPages]);

  // Handlers de filtro
  const handleSearch = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
    if (value.length >= 2 || value.length === 0) {
      setFilters((prev) => ({ ...prev, search: value || undefined }));
    }
  };

  const handleStatusFilter = (status: string) => {
    setCurrentPage(1);
    setFilters((prev) => ({
      ...prev,
      status: status ? (status as PeticaoStatus) : undefined,
    }));
  };

  const clearFilters = () => {
    setFilters({});
    setSearchTerm("");
    setCurrentPage(1);
  };

  // Handlers do modal
  const openCreateModal = () => {
    if (!canCreatePeticao) {
      toast.error("Você não tem permissão para criar petições");
      return;
    }
    setSelectedPeticao(null);
    setModalMode("create");
    setModalOpen(true);
  };

  const openEditModal = (peticao: Peticao) => {
    if (!canEditPeticao) {
      toast.error("Você não tem permissão para editar petições");
      return;
    }
    setSelectedPeticao(peticao);
    setModalMode("edit");
    setModalOpen(true);
  };

  const openViewModal = (peticao: Peticao) => {
    setSelectedPeticao(peticao);
    setModalMode("view");
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setSelectedPeticao(null);
  };

  // Handler de protocolo
  const openProtocoloModal = (peticaoId: string) => {
    if (!canEditPeticao) {
      toast.error("Você não tem permissão para protocolar petições");
      return;
    }
    setProtocoloPeticaoId(peticaoId);
    setProtocoloNumero("");
    setProtocoloModalOpen(true);
  };

  const handleProtocolar = async () => {
    if (!protocoloNumero.trim()) {
      toast.error("Informe o número do protocolo");

      return;
    }

    const result = await protocolarPeticao(protocoloPeticaoId, protocoloNumero);

    if (result.success) {
      toast.success(result.message || "Petição protocolada!");
      setProtocoloModalOpen(false);
      mutatePeticoes();
    } else {
      toast.error(result.error || "Erro ao protocolar");
    }
  };

  // Handler de exclusão
  const handleDelete = async (id: string) => {
    if (!canDeletePeticao) {
      toast.error("Você não tem permissão para excluir petições");
      return;
    }
    if (!confirm("Tem certeza que deseja excluir esta petição?")) {
      return;
    }

    const result = await deletePeticao(id);

    if (result.success) {
      toast.success(result.message || "Petição excluída!");
      mutatePeticoes();
    } else {
      toast.error(result.error || "Erro ao excluir");
    }
  };

  // Handler de assinatura
  const openAssinaturaModal = (peticaoId: string) => {
    if (!canEditPeticao) {
      toast.error("Você não tem permissão para gerenciar assinaturas");
      return;
    }
    setAssinaturaPeticaoId(peticaoId);
    setAssinaturaModalOpen(true);
  };

  // Status badge
  const getStatusBadge = (status: PeticaoStatus) => {
    const statusConfig = {
      [PeticaoStatus.RASCUNHO]: {
        color: "default",
        label: "Rascunho",
        icon: DocumentTextIcon,
      },
      [PeticaoStatus.EM_ANALISE]: {
        color: "warning",
        label: "Em Análise",
        icon: ClockIcon,
      },
      [PeticaoStatus.PROTOCOLADA]: {
        color: "success",
        label: "Protocolada",
        icon: CheckCircleIcon,
      },
      [PeticaoStatus.INDEFERIDA]: {
        color: "danger",
        label: "Indeferida",
        icon: XCircleIcon,
      },
      [PeticaoStatus.ARQUIVADA]: {
        color: "default",
        label: "Arquivada",
        icon: ArchiveBoxIcon,
      },
    };

    const config = statusConfig[status];
    const Icon = config.icon;

    return (
      <Chip
        color={config.color as any}
        size="sm"
        startContent={<Icon size={16} />}
        variant="flat"
      >
        {config.label}
      </Chip>
    );
  };

  const hasActiveFilters = Boolean(filters.status || filters.search);
  const selectedStatusKey = filters.status || "all";

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-6">
      <PeoplePageHeader
        tag="Atividades jurídicas"
        title="Petições"
        description={`${pagination.total} petição(ões) no resultado${hasActiveFilters ? " filtrado" : " total"}`}
        actions={
          <>
            <div className="flex items-center rounded-xl border border-default-200 bg-content1 p-0.5">
              <Button color="primary" size="sm" variant="solid">
                Petições
              </Button>
              <Button
                as={Link}
                href="/modelos-peticao"
                size="sm"
                variant="light"
              >
                Modelos
              </Button>
            </div>
            {canCreatePeticao ? (
              <Button
                color="primary"
                size="sm"
                startContent={<PlusIcon size={16} />}
                onPress={openCreateModal}
              >
                Nova Petição
              </Button>
            ) : null}
          </>
        }
      />

      {/* Dashboard Cards */}
      {loadingDashboard ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : dashboard ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <PeopleMetricCard
            helper="Volume total"
            icon={<DocumentTextIcon className="h-4 w-4" />}
            label="Total de petições"
            tone="primary"
            value={dashboard.total}
          />
          <PeopleMetricCard
            helper="Pendentes de envio"
            icon={<DocumentTextIcon className="h-4 w-4" />}
            label="Rascunhos"
            tone="default"
            value={dashboard.rascunhos}
          />
          <PeopleMetricCard
            helper="Acompanhamento interno"
            icon={<ClockIcon className="h-4 w-4" />}
            label="Em análise"
            tone="warning"
            value={dashboard.emAnalise}
          />
          <PeopleMetricCard
            helper="Últimos 30 dias"
            icon={<CheckCircleIcon className="h-4 w-4" />}
            label="Protocoladas"
            tone="success"
            value={dashboard.protocoladasRecentes}
          />
        </div>
      ) : null}

      <Card className="border border-white/10 bg-background/70">
        <CardBody className="space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              isClearable
              className="min-w-[260px] flex-1"
              placeholder="Buscar por título, descrição ou protocolo..."
              startContent={
                <MagnifyingGlassIcon className="text-default-400" size={16} />
              }
              value={searchTerm}
              onClear={() => handleSearch("")}
              onValueChange={handleSearch}
            />

            <Button
              size="sm"
              startContent={<FilterIcon size={16} />}
              variant="bordered"
              onPress={() => setShowFilters((prev) => !prev)}
            >
              Filtros
            </Button>

            {hasActiveFilters ? (
              <Button
                color="default"
                size="sm"
                startContent={<XMarkIcon size={16} />}
                variant="light"
                onPress={clearFilters}
              >
                Limpar
              </Button>
            ) : null}
          </div>

          {showFilters ? (
            <div className="grid gap-3 pt-1 sm:max-w-xs">
              <Select
                className="w-full"
                label="Status da petição"
                selectedKeys={[selectedStatusKey]}
                onSelectionChange={(keys) => {
                  const value = String(Array.from(keys)[0] || "all");
                  handleStatusFilter(value === "all" ? "" : value);
                }}
              >
                <SelectItem key="all" textValue="Todos">
                  Todos
                </SelectItem>
                <SelectItem key={PeticaoStatus.RASCUNHO} textValue="Rascunho">
                  Rascunho
                </SelectItem>
                <SelectItem
                  key={PeticaoStatus.EM_ANALISE}
                  textValue="Em Análise"
                >
                  Em Análise
                </SelectItem>
                <SelectItem
                  key={PeticaoStatus.PROTOCOLADA}
                  textValue="Protocolada"
                >
                  Protocolada
                </SelectItem>
                <SelectItem
                  key={PeticaoStatus.INDEFERIDA}
                  textValue="Indeferida"
                >
                  Indeferida
                </SelectItem>
                <SelectItem key={PeticaoStatus.ARQUIVADA} textValue="Arquivada">
                  Arquivada
                </SelectItem>
              </Select>
            </div>
          ) : null}
        </CardBody>
      </Card>

      <Card className="border border-white/10 bg-background/70">
        <div className="flex flex-col gap-1 border-b border-white/10 px-5 py-4">
          <h2 className="text-lg font-semibold text-white">
            Lista de petições ({pagination.total})
          </h2>
          <p className="text-sm text-default-400">
            Clique em um item para visualizar detalhes e acompanhar o fluxo.
          </p>
        </div>
        <Divider />
        <CardBody className="p-0">
          {loadingPeticoes ? (
            <div className="space-y-4 p-5">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 rounded-xl" />
              ))}
            </div>
          ) : peticoes.length === 0 ? (
            <div className="p-12 text-center text-default-500">
              <DocumentTextIcon className="mx-auto mb-4 opacity-50" size={48} />
              <p className="text-lg">Nenhuma petição encontrada</p>
              <p className="mt-2 text-sm">
                {hasActiveFilters
                  ? "Tente ajustar os filtros"
                  : "Crie sua primeira petição"}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-white/10">
              {peticoes.map((peticao) => (
                <div
                  key={peticao.id}
                  aria-label={`Ver detalhes da petição ${peticao.titulo}`}
                  className="ml-wave-surface cursor-pointer px-5 py-4 transition-colors hover:bg-white/[0.03]"
                  role="button"
                  tabIndex={0}
                  onClick={() => openViewModal(peticao)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openViewModal(peticao);
                    }
                  }}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-lg truncate">
                          {peticao.titulo}
                        </h3>
                        {getStatusBadge(peticao.status)}
                        {peticao.tipo && (
                          <Chip size="sm" variant="bordered">
                            {peticao.tipo}
                          </Chip>
                        )}
                      </div>

                      <div className="space-y-1 text-sm text-default-500">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">Processo:</span>
                          <span>{peticao.processo.numero}</span>
                          {peticao.processo.titulo && (
                            <span className="text-default-400">
                              • {peticao.processo.titulo}
                            </span>
                          )}
                        </div>

                        {peticao.protocoloNumero && (
                          <div className="flex items-center gap-2">
                            <DocumentCheckIcon size={16} />
                            <span>Protocolo: {peticao.protocoloNumero}</span>
                            {peticao.protocoladoEm && (
                              <span className="text-default-400">
                                •{" "}
                                {new Date(
                                  peticao.protocoladoEm,
                                ).toLocaleDateString("pt-BR")}
                              </span>
                            )}
                          </div>
                        )}

                        {peticao.descricao && (
                          <p className="line-clamp-2">{peticao.descricao}</p>
                        )}

                        {peticao.documento && (
                          <div className="flex items-center gap-2 text-primary">
                            <DocumentTextIcon size={16} />
                            <span>{peticao.documento.nome}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-start">
                      {canEditPeticao &&
                      peticao.documento &&
                      (peticao.status === PeticaoStatus.RASCUNHO ||
                        peticao.status === PeticaoStatus.EM_ANALISE) ? (
                        <Button
                          color="success"
                          size="sm"
                          variant="flat"
                          onClick={(event) => event.stopPropagation()}
                          onPress={() => openProtocoloModal(peticao.id)}
                        >
                          Protocolar
                        </Button>
                      ) : null}

                      {canEditPeticao && peticao.documento ? (
                        <Button
                          color="secondary"
                          size="sm"
                          startContent={<PenToolIcon size={16} />}
                          variant="flat"
                          onClick={(event) => event.stopPropagation()}
                          onPress={() => openAssinaturaModal(peticao.id)}
                        >
                          Assinar
                        </Button>
                      ) : null}

                      {canEditPeticao ? (
                        <Button
                          isIconOnly
                          size="sm"
                          variant="light"
                          onClick={(event) => event.stopPropagation()}
                          onPress={() => openEditModal(peticao)}
                        >
                          <PencilIcon size={16} />
                        </Button>
                      ) : null}

                      {canDeletePeticao ? (
                        <Button
                          isIconOnly
                          color="danger"
                          size="sm"
                          variant="light"
                          onClick={(event) => event.stopPropagation()}
                          onPress={() => handleDelete(peticao.id)}
                        >
                          <TrashIcon size={16} />
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
        {pagination.totalPages > 1 ? (
          <div className="flex flex-col gap-3 border-t border-white/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-default-400">
              Exibindo {firstVisibleItem}-{lastVisibleItem} de {pagination.total}
            </p>
            <Pagination
              showControls
              page={pagination.page}
              total={pagination.totalPages}
              onChange={setCurrentPage}
            />
          </div>
        ) : null}
      </Card>

      {/* Modal de Criar/Editar/Visualizar */}
      <PeticaoModal
        isOpen={modalOpen}
        mode={modalMode}
        peticao={selectedPeticao}
        processos={processos}
        tipos={tipos}
        canCreatePeticao={canCreatePeticao}
        canEditPeticao={canEditPeticao}
        onClose={closeModal}
        onSuccess={() => {
          mutatePeticoes();
          closeModal();
        }}
      />

      {/* Modal de Protocolo */}
      <Modal
        isOpen={protocoloModalOpen}
        onClose={() => setProtocoloModalOpen(false)}
      >
        <ModalContent>
          <ModalHeader>Protocolar Petição</ModalHeader>
          <ModalBody>
            <Input
              isRequired
              label="Número do Protocolo"
              placeholder="Ex: 2025.0001.12345-6"
              value={protocoloNumero}
              onValueChange={setProtocoloNumero}
            />
          </ModalBody>
          <ModalFooter>
            <Button
              variant="light"
              onPress={() => setProtocoloModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button color="success" onPress={handleProtocolar}>
              Confirmar Protocolo
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Modal de Assinatura */}
      <AssinaturaModal
        isOpen={assinaturaModalOpen}
        peticaoId={assinaturaPeticaoId}
        onClose={() => {
          setAssinaturaModalOpen(false);
        }}
      />
    </div>
  );
}

// ============================================
// MODAL DE PETIÇÃO
// ============================================

interface PeticaoModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: "create" | "edit" | "view";
  peticao: Peticao | null;
  processos: any[];
  tipos: string[];
  canCreatePeticao: boolean;
  canEditPeticao: boolean;
  onSuccess: () => void;
}

function PeticaoModal({
  isOpen,
  onClose,
  mode,
  peticao,
  processos,
  tipos,
  canCreatePeticao,
  canEditPeticao,
  onSuccess,
}: PeticaoModalProps) {
  const [formData, setFormData] = useState<PeticaoCreateInput>({
    processoId: "",
    titulo: "",
    tipo: "",
    status: PeticaoStatus.RASCUNHO,
    descricao: "",
    observacoes: "",
  });

  const [loading, setLoading] = useState(false);
  const [modeloSelecionado, setModeloSelecionado] = useState<string>("");
  const [processandoModelo, setProcessandoModelo] = useState(false);

  // Upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  // Hook para buscar modelos ativos
  const { modelos: modelosDisponiveis, isLoading: loadingModelos } =
    useModelosPeticaoAtivos();

  useEffect(() => {
    if (mode === "create") {
      setFormData({
        processoId: "",
        titulo: "",
        tipo: "",
        status: PeticaoStatus.RASCUNHO,
        descricao: "",
        observacoes: "",
      });
      setSelectedFile(null);
    } else if (peticao) {
      setFormData({
        processoId: peticao.processo.id,
        causaId: peticao.causa?.id,
        titulo: peticao.titulo,
        tipo: peticao.tipo || "",
        status: peticao.status,
        descricao: peticao.descricao || "",
        observacoes: peticao.observacoes || "",
      });
      setSelectedFile(null);
    }
  }, [mode, peticao]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];

    if (file) {
      // Validar tipo
      if (file.type !== "application/pdf") {
        toast.error("Apenas arquivos PDF são permitidos");

        return;
      }
      // Validar tamanho (10MB)
      if (file.size > 10 * 1024 * 1024) {
        toast.error("Arquivo muito grande. Máximo: 10MB");

        return;
      }
      setSelectedFile(file);
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
  };

  const handleAplicarModelo = async (modeloId: string) => {
    if (!modeloId || !formData.processoId) {
      if (!formData.processoId) {
        toast.warning("Selecione um processo primeiro");
      }

      return;
    }

    setProcessandoModelo(true);

    try {
      // Buscar dados do processo selecionado
      const processoSelecionado = processos.find(
        (p: any) => p.id === formData.processoId,
      );

      if (!processoSelecionado) {
        toast.error("Processo não encontrado");

        return;
      }

      // Preparar variáveis para o template
      const variaveis: Record<string, any> = {
        processo_numero: processoSelecionado.numero || "",
        processo_titulo: processoSelecionado.titulo || "",
        cliente_nome: processoSelecionado.cliente?.nome || "",
        cliente_documento: processoSelecionado.cliente?.documento || "",
        advogado_nome: "", // TODO: Buscar do contexto do usuário
        advogado_oab: "", // TODO: Buscar do contexto do usuário
        tribunal_nome: processoSelecionado.tribunal?.nome || "",
        data_atual: new Date().toLocaleDateString("pt-BR"),
        valor: processoSelecionado.valorCausa || "",
      };

      // Processar template
      const resultado = await processarTemplate(modeloId, variaveis);

      if (resultado.success && resultado.data) {
        // Preencher campos automaticamente
        const modeloInfo = modelosDisponiveis?.find((m) => m.id === modeloId);

        setFormData({
          ...formData,
          titulo: modeloInfo?.nome || formData.titulo,
          tipo: modeloInfo?.tipo || formData.tipo,
          descricao: resultado.data,
        });

        toast.success("Modelo aplicado com sucesso!");
      } else {
        toast.error(resultado.error || "Erro ao processar modelo");
      }
    } catch (error) {
      toast.error("Erro ao aplicar modelo");
    } finally {
      setProcessandoModelo(false);
    }
  };

  const handleSubmit = async () => {
    if (!formData.processoId || !formData.titulo) {
      toast.error("Preencha todos os campos obrigatórios");

      return;
    }

    setLoading(true);

    try {
      let result;
      let peticaoId: string | undefined;

      if (mode === "create") {
        result = await createPeticao(formData);
        peticaoId = result?.data?.id;
      } else if (mode === "edit" && peticao) {
        result = await updatePeticao(peticao.id, formData);
        peticaoId = peticao.id;
      }

      if (!result?.success) {
        toast.error(result?.error || "Erro ao salvar");

        return;
      }

      // Upload de documento se houver
      if (selectedFile && peticaoId) {
        setUploading(true);

        // Converter arquivo para base64
        const arrayBuffer = await selectedFile.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64 = buffer.toString("base64");

        const uploadResult = await uploadDocumentoPeticao(
          peticaoId,
          base64,
          selectedFile.name,
          {
            fileName: formData.titulo,
            description: formData.descricao || undefined,
          },
        );

        if (!uploadResult.success) {
          toast.warning(
            `Petição salva, mas erro no upload: ${uploadResult.error}`,
          );
        }
      }

      toast.success(result.message || "Sucesso!");
      onSuccess();
    } catch (error) {
      toast.error("Erro ao salvar petição");
    } finally {
      setLoading(false);
      setUploading(false);
    }
  };

  const handleRemoverDocumento = async () => {
    if (!peticao?.id) return;

    if (!confirm("Deseja remover o documento desta petição?")) return;

    const result = await removerDocumentoPeticao(peticao.id);

    if (result.success) {
      toast.success("Documento removido");
      onSuccess();
    } else {
      toast.error(result.error || "Erro ao remover");
    }
  };

  const isReadOnly = mode === "view";
  const canPersist =
    mode === "create"
      ? canCreatePeticao
      : mode === "edit"
        ? canEditPeticao
        : false;

  return (
    <Modal isOpen={isOpen} scrollBehavior="inside" size="3xl" onClose={onClose}>
      <ModalContent>
        <ModalHeader>
          {mode === "create" && "Nova Petição"}
          {mode === "edit" && "Editar Petição"}
          {mode === "view" && "Detalhes da Petição"}
        </ModalHeader>
        <ModalBody className="gap-4">
          <Select
            isRequired
            isDisabled={isReadOnly}
            label="Processo"
            placeholder="Selecione o processo"
            selectedKeys={
              formData.processoId &&
              processos.some((p: any) => p.id === formData.processoId)
                ? [formData.processoId]
                : []
            }
            onSelectionChange={(keys) => {
              const value = Array.from(keys)[0];

              setFormData({ ...formData, processoId: value as string });
            }}
          >
            {processos.map((proc: any) => (
              <SelectItem
                key={proc.id}
                textValue={`${proc.numero}${proc.titulo ? ` - ${proc.titulo}` : ""}`}
              >
                {proc.numero} {proc.titulo ? `- ${proc.titulo}` : ""}
              </SelectItem>
            ))}
          </Select>

          {mode === "create" && (
            <div className="space-y-2">
              <Select
                description={
                  !formData.processoId
                    ? "Selecione um processo primeiro"
                    : "O modelo preencherá automaticamente os campos"
                }
                isDisabled={!formData.processoId || processandoModelo}
                isLoading={loadingModelos}
                label="Modelo de Petição (Opcional)"
                placeholder="Selecione um modelo para preencher automaticamente"
                selectedKeys={modeloSelecionado ? [modeloSelecionado] : []}
                onSelectionChange={(keys) => {
                  const value = Array.from(keys)[0] as string;

                  setModeloSelecionado(value);
                  if (value) {
                    handleAplicarModelo(value);
                  }
                }}
              >
                {(modelosDisponiveis || []).map((modelo) => (
                  <SelectItem
                    key={modelo.id}
                    description={modelo.categoria || undefined}
                    textValue={modelo.nome}
                  >
                    <div className="flex flex-col">
                      <span className="font-medium">{modelo.nome}</span>
                      {modelo.categoria && (
                        <span className="text-xs text-default-400">
                          {modelo.categoria}
                        </span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </Select>
              {processandoModelo && (
                <p className="text-sm text-primary">⏳ Processando modelo...</p>
              )}
            </div>
          )}

          <Input
            isRequired
            isReadOnly={isReadOnly}
            label="Título da Petição"
            placeholder="Ex: Contestação, Recurso de Apelação, etc"
            value={formData.titulo}
            onValueChange={(value) =>
              setFormData({ ...formData, titulo: value })
            }
          />

          <Autocomplete
            allowsCustomValue
            isDisabled={isReadOnly}
            inputValue={formData.tipo || ""}
            label="Tipo de Petição"
            placeholder="Selecione ou digite um tipo"
            selectedKey={formData.tipo && tipos.includes(formData.tipo) ? formData.tipo : null}
            onInputChange={(value) =>
              setFormData({ ...formData, tipo: value })
            }
            onSelectionChange={(key) =>
              setFormData({ ...formData, tipo: key ? String(key) : "" })
            }
          >
            {tipos.map((tipo) => (
              <AutocompleteItem key={tipo} textValue={tipo}>
                {tipo}
              </AutocompleteItem>
            ))}
          </Autocomplete>

          <Select
            isDisabled={isReadOnly}
            label="Status"
            selectedKeys={formData.status ? [formData.status] : []}
            onSelectionChange={(keys) => {
              const value = Array.from(keys)[0];

              setFormData({ ...formData, status: value as PeticaoStatus });
            }}
          >
            <SelectItem key={PeticaoStatus.RASCUNHO} textValue="Rascunho">
              Rascunho
            </SelectItem>
            <SelectItem key={PeticaoStatus.EM_ANALISE} textValue="Em Análise">
              Em Análise
            </SelectItem>
            <SelectItem
              key={PeticaoStatus.PROTOCOLADA}
              isDisabled={!isReadOnly && formData.status !== PeticaoStatus.PROTOCOLADA}
              textValue="Protocolada"
            >
              Protocolada
            </SelectItem>
            <SelectItem key={PeticaoStatus.INDEFERIDA} textValue="Indeferida">
              Indeferida
            </SelectItem>
            <SelectItem key={PeticaoStatus.ARQUIVADA} textValue="Arquivada">
              Arquivada
            </SelectItem>
          </Select>

          <Textarea
            isReadOnly={isReadOnly}
            label="Descrição"
            minRows={3}
            placeholder="Descreva o conteúdo da petição..."
            value={formData.descricao || ""}
            onValueChange={(value) =>
              setFormData({ ...formData, descricao: value })
            }
          />

          <Textarea
            isReadOnly={isReadOnly}
            label="Observações"
            minRows={2}
            placeholder="Observações internas..."
            value={formData.observacoes || ""}
            onValueChange={(value) =>
              setFormData({ ...formData, observacoes: value })
            }
          />

          {/* Upload de Documento */}
          {!isReadOnly && (
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="file-upload">
                Documento PDF
              </label>

              {/* Mostrar documento existente */}
              {mode === "edit" && peticao?.documento && !selectedFile && (
                <div className="p-4 border rounded-lg bg-default-50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <DocumentTextIcon className="text-primary" size={20} />
                      <div>
                        <p className="font-medium">{peticao.documento.nome}</p>
                        <p className="text-xs text-default-500">
                          {peticao.documento.tamanhoBytes
                            ? `${(peticao.documento.tamanhoBytes / 1024).toFixed(0)} KB`
                            : "Tamanho desconhecido"}
                        </p>
                      </div>
                    </div>
                    <Button
                      color="danger"
                      size="sm"
                      variant="light"
                      onPress={handleRemoverDocumento}
                    >
                      Remover
                    </Button>
                  </div>
                </div>
              )}

              {/* Upload de novo documento */}
              {!peticao?.documento || selectedFile ? (
                <div className="border-2 border-dashed rounded-lg p-6 text-center hover:border-primary transition-colors">
                  <input
                    accept=".pdf"
                    className="hidden"
                    id="file-upload"
                    type="file"
                    onChange={handleFileChange}
                  />
                  {selectedFile ? (
                    <div className="space-y-2">
                      <DocumentTextIcon
                        className="text-primary mx-auto"
                        size={32}
                      />
                      <div>
                        <p className="font-medium">{selectedFile.name}</p>
                        <p className="text-sm text-default-500">
                          {(selectedFile.size / 1024).toFixed(0)} KB
                        </p>
                      </div>
                      <Button
                        color="danger"
                        size="sm"
                        variant="light"
                        onPress={handleRemoveFile}
                      >
                        Remover
                      </Button>
                    </div>
                  ) : (
                    <label className="cursor-pointer" htmlFor="file-upload">
                      <ArrowUpTrayIcon
                        className="text-default-400 mx-auto mb-2"
                        size={32}
                      />
                      <p className="text-sm font-medium text-default-600">
                        Clique para selecionar um arquivo PDF
                      </p>
                      <p className="text-xs text-default-400">Máximo 10MB</p>
                    </label>
                  )}
                </div>
              ) : null}
            </div>
          )}

          {mode === "view" && peticao?.documento && (
            <div className="p-4 bg-primary-50 rounded-lg">
              <div className="flex items-center gap-2">
                <DocumentTextIcon className="text-primary" size={20} />
                <div>
                  <p className="text-sm font-medium text-primary-700">
                    {peticao.documento.nome}
                  </p>
                  <a
                    className="text-xs text-primary-600 hover:underline"
                    href={peticao.documento.url}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    Visualizar documento →
                  </a>
                </div>
              </div>
            </div>
          )}

          {mode === "view" && peticao?.protocoloNumero && (
            <div className="p-4 bg-success-50 rounded-lg">
              <p className="text-sm font-medium text-success-700">
                Protocolo: {peticao.protocoloNumero}
              </p>
              {peticao.protocoladoEm && (
                <p className="text-xs text-success-600 mt-1">
                  Protocolado em:{" "}
                  {new Date(peticao.protocoladoEm).toLocaleString("pt-BR")}
                </p>
              )}
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="light" onPress={onClose}>
            {isReadOnly ? "Fechar" : "Cancelar"}
          </Button>
          {!isReadOnly && (
            <Button
              color="primary"
              isDisabled={!canPersist}
              isLoading={loading || uploading}
              onPress={handleSubmit}
            >
              {uploading
                ? "Enviando..."
                : mode === "create"
                  ? "Criar"
                  : "Salvar"}
            </Button>
          )}
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

// ============================================
// MODAL DE ASSINATURA
// ============================================

interface AssinaturaModalProps {
  isOpen: boolean;
  onClose: () => void;
  peticaoId: string;
}

function AssinaturaModal({ isOpen, onClose, peticaoId }: AssinaturaModalProps) {
  const { data: assinaturasData } = useAssinaturas(peticaoId);
  const { data: peticaoAssinadaData } = usePeticaoAssinada(peticaoId);

  const assinaturas = assinaturasData?.data || [];
  const peticaoAssinada = peticaoAssinadaData?.data?.assinada || false;
  const totalAssinaturas = peticaoAssinadaData?.data?.assinaturas || 0;

  return (
    <Modal isOpen={isOpen} size="2xl" onClose={onClose}>
      <ModalContent>
        <ModalHeader className="flex items-center gap-2">
          <PenToolIcon size={24} />
          Assinatura Digital
        </ModalHeader>
        <ModalBody className="gap-6">
          {/* Status da Petição */}
          {peticaoAssinada && (
            <div className="p-4 bg-success-50 rounded-lg border border-success-200">
              <div className="flex items-center gap-2 text-success-700">
                <CheckCircleIcon size={20} />
                <span className="font-medium">
                  Petição assinada por {totalAssinaturas}{" "}
                  {totalAssinaturas === 1 ? "pessoa" : "pessoas"}
                </span>
              </div>
            </div>
          )}

          {/* Lista de Assinaturas Existentes */}
          {assinaturas.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-default-600 flex items-center gap-2">
                <UsersIcon size={16} />
                Assinaturas Registradas ({assinaturas.length})
              </h3>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {assinaturas.map((assinatura) => (
                  <div
                    key={assinatura.id}
                    className="p-3 bg-default-50 rounded-lg border border-default-200"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-medium text-sm">
                          {assinatura.assinanteNome}
                        </p>
                        {assinatura.assinanteEmail && (
                          <p className="text-xs text-default-500">
                            {assinatura.assinanteEmail}
                          </p>
                        )}
                        {assinatura.assinanteDocumento && (
                          <p className="text-xs text-default-500">
                            CPF: {assinatura.assinanteDocumento}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <Chip
                          color={
                            assinatura.status === "ASSINADO"
                              ? "success"
                              : assinatura.status === "PENDENTE"
                                ? "warning"
                                : assinatura.status === "EXPIRADO"
                                  ? "default"
                                  : "danger"
                          }
                          size="sm"
                          variant="flat"
                        >
                          {assinatura.status}
                        </Chip>
                        {assinatura.assinadaEm && (
                          <p className="text-xs text-default-400 mt-1">
                            {new Date(assinatura.assinadaEm).toLocaleString(
                              "pt-BR",
                            )}
                          </p>
                        )}
                      </div>
                    </div>
                    {assinatura.provedorAssinatura && (
                      <div className="mt-2 flex items-center gap-1 text-xs text-default-500">
                        <ShieldCheckIcon size={12} />
                        <span>{assinatura.provedorAssinatura}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <Divider />

          {/* Aviso - Funcionalidade Futura */}
          <div className="p-6 bg-default-100 rounded-lg border-2 border-default-200 text-center">
            <div className="flex flex-col items-center gap-3">
              <div className="p-3 bg-default-200 rounded-full">
                <ShieldCheckIcon className="text-default-600" size={32} />
              </div>
              <h3 className="text-lg font-semibold text-default-700">
                Assinatura Digital
              </h3>
              <p className="text-sm text-default-600 max-w-md">
                Funcionalidade de assinatura digital será implementada em breve.
                O sistema está preparado para integração com soluções de
                assinatura eletrônica e certificados digitais.
              </p>
            </div>
          </div>

          {/* Informações */}
          <div className="p-3 bg-default-50 rounded-lg">
            <p className="text-xs text-default-600">
              <strong>Nota:</strong> A estrutura de assinaturas está pronta.
              Aguardando definição da solução de assinatura digital a ser
              utilizada.
            </p>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="light" onPress={onClose}>
            Fechar
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
