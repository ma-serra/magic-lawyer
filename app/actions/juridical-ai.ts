"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/app/lib/auth";
import {
  getCurrentUsagePeriodKey,
  getEntitlementForPlan,
  getTenantAiEntitlement,
  getTenantAiUsageSummary,
  isQuotaExceeded,
} from "@/app/lib/juridical-ai/entitlements";
import { enrichCitationChecksWithExternalVerification } from "@/app/lib/juridical-ai/citation-verifier";
import {
  isOpenAiProviderConfigured,
  runLocalJuridicalAiEngine,
} from "@/app/lib/juridical-ai/engine";
import { getPublishedPromptForTask, ensureDefaultAiPrompts } from "@/app/lib/juridical-ai/prompts";
import {
  buildTenantMagicAiCommercialOffer,
  getRolloutDefaultTasks,
  mergeTenantMagicAiRolloutIntoSettings,
  resolveTenantMagicAiRollout,
  type JuridicalAiRolloutMetrics,
  type JuridicalAiTenantRolloutDraft,
} from "@/app/lib/juridical-ai/rollout";
import type {
  JuridicalAiAdminDashboard,
  JuridicalAiAnalysisResult,
  JuridicalAiCaseMemoryView,
  JuridicalAiCitationCheck,
  JuridicalAiDraftDetail,
  JuridicalAiDraftResult,
  JuridicalAiGenericResult,
  JuridicalAiResearchPlan,
  JuridicalAiSentenceCalculationResult,
  JuridicalAiSourceLead,
  JuridicalAiTaskKey,
  JuridicalAiTier,
  JuridicalAiWorkspaceBootstrap,
} from "@/app/lib/juridical-ai/types";
import prisma, { toNumber } from "@/app/lib/prisma";
import { logOperationalEvent } from "@/app/lib/audit/operational-events";
import { PeticaoStatus, type Prisma } from "@/generated/prisma";
import { UploadService } from "@/lib/upload-service";

type ActionResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

type TenantAiAuthContext = {
  tenantId: string;
  userId: string;
  role: string;
  userName: string;
};

type SuperAdminAiAuthContext = {
  userId: string;
  role: "SUPER_ADMIN";
  userName: string;
};

type AiActorContext =
  | ({ scope: "tenant" } & TenantAiAuthContext)
  | ({ scope: "admin" } & SuperAdminAiAuthContext);

type DraftInput = {
  action: string;
  title?: string | null;
  pieceType?: string | null;
  processId?: string | null;
  documentId?: string | null;
  modelId?: string | null;
  objective?: string | null;
  thesis?: string | null;
  strategy?: string | null;
  facts?: string | null;
  notes?: string | null;
  returnTo?: string | null;
};

type AnalysisInput = {
  action: string;
  processId?: string | null;
  documentId?: string | null;
  documentName?: string | null;
  documentText?: string | null;
  objective?: string | null;
  notes?: string | null;
  returnTo?: string | null;
};

type GenericInput = {
  action: string;
  taskKey: JuridicalAiTaskKey;
  processId?: string | null;
  documentId?: string | null;
  documentName?: string | null;
  documentText?: string | null;
  question?: string | null;
  objective?: string | null;
  notes?: string | null;
  returnTo?: string | null;
};

type PromptInput = {
  ownerKey?: string | null;
  scope: "tenant" | "admin";
  taskKey: JuridicalAiTaskKey;
  title: string;
  systemPrompt: string;
  instructionPrompt: string;
};

type RolloutInput = {
  tenantId: string;
  stage: "DISABLED" | "PILOT" | "CONTROLLED" | "RELEASED";
  workspaceEnabled: boolean;
  tierOverride?: JuridicalAiTier | null;
  enabledTasks?: JuridicalAiTaskKey[] | null;
  notes?: string | null;
  owner?: string | null;
  nextReviewAt?: string | null;
};

function toJsonValue(value?: Record<string, unknown> | null) {
  if (!value) {
    return undefined;
  }

  return value as Prisma.InputJsonValue;
}

function toPlainTextExcerpt(markdown: string, maxLength = 320) {
  const plainText = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_`~-]/g, " ")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

  if (plainText.length <= maxLength) {
    return plainText;
  }

  return `${plainText.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function toSafeDocumentBaseName(value?: string | null) {
  return (value?.trim() || "documento-magic-ai")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function requireTenantAiAuth(): Promise<TenantAiAuthContext> {
  const session = await getSession();

  if (!session?.user?.id || !session.user.tenantId) {
    throw new Error("Sessao invalida para IA juridica.");
  }

  const role = session.user.role ?? "USER";
  const allowedRoles = new Set(["ADMIN", "ADVOGADO", "SECRETARIA", "FINANCEIRO"]);

  if (!allowedRoles.has(role)) {
    throw new Error("Seu perfil atual nao pode usar o assistente juridico.");
  }

  const userName =
    `${session.user.name ?? ""}`.trim() ||
    `${(session.user as { email?: string }).email ?? ""}`.trim() ||
    "Usuario";

  return {
    tenantId: session.user.tenantId,
    userId: session.user.id,
    role,
    userName,
  };
}

async function requireSuperAdminAiAuth(): Promise<SuperAdminAiAuthContext> {
  const session = await getSession();

  if (!session?.user?.id || session.user.role !== "SUPER_ADMIN") {
    throw new Error("Acesso restrito ao super admin.");
  }

  return {
    userId: session.user.id,
    role: "SUPER_ADMIN",
    userName: session.user.name ?? "Super admin",
  };
}

async function requireAiActorContext(
  scope: "tenant" | "admin",
): Promise<AiActorContext> {
  if (scope === "admin") {
    const auth = await requireSuperAdminAiAuth();
    return { ...auth, scope };
  }

  const auth = await requireTenantAiAuth();
  return { ...auth, scope };
}

async function getTenantMagicAiRolloutMetrics(
  tenantId: string,
): Promise<JuridicalAiRolloutMetrics> {
  const [processCount, documentCount, executionCount, draftCount, exportCount] =
    await Promise.all([
      prisma.processo.count({
        where: {
          tenantId,
          deletedAt: null,
        },
      }),
      prisma.documento.count({
        where: {
          tenantId,
          deletedAt: null,
        },
      }),
      prisma.aiExecutionLog.count({
        where: {
          tenantId,
        },
      }),
      prisma.aiDraftDocument.count({
        where: {
          tenantId,
        },
      }),
      prisma.operationalAuditEvent.count({
        where: {
          tenantId,
          source: "MAGIC_AI",
          action: {
            in: [
              "AI_DRAFT_EXPORTED_TO_DOCUMENTO",
              "AI_DRAFT_EXPORTED_TO_MODELO",
              "AI_DRAFT_EXPORTED_TO_PETICAO",
            ],
          },
        },
      }),
    ]);

  return {
    processCount,
    documentCount,
    executionCount,
    draftCount,
    exportCount,
  };
}

async function resolveTenantAiRuntimeContext(params: {
  tenantId: string;
  includeMetrics?: boolean;
}) {
  const [tenant, entitlement, metrics] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: params.tenantId },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        subscription: {
          select: {
            metadata: true,
          },
        },
      },
    }),
    getTenantAiEntitlement(params.tenantId),
    params.includeMetrics
      ? getTenantMagicAiRolloutMetrics(params.tenantId)
      : Promise.resolve<JuridicalAiRolloutMetrics>({
          processCount: 0,
          documentCount: 0,
          executionCount: 0,
          draftCount: 0,
          exportCount: 0,
        }),
  ]);

  if (!tenant) {
    throw new Error("Tenant nao encontrado para a operacao da IA.");
  }

  const rolloutState = resolveTenantMagicAiRollout({
    settings: tenant.subscription?.metadata ?? null,
    entitlement,
    metrics,
  });

  return {
    tenant,
    metrics,
    entitlement: rolloutState.entitlement,
    rollout: rolloutState.rollout,
    commercialOffer: buildTenantMagicAiCommercialOffer({
      entitlement: rolloutState.entitlement,
      rollout: rolloutState.rollout,
    }),
  };
}

function assertTaskEnabled(
  taskKey: JuridicalAiTaskKey,
  rollout: Awaited<ReturnType<typeof resolveTenantAiRuntimeContext>>["rollout"],
) {
  if (!rollout.workspaceEnabled) {
    throw new Error("A IA juridica ainda nao foi liberada para este escritorio.");
  }

  const taskAccess = rollout.taskAccess.find((item) => item.taskKey === taskKey);
  if (!taskAccess?.enabled) {
    throw new Error(taskAccess?.reason ?? "Esta tarefa ainda nao foi liberada no rollout.");
  }
}

async function fetchProcessSnapshot(tenantId: string, processId?: string | null) {
  if (!processId) {
    return null;
  }

  const processo = await prisma.processo.findFirst({
    where: {
      id: processId,
      tenantId,
      deletedAt: null,
    },
    select: {
      id: true,
      numero: true,
      numeroCnj: true,
      titulo: true,
      descricao: true,
      fase: true,
      status: true,
      rito: true,
      prazoPrincipal: true,
      area: {
        select: {
          nome: true,
        },
      },
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
      causasVinculadas: {
        take: 3,
        orderBy: [{ principal: "desc" }, { createdAt: "asc" }],
        select: {
          principal: true,
          causa: {
            select: {
              nome: true,
              codigoCnj: true,
              isOficial: true,
            },
          },
        },
      },
      documentos: {
        where: {
          deletedAt: null,
        },
        take: 3,
        orderBy: {
          createdAt: "desc",
        },
        select: {
          id: true,
          nome: true,
          tipo: true,
        },
      },
      _count: {
        select: {
          documentos: true,
          movimentacoes: true,
        },
      },
    },
  });

  if (!processo) {
    return null;
  }

  return {
    id: processo.id,
    numero: processo.numero,
    numeroCnj: processo.numeroCnj,
    titulo: processo.titulo,
    descricao: processo.descricao,
    fase: processo.fase,
    status: processo.status,
    area: processo.area?.nome ?? null,
    cliente: processo.cliente.nome,
    tribunal: processo.tribunal?.sigla ?? processo.tribunal?.nome ?? null,
    rito: processo.rito,
    prazoPrincipal: processo.prazoPrincipal?.toISOString() ?? null,
    documentosCount: processo._count.documentos,
    movimentacoesCount: processo._count.movimentacoes,
    causas: processo.causasVinculadas.map((item) => ({
      nome: item.causa.nome,
      codigoCnj: item.causa.codigoCnj ?? null,
      isOficial: item.causa.isOficial,
      principal: item.principal,
    })),
    documentos: processo.documentos.map((item) => ({
      id: item.id,
      nome: item.nome,
      tipo: item.tipo ?? null,
    })),
  };
}

async function fetchProcessCaseMemorySnapshot(
  tenantId: string,
  processId?: string | null,
) {
  if (!processId) {
    return null;
  }

  const memory = await prisma.aiCaseMemory.findUnique({
    where: {
      tenantId_scopeType_scopeId: {
        tenantId,
        scopeType: "PROCESSO",
        scopeId: processId,
      },
    },
    select: {
      title: true,
      summary: true,
    },
  });

  if (!memory) {
    return null;
  }

  return {
    title: memory.title,
    summary: memory.summary ?? null,
  };
}

async function fetchDocumentSnapshot(tenantId: string, documentId?: string | null) {
  if (!documentId) {
    return null;
  }

  return prisma.documento.findFirst({
    where: {
      id: documentId,
      tenantId,
      deletedAt: null,
    },
    select: {
      id: true,
      nome: true,
      tipo: true,
      descricao: true,
      createdAt: true,
    },
  });
}

async function fetchModelSnapshot(tenantId: string, modelId?: string | null) {
  if (!modelId) {
    return null;
  }

  return prisma.modeloPeticao.findFirst({
    where: {
      id: modelId,
      tenantId,
      deletedAt: null,
      ativo: true,
    },
    select: {
      id: true,
      nome: true,
      conteudo: true,
      categoria: true,
      tipo: true,
    },
  });
}

function serializeCaseMemory(
  memory: {
    id: string;
    scopeType: string;
    scopeId: string;
    title: string;
    summary: string | null;
    memory: Prisma.JsonValue;
    updatedAt: Date;
  },
): JuridicalAiCaseMemoryView {
  return {
    id: memory.id,
    scopeType: memory.scopeType,
    scopeId: memory.scopeId,
    title: memory.title,
    summary: memory.summary ?? null,
    memory:
      memory.memory && typeof memory.memory === "object" && !Array.isArray(memory.memory)
        ? (memory.memory as Record<string, unknown>)
        : {},
    updatedAt: memory.updatedAt.toISOString(),
  };
}

async function enforceQuota(params: {
  tenantId: string;
  userId: string;
  quota: number | null;
  used: number;
  action: string;
  label: string;
}) {
  if (!isQuotaExceeded({ quota: params.quota, used: params.used })) {
    return;
  }

  await logOperationalEvent({
    tenantId: params.tenantId,
    category: "INTEGRATION",
    source: "MAGIC_AI",
    action: "AI_USAGE_BLOCKED",
    status: "WARNING",
    actorType: "USER",
    actorId: params.userId,
    entityType: "AI_QUOTA",
    entityId: params.action,
    message: `Limite mensal atingido para ${params.label}.`,
    payload: {
      quota: params.quota,
      used: params.used,
      action: params.action,
    },
  });

  throw new Error(`Limite mensal atingido para ${params.label}.`);
}

async function createSession(input: {
  tenantId: string;
  userId: string;
  role: string;
  action: string;
  title?: string | null;
  contextRoute?: string | null;
  contextLabel?: string | null;
  processId?: string | null;
  documentId?: string | null;
  inputContext?: Record<string, unknown>;
}) {
  return prisma.aiWorkspaceSession.create({
    data: {
      tenantId: input.tenantId,
      userId: input.userId,
      actorRole: input.role,
      action: input.action,
      title: input.title ?? null,
      contextRoute: input.contextRoute ?? null,
      contextLabel: input.contextLabel ?? null,
      sourceProcessoId: input.processId ?? null,
      sourceDocumentoId: input.documentId ?? null,
      inputContext: toJsonValue(input.inputContext),
      contextSnapshot: toJsonValue(input.inputContext),
    },
  });
}

async function registerUsage(input: {
  tenantId: string;
  userId: string;
  sessionId: string;
  tier: string;
  action: string;
  ledgerType:
    | "MESSAGE"
    | "DRAFT"
    | "ANALYSIS"
    | "SEARCH"
    | "CITATION_VALIDATION";
  promptVersionId?: string | null;
  estimatedCost?: number | null;
}) {
  return prisma.aiUsageLedger.create({
    data: {
      tenantId: input.tenantId,
      userId: input.userId,
      sessionId: input.sessionId,
      periodKey: getCurrentUsagePeriodKey(),
      tier: input.tier,
      action: input.action,
      ledgerType: input.ledgerType,
      units: 1,
      promptVersionId: input.promptVersionId ?? null,
      engine: isOpenAiProviderConfigured() ? "OPENAI_RESPONSES" : "LOCAL_FALLBACK",
      estimatedCost:
        typeof input.estimatedCost === "number" ? input.estimatedCost : undefined,
    },
  });
}

async function registerExecution(input: {
  tenantId: string;
  userId: string;
  sessionId: string;
  action: string;
  promptVersionId?: string | null;
  inputSummary?: string | null;
  outputSummary?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  return prisma.aiExecutionLog.create({
    data: {
      tenantId: input.tenantId,
      userId: input.userId,
      sessionId: input.sessionId,
      action: input.action,
      status: "SUCCESS",
      engine: isOpenAiProviderConfigured() ? "OPENAI_RESPONSES" : "LOCAL_FALLBACK",
      promptVersionId: input.promptVersionId ?? null,
      inputSummary: input.inputSummary ?? null,
      outputSummary: input.outputSummary ?? null,
      metadata: toJsonValue(input.metadata),
    },
  });
}

function buildVerificationMetadataSnapshot(input: {
  sourceLeads?: JuridicalAiSourceLead[] | null;
  citationChecks?: JuridicalAiCitationCheck[] | null;
  researchPlan?: JuridicalAiResearchPlan | null;
  sentenceCalculation?: JuridicalAiSentenceCalculationResult | null;
}) {
  return {
    sourceLeads: (input.sourceLeads ?? []).slice(0, 6).map((item) => ({
      label: item.label,
      sourceType: item.sourceType,
      verificationLevel: item.verificationLevel,
      detail: item.detail,
      links: (item.verificationLinks ?? []).slice(0, 3).map((link) => ({
        label: link.label,
        href: link.href,
        authority: link.authority,
        kind: link.kind,
        accessMode: link.accessMode,
      })),
    })),
    citationChecks: (input.citationChecks ?? []).slice(0, 8).map((item) => ({
      label: item.label,
      sourceType: item.sourceType,
      status: item.status,
      externalVerificationStatus: item.externalVerificationStatus ?? null,
      externalVerificationNote: item.externalVerificationNote ?? null,
      externalVerificationExcerpt: item.externalVerificationExcerpt ?? null,
      links: (item.verificationLinks ?? []).slice(0, 3).map((link) => ({
        label: link.label,
        href: link.href,
        authority: link.authority,
        kind: link.kind,
        accessMode: link.accessMode,
      })),
    })),
    researchPlan: input.researchPlan
      ? {
          objective: input.researchPlan.objective,
          targetCourts: input.researchPlan.targetCourts,
          primaryQueries: input.researchPlan.primaryQueries.slice(0, 4),
        }
      : null,
    sentenceCalculation: input.sentenceCalculation
      ? {
          outcomeSummary: input.sentenceCalculation.outcomeSummary,
          calculableItems: input.sentenceCalculation.calculableItems.slice(0, 6),
          requiredInputs: input.sentenceCalculation.requiredInputs.slice(0, 6),
          condemnedItems: input.sentenceCalculation.condemnedItems
            .slice(0, 6)
            .map((item) => ({
              label: item.label,
              nature: item.nature,
              amountMentioned: item.amountMentioned ?? null,
              correctionRule: item.correctionRule,
              interestRule: item.interestRule,
              startTrigger: item.startTrigger,
              automationStatus: item.automationStatus,
            })),
        }
      : null,
  };
}

async function upsertProcessCaseMemory(input: {
  tenantId: string;
  userId: string;
  processId?: string | null;
  title?: string | null;
  summary?: string | null;
  memory?: Record<string, unknown> | null;
}) {
  if (!input.processId) {
    return null;
  }

  return prisma.aiCaseMemory.upsert({
    where: {
      tenantId_scopeType_scopeId: {
        tenantId: input.tenantId,
        scopeType: "PROCESSO",
        scopeId: input.processId,
      },
    },
    update: {
      title: input.title ?? "Processo",
      summary: input.summary ?? null,
      memory: toJsonValue(input.memory),
      updatedById: input.userId,
    },
    create: {
      tenantId: input.tenantId,
      scopeType: "PROCESSO",
      scopeId: input.processId,
      title: input.title ?? "Processo",
      summary: input.summary ?? null,
      memory: toJsonValue(input.memory) ?? {},
      updatedById: input.userId,
    },
  });
}

export async function getJuridicalAiWorkspaceBootstrap(): Promise<
  ActionResponse<JuridicalAiWorkspaceBootstrap>
> {
  try {
    const auth = await requireTenantAiAuth();
    await ensureDefaultAiPrompts();

    const [runtime, usage, recentSessions, recentDrafts, recentMemories] = await Promise.all([
      resolveTenantAiRuntimeContext({
        tenantId: auth.tenantId,
        includeMetrics: true,
      }),
      getTenantAiUsageSummary(auth.tenantId, auth.userId),
      prisma.aiWorkspaceSession.findMany({
        where: {
          tenantId: auth.tenantId,
          userId: auth.userId,
        },
        orderBy: { updatedAt: "desc" },
        take: 8,
        select: {
          id: true,
          action: true,
          title: true,
          status: true,
          contextLabel: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.aiDraftDocument.findMany({
        where: {
          tenantId: auth.tenantId,
          userId: auth.userId,
        },
        orderBy: { createdAt: "desc" },
        take: 6,
        select: {
          id: true,
          title: true,
          draftType: true,
          status: true,
          summary: true,
          createdAt: true,
          updatedAt: true,
          session: {
            select: {
              contextLabel: true,
            },
          },
        },
      }),
      prisma.aiCaseMemory.findMany({
        where: {
          tenantId: auth.tenantId,
        },
        orderBy: { updatedAt: "desc" },
        take: 6,
        select: {
          id: true,
          scopeType: true,
          scopeId: true,
          title: true,
          summary: true,
          memory: true,
          updatedAt: true,
        },
      }),
    ]);

    return {
      success: true,
      data: {
        entitlement: runtime.entitlement,
        rollout: runtime.rollout,
        commercialOffer: runtime.commercialOffer,
        usage,
        recentSessions: recentSessions.map((item) => ({
          ...item,
          createdAt: item.createdAt.toISOString(),
          updatedAt: item.updatedAt.toISOString(),
        })),
        recentDrafts: recentDrafts.map((item) => ({
          id: item.id,
          title: item.title,
          draftType: item.draftType,
          status: item.status,
          summary: item.summary ?? null,
          contextLabel: item.session?.contextLabel ?? null,
          createdAt: item.createdAt.toISOString(),
          updatedAt: item.updatedAt.toISOString(),
        })),
        recentMemories: recentMemories.map((memory) => ({
          id: memory.id,
          scopeType: memory.scopeType,
          scopeId: memory.scopeId,
          title: memory.title,
          summary: memory.summary ?? null,
          updatedAt: memory.updatedAt.toISOString(),
        })),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Falha ao carregar workspace de IA.",
    };
  }
}

export async function getJuridicalAiCaseMemory(
  processId: string,
): Promise<ActionResponse<JuridicalAiCaseMemoryView | null>> {
  try {
    const auth = await requireTenantAiAuth();

    const memory = await prisma.aiCaseMemory.findUnique({
      where: {
        tenantId_scopeType_scopeId: {
          tenantId: auth.tenantId,
          scopeType: "PROCESSO",
          scopeId: processId,
        },
      },
      select: {
        id: true,
        scopeType: true,
        scopeId: true,
        title: true,
        summary: true,
        memory: true,
        updatedAt: true,
      },
    });

    return {
      success: true,
      data: memory ? serializeCaseMemory(memory) : null,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Nao foi possivel carregar a memoria do caso.",
    };
  }
}

export async function getJuridicalAiDraftDetail(
  draftId: string,
): Promise<ActionResponse<JuridicalAiDraftDetail>> {
  try {
    const auth = await requireTenantAiAuth();

    const draft = await prisma.aiDraftDocument.findFirst({
      where: {
        id: draftId,
        tenantId: auth.tenantId,
        userId: auth.userId,
      },
      select: {
        id: true,
        sessionId: true,
        draftType: true,
        title: true,
        strategy: true,
        status: true,
        sourceProcessoId: true,
        sourceDocumentoId: true,
        contentMarkdown: true,
        summary: true,
        citations: true,
        pendingReview: true,
        confidenceScore: true,
        createdAt: true,
        updatedAt: true,
        session: {
          select: {
            contextLabel: true,
          },
        },
      },
    });

    if (!draft) {
      throw new Error("Rascunho não encontrado para este usuário.");
    }

    const [processContext, documentSnapshot, caseMemorySnapshot] = await Promise.all([
      fetchProcessSnapshot(auth.tenantId, draft.sourceProcessoId),
      fetchDocumentSnapshot(auth.tenantId, draft.sourceDocumentoId),
      fetchProcessCaseMemorySnapshot(auth.tenantId, draft.sourceProcessoId),
    ]);

    const replayedDraft = runLocalJuridicalAiEngine({
      taskKey: "PIECE_DRAFTING",
      title: draft.title,
      strategy: draft.strategy,
      documentId: documentSnapshot?.id ?? null,
      documentName: documentSnapshot?.nome ?? null,
      processContext,
      caseMemory: caseMemorySnapshot,
    });

    const sourceLeads =
      replayedDraft.type === "piece" ? replayedDraft.sourceLeads : undefined;

    return {
      success: true,
      data: {
        sessionId: draft.sessionId,
        draftId: draft.id,
        draftType: draft.draftType,
        title: draft.title,
        strategy: draft.strategy ?? null,
        status: draft.status,
        summary: draft.summary ?? null,
        contentMarkdown: draft.contentMarkdown,
        citations: Array.isArray(draft.citations) ? (draft.citations as string[]) : [],
        pendingReview: Array.isArray(draft.pendingReview)
          ? (draft.pendingReview as string[])
          : [],
        sourceLeads,
        confidenceScore: toNumber(draft.confidenceScore),
        engine: "LOCAL_FALLBACK",
        promptVersionLabel: null,
        createdAt: draft.createdAt.toISOString(),
        updatedAt: draft.updatedAt.toISOString(),
        contextLabel: draft.session?.contextLabel ?? null,
      },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Nao foi possivel carregar o rascunho da IA.",
    };
  }
}

export async function createJuridicalAiModelFromDraft(
  draftId: string,
): Promise<ActionResponse<{ modelId: string; modelName: string }>> {
  try {
    const auth = await requireTenantAiAuth();

    const draft = await prisma.aiDraftDocument.findFirst({
      where: {
        id: draftId,
        tenantId: auth.tenantId,
        userId: auth.userId,
      },
      select: {
        id: true,
        title: true,
        draftType: true,
        summary: true,
        contentMarkdown: true,
        sourceProcessoId: true,
      },
    });

    if (!draft) {
      throw new Error("Rascunho não encontrado para criação de modelo.");
    }

    const modelName = `${draft.title} - Base AI`;

    const modelo = await prisma.modeloPeticao.create({
      data: {
        tenantId: auth.tenantId,
        nome: modelName,
        descricao:
          draft.summary ??
          "Modelo gerado a partir de rascunho auditável do Magic AI.",
        conteudo: draft.contentMarkdown,
        categoria: draft.draftType || "OUTROS",
        tipo: "GERADO_IA",
        variaveis: {
          origem: "MAGIC_AI",
          draftId: draft.id,
          sourceProcessoId: draft.sourceProcessoId,
        },
        publico: false,
        ativo: true,
      },
    });

    await logOperationalEvent({
      tenantId: auth.tenantId,
      category: "INTEGRATION",
      source: "MAGIC_AI",
      action: "AI_DRAFT_EXPORTED_TO_MODEL",
      status: "SUCCESS",
      actorType: auth.role,
      actorId: auth.userId,
      actorName: auth.userName,
      entityType: "AI_DRAFT",
      entityId: draft.id,
      route: "/modelos-peticao",
      message: `Rascunho exportado para o catálogo de modelos como ${modelName}.`,
      payload: {
        draftId: draft.id,
        modelId: modelo.id,
        modelName,
      },
    });

    revalidatePath("/magic-ai");
    revalidatePath("/modelos-peticao");

    return {
      success: true,
      data: {
        modelId: modelo.id,
        modelName,
      },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Nao foi possivel criar um modelo a partir do rascunho.",
    };
  }
}

export async function createJuridicalAiPeticaoFromDraft(
  draftId: string,
): Promise<ActionResponse<{ peticaoId: string; peticaoTitle: string }>> {
  try {
    const auth = await requireTenantAiAuth();

    const draft = await prisma.aiDraftDocument.findFirst({
      where: {
        id: draftId,
        tenantId: auth.tenantId,
        userId: auth.userId,
      },
      select: {
        id: true,
        title: true,
        draftType: true,
        summary: true,
        contentMarkdown: true,
        sourceProcessoId: true,
        sourceDocumentoId: true,
      },
    });

    if (!draft) {
      throw new Error("Rascunho não encontrado para criação da petição.");
    }

    if (!draft.sourceProcessoId) {
      throw new Error(
        "Este rascunho não está vinculado a um processo e não pode virar petição.",
      );
    }

    const processo = await prisma.processo.findFirst({
      where: {
        id: draft.sourceProcessoId,
        tenantId: auth.tenantId,
        deletedAt: null,
      },
      select: {
        id: true,
        numero: true,
        causasVinculadas: {
          take: 1,
          orderBy: [{ principal: "desc" }, { createdAt: "asc" }],
          select: {
            causaId: true,
          },
        },
      },
    });

    if (!processo) {
      throw new Error("O processo vinculado ao rascunho não está mais disponível.");
    }

    const peticaoTitle = draft.title.trim() || "Petição gerada via Magic AI";
    const peticao = await prisma.peticao.create({
      data: {
        tenantId: auth.tenantId,
        processoId: processo.id,
        causaId: processo.causasVinculadas[0]?.causaId ?? undefined,
        titulo: peticaoTitle,
        tipo: draft.draftType || "GERADO_IA",
        status: PeticaoStatus.RASCUNHO,
        descricao:
          draft.summary ??
          toPlainTextExcerpt(draft.contentMarkdown, 360) ??
          "Petição originada de rascunho auditável do Magic AI.",
        documentoId: draft.sourceDocumentoId ?? undefined,
        observacoes: [
          "Origem: Magic AI",
          `Draft ID: ${draft.id}`,
          `Processo: ${processo.numero}`,
          "",
          draft.contentMarkdown,
        ].join("\n"),
        criadoPorId: auth.userId,
      },
      select: {
        id: true,
        titulo: true,
      },
    });

    await logOperationalEvent({
      tenantId: auth.tenantId,
      category: "INTEGRATION",
      source: "MAGIC_AI",
      action: "AI_DRAFT_EXPORTED_TO_PETICAO",
      status: "SUCCESS",
      actorType: auth.role,
      actorId: auth.userId,
      actorName: auth.userName,
      entityType: "AI_DRAFT",
      entityId: draft.id,
      route: "/peticoes",
      message: `Rascunho exportado para petições como ${peticao.titulo}.`,
      payload: {
        draftId: draft.id,
        peticaoId: peticao.id,
        peticaoTitle: peticao.titulo,
        processoId: processo.id,
      },
    });

    revalidatePath("/magic-ai");
    revalidatePath("/peticoes");
    revalidatePath(`/processos/${processo.id}`);

    return {
      success: true,
      data: {
        peticaoId: peticao.id,
        peticaoTitle: peticao.titulo,
      },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Nao foi possivel criar uma petição a partir do rascunho.",
    };
  }
}

export async function createJuridicalAiDocumentFromDraft(
  draftId: string,
): Promise<ActionResponse<{ documentoId: string; documentoTitle: string }>> {
  try {
    const auth = await requireTenantAiAuth();

    const draft = await prisma.aiDraftDocument.findFirst({
      where: {
        id: draftId,
        tenantId: auth.tenantId,
        userId: auth.userId,
      },
      select: {
        id: true,
        sessionId: true,
        title: true,
        draftType: true,
        summary: true,
        contentMarkdown: true,
        sourceProcessoId: true,
      },
    });

    if (!draft) {
      throw new Error("Rascunho não encontrado para criação do documento.");
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: auth.tenantId },
      select: { slug: true },
    });

    if (!tenant?.slug) {
      throw new Error("Não foi possível resolver o tenant para registrar o documento.");
    }

    const processo = draft.sourceProcessoId
      ? await prisma.processo.findFirst({
          where: {
            id: draft.sourceProcessoId,
            tenantId: auth.tenantId,
            deletedAt: null,
          },
          select: {
            id: true,
            numero: true,
          },
        })
      : null;

    const documentoTitle = draft.title.trim() || "Documento gerado via Magic AI";
    const fileName = `${toSafeDocumentBaseName(documentoTitle)}.md`;
    const bytes = Buffer.from(draft.contentMarkdown, "utf-8");
    const uploadService = UploadService.getInstance();
    const uploadResult = await uploadService.uploadStructuredDocument(
      bytes,
      auth.userId,
      fileName,
      {
        tenantSlug: tenant.slug,
        categoria: processo ? "processo" : "outros",
        processo: processo
          ? {
              id: processo.id,
              numero: processo.numero,
            }
          : undefined,
        referencia: {
          id: draft.id,
          etiqueta: "magic-ai-draft",
        },
        subpastas: ["magic-ai"],
        fileName,
        contentType: "text/markdown",
        resourceType: "raw",
        tags: ["magic-ai", "draft", draft.id, draft.draftType || "peca"],
      },
    );

    if (!uploadResult.success || !uploadResult.publicId || !uploadResult.url) {
      throw new Error(uploadResult.error || "Falha ao enviar documento gerado pelo Magic AI.");
    }

    const uploadedUrl = uploadResult.url;
    const uploadedPublicId = uploadResult.publicId;

    const documento = await prisma.$transaction(async (tx) => {
      const createdDocumento = await tx.documento.create({
        data: {
          tenantId: auth.tenantId,
          nome: documentoTitle,
          tipo: "magic_ai",
          descricao:
            draft.summary ??
            "Documento markdown originado de rascunho auditável do Magic AI.",
          url: uploadedUrl,
          tamanhoBytes: bytes.length,
          contentType: "text/markdown",
          processoId: processo?.id ?? null,
          uploadedById: auth.userId,
          origem: "ESCRITORIO",
          visivelParaCliente: false,
          visivelParaEquipe: true,
          metadados: {
            origem: "MAGIC_AI",
            aiDraftId: draft.id,
            aiSessionId: draft.sessionId,
            folderPath: uploadResult.folderPath ?? null,
            fileName,
            draftType: draft.draftType || null,
          },
        },
      });

      await tx.documentoVersao.create({
        data: {
          tenantId: auth.tenantId,
          documentoId: createdDocumento.id,
          numeroVersao: 1,
          cloudinaryPublicId: uploadedPublicId,
          url: uploadedUrl,
          uploadedById: auth.userId,
        },
      });

      if (processo?.id) {
        await tx.processoDocumento.create({
          data: {
            tenantId: auth.tenantId,
            processoId: processo.id,
            documentoId: createdDocumento.id,
            createdById: auth.userId,
            visivelParaCliente: false,
          },
        });
      }

      return createdDocumento;
    });

    await logOperationalEvent({
      tenantId: auth.tenantId,
      category: "INTEGRATION",
      source: "MAGIC_AI",
      action: "AI_DRAFT_EXPORTED_TO_DOCUMENTO",
      status: "SUCCESS",
      actorType: auth.role,
      actorId: auth.userId,
      actorName: auth.userName,
      entityType: "AI_DRAFT",
      entityId: draft.id,
      route: "/documentos",
      message: `Rascunho exportado para documentos como ${documentoTitle}.`,
      payload: {
        draftId: draft.id,
        documentoId: documento.id,
        documentoTitle,
        processoId: processo?.id ?? null,
      },
    });

    revalidatePath("/magic-ai");
    revalidatePath("/documentos");
    if (processo?.id) {
      revalidatePath(`/processos/${processo.id}`);
    }

    return {
      success: true,
      data: {
        documentoId: documento.id,
        documentoTitle,
      },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Nao foi possivel criar um documento a partir do rascunho.",
    };
  }
}

export async function trackJuridicalAiInteraction(input: {
  scope: "tenant" | "admin";
  interaction: "FAB_OPENED" | "DOCK_ACTION_CLICKED" | "WORKSPACE_OPENED";
  actionId?: string | null;
  route?: string | null;
  tab?: string | null;
  processId?: string | null;
}) {
  try {
    const actor = await requireAiActorContext(input.scope);

    await logOperationalEvent({
      tenantId: actor.scope === "tenant" ? actor.tenantId : null,
      category: "INTEGRATION",
      source: "MAGIC_AI",
      action: input.interaction,
      status: "INFO",
      actorType: actor.role,
      actorId: actor.userId,
      actorName: actor.userName,
      entityType: input.actionId ? "AI_ACTION" : "AI_WORKSPACE",
      entityId: input.actionId ?? input.tab ?? actor.scope,
      route: input.route ?? null,
      message:
        input.interaction === "WORKSPACE_OPENED"
          ? "Workspace da IA jurídica aberto."
          : input.interaction === "DOCK_ACTION_CLICKED"
            ? `Ação ${input.actionId ?? "desconhecida"} disparada pelo dock.`
            : "FAB do assistente jurídico aberto.",
      payload: {
        scope: input.scope,
        actionId: input.actionId ?? null,
        tab: input.tab ?? null,
        processId: input.processId ?? null,
      },
    });

    return { success: true as const };
  } catch (error) {
    return {
      success: false as const,
      error:
        error instanceof Error
          ? error.message
          : "Nao foi possivel rastrear a interacao da IA.",
    };
  }
}

export async function executeJuridicalAiPieceDraft(
  input: DraftInput,
): Promise<ActionResponse<JuridicalAiDraftResult>> {
  try {
    const auth = await requireTenantAiAuth();
    const [runtime, usage] = await Promise.all([
      resolveTenantAiRuntimeContext({
        tenantId: auth.tenantId,
      }),
      getTenantAiUsageSummary(auth.tenantId, auth.userId),
    ]);
    const entitlement = runtime.entitlement;

    if (!entitlement.isEnabled) {
      throw new Error("Seu plano ainda nao habilita a IA juridica.");
    }

    assertTaskEnabled("PIECE_DRAFTING", runtime.rollout);

    await enforceQuota({
      tenantId: auth.tenantId,
      userId: auth.userId,
      quota: entitlement.quotas.draftsPerMonth,
      used: usage.draftsUsed,
      action: input.action,
      label: "geracao de pecas",
    });

    const promptVersion = await getPublishedPromptForTask({
      taskKey: "PIECE_DRAFTING",
      scope: "tenant",
      tenantId: auth.tenantId,
    });

    const [processContext, modelSnapshot, documentSnapshot, caseMemorySnapshot] =
      await Promise.all([
        fetchProcessSnapshot(auth.tenantId, input.processId),
        fetchModelSnapshot(auth.tenantId, input.modelId),
        fetchDocumentSnapshot(auth.tenantId, input.documentId),
        fetchProcessCaseMemorySnapshot(auth.tenantId, input.processId),
      ]);

    const session = await createSession({
      tenantId: auth.tenantId,
      userId: auth.userId,
      role: auth.role,
      action: input.action,
      title: input.title ?? input.pieceType ?? "Nova peca juridica",
      contextRoute: input.returnTo ?? "/magic-ai",
      contextLabel: processContext?.titulo ?? processContext?.numero ?? "Workspace IA",
      processId: input.processId,
      documentId: input.documentId,
      inputContext: {
        pieceType: input.pieceType,
        objective: input.objective,
        thesis: input.thesis,
        strategy: input.strategy,
        facts: input.facts,
        notes: input.notes,
        documentName: documentSnapshot?.nome ?? null,
        modelName: modelSnapshot?.nome ?? null,
      },
    });

    const result = runLocalJuridicalAiEngine({
      taskKey: "PIECE_DRAFTING",
      title: input.title,
      pieceType: input.pieceType,
      objective: input.objective,
      thesis: input.thesis,
      strategy: input.strategy,
      facts: input.facts,
      notes: input.notes,
      documentId: documentSnapshot?.id ?? input.documentId ?? null,
      documentName: documentSnapshot?.nome ?? null,
      modelId: modelSnapshot?.id ?? input.modelId ?? null,
      modelName: modelSnapshot?.nome ?? null,
      modelContent: modelSnapshot?.conteudo ?? null,
      processContext,
      caseMemory: caseMemorySnapshot,
    });

    if (result.type !== "piece") {
      throw new Error("Motor de IA retornou resposta invalida para peca.");
    }

    const draft = await prisma.aiDraftDocument.create({
      data: {
        tenantId: auth.tenantId,
        userId: auth.userId,
        sessionId: session.id,
        action: input.action,
        draftType: input.pieceType ?? "PECA_GERAL",
        title: result.title,
        tone: "juridico-profissional",
        strategy: input.strategy ?? null,
        status: "RASCUNHO",
        sourceProcessoId: input.processId ?? null,
        sourceDocumentoId: input.documentId ?? null,
        contentMarkdown: result.contentMarkdown,
        summary: result.summary,
        citations: result.citations,
        pendingReview: result.pendingReview,
        confidenceScore: result.confidenceScore,
      },
    });

    await Promise.all([
      registerUsage({
        tenantId: auth.tenantId,
        userId: auth.userId,
        sessionId: session.id,
        tier: entitlement.tier,
        action: input.action,
        ledgerType: "DRAFT",
        promptVersionId: promptVersion?.id ?? null,
      }),
      registerExecution({
        tenantId: auth.tenantId,
        userId: auth.userId,
        sessionId: session.id,
        action: input.action,
        promptVersionId: promptVersion?.id ?? null,
        inputSummary: input.objective ?? input.title ?? input.pieceType ?? null,
        outputSummary: result.summary,
        metadata: {
          mode: "piece",
          processId: input.processId ?? null,
          modelId: input.modelId ?? null,
          verification: buildVerificationMetadataSnapshot({
            sourceLeads: result.sourceLeads,
          }),
        },
      }),
      prisma.aiWorkspaceSession.update({
        where: { id: session.id },
        data: {
          lastActivityAt: new Date(),
          status: "COMPLETED",
        },
      }),
      entitlement.allowCaseMemory && input.processId
        ? upsertProcessCaseMemory({
            tenantId: auth.tenantId,
            userId: auth.userId,
            processId: input.processId,
            title: processContext?.titulo || processContext?.numero || "Processo",
            summary: result.summary,
            memory: {
              latestDraftId: draft.id,
              latestAction: input.action,
              latestPieceType: input.pieceType ?? null,
              thesis: input.thesis ?? null,
              objective: input.objective ?? null,
              updatedAt: new Date().toISOString(),
            },
          })
        : Promise.resolve(null),
      logOperationalEvent({
        tenantId: auth.tenantId,
        category: "INTEGRATION",
        source: "MAGIC_AI",
        action: "AI_DRAFT_CREATED",
        status: "SUCCESS",
        actorType: auth.role,
        actorId: auth.userId,
        actorName: auth.userName,
        entityType: "AI_DRAFT",
        entityId: draft.id,
        route: input.returnTo ?? "/magic-ai",
        message: `Rascunho criado para ${result.title}.`,
        payload: {
          sessionId: session.id,
          promptVersionId: promptVersion?.id ?? null,
          tier: entitlement.tier,
          engine: isOpenAiProviderConfigured() ? "OPENAI_RESPONSES" : "LOCAL_FALLBACK",
        },
      }),
    ]);

    revalidatePath("/magic-ai");

    return {
      success: true,
      data: {
        sessionId: session.id,
        draftId: draft.id,
        title: draft.title,
        summary: draft.summary,
        contentMarkdown: draft.contentMarkdown,
        citations: Array.isArray(draft.citations) ? (draft.citations as string[]) : [],
        pendingReview: Array.isArray(draft.pendingReview)
          ? (draft.pendingReview as string[])
          : [],
        sourceLeads: result.sourceLeads,
        confidenceScore: toNumber(draft.confidenceScore),
        engine: isOpenAiProviderConfigured() ? "OPENAI_RESPONSES" : "LOCAL_FALLBACK",
        promptVersionLabel: promptVersion
          ? `${promptVersion.title} v${promptVersion.version}`
          : null,
      },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Nao foi possivel gerar a peca assistida.",
    };
  }
}

export async function executeJuridicalAiDocumentAnalysis(
  input: AnalysisInput,
): Promise<ActionResponse<JuridicalAiAnalysisResult>> {
  try {
    const auth = await requireTenantAiAuth();
    const [runtime, usage, processContext, documentSnapshot] =
      await Promise.all([
        resolveTenantAiRuntimeContext({
          tenantId: auth.tenantId,
        }),
        getTenantAiUsageSummary(auth.tenantId, auth.userId),
        fetchProcessSnapshot(auth.tenantId, input.processId),
        fetchDocumentSnapshot(auth.tenantId, input.documentId),
      ]);
    const entitlement = runtime.entitlement;

    if (!entitlement.isEnabled) {
      throw new Error("Seu plano ainda nao habilita a IA juridica.");
    }

    assertTaskEnabled("DOCUMENT_ANALYSIS", runtime.rollout);

    await enforceQuota({
      tenantId: auth.tenantId,
      userId: auth.userId,
      quota: entitlement.quotas.documentAnalysesPerMonth,
      used: usage.analysesUsed,
      action: input.action,
      label: "analise documental",
    });

    const promptVersion = await getPublishedPromptForTask({
      taskKey: "DOCUMENT_ANALYSIS",
      scope: "tenant",
      tenantId: auth.tenantId,
    });

    const session = await createSession({
      tenantId: auth.tenantId,
      userId: auth.userId,
      role: auth.role,
      action: input.action,
      title: input.documentName ?? documentSnapshot?.nome ?? "Analise documental",
      contextRoute: input.returnTo ?? "/magic-ai",
      contextLabel: documentSnapshot?.nome ?? processContext?.numero ?? "Documento",
      processId: input.processId,
      documentId: input.documentId,
      inputContext: {
        objective: input.objective,
        notes: input.notes,
        documentName: input.documentName ?? documentSnapshot?.nome ?? null,
      },
    });

    const result = runLocalJuridicalAiEngine({
      taskKey: "DOCUMENT_ANALYSIS",
      objective: input.objective,
      notes: input.notes,
      documentId: documentSnapshot?.id ?? input.documentId ?? null,
      documentName: input.documentName ?? documentSnapshot?.nome ?? null,
      documentText: input.documentText,
      processContext,
    });

    if (result.type !== "analysis") {
      throw new Error("Motor de IA retornou resposta invalida para analise.");
    }

    const analysis = await prisma.aiDocumentAnalysis.create({
      data: {
        tenantId: auth.tenantId,
        userId: auth.userId,
        sessionId: session.id,
        analysisType: input.action,
        status: "SUCCESS",
        sourceDocumentoId: input.documentId ?? null,
        sourceName: input.documentName ?? documentSnapshot?.nome ?? null,
        inputExcerpt: input.documentText?.slice(0, 1200) ?? null,
        summary: result.summary,
        findings: result.findings,
        riskFlags: result.riskFlags,
        recommendations: result.recommendations,
        confidenceScore: result.confidenceScore,
      },
    });

    await Promise.all([
      registerUsage({
        tenantId: auth.tenantId,
        userId: auth.userId,
        sessionId: session.id,
        tier: entitlement.tier,
        action: input.action,
        ledgerType: "ANALYSIS",
        promptVersionId: promptVersion?.id ?? null,
      }),
      registerExecution({
        tenantId: auth.tenantId,
        userId: auth.userId,
        sessionId: session.id,
        action: input.action,
        promptVersionId: promptVersion?.id ?? null,
        inputSummary: input.documentName ?? input.objective ?? null,
        outputSummary: result.summary,
        metadata: {
          mode: "document-analysis",
          documentId: input.documentId ?? null,
        },
      }),
      prisma.aiWorkspaceSession.update({
        where: { id: session.id },
        data: {
          lastActivityAt: new Date(),
          status: "COMPLETED",
        },
      }),
      entitlement.allowCaseMemory && input.processId
        ? upsertProcessCaseMemory({
            tenantId: auth.tenantId,
            userId: auth.userId,
            processId: input.processId,
            title: processContext?.titulo || processContext?.numero || "Processo",
            summary: result.summary,
            memory: {
              latestAnalysisId: analysis.id,
              latestAction: input.action,
              latestDocumentName: analysis.sourceName ?? null,
              riskFlags: result.riskFlags,
              recommendations: result.recommendations,
              updatedAt: new Date().toISOString(),
            },
          })
        : Promise.resolve(null),
      logOperationalEvent({
        tenantId: auth.tenantId,
        category: "INTEGRATION",
        source: "MAGIC_AI",
        action: "AI_DOCUMENT_ANALYSIS_CREATED",
        status: "SUCCESS",
        actorType: auth.role,
        actorId: auth.userId,
        actorName: auth.userName,
        entityType: "AI_ANALYSIS",
        entityId: analysis.id,
        route: input.returnTo ?? "/magic-ai",
        message: `Analise criada para ${analysis.sourceName ?? "documento"}.`,
      }),
    ]);

    revalidatePath("/magic-ai");

    return {
      success: true,
      data: {
        sessionId: session.id,
        analysisId: analysis.id,
        summary: analysis.summary ?? result.summary,
        findings: Array.isArray(analysis.findings)
          ? (analysis.findings as JuridicalAiAnalysisResult["findings"])
          : result.findings,
        riskFlags: Array.isArray(analysis.riskFlags)
          ? (analysis.riskFlags as string[])
          : result.riskFlags,
        recommendations: Array.isArray(analysis.recommendations)
          ? (analysis.recommendations as string[])
          : result.recommendations,
        confidenceScore: toNumber(analysis.confidenceScore),
        engine: isOpenAiProviderConfigured() ? "OPENAI_RESPONSES" : "LOCAL_FALLBACK",
        promptVersionLabel: promptVersion
          ? `${promptVersion.title} v${promptVersion.version}`
          : null,
      },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Nao foi possivel analisar o documento.",
    };
  }
}

export async function executeJuridicalAiGenericTask(
  input: GenericInput,
): Promise<ActionResponse<JuridicalAiGenericResult>> {
  try {
    const auth = await requireTenantAiAuth();
    const [runtime, usage, processContext, caseMemorySnapshot, documentSnapshot] = await Promise.all([
      resolveTenantAiRuntimeContext({
        tenantId: auth.tenantId,
      }),
      getTenantAiUsageSummary(auth.tenantId, auth.userId),
      fetchProcessSnapshot(auth.tenantId, input.processId),
      fetchProcessCaseMemorySnapshot(auth.tenantId, input.processId),
      fetchDocumentSnapshot(auth.tenantId, input.documentId),
    ]);
    const entitlement = runtime.entitlement;

    if (!entitlement.isEnabled) {
      throw new Error("Seu plano ainda nao habilita a IA juridica.");
    }

    assertTaskEnabled(input.taskKey, runtime.rollout);

    const quotaLabelMap: Record<
      JuridicalAiTaskKey,
      { used: number; limit: number | null; ledgerType: "MESSAGE" | "SEARCH" | "CITATION_VALIDATION" }
    > = {
      QUESTION_ANSWERING: {
        used: usage.messagesUsed,
        limit: entitlement.quotas.messagesPerMonth,
        ledgerType: "MESSAGE",
      },
      PROCESS_SUMMARY: {
        used: usage.messagesUsed,
        limit: entitlement.quotas.messagesPerMonth,
        ledgerType: "MESSAGE",
      },
      CASE_STRATEGY: {
        used: usage.messagesUsed,
        limit: entitlement.quotas.messagesPerMonth,
        ledgerType: "MESSAGE",
      },
      SENTENCE_CALCULATION: {
        used: usage.messagesUsed,
        limit: entitlement.quotas.messagesPerMonth,
        ledgerType: "MESSAGE",
      },
      JURISPRUDENCE_BRIEF: {
        used: usage.searchesUsed,
        limit: entitlement.quotas.searchesPerMonth,
        ledgerType: "SEARCH",
      },
      CITATION_VALIDATION: {
        used: usage.citationValidationsUsed,
        limit: entitlement.quotas.citationValidationsPerMonth,
        ledgerType: "CITATION_VALIDATION",
      },
      PIECE_DRAFTING: {
        used: usage.messagesUsed,
        limit: entitlement.quotas.messagesPerMonth,
        ledgerType: "MESSAGE",
      },
      DOCUMENT_ANALYSIS: {
        used: usage.messagesUsed,
        limit: entitlement.quotas.messagesPerMonth,
        ledgerType: "MESSAGE",
      },
    };

    const quotaInfo = quotaLabelMap[input.taskKey];
    await enforceQuota({
      tenantId: auth.tenantId,
      userId: auth.userId,
      quota: quotaInfo.limit,
      used: quotaInfo.used,
      action: input.action,
      label: input.action,
    });

    const promptVersion = await getPublishedPromptForTask({
      taskKey: input.taskKey,
      scope: "tenant",
      tenantId: auth.tenantId,
    });

    const session = await createSession({
      tenantId: auth.tenantId,
      userId: auth.userId,
      role: auth.role,
      action: input.action,
      title: input.objective ?? input.question ?? input.action,
      contextRoute: input.returnTo ?? "/magic-ai",
      contextLabel: processContext?.titulo ?? processContext?.numero ?? "Workspace IA",
      processId: input.processId,
      documentId: input.documentId,
      inputContext: {
        documentId: input.documentId,
        documentName: input.documentName ?? documentSnapshot?.nome ?? null,
        question: input.question,
        objective: input.objective,
        notes: input.notes,
      },
    });

    const result = runLocalJuridicalAiEngine({
      taskKey: input.taskKey,
      documentId: input.documentId,
      documentName: input.documentName ?? documentSnapshot?.nome ?? null,
      documentText: input.documentText,
      question: input.question,
      objective: input.objective,
      notes: input.notes,
      processContext,
      caseMemory: caseMemorySnapshot,
    });

    if (result.type !== "generic") {
      throw new Error("Motor de IA retornou resposta invalida para essa acao.");
    }

    const enrichedCitationChecks =
      input.taskKey === "CITATION_VALIDATION" && result.citationChecks?.length
        ? await enrichCitationChecksWithExternalVerification(result.citationChecks)
        : result.citationChecks;

    await Promise.all([
      registerUsage({
        tenantId: auth.tenantId,
        userId: auth.userId,
        sessionId: session.id,
        tier: entitlement.tier,
        action: input.action,
        ledgerType: quotaInfo.ledgerType,
        promptVersionId: promptVersion?.id ?? null,
      }),
      registerExecution({
        tenantId: auth.tenantId,
        userId: auth.userId,
        sessionId: session.id,
        action: input.action,
        promptVersionId: promptVersion?.id ?? null,
        inputSummary: input.question ?? input.objective ?? null,
        outputSummary: result.summary,
        metadata: {
          mode: "generic",
            taskKey: input.taskKey,
            verification: buildVerificationMetadataSnapshot({
              sourceLeads: result.sourceLeads,
              citationChecks: enrichedCitationChecks,
              researchPlan: result.researchPlan,
              sentenceCalculation: result.sentenceCalculation,
            }),
          },
        }),
      prisma.aiWorkspaceSession.update({
        where: { id: session.id },
        data: {
          lastActivityAt: new Date(),
          status: "COMPLETED",
        },
      }),
      entitlement.allowCaseMemory && input.processId
        ? upsertProcessCaseMemory({
            tenantId: auth.tenantId,
            userId: auth.userId,
            processId: input.processId,
            title: processContext?.titulo || processContext?.numero || "Processo",
            summary: result.summary,
            memory: {
              latestAction: input.action,
              latestTaskKey: input.taskKey,
              latestQuestion: input.question ?? null,
              latestObjective: input.objective ?? null,
              latestDocumentName:
                input.documentName ?? documentSnapshot?.nome ?? null,
              latestSentenceCalculationSummary:
                result.sentenceCalculation?.outcomeSummary ?? null,
              bullets: result.bullets,
              updatedAt: new Date().toISOString(),
            },
          })
        : Promise.resolve(null),
      logOperationalEvent({
        tenantId: auth.tenantId,
        category: "INTEGRATION",
        source: "MAGIC_AI",
        action: "AI_GENERIC_TASK_COMPLETED",
        status: "SUCCESS",
        actorType: auth.role,
        actorId: auth.userId,
        actorName: auth.userName,
        entityType: "AI_SESSION",
        entityId: session.id,
        route: input.returnTo ?? "/magic-ai",
        message: `Acao ${input.action} concluida no workspace de IA.`,
      }),
    ]);

    revalidatePath("/magic-ai");

    return {
      success: true,
      data: {
        sessionId: session.id,
        summary: result.summary,
        contentMarkdown: result.contentMarkdown,
        bullets: result.bullets,
        citationChecks: enrichedCitationChecks,
        researchPlan: result.researchPlan,
        sentenceCalculation: result.sentenceCalculation,
        sourceLeads: result.sourceLeads,
        confidenceScore: result.confidenceScore,
        engine: isOpenAiProviderConfigured() ? "OPENAI_RESPONSES" : "LOCAL_FALLBACK",
        promptVersionLabel: promptVersion
          ? `${promptVersion.title} v${promptVersion.version}`
          : null,
      },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Nao foi possivel executar a acao juridica.",
    };
  }
}

export async function getJuridicalAiAdminDashboard(): Promise<
  ActionResponse<JuridicalAiAdminDashboard>
> {
  try {
    await requireSuperAdminAiAuth();
    await ensureDefaultAiPrompts();

    const [
      prompts,
      totalExecutions,
      totalDrafts,
      totalAnalyses,
      estimatedCost,
      executionsByEngine,
      executionsByAction,
      usageByLedgerType,
      recentExecutions,
      tenantsWithUsage,
      topTenantExecutions,
      topTenantUsage,
      recentAuditEvents,
      allTenants,
      processCountsByTenant,
      documentCountsByTenant,
      allTenantExecutions,
      allTenantDrafts,
      exportCountsByTenant,
    ] =
      await Promise.all([
        prisma.aiPromptVersion.findMany({
          orderBy: [{ ownerKey: "asc" }, { taskKey: "asc" }, { version: "desc" }],
          take: 100,
          select: {
            id: true,
            ownerKey: true,
            taskKey: true,
            title: true,
            version: true,
            status: true,
            scope: true,
            updatedAt: true,
            publishedAt: true,
          },
        }),
        prisma.aiExecutionLog.count(),
        prisma.aiDraftDocument.count(),
        prisma.aiDocumentAnalysis.count(),
        prisma.aiExecutionLog.aggregate({
          _sum: {
            estimatedCost: true,
          },
        }),
        prisma.aiExecutionLog.groupBy({
          by: ["engine"],
          _count: {
            engine: true,
          },
        }),
        prisma.aiExecutionLog.groupBy({
          by: ["action"],
          _count: {
            action: true,
          },
          orderBy: {
            _count: {
              action: "desc",
            },
          },
          take: 8,
        }),
        prisma.aiUsageLedger.groupBy({
          by: ["ledgerType"],
          _sum: {
            units: true,
          },
          orderBy: {
            _sum: {
              units: "desc",
            },
          },
        }),
        prisma.aiExecutionLog.findMany({
          orderBy: { createdAt: "desc" },
          take: 20,
          select: {
            id: true,
            tenantId: true,
            userId: true,
            action: true,
            status: true,
            engine: true,
            outputSummary: true,
            createdAt: true,
          },
        }),
        prisma.aiUsageLedger.groupBy({
          by: ["tenantId"],
          _count: {
            tenantId: true,
          },
        }),
        prisma.aiExecutionLog.groupBy({
          by: ["tenantId"],
          where: {
            tenantId: {
              not: null,
            },
          },
          _count: {
            tenantId: true,
          },
          _sum: {
            estimatedCost: true,
          },
          _max: {
            createdAt: true,
          },
          orderBy: {
            tenantId: "asc",
          },
          take: 8,
        }),
        prisma.aiUsageLedger.groupBy({
          by: ["tenantId"],
          where: {
            tenantId: {
              not: null,
            },
          },
          _sum: {
            units: true,
          },
        }),
        prisma.operationalAuditEvent.findMany({
          where: {
            source: "MAGIC_AI",
          },
          orderBy: { createdAt: "desc" },
          take: 12,
          select: {
            id: true,
            action: true,
            status: true,
            actorName: true,
            route: true,
            message: true,
            createdAt: true,
          },
        }),
        prisma.tenant.findMany({
          orderBy: [{ status: "asc" }, { name: "asc" }],
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            subscription: {
              select: {
                metadata: true,
                plano: {
                  select: {
                    nome: true,
                    slug: true,
                  },
                },
              },
            },
          },
        }),
        prisma.processo.groupBy({
          by: ["tenantId"],
          where: {
            deletedAt: null,
          },
          _count: {
            tenantId: true,
          },
        }),
        prisma.documento.groupBy({
          by: ["tenantId"],
          where: {
            deletedAt: null,
          },
          _count: {
            tenantId: true,
          },
        }),
        prisma.aiExecutionLog.groupBy({
          by: ["tenantId"],
          where: {
            tenantId: {
              not: null,
            },
          },
          _count: {
            tenantId: true,
          },
          _max: {
            createdAt: true,
          },
        }),
        prisma.aiDraftDocument.groupBy({
          by: ["tenantId"],
          _count: {
            tenantId: true,
          },
        }),
        prisma.operationalAuditEvent.groupBy({
          by: ["tenantId"],
          where: {
            tenantId: {
              not: null,
            },
            source: "MAGIC_AI",
            action: {
              in: [
                "AI_DRAFT_EXPORTED_TO_DOCUMENTO",
                "AI_DRAFT_EXPORTED_TO_MODELO",
                "AI_DRAFT_EXPORTED_TO_PETICAO",
              ],
            },
          },
          _count: {
            tenantId: true,
          },
        }),
      ]);

    const tenantMap = new Map(
      allTenants.map((tenant) => [
        tenant.id,
        {
          name: tenant.name,
          slug: tenant.slug,
          status: tenant.status,
          planName: tenant.subscription?.plano?.nome ?? null,
          planSlug: tenant.subscription?.plano?.slug ?? null,
          settings: tenant.subscription?.metadata ?? null,
        },
      ]),
    );
    const processCountMap = new Map(
      processCountsByTenant.map((item) => [item.tenantId, item._count.tenantId ?? 0]),
    );
    const documentCountMap = new Map(
      documentCountsByTenant.map((item) => [item.tenantId, item._count.tenantId ?? 0]),
    );
    const executionSummaryMap = new Map(
      allTenantExecutions
        .filter((item): item is typeof item & { tenantId: string } => Boolean(item.tenantId))
        .map((item) => [
          item.tenantId,
          {
            totalExecutions: item._count.tenantId ?? 0,
            latestExecutionAt: item._max.createdAt?.toISOString() ?? null,
          },
        ]),
    );
    const draftCountMap = new Map(
      allTenantDrafts.map((item) => [item.tenantId, item._count.tenantId ?? 0]),
    );
    const exportCountMap = new Map(
      exportCountsByTenant
        .filter((item): item is typeof item & { tenantId: string } => Boolean(item.tenantId))
        .map((item) => [item.tenantId, item._count.tenantId ?? 0]),
    );
    const tenantUsageMap = new Map(
      topTenantUsage
        .filter((item): item is typeof item & { tenantId: string } => Boolean(item.tenantId))
        .map((item) => [item.tenantId, item._sum.units ?? 0]),
    );
    const sortedTopTenantExecutions = [...topTenantExecutions].sort(
      (left, right) => (right._count.tenantId ?? 0) - (left._count.tenantId ?? 0),
    );
    const rolloutTenants = allTenants.map((tenant) => {
      const baseEntitlement = getEntitlementForPlan({
        planSlug: tenant.subscription?.plano?.slug ?? null,
        planName: tenant.subscription?.plano?.nome ?? null,
      });
      const rolloutContext = resolveTenantMagicAiRollout({
        settings: tenant.subscription?.metadata ?? null,
        entitlement: baseEntitlement,
        metrics: {
          processCount: processCountMap.get(tenant.id) ?? 0,
          documentCount: documentCountMap.get(tenant.id) ?? 0,
          executionCount: executionSummaryMap.get(tenant.id)?.totalExecutions ?? 0,
          draftCount: draftCountMap.get(tenant.id) ?? 0,
          exportCount: exportCountMap.get(tenant.id) ?? 0,
        },
      });

      return {
        tenantId: tenant.id,
        tenantName: tenant.name,
        tenantSlug: tenant.slug,
        tenantStatus: tenant.status,
        planName: tenant.subscription?.plano?.nome ?? null,
        planTier: baseEntitlement.planTier,
        effectiveTier: rolloutContext.entitlement.tier,
        rolloutStage: rolloutContext.rollout.stage,
        workspaceEnabled: rolloutContext.rollout.workspaceEnabled,
        overrideTier: rolloutContext.rollout.tierOverride,
        enabledTasks: rolloutContext.rollout.taskAccess
          .filter((item) => item.enabled)
          .map((item) => item.taskKey),
        completionPercent: rolloutContext.rollout.onboarding.completionPercent,
        totalExecutions: executionSummaryMap.get(tenant.id)?.totalExecutions ?? 0,
        totalDrafts: draftCountMap.get(tenant.id) ?? 0,
        latestExecutionAt: executionSummaryMap.get(tenant.id)?.latestExecutionAt ?? null,
        nextReviewAt: rolloutContext.rollout.nextReviewAt,
        owner: rolloutContext.rollout.owner,
        notes: rolloutContext.rollout.notes,
      };
    });
    const rolloutNeedsReviewCount = rolloutTenants.filter((tenant) => {
      if (!tenant.nextReviewAt || tenant.rolloutStage === "DISABLED") {
        return false;
      }

      return new Date(tenant.nextReviewAt).getTime() <= Date.now();
    }).length;

    return {
      success: true,
      data: {
        rollout: {
          totalTenants: rolloutTenants.length,
          enabledWorkspaces: rolloutTenants.filter((tenant) => tenant.workspaceEnabled).length,
          pilotTenants: rolloutTenants.filter((tenant) => tenant.rolloutStage === "PILOT").length,
          overrideTenants: rolloutTenants.filter((tenant) => tenant.overrideTier).length,
          needsReview: rolloutNeedsReviewCount,
        },
        rolloutTenants,
        prompts: prompts.map((prompt) => ({
          ...prompt,
          taskKey: prompt.taskKey as JuridicalAiTaskKey,
          updatedAt: prompt.updatedAt.toISOString(),
          publishedAt: prompt.publishedAt?.toISOString() ?? null,
        })),
        usage: {
          tenantsWithUsage: tenantsWithUsage.filter((item) => item.tenantId).length,
          totalExecutions,
          totalDrafts,
          totalAnalyses,
          totalEstimatedCost: toNumber(estimatedCost._sum.estimatedCost) ?? 0,
          executionsByEngine: executionsByEngine.map((item) => ({
            engine: item.engine,
            total: item._count.engine ?? 0,
          })),
          executionsByAction: executionsByAction.map((item) => ({
            action: item.action,
            total: item._count.action ?? 0,
          })),
          usageByLedgerType: usageByLedgerType.map((item) => ({
            ledgerType: item.ledgerType,
            totalUnits: item._sum.units ?? 0,
          })),
          topTenants: sortedTopTenantExecutions
            .filter((item): item is typeof item & { tenantId: string } => Boolean(item.tenantId))
            .map((item) => {
              const tenant = tenantMap.get(item.tenantId);
              return {
                tenantId: item.tenantId,
                tenantName: tenant?.name ?? item.tenantId,
                tenantSlug: tenant?.slug ?? item.tenantId,
                tenantStatus: tenant?.status ?? "UNKNOWN",
                planName: tenant?.planName ?? null,
                totalExecutions: item._count.tenantId ?? 0,
                totalUnits: tenantUsageMap.get(item.tenantId) ?? 0,
                totalEstimatedCost: toNumber(item._sum?.estimatedCost) ?? 0,
                latestExecutionAt: item._max?.createdAt?.toISOString() ?? null,
              };
            }),
          recentAuditEvents: recentAuditEvents.map((event) => ({
            ...event,
            createdAt: event.createdAt.toISOString(),
          })),
        },
        recentExecutions: recentExecutions.map((item) => ({
          ...item,
          createdAt: item.createdAt.toISOString(),
        })),
      },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Nao foi possivel carregar o cockpit da IA juridica.",
    };
  }
}

export async function updateJuridicalAiTenantRollout(
  input: RolloutInput,
): Promise<ActionResponse<{ tenantId: string }>> {
  try {
    const auth = await requireSuperAdminAiAuth();

    const tenant = await prisma.tenant.findUnique({
      where: {
        id: input.tenantId,
      },
      select: {
        id: true,
        name: true,
        subscription: {
          select: {
            id: true,
            metadata: true,
          },
        },
      },
    });

    if (!tenant) {
      throw new Error("Tenant não encontrado para atualização do rollout.");
    }

    const draft: JuridicalAiTenantRolloutDraft = {
      stage: input.stage,
      workspaceEnabled: input.workspaceEnabled,
      tierOverride:
        input.tierOverride && input.tierOverride !== "NONE" ? input.tierOverride : null,
      enabledTasks: Array.isArray(input.enabledTasks)
        ? Array.from(new Set(input.enabledTasks))
        : [],
      notes: input.notes?.trim() || null,
      owner: input.owner?.trim() || null,
      nextReviewAt:
        typeof input.nextReviewAt === "string" && input.nextReviewAt.trim()
          ? new Date(input.nextReviewAt).toISOString()
          : null,
      updatedAt: new Date().toISOString(),
      updatedBy: auth.userName,
    };

    const normalizedDraft = {
      ...draft,
      enabledTasks:
        draft.stage === "DISABLED"
          ? []
          : draft.enabledTasks.length > 0
            ? draft.enabledTasks
            : getRolloutDefaultTasks(draft.stage),
    } satisfies JuridicalAiTenantRolloutDraft;

    const nextMetadata = mergeTenantMagicAiRolloutIntoSettings({
      settings: tenant.subscription?.metadata ?? null,
      rollout: normalizedDraft,
    });

    if (tenant.subscription?.id) {
      await prisma.tenantSubscription.update({
        where: {
          id: tenant.subscription.id,
        },
        data: {
          metadata: nextMetadata,
        },
      });
    } else {
      await prisma.tenantSubscription.create({
        data: {
          tenantId: tenant.id,
          metadata: nextMetadata,
        },
      });
    }

    await logOperationalEvent({
      tenantId: tenant.id,
      category: "INTEGRATION",
      source: "MAGIC_AI",
      action: "AI_ROLLOUT_UPDATED",
      status: "SUCCESS",
      actorType: auth.role,
      actorId: auth.userId,
      actorName: auth.userName,
      entityType: "TENANT",
      entityId: tenant.id,
      route: "/admin/magic-ai",
      message: `Rollout do Magic AI atualizado para ${tenant.name}.`,
      payload: {
        stage: normalizedDraft.stage,
        workspaceEnabled: normalizedDraft.workspaceEnabled,
        tierOverride: normalizedDraft.tierOverride,
        enabledTasks: normalizedDraft.enabledTasks,
        nextReviewAt: normalizedDraft.nextReviewAt,
      },
    });

    revalidatePath("/admin/magic-ai");
    revalidatePath("/magic-ai");

    return {
      success: true,
      data: {
        tenantId: tenant.id,
      },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Nao foi possivel atualizar o rollout do Magic AI.",
    };
  }
}

export async function createJuridicalAiPromptVersion(
  input: PromptInput,
): Promise<ActionResponse<{ id: string }>> {
  try {
    const auth = await requireSuperAdminAiAuth();
    const ownerKey =
      input.scope === "admin"
        ? input.ownerKey?.trim() || "global-admin"
        : input.ownerKey?.trim() || "global";

    const latest = await prisma.aiPromptVersion.findFirst({
      where: {
        ownerKey,
        taskKey: input.taskKey,
      },
      orderBy: { version: "desc" },
      select: {
        version: true,
      },
    });

    const created = await prisma.aiPromptVersion.create({
      data: {
        ownerKey,
        tenantId: ownerKey === "global" || ownerKey === "global-admin" ? null : ownerKey,
        taskKey: input.taskKey,
        title: input.title.trim(),
        version: (latest?.version ?? 0) + 1,
        scope: input.scope,
        systemPrompt: input.systemPrompt.trim(),
        instructionPrompt: input.instructionPrompt.trim(),
        status: "DRAFT",
        createdByType: auth.role,
        createdById: auth.userId,
      },
      select: {
        id: true,
      },
    });

    await logOperationalEvent({
      category: "INTEGRATION",
      source: "MAGIC_AI",
      action: "AI_PROMPT_VERSION_CREATED",
      status: "SUCCESS",
      actorType: auth.role,
      actorId: auth.userId,
      actorName: auth.userName,
      entityType: "AI_PROMPT",
      entityId: created.id,
      route: "/admin/magic-ai",
      message: `Nova versao de prompt criada para ${input.taskKey}.`,
    });

    revalidatePath("/admin/magic-ai");

    return {
      success: true,
      data: created,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Nao foi possivel criar a versao do prompt.",
    };
  }
}

export async function publishJuridicalAiPromptVersion(
  promptId: string,
): Promise<ActionResponse<{ id: string }>> {
  try {
    const auth = await requireSuperAdminAiAuth();
    const prompt = await prisma.aiPromptVersion.findUnique({
      where: { id: promptId },
      select: {
        id: true,
        ownerKey: true,
        taskKey: true,
      },
    });

    if (!prompt) {
      throw new Error("Prompt nao encontrado.");
    }

    await prisma.$transaction([
      prisma.aiPromptVersion.updateMany({
        where: {
          ownerKey: prompt.ownerKey,
          taskKey: prompt.taskKey,
          status: "PUBLISHED",
          id: {
            not: prompt.id,
          },
        },
        data: {
          status: "ARCHIVED",
        },
      }),
      prisma.aiPromptVersion.update({
        where: { id: prompt.id },
        data: {
          status: "PUBLISHED",
          publishedAt: new Date(),
          createdByType: auth.role,
          createdById: auth.userId,
        },
      }),
    ]);

    await logOperationalEvent({
      category: "INTEGRATION",
      source: "MAGIC_AI",
      action: "AI_PROMPT_VERSION_PUBLISHED",
      status: "SUCCESS",
      actorType: auth.role,
      actorId: auth.userId,
      actorName: auth.userName,
      entityType: "AI_PROMPT",
      entityId: prompt.id,
      route: "/admin/magic-ai",
      message: `Prompt publicado para ${prompt.taskKey}.`,
    });

    revalidatePath("/admin/magic-ai");
    revalidatePath("/magic-ai");

    return {
      success: true,
      data: {
        id: prompt.id,
      },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Nao foi possivel publicar o prompt.",
    };
  }
}
