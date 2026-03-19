"use server";

import { getServerSession } from "next-auth/next";

import { authOptions } from "@/auth";
import { checkPermission } from "@/app/actions/equipe";
import { getAccessibleAdvogadoIds } from "@/app/lib/advogado-access";
import prisma from "@/app/lib/prisma";
import logger from "@/lib/logger";
import { Prisma, UserRole } from "@/generated/prisma";

async function ensureSession() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    throw new Error("Não autenticado");
  }

  const user = session.user as {
    id?: string;
    tenantId?: string | null;
    role?: UserRole | string;
  };

  if (!user.id || !user.tenantId) {
    throw new Error("Sessão inválida");
  }

  return {
    session,
    userId: user.id,
    tenantId: user.tenantId,
    role: user.role as UserRole,
  };
}

async function getClienteIdFromSession(session: {
  user?: { id?: string; tenantId?: string | null };
}) {
  if (!session.user?.id || !session.user.tenantId) {
    return null;
  }

  const cliente = await prisma.cliente.findFirst({
    where: {
      tenantId: session.user.tenantId,
      usuarioId: session.user.id,
      deletedAt: null,
    },
    select: {
      id: true,
    },
  });

  return cliente?.id ?? null;
}

async function buildAccessibleProcessWhere(session: {
  user?: {
    id?: string;
    tenantId?: string | null;
    role?: UserRole | string;
  };
}) {
  const user = session.user as {
    id: string;
    tenantId: string;
    role: UserRole;
  };
  const isAdmin =
    user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN;
  const clienteId = await getClienteIdFromSession(session);
  const accessibleAdvogados = await getAccessibleAdvogadoIds(session as never);

  const whereClause: Prisma.ProcessoWhereInput = {
    tenantId: user.tenantId,
    deletedAt: null,
  };

  if (clienteId) {
    whereClause.clienteId = clienteId;
    return whereClause;
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

    if (user.role === UserRole.ADVOGADO) {
      orConditions.push({
        cliente: {
          usuario: {
            createdById: user.id,
          },
        },
      });
    }

    whereClause.OR = orConditions;
  }

  return whereClause;
}

async function assertProcessAccess(processoId: string) {
  const { session, tenantId, role } = await ensureSession();
  const allowedRoles = new Set<UserRole>([
    UserRole.ADMIN,
    UserRole.SUPER_ADMIN,
    UserRole.ADVOGADO,
    UserRole.SECRETARIA,
  ]);

  if (!allowedRoles.has(role)) {
    throw new Error("Sem acesso às preferências de prazo");
  }

  if (role !== UserRole.ADMIN && role !== UserRole.SUPER_ADMIN) {
    const hasPermission = await checkPermission("processos", "visualizar");

    if (!hasPermission) {
      throw new Error("Sem permissão para visualizar este processo");
    }
  }

  const processWhere = await buildAccessibleProcessWhere(session as never);
  const processo = await prisma.processo.findFirst({
    where: {
      id: processoId,
      ...processWhere,
    },
    select: {
      id: true,
      tenantId: true,
      numero: true,
    },
  });

  if (!processo || processo.tenantId !== tenantId) {
    throw new Error("Processo não encontrado");
  }

  return processo;
}

export async function getProcessDeadlineNotificationPreference(processoId: string) {
  try {
    const { tenantId, userId } = await ensureSession();
    const processo = await assertProcessAccess(processoId);

    const preference = await prisma.processoDeadlineNotificationPreference.findUnique({
      where: {
        tenantId_userId_processoId: {
          tenantId,
          userId,
          processoId: processo.id,
        },
      },
      select: {
        deadlineAlertsMuted: true,
        mutedAt: true,
      },
    });

    return {
      success: true,
      data: {
        processoId: processo.id,
        processoNumero: processo.numero,
        deadlineAlertsMuted: preference?.deadlineAlertsMuted ?? false,
        mutedAt: preference?.mutedAt?.toISOString() ?? null,
      },
    };
  } catch (error) {
    logger.error("Erro ao carregar preferência de alertas do processo", error);

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Erro ao carregar preferência de alertas do processo",
    };
  }
}

export async function setProcessDeadlineNotificationMute(params: {
  processoId: string;
  muted: boolean;
}) {
  try {
    const { tenantId, userId } = await ensureSession();
    const processo = await assertProcessAccess(params.processoId);

    await prisma.processoDeadlineNotificationPreference.upsert({
      where: {
        tenantId_userId_processoId: {
          tenantId,
          userId,
          processoId: processo.id,
        },
      },
      update: {
        deadlineAlertsMuted: params.muted,
        mutedAt: params.muted ? new Date() : null,
        mutedReason: params.muted
          ? "Silenciado manualmente pelo usuário"
          : null,
      },
      create: {
        tenantId,
        userId,
        processoId: processo.id,
        deadlineAlertsMuted: params.muted,
        mutedAt: params.muted ? new Date() : null,
        mutedReason: params.muted
          ? "Silenciado manualmente pelo usuário"
          : null,
      },
    });

    return {
      success: true,
      data: {
        processoId: processo.id,
        deadlineAlertsMuted: params.muted,
      },
    };
  } catch (error) {
    logger.error("Erro ao atualizar mute de alertas do processo", error);

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Erro ao atualizar mute de alertas do processo",
    };
  }
}
