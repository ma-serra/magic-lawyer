"use client";

import { useEffect, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import useSWR from "swr";
import { Button } from "@heroui/button";
import { Chip } from "@heroui/chip";
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from "@heroui/modal";
import { AlertTriangle, BellRing, Clock3 } from "lucide-react";

import { useNotifications } from "@/app/hooks/use-notifications";
import {
  getProcessDeadlineNotificationPreference,
  setProcessDeadlineNotificationMute,
} from "@/app/actions/processo-deadline-preferences";
import {
  getDeadlineFrontBadgeLabel,
  getCriticalDeadlineLabel,
  isCriticalDeadlineNotification,
} from "@/app/lib/notifications/deadline-alerts";
import { useRealtime } from "@/app/providers/realtime-provider";
import { addToast } from "@heroui/toast";

function formatDate(dateIso: string | null | undefined) {
  if (!dateIso) {
    return null;
  }

  const date = new Date(dateIso);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function resolveReferenceLink(item: {
  referenciaId?: string | null;
  tipo: string;
  dados?: unknown;
}) {
  const payload =
    item.dados && typeof item.dados === "object" && !Array.isArray(item.dados)
      ? (item.dados as Record<string, unknown>)
      : {};

  const processoId =
    (typeof payload.processoId === "string" ? payload.processoId : null) ||
    null;
  const prazoId =
    (typeof payload.prazoId === "string" ? payload.prazoId : null) ||
    item.referenciaId ||
    null;

  if (!processoId) {
    return "/processos";
  }

  return prazoId
    ? `/processos/${processoId}?tab=prazos&prazoId=${encodeURIComponent(prazoId)}`
    : `/processos/${processoId}?tab=prazos`;
}

export function CriticalDeadlinePopup() {
  const pathname = usePathname();
  const router = useRouter();
  const { subscribe } = useRealtime();
  const { notifications, markAs, mutate } = useNotifications({ limit: 30 });

  const criticalNotifications = useMemo(
    () =>
      notifications
        .filter(isCriticalDeadlineNotification)
        .sort(
          (left, right) =>
            new Date(right.criadoEm).getTime() - new Date(left.criadoEm).getTime(),
        ),
    [notifications],
  );

  const current = criticalNotifications[0] ?? null;
  const payload =
    current?.dados && typeof current.dados === "object" && !Array.isArray(current.dados)
      ? (current.dados as Record<string, unknown>)
      : {};
  const vencimento = formatDate(
    typeof payload.dataVencimento === "string" ? payload.dataVencimento : null,
  );
  const processoNumero =
    typeof payload.processoNumero === "string"
      ? payload.processoNumero
      : typeof payload.numero === "string"
        ? payload.numero
        : null;
  const processoId =
    typeof payload.processoId === "string" ? payload.processoId : null;
  const prazoTitulo =
    typeof payload.titulo === "string" ? payload.titulo : current?.titulo ?? null;
  const diasRestantes =
    typeof payload.diasRestantes === "number" ? payload.diasRestantes : null;
  const { data: processPreference, mutate: mutateProcessPreference } = useSWR(
    processoId
      ? ["deadline-process-preference-popup", processoId]
      : null,
    () => getProcessDeadlineNotificationPreference(processoId!),
    {
      revalidateOnFocus: false,
    },
  );
  const processDeadlineMuted =
    processPreference?.success &&
    processPreference.data?.deadlineAlertsMuted === true;
  const shouldSuppressBlockingModal = useMemo(() => {
    if (!pathname) {
      return false;
    }

    return (
      pathname === "/processos/novo" ||
      /^\/processos\/[^/]+\/editar$/.test(pathname)
    );
  }, [pathname]);

  useEffect(() => {
    const unsubscribe = subscribe("notification.new", () => {
      void mutate();
    });

    return unsubscribe;
  }, [mutate, subscribe]);

  useEffect(() => {
    if (!current) {
      return;
    }

    addToast({
      title: "Prazo crítico exige leitura",
      description:
        "Há um prazo no limite e o sistema está exigindo confirmação explícita.",
      color: "danger",
    });
  }, [current?.id]);

  if (!current) {
    return null;
  }

  if (shouldSuppressBlockingModal) {
    return null;
  }

  const openReference = async () => {
    await markAs(current.id, "LIDA");
    router.push(resolveReferenceLink(current));
  };

  const markRead = async () => {
    await markAs(current.id, "LIDA");
  };

  const toggleMuteForProcess = async () => {
    if (!processoId) {
      return;
    }

    const result = await setProcessDeadlineNotificationMute({
      processoId,
      muted: !processDeadlineMuted,
    });

    if (!result.success) {
      addToast({
        title: "Não foi possível atualizar",
        description:
          result.error || "Falha ao atualizar alertas deste processo.",
        color: "danger",
      });
      return;
    }

    await mutateProcessPreference();

    if (!processDeadlineMuted) {
      await markAs(current.id, "LIDA");
    }

    addToast({
      title: !processDeadlineMuted
        ? "Alertas deste processo silenciados"
        : "Alertas deste processo reativados",
      description: !processDeadlineMuted
        ? "Você deixará de receber alertas de prazo deste processo até reativar."
        : "O processo volta a participar das três frentes de prazo.",
      color: "success",
    });
  };

  return (
    <Modal
      hideCloseButton
      isDismissable={false}
      isKeyboardDismissDisabled
      isOpen
      placement="center"
      size="lg"
    >
      <ModalContent className="border border-danger-200/70 bg-background/95 dark:border-danger/30">
        <ModalHeader className="flex items-start gap-3">
          <div className="rounded-full border border-danger-200/80 bg-danger-50 p-2 text-danger-700 dark:border-danger/30 dark:bg-danger/10 dark:text-danger">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-danger">
              Prazo crítico
            </p>
            <h2 className="text-xl font-semibold text-foreground">
              {getCriticalDeadlineLabel(current.tipo)}
            </h2>
            <p className="text-sm text-default-600 dark:text-default-400">
              Este alerta exige leitura explícita do advogado.
            </p>
          </div>
        </ModalHeader>
        <ModalBody className="space-y-4">
          <div className="rounded-2xl border border-danger-200/70 bg-danger-50/90 p-4 dark:border-danger/20 dark:bg-danger/5">
            <div className="flex flex-wrap items-center gap-2">
              <Chip color="danger" startContent={<BellRing className="h-3 w-3" />} variant="flat">
                {current.titulo}
              </Chip>
              <Chip color="primary" variant="flat">
                {getDeadlineFrontBadgeLabel(current.tipo)}
              </Chip>
              {diasRestantes !== null ? (
                <Chip color="warning" startContent={<Clock3 className="h-3 w-3" />} variant="flat">
                  {diasRestantes <= 0 ? "No limite" : `${diasRestantes} dia(s) restantes`}
                </Chip>
              ) : null}
            </div>
            <p className="mt-3 text-sm text-default-700 dark:text-default-300">
              {current.mensagem}
            </p>
          </div>

          <div className="grid gap-3 rounded-2xl border border-default-200 bg-default-50 p-4 dark:border-white/10 dark:bg-white/5 md:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-default-500">
                Processo
              </p>
              <p className="mt-1 text-sm font-medium text-foreground">
                {processoNumero ?? "Processo não identificado"}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-default-500">
                Vencimento
              </p>
              <p className="mt-1 text-sm font-medium text-foreground">
                {vencimento ?? "Não informado"}
              </p>
            </div>
            <div className="md:col-span-2">
              <p className="text-xs uppercase tracking-wide text-default-500">
                Prazo
              </p>
              <p className="mt-1 text-sm font-medium text-foreground">
                {prazoTitulo ?? "Prazo crítico"}
              </p>
            </div>
          </div>
        </ModalBody>
        <ModalFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            className="w-full sm:w-auto"
            color="primary"
            onPress={() => void openReference()}
          >
            Abrir prazo agora
          </Button>
          <Button
            className="w-full sm:w-auto"
            color="danger"
            variant="flat"
            onPress={() => void markRead()}
          >
            Ja vi
          </Button>
          {processoId ? (
            <Button
              className="w-full sm:w-auto"
              variant="bordered"
              onPress={() => void toggleMuteForProcess()}
            >
              {processDeadlineMuted
                ? "Reativar alertas deste processo"
                : "Silenciar alertas deste processo"}
            </Button>
          ) : null}
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
