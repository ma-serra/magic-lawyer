import { extractJusbrasilSupportedProcessEvents } from "@/lib/api/juridical/jusbrasil-webhook-events";

function normalizeText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

describe("jusbrasil-webhook-events", () => {
  it("mapeia movimentacoes dedicadas do evt 1", () => {
    const events = extractJusbrasilSupportedProcessEvents([
      {
        id: 101,
        evt_type: 1,
        target_number: "0001234-56.2024.8.05.0001",
        source_user_custom: "mlproc:v1:tenant-1:proc-1:00012345620248050001",
        created_at: "2026-03-26T10:00:00.000Z",
        data: [
          ["2026-03-26T09:00:00.000Z", "Intimacao", "Intimacao da parte autora"],
          ["2026-03-26T09:30:00.000Z", "Prazo", "Prazo de 5 dias"],
        ],
      },
    ]);

    expect(events).toHaveLength(1);
    expect(events[0]?.evtType).toBe(1);
    expect(events[0]?.movimentacoes).toHaveLength(2);
    expect(events[0]?.movimentacoes[0]).toMatchObject({
      tipo: "Intimacao",
      descricao: "Intimacao da parte autora",
      categoria: "INTIMACAO",
    });
    expect(events[0]?.movimentacoes[1]).toMatchObject({
      tipo: "Prazo",
      descricao: "Prazo de 5 dias",
      categoria: "PRAZO",
    });
  });

  it("mapeia publicacoes processuais do evt 2 para movimentacoes persistiveis", () => {
    const events = extractJusbrasilSupportedProcessEvents([
      {
        id: 202,
        evt_type: 2,
        target_number: "0001234-56.2024.8.05.0001",
        created_at: "2026-03-26T12:00:00.000Z",
        data: [
          {
            proc: "0001234-56.2024.8.05.0001",
            snippet: "Intimacao do advogado para manifestacao",
            texto: "Publicacao integral do diario",
            assunto: "Manifestacao",
            advs: "Fulano de Tal",
            published_at: "2026-03-26T11:00:00.000Z",
            docurl: "https://example.com/publicacao/1",
          },
        ],
      },
    ]);

    expect(events).toHaveLength(1);
    expect(events[0]?.evtType).toBe(2);
    if (events[0]?.evtType !== 2) {
      throw new Error("Esperava evt 2");
    }

    expect(events[0].publications).toHaveLength(1);
    expect(events[0].publications[0]).toMatchObject({
      processoNumero: "0001234-56.2024.8.05.0001",
      snippet: "Intimacao do advogado para manifestacao",
      assunto: "Manifestacao",
    });
    expect(events[0].movimentacoes[0]).toMatchObject({
      categoria: "INTIMACAO",
      linkDocumento: "https://example.com/publicacao/1",
    });
    expect(normalizeText(events[0].movimentacoes[0]?.tipo || "")).toBe(
      "Publicacao processual",
    );
    expect(events[0].movimentacoes[0]?.descricao).toContain(
      "Publicacao integral do diario",
    );
  });

  it("mapeia mudancas de processo do evt 7 com snapshot e sumario", () => {
    const events = extractJusbrasilSupportedProcessEvents([
      {
        id: 303,
        evt_type: 7,
        target_number: "0001234-56.2024.8.05.0001",
        source_user_custom: "mlproc:v1:tenant-1:proc-1:00012345620248050001",
        created_at: "2026-03-26T15:00:00.000Z",
        data: {
          changes: {
            audiencias: {
              $insert: [
                [0, ["2026-04-02T13:00:00.000Z", "Sala 2", "Instrucao"]],
              ],
            },
            anexos: {
              $insert: [
                [0, [null, "https://example.com/anexo/1", null, "2026-03-26T14:00:00.000Z", "Peticao juntada"]],
              ],
            },
            partes: {
              $insert: [
                [0, [null, null, "Empresa Reu Ltda", null, null, null, null, null, "PASSIVO"]],
              ],
              $delete: [[0]],
              reu_0: {
                advogados: {
                  $insert: [[0, ["12345/BA", "Advogado Novo"]]],
                },
              },
            },
            valor: {
              $set: 15000,
            },
          },
          new: {
            cnj: "00012345620248050001",
            tribunal: {
              sigla: "TJBA",
            },
            estado: {
              sigla: "BA",
            },
            processo_classe_unificada: {
              nome: "Procedimento Comum Civel",
            },
            processo_partes: [
              {
                ator: {
                  nome: "Cliente Teste",
                },
                ator_relacao: {
                  nome: "Autor",
                  classificacao_polo: "ATIVO",
                },
              },
              {
                ator: {
                  nome: "Empresa Reu Ltda",
                },
                ator_relacao: {
                  nome: "Reu",
                  classificacao_polo: "PASSIVO",
                },
              },
            ],
            movimentacoes: [],
          },
        },
      },
    ]);

    expect(events).toHaveLength(1);
    expect(events[0]?.evtType).toBe(7);
    if (events[0]?.evtType !== 7) {
      throw new Error("Esperava evt 7");
    }

    expect(events[0].mappedProcess?.numeroProcesso).toBe(
      "0001234-56.2024.8.05.0001",
    );
    expect(events[0].changeSummary).toMatchObject({
      insertedHearings: 1,
      insertedAttachments: 1,
      insertedParties: 1,
      insertedLawyers: 1,
      deletedParties: 1,
      changedFields: ["valor"],
    });
    expect(
      events[0].movimentacoes.map((movimentacao) =>
        normalizeText(movimentacao.tipo || ""),
      ),
    ).toEqual(
      expect.arrayContaining([
        "Mudanca em processo - nova audiencia",
        "Mudanca em processo - novo anexo",
        "Mudanca em processo - nova parte no processo",
        "Mudanca em processo - exclusao de parte no processo",
        "Mudanca em processo - novo advogado para uma parte",
        "Mudanca em processo - campos cadastrais atualizados",
      ]),
    );
  });

  it("mapeia distribuicao do evt 4 como snapshot completo do processo", () => {
    const events = extractJusbrasilSupportedProcessEvents([
      {
        id: 404,
        evt_type: 4,
        target_number: "0001234-56.2024.8.05.0001",
        created_at: "2026-03-26T16:00:00.000Z",
        data: {
          numero: "00012345620248050001",
          tribunal: "TJBA",
          uf: "BA",
          classeNatureza: "Procedimento Comum Civel",
          comarca: "Salvador",
          vara: "5 Vara Civel",
          valor: 25000.55,
          distribuicaoData: "2026-03-26T15:30:00.000Z",
          juiz: "Magistrado Exemplo",
          partes: [
            [1, null, "Cliente Exemplo", null, null, null, "123.456.789-00", null, "AUTOR", []],
            [2, null, "Empresa Reu Ltda", null, null, null, "12.345.678/0001-99", null, "REU", []],
          ],
          movs: [
            [
              "2026-03-26T15:40:00.000Z",
              "Distribuido",
              "Processo distribuido por sorteio",
            ],
          ],
        },
      },
    ]);

    expect(events).toHaveLength(1);
    expect(events[0]?.evtType).toBe(4);
    if (events[0]?.evtType !== 4) {
      throw new Error("Esperava evt 4");
    }

    expect(events[0].mappedProcess?.numeroProcesso).toBe(
      "0001234-56.2024.8.05.0001",
    );
    expect(events[0].mappedProcess?.movimentacoes).toHaveLength(1);
    expect(events[0].movimentacoes[0]).toMatchObject({
      tipo: "Distribuido",
      descricao: "Processo distribuido por sorteio",
    });
  });

  it("mapeia atualizacao por demanda do evt 13 como snapshot tribproc", () => {
    const events = extractJusbrasilSupportedProcessEvents([
      {
        id: 1301,
        evt_type: 13,
        target_number: "0001234-56.2024.8.05.0001",
        source_user_custom: "mlproc:v1:tenant-1:proc-1:00012345620248050001",
        created_at: "2026-03-26T17:00:00.000Z",
        data: {
          numero: "00012345620248050001",
          tribunal: "TJBA",
          uf: "BA",
          classeNatureza: "Procedimento Comum Civel",
          comarca: "Salvador",
          vara: "5 Vara Civel",
          alteradoEm: "2026-03-26T16:59:00.000Z",
          partes: [
            [1, null, "Cliente Exemplo", null, null, null, "123.456.789-00", null, "AUTOR", []],
          ],
          movs: [
            [
              "2026-03-26T16:58:00.000Z",
              "Despacho",
              "Despacho atualizado no tribunal",
            ],
          ],
        },
      },
    ]);

    expect(events).toHaveLength(1);
    expect(events[0]?.evtType).toBe(13);
    if (events[0]?.evtType !== 13) {
      throw new Error("Esperava evt 13");
    }

    expect(events[0].mappedProcess?.numeroProcesso).toBe(
      "0001234-56.2024.8.05.0001",
    );
    expect(events[0].movimentacoes[0]).toMatchObject({
      tipo: "Despacho",
      descricao: "Despacho atualizado no tribunal",
    });
  });
});
