"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/app/lib/auth";
import prisma from "@/app/lib/prisma";
import { Prisma, TipoFeriado } from "@/generated/prisma";
import { fetchOfficialNationalHolidays } from "@/app/lib/feriados/oficial";
import { logAudit, toAuditJson } from "@/app/lib/audit/log";

// ============================================
// TIPOS
// ============================================

export interface FeriadoFilters {
  tipo?: TipoFeriado;
  uf?: string;
  municipio?: string;
  ano?: number;
  tribunalId?: string;
  searchTerm?: string;
}

export interface FeriadoCreateInput {
  nome: string;
  data: Date;
  tipo: TipoFeriado;
  tribunalId?: string;
  uf?: string;
  municipio?: string;
  descricao?: string;
  recorrente?: boolean;
}

export interface FeriadoUpdateInput {
  nome?: string;
  data?: Date;
  tipo?: TipoFeriado;
  tribunalId?: string;
  uf?: string;
  municipio?: string;
  descricao?: string;
  recorrente?: boolean;
}

export interface ActionResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// ============================================
// VALIDAÇÃO DE TENANT
// ============================================

async function getTenantId(): Promise<string | null> {
  const session = await getSession();

  // Feriados podem ser globais (tenantId null) ou específicos do tenant
  return session?.user?.tenantId || null;
}

// ============================================
// LISTAGEM
// ============================================

export async function listFeriados(
  filters: FeriadoFilters,
): Promise<ActionResponse<any[]>> {
  try {
    const tenantId = await getTenantId();

    const andConditions: Prisma.FeriadoWhereInput[] = [
      {
        OR: [{ tenantId }, { tenantId: null }],
      },
    ];

    if (filters.tipo) {
      andConditions.push({ tipo: filters.tipo });
    }

    if (filters.uf) {
      andConditions.push({ uf: filters.uf });
    }

    if (filters.municipio) {
      andConditions.push({ municipio: filters.municipio });
    }

    if (filters.tribunalId) {
      andConditions.push({ tribunalId: filters.tribunalId });
    }

    if (filters.ano) {
      const startOfYear = new Date(filters.ano, 0, 1);
      const endOfYear = new Date(filters.ano, 11, 31, 23, 59, 59);

      andConditions.push({
        data: {
          gte: startOfYear,
          lte: endOfYear,
        },
      });
    }

    if (filters.searchTerm) {
      andConditions.push({
        OR: [
          { nome: { contains: filters.searchTerm, mode: "insensitive" } },
          { descricao: { contains: filters.searchTerm, mode: "insensitive" } },
        ],
      });
    }

    const where: Prisma.FeriadoWhereInput = {
      AND: andConditions,
    };

    const feriados = await prisma.feriado.findMany({
      where,
      include: {
        tribunal: {
          select: {
            id: true,
            nome: true,
            sigla: true,
            uf: true,
          },
        },
      },
      orderBy: {
        data: "asc",
      },
    });

    return {
      success: true,
      data: feriados,
    };
  } catch (error: any) {
    console.error("Erro ao listar feriados:", error);

    return {
      success: false,
      error: error.message || "Erro ao listar feriados",
    };
  }
}

// ============================================
// BUSCAR INDIVIDUAL
// ============================================

export async function getFeriado(
  feriadoId: string,
): Promise<ActionResponse<any>> {
  try {
    const tenantId = await getTenantId();

    const feriado = await prisma.feriado.findFirst({
      where: {
        id: feriadoId,
        OR: [{ tenantId }, { tenantId: null }],
      },
      include: {
        tribunal: {
          select: {
            id: true,
            nome: true,
            sigla: true,
            uf: true,
          },
        },
      },
    });

    if (!feriado) {
      return {
        success: false,
        error: "Feriado não encontrado",
      };
    }

    return {
      success: true,
      data: feriado,
    };
  } catch (error: any) {
    console.error("Erro ao buscar feriado:", error);

    return {
      success: false,
      error: error.message || "Erro ao buscar feriado",
    };
  }
}

// ============================================
// CRIAR FERIADO
// ============================================

export async function createFeriado(
  input: FeriadoCreateInput,
): Promise<ActionResponse<any>> {
  try {
    const tenantId = await getTenantId();

    const feriado = await prisma.feriado.create({
      data: {
        tenantId,
        nome: input.nome,
        data: input.data,
        tipo: input.tipo,
        tribunalId: input.tribunalId,
        uf: input.uf,
        municipio: input.municipio,
        descricao: input.descricao,
        recorrente: input.recorrente !== undefined ? input.recorrente : true,
      },
      include: {
        tribunal: {
          select: {
            id: true,
            nome: true,
            sigla: true,
          },
        },
      },
    });

    revalidatePath("/configuracoes/feriados");

    return {
      success: true,
      data: feriado,
    };
  } catch (error: any) {
    console.error("Erro ao criar feriado:", error);

    return {
      success: false,
      error: error.message || "Erro ao criar feriado",
    };
  }
}

// ============================================
// ATUALIZAR FERIADO
// ============================================

export async function updateFeriado(
  feriadoId: string,
  input: FeriadoUpdateInput,
): Promise<ActionResponse<any>> {
  try {
    const tenantId = await getTenantId();
    const feriadoAtual = await prisma.feriado.findFirst({
      where: {
        id: feriadoId,
        tenantId,
      },
      select: { id: true },
    });

    if (!feriadoAtual) {
      return {
        success: false,
        error: "Feriado não encontrado para este escritório",
      };
    }

    const feriado = await prisma.feriado.update({
      where: { id: feriadoAtual.id },
      data: {
        nome: input.nome,
        data: input.data,
        tipo: input.tipo,
        tribunalId: input.tribunalId,
        uf: input.uf,
        municipio: input.municipio,
        descricao: input.descricao,
        recorrente: input.recorrente,
      },
      include: {
        tribunal: {
          select: {
            id: true,
            nome: true,
            sigla: true,
          },
        },
      },
    });

    revalidatePath("/configuracoes/feriados");

    return {
      success: true,
      data: feriado,
    };
  } catch (error: any) {
    console.error("Erro ao atualizar feriado:", error);

    return {
      success: false,
      error: error.message || "Erro ao atualizar feriado",
    };
  }
}

// ============================================
// EXCLUIR FERIADO
// ============================================

export async function deleteFeriado(
  feriadoId: string,
): Promise<ActionResponse<null>> {
  try {
    const tenantId = await getTenantId();
    const feriadoAtual = await prisma.feriado.findFirst({
      where: {
        id: feriadoId,
        tenantId,
      },
      select: { id: true },
    });

    if (!feriadoAtual) {
      return {
        success: false,
        error: "Feriado não encontrado para este escritório",
      };
    }

    await prisma.feriado.delete({
      where: { id: feriadoAtual.id },
    });

    revalidatePath("/configuracoes/feriados");

    return {
      success: true,
      data: null,
    };
  } catch (error: any) {
    console.error("Erro ao excluir feriado:", error);

    return {
      success: false,
      error: error.message || "Erro ao excluir feriado",
    };
  }
}

// ============================================
// DASHBOARD/MÉTRICAS
// ============================================

export async function getDashboardFeriados(
  ano?: number,
): Promise<ActionResponse<any>> {
  try {
    const tenantId = await getTenantId();
    const anoFiltro = ano || new Date().getFullYear();

    const startOfYear = new Date(anoFiltro, 0, 1);
    const endOfYear = new Date(anoFiltro, 11, 31, 23, 59, 59);

    const where: any = {
      OR: [{ tenantId: tenantId }, { tenantId: null }],
      data: {
        gte: startOfYear,
        lte: endOfYear,
      },
    };

    const [total, porTipo, proximosFeriados] = await Promise.all([
      prisma.feriado.count({ where }),
      prisma.feriado.groupBy({
        by: ["tipo"],
        where,
        _count: true,
      }),
      prisma.feriado.findMany({
        where: {
          ...where,
          data: {
            gte: new Date(),
          },
        },
        take: 5,
        orderBy: { data: "asc" },
        include: {
          tribunal: {
            select: {
              nome: true,
              sigla: true,
            },
          },
        },
      }),
    ]);

    return {
      success: true,
      data: {
        total,
        porTipo,
        proximosFeriados,
        ano: anoFiltro,
      },
    };
  } catch (error: any) {
    console.error("Erro ao buscar dashboard de feriados:", error);

    return {
      success: false,
      error: error.message || "Erro ao buscar dashboard de feriados",
    };
  }
}

// ============================================
// VERIFICAR SE DIA É FERIADO
// ============================================

export async function isDiaFeriado(
  data: Date,
  uf?: string,
  municipio?: string,
  tribunalId?: string,
): Promise<ActionResponse<boolean>> {
  try {
    const tenantId = await getTenantId();

    const andConditions: Prisma.FeriadoWhereInput[] = [
      {
        OR: [{ tenantId }, { tenantId: null }],
      },
      {
        data: {
          gte: new Date(data.getFullYear(), data.getMonth(), data.getDate()),
          lt: new Date(data.getFullYear(), data.getMonth(), data.getDate() + 1),
        },
      },
    ];

    if (uf) {
      andConditions.push({
        OR: [{ uf }, { uf: null }],
      });
    }

    if (municipio) {
      andConditions.push({
        OR: [{ municipio }, { municipio: null }],
      });
    }

    if (tribunalId) {
      andConditions.push({
        OR: [{ tribunalId }, { tribunalId: null }],
      });
    }

    const where: Prisma.FeriadoWhereInput = {
      AND: andConditions,
    };

    const feriado = await prisma.feriado.findFirst({ where });

    return {
      success: true,
      data: !!feriado,
    };
  } catch (error: any) {
    console.error("Erro ao verificar feriado:", error);

    return {
      success: false,
      error: error.message || "Erro ao verificar feriado",
    };
  }
}

// ============================================
// IMPORTAR FERIADOS NACIONAIS
// ============================================

export async function importarFeriadosNacionais(
  ano: number,
): Promise<ActionResponse<any>> {
  try {
    const tenantId = await getTenantId();
    const sourceResult = await fetchOfficialNationalHolidays(ano);

    if (!sourceResult.success) {
      const startOfYear = new Date(Date.UTC(ano, 0, 1));
      const endOfYear = new Date(Date.UTC(ano, 11, 31, 23, 59, 59, 999));
      const cachedCount = await prisma.feriado.count({
        where: {
          tenantId: tenantId,
          tipo: "NACIONAL",
          data: {
            gte: startOfYear,
            lte: endOfYear,
          },
        },
      });

      if (cachedCount > 0) {
        return {
          success: true,
          data: {
            total: 0,
            created: 0,
            updated: 0,
            ignored: cachedCount,
            source: sourceResult.source,
            fallbackCache: true,
            warning:
              "Fonte oficial indisponível. Mantida a base de feriados já sincronizada.",
            feriados: [],
          },
        };
      }

      return {
        success: false,
        error: sourceResult.error,
      };
    }

    const feriadosDoAno = sourceResult.holidays;

    const feriadosCriados = [];
    let feriadosAtualizados = 0;
    let feriadosIgnorados = 0;

    for (const feriado of feriadosDoAno) {
      // Verificar se já existe
      const existe = await prisma.feriado.findFirst({
        where: {
          OR: [{ tenantId: tenantId }, { tenantId: null }],
          data: feriado.date,
          tipo: "NACIONAL",
        },
      });

      if (!existe) {
        const criado = await prisma.feriado.create({
          data: {
            tenantId,
            nome: feriado.name,
            data: feriado.date,
            tipo: "NACIONAL",
            recorrente: false,
            descricao: "Feriado nacional sincronizado da fonte oficial (BrasilAPI).",
          },
        });

        feriadosCriados.push(criado);
      } else if (existe.tenantId === tenantId && existe.nome !== feriado.name) {
        await prisma.feriado.update({
          where: { id: existe.id },
          data: {
            nome: feriado.name,
            descricao:
              "Feriado nacional atualizado da fonte oficial (BrasilAPI).",
          },
        });
        feriadosAtualizados += 1;
      } else {
        feriadosIgnorados += 1;
      }
    }

    revalidatePath("/configuracoes/feriados");

    try {
      const session = await getSession();
      const user = session?.user as any;
      if (tenantId) {
        await logAudit({
          tenantId,
          usuarioId: user?.id ?? null,
          acao: "FERIADO_NACIONAL_SYNC_EXECUTADO",
          entidade: "Feriado",
          dados: toAuditJson({
            ano,
            created: feriadosCriados.length,
            updated: feriadosAtualizados,
            ignored: feriadosIgnorados,
            source: sourceResult.source,
          }),
          changedFields: ["created", "updated", "ignored"],
        });
      }
    } catch (auditError) {
      console.warn("Falha ao registrar auditoria de sincronização de feriados nacionais:", auditError);
    }

    return {
      success: true,
      data: {
        total: feriadosCriados.length + feriadosAtualizados,
        created: feriadosCriados.length,
        updated: feriadosAtualizados,
        ignored: feriadosIgnorados,
        source: sourceResult.source,
        feriados: feriadosCriados,
      },
    };
  } catch (error: any) {
    console.error("Erro ao importar feriados nacionais:", error);

    return {
      success: false,
      error: error.message || "Erro ao importar feriados nacionais",
    };
  }
}

// ============================================
// TIPOS DE FERIADO
// ============================================

export async function getTiposFeriado(): Promise<
  ActionResponse<TipoFeriado[]>
> {
  try {
    const tipos: TipoFeriado[] = [
      "NACIONAL",
      "ESTADUAL",
      "MUNICIPAL",
      "JUDICIARIO",
    ];

    return {
      success: true,
      data: tipos,
    };
  } catch (error: any) {
    console.error("Erro ao buscar tipos de feriado:", error);

    return {
      success: false,
      error: error.message || "Erro ao buscar tipos de feriado",
    };
  }
}
