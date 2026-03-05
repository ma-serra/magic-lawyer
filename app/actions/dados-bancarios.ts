"use server";

import { revalidatePath } from "next/cache";

import prisma from "@/app/lib/prisma";
import { getSession } from "@/app/lib/auth";

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

type DadosBancariosAccessContext = {
  tenantId: string;
  userId: string;
  role: string;
  canViewGlobal: boolean;
  canManageGlobal: boolean;
  accessibleClienteIds: string[];
};

async function getDadosBancariosAccessContext(): Promise<DadosBancariosAccessContext> {
  const session = await getSession();

  if (!session?.user?.tenantId || !session.user.id) {
    throw new Error("Sessão inválida para operar dados bancários");
  }

  const tenantId = session.user.tenantId;
  const userId = session.user.id;
  const role = String((session.user as any)?.role || "");
  const canViewGlobal =
    role === "ADMIN" || role === "SUPER_ADMIN" || role === "FINANCEIRO";
  const canManageGlobal = canViewGlobal;
  let accessibleClienteIds: string[] = [];

  if (role === "ADVOGADO") {
    const advogado = await prisma.advogado.findFirst({
      where: {
        tenantId,
        usuarioId: userId,
      },
      select: {
        id: true,
      },
    });

    if (advogado) {
      const vinculacoes = await prisma.advogadoCliente.findMany({
        where: {
          tenantId,
          advogadoId: advogado.id,
        },
        select: {
          clienteId: true,
        },
      });

      accessibleClienteIds = vinculacoes.map((item) => item.clienteId);
    }
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
    canManageGlobal,
    accessibleClienteIds,
  };
}

function canAccessDadosBancariosRecord(
  context: DadosBancariosAccessContext,
  record: { usuarioId?: string | null; clienteId?: string | null },
) {
  if (context.canViewGlobal) {
    return true;
  }

  if (record.usuarioId && record.usuarioId === context.userId) {
    return true;
  }

  if (record.clienteId && context.accessibleClienteIds.includes(record.clienteId)) {
    return true;
  }

  return false;
}

// ============================================
// LISTAR DADOS BANCÁRIOS
// ============================================

export async function listDadosBancarios(filters?: {
  search?: string;
  bancoCodigo?: string;
  tipoConta?: "PESSOA_FISICA" | "PESSOA_JURIDICA";
  tipoContaBancaria?: "CORRENTE" | "POUPANCA" | "SALARIO" | "INVESTIMENTO";
  advogadoId?: string;
  usuarioId?: string;
  clienteId?: string;
  ativo?: boolean;
  principal?: boolean;
  onlyMine?: boolean;
  page?: number;
  pageSize?: number;
}) {
  try {
    const context = await getDadosBancariosAccessContext();
    const page = Math.max(1, Number(filters?.page || 1));
    const pageSize = Math.max(1, Math.min(100, Number(filters?.pageSize || 20)));
    const skip = (page - 1) * pageSize;
    const andConditions: any[] = [];

    if (!context.canViewGlobal) {
      if (context.accessibleClienteIds.length > 0) {
        andConditions.push({
          OR: [
            { usuarioId: context.userId },
            { clienteId: { in: context.accessibleClienteIds } },
          ],
        });
      } else {
        andConditions.push({ usuarioId: context.userId });
      }
    }

    if (filters?.search?.trim()) {
      const term = filters.search.trim();

      andConditions.push({
        OR: [
          { titularNome: { contains: term, mode: "insensitive" } },
          { titularDocumento: { contains: term, mode: "insensitive" } },
          { chavePix: { contains: term, mode: "insensitive" } },
          { agencia: { contains: term, mode: "insensitive" } },
          { conta: { contains: term, mode: "insensitive" } },
          { usuario: { firstName: { contains: term, mode: "insensitive" } } },
          { usuario: { lastName: { contains: term, mode: "insensitive" } } },
          { usuario: { email: { contains: term, mode: "insensitive" } } },
          { cliente: { nome: { contains: term, mode: "insensitive" } } },
          { banco: { nome: { contains: term, mode: "insensitive" } } },
        ],
      });
    }

    if (filters?.bancoCodigo) {
      andConditions.push({ bancoCodigo: filters.bancoCodigo });
    }

    if (filters?.tipoConta) {
      andConditions.push({ tipoConta: filters.tipoConta });
    }

    if (filters?.tipoContaBancaria) {
      andConditions.push({ tipoContaBancaria: filters.tipoContaBancaria });
    }

    if (filters?.ativo !== undefined) {
      andConditions.push({ ativo: filters.ativo });
    }

    if (filters?.principal !== undefined) {
      andConditions.push({ principal: filters.principal });
    }

    if (context.canViewGlobal && filters?.onlyMine) {
      andConditions.push({ usuarioId: context.userId });
    }

    if (filters?.usuarioId) {
      if (context.canViewGlobal || filters.usuarioId === context.userId) {
        andConditions.push({ usuarioId: filters.usuarioId });
      }
    }

    if (filters?.clienteId) {
      if (
        context.canViewGlobal ||
        context.accessibleClienteIds.includes(filters.clienteId)
      ) {
        andConditions.push({ clienteId: filters.clienteId });
      }
    }

    if (filters?.advogadoId) {
      const advogado = await prisma.advogado.findFirst({
        where: {
          id: filters.advogadoId,
          tenantId: context.tenantId,
        },
        select: {
          usuarioId: true,
          clientes: {
            select: {
              clienteId: true,
            },
          },
        },
      });

      if (advogado) {
        const clienteIds = advogado.clientes.map((item) => item.clienteId);
        const subFilters: any[] = [{ usuarioId: advogado.usuarioId }];

        if (clienteIds.length > 0) {
          subFilters.push({ clienteId: { in: clienteIds } });
        }

        andConditions.push({ OR: subFilters });
      }
    }

    const where: any = {
      tenantId: context.tenantId,
      deletedAt: null,
    };

    if (andConditions.length > 0) {
      where.AND = andConditions;
    }

    const [dadosBancarios, total, ativos, principais, comPix] =
      await Promise.all([
        prisma.dadosBancarios.findMany({
          where,
          include: {
            usuario: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                role: true,
              },
            },
            cliente: {
              select: {
                id: true,
                nome: true,
                email: true,
                documento: true,
              },
            },
            banco: {
              select: {
                codigo: true,
                nome: true,
              },
            },
          },
          orderBy: [
            { principal: "desc" },
            { ativo: "desc" },
            { createdAt: "desc" },
          ],
          skip,
          take: pageSize,
        }),
        prisma.dadosBancarios.count({ where }),
        prisma.dadosBancarios.count({ where: { ...where, ativo: true } }),
        prisma.dadosBancarios.count({ where: { ...where, principal: true } }),
        prisma.dadosBancarios.count({
          where: {
            ...where,
            chavePix: { not: null },
          },
        }),
      ]);

    return {
      success: true,
      data: dadosBancarios,
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
        resumo: {
          total,
          ativos,
          principais,
          comPix,
        },
      },
      permissions: {
        role: context.role,
        canViewGlobal: context.canViewGlobal,
        canManageGlobal: context.canManageGlobal,
      },
    };
  } catch (error) {
    console.error("Erro ao listar dados bancários:", error);

    return {
      success: false,
      error: "Erro ao listar dados bancários",
      data: [],
      meta: {
        total: 0,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      },
      permissions: {
        role: "",
        canViewGlobal: false,
        canManageGlobal: false,
      },
    };
  }
}

export async function getDadosBancariosFilterOptions() {
  try {
    const context = await getDadosBancariosAccessContext();

    const [bancos, clientes, advogados, colaboradores] = await Promise.all([
      prisma.banco.findMany({
        where: { ativo: true },
        select: {
          codigo: true,
          nome: true,
        },
        orderBy: { nome: "asc" },
      }),
      context.canViewGlobal
        ? prisma.cliente.findMany({
            where: {
              tenantId: context.tenantId,
              deletedAt: null,
            },
            select: {
              id: true,
              nome: true,
              documento: true,
            },
            orderBy: { nome: "asc" },
          })
        : context.accessibleClienteIds.length > 0
          ? prisma.cliente.findMany({
              where: {
                tenantId: context.tenantId,
                id: { in: context.accessibleClienteIds },
                deletedAt: null,
              },
              select: {
                id: true,
                nome: true,
                documento: true,
              },
              orderBy: { nome: "asc" },
            })
          : [],
      context.canViewGlobal
        ? prisma.advogado.findMany({
            where: { tenantId: context.tenantId },
            select: {
              id: true,
              usuarioId: true,
              usuario: {
                select: {
                  firstName: true,
                  lastName: true,
                  email: true,
                },
              },
            },
            orderBy: {
              usuario: {
                firstName: "asc",
              },
            },
          })
        : [],
      context.canManageGlobal
        ? prisma.usuario.findMany({
            where: {
              tenantId: context.tenantId,
              active: true,
              role: {
                not: "CLIENTE",
              },
            },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              role: true,
            },
            orderBy: { firstName: "asc" },
          })
        : [],
    ]);

    return {
      success: true,
      data: {
        bancos,
        clientes,
        advogados,
        colaboradores,
        permissions: {
          role: context.role,
          canViewGlobal: context.canViewGlobal,
          canManageGlobal: context.canManageGlobal,
          userId: context.userId,
        },
      },
    };
  } catch (error) {
    console.error("Erro ao buscar opções de filtros bancários:", error);
    return {
      success: false,
      error: "Erro ao carregar opções da tela",
      data: {
        bancos: [],
        clientes: [],
        advogados: [],
        colaboradores: [],
        permissions: {
          role: "",
          canViewGlobal: false,
          canManageGlobal: false,
          userId: "",
        },
      },
    };
  }
}

// ============================================
// OBTER DADOS BANCÁRIOS POR ID
// ============================================

export async function getDadosBancarios(id: string) {
  try {
    const context = await getDadosBancariosAccessContext();

    const dadosBancarios = await prisma.dadosBancarios.findFirst({
      where: {
        id,
        tenantId: context.tenantId,
        deletedAt: null,
      },
      include: {
        usuario: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
        cliente: {
          select: {
            id: true,
            nome: true,
            email: true,
            documento: true,
            telefone: true,
          },
        },
        banco: {
          select: {
            codigo: true,
            nome: true,
          },
        },
      },
    });

    if (!dadosBancarios) {
      return {
        success: false,
        error: "Dados bancários não encontrados",
      };
    }

    if (!canAccessDadosBancariosRecord(context, dadosBancarios)) {
      return {
        success: false,
        error: "Você não tem permissão para acessar estes dados bancários",
      };
    }

    return {
      success: true,
      data: dadosBancarios,
    };
  } catch (error) {
    console.error("Erro ao buscar dados bancários:", error);

    return {
      success: false,
      error: "Erro ao buscar dados bancários",
    };
  }
}

// ============================================
// CRIAR DADOS BANCÁRIOS
// ============================================

export async function createDadosBancarios(data: {
  usuarioId?: string;
  clienteId?: string;
  tipoConta: "PESSOA_FISICA" | "PESSOA_JURIDICA";
  bancoCodigo: string;
  agencia: string;
  conta: string;
  digitoConta?: string;
  tipoContaBancaria: "CORRENTE" | "POUPANCA" | "SALARIO" | "INVESTIMENTO";
  chavePix?: string;
  tipoChavePix?: "CPF" | "CNPJ" | "EMAIL" | "TELEFONE" | "ALEATORIA";
  titularNome: string;
  titularDocumento: string;
  titularEmail?: string;
  titularTelefone?: string;
  endereco?: string;
  cidade?: string;
  estado?: string;
  cep?: string;
  principal?: boolean;
  observacoes?: string;
}) {
  try {
    const context = await getDadosBancariosAccessContext();
    let usuarioId = data.usuarioId;
    let clienteId = data.clienteId;

    if (usuarioId && clienteId) {
      return {
        success: false,
        error: "Vincule a conta a usuário ou cliente, nunca aos dois ao mesmo tempo",
      };
    }

    if (!context.canManageGlobal) {
      if (context.role === "ADVOGADO" || context.role === "CLIENTE") {
        if (usuarioId && usuarioId !== context.userId) {
          return {
            success: false,
            error: "Você só pode cadastrar conta bancária em seu próprio usuário",
          };
        }

        if (clienteId && !context.accessibleClienteIds.includes(clienteId)) {
          return {
            success: false,
            error: "Cliente fora do seu escopo de acesso",
          };
        }
      } else {
        if (clienteId || (usuarioId && usuarioId !== context.userId)) {
          return {
            success: false,
            error:
              "Você não tem permissão para cadastrar conta bancária para outros usuários ou clientes",
          };
        }
      }
    }

    if (!usuarioId && !clienteId) {
      usuarioId = context.userId;
    }

    if (clienteId) {
      const clienteValido = await prisma.cliente.findFirst({
        where: {
          id: clienteId,
          tenantId: context.tenantId,
          deletedAt: null,
        },
        select: { id: true },
      });

      if (!clienteValido) {
        return {
          success: false,
          error: "Cliente inválido para este tenant",
        };
      }
    }

    if (usuarioId) {
      const usuarioValido = await prisma.usuario.findFirst({
        where: {
          id: usuarioId,
          tenantId: context.tenantId,
        },
        select: { id: true },
      });

      if (!usuarioValido) {
        return {
          success: false,
          error: "Usuário inválido para este tenant",
        };
      }
    }

    // Se marcado como principal, desmarcar outros
    if (data.principal) {
      await prisma.dadosBancarios.updateMany({
        where: {
          tenantId: context.tenantId,
          usuarioId: usuarioId || null,
          clienteId: clienteId || null,
          principal: true,
        },
        data: {
          principal: false,
        },
      });
    }

    const dadosBancarios = await prisma.dadosBancarios.create({
      data: {
        tenantId: context.tenantId,
        usuarioId,
        clienteId,
        tipoConta: data.tipoConta,
        bancoCodigo: data.bancoCodigo,
        agencia: data.agencia,
        conta: data.conta,
        digitoConta: data.digitoConta,
        tipoContaBancaria: data.tipoContaBancaria,
        chavePix: data.chavePix,
        tipoChavePix: data.tipoChavePix,
        titularNome: data.titularNome,
        titularDocumento: data.titularDocumento,
        titularEmail: data.titularEmail,
        titularTelefone: data.titularTelefone,
        endereco: data.endereco,
        cidade: data.cidade,
        estado: data.estado,
        cep: data.cep,
        principal: data.principal || false,
        observacoes: data.observacoes,
      },
      include: {
        usuario: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        cliente: {
          select: {
            nome: true,
            email: true,
          },
        },
        banco: {
          select: {
            codigo: true,
            nome: true,
          },
        },
      },
    });

    revalidatePath("/dados-bancarios");
    revalidatePath("/financeiro/dados-bancarios");
    revalidatePath("/usuario/perfil");

    return {
      success: true,
      data: dadosBancarios,
      message: "Dados bancários criados com sucesso",
    };
  } catch (error) {
    console.error("Erro ao criar dados bancários:", error);

    return {
      success: false,
      error: "Erro ao criar dados bancários",
    };
  }
}

// ============================================
// ATUALIZAR DADOS BANCÁRIOS
// ============================================

export async function updateDadosBancarios(
  id: string,
  data: {
    usuarioId?: string;
    clienteId?: string;
    tipoConta?: "PESSOA_FISICA" | "PESSOA_JURIDICA";
    bancoCodigo?: string;
    agencia?: string;
    conta?: string;
    digitoConta?: string;
    tipoContaBancaria?: "CORRENTE" | "POUPANCA" | "SALARIO" | "INVESTIMENTO";
    chavePix?: string;
    tipoChavePix?: "CPF" | "CNPJ" | "EMAIL" | "TELEFONE" | "ALEATORIA";
    titularNome?: string;
    titularDocumento?: string;
    titularEmail?: string;
    titularTelefone?: string;
    endereco?: string;
    cidade?: string;
    estado?: string;
    cep?: string;
    ativo?: boolean;
    principal?: boolean;
    observacoes?: string;
  },
) {
  try {
    const context = await getDadosBancariosAccessContext();

    // Verificar se os dados bancários existem
    const dadosExistente = await prisma.dadosBancarios.findFirst({
      where: {
        id,
        tenantId: context.tenantId,
        deletedAt: null,
      },
    });

    if (!dadosExistente) {
      return {
        success: false,
        error: "Dados bancários não encontrados",
      };
    }

    if (!canAccessDadosBancariosRecord(context, dadosExistente)) {
      return {
        success: false,
        error: "Você não tem permissão para editar estes dados bancários",
      };
    }

    const nextUsuarioId =
      data.usuarioId !== undefined ? data.usuarioId || null : dadosExistente.usuarioId;
    const nextClienteId =
      data.clienteId !== undefined ? data.clienteId || null : dadosExistente.clienteId;

    if (nextUsuarioId && nextClienteId) {
      return {
        success: false,
        error: "A conta não pode ficar vinculada a usuário e cliente ao mesmo tempo",
      };
    }

    if (
      !context.canManageGlobal &&
      (nextUsuarioId !== dadosExistente.usuarioId ||
        nextClienteId !== dadosExistente.clienteId)
    ) {
      return {
        success: false,
        error: "Você não tem permissão para alterar o vínculo desta conta",
      };
    }

    if (
      context.canManageGlobal &&
      nextClienteId &&
      !(await prisma.cliente.findFirst({
        where: {
          id: nextClienteId,
          tenantId: context.tenantId,
          deletedAt: null,
        },
        select: { id: true },
      }))
    ) {
      return {
        success: false,
        error: "Cliente inválido para este tenant",
      };
    }

    // Se marcado como principal, desmarcar outros
    if (data.principal) {
      await prisma.dadosBancarios.updateMany({
        where: {
          tenantId: context.tenantId,
          usuarioId: nextUsuarioId,
          clienteId: nextClienteId,
          principal: true,
          id: { not: id },
        },
        data: {
          principal: false,
        },
      });
    }

    const dadosBancarios = await prisma.dadosBancarios.update({
      where: { id },
      data: {
        usuarioId: nextUsuarioId,
        clienteId: nextClienteId,
        tipoConta: data.tipoConta,
        bancoCodigo: data.bancoCodigo,
        agencia: data.agencia,
        conta: data.conta,
        digitoConta: data.digitoConta,
        tipoContaBancaria: data.tipoContaBancaria,
        chavePix: data.chavePix,
        tipoChavePix: data.tipoChavePix,
        titularNome: data.titularNome,
        titularDocumento: data.titularDocumento,
        titularEmail: data.titularEmail,
        titularTelefone: data.titularTelefone,
        endereco: data.endereco,
        cidade: data.cidade,
        estado: data.estado,
        cep: data.cep,
        ativo: data.ativo,
        principal: data.principal,
        observacoes: data.observacoes,
      },
      include: {
        usuario: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        cliente: {
          select: {
            nome: true,
            email: true,
          },
        },
        banco: {
          select: {
            codigo: true,
            nome: true,
          },
        },
      },
    });

    revalidatePath("/dados-bancarios");
    revalidatePath("/financeiro/dados-bancarios");
    revalidatePath("/usuario/perfil");

    return {
      success: true,
      data: dadosBancarios,
      message: "Dados bancários atualizados com sucesso",
    };
  } catch (error) {
    console.error("Erro ao atualizar dados bancários:", error);

    return {
      success: false,
      error: "Erro ao atualizar dados bancários",
    };
  }
}

// ============================================
// DELETAR DADOS BANCÁRIOS (SOFT DELETE)
// ============================================

export async function deleteDadosBancarios(id: string) {
  try {
    const context = await getDadosBancariosAccessContext();

    // Verificar se os dados bancários existem
    const dadosBancarios = await prisma.dadosBancarios.findFirst({
      where: {
        id,
        tenantId: context.tenantId,
        deletedAt: null,
      },
    });

    if (!dadosBancarios) {
      return {
        success: false,
        error: "Dados bancários não encontrados",
      };
    }

    if (!canAccessDadosBancariosRecord(context, dadosBancarios)) {
      return {
        success: false,
        error: "Você não tem permissão para remover estes dados bancários",
      };
    }

    // Soft delete
    await prisma.dadosBancarios.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        ativo: false,
      },
    });

    revalidatePath("/dados-bancarios");
    revalidatePath("/financeiro/dados-bancarios");
    revalidatePath("/usuario/perfil");

    return {
      success: true,
      message: "Dados bancários removidos com sucesso",
    };
  } catch (error) {
    console.error("Erro ao deletar dados bancários:", error);

    return {
      success: false,
      error: "Erro ao deletar dados bancários",
    };
  }
}

// ============================================
// OBTER DADOS BANCÁRIOS ATIVOS DO TENANT
// ============================================

export async function getDadosBancariosAtivos() {
  try {
    const context = await getDadosBancariosAccessContext();
    const andConditions: any[] = [];

    if (!context.canViewGlobal) {
      if (context.accessibleClienteIds.length > 0) {
        andConditions.push({
          OR: [
            { usuarioId: context.userId },
            { clienteId: { in: context.accessibleClienteIds } },
          ],
        });
      } else {
        andConditions.push({ usuarioId: context.userId });
      }
    }

    const where: any = {
      tenantId: context.tenantId,
      ativo: true,
      deletedAt: null,
    };

    if (andConditions.length > 0) {
      where.AND = andConditions;
    }

    const dadosBancarios = await prisma.dadosBancarios.findMany({
      where,
      orderBy: [{ principal: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        banco: true,
        agencia: true,
        conta: true,
        digitoConta: true,
        tipoContaBancaria: true,
        titularNome: true,
        principal: true,
        chavePix: true,
        tipoChavePix: true,
      },
    });

    return {
      success: true,
      data: dadosBancarios,
    };
  } catch (error) {
    console.error("Erro ao buscar dados bancários ativos:", error);

    return {
      success: false,
      error: "Erro ao buscar dados bancários",
      data: [],
    };
  }
}

// ============================================
// OBTER DADOS BANCÁRIOS DO USUÁRIO LOGADO
// ============================================

export async function getMeusDadosBancarios() {
  try {
    const tenantId = await getTenantId();
    const userId = await getUserId();

    const dadosBancarios = await prisma.dadosBancarios.findMany({
      where: {
        tenantId,
        usuarioId: userId,
        deletedAt: null,
      },
      include: {
        banco: {
          select: {
            codigo: true,
            nome: true,
          },
        },
      },
      orderBy: [
        { principal: "desc" },
        { ativo: "desc" },
        { createdAt: "desc" },
      ],
    });

    return {
      success: true,
      data: dadosBancarios,
    };
  } catch (error) {
    console.error("Erro ao buscar meus dados bancários:", error);

    return {
      success: false,
      error: "Erro ao buscar dados bancários",
      data: [],
    };
  }
}

// ============================================
// OBTER BANCOS DISPONÍVEIS
// ============================================

// Função removida - agora usa getBancosDisponiveis() de bancos.ts

// ============================================
// OBTER TIPOS DE CONTA
// ============================================

export async function getTiposConta() {
  return {
    success: true,
    data: [
      {
        value: "PESSOA_FISICA",
        label: "Pessoa Física",
        description: "Conta de pessoa física",
        icon: "👤",
      },
      {
        value: "PESSOA_JURIDICA",
        label: "Pessoa Jurídica",
        description: "Conta de pessoa jurídica",
        icon: "🏢",
      },
    ],
  };
}

// ============================================
// OBTER TIPOS DE CONTA BANCÁRIA
// ============================================

export async function getTiposContaBancaria() {
  return {
    success: true,
    data: [
      {
        value: "CORRENTE",
        label: "Conta Corrente",
        description: "Conta corrente tradicional",
        icon: "💳",
      },
      {
        value: "POUPANCA",
        label: "Poupança",
        description: "Conta poupança",
        icon: "🐷",
      },
      {
        value: "SALARIO",
        label: "Salário",
        description: "Conta salário",
        icon: "💰",
      },
      {
        value: "INVESTIMENTO",
        label: "Investimento",
        description: "Conta de investimento",
        icon: "📈",
      },
    ],
  };
}

// ============================================
// OBTER TIPOS DE CHAVE PIX
// ============================================

export async function getTiposChavePix() {
  return {
    success: true,
    data: [
      {
        value: "CPF",
        label: "CPF",
        description: "Chave PIX com CPF",
        icon: "🆔",
      },
      {
        value: "CNPJ",
        label: "CNPJ",
        description: "Chave PIX com CNPJ",
        icon: "🏢",
      },
      {
        value: "EMAIL",
        label: "E-mail",
        description: "Chave PIX com e-mail",
        icon: "📧",
      },
      {
        value: "TELEFONE",
        label: "Telefone",
        description: "Chave PIX com telefone",
        icon: "📱",
      },
      {
        value: "ALEATORIA",
        label: "Aleatória",
        description: "Chave PIX aleatória",
        icon: "🎲",
      },
    ],
  };
}
