import {
  MovimentacaoPrioridade,
  MovimentacaoTipo,
  PeticaoStatus,
} from "@/generated/prisma";

import {
  buildDiscoveryBacklogReasons,
  buildProtocolReadiness,
  classifyOperationalCommunication,
  hasExternalDiscoverySignal,
} from "@/app/lib/juridical/operations-hub";

describe("operations hub helpers", () => {
  it("classifies explicit intimacoes first", () => {
    expect(
      classifyOperationalCommunication({
        tipo: MovimentacaoTipo.INTIMACAO,
        titulo: "Intimação para manifestação",
      }),
    ).toBe("INTIMACAO");
  });

  it("recognizes publications by keyword", () => {
    expect(
      classifyOperationalCommunication({
        tipo: MovimentacaoTipo.ANDAMENTO,
        titulo: "Publicação no DJE",
      }),
    ).toBe("PUBLICACAO");
  });

  it("recognizes relevant movements by critical priority", () => {
    expect(
      classifyOperationalCommunication({
        tipo: MovimentacaoTipo.ANDAMENTO,
        titulo: "Andamento processual",
        prioridade: MovimentacaoPrioridade.CRITICA,
      }),
    ).toBe("MOVIMENTACAO_RELEVANTE");
  });

  it("extracts real discovery signals from tags", () => {
    expect(
      hasExternalDiscoverySignal(["planilha-import", "origem:sincronizacao_externa"]),
    ).toBe(true);
    expect(hasExternalDiscoverySignal(["manual"])).toBe(false);
  });

  it("builds backlog reasons honestly", () => {
    expect(
      buildDiscoveryBacklogReasons({
        hasTribunal: false,
        hasMovements: false,
        hasExternalSignal: false,
        hasResponsible: true,
      }),
    ).toEqual([
      "Sem tribunal vinculado",
      "Sem movimentações capturadas",
      "Sem histórico de discovery/sincronização",
    ]);
  });

  it("marks protocol as blocked without principal pdf", () => {
    expect(
      buildProtocolReadiness({
        status: PeticaoStatus.RASCUNHO,
      }),
    ).toMatchObject({
      status: "BLOCKED",
      blockers: ["Documento principal ausente"],
    });
  });

  it("marks protocol as attention when only type is missing", () => {
    expect(
      buildProtocolReadiness({
        status: PeticaoStatus.EM_ANALISE,
        documentoId: "doc_1",
        documentoContentType: "application/pdf",
      }),
    ).toMatchObject({
      status: "ATTENTION",
      attentionPoints: ["Tipo da petição não informado"],
    });
  });

  it("marks protocol as ready when packet is complete", () => {
    expect(
      buildProtocolReadiness({
        status: PeticaoStatus.EM_ANALISE,
        documentoId: "doc_1",
        documentoContentType: "application/pdf",
        tipo: "MANIFESTAÇÃO",
      }),
    ).toMatchObject({
      status: "READY",
    });
  });
});
