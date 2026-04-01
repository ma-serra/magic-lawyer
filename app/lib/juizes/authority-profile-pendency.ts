import "server-only";

import { NotificationService } from "@/app/lib/notifications/notification-service";
import prisma from "@/app/lib/prisma";
import logger from "@/lib/logger";
import {
  AutoridadeStatusUnlock,
  JuizTipoAutoridade,
  Prisma,
  TarefaPrioridade,
  TarefaStatus,
  TenantStatus,
  UserRole,
} from "@/generated/prisma";

export const AUTHORITY_PENDING_TASK_TITLE = "Completar cadastro da autoridade";

const OPEN_TASK_STATUSES = [TarefaStatus.PENDENTE, TarefaStatus.EM_ANDAMENTO];
const REMINDER_INTERVAL_DAYS = 7;

type DbClient = Prisma.TransactionClient | typeof prisma;

export type AuthorityPendingResponsibleSummary = {
  id: string;
  nome: string;
};

export type AuthorityPendingMetadata = {
  cadastroCompleto: boolean;
  camposPendentes: string[];
  tarefaPendenciaId: string | null;
  responsavelPendencia: AuthorityPendingResponsibleSummary | null;
};

export type AuthorityPendingSyncResult = {
  metadata: AuthorityPendingMetadata;
  action: "none" | "created" | "updated" | "completed" | "reminded";
};

export type AuthorityCompletenessInput = {
  nome?: string | null;
  tipoAutoridade?: JuizTipoAutoridade | null;
  vara?: string | null;
  comarca?: string | null;
  cidade?: string | null;
  estado?: string | null;
  tribunalId?: string | null;
};

type AuthorityPendingTaskRecord = {
  id: string;
  juizId: string | null;
  descricao: string | null;
  responsavelId: string | null;
  lembreteEm: Date | null;
  responsavel: {
    id: string;
    firstName: string | null;
    lastName: string | null;
  } | null;
};

type AuthorityOverlayCore = Partial<
  Pick<
    AuthorityCompletenessInput,
    "nome" | "tipoAutoridade" | "vara" | "comarca" | "cidade" | "estado" | "tribunalId"
  >
>;

type AuthorityCoreRecord = Required<
  Pick<AuthorityCompletenessInput, "nome" | "tipoAutoridade">
> &
  Pick<
    AuthorityCompletenessInput,
    "vara" | "comarca" | "cidade" | "estado" | "tribunalId"
  >;

function hasValue(value: string | null | undefined) {
  return typeof value === "string" ? value.trim().length > 0 : Boolean(value);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function buildUserDisplayName(user: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}) {
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return name || user.email || "Responsavel do escritorio";
}

function buildResponsibleSummary(user: {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}): AuthorityPendingResponsibleSummary {
  return {
    id: user.id,
    nome: buildUserDisplayName(user),
  };
}

function getFieldLabel(
  field: "vara" | "comarca" | "cidade" | "estado" | "tribunalId",
  tipoAutoridade?: JuizTipoAutoridade | null,
) {
  if (field === "vara") {
    return tipoAutoridade === JuizTipoAutoridade.PROMOTOR
      ? "Promotoria"
      : "Vara";
  }

  if (field === "estado") {
    return "UF";
  }

  if (field === "tribunalId") {
    return "Tribunal";
  }

  return field.charAt(0).toUpperCase() + field.slice(1);
}

export function getAuthorityPendingFieldLabels(
  authority: AuthorityCompletenessInput,
) {
  const pending: string[] = [];

  if (!hasValue(authority.vara)) {
    pending.push(getFieldLabel("vara", authority.tipoAutoridade));
  }

  if (!hasValue(authority.comarca)) {
    pending.push("Comarca");
  }

  if (!hasValue(authority.cidade)) {
    pending.push("Cidade");
  }

  if (!hasValue(authority.estado)) {
    pending.push("UF");
  }

  if (!hasValue(authority.tribunalId)) {
    pending.push("Tribunal");
  }

  return pending;
}

export function buildAuthorityPendingMetadata(
  authority: AuthorityCompletenessInput,
  task?: {
    id?: string | null;
    responsavel?: AuthorityPendingResponsibleSummary | null;
  } | null,
): AuthorityPendingMetadata {
  const camposPendentes = getAuthorityPendingFieldLabels(authority);

  return {
    cadastroCompleto: camposPendentes.length === 0,
    camposPendentes,
    tarefaPendenciaId: task?.id ?? null,
    responsavelPendencia: task?.responsavel ?? null,
  };
}

function buildAuthorityPendingTaskDescription(
  authority: AuthorityCompletenessInput,
  camposPendentes: string[],
) {
  const authorityLabel =
    authority.tipoAutoridade === JuizTipoAutoridade.PROMOTOR
      ? "da autoridade"
      : "da autoridade";
  const authorityName = authority.nome?.trim() || "sem nome informado";

  return `Completar o cadastro ${authorityLabel} ${authorityName}. Campos minimos pendentes: ${camposPendentes.join(", ")}.`;
}

function buildCreationNotificationPayload(params: {
  authority: AuthorityCompletenessInput;
  juizId: string;
  taskId: string;
  camposPendentes: string[];
}) {
  const authorityName = params.authority.nome?.trim() || "Autoridade";

  return {
    tarefaId: params.taskId,
    juizId: params.juizId,
    title: "Cadastro de autoridade incompleto",
    message: `${authorityName} foi cadastrado com dados minimos. Complete: ${params.camposPendentes.join(", ")}.`,
    autoridadeNome: authorityName,
    camposPendentes: params.camposPendentes,
  };
}

function buildReminderNotificationPayload(params: {
  authority: AuthorityCompletenessInput;
  taskId: string;
  camposPendentes: string[];
}) {
  const authorityName = params.authority.nome?.trim() || "Autoridade";

  return {
    tarefaId: params.taskId,
    title: "Pendencia semanal de autoridade",
    message: `Ainda faltam dados minimos em ${authorityName}: ${params.camposPendentes.join(", ")}.`,
    autoridadeNome: authorityName,
    camposPendentes: params.camposPendentes,
  };
}

function buildReassignmentNotificationPayload(params: {
  authority: AuthorityCompletenessInput;
  taskId: string;
  camposPendentes: string[];
  atribuidoPor: string;
}) {
  const authorityName = params.authority.nome?.trim() || "Autoridade";

  return {
    tarefaId: params.taskId,
    title: "Pendencia de autoridade atribuida",
    message: `${authorityName} agora esta com voce para completar: ${params.camposPendentes.join(", ")}.`,
    autoridadeNome: authorityName,
    camposPendentes: params.camposPendentes,
    atribuidoPor: params.atribuidoPor,
  };
}

async function notifyAuthorityPendingCreated(params: {
  tenantId: string;
  userId: string;
  authority: AuthorityCompletenessInput;
  juizId: string;
  taskId: string;
  camposPendentes: string[];
}) {
  await NotificationService.publishNotification({
    type: "autoridade.profile_pending",
    tenantId: params.tenantId,
    userId: params.userId,
    payload: buildCreationNotificationPayload(params),
    urgency: "MEDIUM",
    channels: ["REALTIME"],
  });
}

async function notifyAuthorityPendingReminder(params: {
  tenantId: string;
  userId: string;
  authority: AuthorityCompletenessInput;
  taskId: string;
  camposPendentes: string[];
}) {
  await NotificationService.publishNotification({
    type: "autoridade.profile_pending_reminder",
    tenantId: params.tenantId,
    userId: params.userId,
    payload: buildReminderNotificationPayload(params),
    urgency: "MEDIUM",
    channels: ["REALTIME"],
  });
}

async function notifyAuthorityPendingReassigned(params: {
  tenantId: string;
  userId: string;
  authority: AuthorityCompletenessInput;
  taskId: string;
  camposPendentes: string[];
  atribuidoPor: string;
}) {
  await NotificationService.publishNotification({
    type: "autoridade.profile_pending_reassigned",
    tenantId: params.tenantId,
    userId: params.userId,
    payload: buildReassignmentNotificationPayload(params),
    urgency: "MEDIUM",
    channels: ["REALTIME"],
  });
}

function parseAuthorityOverlayCore(raw: string | null): AuthorityOverlayCore {
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    const overlay: AuthorityOverlayCore = {};

    if (typeof parsed.nome === "string") overlay.nome = parsed.nome;
    if (
      parsed.tipoAutoridade === JuizTipoAutoridade.JUIZ ||
      parsed.tipoAutoridade === JuizTipoAutoridade.PROMOTOR
    ) {
      overlay.tipoAutoridade = parsed.tipoAutoridade;
    }
    if (typeof parsed.vara === "string" || parsed.vara === null) {
      overlay.vara = parsed.vara as string | null;
    }
    if (typeof parsed.comarca === "string" || parsed.comarca === null) {
      overlay.comarca = parsed.comarca as string | null;
    }
    if (typeof parsed.cidade === "string" || parsed.cidade === null) {
      overlay.cidade = parsed.cidade as string | null;
    }
    if (typeof parsed.estado === "string" || parsed.estado === null) {
      overlay.estado = parsed.estado as string | null;
    }
    if (typeof parsed.tribunalId === "string" || parsed.tribunalId === null) {
      overlay.tribunalId = parsed.tribunalId as string | null;
    }

    return overlay;
  } catch {
    return {};
  }
}

async function findOpenAuthorityPendingTask(
  tenantId: string,
  juizId: string,
  db: DbClient = prisma,
) {
  return db.tarefa.findFirst({
    where: {
      tenantId,
      juizId,
      titulo: AUTHORITY_PENDING_TASK_TITLE,
      status: {
        in: OPEN_TASK_STATUSES,
      },
      deletedAt: null,
    },
    orderBy: {
      updatedAt: "desc",
    },
    select: {
      id: true,
      juizId: true,
      descricao: true,
      responsavelId: true,
      lembreteEm: true,
      responsavel: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
    },
  });
}

export async function getAuthorityPendingTaskMap(
  tenantId: string,
  juizIds: string[],
  db: DbClient = prisma,
) {
  const uniqueIds = Array.from(new Set(juizIds.filter(Boolean)));

  if (uniqueIds.length === 0) {
    return new Map<string, AuthorityPendingTaskRecord>();
  }

  const tasks = await db.tarefa.findMany({
    where: {
      tenantId,
      juizId: {
        in: uniqueIds,
      },
      titulo: AUTHORITY_PENDING_TASK_TITLE,
      status: {
        in: OPEN_TASK_STATUSES,
      },
      deletedAt: null,
    },
    orderBy: {
      updatedAt: "desc",
    },
    select: {
      id: true,
      juizId: true,
      descricao: true,
      responsavelId: true,
      lembreteEm: true,
      responsavel: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
    },
  });

  const taskMap = new Map<string, AuthorityPendingTaskRecord>();

  tasks.forEach((task) => {
    if (!task.juizId || taskMap.has(task.juizId)) {
      return;
    }

    taskMap.set(task.juizId, task);
  });

  return taskMap;
}

async function resolvePreferredResponsibleUser(
  params: {
    tenantId: string;
    juizId: string;
    preferredResponsavelId?: string | null;
  },
  db: DbClient = prisma,
) {
  if (params.preferredResponsavelId) {
    const preferred = await db.usuario.findFirst({
      where: {
        id: params.preferredResponsavelId,
        tenantId: params.tenantId,
        active: true,
        role: {
          not: UserRole.CLIENTE,
        },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
      },
    });

    if (preferred) {
      return buildResponsibleSummary(preferred);
    }
  }

  const firstContributor = await db.autoridadeContribuicao.findFirst({
    where: {
      tenantId: params.tenantId,
      juizId: params.juizId,
    },
    orderBy: {
      criadoEm: "asc",
    },
    select: {
      criadoPorId: true,
    },
  });

  if (firstContributor?.criadoPorId) {
    const contributorUser = await db.usuario.findFirst({
      where: {
        id: firstContributor.criadoPorId,
        tenantId: params.tenantId,
        active: true,
        role: {
          not: UserRole.CLIENTE,
        },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
      },
    });

    if (contributorUser) {
      return buildResponsibleSummary(contributorUser);
    }
  }

  const admin = await db.usuario.findFirst({
    where: {
      tenantId: params.tenantId,
      active: true,
      role: UserRole.ADMIN,
    },
    orderBy: {
      createdAt: "asc",
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
    },
  });

  if (admin) {
    return buildResponsibleSummary(admin);
  }

  const anyOfficeUser = await db.usuario.findFirst({
    where: {
      tenantId: params.tenantId,
      active: true,
      role: {
        not: UserRole.CLIENTE,
      },
    },
    orderBy: {
      createdAt: "asc",
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
    },
  });

  return anyOfficeUser ? buildResponsibleSummary(anyOfficeUser) : null;
}

function toTaskResponsibleSummary(
  task: Pick<AuthorityPendingTaskRecord, "responsavel">,
) {
  if (!task.responsavel) {
    return null;
  }

  return buildResponsibleSummary(task.responsavel);
}

export async function syncAuthorityPendingTaskForAuthority(
  params: {
    tenantId: string;
    juizId: string;
    authority: AuthorityCoreRecord;
    createdById?: string | null;
    preferredResponsavelId?: string | null;
    sendReminderIfDue?: boolean;
  },
  db: DbClient = prisma,
): Promise<AuthorityPendingSyncResult> {
  const now = new Date();
  const camposPendentes = getAuthorityPendingFieldLabels(params.authority);
  const existingTask = await findOpenAuthorityPendingTask(
    params.tenantId,
    params.juizId,
    db,
  );

  if (camposPendentes.length === 0) {
    if (existingTask) {
      await db.tarefa.updateMany({
        where: {
          tenantId: params.tenantId,
          juizId: params.juizId,
          titulo: AUTHORITY_PENDING_TASK_TITLE,
          status: {
            in: OPEN_TASK_STATUSES,
          },
          deletedAt: null,
        },
        data: {
          status: TarefaStatus.CONCLUIDA,
          completedAt: now,
          lembreteEm: null,
        },
      });

      return {
        metadata: buildAuthorityPendingMetadata(params.authority),
        action: "completed",
      };
    }

    return {
      metadata: buildAuthorityPendingMetadata(params.authority),
      action: "none",
    };
  }

  const descricao = buildAuthorityPendingTaskDescription(
    params.authority,
    camposPendentes,
  );

  if (existingTask) {
    const updateData: Prisma.TarefaUpdateInput = {};
    let action: AuthorityPendingSyncResult["action"] = "updated";

    if (existingTask.descricao !== descricao) {
      updateData.descricao = descricao;
    }

    let responsibleSummary = toTaskResponsibleSummary(existingTask);
    let effectiveResponsavelId = existingTask.responsavelId;

    if (effectiveResponsavelId) {
      const currentResponsible = await db.usuario.findFirst({
        where: {
          id: effectiveResponsavelId,
          tenantId: params.tenantId,
          active: true,
          role: {
            not: UserRole.CLIENTE,
          },
        },
        select: {
          id: true,
        },
      });

      if (!currentResponsible) {
        effectiveResponsavelId = null;
      }
    }

    if (!effectiveResponsavelId) {
      const fallbackResponsible = await resolvePreferredResponsibleUser(
        {
          tenantId: params.tenantId,
          juizId: params.juizId,
          preferredResponsavelId: params.preferredResponsavelId,
        },
        db,
      );

      if (fallbackResponsible) {
        updateData.responsavel = {
          connect: {
            id: fallbackResponsible.id,
          },
        };
        effectiveResponsavelId = fallbackResponsible.id;
        responsibleSummary = fallbackResponsible;
      }
    }

    if (!existingTask.lembreteEm) {
      updateData.lembreteEm = addDays(now, REMINDER_INTERVAL_DAYS);
    }

    let taskId = existingTask.id;

    if (Object.keys(updateData).length > 0) {
      const updatedTask = await db.tarefa.update({
        where: { id: existingTask.id },
        data: updateData,
        select: {
          id: true,
          responsavel: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      taskId = updatedTask.id;
      if (updatedTask.responsavel) {
        responsibleSummary = buildResponsibleSummary(updatedTask.responsavel);
      }
    }

    if (
      params.sendReminderIfDue &&
      existingTask.lembreteEm &&
      existingTask.lembreteEm.getTime() <= now.getTime() &&
      effectiveResponsavelId
    ) {
      await notifyAuthorityPendingReminder({
        tenantId: params.tenantId,
        userId: effectiveResponsavelId,
        authority: params.authority,
        taskId,
        camposPendentes,
      });

      await db.tarefa.update({
        where: {
          id: taskId,
        },
        data: {
          lembreteEm: addDays(now, REMINDER_INTERVAL_DAYS),
        },
      });

      action = "reminded";
    }

    return {
      metadata: buildAuthorityPendingMetadata(params.authority, {
        id: taskId,
        responsavel: responsibleSummary,
      }),
      action,
    };
  }

  const responsible = await resolvePreferredResponsibleUser(
    {
      tenantId: params.tenantId,
      juizId: params.juizId,
      preferredResponsavelId: params.preferredResponsavelId,
    },
    db,
  );

  const createdTask = await db.tarefa.create({
    data: {
      tenantId: params.tenantId,
      titulo: AUTHORITY_PENDING_TASK_TITLE,
      descricao,
      prioridade: TarefaPrioridade.MEDIA,
      status: TarefaStatus.PENDENTE,
      juizId: params.juizId,
      criadoPorId: params.createdById ?? responsible?.id ?? null,
      responsavelId: responsible?.id ?? null,
      lembreteEm: addDays(now, REMINDER_INTERVAL_DAYS),
    },
    select: {
      id: true,
    },
  });

  if (responsible) {
    await notifyAuthorityPendingCreated({
      tenantId: params.tenantId,
      userId: responsible.id,
      authority: params.authority,
      juizId: params.juizId,
      taskId: createdTask.id,
      camposPendentes,
    });
  }

  return {
    metadata: buildAuthorityPendingMetadata(params.authority, {
      id: createdTask.id,
      responsavel: responsible,
    }),
    action: "created",
  };
}

export async function reassignAuthorityPendingTask(
  params: {
    tenantId: string;
    juizId: string;
    responsavelId: string;
    atribuidoPorId?: string | null;
    atribuidoPorNome?: string | null;
    authority: AuthorityCoreRecord;
  },
  db: DbClient = prisma,
): Promise<AuthorityPendingMetadata> {
  const task = await findOpenAuthorityPendingTask(params.tenantId, params.juizId, db);

  if (!task) {
    throw new Error("Pendencia de cadastro nao encontrada para esta autoridade.");
  }

  const responsible = await db.usuario.findFirst({
    where: {
      id: params.responsavelId,
      tenantId: params.tenantId,
      active: true,
      role: {
        not: UserRole.CLIENTE,
      },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
    },
  });

  if (!responsible) {
    throw new Error("Responsavel informado nao pertence ao escritorio.");
  }

  const responsibleSummary = buildResponsibleSummary(responsible);
  const camposPendentes = getAuthorityPendingFieldLabels(params.authority);

  await db.tarefa.update({
    where: {
      id: task.id,
    },
    data: {
      responsavelId: responsible.id,
      lembreteEm: addDays(new Date(), REMINDER_INTERVAL_DAYS),
    },
  });

  await notifyAuthorityPendingReassigned({
    tenantId: params.tenantId,
    userId: responsible.id,
    authority: params.authority,
    taskId: task.id,
    camposPendentes,
    atribuidoPor:
      params.atribuidoPorNome?.trim() || "Responsavel do escritorio",
  });

  return buildAuthorityPendingMetadata(params.authority, {
    id: task.id,
    responsavel: responsibleSummary,
  });
}

async function loadTenantAuthorityCore(
  tenantId: string,
  juizId: string,
  db: DbClient = prisma,
): Promise<AuthorityCoreRecord | null> {
  const judge = await db.juiz.findUnique({
    where: {
      id: juizId,
    },
    select: {
      id: true,
      nome: true,
      tipoAutoridade: true,
      vara: true,
      comarca: true,
      cidade: true,
      estado: true,
      tribunalId: true,
    },
  });

  if (!judge) {
    return null;
  }

  const tenantProfile = await db.acessoJuiz.findFirst({
    where: {
      tenantId,
      juizId,
      tipoAcesso: "TENANT_PROFILE",
    },
    orderBy: {
      dataAcesso: "desc",
    },
    select: {
      observacoes: true,
    },
  });

  const overlay = parseAuthorityOverlayCore(tenantProfile?.observacoes ?? null);

  return {
    nome: overlay.nome?.trim() || judge.nome,
    tipoAutoridade: overlay.tipoAutoridade ?? judge.tipoAutoridade,
    vara: overlay.vara !== undefined ? overlay.vara : judge.vara,
    comarca: overlay.comarca !== undefined ? overlay.comarca : judge.comarca,
    cidade: overlay.cidade !== undefined ? overlay.cidade : judge.cidade,
    estado: overlay.estado !== undefined ? overlay.estado : judge.estado,
    tribunalId:
      overlay.tribunalId !== undefined ? overlay.tribunalId : judge.tribunalId,
  };
}

async function collectTenantAuthorityIds(
  tenantId: string,
  db: DbClient = prisma,
) {
  const now = new Date();

  const [acessos, processos, julgamentos, analises, favoritos, unlocks, tarefas] =
    await Promise.all([
      db.acessoJuiz.findMany({
        where: {
          tenantId,
          tipoAcesso: {
            in: ["TENANT_ACCESS", "TENANT_PROFILE"],
          },
        },
        select: {
          juizId: true,
        },
      }),
      db.processo.findMany({
        where: {
          tenantId,
          deletedAt: null,
          juizId: {
            not: null,
          },
        },
        distinct: ["juizId"],
        select: {
          juizId: true,
        },
      }),
      db.julgamento.findMany({
        where: {
          tenantId,
        },
        distinct: ["juizId"],
        select: {
          juizId: true,
        },
      }),
      db.analiseJuiz.findMany({
        where: {
          tenantId,
        },
        distinct: ["juizId"],
        select: {
          juizId: true,
        },
      }),
      db.favoritoJuiz.findMany({
        where: {
          tenantId,
          ativo: true,
        },
        distinct: ["juizId"],
        select: {
          juizId: true,
        },
      }),
      db.autoridadeTenantUnlock.findMany({
        where: {
          tenantId,
          status: AutoridadeStatusUnlock.ATIVO,
          OR: [{ dataFim: null }, { dataFim: { gt: now } }],
        },
        distinct: ["juizId"],
        select: {
          juizId: true,
        },
      }),
      db.tarefa.findMany({
        where: {
          tenantId,
          juizId: {
            not: null,
          },
          titulo: AUTHORITY_PENDING_TASK_TITLE,
          deletedAt: null,
        },
        distinct: ["juizId"],
        select: {
          juizId: true,
        },
      }),
    ]);

  return Array.from(
    new Set(
      [
        ...acessos.map((item) => item.juizId),
        ...processos.map((item) => item.juizId),
        ...julgamentos.map((item) => item.juizId),
        ...analises.map((item) => item.juizId),
        ...favoritos.map((item) => item.juizId),
        ...unlocks.map((item) => item.juizId),
        ...tarefas.map((item) => item.juizId),
      ].filter((value): value is string => Boolean(value)),
    ),
  );
}

export async function reconcileAuthorityPendingTasksForTenant(
  tenantId: string,
  db: DbClient = prisma,
) {
  const judgeIds = await collectTenantAuthorityIds(tenantId, db);

  const summary = {
    tenantId,
    checked: 0,
    created: 0,
    updated: 0,
    completed: 0,
    reminded: 0,
  };

  for (const juizId of judgeIds) {
    const authority = await loadTenantAuthorityCore(tenantId, juizId, db);

    if (!authority) {
      continue;
    }

    summary.checked += 1;

    const result = await syncAuthorityPendingTaskForAuthority(
      {
        tenantId,
        juizId,
        authority,
        sendReminderIfDue: true,
      },
      db,
    );

    if (result.action === "created") summary.created += 1;
    if (result.action === "updated") summary.updated += 1;
    if (result.action === "completed") summary.completed += 1;
    if (result.action === "reminded") summary.reminded += 1;
  }

  return summary;
}

export async function runAuthorityPendingTaskSweep(db: DbClient = prisma) {
  const tenants = await db.tenant.findMany({
    where: {
      status: TenantStatus.ACTIVE,
    },
    select: {
      id: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  const summary = {
    tenants: tenants.length,
    checked: 0,
    created: 0,
    updated: 0,
    completed: 0,
    reminded: 0,
  };

  for (const tenant of tenants) {
    try {
      const tenantSummary = await reconcileAuthorityPendingTasksForTenant(
        tenant.id,
        db,
      );

      summary.checked += tenantSummary.checked;
      summary.created += tenantSummary.created;
      summary.updated += tenantSummary.updated;
      summary.completed += tenantSummary.completed;
      summary.reminded += tenantSummary.reminded;
    } catch (error) {
      logger.error(
        "[AuthorityPendingSweep] Falha ao reconciliar pendencias de autoridades",
        {
          error,
          tenantId: tenant.id,
        },
      );
    }
  }

  return summary;
}
