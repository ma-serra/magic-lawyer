"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Archive,
  Calendar,
  CheckCircle,
  Clock,
  Edit3,
  ExternalLink,
  FileCheck,
  FileSearch,
  FileText,
  Filter,
  History,
  Plus,
  Scale,
  Search,
  Trash2,
  User,
  UserCheck,
  X,
} from "lucide-react";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  Chip,
  Divider,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Pagination,
  Select,
  SelectItem,
  Spinner,
  Textarea,
} from "@heroui/react";
import type { DateValue } from "@internationalized/date";
import type { RangeValue } from "@react-types/shared";

import {
  archiveDiligencia,
  bulkUpdateDiligencias,
  createDiligencia,
  deleteDiligencia,
  listDiligenciaHistorico,
  listDiligencias,
  updateDiligencia,
} from "@/app/actions/diligencias";
import { listCausas } from "@/app/actions/causas";
import { listRegimesPrazo } from "@/app/actions/regimes-prazo";
import { getClientesComRelacionamentos } from "@/app/actions/clientes";
import { getUsuariosParaSelect } from "@/app/actions/usuarios";
import { DateInput } from "@/components/ui/date-input";
import { DateRangeInput } from "@/components/ui/date-range-input";
import {
  PeopleEntityCard,
  PeopleEntityCardBody,
  PeopleMetricCard,
  PeoplePageHeader,
} from "@/components/people-ui";
import { toast } from "@/lib/toast";
import { DateUtils } from "@/app/lib/date-utils";
import {
  Causa,
  Cliente,
  Contrato,
  Diligencia,
  DiligenciaStatus,
  Processo,
  RegimePrazo,
  Usuario,
} from "@/generated/prisma";

type DiligenciaComRelacionamentos = Diligencia & {
  processo?:
    | (Pick<Processo, "id" | "numero" | "titulo" | "clienteId"> & {
        cliente?: Pick<Cliente, "id" | "nome"> | null;
      })
    | null;
  causa?: Pick<Causa, "id" | "nome" | "codigoCnj"> | null;
  contrato?: Pick<Contrato, "id" | "titulo" | "clienteId" | "processoId"> | null;
  regimePrazo?: Pick<RegimePrazo, "id" | "nome" | "tipo"> | null;
  responsavel?: Pick<Usuario, "id" | "firstName" | "lastName" | "email"> | null;
  criadoPor?: Pick<Usuario, "id" | "firstName" | "lastName" | "email"> | null;
};

type ClienteComRelacionamentos = Cliente & {
  processos: Array<Pick<Processo, "id" | "numero" | "titulo" | "clienteId">>;
  contratos: Array<Pick<Contrato, "id" | "titulo" | "clienteId" | "processoId">>;
};

interface DiligenciaFormData {
  clienteId: string;
  processoId: string;
  contratoId: string;
  causaId: string;
  regimePrazoId: string;
  titulo: string;
  tipo: string;
  descricao: string;
  responsavelId: string;
  prazoPrevisto: string;
}

interface DiligenciaEditFormData extends DiligenciaFormData {
  status: DiligenciaStatus;
  observacoes: string;
  prazoConclusao: string;
}

interface FiltrosDiligencias {
  busca: string;
  status: string;
  clienteId: string;
  processoId: string;
  responsavelId: string;
  prazoRange: RangeValue<DateValue> | null;
}

interface DiligenciaHistoricoItem {
  id: string;
  acao: string;
  createdAt: string | Date;
  changedFields: string[];
  dados?: Record<string, unknown> | null;
  usuario?: Pick<Usuario, "id" | "firstName" | "lastName" | "email"> | null;
}

type BulkAction =
  | { type: "status"; status: DiligenciaStatus; label: string }
  | { type: "assign"; responsavelId: string; label: string }
  | { type: "unassign"; label: string }
  | { type: "archive"; label: string };

const STATUS_CONFIG: Record<
  DiligenciaStatus,
  {
    label: string;
    chipColor: "default" | "primary" | "success" | "warning" | "danger" | "secondary";
    icon: typeof Clock;
  }
> = {
  PENDENTE: {
    label: "Pendente",
    chipColor: "warning",
    icon: Clock,
  },
  EM_ANDAMENTO: {
    label: "Em andamento",
    chipColor: "primary",
    icon: FileSearch,
  },
  CONCLUIDA: {
    label: "Concluída",
    chipColor: "success",
    icon: CheckCircle,
  },
  CANCELADA: {
    label: "Cancelada",
    chipColor: "danger",
    icon: X,
  },
};

const STATUS_ITEMS = Object.entries(STATUS_CONFIG).map(([key, config]) => ({
  key: key as DiligenciaStatus,
  ...config,
}));

const defaultFormState: DiligenciaFormData = {
  clienteId: "",
  processoId: "",
  contratoId: "",
  causaId: "",
  regimePrazoId: "",
  titulo: "",
  tipo: "",
  descricao: "",
  responsavelId: "",
  prazoPrevisto: "",
};

const defaultEditState: DiligenciaEditFormData = {
  ...defaultFormState,
  status: DiligenciaStatus.PENDENTE,
  observacoes: "",
  prazoConclusao: "",
};

const defaultFiltros: FiltrosDiligencias = {
  busca: "",
  status: "",
  clienteId: "",
  processoId: "",
  responsavelId: "",
  prazoRange: null,
};

const causasFetcher = async () => {
  const result = await listCausas();

  if (!result.success) {
    throw new Error(result.error || "Erro ao carregar causas");
  }

  return (result.causas || []) as Causa[];
};

const regimesFetcher = async () => {
  const result = await listRegimesPrazo();

  if (!result.success) {
    throw new Error(result.error || "Erro ao carregar regimes de prazo");
  }

  return (result.regimes || []) as RegimePrazo[];
};

const clientesFetcher = async () => {
  const result = await getClientesComRelacionamentos();

  if (!result.success) {
    throw new Error(result.error || "Erro ao carregar clientes");
  }

  return (result.clientes || []) as ClienteComRelacionamentos[];
};

const usuariosFetcher = async () => {
  const result = await getUsuariosParaSelect();

  if (!result.success) {
    throw new Error(result.error || "Erro ao carregar responsáveis");
  }

  return (result.usuarios || []) as Usuario[];
};

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "-";

  const parsed = typeof date === "string" ? new Date(date) : date;

  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }

  return parsed.toLocaleDateString("pt-BR");
}

function formatResponsavel(usuario?: Pick<Usuario, "firstName" | "lastName" | "email"> | null): string {
  if (!usuario) {
    return "Não definido";
  }

  const fullName = [usuario.firstName, usuario.lastName].filter(Boolean).join(" ").trim();

  return fullName || usuario.email;
}

function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return "-";
  const parsed = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("pt-BR");
}

function toDateInputValue(date: Date | string | null | undefined): string {
  if (!date) return "";
  const parsed = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function buildEditStateFromDiligencia(
  diligencia: DiligenciaComRelacionamentos,
): DiligenciaEditFormData {
  const clienteId =
    diligencia.processo?.clienteId || diligencia.contrato?.clienteId || "";

  return {
    clienteId,
    processoId: diligencia.processoId || "",
    contratoId: diligencia.contratoId || "",
    causaId: diligencia.causaId || "",
    regimePrazoId: diligencia.regimePrazoId || "",
    titulo: diligencia.titulo || "",
    tipo: diligencia.tipo || "",
    descricao: diligencia.descricao || "",
    responsavelId: diligencia.responsavelId || "",
    prazoPrevisto: toDateInputValue(diligencia.prazoPrevisto),
    status: diligencia.status || DiligenciaStatus.PENDENTE,
    observacoes: diligencia.observacoes || "",
    prazoConclusao: toDateInputValue(diligencia.prazoConclusao),
  };
}

function useSafeSelectedKeys(value: string, validKeys: Set<string>) {
  return useMemo(() => {
    if (!value || !validKeys.has(value)) {
      return [] as string[];
    }

    return [value];
  }, [value, validKeys]);
}

export function DiligenciasContent() {
  const router = useRouter();
  const [filtros, setFiltros] = useState<FiltrosDiligencias>(defaultFiltros);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isCreateSubmitting, setIsCreateSubmitting] = useState(false);
  const [createState, setCreateState] = useState<DiligenciaFormData>(defaultFormState);
  const [selectedDiligencia, setSelectedDiligencia] =
    useState<DiligenciaComRelacionamentos | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkResponsavelId, setBulkResponsavelId] = useState("");
  const [pendingBulkAction, setPendingBulkAction] = useState<BulkAction | null>(null);
  const [isBulkConfirmOpen, setIsBulkConfirmOpen] = useState(false);
  const [isBulkSubmitting, setIsBulkSubmitting] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isEditSubmitting, setIsEditSubmitting] = useState(false);
  const [editState, setEditState] = useState<DiligenciaEditFormData>(defaultEditState);
  const [editingDiligenciaId, setEditingDiligenciaId] = useState<string | null>(null);
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);
  const [archiveObservacoes, setArchiveObservacoes] = useState("");
  const [isArchiveSubmitting, setIsArchiveSubmitting] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState("");
  const [isDeleteSubmitting, setIsDeleteSubmitting] = useState(false);

  const prazoInicio = filtros.prazoRange?.start
    ? DateUtils.fromCalendarDate(filtros.prazoRange.start).format("YYYY-MM-DD")
    : undefined;
  const prazoFim = filtros.prazoRange?.end
    ? DateUtils.fromCalendarDate(filtros.prazoRange.end).format("YYYY-MM-DD")
    : undefined;

  const diligenciasQuery = useSWR(
    [
      "diligencias",
      filtros.busca,
      filtros.status,
      filtros.clienteId,
      filtros.processoId,
      filtros.responsavelId,
      prazoInicio,
      prazoFim,
      page,
      pageSize,
    ],
    () =>
      listDiligencias({
        busca: filtros.busca || undefined,
        status: (filtros.status || undefined) as DiligenciaStatus | undefined,
        clienteId: filtros.clienteId || undefined,
        processoId: filtros.processoId || undefined,
        responsavelId: filtros.responsavelId || undefined,
        prazoInicio,
        prazoFim,
        page,
        pageSize,
      }),
    {
      revalidateOnFocus: false,
      keepPreviousData: true,
    },
  );

  const clientesQuery = useSWR("diligencias-clientes", clientesFetcher, {
    revalidateOnFocus: false,
  });
  const causasQuery = useSWR("diligencias-causas", causasFetcher, {
    revalidateOnFocus: false,
  });
  const regimesQuery = useSWR("diligencias-regimes", regimesFetcher, {
    revalidateOnFocus: false,
  });
  const usuariosQuery = useSWR("diligencias-usuarios", usuariosFetcher, {
    revalidateOnFocus: false,
  });
  const historicoQuery = useSWR(
    selectedDiligencia ? ["diligencia-historico", selectedDiligencia.id] : null,
    () => listDiligenciaHistorico(selectedDiligencia!.id),
    { revalidateOnFocus: false },
  );

  const diligencias = useMemo(() => {
    if (!diligenciasQuery.data?.success) {
      return [] as DiligenciaComRelacionamentos[];
    }

    return (diligenciasQuery.data.diligencias || []) as DiligenciaComRelacionamentos[];
  }, [diligenciasQuery.data]);

  const summary = useMemo(
    () =>
      diligenciasQuery.data?.success
        ?
            diligenciasQuery.data.summary || {
              total: 0,
              pendentes: 0,
              emAndamento: 0,
              concluidas: 0,
              canceladas: 0,
              atrasadas: 0,
              semResponsavel: 0,
            }
        : {
            total: 0,
            pendentes: 0,
            emAndamento: 0,
            concluidas: 0,
            canceladas: 0,
            atrasadas: 0,
            semResponsavel: 0,
          },
    [diligenciasQuery.data],
  );

  const meta = useMemo(
    () =>
      diligenciasQuery.data?.success
        ?
            diligenciasQuery.data.meta || {
              total: 0,
              page: 1,
              pageSize,
              totalPages: 1,
              hasNextPage: false,
              hasPreviousPage: false,
            }
        : {
            total: 0,
            page,
            pageSize,
            totalPages: 1,
            hasNextPage: false,
            hasPreviousPage: false,
          },
    [diligenciasQuery.data, page, pageSize],
  );

  const clientes = useMemo(() => clientesQuery.data || [], [clientesQuery.data]);
  const causas = useMemo(() => causasQuery.data || [], [causasQuery.data]);
  const regimes = useMemo(() => regimesQuery.data || [], [regimesQuery.data]);
  const usuarios = useMemo(() => usuariosQuery.data || [], [usuariosQuery.data]);
  const historico = useMemo(
    () => {
      if (!historicoQuery.data?.success) {
        return [] as DiligenciaHistoricoItem[];
      }

      const historicoRaw = historicoQuery.data.historico;
      return Array.isArray(historicoRaw)
        ? (historicoRaw as DiligenciaHistoricoItem[])
        : [];
    },
    [historicoQuery.data],
  );

  const processosFiltro = useMemo(() => {
    if (filtros.clienteId) {
      const cliente = clientes.find((item) => item.id === filtros.clienteId);
      return cliente?.processos || [];
    }

    return clientes.flatMap((item) => item.processos || []);
  }, [clientes, filtros.clienteId]);

  const selectedClienteCreate = useMemo(
    () => clientes.find((cliente) => cliente.id === createState.clienteId) || null,
    [clientes, createState.clienteId],
  );
  const selectedClienteEdit = useMemo(
    () => clientes.find((cliente) => cliente.id === editState.clienteId) || null,
    [clientes, editState.clienteId],
  );

  const processosDoClienteCreate = selectedClienteCreate?.processos || [];
  const contratosDoClienteCreate = selectedClienteCreate?.contratos || [];
  const processosDoClienteEdit = selectedClienteEdit?.processos || [];
  const contratosDoClienteEdit = selectedClienteEdit?.contratos || [];

  const clienteFilterKeySet = useMemo(
    () => new Set(clientes.map((cliente) => cliente.id)),
    [clientes],
  );
  const processoFilterKeySet = useMemo(
    () => new Set(processosFiltro.map((processo) => processo.id)),
    [processosFiltro],
  );
  const usuarioFilterKeySet = useMemo(
    () => new Set(usuarios.map((usuario) => usuario.id)),
    [usuarios],
  );

  const clienteCreateKeySet = clienteFilterKeySet;
  const processoCreateKeySet = useMemo(
    () => new Set(processosDoClienteCreate.map((processo) => processo.id)),
    [processosDoClienteCreate],
  );
  const contratoCreateKeySet = useMemo(
    () => new Set(contratosDoClienteCreate.map((contrato) => contrato.id)),
    [contratosDoClienteCreate],
  );
  const causaCreateKeySet = useMemo(
    () => new Set(causas.map((causa) => causa.id)),
    [causas],
  );
  const regimeCreateKeySet = useMemo(
    () => new Set(regimes.map((regime) => regime.id)),
    [regimes],
  );
  const usuarioCreateKeySet = usuarioFilterKeySet;
  const clienteEditKeySet = clienteFilterKeySet;
  const processoEditKeySet = useMemo(
    () => new Set(processosDoClienteEdit.map((processo) => processo.id)),
    [processosDoClienteEdit],
  );
  const contratoEditKeySet = useMemo(
    () => new Set(contratosDoClienteEdit.map((contrato) => contrato.id)),
    [contratosDoClienteEdit],
  );
  const causaEditKeySet = causaCreateKeySet;
  const regimeEditKeySet = regimeCreateKeySet;
  const usuarioEditKeySet = usuarioFilterKeySet;

  const selectedClienteFilterKeys = useSafeSelectedKeys(
    filtros.clienteId,
    clienteFilterKeySet,
  );
  const selectedProcessoFilterKeys = useSafeSelectedKeys(
    filtros.processoId,
    processoFilterKeySet,
  );
  const selectedResponsavelFilterKeys = useSafeSelectedKeys(
    filtros.responsavelId,
    usuarioFilterKeySet,
  );
  const selectedStatusFilterKeys = useMemo(() => {
    if (!filtros.status) {
      return [] as string[];
    }

    return [filtros.status];
  }, [filtros.status]);

  const selectedClienteCreateKeys = useSafeSelectedKeys(
    createState.clienteId,
    clienteCreateKeySet,
  );
  const selectedProcessoCreateKeys = useSafeSelectedKeys(
    createState.processoId,
    processoCreateKeySet,
  );
  const selectedContratoCreateKeys = useSafeSelectedKeys(
    createState.contratoId,
    contratoCreateKeySet,
  );
  const selectedCausaCreateKeys = useSafeSelectedKeys(
    createState.causaId,
    causaCreateKeySet,
  );
  const selectedRegimeCreateKeys = useSafeSelectedKeys(
    createState.regimePrazoId,
    regimeCreateKeySet,
  );
  const selectedResponsavelCreateKeys = useSafeSelectedKeys(
    createState.responsavelId,
    usuarioCreateKeySet,
  );
  const selectedClienteEditKeys = useSafeSelectedKeys(
    editState.clienteId,
    clienteEditKeySet,
  );
  const selectedProcessoEditKeys = useSafeSelectedKeys(
    editState.processoId,
    processoEditKeySet,
  );
  const selectedContratoEditKeys = useSafeSelectedKeys(
    editState.contratoId,
    contratoEditKeySet,
  );
  const selectedCausaEditKeys = useSafeSelectedKeys(
    editState.causaId,
    causaEditKeySet,
  );
  const selectedRegimeEditKeys = useSafeSelectedKeys(
    editState.regimePrazoId,
    regimeEditKeySet,
  );
  const selectedResponsavelEditKeys = useSafeSelectedKeys(
    editState.responsavelId,
    usuarioEditKeySet,
  );
  const selectedStatusEditKeys = useMemo(
    () => [editState.status],
    [editState.status],
  );
  const selectedBulkResponsavelKeys = useSafeSelectedKeys(
    bulkResponsavelId,
    usuarioFilterKeySet,
  );

  const isLoading = diligenciasQuery.isLoading;
  const hasAnyFilter =
    Boolean(filtros.busca) ||
    Boolean(filtros.status) ||
    Boolean(filtros.clienteId) ||
    Boolean(filtros.processoId) ||
    Boolean(filtros.responsavelId) ||
    Boolean(filtros.prazoRange);
  const selectedIdsSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const visibleIds = useMemo(() => diligencias.map((item) => item.id), [diligencias]);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIdsSet.has(id));
  const selectedCount = selectedIds.length;

  useEffect(() => {
    setPage((prev) => Math.min(prev, meta.totalPages));
  }, [meta.totalPages]);

  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => visibleIds.includes(id)));
  }, [visibleIds]);

  useEffect(() => {
    setPage(1);
  }, [
    filtros.busca,
    filtros.status,
    filtros.clienteId,
    filtros.processoId,
    filtros.responsavelId,
    filtros.prazoRange,
    pageSize,
  ]);

  const clearFilters = () => {
    setFiltros(defaultFiltros);
  };

  const openCreateModal = () => {
    setCreateState(defaultFormState);
    setIsCreateOpen(true);
  };

  const handleClienteCreateChange = (clienteId: string) => {
    setCreateState((prev) => ({
      ...prev,
      clienteId,
      processoId: "",
      contratoId: "",
    }));
  };

  const handleCreateDiligencia = useCallback(async () => {
    if (!createState.titulo.trim()) {
      toast.error("Informe o título da diligência");
      return;
    }

    setIsCreateSubmitting(true);

    try {
      const result = await createDiligencia({
        titulo: createState.titulo.trim(),
        tipo: createState.tipo.trim() || null,
        descricao: createState.descricao.trim() || null,
        processoId: createState.processoId || null,
        contratoId: createState.contratoId || null,
        causaId: createState.causaId || null,
        regimePrazoId: createState.regimePrazoId || null,
        responsavelId: createState.responsavelId || null,
        prazoPrevisto: createState.prazoPrevisto || null,
      });

      if (!result.success) {
        toast.error(result.error || "Não foi possível criar a diligência");
        return;
      }

      toast.success("Diligência criada com sucesso");
      setIsCreateOpen(false);
      setCreateState(defaultFormState);
      await diligenciasQuery.mutate();
    } catch {
      toast.error("Erro interno ao criar diligência");
    } finally {
      setIsCreateSubmitting(false);
    }
  }, [createState, diligenciasQuery]);

  const handleStatusChange = useCallback(
    async (diligencia: DiligenciaComRelacionamentos, status: DiligenciaStatus) => {
      if (status === diligencia.status) {
        return;
      }

      const result = await updateDiligencia(diligencia.id, { status });

      if (!result.success) {
        toast.error(result.error || "Erro ao atualizar status");
        return;
      }

      toast.success("Status atualizado com sucesso");
      await diligenciasQuery.mutate();

      if (selectedDiligencia?.id === diligencia.id) {
        setSelectedDiligencia((prev) =>
          prev
            ? {
                ...prev,
                status,
              }
            : prev,
        );
      }
    },
    [diligenciasQuery, selectedDiligencia?.id],
  );

  const handleToggleSelectDiligencia = useCallback(
    (diligenciaId: string, checked: boolean) => {
      setSelectedIds((prev) => {
        if (checked) {
          return Array.from(new Set([...prev, diligenciaId]));
        }
        return prev.filter((id) => id !== diligenciaId);
      });
    },
    [],
  );

  const handleToggleSelectAllVisible = useCallback(
    (checked: boolean) => {
      if (checked) {
        setSelectedIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
        return;
      }
      setSelectedIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
    },
    [visibleIds],
  );

  const openEditModal = useCallback((diligencia: DiligenciaComRelacionamentos) => {
    setEditingDiligenciaId(diligencia.id);
    setEditState(buildEditStateFromDiligencia(diligencia));
    setIsEditOpen(true);
  }, []);

  const handleClienteEditChange = useCallback((clienteId: string) => {
    setEditState((prev) => ({
      ...prev,
      clienteId,
      processoId: "",
      contratoId: "",
    }));
  }, []);

  const handleEditDiligencia = useCallback(async () => {
    const targetDiligenciaId = editingDiligenciaId || selectedDiligencia?.id;
    if (!targetDiligenciaId) {
      return;
    }

    if (!editState.titulo.trim()) {
      toast.error("Informe o título da diligência");
      return;
    }

    setIsEditSubmitting(true);

    try {
      const result = await updateDiligencia(targetDiligenciaId, {
        titulo: editState.titulo.trim(),
        tipo: editState.tipo.trim() || null,
        descricao: editState.descricao.trim() || null,
        processoId: editState.processoId || null,
        contratoId: editState.contratoId || null,
        causaId: editState.causaId || null,
        regimePrazoId: editState.regimePrazoId || null,
        responsavelId: editState.responsavelId || null,
        prazoPrevisto: editState.prazoPrevisto || null,
        prazoConclusao: editState.prazoConclusao || null,
        status: editState.status,
        observacoes: editState.observacoes.trim() || null,
      });

      if (!result.success || !result.diligencia) {
        toast.error(result.error || "Não foi possível atualizar a diligência");
        return;
      }

      toast.success("Diligência atualizada com sucesso");
      setSelectedDiligencia(result.diligencia as DiligenciaComRelacionamentos);
      setEditingDiligenciaId(null);
      setIsEditOpen(false);
      await Promise.all([diligenciasQuery.mutate(), historicoQuery.mutate()]);
    } catch {
      toast.error("Erro interno ao atualizar diligência");
    } finally {
      setIsEditSubmitting(false);
    }
  }, [diligenciasQuery, editState, editingDiligenciaId, historicoQuery, selectedDiligencia?.id]);

  const handleOpenArchiveModal = useCallback(() => {
    if (!selectedDiligencia) return;
    setArchiveObservacoes(selectedDiligencia.observacoes || "");
    setIsArchiveOpen(true);
  }, [selectedDiligencia]);

  const handleConfirmArchive = useCallback(async () => {
    if (!selectedDiligencia) return;

    setIsArchiveSubmitting(true);

    try {
      const result = await archiveDiligencia(
        selectedDiligencia.id,
        archiveObservacoes || null,
      );

      if (!result.success || !result.diligencia) {
        toast.error(result.error || "Não foi possível arquivar a diligência");
        return;
      }

      toast.success("Diligência arquivada com sucesso");
      setSelectedDiligencia(result.diligencia as DiligenciaComRelacionamentos);
      setIsArchiveOpen(false);
      await Promise.all([diligenciasQuery.mutate(), historicoQuery.mutate()]);
    } catch {
      toast.error("Erro interno ao arquivar diligência");
    } finally {
      setIsArchiveSubmitting(false);
    }
  }, [
    archiveObservacoes,
    diligenciasQuery,
    historicoQuery,
    selectedDiligencia,
  ]);

  const handleOpenDeleteModal = useCallback(() => {
    if (!selectedDiligencia) return;
    setDeleteConfirmationText("");
    setIsDeleteOpen(true);
  }, [selectedDiligencia]);

  const handleConfirmDelete = useCallback(async () => {
    if (!selectedDiligencia) return;

    setIsDeleteSubmitting(true);

    try {
      const result = await deleteDiligencia(
        selectedDiligencia.id,
        deleteConfirmationText,
      );

      if (!result.success) {
        toast.error(result.error || "Não foi possível excluir a diligência");
        return;
      }

      toast.success("Diligência excluída com sucesso");
      setIsDeleteOpen(false);
      setSelectedDiligencia(null);
      await Promise.all([diligenciasQuery.mutate(), historicoQuery.mutate()]);
    } catch {
      toast.error("Erro interno ao excluir diligência");
    } finally {
      setIsDeleteSubmitting(false);
    }
  }, [deleteConfirmationText, diligenciasQuery, historicoQuery, selectedDiligencia]);

  const handleRequestBulkAction = useCallback((action: BulkAction) => {
    setPendingBulkAction(action);
    setIsBulkConfirmOpen(true);
  }, []);

  const handleConfirmBulkAction = useCallback(async () => {
    if (!pendingBulkAction || selectedIds.length === 0) {
      return;
    }

    setIsBulkSubmitting(true);

    try {
      const payload =
        pendingBulkAction.type === "status"
          ? {
              ids: selectedIds,
              action: "status" as const,
              status: pendingBulkAction.status,
            }
          : pendingBulkAction.type === "assign"
            ? {
                ids: selectedIds,
                action: "assign" as const,
                responsavelId: pendingBulkAction.responsavelId,
              }
            : pendingBulkAction.type === "unassign"
              ? {
                  ids: selectedIds,
                  action: "unassign" as const,
                }
              : {
                  ids: selectedIds,
                  action: "archive" as const,
                };

      const result = await bulkUpdateDiligencias(payload);

      if (!result.success) {
        toast.error(result.error || "Falha na operação em lote");
        return;
      }

      toast.success(
        `${result.updatedCount ?? selectedIds.length} diligência(s) atualizada(s)`,
      );
      setIsBulkConfirmOpen(false);
      setPendingBulkAction(null);
      setSelectedIds([]);
      await Promise.all([diligenciasQuery.mutate(), historicoQuery.mutate()]);
    } catch {
      toast.error("Erro interno ao executar operação em lote");
    } finally {
      setIsBulkSubmitting(false);
    }
  }, [diligenciasQuery, historicoQuery, pendingBulkAction, selectedIds]);

  const navigateTo = useCallback(
    (href: string) => {
      router.push(href);
    },
    [router],
  );

  const isAtrasada = (diligencia: DiligenciaComRelacionamentos) => {
    if (!diligencia.prazoPrevisto) {
      return false;
    }

    if (
      diligencia.status === DiligenciaStatus.CONCLUIDA ||
      diligencia.status === DiligenciaStatus.CANCELADA
    ) {
      return false;
    }

    const prazoDate = new Date(diligencia.prazoPrevisto);

    if (Number.isNaN(prazoDate.getTime())) {
      return false;
    }

    return prazoDate.getTime() < Date.now();
  };

  return (
    <div className="space-y-6 pb-8">
      <PeoplePageHeader
        tag="Operacional"
        title="Diligências"
        description="Controle diligências do escritório com rastreabilidade de prazo, responsável e vínculo processual."
        actions={
          <Button color="primary" startContent={<Plus className="h-4 w-4" />} onPress={openCreateModal}>
            Nova Diligência
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <PeopleMetricCard label="Total" value={summary.total} icon={<FileText className="h-4 w-4" />} tone="default" />
        <PeopleMetricCard label="Pendentes" value={summary.pendentes} icon={<Clock className="h-4 w-4" />} tone="warning" />
        <PeopleMetricCard label="Em andamento" value={summary.emAndamento} icon={<FileSearch className="h-4 w-4" />} tone="primary" />
        <PeopleMetricCard label="Concluídas" value={summary.concluidas} icon={<CheckCircle className="h-4 w-4" />} tone="success" />
        <PeopleMetricCard label="Atrasadas" value={summary.atrasadas} icon={<AlertTriangle className="h-4 w-4" />} tone="danger" />
        <PeopleMetricCard label="Sem responsável" value={summary.semResponsavel} icon={<User className="h-4 w-4" />} tone="secondary" />
      </div>

      <Card className="border border-divider/70 bg-content1/75 shadow-sm backdrop-blur-md">
        <CardHeader className="border-b border-divider/70 px-4 py-4 sm:px-6">
          <div className="flex w-full flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
                <Filter className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-foreground sm:text-lg">Filtros operacionais</h3>
                <p className="text-xs text-default-500 sm:text-sm">
                  Busque por termo, status, cliente, processo, responsável e intervalo de prazo.
                </p>
              </div>
            </div>
            <Button
              color="default"
              isDisabled={!hasAnyFilter}
              startContent={<X className="h-4 w-4" />}
              variant="bordered"
              onPress={clearFilters}
            >
              Limpar filtros
            </Button>
          </div>
        </CardHeader>

        <CardBody className="grid gap-3 p-4 sm:grid-cols-2 sm:p-6 lg:grid-cols-5">
          <Input
            aria-label="Busca de diligências"
            label="Busca"
            placeholder="Título, tipo, processo, responsável..."
            startContent={<Search className="h-4 w-4 text-default-400" />}
            value={filtros.busca}
            onValueChange={(value) =>
              setFiltros((prev) => ({
                ...prev,
                busca: value,
              }))
            }
          />

          <Select
            aria-label="Filtro por status"
            label="Status"
            placeholder="Todos"
            selectedKeys={selectedStatusFilterKeys}
            onSelectionChange={(keys) => {
              const [value] = Array.from(keys) as string[];
              setFiltros((prev) => ({
                ...prev,
                status: value || "",
              }));
            }}
          >
            {STATUS_ITEMS.map((item) => (
              <SelectItem key={item.key} textValue={item.label}>
                {item.label}
              </SelectItem>
            ))}
          </Select>

          <Select
            aria-label="Filtro por cliente"
            isLoading={clientesQuery.isLoading}
            label="Cliente"
            placeholder="Todos"
            selectedKeys={selectedClienteFilterKeys}
            onSelectionChange={(keys) => {
              const [value] = Array.from(keys) as string[];
              setFiltros((prev) => ({
                ...prev,
                clienteId: value || "",
                processoId: "",
              }));
            }}
          >
            {clientes.map((cliente) => (
              <SelectItem key={cliente.id} textValue={cliente.nome}>
                {cliente.nome}
              </SelectItem>
            ))}
          </Select>

          <Select
            aria-label="Filtro por processo"
            isDisabled={processosFiltro.length === 0}
            label="Processo"
            placeholder="Todos"
            selectedKeys={selectedProcessoFilterKeys}
            onSelectionChange={(keys) => {
              const [value] = Array.from(keys) as string[];
              setFiltros((prev) => ({
                ...prev,
                processoId: value || "",
              }));
            }}
          >
            {processosFiltro.map((processo) => (
              <SelectItem key={processo.id} textValue={processo.numero}>
                {processo.numero}
              </SelectItem>
            ))}
          </Select>

          <Select
            aria-label="Filtro por responsável"
            isLoading={usuariosQuery.isLoading}
            label="Responsável"
            placeholder="Todos"
            selectedKeys={selectedResponsavelFilterKeys}
            onSelectionChange={(keys) => {
              const [value] = Array.from(keys) as string[];
              setFiltros((prev) => ({
                ...prev,
                responsavelId: value || "",
              }));
            }}
          >
            {usuarios.map((usuario) => (
              <SelectItem
                key={usuario.id}
                textValue={`${usuario.firstName || ""} ${usuario.lastName || ""} ${usuario.email}`}
              >
                {formatResponsavel(usuario)}
              </SelectItem>
            ))}
          </Select>

          <DateRangeInput
            aria-label="Filtro por intervalo de prazo previsto"
            label="Prazo previsto"
            rangeValue={filtros.prazoRange}
            onRangeValueChange={(value) =>
              setFiltros((prev) => ({
                ...prev,
                prazoRange: value,
              }))
            }
          />
        </CardBody>
      </Card>

      <Card className="border border-divider/70 bg-content1/75 shadow-sm backdrop-blur-md">
        <CardHeader className="border-b border-divider/70 px-4 py-4 sm:px-6">
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-base font-semibold text-foreground sm:text-lg">Lista de diligências</h3>
              <p className="text-xs text-default-500 sm:text-sm">{meta.total} registro(s) encontrado(s) com os filtros atuais.</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-default-500">Por página</span>
              <Select
                aria-label="Por página"
                className="w-24"
                selectedKeys={[String(pageSize)]}
                size="sm"
                variant="bordered"
                onSelectionChange={(keys) => {
                  const [value] = Array.from(keys) as string[];
                  const nextPageSize = Number.parseInt(value || "", 10);

                  if (!Number.isNaN(nextPageSize) && nextPageSize > 0) {
                    setPageSize(nextPageSize);
                  }
                }}
              >
                <SelectItem key="8" textValue="8">8</SelectItem>
                <SelectItem key="12" textValue="12">12</SelectItem>
                <SelectItem key="20" textValue="20">20</SelectItem>
                <SelectItem key="30" textValue="30">30</SelectItem>
              </Select>
            </div>
          </div>
        </CardHeader>

        <CardBody className="p-4 sm:p-6">
          <div className="mb-4 space-y-3 rounded-xl border border-divider/70 bg-content2/20 p-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <Checkbox
                isDisabled={visibleIds.length === 0}
                isSelected={allVisibleSelected}
                onValueChange={handleToggleSelectAllVisible}
              >
                Selecionar todos visíveis
              </Checkbox>
              <p className="text-xs text-default-500">
                {selectedCount} selecionada(s) nesta página
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
              <Button
                color="success"
                isDisabled={selectedCount === 0}
                size="sm"
                variant="flat"
                onPress={() =>
                  handleRequestBulkAction({
                    type: "status",
                    status: DiligenciaStatus.CONCLUIDA,
                    label: "Concluir selecionadas",
                  })
                }
              >
                Concluir selecionadas
              </Button>
              <Button
                color="warning"
                isDisabled={selectedCount === 0}
                size="sm"
                variant="flat"
                onPress={() =>
                  handleRequestBulkAction({
                    type: "status",
                    status: DiligenciaStatus.EM_ANDAMENTO,
                    label: "Marcar em andamento",
                  })
                }
              >
                Em andamento
              </Button>
              <Button
                color="danger"
                isDisabled={selectedCount === 0}
                size="sm"
                variant="flat"
                onPress={() =>
                  handleRequestBulkAction({
                    type: "archive",
                    label: "Arquivar selecionadas",
                  })
                }
              >
                Arquivar selecionadas
              </Button>

              <Select
                aria-label="Responsável para atribuição em lote"
                isLoading={usuariosQuery.isLoading}
                placeholder="Responsável em lote"
                selectedKeys={selectedBulkResponsavelKeys}
                size="sm"
                variant="bordered"
                onSelectionChange={(keys) => {
                  const [value] = Array.from(keys) as string[];
                  setBulkResponsavelId(value || "");
                }}
              >
                {usuarios.map((usuario) => (
                  <SelectItem
                    key={usuario.id}
                    textValue={`${usuario.firstName || ""} ${usuario.lastName || ""} ${usuario.email}`}
                  >
                    {formatResponsavel(usuario)}
                  </SelectItem>
                ))}
              </Select>

              <div className="flex gap-2">
                <Button
                  color="primary"
                  isDisabled={selectedCount === 0 || !bulkResponsavelId}
                  size="sm"
                  variant="flat"
                  onPress={() =>
                    handleRequestBulkAction({
                      type: "assign",
                      responsavelId: bulkResponsavelId,
                      label: "Atribuir responsável",
                    })
                  }
                >
                  Atribuir
                </Button>
                <Button
                  color="default"
                  isDisabled={selectedCount === 0}
                  size="sm"
                  variant="bordered"
                  onPress={() =>
                    handleRequestBulkAction({
                      type: "unassign",
                      label: "Remover responsável",
                    })
                  }
                >
                  Remover
                </Button>
              </div>
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Spinner color="primary" label="Carregando diligências..." />
            </div>
          ) : diligencias.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-divider bg-content2/20 px-6 py-12 text-center">
              <FileText className="mx-auto mb-4 h-10 w-10 text-default-300" />
              <p className="text-base font-medium text-default-700">Nenhuma diligência encontrada</p>
              <p className="mt-1 text-sm text-default-500">
                Ajuste os filtros ou crie uma nova diligência para iniciar o acompanhamento.
              </p>
              <Button className="mt-5" color="primary" startContent={<Plus className="h-4 w-4" />} onPress={openCreateModal}>
                Nova diligência
              </Button>
            </div>
          ) : (
            <div className="grid gap-3">
              {diligencias.map((diligencia) => {
                const statusConfig = STATUS_CONFIG[diligencia.status];
                const StatusIcon = statusConfig.icon;
                const atrasada = isAtrasada(diligencia);

                return (
                  <PeopleEntityCard
                    key={diligencia.id}
                    isPressable
                    onPress={() => setSelectedDiligencia(diligencia)}
                  >
                    <PeopleEntityCardBody className="space-y-4">
                      <div className="flex items-start gap-3">
                        <div data-stop-card-press="true">
                          <Checkbox
                            isSelected={selectedIdsSet.has(diligencia.id)}
                            onValueChange={(checked) =>
                              handleToggleSelectDiligencia(diligencia.id, checked)
                            }
                          />
                        </div>

                        <div className="min-w-0 flex-1 space-y-4">
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <h4 className="text-base font-semibold text-foreground">
                                  {diligencia.titulo}
                                </h4>
                                {diligencia.tipo ? (
                                  <Chip color="secondary" size="sm" variant="flat">
                                    {diligencia.tipo}
                                  </Chip>
                                ) : null}
                                <Chip
                                  color={statusConfig.chipColor}
                                  size="sm"
                                  startContent={<StatusIcon className="h-3.5 w-3.5" />}
                                  variant="flat"
                                >
                                  {statusConfig.label}
                                </Chip>
                                {atrasada ? (
                                  <Chip color="danger" size="sm" variant="flat">
                                    Atrasada
                                  </Chip>
                                ) : null}
                              </div>
                              {diligencia.descricao ? (
                                <p className="text-sm text-default-500 line-clamp-2">
                                  {diligencia.descricao}
                                </p>
                              ) : null}
                            </div>

                            <div className="min-w-[220px] space-y-2" data-stop-card-press="true">
                              <Select
                                aria-label="Atualizar status da diligência"
                                selectedKeys={[diligencia.status]}
                                size="sm"
                                variant="bordered"
                                onSelectionChange={(keys) => {
                                  const [value] = Array.from(keys) as string[];
                                  if (!value) return;
                                  void handleStatusChange(
                                    diligencia,
                                    value as DiligenciaStatus,
                                  );
                                }}
                              >
                                {STATUS_ITEMS.map((item) => (
                                  <SelectItem key={item.key} textValue={item.label}>
                                    {item.label}
                                  </SelectItem>
                                ))}
                              </Select>
                              <p className="text-xs text-default-400">
                                Criada em {formatDate(diligencia.createdAt)}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {diligencia.processo ? (
                          <Chip color="primary" size="sm" startContent={<Scale className="h-3.5 w-3.5" />} variant="flat">
                            Processo {diligencia.processo.numero}
                          </Chip>
                        ) : null}

                        {diligencia.processo?.cliente?.nome ? (
                          <Chip color="default" size="sm" startContent={<User className="h-3.5 w-3.5" />} variant="bordered">
                            {diligencia.processo.cliente.nome}
                          </Chip>
                        ) : null}

                        {diligencia.contrato ? (
                          <Chip color="secondary" size="sm" startContent={<FileCheck className="h-3.5 w-3.5" />} variant="flat">
                            {diligencia.contrato.titulo}
                          </Chip>
                        ) : null}

                        {diligencia.causa ? (
                          <Chip color="warning" size="sm" startContent={<AlertTriangle className="h-3.5 w-3.5" />} variant="flat">
                            {diligencia.causa.nome}
                          </Chip>
                        ) : null}

                        {diligencia.responsavel ? (
                          <Chip color="success" size="sm" startContent={<UserCheck className="h-3.5 w-3.5" />} variant="flat">
                            {formatResponsavel(diligencia.responsavel)}
                          </Chip>
                        ) : (
                          <Chip color="danger" size="sm" variant="bordered">
                            Sem responsável
                          </Chip>
                        )}

                        {diligencia.prazoPrevisto ? (
                          <Chip color={atrasada ? "danger" : "default"} size="sm" startContent={<Calendar className="h-3.5 w-3.5" />} variant={atrasada ? "flat" : "bordered"}>
                            Prazo {formatDate(diligencia.prazoPrevisto)}
                          </Chip>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap gap-2" data-stop-card-press="true">
                        {diligencia.processo?.id ? (
                          <Button
                            color="primary"
                            endContent={<ExternalLink className="h-3.5 w-3.5" />}
                            size="sm"
                            variant="flat"
                            onPress={() =>
                              navigateTo(`/processos/${diligencia.processo!.id}`)
                            }
                          >
                            Abrir processo
                          </Button>
                        ) : null}
                        {diligencia.processo?.cliente?.id ? (
                          <Button
                            color="default"
                            endContent={<ExternalLink className="h-3.5 w-3.5" />}
                            size="sm"
                            variant="bordered"
                            onPress={() =>
                              navigateTo(
                                `/clientes/${diligencia.processo!.cliente!.id}`,
                              )
                            }
                          >
                            Abrir cliente
                          </Button>
                        ) : null}
                        {diligencia.contrato?.id ? (
                          <Button
                            color="secondary"
                            endContent={<ExternalLink className="h-3.5 w-3.5" />}
                            size="sm"
                            variant="flat"
                            onPress={() =>
                              navigateTo(`/contratos/${diligencia.contrato!.id}`)
                            }
                          >
                            Abrir contrato
                          </Button>
                        ) : null}
                      </div>
                    </PeopleEntityCardBody>
                  </PeopleEntityCard>
                );
              })}
            </div>
          )}

          <div className="mt-5 flex justify-center border-t border-divider/70 pt-4">
            <Pagination
              isCompact
              page={meta.page}
              total={meta.totalPages}
              onChange={setPage}
            />
          </div>
        </CardBody>
      </Card>

      <CreateDiligenciaModal
        causas={causas}
        clientes={clientes}
        contratos={contratosDoClienteCreate}
        isOpen={isCreateOpen}
        isSubmitting={isCreateSubmitting}
        loadingCausas={causasQuery.isLoading}
        loadingClientes={clientesQuery.isLoading}
        loadingRegimes={regimesQuery.isLoading}
        loadingUsuarios={usuariosQuery.isLoading}
        processos={processosDoClienteCreate}
        regimes={regimes}
        selectedCausaKeys={selectedCausaCreateKeys}
        selectedClienteKeys={selectedClienteCreateKeys}
        selectedContratoKeys={selectedContratoCreateKeys}
        selectedProcessoKeys={selectedProcessoCreateKeys}
        selectedRegimeKeys={selectedRegimeCreateKeys}
        selectedResponsavelKeys={selectedResponsavelCreateKeys}
        setState={setCreateState}
        state={createState}
        usuarios={usuarios}
        onClienteChange={handleClienteCreateChange}
        onClose={() => setIsCreateOpen(false)}
        onSubmit={handleCreateDiligencia}
      />

      <EditDiligenciaModal
        causas={causas}
        clientes={clientes}
        contratos={contratosDoClienteEdit}
        isOpen={isEditOpen}
        isSubmitting={isEditSubmitting}
        loadingCausas={causasQuery.isLoading}
        loadingClientes={clientesQuery.isLoading}
        loadingRegimes={regimesQuery.isLoading}
        loadingUsuarios={usuariosQuery.isLoading}
        processos={processosDoClienteEdit}
        regimes={regimes}
        selectedCausaKeys={selectedCausaEditKeys}
        selectedClienteKeys={selectedClienteEditKeys}
        selectedContratoKeys={selectedContratoEditKeys}
        selectedProcessoKeys={selectedProcessoEditKeys}
        selectedRegimeKeys={selectedRegimeEditKeys}
        selectedResponsavelKeys={selectedResponsavelEditKeys}
        selectedStatusKeys={selectedStatusEditKeys}
        setState={setEditState}
        state={editState}
        usuarios={usuarios}
        onClienteChange={handleClienteEditChange}
        onClose={() => {
          setIsEditOpen(false);
          setEditingDiligenciaId(null);
        }}
        onSubmit={handleEditDiligencia}
      />

      <DiligenciaDetalhesModal
        diligencia={selectedDiligencia}
        historico={historico}
        historicoLoading={historicoQuery.isLoading}
        onClose={() => setSelectedDiligencia(null)}
        onDelete={handleOpenDeleteModal}
        onEdit={() => {
          if (selectedDiligencia) {
            openEditModal(selectedDiligencia);
          }
        }}
        onArchive={handleOpenArchiveModal}
        onNavigate={navigateTo}
        onStatusChange={(status) => {
          if (!selectedDiligencia) {
            return;
          }
          void handleStatusChange(selectedDiligencia, status);
        }}
      />

      <Modal
        isOpen={isArchiveOpen}
        size="lg"
        onOpenChange={(open) => {
          if (!open && !isArchiveSubmitting) {
            setIsArchiveOpen(false);
          }
        }}
      >
        <ModalContent>
          <ModalHeader>Arquivar diligência</ModalHeader>
          <ModalBody className="space-y-3">
            <p className="text-sm text-default-500">
              A diligência será marcada como cancelada/arquivada. Você pode registrar
              a justificativa abaixo.
            </p>
            <Textarea
              label="Observações do arquivamento"
              minRows={3}
              placeholder="Motivo do arquivamento"
              value={archiveObservacoes}
              onValueChange={setArchiveObservacoes}
            />
          </ModalBody>
          <ModalFooter>
            <Button
              isDisabled={isArchiveSubmitting}
              variant="light"
              onPress={() => setIsArchiveOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              color="warning"
              isLoading={isArchiveSubmitting}
              startContent={!isArchiveSubmitting ? <Archive className="h-4 w-4" /> : undefined}
              onPress={handleConfirmArchive}
            >
              Confirmar arquivamento
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal
        isOpen={isDeleteOpen}
        size="lg"
        onOpenChange={(open) => {
          if (!open && !isDeleteSubmitting) {
            setIsDeleteOpen(false);
          }
        }}
      >
        <ModalContent>
          <ModalHeader className="text-danger">Excluir diligência</ModalHeader>
          <ModalBody className="space-y-3">
            <p className="text-sm text-default-500">
              Esta ação é irreversível e remove a diligência do sistema. Para
              confirmar, digite <strong>EXCLUIR</strong>.
            </p>
            <Input
              aria-label='Confirmação de exclusão digitando "EXCLUIR"'
              label='Digite "EXCLUIR"'
              value={deleteConfirmationText}
              onValueChange={setDeleteConfirmationText}
            />
          </ModalBody>
          <ModalFooter>
            <Button
              isDisabled={isDeleteSubmitting}
              variant="light"
              onPress={() => setIsDeleteOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              color="danger"
              isDisabled={deleteConfirmationText.trim().toUpperCase() !== "EXCLUIR"}
              isLoading={isDeleteSubmitting}
              startContent={!isDeleteSubmitting ? <Trash2 className="h-4 w-4" /> : undefined}
              onPress={handleConfirmDelete}
            >
              Excluir definitivamente
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal
        isOpen={isBulkConfirmOpen}
        size="lg"
        onOpenChange={(open) => {
          if (!open && !isBulkSubmitting) {
            setIsBulkConfirmOpen(false);
            setPendingBulkAction(null);
          }
        }}
      >
        <ModalContent>
          <ModalHeader>Confirmar ação em lote</ModalHeader>
          <ModalBody className="space-y-3">
            <p className="text-sm text-default-500">
              Você está prestes a executar{" "}
              <strong>{pendingBulkAction?.label || "ação em lote"}</strong> em{" "}
              <strong>{selectedIds.length}</strong> diligência(s).
            </p>
            <div className="rounded-xl border border-warning/30 bg-warning/10 p-3 text-xs text-warning-700 dark:text-warning-300">
              Operação em massa: revise a seleção antes de confirmar.
            </div>
          </ModalBody>
          <ModalFooter>
            <Button
              isDisabled={isBulkSubmitting}
              variant="light"
              onPress={() => {
                setIsBulkConfirmOpen(false);
                setPendingBulkAction(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              color="primary"
              isLoading={isBulkSubmitting}
              onPress={handleConfirmBulkAction}
            >
              Confirmar
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}

interface CreateDiligenciaModalProps {
  isOpen: boolean;
  onClose: () => void;
  isSubmitting: boolean;
  causas: Causa[];
  regimes: RegimePrazo[];
  clientes: ClienteComRelacionamentos[];
  processos: Array<Pick<Processo, "id" | "numero" | "titulo" | "clienteId">>;
  contratos: Array<Pick<Contrato, "id" | "titulo" | "clienteId" | "processoId">>;
  usuarios: Usuario[];
  state: DiligenciaFormData;
  setState: React.Dispatch<React.SetStateAction<DiligenciaFormData>>;
  onSubmit: () => void;
  onClienteChange: (clienteId: string) => void;
  loadingClientes: boolean;
  loadingCausas: boolean;
  loadingRegimes: boolean;
  loadingUsuarios: boolean;
  selectedClienteKeys: string[];
  selectedProcessoKeys: string[];
  selectedContratoKeys: string[];
  selectedCausaKeys: string[];
  selectedRegimeKeys: string[];
  selectedResponsavelKeys: string[];
}

function CreateDiligenciaModal({
  isOpen,
  onClose,
  isSubmitting,
  causas,
  regimes,
  clientes,
  processos,
  contratos,
  usuarios,
  state,
  setState,
  onSubmit,
  onClienteChange,
  loadingClientes,
  loadingCausas,
  loadingRegimes,
  loadingUsuarios,
  selectedClienteKeys,
  selectedProcessoKeys,
  selectedContratoKeys,
  selectedCausaKeys,
  selectedRegimeKeys,
  selectedResponsavelKeys,
}: CreateDiligenciaModalProps) {
  const selectedCliente = useMemo(
    () => clientes.find((item) => item.id === state.clienteId) || null,
    [clientes, state.clienteId],
  );

  return (
    <Modal
      isOpen={isOpen}
      scrollBehavior="inside"
      size="5xl"
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Operacional</p>
          <h3 className="text-xl font-semibold">Nova diligência</h3>
          <p className="text-sm text-default-500">Preencha os dados essenciais, vínculos e prazo operacional.</p>
        </ModalHeader>

        <ModalBody className="grid gap-6 px-6 pb-2">
          <section className="space-y-3 rounded-2xl border border-divider/70 bg-content2/20 p-4">
            <h4 className="text-sm font-semibold text-foreground">Dados básicos</h4>
            <Input
              aria-label="Título da diligência"
              isRequired
              label="Título"
              placeholder="Ex.: Protocolo de petição inicial"
              value={state.titulo}
              onValueChange={(value) => setState((prev) => ({ ...prev, titulo: value }))}
            />
            <Input
              aria-label="Tipo da diligência"
              label="Tipo"
              placeholder="Ex.: Audiência, Protocolo, Análise"
              value={state.tipo}
              onValueChange={(value) => setState((prev) => ({ ...prev, tipo: value }))}
            />
            <Textarea
              aria-label="Descrição da diligência"
              label="Descrição"
              minRows={3}
              placeholder="Descreva a diligência com contexto operacional"
              value={state.descricao}
              onValueChange={(value) => setState((prev) => ({ ...prev, descricao: value }))}
            />
          </section>

          <section className="space-y-3 rounded-2xl border border-divider/70 bg-content2/20 p-4">
            <h4 className="text-sm font-semibold text-foreground">Relacionamentos</h4>
            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                aria-label="Cliente da diligência"
                isLoading={loadingClientes}
                label="Cliente"
                placeholder="Selecione um cliente"
                selectedKeys={selectedClienteKeys}
                onSelectionChange={(keys) => {
                  const [value] = Array.from(keys) as string[];
                  onClienteChange(value || "");
                }}
              >
                {clientes.map((cliente) => (
                  <SelectItem key={cliente.id} textValue={cliente.nome}>
                    {cliente.nome}
                  </SelectItem>
                ))}
              </Select>

              <Select
                aria-label="Processo da diligência"
                isDisabled={processos.length === 0}
                label="Processo"
                placeholder="Opcional"
                selectedKeys={selectedProcessoKeys}
                onSelectionChange={(keys) => {
                  const [value] = Array.from(keys) as string[];
                  setState((prev) => ({ ...prev, processoId: value || "" }));
                }}
              >
                {processos.map((processo) => (
                  <SelectItem key={processo.id} textValue={processo.numero}>
                    {processo.numero}
                  </SelectItem>
                ))}
              </Select>

              <Select
                aria-label="Contrato da diligência"
                isDisabled={contratos.length === 0}
                label="Contrato"
                placeholder="Opcional"
                selectedKeys={selectedContratoKeys}
                onSelectionChange={(keys) => {
                  const [value] = Array.from(keys) as string[];
                  setState((prev) => ({ ...prev, contratoId: value || "" }));
                }}
              >
                {contratos.map((contrato) => (
                  <SelectItem key={contrato.id} textValue={contrato.titulo}>
                    {contrato.titulo}
                  </SelectItem>
                ))}
              </Select>

              <Select
                aria-label="Causa da diligência"
                isLoading={loadingCausas}
                label="Causa"
                placeholder="Opcional"
                selectedKeys={selectedCausaKeys}
                onSelectionChange={(keys) => {
                  const [value] = Array.from(keys) as string[];
                  setState((prev) => ({ ...prev, causaId: value || "" }));
                }}
              >
                {causas.map((causa) => (
                  <SelectItem key={causa.id} textValue={causa.nome}>
                    {causa.nome}
                  </SelectItem>
                ))}
              </Select>
            </div>

            {selectedCliente ? (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-primary-700 dark:text-primary-300">
                Cliente selecionado com {selectedCliente.processos.length} processo(s) e {selectedCliente.contratos.length} contrato(s) disponíveis para vínculo.
              </div>
            ) : null}
          </section>

          <section className="space-y-3 rounded-2xl border border-divider/70 bg-content2/20 p-4">
            <h4 className="text-sm font-semibold text-foreground">Prazo e responsável</h4>
            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                aria-label="Regime de prazo"
                isLoading={loadingRegimes}
                label="Regime de prazo"
                placeholder="Opcional"
                selectedKeys={selectedRegimeKeys}
                onSelectionChange={(keys) => {
                  const [value] = Array.from(keys) as string[];
                  setState((prev) => ({ ...prev, regimePrazoId: value || "" }));
                }}
              >
                {regimes.map((regime) => (
                  <SelectItem key={regime.id} textValue={regime.nome}>
                    {regime.nome}
                  </SelectItem>
                ))}
              </Select>

              <DateInput
                aria-label="Prazo previsto da diligência"
                label="Prazo previsto"
                value={state.prazoPrevisto}
                onChange={(event) =>
                  setState((prev) => ({ ...prev, prazoPrevisto: event.target.value }))
                }
              />

              <Select
                aria-label="Responsável da diligência"
                isLoading={loadingUsuarios}
                label="Responsável"
                placeholder="Opcional"
                selectedKeys={selectedResponsavelKeys}
                onSelectionChange={(keys) => {
                  const [value] = Array.from(keys) as string[];
                  setState((prev) => ({ ...prev, responsavelId: value || "" }));
                }}
              >
                {usuarios.map((usuario) => (
                  <SelectItem
                    key={usuario.id}
                    textValue={`${usuario.firstName || ""} ${usuario.lastName || ""} ${usuario.email}`}
                  >
                    {formatResponsavel(usuario)}
                  </SelectItem>
                ))}
              </Select>
            </div>
          </section>
        </ModalBody>

        <ModalFooter>
          <Button variant="light" onPress={onClose}>
            Cancelar
          </Button>
          <Button
            color="primary"
            isLoading={isSubmitting}
            startContent={!isSubmitting ? <CheckCircle className="h-4 w-4" /> : undefined}
            onPress={onSubmit}
          >
            {isSubmitting ? "Criando..." : "Criar diligência"}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

interface EditDiligenciaModalProps {
  isOpen: boolean;
  onClose: () => void;
  isSubmitting: boolean;
  causas: Causa[];
  regimes: RegimePrazo[];
  clientes: ClienteComRelacionamentos[];
  processos: Array<Pick<Processo, "id" | "numero" | "titulo" | "clienteId">>;
  contratos: Array<Pick<Contrato, "id" | "titulo" | "clienteId" | "processoId">>;
  usuarios: Usuario[];
  state: DiligenciaEditFormData;
  setState: React.Dispatch<React.SetStateAction<DiligenciaEditFormData>>;
  onSubmit: () => void;
  onClienteChange: (clienteId: string) => void;
  loadingClientes: boolean;
  loadingCausas: boolean;
  loadingRegimes: boolean;
  loadingUsuarios: boolean;
  selectedClienteKeys: string[];
  selectedProcessoKeys: string[];
  selectedContratoKeys: string[];
  selectedCausaKeys: string[];
  selectedRegimeKeys: string[];
  selectedResponsavelKeys: string[];
  selectedStatusKeys: string[];
}

function EditDiligenciaModal({
  isOpen,
  onClose,
  isSubmitting,
  causas,
  regimes,
  clientes,
  processos,
  contratos,
  usuarios,
  state,
  setState,
  onSubmit,
  onClienteChange,
  loadingClientes,
  loadingCausas,
  loadingRegimes,
  loadingUsuarios,
  selectedClienteKeys,
  selectedProcessoKeys,
  selectedContratoKeys,
  selectedCausaKeys,
  selectedRegimeKeys,
  selectedResponsavelKeys,
  selectedStatusKeys,
}: EditDiligenciaModalProps) {
  const selectedCliente = useMemo(
    () => clientes.find((item) => item.id === state.clienteId) || null,
    [clientes, state.clienteId],
  );

  return (
    <Modal
      isOpen={isOpen}
      scrollBehavior="inside"
      size="5xl"
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            Operacional
          </p>
          <h3 className="text-xl font-semibold">Editar diligência</h3>
          <p className="text-sm text-default-500">
            Atualize informações, vínculos, status e rastreabilidade operacional.
          </p>
        </ModalHeader>

        <ModalBody className="grid gap-6 px-6 pb-2">
          <section className="space-y-3 rounded-2xl border border-divider/70 bg-content2/20 p-4">
            <h4 className="text-sm font-semibold text-foreground">Dados básicos</h4>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                aria-label="Título da diligência"
                isRequired
                label="Título"
                value={state.titulo}
                onValueChange={(value) => setState((prev) => ({ ...prev, titulo: value }))}
              />
              <Input
                aria-label="Tipo da diligência"
                label="Tipo"
                value={state.tipo}
                onValueChange={(value) => setState((prev) => ({ ...prev, tipo: value }))}
              />
              <Select
                aria-label="Status da diligência"
                label="Status"
                selectedKeys={selectedStatusKeys}
                onSelectionChange={(keys) => {
                  const [value] = Array.from(keys) as string[];
                  if (!value) return;
                  setState((prev) => ({
                    ...prev,
                    status: value as DiligenciaStatus,
                    prazoConclusao:
                      value === DiligenciaStatus.CONCLUIDA && !prev.prazoConclusao
                        ? toDateInputValue(new Date())
                        : prev.prazoConclusao,
                  }));
                }}
              >
                {STATUS_ITEMS.map((item) => (
                  <SelectItem key={item.key} textValue={item.label}>
                    {item.label}
                  </SelectItem>
                ))}
              </Select>
              <DateInput
                aria-label="Prazo de conclusão da diligência"
                label="Prazo de conclusão"
                value={state.prazoConclusao}
                onChange={(event) =>
                  setState((prev) => ({
                    ...prev,
                    prazoConclusao: event.target.value,
                  }))
                }
              />
            </div>

            <Textarea
              aria-label="Descrição da diligência"
              label="Descrição"
              minRows={3}
              value={state.descricao}
              onValueChange={(value) => setState((prev) => ({ ...prev, descricao: value }))}
            />
            <Textarea
              aria-label="Observações internas da diligência"
              label="Observações internas"
              minRows={3}
              value={state.observacoes}
              onValueChange={(value) =>
                setState((prev) => ({ ...prev, observacoes: value }))
              }
            />
          </section>

          <section className="space-y-3 rounded-2xl border border-divider/70 bg-content2/20 p-4">
            <h4 className="text-sm font-semibold text-foreground">Relacionamentos</h4>
            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                aria-label="Cliente da diligência"
                isLoading={loadingClientes}
                label="Cliente"
                placeholder="Selecione um cliente"
                selectedKeys={selectedClienteKeys}
                onSelectionChange={(keys) => {
                  const [value] = Array.from(keys) as string[];
                  onClienteChange(value || "");
                }}
              >
                {clientes.map((cliente) => (
                  <SelectItem key={cliente.id} textValue={cliente.nome}>
                    {cliente.nome}
                  </SelectItem>
                ))}
              </Select>

              <Select
                aria-label="Processo da diligência"
                isDisabled={processos.length === 0}
                label="Processo"
                placeholder="Opcional"
                selectedKeys={selectedProcessoKeys}
                onSelectionChange={(keys) => {
                  const [value] = Array.from(keys) as string[];
                  setState((prev) => ({ ...prev, processoId: value || "" }));
                }}
              >
                {processos.map((processo) => (
                  <SelectItem key={processo.id} textValue={processo.numero}>
                    {processo.numero}
                  </SelectItem>
                ))}
              </Select>

              <Select
                aria-label="Contrato da diligência"
                isDisabled={contratos.length === 0}
                label="Contrato"
                placeholder="Opcional"
                selectedKeys={selectedContratoKeys}
                onSelectionChange={(keys) => {
                  const [value] = Array.from(keys) as string[];
                  setState((prev) => ({ ...prev, contratoId: value || "" }));
                }}
              >
                {contratos.map((contrato) => (
                  <SelectItem key={contrato.id} textValue={contrato.titulo}>
                    {contrato.titulo}
                  </SelectItem>
                ))}
              </Select>

              <Select
                aria-label="Causa da diligência"
                isLoading={loadingCausas}
                label="Causa"
                placeholder="Opcional"
                selectedKeys={selectedCausaKeys}
                onSelectionChange={(keys) => {
                  const [value] = Array.from(keys) as string[];
                  setState((prev) => ({ ...prev, causaId: value || "" }));
                }}
              >
                {causas.map((causa) => (
                  <SelectItem key={causa.id} textValue={causa.nome}>
                    {causa.nome}
                  </SelectItem>
                ))}
              </Select>
            </div>

            {selectedCliente ? (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-primary-700 dark:text-primary-300">
                Cliente selecionado com {selectedCliente.processos.length} processo(s) e{" "}
                {selectedCliente.contratos.length} contrato(s) disponíveis para vínculo.
              </div>
            ) : null}
          </section>

          <section className="space-y-3 rounded-2xl border border-divider/70 bg-content2/20 p-4">
            <h4 className="text-sm font-semibold text-foreground">Prazo e responsável</h4>
            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                aria-label="Regime de prazo"
                isLoading={loadingRegimes}
                label="Regime de prazo"
                placeholder="Opcional"
                selectedKeys={selectedRegimeKeys}
                onSelectionChange={(keys) => {
                  const [value] = Array.from(keys) as string[];
                  setState((prev) => ({ ...prev, regimePrazoId: value || "" }));
                }}
              >
                {regimes.map((regime) => (
                  <SelectItem key={regime.id} textValue={regime.nome}>
                    {regime.nome}
                  </SelectItem>
                ))}
              </Select>

              <DateInput
                aria-label="Prazo previsto da diligência"
                label="Prazo previsto"
                value={state.prazoPrevisto}
                onChange={(event) =>
                  setState((prev) => ({ ...prev, prazoPrevisto: event.target.value }))
                }
              />

              <Select
                aria-label="Responsável da diligência"
                isLoading={loadingUsuarios}
                label="Responsável"
                placeholder="Opcional"
                selectedKeys={selectedResponsavelKeys}
                onSelectionChange={(keys) => {
                  const [value] = Array.from(keys) as string[];
                  setState((prev) => ({ ...prev, responsavelId: value || "" }));
                }}
              >
                {usuarios.map((usuario) => (
                  <SelectItem
                    key={usuario.id}
                    textValue={`${usuario.firstName || ""} ${usuario.lastName || ""} ${usuario.email}`}
                  >
                    {formatResponsavel(usuario)}
                  </SelectItem>
                ))}
              </Select>
            </div>
          </section>
        </ModalBody>

        <ModalFooter>
          <Button variant="light" onPress={onClose}>
            Cancelar
          </Button>
          <Button
            color="primary"
            isLoading={isSubmitting}
            startContent={!isSubmitting ? <CheckCircle className="h-4 w-4" /> : undefined}
            onPress={onSubmit}
          >
            {isSubmitting ? "Salvando..." : "Salvar alterações"}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

interface DiligenciaDetalhesModalProps {
  diligencia: DiligenciaComRelacionamentos | null;
  historico: DiligenciaHistoricoItem[];
  historicoLoading: boolean;
  onClose: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onNavigate: (href: string) => void;
  onStatusChange: (status: DiligenciaStatus) => void;
}

function DiligenciaDetalhesModal({
  diligencia,
  historico,
  historicoLoading,
  onClose,
  onEdit,
  onArchive,
  onDelete,
  onNavigate,
  onStatusChange,
}: DiligenciaDetalhesModalProps) {
  if (!diligencia) {
    return null;
  }

  const statusConfig = STATUS_CONFIG[diligencia.status];
  const StatusIcon = statusConfig.icon;

  return (
    <Modal
      isOpen={Boolean(diligencia)}
      size="3xl"
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <StatusIcon className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">{diligencia.titulo}</h3>
          </div>
          <p className="text-sm text-default-500">Detalhamento operacional da diligência selecionada.</p>
        </ModalHeader>

        <ModalBody className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Chip color={statusConfig.chipColor} size="sm" variant="flat">
              {statusConfig.label}
            </Chip>
            {diligencia.tipo ? (
              <Chip color="secondary" size="sm" variant="flat">
                {diligencia.tipo}
              </Chip>
            ) : null}
            {diligencia.prazoPrevisto ? (
              <Chip color="warning" size="sm" variant="flat">
                Prazo {formatDate(diligencia.prazoPrevisto)}
              </Chip>
            ) : null}
          </div>

          {diligencia.descricao ? (
            <p className="rounded-xl border border-divider/70 bg-content2/20 p-3 text-sm text-default-700">
              {diligencia.descricao}
            </p>
          ) : null}

          {diligencia.observacoes ? (
            <p className="rounded-xl border border-secondary/30 bg-secondary/10 p-3 text-sm text-secondary-700 dark:text-secondary-300">
              {diligencia.observacoes}
            </p>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <InfoLine label="Responsável" value={formatResponsavel(diligencia.responsavel)} icon={<UserCheck className="h-4 w-4" />} />
            <InfoLine label="Criado por" value={formatResponsavel(diligencia.criadoPor)} icon={<User className="h-4 w-4" />} />
            <InfoLine
              label="Processo"
              value={diligencia.processo ? diligencia.processo.numero : "Não vinculado"}
              icon={<Scale className="h-4 w-4" />}
            />
            <InfoLine
              label="Contrato"
              value={diligencia.contrato ? diligencia.contrato.titulo : "Não vinculado"}
              icon={<FileCheck className="h-4 w-4" />}
            />
            <InfoLine
              label="Causa"
              value={diligencia.causa ? diligencia.causa.nome : "Não vinculada"}
              icon={<AlertTriangle className="h-4 w-4" />}
            />
            <InfoLine
              label="Regime de prazo"
              value={diligencia.regimePrazo ? diligencia.regimePrazo.nome : "Não vinculado"}
              icon={<Clock className="h-4 w-4" />}
            />
            <InfoLine
              label="Criada em"
              value={formatDateTime(diligencia.createdAt)}
              icon={<Calendar className="h-4 w-4" />}
            />
            <InfoLine
              label="Conclusão"
              value={formatDateTime(diligencia.prazoConclusao)}
              icon={<CheckCircle className="h-4 w-4" />}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {diligencia.processo?.id ? (
              <Button
                color="primary"
                endContent={<ExternalLink className="h-3.5 w-3.5" />}
                size="sm"
                variant="flat"
                onPress={() => onNavigate(`/processos/${diligencia.processo!.id}`)}
              >
                Ir para processo
              </Button>
            ) : null}
            {diligencia.processo?.cliente?.id ? (
              <Button
                color="default"
                endContent={<ExternalLink className="h-3.5 w-3.5" />}
                size="sm"
                variant="bordered"
                onPress={() =>
                  onNavigate(`/clientes/${diligencia.processo!.cliente!.id}`)
                }
              >
                Ir para cliente
              </Button>
            ) : null}
            {diligencia.contrato?.id ? (
              <Button
                color="secondary"
                endContent={<ExternalLink className="h-3.5 w-3.5" />}
                size="sm"
                variant="flat"
                onPress={() => onNavigate(`/contratos/${diligencia.contrato!.id}`)}
              >
                Ir para contrato
              </Button>
            ) : null}
          </div>

          <Select
            aria-label="Atualizar status no modal de detalhes"
            label="Status"
            selectedKeys={[diligencia.status]}
            onSelectionChange={(keys) => {
              const [value] = Array.from(keys) as string[];
              if (!value) return;
              onStatusChange(value as DiligenciaStatus);
            }}
          >
            {STATUS_ITEMS.map((item) => (
              <SelectItem key={item.key} textValue={item.label}>
                {item.label}
              </SelectItem>
            ))}
          </Select>

          <Divider />

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-default-500" />
              <h4 className="text-sm font-semibold text-foreground">
                Histórico de auditoria
              </h4>
            </div>

            {historicoLoading ? (
              <div className="flex items-center justify-center py-4">
                <Spinner size="sm" />
              </div>
            ) : historico.length === 0 ? (
              <p className="text-xs text-default-500">
                Nenhum registro de auditoria encontrado para esta diligência.
              </p>
            ) : (
              <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                {historico.map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded-xl border border-divider/70 bg-content2/20 p-3"
                  >
                    <p className="text-xs font-semibold text-default-700">
                      {entry.acao}
                    </p>
                    <p className="text-[11px] text-default-500">
                      {formatDateTime(entry.createdAt)} ·{" "}
                      {formatResponsavel(entry.usuario || null)}
                    </p>
                    {entry.changedFields?.length ? (
                      <p className="mt-1 text-[11px] text-default-500">
                        Campos: {entry.changedFields.join(", ")}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </ModalBody>

        <ModalFooter>
          <Button
            color="primary"
            startContent={<Edit3 className="h-4 w-4" />}
            variant="flat"
            onPress={onEdit}
          >
            Editar
          </Button>
          <Button
            color="warning"
            startContent={<Archive className="h-4 w-4" />}
            variant="flat"
            onPress={onArchive}
          >
            Arquivar
          </Button>
          <Button
            color="danger"
            startContent={<Trash2 className="h-4 w-4" />}
            variant="flat"
            onPress={onDelete}
          >
            Excluir
          </Button>
          <Button variant="light" onPress={onClose}>
            Fechar
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

interface InfoLineProps {
  label: string;
  value: string;
  icon?: React.ReactNode;
}

function InfoLine({ label, value, icon }: InfoLineProps) {
  return (
    <div className="rounded-xl border border-divider/70 bg-content2/20 p-3">
      <p className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-default-500">
        {icon}
        {label}
      </p>
      <p className="text-sm text-default-800">{value || "-"}</p>
    </div>
  );
}
