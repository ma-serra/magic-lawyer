import { buildSoftDeletePayload } from "@/app/lib/soft-delete";
import { persistCapturedMovimentacoes } from "@/app/lib/juridical/process-movement-sync";
import { upsertProcessoFromCapture } from "@/app/lib/juridical/processo-persistence";
import prisma from "@/app/lib/prisma";
import { ProcessoPolo } from "@/generated/prisma";
import type {
  JusbrasilProcessChangeEvent,
  JusbrasilProcessSnapshotEvent,
  JusbrasilSupportedProcessEvent,
} from "@/lib/api/juridical/jusbrasil-webhook-events";
import type { JusbrasilProcessBinding } from "@/app/lib/juridical/jusbrasil-process-monitoring";

export type JusbrasilProcessEventImportSummary = {
  evtType: 1 | 2 | 4 | 7 | 13;
  processoId: string;
  updatedProcess: boolean;
  createdMovimentacoes: number;
  skippedMovimentacoes: number;
  softDeletedPartes: number;
  notifiedRecipients: number;
};

function normalizeText(value?: string | null) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function mapSnapshotParteTipoToPolo(tipo?: string | null) {
  switch (tipo) {
    case "AUTOR":
      return ProcessoPolo.AUTOR;
    case "REU":
      return ProcessoPolo.REU;
    case "TERCEIRO":
      return ProcessoPolo.TERCEIRO;
    default:
      return null;
  }
}

async function softDeleteMissingProcessPartsFromSnapshot(params: {
  tenantId: string;
  processoId: string;
  snapshotPartes:
    | Array<{
        tipo: string;
        nome: string;
      }>
    | undefined;
}) {
  const expectedKeys = new Set(
    (params.snapshotPartes || [])
      .map((parte) => {
        const tipoPolo = mapSnapshotParteTipoToPolo(parte.tipo);
        if (!tipoPolo || !parte.nome?.trim()) {
          return null;
        }

        return `${tipoPolo}:${normalizeText(parte.nome)}`;
      })
      .filter(Boolean) as string[],
  );

  if (expectedKeys.size === 0) {
    return 0;
  }

  const existentes = await prisma.processoParte.findMany({
    where: {
      tenantId: params.tenantId,
      processoId: params.processoId,
      deletedAt: null,
      tipoPolo: {
        in: [ProcessoPolo.AUTOR, ProcessoPolo.REU, ProcessoPolo.TERCEIRO],
      },
    },
    select: {
      id: true,
      tipoPolo: true,
      nome: true,
    },
  });

  let softDeleted = 0;

  for (const parte of existentes) {
    const key = `${parte.tipoPolo}:${normalizeText(parte.nome)}`;
    if (expectedKeys.has(key)) {
      continue;
    }

    await prisma.processoParte.update({
      where: {
        id: parte.id,
      },
      data: buildSoftDeletePayload(
        { actorType: "WEBHOOK", actorId: "JUSBRASIL" },
        "Parte removida com base em snapshot de mudanca de processo via Jusbrasil.",
      ),
    });
    softDeleted += 1;
  }

  return softDeleted;
}

function getJusbrasilEventSourceLabel(evtType: 1 | 2 | 4 | 7 | 13) {
  switch (evtType) {
    case 1:
      return "Jusbrasil - movimentacoes monitoradas";
    case 2:
      return "Jusbrasil - publicacoes processuais";
    case 4:
      return "Jusbrasil - distribuicao de processo";
    case 7:
      return "Jusbrasil - mudanca em processo";
    case 13:
      return "Jusbrasil - atualizacao sob demanda";
    default:
      return "Webhook Jusbrasil";
  }
}

async function syncSnapshotForProcessChange(params: {
  binding: JusbrasilProcessBinding;
  event: JusbrasilProcessChangeEvent;
}) {
  if (!params.event.mappedProcess) {
    return {
      updatedProcess: false,
      softDeletedPartes: 0,
    };
  }

  const persisted = await upsertProcessoFromCapture({
    tenantId: params.binding.tenantId,
    processo: params.event.mappedProcess,
    clienteNome: params.binding.clienteNome || undefined,
    advogadoId: params.binding.advogadoResponsavelId || undefined,
    updateIfExists: true,
  });

  let softDeletedPartes = 0;

  if (
    params.event.changeSummary.deletedParties > 0 &&
    params.event.mappedProcess.partes?.length
  ) {
    softDeletedPartes = await softDeleteMissingProcessPartsFromSnapshot({
      tenantId: params.binding.tenantId,
      processoId: params.binding.processoId,
      snapshotPartes: params.event.mappedProcess.partes,
    });
  }

  return {
    updatedProcess: persisted.created || persisted.updated,
    softDeletedPartes,
  };
}

async function syncSnapshotForFullProcessEvent(params: {
  binding: JusbrasilProcessBinding;
  event: JusbrasilProcessSnapshotEvent;
}) {
  if (!params.event.mappedProcess) {
    return false;
  }

  const persisted = await upsertProcessoFromCapture({
    tenantId: params.binding.tenantId,
    processo: params.event.mappedProcess,
    clienteNome: params.binding.clienteNome || undefined,
    advogadoId: params.binding.advogadoResponsavelId || undefined,
    updateIfExists: true,
  });

  return persisted.created || persisted.updated;
}

export async function processJusbrasilSupportedProcessEvent(params: {
  binding: JusbrasilProcessBinding;
  event: JusbrasilSupportedProcessEvent;
}) {
  let updatedProcess = false;
  let softDeletedPartes = 0;

  if (params.event.evtType === 7) {
    const snapshotResult = await syncSnapshotForProcessChange({
      binding: params.binding,
      event: params.event,
    });
    updatedProcess = snapshotResult.updatedProcess;
    softDeletedPartes = snapshotResult.softDeletedPartes;
  }

  if (params.event.evtType === 4 || params.event.evtType === 13) {
    updatedProcess = await syncSnapshotForFullProcessEvent({
      binding: params.binding,
      event: params.event,
    });
  }

  const movimentacaoSummary = await persistCapturedMovimentacoes({
    tenantId: params.binding.tenantId,
    processoId: params.binding.processoId,
    criadoPorId: null,
    movimentacoes: params.event.movimentacoes,
    notifyLawyers: true,
    actorName: "Webhook Jusbrasil",
    sourceLabel: getJusbrasilEventSourceLabel(params.event.evtType),
    sourceKind: "EXTERNAL",
  });

  return {
    evtType: params.event.evtType,
    processoId: params.binding.processoId,
    updatedProcess,
    createdMovimentacoes: movimentacaoSummary.created,
    skippedMovimentacoes: movimentacaoSummary.skipped,
    softDeletedPartes,
    notifiedRecipients: movimentacaoSummary.notifiedRecipients,
  } satisfies JusbrasilProcessEventImportSummary;
}
