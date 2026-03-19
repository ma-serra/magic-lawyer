import type {
  JuridicalAiCitationCheck,
  JuridicalAiResearchPlan,
  JuridicalAiSentenceCalculationResult,
  JuridicalAiSourceLead,
  JuridicalAiTaskKey,
} from "@/app/lib/juridical-ai/types";
import {
  buildCaseMemoryVerificationLinks,
  buildCausaVerificationLinks,
  buildCitationVerificationLinks,
  buildDocumentVerificationLinks,
  buildModelVerificationLinks,
  buildProcessVerificationLinks,
  buildResearchVerificationLinks,
} from "@/app/lib/juridical-ai/verifiable-sources";

type BaseEngineInput = {
  taskKey: JuridicalAiTaskKey;
  question?: string | null;
  objective?: string | null;
  pieceType?: string | null;
  title?: string | null;
  thesis?: string | null;
  strategy?: string | null;
  facts?: string | null;
  notes?: string | null;
  documentText?: string | null;
  documentId?: string | null;
  documentName?: string | null;
  modelId?: string | null;
  modelName?: string | null;
  modelContent?: string | null;
  processContext?: {
    id?: string | null;
    numero?: string | null;
    numeroCnj?: string | null;
    titulo?: string | null;
    descricao?: string | null;
    fase?: string | null;
    status?: string | null;
    area?: string | null;
    cliente?: string | null;
    tribunal?: string | null;
    rito?: string | null;
    prazoPrincipal?: string | null;
    documentosCount?: number;
    movimentacoesCount?: number;
    causas?: Array<{
      nome: string;
      codigoCnj?: string | null;
      isOficial?: boolean;
      principal?: boolean;
    }>;
    documentos?: Array<{
      id?: string | null;
      nome: string;
      tipo?: string | null;
    }>;
  } | null;
  caseMemory?: {
    title?: string | null;
    summary?: string | null;
  } | null;
};

type LocalPieceResult = {
  type: "piece";
  title: string;
  summary: string;
  contentMarkdown: string;
  citations: string[];
  pendingReview: string[];
  sourceLeads?: JuridicalAiSourceLead[];
  confidenceScore: number;
};

type LocalAnalysisResult = {
  type: "analysis";
  summary: string;
  findings: Array<{
    label: string;
    detail: string;
    severity: "LOW" | "MEDIUM" | "HIGH";
  }>;
  riskFlags: string[];
  recommendations: string[];
  confidenceScore: number;
};

type LocalGenericResult = {
  type: "generic";
  summary: string;
  contentMarkdown: string;
  bullets: string[];
  citationChecks?: JuridicalAiCitationCheck[];
  researchPlan?: JuridicalAiResearchPlan;
  sentenceCalculation?: JuridicalAiSentenceCalculationResult;
  sourceLeads?: JuridicalAiSourceLead[];
  confidenceScore: number;
};

export type JuridicalAiEngineResult =
  | LocalPieceResult
  | LocalAnalysisResult
  | LocalGenericResult;

function normalizeText(value?: string | null) {
  return value?.trim() || "";
}

function firstParagraph(value: string) {
  return value
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .find(Boolean) || "";
}

function extractBullets(value: string, limit = 6) {
  return value
    .split(/\n+/)
    .map((item) => item.replace(/^[-*•\d.)\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, limit);
}

function collectCitations(value: string) {
  const matches = value.match(
    /\b(?:art\.?\s*\d+[A-Za-zº°]*|lei\s*n[ºo]?\s*[\d./-]+|STJ|STF|TJ[A-Z]{2}|TRT[-\w]*)\b/gi,
  );

  return Array.from(new Set((matches || []).map((item) => item.trim()))).slice(
    0,
    8,
  );
}

function detectRiskFlags(value: string) {
  const normalized = value.toLowerCase();
  const flags: string[] = [];
  const patterns: Array<[RegExp, string]> = [
    [/\bmulta\b/, "Ha mencao a multa ou penalidade contratual/processual."],
    [/\brescis[aã]o\b/, "O texto menciona rescisao, rompimento ou encerramento."],
    [/\bprazo\b/, "O texto traz referencia a prazo ou marco temporal."],
    [/\binadimplemento\b|\bmora\b/, "Existe risco ligado a inadimplemento ou mora."],
    [/\bforo\b|\bcompet[eê]ncia\b/, "Ha clausula ou referencia de foro/competencia."],
    [/\bconfidencialidade\b|\bsigilo\b/, "O conteudo envolve sigilo ou confidencialidade."],
  ];

  for (const [pattern, label] of patterns) {
    if (pattern.test(normalized)) {
      flags.push(label);
    }
  }

  return flags;
}

function normalizeReference(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function inferLegalCitationStatus(reference: string): JuridicalAiCitationCheck {
  const normalized = normalizeReference(reference);
  const lower = normalized.toLowerCase();
  const hasDiploma =
    /\blei\b/.test(lower) ||
    /\b(cpc|cpp|clt|cdc|cc|cf|constitui[cç][aã]o federal|c[oó]digo)/.test(lower);
  const hasArticle = /\bart\.?|\bartigo\b/.test(lower);

  if (/\blei\b/.test(lower) && /\d+/.test(lower)) {
    return {
      label: normalized,
      normalizedReference: normalized,
      sourceType: "LEGAL",
      status: "CONFIRMAVEL",
      rationale: "A referência indica diploma legal identificável por número.",
      guidance: "Conferir apenas se o número da lei e o dispositivo citado estão corretos.",
    };
  }

  if (hasArticle && hasDiploma) {
    return {
      label: normalized,
      normalizedReference: normalized,
      sourceType: "LEGAL",
      status: "CONFIRMAVEL",
      rationale: "A referência combina dispositivo com diploma jurídico identificável.",
      guidance: "Validar redação do artigo e aderência ao caso concreto.",
    };
  }

  return {
    label: normalized,
    normalizedReference: normalized,
    sourceType: "LEGAL",
    status: "INCOMPLETA",
    rationale: "A referência menciona dispositivo, mas não identifica claramente o diploma.",
    guidance: "Indique o diploma completo, como CPC, CLT, CDC, Constituição ou número da lei.",
  };
}

function inferJurisprudenceStatus(reference: string): JuridicalAiCitationCheck {
  const normalized = normalizeReference(reference);
  const lower = normalized.toLowerCase();
  const hasTribunal = /\b(stj|stf|tj[a-z]{2}|trf-?\d|trt-?\d|tst)\b/i.test(normalized);
  const hasCaseMarker =
    /\b(resp|aresp|agint|agravo|tema|hc|rms|apela[cç][aã]o|recurso)\b/i.test(normalized) ||
    /\d{4,}/.test(normalized);

  if (hasTribunal && hasCaseMarker) {
    return {
      label: normalized,
      normalizedReference: normalized,
      sourceType: "JURISPRUDENCE",
      status: "CONFIRMAVEL",
      rationale: "A referência traz tribunal e marcador processual suficiente para rastreamento inicial.",
      guidance: "Conferir número completo, órgão julgador e ementa antes de usar na peça.",
    };
  }

  if (hasTribunal || /\btema\b/.test(lower)) {
    return {
      label: normalized,
      normalizedReference: normalized,
      sourceType: "JURISPRUDENCE",
      status: "INCOMPLETA",
      rationale: "Há indício de precedente, mas faltam dados mínimos de identificação.",
      guidance: "Acrescente tribunal, número, tema, relator ou classe processual.",
    };
  }

  return {
    label: normalized,
    normalizedReference: normalized,
    sourceType: "JURISPRUDENCE",
    status: "FRAGIL",
    rationale: "A citação parece jurisprudencial, mas está genérica demais para ser defensável.",
    guidance: "Substitua por precedente específico e verificável.",
  };
}

function inferDoutrinaStatus(reference: string): JuridicalAiCitationCheck {
  const normalized = normalizeReference(reference);
  const hasAuthorAndWork =
    /[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]+\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]+/.test(reference) &&
    /ed\.|edi[cç][aã]o|manual|tratado|curso/i.test(reference);

  return {
    label: normalized,
    normalizedReference: normalized,
    sourceType: "DOUTRINA",
    status: hasAuthorAndWork ? "INCOMPLETA" : "FRAGIL",
    rationale: hasAuthorAndWork
      ? "Há indícios de autor e obra, mas sem elementos completos de conferência."
      : "A menção doutrinária está genérica e sem obra claramente identificada.",
    guidance: hasAuthorAndWork
      ? "Complemente com obra, edição, capítulo e página quando houver."
      : "Informe autor, obra, edição e trecho/página para tornar a referência útil.",
  };
}

function buildCitationChecks(text: string, processTribunal?: string | null) {
  const candidates = new Map<string, JuridicalAiCitationCheck>();
  const source = normalizeText(text);

  const legalPatterns = [
    /\bart\.?\s*\d+[A-Za-zº°-]*(?:\s*,?\s*§+\s*\d+)?(?:\s*,?\s*inc\.?\s*[IVXLCDM]+)?(?:\s+do\s+(?:CPC|CPP|CLT|CDC|CC|CF|Constituição Federal|Código Civil|Código de Processo Civil|Código Penal))?/gi,
    /\blei\s*n[ºo]?\s*[\d./-]+/gi,
  ];
  const diplomaMarkerPatterns = [
    /\bConstitui[cç][aã]o Federal\b/gi,
    /\bCPC\b/gi,
    /\bCPP\b/gi,
    /\bCLT\b/gi,
    /\bCDC\b/gi,
    /\bC[oó]digo Civil\b/gi,
    /\bC[oó]digo Penal\b/gi,
  ];
  const jurisprudencePatterns = [
    /\b(?:STJ|STF|TJ[A-Z]{2}|TRF-?\d|TRT-?\d|TST)\b[^.;\n]{0,80}(?:REsp|AREsp|AgInt|HC|Tema|Apelação|Agravo|Recurso)?[^.;\n]{0,80}/gi,
    /\b(?:REsp|AREsp|AgInt|HC|Tema)\b[^.;\n]{0,80}/gi,
  ];
  const doctrinePatterns = [
    /\b(?:Manual|Tratado|Curso)\b[^.;\n]{0,120}/gi,
    /[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]+\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]+[^.;\n]{0,90}(?:ed\.|edi[cç][aã]o|manual|tratado|curso)/g,
  ];

  for (const pattern of legalPatterns) {
    for (const match of source.matchAll(pattern)) {
      const reference = normalizeReference(match[0] || "");
      if (reference && !candidates.has(reference)) {
        candidates.set(reference, inferLegalCitationStatus(reference));
      }
    }
  }

  for (const pattern of diplomaMarkerPatterns) {
    for (const match of source.matchAll(pattern)) {
      const reference = normalizeReference(match[0] || "");
      if (reference && !candidates.has(reference)) {
        candidates.set(reference, inferLegalCitationStatus(reference));
      }
    }
  }

  for (const pattern of jurisprudencePatterns) {
    for (const match of source.matchAll(pattern)) {
      const reference = normalizeReference(match[0] || "");
      if (reference && !candidates.has(reference)) {
        candidates.set(reference, inferJurisprudenceStatus(reference));
      }
    }
  }

  for (const pattern of doctrinePatterns) {
    for (const match of source.matchAll(pattern)) {
      const reference = normalizeReference(match[0] || "");
      if (reference && !candidates.has(reference)) {
        candidates.set(reference, inferDoutrinaStatus(reference));
      }
    }
  }

  return Array.from(candidates.values())
    .map((item) => ({
      ...item,
      verificationLinks: buildCitationVerificationLinks(item, processTribunal),
    }))
    .slice(0, 12);
}

function uniqueList(values: Array<string | null | undefined>, limit = 8) {
  return Array.from(
    new Set(
      values
        .map((item) => item?.trim())
        .filter((item): item is string => Boolean(item)),
    ),
  ).slice(0, limit);
}

function tokenizeSearchTerms(value: string) {
  const stopWords = new Set([
    "a",
    "ao",
    "aos",
    "as",
    "com",
    "contra",
    "da",
    "das",
    "de",
    "do",
    "dos",
    "e",
    "em",
    "na",
    "nas",
    "no",
    "nos",
    "o",
    "os",
    "ou",
    "para",
    "por",
    "que",
    "sem",
    "sob",
  ]);

  return uniqueList(
    value
      .toLowerCase()
      .split(/[^a-z0-9áéíóúâêôãõç]+/i)
      .map((item) => item.trim())
      .filter((item) => item.length >= 4 && !stopWords.has(item)),
    6,
  );
}

function buildResearchQueries(baseTerms: string[], objective: string, notes: string) {
  const queries: string[] = [];
  const joinedTerms = baseTerms.slice(0, 3).join(" ");

  if (objective) {
    queries.push(objective);
  }

  if (joinedTerms) {
    queries.push(`"${joinedTerms}" entendimento consolidado`);
    queries.push(`"${joinedTerms}" precedente favoravel`);
    queries.push(`"${joinedTerms}" tese contraria`);
  }

  if (notes) {
    const noteTerms = tokenizeSearchTerms(notes).slice(0, 2).join(" ");
    if (noteTerms) {
      queries.push(`${joinedTerms || objective} ${noteTerms}`.trim());
    }
  }

  return uniqueList(queries, 6);
}

function buildResearchPlan(input: BaseEngineInput): JuridicalAiResearchPlan {
  const process = input.processContext;
  const objective = normalizeText(input.objective);
  const notes = normalizeText(input.notes);
  const baseTerms = tokenizeSearchTerms([objective, notes, process?.area, process?.titulo].filter(Boolean).join(" "));
  const primaryQueries = buildResearchQueries(baseTerms, objective, notes);
  const alternateQueries = uniqueList(
    [
      baseTerms.length > 0 ? `${baseTerms.join(" ")} divergência jurisprudencial` : null,
      baseTerms.length > 0 ? `${baseTerms.join(" ")} danos morais` : null,
      process?.rito ? `${objective} ${process.rito}` : null,
      process?.tribunal ? `${objective} ${process.tribunal}` : null,
    ],
    5,
  );

  const targetCourts = uniqueList(
    [
      process?.tribunal || null,
      process?.area ? `Tribunais com especialização em ${process.area}` : null,
      "STJ",
      "STF",
    ],
    5,
  );

  const favorableAngles = uniqueList(
    [
      objective ? `Buscar precedentes com aderência direta a: ${objective}.` : null,
      process?.fase ? `Filtrar julgados compatíveis com a fase ${process.fase}.` : null,
      notes ? `Aproveitar recortes do escritório: ${notes}.` : null,
      "Priorizar decisões com fundamentação repetida e linguagem aproveitável em peça.",
    ],
    4,
  );

  const opposingAngles = uniqueList(
    [
      "Mapear precedentes de improcedência ou restrição de tese semelhante.",
      process?.tribunal ? `Identificar posição restritiva específica do ${process.tribunal}.` : null,
      "Separar decisões que negam tutela, dano moral, nulidade ou inversão do ônus.",
      notes ? `Verificar se algum recorte do escritório pode gerar viés ou limitação: ${notes}.` : null,
    ],
    4,
  );

  const validationChecklist = uniqueList(
    [
      "Confirmar número do processo, tribunal, órgão julgador e data do julgamento.",
      "Checar se a ementa realmente sustenta a tese usada no argumento.",
      "Separar precedente dominante de julgado isolado antes de citar.",
      "Marcar distinções fáticas relevantes entre o caso do escritório e o precedente.",
      process?.numero ? `Confrontar os precedentes com o contexto do processo ${process.numero}.` : null,
    ],
    5,
  );

  return {
    objective: objective || "Pesquisa jurisprudencial ainda sem objetivo detalhado.",
    primaryQueries,
    alternateQueries,
    targetCourts,
    favorableAngles,
    opposingAngles,
    validationChecklist,
  };
}

function buildSourceLeads(
  input: BaseEngineInput,
  citationChecks?: JuridicalAiCitationCheck[],
  researchPlan?: JuridicalAiResearchPlan,
) {
  const process = input.processContext;
  const leads: JuridicalAiSourceLead[] = [];

  if (process?.numero || process?.numeroCnj) {
    leads.push({
      label: process.numeroCnj || process.numero || "Processo relacionado",
      sourceType: "PROCESSO",
      verificationLevel: "INTERNO",
      detail: [process.numero, process.numeroCnj, process.tribunal, process.fase]
        .filter(Boolean)
        .join(" • "),
      whyItMatters: "A resposta fica ancorada no processo real do tenant, e nao em caso hipotetico.",
      verificationLinks: buildProcessVerificationLinks({
        processId: process.id,
        tribunalSigla: process.tribunal,
      }),
    });
  }

  for (const causa of process?.causas ?? []) {
    leads.push({
      label: causa.nome,
      sourceType: "CAUSA_OFICIAL",
      verificationLevel: causa.isOficial ? "OFICIAL" : "INTERNO",
      detail: [
        causa.codigoCnj ? `CNJ ${causa.codigoCnj}` : null,
        causa.principal ? "principal" : null,
        causa.isOficial ? "catalogo oficial" : "catalogo interno",
      ]
        .filter(Boolean)
        .join(" • "),
      whyItMatters: "A tese e a pesquisa aproveitam o catalogo de causas vinculado ao processo.",
      verificationLinks: buildCausaVerificationLinks(causa.nome, causa.codigoCnj),
    });
  }

  for (const documento of process?.documentos ?? []) {
    leads.push({
      label: documento.nome,
      sourceType: "DOCUMENTO_INTERNO",
      verificationLevel: "INTERNO",
      detail: [documento.tipo, "documento do processo"].filter(Boolean).join(" • "),
      whyItMatters: "Existe material interno do escritorio para sustentar fatos, pedidos ou revisao da narrativa.",
      verificationLinks: buildDocumentVerificationLinks({
        documentId: documento.id,
        processId: process?.id,
      }),
    });
  }

  if (input.documentName) {
    leads.push({
      label: input.documentName,
      sourceType: "DOCUMENTO_INTERNO",
      verificationLevel: "INTERNO",
      detail: "documento informado diretamente no workspace",
      whyItMatters: "O rascunho ou a analise pode ser conferido contra o anexo escolhido pelo usuario.",
      verificationLinks: buildDocumentVerificationLinks({
        documentId: input.documentId,
        processId: process?.id,
      }),
    });
  }

  if (input.modelName) {
    leads.push({
      label: input.modelName,
      sourceType: "MODELO_INTERNO",
      verificationLevel: "INTERNO",
      detail: "modelo interno do escritorio",
      whyItMatters: "A IA reaproveita linguagem e estrutura do proprio acervo do escritorio.",
      verificationLinks: buildModelVerificationLinks(),
    });
  }

  if (input.caseMemory?.summary || input.caseMemory?.title) {
    leads.push({
      label: input.caseMemory?.title || "Memória do caso",
      sourceType: "MEMORIA_DO_CASO",
      verificationLevel: "INTERNO",
      detail: input.caseMemory?.summary || "resumo persistido do workspace",
      whyItMatters: "Garante continuidade entre execucoes anteriores do mesmo caso.",
      verificationLinks: buildCaseMemoryVerificationLinks(process?.id),
    });
  }

  for (const citation of citationChecks ?? []) {
    leads.push({
      label: citation.label,
      sourceType: "REFERENCIA_EXTRAIDA",
      verificationLevel:
        citation.status === "CONFIRMAVEL"
          ? "INDICATIVO"
          : citation.status === "INCOMPLETA"
            ? "INDICATIVO"
            : "INDICATIVO",
      detail: `${citation.sourceType} • ${citation.status}`,
      whyItMatters: citation.guidance,
      verificationLinks: citation.verificationLinks,
    });
  }

  if (input.taskKey === "JURISPRUDENCE_BRIEF") {
    for (const link of buildResearchVerificationLinks(researchPlan?.targetCourts ?? [])) {
      leads.push({
        label: link.label,
        sourceType: "REFERENCIA_EXTRAIDA",
        verificationLevel: "OFICIAL",
        detail: `${link.authority} • ${link.accessMode === "DIRECT" ? "acesso direto" : "pesquisa oficial"}`,
        whyItMatters:
          "Entrega um caminho oficial para o advogado conferir precedentes e entendimento do tribunal.",
        verificationLinks: [link],
      });
    }
  }

  return leads.slice(0, 8);
}

function interpolateModelContent(
  template: string,
  input: BaseEngineInput,
) {
  const variables: Record<string, string> = {
    processoNumero: input.processContext?.numero || "",
    processoNumeroCnj: input.processContext?.numeroCnj || "",
    processoTitulo: input.processContext?.titulo || "",
    clienteNome: input.processContext?.cliente || "",
    tesePrincipal: normalizeText(input.thesis),
    fatosRelevantes: normalizeText(input.facts),
    objetivoPeca: normalizeText(input.objective),
    rito: input.processContext?.rito || "",
    tribunal: input.processContext?.tribunal || "",
    areaDireito: input.processContext?.area || "",
  };

  let content = template;
  for (const [key, value] of Object.entries(variables)) {
    content = content.replace(new RegExp(`{{\\s*${key}\\s*}}`, "g"), value);
  }

  return content;
}

function buildPieceDraft(input: BaseEngineInput): LocalPieceResult {
  const processContext = input.processContext;
  const title =
    normalizeText(input.title) ||
    normalizeText(input.pieceType) ||
    "Rascunho juridico inicial";
  const facts = normalizeText(input.facts);
  const objective = normalizeText(input.objective);
  const thesis = normalizeText(input.thesis);
  const notes = normalizeText(input.notes);
  const strategy = normalizeText(input.strategy);
  const modelName = normalizeText(input.modelName);
  const documentName = normalizeText(input.documentName);

  const pendingReview = [
    !processContext?.numero ? "Confirmar numero do processo." : null,
    !processContext?.tribunal ? "Confirmar tribunal/competencia." : null,
    !objective ? "Detalhar objetivo da peca." : null,
    !thesis ? "Reforcar tese principal ou linha argumentativa." : null,
    !documentName ? "Anexar ou citar documento de apoio que sustente a narrativa." : null,
  ].filter((item): item is string => Boolean(item));

  const sections = [
    `# ${title}`,
    "## 1. Escopo do rascunho",
    objective || "Definir com mais clareza o objetivo juridico antes da versao final.",
    "## 2. Contexto do caso",
    [
      processContext?.numero
        ? `- Processo: ${processContext.numero}`
        : null,
      processContext?.numeroCnj
        ? `- CNJ: ${processContext.numeroCnj}`
        : null,
      processContext?.cliente
        ? `- Cliente: ${processContext.cliente}`
        : null,
      processContext?.tribunal
        ? `- Tribunal: ${processContext.tribunal}`
        : null,
      processContext?.area
        ? `- Area: ${processContext.area}`
        : null,
      processContext?.fase
        ? `- Fase: ${processContext.fase}`
        : null,
      processContext?.status
        ? `- Status: ${processContext.status}`
        : null,
      typeof processContext?.documentosCount === "number"
        ? `- Documentos relacionados: ${processContext.documentosCount}`
        : null,
      typeof processContext?.movimentacoesCount === "number"
        ? `- Movimentacoes mapeadas: ${processContext.movimentacoesCount}`
        : null,
    ]
      .filter(Boolean)
      .join("\n") || "- Complementar dados do processo.",
    modelName || documentName
      ? "## 3. Bases utilizadas"
      : null,
    modelName || documentName
      ? [
          modelName ? `- Modelo base: ${modelName}` : null,
          documentName ? `- Documento de apoio: ${documentName}` : null,
        ]
          .filter(Boolean)
          .join("\n")
      : null,
    "## 4. Fatos relevantes",
    facts || firstParagraph(processContext?.descricao || "") || "Descrever fatos centrais do caso.",
    "## 5. Tese principal",
    thesis || "Definir tese principal e fundamentos normativos antes do protocolo.",
    "## 6. Estrategia sugerida",
    strategy ||
      "Estruturar linha principal, reforcos documentais e pontos de resposta da parte contraria.",
    "## 7. Pontos de prova e sustentacao",
    [
      documentName
        ? `- Ancorar os fatos e pedidos no documento ${documentName}.`
        : "- Identificar documentos, prints, contratos ou notificacoes que comprovem a narrativa.",
      processContext?.movimentacoesCount
        ? "- Revisar a movimentacao mais recente para alinhar urgencia e pedido."
        : "- Conferir se ha andamento recente que altere a urgencia ou a estrategia.",
      "- Separar prova principal, prova complementar e eventual lacuna a suprir.",
    ].join("\n"),
    "## 8. Fundamentacao inicial",
    [
      "- Organizar fundamentos legais e jurisprudenciais aplicaveis.",
      "- Validar todas as citacoes antes da versao final.",
      "- Ajustar o texto ao rito, foro e estilo do escritorio.",
    ].join("\n"),
    "## 9. Riscos e contrapontos",
    [
      "- Antecipar argumento defensivo da parte contraria.",
      "- Sinalizar ponto fragil que depende de prova adicional ou revisao humana.",
      "- Marcar precedente contrario relevante antes do protocolo.",
    ].join("\n"),
    "## 10. Pedidos e providencias",
    [
      "- Revisar pedidos principais e subsidiarios.",
      "- Conferir documentos essenciais antes da assinatura.",
      "- Validar se ha prazo sensivel ou urgencia processual.",
    ].join("\n"),
    notes ? "## 11. Observacoes do escritorio\n" + notes : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const baseFromModel = normalizeText(input.modelContent)
    ? `\n\n---\n\n## Base do modelo aplicado\n\n${interpolateModelContent(
        input.modelContent!,
        input,
      )}`
    : "";

  return {
    type: "piece",
    title,
    summary:
      "Rascunho inicial organizado com contexto do processo, prova, estrategia, contrapontos e checklist de revisao.",
    contentMarkdown: sections + baseFromModel,
    citations: collectCitations(`${thesis}\n${notes}\n${input.modelContent || ""}`),
    pendingReview,
    sourceLeads: buildSourceLeads(input),
    confidenceScore: pendingReview.length > 2 ? 62 : 76,
  };
}

function buildDocumentAnalysis(input: BaseEngineInput): LocalAnalysisResult {
  const documentText = normalizeText(input.documentText);
  const findings: LocalAnalysisResult["findings"] = [];

  if (documentText) {
    findings.push({
      label: "Resumo executivo",
      detail: firstParagraph(documentText).slice(0, 280) || "Sem trecho suficiente para resumo.",
      severity: "LOW",
    });
  }

  const bullets = extractBullets(documentText, 5);
  if (bullets.length > 0) {
    findings.push({
      label: "Pontos capturados",
      detail: bullets.join(" | "),
      severity: "MEDIUM",
    });
  }

  const riskFlags = detectRiskFlags(documentText);
  if (riskFlags.length > 0) {
    findings.push({
      label: "Alertas de risco",
      detail: riskFlags.join(" "),
      severity: "HIGH",
    });
  }

  const recommendations = [
    "Confirmar autoria, data e fonte do documento antes de usar como fundamento.",
    "Validar clausulas, prazo, multa, foro e obrigacoes sensiveis.",
    "Ligar a analise ao processo ou contrato correto antes de gerar peca.",
  ];

  return {
    type: "analysis",
    summary:
      input.documentName
        ? `Analise inicial pronta para ${input.documentName}.`
        : "Analise inicial pronta para o texto informado.",
    findings:
      findings.length > 0
        ? findings
        : [
            {
              label: "Conteudo insuficiente",
              detail:
                "Cole o texto do documento ou forneca trechos relevantes para uma analise util.",
              severity: "MEDIUM",
            },
          ],
    riskFlags,
    recommendations,
    confidenceScore: documentText.length > 500 ? 78 : 64,
  };
}

function extractSentenceSegments(text: string) {
  const source = normalizeText(text);
  if (!source) {
    return [];
  }

  const matches = Array.from(
    source.matchAll(/(?:^|\n)\s*([a-z])\)\s*([\s\S]*?)(?=(?:\n\s*[a-z]\)\s)|$)/gi),
  ).map((match) => normalizeReference(match[2] || ""));

  if (matches.length > 0) {
    return matches;
  }

  return source
    .split(/\n{2,}/)
    .map((item) => normalizeReference(item))
    .filter(Boolean)
    .slice(0, 8);
}

function detectSentenceCalculationNature(
  segment: string,
): JuridicalAiSentenceCalculationResult["condemnedItems"][number]["nature"] {
  const normalized = segment.toLowerCase();

  if (/improcedent/.test(normalized)) {
    return "IMPROCEDENCIA";
  }
  if (/danos?\s+morais|indeniza/.test(normalized)) {
    return "INDENIZACAO";
  }
  if (/restitui|devolu[cç][aã]o|repeti[cç][aã]o.*dobro/.test(normalized)) {
    return "RESTITUICAO";
  }
  if (/multa/.test(normalized) && /di[aá]ria/.test(normalized)) {
    return "MULTA";
  }
  if (/liberad[ao]|levantamento|depositad[ao]\s+em\s+ju[ií]zo/.test(normalized)) {
    return "LIBERACAO_DE_VALOR";
  }
  if (
    /determinar|declara|refaturamento|obrig|providencie|apresente|forne[cç]a|cumprir/.test(
      normalized,
    )
  ) {
    return "OBRIGACAO_DE_FAZER";
  }

  return "OUTRO";
}

function extractAmountMentioned(segment: string) {
  const match = segment.match(/R\$\s*[\d\.\,]+/i);
  return match ? normalizeReference(match[0]) : null;
}

function extractSentenceCorrectionRule(segment: string) {
  const normalized = segment.toLowerCase();

  if (/ipca-?e/.test(normalized)) {
    return "IPCA-E";
  }
  if (/ipca/.test(normalized)) {
    return "IPCA";
  }
  if (/inpc/.test(normalized)) {
    return "INPC";
  }
  if (/selic/.test(normalized) && !/juros\s+de\s+mora/.test(normalized)) {
    return "SELIC";
  }

  return "Confirmar índice na sentença";
}

function extractSentenceInterestRule(segment: string) {
  const normalized = segment.toLowerCase();

  if (/juros\s+de\s+mora.*selic/.test(normalized) && /deduzid[oa]\s+o\s+ipca/.test(normalized)) {
    return "SELIC, deduzido o IPCA";
  }
  if (/juros\s+de\s+mora.*selic/.test(normalized)) {
    return "SELIC";
  }
  if (/juros\s+de\s+mora/.test(normalized)) {
    return "Juros de mora conforme sentença";
  }
  if (/improcedent/.test(normalized)) {
    return "Não aplicável";
  }

  return "Confirmar juros aplicáveis";
}

function extractSentenceStartTrigger(segment: string) {
  const normalized = segment.toLowerCase();

  if (/pagamento\s+indevido/.test(normalized)) {
    return "Data do pagamento indevido";
  }
  if (/a\s+partir\s+da\s+cita[cç][aã]o|a\s+contar\s+da\s+cita[cç][aã]o/.test(normalized)) {
    return "Citação";
  }
  if (/desde\s+a\s+data\s+da\s+presente\s+senten[cç]a|desde\s+a\s+presente\s+senten[cç]a|arbitramento/.test(normalized)) {
    return "Sentença / arbitramento";
  }
  if (/prazo\s+de\s+\d+/.test(normalized)) {
    const match = segment.match(/prazo\s+de\s+[^,.;]+/i);
    return match ? normalizeReference(match[0]) : "Prazo judicial fixado";
  }

  return "Confirmar termo inicial";
}

function extractSentenceDependencies(segment: string) {
  const normalized = segment.toLowerCase();
  const dependencies: string[] = [];

  if (/m[eé]dia\s+de\s+consumo\s+dos\s+12\s+meses/.test(normalized)) {
    dependencies.push("Histórico de consumo dos 12 meses anteriores para refaturamento.");
  }
  if (/depositad[ao]\s+em\s+ju[ií]zo|levantamento/.test(normalized)) {
    dependencies.push("Extrato do depósito judicial e limite liberável apurado.");
  }
  if (/pagamento\s+indevido/.test(normalized)) {
    dependencies.push("Comprovantes de pagamento e datas de desembolso.");
  }
  if (/valor\s+que\s+vier\s+a\s+ser\s+apurado|limite\s+do\s+valor\s+que\s+vier\s+a\s+ser\s+apurado/.test(normalized)) {
    dependencies.push("Apuração complementar do valor-base antes da liquidação.");
  }
  if (/multa\s+di[aá]ria/.test(normalized)) {
    dependencies.push("Data de intimação, data de cumprimento e teto efetivo da multa.");
  }
  if (/danos?\s+morais|indeniza/.test(normalized) && !/R\$\s*[\d\.\,]+/i.test(segment)) {
    dependencies.push("Valor arbitrado da indenização ou critério fixado em sentença.");
  }

  return dependencies;
}

function buildSentenceCalculation(input: BaseEngineInput): JuridicalAiSentenceCalculationResult {
  const sourceText = [
    normalizeText(input.documentText),
    normalizeText(input.question),
    normalizeText(input.objective),
    normalizeText(input.notes),
  ]
    .filter(Boolean)
    .join("\n\n");

  const segments = extractSentenceSegments(sourceText);
  const condemnedItems = segments.map((segment) => {
    const nature = detectSentenceCalculationNature(segment);
    const amountMentioned = extractAmountMentioned(segment);
    const dependencies = extractSentenceDependencies(segment);
    const automationStatus: JuridicalAiSentenceCalculationResult["condemnedItems"][number]["automationStatus"] =
      nature === "IMPROCEDENCIA"
        ? "MANUAL"
        : dependencies.length > 0
          ? "DEPENDENTE_DE_DADOS"
          : amountMentioned
            ? "AUTO_ESTIMAVEL"
            : nature === "OBRIGACAO_DE_FAZER"
              ? "MANUAL"
              : "DEPENDENTE_DE_DADOS";

    return {
      label:
        nature === "OBRIGACAO_DE_FAZER"
          ? "Obrigação de fazer / ajuste operacional"
          : nature === "MULTA"
            ? "Multa diária / coercitiva"
            : nature === "LIBERACAO_DE_VALOR"
              ? "Liberação de valor depositado"
              : nature === "RESTITUICAO"
                ? "Restituição / repetição de indébito"
                : nature === "INDENIZACAO"
                  ? "Indenização"
                  : nature === "IMPROCEDENCIA"
                    ? "Pedido improcedente"
                    : "Comando da sentença",
      nature,
      basis: segment,
      amountMentioned,
      correctionRule: extractSentenceCorrectionRule(segment),
      interestRule: extractSentenceInterestRule(segment),
      startTrigger: extractSentenceStartTrigger(segment),
      dependencies,
      automationStatus,
    };
  });

  const calculableItems = condemnedItems
    .filter((item) => item.automationStatus === "AUTO_ESTIMAVEL")
    .map((item) => `${item.label}${item.amountMentioned ? ` • ${item.amountMentioned}` : ""}`);

  const requiredInputs = Array.from(
    new Set(
      condemnedItems.flatMap((item) => item.dependencies).filter(Boolean),
    ),
  );

  const manualReviewItems = [
    ...condemnedItems
      .filter((item) => item.nature === "OBRIGACAO_DE_FAZER" || item.nature === "IMPROCEDENCIA")
      .map((item) => `${item.label}: exige leitura jurídica e validação operacional.`),
    ...condemnedItems
      .filter((item) => item.automationStatus !== "AUTO_ESTIMAVEL")
      .map((item) => `${item.label}: revisar base de cálculo, índice e termo inicial.`),
  ].slice(0, 8);

  const favorableCount = condemnedItems.filter((item) => item.nature !== "IMPROCEDENCIA").length;
  const outcomeSummary =
    condemnedItems.length > 0
      ? `Sentença com ${favorableCount} item(ns) potencialmente executáveis e ${condemnedItems.filter((item) => item.nature === "IMPROCEDENCIA").length} item(ns) improcedentes ou sem liquidação automática.`
      : "Não foi possível extrair itens condenatórios confiáveis do texto informado.";

  const memorialDraft = [
    "## Memorial preliminar de cálculo",
    condemnedItems.length > 0
      ? condemnedItems
          .map((item, index) =>
            [
              `### ${index + 1}. ${item.label}`,
              `- Natureza: ${item.nature}`,
              `- Base da sentença: ${item.basis}`,
              `- Valor mencionado: ${item.amountMentioned ?? "Nao indicado na sentença"}`,
              `- Correção monetária: ${item.correctionRule}`,
              `- Juros: ${item.interestRule}`,
              `- Termo inicial: ${item.startTrigger}`,
              `- Status de automação: ${item.automationStatus}`,
              item.dependencies.length > 0
                ? `- Dependências: ${item.dependencies.join(" | ")}`
                : "- Dependências: nenhuma dependência adicional explícita detectada",
            ].join("\n"),
          )
          .join("\n\n")
      : "- Sentença sem itens estruturados suficientes para memorial preliminar.",
    requiredInputs.length > 0
      ? `\n## Insumos ainda obrigatórios\n${requiredInputs.map((item) => `- ${item}`).join("\n")}`
      : "\n## Insumos ainda obrigatórios\n- Nenhum insumo adicional explícito detectado para a estimativa inicial.",
  ].join("\n\n");

  return {
    outcomeSummary,
    condemnedItems,
    requiredInputs,
    calculableItems,
    manualReviewItems,
    memorialDraft,
  };
}

function buildGenericResult(input: BaseEngineInput): LocalGenericResult {
  const process = input.processContext;
  const citationChecks =
    input.taskKey === "CITATION_VALIDATION"
      ? buildCitationChecks(
          [input.question, input.objective, input.notes].filter(Boolean).join("\n"),
          process?.tribunal,
        )
      : undefined;
  const researchPlan =
    input.taskKey === "JURISPRUDENCE_BRIEF" ? buildResearchPlan(input) : undefined;
  const sentenceCalculation =
    input.taskKey === "SENTENCE_CALCULATION"
      ? buildSentenceCalculation(input)
      : undefined;
  const sourceLeads = buildSourceLeads(input, citationChecks, researchPlan);
  const contextBullets = [
    process?.numero ? `Processo ${process.numero}` : null,
    process?.cliente ? `Cliente ${process.cliente}` : null,
    process?.tribunal ? `Tribunal ${process.tribunal}` : null,
    input.objective ? `Objetivo: ${input.objective}` : null,
    input.question ? `Pergunta: ${input.question}` : null,
  ].filter((item): item is string => Boolean(item));

  const summaryMap: Record<JuridicalAiTaskKey, string> = {
    QUESTION_ANSWERING:
      "Resposta estruturada montada a partir do contexto atual do workspace.",
    CITATION_VALIDATION:
      citationChecks && citationChecks.length > 0
        ? "Mapa inicial de citações classificado por confiabilidade e necessidade de complementação."
        : "Nenhuma referência robusta foi detectada; o trecho precisa de revisão manual.",
    PROCESS_SUMMARY:
      "Resumo processual inicial preparado para leitura rapida.",
    CASE_STRATEGY:
      "Plano inicial de atuacao estruturado com riscos e proxima providencia.",
    JURISPRUDENCE_BRIEF:
      "Briefing de pesquisa jurisprudencial preparado para busca externa controlada.",
    SENTENCE_CALCULATION:
      sentenceCalculation && sentenceCalculation.condemnedItems.length > 0
        ? "Memorial preliminar da sentença estruturado com itens condenatórios, índices e dependências."
        : "O texto ainda não trouxe material suficiente para estruturar cálculo de sentença com segurança.",
    PIECE_DRAFTING:
      "Rascunho inicial preparado.",
    DOCUMENT_ANALYSIS:
      "Analise inicial preparada.",
  };

  const bulletsMap: Record<JuridicalAiTaskKey, string[]> = {
    QUESTION_ANSWERING: [
      "Responder apenas com base no contexto conhecido do tenant e do caso.",
      "Sinalizar pontos que dependem de revisao humana ou busca adicional.",
      "Evitar conclusao definitiva sem prova ou referencia verificada.",
    ],
    CITATION_VALIDATION: [
      ...(citationChecks && citationChecks.length > 0
        ? citationChecks.slice(0, 4).map(
            (item) => `${item.status}: ${item.normalizedReference} — ${item.guidance}`,
          )
        : [
            "Separar referencias textuais, legais e jurisprudenciais.",
            "Marcar como fragil qualquer citacao sem origem suficiente.",
            "Revisar texto final antes de usar em peticao ou parecer.",
          ]),
    ],
    PROCESS_SUMMARY: [
      process?.fase ? `Fase atual: ${process.fase}.` : "Confirmar fase do processo.",
      process?.status ? `Status registrado: ${process.status}.` : "Confirmar status do processo.",
      process?.prazoPrincipal
        ? `Prazo principal mapeado em ${process.prazoPrincipal}.`
        : "Verificar se existe prazo sensivel em aberto.",
    ],
    CASE_STRATEGY: [
      "Definir tese principal e alternativa.",
      "Mapear reforcos documentais antes de protocolar.",
      "Conectar a proxima providencia ao andamento mais recente.",
    ],
    JURISPRUDENCE_BRIEF: [
      ...(researchPlan
        ? [
            `Consulta principal: ${researchPlan.primaryQueries[0] ?? researchPlan.objective}`,
            `Tribunais-alvo: ${researchPlan.targetCourts.join(", ") || "definir"}.`,
            `Checklist minimo: ${researchPlan.validationChecklist[0] ?? "conferir aderencia do precedente."}`,
          ]
        : [
            "Listar termos-chave e sinonimos para a busca.",
            "Definir tribunais, periodo e orgao julgador prioritarios.",
            "Validar cada precedente antes de usar em argumento escrito.",
          ]),
    ],
    SENTENCE_CALCULATION:
      sentenceCalculation && sentenceCalculation.condemnedItems.length > 0
        ? sentenceCalculation.condemnedItems.slice(0, 5).map((item) => {
            const amount = item.amountMentioned ? ` • ${item.amountMentioned}` : "";
            return `${item.label}${amount} • ${item.correctionRule} • ${item.startTrigger}`;
          })
        : [
            "Cole o dispositivo da sentença ou os comandos condenatórios principais.",
            "Confirme índices, juros e termo inicial antes de liquidar.",
            "Use o memorial preliminar apenas como apoio técnico, com revisão humana obrigatória.",
          ],
    PIECE_DRAFTING: [],
    DOCUMENT_ANALYSIS: [],
  };

  const bullets = bulletsMap[input.taskKey];
  const heading =
    input.taskKey === "JURISPRUDENCE_BRIEF"
      ? "## Briefing de pesquisa"
      : input.taskKey === "CASE_STRATEGY"
        ? "## Linha de atuacao sugerida"
        : input.taskKey === "PROCESS_SUMMARY"
          ? "## Leitura executiva do caso"
          : input.taskKey === "CITATION_VALIDATION"
            ? "## Validacao inicial"
            : input.taskKey === "SENTENCE_CALCULATION"
              ? "## Memorial preliminar da sentença"
            : "## Resposta estruturada";

  return {
    type: "generic",
    summary: summaryMap[input.taskKey],
    contentMarkdown: [
      heading,
      contextBullets.length > 0
        ? contextBullets.map((item) => `- ${item}`).join("\n")
        : "- Nenhum contexto automatico associado.",
      "",
      bullets.map((item) => `- ${item}`).join("\n"),
      researchPlan
        ? [
            "\n## Plano de pesquisa",
            `- Objetivo: ${researchPlan.objective}`,
            `- Consultas principais: ${researchPlan.primaryQueries.join(" | ") || "definir"}`,
            `- Tribunais alvo: ${researchPlan.targetCourts.join(", ") || "definir"}`,
          ].join("\n")
        : null,
      sentenceCalculation
        ? [
            "\n## Síntese do cálculo",
            `- ${sentenceCalculation.outcomeSummary}`,
            sentenceCalculation.calculableItems.length > 0
              ? `- Itens com estimativa inicial: ${sentenceCalculation.calculableItems.join(" | ")}`
              : "- Nenhum item está pronto para estimativa automática sem dados adicionais.",
            sentenceCalculation.requiredInputs.length > 0
              ? `- Insumos pendentes: ${sentenceCalculation.requiredInputs.join(" | ")}`
              : "- Sem insumos pendentes explícitos para a leitura inicial.",
            "\n" + sentenceCalculation.memorialDraft,
          ].join("\n")
        : null,
      input.notes ? `\n## Observacoes\n${input.notes}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
    bullets,
    citationChecks,
    researchPlan,
    sentenceCalculation,
    sourceLeads,
    confidenceScore:
      input.taskKey === "JURISPRUDENCE_BRIEF"
        ? 68
        : input.taskKey === "SENTENCE_CALCULATION"
          ? sentenceCalculation && sentenceCalculation.condemnedItems.length > 0
            ? 79
            : 55
        : input.taskKey === "CITATION_VALIDATION"
          ? citationChecks && citationChecks.some((item) => item.status === "FRAGIL")
            ? 58
            : 73
          : 74,
  };
}

export function runLocalJuridicalAiEngine(
  input: BaseEngineInput,
): JuridicalAiEngineResult {
  switch (input.taskKey) {
    case "PIECE_DRAFTING":
      return buildPieceDraft(input);
    case "DOCUMENT_ANALYSIS":
      return buildDocumentAnalysis(input);
    default:
      return buildGenericResult(input);
  }
}

export function isOpenAiProviderConfigured() {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}
