import { runLocalJuridicalAiEngine } from "@/app/lib/juridical-ai/engine";

describe("juridical ai engine", () => {
  it("classifica referências jurídicas em validação de citações", () => {
    const result = runLocalJuridicalAiEngine({
      taskKey: "CITATION_VALIDATION",
      question:
        "Nos termos do art. 5º da Constituição Federal, da Lei nº 8.078/90 e do REsp 123456/STJ, requer-se a tutela.",
    });

    expect(result.type).toBe("generic");

    if (result.type !== "generic") {
      throw new Error("Resultado inesperado para validação de citações.");
    }

    expect(result.citationChecks).toBeDefined();
    expect(result.citationChecks?.length).toBeGreaterThan(0);
    expect(
      result.citationChecks?.some(
        (item) => item.sourceType === "LEGAL" && item.status === "CONFIRMAVEL",
      ),
    ).toBe(true);
    expect(
      result.citationChecks?.some(
        (item) =>
          item.sourceType === "JURISPRUDENCE" &&
          (item.status === "CONFIRMAVEL" || item.status === "INCOMPLETA"),
      ),
    ).toBe(true);
  });

  it("estrutura um briefing de pesquisa jurisprudencial com consultas e checklist", () => {
    const result = runLocalJuridicalAiEngine({
      taskKey: "JURISPRUDENCE_BRIEF",
      objective: "Responsabilidade civil por negativa indevida de cobertura de plano de saúde",
      notes: "Priorizar STJ, dano moral e tutela de urgência",
      processContext: {
        numero: "0001234-56.2025.8.05.0001",
        tribunal: "TJBA",
        area: "Direito do consumidor",
        fase: "Conhecimento",
      },
    });

    expect(result.type).toBe("generic");

    if (result.type !== "generic") {
      throw new Error("Resultado inesperado para briefing jurisprudencial.");
    }

    expect(result.researchPlan).toBeDefined();
    expect(result.researchPlan?.primaryQueries.length).toBeGreaterThan(0);
    expect(result.researchPlan?.targetCourts).toContain("TJBA");
    expect(result.researchPlan?.targetCourts).toContain("STJ");
    expect(result.researchPlan?.validationChecklist.length).toBeGreaterThan(0);
  });

  it("gera peça com bases utilizadas e seções de prova e contraponto", () => {
    const result = runLocalJuridicalAiEngine({
      taskKey: "PIECE_DRAFTING",
      title: "Contestação",
      objective: "Impugnar cobrança indevida",
      thesis: "Ausência de contratação válida",
      documentName: "Contrato social.pdf",
      modelName: "Modelo padrão do escritório",
      processContext: {
        numero: "0001234-56.2025.8.05.0001",
        tribunal: "TJBA",
        cliente: "Cliente XPTO",
        documentosCount: 3,
        movimentacoesCount: 5,
      },
    });

    expect(result.type).toBe("piece");

    if (result.type !== "piece") {
      throw new Error("Resultado inesperado para geração de peça.");
    }

    expect(result.contentMarkdown).toContain("## 3. Bases utilizadas");
    expect(result.contentMarkdown).toContain("Modelo padrão do escritório");
    expect(result.contentMarkdown).toContain("## 7. Pontos de prova e sustentacao");
    expect(result.contentMarkdown).toContain("## 9. Riscos e contrapontos");
    expect(result.sourceLeads?.some((item) => item.sourceType === "PROCESSO")).toBe(true);
    expect(result.sourceLeads?.some((item) => item.sourceType === "MODELO_INTERNO")).toBe(true);
    expect(
      result.sourceLeads?.some((item) => item.sourceType === "DOCUMENTO_INTERNO"),
    ).toBe(true);
    expect(
      result.sourceLeads?.some(
        (item) =>
          item.sourceType === "PROCESSO" &&
          (item.verificationLinks?.length ?? 0) > 0,
      ),
    ).toBe(true);
  });

  it("gera lastro verificável com memória, causas e referências extraídas", () => {
    const result = runLocalJuridicalAiEngine({
      taskKey: "CITATION_VALIDATION",
      question:
        "Nos termos do art. 5º da Constituição Federal e do REsp 123456/STJ, a tese merece provimento.",
      processContext: {
        numero: "0001234-56.2025.8.05.0001",
        tribunal: "TJBA",
        documentos: [{ nome: "Contrato principal.pdf", tipo: "CONTRATO" }],
        causas: [
          {
            nome: "Responsabilidade civil",
            codigoCnj: "1234",
            isOficial: true,
            principal: true,
          },
        ],
      },
      caseMemory: {
        title: "Caso plano de saúde",
        summary: "Estratégia focada em tutela de urgência e dano moral.",
      },
    });

    expect(result.type).toBe("generic");

    if (result.type !== "generic") {
      throw new Error("Resultado inesperado para geração de lastro verificável.");
    }

    expect(result.sourceLeads?.some((item) => item.sourceType === "PROCESSO")).toBe(true);
    expect(
      result.sourceLeads?.some((item) => item.sourceType === "CAUSA_OFICIAL"),
    ).toBe(true);
    expect(
      result.sourceLeads?.some((item) => item.sourceType === "DOCUMENTO_INTERNO"),
    ).toBe(true);
    expect(
      result.sourceLeads?.some((item) => item.sourceType === "MEMORIA_DO_CASO"),
    ).toBe(true);
    expect(
      result.sourceLeads?.some((item) => item.sourceType === "REFERENCIA_EXTRAIDA"),
    ).toBe(true);
    expect(
      result.citationChecks?.some(
        (item) => item.sourceType === "LEGAL" && (item.verificationLinks?.length ?? 0) > 0,
      ),
    ).toBe(true);
  });

  it("estrutura o cálculo preliminar de sentença cível com condenações e memorial", () => {
    const result = runLocalJuridicalAiEngine({
      taskKey: "SENTENCE_CALCULATION",
      objective: "Montar memorial preliminar para cumprimento de sentença",
      documentName: "Sentenca parcial procedente.pdf",
      documentText: `Diante de todo o exposto, JULGO PARCIALMENTE PROCEDENTES os pedidos para:
      a) DECLARAR a abusividade das faturas de consumo dos meses de maio, junho e julho de 2023, determinando a EMBASA que promova o refaturamento dos respectivos débitos com base na média de consumo dos 12 meses anteriores ao mês de maio/2023, no prazo de 15 dias, sob pena de multa diária de R$ 100,00, limitada a R$ 20.000,00;
      b) DETERMINAR que, em relação à fatura de maio de 2023, a quantia depositada em juízo pela parte autora seja liberada à EMBASA até o limite do valor que vier a ser apurado na refatura, autorizando-se o levantamento do excedente pela parte autora;
      c) CONDENAR a EMBASA à restituição em dobro dos valores pagos a maior relativamente às faturas de junho e julho de 2023, conforme o artigo 42, parágrafo único, do Código de Defesa do Consumidor, com atualização monetária pelo IPCA desde a data do pagamento indevido e juros de mora pela taxa SELIC, deduzido o IPCA, a contar da citação;
      d) CONDENAR a EMBASA ao pagamento de indenização por danos morais no valor de R$ 4.000,00, corrigido monetariamente pelo IPCA desde a data da presente sentença e com incidência de juros de mora pela taxa SELIC, deduzido o IPCA, a partir da citação;
      e) JULGAR IMPROCEDENTES os pedidos formulados em face do BANCO BRADESCO S/A.`,
    });

    expect(result.type).toBe("generic");

    if (result.type !== "generic") {
      throw new Error("Resultado inesperado para cálculo de sentença.");
    }

    expect(result.sentenceCalculation).toBeDefined();
    expect(result.sentenceCalculation?.condemnedItems.length).toBeGreaterThanOrEqual(4);
    expect(
      result.sentenceCalculation?.condemnedItems.some(
        (item) => item.nature === "RESTITUICAO",
      ),
    ).toBe(true);
    expect(
      result.sentenceCalculation?.condemnedItems.some(
        (item) => item.nature === "INDENIZACAO",
      ),
    ).toBe(true);
    expect(
      result.sentenceCalculation?.condemnedItems.some(
        (item) => item.nature === "LIBERACAO_DE_VALOR",
      ),
    ).toBe(true);
    expect(
      result.sentenceCalculation?.condemnedItems.some(
        (item) => item.nature === "IMPROCEDENCIA",
      ),
    ).toBe(true);
    expect(result.sentenceCalculation?.memorialDraft).toContain(
      "Memorial preliminar de cálculo",
    );
  });
});
