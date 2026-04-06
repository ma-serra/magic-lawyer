import { Prisma, ProcessoPrazoStatus } from "@/generated/prisma";

import prisma from "@/app/lib/prisma";
import { buildSoftDeletePayload } from "@/app/lib/soft-delete";
import {
  PROCESSO_PRAZO_PRINCIPAL_DESCRICAO,
  PROCESSO_PRAZO_PRINCIPAL_MARKER,
  PROCESSO_PRAZO_PRINCIPAL_TITULO,
} from "@/app/lib/processos/prazo-principal-constants";

type PrismaClientLike = Prisma.TransactionClient | typeof prisma;

function buildManagedPrazoPrincipalData(dataVencimento: Date) {
  return {
    titulo: PROCESSO_PRAZO_PRINCIPAL_TITULO,
    descricao: PROCESSO_PRAZO_PRINCIPAL_DESCRICAO,
    fundamentoLegal: PROCESSO_PRAZO_PRINCIPAL_MARKER,
    dataVencimento,
  };
}

export async function syncManagedPrazoPrincipalForProcess(
  client: PrismaClientLike,
  params: {
    tenantId: string;
    processoId: string;
    prazoPrincipal: Date | null;
    actorUserId?: string | null;
  },
) {
  const managedPrazos = await client.processoPrazo.findMany({
    where: {
      tenantId: params.tenantId,
      processoId: params.processoId,
      fundamentoLegal: PROCESSO_PRAZO_PRINCIPAL_MARKER,
      deletedAt: null,
    },
    orderBy: {
      createdAt: "asc",
    },
    select: {
      id: true,
      status: true,
    },
  });

  const prazoPrincipalAtual = managedPrazos[0] ?? null;
  const duplicados = managedPrazos.slice(1);

  if (duplicados.length > 0) {
    await client.processoPrazo.updateMany({
      where: {
        id: {
          in: duplicados.map((prazo) => prazo.id),
        },
      },
      data: buildSoftDeletePayload(
        params.actorUserId
          ? { actorId: params.actorUserId, actorType: "USER" }
          : undefined,
        "Duplicidade resolvida do prazo principal do processo",
      ),
    });
  }

  if (!params.prazoPrincipal) {
    if (prazoPrincipalAtual) {
      await client.processoPrazo.update({
        where: { id: prazoPrincipalAtual.id },
        data: buildSoftDeletePayload(
          params.actorUserId
            ? { actorId: params.actorUserId, actorType: "USER" }
            : undefined,
          'Prazo principal removido do processo',
        ),
      });
    }

    return;
  }

  if (prazoPrincipalAtual) {
    await client.processoPrazo.update({
      where: { id: prazoPrincipalAtual.id },
      data: buildManagedPrazoPrincipalData(params.prazoPrincipal),
    });

    return;
  }

  await client.processoPrazo.create({
    data: {
      tenantId: params.tenantId,
      processoId: params.processoId,
      status: ProcessoPrazoStatus.ABERTO,
      ...buildManagedPrazoPrincipalData(params.prazoPrincipal),
    },
  });
}

export async function backfillManagedPrazoPrincipalForWhere(params: {
  tenantId: string;
  processWhere: Prisma.ProcessoWhereInput;
}) {
  const processosSemPrazoEspelho = await prisma.processo.findMany({
    where: {
      AND: [
        params.processWhere,
        {
          tenantId: params.tenantId,
          deletedAt: null,
          prazoPrincipal: {
            not: null,
          },
          prazos: {
            none: {
              tenantId: params.tenantId,
              deletedAt: null,
              fundamentoLegal: PROCESSO_PRAZO_PRINCIPAL_MARKER,
            },
          },
        },
      ],
    },
    select: {
      id: true,
      prazoPrincipal: true,
    },
  });

  if (processosSemPrazoEspelho.length === 0) {
    return 0;
  }

  await prisma.processoPrazo.createMany({
    data: processosSemPrazoEspelho
      .filter(
        (
          processo,
        ): processo is {
          id: string;
          prazoPrincipal: Date;
        } => Boolean(processo.prazoPrincipal),
      )
      .map((processo) => ({
        tenantId: params.tenantId,
        processoId: processo.id,
        status: ProcessoPrazoStatus.ABERTO,
        ...buildManagedPrazoPrincipalData(processo.prazoPrincipal),
      })),
  });

  return processosSemPrazoEspelho.length;
}
