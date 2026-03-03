"use client";

import { useMemo, useState, useCallback, useEffect, ReactNode } from "react";
import useSWR from "swr";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Button } from "@heroui/button";
import { Input, Textarea } from "@heroui/input";
import { Chip } from "@heroui/chip";
import { Divider } from "@heroui/divider";
import { Tooltip } from "@heroui/tooltip";
import { Skeleton, Select, SelectItem } from "@heroui/react";
import { Badge } from "@heroui/badge";
import { Slider } from "@heroui/slider";
import { Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@heroui/modal";
import { Checkbox } from "@heroui/checkbox";
import { Switch } from "@heroui/switch";
import { DateRangeInput } from "@/components/ui/date-range-input";

import {
  FolderPlus,
  RefreshCw,
  UploadCloud,
  Trash2,
  Pencil,
  Folder,
  FileText,
  Users,
  Search,
  AlertCircle,
  Sparkles,
  Filter,
  ChevronDown,
  Files,
  Layers,
  Briefcase,
  RotateCcw,
  XCircle,
  TrendingUp,
  BarChart3,
  Zap,
  Target,
  Calendar,
  Info,
  Activity,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { AnimatePresence, motion } from "framer-motion";

import {
  type DocumentExplorerData,
  type DocumentExplorerCliente,
  type DocumentExplorerProcess,
  type DocumentExplorerFile,
  type DocumentExplorerContrato,
  type DocumentExplorerCatalogoCausa,
  type DocumentExplorerClienteSummary,
  createExplorerFolder,
  deleteExplorerFile,
  deleteExplorerFolder,
  getDocumentExplorerData,
  renameExplorerFolder,
  uploadDocumentoExplorer,
} from "@/app/actions/documentos-explorer";
import { fadeInUp } from "@/components/ui/motion-presets";
import {
  PeopleMetricCard,
  PeoplePageHeader,
  PeoplePanel,
} from "@/components/people-ui";

interface DocumentosContentProps {
  initialData: DocumentExplorerData | null;
  initialClientes: DocumentExplorerClienteSummary[];
  initialError?: string;
  canManageDocumentos: boolean;
  canDeleteDocumentos: boolean;
}

interface ExplorerTreeNode {
  id: string;
  name: string;
  relativeSegments: string[];
  children: ExplorerTreeNode[];
  files: DocumentExplorerFile[];
}

const ROOT_SEGMENT_KEY = "";

interface UploadOptionsState {
  causaId: string | null;
  processoIds: string[];
  contratoIds: string[];
  visivelParaCliente: boolean;
  description: string;
}

type OrigemFiltro = "TODOS" | "CLIENTE" | "ESCRITORIO" | "SISTEMA";
type VisibilidadeFiltro = "TODOS" | "CLIENTE" | "EQUIPE";

interface FiltrosState {
  busca: string;
  origem: OrigemFiltro;
  visibilidade: VisibilidadeFiltro;
  dataUpload: { start: string | null; end: string | null } | null;
  tamanhoKB: number[]; // [min, max]
}

const FILES_PER_PAGE = 50;
const PROCESSOS_PER_PAGE = 20;

interface FilterSectionProps {
  title: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: ReactNode;
}

const FilterSection = ({
  title,
  description,
  icon: Icon,
  children,
}: FilterSectionProps) => (
  <section className="space-y-3 rounded-2xl border border-default-200/70 bg-default-50/70 p-4">
    <div className="flex items-start gap-2">
      {Icon ? <Icon className="h-4 w-4 text-default-400" /> : null}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-default-400">
          {title}
        </p>
        {description ? (
          <p className="text-xs text-default-500">{description}</p>
        ) : null}
      </div>
    </div>
    {children}
  </section>
);

function sanitizeSegment(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}

function getRelativeSegmentsFromPath(
  path: string,
  tenantSlug: string,
): string[] {
  const segments = path.split("/").filter(Boolean);

  if (segments[0] === "magiclawyer") {
    segments.shift();
  }

  if (segments[0] === tenantSlug) {
    segments.shift();
  }

  return segments;
}

function computeBaseSegmentsForProcess(
  data: DocumentExplorerData,
  cliente: DocumentExplorerCliente,
  processo: DocumentExplorerProcess,
): string[] {
  if (processo.folderTree) {
    return getRelativeSegmentsFromPath(
      processo.folderTree.path,
      data.tenantSlug,
    );
  }

  const clienteSegment = `${sanitizeSegment(cliente.nome)}-${cliente.id}`;
  const processoSegment = `${sanitizeSegment(processo.numero)}-${processo.id}`;

  return ["clientes", clienteSegment, "processos", processoSegment];
}

function computeBaseSegmentsForCliente(
  data: DocumentExplorerData,
  cliente: DocumentExplorerCliente,
): string[] {
  if (cliente.documentosGeraisTree) {
    return getRelativeSegmentsFromPath(
      cliente.documentosGeraisTree.path,
      data.tenantSlug,
    );
  }

  const clienteSegment = `${sanitizeSegment(cliente.nome)}-${cliente.id}`;

  return ["clientes", clienteSegment, "documentos"];
}

function getRelativeDocSegments(
  doc: DocumentExplorerFile,
  baseSegments: string[],
): string[] {
  if (!doc.folderSegments?.length) return [];

  const segments = [...doc.folderSegments];

  if (baseSegments.length) {
    const prefix = segments.slice(0, baseSegments.length);
    const matchesPrefix = baseSegments.every(
      (segment, index) => segment === prefix[index],
    );

    if (matchesPrefix) {
      return segments.slice(baseSegments.length);
    }
  }

  return segments;
}

function ensureNode(
  map: Map<string, ExplorerTreeNode>,
  relativeSegments: string[],
): ExplorerTreeNode {
  const key = relativeSegments.join("/");

  if (map.has(key)) {
    return map.get(key)!;
  }

  const node: ExplorerTreeNode = {
    id: key,
    name: relativeSegments.length
      ? relativeSegments[relativeSegments.length - 1]
      : "Pasta principal",
    relativeSegments,
    children: [],
    files: [],
  };

  map.set(key, node);

  if (relativeSegments.length > 0) {
    const parentSegments = relativeSegments.slice(0, -1);
    const parentNode = ensureNode(map, parentSegments);

    if (!parentNode.children.some((child) => child.id === key)) {
      parentNode.children.push(node);
    }
  }

  return node;
}

function buildExplorerTree(
  data: DocumentExplorerData,
  cliente: DocumentExplorerCliente,
  processo: DocumentExplorerProcess | null,
): ExplorerTreeNode {
  const map = new Map<string, ExplorerTreeNode>();
  const baseSegments = processo
    ? computeBaseSegmentsForProcess(data, cliente, processo)
    : computeBaseSegmentsForCliente(data, cliente);

  ensureNode(map, []);

  const folderTree = processo
    ? processo.folderTree
    : cliente.documentosGeraisTree;

  const visit = (current: typeof folderTree) => {
    if (!current) return;

    const relativeSegments = getRelativeSegmentsFromPath(
      current.path,
      data.tenantSlug,
    ).slice(baseSegments.length);

    ensureNode(map, relativeSegments);

    for (const child of current.children) {
      visit(child);
    }
  };

  if (folderTree) {
    visit(folderTree);
  }

  const documentos = processo ? processo.documentos : cliente.documentosGerais;

  for (const documento of documentos) {
    const relative = getRelativeDocSegments(documento, baseSegments);
    const node = ensureNode(map, relative);

    node.files.push(documento);
  }

  for (const node of Array.from(map.values())) {
    node.children.sort((a: ExplorerTreeNode, b: ExplorerTreeNode) =>
      a.name.localeCompare(b.name),
    );
    node.files.sort((a: DocumentExplorerFile, b: DocumentExplorerFile) =>
      a.nome.localeCompare(b.nome),
    );
  }

  return map.get(ROOT_SEGMENT_KEY)!;
}

function formatBytes(size: number | null | undefined): string {
  if (!size || Number.isNaN(size)) return "—";
  if (size === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.floor(Math.log(size) / Math.log(1024));
  const value = size / Math.pow(1024, index);

  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatDate(date: string | undefined): string {
  if (!date) return "—";
  const parsed = new Date(date);

  if (Number.isNaN(parsed.getTime())) return "—";

  return parsed.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function DocumentosContent({
  initialData,
  initialClientes,
  initialError,
  canManageDocumentos,
  canDeleteDocumentos,
}: DocumentosContentProps) {
  const [selectedClienteId, setSelectedClienteId] = useState<string | null>(
    initialClientes[0]?.id ?? null,
  );
  const [selectedProcessoId, setSelectedProcessoId] = useState<string | null>(
    initialData?.clientes[0]?.processos[0]?.id ?? null,
  );
  const [selectedFolderSegments, setSelectedFolderSegments] = useState<
    string[]
  >([]);
  const [isUploading, setIsUploading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [pendingFiles, setPendingFiles] = useState<FileList | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadOptions, setUploadOptions] = useState<UploadOptionsState>({
    causaId: null,
    processoIds: [],
    contratoIds: [],
    visivelParaCliente: true,
    description: "",
  });
  const [showFilters, setShowFilters] = useState(false);
  const [filtros, setFiltros] = useState<FiltrosState>({
    busca: "",
    origem: "TODOS",
    visibilidade: "TODOS",
    dataUpload: null,
    tamanhoKB: [0, 512000],
  });
  const [processosPage, setProcessosPage] = useState(1);
  const [filesPage, setFilesPage] = useState(1);

  const {
    data,
    error,
    isLoading,
    isValidating,
    mutate,
  } = useSWR(
    selectedClienteId
      ? [
          "documentos-explorer",
          selectedClienteId,
          selectedProcessoId ?? "__geral__",
          processosPage,
        ]
      : null,
    async ([, clienteId, processoIdToken, processosPageToken]) => {
      const processoIdForTree =
        processoIdToken === "__geral__" ? null : processoIdToken;
      const page =
        typeof processosPageToken === "number"
          ? processosPageToken
          : Number(processosPageToken);
      const result = await getDocumentExplorerData(clienteId, {
        processoIdForTree,
        includeCloudinaryTree: true,
        processosPage: Number.isFinite(page) ? page : 1,
        processosPageSize: PROCESSOS_PER_PAGE,
      });

      if (!result.success) {
        throw new Error(result.error || "Erro ao carregar documentos");
      }

      return result.data ?? null;
    },
    {
      fallbackData: initialData ?? undefined,
      keepPreviousData: true,
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
    },
  );

  useEffect(() => {
    if (!data) return;

    if (!selectedClienteId) {
      const firstCliente = data.clientes[0];

      setSelectedClienteId(firstCliente ? firstCliente.id : null);
      setSelectedProcessoId(firstCliente?.processos[0]?.id ?? null);
      setSelectedFolderSegments([]);

      return;
    }

    const cliente = data.clientes.find((item) => item.id === selectedClienteId);

    if (!cliente) return;

    // Se não há processo selecionado, seleciona o primeiro
    if (!selectedProcessoId && cliente.processos.length > 0) {
      setSelectedProcessoId(cliente.processos[0].id);
      setSelectedFolderSegments([]);
    }

    if (
      selectedProcessoId &&
      !cliente.processos.some((processo) => processo.id === selectedProcessoId)
    ) {
      setSelectedProcessoId(cliente.processos[0]?.id ?? null);
      setSelectedFolderSegments([]);
    }
  }, [data, selectedClienteId, selectedProcessoId]);

  const selectedCliente = useMemo(() => {
    if (!data) return null;
    if (!selectedClienteId) return data.clientes[0] ?? null;

    return data.clientes.find((cliente) => cliente.id === selectedClienteId) ?? null;
  }, [data, selectedClienteId]);

  const processosTotalPages = useMemo(
    () =>
      Math.max(
        1,
        Math.ceil((selectedCliente?.counts.processos ?? 0) / PROCESSOS_PER_PAGE),
      ),
    [selectedCliente?.counts.processos],
  );

  useEffect(() => {
    setProcessosPage((prev) => Math.min(prev, processosTotalPages));
  }, [processosTotalPages]);

  const selectedProcesso = useMemo(() => {
    if (!selectedCliente || !selectedProcessoId) return null;

    return (
      selectedCliente.processos.find(
        (processo) => processo.id === selectedProcessoId,
      ) ?? null
    );
  }, [selectedCliente, selectedProcessoId]);

  const tree = useMemo(() => {
    if (!data || !selectedCliente) return null;

    return buildExplorerTree(data, selectedCliente, selectedProcesso);
  }, [data, selectedCliente, selectedProcesso]);

  const filesInCurrentFolder = useMemo(() => {
    if (!tree) return [] as DocumentExplorerFile[];

    const key = selectedFolderSegments.join("/");

    const findNode = (node: ExplorerTreeNode): ExplorerTreeNode | null => {
      if (node.id === key) return node;

      for (const child of node.children) {
        const found = findNode(child);

        if (found) return found;
      }

      return null;
    };

    const node = findNode(tree);

    const files = node?.files ?? [];

    return files.filter((arquivo) => {
      const nomeMatch = filtros.busca
        ? arquivo.nome.toLowerCase().includes(filtros.busca.toLowerCase())
        : true;

      const origemMatch =
        filtros.origem === "TODOS" || arquivo.metadata?.origem === filtros.origem;

      const visMatch =
        filtros.visibilidade === "TODOS" ||
        (filtros.visibilidade === "CLIENTE" && arquivo.visivelParaCliente) ||
        (filtros.visibilidade === "EQUIPE" && !arquivo.visivelParaCliente);

      const tamanhoMatch =
        arquivo.tamanhoBytes == null
          ? true
          : arquivo.tamanhoBytes / 1024 >= filtros.tamanhoKB[0] &&
            arquivo.tamanhoBytes / 1024 <= filtros.tamanhoKB[1];

      const dataMatch = (() => {
        if (!filtros.dataUpload || (!filtros.dataUpload.start && !filtros.dataUpload.end))
          return true;

        const uploaded = arquivo.uploadedAt ? new Date(arquivo.uploadedAt) : null;
        if (!uploaded) return true;
        const start = filtros.dataUpload.start ? new Date(filtros.dataUpload.start) : null;
        const end = filtros.dataUpload.end ? new Date(filtros.dataUpload.end) : null;

        if (start && uploaded < start) return false;
        if (end) {
          // incluir fim do dia selecionado
          end.setHours(23, 59, 59, 999);
          if (uploaded > end) return false;
        }
        return true;
      })();

      return nomeMatch && origemMatch && visMatch && tamanhoMatch && dataMatch;
    });
  }, [tree, selectedFolderSegments, filtros]);

  const filesTotalPages = useMemo(
    () => Math.max(1, Math.ceil(filesInCurrentFolder.length / FILES_PER_PAGE)),
    [filesInCurrentFolder.length],
  );

  const pagedFiles = useMemo(() => {
    const startIndex = (filesPage - 1) * FILES_PER_PAGE;

    return filesInCurrentFolder.slice(startIndex, startIndex + FILES_PER_PAGE);
  }, [filesInCurrentFolder, filesPage]);

  useEffect(() => {
    setFilesPage((prev) => Math.min(prev, filesTotalPages));
  }, [filesTotalPages]);

  useEffect(() => {
    setFilesPage(1);
  }, [selectedFolderSegments, filtros, selectedProcessoId, selectedClienteId]);

  const handleSelectCliente = (clienteId: string) => {
    if (clienteId === selectedClienteId) return;

    setProcessosPage(1);
    setSelectedClienteId(clienteId);
    setSelectedFolderSegments([]);
  };

  const handleSelectProcesso = (processoId: string | null) => {
    setSelectedProcessoId(processoId);
    setSelectedFolderSegments([]);
  };

  const handleSelectFolder = (segments: string[]) => {
    setSelectedFolderSegments(segments);
  };

  const handleCreateFolder = useCallback(async () => {
    if (!canManageDocumentos) {
      toast.error("Você não tem permissão para criar pastas.");

      return;
    }

    if (!selectedCliente || !selectedProcesso) {
      toast.error("Selecione um processo para criar pastas");

      return;
    }

    const nome = prompt("Nome da nova pasta");

    if (!nome) return;

    const result = await createExplorerFolder({
      clienteId: selectedCliente.id,
      processoId: selectedProcesso.id,
      parentSegments: selectedFolderSegments,
      nomePasta: nome,
    });

    if (!result.success) {
      toast.error(result.error || "Erro ao criar pasta");

      return;
    }

    toast.success("Pasta criada com sucesso");
    await mutate();
  }, [
    canManageDocumentos,
    selectedCliente,
    selectedProcesso,
    selectedFolderSegments,
    mutate,
  ]);

  const handleRenameFolder = useCallback(async () => {
    if (!canManageDocumentos) {
      toast.error("Você não tem permissão para renomear pastas.");

      return;
    }

    if (!selectedCliente || !selectedProcesso) {
      toast.error("Selecione um processo para renomear pastas");

      return;
    }

    if (!selectedFolderSegments.length) {
      toast.message("Selecione a pasta que deseja renomear");

      return;
    }

    const currentName =
      selectedFolderSegments[selectedFolderSegments.length - 1];
    const novoNome = prompt("Novo nome da pasta", currentName);

    if (!novoNome || novoNome === currentName) return;

    const result = await renameExplorerFolder({
      clienteId: selectedCliente.id,
      processoId: selectedProcesso.id,
      currentSegments: selectedFolderSegments,
      novoNome,
    });

    if (!result.success) {
      toast.error(result.error || "Erro ao renomear pasta");

      return;
    }

    toast.success("Pasta renomeada");
    setSelectedFolderSegments((prev) => {
      const updated = [...prev];

      updated[updated.length - 1] = sanitizeSegment(novoNome);

      return updated;
    });
    await mutate();
  }, [
    canManageDocumentos,
    selectedCliente,
    selectedProcesso,
    selectedFolderSegments,
    mutate,
  ]);

  const handleDeleteFolder = useCallback(async () => {
    if (!canDeleteDocumentos) {
      toast.error("Você não tem permissão para excluir pastas.");

      return;
    }

    if (!selectedCliente || !selectedProcesso) {
      toast.error("Selecione um processo");

      return;
    }

    if (!selectedFolderSegments.length) {
      toast.message("Selecione uma pasta para excluir");

      return;
    }

    const confirmDelete = confirm(
      "Deseja realmente excluir esta pasta e todos os arquivos dentro dela?",
    );

    if (!confirmDelete) return;

    const result = await deleteExplorerFolder({
      clienteId: selectedCliente.id,
      processoId: selectedProcesso.id,
      targetSegments: selectedFolderSegments,
    });

    if (!result.success) {
      toast.error(result.error || "Erro ao excluir pasta");

      return;
    }

    toast.success("Pasta excluída");
    setSelectedFolderSegments([]);
    await mutate();
  }, [
    canDeleteDocumentos,
    selectedCliente,
    selectedProcesso,
    selectedFolderSegments,
    mutate,
  ]);

  const openUploadModalForFiles = useCallback(
    (files: FileList | null) => {
      if (!files?.length) return;

      if (!selectedCliente) {
        toast.error("Selecione um cliente para anexar documentos");

        return;
      }

      if (!canManageDocumentos) {
        toast.error("Você não tem permissão para enviar documentos.");

        return;
      }

      const defaultProcesso =
        selectedProcesso ?? selectedCliente.processos[0] ?? null;
      const defaultCausaId = defaultProcesso?.causas?.[0]?.id ?? null;
      const relacionados = selectedCliente.contratos?.filter((contrato: any) =>
        defaultProcesso ? contrato.processoId === defaultProcesso.id : false,
      );

      setUploadOptions({
        causaId: defaultCausaId,
        processoIds: defaultProcesso ? [defaultProcesso.id] : [],
        contratoIds:
          relacionados && relacionados.length ? [relacionados[0].id] : [],
        visivelParaCliente: true,
        description: "",
      });

      setPendingFiles(files);
      setIsUploadModalOpen(true);
    },
    [canManageDocumentos, selectedCliente, selectedProcesso],
  );

  const handleUploadModalClose = useCallback(() => {
    if (isUploading) return;

    setIsUploadModalOpen(false);
    setPendingFiles(null);
  }, [isUploading]);

  const performUpload = useCallback(async () => {
    if (!canManageDocumentos) {
      toast.error("Você não tem permissão para enviar documentos.");

      return;
    }

    if (!pendingFiles || !pendingFiles.length) {
      toast.error("Nenhum arquivo selecionado");

      return;
    }

    if (!selectedCliente) {
      toast.error("Selecione um cliente");

      return;
    }

    setIsUploading(true);

    try {
      for (const file of Array.from(pendingFiles)) {
        const formData = new FormData();

        formData.append("file", file);

        uploadOptions.processoIds.forEach((processoId) =>
          formData.append("processoIds", processoId),
        );
        uploadOptions.contratoIds.forEach((contratoId) =>
          formData.append("contratoIds", contratoId),
        );

        if (uploadOptions.causaId) {
          formData.append("causaId", uploadOptions.causaId);
        }

        const response = await uploadDocumentoExplorer(
          selectedCliente.id,
          uploadOptions.processoIds[0] ?? null,
          formData,
          {
            folderSegments: selectedFolderSegments,
            description: uploadOptions.description || undefined,
            visivelParaCliente: uploadOptions.visivelParaCliente,
          },
        );

        if (!response.success) {
          throw new Error(response.error || `Erro ao enviar ${file.name}`);
        }
      }

      toast.success("Upload concluído");
      setPendingFiles(null);
      setIsUploadModalOpen(false);
      await mutate();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Erro ao enviar documentos",
      );
    } finally {
      setIsUploading(false);
    }
  }, [
    canManageDocumentos,
    pendingFiles,
    selectedCliente,
    uploadOptions,
    selectedFolderSegments,
    mutate,
  ]);

  const handleUpload = useCallback(
    (files: FileList | null) => {
      if (!files?.length) return;

      openUploadModalForFiles(files);
    },
    [openUploadModalForFiles],
  );

  const handleDeleteFile = useCallback(
    async (documento: DocumentExplorerFile) => {
      if (!canDeleteDocumentos) {
        toast.error("Você não tem permissão para remover arquivos.");

        return;
      }

      const confirmDelete = confirm(`Remover o arquivo "${documento.nome}"?`);

      if (!confirmDelete) return;

      const result = await deleteExplorerFile({
        documentoId: documento.documentoId,
        versaoId: documento.versaoId,
      });

      if (!result.success) {
        toast.error(result.error || "Erro ao remover arquivo");

        return;
      }

      toast.success("Arquivo removido");
      await mutate();
    },
    [canDeleteDocumentos, mutate],
  );

  const clientesDisponiveis = useMemo(
    () => {
      const merged = new Map(
        initialClientes.map((cliente) => [cliente.id, { ...cliente }]),
      );

      if (data?.clientes.length) {
        for (const cliente of data.clientes) {
          merged.set(cliente.id, {
            id: cliente.id,
            nome: cliente.nome,
            documento: cliente.documento,
            email: cliente.email,
            telefone: cliente.telefone,
            processos: cliente.counts.processos,
          });
        }
      }

      return Array.from(merged.values()).sort((a, b) =>
        a.nome.localeCompare(b.nome, "pt-BR"),
      );
    },
    [data, initialClientes],
  );

  const filteredClientes = useMemo(() => {
    if (!searchTerm) return clientesDisponiveis;

    return clientesDisponiveis.filter((cliente) =>
      cliente.nome.toLowerCase().includes(searchTerm.toLowerCase()),
    );
  }, [clientesDisponiveis, searchTerm]);

  const canConfirmUpload = Boolean(
    pendingFiles?.length &&
      (uploadOptions.processoIds.length > 0 ||
        uploadOptions.contratoIds.length > 0),
  );

  const fileCount = pendingFiles?.length ?? 0;

  const displayError = error?.message ?? initialError;

  const hasActiveFilters = useMemo(() => {
    return (
      filtros.busca !== "" ||
      filtros.origem !== "TODOS" ||
      filtros.visibilidade !== "TODOS" ||
      filtros.dataUpload !== null ||
      filtros.tamanhoKB[0] !== 0 ||
      filtros.tamanhoKB[1] !== 512000
    );
  }, [filtros]);

  const clearFilters = () => {
    setFiltros({
      busca: "",
      origem: "TODOS",
      visibilidade: "TODOS",
      dataUpload: null,
      tamanhoKB: [0, 512000],
    });
  };

  if (!selectedClienteId) {
    return (
      <section className="mx-auto flex w-full max-w-4xl flex-col gap-6 py-12">
        <Card className="border border-default-100/20 bg-default-100/5">
          <CardBody className="flex flex-col gap-3">
            <p className="text-sm text-default-300">
              Selecione um cliente na lista para ver documentos e processos.
            </p>
          </CardBody>
        </Card>
      </section>
    );
  }

  if (!data && isLoading) {
    return (
      <section className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 py-12">
        <ExplorerSkeleton />
      </section>
    );
  }

  if (!data) {
    return (
      <section className="mx-auto flex w-full max-w-4xl flex-col gap-6 py-12">
        <Card className="border border-danger/20 bg-danger/10">
          <CardBody className="flex flex-col gap-3 text-danger-100">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5" />
              <span className="font-semibold">Erro ao carregar documentos</span>
            </div>
            <p className="text-sm text-danger-200/80">
              {displayError ||
                "Não foi possível recuperar a biblioteca de documentos."}
            </p>
            <div>
              <Button
                color="danger"
                startContent={<RefreshCw className="h-4 w-4" />}
                onPress={() => mutate()}
              >
                Tentar novamente
              </Button>
            </div>
          </CardBody>
        </Card>
      </section>
    );
  }

  return (
    <div className="container mx-auto space-y-6 p-6">
      <motion.div animate="visible" initial="hidden" variants={fadeInUp}>
        <PeoplePageHeader
          description="Organize documentos por cliente e processo com escopo de acesso, trilha de upload e filtros operacionais."
          tag="Gestao documental"
          title="Documentos"
          actions={
            <Button
              color="primary"
              isLoading={isValidating}
              size="sm"
              startContent={<RefreshCw className="h-4 w-4" />}
              variant="flat"
              onPress={() => mutate()}
            >
              Sincronizar
            </Button>
          }
        />
      </motion.div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <PeopleMetricCard
          helper="Base de clientes com documentos"
          icon={<Users className="h-4 w-4" />}
          label="Clientes"
          tone="primary"
          value={data.totals.clientes}
        />
        <PeopleMetricCard
          helper="Processos do cliente selecionado"
          icon={<Briefcase className="h-4 w-4" />}
          label="Processos"
          tone="success"
          value={selectedCliente?.processos.length ?? 0}
        />
        <PeopleMetricCard
          helper="Documentos cadastrados"
          icon={<FileText className="h-4 w-4" />}
          label="Documentos"
          tone="secondary"
          value={selectedCliente?.counts.documentos ?? 0}
        />
        <PeopleMetricCard
          helper="Arquivos e versões disponíveis"
          icon={<Files className="h-4 w-4" />}
          label="Arquivos"
          tone="warning"
          value={selectedCliente?.counts.arquivos ?? 0}
        />
      </div>

      {displayError ? (
        <PeoplePanel
          description={displayError}
          title="Aviso ao carregar dados"
        >
          <Button
            color="warning"
            size="sm"
            startContent={<RefreshCw className="h-4 w-4" />}
            variant="flat"
            onPress={() => mutate()}
          >
            Tentar novamente
          </Button>
        </PeoplePanel>
      ) : null}

      <PeoplePanel
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              color="warning"
              isDisabled={!hasActiveFilters}
              size="sm"
              startContent={<RotateCcw className="h-3.5 w-3.5" />}
              variant="flat"
              onPress={clearFilters}
            >
              Limpar filtros
            </Button>
            <Button
              color="primary"
              size="sm"
              startContent={
                showFilters ? (
                  <XCircle className="h-3.5 w-3.5" />
                ) : (
                  <Filter className="h-3.5 w-3.5" />
                )
              }
              variant="flat"
              onPress={() => setShowFilters((prev) => !prev)}
            >
              {showFilters ? "Ocultar" : "Exibir filtros"}
            </Button>
          </div>
        }
        description="Filtre rapidamente por nome, origem, visibilidade, período e tamanho do arquivo."
        title="Filtros de Documentos"
      >
        {showFilters ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <FilterSection
                description="Busque por nome e refine por origem/visibilidade."
                icon={Search}
                title="Identificação"
              >
                <div className="space-y-3">
                  <Input
                    label="Busca"
                    placeholder="Nome do arquivo ou descrição"
                    startContent={<Search className="h-4 w-4 text-default-400" />}
                    value={filtros.busca}
                    variant="bordered"
                    onValueChange={(value) =>
                      setFiltros((prev) => ({ ...prev, busca: value }))
                    }
                  />
                  <Select
                    label="Origem"
                    selectedKeys={[filtros.origem]}
                    onSelectionChange={(keys) => {
                      const [value] = Array.from(keys) as OrigemFiltro[];
                      setFiltros((prev) => ({ ...prev, origem: value }));
                    }}
                  >
                    <SelectItem key="TODOS" textValue="Todas">
                      Todas
                    </SelectItem>
                    <SelectItem key="CLIENTE" textValue="Cliente">
                      Cliente
                    </SelectItem>
                    <SelectItem key="ESCRITORIO" textValue="Escritório">
                      Escritório
                    </SelectItem>
                    <SelectItem key="SISTEMA" textValue="Sistema">
                      Sistema
                    </SelectItem>
                  </Select>
                  <Select
                    label="Visibilidade"
                    selectedKeys={[filtros.visibilidade]}
                    onSelectionChange={(keys) => {
                      const [value] = Array.from(keys) as VisibilidadeFiltro[];
                      setFiltros((prev) => ({ ...prev, visibilidade: value }));
                    }}
                  >
                    <SelectItem key="TODOS" textValue="Todos">
                      Todos
                    </SelectItem>
                    <SelectItem key="CLIENTE" textValue="Cliente">
                      Cliente
                    </SelectItem>
                    <SelectItem key="EQUIPE" textValue="Somente equipe">
                      Somente equipe
                    </SelectItem>
                  </Select>
                </div>
              </FilterSection>

              <FilterSection
                description="Controle por intervalo de upload."
                icon={Calendar}
                title="Período"
              >
                <DateRangeInput
                  label="Data de upload"
                  startValue={filtros.dataUpload?.start ?? ""}
                  endValue={filtros.dataUpload?.end ?? ""}
                  visibleMonths={1}
                  onRangeChange={({ start, end }) => {
                    if (!start || !end) {
                      setFiltros((prev) => ({
                        ...prev,
                        dataUpload: { start: null, end: null },
                      }));

                      return;
                    }
                    setFiltros((prev) => ({
                      ...prev,
                      dataUpload: { start, end },
                    }));
                  }}
                />
              </FilterSection>

              <FilterSection
                description="Ajuste a faixa de tamanho em KB."
                icon={Files}
                title="Tamanho"
              >
                <div className="space-y-3">
                  <Slider
                    label="Tamanho (KB)"
                    maxValue={512000}
                    minValue={0}
                    step={1024}
                    value={filtros.tamanhoKB}
                    onChange={(value) =>
                      setFiltros((prev) => ({
                        ...prev,
                        tamanhoKB: Array.isArray(value) ? value : [0, 512000],
                      }))
                    }
                  />
                  <div className="flex items-center justify-between text-xs text-default-500">
                    <span>{filtros.tamanhoKB[0]} KB</span>
                    <span>{filtros.tamanhoKB[1]} KB</span>
                  </div>
                </div>
              </FilterSection>
            </div>
            {hasActiveFilters ? (
              <div className="flex flex-wrap gap-2">
                {filtros.busca ? (
                  <Chip color="primary" size="sm" variant="flat">
                    Busca: {filtros.busca}
                  </Chip>
                ) : null}
                {filtros.origem !== "TODOS" ? (
                  <Chip color="secondary" size="sm" variant="flat">
                    Origem: {filtros.origem}
                  </Chip>
                ) : null}
                {filtros.visibilidade !== "TODOS" ? (
                  <Chip color="warning" size="sm" variant="flat">
                    Visibilidade: {filtros.visibilidade}
                  </Chip>
                ) : null}
                {filtros.dataUpload?.start && filtros.dataUpload?.end ? (
                  <Chip color="success" size="sm" variant="flat">
                    {new Date(filtros.dataUpload.start).toLocaleDateString("pt-BR")}{" "}
                    - {new Date(filtros.dataUpload.end).toLocaleDateString("pt-BR")}
                  </Chip>
                ) : null}
                {filtros.tamanhoKB[0] !== 0 || filtros.tamanhoKB[1] !== 512000 ? (
                  <Chip size="sm" variant="flat">
                    {filtros.tamanhoKB[0]} KB - {filtros.tamanhoKB[1]} KB
                  </Chip>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-default-500">
            Filtros recolhidos. Clique em <strong>Exibir filtros</strong> para ajustar.
          </p>
        )}
      </PeoplePanel>

      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <PeoplePanel
          description={`${filteredClientes.length} cliente(s) visível(is) no seu escopo.`}
          title="Clientes"
        >
          <div className="space-y-3">
            <Input
              aria-label="Buscar cliente"
              placeholder="Buscar cliente..."
              startContent={<Search className="h-4 w-4 text-default-400" />}
              value={searchTerm}
              variant="bordered"
              onValueChange={setSearchTerm}
            />
            <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
              <AnimatePresence mode="popLayout">
                {filteredClientes.map((cliente) => {
                  const isActive = cliente.id === selectedClienteId;

                  return (
                    <motion.button
                      key={cliente.id}
                      type="button"
                      layout
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                        isActive
                          ? "ml-wave-surface border-primary/50 bg-primary/10"
                          : "ml-wave-surface border-white/10 bg-background/60 hover:border-primary/30"
                      }`}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        handleSelectCliente(cliente.id);
                      }}
                    >
                      <p className="line-clamp-2 text-sm font-semibold text-foreground">
                        {cliente.nome}
                      </p>
                      <p className="text-xs text-default-400">
                        {cliente.processos} processo(s)
                      </p>
                    </motion.button>
                  );
                })}
              </AnimatePresence>
            </div>
          </div>
        </PeoplePanel>

        <div className="space-y-6">
          <PeoplePanel
            description={`${selectedCliente?.counts.processos ?? 0} processo(s) vinculados ao cliente selecionado.`}
            title="Processos"
          >
            <AnimatePresence mode="popLayout">
              {selectedCliente?.processos.length ? (
                <div className="space-y-2">
                  {selectedCliente.processos.map((processo) => {
                    const isActive = processo.id === selectedProcessoId;

                    return (
                      <motion.button
                        key={processo.id}
                        type="button"
                        layout
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                          isActive
                            ? "ml-wave-surface border-primary/50 bg-primary/10"
                            : "ml-wave-surface border-white/10 bg-background/60 hover:border-primary/30"
                        }`}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          handleSelectProcesso(processo.id);
                        }}
                      >
                        <p className="text-sm font-semibold text-foreground">
                          {processo.numero}
                        </p>
                        <p className="line-clamp-1 text-xs text-default-400">
                          {processo.titulo || "Sem título"}
                        </p>
                        <p className="pt-1 text-[11px] text-default-500">
                          {processo.counts.arquivos} arquivo(s) · {processo.status}
                        </p>
                      </motion.button>
                    );
                  })}
                </div>
              ) : (
                <div className="py-8 text-center text-sm text-default-500">
                  Nenhum processo vinculado ao cliente.
                </div>
              )}
            </AnimatePresence>
            {selectedCliente?.counts.processos ? (
              <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3">
                <p className="text-xs text-default-400">
                  Página {processosPage} de {processosTotalPages} ·{" "}
                  {selectedCliente.counts.processos} processo(s)
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    isDisabled={processosPage <= 1}
                    size="sm"
                    variant="flat"
                    onPress={() =>
                      setProcessosPage((prev) => Math.max(1, prev - 1))
                    }
                  >
                    Anterior
                  </Button>
                  <Button
                    isDisabled={processosPage >= processosTotalPages}
                    size="sm"
                    variant="flat"
                    onPress={() =>
                      setProcessosPage((prev) =>
                        Math.min(processosTotalPages, prev + 1),
                      )
                    }
                  >
                    Próxima
                  </Button>
                </div>
              </div>
            ) : null}
          </PeoplePanel>

          <PeoplePanel
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  color="primary"
                  isDisabled={!canManageDocumentos}
                  size="sm"
                  startContent={<FolderPlus className="h-3.5 w-3.5" />}
                  variant="flat"
                  onPress={handleCreateFolder}
                >
                  Nova pasta
                </Button>
                <Tooltip content="Renomear pasta selecionada">
                  <Button
                    isDisabled={!canManageDocumentos}
                    size="sm"
                    variant="flat"
                    onPress={handleRenameFolder}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </Tooltip>
                <Tooltip content="Excluir pasta selecionada">
                  <Button
                    color="danger"
                    isDisabled={!canDeleteDocumentos}
                    size="sm"
                    variant="flat"
                    onPress={handleDeleteFolder}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </Tooltip>
              </div>
            }
            description={
              selectedProcesso
                ? "Estrutura de pastas do processo selecionado."
                : "Estrutura de documentos gerais do cliente."
            }
            title="Explorador de Arquivos"
          >
            {!selectedCliente ? (
              <div className="py-10 text-center text-sm text-default-500">
                Selecione um cliente para abrir o explorador.
              </div>
            ) : !tree ? (
              <div className="py-10 text-center text-sm text-default-500">
                Nenhuma estrutura de pastas encontrada.
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
                <div className="rounded-xl border border-white/10 bg-background/60 p-3">
                  <FolderTree
                    root={tree}
                    selectedPath={selectedFolderSegments}
                    onSelectFolder={handleSelectFolder}
                  />
                </div>
                <div className="rounded-xl border border-white/10 bg-background/60">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <Folder className="h-4 w-4 text-primary" />
                      {selectedFolderSegments.length
                        ? selectedFolderSegments[selectedFolderSegments.length - 1]
                        : "Pasta principal"}
                    </div>
                    <Button
                      color="primary"
                      isDisabled={!canManageDocumentos}
                      isLoading={isUploading}
                      size="sm"
                      startContent={<UploadCloud className="h-3.5 w-3.5" />}
                      variant="flat"
                      onPress={() => {
                        if (isUploading || !canManageDocumentos) return;
                        const input = document.createElement("input");

                        input.type = "file";
                        input.multiple = true;
                        input.onchange = () => {
                          handleUpload(input.files);
                          input.value = "";
                        };
                        input.click();
                      }}
                    >
                      Enviar arquivos
                    </Button>
                  </div>
                  <div
                    className={`m-4 flex min-h-[160px] flex-col gap-3 rounded-lg border border-dashed border-white/20 p-4 text-sm text-default-500 ${
                      isUploading ? "opacity-60" : ""
                    }`}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (isUploading || !canManageDocumentos) return;
                      handleUpload(event.dataTransfer.files);
                    }}
                  >
                    <div className="flex items-center justify-center gap-2 text-default-400">
                      <UploadCloud className="h-4 w-4" />
                      {canManageDocumentos
                        ? "Arraste arquivos aqui ou use o botão de envio."
                        : "Acesso somente leitura."}
                    </div>
                    {filesInCurrentFolder.length ? (
                      <div className="space-y-2">
                        {pagedFiles.map((arquivo) => (
                          <div
                            key={`${arquivo.documentoId}-${arquivo.versaoId ?? "v1"}`}
                            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-background/80 px-3 py-2"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-foreground">
                                {arquivo.nome}
                              </p>
                              <p className="text-xs text-default-400">
                                {formatBytes(arquivo.tamanhoBytes)} ·{" "}
                                {formatDate(arquivo.uploadedAt)}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                as="a"
                                href={arquivo.url}
                                rel="noopener noreferrer"
                                size="sm"
                                target="_blank"
                                variant="flat"
                              >
                                Abrir
                              </Button>
                              {canDeleteDocumentos ? (
                                <Button
                                  color="danger"
                                  size="sm"
                                  variant="flat"
                                  onPress={() => handleDeleteFile(arquivo)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              ) : null}
                            </div>
                          </div>
                        ))}
                        {filesTotalPages > 1 ? (
                          <div className="flex items-center justify-between border-t border-white/10 pt-3">
                            <p className="text-xs text-default-400">
                              Página {filesPage} de {filesTotalPages} ·{" "}
                              {filesInCurrentFolder.length} arquivo(s)
                            </p>
                            <div className="flex items-center gap-2">
                              <Button
                                isDisabled={filesPage <= 1}
                                size="sm"
                                variant="flat"
                                onPress={() =>
                                  setFilesPage((prev) => Math.max(1, prev - 1))
                                }
                              >
                                Anterior
                              </Button>
                              <Button
                                isDisabled={filesPage >= filesTotalPages}
                                size="sm"
                                variant="flat"
                                onPress={() =>
                                  setFilesPage((prev) =>
                                    Math.min(filesTotalPages, prev + 1),
                                  )
                                }
                              >
                                Próxima
                              </Button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="flex flex-1 items-center justify-center text-xs text-default-500">
                        Nenhum arquivo nesta pasta.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </PeoplePanel>
        </div>
      </div>

      <Card className="border border-white/10 bg-background/70">
        <CardBody className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-xs text-default-400">
            <Sparkles className="h-4 w-4 text-primary/80" />
            <span>
              Estrutura sincronizada em{" "}
              {data.generatedAt ? formatDate(data.generatedAt) : "--"}
            </span>
          </div>
          {canManageDocumentos ? (
            <span className="text-xs text-default-500">
              Base Cloudinary:{" "}
              <code className="rounded bg-default-100/20 px-2 py-1 text-default-300">
                magiclawyer/{data.tenantSlug}
              </code>
            </span>
          ) : (
            <span className="text-xs text-default-500">
              Biblioteca sincronizada para o seu escopo de acesso.
            </span>
          )}
        </CardBody>
      </Card>

      <UploadOptionsModal
        canConfirm={canConfirmUpload}
        causas={data?.catalogos.causas ?? []}
        cliente={selectedCliente ?? null}
        contratos={selectedCliente?.contratos ?? []}
        fileCount={fileCount}
        isOpen={isUploadModalOpen}
        isSubmitting={isUploading}
        processos={selectedCliente?.processos ?? []}
        setUploadOptions={setUploadOptions}
        uploadOptions={uploadOptions}
        onClose={handleUploadModalClose}
        onConfirm={performUpload}
      />
    </div>
  );
}

interface FolderTreeProps {
  root: ExplorerTreeNode;
  selectedPath: string[];
  onSelectFolder: (segments: string[]) => void;
}

function FolderTree({ root, selectedPath, onSelectFolder }: FolderTreeProps) {
  const renderNode = (node: ExplorerTreeNode) => {
    const isRoot = node.relativeSegments.length === 0;
    const isActive = node.id === selectedPath.join("/");

    return (
      <div key={node.id} className="ml-2 border-l border-slate-300 dark:border-slate-600 pl-3">
        {!isRoot && (
          <button
            className={`ml-wave-surface mb-1 flex w-full items-center justify-between rounded-lg px-2 py-1 text-left text-sm transition ${isActive ? "bg-primary/15 text-primary-100 border-2 border-primary/30" : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 border-2 border-transparent"}`}
            onClick={() => onSelectFolder(node.relativeSegments)}
          >
            <span className="flex items-center gap-2">
              <Folder className="h-3.5 w-3.5" />
              {node.name || "pasta"}
            </span>
            {node.files.length > 0 && (
              <Chip color="primary" size="sm" variant="flat">
                {node.files.length}
              </Chip>
            )}
          </button>
        )}
        {node.children.map((child) => renderNode(child))}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-2">
      <button
        className={`ml-wave-surface flex items-center justify-between rounded-lg px-2 py-2 text-sm font-medium transition border-2 ${selectedPath.length === 0 ? "bg-primary/20 text-primary-100 border-primary/30" : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border-transparent"}`}
        onClick={() => onSelectFolder([])}
      >
        <span className="flex items-center gap-2">
          <Folder className="h-4 w-4" />
          Pasta principal
        </span>
        {root.files.length > 0 && (
          <Chip color="primary" size="sm" variant="flat">
            {root.files.length}
          </Chip>
        )}
      </button>
      {root.children.map((child) => renderNode(child))}
    </div>
  );
}

function ExplorerSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-32 rounded-lg" isLoaded={false} />
          <Skeleton className="h-6 w-72 rounded-lg" isLoaded={false} />
          <Skeleton className="h-3 w-60 rounded-lg" isLoaded={false} />
        </div>
        <Skeleton className="h-9 w-28 rounded-full" isLoaded={false} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card
            key={index}
            className="border border-default-100/20 bg-default-50/10"
          >
            <CardBody className="space-y-3">
              <Skeleton className="h-3 w-20 rounded-lg" isLoaded={false} />
              <Skeleton className="h-8 w-16 rounded-lg" isLoaded={false} />
            </CardBody>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <Card className="border border-default-100/20 bg-default-50/10">
          <CardBody className="space-y-4">
            <Skeleton className="h-10 w-full rounded-lg" isLoaded={false} />
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton
                key={index}
                className="h-12 w-full rounded-xl"
                isLoaded={false}
              />
            ))}
          </CardBody>
        </Card>
        <Card className="border border-default-100/20 bg-default-50/10">
          <CardBody className="space-y-4">
            <Skeleton className="h-10 w-full rounded-lg" isLoaded={false} />
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton
                key={index}
                className="h-20 w-full rounded-xl"
                isLoaded={false}
              />
            ))}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

interface UploadOptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isSubmitting: boolean;
  canConfirm: boolean;
  fileCount: number;
  cliente: DocumentExplorerCliente | null;
  processos: DocumentExplorerProcess[];
  contratos: DocumentExplorerContrato[];
  causas: DocumentExplorerCatalogoCausa[];
  uploadOptions: UploadOptionsState;
  setUploadOptions: React.Dispatch<React.SetStateAction<UploadOptionsState>>;
}

function UploadOptionsModal({
  isOpen,
  onClose,
  onConfirm,
  isSubmitting,
  canConfirm,
  fileCount,
  cliente,
  processos,
  contratos,
  causas,
  uploadOptions,
  setUploadOptions,
}: UploadOptionsModalProps) {
  const handleToggleProcesso = (processoId: string, selected: boolean) => {
    setUploadOptions((prev) => {
      const next = new Set(prev.processoIds);

      if (selected) {
        next.add(processoId);
      } else {
        next.delete(processoId);
      }

      return {
        ...prev,
        processoIds: Array.from(next),
      };
    });
  };

  const handleToggleContrato = (contratoId: string, selected: boolean) => {
    setUploadOptions((prev) => {
      const next = new Set(prev.contratoIds);

      if (selected) {
        next.add(contratoId);
      } else {
        next.delete(contratoId);
      }

      return {
        ...prev,
        contratoIds: Array.from(next),
      };
    });
  };

  const causasKeySet = useMemo(
    () => new Set(causas.map((causa) => causa.id)),
    [causas],
  );
  const causaKeys =
    uploadOptions.causaId && causasKeySet.has(uploadOptions.causaId)
      ? [uploadOptions.causaId]
      : ["__none"];

  return (
    <Modal
      isOpen={isOpen}
      size="lg"
      onOpenChange={(open) => {
        if (!open && !isSubmitting) {
          onClose();
        }
      }}
    >
      <ModalContent>
        {(close) => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              <h3 className="text-lg font-semibold text-default-900">
                Configurar upload
              </h3>
              <p className="text-sm text-default-500">
                {fileCount} arquivo{fileCount === 1 ? "" : "s"} selecionado
              </p>
            </ModalHeader>
            <ModalBody className="space-y-4">
              {!cliente ? (
                <p className="text-sm text-default-500">
                  Selecione um cliente para vincular os documentos.
                </p>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Select
                      label="Causa"
                      placeholder="Opcional"
                      selectedKeys={causaKeys}
                      onSelectionChange={(keys) => {
                        const [value] = Array.from(keys) as string[];

                        setUploadOptions((prev) => ({
                          ...prev,
                          causaId: value && value !== "__none" ? value : null,
                        }));
                      }}
                    >
                      {[
                        <SelectItem key="__none" textValue="Sem causa específica">
                          Sem causa específica
                        </SelectItem>,
                        ...causas.map((causa) => (
                          <SelectItem
                            key={causa.id}
                            textValue={`${causa.nome}${causa.codigoCnj ? ` · ${causa.codigoCnj}` : ""}`}
                          >
                            {causa.nome}
                            {causa.codigoCnj ? ` · ${causa.codigoCnj}` : ""}
                          </SelectItem>
                        )),
                      ]}
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-default-600">
                      Processos vinculados
                    </p>
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {processos.length ? (
                        processos.map((processo) => (
                          <Checkbox
                            key={processo.id}
                            isSelected={uploadOptions.processoIds.includes(
                              processo.id,
                            )}
                            onValueChange={(selected) =>
                              handleToggleProcesso(processo.id, selected)
                            }
                          >
                            <div className="flex flex-col">
                              <span className="text-sm font-medium text-default-600">
                                {processo.numero}
                              </span>
                              <span className="text-xs text-default-400">
                                {processo.titulo || "Sem título"}
                              </span>
                            </div>
                          </Checkbox>
                        ))
                      ) : (
                        <p className="text-xs text-default-500">
                          Nenhum processo disponível para este cliente.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-default-600">
                      Contratos relacionados
                    </p>
                    <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                      {contratos.length ? (
                        contratos.map((contrato) => (
                          <Checkbox
                            key={contrato.id}
                            isSelected={uploadOptions.contratoIds.includes(
                              contrato.id,
                            )}
                            onValueChange={(selected) =>
                              handleToggleContrato(contrato.id, selected)
                            }
                          >
                            <div className="flex flex-col">
                              <span className="text-sm font-medium text-default-600">
                                {contrato.titulo}
                              </span>
                              {contrato.processoId && (
                                <span className="text-xs text-default-400">
                                  Vinculado ao processo {contrato.processoId}
                                </span>
                              )}
                            </div>
                          </Checkbox>
                        ))
                      ) : (
                        <p className="text-xs text-default-500">
                          Nenhum contrato vinculado ao cliente.
                        </p>
                      )}
                    </div>
                  </div>

                  <Textarea
                    label="Descrição"
                    placeholder="Observações internas sobre este documento"
                    value={uploadOptions.description}
                    onValueChange={(value) =>
                      setUploadOptions((prev) => ({
                        ...prev,
                        description: value,
                      }))
                    }
                  />

                  <Switch
                    isSelected={uploadOptions.visivelParaCliente}
                    onValueChange={(selected) =>
                      setUploadOptions((prev) => ({
                        ...prev,
                        visivelParaCliente: selected,
                      }))
                    }
                  >
                    Permitir visualização pelo cliente
                  </Switch>
                </div>
              )}
            </ModalBody>
            <ModalFooter>
              <Button
                disabled={isSubmitting}
                variant="light"
                onPress={() => {
                  if (isSubmitting) return;

                  close();
                  onClose();
                }}
              >
                Cancelar
              </Button>
              <Button
                color="primary"
                isDisabled={!canConfirm || !cliente || isSubmitting}
                isLoading={isSubmitting}
                onPress={onConfirm}
              >
                Confirmar upload
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
