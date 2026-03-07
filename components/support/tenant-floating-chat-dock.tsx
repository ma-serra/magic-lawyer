"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button, Chip, Spinner, Textarea, Tooltip } from "@heroui/react";
import { LifeBuoy, Expand, Send, Users, X } from "lucide-react";
import { toast } from "sonner";

import {
  addSupportMessage,
  getSupportTicketThread,
  getTenantSupportTickets,
  markSupportTicketViewed,
  type SupportTicketListItem,
} from "@/app/actions/tickets";
import { TicketStatus } from "@/generated/prisma";

const DOCK_QUEUE_POLL_MS = 5000;
const DOCK_THREAD_POLL_MS = 3000;
const MAX_OPEN_CHATS = 3;
const PANEL_WIDTH_PX = 340;
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
    case TicketStatus.WAITING_EXTERNAL:
      return "warning" as const;
    case TicketStatus.WAITING_CUSTOMER:
      return "secondary" as const;
    case TicketStatus.RESOLVED:
      return "success" as const;
    case TicketStatus.CLOSED:
      return "default" as const;
    default:
      return "default" as const;
  }
}

function formatDateTime(value?: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleString("pt-BR");
}

interface TenantMiniChatWindowProps {
  ticketId: string;
  onClose: (ticketId: string) => void;
  onOpenSupportPage: (ticketId: string) => void;
}

function TenantMiniChatWindow({
  ticketId,
  onClose,
  onOpenSupportPage,
}: TenantMiniChatWindowProps) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const { data: thread, isLoading, mutate } = useSWR(
    ["tenant-support-dock-thread", ticketId],
    () => getSupportTicketThread(ticketId),
    {
      refreshInterval: DOCK_THREAD_POLL_MS,
      revalidateOnFocus: true,
      dedupingInterval: 500,
    },
  );

  useEffect(() => {
    if (!thread?.id) return;

    markSupportTicketViewed(thread.id).catch(() => {
      // silencioso
    });
  }, [thread?.id]);

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
      await mutate();
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
          Este ticket não está mais disponível.
        </div>
      </div>
    );
  }

  return (
    <div className="pointer-events-auto flex h-[420px] w-[360px] flex-col rounded-2xl border border-white/10 bg-content1/95 shadow-2xl backdrop-blur-xl">
      <div className="flex items-start justify-between gap-2 border-b border-white/10 p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{thread.title}</p>
          <p className="truncate text-xs text-default-400">#{thread.id.slice(-8)}</p>
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
            onPress={() => onOpenSupportPage(ticketId)}
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
            const fromSupport =
              message.authorType === "SUPER_ADMIN" ||
              message.authorType === "SYSTEM";

            return (
              <div
                key={message.id}
                className={`flex ${fromSupport ? "justify-start" : "justify-end"}`}
              >
                <div
                  className={`max-w-[88%] rounded-xl border px-2 py-1.5 text-xs ${
                    fromSupport
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
            Chat finalizado em {formatDateTime(thread.closedAt)}.
          </div>
        ) : null}
        <Textarea
          isDisabled={isClosed}
          minRows={2}
          placeholder={isClosed ? "Chat finalizado." : "Responder rapidamente..."}
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

export function TenantFloatingChatDock() {
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [openChatIds, setOpenChatIds] = useState<string[]>([]);

  const shouldHideDock =
    !session?.user ||
    pathname.startsWith("/suporte") ||
    pathname.startsWith("/help");

  const { data: listData, isLoading } = useSWR(
    "tenant-support-dock-list",
    () =>
      getTenantSupportTickets({
        page: 1,
        pageSize: 30,
        status: "ALL",
        priority: "ALL",
        category: "ALL",
        supportLevel: "ALL",
      }),
    {
      refreshInterval: DOCK_QUEUE_POLL_MS,
      revalidateOnFocus: true,
      dedupingInterval: 1000,
    },
  );

  const activeTickets = useMemo(
    () =>
      (listData?.items ?? []).filter((ticket) => ticket.status !== TicketStatus.CLOSED),
    [listData?.items],
  );

  const openSupportPage = (ticketId: string) => {
    setIsPanelOpen(false);
    router.push(`/suporte?ticketId=${encodeURIComponent(ticketId)}`);
  };

  const handleOpenMini = (ticket: SupportTicketListItem) => {
    setOpenChatIds((previous) => [ticket.id, ...previous].slice(0, MAX_OPEN_CHATS));
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
            <TenantMiniChatWindow
              key={ticketId}
              ticketId={ticketId}
              onClose={handleCloseMini}
              onOpenSupportPage={openSupportPage}
            />
          ))}
        </div>
      ) : null}

      <div className="fixed bottom-4 right-4 z-[75]">
        {isPanelOpen ? (
          <div className="mb-3 w-[340px] rounded-2xl border border-white/10 bg-content1/95 p-3 shadow-2xl backdrop-blur-xl">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-white">Meus chats</p>
              <Button
                isIconOnly
                size="sm"
                variant="light"
                onPress={() => setIsPanelOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {isLoading ? (
              <div className="flex min-h-20 items-center justify-center">
                <Spinner size="sm" />
              </div>
            ) : activeTickets.length === 0 ? (
              <p className="rounded-lg border border-white/10 bg-background/40 p-3 text-xs text-default-400">
                Nenhum chat ativo.
              </p>
            ) : (
              <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
                {activeTickets.map((ticket) => {
                  const isOpen = openChatIds.includes(ticket.id);

                  return (
                    <div
                      key={ticket.id}
                      className="rounded-xl border border-white/10 bg-background/40 p-2"
                    >
                      <p className="truncate text-xs font-medium text-white">{ticket.title}</p>
                      <p className="truncate text-[11px] text-default-400">
                        {ticket.id.slice(-8)} · {ticket.waitingFor === "SUPPORT" ? "Aguardando suporte" : "Em andamento"}
                      </p>
                      <div className="mt-1">
                        <div className="flex flex-wrap items-center gap-1">
                          <Chip color={getStatusColor(ticket.status)} size="sm" variant="flat">
                            {getStatusLabel(ticket.status)}
                          </Chip>
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
                      </div>
                      <div className="mt-2">
                        {isOpen ? (
                          <p className="text-xs text-default-400">Aberto no dock</p>
                        ) : (
                          <Button
                            color="primary"
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
            startContent={<LifeBuoy className="h-4 w-4" />}
            onPress={() => setIsPanelOpen((current) => !current)}
          >
            Suporte
          </Button>
          {activeTickets.length > 0 ? (
            <span className="pointer-events-none absolute -right-1 -top-1 z-10 inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-content1 bg-danger px-1.5 text-[10px] font-semibold leading-none text-white shadow-lg">
              {activeTickets.length > 99 ? "99+" : activeTickets.length}
            </span>
          ) : null}
        </div>
      </div>
    </>
  );
}
