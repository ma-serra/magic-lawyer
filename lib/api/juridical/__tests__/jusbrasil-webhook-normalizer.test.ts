import { mapJusbrasilWebhookBatchToProcessos } from "@/lib/api/juridical/jusbrasil-webhook-normalizer";

describe("jusbrasil-webhook-normalizer", () => {
  it("mapeia anexos do lote webhook para documentos do processo", () => {
    const processos = mapJusbrasilWebhookBatchToProcessos({
      correlationId: "corr-1",
      processos: [
        {
          cnj: "00012345620248050001",
          tribunal: { nome: "Tribunal de Justica da Bahia", sigla: "TJBA" },
          estado: { sigla: "BA" },
          comarca: { nome: "Salvador" },
          processo_classe_unificada: { nome: "Procedimento Comum Civel" },
          processo_partes: [
            {
              ator: { nome: "Cliente Teste" },
              ator_relacao: { nome: "Autor", classificacao_polo: "ATIVO" },
            },
          ],
          anexos: [
            [
              1,
              "https://storage.example.com/doc-webhook.pdf?token=abc",
              "PDF",
              "2026-03-30T10:00:00.000Z",
              "2026-03-30T10:05:00.000Z",
              999,
              "Publicacao integral",
            ],
          ],
          movimentacoes: [],
        },
      ],
    });

    expect(processos).toHaveLength(1);
    expect(processos[0]?.numeroProcesso).toBe("0001234-56.2024.8.05.0001");
    expect(processos[0]?.documentos?.[0]).toMatchObject({
      nome: "Publicacao integral",
      tipo: "PDF",
      link: "https://storage.example.com/doc-webhook.pdf?token=abc",
    });
  });
});
