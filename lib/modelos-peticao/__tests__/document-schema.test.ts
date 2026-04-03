import {
  createModeloPeticaoDocument,
  normalizeModeloPeticaoDocument,
  resolveModeloPeticaoDocumentVariables,
  serializeModeloPeticaoDocumentToText,
} from "@/lib/modelos-peticao/document-schema";

describe("modelo peticao document schema", () => {
  it("hidrata conteúdo legado em um documento estruturado compatível", () => {
    const document = normalizeModeloPeticaoDocument(null, {
      conteudo: "Linha um\n\nLinha dois",
      presetKey: "custom",
    });

    expect(document.preset.key).toBe("custom");
    expect(document.bodyHtml).toContain("Linha um");
    expect(document.bodyBlocks.length).toBeGreaterThan(0);
  });

  it("mantém a logo do tenant no cabeçalho quando o preset é criado", () => {
    const document = createModeloPeticaoDocument("trabalhista-contestacao", {
      name: "Escritório Exemplo",
      logoUrl: "https://cdn.exemplo.com/logo.png",
    });

    expect(document.header.imageMode).toBe("tenant_logo");
    expect(document.media[0]?.url).toBe("https://cdn.exemplo.com/logo.png");
  });

  it("resolve variáveis em cabeçalho, corpo e rodapé", () => {
    const document = createModeloPeticaoDocument("criminal-resposta", {
      name: "Escritório Exemplo",
    });
    const resolved = resolveModeloPeticaoDocumentVariables(document, {
      escritorio_nome: "Escritório Exemplo",
      reu_nome: "João da Silva",
      comarca_nome: "Salvador",
      data_atual: "03/04/2026",
      advogado_nome: "Defensor Teste",
      advogado_oab: "BA 12345",
    });
    const text = serializeModeloPeticaoDocumentToText(resolved);

    expect(text).toContain("João da Silva");
    expect(text).toContain("Defensor Teste");
    expect(text).toContain("Salvador");
  });
  it("materializa o preset trabalhista com vocabulário de reclamante e reclamada", () => {
    const document = createModeloPeticaoDocument("trabalhista-contestacao", {
      name: "Escritorio Exemplo",
    });
    const text = serializeModeloPeticaoDocumentToText(document);

    expect(document.preset.key).toBe("trabalhista-contestacao");
    expect(document.partyVocabulary.primaryPartyLabel).toBe("Reclamada");
    expect(document.partyVocabulary.opposingPartyLabel).toBe("Reclamante");
    expect(text).toContain("{{reclamante_nome}}");
    expect(text).toContain("{{reclamada_nome}}");
  });

  it("materializa o preset criminal com vocabulario de reu e ministerio publico", () => {
    const document = createModeloPeticaoDocument("criminal-resposta", {
      name: "Escritorio Exemplo",
    });
    const text = serializeModeloPeticaoDocumentToText(document);

    expect(document.preset.key).toBe("criminal-resposta");
    expect(document.partyVocabulary.primaryPartyLabel).toBe("Réu");
    expect(document.partyVocabulary.prosecutorLabel).toBe("Ministério Público");
    expect(text).toContain("{{reu_nome}}");
    expect(text).toContain("resposta à acusação");
  });
});
