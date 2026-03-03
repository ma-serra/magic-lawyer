"use server";

import { getSession } from "@/app/lib/auth";
import prisma from "@/app/lib/prisma";
import { Prisma } from "@/generated/prisma";
import logger from "@/lib/logger";
import { generateProcuracaoPdf } from "@/app/actions/procuracoes";
import { checkPermission } from "@/app/actions/equipe";
import { headers } from "next/headers";
import { logAudit, toAuditJson } from "@/app/lib/audit/log";

const AUDIT_ENTITY = "ModeloProcuracao";

async function getRequestContext() {
  const headersList = await headers();
  const ipRaw =
    headersList.get("x-forwarded-for") ??
    headersList.get("x-real-ip") ??
    headersList.get("cf-connecting-ip");
  const ip = ipRaw ? ipRaw.split(",")[0]?.trim() || null : null;
  const userAgent = headersList.get("user-agent");

  return { ip, userAgent };
}

function getActorName(user: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  id?: string;
}) {
  return `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email || user.id || "Usuário";
}

const PROCURACOES_MODULE = "procuracoes";

const permissionErrors: Record<
  "visualizar" | "criar" | "editar" | "excluir",
  string
> = {
  visualizar: "Você não tem permissão para visualizar modelos de procuração",
  criar: "Você não tem permissão para criar modelos de procuração",
  editar: "Você não tem permissão para editar modelos de procuração",
  excluir: "Você não tem permissão para excluir modelos de procuração",
};

async function requirePermission(
  action: "visualizar" | "criar" | "editar" | "excluir",
): Promise<string | null> {
  const allowed = await checkPermission(PROCURACOES_MODULE, action);

  if (!allowed) {
    return permissionErrors[action];
  }

  return null;
}

// ============================================
// TYPES
// ============================================

export interface ModeloProcuracaoFormData {
  nome: string;
  descricao?: string;
  conteudo: string;
  categoria?: string;
  ativo?: boolean;
}

// ============================================
// SERVER ACTIONS
// ============================================

/**
 * Busca todos os modelos de procuração do tenant
 */
export async function getAllModelosProcuracao(): Promise<{
  success: boolean;
  modelos?: any[];
  error?: string;
}> {
  try {
    const permissionDenied = await requirePermission("visualizar");

    if (permissionDenied) {
      return { success: false, error: permissionDenied };
    }

    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;

    if (!user.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    const modelos = await prisma.modeloProcuracao.findMany({
      where: {
        tenantId: user.tenantId,
        deletedAt: null,
      },
      include: {
        _count: {
          select: {
            procuracoes: true,
            versoes: true,
          },
        },
      },
      orderBy: {
        nome: "asc",
      },
    });

    return {
      success: true,
      modelos: modelos,
    };
  } catch (error) {
    logger.error("Erro ao buscar modelos de procuração:", error);

    return {
      success: false,
      error: "Erro ao buscar modelos de procuração",
    };
  }
}

/**
 * Busca um modelo de procuração por ID
 */
export async function getModeloProcuracaoById(modeloId: string): Promise<{
  success: boolean;
  modelo?: any;
  error?: string;
}> {
  try {
    const permissionDenied = await requirePermission("visualizar");

    if (permissionDenied) {
      return { success: false, error: permissionDenied };
    }

    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;

    if (!user.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    const modelo = await prisma.modeloProcuracao.findFirst({
      where: {
        id: modeloId,
        tenantId: user.tenantId,
        deletedAt: null,
      },
      include: {
        _count: {
          select: {
            procuracoes: true,
            versoes: true,
          },
        },
      },
    });

    if (!modelo) {
      return { success: false, error: "Modelo não encontrado" };
    }

    return {
      success: true,
      modelo: modelo,
    };
  } catch (error) {
    logger.error("Erro ao buscar modelo de procuração:", error);

    return {
      success: false,
      error: "Erro ao buscar modelo de procuração",
    };
  }
}

/**
 * Cria um novo modelo de procuração
 */
export async function createModeloProcuracao(
  data: ModeloProcuracaoFormData,
): Promise<{
  success: boolean;
  modelo?: any;
  error?: string;
}> {
  try {
    const permissionDenied = await requirePermission("criar");

    if (permissionDenied) {
      return { success: false, error: permissionDenied };
    }

    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;

    if (!user.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    const actorName = getActorName(user);
    const { ip, userAgent } = await getRequestContext();

    const modelo = await prisma.$transaction(async (tx) => {
      const novoModelo = await tx.modeloProcuracao.create({
        data: {
          tenantId: user.tenantId,
          nome: data.nome,
          descricao: data.descricao,
          conteudo: data.conteudo,
          categoria: data.categoria,
          ativo: data.ativo ?? true,
        },
      });

      await tx.modeloProcuracaoVersao.create({
        data: {
          tenantId: user.tenantId,
          modeloId: novoModelo.id,
          versao: 1,
          nome: novoModelo.nome,
          descricao: novoModelo.descricao,
          conteudo: novoModelo.conteudo,
          categoria: novoModelo.categoria,
          ativo: novoModelo.ativo,
          criadoPorId: user.id,
        },
      });

      return tx.modeloProcuracao.findUniqueOrThrow({
        where: {
          id: novoModelo.id,
        },
        include: {
          _count: {
            select: {
              procuracoes: true,
              versoes: true,
            },
          },
        },
      });
    });

    try {
      await logAudit({
        tenantId: user.tenantId,
        usuarioId: user.id,
        acao: "MODELO_PROCURAÇÃO_CRIADO",
        entidade: AUDIT_ENTITY,
        entidadeId: modelo.id,
        dados: toAuditJson({
          actor: actorName,
          nome: modelo.nome,
          descricao: modelo.descricao,
          categoria: modelo.categoria,
          ativo: modelo.ativo,
          conteudoPreview: modelo.conteudo?.slice(0, 80),
        }),
        changedFields: [
          "nome",
          "descricao",
          "conteudo",
          "categoria",
          "ativo",
        ],
        ip,
        userAgent,
      });
    } catch (auditError) {
      logger.warn("Falha ao registrar auditoria de criação de modelo de procuração", auditError);
    }

    return {
      success: true,
      modelo: modelo,
    };
  } catch (error) {
    logger.error("Erro ao criar modelo de procuração:", error);

    return {
      success: false,
      error: "Erro ao criar modelo de procuração",
    };
  }
}

/**
 * Atualiza um modelo de procuração
 */
export async function updateModeloProcuracao(
  modeloId: string,
  data: Partial<ModeloProcuracaoFormData>,
): Promise<{
  success: boolean;
  modelo?: any;
  error?: string;
}> {
  try {
    const permissionDenied = await requirePermission("editar");

    if (permissionDenied) {
      return { success: false, error: permissionDenied };
    }

    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;

    if (!user.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    const actorName = getActorName(user);
    const { ip, userAgent } = await getRequestContext();

    // Verificar se o modelo existe e pertence ao tenant
    const modeloExistente = await prisma.modeloProcuracao.findFirst({
      where: {
        id: modeloId,
        tenantId: user.tenantId,
        deletedAt: null,
      },
    });

    if (!modeloExistente) {
      return { success: false, error: "Modelo não encontrado" };
    }

    const updateData: Prisma.ModeloProcuracaoUpdateInput = { ...data };
    const changedFields = Object.keys(data).filter(
      (field) => data[field as keyof typeof data] !== undefined,
    );

    const modelo = await prisma.$transaction(async (tx) => {
      const atualizado = await tx.modeloProcuracao.update({
        where: {
          id: modeloId,
        },
        data: updateData,
      });

      const ultimaVersao = await tx.modeloProcuracaoVersao.findFirst({
        where: {
          modeloId,
        },
        select: {
          versao: true,
        },
        orderBy: {
          versao: "desc",
        },
      });

      await tx.modeloProcuracaoVersao.create({
        data: {
          tenantId: user.tenantId,
          modeloId,
          versao: (ultimaVersao?.versao ?? 0) + 1,
          nome: atualizado.nome,
          descricao: atualizado.descricao,
          conteudo: atualizado.conteudo,
          categoria: atualizado.categoria,
          ativo: atualizado.ativo,
          criadoPorId: user.id,
        },
      });

      return tx.modeloProcuracao.findUniqueOrThrow({
        where: {
          id: modeloId,
        },
        include: {
          _count: {
            select: {
              procuracoes: true,
              versoes: true,
            },
          },
        },
      });
    });

    if (changedFields.length > 0) {
      try {
        await logAudit({
          tenantId: user.tenantId,
          usuarioId: user.id,
          acao: "MODELO_PROCURAÇÃO_ATUALIZADO",
          entidade: AUDIT_ENTITY,
          entidadeId: modelo.id,
          dados: toAuditJson({
            actor: actorName,
            ...data,
          }),
          previousValues: toAuditJson({
            nome: modeloExistente.nome,
            descricao: modeloExistente.descricao,
            conteudo: modeloExistente.conteudo,
            categoria: modeloExistente.categoria,
            ativo: modeloExistente.ativo,
          }),
          changedFields,
          ip,
          userAgent,
        });
      } catch (auditError) {
        logger.warn(
          "Falha ao registrar auditoria de atualização de modelo de procuração",
          auditError,
        );
      }
    }

    return {
      success: true,
      modelo: modelo,
    };
  } catch (error) {
    logger.error("Erro ao atualizar modelo de procuração:", error);

    return {
      success: false,
      error: "Erro ao atualizar modelo de procuração",
    };
  }
}

/**
 * Remove um modelo de procuração (soft delete)
 */
export async function deleteModeloProcuracao(modeloId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const permissionDenied = await requirePermission("excluir");

    if (permissionDenied) {
      return { success: false, error: permissionDenied };
    }

    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;

    if (!user.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    const actorName = getActorName(user);
    const { ip, userAgent } = await getRequestContext();

    // Verificar se o modelo existe e pertence ao tenant
    const modeloExistente = await prisma.modeloProcuracao.findFirst({
      where: {
        id: modeloId,
        tenantId: user.tenantId,
        deletedAt: null,
      },
    });

    if (!modeloExistente) {
      return { success: false, error: "Modelo não encontrado" };
    }

    // Verificar se há procurações usando este modelo
    const procuracoesCount = await prisma.procuracao.count({
      where: {
        modeloId: modeloId,
      },
    });

    if (procuracoesCount > 0) {
      return {
        success: false,
        error: `Não é possível excluir este modelo pois ele está sendo usado por ${procuracoesCount} procuração(ões)`,
      };
    }

    await prisma.$transaction(async (tx) => {
      await tx.modeloProcuracao.update({
        where: {
          id: modeloId,
        },
        data: {
          deletedAt: new Date(),
          ativo: false,
        },
      });

      await tx.modeloProcuracaoVersao.updateMany({
        where: {
          modeloId,
        },
        data: {
          ativo: false,
        },
      });
    });

    try {
      await logAudit({
        tenantId: user.tenantId,
        usuarioId: user.id,
        acao: "MODELO_PROCURAÇÃO_EXCLUÍDO",
        entidade: AUDIT_ENTITY,
        entidadeId: modeloId,
        dados: toAuditJson({
          actor: actorName,
          nome: modeloExistente.nome,
          categoria: modeloExistente.categoria,
          ativo: modeloExistente.ativo,
          tenantId: user.tenantId,
          deletadoEm: new Date().toISOString(),
        }),
        previousValues: toAuditJson({
          nome: modeloExistente.nome,
          descricao: modeloExistente.descricao,
          categoria: modeloExistente.categoria,
          ativo: modeloExistente.ativo,
          deletedAt: modeloExistente.deletedAt,
        }),
        changedFields: ["deletedAt", "ativo"],
        ip,
        userAgent,
      });
    } catch (auditError) {
      logger.warn(
        "Falha ao registrar auditoria de exclusão de modelo de procuração",
        auditError,
      );
    }

    return {
      success: true,
    };
  } catch (error) {
    logger.error("Erro ao excluir modelo de procuração:", error);

    return {
      success: false,
      error: "Erro ao excluir modelo de procuração",
    };
  }
}

/**
 * Busca modelos de procuração para select (apenas ativos)
 */
export async function getModelosProcuracaoParaSelect(): Promise<{
  success: boolean;
  modelos?: { id: string; nome: string; categoria?: string | null }[];
  error?: string;
}> {
  try {
    const permissionDenied = await requirePermission("visualizar");

    if (permissionDenied) {
      return { success: false, error: permissionDenied };
    }

    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;

    if (!user.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    const modelos = await prisma.modeloProcuracao.findMany({
      where: {
        tenantId: user.tenantId,
        deletedAt: null,
        ativo: true,
      },
      select: {
        id: true,
        nome: true,
        categoria: true,
      },
      orderBy: {
        nome: "asc",
      },
    });

    return {
      success: true,
      modelos: modelos,
    };
  } catch (error) {
    logger.error("Erro ao buscar modelos para select:", error);

    return {
      success: false,
      error: "Erro ao buscar modelos para select",
    };
  }
}

/**
 * Gera PDF de uma procuração baseada no modelo
 */
export async function gerarPdfProcuracao(
  procuracaoId: string,
  _dadosPreenchidos: Record<string, any>,
): Promise<{
  success: boolean;
  pdfUrl?: string;
  pdfData?: string;
  fileName?: string;
  error?: string;
}> {
  try {
    const permissionDenied = await requirePermission("visualizar");

    if (permissionDenied) {
      return { success: false, error: permissionDenied };
    }

    // Mantida por compatibilidade: delega para a action oficial do módulo de procurações.
    const result = await generateProcuracaoPdf(procuracaoId);

    if (!result.success || !result.data) {
      return {
        success: false,
        error: result.error || "Erro ao gerar PDF da procuração",
      };
    }

    return {
      success: true,
      pdfUrl: `data:application/pdf;base64,${result.data}`,
      pdfData: result.data,
      fileName: result.fileName,
    };
  } catch (error) {
    logger.error("Erro ao gerar PDF da procuração:", error);

    return {
      success: false,
      error: "Erro ao gerar PDF da procuração",
    };
  }
}
