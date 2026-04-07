"use server";

import { getSession } from "@/app/lib/auth";
import prisma, { convertAllDecimalFields } from "@/app/lib/prisma";
import logger from "@/lib/logger";
import {
  Prisma,
  ProcessoArquivamentoTipo,
  ProcessoFase,
  ProcessoGrau,
  ProcessoPolo,
  ProcessoPrazoStatus,
  ProcessoStatus,
  RitoProcesso,
  TipoPrazoLegal,
} from "@/generated/prisma";
import {
  extractChangedFieldsFromDiff,
  logAudit,
  toAuditJson,
} from "@/app/lib/audit/log";
import { AUDIT_ACTIONS } from "@/app/lib/audit/action-catalog";
import { logUnifiedSensitiveView } from "@/app/lib/audit/unified";
import { buildSoftDeletePayload } from "@/app/lib/soft-delete";
import { ProcessoNotificationIntegration } from "@/app/lib/notifications/examples/processo-integration";
import { HybridNotificationService } from "@/app/lib/notifications/hybrid-notification-service";
import {
  persistCapturedMovimentacoes,
  publishProcessNotificationToLawyers,
} from "@/app/lib/juridical/process-movement-sync";
import { buildProcessoDiff } from "@/app/lib/processos/diff";
import {
  buildProcessoAdvogadoMembershipWhere,
  buildProcessoClienteMembershipWhere,
  decorateProcessoWithVinculos,
  decorateProcessosWithVinculos,
  ensureProcessoClientePartes,
  getProcessoResponsibleUserIds,
  normalizeProcessoLinkInput,
  processoClienteResumoSelect,
  processoClientesRelacionadosInclude,
  processoResponsaveisRelacionadosInclude,
  syncProcessoCausas,
  syncProcessoClientes,
  syncProcessoResponsaveis,
  uniqueOrderedProcessoRelationIds,
} from "@/app/lib/processos/processo-vinculos";
import {
  backfillManagedPrazoPrincipalForWhere,
  syncManagedPrazoPrincipalForProcess,
} from "@/app/lib/processos/prazo-principal-sync";
import { checkPermission } from "@/app/actions/equipe";
import {
  getAccessibleAdvogadoIds,
  getAdvogadoIdFromSession,
} from "@/app/lib/advogado-access";
import { validateDeadlineWithRegime } from "@/app/lib/feriados/prazo-validation";
import {
  buildHolidayScopeFromProcess,
  resolveHolidayImpactForPrazoDraft,
} from "@/app/lib/feriados/holiday-impact-resolver";
import {
  buildHolidayImpactDetailLines,
  parseHolidayImpact,
  type HolidayImpactSnapshot,
} from "@/app/lib/feriados/holiday-impact";
import {
  getLegacyRitoProcessoLabel,
  getPrazoLegalRule,
  normalizeLegacyRitoToRitoProcesso,
} from "@/app/lib/processos/rito-processo";
import {
  buildJusbrasilProcessUserCustom,
  ensureJusbrasilProcessMonitorBestEffort,
} from "@/app/lib/juridical/jusbrasil-process-monitoring";
import { upsertProcessoFromCapture } from "@/app/lib/juridical/processo-persistence";
import {
  getJusbrasilClientFromEnv,
  getTenantJusbrasilIntegrationState,
} from "@/app/lib/juridical/jusbrasil-oab-sync";
import { normalizarProcesso } from "@/lib/api/juridical/normalization";
import { mapJusbrasilTribprocProcessoToProcesso } from "@/lib/api/juridical/jusbrasil-tribproc-normalizer";

// ============================================
// TYPES - Prisma Type Safety (Best Practice)
// ============================================

/**
 * Define a estrutura de query para ProcessoDetalhado usando Prisma.validator
 * Isso garante type-safety entre a query e o tipo derivado
 *
 * Vantagens:
 * - Fonte única da verdade: query = tipo
 * - Type-safe: TypeScript valida que a query está correta
 * - Auto-completado: IDE sugere campos disponíveis
 * - Zero duplicação: tipo deriva automaticamente da query
 * - Impossível desincronizar: erro de compilação se não corresponder
 *
 * NOTA: NÃO exportado porque "use server" files só podem exportar async functions
 */
const processoCausasInclude = {
  causasVinculadas: {
    include: {
      causa: {
        select: {
          id: true,
          nome: true,
          codigoCnj: true,
          descricao: true,
          ativo: true,
        },
      },
    },
    orderBy: [
      { principal: "desc" },
      { createdAt: "asc" },
    ] as Prisma.ProcessoCausaOrderByWithRelationInput[],
  },
} as const;

const processoDetalhadoInclude = Prisma.validator<Prisma.ProcessoDefaultArgs>()(
  {
    include: {
      area: {
        select: {
          id: true,
          nome: true,
          slug: true,
        },
      },
      cliente: {
        select: {
          id: true,
          nome: true,
          email: true,
          telefone: true,
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
              email: true,
              avatarUrl: true,
            },
          },
        },
      },
      ...processoClientesRelacionadosInclude,
      ...processoResponsaveisRelacionadosInclude,
      ...processoCausasInclude,
      juiz: {
        select: {
          id: true,
          nome: true,
          nomeCompleto: true,
          vara: true,
          comarca: true,
          nivel: true,
          status: true,
          especialidades: true,
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
      },
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
      partes: {
        where: {
          deletedAt: null,
        },
        select: {
          id: true,
          tenantId: true,
          processoId: true,
          tipoPolo: true,
          nome: true,
          documento: true,
          email: true,
          telefone: true,
          clienteId: true,
          advogadoId: true,
          papel: true,
          observacoes: true,
          cliente: {
            select: {
              id: true,
              nome: true,
            },
          },
          advogado: {
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
        },
        orderBy: {
          createdAt: "asc",
        },
      },
      prazos: {
        where: {
          deletedAt: null,
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
          origemMovimentacao: {
            select: {
              id: true,
              titulo: true,
              dataMovimentacao: true,
            },
          },
          origemEvento: {
            select: {
              id: true,
              titulo: true,
              tipo: true,
              dataInicio: true,
            },
          },
          regimePrazo: {
            select: {
              id: true,
              nome: true,
              tipo: true,
              contarDiasUteis: true,
            },
          },
        },
        orderBy: {
          dataVencimento: "asc",
        },
      },
      procuracoesVinculadas: {
        include: {
          procuracao: {
            include: {
              outorgados: {
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
                },
              },
              assinaturas: true,
              poderes: true,
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
);

/**
 * Tipo derivado automaticamente da query do Prisma
 * Substitui ~200 linhas de interface manual por 1 linha type-safe
 *
 * 🎯 BENEFÍCIOS:
 * - Impossível desincronizar query e tipo (erro de compilação se não corresponder)
 * - Adicionar campo na query = tipo atualiza automaticamente
 * - Remover campo = TypeScript avisa todos os lugares que quebram
 * - Auto-complete perfeito na IDE
 * - 57% menos código para manter
 *
 * 💡 NOTA: As interfaces legacy (Processo, ProcessoDetalhado, etc) são mantidas
 * por compatibilidade, mas futuros códigos devem preferir usar este tipo derivado.
 */
type ProcessoDetalhadoFromPrisma = Prisma.ProcessoGetPayload<
  typeof processoDetalhadoInclude
>;

// ============================================
// TYPES - Legacy Interfaces (mantidos para compatibilidade)
// ============================================

export interface Processo {
  id: string;
  tenantId: string;
  numero: string;
  numeroCnj: string | null;
  grau: ProcessoGrau | null;
  fase: ProcessoFase | null;
  titulo: string | null;
  descricao: string | null;
  status: ProcessoStatus;
  arquivamentoTipo: ProcessoArquivamentoTipo | null;
  areaId: string | null;
  classeProcessual: string | null;
  orgaoJulgador: string | null;
  vara: string | null;
  comarca: string | null;
  foro: string | null;
  dataDistribuicao: Date | null;
  segredoJustica: boolean;
  valorCausa: number | null;
  rito: string | null;
  ritoProcesso: RitoProcesso | null;
  clienteId: string;
  clienteIds?: string[];
  advogadoResponsavelId: string | null;
  advogadoResponsavelIds?: string[];
  juizId: string | null;
  tribunalId: string | null;
  tags: Prisma.JsonValue | null;
  origemSincronizacaoExterna?: boolean;
  prazoPrincipal: Date | null;
  numeroInterno: string | null;
  pastaCompartilhadaUrl: string | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  partes?: ProcessoParte[];
  prazos?: ProcessoPrazo[];
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
      email: string | null;
      avatarUrl?: string | null;
    } | null;
  }>;
  causasVinculadas?: Array<{
    id: string;
    tenantId?: string;
    processoId?: string;
    causaId: string;
    principal: boolean;
    causa: {
      id: string;
      nome: string;
      codigoCnj: string | null;
      descricao?: string | null;
      ativo?: boolean;
    };
  }>;
}

export interface ProcessoParte {
  id: string;
  tenantId: string;
  processoId: string;
  tipoPolo: ProcessoPolo;
  nome: string;
  documento: string | null;
  email: string | null;
  telefone: string | null;
  clienteId: string | null;
  advogadoId: string | null;
  papel: string | null;
  observacoes: string | null;
  cliente?: {
    id: string;
    nome: string;
  } | null;
  advogado?: {
    id: string;
    oabNumero: string | null;
    oabUf: string | null;
    usuario: {
      firstName: string | null;
      lastName: string | null;
    } | null;
  } | null;
}

export interface ProcessoPrazo {
  id: string;
  tenantId: string;
  processoId: string;
  titulo: string;
  descricao: string | null;
  fundamentoLegal: string | null;
  tipoPrazoLegal: TipoPrazoLegal | null;
  status: ProcessoPrazoStatus;
  dataVencimento: Date;
  dataCumprimento: Date | null;
  prorrogadoPara: Date | null;
  holidayImpact?: HolidayImpactSnapshot | null;
  responsavelId: string | null;
  responsavel?: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
  } | null;
  origemMovimentacao?: {
    id: string;
    titulo: string;
    dataMovimentacao: Date;
  } | null;
  origemEvento?: {
    id: string;
    titulo: string;
    tipo: string;
    dataInicio: Date;
  } | null;
  regimePrazo?: {
    id: string;
    nome: string;
    tipo: string;
    contarDiasUteis: boolean;
  } | null;
}

export interface ProcessoDetalhado extends Processo {
  area: {
    id: string;
    nome: string;
    slug: string;
  } | null;
  cliente: {
    id: string;
    nome: string;
    email: string | null;
    telefone: string | null;
    tipoPessoa: string;
  };
  advogadoResponsavel: {
    id: string;
    oabNumero: string | null;
    oabUf: string | null;
    usuario: {
      firstName: string | null;
      lastName: string | null;
      email: string;
      avatarUrl: string | null;
    };
  } | null;
  juiz: {
    id: string;
    nome: string;
    nomeCompleto: string | null;
    vara: string | null;
    comarca: string | null;
    nivel: string | null;
    status: string | null;
    especialidades: string[];
    tribunal: {
      id: string;
      nome: string;
      sigla: string | null;
      esfera: string | null;
      uf: string | null;
      siteUrl: string | null;
    } | null;
  } | null;
  tribunal: {
    id: string;
    nome: string;
    sigla: string | null;
    esfera: string | null;
    uf: string | null;
    siteUrl: string | null;
  } | null;
  procuracoesVinculadas: {
    id: string;
    procuracao: {
      id: string;
      numero: string | null;
      arquivoUrl: string | null;
      emitidaEm: Date | null;
      validaAte: Date | null;
      revogadaEm: Date | null;
      ativa: boolean;
      status: string;
      observacoes: string | null;
      outorgados: {
        id: string;
        advogado: {
          id: string;
          oabNumero: string | null;
          oabUf: string | null;
          usuario: {
            firstName: string | null;
            lastName: string | null;
          };
        };
      }[];
      assinaturas: {
        id: string;
        assinanteNome: string;
        assinanteDocumento: string | null;
        assinadaEm: Date | null;
        tipoAssinatura: string;
      }[];
      poderes: {
        id: string;
        titulo: string | null;
        descricao: string;
        ativo: boolean;
      }[];
    };
  }[];
  partes: ProcessoParte[];
  prazos: ProcessoPrazo[];
  _count: {
    documentos: number;
    eventos: number;
    movimentacoes: number;
    tarefas: number;
  };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

async function getClienteIdFromSession(session: {
  user: any;
}): Promise<string | null> {
  if (!session?.user?.id || !session?.user?.tenantId) return null;

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

function getReadableProcessQueryErrorMessage(
  error: unknown,
  fallback: string,
): string {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P1001"
  ) {
    return "Instabilidade temporaria ao acessar o banco de dados. Tente novamente em alguns instantes.";
  }

  return error instanceof Error && error.message ? error.message : fallback;
}

function orderByRequestedIds<T extends { id: string }>(ids: string[], items: T[]) {
  const order = new Map(ids.map((id, index) => [id, index]));

  return [...items].sort(
    (a, b) => (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.id) ?? Number.MAX_SAFE_INTEGER),
  );
}

function haveSameIdMembership(a: string[], b: string[]) {
  const normalize = (values: string[]) =>
    uniqueOrderedProcessoRelationIds(values).sort().join("|");

  return normalize(a) === normalize(b);
}

type TenantJudgeOverlayForProcess = {
  nome?: string;
  nomeCompleto?: string | null;
  vara?: string | null;
  comarca?: string | null;
  nivel?: string | null;
  status?: string | null;
  especialidades?: string[];
  tribunalId?: string | null;
};

function parseTenantJudgeOverlayForProcess(
  raw: string | null,
): TenantJudgeOverlayForProcess {
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    const overlay: TenantJudgeOverlayForProcess = {};

    if (typeof parsed.nome === "string") overlay.nome = parsed.nome;
    if (
      typeof parsed.nomeCompleto === "string" ||
      parsed.nomeCompleto === null
    ) {
      overlay.nomeCompleto = parsed.nomeCompleto as string | null;
    }
    if (typeof parsed.vara === "string" || parsed.vara === null) {
      overlay.vara = parsed.vara as string | null;
    }
    if (typeof parsed.comarca === "string" || parsed.comarca === null) {
      overlay.comarca = parsed.comarca as string | null;
    }
    if (typeof parsed.nivel === "string" || parsed.nivel === null) {
      overlay.nivel = parsed.nivel as string | null;
    }
    if (typeof parsed.status === "string" || parsed.status === null) {
      overlay.status = parsed.status as string | null;
    }
    if (Array.isArray(parsed.especialidades)) {
      overlay.especialidades = parsed.especialidades.filter(
        (value): value is string => typeof value === "string",
      );
    }
    if (typeof parsed.tribunalId === "string" || parsed.tribunalId === null) {
      overlay.tribunalId = parsed.tribunalId as string | null;
    }

    return overlay;
  } catch {
    return {};
  }
}

async function applyTenantJudgeOverlayToProcess(
  tenantId: string,
  juiz: ProcessoDetalhado["juiz"],
): Promise<ProcessoDetalhado["juiz"]> {
  if (!juiz) {
    return juiz;
  }

  const tenantProfile = await prisma.acessoJuiz.findFirst({
    where: {
      tenantId,
      juizId: juiz.id,
      tipoAcesso: "TENANT_PROFILE",
    },
    orderBy: {
      dataAcesso: "desc",
    },
    select: {
      observacoes: true,
    },
  });

  const overlay = parseTenantJudgeOverlayForProcess(
    tenantProfile?.observacoes ?? null,
  );

  if (Object.keys(overlay).length === 0) {
    return juiz;
  }

  const mergedJudge: NonNullable<ProcessoDetalhado["juiz"]> = {
    ...juiz,
    nome: overlay.nome ?? juiz.nome,
    nomeCompleto:
      overlay.nomeCompleto !== undefined
        ? overlay.nomeCompleto
        : juiz.nomeCompleto,
    vara: overlay.vara !== undefined ? overlay.vara : juiz.vara,
    comarca: overlay.comarca !== undefined ? overlay.comarca : juiz.comarca,
    nivel: overlay.nivel !== undefined ? overlay.nivel : juiz.nivel,
    status: overlay.status !== undefined ? overlay.status : juiz.status,
    especialidades: overlay.especialidades ?? juiz.especialidades,
    tribunal: juiz.tribunal,
  };

  if (overlay.tribunalId !== undefined) {
    if (!overlay.tribunalId) {
      mergedJudge.tribunal = null;
    } else if (overlay.tribunalId !== juiz.tribunal?.id) {
      mergedJudge.tribunal = await prisma.tribunal.findUnique({
        where: {
          id: overlay.tribunalId,
        },
        select: {
          id: true,
          nome: true,
          sigla: true,
          esfera: true,
          uf: true,
          siteUrl: true,
        },
      });
    }
  }

  return mergedJudge;
}

async function resolveClientesVinculadosValidos(
  tenantId: string,
  clienteIds: string[],
) {
  const normalizedIds = uniqueOrderedProcessoRelationIds(clienteIds);

  if (normalizedIds.length === 0) {
    return [];
  }

  const clientes = await prisma.cliente.findMany({
    where: {
      tenantId,
      id: {
        in: normalizedIds,
      },
      deletedAt: null,
    },
    select: {
      id: true,
      nome: true,
      email: true,
      telefone: true,
      celular: true,
      documento: true,
      tipoPessoa: true,
    },
  });

  if (clientes.length !== normalizedIds.length) {
    throw new Error("Um ou mais clientes informados não foram encontrados");
  }

  return orderByRequestedIds(normalizedIds, clientes);
}

async function resolveAdvogadosResponsaveisValidos(
  tenantId: string,
  advogadoIds: string[],
) {
  const normalizedIds = uniqueOrderedProcessoRelationIds(advogadoIds);

  if (normalizedIds.length === 0) {
    return [];
  }

  const advogados = await prisma.advogado.findMany({
    where: {
      tenantId,
      id: {
        in: normalizedIds,
      },
    },
    select: {
      id: true,
      oabNumero: true,
      oabUf: true,
      usuario: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          avatarUrl: true,
        },
      },
    },
  });

  if (advogados.length !== normalizedIds.length) {
    throw new Error("Um ou mais responsáveis informados não foram encontrados");
  }

  return orderByRequestedIds(normalizedIds, advogados);
}

async function buildProcessReadWhereClause(
  session: { user: any },
  processoId: string,
): Promise<{
  whereClause: Prisma.ProcessoWhereInput;
  isCliente: boolean;
}> {
  const user = session.user as any;
  const clienteId = await getClienteIdFromSession(session);
  const isCliente = !!clienteId;

  const whereClause: Prisma.ProcessoWhereInput = {
    id: processoId,
    tenantId: user.tenantId,
    deletedAt: null,
  };

  if (isCliente) {
    whereClause.AND = [buildProcessoClienteMembershipWhere(clienteId)];

    return { whereClause, isCliente };
  }

  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
    const accessibleAdvogados = await getAccessibleAdvogadoIds(session);
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
        OR: [
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
          {
            clientesRelacionados: {
              some: {
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
            },
          },
        ],
      },
    ];

    if (user.role === "ADVOGADO") {
      orConditions.push({
        OR: [
          {
            cliente: {
              usuario: {
                createdById: user.id,
              },
            },
          },
          {
            clientesRelacionados: {
              some: {
                cliente: {
                  usuario: {
                    createdById: user.id,
                  },
                },
              },
            },
          },
        ],
      });
    }

    whereClause.OR = orConditions;
  }

  return { whereClause, isCliente };
}

async function ensureProcessMutationAccess(
  session: { user: any } | null,
  processoId: string,
) {
  if (!session?.user) {
    throw new Error("Não autorizado");
  }

  const user = session.user as any;

  if (!user.tenantId) {
    throw new Error("Tenant não encontrado");
  }

  const processo = await prisma.processo.findFirst({
    where: {
      id: processoId,
      tenantId: user.tenantId,
      deletedAt: null,
    },
    select: {
      id: true,
      tenantId: true,
      clienteId: true,
      advogadoResponsavelId: true,
      numero: true,
      status: true,
      arquivamentoTipo: true,
      titulo: true,
      descricao: true,
      fase: true,
      grau: true,
      numeroInterno: true,
      numeroCnj: true,
      classeProcessual: true,
      vara: true,
      comarca: true,
      foro: true,
      prazoPrincipal: true,
      valorCausa: true,
      rito: true,
      ritoProcesso: true,
      areaId: true,
      tribunalId: true,
      juizId: true,
      pastaCompartilhadaUrl: true,
      cliente: {
        select: {
          id: true,
          nome: true,
        },
      },
      clientesRelacionados: {
        select: {
          clienteId: true,
          cliente: {
            select: {
              id: true,
              nome: true,
            },
          },
        },
        orderBy: [{ ordem: "asc" }, { createdAt: "asc" }],
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
      responsaveis: {
        select: {
          advogadoId: true,
          advogado: {
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
        orderBy: [{ isPrincipal: "desc" }, { ordem: "asc" }, { createdAt: "asc" }],
      },
      area: {
        select: {
          id: true,
          nome: true,
        },
      },
      tribunal: {
        select: {
          id: true,
          nome: true,
          uf: true,
        },
      },
      juiz: {
        select: {
          id: true,
          nome: true,
        },
      },
    },
  });

  if (!processo) {
    throw new Error("Processo não encontrado");
  }

  const role: string = user.role;

  if (role === "ADMIN" || role === "SUPER_ADMIN" || role === "SECRETARIA") {
    return { user, processo };
  }

  if (role === "ADVOGADO") {
    const advogadoId = await getAdvogadoIdFromSession(session);

    if (!advogadoId) {
      throw new Error("Advogado não encontrado");
    }

    const clienteIdsDoProcesso = uniqueOrderedProcessoRelationIds([
      processo.clienteId,
      ...processo.clientesRelacionados.map((item) => item.clienteId),
    ]);
    const isResponsavel =
      processo.advogadoResponsavelId === advogadoId ||
      processo.responsaveis.some((item) => item.advogadoId === advogadoId);

    const possuiVinculoCliente = await prisma.advogadoCliente.findFirst({
      where: {
        advogadoId,
        clienteId: {
          in: clienteIdsDoProcesso,
        },
        tenantId: user.tenantId,
      },
      select: { id: true },
    });

    const possuiProcuracao = await prisma.procuracaoProcesso.findFirst({
      where: {
        processoId,
        tenantId: user.tenantId,
        deletedAt: null,
        procuracao: {
          outorgados: {
            some: {
              advogadoId,
            },
          },
        },
      },
      select: { id: true },
    });

    if (!isResponsavel && !possuiVinculoCliente && !possuiProcuracao) {
      throw new Error("Você não tem permissão para alterar este processo");
    }

    return { user, processo, advogadoId };
  }

  throw new Error("Você não tem permissão para alterar este processo");
}

async function ensurePrazoMutationAccess(
  session: { user: any } | null,
  prazoId: string,
) {
  const prazo = await prisma.processoPrazo.findFirst({
    where: {
      id: prazoId,
      deletedAt: null,
    },
    select: {
      id: true,
      processoId: true,
      tenantId: true,
    },
  });

  if (!prazo) {
    throw new Error("Prazo não encontrado");
  }

  const context = await ensureProcessMutationAccess(session, prazo.processoId);

  return { ...context, prazo };
}

async function ensureParteMutationAccess(
  session: { user: any } | null,
  parteId: string,
) {
  const parte = await prisma.processoParte.findFirst({
    where: {
      id: parteId,
      deletedAt: null,
    },
    select: {
      id: true,
      processoId: true,
      tenantId: true,
    },
  });

  if (!parte) {
    throw new Error("Parte não encontrada");
  }

  const context = await ensureProcessMutationAccess(session, parte.processoId);

  return { ...context, parte };
}

const processoParteInclude = {
  cliente: {
    select: {
      id: true,
      nome: true,
    },
  },
  advogado: {
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
} satisfies Prisma.ProcessoParteInclude;

const processoPrazoInclude = {
  responsavel: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
    },
  },
  origemMovimentacao: {
    select: {
      id: true,
      titulo: true,
      dataMovimentacao: true,
    },
  },
  origemEvento: {
    select: {
      id: true,
      titulo: true,
      tipo: true,
      dataInicio: true,
    },
  },
  regimePrazo: {
    select: {
      id: true,
      nome: true,
      tipo: true,
      contarDiasUteis: true,
    },
  },
} satisfies Prisma.ProcessoPrazoInclude;

const procuracaoProcessoInclude = {
  procuracao: {
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
                },
              },
            },
          },
        },
      },
      assinaturas: {
        select: {
          id: true,
          assinanteNome: true,
          assinanteDocumento: true,
          assinadaEm: true,
          tipoAssinatura: true,
        },
      },
      poderes: {
        select: {
          id: true,
          titulo: true,
          descricao: true,
          ativo: true,
        },
      },
    },
  },
} satisfies Prisma.ProcuracaoProcessoInclude;

// ============================================
// ACTIONS - LISTAGEM
// ============================================

const EXTERNAL_SYNC_TAG = "origem:sincronizacao_externa";

function normalizeProcessNumberForMatch(value?: string | null) {
  if (!value) return "";
  return value.replace(/\D/g, "");
}

function hasExternalSyncTag(tags: Prisma.JsonValue | null | undefined) {
  if (!Array.isArray(tags)) {
    return false;
  }

  return tags.some(
    (tag) =>
      typeof tag === "string" &&
      tag.trim().toLowerCase() === EXTERNAL_SYNC_TAG,
  );
}

function parseDateInput(
  value: string | Date,
  fieldLabel: string,
): { ok: true; date: Date } | { ok: false; error: string } {
  const parsed = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return {
      ok: false,
      error: `${fieldLabel} inválido(a).`,
    };
  }

  return { ok: true, date: parsed };
}

function parseNullableDateInput(
  value: string | Date | null | undefined,
  fieldLabel: string,
): { ok: true; date: Date | null } | { ok: false; error: string } {
  if (value === undefined || value === null || value === "") {
    return { ok: true, date: null };
  }

  const parsed = parseDateInput(value, fieldLabel);

  if (!parsed.ok) {
    return parsed;
  }

  return { ok: true, date: parsed.date };
}

function normalizeArquivamentoTipo(
  status: ProcessoStatus | null | undefined,
  arquivamentoTipo: ProcessoArquivamentoTipo | null | undefined,
): ProcessoArquivamentoTipo | null {
  if (status !== ProcessoStatus.ARQUIVADO) {
    return null;
  }

  return arquivamentoTipo ?? null;
}

function normalizeAuditDate(value?: Date | string | null): string | null {
  if (!value) {
    return null;
  }

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function buildPrazoAuditSnapshot(prazo: {
  id: string;
  titulo: string;
  descricao?: string | null;
  fundamentoLegal?: string | null;
  tipoPrazoLegal?: TipoPrazoLegal | null;
  status: ProcessoPrazoStatus;
  dataVencimento: Date | string;
  prorrogadoPara?: Date | string | null;
  dataCumprimento?: Date | string | null;
  responsavelId?: string | null;
  origemMovimentacaoId?: string | null;
  origemEventoId?: string | null;
  regimePrazoId?: string | null;
  holidayImpact?: HolidayImpactSnapshot | null;
}): Record<string, string | null> {
  return {
    titulo: prazo.titulo ?? null,
    descricao: prazo.descricao ?? null,
    fundamentoLegal: prazo.fundamentoLegal ?? null,
    tipoPrazoLegal: prazo.tipoPrazoLegal ?? null,
    status: prazo.status ?? null,
    dataVencimento: normalizeAuditDate(prazo.dataVencimento),
    prorrogadoPara: normalizeAuditDate(prazo.prorrogadoPara ?? null),
    dataCumprimento: normalizeAuditDate(prazo.dataCumprimento ?? null),
    responsavelId: prazo.responsavelId ?? null,
    origemMovimentacaoId: prazo.origemMovimentacaoId ?? null,
    origemEventoId: prazo.origemEventoId ?? null,
    regimePrazoId: prazo.regimePrazoId ?? null,
    holidayImpactEffectiveDate: normalizeAuditDate(
      prazo.holidayImpact?.effectiveDate ?? null,
    ),
    holidayImpactSummary: prazo.holidayImpact?.summary ?? null,
  };
}

function buildPrazoAuditDiff(
  previous: Record<string, string | null>,
  current: Record<string, string | null>,
) {
  const fields = Object.keys(previous);

  return fields.flatMap((field) => {
    if (previous[field] === current[field]) {
      return [];
    }

    return [
      {
        field,
        previous: previous[field],
        current: current[field],
      },
    ];
  });
}

async function buildPrazoHolidayImpact(params: {
  tenantId: string;
  processo: {
    ritoProcesso?: RitoProcesso | null;
    tribunalId?: string | null;
    comarca?: string | null;
    tribunal?: {
      uf?: string | null;
    } | null;
  };
  regimePrazoId?: string | null;
  dataVencimento: Date;
  prorrogadoPara?: Date | null;
}) {
  return resolveHolidayImpactForPrazoDraft({
    tenantId: params.tenantId,
    baseDate: params.prorrogadoPara ?? params.dataVencimento,
    ritoProcesso: params.processo.ritoProcesso ?? null,
    regimePrazoId: params.regimePrazoId ?? null,
    scope: buildHolidayScopeFromProcess({
      tribunalId: params.processo.tribunalId ?? null,
      uf: params.processo.tribunal?.uf ?? null,
      municipio: params.processo.comarca ?? null,
    }),
  });
}

function buildPrazoHolidayNotificationPayload(
  holidayImpact: HolidayImpactSnapshot | null | undefined,
) {
  if (!holidayImpact?.wasShifted) {
    return {};
  }

  return {
    holidayImpact,
    holidayImpactSummary: holidayImpact.summary,
    detailLines: buildHolidayImpactDetailLines(holidayImpact),
  };
}

function resolveCanonicalRitoProcesso(input: {
  ritoProcesso?: RitoProcesso | null;
  rito?: string | null;
}) {
  return input.ritoProcesso ?? normalizeLegacyRitoToRitoProcesso(input.rito);
}

function buildLegacyRitoValue(ritoProcesso?: RitoProcesso | null) {
  return getLegacyRitoProcessoLabel(ritoProcesso) ?? null;
}

function resolvePrazoPayloadDefaults(params: {
  ritoProcesso: RitoProcesso;
  titulo?: string | null;
  fundamentoLegal?: string | null;
  tipoPrazoLegal?: TipoPrazoLegal | null;
}) {
  const rule = getPrazoLegalRule({
    ritoProcesso: params.ritoProcesso,
    tipoPrazoLegal: params.tipoPrazoLegal ?? null,
  });

  const titulo = params.titulo?.trim() || rule?.tituloPadrao || "";
  const fundamentoLegal =
    params.fundamentoLegal?.trim() || rule?.fundamentoLegal || null;

  return {
    titulo,
    fundamentoLegal,
  };
}

async function publishPrazoNotificationToUsers(params: {
  type: "prazo.created" | "prazo.updated";
  tenantId: string;
  userIds: string[];
  payload: Record<string, unknown>;
  urgency?: "CRITICAL" | "HIGH" | "MEDIUM" | "INFO";
  channels?: ("REALTIME" | "EMAIL" | "TELEGRAM" | "PUSH")[];
}) {
  const uniqueUserIds = Array.from(
    new Set(params.userIds.filter((userId) => Boolean(userId?.trim()))),
  );

  for (const userId of uniqueUserIds) {
    await HybridNotificationService.publishNotification({
      type: params.type,
      tenantId: params.tenantId,
      userId,
      payload: params.payload,
      urgency: params.urgency,
      channels: params.channels,
    });
  }
}

/**
 * Busca todos os processos que o usuário pode ver
 * - ADMIN: Todos do tenant
 * - ADVOGADO: Dos clientes vinculados
 * - CLIENTE: Apenas os próprios
 */
export async function getAllProcessos(): Promise<{
  success: boolean;
  processos?: Processo[];
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

    const canViewDocumentos =
      user.role === "ADMIN" || user.role === "SUPER_ADMIN"
        ? true
        : await checkPermission("documentos", "visualizar");

    if (!canViewDocumentos) {
      return {
        success: false,
        error: "Sem permissão para visualizar documentos",
      };
    }

    let whereClause: Prisma.ProcessoWhereInput = {
      tenantId: user.tenantId,
      deletedAt: null,
    };

    // CLIENTE: Apenas seus processos
    const clienteId = await getClienteIdFromSession(session);
    const accessibleAdvogados = await getAccessibleAdvogadoIds(session);
    const isAdmin = user.role === "ADMIN" || user.role === "SUPER_ADMIN";

    if (clienteId) {
      whereClause.AND = [buildProcessoClienteMembershipWhere(clienteId)];
    }
    // ADMIN / SUPER_ADMIN: já acessam toda base
    // Funcionário sem vínculos: acesso total (não aplicar filtros)
    else if (!isAdmin && accessibleAdvogados.length > 0) {
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
          OR: [
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
            {
              clientesRelacionados: {
                some: {
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
              },
            },
          ],
        },
      ];

      if (user.role === "ADVOGADO") {
        orConditions.push({
          OR: [
            {
              cliente: {
                usuario: {
                  createdById: user.id,
                },
              },
            },
            {
              clientesRelacionados: {
                some: {
                  cliente: {
                    usuario: {
                      createdById: user.id,
                    },
                  },
                },
              },
            },
          ],
        });
      }

      whereClause = {
        ...whereClause,
        OR: orConditions,
      };
    }

    const processos = await prisma.processo.findMany({
      where: whereClause,
      include: {
        area: {
          select: {
            id: true,
            nome: true,
            slug: true,
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
        ...processoClientesRelacionadosInclude,
        ...processoResponsaveisRelacionadosInclude,
        ...processoCausasInclude,
        partes: {
          select: {
            id: true,
            tenantId: true,
            processoId: true,
            tipoPolo: true,
            nome: true,
            documento: true,
            email: true,
            telefone: true,
            clienteId: true,
            advogadoId: true,
            papel: true,
            observacoes: true,
            cliente: {
              select: {
                id: true,
                nome: true,
              },
            },
            advogado: {
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
      orderBy: {
        createdAt: "desc",
      },
    });

    const syncAuditLogs = await prisma.auditLog.findMany({
      where: {
        tenantId: user.tenantId,
        acao: "SINCRONIZACAO_INICIAL_OAB_PROCESSOS",
        entidade: "Processo",
      },
      select: {
        dados: true,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 200,
    });

    const syncedProcessNumbers = new Set<string>();
    for (const log of syncAuditLogs) {
      const dados = log.dados as Record<string, unknown> | null;
      const numeros = Array.isArray(dados?.processosNumeros)
        ? dados.processosNumeros
        : [];

      for (const numero of numeros) {
        if (typeof numero !== "string") continue;
        const normalized = normalizeProcessNumberForMatch(numero);
        if (normalized) {
          syncedProcessNumbers.add(normalized);
        }
      }
    }

    // Convert Decimal objects to numbers and serialize
    const convertedProcessos = processos.map((p) =>
      convertAllDecimalFields(p),
    ) as Processo[];

    // Force conversion to plain objects with explicit number conversion
    const serialized = JSON.parse(
      JSON.stringify(convertedProcessos, (key, value) => {
        // If it's a Decimal-like object, convert to number
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

    const processosDecorated = decorateProcessosWithVinculos(serialized).map(
      (processo) => ({
        ...processo,
        origemSincronizacaoExterna:
          hasExternalSyncTag(processo.tags) ||
          syncedProcessNumbers.has(
            normalizeProcessNumberForMatch(processo.numero),
          ) ||
          syncedProcessNumbers.has(
            normalizeProcessNumberForMatch(processo.numeroCnj),
          ),
      }),
    ) as unknown as Processo[];

    return {
      success: true,
      processos: processosDecorated,
    };
  } catch (error) {
    logger.error("Erro ao buscar processos:", error);

    return {
      success: false,
      error: "Erro ao buscar processos",
    };
  }
}

/**
 * Busca processos do cliente logado (para quando usuário É um cliente)
 */
export async function getProcessosDoClienteLogado(): Promise<{
  success: boolean;
  processos?: Processo[];
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

    // Buscar cliente vinculado ao usuário
    const clienteId = await getClienteIdFromSession(session);

    if (!clienteId) {
      return { success: false, error: "Cliente não encontrado" };
    }

    const processos = await prisma.processo.findMany({
      where: {
        tenantId: user.tenantId,
        AND: [buildProcessoClienteMembershipWhere(clienteId)],
        deletedAt: null,
      },
      include: {
        area: {
          select: {
            id: true,
            nome: true,
            slug: true,
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
        ...processoClientesRelacionadosInclude,
        ...processoResponsaveisRelacionadosInclude,
        ...processoCausasInclude,
        partes: {
          select: {
            id: true,
            tenantId: true,
            processoId: true,
            tipoPolo: true,
            nome: true,
            documento: true,
            email: true,
            telefone: true,
            clienteId: true,
            advogadoId: true,
            papel: true,
            observacoes: true,
            cliente: {
              select: {
                id: true,
                nome: true,
              },
            },
            advogado: {
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
          },
        },
        _count: {
          select: {
            documentos: {
              where: { deletedAt: null, visivelParaCliente: true },
            },
            eventos: true,
            movimentacoes: true,
            tarefas: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const convertedProcessos = processos.map((p) =>
      convertAllDecimalFields(p),
    ) as Processo[];

    // Force conversion to plain objects with explicit number conversion
    const serialized = JSON.parse(
      JSON.stringify(convertedProcessos, (key, value) => {
        // If it's a Decimal-like object, convert to number
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
      processos: decorateProcessosWithVinculos(serialized),
    };
  } catch (error) {
    logger.error("Erro ao buscar processos do cliente:", error);

    return {
      success: false,
      error: "Erro ao buscar processos",
    };
  }
}

/**
 * Busca processos de um cliente específico (para advogados)
 */
export async function getProcessosDoCliente(clienteId: string): Promise<{
  success: boolean;
  processos?: Processo[];
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
    const advogadoId = await getAdvogadoIdFromSession(session);

    let clienteWhereClause: Prisma.ClienteWhereInput = {
      id: clienteId,
      tenantId: user.tenantId,
      deletedAt: null,
    };

    // Se não for ADMIN, verificar vínculo com advogado
    if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
      if (!advogadoId) {
        return { success: false, error: "Acesso negado" };
      }

      clienteWhereClause.advogadoClientes = {
        some: {
          advogadoId: advogadoId,
        },
      };
    }

    // Verificar se cliente existe e está acessível
    const cliente = await prisma.cliente.findFirst({
      where: clienteWhereClause,
    });

    if (!cliente) {
      return { success: false, error: "Cliente não encontrado ou sem acesso" };
    }

    const processos = await prisma.processo.findMany({
      where: {
        tenantId: user.tenantId,
        AND: [buildProcessoClienteMembershipWhere(clienteId)],
        deletedAt: null,
      },
      include: {
        area: {
          select: {
            id: true,
            nome: true,
            slug: true,
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
                avatarUrl: true,
              },
            },
          },
        },
        ...processoClientesRelacionadosInclude,
        ...processoResponsaveisRelacionadosInclude,
        ...processoCausasInclude,
        partes: {
          select: {
            id: true,
            tenantId: true,
            processoId: true,
            tipoPolo: true,
            nome: true,
            documento: true,
            email: true,
            telefone: true,
            clienteId: true,
            advogadoId: true,
            papel: true,
            observacoes: true,
            cliente: {
              select: {
                id: true,
                nome: true,
              },
            },
            advogado: {
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
      orderBy: {
        createdAt: "desc",
      },
    });

    const convertedProcessos = processos.map((p) =>
      convertAllDecimalFields(p),
    ) as Processo[];

    // Force conversion to plain objects with explicit number conversion
    const serialized = JSON.parse(
      JSON.stringify(convertedProcessos, (key, value) => {
        // If it's a Decimal-like object, convert to number
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
      processos: decorateProcessosWithVinculos(serialized),
    };
  } catch (error) {
    logger.error("Erro ao buscar processos do cliente:", error);

    return {
      success: false,
      error: "Erro ao buscar processos",
    };
  }
}

// ============================================
// ACTIONS - DETALHES
// ============================================

/**
 * Busca detalhes completos de um processo incluindo procurações
 */
export async function getProcessoDetalhado(processoId: string): Promise<{
  success: boolean;
  processo?: ProcessoDetalhado;
  isCliente?: boolean;
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

    // Verificar se usuário é cliente
    const { whereClause, isCliente } = await buildProcessReadWhereClause(
      session,
      processoId,
    );
    await backfillManagedPrazoPrincipalForWhere({
      tenantId: user.tenantId,
      processWhere: whereClause,
    });
    // Se for cliente, só pode ver seus próprios processos

    // Se for advogado (não admin), verificar acesso
    /* legacy access block removed after centralizing process read access
      const advogadoId = await getAdvogadoIdFromSession(session);

      if (!advogadoId) {
        return { success: false, error: "Acesso negado" };
      }

      // Verificar se advogado tem acesso ao processo:
      // 1. Cliente criado pelo advogado OU
      // 2. Advogado habilitado na procuração do processo
      const whereConditions = [];

      // 1. Cliente criado pelo advogado
      whereConditions.push({
        cliente: {
          usuario: {
            createdById: user.id,
          },
        },
      });

      // 2. Advogado habilitado na procuração
      whereConditions.push({
        procuracoesVinculadas: {
          some: {
            procuracao: {
              outorgados: {
                some: {
                  advogadoId: advogadoId,
                },
              },
            },
          },
        },
      });

      whereClause.OR = whereConditions;
    */

    // ✅ Usa o processoDetalhadoInclude type-safe + sobrescreve _count para lógica condicional
    const processo = await prisma.processo.findFirst({
      where: whereClause,
      ...processoDetalhadoInclude,
      include: {
        ...processoDetalhadoInclude.include,
        // Sobrescreve _count para aplicar lógica de visibilidade para clientes
        _count: {
          select: {
            documentos: {
              where: isCliente
                ? { deletedAt: null, visivelParaCliente: true }
                : { deletedAt: null },
            },
            eventos: true,
            movimentacoes: true,
            tarefas: true,
          },
        },
      },
    });

    if (!processo) {
      return { success: false, error: "Processo não encontrado ou sem acesso" };
    }

    await logUnifiedSensitiveView({
      tenantId: user.tenantId,
      source: "PROCESSOS_ACTION",
      action: AUDIT_ACTIONS.PROCESS_VIEWED,
      entityType: "PROCESSO",
      entityId: processo.id,
      actor: {
        id: user.id,
        tenantId: user.tenantId,
        name: user.name ?? null,
        email: user.email ?? null,
      },
      route: `/processos/${processo.id}`,
      payload: {
        isCliente,
        role: user.role,
      },
    });

    const convertedProcesso = convertAllDecimalFields(
      processo,
    ) as any as ProcessoDetalhado;

    // Force conversion to plain objects with explicit number conversion
    const serialized = JSON.parse(
      JSON.stringify(convertedProcesso, (key, value) => {
        // If it's a Decimal-like object, convert to number
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
    const serializedDecorated = decorateProcessoWithVinculos(serialized);
    serializedDecorated.juiz = await applyTenantJudgeOverlayToProcess(
      user.tenantId,
      serializedDecorated.juiz,
    );

    return {
      success: true,
      processo: serializedDecorated,
      isCliente,
    };
  } catch (error) {
    logger.error("Erro ao buscar detalhes do processo:", error);

    return {
      success: false,
      error: getReadableProcessQueryErrorMessage(
        error,
        "Erro ao buscar processo",
      ),
    };
  }
}

/**
 * Busca documentos de um processo (respeitando visibilidade para cliente)
 */
export type ProcessoDocumento = Prisma.DocumentoGetPayload<{
  include: {
    uploadedBy: {
      select: {
        firstName: true;
        lastName: true;
      };
    };
    versoes: {
      include: {
        uploadedBy: {
          select: {
            firstName: true;
            lastName: true;
            email: true;
          };
        };
        assinadaPor: {
          select: {
            firstName: true;
            lastName: true;
            email: true;
          };
        };
      };
    };
  };
}>;

const DOCUMENT_VERSION_SOFT_DELETE_MARKER = "[SOFT_DELETED_VERSION]";

function getActiveDocumentoVersaoWhere(): Prisma.DocumentoVersaoWhereInput {
  return {
    OR: [
      {
        observacoes: null,
      },
      {
        observacoes: {
          not: {
            startsWith: DOCUMENT_VERSION_SOFT_DELETE_MARKER,
          },
        },
      },
    ],
  };
}

export async function getDocumentosProcesso(processoId: string): Promise<{
  success: boolean;
  documentos?: ProcessoDocumento[];
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

    // Verificar se usuário é cliente
    const { whereClause: whereProcesso, isCliente } =
      await buildProcessReadWhereClause(session, processoId);

    /* legacy access block removed after centralizing process read access
      const advogadoId = await getAdvogadoIdFromSession(session);

      if (!advogadoId) {
        return { success: false, error: "Acesso negado" };
      }

      whereProcesso.OR = [
        {
          cliente: {
            usuario: {
              createdById: user.id,
            },
          },
        },
        {
          procuracoesVinculadas: {
            some: {
              procuracao: {
                outorgados: {
                  some: {
                    advogadoId,
                  },
                },
              },
            },
          },
        },
      ];
    */

    const processo = await prisma.processo.findFirst({
      where: whereProcesso,
    });

    if (!processo) {
      return { success: false, error: "Processo não encontrado" };
    }

    // Buscar documentos
    const whereDocumentos: Prisma.DocumentoWhereInput = {
      tenantId: user.tenantId,
      deletedAt: null,
      OR: [
        { processoId: processoId },
        {
          processosVinculados: {
            some: {
              processoId,
            },
          },
        },
      ],
    };

    // Se for cliente, apenas documentos visíveis
    if (isCliente) {
      whereDocumentos.visivelParaCliente = true;
    } else {
      whereDocumentos.visivelParaEquipe = true;
    }

    const documentos = await prisma.documento.findMany({
      where: whereDocumentos,
      include: {
        uploadedBy: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
        versoes: {
          where: getActiveDocumentoVersaoWhere(),
          include: {
            uploadedBy: {
              select: {
                firstName: true,
                lastName: true,
                email: true,
              },
            },
            assinadaPor: {
              select: {
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
          orderBy: {
            numeroVersao: "desc",
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    await logUnifiedSensitiveView({
      tenantId: user.tenantId,
      source: "PROCESSOS_ACTION",
      action: AUDIT_ACTIONS.PROCESS_DOCUMENTS_VIEWED,
      entityType: "PROCESSO",
      entityId: processoId,
      actor: {
        id: user.id,
        tenantId: user.tenantId,
        name: user.name ?? null,
        email: user.email ?? null,
      },
      route: `/processos/${processoId}`,
      payload: {
        documentos: documentos.length,
        isCliente,
        role: user.role,
      },
    });

    return {
      success: true,
      documentos: documentos,
    };
  } catch (error) {
    logger.error("Erro ao buscar documentos do processo:", error);

    return {
      success: false,
      error: getReadableProcessQueryErrorMessage(
        error,
        "Erro ao buscar documentos",
      ),
    };
  }
}

/**
 * Busca eventos/audiências de um processo
 */
export type ProcessoEvento = Prisma.EventoGetPayload<{
  include: {
    advogadoResponsavel: {
      select: {
        id: true;
        usuario: {
          select: {
            firstName: true;
            lastName: true;
          };
        };
      };
    };
  };
}>;

export async function getEventosProcesso(processoId: string): Promise<{
  success: boolean;
  eventos?: ProcessoEvento[];
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

    const { whereClause: whereProcesso, isCliente } =
      await buildProcessReadWhereClause(session, processoId);

    const processo = await prisma.processo.findFirst({
      where: whereProcesso,
    });

    if (!processo) {
      return { success: false, error: "Processo não encontrado" };
    }

    const eventos = await prisma.evento.findMany({
      where: {
        processoId: processoId,
      },
      include: {
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
      },
      orderBy: {
        dataInicio: "asc",
      },
    });

    await logUnifiedSensitiveView({
      tenantId: user.tenantId,
      source: "PROCESSOS_ACTION",
      action: AUDIT_ACTIONS.PROCESS_EVENTOS_VIEWED,
      entityType: "PROCESSO",
      entityId: processoId,
      actor: {
        id: user.id,
        tenantId: user.tenantId,
        name: user.name ?? null,
        email: user.email ?? null,
      },
      route: `/processos/${processoId}`,
      payload: {
        eventos: eventos.length,
        isCliente,
        role: user.role,
      },
    });

    return {
      success: true,
      eventos: eventos,
    };
  } catch (error) {
    logger.error("Erro ao buscar eventos do processo:", error);

    return {
      success: false,
      error: getReadableProcessQueryErrorMessage(
        error,
        "Erro ao buscar eventos",
      ),
    };
  }
}

/**
 * Busca movimentações de um processo
 */
export type ProcessoMovimentacao = Prisma.MovimentacaoProcessoGetPayload<{
  include: { criadoPor: true };
}>;

export async function getMovimentacoesProcesso(processoId: string): Promise<{
  success: boolean;
  movimentacoes?: ProcessoMovimentacao[];
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

    const { whereClause: whereProcesso, isCliente } =
      await buildProcessReadWhereClause(session, processoId);

    const processo = await prisma.processo.findFirst({
      where: whereProcesso,
    });

    if (!processo) {
      return { success: false, error: "Processo não encontrado" };
    }

    const movimentacoes = await prisma.movimentacaoProcesso.findMany({
      where: {
        processoId: processoId,
      },
      include: { criadoPor: true },
      orderBy: {
        dataMovimentacao: "desc",
      },
    });

    await logUnifiedSensitiveView({
      tenantId: user.tenantId,
      source: "PROCESSOS_ACTION",
      action: AUDIT_ACTIONS.PROCESS_MOVIMENTACOES_VIEWED,
      entityType: "PROCESSO",
      entityId: processoId,
      actor: {
        id: user.id,
        tenantId: user.tenantId,
        name: user.name ?? null,
        email: user.email ?? null,
      },
      route: `/processos/${processoId}`,
      payload: {
        movimentacoes: movimentacoes.length,
        isCliente,
        role: user.role,
      },
    });

    return {
      success: true,
      movimentacoes: movimentacoes,
    };
  } catch (error) {
    logger.error("Erro ao buscar movimentações do processo:", error);

    return {
      success: false,
      error: getReadableProcessQueryErrorMessage(
        error,
        "Erro ao buscar movimentações",
      ),
    };
  }
}

export async function solicitarAtualizacaoJusbrasilProcesso(
  processoId: string,
  options?: {
    includeAttachments?: boolean;
  },
) {
  try {
    const session = await getSession();
    const { user, processo } = await ensureProcessMutationAccess(
      session,
      processoId,
    );

    const tenantId = user.tenantId;
    const integrationState = await getTenantJusbrasilIntegrationState(tenantId);

    if (!integrationState.enabled) {
      return {
        success: false,
        error:
          "A integracao Jusbrasil nao esta ativa para este escritorio.",
      };
    }

    const client = getJusbrasilClientFromEnv();
    if (!client) {
      return {
        success: false,
        error: "JUSBRASIL_API_KEY nao configurada neste ambiente.",
      };
    }

    const numeroProcesso = processo.numeroCnj || processo.numero;
    if (!numeroProcesso?.trim()) {
      return {
        success: false,
        error: "Processo sem numero valido para consulta no Jusbrasil.",
      };
    }

    const callbackId = buildJusbrasilProcessUserCustom({
      tenantId,
      processoId: processo.id,
      numeroProcesso,
    });

    const { data } = await client.getProcessByCnj(numeroProcesso, {
      refreshFromTribunal: true,
      includeAttachments: options?.includeAttachments ?? false,
      updateCallbackId: callbackId,
      timeoutMs: 30_000,
    });

    const mappedProcess = mapJusbrasilTribprocProcessoToProcesso(
      ((data as Record<string, unknown> | null) || {}) as Record<string, unknown>,
    );

    let syncSummary: {
      created: boolean;
      updated: boolean;
      createdMovimentacoes: number;
    } | null = null;

    if (mappedProcess) {
      const processoNormalizado = normalizarProcesso(mappedProcess);
      const persisted = await upsertProcessoFromCapture({
        tenantId,
        processo: processoNormalizado,
        clienteNome: processo.cliente?.nome || undefined,
        advogadoId: processo.advogadoResponsavelId || undefined,
        updateIfExists: true,
        syncJusbrasilProcessMonitor: false,
      });

      const movimentacaoSummary = await persistCapturedMovimentacoes({
        tenantId,
        processoId: persisted.processoId,
        criadoPorId: user.id,
        movimentacoes: processoNormalizado.movimentacoes,
        notifyLawyers: false,
        actorName: "Atualizacao manual via Jusbrasil",
        sourceLabel: "Atualizacao sob demanda no tribunal",
        sourceKind: "EXTERNAL",
      });

      syncSummary = {
        created: persisted.created,
        updated: persisted.updated,
        createdMovimentacoes: movimentacaoSummary.created,
      };
    }

    await logAudit({
      tenantId,
      usuarioId: user.id,
      acao: "PROCESSO_ATUALIZACAO_JUSBRASIL_SOLICITADA",
      entidade: "Processo",
      entidadeId: processoId,
      dados: toAuditJson({
        provider: "JUSBRASIL",
        numeroProcesso,
        includeAttachments: options?.includeAttachments ?? false,
        callbackId,
        syncSummary,
        solicitadoPor: user.id,
        solicitadoEm: new Date().toISOString(),
      }),
      changedFields: [],
    });

    return {
      success: true,
      message: syncSummary
        ? "Atualizacao no tribunal solicitada e dados atuais sincronizados com sucesso."
        : "Atualizacao no tribunal solicitada. O retorno chegara via webhook do Jusbrasil.",
      callbackId,
      syncSummary,
    };
  } catch (error) {
    logger.error("Erro ao solicitar atualizacao via Jusbrasil:", error);

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Erro ao solicitar atualizacao via Jusbrasil",
    };
  }
}

// ============================================
// ACTIONS - CRIAR PROCESSO
// ============================================

export interface ProcessoCreateInput {
  numero: string;
  numeroCnj?: string;
  titulo?: string;
  descricao?: string;
  status?: ProcessoStatus;
  arquivamentoTipo?: ProcessoArquivamentoTipo | null;
  fase?: ProcessoFase;
  grau?: ProcessoGrau;
  areaId?: string;
  classeProcessual?: string;
  causaIds?: string[];
  vara?: string;
  comarca?: string;
  foro?: string;
  orgaoJulgador?: string;
  dataDistribuicao?: Date | string;
  segredoJustica?: boolean;
  valorCausa?: number;
  rito?: string;
  ritoProcesso?: RitoProcesso;
  clienteId?: string;
  clienteIds?: string[];
  advogadoResponsavelId?: string;
  advogadoResponsavelIds?: string[];
  juizId?: string;
  tribunalId?: string;
  numeroInterno?: string;
  pastaCompartilhadaUrl?: string;
  prazoPrincipal?: Date | string;
  partesIniciais?: Array<Pick<ProcessoParteInput, "tipoPolo" | "nome">>;
}

export interface ProcessoUpdateInput extends Partial<ProcessoCreateInput> {
  id?: never;
}

export interface ProcessoParteInput {
  tipoPolo: ProcessoPolo;
  nome?: string;
  documento?: string;
  email?: string;
  telefone?: string;
  clienteId?: string;
  advogadoId?: string;
  papel?: string;
  observacoes?: string;
}

export interface ProcessoParteUpdateInput
  extends Partial<Omit<ProcessoParteInput, "tipoPolo">> {
  tipoPolo?: ProcessoPolo;
}

export interface ProcessoPrazoInput {
  titulo: string;
  descricao?: string;
  fundamentoLegal?: string;
  tipoPrazoLegal?: TipoPrazoLegal | null;
  dataVencimento: Date | string;
  prorrogadoPara?: Date | string | null;
  dataCumprimento?: Date | string | null;
  status?: ProcessoPrazoStatus;
  responsavelId?: string | null;
  origemMovimentacaoId?: string | null;
  origemEventoId?: string | null;
  regimePrazoId?: string | null;
}

export interface ProcessoPrazoUpdateInput extends Partial<ProcessoPrazoInput> {}

function sanitizeProcessoPartesIniciais(
  partes?: ProcessoCreateInput["partesIniciais"],
) {
  return (partes ?? []).map((parte) => ({
    tipoPolo: parte?.tipoPolo ?? ProcessoPolo.AUTOR,
    nome: parte?.nome?.trim() ?? "",
  }));
}

export async function createProcesso(data: ProcessoCreateInput) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;

    if (!user.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    // Verificar permissão para criar processos
    const podeCriar = await checkPermission("processos", "criar");
    let normalizedLinks = normalizeProcessoLinkInput(data);

    if (!podeCriar) {
      return {
        success: false,
        error: "Você não tem permissão para criar processos",
      };
    }

    // Validar campos obrigatórios
    if (!data.numero || normalizedLinks.clienteIds.length === 0 || !data.juizId) {
      return {
        success: false,
        error:
          "Número do processo, cliente e autoridade do caso são obrigatórios",
      };
    }

    // Validar acesso ao cliente
    const cliente = await prisma.cliente.findFirst({
      where: {
        id: normalizedLinks.clienteId!,
        tenantId: user.tenantId,
        deletedAt: null,
      },
      select: {
        id: true,
        nome: true,
        email: true,
        telefone: true,
        celular: true,
        documento: true,
      },
    });

    if (!cliente) {
      return { success: false, error: "Cliente não encontrado" };
    }

    await resolveClientesVinculadosValidos(user.tenantId, normalizedLinks.clienteIds);

    const juiz = await prisma.juiz.findFirst({
      where: {
        id: data.juizId,
        OR: [
          { isPublico: true },
          {
            favoritos: {
              some: {
                tenantId: user.tenantId,
              },
            },
          },
          {
            acessos: {
              some: {
                tenantId: user.tenantId,
              },
            },
          },
        ],
      },
      select: { id: true },
    });

    if (!juiz) {
      return {
        success: false,
        error: "Autoridade informada não encontrada ou sem acesso",
      };
    }

    if (data.tribunalId) {
      const tribunal = await prisma.tribunal.findFirst({
        where: {
          id: data.tribunalId,
          OR: [{ tenantId: null }, { tenantId: user.tenantId }],
        },
        select: { id: true },
      });

      if (!tribunal) {
        return { success: false, error: "Tribunal informado não encontrado" };
      }
    }

    // Se for ADVOGADO, validar vínculo com o cliente
    if (user.role === "ADVOGADO") {
      const advogadoId = await getAdvogadoIdFromSession(session);

      if (!advogadoId) {
        return { success: false, error: "Advogado não encontrado" };
      }

      if (normalizedLinks.advogadoResponsavelIds.length === 0) {
        normalizedLinks = normalizeProcessoLinkInput({
          ...data,
          clienteIds: normalizedLinks.clienteIds,
          advogadoResponsavelIds: [advogadoId],
        });
      }

      const vinculo = await prisma.advogadoCliente.findFirst({
        where: {
          advogadoId,
          clienteId: cliente.id,
          tenantId: user.tenantId,
        },
      });

      if (!vinculo) {
        return { success: false, error: "Você não tem acesso a este cliente" };
      }

      // Se não informou advogado responsável, usar o próprio
      const vinculosSelecionados = await prisma.advogadoCliente.findMany({
        where: {
          advogadoId,
          clienteId: {
            in: normalizedLinks.clienteIds,
          },
          tenantId: user.tenantId,
        },
        select: {
          clienteId: true,
        },
      });

      if (vinculosSelecionados.length !== normalizedLinks.clienteIds.length) {
        return {
          success: false,
          error: "Você não tem acesso a um ou mais clientes selecionados",
        };
      }

      if (!data.advogadoResponsavelId) {
        data.advogadoResponsavelId = advogadoId;
      }
    }

    // Verificar se número do processo já existe
    const advogadosResponsaveisSelecionados =
      await resolveAdvogadosResponsaveisValidos(
        user.tenantId,
        normalizedLinks.advogadoResponsavelIds,
      );

    const processoExistente = await prisma.processo.findFirst({
      where: {
        numero: data.numero,
        tenantId: user.tenantId,
      },
    });

    if (processoExistente) {
      return { success: false, error: "Já existe um processo com este número" };
    }

    const canonicalRitoProcesso = resolveCanonicalRitoProcesso(data);

    if (!canonicalRitoProcesso) {
      return {
        success: false,
        error: "Defina o rito do processo para salvar o cadastro",
      };
    }

    const normalizedStatus = data.status || ProcessoStatus.RASCUNHO;
    const normalizedArquivamentoTipo = normalizeArquivamentoTipo(
      normalizedStatus,
      data.arquivamentoTipo,
    );
    const numeroCnj = data.numeroCnj || data.numero;
    const dataDistribuicao = data.dataDistribuicao
      ? new Date(data.dataDistribuicao)
      : null;
    const prazoPrincipal = data.prazoPrincipal
      ? new Date(data.prazoPrincipal)
      : null;
    const causaIds = uniqueOrderedProcessoRelationIds(data.causaIds ?? []);
    const partesIniciais = sanitizeProcessoPartesIniciais(data.partesIniciais);
    const parteSemNomeIndex = partesIniciais.findIndex((parte) => !parte.nome);

    if (parteSemNomeIndex !== -1) {
      return {
        success: false,
        error: `Informe o nome da parte adicional ${parteSemNomeIndex + 1}`,
      };
    }

    const processo = await prisma.$transaction(async (tx) => {
      const criado = await tx.processo.create({
        data: {
          tenantId: user.tenantId,
          numero: data.numero,
          numeroCnj,
          titulo: data.titulo,
          descricao: data.descricao,
          status: normalizedStatus,
          arquivamentoTipo: normalizedArquivamentoTipo,
          fase: data.fase || null,
          grau: data.grau || null,
          areaId: data.areaId,
          classeProcessual: data.classeProcessual,
          vara: data.vara,
          comarca: data.comarca,
          foro: data.foro,
          orgaoJulgador: data.orgaoJulgador,
          dataDistribuicao,
          segredoJustica: data.segredoJustica || false,
          valorCausa: data.valorCausa,
          rito: buildLegacyRitoValue(canonicalRitoProcesso),
          ritoProcesso: canonicalRitoProcesso,
          clienteId: normalizedLinks.clienteId!,
          advogadoResponsavelId: normalizedLinks.advogadoResponsavelId,
          juizId: data.juizId,
          tribunalId: data.tribunalId,
          numeroInterno: data.numeroInterno,
          pastaCompartilhadaUrl: data.pastaCompartilhadaUrl,
          prazoPrincipal,
        },
        include: {
          cliente: true,
          area: true,
          advogadoResponsavel: {
            include: {
              usuario: true,
            },
          },
          ...processoClientesRelacionadosInclude,
          ...processoResponsaveisRelacionadosInclude,
          ...processoCausasInclude,
          juiz: true,
          tribunal: true,
        },
      });

      await syncProcessoClientes(tx, {
        tenantId: user.tenantId,
        processoId: criado.id,
        clienteIds: normalizedLinks.clienteIds,
      });
      await syncProcessoResponsaveis(tx, {
        tenantId: user.tenantId,
        processoId: criado.id,
        advogadoIds: normalizedLinks.advogadoResponsavelIds,
        advogadoPrincipalId: normalizedLinks.advogadoResponsavelId,
      });
      await ensureProcessoClientePartes(tx, {
        tenantId: user.tenantId,
        processoId: criado.id,
        clienteIds: normalizedLinks.clienteIds,
      });
      await syncProcessoCausas(tx, {
        tenantId: user.tenantId,
        processoId: criado.id,
        causaIds,
      });
      if (partesIniciais.length > 0) {
        await tx.processoParte.createMany({
          data: partesIniciais.map((parte) => ({
            tenantId: user.tenantId,
            processoId: criado.id,
            tipoPolo: parte.tipoPolo,
            nome: parte.nome,
          })),
        });
      }
      await syncManagedPrazoPrincipalForProcess(tx, {
        tenantId: user.tenantId,
        processoId: criado.id,
        prazoPrincipal,
        actorUserId: user.id,
      });

      return criado;
    });

    const convertedProcesso = convertAllDecimalFields(
      processo,
    ) as any as ProcessoDetalhado;

    // Force conversion to plain objects with explicit number conversion
    const serialized = JSON.parse(
      JSON.stringify(convertedProcesso, (key, value) => {
        // If it's a Decimal-like object, convert to number
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

    // Notificação: processo criado (responsável ou usuário atual)
    const serializedDecorated = decorateProcessoWithVinculos(serialized);

    await ensureJusbrasilProcessMonitorBestEffort({
      tenantId: user.tenantId,
      processoId: processo.id,
      numeroProcesso: processo.numeroCnj || processo.numero,
      usuarioId: user.id,
    });

    try {
      const responsavelUserId =
        (processo.advogadoResponsavel?.usuario as any)?.id ||
        (user.id as string);

      await ProcessoNotificationIntegration.notifyProcessoCreated({
        processoId: processo.id,
        numero: processo.numero,
        tenantId: user.tenantId,
        userId: responsavelUserId,
        clienteNome: processo.cliente?.nome,
        advogadoNome: (processo.advogadoResponsavel?.usuario as any)?.firstName,
      });

      const additionalResponsibleUserIds = uniqueOrderedProcessoRelationIds(
        advogadosResponsaveisSelecionados
          .map((advogado) => advogado.usuario?.id)
          .filter((userId) => userId && userId !== responsavelUserId),
      );

      for (const userId of additionalResponsibleUserIds) {
        await ProcessoNotificationIntegration.notifyProcessoCreated({
          processoId: processo.id,
          numero: processo.numero,
          tenantId: user.tenantId,
          userId,
          clienteNome: processo.cliente?.nome,
          advogadoNome: (processo.advogadoResponsavel?.usuario as any)?.firstName,
        });
      }
    } catch (e) {
      logger.warn("Falha ao emitir notificação de processo criado", e);
    }

    try {
      const actorName =
        `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() ||
        (user.email as string | undefined) ||
        "Usuário";
      const auditDados = {
        processoId: processo.id,
        numero: processo.numero,
        clienteId: processo.clienteId,
        clienteIds:
          serializedDecorated.clientesVinculados?.map(
            (item: { id: string }) => item.id,
          ) ?? [
            processo.clienteId,
          ],
        status: processo.status,
        arquivamentoTipo: processo.arquivamentoTipo ?? null,
        titulo: processo.titulo ?? null,
        fase: processo.fase ?? null,
        grau: processo.grau ?? null,
        areaId: processo.areaId ?? null,
        tribunalId: processo.tribunalId ?? null,
        juizId: processo.juizId ?? null,
        advogadoResponsavelId: processo.advogadoResponsavelId ?? null,
        advogadoResponsavelIds:
          serializedDecorated.advogadosResponsaveis?.map(
            (item: { id: string }) => item.id,
          ) ?? [],
        prazoPrincipal: processo.prazoPrincipal ?? null,
        createdAt: processo.createdAt,
        criadoPor: actorName,
        criadoPorId: user.id,
      };

      await logAudit({
        tenantId: user.tenantId,
        usuarioId: user.id,
        acao: "PROCESSO_CRIADO",
        entidade: "Processo",
        entidadeId: processo.id,
        dados: toAuditJson(auditDados),
        previousValues: null,
        changedFields: Object.keys(auditDados),
      });
    } catch (auditError) {
      logger.warn("Falha ao registrar auditoria de processo criado", auditError);
    }

    return {
      success: true,
      processo: serializedDecorated,
    };
  } catch (error) {
    logger.error("Erro ao criar processo:", error);

    return {
      success: false,
      error: "Erro ao criar processo",
    };
  }
}

export async function updateProcesso(
  processoId: string,
  data: ProcessoUpdateInput,
) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const sessionUser = session.user as any;

    if (!sessionUser.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    // Verificar permissão para editar processos
    const podeEditar = await checkPermission("processos", "editar");

    if (!podeEditar) {
      return {
        success: false,
        error: "Você não tem permissão para editar processos",
      };
    }

    const { user, processo } = await ensureProcessMutationAccess(
      session,
      processoId,
    );
    const tenantId = user.tenantId;

    if (!tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    // Validar mudança de cliente para perfis restritos
    const currentClienteIds = uniqueOrderedProcessoRelationIds([
      processo.clienteId,
      ...processo.clientesRelacionados.map((item) => item.clienteId),
    ]);
    const currentAdvogadoIds = uniqueOrderedProcessoRelationIds([
      processo.advogadoResponsavelId,
      ...processo.responsaveis.map((item) => item.advogadoId),
    ]);
    let normalizedLinks = normalizeProcessoLinkInput(
      {
        ...data,
        clienteIds:
          data.clienteIds ??
          (data.clienteId !== undefined ? [data.clienteId] : currentClienteIds),
        advogadoResponsavelIds:
          data.advogadoResponsavelIds ??
          (data.advogadoResponsavelId !== undefined
            ? [data.advogadoResponsavelId]
            : currentAdvogadoIds),
      },
      {
        fallbackClienteId: processo.clienteId,
        fallbackAdvogadoResponsavelId: processo.advogadoResponsavelId,
      },
    );

    if (normalizedLinks.clienteIds.length === 0) {
      return {
        success: false,
        error: "Selecione ao menos um cliente para o processo",
      };
    }

    if (
      (data.clienteId !== undefined || data.clienteIds !== undefined) &&
      !haveSameIdMembership(normalizedLinks.clienteIds, currentClienteIds)
    ) {
      if (user.role === "ADVOGADO") {
        return {
          success: false,
          error: "Advogados não podem alterar o cliente do processo",
        };
      }
    }

    if (data.numero && data.numero !== processo.numero) {
      const existente = await prisma.processo.findFirst({
        where: {
          numero: data.numero,
          tenantId,
          NOT: { id: processoId },
        },
        select: { id: true },
      });

      if (existente) {
        return {
          success: false,
          error: "Já existe um processo com este número",
        };
      }
    }

    await resolveClientesVinculadosValidos(tenantId, normalizedLinks.clienteIds);
    await resolveAdvogadosResponsaveisValidos(
      tenantId,
      normalizedLinks.advogadoResponsavelIds,
    );

    let novoCliente: {
      id: string;
      nome: string;
      email: string | null;
      telefone: string | null;
      celular: string | null;
      documento: string | null;
    } | null = null;

    if (
      !haveSameIdMembership(normalizedLinks.clienteIds, currentClienteIds) &&
      normalizedLinks.clienteId &&
      normalizedLinks.clienteId !== processo.clienteId
    ) {
      const cliente = await prisma.cliente.findFirst({
        where: {
          id: normalizedLinks.clienteId,
          tenantId,
          deletedAt: null,
        },
        select: {
          id: true,
          nome: true,
          email: true,
          telefone: true,
          celular: true,
          documento: true,
        },
      });

      if (!cliente) {
        return { success: false, error: "Cliente informado não encontrado" };
      }

      novoCliente = cliente;
    }

    if (normalizedLinks.advogadoResponsavelId) {
      const advogado = await prisma.advogado.findFirst({
        where: {
          id: normalizedLinks.advogadoResponsavelId,
          tenantId,
        },
        select: { id: true },
      });

      if (!advogado) {
        return { success: false, error: "Advogado responsável não encontrado" };
      }
    }

    if (data.juizId) {
      const juiz = await prisma.juiz.findFirst({
        where: {
          id: data.juizId,
          OR: [
            { isPublico: true },
            {
              favoritos: {
                some: {
                  tenantId,
                },
              },
            },
            {
              acessos: {
                some: {
                  tenantId,
                },
              },
            },
          ],
        },
        select: { id: true },
      });

      if (!juiz) {
        return {
          success: false,
          error: "Autoridade informada não encontrada ou sem acesso",
        };
      }
    }

    if (data.tribunalId) {
      const tribunal = await prisma.tribunal.findFirst({
        where: {
          id: data.tribunalId,
          OR: [{ tenantId: null }, { tenantId }],
        },
        select: { id: true },
      });

      if (!tribunal) {
        return { success: false, error: "Tribunal informado não encontrado" };
      }
    }

    const canonicalRitoProcesso =
      data.ritoProcesso !== undefined || data.rito !== undefined
        ? resolveCanonicalRitoProcesso(data)
        : processo.ritoProcesso ?? normalizeLegacyRitoToRitoProcesso(processo.rito);

    if (!canonicalRitoProcesso) {
      return {
        success: false,
        error: "Defina o rito do processo antes de salvar as alterações",
      };
    }

    const effectiveStatus = data.status ?? processo.status;
    const effectiveArquivamentoTipo =
      data.arquivamentoTipo !== undefined
        ? data.arquivamentoTipo
        : processo.arquivamentoTipo;
    const normalizedArquivamentoTipo = normalizeArquivamentoTipo(
      effectiveStatus,
      effectiveArquivamentoTipo,
    );

    const updatePayload: Prisma.ProcessoUncheckedUpdateInput = {};

    if (data.numero !== undefined) updatePayload.numero = data.numero;
    if (data.numeroCnj !== undefined)
      updatePayload.numeroCnj = data.numeroCnj || null;
    if (data.titulo !== undefined) updatePayload.titulo = data.titulo || null;
    if (data.descricao !== undefined)
      updatePayload.descricao = data.descricao || null;
    if (data.status !== undefined) updatePayload.status = data.status;
    if (data.status !== undefined || data.arquivamentoTipo !== undefined) {
      updatePayload.arquivamentoTipo = normalizedArquivamentoTipo;
    }
    if (data.fase !== undefined) updatePayload.fase = data.fase;
    if (data.grau !== undefined) updatePayload.grau = data.grau;
    if (data.areaId !== undefined) updatePayload.areaId = data.areaId || null;
    if (data.classeProcessual !== undefined)
      updatePayload.classeProcessual = data.classeProcessual || null;
    if (data.vara !== undefined) updatePayload.vara = data.vara || null;
    if (data.comarca !== undefined)
      updatePayload.comarca = data.comarca || null;
    if (data.foro !== undefined) updatePayload.foro = data.foro || null;
    if (data.orgaoJulgador !== undefined)
      updatePayload.orgaoJulgador = data.orgaoJulgador || null;
    if (data.dataDistribuicao !== undefined) {
      updatePayload.dataDistribuicao = data.dataDistribuicao
        ? new Date(data.dataDistribuicao)
        : null;
    }
    if (data.segredoJustica !== undefined)
      updatePayload.segredoJustica = data.segredoJustica;
    if (data.valorCausa !== undefined)
      updatePayload.valorCausa =
        data.valorCausa === null ? null : data.valorCausa;
    if (data.rito !== undefined || data.ritoProcesso !== undefined) {
      updatePayload.rito = buildLegacyRitoValue(canonicalRitoProcesso);
      updatePayload.ritoProcesso = canonicalRitoProcesso;
    }
    if (data.clienteId !== undefined || data.clienteIds !== undefined)
      updatePayload.clienteId = normalizedLinks.clienteId!;
    if (
      data.advogadoResponsavelId !== undefined ||
      data.advogadoResponsavelIds !== undefined
    )
      updatePayload.advogadoResponsavelId =
        normalizedLinks.advogadoResponsavelId || null;
    if (data.juizId !== undefined) updatePayload.juizId = data.juizId || null;
    if (data.tribunalId !== undefined)
      updatePayload.tribunalId = data.tribunalId || null;
    if (data.numeroInterno !== undefined)
      updatePayload.numeroInterno = data.numeroInterno || null;
    if (data.pastaCompartilhadaUrl !== undefined)
      updatePayload.pastaCompartilhadaUrl = data.pastaCompartilhadaUrl || null;
    if (data.prazoPrincipal !== undefined) {
      updatePayload.prazoPrincipal = data.prazoPrincipal
        ? new Date(data.prazoPrincipal)
        : null;
    }
    const nextPrazoPrincipal =
      updatePayload.prazoPrincipal !== undefined
        ? ((updatePayload.prazoPrincipal as Date | null) ?? null)
        : (processo.prazoPrincipal ?? null);
    const causaIds =
      data.causaIds !== undefined
        ? uniqueOrderedProcessoRelationIds(data.causaIds)
        : null;

    const atualizado = await prisma.$transaction(async (tx) => {
      const processoAtualizado = await tx.processo.update({
        where: { id: processoId },
        data: updatePayload,
        include: {
          cliente: true,
          area: true,
          advogadoResponsavel: {
            include: {
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
          ...processoClientesRelacionadosInclude,
          ...processoResponsaveisRelacionadosInclude,
          ...processoCausasInclude,
          juiz: true,
          tribunal: true,
        },
      });

      await syncProcessoClientes(tx, {
        tenantId,
        processoId,
        clienteIds: normalizedLinks.clienteIds,
      });
      await syncProcessoResponsaveis(tx, {
        tenantId,
        processoId,
        advogadoIds: normalizedLinks.advogadoResponsavelIds,
        advogadoPrincipalId: normalizedLinks.advogadoResponsavelId,
      });
      await ensureProcessoClientePartes(tx, {
        tenantId,
        processoId,
        clienteIds: normalizedLinks.clienteIds,
      });
      if (causaIds !== null) {
        await syncProcessoCausas(tx, {
          tenantId,
          processoId,
          causaIds,
        });
      }
      await syncManagedPrazoPrincipalForProcess(tx, {
        tenantId,
        processoId,
        prazoPrincipal: nextPrazoPrincipal,
        actorUserId: user.id,
      });

      if (novoCliente) {
        await tx.processoParte.updateMany({
          where: {
            processoId,
            clienteId: processo.clienteId,
            deletedAt: null,
          },
          data: {
            ...buildSoftDeletePayload(
              { actorId: user.id, actorType: "USER" },
              "Substituição de parte principal por mudança de cliente no processo",
            ),
          },
        });

        await tx.processoParte.create({
          data: {
            tenantId,
            processoId,
            tipoPolo: ProcessoPolo.AUTOR,
            nome: novoCliente.nome,
            clienteId: novoCliente.id,
            documento: novoCliente.documento || null,
            email: novoCliente.email || null,
            telefone: novoCliente.telefone || novoCliente.celular || null,
            observacoes: "Parte principal (cliente)",
          },
        });
      }

      return processoAtualizado;
    });

    const diff = buildProcessoDiff(
      decorateProcessoWithVinculos(processo as any),
      decorateProcessoWithVinculos(atualizado as any),
    );

    const converted = convertAllDecimalFields(
      atualizado,
    ) as any as ProcessoDetalhado;

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
    const serializedDecorated = decorateProcessoWithVinculos(serialized);

    // Notificações, diff estruturado e auditoria da alteração
    await ensureJusbrasilProcessMonitorBestEffort({
      tenantId,
      processoId,
      numeroProcesso: atualizado.numeroCnj || atualizado.numero,
      usuarioId: user.id,
    });

    try {
      if (diff.items.length > 0) {
        const actorName =
          `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() ||
          (user.email as string | undefined) ||
          "Usuário";
        const statusChange = diff.statusChange;
        const changesSummary = statusChange
          ? diff.otherChangesSummary
          : diff.summary;

        const notificationPayload: Record<string, any> = {
          processoId,
          numero: atualizado.numero,
          referenciaTipo: "processo",
          referenciaId: processoId,
          clienteNome: atualizado.cliente?.nome ?? null,
          processoTitulo: atualizado.titulo ?? null,
          diff: diff.items,
          changes: diff.items.map((item) => item.field),
          detailLines: diff.items.map(
            (item) => `${item.label}: ${item.before} → ${item.after}`,
          ),
          actorName,
          actorUserId: user.id,
          sourceLabel: "Alteração manual no cadastro do processo",
          sourceKind: "MANUAL",
        };

        if (changesSummary) {
          notificationPayload.changesSummary = changesSummary;
        }

        if (statusChange) {
          notificationPayload.oldStatus = statusChange.beforeRaw;
          notificationPayload.newStatus = statusChange.afterRaw;
          notificationPayload.oldStatusLabel = statusChange.before;
          notificationPayload.newStatusLabel = statusChange.after;
          notificationPayload.statusLabel = statusChange.after;
          notificationPayload.status = statusChange.after;
          notificationPayload.statusSummary = `${statusChange.before} → ${statusChange.after}`;

          if (diff.otherChangesSummary) {
            notificationPayload.additionalChangesSummary =
              diff.otherChangesSummary;
          }
        }

        await publishProcessNotificationToLawyers({
          type: statusChange ? "processo.status_changed" : "processo.updated",
          tenantId: tenantId,
          processoId,
          payload: notificationPayload,
          urgency: "HIGH",
          channels: ["REALTIME", "EMAIL", "TELEGRAM"],
        });

        const auditDiff = diff.items.map((item) => ({
          field: item.field,
          label: item.label,
          before: item.before,
          after: item.after,
          beforeRaw: item.beforeRaw ?? null,
          afterRaw: item.afterRaw ?? null,
        }));

        const auditStatusChange = statusChange
          ? {
              de: statusChange.before,
              para: statusChange.after,
              deCodigo: statusChange.beforeRaw ?? null,
              paraCodigo: statusChange.afterRaw ?? null,
            }
          : null;

        const auditDados = toAuditJson({
          processoId,
          numero: atualizado.numero,
          diff: auditDiff,
          changesSummary:
            changesSummary ||
            (statusChange
              ? `${statusChange.before} → ${statusChange.after}`
              : "Alterações registradas"),
          statusChange: auditStatusChange,
          executadoPor: actorName,
          executadoPorId: user.id,
          executadoEm: new Date().toISOString(),
          valoresAtuais: convertAllDecimalFields(atualizado as any),
        });

        await logAudit({
          tenantId,
          usuarioId: user.id,
          acao: statusChange
            ? "PROCESSO_STATUS_ALTERADO"
            : "PROCESSO_ATUALIZADO",
          entidade: "Processo",
          entidadeId: processoId,
          dados: auditDados,
          previousValues: toAuditJson(
            convertAllDecimalFields(processo as any),
          ),
          changedFields: extractChangedFieldsFromDiff(diff.items),
        });
      }
    } catch (e) {
      logger.warn("Falha ao emitir notificações de processo atualizado", e);
    }

    return {
      success: true,
      processo: serializedDecorated,
    };
  } catch (error) {
    logger.error("Erro ao atualizar processo:", error);

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro ao atualizar processo",
    };
  }
}

export async function createProcessoParte(
  processoId: string,
  input: ProcessoParteInput,
) {
  try {
    if (!input?.tipoPolo) {
      return { success: false, error: "Tipo de polo é obrigatório" };
    }

    const session = await getSession();
    const { user, processo } = await ensureProcessMutationAccess(
      session,
      processoId,
    );
    const tenantId = user.tenantId;

    let cliente: {
      id: string;
      nome: string;
      email: string | null;
      telefone: string | null;
      celular: string | null;
      documento: string | null;
    } | null = null;

    if (input.clienteId) {
      cliente = await prisma.cliente.findFirst({
        where: {
          id: input.clienteId,
          tenantId,
          deletedAt: null,
        },
        select: {
          id: true,
          nome: true,
          email: true,
          telefone: true,
          celular: true,
          documento: true,
        },
      });

      if (!cliente) {
        return { success: false, error: "Cliente informado não encontrado" };
      }

      const existente = await prisma.processoParte.findFirst({
        where: {
          processoId,
          clienteId: input.clienteId,
          deletedAt: null,
        },
        select: { id: true },
      });

      if (existente) {
        return {
          success: false,
          error: "Este cliente já está vinculado como parte do processo",
        };
      }
    }

    const advogado = input.advogadoId
      ? await prisma.advogado.findFirst({
          where: {
            id: input.advogadoId,
            tenantId,
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
        })
      : null;

    if (input.advogadoId && !advogado) {
      return { success: false, error: "Advogado informado não encontrado" };
    }

    if (input.advogadoId) {
      const existente = await prisma.processoParte.findFirst({
        where: {
          processoId,
          advogadoId: input.advogadoId,
          deletedAt: null,
        },
        select: { id: true },
      });

      if (existente) {
        return {
          success: false,
          error: "Este advogado já está vinculado como parte do processo",
        };
      }
    }

    const nome =
      input.nome ||
      cliente?.nome ||
      (advogado
        ? `${advogado.usuario?.firstName ?? ""} ${advogado.usuario?.lastName ?? ""}`.trim()
        : null);

    if (!nome || nome.length === 0) {
      return { success: false, error: "Informe o nome da parte" };
    }

    const parte = await prisma.processoParte.create({
      data: {
        tenantId,
        processoId,
        tipoPolo: input.tipoPolo,
        nome,
        documento: input.documento ?? cliente?.documento ?? null,
        email:
          input.email ?? cliente?.email ?? advogado?.usuario?.email ?? null,
        telefone:
          input.telefone ?? cliente?.telefone ?? cliente?.celular ?? null,
        clienteId: input.clienteId ?? null,
        advogadoId: input.advogadoId ?? null,
        papel: input.papel ?? null,
        observacoes: input.observacoes ?? null,
      },
      include: processoParteInclude,
    });

    return {
      success: true,
      parte,
    };
  } catch (error) {
    logger.error("Erro ao criar parte do processo:", error);

    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao criar parte",
    };
  }
}

export async function updateProcessoParte(
  parteId: string,
  input: ProcessoParteUpdateInput,
) {
  try {
    const session = await getSession();
    const { user, processo, parte } = await ensureParteMutationAccess(
      session,
      parteId,
    );
    const tenantId = user.tenantId;

    const updateData: Prisma.ProcessoParteUpdateInput = {};
    const normalizeTextField = (value: string | null | undefined) => {
      if (value === undefined) return undefined;

      const trimmedValue = value?.trim() ?? "";

      return trimmedValue.length > 0 ? trimmedValue : null;
    };

    let cliente: {
      id: string;
      nome: string;
      email: string | null;
      telefone: string | null;
      celular: string | null;
      documento: string | null;
    } | null = null;

    if (input.clienteId !== undefined) {
      if (input.clienteId === null) {
        updateData.cliente = { disconnect: true };
      } else {
        cliente = await prisma.cliente.findFirst({
          where: {
            id: input.clienteId,
            tenantId,
            deletedAt: null,
          },
          select: {
            id: true,
            nome: true,
            email: true,
            telefone: true,
            celular: true,
            documento: true,
          },
        });

        if (!cliente) {
          return { success: false, error: "Cliente informado não encontrado" };
        }

        const existente = await prisma.processoParte.findFirst({
          where: {
            processoId: processo.id,
            clienteId: input.clienteId,
            deletedAt: null,
            NOT: { id: parteId },
          },
          select: { id: true },
        });

        if (existente) {
          return {
            success: false,
            error: "Este cliente já está vinculado como parte",
          };
        }

        updateData.cliente = { connect: { id: input.clienteId } };
      }
    }

    let advogadoEmail: string | null = null;

    if (input.advogadoId !== undefined) {
      if (input.advogadoId === null) {
        updateData.advogado = { disconnect: true };
      } else {
        const advogado = await prisma.advogado.findFirst({
          where: {
            id: input.advogadoId,
            tenantId,
          },
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
        });

        if (!advogado) {
          return { success: false, error: "Advogado informado não encontrado" };
        }

        const existente = await prisma.processoParte.findFirst({
          where: {
            processoId: processo.id,
            advogadoId: input.advogadoId,
            deletedAt: null,
            NOT: { id: parteId },
          },
          select: { id: true },
        });

        if (existente) {
          return {
            success: false,
            error: "Este advogado já está vinculado como parte",
          };
        }

        advogadoEmail = advogado.usuario?.email ?? null;
        updateData.advogado = { connect: { id: input.advogadoId } };
      }
    }

    if (input.tipoPolo !== undefined) updateData.tipoPolo = input.tipoPolo;
    if (input.nome !== undefined) {
      const normalizedNome = normalizeTextField(input.nome);

      if (!normalizedNome) {
        return { success: false, error: "Informe o nome da parte" };
      }

      updateData.nome = normalizedNome;
    }

    if (input.documento !== undefined) {
      const normalizedDocumento = normalizeTextField(input.documento);

      updateData.documento = normalizedDocumento ?? cliente?.documento ?? null;
    }

    if (input.email !== undefined) {
      const normalizedEmail = normalizeTextField(input.email);

      updateData.email = normalizedEmail ?? cliente?.email ?? advogadoEmail ?? null;
    }

    if (input.telefone !== undefined) {
      const normalizedTelefone = normalizeTextField(input.telefone);

      updateData.telefone =
        normalizedTelefone ?? cliente?.telefone ?? cliente?.celular ?? null;
    }

    if (input.papel !== undefined) {
      updateData.papel = normalizeTextField(input.papel);
    }

    if (input.observacoes !== undefined) {
      updateData.observacoes = normalizeTextField(input.observacoes);
    }

    const atualizada = await prisma.processoParte.update({
      where: { id: parteId },
      data: updateData,
      include: processoParteInclude,
    });

    return {
      success: true,
      parte: atualizada,
    };
  } catch (error) {
    logger.error("Erro ao atualizar parte do processo:", error);

    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao atualizar parte",
    };
  }
}

export async function deleteProcessoParte(parteId: string) {
  try {
    const session = await getSession();

    const { user } = await ensureParteMutationAccess(session, parteId);

    await prisma.processoParte.update({
      where: { id: parteId },
      data: buildSoftDeletePayload(
        { actorId: user.id, actorType: "USER" },
        "Remoção lógica de parte do processo",
      ),
    });

    return {
      success: true,
    };
  } catch (error) {
    logger.error("Erro ao remover parte do processo:", error);

    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao remover parte",
    };
  }
}

export async function createProcessoPrazo(
  processoId: string,
  input: ProcessoPrazoInput,
) {
  try {
    if (!input?.titulo && !input?.tipoPrazoLegal) {
      return {
        success: false,
        error: "Título do prazo é obrigatório quando não houver tipo legal",
      };
    }

    if (!input?.dataVencimento) {
      return { success: false, error: "Data de vencimento é obrigatória" };
    }

    const session = await getSession();
    const { user, processo } = await ensureProcessMutationAccess(
      session,
      processoId,
    );
    const tenantId = user.tenantId;
    const actorName =
      `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() ||
      (user.email as string | undefined) ||
      "Usuário";
    const scope = {
      tribunalId: processo.tribunalId ?? null,
      uf: processo.tribunal?.uf ?? null,
      municipio: processo.comarca ?? null,
    };
    const parsedDataVencimento = parseDateInput(
      input.dataVencimento,
      "Data de vencimento",
    );

    if (!parsedDataVencimento.ok) {
      return {
        success: false,
        error: parsedDataVencimento.error,
      };
    }

    const parsedProrrogadoPara = parseNullableDateInput(
      input.prorrogadoPara,
      "Data de prorrogação",
    );

    if (!parsedProrrogadoPara.ok) {
      return {
        success: false,
        error: parsedProrrogadoPara.error,
      };
    }

    const parsedDataCumprimento = parseNullableDateInput(
      input.dataCumprimento,
      "Data de cumprimento",
    );

    if (!parsedDataCumprimento.ok) {
      return {
        success: false,
        error: parsedDataCumprimento.error,
      };
    }

    const responsavelId = input.responsavelId ?? null;

    if (responsavelId) {
      const responsavel = await prisma.usuario.findFirst({
        where: {
          id: responsavelId,
          tenantId,
        },
        select: { id: true },
      });

      if (!responsavel) {
        return {
          success: false,
          error: "Responsável informado não encontrado",
        };
      }
    }

    if (input.origemMovimentacaoId) {
      const movimentacao = await prisma.movimentacaoProcesso.findFirst({
        where: {
          id: input.origemMovimentacaoId,
          processoId,
        },
        select: { id: true },
      });

      if (!movimentacao) {
        return {
          success: false,
          error: "Movimentação de origem não encontrada para este processo",
        };
      }
    }

    if (input.origemMovimentacaoId && input.origemEventoId) {
      return {
        success: false,
        error: "Vincule o prazo a um andamento ou a um evento, nao aos dois",
      };
    }

    if (input.origemEventoId) {
      const evento = await prisma.evento.findFirst({
        where: {
          id: input.origemEventoId,
          tenantId,
          processoId,
          deletedAt: null,
        },
        select: { id: true },
      });

      if (!evento) {
        return {
          success: false,
          error: "Evento de origem nao encontrado para este processo",
        };
      }
    }

    const ritoProcesso =
      processo.ritoProcesso ?? normalizeLegacyRitoToRitoProcesso(processo.rito);

    if (!ritoProcesso) {
      return {
        success: false,
        error: "Defina o rito do processo antes de cadastrar prazos automáticos",
      };
    }

    const prazoPayload = resolvePrazoPayloadDefaults({
      ritoProcesso,
      titulo: input.titulo,
      fundamentoLegal: input.fundamentoLegal,
      tipoPrazoLegal: input.tipoPrazoLegal ?? null,
    });

    if (!prazoPayload.titulo) {
      return {
        success: false,
        error: "Informe o título do prazo ou selecione um tipo legal de prazo",
      };
    }

    const regimePrazoId = input.regimePrazoId ?? null;

    if (regimePrazoId) {
      const regime = await prisma.regimePrazo.findFirst({
        where: {
          id: regimePrazoId,
          OR: [{ tenantId }, { tenantId: null }],
        },
        select: { id: true },
      });

      if (!regime) {
        return {
          success: false,
          error: "Regime de prazo informado não está disponível",
        };
      }
    }

    const deadlineValidation = await validateDeadlineWithRegime({
      tenantId,
      ritoProcesso,
      regimePrazoId,
      data: parsedDataVencimento.date,
      scope,
    });

    if (!deadlineValidation.valid) {
      return {
        success: false,
        error: deadlineValidation.error ?? "Data de vencimento inválida",
      };
    }

    const holidayImpact = await buildPrazoHolidayImpact({
      tenantId,
      processo,
      regimePrazoId,
      dataVencimento: parsedDataVencimento.date,
      prorrogadoPara: parsedProrrogadoPara.date,
    });

    const prazo = await prisma.processoPrazo.create({
      data: {
        tenantId,
        processoId,
        titulo: prazoPayload.titulo,
        descricao: input.descricao || null,
        fundamentoLegal: prazoPayload.fundamentoLegal,
        tipoPrazoLegal: input.tipoPrazoLegal ?? null,
        status: input.status || ProcessoPrazoStatus.ABERTO,
        dataVencimento: parsedDataVencimento.date,
        prorrogadoPara: parsedProrrogadoPara.date,
        dataCumprimento: parsedDataCumprimento.date,
        holidayImpact,
        responsavelId,
        origemMovimentacaoId: input.origemMovimentacaoId ?? null,
        origemEventoId: input.origemEventoId ?? null,
        regimePrazoId,
      },
      include: processoPrazoInclude,
    });

    try {
      const targetUserIds = [
        prazo.responsavel?.id ?? null,
        processo.advogadoResponsavel?.usuario?.id ?? null,
        user.id ?? null,
      ].filter((value): value is string => Boolean(value));

      await publishPrazoNotificationToUsers({
        type: "prazo.created",
        tenantId,
        userIds: targetUserIds,
        urgency: "HIGH",
        channels: ["REALTIME", "EMAIL"],
        payload: {
          prazoId: prazo.id,
          processoId,
          processoNumero: processo.numero,
          ...(processo.cliente?.nome
            ? { clienteNome: processo.cliente.nome }
            : {}),
          titulo: prazo.titulo,
          dataVencimento: prazo.dataVencimento.toISOString(),
          effectiveDate: holidayImpact.effectiveDate,
          status: prazo.status,
          referenciaTipo: "prazo",
          referenciaId: prazo.id,
          ...buildPrazoHolidayNotificationPayload(holidayImpact),
        },
      });
    } catch (notificationError) {
      logger.warn(
        "Falha ao publicar notificação de criação de prazo",
        notificationError,
      );
    }

    try {
      const snapshot = buildPrazoAuditSnapshot({
        ...prazo,
        tipoPrazoLegal: prazo.tipoPrazoLegal ?? null,
        regimePrazoId: prazo.regimePrazo?.id ?? null,
        holidayImpact: parseHolidayImpact(prazo.holidayImpact),
      });

      await logAudit({
        tenantId,
        usuarioId: user.id,
        acao: "PROCESSO_PRAZO_CRIADO",
        entidade: "ProcessoPrazo",
        entidadeId: prazo.id,
        dados: toAuditJson({
          ...snapshot,
          processoId,
          processoNumero: processo.numero,
          criadoPor: actorName,
          criadoPorId: user.id,
          criadoEm: new Date().toISOString(),
        }),
        previousValues: null,
        changedFields: Object.keys(snapshot),
      });
    } catch (auditError) {
      logger.warn("Falha ao registrar auditoria de criação de prazo", auditError);
    }

    return {
      success: true,
      prazo,
    };
  } catch (error) {
    logger.error("Erro ao criar prazo do processo:", error);

    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao criar prazo",
    };
  }
}

export async function updateProcessoPrazo(
  prazoId: string,
  input: ProcessoPrazoUpdateInput,
) {
  try {
    const session = await getSession();
    const { user, prazo, processo } = await ensurePrazoMutationAccess(
      session,
      prazoId,
    );
    const tenantId = user.tenantId;
    const actorName =
      `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() ||
      (user.email as string | undefined) ||
      "Usuário";
    const scope = {
      tribunalId: processo.tribunalId ?? null,
      uf: processo.tribunal?.uf ?? null,
      municipio: processo.comarca ?? null,
    };
    const ritoProcesso =
      processo.ritoProcesso ?? normalizeLegacyRitoToRitoProcesso(processo.rito);

    if (!ritoProcesso) {
      return {
        success: false,
        error: "Defina o rito do processo antes de editar este prazo",
      };
    }

    const prazoAnterior = await prisma.processoPrazo.findFirst({
      where: {
        id: prazoId,
        tenantId,
        deletedAt: null,
      },
      include: processoPrazoInclude,
    });

    if (!prazoAnterior) {
      return { success: false, error: "Prazo não encontrado" };
    }

    const updateData: Prisma.ProcessoPrazoUpdateInput = {};

    if (input.titulo !== undefined) updateData.titulo = input.titulo;
    if (input.descricao !== undefined)
      updateData.descricao = input.descricao ?? null;
    if (input.fundamentoLegal !== undefined)
      updateData.fundamentoLegal = input.fundamentoLegal ?? null;
    if (input.tipoPrazoLegal !== undefined)
      updateData.tipoPrazoLegal = input.tipoPrazoLegal ?? null;
    if (input.status !== undefined) updateData.status = input.status;

    const parsedDataVencimento =
      input.dataVencimento !== undefined
        ? parseDateInput(input.dataVencimento, "Data de vencimento")
        : null;

    if (parsedDataVencimento && !parsedDataVencimento.ok) {
      return {
        success: false,
        error: parsedDataVencimento.error,
      };
    }

    if (parsedDataVencimento) {
      updateData.dataVencimento = parsedDataVencimento.date;
    }

    if (input.prorrogadoPara !== undefined) {
      const parsedProrrogadoPara = parseNullableDateInput(
        input.prorrogadoPara,
        "Data de prorrogação",
      );

      if (!parsedProrrogadoPara.ok) {
        return {
          success: false,
          error: parsedProrrogadoPara.error,
        };
      }

      updateData.prorrogadoPara = parsedProrrogadoPara.date;
    }

    if (input.dataCumprimento !== undefined) {
      const parsedDataCumprimento = parseNullableDateInput(
        input.dataCumprimento,
        "Data de cumprimento",
      );

      if (!parsedDataCumprimento.ok) {
        return {
          success: false,
          error: parsedDataCumprimento.error,
        };
      }

      updateData.dataCumprimento = parsedDataCumprimento.date;
    }

    if (input.responsavelId !== undefined) {
      if (input.responsavelId === null) {
        updateData.responsavel = { disconnect: true };
      } else {
        const responsavel = await prisma.usuario.findFirst({
          where: {
            id: input.responsavelId,
            tenantId,
          },
          select: { id: true },
        });

        if (!responsavel) {
          return {
            success: false,
            error: "Responsável informado não encontrado",
          };
        }

        updateData.responsavel = { connect: { id: input.responsavelId } };
      }
    }

    if (
      input.origemMovimentacaoId !== undefined &&
      input.origemEventoId !== undefined &&
      input.origemMovimentacaoId !== null &&
      input.origemEventoId !== null
    ) {
      return {
        success: false,
        error: "Vincule o prazo a um andamento ou a um evento, nao aos dois",
      };
    }

    if (input.origemMovimentacaoId !== undefined) {
      if (input.origemMovimentacaoId === null) {
        updateData.origemMovimentacao = { disconnect: true };
      } else {
        const movimentacao = await prisma.movimentacaoProcesso.findFirst({
          where: {
            id: input.origemMovimentacaoId,
            processoId: prazo.processoId,
          },
          select: { id: true },
        });

        if (!movimentacao) {
          return {
            success: false,
            error: "Movimentação de origem não encontrada para este processo",
          };
        }

        updateData.origemMovimentacao = {
          connect: { id: input.origemMovimentacaoId },
        };

        updateData.origemEvento = { disconnect: true };
      }
    }

    if (input.origemEventoId !== undefined) {
      if (input.origemEventoId === null) {
        updateData.origemEvento = { disconnect: true };
      } else {
        const evento = await prisma.evento.findFirst({
          where: {
            id: input.origemEventoId,
            tenantId,
            processoId: prazo.processoId,
            deletedAt: null,
          },
          select: { id: true },
        });

        if (!evento) {
          return {
            success: false,
            error: "Evento de origem nao encontrado para este processo",
          };
        }

        updateData.origemEvento = {
          connect: { id: input.origemEventoId },
        };

        updateData.origemMovimentacao = { disconnect: true };
      }
    }

    if (input.regimePrazoId !== undefined) {
      if (input.regimePrazoId === null) {
        updateData.regimePrazo = { disconnect: true };
      } else {
        const regime = await prisma.regimePrazo.findFirst({
          where: {
            id: input.regimePrazoId,
            OR: [{ tenantId }, { tenantId: null }],
          },
          select: { id: true },
        });

        if (!regime) {
          return {
            success: false,
            error: "Regime de prazo informado não está disponível",
          };
        }

        updateData.regimePrazo = { connect: { id: input.regimePrazoId } };
      }
    }

    const proximoRegimePrazoId =
      input.regimePrazoId !== undefined
        ? input.regimePrazoId
        : prazoAnterior.regimePrazo?.id ?? null;
    const proximoTipoPrazoLegal =
      input.tipoPrazoLegal !== undefined
        ? input.tipoPrazoLegal ?? null
        : prazoAnterior.tipoPrazoLegal ?? null;
    const prazoPayload = resolvePrazoPayloadDefaults({
      ritoProcesso,
      titulo: input.titulo ?? prazoAnterior.titulo,
      fundamentoLegal:
        input.fundamentoLegal !== undefined
          ? input.fundamentoLegal
          : prazoAnterior.fundamentoLegal,
      tipoPrazoLegal: proximoTipoPrazoLegal,
    });
    const proximaDataVencimento =
      parsedDataVencimento?.date ?? prazoAnterior.dataVencimento;
    const proximoProrrogadoPara =
      input.prorrogadoPara !== undefined
        ? (updateData.prorrogadoPara as Date | null | undefined) ?? null
        : prazoAnterior.prorrogadoPara;

    const deadlineValidation = await validateDeadlineWithRegime({
      tenantId,
      ritoProcesso,
      regimePrazoId: proximoRegimePrazoId ?? null,
      data: proximaDataVencimento,
      scope,
    });

    if (!deadlineValidation.valid) {
      return {
        success: false,
        error: deadlineValidation.error ?? "Data de vencimento inválida",
      };
    }

    const holidayImpact = await buildPrazoHolidayImpact({
      tenantId,
      processo,
      regimePrazoId: proximoRegimePrazoId ?? null,
      dataVencimento: proximaDataVencimento,
      prorrogadoPara: proximoProrrogadoPara,
    });

    if (!prazoPayload.titulo) {
      return {
        success: false,
        error: "Informe o título do prazo ou selecione um tipo legal de prazo",
      };
    }

    updateData.titulo = prazoPayload.titulo;
    if (input.fundamentoLegal === undefined || input.tipoPrazoLegal !== undefined) {
      updateData.fundamentoLegal = prazoPayload.fundamentoLegal;
    }
    updateData.holidayImpact = holidayImpact;

    const atualizado = await prisma.processoPrazo.update({
      where: { id: prazoId },
      data: updateData,
      include: processoPrazoInclude,
    });

    const previousSnapshot = buildPrazoAuditSnapshot({
      ...prazoAnterior,
      tipoPrazoLegal: prazoAnterior.tipoPrazoLegal ?? null,
      regimePrazoId: prazoAnterior.regimePrazo?.id ?? null,
      holidayImpact: parseHolidayImpact(prazoAnterior.holidayImpact),
    });
    const currentSnapshot = buildPrazoAuditSnapshot({
      ...atualizado,
      tipoPrazoLegal: atualizado.tipoPrazoLegal ?? null,
      regimePrazoId: atualizado.regimePrazo?.id ?? null,
      holidayImpact: parseHolidayImpact(atualizado.holidayImpact),
    });
    const diff = buildPrazoAuditDiff(previousSnapshot, currentSnapshot);

    if (diff.length > 0) {
      try {
        const targetUserIds = [
          atualizado.responsavel?.id ?? null,
          processo.advogadoResponsavel?.usuario?.id ?? null,
          user.id ?? null,
        ].filter((value): value is string => Boolean(value));

        await publishPrazoNotificationToUsers({
          type: "prazo.updated",
          tenantId,
          userIds: targetUserIds,
          urgency: "HIGH",
          channels: ["REALTIME"],
          payload: {
            prazoId: atualizado.id,
            processoId: prazo.processoId,
            processoNumero: processo.numero,
            ...(processo.cliente?.nome
              ? { clienteNome: processo.cliente.nome }
              : {}),
            titulo: atualizado.titulo,
            dataVencimento: atualizado.dataVencimento.toISOString(),
            effectiveDate: holidayImpact.effectiveDate,
            status: atualizado.status,
            changes: diff.map((item) => item.field),
            referenciaTipo: "prazo",
            referenciaId: atualizado.id,
            ...buildPrazoHolidayNotificationPayload(holidayImpact),
          },
        });
      } catch (notificationError) {
        logger.warn(
          "Falha ao publicar notificação de atualização de prazo",
          notificationError,
        );
      }
    }

    if (diff.length > 0) {
      try {
        await logAudit({
          tenantId,
          usuarioId: user.id,
          acao:
            input.status !== undefined && input.status !== prazoAnterior.status
              ? "PROCESSO_PRAZO_STATUS_ALTERADO"
              : "PROCESSO_PRAZO_ATUALIZADO",
          entidade: "ProcessoPrazo",
          entidadeId: atualizado.id,
          dados: toAuditJson({
            processoId: prazo.processoId,
            processoNumero: processo.numero,
            valoresAtuais: currentSnapshot,
            diff,
            atualizadoPor: actorName,
            atualizadoPorId: user.id,
            atualizadoEm: new Date().toISOString(),
          }),
          previousValues: toAuditJson(previousSnapshot),
          changedFields: extractChangedFieldsFromDiff(diff),
        });
      } catch (auditError) {
        logger.warn(
          "Falha ao registrar auditoria de atualização de prazo",
          auditError,
        );
      }
    }

    return {
      success: true,
      prazo: atualizado,
    };
  } catch (error) {
    logger.error("Erro ao atualizar prazo do processo:", error);

    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao atualizar prazo",
    };
  }
}

export async function deleteProcessoPrazo(prazoId: string) {
  try {
    const session = await getSession();
    const { user, prazo, processo } = await ensurePrazoMutationAccess(
      session,
      prazoId,
    );

    const prazoAnterior = await prisma.processoPrazo.findFirst({
      where: {
        id: prazoId,
        tenantId: user.tenantId,
        deletedAt: null,
      },
      include: processoPrazoInclude,
    });

    if (!prazoAnterior) {
      return { success: false, error: "Prazo não encontrado" };
    }

    await prisma.processoPrazo.update({
      where: { id: prazoId },
      data: buildSoftDeletePayload(
        { actorId: user.id, actorType: "USER" },
        "Remoção lógica de prazo do processo",
      ),
    });

    try {
      const snapshot = buildPrazoAuditSnapshot({
        ...prazoAnterior,
        tipoPrazoLegal: prazoAnterior.tipoPrazoLegal ?? null,
        regimePrazoId: prazoAnterior.regimePrazo?.id ?? null,
        holidayImpact: parseHolidayImpact(prazoAnterior.holidayImpact),
      });

      await logAudit({
        tenantId: user.tenantId,
        usuarioId: user.id,
        acao: "PROCESSO_PRAZO_EXCLUIDO",
        entidade: "ProcessoPrazo",
        entidadeId: prazoId,
        dados: toAuditJson({
          ...snapshot,
          processoId: prazo.processoId,
          processoNumero: processo.numero,
          removidoPorId: user.id,
          removidoEm: new Date().toISOString(),
        }),
        changedFields: Object.keys(snapshot),
      });
    } catch (auditError) {
      logger.warn("Falha ao registrar auditoria de remoção de prazo", auditError);
    }

    return {
      success: true,
    };
  } catch (error) {
    logger.error("Erro ao remover prazo do processo:", error);

    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao remover prazo",
    };
  }
}

export async function linkProcuracaoAoProcesso(
  processoId: string,
  procuracaoId: string,
) {
  try {
    const session = await getSession();
    const { user, processo } = await ensureProcessMutationAccess(
      session,
      processoId,
    );
    const tenantId = user.tenantId;

    const procuracao = await prisma.procuracao.findFirst({
      where: {
        id: procuracaoId,
        tenantId,
        ativa: true,
      },
      select: {
        id: true,
        clienteId: true,
      },
    });

    if (!procuracao) {
      return { success: false, error: "Procuração não encontrada ou inativa" };
    }

    if (procuracao.clienteId !== processo.clienteId) {
      return { success: false, error: "Procuração pertence a outro cliente" };
    }

    const existente = await prisma.procuracaoProcesso.findFirst({
      where: {
            processoId,
        procuracaoId,
        deletedAt: null,
      },
      include: procuracaoProcessoInclude,
    });

    if (existente) {
      return { success: true, vinculo: existente, alreadyLinked: true };
    }

    const vinculoArquivado = await prisma.procuracaoProcesso.findFirst({
      where: {
        processoId,
        procuracaoId,
        NOT: {
          deletedAt: null,
        },
      },
      include: procuracaoProcessoInclude,
    });

    if (vinculoArquivado) {
      const vinculoRestaurado = await prisma.procuracaoProcesso.update({
        where: { id: vinculoArquivado.id },
        data: {
          deletedAt: null,
          deletedByActorType: null,
          deletedByActorId: null,
          deleteReason: null,
        },
        include: procuracaoProcessoInclude,
      });

      return {
        success: true,
        vinculo: vinculoRestaurado,
        restored: true,
      };
    }

    const vinculo = await prisma.procuracaoProcesso.create({
      data: {
        tenantId,
        processoId,
        procuracaoId,
      },
      include: procuracaoProcessoInclude,
    });

    return {
      success: true,
      vinculo,
    };
  } catch (error) {
    logger.error("Erro ao vincular procuração ao processo:", error);

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro ao vincular procuração",
    };
  }
}

export async function unlinkProcuracaoDoProcesso(
  processoId: string,
  procuracaoId: string,
) {
  try {
    const session = await getSession();

    await ensureProcessMutationAccess(session, processoId);

    await prisma.procuracaoProcesso.update({
      where: {
        procuracaoId_processoId: {
          procuracaoId,
          processoId,
        },
      },
      data: buildSoftDeletePayload(
        {
          actorId: (session?.user as any)?.id ?? null,
          actorType: "USER",
        },
        "Desvinculação lógica de procuração do processo",
      ),
    });

    return {
      success: true,
    };
  } catch (error) {
    logger.error("Erro ao desvincular procuração do processo:", error);

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Erro ao desvincular procuração",
    };
  }
}
