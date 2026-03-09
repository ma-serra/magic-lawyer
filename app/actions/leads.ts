"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";

import { authOptions } from "@/auth";
import {
  buildPricingChatLeadMetadata,
  parsePricingChatLeadMetadata,
  type PublicChatMessage,
  type PricingChatLeadMetadata,
} from "@/app/lib/pricing-chat";
import prisma from "@/app/lib/prisma";
import { LeadSource, LeadStatus, UserRole } from "@/generated/prisma";
import logger from "@/lib/logger";

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export type CreateLeadFromPricingChatInput = {
  nome: string;
  email: string;
  telefone?: string;
  empresa?: string;
  cargo?: string;
  interessePlano?: string;
  tamanhoEquipe?: string;
  horizonteContratacao?: string;
  objetivoPrincipal?: string;
  mensagem?: string;
  transcript?: PublicChatMessage[];
  preferredContactChannel?: string | null;
  responsePriority?: string | null;
  requestedHumanHandoff?: boolean;
  faqTopicIds?: string[];
  stepReached?: string;
  completedAnswers?: number;
  answersComplete?: boolean;
};

export type LeadListFilters = {
  search?: string;
  status?: LeadStatus | "ALL";
  source?: LeadSource | "ALL";
  page?: number;
  limit?: number;
};

function sanitizeText(value: unknown, max = 255): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().replace(/\s+/g, " ");

  if (!normalized) {
    return null;
  }

  return normalized.slice(0, max);
}

function sanitizeMultiline(value: unknown, max = 4000): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.replace(/\r/g, "").trim();

  if (!normalized) {
    return null;
  }

  return normalized.slice(0, max);
}

function normalizePhone(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value.replace(/[^\d()+\-\s]/g, "").trim();

  if (!cleaned) {
    return null;
  }

  return cleaned.slice(0, 30);
}

function isEmailValid(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");

  if (!local || !domain) {
    return email;
  }

  if (local.length <= 2) {
    return `${local[0] ?? "*"}***@${domain}`;
  }

  return `${local.slice(0, 2)}***@${domain}`;
}

async function requireSuperAdminContext(): Promise<
  ActionResult<{ superAdminId: string }>
> {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return { success: false, error: "Não autenticado." };
  }

  if (session.user.role !== UserRole.SUPER_ADMIN) {
    return {
      success: false,
      error: "Acesso permitido apenas para Super Admin.",
    };
  }

  return { success: true, data: { superAdminId: session.user.id } };
}

function parseTranscript(messages: unknown): PublicChatMessage[] | null {
  if (!Array.isArray(messages)) {
    return null;
  }

  const parsed = messages
    .slice(-40)
    .map<PublicChatMessage | null>((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const authorRaw = (item as { author?: unknown }).author;
      const textRaw = (item as { text?: unknown }).text;
      const createdAtRaw = (item as { createdAt?: unknown }).createdAt;
      const text = sanitizeMultiline(textRaw, 1000);

      if (!text) {
        return null;
      }

      const author: "bot" | "user" = authorRaw === "bot" ? "bot" : "user";

      const createdAt =
        typeof createdAtRaw === "string" &&
        !Number.isNaN(Date.parse(createdAtRaw))
          ? new Date(createdAtRaw).toISOString()
          : null;

      return createdAt ? { author, text, createdAt } : { author, text };
    })
    .filter((item): item is PublicChatMessage => item !== null);

  return parsed.length > 0 ? parsed : null;
}

export async function createLeadFromPricingChat(
  input: CreateLeadFromPricingChatInput,
): Promise<
  ActionResult<{
    id: string;
    status: LeadStatus;
    maskedEmail: string;
    deduplicated: boolean;
  }>
> {
  try {
    const nome = sanitizeText(input.nome, 120);
    const email = sanitizeText(input.email, 190)?.toLowerCase();

    if (!nome) {
      return { success: false, error: "Informe seu nome para continuar." };
    }

    if (!email || !isEmailValid(email)) {
      return {
        success: false,
        error: "Informe um e-mail válido para contato.",
      };
    }

    const telefone = normalizePhone(input.telefone);
    const empresa = sanitizeText(input.empresa, 180);
    const cargo = sanitizeText(input.cargo, 120);
    const interessePlano = sanitizeText(input.interessePlano, 80);
    const tamanhoEquipe = sanitizeText(input.tamanhoEquipe, 80);
    const horizonteContratacao = sanitizeText(input.horizonteContratacao, 80);
    const objetivoPrincipal = sanitizeText(input.objetivoPrincipal, 180);
    const mensagem = sanitizeMultiline(input.mensagem, 2000);
    const transcript = parseTranscript(input.transcript);
    const metadata = buildPricingChatLeadMetadata({
      requestedHumanHandoff: input.requestedHumanHandoff,
      preferredContactChannel: input.preferredContactChannel,
      responsePriority: input.responsePriority,
      faqTopicIds: input.faqTopicIds,
      stepReached: input.stepReached,
      completedAnswers: input.completedAnswers,
      answersComplete: input.answersComplete,
    });

    const headersList = await headers();
    const ipAddress =
      headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      headersList.get("x-real-ip")?.trim() ||
      null;
    const userAgent = headersList.get("user-agent")?.trim() || null;
    const now = new Date();

    const duplicateWindowStart = new Date(now.getTime() - 10 * 60 * 1000);

    const recentLead = await prisma.lead.findFirst({
      where: {
        source: LeadSource.PRICING_CHAT,
        email: {
          equals: email,
          mode: "insensitive",
        },
        createdAt: {
          gte: duplicateWindowStart,
        },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true },
    });

    if (recentLead) {
      const updatedLead = await prisma.lead.update({
        where: { id: recentLead.id },
        data: {
          nome,
          telefone,
          empresa,
          cargo,
          interessePlano,
          tamanhoEquipe,
          horizonteContratacao,
          objetivoPrincipal,
          mensagem,
          transcript: transcript
            ? (transcript as unknown as object)
            : undefined,
          metadata: metadata as unknown as object,
          createdByIp: ipAddress,
          createdByUserAgent: userAgent,
          lastInteractionAt: now,
          updatedAt: now,
        },
        select: { id: true, status: true },
      });

      revalidatePath("/admin/leads");

      return {
        success: true,
        data: {
          id: updatedLead.id,
          status: updatedLead.status,
          maskedEmail: maskEmail(email),
          deduplicated: true,
        },
      };
    }

    const createdLead = await prisma.lead.create({
      data: {
        nome,
        email,
        telefone,
        empresa,
        cargo,
        interessePlano,
        tamanhoEquipe,
        horizonteContratacao,
        objetivoPrincipal,
        mensagem,
        source: LeadSource.PRICING_CHAT,
        status: LeadStatus.NEW,
        transcript: transcript ? (transcript as unknown as object) : undefined,
        metadata: metadata as unknown as object,
        createdByIp: ipAddress,
        createdByUserAgent: userAgent,
        lastInteractionAt: now,
      },
      select: { id: true, status: true },
    });

    revalidatePath("/admin/leads");

    return {
      success: true,
      data: {
        id: createdLead.id,
        status: createdLead.status,
        maskedEmail: maskEmail(email),
        deduplicated: false,
      },
    };
  } catch (error) {
    logger.error("Erro ao criar lead por chat público:", error);

    return {
      success: false,
      error: "Não foi possível registrar o lead agora. Tente novamente.",
    };
  }
}

export async function listLeads(filters: LeadListFilters = {}): Promise<
  ActionResult<{
    items: Array<{
      id: string;
      nome: string;
      email: string;
      telefone: string | null;
      empresa: string | null;
      interessePlano: string | null;
      tamanhoEquipe: string | null;
      objetivoPrincipal: string | null;
      status: LeadStatus;
      source: LeadSource;
      createdAt: string;
      updatedAt: string;
      assignedTo: {
        id: string;
        nome: string;
        email: string;
      } | null;
      notesCount: number;
    }>;
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }>
> {
  try {
    const auth = await requireSuperAdminContext();

    if (!auth.success) {
      return auth;
    }

    const page = Math.max(1, Number(filters.page ?? 1) || 1);
    const limit = Math.min(50, Math.max(5, Number(filters.limit ?? 10) || 10));
    const skip = (page - 1) * limit;
    const search = sanitizeText(filters.search, 200);
    const statusFilter =
      filters.status && filters.status !== "ALL" ? filters.status : null;
    const sourceFilter =
      filters.source && filters.source !== "ALL" ? filters.source : null;

    const where: Record<string, unknown> = {};

    if (statusFilter) {
      where.status = statusFilter;
    }

    if (sourceFilter) {
      where.source = sourceFilter;
    }

    if (search) {
      where.OR = [
        { nome: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { empresa: { contains: search, mode: "insensitive" } },
        { telefone: { contains: search, mode: "insensitive" } },
        { interessePlano: { contains: search, mode: "insensitive" } },
      ];
    }

    const [total, leads] = await Promise.all([
      prisma.lead.count({ where }),
      prisma.lead.findMany({
        where,
        orderBy: [{ createdAt: "desc" }],
        skip,
        take: limit,
        include: {
          assignedToSuperAdmin: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          _count: {
            select: { notes: true },
          },
        },
      }),
    ]);

    return {
      success: true,
      data: {
        items: leads.map((lead) => ({
          id: lead.id,
          nome: lead.nome,
          email: lead.email,
          telefone: lead.telefone,
          empresa: lead.empresa,
          interessePlano: lead.interessePlano,
          tamanhoEquipe: lead.tamanhoEquipe,
          objetivoPrincipal: lead.objetivoPrincipal,
          status: lead.status,
          source: lead.source,
          createdAt: lead.createdAt.toISOString(),
          updatedAt: lead.updatedAt.toISOString(),
          assignedTo: lead.assignedToSuperAdmin
            ? {
                id: lead.assignedToSuperAdmin.id,
                nome: `${lead.assignedToSuperAdmin.firstName} ${lead.assignedToSuperAdmin.lastName}`.trim(),
                email: lead.assignedToSuperAdmin.email,
              }
            : null,
          notesCount: lead._count.notes,
        })),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / limit)),
        },
      },
    };
  } catch (error) {
    logger.error("Erro ao listar leads:", error);

    return {
      success: false,
      error: "Falha ao carregar leads.",
    };
  }
}

export async function getLeadStats(): Promise<
  ActionResult<{
    total: number;
    novos: number;
    qualificados: number;
    emNegociacao: number;
    ganhos: number;
    perdidos: number;
    ultimas24h: number;
  }>
> {
  try {
    const auth = await requireSuperAdminContext();

    if (!auth.success) {
      return auth;
    }

    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [
      total,
      novos,
      qualificados,
      emNegociacao,
      ganhos,
      perdidos,
      ultimas24h,
    ] = await Promise.all([
      prisma.lead.count(),
      prisma.lead.count({ where: { status: LeadStatus.NEW } }),
      prisma.lead.count({ where: { status: LeadStatus.QUALIFIED } }),
      prisma.lead.count({ where: { status: LeadStatus.NEGOTIATION } }),
      prisma.lead.count({ where: { status: LeadStatus.WON } }),
      prisma.lead.count({ where: { status: LeadStatus.LOST } }),
      prisma.lead.count({ where: { createdAt: { gte: dayAgo } } }),
    ]);

    return {
      success: true,
      data: {
        total,
        novos,
        qualificados,
        emNegociacao,
        ganhos,
        perdidos,
        ultimas24h,
      },
    };
  } catch (error) {
    logger.error("Erro ao obter métricas de leads:", error);

    return {
      success: false,
      error: "Falha ao carregar indicadores de leads.",
    };
  }
}

export async function getLeadDetails(leadId: string): Promise<
  ActionResult<{
    id: string;
    nome: string;
    email: string;
    telefone: string | null;
    empresa: string | null;
    cargo: string | null;
    interessePlano: string | null;
    tamanhoEquipe: string | null;
    horizonteContratacao: string | null;
    objetivoPrincipal: string | null;
    mensagem: string | null;
    status: LeadStatus;
    source: LeadSource;
    transcript: PublicChatMessage[] | null;
    metadata: PricingChatLeadMetadata | null;
    assignedTo: {
      id: string;
      nome: string;
      email: string;
    } | null;
    createdAt: string;
    updatedAt: string;
    notes: Array<{
      id: string;
      conteudo: string;
      createdAt: string;
      autor: {
        id: string;
        nome: string;
        email: string;
      };
    }>;
  }>
> {
  try {
    const auth = await requireSuperAdminContext();

    if (!auth.success) {
      return auth;
    }

    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        assignedToSuperAdmin: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        notes: {
          orderBy: { createdAt: "desc" },
          include: {
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

    if (!lead) {
      return { success: false, error: "Lead não encontrado." };
    }

    return {
      success: true,
      data: {
        id: lead.id,
        nome: lead.nome,
        email: lead.email,
        telefone: lead.telefone,
        empresa: lead.empresa,
        cargo: lead.cargo,
        interessePlano: lead.interessePlano,
        tamanhoEquipe: lead.tamanhoEquipe,
        horizonteContratacao: lead.horizonteContratacao,
        objetivoPrincipal: lead.objetivoPrincipal,
        mensagem: lead.mensagem,
        status: lead.status,
        source: lead.source,
        transcript: Array.isArray(lead.transcript)
          ? (lead.transcript as PublicChatMessage[])
          : null,
        metadata: parsePricingChatLeadMetadata(lead.metadata),
        assignedTo: lead.assignedToSuperAdmin
          ? {
              id: lead.assignedToSuperAdmin.id,
              nome: `${lead.assignedToSuperAdmin.firstName} ${lead.assignedToSuperAdmin.lastName}`.trim(),
              email: lead.assignedToSuperAdmin.email,
            }
          : null,
        createdAt: lead.createdAt.toISOString(),
        updatedAt: lead.updatedAt.toISOString(),
        notes: lead.notes.map((note) => ({
          id: note.id,
          conteudo: note.conteudo,
          createdAt: note.createdAt.toISOString(),
          autor: {
            id: note.superAdmin.id,
            nome: `${note.superAdmin.firstName} ${note.superAdmin.lastName}`.trim(),
            email: note.superAdmin.email,
          },
        })),
      },
    };
  } catch (error) {
    logger.error("Erro ao carregar detalhes do lead:", error);

    return {
      success: false,
      error: "Falha ao carregar detalhes do lead.",
    };
  }
}

export async function updateLeadStatus(
  leadId: string,
  status: LeadStatus,
  observation?: string,
): Promise<ActionResult<{ id: string; status: LeadStatus }>> {
  try {
    const auth = await requireSuperAdminContext();

    if (!auth.success) {
      return auth;
    }

    if (!Object.values(LeadStatus).includes(status)) {
      return { success: false, error: "Status de lead inválido." };
    }

    const note = sanitizeMultiline(observation, 2000);
    const now = new Date();

    const updatedLead = await prisma.$transaction(async (tx) => {
      const current = await tx.lead.findUnique({
        where: { id: leadId },
        select: {
          id: true,
          status: true,
          firstContactAt: true,
          convertedAt: true,
        },
      });

      if (!current) {
        throw new Error("Lead não encontrado.");
      }

      const data: Record<string, unknown> = {
        status,
        lastInteractionAt: now,
      };

      if (status === LeadStatus.CONTACTED && !current.firstContactAt) {
        data.firstContactAt = now;
      }

      if (status === LeadStatus.WON) {
        data.convertedAt = current.convertedAt ?? now;
        data.closedAt = now;
      } else if (status === LeadStatus.LOST || status === LeadStatus.SPAM) {
        data.closedAt = now;
      } else {
        data.closedAt = null;
        if (current.status === LeadStatus.WON) {
          data.convertedAt = null;
        }
      }

      const lead = await tx.lead.update({
        where: { id: leadId },
        data,
        select: { id: true, status: true },
      });

      if (note) {
        await tx.leadNote.create({
          data: {
            leadId,
            superAdminId: auth.data.superAdminId,
            conteudo: note,
          },
        });
      }

      return lead;
    });

    revalidatePath("/admin/leads");

    return { success: true, data: updatedLead };
  } catch (error) {
    logger.error("Erro ao atualizar status do lead:", error);

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Falha ao atualizar status.",
    };
  }
}

export async function assignLeadToCurrentAdmin(
  leadId: string,
  assignToMe: boolean,
): Promise<
  ActionResult<{ id: string; assignedToSuperAdminId: string | null }>
> {
  try {
    const auth = await requireSuperAdminContext();

    if (!auth.success) {
      return auth;
    }

    const updated = await prisma.lead.update({
      where: { id: leadId },
      data: {
        assignedToSuperAdminId: assignToMe ? auth.data.superAdminId : null,
        lastInteractionAt: new Date(),
      },
      select: { id: true, assignedToSuperAdminId: true },
    });

    revalidatePath("/admin/leads");

    return {
      success: true,
      data: updated,
    };
  } catch (error) {
    logger.error("Erro ao atribuir lead:", error);

    return {
      success: false,
      error: "Falha ao atualizar responsável do lead.",
    };
  }
}

export async function addLeadNote(
  leadId: string,
  conteudo: string,
): Promise<ActionResult<{ id: string; createdAt: string }>> {
  try {
    const auth = await requireSuperAdminContext();

    if (!auth.success) {
      return auth;
    }

    const cleanContent = sanitizeMultiline(conteudo, 2000);

    if (!cleanContent) {
      return {
        success: false,
        error: "Escreva uma observação antes de salvar.",
      };
    }

    const note = await prisma.leadNote.create({
      data: {
        leadId,
        superAdminId: auth.data.superAdminId,
        conteudo: cleanContent,
      },
      select: { id: true, createdAt: true },
    });

    await prisma.lead.update({
      where: { id: leadId },
      data: { lastInteractionAt: new Date() },
      select: { id: true },
    });

    revalidatePath("/admin/leads");

    return {
      success: true,
      data: {
        id: note.id,
        createdAt: note.createdAt.toISOString(),
      },
    };
  } catch (error) {
    logger.error("Erro ao adicionar nota no lead:", error);

    return {
      success: false,
      error: "Falha ao adicionar observação no lead.",
    };
  }
}
