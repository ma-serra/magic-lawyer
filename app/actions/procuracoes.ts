"use server";

import { getSession } from "@/app/lib/auth";
import prisma, { toNumber } from "@/app/lib/prisma";
import logger from "@/lib/logger";
import { headers } from "next/headers";
import { logAudit, toAuditJson } from "@/app/lib/audit/log";
import {
  Prisma,
  ProcuracaoEmitidaPor,
  ProcuracaoStatus,
} from "@/generated/prisma";
import { checkPermission } from "@/app/actions/equipe";
import {
  getAccessibleAdvogadoIds,
} from "@/app/lib/advogado-access";
import { gerarPdfProcuracaoBuffer } from "@/app/lib/procuracao-pdf";

type ProcuracaoPermissionAction =
  | "visualizar"
  | "criar"
  | "editar"
  | "excluir";

const PROCURACOES_MODULE = "procuracoes";
const permissionErrors: Record<ProcuracaoPermissionAction, string> = {
  visualizar: "Você não tem permissão para visualizar procurações",
  criar: "Você não tem permissão para criar procurações",
  editar: "Você não tem permissão para editar procurações",
  excluir: "Você não tem permissão para excluir procurações",
};

const AUDIT_ENTITY = "Procuracao";

function isAdminRole(user: { role?: string }) {
  return user.role === "ADMIN" || user.role === "SUPER_ADMIN";
}

async function requirePermission(
  action: ProcuracaoPermissionAction,
): Promise<string | null> {
  const allowed = await checkPermission(PROCURACOES_MODULE, action);

  if (!allowed) {
    return permissionErrors[action];
  }

  return null;
}

async function getScopedProcuracaoId(
  session: { user: any },
  user: any,
  procuracaoId: string,
): Promise<string | null> {
  const whereClause = await buildProcuracaoAccessWhere(session, user, {
    procuracaoId,
  });

  const procuracao = await prisma.procuracao.findFirst({
    where: whereClause,
    select: { id: true },
  });

  return procuracao?.id || null;
}

export { getScopedProcuracaoId };

// ============================================
// TYPES
// ============================================

export interface ProcuracaoFormData {
  numero?: string;
  arquivoUrl?: string;
  observacoes?: string;
  emitidaEm?: Date | string;
  validaAte?: Date | string;
  revogadaEm?: Date | string;
  assinadaPeloClienteEm?: Date | string;
  emitidaPor: "ESCRITORIO" | "ADVOGADO";
  clienteId: string;
  modeloId?: string;
  processoIds?: string[];
  advogadoIds: string[];
  status?: ProcuracaoStatus;
  ativa?: boolean;
  poderes?: {
    titulo?: string;
    descricao: string;
  }[];
}

async function getRequestContext() {
  const headersList = await headers();
  const ipRaw =
    headersList.get("x-forwarded-for") ??
    headersList.get("x-real-ip") ??
    headersList.get("cf-connecting-ip");
  const ip = ipRaw ? ipRaw.split(",")[0]?.trim() || null : null;
  const userAgent = headersList.get("user-agent");

  return { ip, userAgent };
}

function getActorName(user: { firstName?: string | null; lastName?: string | null; email?: string | null; id?: string }) {
  return `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email || user.id || "Usuário";
}

function toDateOrUndefined(value: Date | string | null | undefined): Date | undefined {
  if (!value) {
    return undefined;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value;
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export type ProcuracaoCreateInput = ProcuracaoFormData;

export interface ProcuracaoListFilters {
  search?: string;
  status?: ProcuracaoStatus | "";
  clienteId?: string;
  advogadoId?: string;
  emitidaPor?: ProcuracaoEmitidaPor | "";
}

export interface ProcuracaoListPaginatedParams {
  page?: number;
  pageSize?: number;
  filtros?: ProcuracaoListFilters;
}

interface ProcuracaoListMetrics {
  total: number;
  vigentes: number;
  pendentesAssinatura: number;
  encerradas: number;
  comProcessos: number;
  emitidasPeloEscritorio: number;
}

export interface ProcuracaoListPaginatedResult {
  items: ProcuracaoListItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  metrics: ProcuracaoListMetrics;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

const procuracaoListInclude = Prisma.validator<Prisma.ProcuracaoInclude>()({
  cliente: {
    select: {
      id: true,
      nome: true,
      tipoPessoa: true,
    },
  },
  modelo: {
    select: {
      id: true,
      nome: true,
      categoria: true,
    },
  },
  outorgados: {
    include: {
      advogado: {
        select: {
          id: true,
          oabNumero: true,
          oabUf: true,
          usuario: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
      },
    },
  },
  processos: {
    include: {
      processo: {
        select: {
          id: true,
          numero: true,
          titulo: true,
        },
      },
    },
  },
  poderes: {
    select: {
      id: true,
      titulo: true,
      descricao: true,
      ativo: true,
    },
  },
  _count: {
    select: {
      processos: true,
      outorgados: true,
    },
  },
});

export type ProcuracaoListItem = Prisma.ProcuracaoGetPayload<{
  include: typeof procuracaoListInclude;
}>;

async function getClienteIdFromSession(session: {
  user: any;
}): Promise<string | null> {
  if (!session?.user?.id || !session?.user?.tenantId) return null;

  const cliente = await prisma.cliente.findFirst({
    where: {
      usuarioId: session.user.id,
      tenantId: session.user.tenantId,
    },
    select: {
      id: true,
    },
  });

  return cliente?.id || null;
}

function clampPagination(
  page?: number,
  pageSize?: number,
): { page: number; pageSize: number } {
  const normalizedPage = Number.isFinite(page) ? Number(page) : 1;
  const normalizedPageSize = Number.isFinite(pageSize) ? Number(pageSize) : 12;

  return {
    page: Math.max(1, normalizedPage),
    pageSize: Math.min(Math.max(6, normalizedPageSize), 50),
  };
}

function mergeWhereConditions(
  base: Prisma.ProcuracaoWhereInput,
  extra?: Prisma.ProcuracaoWhereInput,
): Prisma.ProcuracaoWhereInput {
  if (!extra) {
    return base;
  }

  return {
    AND: [base, extra],
  };
}

async function buildProcuracaoAccessWhere(
  session: { user: any },
  user: any,
  opts?: { procuracaoId?: string },
): Promise<Prisma.ProcuracaoWhereInput> {
  let whereClause: Prisma.ProcuracaoWhereInput = {
    tenantId: user.tenantId,
    ...(opts?.procuracaoId ? { id: opts.procuracaoId } : {}),
  };

  const clienteId = await getClienteIdFromSession(session);
  const isAdmin = user.role === "ADMIN" || user.role === "SUPER_ADMIN";

  // Cliente final enxerga apenas suas próprias procurações.
  if (clienteId) {
    return {
      ...whereClause,
      clienteId,
    };
  }

  // Perfis administrativos enxergam todo o tenant.
  if (isAdmin) {
    return whereClause;
  }

  // Colaboradores/advogados seguem escopo por vínculos (inclusive modo estrito).
  const accessibleAdvogados = await getAccessibleAdvogadoIds(session);
  const orConditions: Prisma.ProcuracaoWhereInput[] = [
    {
      outorgados: {
        some: {
          advogadoId: {
            in: accessibleAdvogados,
          },
        },
      },
    },
    {
      cliente: {
        advogadoClientes: {
          some: {
            advogadoId: {
              in: accessibleAdvogados,
            },
          },
        },
      },
    },
    {
      processos: {
        some: {
          processo: {
            advogadoResponsavelId: {
              in: accessibleAdvogados,
            },
          },
        },
      },
    },
  ];

  if (user.role === "ADVOGADO") {
    orConditions.push({
      cliente: {
        usuario: {
          createdById: user.id,
        },
      },
    });
  }

  whereClause = {
    ...whereClause,
    OR: orConditions,
  };

  return whereClause;
}

function buildProcuracaoListWhere(
  accessWhere: Prisma.ProcuracaoWhereInput,
  filtros?: ProcuracaoListFilters,
): Prisma.ProcuracaoWhereInput {
  if (!filtros) {
    return accessWhere;
  }

  const term = filtros.search?.trim();
  const conditions: Prisma.ProcuracaoWhereInput[] = [accessWhere];

  if (term) {
    conditions.push({
      OR: [
        {
          numero: {
            contains: term,
            mode: "insensitive",
          },
        },
        {
          cliente: {
            nome: {
              contains: term,
              mode: "insensitive",
            },
          },
        },
      ],
    });
  }

  if (filtros.status) {
    conditions.push({
      status: filtros.status,
    });
  }

  if (filtros.clienteId) {
    conditions.push({
      clienteId: filtros.clienteId,
    });
  }

  if (filtros.emitidaPor) {
    conditions.push({
      emitidaPor: filtros.emitidaPor,
    });
  }

  if (filtros.advogadoId) {
    conditions.push({
      outorgados: {
        some: {
          advogadoId: filtros.advogadoId,
        },
      },
    });
  }

  if (conditions.length === 1) {
    return accessWhere;
  }

  return {
    AND: conditions,
  };
}

// ============================================
// SERVER ACTIONS
// ============================================

/**
 * Busca todas as procurações do tenant
 */
export async function getAllProcuracoes(): Promise<{
  success: boolean;
  procuracoes?: any[];
  error?: string;
}> {
  try {
    const permissionDenied = await requirePermission("visualizar");

    if (permissionDenied) {
      return {
        success: false,
        error: permissionDenied,
      };
    }

    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;

    if (!user.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    const pageSize = 200;
    let page = 1;
    const procuracoes: Array<any> = [];

    while (true) {
      const result = await getProcuracoesPaginated({
        page,
        pageSize,
        filtros: {
          status: "",
          clienteId: "",
          advogadoId: "",
          emitidaPor: "",
          search: "",
        },
      });

      if (!result.success || !result.data) {
        return {
          success: false,
          error: result.error || "Erro ao buscar todas as procurações",
        };
      }

      // Segurança: respeitar escopo e evitar retorno parcial por mudança de filtros
      const safeItems = result.data.items.filter((item) => item.id);

      procuracoes.push(...safeItems);

      if (page >= result.data.totalPages) {
        break;
      }

      page += 1;
    }

    return {
      success: true,
      procuracoes,
    };
  } catch (error) {
    logger.error("Erro ao buscar todas as procurações:", error);

    return {
      success: false,
      error: "Erro ao buscar procurações",
    };
  }
}

export async function getProcuracoesPaginated(
  params?: ProcuracaoListPaginatedParams,
): Promise<{
  success: boolean;
  data?: ProcuracaoListPaginatedResult;
  error?: string;
}> {
  try {
    const permissionDenied = await requirePermission("visualizar");

    if (permissionDenied) {
      return {
        success: false,
        error: permissionDenied,
      };
    }

    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;
    const { ip, userAgent } = await getRequestContext();
    const actorName = getActorName(user);

    if (!user.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    const { page, pageSize } = clampPagination(params?.page, params?.pageSize);
    const accessWhere = await buildProcuracaoAccessWhere(session, user);
    const where = buildProcuracaoListWhere(accessWhere, params?.filtros);

    const total = await prisma.procuracao.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const currentPage = Math.min(page, totalPages);
    const skip = (currentPage - 1) * pageSize;

    const [items, vigentes, pendentesAssinatura, encerradas, comProcessos, emitidasPeloEscritorio] =
      await Promise.all([
        prisma.procuracao.findMany({
          where,
          include: procuracaoListInclude,
          orderBy: {
            createdAt: "desc",
          },
          skip,
          take: pageSize,
        }),
        prisma.procuracao.count({
          where: mergeWhereConditions(where, {
            status: ProcuracaoStatus.VIGENTE,
          }),
        }),
        prisma.procuracao.count({
          where: mergeWhereConditions(where, {
            status: ProcuracaoStatus.PENDENTE_ASSINATURA,
          }),
        }),
        prisma.procuracao.count({
          where: mergeWhereConditions(where, {
            OR: [
              { status: ProcuracaoStatus.REVOGADA },
              { status: ProcuracaoStatus.EXPIRADA },
            ],
          }),
        }),
        prisma.procuracao.count({
          where: mergeWhereConditions(where, {
            processos: {
              some: {},
            },
          }),
        }),
        prisma.procuracao.count({
          where: mergeWhereConditions(where, {
            emitidaPor: ProcuracaoEmitidaPor.ESCRITORIO,
          }),
        }),
      ]);

    return {
      success: true,
      data: {
        items,
        page: currentPage,
        pageSize,
        total,
        totalPages,
        metrics: {
          total,
          vigentes,
          pendentesAssinatura,
          encerradas,
          comProcessos,
          emitidasPeloEscritorio,
        },
      },
    };
  } catch (error) {
    logger.error("Erro ao buscar procurações paginadas:", error);

    return {
      success: false,
      error: "Erro ao buscar procurações",
    };
  }
}

/**
 * Busca uma procuração por ID
 */
export async function getProcuracaoById(procuracaoId: string): Promise<{
  success: boolean;
  procuracao?: any;
  error?: string;
}> {
  try {
    const permissionDenied = await requirePermission("visualizar");

    if (permissionDenied) {
      return {
        success: false,
        error: permissionDenied,
      };
    }

    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;

    if (!user.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    const scopedId = await getScopedProcuracaoId(session, user, procuracaoId);

    if (!scopedId) {
      return {
        success: false,
        error: "Procuração não encontrada ou sem acesso",
      };
    }

    const procuracao = await prisma.procuracao.findFirst({
      where: { id: scopedId },
      include: {
        cliente: {
          select: {
            id: true,
            nome: true,
            tipoPessoa: true,
            documento: true,
            email: true,
            telefone: true,
          },
        },
        modelo: {
          select: {
            id: true,
            nome: true,
            categoria: true,
            conteudo: true,
          },
        },
        outorgados: {
          include: {
            advogado: {
              include: {
                usuario: {
                  select: {
                    firstName: true,
                    lastName: true,
                    email: true,
                  },
                },
              },
            },
          },
        },
        processos: {
          include: {
            processo: {
              select: {
                id: true,
                numero: true,
                titulo: true,
                status: true,
              },
            },
          },
        },
        poderes: {
          select: {
            id: true,
            titulo: true,
            descricao: true,
            ativo: true,
            revogadoEm: true,
            createdAt: true,
          },
          orderBy: [{ ativo: "desc" }, { createdAt: "desc" }],
        },
        createdBy: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!procuracao) {
      return {
        success: false,
        error: "Procuração não encontrada ou sem acesso",
      };
    }

    // Converter Decimals para number nos advogados outorgados
    const procuracaoSerializada = {
      ...procuracao,
      outorgados: procuracao.outorgados?.map((outorgado: any) => ({
        ...outorgado,
        advogado: {
          ...outorgado.advogado,
          comissaoPadrao: toNumber(outorgado.advogado.comissaoPadrao) || 0,
          comissaoAcaoGanha:
            toNumber(outorgado.advogado.comissaoAcaoGanha) || 0,
          comissaoHonorarios:
            toNumber(outorgado.advogado.comissaoHonorarios) || 0,
        },
      })),
    };

    return {
      success: true,
      procuracao: procuracaoSerializada,
    };
  } catch (error) {
    logger.error("Erro ao buscar procuração:", error);

    return {
      success: false,
      error: "Erro ao buscar procuração",
    };
  }
}

/**
 * Busca procurações de um cliente
 */
export async function getProcuracoesCliente(clienteId: string): Promise<{
  success: boolean;
  procuracoes?: any[];
  error?: string;
}> {
  try {
    const permissionDenied = await requirePermission("visualizar");

    if (permissionDenied) {
      return {
        success: false,
        error: permissionDenied,
      };
    }

    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;

    if (!user.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    // Verificar acesso ao cliente
    let whereCliente: Prisma.ClienteWhereInput = {
      id: clienteId,
      tenantId: user.tenantId,
      deletedAt: null,
    };

    // Se não for ADMIN, aplicar escopo por vínculos do usuário.
    if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
      const accessibleAdvogados = await getAccessibleAdvogadoIds(session);

      if (user.role === "ADVOGADO") {
        whereCliente = {
          ...whereCliente,
          OR: [
            {
              advogadoClientes: {
                some: {
                  advogadoId: {
                    in: accessibleAdvogados,
                  },
                },
              },
            },
            {
              usuario: {
                createdById: user.id,
              },
            },
          ],
        };
      } else {
        whereCliente.advogadoClientes = {
          some: {
            advogadoId: {
              in: accessibleAdvogados,
            },
          },
        };
      }
    }

    // Verificar se cliente existe e está acessível
    const cliente = await prisma.cliente.findFirst({
      where: whereCliente,
    });

    if (!cliente) {
      return { success: false, error: "Cliente não encontrado ou sem acesso" };
    }

    const procuracoes = await prisma.procuracao.findMany({
      where: {
        clienteId: clienteId,
        tenantId: user.tenantId,
      },
      include: {
        modelo: {
          select: {
            id: true,
            nome: true,
            categoria: true,
          },
        },
        outorgados: {
          include: {
            advogado: {
              select: {
                id: true,
                oabNumero: true,
                oabUf: true,
                especialidades: true,
                bio: true,
                telefone: true,
                whatsapp: true,
                usuario: {
                  select: {
                    firstName: true,
                    lastName: true,
                  },
                },
              },
            },
          },
        },
        processos: {
          include: {
            processo: {
              select: {
                id: true,
                numero: true,
                titulo: true,
              },
            },
          },
        },
        _count: {
          select: {
            processos: true,
            outorgados: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return {
      success: true,
      procuracoes: procuracoes,
    };
  } catch (error) {
    logger.error("Erro ao buscar procurações do cliente:", error);

    return {
      success: false,
      error: "Erro ao buscar procurações do cliente",
    };
  }
}

export async function generateProcuracaoPdf(procuracaoId: string): Promise<{
  success: boolean;
  fileName?: string;
  data?: string;
  error?: string;
}> {
  try {
    const permissionDenied = await requirePermission("visualizar");

    if (permissionDenied) {
      return {
        success: false,
        error: permissionDenied,
      };
    }

    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;

    if (!user.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    const scopedId = await getScopedProcuracaoId(session, user, procuracaoId);

    if (!scopedId) {
      return {
        success: false,
        error: "Procuração não encontrada ou sem acesso",
      };
    }

    const procuracao = await prisma.procuracao.findFirst({
      where: { id: scopedId },
      include: {
        cliente: {
          select: {
            nome: true,
            documento: true,
            email: true,
            telefone: true,
            tipoPessoa: true,
          },
        },
        outorgados: {
          include: {
            advogado: {
              select: {
                oabNumero: true,
                oabUf: true,
                usuario: {
                  select: {
                    firstName: true,
                    lastName: true,
                  },
                },
              },
            },
          },
        },
        poderes: {
          where: {
            ativo: true,
          },
          select: {
            titulo: true,
            descricao: true,
          },
          orderBy: {
            createdAt: "asc",
          },
        },
      },
    });

    if (!procuracao) {
      return {
        success: false,
        error: "Procuração não encontrada ou sem acesso",
      };
    }

    const pdfBuffer = gerarPdfProcuracaoBuffer({
      numero: procuracao.numero,
      status: procuracao.status,
      emitidaPor: procuracao.emitidaPor,
      emitidaEm: procuracao.emitidaEm,
      validaAte: procuracao.validaAte,
      revogadaEm: procuracao.revogadaEm,
      observacoes: procuracao.observacoes,
      createdAt: procuracao.createdAt,
      modeloNomeSnapshot: procuracao.modeloNomeSnapshot,
      modeloConteudoSnapshot: procuracao.modeloConteudoSnapshot,
      modeloVersaoSnapshot: procuracao.modeloVersaoSnapshot,
      cliente: procuracao.cliente,
      outorgados: procuracao.outorgados.map((item) => ({
        nome: `${item.advogado.usuario.firstName ?? ""} ${item.advogado.usuario.lastName ?? ""}`.trim(),
        oabNumero: item.advogado.oabNumero,
        oabUf: item.advogado.oabUf,
      })),
      poderes: procuracao.poderes,
    });

    const safeNumber =
      procuracao.numero?.trim().replace(/[^a-zA-Z0-9-_]/g, "-") ||
      procuracao.id;
    const fileName = `procuracao-${safeNumber}.pdf`;

    return {
      success: true,
      fileName,
      data: pdfBuffer.toString("base64"),
    };
  } catch (error) {
    logger.error("Erro ao gerar PDF da procuração:", error);

    return {
      success: false,
      error: "Erro ao gerar PDF da procuração",
    };
  }
}

/**
 * Cria uma nova procuração
 */
export async function createProcuracao(data: ProcuracaoFormData): Promise<{
  success: boolean;
  procuracao?: any;
  error?: string;
}> {
  try {
    const permissionDenied = await requirePermission("criar");

    if (permissionDenied) {
      return {
        success: false,
        error: permissionDenied,
      };
    }

    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;
    const actorName = getActorName(user);
    const { ip, userAgent } = await getRequestContext();

    if (!user.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    const isAdmin = isAdminRole(user);
    const advogadoIdsPermitidos = await getAccessibleAdvogadoIds(session);
    const advogadoIds = Array.from(
      new Set((data.advogadoIds ?? []).filter(Boolean)),
    );
    const processoIds = Array.from(
      new Set((data.processoIds ?? []).filter(Boolean)),
    );
    const whereCliente = isAdmin
      ? {
          id: data.clienteId,
          tenantId: user.tenantId,
          deletedAt: null,
        }
      : {
          id: data.clienteId,
          tenantId: user.tenantId,
          deletedAt: null,
          OR: [
            {
              advogadoClientes: {
                some: {
                  advogadoId: {
                    in: advogadoIdsPermitidos,
                  },
                },
              },
            },
            {
              usuario: {
                createdById: user.id,
              },
            },
          ],
        };

    const cliente = await prisma.cliente.findFirst({
      where: whereCliente,
    });

    if (!cliente) {
      return {
        success: false,
        error: "Cliente não encontrado ou sem acesso para criação",
      };
    }

    let modeloSnapshot:
      | {
          id: string;
          nome: string;
          categoria: string | null;
          conteudo: string;
          versao: number;
          updatedAt: Date;
        }
      | null = null;

    // Verificar se o modelo existe (se fornecido)
    if (data.modeloId) {
      const modelo = await prisma.modeloProcuracao.findFirst({
        where: {
          id: data.modeloId,
          tenantId: user.tenantId,
          deletedAt: null,
          ativo: true,
        },
      });

      if (!modelo) {
        return { success: false, error: "Modelo não encontrado" };
      }

      const ultimaVersao = await prisma.modeloProcuracaoVersao.findFirst({
        where: {
          modeloId: modelo.id,
        },
        select: {
          versao: true,
        },
        orderBy: {
          versao: "desc",
        },
      });

      modeloSnapshot = {
        id: modelo.id,
        nome: modelo.nome,
        categoria: modelo.categoria,
        conteudo: modelo.conteudo,
        versao: ultimaVersao?.versao ?? 1,
        updatedAt: modelo.updatedAt,
      };
    }

    if (advogadoIds.length > 0) {
      const advogados = await prisma.advogado.findMany({
        where: {
          id: {
            in: advogadoIds,
          },
          tenantId: user.tenantId,
        },
      });

      if (advogados.length !== advogadoIds.length) {
        return {
          success: false,
          error: "Um ou mais advogados não encontrados",
        };
      }

      if (!isAdmin && !advogadoIds.every((id) => advogadoIdsPermitidos.includes(id))) {
        return {
          success: false,
          error: "Você não tem acesso a um ou mais advogados informados",
        };
      }
    }

    // Verificar se os processos existem e estão acessíveis (se fornecidos)
    if (processoIds.length > 0) {
      const processoFilter: Prisma.ProcessoWhereInput = {
        id: {
          in: processoIds,
        },
        clienteId: data.clienteId,
        tenantId: user.tenantId,
        deletedAt: null,
      };

      if (!isAdminRole(user)) {
        processoFilter.OR = [
          {
            advogadoResponsavelId: {
              in: advogadoIdsPermitidos,
            },
          },
          {
            cliente: {
              advogadoClientes: {
                some: {
                  advogadoId: {
                    in: advogadoIdsPermitidos,
                  },
                },
              },
            },
          },
        ];
      }

      const processos = await prisma.processo.findMany({
        where: processoFilter,
      });

      if (processos.length !== processoIds.length) {
        return {
          success: false,
          error: "Um ou mais processos não encontrados, fora do cliente ou sem acesso",
        };
      }
    }

    const procuracao = await prisma.$transaction(async (tx) => {
      const criada = await tx.procuracao.create({
        data: {
          tenantId: user.tenantId,
          clienteId: data.clienteId,
          modeloId: modeloSnapshot?.id,
          modeloNomeSnapshot: modeloSnapshot?.nome,
          modeloCategoriaSnapshot: modeloSnapshot?.categoria,
          modeloConteudoSnapshot: modeloSnapshot?.conteudo,
          modeloVersaoSnapshot: modeloSnapshot?.versao,
          modeloAtualizadoEmSnapshot: modeloSnapshot?.updatedAt,
          numero: data.numero,
          arquivoUrl: data.arquivoUrl,
          observacoes: data.observacoes,
          emitidaEm: toDateOrUndefined(data.emitidaEm),
          validaAte: toDateOrUndefined(data.validaAte),
          revogadaEm: toDateOrUndefined(data.revogadaEm),
          assinadaPeloClienteEm: toDateOrUndefined(data.assinadaPeloClienteEm),
          emitidaPor:
            data.emitidaPor === "ADVOGADO"
              ? ProcuracaoEmitidaPor.ADVOGADO
              : ProcuracaoEmitidaPor.ESCRITORIO,
          status: data.status ?? ProcuracaoStatus.RASCUNHO,
          ativa: data.ativa ?? true,
          createdById: user.id,
        },
        select: {
          id: true,
        },
      });

      if (advogadoIds.length > 0) {
        await tx.procuracaoAdvogado.createMany({
          data: advogadoIds.map((advogadoId) => ({
            tenantId: user.tenantId,
            procuracaoId: criada.id,
            advogadoId,
          })),
        });
      }

      if (processoIds.length > 0) {
        await tx.procuracaoProcesso.createMany({
          data: processoIds.map((processoId) => ({
            tenantId: user.tenantId,
            procuracaoId: criada.id,
            processoId,
          })),
        });
      }

      const poderesParaCriar = (data.poderes ?? [])
        .map((poder) => ({
          titulo: poder.titulo?.trim() || null,
          descricao: poder.descricao.trim(),
        }))
        .filter((poder) => poder.descricao.length > 0);

      if (poderesParaCriar.length > 0) {
        await tx.procuracaoPoder.createMany({
          data: poderesParaCriar.map((poder) => ({
            tenantId: user.tenantId,
            procuracaoId: criada.id,
            titulo: poder.titulo,
            descricao: poder.descricao,
          })),
        });
      }

      return tx.procuracao.findUniqueOrThrow({
        where: {
          id: criada.id,
        },
        include: procuracaoListInclude,
      });
    });

    try {
      await logAudit({
        tenantId: user.tenantId,
        usuarioId: user.id,
        acao: "PROCURAÇÃO_CRIADA",
        entidade: AUDIT_ENTITY,
        entidadeId: procuracao.id,
        dados: toAuditJson({
          actor: actorName,
          numero: procuracao.numero,
          clienteId: procuracao.clienteId,
          modeloId: procuracao.modeloId,
          status: procuracao.status,
          ativo: procuracao.ativa,
          emitidaPor: procuracao.emitidaPor,
          processoIds,
          advogadoIds,
          poderesCount: procuracao.poderes?.length,
        }),
        changedFields: [
          "clienteId",
          "modeloId",
          "numero",
          "status",
          "emitidaPor",
          "ativa",
          "processoIds",
          "advogadoIds",
          "poderes",
        ],
        ip,
        userAgent,
      });
    } catch (auditError) {
      logger.warn("Falha ao registrar auditoria de criação de procuração", auditError);
    }

    return {
      success: true,
      procuracao: procuracao,
    };
  } catch (error) {
    logger.error("Erro ao criar procuração:", error);

    return {
      success: false,
      error: "Erro ao criar procuração",
    };
  }
}

// ============================================
// UPDATE PROCURAÇÃO
// ============================================

export interface ProcuracaoUpdateInput {
  numero?: string;
  arquivoUrl?: string;
  observacoes?: string;
  emitidaEm?: string | Date;
  validaAte?: string | Date;
  revogadaEm?: string | Date;
  status?: ProcuracaoStatus;
  emitidaPor?: ProcuracaoEmitidaPor;
  ativa?: boolean;
}

export async function updateProcuracao(
  procuracaoId: string,
  data: ProcuracaoUpdateInput,
): Promise<{
  success: boolean;
  procuracao?: any;
  error?: string;
}> {
  try {
    const permissionDenied = await requirePermission("editar");

    if (permissionDenied) {
      return {
        success: false,
        error: permissionDenied,
      };
    }

    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;
    const { ip, userAgent } = await getRequestContext();
    const actorName = getActorName(user);

    if (!user.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    const scopedProcuracaoId = await getScopedProcuracaoId(session, user, procuracaoId);

    if (!scopedProcuracaoId) {
      return {
        success: false,
        error: "Procuração não encontrada ou sem acesso",
      };
    }

    const procuracaoAnterior = await prisma.procuracao.findFirst({
      where: {
        id: scopedProcuracaoId,
        tenantId: user.tenantId,
      },
      include: {
        outorgados: {
          select: { id: true, advogadoId: true },
        },
        processos: {
          select: { id: true, processoId: true },
        },
        poderes: {
          select: { id: true, titulo: true, descricao: true, ativo: true },
        },
      },
    });

    if (!procuracaoAnterior) {
      return {
        success: false,
        error: "Procuração não encontrada",
      };
    }

    const updateData: Prisma.ProcuracaoUpdateInput = {
      numero: data.numero,
      arquivoUrl: data.arquivoUrl,
      observacoes: data.observacoes,
      emitidaEm: data.emitidaEm ? toDateOrUndefined(data.emitidaEm) : undefined,
      validaAte: data.validaAte ? toDateOrUndefined(data.validaAte) : undefined,
      revogadaEm: data.revogadaEm ? toDateOrUndefined(data.revogadaEm) : undefined,
      status: data.status,
      emitidaPor: data.emitidaPor,
      ativa: data.ativa,
    };

    // Atualizar procuração
    const procuracao = await prisma.procuracao.update({
      where: {
        id: scopedProcuracaoId,
      },
      data: updateData,
      include: procuracaoListInclude,
    });

    const changedFields = Object.keys(updateData).filter(
      (field) => updateData[field as keyof typeof updateData] !== undefined,
    );

    if (changedFields.length > 0) {
      try {
        await logAudit({
          tenantId: user.tenantId,
          usuarioId: user.id,
          acao: "PROCURAÇÃO_ATUALIZADA",
          entidade: AUDIT_ENTITY,
          entidadeId: procuracao.id,
          dados: toAuditJson({
            actor: actorName,
            numero: procuracao.numero,
            arquivoUrl: procuracao.arquivoUrl,
            observacoes: procuracao.observacoes,
            emitidaEm: procuracao.emitidaEm,
            validaAte: procuracao.validaAte,
            revogadaEm: procuracao.revogadaEm,
            status: procuracao.status,
            emitidaPor: procuracao.emitidaPor,
            ativa: procuracao.ativa,
          }),
          previousValues: toAuditJson({
            numero: procuracaoAnterior.numero,
            arquivoUrl: procuracaoAnterior.arquivoUrl,
            observacoes: procuracaoAnterior.observacoes,
            emitidaEm: procuracaoAnterior.emitidaEm,
            validaAte: procuracaoAnterior.validaAte,
            revogadaEm: procuracaoAnterior.revogadaEm,
            status: procuracaoAnterior.status,
            emitidaPor: procuracaoAnterior.emitidaPor,
            ativa: procuracaoAnterior.ativa,
          }),
          changedFields: changedFields.map((field) => String(field)),
          ip,
          userAgent,
        });
      } catch (auditError) {
        logger.warn("Falha ao registrar auditoria de atualização de procuração", auditError);
      }
    }

    return {
      success: true,
      procuracao,
    };
  } catch (error) {
    logger.error("Erro ao atualizar procuração:", error);

    return {
      success: false,
      error: "Erro ao atualizar procuração",
    };
  }
}

// ============================================
// DELETE PROCURAÇÃO
// ============================================

export async function deleteProcuracao(procuracaoId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
  const permissionDenied = await requirePermission("excluir");

    if (permissionDenied) {
      return {
        success: false,
        error: permissionDenied,
      };
    }

    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;
    const { ip, userAgent } = await getRequestContext();
    const actorName = getActorName(user);

    if (!user.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    const scopedProcuracaoId = await getScopedProcuracaoId(session, user, procuracaoId);

    if (!scopedProcuracaoId) {
      return {
        success: false,
        error: "Procuração não encontrada ou sem acesso",
      };
    }

    const procuracao = await prisma.procuracao.findUnique({
      where: {
        id: scopedProcuracaoId,
      },
      select: {
        id: true,
        numero: true,
        observacoes: true,
        status: true,
        ativa: true,
        clienteId: true,
        modeloId: true,
        _count: {
          select: {
            outorgados: true,
            processos: true,
            poderes: true,
          },
        },
      },
    });

    if (!procuracao) {
      return {
        success: false,
        error: "Procuração não encontrada",
      };
    }

    // Deletar procuração (cascade deleta os relacionamentos)
    await prisma.procuracao.delete({
      where: {
        id: scopedProcuracaoId,
      },
    });

    try {
      await logAudit({
        tenantId: user.tenantId,
        usuarioId: user.id,
        acao: "PROCURAÇÃO_EXCLUÍDA",
        entidade: AUDIT_ENTITY,
        entidadeId: procuracao.id,
        dados: toAuditJson({
          actor: actorName,
          numero: procuracao.numero,
          clienteId: procuracao.clienteId,
          modeloId: procuracao.modeloId,
          status: procuracao.status,
          ativo: procuracao.ativa,
          totalOutorgados: procuracao._count?.outorgados ?? 0,
          totalProcessos: procuracao._count?.processos ?? 0,
          totalPoderes: procuracao._count?.poderes ?? 0,
        }),
        previousValues: toAuditJson({
          numero: procuracao.numero,
          observacoes: procuracao.observacoes,
          status: procuracao.status,
          ativa: procuracao.ativa,
          deletedAt: new Date().toISOString(),
        }),
        changedFields: ["deleted"],
        ip,
        userAgent,
      });
    } catch (auditError) {
      logger.warn("Falha ao registrar auditoria de exclusão de procuração", auditError);
    }

    return {
      success: true,
    };
  } catch (error) {
    logger.error("Erro ao deletar procuração:", error);

    return {
      success: false,
      error: "Erro ao deletar procuração",
    };
  }
}

// ============================================
// ADVOGADOS
// ============================================

export async function adicionarAdvogadoNaProcuracao(
  procuracaoId: string,
  advogadoId: string,
): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const permissionDenied = await requirePermission("editar");

    if (permissionDenied) {
      return {
        success: false,
        error: permissionDenied,
      };
    }

    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;
    const actorName = getActorName(user);
    const { ip, userAgent } = await getRequestContext();

    if (!user.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    const scopedProcuracaoId = await getScopedProcuracaoId(session, user, procuracaoId);

    if (!scopedProcuracaoId) {
      return {
        success: false,
        error: "Procuração não encontrada ou sem acesso",
      };
    }

    // Verificar se o advogado existe
    const advogado = await prisma.advogado.findFirst({
      where: {
        id: advogadoId,
        tenantId: user.tenantId,
      },
    });

    if (!advogado) {
      return { success: false, error: "Advogado não encontrado" };
    }

    // Verificar se já existe o vínculo
    const vinculoExistente = await prisma.procuracaoAdvogado.findFirst({
      where: {
        procuracaoId: scopedProcuracaoId,
        advogadoId,
        tenantId: user.tenantId,
      },
    });

    if (vinculoExistente) {
      return { success: false, error: "Advogado já está na procuração" };
    }

    if (!isAdminRole(user)) {
      const advogadoIdsPermitidos = await getAccessibleAdvogadoIds(session);

      if (!advogadoIdsPermitidos.includes(advogadoId)) {
        return {
          success: false,
          error: "Você não tem acesso a este advogado",
        };
      }
    }

    const procuracao = await prisma.procuracao.findFirst({
      where: {
        id: scopedProcuracaoId,
        tenantId: user.tenantId,
      },
      select: {
        id: true,
        numero: true,
        clienteId: true,
      },
    });

    if (!procuracao) {
      return { success: false, error: "Procuração não encontrada" };
    }

    // Criar vínculo
    await prisma.procuracaoAdvogado.create({
      data: {
        tenantId: user.tenantId,
        procuracaoId: scopedProcuracaoId,
        advogadoId,
      },
    });

    try {
      await logAudit({
        tenantId: user.tenantId,
        usuarioId: user.id,
        acao: "PROCURAÇÃO_ADVOGADO_ADICIONADO",
        entidade: AUDIT_ENTITY,
        entidadeId: scopedProcuracaoId,
        dados: toAuditJson({
          actor: actorName,
          procuracaoNumero: procuracao.numero,
          procuracaoId: scopedProcuracaoId,
          clienteId: procuracao.clienteId,
          advogadoId,
        }),
        changedFields: ["advogadoIds"],
        ip,
        userAgent,
      });
    } catch (auditError) {
      logger.warn(
        "Falha ao registrar auditoria de adição de advogado em procuração",
        auditError,
      );
    }

    return {
      success: true,
    };
  } catch (error) {
    logger.error("Erro ao adicionar advogado na procuração:", error);

    return {
      success: false,
      error: "Erro ao adicionar advogado na procuração",
    };
  }
}

export async function removerAdvogadoDaProcuracao(
  procuracaoId: string,
  advogadoId: string,
): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const permissionDenied = await requirePermission("editar");

    if (permissionDenied) {
      return {
        success: false,
        error: permissionDenied,
      };
    }

    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;
    const actorName = getActorName(user);
    const { ip, userAgent } = await getRequestContext();

    if (!user.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    const scopedProcuracaoId = await getScopedProcuracaoId(session, user, procuracaoId);

    if (!scopedProcuracaoId) {
      return {
        success: false,
        error: "Procuração não encontrada ou sem acesso",
      };
    }

    const procuracao = await prisma.procuracao.findFirst({
      where: {
        id: scopedProcuracaoId,
        tenantId: user.tenantId,
      },
      select: {
        id: true,
        numero: true,
        clienteId: true,
      },
    });

    if (!procuracao) {
      return { success: false, error: "Procuração não encontrada" };
    }

    // Remover vínculo
    const result = await prisma.procuracaoAdvogado.deleteMany({
      where: {
        procuracaoId: scopedProcuracaoId,
        advogadoId,
        tenantId: user.tenantId,
      },
    });

    if (result.count === 0) {
      return { success: false, error: "Vínculo não encontrado" };
    }

    try {
      await logAudit({
        tenantId: user.tenantId,
        usuarioId: user.id,
        acao: "PROCURAÇÃO_ADVOGADO_REMOVIDO",
        entidade: AUDIT_ENTITY,
        entidadeId: scopedProcuracaoId,
        dados: toAuditJson({
          actor: actorName,
          procuracaoNumero: procuracao.numero,
          procuracaoId: scopedProcuracaoId,
          clienteId: procuracao.clienteId,
          advogadoId,
        }),
        changedFields: ["advogadoIds"],
        ip,
        userAgent,
      });
    } catch (auditError) {
      logger.warn(
        "Falha ao registrar auditoria de remoção de advogado da procuração",
        auditError,
      );
    }

    return {
      success: true,
    };
  } catch (error) {
    logger.error("Erro ao remover advogado da procuração:", error);

    return {
      success: false,
      error: "Erro ao remover advogado da procuração",
    };
  }
}

// ============================================
// PROCESSOS
// ============================================

export async function vincularProcesso(
  procuracaoId: string,
  processoId: string,
): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const permissionDenied = await requirePermission("editar");

    if (permissionDenied) {
      return {
        success: false,
        error: permissionDenied,
      };
    }

    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;
    const actorName = getActorName(user);
    const { ip, userAgent } = await getRequestContext();

    if (!user.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    const scopedProcuracaoId = await getScopedProcuracaoId(session, user, procuracaoId);

    if (!scopedProcuracaoId) {
      return {
        success: false,
        error: "Procuração não encontrada ou sem acesso",
      };
    }

    const procuracao = await prisma.procuracao.findFirst({
      where: {
        id: scopedProcuracaoId,
        tenantId: user.tenantId,
      },
      select: {
        id: true,
        numero: true,
        clienteId: true,
      },
    });

    if (!procuracao) {
      return { success: false, error: "Procuração não encontrada" };
    }

    const processoWhere: Prisma.ProcessoWhereInput = {
      id: processoId,
      tenantId: user.tenantId,
      deletedAt: null,
      clienteId: procuracao.clienteId,
    };

    if (!isAdminRole(user)) {
      const advogadoIdsPermitidos = await getAccessibleAdvogadoIds(session);

      processoWhere.OR = [
        {
          advogadoResponsavelId: {
            in: advogadoIdsPermitidos,
          },
        },
        {
          cliente: {
            advogadoClientes: {
              some: {
                advogadoId: {
                  in: advogadoIdsPermitidos,
                },
              },
            },
          },
        },
      ];
    }

    const processo = await prisma.processo.findFirst({
      where: processoWhere,
    });

    if (!processo) {
      return { success: false, error: "Processo não encontrado" };
    }

    // Verificar se já existe o vínculo
    const vinculoExistente = await prisma.procuracaoProcesso.findFirst({
      where: {
        procuracaoId: scopedProcuracaoId,
        processoId,
        tenantId: user.tenantId,
      },
    });

    if (vinculoExistente) {
      return { success: false, error: "Processo já está vinculado" };
    }

    // Criar vínculo
    await prisma.procuracaoProcesso.create({
      data: {
        tenantId: user.tenantId,
        procuracaoId: scopedProcuracaoId,
        processoId,
      },
    });

    try {
      await logAudit({
        tenantId: user.tenantId,
        usuarioId: user.id,
        acao: "PROCURAÇÃO_PROCESSO_VINCULADO",
        entidade: AUDIT_ENTITY,
        entidadeId: scopedProcuracaoId,
        dados: toAuditJson({
          actor: actorName,
          procuracaoNumero: procuracao.numero,
          procuracaoId: scopedProcuracaoId,
          clienteId: procuracao.clienteId,
          processoId,
        }),
        changedFields: ["processoIds"],
        ip,
        userAgent,
      });
    } catch (auditError) {
      logger.warn(
        "Falha ao registrar auditoria de vínculo de processo na procuração",
        auditError,
      );
    }

    return {
      success: true,
    };
  } catch (error) {
    logger.error("Erro ao vincular processo:", error);

    return {
      success: false,
      error: "Erro ao vincular processo",
    };
  }
}

export async function desvincularProcesso(
  procuracaoId: string,
  processoId: string,
): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const permissionDenied = await requirePermission("editar");

    if (permissionDenied) {
      return {
        success: false,
        error: permissionDenied,
      };
    }

    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;
    const actorName = getActorName(user);
    const { ip, userAgent } = await getRequestContext();

    if (!user.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    const scopedProcuracaoId = await getScopedProcuracaoId(session, user, procuracaoId);

    if (!scopedProcuracaoId) {
      return {
        success: false,
        error: "Procuração não encontrada ou sem acesso",
      };
    }

    const procuracao = await prisma.procuracao.findFirst({
      where: {
        id: scopedProcuracaoId,
        tenantId: user.tenantId,
      },
      select: {
        id: true,
        numero: true,
        clienteId: true,
      },
    });

    if (!procuracao) {
      return { success: false, error: "Procuração não encontrada" };
    }

    const vinculoAtual = await prisma.procuracaoProcesso.findFirst({
      where: {
        procuracaoId: scopedProcuracaoId,
        processoId,
        tenantId: user.tenantId,
      },
      select: { id: true },
    });

    if (!vinculoAtual) {
      return { success: false, error: "Vínculo não encontrado" };
    }

    // Remover vínculo
    const result = await prisma.procuracaoProcesso.deleteMany({
      where: {
        procuracaoId: scopedProcuracaoId,
        processoId,
        tenantId: user.tenantId,
      },
    });

    if (result.count === 0) {
      return { success: false, error: "Vínculo não encontrado" };
    }

    try {
      await logAudit({
        tenantId: user.tenantId,
        usuarioId: user.id,
        acao: "PROCURAÇÃO_PROCESSO_DESVINCULADO",
        entidade: AUDIT_ENTITY,
        entidadeId: scopedProcuracaoId,
        dados: toAuditJson({
          actor: actorName,
          procuracaoNumero: procuracao.numero,
          procuracaoId: scopedProcuracaoId,
          clienteId: procuracao.clienteId,
          processoId,
        }),
        changedFields: ["processoIds"],
        ip,
        userAgent,
      });
    } catch (auditError) {
      logger.warn(
        "Falha ao registrar auditoria de remoção de processo da procuração",
        auditError,
      );
    }

    return {
      success: true,
    };
  } catch (error) {
    logger.error("Erro ao desvincular processo:", error);

    return {
      success: false,
      error: "Erro ao desvincular processo",
    };
  }
}

// ============================================
// PODERES OUTORGADOS
// ============================================

export async function adicionarPoderNaProcuracao(
  procuracaoId: string,
  data: {
    titulo?: string;
    descricao: string;
  },
): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const permissionDenied = await requirePermission("editar");

    if (permissionDenied) {
      return {
        success: false,
        error: permissionDenied,
      };
    }

    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;
    const actorName = getActorName(user);
    const { ip, userAgent } = await getRequestContext();

    if (!user.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    const descricao = data.descricao?.trim();
    const titulo = data.titulo?.trim();

    if (!descricao) {
      return { success: false, error: "Descrição do poder é obrigatória" };
    }

    const scopedProcuracaoId = await getScopedProcuracaoId(session, user, procuracaoId);

    if (!scopedProcuracaoId) {
      return {
        success: false,
        error: "Procuração não encontrada ou sem acesso",
      };
    }

    const procuracao = await prisma.procuracao.findFirst({
      where: {
        id: scopedProcuracaoId,
        tenantId: user.tenantId,
      },
      select: {
        id: true,
      },
    });

    if (!procuracao) {
      return { success: false, error: "Procuração não encontrada" };
    }

    const novoPoder = await prisma.$transaction(async (tx) => {
      return tx.procuracaoPoder.create({
        data: {
          tenantId: user.tenantId,
          procuracaoId: scopedProcuracaoId,
          titulo: titulo || null,
          descricao,
          ativo: true,
        },
      });
    });

    try {
      await logAudit({
        tenantId: user.tenantId,
        usuarioId: user.id,
        acao: "PROCURAÇÃO_PODER_ADICIONADO",
        entidade: AUDIT_ENTITY,
        entidadeId: scopedProcuracaoId,
        dados: toAuditJson({
          actor: actorName,
          procuracaoId: scopedProcuracaoId,
          poderId: novoPoder.id,
          titulo: novoPoder.titulo,
          descricao: novoPoder.descricao,
        }),
        changedFields: ["poderes"],
        ip,
        userAgent,
      });
    } catch (auditError) {
      logger.warn(
        "Falha ao registrar auditoria de adição de poder à procuração",
        auditError,
      );
    }

    return {
      success: true,
    };
  } catch (error) {
    logger.error("Erro ao adicionar poder na procuração:", error);

    return {
      success: false,
      error: "Erro ao adicionar poder na procuração",
    };
  }
}

export async function revogarPoderDaProcuracao(
  procuracaoId: string,
  poderId: string,
): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const permissionDenied = await requirePermission("editar");

    if (permissionDenied) {
      return {
        success: false,
        error: permissionDenied,
      };
    }

    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;
    const actorName = getActorName(user);
    const { ip, userAgent } = await getRequestContext();

    if (!user.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    const scopedProcuracaoId = await getScopedProcuracaoId(session, user, procuracaoId);

    if (!scopedProcuracaoId) {
      return {
        success: false,
        error: "Procuração não encontrada ou sem acesso",
      };
    }

    const poder = await prisma.procuracaoPoder.findFirst({
      where: {
        id: poderId,
        procuracaoId: scopedProcuracaoId,
        tenantId: user.tenantId,
      },
      select: {
        id: true,
        titulo: true,
        descricao: true,
        ativo: true,
      },
    });

    if (!poder) {
      return { success: false, error: "Poder não encontrado" };
    }

    if (!poder.ativo) {
      return { success: false, error: "Este poder já está revogado" };
    }

    const poderAtualizado = await prisma.procuracaoPoder.update({
      where: {
        id: poder.id,
      },
      data: {
        ativo: false,
        revogadoEm: new Date(),
      },
    });

    try {
      await logAudit({
        tenantId: user.tenantId,
        usuarioId: user.id,
        acao: "PROCURAÇÃO_PODER_REVOKADO",
        entidade: AUDIT_ENTITY,
        entidadeId: scopedProcuracaoId,
        dados: toAuditJson({
          actor: actorName,
          procuracaoId: scopedProcuracaoId,
          poderId: poderAtualizado.id,
          titulo: poderAtualizado.titulo,
          descricao: poderAtualizado.descricao,
          ativoAnterior: true,
          ativoAtual: false,
        }),
        previousValues: toAuditJson({
          titulo: poder.titulo,
          descricao: poder.descricao,
          ativo: true,
        }),
        changedFields: ["poderes"],
        ip,
        userAgent,
      });
    } catch (auditError) {
      logger.warn(
        "Falha ao registrar auditoria de revogação de poder da procuração",
        auditError,
      );
    }

    return {
      success: true,
    };
  } catch (error) {
    logger.error("Erro ao revogar poder da procuração:", error);

    return {
      success: false,
      error: "Erro ao revogar poder da procuração",
    };
  }
}
