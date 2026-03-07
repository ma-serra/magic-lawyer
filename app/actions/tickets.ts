"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/auth";
import prisma from "@/app/lib/prisma";
import { UploadService } from "@/lib/upload-service";
import {
  Prisma,
  TicketCategory,
  TicketMessageAuthorType,
  TicketPriority,
  TicketResolutionOutcome,
  TicketStatus,
  TicketSupportLevel,
} from "@/generated/prisma";

const FIRST_RESPONSE_SLA_MINUTES: Record<TicketPriority, number> = {
  LOW: 24 * 60,
  MEDIUM: 4 * 60,
  HIGH: 60,
  URGENT: 15,
};

const TENANT_SUPPORT_ALLOWED_ROLES = new Set(["ADMIN"]);
const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  [TicketStatus.OPEN]: "Aberto",
  [TicketStatus.IN_PROGRESS]: "Em andamento",
  [TicketStatus.WAITING_CUSTOMER]: "Aguardando cliente",
  [TicketStatus.WAITING_EXTERNAL]: "Aguardando terceiro",
  [TicketStatus.RESOLVED]: "Resolvido",
  [TicketStatus.CLOSED]: "Encerrado",
};
const TICKET_CATEGORY_LABELS: Record<TicketCategory, string> = {
  [TicketCategory.TECHNICAL]: "Técnico",
  [TicketCategory.BILLING]: "Financeiro",
  [TicketCategory.FEATURE_REQUEST]: "Solicitação de melhoria",
  [TicketCategory.BUG_REPORT]: "Bug",
  [TicketCategory.GENERAL]: "Geral",
};
const TICKET_RESOLUTION_OUTCOME_LABELS: Record<TicketResolutionOutcome, string> =
  {
    [TicketResolutionOutcome.RESOLVED]: "Resolvido",
    [TicketResolutionOutcome.PARTIALLY_RESOLVED]: "Parcialmente resolvido",
    [TicketResolutionOutcome.UNRESOLVED]: "Não resolvido",
  };
const SUPPORT_MAX_IMAGES_PER_BATCH = 5;
const SUPPORT_MAX_IMAGE_SIZE_BYTES = 8 * 1024 * 1024;
const SUPPORT_IMAGE_ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const SUPPORT_IMAGE_ALLOWED_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif",
]);

function normalizePage(value?: number): number {
  if (!value || value < 1) return 1;

  return Math.floor(value);
}

function normalizePageSize(value?: number): number {
  if (!value || value < 1) return 12;

  return Math.min(Math.floor(value), 50);
}

function fullName(firstName?: string | null, lastName?: string | null): string {
  const name = `${firstName ?? ""} ${lastName ?? ""}`.trim();

  return name.length > 0 ? name : "Sem nome";
}

function computeFirstResponseDueAt(
  createdAt: Date,
  priority: TicketPriority,
): Date {
  const minutes = FIRST_RESPONSE_SLA_MINUTES[priority];

  return new Date(createdAt.getTime() + minutes * 60 * 1000);
}

function diffMinutes(start: Date, end: Date): number {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

function isSupportAuthor(authorType: TicketMessageAuthorType): boolean {
  return (
    authorType === TicketMessageAuthorType.SUPER_ADMIN ||
    authorType === TicketMessageAuthorType.SYSTEM
  );
}

function isRequesterAuthor(authorType: TicketMessageAuthorType): boolean {
  return (
    authorType === TicketMessageAuthorType.TENANT_USER ||
    authorType === TicketMessageAuthorType.TENANT_ADMIN
  );
}

function getTenantUserRoleLabel(role: string): string {
  switch (role) {
    case "ADMIN":
      return "Admin do tenant";
    case "ADVOGADO":
      return "Advogado";
    case "SECRETARIA":
      return "Secretaria";
    case "FINANCEIRO":
      return "Financeiro";
    case "CLIENTE":
      return "Cliente";
    default:
      return "Usuário";
  }
}

interface AuthContext {
  userId: string;
  role: string;
  tenantId: string | null;
  tenantSlug: string | null;
  isSuperAdmin: boolean;
  canManageTenantSupport: boolean;
}

async function getAuthContext(): Promise<AuthContext> {
  const session = await getServerSession(authOptions);
  const role = String((session?.user as any)?.role ?? "");
  const userId = String(session?.user?.id ?? "");
  const tenantId = (session?.user as any)?.tenantId ?? null;
  const tenantSlug = String((session?.user as any)?.tenantSlug ?? "") || null;

  if (!session?.user || !userId) {
    throw new Error("Usuário não autenticado");
  }

  const isSuperAdmin = role === "SUPER_ADMIN";

  if (!isSuperAdmin && !tenantId) {
    throw new Error("Usuário sem tenant associado");
  }

  return {
    userId,
    role,
    tenantId,
    tenantSlug,
    isSuperAdmin,
    canManageTenantSupport: TENANT_SUPPORT_ALLOWED_ROLES.has(role),
  };
}

function parseTicketPriority(value: string | null): TicketPriority {
  if (!value) return TicketPriority.MEDIUM;

  if (Object.values(TicketPriority).includes(value as TicketPriority)) {
    return value as TicketPriority;
  }

  return TicketPriority.MEDIUM;
}

function parseTicketCategory(value: string | null): TicketCategory {
  if (!value) return TicketCategory.GENERAL;

  if (Object.values(TicketCategory).includes(value as TicketCategory)) {
    return value as TicketCategory;
  }

  return TicketCategory.GENERAL;
}

function ensureSupportedImage(file: File) {
  if (!(file instanceof File)) {
    throw new Error("Arquivo inválido");
  }

  const mimeType = file.type?.toLowerCase() || "";
  const extension = file.name.split(".").pop()?.toLowerCase() || "";

  const validByMime = SUPPORT_IMAGE_ALLOWED_MIME.has(mimeType);
  const validByExtension = SUPPORT_IMAGE_ALLOWED_EXTENSIONS.has(extension);

  if (!validByMime && !validByExtension) {
    throw new Error("Apenas imagens JPG, PNG, WEBP ou GIF são permitidas");
  }

  if (file.size > SUPPORT_MAX_IMAGE_SIZE_BYTES) {
    throw new Error("Cada imagem pode ter no máximo 8MB");
  }
}

function sanitizeAttachmentFileName(fileName: string, fallback: string): string {
  const cleaned = fileName.trim();

  if (!cleaned) return fallback;

  return cleaned
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
}

async function resolveTenantSlug(
  tenantId: string,
  preferred?: string | null,
): Promise<string> {
  if (preferred) {
    return preferred;
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { slug: true },
  });

  return tenant?.slug || "tenant";
}

async function uploadTicketImageAttachments(params: {
  ticketId: string;
  ticketMessageId: string | null;
  tenantSlug: string;
  uploaderUserId?: string | null;
  uploaderSuperAdminId?: string | null;
  files: File[];
}): Promise<void> {
  const {
    ticketId,
    ticketMessageId,
    tenantSlug,
    uploaderUserId = null,
    uploaderSuperAdminId = null,
    files,
  } = params;

  if (!files.length) return;

  if (files.length > SUPPORT_MAX_IMAGES_PER_BATCH) {
    throw new Error(
      `Limite de ${SUPPORT_MAX_IMAGES_PER_BATCH} imagens por envio`,
    );
  }

  for (const file of files) {
    ensureSupportedImage(file);
  }

  const uploadService = UploadService.getInstance();
  const uploaderId = uploaderUserId || uploaderSuperAdminId || "system";

  const uploadedRecords: Array<{
    filename: string;
    originalName: string;
    mimeType: string;
    size: number;
    url: string;
  }> = [];

  for (const file of files) {
    const originalName = sanitizeAttachmentFileName(
      file.name,
      `imagem_${Date.now()}.jpg`,
    );
    const filename = sanitizeAttachmentFileName(
      originalName.replace(/\.[a-z0-9]+$/i, ""),
      `imagem_${Date.now()}`,
    );
    const buffer = Buffer.from(await file.arrayBuffer());

    const uploadResult = await uploadService.uploadStructuredDocument(
      buffer,
      uploaderId,
      originalName,
      {
        tenantSlug,
        categoria: "outros",
        referencia: {
          id: ticketId,
          etiqueta: `ticket-${ticketId}`,
        },
        subpastas: ["suporte", "tickets", ticketId, "imagens"],
        fileName: filename,
        resourceType: "image",
        contentType: file.type || undefined,
        tags: [
          "support",
          "ticket",
          ticketId,
          ticketMessageId ? "chat" : "ticket_inicial",
        ],
      },
    );

    if (!uploadResult.success || !uploadResult.url) {
      throw new Error(uploadResult.error || "Erro ao enviar imagem");
    }

    uploadedRecords.push({
      filename,
      originalName,
      mimeType: file.type || "image/*",
      size: file.size,
      url: uploadResult.url,
    });
  }

  await prisma.ticketAttachment.createMany({
    data: uploadedRecords.map((record) => ({
      ticketId,
      ticketMessageId,
      userId: uploaderUserId,
      superAdminId: uploaderSuperAdminId,
      filename: record.filename,
      originalName: record.originalName,
      mimeType: record.mimeType,
      size: record.size,
      url: record.url,
    })),
  });
}

function ensureTenantAccess(context: AuthContext) {
  if (context.isSuperAdmin) {
    throw new Error("Ação disponível apenas para usuários de tenant");
  }
}

function ensureSuperAdminAccess(context: AuthContext) {
  if (!context.isSuperAdmin) {
    throw new Error("Ação disponível apenas para super admin");
  }
}

function revalidateSupportPaths() {
  revalidatePath("/suporte");
  revalidatePath("/help");
  revalidatePath("/admin/suporte");
}

export interface CreateTicketData {
  title: string;
  description?: string;
  priority?: TicketPriority;
  category?: TicketCategory;
}

export interface CreateMessageData {
  content: string;
  isInternal?: boolean;
}

export interface FinalizeSupportTicketData {
  closureCategory: TicketCategory;
  resolutionOutcome: TicketResolutionOutcome;
  closureSummary?: string | null;
}

export interface RateSupportTicketData {
  rating: number;
  comment?: string | null;
}

export interface SupportTicketFilters {
  page?: number;
  pageSize?: number;
  query?: string;
  status?: TicketStatus | "ALL";
  priority?: TicketPriority | "ALL";
  category?: TicketCategory | "ALL";
  supportLevel?: TicketSupportLevel | "ALL";
  mineOnly?: boolean;
}

export interface GlobalSupportTicketFilters extends SupportTicketFilters {
  tenantId?: string | "ALL";
  assignedToMe?: boolean;
  assignedOnly?: boolean;
}

export interface SupportTicketParticipant {
  id: string;
  name: string;
  roleLabel: string;
  type: "SUPPORT" | "TENANT_USER" | "CLIENT";
}

export interface SupportTicketListItem {
  id: string;
  title: string;
  description: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  category: TicketCategory;
  supportLevel: TicketSupportLevel;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  closureCategory: TicketCategory | null;
  resolutionOutcome: TicketResolutionOutcome | null;
  closureSummary: string | null;
  requesterRating: number | null;
  requesterRatedAt: string | null;
  firstResponseAt: string | null;
  firstResponseDueAt: string | null;
  firstResponseMinutes: number | null;
  slaBreached: boolean;
  waitingFor: "SUPPORT" | "REQUESTER" | "NONE";
  hasUnreadForRequester: boolean;
  hasUnreadForSupport: boolean;
  messageCount: number;
  attachmentCount: number;
  tenant: {
    id: string;
    name: string;
    slug: string;
  };
  requester: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  assignedTo: {
    id: string;
    name: string;
    email: string;
  } | null;
  participants: SupportTicketParticipant[];
}

export interface SupportTicketListResult {
  items: SupportTicketListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface SupportTicketMessageItem {
  id: string;
  content: string;
  isInternal: boolean;
  authorType: TicketMessageAuthorType;
  createdAt: string;
  updatedAt: string;
  readByRequesterAt: string | null;
  readBySupportAt: string | null;
  author: {
    id: string | null;
    name: string;
    email: string | null;
    type: "USER" | "SUPER_ADMIN" | "SYSTEM";
  };
  attachments: Array<{
    id: string;
    filename: string;
    originalName: string;
    mimeType: string;
    size: number;
    url: string;
    createdAt: string;
  }>;
}

export interface SupportTicketThread {
  id: string;
  title: string;
  description: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  category: TicketCategory;
  supportLevel: TicketSupportLevel;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  closureCategory: TicketCategory | null;
  resolutionOutcome: TicketResolutionOutcome | null;
  closureSummary: string | null;
  requesterRating: number | null;
  requesterRatingComment: string | null;
  requesterRatedAt: string | null;
  firstResponseAt: string | null;
  firstResponseDueAt: string | null;
  firstResponseMinutes: number | null;
  requesterLastViewedAt: string | null;
  supportLastViewedAt: string | null;
  tenant: {
    id: string;
    name: string;
    slug: string;
  };
  requester: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  assignedTo: {
    id: string;
    name: string;
    email: string;
  } | null;
  closedBy: {
    id: string;
    name: string;
    email: string;
  } | null;
  attachments: Array<{
    id: string;
    filename: string;
    originalName: string;
    mimeType: string;
    size: number;
    url: string;
    ticketMessageId: string | null;
    createdAt: string;
  }>;
  messages: SupportTicketMessageItem[];
}

export interface SupportTicketStats {
  total: number;
  open: number;
  inProgress: number;
  resolved: number;
  closed: number;
  pendingSupport: number;
  pendingRequester: number;
  slaBreached: number;
  avgFirstResponseMinutes: number;
}

function mapTicketListItem(
  ticket: {
    id: string;
    title: string;
    description: string | null;
    status: TicketStatus;
    priority: TicketPriority;
    category: TicketCategory;
    supportLevel: TicketSupportLevel;
    createdAt: Date;
    updatedAt: Date;
    closedAt: Date | null;
    closureCategory: TicketCategory | null;
    resolutionOutcome: TicketResolutionOutcome | null;
    closureSummary: string | null;
    requesterRating: number | null;
    requesterRatedAt: Date | null;
    firstResponseAt: Date | null;
    requesterLastViewedAt: Date | null;
    supportLastViewedAt: Date | null;
    user: {
      id: string;
      firstName: string | null;
      lastName: string | null;
      email: string;
      role: string;
    };
    tenant: {
      id: string;
      name: string;
      slug: string;
    };
    assignedToSuperAdmin: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
    } | null;
    messages: Array<{
      id: string;
      createdAt: Date;
      authorType: TicketMessageAuthorType;
      isInternal: boolean;
      user: {
        id: string;
        firstName: string | null;
        lastName: string | null;
        role: string;
      } | null;
      superAdmin: {
        id: string;
        firstName: string;
        lastName: string;
      } | null;
    }>;
    _count: {
      messages: number;
      attachments: number;
    };
  },
  now: Date,
): SupportTicketListItem {
  const firstResponseDueAt = computeFirstResponseDueAt(
    ticket.createdAt,
    ticket.priority,
  );

  const firstResponseMinutes = ticket.firstResponseAt
    ? diffMinutes(ticket.createdAt, ticket.firstResponseAt)
    : null;

  const latestMessage = ticket.messages[0] ?? null;

  let waitingFor: "SUPPORT" | "REQUESTER" | "NONE" = "SUPPORT";

  if (
    ticket.status === TicketStatus.CLOSED ||
    ticket.status === TicketStatus.RESOLVED
  ) {
    waitingFor = "NONE";
  } else if (ticket.status === TicketStatus.WAITING_CUSTOMER) {
    waitingFor = "REQUESTER";
  } else if (ticket.status === TicketStatus.WAITING_EXTERNAL) {
    waitingFor = "NONE";
  } else if (latestMessage) {
    if (latestMessage.isInternal && isSupportAuthor(latestMessage.authorType)) {
      waitingFor = "SUPPORT";
    } else {
      waitingFor = isSupportAuthor(latestMessage.authorType)
        ? "REQUESTER"
        : "SUPPORT";
    }
  }

  const hasUnreadForRequester = Boolean(
    latestMessage &&
      isSupportAuthor(latestMessage.authorType) &&
      !latestMessage.isInternal &&
      (!ticket.requesterLastViewedAt ||
        ticket.requesterLastViewedAt < latestMessage.createdAt),
  );

  const hasUnreadForSupport = Boolean(
    latestMessage &&
      isRequesterAuthor(latestMessage.authorType) &&
      (!ticket.supportLastViewedAt ||
        ticket.supportLastViewedAt < latestMessage.createdAt),
  );

  const slaBreached = ticket.firstResponseAt
    ? ticket.firstResponseAt > firstResponseDueAt
    : (ticket.status === TicketStatus.OPEN ||
        ticket.status === TicketStatus.IN_PROGRESS ||
        ticket.status === TicketStatus.WAITING_CUSTOMER ||
        ticket.status === TicketStatus.WAITING_EXTERNAL) &&
      now > firstResponseDueAt;

  const participantsById = new Map<string, SupportTicketParticipant>();
  const addParticipant = (participant: SupportTicketParticipant) => {
    if (!participantsById.has(participant.id)) {
      participantsById.set(participant.id, participant);
    }
  };

  const requesterName = fullName(ticket.user.firstName, ticket.user.lastName);
  const requesterType: SupportTicketParticipant["type"] =
    ticket.user.role === "CLIENTE" ? "CLIENT" : "TENANT_USER";

  addParticipant({
    id: `tenant:${ticket.user.id}`,
    name: requesterName,
    roleLabel: getTenantUserRoleLabel(ticket.user.role),
    type: requesterType,
  });

  if (ticket.assignedToSuperAdmin) {
    addParticipant({
      id: `support:${ticket.assignedToSuperAdmin.id}`,
      name: fullName(
        ticket.assignedToSuperAdmin.firstName,
        ticket.assignedToSuperAdmin.lastName,
      ),
      roleLabel: "Suporte",
      type: "SUPPORT",
    });
  }

  for (const message of ticket.messages) {
    if (message.superAdmin) {
      addParticipant({
        id: `support:${message.superAdmin.id}`,
        name: fullName(message.superAdmin.firstName, message.superAdmin.lastName),
        roleLabel: "Suporte",
        type: "SUPPORT",
      });
      continue;
    }

    if (message.user) {
      const participantType: SupportTicketParticipant["type"] =
        message.user.role === "CLIENTE" ? "CLIENT" : "TENANT_USER";

      addParticipant({
        id: `tenant:${message.user.id}`,
        name: fullName(message.user.firstName, message.user.lastName),
        roleLabel: getTenantUserRoleLabel(message.user.role),
        type: participantType,
      });
    }
  }

  return {
    id: ticket.id,
    title: ticket.title,
    description: ticket.description,
    status: ticket.status,
    priority: ticket.priority,
    category: ticket.category,
    supportLevel: ticket.supportLevel,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
    closedAt: ticket.closedAt ? ticket.closedAt.toISOString() : null,
    closureCategory: ticket.closureCategory,
    resolutionOutcome: ticket.resolutionOutcome,
    closureSummary: ticket.closureSummary,
    requesterRating: ticket.requesterRating,
    requesterRatedAt: ticket.requesterRatedAt
      ? ticket.requesterRatedAt.toISOString()
      : null,
    firstResponseAt: ticket.firstResponseAt
      ? ticket.firstResponseAt.toISOString()
      : null,
    firstResponseDueAt: firstResponseDueAt.toISOString(),
    firstResponseMinutes,
    slaBreached,
    waitingFor,
    hasUnreadForRequester,
    hasUnreadForSupport,
    messageCount: ticket._count.messages,
    attachmentCount: ticket._count.attachments,
    tenant: {
      id: ticket.tenant.id,
      name: ticket.tenant.name,
      slug: ticket.tenant.slug,
    },
    requester: {
      id: ticket.user.id,
      name: fullName(ticket.user.firstName, ticket.user.lastName),
      email: ticket.user.email,
      role: ticket.user.role,
    },
    assignedTo: ticket.assignedToSuperAdmin
      ? {
          id: ticket.assignedToSuperAdmin.id,
          name: fullName(
            ticket.assignedToSuperAdmin.firstName,
            ticket.assignedToSuperAdmin.lastName,
          ),
          email: ticket.assignedToSuperAdmin.email,
        }
      : null,
    participants: Array.from(participantsById.values()),
  };
}

function sanitizeTenantListItem(
  item: SupportTicketListItem,
): SupportTicketListItem {
  return {
    ...item,
    firstResponseAt: null,
    firstResponseDueAt: null,
    firstResponseMinutes: null,
    slaBreached: false,
  };
}

function sanitizeTenantThread(
  thread: SupportTicketThread,
): SupportTicketThread {
  return {
    ...thread,
    firstResponseAt: null,
    firstResponseDueAt: null,
    firstResponseMinutes: null,
  };
}

function mapThreadMessage(
  message: {
    id: string;
    content: string;
    isInternal: boolean;
    authorType: TicketMessageAuthorType;
    createdAt: Date;
    updatedAt: Date;
    readByRequesterAt: Date | null;
    readBySupportAt: Date | null;
    user: {
      id: string;
      firstName: string | null;
      lastName: string | null;
      email: string;
    } | null;
    superAdmin: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
    } | null;
    attachments: Array<{
      id: string;
      filename: string;
      originalName: string;
      mimeType: string;
      size: number;
      url: string;
      createdAt: Date;
    }>;
  },
): SupportTicketMessageItem {
  let author: SupportTicketMessageItem["author"] = {
    id: null,
    name: "Sistema",
    email: null,
    type: "SYSTEM",
  };

  if (message.superAdmin) {
    author = {
      id: message.superAdmin.id,
      name: fullName(message.superAdmin.firstName, message.superAdmin.lastName),
      email: message.superAdmin.email,
      type: "SUPER_ADMIN",
    };
  } else if (message.user) {
    author = {
      id: message.user.id,
      name: fullName(message.user.firstName, message.user.lastName),
      email: message.user.email,
      type: "USER",
    };
  }

  return {
    id: message.id,
    content: message.content,
    isInternal: message.isInternal,
    authorType: message.authorType,
    createdAt: message.createdAt.toISOString(),
    updatedAt: message.updatedAt.toISOString(),
    readByRequesterAt: message.readByRequesterAt
      ? message.readByRequesterAt.toISOString()
      : null,
    readBySupportAt: message.readBySupportAt
      ? message.readBySupportAt.toISOString()
      : null,
    author,
    attachments: message.attachments.map((attachment) => ({
      id: attachment.id,
      filename: attachment.filename,
      originalName: attachment.originalName,
      mimeType: attachment.mimeType,
      size: attachment.size,
      url: attachment.url,
      createdAt: attachment.createdAt.toISOString(),
    })),
  };
}

function buildTicketSearchCondition(query: string): Prisma.TicketWhereInput {
  return {
    OR: [
      { title: { contains: query, mode: "insensitive" } },
      { description: { contains: query, mode: "insensitive" } },
      { user: { email: { contains: query, mode: "insensitive" } } },
      { user: { firstName: { contains: query, mode: "insensitive" } } },
      { user: { lastName: { contains: query, mode: "insensitive" } } },
      { tenant: { name: { contains: query, mode: "insensitive" } } },
      { tenant: { slug: { contains: query, mode: "insensitive" } } },
    ],
  };
}

function buildSharedFilters(
  filters: SupportTicketFilters,
): Prisma.TicketWhereInput {
  const where: Prisma.TicketWhereInput = {};

  if (filters.status && filters.status !== "ALL") {
    where.status = filters.status;
  }

  if (filters.priority && filters.priority !== "ALL") {
    where.priority = filters.priority;
  }

  if (filters.category && filters.category !== "ALL") {
    where.category = filters.category;
  }

  if (filters.supportLevel && filters.supportLevel !== "ALL") {
    where.supportLevel = filters.supportLevel;
  }

  const query = filters.query?.trim();

  if (query) {
    Object.assign(where, buildTicketSearchCondition(query));
  }

  return where;
}

function computeStats(
  tickets: Array<{
    status: TicketStatus;
    priority: TicketPriority;
    createdAt: Date;
    firstResponseAt: Date | null;
    messages: Array<{
      authorType: TicketMessageAuthorType;
      isInternal: boolean;
    }>;
  }>,
): SupportTicketStats {
  const now = new Date();
  const base: SupportTicketStats = {
    total: tickets.length,
    open: 0,
    inProgress: 0,
    resolved: 0,
    closed: 0,
    pendingSupport: 0,
    pendingRequester: 0,
    slaBreached: 0,
    avgFirstResponseMinutes: 0,
  };

  let totalFirstResponseMinutes = 0;
  let respondedCount = 0;

  for (const ticket of tickets) {
    switch (ticket.status) {
      case TicketStatus.OPEN:
        base.open += 1;
        break;
      case TicketStatus.IN_PROGRESS:
      case TicketStatus.WAITING_CUSTOMER:
      case TicketStatus.WAITING_EXTERNAL:
        base.inProgress += 1;
        break;
      case TicketStatus.RESOLVED:
        base.resolved += 1;
        break;
      case TicketStatus.CLOSED:
        base.closed += 1;
        break;
      default:
        break;
    }

    if (ticket.firstResponseAt) {
      totalFirstResponseMinutes += diffMinutes(
        ticket.createdAt,
        ticket.firstResponseAt,
      );
      respondedCount += 1;
    }

    const dueAt = computeFirstResponseDueAt(ticket.createdAt, ticket.priority);

    if (ticket.firstResponseAt) {
      if (ticket.firstResponseAt > dueAt) {
        base.slaBreached += 1;
      }
    } else if (
      (ticket.status === TicketStatus.OPEN ||
        ticket.status === TicketStatus.IN_PROGRESS ||
        ticket.status === TicketStatus.WAITING_CUSTOMER ||
        ticket.status === TicketStatus.WAITING_EXTERNAL) &&
      now > dueAt
    ) {
      base.slaBreached += 1;
    }

    if (
      ticket.status === TicketStatus.CLOSED ||
      ticket.status === TicketStatus.RESOLVED
    ) {
      continue;
    }

    if (ticket.status === TicketStatus.WAITING_EXTERNAL) {
      continue;
    }

    if (ticket.status === TicketStatus.WAITING_CUSTOMER) {
      base.pendingRequester += 1;
      continue;
    }

    const latestMessage = ticket.messages[0] ?? null;

    if (!latestMessage) {
      base.pendingSupport += 1;
      continue;
    }

    if (
      latestMessage.isInternal &&
      isSupportAuthor(latestMessage.authorType)
    ) {
      base.pendingSupport += 1;
    } else if (isSupportAuthor(latestMessage.authorType)) {
      base.pendingRequester += 1;
    } else {
      base.pendingSupport += 1;
    }
  }

  base.avgFirstResponseMinutes = respondedCount
    ? Math.round(totalFirstResponseMinutes / respondedCount)
    : 0;

  return base;
}

async function createSupportTicketInternal(params: {
  context: AuthContext;
  data: CreateTicketData;
  images?: File[];
}): Promise<{ success: boolean; ticketId: string }> {
  const { context, data, images = [] } = params;
  ensureTenantAccess(context);

  if (images.length > SUPPORT_MAX_IMAGES_PER_BATCH) {
    throw new Error(
      `Limite de ${SUPPORT_MAX_IMAGES_PER_BATCH} imagens por ticket`,
    );
  }

  const title = data.title?.trim();
  const description = data.description?.trim() || null;

  if (!title) {
    throw new Error("Título do ticket é obrigatório");
  }

  const createdAt = new Date();

  const ticket = await prisma.ticket.create({
    data: {
      title,
      description,
      priority: data.priority ?? TicketPriority.MEDIUM,
      category: data.category ?? TicketCategory.GENERAL,
      userId: context.userId,
      tenantId: context.tenantId!,
      requesterLastViewedAt: createdAt,
    },
  });

  let initialMessageId: string | null = null;

  if (description || images.length > 0) {
    const initialMessage = await prisma.ticketMessage.create({
      data: {
        ticketId: ticket.id,
        content: description || "Imagens anexadas no ticket inicial.",
        isInternal: false,
        authorType: context.canManageTenantSupport
          ? TicketMessageAuthorType.TENANT_ADMIN
          : TicketMessageAuthorType.TENANT_USER,
        userId: context.userId,
        readByRequesterAt: createdAt,
      },
      select: { id: true },
    });

    initialMessageId = initialMessage.id;
  }

  if (images.length > 0) {
    const tenantSlug = await resolveTenantSlug(context.tenantId!, context.tenantSlug);

    await uploadTicketImageAttachments({
      ticketId: ticket.id,
      ticketMessageId: initialMessageId,
      tenantSlug,
      uploaderUserId: context.userId,
      files: images,
    });
  }

  revalidateSupportPaths();

  return { success: true, ticketId: ticket.id };
}

export async function createSupportTicket(
  data: CreateTicketData,
): Promise<{ success: boolean; ticketId: string }> {
  const context = await getAuthContext();

  return createSupportTicketInternal({ context, data });
}

export async function createSupportTicketWithImages(
  formData: FormData,
): Promise<{ success: boolean; ticketId: string }> {
  const context = await getAuthContext();

  const title = String(formData.get("title") ?? "");
  const description = String(formData.get("description") ?? "");
  const priority = parseTicketPriority(String(formData.get("priority") ?? ""));
  const category = parseTicketCategory(String(formData.get("category") ?? ""));
  const imageFiles = formData
    .getAll("images")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  return createSupportTicketInternal({
    context,
    data: { title, description, priority, category },
    images: imageFiles,
  });
}

export async function getTenantSupportTickets(
  filters: SupportTicketFilters = {},
): Promise<SupportTicketListResult> {
  const context = await getAuthContext();

  ensureTenantAccess(context);

  const page = normalizePage(filters.page);
  const pageSize = normalizePageSize(filters.pageSize);

  const where: Prisma.TicketWhereInput = {
    tenantId: context.tenantId!,
    ...buildSharedFilters(filters),
  };

  if (!context.canManageTenantSupport || filters.mineOnly) {
    where.userId = context.userId;
  }

  const [total, tickets] = await Promise.all([
    prisma.ticket.count({ where }),
    prisma.ticket.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
          },
        },
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        assignedToSuperAdmin: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 40,
          select: {
            id: true,
            createdAt: true,
            authorType: true,
            isInternal: true,
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                role: true,
              },
            },
            superAdmin: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
        _count: {
          select: {
            messages: true,
            attachments: true,
          },
        },
      },
    }),
  ]);

  const now = new Date();

  return {
    items: tickets
      .map((ticket) => mapTicketListItem(ticket, now))
      .map((item) => sanitizeTenantListItem(item)),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getGlobalSupportTickets(
  filters: GlobalSupportTicketFilters = {},
): Promise<SupportTicketListResult> {
  const context = await getAuthContext();

  ensureSuperAdminAccess(context);

  const page = normalizePage(filters.page);
  const pageSize = normalizePageSize(filters.pageSize);

  const where: Prisma.TicketWhereInput = {
    ...buildSharedFilters(filters),
  };

  if (filters.tenantId && filters.tenantId !== "ALL") {
    where.tenantId = filters.tenantId;
  }

  if (filters.assignedToMe) {
    where.assignedToSuperAdminId = context.userId;
  } else if (filters.assignedOnly) {
    where.assignedToSuperAdminId = { not: null };
  }

  const [total, tickets] = await Promise.all([
    prisma.ticket.count({ where }),
    prisma.ticket.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
          },
        },
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        assignedToSuperAdmin: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 40,
          select: {
            id: true,
            createdAt: true,
            authorType: true,
            isInternal: true,
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                role: true,
              },
            },
            superAdmin: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
        _count: {
          select: {
            messages: true,
            attachments: true,
          },
        },
      },
    }),
  ]);

  const now = new Date();

  return {
    items: tickets.map((ticket) => mapTicketListItem(ticket, now)),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getSupportTicketThread(
  ticketId: string,
): Promise<SupportTicketThread | null> {
  const context = await getAuthContext();

  const where: Prisma.TicketWhereInput = {
    id: ticketId,
  };

  if (!context.isSuperAdmin) {
    where.tenantId = context.tenantId!;

    if (!context.canManageTenantSupport) {
      where.userId = context.userId;
    }
  }

  const ticket = await prisma.ticket.findFirst({
    where,
    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          role: true,
        },
      },
      tenant: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
      assignedToSuperAdmin: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
      closedBySuperAdmin: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
      attachments: {
        orderBy: { createdAt: "asc" },
      },
      messages: {
        ...(context.isSuperAdmin ? {} : { where: { isInternal: false } }),
        orderBy: { createdAt: "asc" },
        include: {
          attachments: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              filename: true,
              originalName: true,
              mimeType: true,
              size: true,
              url: true,
              createdAt: true,
            },
          },
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          superAdmin: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      },
    },
  });

  if (!ticket) {
    return null;
  }

  const firstResponseDueAt = computeFirstResponseDueAt(
    ticket.createdAt,
    ticket.priority,
  );

  const firstResponseMinutes = ticket.firstResponseAt
    ? diffMinutes(ticket.createdAt, ticket.firstResponseAt)
    : null;

  const thread: SupportTicketThread = {
    id: ticket.id,
    title: ticket.title,
    description: ticket.description,
    status: ticket.status,
    priority: ticket.priority,
    category: ticket.category,
    supportLevel: ticket.supportLevel,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
    closedAt: ticket.closedAt ? ticket.closedAt.toISOString() : null,
    closureCategory: ticket.closureCategory,
    resolutionOutcome: ticket.resolutionOutcome,
    closureSummary: ticket.closureSummary,
    requesterRating: ticket.requesterRating,
    requesterRatingComment: ticket.requesterRatingComment,
    requesterRatedAt: ticket.requesterRatedAt
      ? ticket.requesterRatedAt.toISOString()
      : null,
    firstResponseAt: ticket.firstResponseAt
      ? ticket.firstResponseAt.toISOString()
      : null,
    firstResponseDueAt: firstResponseDueAt.toISOString(),
    firstResponseMinutes,
    requesterLastViewedAt: ticket.requesterLastViewedAt
      ? ticket.requesterLastViewedAt.toISOString()
      : null,
    supportLastViewedAt: ticket.supportLastViewedAt
      ? ticket.supportLastViewedAt.toISOString()
      : null,
    tenant: {
      id: ticket.tenant.id,
      name: ticket.tenant.name,
      slug: ticket.tenant.slug,
    },
    requester: {
      id: ticket.user.id,
      name: fullName(ticket.user.firstName, ticket.user.lastName),
      email: ticket.user.email,
      role: ticket.user.role,
    },
    assignedTo: ticket.assignedToSuperAdmin
      ? {
          id: ticket.assignedToSuperAdmin.id,
          name: fullName(
            ticket.assignedToSuperAdmin.firstName,
            ticket.assignedToSuperAdmin.lastName,
          ),
          email: ticket.assignedToSuperAdmin.email,
        }
      : null,
    closedBy: ticket.closedBySuperAdmin
      ? {
          id: ticket.closedBySuperAdmin.id,
          name: fullName(
            ticket.closedBySuperAdmin.firstName,
            ticket.closedBySuperAdmin.lastName,
          ),
          email: ticket.closedBySuperAdmin.email,
        }
      : null,
    attachments: ticket.attachments.map((attachment) => ({
      id: attachment.id,
      filename: attachment.filename,
      originalName: attachment.originalName,
      mimeType: attachment.mimeType,
      size: attachment.size,
      url: attachment.url,
      ticketMessageId: attachment.ticketMessageId,
      createdAt: attachment.createdAt.toISOString(),
    })),
    messages: ticket.messages.map((message) => mapThreadMessage(message)),
  };

  return context.isSuperAdmin ? thread : sanitizeTenantThread(thread);
}

async function addSupportMessageInternal(params: {
  ticketId: string;
  data: CreateMessageData;
  images?: File[];
}): Promise<{ success: boolean; messageId: string }> {
  const { ticketId, data, images = [] } = params;
  const context = await getAuthContext();

  const content = data.content?.trim();

  if (!content && images.length === 0) {
    throw new Error("Mensagem ou imagem é obrigatória");
  }

  if (images.length > SUPPORT_MAX_IMAGES_PER_BATCH) {
    throw new Error(
      `Limite de ${SUPPORT_MAX_IMAGES_PER_BATCH} imagens por envio`,
    );
  }

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      id: true,
      tenantId: true,
      userId: true,
      status: true,
      firstResponseAt: true,
      tenant: {
        select: {
          slug: true,
        },
      },
    },
  });

  if (!ticket) {
    throw new Error("Ticket não encontrado");
  }

  if (!context.isSuperAdmin) {
    if (ticket.tenantId !== context.tenantId) {
      throw new Error("Ticket não pertence ao tenant atual");
    }

    if (!context.canManageTenantSupport && ticket.userId !== context.userId) {
      throw new Error("Sem permissão para responder este ticket");
    }
  }

  if (ticket.status === TicketStatus.CLOSED) {
    throw new Error(
      "Este atendimento já foi finalizado. Reabra o ticket antes de enviar novas mensagens.",
    );
  }

  const now = new Date();

  let authorType: TicketMessageAuthorType;
  let userId: string | null = null;
  let superAdminId: string | null = null;

  if (context.isSuperAdmin) {
    authorType = TicketMessageAuthorType.SUPER_ADMIN;
    superAdminId = context.userId;
  } else {
    authorType = context.canManageTenantSupport
      ? TicketMessageAuthorType.TENANT_ADMIN
      : TicketMessageAuthorType.TENANT_USER;
    userId = context.userId;
  }

  const isInternal = context.isSuperAdmin ? Boolean(data.isInternal) : false;

  const message = await prisma.ticketMessage.create({
    data: {
      ticketId,
      content: content || "Imagem enviada no chat.",
      isInternal,
      authorType,
      userId,
      superAdminId,
      readByRequesterAt: context.isSuperAdmin
        ? isInternal
          ? now
          : null
        : now,
      readBySupportAt: context.isSuperAdmin ? now : null,
    },
    select: { id: true },
  });

  if (images.length > 0) {
    const tenantSlug = await resolveTenantSlug(ticket.tenantId, ticket.tenant?.slug);

    await uploadTicketImageAttachments({
      ticketId: ticket.id,
      ticketMessageId: message.id,
      tenantSlug,
      uploaderUserId: userId,
      uploaderSuperAdminId: superAdminId,
      files: images,
    });
  }

  const ticketUpdate: Prisma.TicketUpdateInput = {};

  if (context.isSuperAdmin) {
    if (!ticket.firstResponseAt && !isInternal) {
      ticketUpdate.firstResponseAt = now;
    }

    ticketUpdate.supportLastViewedAt = now;

    if (
      ticket.status === TicketStatus.OPEN ||
      ticket.status === TicketStatus.WAITING_CUSTOMER ||
      ticket.status === TicketStatus.WAITING_EXTERNAL
    ) {
      ticketUpdate.status = TicketStatus.IN_PROGRESS;
    }

  } else {
    ticketUpdate.requesterLastViewedAt = now;

    if (ticket.status === TicketStatus.WAITING_CUSTOMER) {
      ticketUpdate.status = TicketStatus.IN_PROGRESS;
    } else if (ticket.status === TicketStatus.RESOLVED) {
      ticketUpdate.status = TicketStatus.OPEN;
      ticketUpdate.closedAt = null;
    }
  }

  await prisma.ticket.update({
    where: { id: ticketId },
    data: ticketUpdate,
  });

  revalidateSupportPaths();

  return {
    success: true,
    messageId: message.id,
  };
}

export async function addSupportMessage(
  ticketId: string,
  data: CreateMessageData,
): Promise<{ success: boolean; messageId: string }> {
  return addSupportMessageInternal({ ticketId, data });
}

export async function addSupportMessageWithImages(
  ticketId: string,
  formData: FormData,
): Promise<{ success: boolean; messageId: string }> {
  const content = String(formData.get("content") ?? "");
  const isInternal = String(formData.get("isInternal") ?? "") === "true";
  const imageFiles = formData
    .getAll("images")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  return addSupportMessageInternal({
    ticketId,
    data: { content, isInternal },
    images: imageFiles,
  });
}

export async function updateSupportTicketStatus(
  ticketId: string,
  status: TicketStatus,
  options?: {
    reason?: string | null;
  },
): Promise<{ success: boolean }> {
  const context = await getAuthContext();
  const now = new Date();
  const reason = options?.reason?.trim() || "";

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      id: true,
      tenantId: true,
      userId: true,
      status: true,
    },
  });

  if (!ticket) {
    throw new Error("Ticket não encontrado");
  }

  if (status === TicketStatus.CLOSED) {
    throw new Error(
      "Use a ação de finalização para encerrar o atendimento com categoria e desfecho.",
    );
  }

  if (context.isSuperAdmin) {
    // permitido
  } else {
    if (ticket.tenantId !== context.tenantId) {
      throw new Error("Ticket não pertence ao tenant atual");
    }

    if (!context.canManageTenantSupport) {
      throw new Error("Sem permissão para alterar status");
    }
  }

  if (status === TicketStatus.WAITING_EXTERNAL && !reason) {
    throw new Error(
      "Informe o motivo ao mover o ticket para Aguardando terceiro",
    );
  }

  await prisma.ticket.update({
    where: { id: ticketId },
    data: {
      status,
      closedAt: null,
      closureCategory: null,
      resolutionOutcome: null,
      closureSummary: null,
      closedBySuperAdminId: null,
    },
  });

  if (reason || status === TicketStatus.WAITING_EXTERNAL) {
    const content = reason
      ? `Status atualizado para "${TICKET_STATUS_LABELS[status]}". Motivo: ${reason}`
      : `Status atualizado para "${TICKET_STATUS_LABELS[status]}".`;

    await prisma.ticketMessage.create({
      data: {
        ticketId,
        content,
        isInternal: false,
        authorType: TicketMessageAuthorType.SYSTEM,
        readByRequesterAt: context.isSuperAdmin ? null : now,
        readBySupportAt: context.isSuperAdmin ? now : null,
      },
    });
  }

  revalidateSupportPaths();

  return { success: true };
}

export async function finalizeSupportTicket(
  ticketId: string,
  data: FinalizeSupportTicketData,
): Promise<{ success: boolean }> {
  const context = await getAuthContext();
  ensureSuperAdminAccess(context);

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      id: true,
      status: true,
    },
  });

  if (!ticket) {
    throw new Error("Ticket não encontrado");
  }

  if (!data.closureCategory) {
    throw new Error("Categoria de fechamento é obrigatória");
  }

  if (!data.resolutionOutcome) {
    throw new Error("Desfecho do atendimento é obrigatório");
  }

  if (ticket.status === TicketStatus.CLOSED) {
    throw new Error("Este ticket já foi finalizado.");
  }

  const now = new Date();
  const closureSummary = data.closureSummary?.trim() || null;
  const outcomeLabel = TICKET_RESOLUTION_OUTCOME_LABELS[data.resolutionOutcome];
  const categoryLabel = TICKET_CATEGORY_LABELS[data.closureCategory];

  const summarySuffix = closureSummary ? `\nResumo: ${closureSummary}` : "";
  const messageContent = [
    "Atendimento finalizado pelo suporte.",
    `Desfecho: ${outcomeLabel}.`,
    `Categoria: ${categoryLabel}.`,
  ].join(" ") + summarySuffix;

  await prisma.$transaction([
    prisma.ticket.update({
      where: { id: ticketId },
      data: {
        status: TicketStatus.CLOSED,
        closedAt: now,
        closureCategory: data.closureCategory,
        resolutionOutcome: data.resolutionOutcome,
        closureSummary,
        closedBySuperAdminId: context.userId,
        supportLastViewedAt: now,
        requesterRating: null,
        requesterRatingComment: null,
        requesterRatedAt: null,
      },
    }),
    prisma.ticketMessage.create({
      data: {
        ticketId,
        content: messageContent,
        isInternal: false,
        authorType: TicketMessageAuthorType.SYSTEM,
        readByRequesterAt: null,
        readBySupportAt: now,
      },
    }),
  ]);

  revalidateSupportPaths();

  return { success: true };
}

export async function rateSupportTicket(
  ticketId: string,
  data: RateSupportTicketData,
): Promise<{ success: boolean }> {
  const context = await getAuthContext();
  ensureTenantAccess(context);

  const parsedRating = Math.floor(Number(data.rating));

  if (!Number.isFinite(parsedRating) || parsedRating < 1 || parsedRating > 5) {
    throw new Error("A nota deve estar entre 1 e 5.");
  }

  const comment = data.comment?.trim() || null;

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      id: true,
      tenantId: true,
      userId: true,
      status: true,
    },
  });

  if (!ticket) {
    throw new Error("Ticket não encontrado");
  }

  if (ticket.tenantId !== context.tenantId) {
    throw new Error("Ticket não pertence ao tenant atual");
  }

  if (!context.canManageTenantSupport && ticket.userId !== context.userId) {
    throw new Error("Sem permissão para avaliar este atendimento");
  }

  if (ticket.status !== TicketStatus.CLOSED) {
    throw new Error("A avaliação só pode ser enviada após o encerramento.");
  }

  const now = new Date();
  const messageContent = comment
    ? `Avaliação registrada pelo solicitante: ${parsedRating}/5. Comentário: ${comment}`
    : `Avaliação registrada pelo solicitante: ${parsedRating}/5.`;

  await prisma.$transaction([
    prisma.ticket.update({
      where: { id: ticketId },
      data: {
        requesterRating: parsedRating,
        requesterRatingComment: comment,
        requesterRatedAt: now,
        requesterLastViewedAt: now,
      },
    }),
    prisma.ticketMessage.create({
      data: {
        ticketId,
        content: messageContent,
        isInternal: false,
        authorType: TicketMessageAuthorType.SYSTEM,
        readByRequesterAt: now,
        readBySupportAt: null,
      },
    }),
  ]);

  revalidateSupportPaths();

  return { success: true };
}

export async function updateSupportTicketRouting(
  ticketId: string,
  data: {
    supportLevel?: TicketSupportLevel;
    assignedToSuperAdminId?: string | null;
  },
): Promise<{ success: boolean }> {
  const context = await getAuthContext();

  ensureSuperAdminAccess(context);

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { id: true },
  });

  if (!ticket) {
    throw new Error("Ticket não encontrado");
  }

  let assignedToSuperAdminId = data.assignedToSuperAdminId;

  if (assignedToSuperAdminId) {
    const assignee = await prisma.superAdmin.findUnique({
      where: { id: assignedToSuperAdminId },
      select: { id: true, status: true },
    });

    if (!assignee || assignee.status !== "ACTIVE") {
      throw new Error("Agente de suporte inválido para atribuição");
    }
  }

  if (assignedToSuperAdminId === "") {
    assignedToSuperAdminId = null;
  }

  await prisma.ticket.update({
    where: { id: ticketId },
    data: {
      ...(data.supportLevel ? { supportLevel: data.supportLevel } : {}),
      ...(data.assignedToSuperAdminId !== undefined
        ? { assignedToSuperAdminId }
        : {}),
    },
  });

  revalidateSupportPaths();

  return { success: true };
}

export async function claimSupportTicket(ticketId: string): Promise<{
  success: boolean;
  claimed: boolean;
  assignedToSuperAdminId: string | null;
  assignedToName: string | null;
}> {
  const context = await getAuthContext();

  ensureSuperAdminAccess(context);

  const now = new Date();

  const claimed = await prisma.ticket.updateMany({
    where: {
      id: ticketId,
      assignedToSuperAdminId: null,
      status: {
        not: TicketStatus.CLOSED,
      },
    },
    data: {
      assignedToSuperAdminId: context.userId,
      status: TicketStatus.IN_PROGRESS,
      closedAt: null,
      supportLastViewedAt: now,
    },
  });

  if (claimed.count > 0) {
    revalidateSupportPaths();

    return {
      success: true,
      claimed: true,
      assignedToSuperAdminId: context.userId,
      assignedToName: null,
    };
  }

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      assignedToSuperAdminId: true,
      assignedToSuperAdmin: {
        select: {
          firstName: true,
          lastName: true,
        },
      },
    },
  });

  return {
    success: true,
    claimed: ticket?.assignedToSuperAdminId === context.userId,
    assignedToSuperAdminId: ticket?.assignedToSuperAdminId ?? null,
    assignedToName: ticket?.assignedToSuperAdmin
      ? fullName(
          ticket.assignedToSuperAdmin.firstName,
          ticket.assignedToSuperAdmin.lastName,
        )
      : null,
  };
}

export async function markSupportTicketViewed(
  ticketId: string,
): Promise<{ success: boolean }> {
  const context = await getAuthContext();

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      id: true,
      tenantId: true,
      userId: true,
    },
  });

  if (!ticket) {
    throw new Error("Ticket não encontrado");
  }

  if (!context.isSuperAdmin) {
    if (ticket.tenantId !== context.tenantId) {
      throw new Error("Ticket não pertence ao tenant atual");
    }

    if (!context.canManageTenantSupport && ticket.userId !== context.userId) {
      throw new Error("Sem permissão para visualizar este ticket");
    }
  }

  const now = new Date();

  if (context.isSuperAdmin) {
    await prisma.$transaction([
      prisma.ticket.update({
        where: { id: ticketId },
        data: { supportLastViewedAt: now },
      }),
      prisma.ticketMessage.updateMany({
        where: {
          ticketId,
          readBySupportAt: null,
          authorType: {
            in: [
              TicketMessageAuthorType.TENANT_USER,
              TicketMessageAuthorType.TENANT_ADMIN,
            ],
          },
        },
        data: { readBySupportAt: now },
      }),
    ]);
  } else {
    await prisma.$transaction([
      prisma.ticket.update({
        where: { id: ticketId },
        data: { requesterLastViewedAt: now },
      }),
      prisma.ticketMessage.updateMany({
        where: {
          ticketId,
          readByRequesterAt: null,
          authorType: {
            in: [
              TicketMessageAuthorType.SUPER_ADMIN,
              TicketMessageAuthorType.SYSTEM,
            ],
          },
        },
        data: { readByRequesterAt: now },
      }),
    ]);
  }

  revalidateSupportPaths();

  return { success: true };
}

export async function getTenantSupportStats(): Promise<SupportTicketStats> {
  const context = await getAuthContext();

  ensureTenantAccess(context);

  const where: Prisma.TicketWhereInput = {
    tenantId: context.tenantId!,
  };

  if (!context.canManageTenantSupport) {
    where.userId = context.userId;
  }

  const tickets = await prisma.ticket.findMany({
    where,
    select: {
      status: true,
      priority: true,
      createdAt: true,
      firstResponseAt: true,
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { authorType: true, isInternal: true },
      },
    },
  });

  const stats = computeStats(tickets);

  return {
    ...stats,
    slaBreached: 0,
    avgFirstResponseMinutes: 0,
  };
}

export async function getGlobalSupportStats(): Promise<SupportTicketStats> {
  const context = await getAuthContext();

  ensureSuperAdminAccess(context);

  const tickets = await prisma.ticket.findMany({
    select: {
      status: true,
      priority: true,
      createdAt: true,
      firstResponseAt: true,
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { authorType: true, isInternal: true },
      },
    },
  });

  return computeStats(tickets);
}

export async function getSupportSuperAdminAgents(): Promise<
  Array<{
    id: string;
    name: string;
    email: string;
  }>
> {
  const context = await getAuthContext();

  ensureSuperAdminAccess(context);

  const agents = await prisma.superAdmin.findMany({
    where: { status: "ACTIVE" },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
    },
  });

  return agents.map((agent) => ({
    id: agent.id,
    name: fullName(agent.firstName, agent.lastName),
    email: agent.email,
  }));
}

export async function getSupportTenantOptions(): Promise<
  Array<{
    id: string;
    name: string;
    slug: string;
  }>
> {
  const context = await getAuthContext();

  ensureSuperAdminAccess(context);

  return prisma.tenant.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
    },
  });
}

// ---------------------------------
// Compatibilidade com API antiga
// ---------------------------------

export interface TicketWithDetails extends SupportTicketThread {}

export async function createTicket(
  data: CreateTicketData,
): Promise<TicketWithDetails> {
  const result = await createSupportTicket(data);
  const thread = await getSupportTicketThread(result.ticketId);

  if (!thread) {
    throw new Error("Ticket criado, mas não foi possível carregar os detalhes");
  }

  return thread;
}

export async function getTicketsForTenant(): Promise<TicketWithDetails[]> {
  const result = await getTenantSupportTickets({ page: 1, pageSize: 50 });
  const threads = await Promise.all(
    result.items.map((item) => getSupportTicketThread(item.id)),
  );

  return threads.filter((thread): thread is TicketWithDetails => Boolean(thread));
}

export async function getTicketById(
  ticketId: string,
): Promise<TicketWithDetails | null> {
  return getSupportTicketThread(ticketId);
}

export async function addMessageToTicket(
  ticketId: string,
  data: CreateMessageData,
): Promise<{ success: boolean; messageId?: string }> {
  const result = await addSupportMessage(ticketId, data);

  return { success: true, messageId: result.messageId };
}

export async function updateTicketStatus(
  ticketId: string,
  status: TicketStatus,
  options?: {
    reason?: string | null;
  },
): Promise<{ success: boolean }> {
  return updateSupportTicketStatus(ticketId, status, options);
}

export async function getTicketStats(): Promise<{
  total: number;
  open: number;
  inProgress: number;
  resolved: number;
  closed: number;
}> {
  const stats = await getTenantSupportStats();

  return {
    total: stats.total,
    open: stats.open,
    inProgress: stats.inProgress,
    resolved: stats.resolved,
    closed: stats.closed,
  };
}
