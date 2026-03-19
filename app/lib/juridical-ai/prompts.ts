import prisma from "@/app/lib/prisma";
import type {
  JuridicalAiPromptDefinition,
  JuridicalAiTaskKey,
} from "@/app/lib/juridical-ai/types";
import type { Prisma } from "@/generated/prisma";

const GLOBAL_OWNER_KEY = "global";
const ADMIN_OWNER_KEY = "global-admin";

const DEFAULT_PROMPTS: JuridicalAiPromptDefinition[] = [
  {
    ownerKey: GLOBAL_OWNER_KEY,
    scope: "tenant",
    taskKey: "PIECE_DRAFTING",
    title: "Geracao assistida de pecas",
    version: 1,
    systemPrompt:
      "Voce e um orquestrador juridico do Magic Lawyer. Gere rascunhos com estrutura util, rastreabilidade, prudencia e revisao humana obrigatoria.",
    instructionPrompt:
      "Monte um rascunho juridico em markdown com cabecalho, contexto do caso, fatos relevantes, tese, pedidos e checklist de revisao. Nunca invente citacoes. Se faltarem dados, sinalize de forma objetiva.",
    metadata: {
      family: "fundacao",
      output: "markdown",
    },
  },
  {
    ownerKey: GLOBAL_OWNER_KEY,
    scope: "tenant",
    taskKey: "DOCUMENT_ANALYSIS",
    title: "Analise juridica documental",
    version: 1,
    systemPrompt:
      "Voce analisa textos juridicos com foco operacional, risco, obrigacoes e lacunas. Sua saida precisa ser clara para advogados e coordenacao.",
    instructionPrompt:
      "Resuma o texto, destaque achados relevantes, classifique severidade e proponha proximos passos. Se o conteudo estiver incompleto, assuma postura conservadora.",
    metadata: {
      family: "fundacao",
      output: "structured-analysis",
    },
  },
  {
    ownerKey: GLOBAL_OWNER_KEY,
    scope: "tenant",
    taskKey: "QUESTION_ANSWERING",
    title: "Perguntas juridicas com contexto do tenant",
    version: 1,
    systemPrompt:
      "Voce responde perguntas juridicas com base apenas no contexto disponivel no workspace. Nao extrapole fatos nao fornecidos.",
    instructionPrompt:
      "Responda em formato executivo: resposta curta, fundamentos operacionais e pontos que exigem revisao humana ou busca externa.",
  },
  {
    ownerKey: GLOBAL_OWNER_KEY,
    scope: "tenant",
    taskKey: "CITATION_VALIDATION",
    title: "Validacao de citacoes",
    version: 1,
    systemPrompt:
      "Voce e um validador de citacoes. Seu objetivo e identificar referencias sem fonte, fragilidade ou ausencia de dados minimos de rastreio.",
    instructionPrompt:
      "Analise o texto recebido, identifique citacoes ou referencias e classifique cada uma como confirmavel, incompleta ou fragil. Nunca marque como confirmada sem lastro.",
  },
  {
    ownerKey: GLOBAL_OWNER_KEY,
    scope: "tenant",
    taskKey: "PROCESS_SUMMARY",
    title: "Resumo processual executivo",
    version: 1,
    systemPrompt:
      "Voce resume processos com foco em fase, fatos, pendencias, prazo e proxima providencia.",
    instructionPrompt:
      "Consolide contexto do processo em linguagem curta e util para advogado, coordenacao e suporte operacional.",
  },
  {
    ownerKey: GLOBAL_OWNER_KEY,
    scope: "tenant",
    taskKey: "CASE_STRATEGY",
    title: "Estrategia do caso",
    version: 1,
    systemPrompt:
      "Voce estrutura linha de atuacao com prudencia, indicando tese principal, riscos, reforcos documentais e acao seguinte.",
    instructionPrompt:
      "Organize a estrategia em markdown, separando tese principal, riscos, reforcos necessarios e a proxima providencia recomendada.",
  },
  {
    ownerKey: GLOBAL_OWNER_KEY,
    scope: "tenant",
    taskKey: "JURISPRUDENCE_BRIEF",
    title: "Briefing de pesquisa jurisprudencial",
    version: 1,
    systemPrompt:
      "Voce prepara a estrategia de pesquisa jurisprudencial, mas nao inventa precedentes. Seu papel e orientar buscas e criterios de validacao.",
    instructionPrompt:
      "Entregue termos de busca, recortes recomendados, tribunais prioritarios, filtros e como validar o que for encontrado.",
  },
  {
    ownerKey: GLOBAL_OWNER_KEY,
    scope: "tenant",
    taskKey: "SENTENCE_CALCULATION",
    title: "Calculo assistido de sentenca civel",
    version: 1,
    systemPrompt:
      "Voce atua como analista juridico-financeiro para leitura de sentencas civeis. Sua funcao e identificar comandos condenatorios, indexadores, marcos iniciais e dependencias de calculo, sem inventar valores nem fingir precisao onde faltarem dados.",
    instructionPrompt:
      "Leia o dispositivo e os trechos relevantes da sentenca. Estruture itens condenatorios, valor indicado, indexador, juros, termo inicial, dependencias de calculo e memorial preliminar. Seja conservador quando houver ambiguidade.",
    metadata: {
      family: "financial-litigation",
      output: "sentence-calculation",
    },
  },
  {
    ownerKey: ADMIN_OWNER_KEY,
    scope: "admin",
    taskKey: "PIECE_DRAFTING",
    title: "Governanca de pecas e prompts",
    version: 1,
    systemPrompt:
      "Voce ajuda o super admin a governar prompts, rollout, risco e politicas da IA juridica.",
    instructionPrompt:
      "Priorize rollout, auditoria, custo, seguranca e comunicacao do produto premium.",
    metadata: {
      family: "governance",
    },
  },
];

function toJsonValue(value?: Record<string, unknown> | null) {
  if (!value) {
    return undefined;
  }

  return value as Prisma.InputJsonValue;
}

export function getDefaultPromptDefinitions() {
  return DEFAULT_PROMPTS;
}

export async function ensureDefaultAiPrompts() {
  await Promise.all(
    DEFAULT_PROMPTS.map((prompt) =>
      prisma.aiPromptVersion.upsert({
        where: {
          ownerKey_taskKey_version: {
            ownerKey: prompt.ownerKey,
            taskKey: prompt.taskKey,
            version: prompt.version,
          },
        },
        update: {
          title: prompt.title,
          scope: prompt.scope,
          systemPrompt: prompt.systemPrompt,
          instructionPrompt: prompt.instructionPrompt,
          outputSchema: toJsonValue(prompt.outputSchema ?? null),
          metadata: toJsonValue(prompt.metadata ?? null),
        },
        create: {
          ownerKey: prompt.ownerKey,
          tenantId:
            prompt.ownerKey === GLOBAL_OWNER_KEY ||
            prompt.ownerKey === ADMIN_OWNER_KEY
              ? null
              : prompt.ownerKey,
          taskKey: prompt.taskKey,
          title: prompt.title,
          version: prompt.version,
          scope: prompt.scope,
          systemPrompt: prompt.systemPrompt,
          instructionPrompt: prompt.instructionPrompt,
          status: "PUBLISHED",
          publishedAt: new Date(),
          outputSchema: toJsonValue(prompt.outputSchema ?? null),
          metadata: toJsonValue(prompt.metadata ?? null),
        },
      }),
    ),
  );
}

export async function getPublishedPromptForTask(params: {
  taskKey: JuridicalAiTaskKey;
  scope: "tenant" | "admin";
  tenantId?: string | null;
}) {
  await ensureDefaultAiPrompts();

  const ownerKeys =
    params.scope === "admin"
      ? [ADMIN_OWNER_KEY, GLOBAL_OWNER_KEY]
      : params.tenantId
        ? [params.tenantId, GLOBAL_OWNER_KEY]
        : [GLOBAL_OWNER_KEY];

  const prompts = await prisma.aiPromptVersion.findMany({
    where: {
      ownerKey: {
        in: ownerKeys,
      },
      taskKey: params.taskKey,
      scope: params.scope,
      status: "PUBLISHED",
    },
    orderBy: [
      { ownerKey: "asc" },
      { version: "desc" },
      { updatedAt: "desc" },
    ],
  });

  return (
    prompts.find((prompt) => prompt.ownerKey === params.tenantId) ??
    prompts.find((prompt) => prompt.ownerKey === ADMIN_OWNER_KEY) ??
    prompts.find((prompt) => prompt.ownerKey === GLOBAL_OWNER_KEY) ??
    null
  );
}
