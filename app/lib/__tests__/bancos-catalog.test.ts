import {
  buildBancoCatalogQualitySummary,
  validateBancoInput,
} from "@/app/lib/bancos/catalog-utils";

describe("catalog utils de bancos", () => {
  it("identifica conflitos por nome e por ISPB", () => {
    const summary = buildBancoCatalogQualitySummary([
      {
        codigo: "041",
        nome: "Banrisul",
        nomeCompleto: "Banco do Estado do Rio Grande do Sul S.A.",
        ispb: "92702067",
      },
      {
        codigo: "422",
        nome: "Banrisul",
        nomeCompleto: "Banco do Estado do Rio Grande do Sul S.A.",
        ispb: "92702067",
      },
      {
        codigo: "341",
        nome: "Itaú",
        nomeCompleto: "Itaú Unibanco S.A.",
        ispb: "60701190",
      },
    ]);

    expect(summary.anomalyCodes).toEqual(["041", "422"]);
    expect(summary.signalsByCodigo["041"]).toHaveLength(2);
    expect(summary.signalsByCodigo["422"]).toHaveLength(2);
    expect(summary.signalsByCodigo["341"]).toBeUndefined();
  });

  it("normaliza e valida campos críticos do catálogo", () => {
    const result = validateBancoInput({
      codigo: "41",
      nome: "  Banrisul  ",
      site: "banrisul.com.br",
      cnpj: "92.702.067/0001-96",
      ispb: "92702067",
    });

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.data.codigo).toBe("041");
    expect(result.data.nome).toBe("Banrisul");
    expect(result.data.site).toBe("https://banrisul.com.br/");
    expect(result.data.cnpj).toBe("92702067000196");
    expect(result.data.ispb).toBe("92702067");
  });

  it("rejeita código, ISPB e CNPJ inválidos", () => {
    const result = validateBancoInput({
      codigo: "abc",
      nome: "X",
      cnpj: "123",
      ispb: "1",
      site: "nota url",
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Informe um código COMPE com 3 dígitos.");
    expect(result.errors).toContain(
      "Informe o nome da instituição com pelo menos 2 caracteres.",
    );
    expect(result.errors).toContain("ISPB deve conter 8 dígitos.");
    expect(result.errors).toContain("CNPJ inválido.");
    expect(result.errors).toContain("Informe uma URL válida para o site.");
  });
});
