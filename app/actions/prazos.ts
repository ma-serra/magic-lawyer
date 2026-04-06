"use server";

import { getSession } from "@/app/lib/auth";
import prisma from "@/app/lib/prisma";
import logger from "@/lib/logger";
import { checkPermission } from "@/app/actions/equipe";
import { getAccessibleAdvogadoIds } from "@/app/lib/advogado-access";
import {
  buildProcessoAdvogadoMembershipWhere,
  buildProcessoClienteMembershipWhere,
} from "@/app/lib/processos/processo-vinculos";
import { backfillManagedPrazoPrincipalForWhere } from "@/app/lib/processos/prazo-principal-sync";
import { parseHolidayImpact, type HolidayImpactSnapshot } from "@/app/lib/feriados/holiday-impact";
import { Prisma, ProcessoPrazoStatus, RitoProcesso, TipoPrazoLegal, UserRole } from "@/generated/prisma";
import { normalizeLegacyRitoToRitoProcesso } from "@/app/lib/processos/rito-processo";

type PrazoWorkspaceHorizon =
  | "all"
  | "overdue"
  | "today"
  | "next_7d"
  | "next_30d"
  | "future"
  | "completed";

export type PrazosWorkspaceFilters = {
  search?: string;
  status?: "all" | ProcessoPrazoStatus;
  horizon?: PrazoWorkspaceHorizon;
  responsavelId?: string | null;
  processoId?: string | null;
  prazoId?: string | null;
  page?: number;
  perPage?: number;
};

export type PrazoWorkspaceItem = {
  id: string;
  titulo: string;
  descricao: string | null;
  fundamentoLegal: string | null;
  tipoPrazoLegal: TipoPrazoLegal | null;
  status: ProcessoPrazoStatus;
  dataVencimento: string;
  dataCumprimento: string | null;
  prorrogadoPara: string | null;
  holidayImpact: HolidayImpactSnapshot | null;
  responsavelId: string | null;
  responsavel: {
    id: string;
    nome: string;
    email: string;
  } | null;
  regimePrazo: {
    id: string;
    nome: string;
    tipo: string;
  } | null;
  origemMovimentacao: {
    id: string;
    titulo: string;
    dataMovimentacao: string;
  } | null;
  processo: {
    id: string;
    numero: string;
    rito: string | null;
    ritoProcesso: RitoProcesso | null;
    clienteNome: string;
    advogadoResponsavelNome: string | null;
  };
};

type PrazosWorkspaceResponse = {
  summary: {
    total: number;
    abertos: number;
    vencidos: number;
    venceHoje: number;
    proximos7Dias: number;
    proximos30Dias: number;
    concluidos: number;
    semResponsavel: number;
  };
  items: PrazoWorkspaceItem[];
  highlights: PrazoWorkspaceItem[];
  focusedPrazo?: PrazoWorkspaceItem | null;
  filters: {
    processos: Array<{
      id: string;
      numero: string;
      clienteNome: string;
    }>;
    responsaveis: Array<{
      id: string;
      nome: string;
      email: string;
    }>;
  };
  pagination: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
  };
};

async function getClienteIdFromSession(session: { user: any } | null) {
  if (!session?.user?.id || !session.user.tenantId) {
    return null;
  }

  const cliente = await prisma.cliente.findFirst({
    where: {
      tenantId: session.user.tenantId,
      usuarioId: session.user.id,
      deletedAt: null,
    },
    select: {
      id: true,
    },
  });

  return cliente?.id ?? null;
}

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

async function buildAccessibleProcessWhere(session: { user: any }) {
  const user = session.user as any;
  const isAdmin =
    user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN;
  const clienteId = await getClienteIdFromSession(session);
  const accessibleAdvogados = await getAccessibleAdvogadoIds(session as any);

  const whereClause: Prisma.ProcessoWhereInput = {
    tenantId: user.tenantId,
    deletedAt: null,
  };

  if (clienteId) {
    return {
      ...whereClause,
      ...buildProcessoClienteMembershipWhere(clienteId),
    };
  }

  if (!isAdmin && accessibleAdvogados.length > 0) {
    const orConditions: Prisma.ProcessoWhereInput[] = [
      buildProcessoAdvogadoMembershipWhere(accessibleAdvogados),
      {
        procuracoesVinculadas: {
          some: {
            procuracao: {
              outorgados: {
                some: {
                  advogadoId: {
                    in: accessibleAdvogados,
                  },
                },
              },
            },
          },
        },
      },
      {
        partes: {
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
    ];

    if (user.role === UserRole.ADVOGADO) {
      orConditions.push({
        cliente: {
          usuario: {
            createdById: user.id,
          },
        },
      });
    }

    whereClause.OR = orConditions;
  }

  return whereClause;
}

function buildHorizonWhere(
  horizon: PrazoWorkspaceHorizon,
  now: Date,
): Prisma.ProcessoPrazoWhereInput | undefined {
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const tomorrowStart = startOfDay(addDays(now, 1));
  const sevenDaysEnd = endOfDay(addDays(now, 7));
  const thirtyDaysEnd = endOfDay(addDays(now, 30));
  const next30Start = startOfDay(addDays(now, 8));
  const openStatuses = {
    in: [ProcessoPrazoStatus.ABERTO, ProcessoPrazoStatus.PRORROGADO],
  };

  switch (horizon) {
    case "overdue":
      return {
        status: openStatuses,
        dataVencimento: { lt: todayStart },
      };
    case "today":
      return {
        status: openStatuses,
        dataVencimento: { gte: todayStart, lte: todayEnd },
      };
    case "next_7d":
      return {
        status: openStatuses,
        dataVencimento: { gte: tomorrowStart, lte: sevenDaysEnd },
      };
    case "next_30d":
      return {
        status: openStatuses,
        dataVencimento: { gte: next30Start, lte: thirtyDaysEnd },
      };
    case "future":
      return {
        status: openStatuses,
        dataVencimento: { gt: thirtyDaysEnd },
      };
    case "completed":
      return {
        status: ProcessoPrazoStatus.CONCLUIDO,
      };
    default:
      return undefined;
  }
}

function serializePrazoItem(
  prazo: Prisma.ProcessoPrazoGetPayload<{
    include: {
      responsavel: {
        select: {
          id: true;
          firstName: true;
          lastName: true;
          email: true;
        };
      };
      regimePrazo: {
        select: {
          id: true;
          nome: true;
          tipo: true;
        };
      };
      origemMovimentacao: {
        select: {
          id: true;
          titulo: true;
          dataMovimentacao: true;
        };
      };
      processo: {
        select: {
          id: true;
          numero: true;
          rito: true;
          ritoProcesso: true;
          cliente: {
            select: {
              nome: true;
            };
          };
          advogadoResponsavel: {
            select: {
              usuario: {
                select: {
                  firstName: true;
                  lastName: true;
                };
              };
            };
          };
        };
      };
    };
  }>,
): PrazoWorkspaceItem {
  const responsavelNome = prazo.responsavel
    ? `${prazo.responsavel.firstName ?? ""} ${prazo.responsavel.lastName ?? ""}`.trim() ||
      prazo.responsavel.email
    : null;

  const advogadoResponsavelNome =
    prazo.processo.advogadoResponsavel?.usuario
      ? `${prazo.processo.advogadoResponsavel.usuario.firstName ?? ""} ${prazo.processo.advogadoResponsavel.usuario.lastName ?? ""}`.trim() ||
        null
      : null;

  return {
    id: prazo.id,
    titulo: prazo.titulo,
    descricao: prazo.descricao ?? null,
    fundamentoLegal: prazo.fundamentoLegal ?? null,
    tipoPrazoLegal: prazo.tipoPrazoLegal ?? null,
    status: prazo.status,
    dataVencimento: prazo.dataVencimento.toISOString(),
    dataCumprimento: prazo.dataCumprimento?.toISOString() ?? null,
    prorrogadoPara: prazo.prorrogadoPara?.toISOString() ?? null,
    holidayImpact: parseHolidayImpact(prazo.holidayImpact),
    responsavelId: prazo.responsavelId ?? null,
    responsavel: prazo.responsavel
      ? {
          id: prazo.responsavel.id,
          nome: responsavelNome ?? prazo.responsavel.email,
          email: prazo.responsavel.email,
        }
      : null,
    regimePrazo: prazo.regimePrazo
      ? {
          id: prazo.regimePrazo.id,
          nome: prazo.regimePrazo.nome,
          tipo: prazo.regimePrazo.tipo,
        }
      : null,
    origemMovimentacao: prazo.origemMovimentacao
      ? {
          id: prazo.origemMovimentacao.id,
          titulo: prazo.origemMovimentacao.titulo,
          dataMovimentacao: prazo.origemMovimentacao.dataMovimentacao.toISOString(),
        }
      : null,
    processo: {
      id: prazo.processo.id,
      numero: prazo.processo.numero,
      rito: prazo.processo.rito ?? null,
      ritoProcesso:
        prazo.processo.ritoProcesso ??
        normalizeLegacyRitoToRitoProcesso(prazo.processo.rito),
      clienteNome: prazo.processo.cliente.nome,
      advogadoResponsavelNome,
    },
  };
}

export async function getPrazosWorkspace(
  filters: PrazosWorkspaceFilters = {},
): Promise<{ success: boolean; data?: PrazosWorkspaceResponse; error?: string }> {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;

    if (!user.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    if (
      ![
        UserRole.ADMIN,
        UserRole.SUPER_ADMIN,
        UserRole.ADVOGADO,
        UserRole.SECRETARIA,
      ].includes(user.role)
    ) {
      return { success: false, error: "Sem acesso à central de prazos" };
    }

    if (
      user.role !== UserRole.ADMIN &&
      user.role !== UserRole.SUPER_ADMIN &&
      user.role !== UserRole.SECRETARIA &&
      user.role !== UserRole.ADVOGADO
    ) {
      return { success: false, error: "Sem acesso à central de prazos" };
    }

    if (
      user.role !== UserRole.ADMIN &&
      user.role !== UserRole.SUPER_ADMIN
    ) {
      const hasPermission = await checkPermission("processos", "visualizar");

      if (!hasPermission) {
        return { success: false, error: "Sem permissão para visualizar prazos" };
      }
    }

    const page = Math.max(1, filters.page ?? 1);
    const perPage = Math.min(50, Math.max(8, filters.perPage ?? 12));
    const search = filters.search?.trim();
    const horizon = filters.horizon ?? "all";
    const processWhere = await buildAccessibleProcessWhere(session as any);
    await backfillManagedPrazoPrincipalForWhere({
      tenantId: user.tenantId,
      processWhere,
    });
    const baseWhere: Prisma.ProcessoPrazoWhereInput = {
      tenantId: user.tenantId,
      deletedAt: null,
      processo: processWhere,
    };

    const todayStart = startOfDay(new Date());
    const todayEnd = endOfDay(new Date());
    const sevenDaysEnd = endOfDay(addDays(new Date(), 7));
    const thirtyDaysEnd = endOfDay(addDays(new Date(), 30));
    const openStatuses = [ProcessoPrazoStatus.ABERTO, ProcessoPrazoStatus.PRORROGADO];

    const where: Prisma.ProcessoPrazoWhereInput = {
      ...baseWhere,
      ...(filters.status && filters.status !== "all"
        ? { status: filters.status }
        : {}),
      ...(filters.processoId ? { processoId: filters.processoId } : {}),
      ...(filters.responsavelId ? { responsavelId: filters.responsavelId } : {}),
      ...(buildHorizonWhere(horizon, new Date()) ?? {}),
    };

    if (search) {
      where.OR = [
        { titulo: { contains: search, mode: "insensitive" } },
        { descricao: { contains: search, mode: "insensitive" } },
        { fundamentoLegal: { contains: search, mode: "insensitive" } },
        { processo: { numero: { contains: search, mode: "insensitive" } } },
        { processo: { numeroCnj: { contains: search, mode: "insensitive" } } },
        { processo: { cliente: { nome: { contains: search, mode: "insensitive" } } } },
      ];
    }

    const orderBy =
      horizon === "completed" || filters.status === ProcessoPrazoStatus.CONCLUIDO
        ? [{ dataCumprimento: "desc" as const }, { dataVencimento: "desc" as const }]
        : [{ dataVencimento: "asc" as const }];

    const [total, itemsRaw, highlightsRaw, focusedPrazoRaw, processosRaw, responsaveisRaw, abertos, vencidos, venceHoje, proximos7Dias, proximos30Dias, concluidos, semResponsavel] =
      await Promise.all([
        prisma.processoPrazo.count({ where }),
        prisma.processoPrazo.findMany({
          where,
          include: {
            responsavel: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
            regimePrazo: {
              select: {
                id: true,
                nome: true,
                tipo: true,
              },
            },
            origemMovimentacao: {
              select: {
                id: true,
                titulo: true,
                dataMovimentacao: true,
              },
            },
            processo: {
              select: {
                id: true,
                numero: true,
                rito: true,
                ritoProcesso: true,
                cliente: { select: { nome: true } },
                advogadoResponsavel: {
                  select: {
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
          },
          orderBy,
          skip: (page - 1) * perPage,
          take: perPage,
        }),
        prisma.processoPrazo.findMany({
          where: {
            ...baseWhere,
            status: { in: openStatuses },
            dataVencimento: { lte: sevenDaysEnd },
          },
          include: {
            responsavel: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
            regimePrazo: {
              select: {
                id: true,
                nome: true,
                tipo: true,
              },
            },
            origemMovimentacao: {
              select: {
                id: true,
                titulo: true,
                dataMovimentacao: true,
              },
            },
            processo: {
              select: {
                id: true,
                numero: true,
                rito: true,
                ritoProcesso: true,
                cliente: { select: { nome: true } },
                advogadoResponsavel: {
                  select: {
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
          },
          orderBy: [{ dataVencimento: "asc" }],
          take: 6,
        }),
        filters.prazoId
          ? prisma.processoPrazo.findFirst({
              where: {
                ...baseWhere,
                id: filters.prazoId,
                ...(filters.processoId ? { processoId: filters.processoId } : {}),
              },
              include: {
                responsavel: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                  },
                },
                regimePrazo: {
                  select: {
                    id: true,
                    nome: true,
                    tipo: true,
                  },
                },
                origemMovimentacao: {
                  select: {
                    id: true,
                    titulo: true,
                    dataMovimentacao: true,
                  },
                },
                processo: {
                  select: {
                    id: true,
                    numero: true,
                    rito: true,
                    ritoProcesso: true,
                    cliente: { select: { nome: true } },
                    advogadoResponsavel: {
                      select: {
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
              },
            })
          : Promise.resolve(null),
        prisma.processo.findMany({
          where: {
            ...processWhere,
            prazos: {
              some: {
                tenantId: user.tenantId,
                deletedAt: null,
              },
            },
          },
          select: {
            id: true,
            numero: true,
            cliente: {
              select: {
                nome: true,
              },
            },
          },
          orderBy: [{ updatedAt: "desc" }],
          take: 200,
        }),
        prisma.processoPrazo.findMany({
          where: {
            ...baseWhere,
            responsavelId: { not: null },
          },
          select: {
            responsavelId: true,
            responsavel: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
          distinct: ["responsavelId"],
          orderBy: [{ responsavelId: "asc" }],
          take: 100,
        }),
        prisma.processoPrazo.count({
          where: {
            ...baseWhere,
            status: { in: openStatuses },
          },
        }),
        prisma.processoPrazo.count({
          where: {
            ...baseWhere,
            status: { in: openStatuses },
            dataVencimento: { lt: todayStart },
          },
        }),
        prisma.processoPrazo.count({
          where: {
            ...baseWhere,
            status: { in: openStatuses },
            dataVencimento: { gte: todayStart, lte: todayEnd },
          },
        }),
        prisma.processoPrazo.count({
          where: {
            ...baseWhere,
            status: { in: openStatuses },
            dataVencimento: { gt: todayEnd, lte: sevenDaysEnd },
          },
        }),
        prisma.processoPrazo.count({
          where: {
            ...baseWhere,
            status: { in: openStatuses },
            dataVencimento: { gt: sevenDaysEnd, lte: thirtyDaysEnd },
          },
        }),
        prisma.processoPrazo.count({
          where: {
            ...baseWhere,
            status: ProcessoPrazoStatus.CONCLUIDO,
          },
        }),
        prisma.processoPrazo.count({
          where: {
            ...baseWhere,
            status: { in: openStatuses },
            responsavelId: null,
          },
        }),
      ]);

    const items = itemsRaw.map(serializePrazoItem);
    const highlights = highlightsRaw.map(serializePrazoItem);
    const focusedPrazo = focusedPrazoRaw ? serializePrazoItem(focusedPrazoRaw) : null;

    return {
      success: true,
      data: {
        summary: {
          total,
          abertos,
          vencidos,
          venceHoje,
          proximos7Dias,
          proximos30Dias,
          concluidos,
          semResponsavel,
        },
        items,
        highlights,
        focusedPrazo,
        filters: {
          processos: processosRaw.map((processo) => ({
            id: processo.id,
            numero: processo.numero,
            clienteNome: processo.cliente.nome,
          })),
          responsaveis: responsaveisRaw
            .map((entry) => entry.responsavel)
            .filter(Boolean)
            .map((responsavel) => ({
              id: responsavel!.id,
              nome:
                `${responsavel!.firstName ?? ""} ${responsavel!.lastName ?? ""}`.trim() ||
                responsavel!.email,
              email: responsavel!.email,
            })),
        },
        pagination: {
          page,
          perPage,
          total,
          totalPages: Math.max(1, Math.ceil(total / perPage)),
        },
      },
    };
  } catch (error) {
    logger.error("Erro ao carregar central de prazos:", error);

    return {
      success: false,
      error: "Erro ao carregar central de prazos",
    };
  }
}
