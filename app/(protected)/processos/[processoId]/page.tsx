"use client";

import {
  useMemo,
  useRef,
  useState,
  useTransition,
  ReactNode,
  useEffect,
} from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Button } from "@heroui/button";
import { Chip } from "@heroui/chip";
import { Divider } from "@heroui/divider";
import { Progress } from "@heroui/progress";
import { Spinner } from "@heroui/spinner";
import { Tabs, Tab } from "@heroui/tabs";
import { Input } from "@heroui/input";
import { Textarea } from "@heroui/input";
import { Checkbox } from "@heroui/checkbox";

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
  MapPin,
  DollarSign,
  Gavel,
  Download,
  Eye,
  FileWarning,
  Edit,
  Plus,
  Trash2,
  Layers,
  Flag,
  Landmark,
  Link2,
  ExternalLink,
  Info,
  Users,
  Video,
  FileSignature,
  UploadCloud,
  UserPlus,
  Search,
  RefreshCw,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { toast } from "@/lib/toast";

import {
  useProcessoDetalhado,
  useDocumentosProcesso,
  useEventosProcesso,
  useMovimentacoesProcesso,
} from "@/app/hooks/use-processos";
import { useJuizes, useJuizesCatalogoPorNome } from "@/app/hooks/use-juizes";
import { usePermissionCheck } from "@/app/hooks/use-permission-check";
import { useProcuracoesDisponiveis } from "@/app/hooks/use-clientes";
import { useHolidayExperienceRollout } from "@/app/hooks/use-holiday-experience";
import { title } from "@/components/primitives";
import {
  ProcessoStatus,
  ProcessoPolo,
  ProcessoPrazoStatus,
  ProcessoFase,
  ProcessoGrau,
  JuizStatus,
  JuizNivel,
  JuizTipoAutoridade,
} from "@/generated/prisma";
import { DateUtils } from "@/app/lib/date-utils";
import {
  createProcessoParte,
  deleteProcessoParte,
  createProcessoPrazo,
  updateProcessoPrazo,
  deleteProcessoPrazo,
  linkProcuracaoAoProcesso,
  unlinkProcuracaoDoProcesso,
  updateProcesso,
  solicitarAtualizacaoJusbrasilProcesso,
} from "@/app/actions/processos";
import { createJuizTenant } from "@/app/actions/juizes";
import { uploadDocumentoExplorer } from "@/app/actions/documentos-explorer";
import { listRegimesPrazo } from "@/app/actions/regimes-prazo";
import { getUsuariosParaSelect } from "@/app/actions/usuarios";
import {
  getProcessDeadlineNotificationPreference,
  setProcessDeadlineNotificationMute,
} from "@/app/actions/processo-deadline-preferences";
import JuizModal from "@/components/juiz-modal";
import { Modal } from "@/components/ui/modal";
import { Select, SelectItem } from "@heroui/react";
import { DateInput } from "@/components/ui/date-input";
import {
  SearchableSelect,
  type SearchableSelectOption,
} from "@/components/searchable-select";
import {
  buildPrazoWorkspaceSummary,
  formatPrazoRelativeLabel,
  getPrazoOperationalBucket,
} from "@/app/lib/prazos/workspace";
import { getProcessoStatusLabel } from "@/app/lib/processos/diff";
import { HolidayImpactPanel } from "@/components/holiday-impact/holiday-impact-panel";

const parteFormInitial: {
  tipoPolo: ProcessoPolo;
  nome: string;
  documento: string;
  email: string;
  telefone: string;
  papel: string;
  observacoes: string;
} = {
  tipoPolo: ProcessoPolo.AUTOR,
  nome: "",
  documento: "",
  email: "",
  telefone: "",
  papel: "",
  observacoes: "",
};

const prazoFormInitial = {
  titulo: "",
  dataVencimento: "",
  descricao: "",
  fundamentoLegal: "",
  regimePrazoId: "",
  responsavelId: "",
  origemMovimentacaoId: "",
  origemEventoId: "",
};

interface RegimePrazoOption {
  id: string;
  nome: string;
  tipo: string;
  tenantId: string | null;
}

interface ResponsavelOption {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  role: string;
}

interface ProcessoDocumentoPreviewState {
  id: string;
  nome: string;
  contentType?: string | null;
  viewUrl: string;
}

type RegimePrazoSelectItem = SearchableSelectOption;
type ResponsavelPrazoSelectItem = SearchableSelectOption;
type PrazoOrigemSelectItem = SearchableSelectOption;

const MAX_PROCESSO_DOCUMENTOS_UPLOAD = 10;
const PROCESSO_UPLOAD_LIMIT_BYTES = {
  pdf: 25 * 1024 * 1024,
  image: 25 * 1024 * 1024,
  audio: 50 * 1024 * 1024,
  video: 100 * 1024 * 1024,
} as const;

type ProcessoUploadFileType = keyof typeof PROCESSO_UPLOAD_LIMIT_BYTES;

const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "tif",
  "tiff",
]);
const AUDIO_EXTENSIONS = new Set([
  "mp3",
  "wav",
  "ogg",
  "m4a",
  "aac",
  "flac",
  "wma",
  "opus",
]);
const VIDEO_EXTENSIONS = new Set([
  "mp4",
  "mov",
  "avi",
  "mkv",
  "webm",
  "mpeg",
  "mpg",
  "m4v",
]);
const PROCESSO_ALLOWED_UPLOAD_EXTENSIONS = [
  "pdf",
  ...Array.from(IMAGE_EXTENSIONS),
  ...Array.from(AUDIO_EXTENSIONS),
  ...Array.from(VIDEO_EXTENSIONS),
];

const PROCESSO_DOCUMENT_TYPE_OPTIONS = [
  { key: "documento_geral", label: "Documento geral" },
  { key: "procuracao", label: "Procuracao" },
  { key: "peticao", label: "Peticao" },
  { key: "contrato", label: "Contrato" },
  { key: "comprovante", label: "Comprovante" },
  { key: "decisao", label: "Decisao" },
  { key: "sentenca", label: "Sentenca" },
  { key: "outros", label: "Outros" },
] as const;

type ProcessoDocumentoClassificacao =
  (typeof PROCESSO_DOCUMENT_TYPE_OPTIONS)[number]["key"];

type ProcessoDocumentoUploadDraft = {
  id: string;
  file: File;
  descricao: string;
  tipo: ProcessoDocumentoClassificacao;
  visivelParaCliente: boolean;
};
const PROCESSO_TAB_KEYS = new Set([
  "informacoes",
  "partes",
  "prazos",
  "documentos",
  "eventos",
  "procuracoes",
]);

function getFileExtension(fileName: string): string {
  const extension = fileName.split(".").pop()?.trim().toLowerCase();

  return extension ?? "";
}

function resolveProcessoUploadType(file: File): ProcessoUploadFileType | null {
  const mimeType = (file.type || "").toLowerCase();
  const extension = getFileExtension(file.name);

  if (mimeType === "application/pdf" || extension === "pdf") {
    return "pdf";
  }

  if (mimeType.startsWith("image/") || IMAGE_EXTENSIONS.has(extension)) {
    return "image";
  }

  if (mimeType.startsWith("audio/") || AUDIO_EXTENSIONS.has(extension)) {
    return "audio";
  }

  if (mimeType.startsWith("video/") || VIDEO_EXTENSIONS.has(extension)) {
    return "video";
  }

  return null;
}

function getProcessoUploadLimitBytes(file: File): number | null {
  const fileType = resolveProcessoUploadType(file);

  return fileType ? PROCESSO_UPLOAD_LIMIT_BYTES[fileType] : null;
}

function formatMegabytes(
  bytes: number,
  options?: {
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
  },
): string {
  return `${new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: options?.minimumFractionDigits ?? 0,
    maximumFractionDigits: options?.maximumFractionDigits ?? 2,
  }).format(bytes / (1024 * 1024))} MB`;
}

function getUploadUsagePercent(fileSize: number, limitBytes: number): number {
  return Math.min(100, (fileSize / limitBytes) * 100);
}

function getDocumentoTipoLabel(tipo?: string | null) {
  const normalizedTipo = (tipo || "").trim().toLowerCase();
  const matched = PROCESSO_DOCUMENT_TYPE_OPTIONS.find(
    (option) => option.key === normalizedTipo,
  );

  if (matched) {
    return matched.label;
  }

  if (!normalizedTipo) {
    return "Documento";
  }

  return normalizedTipo
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

interface InfoItemProps {
  label: string;
  icon: LucideIcon;
  children: ReactNode;
  href?: string;
  external?: boolean;
  highlight?: boolean;
}

interface QuickAction {
  label: string;
  href: string;
  icon: LucideIcon;
  tab: string;
  count?: number;
}

const InfoItem = ({
  label,
  icon: Icon,
  children,
  href,
  external = false,
  highlight = false,
}: InfoItemProps) => {
  const content = (
    <div
      className={`flex items-center gap-2 text-sm font-medium ${highlight ? "text-warning-600" : "text-default-700"}`}
    >
      <Icon
        className={`h-4 w-4 ${highlight ? "text-warning" : "text-default-400"}`}
      />
      <span className="truncate">{children}</span>
    </div>
  );

  const value = href ? (
    external ? (
      <a
        className="block text-primary underline decoration-dotted decoration-primary/40 hover:decoration-solid"
        href={href}
        rel="noopener noreferrer"
        target="_blank"
      >
        {content}
      </a>
    ) : (
      <Link
        className="block text-primary underline decoration-dotted decoration-primary/40 hover:decoration-solid"
        href={href}
      >
        {content}
      </Link>
    )
  ) : (
    content
  );

  return (
    <div className="rounded-2xl border border-default-200/70 bg-default-50/60 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-default-400">
        {label}
      </p>
      <div className="mt-2">{value}</div>
    </div>
  );
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
      return <FileText className="h-4 w-4" />;
    case ProcessoStatus.SUSPENSO:
      return <AlertCircle className="h-4 w-4" />;
    case ProcessoStatus.RASCUNHO:
    default:
      return <FileWarning className="h-4 w-4" />;
  }
};

const getFaseLabel = (fase: ProcessoFase) => {
  switch (fase) {
    case ProcessoFase.PETICAO_INICIAL:
      return "Petição Inicial";
    case ProcessoFase.CITACAO:
      return "Citação";
    case ProcessoFase.INSTRUCAO:
      return "Instrução";
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

const getGrauLabel = (grau: ProcessoGrau) => {
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

const getPrazoStatusColor = (status: ProcessoPrazoStatus) => {
  switch (status) {
    case ProcessoPrazoStatus.ABERTO:
      return "primary";
    case ProcessoPrazoStatus.CONCLUIDO:
      return "success";
    case ProcessoPrazoStatus.PRORROGADO:
      return "warning";
    case ProcessoPrazoStatus.CANCELADO:
      return "default";
    default:
      return "default";
  }
};

const getPrazoStatusLabel = (status: ProcessoPrazoStatus) => {
  switch (status) {
    case ProcessoPrazoStatus.ABERTO:
      return "Aberto";
    case ProcessoPrazoStatus.CONCLUIDO:
      return "Concluído";
    case ProcessoPrazoStatus.PRORROGADO:
      return "Prorrogado";
    case ProcessoPrazoStatus.CANCELADO:
      return "Cancelado";
    default:
      return status;
  }
};

const PRAZO_STATUS_FILTER_OPTIONS: SearchableSelectOption[] = [
  { key: "all", label: "Todos os status" },
  { key: ProcessoPrazoStatus.ABERTO, label: "Abertos" },
  { key: ProcessoPrazoStatus.PRORROGADO, label: "Prorrogados" },
  { key: ProcessoPrazoStatus.CONCLUIDO, label: "Concluídos" },
  { key: ProcessoPrazoStatus.CANCELADO, label: "Cancelados" },
];

const getPrazoBucketColor = (
  bucket: ReturnType<typeof getPrazoOperationalBucket>,
) => {
  switch (bucket) {
    case "overdue":
      return "danger";
    case "today":
      return "warning";
    case "next_7d":
      return "secondary";
    case "next_30d":
      return "primary";
    case "completed":
      return "success";
    default:
      return "default";
  }
};

const getPrazoBucketLabel = (
  bucket: ReturnType<typeof getPrazoOperationalBucket>,
) => {
  switch (bucket) {
    case "overdue":
      return "Em atraso";
    case "today":
      return "Hoje";
    case "next_7d":
      return "Próximos 7 dias";
    case "next_30d":
      return "Até 30 dias";
    case "completed":
      return "Concluído";
    case "canceled":
      return "Cancelado";
    default:
      return "Futuro";
  }
};

function normalizePrazoSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export default function ProcessoDetalhesPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const processoId = params.processoId as string;
  const highlightedPrazoId = searchParams.get("prazoId");

  const { processo, isCliente, isLoading, isError, error, mutate } =
    useProcessoDetalhado(processoId);
  const { documentos, isLoading: isLoadingDocs, mutate: mutateDocumentos } =
    useDocumentosProcesso(processoId);
  const { eventos, isLoading: isLoadingEventos } =
    useEventosProcesso(processoId);
  const { movimentacoes, isLoading: isLoadingMovimentacoes } =
    useMovimentacoesProcesso(processoId);
  const { rollout: holidayExperienceRollout } = useHolidayExperienceRollout();
  const { juizes: autoridadesVisiveis, isLoading: isLoadingAutoridades } =
    useJuizes({
      search: "",
      status: JuizStatus.ATIVO,
      tipoAutoridade: JuizTipoAutoridade.JUIZ,
    }, !isCliente && !processo?.juiz);
  const { procuracoes: procuracoesDisponiveis } = useProcuracoesDisponiveis(
    processo?.cliente?.id ?? null,
  );
  const { data: regimesPrazo = [], isLoading: isLoadingRegimesPrazo } = useSWR(
    isCliente ? null : "processo-prazos-regimes",
    async (): Promise<RegimePrazoOption[]> => {
      const result = await listRegimesPrazo();

      if (!result.success) {
        return [];
      }

      return (result.regimes || []).map((regime) => ({
        id: regime.id,
        nome: regime.nome,
        tipo: regime.tipo,
        tenantId: regime.tenantId ?? null,
      }));
    },
  );
  const {
    data: responsaveisPrazo = [],
    isLoading: isLoadingResponsaveisPrazo,
  } = useSWR(
    isCliente ? null : "processo-prazos-responsaveis",
    async (): Promise<ResponsavelOption[]> => {
      const result = await getUsuariosParaSelect();

      if (!result.success) {
        return [];
      }

      return (result.usuarios || []) as ResponsavelOption[];
    },
  );
  const {
    data: prazoNotificationPreference,
    mutate: mutatePrazoNotificationPreference,
  } = useSWR(
    isCliente ? null : ["processo-deadline-preference", processoId],
    () => getProcessDeadlineNotificationPreference(processoId),
    {
      revalidateOnFocus: false,
    },
  );

  const polos = useMemo(() => Object.values(ProcessoPolo), []);
  const fases = useMemo(() => Object.values(ProcessoFase), []);
  const graus = useMemo(() => Object.values(ProcessoGrau), []);
  const deadlineAlertsMuted =
    prazoNotificationPreference?.success &&
    prazoNotificationPreference.data?.deadlineAlertsMuted === true;
  const holidayProcessEnabled =
    holidayExperienceRollout?.surfaces.find((surface) => surface.key === "process")
      ?.enabled ?? false;

  const [parteForm, setParteForm] = useState(parteFormInitial);
  const [prazoForm, setPrazoForm] = useState(prazoFormInitial);
  const [prazoSearch, setPrazoSearch] = useState("");
  const [prazoStatusFilter, setPrazoStatusFilter] = useState<string>("all");
  const [selectedProcuracaoId, setSelectedProcuracaoId] = useState<string>("");
  const [parteActionId, setParteActionId] = useState<string | null>(null);
  const [prazoActionId, setPrazoActionId] = useState<string | null>(null);
  const [procuracaoActionId, setProcuracaoActionId] = useState<string | null>(
    null,
  );
  const [isCreatingParte, setIsCreatingParte] = useState(false);
  const [isCreatingPrazo, setIsCreatingPrazo] = useState(false);
  const [isUpdatingPrazoMute, setIsUpdatingPrazoMute] = useState(false);
  const [isLinkingProcuracao, setIsLinkingProcuracao] = useState(false);
  const [isJuizModalOpen, setIsJuizModalOpen] = useState(false);
  const [showSelectAutoridade, setShowSelectAutoridade] = useState(false);
  const [showCreateAutoridade, setShowCreateAutoridade] = useState(false);
  const [searchAutoridade, setSearchAutoridade] = useState("");
  const [selectedAutoridadeId, setSelectedAutoridadeId] = useState("");
  const [novoJuizNome, setNovoJuizNome] = useState("");
  const [novoJuizVara, setNovoJuizVara] = useState("");
  const [novoJuizComarca, setNovoJuizComarca] = useState("");
  const [selectedCatalogoJuizId, setSelectedCatalogoJuizId] = useState("");
  const [isAssigningAutoridade, setIsAssigningAutoridade] = useState(false);
  const [isCreatingAutoridade, setIsCreatingAutoridade] = useState(false);
  const [documentoUploads, setDocumentoUploads] = useState<
    ProcessoDocumentoUploadDraft[]
  >([]);
  const [isUploadingDocumento, setIsUploadingDocumento] = useState(false);
  const [isSolicitandoAtualizacaoJusbrasil, setIsSolicitandoAtualizacaoJusbrasil] =
    useState(false);
  const [abaAtual, setAbaAtual] = useState<string>("informacoes");
  const [documentoPreview, setDocumentoPreview] =
    useState<ProcessoDocumentoPreviewState | null>(null);
  const documentoInputRef = useRef<HTMLInputElement | null>(null);
  const [, startTransition] = useTransition();
  const { hasPermission: canUploadProcessoDocumentos } = usePermissionCheck(
    isCliente ? null : "documentos",
    isCliente ? null : "criar",
    {
      enabled: !isCliente,
      enableEarlyAccess: true,
    },
  );
  const { hasPermission: canEditProcessoAutoridade } = usePermissionCheck(
    isCliente ? null : "processos",
    isCliente ? null : "editar",
    {
      enabled: !isCliente,
      enableEarlyAccess: true,
    },
  );

  const prazosOrdenados = useMemo(() => {
    if (!processo?.prazos) return [];

    return [...processo.prazos].sort((a, b) => {
      const diff =
        new Date(a.dataVencimento).getTime() -
        new Date(b.dataVencimento).getTime();

      return diff;
    });
  }, [processo?.prazos]);

  const partesOrdenadas = useMemo(() => {
    if (!processo?.partes) return [];

    return [...processo.partes].sort((a, b) => {
      const poloDiff = a.tipoPolo.localeCompare(b.tipoPolo);

      if (poloDiff !== 0) return poloDiff;

      return a.nome.localeCompare(b.nome);
    });
  }, [processo?.partes]);

  const vinculoIds = useMemo(() => {
    if (!processo?.procuracoesVinculadas) return [] as string[];

    return processo.procuracoesVinculadas.map((p) => p.procuracao.id);
  }, [processo?.procuracoesVinculadas]);

  const procuracoesDisponiveisFiltradas = useMemo(() => {
    if (!procuracoesDisponiveis) return [] as any[];

    if (vinculoIds.length === 0) return procuracoesDisponiveis;

    return procuracoesDisponiveis.filter(
      (proc: any) => !vinculoIds.includes(proc.id),
    );
  }, [procuracoesDisponiveis, vinculoIds]);

  const autoridadesDisponiveis = useMemo(
    () =>
      autoridadesVisiveis.filter(
        (autoridade) =>
          autoridade.tipoAutoridade === JuizTipoAutoridade.JUIZ &&
          autoridade.status === JuizStatus.ATIVO,
      ),
    [autoridadesVisiveis],
  );

  const autoridadesFiltradas = useMemo(() => {
    const termo = searchAutoridade.trim().toLowerCase();

    if (!termo) {
      return autoridadesDisponiveis;
    }

    return autoridadesDisponiveis.filter((autoridade) => {
      const nome = `${autoridade.nome} ${autoridade.nomeCompleto || ""}`
        .toLowerCase();
      const subtitulo = `${autoridade.vara || ""} ${autoridade.comarca || ""}`
        .toLowerCase();

      return nome.includes(termo) || subtitulo.includes(termo);
    });
  }, [autoridadesDisponiveis, searchAutoridade]);

  const autoridadeIdSet = useMemo(
    () => new Set(autoridadesFiltradas.map((autoridade) => autoridade.id)),
    [autoridadesFiltradas],
  );

  const selectedAutoridadeKeys =
    selectedAutoridadeId && autoridadeIdSet.has(selectedAutoridadeId)
      ? [selectedAutoridadeId]
      : [];
  const regimePrazoItems = useMemo<RegimePrazoSelectItem[]>(
    () => [
      { key: "__none__", label: "Sem regime" },
      ...regimesPrazo.map((regime) => ({
        key: regime.id,
        label: regime.nome,
        textValue: `${regime.nome} ${regime.tipo}`,
        description: regime.tipo,
      })),
    ],
    [regimesPrazo],
  );
  const responsavelPrazoItems = useMemo<ResponsavelPrazoSelectItem[]>(
    () => [
      {
        key: "__none__",
        label: "Sem responsável definido",
      },
      ...responsaveisPrazo.map((responsavel) => {
        const nome =
          `${responsavel.firstName || ""} ${responsavel.lastName || ""}`.trim();

        return {
          key: responsavel.id,
          label: nome || responsavel.email,
          textValue: `${nome || responsavel.email} ${responsavel.email} ${responsavel.role}`,
          description: `${responsavel.email} • ${responsavel.role}`,
        };
      }),
    ],
    [responsaveisPrazo],
  );
  const andamentoPrazoItems = useMemo<PrazoOrigemSelectItem[]>(
    () => [
      {
        key: "__none__",
        label: "Sem andamento vinculado",
      },
      ...movimentacoes.map((movimentacao) => ({
        key: movimentacao.id,
        label: movimentacao.titulo,
        textValue: `${movimentacao.titulo} ${movimentacao.tipo ?? ""} ${movimentacao.prioridade ?? ""}`,
        description: DateUtils.formatDate(movimentacao.dataMovimentacao),
      })),
    ],
    [movimentacoes],
  );
  const eventoPrazoItems = useMemo<PrazoOrigemSelectItem[]>(
    () => [
      {
        key: "__none__",
        label: "Sem evento vinculado",
      },
      ...eventos.map((evento) => ({
        key: evento.id,
        label: evento.titulo,
        textValue: `${evento.titulo} ${evento.tipo ?? ""} ${evento.local ?? ""}`,
        description: DateUtils.formatDate(evento.dataInicio),
      })),
    ],
    [eventos],
  );
  const prazosSummary = useMemo(
    () => buildPrazoWorkspaceSummary(prazosOrdenados),
    [prazosOrdenados],
  );
  const prazosFiltrados = useMemo(() => {
    const normalizedSearch = normalizePrazoSearch(prazoSearch);

    return prazosOrdenados.filter((prazo) => {
      if (prazoStatusFilter !== "all" && prazo.status !== prazoStatusFilter) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const haystack = normalizePrazoSearch(
        [
          prazo.titulo,
          prazo.descricao ?? "",
          prazo.fundamentoLegal ?? "",
          prazo.responsavel?.firstName ?? "",
          prazo.responsavel?.lastName ?? "",
          prazo.regimePrazo?.nome ?? "",
          prazo.origemMovimentacao?.titulo ?? "",
          prazo.origemEvento?.titulo ?? "",
        ].join(" "),
      );

      return haystack.includes(normalizedSearch);
    });
  }, [prazoSearch, prazoStatusFilter, prazosOrdenados]);

  const {
    opcoes: catalogoGlobalAutoridades,
    isLoading: isLoadingCatalogoGlobal,
  } = useJuizesCatalogoPorNome(
    novoJuizNome,
    !isCliente && showCreateAutoridade && novoJuizNome.trim().length >= 3,
  );

  const catalogoGlobalJuizes = useMemo(
    () =>
      catalogoGlobalAutoridades.filter(
        (autoridade) =>
          !autoridade.tipoAutoridade ||
          autoridade.tipoAutoridade === JuizTipoAutoridade.JUIZ,
      ),
    [catalogoGlobalAutoridades],
  );

  const selectedCatalogoJuiz = useMemo(
    () =>
      catalogoGlobalJuizes.find(
        (autoridade) => autoridade.id === selectedCatalogoJuizId,
      ) ?? null,
    [catalogoGlobalJuizes, selectedCatalogoJuizId],
  );

  useEffect(() => {
    const tabFromUrl = searchParams.get("tab");

    if (!tabFromUrl || !PROCESSO_TAB_KEYS.has(tabFromUrl)) {
      return;
    }

    if (tabFromUrl !== abaAtual) {
      setAbaAtual(tabFromUrl);
    }
  }, [searchParams, abaAtual]);

  useEffect(() => {
    if (abaAtual !== "prazos" || !highlightedPrazoId) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const target = document.getElementById(
        `processo-prazo-${highlightedPrazoId}`,
      );

      target?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 160);

    return () => window.clearTimeout(timeoutId);
  }, [abaAtual, highlightedPrazoId, prazosFiltrados.length]);

  const processoLoadErrorMessage =
    error instanceof Error && error.message.trim().length > 0
      ? error.message
      : null;

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Spinner label="Carregando processo..." size="lg" />
      </div>
    );
  }

  if (isError || !processo) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center gap-4">
        <AlertCircle className="h-12 w-12 text-danger" />
        <p className="text-lg font-semibold text-danger">
          Erro ao carregar processo
        </p>
        {processoLoadErrorMessage &&
        processoLoadErrorMessage !== "Erro ao carregar processo" ? (
          <p className="max-w-xl text-center text-sm text-default-600">
            {processoLoadErrorMessage}
          </p>
        ) : null}
        <Button color="primary" onPress={() => router.back()}>
          Voltar
        </Button>
      </div>
    );
  }

  const faseLabel = processo.fase ? getFaseLabel(processo.fase) : null;
  const grauLabel = processo.grau ? getGrauLabel(processo.grau) : null;
  const pastaUrl = processo.pastaCompartilhadaUrl;
  const clientesVinculados =
    processo.clientesVinculados && processo.clientesVinculados.length > 0
      ? processo.clientesVinculados
      : processo.cliente
        ? [processo.cliente]
        : [];
  const responsaveisProcesso =
    processo.advogadosResponsaveis && processo.advogadosResponsaveis.length > 0
      ? processo.advogadosResponsaveis
      : processo.advogadoResponsavel
        ? [processo.advogadoResponsavel]
        : [];
  const clienteResumo = clientesVinculados
    .map((cliente) => cliente.nome)
    .filter(Boolean)
    .join(", ");
  const responsaveisResumo = responsaveisProcesso
    .map((advogado) =>
      [advogado.usuario?.firstName, advogado.usuario?.lastName]
        .filter(Boolean)
        .join(" ")
        .trim(),
    )
    .filter(Boolean)
    .join(", ");
  const clienteLink = clientesVinculados[0]?.id
    ? `/clientes/${clientesVinculados[0].id}`
    : undefined;
  const advogadoLink = responsaveisProcesso[0]?.id
    ? `/advogados/${responsaveisProcesso[0].id}`
    : undefined;

  const quickActions: QuickAction[] = [
    {
      label: "Informações",
      href: "#processo-informacoes",
      icon: Info,
      tab: "informacoes",
    },
    {
      label: "Prazos",
      href: "#processo-prazos",
      icon: Clock,
      tab: "prazos",
      count: prazosOrdenados.length,
    },
    {
      label: "Documentos",
      href: "#processo-documentos",
      icon: FileText,
      tab: "documentos",
      count: processo._count?.documentos ?? 0,
    },
    {
      label: "Eventos",
      href: "#processo-eventos",
      icon: Calendar,
      tab: "eventos",
      count: processo._count?.eventos ?? 0,
    },
    {
      label: "Procurações",
      href: "#processo-procuracoes",
      icon: FileSignature,
      tab: "procuracoes",
      count: processo.procuracoesVinculadas.length,
    },
  ];

  const handleQuickAction = (action: QuickAction) => {
    setAbaAtual(action.tab);
    setTimeout(() => {
      const section = document.querySelector(action.href);
      if (section) {
        section.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 80);
  };

  const handleRefresh = () =>
    startTransition(() => {
      mutate();
    });

  const isDocumentoPreviewInline = (
    nome?: string | null,
    contentType?: string | null,
  ) => {
    const normalizedContentType = (contentType || "").toLowerCase();

    if (
      normalizedContentType.startsWith("image/") ||
      normalizedContentType === "application/pdf" ||
      normalizedContentType.startsWith("text/")
    ) {
      return true;
    }

    const normalizedName = (nome || "").toLowerCase();

    return [".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".txt"].some(
      (extension) => normalizedName.endsWith(extension),
    );
  };

  const handleOpenDocumentoPreview = (doc: {
    id: string;
    nome: string;
    contentType?: string | null;
  }) => {
    setDocumentoPreview({
      id: doc.id,
      nome: doc.nome,
      contentType: doc.contentType ?? null,
      viewUrl: `/api/documentos/${doc.id}/view`,
    });
  };

  const handleSolicitarAtualizacaoJusbrasil = async () => {
    setIsSolicitandoAtualizacaoJusbrasil(true);
    try {
      const result = await solicitarAtualizacaoJusbrasilProcesso(processoId, {
        includeAttachments: false,
      });

      if (!result.success) {
        toast.error(
          result.error || "Nao foi possivel solicitar atualizacao no tribunal",
        );
        return;
      }

      toast.success(
        result.message ||
          "Atualizacao no tribunal solicitada com sucesso via Jusbrasil.",
      );
    } finally {
      setIsSolicitandoAtualizacaoJusbrasil(false);
    }
  };

  const handleCreateParte = async () => {
    if (!parteForm.nome.trim()) {
      toast.error("Informe o nome da parte");

      return;
    }

    setIsCreatingParte(true);
    try {
      const result = await createProcessoParte(processoId, {
        tipoPolo: parteForm.tipoPolo,
        nome: parteForm.nome.trim(),
        documento: parteForm.documento.trim() || undefined,
        email: parteForm.email.trim() || undefined,
        telefone: parteForm.telefone.trim() || undefined,
        papel: parteForm.papel.trim() || undefined,
        observacoes: parteForm.observacoes.trim() || undefined,
      });

      if (result.success) {
        toast.success("Parte adicionada");
        setParteForm(parteFormInitial);
        handleRefresh();
      } else {
        toast.error(result.error || "Erro ao criar parte");
      }
    } catch (error) {
      toast.error("Erro ao criar parte");
    } finally {
      setIsCreatingParte(false);
    }
  };

  const handleDeleteParte = async (parteId: string) => {
    setParteActionId(parteId);
    try {
      const result = await deleteProcessoParte(parteId);

      if (result.success) {
        toast.success("Parte removida");
        handleRefresh();
      } else {
        toast.error(result.error || "Erro ao remover parte");
      }
    } catch (error) {
      toast.error("Erro ao remover parte");
    } finally {
      setParteActionId(null);
    }
  };

  const handleCreatePrazo = async () => {
    if (!prazoForm.titulo.trim()) {
      toast.error("Informe o título do prazo");

      return;
    }

    if (!prazoForm.dataVencimento) {
      toast.error("Informe a data de vencimento");

      return;
    }

    setIsCreatingPrazo(true);
    try {
      const result = await createProcessoPrazo(processoId, {
        titulo: prazoForm.titulo.trim(),
        dataVencimento: prazoForm.dataVencimento,
        descricao: prazoForm.descricao.trim() || undefined,
        fundamentoLegal: prazoForm.fundamentoLegal.trim() || undefined,
        regimePrazoId: prazoForm.regimePrazoId || null,
        responsavelId: prazoForm.responsavelId || null,
        origemMovimentacaoId: prazoForm.origemMovimentacaoId || null,
        origemEventoId: prazoForm.origemEventoId || null,
      });

      if (result.success) {
        toast.success("Prazo criado e notificação enviada");
        setPrazoForm(prazoFormInitial);
        handleRefresh();
      } else {
        toast.error(result.error || "Erro ao criar prazo");
      }
    } catch (error) {
      toast.error("Erro ao criar prazo");
    } finally {
      setIsCreatingPrazo(false);
    }
  };

  const handlePrazoStatus = async (
    prazoId: string,
    status: ProcessoPrazoStatus,
  ) => {
    setPrazoActionId(prazoId);
    try {
      const result = await updateProcessoPrazo(prazoId, {
        status,
        dataCumprimento:
          status === ProcessoPrazoStatus.CONCLUIDO ? new Date() : null,
      });

      if (result.success) {
        toast.success("Prazo atualizado");
        handleRefresh();
      } else {
        toast.error(result.error || "Erro ao atualizar prazo");
      }
    } catch (error) {
      toast.error("Erro ao atualizar prazo");
    } finally {
      setPrazoActionId(null);
    }
  };

  const handleDeletePrazo = async (prazoId: string) => {
    setPrazoActionId(prazoId);
    try {
      const result = await deleteProcessoPrazo(prazoId);

      if (result.success) {
        toast.success("Prazo removido");
        handleRefresh();
      } else {
        toast.error(result.error || "Erro ao remover prazo");
      }
    } catch (error) {
      toast.error("Erro ao remover prazo");
    } finally {
      setPrazoActionId(null);
    }
  };

  const handleTogglePrazoNotifications = async () => {
    setIsUpdatingPrazoMute(true);

    try {
      const result = await setProcessDeadlineNotificationMute({
        processoId,
        muted: !deadlineAlertsMuted,
      });

      if (!result.success) {
        throw new Error(
          result.error || "Nao foi possivel atualizar os alertas do processo.",
        );
      }

      await mutatePrazoNotificationPreference();
      toast.success(
        !deadlineAlertsMuted
          ? "Alertas de prazo deste processo foram silenciados."
          : "Alertas de prazo deste processo foram reativados.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Falha ao atualizar alertas de prazo do processo.",
      );
    } finally {
      setIsUpdatingPrazoMute(false);
    }
  };

  const handleLinkProcuracao = async () => {
    if (!selectedProcuracaoId) {
      toast.error("Selecione uma procuração");

      return;
    }

    setIsLinkingProcuracao(true);
    try {
      const result = await linkProcuracaoAoProcesso(
        processoId,
        selectedProcuracaoId,
      );

      if (result.success) {
        toast.success("Procuração vinculada");
        setSelectedProcuracaoId("");
        handleRefresh();
      } else {
        toast.error(result.error || "Erro ao vincular procuração");
      }
    } catch (error) {
      toast.error("Erro ao vincular procuração");
    } finally {
      setIsLinkingProcuracao(false);
    }
  };

  const handleUnlinkProcuracao = async (procuracaoId: string) => {
    setProcuracaoActionId(procuracaoId);
    try {
      const result = await unlinkProcuracaoDoProcesso(processoId, procuracaoId);

      if (result.success) {
        toast.success("Procuração desvinculada");
        handleRefresh();
      } else {
        toast.error(result.error || "Erro ao desvincular procuração");
      }
    } catch (error) {
      toast.error("Erro ao desvincular procuração");
    } finally {
      setProcuracaoActionId(null);
    }
  };

  const handleVincularAutoridadeExistente = async () => {
    if (!selectedAutoridadeId) {
      toast.error("Selecione uma autoridade para vincular ao processo");

      return;
    }

    setIsAssigningAutoridade(true);
    try {
      const result = await updateProcesso(processoId, {
        juizId: selectedAutoridadeId,
      });

      if (!result.success) {
        toast.error(result.error || "Não foi possível vincular a autoridade");
        return;
      }

      toast.success("Autoridade vinculada ao processo");
      setSelectedAutoridadeId("");
      setShowSelectAutoridade(false);
      setShowCreateAutoridade(false);
      setSearchAutoridade("");
      handleRefresh();
    } catch (error) {
      toast.error("Erro ao vincular autoridade");
    } finally {
      setIsAssigningAutoridade(false);
    }
  };

  const handleCriarAutoridadeERelacionar = async () => {
    const nome = novoJuizNome.trim();

    if (!nome) {
      toast.error("Informe o nome da autoridade");

      return;
    }

    setIsCreatingAutoridade(true);
    try {
      const result = await createJuizTenant({
        nome,
        juizBaseId: selectedCatalogoJuiz?.id,
        tipoAutoridade:
          selectedCatalogoJuiz?.tipoAutoridade ?? JuizTipoAutoridade.JUIZ,
        status: JuizStatus.ATIVO,
        nivel: JuizNivel.JUIZ_TITULAR,
        especialidades: [],
        vara: novoJuizVara.trim() || undefined,
        comarca: novoJuizComarca.trim() || undefined,
      });

      if (!result.success || !result.juiz?.id) {
        toast.error(result.error || "Não foi possível cadastrar a autoridade");
        return;
      }

      const vinculo = await updateProcesso(processoId, {
        juizId: result.juiz.id,
      });

      if (!vinculo.success) {
        toast.error(
          vinculo.error ||
            "Autoridade criada, mas não foi possível vinculá-la ao processo",
        );
        return;
      }

      toast.success("Autoridade cadastrada e vinculada ao processo");
      setNovoJuizNome("");
      setNovoJuizVara("");
      setNovoJuizComarca("");
      setSelectedCatalogoJuizId("");
      setShowCreateAutoridade(false);
      setShowSelectAutoridade(false);
      handleRefresh();
    } catch (error) {
      toast.error("Erro ao cadastrar autoridade");
    } finally {
      setIsCreatingAutoridade(false);
    }
  };

  const handleUploadDocumento = async () => {
    if (!canUploadProcessoDocumentos) {
      toast.error("Você não tem permissão para anexar documentos");

      return;
    }

    if (!documentoUploads.length) {
      toast.error("Selecione ao menos um arquivo para anexar ao processo");

      return;
    }

    if (!processo?.cliente?.id) {
      toast.error("Cliente do processo não encontrado");

      return;
    }

    setIsUploadingDocumento(true);
    try {
      let successCount = 0;
      let procuracoesCriadas = 0;
      const failedUploads: Array<{
        draft: ProcessoDocumentoUploadDraft;
        reason: string;
      }> = [];

      for (const draft of documentoUploads) {
        const formData = new FormData();

        formData.append("file", draft.file);
        formData.append("processoIds", processoId);

        const result = await uploadDocumentoExplorer(
          processo.cliente.id,
          processoId,
          formData,
          {
            description: draft.descricao.trim() || undefined,
            visivelParaCliente: draft.visivelParaCliente,
            tipo: draft.tipo,
            autoCreateLinkedProcuracao: draft.tipo === "procuracao",
            allowedExtensions: PROCESSO_ALLOWED_UPLOAD_EXTENSIONS,
          },
        );

        if (result.success) {
          successCount += 1;
          if (result.procuracaoId) {
            procuracoesCriadas += 1;
          }
          continue;
        }

        failedUploads.push({
          draft,
          reason: result.error || "Falha no upload",
        });
      }

      if (successCount > 0) {
        const uploadSummary =
          procuracoesCriadas > 0
            ? `${successCount} documento(s) anexado(s) e ${procuracoesCriadas} procuracao(oes) vinculada(s)`
            : `${successCount} documento(s) anexado(s) ao processo com sucesso`;

        toast.success(uploadSummary);
      }

      if (failedUploads.length > 0) {
        toast.error(
          `Falha em ${failedUploads.length} arquivo(s). Exemplo: ${failedUploads[0].draft.file.name} (${failedUploads[0].reason})`,
        );
      }

      setDocumentoUploads(failedUploads.map((item) => item.draft));
      if (documentoInputRef.current && failedUploads.length === 0) {
        documentoInputRef.current.value = "";
      }

      if (successCount > 0) {
        await Promise.all([mutateDocumentos(), mutate()]);
      }
    } catch (error) {
      toast.error("Erro ao anexar documento");
    } finally {
      setIsUploadingDocumento(false);
    }
  };

  const handleSelectDocumentoFiles = (files: FileList | null) => {
    const selectedFiles = Array.from(files ?? []);

    if (selectedFiles.length === 0) {
      setDocumentoUploads([]);
      return;
    }

    const limitedFiles =
      selectedFiles.length > MAX_PROCESSO_DOCUMENTOS_UPLOAD
        ? selectedFiles.slice(0, MAX_PROCESSO_DOCUMENTOS_UPLOAD)
        : selectedFiles;

    if (selectedFiles.length > MAX_PROCESSO_DOCUMENTOS_UPLOAD) {
      toast.error(
        `Máximo de ${MAX_PROCESSO_DOCUMENTOS_UPLOAD} arquivos por envio`,
      );
    }

    const validFiles: File[] = [];
    const rejected: string[] = [];

    for (const file of limitedFiles) {
      const fileType = resolveProcessoUploadType(file);

      if (!fileType) {
        rejected.push(`${file.name} (formato não permitido)`);
        continue;
      }

      const limitBytes = PROCESSO_UPLOAD_LIMIT_BYTES[fileType];
      if (file.size > limitBytes) {
        rejected.push(
          `${file.name} (limite ${formatMegabytes(limitBytes)} para ${fileType})`,
        );
        continue;
      }

      validFiles.push(file);
    }

    if (rejected.length > 0) {
      toast.error(
        `${rejected.length} arquivo(s) rejeitado(s). Exemplo: ${rejected[0]}`,
      );
    }

    setDocumentoUploads(
      validFiles.map((file, index) => ({
        id: `${file.name}-${file.size}-${file.lastModified}-${index}`,
        file,
        descricao: "",
        tipo: "documento_geral",
        visivelParaCliente: true,
      })),
    );
  };

  const handleUpdateDocumentoUpload = (
    uploadId: string,
    patch: Partial<ProcessoDocumentoUploadDraft>,
  ) => {
    setDocumentoUploads((current) =>
      current.map((item) =>
        item.id === uploadId
          ? {
              ...item,
              ...patch,
            }
          : item,
      ),
    );
  };

  const handleRemoveDocumentoUpload = (uploadId: string) => {
    setDocumentoUploads((current) => {
      const next = current.filter((item) => item.id !== uploadId);

      if (documentoInputRef.current && next.length === 0) {
        documentoInputRef.current.value = "";
      }

      return next;
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <Button
          startContent={<ArrowLeft className="h-4 w-4" />}
          variant="light"
          onPress={() => router.back()}
        >
          Voltar
        </Button>
        {!isCliente && (
          <div className="flex gap-2">
            <Button
              isLoading={isSolicitandoAtualizacaoJusbrasil}
              startContent={
                isSolicitandoAtualizacaoJusbrasil ? null : (
                  <RefreshCw className="h-4 w-4" />
                )
              }
              variant="flat"
              onPress={handleSolicitarAtualizacaoJusbrasil}
            >
              Atualizar no tribunal
            </Button>
            <Button
              as={Link}
              href={`/processos/${processoId}/editar`}
              startContent={<Edit className="h-4 w-4" />}
              variant="bordered"
            >
              Editar Processo
            </Button>
          </div>
        )}
      </div>

      <Card className="border border-default-200">
        <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-start gap-4">
            <div className="rounded-2xl bg-primary/10 p-3">
              <Scale className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-default-400">
                Processo
              </p>
              <h1 className={title({ size: "md" })}>{processo.numero}</h1>
              {processo.numeroCnj && processo.numeroCnj !== processo.numero ? (
                <p className="text-xs text-default-500">CNJ: {processo.numeroCnj}</p>
              ) : null}
              {processo.titulo && (
                <p className="mt-1 text-sm text-default-500">{processo.titulo}</p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Chip
              color={getStatusColor(processo.status)}
              size="lg"
              startContent={getStatusIcon(processo.status)}
              variant="flat"
            >
              {getStatusLabel(processo.status, processo.arquivamentoTipo)}
            </Chip>
            {faseLabel && (
              <Chip
                color="secondary"
                size="lg"
                startContent={<Flag className="h-3 w-3" />}
                variant="flat"
              >
                {faseLabel}
              </Chip>
            )}
            {grauLabel && (
              <Chip
                color="default"
                size="lg"
                startContent={<Layers className="h-3 w-3" />}
                variant="flat"
              >
                {grauLabel}
              </Chip>
            )}
            {processo.segredoJustica && (
              <Chip color="warning" size="lg" variant="flat">
                Segredo de Justiça
              </Chip>
            )}
          </div>
        </CardHeader>
        <Divider />
        <CardBody className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
            <div className="grid gap-3 sm:grid-cols-2">
              {processo.area && (
                <InfoItem icon={Briefcase} label="Área de atuação">
                  {processo.area.nome}
                </InfoItem>
              )}
              {clientesVinculados.length > 0 && (
                <InfoItem
                  icon={
                    clientesVinculados[0]?.tipoPessoa === "JURIDICA"
                      ? Building2
                      : User
                  }
                  label={clientesVinculados.length > 1 ? "Clientes vinculados" : "Cliente"}
                  href={clienteLink}
                >
                  {clienteResumo}
                </InfoItem>
              )}
              {responsaveisProcesso.length > 0 && (
                <InfoItem
                  icon={User}
                  label={
                    responsaveisProcesso.length > 1
                      ? "Advogados responsáveis"
                      : "Advogado responsável"
                  }
                  href={advogadoLink}
                >
                  {responsaveisResumo}
                </InfoItem>
              )}
              {processo.vara && (
                <InfoItem icon={Gavel} label="Vara">
                  {processo.vara}
                </InfoItem>
              )}
              {processo.comarca && (
                <InfoItem icon={MapPin} label="Comarca">
                  {processo.comarca}
                </InfoItem>
              )}
              {processo.valorCausa && (
                <InfoItem icon={DollarSign} label="Valor da causa">
                  {Number(processo.valorCausa).toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}
                </InfoItem>
              )}
              {processo.dataDistribuicao && (
                <InfoItem icon={Calendar} label="Distribuído em">
                  {DateUtils.formatDate(processo.dataDistribuicao)}
                </InfoItem>
              )}
              {processo.prazoPrincipal && (
                <InfoItem
                  icon={Clock}
                  label="Prazo principal"
                  highlight
                >
                  {DateUtils.formatDate(processo.prazoPrincipal)}
                </InfoItem>
              )}
              {processo.orgaoJulgador && (
                <InfoItem icon={Landmark} label="Órgão julgador">
                  {processo.orgaoJulgador}
                </InfoItem>
              )}
              {pastaUrl && (
                <InfoItem
                  external
                  href={pastaUrl}
                  icon={Link2}
                  label="Pasta compartilhada"
                >
                  Abrir arquivos
                </InfoItem>
              )}
            </div>
            <div className="space-y-3 rounded-2xl border border-default-200/80 bg-default-50/60 p-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-default-400">
                  Atalhos rápidos
                </p>
                <p className="text-xs text-default-500">
                  Vá direto para documentos, eventos, prazos e vínculos.
                </p>
              </div>
              <div className="grid gap-2">
                {quickActions.map((action) => (
                  <Button
                    key={action.href}
                    color="primary"
                    radius="md"
                    size="sm"
                    variant="flat"
                    className="justify-between"
                    onPress={() => handleQuickAction(action)}
                  >
                    <span className="flex items-center gap-2">
                      <action.icon className="h-4 w-4" />
                      {action.label}
                    </span>
                    {typeof action.count === "number" ? (
                      <Chip size="sm" variant="flat">
                        {action.count}
                      </Chip>
                    ) : null}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      <Tabs
        aria-label="Informações do Processo"
        color="primary"
        selectedKey={abaAtual}
        variant="underlined"
        onSelectionChange={(key) => setAbaAtual(key as string)}
      >
        <Tab
          key="informacoes"
          title={
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4" />
              <span>Informações</span>
            </div>
          }
        >
          <div
            className="mt-4 space-y-4 scroll-mt-24"
            id="processo-informacoes"
          >
            {!isCliente && (
              <div className="flex justify-end">
                <Button
                  as={Link}
                  color="primary"
                  href={`/procuracoes/novo?clienteId=${processo.cliente.id}`}
                  size="sm"
                  startContent={<Plus className="h-3 w-3" />}
                >
                  Nova procuração
                </Button>
              </div>
            )}

            <Card className="border border-default-200">
              <CardHeader>
                <h3 className="text-lg font-semibold">Dados gerais</h3>
              </CardHeader>
              <Divider />
              <CardBody className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  {processo.descricao && (
                    <div className="md:col-span-2">
                      <p className="text-xs font-semibold uppercase text-default-400">
                        Descrição
                      </p>
                      <p className="mt-1 text-sm text-default-600">
                        {processo.descricao}
                      </p>
                    </div>
                  )}

                  {processo.classeProcessual && (
                    <div>
                      <p className="text-xs font-semibold uppercase text-default-400">
                        Classe Processual
                      </p>
                      <p className="mt-1 text-sm text-default-600">
                        {processo.classeProcessual}
                      </p>
                    </div>
                  )}

                  {processo.rito && (
                    <div>
                      <p className="text-xs font-semibold uppercase text-default-400">
                        Rito
                      </p>
                      <p className="mt-1 text-sm text-default-600">
                        {processo.rito}
                      </p>
                    </div>
                  )}

                  {processo.numeroInterno && (
                    <div>
                      <p className="text-xs font-semibold uppercase text-default-400">
                        Número interno
                      </p>
                      <p className="mt-1 text-sm text-default-600">
                        {processo.numeroInterno}
                      </p>
                    </div>
                  )}

                  {processo.foro && (
                    <div>
                      <p className="text-xs font-semibold uppercase text-default-400">
                        Foro
                      </p>
                      <p className="mt-1 text-sm text-default-600">
                        {processo.foro}
                      </p>
                    </div>
                  )}
                </div>

                <div className="border-t border-default-200 pt-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h4 className="flex items-center gap-2 text-sm font-semibold text-default-700">
                      <Gavel className="h-4 w-4" />
                      Autoridade do caso
                    </h4>
                    {processo.juiz ? (
                      <Button
                        color="primary"
                        size="sm"
                        startContent={<Gavel className="h-4 w-4" />}
                        variant="bordered"
                        onPress={() => setIsJuizModalOpen(true)}
                      >
                        Ver mais informações
                      </Button>
                    ) : (
                      <Chip color="warning" size="sm" variant="flat">
                        Sem juiz cadastrado
                      </Chip>
                    )}
                  </div>

                  {processo.juiz ? (
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <p className="text-xs font-semibold uppercase text-default-400">
                          Nome
                        </p>
                        <p className="mt-1 text-sm text-default-600">
                          {processo.juiz.nomeCompleto || processo.juiz.nome}
                        </p>
                      </div>

                      {processo.juiz.vara && (
                        <div>
                          <p className="text-xs font-semibold uppercase text-default-400">
                            Vara
                          </p>
                          <p className="mt-1 text-sm text-default-600">
                            {processo.juiz.vara}
                          </p>
                        </div>
                      )}

                      {processo.juiz.comarca && (
                        <div>
                          <p className="text-xs font-semibold uppercase text-default-400">
                            Comarca
                          </p>
                          <p className="mt-1 text-sm text-default-600">
                            {processo.juiz.comarca}
                          </p>
                        </div>
                      )}

                      {processo.juiz.nivel && (
                        <div>
                          <p className="text-xs font-semibold uppercase text-default-400">
                            Nível
                          </p>
                          <p className="mt-1 text-sm text-default-600">
                            {processo.juiz.nivel.replace("_", " ")}
                          </p>
                        </div>
                      )}

                      {processo.juiz.especialidades &&
                        processo.juiz.especialidades.length > 0 && (
                          <div className="md:col-span-2">
                            <p className="text-xs font-semibold uppercase text-default-400">
                              Especialidades
                            </p>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {processo.juiz.especialidades.map(
                                (especialidade: string) => (
                                  <Chip
                                    key={especialidade}
                                    color="secondary"
                                    size="sm"
                                    variant="flat"
                                  >
                                    {especialidade}
                                  </Chip>
                                ),
                              )}
                            </div>
                          </div>
                        )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="rounded-xl border border-warning/40 bg-warning/5 p-3">
                        <p className="text-sm font-semibold text-warning-700">
                          Este processo está sem juiz vinculado.
                        </p>
                        <p className="mt-1 text-xs text-warning-700/90">
                          Processos criados por importação ou sincronização podem
                          vir sem autoridade. Vincule uma existente ou cadastre
                          uma nova para manter o histórico completo.
                        </p>
                      </div>

                      {!isCliente && !canEditProcessoAutoridade && (
                        <p className="text-xs text-default-500">
                          Você não possui permissão para vincular autoridade neste
                          processo.
                        </p>
                      )}

                      {!isCliente && canEditProcessoAutoridade && (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            color="primary"
                            size="sm"
                            startContent={<Users className="h-4 w-4" />}
                            variant={
                              showSelectAutoridade ? "solid" : "bordered"
                            }
                            onPress={() => {
                              setShowSelectAutoridade((prev) => !prev);
                              if (!showSelectAutoridade) {
                                setShowCreateAutoridade(false);
                              }
                            }}
                          >
                            Selecionar juiz existente
                          </Button>
                          <Button
                            color="secondary"
                            size="sm"
                            startContent={<UserPlus className="h-4 w-4" />}
                            variant={showCreateAutoridade ? "solid" : "bordered"}
                            onPress={() => {
                              setShowCreateAutoridade((prev) => !prev);
                              if (!showCreateAutoridade) {
                                setShowSelectAutoridade(false);
                              }
                            }}
                          >
                            Cadastrar novo juiz
                          </Button>
                        </div>
                      )}

                      {!isCliente &&
                        canEditProcessoAutoridade &&
                        showSelectAutoridade && (
                        <div className="space-y-3 rounded-xl border border-default-200 bg-default-50/40 p-3">
                          <Input
                            label="Buscar juiz do escritório"
                            placeholder="Digite nome, vara ou comarca"
                            value={searchAutoridade}
                            onValueChange={setSearchAutoridade}
                          />

                          <Select
                            aria-label="Selecionar juiz existente"
                            isDisabled={
                              isLoadingAutoridades ||
                              autoridadesFiltradas.length === 0
                            }
                            label="Juízes disponíveis"
                            placeholder="Selecione um juiz"
                            selectedKeys={selectedAutoridadeKeys}
                            onSelectionChange={(keys) => {
                              const key = Array.from(keys)[0] as
                                | string
                                | undefined;

                              setSelectedAutoridadeId(key ?? "");
                            }}
                          >
                            {autoridadesFiltradas.map((autoridade) => (
                              <SelectItem
                                key={autoridade.id}
                                textValue={`${autoridade.nome} ${autoridade.vara || ""} ${autoridade.comarca || ""}`.trim()}
                              >
                                <div className="flex flex-col">
                                  <span className="text-sm font-medium">
                                    {autoridade.nome}
                                  </span>
                                  <span className="text-xs text-default-500">
                                    {autoridade.vara || "Vara não informada"}
                                    {autoridade.comarca
                                      ? ` · ${autoridade.comarca}`
                                      : ""}
                                  </span>
                                </div>
                              </SelectItem>
                            ))}
                          </Select>

                          <div className="flex justify-end">
                            <Button
                              color="primary"
                              isDisabled={!selectedAutoridadeId}
                              isLoading={isAssigningAutoridade}
                              size="sm"
                              startContent={<Link2 className="h-4 w-4" />}
                              onPress={handleVincularAutoridadeExistente}
                            >
                              Vincular ao processo
                            </Button>
                          </div>

                          {!isLoadingAutoridades &&
                            autoridadesFiltradas.length === 0 && (
                              <p className="text-xs text-default-500">
                                Nenhum juiz encontrado com esse filtro.
                              </p>
                            )}
                        </div>
                      )}

                      {!isCliente &&
                        canEditProcessoAutoridade &&
                        showCreateAutoridade && (
                        <div className="space-y-3 rounded-xl border border-default-200 bg-default-50/40 p-3">
                          <Input
                            isRequired
                            label="Nome do juiz"
                            placeholder="Ex: Robson Nonato"
                            value={novoJuizNome}
                            onValueChange={(value) => {
                              setNovoJuizNome(value);
                              setSelectedCatalogoJuizId("");
                            }}
                          />
                          <Input
                            label="Vara"
                            placeholder="Ex: 1ª Vara Cível"
                            value={novoJuizVara}
                            onValueChange={setNovoJuizVara}
                          />
                          <Input
                            label="Comarca"
                            placeholder="Ex: Comarca de Salvador"
                            value={novoJuizComarca}
                            onValueChange={setNovoJuizComarca}
                          />

                          <div className="space-y-2 rounded-lg border border-default-200/70 bg-background/80 p-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-default-400">
                              Catálogo global (3+ letras)
                            </p>
                            <p className="text-xs text-default-500">
                              Apenas o nome é reaproveitado entre escritórios.
                              Os seus dados de vara/comarca podem ser próprios do
                              seu tenant.
                            </p>
                            {isLoadingCatalogoGlobal ? (
                              <div className="py-2">
                                <Spinner size="sm" />
                              </div>
                            ) : catalogoGlobalJuizes.length > 0 ? (
                              <div className="grid gap-2">
                                {catalogoGlobalJuizes.slice(0, 6).map((item) => (
                                  <button
                                    key={item.id}
                                    type="button"
                                    className={`w-full rounded-lg border px-3 py-2 text-left transition ${
                                      selectedCatalogoJuizId === item.id
                                        ? "border-primary bg-primary/10"
                                        : "border-default-200 bg-background hover:border-primary/40"
                                    }`}
                                    onClick={() => {
                                      setSelectedCatalogoJuizId(item.id);
                                    }}
                                  >
                                    <p className="text-sm font-semibold text-default-800">
                                      {item.nome}
                                    </p>
                                    <p className="text-xs text-default-500">
                                      Identificação global por nome
                                    </p>
                                  </button>
                                ))}
                              </div>
                            ) : novoJuizNome.trim().length >= 3 ? (
                              <p className="text-xs text-default-500">
                                Nenhuma autoridade encontrada no catálogo global.
                              </p>
                            ) : (
                              <p className="text-xs text-default-500">
                                Digite pelo menos 3 letras para sugerir nomes já
                                existentes.
                              </p>
                            )}
                          </div>

                          <div className="flex justify-end">
                            <Button
                              color="secondary"
                              isDisabled={!novoJuizNome.trim()}
                              isLoading={isCreatingAutoridade}
                              size="sm"
                              startContent={<Plus className="h-4 w-4" />}
                              onPress={handleCriarAutoridadeERelacionar}
                            >
                              Cadastrar e vincular
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Informações do Tribunal */}
                {(processo.tribunal ||
                  (processo.juiz && processo.juiz.tribunal)) && (
                  <div className="border-t border-default-200 pt-4">
                    <h4 className="text-sm font-semibold text-default-700 mb-3 flex items-center gap-2">
                      <Landmark className="h-4 w-4" />
                      Tribunal
                    </h4>
                    <div className="grid gap-3 md:grid-cols-2">
                      {(() => {
                        const tribunal =
                          processo.tribunal || processo.juiz?.tribunal;

                        if (!tribunal) return null;

                        return (
                          <>
                            <div>
                              <p className="text-xs font-semibold uppercase text-default-400">
                                Nome
                              </p>
                              <p className="mt-1 text-sm text-default-600">
                                {tribunal.nome}
                              </p>
                            </div>

                            {tribunal.sigla && (
                              <div>
                                <p className="text-xs font-semibold uppercase text-default-400">
                                  Sigla
                                </p>
                                <p className="mt-1 text-sm text-default-600">
                                  {tribunal.sigla}
                                </p>
                              </div>
                            )}

                            {tribunal.esfera && (
                              <div>
                                <p className="text-xs font-semibold uppercase text-default-400">
                                  Esfera
                                </p>
                                <p className="mt-1 text-sm text-default-600">
                                  {tribunal.esfera}
                                </p>
                              </div>
                            )}

                            {tribunal.uf && (
                              <div>
                                <p className="text-xs font-semibold uppercase text-default-400">
                                  UF
                                </p>
                                <p className="mt-1 text-sm text-default-600">
                                  {tribunal.uf}
                                </p>
                              </div>
                            )}

                            {tribunal.siteUrl && (
                              <div className="md:col-span-2">
                                <p className="text-xs font-semibold uppercase text-default-400">
                                  Site
                                </p>
                                <a
                                  className="mt-1 text-sm text-primary hover:underline"
                                  href={tribunal.siteUrl}
                                  rel="noopener noreferrer"
                                  target="_blank"
                                >
                                  {tribunal.siteUrl}
                                </a>
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </CardBody>
            </Card>
          </div>
        </Tab>

        <Tab
          key="partes"
          title={
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              <span>Partes</span>
              {processo.partes.length > 0 && (
                <Chip size="sm" variant="flat">
                  {processo.partes.length}
                </Chip>
              )}
            </div>
          }
        >
          <div
            className="mt-4 space-y-4 scroll-mt-24"
            id="processo-partes"
          >
            <Card className="border border-default-200">
              <CardHeader>
                <div className="flex items-center justify-between w-full">
                  <h3 className="text-lg font-semibold">Partes vinculadas</h3>
                  <Chip variant="flat">{processo.partes.length}</Chip>
                </div>
              </CardHeader>
              <Divider />
              <CardBody className="space-y-3">
                {partesOrdenadas.length === 0 ? (
                  <p className="text-sm text-default-500">
                    Nenhuma parte cadastrada.
                  </p>
                ) : (
                  partesOrdenadas.map((parte) => (
                    <Card key={parte.id} className="border border-default-200">
                      <CardBody className="gap-2">
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Chip size="sm" variant="flat">
                                {parte.tipoPolo}
                              </Chip>
                              <span className="text-sm font-semibold text-default-700">
                                {parte.nome}
                              </span>
                              {parte.papel && (
                                <span className="text-xs text-default-400">
                                  {parte.papel}
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-3 text-xs text-default-500">
                              {parte.documento && (
                                <span className="flex items-center gap-1">
                                  <FileText className="h-3 w-3" />
                                  {parte.documento}
                                </span>
                              )}
                              {parte.email && (
                                <span className="flex items-center gap-1">
                                  <Mail className="h-3 w-3" />
                                  {parte.email}
                                </span>
                              )}
                              {parte.telefone && (
                                <span className="flex items-center gap-1">
                                  <Phone className="h-3 w-3" />
                                  {parte.telefone}
                                </span>
                              )}
                            </div>
                            {parte.observacoes && (
                              <p className="text-xs text-default-500">
                                {parte.observacoes}
                              </p>
                            )}
                          </div>
                          {!isCliente && (
                            <Button
                              isIconOnly
                              color="danger"
                              disabled={parteActionId === parte.id}
                              isLoading={parteActionId === parte.id}
                              variant="light"
                              onPress={() => handleDeleteParte(parte.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </CardBody>
                    </Card>
                  ))
                )}
              </CardBody>
            </Card>

            {!isCliente && canUploadProcessoDocumentos && (
              <Card className="border border-default-200">
                <CardHeader>
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Plus className="h-4 w-4" /> Nova Parte
                  </h3>
                </CardHeader>
                <Divider />
                <CardBody className="space-y-4">
                  <Select
                    label="Tipo de polo"
                    selectedKeys={[parteForm.tipoPolo]}
                    onSelectionChange={(keys) => {
                      const key = Array.from(keys)[0] as
                        | ProcessoPolo
                        | undefined;

                      setParteForm((prev) => ({
                        ...prev,
                        tipoPolo: key ?? prev.tipoPolo,
                      }));
                    }}
                  >
                    {polos.map((polo) => (
                      <SelectItem key={polo} textValue={polo}>{polo}</SelectItem>
                    ))}
                  </Select>

                  <Input
                    label="Nome"
                    placeholder="Nome completo da parte"
                    value={parteForm.nome}
                    onValueChange={(value) =>
                      setParteForm((prev) => ({ ...prev, nome: value }))
                    }
                  />

                  <div className="grid gap-4 md:grid-cols-2">
                    <Input
                      label="Documento"
                      value={parteForm.documento}
                      onValueChange={(value) =>
                        setParteForm((prev) => ({ ...prev, documento: value }))
                      }
                    />
                    <Input
                      label="Telefone"
                      value={parteForm.telefone}
                      onValueChange={(value) =>
                        setParteForm((prev) => ({ ...prev, telefone: value }))
                      }
                    />
                  </div>

                  <Input
                    label="E-mail"
                    value={parteForm.email}
                    onValueChange={(value) =>
                      setParteForm((prev) => ({ ...prev, email: value }))
                    }
                  />
                  <Input
                    label="Papel no processo"
                    value={parteForm.papel}
                    onValueChange={(value) =>
                      setParteForm((prev) => ({ ...prev, papel: value }))
                    }
                  />



                  <Textarea
                    label="Observações"
                    minRows={2}
                    value={parteForm.observacoes}
                    onValueChange={(value) =>
                      setParteForm((prev) => ({ ...prev, observacoes: value }))
                    }
                  />



                  <div className="flex justify-end">
                    <Button
                      color="primary"
                      isLoading={isCreatingParte}
                      startContent={<Plus className="h-4 w-4" />}
                      onPress={handleCreateParte}
                    >
                      Adicionar parte
                    </Button>
                  </div>
                </CardBody>
              </Card>
            )}
          </div>
        </Tab>

        <Tab
          key="prazos"
          title={
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              <span>Prazos</span>
              {prazosOrdenados.length > 0 && (
                <Chip size="sm" variant="flat">
                  {prazosOrdenados.length}
                </Chip>
              )}
            </div>
          }
        >
          <div
            className="mt-4 space-y-4 scroll-mt-24"
            id="processo-prazos"
          >
            <Card className="border border-default-200">
              <CardHeader>
                <div className="flex w-full flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1">
                    <h3 className="text-lg font-semibold">Prazos do processo</h3>
                    <p className="text-sm text-default-500">
                      Trate este processo dentro das 3 frentes de prazo e decida se quer seguir com alerta forte ou silenciar notificações futuras.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Chip
                      color={deadlineAlertsMuted ? "warning" : "success"}
                      variant="flat"
                    >
                      {deadlineAlertsMuted
                        ? "Alertas deste processo silenciados"
                        : "Alertas deste processo ativos"}
                    </Chip>
                    <Chip variant="flat">{prazosOrdenados.length}</Chip>
                    {!isCliente ? (
                      <Button
                        color={deadlineAlertsMuted ? "success" : "warning"}
                        isLoading={isUpdatingPrazoMute}
                        size="sm"
                        variant="flat"
                        onPress={handleTogglePrazoNotifications}
                      >
                        {deadlineAlertsMuted
                          ? "Reativar alertas"
                          : "Silenciar alertas"}
                      </Button>
                    ) : null}
                  </div>
                </div>
              </CardHeader>
              <Divider />
              <CardBody className="space-y-3">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <Card className="border border-danger/20 bg-danger/5">
                    <CardBody className="gap-1 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-danger/80">
                        Vencidos
                      </p>
                      <p className="text-2xl font-semibold text-danger">
                        {prazosSummary.vencidos}
                      </p>
                      <p className="text-xs text-default-400">
                        Itens que já romperam o vencimento.
                      </p>
                    </CardBody>
                  </Card>
                  <Card className="border border-warning/20 bg-warning/5">
                    <CardBody className="gap-1 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-warning/80">
                        Vence hoje
                      </p>
                      <p className="text-2xl font-semibold text-warning">
                        {prazosSummary.venceHoje}
                      </p>
                      <p className="text-xs text-default-400">
                        Demandam ação no mesmo dia.
                      </p>
                    </CardBody>
                  </Card>
                  <Card className="border border-secondary/20 bg-secondary/5">
                    <CardBody className="gap-1 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-secondary/80">
                        Próximos 7 dias
                      </p>
                      <p className="text-2xl font-semibold text-secondary">
                        {prazosSummary.proximos7Dias}
                      </p>
                      <p className="text-xs text-default-400">
                        Radar imediato para o processo.
                      </p>
                    </CardBody>
                  </Card>
                  <Card className="border border-success/20 bg-success/5">
                    <CardBody className="gap-1 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-success/80">
                        Concluídos
                      </p>
                      <p className="text-2xl font-semibold text-success">
                        {prazosSummary.concluidos}
                      </p>
                      <p className="text-xs text-default-400">
                        Histórico já tratado neste caso.
                      </p>
                    </CardBody>
                  </Card>
                </div>

                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
                  <Input
                    label="Buscar prazo"
                    placeholder="Título, fundamento, origem ou responsável"
                    startContent={<Search className="h-4 w-4 text-default-400" />}
                    value={prazoSearch}
                    onValueChange={setPrazoSearch}
                  />
                  <SearchableSelect
                    items={PRAZO_STATUS_FILTER_OPTIONS}
                    label="Status"
                    placeholder="Todos os status"
                    selectedKey={prazoStatusFilter}
                    onSelectionChange={(key) =>
                      setPrazoStatusFilter(key ?? "all")
                    }
                  />
                </div>

                {prazosOrdenados.length === 0 ? (
                  <p className="text-sm text-default-500">
                    Nenhum prazo cadastrado.
                  </p>
                ) : prazosFiltrados.length === 0 ? (
                  <p className="text-sm text-default-500">
                    Nenhum prazo corresponde ao filtro aplicado.
                  </p>
                ) : (
                  prazosFiltrados.map((prazo) => {
                    const isHighlighted = highlightedPrazoId === prazo.id;
                    const bucket = getPrazoOperationalBucket({
                      status: prazo.status,
                      dataVencimento: prazo.dataVencimento,
                      responsavelId: prazo.responsavelId,
                    });

                    return (
                      <Card
                        id={`processo-prazo-${prazo.id}`}
                        key={prazo.id}
                        className={
                          isHighlighted
                            ? "border border-primary bg-primary/5 shadow-lg shadow-primary/10"
                            : "border border-default-200"
                        }
                      >
                        <CardBody className="gap-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Chip
                                  color={getPrazoStatusColor(prazo.status)}
                                  size="sm"
                                  variant="flat"
                                >
                                  {getPrazoStatusLabel(prazo.status)}
                                </Chip>
                                <Chip
                                  color={getPrazoBucketColor(bucket)}
                                  size="sm"
                                  variant="flat"
                                >
                                  {getPrazoBucketLabel(bucket)}
                                </Chip>
                                <span className="text-sm font-semibold text-default-700">
                                  {prazo.titulo}
                                </span>
                                {isHighlighted ? (
                                  <Chip color="primary" size="sm" variant="bordered">
                                    Alvo da notificação
                                  </Chip>
                                ) : null}
                              </div>
                              <div className="text-xs text-default-400">
                                <span className="font-medium">
                                  Vencimento:{" "}
                                  {DateUtils.formatDate(prazo.dataVencimento)}
                                </span>
                                {" • "}
                                {formatPrazoRelativeLabel(
                                  prazo.dataVencimento,
                                  prazo.status,
                                )}
                              </div>
                              {holidayProcessEnabled ? (
                                <HolidayImpactPanel
                                  audience={isCliente ? "client" : "internal"}
                                  className="mt-2"
                                  compact={isCliente}
                                  impact={prazo.holidayImpact}
                                />
                              ) : null}
                              {prazo.descricao && (
                                <p className="text-xs text-default-500">
                                  {prazo.descricao}
                                </p>
                              )}
                              {prazo.fundamentoLegal && (
                                <p className="text-xs text-default-500">
                                  <strong>Fundamento:</strong>{" "}
                                  {prazo.fundamentoLegal}
                                </p>
                              )}
                              {prazo.responsavel && (
                                <p className="text-xs text-default-500">
                                  <strong>Responsável:</strong>{" "}
                                  {prazo.responsavel.firstName}{" "}
                                  {prazo.responsavel.lastName}
                                </p>
                              )}
                              {prazo.regimePrazo && (
                                <p className="text-xs text-default-500">
                                  <strong>Regime:</strong>{" "}
                                  {prazo.regimePrazo.nome}
                                </p>
                              )}
                              {prazo.origemMovimentacao && (
                                <p className="text-xs text-default-500">
                                  <strong>Origem:</strong>{" "}
                                  {prazo.origemMovimentacao.titulo} em{" "}
                                  {DateUtils.formatDate(
                                    prazo.origemMovimentacao.dataMovimentacao,
                                  )}
                                </p>
                              )}
                              {prazo.origemEvento && (
                                <p className="text-xs text-default-500">
                                  <strong>Origem do evento:</strong>{" "}
                                  {prazo.origemEvento.titulo} em{" "}
                                  {DateUtils.formatDate(
                                    prazo.origemEvento.dataInicio,
                                  )}
                                </p>
                              )}
                            </div>
                            {!isCliente && (
                              <div className="flex gap-2">
                                {prazo.status !==
                                  ProcessoPrazoStatus.CONCLUIDO && (
                                  <Button
                                    color="success"
                                    isLoading={prazoActionId === prazo.id}
                                    size="sm"
                                    startContent={
                                      <CheckCircle className="h-3 w-3" />
                                    }
                                    variant="flat"
                                    onPress={() =>
                                      handlePrazoStatus(
                                        prazo.id,
                                        ProcessoPrazoStatus.CONCLUIDO,
                                      )
                                    }
                                  >
                                    Concluir
                                  </Button>
                                )}
                                {prazo.status ===
                                  ProcessoPrazoStatus.CONCLUIDO && (
                                  <Button
                                    color="warning"
                                    isLoading={prazoActionId === prazo.id}
                                    size="sm"
                                    startContent={<Clock className="h-3 w-3" />}
                                    variant="flat"
                                    onPress={() =>
                                      handlePrazoStatus(
                                        prazo.id,
                                        ProcessoPrazoStatus.ABERTO,
                                      )
                                    }
                                  >
                                    Reabrir
                                  </Button>
                                )}
                                <Button
                                  isIconOnly
                                  color="danger"
                                  isLoading={prazoActionId === prazo.id}
                                  size="sm"
                                  variant="light"
                                  onPress={() => handleDeletePrazo(prazo.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            )}
                          </div>
                        </CardBody>
                      </Card>
                    );
                  })
                )}
              </CardBody>
            </Card>

            {!isCliente && (
              <Card className="border border-default-200">
                <CardHeader>
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Plus className="h-4 w-4" /> Registrar novo prazo
                  </h3>
                </CardHeader>
                <Divider />
                <CardBody className="space-y-4">
                  <Input
                    label="Título do prazo"
                    placeholder="Ex: Apresentar contestação"
                    value={prazoForm.titulo}
                    onValueChange={(value) =>
                      setPrazoForm((prev) => ({ ...prev, titulo: value }))
                    }
                  />

                  <DateInput
                    label="Data de vencimento"
                    startContent={
                      <Calendar className="h-4 w-4 text-default-400" />
                    }
                    value={prazoForm.dataVencimento}
                    onValueChange={(value) =>
                      setPrazoForm((prev) => ({
                        ...prev,
                        dataVencimento: value,
                      }))
                    }
                  />

                  <div className="grid gap-3 sm:grid-cols-2">
                    <SearchableSelect
                      items={regimePrazoItems}
                      isLoading={isLoadingRegimesPrazo}
                      label="Regime de prazo"
                      placeholder="Selecione um regime"
                      selectedKey={prazoForm.regimePrazoId || "__none__"}
                      onSelectionChange={(value) => {
                        setPrazoForm((prev) => ({
                          ...prev,
                          regimePrazoId:
                            value && value !== "__none__" ? value : "",
                        }));
                      }}
                    />

                    <SearchableSelect
                      items={responsavelPrazoItems}
                      isLoading={isLoadingResponsaveisPrazo}
                      label="Responsável"
                      placeholder="Selecione o responsável"
                      selectedKey={prazoForm.responsavelId || "__none__"}
                      onSelectionChange={(value) => {
                        setPrazoForm((prev) => ({
                          ...prev,
                          responsavelId:
                            value && value !== "__none__" ? value : "",
                        }));
                      }}
                    />
                  </div>



                  <div className="grid gap-3 sm:grid-cols-2">
                    <SearchableSelect
                      items={andamentoPrazoItems}
                      isLoading={isLoadingMovimentacoes}
                      label="Vincular a andamento"
                      placeholder="Opcional"
                      selectedKey={prazoForm.origemMovimentacaoId || "__none__"}
                      onSelectionChange={(value) => {
                        setPrazoForm((prev) => ({
                          ...prev,
                          origemMovimentacaoId:
                            value && value !== "__none__" ? value : "",
                          origemEventoId:
                            value && value !== "__none__"
                              ? ""
                              : prev.origemEventoId,
                        }));
                      }}
                    />

                    <SearchableSelect
                      items={eventoPrazoItems}
                      isLoading={isLoadingEventos}
                      label="Vincular a evento da agenda"
                      placeholder="Opcional"
                      selectedKey={prazoForm.origemEventoId || "__none__"}
                      onSelectionChange={(value) => {
                        setPrazoForm((prev) => ({
                          ...prev,
                          origemEventoId:
                            value && value !== "__none__" ? value : "",
                          origemMovimentacaoId:
                            value && value !== "__none__"
                              ? ""
                              : prev.origemMovimentacaoId,
                        }));
                      }}
                    />
                  </div>

                  <Textarea
                    label="Descrição"
                    minRows={2}
                    value={prazoForm.descricao}
                    onValueChange={(value) =>
                      setPrazoForm((prev) => ({ ...prev, descricao: value }))
                    }
                  />

                  <Textarea
                    label="Fundamento legal"
                    minRows={2}
                    value={prazoForm.fundamentoLegal}
                    onValueChange={(value) =>
                      setPrazoForm((prev) => ({
                        ...prev,
                        fundamentoLegal: value,
                      }))
                    }
                  />

                  <p className="text-xs text-default-500">
                    Ao salvar, o responsável selecionado e o advogado
                    responsável do processo recebem notificação automática.
                  </p>

                  <div className="flex justify-end">
                    <Button
                      color="primary"
                      isLoading={isCreatingPrazo}
                      startContent={<Plus className="h-4 w-4" />}
                      onPress={handleCreatePrazo}
                    >
                      Adicionar prazo
                    </Button>
                  </div>
                </CardBody>
              </Card>
            )}
          </div>
        </Tab>

        <Tab
          key="documentos"
          title={
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              <span>Documentos</span>
              {processo._count.documentos > 0 && (
                <Chip size="sm" variant="flat">
                  {processo._count.documentos}
                </Chip>
              )}
            </div>
          }
        >
          <div
            className="mt-4 space-y-4 scroll-mt-24"
            id="processo-documentos"
          >
            {!isCliente && (
              <Card className="border border-default-200">
                <CardHeader>
                  <div className="w-full flex flex-col gap-1">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      <UploadCloud className="h-4 w-4" />
                      Anexar documento ao processo
                    </h3>
                    <p className="text-xs text-default-500">
                      O arquivo entra na pasta do processo e fica disponível em
                      Documentos do processo e no módulo de Documentos.
                    </p>
                  </div>
                </CardHeader>
                <Divider />
                <CardBody className="space-y-4">
                  <input
                    ref={documentoInputRef}
                    accept=".pdf,image/*,audio/*,video/*"
                    className="hidden"
                    type="file"
                    multiple
                    onChange={(event) => handleSelectDocumentoFiles(event.target.files)}
                  />

                  <div className="grid gap-4 md:grid-cols-2">
                    <Button
                      startContent={<UploadCloud className="h-4 w-4" />}
                      variant="bordered"
                      onPress={() => documentoInputRef.current?.click()}
                    >
                      {documentoUploads.length
                        ? "Alterar seleção"
                        : "Selecionar arquivos"}
                    </Button>
                    <Input
                      isReadOnly
                      label="Arquivos selecionados"
                      placeholder="Nenhum arquivo selecionado"
                      value={
                        documentoUploads.length === 0
                          ? ""
                          : documentoUploads.length === 1
                            ? documentoUploads[0].file.name
                            : `${documentoUploads.length} arquivos selecionados`
                      }
                    />
                  </div>

                  {documentoUploads.length > 0 ? (
                    <div className="rounded-xl border border-default-200/80 bg-default-50 px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-default-500">
                        Organizacao por arquivo
                      </p>
                      <p className="mt-2 text-xs text-default-500">
                        Classifique cada documento antes do envio. Se o tipo for
                        Procuracao, o sistema cria uma procuracao basica e a
                        vincula neste processo.
                      </p>
                      <div className="mt-4 space-y-3">
                        {documentoUploads.map((upload, index) => {
                          const uploadLimitBytes = getProcessoUploadLimitBytes(
                            upload.file,
                          );
                          const uploadUsagePercent = uploadLimitBytes
                            ? getUploadUsagePercent(
                                upload.file.size,
                                uploadLimitBytes,
                              )
                            : 0;

                          return (
                            <Card
                              key={upload.id}
                              className="border border-default-200/80 bg-content1/80 shadow-none"
                            >
                              <CardBody className="space-y-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold">
                                      {index + 1}. {upload.file.name}
                                    </p>
                                    <p className="text-xs text-default-500">
                                      {formatMegabytes(upload.file.size, {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                      })}
                                    </p>
                                  </div>
                                  <Button
                                    isIconOnly
                                    color="danger"
                                    size="sm"
                                    variant="light"
                                    onPress={() =>
                                      handleRemoveDocumentoUpload(upload.id)
                                    }
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>

                                {uploadLimitBytes ? (
                                  <Progress
                                    aria-label={`Uso do limite de upload para ${upload.file.name}`}
                                    classNames={{
                                      base: "max-w-full",
                                      label:
                                        "text-[11px] uppercase tracking-[0.18em] text-default-500",
                                      value: "text-[11px] text-default-500",
                                      track: "h-2",
                                    }}
                                    color={
                                      uploadUsagePercent >= 90
                                        ? "danger"
                                        : uploadUsagePercent >= 75
                                          ? "warning"
                                          : "primary"
                                    }
                                    label={`Limite ${formatMegabytes(uploadLimitBytes)}`}
                                    maxValue={uploadLimitBytes}
                                    size="sm"
                                    value={upload.file.size}
                                    valueLabel={`${formatMegabytes(upload.file.size, {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    })} de ${formatMegabytes(uploadLimitBytes)}`}
                                  />
                                ) : null}

                                <div className="grid gap-3 md:grid-cols-2">
                                  <Select
                                    label="Tipo do documento"
                                    selectedKeys={[upload.tipo]}
                                    onSelectionChange={(keys) => {
                                      const selected = Array.from(keys)[0] as
                                        | ProcessoDocumentoClassificacao
                                        | undefined;
                                      if (!selected) return;
                                      handleUpdateDocumentoUpload(upload.id, {
                                        tipo: selected,
                                      });
                                    }}
                                  >
                                    {PROCESSO_DOCUMENT_TYPE_OPTIONS.map((option) => (
                                      <SelectItem
                                        key={option.key}
                                        textValue={option.label}
                                      >
                                        {option.label}
                                      </SelectItem>
                                    ))}
                                  </Select>

                                  <div className="flex items-center rounded-xl border border-default-200/80 bg-default-50 px-4 py-3">
                                    <Checkbox
                                      isSelected={!upload.visivelParaCliente}
                                      onValueChange={(checked) =>
                                        handleUpdateDocumentoUpload(upload.id, {
                                          visivelParaCliente: !checked,
                                        })
                                      }
                                    >
                                      Ocultar do cliente
                                    </Checkbox>
                                  </div>
                                </div>

                                <Textarea
                                  label="Descricao interna"
                                  minRows={2}
                                  placeholder="Opcional: observacao da equipe sobre este anexo"
                                  value={upload.descricao}
                                  onValueChange={(value) =>
                                    handleUpdateDocumentoUpload(upload.id, {
                                      descricao: value,
                                    })
                                  }
                                />
                              </CardBody>
                            </Card>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  <div className="rounded-xl border border-default-200/80 bg-default-50 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-default-500">
                      Regras de anexo
                    </p>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-default-600">
                      <li>Máximo de 10 arquivos por envio.</li>
                      <li>PDF e imagem: até 25 MB por arquivo.</li>
                      <li>Áudio: até 50 MB por arquivo.</li>
                      <li>Vídeo: até 100 MB por arquivo.</li>
                      <li>
                        Formatos aceitos: PDF, imagens, áudios e vídeos.
                      </li>
                      <li>
                        Os limites existem para segurança, performance e custo
                        operacional do sistema.
                      </li>
                      <li>
                        Se marcado como visível, o cliente pode acessar no portal.
                      </li>
                    </ul>
                  </div>

                  <div className="flex justify-end">
                    <Button
                      color="primary"
                      isLoading={isUploadingDocumento}
                      isDisabled={documentoUploads.length === 0}
                      startContent={<UploadCloud className="h-4 w-4" />}
                      onPress={handleUploadDocumento}
                    >
                      Anexar documentos
                    </Button>
                  </div>
                </CardBody>
              </Card>
            )}

            {isLoadingDocs ? (
              <div className="flex justify-center py-8">
                <Spinner />
              </div>
            ) : !documentos || documentos.length === 0 ? (
              <Card className="border border-default-200">
                <CardBody className="py-12 text-center">
                  <FileText className="mx-auto h-12 w-12 text-default-300" />
                  <p className="mt-4 text-lg font-semibold text-default-600">
                    Nenhum documento disponível
                  </p>
                  {!isCliente && canUploadProcessoDocumentos && (
                    <p className="mt-2 text-sm text-default-500">
                      Use o bloco acima para anexar o primeiro documento.
                    </p>
                  )}
                </CardBody>
              </Card>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {documentos.map((doc: any) => (
                  <Card key={doc.id} className="border border-default-200">
                    <CardBody className="gap-2">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="text-sm font-semibold">
                            {doc.nome}
                          </p>
                          <p className="text-xs text-default-400">
                            {DateUtils.formatDate(doc.createdAt)}
                          </p>
                        </div>
                        {doc.tamanhoBytes && (
                          <Chip size="sm" variant="flat">
                            {formatMegabytes(doc.tamanhoBytes, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </Chip>
                        )}
                      </div>
                      {doc.descricao && (
                        <p className="text-xs text-default-500">
                          {doc.descricao}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <Chip size="sm" variant="flat">
                          {getDocumentoTipoLabel(doc.tipo)}
                        </Chip>
                        <Chip
                          color={doc.visivelParaCliente ? "success" : "default"}
                          size="sm"
                          variant="flat"
                        >
                          {doc.visivelParaCliente
                            ? "Visivel no portal do cliente"
                            : "Oculto do cliente"}
                        </Chip>
                        {doc.metadados?.procuracaoId ? (
                          <Button
                            as={Link}
                            href={`/procuracoes/${doc.metadados.procuracaoId}`}
                            size="sm"
                            startContent={<FileSignature className="h-3 w-3" />}
                            variant="light"
                          >
                            Abrir procuracao
                          </Button>
                        ) : null}
                      </div>
                      {doc.url && (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            color="primary"
                            size="sm"
                            startContent={<Eye className="h-3 w-3" />}
                            variant="flat"
                            onPress={() => handleOpenDocumentoPreview(doc)}
                          >
                            Visualizar
                          </Button>
                          <Button
                            as="a"
                            href={`/api/documentos/${doc.id}/view?download=1`}
                            rel="noopener noreferrer"
                            size="sm"
                            startContent={<Download className="h-3 w-3" />}
                            target="_blank"
                            variant="bordered"
                          >
                            Baixar
                          </Button>
                        </div>
                      )}
                    </CardBody>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </Tab>

        <Tab
          key="eventos"
          title={
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              <span>Eventos</span>
              {processo._count.eventos > 0 && (
                <Chip size="sm" variant="flat">
                  {processo._count.eventos}
                </Chip>
              )}
            </div>
          }
        >
          <div
            className="mt-4 space-y-4 scroll-mt-24"
            id="processo-eventos"
          >
            <Card className="border border-default-200">
              <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    Agenda do processo
                  </p>
                  <p className="text-xs text-default-500">
                    Use a agenda para criar ou acompanhar compromissos e eventos relacionados a este processo.
                  </p>
                </div>
                <Button
                  color="primary"
                  variant="flat"
                  onPress={() => router.push(`/agenda?processoId=${encodeURIComponent(processoId)}`)}
                >
                  Abrir agenda
                </Button>
              </CardBody>
            </Card>

            {isLoadingEventos ? (
              <div className="flex justify-center py-8">
                <Spinner />
              </div>
            ) : !eventos || eventos.length === 0 ? (
              <Card className="border border-default-200">
                <CardBody className="py-12 text-center">
                  <Calendar className="mx-auto h-12 w-12 text-default-300" />
                  <p className="mt-4 text-lg font-semibold text-default-600">
                    Nenhum evento cadastrado
                  </p>
                </CardBody>
              </Card>
            ) : (
              <div className="space-y-3">
                {eventos.map((evento: any) => (
                  <Card key={evento.id} className="border border-default-200">
                    <CardBody className="gap-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm font-semibold">
                            {evento.titulo}
                          </p>
                          <p className="text-xs text-default-400">
                            {DateUtils.formatDateTime(evento.dataInicio)}
                          </p>
                        </div>
                        {evento.status && (
                          <Chip
                            color={
                              evento.status === "CONFIRMADO"
                                ? "success"
                                : "default"
                            }
                            size="sm"
                            variant="flat"
                          >
                            {evento.status}
                          </Chip>
                        )}
                      </div>
                      {evento.descricao && (
                        <p className="text-xs text-default-500">
                          {evento.descricao}
                        </p>
                      )}
                      {evento.local && (
                        <div className="flex items-center gap-1 text-xs text-default-400">
                          <MapPin className="h-3 w-3" />
                          <span>{evento.local}</span>
                        </div>
                      )}
                      {evento.isOnline && evento.linkAcesso && (
                        <div className="flex items-center gap-1 text-xs">
                          <Video className="h-3 w-3 text-primary" />
                          <a
                            className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                            href={evento.linkAcesso}
                            rel="noreferrer"
                            target="_blank"
                          >
                            Abrir link do evento
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      )}
                    </CardBody>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </Tab>

        <Tab
          key="procuracoes"
          title={
            <div className="flex items-center gap-2">
              <FileSignature className="h-4 w-4" />
              <span>Procurações</span>
              {processo.procuracoesVinculadas.length > 0 && (
                <Chip size="sm" variant="flat">
                  {processo.procuracoesVinculadas.length}
                </Chip>
              )}
            </div>
          }
        >
          <div className="mt-4 space-y-4 scroll-mt-24" id="processo-procuracoes">
            <Card className="border border-default-200">
              <CardHeader>
                <div className="flex items-center justify-between w-full">
                  <h3 className="text-lg font-semibold">
                    Procurações vinculadas
                  </h3>
                  <Chip variant="flat">
                    {processo.procuracoesVinculadas.length}
                  </Chip>
                </div>
              </CardHeader>
              <Divider />
              <CardBody className="space-y-3">
                {processo.procuracoesVinculadas.length === 0 ? (
                  <p className="text-sm text-default-500">
                    Nenhuma procuração vinculada a este processo.
                  </p>
                ) : (
                  processo.procuracoesVinculadas.map((item) => (
                    <Card key={item.id} className="border border-default-200">
                      <CardBody className="gap-2">
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Chip
                                color={
                                  item.procuracao.ativa ? "success" : "danger"
                                }
                                size="sm"
                                variant="flat"
                              >
                                {item.procuracao.status}
                              </Chip>
                              <span className="text-sm font-semibold text-default-700">
                                Procuração{" "}
                                {item.procuracao.numero || "(sem número)"}
                              </span>
                            </div>
                            {item.procuracao.arquivoUrl && (
                              <Button
                                as="a"
                                color="primary"
                                href={item.procuracao.arquivoUrl}
                                rel="noopener noreferrer"
                                size="sm"
                                startContent={<Download className="h-3 w-3" />}
                                target="_blank"
                                variant="flat"
                              >
                                Baixar arquivo
                              </Button>
                            )}
                            <div className="text-xs text-default-500 space-y-1">
                              {item.procuracao.assinaturas.length > 0 && (
                                <p>
                                  <strong>Assinada em:</strong>{" "}
                                  {DateUtils.formatDate(
                                    item.procuracao.assinaturas[0].assinadaEm ??
                                      new Date(),
                                  )}
                                </p>
                              )}
                              {item.procuracao.validaAte && (
                                <p>
                                  <strong>Validade:</strong>{" "}
                                  {DateUtils.formatDate(
                                    item.procuracao.validaAte,
                                  )}
                                </p>
                              )}
                              {item.procuracao.outorgados.length > 0 && (
                                <p>
                                  <strong>Outorgados:</strong>{" "}
                                  {item.procuracao.outorgados
                                    .map((out) =>
                                      `${out.advogado.usuario?.firstName || ""} ${out.advogado.usuario?.lastName || ""}`.trim(),
                                    )
                                    .join(", ")}
                                </p>
                              )}
                            </div>
                          </div>
                          {!isCliente && (
                            <Button
                              isIconOnly
                              color="danger"
                              isLoading={
                                procuracaoActionId === item.procuracao.id
                              }
                              size="sm"
                              variant="light"
                              onPress={() =>
                                handleUnlinkProcuracao(item.procuracao.id)
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </CardBody>
                    </Card>
                  ))
                )}
              </CardBody>
            </Card>

            {!isCliente && (
              <Card className="border border-default-200">
                <CardHeader>
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Plus className="h-4 w-4" /> Vincular procuração existente
                  </h3>
                </CardHeader>
                <Divider />
                <CardBody className="space-y-4">
                  <Select
                    isDisabled={procuracoesDisponiveisFiltradas.length === 0}
                    label="Procuração"
                    placeholder="Selecione uma procuração ativa"
                    selectedKeys={
                      selectedProcuracaoId ? [selectedProcuracaoId] : []
                    }
                    onSelectionChange={(keys) => {
                      const key = Array.from(keys)[0] as string | undefined;

                      setSelectedProcuracaoId(key ?? "");
                    }}
                  >
                    {procuracoesDisponiveisFiltradas.map((proc: any) => (
                      <SelectItem
                        key={proc.id}
                        textValue={proc.numero || proc.id}
                      >
                        <div className="flex flex-col">
                          <span className="text-sm font-semibold">
                            {proc.numero || "Sem número"}
                          </span>
                          <span className="text-xs text-default-400">
                            Emitida em{" "}
                            {proc.emitidaEm
                              ? DateUtils.formatDate(proc.emitidaEm)
                              : "-"}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </Select>

                  <div className="flex justify-end">
                    <Button
                      color="primary"
                      isDisabled={!selectedProcuracaoId}
                      isLoading={isLinkingProcuracao}
                      startContent={<Link2 className="h-4 w-4" />}
                      onPress={handleLinkProcuracao}
                    >
                      Vincular procuração
                    </Button>
                  </div>

                  {procuracoesDisponiveisFiltradas.length === 0 && (
                    <p className="text-xs text-default-500">
                      Nenhuma procuração ativa disponível para vincular.
                    </p>
                  )}
                </CardBody>
              </Card>
            )}
          </div>
        </Tab>
      </Tabs>

      <Modal
        bodyClassName="px-0 pb-0 pt-2"
        className="max-w-6xl"
        footer={
          documentoPreview ? (
            <>
              <Button
                as="a"
                href={documentoPreview.viewUrl}
                rel="noopener noreferrer"
                startContent={<Link2 className="h-4 w-4" />}
                target="_blank"
                variant="bordered"
              >
                Abrir em nova aba
              </Button>
              <Button variant="light" onPress={() => setDocumentoPreview(null)}>
                Fechar
              </Button>
            </>
          ) : null
        }
        isOpen={Boolean(documentoPreview)}
        size="full"
        title={documentoPreview?.nome || "Visualizar documento"}
        onClose={() => setDocumentoPreview(null)}
      >
        {documentoPreview ? (
          isDocumentoPreviewInline(
            documentoPreview.nome,
            documentoPreview.contentType,
          ) ? (
            <iframe
              className="h-[78vh] w-full rounded-b-xl border-0 bg-default-50"
              src={documentoPreview.viewUrl}
              title={documentoPreview.nome}
            />
          ) : (
            <div className="flex min-h-[48vh] flex-col items-center justify-center gap-4 px-6 pb-8 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-warning/30 bg-warning/10 text-warning">
                <FileWarning className="h-6 w-6" />
              </div>
              <div className="space-y-2">
                <p className="text-base font-semibold text-foreground">
                  Visualizacao inline indisponivel para este tipo de arquivo
                </p>
                <p className="text-sm text-default-500">
                  Use o botao abaixo para abrir o documento em uma nova aba.
                </p>
              </div>
            </div>
          )
        ) : null}
      </Modal>

      {/* Modal do Juiz */}
      {processo.juiz && (
        <JuizModal
          isOpen={isJuizModalOpen}
          juizId={processo.juiz.id}
          onClose={() => setIsJuizModalOpen(false)}
        />
      )}
    </div>
  );
}

