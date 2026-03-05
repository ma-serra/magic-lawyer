"use server";

import { getServerSession } from "next-auth/next";

import { authOptions } from "@/auth";
import prisma from "@/app/lib/prisma";
import {
  UserRole,
  ContratoParcelaStatus,
  HonorarioVisibilidade,
} from "@/generated/prisma";
import logger from "@/lib/logger";

// ============================================
// TYPES
// ============================================

export interface MetricasFinanceiras {
  receitas: {
    total: number;
    recebido: number;
    pendente: number;
    atrasado: number;
  };
  despesas: {
    total: number;
    pago: number;
    pendente: number;
  };
  saldo: {
    atual: number;
    previsto: number;
  };
  performance: {
    taxaInadimplencia: number;
    conversaoContratos: number;
    ticketMedio: number;
  };
}

export interface GraficoParcelas {
  periodo: string;
  pagas: number;
  pendentes: number;
  atrasadas: number;
  total: number;
}

export interface HonorariosPorAdvogado {
  advogadoId: string;
  advogadoNome: string;
  totalHonorarios: number;
  honorariosRecebidos: number;
  honorariosPendentes: number;
  contratosAtivos: number;
  visibilidade: HonorarioVisibilidade;
}

export interface CarteiraFinanceiraResponsavel {
  responsavelId: string;
  responsavelNome: string;
  recebido: number;
  pendente: number;
  atrasado: number;
  total: number;
  contratos: number;
  processos: number;
}

export interface CarteiraFinanceiraCliente {
  clienteId: string;
  clienteNome: string;
  recebido: number;
  pendente: number;
  atrasado: number;
  total: number;
  contratos: number;
  processos: number;
}

export interface CarteiraFinanceiraProcesso {
  processoId: string;
  processoNumero: string;
  processoTitulo: string;
  clienteNome: string;
  responsavelNome: string;
  recebido: number;
  pendente: number;
  atrasado: number;
  total: number;
  contratos: number;
}

export interface VisoesFinanceiras {
  porResponsavel: CarteiraFinanceiraResponsavel[];
  porCliente: CarteiraFinanceiraCliente[];
  porProcesso: CarteiraFinanceiraProcesso[];
}

export interface FiltrosDashboard {
  dataInicio?: Date;
  dataFim?: Date;
  advogadoId?: string;
  clienteId?: string;
  dadosBancariosId?: string;
}

// ============================================
// HELPERS
// ============================================

async function getSession() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    throw new Error("Não autenticado");
  }

  const user = session.user as any;

  // Buscar cliente vinculado ao usuário se for CLIENTE
  let clienteId: string | undefined;

  if (user.role === UserRole.CLIENTE) {
    const cliente = await prisma.cliente.findFirst({
      where: {
        usuarioId: user.id,
        tenantId: user.tenantId,
        deletedAt: null,
      },
      select: { id: true },
    });

    clienteId = cliente?.id;
  }

  return {
    userId: user.id,
    tenantId: user.tenantId,
    role: user.role as UserRole,
    advogadoId: user.advogadoId,
    clienteId,
    session, // Incluir session para usar em buildWhereClause
  };
}

async function buildWhereClause(
  tenantId: string,
  role: UserRole,
  advogadoId?: string,
  clienteId?: string,
  filtros?: FiltrosDashboard,
  session?: any,
) {
  const where: any = {
    tenantId,
    deletedAt: null,
  };

  // Filtros por advogado
  if (filtros?.advogadoId) {
    where.advogadoResponsavelId = filtros.advogadoId;
  }

  // Filtros por cliente
  if (filtros?.clienteId) {
    where.clienteId = filtros.clienteId;
  }

  const isAdmin = role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN;

  // Controle de acesso para CLIENTE - só vê seus próprios contratos
  if (role === UserRole.CLIENTE && clienteId) {
    where.clienteId = clienteId;
  } else if (!isAdmin && session) {
    // Staff vinculado ou ADVOGADO - usar advogados acessíveis
    const { getAccessibleAdvogadoIds } = await import(
      "@/app/lib/advogado-access"
    );
    const accessibleAdvogados = await getAccessibleAdvogadoIds(session);

    // Se não há vínculos, acesso total (sem filtros)
    if (accessibleAdvogados.length > 0) {
      if (!filtros?.advogadoId) {
        // Aplicar filtro apenas se não foi especificado no filtro
        where.advogadoResponsavelId = {
          in: accessibleAdvogados,
        };
      } else if (!accessibleAdvogados.includes(filtros.advogadoId)) {
        // Se o advogado filtrado não está acessível, retornar vazio
        return {
          ...where,
          advogadoResponsavelId: {
            in: [],
          },
        };
      }
    }
  }

  return where;
}

function buildParcelaDateFilter(filtros?: FiltrosDashboard) {
  if (!filtros?.dataInicio && !filtros?.dataFim) {
    return undefined;
  }

  const dataVencimento: { gte?: Date; lte?: Date } = {};

  if (filtros.dataInicio) {
    const inicio = new Date(filtros.dataInicio);

    inicio.setHours(0, 0, 0, 0);
    dataVencimento.gte = inicio;
  }

  if (filtros.dataFim) {
    const fim = new Date(filtros.dataFim);

    fim.setHours(23, 59, 59, 999);
    dataVencimento.lte = fim;
  }

  return {
    dataVencimento,
  };
}

// ============================================
// SERVER ACTIONS
// ============================================

export async function getMetricasFinanceiras(
  filtros?: FiltrosDashboard,
): Promise<MetricasFinanceiras> {
  try {
    const { tenantId, role, advogadoId, clienteId, session } =
      await getSession();

    const whereContratos = await buildWhereClause(
      tenantId,
      role,
      advogadoId,
      clienteId,
      filtros,
      session,
    );
    const parcelaDateFilter = buildParcelaDateFilter(filtros);

    // Buscar parcelas com filtros
    const parcelas = await prisma.contratoParcela.findMany({
      where: {
        tenantId,
        contrato: whereContratos,
        ...(parcelaDateFilter || {}),
        ...(filtros?.dadosBancariosId && {
          OR: [
            { dadosBancariosId: filtros.dadosBancariosId },
            {
              dadosBancariosId: null,
              contrato: { dadosBancariosId: filtros.dadosBancariosId },
            },
          ],
        }),
      },
      include: {
        contrato: {
          include: {
            cliente: true,
            advogadoResponsavel: true,
          },
        },
      },
    });

    // Calcular métricas de receitas
    const receitas = {
      total: parcelas.reduce((sum, p) => sum + Number(p.valor), 0),
      recebido: parcelas
        .filter((p) => p.status === ContratoParcelaStatus.PAGA)
        .reduce((sum, p) => sum + Number(p.valor), 0),
      pendente: parcelas
        .filter((p) => p.status === ContratoParcelaStatus.PENDENTE)
        .reduce((sum, p) => sum + Number(p.valor), 0),
      atrasado: parcelas
        .filter((p) => p.status === ContratoParcelaStatus.ATRASADA)
        .reduce((sum, p) => sum + Number(p.valor), 0),
    };

    // Calcular despesas (por enquanto 0, pode ser implementado depois)
    const despesas = {
      total: 0,
      pago: 0,
      pendente: 0,
    };

    // Calcular saldo
    const saldo = {
      atual: receitas.recebido - despesas.pago,
      previsto: receitas.total - despesas.total,
    };

    // Calcular performance
    const totalParcelas = parcelas.length;
    const parcelasAtrasadas = parcelas.filter(
      (p) => p.status === ContratoParcelaStatus.ATRASADA,
    ).length;
    const contratosSemFiltroTemporal = await prisma.contrato.count({
      where: whereContratos,
    });
    const contratos =
      filtros?.dataInicio || filtros?.dataFim
        ? new Set(parcelas.map((parcela) => parcela.contratoId)).size
        : contratosSemFiltroTemporal;
    const contratosAtivos = await prisma.contrato.count({
      where: { ...whereContratos, status: "ATIVO" },
    });

    const performance = {
      taxaInadimplencia:
        totalParcelas > 0 ? (parcelasAtrasadas / totalParcelas) * 100 : 0,
      conversaoContratos:
        contratos > 0 ? (contratosAtivos / contratos) * 100 : 0,
      ticketMedio: contratos > 0 ? receitas.total / contratos : 0,
    };

    return {
      receitas,
      despesas,
      saldo,
      performance,
    };
  } catch (error) {
    logger.error("Erro ao buscar métricas financeiras:", error);
    throw new Error("Erro ao buscar métricas financeiras");
  }
}

export async function getGraficoParcelas(
  filtros?: FiltrosDashboard,
): Promise<GraficoParcelas[]> {
  try {
    const { tenantId, role, advogadoId, clienteId, session } =
      await getSession();

    const whereContratos = await buildWhereClause(
      tenantId,
      role,
      advogadoId,
      clienteId,
      filtros,
      session,
    );
    const parcelaDateFilter = buildParcelaDateFilter(filtros);

    // Buscar parcelas agrupadas por mês
    const parcelas = await prisma.contratoParcela.findMany({
      where: {
        tenantId,
        contrato: whereContratos,
        ...(parcelaDateFilter || {}),
        ...(filtros?.dadosBancariosId && {
          OR: [
            { dadosBancariosId: filtros.dadosBancariosId },
            {
              dadosBancariosId: null,
              contrato: { dadosBancariosId: filtros.dadosBancariosId },
            },
          ],
        }),
      },
      select: {
        valor: true,
        status: true,
        dataVencimento: true,
      },
    });

    // Agrupar por mês
    const agrupadoPorMes = parcelas.reduce(
      (acc, parcela) => {
        const mes = parcela.dataVencimento.toISOString().substring(0, 7); // YYYY-MM

        if (!acc[mes]) {
          acc[mes] = {
            pagas: 0,
            pendentes: 0,
            atrasadas: 0,
            total: 0,
          };
        }

        const valor = Number(parcela.valor);

        acc[mes].total += valor;

        switch (parcela.status) {
          case ContratoParcelaStatus.PAGA:
            acc[mes].pagas += valor;
            break;
          case ContratoParcelaStatus.PENDENTE:
            acc[mes].pendentes += valor;
            break;
          case ContratoParcelaStatus.ATRASADA:
            acc[mes].atrasadas += valor;
            break;
        }

        return acc;
      },
      {} as Record<
        string,
        { pagas: number; pendentes: number; atrasadas: number; total: number }
      >,
    );

    // Converter para array e ordenar
    return Object.entries(agrupadoPorMes)
      .map(([periodo, dados]) => ({
        periodo,
        ...dados,
      }))
      .sort((a, b) => a.periodo.localeCompare(b.periodo));
  } catch (error) {
    logger.error("Erro ao buscar gráfico de parcelas:", error);
    throw new Error("Erro ao buscar gráfico de parcelas");
  }
}

export async function getHonorariosPorAdvogado(
  filtros?: FiltrosDashboard,
): Promise<HonorariosPorAdvogado[]> {
  try {
    const { tenantId, role, advogadoId, clienteId, session } =
      await getSession();

    const whereContratos = await buildWhereClause(
      tenantId,
      role,
      advogadoId,
      clienteId,
      filtros,
      session,
    );
    const parcelaDateFilter = buildParcelaDateFilter(filtros);

    // Buscar honorários com controle de privacidade por role
    const honorarios = await prisma.contratoHonorario.findMany({
      where: {
        tenantId,
        contrato: whereContratos,
        // Controle de privacidade por role
        ...(role === UserRole.ADVOGADO &&
          advogadoId && {
            OR: [
              { visibilidade: HonorarioVisibilidade.PUBLICO },
              {
                visibilidade: HonorarioVisibilidade.PRIVADO,
                advogadoId: advogadoId,
              },
              { advogadoId: null }, // Honorários gerais do contrato
            ],
          }),
        // SECRETARIA: só vê honorários públicos
        ...(role === UserRole.SECRETARIA && {
          OR: [
            { visibilidade: HonorarioVisibilidade.PUBLICO },
            { advogadoId: null }, // Honorários gerais do contrato
          ],
        }),
        // FINANCEIRO: vê honorários públicos e gerais
        ...(role === UserRole.FINANCEIRO && {
          OR: [
            { visibilidade: HonorarioVisibilidade.PUBLICO },
            { advogadoId: null }, // Honorários gerais do contrato
          ],
        }),
        // CLIENTE: só vê honorários públicos
        ...(role === UserRole.CLIENTE && {
          OR: [
            { visibilidade: HonorarioVisibilidade.PUBLICO },
            { advogadoId: null }, // Honorários gerais do contrato
          ],
        }),
        // ADMIN: vê todos os honorários (sem restrições)
      },
      include: {
        advogado: {
          include: {
            usuario: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
          },
        },
        contrato: {
          include: {
            parcelas: {
              where: parcelaDateFilter?.dataVencimento
                ? {
                    ...parcelaDateFilter,
                  }
                : undefined,
              select: {
                valor: true,
                status: true,
              },
            },
          },
        },
      },
    });

    // Agrupar por advogado
    const agrupadoPorAdvogado = honorarios.reduce(
      (acc, honorario) => {
        const advogadoId = honorario.advogadoId || "geral";
        const advogadoNome = honorario.advogadoId
          ? `${honorario.advogado?.usuario?.firstName || ""} ${honorario.advogado?.usuario?.lastName || ""}`.trim()
          : "Honorários Gerais";

        if (!acc[advogadoId]) {
          acc[advogadoId] = {
            advogadoId,
            advogadoNome,
            totalHonorarios: 0,
            honorariosRecebidos: 0,
            honorariosPendentes: 0,
            contratosAtivos: 0,
            visibilidade: honorario.visibilidade,
          };
        }

        // Calcular valor do honorário baseado no tipo
        let valorHonorario = 0;

        if (honorario.tipo === "FIXO" && honorario.valorFixo) {
          valorHonorario = Number(honorario.valorFixo);
        } else if (
          honorario.tipo === "SUCESSO" &&
          honorario.percentualSucesso
        ) {
          // Para honorários de sucesso, usar percentual do valor do contrato
          const valorContrato = Number(honorario.contrato.valor || 0);

          valorHonorario =
            (valorContrato * Number(honorario.percentualSucesso)) / 100;
        } else if (honorario.tipo === "HIBRIDO") {
          // Para híbrido, somar valor fixo + percentual
          const valorFixo = Number(honorario.valorFixo || 0);
          const valorContrato = Number(honorario.contrato.valor || 0);
          const percentual = Number(honorario.percentualSucesso || 0);

          valorHonorario = valorFixo + (valorContrato * percentual) / 100;
        }

        acc[advogadoId].totalHonorarios += valorHonorario;

        // Calcular parcelas recebidas vs pendentes
        const parcelas = honorario.contrato.parcelas;
        const parcelasRecebidas = parcelas.filter(
          (p) => p.status === ContratoParcelaStatus.PAGA,
        );
        const parcelasPendentes = parcelas.filter(
          (p) => p.status === ContratoParcelaStatus.PENDENTE,
        );

        // Proporção de honorários recebidos vs pendentes
        const totalParcelas = parcelas.length;

        if (totalParcelas > 0) {
          const proporcaoRecebida = parcelasRecebidas.length / totalParcelas;
          const proporcaoPendente = parcelasPendentes.length / totalParcelas;

          acc[advogadoId].honorariosRecebidos +=
            valorHonorario * proporcaoRecebida;
          acc[advogadoId].honorariosPendentes +=
            valorHonorario * proporcaoPendente;
        }

        // Contar contratos ativos
        if (honorario.contrato.status === "ATIVO") {
          acc[advogadoId].contratosAtivos += 1;
        }

        return acc;
      },
      {} as Record<string, HonorariosPorAdvogado>,
    );

    return Object.values(agrupadoPorAdvogado).sort(
      (a, b) => b.totalHonorarios - a.totalHonorarios,
    );
  } catch (error) {
    logger.error("Erro ao buscar honorários por advogado:", error);
    throw new Error("Erro ao buscar honorários por advogado");
  }
}

export async function getDadosBancariosAtivos(): Promise<
  Array<{
    id: string;
    bancoNome: string;
    agencia: string;
    conta: string;
    chavePix?: string;
    principal: boolean;
  }>
> {
  try {
    const { tenantId } = await getSession();

    const dadosBancarios = await prisma.dadosBancarios.findMany({
      where: {
        tenantId,
        ativo: true,
        deletedAt: null,
      },
      include: {
        banco: {
          select: {
            nome: true,
          },
        },
      },
      orderBy: [{ principal: "desc" }, { createdAt: "asc" }],
    });

    return dadosBancarios.map((db) => ({
      id: db.id,
      bancoNome: db.banco?.nome || "Banco não encontrado",
      agencia: db.agencia,
      conta: `${db.conta}${db.digitoConta ? `-${db.digitoConta}` : ""}`,
      chavePix: db.chavePix || undefined,
      principal: db.principal,
    }));
  } catch (error) {
    logger.error("Erro ao buscar dados bancários ativos:", error);

    return [];
  }
}

export async function getAdvogadosAtivos(): Promise<
  Array<{
    id: string;
    nome: string;
    oab: string;
  }>
> {
  try {
    const { tenantId } = await getSession();

    const advogados = await prisma.advogado.findMany({
      where: {
        tenantId,
        usuario: {
          active: true, // Advogados ativos são os que têm usuário ativo
        },
      },
      include: {
        usuario: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: {
        usuario: {
          firstName: "asc",
        },
      },
    });

    return advogados.map((adv) => ({
      id: adv.id,
      nome: `${adv.usuario?.firstName || ""} ${adv.usuario?.lastName || ""}`.trim(),
      oab: `${adv.oabNumero}/${adv.oabUf}`,
    }));
  } catch (error) {
    logger.error("Erro ao buscar advogados ativos:", error);

    return [];
  }
}

export async function getClientesAtivos(): Promise<
  Array<{
    id: string;
    nome: string;
    documento: string;
  }>
> {
  try {
    const { tenantId } = await getSession();

    const clientes = await prisma.cliente.findMany({
      where: {
        tenantId,
        deletedAt: null, // Clientes ativos são os que não foram deletados
      },
      select: {
        id: true,
        nome: true,
        documento: true,
      },
      orderBy: {
        nome: "asc",
      },
    });

    return clientes.map((cliente) => ({
      id: cliente.id,
      nome: cliente.nome,
      documento: cliente.documento || "",
    }));
  } catch (error) {
    logger.error("Erro ao buscar clientes ativos:", error);

    return [];
  }
}

export async function getVisoesFinanceiras(
  filtros?: FiltrosDashboard,
): Promise<VisoesFinanceiras> {
  try {
    const { tenantId, role, advogadoId, clienteId, session } =
      await getSession();

    const whereContratos = await buildWhereClause(
      tenantId,
      role,
      advogadoId,
      clienteId,
      filtros,
      session,
    );
    const parcelaDateFilter = buildParcelaDateFilter(filtros);

    const contratos = await prisma.contrato.findMany({
      where: whereContratos,
      select: {
        id: true,
        clienteId: true,
        advogadoResponsavelId: true,
        processoId: true,
        cliente: {
          select: {
            nome: true,
          },
        },
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
        processo: {
          select: {
            numero: true,
            titulo: true,
          },
        },
      },
    });

    if (contratos.length === 0) {
      return {
        porResponsavel: [],
        porCliente: [],
        porProcesso: [],
      };
    }

    const contratoIds = contratos.map((contrato) => contrato.id);

    const parcelas = await prisma.contratoParcela.findMany({
      where: {
        tenantId,
        contratoId: {
          in: contratoIds,
        },
        ...(parcelaDateFilter || {}),
        ...(filtros?.dadosBancariosId && {
          OR: [
            { dadosBancariosId: filtros.dadosBancariosId },
            {
              dadosBancariosId: null,
              contrato: { dadosBancariosId: filtros.dadosBancariosId },
            },
          ],
        }),
      },
      select: {
        contratoId: true,
        valor: true,
        status: true,
      },
    });

    const resumoContratoMap = new Map<
      string,
      { recebido: number; pendente: number; atrasado: number; total: number }
    >();

    for (const parcela of parcelas) {
      const current = resumoContratoMap.get(parcela.contratoId) ?? {
        recebido: 0,
        pendente: 0,
        atrasado: 0,
        total: 0,
      };

      const valor = Number(parcela.valor);

      current.total += valor;

      if (parcela.status === ContratoParcelaStatus.PAGA) {
        current.recebido += valor;
      } else if (parcela.status === ContratoParcelaStatus.ATRASADA) {
        current.atrasado += valor;
      } else {
        current.pendente += valor;
      }

      resumoContratoMap.set(parcela.contratoId, current);
    }

    const responsavelMap = new Map<
      string,
      CarteiraFinanceiraResponsavel & { _processosIds: Set<string> }
    >();
    const clienteMap = new Map<
      string,
      CarteiraFinanceiraCliente & { _processosIds: Set<string> }
    >();
    const processoMap = new Map<string, CarteiraFinanceiraProcesso>();

    for (const contrato of contratos) {
      const resumoContrato = resumoContratoMap.get(contrato.id) ?? {
        recebido: 0,
        pendente: 0,
        atrasado: 0,
        total: 0,
      };

      const processoKey = contrato.processoId ?? "sem-processo";
      const processoNumero = contrato.processo?.numero ?? "Sem número";
      const processoTitulo =
        contrato.processo?.titulo ?? "Processo não vinculado";
      const clienteNome = contrato.cliente?.nome ?? "Cliente não informado";
      const responsavelNome = contrato.advogadoResponsavel
        ? `${contrato.advogadoResponsavel.usuario?.firstName || ""} ${contrato.advogadoResponsavel.usuario?.lastName || ""}`.trim()
        : "Sem responsável";

      const responsavelKey = contrato.advogadoResponsavelId ?? "sem-responsavel";
      const clienteKey = contrato.clienteId;

      const responsavelAtual = responsavelMap.get(responsavelKey) ?? {
        responsavelId: responsavelKey,
        responsavelNome,
        recebido: 0,
        pendente: 0,
        atrasado: 0,
        total: 0,
        contratos: 0,
        processos: 0,
        _processosIds: new Set<string>(),
      };

      responsavelAtual.recebido += resumoContrato.recebido;
      responsavelAtual.pendente += resumoContrato.pendente;
      responsavelAtual.atrasado += resumoContrato.atrasado;
      responsavelAtual.total += resumoContrato.total;
      responsavelAtual.contratos += 1;
      if (contrato.processoId) {
        responsavelAtual._processosIds.add(contrato.processoId);
      }
      responsavelAtual.processos = responsavelAtual._processosIds.size;
      responsavelMap.set(responsavelKey, responsavelAtual);

      const clienteAtual = clienteMap.get(clienteKey) ?? {
        clienteId: clienteKey,
        clienteNome,
        recebido: 0,
        pendente: 0,
        atrasado: 0,
        total: 0,
        contratos: 0,
        processos: 0,
        _processosIds: new Set<string>(),
      };

      clienteAtual.recebido += resumoContrato.recebido;
      clienteAtual.pendente += resumoContrato.pendente;
      clienteAtual.atrasado += resumoContrato.atrasado;
      clienteAtual.total += resumoContrato.total;
      clienteAtual.contratos += 1;
      if (contrato.processoId) {
        clienteAtual._processosIds.add(contrato.processoId);
      }
      clienteAtual.processos = clienteAtual._processosIds.size;
      clienteMap.set(clienteKey, clienteAtual);

      const processoAtual = processoMap.get(processoKey) ?? {
        processoId: processoKey,
        processoNumero,
        processoTitulo,
        clienteNome,
        responsavelNome,
        recebido: 0,
        pendente: 0,
        atrasado: 0,
        total: 0,
        contratos: 0,
      };

      processoAtual.recebido += resumoContrato.recebido;
      processoAtual.pendente += resumoContrato.pendente;
      processoAtual.atrasado += resumoContrato.atrasado;
      processoAtual.total += resumoContrato.total;
      processoAtual.contratos += 1;
      processoMap.set(processoKey, processoAtual);
    }

    const byTotalDesc = <T extends { total: number }>(a: T, b: T) =>
      b.total - a.total;

    return {
      porResponsavel: Array.from(responsavelMap.values())
        .map(({ _processosIds, ...item }) => item)
        .sort(byTotalDesc)
        .slice(0, 8),
      porCliente: Array.from(clienteMap.values())
        .map(({ _processosIds, ...item }) => item)
        .sort(byTotalDesc)
        .slice(0, 8),
      porProcesso: Array.from(processoMap.values()).sort(byTotalDesc).slice(0, 8),
    };
  } catch (error) {
    logger.error("Erro ao buscar visões financeiras:", error);

    return {
      porResponsavel: [],
      porCliente: [],
      porProcesso: [],
    };
  }
}
