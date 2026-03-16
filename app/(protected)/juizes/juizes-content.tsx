"use client";

import type {
  JuizFilters,
  JuizSerializado,
  JuizFormData,
  JuizCatalogoOpcao,
} from "@/app/actions/juizes";

import { useMemo, useState } from "react";
import NextLink from "next/link";
import { Card, CardBody, CardHeader, CardFooter } from "@heroui/card";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Chip } from "@heroui/chip";
import {
  Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, } from "@heroui/dropdown";

import { Divider } from "@heroui/divider";
import { Avatar } from "@heroui/avatar";
import { Textarea } from "@heroui/input";
import { Checkbox } from "@heroui/checkbox";
import {
  Plus,
  Search,
  MoreVertical,
  Edit,
  Trash2,
  Eye,
  Star,
  MapPin,
  Scale,
  Gavel,
  User,
  Award,
  Briefcase,
  Calendar,
  Filter,
  Sparkles,
  AlertCircle,
  Download,
  Layers,
  Copy,
  Check,
} from "lucide-react";
import { Spinner } from "@heroui/spinner";
import { toast } from "@/lib/toast";

import { exportJuizToPDF } from "./export-juiz-pdf";

import { Modal } from "@/components/ui/modal";

// import { Textarea } from "@heroui/textarea";
import { useUserPermissions } from "@/app/hooks/use-user-permissions";
import { PermissionGuard } from "@/components/permission-guard";
import { CpfInput } from "@/components/cpf-input";
import {
  useJuizes,
  useJuizFormData,
  useJuizesCatalogoPorNome,
  useProcessosParaVinculoAutoridade,
} from "@/app/hooks/use-juizes";
import {
  deleteJuizTenant,
  createJuizTenant,
  updateJuizTenant,
  vincularAutoridadeAProcessos,
  desvincularAutoridadeDeProcessos,
} from "@/app/actions/juizes";
import {
  EspecialidadeJuridica,
  JuizStatus,
  JuizNivel,
  JuizTipoAutoridade,
} from "@/generated/prisma";
import { JuizFotoUpload } from "@/app/(protected)/juizes/juiz-foto-upload";
import {
  PeopleEntityCard,
  PeopleEntityCardBody,
  PeopleEntityCardHeader,
  PeopleMetricCard,
  PeoplePageHeader,
} from "@/components/people-ui";
import { Select, SelectItem } from "@heroui/react";
import { DateInput } from "@/components/ui/date-input";

export function JuizesContent() {
  const { permissions } = useUserPermissions();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [selectedTipoAutoridade, setSelectedTipoAutoridade] =
    useState<string>("all");
  const [selectedEspecialidade, setSelectedEspecialidade] =
    useState<string>("all");
  const [selectedNivel, setSelectedNivel] = useState<string>("all");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedJuiz, setSelectedJuiz] = useState<JuizSerializado | null>(
    null,
  );
  const [isSaving, setIsSaving] = useState(false);

  const formatDateInput = (value?: Date | string | null) => {
    if (!value) return "";
    const date = value instanceof Date ? value : new Date(value);

    if (Number.isNaN(date.getTime())) return "";

    return date.toISOString().split("T")[0] ?? "";
  };

  const parseDateInput = (value: string) => {
    if (!value) return undefined;
    const parsedDate = new Date(`${value}T12:00:00`);

    if (Number.isNaN(parsedDate.getTime())) return undefined;

    return parsedDate;
  };

  // Estados do formulário - tipado com JuizFormData
  const initialFormState: JuizFormData = {
    tipoAutoridade: "JUIZ" as JuizTipoAutoridade,
    nome: "",
    nomeCompleto: "",
    cpf: "",
    oab: "",
    email: "",
    telefone: "",
    endereco: "",
    cep: "",
    vara: "",
    comarca: "",
    cidade: "",
    estado: "",
    dataNascimento: undefined,
    dataPosse: undefined,
    dataAposentadoria: undefined,
    status: "ATIVO" as JuizStatus,
    nivel: "JUIZ_TITULAR" as JuizNivel,
    especialidades: [] as EspecialidadeJuridica[],
    biografia: "",
    formacao: "",
    experiencia: "",
    premios: "",
    publicacoes: "",
    website: "",
    linkedin: "",
    twitter: "",
    instagram: "",
    observacoes: "",
    tribunalId: "",
    foto: "",
  };

  const [formState, setFormState] = useState<JuizFormData>(initialFormState);
  const [selectedCatalogJudge, setSelectedCatalogJudge] =
    useState<JuizCatalogoOpcao | null>(null);

  // Buscar dados do formulário
  const { formData, isLoading: isLoadingFormData } = useJuizFormData();
  const shouldSearchCatalog = isCreateModalOpen && !isEditModalOpen;
  const { opcoes: catalogoJuizes, isLoading: isLoadingCatalogoJuizes } =
    useJuizesCatalogoPorNome(formState.nome || "", shouldSearchCatalog);

  // Construir filtros
  const filters: JuizFilters = {
    search: searchTerm || undefined,
    status:
      selectedStatus !== "all" ? (selectedStatus as JuizStatus) : undefined,
    tipoAutoridade:
      selectedTipoAutoridade !== "all"
        ? (selectedTipoAutoridade as JuizTipoAutoridade)
        : undefined,
    especialidades:
      selectedEspecialidade !== "all"
        ? [selectedEspecialidade as EspecialidadeJuridica]
        : undefined,
    nivel: selectedNivel !== "all" ? (selectedNivel as JuizNivel) : undefined,
  };

  // Buscar juízes com filtros
  const { juizes, isLoading, error, mutate } = useJuizes(filters);
  const [isLinkProcessosModalOpen, setIsLinkProcessosModalOpen] =
    useState(false);
  const [isConfirmLinkActionModalOpen, setIsConfirmLinkActionModalOpen] =
    useState(false);
  const [pendingLinkAction, setPendingLinkAction] = useState<
    "vincular" | "desvincular" | null
  >(null);
  const [processoSearchTerm, setProcessoSearchTerm] = useState("");
  const [selectedProcessoIds, setSelectedProcessoIds] = useState<string[]>([]);
  const [isLinkingProcessos, setIsLinkingProcessos] = useState(false);
  const selectedJuizIdForLink =
    isLinkProcessosModalOpen && selectedJuiz?.id ? selectedJuiz.id : null;
  const {
    processos: processosParaVinculo,
    isLoading: isLoadingProcessosParaVinculo,
    mutate: mutateProcessosParaVinculo,
  } = useProcessosParaVinculoAutoridade(
    selectedJuizIdForLink,
    isLinkProcessosModalOpen,
  );

  const especialidadesOptions =
    formData?.especialidades?.map((esp) => ({
      key: esp,
      label: esp
        .replace(/_/g, " ")
        .toLowerCase()
        .replace(/\b\w/g, (l) => l.toUpperCase()),
    })) || [];

  const statusOptions = [
    { key: "all", label: "Todos" },
    ...(formData?.status?.map((status) => ({
      key: status,
      label:
        status === "ATIVO"
          ? "Ativo"
          : status === "INATIVO"
            ? "Inativo"
            : status === "APOSENTADO"
              ? "Aposentado"
              : status === "SUSPENSO"
                ? "Suspenso"
                : status,
    })) || []),
  ];

  const tipoAutoridadeOptions = [
    { key: "all", label: "Todos" },
    ...(formData?.tiposAutoridade?.map((tipo) => ({
      key: tipo,
      label: tipo === "PROMOTOR" ? "Promotor" : "Juiz",
    })) || []),
  ];

  const nivelOptions = [
    { key: "all", label: "Todos" },
    ...(formData?.niveis?.map((nivel) => ({
      key: nivel,
      label: nivel
        .replace(/_/g, " ")
        .toLowerCase()
        .replace(/\b\w/g, (l) => l.toUpperCase()),
    })) || []),
  ];

  const tribunalIds = useMemo(
    () => new Set((formData?.tribunais || []).map((tribunal) => tribunal.id)),
    [formData?.tribunais],
  );

  const resumo = useMemo(() => {
    const total = juizes.length;
    const ativos = juizes.filter((juiz) => juiz.status === "ATIVO").length;
    const premium = juizes.filter((juiz) => juiz.isPremium).length;
    const promotores = juizes.filter(
      (juiz) => juiz.tipoAutoridade === "PROMOTOR",
    ).length;

    return { total, ativos, premium, promotores };
  }, [juizes]);

  const errorMessage =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Não foi possível carregar os juízes.";

  const getStatusColor = (status: JuizStatus) => {
    switch (status) {
      case JuizStatus.ATIVO:
        return "success";
      case JuizStatus.INATIVO:
        return "default";
      case JuizStatus.APOSENTADO:
        return "warning";
      case JuizStatus.SUSPENSO:
        return "danger";
      default:
        return "default";
    }
  };

  const getNivelColor = (nivel: JuizNivel) => {
    switch (nivel) {
      case JuizNivel.MINISTRO:
        return "danger";
      case JuizNivel.DESEMBARGADOR:
        return "primary";
      case JuizNivel.JUIZ_TITULAR:
        return "secondary";
      case JuizNivel.JUIZ_SUBSTITUTO:
        return "default";
      default:
        return "default";
    }
  };

  const processosFiltradosParaVinculo = useMemo(() => {
    const query = processoSearchTerm.trim().toLowerCase();

    if (!query) return processosParaVinculo;

    return processosParaVinculo.filter((processo) => {
      const haystack = [
        processo.numero,
        processo.titulo || "",
        processo.clienteNome,
        processo.advogadoResponsavelNome || "",
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [processosParaVinculo, processoSearchTerm]);

  const selectedProcessoIdsSet = useMemo(
    () => new Set(selectedProcessoIds),
    [selectedProcessoIds],
  );

  const processosFiltradosIds = useMemo(
    () => processosFiltradosParaVinculo.map((processo) => processo.id),
    [processosFiltradosParaVinculo],
  );

  const allFilteredSelected =
    processosFiltradosIds.length > 0 &&
    processosFiltradosIds.every((id) => selectedProcessoIdsSet.has(id));

  const selectedLinkedCount = useMemo(() => {
    if (!selectedJuiz) return 0;

    return processosParaVinculo.filter(
      (processo) =>
        selectedProcessoIdsSet.has(processo.id) &&
        processo.juizId === selectedJuiz.id,
    ).length;
  }, [processosParaVinculo, selectedProcessoIdsSet, selectedJuiz]);

  const selectedNotLinkedCount = selectedProcessoIds.length - selectedLinkedCount;

  const handleToggleProcessoSelecionado = (
    processoId: string,
    isChecked: boolean,
  ) => {
    setSelectedProcessoIds((prev) => {
      if (isChecked) {
        if (prev.includes(processoId)) return prev;

        return [...prev, processoId];
      }

      return prev.filter((id) => id !== processoId);
    });
  };

  const handleToggleSelecionarTodosFiltrados = (isChecked: boolean) => {
    setSelectedProcessoIds((prev) => {
      if (isChecked) {
        return Array.from(new Set([...prev, ...processosFiltradosIds]));
      }

      const removeSet = new Set(processosFiltradosIds);

      return prev.filter((id) => !removeSet.has(id));
    });
  };

  const handleOpenLinkProcessosModal = (juiz: JuizSerializado) => {
    setSelectedJuiz(juiz);
    setProcessoSearchTerm("");
    setSelectedProcessoIds([]);
    setPendingLinkAction(null);
    setIsConfirmLinkActionModalOpen(false);
    setIsLinkProcessosModalOpen(true);
  };

  const handleCloseLinkProcessosModal = () => {
    setIsLinkProcessosModalOpen(false);
    setIsConfirmLinkActionModalOpen(false);
    setPendingLinkAction(null);
    setSelectedProcessoIds([]);
    setProcessoSearchTerm("");
  };

  const handleRequestBatchActionConfirmation = (
    action: "vincular" | "desvincular",
  ) => {
    if (!selectedJuiz) {
      toast.error("Selecione uma autoridade para vincular");

      return;
    }

    if (selectedProcessoIds.length === 0) {
      toast.error("Selecione ao menos um processo");

      return;
    }

    if (action === "desvincular" && selectedLinkedCount === 0) {
      toast.error("Nenhum processo selecionado está vinculado a esta autoridade");

      return;
    }

    if (action === "vincular" && selectedNotLinkedCount === 0) {
      toast.info("Todos os processos selecionados já estão vinculados");

      return;
    }

    setPendingLinkAction(action);
    setIsConfirmLinkActionModalOpen(true);
  };

  const handleConfirmBatchAction = async () => {
    if (!selectedJuiz || !pendingLinkAction) {
      toast.error("Ação inválida para os processos selecionados");

      return;
    }

    setIsLinkingProcessos(true);
    try {
      if (pendingLinkAction === "vincular") {
        const result = await vincularAutoridadeAProcessos({
          juizId: selectedJuiz.id,
          processoIds: selectedProcessoIds,
        });

        if (!result.success) {
          toast.error(result.error || "Não foi possível vincular processos");

          return;
        }

        const vinculados = result.vinculados || 0;
        const ignorados = result.ignorados || 0;
        const detalhesIgnorados =
          ignorados > 0 ? ` (${ignorados} fora do escopo)` : "";

        toast.success(
          `${vinculados} processo(s) vinculado(s) com sucesso${detalhesIgnorados}.`,
        );
      } else {
        const result = await desvincularAutoridadeDeProcessos({
          juizId: selectedJuiz.id,
          processoIds: selectedProcessoIds,
        });

        if (!result.success) {
          toast.error(result.error || "Não foi possível desvincular processos");

          return;
        }

        const desvinculados = result.desvinculados || 0;
        const ignorados = result.ignorados || 0;
        const detalhesIgnorados =
          ignorados > 0 ? ` (${ignorados} fora do escopo ou não vinculados)` : "";

        toast.success(
          `${desvinculados} processo(s) desvinculado(s) com sucesso${detalhesIgnorados}.`,
        );
      }
      handleCloseLinkProcessosModal();
      mutateProcessosParaVinculo();
      mutate();
    } catch (error) {
      toast.error("Erro ao aplicar ação em massa");
    } finally {
      setIsLinkingProcessos(false);
    }
  };

  const handleDeleteJuiz = async (juizId: string) => {
    if (!confirm("Tem certeza que deseja excluir este juiz?")) return;

    try {
      const result = await deleteJuizTenant(juizId);

      if (result.success) {
        toast.success("Juiz excluído com sucesso!");
        mutate(); // Revalidar dados
      } else {
        toast.error(result.error || "Erro ao excluir juiz");
      }
    } catch (error) {
      toast.error("Erro ao excluir juiz");
    }
  };

  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [copiedOab, setCopiedOab] = useState(false);

  const handleViewJuiz = (juiz: JuizSerializado) => {
    setSelectedJuiz(juiz);
    setIsViewModalOpen(true);
    setCopiedOab(false); // Reset ao abrir modal
  };

  const handleCopyOab = async (oab: string) => {
    try {
      await navigator.clipboard.writeText(oab);
      setCopiedOab(true);
      toast.success("OAB copiada para a área de transferência!");

      // Voltar ao ícone de Copy após 2 segundos
      setTimeout(() => {
        setCopiedOab(false);
      }, 2000);
    } catch (error) {
      toast.error("Erro ao copiar OAB");
    }
  };

  const handleDownloadPDF = async (juiz: JuizSerializado) => {
    try {
      toast.info("Gerando PDF profissional...");
      await exportJuizToPDF(juiz);
      toast.success("PDF gerado com sucesso!");
    } catch (error) {
      toast.error("Erro ao gerar PDF. Verifique o console para detalhes.");
    }
  };

  const handleEditJuiz = (juiz: JuizSerializado) => {
    setSelectedJuiz(juiz);
    setSelectedCatalogJudge(null);

    // DEBUG removido para produção

    // Popula o formulário com os dados do juiz
    const newFormState: JuizFormData = {
      tipoAutoridade: juiz.tipoAutoridade || "JUIZ",
      nome: juiz.nome || "",
      nomeCompleto: juiz.nomeCompleto || "",
      cpf: juiz.cpf || "",
      oab: juiz.oab || "",
      email: juiz.email || "",
      telefone: juiz.telefone || "",
      endereco: juiz.endereco || "",
      cep: juiz.cep || "",
      vara: juiz.vara || "",
      comarca: juiz.comarca || "",
      cidade: juiz.cidade || "",
      estado: juiz.estado || "",
      dataNascimento: juiz.dataNascimento || undefined,
      dataPosse: juiz.dataPosse || undefined,
      dataAposentadoria: juiz.dataAposentadoria || undefined,
      status: juiz.status || "ATIVO",
      nivel: juiz.nivel || "JUIZ_TITULAR",
      especialidades: juiz.especialidades || [],
      biografia: juiz.biografia || "",
      formacao: juiz.formacao || "",
      experiencia: juiz.experiencia || "",
      premios: juiz.premios || "",
      publicacoes: juiz.publicacoes || "",
      website: juiz.website || "",
      linkedin: juiz.linkedin || "",
      twitter: juiz.twitter || "",
      instagram: juiz.instagram || "",
      observacoes: juiz.observacoes || "",
      tribunalId: juiz.tribunalId || "",
      foto: juiz.foto || "",
    };

    // DEBUG removido para produção

    setFormState(newFormState);
    setIsEditModalOpen(true);
  };

  const resetForm = () => {
    setFormState(initialFormState);
    setSelectedCatalogJudge(null);
  };

  const handleSaveJuiz = async () => {
    if (!formState.nome || !formState.vara) {
      toast.error(
        `Preencha os campos obrigatórios: Nome e ${
          formState.tipoAutoridade === "PROMOTOR" ? "Promotoria" : "Vara"
        }`,
      );

      return;
    }

    setIsSaving(true);
    try {
      const juizData: JuizFormData = {
        tipoAutoridade: formState.tipoAutoridade,
        nome: formState.nome,
        nomeCompleto: formState.nomeCompleto || undefined,
        cpf: formState.cpf || undefined,
        oab: formState.oab || undefined,
        email: formState.email || undefined,
        telefone: formState.telefone || undefined,
        endereco: formState.endereco || undefined,
        cep: formState.cep || undefined,
        vara: formState.vara,
        comarca: formState.comarca || undefined,
        cidade: formState.cidade || undefined,
        estado: formState.estado || undefined,
        dataNascimento: formState.dataNascimento || undefined,
        dataPosse: formState.dataPosse || undefined,
        dataAposentadoria: formState.dataAposentadoria || undefined,
        status: formState.status,
        nivel: formState.nivel,
        especialidades: formState.especialidades,
        biografia: formState.biografia || undefined,
        formacao: formState.formacao || undefined,
        experiencia: formState.experiencia || undefined,
        premios: formState.premios || undefined,
        publicacoes: formState.publicacoes || undefined,
        website: formState.website || undefined,
        linkedin: formState.linkedin || undefined,
        twitter: formState.twitter || undefined,
        instagram: formState.instagram || undefined,
        observacoes: formState.observacoes || undefined,
        tribunalId: formState.tribunalId || undefined,
        foto: formState.foto || undefined,
      };

      // DEBUG removido para produção

      let result;

      if (isEditModalOpen && selectedJuiz) {
        // Editar juiz existente - Multi-tenant com auditoria
        result = await updateJuizTenant(selectedJuiz.id, juizData);
        if (result.success) {
          toast.success("Juiz atualizado com sucesso!");
        } else {
          toast.error(result.error || "Erro ao atualizar juiz");
          setIsSaving(false);

          return;
        }
      } else {
        // Criar novo juiz - Multi-tenant com auditoria
        result = await createJuizTenant({
          ...juizData,
          juizBaseId: selectedCatalogJudge?.id,
        });
        if (result.success) {
          toast.success("Juiz criado com sucesso!");
        } else {
          toast.error(result.error || "Erro ao criar juiz");
          setIsSaving(false);

          return;
        }
      }

      // Fechar modal e limpar formulário
      setIsCreateModalOpen(false);
      setIsEditModalOpen(false);
      setSelectedJuiz(null);
      resetForm();

      // Revalidar dados
      mutate();
    } catch (error) {
      toast.error("Erro ao salvar juiz");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoadingFormData) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
        <span className="ml-2">Carregando dados...</span>
      </div>
    );
  }

  return (
    <PermissionGuard permission="canViewJudgesDatabase">
      <section className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 py-8 px-3 sm:px-6">
        <PeoplePageHeader
          description={`Base de dados com ${resumo.total} ${
            resumo.total === 1 ? "autoridade" : "autoridades"
          } (juízes e promotores) para apoio estratégico dos processos.`}
          tag="Gestao de pessoas"
          title="Base de Juizes e Promotores"
          actions={
            <div className="flex flex-wrap gap-2">
              <Button
                as={NextLink}
                href="/juizes/pacotes"
                radius="full"
                size="sm"
                variant="bordered"
              >
                Loja premium
              </Button>
              {permissions.canCreateJudgeProfiles ? (
                <Button
                  color="primary"
                  size="sm"
                  startContent={<Plus className="h-4 w-4" />}
                  onPress={() => {
                    resetForm();
                    setIsCreateModalOpen(true);
                  }}
                >
                  Nova Autoridade
                </Button>
              ) : null}
            </div>
          }
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <PeopleMetricCard
            helper="Base cadastrada"
            icon={<Scale className="h-4 w-4" />}
            label="Total de autoridades"
            tone="primary"
            value={resumo.total}
          />
          <PeopleMetricCard
            helper={`${resumo.total > 0 ? Math.round((resumo.ativos / resumo.total) * 100) : 0}% ativos`}
            icon={<Check className="h-4 w-4" />}
            label="Autoridades ativas"
            tone="success"
            value={resumo.ativos}
          />
          <PeopleMetricCard
            helper="Disponiveis para pacote"
            icon={<Star className="h-4 w-4" />}
            label="Perfis premium"
            tone="warning"
            value={resumo.premium}
          />
          <PeopleMetricCard
            helper="Vínculos do Ministério Público"
            icon={<Sparkles className="h-4 w-4" />}
            label="Promotores"
            tone="secondary"
            value={resumo.promotores}
          />
        </div>

        <Card className="border border-white/10 bg-background/70 backdrop-blur-xl">
          <CardHeader className="flex flex-col items-start gap-2 pb-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Filtros rápidos</h2>
              <p className="text-sm text-default-400">
                Encontre por nome, tipo de autoridade, status, especialidade e nível.
              </p>
            </div>
            {(searchTerm ||
              selectedStatus !== "all" ||
              selectedTipoAutoridade !== "all" ||
              selectedEspecialidade !== "all" ||
              selectedNivel !== "all") && (
              <Button
                size="sm"
                startContent={<Filter className="h-4 w-4" />}
                variant="flat"
                onPress={() => {
                  setSearchTerm("");
                  setSelectedStatus("all");
                  setSelectedTipoAutoridade("all");
                  setSelectedEspecialidade("all");
                  setSelectedNivel("all");
                }}
              >
                Limpar filtros
              </Button>
            )}
          </CardHeader>
          <Divider className="border-white/10" />
          <CardBody className="space-y-4">
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
              <Input
                className="lg:col-span-2"
                id="juiz-search"
                placeholder="Buscar por nome, vara ou comarca"
                startContent={<Search className="h-4 w-4 text-default-400" />}
                value={searchTerm}
                onValueChange={setSearchTerm}
              />

              <Select
                items={tipoAutoridadeOptions}
                label="Tipo"
                placeholder="Todos"
                selectedKeys={[selectedTipoAutoridade]}
                onSelectionChange={(keys) =>
                  setSelectedTipoAutoridade(Array.from(keys)[0] as string)
                }
              >
                {(tipo) => (
                  <SelectItem key={tipo.key} textValue={tipo.label}>
                    {tipo.label}
                  </SelectItem>
                )}
              </Select>

              <Select
                items={statusOptions}
                label="Status"
                placeholder="Todos"
                selectedKeys={[selectedStatus]}
                onSelectionChange={(keys) =>
                  setSelectedStatus(Array.from(keys)[0] as string)
                }
              >
                {(status) => (
                  <SelectItem key={status.key} textValue={status.label}>
                    {status.label}
                  </SelectItem>
                )}
              </Select>

              <Select
                items={nivelOptions}
                label="Nível"
                placeholder="Todos"
                selectedKeys={[selectedNivel]}
                onSelectionChange={(keys) =>
                  setSelectedNivel(Array.from(keys)[0] as string)
                }
              >
                {(nivel) => (
                  <SelectItem key={nivel.key} textValue={nivel.label}>
                    {nivel.label}
                  </SelectItem>
                )}
              </Select>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Select
                items={[
                  { key: "all", label: "Todas as especialidades" },
                  ...especialidadesOptions,
                ]}
                label="Especialidade"
                placeholder="Todas"
                selectedKeys={[selectedEspecialidade]}
                onSelectionChange={(keys) =>
                  setSelectedEspecialidade(Array.from(keys)[0] as string)
                }
              >
                {(esp) => (
                  <SelectItem key={esp.key} textValue={esp.label}>
                    {esp.label}
                  </SelectItem>
                )}
              </Select>

              <Card className="border border-white/10 bg-background/50">
                <CardBody className="flex h-full items-center justify-center py-3">
                  <p className="text-sm text-default-400">
                    {juizes.length}{" "}
                    {juizes.length === 1
                      ? "autoridade encontrada"
                      : "autoridades encontradas"}
                  </p>
                </CardBody>
              </Card>
            </div>
          </CardBody>
        </Card>

        {/* Loading State */}
        {isLoading && (
          <Card className="border border-white/10 bg-background/60 backdrop-blur-xl">
            <CardBody className="flex flex-col items-center justify-center py-16">
              <Spinner
                classNames={{
                  circle1: "border-b-primary",
                  circle2: "border-b-secondary",
                }}
                color="primary"
                size="lg"
              />
              <p className="mt-4 text-lg text-default-400">
                Carregando juízes...
              </p>
            </CardBody>
          </Card>
        )}

        {/* Error State */}
        {error && (
          <Card className="border border-danger/50 bg-linear-to-br from-danger/10 to-danger/5 backdrop-blur-xl">
            <CardBody className="text-center py-12">
              <div className="flex items-center justify-center mb-4">
                <div className="bg-danger/20 p-4 rounded-full">
                  <AlertCircle className="w-10 h-10 text-danger" />
                </div>
              </div>
              <h3 className="text-xl font-bold text-danger mb-2">
                Erro ao carregar juízes
              </h3>
              <p className="text-default-400 mb-6">{errorMessage}</p>
              <Button
                className="font-semibold"
                color="primary"
                size="lg"
                onPress={() => mutate()}
              >
                Tentar Novamente
              </Button>
            </CardBody>
          </Card>
        )}

        {/* Lista de Juízes com design aprimorado */}
        {!isLoading && !error && juizes && (
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {juizes.map((juiz) => {
              const processosCount = juiz._count?.processos ?? 0;
              const julgamentosCount = juiz._count?.julgamentos ?? 0;

              return (
                <PeopleEntityCard
                  key={juiz.id}
                  className="h-full"
                  isPressable
                  onPress={() => handleViewJuiz(juiz)}
                >
                  <PeopleEntityCardHeader className="flex flex-col gap-3 pb-3">
                    <div className="flex items-start justify-between w-full">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <Avatar
                          classNames={{
                            base: "bg-linear-to-br from-primary to-secondary",
                            icon: "text-white",
                          }}
                          icon={
                            !juiz.foto ? (
                              juiz.tipoAutoridade === "PROMOTOR" ? (
                                <Gavel className="w-5 h-5" />
                              ) : (
                                <Scale className="w-5 h-5" />
                              )
                            ) : undefined
                          }
                          size="md"
                          src={juiz.foto || undefined}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="text-lg font-bold text-white truncate">
                              {juiz.nome}
                            </h3>
                            {juiz.isPremium && (
                              <Sparkles className="w-4 h-4 text-warning" />
                            )}
                          </div>
                          <p className="text-sm text-default-400 truncate">
                            {juiz.nomeCompleto}
                          </p>
                          {juiz.oab && (
                            <p className="text-xs text-default-500 mt-1">
                              OAB: {juiz.oab}
                            </p>
                          )}
                        </div>
                      </div>
                      <Dropdown>
                        <DropdownTrigger>
                          <Button
                            isIconOnly
                            className="hover:bg-primary/10"
                            size="sm"
                            variant="light"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownTrigger>
                        <DropdownMenu variant="flat">
                          <DropdownItem
                            key="view"
                            className="text-primary"
                            startContent={<Eye className="w-4 h-4" />}
                            onPress={() => handleViewJuiz(juiz)}
                          >
                            Ver Detalhes
                          </DropdownItem>
                          {permissions.canEditJudgeProfiles ? (
                            <DropdownItem
                              key="edit"
                              startContent={<Edit className="w-4 h-4" />}
                              onPress={() => handleEditJuiz(juiz)}
                            >
                              Editar
                            </DropdownItem>
                          ) : null}
                          {permissions.canDeleteJudgeProfiles ? (
                            <DropdownItem
                              key="delete"
                              className="text-danger"
                              color="danger"
                              startContent={<Trash2 className="w-4 h-4" />}
                              onPress={() => handleDeleteJuiz(juiz.id)}
                            >
                              Excluir
                            </DropdownItem>
                          ) : null}
                        </DropdownMenu>
                      </Dropdown>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <Chip
                        classNames={{
                          base: "font-semibold",
                        }}
                        color={juiz.tipoAutoridade === "PROMOTOR" ? "warning" : "primary"}
                        size="sm"
                        variant="flat"
                      >
                        {juiz.tipoAutoridade === "PROMOTOR" ? "Promotor" : "Juiz"}
                      </Chip>
                      <Chip
                        classNames={{
                          base: "font-semibold",
                        }}
                        color={getStatusColor(juiz.status)}
                        size="sm"
                        variant="flat"
                      >
                        {juiz.status}
                      </Chip>
                      <Chip
                        classNames={{
                          base: "font-semibold",
                        }}
                        color={getNivelColor(juiz.nivel)}
                        size="sm"
                        startContent={<Award className="w-3 h-3" />}
                        variant="flat"
                      >
                        {juiz.nivel.replace(/_/g, " ")}
                      </Chip>
                      {juiz.isPremium && (
                        <Chip
                          classNames={{
                            base: "font-semibold",
                          }}
                          color="warning"
                          size="sm"
                          startContent={<Star className="w-3 h-3" />}
                          variant="flat"
                        >
                          Premium
                        </Chip>
                      )}
                      {juiz.isPublico && (
                        <Chip
                          classNames={{
                            base: "font-semibold",
                          }}
                          color="success"
                          size="sm"
                          variant="flat"
                        >
                          Público
                        </Chip>
                      )}
                    </div>
                  </PeopleEntityCardHeader>
                  <Divider />
                  <PeopleEntityCardBody className="pt-4 gap-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-lg border border-primary/15 bg-primary/5 px-2.5 py-2">
                        <p className="text-[11px] uppercase tracking-wide text-primary/80">
                          Processos
                        </p>
                        <p className="text-base font-semibold text-white">
                          {processosCount}
                        </p>
                      </div>
                      <div className="rounded-lg border border-secondary/15 bg-secondary/5 px-2.5 py-2">
                        <p className="text-[11px] uppercase tracking-wide text-secondary/80">
                          Julgamentos
                        </p>
                        <p className="text-base font-semibold text-white">
                          {julgamentosCount}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 text-sm">
                      <Briefcase className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                      <span className="text-default-300 line-clamp-2">
                        {juiz.vara} - {juiz.comarca}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <MapPin className="w-4 h-4 text-secondary flex-shrink-0" />
                      <span className="text-default-400 truncate">
                        {juiz.cidade}, {juiz.estado}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {juiz.especialidades
                        ?.slice(0, 3)
                        .map((esp: EspecialidadeJuridica) => (
                          <Chip
                            key={esp}
                            classNames={{
                              base: "border-primary/20",
                            }}
                            color="primary"
                            size="sm"
                            variant="dot"
                          >
                            {esp.replace(/_/g, " ")}
                          </Chip>
                        ))}
                      {juiz.especialidades && juiz.especialidades.length > 3 && (
                        <Chip color="default" size="sm" variant="flat">
                          +{juiz.especialidades.length - 3}
                        </Chip>
                      )}
                    </div>
                  </PeopleEntityCardBody>
                  {juiz.biografia && (
                    <>
                      <Divider />
                      <CardFooter>
                        <p className="text-sm text-default-500 line-clamp-2 leading-relaxed">
                          {juiz.biografia}
                        </p>
                      </CardFooter>
                    </>
                  )}
                </PeopleEntityCard>
              );
            })}
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !error && juizes && juizes.length === 0 && (
          <Card className="border border-white/10 bg-background/70 backdrop-blur-xl">
            <CardBody className="text-center py-14">
              <div className="mb-4 flex items-center justify-center">
                <div className="rounded-full border border-primary/30 bg-primary/10 p-4">
                  <Scale className="h-8 w-8 text-primary" />
                </div>
              </div>
              <h3 className="mb-2 text-xl font-semibold text-white">
                Nenhuma autoridade encontrada
              </h3>
              <p className="mx-auto mb-6 max-w-md text-sm text-default-400">
                {searchTerm ||
                selectedStatus !== "all" ||
                selectedTipoAutoridade !== "all" ||
                selectedEspecialidade !== "all" ||
                selectedNivel !== "all"
                  ? "Tente ajustar os filtros de busca para encontrar outros juízes."
                  : "Comece adicionando juízes e promotores à base de dados para começar a gerenciar suas informações."}
              </p>
              {permissions.canCreateJudgeProfiles && (
                <Button
                  className="font-semibold"
                  color="primary"
                  size="lg"
                  startContent={<Plus className="w-5 h-5" />}
                  onPress={() => {
                    resetForm();
                    setIsCreateModalOpen(true);
                  }}
                >
                  Adicionar Primeira Autoridade
                </Button>
              )}
            </CardBody>
          </Card>
        )}

        {/* Modal de Visualização de Detalhes */}
        <Modal
          backdrop="blur"
          footerContent={
            <div className="flex gap-2 w-full">
              {permissions.canEditJudgeProfiles && (
                <Button
                  color="primary"
                  startContent={<Layers className="w-4 h-4" />}
                  variant="flat"
                  onPress={() => {
                    if (selectedJuiz) {
                      handleOpenLinkProcessosModal(selectedJuiz);
                    }
                  }}
                >
                  Vincular Processos
                </Button>
              )}
              <Button
                color="secondary"
                startContent={<Download className="w-4 h-4" />}
                variant="flat"
                onPress={() => {
                  if (selectedJuiz) {
                    handleDownloadPDF(selectedJuiz);
                  }
                }}
              >
                Baixar PDF
              </Button>
              {permissions.canEditJudgeProfiles && (
                <Button
                  color="primary"
                  startContent={<Edit className="w-4 h-4" />}
                  variant="flat"
                  onPress={() => {
                    setIsViewModalOpen(false);
                    // Chamar handleEditJuiz para popular o formulário com os dados
                    if (selectedJuiz) {
                      handleEditJuiz(selectedJuiz);
                    }
                  }}
                >
                  Editar
                </Button>
              )}
              <Button
                className="ml-auto"
                variant="light"
                onPress={() => {
                  setIsViewModalOpen(false);
                  setSelectedJuiz(null);
                }}
              >
                Fechar
              </Button>
            </div>
          }
          isOpen={isViewModalOpen}
          showFooter={true}
          size="2xl"
          title="Detalhes da Autoridade"
          onClose={() => {
            setIsViewModalOpen(false);
            setSelectedJuiz(null);
          }}
        >
          {selectedJuiz && (
            <div className="space-y-6">
              {/* Header com Avatar */}
              <div className="flex items-start gap-4 p-6 rounded-xl bg-linear-to-br from-primary/10 to-secondary/5 border border-primary/20">
                <Avatar
                  classNames={{
                    base: "bg-linear-to-br from-primary to-secondary w-24 h-24 text-large",
                    icon: "text-white",
                  }}
                  icon={
                    !selectedJuiz.foto ? (
                      selectedJuiz.tipoAutoridade === "PROMOTOR" ? (
                        <Gavel className="w-10 h-10" />
                      ) : (
                        <Scale className="w-10 h-10" />
                      )
                    ) : undefined
                  }
                  src={selectedJuiz.foto || undefined}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-2xl font-bold text-white">
                      {selectedJuiz.nome}
                    </h3>
                    {selectedJuiz.isPremium && (
                      <Star className="w-5 h-5 text-warning" />
                    )}
                  </div>
                  <p className="text-default-400 mb-1">
                    {selectedJuiz.nomeCompleto}
                  </p>
                  {selectedJuiz.oab && (
                    <p className="text-sm text-default-500">
                      OAB: {selectedJuiz.oab}
                    </p>
                  )}
                  <div className="flex gap-2 flex-wrap">
                    <Chip
                      color={
                        selectedJuiz.tipoAutoridade === "PROMOTOR"
                          ? "warning"
                          : "primary"
                      }
                      size="sm"
                      variant="flat"
                    >
                      {selectedJuiz.tipoAutoridade === "PROMOTOR"
                        ? "Promotor"
                        : "Juiz"}
                    </Chip>
                    <Chip
                      color={getStatusColor(selectedJuiz.status)}
                      size="sm"
                      variant="flat"
                    >
                      {selectedJuiz.status}
                    </Chip>
                    <Chip
                      color={getNivelColor(selectedJuiz.nivel)}
                      size="sm"
                      startContent={<Award className="w-3 h-3" />}
                      variant="flat"
                    >
                      {selectedJuiz.nivel.replace(/_/g, " ")}
                    </Chip>
                    {selectedJuiz.isPremium && (
                      <Chip color="warning" size="sm" variant="flat">
                        Premium
                      </Chip>
                    )}
                    {selectedJuiz.isPublico && (
                      <Chip color="success" size="sm" variant="flat">
                        Público
                      </Chip>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Card className="border border-primary/20 bg-primary/5">
                  <CardBody className="gap-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary/80">
                      Processos vinculados
                    </p>
                    <p className="text-2xl font-bold text-white">
                      {selectedJuiz._count?.processos ?? 0}
                    </p>
                  </CardBody>
                </Card>
                <Card className="border border-secondary/20 bg-secondary/5">
                  <CardBody className="gap-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-secondary/80">
                      Julgamentos
                    </p>
                    <p className="text-2xl font-bold text-white">
                      {selectedJuiz._count?.julgamentos ?? 0}
                    </p>
                  </CardBody>
                </Card>
                <Card className="border border-warning/20 bg-warning/5">
                  <CardBody className="gap-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-warning-700 dark:text-warning-300">
                      Análises
                    </p>
                    <p className="text-2xl font-bold text-white">
                      {selectedJuiz._count?.analises ?? 0}
                    </p>
                  </CardBody>
                </Card>
                <Card className="border border-success/20 bg-success/5">
                  <CardBody className="gap-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-success-700 dark:text-success-300">
                      Favoritos
                    </p>
                    <p className="text-2xl font-bold text-white">
                      {selectedJuiz._count?.favoritos ?? 0}
                    </p>
                  </CardBody>
                </Card>
              </div>

              {/* Informações Principais */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <Card className="border border-white/10">
                  <CardBody className="gap-2">
                    <p className="text-sm text-default-400 font-semibold flex items-center gap-2">
                      <Scale className="w-4 h-4 text-primary" />
                      {selectedJuiz.tipoAutoridade === "PROMOTOR"
                        ? "Promotoria"
                        : "Vara"}
                    </p>
                    <p className="text-white">
                      {selectedJuiz.vara || "Não informado"}
                    </p>
                  </CardBody>
                </Card>
                <Card className="border border-white/10">
                  <CardBody className="gap-2">
                    <p className="text-sm text-default-400 font-semibold">
                      Comarca
                    </p>
                    <p className="text-white">
                      {selectedJuiz.comarca || "Não informado"}
                    </p>
                  </CardBody>
                </Card>
                <Card className="border border-white/10">
                  <CardBody className="gap-2">
                    <p className="text-sm text-default-400 font-semibold flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-secondary" />
                      Localização
                    </p>
                    <p className="text-white">
                      {selectedJuiz.cidade}, {selectedJuiz.estado}
                    </p>
                  </CardBody>
                </Card>
                <Card className="border border-white/10">
                  <CardBody className="gap-2">
                    <p className="text-sm text-default-400 font-semibold">
                      CPF
                    </p>
                    <p className="text-white font-mono text-sm">
                      {selectedJuiz.cpf || "Não informado"}
                    </p>
                  </CardBody>
                </Card>
                <Card className="border border-primary/20 bg-primary/5">
                  <CardBody className="gap-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-default-400 font-semibold">
                        {selectedJuiz.tipoAutoridade === "PROMOTOR"
                          ? "Registro funcional"
                          : "OAB"}
                      </p>
                      {selectedJuiz.oab &&
                      selectedJuiz.tipoAutoridade !== "PROMOTOR" ? (
                        <Button
                          isIconOnly
                          className="transition-all duration-300"
                          color={copiedOab ? "success" : "primary"}
                          size="sm"
                          variant="flat"
                          onPress={() => handleCopyOab(selectedJuiz.oab!)}
                        >
                          {copiedOab ? (
                            <Check className="w-4 h-4" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </Button>
                      ) : null}
                    </div>
                    <p className="text-primary font-bold text-lg">
                      {selectedJuiz.oab || "Não informado"}
                    </p>
                  </CardBody>
                </Card>
                <Card className="border border-white/10">
                  <CardBody className="gap-2">
                    <p className="text-sm text-default-400 font-semibold">
                      E-mail
                    </p>
                    <p className="text-white text-sm truncate">
                      {selectedJuiz.email || "Não informado"}
                    </p>
                  </CardBody>
                </Card>
                <Card className="border border-white/10">
                  <CardBody className="gap-2">
                    <p className="text-sm text-default-400 font-semibold">
                      Telefone
                    </p>
                    <p className="text-white">
                      {selectedJuiz.telefone || "Não informado"}
                    </p>
                  </CardBody>
                </Card>
                {selectedJuiz.endereco && (
                  <Card className="border border-white/10 md:col-span-2">
                    <CardBody className="gap-2">
                      <p className="text-sm text-default-400 font-semibold">
                        Endereço Completo
                      </p>
                      <p className="text-white">{selectedJuiz.endereco}</p>
                      {selectedJuiz.cep && (
                        <p className="text-sm text-default-500">
                          CEP: {selectedJuiz.cep}
                        </p>
                      )}
                    </CardBody>
                  </Card>
                )}
              </div>

              {/* Datas Importantes */}
              {(selectedJuiz.dataNascimento ||
                selectedJuiz.dataPosse ||
                selectedJuiz.dataAposentadoria) && (
                <div>
                  <h4 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-primary" />
                    Datas Importantes
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {selectedJuiz.dataNascimento && (
                      <Card className="border border-white/10">
                        <CardBody className="gap-2">
                          <p className="text-sm text-default-400 font-semibold">
                            Data de Nascimento
                          </p>
                          <p className="text-white">
                            {new Date(
                              selectedJuiz.dataNascimento,
                            ).toLocaleDateString("pt-BR")}
                          </p>
                        </CardBody>
                      </Card>
                    )}
                    {selectedJuiz.dataPosse && (
                      <Card className="border border-white/10">
                        <CardBody className="gap-2">
                          <p className="text-sm text-default-400 font-semibold">
                            Data de Posse
                          </p>
                          <p className="text-white">
                            {new Date(
                              selectedJuiz.dataPosse,
                            ).toLocaleDateString("pt-BR")}
                          </p>
                        </CardBody>
                      </Card>
                    )}
                    {selectedJuiz.dataAposentadoria && (
                      <Card className="border border-white/10">
                        <CardBody className="gap-2">
                          <p className="text-sm text-default-400 font-semibold">
                            Data de Aposentadoria
                          </p>
                          <p className="text-white">
                            {new Date(
                              selectedJuiz.dataAposentadoria,
                            ).toLocaleDateString("pt-BR")}
                          </p>
                        </CardBody>
                      </Card>
                    )}
                  </div>
                </div>
              )}

              {/* Especialidades */}
              {selectedJuiz.especialidades &&
                selectedJuiz.especialidades.length > 0 && (
                  <div>
                    <p className="text-sm text-default-400 font-semibold mb-3">
                      Especialidades
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {selectedJuiz.especialidades.map(
                        (esp: EspecialidadeJuridica) => (
                          <Chip key={esp} color="primary" variant="flat">
                            {esp.replace(/_/g, " ")}
                          </Chip>
                        ),
                      )}
                    </div>
                  </div>
                )}

              {/* Biografia */}
              {selectedJuiz.biografia && (
                <div>
                  <p className="text-sm text-default-400 font-semibold mb-2">
                    Biografia
                  </p>
                  <p className="text-default-300 leading-relaxed">
                    {selectedJuiz.biografia}
                  </p>
                </div>
              )}

              {/* Formação e Experiência */}
              {(selectedJuiz.formacao || selectedJuiz.experiencia) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {selectedJuiz.formacao && (
                    <Card className="border border-white/10">
                      <CardHeader>
                        <p className="text-sm text-default-400 font-semibold flex items-center gap-2">
                          <Award className="w-4 h-4 text-primary" />
                          Formação
                        </p>
                      </CardHeader>
                      <Divider />
                      <CardBody>
                        <p className="text-default-300 text-sm leading-relaxed">
                          {selectedJuiz.formacao}
                        </p>
                      </CardBody>
                    </Card>
                  )}
                  {selectedJuiz.experiencia && (
                    <Card className="border border-white/10">
                      <CardHeader>
                        <p className="text-sm text-default-400 font-semibold flex items-center gap-2">
                          <Briefcase className="w-4 h-4 text-secondary" />
                          Experiência
                        </p>
                      </CardHeader>
                      <Divider />
                      <CardBody>
                        <p className="text-default-300 text-sm leading-relaxed">
                          {selectedJuiz.experiencia}
                        </p>
                      </CardBody>
                    </Card>
                  )}
                </div>
              )}

              {/* Prêmios e Publicações */}
              {(selectedJuiz.premios || selectedJuiz.publicacoes) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {selectedJuiz.premios && (
                    <Card className="border border-warning/20 bg-warning/5">
                      <CardHeader>
                        <p className="text-sm text-warning font-semibold flex items-center gap-2">
                          <Star className="w-4 h-4" />
                          Prêmios e Reconhecimentos
                        </p>
                      </CardHeader>
                      <Divider className="bg-warning/20" />
                      <CardBody>
                        <p className="text-default-300 text-sm leading-relaxed">
                          {selectedJuiz.premios}
                        </p>
                      </CardBody>
                    </Card>
                  )}
                  {selectedJuiz.publicacoes && (
                    <Card className="border border-secondary/20 bg-secondary/5">
                      <CardHeader>
                        <p className="text-sm text-secondary font-semibold flex items-center gap-2">
                          <Briefcase className="w-4 h-4" />
                          Publicações
                        </p>
                      </CardHeader>
                      <Divider className="bg-secondary/20" />
                      <CardBody>
                        <p className="text-default-300 text-sm leading-relaxed">
                          {selectedJuiz.publicacoes}
                        </p>
                      </CardBody>
                    </Card>
                  )}
                </div>
              )}

              {/* Redes Sociais e Links */}
              {(selectedJuiz.website ||
                selectedJuiz.linkedin ||
                selectedJuiz.twitter ||
                selectedJuiz.instagram) && (
                <Card className="border border-primary/20 bg-primary/5">
                  <CardHeader>
                    <p className="text-sm text-primary font-semibold">
                      Links e Redes Sociais
                    </p>
                  </CardHeader>
                  <Divider className="bg-primary/20" />
                  <CardBody>
                    <div className="flex flex-wrap gap-3">
                      {selectedJuiz.website && (
                        <Chip
                          as="a"
                          color="primary"
                          href={selectedJuiz.website}
                          startContent={<Award className="w-3 h-3" />}
                          target="_blank"
                          variant="flat"
                        >
                          Website
                        </Chip>
                      )}
                      {selectedJuiz.linkedin && (
                        <Chip
                          as="a"
                          color="primary"
                          href={selectedJuiz.linkedin}
                          target="_blank"
                          variant="flat"
                        >
                          LinkedIn
                        </Chip>
                      )}
                      {selectedJuiz.twitter && (
                        <Chip
                          as="a"
                          color="primary"
                          href={`https://twitter.com/${selectedJuiz.twitter.replace("@", "")}`}
                          target="_blank"
                          variant="flat"
                        >
                          Twitter
                        </Chip>
                      )}
                      {selectedJuiz.instagram && (
                        <Chip
                          as="a"
                          color="primary"
                          href={`https://instagram.com/${selectedJuiz.instagram.replace("@", "")}`}
                          target="_blank"
                          variant="flat"
                        >
                          Instagram
                        </Chip>
                      )}
                    </div>
                  </CardBody>
                </Card>
              )}

              {/* Observações */}
              {selectedJuiz.observacoes && (
                <Card className="border border-white/10">
                  <CardHeader>
                    <p className="text-sm text-default-400 font-semibold">
                      Observações Internas
                    </p>
                  </CardHeader>
                  <Divider />
                  <CardBody>
                    <p className="text-default-300 text-sm leading-relaxed italic">
                      {selectedJuiz.observacoes}
                    </p>
                  </CardBody>
                </Card>
              )}
            </div>
          )}
        </Modal>

        {/* Modal de Criação/Edição */}
        <Modal
          backdrop="blur"
          footerContent={
            <>
              <Button
                variant="light"
                onPress={() => {
                  setIsCreateModalOpen(false);
                  setIsEditModalOpen(false);
                  setSelectedJuiz(null);
                  resetForm();
                }}
              >
                Cancelar
              </Button>
              <Button
                color="primary"
                isLoading={isSaving}
                startContent={<Plus className="w-4 h-4" />}
                onPress={handleSaveJuiz}
              >
                {isEditModalOpen ? "Salvar Alterações" : "Criar Autoridade"}
              </Button>
            </>
          }
          isOpen={isCreateModalOpen || isEditModalOpen}
          showFooter={true}
          size="2xl"
          title={isEditModalOpen ? "Editar Autoridade" : "Nova Autoridade"}
          onClose={() => {
            setIsCreateModalOpen(false);
            setIsEditModalOpen(false);
            setSelectedJuiz(null);
            setSelectedCatalogJudge(null);
          }}
        >
          <div className="space-y-6">
            {/* Informações Básicas */}
            <div className="space-y-4">
              <h4 className="text-lg font-semibold text-white flex items-center gap-2">
                <User className="w-5 h-5 text-primary" />
                Informações Básicas
              </h4>

              {/* Upload de Foto - Componente Organizado com Crop */}
              <JuizFotoUpload
                currentFotoUrl={formState.foto}
                juizId={selectedJuiz?.id}
                juizNome={formState.nome || "Autoridade"}
                onFotoChange={(url: string) =>
                  setFormState({ ...formState, foto: url || "" })
                }
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Select
                  items={
                    formData?.tiposAutoridade?.map((tipo) => ({
                      key: tipo,
                      label: tipo === "PROMOTOR" ? "Promotor" : "Juiz",
                    })) || []
                  }
                  label="Tipo de autoridade"
                  selectedKeys={[formState.tipoAutoridade]}
                  size="lg"
                  variant="bordered"
                  onSelectionChange={(keys) =>
                    setFormState({
                      ...formState,
                      tipoAutoridade: Array.from(keys)[0] as JuizTipoAutoridade,
                      nivel:
                        Array.from(keys)[0] === "PROMOTOR"
                          ? ("OUTROS" as JuizNivel)
                          : formState.nivel,
                    })
                  }
                >
                  {(item) => (
                    <SelectItem key={item.key} textValue={item.label}>
                      {item.label}
                    </SelectItem>
                  )}
                </Select>
                <Input
                  isRequired
                  label="Nome"
                  placeholder="Ex: Dr. João Silva"
                  size="lg"
                  value={formState.nome}
                  variant="bordered"
                  onValueChange={(value) => {
                    setFormState({ ...formState, nome: value });
                    if (
                      selectedCatalogJudge &&
                      value.trim().toLowerCase() !==
                        selectedCatalogJudge.nome.trim().toLowerCase()
                    ) {
                      setSelectedCatalogJudge(null);
                    }
                  }}
                />
                <Input
                  label="Nome Completo"
                  placeholder="Nome completo da autoridade"
                  size="lg"
                  value={formState.nomeCompleto || ""}
                  variant="bordered"
                  onValueChange={(value) =>
                    setFormState({ ...formState, nomeCompleto: value })
                  }
                />
                <CpfInput
                  value={formState.cpf || ""}
                  onChange={(value) =>
                    setFormState({ ...formState, cpf: value })
                  }
                />
                <Input
                  label={
                    formState.tipoAutoridade === "PROMOTOR"
                      ? "Registro funcional (opcional)"
                      : "OAB"
                  }
                  placeholder={
                    formState.tipoAutoridade === "PROMOTOR"
                      ? "Matrícula / registro"
                      : "Número da OAB"
                  }
                  size="lg"
                  value={formState.oab || ""}
                  variant="bordered"
                  onValueChange={(value) =>
                    setFormState({ ...formState, oab: value })
                  }
                />
              </div>

              {!isEditModalOpen && (
                <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-primary">
                      Reaproveitar autoridade já existente no ecossistema
                    </p>
                    {selectedCatalogJudge ? (
                      <Button
                        color="danger"
                        size="sm"
                        variant="light"
                        onPress={() => setSelectedCatalogJudge(null)}
                      >
                        Desvincular
                      </Button>
                    ) : null}
                  </div>
                  <p className="text-xs text-default-500">
                    Digite pelo menos 3 letras no nome. Exibimos apenas nomes
                    para evitar exposição de dados entre escritórios.
                  </p>

                  {selectedCatalogJudge ? (
                    <Chip color="primary" variant="flat">
                      Vinculado: {selectedCatalogJudge.nome}
                    </Chip>
                  ) : null}

                  {!selectedCatalogJudge && formState.nome.trim().length >= 3 ? (
                    isLoadingCatalogoJuizes ? (
                      <div className="flex items-center gap-2 text-xs text-default-500">
                        <Spinner size="sm" />
                        Buscando nomes no catálogo...
                      </div>
                    ) : catalogoJuizes.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {catalogoJuizes.map((catalogoJuiz) => (
                          <Button
                            key={catalogoJuiz.id}
                            color="primary"
                            size="sm"
                            variant="flat"
                            onPress={() => {
                              setSelectedCatalogJudge(catalogoJuiz);
                              setFormState((prev) => ({
                                ...prev,
                                nome: catalogoJuiz.nome,
                              }));
                              toast.info(
                                `Autoridade "${catalogoJuiz.nome}" selecionada para vínculo.`,
                              );
                            }}
                          >
                            {catalogoJuiz.nome}
                          </Button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-default-500">
                        Nenhum nome compatível encontrado.
                      </p>
                    )
                  ) : null}
                </div>
              )}
            </div>

            <Divider className="bg-white/10" />

            {/* Contato */}
            <div className="space-y-4">
              <h4 className="text-lg font-semibold text-white flex items-center gap-2">
                <User className="w-5 h-5 text-primary" />
                Informações de Contato
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="E-mail"
                  placeholder="email@example.com"
                  size="lg"
                  type="email"
                  value={formState.email || ""}
                  variant="bordered"
                  onValueChange={(value) =>
                    setFormState({ ...formState, email: value })
                  }
                />
                <Input
                  label="Telefone"
                  placeholder="(00) 00000-0000"
                  size="lg"
                  value={formState.telefone || ""}
                  variant="bordered"
                  onValueChange={(value) =>
                    setFormState({ ...formState, telefone: value })
                  }
                />
              </div>
            </div>

            <Divider className="bg-white/10" />

            {/* Localização e Atuação */}
            <div className="space-y-4">
              <h4 className="text-lg font-semibold text-white flex items-center gap-2">
                <MapPin className="w-5 h-5 text-primary" />
                Localização e Atuação
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  isRequired
                  label={
                    formState.tipoAutoridade === "PROMOTOR"
                      ? "Promotoria"
                      : "Vara"
                  }
                  placeholder={
                    formState.tipoAutoridade === "PROMOTOR"
                      ? "Ex: 2ª Promotoria Criminal"
                      : "Ex: 1ª Vara Cível"
                  }
                  size="lg"
                  value={formState.vara}
                  variant="bordered"
                  onValueChange={(value) =>
                    setFormState({ ...formState, vara: value })
                  }
                />
                <Input
                  label="Comarca"
                  placeholder="Ex: Comarca de São Paulo"
                  size="lg"
                  value={formState.comarca || ""}
                  variant="bordered"
                  onValueChange={(value) =>
                    setFormState({ ...formState, comarca: value })
                  }
                />
                <Select
                  items={[
                    { key: "NONE", label: "Sem tribunal" },
                    ...(formData?.tribunais?.map((tribunal) => ({
                      key: tribunal.id,
                      label: tribunal.sigla
                        ? `${tribunal.sigla} - ${tribunal.nome}`
                        : tribunal.nome,
                    })) || []),
                  ]}
                  label="Tribunal"
                  selectedKeys={[
                    formState.tribunalId &&
                    formState.tribunalId.length > 0 &&
                    tribunalIds.has(formState.tribunalId)
                      ? formState.tribunalId
                      : "NONE",
                  ]}
                  size="lg"
                  variant="bordered"
                  onSelectionChange={(keys) =>
                    setFormState({
                      ...formState,
                      tribunalId:
                        (Array.from(keys)[0] as string) === "NONE"
                          ? ""
                          : ((Array.from(keys)[0] as string) || "").trim(),
                    })
                  }
                >
                  {(item) => (
                    <SelectItem key={item.key} textValue={item.label}>
                      {item.label}
                    </SelectItem>
                  )}
                </Select>
                <Input
                  label="Cidade"
                  placeholder="Ex: São Paulo"
                  size="lg"
                  value={formState.cidade || ""}
                  variant="bordered"
                  onValueChange={(value) =>
                    setFormState({ ...formState, cidade: value })
                  }
                />
                <Input
                  label="Estado"
                  maxLength={2}
                  placeholder="Ex: SP"
                  size="lg"
                  value={formState.estado || ""}
                  variant="bordered"
                  onValueChange={(value) =>
                    setFormState({ ...formState, estado: value.toUpperCase() })
                  }
                />
                <Input
                  className="md:col-span-2"
                  label="Endereço Completo"
                  placeholder="Rua, número, complemento"
                  size="lg"
                  value={formState.endereco || ""}
                  variant="bordered"
                  onValueChange={(value) =>
                    setFormState({ ...formState, endereco: value })
                  }
                />
                <Input
                  label="CEP"
                  placeholder="00000-000"
                  size="lg"
                  value={formState.cep || ""}
                  variant="bordered"
                  onValueChange={(value) =>
                    setFormState({ ...formState, cep: value })
                  }
                />
              </div>
            </div>

            <Divider className="bg-white/10" />

            {/* Datas Relevantes */}
            <div className="space-y-4">
              <h4 className="text-lg font-semibold text-white flex items-center gap-2">
                <Calendar className="w-5 h-5 text-primary" />
                Datas Relevantes
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <DateInput
                  label="Data de nascimento"
                  value={formatDateInput(formState.dataNascimento)}
                  variant="bordered"
                  onChange={(event) =>
                    setFormState({
                      ...formState,
                      dataNascimento: parseDateInput(event.target.value),
                    })
                  }
                />
                <DateInput
                  label={
                    formState.tipoAutoridade === "PROMOTOR"
                      ? "Data de ingresso no MP"
                      : "Data de posse"
                  }
                  value={formatDateInput(formState.dataPosse)}
                  variant="bordered"
                  onChange={(event) =>
                    setFormState({
                      ...formState,
                      dataPosse: parseDateInput(event.target.value),
                    })
                  }
                />
                <DateInput
                  label="Data de aposentadoria"
                  value={formatDateInput(formState.dataAposentadoria)}
                  variant="bordered"
                  onChange={(event) =>
                    setFormState({
                      ...formState,
                      dataAposentadoria: parseDateInput(event.target.value),
                    })
                  }
                />
              </div>
            </div>

            <Divider className="bg-white/10" />

            {/* Status e Classificação */}
            <div className="space-y-4">
              <h4 className="text-lg font-semibold text-white flex items-center gap-2">
                <Award className="w-5 h-5 text-primary" />
                Status e Classificação
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Select
                  items={
                    formData?.status?.map((s) => ({ key: s, label: s })) || []
                  }
                  label="Status"
                  placeholder="Selecione o status"
                  selectedKeys={[formState.status]}
                  size="lg"
                  variant="bordered"
                  onSelectionChange={(keys) =>
                    setFormState({
                      ...formState,
                      status: Array.from(keys)[0] as JuizStatus,
                    })
                  }
                >
                  {(item) => (
                    <SelectItem key={item.key} textValue={item.label}>{item.label}</SelectItem>
                  )}
                </Select>
                <Select
                  items={
                    (formState.tipoAutoridade === "PROMOTOR"
                      ? ["OUTROS"]
                      : formData?.niveis || []
                    ).map((n) => ({
                      key: n,
                      label:
                        n === "OUTROS"
                          ? "Outro"
                          : n.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (l) => l.toUpperCase()),
                    }))
                  }
                  isDisabled={formState.tipoAutoridade === "PROMOTOR"}
                  label={
                    formState.tipoAutoridade === "PROMOTOR"
                      ? "Nível (fixo para promotor)"
                      : "Nível"
                  }
                  placeholder="Selecione o nível"
                  selectedKeys={[formState.nivel]}
                  size="lg"
                  variant="bordered"
                  onSelectionChange={(keys) =>
                    setFormState({
                      ...formState,
                      nivel: Array.from(keys)[0] as JuizNivel,
                    })
                  }
                >
                  {(item) => (
                    <SelectItem key={item.key} textValue={item.label}>{item.label}</SelectItem>
                  )}
                </Select>
                <Select
                  items={
                    formData?.especialidades?.map((e) => ({
                      key: e,
                      label: e.replace(/_/g, " "),
                    })) || []
                  }
                  label="Especialidades"
                  placeholder="Selecione as especialidades"
                  selectedKeys={formState.especialidades}
                  selectionMode="multiple"
                  size="lg"
                  variant="bordered"
                  onSelectionChange={(keys) =>
                    setFormState({
                      ...formState,
                      especialidades: Array.from(
                        keys,
                      ) as EspecialidadeJuridica[],
                    })
                  }
                >
                  {(item) => (
                    <SelectItem key={item.key} textValue={item.label}>{item.label}</SelectItem>
                  )}
                </Select>
              </div>
            </div>

            <Divider className="bg-white/10" />

            {/* Biografia e Informações Adicionais */}
            <div className="space-y-4">
              <h4 className="text-lg font-semibold text-white flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-primary" />
                Informações Adicionais
              </h4>
              <Textarea
                label="Biografia"
                minRows={3}
                placeholder="Breve biografia do juiz..."
                size="lg"
                value={formState.biografia || ""}
                variant="bordered"
                onValueChange={(value) =>
                  setFormState({ ...formState, biografia: value })
                }
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Textarea
                  label="Formação"
                  minRows={2}
                  placeholder="Formação acadêmica..."
                  size="lg"
                  value={formState.formacao || ""}
                  variant="bordered"
                  onValueChange={(value) =>
                    setFormState({ ...formState, formacao: value })
                  }
                />
                <Textarea
                  label="Experiência"
                  minRows={2}
                  placeholder="Experiência profissional..."
                  size="lg"
                  value={formState.experiencia || ""}
                  variant="bordered"
                  onValueChange={(value) =>
                    setFormState({ ...formState, experiencia: value })
                  }
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Textarea
                  label="Prêmios e reconhecimentos"
                  minRows={2}
                  placeholder="Premiações, menções honrosas..."
                  size="lg"
                  value={formState.premios || ""}
                  variant="bordered"
                  onValueChange={(value) =>
                    setFormState({ ...formState, premios: value })
                  }
                />
                <Textarea
                  label="Publicações"
                  minRows={2}
                  placeholder="Artigos, livros, teses..."
                  size="lg"
                  value={formState.publicacoes || ""}
                  variant="bordered"
                  onValueChange={(value) =>
                    setFormState({ ...formState, publicacoes: value })
                  }
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Website"
                  placeholder="https://..."
                  size="lg"
                  type="url"
                  value={formState.website || ""}
                  variant="bordered"
                  onValueChange={(value) =>
                    setFormState({ ...formState, website: value })
                  }
                />
                <Input
                  label="LinkedIn"
                  placeholder="https://linkedin.com/in/..."
                  size="lg"
                  type="url"
                  value={formState.linkedin || ""}
                  variant="bordered"
                  onValueChange={(value) =>
                    setFormState({ ...formState, linkedin: value })
                  }
                />
                <Input
                  label="Twitter/X"
                  placeholder="https://x.com/... ou @perfil"
                  size="lg"
                  value={formState.twitter || ""}
                  variant="bordered"
                  onValueChange={(value) =>
                    setFormState({ ...formState, twitter: value })
                  }
                />
                <Input
                  label="Instagram"
                  placeholder="https://instagram.com/... ou @perfil"
                  size="lg"
                  value={formState.instagram || ""}
                  variant="bordered"
                  onValueChange={(value) =>
                    setFormState({ ...formState, instagram: value })
                  }
                />
              </div>
              <Textarea
                label="Observações internas"
                minRows={3}
                placeholder="Anotações estratégicas e contexto adicional..."
                size="lg"
                value={formState.observacoes || ""}
                variant="bordered"
                onValueChange={(value) =>
                  setFormState({ ...formState, observacoes: value })
                }
              />
            </div>
          </div>
        </Modal>

        <Modal
          backdrop="blur"
          footerContent={
            <>
              <Button
                variant="light"
                onPress={handleCloseLinkProcessosModal}
              >
                Cancelar
              </Button>
              <Button
                color="danger"
                isDisabled={
                  selectedLinkedCount === 0 || isLoadingProcessosParaVinculo
                }
                onPress={() =>
                  handleRequestBatchActionConfirmation("desvincular")
                }
              >
                Desvincular selecionados
              </Button>
              <Button
                color="primary"
                isDisabled={
                  selectedNotLinkedCount === 0 ||
                  isLoadingProcessosParaVinculo
                }
                onPress={() => handleRequestBatchActionConfirmation("vincular")}
              >
                Vincular selecionados
              </Button>
            </>
          }
          isOpen={isLinkProcessosModalOpen}
          showFooter={true}
          size="2xl"
          title={`Vincular Processos${selectedJuiz ? ` · ${selectedJuiz.nome}` : ""}`}
          onClose={handleCloseLinkProcessosModal}
        >
          <div className="space-y-4">
            <p className="text-sm text-default-400">
              Selecione os processos que esta autoridade deve assumir. A lista
              respeita o seu escopo de visualização.
            </p>

            <Input
              placeholder="Pesquisar por número, título, cliente ou responsável"
              startContent={<Search className="h-4 w-4 text-default-400" />}
              value={processoSearchTerm}
              variant="bordered"
              onValueChange={setProcessoSearchTerm}
            />

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-background/40 px-3 py-2">
              <Checkbox
                isDisabled={processosFiltradosIds.length === 0}
                isSelected={allFilteredSelected}
                onValueChange={handleToggleSelecionarTodosFiltrados}
              >
                Selecionar todos visíveis
              </Checkbox>
              <p className="text-xs text-default-400">
                {selectedProcessoIds.length} selecionado(s) ·{" "}
                {processosFiltradosParaVinculo.length} visível(is) ·{" "}
                {selectedLinkedCount} já vinculados
              </p>
            </div>

            <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
              {isLoadingProcessosParaVinculo ? (
                <div className="flex items-center justify-center py-10">
                  <Spinner size="lg" />
                </div>
              ) : processosFiltradosParaVinculo.length === 0 ? (
                <div className="rounded-lg border border-white/10 bg-background/50 px-4 py-6 text-center text-sm text-default-500">
                  Nenhum processo encontrado para os filtros aplicados.
                </div>
              ) : (
                processosFiltradosParaVinculo.map((processo) => {
                  const isSelected = selectedProcessoIdsSet.has(processo.id);
                  const alreadyLinked =
                    !!selectedJuiz && processo.juizId === selectedJuiz.id;

                  return (
                    <div
                      key={processo.id}
                      className="flex items-start gap-3 rounded-lg border border-white/10 bg-background/55 px-3 py-3"
                    >
                      <Checkbox
                        isSelected={isSelected}
                        onValueChange={(checked) =>
                          handleToggleProcessoSelecionado(processo.id, checked)
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-white">
                          {processo.numero}
                        </p>
                        <p className="line-clamp-1 text-xs text-default-400">
                          {processo.titulo || "Sem título"} · Cliente:{" "}
                          {processo.clienteNome}
                        </p>
                        <p className="line-clamp-1 text-[11px] text-default-500">
                          Responsável:{" "}
                          {processo.advogadoResponsavelNome || "Não definido"}
                        </p>
                      </div>
                      <Chip
                        color={alreadyLinked ? "success" : "default"}
                        size="sm"
                        variant="flat"
                      >
                        {alreadyLinked ? "Já vinculado" : processo.status}
                      </Chip>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </Modal>

        <Modal
          backdrop="blur"
          footerContent={
            <>
              <Button
                isDisabled={isLinkingProcessos}
                variant="light"
                onPress={() => {
                  setIsConfirmLinkActionModalOpen(false);
                  setPendingLinkAction(null);
                }}
              >
                Voltar
              </Button>
              <Button
                color={pendingLinkAction === "desvincular" ? "danger" : "primary"}
                isLoading={isLinkingProcessos}
                onPress={handleConfirmBatchAction}
              >
                {pendingLinkAction === "desvincular"
                  ? "Confirmar desvínculo"
                  : "Confirmar vínculo"}
              </Button>
            </>
          }
          isOpen={isConfirmLinkActionModalOpen}
          showFooter={true}
          size="lg"
          title={
            pendingLinkAction === "desvincular"
              ? "Confirmar desvinculo em massa"
              : "Confirmar vinculo em massa"
          }
          onClose={() => {
            if (isLinkingProcessos) return;
            setIsConfirmLinkActionModalOpen(false);
            setPendingLinkAction(null);
          }}
        >
          <div className="space-y-3">
            <p className="text-sm text-default-300">
              Você está prestes a{" "}
              <span className="font-semibold text-white">
                {pendingLinkAction === "desvincular" ? "desvincular" : "vincular"}
              </span>{" "}
              <span className="font-semibold text-white">
                {selectedProcessoIds.length} processo(s)
              </span>
              .
            </p>
            <div className="rounded-lg border border-warning/20 bg-warning/5 px-3 py-2 text-xs text-warning-600">
              Esta operação altera processos em lote. Revise a seleção antes de
              confirmar.
            </div>
            <div className="text-xs text-default-400">
              {pendingLinkAction === "desvincular"
                ? `${selectedLinkedCount} processo(s) estão vinculados atualmente a esta autoridade e serão afetados.`
                : `${selectedNotLinkedCount} processo(s) serão vinculados; os já vinculados serão mantidos.`}
            </div>
          </div>
        </Modal>
      </section>
    </PermissionGuard>
  );
}
