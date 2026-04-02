"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/app/lib/auth";
import prisma from "@/app/lib/prisma";
import { buildSoftDeletePayload } from "@/app/lib/soft-delete";
import { Prisma, TipoFeriado } from "@/generated/prisma";
import { logAudit, toAuditJson } from "@/app/lib/audit/log";
import {
  ensureSharedNationalHolidays,
  ensureSharedOfficialHolidaysForScope,
} from "@/app/lib/feriados/sync";

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

function getYearRangeUtc(ano: number) {
  return {
    start: new Date(Date.UTC(ano, 0, 1)),
    end: new Date(Date.UTC(ano, 11, 31, 23, 59, 59, 999)),
  };
}

function normalizeTextKey(value?: string | null): string {
  if (!value) return "";
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

function toDateIso(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function getHolidayDedupKey(feriado: {
  data: Date;
  tipo: TipoFeriado;
  uf?: string | null;
  municipio?: string | null;
  tribunalId?: string | null;
}): string {
  return [
    toDateIso(new Date(feriado.data)),
    feriado.tipo,
    normalizeTextKey(feriado.uf),
    normalizeTextKey(feriado.municipio),
    feriado.tribunalId ?? "",
  ].join("|");
}

function dedupeHolidaysByScope<
  T extends {
    data: Date;
    tipo: TipoFeriado;
    uf?: string | null;
    municipio?: string | null;
    tribunalId?: string | null;
    tenantId?: string | null;
  },
>(items: T[]): T[] {
  const map = new Map<string, T>();

  for (const item of items) {
    const key = getHolidayDedupKey(item);
    const existing = map.get(key);

    if (!existing) {
      map.set(key, item);
      continue;
    }

    const existingIsTenant = Boolean(existing.tenantId);
    const itemIsTenant = Boolean(item.tenantId);

    if (itemIsTenant && !existingIsTenant) {
      map.set(key, item);
    }
  }

  return Array.from(map.values()).sort(
    (a, b) => new Date(a.data).getTime() - new Date(b.data).getTime(),
  );
}

// ============================================
// LISTAGEM
// ============================================

export async function listFeriados(
  filters: FeriadoFilters,
): Promise<ActionResponse<any[]>> {
  try {
    const tenantId = await getTenantId();

    if (filters.ano) {
      await ensureSharedOfficialHolidaysForScope(filters.ano, {
        uf: filters.uf,
        municipio: filters.municipio,
      });
    }

    const andConditions: Prisma.FeriadoWhereInput[] = [
      {
        OR: [{ tenantId }, { tenantId: null }],
      },
      {
        deletedAt: null,
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

    const dedupedFeriados = dedupeHolidaysByScope(feriados);

    return {
      success: true,
      data: dedupedFeriados,
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
        deletedAt: null,
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

    revalidatePath("/regimes-prazo");

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
        deletedAt: null,
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

    revalidatePath("/regimes-prazo");

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
    const session = await getSession();
    const actor = session?.user as
      | { id?: string | null; role?: string | null }
      | undefined;
    const tenantId = await getTenantId();
    const feriadoAtual = await prisma.feriado.findFirst({
      where: {
        id: feriadoId,
        tenantId,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!feriadoAtual) {
      return {
        success: false,
        error: "Feriado não encontrado para este escritório",
      };
    }

    await prisma.feriado.update({
      where: { id: feriadoAtual.id },
      data: buildSoftDeletePayload(
        {
          actorId: actor?.id ?? null,
          actorType: actor?.role ?? "USER",
        },
        "Exclusão manual de feriado",
      ),
    });

    revalidatePath("/regimes-prazo");

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
    const autoSeedResult = await ensureSharedNationalHolidays(anoFiltro);

    const startOfYear = new Date(anoFiltro, 0, 1);
    const endOfYear = new Date(anoFiltro, 11, 31, 23, 59, 59);
    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      0,
      0,
      0,
      0,
    );
    const endOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59,
      999,
    );

    const where: Prisma.FeriadoWhereInput = {
      deletedAt: null,
      OR: [{ tenantId: tenantId }, { tenantId: null }],
      data: {
        gte: startOfYear,
        lte: endOfYear,
      },
    };

    const [feriadosAnoRaw, feriadosHojeCandidates] =
      await Promise.all([
      prisma.feriado.findMany({
        where,
        include: {
          tribunal: {
            select: {
              nome: true,
              sigla: true,
            },
          },
        },
      }),
      prisma.feriado.findMany({
        where: {
          AND: [
            {
              OR: [{ tenantId: tenantId }, { tenantId: null }],
            },
            {
              deletedAt: null,
            },
            {
              OR: [
                {
                  data: {
                    gte: startOfToday,
                    lte: endOfToday,
                  },
                },
                {
                  recorrente: true,
                },
              ],
            },
          ],
        },
        include: {
          tribunal: {
            select: {
              nome: true,
              sigla: true,
            },
          },
        },
        orderBy: [{ tenantId: "desc" }, { nome: "asc" }],
      }),
    ]);

    const feriadosAno = dedupeHolidaysByScope(feriadosAnoRaw);
    const porTipoMap = feriadosAno.reduce<Record<TipoFeriado, number>>(
      (acc, feriado) => {
        const tipo = feriado.tipo as TipoFeriado;
        acc[tipo] = (acc[tipo] || 0) + 1;
        return acc;
      },
      {
        NACIONAL: 0,
        ESTADUAL: 0,
        MUNICIPAL: 0,
        JUDICIARIO: 0,
      },
    );
    const porTipo = (Object.keys(porTipoMap) as TipoFeriado[]).map((tipo) => ({
      tipo,
      _count: porTipoMap[tipo] || 0,
    }));
    const proximosFeriados = feriadosAno
      .filter((feriado) => new Date(feriado.data) >= startOfToday)
      .slice(0, 5);

    const feriadosHoje = dedupeHolidaysByScope(feriadosHojeCandidates).filter((feriado) => {
      const feriadoDate = new Date(feriado.data);
      if (feriado.recorrente) {
        return (
          feriadoDate.getDate() === startOfToday.getDate() &&
          feriadoDate.getMonth() === startOfToday.getMonth()
        );
      }

      return feriadoDate >= startOfToday && feriadoDate <= endOfToday;
    });

    return {
      success: true,
      data: {
        total: feriadosAno.length,
        porTipo,
        proximosFeriados,
        feriadosHoje,
        ano: anoFiltro,
        autoSeed: {
          seeded: autoSeedResult.seeded,
          source: autoSeedResult.source ?? null,
          created: autoSeedResult.created ?? 0,
          updated: autoSeedResult.updated ?? 0,
          ignored: autoSeedResult.ignored ?? 0,
        },
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

    await ensureSharedOfficialHolidaysForScope(data.getUTCFullYear(), {
      uf,
      municipio,
    });

    const andConditions: Prisma.FeriadoWhereInput[] = [
      {
        OR: [{ tenantId }, { tenantId: null }],
      },
      {
        deletedAt: null,
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

export async function importarFeriadosOficiais(input: {
  ano: number;
  uf?: string;
  municipio?: string;
}): Promise<ActionResponse<any>> {
  try {
    const tenantId = await getTenantId();
    const ano = input.ano;
    const normalizedUf = input.uf?.trim().toUpperCase() || undefined;
    const normalizedMunicipio = input.municipio?.trim() || undefined;
    const { start, end } = getYearRangeUtc(ano);

    const summary = await ensureSharedOfficialHolidaysForScope(ano, {
      uf: normalizedUf,
      municipio: normalizedMunicipio,
    });

    const scopeWhere: Prisma.FeriadoWhereInput[] = [{ tipo: "NACIONAL" }];

    if (normalizedUf) {
      scopeWhere.push({ tipo: "ESTADUAL", uf: normalizedUf });
    }

    if (normalizedUf && normalizedMunicipio) {
      scopeWhere.push({
        tipo: "MUNICIPAL",
        uf: normalizedUf,
        municipio: normalizedMunicipio,
      });
    }

    const globalCount = await prisma.feriado.count({
      where: {
        tenantId: null,
        deletedAt: null,
        data: {
          gte: start,
          lte: end,
        },
        OR: scopeWhere,
      },
    });

    const blockingError = [
      summary.national,
      summary.state,
      summary.municipal,
    ].find((result) => {
      if (!result) return false;

      return (
        !result.seeded &&
        result.reason !== "cache_hit" &&
        result.reason !== "already_seeded" &&
        result.reason !== "provider_not_configured" &&
        result.reason !== "capital_only_scope"
      );
    });

    if (blockingError && globalCount <= 0) {
      if (blockingError.reason === "lock_busy") {
        return {
          success: false,
          error:
            "Sincronizacao ja esta em andamento por outro usuario. Aguarde alguns segundos e tente novamente.",
        };
      }

      return {
        success: false,
        error:
          blockingError.error ||
          "Fonte oficial indisponivel no momento. Tente novamente em alguns instantes.",
      };
    }

    revalidatePath("/regimes-prazo");

    try {
      const session = await getSession();
      const user = session?.user as any;
      if (tenantId) {
        await logAudit({
          tenantId,
          usuarioId: user?.id ?? null,
          acao: "FERIADO_OFICIAL_SYNC_EXECUTADO",
          entidade: "Feriado",
          dados: toAuditJson({
            ano,
            created: summary.created,
            updated: summary.updated,
            ignored: summary.ignored || globalCount,
            escopo: {
              nacional: true,
              uf: normalizedUf ?? null,
              municipio: normalizedMunicipio ?? null,
            },
            source: {
              nacional: summary.national.source ?? "cache_local",
              estadual: summary.state?.source ?? null,
              municipal: summary.municipal?.source ?? null,
            },
            warnings: summary.warnings,
          }),
          changedFields: ["created", "updated", "ignored"],
        });
      }
    } catch (auditError) {
      console.warn("Falha ao registrar auditoria de sincronizacao de feriados oficiais:", auditError);
    }

    return {
      success: true,
      data: {
        total: summary.created + summary.updated,
        created: summary.created,
        updated: summary.updated,
        ignored: summary.ignored || globalCount,
        sharedCatalog: true,
        warning: summary.warnings[0] || null,
        warnings: summary.warnings,
        escopo: {
          uf: normalizedUf ?? null,
          municipio: normalizedMunicipio ?? null,
        },
        sources: {
          nacional: summary.national.source ?? "cache_local",
          estadual: summary.state?.source ?? null,
          municipal: summary.municipal?.source ?? null,
        },
      },
    };
  } catch (error: any) {
    console.error("Erro ao importar feriados oficiais:", error);

    return {
      success: false,
      error: error.message || "Erro ao importar feriados oficiais",
    };
  }
}

export async function importarFeriadosNacionais(
  ano: number,
): Promise<ActionResponse<any>> {
  try {
    const tenantId = await getTenantId();
    const { start, end } = getYearRangeUtc(ano);
    const seeded = await ensureSharedNationalHolidays(ano);
    const globalCount = await prisma.feriado.count({
      where: {
        tenantId: null,
        deletedAt: null,
        tipo: "NACIONAL",
        data: {
          gte: start,
          lte: end,
        },
      },
    });

    if (!seeded.seeded && globalCount <= 0) {
      if (seeded.reason === "lock_busy") {
        return {
          success: false,
          error:
            "Sincronização já está em andamento por outro usuário. Aguarde alguns segundos e tente novamente.",
        };
      }

      if (seeded.reason === "source_unavailable") {
        return {
          success: false,
          error:
            "Fonte oficial indisponível no momento. Tente novamente em alguns instantes.",
        };
      }
    }

    revalidatePath("/regimes-prazo");

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
            created: seeded.created ?? 0,
            updated: seeded.updated ?? 0,
            ignored: seeded.ignored ?? globalCount,
            source: seeded.source ?? "cache_local",
            escopo: "global_shared",
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
        total: (seeded.created ?? 0) + (seeded.updated ?? 0),
        created: seeded.created ?? 0,
        updated: seeded.updated ?? 0,
        ignored: seeded.ignored ?? globalCount,
        source: seeded.source ?? "cache_local",
        feriados: [],
        sharedCatalog: true,
        seeded: seeded.seeded,
        reason: seeded.reason ?? "already_seeded",
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
