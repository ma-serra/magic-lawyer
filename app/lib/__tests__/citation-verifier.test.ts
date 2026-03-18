import { enrichCitationChecksWithExternalVerification } from "@/app/lib/juridical-ai/citation-verifier";
import type { JuridicalAiCitationCheck } from "@/app/lib/juridical-ai/types";

describe("citation verifier", () => {
  it("confirma fonte oficial quando o link direto responde com sucesso", async () => {
    const checks: JuridicalAiCitationCheck[] = [
      {
        label: "art. 5 da Constituição Federal",
        normalizedReference: "art. 5 da Constituição Federal",
        sourceType: "LEGAL",
        status: "CONFIRMAVEL",
        rationale: "Referência legal identificável.",
        guidance: "Conferir aderência ao caso concreto.",
        verificationLinks: [
          {
            label: "Ver diploma oficial",
            href: "https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm",
            kind: "EXTERNAL",
            authority: "Planalto",
            accessMode: "DIRECT",
          },
        ],
      },
    ];

    const result = await enrichCitationChecksWithExternalVerification(
      checks,
      (async () =>
        ({
          ok: true,
          text: async () =>
            "<html><body><p>Art. 5º Todos são iguais perante a lei.</p></body></html>",
        }) as Response) as typeof fetch,
    );

    expect(result[0]?.externalVerificationStatus).toBe("CONFIRMADA_FONTE_OFICIAL");
    expect(result[0]?.externalVerificationNote).toContain("Artigo 5");
    expect(result[0]?.externalVerifiedAt).toBeTruthy();
    expect(result[0]?.externalVerificationExcerpt).toContain("Art. 5");
  });

  it("sinaliza pesquisa oficial quando só há link de busca externa", async () => {
    const checks: JuridicalAiCitationCheck[] = [
      {
        label: "Tema 123 do STJ",
        normalizedReference: "Tema 123 do STJ",
        sourceType: "JURISPRUDENCE",
        status: "INCOMPLETA",
        rationale: "Há indício de precedente.",
        guidance: "Completar tribunal e tema.",
        verificationLinks: [
          {
            label: "Pesquisar no STJ",
            href: "https://scon.stj.jus.br/SCON/",
            kind: "EXTERNAL",
            authority: "STJ",
            accessMode: "SEARCH",
          },
        ],
      },
    ];

    const result = await enrichCitationChecksWithExternalVerification(
      checks,
      (async () => ({ ok: false, text: async () => "" } as Response)) as typeof fetch,
    );

    expect(result[0]?.externalVerificationStatus).toBe("LINK_OFICIAL_DE_PESQUISA");
    expect(result[0]?.externalVerificationNote).toContain("conferência manual");
    expect(result[0]?.externalVerifiedAt).toBeNull();
  });

  it("marca indisponibilidade quando a fonte oficial não responde", async () => {
    const checks: JuridicalAiCitationCheck[] = [
      {
        label: "art. 186 do Código Civil",
        normalizedReference: "art. 186 do Código Civil",
        sourceType: "LEGAL",
        status: "CONFIRMAVEL",
        rationale: "Referência legal identificável.",
        guidance: "Conferir redação do artigo.",
        verificationLinks: [
          {
            label: "Ver diploma oficial",
            href: "https://www.planalto.gov.br/ccivil_03/leis/2002/l10406compilada.htm",
            kind: "EXTERNAL",
            authority: "Planalto",
            accessMode: "DIRECT",
          },
        ],
      },
    ];

    const result = await enrichCitationChecksWithExternalVerification(
      checks,
      (async () => ({ ok: false } as Response)) as typeof fetch,
    );

    expect(result[0]?.externalVerificationStatus).toBe("FONTE_EXTERNA_INDISPONIVEL");
    expect(result[0]?.externalVerificationNote).toContain("Não foi possível confirmar");
  });

  it("marca restrição quando a fonte oficial responde com desafio automatizado", async () => {
    const checks: JuridicalAiCitationCheck[] = [
      {
        label: "art. 102 da Constituição Federal",
        normalizedReference: "art. 102 da Constituição Federal",
        sourceType: "LEGAL",
        status: "CONFIRMAVEL",
        rationale: "Referência legal identificável.",
        guidance: "Conferir redação do artigo.",
        verificationLinks: [
          {
            label: "Pesquisar no STF",
            href: "https://jurisprudencia.stf.jus.br/pages/search",
            kind: "EXTERNAL",
            authority: "STF",
            accessMode: "DIRECT",
          },
        ],
      },
    ];

    const result = await enrichCitationChecksWithExternalVerification(
      checks,
      (async () =>
        ({
          ok: false,
          status: 202,
          headers: {
            get: (name: string) =>
              name.toLowerCase() === "x-amzn-waf-action" ? "challenge" : null,
          },
          text: async () => "",
        }) as Response) as typeof fetch,
    );

    expect(result[0]?.externalVerificationStatus).toBe("PORTAL_OFICIAL_COM_RESTRICAO");
    expect(result[0]?.externalVerificationNote).toContain("restrição");
  });

  it("não confirma quando a fonte oficial abre, mas o artigo não bate", async () => {
    const checks: JuridicalAiCitationCheck[] = [
      {
        label: "art. 999 do Código Civil",
        normalizedReference: "art. 999 do Código Civil",
        sourceType: "LEGAL",
        status: "CONFIRMAVEL",
        rationale: "Referência legal identificável.",
        guidance: "Conferir redação do artigo.",
        verificationLinks: [
          {
            label: "Ver diploma oficial",
            href: "https://www.planalto.gov.br/ccivil_03/leis/2002/l10406compilada.htm",
            kind: "EXTERNAL",
            authority: "Planalto",
            accessMode: "DIRECT",
          },
        ],
      },
    ];

    const result = await enrichCitationChecksWithExternalVerification(
      checks,
      (async () =>
        ({
          ok: true,
          text: async () => "<html><body><p>Art. 186. Aquele que, por ação...</p></body></html>",
        }) as Response) as typeof fetch,
    );

    expect(result[0]?.externalVerificationStatus).toBe("FONTE_OFICIAL_SEM_MATCH");
    expect(result[0]?.externalVerificationNote).toContain("não foi localizado automaticamente");
    expect(result[0]?.externalVerificationExcerpt).toBeNull();
  });

  it("confirma jurisprudência quando há match no LexML", async () => {
    const checks: JuridicalAiCitationCheck[] = [
      {
        label: "Tema 123 do STJ",
        normalizedReference: "Tema 123 do STJ",
        sourceType: "JURISPRUDENCE",
        status: "INCOMPLETA",
        rationale: "Há indício de precedente.",
        guidance: "Completar tribunal e tema.",
        verificationLinks: [
          {
            label: "Pesquisar no LexML (Jurisprudência)",
            href: "https://www.lexml.gov.br/busca/search?keyword=Tema%20123%20STJ;f1-tipoDocumento=Jurisprud%C3%AAncia",
            kind: "EXTERNAL",
            authority: "LexML Brasil",
            accessMode: "SEARCH",
          },
        ],
      },
    ];

    const result = await enrichCitationChecksWithExternalVerification(
      checks,
      (async () =>
        ({
          ok: true,
          text: async () =>
            '<span id="itemCount">102</span><td class="col2"><b>Autoridade  </b></td><td class="col3">Superior Tribunal de Justiça</td><td class="col2"><b>Título  </b></td><td class="col3"><a href="/urn/urn:lex:br:superior.tribunal.justica:tema.123">Tema 123 STJ - recurso repetitivo</a></td>',
        }) as Response) as typeof fetch,
    );

    expect(result[0]?.externalVerificationStatus).toBe("CONFIRMADA_EM_BUSCA_OFICIAL");
    expect(result[0]?.externalVerificationNote).toContain("102 correspondência");
    expect(result[0]?.externalVerificationExcerpt).toContain("Tema 123 STJ");
    expect(
      result[0]?.verificationLinks?.some((link) => link.label === "Abrir primeiro resultado no LexML"),
    ).toBe(true);
  });

  it("sinaliza portal oficial online quando a busca pública responde sem confirmação estruturada", async () => {
    const checks: JuridicalAiCitationCheck[] = [
      {
        label: "Tema 123 do TSE",
        normalizedReference: "Tema 123 do TSE",
        sourceType: "JURISPRUDENCE",
        status: "INCOMPLETA",
        rationale: "Há indício de precedente.",
        guidance: "Completar tribunal e tema.",
        verificationLinks: [
          {
            label: "Pesquisar no TSE",
            href: "https://jurisprudencia.tse.jus.br/#/jurisprudencia",
            kind: "EXTERNAL",
            authority: "TSE",
            accessMode: "SEARCH",
          },
        ],
      },
    ];

    const result = await enrichCitationChecksWithExternalVerification(
      checks,
      (async () =>
        ({
          ok: true,
          status: 200,
          headers: { get: () => null },
          text: async () => "<html><body><title>Jurisprudência da Justiça Eleitoral</title></body></html>",
        }) as unknown as Response) as typeof fetch,
    );

    expect(result[0]?.externalVerificationStatus).toBe("LINK_OFICIAL_DE_PESQUISA");
    expect(result[0]?.externalVerificationNote).toContain("está online");
  });
});
