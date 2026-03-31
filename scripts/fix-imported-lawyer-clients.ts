import { PrismaClient, TipoPessoa } from "../generated/prisma";

type ParteLite = {
  id: string;
  nome: string;
  tipoPolo: string;
  clienteId: string | null;
  advogadoId: string | null;
  documento: string | null;
  email: string | null;
  telefone: string | null;
};

type ProcessoLite = {
  id: string;
  tenantId: string;
  numero: string;
  clienteId: string;
  cliente: {
    id: string;
    nome: string;
  };
  advogadoResponsavelId: string | null;
  advogadoResponsavel: {
    id: string;
    oabNumero: string | null;
    oabUf: string | null;
    usuario: {
      firstName: string | null;
      lastName: string | null;
    };
  } | null;
  partes: ParteLite[];
};

type CandidateGroup = {
  name: string;
  normalizedName: string;
  partIds: string[];
  existingClientIds: string[];
  samplePart: ParteLite;
};

type CandidateSelection = {
  source:
    | "represented-single"
    | "represented-existing-client"
    | "represented-best-effort"
    | "author-single"
    | "author-existing-client"
    | "author-best-effort";
  confidence: "high" | "best-effort";
  group: CandidateGroup;
};

const prisma = new PrismaClient();
const EXTERNAL_SYNC_TAG = "origem:sincronizacao_externa";

function normalize(value?: string | null) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function similarPerson(a?: string | null, b?: string | null) {
  const normalizedA = normalize(a);
  const normalizedB = normalize(b);

  return Boolean(
    normalizedA &&
      normalizedB &&
      (normalizedA.includes(normalizedB) || normalizedB.includes(normalizedA)),
  );
}

function normalizeOptionalString(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeOptionalEmail(value?: string | null) {
  const trimmed = value?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

function inferTipoPessoa(nome: string): TipoPessoa {
  const normalized = normalize(nome);
  const juridicaTerms = [
    "LTDA",
    "S/A",
    "SA ",
    "EIRELI",
    "MEI",
    "EPP",
    "ASSOCIACAO",
    "CONDOMINIO",
    "EMPRESA",
    "COMERCIO",
    "INDUSTRIA",
    "COOPERATIVA",
    "HOSPITAL",
    "CLINICA",
    "ESPOLIO",
    "MINISTERIO PUBLICO",
    "UNIAO",
    "PREFEITURA",
    "ESTADO DE ",
    "MUNICIPIO DE ",
    "DEFENSORIA",
    "POLICIA ",
    "BANCO ",
  ];

  return juridicaTerms.some((term) => normalized.includes(term))
    ? TipoPessoa.JURIDICA
    : TipoPessoa.FISICA;
}

function sortGroups(groups: CandidateGroup[]) {
  return [...groups].sort((left, right) => {
    const leftHasClient = left.existingClientIds.length > 0 ? 1 : 0;
    const rightHasClient = right.existingClientIds.length > 0 ? 1 : 0;

    if (leftHasClient !== rightHasClient) {
      return rightHasClient - leftHasClient;
    }

    return left.normalizedName.localeCompare(right.normalizedName, "pt-BR");
  });
}

function groupCandidates(parts: ParteLite[]) {
  const groups = new Map<string, CandidateGroup>();

  for (const part of parts) {
    const normalizedName = normalize(part.nome);
    if (!normalizedName) {
      continue;
    }

    const existing = groups.get(normalizedName);
    if (existing) {
      existing.partIds.push(part.id);
      if (
        part.clienteId &&
        !existing.existingClientIds.includes(part.clienteId)
      ) {
        existing.existingClientIds.push(part.clienteId);
      }
      continue;
    }

    groups.set(normalizedName, {
      name: part.nome,
      normalizedName,
      partIds: [part.id],
      existingClientIds: part.clienteId ? [part.clienteId] : [],
      samplePart: part,
    });
  }

  return sortGroups(Array.from(groups.values()));
}

function chooseFromGroups(
  groups: CandidateGroup[],
  baseSource: "represented" | "author",
): CandidateSelection | null {
  if (groups.length === 0) {
    return null;
  }

  if (groups.length === 1) {
    return {
      source: `${baseSource}-single`,
      confidence: "high",
      group: groups[0],
    };
  }

  const uniqueExistingClientIds = Array.from(
    new Set(groups.flatMap((group) => group.existingClientIds)),
  );

  if (uniqueExistingClientIds.length === 1) {
    const match =
      groups.find((group) =>
        group.existingClientIds.includes(uniqueExistingClientIds[0]),
      ) || groups[0];

    return {
      source: `${baseSource}-existing-client`,
      confidence: "high",
      group: match,
    };
  }

  return {
    source: `${baseSource}-best-effort`,
    confidence: "best-effort",
    group: groups[0],
  };
}

function selectTargetCandidate(processo: ProcessoLite): CandidateSelection | null {
  const lawyerName = `${processo.advogadoResponsavel?.usuario.firstName || ""} ${
    processo.advogadoResponsavel?.usuario.lastName || ""
  }`.trim();

  if (!similarPerson(lawyerName, processo.cliente.nome)) {
    return null;
  }

  const representedCandidates = groupCandidates(
    processo.partes.filter(
      (part) =>
        part.advogadoId === processo.advogadoResponsavelId &&
        !similarPerson(part.nome, lawyerName),
    ),
  );

  const representedSelection = chooseFromGroups(
    representedCandidates,
    "represented",
  );

  if (representedSelection) {
    return representedSelection;
  }

  const authorCandidates = groupCandidates(
    processo.partes.filter(
      (part) =>
        part.tipoPolo === "AUTOR" && !similarPerson(part.nome, lawyerName),
    ),
  );

  return chooseFromGroups(authorCandidates, "author");
}

async function ensureTargetClient(params: {
  tenantId: string;
  part: ParteLite;
}) {
  const nome = params.part.nome.trim();
  const documento = normalizeOptionalString(params.part.documento);
  const email = normalizeOptionalEmail(params.part.email);
  const telefone = normalizeOptionalString(params.part.telefone);

  if (documento) {
    const existingByDocument = await prisma.cliente.findFirst({
      where: {
        tenantId: params.tenantId,
        documento,
        deletedAt: null,
      },
      select: {
        id: true,
        nome: true,
        documento: true,
        email: true,
        telefone: true,
        celular: true,
      },
    });

    if (existingByDocument) {
      const shouldUpdateEmail =
        Boolean(email) && !normalizeOptionalEmail(existingByDocument.email);
      const shouldUpdateTelefone =
        Boolean(telefone) &&
        !normalizeOptionalString(existingByDocument.telefone) &&
        !normalizeOptionalString(existingByDocument.celular);

      if (shouldUpdateEmail || shouldUpdateTelefone) {
        await prisma.cliente.update({
          where: { id: existingByDocument.id },
          data: {
            ...(shouldUpdateEmail ? { email } : {}),
            ...(shouldUpdateTelefone ? { telefone } : {}),
          },
        });
      }

      return existingByDocument.id;
    }
  }

  const existing = await prisma.cliente.findFirst({
    where: {
      tenantId: params.tenantId,
      nome: {
        equals: nome,
        mode: "insensitive",
      },
      deletedAt: null,
    },
    select: {
      id: true,
      nome: true,
      documento: true,
      email: true,
      telefone: true,
      celular: true,
    },
  });

  if (existing) {
    const shouldUpdateDocumento =
      Boolean(documento) && !normalizeOptionalString(existing.documento);
    const shouldUpdateEmail =
      Boolean(email) && !normalizeOptionalEmail(existing.email);
    const shouldUpdateTelefone =
      Boolean(telefone) &&
      !normalizeOptionalString(existing.telefone) &&
      !normalizeOptionalString(existing.celular);

    if (shouldUpdateDocumento || shouldUpdateEmail || shouldUpdateTelefone) {
      await prisma.cliente.update({
        where: { id: existing.id },
        data: {
          ...(shouldUpdateDocumento ? { documento } : {}),
          ...(shouldUpdateEmail ? { email } : {}),
          ...(shouldUpdateTelefone ? { telefone } : {}),
        },
      });
    }

    return existing.id;
  }

  const created = await prisma.cliente.create({
    data: {
      tenantId: params.tenantId,
      nome,
      tipoPessoa: inferTipoPessoa(nome),
      documento,
      email,
      telefone,
    },
    select: {
      id: true,
    },
  });

  return created.id;
}

async function softDeleteClientIfOrphaned(clienteId: string) {
  const cliente = await prisma.cliente.findUnique({
    where: { id: clienteId },
    select: {
      id: true,
      deletedAt: true,
      _count: {
        select: {
          processos: true,
          ProcessoParte: true,
          documentos: true,
          contratos: true,
          eventos: true,
          tarefas: true,
          procuracoes: true,
          dadosBancarios: true,
          enderecos: true,
        },
      },
    },
  });

  if (!cliente || cliente.deletedAt) {
    return false;
  }

  const totalRefs =
    cliente._count.processos +
    cliente._count.ProcessoParte +
    cliente._count.documentos +
    cliente._count.contratos +
    cliente._count.eventos +
    cliente._count.tarefas +
    cliente._count.procuracoes +
    cliente._count.dadosBancarios +
    cliente._count.enderecos;

  if (totalRefs > 0) {
    return false;
  }

  await prisma.cliente.update({
    where: { id: clienteId },
    data: {
      deletedAt: new Date(),
    },
  });

  return true;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {
    apply: false,
    tenant: null as string | null,
  };

  for (const arg of args) {
    if (arg === "--apply") {
      parsed.apply = true;
      continue;
    }

    if (arg.startsWith("--tenant=")) {
      parsed.tenant = arg.slice("--tenant=".length).trim() || null;
    }
  }

  return parsed;
}

async function main() {
  const { apply, tenant } = parseArgs();
  const touchedWrongClients = new Set<string>();
  const summary = {
    suspicious: 0,
    corrected: 0,
    correctedHigh: 0,
    correctedBestEffort: 0,
    skippedNoCandidate: 0,
    clientsCreated: 0,
    clientsSoftDeleted: 0,
    documentsReassigned: 0,
    processPartsRelinked: 0,
    lawyerPartsCleared: 0,
  };

  const processes = await prisma.processo.findMany({
    where: {
      ...(tenant
        ? {
            OR: [{ tenantId: tenant }, { tenant: { slug: tenant } }],
          }
        : {}),
      advogadoResponsavelId: {
        not: null,
      },
      deletedAt: null,
      tags: {
        array_contains: [EXTERNAL_SYNC_TAG],
      },
    },
    select: {
      id: true,
      tenantId: true,
      numero: true,
      clienteId: true,
      cliente: {
        select: {
          id: true,
          nome: true,
        },
      },
      advogadoResponsavelId: true,
      advogadoResponsavel: {
        select: {
          id: true,
          oabNumero: true,
          oabUf: true,
          usuario: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
      },
      partes: {
        where: {
          deletedAt: null,
        },
        orderBy: {
          nome: "asc",
        },
        select: {
          id: true,
          nome: true,
          tipoPolo: true,
          clienteId: true,
          advogadoId: true,
          documento: true,
          email: true,
          telefone: true,
        },
      },
    },
  });

  for (const processo of processes) {
    const selection = selectTargetCandidate(processo as ProcessoLite);
    if (!selection) {
      const lawyerName = `${processo.advogadoResponsavel?.usuario.firstName || ""} ${
        processo.advogadoResponsavel?.usuario.lastName || ""
      }`.trim();
      if (similarPerson(lawyerName, processo.cliente.nome)) {
        summary.suspicious += 1;
        summary.skippedNoCandidate += 1;
      }
      continue;
    }

    summary.suspicious += 1;

    if (!apply) {
      summary.corrected += 1;
      if (selection.confidence === "high") {
        summary.correctedHigh += 1;
      } else {
        summary.correctedBestEffort += 1;
      }
      continue;
    }

    const existingTargetClientId = selection.group.existingClientIds[0] || null;
    const targetClientIdBefore =
      existingTargetClientId ||
      (await prisma.cliente.findFirst({
        where: {
          tenantId: processo.tenantId,
          nome: {
            equals: selection.group.name,
            mode: "insensitive",
          },
          deletedAt: null,
        },
        select: {
          id: true,
        },
      }))?.id ||
      null;

    const targetClientId =
      targetClientIdBefore ||
      (await ensureTargetClient({
        tenantId: processo.tenantId,
        part: selection.group.samplePart,
      }));

    if (!targetClientIdBefore) {
      summary.clientsCreated += 1;
    }

    await prisma.$transaction(async (tx) => {
      if (processo.clienteId !== targetClientId) {
        await tx.processo.update({
          where: { id: processo.id },
          data: {
            clienteId: targetClientId,
          },
        });
      }

      const lawyerPartIds = processo.partes
        .filter(
          (part) =>
            similarPerson(part.nome, processo.cliente.nome) &&
            part.clienteId === processo.clienteId,
        )
        .map((part) => part.id);

      if (lawyerPartIds.length > 0) {
        const cleared = await tx.processoParte.updateMany({
          where: {
            id: {
              in: lawyerPartIds,
            },
          },
          data: {
            clienteId: null,
          },
        });
        summary.lawyerPartsCleared += cleared.count;
      }

      const relinked = await tx.processoParte.updateMany({
        where: {
          id: {
            in: selection.group.partIds,
          },
          OR: [{ clienteId: null }, { clienteId: { not: targetClientId } }],
        },
        data: {
          clienteId: targetClientId,
        },
      });
      summary.processPartsRelinked += relinked.count;

      const docs = await tx.documento.updateMany({
        where: {
          tenantId: processo.tenantId,
          processoId: processo.id,
          clienteId: processo.clienteId,
          deletedAt: null,
        },
        data: {
          clienteId: targetClientId,
        },
      });
      summary.documentsReassigned += docs.count;

      if (processo.advogadoResponsavelId) {
        await tx.advogadoCliente.upsert({
          where: {
            advogadoId_clienteId: {
              advogadoId: processo.advogadoResponsavelId,
              clienteId: targetClientId,
            },
          },
          update: {},
          create: {
            tenantId: processo.tenantId,
            advogadoId: processo.advogadoResponsavelId,
            clienteId: targetClientId,
            relacionamento: "IMPORTADO_CAPTURA",
          },
        });
      }
    });

    summary.corrected += 1;
    if (selection.confidence === "high") {
      summary.correctedHigh += 1;
    } else {
      summary.correctedBestEffort += 1;
    }

    touchedWrongClients.add(processo.clienteId);
  }

  if (apply) {
    for (const wrongClientId of touchedWrongClients) {
      const deleted = await softDeleteClientIfOrphaned(wrongClientId);
      if (deleted) {
        summary.clientsSoftDeleted += 1;
      }
    }
  }

  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
