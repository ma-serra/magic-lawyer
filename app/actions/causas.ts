"use server";

import { getSession } from "@/app/lib/auth";
import { logAudit, toAuditJson } from "@/app/lib/audit/log";
import { checkPermission } from "@/app/actions/equipe";
import { revalidatePath } from "next/cache";
import prisma from "@/app/lib/prisma";
import logger from "@/lib/logger";
import { Prisma } from "@/generated/prisma";

type CausaStatusFilter = "all" | "ativas" | "arquivadas";
type CausaOrigemFilter = "all" | "oficiais" | "internas";

const MAX_CAUSAS_PAGE_SIZE = 100;
const CAUSA_OFFICIAL_TIMEOUT_MS = 8000;

type OfficialCausaRow = {
  nome: string;
  codigoCnj?: string | null;
  descricao?: string | null;
};

const OFFICIAL_CAUSA_FALLBACK: OfficialCausaRow[] = [
  {
    nome: "Ação de Conhecimento",
    codigoCnj: "00101",
    descricao: "Ações em geral de conhecimento no processo civil.",
  },
  {
    nome: "Ação de Execução",
    codigoCnj: "00200",
    descricao: "Ações de execução e cumprimento de sentença.",
  },
  {
    nome: "Embargos à Execução",
    codigoCnj: "00201",
    descricao: "Defesa em fase executiva com oposição de embargos.",
  },
  {
    nome: "Mandado de Segurança",
    codigoCnj: "00300",
    descricao: "Remédio constitucional para ilegalidade ou abuso de poder.",
  },
  {
    nome: "Ação de Família",
    codigoCnj: "00400",
    descricao: "Pedidos relacionados a família e sucessões.",
  },
  {
    nome: "Pensão Alimentícia",
    codigoCnj: "00415",
    descricao: "Ações de fixação, revisão ou cobrança de alimentos.",
  },
  {
    nome: "Inventário",
    codigoCnj: "00500",
    descricao: "Procedimentos de partilha e administração de sucessão.",
  },
  {
    nome: "Ação Penal",
    codigoCnj: "00600",
    descricao: "Processos criminais e medidas conexas.",
  },
  {
    nome: "Busca e Apreensão",
    codigoCnj: "00701",
    descricao: "Ação de busca e apreensão de bens móveis.",
  },
  {
    nome: "Ação Trabalhista",
    codigoCnj: "00800",
    descricao: "Reclamações e execuções no âmbito do trabalho.",
  },
];

function normalizeOfficialFeedSource(): string | null {
  const rawUrl = process.env.CAUSAS_OFICIAIS_URL?.trim();

  if (!rawUrl) {
    return null;
  }

  const isAbsolute = /^https?:\/\//i.test(rawUrl);
  if (isAbsolute) {
    return rawUrl;
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    process.env.VERCEL_URL;

  if (!baseUrl) {
    logger.warn(
      "CAUSAS_OFICIAIS_URL está em formato relativo sem base para resolução.",
    );

    return null;
  }

  try {
    const normalizedBase = baseUrl.startsWith("http") ? baseUrl : `https://${baseUrl}`;

    return new URL(rawUrl, normalizedBase).toString();
  } catch (error) {
    logger.warn("Falha ao resolver CAUSAS_OFICIAIS_URL relativa", error);

    return null;
  }
}

function parseOfficialCausa(item: unknown): OfficialCausaRow | null {
  if (!item || typeof item !== "object") {
    return null;
  }

  const candidate = item as Record<string, unknown>;
  const nome =
    typeof candidate.nome === "string"
      ? candidate.nome.trim()
      : typeof candidate.name === "string"
        ? candidate.name.trim()
        : typeof candidate.nomeCausa === "string"
          ? candidate.nomeCausa.trim()
          : "";
  if (!nome) {
    return null;
  }

  const codigoCnj =
    typeof candidate.codigoCnj === "string" && candidate.codigoCnj.trim().length > 0
      ? candidate.codigoCnj.trim()
      : typeof candidate.codigo === "string" && candidate.codigo.trim().length > 0
        ? candidate.codigo.trim()
        : typeof candidate.codigo_cnj === "string" && candidate.codigo_cnj.trim().length > 0
          ? candidate.codigo_cnj.trim()
          : null;

  const descricao =
    typeof candidate.descricao === "string" && candidate.descricao.trim().length > 0
      ? candidate.descricao.trim()
      : typeof candidate.description === "string" && candidate.description.trim().length > 0
        ? candidate.description.trim()
        : typeof candidate.observacao === "string" && candidate.observacao.trim().length > 0
          ? candidate.observacao.trim()
          : null;

  return {
    nome,
    codigoCnj,
    descricao,
  };
}

async function fetchOfficialCausas(): Promise<OfficialCausaRow[]> {
  const sourceUrl = normalizeOfficialFeedSource();
  if (!sourceUrl) {
    logger.warn(
      `CAUSAS_OFICIAIS_URL não definida. Usando fallback interno. Configure para /api/causas-oficiais/cnj.`,
    );
    return OFFICIAL_CAUSA_FALLBACK;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, CAUSA_OFFICIAL_TIMEOUT_MS);

    const response = await fetch(sourceUrl, {
      method: "GET",
      cache: "no-store",
      headers: {
        "User-Agent": "MagicLawyer",
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!response.ok) {
      logger.warn(
        `Fonte oficial de causas não respondeu (${response.status}). Usando fallback interno.`,
      );

      return OFFICIAL_CAUSA_FALLBACK;
    }

    const body: unknown = await response.json();
    if (
      body &&
      typeof body === "object" &&
      "success" in body &&
      body.success === false
    ) {
      logger.warn("Fonte oficial de causas retornou erro:", body);

      return OFFICIAL_CAUSA_FALLBACK;
    }

    const rawItems =
      Array.isArray(body) ? body : Array.isArray((body as { causas?: unknown[] })?.causas)
        ? ((body as { causas: unknown[] }).causas)
        : [];

    const parsed = rawItems
      .map((item) => parseOfficialCausa(item))
      .filter((item): item is OfficialCausaRow => Boolean(item))
      .slice(0, 240);

    if (!parsed.length) {
      logger.warn("Fonte oficial de causas retornou vazio. Usando fallback interno.");

      return OFFICIAL_CAUSA_FALLBACK;
    }

    return parsed;
  } catch (error) {
    logger.warn("Falha ao consultar fonte oficial de causas:", error);

    return OFFICIAL_CAUSA_FALLBACK;
  }
}

function normalizeOficialFilter(origem?: CausaOrigemFilter | null) {
  if (origem === "oficiais") {
    return true;
  }

  if (origem === "internas") {
    return false;
  }

  return undefined;
}

function normalizePageSize(pageSize: number | undefined) {
  if (!pageSize || !Number.isFinite(pageSize)) {
    return undefined;
  }

  return Math.min(
    Math.max(Math.floor(pageSize), 1),
    MAX_CAUSAS_PAGE_SIZE,
  );
}

function normalizePage(page: number | undefined) {
  if (!page || !Number.isFinite(page)) {
    return undefined;
  }

  return Math.max(Math.floor(page), 1);
}

function normalizeOrderDirection(orderDirection: "asc" | "desc" | undefined) {
  if (orderDirection !== "desc") {
    return "asc" as const;
  }

  return orderDirection;
}

function isAdminOrSuperAdmin(userRole?: string | null) {
  return userRole === "ADMIN" || userRole === "SUPER_ADMIN";
}

function isSuperAdmin(userRole?: string | null) {
  return userRole === "SUPER_ADMIN";
}

function getSyncValidationError(userRole?: string | null) {
  return isSuperAdmin(userRole)
    ? "Selecione um escritório para sincronizar as causas oficiais."
    : "Sem permissão para sincronizar causas.";
}

async function resolveTenantForCausaSync(user: any, requestedTenantId?: string | null) {
  const trimmedTenantId =
    typeof requestedTenantId === "string" ? requestedTenantId.trim() : "";

  if (isSuperAdmin(user.role)) {
    if (!trimmedTenantId) {
      return {
        success: false,
        error: getSyncValidationError(user.role),
      } as const;
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: trimmedTenantId },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
      },
    });

    if (!tenant) {
      return {
        success: false,
        error: "Tenant não encontrado.",
      } as const;
    }

    return {
      success: true as const,
      tenantId: tenant.id,
      tenantName: tenant.name,
      tenantSlug: tenant.slug,
      tenantStatus: tenant.status,
    } as const;
  }

  if (!user.tenantId) {
    return {
      success: false,
      error: "Tenant não encontrado",
    } as const;
  }

  if (trimmedTenantId && trimmedTenantId !== user.tenantId) {
    return {
      success: false,
      error: getSyncValidationError(user.role),
    } as const;
  }

  return {
    success: true as const,
    tenantId: user.tenantId,
  } as const;
}

function normalizeStatusFilter(status?: CausaStatusFilter | null) {
  if (status === "ativas") {
    return true;
  }

  if (status === "arquivadas") {
    return false;
  }

  return undefined;
}

function normalizeSearch(search?: string | null) {
  return typeof search === "string" ? search.trim() : "";
}

async function canManageCausas(
  action: "visualizar" | "criar" | "editar",
): Promise<boolean> {
  // Regra atual: privilégios de processos continuam válidos para retrocompatibilidade.
  const canCheckCausa = await checkPermission("causas", action).catch(() => false);
  if (canCheckCausa) {
    return true;
  }

  const canProcessos = await checkPermission("processos", action).catch(() => false);
  if (canProcessos) {
    return true;
  }

  if (action === "visualizar") {
    const canEquipe = await checkPermission("equipe", "editar").catch(() => false);

    return canEquipe;
  }

  return false;
}

export interface CausasListParams {
  page?: number;
  pageSize?: number;
  search?: string | null;
  status?: CausaStatusFilter | null;
  origem?: CausaOrigemFilter | null;
  orderBy?: "nome" | "createdAt" | "updatedAt";
  orderDirection?: "asc" | "desc";
}

type CausaWhereInput = Prisma.CausaWhereInput;

type CausaPayloadBase = Parameters<typeof prisma.causa.create>[0]["data"];

type CausaLoggableData = Record<string, unknown> & {
  id?: string;
  nome?: string | null;
  codigoCnj?: string | null;
  descricao?: string | null;
  ativo?: boolean;
  isOficial?: boolean;
};

export interface CausaPayload {
  nome: string;
  codigoCnj?: string | null;
  descricao?: string | null;
  isOficial?: boolean;
}

export interface CausaListResultItem {
  id: string;
  tenantId: string;
  nome: string;
  codigoCnj: string | null;
  descricao: string | null;
  ativo: boolean;
  isOficial: boolean;
  createdAt: Date;
  updatedAt: Date;
  processoCount?: number;
  diligenciaCount?: number;
  peticaoCount?: number;
  prazoCount?: number;
}

export interface CausasListResult {
  causas: CausaListResultItem[];
  total?: number;
  page?: number;
  pageSize?: number;
  totalPages?: number;
  filtros?: {
    totalAtivas?: number;
    totalArquivadas?: number;
    totalOficiais?: number;
    totalInternas?: number;
  };
}

export async function listCausas(params: CausasListParams = {}) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;

    if (!user.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    const canList = await canManageCausas("visualizar");
    if (!canList && !isAdminOrSuperAdmin(user.role)) {
      return { success: false, error: "Sem permissão para visualizar causas" };
    }

    const normalizedSearch = normalizeSearch(params.search);
    const normalizedStatus = normalizeStatusFilter(params.status);
    const normalizedOrigem = normalizeOficialFilter(params.origem);
    const orderBy = params.orderBy ?? "nome";
    const orderDirection = normalizeOrderDirection(
      params.orderDirection ?? "asc",
    );
    const page = normalizePage(params.page);
    const pageSize = normalizePageSize(params.pageSize);
    const usePagination = page !== undefined && pageSize !== undefined;

    const where: CausaWhereInput = {
      tenantId: user.tenantId,
      ...(normalizedStatus === undefined ? {} : { ativo: normalizedStatus }),
      ...(normalizedOrigem === undefined ? {} : { isOficial: normalizedOrigem }),
      ...(normalizedSearch
        ? {
            OR: [
              {
                nome: { contains: normalizedSearch, mode: Prisma.QueryMode.insensitive },
              },
              {
                codigoCnj: {
                  contains: normalizedSearch,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                descricao: {
                  contains: normalizedSearch,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
            ],
          }
        : {}),
    };

    const orderByOptions: Prisma.CausaOrderByWithRelationInput[] = [
      { [orderBy]: orderDirection } as Prisma.CausaOrderByWithRelationInput,
    ];

    if (orderBy !== "nome") {
      orderByOptions.push({ nome: "asc" });
    }

    if (usePagination) {
      const skip = (page - 1) * pageSize;
      const take = pageSize;

      const [
        causas,
        total,
        totalAtivas,
        totalArquivadas,
        totalOficiais,
        totalInternas,
      ] = await Promise.all([
        prisma.causa.findMany({
          where,
          orderBy: orderByOptions,
          skip,
          take,
          include: {
            _count: {
              select: {
                processos: true,
                diligencias: true,
                peticoes: true,
                prazos: true,
              },
            },
          },
        }),
        prisma.causa.count({ where }),
        prisma.causa.count({ where: { tenantId: user.tenantId, ativo: true } }),
        prisma.causa.count({ where: { tenantId: user.tenantId, ativo: false } }),
        prisma.causa.count({ where: { tenantId: user.tenantId, isOficial: true } }),
        prisma.causa.count({ where: { tenantId: user.tenantId, isOficial: false } }),
      ]);

      const formattedCausas = causas.map((causa) => ({
        ...causa,
        processoCount: causa._count?.processos,
        diligenciaCount: causa._count?.diligencias,
        peticaoCount: causa._count?.peticoes,
        prazoCount: causa._count?.prazos,
      }));

      return {
        success: true,
        causas: formattedCausas,
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / take)),
        filtros: {
          totalAtivas,
          totalArquivadas,
          totalOficiais,
          totalInternas,
        },
      } satisfies { success: true } & CausasListResult;
    }

    const causas = await prisma.causa.findMany({
      where,
      orderBy: orderByOptions,
      include: {
        _count: {
          select: {
            processos: true,
            diligencias: true,
            peticoes: true,
            prazos: true,
          },
        },
      },
    });

    const formattedCausas = causas.map((causa) => ({
      ...causa,
      processoCount: causa._count?.processos,
      diligenciaCount: causa._count?.diligencias,
      peticaoCount: causa._count?.peticoes,
      prazoCount: causa._count?.prazos,
    }));

    return {
        success: true,
        causas: formattedCausas,
      } satisfies { success: true } & CausasListResult;
  } catch (error) {
    logger.error("Erro ao listar causas:", error);

    return {
      success: false,
      error: "Erro ao carregar causas",
    };
  }
}

export async function createCausa(payload: CausaPayload) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;

    if (!user.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    const canCreate = await canManageCausas("criar");
    if (!canCreate && !isAdminOrSuperAdmin(user.role)) {
      return { success: false, error: "Sem permissão para criar causas" };
    }

    if (!payload.nome?.trim()) {
      return { success: false, error: "Nome da causa é obrigatório" };
    }

    const data: CausaPayloadBase = {
      tenantId: user.tenantId,
      nome: payload.nome.trim(),
      codigoCnj: payload.codigoCnj?.trim() || null,
      descricao: payload.descricao?.trim() || null,
      isOficial: payload.isOficial ?? false,
    };

    const causa = await prisma.causa.create({
      data,
    });

    revalidatePath("/causas");

    try {
      await logAudit({
        tenantId: user.tenantId,
        usuarioId: user.id,
        acao: "causa.create",
        entidade: "Causa",
        entidadeId: causa.id,
        dados: toAuditJson({
          ...data,
          id: causa.id,
        } as CausaLoggableData),
      });
    } catch (error) {
      logger.warn("Falha ao registrar auditoria de criação de causa", error);
    }

    return {
      success: true,
      causa,
    };
  } catch (error: any) {
    if (error?.code === "P2002") {
      return {
        success: false,
        error: "Já existe uma causa com este nome",
      };
    }

    logger.error("Erro ao criar causa:", error);

    return {
      success: false,
      error: "Erro ao criar causa",
    };
  }
}

export async function updateCausa(
  causaId: string,
  payload: Partial<CausaPayload>,
) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;

    if (!user.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    const canEdit = await canManageCausas("editar");
    if (!canEdit && !isAdminOrSuperAdmin(user.role)) {
      return { success: false, error: "Sem permissão para editar causas" };
    }

    const causa = await prisma.causa.findFirst({
      where: {
        id: causaId,
        tenantId: user.tenantId,
      },
    });

    if (!causa) {
      return { success: false, error: "Causa não encontrada" };
    }

    const data: Record<string, unknown> = {};

    if (payload.nome !== undefined) {
      if (!payload.nome.trim()) {
        return { success: false, error: "Nome da causa é obrigatório" };
      }
      data.nome = payload.nome.trim();
    }

    if (payload.codigoCnj !== undefined) {
      data.codigoCnj = payload.codigoCnj?.trim() || null;
    }

    if (payload.descricao !== undefined) {
      data.descricao = payload.descricao?.trim() || null;
    }

    if (payload.isOficial !== undefined) {
      data.isOficial = payload.isOficial;
    }

    const updated = await prisma.causa.update({
      where: { id: causa.id },
      data,
    });

    revalidatePath("/causas");

    try {
      await logAudit({
        tenantId: user.tenantId,
        usuarioId: user.id,
        acao: "causa.update",
        entidade: "Causa",
        entidadeId: causa.id,
        dados: toAuditJson({
          id: causa.id,
          ...data,
        } as CausaLoggableData),
        previousValues: toAuditJson({
          id: causa.id,
          nome: causa.nome,
          codigoCnj: causa.codigoCnj,
          descricao: causa.descricao,
          ativo: causa.ativo,
          isOficial: causa.isOficial,
        } as CausaLoggableData),
        changedFields: Object.keys(data),
      });
    } catch (error) {
      logger.warn("Falha ao registrar auditoria de atualização de causa", error);
    }

    return { success: true, causa: updated };
  } catch (error: any) {
    if (error?.code === "P2002") {
      return {
        success: false,
        error: "Já existe uma causa com este nome",
      };
    }

    logger.error("Erro ao atualizar causa:", error);

    return {
      success: false,
      error: "Erro ao atualizar causa",
    };
  }
}

export async function setCausaAtiva(causaId: string, ativo: boolean) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;

    if (!user.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    const canEdit = await canManageCausas("editar");
    if (!canEdit && !isAdminOrSuperAdmin(user.role)) {
      return { success: false, error: "Sem permissão para atualizar causas" };
    }

    const causa = await prisma.causa.findFirst({
      where: { id: causaId, tenantId: user.tenantId },
    });

    if (!causa) {
      return { success: false, error: "Causa não encontrada" };
    }

    const updated = await prisma.causa.update({
      where: { id: causa.id },
      data: { ativo },
    });

    revalidatePath("/causas");

    try {
      await logAudit({
        tenantId: user.tenantId,
        usuarioId: user.id,
        acao: "causa.toggle_status",
        entidade: "Causa",
        entidadeId: causa.id,
        dados: toAuditJson({
          id: causa.id,
          ativo,
        } as CausaLoggableData),
        previousValues: toAuditJson({
          ativo: causa.ativo,
        } as CausaLoggableData),
        changedFields: ["ativo"],
      });
    } catch (error) {
      logger.warn("Falha ao registrar auditoria de status da causa", error);
    }

    return { success: true, causa: updated };
  } catch (error) {
    logger.error("Erro ao alterar status da causa:", error);

    return {
      success: false,
      error: "Erro ao atualizar status da causa",
    };
  }
}

export async function syncCausasOficiais(targetTenantId?: string | null) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;
    if (!isAdminOrSuperAdmin(user.role)) {
      return { success: false, error: "Sem permissão para sincronizar causas" };
    }

    const resolvedTenant = await resolveTenantForCausaSync(
      user,
      targetTenantId,
    );

    if (!resolvedTenant.success) {
      return { success: false, error: resolvedTenant.error };
    }

    const tenantId = resolvedTenant.tenantId;

    const causasOficiais = await fetchOfficialCausas();

    if (!causasOficiais.length) {
      return {
        success: false,
        error: "A fonte oficial retornou vazio. Tente novamente.",
      };
    }

    let criadas = 0;
    let atualizadas = 0;

    for (const causa of causasOficiais) {
      const where = { tenantId_nome: { tenantId, nome: causa.nome } };
      const existing = await prisma.causa.findFirst({
        where: { tenantId, nome: causa.nome },
        select: { id: true },
      });

      const payload: CausaPayloadBase = {
        tenantId,
        nome: causa.nome,
        codigoCnj: causa.codigoCnj || null,
        descricao: causa.descricao || null,
        isOficial: true,
      };

      await prisma.causa.upsert({
        where,
        create: payload,
        update: payload,
      });

      if (existing) {
        atualizadas += 1;
      } else {
        criadas += 1;
      }
    }

    revalidatePath("/causas");

    try {
      await logAudit({
        tenantId,
        usuarioId: user.id,
        acao: "causa.sync_oficial",
        entidade: "Causa",
        dados: toAuditJson({
          criado: criadas,
          atualizado: atualizadas,
          fonte: normalizeOfficialFeedSource() ?? "fallback_local",
          total: causasOficiais.length,
        }),
      });
    } catch (error) {
      logger.warn("Falha ao registrar auditoria de sincronização de causas oficiais", error);
    }

    return {
      success: true,
      criadas,
      atualizadas,
      total: causasOficiais.length,
      tenantId,
      tenant: {
        nome: resolvedTenant.tenantName,
        slug: resolvedTenant.tenantSlug,
        status: resolvedTenant.tenantStatus,
      },
    };
  } catch (error) {
    logger.error("Erro ao sincronizar causas oficiais:", error);

    return {
      success: false,
      error: "Erro ao sincronizar causas oficiais",
    };
  }
}
