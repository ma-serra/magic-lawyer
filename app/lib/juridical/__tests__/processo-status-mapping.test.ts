import { ProcessoStatus } from "@/generated/prisma";
import {
  inferImportedProcessoStatus,
  mergeImportedProcessoStatus,
} from "@/app/lib/juridical/processo-status-mapping";

describe("processo-status-mapping", () => {
  it("marca como arquivado quando o tribunal sinaliza arquivamento", () => {
    expect(
      inferImportedProcessoStatus({
        status: "MOVIMENTO",
        statusTribunalArquivado: true,
        movimentacoes: [],
      }),
    ).toBe(ProcessoStatus.ARQUIVADO);
  });

  it("marca como encerrado quando o tribunal sinaliza extincao", () => {
    expect(
      inferImportedProcessoStatus({
        status: "MOVIMENTO",
        statusTribunalExtinto: true,
        movimentacoes: [],
      }),
    ).toBe(ProcessoStatus.ENCERRADO);
  });

  it("usa as movimentacoes como reforco para identificar arquivamento", () => {
    expect(
      inferImportedProcessoStatus({
        status: "MOVIMENTO",
        movimentacoes: [
          {
            data: new Date("2021-05-19T00:00:00.000Z"),
            descricao: "ARQUIVADO - Arquivado Definitivamente",
          },
        ],
      }),
    ).toBe(ProcessoStatus.ARQUIVADO);
  });

  it("usa as movimentacoes para identificar encerramento", () => {
    expect(
      inferImportedProcessoStatus({
        status: "MOVIMENTO",
        movimentacoes: [
          {
            data: new Date("2021-05-19T00:00:00.000Z"),
            descricao: "TRANSITADO - Transitado em Julgado em 22/04/2021",
          },
        ],
      }),
    ).toBe(ProcessoStatus.ENCERRADO);
  });

  it("mantem status terminal ja salvo quando o retorno novo vier apenas em andamento", () => {
    expect(
      mergeImportedProcessoStatus(
        ProcessoStatus.ARQUIVADO,
        ProcessoStatus.EM_ANDAMENTO,
      ),
    ).toBe(ProcessoStatus.ARQUIVADO);
  });

  it("permite promover de rascunho para andamento ou terminal", () => {
    expect(
      mergeImportedProcessoStatus(
        ProcessoStatus.RASCUNHO,
        ProcessoStatus.EM_ANDAMENTO,
      ),
    ).toBe(ProcessoStatus.EM_ANDAMENTO);

    expect(
      mergeImportedProcessoStatus(
        ProcessoStatus.RASCUNHO,
        ProcessoStatus.ENCERRADO,
      ),
    ).toBe(ProcessoStatus.ENCERRADO);
  });
});
