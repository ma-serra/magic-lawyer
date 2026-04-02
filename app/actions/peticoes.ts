"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/app/lib/auth";
import prisma from "@/app/lib/prisma";
import { Prisma, PeticaoStatus } from "@/generated/prisma";
import { checkPermission } from "@/app/actions/equipe";
import { getAccessibleAdvogadoIds } from "@/app/lib/advogado-access";
import {
  buildProcessoAdvogadoMembershipWhere,
  processoClientesRelacionadosInclude,
  processoClienteResumoSelect,
} from "@/app/lib/processos/processo-vinculos";
import { buildSoftDeletePayload } from "@/app/lib/soft-delete";

// ============================================
// TIPOS
// ============================================

export type PeticaoSort =
  | "RECENTES"
  | "ANTIGAS"
  | "MAIORES"
  | "MENORES";

export interface PeticaoFilters {
  status?: PeticaoStatus;
  processoId?: string;
  clienteId?: string;
  causaId?: string;
  tipo?: string;
  search?: string;
  ano?: number | string;
  sort?: PeticaoSort;
  dataInicio?: Date | string;
  dataFim?: Date | string;
  page?: number;
  perPage?: number;
}

export interface PeticaoCreateInput {
  processoId: string;
  causaId?: string;
  titulo: string;
  tipo?: string;
  status?: PeticaoStatus;
  descricao?: string;
  conteudo?: string;
  documentoId?: string;
  protocoloNumero?: string;
  protocoladoEm?: Date;
  observacoes?: string;
}

export interface PeticaoUpdateInput {
  processoId?: string;
  causaId?: string;
  titulo?: string;
  tipo?: string;
  status?: PeticaoStatus;
  descricao?: string;
  conteudo?: string;
  documentoId?: string;
  protocoloNumero?: string;
  protocoladoEm?: Date;
  observacoes?: string;
}

// ============================================
// VALIDAÇÃO DE TENANT
// ============================================

async function getTenantId(): Promise<string> {
  const session = await getSession();

  if (!session?.user?.tenantId) {
    throw new Error("Usuário não autenticado ou tenant não encontrado");
  }

  return session.user.tenantId;
}

async function getUserId(): Promise<string> {
  const session = await getSession();

  if (!session?.user?.id) {
    throw new Error("Usuário não autenticado");
  }

  return session.user.id;
}

function isAdminRole(role?: string | null): boolean {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

function normalizePeticaoLongText(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function getPeticaoConteudoTamanho(value?: string | null) {
  return normalizePeticaoLongText(value)?.length ?? 0;
}

function buildInitialPeticaoConteudo(input: {
  titulo: string;
  tipo?: string | null;
  descricao?: string | null;
  observacoes?: string | null;
  processoNumero?: string | null;
}) {
  const sections = [
    `# ${input.titulo.trim() || "Petição"}`,
    input.processoNumero ? `Processo: ${input.processoNumero}` : null,
    input.tipo ? `Tipo: ${input.tipo}` : null,
    "",
    "## Objeto",
    input.descricao?.trim() || "Descreva o objetivo principal desta peça.",
    "",
    "## Fundamentação",
    "",
    "## Pedidos",
    "",
    input.observacoes?.trim()
      ? `## Observações internas\n${input.observacoes.trim()}`
      : null,
  ];

  return sections.filter((section) => section !== null).join("\n");
}

function normalizeDateFilter(value?: Date | string | null) {
  if (!value) {
    return null;
  }

  const normalized = value instanceof Date ? value : new Date(value);
  return Number.isNaN(normalized.getTime()) ? null : normalized;
}

function buildPeticaoCreatedAtFilter(
  filters?: Pick<PeticaoFilters, "ano" | "dataInicio" | "dataFim">,
) {
  const start = normalizeDateFilter(filters?.dataInicio);
  const end = normalizeDateFilter(filters?.dataFim);
  const yearValue =
    typeof filters?.ano === "string"
      ? Number(filters.ano)
      : (filters?.ano ?? null);

  let gte = start;
  let lte = end;

  if (yearValue && Number.isFinite(yearValue) && yearValue > 1900) {
    const yearStart = new Date(yearValue, 0, 1, 0, 0, 0, 0);
    const yearEnd = new Date(yearValue, 11, 31, 23, 59, 59, 999);

    gte = !gte || yearStart > gte ? yearStart : gte;
    lte = !lte || yearEnd < lte ? yearEnd : lte;
  }

  if (!gte && !lte) {
    return undefined;
  }

  return {
    ...(gte ? { gte } : {}),
    ...(lte ? { lte } : {}),
  };
}

function buildPeticaoOrderBy(
  sort?: PeticaoSort,
): Prisma.PeticaoOrderByWithRelationInput[] {
  switch (sort) {
    case "ANTIGAS":
      return [{ createdAt: "asc" }, { updatedAt: "asc" }];
    case "MAIORES":
      return [{ conteudoTamanho: "desc" }, { createdAt: "desc" }];
    case "MENORES":
      return [{ conteudoTamanho: "asc" }, { createdAt: "desc" }];
    case "RECENTES":
    default:
      return [{ createdAt: "desc" }, { updatedAt: "desc" }];
  }
}

async function withStaffScope(
  where: Prisma.PeticaoWhereInput,
  session: Awaited<ReturnType<typeof getSession>>,
): Promise<Prisma.PeticaoWhereInput> {
  const user = session?.user as any;

  if (!session?.user || isAdminRole(user?.role)) {
    return where;
  }

  const accessibleAdvogados = await getAccessibleAdvogadoIds(session);
  const andClauses = Array.isArray(where.AND)
    ? where.AND
    : where.AND
      ? [where.AND]
      : [];

  return {
    ...where,
    AND: [
      ...andClauses,
      {
        processo: {
          ...buildProcessoAdvogadoMembershipWhere(accessibleAdvogados),
        },
      },
    ],
  };
}

// ============================================
// LISTAGEM
// ============================================

export async function listPeticoes(filters?: PeticaoFilters) {
  try {
    const session = await getSession();
    const tenantId = await getTenantId();

    const podeVisualizar = await checkPermission("processos", "visualizar");

    if (!podeVisualizar) {
      return {
        success: false,
        error: "Você não tem permissão para visualizar petições",
      };
    }

    const page = Math.max(1, Number(filters?.page || 1));
    const perPage = Math.min(100, Math.max(1, Number(filters?.perPage || 12)));
    const searchTokens =
      filters?.search
        ?.trim()
        .split(/\s+/)
        .map((token) => token.trim())
        .filter(Boolean) ?? [];
    const createdAtFilter = buildPeticaoCreatedAtFilter(filters);
    const whereClauses: Prisma.PeticaoWhereInput[] = [
      {
        tenantId,
        deletedAt: null,
        ...(filters?.status && { status: filters.status }),
        ...(filters?.processoId && { processoId: filters.processoId }),
        ...(filters?.causaId && { causaId: filters.causaId }),
        ...(filters?.tipo && { tipo: filters.tipo }),
        ...(createdAtFilter && {
          createdAt: createdAtFilter,
        }),
      },
    ];

    if (filters?.clienteId) {
      whereClauses.push({
        processo: {
          OR: [
            { clienteId: filters.clienteId },
            {
              clientesRelacionados: {
                some: {
                  clienteId: filters.clienteId,
                },
              },
            },
          ],
        },
      });
    }

    for (const token of searchTokens) {
      whereClauses.push({
        OR: [
          { titulo: { contains: token, mode: "insensitive" } },
          { descricao: { contains: token, mode: "insensitive" } },
          { conteudo: { contains: token, mode: "insensitive" } },
          { observacoes: { contains: token, mode: "insensitive" } },
          { tipo: { contains: token, mode: "insensitive" } },
          {
            protocoloNumero: { contains: token, mode: "insensitive" },
          },
          {
            documento: {
              nome: { contains: token, mode: "insensitive" },
            },
          },
          {
            causa: {
              nome: { contains: token, mode: "insensitive" },
            },
          },
          {
            criadoPor: {
              OR: [
                { firstName: { contains: token, mode: "insensitive" } },
                { lastName: { contains: token, mode: "insensitive" } },
                { email: { contains: token, mode: "insensitive" } },
              ],
            },
          },
          {
            processo: {
              OR: [
                { numero: { contains: token, mode: "insensitive" } },
                { numeroCnj: { contains: token, mode: "insensitive" } },
                { titulo: { contains: token, mode: "insensitive" } },
                {
                  cliente: {
                    nome: { contains: token, mode: "insensitive" },
                  },
                },
                {
                  clientesRelacionados: {
                    some: {
                      cliente: {
                        nome: { contains: token, mode: "insensitive" },
                      },
                    },
                  },
                },
              ],
            },
          },
        ],
      });
    }

    let where: Prisma.PeticaoWhereInput =
      whereClauses.length === 1 ? whereClauses[0] : { AND: whereClauses };

    where = await withStaffScope(where, session);

    const total = await prisma.peticao.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / perPage));
    const safePage = Math.min(page, totalPages);

    const peticoes = await prisma.peticao.findMany({
      where,
      include: {
        processo: {
          select: {
            id: true,
            numero: true,
            numeroCnj: true,
            titulo: true,
            status: true,
            cliente: {
              select: processoClienteResumoSelect,
            },
            ...processoClientesRelacionadosInclude,
          },
        },
        causa: {
          select: {
            id: true,
            nome: true,
          },
        },
        documento: {
          select: {
            id: true,
            nome: true,
            url: true,
            contentType: true,
            tamanhoBytes: true,
          },
        },
        criadoPor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
      orderBy: buildPeticaoOrderBy(filters?.sort),
      skip: (safePage - 1) * perPage,
      take: perPage,
    });

    return {
      success: true,
      data: peticoes,
      pagination: {
        page: safePage,
        perPage,
        total,
        totalPages,
        hasPreviousPage: safePage > 1,
        hasNextPage: safePage < totalPages,
      },
    };
  } catch (error) {
    console.error("Erro ao listar petições:", error);

    return {
      success: false,
      error: "Erro ao listar petições",
    };
  }
}

// ============================================
// BUSCAR PETIÇÃO INDIVIDUAL
// ============================================

export async function getPeticao(id: string) {
  try {
    const tenantId = await getTenantId();
    const session = await getSession();

    const podeVisualizar = await checkPermission("processos", "visualizar");

    if (!podeVisualizar) {
      return {
        success: false,
        error: "Você não tem permissão para visualizar petições",
      };
    }

    let where: Prisma.PeticaoWhereInput = {
      id,
      tenantId,
      deletedAt: null,
    };

    where = await withStaffScope(where, session);

    const peticao = await prisma.peticao.findFirst({
      where,
      include: {
        processo: {
          select: {
            id: true,
            numero: true,
            numeroCnj: true,
            titulo: true,
            status: true,
            cliente: {
              select: processoClienteResumoSelect,
            },
            ...processoClientesRelacionadosInclude,
          },
        },
        causa: {
          select: {
            id: true,
            nome: true,
            codigoCnj: true,
          },
        },
        documento: {
          select: {
            id: true,
            nome: true,
            tipo: true,
            url: true,
            contentType: true,
            tamanhoBytes: true,
            createdAt: true,
          },
        },
        criadoPor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            avatarUrl: true,
          },
        },
        diligencias: {
          where: {
            deletedAt: null,
          },
          select: {
            id: true,
            titulo: true,
            status: true,
            prazoPrevisto: true,
          },
        },
      },
    });

    if (!peticao) {
      return {
        success: false,
        error: "Petição não encontrada",
      };
    }

    return {
      success: true,
      data: peticao,
    };
  } catch (error) {
    console.error("Erro ao buscar petição:", error);

    return {
      success: false,
      error: "Erro ao buscar petição",
    };
  }
}

// ============================================
// CRIAR PETIÇÃO
// ============================================

export async function createPeticao(input: PeticaoCreateInput) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return {
        success: false,
        error: "Não autorizado",
      };
    }

    const tenantId = await getTenantId();
    const userId = await getUserId();
    const user = session?.user as any;

    const podeCriar = await checkPermission("processos", "criar");

    if (!podeCriar) {
      return {
        success: false,
        error: "Você não tem permissão para criar petições",
      };
    }

    if (input.status === PeticaoStatus.PROTOCOLADA) {
      return {
        success: false,
        error:
          "Para marcar como protocolada, crie a petição e use a ação de protocolar",
      };
    }

    const processoAccessWhere: Prisma.ProcessoWhereInput = {
      id: input.processoId,
      tenantId,
    };

    if (!isAdminRole(user?.role)) {
      const accessibleAdvogados = await getAccessibleAdvogadoIds(session);
      processoAccessWhere.AND = [
        ...((Array.isArray(processoAccessWhere.AND)
          ? processoAccessWhere.AND
          : processoAccessWhere.AND
            ? [processoAccessWhere.AND]
            : []) as Prisma.ProcessoWhereInput[]),
        buildProcessoAdvogadoMembershipWhere(accessibleAdvogados),
      ];
    }

    // Validar se o processo existe e pertence ao tenant
    const processo = await prisma.processo.findFirst({
      where: processoAccessWhere,
    });

    if (!processo) {
      return {
        success: false,
        error: "Processo não encontrado ou sem acesso",
      };
    }

    // Validar causa se fornecida
    if (input.causaId) {
      const causa = await prisma.causa.findFirst({
        where: {
          id: input.causaId,
          tenantId,
        },
      });

      if (!causa) {
        return {
          success: false,
          error: "Causa não encontrada",
        };
      }
    }

    // Validar documento se fornecido
    if (input.documentoId) {
      const documento = await prisma.documento.findFirst({
        where: {
          id: input.documentoId,
          tenantId,
        },
      });

      if (!documento) {
        return {
          success: false,
          error: "Documento não encontrado",
        };
      }
    }

    const conteudoNormalizado =
      normalizePeticaoLongText(input.conteudo) ??
      buildInitialPeticaoConteudo({
        titulo: input.titulo,
        tipo: input.tipo,
        descricao: input.descricao,
        observacoes: input.observacoes,
        processoNumero: processo.numeroCnj || processo.numero,
      });

    const peticao = await prisma.peticao.create({
      data: {
        tenantId,
        processoId: input.processoId,
        causaId: input.causaId,
        titulo: input.titulo,
        tipo: input.tipo,
        status: input.status || PeticaoStatus.RASCUNHO,
        descricao: input.descricao,
        conteudo: conteudoNormalizado,
        conteudoTamanho: getPeticaoConteudoTamanho(conteudoNormalizado),
        documentoId: input.documentoId,
        protocoloNumero: input.protocoloNumero,
        protocoladoEm: input.protocoladoEm,
        observacoes: input.observacoes,
        criadoPorId: userId,
      },
      include: {
        processo: {
          select: {
            numero: true,
            titulo: true,
          },
        },
        causa: {
          select: {
            nome: true,
          },
        },
      },
    });

    revalidatePath("/peticoes");
    revalidatePath(`/processos/${input.processoId}`);

    return {
      success: true,
      data: peticao,
      message: "Petição criada com sucesso",
    };
  } catch (error) {
    console.error("Erro ao criar petição:", error);

    return {
      success: false,
      error: "Erro ao criar petição",
    };
  }
}

// ============================================
// ATUALIZAR PETIÇÃO
// ============================================

export async function updatePeticao(id: string, input: PeticaoUpdateInput) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return {
        success: false,
        error: "Não autorizado",
      };
    }

    const tenantId = await getTenantId();

    const podeEditar = await checkPermission("processos", "editar");

    if (!podeEditar) {
      return {
        success: false,
        error: "Você não tem permissão para editar petições",
      };
    }

    let peticaoWhere: Prisma.PeticaoWhereInput = {
      id,
      tenantId,
      deletedAt: null,
    };

    peticaoWhere = await withStaffScope(peticaoWhere, session);

    // Verificar se a petição existe
    const peticaoExistente = await prisma.peticao.findFirst({
      where: peticaoWhere,
    });

    if (!peticaoExistente) {
      return {
        success: false,
        error: "Petição não encontrada",
      };
    }

    if (
      input.status === PeticaoStatus.PROTOCOLADA &&
      peticaoExistente.status !== PeticaoStatus.PROTOCOLADA
    ) {
      return {
        success: false,
        error:
          "Para protocolar uma petição, use a ação 'Protocolar' e informe o número do protocolo",
      };
    }

    // Validar processo se alterado
    if (input.processoId && input.processoId !== peticaoExistente.processoId) {
      const user = session?.user as any;
      const processoAccessWhere: Prisma.ProcessoWhereInput = {
        id: input.processoId,
        tenantId,
      };

      if (!isAdminRole(user?.role)) {
        const accessibleAdvogados = await getAccessibleAdvogadoIds(session);
        processoAccessWhere.AND = [
          ...((Array.isArray(processoAccessWhere.AND)
            ? processoAccessWhere.AND
            : processoAccessWhere.AND
              ? [processoAccessWhere.AND]
              : []) as Prisma.ProcessoWhereInput[]),
          buildProcessoAdvogadoMembershipWhere(accessibleAdvogados),
        ];
      }

      const processo = await prisma.processo.findFirst({
        where: processoAccessWhere,
      });

      if (!processo) {
        return {
          success: false,
          error: "Processo não encontrado ou sem acesso",
        };
      }
    }

    // Validar causa se fornecida
    if (input.causaId) {
      const causa = await prisma.causa.findFirst({
        where: {
          id: input.causaId,
          tenantId,
        },
      });

      if (!causa) {
        return {
          success: false,
          error: "Causa não encontrada",
        };
      }
    }

    // Validar documento se fornecido
    if (input.documentoId) {
      const documento = await prisma.documento.findFirst({
        where: {
          id: input.documentoId,
          tenantId,
        },
      });

      if (!documento) {
        return {
          success: false,
          error: "Documento não encontrado",
        };
      }
    }

    const conteudoNormalizado =
      input.conteudo !== undefined
        ? normalizePeticaoLongText(input.conteudo)
        : undefined;

    const peticao = await prisma.peticao.update({
      where: { id },
      data: {
        ...(input.processoId && { processoId: input.processoId }),
        ...(input.causaId !== undefined && { causaId: input.causaId }),
        ...(input.titulo && { titulo: input.titulo }),
        ...(input.tipo !== undefined && { tipo: input.tipo }),
        ...(input.status && { status: input.status }),
        ...(input.descricao !== undefined && { descricao: input.descricao }),
        ...(conteudoNormalizado !== undefined && {
          conteudo: conteudoNormalizado,
          conteudoTamanho: getPeticaoConteudoTamanho(conteudoNormalizado),
        }),
        ...(input.documentoId !== undefined && {
          documentoId: input.documentoId,
        }),
        ...(input.protocoloNumero !== undefined && {
          protocoloNumero: input.protocoloNumero,
        }),
        ...(input.protocoladoEm !== undefined && {
          protocoladoEm: input.protocoladoEm,
        }),
        ...(input.observacoes !== undefined && {
          observacoes: input.observacoes,
        }),
      },
      include: {
        processo: {
          select: {
            numero: true,
            titulo: true,
          },
        },
        causa: {
          select: {
            nome: true,
          },
        },
      },
    });

    revalidatePath("/peticoes");
    revalidatePath(`/processos/${peticao.processoId}`);

    return {
      success: true,
      data: peticao,
      message: "Petição atualizada com sucesso",
    };
  } catch (error) {
    console.error("Erro ao atualizar petição:", error);

    return {
      success: false,
      error: "Erro ao atualizar petição",
    };
  }
}

// ============================================
// DELETAR PETIÇÃO
// ============================================

export async function deletePeticao(id: string) {
  try {
    const session = await getSession();
    const tenantId = await getTenantId();

    const podeExcluir = await checkPermission("processos", "excluir");

    if (!podeExcluir) {
      return {
        success: false,
        error: "Você não tem permissão para excluir petições",
      };
    }

    let peticaoWhere: Prisma.PeticaoWhereInput = {
      id,
      tenantId,
    };

    peticaoWhere = await withStaffScope(peticaoWhere, session);

    // Verificar se a petição existe
    const peticao = await prisma.peticao.findFirst({
      where: peticaoWhere,
      include: {
        diligencias: {
          where: {
            deletedAt: null,
          },
        },
      },
    });

    if (!peticao) {
      return {
        success: false,
        error: "Petição não encontrada",
      };
    }

    // Verificar se há diligências vinculadas
    if (peticao.diligencias.length > 0) {
      return {
        success: false,
        error: `Não é possível excluir esta petição pois existem ${peticao.diligencias.length} diligência(s) vinculada(s)`,
      };
    }

    await prisma.peticao.update({
      where: { id },
      data: buildSoftDeletePayload(
        {
          actorId: session?.user?.id ?? null,
          actorType: (session?.user as any)?.role ?? "USER",
        },
        "Exclusão manual de petição",
      ),
    });

    revalidatePath("/peticoes");
    revalidatePath(`/processos/${peticao.processoId}`);

    return {
      success: true,
      message: "Petição excluída com sucesso",
    };
  } catch (error) {
    console.error("Erro ao excluir petição:", error);

    return {
      success: false,
      error: "Erro ao excluir petição",
    };
  }
}

// ============================================
// PROTOCOLAR PETIÇÃO
// ============================================

export async function protocolarPeticao(
  id: string,
  protocoloNumero: string,
  protocoladoEm?: Date,
) {
  try {
    const session = await getSession();
    const tenantId = await getTenantId();
    const numeroNormalizado = protocoloNumero?.trim();

    const podeEditar = await checkPermission("processos", "editar");

    if (!podeEditar) {
      return {
        success: false,
        error: "Você não tem permissão para protocolar petições",
      };
    }

    if (!numeroNormalizado) {
      return {
        success: false,
        error: "Número do protocolo é obrigatório",
      };
    }

    let peticaoWhere: Prisma.PeticaoWhereInput = {
      id,
      tenantId,
      deletedAt: null,
    };

    peticaoWhere = await withStaffScope(peticaoWhere, session);

    // Verificar se a petição existe
    const peticao = await prisma.peticao.findFirst({
      where: peticaoWhere,
    });

    if (!peticao) {
      return {
        success: false,
        error: "Petição não encontrada",
      };
    }

    // Verificar se já foi protocolada
    if (peticao.status === PeticaoStatus.PROTOCOLADA) {
      return {
        success: false,
        error: "Petição já foi protocolada",
      };
    }

    if (!peticao.documentoId) {
      return {
        success: false,
        error: "Anexe um documento PDF antes de protocolar a petição",
      };
    }

    if (
      peticao.status !== PeticaoStatus.RASCUNHO &&
      peticao.status !== PeticaoStatus.EM_ANALISE
    ) {
      return {
        success: false,
        error: "Somente petições em rascunho ou em análise podem ser protocoladas",
      };
    }

    const peticaoAtualizada = await prisma.peticao.update({
      where: { id },
      data: {
        status: PeticaoStatus.PROTOCOLADA,
        protocoloNumero: numeroNormalizado,
        protocoladoEm: protocoladoEm || new Date(),
      },
    });

    revalidatePath("/peticoes");
    revalidatePath(`/processos/${peticao.processoId}`);

    return {
      success: true,
      data: peticaoAtualizada,
      message: "Petição protocolada com sucesso",
    };
  } catch (error) {
    console.error("Erro ao protocolar petição:", error);

    return {
      success: false,
      error: "Erro ao protocolar petição",
    };
  }
}

// ============================================
// DASHBOARD DE PETIÇÕES
// ============================================

export async function getDashboardPeticoes() {
  try {
    const session = await getSession();
    const tenantId = await getTenantId();
    const podeVisualizar = await checkPermission("processos", "visualizar");

    if (!podeVisualizar) {
      return {
        success: false,
        error: "Você não tem permissão para visualizar petições",
      };
    }

    let wherePeticoes: Prisma.PeticaoWhereInput = {
      tenantId,
      deletedAt: null,
    };

    wherePeticoes = await withStaffScope(wherePeticoes, session);

    // Total de petições
    const total = await prisma.peticao.count({
      where: wherePeticoes,
    });

    // Por status
    const porStatus = await prisma.peticao.groupBy({
      by: ["status"],
      where: wherePeticoes,
      _count: true,
    });

    // Petições recentes (últimos 30 dias)
    const trintaDiasAtras = new Date();

    trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);

    const recentes = await prisma.peticao.count({
      where: {
        ...wherePeticoes,
        createdAt: {
          gte: trintaDiasAtras,
        },
      },
    });

    // Petições protocoladas (últimos 30 dias)
    const protocoladasRecentes = await prisma.peticao.count({
      where: {
        ...wherePeticoes,
        status: PeticaoStatus.PROTOCOLADA,
        protocoladoEm: {
          gte: trintaDiasAtras,
        },
      },
    });

    // Petições em análise
    const emAnalise = await prisma.peticao.count({
      where: {
        ...wherePeticoes,
        status: PeticaoStatus.EM_ANALISE,
      },
    });

    // Petições rascunho
    const rascunhos = await prisma.peticao.count({
      where: {
        ...wherePeticoes,
        status: PeticaoStatus.RASCUNHO,
      },
    });

    // Top 5 processos com mais petições
    const processosMaisPeticoes = await prisma.peticao.groupBy({
      by: ["processoId"],
      where: wherePeticoes,
      _count: true,
      orderBy: {
        _count: {
          processoId: "desc",
        },
      },
      take: 5,
    });

    // Buscar detalhes dos processos
    const processosDetalhes = await prisma.processo.findMany({
      where: {
        id: {
          in: processosMaisPeticoes.map((p) => p.processoId),
        },
      },
      select: {
        id: true,
        numero: true,
        titulo: true,
      },
    });

    const topProcessos = processosMaisPeticoes.map((item) => {
      const processo = processosDetalhes.find((p) => p.id === item.processoId);

      return {
        processoId: item.processoId,
        numero: processo?.numero || "N/A",
        titulo: processo?.titulo || "Sem título",
        quantidade: item._count,
      };
    });

    return {
      success: true,
      data: {
        total,
        recentes,
        protocoladasRecentes,
        emAnalise,
        rascunhos,
        porStatus: porStatus.map((item) => ({
          status: item.status,
          quantidade: item._count,
        })),
        topProcessos,
      },
    };
  } catch (error) {
    console.error("Erro ao buscar dashboard:", error);

    return {
      success: false,
      error: "Erro ao buscar dados do dashboard",
    };
  }
}

// ============================================
// LISTAR TIPOS DE PETIÇÃO (para autocomplete)
// ============================================

export async function listTiposPeticao() {
  try {
    const tenantId = await getTenantId();
    const podeVisualizar = await checkPermission("processos", "visualizar");

    if (!podeVisualizar) {
      return {
        success: false,
        error: "Você não tem permissão para visualizar tipos de petição",
        data: [],
      };
    }

    // Tipos padrão de petição
    const tiposPadrao = [
      "Petição Inicial",
      "Contestação",
      "Réplica",
      "Reconvenção",
      "Recurso de Apelação",
      "Recurso Especial",
      "Recurso Extraordinário",
      "Agravo de Instrumento",
      "Embargos de Declaração",
      "Mandado de Segurança",
      "Habeas Corpus",
      "Impugnação",
      "Manifestação",
      "Memorial",
      "Alegações Finais",
      "Contrarrazões",
      "Exceção de Pré-executividade",
      "Embargos à Execução",
      "Cumprimento de Sentença",
      "Execução de Título Extrajudicial",
      "Cautelar",
      "Tutela Antecipada",
      "Pedido de Liminar",
      "Aditamento",
      "Desistência",
      "Renúncia",
      "Acordo/Transação",
      "Outros",
    ];

    // Buscar tipos já usados pelo tenant
    const tiposUsados = await prisma.peticao.findMany({
      where: {
        tenantId,
        tipo: {
          not: null,
        },
      },
      select: {
        tipo: true,
      },
      distinct: ["tipo"],
      orderBy: {
        tipo: "asc",
      },
    });

    // Buscar tipos disponíveis para o tenant:
    // 1. Tipos GLOBAIS que não foram desativados pelo tenant
    // 2. Tipos CUSTOMIZADOS criados pelo tenant
    const tiposCadastrados = await prisma.tipoPeticao.findMany({
      where: {
        OR: [
          // Tipos globais que não foram desativados pelo tenant
          {
            tenantId: null,
            global: true,
            ativo: true,
            // Excluir se o tenant criou uma configuração desativada
            NOT: {
              tenant: {
                tiposPeticao: {
                  some: {
                    tenantId,
                    global: false,
                    ativo: false,
                  },
                },
              },
            },
          },
          // Tipos customizados ativos do tenant
          {
            tenantId,
            global: false,
            ativo: true,
          },
        ],
        deletedAt: null,
      },
      orderBy: [{ ordem: "asc" }, { nome: "asc" }],
      select: {
        nome: true,
        global: true,
      },
    });

    return {
      success: true,
      data: tiposCadastrados.map((t) => t.nome),
    };
  } catch (error) {
    console.error("Erro ao listar tipos de petição:", error);

    return {
      success: false,
      error: "Erro ao listar tipos de petição",
      data: [],
    };
  }
}
