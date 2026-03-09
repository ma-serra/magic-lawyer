"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import useSWR from "swr";
import clsx from "clsx";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Divider,
  Input,
  Skeleton,
  Switch,
  Tab,
  Tabs,
  Textarea,
  Tooltip,
} from "@heroui/react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowDown,
  ArrowUp,
  AlertTriangle,
  Boxes,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Clock,
  GripVertical,
  History,
  Info,
  Layers,
  Puzzle,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Sparkles,
  Save,
  Send,
  ToggleLeft,
  XCircle,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { DateInput } from "@/components/ui/date-input";

import {
  agendarPlanoReajuste,
  cancelarPlanoReajuste,
  createPlanoVersaoDraft,
  createPlanoVersaoReview,
  getPlanoConfiguracao,
  getPlanos,
  getPlanosMatrix,
  getPlanoReajustes,
  publishPlanoVersao,
  syncPlanoModulos,
  setPlanoModulos,
  type GetPlanoConfiguracaoResponse,
  type GetPlanoMatrixResponse,
  type PlanoMatrixModuleRow,
  type PlanoReajusteResumo,
  type Plano,
} from "@/app/actions/planos";
import { ModulosContent } from "@/app/admin/modulos/modulos-content";
import {
  PeopleMetricCard,
  PeoplePageHeader,
  PeoplePanel,
} from "@/components/people-ui";

type PlanoConfiguracaoData = NonNullable<GetPlanoConfiguracaoResponse["data"]>;
type PlanoMatrixData = NonNullable<GetPlanoMatrixResponse["data"]>;

const statusTone: Record<
  string,
  "default" | "primary" | "secondary" | "success" | "warning" | "danger"
> = {
  DRAFT: "default",
  REVIEW: "warning",
  PUBLISHED: "success",
  ARCHIVED: "secondary",
};

const statusLabel: Record<string, string> = {
  DRAFT: "Rascunho",
  REVIEW: "Em revisão",
  PUBLISHED: "Publicado",
  ARCHIVED: "Arquivado",
};

const reajusteStatusLabel: Record<string, string> = {
  SCHEDULED: "Programado",
  ACTIVE: "Aplicado",
  CANCELED: "Cancelado",
};

const reajusteStatusColor: Record<
  string,
  "default" | "success" | "warning" | "danger"
> = {
  SCHEDULED: "warning",
  ACTIVE: "success",
  CANCELED: "default",
};

async function fetchPlanos() {
  const response = await getPlanos();

  if (!response.success || !response.data) {
    throw new Error(response.error ?? "Não foi possível carregar os planos");
  }

  return response.data as Plano[];
}

async function fetchPlanoConfiguracao(planoId: string) {
  const response = await getPlanoConfiguracao(planoId);

  if (!response.success || !response.data) {
    throw new Error(
      response.error ?? "Não foi possível carregar a configuração do plano",
    );
  }

  return response.data as PlanoConfiguracaoData;
}

async function fetchPlanosMatrix() {
  const response = await getPlanosMatrix();

  if (!response.success || !response.data) {
    throw new Error(
      response.error ?? "Não foi possível carregar a matriz de planos",
    );
  }

  return response.data as PlanoMatrixData;
}

async function fetchPlanoReajustes(planoId: string) {
  const response = await getPlanoReajustes(planoId);

  if (!response.success || !response.data) {
    throw new Error(
      response.error ?? "Não foi possível carregar o histórico de reajustes",
    );
  }

  return response.data as PlanoReajusteResumo[];
}

function PlanosSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[460px,1fr]">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card
            key={`skeleton-plano-${index}`}
            className="border border-white/10 bg-background/60 backdrop-blur"
          >
            <CardBody className="space-y-4">
              <Skeleton className="h-4 w-24 rounded-lg" isLoaded={false} />
              <Skeleton className="h-4 w-32 rounded-lg" isLoaded={false} />
              <Skeleton className="h-8 w-full rounded-xl" isLoaded={false} />
            </CardBody>
          </Card>
        ))}
      </div>

      <Card className="border border-white/10 bg-background/60 backdrop-blur">
        <CardBody className="space-y-6">
          <Skeleton className="h-9 w-64 rounded-xl" isLoaded={false} />
          <Skeleton className="h-5 w-1/2 rounded-lg" isLoaded={false} />
          <Divider />
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton
                key={`skeleton-module-${index}`}
                className="h-24 rounded-xl"
                isLoaded={false}
              />
            ))}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function PlanoConfiguracaoSkeleton() {
  return (
    <div className="space-y-4">
      <Card className="border border-white/5 bg-background/50 backdrop-blur">
        <CardBody className="space-y-4">
          <Skeleton className="h-6 w-52 rounded-lg" isLoaded={false} />
          <Skeleton className="h-6 w-64 rounded-lg" isLoaded={false} />
          <Skeleton className="h-8 w-40 rounded-full" isLoaded={false} />
        </CardBody>
      </Card>
      <Card className="border border-white/5 bg-background/50 backdrop-blur">
        <CardBody className="space-y-4">
          <Skeleton className="h-5 w-40 rounded-lg" isLoaded={false} />
          <Divider />
          <div className="grid gap-3 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton
                key={`config-skeleton-${index}`}
                className="h-24 rounded-xl"
                isLoaded={false}
              />
            ))}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

type PlanoModuloItem = PlanoConfiguracaoData["modulos"][number];

const ACTIVE_CONTAINER_ID = "active-modules";
const AVAILABLE_CONTAINER_ID = "available-modules";
const MATRIX_PREVIEW_LIMIT = 10;
const tabLabelMap: Record<string, string> = {
  pricing: "Precificação e vigência",
  modules: "Módulos e versões",
  matrix: "Matriz comparativa",
};

type WorkspaceKey = "planos" | "modulos";

type MatrixDisplayRow =
  | { tipo: "categoria"; categoria: string }
  | { tipo: "modulo"; modulo: PlanoMatrixModuleRow };

function sortActiveModules(items: PlanoModuloItem[]) {
  return [...items].sort((a, b) => {
    const orderA = a.ordemNoPlano ?? a.ordem ?? 999;
    const orderB = b.ordemNoPlano ?? b.ordem ?? 999;

    return (
      orderA - orderB ||
      (a.ordem ?? 999) - (b.ordem ?? 999) ||
      a.nome.localeCompare(b.nome)
    );
  });
}

function sortAvailableModules(items: PlanoModuloItem[]) {
  return [...items].sort(
    (a, b) =>
      (a.ordem ?? 999) - (b.ordem ?? 999) || a.nome.localeCompare(b.nome),
  );
}

function assignActiveModuleOrder(items: PlanoModuloItem[]) {
  return items.map((item, index) => ({
    ...item,
    habilitado: true,
    ordemNoPlano: index,
  }));
}

type ModuleContainerProps = {
  id: typeof ACTIVE_CONTAINER_ID | typeof AVAILABLE_CONTAINER_ID;
  title: string;
  description: string;
  emptyLabel: string;
  items: PlanoModuloItem[];
  isLoading?: boolean;
  isSyncing?: boolean;
  pendingModuloId?: string | null;
  icon: ReactNode;
  onToggle: (moduloId: string, nextValue: boolean) => void;
  onMoveItem?: (moduloId: string, direction: "up" | "down") => void;
};

function ModuleContainer({
  id,
  title,
  description,
  emptyLabel,
  items,
  isLoading,
  isSyncing,
  pendingModuloId,
  icon,
  onToggle,
  onMoveItem,
}: ModuleContainerProps) {
  const { isOver, setNodeRef } = useDroppable({
    id,
    data: { type: "container", containerId: id },
  });

  return (
    <div
      ref={setNodeRef}
      className={clsx(
        "relative flex h-full flex-col gap-4 rounded-xl border border-white/10 bg-background/70 p-4 transition-all duration-200",
        isOver ? "border-primary/70 shadow-lg shadow-primary/20" : null,
        isSyncing ? "pointer-events-none opacity-70" : null,
      )}
    >
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {icon}
          </span>
          <div className="min-w-0">
            <h4 className="text-sm font-semibold uppercase tracking-widest text-primary/80">
              {title}
            </h4>
          </div>
        </div>
        <p className="text-xs text-default-500">{description}</p>
      </div>
      <Divider />
      <div className="flex-1 space-y-3">
        {isLoading ? (
          <Skeleton className="h-20 rounded-xl" isLoaded={false} />
        ) : items.length === 0 ? (
          <div className="flex items-center justify-center rounded-xl border border-dashed border-white/10 bg-background/50 px-4 py-12 text-sm text-default-400">
            {emptyLabel}
          </div>
        ) : (
          <SortableContext
            items={items.map((item) => item.moduloId)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-3">
              {items.map((item: PlanoModuloItem, index) => (
                <SortableModuleCard
                  key={item.moduloId}
                  containerId={id}
                  disabled={isSyncing || pendingModuloId === item.moduloId}
                  item={item}
                  onMoveItem={onMoveItem}
                  position={index}
                  totalItems={items.length}
                  onToggle={onToggle}
                />
              ))}
            </div>
          </SortableContext>
        )}
      </div>
      {isSyncing ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-background/70 text-xs font-medium text-default-400 backdrop-blur-sm">
          Sincronizando...
        </div>
      ) : null}
    </div>
  );
}

type SortableModuleCardProps = {
  item: PlanoModuloItem;
  containerId: typeof ACTIVE_CONTAINER_ID | typeof AVAILABLE_CONTAINER_ID;
  disabled?: boolean;
  onToggle: (moduloId: string, nextValue: boolean) => void;
  onMoveItem?: (moduloId: string, direction: "up" | "down") => void;
  position: number;
  totalItems: number;
};

function SortableModuleCard({
  item,
  containerId,
  disabled,
  onToggle,
  onMoveItem,
  position,
  totalItems,
}: SortableModuleCardProps) {
  const {
    attributes,
    isDragging,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({
    id: item.moduloId,
    data: {
      type: "item",
      containerId,
      modulo: item,
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={clsx(
        "group flex flex-col gap-3 rounded-xl border border-white/5 bg-background/70 p-4 transition-all duration-200",
        item.habilitado
          ? "shadow-lg shadow-primary/10"
          : "border-dashed opacity-90",
        isDragging ? "border-primary/50 shadow-xl shadow-primary/20" : null,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <button
            aria-label={`Arrastar módulo ${item.nome}`}
            className={clsx(
              "mt-0.5 inline-flex h-8 w-8 touch-none items-center justify-center rounded-lg border border-white/10 bg-white/5 text-default-500 transition-colors",
              disabled
                ? "cursor-not-allowed opacity-50"
                : "cursor-grab hover:border-primary/40 hover:text-primary active:cursor-grabbing",
            )}
            disabled={disabled}
            type="button"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-semibold text-foreground">{item.nome}</p>
            <p className="text-xs uppercase tracking-wider text-default-500">
              {item.slug}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {containerId === ACTIVE_CONTAINER_ID && onMoveItem ? (
            <div className="flex items-center gap-1">
              <Tooltip content="Mover para cima na ordem do sidebar">
                <Button
                  isIconOnly
                  className="min-w-8"
                  isDisabled={disabled || position === 0}
                  size="sm"
                  variant="flat"
                  onPress={() => onMoveItem(item.moduloId, "up")}
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
              </Tooltip>
              <Tooltip content="Mover para baixo na ordem do sidebar">
                <Button
                  isIconOnly
                  className="min-w-8"
                  isDisabled={disabled || position === totalItems - 1}
                  size="sm"
                  variant="flat"
                  onPress={() => onMoveItem(item.moduloId, "down")}
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
              </Tooltip>
            </div>
          ) : null}
          <Switch
            isDisabled={disabled}
            isSelected={item.habilitado}
            size="sm"
            onValueChange={(checked) => onToggle(item.moduloId, checked)}
          />
        </div>
      </div>
      {item.descricao ? (
        <p className="text-sm text-default-400">{item.descricao}</p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Chip
          className="w-fit"
          color={containerId === ACTIVE_CONTAINER_ID ? "success" : "default"}
          size="sm"
          variant="flat"
        >
          {containerId === ACTIVE_CONTAINER_ID ? "No plano" : "Disponível"}
        </Chip>
        {containerId === ACTIVE_CONTAINER_ID ? (
          <Chip
            className="w-fit"
            color="secondary"
            size="sm"
            variant="bordered"
          >
            Sidebar #{position + 1}
          </Chip>
        ) : null}
      </div>
    </div>
  );
}

function formatCurrency(value?: number | null) {
  if (value === null || value === undefined) {
    return "Sob consulta";
  }

  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  });
}

function parseMoneyValue(value: string): number | null | undefined {
  const normalized = value.trim();

  if (!normalized) {
    return undefined;
  }

  const onlyNumeric = normalized.replace(/\s/g, "");
  const sanitized = onlyNumeric.includes(",")
    ? onlyNumeric.replace(/\./g, "").replace(",", ".")
    : onlyNumeric;
  const parsed = Number(sanitized);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Number(parsed.toFixed(2));
}

export function PlanosContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const {
    data: planos,
    error: planosError,
    isLoading: isLoadingPlanos,
    mutate: mutatePlanos,
  } = useSWR<Plano[]>("admin-planos", fetchPlanos, {
    revalidateOnFocus: false,
  });

  const [initialPlanoParam] = useState(() => searchParams.get("plano"));
  const [initialTabParam] = useState(() => searchParams.get("tab"));
  const [contextModuleParam] = useState(() => searchParams.get("module"));
  const selectedWorkspace: WorkspaceKey =
    searchParams.get("workspace") === "modulos" ? "modulos" : "planos";
  const [selectedPlanoId, setSelectedPlanoId] = useState<string | null>(null);

  useEffect(() => {
    if (!planos?.length) {
      return;
    }

    if (initialPlanoParam) {
      const requestedPlano = planos.find(
        (plano) =>
          plano.id === initialPlanoParam || plano.slug === initialPlanoParam,
      );

      if (requestedPlano) {
        if (selectedPlanoId !== requestedPlano.id) {
          setSelectedPlanoId(requestedPlano.id);
        }

        return;
      }
    }

    if (!selectedPlanoId) {
      setSelectedPlanoId(planos[0].id);
    }
  }, [initialPlanoParam, planos, selectedPlanoId]);

  const {
    data: planoConfig,
    error: configError,
    isLoading: isLoadingConfig,
    isValidating: isValidatingConfig,
    mutate: mutatePlanoConfig,
  } = useSWR<PlanoConfiguracaoData>(
    selectedPlanoId ? ["admin-plano-config", selectedPlanoId] : null,
    () => fetchPlanoConfiguracao(selectedPlanoId!),
    {
      revalidateOnFocus: false,
    },
  );

  const {
    data: matrixData,
    error: matrixError,
    isLoading: isLoadingMatrix,
    mutate: mutateMatrix,
  } = useSWR<PlanoMatrixData>("admin-planos-matrix", fetchPlanosMatrix, {
    revalidateOnFocus: false,
  });

  const {
    data: reajustesData,
    error: reajustesError,
    isLoading: isLoadingReajustes,
    mutate: mutateReajustes,
  } = useSWR<PlanoReajusteResumo[]>(
    selectedPlanoId ? ["admin-plano-reajustes", selectedPlanoId] : null,
    () => fetchPlanoReajustes(selectedPlanoId!),
    {
      revalidateOnFocus: false,
    },
  );

  const [pendingModuloId, setPendingModuloId] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isSyncingDnD, setIsSyncingDnD] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isSendingReview, setIsSendingReview] = useState(false);
  const [selectedTab, setSelectedTab] = useState("pricing");
  const [isMatrixExpanded, setIsMatrixExpanded] = useState(false);
  const [reajusteMensalInput, setReajusteMensalInput] = useState("");
  const [reajusteAnualInput, setReajusteAnualInput] = useState("");
  const [vigenciaEmInput, setVigenciaEmInput] = useState("");
  const [avisoDiasAntesInput, setAvisoDiasAntesInput] = useState("7");
  const [avisoDiasDepoisInput, setAvisoDiasDepoisInput] = useState("3");
  const [aplicarAssinaturasAtivas, setAplicarAssinaturasAtivas] =
    useState(false);
  const [reajusteObservacoes, setReajusteObservacoes] = useState("");
  const [isSchedulingReajuste, setIsSchedulingReajuste] = useState(false);
  const [cancelingReajusteId, setCancelingReajusteId] = useState<string | null>(
    null,
  );
  const [draggingModule, setDraggingModule] = useState<PlanoModuloItem | null>(
    null,
  );
  const [activeModules, setActiveModules] = useState<PlanoModuloItem[]>([]);
  const [availableModules, setAvailableModules] = useState<PlanoModuloItem[]>(
    [],
  );

  const setWorkspace = useCallback(
    (workspace: WorkspaceKey) => {
      const params = new URLSearchParams(searchParams.toString());

      if (workspace === "modulos") {
        params.set("workspace", "modulos");
      } else {
        params.delete("workspace");
      }

      const query = params.toString();

      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    if (
      initialTabParam &&
      ["pricing", "modules", "matrix"].includes(initialTabParam) &&
      selectedTab !== initialTabParam
    ) {
      setSelectedTab(initialTabParam);
    }
  }, [initialTabParam, selectedTab]);

  useEffect(() => {
    if (!planoConfig) {
      setActiveModules([]);
      setAvailableModules([]);

      return;
    }

    const ativos = sortActiveModules(
      planoConfig.modulos.filter((modulo) => modulo.habilitado),
    );

    const disponiveis = sortAvailableModules(
      planoConfig.modulos.filter((modulo) => !modulo.habilitado),
    );

    setActiveModules(ativos);

    setAvailableModules(disponiveis);
  }, [planoConfig]);

  useEffect(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const yyyy = String(tomorrow.getFullYear());
    const mm = String(tomorrow.getMonth() + 1).padStart(2, "0");
    const dd = String(tomorrow.getDate()).padStart(2, "0");

    setVigenciaEmInput(`${yyyy}-${mm}-${dd}`);
    setReajusteMensalInput("");
    setReajusteAnualInput("");
    setAvisoDiasAntesInput("7");
    setAvisoDiasDepoisInput("3");
    setAplicarAssinaturasAtivas(false);
    setReajusteObservacoes("");
    setIsMatrixExpanded(false);
  }, [selectedPlanoId]);

  const totalModulos = activeModules.length + availableModules.length;
  const totalModulosAtivos = activeModules.length;
  const planosAtivos = useMemo(
    () => planos?.filter((plano) => plano.ativo).length ?? 0,
    [planos],
  );

  const ultimaVersao = planoConfig?.ultimaVersao;

  const overviewStats = useMemo(() => {
    if (!planoConfig) {
      return [] as Array<{
        id: string;
        label: string;
        value: string;
        caption: string;
        icon: ReactNode;
        tone: "success" | "secondary" | "warning" | "primary";
      }>;
    }

    return [
      {
        id: "active-modules",
        label: "Módulos ativos",
        value: String(totalModulosAtivos),
        caption: `de ${totalModulos} habilitados`,
        icon: <ToggleLeft className="h-5 w-5" />,
        tone: "success" as const,
      },
      {
        id: "available-modules",
        label: "Disponíveis",
        value: String(availableModules.length),
        caption: "aguardando ativação",
        icon: <Puzzle className="h-5 w-5" />,
        tone: "secondary" as const,
      },
      {
        id: "latest-version",
        label: "Última versão",
        value: ultimaVersao ? `v${ultimaVersao.numero}` : "Sem versão",
        caption: ultimaVersao
          ? (statusLabel[ultimaVersao.status] ?? ultimaVersao.status)
          : "publique para aplicar aos tenants",
        icon: <History className="h-5 w-5" />,
        tone: "warning" as const,
      },
      {
        id: "mensalidade",
        label: "Mensalidade",
        value: formatCurrency(planoConfig.plano.valorMensal),
        caption: "valor de cobrança recorrente",
        icon: <Boxes className="h-5 w-5" />,
        tone: "primary" as const,
      },
    ];
  }, [
    availableModules.length,
    planoConfig,
    totalModulos,
    totalModulosAtivos,
    ultimaVersao,
  ]);

  const reajustesOrdenados = useMemo(() => {
    if (!reajustesData) {
      return [] as PlanoReajusteResumo[];
    }

    return [...reajustesData].sort(
      (a, b) =>
        new Date(b.vigenciaEm).getTime() - new Date(a.vigenciaEm).getTime(),
    );
  }, [reajustesData]);

  const proximoReajuste = useMemo(
    () => reajustesOrdenados.find((item) => item.status === "SCHEDULED"),
    [reajustesOrdenados],
  );

  const headerMetrics = useMemo(
    () => [
      {
        id: "total-planos",
        label: "Planos ativos",
        value: planosAtivos,
        helper: `${planos?.length ?? 0} plano(s) cadastrado(s)`,
        tone: "primary" as const,
        icon: <Layers className="h-4 w-4" />,
      },
      {
        id: "selected-modules",
        label: "Módulos no plano",
        value: planoConfig ? totalModulosAtivos : "—",
        helper: planoConfig
          ? `${totalModulos} módulo(s) disponíveis para ${planoConfig.plano.nome}`
          : "Selecione um plano para ver a composição",
        tone: "success" as const,
        icon: <ToggleLeft className="h-4 w-4" />,
      },
      {
        id: "selected-version",
        label: "Versão vigente",
        value: ultimaVersao ? `v${ultimaVersao.numero}` : "Sem versão",
        helper: ultimaVersao
          ? (statusLabel[ultimaVersao.status] ?? ultimaVersao.status)
          : "Nenhuma versão publicada ainda",
        tone: "secondary" as const,
        icon: <History className="h-4 w-4" />,
      },
      {
        id: "scheduled-adjustments",
        label: "Reajustes programados",
        value: reajustesOrdenados.filter((item) => item.status === "SCHEDULED")
          .length,
        helper: selectedPlanoId
          ? `Plano atual: ${tabLabelMap[selectedTab] ?? "Operação"}`
          : "Sem plano selecionado",
        tone: "warning" as const,
        icon: <Clock className="h-4 w-4" />,
      },
    ],
    [
      planosAtivos,
      planos,
      planoConfig,
      totalModulosAtivos,
      totalModulos,
      ultimaVersao,
      reajustesOrdenados,
      selectedPlanoId,
      selectedTab,
    ],
  );

  const matrixRows = useMemo(() => {
    if (!matrixData) {
      return [] as MatrixDisplayRow[];
    }

    const rows: MatrixDisplayRow[] = [];

    let categoriaAtual: string | undefined;

    matrixData.modulos.forEach((modulo) => {
      const categoria = modulo.categoriaInfo?.nome ?? "Outros módulos";

      if (categoria !== categoriaAtual) {
        rows.push({ tipo: "categoria", categoria });
        categoriaAtual = categoria;
      }
      rows.push({ tipo: "modulo", modulo });
    });

    return rows;
  }, [matrixData]);

  const totalMatrixModules = useMemo(
    () => matrixRows.filter((row) => row.tipo === "modulo").length,
    [matrixRows],
  );

  const visibleMatrixRows = useMemo(() => {
    if (isMatrixExpanded || totalMatrixModules <= MATRIX_PREVIEW_LIMIT) {
      return matrixRows;
    }

    const rows: MatrixDisplayRow[] = [];
    let pendingCategory: MatrixDisplayRow | null = null;
    let displayedModules = 0;

    for (const row of matrixRows) {
      if (row.tipo === "categoria") {
        pendingCategory = row;
        continue;
      }

      if (displayedModules >= MATRIX_PREVIEW_LIMIT) {
        break;
      }

      if (pendingCategory) {
        rows.push(pendingCategory);
        pendingCategory = null;
      }

      rows.push(row);
      displayedModules += 1;
    }

    return rows;
  }, [isMatrixExpanded, matrixRows, totalMatrixModules]);

  const handleToggleModulo = useCallback(
    async (moduloId: string, habilitado: boolean) => {
      if (!selectedPlanoId) {
        return;
      }

      setPendingModuloId(moduloId);

      try {
        const response = await setPlanoModulos(selectedPlanoId, [
          { moduloId, habilitado },
        ]);

        if (!response.success) {
          throw new Error(
            response.error ?? "Não foi possível atualizar o módulo",
          );
        }

        toast.success(
          habilitado
            ? "Módulo habilitado no plano"
            : "Módulo desabilitado no plano",
        );

        await Promise.all([
          mutatePlanoConfig(),
          mutatePlanos(),
          mutateMatrix(),
        ]);
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Erro ao atualizar módulo do plano",
        );
        await mutatePlanoConfig();
      } finally {
        setPendingModuloId(null);
      }
    },
    [mutatePlanoConfig, mutatePlanos, mutateMatrix, selectedPlanoId],
  );

  const syncActiveModules = useCallback(
    async (
      nextActiveIds: string[],
      showToast = false,
      successMessage = "Matriz de módulos atualizada com sucesso",
    ) => {
      if (!selectedPlanoId) {
        return;
      }

      setIsSyncingDnD(true);
      try {
        const response = await syncPlanoModulos(selectedPlanoId, nextActiveIds);

        if (!response.success) {
          throw new Error(
            response.error ?? "Não foi possível sincronizar os módulos",
          );
        }

        if (showToast) {
          toast.success(successMessage);
        }

        await Promise.all([
          mutatePlanoConfig(),
          mutatePlanos(),
          mutateMatrix(),
        ]);
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Erro ao sincronizar módulos do plano",
        );
        await mutatePlanoConfig();
      } finally {
        setIsSyncingDnD(false);
      }
    },
    [mutatePlanoConfig, mutatePlanos, mutateMatrix, selectedPlanoId],
  );

  const handleMoveActiveModule = useCallback(
    (moduloId: string, direction: "up" | "down") => {
      const currentIndex = activeModules.findIndex(
        (item) => item.moduloId === moduloId,
      );

      if (currentIndex === -1) {
        return;
      }

      const targetIndex =
        direction === "up" ? currentIndex - 1 : currentIndex + 1;

      if (targetIndex < 0 || targetIndex >= activeModules.length) {
        return;
      }

      const reordered = assignActiveModuleOrder(
        arrayMove(activeModules, currentIndex, targetIndex),
      );

      setActiveModules(reordered);

      void syncActiveModules(
        reordered.map((modulo) => modulo.moduloId),
        true,
        "Ordem dos módulos no sidebar atualizada.",
      );
    },
    [activeModules, syncActiveModules],
  );

  const handlePublicarVersao = useCallback(async () => {
    if (!selectedPlanoId) {
      toast.error("Selecione um plano para publicar uma nova versão");

      return;
    }

    setIsPublishing(true);

    try {
      const versaoParaPublicar =
        planoConfig?.versoes.find((versao) => versao.status === "REVIEW") ??
        planoConfig?.versoes.find((versao) => versao.status === "DRAFT");

      const response = await publishPlanoVersao(selectedPlanoId, {
        versaoId:
          versaoParaPublicar && versaoParaPublicar.status !== "PUBLISHED"
            ? versaoParaPublicar.id
            : undefined,
      });

      if (!response.success || !response.data) {
        throw new Error(
          response.error ?? "Não foi possível publicar a nova versão",
        );
      }

      toast.success(
        `Versão ${response.data.numero} publicada com sucesso para o plano.`,
      );

      await Promise.all([mutatePlanoConfig(), mutatePlanos(), mutateMatrix()]);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Erro ao publicar a nova versão do plano",
      );
    } finally {
      setIsPublishing(false);
    }
  }, [
    mutatePlanoConfig,
    mutatePlanos,
    mutateMatrix,
    planoConfig,
    selectedPlanoId,
  ]);

  const handleSalvarRascunho = useCallback(async () => {
    if (!selectedPlanoId) {
      toast.error("Selecione um plano para salvar um rascunho");

      return;
    }

    setIsSavingDraft(true);

    try {
      const response = await createPlanoVersaoDraft(selectedPlanoId);

      if (!response.success || !response.data) {
        throw new Error(response.error ?? "Não foi possível salvar o rascunho");
      }

      toast.success(`Rascunho v${response.data.numero} salvo com sucesso.`);

      await Promise.all([mutatePlanoConfig(), mutatePlanos(), mutateMatrix()]);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Erro ao salvar rascunho da versão",
      );
    } finally {
      setIsSavingDraft(false);
    }
  }, [mutatePlanoConfig, mutatePlanos, mutateMatrix, selectedPlanoId]);

  const handleEnviarRevisao = useCallback(async () => {
    if (!selectedPlanoId) {
      toast.error("Selecione um plano para enviar para revisão");

      return;
    }

    setIsSendingReview(true);

    try {
      const response = await createPlanoVersaoReview(selectedPlanoId);

      if (!response.success || !response.data) {
        throw new Error(
          response.error ?? "Não foi possível enviar para revisão",
        );
      }

      toast.success(
        `Versão v${response.data.numero} enviada para revisão com sucesso.`,
      );

      await Promise.all([mutatePlanoConfig(), mutatePlanos(), mutateMatrix()]);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Erro ao enviar versão para revisão",
      );
    } finally {
      setIsSendingReview(false);
    }
  }, [mutatePlanoConfig, mutatePlanos, mutateMatrix, selectedPlanoId]);

  const handleAgendarReajuste = useCallback(async () => {
    if (!selectedPlanoId || !planoConfig) {
      toast.error("Selecione um plano para agendar reajuste.");

      return;
    }

    if (!vigenciaEmInput) {
      toast.error("Informe a data de vigência do reajuste.");

      return;
    }

    const valorMensalNovo = parseMoneyValue(reajusteMensalInput);
    const valorAnualNovo = parseMoneyValue(reajusteAnualInput);

    if (valorMensalNovo === null || valorAnualNovo === null) {
      toast.error("Preencha os valores com formato numérico válido.");

      return;
    }

    const avisoDiasAntes = Number(avisoDiasAntesInput);
    const avisoDiasDepois = Number(avisoDiasDepoisInput);

    if (!Number.isFinite(avisoDiasAntes) || avisoDiasAntes < 0) {
      toast.error("Dias de aviso antes da vigência inválido.");

      return;
    }

    if (!Number.isFinite(avisoDiasDepois) || avisoDiasDepois < 0) {
      toast.error("Dias de aviso após vigência inválido.");

      return;
    }

    setIsSchedulingReajuste(true);

    try {
      const response = await agendarPlanoReajuste(selectedPlanoId, {
        valorMensalNovo,
        valorAnualNovo,
        vigenciaEm: vigenciaEmInput,
        avisoDiasAntes,
        avisoDiasDepois,
        aplicarAssinaturasAtivas,
        observacoes: reajusteObservacoes,
      });

      if (!response.success || !response.data) {
        throw new Error(response.error ?? "Falha ao agendar reajuste.");
      }

      toast.success(
        `Reajuste agendado para ${new Date(
          response.data.reajuste.vigenciaEm,
        ).toLocaleDateString(
          "pt-BR",
        )}. ${response.data.impacto.adminsNotificaveis} admin(s) serão notificados.`,
      );

      await Promise.all([
        mutatePlanos(),
        mutatePlanoConfig(),
        mutateReajustes(),
        mutateMatrix(),
      ]);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Erro ao agendar reajuste de preço",
      );
    } finally {
      setIsSchedulingReajuste(false);
    }
  }, [
    avisoDiasAntesInput,
    avisoDiasDepoisInput,
    aplicarAssinaturasAtivas,
    mutateMatrix,
    mutatePlanoConfig,
    mutatePlanos,
    mutateReajustes,
    planoConfig,
    reajusteAnualInput,
    reajusteMensalInput,
    reajusteObservacoes,
    selectedPlanoId,
    vigenciaEmInput,
  ]);

  const handleCancelarReajuste = useCallback(
    async (reajusteId: string) => {
      setCancelingReajusteId(reajusteId);

      try {
        const response = await cancelarPlanoReajuste(
          reajusteId,
          "Cancelado manualmente no painel de planos",
        );

        if (!response.success || !response.data) {
          throw new Error(
            response.error ?? "Não foi possível cancelar o reajuste.",
          );
        }

        toast.success("Reajuste cancelado com sucesso.");
        await Promise.all([
          mutateReajustes(),
          mutatePlanoConfig(),
          mutatePlanos(),
          mutateMatrix(),
        ]);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Erro ao cancelar reajuste",
        );
      } finally {
        setCancelingReajusteId(null);
      }
    },
    [mutateMatrix, mutatePlanoConfig, mutatePlanos, mutateReajustes],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setDraggingModule(
      (event.active.data.current?.modulo as PlanoModuloItem) ?? null,
    );
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      setDraggingModule(null);

      if (!over || !active.data.current) {
        return;
      }

      const activeContainer = active.data.current?.containerId as
        | typeof ACTIVE_CONTAINER_ID
        | typeof AVAILABLE_CONTAINER_ID
        | undefined;

      let overContainer =
        (over.data.current?.containerId as
          | typeof ACTIVE_CONTAINER_ID
          | typeof AVAILABLE_CONTAINER_ID
          | undefined) ?? (typeof over.id === "string" ? over.id : undefined);

      if (
        overContainer !== ACTIVE_CONTAINER_ID &&
        overContainer !== AVAILABLE_CONTAINER_ID
      ) {
        overContainer = activeContainer;
      }

      if (!activeContainer || !overContainer) {
        return;
      }

      if (
        activeContainer === ACTIVE_CONTAINER_ID &&
        overContainer === ACTIVE_CONTAINER_ID
      ) {
        const oldIndex = activeModules.findIndex(
          (item) => item.moduloId === active.id,
        );
        const newIndex =
          over.data.current?.type === "item"
            ? activeModules.findIndex((item) => item.moduloId === over.id)
            : activeModules.length - 1;

        if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
          const reordered = assignActiveModuleOrder(
            arrayMove(activeModules, oldIndex, newIndex),
          );

          setActiveModules(reordered);

          void syncActiveModules(
            reordered.map((modulo) => modulo.moduloId),
            true,
            "Ordem dos módulos no sidebar atualizada.",
          );
        }

        return;
      }

      if (
        activeContainer === AVAILABLE_CONTAINER_ID &&
        overContainer === AVAILABLE_CONTAINER_ID
      ) {
        const oldIndex = availableModules.findIndex(
          (item) => item.moduloId === active.id,
        );
        const newIndex =
          over.data.current?.type === "item"
            ? availableModules.findIndex((item) => item.moduloId === over.id)
            : availableModules.length - 1;

        if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
          const reordered = arrayMove(availableModules, oldIndex, newIndex);

          setAvailableModules(reordered);
        }

        return;
      }

      if (
        activeContainer === ACTIVE_CONTAINER_ID &&
        overContainer === AVAILABLE_CONTAINER_ID
      ) {
        const movingItem = activeModules.find(
          (item) => item.moduloId === active.id,
        );

        if (!movingItem) {
          return;
        }

        const nextActive = assignActiveModuleOrder(
          activeModules.filter((item) => item.moduloId !== active.id),
        );

        const nextAvailable = availableModules.slice();
        const targetIndex =
          over.data.current?.type === "item"
            ? nextAvailable.findIndex((item) => item.moduloId === over.id)
            : nextAvailable.length;

        nextAvailable.splice(targetIndex, 0, {
          ...movingItem,
          habilitado: false,
        });

        setActiveModules(nextActive);
        setAvailableModules(sortAvailableModules(nextAvailable));

        void syncActiveModules(
          nextActive.map((modulo) => modulo.moduloId),
          true,
        );

        return;
      }

      if (
        activeContainer === AVAILABLE_CONTAINER_ID &&
        overContainer === ACTIVE_CONTAINER_ID
      ) {
        const movingItem = availableModules.find(
          (item) => item.moduloId === active.id,
        );

        if (!movingItem) {
          return;
        }

        const nextAvailable = availableModules.filter(
          (item) => item.moduloId !== active.id,
        );

        const nextActive = activeModules.slice();
        const targetIndex =
          over.data.current?.type === "item"
            ? nextActive.findIndex((item) => item.moduloId === over.id)
            : nextActive.length;

        nextActive.splice(targetIndex, 0, {
          ...movingItem,
          habilitado: true,
        });

        const orderedNextActive = assignActiveModuleOrder(nextActive);

        setAvailableModules(sortAvailableModules(nextAvailable));
        setActiveModules(orderedNextActive);

        void syncActiveModules(
          orderedNextActive.map((modulo) => modulo.moduloId),
          true,
        );
      }
    },
    [activeModules, availableModules, syncActiveModules],
  );

  return (
    <section className="space-y-6 px-3 py-6 sm:px-0 sm:py-8">
      <PeoplePageHeader
        tag="Administração comercial"
        title="Planos e módulos"
        description="Domínio comercial central da plataforma. Use a aba de planos para controlar preço, vigência e composição da oferta. Use a aba de módulos para governar o catálogo técnico do produto."
        actions={
          <>
            {selectedWorkspace === "planos" && selectedPlanoId ? (
              <Chip color="primary" size="sm" variant="flat">
                Plano selecionado:{" "}
                {planoConfig?.plano.nome ??
                  planos?.find((plano) => plano.id === selectedPlanoId)?.nome ??
                  "Carregando"}
              </Chip>
            ) : null}
            {selectedWorkspace === "modulos" ? (
              <Chip color="secondary" size="sm" variant="flat">
                Visão atual: catálogo de módulos
              </Chip>
            ) : null}
          </>
        }
      />

      <Card className="border border-white/10 bg-background/70 backdrop-blur-xl">
        <CardBody className="p-3 sm:p-4">
          <Tabs
            aria-label="Domínio comercial"
            color="primary"
            selectedKey={selectedWorkspace}
            variant="underlined"
            onSelectionChange={(key) => setWorkspace(key as WorkspaceKey)}
          >
            <Tab
              key="planos"
              title={
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4" />
                  <span>Planos</span>
                </div>
              }
            />
            <Tab
              key="modulos"
              title={
                <div className="flex items-center gap-2">
                  <Puzzle className="h-4 w-4" />
                  <span>Módulos</span>
                </div>
              }
            />
          </Tabs>
        </CardBody>
      </Card>

      {selectedWorkspace === "planos" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {headerMetrics.map((metric) => (
            <PeopleMetricCard
              key={metric.id}
              helper={metric.helper}
              icon={metric.icon}
              label={metric.label}
              tone={metric.tone}
              value={metric.value}
            />
          ))}
        </div>
      ) : null}

      {selectedWorkspace === "planos" && planosError ? (
        <Card className="border border-danger/30 bg-danger/10 text-danger">
          <CardBody className="flex flex-col gap-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 flex-shrink-0" />
              <div>
                <p className="font-semibold">
                  Não foi possível carregar os planos cadastrados.
                </p>
                <p className="text-sm text-danger/80">
                  {planosError instanceof Error
                    ? planosError.message
                    : "Erro inesperado. Tente novamente em instantes."}
                </p>
              </div>
            </div>
          </CardBody>
        </Card>
      ) : null}

      {selectedWorkspace === "modulos" ? (
        <ModulosContent embedded />
      ) : isLoadingPlanos || !planos ? (
        <PlanosSkeleton />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[360px,minmax(0,1fr)]">
          <PeoplePanel
            title="Catálogo de planos"
            description="Selecione o plano para editar preço, módulos, versões e reajustes. O painel principal sempre reflete o item escolhido."
          >
            <aside className="grid grid-cols-1 gap-3">
              {planos.map((plano) => {
                const selecionado = plano.id === selectedPlanoId;

                return (
                  <Card
                    key={plano.id}
                    isPressable
                    className={clsx(
                      "group relative flex h-full flex-col justify-between overflow-hidden rounded-2xl border bg-background/60 transition-all duration-200",
                      selecionado
                        ? "border-primary/50 bg-primary/10 shadow-lg shadow-primary/10"
                        : "border-white/10 hover:border-primary/35 hover:bg-background/80",
                    )}
                    onPress={() => setSelectedPlanoId(plano.id)}
                  >
                    <div
                      className={clsx(
                        "pointer-events-none absolute inset-0 opacity-30 transition-opacity duration-300",
                        selecionado
                          ? "bg-primary/10"
                          : "group-hover:bg-primary/5",
                      )}
                    />
                    <CardBody className="relative space-y-3 p-4">
                      <span
                        className={clsx(
                          "block h-1 w-full rounded-full",
                          selecionado
                            ? "bg-linear-to-r from-primary/80 via-primary/60 to-primary/80"
                            : "bg-linear-to-r from-default-600/30 via-default-500/10 to-default-600/30",
                        )}
                      />
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs uppercase tracking-[0.16em] text-primary/80">
                            Plano
                          </p>
                          <h3 className="truncate text-base font-semibold text-foreground">
                            {plano.nome}
                          </h3>
                        </div>
                        <Chip
                          className="shrink-0 border border-white/10"
                          color={plano.ativo ? "success" : "default"}
                          size="sm"
                          variant={plano.ativo ? "flat" : "dot"}
                        >
                          {plano.ativo ? "Ativo" : "Inativo"}
                        </Chip>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-sm text-default-400">
                        <span>{formatCurrency(plano.valorMensal)} / mês</span>
                        <Divider className="h-4" orientation="vertical" />
                        <span className="text-xs uppercase tracking-wide text-default-500">
                          {plano.slug}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-default-500">
                        {plano.limiteUsuarios ? (
                          <Chip color="secondary" size="sm" variant="flat">
                            Até {plano.limiteUsuarios} usuários
                          </Chip>
                        ) : (
                          <Chip color="secondary" size="sm" variant="flat">
                            Usuários ilimitados
                          </Chip>
                        )}
                        {plano.limiteProcessos ? (
                          <Chip color="default" size="sm" variant="flat">
                            Até {plano.limiteProcessos} processos
                          </Chip>
                        ) : null}
                      </div>
                    </CardBody>
                  </Card>
                );
              })}
            </aside>
          </PeoplePanel>

          <div className="space-y-6">
            {configError ? (
              <Card className="border border-danger/30 bg-danger/10 text-danger">
                <CardBody className="flex flex-col gap-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-5 w-5 flex-shrink-0" />
                    <div>
                      <p className="font-semibold">
                        Não foi possível carregar a configuração deste plano.
                      </p>
                      <p className="text-sm text-danger/80">
                        {configError instanceof Error
                          ? configError.message
                          : "Erro inesperado. Tente novamente em instantes."}
                      </p>
                    </div>
                  </div>
                  <Button
                    color="primary"
                    startContent={<RefreshCw className="h-4 w-4" />}
                    onPress={() => mutatePlanoConfig()}
                  >
                    Tentar novamente
                  </Button>
                </CardBody>
              </Card>
            ) : null}

            {selectedPlanoId && (isLoadingConfig || !planoConfig) ? (
              <PlanoConfiguracaoSkeleton />
            ) : null}

            {planoConfig ? (
              <PeoplePanel
                title={planoConfig.plano.nome}
                description={`Gestão detalhada do plano selecionado. Aba atual: ${tabLabelMap[selectedTab] ?? "Operação do plano"}.`}
              >
                <Tabs
                  aria-label="Seções de gestão de planos"
                  color="primary"
                  selectedKey={selectedTab}
                  variant="underlined"
                  onSelectionChange={(key) => setSelectedTab(String(key))}
                >
                  <Tab
                    key="pricing"
                    title={
                      <div className="flex items-center gap-2">
                        <Boxes className="h-4 w-4" />
                        <span>Precificação e Vigência</span>
                      </div>
                    }
                  />
                  <Tab
                    key="modules"
                    title={
                      <div className="flex items-center gap-2">
                        <Puzzle className="h-4 w-4" />
                        <span>Módulos e Versões</span>
                      </div>
                    }
                  />
                  <Tab
                    key="matrix"
                    title={
                      <div className="flex items-center gap-2">
                        <Layers className="h-4 w-4" />
                        <span>Matriz comparativa</span>
                      </div>
                    }
                  />
                </Tabs>

                {selectedTab === "pricing" ? (
                  <div className="mt-4 space-y-4">
                    <Card className="border border-white/10 bg-background/70 backdrop-blur-xl">
                      <CardHeader className="flex flex-col gap-2 pb-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-xs uppercase tracking-[0.3em] text-primary/80">
                            Preço vigente
                          </p>
                          <h2 className="text-xl font-semibold text-foreground">
                            {planoConfig.plano.nome}
                          </h2>
                          <p className="text-sm text-default-400">
                            Regra atual do catálogo: novos clientes entram pelo
                            preço vigente do plano.
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Chip color="primary" size="sm" variant="flat">
                            Mensal:{" "}
                            {formatCurrency(planoConfig.plano.valorMensal)}
                          </Chip>
                          <Chip color="secondary" size="sm" variant="flat">
                            Anual:{" "}
                            {formatCurrency(planoConfig.plano.valorAnual)}
                          </Chip>
                        </div>
                      </CardHeader>
                      <Divider />
                      <CardBody className="space-y-4">
                        {proximoReajuste ? (
                          <div className="rounded-xl border border-warning/30 bg-warning/10 px-3 py-3 text-sm text-warning-200">
                            Reajuste programado para{" "}
                            <span className="font-semibold">
                              {new Date(
                                proximoReajuste.vigenciaEm,
                              ).toLocaleDateString("pt-BR")}
                            </span>
                            . Novas assinaturas passam a usar o novo valor na
                            vigência.
                          </div>
                        ) : null}
                        <div className="grid gap-3 md:grid-cols-2">
                          <Input
                            description={`Atual: ${formatCurrency(
                              planoConfig.plano.valorMensal,
                            )}`}
                            label="Novo valor mensal (opcional)"
                            placeholder="Ex.: 150,00"
                            value={reajusteMensalInput}
                            onValueChange={setReajusteMensalInput}
                          />
                          <Input
                            description={`Atual: ${formatCurrency(
                              planoConfig.plano.valorAnual,
                            )}`}
                            label="Novo valor anual (opcional)"
                            placeholder="Ex.: 1500,00"
                            value={reajusteAnualInput}
                            onValueChange={setReajusteAnualInput}
                          />
                          <DateInput
                            isRequired
                            description="Vigência inicia às 00:00 do dia escolhido."
                            label="Data de vigência"
                            value={vigenciaEmInput}
                            onValueChange={setVigenciaEmInput}
                          />
                          <Input
                            description="Faixa permitida: 0 a 30 dias."
                            label="Avisar antes (dias)"
                            max={30}
                            min={0}
                            type="number"
                            value={avisoDiasAntesInput}
                            onValueChange={setAvisoDiasAntesInput}
                          />
                          <Input
                            description="Faixa permitida: 0 a 30 dias."
                            label="Avisar depois (dias)"
                            max={30}
                            min={0}
                            type="number"
                            value={avisoDiasDepoisInput}
                            onValueChange={setAvisoDiasDepoisInput}
                          />
                          <div className="flex items-center rounded-xl border border-white/10 bg-background/60 px-3">
                            <Switch
                              isSelected={aplicarAssinaturasAtivas}
                              onValueChange={setAplicarAssinaturasAtivas}
                            >
                              Atualizar assinaturas ativas no dia da vigência
                            </Switch>
                          </div>
                        </div>
                        <Textarea
                          description="Contexto interno para auditoria e operação."
                          label="Observações do reajuste"
                          maxRows={4}
                          minRows={3}
                          placeholder="Motivo da mudança, política comercial, público impactado..."
                          value={reajusteObservacoes}
                          onValueChange={setReajusteObservacoes}
                        />
                        <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-default-400">
                          Se a opção de atualizar assinaturas ativas ficar
                          desmarcada, clientes ativos mantêm o valor contratado
                          e o novo preço vale apenas para novas assinaturas.
                        </div>
                        <div className="flex justify-end">
                          <Button
                            color="primary"
                            isDisabled={Boolean(proximoReajuste)}
                            isLoading={isSchedulingReajuste}
                            startContent={<Clock className="h-4 w-4" />}
                            onPress={handleAgendarReajuste}
                          >
                            Agendar reajuste
                          </Button>
                        </div>
                      </CardBody>
                    </Card>

                    <Card className="border border-white/10 bg-background/70 backdrop-blur-xl">
                      <CardHeader className="flex flex-col gap-2 pb-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-xs uppercase tracking-[0.3em] text-primary/80">
                            Histórico de reajustes
                          </p>
                          <h3 className="text-lg font-semibold text-foreground">
                            Auditoria de preço por plano
                          </h3>
                          <p className="text-sm text-default-400">
                            Programação, aplicação automática e cancelamentos.
                          </p>
                        </div>
                        <Chip size="sm" variant="flat">
                          {reajustesOrdenados.length} registro(s)
                        </Chip>
                      </CardHeader>
                      <Divider />
                      <CardBody className="space-y-3">
                        {reajustesError ? (
                          <div className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                            {reajustesError instanceof Error
                              ? reajustesError.message
                              : "Erro ao carregar reajustes do plano."}
                          </div>
                        ) : null}
                        {isLoadingReajustes && !reajustesData ? (
                          <Skeleton
                            className="h-20 rounded-xl"
                            isLoaded={false}
                          />
                        ) : null}
                        {!isLoadingReajustes &&
                        reajustesOrdenados.length === 0 ? (
                          <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-6 text-sm text-default-500">
                            Nenhum reajuste cadastrado para este plano.
                          </div>
                        ) : null}
                        {reajustesOrdenados.map((reajuste) => (
                          <div
                            key={reajuste.id}
                            className="space-y-2 rounded-xl border border-white/10 bg-background/70 p-3"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <Chip
                                  color={
                                    reajusteStatusColor[reajuste.status] ??
                                    "default"
                                  }
                                  size="sm"
                                  variant="flat"
                                >
                                  {reajusteStatusLabel[reajuste.status] ??
                                    reajuste.status}
                                </Chip>
                                <span className="text-xs text-default-500">
                                  Vigência{" "}
                                  {new Date(
                                    reajuste.vigenciaEm,
                                  ).toLocaleDateString("pt-BR")}
                                </span>
                              </div>
                              {reajuste.status === "SCHEDULED" ? (
                                <Button
                                  color="danger"
                                  isLoading={
                                    cancelingReajusteId === reajuste.id
                                  }
                                  size="sm"
                                  startContent={<XCircle className="h-4 w-4" />}
                                  variant="flat"
                                  onPress={() =>
                                    handleCancelarReajuste(reajuste.id)
                                  }
                                >
                                  Cancelar
                                </Button>
                              ) : null}
                            </div>
                            <div className="grid gap-2 text-sm sm:grid-cols-2">
                              <p className="text-default-300">
                                Mensal:{" "}
                                <span className="text-default-500">
                                  {formatCurrency(reajuste.valorMensalAnterior)}
                                </span>{" "}
                                →{" "}
                                <span className="font-semibold text-foreground">
                                  {formatCurrency(reajuste.valorMensalNovo)}
                                </span>
                              </p>
                              <p className="text-default-300">
                                Anual:{" "}
                                <span className="text-default-500">
                                  {formatCurrency(reajuste.valorAnualAnterior)}
                                </span>{" "}
                                →{" "}
                                <span className="font-semibold text-foreground">
                                  {formatCurrency(reajuste.valorAnualNovo)}
                                </span>
                              </p>
                            </div>
                            <p className="text-xs text-default-500">
                              {reajuste.aplicarAssinaturasAtivas
                                ? "Assinaturas ativas serão ajustadas na vigência."
                                : "Assinaturas ativas mantêm valor contratado atual."}
                            </p>
                            {reajuste.observacoes ? (
                              <p className="text-xs text-default-400">
                                Obs.: {reajuste.observacoes}
                              </p>
                            ) : null}
                          </div>
                        ))}
                      </CardBody>
                    </Card>
                  </div>
                ) : null}

                {selectedTab === "modules" ? (
                  <div className="mt-4 space-y-4">
                    <div className="rounded-xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-default-300">
                      <p className="font-medium text-foreground">
                        Aqui é o lugar onde um módulo entra ou sai de um plano.
                      </p>
                      <p className="mt-1">
                        A tela de Módulos cuida do catálogo técnico do produto.
                        Esta aba cuida da oferta comercial do plano selecionado.
                        {contextModuleParam ? (
                          <>
                            {" "}
                            Você veio para revisar o módulo{" "}
                            <span className="font-semibold text-foreground">
                              {contextModuleParam}
                            </span>{" "}
                            neste plano.
                          </>
                        ) : null}
                      </p>
                    </div>

                    {overviewStats.length ? (
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        {overviewStats.map((stat) => (
                          <PeopleMetricCard
                            key={stat.id}
                            helper={stat.caption}
                            icon={stat.icon}
                            label={stat.label}
                            tone={stat.tone}
                            value={stat.value}
                          />
                        ))}
                      </div>
                    ) : null}

                    <Card className="border border-white/10 bg-background/70 backdrop-blur-xl">
                      <CardHeader className="flex flex-col gap-3 pb-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="space-y-1">
                          <p className="text-xs uppercase tracking-[0.3em] text-primary/80">
                            Resumo do plano
                          </p>
                          <h2 className="text-xl font-semibold text-foreground">
                            {planoConfig.plano.nome}
                          </h2>
                          <div className="flex flex-wrap items-center gap-3 text-sm text-default-400">
                            <span>
                              {totalModulosAtivos} / {totalModulos} módulos
                              ativos
                            </span>
                            <Divider
                              className="hidden h-4 sm:block"
                              orientation="vertical"
                            />
                            <span className="flex items-center gap-1">
                              <Sparkles className="h-4 w-4 text-primary" />
                              Slug: {planoConfig.plano.slug}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-col gap-2 sm:items-end">
                          <div className="flex flex-wrap gap-2 sm:justify-end">
                            <Button
                              isDisabled={isPublishing || isSendingReview}
                              isLoading={isSavingDraft}
                              startContent={<Save className="h-4 w-4" />}
                              variant="flat"
                              onPress={handleSalvarRascunho}
                            >
                              Salvar rascunho
                            </Button>
                            <Button
                              color="secondary"
                              isDisabled={isPublishing || isSavingDraft}
                              isLoading={isSendingReview}
                              startContent={<Send className="h-4 w-4" />}
                              variant="flat"
                              onPress={handleEnviarRevisao}
                            >
                              Enviar para revisão
                            </Button>
                            <Button
                              color="primary"
                              isLoading={isPublishing || isValidatingConfig}
                              startContent={<Rocket className="h-4 w-4" />}
                              onPress={handlePublicarVersao}
                            >
                              Publicar versão
                            </Button>
                          </div>
                          {isValidatingConfig ? (
                            <p className="text-xs text-default-500">
                              Sincronizando dados do plano...
                            </p>
                          ) : null}
                        </div>
                      </CardHeader>
                      <Divider />
                      <CardBody className="space-y-4">
                        {ultimaVersao ? (
                          <div className="flex flex-wrap items-center gap-3 text-sm text-default-400">
                            <Tooltip content="Versão publicada aplicada a todos os tenants deste plano.">
                              <Chip
                                className="w-fit text-xs uppercase tracking-wide"
                                color={
                                  statusTone[ultimaVersao.status] ?? "default"
                                }
                                size="sm"
                                startContent={
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                }
                                variant="flat"
                              >
                                Versão {ultimaVersao.numero} ·{" "}
                                {statusLabel[ultimaVersao.status] ??
                                  ultimaVersao.status}
                              </Chip>
                            </Tooltip>
                            {ultimaVersao.publicadoEm ? (
                              <span className="flex items-center gap-1">
                                <ShieldCheck className="h-4 w-4 text-success" />
                                Publicada em{" "}
                                {new Date(
                                  ultimaVersao.publicadoEm,
                                ).toLocaleString("pt-BR")}
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary/90">
                            <AlertTriangle className="h-4 w-4" />
                            Este plano ainda não possui versão publicada.
                            Publique a primeira configuração após ajustar os
                            módulos.
                          </div>
                        )}
                      </CardBody>
                    </Card>

                    <Card className="border border-white/10 bg-background/70 backdrop-blur-xl">
                      <CardHeader className="flex flex-col gap-2 pb-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-xs uppercase tracking-[0.3em] text-primary/80">
                            Builder de módulos
                          </p>
                          <h3 className="text-lg font-semibold text-foreground">
                            Ordem e ativação dos módulos do plano
                          </h3>
                          <p className="text-sm text-default-400">
                            Use a alça para arrastar, ou as setas nos módulos
                            ativos para definir a ordem do sidebar. Arraste da
                            coluna de disponíveis para habilitar, ou devolva
                            para desabilitar.
                          </p>
                        </div>
                        <Chip color="secondary" size="sm" variant="flat">
                          {activeModules.length} ativos ·{" "}
                          {availableModules.length} disponíveis
                        </Chip>
                      </CardHeader>
                      <Divider />
                      <CardBody className="space-y-4">
                        <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-default-400">
                          A coluna de módulos ativos reflete a ordem em que o
                          tenant verá os módulos no sidebar quando a versão do
                          plano for publicada.
                        </div>
                        <DndContext
                          collisionDetection={closestCorners}
                          sensors={sensors}
                          onDragEnd={handleDragEnd}
                          onDragStart={handleDragStart}
                        >
                          <div className="grid gap-4 lg:grid-cols-2">
                            <ModuleContainer
                              description="Módulos liberados para o plano. Arraste dentro da coluna ou use as setas para ordenar o sidebar."
                              emptyLabel="Arraste módulos para cá para liberar no plano."
                              icon={<ToggleLeft className="h-4 w-4" />}
                              id={ACTIVE_CONTAINER_ID}
                              isLoading={isLoadingConfig}
                              isSyncing={isSyncingDnD}
                              items={activeModules}
                              pendingModuloId={pendingModuloId}
                              title="Módulos ativos"
                              onMoveItem={handleMoveActiveModule}
                              onToggle={handleToggleModulo}
                            />
                            <ModuleContainer
                              description="Módulos existentes que ainda não fazem parte deste plano."
                              emptyLabel="Todos os módulos estão ativos no plano."
                              icon={<Boxes className="h-4 w-4" />}
                              id={AVAILABLE_CONTAINER_ID}
                              isLoading={isLoadingConfig}
                              isSyncing={isSyncingDnD}
                              items={availableModules}
                              pendingModuloId={pendingModuloId}
                              title="Módulos disponíveis"
                              onToggle={handleToggleModulo}
                            />
                          </div>
                          <DragOverlay>
                            {draggingModule ? (
                              <div className="rotate-2 scale-[1.01] opacity-95">
                                <div className="flex flex-col gap-3 rounded-xl border border-primary/40 bg-background/95 p-4 shadow-2xl shadow-primary/20 backdrop-blur">
                                  <div className="flex items-start gap-3">
                                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary">
                                      <GripVertical className="h-4 w-4" />
                                    </span>
                                    <div className="min-w-0 space-y-1">
                                      <p className="text-sm font-semibold text-foreground">
                                        {draggingModule.nome}
                                      </p>
                                      <p className="text-xs uppercase tracking-wider text-default-500">
                                        {draggingModule.slug}
                                      </p>
                                    </div>
                                  </div>
                                  {draggingModule.descricao ? (
                                    <p className="text-sm text-default-400">
                                      {draggingModule.descricao}
                                    </p>
                                  ) : null}
                                </div>
                              </div>
                            ) : null}
                          </DragOverlay>
                        </DndContext>
                      </CardBody>
                    </Card>

                    <Card className="border border-white/10 bg-background/70 backdrop-blur-xl">
                      <CardHeader className="flex flex-col gap-2 pb-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-xs uppercase tracking-[0.3em] text-primary/70">
                            Histórico de versões
                          </p>
                          <h3 className="text-lg font-semibold text-foreground">
                            Auditoria de publicações
                          </h3>
                        </div>
                      </CardHeader>
                      <Divider />
                      <CardBody className="space-y-3">
                        {planoConfig.versoes.length === 0 ? (
                          <div className="flex items-center gap-2 rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-sm text-default-500">
                            <Clock className="h-4 w-4" />
                            Nenhuma versão publicada até o momento.
                          </div>
                        ) : (
                          planoConfig.versoes.map((versao) => (
                            <div
                              key={versao.id}
                              className="flex flex-col gap-2 rounded-lg border border-white/5 bg-background/70 p-3 sm:flex-row sm:items-center sm:justify-between"
                            >
                              <div className="space-y-1">
                                <div className="flex items-center gap-3">
                                  <Chip
                                    color={
                                      statusTone[versao.status] ?? "default"
                                    }
                                    size="sm"
                                    startContent={
                                      <ShieldCheck className="h-3.5 w-3.5" />
                                    }
                                    variant="flat"
                                  >
                                    Versão {versao.numero}
                                  </Chip>
                                  <span className="text-xs uppercase tracking-wide text-default-500">
                                    {statusLabel[versao.status] ??
                                      versao.status}
                                  </span>
                                </div>
                                {versao.titulo ? (
                                  <p className="text-sm font-medium text-foreground">
                                    {versao.titulo}
                                  </p>
                                ) : null}
                                {versao.descricao ? (
                                  <p className="text-sm text-default-400">
                                    {versao.descricao}
                                  </p>
                                ) : null}
                              </div>
                              <div className="flex flex-col items-start gap-1 text-xs text-default-500 sm:items-end">
                                {versao.publicadoEm ? (
                                  <span>
                                    Publicado em{" "}
                                    {new Date(
                                      versao.publicadoEm,
                                    ).toLocaleString("pt-BR")}
                                  </span>
                                ) : (
                                  <span>Não publicado</span>
                                )}
                                {versao.publicadoPorId ? (
                                  <span>
                                    Publicado por: {versao.publicadoPorId}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          ))
                        )}
                      </CardBody>
                    </Card>
                  </div>
                ) : null}

                {selectedTab === "matrix" ? (
                  <div className="mt-4 space-y-4">
                    {matrixError ? (
                      <Card className="border border-danger/30 bg-danger/10 text-danger">
                        <CardBody className="flex flex-col gap-3">
                          <div className="flex items-start gap-2">
                            <AlertTriangle className="h-5 w-5 flex-shrink-0" />
                            <div>
                              <p className="font-semibold">
                                Não foi possível carregar a matriz de planos.
                              </p>
                              <p className="text-sm text-danger/80">
                                {matrixError instanceof Error
                                  ? matrixError.message
                                  : "Erro inesperado. Tente novamente mais tarde."}
                              </p>
                            </div>
                          </div>
                          <div className="flex justify-end">
                            <Button
                              color="primary"
                              startContent={<RefreshCw className="h-4 w-4" />}
                              variant="flat"
                              onPress={() => mutateMatrix()}
                            >
                              Recarregar matriz
                            </Button>
                          </div>
                        </CardBody>
                      </Card>
                    ) : null}

                    <Card className="border border-white/10 bg-background/70 backdrop-blur-xl">
                      <CardHeader className="flex flex-col items-center gap-3 pb-2 text-center">
                        <div className="max-w-2xl">
                          <p className="text-xs uppercase tracking-[0.3em] text-primary/70">
                            Matriz Plano x Módulo
                          </p>
                          <h3 className="text-lg font-semibold text-foreground">
                            Visão comparativa entre planos
                          </h3>
                          <p className="text-sm text-default-400">
                            Compare a oferta de cada plano sem poluir a área de
                            edição. Use o tooltip de cada linha para lembrar o
                            propósito de cada módulo.
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center justify-center gap-2">
                          <Chip color="primary" size="sm" variant="flat">
                            {matrixData?.planos.length ?? 0} plano(s)
                          </Chip>
                          <Chip color="secondary" size="sm" variant="flat">
                            {totalMatrixModules} módulo(s)
                          </Chip>
                          {totalMatrixModules > MATRIX_PREVIEW_LIMIT ? (
                            <Button
                              endContent={
                                isMatrixExpanded ? (
                                  <ChevronUp className="h-4 w-4" />
                                ) : (
                                  <ChevronDown className="h-4 w-4" />
                                )
                              }
                              size="sm"
                              variant="flat"
                              onPress={() =>
                                setIsMatrixExpanded((current) => !current)
                              }
                            >
                              {isMatrixExpanded
                                ? "Mostrar resumo"
                                : "Ver mais módulos"}
                            </Button>
                          ) : null}
                        </div>
                      </CardHeader>
                      <Divider />
                      <CardBody className="space-y-4">
                        {totalMatrixModules > MATRIX_PREVIEW_LIMIT ? (
                          <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-center text-xs text-default-400">
                            {isMatrixExpanded
                              ? `Exibindo todos os ${totalMatrixModules} módulos ativos da plataforma.`
                              : `Exibindo os primeiros ${MATRIX_PREVIEW_LIMIT} de ${totalMatrixModules} módulos. Expanda para ver a matriz completa.`}
                          </div>
                        ) : null}

                        {isLoadingMatrix && !matrixData ? (
                          <Skeleton
                            className="h-40 rounded-xl"
                            isLoaded={false}
                          />
                        ) : matrixData ? (
                          <div className="flex justify-center overflow-x-auto">
                            <table className="mx-auto min-w-[720px] border-collapse">
                              <thead>
                                <tr className="border-b border-white/5 text-left text-xs uppercase tracking-widest text-default-400">
                                  <th className="w-80 px-4 py-3 font-medium">
                                    Módulo
                                  </th>
                                  {matrixData.planos.map((plano) => (
                                    <th
                                      key={plano.id}
                                      className="px-4 py-3 text-center font-medium"
                                    >
                                      <div className="flex flex-col items-center gap-1 text-default-300">
                                        <span className="text-sm font-semibold text-foreground">
                                          {plano.nome}
                                        </span>
                                        <span className="text-[10px] uppercase tracking-widest text-default-500">
                                          {plano.slug}
                                        </span>
                                      </div>
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="text-sm text-default-200">
                                {visibleMatrixRows.map((row) => {
                                  if (row.tipo === "categoria") {
                                    return (
                                      <tr
                                        key={`categoria-${row.categoria}`}
                                        className="border-b border-white/5 bg-white/5 text-xs uppercase tracking-[0.3em] text-primary/70"
                                      >
                                        <td
                                          className="px-4 py-3"
                                          colSpan={matrixData.planos.length + 1}
                                        >
                                          {row.categoria}
                                        </td>
                                      </tr>
                                    );
                                  }

                                  const modulo = row.modulo;

                                  return (
                                    <tr
                                      key={modulo.moduloId}
                                      className="border-b border-white/5 hover:bg-white/5"
                                    >
                                      <td className="px-4 py-3 align-top">
                                        <div className="space-y-1">
                                          <div className="flex items-start gap-2">
                                            <p className="font-medium text-foreground">
                                              {modulo.nome}
                                            </p>
                                            <Tooltip
                                              content={
                                                modulo.descricao?.trim() ||
                                                "Descrição deste módulo ainda não foi cadastrada."
                                              }
                                            >
                                              <span className="mt-0.5 inline-flex cursor-help text-default-500 transition-colors hover:text-primary">
                                                <Info className="h-4 w-4" />
                                              </span>
                                            </Tooltip>
                                          </div>
                                          <p className="text-xs uppercase tracking-widest text-default-500">
                                            {modulo.slug}
                                          </p>
                                        </div>
                                      </td>
                                      {matrixData.planos.map((plano) => {
                                        const status = modulo.planos.find(
                                          (item) => item.planoId === plano.id,
                                        );

                                        return (
                                          <td
                                            key={`${modulo.moduloId}-${plano.id}`}
                                            className="px-4 py-3 text-center"
                                          >
                                            {status?.habilitado ? (
                                              <CheckCircle2 className="mx-auto h-4 w-4 text-success" />
                                            ) : (
                                              <span className="text-default-500">
                                                —
                                              </span>
                                            )}
                                          </td>
                                        );
                                      })}
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <div className="rounded-lg border border-white/5 bg-white/5 px-4 py-6 text-sm text-default-500">
                            Nenhuma informação disponível no momento.
                          </div>
                        )}

                        {matrixData &&
                        totalMatrixModules > MATRIX_PREVIEW_LIMIT ? (
                          <div className="flex justify-center">
                            <Button
                              endContent={
                                isMatrixExpanded ? (
                                  <ChevronUp className="h-4 w-4" />
                                ) : (
                                  <ChevronDown className="h-4 w-4" />
                                )
                              }
                              variant="light"
                              onPress={() =>
                                setIsMatrixExpanded((current) => !current)
                              }
                            >
                              {isMatrixExpanded
                                ? "Mostrar apenas o resumo"
                                : `Ver todos os ${totalMatrixModules} módulos`}
                            </Button>
                          </div>
                        ) : null}
                      </CardBody>
                    </Card>
                  </div>
                ) : null}
              </PeoplePanel>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
