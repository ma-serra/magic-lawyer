import {
  buildProcessoAdvogadoMembershipWhere,
  buildProcessoClienteMembershipWhere,
  decorateProcessoWithVinculos,
  decorateProcessosWithVinculos,
  normalizeProcessoLinkInput,
} from "@/app/lib/processos/processo-vinculos";

describe("processo-vinculos", () => {
  it("normaliza ids singulares e multiplos sem duplicar e preserva ordem", () => {
    const normalized = normalizeProcessoLinkInput(
      {
        clienteId: "cliente-2",
        clienteIds: ["cliente-1", "cliente-2", "cliente-1"],
        advogadoResponsavelId: "adv-2",
        advogadoResponsavelIds: ["adv-1", "adv-2", "adv-1"],
      },
      {
        fallbackClienteId: "cliente-3",
        fallbackAdvogadoResponsavelId: "adv-3",
      },
    );

    expect(normalized).toEqual({
      clienteIds: ["cliente-1", "cliente-2", "cliente-3"],
      advogadoResponsavelIds: ["adv-1", "adv-2", "adv-3"],
      clienteId: "cliente-1",
      advogadoResponsavelId: "adv-1",
    });
  });

  it("gera clausulas de pertencimento para cliente e responsavel", () => {
    expect(buildProcessoClienteMembershipWhere("cliente-1")).toEqual({
      OR: [
        { clienteId: "cliente-1" },
        {
          clientesRelacionados: {
            some: {
              clienteId: "cliente-1",
            },
          },
        },
      ],
    });

    expect(buildProcessoAdvogadoMembershipWhere(["adv-1", "adv-2"])).toEqual({
      OR: [
        {
          advogadoResponsavelId: {
            in: ["adv-1", "adv-2"],
          },
        },
        {
          responsaveis: {
            some: {
              advogadoId: {
                in: ["adv-1", "adv-2"],
              },
            },
          },
        },
      ],
    });
  });

  it("decora processo com clientes e responsaveis vinculados mantendo fallback tecnico", () => {
    const processo = decorateProcessoWithVinculos({
      id: "proc-1",
      clienteId: null,
      cliente: null,
      advogadoResponsavelId: null,
      advogadoResponsavel: null,
      clientesRelacionados: [
        {
          clienteId: "cliente-1",
          cliente: {
            id: "cliente-1",
            nome: "Cliente A",
            email: "a@example.com",
            telefone: null,
            tipoPessoa: "FISICA",
          },
        },
        {
          clienteId: "cliente-2",
          cliente: {
            id: "cliente-2",
            nome: "Cliente B",
            email: null,
            telefone: null,
            tipoPessoa: "JURIDICA",
          },
        },
      ],
      responsaveis: [
        {
          advogadoId: "adv-2",
          advogado: {
            id: "adv-2",
            oabNumero: "2",
            oabUf: "BA",
            usuario: {
              id: "user-2",
              firstName: "Bruno",
              lastName: "Souza",
              email: "bruno@example.com",
            },
          },
        },
        {
          advogadoId: "adv-1",
          advogado: {
            id: "adv-1",
            oabNumero: "1",
            oabUf: "BA",
            usuario: {
              id: "user-1",
              firstName: "Ana",
              lastName: "Costa",
              email: "ana@example.com",
            },
          },
        },
      ],
    });

    expect(processo.clientesVinculados.map((cliente) => cliente.id)).toEqual([
      "cliente-1",
      "cliente-2",
    ]);
    expect(processo.advogadosResponsaveis.map((advogado) => advogado.id)).toEqual([
      "adv-2",
      "adv-1",
    ]);
    expect(processo.cliente?.id).toBe("cliente-1");
    expect(processo.clienteId).toBe("cliente-1");
    expect(processo.advogadoResponsavel?.id).toBe("adv-2");
    expect(processo.advogadoResponsavelId).toBe("adv-2");
  });

  it("decora colecao de processos de forma consistente", () => {
    const processos = decorateProcessosWithVinculos([
      {
        id: "proc-1",
        clienteId: "cliente-1",
        cliente: {
          id: "cliente-1",
          nome: "Cliente A",
          email: null,
          telefone: null,
          tipoPessoa: "FISICA",
        },
        advogadoResponsavelId: null,
        advogadoResponsavel: null,
      },
      {
        id: "proc-2",
        clienteId: null,
        cliente: null,
        advogadoResponsavelId: null,
        advogadoResponsavel: null,
        clientesRelacionados: [
          {
            clienteId: "cliente-2",
            cliente: {
              id: "cliente-2",
              nome: "Cliente B",
              email: null,
              telefone: null,
              tipoPessoa: "JURIDICA",
            },
          },
        ],
        responsaveis: [],
      },
    ]);

    expect(processos).toHaveLength(2);
    expect(processos[0].clientesVinculados[0]?.id).toBe("cliente-1");
    expect(processos[1].clientesVinculados[0]?.id).toBe("cliente-2");
  });
});
