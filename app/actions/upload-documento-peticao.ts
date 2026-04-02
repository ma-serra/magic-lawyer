"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/app/lib/auth";
import prisma from "@/app/lib/prisma";
import { UploadService } from "@/lib/upload-service";
import { HybridNotificationService } from "@/app/lib/notifications/hybrid-notification-service";
import { DocumentNotifier } from "@/app/lib/notifications/document-notifier";
import { checkPermission } from "@/app/actions/equipe";
import { getAccessibleAdvogadoIds } from "@/app/lib/advogado-access";
import { buildProcessoAdvogadoMembershipWhere } from "@/app/lib/processos/processo-vinculos";

const uploadService = UploadService.getInstance();

// ============================================
// UPLOAD DE DOCUMENTO PARA PETIÇÃO
// ============================================

export async function uploadDocumentoPeticao(
  peticaoId: string,
  fileBase64: string,
  originalName: string,
  options: {
    fileName: string;
    description?: string;
  },
) {
  try {
    const session = await getSession();

    if (!session?.user?.id || !session?.user?.tenantId) {
      return {
        success: false,
        error: "Usuário não autenticado",
      };
    }

    const podeEditar = await checkPermission("processos", "editar");

    if (!podeEditar) {
      return {
        success: false,
        error: "Você não tem permissão para anexar documentos em petições",
      };
    }

    const rawUser = session.user as any;
    const uploaderDisplayName =
      `${rawUser.firstName ?? ""} ${rawUser.lastName ?? ""}`.trim() ||
      rawUser.email ||
      rawUser.id;

    const { id: userId, tenantId } = session.user;

    // Buscar tenant para obter o slug
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { slug: true },
    });

    if (!tenant) {
      return {
        success: false,
        error: "Tenant não encontrado",
      };
    }

    // Verificar se a petição existe e pertence ao tenant
    const peticao = await prisma.peticao.findFirst({
      where: {
        id: peticaoId,
        tenantId,
      },
      select: {
        id: true,
        titulo: true,
        processoId: true,
      },
    });

    if (!peticao) {
      return {
        success: false,
        error: "Petição não encontrada",
      };
    }


    const role = (session.user as any)?.role;

    if (role !== "ADMIN" && role !== "SUPER_ADMIN") {
      const accessibleAdvogados = await getAccessibleAdvogadoIds(session);
      const processoComAcesso = await prisma.processo.findFirst({
        where: {
          id: peticao.processoId,
          tenantId,
          ...buildProcessoAdvogadoMembershipWhere(accessibleAdvogados),
        },
        select: { id: true },
      });

      if (!processoComAcesso) {
        return {
          success: false,
          error: "Você não tem acesso ao processo desta petição",
        };
      }
    }

    // Converter base64 para Buffer
    const file = Buffer.from(fileBase64, "base64");

    // Fazer upload para Cloudinary usando a estrutura hierárquica
    const uploadResult = await uploadService.uploadDocumento(
      file,
      userId,
      originalName,
      tenant.slug,
      {
        tipo: "processo", // Documentos de petições vão na pasta de processos
        identificador: peticao.processoId,
        fileName: options.fileName,
        description: options.description,
      },
    );

    if (!uploadResult.success) {
      return {
        success: false,
        error: uploadResult.error || "Erro ao fazer upload",
      };
    }

    // Criar registro de documento no banco
    const documento = await prisma.documento.create({
      data: {
        tenantId,
        nome: options.fileName,
        tipo: "peticao",
        descricao: options.description,
        url: uploadResult.url!,
        contentType: "application/pdf",
        tamanhoBytes: file.length,
        uploadedById: userId,
        processoId: peticao.processoId,
        origem: "ESCRITORIO",
        visivelParaCliente: false,
        visivelParaEquipe: true,
      },
    });

    // Vincular documento à petição
    await prisma.peticao.update({
      where: { id: peticaoId },
      data: {
        documentoId: documento.id,
      },
    });

    revalidatePath("/peticoes");
    revalidatePath(`/processos/${peticao.processoId}`);

    // Notificação: documento anexado ao processo da petição
    try {
      if (peticao.processoId) {
        const processo = await prisma.processo.findFirst({
          where: { id: peticao.processoId, tenantId },
          select: {
            id: true,
            numero: true,
            advogadoResponsavel: {
              select: { usuario: { select: { id: true } } },
            },
          },
        });

        if (processo) {
          const targetUserId =
            (processo.advogadoResponsavel?.usuario as any)?.id || userId;

          await HybridNotificationService.publishNotification({
            type: "processo.document_uploaded",
            tenantId,
            userId: targetUserId,
            payload: {
              documentoId: documento.id,
              processoId: processo.id,
              numero: processo.numero,
              documentName: originalName,
              referenciaTipo: "documento",
              referenciaId: documento.id,
            },
            urgency: "MEDIUM",
            channels: ["REALTIME"],
          });
        }
      }
    } catch (e) {
      console.warn("Falha ao emitir notificação de documento (petição)", e);
    }

    try {
      await DocumentNotifier.notifyUploaded({
        tenantId,
        documentoId: documento.id,
        nome: documento.nome,
        tipo: documento.tipo,
        tamanhoBytes: documento.tamanhoBytes,
        uploaderUserId: userId,
        uploaderNome: uploaderDisplayName,
        processoIds: documento.processoId ? [documento.processoId] : undefined,
        clienteId: undefined,
        visivelParaCliente: false,
      });
    } catch (error) {
      console.warn(
        "Falha ao emitir notificações de documento.uploaded (petição)",
        error,
      );
    }

    return {
      success: true,
      data: {
        documentoId: documento.id,
        url: documento.url,
        nome: documento.nome,
      },
      message: "Documento enviado com sucesso",
    };
  } catch (error) {
    console.error("Erro ao fazer upload do documento:", error);

    return {
      success: false,
      error: "Erro ao fazer upload do documento",
    };
  }
}

// ============================================
// REMOVER DOCUMENTO DA PETIÇÃO
// ============================================

export async function removerDocumentoPeticao(peticaoId: string) {
  try {
    const session = await getSession();

    if (!session?.user?.id || !session?.user?.tenantId) {
      return {
        success: false,
        error: "Usuário não autenticado",
      };
    }

    const podeEditar = await checkPermission("processos", "editar");

    if (!podeEditar) {
      return {
        success: false,
        error: "Você não tem permissão para remover documentos de petições",
      };
    }

    const { id: userId, tenantId } = session.user;

    // Buscar petição e documento
    const peticao = await prisma.peticao.findFirst({
      where: {
        id: peticaoId,
        tenantId,
      },
      include: {
        documento: true,
      },
    });

    if (!peticao) {
      return {
        success: false,
        error: "Petição não encontrada",
      };
    }

    const role = (session.user as any)?.role;

    if (role !== "ADMIN" && role !== "SUPER_ADMIN") {
      const accessibleAdvogados = await getAccessibleAdvogadoIds(session);
      const processoComAcesso = await prisma.processo.findFirst({
        where: {
          id: peticao.processoId,
          tenantId,
          ...buildProcessoAdvogadoMembershipWhere(accessibleAdvogados),
        },
        select: { id: true },
      });

      if (!processoComAcesso) {
        return {
          success: false,
          error: "Você não tem acesso ao processo desta petição",
        };
      }
    }

    if (!peticao.documento) {
      return {
        success: false,
        error: "Petição não possui documento vinculado",
      };
    }

    // Remover vínculo da petição
    await prisma.peticao.update({
      where: { id: peticaoId },
      data: {
        documentoId: null,
      },
    });

    // Verificar se o documento está vinculado a outras petições
    const outrasPeticoes = await prisma.peticao.count({
      where: {
        documentoId: peticao.documento.id,
        id: { not: peticaoId },
      },
    });

    // Se não estiver vinculado a nenhuma outra petição, deletar do Cloudinary e banco
    if (outrasPeticoes === 0) {
      await uploadService.deleteDocumento(peticao.documento.url, userId);

      await prisma.documento.update({
        where: { id: peticao.documento.id },
        data: {
          deletedAt: new Date(),
        },
      });
    }

    revalidatePath("/peticoes");
    revalidatePath(`/processos/${peticao.processoId}`);

    return {
      success: true,
      message: "Documento removido com sucesso",
    };
  } catch (error) {
    console.error("Erro ao remover documento:", error);

    return {
      success: false,
      error: "Erro ao remover documento",
    };
  }
}
