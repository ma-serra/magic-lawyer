"use server";

import { getSession } from "@/app/lib/auth";
import prisma, { toNumber, convertAllDecimalFields } from "@/app/lib/prisma";
import {
  enviarEmailPrimeiroAcesso,
  maskEmail,
} from "@/app/lib/first-access-email";
import { TipoEndereco, TipoPessoa, Prisma } from "@/generated/prisma";
import logger from "@/lib/logger";
import { DocumentNotifier } from "@/app/lib/notifications/document-notifier";
import { checkPermission } from "@/app/actions/equipe";
import {
  getAccessibleAdvogadoIds,
  getAdvogadoIdFromSession,
} from "@/app/lib/advogado-access";
import {
  buildProcessoClienteMembershipWhere,
  decorateProcessosWithVinculos,
  processoClientesRelacionadosInclude,
  processoResponsaveisRelacionadosInclude,
} from "@/app/lib/processos/processo-vinculos";

// ============================================
// TYPES
// ============================================

export interface Cliente {
  id: string;
  tenantId: string;
  tipoPessoa: TipoPessoa;
  nome: string;
  documento: string | null;
  email: string | null;
  telefone: string | null;
  celular: string | null;
  dataNascimento: Date | null;
  inscricaoEstadual: string | null;
  nomePai: string | null;
  documentoPai: string | null;
  nomeMae: string | null;
  documentoMae: string | null;
  responsavelNome: string | null;
  responsavelEmail: string | null;
  responsavelTelefone: string | null;
  observacoes: string | null;
  asaasCustomerId?: string | null;
  usuarioId: string | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  advogadoClientes?: {
    id: string;
    advogadoId: string;
    relacionamento: string | null;
    advogado: {
      id: string;
      oabNumero: string | null;
      oabUf: string | null;
      usuario: {
        firstName: string | null;
        lastName: string | null;
        email: string | null;
      };
    };
  }[];
  usuario?: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    role: string;
    active: boolean;
    lastLoginAt: Date | null;
  } | null;
  enderecos?: {
    id: string;
    apelido: string;
    tipo: string;
    principal: boolean;
    logradouro: string;
    numero: string | null;
    complemento: string | null;
    bairro: string | null;
    cidade: string;
    estado: string;
    cep: string | null;
    pais: string;
  }[];
  _count?: {
    processos: number;
    contratos: number;
    documentos: number;
    procuracoes?: number;
    tarefas?: number;
    eventos?: number;
    enderecos?: number;
    dadosBancarios?: number;
    documentoAssinaturas?: number;
    advogadoClientes?: number;
  };
}

export interface EnderecoPrincipalInput {
  cep?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  pais?: string;
}

export interface ClienteComProcessos extends Cliente {
  processos: {
    id: string;
    numero: string;
    numeroCnj: string | null;
    grau: string | null;
    fase: string | null;
    titulo: string | null;
    status: string;
    arquivamentoTipo: string | null;
    areaId: string | null;
    valorCausa: number | null;
    dataDistribuicao: Date | null;
    prazoPrincipal: Date | null;
    createdAt: Date;
    area: {
      nome: string;
      slug: string;
    } | null;
    advogadoResponsavel: {
      id: string;
      usuario: {
        firstName: string | null;
        lastName: string | null;
      };
    } | null;
    clientesVinculados?: Array<{
      id: string;
      nome: string;
      email: string | null;
      telefone: string | null;
      tipoPessoa: string;
    }>;
    advogadosResponsaveis?: Array<{
      id: string;
      oabNumero: string | null;
      oabUf: string | null;
      usuario: {
        id?: string | null;
        firstName: string | null;
        lastName: string | null;
        email?: string | null;
        avatarUrl?: string | null;
      } | null;
    }>;
    _count: {
      documentos: number;
      eventos: number;
      movimentacoes: number;
      procuracoesVinculadas: number;
    };
  }[];
  enderecos: {
    id: string;
    apelido: string;
    tipo: string;
    principal: boolean;
    logradouro: string;
    numero: string | null;
    complemento: string | null;
    bairro: string | null;
    cidade: string;
    estado: string;
    cep: string | null;
    pais: string;
    telefone: string | null;
    observacoes: string | null;
    createdAt: Date;
    updatedAt: Date;
  }[];
  dadosBancarios: {
    id: string;
    bancoCodigo: string;
    agencia: string;
    conta: string;
    digitoConta: string | null;
    tipoConta: string;
    tipoContaBancaria: string;
    chavePix: string | null;
    tipoChavePix: string | null;
    titularNome: string;
    titularDocumento: string;
    titularEmail: string | null;
    titularTelefone: string | null;
    cidade: string | null;
    estado: string | null;
    ativo: boolean;
    principal: boolean;
    observacoes: string | null;
    banco: {
      codigo: string;
      nome: string;
      nomeCompleto: string | null;
    };
    createdAt: Date;
    updatedAt: Date;
  }[];
  tarefas: {
    id: string;
    titulo: string;
    descricao: string | null;
    status: string;
    prioridade: string;
    dataLimite: Date | null;
    completedAt: Date | null;
    createdAt: Date;
    processo: {
      id: string;
      numero: string;
      titulo: string | null;
    } | null;
    responsavel: {
      id: string;
      firstName: string | null;
      lastName: string | null;
      email: string | null;
    } | null;
  }[];
  eventos: {
    id: string;
    titulo: string;
    descricao: string | null;
    tipo: string;
    status: string;
    dataInicio: Date;
    dataFim: Date;
    local: string | null;
    processo: {
      id: string;
      numero: string;
      titulo: string | null;
    } | null;
    advogadoResponsavel: {
      id: string;
      usuario: {
        firstName: string | null;
        lastName: string | null;
        email: string | null;
      };
    } | null;
  }[];
  documentoAssinaturas: {
    id: string;
    titulo: string;
    descricao: string | null;
    status: string;
    dataEnvio: Date | null;
    dataAssinatura: Date | null;
    dataExpiracao: Date | null;
    createdAt: Date;
    documento: {
      id: string;
      nome: string;
      url: string;
    };
  }[];
}

// ============================================
// HELPER FUNCTIONS
// ============================================

async function getClienteIdFromSession(session: {
  user: any;
}): Promise<string | null> {
  if (!session?.user?.id || !session?.user?.tenantId) return null;

  // Buscar cliente vinculado ao usuário
  const cliente = await prisma.cliente.findFirst({
    where: {
      usuarioId: session.user.id,
      tenantId: session.user.tenantId,
      deletedAt: null,
    },
    select: { id: true },
  });

  return cliente?.id || null;
}

// ============================================
// ACTIONS - LISTAGEM
// ============================================

/**
 * Busca clientes vinculados ao advogado logado
 */
export async function getClientesAdvogado(): Promise<{
  success: boolean;
  clientes?: Cliente[];
  error?: string;
}> {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;

    if (!user.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    const accessibleAdvogados = await getAccessibleAdvogadoIds(session);

    // Se não há vínculos, acesso total (sem filtros)
    const whereCliente: any = {
      tenantId: user.tenantId,
      deletedAt: null,
    };

    if (accessibleAdvogados.length > 0) {
      whereCliente.advogadoClientes = {
        some: {
          advogadoId: {
            in: accessibleAdvogados,
          },
        },
      };
    }

    // Buscar clientes vinculados ao advogado através da tabela AdvogadoCliente
    const clientesRaw = await prisma.cliente.findMany({
      where: whereCliente,
      include: {
        advogadoClientes: {
          select: {
            id: true,
            advogadoId: true,
            relacionamento: true,
            advogado: {
              select: {
                id: true,
                oabNumero: true,
                oabUf: true,
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
        enderecos: {
          where: {
            principal: true,
          },
          select: {
            id: true,
            apelido: true,
            tipo: true,
            principal: true,
            logradouro: true,
            numero: true,
            complemento: true,
            bairro: true,
            cidade: true,
            estado: true,
            cep: true,
            pais: true,
          },
          take: 1,
          orderBy: {
            createdAt: "desc",
          },
        },
        _count: {
          select: {
            processos: { where: { deletedAt: null } },
            contratos: true,
            documentos: { where: { deletedAt: null } },
          },
        },
      },
      orderBy: {
        nome: "asc",
      },
    });

    return {
      success: true,
      clientes: clientesRaw,
    };
  } catch (error) {
    logger.error("Erro ao buscar clientes do advogado:", error);

    return {
      success: false,
      error: "Erro ao buscar clientes",
    };
  }
}

/**
 * Busca todos os clientes do tenant (para ADMIN)
 */
export async function getAllClientesTenant(): Promise<{
  success: boolean;
  clientes?: Cliente[];
  error?: string;
}> {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;

    // Verificar se é ADMIN
    if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
      return {
        success: false,
        error: "Acesso negado. Apenas administradores.",
      };
    }

    if (!user.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    const clientesRaw = await prisma.cliente.findMany({
      where: {
        tenantId: user.tenantId,
        deletedAt: null,
      },
      include: {
        advogadoClientes: {
          select: {
            id: true,
            advogadoId: true,
            relacionamento: true,
            advogado: {
              select: {
                id: true,
                oabNumero: true,
                oabUf: true,
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
        enderecos: {
          where: {
            principal: true,
          },
          select: {
            id: true,
            apelido: true,
            tipo: true,
            principal: true,
            logradouro: true,
            numero: true,
            complemento: true,
            bairro: true,
            cidade: true,
            estado: true,
            cep: true,
            pais: true,
          },
          take: 1,
          orderBy: {
            createdAt: "desc",
          },
        },
        _count: {
          select: {
            processos: { where: { deletedAt: null } },
            contratos: true,
            documentos: { where: { deletedAt: null } },
          },
        },
      },
      orderBy: {
        nome: "asc",
      },
    });

    return {
      success: true,
      clientes: clientesRaw,
    };
  } catch (error) {
    logger.error("Erro ao buscar todos os clientes:", error);

    return {
      success: false,
      error: "Erro ao buscar clientes",
    };
  }
}

// ============================================
// ACTIONS - DETALHES
// ============================================

/**
 * Busca detalhes de um cliente específico com seus processos
 */
export async function getClienteComProcessos(clienteId: string): Promise<{
  success: boolean;
  cliente?: ClienteComProcessos;
  error?: string;
}> {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;

    if (!user.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    // Se não for ADMIN, verificar se é advogado vinculado ao cliente
    let whereClause: Prisma.ClienteWhereInput = {
      id: clienteId,
      tenantId: user.tenantId,
      deletedAt: null,
    };

    if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
      const accessibleAdvogados = await getAccessibleAdvogadoIds(session);

      // Se não há vínculos, acesso total (sem filtros)
      if (accessibleAdvogados.length > 0) {
        whereClause.advogadoClientes = {
          some: {
            advogadoId: {
              in: accessibleAdvogados,
            },
          },
        };
      }
    }

    const clienteRaw = await prisma.cliente.findFirst({
      where: whereClause,
      include: {
        advogadoClientes: {
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
                    email: true,
                  },
                },
              },
            },
          },
          orderBy: {
            createdAt: "asc",
          },
        },
        usuario: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            active: true,
            lastLoginAt: true,
          },
        },
        _count: {
          select: {
            processos: { where: { deletedAt: null } },
            contratos: true,
            documentos: { where: { deletedAt: null } },
            procuracoes: true,
            tarefas: { where: { deletedAt: null } },
            eventos: true,
            enderecos: true,
            dadosBancarios: true,
            documentoAssinaturas: true,
            advogadoClientes: true,
          },
        },
        enderecos: {
          orderBy: [{ principal: "desc" }, { createdAt: "asc" }],
        },
        dadosBancarios: {
          where: { deletedAt: null },
          include: {
            banco: {
              select: {
                codigo: true,
                nome: true,
                nomeCompleto: true,
              },
            },
          },
          orderBy: [{ principal: "desc" }, { createdAt: "asc" }],
        },
        processos: {
          where: {
            deletedAt: null,
          },
          include: {
            area: {
              select: {
                nome: true,
                slug: true,
              },
            },
            advogadoResponsavel: {
              select: {
                id: true,
                usuario: {
                  select: {
                    firstName: true,
                    lastName: true,
                  },
                },
              },
            },
            ...processoClientesRelacionadosInclude,
            ...processoResponsaveisRelacionadosInclude,
            _count: {
              select: {
                documentos: { where: { deletedAt: null } },
                eventos: true,
                movimentacoes: true,
                procuracoesVinculadas: true,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        },
        tarefas: {
          where: {
            deletedAt: null,
          },
          select: {
            id: true,
            titulo: true,
            descricao: true,
            status: true,
            prioridade: true,
            dataLimite: true,
            completedAt: true,
            createdAt: true,
            processo: {
              select: {
                id: true,
                numero: true,
                titulo: true,
              },
            },
            responsavel: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
          orderBy: [{ dataLimite: "asc" }, { createdAt: "desc" }],
        },
        eventos: {
          include: {
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
          orderBy: [{ dataInicio: "asc" }, { createdAt: "desc" }],
        },
        documentoAssinaturas: {
          include: {
            documento: {
              select: {
                id: true,
                nome: true,
                url: true,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        },
      },
    });

    if (!clienteRaw) {
      return { success: false, error: "Cliente não encontrado" };
    }

    const processosRaw = await prisma.processo.findMany({
      where: {
        tenantId: user.tenantId,
        deletedAt: null,
        AND: [buildProcessoClienteMembershipWhere(clienteId)],
      },
      include: {
        area: {
          select: {
            nome: true,
            slug: true,
          },
        },
        advogadoResponsavel: {
          select: {
            id: true,
            usuario: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
          },
        },
        ...processoClientesRelacionadosInclude,
        ...processoResponsaveisRelacionadosInclude,
        _count: {
          select: {
            documentos: { where: { deletedAt: null } },
            eventos: true,
            movimentacoes: true,
            procuracoesVinculadas: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // Converter Decimal para number
    const cliente: ClienteComProcessos = {
      ...clienteRaw,
      _count: {
        ...clienteRaw._count,
        processos: processosRaw.length,
      },
      processos: decorateProcessosWithVinculos(processosRaw as any).map((p: any) => ({
        ...p,
        valorCausa: toNumber(p.valorCausa),
      })),
      tarefas: clienteRaw.tarefas.map((tarefa: any) => ({
        ...tarefa,
      })),
      dadosBancarios: clienteRaw.dadosBancarios.map((conta: any) => ({
        ...conta,
      })),
    };

    return {
      success: true,
      cliente,
    };
  } catch (error) {
    logger.error("Erro ao buscar cliente com processos:", error);

    return {
      success: false,
      error: "Erro ao buscar cliente",
    };
  }
}

/**
 * Busca cliente básico por ID (sem processos)
 */
export async function getClienteById(clienteId: string): Promise<{
  success: boolean;
  cliente?: Cliente;
  error?: string;
}> {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;

    if (!user.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    let whereClause: Prisma.ClienteWhereInput = {
      id: clienteId,
      tenantId: user.tenantId,
      deletedAt: null,
    };

    // Se não for ADMIN, verificar se é advogado vinculado
    if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
      const advogadoId = await getAdvogadoIdFromSession(session);

      if (!advogadoId) {
        return { success: false, error: "Acesso negado" };
      }

      whereClause.advogadoClientes = {
        some: {
          advogadoId: advogadoId,
        },
      };
    }

    const cliente = await prisma.cliente.findFirst({
      where: whereClause,
      include: {
        advogadoClientes: {
          select: {
            id: true,
            advogadoId: true,
            relacionamento: true,
            advogado: {
              select: {
                id: true,
                oabNumero: true,
                oabUf: true,
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
        usuario: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            active: true,
            lastLoginAt: true,
          },
        },
        _count: {
          select: {
            processos: { where: { deletedAt: null } },
            contratos: true,
            documentos: { where: { deletedAt: null } },
          },
        },
      },
    });

    if (!cliente) {
      return { success: false, error: "Cliente não encontrado" };
    }

    return {
      success: true,
      cliente: cliente,
    };
  } catch (error) {
    logger.error("Erro ao buscar cliente:", error);

    return {
      success: false,
      error: "Erro ao buscar cliente",
    };
  }
}

// ============================================
// ACTIONS - CRIAR/EDITAR/DELETAR
// ============================================

export interface ClienteCreateInput {
  tipoPessoa: TipoPessoa;
  nome: string;
  documento?: string;
  email?: string;
  telefone?: string;
  celular?: string;
  dataNascimento?: Date;
  inscricaoEstadual?: string;
  nomePai?: string;
  documentoPai?: string;
  nomeMae?: string;
  documentoMae?: string;
  observacoes?: string;
  responsavelNome?: string;
  responsavelEmail?: string;
  responsavelTelefone?: string;
  enderecoPrincipal?: EnderecoPrincipalInput;
  advogadosIds?: string[]; // IDs dos advogados a vincular
  criarUsuario?: boolean; // Se deve criar usuário de acesso
}

function trimOptional(value?: string | null): string | undefined {
  const parsed = value?.trim();

  return parsed ? parsed : undefined;
}

function hasEnderecoData(endereco?: EnderecoPrincipalInput) {
  if (!endereco) {
    return false;
  }

  return Boolean(
    trimOptional(endereco.cep) ||
      trimOptional(endereco.logradouro) ||
      trimOptional(endereco.numero) ||
      trimOptional(endereco.complemento) ||
      trimOptional(endereco.bairro) ||
      trimOptional(endereco.cidade) ||
      trimOptional(endereco.estado),
  );
}

function sanitizeEnderecoInput(endereco?: EnderecoPrincipalInput) {
  if (!hasEnderecoData(endereco)) {
    return undefined;
  }

  return {
    cep: trimOptional(endereco?.cep),
    logradouro: trimOptional(endereco?.logradouro),
    numero: trimOptional(endereco?.numero),
    complemento: trimOptional(endereco?.complemento),
    bairro: trimOptional(endereco?.bairro),
    cidade: trimOptional(endereco?.cidade),
    estado: trimOptional(endereco?.estado),
    pais: trimOptional(endereco?.pais) || "Brasil",
  };
}

function validateEnderecoInput(
  endereco?: ReturnType<typeof sanitizeEnderecoInput>,
) {
  if (!endereco) {
    return null;
  }

  if (!endereco.logradouro || !endereco.cidade || !endereco.estado) {
    return "Para cadastrar o endereço, informe logradouro, cidade e estado";
  }

  return null;
}

function buildPrincipalEnderecoApelido(clienteId: string) {
  return `Cliente principal ${clienteId.slice(-8)}-${Date.now()}`;
}

/**
 * Criar novo cliente
 */
export async function createCliente(data: ClienteCreateInput): Promise<{
  success: boolean;
  cliente?: Cliente;
  usuario?: {
    email: string;
    maskedEmail: string;
    primeiroAcessoEnviado: boolean;
    erroEnvio?: string;
  };
  error?: string;
}> {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;

    if (!user.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    // Verificar permissão para criar clientes
    const podeCriar = await checkPermission("clientes", "criar");

    if (!podeCriar) {
      return {
        success: false,
        error: "Você não tem permissão para criar clientes",
      };
    }

    const { advogadosIds, criarUsuario, enderecoPrincipal, ...clienteData } =
      data;
    const enderecoPrincipalData = sanitizeEnderecoInput(enderecoPrincipal);
    const enderecoValidationError = validateEnderecoInput(
      enderecoPrincipalData,
    );

    if (enderecoValidationError) {
      return {
        success: false,
        error: enderecoValidationError,
      };
    }

    // Validar email se for criar usuário
    if (criarUsuario && !clienteData.email) {
      return {
        success: false,
        error: "Email é obrigatório para criar usuário de acesso",
      };
    }

    // Se não forneceu advogadosIds, vincular automaticamente ao advogado logado
    let advogadosParaVincular = advogadosIds;

    if (!advogadosParaVincular && user.role === "ADVOGADO") {
      const advogadoLogado = await getAdvogadoIdFromSession(session);

      if (advogadoLogado) {
        advogadosParaVincular = [advogadoLogado];
      }
    }

    let usuarioData = null;
    let usuarioId = null;
    let tenantNomeParaPrimeiroAcesso: string | null = null;

    // Criar usuário se solicitado
    if (criarUsuario && clienteData.email) {
      // Verificar se email já existe como SuperAdmin
      const superAdminExistente = await prisma.superAdmin.findUnique({
        where: {
          email: clienteData.email,
        },
      });

      if (superAdminExistente) {
        return {
          success: false,
          error:
            "Este email pertence a um Super Admin e não pode ser usado para clientes",
        };
      }

      // Verificar se já existe usuário com esse email no tenant
      const usuarioExistente = await prisma.usuario.findFirst({
        where: {
          email: clienteData.email,
          tenantId: user.tenantId,
        },
      });

      if (usuarioExistente) {
        return {
          success: false,
          error: "Já existe um usuário com este email no sistema",
        };
      }

      // Separar nome em firstName e lastName
      const nomePartes = clienteData.nome.trim().split(" ");
      const firstName = nomePartes[0];
      const lastName = nomePartes.slice(1).join(" ") || "";

      // Criar usuário
      const novoUsuario = await prisma.usuario.create({
        data: {
          email: clienteData.email,
          passwordHash: null,
          role: "CLIENTE",
          firstName,
          lastName,
          phone: clienteData.telefone || clienteData.celular,
          tenantId: user.tenantId,
          active: true,
          createdById: user.id,
        },
      });

      usuarioId = novoUsuario.id;

      if (!tenantNomeParaPrimeiroAcesso) {
        const tenant = await prisma.tenant.findUnique({
          where: { id: user.tenantId },
          select: { name: true },
        });
        tenantNomeParaPrimeiroAcesso = tenant?.name ?? "Magic Lawyer";
      }

      const envioPrimeiroAcesso = await enviarEmailPrimeiroAcesso({
        userId: novoUsuario.id,
        tenantId: user.tenantId,
        email: clienteData.email,
        nome: clienteData.nome,
        tenantNome: tenantNomeParaPrimeiroAcesso || "Magic Lawyer",
      });

      usuarioData = {
        email: clienteData.email,
        maskedEmail: maskEmail(clienteData.email),
        primeiroAcessoEnviado: envioPrimeiroAcesso.success,
        erroEnvio: envioPrimeiroAcesso.success
          ? undefined
          : envioPrimeiroAcesso.error ||
            "Não foi possível enviar o e-mail de primeiro acesso.",
      };
    }

    // Criar cliente com relacionamentos
    const cliente = await prisma.cliente.create({
      data: {
        ...clienteData,
        dataNascimento:
          clienteData.tipoPessoa === TipoPessoa.JURIDICA
            ? undefined
            : clienteData.dataNascimento,
        nomePai:
          clienteData.tipoPessoa === TipoPessoa.JURIDICA
            ? undefined
            : clienteData.nomePai,
        documentoPai:
          clienteData.tipoPessoa === TipoPessoa.JURIDICA
            ? undefined
            : clienteData.documentoPai,
        nomeMae:
          clienteData.tipoPessoa === TipoPessoa.JURIDICA
            ? undefined
            : clienteData.nomeMae,
        documentoMae:
          clienteData.tipoPessoa === TipoPessoa.JURIDICA
            ? undefined
            : clienteData.documentoMae,
        tenantId: user.tenantId,
        usuarioId,
        advogadoClientes: advogadosParaVincular
          ? {
              create: advogadosParaVincular.map((advId) => ({
                advogadoId: advId,
                tenantId: user.tenantId,
              })),
            }
          : undefined,
      },
      include: {
        advogadoClientes: {
          select: {
            id: true,
            advogadoId: true,
            relacionamento: true,
            advogado: {
              select: {
                id: true,
                oabNumero: true,
                oabUf: true,
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
        _count: {
          select: {
            processos: { where: { deletedAt: null } },
            contratos: true,
            documentos: { where: { deletedAt: null } },
          },
        },
      },
    });

    if (enderecoPrincipalData) {
      await prisma.endereco.updateMany({
        where: {
          tenantId: user.tenantId,
          clienteId: cliente.id,
          principal: true,
        },
        data: {
          principal: false,
        },
      });

      await prisma.endereco.create({
        data: {
          tenantId: user.tenantId,
          clienteId: cliente.id,
          apelido: buildPrincipalEnderecoApelido(cliente.id),
          tipo:
            clienteData.tipoPessoa === TipoPessoa.JURIDICA
              ? TipoEndereco.COMERCIAL
              : TipoEndereco.RESIDENCIAL,
          principal: true,
          logradouro: enderecoPrincipalData.logradouro!,
          numero: enderecoPrincipalData.numero || null,
          complemento: enderecoPrincipalData.complemento || null,
          bairro: enderecoPrincipalData.bairro || null,
          cidade: enderecoPrincipalData.cidade!,
          estado: enderecoPrincipalData.estado!,
          cep: enderecoPrincipalData.cep || null,
          pais: enderecoPrincipalData.pais || "Brasil",
        },
      });
    }

    return {
      success: true,
      cliente: cliente,
      usuario: usuarioData || undefined,
    };
  } catch (error) {
    logger.error("Erro ao criar cliente:", error);

    return {
      success: false,
      error: "Erro ao criar cliente",
    };
  }
}

export interface ClienteUpdateInput {
  tipoPessoa?: TipoPessoa;
  nome?: string;
  documento?: string;
  email?: string;
  telefone?: string;
  celular?: string;
  dataNascimento?: Date;
  inscricaoEstadual?: string;
  nomePai?: string;
  documentoPai?: string;
  nomeMae?: string;
  documentoMae?: string;
  responsavelNome?: string;
  responsavelEmail?: string;
  responsavelTelefone?: string;
  observacoes?: string;
  enderecoPrincipal?: EnderecoPrincipalInput;
  advogadosIds?: string[]; // Se fornecido, substitui todos os vínculos
}

/**
 * Atualizar cliente existente
 */
export async function updateCliente(
  clienteId: string,
  data: ClienteUpdateInput,
): Promise<{
  success: boolean;
  cliente?: Cliente;
  error?: string;
}> {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;

    if (!user.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    // Verificar permissão para editar clientes
    const podeEditar = await checkPermission("clientes", "editar");

    if (!podeEditar) {
      return {
        success: false,
        error: "Você não tem permissão para editar clientes",
      };
    }

    // Verificar se cliente existe e pertence ao tenant
    const existingCliente = await prisma.cliente.findFirst({
      where: {
        id: clienteId,
        tenantId: user.tenantId,
        deletedAt: null,
      },
    });

    if (!existingCliente) {
      return { success: false, error: "Cliente não encontrado" };
    }

    const { advogadosIds, enderecoPrincipal, ...clienteData } = data;
    const enderecoPrincipalData = sanitizeEnderecoInput(enderecoPrincipal);
    const enderecoValidationError = validateEnderecoInput(
      enderecoPrincipalData,
    );

    if (enderecoValidationError) {
      return {
        success: false,
        error: enderecoValidationError,
      };
    }

    // Atualizar cliente
    const updateData: Prisma.ClienteUpdateInput = { ...clienteData };

    if (clienteData.tipoPessoa === TipoPessoa.JURIDICA) {
      updateData.dataNascimento = null;
      updateData.nomePai = null;
      updateData.documentoPai = null;
      updateData.nomeMae = null;
      updateData.documentoMae = null;
    }

    // Se advogadosIds foi fornecido, atualizar relacionamentos
    if (advogadosIds !== undefined) {
      updateData.advogadoClientes = {
        deleteMany: {}, // Remove todos os vínculos atuais
        create: advogadosIds.map((advId) => ({
          advogadoId: advId,
          tenantId: user.tenantId,
        })),
      };
    }

    const cliente = await prisma.cliente.update({
      where: { id: clienteId },
      data: updateData,
      include: {
        advogadoClientes: {
          select: {
            id: true,
            advogadoId: true,
            relacionamento: true,
            advogado: {
              select: {
                id: true,
                oabNumero: true,
                oabUf: true,
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
        _count: {
          select: {
            processos: { where: { deletedAt: null } },
            contratos: true,
            documentos: { where: { deletedAt: null } },
          },
        },
      },
    });

    if (enderecoPrincipalData) {
      const tipoPessoaAtualizada =
        clienteData.tipoPessoa || existingCliente.tipoPessoa;
      const tipoEndereco =
        tipoPessoaAtualizada === TipoPessoa.JURIDICA
          ? TipoEndereco.COMERCIAL
          : TipoEndereco.RESIDENCIAL;

      const enderecoPrincipalExistente = await prisma.endereco.findFirst({
        where: {
          tenantId: user.tenantId,
          clienteId,
          principal: true,
        },
        select: {
          id: true,
          apelido: true,
        },
      });

      if (enderecoPrincipalExistente) {
        await prisma.endereco.update({
          where: {
            id: enderecoPrincipalExistente.id,
          },
          data: {
            tipo: tipoEndereco,
            principal: true,
            logradouro: enderecoPrincipalData.logradouro!,
            numero: enderecoPrincipalData.numero || null,
            complemento: enderecoPrincipalData.complemento || null,
            bairro: enderecoPrincipalData.bairro || null,
            cidade: enderecoPrincipalData.cidade!,
            estado: enderecoPrincipalData.estado!,
            cep: enderecoPrincipalData.cep || null,
            pais: enderecoPrincipalData.pais || "Brasil",
          },
        });
      } else {
        await prisma.endereco.updateMany({
          where: {
            tenantId: user.tenantId,
            clienteId,
            principal: true,
          },
          data: {
            principal: false,
          },
        });

        await prisma.endereco.create({
          data: {
            tenantId: user.tenantId,
            clienteId,
            apelido: buildPrincipalEnderecoApelido(clienteId),
            tipo: tipoEndereco,
            principal: true,
            logradouro: enderecoPrincipalData.logradouro!,
            numero: enderecoPrincipalData.numero || null,
            complemento: enderecoPrincipalData.complemento || null,
            bairro: enderecoPrincipalData.bairro || null,
            cidade: enderecoPrincipalData.cidade!,
            estado: enderecoPrincipalData.estado!,
            cep: enderecoPrincipalData.cep || null,
            pais: enderecoPrincipalData.pais || "Brasil",
          },
        });
      }
    }

    return {
      success: true,
      cliente: cliente,
    };
  } catch (error) {
    logger.error("Erro ao atualizar cliente:", error);

    return {
      success: false,
      error: "Erro ao atualizar cliente",
    };
  }
}

/**
 * Soft delete de cliente
 */
export async function deleteCliente(clienteId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;

    if (!user.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    // Verificar permissão para excluir clientes
    const podeExcluir = await checkPermission("clientes", "excluir");

    if (!podeExcluir) {
      return {
        success: false,
        error: "Você não tem permissão para excluir clientes",
      };
    }

    // Verificar se cliente existe
    const existingCliente = await prisma.cliente.findFirst({
      where: {
        id: clienteId,
        tenantId: user.tenantId,
        deletedAt: null,
      },
    });

    if (!existingCliente) {
      return { success: false, error: "Cliente não encontrado" };
    }

    // Soft delete
    await prisma.cliente.update({
      where: { id: clienteId },
      data: { deletedAt: new Date() },
    });

    return { success: true };
  } catch (error) {
    logger.error("Erro ao deletar cliente:", error);

    return {
      success: false,
      error: "Erro ao deletar cliente",
    };
  }
}

// ============================================
// ACTIONS - BUSCA E FILTROS
// ============================================

export interface ClientesFiltros {
  busca?: string;
  tipoPessoa?: TipoPessoa;
  temProcessos?: boolean;
}

/**
 * Busca clientes com filtros
 */
export async function searchClientes(filtros: ClientesFiltros = {}): Promise<{
  success: boolean;
  clientes?: Cliente[];
  error?: string;
}> {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;

    if (!user.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    const whereClause: Prisma.ClienteWhereInput = {
      tenantId: user.tenantId,
      deletedAt: null,
    };

    // Se não for ADMIN, filtrar apenas clientes dos advogados acessíveis
    const isAdmin = user.role === "ADMIN" || user.role === "SUPER_ADMIN";

    if (!isAdmin && user.role !== "CLIENTE") {
      const accessibleAdvogados = await getAccessibleAdvogadoIds(session);

      // Se não há vínculos, acesso total (sem filtros)
      if (accessibleAdvogados.length > 0) {
        whereClause.advogadoClientes = {
          some: {
            advogadoId: {
              in: accessibleAdvogados,
            },
          },
        };
      }
    }

    // Aplicar filtros
    if (filtros.busca) {
      whereClause.OR = [
        { nome: { contains: filtros.busca, mode: "insensitive" } },
        { email: { contains: filtros.busca, mode: "insensitive" } },
        { documento: { contains: filtros.busca, mode: "insensitive" } },
      ];
    }

    if (filtros.tipoPessoa) {
      whereClause.tipoPessoa = filtros.tipoPessoa;
    }

    if (filtros.temProcessos !== undefined) {
      if (filtros.temProcessos) {
        whereClause.processos = {
          some: {
            deletedAt: null,
          },
        };
      } else {
        whereClause.processos = {
          none: {},
        };
      }
    }

    const clientes = await prisma.cliente.findMany({
      where: whereClause,
      include: {
        advogadoClientes: {
          select: {
            id: true,
            advogadoId: true,
            relacionamento: true,
            advogado: {
              select: {
                id: true,
                oabNumero: true,
                oabUf: true,
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
        enderecos: {
          where: {
            principal: true,
          },
          select: {
            id: true,
            apelido: true,
            tipo: true,
            principal: true,
            logradouro: true,
            numero: true,
            complemento: true,
            bairro: true,
            cidade: true,
            estado: true,
            cep: true,
            pais: true,
          },
          take: 1,
          orderBy: {
            createdAt: "desc",
          },
        },
        _count: {
          select: {
            processos: { where: { deletedAt: null } },
            contratos: true,
            documentos: { where: { deletedAt: null } },
          },
        },
      },
      orderBy: {
        nome: "asc",
      },
    });

    return {
      success: true,
      clientes: clientes,
    };
  } catch (error) {
    logger.error("Erro ao buscar clientes com filtros:", error);

    return {
      success: false,
      error: "Erro ao buscar clientes",
    };
  }
}

// ============================================
// ACTIONS - BUSCAR CLIENTES PARA SELECT
// ============================================

/**
 * Busca clientes disponíveis para o usuário (para usar em selects)
 * - ADMIN: Todos os clientes do tenant
 * - ADVOGADO: Apenas clientes vinculados
 */
export async function getClientesParaSelect() {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado", clientes: [] };
    }

    const user = session.user as any;

    if (!user.tenantId) {
      return { success: false, error: "Tenant não encontrado", clientes: [] };
    }

    let whereClause: Prisma.ClienteWhereInput = {
      tenantId: user.tenantId,
      deletedAt: null,
    };

    // Se for ADVOGADO, filtrar apenas clientes vinculados
    if (user.role === "ADVOGADO") {
      const advogadoId = await getAdvogadoIdFromSession(session);

      if (!advogadoId) {
        return {
          success: false,
          error: "Advogado não encontrado",
          clientes: [],
        };
      }

      whereClause.advogadoClientes = {
        some: {
          advogadoId: advogadoId,
        },
      };
    }
    // ADMIN vê todos os clientes

    const clientes = await prisma.cliente.findMany({
      where: whereClause,
      select: {
        id: true,
        nome: true,
        tipoPessoa: true,
        email: true,
        documento: true,
      },
      orderBy: {
        nome: "asc",
      },
    });

    return {
      success: true,
      clientes: clientes,
    };
  } catch (error) {
    logger.error("Erro ao buscar clientes para select:", error);

    return {
      success: false,
      error: "Erro ao buscar clientes",
      clientes: [],
    };
  }
}

/**
 * Busca clientes com seus processos e contratos para diligências
 */
export async function getClientesComRelacionamentos() {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado", clientes: [] };
    }

    const user = session.user as any;

    if (!user.tenantId) {
      return { success: false, error: "Tenant não encontrado", clientes: [] };
    }

    let whereClause: Prisma.ClienteWhereInput = {
      tenantId: user.tenantId,
      deletedAt: null,
    };

    // Se for ADVOGADO, filtrar apenas clientes vinculados
    if (user.role === "ADVOGADO") {
      const advogadoId = await getAdvogadoIdFromSession(session);

      if (!advogadoId) {
        return {
          success: false,
          error: "Advogado não encontrado",
          clientes: [],
        };
      }

      whereClause.advogadoClientes = {
        some: {
          advogadoId: advogadoId,
        },
      };
    }

    const clientes = await prisma.cliente.findMany({
      where: whereClause,
      include: {
        processos: true,
        contratos: true,
      },
      orderBy: {
        nome: "asc",
      },
    });

    // Converter valores Decimal para number recursivamente
    const clientesFormatted = clientes.map((cliente) => {
      const clienteConvertido = convertAllDecimalFields(cliente);

      // Converter também os relacionamentos
      if (clienteConvertido.processos) {
        clienteConvertido.processos = clienteConvertido.processos.map(
          (processo: any) => convertAllDecimalFields(processo),
        );
      }

      if (clienteConvertido.contratos) {
        clienteConvertido.contratos = clienteConvertido.contratos.map(
          (contrato: any) => convertAllDecimalFields(contrato),
        );
      }

      return JSON.parse(JSON.stringify(clienteConvertido));
    });

    return {
      success: true,
      clientes: clientesFormatted,
    };
  } catch (error) {
    logger.error("Erro ao buscar clientes com relacionamentos:", error);

    return {
      success: false,
      error: "Erro ao buscar clientes",
      clientes: [],
    };
  }
}

// ============================================
// ACTIONS - ANEXAR DOCUMENTO
// ============================================

export interface DocumentoCreateInput {
  nome: string;
  tipo?: string;
  descricao?: string;
  arquivo: File;
  processoId?: string;
  visivelParaCliente?: boolean;
}

/**
 * Anexa um documento a um cliente
 */
export async function anexarDocumentoCliente(
  clienteId: string,
  formData: FormData,
) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;

    if (!user.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    // Validar acesso ao cliente
    const cliente = await prisma.cliente.findFirst({
      where: {
        id: clienteId,
        tenantId: user.tenantId,
        deletedAt: null,
      },
    });

    if (!cliente) {
      return { success: false, error: "Cliente não encontrado" };
    }

    // Se não for ADMIN, verificar se é advogado vinculado
    if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
      const advogadoId = await getAdvogadoIdFromSession(session);

      if (!advogadoId) {
        return { success: false, error: "Acesso negado" };
      }

      const vinculo = await prisma.advogadoCliente.findFirst({
        where: {
          advogadoId,
          clienteId: cliente.id,
          tenantId: user.tenantId,
        },
      });

      if (!vinculo) {
        return { success: false, error: "Acesso negado" };
      }
    }

    // Extrair dados do FormData
    const nome = formData.get("nome") as string;
    const tipo = formData.get("tipo") as string;
    const descricao = formData.get("descricao") as string;
    const processoId = formData.get("processoId") as string;
    const visivelParaCliente = formData.get("visivelParaCliente") === "true";
    const arquivo = formData.get("arquivo") as File;

    if (!nome || !arquivo) {
      return { success: false, error: "Nome e arquivo são obrigatórios" };
    }

    // Converter arquivo para buffer
    const bytes = await arquivo.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Upload para Cloudinary
    const { UploadService } = await import("@/lib/upload-service");
    const uploadService = UploadService.getInstance();

    // Criar nome limpo para pasta
    const cleanClienteNome = cliente.nome
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    const folderPath = `magiclawyer/clientes/${cleanClienteNome}-${cliente.id}/documentos`;

    // Upload arquivo (vou criar método genérico no UploadService)
    const v2 = await import("cloudinary");
    const cloudinary = v2.v2;

    const uploadResult = await cloudinary.uploader.upload(
      `data:${arquivo.type};base64,${buffer.toString("base64")}`,
      {
        folder: folderPath,
        resource_type: "auto",
        public_id: `${Date.now()}_${arquivo.name.replace(/[^a-z0-9.]/gi, "_")}`,
        tags: ["cliente", "documento", cliente.id],
      },
    );

    // Criar documento no banco
    const documento = await prisma.documento.create({
      data: {
        tenantId: user.tenantId,
        nome,
        tipo: tipo || arquivo.type,
        descricao,
        url: uploadResult.secure_url,
        tamanhoBytes: arquivo.size,
        contentType: arquivo.type,
        clienteId: cliente.id,
        processoId: processoId || null,
        uploadedById: user.id,
        visivelParaCliente,
        visivelParaEquipe: true,
        metadados: {
          fileName: arquivo.name,
          cloudinaryPublicId: uploadResult.public_id,
          uploadedAt: new Date().toISOString(),
        },
      },
    });

    const uploaderDisplayName =
      `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() ||
      user.email ||
      user.id;

    try {
      await DocumentNotifier.notifyUploaded({
        tenantId: user.tenantId,
        documentoId: documento.id,
        nome: documento.nome,
        tipo: documento.tipo,
        tamanhoBytes: documento.tamanhoBytes,
        uploaderUserId: user.id,
        uploaderNome: uploaderDisplayName,
        processoIds:
          processoId && processoId.length > 0 ? [processoId] : undefined,
        clienteId: cliente.id,
        visivelParaCliente,
      });
    } catch (error) {
      logger.warn(
        "Falha ao emitir notificações de documento.uploaded (cliente)",
        error,
      );
    }

    return {
      success: true,
      documento: documento,
    };
  } catch (error) {
    logger.error("Erro ao anexar documento:", error);

    return {
      success: false,
      error: "Erro ao anexar documento",
    };
  }
}

// ============================================
// ACTIONS - PROCURAÇÕES DO CLIENTE
// ============================================

/**
 * Busca todas as procurações de um cliente
 */
export async function getProcuracoesCliente(clienteId: string) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autenticado", procuracoes: [] };
    }

    const user = session.user as any;

    if (!user.tenantId) {
      return {
        success: false,
        error: "Tenant não encontrado",
        procuracoes: [],
      };
    }

    // Buscar cliente para verificar tenantId
    const cliente = await prisma.cliente.findFirst({
      where: {
        id: clienteId,
        tenantId: user.tenantId,
        deletedAt: null,
      },
    });

    if (!cliente) {
      return {
        success: false,
        error: "Cliente não encontrado",
        procuracoes: [],
      };
    }

    // Se não for ADMIN, verificar se é ADVOGADO vinculado
    if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
      if (user.role === "ADVOGADO") {
        const advogado = await prisma.advogado.findFirst({
          where: {
            usuarioId: user.id,
            tenantId: user.tenantId,
          },
        });

        if (!advogado) {
          return {
            success: false,
            error: "Advogado não encontrado",
            procuracoes: [],
          };
        }

        // Verificar vínculo
        const vinculo = await prisma.advogadoCliente.findFirst({
          where: {
            advogadoId: advogado.id,
            clienteId: cliente.id,
            tenantId: user.tenantId,
          },
        });

        if (!vinculo) {
          return { success: false, error: "Acesso negado", procuracoes: [] };
        }
      } else {
        // CLIENTE só vê suas próprias procurações
        const clienteUsuario = await prisma.cliente.findFirst({
          where: {
            usuarioId: user.id,
            tenantId: user.tenantId,
            deletedAt: null,
          },
        });

        if (!clienteUsuario || clienteUsuario.id !== clienteId) {
          return { success: false, error: "Acesso negado", procuracoes: [] };
        }
      }
    }

    // Buscar procurações
    const procuracoes = await prisma.procuracao.findMany({
      where: {
        clienteId: cliente.id,
        tenantId: user.tenantId,
      },
      include: {
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
                numero: true,
                titulo: true,
              },
            },
          },
        },
        createdBy: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        poderes: {
          orderBy: {
            createdAt: "asc",
          },
        },
        assinaturas: {
          orderBy: {
            createdAt: "desc",
          },
        },
        documentos: {
          select: {
            id: true,
            fileName: true,
            originalName: true,
            description: true,
            tipo: true,
            url: true,
            size: true,
            mimeType: true,
            createdAt: true,
            uploader: {
              select: {
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return { success: true, procuracoes: procuracoes };
  } catch (error) {
    logger.error("Erro ao buscar procurações:", error);

    return {
      success: false,
      error: "Erro ao buscar procurações",
      procuracoes: [],
    };
  }
}

// ============================================
// ACTIONS - RESET DE SENHA
// ============================================

/**
 * Reseta a senha de um cliente e registra no log de auditoria
 */
export async function resetarSenhaCliente(clienteId: string): Promise<{
  success: boolean;
  usuario?: {
    email: string;
    maskedEmail: string;
    primeiroAcessoEnviado: boolean;
  };
  warning?: string;
  error?: string;
}> {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;

    if (!user.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    // Buscar cliente
    let whereClause: Prisma.ClienteWhereInput = {
      id: clienteId,
      tenantId: user.tenantId,
      deletedAt: null,
    };

    // Se não for ADMIN, verificar se é advogado vinculado ao cliente
    if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
      const advogadoId = await getAdvogadoIdFromSession(session);

      if (!advogadoId) {
        return { success: false, error: "Acesso negado" };
      }

      whereClause.advogadoClientes = {
        some: {
          advogadoId: advogadoId,
        },
      };
    }

    const cliente = await prisma.cliente.findFirst({
      where: whereClause,
      include: {
        usuario: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!cliente) {
      return { success: false, error: "Cliente não encontrado" };
    }

    if (!cliente.usuarioId || !cliente.usuario) {
      return { success: false, error: "Cliente não possui usuário de acesso" };
    }

    // Marcar como primeiro acesso novamente
    await prisma.usuario.update({
      where: { id: cliente.usuarioId },
      data: { passwordHash: null },
    });

    const tenant = await prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { name: true },
    });

    const nomeCliente = cliente.nome || cliente.usuario.email;
    const envioPrimeiroAcesso = await enviarEmailPrimeiroAcesso({
      userId: cliente.usuarioId,
      tenantId: user.tenantId,
      email: cliente.usuario.email,
      nome: nomeCliente,
      tenantNome: tenant?.name ?? "Magic Lawyer",
    });

    // Registrar no log de auditoria
    const nomeCompleto =
      user.firstName && user.lastName
        ? `${user.firstName} ${user.lastName}`.trim()
        : user.email;

    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        usuarioId: user.id,
        acao: "RESET_SENHA_CLIENTE",
        entidade: "Usuario",
        entidadeId: cliente.usuarioId,
        dados: {
          clienteId: cliente.id,
          clienteNome: cliente.nome,
          usuarioEmail: cliente.usuario.email,
          primeiroAcessoEnviado: envioPrimeiroAcesso.success,
          resetadoPor: nomeCompleto,
          resetadoPorId: user.id,
          resetadoPorRole: user.role,
          dataReset: new Date().toISOString(),
        },
        ip: null,
      },
    });

    return {
      success: true,
      usuario: {
        email: cliente.usuario.email,
        maskedEmail: maskEmail(cliente.usuario.email),
        primeiroAcessoEnviado: envioPrimeiroAcesso.success,
      },
      warning: envioPrimeiroAcesso.success
        ? undefined
        : envioPrimeiroAcesso.error ||
          "Senha redefinida para primeiro acesso, mas o e-mail não foi enviado automaticamente.",
    };
  } catch (error) {
    logger.error("Erro ao resetar senha do cliente:", error);

    return {
      success: false,
      error: "Erro ao resetar senha",
    };
  }
}

// ============================================
// ACTIONS - CONTRATOS E DOCUMENTOS
// ============================================

/**
 * Busca todos os contratos de um cliente
 */
export async function getContratosCliente(clienteId: string): Promise<{
  success: boolean;
  contratos?: any[];
  error?: string;
}> {
  try {
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

    // Se não for ADMIN, verificar se é advogado vinculado
    if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
      const advogadoId = await getAdvogadoIdFromSession(session);

      if (!advogadoId) {
        return { success: false, error: "Acesso negado" };
      }

      whereCliente.advogadoClientes = {
        some: {
          advogadoId: advogadoId,
        },
      };
    }

    // Verificar se cliente existe e está acessível
    const cliente = await prisma.cliente.findFirst({
      where: whereCliente,
    });

    if (!cliente) {
      return { success: false, error: "Cliente não encontrado ou sem acesso" };
    }

    // Buscar contratos
    const contratos = await prisma.contrato.findMany({
      where: {
        tenantId: user.tenantId,
        clienteId: clienteId,
      },
      include: {
        tipo: {
          select: {
            id: true,
            nome: true,
          },
        },
        advogadoResponsavel: {
          select: {
            id: true,
            oabNumero: true,
            oabUf: true,
            usuario: {
              select: {
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
        processo: {
          select: {
            id: true,
            numero: true,
            titulo: true,
          },
        },
        responsavelUsuario: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        dadosBancarios: {
          select: {
            id: true,
            bancoCodigo: true,
            agencia: true,
            conta: true,
            digitoConta: true,
            titularNome: true,
            titularDocumento: true,
            principal: true,
            banco: {
              select: {
                codigo: true,
                nome: true,
              },
            },
          },
        },
        _count: {
          select: {
            honorarios: true,
            parcelas: true,
            faturas: true,
            documentos: true,
          },
        },
        honorarios: {
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
                    email: true,
                  },
                },
              },
            },
          },
          orderBy: {
            createdAt: "asc",
          },
        },
        parcelas: {
          orderBy: {
            numeroParcela: "asc",
          },
        },
        faturas: {
          include: {
            pagamentos: {
              orderBy: {
                createdAt: "desc",
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // Converter Decimal para number
    const contratosFormatted = contratos.map((contrato) =>
      convertAllDecimalFields(contrato),
    );

    return {
      success: true,
      contratos: contratosFormatted,
    };
  } catch (error) {
    logger.error("Erro ao buscar contratos do cliente:", error);

    return {
      success: false,
      error: "Erro ao buscar contratos",
    };
  }
}

/**
 * Busca todos os documentos de um cliente (de todos os processos)
 */
export async function getDocumentosCliente(clienteId: string): Promise<{
  success: boolean;
  documentos?: any[];
  error?: string;
}> {
  try {
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

    // Se não for ADMIN, verificar se é advogado vinculado
    if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
      const advogadoId = await getAdvogadoIdFromSession(session);

      if (!advogadoId) {
        return { success: false, error: "Acesso negado" };
      }

      whereCliente.advogadoClientes = {
        some: {
          advogadoId: advogadoId,
        },
      };
    }

    // Verificar se cliente existe e está acessível
    const cliente = await prisma.cliente.findFirst({
      where: whereCliente,
    });

    if (!cliente) {
      return { success: false, error: "Cliente não encontrado ou sem acesso" };
    }

    // Buscar todos os documentos do cliente
    const documentos = await prisma.documento.findMany({
      where: {
        tenantId: user.tenantId,
        clienteId: clienteId,
        deletedAt: null,
      },
      include: {
        processo: {
          select: {
            id: true,
            numero: true,
            titulo: true,
          },
        },
        contrato: {
          select: {
            id: true,
            titulo: true,
          },
        },
        movimentacao: {
          select: {
            id: true,
            tipo: true,
            titulo: true,
          },
        },
        uploadedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return {
      success: true,
      documentos: documentos,
    };
  } catch (error) {
    logger.error("Erro ao buscar documentos do cliente:", error);

    return {
      success: false,
      error: "Erro ao buscar documentos",
    };
  }
}
