"use server";

import { getServerSession } from "next-auth";

import { authOptions } from "@/auth";
import prisma, { convertAllDecimalFields } from "@/app/lib/prisma";
import { checkPermission } from "@/app/actions/equipe";
import { Prisma } from "@/generated/prisma";

// ============================================
// Types
// ============================================

export interface FiltrosRecibos {
  dataInicio?: Date | string;
  dataFim?: Date | string;
  clienteId?: string;
  contratoId?: string;
  processoId?: string;
  advogadoId?: string;
  status?: "PAGA" | "PENDENTE" | "ATRASADA" | "CANCELADA";
  tipo?: "PARCELA";
  formaPagamento?: string;
  search?: string;
  pagina?: number;
  itensPorPagina?: number;
}

export interface ReciboParcela {
  id: string;
  tipo: "PARCELA";
  numero: string;
  titulo: string;
  descricao: string | null;
  valor: number;
  dataVencimento: Date;
  dataPagamento: Date | null;
  status: string;
  formaPagamento: string | null;
  asaasPaymentId: string | null;
  dadosPagamento: any;
  contrato: {
    id: string;
    numero: string;
    tipo: string;
    cliente: {
      id: string;
      nome: string;
      documento: string | null;
      email: string | null;
      telefone: string | null;
      celular: string | null;
    };
    processo?: {
      id: string;
      numero: string;
      numeroCnj: string | null;
      titulo: string | null;
      valorCausa: number | null;
      orgaoJulgador: string | null;
      vara: string | null;
      comarca: string | null;
    } | null;
    advogadoResponsavel?: {
      id: string;
      usuario: {
        id: string;
        firstName: string;
        lastName: string;
        email: string;
      };
    } | null;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface ReciboFatura {
  id: string;
  tipo: "FATURA";
  numero: string;
  titulo: string;
  descricao: string | null;
  valor: number;
  dataVencimento: Date | null;
  dataPagamento: Date | null;
  status: string;
  contrato: {
    id: string;
    numero: string;
    tipo: string;
    cliente: {
      id: string;
      nome: string;
      documento: string | null;
      email: string | null;
      telefone: string | null;
      celular: string | null;
    };
    processo?: {
      id: string;
      numero: string;
      numeroCnj: string | null;
      titulo: string | null;
      valorCausa: number | null;
      orgaoJulgador: string | null;
      vara: string | null;
      comarca: string | null;
    } | null;
    advogadoResponsavel?: {
      id: string;
      usuario: {
        id: string;
        firstName: string;
        lastName: string;
        email: string;
      };
    } | null;
  } | null;
  subscription: {
    id: string;
    plano: {
      nome: string;
    };
  } | null;
  createdAt: Date;
  updatedAt: Date;
}

export type Recibo = ReciboParcela | ReciboFatura;

export interface RecibosResponse {
  success: boolean;
  data?: {
    recibos: Recibo[];
    total: number;
    totalPaginas: number;
    resumo: {
      totalValor: number;
      totalParcelas: number;
      totalFaturas: number;
      porStatus: Record<string, number>;
      porFormaPagamento: Record<string, number>;
    };
  };
  error?: string;
}

type RecibosAccessContext = {
  tenantId: string;
  userId: string;
  role: string;
  canViewGlobal: boolean;
  canViewRecibos: boolean;
  advogadoId: string | null;
  accessibleClienteIds: string[];
};

function getImpossibleFilter(): Prisma.ContratoParcelaWhereInput {
  return {
    id: "__nao_existe__",
  };
}

async function getRecibosAccessContext(): Promise<RecibosAccessContext | null> {
  const session = await getServerSession(authOptions);

  if (!session?.user?.tenantId || !session.user.id) {
    return null;
  }

  const role = String((session.user as { role?: string }).role || "");
  const userId = session.user.id;
  const tenantId = session.user.tenantId;

  const canViewByPermission =
    role === "ADMIN" ||
    role === "SUPER_ADMIN" ||
    (await checkPermission("financeiro", "visualizar"));

  const canViewGlobal =
    role === "ADMIN" ||
    role === "SUPER_ADMIN" ||
    role === "FINANCEIRO" ||
    (canViewByPermission && role !== "ADVOGADO" && role !== "CLIENTE");

  const canViewRecibos =
    canViewByPermission || role === "ADVOGADO" || role === "CLIENTE";

  let advogadoId: string | null = null;
  let accessibleClienteIds: string[] = [];

  if (role === "ADVOGADO") {
    const advogado = await prisma.advogado.findFirst({
      where: {
        tenantId,
        usuarioId: userId,
      },
      select: {
        id: true,
        clientes: {
          select: {
            clienteId: true,
          },
        },
      },
    });

    advogadoId = advogado?.id ?? null;
    accessibleClienteIds = advogado?.clientes.map((item) => item.clienteId) ?? [];
  } else if (role === "CLIENTE") {
    const clientes = await prisma.cliente.findMany({
      where: {
        tenantId,
        usuarioId: userId,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    accessibleClienteIds = clientes.map((item) => item.id);
  }

  return {
    tenantId,
    userId,
    role,
    canViewGlobal,
    canViewRecibos,
    advogadoId,
    accessibleClienteIds,
  };
}

function buildParcelaScopeFilter(
  context: RecibosAccessContext,
): Prisma.ContratoParcelaWhereInput | null {
  if (context.canViewGlobal) {
    return null;
  }

  if (context.role === "CLIENTE") {
    if (context.accessibleClienteIds.length === 0) {
      return getImpossibleFilter();
    }

    return {
      contrato: {
        clienteId: {
          in: context.accessibleClienteIds,
        },
      },
    };
  }

  if (context.role === "ADVOGADO") {
    const orFilters: Prisma.ContratoParcelaWhereInput[] = [
      {
        responsavelUsuarioId: context.userId,
      },
    ];

    if (context.advogadoId) {
      orFilters.push({
        contrato: {
          advogadoResponsavelId: context.advogadoId,
        },
      });
    }

    if (context.accessibleClienteIds.length > 0) {
      orFilters.push({
        contrato: {
          clienteId: {
            in: context.accessibleClienteIds,
          },
        },
      });
    }

    if (orFilters.length === 0) {
      return getImpossibleFilter();
    }

    return {
      OR: orFilters,
    };
  }

  return {
    responsavelUsuarioId: context.userId,
  };
}

function canAccessContratoByContext(
  context: RecibosAccessContext,
  contrato: {
    clienteId: string;
    advogadoResponsavelId?: string | null;
    responsavelUsuarioId?: string | null;
  } | null,
) {
  if (context.canViewGlobal) {
    return true;
  }

  if (!contrato) {
    return false;
  }

  if (context.role === "CLIENTE") {
    return context.accessibleClienteIds.includes(contrato.clienteId);
  }

  if (context.role === "ADVOGADO") {
    if (contrato.responsavelUsuarioId === context.userId) {
      return true;
    }

    if (context.advogadoId && contrato.advogadoResponsavelId === context.advogadoId) {
      return true;
    }

    return context.accessibleClienteIds.includes(contrato.clienteId);
  }

  return contrato.responsavelUsuarioId === context.userId;
}

// ============================================
// Server Actions
// ============================================

// Buscar dados para filtros
export async function getDadosFiltrosRecibos() {
  try {
    const context = await getRecibosAccessContext();

    if (!context?.canViewRecibos) {
      return { success: false, error: "Não autorizado" };
    }

    const baseWhere: Prisma.ContratoParcelaWhereInput = {
      tenantId: context.tenantId,
      status: "PAGA",
      dataPagamento: { not: null },
    };

    const scopeFilter = buildParcelaScopeFilter(context);

    const where: Prisma.ContratoParcelaWhereInput = scopeFilter
      ? {
          AND: [baseWhere, scopeFilter],
        }
      : baseWhere;

    const parcelas = await prisma.contratoParcela.findMany({
      where,
      select: {
        contrato: {
          select: {
            cliente: {
              select: {
                id: true,
                nome: true,
                documento: true,
              },
            },
            processo: {
              select: {
                id: true,
                numero: true,
                titulo: true,
              },
            },
            advogadoResponsavel: {
              select: {
                id: true,
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
      },
      orderBy: {
        dataPagamento: "desc",
      },
    });

    const clientesMap = new Map<string, { id: string; nome: string; documento: string | null }>();
    const processosMap = new Map<string, { id: string; numero: string; titulo: string | null }>();
    type AdvogadoFiltro = NonNullable<
      (typeof parcelas)[number]["contrato"]["advogadoResponsavel"]
    >;
    const advogadosMap = new Map<string, AdvogadoFiltro>();

    parcelas.forEach((parcela) => {
      const cliente = parcela.contrato.cliente;

      if (cliente && !clientesMap.has(cliente.id)) {
        clientesMap.set(cliente.id, cliente);
      }

      const processo = parcela.contrato.processo;

      if (processo && !processosMap.has(processo.id)) {
        processosMap.set(processo.id, processo);
      }

      const advogado = parcela.contrato.advogadoResponsavel;

      if (advogado && !advogadosMap.has(advogado.id)) {
        advogadosMap.set(advogado.id, advogado);
      }
    });

    const clientesArray = Array.from(clientesMap.values()).sort((a, b) =>
      a.nome.localeCompare(b.nome, "pt-BR"),
    );
    const processosArray = Array.from(processosMap.values()).sort((a, b) =>
      a.numero.localeCompare(b.numero, "pt-BR"),
    );
    const advogadosArray = Array.from(advogadosMap.values()).sort((a, b) => {
      const nomeA = `${a.usuario.firstName} ${a.usuario.lastName}`.trim();
      const nomeB = `${b.usuario.firstName} ${b.usuario.lastName}`.trim();

      return nomeA.localeCompare(nomeB, "pt-BR");
    });

    return {
      success: true,
      data: {
        clientes: convertAllDecimalFields(clientesArray),
        processos: convertAllDecimalFields(processosArray),
        advogados: convertAllDecimalFields(advogadosArray),
      },
    };
  } catch (error) {
    console.error("Erro ao buscar dados dos filtros:", error);

    return { success: false, error: "Erro interno do servidor" };
  }
}

export async function getRecibosPagos(
  filtros: FiltrosRecibos = {},
): Promise<RecibosResponse> {
  try {
    const context = await getRecibosAccessContext();

    if (!context?.canViewRecibos) {
      return { success: false, error: "Não autorizado" };
    }

    // Parâmetros de paginação
    const pagina = filtros.pagina || 1;
    const itensPorPagina = filtros.itensPorPagina || 10;
    const skip = (pagina - 1) * itensPorPagina;

    // Validar e converter datas (já vêm como strings ISO do cliente)
    const dataInicio = filtros.dataInicio ? new Date(filtros.dataInicio) : null;
    const dataFim = filtros.dataFim ? new Date(filtros.dataFim) : null;

    const andConditions: Prisma.ContratoParcelaWhereInput[] = [
      {
        tenantId: context.tenantId,
      },
      {
        status: "PAGA",
      },
      {
        dataPagamento: {
          not: null,
        },
      },
    ];

    if (filtros.status) {
      andConditions.push({ status: filtros.status });
    }

    if (dataInicio || dataFim) {
      andConditions.push({
        dataPagamento: {
          ...(dataInicio ? { gte: dataInicio } : {}),
          ...(dataFim ? { lte: dataFim } : {}),
        },
      });
    }

    if (filtros.formaPagamento) {
      andConditions.push({
        formaPagamento: filtros.formaPagamento,
      });
    }

    if (filtros.contratoId) {
      andConditions.push({
        contratoId: filtros.contratoId,
      });
    }

    const contratoFilter: Prisma.ContratoWhereInput = {};

    if (filtros.clienteId) {
      contratoFilter.clienteId = filtros.clienteId;
    }

    if (filtros.processoId) {
      contratoFilter.processoId = filtros.processoId;
    }

    if (filtros.advogadoId) {
      contratoFilter.advogadoResponsavelId = filtros.advogadoId;
    }

    if (Object.keys(contratoFilter).length > 0) {
      andConditions.push({
        contrato: contratoFilter,
      });
    }

    if (filtros.search?.trim()) {
      const searchTerm = filtros.search.trim();

      andConditions.push({
        OR: [
          { titulo: { contains: searchTerm, mode: "insensitive" } },
          { descricao: { contains: searchTerm, mode: "insensitive" } },
          {
            contrato: {
              cliente: {
                nome: { contains: searchTerm, mode: "insensitive" },
              },
            },
          },
          {
            contrato: {
              cliente: {
                documento: { contains: searchTerm, mode: "insensitive" },
              },
            },
          },
          {
            contrato: {
              titulo: { contains: searchTerm, mode: "insensitive" },
            },
          },
          {
            contrato: {
              processo: {
                numero: { contains: searchTerm, mode: "insensitive" },
              },
            },
          },
          {
            contrato: {
              processo: {
                numeroCnj: { contains: searchTerm, mode: "insensitive" },
              },
            },
          },
          { asaasPaymentId: { contains: searchTerm, mode: "insensitive" } },
        ],
      });
    }

    const scopeFilter = buildParcelaScopeFilter(context);

    if (scopeFilter) {
      andConditions.push(scopeFilter);
    }

    const whereParcelas: Prisma.ContratoParcelaWhereInput = {
      AND: andConditions,
    };

    const [total, aggregate, statusGroup, formaPagamentoGroup, parcelas] =
      await Promise.all([
        prisma.contratoParcela.count({
          where: whereParcelas,
        }),
        prisma.contratoParcela.aggregate({
          where: whereParcelas,
          _sum: {
            valor: true,
          },
        }),
        prisma.contratoParcela.groupBy({
          by: ["status"],
          where: whereParcelas,
          _count: {
            _all: true,
          },
        }),
        prisma.contratoParcela.groupBy({
          by: ["formaPagamento"],
          where: {
            AND: [whereParcelas, { formaPagamento: { not: null } }],
          },
          _count: {
            _all: true,
          },
        }),
        prisma.contratoParcela.findMany({
          where: whereParcelas,
          include: {
            contrato: {
              include: {
                cliente: {
                  select: {
                    id: true,
                    nome: true,
                    documento: true,
                    email: true,
                    telefone: true,
                    celular: true,
                  },
                },
                tipo: {
                  select: {
                    nome: true,
                  },
                },
                processo: {
                  select: {
                    id: true,
                    numero: true,
                    numeroCnj: true,
                    titulo: true,
                    valorCausa: true,
                    orgaoJulgador: true,
                    vara: true,
                    comarca: true,
                  },
                },
                advogadoResponsavel: {
                  select: {
                    id: true,
                    usuario: {
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
            },
          },
          orderBy: {
            dataPagamento: "desc",
          },
          skip,
          take: itensPorPagina,
        }),
      ]);

    // Converter para formato unificado
    const recibosParcelas: ReciboParcela[] = parcelas.map((parcela) => ({
      id: parcela.id,
      tipo: "PARCELA" as const,
      numero: `Parcela ${parcela.numeroParcela}`,
      titulo: parcela.titulo || `Parcela ${parcela.numeroParcela}`,
      descricao: parcela.descricao,
      valor: Number(parcela.valor),
      dataVencimento: parcela.dataVencimento,
      dataPagamento: parcela.dataPagamento,
      status: parcela.status,
      formaPagamento: parcela.formaPagamento,
      asaasPaymentId: parcela.asaasPaymentId,
      dadosPagamento: parcela.dadosPagamento,
      contrato: {
        id: parcela.contrato.id,
        numero: `CTR-${parcela.contrato.id.slice(-8)}`,
        tipo: parcela.contrato.tipo?.nome || "Contrato",
        cliente: parcela.contrato.cliente,
        processo: parcela.contrato.processo
          ? {
              id: parcela.contrato.processo.id,
              numero: parcela.contrato.processo.numero,
              numeroCnj: parcela.contrato.processo.numeroCnj,
              titulo: parcela.contrato.processo.titulo,
              valorCausa: Number(parcela.contrato.processo.valorCausa || 0),
              orgaoJulgador: parcela.contrato.processo.orgaoJulgador,
              vara: parcela.contrato.processo.vara,
              comarca: parcela.contrato.processo.comarca,
            }
          : null,
        advogadoResponsavel: parcela.contrato.advogadoResponsavel
          ? {
              id: parcela.contrato.advogadoResponsavel.id,
              usuario: {
                id: parcela.contrato.advogadoResponsavel.usuario.id,
                firstName:
                  parcela.contrato.advogadoResponsavel.usuario.firstName || "",
                lastName:
                  parcela.contrato.advogadoResponsavel.usuario.lastName || "",
                email: parcela.contrato.advogadoResponsavel.usuario.email,
              },
            }
          : null,
      },
      createdAt: parcela.createdAt,
      updatedAt: parcela.updatedAt,
    }));

    const porStatus = statusGroup.reduce(
      (acc, item) => {
        acc[item.status] = item._count._all;

        return acc;
      },
      {} as Record<string, number>,
    );

    const porFormaPagamento = formaPagamentoGroup.reduce(
      (acc, item) => {
        if (item.formaPagamento) {
          acc[item.formaPagamento] = item._count._all;
        }

        return acc;
      },
      {} as Record<string, number>,
    );

    // Calcular resumo
    const resumo = {
      totalValor: Number(aggregate._sum.valor || 0),
      totalParcelas: total,
      totalFaturas: 0,
      porStatus,
      porFormaPagamento,
    };

    // Converter campos Decimal para number e serializar
    const convertedRecibos = recibosParcelas.map((recibo) =>
      convertAllDecimalFields(recibo),
    );
    const serializedRecibos = JSON.parse(JSON.stringify(convertedRecibos));

    const totalPaginas = total > 0 ? Math.ceil(total / itensPorPagina) : 1;

    return {
      success: true,
      data: {
        recibos: serializedRecibos,
        total,
        totalPaginas: totalPaginas,
        resumo,
      },
    };
  } catch (error) {
    console.error("Erro ao buscar recibos:", error);

    return { success: false, error: "Erro interno do servidor" };
  }
}

export async function getReciboDetalhes(
  reciboId: string,
  tipo: "PARCELA" | "FATURA",
): Promise<{
  success: boolean;
  data?: Recibo;
  error?: string;
}> {
  try {
    const context = await getRecibosAccessContext();

    if (!context?.canViewRecibos) {
      return { success: false, error: "Não autorizado" };
    }

    if (tipo === "PARCELA") {
      const parcela = await prisma.contratoParcela.findFirst({
        where: {
          id: reciboId,
          tenantId: context.tenantId,
          status: "PAGA",
          dataPagamento: { not: null },
        },
        include: {
          contrato: {
            include: {
              cliente: {
                select: {
                  id: true,
                  nome: true,
                  documento: true,
                  email: true,
                  telefone: true,
                  celular: true,
                },
              },
              tipo: {
                select: {
                  nome: true,
                },
              },
            },
          },
          dadosBancarios: {
            include: {
              banco: {
                select: {
                  nome: true,
                  codigo: true,
                },
              },
            },
          },
        },
      });

      if (!parcela) {
        return { success: false, error: "Recibo não encontrado" };
      }

      if (
        !canAccessContratoByContext(context, {
          clienteId: parcela.contrato.cliente.id,
          advogadoResponsavelId: parcela.contrato.advogadoResponsavelId,
          responsavelUsuarioId: parcela.contrato.responsavelUsuarioId,
        })
      ) {
        return { success: false, error: "Acesso negado" };
      }

      const recibo: ReciboParcela = {
        id: parcela.id,
        tipo: "PARCELA",
        numero: `Parcela ${parcela.numeroParcela}`,
        titulo: parcela.titulo || `Parcela ${parcela.numeroParcela}`,
        descricao: parcela.descricao,
        valor: Number(parcela.valor),
        dataVencimento: parcela.dataVencimento,
        dataPagamento: parcela.dataPagamento,
        status: parcela.status,
        formaPagamento: parcela.formaPagamento,
        asaasPaymentId: parcela.asaasPaymentId,
        dadosPagamento: parcela.dadosPagamento,
        contrato: {
          id: parcela.contrato.id,
          numero: `CTR-${parcela.contrato.id.slice(-8)}`,
          tipo: parcela.contrato.tipo?.nome || "Contrato",
          cliente: parcela.contrato.cliente,
          processo: null,
          advogadoResponsavel: null,
        },
        createdAt: parcela.createdAt,
        updatedAt: parcela.updatedAt,
      };

      // Converter campos Decimal para number e serializar
      const convertedRecibo = convertAllDecimalFields(recibo);
      const serializedRecibo = JSON.parse(JSON.stringify(convertedRecibo));

      return { success: true, data: serializedRecibo };
    } else {
      const fatura = await prisma.fatura.findFirst({
        where: {
          id: reciboId,
          tenantId: context.tenantId,
          status: "PAGA",
          pagoEm: { not: null },
        },
        include: {
          contrato: {
            include: {
              cliente: {
                select: {
                  id: true,
                  nome: true,
                  documento: true,
                  email: true,
                  telefone: true,
                  celular: true,
                },
              },
              tipo: {
                select: {
                  nome: true,
                },
              },
            },
          },
          subscription: {
            include: {
              plano: {
                select: {
                  nome: true,
                },
              },
            },
          },
        },
      });

      if (!fatura) {
        return { success: false, error: "Recibo não encontrado" };
      }

      if (
        !canAccessContratoByContext(
          context,
          fatura.contrato
            ? {
                clienteId: fatura.contrato.cliente.id,
                advogadoResponsavelId: fatura.contrato.advogadoResponsavelId,
                responsavelUsuarioId: fatura.contrato.responsavelUsuarioId,
              }
            : null,
        )
      ) {
        return { success: false, error: "Acesso negado" };
      }

      const recibo: ReciboFatura = {
        id: fatura.id,
        tipo: "FATURA",
        numero: fatura.numero || `FAT-${fatura.id.slice(-8)}`,
        titulo: fatura.descricao || "Fatura",
        descricao: fatura.descricao,
        valor: Number(fatura.valor),
        dataVencimento: fatura.vencimento,
        dataPagamento: fatura.pagoEm,
        status: fatura.status,
        contrato: fatura.contrato
          ? {
              id: fatura.contrato.id,
              numero: `CTR-${fatura.contrato.id.slice(-8)}`,
              tipo: fatura.contrato.tipo?.nome || "Contrato",
              cliente: fatura.contrato.cliente,
              processo: null,
              advogadoResponsavel: null,
            }
          : null,
        subscription: fatura.subscription
          ? {
              id: fatura.subscription.id,
              plano: fatura.subscription.plano || {
                nome: "Plano não informado",
              },
            }
          : null,
        createdAt: fatura.createdAt,
        updatedAt: fatura.updatedAt,
      };

      // Converter campos Decimal para number e serializar
      const convertedRecibo = convertAllDecimalFields(recibo);
      const serializedRecibo = JSON.parse(JSON.stringify(convertedRecibo));

      return { success: true, data: serializedRecibo };
    }
  } catch (error) {
    console.error("Erro ao buscar detalhes do recibo:", error);

    return { success: false, error: "Erro interno do servidor" };
  }
}

export async function gerarComprovanteHTML(
  reciboId: string,
  tipo: "PARCELA" | "FATURA",
): Promise<{
  success: boolean;
  data?: {
    html: string;
    filename: string;
  };
  error?: string;
}> {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.tenantId) {
      return { success: false, error: "Não autenticado" };
    }

    // Buscar dados do recibo
    const reciboResult = await getReciboDetalhes(reciboId, tipo);

    if (!reciboResult.success || !reciboResult.data) {
      return {
        success: false,
        error: reciboResult.error || "Recibo não encontrado",
      };
    }

    const recibo = reciboResult.data;

    // Gerar HTML do comprovante
    const html = generateComprovanteHTML(recibo);
    const filename = `comprovante-${recibo.numero.toLowerCase().replace(/\s+/g, "-")}-${new Date().toISOString().split("T")[0]}.html`;

    return {
      success: true,
      data: {
        html,
        filename,
      },
    };
  } catch (error) {
    console.error("Erro ao gerar comprovante HTML:", error);

    return { success: false, error: "Erro interno do servidor" };
  }
}

function generateComprovanteHTML(recibo: any): string {
  const formatarValor = (valor: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(valor);
  };

  const formatarData = (data: Date | null) => {
    if (!data) return "-";

    return new Date(data).toLocaleDateString("pt-BR");
  };

  const getFormaPagamentoTexto = (forma: string | null) => {
    switch (forma) {
      case "PIX":
        return "PIX";
      case "CARTAO":
      case "CREDIT_CARD":
        return "Cartão";
      case "DINHEIRO":
        return "Dinheiro";
      default:
        return forma || "N/A";
    }
  };

  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Comprovante de Pagamento - ${recibo.numero}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            background: #f8f9fa;
            padding: 20px;
        }
        
        .container {
            max-width: 800px;
            margin: 0 auto;
            background: white;
            border-radius: 8px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            overflow: hidden;
        }
        
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }
        
        .header h1 {
            font-size: 28px;
            margin-bottom: 10px;
            font-weight: 600;
        }
        
        .header p {
            font-size: 16px;
            opacity: 0.9;
        }
        
        .content {
            padding: 40px;
        }
        
        .recibo-info {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 30px;
            margin-bottom: 40px;
        }
        
        .info-section {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            border-left: 4px solid #667eea;
        }
        
        .info-section h3 {
            color: #667eea;
            margin-bottom: 15px;
            font-size: 16px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .info-item {
            display: flex;
            justify-content: space-between;
            margin-bottom: 10px;
            padding-bottom: 8px;
            border-bottom: 1px solid #e9ecef;
        }
        
        .info-item:last-child {
            border-bottom: none;
            margin-bottom: 0;
        }
        
        .info-label {
            font-weight: 500;
            color: #6c757d;
        }
        
        .info-value {
            font-weight: 600;
            color: #333;
        }
        
        .valor-destaque {
            background: #e8f5e8;
            border: 2px solid #28a745;
            border-radius: 8px;
            padding: 20px;
            text-align: center;
            margin: 30px 0;
        }
        
        .valor-destaque .label {
            font-size: 14px;
            color: #28a745;
            font-weight: 500;
            margin-bottom: 5px;
        }
        
        .valor-destaque .valor {
            font-size: 32px;
            color: #28a745;
            font-weight: 700;
        }
        
        .cliente-info {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 30px;
        }
        
        .cliente-info h3 {
            color: #667eea;
            margin-bottom: 15px;
            font-size: 16px;
            font-weight: 600;
        }
        
        .cliente-details {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
        }
        
        .footer {
            background: #f8f9fa;
            padding: 20px;
            text-align: center;
            border-top: 1px solid #e9ecef;
            color: #6c757d;
            font-size: 14px;
        }
        
        .action-buttons {
            display: flex;
            justify-content: center;
            gap: 15px;
            margin-bottom: 20px;
        }
        
        .btn {
            padding: 12px 24px;
            border: none;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            text-decoration: none;
            display: inline-flex;
            align-items: center;
            gap: 8px;
        }
        
        .btn-primary {
            background: #667eea;
            color: white;
        }
        
        .btn-primary:hover {
            background: #5a6fd8;
            transform: translateY(-2px);
        }
        
        .btn-secondary {
            background: #6c757d;
            color: white;
        }
        
        .btn-secondary:hover {
            background: #5a6268;
            transform: translateY(-2px);
        }
        
        .btn-icon {
            width: 16px;
            height: 16px;
        }
        
        .status-badge {
            display: inline-block;
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .status-paga {
            background: #d4edda;
            color: #155724;
        }
        
        .tipo-badge {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .tipo-parcela {
            background: #cce5ff;
            color: #004085;
        }
        
        .tipo-fatura {
            background: #fff3cd;
            color: #856404;
        }
        
        @media print {
            body {
                background: white;
                padding: 0;
            }
            
            .container {
                box-shadow: none;
                border-radius: 0;
            }
            
            .header {
                background: #667eea !important;
                -webkit-print-color-adjust: exact;
                color-adjust: exact;
            }
        }
        
        @media (max-width: 768px) {
            .recibo-info {
                grid-template-columns: 1fr;
                gap: 20px;
            }
            
            .cliente-details {
                grid-template-columns: 1fr;
            }
            
            .content {
                padding: 20px;
            }
            
            .action-buttons {
                flex-direction: column;
                align-items: center;
            }
            
            .btn {
                width: 100%;
                max-width: 200px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Comprovante de Pagamento</h1>
            <p>Magic Lawyer - Sistema Jurídico</p>
        </div>
        
        <div class="content">
            <div class="recibo-info">
                <div class="info-section">
                    <h3>Informações do Recibo</h3>
                    <div class="info-item">
                        <span class="info-label">Número:</span>
                        <span class="info-value">${recibo.numero}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Tipo:</span>
                        <span class="info-value">
                            <span class="tipo-badge tipo-${recibo.tipo.toLowerCase()}">${recibo.tipo}</span>
                        </span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Status:</span>
                        <span class="info-value">
                            <span class="status-badge status-paga">${recibo.status}</span>
                        </span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Data de Pagamento:</span>
                        <span class="info-value">${formatarData(recibo.dataPagamento)}</span>
                    </div>
                    ${
                      recibo.tipo === "PARCELA" && recibo.formaPagamento
                        ? `
                    <div class="info-item">
                        <span class="info-label">Forma de Pagamento:</span>
                        <span class="info-value">${getFormaPagamentoTexto(recibo.formaPagamento)}</span>
                    </div>
                    `
                        : ""
                    }
                </div>
                
                <div class="info-section">
                    <h3>Detalhes do Pagamento</h3>
                    <div class="info-item">
                        <span class="info-label">Data de Vencimento:</span>
                        <span class="info-value">${formatarData(recibo.dataVencimento)}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Data de Emissão:</span>
                        <span class="info-value">${formatarData(recibo.createdAt)}</span>
                    </div>
                    ${
                      recibo.asaasPaymentId
                        ? `
                    <div class="info-item">
                        <span class="info-label">ID do Pagamento:</span>
                        <span class="info-value">${recibo.asaasPaymentId}</span>
                    </div>
                    `
                        : ""
                    }
                </div>
            </div>
            
            <div class="valor-destaque">
                <div class="label">Valor Pago</div>
                <div class="valor">${formatarValor(recibo.valor)}</div>
            </div>
            
            ${
              recibo.contrato
                ? `
            <div class="cliente-info">
                <h3>Informações do Cliente</h3>
                <div class="cliente-details">
                    <div class="info-item">
                        <span class="info-label">Nome:</span>
                        <span class="info-value">${recibo.contrato.cliente.nome}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Documento:</span>
                        <span class="info-value">${recibo.contrato.cliente.documento || "N/A"}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Email:</span>
                        <span class="info-value">${recibo.contrato.cliente.email || "N/A"}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Telefone:</span>
                        <span class="info-value">${recibo.contrato.cliente.telefone || recibo.contrato.cliente.celular || "N/A"}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Contrato:</span>
                        <span class="info-value">${recibo.contrato.numero}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Tipo de Contrato:</span>
                        <span class="info-value">${recibo.contrato.tipo}</span>
                    </div>
                </div>
            </div>
            
            ${
              recibo.contrato.processo
                ? `
            <div class="cliente-info">
                <h3>Informações do Processo</h3>
                <div class="cliente-details">
                    <div class="info-item">
                        <span class="info-label">Número do Processo:</span>
                        <span class="info-value">${recibo.contrato.processo.numero}</span>
                    </div>
                    ${
                      recibo.contrato.processo.numeroCnj
                        ? `
                    <div class="info-item">
                        <span class="info-label">Número CNJ:</span>
                        <span class="info-value">${recibo.contrato.processo.numeroCnj}</span>
                    </div>
                    `
                        : ""
                    }
                    ${
                      recibo.contrato.processo.titulo
                        ? `
                    <div class="info-item">
                        <span class="info-label">Título:</span>
                        <span class="info-value">${recibo.contrato.processo.titulo}</span>
                    </div>
                    `
                        : ""
                    }
                    ${
                      recibo.contrato.processo?.valorCausa
                        ? `
                    <div class="info-item">
                        <span class="info-label">Valor da Causa:</span>
                        <span class="info-value">${formatarValor(recibo.contrato.processo.valorCausa)}</span>
                    </div>
                    `
                        : ""
                    }
                    ${
                      recibo.contrato.processo.orgaoJulgador
                        ? `
                    <div class="info-item">
                        <span class="info-label">Órgão Julgador:</span>
                        <span class="info-value">${recibo.contrato.processo.orgaoJulgador}</span>
                    </div>
                    `
                        : ""
                    }
                    ${
                      recibo.contrato.processo.vara
                        ? `
                    <div class="info-item">
                        <span class="info-label">Vara:</span>
                        <span class="info-value">${recibo.contrato.processo.vara}</span>
                    </div>
                    `
                        : ""
                    }
                    ${
                      recibo.contrato.processo.comarca
                        ? `
                    <div class="info-item">
                        <span class="info-label">Comarca:</span>
                        <span class="info-value">${recibo.contrato.processo.comarca}</span>
                    </div>
                    `
                        : ""
                    }
                </div>
            </div>
            `
                : ""
            }
            
            ${
              recibo.contrato.advogadoResponsavel
                ? `
            <div class="cliente-info">
                <h3>Advogado Responsável</h3>
                <div class="cliente-details">
                    <div class="info-item">
                        <span class="info-label">Nome:</span>
                        <span class="info-value">${recibo.contrato.advogadoResponsavel.usuario.firstName} ${recibo.contrato.advogadoResponsavel.usuario.lastName}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Email:</span>
                        <span class="info-value">${recibo.contrato.advogadoResponsavel.usuario.email}</span>
                    </div>
                </div>
            </div>
            `
                : ""
            }
            `
                : ""
            }
            
            ${
              recibo.descricao
                ? `
            <div class="info-section">
                <h3>Descrição</h3>
                <p>${recibo.descricao}</p>
            </div>
            `
                : ""
            }
        </div>
        
        <div class="footer">
            <div class="action-buttons">
                <button class="btn btn-primary" onclick="downloadPDF()">
                    <svg class="btn-icon" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd"></path>
                    </svg>
                    Baixar PDF
                </button>
                <button class="btn btn-secondary" onclick="printDocument()">
                    <svg class="btn-icon" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v3a2 2 0 002 2h1v2a2 2 0 002 2h6a2 2 0 002-2v-2h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a2 2 0 00-2-2H7a2 2 0 00-2 2zm8 0H7v3h6V4zm0 8H7v4h6v-4z" clip-rule="evenodd"></path>
                    </svg>
                    Imprimir
                </button>
            </div>
            <p>Este comprovante foi gerado automaticamente pelo sistema Magic Lawyer</p>
            <p>Data de geração: ${new Date().toLocaleString("pt-BR")}</p>
        </div>
    </div>
    
    <script>
        // Auto-print quando carregado
        window.onload = function() {
            if (window.location.search.includes('print=true')) {
                window.print();
            }
        };

        // Função para baixar como PDF
        function downloadPDF() {
            const element = document.querySelector('.container');
            const filename = '${recibo.numero.toLowerCase().replace(/\s+/g, "-")}-${new Date().toISOString().split("T")[0]}.pdf';
            
            // Configurações para impressão/PDF
            const opt = {
                margin: 0.5,
                filename: filename,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { 
                    scale: 2,
                    useCORS: true,
                    letterRendering: true
                },
                jsPDF: { 
                    unit: 'in', 
                    format: 'a4', 
                    orientation: 'portrait' 
                }
            };

            // Tentar usar html2pdf se disponível, senão usar print
            if (typeof html2pdf !== 'undefined') {
                html2pdf().set(opt).from(element).save();
            } else {
                // Fallback: abrir diálogo de impressão
                window.print();
            }
        }

        // Função para imprimir
        function printDocument() {
            window.print();
        }
    </script>
    
    <!-- Incluir html2pdf para conversão -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
</body>
</html>
  `;
}
