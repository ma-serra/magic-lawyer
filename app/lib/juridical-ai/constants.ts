import type {
  JuridicalAiRolloutStage,
  JuridicalAiTaskKey,
  JuridicalAiTier,
  JuridicalAiWorkspaceTab,
} from "@/app/lib/juridical-ai/types";

export const JURIDICAL_AI_TAB_LABELS: Record<JuridicalAiWorkspaceTab, string> = {
  peca: "Peças",
  documento: "Documentos",
  citacoes: "Citações",
  pergunta: "Perguntas",
  pesquisa: "Pesquisa",
  calculos: "Cálculos",
  historico: "Histórico",
};

export const JURIDICAL_AI_TASK_LABELS: Record<JuridicalAiTaskKey, string> = {
  PIECE_DRAFTING: "Geração de peças",
  DOCUMENT_ANALYSIS: "Análise documental",
  QUESTION_ANSWERING: "Pergunta jurídica",
  CITATION_VALIDATION: "Validação de citações",
  PROCESS_SUMMARY: "Resumo processual",
  CASE_STRATEGY: "Estratégia do caso",
  JURISPRUDENCE_BRIEF: "Briefing jurisprudencial",
  SENTENCE_CALCULATION: "Cálculo de sentença",
};

export const JURIDICAL_AI_TIER_LABELS: Record<JuridicalAiTier, string> = {
  NONE: "Sem acesso",
  ESSENCIAL: "Essencial",
  PROFISSIONAL: "Profissional",
  PREMIUM: "Premium",
};

export const JURIDICAL_AI_ROLLOUT_STAGE_LABELS: Record<
  JuridicalAiRolloutStage,
  string
> = {
  DISABLED: "Desabilitado",
  PILOT: "Piloto",
  CONTROLLED: "Controlado",
  RELEASED: "Liberado",
};

export const JURIDICAL_AI_PIECE_TYPES = [
  "Petição inicial",
  "Contestação",
  "Réplica",
  "Recurso",
  "Manifestação",
  "Impugnação",
  "Memoriais",
  "Parecer",
  "Contrato",
  "Notificação extrajudicial",
  "Requerimento administrativo",
] as const;

export const JURIDICAL_AI_GENERIC_TASK_OPTIONS: Array<{
  key: JuridicalAiTaskKey;
  label: string;
  description: string;
}> = [
  {
    key: "QUESTION_ANSWERING",
    label: "Perguntar à IA",
    description: "Resposta curta e contextual para dúvida jurídica operacional.",
  },
  {
    key: "PROCESS_SUMMARY",
    label: "Resumir processo",
    description: "Leitura executiva do caso com fase, status e pendências.",
  },
  {
    key: "CASE_STRATEGY",
    label: "Estratégia do caso",
    description: "Linha de atuação com risco, reforços e próxima providência.",
  },
  {
    key: "SENTENCE_CALCULATION",
    label: "Calcular sentença",
    description:
      "Extrai condenações, indexadores e dependências para montar memorial preliminar.",
  },
];

export const JURIDICAL_AI_USAGE_METRICS = [
  {
    key: "messagesUsed",
    label: "Mensagens",
    quotaKey: "messagesPerMonth",
  },
  {
    key: "draftsUsed",
    label: "Peças",
    quotaKey: "draftsPerMonth",
  },
  {
    key: "analysesUsed",
    label: "Análises",
    quotaKey: "documentAnalysesPerMonth",
  },
  {
    key: "searchesUsed",
    label: "Pesquisas",
    quotaKey: "searchesPerMonth",
  },
  {
    key: "citationValidationsUsed",
    label: "Citações",
    quotaKey: "citationValidationsPerMonth",
  },
] as const;
