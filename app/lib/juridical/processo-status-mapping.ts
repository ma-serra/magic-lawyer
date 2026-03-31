import { ProcessoStatus } from "@/generated/prisma";
import type { ProcessoJuridico } from "@/lib/api/juridical/types";

const ARCHIVED_HINTS = [
  "ARQUIVAD",
  "ARQUIVAMENTO",
];

const CLOSED_HINTS = [
  "TRANSITAD",
  "EXTINT",
  "PRESCR",
  "DECADEN",
  "ENCERR",
  "FINALIZ",
  "CUMPRIDO",
];

const SUSPENDED_HINTS = [
  "SUSPENS",
  "SOBREST",
  "PARALIS",
];

function normalizeText(value?: string | null) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function collectStatusTexts(processo: Pick<
  ProcessoJuridico,
  "status" | "movimentacoes"
>) {
  const texts = [normalizeText(processo.status)];

  for (const movimentacao of processo.movimentacoes || []) {
    texts.push(normalizeText(movimentacao.tipo));
    texts.push(normalizeText(movimentacao.tipoNormalizado));
    texts.push(normalizeText(movimentacao.descricao));
  }

  return texts.filter(Boolean);
}

function hasAnyHint(texts: string[], hints: string[]) {
  return texts.some((text) => {
    if (!text) {
      return false;
    }

    if (text.includes("DESARQUIV")) {
      return false;
    }

    return hints.some((hint) => text.includes(hint));
  });
}

function isTerminalStatus(status: ProcessoStatus) {
  return (
    status === ProcessoStatus.ENCERRADO ||
    status === ProcessoStatus.ARQUIVADO
  );
}

export function inferImportedProcessoStatus(
  processo: Pick<
    ProcessoJuridico,
    | "status"
    | "movimentacoes"
    | "statusTribunalArquivado"
    | "statusTribunalExtinto"
  >,
): ProcessoStatus {
  const texts = collectStatusTexts(processo);

  if (
    processo.statusTribunalArquivado ||
    hasAnyHint(texts, ARCHIVED_HINTS)
  ) {
    return ProcessoStatus.ARQUIVADO;
  }

  if (
    processo.statusTribunalExtinto ||
    hasAnyHint(texts, CLOSED_HINTS)
  ) {
    return ProcessoStatus.ENCERRADO;
  }

  if (hasAnyHint(texts, SUSPENDED_HINTS)) {
    return ProcessoStatus.SUSPENSO;
  }

  return ProcessoStatus.EM_ANDAMENTO;
}

export function mergeImportedProcessoStatus(
  currentStatus: ProcessoStatus,
  importedStatus: ProcessoStatus,
) {
  switch (importedStatus) {
    case ProcessoStatus.ARQUIVADO:
      return ProcessoStatus.ARQUIVADO;
    case ProcessoStatus.ENCERRADO:
      return currentStatus === ProcessoStatus.ARQUIVADO
        ? ProcessoStatus.ARQUIVADO
        : ProcessoStatus.ENCERRADO;
    case ProcessoStatus.SUSPENSO:
      return isTerminalStatus(currentStatus)
        ? currentStatus
        : ProcessoStatus.SUSPENSO;
    case ProcessoStatus.EM_ANDAMENTO:
      return isTerminalStatus(currentStatus)
        ? currentStatus
        : ProcessoStatus.EM_ANDAMENTO;
    default:
      return currentStatus;
  }
}
