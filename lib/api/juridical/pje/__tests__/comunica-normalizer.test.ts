import {
  extractCnjNumbers,
  findProcessoByNumero,
  formatNumeroCnj,
  mapComunicaItemsToProcessos,
} from "@/lib/api/juridical/pje/comunica-normalizer";

describe("comunica-normalizer", () => {
  it("deve formatar numero CNJ a partir de 20 digitos", () => {
    expect(formatNumeroCnj("00012345620248050001")).toBe(
      "0001234-56.2024.8.05.0001",
    );
  });

  it("deve extrair CNJ de payload textual e numerico", () => {
    const payload = {
      texto: "Intimação no processo 0001234-56.2024.8.05.0001",
      nested: {
        numero: "00099998820238010001",
      },
    };

    const numeros = extractCnjNumbers(payload);

    expect(numeros).toContain("0001234-56.2024.8.05.0001");
    expect(numeros).toContain("0009999-88.2023.8.01.0001");
  });

  it("deve mapear itens do comunica em processos sem duplicar numero", () => {
    const items = [
      {
        id: "1",
        descricao: "Processo 0001234-56.2024.8.05.0001",
        tribunal: "TJBA",
      },
      {
        id: "2",
        numeroProcesso: "00012345620248050001",
        tribunal: "TJBA",
      },
      {
        id: "3",
        numeroProcesso: "00088887720248050001",
        tribunal: "TJBA",
      },
    ];

    const processos = mapComunicaItemsToProcessos(items as Record<string, unknown>[]);

    expect(processos).toHaveLength(2);
    expect(processos[0].numeroProcesso).toBe("0001234-56.2024.8.05.0001");
    expect(processos[1].numeroProcesso).toBe("0008888-77.2024.8.05.0001");
  });

  it("deve encontrar processo pelo numero informado", () => {
    const items = [
      {
        numeroProcesso: "00012345620248050001",
        descricao: "Teste",
      },
    ];

    const processo = findProcessoByNumero(
      items as Record<string, unknown>[],
      "0001234-56.2024.8.05.0001",
    );

    expect(processo).not.toBeNull();
    expect(processo?.numeroProcesso).toBe("0001234-56.2024.8.05.0001");
  });
});
