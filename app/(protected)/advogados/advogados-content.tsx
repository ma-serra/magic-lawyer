"use client";

import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Button, Card, CardBody, CardHeader, Chip, Avatar, Spinner, Input, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Divider, Badge, Tooltip, Skeleton, Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, Checkbox, Pagination, Select, SelectItem } from "@heroui/react";
import { useRouter } from "next/navigation";
import {
  MailIcon,
  ScaleIcon,
  Plus,
  Search,
  Filter,
  XCircle,
  RotateCcw,
  Eye,
  Edit,
  Trash2,
  MoreVertical,
  Phone,
  Smartphone,
  FileText,
  BarChart3,
  TrendingUp,
  CheckCircle,
  Crown,
  Info,
  Target,
  Users,
  Building2,
  User,
  Key,
  Calendar,
  DollarSign,
  Percent,
  Star,
  Clock,
  Shield,
  Activity,
  UserPlus,
  Table,
  CheckSquare,
  CheckCircle2,
  X,
  History,
  Scale,
  Bell,
  Mail,
  UploadCloud,
} from "lucide-react";
import { toast } from "@/lib/toast";
import useSWR from "swr";
import { UploadProgress } from "@/components/ui/upload-progress";

import { AdvogadoHistorico } from "./components/advogado-historico";
import { BulkExcelImportModal } from "@/components/bulk-excel-import-modal";
import { AdvogadoNotificacoes } from "./components/advogado-notificacoes";
import { AdvogadoFormModal } from "./components/advogado-form-modal";
import {
  type EnderecoFormData,
  type DadosBancariosFormData,
} from "./components/types";

import { ImageEditorModal } from "@/components/image-editor-modal";
import {
  getAdvogadosDoTenant,
  createAdvogado,
  updateAdvogado,
  deleteAdvogado,
  uploadAvatarAdvogado,
  deleteAvatarAdvogado,
  convertAdvogadoExternoToInterno,
  type Advogado,
  type CreateAdvogadoInput,
  type UpdateAdvogadoInput,
} from "@/app/actions/advogados";
import {
  useAdvogadosPerformance,
  usePerformanceGeral,
} from "@/app/hooks/use-advogados-performance";
import {
  useAdvogadosComissoes,
  useComissoesGeral,
} from "@/app/hooks/use-advogados-comissoes";
import { useBancosDisponiveis } from "@/app/hooks/use-bancos";
import {
  useTiposConta,
  useTiposContaBancaria,
  useTiposChavePix,
} from "@/app/hooks/use-dados-bancarios";
import {
  PeopleEntityCard,
  PeopleEntityCardBody,
  PeopleEntityCardHeader,
  PeopleMetricCard,
  PeoplePageHeader,
} from "@/components/people-ui";
import { EspecialidadeJuridica } from "@/generated/prisma";
import { DateRangeInput } from "@/components/ui/date-range-input";

const createEndereco = (
  apelido = "Principal",
  principal = true,
): EnderecoFormData => ({
  apelido,
  tipo: "ESCRITORIO",
  principal,
  logradouro: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  estado: "",
  cep: "",
  pais: "Brasil",
  telefone: "",
  observacoes: "",
});

const createContaBancaria = (principal = true): DadosBancariosFormData => ({
  tipoConta: "PESSOA_FISICA",
  bancoCodigo: "",
  agencia: "",
  conta: "",
  digitoConta: "",
  tipoContaBancaria: "CORRENTE",
  chavePix: "",
  tipoChavePix: "CPF",
  titularNome: "",
  titularDocumento: "",
  titularEmail: "",
  titularTelefone: "",
  endereco: "",
  cidade: "",
  estado: "",
  cep: "",
  principal,
  observacoes: "",
});

export default function AdvogadosContent() {
  const router = useRouter();
  const { data, error, isLoading, mutate } = useSWR(
    "advogados-do-tenant",
    getAdvogadosDoTenant,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      refreshInterval: 0,
    },
  );

  const advogados = data?.advogados || [];
  const loading = isLoading;
  const errorMessage = error?.message || data?.error;

  // Estados para modais e filtros
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [selectedEspecialidade, setSelectedEspecialidade] =
    useState<string>("all");
  const [selectedTipo, setSelectedTipo] = useState<string>("all"); // Novo filtro para tipo de advogado
  const [showFilters, setShowFilters] = useState(false);
  const [sortField, setSortField] = useState<string>("nome");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [selectedAdvogados, setSelectedAdvogados] = useState<string[]>([]);
  const [isBulkActionLoading, setIsBulkActionLoading] = useState(false);
  const [isCompactView, setIsCompactView] = useState(true);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [comissaoMin, setComissaoMin] = useState<string>("");
  const [comissaoMax, setComissaoMax] = useState<string>("");
  const [dataInicio, setDataInicio] = useState<string>("");
  const [dataFim, setDataFim] = useState<string>("");
  const [showPerformanceReports, setShowPerformanceReports] = useState(false);
  const [showCommissionsDashboard, setShowCommissionsDashboard] =
    useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [selectedAdvogado, setSelectedAdvogado] = useState<Advogado | null>(
    null,
  );
  const [isHistoricoModalOpen, setIsHistoricoModalOpen] = useState(false);
  const [isNotificacoesModalOpen, setIsNotificacoesModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isCredenciaisModalOpen, setIsCredenciaisModalOpen] = useState(false);
  const [credenciaisTemporarias, setCredenciaisTemporarias] = useState<{
    email: string;
    maskedEmail: string;
    envioSolicitado: boolean;
    primeiroAcessoEnviado: boolean;
    erroEnvio?: string;
  } | null>(null);
  const [isAvatarEditorOpen, setIsAvatarEditorOpen] = useState(false);
  const [selectedAdvogadoForAvatar, setSelectedAdvogadoForAvatar] =
    useState<Advogado | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  useEffect(() => {
    if (!isCompactView) {
      return;
    }

    setShowPerformanceReports(false);
    setShowCommissionsDashboard(false);
    setShowAdvancedFilters(false);
  }, [isCompactView]);

  // Hook para debounce da busca
  const useDebounce = (value: string, delay: number) => {
    const [debouncedValue, setDebouncedValue] = useState(value);

    useEffect(() => {
      const handler = setTimeout(() => {
        setDebouncedValue(value);
      }, delay);

      return () => {
        clearTimeout(handler);
      };
    }, [value, delay]);

    return debouncedValue;
  };

  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  const shouldLoadPerformanceData = showPerformanceReports;
  const shouldLoadCommissionsData = showCommissionsDashboard;
  const shouldLoadFormAuxData = isCreateModalOpen || isEditModalOpen;

  // Hooks de performance
  const {
    performance: performanceData,
    isLoading: isLoadingPerformance,
    error: performanceError,
  } = useAdvogadosPerformance(undefined, {
    enabled: shouldLoadPerformanceData,
    refreshInterval: 0,
  });
  const {
    performance: performanceGeral,
    isLoading: isLoadingPerformanceGeral,
    error: performanceGeralError,
  } = usePerformanceGeral(undefined, {
    enabled: shouldLoadPerformanceData,
    refreshInterval: 0,
  });

  // Debug logs removidos para produção

  // Hooks de comissões
  const { comissoes: comissoesData, isLoading: isLoadingComissoes } =
    useAdvogadosComissoes(undefined, {
      enabled: shouldLoadCommissionsData,
      refreshInterval: 0,
    });
  const { comissoes: comissoesGeral, isLoading: isLoadingComissoesGeral } =
    useComissoesGeral(undefined, {
      enabled: shouldLoadCommissionsData,
      refreshInterval: 0,
    });

  // Hook de estados do Brasil

  // Hooks para dados bancários
  const { bancos } = useBancosDisponiveis(shouldLoadFormAuxData);
  const { tipos: tiposConta } = useTiposConta(shouldLoadFormAuxData);
  const { tipos: tiposContaBancaria } =
    useTiposContaBancaria(shouldLoadFormAuxData);
  const { tipos: tiposChavePix } = useTiposChavePix(shouldLoadFormAuxData);

  // Estados para múltiplos endereços e dados bancários
  const [enderecos, setEnderecos] = useState<EnderecoFormData[]>([
    createEndereco(),
  ]);
  const [contasBancarias, setContasBancarias] = useState<
    DadosBancariosFormData[]
  >([createContaBancaria()]);

  // Estado do formulário
  const initialFormState: CreateAdvogadoInput = {
    // Dados pessoais
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    cpf: "",
    rg: "",
    dataNascimento: "",
    observacoes: "",

    // Dados profissionais
    oabNumero: "",
    oabUf: "",
    especialidades: [],
    bio: "",
    telefone: "",
    whatsapp: "",
    comissaoPadrao: 0,
    comissaoAcaoGanha: 0,
    comissaoHonorarios: 0,
    isExterno: false,

    // Dados profissionais adicionais
    formacao: "",
    experiencia: "",
    premios: "",
    publicacoes: "",
    website: "",
    linkedin: "",
    twitter: "",
    instagram: "",

    // Configurações de notificação
    notificarEmail: true,
    notificarWhatsapp: true,
    notificarSistema: true,

    // Configurações de acesso
    podeCriarProcessos: true,
    podeEditarProcessos: true,
    podeExcluirProcessos: false,
    podeGerenciarClientes: true,
    podeAcessarFinanceiro: false,

    // Configurações de criação
    criarAcessoUsuario: true,
    enviarEmailCredenciais: true,

    // Endereço (mantido para compatibilidade)
    endereco: {
      apelido: "Principal",
      tipo: "ESCRITORIO",
      principal: true,
      logradouro: "",
      numero: "",
      complemento: "",
      bairro: "",
      cidade: "",
      estado: "",
      cep: "",
      pais: "Brasil",
      telefone: "",
      observacoes: "",
    },
  };

  const [formState, setFormState] =
    useState<CreateAdvogadoInput>(initialFormState);

  useEffect(() => {
    if (enderecos.length === 0) {
      setFormState((prev) =>
        prev.endereco ? { ...prev, endereco: undefined } : prev,
      );

      return;
    }

    const principalEndereco =
      enderecos.find((endereco) => endereco.principal) ?? enderecos[0];

    if (!principalEndereco) {
      return;
    }

    const nextEndereco = {
      apelido: principalEndereco.apelido,
      tipo: principalEndereco.tipo,
      principal: true,
      logradouro: principalEndereco.logradouro,
      numero: principalEndereco.numero,
      complemento: principalEndereco.complemento,
      bairro: principalEndereco.bairro,
      cidade: principalEndereco.cidade,
      estado: principalEndereco.estado,
      cep: principalEndereco.cep,
      pais: principalEndereco.pais,
      telefone: principalEndereco.telefone,
      observacoes: principalEndereco.observacoes,
    };

    setFormState((prev) => {
      const current = prev.endereco;

      if (
        current &&
        current.apelido === nextEndereco.apelido &&
        current.tipo === nextEndereco.tipo &&
        current.logradouro === nextEndereco.logradouro &&
        current.numero === nextEndereco.numero &&
        current.complemento === nextEndereco.complemento &&
        current.bairro === nextEndereco.bairro &&
        current.cidade === nextEndereco.cidade &&
        current.estado === nextEndereco.estado &&
        current.cep === nextEndereco.cep &&
        (current.pais || "Brasil") === (nextEndereco.pais || "Brasil") &&
        (current.telefone || "") === (nextEndereco.telefone || "") &&
        (current.observacoes || "") === (nextEndereco.observacoes || "")
      ) {
        return prev;
      }

      return {
        ...prev,
        endereco: nextEndereco,
      };
    });
  }, [enderecos]);

  useEffect(() => {
    setContasBancarias((prev) =>
      prev.map((conta) => {
        const nomeSugerido =
          `${formState.firstName || ""} ${formState.lastName || ""}`.trim();
        const documentoSugerido = formState.cpf || "";
        const emailSugerido = formState.email || "";
        const telefoneSugerido = formState.phone || "";

        const titularNome = conta.titularNome || nomeSugerido;
        const titularDocumento = conta.titularDocumento || documentoSugerido;
        const titularEmail = conta.titularEmail || emailSugerido;
        const titularTelefone = conta.titularTelefone || telefoneSugerido;

        if (
          conta.titularNome === titularNome &&
          conta.titularDocumento === titularDocumento &&
          conta.titularEmail === titularEmail &&
          conta.titularTelefone === titularTelefone
        ) {
          return conta;
        }

        return {
          ...conta,
          titularNome,
          titularDocumento,
          titularEmail,
          titularTelefone,
        };
      }),
    );
  }, [
    formState.firstName,
    formState.lastName,
    formState.cpf,
    formState.email,
    formState.phone,
  ]);

  // Funções auxiliares
  const getNomeCompleto = (advogado: Advogado) => {
    const firstName = advogado.usuario.firstName || "";
    const lastName = advogado.usuario.lastName || "";

    return `${firstName} ${lastName}`.trim() || "Nome não informado";
  };

  const getNomePrimeiroUltimo = (advogado: Advogado) => {
    const nomeCompleto = getNomeCompleto(advogado);

    if (nomeCompleto === "Nome não informado") {
      return nomeCompleto;
    }

    const partes = nomeCompleto.split(/\s+/).filter(Boolean);

    if (partes.length <= 2) {
      return nomeCompleto;
    }

    return `${partes[0]} ${partes[partes.length - 1]}`;
  };

  const getOAB = (advogado: Advogado) => {
    if (advogado.oabNumero && advogado.oabUf) {
      return `${advogado.oabUf} ${advogado.oabNumero}`;
    }

    return "OAB não informada";
  };

  const getOABData = (
    advogado: Advogado,
  ): { uf: string; numero: string } | null => {
    if (advogado.oabNumero && advogado.oabUf) {
      return {
        uf: advogado.oabUf.toUpperCase(),
        numero: advogado.oabNumero,
      };
    }

    return null;
  };

  const getStatusColor = (active: boolean) => {
    return active ? "success" : "danger";
  };

  const getStatusText = (active: boolean) => {
    return active ? "Ativo" : "Inativo";
  };

  const getInitials = (nome: string) => {
    return nome
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const formatDatePtBr = (value?: string | null) => {
    if (!value) {
      return "Não informada";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return date.toLocaleDateString("pt-BR");
  };

  // Função de ordenação
  const sortAdvogados = (
    advogados: Advogado[],
    field: string,
    direction: "asc" | "desc",
  ) => {
    return [...advogados].sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (field) {
        case "nome":
          aValue = getNomeCompleto(a).toLowerCase();
          bValue = getNomeCompleto(b).toLowerCase();
          break;
        case "email":
          aValue = a.usuario.email.toLowerCase();
          bValue = b.usuario.email.toLowerCase();
          break;
        case "oab":
          aValue = getOAB(a).toLowerCase();
          bValue = getOAB(b).toLowerCase();
          break;
        case "especialidade":
          aValue = a.especialidades.length > 0 ? a.especialidades[0] : "";
          bValue = b.especialidades.length > 0 ? b.especialidades[0] : "";
          break;
        case "status":
          aValue = a.usuario.active ? 1 : 0;
          bValue = b.usuario.active ? 1 : 0;
          break;
        case "tipo":
          aValue = a.isExterno ? 1 : 0;
          bValue = b.isExterno ? 1 : 0;
          break;
        default:
          aValue = getNomeCompleto(a).toLowerCase();
          bValue = getNomeCompleto(b).toLowerCase();
      }

      if (aValue < bValue) return direction === "asc" ? -1 : 1;
      if (aValue > bValue) return direction === "asc" ? 1 : -1;

      return 0;
    });
  };

  // Filtrar, ordenar e paginar advogados
  const advogadosFiltrados = useMemo(() => {
    const filtered = advogados.filter((advogado) => {
      const nomeCompleto = getNomeCompleto(advogado).toLowerCase();
      const email = advogado.usuario.email.toLowerCase();
      const oab = getOAB(advogado).toLowerCase();

      const matchSearch =
        !debouncedSearchTerm ||
        nomeCompleto.includes(debouncedSearchTerm.toLowerCase()) ||
        email.includes(debouncedSearchTerm.toLowerCase()) ||
        oab.includes(debouncedSearchTerm.toLowerCase());

      // Filtro de status - quando "all" ou vazio, mostra todos
      const matchStatus =
        !selectedStatus ||
        selectedStatus === "all" ||
        (selectedStatus === "active" && advogado.usuario.active) ||
        (selectedStatus === "inactive" && !advogado.usuario.active);

      // Filtro de especialidade - quando "all" ou vazio, mostra todos
      const matchEspecialidade =
        !selectedEspecialidade ||
        selectedEspecialidade === "all" ||
        advogado.especialidades.includes(
          selectedEspecialidade as EspecialidadeJuridica,
        );

      // Filtro de tipo - quando "all" ou vazio, mostra todos
      const matchTipo =
        !selectedTipo ||
        selectedTipo === "all" ||
        (selectedTipo === "escritorio" && !advogado.isExterno) ||
        (selectedTipo === "externo" && advogado.isExterno);

      // Filtros avançados
      const matchComissaoMin =
        !comissaoMin || advogado.comissaoPadrao >= parseFloat(comissaoMin);
      const matchComissaoMax =
        !comissaoMax || advogado.comissaoPadrao <= parseFloat(comissaoMax);

      // Para data de cadastro, vamos usar a data de criação do usuário (simulado)
      const matchDataInicio = !dataInicio || true; // Em produção, comparar com data de criação
      const matchDataFim = !dataFim || true; // Em produção, comparar com data de criação

      return (
        matchSearch &&
        matchStatus &&
        matchEspecialidade &&
        matchTipo &&
        matchComissaoMin &&
        matchComissaoMax &&
        matchDataInicio &&
        matchDataFim
      );
    });

    const sorted = sortAdvogados(filtered, sortField, sortDirection);

    // Aplicar paginação
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;

    return sorted.slice(startIndex, endIndex);
  }, [
    advogados,
    debouncedSearchTerm,
    selectedStatus,
    selectedEspecialidade,
    selectedTipo,
    sortField,
    sortDirection,
    currentPage,
    itemsPerPage,
    comissaoMin,
    comissaoMax,
    dataInicio,
    dataFim,
  ]);

  // Calcular total de advogados filtrados (sem paginação)
  const totalAdvogadosFiltrados = useMemo(() => {
    return advogados.filter((advogado) => {
      const nomeCompleto = getNomeCompleto(advogado).toLowerCase();
      const email = advogado.usuario.email.toLowerCase();
      const oab = getOAB(advogado).toLowerCase();

      const matchSearch =
        !debouncedSearchTerm ||
        nomeCompleto.includes(debouncedSearchTerm.toLowerCase()) ||
        email.includes(debouncedSearchTerm.toLowerCase()) ||
        oab.includes(debouncedSearchTerm.toLowerCase());

      const matchStatus =
        selectedStatus === "all" ||
        (selectedStatus === "active" && advogado.usuario.active) ||
        (selectedStatus === "inactive" && !advogado.usuario.active);

      const matchEspecialidade =
        selectedEspecialidade === "all" ||
        advogado.especialidades.includes(
          selectedEspecialidade as EspecialidadeJuridica,
        );

      const matchTipo =
        selectedTipo === "all" ||
        (selectedTipo === "escritorio" && !advogado.isExterno) ||
        (selectedTipo === "externo" && advogado.isExterno);

      // Filtros avançados
      const matchComissaoMin =
        !comissaoMin || advogado.comissaoPadrao >= parseFloat(comissaoMin);
      const matchComissaoMax =
        !comissaoMax || advogado.comissaoPadrao <= parseFloat(comissaoMax);

      // Para data de cadastro, vamos usar a data de criação do usuário (simulado)
      const matchDataInicio = !dataInicio || true; // Em produção, comparar com data de criação
      const matchDataFim = !dataFim || true; // Em produção, comparar com data de criação

      return (
        matchSearch &&
        matchStatus &&
        matchEspecialidade &&
        matchTipo &&
        matchComissaoMin &&
        matchComissaoMax &&
        matchDataInicio &&
        matchDataFim
      );
    }).length;
  }, [
    advogados,
    debouncedSearchTerm,
    selectedStatus,
    selectedEspecialidade,
    selectedTipo,
    comissaoMin,
    comissaoMax,
    dataInicio,
    dataFim,
  ]);

  // Calcular informações de paginação
  const totalPages = Math.ceil(totalAdvogadosFiltrados / itemsPerPage);
  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalAdvogadosFiltrados);

  // Calcular métricas
  const metrics = useMemo(() => {
    if (!advogados)
      return {
        total: 0,
        ativos: 0,
        comOAB: 0,
        especialidades: 0,
        externos: 0,
        escritorio: 0,
      };

    const total = advogados.length;
    const ativos = advogados.filter((a) => a.usuario.active).length;
    const comOAB = advogados.filter((a) => a.oabNumero && a.oabUf).length;
    const especialidades = new Set(advogados.flatMap((a) => a.especialidades))
      .size;
    const externos = advogados.filter((a) => a.isExterno).length;
    const escritorio = advogados.filter((a) => !a.isExterno).length;

    return { total, ativos, comOAB, especialidades, externos, escritorio };
  }, [advogados]);

  // Verificar se há filtros ativos
  const hasActiveFilters =
    searchTerm ||
    selectedStatus !== "all" ||
    selectedEspecialidade !== "all" ||
    selectedTipo !== "all";

  const clearFilters = () => {
    setSearchTerm("");
    setSelectedStatus("all");
    setSelectedEspecialidade("all");
    setSelectedTipo("all");
    setShowFilters(false);
  };

  // Handlers
  const handleCreateAdvogado = async () => {
    setIsSaving(true);
    try {
      // Validar formulário
      const validation = validateForm();

      if (!validation.isValid) {
        validation.errors.forEach((error) => toast.error(error));

        return;
      }

      const enderecosPayload = enderecos
        .map((endereco, index) => ({
          apelido: endereco.apelido || `Endereço ${index + 1}`,
          tipo: endereco.tipo || "ESCRITORIO",
          principal: endereco.principal ?? index === 0,
          logradouro: endereco.logradouro || "",
          numero: endereco.numero || "",
          complemento: endereco.complemento || "",
          bairro: endereco.bairro || "",
          cidade: endereco.cidade || "",
          estado: endereco.estado || "",
          cep: endereco.cep || "",
          pais: endereco.pais || "Brasil",
          telefone: endereco.telefone || "",
          observacoes: endereco.observacoes || "",
        }))
        .filter((endereco) => {
          const campos = [
            endereco.logradouro,
            endereco.cidade,
            endereco.estado,
          ];

          return campos.some((valor) => valor && valor.trim().length > 0);
        });

      const enderecoPrincipal =
        enderecosPayload.find((item) => item.principal) ?? enderecosPayload[0];

      const contasPayload = contasBancarias
        .map((conta, index) => ({
          tipoConta: conta.tipoConta,
          bancoCodigo: conta.bancoCodigo,
          agencia: conta.agencia,
          conta: conta.conta,
          digitoConta: conta.digitoConta || "",
          tipoContaBancaria: conta.tipoContaBancaria,
          chavePix: conta.chavePix || "",
          tipoChavePix: conta.tipoChavePix,
          titularNome:
            conta.titularNome ||
            `${formState.firstName} ${formState.lastName}`.trim(),
          titularDocumento: conta.titularDocumento || formState.cpf || "",
          titularEmail: conta.titularEmail || formState.email || "",
          titularTelefone: conta.titularTelefone || formState.phone || "",
          endereco: conta.endereco || "",
          cidade: conta.cidade || "",
          estado: conta.estado || "",
          cep: conta.cep || "",
          principal: conta.principal ?? index === 0,
          observacoes: conta.observacoes || "",
        }))
        .filter(
          (conta) =>
            conta.bancoCodigo &&
            conta.agencia &&
            conta.conta &&
            conta.titularNome &&
            conta.titularDocumento,
        );

      const input: CreateAdvogadoInput = {
        firstName: formState.firstName,
        lastName: formState.lastName,
        email: formState.email,
        phone: formState.phone,
        cpf: formState.cpf,
        rg: formState.rg,
        dataNascimento: formState.dataNascimento,
        observacoes: formState.observacoes,
        oabNumero: formState.oabNumero,
        oabUf: formState.oabUf,
        especialidades: formState.especialidades,
        bio: formState.bio,
        telefone: formState.telefone,
        whatsapp: formState.whatsapp,
        comissaoPadrao: formState.comissaoPadrao,
        comissaoAcaoGanha: formState.comissaoAcaoGanha,
        comissaoHonorarios: formState.comissaoHonorarios,
        isExterno: formState.isExterno,
        formacao: formState.formacao,
        experiencia: formState.experiencia,
        premios: formState.premios,
        publicacoes: formState.publicacoes,
        website: formState.website,
        linkedin: formState.linkedin,
        twitter: formState.twitter,
        instagram: formState.instagram,
        notificarEmail: formState.notificarEmail,
        notificarWhatsapp: formState.notificarWhatsapp,
        notificarSistema: formState.notificarSistema,
        podeCriarProcessos: formState.podeCriarProcessos,
        podeEditarProcessos: formState.podeEditarProcessos,
        podeExcluirProcessos: formState.podeExcluirProcessos,
        podeGerenciarClientes: formState.podeGerenciarClientes,
        podeAcessarFinanceiro: formState.podeAcessarFinanceiro,
        criarAcessoUsuario: formState.criarAcessoUsuario,
        enviarEmailCredenciais: formState.enviarEmailCredenciais,
        endereco: enderecoPrincipal,
        enderecos: enderecosPayload.length > 0 ? enderecosPayload : undefined,
        dadosBancarios: contasPayload.length > 0 ? contasPayload : undefined,
      };

      const result = await createAdvogado(input);

      if (result.success) {
        toast.success("Advogado criado com sucesso!");
        setIsCreateModalOpen(false);
        setFormState({ ...initialFormState });
        setEnderecos([createEndereco()]);
        setContasBancarias([createContaBancaria()]);
        mutate();

        // Se há dados de primeiro acesso, mostrar modal
        if (result.credenciais) {
          setCredenciaisTemporarias(result.credenciais);
          setIsCredenciaisModalOpen(true);
          if (
            result.credenciais.envioSolicitado &&
            !result.credenciais.primeiroAcessoEnviado
          ) {
            toast.warning(
              "Advogado criado, mas o e-mail de primeiro acesso não foi enviado automaticamente.",
            );
          }
        }
      } else {
        toast.error(result.error || "Erro ao criar advogado");
      }
    } catch (error) {
      toast.error("Erro ao criar advogado");
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditAdvogado = (advogado: Advogado) => {
    const dataNascimento = advogado.usuario.dataNascimento
      ? typeof advogado.usuario.dataNascimento === "string"
        ? advogado.usuario.dataNascimento
        : new Date(advogado.usuario.dataNascimento).toISOString().slice(0, 10)
      : "";

    // Popular TODOS os campos disponíveis do advogado
    setFormState({
      // Dados pessoais básicos
      firstName: advogado.usuario.firstName || "",
      lastName: advogado.usuario.lastName || "",
      email: advogado.usuario.email,
      phone: advogado.usuario.phone || "",
      cpf: advogado.usuario.cpf || "",
      rg: advogado.usuario.rg || "",
      dataNascimento,
      observacoes: advogado.usuario.observacoes || "",

      // Dados profissionais básicos
      oabNumero: advogado.oabNumero || "",
      oabUf: advogado.oabUf || "",
      especialidades: advogado.especialidades,
      bio: advogado.bio || "",
      telefone: advogado.telefone || "",
      whatsapp: advogado.whatsapp || "",
      comissaoPadrao: advogado.comissaoPadrao,
      comissaoAcaoGanha: advogado.comissaoAcaoGanha,
      comissaoHonorarios: advogado.comissaoHonorarios,
      isExterno: advogado.isExterno,

      // Dados profissionais adicionais (agora vindo do banco!)
      formacao: advogado.formacao || "",
      experiencia: advogado.experiencia || "",
      premios: advogado.premios || "",
      publicacoes: advogado.publicacoes || "",
      website: advogado.website || "",
      linkedin: advogado.linkedin || "",
      twitter: advogado.twitter || "",
      instagram: advogado.instagram || "",

      // Configurações de notificação (agora vindo do banco!)
      notificarEmail: advogado.notificarEmail,
      notificarWhatsapp: advogado.notificarWhatsapp,
      notificarSistema: advogado.notificarSistema,

      // Configurações de acesso (agora vindo do banco!)
      podeCriarProcessos: advogado.podeCriarProcessos,
      podeEditarProcessos: advogado.podeEditarProcessos,
      podeExcluirProcessos: advogado.podeExcluirProcessos,
      podeGerenciarClientes: advogado.podeGerenciarClientes,
      podeAcessarFinanceiro: advogado.podeAcessarFinanceiro,

      // Configurações de criação (não aplicáveis na edição)
      criarAcessoUsuario: false,
      enviarEmailCredenciais: false,

      // Endereço padrão
      endereco: {
        apelido: "Principal",
        tipo: "ESCRITORIO",
        principal: true,
        logradouro: "",
        numero: "",
        complemento: "",
        bairro: "",
        cidade: "",
        estado: "",
        cep: "",
        pais: "Brasil",
        telefone: "",
        observacoes: "",
      },
    });

    // Resetar endereços e contas bancárias para valores padrão
    setEnderecos([createEndereco()]);
    setContasBancarias([createContaBancaria()]);

    setSelectedAdvogado(advogado);
    setIsEditModalOpen(true);
  };

  const handleViewAdvogado = (advogado: Advogado) => {
    setSelectedAdvogado(advogado);
    setIsViewModalOpen(true);
  };

  const handleViewHistorico = (advogado: Advogado) => {
    setSelectedAdvogado(advogado);
    setIsHistoricoModalOpen(true);
  };

  const handleViewNotificacoes = (advogado: Advogado) => {
    setSelectedAdvogado(advogado);
    setIsNotificacoesModalOpen(true);
  };

  const handleUpdateAdvogado = async () => {
    if (!selectedAdvogado) return;

    setIsSaving(true);
    try {
      // Validar formulário
      const validation = validateForm();

      if (!validation.isValid) {
        validation.errors.forEach((error) => toast.error(error));

        return;
      }
      const input: UpdateAdvogadoInput = {
        firstName: formState.firstName,
        lastName: formState.lastName,
        phone: formState.phone,
        cpf: formState.cpf,
        rg: formState.rg,
        dataNascimento: formState.dataNascimento,
        observacoes: formState.observacoes,
        oabNumero: formState.oabNumero,
        oabUf: formState.oabUf,
        especialidades: formState.especialidades,
        bio: formState.bio,
        telefone: formState.telefone,
        whatsapp: formState.whatsapp,
        comissaoPadrao: formState.comissaoPadrao,
        comissaoAcaoGanha: formState.comissaoAcaoGanha,
        comissaoHonorarios: formState.comissaoHonorarios,
        formacao: formState.formacao,
        experiencia: formState.experiencia,
        premios: formState.premios,
        publicacoes: formState.publicacoes,
        website: formState.website,
        linkedin: formState.linkedin,
        twitter: formState.twitter,
        instagram: formState.instagram,
        notificarEmail: formState.notificarEmail,
        notificarWhatsapp: formState.notificarWhatsapp,
        notificarSistema: formState.notificarSistema,
        podeCriarProcessos: formState.podeCriarProcessos,
        podeEditarProcessos: formState.podeEditarProcessos,
        podeExcluirProcessos: formState.podeExcluirProcessos,
        podeGerenciarClientes: formState.podeGerenciarClientes,
        podeAcessarFinanceiro: formState.podeAcessarFinanceiro,
      };

      const result = await updateAdvogado(selectedAdvogado.id, input);

      if (result.success) {
        toast.success("Advogado atualizado com sucesso!");
        setIsEditModalOpen(false);
        setSelectedAdvogado(null);
        mutate();
      } else {
        toast.error(result.error || "Erro ao atualizar advogado");
      }
    } catch (error) {
      toast.error("Erro ao atualizar advogado");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAdvogado = async (advogadoId: string) => {
    if (!confirm("Tem certeza que deseja excluir este advogado?")) return;

    try {
      const result = await deleteAdvogado(advogadoId);

      if (result.success) {
        toast.success("Advogado excluído com sucesso!");
        mutate();
      } else {
        toast.error(result.error || "Erro ao excluir advogado");
      }
    } catch (error) {
      toast.error("Erro ao excluir advogado");
    }
  };

  const handleUploadAvatar = async (advogadoId: string, file: File) => {
    setIsUploadingAvatar(true);
    try {
      const result = await uploadAvatarAdvogado(advogadoId, file);

      if (result.success) {
        toast.success("Avatar atualizado com sucesso!");
        mutate();
      } else {
        toast.error(result.error || "Erro ao fazer upload do avatar");
      }
    } catch (error) {
      toast.error("Erro ao fazer upload do avatar");
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleDeleteAvatar = async (advogadoId: string) => {
    if (!confirm("Tem certeza que deseja remover o avatar?")) return;

    try {
      const result = await deleteAvatarAdvogado(advogadoId);

      if (result.success) {
        toast.success("Avatar removido com sucesso!");
        mutate();
      } else {
        toast.error(result.error || "Erro ao remover avatar");
      }
    } catch (error) {
      toast.error("Erro ao remover avatar");
    }
  };

  const handleEditAvatar = (advogado: Advogado) => {
    setSelectedAdvogadoForAvatar(advogado);
    setIsAvatarEditorOpen(true);
  };

  const handleSaveAvatar = async (
    imageData: string | FormData | null,
    isUrl: boolean,
  ) => {
    if (!imageData || !selectedAdvogadoForAvatar) return;

    setIsUploadingAvatar(true);
    setIsAvatarEditorOpen(false);

    try {
      let result;

      if (isUrl && typeof imageData === "string") {
        // Se for URL, converter para arquivo
        const response = await fetch(imageData);
        const blob = await response.blob();
        const file = new File([blob], "avatar.jpg", { type: blob.type });

        result = await uploadAvatarAdvogado(selectedAdvogadoForAvatar.id, file);
      } else if (imageData instanceof FormData) {
        // Se for FormData (arquivo original), extrair o arquivo
        const file = imageData.get("file") as File;

        if (file) {
          result = await uploadAvatarAdvogado(
            selectedAdvogadoForAvatar.id,
            file,
          );
        } else {
          throw new Error("Arquivo não encontrado no FormData");
        }
      } else if (typeof imageData === "string") {
        // Se for base64 (crop), converter para blob e depois para File
        const response = await fetch(imageData);
        const blob = await response.blob();
        const file = new File([blob], "avatar.jpg", { type: blob.type });

        result = await uploadAvatarAdvogado(selectedAdvogadoForAvatar.id, file);
      } else {
        throw new Error("Tipo de dados inválido");
      }

      if (result.success) {
        toast.success("Avatar atualizado com sucesso!");
        mutate();
      } else {
        toast.error(result.error || "Erro ao atualizar avatar");
      }
    } catch (error) {
      toast.error("Erro ao salvar avatar");
    } finally {
      setIsUploadingAvatar(false);
      setSelectedAdvogadoForAvatar(null);
    }
  };

  const handleRemoveAvatar = async (advogado: Advogado) => {
    if (!confirm("Tem certeza que deseja remover o avatar?")) return;

    try {
      const result = await deleteAvatarAdvogado(advogado.id);

      if (result.success) {
        toast.success("Avatar removido com sucesso!");
        mutate();
      } else {
        toast.error(result.error || "Erro ao remover avatar");
      }
    } catch (error) {
      toast.error("Erro ao remover avatar");
    }
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  // Resetar paginação quando filtros mudarem
  useEffect(() => {
    setCurrentPage(1);
  }, [
    searchTerm,
    selectedStatus,
    selectedEspecialidade,
    selectedTipo,
    comissaoMin,
    comissaoMax,
    dataInicio,
    dataFim,
  ]);

  // Resetar seleção quando filtros mudarem
  useEffect(() => {
    setSelectedAdvogados([]);
  }, [
    searchTerm,
    selectedStatus,
    selectedEspecialidade,
    selectedTipo,
    currentPage,
  ]);

  const handleConvertToInterno = async (advogadoId: string) => {
    if (
      !confirm(
        "Tem certeza que deseja transformar este advogado externo em interno? Esta ação não pode ser desfeita.",
      )
    )
      return;

    try {
      const result = await convertAdvogadoExternoToInterno(advogadoId);

      if (result.success) {
        toast.success("Advogado convertido para interno com sucesso!");
        mutate();
      } else {
        toast.error(result.error || "Erro ao converter advogado");
      }
    } catch (error) {
      toast.error("Erro ao converter advogado");
    }
  };

  // Funções de exportação
  const exportToCSV = () => {
    try {
      const csvData = advogados.map((advogado) => ({
        Nome: getNomeCompleto(advogado),
        Email: advogado.usuario.email,
        Telefone: advogado.usuario.phone || advogado.telefone || "",
        OAB: getOAB(advogado),
        Especialidades: advogado.especialidades.join(", "),
        Status: getStatusText(advogado.usuario.active),
        Tipo: advogado.isExterno ? "Externo" : "Interno",
        "Comissão Padrão": `${advogado.comissaoPadrao}%`,
        "Comissão Ação Ganha": `${advogado.comissaoAcaoGanha}%`,
        "Comissão Honorários": `${advogado.comissaoHonorarios}%`,
        Bio: advogado.bio || "",
        WhatsApp: advogado.whatsapp || "",
      }));

      const headers = Object.keys(csvData[0]);
      const csvContent = [
        headers.join(","),
        ...csvData.map((row) =>
          headers
            .map((header) => `"${row[header as keyof typeof row]}"`)
            .join(","),
        ),
      ].join("\n");

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);

      link.setAttribute("href", url);
      link.setAttribute(
        "download",
        `advogados_${new Date().toISOString().split("T")[0]}.csv`,
      );
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success("Arquivo CSV exportado com sucesso!");
    } catch (error) {
      toast.error("Erro ao exportar arquivo CSV");
    }
  };

  const exportToPDF = () => {
    try {
      // Criar conteúdo HTML para o PDF
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Relatório de Advogados</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            h1 { color: #2563eb; text-align: center; margin-bottom: 30px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; font-weight: bold; }
            .header { margin-bottom: 20px; }
            .summary { background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
          </style>
        </head>
        <body>
          <h1>Relatório de Advogados</h1>
          <div class="header">
            <p><strong>Data de Exportação:</strong> ${new Date().toLocaleDateString("pt-BR")}</p>
            <p><strong>Total de Advogados:</strong> ${advogados.length}</p>
          </div>
          <div class="summary">
            <h3>Resumo</h3>
            <p><strong>Total:</strong> ${metrics.total} | <strong>Ativos:</strong> ${metrics.ativos} | <strong>Com OAB:</strong> ${metrics.comOAB} | <strong>Externos:</strong> ${metrics.externos} | <strong>Do Escritório:</strong> ${metrics.escritorio}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Email</th>
                <th>OAB</th>
                <th>Especialidades</th>
                <th>Status</th>
                <th>Tipo</th>
                <th>Comissões</th>
              </tr>
            </thead>
            <tbody>
              ${advogados
                .map(
                  (advogado) => `
                <tr>
                  <td>${getNomeCompleto(advogado)}</td>
                  <td>${advogado.usuario.email}</td>
                  <td>${getOAB(advogado)}</td>
                  <td>${advogado.especialidades.join(", ")}</td>
                  <td>${getStatusText(advogado.usuario.active)}</td>
                  <td>${advogado.isExterno ? "Externo" : "Interno"}</td>
                  <td>Padrão: ${advogado.comissaoPadrao}% | Ação: ${advogado.comissaoAcaoGanha}% | Honorários: ${advogado.comissaoHonorarios}%</td>
                </tr>
              `,
                )
                .join("")}
            </tbody>
          </table>
        </body>
        </html>
      `;

      // Abrir em nova janela para impressão/PDF
      const printWindow = window.open("", "_blank");

      if (printWindow) {
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
          printWindow.print();
        }, 500);
      }

      toast.success("Relatório PDF gerado com sucesso!");
    } catch (error) {
      toast.error("Erro ao gerar relatório PDF");
    }
  };

  // Funções de ações em lote
  const handleSelectAll = () => {
    if (selectedAdvogados.length === advogadosFiltrados.length) {
      setSelectedAdvogados([]);
    } else {
      setSelectedAdvogados(advogadosFiltrados.map((advogado) => advogado.id));
    }
  };

  const handleSelectAdvogado = (advogadoId: string) => {
    setSelectedAdvogados((prev) =>
      prev.includes(advogadoId)
        ? prev.filter((id) => id !== advogadoId)
        : [...prev, advogadoId],
    );
  };

  const handleBulkActivate = async () => {
    if (selectedAdvogados.length === 0) return;

    setIsBulkActionLoading(true);
    try {
      // Simular ação em lote (em produção, seria uma action no backend)
      await new Promise((resolve) => setTimeout(resolve, 1000));

      toast.success(
        `${selectedAdvogados.length} advogado(s) ativado(s) com sucesso!`,
      );
      setSelectedAdvogados([]);
      mutate();
    } catch (error) {
      toast.error("Erro ao ativar advogados");
    } finally {
      setIsBulkActionLoading(false);
    }
  };

  const handleBulkDeactivate = async () => {
    if (selectedAdvogados.length === 0) return;

    if (
      !confirm(
        `Tem certeza que deseja desativar ${selectedAdvogados.length} advogado(s)?`,
      )
    )
      return;

    setIsBulkActionLoading(true);
    try {
      // Simular ação em lote (em produção, seria uma action no backend)
      await new Promise((resolve) => setTimeout(resolve, 1000));

      toast.success(
        `${selectedAdvogados.length} advogado(s) desativado(s) com sucesso!`,
      );
      setSelectedAdvogados([]);
      mutate();
    } catch (error) {
      toast.error("Erro ao desativar advogados");
    } finally {
      setIsBulkActionLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedAdvogados.length === 0) return;

    if (
      !confirm(
        `Tem certeza que deseja excluir ${selectedAdvogados.length} advogado(s)? Esta ação não pode ser desfeita.`,
      )
    )
      return;

    setIsBulkActionLoading(true);
    try {
      // Simular ação em lote (em produção, seria uma action no backend)
      await new Promise((resolve) => setTimeout(resolve, 1000));

      toast.success(
        `${selectedAdvogados.length} advogado(s) excluído(s) com sucesso!`,
      );
      setSelectedAdvogados([]);
      mutate();
    } catch (error) {
      toast.error("Erro ao excluir advogados");
    } finally {
      setIsBulkActionLoading(false);
    }
  };

  // Funções de filtros avançados
  const clearAdvancedFilters = () => {
    setComissaoMin("");
    setComissaoMax("");
    setDataInicio("");
    setDataFim("");
  };

  const hasAdvancedFilters =
    comissaoMin || comissaoMax || dataInicio || dataFim;

  // Funções de validação
  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    return emailRegex.test(email);
  };

  const validateOAB = (oabNumero: string, oabUf: string): boolean => {
    if (!oabNumero || !oabUf) return true; // OAB é opcional
    const oabRegex = /^\d{1,6}$/;

    return oabRegex.test(oabNumero) && oabUf.length === 2;
  };

  const validatePhone = (phone: string): boolean => {
    if (!phone) return true; // Telefone é opcional
    const phoneRegex = /^\(\d{2}\)\s\d{4,5}-\d{4}$/;

    return phoneRegex.test(phone);
  };

  const validateForm = (): { isValid: boolean; errors: string[] } => {
    const errors: string[] = [];

    // Validar campos obrigatórios
    if (!formState.firstName.trim()) {
      errors.push("Nome é obrigatório");
    }
    if (!formState.lastName.trim()) {
      errors.push("Sobrenome é obrigatório");
    }
    if (!formState.email.trim()) {
      errors.push("Email é obrigatório");
    }

    // Validar formato do email
    if (formState.email && !validateEmail(formState.email)) {
      errors.push("Email inválido");
    }

    // Validar OAB
    if (
      formState.oabNumero &&
      formState.oabUf &&
      !validateOAB(formState.oabNumero, formState.oabUf)
    ) {
      errors.push(
        "OAB inválida. Número deve ter até 6 dígitos e UF deve ter 2 caracteres",
      );
    }

    // Validar telefone
    if (formState.phone && !validatePhone(formState.phone)) {
      errors.push("Telefone inválido. Use o formato (XX) XXXXX-XXXX");
    }

    // Validar comissões (devem ser entre 0 e 100)
    if (
      (formState.comissaoPadrao ?? 0) < 0 ||
      (formState.comissaoPadrao ?? 0) > 100
    ) {
      errors.push("Comissão padrão deve estar entre 0 e 100%");
    }
    if (
      (formState.comissaoAcaoGanha ?? 0) < 0 ||
      (formState.comissaoAcaoGanha ?? 0) > 100
    ) {
      errors.push("Comissão ação ganha deve estar entre 0 e 100%");
    }
    if (
      (formState.comissaoHonorarios ?? 0) < 0 ||
      (formState.comissaoHonorarios ?? 0) > 100
    ) {
      errors.push("Comissão honorários deve estar entre 0 e 100%");
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  };

  // Opções para filtros
  const statusOptions = [
    { key: "all", label: "Todos" },
    { key: "active", label: "Ativos" },
    { key: "inactive", label: "Inativos" },
  ];

  const tipoOptions = [
    { key: "all", label: "Todos" },
    { key: "escritorio", label: "Do Escritório" },
    { key: "externo", label: "Externos Identificados" },
  ];

  const especialidadeOptions = [
    { key: "all", label: "Todas" },
    { key: EspecialidadeJuridica.CIVIL, label: "Direito Civil" },
    { key: EspecialidadeJuridica.CRIMINAL, label: "Direito Criminal" },
    { key: EspecialidadeJuridica.TRABALHISTA, label: "Direito Trabalhista" },
    {
      key: EspecialidadeJuridica.ADMINISTRATIVO,
      label: "Direito Administrativo",
    },
    { key: EspecialidadeJuridica.TRIBUTARIO, label: "Direito Tributário" },
    { key: EspecialidadeJuridica.EMPRESARIAL, label: "Direito Empresarial" },
    { key: EspecialidadeJuridica.FAMILIA, label: "Direito de Família" },
    { key: EspecialidadeJuridica.CONSUMIDOR, label: "Direito do Consumidor" },
  ];

  const advogadoImportFields = [
    {
      label: "nomeCompleto",
      description: "Mesmo nome utilizado na OAB.",
    },
    {
      label: "email",
      description: "Receberá convites de acesso e notificações.",
    },
    {
      label: "oab",
      description: "Número sem UF (apenas dígitos).",
    },
    {
      label: "ufOAB",
      description: "Sigla do estado (ex.: SP, RJ).",
    },
    {
      label: "telefone",
      description: "Contato principal do advogado.",
    },
    {
      label: "especialidade",
      description: "Ex.: Direito Empresarial, Direito Civil.",
    },
    {
      label: "tipoVinculo",
      description: "Use INTERNO ou EXTERNO/TERCEIRIZADO.",
    },
  ];

  if (loading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex min-h-[300px] flex-col items-center justify-center space-y-4">
          <div className="text-danger text-center">
            <p className="text-lg font-semibold">Erro ao carregar advogados</p>
            <p className="text-sm">{errorMessage}</p>
          </div>
          <Button color="primary" onClick={() => mutate()}>
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        initial={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.5 }}
      >
        <PeoplePageHeader
          description="Padrao unico para acompanhamento da equipe juridica, produtividade e operacao diaria."
          title="Advogados"
          actions={
            <>
              <Button
                color="default"
                size="sm"
                startContent={isCompactView ? <Eye size={16} /> : <X size={16} />}
                variant="flat"
                onPress={() => setIsCompactView((prev) => !prev)}
              >
                {isCompactView ? "Visão detalhada" : "Visão compacta"}
              </Button>

              <Dropdown>
                <DropdownTrigger>
                  <Button
                    className="border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800"
                    size="sm"
                    startContent={<MoreVertical size={16} />}
                    variant="bordered"
                  >
                    Ações
                  </Button>
                </DropdownTrigger>
                <DropdownMenu aria-label="Ações da página de advogados">
                  <DropdownItem
                    key="import"
                    startContent={<UploadCloud className="h-4 w-4" />}
                    onPress={() => setIsImportModalOpen(true)}
                  >
                    Importar via Excel
                  </DropdownItem>
                  <DropdownItem
                    key="csv"
                    startContent={<Table className="h-4 w-4" />}
                    onPress={exportToCSV}
                  >
                    Exportar para CSV
                  </DropdownItem>
                  <DropdownItem
                    key="pdf"
                    startContent={<FileText className="h-4 w-4" />}
                    onPress={exportToPDF}
                  >
                    Exportar para PDF
                  </DropdownItem>
                  <DropdownItem
                    key="performance"
                    startContent={<BarChart3 className="h-4 w-4" />}
                    onPress={() =>
                      setShowPerformanceReports(!showPerformanceReports)
                    }
                  >
                    {showPerformanceReports
                      ? "Ocultar relatório de performance"
                      : "Mostrar relatório de performance"}
                  </DropdownItem>
                  <DropdownItem
                    key="commissions"
                    startContent={<DollarSign className="h-4 w-4" />}
                    onPress={() =>
                      setShowCommissionsDashboard(!showCommissionsDashboard)
                    }
                  >
                    {showCommissionsDashboard
                      ? "Ocultar dashboard de comissões"
                      : "Mostrar dashboard de comissões"}
                  </DropdownItem>
                </DropdownMenu>
              </Dropdown>

              <Button
                className="bg-primary text-primary-foreground"
                size="sm"
                startContent={<Plus size={16} />}
                onPress={() => {
                  setFormState({ ...initialFormState });
                  setEnderecos([createEndereco()]);
                  setContasBancarias([createContaBancaria()]);
                  setIsCreateModalOpen(true);
                }}
              >
                Novo advogado
              </Button>
            </>
          }
        />
      </motion.div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <PeopleMetricCard
          helper="Equipe cadastrada"
          icon={<Users className="h-4 w-4" />}
          label="Total de advogados"
          tone="primary"
          value={metrics.total}
        />
        <PeopleMetricCard
          helper={`${metrics.total ? Math.round((metrics.ativos / metrics.total) * 100) : 0}% ativos`}
          icon={<CheckCircle className="h-4 w-4" />}
          label="Advogados ativos"
          tone="success"
          value={metrics.ativos}
        />
        <PeopleMetricCard
          helper="Com cadastro profissional"
          icon={<ScaleIcon className="h-4 w-4" />}
          label="Com OAB"
          tone="secondary"
          value={metrics.comOAB}
        />
        <PeopleMetricCard
          helper="Areas de atuacao mapeadas"
          icon={<Star className="h-4 w-4" />}
          label="Especialidades"
          tone="warning"
          value={metrics.especialidades}
        />
        <PeopleMetricCard
          helper="Equipe interna"
          icon={<Building2 className="h-4 w-4" />}
          label="Do escritorio"
          tone="primary"
          value={metrics.escritorio}
        />
        <PeopleMetricCard
          helper="Mapeados por processo"
          icon={<Eye className="h-4 w-4" />}
          label="Externos identificados"
          tone="danger"
          value={metrics.externos}
        />
        {!isCompactView ? (
          <>
            <PeopleMetricCard
              helper="Com conta de acesso"
              icon={<Key className="h-4 w-4" />}
              label="Cobertura de login"
              tone="success"
              value={`${metrics.total ? Math.round((metrics.ativos / metrics.total) * 100) : 0}%`}
            />
            <PeopleMetricCard
              helper="Status da operacao"
              icon={<Activity className="h-4 w-4" />}
              label="Leitura geral"
              tone="default"
              value={metrics.total > 0 ? "Estavel" : "Sem base"}
            />
          </>
        ) : null}
      </div>

      {/* Filtros Avançados */}
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
	                    Filtros da equipe
	                  </h3>
	                  <p className="text-xs text-default-500 sm:text-sm">
	                    Encontre advogados rapidamente sem poluir a tela.
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
                        [
                          searchTerm,
                          selectedStatus !== "all",
                          selectedEspecialidade !== "all",
                          selectedTipo !== "all",
                        ].filter(Boolean).length
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
                          [
                            searchTerm,
                            selectedStatus !== "all",
                            selectedEspecialidade !== "all",
                            selectedTipo !== "all",
                          ].filter(Boolean).length
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
                {!isCompactView ? (
                  <Tooltip color="secondary" content="Filtros avançados">
                    <Button
                      className={`flex-1 sm:flex-none ${hasAdvancedFilters ? "bg-blue-50 dark:bg-blue-900/20" : ""}`}
                      color="secondary"
                      size="sm"
                      startContent={<Filter className="w-4 h-4" />}
                      variant="light"
                      onPress={() =>
                        setShowAdvancedFilters(!showAdvancedFilters)
                      }
                    >
                      Avançados
                      {hasAdvancedFilters && (
                        <Badge
                          className="ml-1"
                          color="primary"
                          content="!"
                          size="sm"
                        >
                          !
                        </Badge>
                      )}
                    </Button>
                  </Tooltip>
                ) : null}
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
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
                        placeholder="Nome, email, OAB..."
                        size="md"
                        startContent={
                          <Search className="w-4 h-4 text-default-400" />
                        }
                        value={searchTerm}
                        variant="bordered"
                        onValueChange={setSearchTerm}
                      />
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Busca em nomes, emails e OAB
                      </p>
                    </motion.div>

                    {/* Filtro por Status */}
                    <motion.div
                      animate={{ opacity: 1, x: 0 }}
                      className="space-y-3"
                      initial={{ opacity: 0, x: -20 }}
                      transition={{ delay: 0.2 }}
                    >
                      <label
                        className="text-sm font-semibold flex items-center gap-2 text-slate-700 dark:text-slate-300"
                        htmlFor="filtro-status"
                      >
                        <Activity className="w-4 h-4 text-green-500" />
                        Status
                      </label>
                      <Select
                        classNames={{
                          trigger:
                            "bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 hover:border-green-400 dark:hover:border-green-500",
                        }}
                        id="filtro-status"
                        placeholder="Selecione o status"
                        selectedKeys={[selectedStatus]}
                        size="md"
                        variant="bordered"
                        onChange={(e) => setSelectedStatus(e.target.value)}
                      >
                        {statusOptions.map((option) => (
                          <SelectItem key={option.key} textValue={option.label}>
                            <div className="flex items-center gap-2">
                              {option.key === "all" && (
                                <Users className="w-4 h-4" />
                              )}
                              {option.key === "active" && (
                                <CheckCircle className="w-4 h-4" />
                              )}
                              {option.key === "inactive" && (
                                <XCircle className="w-4 h-4" />
                              )}
                              <span>{option.label}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </Select>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Filtre por status do advogado
                      </p>
                    </motion.div>

                    {/* Filtro por Especialidade */}
                    <motion.div
                      animate={{ opacity: 1, x: 0 }}
                      className="space-y-3"
                      initial={{ opacity: 0, x: -20 }}
                      transition={{ delay: 0.3 }}
                    >
                      <label
                        className="text-sm font-semibold flex items-center gap-2 text-slate-700 dark:text-slate-300"
                        htmlFor="filtro-especialidade"
                      >
                        <Star className="w-4 h-4 text-purple-500" />
                        Especialidade
                      </label>
                      <Select
                        classNames={{
                          trigger:
                            "bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 hover:border-purple-400 dark:hover:border-purple-500",
                        }}
                        id="filtro-especialidade"
                        placeholder="Selecione a especialidade"
                        selectedKeys={[selectedEspecialidade]}
                        size="md"
                        variant="bordered"
                        onChange={(e) =>
                          setSelectedEspecialidade(e.target.value)
                        }
                      >
                        {especialidadeOptions.map((option) => (
                          <SelectItem key={option.key} textValue={option.label}>
                            <div className="flex items-center gap-2">
                              <Star className="w-4 h-4" />
                              <span>{option.label}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </Select>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Filtre por área de atuação
                      </p>
                    </motion.div>

                    {/* Filtro por Tipo */}
                    <motion.div
                      animate={{ opacity: 1, x: 0 }}
                      className="space-y-3"
                      initial={{ opacity: 0, x: -20 }}
                      transition={{ delay: 0.4 }}
                    >
                      <label
                        className="text-sm font-semibold flex items-center gap-2 text-slate-700 dark:text-slate-300"
                        htmlFor="filtro-tipo"
                      >
                        <Building2 className="w-4 h-4 text-indigo-500" />
                        Tipo de Advogado
                      </label>
                      <Select
                        classNames={{
                          trigger:
                            "bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 hover:border-indigo-400 dark:hover:border-indigo-500",
                        }}
                        id="filtro-tipo"
                        placeholder="Selecione o tipo"
                        selectedKeys={[selectedTipo]}
                        size="md"
                        variant="bordered"
                        onChange={(e) => setSelectedTipo(e.target.value)}
                      >
                        {tipoOptions.map((option) => (
                          <SelectItem key={option.key} textValue={option.label}>
                            <div className="flex items-center gap-2">
                              {option.key === "all" && (
                                <Users className="w-4 h-4" />
                              )}
                              {option.key === "escritorio" && (
                                <Building2 className="w-4 h-4" />
                              )}
                              {option.key === "externo" && (
                                <User className="w-4 h-4" />
                              )}
                              <span>{option.label}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </Select>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Filtre por tipo de advogado
                      </p>
                    </motion.div>
                  </div>

                  {/* Resumo dos Filtros Ativos */}
                  {hasActiveFilters && (
                    <motion.div
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700"
                      initial={{ opacity: 0, y: 10 }}
                      transition={{ delay: 0.4 }}
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
                        {selectedStatus !== "all" && (
                          <Chip color="success" size="sm" variant="flat">
                            Status:{" "}
                            {
                              statusOptions.find(
                                (opt) => opt.key === selectedStatus,
                              )?.label
                            }
                          </Chip>
                        )}
                        {selectedEspecialidade !== "all" && (
                          <Chip color="secondary" size="sm" variant="flat">
                            Especialidade:{" "}
                            {
                              especialidadeOptions.find(
                                (opt) => opt.key === selectedEspecialidade,
                              )?.label
                            }
                          </Chip>
                        )}
                        {selectedTipo !== "all" && (
                          <Chip color="warning" size="sm" variant="flat">
                            Tipo:{" "}
                            {
                              tipoOptions.find(
                                (opt) => opt.key === selectedTipo,
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

          {/* Filtros Avançados */}
          <AnimatePresence>
            {showAdvancedFilters && (
              <motion.div
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                initial={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3 }}
              >
                <CardBody className="p-6 border-t border-slate-200 dark:border-slate-700">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-lg font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                        <Filter className="h-5 w-5" />
                        Filtros Avançados
                      </h4>
                      <Button
                        color="danger"
                        isDisabled={!hasAdvancedFilters}
                        size="sm"
                        startContent={<X className="h-4 w-4" />}
                        variant="light"
                        onPress={clearAdvancedFilters}
                      >
                        Limpar Filtros
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      {/* Filtro de Comissão Mínima */}
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
                          <DollarSign className="h-4 w-4" />
                          Comissão Mínima (%)
                        </label>
                        <Input
                          max="100"
                          min="0"
                          placeholder="Ex: 5"
                          size="sm"
                          type="number"
                          value={comissaoMin}
                          onChange={(e) => setComissaoMin(e.target.value)}
                        />
                      </div>

                      {/* Filtro de Comissão Máxima */}
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
                          <DollarSign className="h-4 w-4" />
                          Comissão Máxima (%)
                        </label>
                        <Input
                          max="100"
                          min="0"
                          placeholder="Ex: 20"
                          size="sm"
                          type="number"
                          value={comissaoMax}
                          onChange={(e) => setComissaoMax(e.target.value)}
                        />
                      </div>

                      {/* Filtro de período */}
                      <div className="space-y-2 sm:col-span-2 lg:col-span-2">
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          Período de cadastro
                        </label>
                        <DateRangeInput
                          size="sm"
                          startValue={dataInicio}
                          endValue={dataFim}
                          onRangeChange={({ start, end }) => {
                            setDataInicio(start);
                            setDataFim(end);
                          }}
                         />
                      </div>
                    </div>

                    {/* Resumo dos Filtros Ativos */}
                    {hasAdvancedFilters && (
                      <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                        <p className="text-sm text-blue-800 dark:text-blue-200">
                          <strong>Filtros ativos:</strong>{" "}
                          {comissaoMin && `Comissão mín: ${comissaoMin}%`}
                          {comissaoMin && comissaoMax && ", "}
                          {comissaoMax && `Comissão máx: ${comissaoMax}%`}
                          {(comissaoMin || comissaoMax) &&
                            (dataInicio || dataFim) &&
                            ", "}
                          {dataInicio &&
                            `De: ${new Date(dataInicio).toLocaleDateString("pt-BR")}`}
                          {dataInicio && dataFim && " "}
                          {dataFim &&
                            `Até: ${new Date(dataFim).toLocaleDateString("pt-BR")}`}
                        </p>
                      </div>
                    )}
                  </div>
                </CardBody>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>
      </motion.div>

      {/* Relatórios de Performance */}
      <AnimatePresence>
        {showPerformanceReports && (
          <motion.div
            animate={{ opacity: 1, height: "auto" }}
            className="overflow-hidden"
            exit={{ opacity: 0, height: 0 }}
            initial={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Card className="shadow-lg border-2 border-green-200 dark:border-green-700">
              <CardHeader className="border-b border-white/10 bg-background/50">
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-linear-to-br from-green-500 to-green-600 rounded-lg">
                      <BarChart3 className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-green-800 dark:text-green-200">
                        Relatórios de Performance
                      </h3>
                      <p className="text-sm text-green-600 dark:text-green-400">
                        Análise detalhada do desempenho dos advogados
                      </p>
                    </div>
                  </div>
                  <Button
                    color="danger"
                    size="sm"
                    startContent={<X className="h-4 w-4" />}
                    variant="light"
                    onPress={() => setShowPerformanceReports(false)}
                  >
                    Fechar
                  </Button>
                </div>
              </CardHeader>
              <CardBody className="p-6">
                {isLoadingPerformance || isLoadingPerformanceGeral ? (
                  <div className="flex flex-col items-center justify-center py-8">
                    <Spinner size="lg" />
                    <p className="mt-4 text-slate-600 dark:text-slate-400">
                      Carregando relatórios de performance...
                    </p>
                  </div>
                ) : performanceError || performanceGeralError ? (
                  <div className="flex flex-col items-center justify-center py-8">
                    <div className="text-danger text-center">
                      <p className="text-lg font-semibold">
                        Erro ao carregar relatórios
                      </p>
                      <p className="text-sm mt-2">
                        {performanceError?.message ||
                          performanceGeralError?.message ||
                          "Erro desconhecido"}
                      </p>
                    </div>
                    <Button
                      className="mt-4"
                      color="primary"
                      onPress={() => {
                        // Forçar refresh dos dados
                        window.location.reload();
                      }}
                    >
                      Tentar novamente
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Estatísticas Gerais */}
                    {performanceGeral && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <Card className="border border-white/10 bg-background/60">
                          <CardBody className="p-4 text-center">
                            <div className="p-2 bg-blue-500 rounded-full w-fit mx-auto mb-2">
                              <Users className="h-5 w-5 text-white" />
                            </div>
                            <h4 className="text-2xl font-bold text-blue-800 dark:text-blue-200">
                              {performanceGeral.totalAdvogados}
                            </h4>
                            <p className="text-sm text-blue-600 dark:text-blue-400">
                              Total de Advogados
                            </p>
                          </CardBody>
                        </Card>

                        <Card className="border border-white/10 bg-background/60">
                          <CardBody className="p-4 text-center">
                            <div className="p-2 bg-green-500 rounded-full w-fit mx-auto mb-2">
                              <Scale className="h-5 w-5 text-white" />
                            </div>
                            <h4 className="text-2xl font-bold text-green-800 dark:text-green-200">
                              {performanceGeral.totalProcessos}
                            </h4>
                            <p className="text-sm text-green-600 dark:text-green-400">
                              Total de Processos
                            </p>
                          </CardBody>
                        </Card>

                        <Card className="border border-white/10 bg-background/60">
                          <CardBody className="p-4 text-center">
                            <div className="p-2 bg-purple-500 rounded-full w-fit mx-auto mb-2">
                              <TrendingUp className="h-5 w-5 text-white" />
                            </div>
                            <h4 className="text-2xl font-bold text-purple-800 dark:text-purple-200">
                              {performanceGeral.taxaSucessoGeral}%
                            </h4>
                            <p className="text-sm text-purple-600 dark:text-purple-400">
                              Taxa de Sucesso
                            </p>
                          </CardBody>
                        </Card>

                        <Card className="border border-white/10 bg-background/60">
                          <CardBody className="p-4 text-center">
                            <div className="p-2 bg-orange-500 rounded-full w-fit mx-auto mb-2">
                              <DollarSign className="h-5 w-5 text-white" />
                            </div>
                            <h4 className="text-2xl font-bold text-orange-800 dark:text-orange-200">
                              R${" "}
                              {performanceGeral.comissaoTotal.toLocaleString(
                                "pt-BR",
                                { minimumFractionDigits: 2 },
                              )}
                            </h4>
                            <p className="text-sm text-orange-600 dark:text-orange-400">
                              Comissões Totais
                            </p>
                          </CardBody>
                        </Card>
                      </div>
                    )}

                    {/* Top Performers */}
                    {performanceGeral?.topPerformers &&
                      performanceGeral.topPerformers.length > 0 && (
                        <div>
                          <h4 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2">
                            <Crown className="h-5 w-5 text-yellow-500" />
                            Top Performers
                          </h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {performanceGeral.topPerformers.map(
                              (performer, index) => (
                                <Card
                                  key={performer.advogadoId}
                                  className="border border-slate-200 dark:border-slate-700"
                                >
                                  <CardBody className="p-4">
                                    <div className="flex items-center gap-3">
                                      <div
                                        className={`p-2 rounded-full ${index === 0 ? "bg-yellow-500" : index === 1 ? "bg-gray-400" : index === 2 ? "bg-orange-500" : "bg-slate-300"}`}
                                      >
                                        <Crown className="h-4 w-4 text-white" />
                                      </div>
                                      <div className="flex-1">
                                        <h5 className="font-semibold text-slate-800 dark:text-slate-200">
                                          {performer.advogadoNome}
                                        </h5>
                                        <p className="text-sm text-slate-600 dark:text-slate-400">
                                          {performer.totalProcessos} processos •{" "}
                                          {performer.taxaSucesso}% sucesso
                                        </p>
                                      </div>
                                    </div>
                                  </CardBody>
                                </Card>
                              ),
                            )}
                          </div>
                        </div>
                      )}

                    {/* Performance Individual */}
                    {performanceData && performanceData.length > 0 && (
                      <div>
                        <h4 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2">
                          <BarChart3 className="h-5 w-5 text-blue-500" />
                          Performance Individual
                        </h4>
                        <div className="space-y-4">
                          {performanceData.slice(0, 5).map((advogado) => (
                            <Card
                              key={advogado.advogadoId}
                              className="border border-slate-200 dark:border-slate-700"
                            >
                              <CardBody className="p-4">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <Avatar
                                      className="bg-blue-500 text-white"
                                      name={advogado.advogadoNome}
                                    />
                                    <div>
                                      <h5 className="font-semibold text-slate-800 dark:text-slate-200">
                                        {advogado.advogadoNome}
                                      </h5>
                                      <p className="text-sm text-slate-600 dark:text-slate-400">
                                        OAB {advogado.advogadoOAB}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-4 text-sm">
                                    <div className="text-center">
                                      <p className="font-semibold text-slate-800 dark:text-slate-200">
                                        {advogado.totalProcessos}
                                      </p>
                                      <p className="text-slate-600 dark:text-slate-400">
                                        Processos
                                      </p>
                                    </div>
                                    <div className="text-center">
                                      <p className="font-semibold text-green-600 dark:text-green-400">
                                        {advogado.taxaSucesso}%
                                      </p>
                                      <p className="text-slate-600 dark:text-slate-400">
                                        Sucesso
                                      </p>
                                    </div>
                                    <div className="text-center">
                                      <p className="font-semibold text-blue-600 dark:text-blue-400">
                                        R${" "}
                                        {advogado.totalComissoes.toLocaleString(
                                          "pt-BR",
                                          { minimumFractionDigits: 2 },
                                        )}
                                      </p>
                                      <p className="text-slate-600 dark:text-slate-400">
                                        Comissões
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              </CardBody>
                            </Card>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardBody>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dashboard de Comissões */}
      <AnimatePresence>
        {showCommissionsDashboard && (
          <motion.div
            animate={{ opacity: 1, height: "auto" }}
            className="overflow-hidden"
            exit={{ opacity: 0, height: 0 }}
            initial={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Card className="shadow-lg border-2 border-purple-200 dark:border-purple-700">
              <CardHeader className="border-b border-white/10 bg-background/50">
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-linear-to-br from-purple-500 to-purple-600 rounded-lg">
                      <DollarSign className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-purple-800 dark:text-purple-200">
                        Dashboard de Comissões
                      </h3>
                      <p className="text-sm text-purple-600 dark:text-purple-400">
                        Controle e análise de comissões dos advogados
                      </p>
                    </div>
                  </div>
                  <Button
                    color="danger"
                    size="sm"
                    startContent={<X className="h-4 w-4" />}
                    variant="light"
                    onPress={() => setShowCommissionsDashboard(false)}
                  >
                    Fechar
                  </Button>
                </div>
              </CardHeader>
              <CardBody className="p-6">
                {isLoadingComissoes || isLoadingComissoesGeral ? (
                  <div className="flex flex-col items-center justify-center py-8">
                    <Spinner size="lg" />
                    <p className="mt-4 text-slate-600 dark:text-slate-400">
                      Carregando dashboard de comissões...
                    </p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Estatísticas Gerais de Comissões */}
                    {comissoesGeral && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <Card className="border border-white/10 bg-background/60">
                          <CardBody className="p-4 text-center">
                            <div className="p-2 bg-green-500 rounded-full w-fit mx-auto mb-2">
                              <DollarSign className="h-5 w-5 text-white" />
                            </div>
                            <h4 className="text-2xl font-bold text-green-800 dark:text-green-200">
                              R${" "}
                              {comissoesGeral.totalComissoesCalculadas.toLocaleString(
                                "pt-BR",
                                { minimumFractionDigits: 2 },
                              )}
                            </h4>
                            <p className="text-sm text-green-600 dark:text-green-400">
                              Total Calculado
                            </p>
                          </CardBody>
                        </Card>

                        <Card className="border border-white/10 bg-background/60">
                          <CardBody className="p-4 text-center">
                            <div className="p-2 bg-blue-500 rounded-full w-fit mx-auto mb-2">
                              <CheckCircle className="h-5 w-5 text-white" />
                            </div>
                            <h4 className="text-2xl font-bold text-blue-800 dark:text-blue-200">
                              R${" "}
                              {comissoesGeral.totalComissoesPagas.toLocaleString(
                                "pt-BR",
                                { minimumFractionDigits: 2 },
                              )}
                            </h4>
                            <p className="text-sm text-blue-600 dark:text-blue-400">
                              Total Pago
                            </p>
                          </CardBody>
                        </Card>

                        <Card className="border border-white/10 bg-background/60">
                          <CardBody className="p-4 text-center">
                            <div className="p-2 bg-orange-500 rounded-full w-fit mx-auto mb-2">
                              <Clock className="h-5 w-5 text-white" />
                            </div>
                            <h4 className="text-2xl font-bold text-orange-800 dark:text-orange-200">
                              R${" "}
                              {comissoesGeral.totalComissoesPendentes.toLocaleString(
                                "pt-BR",
                                { minimumFractionDigits: 2 },
                              )}
                            </h4>
                            <p className="text-sm text-orange-600 dark:text-orange-400">
                              Pendente
                            </p>
                          </CardBody>
                        </Card>

                        <Card className="border border-white/10 bg-background/60">
                          <CardBody className="p-4 text-center">
                            <div className="p-2 bg-purple-500 rounded-full w-fit mx-auto mb-2">
                              <TrendingUp className="h-5 w-5 text-white" />
                            </div>
                            <h4 className="text-2xl font-bold text-purple-800 dark:text-purple-200">
                              R${" "}
                              {comissoesGeral.comissaoMedia.toLocaleString(
                                "pt-BR",
                                { minimumFractionDigits: 2 },
                              )}
                            </h4>
                            <p className="text-sm text-purple-600 dark:text-purple-400">
                              Média por Advogado
                            </p>
                          </CardBody>
                        </Card>
                      </div>
                    )}

                    {/* Status das Comissões */}
                    {comissoesGeral && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <Card className="border border-white/10 bg-background/60">
                          <CardBody className="p-4 text-center">
                            <div className="p-2 bg-green-500 rounded-full w-fit mx-auto mb-2">
                              <CheckCircle className="h-5 w-5 text-white" />
                            </div>
                            <h4 className="text-2xl font-bold text-green-800 dark:text-green-200">
                              {comissoesGeral.advogadosEmDia}
                            </h4>
                            <p className="text-sm text-green-600 dark:text-green-400">
                              Em Dia
                            </p>
                          </CardBody>
                        </Card>

                        <Card className="border border-white/10 bg-background/60">
                          <CardBody className="p-4 text-center">
                            <div className="p-2 bg-yellow-500 rounded-full w-fit mx-auto mb-2">
                              <Clock className="h-5 w-5 text-white" />
                            </div>
                            <h4 className="text-2xl font-bold text-yellow-800 dark:text-yellow-200">
                              {comissoesGeral.advogadosPendentes}
                            </h4>
                            <p className="text-sm text-yellow-600 dark:text-yellow-400">
                              Pendentes
                            </p>
                          </CardBody>
                        </Card>

                        <Card className="bg-linear-to-br from-red-50 to-red-100 dark:from-red-900/30 dark:to-red-800/20 border-red-300 dark:border-red-600">
                          <CardBody className="p-4 text-center">
                            <div className="p-2 bg-red-500 rounded-full w-fit mx-auto mb-2">
                              <XCircle className="h-5 w-5 text-white" />
                            </div>
                            <h4 className="text-2xl font-bold text-red-800 dark:text-red-200">
                              {comissoesGeral.advogadosAtrasados}
                            </h4>
                            <p className="text-sm text-red-600 dark:text-red-400">
                              Atrasados
                            </p>
                          </CardBody>
                        </Card>
                      </div>
                    )}

                    {/* Próximos Vencimentos */}
                    {comissoesGeral?.proximosVencimentos &&
                      comissoesGeral.proximosVencimentos.length > 0 && (
                        <div>
                          <h4 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2">
                            <Calendar className="h-5 w-5 text-orange-500" />
                            Próximos Vencimentos
                          </h4>
                          <div className="space-y-3">
                            {comissoesGeral.proximosVencimentos.map(
                              (vencimento) => (
                                <Card
                                  key={vencimento.advogadoId}
                                  className="border border-orange-200 dark:border-orange-700 bg-orange-50 dark:bg-orange-900/20"
                                >
                                  <CardBody className="p-4">
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-3">
                                        <Avatar
                                          className="bg-orange-500 text-white"
                                          name={vencimento.advogadoNome}
                                        />
                                        <div>
                                          <h5 className="font-semibold text-slate-800 dark:text-slate-200">
                                            {vencimento.advogadoNome}
                                          </h5>
                                          <p className="text-sm text-slate-600 dark:text-slate-400">
                                            Vence em{" "}
                                            {vencimento.vencimento.toLocaleDateString(
                                              "pt-BR",
                                            )}
                                          </p>
                                        </div>
                                      </div>
                                      <div className="text-right">
                                        <p className="text-lg font-bold text-orange-600 dark:text-orange-400">
                                          R${" "}
                                          {vencimento.valor.toLocaleString(
                                            "pt-BR",
                                            { minimumFractionDigits: 2 },
                                          )}
                                        </p>
                                        <p className="text-sm text-slate-600 dark:text-slate-400">
                                          Comissão
                                        </p>
                                      </div>
                                    </div>
                                  </CardBody>
                                </Card>
                              ),
                            )}
                          </div>
                        </div>
                      )}

                    {/* Comissões por Advogado */}
                    {comissoesData && comissoesData.length > 0 && (
                      <div>
                        <h4 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2">
                          <DollarSign className="h-5 w-5 text-green-500" />
                          Comissões por Advogado
                        </h4>
                        <div className="space-y-4">
                          {comissoesData.slice(0, 5).map((advogado) => (
                            <Card
                              key={advogado.advogadoId}
                              className="border border-slate-200 dark:border-slate-700"
                            >
                              <CardBody className="p-4">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <Avatar
                                      className="bg-green-500 text-white"
                                      name={advogado.advogadoNome}
                                    />
                                    <div>
                                      <h5 className="font-semibold text-slate-800 dark:text-slate-200">
                                        {advogado.advogadoNome}
                                      </h5>
                                      <p className="text-sm text-slate-600 dark:text-slate-400">
                                        OAB {advogado.advogadoOAB}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-6 text-sm">
                                    <div className="text-center">
                                      <p className="font-semibold text-green-600 dark:text-green-400">
                                        R${" "}
                                        {advogado.comissaoCalculada.toLocaleString(
                                          "pt-BR",
                                          { minimumFractionDigits: 2 },
                                        )}
                                      </p>
                                      <p className="text-slate-600 dark:text-slate-400">
                                        Calculada
                                      </p>
                                    </div>
                                    <div className="text-center">
                                      <p className="font-semibold text-blue-600 dark:text-blue-400">
                                        R${" "}
                                        {advogado.comissaoPaga.toLocaleString(
                                          "pt-BR",
                                          { minimumFractionDigits: 2 },
                                        )}
                                      </p>
                                      <p className="text-slate-600 dark:text-slate-400">
                                        Paga
                                      </p>
                                    </div>
                                    <div className="text-center">
                                      <p className="font-semibold text-orange-600 dark:text-orange-400">
                                        R${" "}
                                        {advogado.comissaoPendente.toLocaleString(
                                          "pt-BR",
                                          { minimumFractionDigits: 2 },
                                        )}
                                      </p>
                                      <p className="text-slate-600 dark:text-slate-400">
                                        Pendente
                                      </p>
                                    </div>
                                    <div className="text-center">
                                      <Chip
                                        color={
                                          advogado.statusComissao === "EM_DIA"
                                            ? "success"
                                            : advogado.statusComissao ===
                                                "PENDENTE"
                                              ? "warning"
                                              : "danger"
                                        }
                                        size="sm"
                                        variant="flat"
                                      >
                                        {advogado.statusComissao === "EM_DIA"
                                          ? "Em Dia"
                                          : advogado.statusComissao ===
                                              "PENDENTE"
                                            ? "Pendente"
                                            : "Atrasado"}
                                      </Chip>
                                    </div>
                                  </div>
                                </div>
                              </CardBody>
                            </Card>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardBody>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Controles de Paginação */}
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        initial={{ opacity: 0, y: 20 }}
        transition={{ duration: 0.4, delay: 0.1 }}
      >
        <Card className="shadow-lg border border-slate-200 dark:border-slate-700">
          <CardBody className="p-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4">
                <span className="text-sm text-slate-600 dark:text-slate-400 text-center sm:text-left">
                  Mostrando {startItem} a {endItem} de {totalAdvogadosFiltrados}{" "}
                  advogados
                </span>
                <div className="flex items-center gap-2">
                  <Select
                    className="w-20"
                    selectedKeys={[itemsPerPage.toString()]}
                    size="sm"
                    onSelectionChange={(keys) => {
                      const value = Array.from(keys)[0] as string;

                      setItemsPerPage(parseInt(value));
                      setCurrentPage(1);
                    }}
                  >
                    <SelectItem key="5" textValue="5">5</SelectItem>
                    <SelectItem key="10" textValue="10">10</SelectItem>
                    <SelectItem key="20" textValue="20">20</SelectItem>
                    <SelectItem key="50" textValue="50">50</SelectItem>
                  </Select>
                  <span className="text-sm text-slate-600 dark:text-slate-400">
                    por página
                  </span>
                </div>
              </div>
              {totalPages > 1 && (
                <Pagination
                  showControls
                  showShadow
                  className="flex-shrink-0"
                  page={currentPage}
                  size="sm"
                  total={totalPages}
                  onChange={setCurrentPage}
                />
              )}
            </div>
          </CardBody>
        </Card>
      </motion.div>

      {/* Barra de Ações em Lote */}
      {selectedAdvogados.length > 0 && (
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          initial={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.3 }}
        >
          <Card className="shadow-lg border-2 border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20">
            <CardBody className="p-4">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <CheckSquare className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  <span className="font-medium text-blue-800 dark:text-blue-200 text-center sm:text-left">
                    {selectedAdvogados.length} advogado(s) selecionado(s)
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 justify-center sm:justify-end">
                  <Button
                    color="success"
                    isDisabled={isBulkActionLoading}
                    isLoading={isBulkActionLoading}
                    size="sm"
                    startContent={<CheckCircle2 className="h-4 w-4" />}
                    variant="flat"
                    onPress={handleBulkActivate}
                  >
                    Ativar
                  </Button>
                  <Button
                    color="warning"
                    isDisabled={isBulkActionLoading}
                    isLoading={isBulkActionLoading}
                    size="sm"
                    startContent={<XCircle className="h-4 w-4" />}
                    variant="flat"
                    onPress={handleBulkDeactivate}
                  >
                    Desativar
                  </Button>
                  <Button
                    color="danger"
                    isDisabled={isBulkActionLoading}
                    isLoading={isBulkActionLoading}
                    size="sm"
                    startContent={<Trash2 className="h-4 w-4" />}
                    variant="flat"
                    onPress={handleBulkDelete}
                  >
                    Excluir
                  </Button>
                  <Button
                    size="sm"
                    variant="light"
                    onPress={() => setSelectedAdvogados([])}
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            </CardBody>
          </Card>
        </motion.div>
      )}

      {/* Lista de Advogados Melhorada */}
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
                    Equipe de Advogados
                  </h2>
                  <p className="text-sm text-default-500">
                    {advogadosFiltrados.length} advogado(s) encontrado(s)
                  </p>
                </div>
              </div>
              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
                <Checkbox
                  isIndeterminate={
                    selectedAdvogados.length > 0 &&
                    selectedAdvogados.length < advogadosFiltrados.length
                  }
                  isSelected={
                    selectedAdvogados.length === advogadosFiltrados.length &&
                    advogadosFiltrados.length > 0
                  }
                  size="sm"
                  onValueChange={handleSelectAll}
                >
                  <span className="hidden text-sm text-default-500 sm:inline">
                    Selecionar Todos
                  </span>
                </Checkbox>
                <Badge
                  color="primary"
                  content={advogadosFiltrados.length}
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
            {advogadosFiltrados.length === 0 ? (
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
                  Nenhum advogado encontrado
                </h3>
                <p className="text-slate-500 dark:text-slate-400 mb-6">
                  {hasActiveFilters
                    ? "Tente ajustar os filtros para encontrar advogados"
                    : "Comece adicionando seu primeiro advogado"}
                </p>
                {!hasActiveFilters && (
                  <Button
                    className="bg-linear-to-r from-blue-600 to-indigo-600"
                    color="primary"
                    startContent={<Plus size={20} />}
                    onPress={() => {
                      setFormState({ ...initialFormState });
                      setEnderecos([createEndereco()]);
                      setContasBancarias([createContaBancaria()]);
                      setIsCreateModalOpen(true);
                    }}
                  >
                    Adicionar Primeiro Advogado
                  </Button>
                )}
              </motion.div>
            ) : (
              <div className="grid gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3">
                <AnimatePresence>
                  {advogadosFiltrados.map((advogado, index) => {
	                    const nomeCompleto = getNomeCompleto(advogado);
	                    const nomeResumido = getNomePrimeiroUltimo(advogado);
	                    const oabData = getOABData(advogado);
                    const renderAdvogadoActionsMenu = () => (
                      <DropdownMenu aria-label="Ações do advogado">
                        <DropdownItem
                          key="profile"
                          startContent={<Eye className="h-4 w-4" />}
	                          onPress={() => {
	                            router.push(`/advogados/${advogado.id}`);
	                          }}
                        >
                          Perfil completo
                        </DropdownItem>
                        <DropdownItem
                          key="edit"
                          startContent={<Edit className="h-4 w-4" />}
                          onPress={() => {
                            handleEditAdvogado(advogado);
                          }}
                        >
                          Editar
                        </DropdownItem>
                        <DropdownItem
                          key="history"
                          startContent={<History className="h-4 w-4" />}
                          onPress={() => {
                            handleViewHistorico(advogado);
                          }}
                        >
                          Histórico
                        </DropdownItem>
	                        <DropdownItem
	                          key="notifications"
	                          startContent={<Bell className="h-4 w-4" />}
	                          onPress={() => {
	                            handleViewNotificacoes(advogado);
	                          }}
	                        >
	                          Notificações
	                        </DropdownItem>
	                        {advogado.isExterno ? (
	                          <DropdownItem
	                            key="convert"
	                            className="text-warning"
                            color="warning"
                            startContent={<UserPlus className="h-4 w-4" />}
                            onPress={() => handleConvertToInterno(advogado.id)}
                          >
                            Transformar em Interno
                          </DropdownItem>
                        ) : null}
                        <DropdownItem
                          key="delete"
                          className="text-danger"
                          color="danger"
                          startContent={<Trash2 className="h-4 w-4" />}
                          onPress={() => handleDeleteAdvogado(advogado.id)}
                        >
                          Excluir
                        </DropdownItem>
                      </DropdownMenu>
                    );

                    return (
                      <motion.div
                        key={advogado.id}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        initial={{ opacity: 0, y: 20 }}
                        transition={{ duration: 0.3, delay: index * 0.1 }}
                        whileHover={{ scale: 1.02 }}
                      >
                        <PeopleEntityCard
                          isPressable
                          isSelected={selectedAdvogados.includes(advogado.id)}
                          onPress={() => handleViewAdvogado(advogado)}
                        >
	                          <PeopleEntityCardHeader>
	                            <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
	                              <div className="flex w-full items-center justify-between sm:hidden">
	                                <Checkbox
	                                  className="flex-shrink-0"
	                                  isSelected={selectedAdvogados.includes(
	                                    advogado.id,
	                                  )}
	                                  onClick={(event) => event.stopPropagation()}
	                                  size="sm"
	                                  onValueChange={() =>
	                                    handleSelectAdvogado(advogado.id)
                                  }
                                />
                                <Dropdown>
                                  <DropdownTrigger>
	                                    <Button
	                                      isIconOnly
	                                      className="transition-all hover:scale-110 hover:bg-slate-200 dark:hover:bg-slate-700"
	                                      onClick={(event) =>
	                                        event.stopPropagation()
	                                      }
	                                      size="sm"
	                                      variant="light"
	                                    >
                                      <MoreVertical className="h-4 w-4" />
                                    </Button>
                                  </DropdownTrigger>
                                  {renderAdvogadoActionsMenu()}
                                </Dropdown>
                              </div>

                              <div className="flex w-full flex-col items-center gap-2 sm:w-auto sm:items-start sm:gap-3">
                                <div className="flex items-center justify-center gap-2 sm:hidden">
                                  {advogado.isExterno && (
                                    <Chip
                                      color="warning"
                                      size="sm"
                                      startContent={<Eye className="h-3 w-3" />}
                                      variant="flat"
                                    >
                                      Externo
                                    </Chip>
                                  )}
                                  <Chip
                                    color={getStatusColor(advogado.usuario.active)}
                                    size="sm"
                                    variant="flat"
                                  >
                                    {getStatusText(advogado.usuario.active)}
                                  </Chip>
                                </div>

                                <div className="flex items-center gap-3">
	                                  <Checkbox
	                                    className="hidden flex-shrink-0 sm:flex"
	                                    isSelected={selectedAdvogados.includes(
	                                      advogado.id,
	                                    )}
	                                    onClick={(event) => event.stopPropagation()}
	                                    size="sm"
	                                    onValueChange={() =>
	                                      handleSelectAdvogado(advogado.id)
                                    }
                                  />
                                  <div className="flex flex-col items-center gap-2">
                                    <motion.div
                                      className="group relative flex-shrink-0"
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
                                        name={getInitials(nomeCompleto)}
                                        size="lg"
                                        src={advogado.usuario.avatarUrl || undefined}
                                      />
                                      <div className="absolute inset-0 flex items-center justify-center gap-1 rounded-full bg-black/50 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
	                                      <Button
	                                        isIconOnly
	                                        className="h-6 w-6 min-w-6"
	                                        color="primary"
	                                        isDisabled={isUploadingAvatar}
	                                        onClick={(event) =>
	                                          event.stopPropagation()
	                                        }
	                                        size="sm"
	                                        variant="solid"
	                                        onPress={() => handleEditAvatar(advogado)}
                                      >
                                        <Edit className="h-3 w-3" />
                                      </Button>
                                      {advogado.usuario.avatarUrl && (
	                                        <Button
	                                          isIconOnly
	                                          className="h-6 w-6 min-w-6"
	                                          color="danger"
	                                          isDisabled={isUploadingAvatar}
	                                          onClick={(event) =>
	                                            event.stopPropagation()
	                                          }
	                                          size="sm"
	                                          variant="solid"
	                                          onPress={() =>
                                            handleRemoveAvatar(advogado)
                                          }
                                        >
                                          <Trash2 className="h-3 w-3" />
                                        </Button>
                                      )}
                                      </div>
                                    </motion.div>
                                    {isUploadingAvatar &&
                                    selectedAdvogadoForAvatar?.id === advogado.id ? (
                                      <UploadProgress
                                        className="w-28"
                                        ariaLabel={`Enviando avatar de ${nomeCompleto}`}
                                        label="Enviando avatar"
                                      />
                                    ) : null}
                                  </div>
                                </div>

                                <div className="w-full max-w-[220px] text-center sm:hidden">
                                  <Tooltip content={nomeCompleto} placement="top">
                                    <p className="break-words text-xs font-semibold leading-tight text-slate-700 dark:text-slate-300">
                                      {nomeResumido}
                                    </p>
                                  </Tooltip>
                                  <div className="mt-1 inline-flex max-w-full items-center gap-1 rounded-md bg-blue-100 px-2 py-0.5 dark:bg-blue-900/30">
                                    <ScaleIcon className="h-3 w-3 text-blue-700 dark:text-blue-300" />
                                    <span className="text-[10px] font-semibold text-blue-700 dark:text-blue-300">
                                      {oabData
                                        ? `${oabData.uf} ${oabData.numero}`
                                        : "Sem OAB"}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <div className="hidden min-w-0 flex-1 flex-col sm:flex">
                                <div className="mb-2 flex items-start justify-between gap-2">
                                  <Tooltip content={nomeCompleto} placement="top">
                                    <div className="min-w-0">
                                      <h3 className="break-words text-base font-bold leading-tight text-slate-800 transition-colors group-hover:text-blue-600 dark:text-slate-200 dark:group-hover:text-blue-400 xl:hidden">
                                        {nomeResumido}
                                      </h3>
                                      <h3 className="hidden break-words text-base font-bold leading-tight text-slate-800 transition-colors group-hover:text-blue-600 dark:text-slate-200 dark:group-hover:text-blue-400 xl:block">
                                        {nomeCompleto}
                                      </h3>
                                    </div>
                                  </Tooltip>
                                  <div className="flex shrink-0 flex-col items-end gap-1">
                                    {advogado.isExterno && (
                                      <Chip
                                        color="warning"
                                        size="sm"
                                        startContent={<Eye className="h-3 w-3" />}
                                        variant="flat"
                                      >
                                        Externo
                                      </Chip>
                                    )}
                                    <Chip
                                      color={getStatusColor(advogado.usuario.active)}
                                      size="sm"
                                      variant="flat"
                                    >
                                      {getStatusText(advogado.usuario.active)}
                                    </Chip>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2">
                                  {oabData ? (
                                    <div className="rounded-md bg-blue-100 px-2 py-1 dark:bg-blue-900/30">
                                      <span className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-semibold text-blue-700 dark:text-blue-300">
                                        <ScaleIcon className="h-3 w-3" />
                                        <span>{oabData.uf}</span>
                                        <span className="font-bold tracking-wide">
                                          {oabData.numero}
                                        </span>
                                      </span>
                                    </div>
                                  ) : (
                                    <div className="rounded-md bg-slate-100 px-2 py-1 dark:bg-slate-800/50">
                                      <span className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-medium text-slate-600 dark:text-slate-400">
                                        <ScaleIcon className="h-3 w-3" />
                                        Sem OAB
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div className="hidden sm:block">
                                <Dropdown>
                                  <DropdownTrigger>
	                                    <Button
	                                      isIconOnly
	                                      className="transition-all hover:scale-110 hover:bg-slate-200 dark:hover:bg-slate-700"
	                                      onClick={(event) =>
	                                        event.stopPropagation()
	                                      }
	                                      size="sm"
	                                      variant="light"
	                                    >
                                      <MoreVertical className="h-4 w-4" />
                                    </Button>
                                  </DropdownTrigger>
                                  {renderAdvogadoActionsMenu()}
                                </Dropdown>
                              </div>
	                              </div>
	                          </PeopleEntityCardHeader>
	                          <PeopleEntityCardBody className="space-y-3 p-4">
	                          {/* Informações de Contato */}
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                              <MailIcon className="h-3 w-3 text-blue-500" />
                              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                                {advogado.usuario.email}
                              </span>
                            </div>
                            {advogado.telefone && (
                              <div className="flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                                <Phone className="h-3 w-3 text-green-500" />
                                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                                  {advogado.telefone}
                                </span>
                              </div>
                            )}
                            {advogado.whatsapp && (
                              <div className="flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                                <Smartphone className="h-3 w-3 text-green-500" />
                                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                                  {advogado.whatsapp}
                                </span>
                              </div>
                            )}
                          </div>

                          <Divider className="my-3" />

                          {/* Processos e Especialidades */}
                          <div className="space-y-3">
                            {/* Contagem de Processos - Para todos os advogados */}
                            <div className="space-y-2">
                              <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
                                {advogado.isExterno
                                  ? "Processos Identificados"
                                  : "Processos Responsável"}
                              </p>
                              <div className="flex items-center gap-2">
                                <Chip
                                  color={
                                    advogado.isExterno ? "warning" : "primary"
                                  }
                                  size="sm"
                                  startContent={
                                    <FileText className="h-3 w-3" />
                                  }
                                  variant="flat"
                                >
                                  {advogado.processosCount || 0} processo(s)
                                </Chip>
                                {advogado.isExterno && (
                                  <span className="text-xs text-slate-500 dark:text-slate-400">
                                    Advogado externo identificado
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Especialidades - Para advogados internos */}
                            {!advogado.isExterno &&
                              advogado.especialidades.length > 0 && (
                                <div className="space-y-2">
                                  <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
                                    Especialidades
                                  </p>
                                  <div className="flex flex-wrap gap-1">
                                    {advogado.especialidades
                                      .slice(0, 2)
                                      .map((especialidade) => (
                                        <Chip
                                          key={especialidade}
                                          className="text-xs"
                                          color="secondary"
                                          size="sm"
                                          variant="flat"
                                        >
                                          {especialidadeOptions.find(
                                            (opt) => opt.key === especialidade,
                                          )?.label || especialidade}
                                        </Chip>
                                      ))}
                                    {advogado.especialidades.length > 2 && (
                                      <Chip
                                        className="text-xs"
                                        color="default"
                                        size="sm"
                                        variant="flat"
                                      >
                                        +{advogado.especialidades.length - 2}
                                      </Chip>
                                    )}
                                  </div>
                                </div>
                              )}
                          </div>

                          {/* Ações */}
                          <div className="flex flex-col sm:flex-row gap-2 mt-3">
	                            <Button
	                              className="flex-1 hover:scale-105 transition-transform"
	                              color="primary"
	                              size="sm"
	                              startContent={<Eye className="h-4 w-4" />}
	                              variant="flat"
	                              onPress={() =>
	                                router.push(`/advogados/${advogado.id}`)
	                              }
	                            >
	                              <span className="hidden sm:inline">
	                                Perfil completo
	                              </span>
	                              <span className="sm:hidden">Perfil</span>
	                            </Button>
	                            <Button
	                              className="flex-1 sm:flex-none hover:scale-105 transition-transform"
	                              color="secondary"
	                              onClick={(event) => event.stopPropagation()}
	                              size="sm"
	                              startContent={<Edit className="h-4 w-4" />}
	                              variant="flat"
                              onPress={() => handleEditAdvogado(advogado)}
                            >
	                              Editar
	                            </Button>
	                          </div>
	                          </PeopleEntityCardBody>
	                        </PeopleEntityCard>
	                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </CardBody>
        </Card>
      </motion.div>

      <AdvogadoFormModal
        bancos={bancos}
        contasBancarias={contasBancarias}
        description="Complete as informações do advogado"
        enderecos={enderecos}
        especialidades={especialidadeOptions}
        formState={formState}
        isOpen={isCreateModalOpen}
        isSaving={isSaving}
        mode="create"
        primaryActionLabel="Criar Advogado"
        setContasBancarias={setContasBancarias}
        setEnderecos={setEnderecos}
        setFormState={setFormState}
        tiposChavePix={tiposChavePix}
        tiposConta={tiposConta}
        tiposContaBancaria={tiposContaBancaria}
        title="Novo Advogado"
        onOpenChange={setIsCreateModalOpen}
        onSubmit={handleCreateAdvogado}
      />

      <AdvogadoFormModal
        bancos={bancos}
        contasBancarias={contasBancarias}
        description="Atualize as informações do advogado"
        enderecos={enderecos}
        especialidades={especialidadeOptions}
        formState={formState}
        isOpen={isEditModalOpen}
        isSaving={isSaving}
        mode="edit"
        primaryActionLabel="Salvar Alterações"
        setContasBancarias={setContasBancarias}
        setEnderecos={setEnderecos}
        setFormState={setFormState}
        tiposChavePix={tiposChavePix}
        tiposConta={tiposConta}
        tiposContaBancaria={tiposContaBancaria}
        title="Editar Advogado"
        onOpenChange={setIsEditModalOpen}
        onSubmit={handleUpdateAdvogado}
      />

      {/* Modal de Visualização do Advogado */}
      <Modal
        isOpen={isViewModalOpen}
        size="3xl"
        onOpenChange={setIsViewModalOpen}
      >
        <ModalContent>
          <ModalHeader>Detalhes do Advogado</ModalHeader>
          <ModalBody>
            {selectedAdvogado && (
              <div className="space-y-6">
                {/* Header do Advogado */}
                <div className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <Avatar
                    showFallback
                    className="bg-blue-500 text-white shadow-lg"
                    name={getInitials(getNomeCompleto(selectedAdvogado))}
                    size="lg"
                    src={selectedAdvogado.usuario.avatarUrl || undefined}
                  />
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-slate-800 dark:text-slate-200">
                      {getNomeCompleto(selectedAdvogado)}
                    </h3>
                    <div className="flex items-center gap-2 mt-1">
                      <Chip
                        color={getStatusColor(selectedAdvogado.usuario.active)}
                        size="sm"
                        variant="flat"
                      >
                        {getStatusText(selectedAdvogado.usuario.active)}
                      </Chip>
                      <Chip
                        color="primary"
                        size="sm"
                        startContent={<ScaleIcon className="h-3 w-3" />}
                        variant="flat"
                      >
                        {getOAB(selectedAdvogado)}
                      </Chip>
                      {selectedAdvogado.isExterno && (
                        <Chip
                          color="warning"
                          size="sm"
                          startContent={<Eye className="h-3 w-3" />}
                          variant="flat"
                        >
                          Advogado Externo Identificado
                        </Chip>
                      )}
                    </div>
                  </div>
                </div>

                {/* Informações de Contato */}
                <div className="space-y-4">
                  <h4 className="text-lg font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                    <Phone className="h-5 w-5" />
                    Informações de Contato
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                      <MailIcon className="h-4 w-4 text-blue-500" />
                      <div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Email
                        </p>
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                          {selectedAdvogado.usuario.email}
                        </p>
                      </div>
                    </div>
                    {selectedAdvogado.telefone && (
                      <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                        <Phone className="h-4 w-4 text-green-500" />
                        <div>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Telefone
                          </p>
                          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                            {selectedAdvogado.telefone}
                          </p>
                        </div>
                      </div>
                    )}
                    {selectedAdvogado.whatsapp && (
                      <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                        <Smartphone className="h-4 w-4 text-green-500" />
                        <div>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            WhatsApp
                          </p>
                          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                            {selectedAdvogado.whatsapp}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Dados cadastrais e acesso */}
                <div className="space-y-4">
                  <h4 className="text-lg font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    Cadastro e acesso
                  </h4>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
                      <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                        CPF
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
                        {selectedAdvogado.usuario.cpf || "Não informado"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
                      <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                        RG
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
                        {selectedAdvogado.usuario.rg || "Não informado"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
                      <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                        Nascimento
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
                        {formatDatePtBr(selectedAdvogado.usuario.dataNascimento)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
                      <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                        Perfil
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
                        {selectedAdvogado.usuario.role}
                      </p>
                    </div>
                  </div>
                  {selectedAdvogado.usuario.observacoes ? (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
                      <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                        Observações internas
                      </p>
                      <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
                        {selectedAdvogado.usuario.observacoes}
                      </p>
                    </div>
                  ) : null}
                </div>

                {/* Canais digitais */}
                {[
                  selectedAdvogado.website,
                  selectedAdvogado.linkedin,
                  selectedAdvogado.twitter,
                  selectedAdvogado.instagram,
                ].some(Boolean) ? (
                  <div className="space-y-4">
                    <h4 className="text-lg font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                      <Activity className="h-5 w-5" />
                      Canais digitais
                    </h4>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      {[
                        { label: "Website", value: selectedAdvogado.website },
                        { label: "LinkedIn", value: selectedAdvogado.linkedin },
                        { label: "Twitter/X", value: selectedAdvogado.twitter },
                        {
                          label: "Instagram",
                          value: selectedAdvogado.instagram,
                        },
                      ]
                        .filter((item) => item.value)
                        .map((item) => (
                          <a
                            key={item.label}
                            className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm text-primary transition-colors hover:bg-primary/10"
                            href={item.value as string}
                            rel="noopener noreferrer"
                            target="_blank"
                          >
                            <p className="text-[11px] uppercase tracking-[0.14em] text-primary/70">
                              {item.label}
                            </p>
                            <p className="mt-1 truncate font-medium">
                              {item.value}
                            </p>
                          </a>
                        ))}
                    </div>
                  </div>
                ) : null}

                {/* Especialidades ou Informações de Processos */}
                {selectedAdvogado.isExterno ? (
                  <div className="space-y-4">
                    <h4 className="text-lg font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      Processos Identificados
                    </h4>
                    <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-700">
                      <div className="flex items-center gap-2 mb-2">
                        <Info className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                        <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                          Este advogado foi identificado em{" "}
                          {selectedAdvogado.processosCount || 0} processo(s) do
                          seu escritório
                        </p>
                      </div>
                      <p className="text-xs text-amber-700 dark:text-amber-300">
                        Ele não faz parte da equipe do escritório, mas aparece
                        como advogado de outras partes nos processos.
                      </p>
                    </div>
                  </div>
                ) : (
                  selectedAdvogado.especialidades.length > 0 && (
                    <div className="space-y-4">
                      <h4 className="text-lg font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                        <Star className="h-5 w-5" />
                        Especialidades
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {selectedAdvogado.especialidades.map(
                          (especialidade) => (
                            <Chip
                              key={especialidade}
                              color="secondary"
                              startContent={<Star className="h-3 w-3" />}
                              variant="flat"
                            >
                              {especialidadeOptions.find(
                                (opt) => opt.key === especialidade,
                              )?.label || especialidade}
                            </Chip>
                          ),
                        )}
                      </div>
                    </div>
                  )
                )}

                {/* Comissões - Apenas para advogados do escritório */}
                {!selectedAdvogado.isExterno && (
                  <div className="space-y-4">
                    <h4 className="text-lg font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                      <DollarSign className="h-5 w-5" />
                      Comissões
                    </h4>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
                        <div className="flex items-center gap-2">
                          <Percent className="h-5 w-5 text-blue-500" />
                          <div>
                            <p className="text-xs text-blue-600 dark:text-blue-400">
                              Padrão
                            </p>
                            <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                              {selectedAdvogado.comissaoPadrao}%
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-700">
                        <div className="flex items-center gap-2">
                          <Percent className="h-5 w-5 text-green-500" />
                          <div>
                            <p className="text-xs text-green-600 dark:text-green-400">
                              Ação Ganha
                            </p>
                            <p className="text-2xl font-bold text-green-700 dark:text-green-300">
                              {selectedAdvogado.comissaoAcaoGanha}%
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-700">
                        <div className="flex items-center gap-2">
                          <Percent className="h-5 w-5 text-purple-500" />
                          <div>
                            <p className="text-xs text-purple-600 dark:text-purple-400">
                              Honorários
                            </p>
                            <p className="text-2xl font-bold text-purple-700 dark:text-purple-300">
                              {selectedAdvogado.comissaoHonorarios}%
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Configurações operacionais */}
                {!selectedAdvogado.isExterno && (
                  <div className="space-y-4">
                    <h4 className="text-lg font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                      <Key className="h-5 w-5" />
                      Configurações operacionais
                    </h4>
                    <div className="space-y-3">
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                          Notificações
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <Chip
                            color={
                              selectedAdvogado.notificarEmail
                                ? "success"
                                : "default"
                            }
                            size="sm"
                            variant="flat"
                          >
                            E-mail{" "}
                            {selectedAdvogado.notificarEmail
                              ? "ativado"
                              : "desativado"}
                          </Chip>
                          <Chip
                            color={
                              selectedAdvogado.notificarWhatsapp
                                ? "success"
                                : "default"
                            }
                            size="sm"
                            variant="flat"
                          >
                            WhatsApp{" "}
                            {selectedAdvogado.notificarWhatsapp
                              ? "ativado"
                              : "desativado"}
                          </Chip>
                          <Chip
                            color={
                              selectedAdvogado.notificarSistema
                                ? "success"
                                : "default"
                            }
                            size="sm"
                            variant="flat"
                          >
                            Sistema{" "}
                            {selectedAdvogado.notificarSistema
                              ? "ativado"
                              : "desativado"}
                          </Chip>
                        </div>
                      </div>
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                          Permissões de operação
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {[
                            {
                              label: "Criar processos",
                              allowed: selectedAdvogado.podeCriarProcessos,
                            },
                            {
                              label: "Editar processos",
                              allowed: selectedAdvogado.podeEditarProcessos,
                            },
                            {
                              label: "Excluir processos",
                              allowed: selectedAdvogado.podeExcluirProcessos,
                            },
                            {
                              label: "Gerenciar clientes",
                              allowed: selectedAdvogado.podeGerenciarClientes,
                            },
                            {
                              label: "Acessar financeiro",
                              allowed: selectedAdvogado.podeAcessarFinanceiro,
                            },
                          ].map((permission) => (
                            <Chip
                              key={permission.label}
                              color={permission.allowed ? "primary" : "default"}
                              size="sm"
                              variant={permission.allowed ? "flat" : "bordered"}
                            >
                              {permission.label}
                            </Chip>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Estatísticas Detalhadas */}
                <div className="space-y-4">
                  <h4 className="text-lg font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                    <Activity className="h-5 w-5" />
                    Estatísticas
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="rounded-lg border border-white/10 bg-background/50 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="p-2 bg-blue-500 rounded-lg">
                          <ScaleIcon className="h-4 w-4 text-white" />
                        </div>
                        <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                          Processos
                        </span>
                      </div>
                      <p className="text-2xl font-bold text-blue-800 dark:text-blue-200">
                        {selectedAdvogado.processosCount || 0}
                      </p>
                      <p className="text-xs text-blue-600 dark:text-blue-400">
                        Vinculados
                      </p>
                    </div>

                    <div className="rounded-lg border border-white/10 bg-background/50 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="p-2 bg-green-500 rounded-lg">
                          <Percent className="h-4 w-4 text-white" />
                        </div>
                        <span className="text-sm font-medium text-green-700 dark:text-green-300">
                          Comissão
                        </span>
                      </div>
                      <p className="text-2xl font-bold text-green-800 dark:text-green-200">
                        {selectedAdvogado.comissaoPadrao}%
                      </p>
                      <p className="text-xs text-green-600 dark:text-green-400">
                        Padrão
                      </p>
                    </div>

                    <div className="rounded-lg border border-white/10 bg-background/50 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="p-2 bg-purple-500 rounded-lg">
                          <Star className="h-4 w-4 text-white" />
                        </div>
                        <span className="text-sm font-medium text-purple-700 dark:text-purple-300">
                          Especialidades
                        </span>
                      </div>
                      <p className="text-2xl font-bold text-purple-800 dark:text-purple-200">
                        {selectedAdvogado.especialidades.length}
                      </p>
                      <p className="text-xs text-purple-600 dark:text-purple-400">
                        Áreas
                      </p>
                    </div>

                    <div className="rounded-lg border border-white/10 bg-background/50 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="p-2 bg-orange-500 rounded-lg">
                          <Clock className="h-4 w-4 text-white" />
                        </div>
                        <span className="text-sm font-medium text-orange-700 dark:text-orange-300">
                          Status
                        </span>
                      </div>
                      <p className="text-lg font-bold text-orange-800 dark:text-orange-200">
                        {selectedAdvogado.usuario.active ? "Ativo" : "Inativo"}
                      </p>
                      <p className="text-xs text-orange-600 dark:text-orange-400">
                        {selectedAdvogado.isExterno ? "Externo" : "Interno"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Perfil profissional */}
                {[
                  selectedAdvogado.formacao,
                  selectedAdvogado.experiencia,
                  selectedAdvogado.premios,
                  selectedAdvogado.publicacoes,
                  selectedAdvogado.bio,
                ].some(Boolean) ? (
                  <div className="space-y-4">
                    <h4 className="text-lg font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      Perfil profissional
                    </h4>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      {selectedAdvogado.formacao ? (
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
                          <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                            Formação
                          </p>
                          <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
                            {selectedAdvogado.formacao}
                          </p>
                        </div>
                      ) : null}
                      {selectedAdvogado.experiencia ? (
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
                          <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                            Experiência
                          </p>
                          <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
                            {selectedAdvogado.experiencia}
                          </p>
                        </div>
                      ) : null}
                      {selectedAdvogado.premios ? (
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
                          <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                            Prêmios
                          </p>
                          <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
                            {selectedAdvogado.premios}
                          </p>
                        </div>
                      ) : null}
                      {selectedAdvogado.publicacoes ? (
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
                          <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                            Publicações
                          </p>
                          <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
                            {selectedAdvogado.publicacoes}
                          </p>
                        </div>
                      ) : null}
                    </div>
                    {selectedAdvogado.bio ? (
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
                        <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                          Biografia
                        </p>
                        <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
                          {selectedAdvogado.bio}
                        </p>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {/* Ações */}
                <div className="flex gap-2 pt-4 border-t border-slate-200 dark:border-slate-700">
                  {selectedAdvogado.isExterno ? (
                    <div className="w-full space-y-3">
                      <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                        <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300 mb-2">
                          <Eye className="h-5 w-5" />
                          <span className="font-medium">Advogado Externo</span>
                        </div>
                        <p className="text-sm text-amber-600 dark:text-amber-400">
                          Este advogado foi identificado automaticamente através
                          dos processos.
                        </p>
                      </div>
                      <Button
                        className="w-full"
                        color="primary"
                        startContent={<Eye className="h-4 w-4" />}
                        variant="flat"
                        onPress={() => {
                          setIsViewModalOpen(false);
                          router.push(`/advogados/${selectedAdvogado.id}`);
                        }}
                      >
                        Abrir perfil completo
                      </Button>
                      <Button
                        className="w-full"
                        color="warning"
                        startContent={<UserPlus className="h-4 w-4" />}
                        variant="flat"
                        onPress={() => {
                          setIsViewModalOpen(false);
                          handleConvertToInterno(selectedAdvogado.id);
                        }}
                      >
                        Transformar em Advogado Interno
                      </Button>
                    </div>
                  ) : (
                    <>
                      <Button
                        className="flex-1"
                        color="primary"
                        startContent={<Eye className="h-4 w-4" />}
                        variant="flat"
                        onPress={() => {
                          setIsViewModalOpen(false);
                          router.push(`/advogados/${selectedAdvogado.id}`);
                        }}
                      >
                        Perfil completo
                      </Button>
                      <Button
                        className="flex-1"
                        color="secondary"
                        startContent={<Edit className="h-4 w-4" />}
                        variant="flat"
                        onPress={() => {
                          setIsViewModalOpen(false);
                          handleEditAdvogado(selectedAdvogado);
                        }}
                      >
                        Editar Advogado
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )}
          </ModalBody>
        </ModalContent>
      </Modal>

      {/* Modal de Histórico */}
      {selectedAdvogado && (
        <AdvogadoHistorico
          advogadoId={selectedAdvogado.id}
          advogadoNome={getNomeCompleto(selectedAdvogado)}
          isOpen={isHistoricoModalOpen}
          onClose={() => setIsHistoricoModalOpen(false)}
        />
      )}

      {/* Modal de Notificações */}
      {selectedAdvogado && (
        <AdvogadoNotificacoes
          advogadoId={selectedAdvogado.id}
          advogadoNome={getNomeCompleto(selectedAdvogado)}
          isOpen={isNotificacoesModalOpen}
          onClose={() => setIsNotificacoesModalOpen(false)}
        />
      )}

      {/* Modal de Primeiro Acesso */}
      <Modal
        isOpen={isCredenciaisModalOpen}
        size="lg"
        onOpenChange={setIsCredenciaisModalOpen}
      >
        <ModalContent>
          <ModalHeader className="flex items-center gap-2">
            <Key className="h-5 w-5 text-success" />
            Primeiro acesso configurado
          </ModalHeader>
          <ModalBody>
            {credenciaisTemporarias && (
              <div className="space-y-4">
                <div className="p-4 bg-success-50 dark:bg-success-900/20 rounded-lg border border-success-200 dark:border-success-800">
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle className="h-5 w-5 text-success" />
                    <h4 className="font-semibold text-success-700 dark:text-success-300">
                      Acesso ao Sistema Criado com Sucesso!
                    </h4>
                  </div>
                  <p className="text-sm text-success-600 dark:text-success-400 mb-4">
                    O advogado deverá definir a senha no primeiro acesso:
                  </p>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-white dark:bg-slate-800 rounded-lg border">
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-default-500" />
                        <span className="text-sm font-medium">Email:</span>
                      </div>
                      <code className="text-sm bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded">
                        {credenciaisTemporarias.email}
                      </code>
                    </div>

                    <div className="flex items-center justify-between p-3 bg-white dark:bg-slate-800 rounded-lg border">
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-default-500" />
                        <span className="text-sm font-medium">Email mascarado:</span>
                      </div>
                      <code className="text-sm bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded font-mono">
                        {credenciaisTemporarias.maskedEmail}
                      </code>
                    </div>
                  </div>

                  {credenciaisTemporarias.primeiroAcessoEnviado ? (
                    <div className="mt-4 p-3 bg-primary-50 dark:bg-primary-900/20 rounded-lg border border-primary-200 dark:border-primary-800">
                      <p className="text-sm text-primary-700 dark:text-primary-300">
                        ✅ Link de primeiro acesso enviado para {credenciaisTemporarias.maskedEmail}.
                      </p>
                    </div>
                  ) : !credenciaisTemporarias.envioSolicitado ? (
                    <div className="mt-4 p-3 bg-default-100/70 dark:bg-default-50/10 rounded-lg border border-default-200 dark:border-default-700">
                      <p className="text-sm text-default-600 dark:text-default-300">
                        Envio automático desativado. O advogado pode solicitar
                        o link de primeiro acesso na tela de login.
                      </p>
                    </div>
                  ) : (
                    <div className="mt-4 p-3 bg-warning-50 dark:bg-warning-900/20 rounded-lg border border-warning-200 dark:border-warning-800">
                      <div className="flex items-start gap-2">
                        <Info className="h-4 w-4 text-warning-600 dark:text-warning-400 mt-0.5" />
                        <p className="text-sm text-warning-700 dark:text-warning-300">
                          Advogado criado, mas o e-mail de primeiro acesso não foi enviado automaticamente.
                          {credenciaisTemporarias.erroEnvio
                            ? ` Motivo: ${credenciaisTemporarias.erroEnvio}`
                            : ""}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <Button
              color="primary"
              onPress={() => {
                setIsCredenciaisModalOpen(false);
                setCredenciaisTemporarias(null);
              }}
            >
              Entendi
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Modal de Edição de Avatar */}
      <ImageEditorModal
        currentImageUrl={selectedAdvogadoForAvatar?.usuario.avatarUrl || null}
        isOpen={isAvatarEditorOpen}
        onClose={() => {
          setIsAvatarEditorOpen(false);
          setSelectedAdvogadoForAvatar(null);
        }}
        onSave={handleSaveAvatar}
      />
      <BulkExcelImportModal
        entityLabel="advogados"
        isOpen={isImportModalOpen}
        sampleFields={advogadoImportFields}
        templateUrl="/api/templates/import-advogados"
        onOpenChange={setIsImportModalOpen}
      />
    </div>
  );
}
