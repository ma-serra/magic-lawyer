"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Button,
  Chip,
  Spinner,
  Textarea,
  Tooltip,
} from "@heroui/react";
import {
  Bell,
  Expand,
  Send,
  Users,
  UserCheck,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  addSupportMessage,
  claimSupportTicket,
  getGlobalSupportTickets,
  getSupportTicketThread,
  markSupportTicketViewed,
  type SupportTicketListItem,
} from "@/app/actions/tickets";
import { TicketStatus } from "@/generated/prisma";

const DOCK_QUEUE_POLL_MS = 5000;
const DOCK_THREAD_POLL_MS = 3000;
const MAX_OPEN_CHATS = 3;
const PANEL_WIDTH_PX = 360;
const PANEL_RIGHT_OFFSET_PX = 16;
const CHAT_GAP_PX = 12;

function getStatusLabel(status: TicketStatus): string {
  switch (status) {
    case TicketStatus.OPEN:
      return "Aberto";
    case TicketStatus.IN_PROGRESS:
      return "Em andamento";
    case TicketStatus.WAITING_CUSTOMER:
      return "Aguardando cliente";
    case TicketStatus.WAITING_EXTERNAL:
      return "Aguardando terceiro";
    case TicketStatus.RESOLVED:
      return "Resolvido";
    case TicketStatus.CLOSED:
      return "Encerrado";
    default:
      return status;
  }
}

function getStatusColor(status: TicketStatus) {
  switch (status) {
    case TicketStatus.OPEN:
      return "primary" as const;
    case TicketStatus.IN_PROGRESS:
    case TicketStatus.WAITING_CUSTOMER:
      return "warning" as const;
    case TicketStatus.RESOLVED:
      return "success" as const;
    case TicketStatus.CLOSED:
      return "default" as const;
    case TicketStatus.WAITING_EXTERNAL:
      return "default" as const;
    default:
      return "default" as const;
  }
}

function formatDateTime(value?: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleString("pt-BR");
}

interface MiniChatWindowProps {
  ticketId: string;
  onClose: (ticketId: string) => void;
  onOpenFullscreen: (ticketId: string) => void;
}

function MiniChatWindow({
  ticketId,
  onClose,
  onOpenFullscreen,
}: MiniChatWindowProps) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const { data: thread, isLoading, mutate } = useSWR(
    ["support-dock-thread", ticketId],
    () => getSupportTicketThread(ticketId),
    {
      refreshInterval: DOCK_THREAD_POLL_MS,
      revalidateOnFocus: true,
      dedupingInterval: 500,
    },
  );

  const isClosed = thread?.status === TicketStatus.CLOSED;

  const visibleMessages = useMemo(() => {
    if (!thread?.messages) return [];
    return thread.messages.slice(-8);
  }, [thread?.messages]);

  const canSend = draft.trim().length > 0 && !sending && !isClosed;

  const handleSend = async () => {
    if (!thread?.id || !canSend) return;

    setSending(true);
    try {
      await addSupportMessage(thread.id, {
        content: draft.trim(),
        isInternal: false,
      });
      setDraft("");
      await Promise.all([mutate(), markSupportTicketViewed(thread.id)]);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro ao enviar mensagem";
      toast.error(message);
    } finally {
      setSending(false);
    }
  };

  if (isLoading) {
    return (
      <div className="pointer-events-auto flex h-[360px] w-[340px] items-center justify-center rounded-2xl border border-white/10 bg-content1/95 shadow-2xl backdrop-blur-xl">
        <Spinner label="Carregando chat..." />
      </div>
    );
  }

  if (!thread) {
    return (
      <div className="pointer-events-auto flex h-[360px] w-[340px] flex-col rounded-2xl border border-danger/30 bg-content1/95 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center justify-between border-b border-white/10 p-3">
          <p className="text-sm font-semibold text-white">Chat indisponível</p>
          <Button isIconOnly size="sm" variant="light" onPress={() => onClose(ticketId)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex flex-1 items-center justify-center px-4 text-center text-sm text-default-300">
          Este chat não está mais disponível.
        </div>
      </div>
    );
  }

  return (
    <div className="pointer-events-auto flex h-[420px] w-[360px] flex-col rounded-2xl border border-white/10 bg-content1/95 shadow-2xl backdrop-blur-xl">
      <div className="flex items-start justify-between gap-2 border-b border-white/10 p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{thread.title}</p>
          <p className="truncate text-xs text-default-400">
            {thread.tenant.name} · #{thread.id.slice(-8)}
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            <Chip color={getStatusColor(thread.status)} size="sm" variant="flat">
              {getStatusLabel(thread.status)}
            </Chip>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            isIconOnly
            size="sm"
            variant="light"
            onPress={() => onOpenFullscreen(ticketId)}
          >
            <Expand className="h-4 w-4" />
          </Button>
          <Button isIconOnly size="sm" variant="light" onPress={() => onClose(ticketId)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {visibleMessages.length === 0 ? (
          <p className="text-center text-xs text-default-400">
            Ainda não há mensagens.
          </p>
        ) : (
          visibleMessages.map((message) => {
            const isSupport =
              message.authorType === "SUPER_ADMIN" ||
              message.authorType === "SYSTEM";

            return (
              <div
                key={message.id}
                className={`flex ${isSupport ? "justify-start" : "justify-end"}`}
              >
                <div
                  className={`max-w-[88%] rounded-xl border px-2 py-1.5 text-xs ${
                    isSupport
                      ? "border-primary/35 bg-primary/10 text-foreground"
                      : "border-success/35 bg-success/10 text-foreground"
                  }`}
                >
                  <p className="mb-1 text-[10px] text-default-500">
                    {message.author.name} · {formatDateTime(message.createdAt)}
                  </p>
                  <p className="whitespace-pre-wrap break-words leading-relaxed">
                    {message.content}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="space-y-2 border-t border-white/10 p-3">
        {isClosed ? (
          <div className="rounded-lg border border-success/30 bg-success/10 px-2 py-1.5 text-xs text-success-200">
            Chat finalizado em {formatDateTime(thread.closedAt)}. Envio bloqueado.
          </div>
        ) : null}
        <Textarea
          isDisabled={isClosed}
          minRows={2}
          placeholder={
            isClosed ? "Chat finalizado." : "Responder rapidamente..."
          }
          value={draft}
          onValueChange={setDraft}
        />
        <div className="flex justify-end">
          <Button
            color="primary"
            isDisabled={!canSend}
            isLoading={sending}
            size="sm"
            startContent={sending ? undefined : <Send className="h-4 w-4" />}
            onPress={handleSend}
          >
            Enviar
          </Button>
        </div>
      </div>
    </div>
  );
}

export function AdminFloatingChatDock() {
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const currentSuperAdminId = String((session?.user as any)?.id ?? "");
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [openChatIds, setOpenChatIds] = useState<string[]>([]);
  const [busyChatIds, setBusyChatIds] = useState<Record<string, boolean>>({});

  const shouldHideDock =
    !currentSuperAdminId ||
    pathname.startsWith("/admin/suporte") ||
    pathname.startsWith("/admin/suporte/chat/");

  const { data: queueData, isLoading, mutate } = useSWR(
    "support-dock-queue",
    () =>
      getGlobalSupportTickets({
        page: 1,
        pageSize: 40,
        status: "ALL",
        priority: "ALL",
        category: "ALL",
        supportLevel: "ALL",
        tenantId: "ALL",
      }),
    {
      refreshInterval: DOCK_QUEUE_POLL_MS,
      revalidateOnFocus: true,
      dedupingInterval: 1000,
    },
  );

  const queueItems = useMemo(() => {
    const items = queueData?.items ?? [];
    return items.filter(
      (ticket) =>
        (ticket.waitingFor === "SUPPORT" && ticket.assignedTo === null) ||
        ticket.assignedTo?.id === currentSuperAdminId,
    );
  }, [queueData?.items, currentSuperAdminId]);

  const openQueueCount = useMemo(
    () =>
      queueItems.filter(
        (item) => item.waitingFor === "SUPPORT" && item.assignedTo === null,
      ).length,
    [queueItems],
  );

  const handleOpenFullscreen = (ticketId: string) => {
    setIsPanelOpen(false);
    router.push(
      `/admin/suporte/chat/${ticketId}?returnTo=${encodeURIComponent(pathname)}`,
    );
  };

  const handleOpenMini = async (ticket: SupportTicketListItem) => {
    if (openChatIds.includes(ticket.id)) {
      return;
    }

    setBusyChatIds((previous) => ({ ...previous, [ticket.id]: true }));
    try {
      if (ticket.assignedTo === null) {
        await claimSupportTicket(ticket.id);
      }

      setOpenChatIds((previous) => [ticket.id, ...previous].slice(0, MAX_OPEN_CHATS));
      await mutate();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro ao abrir chat";
      toast.error(message);
    } finally {
      setBusyChatIds((previous) => ({ ...previous, [ticket.id]: false }));
    }
  };

  const handleCloseMini = (ticketId: string) => {
    setOpenChatIds((previous) => previous.filter((id) => id !== ticketId));
  };

  if (shouldHideDock) {
    return null;
  }

  return (
    <>
      {openChatIds.length > 0 ? (
        <div
          className="pointer-events-none fixed bottom-4 z-[70] flex max-w-[calc(100vw-112px)] items-end gap-3 overflow-x-auto pb-1 pr-1"
          style={{
            right: isPanelOpen
              ? PANEL_WIDTH_PX + PANEL_RIGHT_OFFSET_PX + CHAT_GAP_PX
              : 80,
          }}
        >
          {openChatIds.map((ticketId) => (
            <MiniChatWindow
              key={ticketId}
              ticketId={ticketId}
              onClose={handleCloseMini}
              onOpenFullscreen={handleOpenFullscreen}
            />
          ))}
        </div>
      ) : null}

      <div className="fixed bottom-4 right-4 z-[75]">
        {isPanelOpen ? (
          <div className="mb-3 w-[360px] rounded-2xl border border-white/10 bg-content1/95 p-3 shadow-2xl backdrop-blur-xl">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-white">Chats do suporte</p>
              <Button
                isIconOnly
                size="sm"
                variant="light"
                onPress={() => setIsPanelOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <p className="mb-3 text-xs text-default-400">Até {MAX_OPEN_CHATS} mini chats simultâneos.</p>

            {isLoading ? (
              <div className="flex min-h-20 items-center justify-center">
                <Spinner size="sm" />
              </div>
            ) : queueItems.length === 0 ? (
              <p className="rounded-lg border border-white/10 bg-background/40 p-3 text-xs text-default-400">
                Nenhum chat pendente no momento.
              </p>
            ) : (
              <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
                {queueItems.map((ticket) => {
                  const isAssignedToMe =
                    ticket.assignedTo?.id === currentSuperAdminId;
                  const isOpen = openChatIds.includes(ticket.id);

                  return (
                    <div
                      key={ticket.id}
                      className="rounded-xl border border-white/10 bg-background/40 p-2"
                    >
                      <p className="truncate text-xs font-medium text-white">
                        {ticket.tenant.name} · {ticket.title}
                      </p>
                      <p className="truncate text-[11px] text-default-400">
                        {ticket.requester.name} · {ticket.id.slice(-8)}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        <Chip color={getStatusColor(ticket.status)} size="sm" variant="flat">
                          {getStatusLabel(ticket.status)}
                        </Chip>
                        {isAssignedToMe ? (
                          <Chip
                            color="success"
                            size="sm"
                            startContent={<UserCheck className="h-3 w-3" />}
                            variant="flat"
                          >
                            Assumido
                          </Chip>
                        ) : null}
                        {ticket.participants.length > 0 ? (
                          <Tooltip
                            className="max-w-xs"
                            content={
                              <div className="space-y-1 p-1">
                                {ticket.participants.map((participant) => (
                                  <p
                                    key={`${ticket.id}-${participant.id}`}
                                    className="text-xs"
                                  >
                                    {participant.name} - {participant.roleLabel}
                                  </p>
                                ))}
                              </div>
                            }
                          >
                            <Chip
                              color="default"
                              size="sm"
                              startContent={<Users className="h-3 w-3" />}
                              variant="flat"
                            >
                              {ticket.participants.length}
                            </Chip>
                          </Tooltip>
                        ) : null}
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        {isOpen ? (
                          <p className="text-xs text-default-400">Aberto no dock</p>
                        ) : (
                          <Button
                            color="primary"
                            isDisabled={Boolean(busyChatIds[ticket.id])}
                            isLoading={Boolean(busyChatIds[ticket.id])}
                            size="sm"
                            onPress={() => handleOpenMini(ticket)}
                          >
                            Abrir chat
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}

        <div className="relative inline-flex">
          <Button
            className="shadow-2xl"
            color="primary"
            radius="full"
            startContent={<Bell className="h-4 w-4" />}
            onPress={() => setIsPanelOpen((current) => !current)}
          >
            Chats
          </Button>
          {openQueueCount > 0 ? (
            <span className="pointer-events-none absolute -right-1 -top-1 z-10 inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-content1 bg-danger px-1.5 text-[10px] font-semibold leading-none text-white shadow-lg">
              {openQueueCount > 99 ? "99+" : openQueueCount}
            </span>
          ) : null}
        </div>
      </div>
    </>
  );
}
