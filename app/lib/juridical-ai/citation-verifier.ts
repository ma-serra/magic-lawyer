import type {
  JuridicalAiCitationCheck,
  JuridicalAiVerificationLink,
} from "@/app/lib/juridical-ai/types";

type FetchLike = typeof fetch;
type ProbeResult = {
  ok: boolean;
  body: string | null;
  restricted: boolean;
  status: number | null;
};

const DEFAULT_TIMEOUT_MS = 4500;
const HTML_TAG_PATTERN = /<[^>]+>/g;
const MULTISPACE_PATTERN = /\s+/g;
const RESTRICTED_BODY_PATTERNS = [
  /enable javascript and cookies to continue/i,
  /verifica[cç][aã]o autom[aá]tica em andamento/i,
  /challenge/i,
];

function resolveOfficialDirectLink(
  links?: JuridicalAiVerificationLink[],
): JuridicalAiVerificationLink | null {
  return (
    links?.find((link) => link.kind === "EXTERNAL" && link.accessMode === "DIRECT") ??
    null
  );
}

function hasExternalSearchLink(links?: JuridicalAiVerificationLink[]) {
  return Boolean(
    links?.some((link) => link.kind === "EXTERNAL" && link.accessMode === "SEARCH"),
  );
}

function resolveLexmlSearchLink(
  links?: JuridicalAiVerificationLink[],
): JuridicalAiVerificationLink | null {
  return (
    links?.find(
      (link) =>
        link.kind === "EXTERNAL" &&
        link.authority === "LexML Brasil" &&
        link.accessMode === "SEARCH",
    ) ?? null
  );
}

function resolvePrimaryOfficialSearchLink(
  links?: JuridicalAiVerificationLink[],
): JuridicalAiVerificationLink | null {
  return (
    links?.find(
      (link) =>
        link.kind === "EXTERNAL" &&
        link.accessMode === "SEARCH" &&
        link.authority !== "LexML Brasil",
    ) ?? null
  );
}

function isRestrictedPortalResponse(response: Response, body: string | null) {
  const getHeader = (name: string) =>
    typeof response.headers?.get === "function" ? response.headers.get(name) : null;
  const cloudflareChallenge = getHeader("cf-mitigated") === "challenge";
  const awsWafChallenge = getHeader("x-amzn-waf-action") === "challenge";
  const bodyChallenge =
    typeof body === "string"
      ? RESTRICTED_BODY_PATTERNS.some((pattern) => pattern.test(body))
      : false;

  return cloudflareChallenge || awsWafChallenge || bodyChallenge;
}

async function probeOfficialSource(
  link: JuridicalAiVerificationLink,
  fetcher?: FetchLike,
): Promise<ProbeResult> {
  if (!fetcher) {
    return {
      ok: false,
      body: null,
      restricted: false,
      status: null,
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetcher(link.href, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "User-Agent": "MagicLawyerCitationVerifier/1.0",
      },
    });

    const body = await response.text().catch(() => null);
    const restricted = isRestrictedPortalResponse(response, body);

    return {
      ok: response.ok && !restricted,
      body,
      restricted,
      status: response.status,
    };
  } catch {
    return {
      ok: false,
      body: null,
      restricted: false,
      status: null,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeDocumentText(value: string) {
  return value
    .replace(HTML_TAG_PATTERN, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#160;/gi, " ")
    .replace(MULTISPACE_PATTERN, " ")
    .trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractArticleMarker(reference: string) {
  const match = reference.match(/\bart(?:igo)?\.?\s*(\d+[A-Za-z]?)(?:\s*[º°o])?/i);
  return match?.[1]?.toLowerCase() ?? null;
}

function buildArticleRegex(articleMarker: string) {
  const escaped = escapeRegExp(articleMarker);
  return new RegExp(
    `art(?:igo)?\\.?\\s*${escaped}(?:\\s*[º°o])?(?:\\s|\\.|,|;|:)`,
    "i",
  );
}

function buildExcerptAroundMatch(text: string, index: number, length: number) {
  const start = Math.max(0, index - 90);
  const end = Math.min(text.length, index + length + 140);
  return text.slice(start, end).trim();
}

function verifyLegalCitationAgainstBody(reference: string, body: string) {
  const normalizedBody = normalizeDocumentText(body);
  const articleMarker = extractArticleMarker(reference);

  if (!articleMarker) {
    return {
      matched: true,
      note: "Fonte oficial acessível, mas a referência não traz artigo específico para validação textual fina.",
      excerpt: null,
    };
  }

  const articleRegex = buildArticleRegex(articleMarker);
  const match = articleRegex.exec(normalizedBody);

  if (!match || typeof match.index !== "number") {
    return {
      matched: false,
      note: `A fonte oficial respondeu, mas o artigo ${articleMarker} não foi localizado automaticamente no texto retornado.`,
      excerpt: null,
    };
  }

  return {
    matched: true,
    note: `Artigo ${articleMarker} localizado automaticamente na fonte oficial.`,
    excerpt: buildExcerptAroundMatch(normalizedBody, match.index, match[0].length),
  };
}

function parseLexmlItemCount(html: string) {
  const match = html.match(/<span id="itemCount">([\d.]+)<\/span>/i);
  if (!match?.[1]) {
    return 0;
  }

  return Number(match[1].replace(/\./g, "")) || 0;
}

function parseLexmlFirstResult(html: string) {
  const titleMatch = html.match(
    /<td class="col2"><b>Título\s*<\/b><\/td><td class="col3"><a href="([^"]+)">([\s\S]*?)<\/a>/i,
  );
  const authorityMatch = html.match(
    /<td class="col2"><b>Autoridade\s*<\/b><\/td><td class="col3">([\s\S]*?)<\/td>/i,
  );

  const normalize = (value: string) =>
    normalizeDocumentText(value).replace(/&ndash;|–/g, "-").trim();

  return {
    href: titleMatch?.[1] ? `https://www.lexml.gov.br${titleMatch[1]}` : null,
    title: titleMatch?.[2] ? normalize(titleMatch[2]) : null,
    authority: authorityMatch?.[1] ? normalize(authorityMatch[1]) : null,
  };
}

async function probeLexmlSearch(link: JuridicalAiVerificationLink, fetcher?: FetchLike) {
  const probe = await probeOfficialSource(link, fetcher);

  if (!probe.ok || !probe.body) {
    return {
      ok: false,
      restricted: probe.restricted,
      count: 0,
      firstTitle: null as string | null,
      firstHref: null as string | null,
      firstAuthority: null as string | null,
    };
  }

  const count = parseLexmlItemCount(probe.body);
  const first = parseLexmlFirstResult(probe.body);

  return {
    ok: count > 0,
    restricted: probe.restricted,
    count,
    firstTitle: first.title,
    firstHref: first.href,
    firstAuthority: first.authority,
  };
}

export async function enrichCitationChecksWithExternalVerification(
  checks: JuridicalAiCitationCheck[],
  fetcher: FetchLike | undefined = globalThis.fetch,
): Promise<JuridicalAiCitationCheck[]> {
  const sourceCache = new Map<string, Promise<ProbeResult>>();

  return Promise.all(
    checks.map(async (check) => {
      const directLink = resolveOfficialDirectLink(check.verificationLinks);

      if (directLink) {
        const probePromise =
          sourceCache.get(directLink.href) ??
          probeOfficialSource(directLink, fetcher);
        sourceCache.set(directLink.href, probePromise);
        const probe = await probePromise;

        return {
          ...check,
          ...(probe.restricted
            ? {
                externalVerificationStatus: "PORTAL_OFICIAL_COM_RESTRICAO" as const,
                externalVerificationNote: `A fonte oficial em ${directLink.authority} respondeu com restrição ou desafio automatizado, impedindo confirmação automática nesta execução.`,
                externalVerificationExcerpt: null,
                externalVerifiedAt: new Date().toISOString(),
              }
            : probe.ok
            ? (() => {
                if (check.sourceType === "LEGAL" && probe.body) {
                  const legalVerification = verifyLegalCitationAgainstBody(
                    check.normalizedReference,
                    probe.body,
                  );

                  return {
                    externalVerificationStatus: legalVerification.matched
                      ? "CONFIRMADA_FONTE_OFICIAL"
                      : "FONTE_OFICIAL_SEM_MATCH",
                    externalVerificationNote: legalVerification.note,
                    externalVerificationExcerpt: legalVerification.excerpt,
                    externalVerifiedAt: new Date().toISOString(),
                  };
                }

                return {
                  externalVerificationStatus: "CONFIRMADA_FONTE_OFICIAL" as const,
                  externalVerificationNote: `Fonte oficial acessível em ${directLink.authority}.`,
                  externalVerificationExcerpt: null,
                  externalVerifiedAt: new Date().toISOString(),
                };
              })()
            : {
                externalVerificationStatus: "FONTE_EXTERNA_INDISPONIVEL" as const,
                externalVerificationNote: `Não foi possível confirmar a fonte oficial em ${directLink.authority} nesta execução.`,
                externalVerificationExcerpt: null,
                externalVerifiedAt: new Date().toISOString(),
              }),
        } satisfies JuridicalAiCitationCheck;
      }

      if (hasExternalSearchLink(check.verificationLinks)) {
        const lexmlLink = resolveLexmlSearchLink(check.verificationLinks);
        const officialSearchLink = resolvePrimaryOfficialSearchLink(
          check.verificationLinks,
        );

        if (lexmlLink) {
          const lexmlProbe = await probeLexmlSearch(lexmlLink, fetcher);

          if (lexmlProbe.ok) {
            return {
              ...check,
              externalVerificationStatus: "CONFIRMADA_EM_BUSCA_OFICIAL",
              externalVerificationNote: `A referência retornou ${lexmlProbe.count} correspondência(s) no LexML, base oficial de agregação jurídica.`,
              externalVerificationExcerpt: [lexmlProbe.firstTitle, lexmlProbe.firstAuthority]
                .filter(Boolean)
                .join(" • ") || null,
              externalVerifiedAt: new Date().toISOString(),
              verificationLinks: lexmlProbe.firstHref
                ? [
                    ...(check.verificationLinks ?? []),
                    {
                      label: "Abrir primeiro resultado no LexML",
                      href: lexmlProbe.firstHref,
                      kind: "EXTERNAL",
                      authority: "LexML Brasil",
                      accessMode: "DIRECT",
                    },
                  ]
                : check.verificationLinks,
            } satisfies JuridicalAiCitationCheck;
          }

          if (lexmlProbe.restricted) {
            return {
              ...check,
              externalVerificationStatus: "PORTAL_OFICIAL_COM_RESTRICAO",
              externalVerificationNote:
                "A base oficial agregada respondeu com proteção automatizada, impedindo a confirmação externa nesta execução.",
              externalVerifiedAt: new Date().toISOString(),
              externalVerificationExcerpt: null,
            } satisfies JuridicalAiCitationCheck;
          }
        }

        if (officialSearchLink) {
          const officialProbe = await probeOfficialSource(officialSearchLink, fetcher);

          if (officialProbe.restricted) {
            return {
              ...check,
              externalVerificationStatus: "PORTAL_OFICIAL_COM_RESTRICAO",
              externalVerificationNote: `O portal oficial de pesquisa em ${officialSearchLink.authority} está protegido por desafio ou bloqueio automatizado nesta execução.`,
              externalVerifiedAt: new Date().toISOString(),
              externalVerificationExcerpt: null,
            } satisfies JuridicalAiCitationCheck;
          }

          if (officialProbe.ok) {
            return {
              ...check,
              externalVerificationStatus: "LINK_OFICIAL_DE_PESQUISA",
              externalVerificationNote: `O portal oficial de pesquisa em ${officialSearchLink.authority} está online, mas esta referência ainda exige pesquisa estruturada para confirmação final.`,
              externalVerifiedAt: new Date().toISOString(),
              externalVerificationExcerpt: null,
            } satisfies JuridicalAiCitationCheck;
          }
        }

        return {
          ...check,
          externalVerificationStatus: "LINK_OFICIAL_DE_PESQUISA",
          externalVerificationNote:
            "Há link oficial de pesquisa para conferência manual, mas sem confirmação automática da fonte nesta etapa.",
          externalVerifiedAt: null,
          externalVerificationExcerpt: null,
        } satisfies JuridicalAiCitationCheck;
      }

      return {
        ...check,
        externalVerificationStatus: "SEM_CONFIRMACAO_EXTERNA",
        externalVerificationNote:
          "A referência ainda depende de confirmação manual ou enriquecimento adicional de fonte.",
        externalVerifiedAt: null,
        externalVerificationExcerpt: null,
      } satisfies JuridicalAiCitationCheck;
    }),
  );
}
