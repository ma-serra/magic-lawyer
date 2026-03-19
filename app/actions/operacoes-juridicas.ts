"use server";

import { getSession } from "@/app/lib/auth";
import prisma from "@/app/lib/prisma";
import { checkPermission } from "@/app/actions/equipe";
import { getAccessibleAdvogadoIds } from "@/app/lib/advogado-access";
import { listPortalProcessSyncStates } from "@/app/lib/juridical/process-sync-status-store";
import {
  buildDiscoveryBacklogReasons,
  buildProtocolReadiness,
  classifyOperationalCommunication,
  extractJsonStringTags,
  getCommunicationKindLabel,
  getCommunicationStatusLabel,
  getMovementPriorityWeight,
  hasExternalDiscoverySignal,
} from "@/app/lib/juridical/operations-hub";
import {
  MovimentacaoPrioridade,
  Prisma,
  UserRole,
} from "@/generated/prisma";

function isAdminRole(role?: string | null) {
  return role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN;
}

function buildPersonName(input?: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
} | null) {
  if (!input) return null;

  const full = `${input.firstName || ""} ${input.lastName || ""}`.trim();
  return full || input.email || null;
}

async function getTenantOperationsContext() {
  const session = await getSession();

  if (!session?.user?.tenantId || !session.user.id) {
    throw new Error("Usuário não autenticado.");
  }

  const role = (session.user as any)?.role as UserRole | undefined;

  if (role === UserRole.CLIENTE || role === UserRole.FINANCEIRO) {
    throw new Error("Sem acesso à central operacional.");
  }

  const canView = await checkPermission("processos", "visualizar");
  if (!canView && !isAdminRole(role)) {
    throw new Error("Sem permissão para visualizar operações jurídicas.");
  }

  return {
    session,
    tenantId: session.user.tenantId,
    userId: session.user.id,
    role,
  };
}

async function getProcessScopeForSession(
  session: Awaited<ReturnType<typeof getSession>>,
): Promise<Prisma.ProcessoWhereInput | undefined> {
  const user = session?.user as any;

  if (!session?.user || isAdminRole(user?.role)) {
    return undefined;
  }

  const accessibleAdvogados = await getAccessibleAdvogadoIds(session);

  if (
    accessibleAdvogados.length === 0 ||
    (accessibleAdvogados.length === 1 &&
      String(accessibleAdvogados[0]).startsWith("__"))
  ) {
    return undefined;
  }

  return {
    advogadoResponsavelId: {
      in: accessibleAdvogados,
    },
  };
}

export async function getOperacoesJuridicasWorkspace() {
  try {
    const { session, tenantId, userId } = await getTenantOperationsContext();
    const processScope = await getProcessScopeForSession(session);
    const now = new Date();
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const last120Days = new Date(now.getTime() - 120 * 24 * 60 * 60 * 1000);

    const baseProcessoWhere: Prisma.ProcessoWhereInput = {
      tenantId,
      deletedAt: null,
      ...(processScope || {}),
    };

    const [
      communicationRaw,
      totalProcessos,
      processosComTribunal,
      processosSemMovimentacao,
      processosComMovimento30d,
      processosSemResponsavel,
      recentProcesses,
      backlogProcesses,
      syncHistory,
      protocoladasCount,
      readyProtocolCount,
      blockedProtocolCount,
      attentionProtocolCount,
      protocolQueueRaw,
    ] = await Promise.all([
      prisma.movimentacaoProcesso.findMany({
        where: {
          tenantId,
          processo: baseProcessoWhere,
          dataMovimentacao: {
            gte: last120Days,
          },
        },
        select: {
          id: true,
          titulo: true,
          descricao: true,
          tipo: true,
          prioridade: true,
          statusOperacional: true,
          dataMovimentacao: true,
          prazo: true,
          slaEm: true,
          resolvidoEm: true,
          responsavel: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          processo: {
            select: {
              id: true,
              numero: true,
              titulo: true,
              status: true,
              tribunal: {
                select: {
                  sigla: true,
                  nome: true,
                },
              },
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
                      email: true,
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: {
          dataMovimentacao: "desc",
        },
        take: 180,
      }),
      prisma.processo.count({
        where: baseProcessoWhere,
      }),
      prisma.processo.count({
        where: {
          ...baseProcessoWhere,
          tribunalId: { not: null },
        },
      }),
      prisma.processo.count({
        where: {
          ...baseProcessoWhere,
          movimentacoes: {
            none: {},
          },
        },
      }),
      prisma.processo.count({
        where: {
          ...baseProcessoWhere,
          movimentacoes: {
            some: {
              dataMovimentacao: {
                gte: last30Days,
              },
            },
          },
        },
      }),
      prisma.processo.count({
        where: {
          ...baseProcessoWhere,
          advogadoResponsavelId: null,
        },
      }),
      prisma.processo.findMany({
        where: baseProcessoWhere,
        select: {
          id: true,
          numero: true,
          titulo: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          tags: true,
          cliente: {
            select: {
              nome: true,
            },
          },
          tribunal: {
            select: {
              sigla: true,
              nome: true,
            },
          },
          advogadoResponsavel: {
            select: {
              usuario: {
                select: {
                  firstName: true,
                  lastName: true,
                  email: true,
                },
              },
            },
          },
          movimentacoes: {
            select: {
              dataMovimentacao: true,
            },
            orderBy: {
              dataMovimentacao: "desc",
            },
            take: 1,
          },
          _count: {
            select: {
              movimentacoes: true,
              peticoes: true,
              prazos: true,
            },
          },
        },
        orderBy: {
          updatedAt: "desc",
        },
        take: 24,
      }),
      prisma.processo.findMany({
        where: {
          ...baseProcessoWhere,
          OR: [
            { tribunalId: null },
            { advogadoResponsavelId: null },
            {
              movimentacoes: {
                none: {},
              },
            },
          ],
        },
        select: {
          id: true,
          numero: true,
          titulo: true,
          status: true,
          tags: true,
          cliente: {
            select: {
              nome: true,
            },
          },
          tribunal: {
            select: {
              sigla: true,
              nome: true,
            },
          },
          advogadoResponsavel: {
            select: {
              usuario: {
                select: {
                  firstName: true,
                  lastName: true,
                  email: true,
                },
              },
            },
          },
          movimentacoes: {
            select: {
              dataMovimentacao: true,
            },
            orderBy: {
              dataMovimentacao: "desc",
            },
            take: 1,
          },
          _count: {
            select: {
              movimentacoes: true,
            },
          },
        },
        orderBy: {
          updatedAt: "desc",
        },
        take: 18,
      }),
      listPortalProcessSyncStates({
        tenantId,
        usuarioId: userId,
        limit: 8,
      }),
      prisma.peticao.count({
        where: {
          tenantId,
          processo: baseProcessoWhere,
          status: "PROTOCOLADA",
        },
      }),
      prisma.peticao.count({
        where: {
          tenantId,
          processo: baseProcessoWhere,
          status: {
            in: ["RASCUNHO", "EM_ANALISE"],
          },
          documentoId: { not: null },
          tipo: { not: null },
        },
      }),
      prisma.peticao.count({
        where: {
          tenantId,
          processo: baseProcessoWhere,
          OR: [{ status: "INDEFERIDA" }, { documentoId: null }],
        },
      }),
      prisma.peticao.count({
        where: {
          tenantId,
          processo: baseProcessoWhere,
          status: {
            in: ["RASCUNHO", "EM_ANALISE"],
          },
          documentoId: { not: null },
          tipo: null,
        },
      }),
      prisma.peticao.findMany({
        where: {
          tenantId,
          processo: baseProcessoWhere,
        },
        select: {
          id: true,
          titulo: true,
          tipo: true,
          status: true,
          protocoloNumero: true,
          protocoladoEm: true,
          updatedAt: true,
          createdAt: true,
          observacoes: true,
          processo: {
            select: {
              id: true,
              numero: true,
              titulo: true,
              status: true,
              tribunal: {
                select: {
                  sigla: true,
                },
              },
              cliente: {
                select: {
                  nome: true,
                },
              },
            },
          },
          documento: {
            select: {
              id: true,
              nome: true,
              url: true,
              contentType: true,
            },
          },
          modelo: {
            select: {
              nome: true,
            },
          },
          causa: {
            select: {
              nome: true,
            },
          },
          criadoPor: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
        orderBy: {
          updatedAt: "desc",
        },
        take: 80,
      }),
    ]);

    const communications = communicationRaw
      .map((item) => {
        const kind = classifyOperationalCommunication({
          tipo: item.tipo,
          titulo: item.titulo,
          descricao: item.descricao,
          prioridade: item.prioridade,
          prazo: item.prazo,
        });

        if (!kind) {
          return null;
        }

        return {
          id: item.id,
          kind,
          kindLabel: getCommunicationKindLabel(kind),
          titulo: item.titulo,
          descricao: item.descricao,
          prioridade: item.prioridade,
          statusOperacional: item.statusOperacional,
          statusLabel: getCommunicationStatusLabel(item.statusOperacional),
          dataMovimentacao: item.dataMovimentacao.toISOString(),
          prazo: item.prazo?.toISOString() ?? null,
          slaEm: item.slaEm?.toISOString() ?? null,
          resolvidoEm: item.resolvidoEm?.toISOString() ?? null,
          responsavelNome: buildPersonName(item.responsavel),
          processo: {
            id: item.processo.id,
            numero: item.processo.numero,
            titulo: item.processo.titulo,
            status: item.processo.status,
            tribunalSigla: item.processo.tribunal?.sigla ?? null,
            tribunalNome: item.processo.tribunal?.nome ?? null,
            clienteNome: item.processo.cliente.nome,
            advogadoResponsavelNome: buildPersonName(
              item.processo.advogadoResponsavel?.usuario,
            ),
          },
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        const priorityDelta =
          getMovementPriorityWeight(b!.prioridade) -
          getMovementPriorityWeight(a!.prioridade);

        if (priorityDelta !== 0) {
          return priorityDelta;
        }

        return (
          new Date(b!.dataMovimentacao).getTime() -
          new Date(a!.dataMovimentacao).getTime()
        );
      }) as Array<{
      id: string;
      kind: ReturnType<typeof classifyOperationalCommunication> extends infer T
        ? Exclude<T, null>
        : never;
      kindLabel: string;
      titulo: string;
      descricao: string | null;
      prioridade: MovimentacaoPrioridade;
      statusOperacional: string;
      statusLabel: string;
      dataMovimentacao: string;
      prazo: string | null;
      slaEm: string | null;
      resolvidoEm: string | null;
      responsavelNome: string | null;
      processo: {
        id: string;
        numero: string;
        titulo: string | null;
        status: string;
        tribunalSigla: string | null;
        tribunalNome: string | null;
        clienteNome: string;
        advogadoResponsavelNome: string | null;
      };
    }>;

    const recentDiscoveryItems = recentProcesses.map((item) => {
      const tags = extractJsonStringTags(item.tags);
      const lastMovementAt = item.movimentacoes[0]?.dataMovimentacao ?? null;
      const hasExternalSignal = hasExternalDiscoverySignal(item.tags);

      return {
        id: item.id,
        numero: item.numero,
        titulo: item.titulo,
        status: item.status,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
        tags,
        hasExternalSignal,
        clienteNome: item.cliente.nome,
        tribunalSigla: item.tribunal?.sigla ?? null,
        tribunalNome: item.tribunal?.nome ?? null,
        advogadoResponsavelNome: buildPersonName(
          item.advogadoResponsavel?.usuario,
        ),
        lastMovementAt: lastMovementAt?.toISOString() ?? null,
        movimentacoesCount: item._count.movimentacoes,
        peticoesCount: item._count.peticoes,
        prazosCount: item._count.prazos,
      };
    });

    const discoveryBacklog = backlogProcesses.map((item) => ({
      id: item.id,
      numero: item.numero,
      titulo: item.titulo,
      status: item.status,
      clienteNome: item.cliente.nome,
      tribunalSigla: item.tribunal?.sigla ?? null,
      advogadoResponsavelNome: buildPersonName(
        item.advogadoResponsavel?.usuario,
      ),
      lastMovementAt: item.movimentacoes[0]?.dataMovimentacao?.toISOString() ?? null,
      reasons: buildDiscoveryBacklogReasons({
        hasTribunal: Boolean(item.tribunal),
        hasMovements: item._count.movimentacoes > 0,
        hasExternalSignal: hasExternalDiscoverySignal(item.tags),
        hasResponsible: Boolean(item.advogadoResponsavel),
      }),
    }));

    const protocolQueue = protocolQueueRaw.map((item) => {
      const readiness = buildProtocolReadiness({
        status: item.status,
        documentoId: item.documento?.id,
        documentoContentType: item.documento?.contentType,
        tipo: item.tipo,
        protocoloNumero: item.protocoloNumero,
        protocoladoEm: item.protocoladoEm,
      });

      return {
        id: item.id,
        titulo: item.titulo,
        tipo: item.tipo,
        status: item.status,
        protocoloNumero: item.protocoloNumero,
        protocoladoEm: item.protocoladoEm?.toISOString() ?? null,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
        observacoes: item.observacoes,
        readiness,
        processo: {
          id: item.processo.id,
          numero: item.processo.numero,
          titulo: item.processo.titulo,
          status: item.processo.status,
          tribunalSigla: item.processo.tribunal?.sigla ?? null,
          clienteNome: item.processo.cliente.nome,
        },
        documento: item.documento
          ? {
              id: item.documento.id,
              nome: item.documento.nome,
              url: item.documento.url,
              contentType: item.documento.contentType,
            }
          : null,
        modeloNome: item.modelo?.nome ?? null,
        causaNome: item.causa?.nome ?? null,
        criadoPorNome: buildPersonName(item.criadoPor),
      };
    });

    return {
      success: true,
      data: {
        fetchedAt: now.toISOString(),
        communications: {
          summary: {
            total: communications.length,
            last24h: communications.filter(
              (item) => new Date(item.dataMovimentacao) >= last24Hours,
            ).length,
            triage: communications.filter((item) =>
              ["NOVO", "EM_TRIAGEM"].includes(item.statusOperacional),
            ).length,
            critical: communications.filter(
              (item) =>
                item.prioridade === MovimentacaoPrioridade.CRITICA ||
                item.kind === "PRAZO",
            ).length,
            resolved7d: communications.filter(
              (item) =>
                item.statusOperacional === "RESOLVIDO" &&
                item.resolvidoEm &&
                new Date(item.resolvidoEm) >= last7Days,
            ).length,
          },
          items: communications.slice(0, 60),
        },
        discovery: {
          summary: {
            totalProcessos,
            processosComTribunal,
            processosSemMovimentacao,
            processosComMovimento30d,
            processosSemResponsavel,
            sinaisExternosRecentes: recentDiscoveryItems.filter(
              (item) => item.hasExternalSignal,
            ).length,
          },
          syncHistory: syncHistory.map((item) => ({
            syncId: item.syncId,
            tribunalSigla: item.tribunalSigla,
            oab: item.oab,
            status: item.status,
            syncedCount: item.syncedCount,
            createdCount: item.createdCount,
            updatedCount: item.updatedCount,
            error: item.error,
            updatedAt: item.updatedAt,
            createdAt: item.createdAt,
          })),
          recentProcesses: recentDiscoveryItems,
          backlog: discoveryBacklog,
        },
        protocols: {
          summary: {
            protocoladas: protocoladasCount,
            prontas: readyProtocolCount,
            bloqueadas: blockedProtocolCount,
            revisao: attentionProtocolCount,
          },
          items: protocolQueue,
        },
      },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Falha ao montar a central de operações jurídicas.",
    };
  }
}
