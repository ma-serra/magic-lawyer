import { getTribunalConfig } from "@/lib/api/juridical/config";

import type {
  JuridicalAiCitationCheck,
  JuridicalAiVerificationLink,
} from "@/app/lib/juridical-ai/types";

const COURT_RESEARCH_LINKS: Array<{
  aliases: string[];
  label: string;
  href: string;
  authority: string;
}> = [
  {
    aliases: ["STJ"],
    label: "Pesquisa oficial de jurisprudencia do STJ",
    href: "https://scon.stj.jus.br/SCON/",
    authority: "STJ",
  },
  {
    aliases: ["STF"],
    label: "Pesquisa oficial de jurisprudencia do STF",
    href: "https://jurisprudencia.stf.jus.br/pages/search",
    authority: "STF",
  },
  {
    aliases: ["TST"],
    label: "Pesquisa oficial de jurisprudencia do TST",
    href: "https://jurisprudencia.tst.jus.br/",
    authority: "TST",
  },
  {
    aliases: ["TSE"],
    label: "Pesquisa oficial de jurisprudencia do TSE",
    href: "https://jurisprudencia.tse.jus.br/#/jurisprudencia",
    authority: "TSE",
  },
];

function uniqueLinks(links: JuridicalAiVerificationLink[]) {
  const seen = new Set<string>();

  return links.filter((link) => {
    const key = `${link.kind}:${link.href}:${link.label}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function buildTribunalPublicLink(sigla?: string | null) {
  if (!sigla) {
    return null;
  }

  const tribunal = getTribunalConfig({ sigla: sigla.toUpperCase() });
  if (!tribunal?.urlConsulta && !tribunal?.urlBase) {
    return null;
  }

  const accessMode: JuridicalAiVerificationLink["accessMode"] = tribunal.urlConsulta
    ? "DIRECT"
    : "SEARCH";

  return {
    label: tribunal.urlConsulta
      ? `Consulta publica ${tribunal.sigla}`
      : `Portal oficial ${tribunal.sigla}`,
    href: tribunal.urlConsulta ?? tribunal.urlBase!,
    kind: "EXTERNAL" as const,
    authority: tribunal.sigla,
    accessMode,
  };
}

function buildKnownDiplomaLink(reference: string) {
  const normalized = reference.toLowerCase();

  const knownDiplomas: Array<{
    pattern: RegExp;
    label: string;
    href: string;
    authority: string;
  }> = [
    {
      pattern: /\b(constitui[cç][aã]o federal|cf\/?88|cf)\b/,
      label: "Texto oficial da Constituicao Federal",
      href: "https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm",
      authority: "Planalto",
    },
    {
      pattern: /\b(cpc|c[oó]digo de processo civil)\b/,
      label: "Texto oficial do CPC",
      href: "https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2015/lei/l13105.htm",
      authority: "Planalto",
    },
    {
      pattern: /\b(cdc|c[oó]digo de defesa do consumidor)\b/,
      label: "Texto oficial do CDC",
      href: "https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm",
      authority: "Planalto",
    },
    {
      pattern: /\b(clt)\b/,
      label: "Texto oficial da CLT",
      href: "https://www.planalto.gov.br/ccivil_03/decreto-lei/del5452.htm",
      authority: "Planalto",
    },
    {
      pattern: /\b(cpp|c[oó]digo de processo penal)\b/,
      label: "Texto oficial do CPP",
      href: "https://www.planalto.gov.br/ccivil_03/decreto-lei/del3689.htm",
      authority: "Planalto",
    },
    {
      pattern: /\b(c[oó]digo civil|cc)\b/,
      label: "Texto oficial do Codigo Civil",
      href: "https://www.planalto.gov.br/ccivil_03/leis/2002/l10406compilada.htm",
      authority: "Planalto",
    },
    {
      pattern: /\b(c[oó]digo penal|cp)\b/,
      label: "Texto oficial do Codigo Penal",
      href: "https://www.planalto.gov.br/ccivil_03/decreto-lei/del2848compilado.htm",
      authority: "Planalto",
    },
    {
      pattern: /\b(lgpd|lei geral de prote[cç][aã]o de dados)\b/,
      label: "Texto oficial da LGPD",
      href: "https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm",
      authority: "Planalto",
    },
    {
      pattern: /\b(eca|estatuto da crian[cç]a e do adolescente)\b/,
      label: "Texto oficial do ECA",
      href: "https://www.planalto.gov.br/ccivil_03/leis/l8069.htm",
      authority: "Planalto",
    },
    {
      pattern: /\b(ctn|c[oó]digo tribut[aá]rio nacional)\b/,
      label: "Texto oficial do CTN",
      href: "https://www.planalto.gov.br/ccivil_03/leis/l5172compilado.htm",
      authority: "Planalto",
    },
    {
      pattern: /\b(estatuto da advocacia|estatuto da oab|lei n[ºo]?\s*8\.906|lei 8\.906)\b/,
      label: "Texto oficial do Estatuto da Advocacia",
      href: "https://www.planalto.gov.br/ccivil_03/leis/l8906.htm",
      authority: "Planalto",
    },
    {
      pattern: /\b(lei maria da penha|lei n[ºo]?\s*11\.340|lei 11\.340)\b/,
      label: "Texto oficial da Lei Maria da Penha",
      href: "https://www.planalto.gov.br/ccivil_03/_ato2004-2006/2006/lei/l11340.htm",
      authority: "Planalto",
    },
  ];

  return (
    knownDiplomas.find((item) => item.pattern.test(normalized)) ?? null
  );
}

function buildKnownCourtSearchLink(sigla?: string | null) {
  if (!sigla) {
    return null;
  }

  const normalized = sigla.trim().toUpperCase();
  const matched = COURT_RESEARCH_LINKS.find((item) =>
    item.aliases.includes(normalized),
  );

  if (!matched) {
    return null;
  }

  return {
    label: matched.label,
    href: matched.href,
    kind: "EXTERNAL" as const,
    authority: matched.authority,
    accessMode: "SEARCH" as const,
  };
}

function buildLexmlSearchLink(reference: string, documentType?: "Jurisprudência" | "Legislação") {
  const query = encodeURIComponent(reference.trim());
  const facet = documentType
    ? `;f1-tipoDocumento=${encodeURIComponent(documentType)}`
    : "";

  return {
    label: documentType
      ? `Pesquisar no LexML (${documentType})`
      : "Pesquisar no LexML",
    href: `https://www.lexml.gov.br/busca/search?keyword=${query}${facet}`,
    kind: "EXTERNAL" as const,
    authority: "LexML Brasil",
    accessMode: "SEARCH" as const,
  };
}

function buildJurisprudenceSearchLink(reference: string, processTribunal?: string | null) {
  const normalized = reference.toUpperCase();
  for (const court of COURT_RESEARCH_LINKS) {
    if (court.aliases.some((alias) => normalized.includes(alias))) {
      return {
        label: court.label,
        href: court.href,
        kind: "EXTERNAL" as const,
        authority: court.authority,
        accessMode: "SEARCH" as const,
      };
    }
  }

  return buildKnownCourtSearchLink(processTribunal) ?? buildTribunalPublicLink(processTribunal);
}

export function buildProcessVerificationLinks(params: {
  processId?: string | null;
  tribunalSigla?: string | null;
}) {
  const links: JuridicalAiVerificationLink[] = [];

  if (params.processId) {
    links.push({
      label: "Ver processo no sistema",
      href: `/processos/${params.processId}`,
      kind: "INTERNAL",
      authority: "Magic Lawyer",
      accessMode: "DIRECT",
    });
  }

  const tribunalLink = buildTribunalPublicLink(params.tribunalSigla);
  if (tribunalLink) {
    links.push(tribunalLink);
  }

  return uniqueLinks(links);
}

export function buildDocumentVerificationLinks(params: {
  documentId?: string | null;
  processId?: string | null;
}) {
  const links: JuridicalAiVerificationLink[] = [];

  if (params.documentId) {
    links.push({
      label: "Abrir documento do processo",
      href: `/api/documentos/${params.documentId}/view`,
      kind: "INTERNAL",
      authority: "Magic Lawyer",
      accessMode: "DIRECT",
    });
  }

  if (params.processId) {
    links.push({
      label: "Contexto do processo",
      href: `/processos/${params.processId}`,
      kind: "INTERNAL",
      authority: "Magic Lawyer",
      accessMode: "DIRECT",
    });
  }

  return uniqueLinks(links);
}

export function buildModelVerificationLinks() {
  return uniqueLinks([
    {
      label: "Abrir biblioteca de modelos",
      href: "/modelos-peticao",
      kind: "INTERNAL",
      authority: "Magic Lawyer",
      accessMode: "DIRECT",
    },
  ]);
}

export function buildCaseMemoryVerificationLinks(processId?: string | null) {
  const links: JuridicalAiVerificationLink[] = [
    {
      label: "Histórico do Magic AI",
      href: "/magic-ai?tab=historico",
      kind: "INTERNAL",
      authority: "Magic Lawyer",
      accessMode: "DIRECT",
    },
  ];

  if (processId) {
    links.push({
      label: "Voltar ao processo",
      href: `/processos/${processId}`,
      kind: "INTERNAL",
      authority: "Magic Lawyer",
      accessMode: "DIRECT",
    });
  }

  return uniqueLinks(links);
}

export function buildCausaVerificationLinks(causeName: string, codigoCnj?: string | null) {
  const query = encodeURIComponent(codigoCnj || causeName);

  return uniqueLinks([
    {
      label: "Abrir catálogo de causas",
      href: `/causas?search=${query}`,
      kind: "INTERNAL",
      authority: "Magic Lawyer",
      accessMode: "SEARCH",
    },
  ]);
}

export function buildCitationVerificationLinks(
  citation: JuridicalAiCitationCheck,
  processTribunal?: string | null,
) {
  const links: JuridicalAiVerificationLink[] = [];

  if (citation.sourceType === "LEGAL") {
    const diploma = buildKnownDiplomaLink(citation.normalizedReference);
    if (diploma) {
      links.push({
        label: diploma.label,
        href: diploma.href,
        kind: "EXTERNAL",
        authority: diploma.authority,
        accessMode: "DIRECT",
      });
    }

    links.push(buildLexmlSearchLink(citation.normalizedReference, "Legislação"));
  }

  if (citation.sourceType === "JURISPRUDENCE") {
    const courtLink = buildJurisprudenceSearchLink(
      citation.normalizedReference,
      processTribunal,
    );
    if (courtLink) {
      links.push(courtLink);
    }

    links.push(buildLexmlSearchLink(citation.normalizedReference, "Jurisprudência"));
  }

  return uniqueLinks(links);
}

export function buildResearchVerificationLinks(targetCourts: string[]) {
  const links = targetCourts
    .map((court) => buildKnownCourtSearchLink(court) ?? buildTribunalPublicLink(court))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  return uniqueLinks(links);
}
