import { mapJusbrasilTribprocProcessoToProcesso } from "@/lib/api/juridical/jusbrasil-tribproc-normalizer";

describe("jusbrasil-tribproc-normalizer", () => {
  it("mapeia payload do tribproc para o formato juridico interno", () => {
    const processo = mapJusbrasilTribprocProcessoToProcesso({
      numero: "10006139020198110022",
      numeroAlternativo: "1000613-90.2019.8.11.0022",
      tribunal: "TJMT",
      uf: "MT",
      vara: "VARA UNICA",
      comarca: "PEDRA PRETA",
      classeNatureza: "PROCEDIMENTO COMUM CIVEL",
      classes: ["Obrigacoes", "Direito Civil"],
      valor: 12345.67,
      distribuicaoData: "2019-01-10",
      criadoEm: "2019-01-10T12:00:00.000Z",
      situacao: "MOVIMENTO",
      arquivado: false,
      extinto: 0,
      fonte_sistema: "TJMT PJE",
      alteradoEm: "2026-03-30T12:00:00.000Z",
      juiz: "MAGISTRADO TESTE",
      partes: [
        [
          1,
          100,
          "Sandra Quesia de Souza Costa Porto",
          "SANDRA QUESIA DE SOUZA COSTA PORTO",
          null,
          "94342253534",
          "943.422.535-34",
          40,
          "REQUERENTE",
          [[1, "Advogado Teste", "BA19872", null, "adv@example.com"]],
        ],
        [
          2,
          200,
          "Empresa Re",
          "EMPRESA RE",
          null,
          null,
          null,
          41,
          "REQUERIDO",
          [],
        ],
        [
          3,
          300,
          "Juiz X",
          "JUIZ X",
          null,
          null,
          null,
          1,
          "RELATOR JUIZ",
          [],
        ],
      ],
      movs: [
        [
          "2026-03-29",
          "Andamento - Publicado",
          "Publicado no DJE",
          "https://example.com/doc",
        ],
      ],
      anexos: [
        [
          99,
          "https://storage.example.com/doc-1.pdf?Expires=123",
          "PDF",
          "2026-03-28T10:00:00.000Z",
          "2026-03-29T10:00:00.000Z",
          12345,
          "Peticao inicial",
        ],
      ],
    });

    expect(processo).not.toBeNull();
    expect(processo?.numeroProcesso).toBe("1000613-90.2019.8.11.0022");
    expect(processo?.tribunalSigla).toBe("TJMT");
    expect(processo?.comarca).toBe("PEDRA PRETA");
    expect(processo?.classe).toBe("PROCEDIMENTO COMUM CIVEL");
    expect(processo?.statusTribunalArquivado).toBe(false);
    expect(processo?.statusTribunalExtinto).toBe(false);
    expect(processo?.partes).toHaveLength(2);
    expect(processo?.partes?.[0]).toMatchObject({
      tipo: "AUTOR",
      nome: "Sandra Quesia de Souza Costa Porto",
      documento: "943.422.535-34",
    });
    expect(processo?.partes?.[0]?.advogados?.[0]).toMatchObject({
      nome: "Advogado Teste",
      oabNumero: "19872",
      oabUf: "BA",
    });
    expect(processo?.movimentacoes?.[0]).toMatchObject({
      tipo: "Andamento - Publicado",
      descricao: "Publicado no DJE",
      linkDocumento: "https://example.com/doc",
    });
    expect(processo?.documentos?.[0]).toMatchObject({
      nome: "Peticao inicial",
      tipo: "PDF",
      link: "https://storage.example.com/doc-1.pdf?Expires=123",
    });
  });
});
