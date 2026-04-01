import type { Prisma } from "@/generated/prisma";

import {
  ProcessoPolo,
  TipoPessoa,
} from "@/generated/prisma";

export const processoClienteResumoSelect = {
  id: true,
  nome: true,
  email: true,
  telefone: true,
  tipoPessoa: true,
} as const;

export const processoAdvogadoResumoSelect = {
  id: true,
  oabNumero: true,
  oabUf: true,
  usuario: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      avatarUrl: true,
    },
  },
} as const;

export const processoClientesRelacionadosInclude = {
  clientesRelacionados: {
    include: {
      cliente: {
        select: processoClienteResumoSelect,
      },
    },
    orderBy: [{ ordem: "asc" }, { createdAt: "asc" }] as Prisma.ProcessoClienteOrderByWithRelationInput[],
  },
} as const;

export const processoResponsaveisRelacionadosInclude = {
  responsaveis: {
    include: {
      advogado: {
        select: processoAdvogadoResumoSelect,
      },
    },
    orderBy: [
      { isPrincipal: "desc" },
      { ordem: "asc" },
      { createdAt: "asc" },
    ] as Prisma.ProcessoResponsavelOrderByWithRelationInput[],
  },
} as const;

export type ProcessoClienteVinculado = {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  tipoPessoa: TipoPessoa | string;
};

export type ProcessoAdvogadoResponsavelVinculado = {
  id: string;
  oabNumero: string | null;
  oabUf: string | null;
  usuario: {
    id?: string | null;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    avatarUrl?: string | null;
  } | null;
};

export type ProcessoLinkInput = {
  clienteId?: string | null;
  clienteIds?: string[] | null;
  advogadoResponsavelId?: string | null;
  advogadoResponsavelIds?: string[] | null;
};

export function uniqueOrderedProcessoRelationIds(
  values: Array<string | null | undefined>,
) {
  const ids: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const normalized = value?.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    ids.push(normalized);
  }

  return ids;
}

export function normalizeProcessoLinkInput(
  input: ProcessoLinkInput,
  options?: {
    fallbackClienteId?: string | null;
    fallbackAdvogadoResponsavelId?: string | null;
  },
) {
  const clienteIds = uniqueOrderedProcessoRelationIds([
    ...(input.clienteIds ?? []),
    input.clienteId,
    options?.fallbackClienteId,
  ]);
  const advogadoResponsavelIds = uniqueOrderedProcessoRelationIds([
    ...(input.advogadoResponsavelIds ?? []),
    input.advogadoResponsavelId,
    options?.fallbackAdvogadoResponsavelId,
  ]);

  return {
    clienteIds,
    advogadoResponsavelIds,
    clienteId: clienteIds[0] ?? null,
    advogadoResponsavelId: advogadoResponsavelIds[0] ?? null,
  };
}

export async function syncProcessoClientes(
  tx: Prisma.TransactionClient,
  params: {
    tenantId: string;
    processoId: string;
    clienteIds: string[];
  },
) {
  const clienteIds = uniqueOrderedProcessoRelationIds(params.clienteIds);
  const existing = await tx.processoCliente.findMany({
    where: {
      tenantId: params.tenantId,
      processoId: params.processoId,
    },
    select: {
      id: true,
      clienteId: true,
    },
  });

  const selected = new Set(clienteIds);
  const toDelete = existing
    .filter((item) => !selected.has(item.clienteId))
    .map((item) => item.id);

  if (toDelete.length > 0) {
    await tx.processoCliente.deleteMany({
      where: {
        id: {
          in: toDelete,
        },
      },
    });
  }

  for (const [ordem, clienteId] of clienteIds.entries()) {
    const current = existing.find((item) => item.clienteId === clienteId);

    if (current) {
      await tx.processoCliente.update({
        where: {
          id: current.id,
        },
        data: {
          ordem,
        },
      });
      continue;
    }

    await tx.processoCliente.create({
      data: {
        tenantId: params.tenantId,
        processoId: params.processoId,
        clienteId,
        ordem,
      },
    });
  }
}

export async function syncProcessoResponsaveis(
  tx: Prisma.TransactionClient,
  params: {
    tenantId: string;
    processoId: string;
    advogadoIds: string[];
    advogadoPrincipalId?: string | null;
  },
) {
  const advogadoIds = uniqueOrderedProcessoRelationIds(params.advogadoIds);
  const advogadoPrincipalId =
    params.advogadoPrincipalId && advogadoIds.includes(params.advogadoPrincipalId)
      ? params.advogadoPrincipalId
      : (advogadoIds[0] ?? null);
  const existing = await tx.processoResponsavel.findMany({
    where: {
      tenantId: params.tenantId,
      processoId: params.processoId,
    },
    select: {
      id: true,
      advogadoId: true,
    },
  });

  const selected = new Set(advogadoIds);
  const toDelete = existing
    .filter((item) => !selected.has(item.advogadoId))
    .map((item) => item.id);

  if (toDelete.length > 0) {
    await tx.processoResponsavel.deleteMany({
      where: {
        id: {
          in: toDelete,
        },
      },
    });
  }

  for (const [ordem, advogadoId] of advogadoIds.entries()) {
    const current = existing.find((item) => item.advogadoId === advogadoId);
    const isPrincipal = advogadoId === advogadoPrincipalId;

    if (current) {
      await tx.processoResponsavel.update({
        where: {
          id: current.id,
        },
        data: {
          ordem,
          isPrincipal,
        },
      });
      continue;
    }

    await tx.processoResponsavel.create({
      data: {
        tenantId: params.tenantId,
        processoId: params.processoId,
        advogadoId,
        ordem,
        isPrincipal,
      },
    });
  }
}

export async function ensureProcessoClientePartes(
  tx: Prisma.TransactionClient,
  params: {
    tenantId: string;
    processoId: string;
    clienteIds: string[];
  },
) {
  const clienteIds = uniqueOrderedProcessoRelationIds(params.clienteIds);
  if (clienteIds.length === 0) {
    return;
  }

  const clientes = await tx.cliente.findMany({
    where: {
      tenantId: params.tenantId,
      id: {
        in: clienteIds,
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

  const existingPartes = await tx.processoParte.findMany({
    where: {
      tenantId: params.tenantId,
      processoId: params.processoId,
      clienteId: {
        in: clienteIds,
      },
      deletedAt: null,
    },
    select: {
      clienteId: true,
    },
  });

  const existingClienteIds = new Set(
    existingPartes.map((parte) => parte.clienteId).filter(Boolean),
  );

  for (const cliente of clientes) {
    if (existingClienteIds.has(cliente.id)) {
      continue;
    }

    await tx.processoParte.create({
      data: {
        tenantId: params.tenantId,
        processoId: params.processoId,
        tipoPolo: ProcessoPolo.AUTOR,
        nome: cliente.nome,
        documento: cliente.documento || null,
        email: cliente.email || null,
        telefone: cliente.telefone || cliente.celular || null,
        clienteId: cliente.id,
        observacoes: "Parte vinculada ao processo",
      },
    });
  }
}

export async function getProcessoResponsibleUserIds(
  tx: Prisma.TransactionClient,
  params: {
    tenantId: string;
    processoId: string;
    fallbackUserId?: string | null;
  },
) {
  const responsaveis = await tx.processoResponsavel.findMany({
    where: {
      tenantId: params.tenantId,
      processoId: params.processoId,
    },
    select: {
      advogado: {
        select: {
          usuarioId: true,
        },
      },
    },
  });

  return uniqueOrderedProcessoRelationIds([
    ...responsaveis.map((item) => item.advogado.usuarioId),
    params.fallbackUserId,
  ]);
}

export function buildProcessoClienteMembershipWhere(
  clienteId: string,
): Prisma.ProcessoWhereInput {
  return {
    OR: [
      {
        clienteId,
      },
      {
        clientesRelacionados: {
          some: {
            clienteId,
          },
        },
      },
    ],
  };
}

export function buildProcessoAdvogadoMembershipWhere(
  advogadoIds: string[],
): Prisma.ProcessoWhereInput {
  return {
    OR: [
      {
        advogadoResponsavelId: {
          in: advogadoIds,
        },
      },
      {
        responsaveis: {
          some: {
            advogadoId: {
              in: advogadoIds,
            },
          },
        },
      },
    ],
  };
}

export function decorateProcessoWithVinculos<T extends Record<string, any>>(
  processo: T,
) {
  const clientesVinculados = Array.isArray(processo.clientesRelacionados)
    ? uniqueById(
        processo.clientesRelacionados
          .map((item: any) => item?.cliente)
          .filter(Boolean),
      )
    : uniqueById(
        [processo.cliente].filter(
          (cliente): cliente is ProcessoClienteVinculado => Boolean(cliente),
        ),
      );
  const advogadosResponsaveis = Array.isArray(processo.responsaveis)
    ? uniqueById(
        processo.responsaveis
          .map((item: any) => item?.advogado)
          .filter(Boolean),
      )
    : uniqueById(
        [processo.advogadoResponsavel].filter(
          (
            advogado,
          ): advogado is ProcessoAdvogadoResponsavelVinculado => Boolean(advogado),
        ),
      );

  return {
    ...processo,
    clientesVinculados,
    cliente: processo.cliente ?? clientesVinculados[0] ?? null,
    clienteId: processo.clienteId ?? clientesVinculados[0]?.id ?? null,
    advogadosResponsaveis,
    advogadoResponsavel:
      processo.advogadoResponsavel ?? advogadosResponsaveis[0] ?? null,
    advogadoResponsavelId:
      processo.advogadoResponsavelId ?? advogadosResponsaveis[0]?.id ?? null,
  };
}

export function decorateProcessosWithVinculos<T extends Record<string, any>>(
  processos: T[],
) {
  return processos.map((processo) => decorateProcessoWithVinculos(processo));
}

function uniqueById<T extends { id: string }>(items: T[]) {
  const seen = new Set<string>();
  const unique: T[] = [];

  for (const item of items) {
    if (!item?.id || seen.has(item.id)) {
      continue;
    }

    seen.add(item.id);
    unique.push(item);
  }

  return unique;
}
