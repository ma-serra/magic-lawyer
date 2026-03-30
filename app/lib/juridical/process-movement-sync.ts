import prisma from "@/app/lib/prisma";
import { HybridNotificationService } from "@/app/lib/notifications/hybrid-notification-service";
import { MovimentacaoTipo } from "@/generated/prisma";
import type { MovimentacaoProcesso as MovimentacaoCapturada } from "@/lib/api/juridical/types";
import { ensurePrazoFromMovimentacao } from "@/app/lib/juridical/process-deadline-sync";

type ProcessNotificationScope = {
  titulo?: string | null;
  cliente?: {
    nome?: string | null;
  } | null;
  advogadoResponsavel?: {
    usuario?: {
      id: string;
      active: boolean;
    } | null;
  } | null;
  partes?: Array<{
    advogado?: {
      usuario?: {
        id: string;
        active: boolean;
      } | null;
    } | null;
  }>;
  procuracoesVinculadas?: Array<{
    procuracao?: {
      outorgados?: Array<{
        advogado?: {
          usuario?: {
            id: string;
            active: boolean;
          } | null;
        } | null;
      }>;
    } | null;
  }>;
};

export type PersistCapturedMovimentacoesParams = {
  tenantId: string;
  processoId: string;
  criadoPorId?: string | null;
  movimentacoes?: MovimentacaoCapturada[];
  notifyLawyers?: boolean;
  actorName?: string | null;
  sourceLabel?: string | null;
  sourceKind?: "MANUAL" | "AUTOMATIC" | "EXTERNAL";
};

export type ProcessNotificationRecipientsContext = {
  processoNumero: string;
  processoTitulo: string | null;
  clienteNome: string | null;
  userIds: string[];
};

export function extractLawyerUserIdsFromProcessScope(
  scope: ProcessNotificationScope,
) {
  const ids = new Set<string>();

  const maybeAdd = (id?: string | null, active?: boolean | null) => {
    if (!id || active === false) {
      return;
    }

    ids.add(id);
  };

  maybeAdd(
    scope.advogadoResponsavel?.usuario?.id,
    scope.advogadoResponsavel?.usuario?.active,
  );

  for (const parte of scope.partes ?? []) {
    maybeAdd(parte.advogado?.usuario?.id, parte.advogado?.usuario?.active);
  }

  for (const vinculo of scope.procuracoesVinculadas ?? []) {
    for (const outorgado of vinculo.procuracao?.outorgados ?? []) {
      maybeAdd(
        outorgado.advogado?.usuario?.id,
        outorgado.advogado?.usuario?.active,
      );
    }
  }

  return Array.from(ids);
}

function normalizeMovementText(value?: string | null) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function normalizeMovementDate(value?: Date | null) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function buildMovementKey(params: {
  dataMovimentacao?: Date | null;
  titulo?: string | null;
  descricao?: string | null;
}) {
  return [
    normalizeMovementDate(params.dataMovimentacao),
    normalizeMovementText(params.titulo),
    normalizeMovementText(params.descricao),
  ].join("|");
}

function mapMovimentacaoTipo(mov: MovimentacaoCapturada): MovimentacaoTipo {
  if (mov.categoria === "PRAZO" || mov.prazoVencimento) {
    return MovimentacaoTipo.PRAZO;
  }
  if (mov.categoria === "AUDIENCIA") {
    return MovimentacaoTipo.AUDIENCIA;
  }
  if (mov.categoria === "INTIMACAO") {
    return MovimentacaoTipo.INTIMACAO;
  }

  const hint = normalizeMovementText(
    mov.tipoNormalizado || mov.tipo || mov.descricao,
  );

  if (hint.includes("AUDIENCIA")) return MovimentacaoTipo.AUDIENCIA;
  if (hint.includes("INTIMAC")) return MovimentacaoTipo.INTIMACAO;
  if (hint.includes("PRAZO")) return MovimentacaoTipo.PRAZO;

  return MovimentacaoTipo.ANDAMENTO;
}

function normalizeCapturedMovements(
  movimentacoes?: MovimentacaoCapturada[],
): MovimentacaoCapturada[] {
  if (!Array.isArray(movimentacoes) || movimentacoes.length === 0) {
    return [];
  }

  const seen = new Set<string>();
  const deduped: MovimentacaoCapturada[] = [];

  for (const mov of movimentacoes) {
    const dataMov = mov.data instanceof Date ? mov.data : new Date(mov.data);
    if (Number.isNaN(dataMov.getTime())) continue;

    const titulo = mov.tipoNormalizado || mov.tipo || "Andamento processual";
    const descricao = mov.descricao || "";
    const key = buildMovementKey({
      dataMovimentacao: dataMov,
      titulo,
      descricao,
    });

    if (!key || seen.has(key)) continue;
    seen.add(key);

    deduped.push({
      ...mov,
      data: dataMov,
      tipoNormalizado: titulo,
      descricao,
    });
  }

  return deduped;
}

export async function getProcessNotificationRecipientsContext(
  tenantId: string,
  processoId: string,
): Promise<ProcessNotificationRecipientsContext | null> {
  const processo = await prisma.processo.findFirst({
    where: {
      id: processoId,
      tenantId,
    },
    select: {
      id: true,
      numero: true,
      titulo: true,
      cliente: {
        select: {
          nome: true,
        },
      },
      advogadoResponsavel: {
        select: {
          usuario: {
            select: {
              id: true,
              active: true,
            },
          },
        },
      },
      partes: {
        where: {
          advogadoId: {
            not: null,
          },
        },
        select: {
          advogado: {
            select: {
              usuario: {
                select: {
                  id: true,
                  active: true,
                },
              },
            },
          },
        },
      },
      procuracoesVinculadas: {
        select: {
          procuracao: {
            select: {
              outorgados: {
                select: {
                  advogado: {
                    select: {
                      usuario: {
                        select: {
                          id: true,
                          active: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!processo) {
    return null;
  }

  return {
    processoNumero: processo.numero,
    processoTitulo: processo.titulo,
    clienteNome: processo.cliente?.nome ?? null,
    userIds: extractLawyerUserIdsFromProcessScope(processo),
  };
}

export async function publishProcessNotificationToLawyers(params: {
  tenantId: string;
  processoId: string;
  type: string;
  payload: Record<string, unknown>;
  urgency?: "CRITICAL" | "HIGH" | "MEDIUM" | "INFO";
  channels?: Array<"REALTIME" | "EMAIL" | "TELEGRAM" | "PUSH">;
}) {
  const context = await getProcessNotificationRecipientsContext(
    params.tenantId,
    params.processoId,
  );

  if (!context || context.userIds.length === 0) {
    return {
      recipients: 0,
      context,
    };
  }

  await Promise.all(
    context.userIds.map((userId) =>
      HybridNotificationService.publishNotification({
        type: params.type,
        tenantId: params.tenantId,
        userId,
        payload: {
          processoId: params.processoId,
          processoNumero: context.processoNumero,
          processoTitulo: context.processoTitulo,
          clienteNome: context.clienteNome,
          referenciaTipo: "processo",
          referenciaId: params.processoId,
          ...params.payload,
        },
        urgency: params.urgency,
        channels: params.channels,
      }),
    ),
  );

  return {
    recipients: context.userIds.length,
    context,
  };
}

export async function notifyLawyersAboutProcessMovement(params: {
  tenantId: string;
  processoId: string;
  movement: {
    id: string;
    titulo: string;
    descricao: string | null;
    tipo: MovimentacaoTipo | null;
    statusOperacional: string;
    prioridade: string;
    responsavelId: string | null;
    dataMovimentacao: Date;
    slaEm: Date | null;
  };
  urgency?: "CRITICAL" | "HIGH" | "MEDIUM" | "INFO";
  actorName?: string | null;
  sourceLabel?: string | null;
  sourceKind?: "MANUAL" | "AUTOMATIC" | "EXTERNAL";
}) {
  const sourceKind =
    params.sourceKind ??
    (params.actorName ? "MANUAL" : "AUTOMATIC");
  const sourceLabel =
    params.sourceLabel ??
    (sourceKind === "MANUAL"
      ? "Atualização manual no Magic Lawyer"
      : "Atualização automática do monitoramento processual");

  const result = await publishProcessNotificationToLawyers({
    tenantId: params.tenantId,
    processoId: params.processoId,
    type: "andamento.created",
    payload: {
      andamentoId: params.movement.id,
      titulo: params.movement.titulo,
      descricao: params.movement.descricao,
      tipo: params.movement.tipo,
      statusOperacional: params.movement.statusOperacional,
      prioridade: params.movement.prioridade,
      responsavelId: params.movement.responsavelId,
      slaEm: params.movement.slaEm,
      dataMovimentacao: params.movement.dataMovimentacao,
      actorName: params.actorName ?? null,
      sourceLabel,
      sourceKind,
      detailLines: [
        `Título: ${params.movement.titulo}`,
        params.movement.descricao
          ? `Descrição: ${params.movement.descricao}`
          : null,
        params.movement.tipo ? `Tipo: ${params.movement.tipo}` : null,
        params.movement.dataMovimentacao
          ? `Data da movimentação: ${params.movement.dataMovimentacao.toLocaleString("pt-BR")}`
          : null,
      ].filter(Boolean),
    },
    urgency: params.urgency ?? "HIGH",
    channels: ["REALTIME", "EMAIL", "TELEGRAM"],
  });

  return {
    recipients: result.recipients,
  };
}

export async function persistCapturedMovimentacoes(
  params: PersistCapturedMovimentacoesParams,
) {
  const normalized = normalizeCapturedMovements(params.movimentacoes);
  if (normalized.length === 0) {
    return {
      created: 0,
      skipped: 0,
      notifiedRecipients: 0,
    };
  }

  const existing = await prisma.movimentacaoProcesso.findMany({
    where: {
      tenantId: params.tenantId,
      processoId: params.processoId,
    },
    select: {
      dataMovimentacao: true,
      titulo: true,
      descricao: true,
    },
  });

  const existingKeys = new Set(
    existing.map((item) =>
      buildMovementKey({
        dataMovimentacao: item.dataMovimentacao,
        titulo: item.titulo,
        descricao: item.descricao,
      }),
    ),
  );

  const createdMovements: Array<{
    id: string;
    titulo: string;
    descricao: string | null;
    tipo: MovimentacaoTipo | null;
    statusOperacional: string;
    prioridade: string;
    responsavelId: string | null;
    dataMovimentacao: Date;
    slaEm: Date | null;
  }> = [];

  for (const mov of normalized) {
    const movementType = mapMovimentacaoTipo(mov);
    const key = buildMovementKey({
      dataMovimentacao: mov.data,
      titulo: mov.tipoNormalizado || mov.tipo || "Andamento processual",
      descricao: mov.descricao || "",
    });

    if (!key || existingKeys.has(key)) {
      continue;
    }

    const created = await prisma.movimentacaoProcesso.create({
      data: {
        tenantId: params.tenantId,
        processoId: params.processoId,
        criadoPorId: params.criadoPorId ?? null,
        titulo: mov.tipoNormalizado || mov.tipo || "Andamento processual",
        descricao: mov.descricao || null,
        tipo: movementType,
        dataMovimentacao: mov.data,
        slaEm: mov.prazoVencimento || null,
        prazo: mov.prazoVencimento || null,
        notificarCliente: false,
        notificarEmail: false,
        notificarWhatsapp: false,
      },
      select: {
        id: true,
        processoId: true,
        titulo: true,
        descricao: true,
        tipo: true,
        statusOperacional: true,
        prioridade: true,
        responsavelId: true,
        dataMovimentacao: true,
        slaEm: true,
        prazo: true,
        resolvidoEm: true,
      },
    });

    await ensurePrazoFromMovimentacao({
      tenantId: params.tenantId,
      movement: created,
    });

    existingKeys.add(key);
    createdMovements.push(created);
  }

  let notifiedRecipients = 0;

  if (params.notifyLawyers && createdMovements.length > 0) {
    for (const movement of createdMovements) {
      const result = await notifyLawyersAboutProcessMovement({
        tenantId: params.tenantId,
        processoId: params.processoId,
        movement,
        urgency: "HIGH",
        actorName: params.actorName,
        sourceLabel: params.sourceLabel,
        sourceKind: params.sourceKind,
      });
      notifiedRecipients += result.recipients;
    }
  }

  return {
    created: createdMovements.length,
    skipped: normalized.length - createdMovements.length,
    notifiedRecipients,
  };
}
