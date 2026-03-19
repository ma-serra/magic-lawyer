import {
  MovimentacaoPrioridade,
  MovimentacaoStatusOperacional,
  MovimentacaoTipo,
  PeticaoStatus,
  Prisma,
} from "@/generated/prisma";

export type CommunicationKind =
  | "INTIMACAO"
  | "PUBLICACAO"
  | "AUDIENCIA"
  | "PRAZO"
  | "MOVIMENTACAO_RELEVANTE";

export type ProtocolReadinessStatus =
  | "READY"
  | "ATTENTION"
  | "BLOCKED"
  | "PROTOCOLADA"
  | "ARQUIVADA";

const PUBLICATION_KEYWORDS = [
  "PUBLICAC",
  "DIARIO",
  "DJE",
  "EDITAL",
  "DISPONIBILIZ",
];

const RELEVANT_MOVEMENT_KEYWORDS = [
  "SENTENCA",
  "DECISAO",
  "DESPACHO",
  "ACORDAO",
  "MANDADO",
  "CERTIDAO",
  "CONCLUSAO",
  "CONCLUSOS",
  "OFICIO",
];

function normalizeText(value?: string | null) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export function classifyOperationalCommunication(input: {
  tipo?: MovimentacaoTipo | null;
  titulo?: string | null;
  descricao?: string | null;
  prioridade?: MovimentacaoPrioridade | null;
  prazo?: Date | null;
}): CommunicationKind | null {
  const normalized = normalizeText(
    [input.titulo, input.descricao].filter(Boolean).join(" "),
  );

  if (
    input.tipo === MovimentacaoTipo.PRAZO ||
    Boolean(input.prazo) ||
    normalized.includes("PRAZO")
  ) {
    return "PRAZO";
  }

  if (
    input.tipo === MovimentacaoTipo.AUDIENCIA ||
    normalized.includes("AUDIENC")
  ) {
    return "AUDIENCIA";
  }

  if (
    input.tipo === MovimentacaoTipo.INTIMACAO ||
    normalized.includes("INTIMAC")
  ) {
    return "INTIMACAO";
  }

  if (PUBLICATION_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
    return "PUBLICACAO";
  }

  if (
    input.prioridade === MovimentacaoPrioridade.CRITICA ||
    input.prioridade === MovimentacaoPrioridade.ALTA ||
    RELEVANT_MOVEMENT_KEYWORDS.some((keyword) => normalized.includes(keyword))
  ) {
    return "MOVIMENTACAO_RELEVANTE";
  }

  return null;
}

export function getCommunicationKindLabel(kind: CommunicationKind) {
  switch (kind) {
    case "INTIMACAO":
      return "Intimação";
    case "PUBLICACAO":
      return "Publicação";
    case "AUDIENCIA":
      return "Audiência";
    case "PRAZO":
      return "Prazo";
    case "MOVIMENTACAO_RELEVANTE":
      return "Movimentação relevante";
    default:
      return kind;
  }
}

export function getCommunicationKindTone(kind: CommunicationKind) {
  switch (kind) {
    case "INTIMACAO":
      return "warning" as const;
    case "PUBLICACAO":
      return "secondary" as const;
    case "AUDIENCIA":
      return "primary" as const;
    case "PRAZO":
      return "danger" as const;
    case "MOVIMENTACAO_RELEVANTE":
      return "default" as const;
    default:
      return "default" as const;
  }
}

export function getMovementPriorityWeight(
  prioridade?: MovimentacaoPrioridade | null,
) {
  switch (prioridade) {
    case MovimentacaoPrioridade.CRITICA:
      return 4;
    case MovimentacaoPrioridade.ALTA:
      return 3;
    case MovimentacaoPrioridade.MEDIA:
      return 2;
    case MovimentacaoPrioridade.BAIXA:
      return 1;
    default:
      return 0;
  }
}

export function getCommunicationStatusLabel(
  status: MovimentacaoStatusOperacional | string,
) {
  switch (status) {
    case "NOVO":
      return "Novo";
    case "EM_TRIAGEM":
      return "Em triagem";
    case "EM_EXECUCAO":
      return "Em execução";
    case "RESOLVIDO":
      return "Resolvido";
    case "BLOQUEADO":
      return "Bloqueado";
    default:
      return status;
  }
}

export function getCommunicationStatusTone(
  status: MovimentacaoStatusOperacional | string,
) {
  switch (status) {
    case "NOVO":
      return "primary" as const;
    case "EM_TRIAGEM":
      return "warning" as const;
    case "EM_EXECUCAO":
      return "secondary" as const;
    case "RESOLVIDO":
      return "success" as const;
    case "BLOQUEADO":
      return "danger" as const;
    default:
      return "default" as const;
  }
}

export function extractJsonStringTags(
  tags?: Prisma.JsonValue | null,
): string[] {
  if (!Array.isArray(tags)) {
    return [];
  }

  return tags
    .map((tag) => (typeof tag === "string" ? tag.trim() : ""))
    .filter(Boolean);
}

export function hasExternalDiscoverySignal(tags?: Prisma.JsonValue | null) {
  const normalized = extractJsonStringTags(tags).map((tag) =>
    normalizeText(tag),
  );

  return normalized.some((tag) =>
    [
      "ORIGEM:SINCRONIZACAO_EXTERNA",
      "PLANILHA-IMPORT",
      "CAPTURA-MANUAL",
      "CAPTURA",
    ].includes(tag),
  );
}

export function buildDiscoveryBacklogReasons(input: {
  hasTribunal: boolean;
  hasMovements: boolean;
  hasExternalSignal: boolean;
  hasResponsible: boolean;
}) {
  const reasons: string[] = [];

  if (!input.hasTribunal) {
    reasons.push("Sem tribunal vinculado");
  }
  if (!input.hasMovements) {
    reasons.push("Sem movimentações capturadas");
  }
  if (!input.hasExternalSignal) {
    reasons.push("Sem histórico de discovery/sincronização");
  }
  if (!input.hasResponsible) {
    reasons.push("Sem advogado responsável");
  }

  return reasons;
}

export function buildProtocolReadiness(input: {
  status: PeticaoStatus;
  documentoId?: string | null;
  documentoContentType?: string | null;
  tipo?: string | null;
  protocoloNumero?: string | null;
  protocoladoEm?: Date | null;
}) {
  if (
    input.status === PeticaoStatus.PROTOCOLADA ||
    input.protocoladoEm ||
    input.protocoloNumero
  ) {
    return {
      status: "PROTOCOLADA" as const,
      label: "Protocolada",
      blockers: [] as string[],
      attentionPoints: [] as string[],
    };
  }

  if (input.status === PeticaoStatus.ARQUIVADA) {
    return {
      status: "ARQUIVADA" as const,
      label: "Arquivada",
      blockers: [] as string[],
      attentionPoints: [] as string[],
    };
  }

  const blockers: string[] = [];
  const attentionPoints: string[] = [];

  if (!input.documentoId) {
    blockers.push("Documento principal ausente");
  } else if (
    input.documentoContentType &&
    !input.documentoContentType.toLowerCase().includes("pdf")
  ) {
    blockers.push("Documento principal fora do padrão PDF");
  }

  if (input.status === PeticaoStatus.INDEFERIDA) {
    blockers.push("Petição indeferida exige revisão antes de novo protocolo");
  }

  if (!normalizeText(input.tipo)) {
    attentionPoints.push("Tipo da petição não informado");
  }

  if (blockers.length > 0) {
    return {
      status: "BLOCKED" as const,
      label: "Bloqueada",
      blockers,
      attentionPoints,
    };
  }

  if (attentionPoints.length > 0) {
    return {
      status: "ATTENTION" as const,
      label: "Revisar antes de protocolar",
      blockers,
      attentionPoints,
    };
  }

  return {
    status: "READY" as const,
    label: "Pronta para protocolo",
    blockers,
    attentionPoints,
  };
}

export function getProtocolReadinessTone(status: ProtocolReadinessStatus) {
  switch (status) {
    case "READY":
      return "success" as const;
    case "ATTENTION":
      return "warning" as const;
    case "BLOCKED":
      return "danger" as const;
    case "PROTOCOLADA":
      return "primary" as const;
    case "ARQUIVADA":
      return "default" as const;
    default:
      return "default" as const;
  }
}
