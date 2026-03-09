export type PublicChatMessage = {
  author: "bot" | "user";
  text: string;
  createdAt?: string | null;
};

export const CONTACT_PREFERENCE_OPTIONS = [
  {
    value: "WhatsApp",
    label: "WhatsApp",
    helper: "Melhor para retorno mais direto e rápido.",
  },
  {
    value: "E-mail",
    label: "E-mail",
    helper: "Bom para receber proposta detalhada por escrito.",
  },
  {
    value: "Ligação",
    label: "Ligação",
    helper: "Útil quando a decisão precisa de alinhamento mais consultivo.",
  },
] as const;

export const RESPONSE_PRIORITY_OPTIONS = [
  {
    value: "Hoje",
    label: "Hoje",
    helper: "Quando a análise comercial é urgente.",
  },
  {
    value: "Esta semana",
    label: "Esta semana",
    helper: "Quando o time já quer avançar, sem urgência extrema.",
  },
  {
    value: "Sem urgência",
    label: "Sem urgência",
    helper: "Quando o contato pode seguir no ritmo normal do funil.",
  },
] as const;

export type ContactPreferenceValue =
  (typeof CONTACT_PREFERENCE_OPTIONS)[number]["value"];
export type ResponsePriorityValue =
  (typeof RESPONSE_PRIORITY_OPTIONS)[number]["value"];

export const PRICING_CHAT_FAQS = [
  {
    id: "plans-difference",
    shortLabel: "Diferença entre planos",
    question: "Qual é a diferença entre os planos?",
    answer:
      "A principal diferença está no nível de operação que cada plano sustenta. A matriz acima mostra módulo por módulo, e o comercial fecha a proposta alinhando equipe, volume e fase do escritório.",
  },
  {
    id: "implementation-time",
    shortLabel: "Tempo de implantação",
    question: "Quanto tempo costuma levar a implantação?",
    answer:
      "Depende do volume e da organização atual, mas o início costuma ser rápido. A implantação é guiada para priorizar o que precisa entrar em produção primeiro, sem travar o restante.",
  },
  {
    id: "migration-support",
    shortLabel: "Migração de dados",
    question: "Vocês ajudam na migração de dados?",
    answer:
      "Sim. O processo comercial já coleta contexto para o onboarding definir o que vem primeiro, quais dados são críticos e qual a melhor sequência para migrar sem ruído operacional.",
  },
  {
    id: "growth-path",
    shortLabel: "Começar menor e expandir",
    question: "Posso começar em um plano menor e expandir depois?",
    answer:
      "Pode. A contratação é pensada para permitir evolução de plano conforme a operação amadurece, preservando base e histórico para evitar retrabalho na virada.",
  },
  {
    id: "human-support",
    shortLabel: "Atendimento humano",
    question: "Se eu quiser, consigo falar com uma pessoa?",
    answer:
      "Sim. A Lia qualifica e organiza o contexto, mas o fechamento da proposta e o alinhamento comercial seguem com atendimento humano do time Magic Lawyer.",
  },
] as const;

export type PricingChatFaqId = (typeof PRICING_CHAT_FAQS)[number]["id"];

export type PricingChatLeadMetadata = {
  version: 2;
  requestedHumanHandoff: boolean;
  preferredContactChannel: ContactPreferenceValue | null;
  responsePriority: ResponsePriorityValue | null;
  faqTopicIds: PricingChatFaqId[];
  qualificationPath: "GUIDED" | "HANDOFF";
  stepReached: string | null;
  completedAnswers: number;
  answersComplete: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sanitizeSingleChoice<T extends string>(
  value: unknown,
  allowedValues: readonly T[],
): T | null {
  if (typeof value !== "string") {
    return null;
  }

  return allowedValues.includes(value as T) ? (value as T) : null;
}

function sanitizeFaqTopicIds(value: unknown): PricingChatFaqId[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const allowedIds = new Set(PRICING_CHAT_FAQS.map((item) => item.id));

  return Array.from(
    new Set(
      value.filter(
        (item): item is PricingChatFaqId =>
          typeof item === "string" && allowedIds.has(item as PricingChatFaqId),
      ),
    ),
  );
}

export function buildPricingChatLeadMetadata(input: {
  requestedHumanHandoff?: unknown;
  preferredContactChannel?: unknown;
  responsePriority?: unknown;
  faqTopicIds?: unknown;
  stepReached?: unknown;
  completedAnswers?: number;
  answersComplete?: boolean;
}): PricingChatLeadMetadata {
  const preferredContactChannel = sanitizeSingleChoice(
    input.preferredContactChannel,
    CONTACT_PREFERENCE_OPTIONS.map((item) => item.value),
  );
  const responsePriority = sanitizeSingleChoice(
    input.responsePriority,
    RESPONSE_PRIORITY_OPTIONS.map((item) => item.value),
  );
  const requestedHumanHandoff = input.requestedHumanHandoff === true;
  const completedAnswers =
    typeof input.completedAnswers === "number" &&
    Number.isFinite(input.completedAnswers)
      ? Math.max(0, Math.min(4, Math.trunc(input.completedAnswers)))
      : 0;

  return {
    version: 2,
    requestedHumanHandoff,
    preferredContactChannel,
    responsePriority,
    faqTopicIds: sanitizeFaqTopicIds(input.faqTopicIds),
    qualificationPath: requestedHumanHandoff ? "HANDOFF" : "GUIDED",
    stepReached:
      typeof input.stepReached === "string" ? input.stepReached : null,
    completedAnswers,
    answersComplete: input.answersComplete === true,
  };
}

export function parsePricingChatLeadMetadata(
  value: unknown,
): PricingChatLeadMetadata | null {
  if (!isRecord(value)) {
    return null;
  }

  const parsed = buildPricingChatLeadMetadata({
    requestedHumanHandoff: value.requestedHumanHandoff,
    preferredContactChannel: value.preferredContactChannel,
    responsePriority: value.responsePriority,
    faqTopicIds: value.faqTopicIds,
    stepReached: value.stepReached,
    completedAnswers:
      typeof value.completedAnswers === "number"
        ? value.completedAnswers
        : undefined,
    answersComplete: value.answersComplete === true,
  });

  return {
    ...parsed,
    version:
      typeof value.version === "number" && value.version >= 2
        ? 2
        : parsed.version,
    qualificationPath:
      value.qualificationPath === "HANDOFF"
        ? "HANDOFF"
        : parsed.qualificationPath,
  };
}

export function getPricingChatFaqItemsByIds(ids: PricingChatFaqId[]) {
  const idSet = new Set(ids);

  return PRICING_CHAT_FAQS.filter((item) => idSet.has(item.id));
}
