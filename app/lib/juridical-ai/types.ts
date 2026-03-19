export type JuridicalAiTier =
  | "NONE"
  | "ESSENCIAL"
  | "PROFISSIONAL"
  | "PREMIUM";

export type JuridicalAiTaskKey =
  | "PIECE_DRAFTING"
  | "DOCUMENT_ANALYSIS"
  | "QUESTION_ANSWERING"
  | "CITATION_VALIDATION"
  | "PROCESS_SUMMARY"
  | "CASE_STRATEGY"
  | "JURISPRUDENCE_BRIEF"
  | "SENTENCE_CALCULATION";

export type JuridicalAiWorkspaceTab =
  | "peca"
  | "documento"
  | "citacoes"
  | "pergunta"
  | "pesquisa"
  | "calculos"
  | "historico";

export type JuridicalAiRolloutStage =
  | "DISABLED"
  | "PILOT"
  | "CONTROLLED"
  | "RELEASED";

export type JuridicalAiPromptDefinition = {
  ownerKey: string;
  scope: "tenant" | "admin";
  taskKey: JuridicalAiTaskKey;
  title: string;
  version: number;
  systemPrompt: string;
  instructionPrompt: string;
  outputSchema?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
};

export type JuridicalAiQuota = {
  messagesPerMonth: number | null;
  documentAnalysesPerMonth: number | null;
  draftsPerMonth: number | null;
  searchesPerMonth: number | null;
  citationValidationsPerMonth: number | null;
};

export type JuridicalAiEntitlement = {
  tier: JuridicalAiTier;
  planTier: JuridicalAiTier;
  source: "SUPER_ADMIN" | "TENANT_PLAN" | "TENANT_ROLLOUT_OVERRIDE";
  planSlug: string | null;
  planName: string | null;
  rolloutTierOverride: JuridicalAiTier | null;
  isEnabled: boolean;
  allowCaseMemory: boolean;
  allowPrioritySupport: boolean;
  allowUnlimitedDrafts: boolean;
  quotas: JuridicalAiQuota;
};

export type JuridicalAiUsageSummary = {
  periodKey: string;
  messagesUsed: number;
  draftsUsed: number;
  analysesUsed: number;
  searchesUsed: number;
  citationValidationsUsed: number;
};

export type JuridicalAiWorkspaceBootstrap = {
  entitlement: JuridicalAiEntitlement;
  rollout: JuridicalAiRolloutSummary;
  commercialOffer: JuridicalAiCommercialOffer;
  usage: JuridicalAiUsageSummary;
  recentSessions: Array<{
    id: string;
    action: string;
    title: string | null;
    status: string;
    contextLabel: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  recentDrafts: Array<{
    id: string;
    title: string;
    draftType: string;
    status: string;
    summary: string | null;
    contextLabel: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  recentMemories: Array<{
    id: string;
    scopeType: string;
    scopeId: string;
    title: string;
    summary: string | null;
    updatedAt: string;
  }>;
};

export type JuridicalAiTaskAccess = {
  taskKey: JuridicalAiTaskKey;
  enabled: boolean;
  reason: string;
};

export type JuridicalAiOnboardingStep = {
  key:
    | "PROCESS_BASE"
    | "DOCUMENT_BASE"
    | "FIRST_EXECUTION"
    | "FIRST_DRAFT"
    | "FIRST_EXPORT";
  label: string;
  description: string;
  completed: boolean;
};

export type JuridicalAiRolloutSummary = {
  stage: JuridicalAiRolloutStage;
  workspaceEnabled: boolean;
  tierOverride: JuridicalAiTier | null;
  owner: string | null;
  notes: string | null;
  nextReviewAt: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
  previewAccess: boolean;
  taskAccess: JuridicalAiTaskAccess[];
  onboarding: {
    completionPercent: number;
    completedCount: number;
    totalCount: number;
    items: JuridicalAiOnboardingStep[];
  };
};

export type JuridicalAiCommercialOffer = {
  mode: "CURRENT_PLAN" | "UPSELL" | "PILOT_OVERRIDE";
  title: string;
  description: string;
  ctaLabel: string;
  ctaHref: string;
  targetTier: JuridicalAiTier | null;
  bullets: string[];
};

export type JuridicalAiCaseMemoryView = {
  id: string;
  scopeType: string;
  scopeId: string;
  title: string;
  summary: string | null;
  memory: Record<string, unknown>;
  updatedAt: string;
};

export type JuridicalAiDraftResult = {
  sessionId: string;
  draftId: string;
  title: string;
  summary: string | null;
  contentMarkdown: string;
  citations: string[];
  pendingReview: string[];
  sourceLeads?: JuridicalAiSourceLead[];
  confidenceScore: number | null;
  engine: "LOCAL_FALLBACK" | "OPENAI_RESPONSES";
  promptVersionLabel: string | null;
};

export type JuridicalAiDraftDetail = JuridicalAiDraftResult & {
  draftType: string;
  status: string;
  strategy: string | null;
  createdAt: string;
  updatedAt: string;
  contextLabel: string | null;
};

export type JuridicalAiAnalysisResult = {
  sessionId: string;
  analysisId: string;
  summary: string;
  findings: Array<{
    label: string;
    detail: string;
    severity: "LOW" | "MEDIUM" | "HIGH";
  }>;
  riskFlags: string[];
  recommendations: string[];
  confidenceScore: number | null;
  engine: "LOCAL_FALLBACK" | "OPENAI_RESPONSES";
  promptVersionLabel: string | null;
};

export type JuridicalAiCitationCheck = {
  label: string;
  normalizedReference: string;
  sourceType: "LEGAL" | "JURISPRUDENCE" | "DOUTRINA" | "GENERIC";
  status: "CONFIRMAVEL" | "INCOMPLETA" | "FRAGIL";
  rationale: string;
  guidance: string;
  verificationLinks?: JuridicalAiVerificationLink[];
  externalVerificationStatus?:
    | "CONFIRMADA_FONTE_OFICIAL"
    | "CONFIRMADA_EM_BUSCA_OFICIAL"
    | "FONTE_OFICIAL_SEM_MATCH"
    | "PORTAL_OFICIAL_COM_RESTRICAO"
    | "LINK_OFICIAL_DE_PESQUISA"
    | "SEM_CONFIRMACAO_EXTERNA"
    | "FONTE_EXTERNA_INDISPONIVEL";
  externalVerificationNote?: string;
  externalVerifiedAt?: string | null;
  externalVerificationExcerpt?: string | null;
};

export type JuridicalAiResearchPlan = {
  objective: string;
  primaryQueries: string[];
  alternateQueries: string[];
  targetCourts: string[];
  favorableAngles: string[];
  opposingAngles: string[];
  validationChecklist: string[];
};

export type JuridicalAiSourceLead = {
  label: string;
  sourceType:
    | "PROCESSO"
    | "DOCUMENTO_INTERNO"
    | "CAUSA_OFICIAL"
    | "MODELO_INTERNO"
    | "MEMORIA_DO_CASO"
    | "REFERENCIA_EXTRAIDA";
  verificationLevel: "OFICIAL" | "INTERNO" | "INDICATIVO";
  detail: string;
  whyItMatters: string;
  verificationLinks?: JuridicalAiVerificationLink[];
};

export type JuridicalAiVerificationLink = {
  label: string;
  href: string;
  kind: "INTERNAL" | "EXTERNAL";
  authority: string;
  accessMode: "DIRECT" | "SEARCH";
};

export type JuridicalAiSentenceCalculationItem = {
  label: string;
  nature:
    | "OBRIGACAO_DE_FAZER"
    | "MULTA"
    | "LIBERACAO_DE_VALOR"
    | "RESTITUICAO"
    | "INDENIZACAO"
    | "IMPROCEDENCIA"
    | "OUTRO";
  basis: string;
  amountMentioned?: string | null;
  correctionRule: string;
  interestRule: string;
  startTrigger: string;
  dependencies: string[];
  automationStatus: "AUTO_ESTIMAVEL" | "DEPENDENTE_DE_DADOS" | "MANUAL";
};

export type JuridicalAiSentenceCalculationResult = {
  outcomeSummary: string;
  condemnedItems: JuridicalAiSentenceCalculationItem[];
  requiredInputs: string[];
  calculableItems: string[];
  manualReviewItems: string[];
  memorialDraft: string;
};

export type JuridicalAiGenericResult = {
  sessionId: string;
  summary: string;
  contentMarkdown: string;
  bullets: string[];
  citationChecks?: JuridicalAiCitationCheck[];
  researchPlan?: JuridicalAiResearchPlan;
  sentenceCalculation?: JuridicalAiSentenceCalculationResult;
  sourceLeads?: JuridicalAiSourceLead[];
  confidenceScore: number | null;
  engine: "LOCAL_FALLBACK" | "OPENAI_RESPONSES";
  promptVersionLabel: string | null;
};

export type JuridicalAiAdminDashboard = {
  rollout: {
    totalTenants: number;
    enabledWorkspaces: number;
    pilotTenants: number;
    overrideTenants: number;
    needsReview: number;
  };
  rolloutTenants: Array<{
    tenantId: string;
    tenantName: string;
    tenantSlug: string;
    tenantStatus: string;
    planName: string | null;
    planTier: JuridicalAiTier;
    effectiveTier: JuridicalAiTier;
    rolloutStage: JuridicalAiRolloutStage;
    workspaceEnabled: boolean;
    overrideTier: JuridicalAiTier | null;
    enabledTasks: JuridicalAiTaskKey[];
    completionPercent: number;
    totalExecutions: number;
    totalDrafts: number;
    latestExecutionAt: string | null;
    nextReviewAt: string | null;
    owner: string | null;
    notes: string | null;
  }>;
  prompts: Array<{
    id: string;
    ownerKey: string;
    taskKey: JuridicalAiTaskKey;
    title: string;
    version: number;
    status: string;
    scope: string;
    updatedAt: string;
    publishedAt: string | null;
  }>;
  usage: {
    tenantsWithUsage: number;
    totalExecutions: number;
    totalDrafts: number;
    totalAnalyses: number;
    totalEstimatedCost: number;
    executionsByEngine: Array<{
      engine: string;
      total: number;
    }>;
    executionsByAction: Array<{
      action: string;
      total: number;
    }>;
    usageByLedgerType: Array<{
      ledgerType: string;
      totalUnits: number;
    }>;
    topTenants: Array<{
      tenantId: string;
      tenantName: string;
      tenantSlug: string;
      tenantStatus: string;
      planName: string | null;
      totalExecutions: number;
      totalUnits: number;
      totalEstimatedCost: number;
      latestExecutionAt: string | null;
    }>;
    recentAuditEvents: Array<{
      id: string;
      action: string;
      status: string;
      actorName: string | null;
      route: string | null;
      message: string | null;
      createdAt: string;
    }>;
  };
  recentExecutions: Array<{
    id: string;
    tenantId: string | null;
    userId: string | null;
    action: string;
    status: string;
    engine: string;
    outputSummary: string | null;
    createdAt: string;
  }>;
};
