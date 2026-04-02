import prisma from "@/app/lib/prisma";
import {
  MovimentacaoStatusOperacional,
  ProcessoPrazoStatus,
} from "@/generated/prisma";
import { Prisma } from "@/generated/prisma";

const EXTERNAL_SYNC_TAG = "origem:sincronizacao_externa";

type MovimentoPrazoInput = {
  id: string;
  processoId: string;
  titulo: string;
  descricao?: string | null;
  prazo?: Date | null;
  responsavelId?: string | null;
  statusOperacional?: MovimentacaoStatusOperacional | string | null;
  resolvidoEm?: Date | null;
};

function extractStringTags(tags: Prisma.JsonValue | null | undefined): string[] {
  if (!Array.isArray(tags)) {
    return [];
  }

  return tags
    .map((tag) => (typeof tag === "string" ? tag.trim().toLowerCase() : ""))
    .filter(Boolean);
}

export function hasExternalSyncTag(tags: Prisma.JsonValue | null | undefined) {
  return extractStringTags(tags).includes(EXTERNAL_SYNC_TAG);
}

function buildPrazoTitleFromMovementTitle(titulo?: string | null) {
  const normalized = (titulo || "").trim();

  if (!normalized) {
    return "Prazo processual";
  }

  if (normalized.toUpperCase().includes("PRAZO")) {
    return normalized;
  }

  return `Prazo: ${normalized}`;
}

function mapPrazoStatusFromMovement(
  movement: Pick<MovimentoPrazoInput, "statusOperacional" | "resolvidoEm">,
) {
  if (
    movement.statusOperacional === MovimentacaoStatusOperacional.RESOLVIDO ||
    movement.resolvidoEm
  ) {
    return ProcessoPrazoStatus.CONCLUIDO;
  }

  return ProcessoPrazoStatus.ABERTO;
}

export async function ensurePrazoFromMovimentacao(params: {
  tenantId: string;
  movement: MovimentoPrazoInput;
}) {
  if (!params.movement.prazo) {
    return {
      created: false,
      skipped: "missing_deadline" as const,
      prazoId: null,
    };
  }

  const existing = await prisma.processoPrazo.findFirst({
    where: {
      tenantId: params.tenantId,
      origemMovimentacaoId: params.movement.id,
      deletedAt: null,
    },
    select: {
      id: true,
    },
  });

  if (existing) {
    return {
      created: false,
      skipped: "already_exists" as const,
      prazoId: existing.id,
    };
  }

  const status = mapPrazoStatusFromMovement(params.movement);
  const prazo = await prisma.processoPrazo.create({
    data: {
      tenantId: params.tenantId,
      processoId: params.movement.processoId,
      titulo: buildPrazoTitleFromMovementTitle(params.movement.titulo),
      descricao: params.movement.descricao ?? null,
      dataVencimento: params.movement.prazo,
      status,
      dataCumprimento:
        status === ProcessoPrazoStatus.CONCLUIDO
          ? params.movement.resolvidoEm ?? new Date()
          : null,
      responsavelId: params.movement.responsavelId ?? null,
      origemMovimentacaoId: params.movement.id,
    },
    select: {
      id: true,
    },
  });

  return {
    created: true,
    skipped: null,
    prazoId: prazo.id,
  };
}

export async function backfillExternalDeadlinesFromMovements(params: {
  tenantId: string;
  processoId?: string;
  limit?: number;
}) {
  const movements = await prisma.movimentacaoProcesso.findMany({
    where: {
      tenantId: params.tenantId,
      deletedAt: null,
      ...(params.processoId ? { processoId: params.processoId } : {}),
      prazo: {
        not: null,
      },
      prazosRelacionados: {
        none: {},
      },
    },
    select: {
      id: true,
      processoId: true,
      titulo: true,
      descricao: true,
      prazo: true,
      responsavelId: true,
      statusOperacional: true,
      resolvidoEm: true,
      processo: {
        select: {
          numero: true,
          tags: true,
        },
      },
    },
    orderBy: [
      {
        dataMovimentacao: "asc",
      },
      {
        createdAt: "asc",
      },
    ],
    ...(params.limit ? { take: params.limit } : {}),
  });

  let eligible = 0;
  let created = 0;
  let skippedNotExternal = 0;
  let skippedExisting = 0;
  const processNumbers = new Set<string>();

  for (const movement of movements) {
    if (!hasExternalSyncTag(movement.processo.tags)) {
      skippedNotExternal += 1;
      continue;
    }

    eligible += 1;
    const result = await ensurePrazoFromMovimentacao({
      tenantId: params.tenantId,
      movement,
    });

    if (result.created) {
      created += 1;
      processNumbers.add(movement.processo.numero);
      continue;
    }

    if (result.skipped === "already_exists") {
      skippedExisting += 1;
    }
  }

  return {
    scanned: movements.length,
    eligible,
    created,
    skippedExisting,
    skippedNotExternal,
    processNumbers: Array.from(processNumbers),
  };
}
