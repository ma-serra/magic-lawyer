"use client";

import type { CepData, CnpjData } from "@/types/brazil";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Key,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Chip } from "@heroui/chip";
import {
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
} from "@heroui/dropdown";
import { Divider } from "@heroui/divider";
import { Avatar } from "@heroui/avatar";
import { Textarea } from "@heroui/input";
import { Checkbox } from "@heroui/checkbox";
import { Badge } from "@heroui/badge";
import { Tooltip } from "@heroui/tooltip";
import { Skeleton } from "@heroui/skeleton";
import { Spinner } from "@heroui/spinner";
import {
  Plus,
  Search,
  MoreVertical,
  Edit,
  Trash2,
  Eye,
  User,
  Building2,
  Phone,
  Mail,
  FileText,
  Users,
  Key as KeyIcon,
  Copy,
  CheckCircle,
  KeyRound,
  RefreshCw,
  AlertCircle,
  Filter,
  RotateCcw,
  XCircle,
  TrendingUp,
  BarChart3,
  Target,
  Calendar,
  Info,
  Smartphone,
  Activity,
  UploadCloud,
} from "lucide-react";
import { toast } from "@/lib/toast";
import Link from "next/link";
import {
  Modal as HeroUIModal,
  ModalContent,
  ModalBody,
  ModalFooter,
  Pagination,
  Tabs,
  Tab,
  Select,
  SelectItem,
} from "@heroui/react";

import { useUserPermissions } from "@/app/hooks/use-user-permissions";
import { useClientesAdvogado, useAllClientes } from "@/app/hooks/use-clientes";
import { useAdvogadosParaSelect } from "@/app/hooks/use-advogados-select";
import { fadeInUp } from "@/components/ui/motion-presets";
import { ModalHeaderGradient } from "@/components/ui/modal-header-gradient";
import { ModalSectionCard } from "@/components/ui/modal-section-card";
import { ClienteCreateModal } from "@/components/clientes/cliente-create-modal";
import {
  updateCliente,
  deleteCliente,
  resetarSenhaCliente,
  type Cliente,
  type ClienteCreateInput,
  type ClienteUpdateInput,
} from "@/app/actions/clientes";
import { importarClientesPlanilha } from "@/app/actions/clientes-importacao";
import { buscarCepAction } from "@/app/actions/brazil-apis";
import { TipoPessoa } from "@/generated/prisma";
import { Modal } from "@/components/ui/modal";
import { CpfInput } from "@/components/cpf-input";
import { CnpjInput } from "@/components/cnpj-input";
import { BulkExcelImportModal } from "@/components/bulk-excel-import-modal";
import {
  PeopleEntityCard,
  PeopleEntityCardBody,
  PeopleEntityCardHeader,
  PeopleMetricCard,
  PeoplePageHeader,
} from "@/components/people-ui";
import { DateInput } from "@/components/ui/date-input";

function formatDateToInput(value?: Date | string | null) {
  if (!value) {
    return "";
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function parseDateFromInput(value: string) {
  if (!value) {
    return undefined;
  }

  const [year, month, day] = value.split("-").map((part) => Number(part));

  if (!year || !month || !day) {
    return undefined;
  }

  return new Date(year, month - 1, day);
}

function formatCepForInput(value: string) {
  const digitsOnly = value.replace(/\D/g, "").slice(0, 8);

  if (digitsOnly.length <= 5) {
    return digitsOnly;
  }

  return `${digitsOnly.slice(0, 5)}-${digitsOnly.slice(5)}`;
}

const INITIAL_ENDERECO_PRINCIPAL: NonNullable<
  ClienteCreateInput["enderecoPrincipal"]
> = {
  cep: "",
  logradouro: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  estado: "",
  pais: "Brasil",
};

function normalizeEnderecoPrincipalForPayload(
  endereco?: ClienteCreateInput["enderecoPrincipal"],
): ClienteCreateInput["enderecoPrincipal"] {
  if (!endereco) {
    return undefined;
  }

  const payload = {
    cep: endereco.cep?.trim() || "",
    logradouro: endereco.logradouro?.trim() || "",
    numero: endereco.numero?.trim() || "",
    complemento: endereco.complemento?.trim() || "",
    bairro: endereco.bairro?.trim() || "",
    cidade: endereco.cidade?.trim() || "",
    estado: endereco.estado?.trim().toUpperCase() || "",
    pais: endereco.pais?.trim() || "Brasil",
  };

  const hasEndereco =
    payload.cep ||
    payload.logradouro ||
    payload.numero ||
    payload.complemento ||
    payload.bairro ||
    payload.cidade ||
    payload.estado;

  return hasEndereco ? payload : undefined;
}

type EnderecoPrincipalField = keyof NonNullable<
  ClienteCreateInput["enderecoPrincipal"]
>;

const INITIAL_CLIENTE_FORM_STATE: ClienteCreateInput = {
  tipoPessoa: TipoPessoa.FISICA,
  nome: "",
  documento: "",
  email: "",
  telefone: "",
  celular: "",
  dataNascimento: undefined,
  inscricaoEstadual: "",
  nomePai: "",
  documentoPai: "",
  nomeMae: "",
  documentoMae: "",
  observacoes: "",
  responsavelNome: "",
  responsavelEmail: "",
  responsavelTelefone: "",
  enderecoPrincipal: INITIAL_ENDERECO_PRINCIPAL,
  advogadosIds: undefined,
};

function getInitials(nome: string) {
  const names = nome.split(" ");

  if (names.length >= 2) {
    return `${names[0][0]}${names[names.length - 1][0]}`.toUpperCase();
  }

  return nome.substring(0, 2).toUpperCase();
}

interface ClientesListSectionProps {
  clientesFiltrados: Cliente[];
  paginationResetKey: string;
  isLoading: boolean;
  hasActiveFilters: boolean;
  canCreateClient: boolean;
  onOpenCreateModal: () => void;
  onViewCliente: (cliente: Cliente) => void;
  onEditCliente: (cliente: Cliente) => void;
  onOpenResetModal: (cliente: Cliente) => void;
  onDeleteCliente: (clienteId: string) => void | Promise<void>;
}

const ClientesListSection = memo(function ClientesListSection({
  clientesFiltrados,
  paginationResetKey,
  isLoading,
  hasActiveFilters,
  canCreateClient,
  onOpenCreateModal,
  onViewCliente,
  onEditCliente,
  onOpenResetModal,
  onDeleteCliente,
}: ClientesListSectionProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(12);
  const scrollRestoreRef = useRef<number | null>(null);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(clientesFiltrados.length / itemsPerPage)),
    [clientesFiltrados.length, itemsPerPage],
  );

  const paginatedClientes = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;

    return clientesFiltrados.slice(start, end);
  }, [clientesFiltrados, currentPage, itemsPerPage]);

  const visibleRange = useMemo(() => {
    if (clientesFiltrados.length === 0) {
      return { start: 0, end: 0 };
    }

    const start = (currentPage - 1) * itemsPerPage + 1;
    const end = Math.min(currentPage * itemsPerPage, clientesFiltrados.length);

    return { start, end };
  }, [clientesFiltrados.length, currentPage, itemsPerPage]);

  const handleItemsPerPageChange = useCallback((keys: unknown) => {
    if (!keys || keys === "all") {
      return;
    }

    let selectedValue: string | undefined;

    if (typeof keys === "string") {
      selectedValue = keys;
    } else if (keys instanceof Set) {
      selectedValue = Array.from(keys).find(
        (value): value is string => typeof value === "string",
      );
    } else if (
      typeof keys === "object" &&
      keys !== null &&
      "currentKey" in keys
    ) {
      const currentKey = (keys as { currentKey?: Key | null }).currentKey;

      if (typeof currentKey === "string") {
        selectedValue = currentKey;
      }
    }

    const parsed = selectedValue ? Number(selectedValue) : NaN;

    if (!Number.isFinite(parsed) || parsed <= 0) {
      return;
    }

    setItemsPerPage(parsed);
  }, []);

  const handlePageChange = useCallback((page: number) => {
    if (typeof window !== "undefined") {
      scrollRestoreRef.current = window.scrollY;
    }

    setCurrentPage(page);
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [paginationResetKey, itemsPerPage]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    if (scrollRestoreRef.current == null || typeof window === "undefined") {
      return;
    }

    const nextScrollTop = scrollRestoreRef.current;
    scrollRestoreRef.current = null;

    const raf = window.requestAnimationFrame(() => {
      window.scrollTo({ top: nextScrollTop, behavior: "auto" });
    });

    return () => window.cancelAnimationFrame(raf);
  }, [currentPage]);

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      initial={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.4, delay: 0.1 }}
    >
      <Card className="border border-divider/70 bg-content1/75 shadow-sm backdrop-blur-md">
        <CardHeader className="border-b border-divider/70 px-4 py-4 sm:px-6">
          <div className="flex w-full flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-foreground sm:text-2xl">
                  Carteira de Clientes
                </h2>
                <p className="text-sm text-default-500">
                  {clientesFiltrados.length} cliente(s) encontrado(s)
                </p>
              </div>
            </div>
            <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
              <Select
                aria-label="Itens por página na lista de clientes"
                className="w-full sm:w-[170px]"
                selectedKeys={[String(itemsPerPage)]}
                size="sm"
                variant="bordered"
                onSelectionChange={handleItemsPerPageChange}
              >
                {[12, 24, 48].map((value) => (
                  <SelectItem
                    key={String(value)}
                    textValue={`${value} por página`}
                  >
                    {`${value} por página`}
                  </SelectItem>
                ))}
              </Select>
              <Badge
                color="primary"
                content={clientesFiltrados.length}
                size="lg"
                variant="shadow"
              >
                <Target
                  className="text-indigo-600 dark:text-indigo-400"
                  size={20}
                />
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardBody className="p-4 sm:p-6">
          {isLoading ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-64 rounded-xl" />
              ))}
            </div>
          ) : clientesFiltrados.length === 0 ? (
            <motion.div
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-16"
              initial={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.3 }}
            >
              <div className="p-6 bg-linear-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900 rounded-full w-24 h-24 mx-auto mb-6 flex items-center justify-center">
                <Users className="text-slate-400" size={48} />
              </div>
              <h3 className="text-xl font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Nenhum cliente encontrado
              </h3>
              <p className="text-slate-500 dark:text-slate-400 mb-6">
                {hasActiveFilters
                  ? "Tente ajustar os filtros para encontrar clientes"
                  : "Comece adicionando seu primeiro cliente"}
              </p>
              {!hasActiveFilters && canCreateClient && (
                <Button
                  className="bg-linear-to-r from-blue-600 to-indigo-600"
                  color="primary"
                  startContent={<Plus size={20} />}
                  onPress={onOpenCreateModal}
                >
                  Adicionar Primeiro Cliente
                </Button>
              )}
            </motion.div>
          ) : (
            <>
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                <AnimatePresence>
                  {paginatedClientes.map((cliente, index) => (
                    <motion.div
                      key={cliente.id}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      initial={{ opacity: 0, y: 20 }}
                      transition={{
                        duration: 0.24,
                        delay: Math.min(index * 0.03, 0.2),
                      }}
                      whileHover={{ scale: 1.02 }}
                    >
                      <PeopleEntityCard
                        isPressable
                        onPress={() => onViewCliente(cliente)}
                      >
                        <PeopleEntityCardHeader className="cursor-pointer">
                          <div className="flex gap-4 w-full">
                            <motion.div
                              transition={{
                                type: "spring",
                                stiffness: 400,
                                damping: 10,
                              }}
                              whileHover={{ scale: 1.1, rotate: 5 }}
                            >
                              <Avatar
                                showFallback
                                className="bg-blue-500 text-white shadow-lg"
                                icon={
                                  cliente.tipoPessoa === TipoPessoa.JURIDICA ? (
                                    <Building2 className="text-white" />
                                  ) : (
                                    <User className="text-white" />
                                  )
                                }
                                name={getInitials(cliente.nome)}
                                size="lg"
                              />
                            </motion.div>
                            <div className="flex flex-col flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <h3 className="font-bold text-lg text-slate-800 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                  {cliente.nome}
                                </h3>
                                {cliente.usuarioId && (
                                  <Badge
                                    color="success"
                                    content="✓"
                                    size="sm"
                                    variant="shadow"
                                  >
                                    <Chip
                                      className="font-semibold"
                                      color="success"
                                      size="sm"
                                      startContent={
                                        <KeyIcon className="h-3 w-3" />
                                      }
                                      variant="flat"
                                    >
                                      Acesso
                                    </Chip>
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <Chip
                                  color={
                                    cliente.tipoPessoa === TipoPessoa.FISICA
                                      ? "secondary"
                                      : "warning"
                                  }
                                  size="sm"
                                  startContent={
                                    cliente.tipoPessoa === TipoPessoa.FISICA ? (
                                      <User className="h-3 w-3" />
                                    ) : (
                                      <Building2 className="h-3 w-3" />
                                    )
                                  }
                                  variant="flat"
                                >
                                  {cliente.tipoPessoa === TipoPessoa.FISICA
                                    ? "Pessoa Física"
                                    : "Pessoa Jurídica"}
                                </Chip>
                              </div>
                            </div>
                            <Dropdown>
                              <DropdownTrigger>
                                <Button
                                  isIconOnly
                                  className="hover:bg-slate-200 dark:hover:bg-slate-700 hover:scale-110 transition-all"
                                  size="sm"
                                  variant="light"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownTrigger>
                              <DropdownMenu aria-label="Ações do cliente">
                                <DropdownItem
                                  key="view"
                                  as={Link}
                                  href={`/clientes/${cliente.id}`}
                                  startContent={<Eye className="h-4 w-4" />}
                                >
                                  Ver Detalhes
                                </DropdownItem>
                                <DropdownItem
                                  key="edit"
                                  startContent={<Edit className="h-4 w-4" />}
                                  onPress={() => onEditCliente(cliente)}
                                >
                                  Editar
                                </DropdownItem>
                                {cliente.usuarioId ? (
                                  <DropdownItem
                                    key="reset-password"
                                    className="text-warning"
                                    color="warning"
                                    startContent={
                                      <KeyRound className="h-4 w-4" />
                                    }
                                    onPress={() => onOpenResetModal(cliente)}
                                  >
                                    Reenviar Primeiro Acesso
                                  </DropdownItem>
                                ) : null}
                                <DropdownItem
                                  key="delete"
                                  className="text-danger"
                                  color="danger"
                                  startContent={<Trash2 className="h-4 w-4" />}
                                  onPress={() => onDeleteCliente(cliente.id)}
                                >
                                  Excluir
                                </DropdownItem>
                              </DropdownMenu>
                            </Dropdown>
                          </div>
                        </PeopleEntityCardHeader>
                        <PeopleEntityCardBody className="space-y-4 p-6">
                          <div className="space-y-3">
                            {cliente.documento && (
                              <div className="flex items-center gap-3 p-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                                <FileText className="h-4 w-4 text-blue-500" />
                                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                  {cliente.documento}
                                </span>
                              </div>
                            )}
                            {cliente.email && (
                              <div className="flex items-center gap-3 p-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                                <Mail className="h-4 w-4 text-green-500" />
                                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                  {cliente.email}
                                </span>
                              </div>
                            )}
                            {cliente.telefone && (
                              <div className="flex items-center gap-3 p-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                                <Phone className="h-4 w-4 text-purple-500" />
                                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                  {cliente.telefone}
                                </span>
                              </div>
                            )}
                          </div>

                          <Divider className="my-4" />

                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <div className="flex gap-2">
                                <Badge
                                  color="primary"
                                  content={cliente._count?.processos || 0}
                                  size="sm"
                                  variant="shadow"
                                >
                                  <Chip
                                    className="font-semibold"
                                    color="primary"
                                    size="md"
                                    variant="flat"
                                  >
                                    {cliente._count?.processos || 0} processo(s)
                                  </Chip>
                                </Badge>
                              </div>
                            </div>

                            <div className="flex gap-2">
                              <Button
                                as={Link}
                                className="flex-1 hover:scale-105 transition-transform"
                                color="primary"
                                href={`/clientes/${cliente.id}`}
                                onClick={(event) => event.stopPropagation()}
                                size="sm"
                                startContent={<Eye className="h-4 w-4" />}
                                variant="flat"
                              >
                                Ver Detalhes
                              </Button>
                              <Button
                                as={Link}
                                className="hover:scale-105 transition-transform"
                                color="secondary"
                                href={`/clientes/${cliente.id}`}
                                onClick={(event) => event.stopPropagation()}
                                size="sm"
                                startContent={<FileText className="h-4 w-4" />}
                                variant="flat"
                              >
                                Processos
                              </Button>
                            </div>
                          </div>
                        </PeopleEntityCardBody>
                      </PeopleEntityCard>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
              <div className="mt-6 flex flex-col gap-3 border-t border-divider/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-default-500">
                  Mostrando {visibleRange.start}-{visibleRange.end} de{" "}
                  {clientesFiltrados.length} cliente(s)
                </p>
                <Pagination
                  isCompact
                  showControls
                  className="self-center sm:self-auto"
                  color="primary"
                  page={currentPage}
                  size="sm"
                  total={totalPages}
                  onChange={handlePageChange}
                />
              </div>
            </>
          )}
        </CardBody>
      </Card>
    </motion.div>
  );
});

export function ClientesContent() {
  const { permissions, isSuperAdmin, isAdmin } = useUserPermissions();

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTipoPessoa, setSelectedTipoPessoa] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSearchingCep, setIsSearchingCep] = useState(false);
  const [credenciaisModal, setCredenciaisModal] = useState<{
    email: string;
    maskedEmail: string;
    primeiroAcessoEnviado: boolean;
    erroEnvio?: string;
  } | null>(null);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [clienteParaResetarSenha, setClienteParaResetarSenha] =
    useState<Cliente | null>(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [clienteParaVisualizar, setClienteParaVisualizar] =
    useState<Cliente | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  // Buscar clientes (advogado ou admin)
  const {
    clientes: clientesAdvogado,
    isLoading: isLoadingAdvogado,
    mutate: mutateAdvogado,
  } = useClientesAdvogado();
  const {
    clientes: clientesAdmin,
    isLoading: isLoadingAdmin,
    mutate: mutateAdmin,
  } = useAllClientes();
  const { advogados, isLoading: isLoadingAdvogados } = useAdvogadosParaSelect();

  const canManageAllClients = isAdmin || isSuperAdmin;
  const clientes = canManageAllClients ? clientesAdmin : clientesAdvogado;
  const isLoading = canManageAllClients ? isLoadingAdmin : isLoadingAdvogado;
  const mutate = canManageAllClients ? mutateAdmin : mutateAdvogado;

  const [formState, setFormState] = useState<ClienteCreateInput>(
    INITIAL_CLIENTE_FORM_STATE,
  );
  const advogadoIdSet = useMemo(
    () => new Set((advogados || []).map((advogado) => advogado.id)),
    [advogados],
  );
  const selectedAdvogadosKeys = useMemo(
    () => (formState.advogadosIds || []).filter((id) => advogadoIdSet.has(id)),
    [advogadoIdSet, formState.advogadosIds],
  );

  // Filtrar clientes
  const clientesFiltrados = useMemo(
    () =>
      clientes?.filter((cliente) => {
        const search = searchTerm.toLowerCase();
        const matchSearch =
          !searchTerm ||
          cliente.nome?.toLowerCase().includes(search) ||
          cliente.email?.toLowerCase().includes(search) ||
          cliente.documento?.toLowerCase().includes(search);

        const matchTipoPessoa =
          selectedTipoPessoa === "all" ||
          cliente.tipoPessoa === selectedTipoPessoa;

        return matchSearch && matchTipoPessoa;
      }) || [],
    [clientes, searchTerm, selectedTipoPessoa],
  );

  // Calcular métricas
  const metrics = useMemo(() => {
    if (!clientes)
      return {
        total: 0,
        comAcesso: 0,
        fisica: 0,
        juridica: 0,
        comProcessos: 0,
      };

    const total = clientes.length;
    const comAcesso = clientes.filter((c) => c.usuarioId).length;
    const fisica = clientes.filter(
      (c) => c.tipoPessoa === TipoPessoa.FISICA,
    ).length;
    const juridica = clientes.filter(
      (c) => c.tipoPessoa === TipoPessoa.JURIDICA,
    ).length;
    const comProcessos = clientes.filter(
      (c) => (c._count?.processos || 0) > 0,
    ).length;

    return { total, comAcesso, fisica, juridica, comProcessos };
  }, [clientes]);

  // Verificar se há filtros ativos
  const hasActiveFilters =
    searchTerm.trim().length > 0 || selectedTipoPessoa !== "all";
  const taxaAcesso = metrics.total
    ? Math.round((metrics.comAcesso / metrics.total) * 100)
    : 0;
  const taxaEngajamento = metrics.total
    ? Math.round((metrics.comProcessos / metrics.total) * 100)
    : 0;

  const clearFilters = useCallback(() => {
    setSearchTerm("");
    setSelectedTipoPessoa("all");
    setShowFilters(false);
  }, []);

  const handleImportClientes = useCallback(
    async (file: File) => {
      const formData = new FormData();

      formData.append("file", file);

      const result = await importarClientesPlanilha(formData);

      if (result.importedCount > 0) {
        await mutate();
      }

      return result;
    },
    [mutate],
  );

  const handleDeleteCliente = useCallback(
    async (clienteId: string) => {
      if (!confirm("Tem certeza que deseja excluir este cliente?")) return;

      try {
        const result = await deleteCliente(clienteId);

        if (result.success) {
          toast.success("Cliente excluído com sucesso!");
          mutate();
        } else {
          toast.error(result.error || "Erro ao excluir cliente");
        }
      } catch (error) {
        toast.error("Erro ao excluir cliente");
      }
    },
    [mutate],
  );


  const handleUpdateCliente = async () => {
    if (!selectedCliente?.id) return;

    if (!formState.nome) {
      toast.error("Nome é obrigatório");

      return;
    }

    setIsSaving(true);
    try {
      const updateData: ClienteUpdateInput = {
        nome: formState.nome,
        tipoPessoa: formState.tipoPessoa,
        documento: formState.documento,
        email: formState.email,
        telefone: formState.telefone,
        celular: formState.celular,
        dataNascimento:
          formState.tipoPessoa === TipoPessoa.FISICA
            ? formState.dataNascimento || undefined
            : undefined,
        inscricaoEstadual:
          formState.tipoPessoa === TipoPessoa.JURIDICA
            ? formState.inscricaoEstadual || undefined
            : undefined,
        nomePai:
          formState.tipoPessoa === TipoPessoa.FISICA
            ? formState.nomePai || undefined
            : undefined,
        documentoPai:
          formState.tipoPessoa === TipoPessoa.FISICA
            ? formState.documentoPai || undefined
            : undefined,
        nomeMae:
          formState.tipoPessoa === TipoPessoa.FISICA
            ? formState.nomeMae || undefined
            : undefined,
        documentoMae:
          formState.tipoPessoa === TipoPessoa.FISICA
            ? formState.documentoMae || undefined
            : undefined,
        observacoes: formState.observacoes,
        responsavelNome: formState.responsavelNome,
        responsavelEmail: formState.responsavelEmail,
        responsavelTelefone: formState.responsavelTelefone,
        enderecoPrincipal: normalizeEnderecoPrincipalForPayload(
          formState.enderecoPrincipal,
        ),
        advogadosIds: canManageAllClients
          ? formState.advogadosIds || []
          : undefined,
      };

      const result = await updateCliente(selectedCliente.id, updateData);

      if (result.success) {
        toast.success("Cliente atualizado com sucesso!");
        setIsEditModalOpen(false);
        setSelectedCliente(null);
        setFormState(INITIAL_CLIENTE_FORM_STATE);
        mutate();
      } else {
        toast.error(result.error || "Erro ao atualizar cliente");
      }
    } catch (error) {
      toast.error("Erro ao atualizar cliente");
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditCliente = useCallback((cliente: Cliente) => {
    const enderecoPrincipal = cliente.enderecos?.[0];

    setSelectedCliente(cliente);
    setFormState({
      nome: cliente.nome,
      tipoPessoa: cliente.tipoPessoa,
      documento: cliente.documento || "",
      email: cliente.email || "",
      telefone: cliente.telefone || "",
      celular: cliente.celular || "",
      dataNascimento: cliente.dataNascimento
        ? new Date(cliente.dataNascimento)
        : undefined,
      inscricaoEstadual: cliente.inscricaoEstadual || "",
      nomePai: cliente.nomePai || "",
      documentoPai: cliente.documentoPai || "",
      nomeMae: cliente.nomeMae || "",
      documentoMae: cliente.documentoMae || "",
      observacoes: cliente.observacoes || "",
      responsavelNome: cliente.responsavelNome || "",
      responsavelEmail: cliente.responsavelEmail || "",
      responsavelTelefone: cliente.responsavelTelefone || "",
      enderecoPrincipal: {
        cep: enderecoPrincipal?.cep || "",
        logradouro: enderecoPrincipal?.logradouro || "",
        numero: enderecoPrincipal?.numero || "",
        complemento: enderecoPrincipal?.complemento || "",
        bairro: enderecoPrincipal?.bairro || "",
        cidade: enderecoPrincipal?.cidade || "",
        estado: enderecoPrincipal?.estado || "",
        pais: enderecoPrincipal?.pais || "Brasil",
      },
      advogadosIds: (cliente.advogadoClientes || []).map(
        (vinculo) => vinculo.advogadoId,
      ),
    });
    setIsEditModalOpen(true);
  }, []);

  const handleViewCliente = useCallback((cliente: Cliente) => {
    setClienteParaVisualizar(cliente);
    setIsViewModalOpen(true);
  }, []);

  const handleCnpjFound = useCallback((cnpjData: CnpjData) => {
    setFormState((prev) => ({
      ...prev,
      nome: cnpjData.razao_social || prev.nome,
      documento: cnpjData.cnpj,
    }));
    toast.success("Dados do CNPJ carregados!");
  }, []);

  const handleCepFound = useCallback((cepData: CepData) => {
    setFormState((prev) => ({
      ...prev,
      enderecoPrincipal: {
        ...(prev.enderecoPrincipal || INITIAL_ENDERECO_PRINCIPAL),
        cep: formatCepForInput(
          cepData.cep || prev.enderecoPrincipal?.cep || "",
        ),
        logradouro:
          cepData.logradouro || prev.enderecoPrincipal?.logradouro || "",
        bairro: cepData.bairro || prev.enderecoPrincipal?.bairro || "",
        cidade: cepData.localidade || prev.enderecoPrincipal?.cidade || "",
        estado: (
          cepData.uf ||
          prev.enderecoPrincipal?.estado ||
          ""
        ).toUpperCase(),
      },
    }));
  }, []);

  const handleAdvogadosSelectionChange = useCallback(
    (keys: "all" | Set<Key>) => {
      if (keys === "all") {
        const allAdvogados = (advogados || []).map((advogado) => advogado.id);

        setFormState((prev) => ({
          ...prev,
          advogadosIds: allAdvogados.length > 0 ? allAdvogados : undefined,
        }));

        return;
      }

      const selected = Array.from(keys)
        .filter((key): key is string => typeof key === "string")
        .filter((id) => advogadoIdSet.has(id));

      setFormState((prev) => ({
        ...prev,
        advogadosIds: selected.length > 0 ? selected : [],
      }));
    },
    [advogadoIdSet, advogados],
  );

  const handleEnderecoPrincipalChange = useCallback(
    (field: EnderecoPrincipalField, value: string) => {
      setFormState((prev) => ({
        ...prev,
        enderecoPrincipal: {
          ...(prev.enderecoPrincipal || INITIAL_ENDERECO_PRINCIPAL),
          [field]: field === "cep" ? formatCepForInput(value) : value,
        },
      }));
    },
    [],
  );

  const handleEnderecoCepBlur = useCallback(async () => {
    const cep = formState.enderecoPrincipal?.cep || "";
    const cepNumerico = cep.replace(/\D/g, "");

    if (!cepNumerico) {
      return;
    }

    if (cepNumerico.length !== 8) {
      toast.error("CEP deve ter 8 dígitos");

      return;
    }

    try {
      setIsSearchingCep(true);
      const result = await buscarCepAction(cepNumerico);

      if (result.success && result.cepData) {
        handleCepFound(result.cepData);
      } else {
        toast.error(result.error || "CEP não encontrado");
      }
    } catch (error) {
      toast.error("Erro ao buscar CEP");
    } finally {
      setIsSearchingCep(false);
    }
  }, [formState.enderecoPrincipal?.cep, handleCepFound]);

  const handleOpenResetModal = useCallback((cliente: Cliente) => {
    if (!cliente.usuarioId) {
      toast.error("Este cliente não possui usuário de acesso");

      return;
    }
    setClienteParaResetarSenha(cliente);
  }, []);

  const handleOpenCreateModal = useCallback(() => {
    setFormState(INITIAL_CLIENTE_FORM_STATE);
    setIsCreateModalOpen(true);
  }, []);

  const applyTipoPessoaChange = useCallback((selectedTipo: TipoPessoa) => {
    setFormState((prev) => ({
      ...prev,
      tipoPessoa: selectedTipo,
      dataNascimento:
        selectedTipo === TipoPessoa.JURIDICA ? undefined : prev.dataNascimento,
      inscricaoEstadual:
        selectedTipo === TipoPessoa.JURIDICA ? prev.inscricaoEstadual : "",
      nomePai: selectedTipo === TipoPessoa.JURIDICA ? "" : prev.nomePai,
      documentoPai:
        selectedTipo === TipoPessoa.JURIDICA ? "" : prev.documentoPai,
      nomeMae: selectedTipo === TipoPessoa.JURIDICA ? "" : prev.nomeMae,
      documentoMae:
        selectedTipo === TipoPessoa.JURIDICA ? "" : prev.documentoMae,
      responsavelNome:
        selectedTipo === TipoPessoa.JURIDICA ? prev.responsavelNome : "",
      responsavelEmail:
        selectedTipo === TipoPessoa.JURIDICA ? prev.responsavelEmail : "",
      responsavelTelefone:
        selectedTipo === TipoPessoa.JURIDICA ? prev.responsavelTelefone : "",
    }));
  }, []);

  const handleTipoPessoaSelectionChange = useCallback(
    (keys: unknown) => {
      if (keys === "all" || keys == null) {
        return;
      }

      let selectedTipo: TipoPessoa | undefined;

      if (typeof keys === "string") {
        if (keys === TipoPessoa.FISICA || keys === TipoPessoa.JURIDICA) {
          selectedTipo = keys;
        }
      } else if (keys instanceof Set) {
        selectedTipo = Array.from(keys).find(
          (key): key is TipoPessoa =>
            key === TipoPessoa.FISICA || key === TipoPessoa.JURIDICA,
        );
      } else if (
        typeof keys === "object" &&
        keys !== null &&
        Symbol.iterator in keys
      ) {
        selectedTipo = Array.from(keys as Iterable<Key>).find(
          (key): key is TipoPessoa =>
            key === TipoPessoa.FISICA || key === TipoPessoa.JURIDICA,
        );
      } else if (
        typeof keys === "object" &&
        keys !== null &&
        "currentKey" in keys
      ) {
        const currentKey = (keys as { currentKey?: Key | null }).currentKey;
        if (
          currentKey === TipoPessoa.FISICA ||
          currentKey === TipoPessoa.JURIDICA
        ) {
          selectedTipo = currentKey;
        }
      }

      if (!selectedTipo) {
        return;
      }

      applyTipoPessoaChange(selectedTipo);
    },
    [applyTipoPessoaChange],
  );

  const handleConfirmResetarSenha = async () => {
    if (!clienteParaResetarSenha) return;

    setIsResettingPassword(true);
    try {
      const result = await resetarSenhaCliente(clienteParaResetarSenha.id);

      if (result.success && result.usuario) {
        if (result.warning) {
          toast.warning(result.warning);
        } else {
          toast.success("Acesso redefinido com sucesso!");
        }
        setClienteParaResetarSenha(null);
        setCredenciaisModal(result.usuario);
      } else {
        toast.error(result.error || "Erro ao redefinir acesso");
      }
    } catch (error) {
      toast.error("Erro ao redefinir acesso");
    } finally {
      setIsResettingPassword(false);
    }
  };

  const tipoPessoaOptions = [
    { key: "all", label: "Todos" },
    { key: TipoPessoa.FISICA, label: "Pessoa Física" },
    { key: TipoPessoa.JURIDICA, label: "Pessoa Jurídica" },
  ];

  const clienteImportFields = [
    {
      label: "nome",
      description: "Nome principal do cliente (também aceitamos nomeCompleto).",
    },
    {
      label: "email",
      description: "Usado para login e notificações automáticas.",
    },
    {
      label: "telefone",
      description: "Aceita DDD + número (com ou sem máscara).",
    },
    {
      label: "tipoPessoa",
      description: "Informe FISICA ou JURIDICA.",
    },
    {
      label: "documento",
      description: "CPF/CNPJ somente números para validação.",
    },
    {
      label: "dataNascimento",
      description: "Formato AAAA-MM-DD (opcional para PJ).",
    },
    {
      label: "inscricaoEstadual",
      description: "Opcional para pessoa jurídica.",
    },
    {
      label: "nomePai / documentoPai / nomeMae / documentoMae",
      description: "Dados de genitores para pessoa física (opcional).",
    },
    {
      label: "observacoes",
      description: "Observações internas do cadastro (opcional).",
    },
    {
      label: "responsavelNome / responsavelEmail / responsavelTelefone",
      description: "Contato do responsável do cliente (opcional).",
    },
    {
      label: "cep / logradouro / numero / bairro / cidade / estado",
      description:
        "Para importar endereço, informe ao menos logradouro, cidade e estado.",
    },
    {
      label: "criarUsuario",
      description: "Use sim/nao para criação automática de acesso.",
    },
  ];

  return (
    <div className="container mx-auto p-6 space-y-8">
      <motion.div animate="visible" initial="hidden" variants={fadeInUp}>
        <PeoplePageHeader
          description="Centralize cadastro, relacionamento e acesso dos clientes com o mesmo padrão visual usado em todo o módulo."
          title="Clientes"
          actions={
            permissions.canViewAllClients ? (
              <>
                <Button
                  color="primary"
                  size="sm"
                  startContent={<Plus className="h-4 w-4" />}
                  onPress={handleOpenCreateModal}
                >
                  Novo cliente
                </Button>
                <Button
                  size="sm"
                  startContent={<UploadCloud className="h-4 w-4" />}
                  variant="bordered"
                  onPress={() => setIsImportModalOpen(true)}
                >
                  Importar Excel
                </Button>
              </>
            ) : undefined
          }
        />
      </motion.div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton
              key={`clientes-metric-skeleton-${index}`}
              className="h-28 rounded-xl"
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <PeopleMetricCard
            helper="Carteira cadastrada"
            icon={<Users className="h-4 w-4" />}
            label="Total de clientes"
            tone="primary"
            value={metrics.total}
          />
          <PeopleMetricCard
            helper={`${taxaAcesso}% com acesso`}
            icon={<KeyIcon className="h-4 w-4" />}
            label="Clientes com login"
            tone="success"
            value={metrics.comAcesso}
          />
          <PeopleMetricCard
            helper="Pessoa fisica"
            icon={<User className="h-4 w-4" />}
            label="Clientes PF"
            tone="secondary"
            value={metrics.fisica}
          />
          <PeopleMetricCard
            helper="Pessoa juridica"
            icon={<Building2 className="h-4 w-4" />}
            label="Clientes PJ"
            tone="warning"
            value={metrics.juridica}
          />
          <PeopleMetricCard
            helper="Clientes com processo"
            icon={<FileText className="h-4 w-4" />}
            label="Com processos"
            tone="primary"
            value={metrics.comProcessos}
          />
          <PeopleMetricCard
            helper="Conversao da base"
            icon={<TrendingUp className="h-4 w-4" />}
            label="Taxa de acesso"
            tone="success"
            value={`${taxaAcesso}%`}
          />
          <PeopleMetricCard
            helper="Engajamento da carteira"
            icon={<Activity className="h-4 w-4" />}
            label="Taxa de engajamento"
            tone="secondary"
            value={`${taxaEngajamento}%`}
          />
          <PeopleMetricCard
            helper="Acoes comerciais"
            icon={<BarChart3 className="h-4 w-4" />}
            label="Status da carteira"
            tone="default"
            value={metrics.total > 0 ? "Ativa" : "Vazia"}
          />
        </div>
      )}

      {/* Filtros Avançados Melhorados */}
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        initial={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.3 }}
      >
        <Card className="border border-divider/70 bg-content1/75 shadow-sm backdrop-blur-md">
          <CardHeader className="border-b border-divider/70 px-4 py-4 sm:px-6">
            <div className="flex w-full flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 items-start gap-3 sm:items-center">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
                  <Filter className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground sm:text-lg">
                    Filtros operacionais
                  </h3>
                  <p className="text-xs text-default-500 sm:text-sm">
                    Refine rapidamente a carteira ativa.
                  </p>
                </div>
                {hasActiveFilters && (
                  <motion.div
                    animate={{ scale: 1 }}
                    className="hidden sm:block"
                    initial={{ scale: 0 }}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  >
                    <Badge
                      color="primary"
                      content={
                        [searchTerm, selectedTipoPessoa !== "all"].filter(
                          Boolean,
                        ).length
                      }
                      size="sm"
                      variant="shadow"
                    >
                      <Chip
                        className="font-semibold"
                        color="primary"
                        size="sm"
                        variant="flat"
                      >
                        {
                          [searchTerm, selectedTipoPessoa !== "all"].filter(
                            Boolean,
                          ).length
                        }{" "}
                        filtro(s) ativo(s)
                      </Chip>
                    </Badge>
                  </motion.div>
                )}
              </div>
              <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
                <Tooltip color="warning" content="Limpar todos os filtros">
                  <Button
                    className="flex-1 sm:flex-none"
                    color="warning"
                    isDisabled={!hasActiveFilters}
                    size="sm"
                    startContent={<RotateCcw className="w-4 h-4" />}
                    variant="light"
                    onPress={clearFilters}
                  >
                    Limpar
                  </Button>
                </Tooltip>
                <Tooltip
                  color="primary"
                  content={showFilters ? "Ocultar filtros" : "Mostrar filtros"}
                >
                  <Button
                    className="flex-1 sm:flex-none"
                    color="primary"
                    size="sm"
                    startContent={
                      showFilters ? (
                        <XCircle className="w-4 h-4" />
                      ) : (
                        <Filter className="w-4 h-4" />
                      )
                    }
                    variant="light"
                    onPress={() => setShowFilters(!showFilters)}
                  >
                    {showFilters ? "Ocultar" : "Mostrar"}
                  </Button>
                </Tooltip>
              </div>
            </div>
          </CardHeader>

          <AnimatePresence>
            {showFilters && (
              <motion.div
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                initial={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3 }}
              >
                <CardBody className="px-4 pb-5 pt-4 sm:px-6 sm:pb-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Filtro por Busca */}
                    <motion.div
                      animate={{ opacity: 1, x: 0 }}
                      className="space-y-3"
                      initial={{ opacity: 0, x: -20 }}
                      transition={{ delay: 0.1 }}
                    >
                      <label
                        className="text-sm font-semibold flex items-center gap-2 text-slate-700 dark:text-slate-300"
                        htmlFor="filtro-busca"
                      >
                        <Search className="w-4 h-4 text-blue-500" />
                        Busca Inteligente
                      </label>
                      <Input
                        classNames={{
                          input: "text-slate-700 dark:text-slate-300",
                          inputWrapper:
                            "bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 hover:border-blue-400 dark:hover:border-blue-500",
                        }}
                        id="filtro-busca"
                        placeholder="Nome, email, documento..."
                        size="md"
                        startContent={
                          <Search className="w-4 h-4 text-default-400" />
                        }
                        value={searchTerm}
                        variant="bordered"
                        onValueChange={setSearchTerm}
                      />
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Busca em nomes, emails e documentos
                      </p>
                    </motion.div>

                    {/* Filtro por Tipo */}
                    <motion.div
                      animate={{ opacity: 1, x: 0 }}
                      className="space-y-3"
                      initial={{ opacity: 0, x: -20 }}
                      transition={{ delay: 0.2 }}
                    >
                      <label
                        className="text-sm font-semibold flex items-center gap-2 text-slate-700 dark:text-slate-300"
                        htmlFor="filtro-tipo"
                      >
                        <Users className="w-4 h-4 text-green-500" />
                        Tipo de Pessoa
                      </label>
                      <Select
                        classNames={{
                          trigger:
                            "bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 hover:border-green-400 dark:hover:border-green-500",
                        }}
                        id="filtro-tipo"
                        placeholder="Selecione o tipo"
                        selectedKeys={[selectedTipoPessoa]}
                        size="md"
                        variant="bordered"
                        onChange={(e) => setSelectedTipoPessoa(e.target.value)}
                      >
                        {tipoPessoaOptions.map((option) => (
                          <SelectItem key={option.key} textValue={option.label}>
                            <div className="flex items-center gap-2">
                              {option.key === "all" && (
                                <Users className="w-4 h-4" />
                              )}
                              {option.key === TipoPessoa.FISICA && (
                                <User className="w-4 h-4" />
                              )}
                              {option.key === TipoPessoa.JURIDICA && (
                                <Building2 className="w-4 h-4" />
                              )}
                              <span>{option.label}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </Select>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Filtre por tipo de pessoa
                      </p>
                    </motion.div>
                  </div>

                  {/* Resumo dos Filtros Ativos */}
                  {hasActiveFilters && (
                    <motion.div
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700"
                      initial={{ opacity: 0, y: 10 }}
                      transition={{ delay: 0.3 }}
                    >
                      <h5 className="text-sm font-semibold text-blue-800 dark:text-blue-200 mb-2 flex items-center gap-2">
                        <Info className="w-4 h-4" />
                        Filtros Aplicados
                      </h5>
                      <div className="flex flex-wrap gap-2">
                        {searchTerm && (
                          <Chip color="primary" size="sm" variant="flat">
                            Busca: "{searchTerm}"
                          </Chip>
                        )}
                        {selectedTipoPessoa !== "all" && (
                          <Chip color="success" size="sm" variant="flat">
                            Tipo:{" "}
                            {
                              tipoPessoaOptions.find(
                                (opt) => opt.key === selectedTipoPessoa,
                              )?.label
                            }
                          </Chip>
                        )}
                      </div>
                    </motion.div>
                  )}
                </CardBody>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>
      </motion.div>

      <ClientesListSection
        canCreateClient={permissions.canViewAllClients}
        clientesFiltrados={clientesFiltrados}
        hasActiveFilters={hasActiveFilters}
        isLoading={isLoading}
        paginationResetKey={`${searchTerm}::${selectedTipoPessoa}`}
        onDeleteCliente={handleDeleteCliente}
        onEditCliente={handleEditCliente}
        onOpenCreateModal={handleOpenCreateModal}
        onOpenResetModal={handleOpenResetModal}
        onViewCliente={handleViewCliente}
      />

      <ClienteCreateModal
        isOpen={isCreateModalOpen}
        onCreated={async () => {
          await mutate();
        }}
        onOpenChange={setIsCreateModalOpen}
      />


      {/* Modal Editar Cliente */}
      <HeroUIModal
        isOpen={isEditModalOpen}
        scrollBehavior="inside"
        size="5xl"
        onOpenChange={setIsEditModalOpen}
      >
        <ModalContent>
          <ModalHeaderGradient
            description="Atualize as informações do cliente"
            icon={Edit}
            title="Editar Cliente"
          />
          <ModalBody className="px-0">
            <Tabs
              aria-label="Formulário de edição do cliente"
              classNames={{
                tabList:
                  "gap-6 w-full relative rounded-none px-6 pt-6 pb-0 border-b border-divider",
                cursor: "w-full bg-primary",
                tab: "max-w-fit px-0 h-12",
                tabContent:
                  "group-data-[selected=true]:text-primary font-medium text-sm tracking-wide",
                panel: "px-6 pb-6 pt-4",
              }}
              color="primary"
              variant="underlined"
            >
              <Tab
                key="dados-gerais"
                title={
                  <div className="flex items-center gap-2">
                    <div className="p-1 rounded-md bg-blue-100 dark:bg-blue-900">
                      <User className="text-blue-600 dark:text-blue-300 w-4 h-4" />
                    </div>
                    <span>Dados Gerais</span>
                  </div>
                }
              >
                <div className="space-y-6">
                  <ModalSectionCard
                    description="Informações básicas do cliente"
                    title="Identificação"
                  >
                    <div className="space-y-4">
                      <Select
                        popoverProps={{
                          classNames: {
                            base: "z-[10000]",
                            content: "z-[10000]",
                          },
                        }}
                        label="Tipo de Pessoa"
                        placeholder="Selecione"
                        selectedKeys={new Set([formState.tipoPessoa])}
                        onSelectionChange={handleTipoPessoaSelectionChange}
                      >
                        <SelectItem
                          key={TipoPessoa.FISICA}
                          textValue="Pessoa Física"
                        >
                          Pessoa Física
                        </SelectItem>
                        <SelectItem
                          key={TipoPessoa.JURIDICA}
                          textValue="Pessoa Jurídica"
                        >
                          Pessoa Jurídica
                        </SelectItem>
                      </Select>

                      <Input
                        isRequired
                        label={
                          formState.tipoPessoa === TipoPessoa.FISICA
                            ? "Nome Completo"
                            : "Razão Social"
                        }
                        placeholder={
                          formState.tipoPessoa === TipoPessoa.FISICA
                            ? "Nome completo"
                            : "Razão Social"
                        }
                        startContent={
                          formState.tipoPessoa === TipoPessoa.FISICA ? (
                            <User className="h-4 w-4 text-default-400" />
                          ) : (
                            <Building2 className="h-4 w-4 text-default-400" />
                          )
                        }
                        value={formState.nome}
                        onValueChange={(value) =>
                          setFormState({ ...formState, nome: value })
                        }
                      />

                      {formState.tipoPessoa === TipoPessoa.FISICA ? (
                        <CpfInput
                          value={formState.documento}
                          onChange={(value) =>
                            setFormState({ ...formState, documento: value })
                          }
                        />
                      ) : (
                        <CnpjInput
                          value={formState.documento}
                          onChange={(value) =>
                            setFormState({ ...formState, documento: value })
                          }
                          onCnpjFound={handleCnpjFound}
                        />
                      )}

                      {formState.tipoPessoa === TipoPessoa.FISICA ? (
                        <DateInput
                          label="Data de Nascimento"
                          value={formatDateToInput(formState.dataNascimento)}
                          onValueChange={(value) =>
                            setFormState({
                              ...formState,
                              dataNascimento: parseDateFromInput(value),
                            })
                          }
                        />
                      ) : (
                        <Input
                          label="Inscrição Estadual"
                          placeholder="Informe a inscrição estadual"
                          value={formState.inscricaoEstadual}
                          onValueChange={(value) =>
                            setFormState({
                              ...formState,
                              inscricaoEstadual: value,
                            })
                          }
                        />
                      )}
                    </div>
                  </ModalSectionCard>

                  <ModalSectionCard
                    description="Cadastro do endereço principal para comunicação e cobranças."
                    title="Endereço Principal"
                  >
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <Input
                          endContent={
                            isSearchingCep ? <Spinner size="sm" /> : null
                          }
                          label="CEP"
                          placeholder="00000-000"
                          value={formState.enderecoPrincipal?.cep || ""}
                          onValueChange={(value) =>
                            handleEnderecoPrincipalChange("cep", value)
                          }
                          onBlur={handleEnderecoCepBlur}
                        />
                        <Input
                          label="Logradouro"
                          placeholder="Rua, avenida, etc."
                          value={formState.enderecoPrincipal?.logradouro || ""}
                          onValueChange={(value) =>
                            handleEnderecoPrincipalChange("logradouro", value)
                          }
                        />
                        <Input
                          label="Número"
                          placeholder="123"
                          value={formState.enderecoPrincipal?.numero || ""}
                          onValueChange={(value) =>
                            handleEnderecoPrincipalChange("numero", value)
                          }
                        />
                      </div>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <Input
                          label="Complemento"
                          placeholder="Apto, sala, bloco..."
                          value={formState.enderecoPrincipal?.complemento || ""}
                          onValueChange={(value) =>
                            handleEnderecoPrincipalChange("complemento", value)
                          }
                        />
                        <Input
                          label="Bairro"
                          placeholder="Bairro"
                          value={formState.enderecoPrincipal?.bairro || ""}
                          onValueChange={(value) =>
                            handleEnderecoPrincipalChange("bairro", value)
                          }
                        />
                        <Input
                          label="Cidade"
                          placeholder="Cidade"
                          value={formState.enderecoPrincipal?.cidade || ""}
                          onValueChange={(value) =>
                            handleEnderecoPrincipalChange("cidade", value)
                          }
                        />
                      </div>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <Input
                          label="UF"
                          maxLength={2}
                          placeholder="SP"
                          value={formState.enderecoPrincipal?.estado || ""}
                          onValueChange={(value) =>
                            handleEnderecoPrincipalChange(
                              "estado",
                              value.toUpperCase(),
                            )
                          }
                        />
                        <Input
                          label="País"
                          placeholder="Brasil"
                          value={formState.enderecoPrincipal?.pais || "Brasil"}
                          onValueChange={(value) =>
                            handleEnderecoPrincipalChange("pais", value)
                          }
                        />
                      </div>
                    </div>
                  </ModalSectionCard>

                  {formState.tipoPessoa === TipoPessoa.FISICA && (
                    <ModalSectionCard
                      description="Dados de filiação importantes para qualificação completa do cliente."
                      title="Genitores"
                    >
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <Input
                          label="Nome do Pai"
                          placeholder="Informe o nome do pai"
                          startContent={
                            <User className="h-4 w-4 text-default-400" />
                          }
                          value={formState.nomePai}
                          onValueChange={(value) =>
                            setFormState({ ...formState, nomePai: value })
                          }
                        />
                        <Input
                          label="Documento do Pai"
                          placeholder="CPF ou outro documento"
                          startContent={
                            <FileText className="h-4 w-4 text-default-400" />
                          }
                          value={formState.documentoPai}
                          onValueChange={(value) =>
                            setFormState({ ...formState, documentoPai: value })
                          }
                        />
                        <Input
                          label="Nome da Mãe"
                          placeholder="Informe o nome da mãe"
                          startContent={
                            <User className="h-4 w-4 text-default-400" />
                          }
                          value={formState.nomeMae}
                          onValueChange={(value) =>
                            setFormState({ ...formState, nomeMae: value })
                          }
                        />
                        <Input
                          label="Documento da Mãe"
                          placeholder="CPF ou outro documento"
                          startContent={
                            <FileText className="h-4 w-4 text-default-400" />
                          }
                          value={formState.documentoMae}
                          onValueChange={(value) =>
                            setFormState({ ...formState, documentoMae: value })
                          }
                        />
                      </div>
                    </ModalSectionCard>
                  )}

                  {(isAdmin || isSuperAdmin) && (
                    <ModalSectionCard
                      description="Ajuste os advogados responsáveis por este cliente."
                      title="Vínculo de Advogados"
                    >
                      <Select
                        className="w-full"
                        popoverProps={{
                          classNames: {
                            base: "z-[10000]",
                            content: "z-[10000]",
                          },
                        }}
                        isLoading={isLoadingAdvogados}
                        label="Advogados vinculados"
                        placeholder="Selecione um ou mais advogados"
                        selectedKeys={selectedAdvogadosKeys}
                        selectionMode="multiple"
                        onSelectionChange={handleAdvogadosSelectionChange}
                      >
                        {(advogados || []).map((advogado) => (
                          <SelectItem
                            key={advogado.id}
                            textValue={`${advogado.label} ${advogado.oab || ""}`.trim()}
                          >
                            {advogado.label}
                            {advogado.oab ? ` (${advogado.oab})` : ""}
                          </SelectItem>
                        ))}
                      </Select>
                    </ModalSectionCard>
                  )}
                </div>
              </Tab>

              <Tab
                key="contato"
                title={
                  <div className="flex items-center gap-2">
                    <div className="p-1 rounded-md bg-green-100 dark:bg-green-900">
                      <Phone className="text-green-600 dark:text-green-300 w-4 h-4" />
                    </div>
                    <span>Contato</span>
                  </div>
                }
              >
                <div className="space-y-6">
                  <ModalSectionCard
                    description="Telefones e email do cliente"
                    title="Informações de Contato"
                  >
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <Input
                          label="Email"
                          placeholder="email@exemplo.com"
                          startContent={
                            <Mail className="h-4 w-4 text-default-400" />
                          }
                          type="email"
                          value={formState.email}
                          onValueChange={(value) =>
                            setFormState({ ...formState, email: value })
                          }
                        />
                        <Input
                          label="Telefone"
                          placeholder="(00) 0000-0000"
                          startContent={
                            <Phone className="h-4 w-4 text-default-400" />
                          }
                          value={formState.telefone}
                          onValueChange={(value) =>
                            setFormState({ ...formState, telefone: value })
                          }
                        />
                      </div>

                      <Input
                        label="Celular/WhatsApp"
                        placeholder="(00) 00000-0000"
                        startContent={
                          <Phone className="h-4 w-4 text-default-400" />
                        }
                        value={formState.celular}
                        onValueChange={(value) =>
                          setFormState({ ...formState, celular: value })
                        }
                      />
                    </div>
                  </ModalSectionCard>

                  {formState.tipoPessoa === TipoPessoa.JURIDICA && (
                    <ModalSectionCard
                      description="Dados do responsável legal"
                      title="Responsável pela Empresa"
                    >
                      <div className="space-y-4">
                        <Input
                          label="Nome do Responsável"
                          placeholder="Nome completo"
                          startContent={
                            <User className="h-4 w-4 text-default-400" />
                          }
                          value={formState.responsavelNome}
                          onValueChange={(value) =>
                            setFormState({
                              ...formState,
                              responsavelNome: value,
                            })
                          }
                        />
                        <div className="grid grid-cols-2 gap-4">
                          <Input
                            label="Email do Responsável"
                            placeholder="email@exemplo.com"
                            startContent={
                              <Mail className="h-4 w-4 text-default-400" />
                            }
                            type="email"
                            value={formState.responsavelEmail}
                            onValueChange={(value) =>
                              setFormState({
                                ...formState,
                                responsavelEmail: value,
                              })
                            }
                          />
                          <Input
                            label="Telefone do Responsável"
                            placeholder="(00) 00000-0000"
                            startContent={
                              <Phone className="h-4 w-4 text-default-400" />
                            }
                            value={formState.responsavelTelefone}
                            onValueChange={(value) =>
                              setFormState({
                                ...formState,
                                responsavelTelefone: value,
                              })
                            }
                          />
                        </div>
                      </div>
                    </ModalSectionCard>
                  )}
                </div>
              </Tab>

              <Tab
                key="observacoes"
                title={
                  <div className="flex items-center gap-2">
                    <div className="p-1 rounded-md bg-amber-100 dark:bg-amber-900">
                      <FileText className="text-amber-600 dark:text-amber-300 w-4 h-4" />
                    </div>
                    <span>Observações</span>
                  </div>
                }
              >
                <div className="space-y-6">
                  <ModalSectionCard
                    description="Anotações e observações sobre o cliente"
                    title="Informações Adicionais"
                  >
                    <Textarea
                      label="Observações"
                      minRows={4}
                      placeholder="Informações adicionais sobre o cliente..."
                      value={formState.observacoes}
                      onValueChange={(value) =>
                        setFormState({ ...formState, observacoes: value })
                      }
                    />
                  </ModalSectionCard>
                </div>
              </Tab>
            </Tabs>
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={() => setIsEditModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              color="primary"
              isLoading={isSaving}
              onPress={handleUpdateCliente}
            >
              Salvar Alterações
            </Button>
          </ModalFooter>
        </ModalContent>
      </HeroUIModal>

      {/* Modal de Primeiro Acesso */}
      <Modal
        footer={
          <div className="flex justify-end">
            <Button
              color="primary"
              startContent={<CheckCircle className="h-4 w-4" />}
              onPress={() => setCredenciaisModal(null)}
            >
              Entendi
            </Button>
          </div>
        }
        isOpen={!!credenciaisModal}
        size="lg"
        title={credenciaisModal ? "🔐 Primeiro acesso do cliente" : ""}
        onOpenChange={() => setCredenciaisModal(null)}
      >
        {credenciaisModal && (
          <div className="space-y-4">
            <div className="rounded-lg bg-success/10 border border-success/20 p-4">
              <div className="flex items-start gap-3">
                <KeyIcon className="h-5 w-5 text-success mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-success">
                    Usuário de acesso criado
                  </p>
                  <p className="text-xs text-default-600 mt-1">
                    O cliente deve definir a própria senha pelo link de primeiro
                    acesso enviado por e-mail.
                  </p>
                </div>
              </div>
            </div>

            <Card className="border border-default-200">
              <CardBody className="gap-3">
                <div>
                  <p className="text-xs text-default-400 mb-1">Email</p>
                  <div className="flex items-center gap-2">
                    <Input
                      readOnly
                      classNames={{
                        input: "font-mono",
                      }}
                      value={credenciaisModal.email}
                    />
                    <Button
                      isIconOnly
                      size="sm"
                      variant="flat"
                      onPress={() => {
                        navigator.clipboard.writeText(credenciaisModal.email);
                        toast.success("Email copiado!");
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div>
                  <p className="text-xs text-default-400 mb-1">
                    Email mascarado
                  </p>
                  <Input readOnly value={credenciaisModal.maskedEmail} />
                </div>
              </CardBody>
            </Card>

            {credenciaisModal.primeiroAcessoEnviado ? (
              <div className="rounded-lg bg-primary/10 border border-primary/20 p-3">
                <p className="text-xs text-primary-700 dark:text-primary-300">
                  ✅ Link de primeiro acesso enviado para{" "}
                  {credenciaisModal.maskedEmail}.
                </p>
              </div>
            ) : (
              <div className="rounded-lg bg-warning/10 border border-warning/20 p-3">
                <p className="text-xs text-warning-700 dark:text-warning-300">
                  ⚠️ Cliente criado, mas o e-mail de primeiro acesso não foi
                  enviado automaticamente.
                  {credenciaisModal.erroEnvio
                    ? ` Motivo: ${credenciaisModal.erroEnvio}`
                    : ""}
                </p>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Modal de Confirmação de Redefinição de Acesso */}
      <Modal
        footer={
          <div className="flex gap-2">
            <Button
              variant="light"
              onPress={() => setClienteParaResetarSenha(null)}
            >
              Cancelar
            </Button>
            <Button
              color="warning"
              isLoading={isResettingPassword}
              startContent={
                !isResettingPassword ? (
                  <RefreshCw className="h-4 w-4" />
                ) : undefined
              }
              onPress={handleConfirmResetarSenha}
            >
              Reenviar Acesso
            </Button>
          </div>
        }
        isOpen={!!clienteParaResetarSenha}
        size="md"
        title="⚠️ Redefinir acesso do cliente"
        onOpenChange={() => setClienteParaResetarSenha(null)}
      >
        {clienteParaResetarSenha && (
          <div className="space-y-4">
            <div className="rounded-lg bg-warning/10 border border-warning/20 p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-warning mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-warning">Atenção</p>
                  <p className="text-xs text-default-600 mt-1">
                    Esta ação vai invalidar a senha atual e reenviar o link de
                    primeiro acesso ao cliente.
                  </p>
                </div>
              </div>
            </div>

            <Card className="border border-default-200 bg-default-50">
              <CardBody className="gap-2">
                <div className="flex items-center gap-2">
                  {clienteParaResetarSenha.tipoPessoa ===
                  TipoPessoa.JURIDICA ? (
                    <Building2 className="h-5 w-5 text-default-400" />
                  ) : (
                    <User className="h-5 w-5 text-default-400" />
                  )}
                  <div>
                    <p className="text-sm font-semibold">
                      {clienteParaResetarSenha.nome}
                    </p>
                    <p className="text-xs text-default-400">
                      {clienteParaResetarSenha.email}
                    </p>
                  </div>
                </div>
              </CardBody>
            </Card>

            <div className="rounded-lg bg-primary/5 border border-primary/20 p-3">
              <p className="text-xs text-primary-600">
                💡 O cliente definirá uma nova senha pelo link recebido por
                e-mail.
              </p>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal de Visualização do Cliente */}
      <HeroUIModal
        isOpen={isViewModalOpen}
        scrollBehavior="inside"
        size="5xl"
        onOpenChange={setIsViewModalOpen}
      >
        {clienteParaVisualizar && (
          <ModalContent>
            <ModalHeaderGradient
              description="Detalhes completos do cliente"
              icon={
                clienteParaVisualizar.tipoPessoa === TipoPessoa.JURIDICA
                  ? Building2
                  : User
              }
              title={clienteParaVisualizar.nome}
            />
            <ModalBody className="px-0">
              <Tabs
                aria-label="Detalhes do cliente"
                classNames={{
                  tabList:
                    "gap-6 w-full relative rounded-none px-6 pt-6 pb-0 border-b border-divider",
                  cursor: "w-full bg-primary",
                  tab: "max-w-fit px-0 h-12",
                  tabContent:
                    "group-data-[selected=true]:text-primary font-medium text-sm tracking-wide",
                  panel: "px-6 pb-6 pt-4",
                }}
                color="primary"
                variant="underlined"
              >
                <Tab
                  key="resumo"
                  title={
                    <div className="flex items-center gap-2">
                      <div className="p-1 rounded-md bg-blue-100 dark:bg-blue-900">
                        <User className="text-blue-600 dark:text-blue-300 w-4 h-4" />
                      </div>
                      <span>Resumo</span>
                    </div>
                  }
                >
                  <div className="space-y-6">
                    <ModalSectionCard
                      description="Dados de identificação do cliente"
                      title="Informações Básicas"
                    >
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="flex items-center gap-3 p-3 bg-default-50 rounded-lg">
                          <FileText className="h-4 w-4 text-primary" />
                          <div>
                            <p className="text-xs text-default-500">
                              Documento
                            </p>
                            <p className="text-sm font-medium">
                              {clienteParaVisualizar.documento || "N/A"}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 p-3 bg-default-50 rounded-lg">
                          <Chip
                            color={
                              clienteParaVisualizar.tipoPessoa ===
                              TipoPessoa.FISICA
                                ? "secondary"
                                : "warning"
                            }
                            size="sm"
                            startContent={
                              clienteParaVisualizar.tipoPessoa ===
                              TipoPessoa.FISICA ? (
                                <User className="h-3 w-3" />
                              ) : (
                                <Building2 className="h-3 w-3" />
                              )
                            }
                            variant="flat"
                          >
                            {clienteParaVisualizar.tipoPessoa ===
                            TipoPessoa.FISICA
                              ? "Pessoa Física"
                              : "Pessoa Jurídica"}
                          </Chip>
                          {clienteParaVisualizar.usuarioId && (
                            <Chip
                              color="success"
                              size="sm"
                              startContent={<KeyIcon className="h-3 w-3" />}
                              variant="flat"
                            >
                              Tem Acesso
                            </Chip>
                          )}
                        </div>
                      </div>
                    </ModalSectionCard>

                    <ModalSectionCard
                      description="Métricas do cliente"
                      title="Estatísticas"
                    >
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
                          <div className="flex items-center gap-2">
                            <FileText className="h-5 w-5 text-blue-500" />
                            <div>
                              <p className="text-xs text-blue-600 dark:text-blue-400">
                                Processos
                              </p>
                              <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                                {clienteParaVisualizar._count?.processos || 0}
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-700">
                          <div className="flex items-center gap-2">
                            <Calendar className="h-5 w-5 text-green-500" />
                            <div>
                              <p className="text-xs text-green-600 dark:text-green-400">
                                Cadastrado em
                              </p>
                              <p className="text-sm font-bold text-green-700 dark:text-green-300">
                                {new Date(
                                  clienteParaVisualizar.createdAt,
                                ).toLocaleDateString("pt-BR")}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </ModalSectionCard>
                  </div>
                </Tab>

                <Tab
                  key="contato"
                  title={
                    <div className="flex items-center gap-2">
                      <div className="p-1 rounded-md bg-green-100 dark:bg-green-900">
                        <Phone className="text-green-600 dark:text-green-300 w-4 h-4" />
                      </div>
                      <span>Contato</span>
                    </div>
                  }
                >
                  <div className="space-y-6">
                    <ModalSectionCard
                      description="Telefones e email do cliente"
                      title="Informações de Contato"
                    >
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {clienteParaVisualizar.email && (
                          <div className="flex items-center gap-3 p-3 bg-default-50 rounded-lg">
                            <Mail className="h-4 w-4 text-success" />
                            <div>
                              <p className="text-xs text-default-500">Email</p>
                              <p className="text-sm font-medium">
                                {clienteParaVisualizar.email}
                              </p>
                            </div>
                          </div>
                        )}
                        {clienteParaVisualizar.telefone && (
                          <div className="flex items-center gap-3 p-3 bg-default-50 rounded-lg">
                            <Phone className="h-4 w-4 text-primary" />
                            <div>
                              <p className="text-xs text-default-500">
                                Telefone
                              </p>
                              <p className="text-sm font-medium">
                                {clienteParaVisualizar.telefone}
                              </p>
                            </div>
                          </div>
                        )}
                        {clienteParaVisualizar.celular && (
                          <div className="flex items-center gap-3 p-3 bg-default-50 rounded-lg">
                            <Smartphone className="h-4 w-4 text-warning" />
                            <div>
                              <p className="text-xs text-default-500">
                                Celular
                              </p>
                              <p className="text-sm font-medium">
                                {clienteParaVisualizar.celular}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </ModalSectionCard>

                    {clienteParaVisualizar.tipoPessoa === TipoPessoa.FISICA &&
                      (clienteParaVisualizar.nomePai ||
                        clienteParaVisualizar.documentoPai ||
                        clienteParaVisualizar.nomeMae ||
                        clienteParaVisualizar.documentoMae) && (
                        <ModalSectionCard
                          description="Dados de filiação armazenados no cadastro."
                          title="Genitores"
                        >
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {clienteParaVisualizar.nomePai && (
                              <div className="flex items-center gap-3 p-3 bg-default-50 rounded-lg">
                                <User className="h-4 w-4 text-primary" />
                                <div>
                                  <p className="text-xs text-default-500">
                                    Nome do Pai
                                  </p>
                                  <p className="text-sm font-medium">
                                    {clienteParaVisualizar.nomePai}
                                  </p>
                                </div>
                              </div>
                            )}
                            {clienteParaVisualizar.documentoPai && (
                              <div className="flex items-center gap-3 p-3 bg-default-50 rounded-lg">
                                <FileText className="h-4 w-4 text-secondary" />
                                <div>
                                  <p className="text-xs text-default-500">
                                    Documento do Pai
                                  </p>
                                  <p className="text-sm font-medium">
                                    {clienteParaVisualizar.documentoPai}
                                  </p>
                                </div>
                              </div>
                            )}
                            {clienteParaVisualizar.nomeMae && (
                              <div className="flex items-center gap-3 p-3 bg-default-50 rounded-lg">
                                <User className="h-4 w-4 text-warning" />
                                <div>
                                  <p className="text-xs text-default-500">
                                    Nome da Mãe
                                  </p>
                                  <p className="text-sm font-medium">
                                    {clienteParaVisualizar.nomeMae}
                                  </p>
                                </div>
                              </div>
                            )}
                            {clienteParaVisualizar.documentoMae && (
                              <div className="flex items-center gap-3 p-3 bg-default-50 rounded-lg">
                                <FileText className="h-4 w-4 text-success" />
                                <div>
                                  <p className="text-xs text-default-500">
                                    Documento da Mãe
                                  </p>
                                  <p className="text-sm font-medium">
                                    {clienteParaVisualizar.documentoMae}
                                  </p>
                                </div>
                              </div>
                            )}
                          </div>
                        </ModalSectionCard>
                      )}

                    {clienteParaVisualizar.tipoPessoa === TipoPessoa.JURIDICA &&
                      (clienteParaVisualizar.responsavelNome ||
                        clienteParaVisualizar.responsavelEmail ||
                        clienteParaVisualizar.responsavelTelefone) && (
                        <ModalSectionCard
                          description="Dados do responsável legal"
                          title="Responsável pela Empresa"
                        >
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {clienteParaVisualizar.responsavelNome && (
                              <div className="flex items-center gap-3 p-3 bg-default-50 rounded-lg">
                                <User className="h-4 w-4 text-primary" />
                                <div>
                                  <p className="text-xs text-default-500">
                                    Nome
                                  </p>
                                  <p className="text-sm font-medium">
                                    {clienteParaVisualizar.responsavelNome}
                                  </p>
                                </div>
                              </div>
                            )}
                            {clienteParaVisualizar.responsavelEmail && (
                              <div className="flex items-center gap-3 p-3 bg-default-50 rounded-lg">
                                <Mail className="h-4 w-4 text-success" />
                                <div>
                                  <p className="text-xs text-default-500">
                                    Email
                                  </p>
                                  <p className="text-sm font-medium">
                                    {clienteParaVisualizar.responsavelEmail}
                                  </p>
                                </div>
                              </div>
                            )}
                            {clienteParaVisualizar.responsavelTelefone && (
                              <div className="flex items-center gap-3 p-3 bg-default-50 rounded-lg">
                                <Phone className="h-4 w-4 text-primary" />
                                <div>
                                  <p className="text-xs text-default-500">
                                    Telefone
                                  </p>
                                  <p className="text-sm font-medium">
                                    {clienteParaVisualizar.responsavelTelefone}
                                  </p>
                                </div>
                              </div>
                            )}
                          </div>
                        </ModalSectionCard>
                      )}
                  </div>
                </Tab>

                <Tab
                  key="processos"
                  title={
                    <div className="flex items-center gap-2">
                      <div className="p-1 rounded-md bg-purple-100 dark:bg-purple-900">
                        <FileText className="text-purple-600 dark:text-purple-300 w-4 h-4" />
                      </div>
                      <span>Processos</span>
                    </div>
                  }
                >
                  <div className="space-y-6">
                    <ModalSectionCard
                      description={`Total: ${clienteParaVisualizar._count?.processos || 0} processos`}
                      title="Processos do Cliente"
                    >
                      <div className="space-y-4 py-4 text-center">
                        <FileText className="mx-auto mb-2 h-12 w-12 text-default-300" />
                        <p className="text-default-500">
                          {clienteParaVisualizar._count?.processos === 0
                            ? "Este cliente ainda não possui processos vinculados."
                            : "Abra a página completa para visualizar processos, contratos, procurações e demais relações."}
                        </p>
                        <Button
                          as={Link}
                          color="primary"
                          href={`/clientes/${clienteParaVisualizar.id}`}
                          size="sm"
                          startContent={<Eye className="h-4 w-4" />}
                          variant="flat"
                        >
                          Abrir página completa
                        </Button>
                      </div>
                    </ModalSectionCard>
                  </div>
                </Tab>
              </Tabs>
            </ModalBody>
            <ModalFooter>
              <Button variant="flat" onPress={() => setIsViewModalOpen(false)}>
                Fechar
              </Button>
              <Button
                color="primary"
                onPress={() => handleEditCliente(clienteParaVisualizar)}
              >
                Editar Cliente
              </Button>
            </ModalFooter>
          </ModalContent>
        )}
      </HeroUIModal>
      <BulkExcelImportModal
        entityLabel="clientes"
        isOpen={isImportModalOpen}
        onUpload={handleImportClientes}
        sampleFields={clienteImportFields}
        templateUrl="/api/templates/import-clients"
        onOpenChange={setIsImportModalOpen}
      />
    </div>
  );
}
