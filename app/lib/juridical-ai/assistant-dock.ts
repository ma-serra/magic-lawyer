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
        label: "Governanca e risco",
        description:
          "Camada sensivel da plataforma. Aqui a Neon Lex deve enfatizar auditoria, rastreabilidade, custos e politica de uso.",
        promptHint:
          "Priorizar governanca, logs, risco juridico, billing e protecao operacional.",
      };
    }

    if (hasPrefix(pathname, ["/admin/pacotes", "/admin/financeiro"])) {
      return {
        id: "monetizacao",
        label: "Monetizacao premium",
        description:
          "Contexto comercial e financeiro. O foco aqui e oferta premium, pacotes, conversao e rentabilidade da IA juridica.",
        promptHint:
          "Priorizar pricing, conversao, upsell e leitura economica da oferta premium.",
      };
    }

    return {
      id: "inteligencia",
      label: "Operacao e inteligencia",
      description:
        "Visao global da operacao. O super admin deve acompanhar rollout, telemetria, adocao e governanca da IA juridica.",
      promptHint:
        "Priorizar rollout da IA, adocao por tenant, metricas, auditoria e catalogo premium.",
    };
  }

  if (hasPrefix(pathname, ["/processos", "/processo", "/andamentos"])) {
    return {
      id: "processos",
      label: "Processos e andamentos",
      description:
        "A Neon Lex deve entrar pelo caso, conectando fatos, andamentos, documentos e a proxima providencia processual.",
      promptHint:
        "Priorizar resumo do caso, estrategia, peca contextual e proxima acao processual.",
    };
  }

  if (hasPrefix(pathname, ["/documentos"])) {
    return {
      id: "documentos",
      label: "Documentos e anexos",
      description:
        "Contexto documental. A IA deve ler rapido, extrair sinais importantes e transformar anexos em insumo juridico util.",
      promptHint:
        "Priorizar analise documental, comparacao, resumo e extracao de fatos e riscos.",
    };
  }

  if (hasPrefix(pathname, ["/causas", "/juizes"])) {
    return {
      id: "jurisprudencia",
      label: "Pesquisa e fundamentos",
      description:
        "Contexto de pesquisa juridica. Aqui a Neon Lex deve orientar precedentes, fundamentos e validacao de referencias.",
      promptHint:
        "Priorizar jurisprudencia, fundamentos, precedentes favoraveis e validacao de referencias.",
    };
  }

  if (hasPrefix(pathname, ["/peticoes", "/modelos-peticao"])) {
    return {
      id: "peticoes",
      label: "Pecas e modelos",
      description:
        "Contexto de redacao juridica. A IA deve organizar tese, estrutura, tom e revisao antes da peca ganhar forma final.",
      promptHint:
        "Priorizar geracao de peca, estrutura argumentativa e coerencia juridica.",
    };
  }

  if (hasPrefix(pathname, ["/contratos", "/procuracoes"])) {
    return {
      id: "contratos",
      label: "Contratos e instrumentos",
      description:
        "Contexto contratual. A Neon Lex deve acelerar leitura, revisao, minuta e avaliacao de risco documental.",
      promptHint:
        "Priorizar analise de clausulas, revisao, minuta e riscos documentais.",
    };
  }

  if (hasPrefix(pathname, ["/clientes"])) {
    return {
      id: "clientes",
      label: "Clientes e contexto factual",
      description:
        "Contexto de relacionamento e historico. A IA deve consolidar fatos, documentos e visao estrategica por cliente.",
      promptHint:
        "Priorizar historico, fatos relevantes, contexto do cliente e proximos passos.",
    };
  }

  return {
    id: "workspace",
    label: "Central juridica do escritorio",
    description:
      "Ponto central da Neon Lex para criar pecas, ler documentos, resumir casos e orientar a proxima jogada juridica.",
    promptHint:
      "Priorizar organizacao do trabalho juridico, clareza operacional e geracao assistida com lastro.",
  };
}

function buildTenantActions(context: JuridicalAiDockContext): JuridicalAiDockAction[] {
  const actions: JuridicalAiDockAction[] = [
    {
      id: "nova-peca",
      shortLabel: "Peca",
      title: "Construir nova peca",
      tooltip: "Montar peticao, manifestacao, recurso ou minuta com contexto real do caso.",
      description:
        "Fluxo de redacao assistida da Neon Lex para reunir caso, documentos, fundamentos e estilo do escritorio antes da primeira versao.",
      rolloutStage: "FOUNDATION",
      outcomes: [
        "Escolher tipo de peca, rito e objetivo.",
        "Montar briefing do caso com fatos e documentos.",
        "Gerar rascunho auditavel com historico de versoes.",
      ],
      quickLinks: [
        {
          label: "Modelos de peticao",
          href: "/modelos-peticao",
          description: "Base atual de modelos enquanto a geracao assistida ganha profundidade.",
        },
        {
          label: "Peticoes",
          href: "/peticoes",
          description: "Acompanhar pecas que ja foram produzidas ou revisadas.",
        },
        {
          label: "Processos",
          href: "/processos",
          description: "Voltar ao caso e reunir o contexto que vai alimentar a peca.",
        },
      ],
    },
    {
      id: "analisar-documento",
      shortLabel: "Doc",
      title: "Analisar documento",
      tooltip: "Ler anexos, extrair fatos, riscos, clausulas e pontos sensiveis.",
      description:
        "Leitura juridica assistida para contratos, decisoes, laudos, notificacoes e pecas de terceiros.",
      rolloutStage: "FOUNDATION",
      outcomes: [
        "Resumir o documento em linguagem operacional.",
        "Apontar riscos, lacunas e obrigacoes.",
        "Preparar insumos para pecas, contratos e estrategia.",
      ],
      quickLinks: [
        {
          label: "Documentos",
          href: "/documentos",
          description: "Entrar no acervo e escolher os anexos que vao alimentar a IA.",
        },
        {
          label: "Contratos",
          href: "/contratos",
          description: "Revisar instrumentos contratuais e historico relacionado.",
        },
        {
          label: "Procuracoes",
          href: "/procuracoes",
          description: "Consultar instrumentos e documentos de representacao.",
        },
      ],
    },
    {
      id: "pesquisar-jurisprudencia",
      shortLabel: "Juris",
      title: "Mapear jurisprudencia",
      tooltip: "Encontrar precedentes, organizar fundamentos e amadurecer a tese.",
      description:
        "Camada de pesquisa assistida para localizar precedentes uteis, resumir entendimento e fortalecer a argumentacao.",
      rolloutStage: "NEXT",
      outcomes: [
        "Buscar precedentes por tese, tema e tribunal.",
        "Montar sintese favoravel e contraria.",
        "Enviar referencias relevantes para a peca e o resumo do caso.",
      ],
      quickLinks: [
        {
          label: "Causas",
          href: "/causas",
          description: "Entrar no radar oficial de causas e no catalogo juridico do escritorio.",
        },
        {
          label: "Juizes",
          href: "/juizes",
          description: "Cruzar atuacao, perfis e inteligencia ligada ao caso.",
        },
        {
          label: "Relatorios",
          href: "/relatorios",
          description: "Voltar aos indicadores e recortes estrategicos ja disponiveis.",
        },
      ],
    },
    {
      id: "validar-citacoes",
      shortLabel: "Citar",
      title: "Validar citacoes",
      tooltip: "Conferir referencia, origem e confianca antes de usar na peca.",
      description:
        "Validador juridico pensado para impedir citacao inventada, referencia fragil ou fundamento sem fonte rastreavel.",
      rolloutStage: "NEXT",
      outcomes: [
        "Marcar citacao como confirmada, parcial ou nao confirmada.",
        "Apontar fonte e contexto de uso.",
        "Reduzir risco de peca com fundamento nao rastreado.",
      ],
      quickLinks: [
        {
          label: "Causas",
          href: "/causas",
          description: "Consultar fundamentos e apoiar a conferencia das referencias.",
        },
        {
          label: "Peticoes",
          href: "/peticoes",
          description: "Retornar a peca e revisar o texto com base nas referencias confirmadas.",
        },
      ],
    },
    {
      id: "calcular-sentenca",
      shortLabel: "Calc",
      title: "Ler sentenca",
      tooltip:
        "Ler dispositivo, separar condenacoes, indexadores e dependencias do memorial de calculo.",
      description:
        "Fluxo premium para decisoes civeis com condenacao, obrigacao de fazer, danos morais, restituicao e atualizacao monetaria.",
      rolloutStage: "NEXT",
      outcomes: [
        "Extrair itens condenatorios e improcedencias.",
        "Classificar correcao, juros e termo inicial.",
        "Gerar memorial preliminar e lista do que ainda depende de dado humano.",
      ],
      quickLinks: [
        {
          label: "Documentos",
          href: "/documentos",
          description: "Selecionar a sentenca ou decisao que sera lida pela IA.",
        },
        {
          label: "Financeiro",
          href: "/financeiro",
          description: "Cruzar o resultado com a leitura financeira e recebiveis do caso.",
        },
        {
          label: "Processos",
          href: "/processos",
          description: "Voltar ao processo para anexar memorial, peca ou providencia seguinte.",
        },
      ],
    },
    {
      id: "resumir-processo",
      shortLabel: "Resumo",
      title: "Resumir processo",
      tooltip: "Consolidar fatos, andamentos, documentos e proximos passos do caso.",
      description:
        "Resumo executivo ligado ao processo atual, com leitura util para advogado, coordenacao e operacao.",
      rolloutStage: "FOUNDATION",
      outcomes: [
        "Gerar visao rapida do caso e da fase processual.",
        "Listar fatos relevantes, riscos e pendencias.",
        "Sugerir proxima providencia ligada ao andamento.",
      ],
      quickLinks: [
        {
          label: "Processos",
          href: "/processos",
          description: "Entrar no caso e selecionar o processo base para a sintese futura.",
        },
        {
          label: "Andamentos",
          href: "/andamentos",
          description: "Cruzar a linha do tempo com a proxima acao sugerida.",
        },
      ],
    },
    {
      id: "estrategia-caso",
      shortLabel: "Plano",
      title: "Tracar estrategia do caso",
      tooltip: "Cruzar fatos, documentos e precedentes para sugerir linha de atuacao.",
      description:
        "Camada estrategica da Neon Lex para consolidar tese, riscos, contradicoes e proximos movimentos do caso.",
      rolloutStage: "NEXT",
      outcomes: [
        "Estruturar tese principal e alternativas.",
        "Apontar pontos frageis e reforcos documentais.",
        "Sugerir acoes processuais e documentais.",
      ],
      quickLinks: [
        {
          label: "Dashboard",
          href: "/dashboard",
          description: "Voltar ao cockpit do escritorio para entender contexto e prioridades.",
        },
        {
          label: context.id === "processos" ? "Processos" : "Relatorios",
          href: context.id === "processos" ? "/processos" : "/relatorios",
          description:
            context.id === "processos"
              ? "Retomar o caso e seus documentos."
              : "Cruzar a estrategia com o recorte operacional ja disponivel.",
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

  return [...actions].sort((left, right) => {
    const leftIndex = desiredOrder.indexOf(left.id);
    const rightIndex = desiredOrder.indexOf(right.id);

    return (
      (leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex) -
      (rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex)
    );
  });
}

function buildAdminActions(context: JuridicalAiDockContext): JuridicalAiDockAction[] {
  const actions: JuridicalAiDockAction[] = [
    {
      id: "governanca-ia",
      shortLabel: "Gov",
      title: "Governanca da IA juridica",
      tooltip: "Controlar riscos, trilhas, politica de uso e rollout da camada premium.",
      description:
        "Painel do super admin para auditoria, logs, protecao operacional e regras da Neon Lex.",
      rolloutStage: "FOUNDATION",
      outcomes: [
        "Versionar prompts e regras de uso.",
        "Auditar quem gerou o que, quando e com quais insumos.",
        "Controlar permissoes, rollout e risco juridico.",
      ],
      quickLinks: [
        {
          label: "Auditoria",
          href: "/admin/auditoria",
          description: "Trilha critica, emails, webhooks, crons e acoes sensiveis.",
        },
        {
          label: "Relatorios",
          href: "/admin/relatorios",
          description: "Visao executiva para adocao, uso e operacao do produto.",
        },
        {
          label: "Configuracoes",
          href: "/admin/configuracoes",
          description: "Base para centralizar politicas globais da plataforma.",
        },
      ],
    },
    {
      id: "monetizacao-premium",
      shortLabel: "R$",
      title: "Monetizacao premium",
      tooltip: "Organizar oferta, cobranca, upgrade e captura de valor da IA juridica.",
      description:
        "Linha comercial da IA juridica: pricing, tiers, cobranca, upsell e rentabilidade por tenant.",
      rolloutStage: "FOUNDATION",
      outcomes: [
        "Definir pacote Essencial, Profissional e Premium.",
        "Conectar billing, franquias e limites de uso.",
        "Medir adocao, receita e expansao por tenant.",
      ],
      quickLinks: [
        {
          label: "Pacotes",
          href: "/admin/pacotes",
          description: "Montar a oferta premium que sera vendida no tenant.",
        },
        {
          label: "Financeiro",
          href: "/admin/financeiro",
          description: "Cruzar receita, cobranca e concentracao por tenant.",
        },
        {
          label: "Relatorios",
          href: "/admin/relatorios",
          description: "Monitorar catalogo, demanda e inteligencia de negocio.",
        },
      ],
    },
    {
      id: "auditar-uso",
      shortLabel: "Uso",
      title: "Auditar uso e risco",
      tooltip: "Acompanhar volume, custo, adocao e pontos de atencao do produto de IA.",
      description:
        "Cockpit de uso da IA para acompanhar consumo por tenant, custo por recurso, falhas, abuso e trilhas sensiveis.",
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
          description: "Ver rastros formais e eventos criticos da operacao.",
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
      title: "Pesquisa juridica assistida",
      tooltip: "Visualizar a frente de valor juridico que vai sustentar pecas e fundamentos.",
      description:
        "Mesmo no shell admin, essa acao ajuda a orientar a construcao do produto e a narrativa comercial da IA juridica.",
      rolloutStage: "NEXT",
      outcomes: [
        "Definir a experiencia de pesquisa assistida.",
        "Conectar precedentes, pecas e validacao de citacoes.",
        "Usar isso como argumento de valor premium.",
      ],
      quickLinks: [
        {
          label: "Causas admin",
          href: "/admin/causas",
          description: "Operacao oficial de causas e catalogo base para inteligencia juridica.",
        },
        {
          label: "Juizes admin",
          href: "/admin/juizes",
          description: "Fonte premium que compoe a oferta juridica avancada.",
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
    governanca: [
      "governanca-ia",
      "auditar-uso",
      "monetizacao-premium",
      "pesquisar-jurisprudencia",
    ],
    monetizacao: [
      "monetizacao-premium",
      "governanca-ia",
      "auditar-uso",
      "pesquisar-jurisprudencia",
    ],
    inteligencia: [
      "governanca-ia",
      "monetizacao-premium",
      "auditar-uso",
      "pesquisar-jurisprudencia",
    ],
  };

  const desiredOrder = priorityMap[context.id];
  return [...actions].sort((left, right) => {
    const leftIndex = desiredOrder.indexOf(left.id);
    const rightIndex = desiredOrder.indexOf(right.id);

    return (
      (leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex) -
      (rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex)
    );
  });
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
