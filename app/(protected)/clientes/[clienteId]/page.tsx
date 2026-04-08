"use client";

import { useParams, useRouter } from "next/navigation";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Button } from "@heroui/button";
import { Chip } from "@heroui/chip";
import { Divider } from "@heroui/divider";
import { Avatar } from "@heroui/avatar";
import { Spinner } from "@heroui/spinner";
import { Tabs, Tab } from "@heroui/tabs";
import { Input } from "@heroui/input";
import { Textarea } from "@heroui/input";
import { Checkbox } from "@heroui/checkbox";
import { Pagination, Select, SelectItem } from "@heroui/react";
import {
  ArrowLeft,
  User,
  Mail,
  Phone,
  FileText,
  Building2,
  Briefcase,
  Calendar,
  Scale,
  Clock,
  AlertCircle,
  CheckCircle,
  XCircle,
  FileStack,
  FileSignature,
  Eye,
  Upload,
  Flag,
  Layers,
  CheckSquare,
  CalendarDays,
  CreditCard,
  Users,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "@/lib/toast";
import { UploadProgress } from "@/components/ui/upload-progress";

import {
  useClienteComProcessos,
  useContratosCliente,
  useDocumentosCliente,
  useProcuracoesCliente,
} from "@/app/hooks/use-clientes";
import { title } from "@/components/primitives";
import {
  ProcessoStatus,
  ProcessoFase,
  ProcessoGrau,
  TarefaStatus,
  TarefaPrioridade,
  EventoStatus,
} from "@/generated/prisma";
import { DateUtils } from "@/app/lib/date-utils";
import { Modal } from "@/components/ui/modal";
import { anexarDocumentoCliente } from "@/app/actions/clientes";
import { getProcessoStatusLabel } from "@/app/lib/processos/diff";
import { getProcedimentoProcessualLabel } from "@/app/lib/processos/procedimento-processual";

const TAB_PAGE_SIZES = {
  processos: 6,
  contratos: 6,
  tarefas: 6,
  eventos: 6,
  assinaturas: 6,
  procuracoes: 6,
  documentos: 6,
} as const;

const PROCESSOS_STATUS_FILTER_OPTIONS = [
  { key: "TODOS", label: "Todos" },
  { key: "EM_ANDAMENTO", label: "Em andamento" },
  { key: "SUSPENSO", label: "Suspenso" },
  { key: "ENCERRADO", label: "Encerrado" },
  { key: "ARQUIVADO_PROVISORIO", label: "Arquivado provisoriamente" },
  { key: "ARQUIVADO_DEFINITIVO", label: "Arquivado definitivamente" },
  {
    key: "ARQUIVADO_SEM_CLASSIFICACAO",
    label: "Arquivado sem classificacao",
  },
] as const;

type ProcessoStatusFilterKey =
  (typeof PROCESSOS_STATUS_FILTER_OPTIONS)[number]["key"];

function getTotalPages(totalItems: number, pageSize: number) {
  return Math.max(1, Math.ceil(totalItems / pageSize));
}

function paginateItems<T>(items: T[], page: number, pageSize: number) {
  const safePage = Math.max(1, page);
  const start = (safePage - 1) * pageSize;
  const end = start + pageSize;

  return items.slice(start, end);
}

function getPageRange(totalItems: number, page: number, pageSize: number) {
  if (totalItems === 0) {
    return { start: 0, end: 0 };
  }

  const start = (Math.max(1, page) - 1) * pageSize + 1;
  const end = Math.min(Math.max(1, page) * pageSize, totalItems);

  return { start, end };
}

function TabPagination({
  page,
  totalPages,
  totalItems,
  pageSize,
  itemLabel,
  onChange,
}: {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  itemLabel: string;
  onChange: (page: number) => void;
}) {
  if (totalItems <= pageSize) {
    return null;
  }

  const range = getPageRange(totalItems, page, pageSize);

  return (
    <div className="mt-4 flex flex-col gap-2 border-t border-default-200 pt-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-default-500 sm:text-sm">
        Mostrando {range.start}-{range.end} de {totalItems} {itemLabel}
      </p>
      <Pagination
        isCompact
        showControls
        color="primary"
        page={page}
        size="sm"
        total={totalPages}
        onChange={onChange}
      />
    </div>
  );
}

export default function ClienteDetalhesPage() {
  const params = useParams();
  const router = useRouter();
  const clienteId = params.clienteId as string;

  const {
    cliente,
    isLoading,
    isError,
    mutate: mutateCliente,
  } = useClienteComProcessos(clienteId);
  const { contratos, isLoading: isLoadingContratos } =
    useContratosCliente(clienteId);
  const {
    documentos,
    isLoading: isLoadingDocumentos,
    mutate: mutateDocumentos,
  } = useDocumentosCliente(clienteId);
  const { procuracoes, isLoading: isLoadingProcuracoes } =
    useProcuracoesCliente(clienteId);

  // Estados do modal de anexar documento
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadFormData, setUploadFormData] = useState({
    nome: "",
    tipo: "",
    descricao: "",
    processoId: "",
    visivelParaCliente: false,
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [processosPage, setProcessosPage] = useState(1);
  const [processosSearch, setProcessosSearch] = useState("");
  const [processosStatusFilter, setProcessosStatusFilter] =
    useState<ProcessoStatusFilterKey>("TODOS");
  const [contratosPage, setContratosPage] = useState(1);
  const [tarefasPage, setTarefasPage] = useState(1);
  const [eventosPage, setEventosPage] = useState(1);
  const [assinaturasPage, setAssinaturasPage] = useState(1);
  const [procuracoesPage, setProcuracoesPage] = useState(1);
  const [documentosPage, setDocumentosPage] = useState(1);

  // Proteção: Redirecionar se não autorizado
  useEffect(() => {
    if (isError) {
      toast.error("Acesso negado ou cliente não encontrado");
      router.push("/clientes");
    }
  }, [isError, router]);

  useEffect(() => {
    setProcessosPage(1);
    setProcessosSearch("");
    setProcessosStatusFilter("TODOS");
    setContratosPage(1);
    setTarefasPage(1);
    setEventosPage(1);
    setAssinaturasPage(1);
    setProcuracoesPage(1);
    setDocumentosPage(1);
  }, [clienteId]);

  const processosItems = cliente?.processos || [];
  const contratosItems = contratos || [];
  const tarefasItems = cliente?.tarefas || [];
  const assinaturasItems = cliente?.documentoAssinaturas || [];
  const procuracoesItems = procuracoes || [];
  const documentosItems = documentos || [];
  const clienteEventos = cliente?.eventos || [];
  const processoIdsDisponiveis = new Set(
    processosItems.map((processo) => processo.id),
  );
  const selectedProcessoKeys =
    uploadFormData.processoId &&
    processoIdsDisponiveis.has(uploadFormData.processoId)
      ? [uploadFormData.processoId]
      : [];
  const eventosItems = [...clienteEventos].sort(
    (a, b) =>
      new Date(b.dataInicio).getTime() - new Date(a.dataInicio).getTime(),
  );
  const processStatusFilterKeys = useMemo(
    () =>
      new Set(PROCESSOS_STATUS_FILTER_OPTIONS.map((option) => option.key)),
    [],
  );
  const selectedProcessosStatusKeys = processStatusFilterKeys.has(
    processosStatusFilter,
  )
    ? [processosStatusFilter]
    : ["TODOS"];

  const matchesProcessoStatusFilter = (
    processo: (typeof processosItems)[number],
    filter: ProcessoStatusFilterKey,
  ) => {
    if (filter === "TODOS") {
      return true;
    }

    if (filter === "ARQUIVADO_PROVISORIO") {
      return (
        processo.status === ProcessoStatus.ARQUIVADO &&
        processo.arquivamentoTipo === "PROVISORIO"
      );
    }

    if (filter === "ARQUIVADO_DEFINITIVO") {
      return (
        processo.status === ProcessoStatus.ARQUIVADO &&
        processo.arquivamentoTipo === "DEFINITIVO"
      );
    }

    if (filter === "ARQUIVADO_SEM_CLASSIFICACAO") {
      return (
        processo.status === ProcessoStatus.ARQUIVADO &&
        !processo.arquivamentoTipo
      );
    }

    return processo.status === filter;
  };

  const getProcessoResponsaveis = (processo: (typeof processosItems)[number]) =>
    Array.isArray((processo as any).advogadosResponsaveis) &&
    (processo as any).advogadosResponsaveis.length > 0
      ? (processo as any).advogadosResponsaveis
      : processo.advogadoResponsavel
        ? [processo.advogadoResponsavel]
        : [];

  const formatAdvogadoResponsavelNome = (advogado: any) =>
    [advogado?.usuario?.firstName, advogado?.usuario?.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();

  const formatResponsaveisResumo = (processo: (typeof processosItems)[number]) => {
    const nomes = getProcessoResponsaveis(processo)
      .map((advogado: any) => formatAdvogadoResponsavelNome(advogado))
      .filter(Boolean);

    if (nomes.length === 0) {
      return "Nao definido";
    }

    const principais = nomes.slice(0, 2).join(", ");

    return nomes.length > 2
      ? `${principais} +${nomes.length - 2}`
      : principais;
  };

  const formatAssuntosResumo = (processo: (typeof processosItems)[number]) => {
    const nomes = Array.isArray((processo as any).causasVinculadas)
      ? (processo as any).causasVinculadas
          .map((item: any) => item?.causa?.nome)
          .filter(Boolean)
      : [];

    if (nomes.length === 0) {
      return null;
    }

    const principais = nomes.slice(0, 2).join(", ");

    return nomes.length > 2
      ? `${principais} +${nomes.length - 2}`
      : principais;
  };

  const formatProcedimentoResumo = (processo: (typeof processosItems)[number]) =>
    getProcedimentoProcessualLabel((processo as any).procedimentoProcessual) ??
    null;

  const processosFiltrados = useMemo(() => {
    const normalizedSearch = processosSearch.trim().toLowerCase();

    return processosItems.filter((processo) => {
      if (!matchesProcessoStatusFilter(processo, processosStatusFilter)) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const advogadoNome = getProcessoResponsaveis(processo)
        .map((advogado: any) => formatAdvogadoResponsavelNome(advogado))
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const haystack = [
        processo.numero,
        processo.numeroCnj,
        processo.titulo,
        (processo as any).classeProcessual,
        formatProcedimentoResumo(processo),
        formatAssuntosResumo(processo),
        processo.area?.nome,
        advogadoNome,
        getProcessoStatusLabel(
          processo.status as ProcessoStatus,
          processo.arquivamentoTipo as
            | "PROVISORIO"
            | "DEFINITIVO"
            | null
            | undefined,
        ),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    });
  }, [processosItems, processosSearch, processosStatusFilter]);

  const processosTotalPages = getTotalPages(
    processosFiltrados.length,
    TAB_PAGE_SIZES.processos,
  );
  const contratosTotalPages = getTotalPages(
    contratosItems.length,
    TAB_PAGE_SIZES.contratos,
  );
  const tarefasTotalPages = getTotalPages(
    tarefasItems.length,
    TAB_PAGE_SIZES.tarefas,
  );
  const eventosTotalPages = getTotalPages(
    eventosItems.length,
    TAB_PAGE_SIZES.eventos,
  );
  const assinaturasTotalPages = getTotalPages(
    assinaturasItems.length,
    TAB_PAGE_SIZES.assinaturas,
  );
  const procuracoesTotalPages = getTotalPages(
    procuracoesItems.length,
    TAB_PAGE_SIZES.procuracoes,
  );
  const documentosTotalPages = getTotalPages(
    documentosItems.length,
    TAB_PAGE_SIZES.documentos,
  );

  const processosPaginados = paginateItems(
    processosFiltrados,
    processosPage,
    TAB_PAGE_SIZES.processos,
  );
  const contratosPaginados = paginateItems(
    contratosItems,
    contratosPage,
    TAB_PAGE_SIZES.contratos,
  );
  const tarefasPaginadas = paginateItems(
    tarefasItems,
    tarefasPage,
    TAB_PAGE_SIZES.tarefas,
  );
  const eventosPaginados = paginateItems(
    eventosItems,
    eventosPage,
    TAB_PAGE_SIZES.eventos,
  );
  const assinaturasPaginadas = paginateItems(
    assinaturasItems,
    assinaturasPage,
    TAB_PAGE_SIZES.assinaturas,
  );
  const procuracoesPaginadas = paginateItems(
    procuracoesItems,
    procuracoesPage,
    TAB_PAGE_SIZES.procuracoes,
  );
  const documentosPaginados = paginateItems(
    documentosItems,
    documentosPage,
    TAB_PAGE_SIZES.documentos,
  );

  useEffect(() => {
    setProcessosPage((prev) => Math.min(prev, processosTotalPages));
  }, [processosTotalPages]);

  useEffect(() => {
    setProcessosPage(1);
  }, [processosSearch, processosStatusFilter]);

  useEffect(() => {
    setContratosPage((prev) => Math.min(prev, contratosTotalPages));
  }, [contratosTotalPages]);

  useEffect(() => {
    setTarefasPage((prev) => Math.min(prev, tarefasTotalPages));
  }, [tarefasTotalPages]);

  useEffect(() => {
    setEventosPage((prev) => Math.min(prev, eventosTotalPages));
  }, [eventosTotalPages]);

  useEffect(() => {
    setAssinaturasPage((prev) => Math.min(prev, assinaturasTotalPages));
  }, [assinaturasTotalPages]);

  useEffect(() => {
    setProcuracoesPage((prev) => Math.min(prev, procuracoesTotalPages));
  }, [procuracoesTotalPages]);

  useEffect(() => {
    setDocumentosPage((prev) => Math.min(prev, documentosTotalPages));
  }, [documentosTotalPages]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];

    if (file) {
      setSelectedFile(file);
      // Preencher nome automaticamente
      if (!uploadFormData.nome) {
        setUploadFormData((prev) => ({ ...prev, nome: file.name }));
      }
    }
  };

  const handleAnexarDocumento = async () => {
    if (!selectedFile) {
      toast.error("Selecione um arquivo");

      return;
    }

    if (!uploadFormData.nome.trim()) {
      toast.error("Nome do documento é obrigatório");

      return;
    }

    setIsUploading(true);

    try {
      const formData = new FormData();

      formData.append("nome", uploadFormData.nome);
      formData.append("tipo", uploadFormData.tipo);
      formData.append("descricao", uploadFormData.descricao);
      formData.append("processoId", uploadFormData.processoId);
      formData.append(
        "visivelParaCliente",
        uploadFormData.visivelParaCliente.toString(),
      );
      formData.append("arquivo", selectedFile);

      const result = await anexarDocumentoCliente(clienteId, formData);

      if (result.success) {
        toast.success("Documento anexado com sucesso!");
        setIsUploadModalOpen(false);
        setUploadFormData({
          nome: "",
          tipo: "",
          descricao: "",
          processoId: "",
          visivelParaCliente: false,
        });
        setSelectedFile(null);
        mutateDocumentos();
        mutateCliente();
      } else {
        toast.error(result.error || "Erro ao anexar documento");
      }
    } catch (error) {
      toast.error("Erro ao anexar documento");
    } finally {
      setIsUploading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (isError || !cliente) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center gap-4">
        <AlertCircle className="h-12 w-12 text-danger" />
        <p className="text-lg font-semibold text-danger">
          Erro ao carregar cliente
        </p>
        <Button color="primary" onPress={() => router.push("/clientes")}>
          Voltar para Clientes
        </Button>
      </div>
    );
  }

  const getInitials = (nome: string) => {
    const names = nome.split(" ");

    if (names.length >= 2) {
      return `${names[0][0]}${names[names.length - 1][0]}`.toUpperCase();
    }

    return nome.substring(0, 2).toUpperCase();
  };

  const getStatusColor = (status: ProcessoStatus) => {
    switch (status) {
      case ProcessoStatus.EM_ANDAMENTO:
        return "primary";
      case ProcessoStatus.ENCERRADO:
        return "success";
      case ProcessoStatus.ARQUIVADO:
        return "default";
      case ProcessoStatus.SUSPENSO:
        return "warning";
      case ProcessoStatus.RASCUNHO:
        return "default";
      default:
        return "default";
    }
  };

  const getStatusLabel = (
    status: ProcessoStatus,
    arquivamentoTipo?: "PROVISORIO" | "DEFINITIVO" | null,
  ) => getProcessoStatusLabel(status, arquivamentoTipo);

  const getStatusIcon = (status: ProcessoStatus) => {
    switch (status) {
      case ProcessoStatus.EM_ANDAMENTO:
        return <Clock className="h-4 w-4" />;
      case ProcessoStatus.ENCERRADO:
        return <CheckCircle className="h-4 w-4" />;
      case ProcessoStatus.ARQUIVADO:
        return <XCircle className="h-4 w-4" />;
      case ProcessoStatus.SUSPENSO:
        return <AlertCircle className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  const getFaseLabel = (fase?: ProcessoFase | null) => {
    if (!fase) return null;
    switch (fase) {
      case ProcessoFase.PETICAO_INICIAL:
        return "Petição Inicial";
      case ProcessoFase.CITACAO:
        return "Citação";
      case ProcessoFase.INSTRUCAO:
        return "Instrução";
      case ProcessoFase.ALEGACOES_FINAIS:
        return "Alegações finais";
      case ProcessoFase.SENTENCA:
        return "Sentença";
      case ProcessoFase.RECURSO:
        return "Recurso";
      case ProcessoFase.EXECUCAO:
        return "Execução";
      default:
        return fase;
    }
  };

  const getGrauLabel = (grau?: ProcessoGrau | null) => {
    if (!grau) return null;
    switch (grau) {
      case ProcessoGrau.PRIMEIRO:
        return "1º Grau";
      case ProcessoGrau.SEGUNDO:
        return "2º Grau";
      case ProcessoGrau.SUPERIOR:
        return "Tribunal Superior";
      default:
        return grau;
    }
  };

  const formatDateTime = (value?: Date | string | null) => {
    if (!value) return "-";
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "-";

    return date.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getTarefaStatusColor = (status: TarefaStatus) => {
    switch (status) {
      case TarefaStatus.CONCLUIDA:
        return "success";
      case TarefaStatus.EM_ANDAMENTO:
        return "primary";
      case TarefaStatus.CANCELADA:
        return "danger";
      case TarefaStatus.PENDENTE:
      default:
        return "warning";
    }
  };

  const getTarefaStatusLabel = (status: TarefaStatus) => {
    switch (status) {
      case TarefaStatus.CONCLUIDA:
        return "Concluída";
      case TarefaStatus.EM_ANDAMENTO:
        return "Em andamento";
      case TarefaStatus.CANCELADA:
        return "Cancelada";
      case TarefaStatus.PENDENTE:
      default:
        return "Pendente";
    }
  };

  const getTarefaPrioridadeColor = (prioridade: TarefaPrioridade) => {
    switch (prioridade) {
      case TarefaPrioridade.CRITICA:
        return "danger";
      case TarefaPrioridade.ALTA:
        return "warning";
      case TarefaPrioridade.MEDIA:
        return "primary";
      case TarefaPrioridade.BAIXA:
      default:
        return "default";
    }
  };

  const getEventoStatusColor = (status: EventoStatus) => {
    switch (status) {
      case EventoStatus.CONFIRMADO:
      case EventoStatus.REALIZADO:
        return "success";
      case EventoStatus.CANCELADO:
        return "danger";
      case EventoStatus.ADIADO:
        return "warning";
      case EventoStatus.AGENDADO:
      default:
        return "primary";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header com Botões */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Button
          as={Link}
          href="/clientes"
          startContent={<ArrowLeft className="h-4 w-4" />}
          variant="light"
        >
          Voltar para Clientes
        </Button>

        <div className="flex flex-wrap gap-2">
          <Button
            color="primary"
            startContent={<Upload className="h-4 w-4" />}
            variant="flat"
            onPress={() => setIsUploadModalOpen(true)}
          >
            Anexar Documento
          </Button>
          <Button
            as={Link}
            color="primary"
            href={`/processos/novo?clienteId=${clienteId}`}
            startContent={<Scale className="h-4 w-4" />}
            variant="bordered"
          >
            Novo Processo
          </Button>
          <Button
            as={Link}
            color="secondary"
            href={`/contratos/novo?clienteId=${clienteId}`}
            startContent={<FileText className="h-4 w-4" />}
            variant="bordered"
          >
            Novo Contrato
          </Button>
          <Button
            as={Link}
            color="success"
            href={`/procuracoes/novo?clienteId=${clienteId}`}
            startContent={<FileSignature className="h-4 w-4" />}
            variant="bordered"
          >
            Nova Procuração
          </Button>
        </div>
      </div>

      {/* Header do Cliente */}
      <Card className="border border-default-200">
        <CardBody>
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
            <Avatar
              showFallback
              className="h-20 w-20 bg-primary/10 text-primary text-2xl"
              icon={
                cliente.tipoPessoa === "JURIDICA" ? (
                  <Building2 className="h-10 w-10" />
                ) : (
                  <User className="h-10 w-10" />
                )
              }
              name={getInitials(cliente.nome)}
            />
            <div className="flex-1 space-y-4">
              <div>
                <h1 className={title({ size: "md" })}>{cliente.nome}</h1>
                <p className="mt-1 text-sm text-default-500">
                  {cliente.tipoPessoa === "FISICA"
                    ? "Pessoa Física"
                    : "Pessoa Jurídica"}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {cliente.documento && (
                  <div className="flex items-center gap-2 text-sm">
                    <FileText className="h-4 w-4 text-default-400" />
                    <span className="text-default-600">
                      {cliente.documento}
                    </span>
                  </div>
                )}
                {cliente.email && (
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="h-4 w-4 text-default-400" />
                    <span className="text-default-600">{cliente.email}</span>
                  </div>
                )}
                {cliente.telefone && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="h-4 w-4 text-default-400" />
                    <span className="text-default-600">{cliente.telefone}</span>
                  </div>
                )}
                {cliente.celular && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="h-4 w-4 text-default-400" />
                    <span className="text-default-600">{cliente.celular}</span>
                  </div>
                )}
                {cliente.dataNascimento && (
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4 text-default-400" />
                    <span className="text-default-600">
                      Nascimento: {DateUtils.formatDate(cliente.dataNascimento)}
                    </span>
                  </div>
                )}
                {cliente.inscricaoEstadual && (
                  <div className="flex items-center gap-2 text-sm">
                    <FileSignature className="h-4 w-4 text-default-400" />
                    <span className="text-default-600">
                      IE: {cliente.inscricaoEstadual}
                    </span>
                  </div>
                )}
                {cliente.asaasCustomerId && (
                  <div className="flex items-center gap-2 text-sm">
                    <CreditCard className="h-4 w-4 text-default-400" />
                    <span className="text-default-600">
                      Asaas: {cliente.asaasCustomerId}
                    </span>
                  </div>
                )}
              </div>

              {cliente.tipoPessoa === "JURIDICA" &&
              (cliente.responsavelNome ||
                cliente.responsavelEmail ||
                cliente.responsavelTelefone) ? (
                <div className="rounded-lg border border-default-200 bg-default-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-default-500">
                    Responsável Legal
                  </p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    <p className="text-sm text-default-600">
                      {cliente.responsavelNome || "Nome não informado"}
                    </p>
                    <p className="text-sm text-default-600">
                      {cliente.responsavelEmail || "Email não informado"}
                    </p>
                    <p className="text-sm text-default-600">
                      {cliente.responsavelTelefone || "Telefone não informado"}
                    </p>
                  </div>
                </div>
              ) : null}

              {cliente.tipoPessoa === "FISICA" &&
              (cliente.nomePai ||
                cliente.documentoPai ||
                cliente.nomeMae ||
                cliente.documentoMae) ? (
                <div className="rounded-lg border border-default-200 bg-default-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-default-500">
                    Genitores
                  </p>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    {cliente.nomePai ? (
                      <p className="text-sm text-default-600">
                        Pai: {cliente.nomePai}
                      </p>
                    ) : null}
                    {cliente.documentoPai ? (
                      <p className="text-sm text-default-600">
                        Documento do pai: {cliente.documentoPai}
                      </p>
                    ) : null}
                    {cliente.nomeMae ? (
                      <p className="text-sm text-default-600">
                        Mãe: {cliente.nomeMae}
                      </p>
                    ) : null}
                    {cliente.documentoMae ? (
                      <p className="text-sm text-default-600">
                        Documento da mãe: {cliente.documentoMae}
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {cliente.observacoes && (
                <div className="rounded-lg bg-default-100 p-3">
                  <p className="text-sm text-default-600">
                    {cliente.observacoes}
                  </p>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Chip color="primary" size="sm" variant="flat">
                  {cliente._count?.processos || 0} processos
                </Chip>
                <Chip color="secondary" size="sm" variant="flat">
                  {cliente._count?.contratos || 0} contratos
                </Chip>
                <Chip color="success" size="sm" variant="flat">
                  {procuracoes?.length || 0} procurações
                </Chip>
                <Chip color="warning" size="sm" variant="flat">
                  {cliente._count?.documentos || 0} documentos
                </Chip>
                <Chip color="secondary" size="sm" variant="flat">
                  {cliente._count?.enderecos || 0} endereços
                </Chip>
                <Chip color="secondary" size="sm" variant="flat">
                  {cliente._count?.dadosBancarios || 0} contas bancárias
                </Chip>
                <Chip color="primary" size="sm" variant="flat">
                  {cliente._count?.tarefas || 0} tarefas
                </Chip>
                <Chip color="primary" size="sm" variant="flat">
                  {cliente._count?.eventos || 0} eventos
                </Chip>
                <Chip color="success" size="sm" variant="flat">
                  {cliente._count?.documentoAssinaturas || 0} assinaturas
                </Chip>
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Tabs de Conteúdo */}
      <Tabs
        aria-label="Informações do Cliente"
        color="primary"
        variant="underlined"
      >
        <Tab
          key="cadastro"
          title={
            <div className="flex items-center gap-2">
              <User className="h-4 w-4" />
              <span>Cadastro</span>
            </div>
          }
        >
          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <Card className="border border-default-200">
              <CardHeader className="pb-2">
                <div>
                  <p className="text-sm font-semibold">Advogados vinculados</p>
                  <p className="text-xs text-default-400">
                    Profissionais com acesso direto ao cliente.
                  </p>
                </div>
              </CardHeader>
              <Divider />
              <CardBody className="gap-3 pt-3">
                {cliente.advogadoClientes &&
                cliente.advogadoClientes.length > 0 ? (
                  cliente.advogadoClientes.map((vinculo) => (
                    <Link
                      key={vinculo.id}
                      className="block rounded-lg border border-default-200 p-3 transition-colors hover:border-primary hover:bg-primary/5"
                      href={`/advogados/${vinculo.advogado.id}`}
                    >
                      <p className="text-sm font-semibold">
                        {vinculo.advogado.usuario.firstName}{" "}
                        {vinculo.advogado.usuario.lastName}
                      </p>
                      <p className="text-xs text-default-500">
                        {vinculo.advogado.usuario.email || "Sem email"}
                      </p>
                      <p className="text-xs text-default-500">
                        OAB: {vinculo.advogado.oabNumero || "-"}
                        {vinculo.advogado.oabUf
                          ? `/${vinculo.advogado.oabUf}`
                          : ""}
                      </p>
                      <div className="mt-2 flex items-center gap-1 text-xs font-medium text-primary">
                        <Eye className="h-3 w-3" />
                        <span>Abrir perfil do advogado</span>
                      </div>
                    </Link>
                  ))
                ) : (
                  <p className="text-sm text-default-500">
                    Nenhum advogado vinculado.
                  </p>
                )}
              </CardBody>
            </Card>

            {cliente.usuario ? (
              <Card className="border border-default-200 xl:col-span-2">
                <CardHeader className="pb-2">
                  <div>
                    <p className="text-sm font-semibold">Acesso do cliente</p>
                    <p className="text-xs text-default-400">
                      Conta vinculada para login no portal.
                    </p>
                  </div>
                </CardHeader>
                <Divider />
                <CardBody className="gap-3 pt-3">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-lg border border-default-200 p-3">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-default-500">
                        Nome da conta
                      </p>
                      <p className="mt-1 text-sm font-semibold text-default-700">
                        {cliente.usuario.firstName || cliente.usuario.lastName
                          ? `${cliente.usuario.firstName || ""} ${
                              cliente.usuario.lastName || ""
                            }`.trim()
                          : "Não informado"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-default-200 p-3">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-default-500">
                        E-mail de acesso
                      </p>
                      <p className="mt-1 text-sm font-semibold text-default-700 break-all">
                        {cliente.usuario.email || "Não informado"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-default-200 p-3">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-default-500">
                        Perfil
                      </p>
                      <div className="mt-2">
                        <Chip size="sm" variant="flat">
                          {cliente.usuario.role}
                        </Chip>
                      </div>
                    </div>
                    <div className="rounded-lg border border-default-200 p-3">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-default-500">
                        Status da conta
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Chip
                          color={cliente.usuario.active ? "success" : "danger"}
                          size="sm"
                          variant="flat"
                        >
                          {cliente.usuario.active ? "Ativa" : "Inativa"}
                        </Chip>
                        <Chip size="sm" variant="flat">
                          Último login:{" "}
                          {cliente.usuario.lastLoginAt
                            ? DateUtils.formatDate(cliente.usuario.lastLoginAt)
                            : "Nunca"}
                        </Chip>
                      </div>
                    </div>
                  </div>
                </CardBody>
              </Card>
            ) : null}

            <Card className="border border-default-200">
              <CardHeader className="pb-2">
                <div>
                  <p className="text-sm font-semibold">Endereços</p>
                  <p className="text-xs text-default-400">
                    Endereços cadastrados para este cliente.
                  </p>
                </div>
              </CardHeader>
              <Divider />
              <CardBody className="gap-3 pt-3">
                {cliente.enderecos && cliente.enderecos.length > 0 ? (
                  cliente.enderecos.map((endereco) => (
                    <div
                      key={endereco.id}
                      className="rounded-lg border border-default-200 p-3"
                    >
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <Chip
                          color={endereco.principal ? "primary" : "default"}
                          size="sm"
                          variant="flat"
                        >
                          {endereco.apelido}
                        </Chip>
                        {endereco.principal ? (
                          <Chip color="success" size="sm" variant="flat">
                            Principal
                          </Chip>
                        ) : null}
                      </div>
                      <p className="text-sm text-default-700">
                        {endereco.logradouro}, {endereco.numero || "s/n"}
                        {endereco.complemento
                          ? ` - ${endereco.complemento}`
                          : ""}
                      </p>
                      <p className="text-xs text-default-500">
                        {endereco.bairro ? `${endereco.bairro} - ` : ""}
                        {endereco.cidade}/{endereco.estado} {endereco.cep || ""}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-default-500">
                    Nenhum endereço cadastrado.
                  </p>
                )}
              </CardBody>
            </Card>

            <Card className="border border-default-200 xl:col-span-2">
              <CardHeader className="pb-2">
                <div>
                  <p className="text-sm font-semibold">Dados bancários</p>
                  <p className="text-xs text-default-400">
                    Contas cadastradas para contratos e repasses.
                  </p>
                </div>
              </CardHeader>
              <Divider />
              <CardBody className="gap-3 pt-3">
                {cliente.dadosBancarios && cliente.dadosBancarios.length > 0 ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {cliente.dadosBancarios.map((conta) => (
                      <div
                        key={conta.id}
                        className="rounded-lg border border-default-200 p-3"
                      >
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <Chip
                            color={conta.principal ? "success" : "default"}
                            size="sm"
                            variant="flat"
                          >
                            {conta.banco.nome}
                          </Chip>
                          <Chip size="sm" variant="flat">
                            {conta.tipoContaBancaria}
                          </Chip>
                          {conta.ativo ? (
                            <Chip color="primary" size="sm" variant="flat">
                              Ativa
                            </Chip>
                          ) : (
                            <Chip color="default" size="sm" variant="flat">
                              Inativa
                            </Chip>
                          )}
                        </div>
                        <p className="text-sm text-default-700">
                          Agência {conta.agencia} | Conta {conta.conta}
                          {conta.digitoConta ? `-${conta.digitoConta}` : ""}
                        </p>
                        <p className="text-xs text-default-500">
                          Titular: {conta.titularNome} ({conta.titularDocumento}
                          )
                        </p>
                        {conta.chavePix ? (
                          <p className="text-xs text-default-500">
                            PIX: {conta.tipoChavePix || "Chave"} -{" "}
                            {conta.chavePix}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-default-500">
                    Nenhum dado bancário cadastrado.
                  </p>
                )}
              </CardBody>
            </Card>
          </div>
        </Tab>

        {/* Tab de Processos */}
        <Tab
          key="processos"
          title={
            <div className="flex items-center gap-2">
              <Scale className="h-4 w-4" />
              <span>Processos</span>
              {cliente.processos && cliente.processos.length > 0 && (
                <Chip color="primary" size="sm" variant="flat">
                  {cliente.processos.length}
                </Chip>
              )}
            </div>
          }
        >
          <div className="mt-4">
            {processosItems.length === 0 ? (
              <Card className="border border-default-200">
                <CardBody className="py-12 text-center">
                  <Scale className="mx-auto h-12 w-12 text-default-300" />
                  <p className="mt-4 text-lg font-semibold text-default-600">
                    Nenhum processo cadastrado
                  </p>
                  <p className="mt-2 text-sm text-default-400">
                    Este cliente ainda não possui processos associados.
                  </p>
                </CardBody>
              </Card>
            ) : (
              <>
                <div className="mb-4 rounded-xl border border-default-200 bg-default-50/70 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                    <div className="flex flex-1 flex-col gap-3 sm:flex-row">
                      <Input
                        isClearable
                        className="flex-1"
                        label="Buscar processos"
                        placeholder="Numero, CNJ, titulo, classe, assunto, area ou advogado"
                        value={processosSearch}
                        onValueChange={setProcessosSearch}
                        onClear={() => setProcessosSearch("")}
                      />
                      <Select
                        className="sm:max-w-xs"
                        label="Status"
                        placeholder="Filtrar por status"
                        selectedKeys={selectedProcessosStatusKeys}
                        onSelectionChange={(keys) => {
                          const nextKey =
                            (Array.from(keys)[0] as ProcessoStatusFilterKey) ||
                            "TODOS";

                          setProcessosStatusFilter(
                            processStatusFilterKeys.has(nextKey)
                              ? nextKey
                              : "TODOS",
                          );
                        }}
                      >
                        {PROCESSOS_STATUS_FILTER_OPTIONS.map((option) => (
                          <SelectItem
                            key={option.key}
                            textValue={option.label}
                          >
                            {option.label}
                          </SelectItem>
                        ))}
                      </Select>
                    </div>
                    <div className="text-sm text-default-500">
                      Mostrando {processosFiltrados.length} de{" "}
                      {processosItems.length} processo
                      {processosItems.length === 1 ? "" : "s"}
                    </div>
                  </div>
                </div>

                {processosFiltrados.length === 0 ? (
                  <Card className="border border-default-200">
                    <CardBody className="py-12 text-center">
                      <Scale className="mx-auto h-12 w-12 text-default-300" />
                      <p className="mt-4 text-lg font-semibold text-default-600">
                        Nenhum processo encontrado
                      </p>
                      <p className="mt-2 text-sm text-default-400">
                        Ajuste a busca ou o filtro de status para localizar os
                        processos deste cliente.
                      </p>
                    </CardBody>
                  </Card>
                ) : (
                  <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {processosPaginados.map((processo) => (
                    <Card
                      key={processo.id}
                      isPressable
                      as={Link}
                      className="border border-default-200 hover:border-primary transition-all hover:shadow-lg cursor-pointer"
                      href={`/processos/${processo.id}`}
                    >
                      <CardHeader className="flex flex-col items-start gap-2 pb-2">
                        <div className="flex w-full items-start justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Chip
                              color={getStatusColor(
                                processo.status as ProcessoStatus,
                              )}
                              size="sm"
                              startContent={getStatusIcon(
                                processo.status as ProcessoStatus,
                              )}
                              variant="flat"
                            >
                              {getStatusLabel(
                                processo.status as ProcessoStatus,
                                processo.arquivamentoTipo as
                                  | "PROVISORIO"
                                  | "DEFINITIVO"
                                  | null
                                  | undefined,
                              )}
                            </Chip>
                            {processo.fase && (
                              <Chip
                                color="secondary"
                                size="sm"
                                startContent={<Flag className="h-3 w-3" />}
                                variant="flat"
                              >
                                {getFaseLabel(processo.fase as ProcessoFase)}
                              </Chip>
                            )}
                            {processo.grau && (
                              <Chip
                                color="default"
                                size="sm"
                                startContent={<Layers className="h-3 w-3" />}
                                variant="flat"
                              >
                                {getGrauLabel(processo.grau as ProcessoGrau)}
                              </Chip>
                            )}
                          </div>
                          {processo._count.procuracoesVinculadas > 0 && (
                            <Chip color="success" size="sm" variant="flat">
                              {processo._count.procuracoesVinculadas} procuração
                              {processo._count.procuracoesVinculadas > 1
                                ? "ões"
                                : ""}
                            </Chip>
                          )}
                        </div>
                        <div className="w-full">
                          <p className="text-sm font-semibold text-default-700">
                            {processo.numero}
                          </p>
                          {processo.numeroCnj &&
                            processo.numeroCnj !== processo.numero && (
                              <p className="text-xs text-default-400">
                                CNJ: {processo.numeroCnj}
                              </p>
                            )}
                          {processo.titulo && (
                            <p className="mt-1 text-xs text-default-500 line-clamp-2">
                              {processo.titulo}
                            </p>
                          )}
                        </div>
                      </CardHeader>
                      <Divider />
                      <CardBody className="gap-3 pt-3">
                        {(processo as any).classeProcessual && (
                          <div className="flex items-center gap-2 text-xs">
                            <Scale className="h-3 w-3 text-default-400" />
                            <span className="text-default-600">
                              Classe: {(processo as any).classeProcessual}
                            </span>
                          </div>
                        )}
                        {formatAssuntosResumo(processo) && (
                          <div className="flex items-start gap-2 text-xs">
                            <FileText className="mt-0.5 h-3 w-3 text-default-400" />
                            <span className="text-default-600">
                              Assuntos: {formatAssuntosResumo(processo)}
                            </span>
                          </div>
                        )}
                        {formatProcedimentoResumo(processo) && (
                          <div className="flex items-start gap-2 text-xs">
                            <Scale className="mt-0.5 h-3 w-3 text-default-400" />
                            <span className="text-default-600">
                              Procedimento: {formatProcedimentoResumo(processo)}
                            </span>
                          </div>
                        )}
                        {processo.area && (
                          <div className="flex items-center gap-2 text-xs">
                            <Briefcase className="h-3 w-3 text-default-400" />
                            <span className="text-default-600">
                              {processo.area.nome}
                            </span>
                          </div>
                        )}
                        {getProcessoResponsaveis(processo).length > 0 && (
                          <div className="flex items-center gap-2 text-xs">
                            <User className="h-3 w-3 text-default-400" />
                            <span className="text-default-600">
                              {formatResponsaveisResumo(processo)}
                            </span>
                          </div>
                        )}
                        {processo.dataDistribuicao && (
                          <div className="flex items-center gap-2 text-xs">
                            <Calendar className="h-3 w-3 text-default-400" />
                            <span className="text-default-600">
                              {DateUtils.formatDate(processo.dataDistribuicao)}
                            </span>
                          </div>
                        )}
                        {processo.prazoPrincipal && (
                          <div className="flex items-center gap-2 text-xs">
                            <Clock className="h-3 w-3 text-warning" />
                            <span className="text-warning-600">
                              Prazo:{" "}
                              {DateUtils.formatDate(processo.prazoPrincipal)}
                            </span>
                          </div>
                        )}

                        <Divider className="my-2" />

                        <div className="flex flex-wrap gap-2">
                          <Chip size="sm" variant="flat">
                            {processo._count.documentos} docs
                          </Chip>
                          <Chip size="sm" variant="flat">
                            {processo._count.eventos} eventos
                          </Chip>
                          <Chip size="sm" variant="flat">
                            {processo._count.movimentacoes} movs
                          </Chip>
                        </div>
                      </CardBody>
                    </Card>
                  ))}
                </div>
                <TabPagination
                  itemLabel="processos"
                  page={processosPage}
                  pageSize={TAB_PAGE_SIZES.processos}
                  totalItems={processosFiltrados.length}
                  totalPages={processosTotalPages}
                  onChange={setProcessosPage}
                />
                  </>
                )}
              </>
            )}
          </div>
        </Tab>

        {/* Tab de Contratos */}
        <Tab
          key="contratos"
          title={
            <div className="flex items-center gap-2">
              <FileSignature className="h-4 w-4" />
              <span>Contratos</span>
              {contratos && contratos.length > 0 && (
                <Chip size="sm" variant="flat">
                  {contratos.length}
                </Chip>
              )}
            </div>
          }
        >
          <div className="mt-4">
            {isLoadingContratos ? (
              <div className="flex justify-center py-12">
                <Spinner size="lg" />
              </div>
            ) : contratosItems.length === 0 ? (
              <Card className="border border-default-200">
                <CardBody className="py-12 text-center">
                  <FileSignature className="mx-auto h-12 w-12 text-default-300" />
                  <p className="mt-4 text-lg font-semibold text-default-600">
                    Nenhum contrato cadastrado
                  </p>
                  <p className="mt-2 text-sm text-default-400">
                    Este cliente ainda não possui contratos.
                  </p>
                </CardBody>
              </Card>
            ) : (
              <>
                <div className="space-y-3">
                  {contratosPaginados.map((contrato: any) => (
                    <Card
                      key={contrato.id}
                      isPressable
                      as={Link}
                      className="cursor-pointer border border-default-200 transition-all hover:border-primary hover:shadow-lg"
                      href={`/contratos/${contrato.id}`}
                    >
                      <CardBody className="gap-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <p className="text-sm font-semibold">
                              {contrato.titulo}
                            </p>
                            {contrato.tipo && (
                              <p className="text-xs text-default-400">
                                {contrato.tipo.nome}
                              </p>
                            )}
                          </div>
                          <Chip
                            color={
                              contrato.status === "ATIVO"
                                ? "success"
                                : "default"
                            }
                            size="sm"
                            variant="flat"
                          >
                            {contrato.status}
                          </Chip>
                        </div>
                        <div className="flex items-center gap-1 text-xs font-medium text-primary">
                          <Eye className="h-3 w-3" />
                          <span>Abrir contrato completo</span>
                        </div>
                        {contrato.valor && (
                          <div className="flex items-center gap-2 text-sm">
                            <span className="text-default-400">Valor:</span>
                            <span className="font-semibold text-default-700">
                              {new Intl.NumberFormat("pt-BR", {
                                style: "currency",
                                currency: "BRL",
                              }).format(contrato.valor)}
                            </span>
                          </div>
                        )}
                        {contrato.processo && (
                          <div className="flex items-center gap-2 text-xs text-default-500">
                            <Scale className="h-3 w-3" />
                            <span>Processo: {contrato.processo.numero}</span>
                          </div>
                        )}
                        {contrato.advogadoResponsavel && (
                          <div className="flex items-center gap-2 text-xs text-default-500">
                            <Users className="h-3 w-3" />
                            <span>
                              Responsável:{" "}
                              {contrato.advogadoResponsavel.usuario.firstName}{" "}
                              {contrato.advogadoResponsavel.usuario.lastName}
                            </span>
                          </div>
                        )}
                        {contrato.dataInicio && (
                          <div className="text-xs text-default-500">
                            Início: {DateUtils.formatDate(contrato.dataInicio)}
                          </div>
                        )}
                        <div className="flex flex-wrap gap-2">
                          <Chip size="sm" variant="flat">
                            {contrato._count?.parcelas || 0} parcelas
                          </Chip>
                          <Chip size="sm" variant="flat">
                            {contrato._count?.faturas || 0} faturas
                          </Chip>
                          <Chip size="sm" variant="flat">
                            {contrato._count?.honorarios || 0} honorários
                          </Chip>
                          <Chip size="sm" variant="flat">
                            {contrato._count?.documentos || 0} docs
                          </Chip>
                        </div>
                      </CardBody>
                    </Card>
                  ))}
                </div>
                <TabPagination
                  itemLabel="contratos"
                  page={contratosPage}
                  pageSize={TAB_PAGE_SIZES.contratos}
                  totalItems={contratosItems.length}
                  totalPages={contratosTotalPages}
                  onChange={setContratosPage}
                />
              </>
            )}
          </div>
        </Tab>

        <Tab
          key="tarefas"
          title={
            <div className="flex items-center gap-2">
              <CheckSquare className="h-4 w-4" />
              <span>Tarefas</span>
              {cliente.tarefas && cliente.tarefas.length > 0 ? (
                <Chip size="sm" variant="flat">
                  {cliente.tarefas.length}
                </Chip>
              ) : null}
            </div>
          }
        >
          <div className="mt-4">
            {tarefasItems.length === 0 ? (
              <Card className="border border-default-200">
                <CardBody className="py-12 text-center">
                  <CheckSquare className="mx-auto h-12 w-12 text-default-300" />
                  <p className="mt-4 text-lg font-semibold text-default-600">
                    Nenhuma tarefa vinculada
                  </p>
                  <p className="mt-2 text-sm text-default-400">
                    Este cliente ainda não possui tarefas associadas.
                  </p>
                </CardBody>
              </Card>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  {tarefasPaginadas.map((tarefa) => (
                    <Card key={tarefa.id} className="border border-default-200">
                      <CardBody className="gap-2">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-semibold">
                            {tarefa.titulo}
                          </p>
                          <Chip
                            color={getTarefaStatusColor(
                              tarefa.status as TarefaStatus,
                            )}
                            size="sm"
                            variant="flat"
                          >
                            {getTarefaStatusLabel(
                              tarefa.status as TarefaStatus,
                            )}
                          </Chip>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Chip
                            color={getTarefaPrioridadeColor(
                              tarefa.prioridade as TarefaPrioridade,
                            )}
                            size="sm"
                            variant="flat"
                          >
                            Prioridade: {tarefa.prioridade}
                          </Chip>
                          {tarefa.dataLimite ? (
                            <Chip size="sm" variant="flat">
                              Limite: {DateUtils.formatDate(tarefa.dataLimite)}
                            </Chip>
                          ) : null}
                        </div>
                        {tarefa.processo ? (
                          <p className="text-xs text-default-500">
                            Processo: {tarefa.processo.numero}
                          </p>
                        ) : null}
                        {tarefa.responsavel ? (
                          <p className="text-xs text-default-500">
                            Responsável: {tarefa.responsavel.firstName}{" "}
                            {tarefa.responsavel.lastName}
                          </p>
                        ) : null}
                        {tarefa.descricao ? (
                          <p className="text-xs text-default-500 line-clamp-2">
                            {tarefa.descricao}
                          </p>
                        ) : null}
                      </CardBody>
                    </Card>
                  ))}
                </div>
                <TabPagination
                  itemLabel="tarefas"
                  page={tarefasPage}
                  pageSize={TAB_PAGE_SIZES.tarefas}
                  totalItems={tarefasItems.length}
                  totalPages={tarefasTotalPages}
                  onChange={setTarefasPage}
                />
              </>
            )}
          </div>
        </Tab>

        <Tab
          key="eventos"
          title={
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4" />
              <span>Eventos</span>
              {cliente.eventos && cliente.eventos.length > 0 ? (
                <Chip size="sm" variant="flat">
                  {cliente.eventos.length}
                </Chip>
              ) : null}
            </div>
          }
        >
          <div className="mt-4">
            {eventosItems.length === 0 ? (
              <Card className="border border-default-200">
                <CardBody className="py-12 text-center">
                  <CalendarDays className="mx-auto h-12 w-12 text-default-300" />
                  <p className="mt-4 text-lg font-semibold text-default-600">
                    Nenhum evento vinculado
                  </p>
                  <p className="mt-2 text-sm text-default-400">
                    Este cliente ainda não possui eventos associados.
                  </p>
                </CardBody>
              </Card>
            ) : (
              <>
                <p className="mb-3 text-xs text-default-500">
                  Histórico completo: exibindo eventos passados e futuros.
                </p>
                <div className="space-y-3">
                  {eventosPaginados.map((evento) => (
                    <Card key={evento.id} className="border border-default-200">
                      <CardBody className="gap-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold">
                              {evento.titulo}
                            </p>
                            <p className="text-xs text-default-500">
                              {formatDateTime(evento.dataInicio)} -{" "}
                              {formatDateTime(evento.dataFim)}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Chip
                              color={getEventoStatusColor(
                                evento.status as EventoStatus,
                              )}
                              size="sm"
                              variant="flat"
                            >
                              {evento.status}
                            </Chip>
                            <Chip size="sm" variant="flat">
                              {evento.tipo}
                            </Chip>
                          </div>
                        </div>
                        {evento.local ? (
                          <p className="text-xs text-default-500">
                            Local: {evento.local}
                          </p>
                        ) : null}
                        {evento.processo ? (
                          <p className="text-xs text-default-500">
                            Processo: {evento.processo.numero}
                          </p>
                        ) : null}
                        {evento.advogadoResponsavel ? (
                          <p className="text-xs text-default-500">
                            Responsável:{" "}
                            {evento.advogadoResponsavel.usuario.firstName}{" "}
                            {evento.advogadoResponsavel.usuario.lastName}
                          </p>
                        ) : null}
                        {evento.descricao ? (
                          <p className="text-xs text-default-500 line-clamp-2">
                            {evento.descricao}
                          </p>
                        ) : null}
                      </CardBody>
                    </Card>
                  ))}
                </div>
                <TabPagination
                  itemLabel="eventos"
                  page={eventosPage}
                  pageSize={TAB_PAGE_SIZES.eventos}
                  totalItems={eventosItems.length}
                  totalPages={eventosTotalPages}
                  onChange={setEventosPage}
                />
              </>
            )}
          </div>
        </Tab>

        <Tab
          key="assinaturas"
          title={
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              <span>Assinaturas</span>
              {cliente.documentoAssinaturas &&
              cliente.documentoAssinaturas.length > 0 ? (
                <Chip size="sm" variant="flat">
                  {cliente.documentoAssinaturas.length}
                </Chip>
              ) : null}
            </div>
          }
        >
          <div className="mt-4">
            {assinaturasItems.length === 0 ? (
              <Card className="border border-default-200">
                <CardBody className="py-12 text-center">
                  <ShieldCheck className="mx-auto h-12 w-12 text-default-300" />
                  <p className="mt-4 text-lg font-semibold text-default-600">
                    Nenhuma assinatura encontrada
                  </p>
                  <p className="mt-2 text-sm text-default-400">
                    Este cliente não possui assinaturas pendentes ou concluídas.
                  </p>
                </CardBody>
              </Card>
            ) : (
              <>
                <div className="space-y-3">
                  {assinaturasPaginadas.map((assinatura) => (
                    <Card
                      key={assinatura.id}
                      className="border border-default-200"
                    >
                      <CardBody className="gap-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold">
                              {assinatura.titulo}
                            </p>
                            <p className="text-xs text-default-500">
                              Documento: {assinatura.documento.nome}
                            </p>
                          </div>
                          <Chip size="sm" variant="flat">
                            {assinatura.status}
                          </Chip>
                        </div>
                        <div className="grid gap-1 text-xs text-default-500 sm:grid-cols-3">
                          <p>Envio: {formatDateTime(assinatura.dataEnvio)}</p>
                          <p>
                            Assinado:{" "}
                            {formatDateTime(assinatura.dataAssinatura)}
                          </p>
                          <p>
                            Expira: {formatDateTime(assinatura.dataExpiracao)}
                          </p>
                        </div>
                        {assinatura.documento.url ? (
                          <Button
                            as="a"
                            color="primary"
                            href={assinatura.documento.url}
                            rel="noopener noreferrer"
                            size="sm"
                            startContent={<Eye className="h-3 w-3" />}
                            target="_blank"
                            variant="flat"
                          >
                            Abrir documento
                          </Button>
                        ) : null}
                      </CardBody>
                    </Card>
                  ))}
                </div>
                <TabPagination
                  itemLabel="assinaturas"
                  page={assinaturasPage}
                  pageSize={TAB_PAGE_SIZES.assinaturas}
                  totalItems={assinaturasItems.length}
                  totalPages={assinaturasTotalPages}
                  onChange={setAssinaturasPage}
                />
              </>
            )}
          </div>
        </Tab>

        {/* Tab de Procurações */}
        <Tab
          key="procuracoes"
          title={
            <div className="flex items-center gap-2">
              <FileSignature className="h-4 w-4" />
              <span>Procurações</span>
              {procuracoes.length > 0 && (
                <Chip color="success" size="sm" variant="flat">
                  {procuracoes.length}
                </Chip>
              )}
            </div>
          }
        >
          <div className="mt-4">
            {isLoadingProcuracoes ? (
              <div className="flex min-h-[200px] items-center justify-center">
                <Spinner size="lg" />
              </div>
            ) : procuracoesItems.length === 0 ? (
              <Card className="border border-default-200">
                <CardBody className="py-12 text-center">
                  <FileSignature className="mx-auto h-12 w-12 text-default-300" />
                  <p className="mt-4 text-lg font-semibold text-default-600">
                    Nenhuma procuração cadastrada
                  </p>
                  <p className="mt-2 text-sm text-default-400">
                    Este cliente ainda não possui procurações associadas.
                  </p>
                </CardBody>
              </Card>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {procuracoesPaginadas.map((procuracao: any) => (
                    <Card
                      key={procuracao.id}
                      isPressable
                      className="cursor-pointer border border-default-200 transition-all hover:border-success hover:shadow-lg"
                      onPress={() =>
                        router.push(`/procuracoes/${procuracao.id}`)
                      }
                    >
                      <CardHeader className="flex flex-col items-start gap-2 pb-2">
                        <div className="flex w-full items-start justify-between">
                          <Chip
                            color={procuracao.ativa ? "success" : "default"}
                            size="sm"
                            startContent={
                              procuracao.ativa ? (
                                <CheckCircle className="h-3 w-3" />
                              ) : (
                                <XCircle className="h-3 w-3" />
                              )
                            }
                            variant="flat"
                          >
                            {procuracao.ativa ? "Ativa" : "Inativa"}
                          </Chip>
                          <Chip
                            color={
                              procuracao.status === "VIGENTE"
                                ? "success"
                                : procuracao.status === "REVOGADA"
                                  ? "danger"
                                  : "warning"
                            }
                            size="sm"
                            variant="flat"
                          >
                            {procuracao.status}
                          </Chip>
                        </div>
                        {procuracao.numero && (
                          <div className="w-full">
                            <p className="text-sm font-semibold text-default-700">
                              #{procuracao.numero}
                            </p>
                          </div>
                        )}
                        <div className="inline-flex items-center gap-1 text-xs font-medium text-success">
                          <Eye className="h-3 w-3" />
                          Abrir procuração completa
                        </div>
                      </CardHeader>
                      <Divider />
                      <CardBody className="gap-3 pt-3">
                        <div className="flex flex-wrap gap-2">
                          <Chip size="sm" variant="flat">
                            {procuracao.poderes?.length || 0} poderes
                          </Chip>
                          <Chip size="sm" variant="flat">
                            {procuracao.documentos?.length || 0} docs
                          </Chip>
                          <Chip size="sm" variant="flat">
                            {procuracao.assinaturas?.length || 0} assinaturas
                          </Chip>
                        </div>
                        {procuracao.outorgados &&
                          procuracao.outorgados.length > 0 && (
                            <div className="space-y-1">
                              <p className="text-xs font-semibold text-default-500">
                                Outorgados:
                              </p>
                              {procuracao.outorgados
                                .slice(0, 2)
                                .map((outorgado: any) => (
                                  <div
                                    key={outorgado.id}
                                    className="flex items-center gap-2 text-xs"
                                  >
                                    <User className="h-3 w-3 text-default-400" />
                                    <span className="text-default-600">
                                      {outorgado.advogado.usuario.firstName}{" "}
                                      {outorgado.advogado.usuario.lastName}
                                    </span>
                                  </div>
                                ))}
                              {procuracao.outorgados.length > 2 && (
                                <p className="text-xs text-default-400">
                                  +{procuracao.outorgados.length - 2} mais
                                </p>
                              )}
                            </div>
                          )}
                        {procuracao.poderes &&
                          procuracao.poderes.length > 0 && (
                            <div className="space-y-1">
                              <p className="text-xs font-semibold text-default-500">
                                Poderes:
                              </p>
                              {procuracao.poderes
                                .slice(0, 2)
                                .map((poder: any) => (
                                  <p
                                    key={poder.id}
                                    className="text-xs text-default-600 line-clamp-1"
                                  >
                                    {poder.titulo ? `${poder.titulo}: ` : ""}
                                    {poder.descricao}
                                  </p>
                                ))}
                              {procuracao.poderes.length > 2 && (
                                <p className="text-xs text-default-400">
                                  +{procuracao.poderes.length - 2} poderes
                                </p>
                              )}
                            </div>
                          )}
                        {procuracao.processos &&
                          procuracao.processos.length > 0 && (
                            <div className="space-y-1">
                              <p className="text-xs font-semibold text-default-500">
                                Processos vinculados:
                              </p>
                              {procuracao.processos
                                .slice(0, 2)
                                .map((proc: any) => (
                                  <div
                                    key={proc.id}
                                    className="flex items-center gap-2 text-xs"
                                  >
                                    <Scale className="h-3 w-3 text-default-400" />
                                    <span className="text-default-600 truncate">
                                      {proc.processo.numero}
                                    </span>
                                  </div>
                                ))}
                              {procuracao.processos.length > 2 && (
                                <p className="text-xs text-default-400">
                                  +{procuracao.processos.length - 2} mais
                                </p>
                              )}
                            </div>
                          )}
                        {procuracao.emitidaEm && (
                          <div className="flex items-center gap-2 text-xs">
                            <Calendar className="h-3 w-3 text-default-400" />
                            <span className="text-default-600">
                              Emitida:{" "}
                              {DateUtils.formatDate(procuracao.emitidaEm)}
                            </span>
                          </div>
                        )}
                        {procuracao.validaAte && (
                          <div className="flex items-center gap-2 text-xs">
                            <Clock className="h-3 w-3 text-default-400" />
                            <span className="text-default-600">
                              Válida até:{" "}
                              {DateUtils.formatDate(procuracao.validaAte)}
                            </span>
                          </div>
                        )}
                        {procuracao.arquivoUrl && (
                          <Button
                            as="a"
                            className="mt-2"
                            color="success"
                            href={procuracao.arquivoUrl}
                            onClick={(event) => event.stopPropagation()}
                            rel="noopener noreferrer"
                            size="sm"
                            startContent={<Eye className="h-3 w-3" />}
                            target="_blank"
                            variant="flat"
                          >
                            Visualizar arquivo
                          </Button>
                        )}
                      </CardBody>
                    </Card>
                  ))}
                </div>
                <TabPagination
                  itemLabel="procurações"
                  page={procuracoesPage}
                  pageSize={TAB_PAGE_SIZES.procuracoes}
                  totalItems={procuracoesItems.length}
                  totalPages={procuracoesTotalPages}
                  onChange={setProcuracoesPage}
                />
              </>
            )}
          </div>
        </Tab>

        {/* Tab de Documentos (TODOS) */}
        <Tab
          key="documentos"
          title={
            <div className="flex items-center gap-2">
              <FileStack className="h-4 w-4" />
              <span>Documentos</span>
              {documentos && documentos.length > 0 && (
                <Chip size="sm" variant="flat">
                  {documentos.length}
                </Chip>
              )}
            </div>
          }
        >
          <div className="mt-4">
            {isLoadingDocumentos ? (
              <div className="flex justify-center py-12">
                <Spinner size="lg" />
              </div>
            ) : documentosItems.length === 0 ? (
              <Card className="border border-default-200">
                <CardBody className="py-12 text-center">
                  <FileStack className="mx-auto h-12 w-12 text-default-300" />
                  <p className="mt-4 text-lg font-semibold text-default-600">
                    Nenhum documento cadastrado
                  </p>
                  <p className="mt-2 text-sm text-default-400">
                    Este cliente ainda não possui documentos.
                  </p>
                </CardBody>
              </Card>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  {documentosPaginados.map((doc: any) => (
                    <Card key={doc.id} className="border border-default-200">
                      <CardBody className="gap-2">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <p className="text-sm font-semibold">
                              {doc.nome || doc.titulo || doc.nomeArquivo}
                            </p>
                            <p className="text-xs text-default-400">
                              {DateUtils.formatDate(doc.createdAt)}
                            </p>
                          </div>
                          {(doc.tamanhoBytes || doc.tamanho) && (
                            <Chip size="sm" variant="flat">
                              {(
                                Number(doc.tamanhoBytes || doc.tamanho) / 1024
                              ).toFixed(2)}{" "}
                              KB
                            </Chip>
                          )}
                        </div>
                        {doc.processo && (
                          <div className="flex items-center gap-1 text-xs text-default-500">
                            <Scale className="h-3 w-3" />
                            <span>Processo: {doc.processo.numero}</span>
                          </div>
                        )}
                        {doc.contrato && (
                          <div className="flex items-center gap-1 text-xs text-default-500">
                            <FileSignature className="h-3 w-3" />
                            <span>Contrato: {doc.contrato.titulo}</span>
                          </div>
                        )}
                        {doc.movimentacao && (
                          <div className="flex items-center gap-1 text-xs text-default-500">
                            <Clock className="h-3 w-3" />
                            <span>Movimentação: {doc.movimentacao.titulo}</span>
                          </div>
                        )}
                        {doc.descricao && (
                          <p className="text-xs text-default-500 line-clamp-2">
                            {doc.descricao}
                          </p>
                        )}
                        {doc.url && (
                          <Button
                            as="a"
                            className="mt-2"
                            color="primary"
                            href={doc.url}
                            rel="noopener noreferrer"
                            size="sm"
                            startContent={<Eye className="h-3 w-3" />}
                            target="_blank"
                            variant="flat"
                          >
                            Visualizar
                          </Button>
                        )}
                      </CardBody>
                    </Card>
                  ))}
                </div>
                <TabPagination
                  itemLabel="documentos"
                  page={documentosPage}
                  pageSize={TAB_PAGE_SIZES.documentos}
                  totalItems={documentosItems.length}
                  totalPages={documentosTotalPages}
                  onChange={setDocumentosPage}
                />
              </>
            )}
          </div>
        </Tab>
      </Tabs>

      {/* Modal de Anexar Documento */}
      <Modal
        footer={
          <div className="flex gap-2">
            <Button variant="light" onPress={() => setIsUploadModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              color="primary"
              isLoading={isUploading}
              startContent={
                !isUploading ? <Upload className="h-4 w-4" /> : undefined
              }
              onPress={handleAnexarDocumento}
            >
              Anexar Documento
            </Button>
          </div>
        }
        isOpen={isUploadModalOpen}
        size="2xl"
        title="📎 Anexar Documento"
        onOpenChange={setIsUploadModalOpen}
      >
        <div className="space-y-4">
          {/* Upload de Arquivo */}
          <div className="rounded-lg border-2 border-dashed border-default-300 p-6 text-center hover:border-primary transition-colors">
            <input
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.xls,.xlsx"
              className="hidden"
              id="file-upload"
              type="file"
              onChange={handleFileChange}
            />
            <label className="cursor-pointer" htmlFor="file-upload">
              {selectedFile ? (
                <div className="space-y-2">
                  <FileText className="mx-auto h-12 w-12 text-success" />
                  <p className="text-sm font-semibold text-success">
                    {selectedFile.name}
                  </p>
                  <p className="text-xs text-default-400">
                    {(selectedFile.size / 1024).toFixed(2)} KB
                  </p>
                  <Button
                    size="sm"
                    variant="flat"
                    onPress={() => setSelectedFile(null)}
                  >
                    Trocar Arquivo
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <Upload className="mx-auto h-12 w-12 text-default-300" />
                  <p className="text-sm font-semibold">
                    Clique para selecionar um arquivo
                  </p>
                  <p className="text-xs text-default-400">
                    PDF, DOC, DOCX, JPG, PNG, XLS, XLSX
                  </p>
                </div>
              )}
            </label>
          </div>

          {/* Formulário */}
          {isUploading ? (
            <UploadProgress
              label="Enviando documento"
              description="O arquivo está sendo anexado ao cadastro do cliente."
            />
          ) : null}

          <Input
            isRequired
            label="Nome do Documento *"
            placeholder="Ex: Contrato Social, RG, CPF..."
            value={uploadFormData.nome}
            onValueChange={(value) =>
              setUploadFormData((prev) => ({ ...prev, nome: value }))
            }
          />

          <Input
            label="Tipo"
            placeholder="Ex: Contrato, Identidade, Comprovante..."
            value={uploadFormData.tipo}
            onValueChange={(value) =>
              setUploadFormData((prev) => ({ ...prev, tipo: value }))
            }
          />

          <Textarea
            label="Descrição"
            maxRows={4}
            minRows={2}
            placeholder="Observações sobre o documento..."
            value={uploadFormData.descricao}
            onValueChange={(value) =>
              setUploadFormData((prev) => ({ ...prev, descricao: value }))
            }
          />

          {/* Vincular a Processo (opcional) */}
          {cliente?.processos && cliente.processos.length > 0 && (
            <Select
              label="Vincular a Processo (opcional)"
              placeholder="Selecione um processo"
              selectedKeys={selectedProcessoKeys}
              onSelectionChange={(keys) =>
                setUploadFormData((prev) => ({
                  ...prev,
                  processoId: (Array.from(keys)[0] as string) || "",
                }))
              }
            >
              {cliente.processos.map((processo) => (
                <SelectItem key={processo.id} textValue={processo.numero}>
                  {processo.numero}
                </SelectItem>
              ))}
            </Select>
          )}

          <Checkbox
            isSelected={uploadFormData.visivelParaCliente}
            onValueChange={(checked) =>
              setUploadFormData((prev) => ({
                ...prev,
                visivelParaCliente: checked,
              }))
            }
          >
            <div className="flex flex-col">
              <span className="text-sm">Visível para o cliente</span>
              <span className="text-xs text-default-400">
                O cliente poderá visualizar este documento na área dele
              </span>
            </div>
          </Checkbox>

          {/* Informações */}
          <div className="rounded-lg bg-primary/5 border border-primary/20 p-3">
            <p className="text-xs text-primary-600">
              💡 O documento será anexado a {cliente.nome}.{" "}
              {uploadFormData.processoId &&
                "Será vinculado ao processo selecionado."}
            </p>
          </div>
        </div>
      </Modal>
    </div>
  );
}
