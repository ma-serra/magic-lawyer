"use server";

import { revalidatePath } from "next/cache";

import prisma, { convertAllDecimalFields } from "@/app/lib/prisma";
import { getSession } from "@/app/lib/auth";
import { checkPermission } from "@/app/actions/equipe";

async function getTenantId(): Promise<string> {
  const session = await getSession();

  if (!session?.user?.tenantId) {
    throw new Error("Tenant ID não encontrado na sessão");
  }

  return session.user.tenantId;
}

async function getUserId(): Promise<string> {
  const session = await getSession();

  if (!session?.user?.id) {
    throw new Error("User ID não encontrado na sessão");
  }

  return session.user.id;
}

// ============================================
// LISTAR PARCELAS DE CONTRATO
// ============================================

export async function listParcelasContrato(filters?: {
  contratoId?: string;
  status?: "PENDENTE" | "PAGA" | "ATRASADA" | "CANCELADA";
  dataVencimentoInicio?: Date;
  dataVencimentoFim?: Date;
  processoId?: string;
  valorMinimo?: number;
  valorMaximo?: number;
  formaPagamento?: string;
  apenasVencidas?: boolean;
}) {
  try {
    const tenantId = await getTenantId();

    const where: any = {
      tenantId,
    };

    if (filters?.contratoId) {
      where.contratoId = filters.contratoId;
    }

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.dataVencimentoInicio || filters?.dataVencimentoFim) {
      where.dataVencimento = {};
      if (filters.dataVencimentoInicio) {
        // Início do dia
        const inicio = new Date(filters.dataVencimentoInicio);

        inicio.setHours(0, 0, 0, 0);
        where.dataVencimento.gte = inicio;
      }
      if (filters.dataVencimentoFim) {
        // Fim do dia (23:59:59.999)
        const fim = new Date(filters.dataVencimentoFim);

        fim.setHours(23, 59, 59, 999);
        where.dataVencimento.lte = fim;
      }
    }

    // Filtro por processo (através do contrato)
    if (filters?.processoId) {
      where.contrato = {
        processoId: filters.processoId,
      };
    }

    // Filtro por valor
    if (filters?.valorMinimo || filters?.valorMaximo) {
      where.valor = {};
      if (filters.valorMinimo) {
        where.valor.gte = filters.valorMinimo;
      }
      if (filters.valorMaximo) {
        where.valor.lte = filters.valorMaximo;
      }
    }

    // Filtro por forma de pagamento
    if (filters?.formaPagamento) {
      where.formaPagamento = filters.formaPagamento;
    }

    // Filtro para apenas parcelas vencidas
    if (filters?.apenasVencidas) {
      where.dataVencimento = {
        ...where.dataVencimento,
        lt: new Date(), // Data de vencimento menor que hoje
      };
      where.status = {
        in: ["PENDENTE", "ATRASADA"], // Apenas pendentes ou atrasadas
      };
    }

    const parcelas = await prisma.contratoParcela.findMany({
      where,
      include: {
        contrato: {
          include: {
            cliente: true,
            advogadoResponsavel: {
              include: {
                usuario: true,
              },
            },
            dadosBancarios: true, // Incluir dados bancários do contrato
          },
        },
        dadosBancarios: true, // Incluir dados bancários específicos da parcela
        responsavelUsuario: true,
      },
      orderBy: [{ dataVencimento: "asc" }, { numeroParcela: "asc" }],
    });

    // Converter Decimal para number e serializar
    const convertedData = parcelas.map((item) => convertAllDecimalFields(item));
    const serialized = JSON.parse(JSON.stringify(convertedData));

    return {
      success: true,
      data: serialized,
    };
  } catch (error) {
    console.error("Erro ao listar parcelas de contrato:", error);

    return {
      success: false,
      error: "Erro ao listar parcelas de contrato",
      data: [],
    };
  }
}

// ============================================
// OBTER PARCELA POR ID
// ============================================

export async function getParcelaContrato(id: string) {
  try {
    const tenantId = await getTenantId();

    const parcela = await prisma.contratoParcela.findFirst({
      where: {
        id,
        tenantId,
      },
      include: {
        contrato: {
          include: {
            cliente: true,
            advogadoResponsavel: {
              include: {
                usuario: true,
              },
            },
            dadosBancarios: true, // Incluir dados bancários do contrato
          },
        },
        dadosBancarios: true, // Incluir dados bancários específicos da parcela
        responsavelUsuario: true,
        comprovanteDocumento: true,
      },
    });

    if (!parcela) {
      return {
        success: false,
        error: "Parcela não encontrada",
      };
    }

    // Converter Decimal para number e serializar
    const converted = convertAllDecimalFields(parcela);
    const serialized = JSON.parse(JSON.stringify(converted));

    return {
      success: true,
      data: serialized,
    };
  } catch (error) {
    console.error("Erro ao buscar parcela:", error);

    return {
      success: false,
      error: "Erro ao buscar parcela",
    };
  }
}

// ============================================
// CRIAR PARCELA DE CONTRATO
// ============================================

export async function createParcelaContrato(data: {
  contratoId: string;
  numeroParcela: number;
  titulo?: string;
  descricao?: string;
  valor: number;
  dataVencimento: Date;
  responsavelUsuarioId?: string;
}) {
  try {
    const tenantId = await getTenantId();
    const userId = await getUserId();

    // Verificar permissão para criar parcelas
    const podeCriar = await checkPermission("financeiro", "criar");

    if (!podeCriar) {
      return {
        success: false,
        error: "Você não tem permissão para criar parcelas",
      };
    }

    // Verificar se o contrato existe e pertence ao tenant
    const contrato = await prisma.contrato.findFirst({
      where: {
        id: data.contratoId,
        tenantId,
      },
      include: {
        dadosBancarios: true, // Incluir dados bancários do contrato
      },
    });

    if (!contrato) {
      return {
        success: false,
        error: "Contrato não encontrado",
      };
    }

    // Verificar se já existe uma parcela com o mesmo número para este contrato
    const parcelaExistente = await prisma.contratoParcela.findUnique({
      where: {
        contratoId_numeroParcela: {
          contratoId: data.contratoId,
          numeroParcela: data.numeroParcela,
        },
      },
    });

    if (parcelaExistente) {
      return {
        success: false,
        error: "Já existe uma parcela com este número para este contrato",
      };
    }

    const parcela = await prisma.contratoParcela.create({
      data: {
        tenantId,
        contratoId: data.contratoId,
        dadosBancariosId: contrato.dadosBancariosId, // Herdar conta bancária do contrato
        numeroParcela: data.numeroParcela,
        titulo: data.titulo,
        descricao: data.descricao,
        valor: Number(data.valor),
        dataVencimento: data.dataVencimento,
        responsavelUsuarioId: data.responsavelUsuarioId,
        status: "PENDENTE",
      },
      include: {
        contrato: {
          include: {
            cliente: true,
            advogadoResponsavel: {
              include: {
                usuario: true,
              },
            },
          },
        },
      },
    });

    revalidatePath("/contratos");
    revalidatePath("/parcelas");
    revalidatePath("/financeiro/parcelas");

    // Converter Decimal para number e serializar
    const converted = convertAllDecimalFields(parcela);
    const serialized = JSON.parse(JSON.stringify(converted));

    return {
      success: true,
      data: serialized,
      message: "Parcela criada com sucesso",
    };
  } catch (error) {
    console.error("Erro ao criar parcela:", error);

    return {
      success: false,
      error: "Erro ao criar parcela",
    };
  }
}

// ============================================
// ATUALIZAR PARCELA DE CONTRATO
// ============================================

export async function updateParcelaContrato(
  id: string,
  data: {
    titulo?: string;
    descricao?: string;
    valor?: number;
    dataVencimento?: Date;
    status?: "PENDENTE" | "PAGA" | "ATRASADA" | "CANCELADA";
    dataPagamento?: Date;
    formaPagamento?: string;
    responsavelUsuarioId?: string;
  },
) {
  try {
    const tenantId = await getTenantId();

    // Verificar permissão para editar parcelas
    const podeEditar = await checkPermission("financeiro", "editar");

    if (!podeEditar) {
      return {
        success: false,
        error: "Você não tem permissão para editar parcelas",
      };
    }

    // Verificar se a parcela existe e pertence ao tenant
    const parcelaExistente = await prisma.contratoParcela.findFirst({
      where: {
        id,
        tenantId,
      },
    });

    if (!parcelaExistente) {
      return {
        success: false,
        error: "Parcela não encontrada",
      };
    }

    // Se está marcando como paga, definir data de pagamento
    const updateData: any = {
      titulo: data.titulo,
      descricao: data.descricao,
      valor: data.valor ? Number(data.valor) : undefined,
      dataVencimento: data.dataVencimento,
      status: data.status,
      formaPagamento: data.formaPagamento,
      responsavelUsuarioId: data.responsavelUsuarioId,
    };

    if (data.status === "PAGA" && !parcelaExistente.dataPagamento) {
      updateData.dataPagamento = data.dataPagamento || new Date();
    } else if (data.status !== "PAGA") {
      updateData.dataPagamento = null;
    }

    const parcela = await prisma.contratoParcela.update({
      where: { id },
      data: updateData,
      include: {
        contrato: {
          include: {
            cliente: true,
            advogadoResponsavel: {
              include: {
                usuario: true,
              },
            },
          },
        },
      },
    });

    revalidatePath("/contratos");
    revalidatePath("/parcelas");
    revalidatePath("/financeiro/parcelas");

    // Converter Decimal para number e serializar
    const converted = convertAllDecimalFields(parcela);
    const serialized = JSON.parse(JSON.stringify(converted));

    return {
      success: true,
      data: serialized,
      message: "Parcela atualizada com sucesso",
    };
  } catch (error) {
    console.error("Erro ao atualizar parcela:", error);

    return {
      success: false,
      error: "Erro ao atualizar parcela",
    };
  }
}

// ============================================
// DELETAR PARCELA DE CONTRATO
// ============================================

export async function deleteParcelaContrato(id: string) {
  try {
    const tenantId = await getTenantId();

    // Verificar permissão para excluir parcelas
    const podeExcluir = await checkPermission("financeiro", "excluir");

    if (!podeExcluir) {
      return {
        success: false,
        error: "Você não tem permissão para excluir parcelas",
      };
    }

    // Verificar se a parcela existe e pertence ao tenant
    const parcela = await prisma.contratoParcela.findFirst({
      where: {
        id,
        tenantId,
      },
    });

    if (!parcela) {
      return {
        success: false,
        error: "Parcela não encontrada",
      };
    }

    await prisma.contratoParcela.delete({
      where: { id },
    });

    revalidatePath("/contratos");
    revalidatePath("/parcelas");
    revalidatePath("/financeiro/parcelas");

    return {
      success: true,
      message: "Parcela removida com sucesso",
    };
  } catch (error) {
    console.error("Erro ao deletar parcela:", error);

    return {
      success: false,
      error: "Erro ao deletar parcela",
    };
  }
}

// ============================================
// GERAR PARCELAS AUTOMATICAMENTE
// ============================================

export async function gerarParcelasAutomaticamente(
  contratoId: string,
  configuracao: {
    valorTotal: number;
    numeroParcelas: number;
    dataPrimeiroVencimento: Date;
    intervaloDias?: number; // Padrão: 30 dias
    tituloBase?: string;
  },
) {
  try {
    const tenantId = await getTenantId();

    // Verificar se o contrato existe
    const contrato = await prisma.contrato.findFirst({
      where: {
        id: contratoId,
        tenantId,
      },
      include: {
        dadosBancarios: true, // Incluir dados bancários do contrato
      },
    });

    if (!contrato) {
      return {
        success: false,
        error: "Contrato não encontrado",
      };
    }

    // Verificar se já existem parcelas para este contrato
    const parcelasExistentes = await prisma.contratoParcela.count({
      where: {
        contratoId,
        tenantId,
      },
    });

    if (parcelasExistentes > 0) {
      return {
        success: false,
        error: "Este contrato já possui parcelas cadastradas",
      };
    }

    const valorParcela = configuracao.valorTotal / configuracao.numeroParcelas;
    const intervalo = configuracao.intervaloDias || 30;
    const parcelas = [];

    for (let i = 1; i <= configuracao.numeroParcelas; i++) {
      const dataVencimento = new Date(configuracao.dataPrimeiroVencimento);

      dataVencimento.setDate(dataVencimento.getDate() + (i - 1) * intervalo);

      const parcela = await prisma.contratoParcela.create({
        data: {
          tenantId,
          contratoId,
          dadosBancariosId: contrato.dadosBancariosId, // Herdar conta bancária do contrato
          numeroParcela: i,
          titulo: configuracao.tituloBase
            ? `${configuracao.tituloBase} ${i}/${configuracao.numeroParcelas}`
            : `Parcela ${i}/${configuracao.numeroParcelas}`,
          valor: valorParcela,
          dataVencimento,
          status: "PENDENTE",
        },
      });

      parcelas.push(parcela);
    }

    revalidatePath("/contratos");
    revalidatePath("/parcelas");
    revalidatePath("/financeiro/parcelas");

    // Converter Decimal para number e serializar
    const convertedData = parcelas.map((item) => convertAllDecimalFields(item));
    const serialized = JSON.parse(JSON.stringify(convertedData));

    return {
      success: true,
      data: serialized,
      message: `${configuracao.numeroParcelas} parcelas criadas com sucesso`,
    };
  } catch (error) {
    console.error("Erro ao gerar parcelas:", error);

    return {
      success: false,
      error: "Erro ao gerar parcelas automaticamente",
    };
  }
}

// ============================================
// OBTER DASHBOARD DE PARCELAS
// ============================================

export async function getDashboardParcelas() {
  try {
    const tenantId = await getTenantId();

    const [
      totalParcelas,
      parcelasPendentes,
      parcelasPagas,
      parcelasAtrasadas,
      valorTotalPendente,
      valorTotalPago,
      parcelasVencendo,
    ] = await Promise.all([
      // Total de parcelas
      prisma.contratoParcela.count({
        where: { tenantId },
      }),
      // Parcelas pendentes
      prisma.contratoParcela.count({
        where: { tenantId, status: "PENDENTE" },
      }),
      // Parcelas pagas
      prisma.contratoParcela.count({
        where: { tenantId, status: "PAGA" },
      }),
      // Parcelas atrasadas
      prisma.contratoParcela.count({
        where: {
          tenantId,
          status: "PENDENTE",
          dataVencimento: { lt: new Date() },
        },
      }),
      // Valor total pendente
      prisma.contratoParcela.aggregate({
        where: { tenantId, status: "PENDENTE" },
        _sum: { valor: true },
      }),
      // Valor total pago
      prisma.contratoParcela.aggregate({
        where: { tenantId, status: "PAGA" },
        _sum: { valor: true },
      }),
      // Parcelas vencendo nos próximos 7 dias
      prisma.contratoParcela.count({
        where: {
          tenantId,
          status: "PENDENTE",
          dataVencimento: {
            gte: new Date(),
            lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 dias
          },
        },
      }),
    ]);

    return {
      success: true,
      data: {
        totalParcelas,
        parcelasPendentes,
        parcelasPagas,
        parcelasAtrasadas,
        valorTotalPendente: Number(valorTotalPendente._sum.valor || 0),
        valorTotalPago: Number(valorTotalPago._sum.valor || 0),
        parcelasVencendo,
      },
    };
  } catch (error) {
    console.error("Erro ao buscar dashboard de parcelas:", error);

    return {
      success: false,
      error: "Erro ao buscar dashboard de parcelas",
    };
  }
}

// ============================================
// BUSCAR PROCESSOS COM PARCELAS
// ============================================

export async function getProcessosComParcelas() {
  try {
    const tenantId = await getTenantId();

    // Buscar processos que têm contratos com parcelas
    const processos = await prisma.processo.findMany({
      where: {
        tenantId,
        contratos: {
          some: {
            parcelas: {
              some: {}, // Pelo menos uma parcela
            },
          },
        },
      },
      select: {
        id: true,
        numero: true,
        titulo: true,
        _count: {
          select: {
            contratos: {
              where: {
                parcelas: {
                  some: {},
                },
              },
            },
          },
        },
      },
      orderBy: {
        numero: "asc",
      },
    });

    // Converter valores Decimal para number
    const convertedData = processos.map((item) =>
      convertAllDecimalFields(item),
    );
    const serialized = JSON.parse(JSON.stringify(convertedData));

    return {
      success: true,
      data: serialized,
    };
  } catch (error) {
    console.error("Erro ao buscar processos com parcelas:", error);

    return {
      success: false,
      error: "Erro ao buscar processos com parcelas",
    };
  }
}

// ============================================
// OBTER STATUS DISPONÍVEIS
// ============================================

export async function getStatusParcelas() {
  return {
    success: true,
    data: [
      {
        value: "PENDENTE",
        label: "Pendente",
        color: "warning",
        icon: "⏳",
      },
      {
        value: "PAGA",
        label: "Paga",
        color: "success",
        icon: "✅",
      },
      {
        value: "ATRASADA",
        label: "Atrasada",
        color: "danger",
        icon: "⚠️",
      },
      {
        value: "CANCELADA",
        label: "Cancelada",
        color: "default",
        icon: "❌",
      },
    ],
  };
}

// ============================================
// GERAR DADOS DE PAGAMENTO
// ============================================

export async function getDadosPagamentoParcela(parcelaId: string) {
  try {
    const tenantId = await getTenantId();

    const parcela = await prisma.contratoParcela.findFirst({
      where: {
        id: parcelaId,
        tenantId,
      },
      include: {
        contrato: {
          include: {
            cliente: true,
            dadosBancarios: {
              include: {
                banco: true,
              },
            },
          },
        },
        dadosBancarios: {
          include: {
            banco: true,
          },
        },
      },
    });

    if (!parcela) {
      return {
        success: false,
        error: "Parcela não encontrada",
      };
    }

    // Usar dados bancários da parcela ou do contrato (herança)
    const dadosBancarios =
      parcela.dadosBancarios || parcela.contrato.dadosBancarios;

    if (!dadosBancarios) {
      return {
        success: false,
        error: "Nenhuma conta bancária configurada para esta parcela",
      };
    }

    // Gerar dados de pagamento
    const dadosPagamento = {
      parcela: {
        id: parcela.id,
        numeroParcela: parcela.numeroParcela,
        titulo: parcela.titulo,
        valor: Number(parcela.valor),
        dataVencimento: parcela.dataVencimento,
        status: parcela.status,
      },
      cliente: {
        nome: parcela.contrato.cliente.nome,
        documento: parcela.contrato.cliente.documento,
        email: parcela.contrato.cliente.email,
        telefone: parcela.contrato.cliente.telefone,
      },
      dadosBancarios: {
        banco: dadosBancarios.banco?.nome || "Banco não informado",
        agencia: dadosBancarios.agencia,
        conta: dadosBancarios.conta,
        chavePix: dadosBancarios.chavePix,
        principal: dadosBancarios.principal,
      },
      pagamento: {
        pix: dadosBancarios.chavePix
          ? {
              chave: dadosBancarios.chavePix,
              valor: Number(parcela.valor),
              descricao: `Parcela ${parcela.numeroParcela} - ${parcela.contrato.cliente.nome}`,
              beneficiario: dadosBancarios.banco?.nome || "Banco não informado",
            }
          : null,
        boleto: {
          banco: dadosBancarios.banco?.nome || "Banco não informado",
          agencia: dadosBancarios.agencia,
          conta: dadosBancarios.conta,
          valor: Number(parcela.valor),
          vencimento: parcela.dataVencimento,
          beneficiario: dadosBancarios.banco?.nome || "Banco não informado",
          instrucoes: [
            `Parcela ${parcela.numeroParcela} do contrato ${parcela.contrato.titulo}`,
            `Cliente: ${parcela.contrato.cliente.nome}`,
            "Não receber após o vencimento",
          ],
        },
      },
    };

    return {
      success: true,
      data: dadosPagamento,
    };
  } catch (error) {
    console.error("Erro ao gerar dados de pagamento:", error);

    return {
      success: false,
      error: "Erro ao gerar dados de pagamento",
    };
  }
}
