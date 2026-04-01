import { JuizTipoAutoridade } from "@/generated/prisma";
import {
  buildAuthorityPendingMetadata,
  getAuthorityPendingFieldLabels,
} from "@/app/lib/juizes/authority-profile-pendency";

describe("authority-profile-pendency", () => {
  it("identifica os campos minimos faltantes para juiz", () => {
    expect(
      getAuthorityPendingFieldLabels({
        nome: "Ana Costa",
        tipoAutoridade: JuizTipoAutoridade.JUIZ,
        vara: "1a Vara Civel",
        comarca: "",
        cidade: "Salvador",
        estado: null,
        tribunalId: undefined,
      }),
    ).toEqual(["Comarca", "UF", "Tribunal"]);
  });

  it("usa promotoria no lugar de vara para promotor", () => {
    expect(
      getAuthorityPendingFieldLabels({
        nome: "Carlos Mendes",
        tipoAutoridade: JuizTipoAutoridade.PROMOTOR,
        vara: "",
        comarca: "Salvador",
        cidade: "Salvador",
        estado: "BA",
        tribunalId: "tribunal-1",
      }),
    ).toEqual(["Promotoria"]);
  });

  it("gera metadata completa quando todos os campos minimos existem", () => {
    expect(
      buildAuthorityPendingMetadata(
        {
          nome: "Maria Santos",
          tipoAutoridade: JuizTipoAutoridade.JUIZ,
          vara: "2a Vara Civel",
          comarca: "Salvador",
          cidade: "Salvador",
          estado: "BA",
          tribunalId: "tribunal-1",
        },
        {
          id: "task-1",
          responsavel: { id: "user-1", nome: "Equipe" },
        },
      ),
    ).toEqual({
      cadastroCompleto: true,
      camposPendentes: [],
      tarefaPendenciaId: "task-1",
      responsavelPendencia: { id: "user-1", nome: "Equipe" },
    });
  });
});
