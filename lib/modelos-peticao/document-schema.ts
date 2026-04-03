export type TenantBrandingDocumentSeed = {
  name?: string | null;
  logoUrl?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  accentColor?: string | null;
};

export type ModeloPeticaoPresetKey =
  | "custom"
  | "trabalhista-contestacao"
  | "criminal-resposta";

export type HeaderImageMode = "tenant_logo" | "custom_image" | "none";

export type ModeloPeticaoBodyBlockType =
  | "title"
  | "section"
  | "paragraph"
  | "signature"
  | "separator"
  | "image"
  | "unknown";

export interface ModeloPeticaoDocumentMedia {
  id: string;
  role: "header" | "body";
  url: string;
  source: "tenant_logo" | "custom_upload" | "external_url";
  alt: string;
}

export interface ModeloPeticaoBodyBlock {
  id: string;
  type: ModeloPeticaoBodyBlockType;
  title: string;
  html: string;
  plainText: string;
  level?: number;
}

export interface ModeloPeticaoDocumentJson {
  version: 1;
  page: {
    size: "A4";
    marginTop: number;
    marginRight: number;
    marginBottom: number;
    marginLeft: number;
    fontSize: number;
    lineHeight: number;
    fontFamily: string;
  };
  header: {
    imageMode: HeaderImageMode;
    customImageUrl: string | null;
    titleHtml: string;
    metadataHtml: string;
    showDivider: boolean;
    alignment: "left" | "center";
  };
  footer: {
    html: string;
    showDivider: boolean;
    alignment: "left" | "center";
  };
  media: ModeloPeticaoDocumentMedia[];
  bodyHtml: string;
  bodyBlocks: ModeloPeticaoBodyBlock[];
  preset: {
    key: ModeloPeticaoPresetKey;
    label: string;
  };
  partyVocabulary: {
    primaryPartyLabel: string;
    opposingPartyLabel: string;
    prosecutorLabel: string | null;
  };
}

export type ModeloPeticaoQuickBlock = {
  id: string;
  label: string;
  html: string;
};

export type ModeloPeticaoPresetDefinition = {
  key: ModeloPeticaoPresetKey;
  label: string;
  description: string;
  suggestedTipo: string | null;
  suggestedCategoria: string | null;
  partyVocabulary: ModeloPeticaoDocumentJson["partyVocabulary"];
  bodyHtml: string;
  quickBlocks: ModeloPeticaoQuickBlock[];
};

export const TEMPLATE_TOKEN_REGEX = /{{\s*([^{}]+?)\s*}}/g;

const DEFAULT_PAGE_SETTINGS = {
  size: "A4" as const,
  marginTop: 72,
  marginRight: 72,
  marginBottom: 68,
  marginLeft: 72,
  fontSize: 12,
  lineHeight: 1.7,
  fontFamily: '"Georgia", "Times New Roman", serif',
};

const DEFAULT_HEADER_METADATA_HTML =
  "<p>{{escritorio_email}}<br />{{escritorio_telefone}}<br />{{escritorio_endereco}}</p>";

const DEFAULT_FOOTER_HTML =
  "<p>{{escritorio_nome}}<br />{{escritorio_email}} | {{escritorio_telefone}}</p>";

export const MODELO_PETICAO_PRESETS: Record<
  ModeloPeticaoPresetKey,
  ModeloPeticaoPresetDefinition
> = {
  custom: {
    key: "custom",
    label: "Personalizado",
    description:
      "Estrutura neutra para peças diversas, com linguagem formal e seções genéricas.",
    suggestedTipo: null,
    suggestedCategoria: null,
    partyVocabulary: {
      primaryPartyLabel: "Parte autora",
      opposingPartyLabel: "Parte adversa",
      prosecutorLabel: null,
    },
    bodyHtml: [
      "<p>Excelentíssimo(a) Senhor(a) Doutor(a) Juiz(a) de Direito da {{vara_nome}} da Comarca de {{comarca_nome}}.</p>",
      '<h1 style="text-align:center">PETIÇÃO</h1>',
      "<p><strong>{{cliente_nome}}</strong>, já qualificado(a), nos autos do processo nº {{processo_numero_cnj}}, por seus advogados, vem, respeitosamente, à presença de Vossa Excelência, expor e requerer o que segue.</p>",
      "<h2>I. SÍNTESE</h2>",
      "<p>Apresente aqui o resumo objetivo da demanda e do momento processual.</p>",
      "<h2>II. FUNDAMENTAÇÃO</h2>",
      "<p>Desenvolva os fundamentos jurídicos essenciais para esta peça.</p>",
      "<h2>III. PEDIDOS</h2>",
      "<ol><li>Pedido principal.</li><li>Pedido subsidiário.</li><li>Requerimentos finais.</li></ol>",
      "<p>Nestes termos, pede deferimento.</p>",
      "<p>{{comarca_nome}}, {{data_atual}}.</p>",
      "<p>{{advogado_nome}}<br />OAB {{advogado_oab}}</p>",
    ].join(""),
    quickBlocks: [
      {
        id: "custom-qualification",
        label: "Qualificação",
        html: "<p><strong>{{cliente_nome}}</strong>, inscrito(a) sob {{cliente_documento}}, vem, por seus advogados, apresentar a presente manifestação.</p>",
      },
      {
        id: "custom-facts",
        label: "Fatos",
        html: "<h2>I. DOS FATOS</h2><p>Descreva aqui os fatos relevantes.</p>",
      },
      {
        id: "custom-grounds",
        label: "Fundamentos",
        html: "<h2>II. DOS FUNDAMENTOS JURÍDICOS</h2><p>Desenvolva os fundamentos jurídicos aplicáveis.</p>",
      },
      {
        id: "custom-orders",
        label: "Pedidos",
        html: "<h2>III. DOS PEDIDOS</h2><ol><li></li><li></li><li></li></ol>",
      },
      {
        id: "custom-signature",
        label: "Assinatura",
        html: "<p>{{comarca_nome}}, {{data_atual}}.</p><p>{{advogado_nome}}<br />OAB {{advogado_oab}}</p>",
      },
    ],
  },
  "trabalhista-contestacao": {
    key: "trabalhista-contestacao",
    label: "Contestação Trabalhista",
    description:
      "Estrutura de defesa trabalhista com vocabulário de reclamante e reclamada.",
    suggestedTipo: "TRABALHISTA",
    suggestedCategoria: "CONTESTACAO",
    partyVocabulary: {
      primaryPartyLabel: "Reclamada",
      opposingPartyLabel: "Reclamante",
      prosecutorLabel: null,
    },
    bodyHtml: [
      "<p>Excelentíssimo(a) Senhor(a) Doutor(a) Juiz(a) da {{vara_nome}} da {{comarca_nome}}.</p>",
      '<h1 style="text-align:center">CONTESTAÇÃO</h1>',
      "<p><strong>{{reclamada_nome}}</strong>, já qualificada, nos autos da reclamação trabalhista movida por <strong>{{reclamante_nome}}</strong>, processo nº {{processo_numero_cnj}}, por seus advogados, vem apresentar sua defesa.</p>",
      "<h2>I. DA SÍNTESE DA DEMANDA</h2>",
      "<p>Resuma aqui os pedidos formulados pelo reclamante e o contexto da ação.</p>",
      "<h2>II. DA REALIDADE DOS FATOS</h2>",
      "<p>Exponha a versão fática da reclamada, com objetividade e cronologia clara.</p>",
      "<h2>III. DAS PRELIMINARES E QUESTÕES PROCESSUAIS</h2>",
      "<p>Registre aqui eventuais preliminares, inépcia, prescrição, incompetência ou outros pontos processuais.</p>",
      "<h2>IV. DO MÉRITO</h2>",
      "<p>Desenvolva a impugnação de cada pedido, com base documental e legal.</p>",
      "<h2>V. DOS PEDIDOS</h2>",
      "<ol><li>Seja acolhida a presente contestação.</li><li>Sejam julgados improcedentes os pedidos formulados.</li><li>Sejam deferidas as provas cabíveis.</li></ol>",
      "<p>Nestes termos, pede deferimento.</p>",
      "<p>{{comarca_nome}}, {{data_atual}}.</p>",
      "<p>{{advogado_nome}}<br />OAB {{advogado_oab}}</p>",
    ].join(""),
    quickBlocks: [
      {
        id: "labor-defense-qualification",
        label: "Qualificação da reclamada",
        html: "<p><strong>{{reclamada_nome}}</strong>, nos autos da reclamação trabalhista ajuizada por <strong>{{reclamante_nome}}</strong>, vem apresentar contestação.</p>",
      },
      {
        id: "labor-defense-summary",
        label: "Síntese da demanda",
        html: "<h2>I. DA SÍNTESE DA DEMANDA</h2><p>Resuma aqui o pedido do reclamante.</p>",
      },
      {
        id: "labor-defense-facts",
        label: "Realidade dos fatos",
        html: "<h2>II. DA REALIDADE DOS FATOS</h2><p>Descreva a sequência fática sob a ótica da reclamada.</p>",
      },
      {
        id: "labor-defense-merits",
        label: "Impugnação de pedidos",
        html: "<h2>III. DO MÉRITO</h2><p>Impugne de forma individualizada os pedidos trabalhistas.</p>",
      },
      {
        id: "labor-defense-orders",
        label: "Pedidos finais",
        html: "<h2>IV. DOS PEDIDOS</h2><ol><li>Improcedência dos pedidos.</li><li>Produção de provas.</li></ol>",
      },
    ],
  },
  "criminal-resposta": {
    key: "criminal-resposta",
    label: "Resposta à Acusação Criminal",
    description:
      "Estrutura defensiva criminal com vocabulário de réu, acusação e Ministério Público.",
    suggestedTipo: "CRIMINAL",
    suggestedCategoria: "MANIFESTACAO",
    partyVocabulary: {
      primaryPartyLabel: "Réu",
      opposingPartyLabel: "Acusação",
      prosecutorLabel: "Ministério Público",
    },
    bodyHtml: [
      "<p>Excelentíssimo(a) Senhor(a) Doutor(a) Juiz(a) de Direito da Vara Criminal da Comarca de {{comarca_nome}}.</p>",
      '<h1 style="text-align:center">RESPOSTA À ACUSAÇÃO</h1>',
      "<p><strong>{{reu_nome}}</strong>, já qualificado(a), por seus advogados, nos autos da ação penal nº {{processo_numero_cnj}}, vem, com fundamento legal cabível, apresentar resposta à acusação.</p>",
      "<h2>I. SÍNTESE DA DENÚNCIA</h2>",
      "<p>Resuma aqui a imputação formulada pela acusação ou pelo Ministério Público.</p>",
      "<h2>II. PRELIMINARES</h2>",
      "<p>Registre nulidades, questões processuais e matérias preliminares relevantes.</p>",
      "<h2>III. MÉRITO DEFENSIVO</h2>",
      "<p>Apresente a tese defensiva principal, destacando inconsistências fáticas ou jurídicas.</p>",
      "<h2>IV. REQUERIMENTOS</h2>",
      "<ol><li>Recebimento da presente resposta.</li><li>Absolvição sumária, se cabível.</li><li>Produção de provas admitidas em direito.</li></ol>",
      "<p>Nestes termos, pede deferimento.</p>",
      "<p>{{comarca_nome}}, {{data_atual}}.</p>",
      "<p>{{advogado_nome}}<br />OAB {{advogado_oab}}</p>",
    ].join(""),
    quickBlocks: [
      {
        id: "criminal-summary",
        label: "Síntese da acusação",
        html: "<h2>I. SÍNTESE DA ACUSAÇÃO</h2><p>Apresente a narrativa resumida da imputação.</p>",
      },
      {
        id: "criminal-preliminaries",
        label: "Preliminares",
        html: "<h2>II. DAS PRELIMINARES</h2><p>Registre nulidades e matérias processuais relevantes.</p>",
      },
      {
        id: "criminal-merits",
        label: "Mérito defensivo",
        html: "<h2>III. DO MÉRITO DEFENSIVO</h2><p>Desenvolva a tese principal de defesa.</p>",
      },
      {
        id: "criminal-evidence",
        label: "Provas",
        html: "<h2>IV. DAS PROVAS</h2><p>Requeira diligências, testemunhas e demais provas necessárias.</p>",
      },
      {
        id: "criminal-requests",
        label: "Requerimentos",
        html: "<h2>V. DOS REQUERIMENTOS</h2><ol><li>Absolvição sumária, se cabível.</li><li>Regular instrução probatória.</li></ol>",
      },
    ],
  },
};

function sanitizeTokenName(token: string) {
  return token.trim().replace(/\s+/g, "_");
}

function stripHtml(value: string) {
  return value
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|section|article|li|h1|h2|h3|h4|h5|h6|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function normalizePlainText(value: string) {
  return stripHtml(value).replace(/\n +/g, "\n").trim();
}

function safeString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function safeBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function safeNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function isPresetKey(value: unknown): value is ModeloPeticaoPresetKey {
  return (
    value === "custom" ||
    value === "trabalhista-contestacao" ||
    value === "criminal-resposta"
  );
}

function createId(prefix: string, index: number) {
  return `${prefix}-${index + 1}`;
}

function guessBlockType(html: string, headingTag?: string): ModeloPeticaoBodyBlockType {
  const normalized = html.toLowerCase();

  if (normalized.includes("<img")) {
    return "image";
  }

  if (normalized.includes("oab") || normalized.includes("pede deferimento")) {
    return "signature";
  }

  if (normalized.includes("<hr")) {
    return "separator";
  }

  if (headingTag === "h1") {
    return "title";
  }

  if (headingTag && /^h[2-6]$/.test(headingTag)) {
    return "section";
  }

  if (normalized.includes("<p") || normalized.includes("<li")) {
    return "paragraph";
  }

  return "unknown";
}

export function extractTemplateTokensFromString(value: string) {
  const tokens = new Set<string>();

  for (const match of value.matchAll(TEMPLATE_TOKEN_REGEX)) {
    const token = sanitizeTokenName(match[1] || "");
    if (token) {
      tokens.add(token);
    }
  }

  return Array.from(tokens);
}

export function buildBodyBlocksFromHtml(bodyHtml: string): ModeloPeticaoBodyBlock[] {
  const html = safeString(bodyHtml);
  if (!html.trim()) {
    return [];
  }

  const blocks: ModeloPeticaoBodyBlock[] = [];
  const headingRegex = /<(h[1-6])[^>]*>([\s\S]*?)<\/\1>/gi;
  let lastIndex = 0;
  let headingCount = 0;
  let match: RegExpExecArray | null;

  while ((match = headingRegex.exec(html)) !== null) {
    const [fullMatch, tag, innerHtml] = match;
    const before = html.slice(lastIndex, match.index).trim();

    if (before) {
      blocks.push({
        id: createId("body-block", blocks.length),
        type: guessBlockType(before),
        title: blocks.length === 0 ? "Abertura" : "Trecho",
        html: before,
        plainText: normalizePlainText(before),
      });
    }

    blocks.push({
      id: createId("body-block", blocks.length),
      type: guessBlockType(fullMatch, tag.toLowerCase()),
      title: normalizePlainText(innerHtml) || `Seção ${headingCount + 1}`,
      html: fullMatch,
      plainText: normalizePlainText(fullMatch),
      level: Number(tag.toLowerCase().replace("h", "")),
    });

    headingCount += 1;
    lastIndex = match.index + fullMatch.length;
  }

  const tail = html.slice(lastIndex).trim();
  if (tail) {
    blocks.push({
      id: createId("body-block", blocks.length),
      type: guessBlockType(tail),
      title: blocks.length === 0 ? "Corpo" : "Trecho final",
      html: tail,
      plainText: normalizePlainText(tail),
    });
  }

  return blocks.filter((block) => block.plainText || /<img/i.test(block.html));
}

function buildDefaultHeaderTitleHtml(branding?: TenantBrandingDocumentSeed | null) {
  const officeName = branding?.name?.trim();
  return officeName
    ? `<p><strong>${officeName}</strong></p>`
    : "<p><strong>{{escritorio_nome}}</strong></p>";
}

function buildHeaderMedia(
  imageMode: HeaderImageMode,
  branding?: TenantBrandingDocumentSeed | null,
  customImageUrl?: string | null,
): ModeloPeticaoDocumentMedia[] {
  if (imageMode === "tenant_logo" && branding?.logoUrl) {
    return [
      {
        id: "header-logo",
        role: "header",
        url: branding.logoUrl,
        source: "tenant_logo",
        alt: branding?.name || "Logo do escritório",
      },
    ];
  }

  if (imageMode === "custom_image" && customImageUrl) {
    return [
      {
        id: "header-custom-image",
        role: "header",
        url: customImageUrl,
        source: customImageUrl.startsWith("http") ? "external_url" : "custom_upload",
        alt: "Imagem do modelo",
      },
    ];
  }

  return [];
}

export function inferPresetKeyFromTipo(tipo?: string | null): ModeloPeticaoPresetKey {
  const normalized = tipo?.trim().toUpperCase();
  if (normalized === "TRABALHISTA") {
    return "trabalhista-contestacao";
  }
  if (normalized === "CRIMINAL") {
    return "criminal-resposta";
  }
  return "custom";
}

export function createModeloPeticaoDocument(
  presetKey: ModeloPeticaoPresetKey,
  branding?: TenantBrandingDocumentSeed | null,
): ModeloPeticaoDocumentJson {
  const preset = MODELO_PETICAO_PRESETS[presetKey];
  const imageMode: HeaderImageMode = branding?.logoUrl ? "tenant_logo" : "none";

  const document: ModeloPeticaoDocumentJson = {
    version: 1,
    page: {
      ...DEFAULT_PAGE_SETTINGS,
    },
    header: {
      imageMode,
      customImageUrl: null,
      titleHtml: buildDefaultHeaderTitleHtml(branding),
      metadataHtml: DEFAULT_HEADER_METADATA_HTML,
      showDivider: true,
      alignment: imageMode === "tenant_logo" ? "center" : "left",
    },
    footer: {
      html: DEFAULT_FOOTER_HTML,
      showDivider: true,
      alignment: "center",
    },
    media: buildHeaderMedia(imageMode, branding, null),
    bodyHtml: preset.bodyHtml,
    bodyBlocks: buildBodyBlocksFromHtml(preset.bodyHtml),
    preset: {
      key: preset.key,
      label: preset.label,
    },
    partyVocabulary: preset.partyVocabulary,
  };

  return document;
}

export function normalizeModeloPeticaoDocument(
  input: unknown,
  options?: {
    conteudo?: string | null;
    branding?: TenantBrandingDocumentSeed | null;
    presetKey?: string | null;
    tipo?: string | null;
  },
): ModeloPeticaoDocumentJson {
  const effectivePreset = isPresetKey(options?.presetKey)
    ? options.presetKey
    : inferPresetKeyFromTipo(options?.tipo);

  const base = createModeloPeticaoDocument(effectivePreset, options?.branding);

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    if (options?.conteudo?.trim()) {
      base.bodyHtml = `<p>${options.conteudo
        .trim()
        .replace(/\n{2,}/g, "</p><p>")
        .replace(/\n/g, "<br />")}</p>`;
      base.bodyBlocks = buildBodyBlocksFromHtml(base.bodyHtml);
    }
    return base;
  }

  const raw = input as Record<string, unknown>;
  const presetKey = isPresetKey(raw?.preset && (raw.preset as any).key)
    ? ((raw.preset as any).key as ModeloPeticaoPresetKey)
    : effectivePreset;
  const preset = MODELO_PETICAO_PRESETS[presetKey];

  const normalizedHeaderImageMode = (() => {
    const rawMode = raw.header && typeof raw.header === "object"
      ? (raw.header as Record<string, unknown>).imageMode
      : undefined;
    return rawMode === "tenant_logo" || rawMode === "custom_image" || rawMode === "none"
      ? rawMode
      : base.header.imageMode;
  })();

  const customImageUrl =
    raw.header && typeof raw.header === "object"
      ? safeString((raw.header as Record<string, unknown>).customImageUrl) || null
      : null;
  const bodyHtml =
    safeString(raw.bodyHtml) ||
    (options?.conteudo?.trim()
      ? `<p>${options.conteudo
          .trim()
          .replace(/\n{2,}/g, "</p><p>")
          .replace(/\n/g, "<br />")}</p>`
      : base.bodyHtml);

  const normalized: ModeloPeticaoDocumentJson = {
    version: 1,
    page: {
      size: "A4",
      marginTop: safeNumber((raw.page as any)?.marginTop, base.page.marginTop),
      marginRight: safeNumber((raw.page as any)?.marginRight, base.page.marginRight),
      marginBottom: safeNumber((raw.page as any)?.marginBottom, base.page.marginBottom),
      marginLeft: safeNumber((raw.page as any)?.marginLeft, base.page.marginLeft),
      fontSize: safeNumber((raw.page as any)?.fontSize, base.page.fontSize),
      lineHeight: safeNumber((raw.page as any)?.lineHeight, base.page.lineHeight),
      fontFamily: safeString((raw.page as any)?.fontFamily) || base.page.fontFamily,
    },
    header: {
      imageMode: normalizedHeaderImageMode,
      customImageUrl,
      titleHtml:
        (raw.header && typeof raw.header === "object"
          ? safeString((raw.header as Record<string, unknown>).titleHtml)
          : "") || base.header.titleHtml,
      metadataHtml:
        (raw.header && typeof raw.header === "object"
          ? safeString((raw.header as Record<string, unknown>).metadataHtml)
          : "") || base.header.metadataHtml,
      showDivider:
        raw.header && typeof raw.header === "object"
          ? safeBoolean((raw.header as Record<string, unknown>).showDivider, true)
          : base.header.showDivider,
      alignment:
        raw.header &&
        typeof raw.header === "object" &&
        (((raw.header as Record<string, unknown>).alignment === "center") ||
          ((raw.header as Record<string, unknown>).alignment === "left"))
          ? ((raw.header as Record<string, unknown>).alignment as "left" | "center")
          : base.header.alignment,
    },
    footer: {
      html:
        (raw.footer && typeof raw.footer === "object"
          ? safeString((raw.footer as Record<string, unknown>).html)
          : "") || base.footer.html,
      showDivider:
        raw.footer && typeof raw.footer === "object"
          ? safeBoolean((raw.footer as Record<string, unknown>).showDivider, true)
          : base.footer.showDivider,
      alignment:
        raw.footer &&
        typeof raw.footer === "object" &&
        (((raw.footer as Record<string, unknown>).alignment === "center") ||
          ((raw.footer as Record<string, unknown>).alignment === "left"))
          ? ((raw.footer as Record<string, unknown>).alignment as "left" | "center")
          : base.footer.alignment,
    },
    media: Array.isArray(raw.media)
      ? (raw.media as Record<string, unknown>[])
          .map((item, index) => {
            const url = safeString(item.url);
            if (!url) {
              return null;
            }

            return {
              id: safeString(item.id) || createId("media", index),
              role: item.role === "body" ? "body" : "header",
              url,
              source:
                item.source === "tenant_logo" ||
                item.source === "custom_upload" ||
                item.source === "external_url"
                  ? item.source
                  : (url.startsWith("http") ? "external_url" : "custom_upload"),
              alt: safeString(item.alt) || "Imagem do modelo",
            } satisfies ModeloPeticaoDocumentMedia;
          })
          .filter((item): item is ModeloPeticaoDocumentMedia => Boolean(item))
      : [],
    bodyHtml,
    bodyBlocks: buildBodyBlocksFromHtml(bodyHtml),
    preset: {
      key: presetKey,
      label:
        (raw.preset && typeof raw.preset === "object"
          ? safeString((raw.preset as Record<string, unknown>).label)
          : "") || preset.label,
    },
    partyVocabulary: {
      primaryPartyLabel:
        (raw.partyVocabulary && typeof raw.partyVocabulary === "object"
          ? safeString((raw.partyVocabulary as Record<string, unknown>).primaryPartyLabel)
          : "") || preset.partyVocabulary.primaryPartyLabel,
      opposingPartyLabel:
        (raw.partyVocabulary && typeof raw.partyVocabulary === "object"
          ? safeString((raw.partyVocabulary as Record<string, unknown>).opposingPartyLabel)
          : "") || preset.partyVocabulary.opposingPartyLabel,
      prosecutorLabel:
        (raw.partyVocabulary && typeof raw.partyVocabulary === "object"
          ? safeString((raw.partyVocabulary as Record<string, unknown>).prosecutorLabel)
          : preset.partyVocabulary.prosecutorLabel || "") || null,
    },
  };

  const headerMedia = buildHeaderMedia(
    normalized.header.imageMode,
    options?.branding,
    normalized.header.customImageUrl,
  );
  const bodyMedia = normalized.media.filter((item) => item.role === "body");
  normalized.media = [...headerMedia, ...bodyMedia];

  return normalized;
}

export function serializeModeloPeticaoDocumentToText(
  document: ModeloPeticaoDocumentJson,
) {
  const sections = [
    normalizePlainText(document.header.titleHtml),
    normalizePlainText(document.header.metadataHtml),
    normalizePlainText(document.bodyHtml),
    normalizePlainText(document.footer.html),
  ].filter(Boolean);

  return sections.join("\n\n").trim();
}

export function extractTemplateTokensFromDocument(
  document: ModeloPeticaoDocumentJson | null | undefined,
) {
  if (!document) {
    return [];
  }

  const strings = [
    document.header.titleHtml,
    document.header.metadataHtml,
    document.bodyHtml,
    document.footer.html,
    ...document.media.map((item) => item.alt),
  ];

  return Array.from(
    new Set(strings.flatMap((value) => extractTemplateTokensFromString(value))),
  );
}

function replaceTemplateVariablesInString(
  template: string,
  variables: Record<string, unknown>,
) {
  return template.replace(TEMPLATE_TOKEN_REGEX, (_full, token: string) => {
    const key = sanitizeTokenName(token);
    const rawValue = variables[key];
    if (rawValue === null || rawValue === undefined) {
      return "";
    }
    return String(rawValue);
  });
}

function replaceTemplateVariablesDeep<T>(
  input: T,
  variables: Record<string, unknown>,
): T {
  if (typeof input === "string") {
    return replaceTemplateVariablesInString(input, variables) as T;
  }

  if (Array.isArray(input)) {
    return input.map((item) => replaceTemplateVariablesDeep(item, variables)) as T;
  }

  if (input && typeof input === "object") {
    return Object.fromEntries(
      Object.entries(input as Record<string, unknown>).map(([key, value]) => [
        key,
        replaceTemplateVariablesDeep(value, variables),
      ]),
    ) as T;
  }

  return input;
}

export function resolveModeloPeticaoDocumentVariables(
  document: ModeloPeticaoDocumentJson,
  variables: Record<string, unknown>,
) {
  const replaced = replaceTemplateVariablesDeep(document, variables);
  return normalizeModeloPeticaoDocument(replaced);
}
