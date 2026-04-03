"use client";

import { useMemo, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import useSWR from "swr";
import { Button } from "@heroui/button";
import { Badge } from "@heroui/badge";
import { Chip } from "@heroui/chip";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
} from "@heroui/drawer";
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from "@heroui/modal";
import { ScrollShadow } from "@heroui/scroll-shadow";
import { Spinner } from "@heroui/spinner";
import { Tooltip } from "@heroui/tooltip";
import { addToast } from "@heroui/toast";
import { useDisclosure } from "@heroui/react";

import { useRealtime } from "@/app/providers/realtime-provider";
import { getStatusSincronizacaoMeusProcessos } from "@/app/actions/portal-advogado";
import {
  getProcessDeadlineNotificationPreference,
  setProcessDeadlineNotificationMute,
} from "@/app/actions/processo-deadline-preferences";
import {
  useNotifications,
  type NotificationStatus,
  type NotificationItem,
} from "@/app/hooks/use-notifications";
import { getDeadlineFrontBadgeLabel } from "@/app/lib/notifications/deadline-alerts";
import { REALTIME_POLLING } from "@/app/lib/realtime/polling-policy";
import {
  isPollingGloballyEnabled,
  resolvePollingInterval,
  subscribePollingControl,
  tracePollingAttempt,
} from "@/app/lib/realtime/polling-telemetry";
import { NOTIFICATION_CENTER_OPEN_EVENT } from "@/app/lib/notifications/ui-events";
import { parseHolidayImpact } from "@/app/lib/feriados/holiday-impact";
import { useHolidayExperienceRollout } from "@/app/hooks/use-holiday-experience";
import { BellIcon } from "@/components/icons";
import { HolidayImpactPanel } from "@/components/holiday-impact/holiday-impact-panel";

const statusCopy: Record<NotificationStatus, string> = {
  NAO_LIDA: "Não lida",
  LIDA: "Lida",
  ARQUIVADA: "Arquivada",
};

const statusColor: Record<
  NotificationStatus,
  "primary" | "success" | "default"
> = {
  NAO_LIDA: "primary",
  LIDA: "success",
  ARQUIVADA: "default",
};

type NotificationCategory =
  | "GERAL"
  | "PRAZOS"
  | "PROCESSOS"
  | "ACESSOS"
  | "ADMINISTRACAO"
  | "OUTROS";

type NotificationViewFilter = "TODAS" | "NAO_LIDAS" | "LIDAS";

const categoryCopy: Record<NotificationCategory, string> = {
  GERAL: "Geral",
  PRAZOS: "Prazos",
  PROCESSOS: "Processos",
  ACESSOS: "Acessos",
  ADMINISTRACAO: "Administracao",
  OUTROS: "Outros",
};

const viewFilterCopy: Record<NotificationViewFilter, string> = {
  TODAS: "Todas",
  NAO_LIDAS: "Nao lidas",
  LIDAS: "Lidas",
};

function formatDate(dateIso: string) {
  const date = new Date(dateIso);

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

function asPayloadRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => asNonEmptyString(item))
    .filter((item): item is string => Boolean(item));
}

function resolveNotificationCategory(
  item: Pick<NotificationItem, "tipo" | "referenciaTipo">,
): NotificationCategory {
  const normalizedType = (item.tipo || "").toLowerCase().trim();
  const normalizedReferenceType = (item.referenciaTipo || "")
    .toLowerCase()
    .trim();

  if (
    normalizedType.startsWith("prazo.") ||
    normalizedReferenceType === "prazo"
  ) {
    return "PRAZOS";
  }

  if (
    normalizedType.startsWith("processo.") ||
    normalizedReferenceType === "processo"
  ) {
    return "PROCESSOS";
  }

  if (
    normalizedType.startsWith("access.") ||
    normalizedType.startsWith("account.") ||
    normalizedType.startsWith("security.") ||
    normalizedType.startsWith("login.") ||
    normalizedType === "access.login_new"
  ) {
    return "ACESSOS";
  }

  if (
    normalizedType.startsWith("tenant.") ||
    normalizedType.startsWith("admin.") ||
    normalizedType.startsWith("usuario.") ||
    normalizedType.startsWith("cargo.") ||
    normalizedType.startsWith("plan.") ||
    normalizedType.startsWith("autoridade.")
  ) {
    return "ADMINISTRACAO";
  }

  return "OUTROS";
}

function getSecurityActionUrl(notification?: NotificationItem | null) {
  if (!notification) {
    return null;
  }

  return asNonEmptyString(asPayloadRecord(notification.dados).securityActionUrl);
}

function getEventMeetingUrl(notification?: NotificationItem | null) {
  if (!notification) {
    return null;
  }

  const payload = asPayloadRecord(notification.dados);

  return (
    asNonEmptyString(payload.linkAcesso) ||
    asNonEmptyString(payload.meetingUrl) ||
    null
  );
}

export const NotificationCenter = () => {
  const { data: session } = useSession();
  const { rollout: holidayExperienceRollout } = useHolidayExperienceRollout();
  const disclosure = useDisclosure();
  const detailDisclosure = useDisclosure();
  const [selectedNotification, setSelectedNotification] =
    useState<NotificationItem | null>(null);
  const [activeCategory, setActiveCategory] =
    useState<NotificationCategory>("GERAL");
  const [activeViewFilter, setActiveViewFilter] =
    useState<NotificationViewFilter>("TODAS");
  const router = useRouter();
  const {
    notifications,
    unreadCount,
    isLoading,
    isValidating,
    mutate: mutateNotifications,
    markAs,
    markAllAsRead,
    clearAll,
  } = useNotifications();
  const { subscribe } = useRealtime();
  const [isPollingEnabled, setIsPollingEnabled] = useState(() =>
    isPollingGloballyEnabled(),
  );
  const { data: portalSyncStatusResponse } = useSWR<
    Awaited<ReturnType<typeof getStatusSincronizacaoMeusProcessos>>,
    Error
  >(
    "notification-center-portal-sync-status",
    () =>
      tracePollingAttempt(
        {
          hookName: "NotificationCenter",
          endpoint: "/portal-advogado/sync-status/latest",
          source: "swr",
          intervalMs: REALTIME_POLLING.PORTAL_SYNC_STATUS_POLLING_MS,
        },
        () => getStatusSincronizacaoMeusProcessos(),
      ),
    {
      refreshInterval: (latestData) => {
        const status = latestData?.status?.status;
        const fastPoll =
          status === "QUEUED" ||
          status === "RUNNING" ||
          status === "WAITING_CAPTCHA";

        return resolvePollingInterval({
          isConnected: false,
          enabled: isPollingEnabled,
          fallbackMs: fastPoll
            ? REALTIME_POLLING.PORTAL_SYNC_STATUS_POLLING_MS
            : 60 * 1000,
          minimumMs: fastPoll
            ? REALTIME_POLLING.PORTAL_SYNC_STATUS_POLLING_MS
            : 60 * 1000,
        });
      },
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    },
  );

  // Hook para notificações de desenvolvimento (só em DEV)
  const totalUnreadCount = unreadCount;
  const portalSyncStatus = portalSyncStatusResponse?.status;
  const isPortalSyncRunning =
    portalSyncStatus?.status === "QUEUED" ||
    portalSyncStatus?.status === "RUNNING";
  const isPortalSyncWaitingCaptcha =
    portalSyncStatus?.status === "WAITING_CAPTCHA";
  const hasPortalSyncAttention = isPortalSyncRunning || isPortalSyncWaitingCaptcha;
  const holidayNotificationsEnabled =
    holidayExperienceRollout?.surfaces.find(
      (surface) => surface.key === "notifications",
    )?.enabled ?? false;
  const holidayAudience =
    (session?.user as any)?.role === "CLIENTE" ? "client" : "internal";

  const resolveReferenceLink = (item: NotificationItem): string | null => {
    const payload = asPayloadRecord(item.dados);
    const normalizedReferenceType = (item.referenciaTipo || "")
      .toLowerCase()
      .trim();
    const normalizedEventType = (item.tipo || "").toLowerCase().trim();
    const referenciaId = asNonEmptyString(item.referenciaId);
    const processoId =
      asNonEmptyString(payload.processoId) ||
      (normalizedReferenceType === "processo" ? referenciaId : null);
    const clienteId =
      asNonEmptyString(payload.clienteId) ||
      (normalizedReferenceType === "cliente" ? referenciaId : null);
    const prazoId =
      asNonEmptyString(payload.prazoId) ||
      (normalizedReferenceType === "prazo" ? referenciaId : null);
    const processoHref = processoId ? `/processos/${processoId}` : null;

    if (normalizedReferenceType === "cliente" && clienteId) {
      return `/clientes/${clienteId}`;
    }

    if (normalizedReferenceType === "documento") {
      if (processoHref) {
        return `${processoHref}?tab=documentos`;
      }

      return "/documentos";
    }

    if (
      normalizedReferenceType === "prazo" ||
      normalizedEventType.startsWith("prazo.")
    ) {
      if (!processoHref) {
        return "/processos";
      }

      return prazoId
        ? `${processoHref}?tab=prazos&prazoId=${encodeURIComponent(prazoId)}`
        : `${processoHref}?tab=prazos`;
    }

    if (
      normalizedReferenceType === "andamento" ||
      normalizedReferenceType === "movimentacao" ||
      normalizedEventType.startsWith("andamento.") ||
      normalizedEventType.startsWith("movimentacao.")
    ) {
      return processoHref ? `${processoHref}?tab=eventos` : "/andamentos";
    }

    if (
      normalizedReferenceType === "evento" ||
      normalizedEventType.startsWith("evento.")
    ) {
      return processoHref ? `${processoHref}?tab=eventos` : "/agenda";
    }

    if (
      normalizedReferenceType === "pagamento" ||
      normalizedEventType.startsWith("pagamento.")
    ) {
      return "/financeiro/recibos";
    }

    if (normalizedReferenceType === "procuracao" && referenciaId) {
      return `/procuracoes/${referenciaId}`;
    }

    if (
      normalizedReferenceType === "processo" ||
      normalizedEventType.startsWith("processo.")
    ) {
      if (processoHref) {
        return processoHref;
      }
    }

    return processoHref;
  };

  const handleOpenDetails = (item: NotificationItem) => {
    if (item.status === "NAO_LIDA") {
      void handleStatusChange(item.id, "LIDA");
    }
    setSelectedNotification(item);
    detailDisclosure.onOpen();
  };

  const handleCloseDetails = () => {
    setSelectedNotification(null);
    detailDisclosure.onClose();
  };

  const unreadBadge = useMemo(() => {
    if (totalUnreadCount <= 0) return null;

    return (
      <Badge
        className="border-none bg-danger text-[10px] font-semibold text-white shadow-lg"
        content={totalUnreadCount > 99 ? "99+" : totalUnreadCount}
        placement="top-right"
      >
        <span className="sr-only">Notificações não lidas</span>
      </Badge>
    );
  }, [totalUnreadCount]);

  const categoryCounts = useMemo(() => {
    const counts: Record<NotificationCategory, number> = {
      GERAL: notifications.length,
      PRAZOS: 0,
      PROCESSOS: 0,
      ACESSOS: 0,
      ADMINISTRACAO: 0,
      OUTROS: 0,
    };

    notifications.forEach((item) => {
      const category = resolveNotificationCategory(item);

      counts[category] += 1;
    });

    return counts;
  }, [notifications]);

  const filteredNotifications = useMemo(() => {
    return notifications.filter((item) => {
      const matchesCategory =
        activeCategory === "GERAL" ||
        resolveNotificationCategory(item) === activeCategory;

      if (!matchesCategory) {
        return false;
      }

      if (activeViewFilter === "NAO_LIDAS") {
        return item.status === "NAO_LIDA";
      }

      if (activeViewFilter === "LIDAS") {
        return item.status === "LIDA";
      }

      return true;
    });
  }, [activeCategory, activeViewFilter, notifications]);

  const filteredUnreadCount = useMemo(
    () => filteredNotifications.filter((item) => item.status === "NAO_LIDA").length,
    [filteredNotifications],
  );
  const filteredReadCount = useMemo(
    () => filteredNotifications.filter((item) => item.status === "LIDA").length,
    [filteredNotifications],
  );

  // Realtime: invalidar quando chegar notification.new para o usuário atual
  useEffect(() => {
    const unsubscribe = subscribe("notification.new", () => {
      // Invalida apenas cache SWR das notificações, sem refresh global
      void mutateNotifications();
    });

    return unsubscribe;
  }, [subscribe, mutateNotifications]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleOpen = () => {
      disclosure.onOpen();
    };

    window.addEventListener(
      NOTIFICATION_CENTER_OPEN_EVENT,
      handleOpen as EventListener,
    );

    return () => {
      window.removeEventListener(
        NOTIFICATION_CENTER_OPEN_EVENT,
        handleOpen as EventListener,
      );
    };
  }, [disclosure]);

  useEffect(() => {
    return subscribePollingControl(setIsPollingEnabled);
  }, []);

  const detailPayload = useMemo(() => {
    if (
      !selectedNotification ||
      !selectedNotification.dados ||
      typeof selectedNotification.dados !== "object"
    ) {
      return null;
    }

    return selectedNotification.dados as Record<string, any>;
  }, [selectedNotification]);
  const selectedDeadlineProcessId =
    selectedNotification?.tipo.startsWith("prazo.") &&
    detailPayload &&
    typeof detailPayload.processoId === "string"
      ? detailPayload.processoId
      : null;
  const { data: selectedDeadlineProcessPreference, mutate: mutateSelectedDeadlineProcessPreference } =
    useSWR(
      selectedDeadlineProcessId
        ? ["notification-center-deadline-process-preference", selectedDeadlineProcessId]
        : null,
      () => getProcessDeadlineNotificationPreference(selectedDeadlineProcessId!),
      {
        revalidateOnFocus: false,
      },
    );
  const selectedDeadlineProcessMuted =
    selectedDeadlineProcessPreference?.success &&
    selectedDeadlineProcessPreference.data?.deadlineAlertsMuted === true;

  const detailDiffItems = useMemo(() => {
    if (!detailPayload) {
      return [] as Array<Record<string, any>>;
    }

    const diffCandidate = (detailPayload as any).diff;

    return Array.isArray(diffCandidate) ? diffCandidate : [];
  }, [detailPayload]);
  const detailLines = useMemo(() => {
    if (!detailPayload) {
      return [] as string[];
    }

    return asStringArray((detailPayload as any).detailLines);
  }, [detailPayload]);
  const detailHolidayImpact = useMemo(() => {
    if (!holidayNotificationsEnabled || !detailPayload) {
      return null;
    }

    return parseHolidayImpact((detailPayload as any).holidayImpact);
  }, [detailPayload, holidayNotificationsEnabled]);

  const handleStatusChange = async (id: string, status: NotificationStatus) => {
    try {
      await markAs(id, status);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Falha ao atualizar notificação.";

      addToast({
        title: "Não foi possível atualizar",
        description: message,
        color: "danger",
      });
    }
  };

  const handleClearAll = async () => {
    try {
      await clearAll();
      addToast({
        title: "Notificações limpas",
        description: "Suas notificações foram removidas.",
        color: "success",
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível limpar as notificações.";

      addToast({
        title: "Erro ao limpar",
        description: message,
        color: "danger",
      });
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await markAllAsRead();
      addToast({
        title: "Tudo lido",
        description: "Todas as notificações foram marcadas como lidas.",
        color: "success",
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível marcar todas como lidas.";

      addToast({
        title: "Erro ao marcar",
        description: message,
        color: "danger",
      });
    }
  };

  const handleToggleDeadlineProcessMute = async () => {
    if (!selectedDeadlineProcessId) {
      return;
    }

    try {
      const result = await setProcessDeadlineNotificationMute({
        processoId: selectedDeadlineProcessId,
        muted: !selectedDeadlineProcessMuted,
      });

      if (!result.success) {
        throw new Error(
          result.error || "Falha ao atualizar alertas deste processo.",
        );
      }

      await mutateSelectedDeadlineProcessPreference();

      if (!selectedDeadlineProcessMuted && selectedNotification) {
        await handleStatusChange(selectedNotification.id, "LIDA");
      }

      addToast({
        title: !selectedDeadlineProcessMuted
          ? "Processo silenciado"
          : "Processo reativado",
        description: !selectedDeadlineProcessMuted
          ? "Novos alertas de prazo deste processo deixam de ser enviados para voce."
          : "Este processo volta a participar das frentes de prazo.",
        color: "success",
      });
    } catch (error) {
      addToast({
        title: "Nao foi possivel atualizar",
        description:
          error instanceof Error
            ? error.message
            : "Falha ao atualizar alertas do processo.",
        color: "danger",
      });
    }
  };

  const hasNotifications = notifications.length > 0;
  const hasFilteredNotifications = filteredNotifications.length > 0;

  return (
    <div className="relative">
      <Tooltip color="primary" content="Notificações" placement="bottom">
        <Button
          isIconOnly
          aria-label="Abrir notificações"
          className="relative rounded-full border border-white/10 bg-white/5 p-0 text-default-500 shadow-lg transition hover:border-primary/40 hover:text-primary"
          radius="full"
          variant="light"
          onPress={disclosure.onOpen}
        >
          {unreadBadge}
          {hasPortalSyncAttention ? (
            <span
              className={`absolute -bottom-0.5 -left-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-background ${
                isPortalSyncWaitingCaptcha ? "bg-warning" : "bg-primary"
              } ${isPortalSyncRunning ? "animate-pulse" : ""}`}
            />
          ) : null}
          <BellIcon className="h-5 w-5" />
        </Button>
      </Tooltip>

      <Drawer
        isOpen={disclosure.isOpen}
        motionProps={{
          variants: {
            enter: { x: 0 },
            exit: { x: 600 },
          },
        }}
        placement="right"
        size="xl"
        onOpenChange={disclosure.onOpenChange}
      >
        <DrawerContent className="border-l border-white/10 bg-background/70 backdrop-blur-3xl">
          {(onClose) => (
            <>
              <DrawerHeader className="flex items-center justify-between gap-4">
                <div className="flex flex-col">
                  <span className="text-sm font-semibold uppercase tracking-[0.3em] text-primary">
                    Central
                  </span>
                  <h2 className="text-lg font-semibold text-white">
                    Notificações
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  {hasPortalSyncAttention ? (
                    <Chip
                      className="text-xs"
                      color={isPortalSyncWaitingCaptcha ? "warning" : "primary"}
                      startContent={
                        isPortalSyncRunning ? <Spinner color="primary" size="sm" /> : null
                      }
                      variant="flat"
                    >
                      {isPortalSyncWaitingCaptcha
                        ? "Captcha pendente"
                        : "Sync em andamento"}
                    </Chip>
                  ) : null}
                  <Chip className="text-xs" color="primary" variant="flat">
                    {isValidating
                      ? "Atualizando"
                      : `${totalUnreadCount} não lida(s)`}
                  </Chip>
                  <Chip className="text-xs" variant="flat">
                    {filteredNotifications.length} exibida(s)
                  </Chip>
                </div>
              </DrawerHeader>

              <DrawerBody className="px-0 pb-0">
                <div className="px-6 pb-4">
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {(
                      [
                        "GERAL",
                        "PRAZOS",
                        "PROCESSOS",
                        "ACESSOS",
                        "ADMINISTRACAO",
                        "OUTROS",
                      ] as NotificationCategory[]
                    ).map((category) => (
                      <Button
                        key={category}
                        className="shrink-0"
                        color={activeCategory === category ? "primary" : "default"}
                        size="sm"
                        variant={activeCategory === category ? "flat" : "bordered"}
                        onPress={() => setActiveCategory(category)}
                      >
                        {categoryCopy[category]} ({categoryCounts[category]})
                      </Button>
                    ))}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(
                      ["TODAS", "NAO_LIDAS", "LIDAS"] as NotificationViewFilter[]
                    ).map((filter) => (
                      <Button
                        key={filter}
                        className="shrink-0"
                        color={
                          activeViewFilter === filter
                            ? filter === "NAO_LIDAS"
                              ? "primary"
                              : "success"
                            : "default"
                        }
                        size="sm"
                        variant={activeViewFilter === filter ? "flat" : "bordered"}
                        onPress={() => setActiveViewFilter(filter)}
                      >
                        {viewFilterCopy[filter]}
                        {filter === "NAO_LIDAS"
                          ? ` (${filteredUnreadCount})`
                          : filter === "LIDAS"
                            ? ` (${filteredReadCount})`
                            : ""}
                      </Button>
                    ))}
                  </div>
                </div>

                {hasPortalSyncAttention ? (
                  <div className="mx-6 mb-4 rounded-2xl border border-primary/30 bg-primary/5 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-white">
                          {isPortalSyncWaitingCaptcha
                            ? "Sincronização pausada aguardando captcha"
                            : "Sincronização de processos em andamento"}
                        </p>
                        <p className="text-xs text-default-400">
                          {isPortalSyncWaitingCaptcha
                            ? "Abra o Portal do Advogado para validar o captcha e retomar o processamento."
                            : `Capturados: ${portalSyncStatus?.syncedCount ?? 0} · Criados: ${portalSyncStatus?.createdCount ?? 0} · Atualizados: ${portalSyncStatus?.updatedCount ?? 0}`}
                        </p>
                      </div>
                      {isPortalSyncRunning ? <Spinner color="primary" size="sm" /> : null}
                    </div>
                    <div className="mt-3">
                      <Button
                        color={isPortalSyncWaitingCaptcha ? "warning" : "primary"}
                        size="sm"
                        variant="flat"
                        onPress={() => {
                          disclosure.onClose();
                          router.push("/portal-advogado");
                        }}
                      >
                        Abrir Portal do Advogado
                      </Button>
                    </div>
                  </div>
                ) : null}

                {isLoading && !hasNotifications ? (
                  <div className="flex h-48 items-center justify-center">
                    <Spinner color="primary" label="Carregando notificações" />
                  </div>
                ) : null}

                {!isLoading && !hasNotifications ? (
                  <div className="flex h-48 flex-col items-center justify-center gap-2 text-center text-default-400">
                    <BellIcon className="h-10 w-10 text-default-200" />
                    <p className="text-sm font-medium text-white">
                      Nenhuma notificação por aqui
                    </p>
                    <p className="text-xs text-default-400">
                      Quando algo importante acontecer, você será avisado.
                    </p>
                  </div>
                ) : null}

                {hasNotifications && !hasFilteredNotifications ? (
                  <div className="flex h-40 flex-col items-center justify-center gap-2 px-6 text-center text-default-400">
                    <BellIcon className="h-10 w-10 text-default-200" />
                    <p className="text-sm font-medium text-white">
                      Nenhuma notificação nesta visão
                    </p>
                    <p className="text-xs text-default-400">
                      Ajuste as abas ou filtros para ver outros registros.
                    </p>
                  </div>
                ) : null}

                {hasFilteredNotifications ? (
                  <ScrollShadow className="max-h-[60vh] px-6 pb-6">
                    <ul className="space-y-4">
                      {filteredNotifications.map((item) => {
                        const isUnread = item.status === "NAO_LIDA";
                        const securityActionUrl = getSecurityActionUrl(item);

                        return (
                          <li
                            key={item.id}
                            className="group rounded-2xl border border-white/10 bg-white/5 p-4 shadow-lg transition hover:border-primary/40 hover:bg-primary/5"
                            role="button"
                            tabIndex={0}
                            onClick={() => handleOpenDetails(item)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                handleOpenDetails(item);
                              }
                            }}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-semibold text-white">
                                    {item.titulo}
                                  </span>
                                  <Chip
                                    className="text-[10px]"
                                    color={statusColor[item.status]}
                                    size="sm"
                                    variant="flat"
                                  >
                                    {statusCopy[item.status]}
                                  </Chip>
                                </div>
                                <p className="line-clamp-4 whitespace-pre-line text-sm text-default-400">
                                  {item.mensagem}
                                </p>
                              </div>
                              <span className="shrink-0 text-xs text-default-300">
                                {formatDate(item.criadoEm)}
                              </span>
                            </div>

                            <div
                              className="mt-3 flex flex-wrap items-center gap-2"
                              onClick={(event) => event.stopPropagation()}
                            >
                              {isUnread ? (
                                <Button
                                  color="primary"
                                  size="sm"
                                  variant="flat"
                                  onPress={() =>
                                    handleStatusChange(item.id, "LIDA")
                                  }
                                >
                                  Marcar como lida
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="light"
                                  onPress={() =>
                                    handleStatusChange(item.id, "NAO_LIDA")
                                  }
                                >
                                  Marcar como não lida
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="light"
                                onPress={() =>
                                  handleStatusChange(item.id, "ARQUIVADA")
                                }
                              >
                                Arquivar
                              </Button>
                              <Button
                                size="sm"
                                variant="bordered"
                                onPress={() => handleOpenDetails(item)}
                              >
                                Ver detalhes
                              </Button>
                              {securityActionUrl ? (
                                <Button
                                  color="danger"
                                  size="sm"
                                  variant="flat"
                                  onPress={() => {
                                    window.location.href = securityActionUrl;
                                  }}
                                >
                                  Nao fui eu
                                </Button>
                              ) : null}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </ScrollShadow>
                ) : null}
              </DrawerBody>

              <DrawerFooter className="flex flex-col gap-2 border-t border-white/10 bg-background/60">
                <div className="flex w-full items-center justify-between text-xs text-default-400">
                  <span>Sistema de notificações ativo</span>
                  <span>{filteredNotifications.length} registro(s) nesta visão</span>
                </div>
                <div className="flex w-full flex-wrap gap-3">
                  <Button
                    className="flex-1"
                    isDisabled={totalUnreadCount === 0}
                    variant="bordered"
                    onPress={handleMarkAllAsRead}
                  >
                    Marcar todas como lidas
                  </Button>
                  <Button
                    className="flex-1"
                    color="primary"
                    variant="flat"
                    onPress={handleClearAll}
                  >
                    Limpar notificações
                  </Button>
                  <Button className="flex-1" variant="light" onPress={onClose}>
                    Fechar
                  </Button>
                </div>
              </DrawerFooter>
            </>
          )}
        </DrawerContent>
      </Drawer>
      <Modal
        classNames={{
          base: "bg-background/95 backdrop-blur-lg border border-white/10",
        }}
        isOpen={detailDisclosure.isOpen && !!selectedNotification}
        scrollBehavior="inside"
        size="lg"
        onClose={handleCloseDetails}
      >
        <ModalContent>
          {() => {
            const notification = selectedNotification;
            const referenceHref = notification
              ? resolveReferenceLink(notification)
              : null;
            const securityActionUrl = getSecurityActionUrl(notification);
            const summary = detailPayload?.changesSummary as string | undefined;
            const statusSummary =
              (detailPayload?.statusSummary as string | undefined) ??
              (detailPayload?.oldStatusLabel && detailPayload?.newStatusLabel
                ? `Status alterado de ${detailPayload.oldStatusLabel} para ${detailPayload.newStatusLabel}`
                : undefined);
            const additionalSummary =
              detailPayload?.additionalChangesSummary as string | undefined;
            const eventMeetingUrl = getEventMeetingUrl(notification);
            const isOnlineEvent = detailPayload?.isOnline === true;

            return (
              <>
                <ModalHeader className="flex flex-col gap-1">
                  <span className="text-xs font-medium uppercase tracking-wide text-default-400">
                    {notification ? formatDate(notification.criadoEm) : ""}
                  </span>
                  <span className="text-lg font-semibold text-foreground">
                    {notification?.titulo ?? "Detalhes da notificação"}
                  </span>
                </ModalHeader>
                <ModalBody className="space-y-4">
                  {notification && notification.tipo.startsWith("prazo.") ? (
                    <div className="flex flex-wrap gap-2">
                      <Chip color="primary" size="sm" variant="flat">
                        {getDeadlineFrontBadgeLabel(notification.tipo)}
                      </Chip>
                      {selectedDeadlineProcessId ? (
                        <Chip
                          color={selectedDeadlineProcessMuted ? "warning" : "success"}
                          size="sm"
                          variant="flat"
                        >
                          {selectedDeadlineProcessMuted
                            ? "Alertas deste processo silenciados"
                            : "Alertas deste processo ativos"}
                        </Chip>
                      ) : null}
                    </div>
                  ) : null}

                  {notification?.mensagem ? (
                    <p className="whitespace-pre-wrap text-sm text-default-700 dark:text-default-300">
                      {notification.mensagem}
                    </p>
                  ) : null}

                  {detailHolidayImpact ? (
                    <HolidayImpactPanel
                      audience={holidayAudience}
                      impact={detailHolidayImpact}
                    />
                  ) : null}

                  {isOnlineEvent || eventMeetingUrl ? (
                    <div className="rounded-lg border border-primary/20 bg-primary-50 p-3 text-sm text-primary-700 dark:border-primary/40 dark:bg-primary/10 dark:text-primary-100">
                      <p className="font-medium">
                        {isOnlineEvent ? "Evento online" : "Link do evento disponível"}
                      </p>
                      {eventMeetingUrl ? (
                        <a
                          className="mt-2 inline-flex text-xs font-semibold underline underline-offset-4"
                          href={eventMeetingUrl}
                          rel="noreferrer"
                          target="_blank"
                        >
                          Abrir link do evento
                        </a>
                      ) : null}
                    </div>
                  ) : null}

                  {statusSummary ? (
                    <div className="rounded-lg border border-primary/20 bg-primary-50 p-3 text-sm text-primary-700 dark:border-primary/40 dark:bg-primary/10 dark:text-primary-100">
                      {statusSummary}
                    </div>
                  ) : null}

                  {summary ? (
                    <div className="rounded-lg border border-default-200 bg-default-50 p-3 text-sm text-default-700 dark:border-white/10 dark:bg-white/5 dark:text-default-300">
                      Campos atualizados: {summary}
                    </div>
                  ) : null}

                  {!summary && additionalSummary ? (
                    <div className="rounded-lg border border-default-200 bg-default-50 p-3 text-sm text-default-700 dark:border-white/10 dark:bg-white/5 dark:text-default-300">
                      Outras alterações: {additionalSummary}
                    </div>
                  ) : null}

                  {detailLines.length > 0 ? (
                    <div className="rounded-xl border border-default-200 bg-default-50 p-4 dark:border-white/10 dark:bg-white/5">
                      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-default-500">
                        Detalhes capturados
                      </p>
                      <ul className="space-y-2">
                        {detailLines.map((line, index) => (
                          <li
                            key={`${line}-${index}`}
                            className="rounded-lg bg-background/80 px-3 py-2 text-sm text-default-700 shadow-sm dark:bg-default-100/5 dark:text-default-200"
                          >
                            {line}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {detailDiffItems.length > 0 ? (
                    <div className="overflow-hidden rounded-xl border border-default-200 dark:border-white/10">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-default-100 text-xs uppercase tracking-wide text-default-600 dark:bg-white/5 dark:text-default-500">
                          <tr>
                            <th className="px-4 py-2 font-semibold">Campo</th>
                            <th className="px-4 py-2 font-semibold">Antes</th>
                            <th className="px-4 py-2 font-semibold">Depois</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-default-200 dark:divide-white/5">
                          {detailDiffItems.map((change: any, index: number) => (
                            <tr key={change.field ?? index}>
                              <td className="px-4 py-2 text-sm font-medium text-default-900 dark:text-white">
                                {change.label ?? change.field ?? "-"}
                              </td>
                              <td className="px-4 py-2 text-sm text-default-500 dark:text-default-400">
                                {change.before ?? "—"}
                              </td>
                              <td className="px-4 py-2 text-sm text-default-700 dark:text-default-200">
                                {change.after ?? "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : detailLines.length === 0 ? (
                    <p className="text-sm text-default-500 dark:text-default-400">
                      Nenhum detalhamento de alteração disponível.
                    </p>
                  ) : null}
                </ModalBody>
                <ModalFooter className="flex flex-wrap justify-end gap-2">
                  {securityActionUrl ? (
                    <Button
                      color="danger"
                      variant="flat"
                      onPress={() => {
                        window.location.href = securityActionUrl;
                      }}
                    >
                      Nao fui eu
                    </Button>
                  ) : null}
                  {eventMeetingUrl ? (
                    <Button
                      as="a"
                      color="primary"
                      href={eventMeetingUrl}
                      rel="noreferrer"
                      target="_blank"
                      variant="flat"
                    >
                      Abrir link do evento
                    </Button>
                  ) : null}
                  <Button variant="light" onPress={handleCloseDetails}>
                    Fechar
                  </Button>
                  {selectedNotification &&
                  selectedNotification.status === "NAO_LIDA" ? (
                    <Button
                      variant="flat"
                      onPress={() => {
                        void handleStatusChange(
                          selectedNotification.id,
                          "LIDA",
                        );
                      }}
                    >
                      Marcar como lida
                    </Button>
                  ) : null}
                  {selectedDeadlineProcessId ? (
                    <Button
                      variant="bordered"
                      onPress={() => {
                        void handleToggleDeadlineProcessMute();
                      }}
                    >
                      {selectedDeadlineProcessMuted
                        ? "Reativar alertas deste processo"
                        : "Silenciar alertas deste processo"}
                    </Button>
                  ) : null}
                  {referenceHref ? (
                    <Button
                      color="primary"
                      onPress={() => {
                        handleCloseDetails();
                        disclosure.onClose();
                        router.push(referenceHref);
                      }}
                    >
                      Abrir registro
                    </Button>
                  ) : null}
                </ModalFooter>
              </>
            );
          }}
        </ModalContent>
      </Modal>
    </div>
  );
};
