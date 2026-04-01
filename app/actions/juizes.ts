"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";

import { getSession } from "@/app/lib/auth";
import prisma, { convertAllDecimalFields } from "@/app/lib/prisma";
import {
  buildAuthorityPendingMetadata,
  getAuthorityPendingTaskMap,
  reassignAuthorityPendingTask,
  syncAuthorityPendingTaskForAuthority,
  type AuthorityPendingMetadata,
  type AuthorityPendingResponsibleSummary,
} from "@/app/lib/juizes/authority-profile-pendency";
import logger from "@/lib/logger";
import {
  AutoridadeNivelAcesso,
  AutoridadeOrigemContribuicao,
  AutoridadeOrigemUnlock,
  AutoridadeStatusContribuicao,
  AutoridadeStatusUnlock,
  Prisma,
  JuizStatus,
  JuizNivel,
  JuizTipoAutoridade,
  EspecialidadeJuridica,
} from "@/generated/prisma";
import { checkPermission } from "@/app/actions/equipe";
import { getAccessibleAdvogadoIds } from "@/app/lib/advogado-access";

// ============================================
// TYPES
// ============================================

export interface JuizDetalhado {
  id: string;
  tipoAutoridade: JuizTipoAutoridade;
  nome: string;
  nomeCompleto: string | null;
  cpf: string | null;
  oab: string | null;
  email: string | null;
  telefone: string | null;
  endereco: string | null;
  cidade: string | null;
  estado: string | null;
  cep: string | null;
  dataNascimento: Date | null;
  dataPosse: Date | null;
  dataAposentadoria: Date | null;
  status: JuizStatus;
  nivel: JuizNivel;
  especialidades: EspecialidadeJuridica[];
  vara: string | null;
  comarca: string | null;
  biografia: string | null;
  formacao: string | null;
  experiencia: string | null;
  premios: string | null;
  publicacoes: string | null;
  foto: string | null;
  website: string | null;
  linkedin: string | null;
  twitter: string | null;
  instagram: string | null;
  observacoes: string | null;
  isPublico: boolean;
  isPremium: boolean;
  precoAcesso: number | null;
  tribunalId: string | null;
  tribunal?: {
    id: string;
    nome: string;
    sigla: string | null;
    esfera: string | null;
    uf: string | null;
    siteUrl: string | null;
  } | null;
  _count?: {
    processos: number;
    julgamentos: number;
    analises: number;
    favoritos: number;
  };
  cadastroCompleto?: boolean;
  camposPendentes?: string[];
  tarefaPendenciaId?: string | null;
  responsavelPendencia?: AuthorityPendingResponsibleSummary | null;
}

export interface ProcessoJuiz {
  id: string;
  numero: string;
  numeroCnj: string | null;
  titulo: string | null;
  status: string;
  fase: string | null;
  grau: string | null;
  valorCausa: number | null;
  dataDistribuicao: Date | null;
  createdAt: Date;
  cliente: {
    id: string;
    nome: string;
    tipoPessoa: string;
  };
  area?: {
    id: string;
    nome: string;
  } | null;
}

export interface JulgamentoJuiz {
  id: string;
  titulo: string;
  descricao: string | null;
  dataJulgamento: Date;
  tipoJulgamento: string;
  resultado: string | null;
  valorCausa: number | null;
  valorCondenacao: number | null;
  observacoes: string | null;
  pontosPositivos: string[];
  pontosNegativos: string[];
  estrategias: string[];
  recomendacoes: string[];
  tags: string[];
  isPublico: boolean;
  processo?: {
    id: string;
    numero: string;
    titulo: string | null;
  } | null;
}

export interface ProcessoVinculoAutoridade {
  id: string;
  numero: string;
  titulo: string | null;
  status: string;
  juizId: string | null;
  clienteNome: string;
  advogadoResponsavelNome: string | null;
}

export interface JuizSerializado {
  id: string;
  tipoAutoridade: JuizTipoAutoridade;
  nome: string;
  nomeCompleto: string | null;
  cpf: string | null;
  oab: string | null;
  email: string | null;
  telefone: string | null;
  endereco: string | null;
  cidade: string | null;
  estado: string | null;
  cep: string | null;
  dataNascimento: Date | null;
  dataPosse: Date | null;
  dataAposentadoria: Date | null;
  status: JuizStatus;
  nivel: JuizNivel;
  especialidades: EspecialidadeJuridica[];
  vara: string | null;
  comarca: string | null;
  biografia: string | null;
  formacao: string | null;
  experiencia: string | null;
  premios: string | null;
  publicacoes: string | null;
  foto: string | null;
  website: string | null;
  linkedin: string | null;
  twitter: string | null;
  instagram: string | null;
  observacoes: string | null;
  isPublico: boolean;
  isPremium: boolean;
  precoAcesso: number | null;
  tribunalId: string | null;
  tribunal?: {
    id: string;
    nome: string;
    sigla: string | null;
    esfera: string | null;
    uf: string | null;
    siteUrl: string | null;
  } | null;
  _count?: {
    processos: number;
    julgamentos: number;
    analises: number;
    favoritos: number;
  };
  cadastroCompleto?: boolean;
  camposPendentes?: string[];
  tarefaPendenciaId?: string | null;
  responsavelPendencia?: AuthorityPendingResponsibleSummary | null;
}

export interface JuizAdminDetalhesProcesso {
  id: string;
  tenantId: string;
  tenantNome: string;
  tenantSlug: string;
  numero: string;
  numeroCnj: string | null;
  titulo: string | null;
  status: string;
  fase: string | null;
  grau: string | null;
  valorCausa: number | null;
  dataDistribuicao: string | null;
  updatedAt: string;
  areaNome: string | null;
  clientePrincipal: string;
  clientesRelacionados: string[];
}

export interface JuizAdminDetalhesPacote {
  id: string;
  nome: string;
  descricao: string | null;
  preco: number;
  moeda: string;
  status: string;
  isPublico: boolean;
  ordemExibicao: number;
  totalAssinaturas: number;
  tenantsAtivos: number;
  ativoNoPacote: boolean;
}

export interface JuizAdminDetalhesTenantUnlock {
  id: string;
  tenantId: string;
  tenantNome: string;
  tenantSlug: string;
  tenantStatus: string;
  nivelAcesso: string;
  origem: string;
  status: string;
  dataInicio: string;
  dataFim: string | null;
  observacoes: string | null;
  assinaturaPacoteId: string | null;
  assinaturaStatus: string | null;
  pacoteId: string | null;
  pacoteNome: string | null;
  precoPago: number | null;
}

export interface JuizAdminDetalhesContribuicao {
  id: string;
  tenantId: string;
  tenantNome: string;
  tenantSlug: string;
  origem: string;
  status: string;
  campos: string[];
  notaConfianca: number | null;
  observacoes: string | null;
  criadoEm: string;
  aprovadoEm: string | null;
  criadoPorNome: string;
  criadoPorEmail: string;
  aprovadoPorNome: string | null;
}

export interface JuizAdminDetalhesJulgamento {
  id: string;
  tenantId: string;
  tenantNome: string;
  titulo: string;
  tipoJulgamento: string;
  resultado: string | null;
  dataJulgamento: string;
  processoNumero: string | null;
}

export interface JuizAdminDetalhesAnalise {
  id: string;
  tenantId: string;
  tenantNome: string;
  titulo: string;
  tipoAnalise: string;
  isPublico: boolean;
  createdAt: string;
}

export interface JuizAdminDetalhesTenantRelacionamento {
  tenantId: string;
  tenantNome: string;
  tenantSlug: string;
  tenantStatus: string;
  possuiAcesso: boolean;
  niveisAcesso: string[];
  pacotes: string[];
  totalContribuicoes: number;
  totalProcessos: number;
  totalJulgamentos: number;
  totalAnalises: number;
}

export interface JuizAdminDetalhesSerializado extends JuizSerializado {
  superAdminCriador: {
    id: string;
    nome: string;
    email: string;
  } | null;
  origemCadastro: "SUPER_ADMIN" | "TENANT" | "INDEFINIDA";
  primeiroTenantContribuinte: {
    id: string;
    nome: string;
    slug: string;
    criadoEm: string;
  } | null;
  resumoRelacionamentos: {
    processos: number;
    julgamentos: number;
    analises: number;
    favoritos: number;
    pacotes: number;
    tenantsComAcesso: number;
    contribuicoes: number;
    acessosRegistrados: number;
    tenantsRelacionados: number;
  };
  processosRecentes: JuizAdminDetalhesProcesso[];
  pacotesRelacionados: JuizAdminDetalhesPacote[];
  tenantsComAcesso: JuizAdminDetalhesTenantUnlock[];
  tenantsRelacionadosDetalhados: JuizAdminDetalhesTenantRelacionamento[];
  contribuicoesRecentes: JuizAdminDetalhesContribuicao[];
  julgamentosRecentes: JuizAdminDetalhesJulgamento[];
  analisesRecentes: JuizAdminDetalhesAnalise[];
}

export interface JuizFormData {
  tipoAutoridade: JuizTipoAutoridade;
  nome: string;
  nomeCompleto?: string;
  cpf?: string;
  oab?: string;
  email?: string;
  telefone?: string;
  endereco?: string;
  cidade?: string;
  estado?: string;
  cep?: string;
  dataNascimento?: Date;
  dataPosse?: Date;
  dataAposentadoria?: Date;
  status: JuizStatus;
  nivel: JuizNivel;
  especialidades: EspecialidadeJuridica[];
  vara?: string;
  comarca?: string;
  biografia?: string;
  formacao?: string;
  experiencia?: string;
  premios?: string;
  publicacoes?: string;
  foto?: string;
  website?: string;
  linkedin?: string;
  twitter?: string;
  instagram?: string;
  observacoes?: string;
  tribunalId?: string;
}

export interface JuizFilters {
  search?: string;
  status?: JuizStatus;
  nivel?: JuizNivel;
  tipoAutoridade?: JuizTipoAutoridade;
  especialidades?: EspecialidadeJuridica[];
  tribunalId?: string;
  comarca?: string;
  vara?: string;
}

export interface JuizFormOptions {
  tiposAutoridade: JuizTipoAutoridade[];
  especialidades: EspecialidadeJuridica[];
  status: JuizStatus[];
  niveis: JuizNivel[];
  tribunais: Array<{
    id: string;
    nome: string;
    sigla: string | null;
    esfera: string | null;
    uf: string | null;
  }>;
  usuariosResponsaveis?: Array<{
    id: string;
    nome: string;
    role: string;
  }>;
}

export interface JuizCatalogoOpcao {
  id: string;
  nome: string;
  tipoAutoridade?: JuizTipoAutoridade;
  vara?: string | null;
  comarca?: string | null;
}

const TENANT_JUDGE_ACCESS_TYPE = "TENANT_ACCESS";
const TENANT_JUDGE_PROFILE_TYPE = "TENANT_PROFILE";
const TENANT_JUDGE_ACCESS_REVOKED_TYPE = "TENANT_ACCESS_REVOKED";

type JuizTenantOverlay = Partial<
  Pick<
    JuizSerializado,
    | "nome"
    | "tipoAutoridade"
    | "nomeCompleto"
    | "cpf"
    | "oab"
    | "email"
    | "telefone"
    | "endereco"
    | "cidade"
    | "estado"
    | "cep"
    | "status"
    | "nivel"
    | "especialidades"
    | "vara"
    | "comarca"
    | "biografia"
    | "formacao"
    | "experiencia"
    | "premios"
    | "publicacoes"
    | "foto"
    | "website"
    | "linkedin"
    | "twitter"
    | "instagram"
    | "observacoes"
    | "tribunalId"
  >
> & {
  dataNascimento?: string | null;
  dataPosse?: string | null;
  dataAposentadoria?: string | null;
};

function canManageJudgeByRole(role?: string) {
  return role === "ADMIN" || role === "SUPER_ADMIN" || role === "ADVOGADO";
}

async function hasJudgePermission(
  action: "visualizar" | "criar" | "editar" | "excluir",
) {
  return checkPermission("advogados", action).catch(() => false);
}

async function hasProcessPermission(action: "visualizar" | "editar") {
  return checkPermission("processos", action).catch(() => false);
}

async function getClienteIdFromSession(session: {
  user: any;
}): Promise<string | null> {
  if (!session?.user?.id || !session?.user?.tenantId) {
    return null;
  }

  const cliente = await prisma.cliente.findFirst({
    where: {
      usuarioId: session.user.id,
      tenantId: session.user.tenantId,
      deletedAt: null,
    },
    select: { id: true },
  });

  return cliente?.id ?? null;
}

async function buildProcessosVisiveisWhere(
  session: { user: any },
  options?: {
    processoIds?: string[];
  },
): Promise<Prisma.ProcessoWhereInput> {
  const user = session.user as any;

  const baseWhere: Prisma.ProcessoWhereInput = {
    tenantId: user.tenantId,
    deletedAt: null,
    ...(options?.processoIds?.length
      ? {
          id: {
            in: options.processoIds,
          },
        }
      : {}),
  };

  const clienteId = await getClienteIdFromSession(session);
  const isAdmin = user.role === "ADMIN" || user.role === "SUPER_ADMIN";
  const accessibleAdvogados = await getAccessibleAdvogadoIds(session);

  if (clienteId) {
    return {
      ...baseWhere,
      clienteId,
    };
  }

  if (!isAdmin && accessibleAdvogados.length > 0) {
    const orConditions: Prisma.ProcessoWhereInput[] = [
      {
        advogadoResponsavelId: {
          in: accessibleAdvogados,
        },
      },
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

    if (user.role === "ADVOGADO") {
      orConditions.push({
        cliente: {
          usuario: {
            createdById: user.id,
          },
        },
      });
    }

    return {
      ...baseWhere,
      OR: orConditions,
    };
  }

  return baseWhere;
}

async function logProcessoAutoridadeBatchAudit(params: {
  tenantId: string;
  usuarioId?: string | null;
  acao: "VINCULAR_AUTORIDADE_LOTE" | "DESVINCULAR_AUTORIDADE_LOTE";
  juizId: string;
  processoIds: string[];
  afetados: number;
  ignorados: number;
}) {
  try {
    const processoIdsLimitados = params.processoIds.slice(0, 500);

    await prisma.auditLog.create({
      data: {
        tenantId: params.tenantId,
        usuarioId: params.usuarioId || null,
        acao: params.acao,
        entidade: "PROCESSO",
        entidadeId: params.juizId,
        changedFields: ["juizId"],
        dados: {
          juizId: params.juizId,
          totalSelecionados: params.processoIds.length,
          totalAfetados: params.afetados,
          totalIgnorados: params.ignorados,
          processoIds: processoIdsLimitados,
          processoIdsTruncados: params.processoIds.length > processoIdsLimitados.length,
        },
      },
    });
  } catch (error) {
    logger.warn("Falha ao registrar auditoria de vínculo em lote de autoridade", {
      error,
      tenantId: params.tenantId,
      juizId: params.juizId,
      acao: params.acao,
    });
  }
}

function buildJuizAccessWhere(tenantId: string): Prisma.JuizWhereInput {
  const now = new Date();

  return {
    OR: [
      {
        processos: {
          some: {
            tenantId,
          },
        },
      },
      {
        julgamentos: {
          some: {
            tenantId,
          },
        },
      },
      {
        analises: {
          some: {
            tenantId,
          },
        },
      },
      {
        favoritos: {
          some: {
            tenantId,
            ativo: true,
          },
        },
      },
      {
        acessos: {
          some: {
            tenantId,
            tipoAcesso: TENANT_JUDGE_ACCESS_TYPE,
          },
        },
      },
      {
        tenantUnlocks: {
          some: {
            tenantId,
            status: AutoridadeStatusUnlock.ATIVO,
            OR: [{ dataFim: null }, { dataFim: { gt: now } }],
          },
        },
      },
    ],
  };
}

function buildJuizSearchWhere(search?: string): Prisma.JuizWhereInput | null {
  if (!search?.trim()) {
    return null;
  }

  return {
    OR: [
      { nome: { contains: search, mode: "insensitive" } },
      { nomeCompleto: { contains: search, mode: "insensitive" } },
      { comarca: { contains: search, mode: "insensitive" } },
      { vara: { contains: search, mode: "insensitive" } },
    ],
  };
}

function parseTenantOverlay(observacoes: string | null): JuizTenantOverlay | null {
  if (!observacoes) {
    return null;
  }

  try {
    const parsed = JSON.parse(observacoes) as JuizTenantOverlay;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function buildTenantOverlayFromData(data: Partial<JuizFormData>): JuizTenantOverlay {
  const overlay: JuizTenantOverlay = {};

  if (data.nome !== undefined) {
    const normalizedName = data.nome.trim();
    if (normalizedName) {
      overlay.nome = normalizedName;
    }
  }
  if (data.tipoAutoridade !== undefined) overlay.tipoAutoridade = data.tipoAutoridade;
  if (data.nomeCompleto !== undefined) overlay.nomeCompleto = data.nomeCompleto || null;
  if (data.cpf !== undefined) overlay.cpf = data.cpf || null;
  if (data.oab !== undefined) overlay.oab = data.oab || null;
  if (data.email !== undefined) overlay.email = data.email || null;
  if (data.telefone !== undefined) overlay.telefone = data.telefone || null;
  if (data.endereco !== undefined) overlay.endereco = data.endereco || null;
  if (data.cidade !== undefined) overlay.cidade = data.cidade || null;
  if (data.estado !== undefined) overlay.estado = data.estado || null;
  if (data.cep !== undefined) overlay.cep = data.cep || null;
  if (data.dataNascimento !== undefined) {
    overlay.dataNascimento = data.dataNascimento
      ? new Date(data.dataNascimento).toISOString()
      : null;
  }
  if (data.dataPosse !== undefined) {
    overlay.dataPosse = data.dataPosse ? new Date(data.dataPosse).toISOString() : null;
  }
  if (data.dataAposentadoria !== undefined) {
    overlay.dataAposentadoria = data.dataAposentadoria
      ? new Date(data.dataAposentadoria).toISOString()
      : null;
  }
  if (data.status !== undefined) overlay.status = data.status;
  if (data.nivel !== undefined) overlay.nivel = data.nivel;
  if (data.especialidades !== undefined) overlay.especialidades = data.especialidades;
  if (data.vara !== undefined) overlay.vara = data.vara || null;
  if (data.comarca !== undefined) overlay.comarca = data.comarca || null;
  if (data.biografia !== undefined) overlay.biografia = data.biografia || null;
  if (data.formacao !== undefined) overlay.formacao = data.formacao || null;
  if (data.experiencia !== undefined) overlay.experiencia = data.experiencia || null;
  if (data.premios !== undefined) overlay.premios = data.premios || null;
  if (data.publicacoes !== undefined) overlay.publicacoes = data.publicacoes || null;
  if (data.foto !== undefined) overlay.foto = data.foto || null;
  if (data.website !== undefined) overlay.website = data.website || null;
  if (data.linkedin !== undefined) overlay.linkedin = data.linkedin || null;
  if (data.twitter !== undefined) overlay.twitter = data.twitter || null;
  if (data.instagram !== undefined) overlay.instagram = data.instagram || null;
  if (data.observacoes !== undefined) overlay.observacoes = data.observacoes || null;
  if (data.tribunalId !== undefined) overlay.tribunalId = data.tribunalId || null;

  return overlay;
}

function applyTenantOverlay<T extends JuizSerializado | JuizDetalhado>(
  juiz: T,
  overlay: JuizTenantOverlay | null,
): T {
  if (!overlay) {
    return juiz;
  }

  const next = { ...juiz } as any;
  const assignableKeys: Array<keyof JuizTenantOverlay> = [
    "nome",
    "tipoAutoridade",
    "nomeCompleto",
    "cpf",
    "oab",
    "email",
    "telefone",
    "endereco",
    "cidade",
    "estado",
    "cep",
    "status",
    "nivel",
    "especialidades",
    "vara",
    "comarca",
    "biografia",
    "formacao",
    "experiencia",
    "premios",
    "publicacoes",
    "foto",
    "website",
    "linkedin",
    "twitter",
    "instagram",
    "observacoes",
    "tribunalId",
  ];

  assignableKeys.forEach((key) => {
    if (overlay[key] !== undefined) {
      next[key] = overlay[key];
    }
  });

  if (overlay.dataNascimento !== undefined) {
    next.dataNascimento = overlay.dataNascimento ? new Date(overlay.dataNascimento) : null;
  }

  if (overlay.dataPosse !== undefined) {
    next.dataPosse = overlay.dataPosse ? new Date(overlay.dataPosse) : null;
  }

  if (overlay.dataAposentadoria !== undefined) {
    next.dataAposentadoria = overlay.dataAposentadoria
      ? new Date(overlay.dataAposentadoria)
      : null;
  }

  return next as T;
}

function mergeTenantOverlaysIntoJudgeBase<T extends JuizSerializado | JuizDetalhado>(
  juiz: T,
  overlays: JuizTenantOverlay[],
): T {
  if (!overlays.length) {
    return juiz;
  }

  const next = { ...juiz } as any;
  const assignableKeys: Array<keyof JuizTenantOverlay> = [
    "nome",
    "tipoAutoridade",
    "nomeCompleto",
    "cpf",
    "oab",
    "email",
    "telefone",
    "endereco",
    "cidade",
    "estado",
    "cep",
    "status",
    "nivel",
    "especialidades",
    "vara",
    "comarca",
    "biografia",
    "formacao",
    "experiencia",
    "premios",
    "publicacoes",
    "foto",
    "website",
    "linkedin",
    "twitter",
    "instagram",
    "observacoes",
    "tribunalId",
  ];

  const isEmpty = (value: unknown) =>
    value === null ||
    value === undefined ||
    (typeof value === "string" && value.trim().length === 0) ||
    (Array.isArray(value) && value.length === 0);

  for (const overlay of overlays) {
    for (const key of assignableKeys) {
      const incoming = overlay[key];
      if (incoming === undefined || isEmpty(incoming)) {
        continue;
      }

      if (isEmpty(next[key])) {
        next[key] = incoming;
      }
    }

    if (overlay.dataNascimento && !next.dataNascimento) {
      next.dataNascimento = new Date(overlay.dataNascimento);
    }

    if (overlay.dataPosse && !next.dataPosse) {
      next.dataPosse = new Date(overlay.dataPosse);
    }

    if (overlay.dataAposentadoria && !next.dataAposentadoria) {
      next.dataAposentadoria = new Date(overlay.dataAposentadoria);
    }
  }

  return next as T;
}

type JuizScopedCounts = {
  processos: number;
  julgamentos: number;
  analises: number;
  favoritos: number;
};

type SessionLike = {
  user: any;
};

type DbClient = Prisma.TransactionClient | typeof prisma;

function withScopedCounts<T extends JuizSerializado | JuizDetalhado>(
  juiz: T,
  counts?: JuizScopedCounts,
): T {
  return {
    ...juiz,
    _count: {
      processos: counts?.processos ?? 0,
      julgamentos: counts?.julgamentos ?? 0,
      analises: counts?.analises ?? 0,
      favoritos: counts?.favoritos ?? 0,
    },
  };
}

function decorateAuthorityPendingMetadata<T extends JuizSerializado | JuizDetalhado>(
  juiz: T,
  task?: {
    id?: string | null;
    responsavel?: AuthorityPendingResponsibleSummary | null;
  } | null,
): T {
  const metadata = buildAuthorityPendingMetadata(juiz, task);

  return {
    ...juiz,
    cadastroCompleto: metadata.cadastroCompleto,
    camposPendentes: metadata.camposPendentes,
    tarefaPendenciaId: metadata.tarefaPendenciaId,
    responsavelPendencia: metadata.responsavelPendencia,
  };
}

function buildAuthorityCoreFromJudge(
  juiz: Pick<
    JuizSerializado | JuizDetalhado,
    | "nome"
    | "tipoAutoridade"
    | "vara"
    | "comarca"
    | "cidade"
    | "estado"
    | "tribunalId"
  >,
) {
  return {
    nome: juiz.nome,
    tipoAutoridade: juiz.tipoAutoridade,
    vara: juiz.vara,
    comarca: juiz.comarca,
    cidade: juiz.cidade,
    estado: juiz.estado,
    tribunalId: juiz.tribunalId,
  };
}

async function getTenantJuizCounts(
  tenantId: string,
  juizIds: string[],
  options?: {
    session?: SessionLike;
  },
): Promise<Map<string, JuizScopedCounts>> {
  const uniqueJuizIds = Array.from(new Set(juizIds.filter(Boolean)));

  if (uniqueJuizIds.length === 0) {
    return new Map();
  }

  const processosWhere = options?.session
    ? await buildProcessosVisiveisWhere(options.session, {
        processoIds: [],
      })
    : {
        tenantId,
        deletedAt: null,
      };

  const scopedProcessWhere: Prisma.ProcessoWhereInput = {
    ...processosWhere,
    juizId: {
      in: uniqueJuizIds,
    },
  };

  const [processos, julgamentos, analises, favoritos] = await Promise.all([
    prisma.processo.groupBy({
      by: ["juizId"],
      where: scopedProcessWhere,
      _count: {
        _all: true,
      },
    }),
    prisma.julgamento.groupBy({
      by: ["juizId"],
      where: {
        tenantId,
        juizId: {
          in: uniqueJuizIds,
        },
      },
      _count: {
        _all: true,
      },
    }),
    prisma.analiseJuiz.groupBy({
      by: ["juizId"],
      where: {
        tenantId,
        juizId: {
          in: uniqueJuizIds,
        },
      },
      _count: {
        _all: true,
      },
    }),
    prisma.favoritoJuiz.groupBy({
      by: ["juizId"],
      where: {
        tenantId,
        ativo: true,
        juizId: {
          in: uniqueJuizIds,
        },
      },
      _count: {
        _all: true,
      },
    }),
  ]);

  const countsMap = new Map<string, JuizScopedCounts>();

  const ensure = (juizId: string) => {
    const current = countsMap.get(juizId);
    if (current) return current;

    const next: JuizScopedCounts = {
      processos: 0,
      julgamentos: 0,
      analises: 0,
      favoritos: 0,
    };

    countsMap.set(juizId, next);
    return next;
  };

  for (const item of processos) {
    if (!item.juizId) continue;
    ensure(item.juizId).processos = item._count._all;
  }

  for (const item of julgamentos) {
    ensure(item.juizId).julgamentos = item._count._all;
  }

  for (const item of analises) {
    ensure(item.juizId).analises = item._count._all;
  }

  for (const item of favoritos) {
    ensure(item.juizId).favoritos = item._count._all;
  }

  return countsMap;
}

async function ensureTenantJudgeAccess(
  tenantId: string,
  juizId: string,
  usuarioId: string,
  db: DbClient = prisma,
) {
  const existing = await db.acessoJuiz.findFirst({
    where: {
      tenantId,
      juizId,
      tipoAcesso: TENANT_JUDGE_ACCESS_TYPE,
    },
    select: { id: true },
  });

  if (existing) {
    return;
  }

  await db.acessoJuiz.create({
    data: {
      tenantId,
      juizId,
      usuarioId,
      tipoAcesso: TENANT_JUDGE_ACCESS_TYPE,
      observacoes: "Acesso operacional ao juiz",
    },
  });
}

async function upsertTenantJudgeProfile(
  tenantId: string,
  juizId: string,
  usuarioId: string,
  data: Partial<JuizFormData>,
  db: DbClient = prisma,
) {
  const profileData = buildTenantOverlayFromData(data);
  const existing = await db.acessoJuiz.findFirst({
    where: {
      tenantId,
      juizId,
      tipoAcesso: TENANT_JUDGE_PROFILE_TYPE,
    },
    orderBy: {
      dataAcesso: "desc",
    },
    select: {
      id: true,
      observacoes: true,
    },
  });

  const mergedProfile = {
    ...(parseTenantOverlay(existing?.observacoes ?? null) ?? {}),
    ...profileData,
  };

  const serialized = JSON.stringify(mergedProfile);

  if (existing) {
    await db.acessoJuiz.update({
      where: { id: existing.id },
      data: {
        usuarioId,
        observacoes: serialized,
        dataAcesso: new Date(),
      },
    });

    return;
  }

  await db.acessoJuiz.create({
    data: {
      tenantId,
      juizId,
      usuarioId,
      tipoAcesso: TENANT_JUDGE_PROFILE_TYPE,
      observacoes: serialized,
    },
  });
}

async function ensureTenantAutoridadeUnlock(
  tenantId: string,
  juizId: string,
  db: DbClient = prisma,
) {
  await db.autoridadeTenantUnlock.upsert({
    where: {
      tenantId_juizId: {
        tenantId,
        juizId,
      },
    },
    update: {
      status: AutoridadeStatusUnlock.ATIVO,
      dataFim: null,
    },
    create: {
      tenantId,
      juizId,
      nivelAcesso: AutoridadeNivelAcesso.IDENTIFICACAO,
      origem: AutoridadeOrigemUnlock.CORTESIA,
      status: AutoridadeStatusUnlock.ATIVO,
    },
  });
}

async function registerTenantJudgeContribution(
  tenantId: string,
  juizId: string,
  usuarioId: string,
  data: Partial<JuizFormData>,
  db: DbClient = prisma,
) {
  const payload = buildTenantOverlayFromData(data);
  const campos = Object.entries(payload)
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key)
    .sort();

  if (!campos.length) {
    return;
  }

  const hashDedupe = createHash("sha256")
    .update(JSON.stringify({ tenantId, juizId, campos, payload }))
    .digest("hex");

  await db.autoridadeContribuicao.upsert({
    where: {
      tenantId_juizId_hashDedupe: {
        tenantId,
        juizId,
        hashDedupe,
      },
    },
    update: {
      status: AutoridadeStatusContribuicao.APROVADA,
      payload,
      campos,
      aprovadoPorId: usuarioId,
      aprovadoEm: new Date(),
      observacoes:
        "Contribuição consolidada automaticamente a partir de edição operacional do tenant.",
    },
    create: {
      tenantId,
      juizId,
      criadoPorId: usuarioId,
      aprovadoPorId: usuarioId,
      origem: AutoridadeOrigemContribuicao.MANUAL,
      status: AutoridadeStatusContribuicao.APROVADA,
      campos,
      payload,
      hashDedupe,
      aprovadoEm: new Date(),
      observacoes:
        "Contribuição gerada automaticamente a partir de cadastro/edição de autoridade pelo tenant.",
    },
  });
}

function normalizeJudgeName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// ============================================
// ACTIONS
// ============================================

export async function getJuizFormData(): Promise<{
  success: boolean;
  data?: JuizFormOptions;
  error?: string;
}> {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;
    const isSuperAdmin = user.role === "SUPER_ADMIN";

    if (!isSuperAdmin && !user.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    const [tribunais, usuariosResponsaveis] = await Promise.all([
      prisma.tribunal.findMany({
        where: isSuperAdmin
          ? undefined
          : {
              OR: [{ tenantId: null }, { tenantId: user.tenantId }],
            },
        select: {
          id: true,
          nome: true,
          sigla: true,
          esfera: true,
          uf: true,
        },
        orderBy: {
          nome: "asc",
        },
      }),
      isSuperAdmin
        ? Promise.resolve([])
        : prisma.usuario.findMany({
            where: {
              tenantId: user.tenantId,
              active: true,
              role: {
                not: "CLIENTE" as any,
              },
            },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              role: true,
            },
            orderBy: [{ firstName: "asc" }, { lastName: "asc" }, { email: "asc" }],
          }),
    ]);

    // Definir opções estáticas para especialidades, status e níveis
    const especialidades = [
      "CIVEL",
      "CRIMINAL",
      "FAMILIA",
      "CONSUMIDOR",
      "TRABALHISTA",
      "ADMINISTRATIVO",
      "TRIBUTARIO",
      "EMPREENDIMENTOS",
      "IMOBILIARIO",
      "CONTRATOS",
      "SUCESSOES",
      "PREVIDENCIARIO",
      "AMBIENTAL",
      "CONCORRENCIAL",
      "INTERNACIONAL",
      "TECNOLOGIA",
      "SAUDE",
      "EDUCACAO",
      "FINANCEIRO",
      "SEGURANCA_PUBLICA",
    ] as EspecialidadeJuridica[];

    const status = [
      "ATIVO",
      "INATIVO",
      "APOSENTADO",
      "SUSPENSO",
    ] as JuizStatus[];

    const niveis = [
      "JUIZ_TITULAR",
      "JUIZ_SUBSTITUTO",
      "DESEMBARGADOR",
      "MINISTRO",
      "OUTROS",
    ] as JuizNivel[];
    const tiposAutoridade = ["JUIZ", "PROMOTOR"] as JuizTipoAutoridade[];

    return {
      success: true,
      data: {
        tiposAutoridade,
        especialidades,
        status,
        niveis,
        tribunais,
        usuariosResponsaveis: usuariosResponsaveis.map((item) => ({
          id: item.id,
          nome:
            [item.firstName, item.lastName].filter(Boolean).join(" ").trim() ||
            item.email,
          role: item.role,
        })),
      },
    };
  } catch (error) {
    logger.error("Erro ao buscar dados do formulário de juízes:", error);

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Erro ao buscar dados do formulário",
    };
  }
}

export async function getJuizes(filters: JuizFilters = {}): Promise<{
  success: boolean;
  data?: JuizSerializado[];
  error?: string;
}> {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;
    const isSuperAdmin = user.role === "SUPER_ADMIN";

    if (!canManageJudgeByRole(user.role)) {
      const canView = await hasJudgePermission("visualizar");
      if (!canView) {
        return { success: false, error: "Sem permissão para visualizar juízes" };
      }
    }

    if (!user.tenantId && user.role !== "SUPER_ADMIN") {
      return { success: false, error: "Tenant não encontrado" };
    }

    const where: Prisma.JuizWhereInput = {};
    const andFilters: Prisma.JuizWhereInput[] = [];

    if (user.role !== "SUPER_ADMIN") {
      andFilters.push(buildJuizAccessWhere(user.tenantId));
    } else {
      andFilters.push({ superAdminId: user.id });
    }

    const searchWhere = buildJuizSearchWhere(filters.search);
    if (searchWhere) {
      andFilters.push(searchWhere);
    }

    if (filters.status) {
      andFilters.push({ status: filters.status });
    }

    if (filters.nivel) {
      andFilters.push({ nivel: filters.nivel });
    }

    if (filters.tipoAutoridade) {
      andFilters.push({ tipoAutoridade: filters.tipoAutoridade });
    }

    if (filters.especialidades && filters.especialidades.length > 0) {
      andFilters.push({
        especialidades: {
          hasSome: filters.especialidades,
        },
      });
    }

    if (filters.tribunalId) {
      andFilters.push({ tribunalId: filters.tribunalId });
    }

    if (filters.comarca) {
      andFilters.push({
        comarca: {
          contains: filters.comarca,
          mode: "insensitive",
        },
      });
    }

    if (filters.vara) {
      andFilters.push({
        vara: {
          contains: filters.vara,
          mode: "insensitive",
        },
      });
    }

    if (andFilters.length > 0) {
      where.AND = andFilters;
    }

    const juizes = await prisma.juiz.findMany({
      where,
      include: {
        tribunal: {
          select: {
            id: true,
            nome: true,
            sigla: true,
            esfera: true,
            uf: true,
            siteUrl: true,
          },
        },
        _count: {
          select: {
            processos: true,
            julgamentos: true,
            analises: true,
            favoritos: {
              where: {
                ativo: true,
              },
            },
          },
        },
      },
      orderBy: [{ isPremium: "desc" }, { isPublico: "desc" }, { nome: "asc" }],
    });

    const converted = juizes.map((j) =>
      convertAllDecimalFields(j),
    ) as JuizSerializado[];

    const serialized = JSON.parse(
      JSON.stringify(converted, (key, value) => {
        if (
          value &&
          typeof value === "object" &&
          value.constructor &&
          value.constructor.name === "Decimal"
        ) {
          return Number(value.toString());
        }

        return value;
      }),
    );

    if (user.role === "SUPER_ADMIN") {
      return {
        success: true,
        data: (serialized as JuizSerializado[]).map((juiz) =>
          decorateAuthorityPendingMetadata(juiz),
        ),
      };
    }

    const juizIds = (serialized as JuizSerializado[]).map((juiz) => juiz.id);
    const tenantCountsByJuizId = await getTenantJuizCounts(
      user.tenantId,
      juizIds,
      { session },
    );
    const tenantProfiles = juizIds.length
      ? await prisma.acessoJuiz.findMany({
          where: {
            tenantId: user.tenantId,
            tipoAcesso: TENANT_JUDGE_PROFILE_TYPE,
            juizId: { in: juizIds },
          },
          orderBy: {
            dataAcesso: "desc",
          },
          select: {
            juizId: true,
            observacoes: true,
          },
        })
      : [];

    const overlayByJudgeId = new Map<string, JuizTenantOverlay>();

    tenantProfiles.forEach((item) => {
      if (overlayByJudgeId.has(item.juizId)) {
        return;
      }

      const overlay = parseTenantOverlay(item.observacoes);
      if (overlay) {
        overlayByJudgeId.set(item.juizId, overlay);
      }
    });

    const tenantScoped = (serialized as JuizSerializado[]).map((juiz) => {
      const withOverlay = applyTenantOverlay(
        juiz,
        overlayByJudgeId.get(juiz.id) ?? null,
      );

      return withScopedCounts(withOverlay, tenantCountsByJuizId.get(juiz.id));
    });

    const pendingTaskMap = await getAuthorityPendingTaskMap(user.tenantId, juizIds);
    const decorated = tenantScoped.map((juiz) => {
      const task = pendingTaskMap.get(juiz.id);
      return decorateAuthorityPendingMetadata(juiz, task
        ? {
            id: task.id,
            responsavel: task.responsavel
              ? {
                  id: task.responsavel.id,
                  nome:
                    [task.responsavel.firstName, task.responsavel.lastName]
                      .filter(Boolean)
                      .join(" ")
                      .trim() || "Responsavel do escritorio",
                }
              : null,
          }
        : null);
    });

    return {
      success: true,
      data: decorated,
    };
  } catch (error) {
    logger.error("Erro ao buscar juízes:", error);

    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao buscar juízes",
    };
  }
}

export async function buscarJuizesCatalogoPorNome(
  search: string,
): Promise<{
  success: boolean;
  data?: JuizCatalogoOpcao[];
  error?: string;
}> {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;
    const isSuperAdmin = user.role === "SUPER_ADMIN";

    if (!canManageJudgeByRole(user.role)) {
      const canCreate = await hasJudgePermission("criar");
      if (!canCreate) {
        return { success: false, error: "Sem permissão para pesquisar juízes" };
      }
    }

    const normalizedSearch = search.trim();

    if (normalizedSearch.length < 3) {
      return {
        success: true,
        data: [],
      };
    }

    const candidatos = await prisma.juiz.findMany({
      where: {
        OR: [
          { nome: { contains: normalizedSearch, mode: "insensitive" } },
          { nomeCompleto: { contains: normalizedSearch, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        nome: true,
        nomeCompleto: true,
        tipoAutoridade: true,
        vara: true,
        comarca: true,
      },
      orderBy: [{ nome: "asc" }, { createdAt: "asc" }],
      take: 80,
    });

    const uniqueByName = new Map<string, JuizCatalogoOpcao>();

    for (const candidato of candidatos) {
      const key = normalizeJudgeName(candidato.nome);
      if (!uniqueByName.has(key)) {
        uniqueByName.set(key, {
          id: candidato.id,
          nome: candidato.nome,
          tipoAutoridade: isSuperAdmin
            ? candidato.tipoAutoridade
            : undefined,
          vara: isSuperAdmin ? candidato.vara : undefined,
          comarca: isSuperAdmin ? candidato.comarca : undefined,
        });
      }

      if (uniqueByName.size >= 10) {
        break;
      }
    }

    return {
      success: true,
      data: Array.from(uniqueByName.values()),
    };
  } catch (error) {
    logger.error("Erro ao buscar catálogo de juízes:", error);

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Erro ao buscar catálogo de juízes",
    };
  }
}

export async function getJuizDetalhado(juizId: string): Promise<{
  success: boolean;
  juiz?: JuizDetalhado;
  error?: string;
}> {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;

    if (!canManageJudgeByRole(user.role)) {
      const canView = await hasJudgePermission("visualizar");
      if (!canView) {
        return { success: false, error: "Sem permissão para visualizar juiz" };
      }
    }

    if (!user.tenantId && user.role !== "SUPER_ADMIN") {
      return { success: false, error: "Tenant não encontrado" };
    }

    const whereCondition: Prisma.JuizWhereInput =
      user.role === "SUPER_ADMIN"
        ? {
            id: juizId,
            superAdminId: user.id,
          }
        : {
            id: juizId,
            ...buildJuizAccessWhere(user.tenantId),
          };

    const juiz = await prisma.juiz.findFirst({
      where: whereCondition,
      include: {
        tribunal: {
          select: {
            id: true,
            nome: true,
            sigla: true,
            esfera: true,
            uf: true,
            siteUrl: true,
          },
        },
        _count: {
          select: {
            processos: true,
            julgamentos: true,
            analises: true,
            favoritos: {
              where: {
                ativo: true,
              },
            },
          },
        },
      },
    });

    if (!juiz) {
      return { success: false, error: "Juiz não encontrado ou sem acesso" };
    }

    const converted = convertAllDecimalFields(juiz) as any as JuizDetalhado;

    // Serialização simplificada para debug
    const serialized = JSON.parse(
      JSON.stringify(converted, (key, value) => {
        if (
          value &&
          typeof value === "object" &&
          value.constructor &&
          value.constructor.name === "Decimal"
        ) {
          return Number(value.toString());
        }

        return value;
      }),
    );

    if (user.role !== "SUPER_ADMIN") {
      const tenantProfile = await prisma.acessoJuiz.findFirst({
        where: {
          tenantId: user.tenantId,
          juizId,
          tipoAcesso: TENANT_JUDGE_PROFILE_TYPE,
        },
        orderBy: {
          dataAcesso: "desc",
        },
        select: {
          observacoes: true,
        },
      });

      const overlay = parseTenantOverlay(tenantProfile?.observacoes ?? null);
      const tenantScoped = applyTenantOverlay(serialized, overlay);
      const tenantCountsByJuizId = await getTenantJuizCounts(
        user.tenantId,
        [juizId],
        { session },
      );
      const tenantScopedWithCountsBase = withScopedCounts(
        tenantScoped,
        tenantCountsByJuizId.get(juizId),
      );
      let pendingTaskMap = await getAuthorityPendingTaskMap(user.tenantId, [juizId]);
      let task = pendingTaskMap.get(juizId);

      if (!task) {
        const syncResult = await syncAuthorityPendingTaskForAuthority({
          tenantId: user.tenantId,
          juizId,
          authority: buildAuthorityCoreFromJudge(tenantScopedWithCountsBase),
        });

        if (syncResult.metadata.tarefaPendenciaId) {
          pendingTaskMap = await getAuthorityPendingTaskMap(user.tenantId, [juizId]);
          task = pendingTaskMap.get(juizId);
        }
      }

      const tenantScopedWithCounts = decorateAuthorityPendingMetadata(
        tenantScopedWithCountsBase,
        task
          ? {
              id: task.id,
              responsavel: task.responsavel
                ? {
                    id: task.responsavel.id,
                    nome:
                      [task.responsavel.firstName, task.responsavel.lastName]
                        .filter(Boolean)
                        .join(" ")
                        .trim() || "Responsavel do escritorio",
                  }
                : null,
            }
          : null,
      );

      return {
        success: true,
        juiz: tenantScopedWithCounts,
      };
    }

    return {
      success: true,
      juiz: decorateAuthorityPendingMetadata(serialized),
    };
  } catch (error) {
    logger.error("Erro ao buscar detalhes do juiz:", error);

    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao buscar juiz",
    };
  }
}

export async function getProcessosDoJuiz(juizId: string): Promise<{
  success: boolean;
  processos?: ProcessoJuiz[];
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

    // Verificar se o usuário tem acesso ao juiz
    const juiz = await prisma.juiz.findFirst({
      where: {
        id: juizId,
        ...buildJuizAccessWhere(user.tenantId),
      },
    });

    if (!juiz) {
      return { success: false, error: "Juiz não encontrado ou sem acesso" };
    }

    const processos = await prisma.processo.findMany({
      where: {
        juizId: juizId,
        tenantId: user.tenantId,
        deletedAt: null,
      },
      select: {
        id: true,
        numero: true,
        numeroCnj: true,
        titulo: true,
        status: true,
        fase: true,
        grau: true,
        valorCausa: true,
        dataDistribuicao: true,
        createdAt: true,
        cliente: {
          select: {
            id: true,
            nome: true,
            tipoPessoa: true,
          },
        },
        area: {
          select: {
            id: true,
            nome: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const converted = processos.map((p) =>
      convertAllDecimalFields(p),
    ) as ProcessoJuiz[];

    const serialized = JSON.parse(
      JSON.stringify(converted, (key, value) => {
        if (
          value &&
          typeof value === "object" &&
          value.constructor &&
          value.constructor.name === "Decimal"
        ) {
          return Number(value.toString());
        }

        return value;
      }),
    );

    return {
      success: true,
      processos: serialized,
    };
  } catch (error) {
    logger.error("Erro ao buscar processos do juiz:", error);

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Erro ao buscar processos do juiz",
    };
  }
}

export async function getJulgamentosDoJuiz(juizId: string): Promise<{
  success: boolean;
  julgamentos?: JulgamentoJuiz[];
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

    // Verificar se o usuário tem acesso ao juiz
    const juiz = await prisma.juiz.findFirst({
      where: {
        id: juizId,
        ...buildJuizAccessWhere(user.tenantId),
      },
    });

    if (!juiz) {
      return { success: false, error: "Juiz não encontrado ou sem acesso" };
    }

    const julgamentos = await prisma.julgamento.findMany({
      where: {
        juizId: juizId,
        tenantId: user.tenantId,
        OR: [{ isPublico: true }, { criadoPorId: user.id }],
      },
      select: {
        id: true,
        titulo: true,
        descricao: true,
        dataJulgamento: true,
        tipoJulgamento: true,
        resultado: true,
        valorCausa: true,
        valorCondenacao: true,
        observacoes: true,
        pontosPositivos: true,
        pontosNegativos: true,
        estrategias: true,
        recomendacoes: true,
        tags: true,
        isPublico: true,
        processo: {
          select: {
            id: true,
            numero: true,
            titulo: true,
          },
        },
      },
      orderBy: {
        dataJulgamento: "desc",
      },
    });

    const converted = julgamentos.map((j) =>
      convertAllDecimalFields(j),
    ) as JulgamentoJuiz[];

    const serialized = JSON.parse(
      JSON.stringify(converted, (key, value) => {
        if (
          value &&
          typeof value === "object" &&
          value.constructor &&
          value.constructor.name === "Decimal"
        ) {
          return Number(value.toString());
        }

        return value;
      }),
    );

    return {
      success: true,
      julgamentos: serialized,
    };
  } catch (error) {
    logger.error("Erro ao buscar julgamentos do juiz:", error);

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Erro ao buscar julgamentos do juiz",
    };
  }
}

export async function getProcessosParaVinculoAutoridade(
  juizId: string,
): Promise<{
  success: boolean;
  processos?: ProcessoVinculoAutoridade[];
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

    const isPrivileged = user.role === "ADMIN" || user.role === "SUPER_ADMIN";

    if (!isPrivileged) {
      const canView = await hasProcessPermission("visualizar");
      if (!canView) {
        return { success: false, error: "Sem permissão para visualizar processos" };
      }
    }

    const juiz = await prisma.juiz.findFirst({
      where: {
        id: juizId,
        ...buildJuizAccessWhere(user.tenantId),
      },
      select: { id: true },
    });

    if (!juiz) {
      return { success: false, error: "Autoridade não encontrada ou sem acesso" };
    }

    const where = await buildProcessosVisiveisWhere(session);

    const processos = await prisma.processo.findMany({
      where,
      select: {
        id: true,
        numero: true,
        titulo: true,
        status: true,
        juizId: true,
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
      },
      orderBy: {
        updatedAt: "desc",
      },
      take: 1200,
    });

    const serializados: ProcessoVinculoAutoridade[] = processos.map((processo) => ({
      id: processo.id,
      numero: processo.numero,
      titulo: processo.titulo,
      status: processo.status,
      juizId: processo.juizId ?? null,
      clienteNome: processo.cliente.nome,
      advogadoResponsavelNome: processo.advogadoResponsavel?.usuario
        ? [
            processo.advogadoResponsavel.usuario.firstName,
            processo.advogadoResponsavel.usuario.lastName,
          ]
            .filter(Boolean)
            .join(" ")
        : null,
    }));

    return {
      success: true,
      processos: serializados,
    };
  } catch (error) {
    logger.error("Erro ao buscar processos para vínculo de autoridade:", error);

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Erro ao buscar processos para vínculo",
    };
  }
}

export async function vincularAutoridadeAProcessos(input: {
  juizId: string;
  processoIds: string[];
}): Promise<{
  success: boolean;
  vinculados?: number;
  ignorados?: number;
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

    if (!input.juizId) {
      return { success: false, error: "Autoridade não informada" };
    }

    const normalizedProcessoIds = Array.from(
      new Set((input.processoIds || []).filter(Boolean)),
    );

    if (normalizedProcessoIds.length === 0) {
      return { success: false, error: "Selecione pelo menos um processo" };
    }

    const isPrivileged = user.role === "ADMIN" || user.role === "SUPER_ADMIN";

    if (!isPrivileged) {
      const canEdit = await hasProcessPermission("editar");
      if (!canEdit) {
        return { success: false, error: "Sem permissão para editar processos" };
      }
    }

    const juiz = await prisma.juiz.findFirst({
      where: {
        id: input.juizId,
        ...buildJuizAccessWhere(user.tenantId),
      },
      select: { id: true },
    });

    if (!juiz) {
      return { success: false, error: "Autoridade não encontrada ou sem acesso" };
    }

    const where = await buildProcessosVisiveisWhere(session, {
      processoIds: normalizedProcessoIds,
    });

    const processosVisiveis = await prisma.processo.findMany({
      where,
      select: {
        id: true,
      },
    });

    const visibleIds = processosVisiveis.map((processo) => processo.id);

    if (visibleIds.length === 0) {
      return {
        success: false,
        error: "Nenhum processo selecionado está disponível para o seu escopo",
      };
    }

    const result = await prisma.processo.updateMany({
      where: {
        tenantId: user.tenantId,
        id: {
          in: visibleIds,
        },
      },
      data: {
        juizId: input.juizId,
      },
    });

    await logProcessoAutoridadeBatchAudit({
      tenantId: user.tenantId,
      usuarioId: user.id,
      acao: "VINCULAR_AUTORIDADE_LOTE",
      juizId: input.juizId,
      processoIds: normalizedProcessoIds,
      afetados: result.count,
      ignorados: normalizedProcessoIds.length - result.count,
    });

    return {
      success: true,
      vinculados: result.count,
      ignorados: normalizedProcessoIds.length - result.count,
    };
  } catch (error) {
    logger.error("Erro ao vincular autoridade aos processos:", error);

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Erro ao vincular autoridade aos processos",
    };
  }
}

export async function desvincularAutoridadeDeProcessos(input: {
  juizId: string;
  processoIds: string[];
}): Promise<{
  success: boolean;
  desvinculados?: number;
  ignorados?: number;
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

    if (!input.juizId) {
      return { success: false, error: "Autoridade não informada" };
    }

    const normalizedProcessoIds = Array.from(
      new Set((input.processoIds || []).filter(Boolean)),
    );

    if (normalizedProcessoIds.length === 0) {
      return { success: false, error: "Selecione pelo menos um processo" };
    }

    const isPrivileged = user.role === "ADMIN" || user.role === "SUPER_ADMIN";

    if (!isPrivileged) {
      const canEdit = await hasProcessPermission("editar");
      if (!canEdit) {
        return { success: false, error: "Sem permissão para editar processos" };
      }
    }

    const juiz = await prisma.juiz.findFirst({
      where: {
        id: input.juizId,
        ...buildJuizAccessWhere(user.tenantId),
      },
      select: { id: true },
    });

    if (!juiz) {
      return { success: false, error: "Autoridade não encontrada ou sem acesso" };
    }

    const where = await buildProcessosVisiveisWhere(session, {
      processoIds: normalizedProcessoIds,
    });

    const processosVisiveis = await prisma.processo.findMany({
      where: {
        ...where,
        juizId: input.juizId,
      },
      select: {
        id: true,
      },
    });

    const visibleIds = processosVisiveis.map((processo) => processo.id);

    if (visibleIds.length === 0) {
      return {
        success: false,
        error:
          "Nenhum processo selecionado está vinculado a esta autoridade no seu escopo",
      };
    }

    const result = await prisma.processo.updateMany({
      where: {
        tenantId: user.tenantId,
        id: {
          in: visibleIds,
        },
        juizId: input.juizId,
      },
      data: {
        juizId: null,
      },
    });

    await logProcessoAutoridadeBatchAudit({
      tenantId: user.tenantId,
      usuarioId: user.id,
      acao: "DESVINCULAR_AUTORIDADE_LOTE",
      juizId: input.juizId,
      processoIds: normalizedProcessoIds,
      afetados: result.count,
      ignorados: normalizedProcessoIds.length - result.count,
    });

    return {
      success: true,
      desvinculados: result.count,
      ignorados: normalizedProcessoIds.length - result.count,
    };
  } catch (error) {
    logger.error("Erro ao desvincular autoridade dos processos:", error);

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Erro ao desvincular autoridade dos processos",
    };
  }
}

export async function verificarFavoritoJuiz(juizId: string): Promise<{
  success: boolean;
  isFavorito?: boolean;
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

    const favorito = await prisma.favoritoJuiz.findFirst({
      where: {
        juizId,
        tenantId: user.tenantId,
        usuarioId: user.id,
        ativo: true,
      },
    });

    return { success: true, isFavorito: !!favorito };
  } catch (error) {
    logger.error("Erro ao verificar favorito:", error);

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro ao verificar favorito",
    };
  }
}

export async function adicionarFavoritoJuiz(juizId: string): Promise<{
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

    const favoritoExistente = await prisma.favoritoJuiz.findFirst({
      where: {
        juizId,
        tenantId: user.tenantId,
        usuarioId: user.id,
      },
    });

    if (favoritoExistente?.ativo) {
      return { success: false, error: "Juiz já está nos favoritos" };
    }

    await prisma.favoritoJuiz.upsert({
      where: {
        tenantId_juizId_usuarioId: {
          tenantId: user.tenantId,
          juizId,
          usuarioId: user.id,
        },
      },
      update: {
        ativo: true,
      },
      create: {
        juizId,
        tenantId: user.tenantId,
        usuarioId: user.id,
        ativo: true,
      },
    });

    return { success: true };
  } catch (error) {
    logger.error("Erro ao adicionar favorito:", error);

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro ao adicionar favorito",
    };
  }
}

export async function removerFavoritoJuiz(juizId: string): Promise<{
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

    await prisma.favoritoJuiz.updateMany({
      where: {
        juizId,
        tenantId: user.tenantId,
        usuarioId: user.id,
        ativo: true,
      },
      data: {
        ativo: false,
      },
    });

    return { success: true };
  } catch (error) {
    logger.error("Erro ao remover favorito:", error);

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro ao remover favorito",
    };
  }
}

export async function getJuizesAdmin(filters?: {
  isPremium?: boolean;
  isPublico?: boolean;
}): Promise<{
  success: boolean;
  data?: JuizSerializado[];
  error?: string;
}> {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;

    // Verificar se é super admin
    if (user.role !== "SUPER_ADMIN") {
      return { success: false, error: "Acesso negado - apenas super admin" };
    }

    const juizes = await prisma.juiz.findMany({
      where: {
        ...(filters?.isPremium !== undefined && {
          isPremium: filters.isPremium,
        }),
        ...(filters?.isPublico !== undefined && {
          isPublico: filters.isPublico,
        }),
      },
      include: {
        tribunal: {
          select: {
            id: true,
            nome: true,
            sigla: true,
            esfera: true,
            uf: true,
            siteUrl: true,
          },
        },
        _count: {
          select: {
            processos: true,
            julgamentos: true,
            analises: true,
            favoritos: {
              where: {
                ativo: true,
              },
            },
          },
        },
      },
      orderBy: [{ isPremium: "desc" }, { isPublico: "desc" }, { nome: "asc" }],
    });

    const converted = juizes.map((j) =>
      convertAllDecimalFields(j),
    ) as JuizSerializado[];

    const serialized = JSON.parse(
      JSON.stringify(converted, (key, value) => {
        if (
          value &&
          typeof value === "object" &&
          value.constructor &&
          value.constructor.name === "Decimal"
        ) {
          return Number(value.toString());
        }

        return value;
      }),
    );

    const juizIds = (serialized as JuizSerializado[]).map((juiz) => juiz.id);
    const tenantProfiles = juizIds.length
      ? await prisma.acessoJuiz.findMany({
          where: {
            tipoAcesso: TENANT_JUDGE_PROFILE_TYPE,
            juizId: { in: juizIds },
          },
          orderBy: {
            dataAcesso: "desc",
          },
          select: {
            juizId: true,
            observacoes: true,
          },
        })
      : [];

    const overlaysByJudgeId = new Map<string, JuizTenantOverlay[]>();

    for (const item of tenantProfiles) {
      const overlay = parseTenantOverlay(item.observacoes);
      if (!overlay) continue;

      const existing = overlaysByJudgeId.get(item.juizId) ?? [];
      existing.push(overlay);
      overlaysByJudgeId.set(item.juizId, existing);
    }

    const globalScoped = (serialized as JuizSerializado[]).map((juiz) =>
      mergeTenantOverlaysIntoJudgeBase(juiz, overlaysByJudgeId.get(juiz.id) ?? []),
    );

    return {
      success: true,
      data: globalScoped,
    };
  } catch (error) {
    logger.error("Erro ao buscar juízes admin:", error);

    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao buscar juízes",
    };
  }
}

export async function getJuizAdminDetails(juizId: string): Promise<{
  success: boolean;
  data?: JuizAdminDetalhesSerializado;
  error?: string;
}> {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Nao autorizado" };
    }

    const user = session.user as any;

    if (user.role !== "SUPER_ADMIN") {
      return { success: false, error: "Acesso negado - apenas super admin" };
    }

    const juiz = await prisma.juiz.findUnique({
      where: { id: juizId },
      include: {
        tribunal: {
          select: {
            id: true,
            nome: true,
            sigla: true,
            esfera: true,
            uf: true,
            siteUrl: true,
          },
        },
        superAdmin: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        pacotes: {
          orderBy: {
            createdAt: "desc",
          },
          include: {
            pacote: {
              select: {
                id: true,
                nome: true,
                descricao: true,
                preco: true,
                moeda: true,
                status: true,
                isPublico: true,
                ordemExibicao: true,
                _count: {
                  select: {
                    assinaturas: true,
                  },
                },
              },
            },
          },
        },
        tenantUnlocks: {
          orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
          include: {
            tenant: {
              select: {
                id: true,
                name: true,
                slug: true,
                status: true,
              },
            },
            assinaturaPacote: {
              select: {
                id: true,
                pacoteId: true,
                status: true,
                precoPago: true,
                pacote: {
                  select: {
                    id: true,
                    nome: true,
                  },
                },
              },
            },
          },
        },
        contribuicoes: {
          orderBy: {
            criadoEm: "desc",
          },
          include: {
            tenant: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
            criadoPor: {
              select: {
                firstName: true,
                lastName: true,
                email: true,
              },
            },
            aprovadoPor: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
          },
        },
        processos: {
          orderBy: {
            updatedAt: "desc",
          },
          take: 12,
          select: {
            id: true,
            tenantId: true,
            numero: true,
            numeroCnj: true,
            titulo: true,
            status: true,
            fase: true,
            grau: true,
            valorCausa: true,
            dataDistribuicao: true,
            updatedAt: true,
            tenant: {
              select: {
                name: true,
                slug: true,
              },
            },
            area: {
              select: {
                nome: true,
              },
            },
            cliente: {
              select: {
                nome: true,
              },
            },
            clientesRelacionados: {
              orderBy: {
                ordem: "asc",
              },
              select: {
                cliente: {
                  select: {
                    nome: true,
                  },
                },
              },
            },
          },
        },
        julgamentos: {
          orderBy: {
            dataJulgamento: "desc",
          },
          take: 8,
          select: {
            id: true,
            tenantId: true,
            titulo: true,
            tipoJulgamento: true,
            resultado: true,
            dataJulgamento: true,
            tenant: {
              select: {
                name: true,
              },
            },
            processo: {
              select: {
                numero: true,
              },
            },
          },
        },
        analises: {
          orderBy: {
            createdAt: "desc",
          },
          take: 8,
          select: {
            id: true,
            tenantId: true,
            titulo: true,
            tipoAnalise: true,
            isPublico: true,
            createdAt: true,
            tenant: {
              select: {
                name: true,
              },
            },
          },
        },
        _count: {
          select: {
            processos: true,
            julgamentos: true,
            analises: true,
            pacotes: true,
            tenantUnlocks: true,
            contribuicoes: true,
            acessos: true,
            favoritos: {
              where: {
                ativo: true,
              },
            },
          },
        },
      },
    });

    if (!juiz) {
      return {
        success: false,
        error: "Autoridade nao encontrada",
      };
    }

    const converted = convertAllDecimalFields(juiz) as any;
    const serialized = JSON.parse(
      JSON.stringify(converted, (key, value) => {
        if (
          value &&
          typeof value === "object" &&
          value.constructor &&
          value.constructor.name === "Decimal"
        ) {
          return Number(value.toString());
        }

        return value;
      }),
    ) as any;

    const [
      processosPorTenant,
      julgamentosPorTenant,
      analisesPorTenant,
      contribuicoesPorTenant,
    ] = await Promise.all([
      prisma.processo.groupBy({
        by: ["tenantId"],
        where: {
          juizId,
        },
        _count: {
          _all: true,
        },
      }),
      prisma.julgamento.groupBy({
        by: ["tenantId"],
        where: {
          juizId,
        },
        _count: {
          _all: true,
        },
      }),
      prisma.analiseJuiz.groupBy({
        by: ["tenantId"],
        where: {
          juizId,
        },
        _count: {
          _all: true,
        },
      }),
      prisma.autoridadeContribuicao.groupBy({
        by: ["tenantId"],
        where: {
          juizId,
        },
        _count: {
          _all: true,
        },
      }),
    ]);

    const tenantsRelacionados = new Set<string>();
    for (const unlock of serialized.tenantUnlocks ?? []) {
      if (unlock?.tenantId) tenantsRelacionados.add(unlock.tenantId);
    }
    for (const contribuicao of serialized.contribuicoes ?? []) {
      if (contribuicao?.tenantId) tenantsRelacionados.add(contribuicao.tenantId);
    }
    for (const processo of serialized.processos ?? []) {
      if (processo?.tenantId) tenantsRelacionados.add(processo.tenantId);
    }
    for (const item of processosPorTenant) {
      if (item.tenantId) tenantsRelacionados.add(item.tenantId);
    }
    for (const item of julgamentosPorTenant) {
      if (item.tenantId) tenantsRelacionados.add(item.tenantId);
    }
    for (const item of analisesPorTenant) {
      if (item.tenantId) tenantsRelacionados.add(item.tenantId);
    }
    for (const item of contribuicoesPorTenant) {
      if (item.tenantId) tenantsRelacionados.add(item.tenantId);
    }

    const tenantMeta =
      tenantsRelacionados.size > 0
        ? await prisma.tenant.findMany({
            where: {
              id: {
                in: [...tenantsRelacionados],
              },
            },
            select: {
              id: true,
              name: true,
              slug: true,
              status: true,
            },
          })
        : [];

    const tenantRelacionamentos = new Map<
      string,
      {
        tenantId: string;
        tenantNome: string;
        tenantSlug: string;
        tenantStatus: string;
        possuiAcesso: boolean;
        niveisAcesso: Set<string>;
        pacotes: Set<string>;
        totalContribuicoes: number;
        totalProcessos: number;
        totalJulgamentos: number;
        totalAnalises: number;
      }
    >();

    for (const tenant of tenantMeta) {
      tenantRelacionamentos.set(tenant.id, {
        tenantId: tenant.id,
        tenantNome: tenant.name,
        tenantSlug: tenant.slug,
        tenantStatus: tenant.status,
        possuiAcesso: false,
        niveisAcesso: new Set<string>(),
        pacotes: new Set<string>(),
        totalContribuicoes: 0,
        totalProcessos: 0,
        totalJulgamentos: 0,
        totalAnalises: 0,
      });
    }

    const ensureTenantRelacionamento = (
      tenantId: string,
      fallback?: {
        nome?: string | null;
        slug?: string | null;
        status?: string | null;
      },
    ) => {
      const existente = tenantRelacionamentos.get(tenantId);
      if (existente) {
        return existente;
      }

      const criado = {
        tenantId,
        tenantNome: fallback?.nome ?? "Tenant",
        tenantSlug: fallback?.slug ?? "",
        tenantStatus: fallback?.status ?? "UNKNOWN",
        possuiAcesso: false,
        niveisAcesso: new Set<string>(),
        pacotes: new Set<string>(),
        totalContribuicoes: 0,
        totalProcessos: 0,
        totalJulgamentos: 0,
        totalAnalises: 0,
      };

      tenantRelacionamentos.set(tenantId, criado);
      return criado;
    };

    for (const unlock of serialized.tenantUnlocks ?? []) {
      if (!unlock?.tenantId) continue;
      const tenant = ensureTenantRelacionamento(unlock.tenantId, {
        nome: unlock.tenant?.name,
        slug: unlock.tenant?.slug,
        status: unlock.tenant?.status,
      });
      tenant.possuiAcesso = unlock.status === "ATIVO" || tenant.possuiAcesso;
      if (unlock.nivelAcesso) {
        tenant.niveisAcesso.add(unlock.nivelAcesso);
      }
      if (unlock.assinaturaPacote?.pacote?.nome) {
        tenant.pacotes.add(unlock.assinaturaPacote.pacote.nome);
      }
    }

    for (const item of processosPorTenant) {
      if (!item.tenantId) continue;
      const tenant = ensureTenantRelacionamento(item.tenantId);
      tenant.totalProcessos = item._count._all;
    }

    for (const item of julgamentosPorTenant) {
      if (!item.tenantId) continue;
      const tenant = ensureTenantRelacionamento(item.tenantId);
      tenant.totalJulgamentos = item._count._all;
    }

    for (const item of analisesPorTenant) {
      if (!item.tenantId) continue;
      const tenant = ensureTenantRelacionamento(item.tenantId);
      tenant.totalAnalises = item._count._all;
    }

    for (const item of contribuicoesPorTenant) {
      if (!item.tenantId) continue;
      const tenant = ensureTenantRelacionamento(item.tenantId);
      tenant.totalContribuicoes = item._count._all;
    }

    const primeiraContribuicao =
      [...(serialized.contribuicoes ?? [])]
        .sort(
          (a, b) =>
            new Date(a.criadoEm).getTime() - new Date(b.criadoEm).getTime(),
        )[0] ?? null;

    const detalhes: JuizAdminDetalhesSerializado = {
      id: serialized.id,
      tipoAutoridade: serialized.tipoAutoridade,
      nome: serialized.nome,
      nomeCompleto: serialized.nomeCompleto,
      cpf: serialized.cpf,
      oab: serialized.oab,
      email: serialized.email,
      telefone: serialized.telefone,
      endereco: serialized.endereco,
      cidade: serialized.cidade,
      estado: serialized.estado,
      cep: serialized.cep,
      dataNascimento: serialized.dataNascimento,
      dataPosse: serialized.dataPosse,
      dataAposentadoria: serialized.dataAposentadoria,
      status: serialized.status,
      nivel: serialized.nivel,
      especialidades: serialized.especialidades ?? [],
      vara: serialized.vara,
      comarca: serialized.comarca,
      biografia: serialized.biografia,
      formacao: serialized.formacao,
      experiencia: serialized.experiencia,
      premios: serialized.premios,
      publicacoes: serialized.publicacoes,
      foto: serialized.foto,
      website: serialized.website,
      linkedin: serialized.linkedin,
      twitter: serialized.twitter,
      instagram: serialized.instagram,
      observacoes: serialized.observacoes,
      isPublico: Boolean(serialized.isPublico),
      isPremium: Boolean(serialized.isPremium),
      precoAcesso:
        typeof serialized.precoAcesso === "number"
          ? serialized.precoAcesso
          : serialized.precoAcesso == null
            ? null
            : Number(serialized.precoAcesso),
      tribunalId: serialized.tribunalId,
      tribunal: serialized.tribunal ?? null,
      _count: serialized._count,
      superAdminCriador: serialized.superAdmin
        ? {
            id: serialized.superAdmin.id,
            nome:
              `${serialized.superAdmin.firstName ?? ""} ${serialized.superAdmin.lastName ?? ""}`.trim() ||
              serialized.superAdmin.email,
            email: serialized.superAdmin.email,
          }
        : null,
      origemCadastro: serialized.superAdmin
        ? "SUPER_ADMIN"
        : primeiraContribuicao
          ? "TENANT"
          : "INDEFINIDA",
      primeiroTenantContribuinte: primeiraContribuicao
        ? {
            id: primeiraContribuicao.tenant.id,
            nome: primeiraContribuicao.tenant.name,
            slug: primeiraContribuicao.tenant.slug,
            criadoEm: primeiraContribuicao.criadoEm,
          }
        : null,
      resumoRelacionamentos: {
        processos: serialized._count?.processos ?? 0,
        julgamentos: serialized._count?.julgamentos ?? 0,
        analises: serialized._count?.analises ?? 0,
        favoritos: serialized._count?.favoritos ?? 0,
        pacotes: serialized._count?.pacotes ?? 0,
        tenantsComAcesso: serialized._count?.tenantUnlocks ?? 0,
        contribuicoes: serialized._count?.contribuicoes ?? 0,
        acessosRegistrados: serialized._count?.acessos ?? 0,
        tenantsRelacionados: tenantsRelacionados.size,
      },
      processosRecentes: (serialized.processos ?? []).map((processo: any) => ({
        id: processo.id,
        tenantId: processo.tenantId,
        tenantNome: processo.tenant?.name ?? "Tenant",
        tenantSlug: processo.tenant?.slug ?? "",
        numero: processo.numero,
        numeroCnj: processo.numeroCnj ?? null,
        titulo: processo.titulo ?? null,
        status: processo.status,
        fase: processo.fase ?? null,
        grau: processo.grau ?? null,
        valorCausa:
          typeof processo.valorCausa === "number"
            ? processo.valorCausa
            : processo.valorCausa == null
              ? null
              : Number(processo.valorCausa),
        dataDistribuicao: processo.dataDistribuicao ?? null,
        updatedAt: processo.updatedAt,
        areaNome: processo.area?.nome ?? null,
        clientePrincipal: processo.cliente?.nome ?? "Sem cliente",
        clientesRelacionados:
          processo.clientesRelacionados?.map(
            (item: any) => item.cliente?.nome,
          )?.filter(Boolean) ?? [],
      })),
      pacotesRelacionados: (serialized.pacotes ?? []).map((item: any) => ({
        id: item.pacote.id,
        nome: item.pacote.nome,
        descricao: item.pacote.descricao ?? null,
        preco:
          typeof item.pacote.preco === "number"
            ? item.pacote.preco
            : Number(item.pacote.preco ?? 0),
        moeda: item.pacote.moeda,
        status: item.pacote.status,
        isPublico: Boolean(item.pacote.isPublico),
        ordemExibicao: item.pacote.ordemExibicao ?? 0,
        totalAssinaturas: item.pacote._count?.assinaturas ?? 0,
        tenantsAtivos: (serialized.tenantUnlocks ?? []).filter(
          (unlock: any) =>
            unlock.status === "ATIVO" &&
            unlock.assinaturaPacote?.pacoteId === item.pacote.id,
        ).length,
        ativoNoPacote: Boolean(item.ativo),
      })),
      tenantsComAcesso: (serialized.tenantUnlocks ?? []).map((unlock: any) => ({
        id: unlock.id,
        tenantId: unlock.tenantId,
        tenantNome: unlock.tenant?.name ?? "Tenant",
        tenantSlug: unlock.tenant?.slug ?? "",
        tenantStatus: unlock.tenant?.status ?? "UNKNOWN",
        nivelAcesso: unlock.nivelAcesso,
        origem: unlock.origem,
        status: unlock.status,
        dataInicio: unlock.dataInicio,
        dataFim: unlock.dataFim ?? null,
        observacoes: unlock.observacoes ?? null,
        assinaturaPacoteId: unlock.assinaturaPacoteId ?? null,
        assinaturaStatus: unlock.assinaturaPacote?.status ?? null,
        pacoteId: unlock.assinaturaPacote?.pacoteId ?? null,
        pacoteNome: unlock.assinaturaPacote?.pacote?.nome ?? null,
        precoPago:
          typeof unlock.assinaturaPacote?.precoPago === "number"
            ? unlock.assinaturaPacote.precoPago
            : unlock.assinaturaPacote?.precoPago == null
              ? null
              : Number(unlock.assinaturaPacote.precoPago),
      })),
      tenantsRelacionadosDetalhados: [...tenantRelacionamentos.values()]
        .map((tenant) => ({
          tenantId: tenant.tenantId,
          tenantNome: tenant.tenantNome,
          tenantSlug: tenant.tenantSlug,
          tenantStatus: tenant.tenantStatus,
          possuiAcesso: tenant.possuiAcesso,
          niveisAcesso: [...tenant.niveisAcesso],
          pacotes: [...tenant.pacotes],
          totalContribuicoes: tenant.totalContribuicoes,
          totalProcessos: tenant.totalProcessos,
          totalJulgamentos: tenant.totalJulgamentos,
          totalAnalises: tenant.totalAnalises,
        }))
        .sort((a, b) => {
          if (a.possuiAcesso !== b.possuiAcesso) {
            return a.possuiAcesso ? -1 : 1;
          }
          if (a.totalProcessos !== b.totalProcessos) {
            return b.totalProcessos - a.totalProcessos;
          }
          if (a.totalContribuicoes !== b.totalContribuicoes) {
            return b.totalContribuicoes - a.totalContribuicoes;
          }
          return a.tenantNome.localeCompare(b.tenantNome);
        }),
      contribuicoesRecentes: (serialized.contribuicoes ?? []).map(
        (contribuicao: any) => ({
          id: contribuicao.id,
          tenantId: contribuicao.tenantId,
          tenantNome: contribuicao.tenant?.name ?? "Tenant",
          tenantSlug: contribuicao.tenant?.slug ?? "",
          origem: contribuicao.origem,
          status: contribuicao.status,
          campos: contribuicao.campos ?? [],
          notaConfianca:
            typeof contribuicao.notaConfianca === "number"
              ? contribuicao.notaConfianca
              : contribuicao.notaConfianca == null
                ? null
                : Number(contribuicao.notaConfianca),
          observacoes: contribuicao.observacoes ?? null,
          criadoEm: contribuicao.criadoEm,
          aprovadoEm: contribuicao.aprovadoEm ?? null,
          criadoPorNome:
            `${contribuicao.criadoPor?.firstName ?? ""} ${contribuicao.criadoPor?.lastName ?? ""}`.trim() ||
            contribuicao.criadoPor?.email ||
            "Usuario",
          criadoPorEmail: contribuicao.criadoPor?.email ?? "",
          aprovadoPorNome:
            `${contribuicao.aprovadoPor?.firstName ?? ""} ${contribuicao.aprovadoPor?.lastName ?? ""}`.trim() ||
            null,
        }),
      ),
      julgamentosRecentes: (serialized.julgamentos ?? []).map((julgamento: any) => ({
        id: julgamento.id,
        tenantId: julgamento.tenantId,
        tenantNome: julgamento.tenant?.name ?? "Tenant",
        titulo: julgamento.titulo,
        tipoJulgamento: julgamento.tipoJulgamento,
        resultado: julgamento.resultado ?? null,
        dataJulgamento: julgamento.dataJulgamento,
        processoNumero: julgamento.processo?.numero ?? null,
      })),
      analisesRecentes: (serialized.analises ?? []).map((analise: any) => ({
        id: analise.id,
        tenantId: analise.tenantId,
        tenantNome: analise.tenant?.name ?? "Tenant",
        titulo: analise.titulo,
        tipoAnalise: analise.tipoAnalise,
        isPublico: Boolean(analise.isPublico),
        createdAt: analise.createdAt,
      })),
    };

    return {
      success: true,
      data: detalhes,
    };
  } catch (error) {
    logger.error("Erro ao buscar detalhes administrativos da autoridade:", error);

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Erro ao carregar detalhes da autoridade",
    };
  }
}

export async function createJuizTenant(data: {
  nome: string;
  tipoAutoridade?: JuizTipoAutoridade;
  juizBaseId?: string;
  nomeCompleto?: string;
  cpf?: string;
  oab?: string;
  email?: string;
  telefone?: string;
  endereco?: string;
  cidade?: string;
  estado?: string;
  cep?: string;
  dataNascimento?: Date;
  dataPosse?: Date;
  dataAposentadoria?: Date;
  status: JuizStatus;
  nivel: JuizNivel;
  especialidades: EspecialidadeJuridica[];
  vara?: string;
  comarca?: string;
  biografia?: string;
  formacao?: string;
  experiencia?: string;
  premios?: string;
  publicacoes?: string;
  foto?: string;
  website?: string;
  linkedin?: string;
  twitter?: string;
  instagram?: string;
  observacoes?: string;
  tribunalId?: string;
}): Promise<{
  success: boolean;
  juiz?: JuizSerializado;
  error?: string;
}> {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;
    const nome = data.nome?.trim();

    if (!nome) {
      return { success: false, error: "Nome do juiz é obrigatório" };
    }

    const isSuperAdmin = user.role === "SUPER_ADMIN";

    if (data.tribunalId) {
      const tribunal = await prisma.tribunal.findFirst({
        where: isSuperAdmin
          ? { id: data.tribunalId }
          : {
              id: data.tribunalId,
              OR: [{ tenantId: null }, { tenantId: user.tenantId }],
            },
        select: { id: true },
      });

      if (!tribunal) {
        return { success: false, error: "Tribunal informado não encontrado" };
      }
    }

    if (!isSuperAdmin) {
      if (!user.tenantId) {
        return { success: false, error: "Tenant não encontrado" };
      }

      if (!canManageJudgeByRole(user.role)) {
        const canCreate = await hasJudgePermission("criar");
        if (!canCreate) {
          return { success: false, error: "Sem permissão para cadastrar juízes" };
        }
      }
    }

    if (isSuperAdmin) {
      const juiz = await prisma.juiz.create({
        data: {
          ...data,
          nome,
          tipoAutoridade: data.tipoAutoridade ?? JuizTipoAutoridade.JUIZ,
          superAdminId: user.id,
        },
        include: {
          tribunal: {
            select: {
              id: true,
              nome: true,
              sigla: true,
              esfera: true,
              uf: true,
              siteUrl: true,
            },
          },
          _count: {
            select: {
              processos: true,
              julgamentos: true,
              analises: true,
              favoritos: {
                where: {
                  ativo: true,
                },
              },
            },
          },
        },
      });

      const converted = convertAllDecimalFields(juiz) as JuizSerializado;
      const serialized = JSON.parse(
        JSON.stringify(converted, (key, value) => {
          if (
            value &&
            typeof value === "object" &&
            value.constructor &&
            value.constructor.name === "Decimal"
          ) {
            return Number(value.toString());
          }

          return value;
        }),
      );

      return {
        success: true,
        juiz: decorateAuthorityPendingMetadata(serialized),
      };
    }

    const tenantId = user.tenantId as string;
    const { juizBaseId, ...tenantJudgeData } = data;
    const cpfDigits = data.cpf?.replace(/\D/g, "") || "";
    let juizId: string;

    try {
      juizId = await prisma.$transaction(async (tx) => {
        let juiz = null as { id: string } | null;

        if (juizBaseId) {
          const juizBase = await tx.juiz.findUnique({
            where: { id: juizBaseId },
            select: { id: true },
          });

          if (!juizBase) {
            throw new Error("Juiz selecionado não encontrado");
          }

          juiz = { id: juizBase.id };
        }

        if (!juiz && cpfDigits.length === 11) {
          juiz = await tx.juiz.findFirst({
            where: {
              OR: [{ cpf: cpfDigits }, { cpf: data.cpf?.trim() || "" }],
            },
            select: { id: true },
          });
        }

        if (!juiz) {
          const candidates = await tx.juiz.findMany({
            where: {
              OR: [
                { nome: { equals: nome, mode: "insensitive" } },
                { nomeCompleto: { equals: nome, mode: "insensitive" } },
              ],
            },
            select: {
              id: true,
              nome: true,
              nomeCompleto: true,
            },
            take: 20,
          });

          const normalizedTarget = normalizeJudgeName(nome);
          const exact = candidates.find((candidate) => {
            const normalizedNome = normalizeJudgeName(candidate.nome);
            const normalizedNomeCompleto = candidate.nomeCompleto
              ? normalizeJudgeName(candidate.nomeCompleto)
              : "";

            return (
              normalizedNome === normalizedTarget ||
              normalizedNomeCompleto === normalizedTarget
            );
          });

          if (exact) {
            juiz = { id: exact.id };
          }
        }

        if (!juiz) {
          const created = await tx.juiz.create({
            data: {
              nome,
              tipoAutoridade: data.tipoAutoridade ?? JuizTipoAutoridade.JUIZ,
              status: data.status ?? JuizStatus.ATIVO,
              nivel: data.nivel ?? JuizNivel.JUIZ_TITULAR,
              especialidades: data.especialidades ?? [],
              isPublico: false,
              isPremium: false,
              superAdminId: null,
            },
            select: {
              id: true,
            },
          });

          juiz = created;
        }

        await ensureTenantJudgeAccess(tenantId, juiz.id, user.id, tx);
        await upsertTenantJudgeProfile(
          tenantId,
          juiz.id,
          user.id,
          {
            ...tenantJudgeData,
            nome,
            cpf: cpfDigits.length === 11 ? cpfDigits : tenantJudgeData.cpf,
          },
          tx,
        );
        await ensureTenantAutoridadeUnlock(tenantId, juiz.id, tx);
        await registerTenantJudgeContribution(
          tenantId,
          juiz.id,
          user.id,
          {
            ...tenantJudgeData,
            nome,
            cpf: cpfDigits.length === 11 ? cpfDigits : tenantJudgeData.cpf,
          },
          tx,
        );

        return juiz.id;
      });
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro ao criar juiz para o tenant",
      };
    }

    const juizCompleto = await prisma.juiz.findFirst({
      where: {
        id: juizId,
        ...buildJuizAccessWhere(tenantId),
      },
      include: {
        tribunal: {
          select: {
            id: true,
            nome: true,
            sigla: true,
            esfera: true,
            uf: true,
            siteUrl: true,
          },
        },
        _count: {
          select: {
            processos: true,
            julgamentos: true,
            analises: true,
            favoritos: {
              where: {
                ativo: true,
              },
            },
          },
        },
      },
    });

    if (!juizCompleto) {
      return { success: false, error: "Não foi possível carregar o juiz criado" };
    }

    const tenantProfile = await prisma.acessoJuiz.findFirst({
      where: {
        tenantId,
        juizId,
        tipoAcesso: TENANT_JUDGE_PROFILE_TYPE,
      },
      orderBy: {
        dataAcesso: "desc",
      },
      select: {
        observacoes: true,
      },
    });

    const converted = convertAllDecimalFields(juizCompleto) as JuizSerializado;
    const serialized = JSON.parse(
      JSON.stringify(converted, (key, value) => {
        if (
          value &&
          typeof value === "object" &&
          value.constructor &&
          value.constructor.name === "Decimal"
        ) {
          return Number(value.toString());
        }

        return value;
      }),
    ) as JuizSerializado;

    const overlay = parseTenantOverlay(tenantProfile?.observacoes ?? null);
    const tenantCountsByJuizId = await getTenantJuizCounts(
      tenantId,
      [juizId],
      { session },
    );
    const judgeWithOverlay = applyTenantOverlay(serialized, overlay);
    const scopedJudge = withScopedCounts(
      judgeWithOverlay,
      tenantCountsByJuizId.get(juizId),
    );
    const pendingSync = await syncAuthorityPendingTaskForAuthority({
      tenantId,
      juizId,
      authority: buildAuthorityCoreFromJudge(scopedJudge),
      createdById: user.id,
      preferredResponsavelId: user.id,
    });

    revalidatePath("/juizes");
    revalidatePath("/dashboard");
    revalidatePath("/tarefas");

    return {
      success: true,
      juiz: decorateAuthorityPendingMetadata(scopedJudge, {
        id: pendingSync.metadata.tarefaPendenciaId,
        responsavel: pendingSync.metadata.responsavelPendencia,
      }),
    };
  } catch (error) {
    logger.error("Erro ao criar juiz:", error);

    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao criar juiz",
    };
  }
}

export async function updateJuizTenant(
  juizId: string,
  data: {
    tipoAutoridade?: JuizTipoAutoridade;
    nome?: string;
    nomeCompleto?: string;
    cpf?: string;
    oab?: string;
    email?: string;
    telefone?: string;
    endereco?: string;
    cidade?: string;
    estado?: string;
    cep?: string;
    dataNascimento?: Date;
    dataPosse?: Date;
    dataAposentadoria?: Date;
    status?: JuizStatus;
    nivel?: JuizNivel;
    especialidades?: EspecialidadeJuridica[];
    vara?: string;
    comarca?: string;
    biografia?: string;
    formacao?: string;
    experiencia?: string;
    premios?: string;
    publicacoes?: string;
    foto?: string;
    website?: string;
    linkedin?: string;
    twitter?: string;
    instagram?: string;
    observacoes?: string;
    tribunalId?: string;
  },
): Promise<{
  success: boolean;
  juiz?: JuizSerializado;
  error?: string;
}> {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;
    const isSuperAdmin = user.role === "SUPER_ADMIN";

    if (data.tribunalId) {
      const tribunal = await prisma.tribunal.findFirst({
        where: isSuperAdmin
          ? { id: data.tribunalId }
          : {
              id: data.tribunalId,
              OR: [{ tenantId: null }, { tenantId: user.tenantId }],
            },
        select: { id: true },
      });

      if (!tribunal) {
        return { success: false, error: "Tribunal informado não encontrado" };
      }
    }

    if (!isSuperAdmin) {
      if (!user.tenantId) {
        return { success: false, error: "Tenant não encontrado" };
      }

      if (!canManageJudgeByRole(user.role)) {
        const canEdit = await hasJudgePermission("editar");
        if (!canEdit) {
          return { success: false, error: "Sem permissão para editar juízes" };
        }
      }
    }

    if (isSuperAdmin) {
      const existingJuiz = await prisma.juiz.findFirst({
        where: {
          id: juizId,
          superAdminId: user.id,
        },
      });

      if (!existingJuiz) {
        return { success: false, error: "Juiz não encontrado ou sem permissão" };
      }

      const juiz = await prisma.juiz.update({
        where: { id: juizId },
        data,
        include: {
          tribunal: {
            select: {
              id: true,
              nome: true,
              sigla: true,
              esfera: true,
              uf: true,
              siteUrl: true,
            },
          },
          _count: {
            select: {
              processos: true,
              julgamentos: true,
              analises: true,
              favoritos: {
                where: {
                  ativo: true,
                },
              },
            },
          },
        },
      });

      const converted = convertAllDecimalFields(juiz) as JuizSerializado;
      const serialized = JSON.parse(
        JSON.stringify(converted, (key, value) => {
          if (
            value &&
            typeof value === "object" &&
            value.constructor &&
            value.constructor.name === "Decimal"
          ) {
            return Number(value.toString());
          }

          return value;
        }),
      );

      return {
        success: true,
        juiz: decorateAuthorityPendingMetadata(serialized),
      };
    }

    const tenantId = user.tenantId as string;
    const existingJuiz = await prisma.juiz.findFirst({
      where: {
        id: juizId,
        ...buildJuizAccessWhere(tenantId),
      },
      include: {
        tribunal: {
          select: {
            id: true,
            nome: true,
            sigla: true,
            esfera: true,
            uf: true,
            siteUrl: true,
          },
        },
        _count: {
          select: {
            processos: true,
            julgamentos: true,
            analises: true,
            favoritos: {
              where: {
                ativo: true,
              },
            },
          },
        },
      },
    });

    if (!existingJuiz) {
      return { success: false, error: "Juiz não encontrado ou sem acesso" };
    }

    await prisma.$transaction(async (tx) => {
      await ensureTenantJudgeAccess(tenantId, juizId, user.id, tx);
      await upsertTenantJudgeProfile(tenantId, juizId, user.id, data, tx);
      await ensureTenantAutoridadeUnlock(tenantId, juizId, tx);
      await registerTenantJudgeContribution(tenantId, juizId, user.id, data, tx);
    });

    const tenantProfile = await prisma.acessoJuiz.findFirst({
      where: {
        tenantId,
        juizId,
        tipoAcesso: TENANT_JUDGE_PROFILE_TYPE,
      },
      orderBy: {
        dataAcesso: "desc",
      },
      select: {
        observacoes: true,
      },
    });

    const converted = convertAllDecimalFields(existingJuiz) as JuizSerializado;
    const serialized = JSON.parse(
      JSON.stringify(converted, (key, value) => {
        if (
          value &&
          typeof value === "object" &&
          value.constructor &&
          value.constructor.name === "Decimal"
        ) {
          return Number(value.toString());
        }

        return value;
      }),
    ) as JuizSerializado;

    const overlay = parseTenantOverlay(tenantProfile?.observacoes ?? null);
    const tenantCountsByJuizId = await getTenantJuizCounts(
      tenantId,
      [juizId],
      { session },
    );
    const judgeWithOverlay = applyTenantOverlay(serialized, overlay);
    const scopedJudge = withScopedCounts(
      judgeWithOverlay,
      tenantCountsByJuizId.get(juizId),
    );
    const pendingSync = await syncAuthorityPendingTaskForAuthority({
      tenantId,
      juizId,
      authority: buildAuthorityCoreFromJudge(scopedJudge),
      createdById: user.id,
      preferredResponsavelId: user.id,
    });

    revalidatePath("/juizes");
    revalidatePath("/dashboard");
    revalidatePath("/tarefas");

    return {
      success: true,
      juiz: decorateAuthorityPendingMetadata(scopedJudge, {
        id: pendingSync.metadata.tarefaPendenciaId,
        responsavel: pendingSync.metadata.responsavelPendencia,
      }),
    };
  } catch (error) {
    logger.error("Erro ao atualizar juiz:", error);

    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao atualizar juiz",
    };
  }
}

export async function reassignAuthorityPendingTaskTenant(
  juizId: string,
  responsavelId: string,
): Promise<{
  success: boolean;
  metadata?: AuthorityPendingMetadata;
  error?: string;
}> {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Nao autorizado" };
    }

    const user = session.user as any;

    if (!user.tenantId) {
      return { success: false, error: "Tenant nao encontrado" };
    }

    if (!canManageJudgeByRole(user.role)) {
      const canEdit = await hasJudgePermission("editar");
      if (!canEdit) {
        return {
          success: false,
          error: "Sem permissao para reatribuir a pendencia da autoridade",
        };
      }
    }

    const existingJuiz = await prisma.juiz.findFirst({
      where: {
        id: juizId,
        ...buildJuizAccessWhere(user.tenantId),
      },
      include: {
        tribunal: {
          select: {
            id: true,
            nome: true,
            sigla: true,
            esfera: true,
            uf: true,
            siteUrl: true,
          },
        },
      },
    });

    if (!existingJuiz) {
      return { success: false, error: "Autoridade nao encontrada ou sem acesso" };
    }

    const tenantProfile = await prisma.acessoJuiz.findFirst({
      where: {
        tenantId: user.tenantId,
        juizId,
        tipoAcesso: TENANT_JUDGE_PROFILE_TYPE,
      },
      orderBy: {
        dataAcesso: "desc",
      },
      select: {
        observacoes: true,
      },
    });

    const converted = convertAllDecimalFields(existingJuiz) as JuizSerializado;
    const serialized = JSON.parse(
      JSON.stringify(converted, (key, value) => {
        if (
          value &&
          typeof value === "object" &&
          value.constructor &&
          value.constructor.name === "Decimal"
        ) {
          return Number(value.toString());
        }

        return value;
      }),
    ) as JuizSerializado;

    const overlay = parseTenantOverlay(tenantProfile?.observacoes ?? null);
    const authority = applyTenantOverlay(serialized, overlay);
    const metadata = await reassignAuthorityPendingTask({
      tenantId: user.tenantId,
      juizId,
      responsavelId,
      atribuidoPorId: user.id,
      atribuidoPorNome:
        [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
        user.email ||
        "Responsavel do escritorio",
      authority: buildAuthorityCoreFromJudge(authority),
    });

    revalidatePath("/juizes");
    revalidatePath("/dashboard");
    revalidatePath("/tarefas");

    return {
      success: true,
      metadata,
    };
  } catch (error) {
    logger.error("Erro ao reatribuir pendencia da autoridade:", error);

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Erro ao reatribuir pendencia da autoridade",
    };
  }
}

export async function deleteJuizTenant(juizId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;
    const isSuperAdmin = user.role === "SUPER_ADMIN";

    if (!isSuperAdmin) {
      if (!user.tenantId) {
        return { success: false, error: "Tenant não encontrado" };
      }

      if (!canManageJudgeByRole(user.role)) {
        const canDelete = await hasJudgePermission("excluir");
        if (!canDelete) {
          return { success: false, error: "Sem permissão para excluir juízes" };
        }
      }
    }

    if (isSuperAdmin) {
      const existingJuiz = await prisma.juiz.findFirst({
        where: {
          id: juizId,
          superAdminId: user.id,
        },
      });

      if (!existingJuiz) {
        return { success: false, error: "Juiz não encontrado ou sem permissão" };
      }

      const processosCount = await prisma.processo.count({
        where: { juizId },
      });

      if (processosCount > 0) {
        return {
          success: false,
          error: "Não é possível excluir juiz com processos vinculados",
        };
      }

      await prisma.juiz.update({
        where: { id: juizId },
        data: {
          status: "INATIVO",
        },
      });

      return { success: true };
    }

    const tenantId = user.tenantId as string;
    const existingJuiz = await prisma.juiz.findFirst({
      where: {
        id: juizId,
        ...buildJuizAccessWhere(tenantId),
      },
      select: { id: true },
    });

    if (!existingJuiz) {
      return { success: false, error: "Juiz não encontrado ou sem acesso" };
    }

    const processosTenantCount = await prisma.processo.count({
      where: {
        tenantId,
        juizId,
        deletedAt: null,
      },
    });

    if (processosTenantCount > 0) {
      return {
        success: false,
        error:
          "Não é possível remover este juiz: há processos vinculados no escritório",
      };
    }

    await prisma.$transaction(async (tx) => {
      await tx.favoritoJuiz.updateMany({
        where: {
          tenantId,
          juizId,
          ativo: true,
        },
        data: {
          ativo: false,
        },
      });

      await tx.acessoJuiz.updateMany({
        where: {
          tenantId,
          juizId,
          tipoAcesso: TENANT_JUDGE_ACCESS_TYPE,
        },
        data: {
          tipoAcesso: TENANT_JUDGE_ACCESS_REVOKED_TYPE,
          observacoes: `Acesso revogado em ${new Date().toISOString()}`,
        },
      });
    });

    return { success: true };
  } catch (error) {
    logger.error("Erro ao excluir juiz:", error);

    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao excluir juiz",
    };
  }
}

export async function uploadJuizFoto(
  formData: FormData,
  juizId: string,
  juizNome: string,
): Promise<{
  success: boolean;
  fotoUrl?: string;
  error?: string;
}> {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;

    // Verificar se o juiz foi criado pelo super admin
    const existingJuiz = await prisma.juiz.findFirst({
      where: {
        id: juizId,
        superAdminId: user.id,
      },
    });

    if (!existingJuiz) {
      return { success: false, error: "Juiz não encontrado ou sem permissão" };
    }

    // Fazer upload para Cloudinary
    const cloudinaryResponse = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });

    if (!cloudinaryResponse.ok) {
      throw new Error("Erro no upload para Cloudinary");
    }

    const uploadResult = await cloudinaryResponse.json();

    if (!uploadResult.success || !uploadResult.url) {
      throw new Error("Upload falhou");
    }

    // Atualizar o juiz com a nova foto
    await prisma.juiz.update({
      where: { id: juizId },
      data: { foto: uploadResult.url },
    });

    return {
      success: true,
      fotoUrl: uploadResult.url,
    };
  } catch (error) {
    logger.error("Erro ao fazer upload da foto do juiz:", error);

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro ao fazer upload da foto",
    };
  }
}

export async function deleteJuizFoto(
  juizId: string,
  currentFotoUrl: string | null,
): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;

    // Verificar se o juiz foi criado pelo super admin
    const existingJuiz = await prisma.juiz.findFirst({
      where: {
        id: juizId,
        superAdminId: user.id,
      },
    });

    if (!existingJuiz) {
      return { success: false, error: "Juiz não encontrado ou sem permissão" };
    }

    // Se há uma foto atual, deletar do Cloudinary
    if (currentFotoUrl) {
      try {
        // Extrair o public_id da URL do Cloudinary
        const urlParts = currentFotoUrl.split("/");
        const publicId = urlParts[urlParts.length - 1].split(".")[0];

        const deleteResponse = await fetch("/api/upload", {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ publicId }),
        });

        if (!deleteResponse.ok) {
          logger.warn(
            "Erro ao deletar foto do Cloudinary:",
            await deleteResponse.text(),
          );
        }
      } catch (deleteError) {
        logger.warn("Erro ao deletar foto do Cloudinary:", deleteError);
        // Continuar mesmo se não conseguir deletar do Cloudinary
      }
    }

    // Atualizar o juiz removendo a foto
    await prisma.juiz.update({
      where: { id: juizId },
      data: { foto: null },
    });

    return { success: true };
  } catch (error) {
    logger.error("Erro ao deletar foto do juiz:", error);

    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao deletar foto",
    };
  }
}
