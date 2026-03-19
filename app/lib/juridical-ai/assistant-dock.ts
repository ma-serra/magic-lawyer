import type {
  JuridicalAiTaskKey,
  JuridicalAiWorkspaceTab,
} from "@/app/lib/juridical-ai/types";

export type JuridicalAiDockScope = "tenant" | "admin";

export type JuridicalAiDockContextId =
  | "workspace"
  | "processos"
  | "documentos"
  | "jurisprudencia"
  | "peticoes"
  | "contratos"
  | "clientes"
  | "governanca"
  | "monetizacao"
  | "inteligencia";

export type JuridicalAiDockActionId =
  | "nova-peca"
  | "analisar-documento"
  | "pesquisar-jurisprudencia"
  | "validar-citacoes"
  | "calcular-sentenca"
  | "resumir-processo"
  | "estrategia-caso"
  | "governanca-ia"
  | "monetizacao-premium"
  | "auditar-uso";

export type JuridicalAiDockQuickLink = {
  label: string;
  href: string;
  description: string;
};

export type JuridicalAiDockAction = {
  id: JuridicalAiDockActionId;
  shortLabel: string;
  title: string;
  tooltip: string;
  description: string;
  rolloutStage: "FOUNDATION" | "NEXT";
  outcomes: string[];
  quickLinks: JuridicalAiDockQuickLink[];
};

export type JuridicalAiDockContext = {
  id: JuridicalAiDockContextId;
  label: string;
  description: string;
  promptHint: string;
};

export type JuridicalAiAdminTab =
  | "cockpit"
  | "rollout"
  | "prompts"
  | "usage"
  | "executions";

function hasPrefix(pathname: string, prefixes: string[]) {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function resolveJuridicalAiDockContext(
  pathname: string,
  scope: JuridicalAiDockScope,
): JuridicalAiDockContext {
  if (scope === "admin") {
    if (hasPrefix(pathname, ["/admin/auditoria"])) {
      return {
        id: "governanca",
        label: "Governança e risco",
        description:
          "Contexto administrativo sensível. O workspace precisa enfatizar auditoria, rastreabilidade, billing e política de uso da IA.",
        promptHint:
          "Priorizar governança, logs, risco jurídico, billing e proteção operacional.",
      };
    }

    if (hasPrefix(pathname, ["/admin/pacotes", "/admin/financeiro"])) {
      return {
        id: "monetizacao",
        label: "Monetização premium",
        description:
          "Contexto comercial e financeiro. O foco é oferta premium, pacotes, cobrança, conversão e rentabilidade da IA jurídica.",
        promptHint:
          "Priorizar pricing, conversão, upsell e leitura econômica da oferta premium.",
      };
    }

    return {
      id: "inteligencia",
      label: "Operação e inteligência",
      description:
        "Contexto de gestão global. O super admin deve ver rollout, telemetria, adoção e governança do assistente jurídico.",
      promptHint:
        "Priorizar rollout da IA, adoção por tenant, métricas, auditoria e catálogo premium.",
    };
  }

  if (hasPrefix(pathname, ["/processos", "/processo", "/andamentos"])) {
    return {
      id: "processos",
      label: "Processos e andamentos",
      description:
        "A IA deve nascer ligada ao caso: fatos, andamentos, documentos e próxima providência processual.",
      promptHint:
        "Priorizar resumo do caso, estratégia, peça contextual e próxima ação processual.",
    };
  }

  if (hasPrefix(pathname, ["/documentos"])) {
    return {
      id: "documentos",
      label: "Documentos e anexos",
      description:
        "Contexto documental. O workspace deve enfatizar leitura, extração, comparação e preparação de insumos para peças.",
      promptHint:
        "Priorizar análise documental, comparação, resumo e extração de fatos e riscos.",
    };
  }

  if (hasPrefix(pathname, ["/causas", "/juizes"])) {
    return {
      id: "jurisprudencia",
      label: "Pesquisa e fundamentos",
      description:
        "Contexto de pesquisa jurídica. O foco passa a ser precedentes, teses, fundamentos e validação de citações.",
      promptHint:
        "Priorizar jurisprudência, fundamentos, precedentes favoráveis e validação de referências.",
    };
  }

  if (hasPrefix(pathname, ["/peticoes", "/modelos-peticao"])) {
    return {
      id: "peticoes",
      label: "Peças e modelos",
      description:
        "Contexto de produção textual. A IA deve organizar tese, estrutura, rascunho e revisão de peça.",
      promptHint:
        "Priorizar geração de peça, estrutura argumentativa e coerência jurídica.",
    };
  }

  if (hasPrefix(pathname, ["/contratos", "/procuracoes"])) {
    return {
      id: "contratos",
      label: "Contratos e instrumentos",
      description:
        "Contexto contratual. A IA deve apoiar leitura, minuta, revisão e risco documental.",
      promptHint:
        "Priorizar análise de cláusulas, revisão, minuta e riscos documentais.",
    };
  }

  if (hasPrefix(pathname, ["/clientes"])) {
    return {
      id: "clientes",
      label: "Clientes e contexto factual",
      description:
        "Contexto de relacionamento e histórico. A IA deve consolidar fatos, documentos e visão estratégica por cliente.",
      promptHint:
        "Priorizar histórico, fatos relevantes, contexto do cliente e próximos passos.",
    };
  }

  return {
    id: "workspace",
    label: "Workspace jurídico",
    description:
      "Contexto geral do escritório. O assistente deve servir como ponto central para peças, análise documental e pesquisa.",
    promptHint:
      "Priorizar organização do trabalho jurídico, pesquisa, documentos e geração assistida.",
  };
}

function buildTenantActions(context: JuridicalAiDockContext): JuridicalAiDockAction[] {
  const actions: JuridicalAiDockAction[] = [
    {
      id: "nova-peca",
      shortLabel: "Peça",
      title: "Nova peça jurídica",
      tooltip: "Estruturar petição, manifestação, recurso ou minuta com contexto do caso.",
      description:
        "Primeira entrega do workspace premium de IA jurídica. Vai reunir caso, documentos, fundamentos e estilo do escritório antes de gerar a peça.",
      rolloutStage: "FOUNDATION",
      outcomes: [
        "Escolher tipo de peça, rito e objetivo.",
        "Montar briefing do caso com fatos e documentos.",
        "Gerar rascunho auditável com histórico de versões.",
      ],
      quickLinks: [
        {
          label: "Modelos de petição",
          href: "/modelos-peticao",
          description: "Base atual de modelos enquanto a geração assistida entra em produção.",
        },
        {
          label: "Petições",
          href: "/peticoes",
          description: "Linha operacional atual para acompanhar peças já produzidas.",
        },
        {
          label: "Processos",
          href: "/processos",
          description: "Voltar ao caso e reunir o contexto que vai alimentar a peça.",
        },
      ],
    },
    {
      id: "analisar-documento",
      shortLabel: "Doc",
      title: "Analisar documento",
      tooltip: "Ler anexos, extrair fatos, riscos, cláusulas e pontos sensíveis.",
      description:
        "Workspace de leitura jurídica para contratos, decisões, laudos, notificações e petições de terceiros.",
      rolloutStage: "FOUNDATION",
      outcomes: [
        "Resumir o documento em linguagem operacional.",
        "Apontar riscos, lacunas e obrigações.",
        "Preparar insumos para peças, contratos e estratégia.",
      ],
      quickLinks: [
        {
          label: "Documentos",
          href: "/documentos",
          description: "Entrar no acervo e escolher os anexos que vão alimentar a IA.",
        },
        {
          label: "Contratos",
          href: "/contratos",
          description: "Revisar instrumentos contratuais e histórico relacionado.",
        },
        {
          label: "Procurações",
          href: "/procuracoes",
          description: "Consultar instrumentos e documentos de representação.",
        },
      ],
    },
    {
      id: "pesquisar-jurisprudencia",
      shortLabel: "Juris",
      title: "Pesquisar jurisprudência",
      tooltip: "Encontrar precedentes, organizar fundamentos e preparar a tese.",
      description:
        "Camada de pesquisa jurídica assistida para localizar precedentes úteis, resumir entendimento e apoiar a peça.",
      rolloutStage: "NEXT",
      outcomes: [
        "Buscar precedentes por tese, tema e tribunal.",
        "Montar síntese favorável e contrária.",
        "Enviar referências relevantes para a peça e o resumo do caso.",
      ],
      quickLinks: [
        {
          label: "Causas",
          href: "/causas",
          description: "Entrar no radar oficial de causas e catálogo jurídico do escritório.",
        },
        {
          label: "Juízes",
          href: "/juizes",
          description: "Cruzar atuação, perfis e inteligência ligada ao caso.",
        },
        {
          label: "Relatórios",
          href: "/relatorios",
          description: "Voltar aos indicadores e recortes estratégicos já disponíveis.",
        },
      ],
    },
    {
      id: "validar-citacoes",
      shortLabel: "Citar",
      title: "Validar citações",
      tooltip: "Conferir referência, origem e confiança antes de usar na peça.",
      description:
        "Validador jurídico para impedir citação inventada, referência frágil ou fundamento sem fonte rastreável.",
      rolloutStage: "NEXT",
      outcomes: [
        "Marcar citação como confirmada, parcial ou não confirmada.",
        "Apontar fonte e contexto de uso.",
        "Reduzir risco de peça com fundamento não rastreado.",
      ],
      quickLinks: [
        {
          label: "Causas",
          href: "/causas",
          description: "Consultar fundamentos e apoiar a conferência das referências.",
        },
        {
          label: "Petições",
          href: "/peticoes",
          description: "Retornar à peça e revisar o texto com base nas referências confirmadas.",
        },
      ],
    },
    {
      id: "calcular-sentenca",
      shortLabel: "Cálc",
      title: "Calcular sentença",
      tooltip:
        "Ler dispositivo, separar condenações, indexadores e dependências do memorial de cálculo.",
      description:
        "Fluxo premium para decisões cíveis com condenação, obrigação de fazer, danos morais, restituição e atualização monetária.",
      rolloutStage: "NEXT",
      outcomes: [
        "Extrair itens condenatórios e improcedências.",
        "Classificar correção, juros e termo inicial.",
        "Gerar memorial preliminar e lista do que ainda depende de dado humano.",
      ],
      quickLinks: [
        {
          label: "Documentos",
          href: "/documentos",
          description: "Selecionar a sentença ou decisão que será lida pela IA.",
        },
        {
          label: "Financeiro",
          href: "/financeiro",
          description: "Cruzar o resultado com a leitura financeira e recebíveis do caso.",
        },
        {
          label: "Processos",
          href: "/processos",
          description: "Voltar ao processo para anexar memorial, peça ou providência seguinte.",
        },
      ],
    },
    {
      id: "resumir-processo",
      shortLabel: "Resumo",
      title: "Resumir processo",
      tooltip: "Consolidar fatos, andamentos, documentos e próximos passos do caso.",
      description:
        "Resumo executivo ligado ao processo atual, com leitura para advogado, coordenação e suporte operacional.",
      rolloutStage: "FOUNDATION",
      outcomes: [
        "Gerar visão rápida do caso e da fase processual.",
        "Listar fatos relevantes, riscos e pendências.",
        "Sugerir próxima providência ligada ao andamento.",
      ],
      quickLinks: [
        {
          label: "Processos",
          href: "/processos",
          description: "Entrar no caso e selecionar o processo base para a síntese futura.",
        },
        {
          label: "Andamentos",
          href: "/andamentos",
          description: "Cruzar a linha do tempo com a próxima ação sugerida.",
        },
      ],
    },
    {
      id: "estrategia-caso",
      shortLabel: "Plano",
      title: "Estratégia do caso",
      tooltip: "Cruzar fatos, documentos e precedentes para sugerir linha de atuação.",
      description:
        "A camada estratégica da IA vai consolidar tese, riscos, contradições e próximos movimentos no caso.",
      rolloutStage: "NEXT",
      outcomes: [
        "Estruturar tese principal e alternativas.",
        "Apontar pontos frágeis e reforços documentais.",
        "Sugerir ações processuais e documentais.",
      ],
      quickLinks: [
        {
          label: "Dashboard",
          href: "/dashboard",
          description: "Voltar ao cockpit do escritório para entender contexto e prioridades.",
        },
        {
          label: context.id === "processos" ? "Processos" : "Relatórios",
          href: context.id === "processos" ? "/processos" : "/relatorios",
          description:
            context.id === "processos"
              ? "Retomar o caso e seus documentos."
              : "Cruzar a estratégia com o recorte operacional já disponível.",
        },
      ],
    },
  ];

  const priorityMap: Record<JuridicalAiDockContextId, JuridicalAiDockActionId[]> = {
    workspace: [
      "nova-peca",
      "analisar-documento",
      "calcular-sentenca",
      "pesquisar-jurisprudencia",
      "resumir-processo",
    ],
    processos: [
      "nova-peca",
      "calcular-sentenca",
      "resumir-processo",
      "estrategia-caso",
      "validar-citacoes",
    ],
    documentos: [
      "analisar-documento",
      "calcular-sentenca",
      "nova-peca",
      "validar-citacoes",
      "estrategia-caso",
    ],
    jurisprudencia: [
      "pesquisar-jurisprudencia",
      "validar-citacoes",
      "estrategia-caso",
      "nova-peca",
    ],
    peticoes: [
      "nova-peca",
      "validar-citacoes",
      "analisar-documento",
      "pesquisar-jurisprudencia",
    ],
    contratos: [
      "analisar-documento",
      "nova-peca",
      "estrategia-caso",
      "validar-citacoes",
    ],
    clientes: [
      "resumir-processo",
      "estrategia-caso",
      "nova-peca",
      "analisar-documento",
    ],
    governanca: [],
    monetizacao: [],
    inteligencia: [],
  };

  const desiredOrder = priorityMap[context.id];
  if (desiredOrder.length === 0) {
    return actions;
  }

  return [...actions].sort(
    (left, right) => {
      const leftIndex = desiredOrder.indexOf(left.id);
      const rightIndex = desiredOrder.indexOf(right.id);

      return (
        (leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex) -
        (rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex)
      );
    },
  );
}

function buildAdminActions(context: JuridicalAiDockContext): JuridicalAiDockAction[] {
  const actions: JuridicalAiDockAction[] = [
    {
      id: "governanca-ia",
      shortLabel: "Gov",
      title: "Governança da IA jurídica",
      tooltip: "Controlar riscos, trilhas, política de uso e rollout da camada premium.",
      description:
        "Painel conceitual do super admin para auditoria, logs, proteção operacional e regras do assistente jurídico.",
      rolloutStage: "FOUNDATION",
      outcomes: [
        "Versionar prompts e regras de uso.",
        "Auditar quem gerou o quê, quando e com quais insumos.",
        "Controlar permissões, rollout e risco jurídico.",
      ],
      quickLinks: [
        {
          label: "Auditoria",
          href: "/admin/auditoria",
          description: "Trilha crítica, emails, webhooks, crons e ações sensíveis.",
        },
        {
          label: "Relatórios",
          href: "/admin/relatorios",
          description: "Visão executiva para adoção, uso e operação do produto.",
        },
        {
          label: "Configurações",
          href: "/admin/configuracoes",
          description: "Base para centralizar políticas globais da plataforma.",
        },
      ],
    },
    {
      id: "monetizacao-premium",
      shortLabel: "R$",
      title: "Monetização premium",
      tooltip: "Organizar oferta, cobrança, upgrade e captura de valor da IA jurídica.",
      description:
        "Linha comercial da IA jurídica: pricing, tiers, cobrança, upsell e rentabilidade por tenant.",
      rolloutStage: "FOUNDATION",
      outcomes: [
        "Definir pacote Essencial, Profissional e Premium.",
        "Conectar billing, franquias e limites de uso.",
        "Medir adesão, receita e expansão por tenant.",
      ],
      quickLinks: [
        {
          label: "Pacotes",
          href: "/admin/pacotes",
          description: "Montar a oferta premium que será vendida no tenant.",
        },
        {
          label: "Financeiro",
          href: "/admin/financeiro",
          description: "Cruzar receita, cobrança e concentração por tenant.",
        },
        {
          label: "Relatórios",
          href: "/admin/relatorios",
          description: "Monitorar catálogo, demanda e inteligência de negócio.",
        },
      ],
    },
    {
      id: "auditar-uso",
      shortLabel: "Uso",
      title: "Auditar uso e risco",
      tooltip: "Acompanhar volume, custo, adoção e pontos de atenção do produto de IA.",
      description:
        "Cockpit futuro de uso da IA: consumo por tenant, custo por recurso, falhas, abuso e trilhas sensíveis.",
      rolloutStage: "NEXT",
      outcomes: [
        "Ler consumo por tenant e por recurso.",
        "Identificar abuso, risco e gaps operacionais.",
        "Cruzar billing, SLA e auditoria.",
      ],
      quickLinks: [
        {
          label: "Auditoria",
          href: "/admin/auditoria",
          description: "Ver rastros formais e eventos críticos da operação.",
        },
        {
          label: "Suporte",
          href: "/admin/suporte",
          description: "Cruzar rollout premium com incidentes e prioridades do suporte.",
        },
      ],
    },
    {
      id: "pesquisar-jurisprudencia",
      shortLabel: "Demo",
      title: "Pesquisa jurídica assistida",
      tooltip: "Visualizar a frente de valor jurídico que vai sustentar peças e fundamentos.",
      description:
        "Mesmo no shell admin, essa ação existe para orientar a construção do produto e a narrativa comercial da IA jurídica.",
      rolloutStage: "NEXT",
      outcomes: [
        "Definir a experiência de pesquisa assistida.",
        "Conectar precedentes, peças e validação de citações.",
        "Usar isso como argumento de valor premium.",
      ],
      quickLinks: [
        {
          label: "Causas admin",
          href: "/admin/causas",
          description: "Operação oficial de causas e catálogo base para inteligência jurídica.",
        },
        {
          label: "Juízes admin",
          href: "/admin/juizes",
          description: "Fonte premium que compõe a oferta jurídica avançada.",
        },
      ],
    },
  ];

  const priorityMap: Record<JuridicalAiDockContextId, JuridicalAiDockActionId[]> = {
    workspace: [],
    processos: [],
    documentos: [],
    jurisprudencia: [],
    peticoes: [],
    contratos: [],
    clientes: [],
    governanca: ["governanca-ia", "auditar-uso", "monetizacao-premium", "pesquisar-jurisprudencia"],
    monetizacao: ["monetizacao-premium", "governanca-ia", "auditar-uso", "pesquisar-jurisprudencia"],
    inteligencia: ["governanca-ia", "monetizacao-premium", "auditar-uso", "pesquisar-jurisprudencia"],
  };

  const desiredOrder = priorityMap[context.id];
  return [...actions].sort(
    (left, right) => {
      const leftIndex = desiredOrder.indexOf(left.id);
      const rightIndex = desiredOrder.indexOf(right.id);

      return (
        (leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex) -
        (rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex)
      );
    },
  );
}

export function getJuridicalAiDockActions(
  pathname: string,
  scope: JuridicalAiDockScope,
): JuridicalAiDockAction[] {
  const context = resolveJuridicalAiDockContext(pathname, scope);

  return scope === "admin"
    ? buildAdminActions(context)
    : buildTenantActions(context);
}

export function getJuridicalAiWorkspaceTabForAction(
  actionId: JuridicalAiDockActionId,
): JuridicalAiWorkspaceTab {
  switch (actionId) {
    case "nova-peca":
      return "peca";
    case "analisar-documento":
      return "documento";
    case "pesquisar-jurisprudencia":
      return "pesquisa";
    case "validar-citacoes":
      return "citacoes";
    case "calcular-sentenca":
      return "calculos";
    case "resumir-processo":
    case "estrategia-caso":
      return "pergunta";
    case "governanca-ia":
      return "historico";
    case "monetizacao-premium":
      return "historico";
    case "auditar-uso":
      return "historico";
    default:
      return "pergunta";
  }
}

export function getJuridicalAiTaskForAction(
  actionId: JuridicalAiDockActionId,
): JuridicalAiTaskKey {
  switch (actionId) {
    case "nova-peca":
      return "PIECE_DRAFTING";
    case "analisar-documento":
      return "DOCUMENT_ANALYSIS";
    case "pesquisar-jurisprudencia":
      return "JURISPRUDENCE_BRIEF";
    case "validar-citacoes":
      return "CITATION_VALIDATION";
    case "calcular-sentenca":
      return "SENTENCE_CALCULATION";
    case "resumir-processo":
      return "PROCESS_SUMMARY";
    case "estrategia-caso":
      return "CASE_STRATEGY";
    case "governanca-ia":
    case "monetizacao-premium":
    case "auditar-uso":
      return "PIECE_DRAFTING";
    default:
      return "QUESTION_ANSWERING";
  }
}

export function getJuridicalAiAdminTabForAction(
  actionId: JuridicalAiDockActionId,
): JuridicalAiAdminTab {
  switch (actionId) {
    case "governanca-ia":
      return "rollout";
    case "auditar-uso":
      return "executions";
    case "monetizacao-premium":
      return "usage";
    default:
      return "cockpit";
  }
}

function extractProcessIdFromPath(pathname: string) {
  const processMatch = pathname.match(/^\/processos\/([^/?#]+)/);
  return processMatch?.[1] ?? null;
}

export function buildJuridicalAiWorkspaceHref(params: {
  pathname: string;
  scope: JuridicalAiDockScope;
  actionId: JuridicalAiDockActionId;
}) {
  const searchParams = new URLSearchParams({
    action: params.actionId,
    returnTo: params.pathname,
  });

  if (params.scope === "admin") {
    searchParams.set("tab", getJuridicalAiAdminTabForAction(params.actionId));
    return `/admin/magic-ai?${searchParams.toString()}`;
  }

  searchParams.set("tab", getJuridicalAiWorkspaceTabForAction(params.actionId));

  const processId = extractProcessIdFromPath(params.pathname);
  if (processId) {
    searchParams.set("processId", processId);
  }

  return `/magic-ai?${searchParams.toString()}`;
}
