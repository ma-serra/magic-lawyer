"use client";

import {
  use,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { useSession } from "next-auth/react";
import {
  Button,
  Chip,
  Divider,
  Select,
  SelectItem,
  Spinner,
  Switch,
  Textarea,
} from "@heroui/react";
import { UploadProgress } from "@/components/ui/upload-progress";
import {
  ArrowLeft,
  ImagePlus,
  MessageSquare,
  UserRoundCheck,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  addSupportMessage,
  addSupportMessageWithImages,
  claimSupportTicket,
  finalizeSupportTicket,
  getSupportTicketThread,
  markSupportTicketViewed,
} from "@/app/actions/tickets";
import {
  TicketCategory,
  TicketPriority,
  TicketResolutionOutcome,
  TicketStatus,
} from "@/generated/prisma";

const THREAD_POLL_INTERVAL_MS = 2500;
const MAX_IMAGES_PER_BATCH = 5;
const CATEGORY_OPTIONS: Array<{ key: TicketCategory; label: string }> = [
  { key: TicketCategory.TECHNICAL, label: "Técnico" },
  { key: TicketCategory.BILLING, label: "Financeiro" },
  { key: TicketCategory.FEATURE_REQUEST, label: "Solicitação de melhoria" },
  { key: TicketCategory.BUG_REPORT, label: "Bug" },
  { key: TicketCategory.GENERAL, label: "Geral" },
];
const RESOLUTION_OUTCOME_OPTIONS: Array<{
  key: TicketResolutionOutcome;
  label: string;
}> = [
  { key: TicketResolutionOutcome.RESOLVED, label: "Resolvido" },
  {
    key: TicketResolutionOutcome.PARTIALLY_RESOLVED,
    label: "Parcialmente resolvido",
  },
  { key: TicketResolutionOutcome.UNRESOLVED, label: "Não resolvido" },
];

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

function getPriorityLabel(priority: TicketPriority): string {
  switch (priority) {
    case TicketPriority.LOW:
      return "Baixa";
    case TicketPriority.MEDIUM:
      return "Média";
    case TicketPriority.HIGH:
      return "Alta";
    case TicketPriority.URGENT:
      return "Urgente";
    default:
      return priority;
  }
}

function getCategoryLabel(category: TicketCategory): string {
  return (
    CATEGORY_OPTIONS.find((option) => option.key === category)?.label ??
    category
  );
}

function getPriorityColor(priority: TicketPriority) {
  switch (priority) {
    case TicketPriority.LOW:
      return "default" as const;
    case TicketPriority.MEDIUM:
      return "primary" as const;
    case TicketPriority.HIGH:
      return "warning" as const;
    case TicketPriority.URGENT:
      return "danger" as const;
    default:
      return "default" as const;
  }
}

function formatDateTime(value?: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleString("pt-BR");
}

function formatElapsedTime(from?: string | null, to?: string | null): string {
  if (!from) return "-";

  const start = new Date(from).getTime();
  const end = to ? new Date(to).getTime() : Date.now();

  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return "-";
  }

  const seconds = Math.floor((end - start) / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const restSeconds = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${restSeconds}s`;
  }

  if (minutes > 0) {
    return `${minutes}m ${restSeconds}s`;
  }

  return `${restSeconds}s`;
}

function isSupportMessage(authorType: string): boolean {
  return authorType === "SUPER_ADMIN" || authorType === "SYSTEM";
}

function resolveReturnTo(value: string | null): string {
  if (!value) return "/admin/suporte";

  if (value.startsWith("/") && !value.startsWith("//")) {
    return value;
  }

  return "/admin/suporte";
}

export default function AdminSuporteChatFullscreenPage({
  params,
}: {
  params: Promise<{ ticketId: string }>;
}) {
  const resolvedParams = use(params);
  const ticketId = resolvedParams.ticketId;
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const currentSuperAdminId = String((session?.user as any)?.id ?? "");
  const returnTo = useMemo(
    () => resolveReturnTo(searchParams.get("returnTo")),
    [searchParams],
  );

  const replyImagesInputRef = useRef<HTMLInputElement | null>(null);
  const [reply, setReply] = useState("");
  const [replyImages, setReplyImages] = useState<File[]>([]);
  const [isInternalReply, setIsInternalReply] = useState(false);
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [closureCategoryDraft, setClosureCategoryDraft] =
    useState<TicketCategory | null>(null);
  const [resolutionOutcomeDraft, setResolutionOutcomeDraft] =
    useState<TicketResolutionOutcome>(TicketResolutionOutcome.RESOLVED);
  const [closureSummaryDraft, setClosureSummaryDraft] = useState("");
  const [clockTick, setClockTick] = useState(Date.now());

  const { data: ticket, isLoading, mutate } = useSWR(
    ["admin-support-fullscreen-thread", ticketId],
    () => getSupportTicketThread(ticketId),
    {
      refreshInterval: THREAD_POLL_INTERVAL_MS,
      revalidateOnFocus: true,
      dedupingInterval: 500,
    },
  );

  useEffect(() => {
    const interval = window.setInterval(() => {
      setClockTick(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!ticket?.id) return;

    markSupportTicketViewed(ticket.id).catch(() => {
      // silencioso
    });
  }, [ticket?.id]);

  useEffect(() => {
    if (!ticket?.id) return;

    setClosureCategoryDraft(ticket.closureCategory ?? ticket.category);
    setResolutionOutcomeDraft(
      ticket.resolutionOutcome ?? TicketResolutionOutcome.RESOLVED,
    );
    setClosureSummaryDraft(ticket.closureSummary ?? "");
  }, [ticket?.id, ticket?.category, ticket?.closureCategory, ticket?.resolutionOutcome, ticket?.closureSummary]);

  const isClosed = ticket?.status === TicketStatus.CLOSED;
  const assignedToAnotherAgent =
    ticket?.assignedTo?.id &&
    currentSuperAdminId &&
    ticket.assignedTo.id !== currentSuperAdminId;

  const appendImages = (event: ChangeEvent<HTMLInputElement>) => {
    const incoming = Array.from(event.target.files ?? []);

    if (!incoming.length) return;

    setReplyImages((current) => {
      const merged = [...current, ...incoming].slice(0, MAX_IMAGES_PER_BATCH);

      if (current.length + incoming.length > MAX_IMAGES_PER_BATCH) {
        toast.warning(`Limite de ${MAX_IMAGES_PER_BATCH} imagens por envio.`);
      }

      return merged;
    });

    event.target.value = "";
  };

  const handleClaim = async () => {
    if (!ticket?.id) return;

    setIsClaiming(true);
    try {
      const result = await claimSupportTicket(ticket.id);

      if (result.claimed) {
        toast.success("Chat assumido por você.");
      } else if (result.assignedToName) {
        toast.warning(`Chat já assumido por ${result.assignedToName}.`);
      } else {
        toast.warning("Chat já foi assumido por outro agente.");
      }

      await mutate();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro ao assumir chat";
      toast.error(message);
    } finally {
      setIsClaiming(false);
    }
  };

  const handleSendReply = async () => {
    if (!ticket?.id) return;

    if (ticket.status === TicketStatus.CLOSED) {
      toast.error("Chat finalizado. Mensagens bloqueadas.");
      return;
    }

    if (!reply.trim() && replyImages.length === 0) {
      toast.error("Digite uma mensagem ou envie uma imagem.");
      return;
    }

    setIsSendingReply(true);
    try {
      if (replyImages.length > 0) {
        const formData = new FormData();
        formData.append("content", reply);
        formData.append("isInternal", String(isInternalReply));
        replyImages.forEach((file) => formData.append("images", file));
        await addSupportMessageWithImages(ticket.id, formData);
      } else {
        await addSupportMessage(ticket.id, {
          content: reply,
          isInternal: isInternalReply,
        });
      }

      setReply("");
      setReplyImages([]);
      setIsInternalReply(false);
      await mutate();
      toast.success("Resposta enviada.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao enviar";
      toast.error(message);
    } finally {
      setIsSendingReply(false);
    }
  };

  const handleFinalizeTicket = async () => {
    if (!ticket?.id) return;

    if (isClosed) {
      toast.warning("Este ticket já está encerrado.");
      return;
    }

    if (!closureCategoryDraft) {
      toast.error("Selecione a categoria de fechamento.");
      return;
    }

    if (!resolutionOutcomeDraft) {
      toast.error("Selecione o desfecho do atendimento.");
      return;
    }

    setIsFinalizing(true);
    try {
      await finalizeSupportTicket(ticket.id, {
        closureCategory: closureCategoryDraft,
        resolutionOutcome: resolutionOutcomeDraft,
        closureSummary: closureSummaryDraft.trim() || undefined,
      });
      await mutate();
      toast.success("Atendimento finalizado e chat bloqueado.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro ao finalizar atendimento";
      toast.error(message);
    } finally {
      setIsFinalizing(false);
    }
  };

  if (isLoading) {
    return (
      <section className="space-y-4">
        <div className="flex min-h-[50vh] items-center justify-center">
          <Spinner label="Carregando chat..." />
        </div>
      </section>
    );
  }

  if (!ticket) {
    return (
      <section className="space-y-4">
        <div className="rounded-xl border border-danger/30 bg-danger/10 p-4">
          <p className="text-sm font-semibold text-danger-200">Chat não encontrado</p>
          <p className="mt-1 text-xs text-danger-100">
            Este ticket pode ter sido removido ou você perdeu acesso.
          </p>
          <Button
            className="mt-3"
            color="primary"
            startContent={<ArrowLeft className="h-4 w-4" />}
            onPress={() => router.push(returnTo)}
          >
            Voltar
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-content1/80 p-4 shadow-lg">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold text-white">{ticket.title}</p>
            <p className="truncate text-xs text-default-400">
              #{ticket.id} · {ticket.tenant.name} · {ticket.requester.email}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1">
              <Chip color={getStatusColor(ticket.status)} size="sm" variant="flat">
                {getStatusLabel(ticket.status)}
              </Chip>
              <Chip color={getPriorityColor(ticket.priority)} size="sm" variant="flat">
                {getPriorityLabel(ticket.priority)}
              </Chip>
              <Chip size="sm" variant="bordered">
                {ticket.supportLevel}
              </Chip>
              {ticket.assignedTo?.id === currentSuperAdminId ? (
                <Chip color="success" size="sm" variant="flat">
                  Em atendimento por você
                </Chip>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {ticket.assignedTo === null && !isClosed ? (
              <Button
                color="primary"
                isLoading={isClaiming}
                startContent={isClaiming ? undefined : <UserRoundCheck className="h-4 w-4" />}
                variant="flat"
                onPress={handleClaim}
              >
                Assumir chat
              </Button>
            ) : null}
            <Button
              startContent={<ArrowLeft className="h-4 w-4" />}
              variant="flat"
              onPress={() => router.push(returnTo)}
            >
              Voltar
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 rounded-xl border border-white/10 bg-background/40 p-3 text-xs text-default-300 sm:grid-cols-4">
        <div>
          <p className="uppercase tracking-[0.16em] text-default-500">Abertura</p>
          <p>{formatDateTime(ticket.createdAt)}</p>
        </div>
        <div>
          <p className="uppercase tracking-[0.16em] text-default-500">Atualizado</p>
          <p>{formatDateTime(ticket.updatedAt)}</p>
        </div>
        <div>
          <p className="uppercase tracking-[0.16em] text-default-500">SLA 1ª resposta</p>
          <p>{formatDateTime(ticket.firstResponseDueAt)}</p>
        </div>
        <div>
          <p className="uppercase tracking-[0.16em] text-default-500">Tempo de atendimento</p>
          <p key={clockTick}>{formatElapsedTime(ticket.createdAt, ticket.closedAt)}</p>
        </div>
      </div>

      {ticket.status === TicketStatus.CLOSED ? (
        <div className="rounded-xl border border-success/30 bg-success/10 p-3 text-sm text-success-200">
          <p className="font-semibold text-success-100">Chat finalizado</p>
          <p className="mt-1 text-xs text-success-200">
            Finalizado em {formatDateTime(ticket.closedAt)} por{" "}
            {ticket.closedBy?.name ?? "suporte"}.
          </p>
          {ticket.resolutionOutcome ? (
            <p className="mt-1 text-xs text-success-200">
              Desfecho:{" "}
              {RESOLUTION_OUTCOME_OPTIONS.find(
                (option) => option.key === ticket.resolutionOutcome,
              )?.label ?? ticket.resolutionOutcome}
              {ticket.closureCategory
                ? ` · Categoria: ${getCategoryLabel(ticket.closureCategory)}`
                : ""}
            </p>
          ) : null}
          {ticket.closureSummary ? (
            <p className="mt-1 whitespace-pre-wrap text-xs text-success-100">
              Resumo: {ticket.closureSummary}
            </p>
          ) : null}
        </div>
      ) : null}

      {assignedToAnotherAgent ? (
        <div className="rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm text-warning-100">
          Este chat está atribuído para{" "}
          <span className="font-semibold">{ticket.assignedTo?.name}</span>.
          Você ainda pode acompanhar a conversa.
        </div>
      ) : null}

      <div className="rounded-xl border border-white/10 bg-background/40 p-3">
        <div className="max-h-[50vh] space-y-3 overflow-y-auto pr-1">
          {ticket.messages.length === 0 ? (
            <div className="py-8 text-center text-sm text-default-400">
              Ainda não há mensagens neste ticket.
            </div>
          ) : (
            ticket.messages.map((message) => {
              const fromSupport = isSupportMessage(message.authorType);

              return (
                <div
                  key={message.id}
                  className={`flex ${fromSupport ? "justify-start" : "justify-end"}`}
                >
                  <div
                    className={`w-full max-w-4xl rounded-xl border p-3 ${
                      fromSupport
                        ? "border-primary/40 bg-primary/10"
                        : "border-success/40 bg-success/10"
                    }`}
                  >
                    <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-semibold text-foreground">
                        {message.author.name}
                      </span>
                      <span className="text-default-600">
                        {formatDateTime(message.createdAt)}
                      </span>
                      {message.isInternal ? (
                        <Chip color="warning" size="sm" variant="flat">
                          Interna
                        </Chip>
                      ) : null}
                    </div>
                    <p className="break-words whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                      {message.content}
                    </p>
                    {message.attachments.length > 0 ? (
                      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {message.attachments.map((attachment) => (
                          <a
                            key={attachment.id}
                            className="block overflow-hidden rounded-lg border border-white/10"
                            href={attachment.url}
                            rel="noreferrer"
                            target="_blank"
                          >
                            <img
                              alt={attachment.originalName}
                              className="h-24 w-full object-cover"
                              loading="lazy"
                              src={attachment.url}
                            />
                          </a>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="rounded-xl border border-warning/25 bg-warning/10 p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-warning-200">
          Fechar atendimento
        </p>
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
          <Select
            isDisabled={isClosed}
            label="Categoria de fechamento"
            selectedKeys={closureCategoryDraft ? [closureCategoryDraft] : []}
            onSelectionChange={(keys) =>
              setClosureCategoryDraft(
                (Array.from(keys)[0] as TicketCategory) ?? ticket.category,
              )
            }
          >
            {CATEGORY_OPTIONS.map((option) => (
              <SelectItem key={option.key} textValue={option.label}>
                {option.label}
              </SelectItem>
            ))}
          </Select>
          <Select
            isDisabled={isClosed}
            label="Desfecho"
            selectedKeys={[resolutionOutcomeDraft]}
            onSelectionChange={(keys) =>
              setResolutionOutcomeDraft(
                (Array.from(keys)[0] as TicketResolutionOutcome) ??
                  TicketResolutionOutcome.RESOLVED,
              )
            }
          >
            {RESOLUTION_OUTCOME_OPTIONS.map((option) => (
              <SelectItem key={option.key} textValue={option.label}>
                {option.label}
              </SelectItem>
            ))}
          </Select>
          <Button
            className="self-end"
            color="success"
            isDisabled={isClosed}
            isLoading={isFinalizing}
            onPress={handleFinalizeTicket}
          >
            Finalizar atendimento
          </Button>
        </div>
        <Textarea
          className="mt-2"
          description="Resumo opcional para auditoria e contexto de fechamento."
          isDisabled={isClosed}
          label="Resumo do fechamento"
          minRows={2}
          placeholder="Ex.: cliente orientado, erro corrigido e validação concluída."
          value={closureSummaryDraft}
          onValueChange={setClosureSummaryDraft}
        />
      </div>

      <div className="space-y-3 rounded-xl border border-white/10 bg-background/40 p-3">
        <input
          ref={replyImagesInputRef}
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          multiple
          type="file"
          onChange={appendImages}
        />
        <Textarea
          isDisabled={isClosed}
          minRows={4}
          placeholder={
            isClosed ? "Chat finalizado. Mensagens bloqueadas." : "Responder ticket"
          }
          value={reply}
          onValueChange={setReply}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            isDisabled={isClosed}
            size="sm"
            startContent={<ImagePlus className="h-4 w-4" />}
            variant="flat"
            onPress={() => replyImagesInputRef.current?.click()}
          >
            Anexar imagens
          </Button>
          <p className="text-xs text-default-500">
            Até {MAX_IMAGES_PER_BATCH} imagens por envio
          </p>
        </div>
        {replyImages.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {replyImages.map((file, index) => (
              <div
                key={`${file.name}-${index}`}
                className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-background/60 px-2 py-1"
              >
                <p className="truncate text-xs text-default-300">{file.name}</p>
                <Button
                  isIconOnly
                  size="sm"
                  variant="light"
                  onPress={() =>
                    setReplyImages((current) =>
                      current.filter((_, currentIndex) => currentIndex !== index),
                    )
                  }
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        ) : null}
        {isSendingReply && replyImages.length > 0 ? (
          <UploadProgress
            label="Enviando imagens da resposta"
            description="As imagens estão sendo anexadas ao ticket deste atendimento."
          />
        ) : null}
        <Divider className="border-white/10" />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Switch
            isDisabled={isClosed}
            isSelected={isInternalReply}
            size="sm"
            onValueChange={setIsInternalReply}
          >
            Mensagem interna da equipe
          </Switch>
          <Button
            color="primary"
            isDisabled={isClosed}
            isLoading={isSendingReply}
            startContent={
              isSendingReply ? undefined : <MessageSquare className="h-4 w-4" />
            }
            onPress={handleSendReply}
          >
            Enviar resposta
          </Button>
        </div>
      </div>
    </section>
  );
}
