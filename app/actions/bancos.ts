"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth/next";

import prisma from "@/app/lib/prisma";
import {
  buildBancoCatalogQualitySummary,
  type BancoQualitySignal,
  validateBancoInput,
} from "@/app/lib/bancos/catalog-utils";
import { authOptions } from "@/auth";
import { Prisma, UserRole } from "@/generated/prisma";
import logger from "@/lib/logger";

export interface BancoCreateInput {
  codigo: string;
  nome: string;
  nomeCompleto?: string;
  site?: string;
  telefone?: string;
  cnpj?: string;
  ispb?: string;
}

export interface BancoUpdateInput {
  nome?: string;
  nomeCompleto?: string;
  site?: string;
  telefone?: string;
  cnpj?: string;
  ispb?: string;
  ativo?: boolean;
}

export type BancoUsageFilter = "used" | "unused";
export type BancoQualityFilter = "anomaly" | "clean";

export interface BancoListFilters {
  search?: string;
  ativo?: boolean;
  usage?: BancoUsageFilter;
  quality?: BancoQualityFilter;
  page?: number;
  limit?: number;
}

export interface BancoCatalogRow {
  id: string;
  codigo: string;
  nome: string;
  nomeCompleto: string | null;
  site: string | null;
  telefone: string | null;
  cnpj: string | null;
  ispb: string | null;
  ativo: boolean;
  createdAt: Date;
  updatedAt: Date;
  linkedAccounts: number;
  impactedTenants: number;
  usageBreakdown: {
    escritorio: number;
    usuario: number;
    cliente: number;
  };
  qualitySignals: BancoQualitySignal[];
  hasAnomaly: boolean;
}

export interface BancoDashboardData {
  totalBancos: number;
  bancosAtivos: number;
  bancosInativos: number;
  bancosEmUso: number;
  bancosSemUso: number;
  contasVinculadas: number;
  tenantsImpactados: number;
  anomaliasCatalogo: number;
  contasEmAnomalia: number;
  distribuicaoCadastros: {
    escritorio: number;
    usuario: number;
    cliente: number;
  };
  bancoMaisUsado: Pick<
    BancoCatalogRow,
    "codigo" | "nome" | "linkedAccounts" | "impactedTenants"
  > | null;
  bancosMaisUsados: Array<
    Pick<
      BancoCatalogRow,
      "codigo" | "nome" | "linkedAccounts" | "impactedTenants"
    >
  >;
  bancosComAnomalia: Array<
    Pick<
      BancoCatalogRow,
      "codigo" | "nome" | "linkedAccounts" | "impactedTenants" | "qualitySignals"
    >
  >;
}

async function requireAuthenticated() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return { success: false as const, error: "Não autorizado" };
  }

  return { success: true as const, user: session.user as any };
}

async function requireSuperAdmin() {
  const auth = await requireAuthenticated();

  if (!auth.success) {
    return auth;
  }

  if (auth.user.role !== UserRole.SUPER_ADMIN) {
    return {
      success: false as const,
      error: "Acesso negado. Apenas Super Admin pode executar esta ação.",
    };
  }

  return auth;
}

function revalidateBancoPaths() {
  revalidatePath("/admin/bancos");
  revalidatePath("/dados-bancarios");
  revalidatePath("/financeiro/dados-bancarios");
}

function buildBancoWhere(filters: BancoListFilters): Prisma.BancoWhereInput {
  const where: Prisma.BancoWhereInput = {
    deletedAt: null,
  };

  if (filters.ativo !== undefined) {
    where.ativo = filters.ativo;
  }

  if (filters.usage === "used") {
    where.dadosBancarios = { some: { deletedAt: null } };
  }

  if (filters.usage === "unused") {
    where.dadosBancarios = { none: { deletedAt: null } };
  }

  if (filters.search) {
    const search = filters.search.trim();
    const digits = search.replace(/\D/g, "");

    where.OR = [
      { codigo: { contains: search, mode: "insensitive" } },
      { nome: { contains: search, mode: "insensitive" } },
      { nomeCompleto: { contains: search, mode: "insensitive" } },
      { ispb: { contains: digits || search, mode: "insensitive" } },
      { cnpj: { contains: digits || search, mode: "insensitive" } },
    ];
  }

  return where;
}

async function fetchBancoCatalogSnapshot(filters: BancoListFilters = {}) {
  const where = buildBancoWhere(filters);

  const bancos = await prisma.banco.findMany({
    where,
    orderBy: [{ ativo: "desc" }, { nome: "asc" }],
    select: {
      id: true,
      codigo: true,
      nome: true,
      nomeCompleto: true,
      site: true,
      telefone: true,
      cnpj: true,
      ispb: true,
      ativo: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (bancos.length === 0) {
    return {
      rows: [] as BancoCatalogRow[],
      totalRows: 0,
      qualitySummary: buildBancoCatalogQualitySummary([]),
      usageTotals: {
        linkedAccounts: 0,
        impactedTenants: 0,
        escritorio: 0,
        usuario: 0,
        cliente: 0,
      },
    };
  }

  const codigos = bancos.map((banco) => banco.codigo);

  const [
    linkedGroups,
    tenantGroups,
    escritorioGroups,
    usuarioGroups,
    clienteGroups,
  ] = await Promise.all([
    prisma.dadosBancarios.groupBy({
      by: ["bancoCodigo"],
      where: {
        deletedAt: null,
        bancoCodigo: { in: codigos },
      },
      _count: { _all: true },
    }),
    prisma.dadosBancarios.groupBy({
      by: ["bancoCodigo", "tenantId"],
      where: {
        deletedAt: null,
        bancoCodigo: { in: codigos },
      },
      _count: { _all: true },
    }),
    prisma.dadosBancarios.groupBy({
      by: ["bancoCodigo"],
      where: {
        deletedAt: null,
        bancoCodigo: { in: codigos },
        usuarioId: null,
        clienteId: null,
      },
      _count: { _all: true },
    }),
    prisma.dadosBancarios.groupBy({
      by: ["bancoCodigo"],
      where: {
        deletedAt: null,
        bancoCodigo: { in: codigos },
        usuarioId: { not: null },
      },
      _count: { _all: true },
    }),
    prisma.dadosBancarios.groupBy({
      by: ["bancoCodigo"],
      where: {
        deletedAt: null,
        bancoCodigo: { in: codigos },
        clienteId: { not: null },
      },
      _count: { _all: true },
    }),
  ]);

  const linkedMap = new Map(
    linkedGroups.map((group) => [group.bancoCodigo, group._count._all]),
  );
  const tenantImpactMap = new Map<string, number>();
  const escritorioMap = new Map(
    escritorioGroups.map((group) => [group.bancoCodigo, group._count._all]),
  );
  const usuarioMap = new Map(
    usuarioGroups.map((group) => [group.bancoCodigo, group._count._all]),
  );
  const clienteMap = new Map(
    clienteGroups.map((group) => [group.bancoCodigo, group._count._all]),
  );

  for (const group of tenantGroups) {
    tenantImpactMap.set(
      group.bancoCodigo,
      (tenantImpactMap.get(group.bancoCodigo) || 0) + 1,
    );
  }

  const qualitySummary = buildBancoCatalogQualitySummary(
    bancos.map((banco) => ({
      codigo: banco.codigo,
      nome: banco.nome,
      nomeCompleto: banco.nomeCompleto,
      ispb: banco.ispb,
    })),
  );

  let rows = bancos.map((banco) => {
    const linkedAccounts = linkedMap.get(banco.codigo) || 0;
    const qualitySignals = qualitySummary.signalsByCodigo[banco.codigo] || [];

    return {
      ...banco,
      linkedAccounts,
      impactedTenants: tenantImpactMap.get(banco.codigo) || 0,
      usageBreakdown: {
        escritorio: escritorioMap.get(banco.codigo) || 0,
        usuario: usuarioMap.get(banco.codigo) || 0,
        cliente: clienteMap.get(banco.codigo) || 0,
      },
      qualitySignals,
      hasAnomaly: qualitySignals.length > 0,
    } satisfies BancoCatalogRow;
  });

  if (filters.quality === "anomaly") {
    rows = rows.filter((row) => row.hasAnomaly);
  }

  if (filters.quality === "clean") {
    rows = rows.filter((row) => !row.hasAnomaly);
  }

  const usageTotals = rows.reduce(
    (accumulator, row) => {
      accumulator.linkedAccounts += row.linkedAccounts;
      accumulator.escritorio += row.usageBreakdown.escritorio;
      accumulator.usuario += row.usageBreakdown.usuario;
      accumulator.cliente += row.usageBreakdown.cliente;

      return accumulator;
    },
    {
      linkedAccounts: 0,
      impactedTenants: 0,
      escritorio: 0,
      usuario: 0,
      cliente: 0,
    },
  );

  usageTotals.impactedTenants = new Set(tenantGroups.map((group) => group.tenantId))
    .size;

  const page = filters.page ?? 1;
  const limit = filters.limit ?? 100;
  const start = (page - 1) * limit;
  const paginatedRows = rows.slice(start, start + limit);

  return {
    rows: paginatedRows,
    totalRows: rows.length,
    qualitySummary,
    usageTotals,
  };
}

export async function listBancos(filters: BancoListFilters = {}) {
  try {
    const auth = await requireSuperAdmin();

    if (!auth.success) {
      return auth;
    }

    const page = filters.page ?? 1;
    const limit = filters.limit ?? 100;
    const snapshot = await fetchBancoCatalogSnapshot(filters);

    return {
      success: true,
      bancos: snapshot.rows,
      pagination: {
        page,
        limit,
        total: snapshot.totalRows,
        pages: Math.max(1, Math.ceil(snapshot.totalRows / limit)),
      },
    };
  } catch (error) {
    logger.error("Erro ao listar bancos:", error);

    return {
      success: false,
      error: "Erro interno do servidor",
    };
  }
}

export async function getBanco(codigo: string) {
  try {
    const auth = await requireSuperAdmin();

    if (!auth.success) {
      return auth;
    }

    const snapshot = await fetchBancoCatalogSnapshot({ limit: 1000 });
    const banco = snapshot.rows.find((row) => row.codigo === codigo);

    if (!banco) {
      return {
        success: false,
        error: "Banco não encontrado",
      };
    }

    return {
      success: true,
      banco,
    };
  } catch (error) {
    logger.error("Erro ao buscar banco:", error);

    return {
      success: false,
      error: "Erro interno do servidor",
    };
  }
}

export async function createBanco(data: BancoCreateInput) {
  try {
    const auth = await requireSuperAdmin();

    if (!auth.success) {
      return auth;
    }

    const validation = validateBancoInput(data);

    if (!validation.ok) {
      return {
        success: false,
        error: validation.errors[0],
      };
    }

    const payload = validation.data;
    const bancoExistente = await prisma.banco.findUnique({
      where: { codigo: payload.codigo },
    });

    if (bancoExistente && !bancoExistente.deletedAt) {
      return {
        success: false,
        error: "Código COMPE já existe no catálogo.",
      };
    }

    const banco = bancoExistente
      ? await prisma.banco.update({
          where: { codigo: payload.codigo },
          data: {
            codigo: payload.codigo,
            nome: payload.nome,
            nomeCompleto: payload.nomeCompleto,
            site: payload.site,
            telefone: payload.telefone,
            cnpj: payload.cnpj,
            ispb: payload.ispb,
            ativo: payload.ativo,
            deletedAt: null,
            updatedAt: new Date(),
          },
        })
      : await prisma.banco.create({
          data: {
            codigo: payload.codigo,
            nome: payload.nome,
            nomeCompleto: payload.nomeCompleto,
            site: payload.site,
            telefone: payload.telefone,
            cnpj: payload.cnpj,
            ispb: payload.ispb,
            ativo: payload.ativo,
          },
        });

    revalidateBancoPaths();

    return {
      success: true,
      banco,
    };
  } catch (error) {
    logger.error("Erro ao criar banco:", error);

    return {
      success: false,
      error: "Erro interno do servidor",
    };
  }
}

export async function updateBanco(codigo: string, data: BancoUpdateInput) {
  try {
    const auth = await requireSuperAdmin();

    if (!auth.success) {
      return auth;
    }

    const validation = validateBancoInput({ ...data, codigo });

    if (!validation.ok) {
      return {
        success: false,
        error: validation.errors[0],
      };
    }

    const payload = validation.data;
    const banco = await prisma.banco.update({
      where: { codigo },
      data: {
        nome: payload.nome,
        nomeCompleto: payload.nomeCompleto,
        site: payload.site,
        telefone: payload.telefone,
        cnpj: payload.cnpj,
        ispb: payload.ispb,
        ativo: payload.ativo,
        updatedAt: new Date(),
      },
    });

    revalidateBancoPaths();

    return {
      success: true,
      banco,
    };
  } catch (error) {
    logger.error("Erro ao atualizar banco:", error);

    return {
      success: false,
      error: "Erro interno do servidor",
    };
  }
}

export async function deleteBanco(codigo: string) {
  try {
    const auth = await requireSuperAdmin();

    if (!auth.success) {
      return auth;
    }

    const dadosBancariosCount = await prisma.dadosBancarios.count({
      where: { bancoCodigo: codigo, deletedAt: null },
    });

    if (dadosBancariosCount > 0) {
      return {
        success: false,
        error: `Não é possível excluir a instituição. Existem ${dadosBancariosCount} conta(s) vinculada(s) no sistema.`,
      };
    }

    await prisma.banco.update({
      where: { codigo },
      data: {
        deletedAt: new Date(),
        ativo: false,
      },
    });

    revalidateBancoPaths();

    return {
      success: true,
    };
  } catch (error) {
    logger.error("Erro ao excluir banco:", error);

    return {
      success: false,
      error: "Erro interno do servidor",
    };
  }
}

export async function toggleBancoStatus(codigo: string) {
  try {
    const auth = await requireSuperAdmin();

    if (!auth.success) {
      return auth;
    }

    const banco = await prisma.banco.findUnique({
      where: { codigo },
    });

    if (!banco || banco.deletedAt) {
      return {
        success: false,
        error: "Banco não encontrado",
      };
    }

    const bancoAtualizado = await prisma.banco.update({
      where: { codigo },
      data: {
        ativo: !banco.ativo,
        updatedAt: new Date(),
      },
    });

    revalidateBancoPaths();

    return {
      success: true,
      banco: bancoAtualizado,
    };
  } catch (error) {
    logger.error("Erro ao alternar status do banco:", error);

    return {
      success: false,
      error: "Erro interno do servidor",
    };
  }
}

export async function getBancosAtivos() {
  try {
    const auth = await requireAuthenticated();

    if (!auth.success) {
      return auth;
    }

    const bancos = await prisma.banco.findMany({
      where: {
        ativo: true,
        deletedAt: null,
      },
      orderBy: { nome: "asc" },
      select: {
        codigo: true,
        nome: true,
        nomeCompleto: true,
      },
    });

    return {
      success: true,
      bancos,
    };
  } catch (error) {
    logger.error("Erro ao buscar bancos ativos:", error);

    return {
      success: false,
      error: "Erro interno do servidor",
    };
  }
}

export async function getDashboardBancos() {
  try {
    const auth = await requireSuperAdmin();

    if (!auth.success) {
      return auth;
    }

    const snapshot = await fetchBancoCatalogSnapshot({ limit: 1000 });
    const allRows = snapshot.rows;
    const bancosEmUso = allRows.filter((row) => row.linkedAccounts > 0);
    const bancosComAnomalia = allRows.filter((row) => row.hasAnomaly);
    const bancoMaisUsado = [...bancosEmUso].sort(
      (left, right) => right.linkedAccounts - left.linkedAccounts,
    )[0];

    const dashboard: BancoDashboardData = {
      totalBancos: allRows.length,
      bancosAtivos: allRows.filter((row) => row.ativo).length,
      bancosInativos: allRows.filter((row) => !row.ativo).length,
      bancosEmUso: bancosEmUso.length,
      bancosSemUso: allRows.length - bancosEmUso.length,
      contasVinculadas: snapshot.usageTotals.linkedAccounts,
      tenantsImpactados: snapshot.usageTotals.impactedTenants,
      anomaliasCatalogo: bancosComAnomalia.length,
      contasEmAnomalia: bancosComAnomalia.reduce(
        (total, row) => total + row.linkedAccounts,
        0,
      ),
      distribuicaoCadastros: {
        escritorio: snapshot.usageTotals.escritorio,
        usuario: snapshot.usageTotals.usuario,
        cliente: snapshot.usageTotals.cliente,
      },
      bancoMaisUsado: bancoMaisUsado
        ? {
            codigo: bancoMaisUsado.codigo,
            nome: bancoMaisUsado.nome,
            linkedAccounts: bancoMaisUsado.linkedAccounts,
            impactedTenants: bancoMaisUsado.impactedTenants,
          }
        : null,
      bancosMaisUsados: [...bancosEmUso]
        .sort((left, right) => right.linkedAccounts - left.linkedAccounts)
        .slice(0, 5)
        .map((row) => ({
          codigo: row.codigo,
          nome: row.nome,
          linkedAccounts: row.linkedAccounts,
          impactedTenants: row.impactedTenants,
        })),
      bancosComAnomalia: [...bancosComAnomalia]
        .sort((left, right) => right.linkedAccounts - left.linkedAccounts)
        .slice(0, 5)
        .map((row) => ({
          codigo: row.codigo,
          nome: row.nome,
          linkedAccounts: row.linkedAccounts,
          impactedTenants: row.impactedTenants,
          qualitySignals: row.qualitySignals,
        })),
    };

    return {
      success: true,
      dashboard,
    };
  } catch (error) {
    logger.error("Erro ao buscar dashboard de bancos:", error);

    return {
      success: false,
      error: "Erro interno do servidor",
    };
  }
}

export async function buscarBancoPorCodigo(codigo: string) {
  try {
    const auth = await requireAuthenticated();

    if (!auth.success) {
      return auth;
    }

    const banco = await prisma.banco.findUnique({
      where: {
        codigo,
        ativo: true,
        deletedAt: null,
      },
      select: {
        codigo: true,
        nome: true,
        nomeCompleto: true,
      },
    });

    return {
      success: true,
      banco,
    };
  } catch (error) {
    logger.error("Erro ao buscar banco por código:", error);

    return {
      success: false,
      error: "Erro interno do servidor",
    };
  }
}

export async function getBancosDisponiveis() {
  try {
    const auth = await requireAuthenticated();

    if (!auth.success) {
      return auth;
    }

    const bancos = await prisma.banco.findMany({
      where: {
        ativo: true,
        deletedAt: null,
      },
      orderBy: { nome: "asc" },
      select: {
        codigo: true,
        nome: true,
        nomeCompleto: true,
      },
    });

    return {
      success: true,
      bancos,
    };
  } catch (error) {
    logger.error("Erro ao buscar bancos disponíveis:", error);

    return {
      success: false,
      error: "Erro interno do servidor",
    };
  }
}
