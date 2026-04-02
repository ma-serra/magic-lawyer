"use client";

import type { ReactNode } from "react";
import { useDeferredValue, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Avatar } from "@heroui/avatar";
import { Button } from "@heroui/button";
import { Card, CardBody } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Input } from "@heroui/input";
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from "@heroui/modal";
import { Spinner } from "@heroui/spinner";
import { Tab, Tabs } from "@heroui/tabs";
import {
  Activity,
  Building2,
  Clock3,
  Copy,
  ExternalLink,
  Globe,
  LogIn,
  RefreshCw,
  Search,
  Server,
  Shield,
  Users,
} from "lucide-react";

import { startTenantUserImpersonation } from "@/app/actions/admin";
import { getDevInfo } from "@/app/actions/dev-info";
import {
  fetchSystemStatus,
  type ExternalServiceStatus,
} from "@/app/actions/system-status";
import { toast } from "@/lib/toast";

type DevInfoData = Awaited<ReturnType<typeof getDevInfo>>;
type SystemStatusData = Awaited<ReturnType<typeof fetchSystemStatus>>;
type DevTabKey = "overview" | "status" | "tenants" | "users" | "online";
type ServiceFilterKey = "all" | "healthy" | "failing";
type DevStatusTone = "success" | "warning" | "danger";
type DevQuickLoginColor =
  | "primary"
  | "secondary"
  | "success"
  | "warning"
  | "danger"
  | "default";

export interface DevQuickLoginOption {
  name: string;
  roleLabel: string;
  email: string;
  password: string;
  tenant?: string;
  chipColor?: DevQuickLoginColor;
}

export interface DevQuickLoginGroup {
  group: string;
  description?: string;
  options: DevQuickLoginOption[];
}

interface DevInfoProps {
  buttonClassName?: string;
  buttonContainerClassName?: string;
  mode?: "floating" | "inline";
  quickLoginGroups?: DevQuickLoginGroup[];
  onQuickLogin?: (option: DevQuickLoginOption) => Promise<void> | void;
  showStatusTrigger?: boolean;
  statusButtonClassName?: string;
}

const defaultButtonClassName =
  "border border-default-200/80 bg-content1/95 text-default-700 shadow-lg backdrop-blur hover:bg-default-100 hover:text-default-900 dark:border-white/10 dark:bg-background/85 dark:text-default-100 dark:hover:bg-background";
const defaultStatusButtonClassName =
  "border shadow-none backdrop-blur transition-colors";
const statusButtonToneClassNames: Record<DevStatusTone, string> = {
  success:
    "border-success-300/60 bg-success-500/10 text-success-700 hover:bg-success-500/15 dark:border-success-400/30 dark:bg-success-500/12 dark:text-success-300 dark:hover:bg-success-500/18",
  warning:
    "border-warning-300/60 bg-warning-500/10 text-warning-700 hover:bg-warning-500/15 dark:border-warning-400/30 dark:bg-warning-500/12 dark:text-warning-200 dark:hover:bg-warning-500/18",
  danger:
    "border-danger-300/60 bg-danger-500/10 text-danger-700 hover:bg-danger-500/15 dark:border-danger-400/30 dark:bg-danger-500/12 dark:text-danger-200 dark:hover:bg-danger-500/18",
};
const statusInactiveDotClassName =
  "bg-default-300/70 dark:bg-white/15";

function copyToClipboard(text: string, label: string) {
  navigator.clipboard.writeText(text);
  toast.success(`${label} copiado!`);
}

function matchesDevQuery(
  query: string,
  values: Array<string | null | undefined>,
) {
  if (!query) {
    return true;
  }

  return values.some((value) => value?.toLowerCase().includes(query));
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Sem heartbeat recente";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "Data invalida";
  }

  return parsed.toLocaleString("pt-BR");
}

function normalizeTabKey(value: string): DevTabKey {
  if (
    value === "overview" ||
    value === "status" ||
    value === "tenants" ||
    value === "users" ||
    value === "online"
  ) {
    return value;
  }

  return "overview";
}

function formatTimeLabel(value: string | null | undefined) {
  if (!value) {
    return "--";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "--";
  }

  return parsed.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getSystemStatusTone({
  items,
  error,
  loading,
}: {
  items: ExternalServiceStatus[];
  error?: string;
  loading?: boolean;
}): DevStatusTone {
  if (error) {
    return "danger";
  }

  if (items.length === 0) {
    return "warning";
  }

  const failedCount = items.filter((service) => !service.ok).length;

  if (failedCount === 0) {
    return "success";
  }

  if (failedCount < items.length) {
    return "warning";
  }

  return "danger";
}

function getSystemStatusLabel(tone: DevStatusTone) {
  switch (tone) {
    case "success":
      return "VERDE";
    case "warning":
      return "AMARELO";
    case "danger":
      return "VERMELHO";
    default:
      return "AMARELO";
  }
}

function getSystemStatusHint({
  tone,
  total,
  failedCount,
  loading,
  error,
}: {
  tone: DevStatusTone;
  total: number;
  failedCount: number;
  loading: boolean;
  error?: string;
}) {
  if (error) {
    return "Nao foi possivel concluir a checagem do ambiente.";
  }

  if (loading && total === 0) {
    return "Verificando integracoes e servicos agora.";
  }

  if (total === 0) {
    return "Nenhuma checagem registrada ainda.";
  }

  if (tone === "success") {
    return "Todos os servicos monitorados responderam corretamente.";
  }

  if (tone === "warning") {
    return `${failedCount} de ${total} servicos exigem atencao, mas a maioria segue operacional.`;
  }

  return `${failedCount} de ${total} servicos falharam ou ficaram indisponiveis.`;
}

function buildServiceTerminalOutput(
  service: ExternalServiceStatus,
  checkedAtFallback?: string,
) {
  const checkedAt = service.checkedAt || checkedAtFallback || new Date().toISOString();
  const lines = [
    `$ health-check --service ${service.id}`,
    `${service.ok ? "[OK]" : "[ERROR]"} ${service.name}`,
    service.ok
      ? `Mensagem: ${service.message || "Conectado com sucesso."}`
      : `Falha: ${service.message || "Sem detalhes de erro."}`,
    `Checked at: ${formatDateTime(checkedAt)}`,
  ];

  if (service.details && Object.keys(service.details).length > 0) {
    lines.push("Detalhes tecnicos:");
    Object.entries(service.details).forEach(([key, value]) => {
      lines.push(`- ${key}: ${value}`);
    });
  }

  return lines.join("\n");
}

function buildSystemStatusReport({
  items,
  checkedAt,
  tone,
  error,
}: {
  items: ExternalServiceStatus[];
  checkedAt?: string;
  tone: DevStatusTone;
  error?: string;
}) {
  const headerLines = [
    "Magic Lawyer DEV Status Report",
    `Semaforo: ${getSystemStatusLabel(tone)}`,
    `Checked at: ${formatDateTime(checkedAt ?? null)}`,
  ];

  if (error) {
    headerLines.push(`Erro: ${error}`);
  }

  if (items.length === 0) {
    headerLines.push("Nenhum servico retornado.");
    return headerLines.join("\n");
  }

  return [
    ...headerLines,
    "",
    ...items.flatMap((service) => [buildServiceTerminalOutput(service, checkedAt), ""]),
  ]
    .join("\n")
    .trim();
}

function StatusSemaphore({
  tone,
  size = "sm",
}: {
  tone: DevStatusTone;
  size?: "sm" | "md";
}) {
  const dotSizeClassName = size === "md" ? "h-3.5 w-3.5" : "h-2.5 w-2.5";
  const frameClassName =
    size === "md"
      ? "rounded-xl px-2 py-1.5"
      : "rounded-lg px-1.5 py-1";

  return (
    <span
      className={`inline-flex items-center gap-1 border border-default-200/70 bg-content1/90 ${frameClassName} dark:border-white/10 dark:bg-black/20`}
      aria-hidden="true"
    >
      <span
        className={`${dotSizeClassName} rounded-full ${
          tone === "danger"
            ? "bg-danger-500 shadow-[0_0_0_3px_rgba(248,113,113,0.16)]"
            : statusInactiveDotClassName
        }`}
      />
      <span
        className={`${dotSizeClassName} rounded-full ${
          tone === "warning"
            ? "bg-warning-500 shadow-[0_0_0_3px_rgba(250,204,21,0.18)]"
            : statusInactiveDotClassName
        }`}
      />
      <span
        className={`${dotSizeClassName} rounded-full ${
          tone === "success"
            ? "bg-success-500 shadow-[0_0_0_3px_rgba(74,222,128,0.16)]"
            : statusInactiveDotClassName
        }`}
      />
    </span>
  );
}

function MetricCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: ReactNode;
}) {
  return (
    <Card className="border border-default-200/80 bg-default-100/70 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
      <CardBody className="gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="rounded-2xl bg-primary/10 p-2 text-primary">
            {icon}
          </div>
          <span className="text-2xl font-semibold text-foreground">{value}</span>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-default-500">
            {label}
          </p>
          {hint ? (
            <p className="mt-1 text-xs text-default-500">{hint}</p>
          ) : null}
        </div>
      </CardBody>
    </Card>
  );
}

function LinkCard({
  label,
  value,
  hint,
  onOpen,
  onCopy,
}: {
  label: string;
  value: string;
  hint: string;
  onOpen?: () => void;
  onCopy?: () => void;
}) {
  return (
    <Card className="border border-default-200/80 bg-content1/90 dark:border-white/10 dark:bg-black/10">
      <CardBody className="gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-default-500">
            {label}
          </p>
          <p className="mt-1 break-all font-mono text-xs text-default-700 dark:text-default-200">
            {value}
          </p>
          <p className="mt-2 text-xs text-default-500">{hint}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {onOpen ? (
            <Button
              color="primary"
              size="sm"
              startContent={<ExternalLink className="h-3.5 w-3.5" />}
              variant="flat"
              onPress={onOpen}
            >
              Abrir
            </Button>
          ) : null}
          {onCopy ? (
            <Button
              size="sm"
              startContent={<Copy className="h-3.5 w-3.5" />}
              variant="flat"
              onPress={onCopy}
            >
              Copiar
            </Button>
          ) : null}
        </div>
      </CardBody>
    </Card>
  );
}

export function DevInfo({
  buttonClassName,
  buttonContainerClassName,
  mode = "floating",
  quickLoginGroups = [],
  onQuickLogin,
  showStatusTrigger = false,
  statusButtonClassName,
}: DevInfoProps = {}) {
  const router = useRouter();
  const { data: session, update: updateSession } = useSession();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<DevTabKey>("overview");
  const [search, setSearch] = useState("");
  const [tenantFilter, setTenantFilter] = useState<string | null>(null);
  const [serviceFilter, setServiceFilter] = useState<ServiceFilterKey>("all");
  const [expandedServiceId, setExpandedServiceId] = useState<string | null>(null);
  const [impersonatingUserId, setImpersonatingUserId] = useState<string | null>(
    null,
  );
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const canViewStatus = (session?.user as Record<string, unknown> | undefined)?.role === "SUPER_ADMIN";

  const {
    data: devInfo,
    error,
    isLoading,
    mutate,
  } = useSWR<DevInfoData>(
    process.env.NODE_ENV === "development" ? "dev-info" : null,
    getDevInfo,
    {
      refreshInterval: isModalOpen ? 15000 : 0,
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
    },
  );
  const {
    data: systemStatusResponse,
    error: systemStatusNetworkError,
    isLoading: isSystemStatusLoading,
    mutate: mutateSystemStatus,
  } = useSWR<SystemStatusData>(
    process.env.NODE_ENV === "development" &&
      canViewStatus &&
      (showStatusTrigger || isModalOpen)
      ? "dev-system-status"
      : null,
    fetchSystemStatus,
    {
      refreshInterval: isModalOpen && activeTab === "status" ? 30000 : 0,
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
    },
  );

  const totalQuickLogins = quickLoginGroups.reduce((total, group) => {
    return total + group.options.length;
  }, 0);

  const filteredTenants = useMemo(() => {
    return (devInfo?.tenants ?? []).filter((tenant) =>
      matchesDevQuery(deferredSearch, [
        tenant.name,
        tenant.slug,
        tenant.domain,
        tenant.localUrl,
        tenant.productionUrl,
      ]),
    );
  }, [deferredSearch, devInfo?.tenants]);

  const filteredUsers = useMemo(() => {
    return (devInfo?.users ?? []).filter((user) => {
      const matchesTenantFilter = !tenantFilter || user.tenantSlug === tenantFilter;

      return (
        matchesTenantFilter &&
        matchesDevQuery(deferredSearch, [
          user.name,
          user.email,
          user.role,
          user.tenantName,
          user.tenantSlug,
          user.locationLabel,
        ])
      );
    });
  }, [deferredSearch, devInfo?.users, tenantFilter]);

  const filteredOnlineUsers = useMemo(() => {
    return (devInfo?.onlineUsers ?? []).filter((user) => {
      const matchesTenantFilter = !tenantFilter || user.tenantSlug === tenantFilter;

      return (
        matchesTenantFilter &&
        matchesDevQuery(deferredSearch, [
          user.name,
          user.email,
          user.role,
          user.tenantName,
          user.tenantSlug,
          user.locationLabel,
          user.supportActorEmail,
        ])
      );
    });
  }, [deferredSearch, devInfo?.onlineUsers, tenantFilter]);

  const filteredQuickLoginGroups = useMemo(() => {
    if (!deferredSearch) {
      return quickLoginGroups;
    }

    return quickLoginGroups
      .map((group) => ({
        ...group,
        options: group.options.filter((option) =>
          matchesDevQuery(deferredSearch, [
            group.group,
            group.description,
            option.name,
            option.email,
            option.roleLabel,
            option.tenant,
          ]),
        ),
      }))
      .filter((group) => group.options.length > 0);
  }, [deferredSearch, quickLoginGroups]);
  const systemStatusItems = useMemo(() => {
    if (!systemStatusResponse?.success || !Array.isArray(systemStatusResponse.services)) {
      return [];
    }

    return systemStatusResponse.services;
  }, [systemStatusResponse]);
  const systemStatusError = useMemo(() => {
    if (systemStatusResponse && !systemStatusResponse.success) {
      return systemStatusResponse.error ?? "Falha ao consultar status";
    }

    if (systemStatusNetworkError instanceof Error) {
      return systemStatusNetworkError.message;
    }

    return undefined;
  }, [systemStatusNetworkError, systemStatusResponse]);
  const systemStatusCheckedAt =
    systemStatusResponse?.success ? systemStatusResponse.checkedAt : undefined;
  const systemStatusSummary = useMemo(() => {
    const total = systemStatusItems.length;
    const okCount = systemStatusItems.filter((service) => service.ok).length;
    const failedCount = total - okCount;
    const tone = getSystemStatusTone({
      items: systemStatusItems,
      error: systemStatusError,
      loading: isSystemStatusLoading,
    });

    return {
      total,
      okCount,
      failedCount,
      tone,
      label: getSystemStatusLabel(tone),
      hint: getSystemStatusHint({
        tone,
        total,
        failedCount,
        loading: isSystemStatusLoading,
        error: systemStatusError,
      }),
    };
  }, [isSystemStatusLoading, systemStatusError, systemStatusItems]);
  const filteredServices = useMemo(() => {
    return systemStatusItems.filter((service) => {
      const matchesServiceFilter =
        serviceFilter === "all" ||
        (serviceFilter === "healthy" && service.ok) ||
        (serviceFilter === "failing" && !service.ok);

      return (
        matchesServiceFilter &&
        matchesDevQuery(deferredSearch, [
          service.name,
          service.message,
          ...Object.values(service.details ?? {}),
        ])
      );
    });
  }, [deferredSearch, serviceFilter, systemStatusItems]);
  const systemStatusReport = useMemo(() => {
    return buildSystemStatusReport({
      items: systemStatusItems,
      checkedAt: systemStatusCheckedAt,
      tone: systemStatusSummary.tone,
      error: systemStatusError,
    });
  }, [
    systemStatusCheckedAt,
    systemStatusError,
    systemStatusItems,
    systemStatusSummary.tone,
  ]);

  if (process.env.NODE_ENV !== "development") {
    return null;
  }

  const openWorkbench = (nextTab: DevTabKey) => {
    const resolvedTab = nextTab === "status" && !canViewStatus ? "overview" : nextTab;

    setSearch("");
    setTenantFilter(null);
    setServiceFilter("all");
    setExpandedServiceId(null);
    setActiveTab(resolvedTab);
    setIsModalOpen(true);

    if (resolvedTab === "status" && canViewStatus) {
      void mutateSystemStatus();
    }
  };

  const openExternalUrl = (url: string | null) => {
    if (!url) {
      return;
    }

    window.open(url, "_blank", "noopener,noreferrer");
  };

  const openTenantDetails = (tenantId: string) => {
    router.push(`/admin/tenants/${tenantId}`);
    setIsModalOpen(false);
  };

  const handleTenantUserDrilldown = (tenantSlug: string) => {
    setTenantFilter(tenantSlug);
    setActiveTab("users");
  };

  const handleImpersonateUser = async (user: DevInfoData["users"][number]) => {
    if (!devInfo?.viewer.canImpersonate || impersonatingUserId) {
      return;
    }

    setImpersonatingUserId(user.id);

    try {
      const response = await startTenantUserImpersonation(user.tenantId, user.id);

      if (!response.success || !response.data?.ticket) {
        toast.error(
          response.error ??
            "Nao foi possivel iniciar a sessao monitorada para este usuario.",
        );
        return;
      }

      await updateSession({
        impersonationTicket: response.data.ticket,
      });

      toast.success(`Sessao monitorada iniciada como ${user.email}.`);
      setIsModalOpen(false);
      router.push(response.data.redirectTo ?? "/dashboard");
      router.refresh();
    } catch (currentError) {
      console.error("Falha ao iniciar sessao monitorada:", currentError);
      toast.error("Erro ao iniciar sessao monitorada.");
    } finally {
      setImpersonatingUserId(null);
    }
  };

  const renderUserCards = (users: DevInfoData["users"]) => {
    if (users.length === 0) {
      return (
        <div className="rounded-2xl border border-dashed border-default-300 bg-default-100/50 p-6 text-sm text-default-500 dark:border-white/10 dark:bg-white/[0.03]">
          Nenhum usuario corresponde ao filtro atual.
        </div>
      );
    }

    return (
      <div className="grid gap-3 lg:grid-cols-2">
        {users.map((user) => (
          <Card
            key={`${user.tenantSlug}-${user.id}`}
            className="border border-default-200/80 bg-content1/90 shadow-sm dark:border-white/10 dark:bg-black/10"
          >
            <CardBody className="gap-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar className="h-11 w-11 shrink-0" name={user.name} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {user.name}
                    </p>
                    <p className="truncate text-xs text-default-500">
                      {user.email}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <Chip
                    color={user.onlineNow ? "success" : "default"}
                    size="sm"
                    variant="flat"
                  >
                    {user.onlineNow ? "Online" : "Offline"}
                  </Chip>
                  <Chip size="sm" variant="flat">
                    {user.role}
                  </Chip>
                  <Chip size="sm" variant="flat">
                    {user.tenantSlug}
                  </Chip>
                </div>
              </div>

              <div className="grid gap-2 text-xs text-default-500">
                <div className="flex items-center gap-2">
                  <Clock3 className="h-3.5 w-3.5" />
                  <span>{formatDateTime(user.lastSeenAt)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Globe className="h-3.5 w-3.5" />
                  <span>{user.locationLabel || "Localizacao nao informada"}</span>
                </div>
                {user.isSupportSession ? (
                  <div className="rounded-xl border border-warning/20 bg-warning/10 px-3 py-2 text-warning-700 dark:text-warning-300">
                    Sessao monitorada por {user.supportActorEmail || "super admin"}
                  </div>
                ) : null}
              </div>

              <div className="grid gap-2 rounded-2xl border border-default-200/70 bg-default-100/50 p-3 text-xs dark:border-white/10 dark:bg-white/[0.03]">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-default-500">Local</span>
                  <code className="break-all text-right font-mono text-default-700 dark:text-default-200">
                    {user.localUrl}
                  </code>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-default-500">Prod</span>
                  <code className="break-all text-right font-mono text-default-700 dark:text-default-200">
                    {user.productionUrl || "Nao configurado"}
                  </code>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  color="primary"
                  size="sm"
                  startContent={<ExternalLink className="h-3.5 w-3.5" />}
                  variant="flat"
                  onPress={() => openExternalUrl(user.localUrl)}
                >
                  Local
                </Button>
                {user.productionUrl ? (
                  <Button
                    size="sm"
                    startContent={<Globe className="h-3.5 w-3.5" />}
                    variant="flat"
                    onPress={() => openExternalUrl(user.productionUrl)}
                  >
                    Prod
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  startContent={<Building2 className="h-3.5 w-3.5" />}
                  variant="flat"
                  onPress={() => openTenantDetails(user.tenantId)}
                >
                  Tenant
                </Button>
                {devInfo?.viewer.canImpersonate ? (
                  <Button
                    color="warning"
                    isLoading={impersonatingUserId === user.id}
                    size="sm"
                    startContent={
                      impersonatingUserId === user.id ? null : (
                        <LogIn className="h-3.5 w-3.5" />
                      )
                    }
                    variant="flat"
                    onPress={() => handleImpersonateUser(user)}
                  >
                    Entrar como
                  </Button>
                ) : null}
              </div>
            </CardBody>
          </Card>
        ))}
      </div>
    );
  };

  void mode;

  return (
    <>
      {buttonContainerClassName ? (
        <div className={buttonContainerClassName}>
          <div className="flex flex-col gap-2">
            {showStatusTrigger && canViewStatus ? (
              <Button
                className={`${statusButtonClassName || defaultStatusButtonClassName} ${statusButtonToneClassNames[systemStatusSummary.tone]}`}
                color="default"
                size="sm"
                variant="flat"
                onPress={() => openWorkbench("status")}
              >
                <span className="flex items-center gap-2">
                  <StatusSemaphore size="sm" tone={systemStatusSummary.tone} />
                  <span className="font-medium">Status</span>
                </span>
              </Button>
            ) : null}
            <Button
              className={buttonClassName || defaultButtonClassName}
              color="default"
              size="sm"
              startContent={<Server className="h-4 w-4" />}
              variant="flat"
              onPress={() => openWorkbench("overview")}
            >
              Painel dev
            </Button>
          </div>
        </div>
      ) : (
        <div className="fixed bottom-6 right-6 z-[60] flex flex-col gap-2">
          {showStatusTrigger && canViewStatus ? (
            <Button
              className={`${statusButtonClassName || defaultStatusButtonClassName} ${statusButtonToneClassNames[systemStatusSummary.tone]}`}
              color="default"
              size="sm"
              variant="flat"
              onPress={() => openWorkbench("status")}
            >
              <span className="flex items-center gap-2">
                <StatusSemaphore size="sm" tone={systemStatusSummary.tone} />
                <span className="font-medium">Status</span>
              </span>
            </Button>
          ) : null}
          <Button
            className={buttonClassName || defaultButtonClassName}
            color="default"
            size="sm"
            startContent={<Server className="h-4 w-4" />}
            variant="flat"
            onPress={() => openWorkbench("overview")}
          >
            Painel dev
          </Button>
        </div>
      )}

      <Modal
        isOpen={isModalOpen}
        placement="top-center"
        scrollBehavior="inside"
        size="5xl"
        onOpenChange={setIsModalOpen}
      >
        <ModalContent className="max-h-[88vh] border border-default-200/80 bg-background/95 shadow-[0_32px_80px_-48px_rgba(15,23,42,0.48)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/92">
          <ModalHeader className="flex flex-col gap-4 border-b border-default-200/70 pb-4 dark:border-white/10">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Server className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      Workbench de desenvolvimento
                    </p>
                    <p className="text-xs text-default-500">
                      Status, links, tenants, usuarios, acessos rapidos e presenca online.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Chip color="success" size="sm" variant="flat">
                  DEV
                </Chip>
                {devInfo?.viewer.role ? (
                  <Chip
                    color={devInfo.viewer.role === "SUPER_ADMIN" ? "warning" : "default"}
                    size="sm"
                    variant="flat"
                  >
                    {devInfo.viewer.role}
                  </Chip>
                ) : (
                  <Chip size="sm" variant="flat">
                    Sem sessao
                  </Chip>
                )}
                {devInfo?.viewer.impersonationActive ? (
                  <Chip color="warning" size="sm" variant="flat">
                    Sessao monitorada
                  </Chip>
                ) : null}
                {canViewStatus ? (
                  <Chip
                    color={systemStatusSummary.tone}
                    size="sm"
                    variant="flat"
                  >
                    Status
                  </Chip>
                ) : null}
                <Button
                  isIconOnly
                  aria-label="Atualizar painel dev"
                  isLoading={isLoading && !devInfo}
                  size="sm"
                  variant="flat"
                  onPress={() => {
                    void mutate();

                    if (canViewStatus) {
                      void mutateSystemStatus();
                    }
                  }}
                >
                  {isLoading && !devInfo ? null : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
              <Input
                placeholder="Buscar tenant, usuario, email, role, dominio, localizacao ou servico"
                startContent={<Search className="h-4 w-4 text-default-400" />}
                value={search}
                onValueChange={setSearch}
              />

              <div className="flex flex-wrap items-center gap-2">
                {tenantFilter ? (
                  <Chip
                    color="primary"
                    onClose={() => setTenantFilter(null)}
                    variant="flat"
                  >
                    Tenant: {tenantFilter}
                  </Chip>
                ) : null}
                {quickLoginGroups.length > 0 ? (
                  <Chip size="sm" variant="flat">
                    {totalQuickLogins} acessos rapidos
                  </Chip>
                ) : null}
                <Chip size="sm" variant="flat">
                  {devInfo?.timestamp
                    ? `Atualizado ${formatDateTime(devInfo.timestamp)}`
                    : "Carregando"}
                </Chip>
                {canViewStatus && systemStatusCheckedAt ? (
                  <Chip size="sm" variant="flat">
                    Status {formatTimeLabel(systemStatusCheckedAt)}
                  </Chip>
                ) : null}
              </div>
            </div>
          </ModalHeader>

          <ModalBody className="py-5">
            {isLoading && !devInfo ? (
              <div className="flex min-h-[320px] items-center justify-center">
                <Spinner label="Montando workbench dev..." size="lg" />
              </div>
            ) : error || !devInfo ? (
              <div className="rounded-2xl border border-danger/20 bg-danger/10 p-6 text-sm text-danger-700 dark:text-danger-300">
                Nao foi possivel carregar o painel dev. Tente atualizar.
              </div>
            ) : (
              <Tabs
                selectedKey={activeTab as string}
                onSelectionChange={(key) =>
                  setActiveTab(normalizeTabKey(String(key)))
                }
              >
                <Tab key="overview" title="Resumo">
                  <div className="space-y-5 pt-2">
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      <MetricCard
                        icon={<Building2 className="h-4 w-4" />}
                        label="Tenants"
                        value={String(devInfo.tenants.length)}
                      />
                      <MetricCard
                        icon={<Users className="h-4 w-4" />}
                        label="Usuarios"
                        value={
                          devInfo.viewer.canViewUsers
                            ? String(devInfo.users.length)
                            : "--"
                        }
                      />
                      <MetricCard
                        icon={<Activity className="h-4 w-4" />}
                        label="Online"
                        value={
                          devInfo.viewer.canViewOnline
                            ? String(devInfo.onlineUsers.length)
                            : "--"
                          }
                        />
                      
                    </div>

                    {canViewStatus ? (
                      <Card className="border border-default-200/80 bg-content1/90 shadow-sm dark:border-white/10 dark:bg-black/10">
                        <CardBody className="gap-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-foreground">
                                Status do ambiente
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <StatusSemaphore
                                size="md"
                                tone={systemStatusSummary.tone}
                              />
                              <Button
                                size="sm"
                                variant="flat"
                                onPress={() => setActiveTab("status")}
                              >
                                Abrir status
                              </Button>
                            </div>
                          </div>

                          <div className="grid gap-3 md:grid-cols-3">
                            <div className="rounded-2xl border border-default-200/70 bg-default-100/50 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                              <p className="text-xs uppercase tracking-[0.18em] text-default-500">
                                Servicos ok
                              </p>
                              <p className="mt-2 text-2xl font-semibold text-foreground">
                                {systemStatusSummary.okCount}
                              </p>
                            </div>
                            <div className="rounded-2xl border border-default-200/70 bg-default-100/50 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                              <p className="text-xs uppercase tracking-[0.18em] text-default-500">
                                Com falha
                              </p>
                              <p className="mt-2 text-2xl font-semibold text-foreground">
                                {systemStatusSummary.failedCount}
                              </p>
                            </div>
                            <div className="rounded-2xl border border-default-200/70 bg-default-100/50 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                              <p className="text-xs uppercase tracking-[0.18em] text-default-500">
                                Ultima checagem
                              </p>
                              <p className="mt-2 text-2xl font-semibold text-foreground">
                                {formatTimeLabel(systemStatusCheckedAt)}
                              </p>
                            </div>
                          </div>
                        </CardBody>
                      </Card>
                    ) : null}

                    <div className="grid gap-3 xl:grid-cols-2">
                      <LinkCard
                        hint="Acesso local principal da plataforma."
                        label="Aplicacao local"
                        value={devInfo.appLocalUrl}
                        onCopy={() => copyToClipboard(devInfo.appLocalUrl, "Link local")}
                        onOpen={() => openExternalUrl(devInfo.appLocalUrl)}
                      />
                      <LinkCard
                        hint="Endereco principal de producao da plataforma."
                        label="Aplicacao prod"
                        value={devInfo.appProductionUrl}
                        onCopy={() =>
                          copyToClipboard(devInfo.appProductionUrl, "Link prod")
                        }
                        onOpen={() => openExternalUrl(devInfo.appProductionUrl)}
                      />
                      <LinkCard
                        hint="Dashboard do ngrok para inspecionar tunnels."
                        label="Dashboard ngrok"
                        value={devInfo.dashboard}
                        onCopy={() => copyToClipboard(devInfo.dashboard, "Dashboard ngrok")}
                        onOpen={() => openExternalUrl(devInfo.dashboard)}
                      />
                      {devInfo.ngrok ? (
                        <LinkCard
                          hint="URL publica atual do tunnel local."
                          label="Tunnel publico"
                          value={devInfo.ngrok}
                          onCopy={() => copyToClipboard(devInfo.ngrok, "URL ngrok")}
                          onOpen={() => openExternalUrl(devInfo.ngrok)}
                        />
                      ) : (
                        <Card className="border border-default-200/80 bg-default-100/60 dark:border-white/10 dark:bg-white/[0.04]">
                          <CardBody className="gap-2">
                            <p className="text-xs uppercase tracking-[0.18em] text-default-500">
                              Tunnel publico
                            </p>
                            <p className="text-sm text-default-500">
                              ngrok nao esta ativo neste momento.
                            </p>
                          </CardBody>
                        </Card>
                      )}
                    </div>

                    {devInfo.viewer.canViewOnline ? (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-foreground">
                              Online agora
                            </p>
                            <p className="text-xs text-default-500">
                              Ultimos heartbeats capturados no ambiente atual.
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="flat"
                            onPress={() => setActiveTab("online")}
                          >
                            Ver tudo
                          </Button>
                        </div>

                        {filteredOnlineUsers.length > 0 ? (
                          <div className="grid gap-3 lg:grid-cols-2">
                            {filteredOnlineUsers.slice(0, 4).map((user) => (
                              <Card
                                key={`overview-online-${user.tenantSlug}-${user.id}`}
                                className="border border-default-200/80 bg-content1/90 dark:border-white/10 dark:bg-black/10"
                              >
                                <CardBody className="gap-3">
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="flex min-w-0 items-center gap-3">
                                      <Avatar className="h-10 w-10" name={user.name} />
                                      <div className="min-w-0">
                                        <p className="truncate text-sm font-semibold text-foreground">
                                          {user.name}
                                        </p>
                                        <p className="truncate text-xs text-default-500">
                                          {user.tenantSlug}
                                        </p>
                                      </div>
                                    </div>
                                    <Chip color="success" size="sm" variant="flat">
                                      Online
                                    </Chip>
                                  </div>
                                  <p className="text-xs text-default-500">
                                    {user.locationLabel || "Localizacao nao informada"}
                                  </p>
                                  <p className="text-xs text-default-500">
                                    {formatDateTime(user.lastSeenAt)}
                                  </p>
                                </CardBody>
                              </Card>
                            ))}
                          </div>
                        ) : (
                          <div className="rounded-2xl border border-dashed border-default-300 bg-default-100/50 p-6 text-sm text-default-500 dark:border-white/10 dark:bg-white/[0.03]">
                            Nenhuma presenca online encontrada para o filtro atual.
                          </div>
                        )}
                      </div>
                    ) : quickLoginGroups.length > 0 ? (
                      <div className="rounded-2xl border border-default-200/80 bg-default-100/60 p-4 text-sm text-default-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-default-300">
                        Este ambiente tambem tem {totalQuickLogins} acessos rapidos disponiveis no login.
                        Abra a aba Usuarios para usar os atalhos.
                      </div>
                    ) : null}
                  </div>
                </Tab>
                {canViewStatus ? (
                  <Tab key="status" title="Status">
                    <div className="space-y-5 pt-2">
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <MetricCard
                          hint={systemStatusSummary.hint}
                          icon={<Activity className="h-4 w-4" />}
                          label="Servicos"
                          value={
                            systemStatusSummary.total > 0
                              ? `${systemStatusSummary.okCount}/${systemStatusSummary.total}`
                              : "--"
                          }
                        />
                        <MetricCard
                          hint="Quantidade de servicos que responderam sem erro."
                          icon={<Shield className="h-4 w-4" />}
                          label="OK"
                          value={String(systemStatusSummary.okCount)}
                        />
                        <MetricCard
                          hint="Servicos que precisam de investigacao ou ajuste."
                          icon={<Server className="h-4 w-4" />}
                          label="Falhas"
                          value={String(systemStatusSummary.failedCount)}
                        />
                        <MetricCard
                          hint="Horario da ultima rodada de health-check."
                          icon={<Clock3 className="h-4 w-4" />}
                          label="Checado"
                          value={formatTimeLabel(systemStatusCheckedAt)}
                        />
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          color="primary"
                          size="sm"
                          startContent={<RefreshCw className="h-3.5 w-3.5" />}
                          variant="flat"
                          onPress={() => void mutateSystemStatus()}
                        >
                          Rechecar agora
                        </Button>
                        <Button
                          size="sm"
                          startContent={<Copy className="h-3.5 w-3.5" />}
                          variant="flat"
                          onPress={() =>
                            copyToClipboard(systemStatusReport, "Relatorio de status")
                          }
                        >
                          Copiar relatorio
                        </Button>
                        <Button
                          color={serviceFilter === "all" ? "primary" : "default"}
                          size="sm"
                          variant="flat"
                          onPress={() => setServiceFilter("all")}
                        >
                          Todos
                        </Button>
                        <Button
                          color={serviceFilter === "healthy" ? "success" : "default"}
                          size="sm"
                          variant="flat"
                          onPress={() => setServiceFilter("healthy")}
                        >
                          Saudaveis
                        </Button>
                        <Button
                          color={serviceFilter === "failing" ? "warning" : "default"}
                          size="sm"
                          variant="flat"
                          onPress={() => setServiceFilter("failing")}
                        >
                          Com falha
                        </Button>
                      </div>

                      {systemStatusError ? (
                        <Card className="border border-danger/20 bg-danger/10 dark:border-danger/30 dark:bg-danger/10">
                          <CardBody className="gap-2">
                            <p className="text-sm font-semibold text-danger-700 dark:text-danger-300">
                              Nao foi possivel carregar o status completo.
                            </p>
                            <p className="text-sm text-danger-700/80 dark:text-danger-300/90">
                              {systemStatusError}
                            </p>
                          </CardBody>
                        </Card>
                      ) : null}

                      {filteredServices.length > 0 ? (
                        <div className="grid gap-3 lg:grid-cols-2">
                          {filteredServices.map((service) => {
                            const isExpanded = expandedServiceId === service.id;
                            const serviceReport = buildServiceTerminalOutput(
                              service,
                              systemStatusCheckedAt,
                            );

                            return (
                              <Card
                                key={service.id}
                                className="border border-default-200/80 bg-content1/90 shadow-sm dark:border-white/10 dark:bg-black/10"
                              >
                                <CardBody className="gap-4">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-semibold text-foreground">
                                        {service.name}
                                      </p>
                                      <p className="mt-1 text-xs text-default-500">
                                        {service.message || "Sem observacoes adicionais."}
                                      </p>
                                    </div>
                                    <Chip
                                      color={service.ok ? "success" : "danger"}
                                      size="sm"
                                      variant="flat"
                                    >
                                      {service.ok ? "OK" : "Falhou"}
                                    </Chip>
                                  </div>

                                  <div className="grid gap-2 rounded-2xl border border-default-200/70 bg-default-100/50 p-3 text-xs dark:border-white/10 dark:bg-white/[0.03]">
                                    <div className="flex items-center justify-between gap-3">
                                      <span className="text-default-500">Ultima checagem</span>
                                      <span className="font-medium text-default-700 dark:text-default-200">
                                        {formatDateTime(service.checkedAt)}
                                      </span>
                                    </div>
                                    <div className="flex items-center justify-between gap-3">
                                      <span className="text-default-500">Servico</span>
                                      <code className="font-mono text-default-700 dark:text-default-200">
                                        {service.id}
                                      </code>
                                    </div>
                                  </div>

                                  <div className="flex flex-wrap gap-2">
                                    <Button
                                      size="sm"
                                      variant="flat"
                                      onPress={() =>
                                        setExpandedServiceId((current) =>
                                          current === service.id ? null : service.id,
                                        )
                                      }
                                    >
                                      {isExpanded ? "Ocultar detalhes" : "Detalhes tecnicos"}
                                    </Button>
                                    <Button
                                      size="sm"
                                      startContent={<Copy className="h-3.5 w-3.5" />}
                                      variant="flat"
                                      onPress={() =>
                                        copyToClipboard(
                                          serviceReport,
                                          `Relatorio ${service.name}`,
                                        )
                                      }
                                    >
                                      Copiar diagnostico
                                    </Button>
                                  </div>

                                  {isExpanded ? (
                                    <>
                                      {service.details &&
                                      Object.keys(service.details).length > 0 ? (
                                        <div className="grid gap-2 rounded-2xl border border-default-200/70 bg-default-100/50 p-3 text-xs dark:border-white/10 dark:bg-white/[0.03]">
                                          {Object.entries(service.details).map(
                                            ([key, value]) => (
                                              <div
                                                key={`${service.id}-${key}`}
                                                className="flex items-start justify-between gap-3"
                                              >
                                                <span className="text-default-500">
                                                  {key}
                                                </span>
                                                <code className="max-w-[65%] break-all text-right font-mono text-default-700 dark:text-default-200">
                                                  {value}
                                                </code>
                                              </div>
                                            ),
                                          )}
                                        </div>
                                      ) : null}

                                      <div className="rounded-2xl border border-default-200/70 bg-slate-950 p-3">
                                        <pre className="whitespace-pre-wrap break-words font-mono text-xs text-success-300">
                                          {serviceReport}
                                        </pre>
                                      </div>
                                    </>
                                  ) : null}
                                </CardBody>
                              </Card>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-dashed border-default-300 bg-default-100/50 p-6 text-sm text-default-500 dark:border-white/10 dark:bg-white/[0.03]">
                          Nenhum servico corresponde ao filtro atual.
                        </div>
                      )}
                    </div>
                  </Tab>
                ) : null}
                <Tab key="tenants" title={`Tenants (${filteredTenants.length})`}>
                  <div className="grid gap-3 pt-2 lg:grid-cols-2">
                    {filteredTenants.length > 0 ? (
                      filteredTenants.map((tenant) => (
                        <Card
                          key={tenant.id}
                          className="border border-default-200/80 bg-content1/90 shadow-sm dark:border-white/10 dark:bg-black/10"
                        >
                          <CardBody className="gap-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-foreground">
                                  {tenant.name}
                                </p>
                                <p className="truncate text-xs text-default-500">
                                  {tenant.slug}
                                  {tenant.domain ? ` · ${tenant.domain}` : ""}
                                </p>
                              </div>
                              <div className="flex flex-wrap justify-end gap-2">
                                <Chip size="sm" variant="flat">
                                  {tenant.status}
                                </Chip>
                                <Chip
                                  color={tenant.onlineUsersNow ? "success" : "default"}
                                  size="sm"
                                  variant="flat"
                                >
                                  {tenant.onlineUsersNow ?? "--"} online
                                </Chip>
                              </div>
                            </div>

                            <div className="grid gap-2 rounded-2xl border border-default-200/70 bg-default-100/50 p-3 text-xs dark:border-white/10 dark:bg-white/[0.03]">
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-default-500">Local</span>
                                <code className="break-all text-right font-mono text-default-700 dark:text-default-200">
                                  {tenant.localUrl}
                                </code>
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-default-500">Prod</span>
                                <code className="break-all text-right font-mono text-default-700 dark:text-default-200">
                                  {tenant.productionUrl || "Nao configurado"}
                                </code>
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-default-500">Usuarios</span>
                                <span className="font-medium text-default-700 dark:text-default-200">
                                  {tenant.totalUsers ?? "--"}
                                </span>
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <Button
                                color="primary"
                                size="sm"
                                startContent={<ExternalLink className="h-3.5 w-3.5" />}
                                variant="flat"
                                onPress={() => openExternalUrl(tenant.localUrl)}
                              >
                                Local
                              </Button>
                              <Button
                                size="sm"
                                startContent={<Copy className="h-3.5 w-3.5" />}
                                variant="flat"
                                onPress={() =>
                                  copyToClipboard(tenant.localUrl, "Link local")
                                }
                              >
                                Copiar local
                              </Button>
                              {tenant.productionUrl ? (
                                <>
                                  <Button
                                    size="sm"
                                    startContent={<Globe className="h-3.5 w-3.5" />}
                                    variant="flat"
                                    onPress={() =>
                                      openExternalUrl(tenant.productionUrl)
                                    }
                                  >
                                    Prod
                                  </Button>
                                  <Button
                                    size="sm"
                                    startContent={<Copy className="h-3.5 w-3.5" />}
                                    variant="flat"
                                    onPress={() =>
                                      copyToClipboard(
                                        tenant.productionUrl!,
                                        "Link prod",
                                      )
                                    }
                                  >
                                    Copiar prod
                                  </Button>
                                </>
                              ) : null}
                              {devInfo.viewer.canViewUsers ? (
                                <Button
                                  color="secondary"
                                  size="sm"
                                  startContent={<Users className="h-3.5 w-3.5" />}
                                  variant="flat"
                                  onPress={() =>
                                    handleTenantUserDrilldown(tenant.slug)
                                  }
                                >
                                  Ver usuarios
                                </Button>
                              ) : null}
                              {devInfo.viewer.canViewUsers ? (
                                <Button
                                  size="sm"
                                  startContent={<Building2 className="h-3.5 w-3.5" />}
                                  variant="flat"
                                  onPress={() => openTenantDetails(tenant.id)}
                                >
                                  Abrir tenant
                                </Button>
                              ) : null}
                            </div>
                          </CardBody>
                        </Card>
                      ))
                    ) : (
                      <div className="rounded-2xl border border-dashed border-default-300 bg-default-100/50 p-6 text-sm text-default-500 dark:border-white/10 dark:bg-white/[0.03]">
                        Nenhum tenant corresponde ao filtro atual.
                      </div>
                    )}
                  </div>
                </Tab>

                {devInfo.viewer.canViewUsers || totalQuickLogins > 0 ? (
                  <Tab
                    key="users"
                    title={
                      devInfo.viewer.canViewUsers
                        ? `Usuarios (${filteredUsers.length})`
                        : `Acessos (${totalQuickLogins})`
                    }
                  >
                    <div className="space-y-4 pt-2">
                      {devInfo.viewer.canViewUsers ? (
                        renderUserCards(filteredUsers)
                      ) : filteredQuickLoginGroups.length > 0 ? (
                        <div className="space-y-4">
                          {filteredQuickLoginGroups.map((group) => (
                            <Card
                              key={group.group}
                              className="border border-default-200/80 bg-content1/90 dark:border-white/10 dark:bg-black/10"
                            >
                              <CardBody className="gap-4">
                                <div>
                                  <p className="text-sm font-semibold text-foreground">
                                    {group.group}
                                  </p>
                                  {group.description ? (
                                    <p className="text-xs text-default-500">
                                      {group.description}
                                    </p>
                                  ) : null}
                                </div>

                                <div className="grid gap-3 lg:grid-cols-2">
                                  {group.options.map((option) => (
                                    <div
                                      key={`${group.group}-${option.email}`}
                                      className="rounded-2xl border border-default-200/80 bg-default-100/60 p-4 dark:border-white/10 dark:bg-white/[0.03]"
                                    >
                                      <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                          <p className="truncate text-sm font-semibold text-foreground">
                                            {option.name}
                                          </p>
                                          <p className="truncate text-xs text-default-500">
                                            {option.email}
                                          </p>
                                        </div>
                                        <Chip
                                          color={option.chipColor ?? "default"}
                                          size="sm"
                                          variant="flat"
                                        >
                                          {option.roleLabel}
                                        </Chip>
                                      </div>

                                      <div className="mt-3 rounded-xl border border-default-200/70 bg-content1/90 p-3 text-xs dark:border-white/10 dark:bg-black/10">
                                        <p className="text-default-500">Senha seed</p>
                                        <code className="mt-1 block break-all font-mono text-default-700 dark:text-default-200">
                                          {option.password}
                                        </code>
                                      </div>

                                      <div className="mt-3 flex flex-wrap gap-2">
                                        <Button
                                          color="primary"
                                          size="sm"
                                          startContent={<LogIn className="h-3.5 w-3.5" />}
                                          variant="flat"
                                          onPress={() => void onQuickLogin?.(option)}
                                        >
                                          Logar
                                        </Button>
                                        <Button
                                          size="sm"
                                          startContent={<Copy className="h-3.5 w-3.5" />}
                                          variant="flat"
                                          onPress={() =>
                                            copyToClipboard(option.email, "Email")
                                          }
                                        >
                                          Copiar email
                                        </Button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </CardBody>
                            </Card>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-dashed border-default-300 bg-default-100/50 p-6 text-sm text-default-500 dark:border-white/10 dark:bg-white/[0.03]">
                          Nenhum acesso rapido corresponde ao filtro atual.
                        </div>
                      )}
                    </div>
                  </Tab>
                ) : null}

                {devInfo.viewer.canViewOnline ? (
                  <Tab key="online" title={`Online (${filteredOnlineUsers.length})`}>
                    <div className="space-y-4 pt-2">
                      {filteredOnlineUsers.length > 0 ? (
                        renderUserCards(filteredOnlineUsers)
                      ) : (
                        <div className="rounded-2xl border border-dashed border-default-300 bg-default-100/50 p-6 text-sm text-default-500 dark:border-white/10 dark:bg-white/[0.03]">
                          Nenhuma sessao online encontrada para o filtro atual.
                        </div>
                      )}
                    </div>
                  </Tab>
                ) : null}
              </Tabs>
            )}
          </ModalBody>

          <ModalFooter className="flex flex-col items-start justify-between gap-3 border-t border-default-200/70 pt-4 sm:flex-row sm:items-center dark:border-white/10">
            <div className="text-xs text-default-500">
              {tenantFilter
                ? `Filtro atual preso ao tenant ${tenantFilter}.`
                : "Use a busca para filtrar tenants, usuarios e links em um unico lugar."}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="flat"
                onPress={() => {
                  setSearch("");
                  setTenantFilter(null);
                  setServiceFilter("all");
                  setExpandedServiceId(null);
                  setActiveTab("overview");
                }}
              >
                Limpar filtros
              </Button>
              <Button size="sm" variant="flat" onPress={() => setIsModalOpen(false)}>
                Fechar
              </Button>
            </div>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}
