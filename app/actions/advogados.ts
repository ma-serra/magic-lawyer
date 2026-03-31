"use server";

import { revalidatePath } from "next/cache";

import { createAdvogadoHistorico } from "./advogado-historico";

import prisma from "@/app/lib/prisma";
import { getSession } from "@/app/lib/auth";
import {
  enviarEmailPrimeiroAcesso,
  maskEmail,
} from "@/app/lib/first-access-email";
import { EspecialidadeJuridica } from "@/generated/prisma";
import { convertAllDecimalFields } from "@/app/lib/prisma";
import { UploadService } from "@/lib/upload-service";

// =============================================
// TYPES
// =============================================

export interface AdvogadoSelectItem {
  id: string;
  value: string;
  label: string;
  oab: string | null;
  oabNumero: string | null;
  oabUf: string | null;
  usuario: {
    firstName: string | null;
    lastName: string | null;
    email: string;
  };
}

export interface AdvogadoData {
  id: string;
  usuarioId: string;
  oabNumero: string | null;
  oabUf: string | null;
  especialidades: EspecialidadeJuridica[];
  bio: string | null;
  telefone: string | null;
  whatsapp: string | null;
  comissaoPadrao: number;
  comissaoAcaoGanha: number;
  comissaoHonorarios: number;
  isExterno?: boolean; // Campo do schema para identificar advogados externos
  processosCount?: number; // Contador de processos onde aparece

  // Dados profissionais adicionais
  formacao?: string | null;
  experiencia?: string | null;
  premios?: string | null;
  publicacoes?: string | null;
  website?: string | null;
  linkedin?: string | null;
  twitter?: string | null;
  instagram?: string | null;

  // Configurações de notificação
  notificarEmail?: boolean;
  notificarWhatsapp?: boolean;
  notificarSistema?: boolean;

  // Configurações de acesso
  podeCriarProcessos?: boolean;
  podeEditarProcessos?: boolean;
  podeExcluirProcessos?: boolean;
  podeGerenciarClientes?: boolean;
  podeAcessarFinanceiro?: boolean;

  usuario: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    phone: string | null;
    avatarUrl: string | null;
    active: boolean;
    role: string;
    cpf?: string | null;
    rg?: string | null;
    dataNascimento?: string | null;
    observacoes?: string | null;
    createdAt?: Date;
  };
}

export interface EnderecoInput {
  apelido: string;
  tipo: string;
  principal: boolean;
  logradouro: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade: string;
  estado: string;
  cep?: string;
  pais?: string;
  telefone?: string;
  observacoes?: string;
}

export interface DadosBancariosInput {
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
}

export interface CreateAdvogadoInput {
  // Dados do usuário
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  cpf?: string;
  rg?: string;
  dataNascimento?: string;
  observacoes?: string;

  // Dados do advogado
  oabNumero?: string;
  oabUf?: string;
  especialidades?: EspecialidadeJuridica[];
  bio?: string;
  telefone?: string;
  whatsapp?: string;
  comissaoPadrao?: number;
  comissaoAcaoGanha?: number;
  comissaoHonorarios?: number;
  isExterno?: boolean;

  // Dados profissionais adicionais
  formacao?: string;
  experiencia?: string;
  premios?: string;
  publicacoes?: string;
  website?: string;
  linkedin?: string;
  twitter?: string;
  instagram?: string;

  // Configurações de notificação
  notificarEmail?: boolean;
  notificarWhatsapp?: boolean;
  notificarSistema?: boolean;

  // Configurações de acesso
  podeCriarProcessos?: boolean;
  podeEditarProcessos?: boolean;
  podeExcluirProcessos?: boolean;
  podeGerenciarClientes?: boolean;
  podeAcessarFinanceiro?: boolean;

  // Configurações de criação
  criarAcessoUsuario?: boolean;
  enviarEmailCredenciais?: boolean;

  // Endereço
  endereco?: {
    apelido: string;
    tipo: string;
    principal: boolean;
    logradouro: string;
    numero?: string;
    complemento?: string;
    bairro?: string;
    cidade: string;
    estado: string;
    cep?: string;
    pais?: string;
    telefone?: string;
    observacoes?: string;
  };
  enderecos?: EnderecoInput[];
  dadosBancarios?: DadosBancariosInput[];
}

export interface UpdateAdvogadoInput {
  // Dados do usuário
  firstName?: string;
  lastName?: string;
  phone?: string;
  cpf?: string;
  rg?: string;
  dataNascimento?: string;
  observacoes?: string;

  // Dados do advogado
  oabNumero?: string;
  oabUf?: string;
  especialidades?: EspecialidadeJuridica[];
  bio?: string;
  telefone?: string;
  whatsapp?: string;
  comissaoPadrao?: number;
  comissaoAcaoGanha?: number;
  comissaoHonorarios?: number;

  // Dados profissionais adicionais
  formacao?: string;
  experiencia?: string;
  premios?: string;
  publicacoes?: string;
  website?: string;
  linkedin?: string;
  twitter?: string;
  instagram?: string;

  // Configurações de notificação
  notificarEmail?: boolean;
  notificarWhatsapp?: boolean;
  notificarSistema?: boolean;

  // Configurações de acesso
  podeCriarProcessos?: boolean;
  podeEditarProcessos?: boolean;
  podeExcluirProcessos?: boolean;
  podeGerenciarClientes?: boolean;
  podeAcessarFinanceiro?: boolean;
}

interface ActionResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  advogados?: T;
}

export interface AdvogadoProfileData extends AdvogadoData {
  clientesVinculados: Array<{
    id: string;
    relacionamento: string | null;
    cliente: {
      id: string;
      nome: string;
      tipoPessoa: string;
      documento: string | null;
      email: string | null;
      telefone: string | null;
    };
    createdAt: string;
  }>;
  processos: Array<{
    id: string;
    numero: string;
    numeroCnj: string | null;
    titulo: string | null;
    status: string;
    fase: string | null;
    grau: string | null;
    dataDistribuicao: string | null;
    prazoPrincipal: string | null;
    createdAt: string;
    area: { id: string; nome: string } | null;
    cliente: { id: string; nome: string; tipoPessoa: string };
    advogadoResponsavel:
      | {
          id: string;
          oabNumero: string | null;
          oabUf: string | null;
          usuario: { firstName: string | null; lastName: string | null };
        }
      | null;
    _count: {
      documentos: number;
      eventos: number;
      movimentacoes: number;
      tarefas: number;
    };
    participacao: "Responsavel" | "Parte";
  }>;
  contratos: Array<{
    id: string;
    titulo: string;
    status: string;
    valor: number | null;
    dataInicio: string | null;
    dataAssinatura: string | null;
    cliente: { id: string; nome: string };
    processo: { id: string; numero: string } | null;
    tipo: { id: string; nome: string } | null;
    _count: {
      documentos: number;
      faturas: number;
      honorarios: number;
      parcelas: number;
    };
  }>;
  procuracoes: Array<{
    id: string;
    numero: string | null;
    ativa: boolean;
    status: string;
    emitidaEm: string | null;
    validaAte: string | null;
    arquivoUrl: string | null;
    cliente: {
      id: string;
      nome: string;
      documento: string | null;
    };
    _count: {
      poderes: number;
      documentos: number;
      assinaturas: number;
      processos: number;
    };
    outorgados: Array<{
      advogado: {
        id: string;
        usuario: {
          firstName: string | null;
          lastName: string | null;
        };
      };
    }>;
    processos: Array<{
      processo: {
        id: string;
        numero: string;
      };
    }>;
  }>;
  eventos: Array<{
    id: string;
    titulo: string;
    status: string;
    tipo: string;
    dataInicio: string;
    dataFim: string;
    local: string | null;
    cliente: { id: string; nome: string } | null;
    processo: { id: string; numero: string } | null;
  }>;
  tarefas: Array<{
    id: string;
    titulo: string;
    status: string;
    prioridade: string;
    dataLimite: string | null;
    dataInicio: string | null;
    createdAt: string;
    processo: { id: string; numero: string } | null;
    cliente: { id: string; nome: string } | null;
  }>;
  documentoAssinaturas: Array<{
    id: string;
    titulo: string;
    status: string;
    dataEnvio: string | null;
    dataAssinatura: string | null;
    dataExpiracao: string | null;
    urlDocumento: string;
    urlAssinado: string | null;
    documento: {
      id: string;
      nome: string | null;
      titulo?: string | null;
      nomeArquivo?: string | null;
    };
    processo: { id: string; numero: string } | null;
    cliente: { id: string; nome: string };
  }>;
}

function buildProcessoCardData(
  processo: {
    id: string;
    numero: string;
    numeroCnj: string | null;
    titulo: string | null;
    status: string;
    fase: string | null;
    grau: string | null;
    dataDistribuicao: Date | null;
    prazoPrincipal: Date | null;
    createdAt: Date;
    area: { id: string; nome: string } | null;
    cliente: { id: string; nome: string; tipoPessoa: string };
    advogadoResponsavel:
      | {
          id: string;
          oabNumero: string | null;
          oabUf: string | null;
          usuario: { firstName: string | null; lastName: string | null };
        }
      | null;
    _count: {
      documentos: number;
      eventos: number;
      movimentacoes: number;
      tarefas: number;
    };
    participacao: "Responsavel" | "Parte";
  },
): AdvogadoProfileData["processos"][number] {
  return convertAllDecimalFields({
    id: processo.id,
    numero: processo.numero,
    numeroCnj: processo.numeroCnj,
    titulo: processo.titulo,
    status: processo.status,
    fase: processo.fase,
    grau: processo.grau,
    dataDistribuicao: processo.dataDistribuicao?.toISOString() ?? null,
    prazoPrincipal: processo.prazoPrincipal?.toISOString() ?? null,
    createdAt: processo.createdAt.toISOString(),
    area: processo.area
      ? {
          id: processo.area.id,
          nome: processo.area.nome,
        }
      : null,
    cliente: processo.cliente,
    advogadoResponsavel: processo.advogadoResponsavel ?? null,
    _count: processo._count,
    participacao: processo.participacao,
  });
}

interface CreateAdvogadoResponse extends ActionResponse<AdvogadoData> {
  credenciais?: {
    email: string;
    maskedEmail: string;
    envioSolicitado: boolean;
    primeiroAcessoEnviado: boolean;
    erroEnvio?: string;
  };
}

// =============================================
// ACTIONS
// =============================================

export async function getAdvogados(): Promise<ActionResponse<AdvogadoData[]>> {
  try {
    const session = await getSession();

    if (!session?.user?.tenantId) {
      return { success: false, error: "Usuário não autenticado" };
    }

    const user = session.user as any;
    const isAdmin = user.role === "ADMIN" || user.role === "SUPER_ADMIN";

    // Construir where clause
    const whereClause: any = {
      tenantId: session.user.tenantId,
    };

    // Aplicar escopo de acesso para staff vinculados
    if (!isAdmin) {
      const { getAccessibleAdvogadoIds } = await import(
        "@/app/lib/advogado-access"
      );
      const accessibleAdvogados = await getAccessibleAdvogadoIds(session);

      // Mantém a carteira interna restrita, mas exibe externos identificados no tenant.
      if (accessibleAdvogados.length > 0) {
        whereClause.OR = [
          { isExterno: true },
          { id: { in: accessibleAdvogados } },
        ];
      }
    }

    const advogados = await prisma.advogado.findMany({
      where: whereClause,
      select: {
        id: true,
        usuarioId: true,
        oabNumero: true,
        oabUf: true,
        especialidades: true,
        bio: true,
        telefone: true,
        whatsapp: true,
        comissaoPadrao: true,
        comissaoAcaoGanha: true,
        comissaoHonorarios: true,
        isExterno: true,
        // Dados profissionais adicionais
        formacao: true,
        experiencia: true,
        premios: true,
        publicacoes: true,
        website: true,
        linkedin: true,
        twitter: true,
        instagram: true,
        // Configurações de notificação
        notificarEmail: true,
        notificarWhatsapp: true,
        notificarSistema: true,
        // Configurações de acesso
        podeCriarProcessos: true,
        podeEditarProcessos: true,
        podeExcluirProcessos: true,
        podeGerenciarClientes: true,
        podeAcessarFinanceiro: true,
        usuario: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            avatarUrl: true,
            active: true,
            role: true,
            cpf: true,
            rg: true,
            dataNascimento: true,
            observacoes: true,
          },
        },
      },
      orderBy: {
        usuario: {
          firstName: "asc",
        },
      },
    });

    // Calcular processosCount para cada advogado
    const advogadosComProcessos = await Promise.all(
      advogados.map(async (adv) => {
        let processosCount: number;

        if (adv.isExterno) {
          // Para advogados externos, contar processos onde aparecem como partes OU em procurações
          const [processosParte, processosProcuracao] = await Promise.all([
            // Processos onde aparece como parte
            prisma.processoParte.count({
              where: {
                tenantId: session.user.tenantId,
                advogadoId: adv.id,
                processo: {
                  deletedAt: null,
                },
              },
            }),
            // Processos onde aparece em procurações (ativas ou revogadas)
            prisma.procuracaoProcesso.count({
              where: {
                tenantId: session.user.tenantId,
                procuracao: {
                  outorgados: {
                    some: {
                      advogadoId: adv.id,
                    },
                  },
                },
                processo: {
                  deletedAt: null,
                },
              },
            }),
          ]);

          processosCount = processosParte + processosProcuracao;
        } else {
          // Para advogados internos, contar processos onde são responsáveis
          processosCount = await prisma.processo.count({
            where: {
              tenantId: session.user.tenantId,
              deletedAt: null,
              advogadoResponsavelId: adv.id,
            },
          });
        }

        return {
          id: adv.id,
          usuarioId: adv.usuarioId,
          oabNumero: adv.oabNumero,
          oabUf: adv.oabUf,
          especialidades: adv.especialidades as EspecialidadeJuridica[],
          bio: adv.bio,
          telefone: adv.telefone,
          whatsapp: adv.whatsapp,
          comissaoPadrao: parseFloat(adv.comissaoPadrao.toString()),
          comissaoAcaoGanha: parseFloat(adv.comissaoAcaoGanha.toString()),
          comissaoHonorarios: parseFloat(adv.comissaoHonorarios.toString()),
          isExterno: adv.isExterno,
          // Dados profissionais adicionais
          formacao: adv.formacao,
          experiencia: adv.experiencia,
          premios: adv.premios,
          publicacoes: adv.publicacoes,
          website: adv.website,
          linkedin: adv.linkedin,
          twitter: adv.twitter,
          instagram: adv.instagram,
          // Configurações de notificação
          notificarEmail: adv.notificarEmail,
          notificarWhatsapp: adv.notificarWhatsapp,
          notificarSistema: adv.notificarSistema,
          // Configurações de acesso
          podeCriarProcessos: adv.podeCriarProcessos,
          podeEditarProcessos: adv.podeEditarProcessos,
          podeExcluirProcessos: adv.podeExcluirProcessos,
          podeGerenciarClientes: adv.podeGerenciarClientes,
          podeAcessarFinanceiro: adv.podeAcessarFinanceiro,
          processosCount: processosCount,
          usuario: {
            ...adv.usuario,
            dataNascimento: adv.usuario.dataNascimento
              ? adv.usuario.dataNascimento.toISOString().split("T")[0]
              : null,
          },
        };
      }),
    );

    return { success: true, advogados: advogadosComProcessos } as any;
  } catch (error) {
    console.error("Erro ao buscar advogados:", error);

    return { success: false, error: "Erro ao buscar advogados" };
  }
}

export async function createAdvogado(
  input: CreateAdvogadoInput,
): Promise<CreateAdvogadoResponse> {
  try {
    const session = await getSession();

    if (!session?.user?.tenantId) {
      return { success: false, error: "Usuário não autenticado" };
    }

    // Verificar se o usuário tem permissão para criar advogados
    if (session.user.role !== "ADMIN") {
      return {
        success: false,
        error: "Apenas administradores podem criar advogados",
      };
    }

    // Verificar se o email já existe no tenant
    const existingUser = await prisma.usuario.findFirst({
      where: {
        email: input.email,
        tenantId: session.user.tenantId,
      },
    });

    if (existingUser) {
      return {
        success: false,
        error: "Já existe um usuário com este email no escritório",
      };
    }

    // Verificar se a OAB já existe no tenant (se fornecida)
    if (input.oabNumero && input.oabUf) {
      const existingOAB = await prisma.advogado.findFirst({
        where: {
          oabNumero: input.oabNumero,
          oabUf: input.oabUf,
          tenantId: session.user.tenantId,
        },
      });

      if (existingOAB) {
        return {
          success: false,
          error: "Já existe um advogado com esta OAB no escritório",
        };
      }
    }

    // Preparar dados complementares do usuário
    const sanitizedCpf = input.cpf ? input.cpf.replace(/\D/g, "") : null;
    const dataNascimento = input.dataNascimento
      ? new Date(`${input.dataNascimento}T00:00:00`)
      : null;
    const usuarioPayload = {
      tenantId: session.user.tenantId,
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone || null,
      cpf: sanitizedCpf,
      rg: input.rg || null,
      dataNascimento,
      observacoes: input.observacoes || null,
      role: "ADVOGADO" as const,
      createdById: session.user.id,
    };

    let tenantNome: string | null = null;
    let credenciaisAcesso:
      | {
          email: string;
          maskedEmail: string;
          envioSolicitado: boolean;
          primeiroAcessoEnviado: boolean;
          erroEnvio?: string;
        }
      | undefined;
    let usuario: any;

    if (input.criarAcessoUsuario && !input.isExterno) {
      usuario = await prisma.usuario.create({
        data: {
          ...usuarioPayload,
          passwordHash: null,
          active: true,
          phone: input.phone || null,
        },
      });
      credenciaisAcesso = {
        email: input.email,
        maskedEmail: maskEmail(input.email),
        envioSolicitado: Boolean(input.enviarEmailCredenciais),
        primeiroAcessoEnviado: false,
      };
    } else {
      usuario = await prisma.usuario.create({
        data: {
          ...usuarioPayload,
          active: false, // Inativo se não tem acesso
        },
      });
    }

    // Criar advogado
    const advogado = await prisma.advogado.create({
      data: {
        tenantId: session.user.tenantId,
        usuarioId: usuario.id,
        oabNumero: input.oabNumero,
        oabUf: input.oabUf,
        especialidades: input.especialidades || [],
        bio: input.bio,
        telefone: input.telefone,
        whatsapp: input.whatsapp,
        comissaoPadrao: input.comissaoPadrao || 0,
        comissaoAcaoGanha: input.comissaoAcaoGanha || 0,
        comissaoHonorarios: input.comissaoHonorarios || 0,
        isExterno: input.isExterno || false,

        // Dados profissionais adicionais
        formacao: input.formacao,
        experiencia: input.experiencia,
        premios: input.premios,
        publicacoes: input.publicacoes,
        website: input.website,
        linkedin: input.linkedin,
        twitter: input.twitter,
        instagram: input.instagram,

        // Configurações de notificação
        notificarEmail: input.notificarEmail ?? true,
        notificarWhatsapp: input.notificarWhatsapp ?? true,
        notificarSistema: input.notificarSistema ?? true,

        // Configurações de acesso
        podeCriarProcessos: input.podeCriarProcessos ?? true,
        podeEditarProcessos: input.podeEditarProcessos ?? true,
        podeExcluirProcessos: input.podeExcluirProcessos ?? false,
        podeGerenciarClientes: input.podeGerenciarClientes ?? true,
        podeAcessarFinanceiro: input.podeAcessarFinanceiro ?? false,
      },
      select: {
        id: true,
        usuarioId: true,
        oabNumero: true,
        oabUf: true,
        especialidades: true,
        bio: true,
        telefone: true,
        whatsapp: true,
        comissaoPadrao: true,
        comissaoAcaoGanha: true,
        comissaoHonorarios: true,
        isExterno: true,
        usuario: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            avatarUrl: true,
            active: true,
            role: true,
            cpf: true,
            rg: true,
            dataNascimento: true,
            observacoes: true,
          },
        },
      },
    });

    const enderecosParaCriar =
      input.enderecos && input.enderecos.length > 0
        ? input.enderecos
        : input.endereco
          ? [input.endereco]
          : [];

    for (const endereco of enderecosParaCriar) {
      if (
        !endereco.logradouro?.trim() ||
        !endereco.cidade?.trim() ||
        !endereco.estado?.trim()
      ) {
        continue;
      }

      await prisma.endereco.create({
        data: {
          tenantId: session.user.tenantId,
          usuarioId: usuario.id,
          apelido: endereco.apelido,
          tipo: endereco.tipo as any,
          principal: endereco.principal,
          logradouro: endereco.logradouro,
          numero: endereco.numero,
          complemento: endereco.complemento,
          bairro: endereco.bairro,
          cidade: endereco.cidade,
          estado: endereco.estado,
          cep: endereco.cep,
          pais: endereco.pais || "Brasil",
          telefone: endereco.telefone,
          observacoes: endereco.observacoes,
        },
      });
    }

    if (input.dadosBancarios && input.dadosBancarios.length > 0) {
      for (const dado of input.dadosBancarios) {
        if (
          !dado.bancoCodigo ||
          !dado.agencia ||
          !dado.conta ||
          !dado.titularNome ||
          !dado.titularDocumento
        ) {
          continue;
        }

        if (dado.principal) {
          await prisma.dadosBancarios.updateMany({
            where: {
              tenantId: session.user.tenantId,
              usuarioId: usuario.id,
              principal: true,
            },
            data: {
              principal: false,
            },
          });
        }

        await prisma.dadosBancarios.create({
          data: {
            tenantId: session.user.tenantId,
            usuarioId: usuario.id,
            tipoConta: dado.tipoConta as any,
            bancoCodigo: dado.bancoCodigo,
            agencia: dado.agencia,
            conta: dado.conta,
            digitoConta: dado.digitoConta,
            tipoContaBancaria: dado.tipoContaBancaria as any,
            chavePix: dado.chavePix,
            tipoChavePix: dado.tipoChavePix as any,
            titularNome: dado.titularNome,
            titularDocumento: dado.titularDocumento,
            titularEmail: dado.titularEmail,
            titularTelefone: dado.titularTelefone,
            endereco: dado.endereco,
            cidade: dado.cidade,
            estado: dado.estado,
            cep: dado.cep,
            principal: dado.principal ?? false,
            observacoes: dado.observacoes,
          },
        });
      }
    }

    const data: AdvogadoData = {
      id: advogado.id,
      usuarioId: advogado.usuarioId,
      oabNumero: advogado.oabNumero,
      oabUf: advogado.oabUf,
      especialidades: advogado.especialidades as EspecialidadeJuridica[],
      bio: advogado.bio,
      telefone: advogado.telefone,
      whatsapp: advogado.whatsapp,
      comissaoPadrao: parseFloat(advogado.comissaoPadrao.toString()),
      comissaoAcaoGanha: parseFloat(advogado.comissaoAcaoGanha.toString()),
      comissaoHonorarios: parseFloat(advogado.comissaoHonorarios.toString()),
      isExterno: advogado.isExterno,
      processosCount: 0,
      usuario: {
        ...advogado.usuario,
        dataNascimento: advogado.usuario.dataNascimento
          ? advogado.usuario.dataNascimento.toISOString().split("T")[0]
          : null,
      },
    };

    // Registrar no histórico
    await createAdvogadoHistorico({
      advogadoId: advogado.id,
      acao: "CREATE",
      detalhes: `Advogado criado: ${usuario.firstName} ${usuario.lastName} (${usuario.email})`,
    });

    if (credenciaisAcesso && input.enviarEmailCredenciais) {
      if (!tenantNome) {
        const tenant = await prisma.tenant.findUnique({
          where: { id: session.user.tenantId },
          select: { name: true },
        });
        tenantNome = tenant?.name ?? "Magic Lawyer";
      }

      const nomeCompleto = `${input.firstName || ""} ${input.lastName || ""}`.trim();
      const envioPrimeiroAcesso = await enviarEmailPrimeiroAcesso({
        userId: usuario.id,
        tenantId: session.user.tenantId,
        email: input.email,
        nome: nomeCompleto || undefined,
        tenantNome: tenantNome || "Magic Lawyer",
      });

      credenciaisAcesso = {
        ...credenciaisAcesso,
        primeiroAcessoEnviado: envioPrimeiroAcesso.success,
        erroEnvio: envioPrimeiroAcesso.success
          ? undefined
          : envioPrimeiroAcesso.error ||
            "Não foi possível enviar o e-mail de primeiro acesso.",
      };
    }

    revalidatePath("/advogados");

    return {
      success: true,
      data: data,
      credenciais: credenciaisAcesso,
    } as any;
  } catch (error) {
    console.error("Erro ao criar advogado:", error);

    return { success: false, error: "Erro ao criar advogado" };
  }
}

export async function getAdvogado(
  advogadoId: string,
): Promise<ActionResponse<AdvogadoData>> {
  try {
    const session = await getSession();

    if (!session?.user?.tenantId) {
      return { success: false, error: "Usuário não autenticado" };
    }

    const advogado = await prisma.advogado.findFirst({
      where: {
        id: advogadoId,
        tenantId: session.user.tenantId,
      },
      include: {
        usuario: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            avatarUrl: true,
            active: true,
            role: true,
          },
        },
      },
    });

    if (!advogado) {
      return { success: false, error: "Advogado não encontrado" };
    }

    const data: AdvogadoData = {
      id: advogado.id,
      usuarioId: advogado.usuarioId,
      oabNumero: advogado.oabNumero,
      oabUf: advogado.oabUf,
      especialidades: advogado.especialidades as EspecialidadeJuridica[],
      bio: advogado.bio,
      telefone: advogado.telefone,
      whatsapp: advogado.whatsapp,
      comissaoPadrao: parseFloat(advogado.comissaoPadrao.toString()),
      comissaoAcaoGanha: parseFloat(advogado.comissaoAcaoGanha.toString()),
      comissaoHonorarios: parseFloat(advogado.comissaoHonorarios.toString()),
      usuario: advogado.usuario,
    };

    return { success: true, data };
  } catch (error) {
    console.error("Erro ao buscar advogado:", error);

    return { success: false, error: "Erro ao buscar advogado" };
  }
}

export async function getCurrentUserAdvogado(): Promise<
  ActionResponse<AdvogadoData>
> {
  try {
    const session = await getSession();

    if (!session?.user?.id || !session?.user?.tenantId) {
      return { success: false, error: "Usuário não autenticado" };
    }

    const advogado = await prisma.advogado.findFirst({
      where: {
        usuarioId: session.user.id,
        tenantId: session.user.tenantId,
      },
      include: {
        usuario: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            avatarUrl: true,
            active: true,
            role: true,
          },
        },
      },
    });

    if (!advogado) {
      return { success: false, error: "Dados de advogado não encontrados" };
    }

    const data: AdvogadoData = {
      id: advogado.id,
      usuarioId: advogado.usuarioId,
      oabNumero: advogado.oabNumero,
      oabUf: advogado.oabUf,
      especialidades: advogado.especialidades as EspecialidadeJuridica[],
      bio: advogado.bio,
      telefone: advogado.telefone,
      whatsapp: advogado.whatsapp,
      comissaoPadrao: parseFloat(advogado.comissaoPadrao.toString()),
      comissaoAcaoGanha: parseFloat(advogado.comissaoAcaoGanha.toString()),
      comissaoHonorarios: parseFloat(advogado.comissaoHonorarios.toString()),
      usuario: advogado.usuario,
    };

    return { success: true, data };
  } catch (error) {
    console.error("Erro ao buscar dados do advogado:", error);

    return { success: false, error: "Erro ao buscar dados do advogado" };
  }
}

export async function updateAdvogado(
  advogadoId: string,
  input: UpdateAdvogadoInput,
): Promise<ActionResponse> {
  try {
    const session = await getSession();

    if (!session?.user?.tenantId) {
      return { success: false, error: "Usuário não autenticado" };
    }

    const advogado = await prisma.advogado.findFirst({
      where: {
        id: advogadoId,
        tenantId: session.user.tenantId,
      },
    });

    if (!advogado) {
      return { success: false, error: "Advogado não encontrado" };
    }

    // Atualizar dados do usuário se fornecido
    const usuarioUpdate: any = {};

    if (input.firstName !== undefined)
      usuarioUpdate.firstName = input.firstName;
    if (input.lastName !== undefined) usuarioUpdate.lastName = input.lastName;
    if (input.phone !== undefined) usuarioUpdate.phone = input.phone || null;
    if (input.cpf !== undefined)
      usuarioUpdate.cpf = input.cpf ? input.cpf.replace(/\D/g, "") : null;
    if (input.rg !== undefined) usuarioUpdate.rg = input.rg || null;
    if (input.dataNascimento !== undefined) {
      usuarioUpdate.dataNascimento = input.dataNascimento
        ? new Date(`${input.dataNascimento}T00:00:00`)
        : null;
    }
    if (input.observacoes !== undefined)
      usuarioUpdate.observacoes = input.observacoes || null;

    if (Object.keys(usuarioUpdate).length > 0) {
      await prisma.usuario.update({
        where: { id: advogado.usuarioId },
        data: usuarioUpdate,
      });
    }

    // Atualizar dados do advogado
    const advogadoUpdate: any = {};

    if (input.oabNumero !== undefined)
      advogadoUpdate.oabNumero = input.oabNumero;
    if (input.oabUf !== undefined) advogadoUpdate.oabUf = input.oabUf;
    if (input.especialidades !== undefined)
      advogadoUpdate.especialidades = input.especialidades;
    if (input.bio !== undefined) advogadoUpdate.bio = input.bio;
    if (input.telefone !== undefined) advogadoUpdate.telefone = input.telefone;
    if (input.whatsapp !== undefined) advogadoUpdate.whatsapp = input.whatsapp;
    if (input.comissaoPadrao !== undefined)
      advogadoUpdate.comissaoPadrao = input.comissaoPadrao;
    if (input.comissaoAcaoGanha !== undefined)
      advogadoUpdate.comissaoAcaoGanha = input.comissaoAcaoGanha;
    if (input.comissaoHonorarios !== undefined)
      advogadoUpdate.comissaoHonorarios = input.comissaoHonorarios;
    if (input.formacao !== undefined) advogadoUpdate.formacao = input.formacao;
    if (input.experiencia !== undefined)
      advogadoUpdate.experiencia = input.experiencia;
    if (input.premios !== undefined) advogadoUpdate.premios = input.premios;
    if (input.publicacoes !== undefined)
      advogadoUpdate.publicacoes = input.publicacoes;
    if (input.website !== undefined) advogadoUpdate.website = input.website;
    if (input.linkedin !== undefined) advogadoUpdate.linkedin = input.linkedin;
    if (input.twitter !== undefined) advogadoUpdate.twitter = input.twitter;
    if (input.instagram !== undefined)
      advogadoUpdate.instagram = input.instagram;
    if (input.notificarEmail !== undefined)
      advogadoUpdate.notificarEmail = input.notificarEmail;
    if (input.notificarWhatsapp !== undefined)
      advogadoUpdate.notificarWhatsapp = input.notificarWhatsapp;
    if (input.notificarSistema !== undefined)
      advogadoUpdate.notificarSistema = input.notificarSistema;
    if (input.podeCriarProcessos !== undefined)
      advogadoUpdate.podeCriarProcessos = input.podeCriarProcessos;
    if (input.podeEditarProcessos !== undefined)
      advogadoUpdate.podeEditarProcessos = input.podeEditarProcessos;
    if (input.podeExcluirProcessos !== undefined)
      advogadoUpdate.podeExcluirProcessos = input.podeExcluirProcessos;
    if (input.podeGerenciarClientes !== undefined)
      advogadoUpdate.podeGerenciarClientes = input.podeGerenciarClientes;
    if (input.podeAcessarFinanceiro !== undefined)
      advogadoUpdate.podeAcessarFinanceiro = input.podeAcessarFinanceiro;

    if (Object.keys(advogadoUpdate).length > 0) {
      await prisma.advogado.update({
        where: { id: advogadoId },
        data: advogadoUpdate,
      });
    }

    // Registrar alterações no histórico
    const alteracoes: string[] = [];

    // Registrar alterações do usuário
    if (input.firstName !== undefined)
      alteracoes.push(`Nome: ${input.firstName}`);
    if (input.lastName !== undefined)
      alteracoes.push(`Sobrenome: ${input.lastName}`);
    if (input.phone !== undefined)
      alteracoes.push(`Telefone: ${input.phone || "removido"}`);
    if (input.cpf !== undefined)
      alteracoes.push(`CPF: ${input.cpf || "removido"}`);
    if (input.rg !== undefined)
      alteracoes.push(`RG: ${input.rg || "removido"}`);
    if (input.dataNascimento !== undefined)
      alteracoes.push(
        `Data de nascimento: ${input.dataNascimento || "removida"}`,
      );
    if (input.observacoes !== undefined)
      alteracoes.push(
        `Observações: ${(input.observacoes || "").slice(0, 50)}${input.observacoes && input.observacoes.length > 50 ? "..." : ""}`,
      );

    // Registrar alterações do advogado
    if (input.oabNumero !== undefined)
      alteracoes.push(`OAB Número: ${input.oabNumero}`);
    if (input.oabUf !== undefined) alteracoes.push(`OAB UF: ${input.oabUf}`);
    if (input.especialidades !== undefined)
      alteracoes.push(`Especialidades: ${input.especialidades.join(", ")}`);
    if (input.bio !== undefined) {
      const preview = input.bio
        ? input.bio.length > 50
          ? `${input.bio.slice(0, 50)}...`
          : input.bio
        : "removida";

      alteracoes.push(`Bio: ${preview}`);
    }
    if (input.telefone !== undefined)
      alteracoes.push(`Telefone: ${input.telefone}`);
    if (input.whatsapp !== undefined)
      alteracoes.push(`WhatsApp: ${input.whatsapp}`);
    if (input.comissaoPadrao !== undefined)
      alteracoes.push(`Comissão Padrão: ${input.comissaoPadrao}%`);
    if (input.comissaoAcaoGanha !== undefined)
      alteracoes.push(`Comissão Ação Ganha: ${input.comissaoAcaoGanha}%`);
    if (input.comissaoHonorarios !== undefined)
      alteracoes.push(`Comissão Honorários: ${input.comissaoHonorarios}%`);
    if (input.formacao !== undefined)
      alteracoes.push(
        `Formação: ${(input.formacao || "").slice(0, 50)}${input.formacao && input.formacao.length > 50 ? "..." : ""}`,
      );
    if (input.experiencia !== undefined)
      alteracoes.push(
        `Experiência: ${(input.experiencia || "").slice(0, 50)}${input.experiencia && input.experiencia.length > 50 ? "..." : ""}`,
      );
    if (input.premios !== undefined)
      alteracoes.push(
        `Prêmios: ${(input.premios || "").slice(0, 50)}${input.premios && input.premios.length > 50 ? "..." : ""}`,
      );
    if (input.publicacoes !== undefined)
      alteracoes.push(
        `Publicações: ${(input.publicacoes || "").slice(0, 50)}${input.publicacoes && input.publicacoes.length > 50 ? "..." : ""}`,
      );
    if (input.website !== undefined)
      alteracoes.push(`Website: ${input.website || "removido"}`);
    if (input.linkedin !== undefined)
      alteracoes.push(`LinkedIn: ${input.linkedin || "removido"}`);
    if (input.twitter !== undefined)
      alteracoes.push(`Twitter: ${input.twitter || "removido"}`);
    if (input.instagram !== undefined)
      alteracoes.push(`Instagram: ${input.instagram || "removido"}`);
    if (input.notificarEmail !== undefined)
      alteracoes.push(
        `Notificar por email: ${input.notificarEmail ? "sim" : "não"}`,
      );
    if (input.notificarWhatsapp !== undefined)
      alteracoes.push(
        `Notificar por WhatsApp: ${input.notificarWhatsapp ? "sim" : "não"}`,
      );
    if (input.notificarSistema !== undefined)
      alteracoes.push(
        `Notificar no sistema: ${input.notificarSistema ? "sim" : "não"}`,
      );
    if (input.podeCriarProcessos !== undefined)
      alteracoes.push(
        `Pode criar processos: ${input.podeCriarProcessos ? "sim" : "não"}`,
      );
    if (input.podeEditarProcessos !== undefined)
      alteracoes.push(
        `Pode editar processos: ${input.podeEditarProcessos ? "sim" : "não"}`,
      );
    if (input.podeExcluirProcessos !== undefined)
      alteracoes.push(
        `Pode excluir processos: ${input.podeExcluirProcessos ? "sim" : "não"}`,
      );
    if (input.podeGerenciarClientes !== undefined)
      alteracoes.push(
        `Pode gerenciar clientes: ${input.podeGerenciarClientes ? "sim" : "não"}`,
      );
    if (input.podeAcessarFinanceiro !== undefined)
      alteracoes.push(
        `Pode acessar financeiro: ${input.podeAcessarFinanceiro ? "sim" : "não"}`,
      );

    if (alteracoes.length > 0) {
      await createAdvogadoHistorico({
        advogadoId,
        acao: "UPDATE",
        detalhes: `Alterações: ${alteracoes.join(", ")}`,
      });
    }

    revalidatePath("/advogados");
    revalidatePath("/usuario/perfil/editar");

    return { success: true };
  } catch (error) {
    console.error("Erro ao atualizar advogado:", error);

    return { success: false, error: "Erro ao atualizar advogado" };
  }
}

export async function deleteAdvogado(
  advogadoId: string,
): Promise<ActionResponse> {
  try {
    const session = await getSession();

    if (!session?.user?.tenantId) {
      return { success: false, error: "Usuário não autenticado" };
    }

    // Verificar se o usuário tem permissão para deletar advogados
    if (session.user.role !== "ADMIN") {
      return {
        success: false,
        error: "Apenas administradores podem deletar advogados",
      };
    }

    const advogado = await prisma.advogado.findFirst({
      where: {
        id: advogadoId,
        tenantId: session.user.tenantId,
      },
      include: {
        usuario: true,
      },
    });

    if (!advogado) {
      return { success: false, error: "Advogado não encontrado" };
    }

    // Verificar se o advogado não é o próprio usuário logado
    if (advogado.usuarioId === session.user.id) {
      return {
        success: false,
        error: "Você não pode deletar seu próprio perfil",
      };
    }

    // Verificar se o advogado tem processos vinculados
    const processosCount = await prisma.processo.count({
      where: {
        advogadoResponsavelId: advogadoId,
        tenantId: session.user.tenantId,
      },
    });

    if (processosCount > 0) {
      return {
        success: false,
        error: `Não é possível deletar o advogado pois ele está vinculado a ${processosCount} processo(s). Desvincule os processos primeiro.`,
      };
    }

    // Verificar se o advogado tem contratos vinculados
    const contratosCount = await prisma.contrato.count({
      where: {
        advogadoResponsavelId: advogadoId,
        tenantId: session.user.tenantId,
      },
    });

    if (contratosCount > 0) {
      return {
        success: false,
        error: `Não é possível deletar o advogado pois ele está vinculado a ${contratosCount} contrato(s). Desvincule os contratos primeiro.`,
      };
    }

    // Registrar no histórico antes de deletar
    await createAdvogadoHistorico({
      advogadoId,
      acao: "DELETE",
      detalhes: `Advogado deletado: ${advogado.usuario.firstName} ${advogado.usuario.lastName} (${advogado.usuario.email})`,
    });

    // Soft-delete operacional: desativa o usuário e preserva o vínculo do advogado
    await prisma.usuario.update({
      where: { id: advogado.usuarioId },
      data: {
        active: false,
        statusChangedAt: new Date(),
        statusReason: "ADVOGADO_REMOVIDO_LOGICAMENTE",
      },
    });

    revalidatePath("/advogados");

    return { success: true };
  } catch (error) {
    console.error("Erro ao deletar advogado:", error);

    return { success: false, error: "Erro ao deletar advogado" };
  }
}

export async function updateCurrentUserAdvogado(
  input: UpdateAdvogadoInput,
): Promise<ActionResponse> {
  try {
    const session = await getSession();

    if (!session?.user?.id || !session?.user?.tenantId) {
      return { success: false, error: "Usuário não autenticado" };
    }

    const advogado = await prisma.advogado.findFirst({
      where: {
        usuarioId: session.user.id,
        tenantId: session.user.tenantId,
      },
    });

    if (!advogado) {
      return { success: false, error: "Dados de advogado não encontrados" };
    }

    return updateAdvogado(advogado.id, input);
  } catch (error) {
    console.error("Erro ao atualizar dados do advogado:", error);

    return { success: false, error: "Erro ao atualizar dados do advogado" };
  }
}

export async function getAdvogadosDisponiveis(): Promise<
  ActionResponse<AdvogadoSelectItem[]>
> {
  try {
    const session = await getSession();

    if (!session?.user?.tenantId) {
      return { success: false, error: "Usuário não autenticado" };
    }

    const advogados = await prisma.advogado.findMany({
      where: {
        tenantId: session.user.tenantId,
        usuario: {
          active: true,
        },
      },
      include: {
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
    });

    const data: AdvogadoSelectItem[] = advogados.map((adv) => ({
      id: adv.id,
      value: adv.id,
      label:
        `${adv.usuario.firstName || ""} ${adv.usuario.lastName || ""}`.trim() ||
        "Sem nome",
      oab: adv.oabNumero && adv.oabUf ? `${adv.oabUf} ${adv.oabNumero}` : null,
      oabNumero: adv.oabNumero,
      oabUf: adv.oabUf,
      usuario: {
        firstName: adv.usuario.firstName,
        lastName: adv.usuario.lastName,
        email: adv.usuario.email,
      },
    }));

    return { success: true, advogados: data } as any;
  } catch (error) {
    console.error("Erro ao buscar advogados disponíveis:", error);

    return { success: false, error: "Erro ao buscar advogados disponíveis" };
  }
}

// =============================================
// ADVOGADOS EXTERNOS IDENTIFICADOS
// =============================================

export interface AdvogadoExternoIdentificado {
  id: string;
  nome: string;
  oabNumero: string | null;
  oabUf: string | null;
  email: string | null;
  telefone: string | null;
  processosCount: number;
  primeiroProcesso: Date | null;
  ultimoProcesso: Date | null;
  processos: {
    id: string;
    numero: string;
    cliente: string;
    dataIdentificacao: Date;
  }[];
}

export async function getAdvogadosExternosIdentificados(): Promise<
  ActionResponse<AdvogadoExternoIdentificado[]>
> {
  try {
    const session = await getSession();

    if (!session?.user?.tenantId) {
      return { success: false, error: "Usuário não autenticado" };
    }

    // Buscar advogados que aparecem em ProcessoParte mas não são do escritório atual
    // Inclui: 1) Advogados de outros tenants OU 2) Advogados do mesmo tenant marcados como externos
    const advogadosExternos = await prisma.processoParte.findMany({
      where: {
        tenantId: session.user.tenantId,
        advogadoId: {
          not: null,
        },
        OR: [
          // Advogados de outros tenants
          {
            advogado: {
              tenantId: {
                not: session.user.tenantId,
              },
            },
          },
          // Advogados do mesmo tenant marcados como externos
          {
            advogado: {
              tenantId: session.user.tenantId,
              isExterno: true,
            },
          },
        ],
      },
      include: {
        advogado: {
          include: {
            usuario: {
              select: {
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
              },
            },
          },
        },
        processo: {
          select: {
            id: true,
            numero: true,
            cliente: {
              select: {
                nome: true,
              },
            },
            createdAt: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // Agrupar por advogado e contar processos
    const agrupados = new Map<
      string,
      {
        advogado: any;
        processos: any[];
        processosCount: number;
        primeiroProcesso: Date | null;
        ultimoProcesso: Date | null;
      }
    >();

    for (const parte of advogadosExternos) {
      const advogadoId = parte.advogadoId!;

      if (!agrupados.has(advogadoId)) {
        agrupados.set(advogadoId, {
          advogado: parte.advogado,
          processos: [],
          processosCount: 0,
          primeiroProcesso: null,
          ultimoProcesso: null,
        });
      }

      const grupo = agrupados.get(advogadoId)!;

      grupo.processos.push({
        id: parte.processo.id,
        numero: parte.processo.numero,
        cliente: parte.processo.cliente.nome,
        dataIdentificacao: parte.createdAt,
      });
      grupo.processosCount++;

      if (!grupo.primeiroProcesso || parte.createdAt < grupo.primeiroProcesso) {
        grupo.primeiroProcesso = parte.createdAt;
      }
      if (!grupo.ultimoProcesso || parte.createdAt > grupo.ultimoProcesso) {
        grupo.ultimoProcesso = parte.createdAt;
      }
    }

    // Converter para formato final
    const resultado: AdvogadoExternoIdentificado[] = Array.from(
      agrupados.values(),
    ).map((grupo) => ({
      id: grupo.advogado.id,
      nome:
        `${grupo.advogado.usuario?.firstName || ""} ${grupo.advogado.usuario?.lastName || ""}`.trim() ||
        "Nome não informado",
      oabNumero: grupo.advogado.oabNumero,
      oabUf: grupo.advogado.oabUf,
      email: grupo.advogado.usuario?.email || null,
      telefone: grupo.advogado.usuario?.phone || null,
      processosCount: grupo.processosCount,
      primeiroProcesso: grupo.primeiroProcesso,
      ultimoProcesso: grupo.ultimoProcesso,
      processos: grupo.processos,
    }));

    return { success: true, data: resultado };
  } catch (error) {
    console.error("Erro ao buscar advogados externos identificados:", error);

    return {
      success: false,
      error: "Erro ao buscar advogados externos identificados",
    };
  }
}

// =============================================
// FUNÇÃO COMBINADA PARA BUSCAR TODOS OS ADVOGADOS
// =============================================

export async function getAllAdvogadosComExternos(): Promise<
  ActionResponse<AdvogadoData[]>
> {
  try {
    // Agora que o campo isExterno está no schema, podemos usar apenas getAdvogados
    return await getAdvogados();
  } catch (error) {
    console.error("Erro ao buscar todos os advogados:", error);

    return { success: false, error: "Erro ao buscar todos os advogados" };
  }
}

export async function uploadAvatarAdvogado(
  advogadoId: string,
  file: File,
): Promise<ActionResponse<{ url: string }>> {
  try {
    const session = await getSession();

    if (!session?.user?.tenantId) {
      return { success: false, error: "Usuário não autenticado" };
    }

    // Verificar se o advogado existe e pertence ao tenant
    const advogado = await prisma.advogado.findFirst({
      where: {
        id: advogadoId,
        tenantId: session.user.tenantId,
      },
      include: {
        usuario: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
          },
        },
      },
    });

    if (!advogado) {
      return { success: false, error: "Advogado não encontrado" };
    }

    // Verificar se o usuário tem permissão para alterar o avatar
    if (
      session.user.role !== "ADMIN" &&
      advogado.usuarioId !== session.user.id
    ) {
      return {
        success: false,
        error: "Você não tem permissão para alterar este avatar",
      };
    }

    // Validar tipo de arquivo
    if (!file.type.startsWith("image/")) {
      return {
        success: false,
        error: "Apenas arquivos de imagem são permitidos",
      };
    }

    // Validar tamanho do arquivo (máximo 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return {
        success: false,
        error: "Arquivo muito grande. Máximo permitido: 5MB",
      };
    }

    // Converter File para Buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Obter tenant slug
    const tenant = await prisma.tenant.findUnique({
      where: { id: session.user.tenantId },
      select: { slug: true },
    });

    if (!tenant) {
      return { success: false, error: "Tenant não encontrado" };
    }

    // Deletar avatar anterior se existir
    if (advogado.usuario.avatarUrl) {
      const uploadService = UploadService.getInstance();

      await uploadService.deleteAvatar(
        advogado.usuario.avatarUrl,
        advogado.usuario.id,
      );
    }

    // Fazer upload do novo avatar
    const uploadService = UploadService.getInstance();
    const uploadResult = await uploadService.uploadAvatar(
      buffer,
      advogado.usuario.id,
      file.name,
      tenant.slug,
      `${advogado.usuario.firstName} ${advogado.usuario.lastName}`.trim(),
    );

    if (!uploadResult.success || !uploadResult.url) {
      return {
        success: false,
        error: uploadResult.error || "Erro ao fazer upload do avatar",
      };
    }

    // Atualizar URL do avatar no banco
    await prisma.usuario.update({
      where: { id: advogado.usuario.id },
      data: { avatarUrl: uploadResult.url },
    });

    // Registrar no histórico
    await createAdvogadoHistorico({
      advogadoId,
      acao: "UPLOAD_AVATAR",
      campo: "avatarUrl",
      valorAnterior: advogado.usuario.avatarUrl || "null",
      valorNovo: uploadResult.url,
      detalhes: "Avatar do advogado atualizado",
    });

    revalidatePath("/advogados");
    revalidatePath("/usuario/perfil/editar");

    return { success: true, url: uploadResult.url } as any;
  } catch (error) {
    console.error("Erro ao fazer upload do avatar:", error);

    return { success: false, error: "Erro ao fazer upload do avatar" };
  }
}

export async function deleteAvatarAdvogado(
  advogadoId: string,
): Promise<ActionResponse> {
  try {
    const session = await getSession();

    if (!session?.user?.tenantId) {
      return { success: false, error: "Usuário não autenticado" };
    }

    // Verificar se o advogado existe e pertence ao tenant
    const advogado = await prisma.advogado.findFirst({
      where: {
        id: advogadoId,
        tenantId: session.user.tenantId,
      },
      include: {
        usuario: {
          select: {
            id: true,
            avatarUrl: true,
          },
        },
      },
    });

    if (!advogado) {
      return { success: false, error: "Advogado não encontrado" };
    }

    // Verificar se o usuário tem permissão para deletar o avatar
    if (
      session.user.role !== "ADMIN" &&
      advogado.usuarioId !== session.user.id
    ) {
      return {
        success: false,
        error: "Você não tem permissão para deletar este avatar",
      };
    }

    if (!advogado.usuario.avatarUrl) {
      return { success: false, error: "Avatar não encontrado" };
    }

    // Deletar avatar do Cloudinary
    const uploadService = UploadService.getInstance();
    const deleteResult = await uploadService.deleteAvatar(
      advogado.usuario.avatarUrl,
      advogado.usuario.id,
    );

    if (!deleteResult.success) {
      return {
        success: false,
        error: deleteResult.error || "Erro ao deletar avatar",
      };
    }

    // Remover URL do avatar do banco
    await prisma.usuario.update({
      where: { id: advogado.usuario.id },
      data: { avatarUrl: null },
    });

    // Registrar no histórico
    await createAdvogadoHistorico({
      advogadoId,
      acao: "DELETE_AVATAR",
      campo: "avatarUrl",
      valorAnterior: advogado.usuario.avatarUrl || "null",
      valorNovo: "null",
      detalhes: "Avatar do advogado removido",
    });

    revalidatePath("/advogados");
    revalidatePath("/usuario/perfil/editar");

    return { success: true };
  } catch (error) {
    console.error("Erro ao deletar avatar:", error);

    return { success: false, error: "Erro ao deletar avatar" };
  }
}

export async function convertAdvogadoExternoToInterno(
  advogadoId: string,
): Promise<ActionResponse> {
  try {
    const session = await getSession();

    if (!session?.user?.tenantId) {
      return { success: false, error: "Usuário não autenticado" };
    }

    // Verificar se o usuário tem permissão para converter advogados
    if (session.user.role !== "ADMIN") {
      return {
        success: false,
        error:
          "Apenas administradores podem converter advogados externos em internos",
      };
    }

    const advogado = await prisma.advogado.findFirst({
      where: {
        id: advogadoId,
        tenantId: session.user.tenantId,
        isExterno: true, // Apenas advogados externos podem ser convertidos
      },
    });

    if (!advogado) {
      return { success: false, error: "Advogado externo não encontrado" };
    }

    // Converter para interno
    await prisma.advogado.update({
      where: { id: advogadoId },
      data: { isExterno: false },
    });

    // Registrar no histórico
    await createAdvogadoHistorico({
      advogadoId,
      acao: "CONVERT_EXTERNAL_TO_INTERNAL",
      campo: "isExterno",
      valorAnterior: "true",
      valorNovo: "false",
      detalhes: "Advogado externo convertido para interno",
    });

    revalidatePath("/advogados");

    return { success: true };
  } catch (error) {
    console.error("Erro ao converter advogado externo em interno:", error);

    return { success: false, error: "Erro ao converter advogado" };
  }
}

// Alias para compatibilidade
export const getAdvogadosDoTenant = getAllAdvogadosComExternos;

/**
 * Busca advogados para usar em selects (apenas internos e ativos)
 */
export async function getAdvogadoById(
  advogadoId: string,
): Promise<ActionResponse<AdvogadoData>> {
  try {
    const session = await getSession();

    if (!session?.user?.tenantId) {
      return { success: false, error: "Usuário não autenticado" };
    }

    const advogado = await prisma.advogado.findFirst({
      where: {
        id: advogadoId,
        tenantId: session.user.tenantId,
      },
      select: {
        id: true,
        usuarioId: true,
        oabNumero: true,
        oabUf: true,
        especialidades: true,
        bio: true,
        telefone: true,
        whatsapp: true,
        comissaoPadrao: true,
        comissaoAcaoGanha: true,
        comissaoHonorarios: true,
        isExterno: true,
        usuario: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            avatarUrl: true,
            active: true,
            role: true,
            createdAt: true,
          },
        },
      },
    });

    if (!advogado) {
      return { success: false, error: "Advogado não encontrado" };
    }

    const data: AdvogadoData = {
      id: advogado.id,
      usuarioId: advogado.usuarioId,
      oabNumero: advogado.oabNumero,
      oabUf: advogado.oabUf,
      especialidades: advogado.especialidades as EspecialidadeJuridica[],
      bio: advogado.bio,
      telefone: advogado.telefone,
      whatsapp: advogado.whatsapp,
      comissaoPadrao: parseFloat(advogado.comissaoPadrao.toString()),
      comissaoAcaoGanha: parseFloat(advogado.comissaoAcaoGanha.toString()),
      comissaoHonorarios: parseFloat(advogado.comissaoHonorarios.toString()),
      isExterno: advogado.isExterno,
      processosCount: 0,
      usuario: advogado.usuario,
    };

    return { success: true, data: data };
  } catch (error) {
    console.error("Erro ao buscar advogado por ID:", error);

    return { success: false, error: "Erro ao buscar advogado" };
  }
}

export async function getAdvogadoPerfilById(
  advogadoId: string,
): Promise<ActionResponse<AdvogadoProfileData>> {
  try {
    const session = await getSession();

    if (!session?.user?.tenantId) {
      return { success: false, error: "Usuário não autenticado" };
    }

    const baseAdvogado = await prisma.advogado.findFirst({
      where: {
        id: advogadoId,
        tenantId: session.user.tenantId,
      },
      select: {
        id: true,
        usuarioId: true,
        oabNumero: true,
        oabUf: true,
        especialidades: true,
        bio: true,
        telefone: true,
        whatsapp: true,
        comissaoPadrao: true,
        comissaoAcaoGanha: true,
        comissaoHonorarios: true,
        isExterno: true,
        formacao: true,
        experiencia: true,
        premios: true,
        publicacoes: true,
        website: true,
        linkedin: true,
        twitter: true,
        instagram: true,
        notificarEmail: true,
        notificarWhatsapp: true,
        notificarSistema: true,
        podeCriarProcessos: true,
        podeEditarProcessos: true,
        podeExcluirProcessos: true,
        podeGerenciarClientes: true,
        podeAcessarFinanceiro: true,
        usuario: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            avatarUrl: true,
            active: true,
            role: true,
            cpf: true,
            rg: true,
            dataNascimento: true,
            observacoes: true,
            createdAt: true,
          },
        },
      },
    });

    if (!baseAdvogado) {
      return { success: false, error: "Advogado não encontrado" };
    }

    const [
      clientesRaw,
      processosResponsavelRaw,
      processosParteRaw,
      contratosRaw,
      procuracoesRaw,
      eventosRaw,
      tarefasRaw,
      assinaturasRaw,
    ] = await Promise.all([
      prisma.advogadoCliente.findMany({
        where: {
          tenantId: session.user.tenantId,
          advogadoId,
        },
        orderBy: {
          createdAt: "desc",
        },
        select: {
          id: true,
          relacionamento: true,
          createdAt: true,
          cliente: {
            select: {
              id: true,
              nome: true,
              tipoPessoa: true,
              documento: true,
              email: true,
              telefone: true,
            },
          },
        },
      }),
      prisma.processo.findMany({
        where: {
          tenantId: session.user.tenantId,
          advogadoResponsavelId: advogadoId,
          deletedAt: null,
        },
        orderBy: {
          createdAt: "desc",
        },
        select: {
          id: true,
          numero: true,
          numeroCnj: true,
          titulo: true,
          status: true,
          fase: true,
          grau: true,
          dataDistribuicao: true,
          prazoPrincipal: true,
          createdAt: true,
          area: {
            select: {
              id: true,
              nome: true,
            },
          },
          cliente: {
            select: {
              id: true,
              nome: true,
              tipoPessoa: true,
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
                },
              },
            },
          },
          _count: {
            select: {
              documentos: true,
              eventos: true,
              movimentacoes: true,
              tarefas: true,
            },
          },
        },
      }),
      prisma.processoParte.findMany({
        where: {
          tenantId: session.user.tenantId,
          advogadoId,
          processo: {
            deletedAt: null,
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        select: {
          processo: {
            select: {
              id: true,
              numero: true,
              numeroCnj: true,
              titulo: true,
              status: true,
              fase: true,
              grau: true,
              dataDistribuicao: true,
              prazoPrincipal: true,
              createdAt: true,
              area: {
                select: {
                  id: true,
                  nome: true,
                },
              },
              cliente: {
                select: {
                  id: true,
                  nome: true,
                  tipoPessoa: true,
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
                    },
                  },
                },
              },
              _count: {
                select: {
                  documentos: true,
                  eventos: true,
                  movimentacoes: true,
                  tarefas: true,
                },
              },
            },
          },
        },
      }),
      prisma.contrato.findMany({
        where: {
          tenantId: session.user.tenantId,
          advogadoResponsavelId: advogadoId,
          deletedAt: null,
        },
        orderBy: {
          createdAt: "desc",
        },
        select: {
          id: true,
          titulo: true,
          status: true,
          valor: true,
          dataInicio: true,
          dataAssinatura: true,
          cliente: {
            select: {
              id: true,
              nome: true,
            },
          },
          processo: {
            select: {
              id: true,
              numero: true,
            },
          },
          tipo: {
            select: {
              id: true,
              nome: true,
            },
          },
          _count: {
            select: {
              documentos: true,
              faturas: true,
              honorarios: true,
              parcelas: true,
            },
          },
        },
      }),
      prisma.procuracaoAdvogado.findMany({
        where: {
          tenantId: session.user.tenantId,
          advogadoId,
        },
        orderBy: {
          createdAt: "desc",
        },
        include: {
          procuracao: {
            select: {
              id: true,
              numero: true,
              ativa: true,
              status: true,
              emitidaEm: true,
              validaAte: true,
              arquivoUrl: true,
              cliente: {
                select: {
                  id: true,
                  nome: true,
                  documento: true,
                },
              },
              _count: {
                select: {
                  poderes: true,
                  documentos: true,
                  assinaturas: true,
                  processos: true,
                },
              },
              outorgados: {
                select: {
                  advogado: {
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
                },
              },
              processos: {
                select: {
                  processo: {
                    select: {
                      id: true,
                      numero: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),
      prisma.evento.findMany({
        where: {
          tenantId: session.user.tenantId,
          advogadoResponsavelId: advogadoId,
        },
        orderBy: {
          dataInicio: "desc",
        },
        select: {
          id: true,
          titulo: true,
          status: true,
          tipo: true,
          dataInicio: true,
          dataFim: true,
          local: true,
          cliente: {
            select: {
              id: true,
              nome: true,
            },
          },
          processo: {
            select: {
              id: true,
              numero: true,
            },
          },
        },
      }),
      prisma.tarefa.findMany({
        where: {
          tenantId: session.user.tenantId,
          responsavelId: baseAdvogado.usuarioId,
          deletedAt: null,
        },
        orderBy: {
          createdAt: "desc",
        },
        select: {
          id: true,
          titulo: true,
          status: true,
          prioridade: true,
          dataInicio: true,
          dataLimite: true,
          createdAt: true,
          cliente: {
            select: {
              id: true,
              nome: true,
            },
          },
          processo: {
            select: {
              id: true,
              numero: true,
            },
          },
        },
      }),
      prisma.documentoAssinatura.findMany({
        where: {
          tenantId: session.user.tenantId,
          advogadoResponsavelId: advogadoId,
        },
        orderBy: {
          createdAt: "desc",
        },
        select: {
          id: true,
          titulo: true,
          status: true,
          dataEnvio: true,
          dataAssinatura: true,
          dataExpiracao: true,
          urlDocumento: true,
          urlAssinado: true,
          documento: {
            select: {
              id: true,
              nome: true,
            },
          },
          processo: {
            select: {
              id: true,
              numero: true,
            },
          },
          cliente: {
            select: {
              id: true,
              nome: true,
            },
          },
        },
      }),
    ]);

    const base = convertAllDecimalFields({
      id: baseAdvogado.id,
      usuarioId: baseAdvogado.usuarioId,
      oabNumero: baseAdvogado.oabNumero,
      oabUf: baseAdvogado.oabUf,
      especialidades: baseAdvogado.especialidades,
      bio: baseAdvogado.bio,
      telefone: baseAdvogado.telefone,
      whatsapp: baseAdvogado.whatsapp,
      comissaoPadrao: Number(baseAdvogado.comissaoPadrao || 0),
      comissaoAcaoGanha: Number(baseAdvogado.comissaoAcaoGanha || 0),
      comissaoHonorarios: Number(baseAdvogado.comissaoHonorarios || 0),
      isExterno: baseAdvogado.isExterno,
      processosCount: 0,
      formacao: baseAdvogado.formacao,
      experiencia: baseAdvogado.experiencia,
      premios: baseAdvogado.premios,
      publicacoes: baseAdvogado.publicacoes,
      website: baseAdvogado.website,
      linkedin: baseAdvogado.linkedin,
      twitter: baseAdvogado.twitter,
      instagram: baseAdvogado.instagram,
      notificarEmail: baseAdvogado.notificarEmail,
      notificarWhatsapp: baseAdvogado.notificarWhatsapp,
      notificarSistema: baseAdvogado.notificarSistema,
      podeCriarProcessos: baseAdvogado.podeCriarProcessos,
      podeEditarProcessos: baseAdvogado.podeEditarProcessos,
      podeExcluirProcessos: baseAdvogado.podeExcluirProcessos,
      podeGerenciarClientes: baseAdvogado.podeGerenciarClientes,
      podeAcessarFinanceiro: baseAdvogado.podeAcessarFinanceiro,
      usuario: baseAdvogado.usuario,
    }) as Omit<
      AdvogadoData,
      "especialidades"
    > & {
      id: string;
      usuarioId: string;
      oabNumero: string | null;
      oabUf: string | null;
      especialidades: EspecialidadeJuridica[];
      usuario: {
        id: string;
        firstName: string | null;
        lastName: string | null;
        email: string;
        phone: string | null;
        avatarUrl: string | null;
        active: boolean;
        role: string;
        cpf?: string | null;
        rg?: string | null;
        dataNascimento?: string | null;
        observacoes?: string | null;
        createdAt?: Date | string;
      };
    };

    const processosMap = new Map<string, AdvogadoProfileData["processos"][number]>();

    for (const processo of processosResponsavelRaw) {
      processosMap.set(
        processo.id,
        buildProcessoCardData({
          ...processo,
          participacao: "Responsavel",
        }),
      );
    }

    for (const item of processosParteRaw) {
      const processo = item.processo;

      if (!processo) {
        continue;
      }

      const existent = processosMap.get(processo.id);

      if (existent) {
        existent.participacao = "Parte";
      } else {
        processosMap.set(
          processo.id,
          buildProcessoCardData({
            ...processo,
            participacao: "Parte",
          }),
        );
      }
    }

    const processos = Array.from(processosMap.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    const procuracoes = procuracoesRaw
      .map((item) => item.procuracao)
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .map((procuracao) => ({
        ...procuracao,
        outorgados: procuracao.outorgados.map((item) => ({
          advogado: item.advogado,
        })),
        processos: procuracao.processos
          .map((item) => item.processo)
          .filter((processo): processo is NonNullable<typeof processo> => Boolean(processo))
          .map((processo) => ({
            processo: {
              id: processo.id,
              numero: processo.numero,
            },
          })),
      }));

    const data: AdvogadoProfileData = {
      ...base,
      clientesVinculados: clientesRaw.map((item) => ({
        ...item,
        cliente: convertAllDecimalFields(item.cliente),
        createdAt: item.createdAt.toISOString(),
      })),
      processos: processos as AdvogadoProfileData["processos"],
      contratos: contratosRaw as AdvogadoProfileData["contratos"],
      procuracoes: procuracoes as AdvogadoProfileData["procuracoes"],
      eventos: eventosRaw.map((evento) => ({
        ...evento,
        dataInicio: evento.dataInicio.toISOString(),
        dataFim: evento.dataFim.toISOString(),
      })),
      tarefas: tarefasRaw.map((tarefa) => ({
        ...tarefa,
        dataInicio: tarefa.dataInicio ? tarefa.dataInicio.toISOString() : null,
        dataLimite: tarefa.dataLimite ? tarefa.dataLimite.toISOString() : null,
        createdAt: tarefa.createdAt.toISOString(),
      })),
      documentoAssinaturas: assinaturasRaw as AdvogadoProfileData["documentoAssinaturas"],
    };

    return {
      success: true,
      data: convertAllDecimalFields(data),
    };
  } catch (error) {
    console.error("Erro ao buscar perfil completo do advogado:", error);

    return {
      success: false,
      error: "Erro ao buscar perfil completo do advogado",
    };
  }
}

export async function getAdvogadosParaSelect(): Promise<
  ActionResponse<AdvogadoSelectItem[]>
> {
  try {
    const session = await getSession();

    if (!session?.user?.tenantId) {
      return { success: false, error: "Usuário não autenticado" };
    }

    const advogados = await prisma.advogado.findMany({
      where: {
        tenantId: session.user.tenantId,
        isExterno: false, // Apenas advogados internos
        usuario: {
          active: true, // Apenas usuários ativos
        },
      },
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
      orderBy: {
        usuario: {
          firstName: "asc",
        },
      },
    });

    const data: AdvogadoSelectItem[] = advogados.map((adv) => ({
      id: adv.id,
      value: adv.id,
      label:
        `${adv.usuario?.firstName || ""} ${adv.usuario?.lastName || ""}`.trim() ||
        adv.usuario?.email ||
        "Advogado",
      oab: adv.oabNumero && adv.oabUf ? `${adv.oabNumero}/${adv.oabUf}` : null,
      oabNumero: adv.oabNumero,
      oabUf: adv.oabUf,
      usuario: adv.usuario,
    }));

    return { success: true, data };
  } catch (error) {
    console.error("Erro ao buscar advogados para select:", error);

    return { success: false, error: "Erro ao buscar advogados" };
  }
}
export type Advogado = AdvogadoData;

// Interface estendida para incluir endereços e dados bancários
export interface AdvogadoCompleto extends AdvogadoData {
  enderecos?: EnderecoInput[];
  dadosBancarios?: DadosBancariosInput[];
}

// Função para buscar advogado com endereços e dados bancários
export async function getAdvogadoCompleto(
  advogadoId: string,
): Promise<ActionResponse<AdvogadoCompleto>> {
  try {
    const session = await getSession();

    if (!session?.user?.tenantId) {
      return { success: false, error: "Usuário não autenticado" };
    }

    const advogado = await prisma.advogado.findFirst({
      where: {
        id: advogadoId,
        tenantId: session.user.tenantId,
      },
      include: {
        usuario: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            avatarUrl: true,
            active: true,
            role: true,
            cpf: true,
            rg: true,
            dataNascimento: true,
            observacoes: true,
            enderecos: true,
            dadosBancarios: true,
          },
        },
      },
    });

    if (!advogado) {
      return { success: false, error: "Advogado não encontrado" };
    }

    const data: AdvogadoCompleto = {
      id: advogado.id,
      usuarioId: advogado.usuarioId,
      oabNumero: advogado.oabNumero,
      oabUf: advogado.oabUf,
      especialidades: advogado.especialidades as EspecialidadeJuridica[],
      bio: advogado.bio,
      telefone: advogado.telefone,
      whatsapp: advogado.whatsapp,
      comissaoPadrao: parseFloat(advogado.comissaoPadrao.toString()),
      comissaoAcaoGanha: parseFloat(advogado.comissaoAcaoGanha.toString()),
      comissaoHonorarios: parseFloat(advogado.comissaoHonorarios.toString()),
      isExterno: advogado.isExterno,
      processosCount: 0,

      // Dados profissionais adicionais
      formacao: advogado.formacao,
      experiencia: advogado.experiencia,
      premios: advogado.premios,
      publicacoes: advogado.publicacoes,
      website: advogado.website,
      linkedin: advogado.linkedin,
      twitter: advogado.twitter,
      instagram: advogado.instagram,

      // Configurações de notificação
      notificarEmail: advogado.notificarEmail,
      notificarWhatsapp: advogado.notificarWhatsapp,
      notificarSistema: advogado.notificarSistema,

      // Configurações de acesso
      podeCriarProcessos: advogado.podeCriarProcessos,
      podeEditarProcessos: advogado.podeEditarProcessos,
      podeExcluirProcessos: advogado.podeExcluirProcessos,
      podeGerenciarClientes: advogado.podeGerenciarClientes,
      podeAcessarFinanceiro: advogado.podeAcessarFinanceiro,

      usuario: {
        id: advogado.usuario.id,
        firstName: advogado.usuario.firstName,
        lastName: advogado.usuario.lastName,
        email: advogado.usuario.email,
        phone: advogado.usuario.phone,
        avatarUrl: advogado.usuario.avatarUrl,
        active: advogado.usuario.active,
        role: advogado.usuario.role,
        cpf: advogado.usuario.cpf,
        rg: advogado.usuario.rg,
        dataNascimento: advogado.usuario.dataNascimento
          ? advogado.usuario.dataNascimento.toISOString().split("T")[0]
          : null,
        observacoes: advogado.usuario.observacoes,
      },
      enderecos: advogado.usuario.enderecos?.map((endereco) => ({
        apelido: endereco.apelido,
        tipo: endereco.tipo,
        principal: endereco.principal,
        logradouro: endereco.logradouro,
        numero: endereco.numero || undefined,
        complemento: endereco.complemento || undefined,
        bairro: endereco.bairro || undefined,
        cidade: endereco.cidade,
        estado: endereco.estado,
        cep: endereco.cep || undefined,
        pais: endereco.pais,
        telefone: endereco.telefone || undefined,
        observacoes: endereco.observacoes || undefined,
      })),
      dadosBancarios: advogado.usuario.dadosBancarios?.map((conta) => ({
        tipoConta: conta.tipoConta,
        bancoCodigo: conta.bancoCodigo,
        agencia: conta.agencia,
        conta: conta.conta,
        digitoConta: conta.digitoConta || undefined,
        tipoContaBancaria: conta.tipoContaBancaria,
        chavePix: conta.chavePix || undefined,
        tipoChavePix: conta.tipoChavePix
          ? (conta.tipoChavePix as
              | "CPF"
              | "CNPJ"
              | "EMAIL"
              | "TELEFONE"
              | "ALEATORIA")
          : undefined,
        titularNome: conta.titularNome,
        titularDocumento: conta.titularDocumento,
        titularEmail: conta.titularEmail || undefined,
        titularTelefone: conta.titularTelefone || undefined,
        endereco: conta.endereco || undefined,
        cidade: conta.cidade || undefined,
        estado: conta.estado || undefined,
        cep: conta.cep || undefined,
        principal: conta.principal,
        observacoes: conta.observacoes || undefined,
      })),
    };

    return { success: true, data };
  } catch (error) {
    console.error("Erro ao buscar advogado completo:", error);

    return { success: false, error: "Erro ao buscar advogado" };
  }
}
