"use server";

import { getServerSession } from "next-auth/next";
import { revalidatePath } from "next/cache";

import { authOptions } from "@/auth";
import { UploadService, DocumentUploadOptions } from "@/lib/upload-service";
import prisma from "@/app/lib/prisma";
import logger from "@/lib/logger";
import { DocumentNotifier } from "@/app/lib/notifications/document-notifier";
import { checkPermission } from "@/app/actions/equipe";
import { getScopedProcuracaoId } from "@/app/actions/procuracoes";
import { headers } from "next/headers";
import { logAudit, toAuditJson } from "@/app/lib/audit/log";

const PROCURACOES_MODULE = "procuracoes";

const permissionErrors: Record<"visualizar" | "editar", string> = {
  visualizar: "Você não tem permissão para visualizar documentos da procuração",
  editar: "Você não tem permissão para editar documentos da procuração",
};

async function requirePermission(
  action: "visualizar" | "editar",
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

export interface DocumentoProcuracaoCreateInput {
  procuracaoId: string;
  fileName: string;
  description?: string;
  tipo:
    | "documento_original"
    | "procuracao_assinada"
    | "comprovante_envio"
    | "certidao_cartorio"
    | "outros";
}

// ============================================
// HELPERS
// ============================================

async function getSession() {
  return await getServerSession(authOptions);
}

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

// ============================================
// ACTIONS - DOCUMENTOS DE PROCURAÇÃO
// ============================================

/**
 * Upload de documento para uma procuração
 */
export async function uploadDocumentoProcuracao(
  procuracaoId: string,
  formData: FormData,
  options: {
    fileName: string;
    description?: string;
    tipo: DocumentoProcuracaoCreateInput["tipo"];
  },
) {
  try {
    const permissionDenied = await requirePermission("editar");

    if (permissionDenied) {
      return { success: false, error: permissionDenied };
    }

    const session = await getSession();

    if (!session?.user?.id) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;
    const tenantId = user.tenantId;
    const actorName = getActorName(user);
    const { ip, userAgent } = await getRequestContext();

    if (!tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }
    const uploaderDisplayName =
      `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() ||
      user.email ||
      user.id;

    const scopedProcuracaoId = await getScopedProcuracaoId(session, user, procuracaoId);

    if (!scopedProcuracaoId) {
      return { success: false, error: "Procuração não encontrada ou sem acesso" };
    }

    // Verificar se a procuração existe e pertence ao tenant
    const procuracao = await prisma.procuracao.findFirst({
      where: {
        id: scopedProcuracaoId,
        tenantId,
      },
      select: {
        id: true,
        numero: true,
        clienteId: true,
      },
    });

    if (!procuracao) {
      return { success: false, error: "Procuração não encontrada" };
    }

    // Obter arquivo do FormData
    const file = formData.get("file") as File;

    if (!file) {
      return { success: false, error: "Arquivo não fornecido" };
    }

    // Validar tipo de arquivo (MIME e extensão para casos onde o browser não envia MIME)
    const mimeType = file.type?.toLowerCase() || "";
    const hasPdfMime = mimeType === "application/pdf";
    const hasPdfExtension = file.name.toLowerCase().endsWith(".pdf");

    if (!hasPdfMime && !hasPdfExtension) {
      return { success: false, error: "Apenas arquivos PDF são permitidos" };
    }

    // Validar tamanho do arquivo (máximo 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB

    if (file.size > maxSize) {
      return {
        success: false,
        error: "Arquivo muito grande. Máximo permitido: 10MB",
      };
    }

    // Converter arquivo para Buffer
    const buffer = Buffer.from(await file.arrayBuffer());

    // Configurar upload
    const uploadService = UploadService.getInstance();

    // Criar identificador descritivo: nome-do-arquivo-id-da-procuracao
    const cleanFileName = options.fileName
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\-_]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "");

    const uploadOptions: DocumentUploadOptions = {
      tipo: "procuracao",
      identificador: `${cleanFileName}-${procuracao.id}`,
      fileName: options.fileName,
      description: options.description,
    };

    // Fazer upload
    const uploadResult = await uploadService.uploadDocumento(
      buffer,
      user.id,
      file.name,
      user.tenantSlug || "default",
      uploadOptions,
    );

    if (!uploadResult.success) {
      return { success: false, error: uploadResult.error || "Erro no upload" };
    }

    // Salvar registro no banco de dados
    const documento = await prisma.documentoProcuracao.create({
      data: {
        tenantId,
        procuracaoId: procuracao.id,
        fileName: options.fileName,
        originalName: file.name,
        description: options.description,
        tipo: options.tipo,
        url: uploadResult.url!,
        publicId: uploadResult.publicId!,
        size: file.size,
        mimeType: file.type,
        uploadedBy: user.id,
      },
    });

    // Revalidar cache
    revalidatePath(`/procuracoes/${scopedProcuracaoId}`);

    try {
      await DocumentNotifier.notifyUploaded({
        tenantId,
        documentoId: documento.id,
        nome: documento.fileName,
        tipo: options.tipo,
        tamanhoBytes: documento.size,
        uploaderUserId: user.id,
        uploaderNome: uploaderDisplayName,
        processoIds: undefined,
        clienteId: procuracao.clienteId,
        visivelParaCliente: false,
      });
    } catch (error) {
      logger.warn(
        "Falha ao emitir notificações de documento.uploaded (procuração)",
        error,
      );
    }

    try {
      await logAudit({
        tenantId,
        usuarioId: user.id,
        acao: "DOCUMENTO_PROCURAÇÃO_UPLOADED",
        entidade: "DocumentoProcuracao",
        entidadeId: documento.id,
        dados: toAuditJson({
          actor: actorName,
          procuracaoId: procuracao.id,
          numeroProcuracao: procuracao.numero,
          documentoNome: documento.fileName,
          documentoTipo: documento.tipo,
          tamanhoBytes: documento.size,
          mimeType: documento.mimeType,
          clienteId: procuracao.clienteId,
        }),
        changedFields: [
          "fileName",
          "originalName",
          "description",
          "tipo",
          "url",
          "size",
          "mimeType",
        ],
        ip,
        userAgent,
      });
    } catch (auditError) {
      logger.warn("Falha ao registrar auditoria de upload de documento da procuração", auditError);
    }

    return {
      success: true,
      documento,
      message: "Documento enviado com sucesso",
    };
  } catch (error) {
    logger.error("Erro ao fazer upload do documento:", error);

    return {
      success: false,
      error: "Erro interno do servidor",
    };
  }
}

/**
 * Listar documentos de uma procuração
 */
export async function getDocumentosProcuracao(procuracaoId: string) {
  try {
    const permissionDenied = await requirePermission("visualizar");

    if (permissionDenied) {
      return { success: false, error: permissionDenied };
    }

    const session = await getSession();

    if (!session?.user?.id) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;
    const tenantId = user.tenantId;
    if (!tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    const scopedProcuracaoId = await getScopedProcuracaoId(session, user, procuracaoId);

    if (!scopedProcuracaoId) {
      return { success: false, error: "Procuração não encontrada ou sem acesso" };
    }

    // Verificar se a procuração existe e pertence ao tenant
    const procuracao = await prisma.procuracao.findFirst({
      where: {
        id: scopedProcuracaoId,
        tenantId,
      },
      select: {
        id: true,
      },
    });

    if (!procuracao) {
      return { success: false, error: "Procuração não encontrada" };
    }

    // Buscar documentos
    const documentos = await prisma.documentoProcuracao.findMany({
      where: {
        procuracaoId: scopedProcuracaoId,
        tenantId,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return {
      success: true,
      documentos,
    };
  } catch (error) {
    logger.error("Erro ao buscar documentos:", error);

    return {
      success: false,
      error: "Erro interno do servidor",
    };
  }
}

/**
 * Deletar documento de procuração
 */
export async function deleteDocumentoProcuracao(documentoId: string) {
  try {
    const permissionDenied = await requirePermission("editar");

    if (permissionDenied) {
      return { success: false, error: permissionDenied };
    }

    const session = await getSession();

    if (!session?.user?.id) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;
    const tenantId = user.tenantId;
    const actorName = getActorName(user);
    const { ip, userAgent } = await getRequestContext();

    if (!tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    // Buscar documento
    const documento = await prisma.documentoProcuracao.findFirst({
      where: {
        id: documentoId,
        tenantId,
      },
      select: {
        id: true,
        url: true,
        publicId: true,
        procuracaoId: true,
        uploadedBy: true,
      },
    });

    if (!documento) {
      return { success: false, error: "Documento não encontrado" };
    }

    const scopedProcuracaoId = await getScopedProcuracaoId(session, user, documento.procuracaoId);

    if (!scopedProcuracaoId) {
      return {
        success: false,
        error: "Documento não encontrado ou sem acesso",
      };
    }

    // Buscar dados completos para auditoria
    const documentoCompleto = await prisma.documentoProcuracao.findUnique({
      where: { id: documentoId },
      include: {
        procuracao: {
          select: { numero: true, cliente: { select: { nome: true } } },
        },
      },
    });

    // Deletar do Cloudinary
    const uploadService = UploadService.getInstance();
    const deleteResult = await uploadService.deleteDocumento(
      documento.url,
      user.id,
    );

    if (!deleteResult.success) {
      logger.warn("Erro ao deletar do Cloudinary:", deleteResult.error);
      // Continuar mesmo se falhar no Cloudinary
    }

    // Deletar registro do banco
    await prisma.documentoProcuracao.delete({
      where: {
        id: documentoId,
      },
    });

    try {
      await logAudit({
        tenantId,
        usuarioId: user.id,
        acao: "DOCUMENTO_PROCURAÇÃO_DELETADO",
        entidade: "DocumentoProcuracao",
        entidadeId: documentoId,
        dados: toAuditJson({
          actor: actorName,
          procuracaoId: documento.procuracaoId,
          documentoNome: documentoCompleto?.fileName,
          documentoTipo: documentoCompleto?.tipo,
          tamanhoBytes: documentoCompleto?.size,
          mimeType: documentoCompleto?.mimeType,
          publicId: documento.publicId,
          clienteNome: documentoCompleto?.procuracao?.cliente?.nome,
        }),
        previousValues: toAuditJson({
          fileName: documentoCompleto?.fileName,
          description: documentoCompleto?.description,
          tipo: documentoCompleto?.tipo,
          url: documento.url,
          publicId: documento.publicId,
          procuracaoId: documento.procuracaoId,
        }),
        changedFields: ["deleted"],
        ip,
        userAgent,
      });
    } catch (auditError) {
      logger.warn("Falha ao registrar auditoria de exclusão de documento da procuração", auditError);
    }

    // Revalidar cache
    revalidatePath(`/procuracoes/${scopedProcuracaoId}`);

    return {
      success: true,
      message: "Documento deletado com sucesso",
    };
  } catch (error) {
    logger.error("Erro ao deletar documento:", error);

    return {
      success: false,
      error: "Erro interno do servidor",
    };
  }
}

/**
 * Limpeza automática de documentos órfãos no Cloudinary
 * Esta função deve ser executada via cron job
 */
export async function cleanupOrphanedDocuments() {
  try {
    logger.info("🧹 Iniciando limpeza de documentos órfãos...");

    const uploadService = UploadService.getInstance();
    let totalProcessed = 0;
    let totalDeleted = 0;
    let totalErrors = 0;

    // Buscar todos os documentos no banco
    const documentos = await prisma.documentoProcuracao.findMany({
      select: {
        id: true,
        url: true,
        publicId: true,
        fileName: true,
        procuracaoId: true,
        tenantId: true,
      },
    });

    logger.info(`📊 Encontrados ${documentos.length} documentos no banco`);

    for (const documento of documentos) {
      try {
        totalProcessed++;

        // Verificar se o arquivo ainda existe no Cloudinary
        const existsResult = await uploadService.checkFileExists(documento.url);

        if (!existsResult.success || !existsResult.exists) {
          logger.info(
            `🗑️  Documento órfão encontrado: ${documento.fileName} (${documento.id})`,
          );

          // Deletar do banco
          await prisma.documentoProcuracao.delete({
            where: { id: documento.id },
          });

          totalDeleted++;
        }

        // Log de progresso a cada 10 documentos
        if (totalProcessed % 10 === 0) {
          logger.info(`⏳ Processados: ${totalProcessed}/${documentos.length}`);
        }
      } catch (error) {
        logger.error(`❌ Erro ao processar documento ${documento.id}:`, error);
        totalErrors++;
      }
    }

    const result = {
      totalProcessed,
      totalDeleted,
      totalErrors,
      success: true,
    };

    logger.info("✅ Limpeza concluída:", result);

    logger.info(
      `📊 Resumo da limpeza: ${totalProcessed} processados, ${totalDeleted} deletados, ${totalErrors} erros`,
    );

    return result;
  } catch (error) {
    logger.error("❌ Erro na limpeza de documentos órfãos:", error);

    const errorMessage =
      error instanceof Error ? error.message : "Erro desconhecido";

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Atualizar informações do documento
 */
export async function updateDocumentoProcuracao(
  documentoId: string,
  data: {
    fileName?: string;
    description?: string;
    tipo?: DocumentoProcuracaoCreateInput["tipo"];
  },
) {
  try {
    const permissionDenied = await requirePermission("editar");

    if (permissionDenied) {
      return { success: false, error: permissionDenied };
    }

    const session = await getSession();

    if (!session?.user?.id) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;
    const tenantId = user.tenantId;
    const actorName = getActorName(user);
    const { ip, userAgent } = await getRequestContext();

    if (!tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    // Buscar documento
    const documento = await prisma.documentoProcuracao.findFirst({
      where: {
        id: documentoId,
        tenantId,
      },
      select: {
        id: true,
        uploadedBy: true,
        procuracaoId: true,
      },
    });

    if (!documento) {
      return { success: false, error: "Documento não encontrado" };
    }

    const scopedProcuracaoId = await getScopedProcuracaoId(session, user, documento.procuracaoId);

    if (!scopedProcuracaoId) {
      return {
        success: false,
        error: "Documento não encontrado ou sem acesso",
      };
    }

    const documentoAnterior = await prisma.documentoProcuracao.findUnique({
      where: {
        id: documentoId,
      },
      select: {
        fileName: true,
        description: true,
        tipo: true,
        size: true,
        mimeType: true,
        url: true,
      },
    });

    // Atualizar documento
    const documentoAtualizado = await prisma.documentoProcuracao.update({
      where: {
        id: documentoId,
      },
      data: {
        ...(data.fileName && { fileName: data.fileName }),
        ...(data.description && { description: data.description }),
        ...(data.tipo && { tipo: data.tipo }),
        updatedAt: new Date(),
      },
    });

    // Revalidar cache
    revalidatePath(`/procuracoes/${scopedProcuracaoId}`);

    try {
      await logAudit({
        tenantId,
        usuarioId: user.id,
        acao: "DOCUMENTO_PROCURAÇÃO_ATUALIZADO",
        entidade: "DocumentoProcuracao",
        entidadeId: documentoAtualizado.id,
        dados: toAuditJson({
          actor: actorName,
          procuracaoId: documento.procuracaoId,
          ...data,
        }),
        previousValues: toAuditJson({
          fileName: documentoAnterior?.fileName,
          description: documentoAnterior?.description,
          tipo: documentoAnterior?.tipo,
          size: documentoAnterior?.size,
          mimeType: documentoAnterior?.mimeType,
          url: documentoAnterior?.url,
        }),
        changedFields: Object.keys(data).filter(
          (field) => data[field as keyof typeof data] !== undefined,
        ) as string[],
        ip,
        userAgent,
      });
    } catch (auditError) {
      logger.warn("Falha ao registrar auditoria de atualização de documento da procuração", auditError);
    }

    return {
      success: true,
      documento: documentoAtualizado,
      message: "Documento atualizado com sucesso",
    };
  } catch (error) {
    logger.error("Erro ao atualizar documento:", error);

    return {
      success: false,
      error: "Erro interno do servidor",
    };
  }
}
