"use server";

import { getSession } from "@/app/lib/auth";
import prisma, { convertAllDecimalFields } from "@/app/lib/prisma";
import logger from "@/lib/logger";
import {
  Prisma,
  ProcessoStatus,
  ProcessoFase,
  ProcessoGrau,
  ProcessoPrazoStatus,
  ProcessoPolo,
} from "@/generated/prisma";
import {
  extractChangedFieldsFromDiff,
  logAudit,
  toAuditJson,
} from "@/app/lib/audit/log";
import { ProcessoNotificationIntegration } from "@/app/lib/notifications/examples/processo-integration";
import { HybridNotificationService } from "@/app/lib/notifications/hybrid-notification-service";
import { buildProcessoDiff } from "@/app/lib/processos/diff";
import { checkPermission } from "@/app/actions/equipe";
import {
  getAccessibleAdvogadoIds,
  getAdvogadoIdFromSession,
} from "@/app/lib/advogado-access";
import { validateDeadlineWithRegime } from "@/app/lib/feriados/prazo-validation";

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
  clienteId: string;
  advogadoResponsavelId: string | null;
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
  status: ProcessoPrazoStatus;
  dataVencimento: Date;
  dataCumprimento: Date | null;
  prorrogadoPara: Date | null;
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

    const isResponsavel = processo.advogadoResponsavelId === advogadoId;

    const possuiVinculoCliente = await prisma.advogadoCliente.findFirst({
      where: {
        advogadoId,
        clienteId: processo.clienteId,
        tenantId: user.tenantId,
      },
      select: { id: true },
    });

    const possuiProcuracao = await prisma.procuracaoProcesso.findFirst({
      where: {
        processoId,
        tenantId: user.tenantId,
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
  status: ProcessoPrazoStatus;
  dataVencimento: Date | string;
  prorrogadoPara?: Date | string | null;
  dataCumprimento?: Date | string | null;
  responsavelId?: string | null;
  origemMovimentacaoId?: string | null;
  regimePrazoId?: string | null;
}): Record<string, string | null> {
  return {
    titulo: prazo.titulo ?? null,
    descricao: prazo.descricao ?? null,
    fundamentoLegal: prazo.fundamentoLegal ?? null,
    status: prazo.status ?? null,
    dataVencimento: normalizeAuditDate(prazo.dataVencimento),
    prorrogadoPara: normalizeAuditDate(prazo.prorrogadoPara ?? null),
    dataCumprimento: normalizeAuditDate(prazo.dataCumprimento ?? null),
    responsavelId: prazo.responsavelId ?? null,
    origemMovimentacaoId: prazo.origemMovimentacaoId ?? null,
    regimePrazoId: prazo.regimePrazoId ?? null,
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

async function publishPrazoNotificationToUsers(params: {
  type: "prazo.created" | "prazo.updated";
  tenantId: string;
  userIds: string[];
  payload: Record<string, unknown>;
  urgency?: "CRITICAL" | "HIGH" | "MEDIUM" | "INFO";
  channels?: ("REALTIME" | "EMAIL" | "PUSH")[];
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
      whereClause.clienteId = clienteId;
    }
    // ADMIN / SUPER_ADMIN: já acessam toda base
    // Funcionário sem vínculos: acesso total (não aplicar filtros)
    else if (!isAdmin && accessibleAdvogados.length > 0) {
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

    return {
      success: true,
      processos: serialized.map((processo: Processo) => ({
        ...processo,
        origemSincronizacaoExterna:
          hasExternalSyncTag(processo.tags) ||
          syncedProcessNumbers.has(
            normalizeProcessNumberForMatch(processo.numero),
          ) ||
          syncedProcessNumbers.has(
            normalizeProcessNumberForMatch(processo.numeroCnj),
          ),
      })),
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
        clienteId: clienteId,
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
      processos: serialized,
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
        clienteId: clienteId,
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
      processos: serialized,
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
    const clienteId = await getClienteIdFromSession(session);
    const isCliente = !!clienteId;

    let whereClause: Prisma.ProcessoWhereInput = {
      id: processoId,
      tenantId: user.tenantId,
      deletedAt: null,
    };

    // Se for cliente, só pode ver seus próprios processos
    if (isCliente) {
      whereClause.clienteId = clienteId;
    }
    // Se for advogado (não admin), verificar acesso
    else if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
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
    }

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

    return {
      success: true,
      processo: serialized,
      isCliente,
    };
  } catch (error) {
    logger.error("Erro ao buscar detalhes do processo:", error);

    return {
      success: false,
      error: "Erro ao buscar processo",
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
    const clienteId = await getClienteIdFromSession(session);
    const isCliente = !!clienteId;

    // Verificar acesso ao processo
    let whereProcesso: Prisma.ProcessoWhereInput = {
      id: processoId,
      tenantId: user.tenantId,
      deletedAt: null,
    };

    if (isCliente) {
      whereProcesso.clienteId = clienteId;
    } else if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
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
    }

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

    return {
      success: true,
      documentos: documentos,
    };
  } catch (error) {
    logger.error("Erro ao buscar documentos do processo:", error);

    return {
      success: false,
      error: "Erro ao buscar documentos",
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

    // Verificar acesso ao processo
    const clienteId = await getClienteIdFromSession(session);
    const isCliente = !!clienteId;

    let whereProcesso: Prisma.ProcessoWhereInput = {
      id: processoId,
      tenantId: user.tenantId,
      deletedAt: null,
    };

    if (isCliente) {
      whereProcesso.clienteId = clienteId;
    }

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

    return {
      success: true,
      eventos: eventos,
    };
  } catch (error) {
    logger.error("Erro ao buscar eventos do processo:", error);

    return {
      success: false,
      error: "Erro ao buscar eventos",
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

    // Verificar acesso ao processo
    const clienteId = await getClienteIdFromSession(session);
    const isCliente = !!clienteId;

    let whereProcesso: Prisma.ProcessoWhereInput = {
      id: processoId,
      tenantId: user.tenantId,
      deletedAt: null,
    };

    if (isCliente) {
      whereProcesso.clienteId = clienteId;
    }

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

    return {
      success: true,
      movimentacoes: movimentacoes,
    };
  } catch (error) {
    logger.error("Erro ao buscar movimentações do processo:", error);

    return {
      success: false,
      error: "Erro ao buscar movimentações",
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
  fase?: ProcessoFase;
  grau?: ProcessoGrau;
  areaId?: string;
  classeProcessual?: string;
  vara?: string;
  comarca?: string;
  foro?: string;
  orgaoJulgador?: string;
  dataDistribuicao?: Date | string;
  segredoJustica?: boolean;
  valorCausa?: number;
  rito?: string;
  clienteId: string;
  advogadoResponsavelId?: string;
  juizId?: string;
  tribunalId?: string;
  numeroInterno?: string;
  pastaCompartilhadaUrl?: string;
  prazoPrincipal?: Date | string;
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
  dataVencimento: Date | string;
  prorrogadoPara?: Date | string | null;
  dataCumprimento?: Date | string | null;
  status?: ProcessoPrazoStatus;
  responsavelId?: string | null;
  origemMovimentacaoId?: string | null;
  regimePrazoId?: string | null;
}

export interface ProcessoPrazoUpdateInput extends Partial<ProcessoPrazoInput> {}

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

    if (!podeCriar) {
      return {
        success: false,
        error: "Você não tem permissão para criar processos",
      };
    }

    // Validar campos obrigatórios
    if (!data.numero || !data.clienteId || !data.juizId) {
      return {
        success: false,
        error:
          "Número do processo, cliente e autoridade do caso são obrigatórios",
      };
    }

    // Validar acesso ao cliente
    const cliente = await prisma.cliente.findFirst({
      where: {
        id: data.clienteId,
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

    // Se for ADVOGADO, validar vínculo com o cliente
    if (user.role === "ADVOGADO") {
      const advogadoId = await getAdvogadoIdFromSession(session);

      if (!advogadoId) {
        return { success: false, error: "Advogado não encontrado" };
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
      if (!data.advogadoResponsavelId) {
        data.advogadoResponsavelId = advogadoId;
      }
    }

    // Verificar se número do processo já existe
    const processoExistente = await prisma.processo.findFirst({
      where: {
        numero: data.numero,
        tenantId: user.tenantId,
      },
    });

    if (processoExistente) {
      return { success: false, error: "Já existe um processo com este número" };
    }

    const numeroCnj = data.numeroCnj || data.numero;
    const dataDistribuicao = data.dataDistribuicao
      ? new Date(data.dataDistribuicao)
      : null;
    const prazoPrincipal = data.prazoPrincipal
      ? new Date(data.prazoPrincipal)
      : null;

    const processo = await prisma.$transaction(async (tx) => {
      const criado = await tx.processo.create({
        data: {
          tenantId: user.tenantId,
          numero: data.numero,
          numeroCnj,
          titulo: data.titulo,
          descricao: data.descricao,
          status: data.status || ProcessoStatus.RASCUNHO,
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
          rito: data.rito,
          clienteId: data.clienteId,
          advogadoResponsavelId: data.advogadoResponsavelId,
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
          juiz: true,
          tribunal: true,
        },
      });

      await tx.processoParte.create({
        data: {
          tenantId: user.tenantId,
          processoId: criado.id,
          tipoPolo: ProcessoPolo.AUTOR,
          nome: cliente.nome,
          documento: cliente.documento || null,
          email: cliente.email || null,
          telefone: cliente.telefone || cliente.celular || null,
          clienteId: cliente.id,
          observacoes: "Parte principal (cliente)",
        },
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
        status: processo.status,
        titulo: processo.titulo ?? null,
        fase: processo.fase ?? null,
        grau: processo.grau ?? null,
        areaId: processo.areaId ?? null,
        tribunalId: processo.tribunalId ?? null,
        juizId: processo.juizId ?? null,
        advogadoResponsavelId: processo.advogadoResponsavelId ?? null,
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
      processo: serialized,
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
    if (data.clienteId && data.clienteId !== processo.clienteId) {
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

    let novoCliente: {
      id: string;
      nome: string;
      email: string | null;
      telefone: string | null;
      celular: string | null;
      documento: string | null;
    } | null = null;

    if (data.clienteId && data.clienteId !== processo.clienteId) {
      const cliente = await prisma.cliente.findFirst({
        where: {
          id: data.clienteId,
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

    if (data.advogadoResponsavelId) {
      const advogado = await prisma.advogado.findFirst({
        where: {
          id: data.advogadoResponsavelId,
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
          tenantId,
        },
        select: { id: true },
      });

      if (!tribunal) {
        return { success: false, error: "Tribunal informado não encontrado" };
      }
    }

    const updatePayload: Prisma.ProcessoUncheckedUpdateInput = {};

    if (data.numero !== undefined) updatePayload.numero = data.numero;
    if (data.numeroCnj !== undefined)
      updatePayload.numeroCnj = data.numeroCnj || null;
    if (data.titulo !== undefined) updatePayload.titulo = data.titulo || null;
    if (data.descricao !== undefined)
      updatePayload.descricao = data.descricao || null;
    if (data.status !== undefined) updatePayload.status = data.status;
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
    if (data.rito !== undefined) updatePayload.rito = data.rito || null;
    if (data.clienteId !== undefined) updatePayload.clienteId = data.clienteId;
    if (data.advogadoResponsavelId !== undefined)
      updatePayload.advogadoResponsavelId = data.advogadoResponsavelId || null;
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
          juiz: true,
          tribunal: true,
        },
      });

      if (novoCliente) {
        await tx.processoParte.deleteMany({
          where: {
            processoId,
            clienteId: processo.clienteId,
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

    const diff = buildProcessoDiff(processo as any, atualizado as any);

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

    // Notificações, diff estruturado e auditoria da alteração
    try {
      if (diff.items.length > 0) {
        const responsavelUserId =
          (atualizado.advogadoResponsavel?.usuario as any)?.id ||
          (user.id as string);
        const statusChange = diff.statusChange;
        const changesSummary = statusChange
          ? diff.otherChangesSummary
          : diff.summary;

        const notificationPayload: Record<string, any> = {
          processoId,
          numero: atualizado.numero,
          referenciaTipo: "processo",
          referenciaId: processoId,
          diff: diff.items,
          changes: diff.items.map((item) => item.field),
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

        await HybridNotificationService.publishNotification({
          type: statusChange ? "processo.status_changed" : "processo.updated",
          tenantId: tenantId,
          userId: responsavelUserId,
          payload: notificationPayload,
          urgency: statusChange ? "HIGH" : "MEDIUM",
          channels: statusChange ? ["REALTIME", "EMAIL"] : ["REALTIME"],
        });

        const actorName =
          `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() ||
          (user.email as string | undefined) ||
          "Usuário";

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
      processo: serialized,
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
    if (input.nome !== undefined) updateData.nome = input.nome;
    if (input.documento !== undefined)
      updateData.documento = input.documento ?? cliente?.documento ?? null;
    if (input.email !== undefined)
      updateData.email = input.email ?? cliente?.email ?? advogadoEmail ?? null;
    if (input.telefone !== undefined)
      updateData.telefone =
        input.telefone ?? cliente?.telefone ?? cliente?.celular ?? null;
    if (input.papel !== undefined) updateData.papel = input.papel ?? null;
    if (input.observacoes !== undefined)
      updateData.observacoes = input.observacoes ?? null;

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

    await ensureParteMutationAccess(session, parteId);

    await prisma.processoParte.delete({
      where: { id: parteId },
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
    if (!input?.titulo) {
      return { success: false, error: "Título do prazo é obrigatório" };
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

    const prazo = await prisma.processoPrazo.create({
      data: {
        tenantId,
        processoId,
        titulo: input.titulo,
        descricao: input.descricao || null,
        fundamentoLegal: input.fundamentoLegal || null,
        status: input.status || ProcessoPrazoStatus.ABERTO,
        dataVencimento: parsedDataVencimento.date,
        prorrogadoPara: parsedProrrogadoPara.date,
        dataCumprimento: parsedDataCumprimento.date,
        responsavelId,
        origemMovimentacaoId: input.origemMovimentacaoId ?? null,
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
          titulo: prazo.titulo,
          dataVencimento: prazo.dataVencimento.toISOString(),
          status: prazo.status,
          referenciaTipo: "prazo",
          referenciaId: prazo.id,
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
        regimePrazoId: prazo.regimePrazo?.id ?? null,
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

    const prazoAnterior = await prisma.processoPrazo.findFirst({
      where: {
        id: prazoId,
        tenantId,
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
    const proximaDataVencimento =
      parsedDataVencimento?.date ?? prazoAnterior.dataVencimento;

    const deadlineValidation = await validateDeadlineWithRegime({
      tenantId,
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

    const atualizado = await prisma.processoPrazo.update({
      where: { id: prazoId },
      data: updateData,
      include: processoPrazoInclude,
    });

    const previousSnapshot = buildPrazoAuditSnapshot({
      ...prazoAnterior,
      regimePrazoId: prazoAnterior.regimePrazo?.id ?? null,
    });
    const currentSnapshot = buildPrazoAuditSnapshot({
      ...atualizado,
      regimePrazoId: atualizado.regimePrazo?.id ?? null,
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
            titulo: atualizado.titulo,
            dataVencimento: atualizado.dataVencimento.toISOString(),
            status: atualizado.status,
            changes: diff.map((item) => item.field),
            referenciaTipo: "prazo",
            referenciaId: atualizado.id,
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
      },
      include: processoPrazoInclude,
    });

    if (!prazoAnterior) {
      return { success: false, error: "Prazo não encontrado" };
    }

    await prisma.processoPrazo.delete({
      where: { id: prazoId },
    });

    try {
      const snapshot = buildPrazoAuditSnapshot({
        ...prazoAnterior,
        regimePrazoId: prazoAnterior.regimePrazo?.id ?? null,
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
      },
      include: procuracaoProcessoInclude,
    });

    if (existente) {
      return { success: true, vinculo: existente, alreadyLinked: true };
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

    await prisma.procuracaoProcesso.delete({
      where: {
        procuracaoId_processoId: {
          procuracaoId,
          processoId,
        },
      },
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
