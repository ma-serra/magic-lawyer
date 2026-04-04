"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import useSWR from "swr";
import {
  Badge,
  Button,
  Chip,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  Input,
  ScrollShadow,
  Spinner,
  Textarea,
  Tooltip,
  useDisclosure,
} from "@heroui/react";
import {
  ArrowLeft,
  ExternalLink,
  LifeBuoy,
  MessageCircleMore,
  Search,
  Send,
} from "lucide-react";
import { toast } from "sonner";

import {
  addSupportMessage,
  getSupportTicketThread,
  getTenantSupportTickets,
  markSupportTicketViewed,
  type SupportTicketListItem,
} from "@/app/actions/tickets";
import { TicketStatus, UserRole } from "@/generated/prisma";

const LIST_POLL_MS = 5000;
const THREAD_POLL_MS = 3000;

function formatDateTime(value?: string | null) {
  if (!value) return "-";

  return new Date(value).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

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

function getWaitingLabel(ticket: SupportTicketListItem) {
  if (ticket.waitingFor === "SUPPORT") {
    return "Aguardando suporte";
  }

  if (ticket.waitingFor === "REQUESTER") {
    return "Resposta do suporte enviada";
  }

  return "Sem pendências";
}

function getWaitingLabelFromState(
  waitingFor: "SUPPORT" | "REQUESTER" | "NONE",
) {
  if (waitingFor === "SUPPORT") {
    return "Aguardando suporte";
  }

  if (waitingFor === "REQUESTER") {
    return "Resposta do suporte enviada";
  }

  return "Sem pendências";
}

export function NavbarSupportChat() {
  const pathname = usePathname();
  const router = useRouter();
  const disclosure = useDisclosure();
  const { data: session } = useSession();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const userRole = (session?.user as { role?: UserRole } | undefined)?.role;
  const shouldHide =
    !session?.user ||
    userRole === UserRole.SUPER_ADMIN ||
    pathname.startsWith("/admin");

  const { data: listData, isLoading: isListLoading, mutate: mutateList } = useSWR(
    disclosure.isOpen && !shouldHide ? "navbar-support-ticket-list" : null,
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
      refreshInterval: LIST_POLL_MS,
      revalidateOnFocus: true,
      dedupingInterval: 1000,
    },
  );

  const activeTickets = useMemo(
    () =>
      (listData?.items ?? []).filter(
        (ticket) => ticket.status !== TicketStatus.CLOSED,
      ),
    [listData?.items],
  );

  const unreadCount = useMemo(
    () => activeTickets.filter((ticket) => ticket.hasUnreadForRequester).length,
    [activeTickets],
  );

  const filteredTickets = useMemo(() => {
    const normalized = searchTerm.trim().toLowerCase();

    if (!normalized) {
      return activeTickets;
    }

    return activeTickets.filter((ticket) =>
      [ticket.title, ticket.id, ticket.requester.name, ticket.requester.email]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [activeTickets, searchTerm]);

  useEffect(() => {
    if (!disclosure.isOpen) {
      return;
    }

    const preferredTicket =
      activeTickets.find((ticket) => ticket.hasUnreadForRequester) ??
      activeTickets[0] ??
      null;

    if (!preferredTicket) {
      setSelectedTicketId(null);
      return;
    }

    if (!selectedTicketId) {
      setSelectedTicketId(preferredTicket.id);
      return;
    }

    const stillExists = activeTickets.some((ticket) => ticket.id === selectedTicketId);
    if (!stillExists) {
      setSelectedTicketId(preferredTicket.id);
    }
  }, [activeTickets, disclosure.isOpen, selectedTicketId]);

  const {
    data: thread,
    isLoading: isThreadLoading,
    mutate: mutateThread,
  } = useSWR(
    disclosure.isOpen && selectedTicketId && !shouldHide
      ? ["navbar-support-ticket-thread", selectedTicketId]
      : null,
    () => getSupportTicketThread(selectedTicketId!),
    {
      refreshInterval: THREAD_POLL_MS,
      revalidateOnFocus: true,
      dedupingInterval: 500,
    },
  );

  useEffect(() => {
    if (!disclosure.isOpen || !thread?.id) {
      return;
    }

    markSupportTicketViewed(thread.id).catch(() => {
      // leitura silenciosa
    });
  }, [disclosure.isOpen, thread?.id]);

  const selectedTicket =
    activeTickets.find((ticket) => ticket.id === selectedTicketId) ?? null;
  const visibleMessages = useMemo(() => thread?.messages ?? [], [thread?.messages]);
  const badgeCount = unreadCount > 0 ? unreadCount : activeTickets.length;
  const isClosed = thread?.status === TicketStatus.CLOSED;
  const canSend = draft.trim().length > 0 && !sending && !isClosed && !!thread?.id;

  const handleOpenSupportPage = () => {
    disclosure.onClose();

    if (selectedTicketId) {
      router.push(`/suporte?ticketId=${encodeURIComponent(selectedTicketId)}`);
      return;
    }

    router.push("/suporte");
  };

  const handleSend = async () => {
    if (!thread?.id || !canSend) {
      return;
    }

    setSending(true);
    try {
      await addSupportMessage(thread.id, {
        content: draft.trim(),
        isInternal: false,
      });
      setDraft("");
      await Promise.all([mutateThread(), mutateList()]);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro ao enviar mensagem";
      toast.error(message);
    } finally {
      setSending(false);
    }
  };

  if (shouldHide) {
    return null;
  }

  return (
    <>
      <Tooltip content="Chats com o suporte" placement="bottom">
        <Badge
          color={unreadCount > 0 ? "danger" : "primary"}
          content={badgeCount > 99 ? "99+" : badgeCount}
          isInvisible={badgeCount === 0}
          placement="top-right"
          shape="circle"
          size="sm"
        >
          <Button
            isIconOnly
            aria-label="Abrir chats com o suporte"
            className="h-8 w-8 min-w-8 border border-divider bg-content1 text-default-600 hover:text-primary"
            radius="full"
            size="sm"
            variant="light"
            onPress={disclosure.onOpen}
          >
            <MessageCircleMore className="h-4 w-4" />
          </Button>
        </Badge>
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
        <DrawerContent className="border-l border-white/10 bg-background/75 backdrop-blur-3xl">
          {(onClose) => (
            <>
              <DrawerHeader className="flex items-center justify-between gap-4">
                <div className="flex flex-col">
                  <span className="text-sm font-semibold uppercase tracking-[0.3em] text-primary">
                    Suporte
                  </span>
                  <h2 className="text-lg font-semibold text-white">
                    Chats do usuário
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  <Chip className="text-xs" color="primary" variant="flat">
                    {activeTickets.length} ativo(s)
                  </Chip>
                  <Chip className="text-xs" color="danger" variant="flat">
                    {unreadCount} não lido(s)
                  </Chip>
                </div>
              </DrawerHeader>

              <DrawerBody className="overflow-hidden px-0 pb-0">
                <div className="grid h-full min-h-0 grid-cols-1 gap-0 lg:grid-cols-[320px_minmax(0,1fr)]">
                  <section
                    className={`flex min-h-0 flex-col border-b border-white/10 px-4 pb-4 lg:border-b-0 lg:border-r ${
                      selectedTicketId ? "hidden lg:flex" : "flex"
                    }`}
                  >
                    <div className="pb-3 pt-1">
                      <Input
                        isClearable
                        placeholder="Buscar por título ou protocolo"
                        size="sm"
                        startContent={<Search className="h-4 w-4 text-default-400" />}
                        value={searchTerm}
                        onClear={() => setSearchTerm("")}
                        onValueChange={setSearchTerm}
                      />
                    </div>

                    {isListLoading ? (
                      <div className="flex flex-1 items-center justify-center">
                        <Spinner label="Carregando chats..." />
                      </div>
                    ) : filteredTickets.length === 0 ? (
                      <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-5 text-center">
                        <LifeBuoy className="h-8 w-8 text-default-300" />
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-white">
                            Nenhum chat ativo
                          </p>
                          <p className="text-xs text-default-400">
                            Quando houver conversa com o suporte, ela aparecerá aqui.
                          </p>
                        </div>
                        <Button color="primary" size="sm" variant="flat" onPress={handleOpenSupportPage}>
                          Abrir central de suporte
                        </Button>
                      </div>
                    ) : (
                      <ScrollShadow className="min-h-0 flex-1 pr-1">
                        <div className="space-y-2 pb-2">
                          {filteredTickets.map((ticket) => {
                            const isSelected = ticket.id === selectedTicketId;

                            return (
                              <button
                                key={ticket.id}
                                className={`w-full rounded-2xl border p-3 text-left transition ${
                                  isSelected
                                    ? "border-primary/50 bg-primary/10"
                                    : "border-white/10 bg-white/5 hover:border-primary/30 hover:bg-white/10"
                                }`}
                                type="button"
                                onClick={() => setSelectedTicketId(ticket.id)}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold text-white">
                                      {ticket.title}
                                    </p>
                                    <p className="truncate text-xs text-default-400">
                                      #{ticket.id.slice(-8)} · {ticket.requester.name}
                                    </p>
                                  </div>
                                  {ticket.hasUnreadForRequester ? (
                                    <span className="mt-1 h-2.5 w-2.5 rounded-full bg-danger" />
                                  ) : null}
                                </div>
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                  <Chip
                                    color={getStatusColor(ticket.status)}
                                    size="sm"
                                    variant="flat"
                                  >
                                    {getStatusLabel(ticket.status)}
                                  </Chip>
                                  <Chip size="sm" variant="flat">
                                    {getWaitingLabel(ticket)}
                                  </Chip>
                                </div>
                                <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-default-400">
                                  <span>{ticket.messageCount} mensagem(ns)</span>
                                  <span>{formatDateTime(ticket.updatedAt)}</span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </ScrollShadow>
                    )}
                  </section>

                  <section
                    className={`min-h-0 flex-col ${
                      selectedTicketId ? "flex" : "hidden lg:flex"
                    }`}
                  >
                    {selectedTicketId ? (
                      <>
                        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
                          <div className="flex min-w-0 items-center gap-2">
                            <Button
                              isIconOnly
                              className="lg:hidden"
                              radius="full"
                              size="sm"
                              variant="light"
                              onPress={() => setSelectedTicketId(null)}
                            >
                              <ArrowLeft className="h-4 w-4" />
                            </Button>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-white">
                                {selectedTicket?.title ?? "Chat com suporte"}
                              </p>
                              <p className="truncate text-xs text-default-400">
                                {thread
                                  ? `Atualizado em ${formatDateTime(thread.updatedAt)}`
                                  : "Carregando conversa..."}
                              </p>
                            </div>
                          </div>
                          <Button
                            color="primary"
                            size="sm"
                            startContent={<ExternalLink className="h-4 w-4" />}
                            variant="flat"
                            onPress={handleOpenSupportPage}
                          >
                            Ir para suporte
                          </Button>
                        </div>

                        {isThreadLoading || !thread ? (
                          <div className="flex flex-1 items-center justify-center">
                            <Spinner label="Carregando conversa..." />
                          </div>
                        ) : (
                          <>
                            <div className="border-b border-white/10 px-4 py-3">
                              <div className="flex flex-wrap items-center gap-2">
                                <Chip
                                  color={getStatusColor(thread.status)}
                                  size="sm"
                                  variant="flat"
                                >
                                  {getStatusLabel(thread.status)}
                                </Chip>
                                <Chip size="sm" variant="flat">
                                  {getWaitingLabelFromState(
                                    selectedTicket?.waitingFor ?? "NONE",
                                  )}
                                </Chip>
                              </div>
                              {thread.description ? (
                                <p className="mt-2 text-xs leading-6 text-default-400">
                                  {thread.description}
                                </p>
                              ) : null}
                            </div>

                            <ScrollShadow className="min-h-0 flex-1 px-4 py-4">
                              <div className="space-y-3 pb-2">
                                {visibleMessages.length === 0 ? (
                                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center text-sm text-default-400">
                                    Ainda não há mensagens neste chat.
                                  </div>
                                ) : (
                                  visibleMessages.map((message) => {
                                    const fromSupport =
                                      message.authorType === "SUPER_ADMIN" ||
                                      message.authorType === "SYSTEM";

                                    return (
                                      <div
                                        key={message.id}
                                        className={`flex ${
                                          fromSupport ? "justify-start" : "justify-end"
                                        }`}
                                      >
                                        <div
                                          className={`max-w-[88%] rounded-2xl border px-3 py-2 text-sm ${
                                            fromSupport
                                              ? "border-primary/25 bg-primary/10 text-foreground"
                                              : "border-success/25 bg-success/10 text-foreground"
                                          }`}
                                        >
                                          <p className="mb-1 text-[11px] text-default-500">
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
                            </ScrollShadow>

                            <div className="border-t border-white/10 px-4 py-4">
                              {isClosed ? (
                                <div className="mb-3 rounded-2xl border border-success/20 bg-success/10 px-3 py-2 text-xs text-success-200">
                                  Este chat foi finalizado. Se precisar retomar, use a central de suporte.
                                </div>
                              ) : null}
                              <div className="space-y-3">
                                <Textarea
                                  isDisabled={isClosed}
                                  minRows={3}
                                  placeholder={
                                    isClosed
                                      ? "Chat finalizado."
                                      : "Responder ao suporte por aqui..."
                                  }
                                  value={draft}
                                  onValueChange={setDraft}
                                />
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                  <Button
                                    size="sm"
                                    startContent={<ExternalLink className="h-4 w-4" />}
                                    variant="light"
                                    onPress={handleOpenSupportPage}
                                  >
                                    Abrir suporte completo
                                  </Button>
                                  <Button
                                    color="primary"
                                    isDisabled={!canSend}
                                    isLoading={sending}
                                    size="sm"
                                    startContent={
                                      sending ? undefined : <Send className="h-4 w-4" />
                                    }
                                    onPress={handleSend}
                                  >
                                    Enviar
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </>
                        )}
                      </>
                    ) : (
                      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                        <MessageCircleMore className="h-10 w-10 text-default-300" />
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-white">
                            Selecione um chat
                          </p>
                          <p className="text-xs text-default-400">
                            Abra uma conversa existente para responder sem sair da tela.
                          </p>
                        </div>
                      </div>
                    )}
                  </section>
                </div>
              </DrawerBody>

              <DrawerFooter className="flex items-center justify-between gap-3 border-t border-white/10 bg-background/60">
                <span className="text-xs text-default-400">
                  Conversas em tempo real com o suporte.
                </span>
                <div className="flex gap-2">
                  <Button size="sm" variant="light" onPress={handleOpenSupportPage}>
                    Abrir /suporte
                  </Button>
                  <Button size="sm" variant="light" onPress={onClose}>
                    Fechar
                  </Button>
                </div>
              </DrawerFooter>
            </>
          )}
        </DrawerContent>
      </Drawer>
    </>
  );
}
