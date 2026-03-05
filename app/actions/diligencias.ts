"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/app/lib/auth";
import prisma, { convertAllDecimalFields } from "@/app/lib/prisma";
import logger from "@/lib/logger";
import { checkPermission } from "@/app/actions/equipe";
import { DiligenciaStatus, Prisma } from "@/generated/prisma";
import {
  extractChangedFieldsFromDiff,
  logAudit,
  toAuditJson,
} from "@/app/lib/audit/log";
import { validateDeadlineWithRegime } from "@/app/lib/feriados/prazo-validation";

export interface DiligenciaCreatePayload {
  titulo: string;
  tipo?: string | null;
  descricao?: string | null;
  processoId?: string | null;
  causaId?: string | null;
  contratoId?: string | null;
  peticaoId?: string | null;
  documentoId?: string | null;
  regimePrazoId?: string | null;
  responsavelId?: string | null;
  prazoPrevisto?: string | null;
}

export interface DiligenciaUpdatePayload {
  titulo?: string;
  tipo?: string | null;
  descricao?: string | null;
  processoId?: string | null;
  causaId?: string | null;
  contratoId?: string | null;
  peticaoId?: string | null;
  documentoId?: string | null;
  regimePrazoId?: string | null;
  responsavelId?: string | null;
  prazoPrevisto?: string | null;
  prazoConclusao?: string | null;
  status?: DiligenciaStatus;
  observacoes?: string | null;
}

export interface DiligenciaBulkUpdatePayload {
  ids: string[];
  action: "status" | "assign" | "unassign" | "archive";
  status?: DiligenciaStatus;
  responsavelId?: string | null;
  observacoes?: string | null;
}

export interface DiligenciaListParams {
  status?: DiligenciaStatus;
  processoId?: string;
  causaId?: string;
  responsavelId?: string;
  clienteId?: string;
  busca?: string;
  prazoInicio?: string;
  prazoFim?: string;
  page?: number;
  pageSize?: number;
}

export interface DiligenciaListMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface DiligenciaListSummary {
  total: number;
  pendentes: number;
  emAndamento: number;
  concluidas: number;
  canceladas: number;
  atrasadas: number;
  semResponsavel: number;
}

interface DiligenciaContext {
  userId: string;
  tenantId: string;
  role: string;
  isAdmin: boolean;
  actorName: string;
  actorEmail: string | null;
}

const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 50;

function isAdminRole(role?: string | null): boolean {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

function sanitizePagination(page?: number, pageSize?: number) {
  const safePage =
    typeof page === "number" && Number.isFinite(page) && page > 0
      ? Math.floor(page)
      : 1;
  const safePageSize =
    typeof pageSize === "number" && Number.isFinite(pageSize) && pageSize > 0
      ? Math.min(Math.floor(pageSize), MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;

  return {
    page: safePage,
    pageSize: safePageSize,
    skip: (safePage - 1) * safePageSize,
  };
}

function buildMeta(total: number, page: number, pageSize: number): DiligenciaListMeta {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);

  return {
    total,
    page: safePage,
    pageSize,
    totalPages,
    hasNextPage: safePage < totalPages,
    hasPreviousPage: safePage > 1,
  };
}

function parseOptionalDate(
  input: string | null | undefined,
  fieldLabel: string,
): { ok: true; value: Date | null } | { ok: false; error: string } {
  if (input == null || input === "") {
    return { ok: true, value: null };
  }

  const parsed = new Date(input);

  if (Number.isNaN(parsed.getTime())) {
    return { ok: false, error: `${fieldLabel} inválido(a).` };
  }

  return { ok: true, value: parsed };
}

function serializeDiligencia<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(convertAllDecimalFields(value as Record<string, any>)),
  );
}

type DiligenciaAuditComparable = {
  titulo: string | null;
  tipo: string | null;
  descricao: string | null;
  observacoes: string | null;
  status: DiligenciaStatus | null;
  processoId: string | null;
  causaId: string | null;
  contratoId: string | null;
  peticaoId: string | null;
  documentoId: string | null;
  regimePrazoId: string | null;
  responsavelId: string | null;
  prazoPrevisto: string | null;
  prazoConclusao: string | null;
};

function normalizeDateForAudit(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const parsed = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function buildDiligenciaAuditSnapshot(
  diligencia: {
    id: string;
    titulo: string;
    tipo?: string | null;
    descricao?: string | null;
    observacoes?: string | null;
    status: DiligenciaStatus;
    processoId?: string | null;
    causaId?: string | null;
    contratoId?: string | null;
    peticaoId?: string | null;
    documentoId?: string | null;
    regimePrazoId?: string | null;
    responsavelId?: string | null;
    prazoPrevisto?: Date | string | null;
    prazoConclusao?: Date | string | null;
  },
): DiligenciaAuditComparable {
  return {
    titulo: diligencia.titulo ?? null,
    tipo: diligencia.tipo ?? null,
    descricao: diligencia.descricao ?? null,
    observacoes: diligencia.observacoes ?? null,
    status: diligencia.status ?? null,
    processoId: diligencia.processoId ?? null,
    causaId: diligencia.causaId ?? null,
    contratoId: diligencia.contratoId ?? null,
    peticaoId: diligencia.peticaoId ?? null,
    documentoId: diligencia.documentoId ?? null,
    regimePrazoId: diligencia.regimePrazoId ?? null,
    responsavelId: diligencia.responsavelId ?? null,
    prazoPrevisto: normalizeDateForAudit(diligencia.prazoPrevisto),
    prazoConclusao: normalizeDateForAudit(diligencia.prazoConclusao),
  };
}

function buildAuditDiff(
  previous: DiligenciaAuditComparable,
  current: DiligenciaAuditComparable,
): Array<{ field: string; previous: unknown; current: unknown }> {
  const fields = [
    "titulo",
    "tipo",
    "descricao",
    "observacoes",
    "status",
    "processoId",
    "causaId",
    "contratoId",
    "peticaoId",
    "documentoId",
    "regimePrazoId",
    "responsavelId",
    "prazoPrevisto",
    "prazoConclusao",
  ] as const;

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

function getActorDisplayName(user: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}) {
  const fullName = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();
  return fullName || user.email || "Usuário";
}

async function requireDiligenciaContext(
  permission: "visualizar" | "editar",
): Promise<DiligenciaContext> {
  const session = await getSession();

  if (!session?.user) {
    throw new Error("Não autorizado");
  }

  const user = session.user as any;

  if (!user.tenantId) {
    throw new Error("Tenant não encontrado");
  }

  if (user.role === "CLIENTE") {
    throw new Error("Clientes não possuem acesso ao módulo de diligências");
  }

  const isAdmin = isAdminRole(user.role);

  if (!isAdmin) {
    const hasPermission = await checkPermission(
      "processos",
      permission === "visualizar" ? "visualizar" : "editar",
    );

    if (!hasPermission) {
      throw new Error(
        permission === "visualizar"
          ? "Você não tem permissão para visualizar diligências"
          : "Você não tem permissão para editar diligências",
      );
    }
  }

  return {
    userId: user.id,
    tenantId: user.tenantId,
    role: user.role,
    isAdmin,
    actorName: getActorDisplayName(user),
    actorEmail: user.email ?? null,
  };
}

async function validateCreateRelations(
  context: DiligenciaContext,
  payload: DiligenciaCreatePayload,
): Promise<{ valid: true } | { valid: false; error: string }> {
  const {
    processoId,
    causaId,
    contratoId,
    peticaoId,
    documentoId,
    regimePrazoId,
    responsavelId,
  } = payload;

  const [processo, causa, contrato, peticao, documento, regimePrazo, responsavel] =
    await Promise.all([
      processoId
        ? prisma.processo.findFirst({
            where: {
              id: processoId,
              tenantId: context.tenantId,
              deletedAt: null,
            },
            select: {
              id: true,
              clienteId: true,
              tribunalId: true,
              comarca: true,
              tribunal: {
                select: {
                  uf: true,
                },
              },
            },
          })
        : Promise.resolve(null),
      causaId
        ? prisma.causa.findFirst({
            where: {
              id: causaId,
              tenantId: context.tenantId,
            },
            select: { id: true },
          })
        : Promise.resolve(null),
      contratoId
        ? prisma.contrato.findFirst({
            where: {
              id: contratoId,
              tenantId: context.tenantId,
              deletedAt: null,
            },
            select: {
              id: true,
              clienteId: true,
              processoId: true,
            },
          })
        : Promise.resolve(null),
      peticaoId
        ? prisma.peticao.findFirst({
            where: {
              id: peticaoId,
              tenantId: context.tenantId,
            },
            select: {
              id: true,
              processoId: true,
            },
          })
        : Promise.resolve(null),
      documentoId
        ? prisma.documento.findFirst({
            where: {
              id: documentoId,
              tenantId: context.tenantId,
              deletedAt: null,
            },
            select: {
              id: true,
              processoId: true,
              contratoId: true,
            },
          })
        : Promise.resolve(null),
      regimePrazoId
        ? prisma.regimePrazo.findFirst({
            where: {
              id: regimePrazoId,
              OR: [{ tenantId: context.tenantId }, { tenantId: null }],
            },
            select: { id: true },
          })
        : Promise.resolve(null),
      responsavelId
        ? prisma.usuario.findFirst({
            where: {
              id: responsavelId,
              tenantId: context.tenantId,
            },
            select: {
              id: true,
              active: true,
            },
          })
        : Promise.resolve(null),
    ]);

  if (processoId && !processo) {
    return {
      valid: false,
      error: "O processo informado não pertence ao seu escritório.",
    };
  }

  if (causaId && !causa) {
    return {
      valid: false,
      error: "A causa informada não pertence ao seu escritório.",
    };
  }

  if (contratoId && !contrato) {
    return {
      valid: false,
      error: "O contrato informado não pertence ao seu escritório.",
    };
  }

  if (peticaoId && !peticao) {
    return {
      valid: false,
      error: "A petição informada não pertence ao seu escritório.",
    };
  }

  if (documentoId && !documento) {
    return {
      valid: false,
      error: "O documento informado não pertence ao seu escritório.",
    };
  }

  if (regimePrazoId && !regimePrazo) {
    return {
      valid: false,
      error: "O regime de prazo informado não está disponível para este escritório.",
    };
  }

  if (responsavelId && !responsavel) {
    return {
      valid: false,
      error: "O responsável informado não pertence ao seu escritório.",
    };
  }

  if (responsavel && !responsavel.active) {
    return {
      valid: false,
      error: "O responsável selecionado está inativo.",
    };
  }

  if (processo && contrato) {
    if (contrato.processoId && contrato.processoId !== processo.id) {
      return {
        valid: false,
        error:
          "Contrato e processo não são compatíveis. Selecione itens do mesmo contexto.",
      };
    }

    if (contrato.clienteId !== processo.clienteId) {
      return {
        valid: false,
        error:
          "Contrato e processo pertencem a clientes diferentes. Ajuste os relacionamentos.",
      };
    }
  }

  if (peticao && processo && peticao.processoId !== processo.id) {
    return {
      valid: false,
      error:
        "A petição selecionada não pertence ao processo informado na diligência.",
    };
  }

  if (documento && processo && documento.processoId && documento.processoId !== processo.id) {
    return {
      valid: false,
      error:
        "O documento informado não pertence ao processo selecionado.",
    };
  }

  if (documento && contrato && documento.contratoId && documento.contratoId !== contrato.id) {
    return {
      valid: false,
      error:
        "O documento informado não pertence ao contrato selecionado.",
    };
  }

  const parsedPrazoPrevisto = parseOptionalDate(
    payload.prazoPrevisto,
    "Prazo previsto",
  );

  if (!parsedPrazoPrevisto.ok) {
    return {
      valid: false,
      error: parsedPrazoPrevisto.error,
    };
  }

  if (parsedPrazoPrevisto.value) {
    const deadlineValidation = await validateDeadlineWithRegime({
      tenantId: context.tenantId,
      regimePrazoId: regimePrazoId ?? null,
      data: parsedPrazoPrevisto.value,
      scope: {
        tribunalId: processo?.tribunalId ?? null,
        uf: processo?.tribunal?.uf ?? null,
        municipio: processo?.comarca ?? null,
      },
    });

    if (!deadlineValidation.valid) {
      return {
        valid: false,
        error:
          deadlineValidation.error ??
          "Prazo previsto inválido para o regime selecionado.",
      };
    }
  }

  return { valid: true };
}

function getListInclude() {
  return {
    processo: {
      select: {
        id: true,
        numero: true,
        titulo: true,
        clienteId: true,
        cliente: {
          select: {
            id: true,
            nome: true,
          },
        },
      },
    },
    causa: {
      select: {
        id: true,
        nome: true,
        codigoCnj: true,
      },
    },
    contrato: {
      select: {
        id: true,
        titulo: true,
        clienteId: true,
        processoId: true,
      },
    },
    regimePrazo: {
      select: {
        id: true,
        nome: true,
        tipo: true,
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
    criadoPor: {
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
      },
    },
  } as const;
}

export async function listDiligencias(params: DiligenciaListParams = {}) {
  try {
    const context = await requireDiligenciaContext("visualizar");
    const { page, pageSize, skip } = sanitizePagination(params.page, params.pageSize);

    const where: Prisma.DiligenciaWhereInput = {
      tenantId: context.tenantId,
    };

    if (params.status) {
      where.status = params.status;
    }

    if (params.processoId) {
      where.processoId = params.processoId;
    }

    if (params.causaId) {
      where.causaId = params.causaId;
    }

    if (params.responsavelId) {
      where.responsavelId = params.responsavelId;
    }

    if (params.clienteId) {
      where.OR = [
        {
          processo: {
            clienteId: params.clienteId,
          },
        },
        {
          contrato: {
            clienteId: params.clienteId,
          },
        },
      ];
    }

    if (params.busca?.trim()) {
      const term = params.busca.trim();
      const searchConditions: Prisma.DiligenciaWhereInput[] = [
        {
          titulo: {
            contains: term,
            mode: "insensitive",
          },
        },
        {
          tipo: {
            contains: term,
            mode: "insensitive",
          },
        },
        {
          descricao: {
            contains: term,
            mode: "insensitive",
          },
        },
        {
          observacoes: {
            contains: term,
            mode: "insensitive",
          },
        },
        {
          processo: {
            numero: {
              contains: term,
              mode: "insensitive",
            },
          },
        },
        {
          contrato: {
            titulo: {
              contains: term,
              mode: "insensitive",
            },
          },
        },
        {
          responsavel: {
            OR: [
              {
                firstName: {
                  contains: term,
                  mode: "insensitive",
                },
              },
              {
                lastName: {
                  contains: term,
                  mode: "insensitive",
                },
              },
              {
                email: {
                  contains: term,
                  mode: "insensitive",
                },
              },
            ],
          },
        },
      ];

      if (where.AND) {
        const andConditions = Array.isArray(where.AND) ? where.AND : [where.AND];
        where.AND = [...andConditions, { OR: searchConditions }];
      } else {
        where.AND = [{ OR: searchConditions }];
      }
    }

    const prazoInicio = parseOptionalDate(params.prazoInicio ?? null, "Prazo inicial");
    if (!prazoInicio.ok) {
      return { success: false, error: prazoInicio.error };
    }

    const prazoFim = parseOptionalDate(params.prazoFim ?? null, "Prazo final");
    if (!prazoFim.ok) {
      return { success: false, error: prazoFim.error };
    }

    if (prazoInicio.value || prazoFim.value) {
      where.prazoPrevisto = {
        gte: prazoInicio.value ?? undefined,
        lte: prazoFim.value ?? undefined,
      };
    }

    const include = getListInclude();

    const now = new Date();
    const summaryWhere: Prisma.DiligenciaWhereInput = {
      tenantId: context.tenantId,
    };

    const [
      total,
      diligencias,
      totalCount,
      pendentes,
      emAndamento,
      concluidas,
      canceladas,
      atrasadas,
      semResponsavel,
    ] = await prisma.$transaction([
      prisma.diligencia.count({ where }),
      prisma.diligencia.findMany({
        where,
        include,
        orderBy: [{ status: "asc" }, { prazoPrevisto: "asc" }, { createdAt: "desc" }],
        skip,
        take: pageSize,
      }),
      prisma.diligencia.count({ where: summaryWhere }),
      prisma.diligencia.count({
        where: {
          ...summaryWhere,
          status: DiligenciaStatus.PENDENTE,
        },
      }),
      prisma.diligencia.count({
        where: {
          ...summaryWhere,
          status: DiligenciaStatus.EM_ANDAMENTO,
        },
      }),
      prisma.diligencia.count({
        where: {
          ...summaryWhere,
          status: DiligenciaStatus.CONCLUIDA,
        },
      }),
      prisma.diligencia.count({
        where: {
          ...summaryWhere,
          status: DiligenciaStatus.CANCELADA,
        },
      }),
      prisma.diligencia.count({
        where: {
          ...summaryWhere,
          status: {
            in: [DiligenciaStatus.PENDENTE, DiligenciaStatus.EM_ANDAMENTO],
          },
          prazoPrevisto: {
            lt: now,
          },
        },
      }),
      prisma.diligencia.count({
        where: {
          ...summaryWhere,
          responsavelId: null,
          status: {
            in: [DiligenciaStatus.PENDENTE, DiligenciaStatus.EM_ANDAMENTO],
          },
        },
      }),
    ]);

    const meta = buildMeta(total, page, pageSize);
    const summary: DiligenciaListSummary = {
      total: totalCount,
      pendentes,
      emAndamento,
      concluidas,
      canceladas,
      atrasadas,
      semResponsavel,
    };

    return {
      success: true,
      diligencias: diligencias.map((item) => serializeDiligencia(item)),
      meta,
      summary,
    };
  } catch (error) {
    logger.error("Erro ao listar diligências:", error);

    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao carregar diligências",
    };
  }
}

export async function createDiligencia(payload: DiligenciaCreatePayload) {
  try {
    const context = await requireDiligenciaContext("editar");

    if (!payload.titulo?.trim()) {
      return { success: false, error: "Título da diligência é obrigatório" };
    }

    const prazoPrevisto = parseOptionalDate(payload.prazoPrevisto ?? null, "Prazo previsto");
    if (!prazoPrevisto.ok) {
      return { success: false, error: prazoPrevisto.error };
    }

    const relationValidation = await validateCreateRelations(context, payload);
    if (!relationValidation.valid) {
      return { success: false, error: relationValidation.error };
    }

    const data: Prisma.DiligenciaCreateInput = {
      tenant: {
        connect: {
          id: context.tenantId,
        },
      },
      titulo: payload.titulo.trim(),
      tipo: payload.tipo?.trim() || null,
      descricao: payload.descricao?.trim() || null,
      criadoPor: {
        connect: {
          id: context.userId,
        },
      },
      prazoPrevisto: prazoPrevisto.value,
      processo: payload.processoId
        ? {
            connect: {
              id: payload.processoId,
            },
          }
        : undefined,
      causa: payload.causaId
        ? {
            connect: {
              id: payload.causaId,
            },
          }
        : undefined,
      contrato: payload.contratoId
        ? {
            connect: {
              id: payload.contratoId,
            },
          }
        : undefined,
      peticao: payload.peticaoId
        ? {
            connect: {
              id: payload.peticaoId,
            },
          }
        : undefined,
      documento: payload.documentoId
        ? {
            connect: {
              id: payload.documentoId,
            },
          }
        : undefined,
      regimePrazo: payload.regimePrazoId
        ? {
            connect: {
              id: payload.regimePrazoId,
            },
          }
        : undefined,
      responsavel: payload.responsavelId
        ? {
            connect: {
              id: payload.responsavelId,
            },
          }
        : undefined,
    };

    const diligencia = await prisma.diligencia.create({
      data,
      include: getListInclude(),
    });

    try {
      const snapshot = buildDiligenciaAuditSnapshot(diligencia);
      await logAudit({
        tenantId: context.tenantId,
        usuarioId: context.userId,
        acao: "DILIGENCIA_CRIADA",
        entidade: "Diligencia",
        entidadeId: diligencia.id,
        dados: toAuditJson({
          ...snapshot,
          criadoPor: context.actorName,
          criadoPorEmail: context.actorEmail,
          criadoEm: new Date().toISOString(),
        }),
        previousValues: null,
        changedFields: Object.keys(snapshot),
      });
    } catch (auditError) {
      logger.warn("Falha ao registrar auditoria de criação de diligência", auditError);
    }

    revalidatePath("/diligencias");

    return {
      success: true,
      diligencia: serializeDiligencia(diligencia),
    };
  } catch (error) {
    logger.error("Erro ao criar diligência:", error);

    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao criar diligência",
    };
  }
}

export async function updateDiligencia(
  diligenciaId: string,
  payload: DiligenciaUpdatePayload,
) {
  try {
    const context = await requireDiligenciaContext("editar");

    const diligencia = await prisma.diligencia.findFirst({
      where: {
        id: diligenciaId,
        tenantId: context.tenantId,
      },
      select: {
        id: true,
        titulo: true,
        tipo: true,
        descricao: true,
        observacoes: true,
        status: true,
        processoId: true,
        causaId: true,
        contratoId: true,
        peticaoId: true,
        documentoId: true,
        regimePrazoId: true,
        responsavelId: true,
        prazoPrevisto: true,
        prazoConclusao: true,
      },
    });

    if (!diligencia) {
      return { success: false, error: "Diligência não encontrada" };
    }

    const nextTitulo =
      payload.titulo !== undefined ? payload.titulo.trim() : diligencia.titulo;
    if (!nextTitulo) {
      return { success: false, error: "Título é obrigatório" };
    }

    const parsedPrazoPrevisto =
      payload.prazoPrevisto !== undefined
        ? parseOptionalDate(payload.prazoPrevisto, "Prazo previsto")
        : null;
    if (parsedPrazoPrevisto && !parsedPrazoPrevisto.ok) {
      return { success: false, error: parsedPrazoPrevisto.error };
    }

    const parsedPrazoConclusao =
      payload.prazoConclusao !== undefined
        ? parseOptionalDate(payload.prazoConclusao, "Prazo de conclusão")
        : null;
    if (parsedPrazoConclusao && !parsedPrazoConclusao.ok) {
      return { success: false, error: parsedPrazoConclusao.error };
    }

    const nextRelationsPayload: DiligenciaCreatePayload = {
      titulo: nextTitulo,
      processoId:
        payload.processoId !== undefined
          ? payload.processoId || null
          : diligencia.processoId,
      causaId:
        payload.causaId !== undefined ? payload.causaId || null : diligencia.causaId,
      contratoId:
        payload.contratoId !== undefined
          ? payload.contratoId || null
          : diligencia.contratoId,
      peticaoId:
        payload.peticaoId !== undefined
          ? payload.peticaoId || null
          : diligencia.peticaoId,
      documentoId:
        payload.documentoId !== undefined
          ? payload.documentoId || null
          : diligencia.documentoId,
      regimePrazoId:
        payload.regimePrazoId !== undefined
          ? payload.regimePrazoId || null
          : diligencia.regimePrazoId,
      responsavelId:
        payload.responsavelId !== undefined
          ? payload.responsavelId || null
          : diligencia.responsavelId,
      prazoPrevisto:
        payload.prazoPrevisto !== undefined
          ? payload.prazoPrevisto || null
          : normalizeDateForAudit(diligencia.prazoPrevisto),
    };

    const relationValidation = await validateCreateRelations(
      context,
      nextRelationsPayload,
    );
    if (!relationValidation.valid) {
      return { success: false, error: relationValidation.error };
    }

    const data: Prisma.DiligenciaUpdateInput = {};

    if (payload.titulo !== undefined) {
      data.titulo = nextTitulo;
    }

    if (payload.tipo !== undefined) {
      data.tipo = payload.tipo?.trim() || null;
    }

    if (payload.descricao !== undefined) {
      data.descricao = payload.descricao?.trim() || null;
    }

    if (payload.observacoes !== undefined) {
      data.observacoes = payload.observacoes?.trim() || null;
    }

    if (payload.processoId !== undefined) {
      data.processo = payload.processoId
        ? { connect: { id: payload.processoId } }
        : { disconnect: true };
    }

    if (payload.causaId !== undefined) {
      data.causa = payload.causaId
        ? { connect: { id: payload.causaId } }
        : { disconnect: true };
    }

    if (payload.contratoId !== undefined) {
      data.contrato = payload.contratoId
        ? { connect: { id: payload.contratoId } }
        : { disconnect: true };
    }

    if (payload.peticaoId !== undefined) {
      data.peticao = payload.peticaoId
        ? { connect: { id: payload.peticaoId } }
        : { disconnect: true };
    }

    if (payload.documentoId !== undefined) {
      data.documento = payload.documentoId
        ? { connect: { id: payload.documentoId } }
        : { disconnect: true };
    }

    if (payload.regimePrazoId !== undefined) {
      data.regimePrazo = payload.regimePrazoId
        ? { connect: { id: payload.regimePrazoId } }
        : { disconnect: true };
    }

    if (payload.responsavelId !== undefined) {
      if (!payload.responsavelId) {
        data.responsavel = { disconnect: true };
      } else {
        data.responsavel = {
          connect: {
            id: payload.responsavelId,
          },
        };
      }
    }

    if (parsedPrazoPrevisto) {
      data.prazoPrevisto = parsedPrazoPrevisto.value;
    }

    if (parsedPrazoConclusao) {
      data.prazoConclusao = parsedPrazoConclusao.value;
    }

    if (payload.status !== undefined) {
      data.status = payload.status;

      if (payload.status === DiligenciaStatus.CONCLUIDA) {
        if (payload.prazoConclusao === undefined) {
          data.prazoConclusao = new Date();
        }
      } else if (payload.prazoConclusao === undefined && diligencia.status === DiligenciaStatus.CONCLUIDA) {
        data.prazoConclusao = null;
      }
    }

    const updated = await prisma.diligencia.update({
      where: { id: diligencia.id },
      data,
      include: getListInclude(),
    });

    const previousSnapshot = buildDiligenciaAuditSnapshot(diligencia);
    const currentSnapshot = buildDiligenciaAuditSnapshot(updated);
    const diff = buildAuditDiff(previousSnapshot, currentSnapshot);

    if (diff.length > 0) {
      try {
        await logAudit({
          tenantId: context.tenantId,
          usuarioId: context.userId,
          acao:
            payload.status !== undefined && payload.status !== diligencia.status
              ? "DILIGENCIA_STATUS_ATUALIZADO"
              : "DILIGENCIA_ATUALIZADA",
          entidade: "Diligencia",
          entidadeId: updated.id,
          dados: toAuditJson({
            valoresAtuais: currentSnapshot,
            diff,
            atualizadoPor: context.actorName,
            atualizadoPorEmail: context.actorEmail,
            atualizadoEm: new Date().toISOString(),
          }),
          previousValues: toAuditJson(previousSnapshot),
          changedFields: extractChangedFieldsFromDiff(diff),
        });
      } catch (auditError) {
        logger.warn("Falha ao registrar auditoria de atualização de diligência", auditError);
      }
    }

    revalidatePath("/diligencias");

    return {
      success: true,
      diligencia: serializeDiligencia(updated),
    };
  } catch (error) {
    logger.error("Erro ao atualizar diligência:", error);

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro ao atualizar diligência",
    };
  }
}

export async function archiveDiligencia(
  diligenciaId: string,
  observacoes?: string | null,
) {
  const observacaoNormalizada = observacoes?.trim() || null;

  const result = await updateDiligencia(diligenciaId, {
    status: DiligenciaStatus.CANCELADA,
    observacoes: observacaoNormalizada,
  });

  if (!result.success || !result.diligencia) {
    return result;
  }

  try {
    const context = await requireDiligenciaContext("editar");
    await logAudit({
      tenantId: context.tenantId,
      usuarioId: context.userId,
      acao: "DILIGENCIA_ARQUIVADA",
      entidade: "Diligencia",
      entidadeId: result.diligencia.id,
      dados: toAuditJson({
        observacoes: observacaoNormalizada,
        arquivadoPor: context.actorName,
        arquivadoPorEmail: context.actorEmail,
        arquivadoEm: new Date().toISOString(),
      }),
      changedFields: ["status", "observacoes"],
    });
  } catch (auditError) {
    logger.warn("Falha ao registrar auditoria de arquivamento de diligência", auditError);
  }

  return result;
}

export async function deleteDiligencia(
  diligenciaId: string,
  confirmationText: string,
) {
  try {
    const context = await requireDiligenciaContext("editar");

    if (confirmationText.trim().toUpperCase() !== "EXCLUIR") {
      return {
        success: false,
        error: 'Confirmação inválida. Digite "EXCLUIR" para confirmar.',
      };
    }

    const diligencia = await prisma.diligencia.findFirst({
      where: {
        id: diligenciaId,
        tenantId: context.tenantId,
      },
      select: {
        id: true,
        titulo: true,
        tipo: true,
        descricao: true,
        observacoes: true,
        status: true,
        processoId: true,
        causaId: true,
        contratoId: true,
        peticaoId: true,
        documentoId: true,
        regimePrazoId: true,
        responsavelId: true,
        prazoPrevisto: true,
        prazoConclusao: true,
      },
    });

    if (!diligencia) {
      return { success: false, error: "Diligência não encontrada" };
    }

    await prisma.diligencia.delete({
      where: {
        id: diligencia.id,
      },
    });

    try {
      await logAudit({
        tenantId: context.tenantId,
        usuarioId: context.userId,
        acao: "DILIGENCIA_EXCLUIDA",
        entidade: "Diligencia",
        entidadeId: diligencia.id,
        dados: toAuditJson({
          titulo: diligencia.titulo,
          excluidoPor: context.actorName,
          excluidoPorEmail: context.actorEmail,
          excluidoEm: new Date().toISOString(),
        }),
        previousValues: toAuditJson(buildDiligenciaAuditSnapshot(diligencia)),
        changedFields: ["deleted"],
      });
    } catch (auditError) {
      logger.warn("Falha ao registrar auditoria de exclusão de diligência", auditError);
    }

    revalidatePath("/diligencias");

    return { success: true };
  } catch (error) {
    logger.error("Erro ao excluir diligência:", error);

    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao excluir diligência",
    };
  }
}

export async function bulkUpdateDiligencias(payload: DiligenciaBulkUpdatePayload) {
  try {
    const context = await requireDiligenciaContext("editar");
    const uniqueIds = Array.from(new Set(payload.ids.filter(Boolean)));

    if (uniqueIds.length === 0) {
      return { success: false, error: "Selecione ao menos uma diligência." };
    }

    if (uniqueIds.length > 200) {
      return {
        success: false,
        error: "Limite de 200 diligências por operação em massa.",
      };
    }

    if (payload.action === "status" && !payload.status) {
      return {
        success: false,
        error: "Informe o status para a atualização em massa.",
      };
    }

    if (payload.action === "assign" && !payload.responsavelId) {
      return {
        success: false,
        error: "Informe o responsável para atribuição em massa.",
      };
    }

    let responsavelValido: { id: string; active: boolean } | null = null;
    if (payload.action === "assign" && payload.responsavelId) {
      responsavelValido = await prisma.usuario.findFirst({
        where: {
          id: payload.responsavelId,
          tenantId: context.tenantId,
        },
        select: {
          id: true,
          active: true,
        },
      });

      if (!responsavelValido || !responsavelValido.active) {
        return {
          success: false,
          error:
            "Responsável inválido para esta operação. Verifique se ele está ativo e pertence ao escritório.",
        };
      }
    }

    const diligencias = await prisma.diligencia.findMany({
      where: {
        tenantId: context.tenantId,
        id: {
          in: uniqueIds,
        },
      },
      select: {
        id: true,
        titulo: true,
        tipo: true,
        descricao: true,
        observacoes: true,
        status: true,
        processoId: true,
        causaId: true,
        contratoId: true,
        peticaoId: true,
        documentoId: true,
        regimePrazoId: true,
        responsavelId: true,
        prazoPrevisto: true,
        prazoConclusao: true,
      },
    });

    if (diligencias.length === 0) {
      return {
        success: false,
        error: "Nenhuma diligência encontrada para o seu escopo.",
      };
    }

    const observacaoEmLote = payload.observacoes?.trim() || null;
    const beforeById = new Map(
      diligencias.map((item) => [item.id, buildDiligenciaAuditSnapshot(item)]),
    );

    const updated = await prisma.$transaction(async (tx) => {
      return Promise.all(
        diligencias.map(async (item) => {
          const data: Prisma.DiligenciaUpdateInput = {};

          if (payload.action === "status" && payload.status) {
            data.status = payload.status;
            if (payload.status === DiligenciaStatus.CONCLUIDA) {
              data.prazoConclusao = new Date();
            } else if (item.status === DiligenciaStatus.CONCLUIDA) {
              data.prazoConclusao = null;
            }
          }

          if (payload.action === "assign" && responsavelValido) {
            data.responsavel = {
              connect: { id: responsavelValido.id },
            };
          }

          if (payload.action === "unassign") {
            data.responsavel = {
              disconnect: true,
            };
          }

          if (payload.action === "archive") {
            data.status = DiligenciaStatus.CANCELADA;
            if (observacaoEmLote) {
              data.observacoes = observacaoEmLote;
            }
          }

          return tx.diligencia.update({
            where: { id: item.id },
            data,
            select: {
              id: true,
              titulo: true,
              tipo: true,
              descricao: true,
              observacoes: true,
              status: true,
              processoId: true,
              causaId: true,
              contratoId: true,
              peticaoId: true,
              documentoId: true,
              regimePrazoId: true,
              responsavelId: true,
              prazoPrevisto: true,
              prazoConclusao: true,
            },
          });
        }),
      );
    });

    await Promise.all(
      updated.map(async (item) => {
        const previousSnapshot = beforeById.get(item.id);
        if (!previousSnapshot) return;

        const currentSnapshot = buildDiligenciaAuditSnapshot(item);
        const diff = buildAuditDiff(previousSnapshot, currentSnapshot);
        if (diff.length === 0) return;

        try {
          await logAudit({
            tenantId: context.tenantId,
            usuarioId: context.userId,
            acao: "DILIGENCIA_ATUALIZACAO_EM_LOTE",
            entidade: "Diligencia",
            entidadeId: item.id,
            dados: toAuditJson({
              action: payload.action,
              status: payload.status,
              responsavelId: payload.responsavelId,
              observacoes: observacaoEmLote,
              diff,
              atualizadoPor: context.actorName,
              atualizadoPorEmail: context.actorEmail,
              atualizadoEm: new Date().toISOString(),
            }),
            previousValues: toAuditJson(previousSnapshot),
            changedFields: extractChangedFieldsFromDiff(diff),
          });
        } catch (auditError) {
          logger.warn("Falha ao registrar auditoria de atualização em lote de diligência", {
            auditError,
            diligenciaId: item.id,
          });
        }
      }),
    );

    revalidatePath("/diligencias");

    return {
      success: true,
      updatedCount: updated.length,
      ignoredCount: Math.max(0, uniqueIds.length - updated.length),
    };
  } catch (error) {
    logger.error("Erro ao atualizar diligências em lote:", error);

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Erro ao processar atualização em lote",
    };
  }
}

export async function listDiligenciaHistorico(
  diligenciaId: string,
  limit = 20,
) {
  try {
    const context = await requireDiligenciaContext("visualizar");

    const diligencia = await prisma.diligencia.findFirst({
      where: {
        id: diligenciaId,
        tenantId: context.tenantId,
      },
      select: {
        id: true,
      },
    });

    if (!diligencia) {
      return {
        success: false,
        error: "Diligência não encontrada para este escritório.",
      };
    }

    const historico = await prisma.auditLog.findMany({
      where: {
        tenantId: context.tenantId,
        entidade: "Diligencia",
        entidadeId: diligenciaId,
      },
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
      orderBy: {
        createdAt: "desc",
      },
      take: Math.max(1, Math.min(limit, 50)),
    });

    return {
      success: true,
      historico: JSON.parse(JSON.stringify(historico)),
    };
  } catch (error) {
    logger.error("Erro ao listar histórico de diligência:", error);

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Erro ao carregar histórico da diligência",
    };
  }
}
