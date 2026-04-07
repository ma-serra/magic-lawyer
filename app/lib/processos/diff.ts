import type { Processo } from "@/generated/prisma";

import {
  ProcessoArquivamentoTipo,
  ProcessoFase,
  ProcessoGrau,
  ProcessoStatus,
} from "@/generated/prisma";

type ProcessoWithRelations = Processo & {
  cliente?: {
    id: string;
    nome: string | null;
  } | null;
  advogadoResponsavel?: {
    id: string;
    usuario?: {
      id: string;
      firstName: string | null;
      lastName: string | null;
      email: string | null;
    } | null;
  } | null;
  clientesVinculados?: Array<{
    id: string;
    nome: string | null;
    email?: string | null;
    telefone?: string | null;
    tipoPessoa?: string | null;
  }> | null;
  advogadosResponsaveis?: Array<{
    id: string;
    oabNumero?: string | null;
    oabUf?: string | null;
    usuario?: {
      id?: string | null;
      firstName: string | null;
      lastName: string | null;
      email: string | null;
    } | null;
  }> | null;
  area?: {
    id: string;
    nome: string | null;
  } | null;
  tribunal?: {
    id: string;
    nome: string | null;
  } | null;
  juiz?: {
    id: string;
    nome: string | null;
  } | null;
};

export type ProcessoDiffItem = {
  field: string;
  label: string;
  before: string;
  after: string;
  beforeRaw?: unknown;
  afterRaw?: unknown;
};

export type ProcessoDiffResult = {
  items: ProcessoDiffItem[];
  summary: string;
  otherChangesSummary: string;
  statusChange?: {
    before: string;
    after: string;
    beforeRaw: ProcessoStatus | null;
    afterRaw: ProcessoStatus | null;
  };
};

const STATUS_LABEL: Record<ProcessoStatus, string> = {
  [ProcessoStatus.RASCUNHO]: "Rascunho",
  [ProcessoStatus.EM_ANDAMENTO]: "Em andamento",
  [ProcessoStatus.SUSPENSO]: "Suspenso",
  [ProcessoStatus.ENCERRADO]: "Encerrado",
  [ProcessoStatus.ARQUIVADO]: "Arquivado",
};

const ARQUIVAMENTO_LABEL: Record<ProcessoArquivamentoTipo, string> = {
  [ProcessoArquivamentoTipo.PROVISORIO]: "Arquivado provisoriamente",
  [ProcessoArquivamentoTipo.DEFINITIVO]: "Arquivado definitivamente",
};

const FASE_LABEL: Partial<Record<ProcessoFase, string>> = {
  [ProcessoFase.PETICAO_INICIAL]: "Petição inicial",
  [ProcessoFase.CITACAO]: "Citação",
  [ProcessoFase.INSTRUCAO]: "Instrução",
  [ProcessoFase.ALEGACOES_FINAIS]: "Alegações finais",
  [ProcessoFase.SENTENCA]: "Sentença",
  [ProcessoFase.RECURSO]: "Recurso",
  [ProcessoFase.EXECUCAO]: "Execução",
};

const GRAU_LABEL: Partial<Record<ProcessoGrau, string>> = {
  [ProcessoGrau.PRIMEIRO]: "1º grau",
  [ProcessoGrau.SEGUNDO]: "2º grau",
  [ProcessoGrau.SUPERIOR]: "Tribunal superior",
};

const DEFAULT_NULL_TEXT = "—";

function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return DEFAULT_NULL_TEXT;
  }

  if (isPrismaDecimal(value)) {
    const asNumber = toDecimalNumber(value);

    if (Number.isFinite(asNumber)) {
      return asNumber.toLocaleString("pt-BR", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      });
    }

    return toDecimalString(value);
  }

  if (value instanceof Date) {
    return value.toLocaleString("pt-BR");
  }

  if (typeof value === "number") {
    return value.toLocaleString("pt-BR", {
      maximumFractionDigits: 2,
    });
  }

  if (typeof value === "boolean") {
    return value ? "Sim" : "Não";
  }

  return String(value);
}

function normalizeForCompare(value: unknown): unknown {
  if (value instanceof Date) {
    return value.getTime();
  }

  if (isPrismaDecimal(value)) {
    return toDecimalNumber(value);
  }

  if (typeof value === "string") {
    return value.trim();
  }

  return value ?? null;
}

function valuesAreEqual(a: unknown, b: unknown): boolean {
  return normalizeForCompare(a) === normalizeForCompare(b);
}

function composeAdvogadoNome(
  advogado?: ProcessoWithRelations["advogadoResponsavel"],
): string {
  const first = advogado?.usuario?.firstName ?? "";
  const last = advogado?.usuario?.lastName ?? "";
  const nome = `${first} ${last}`.trim();

  return nome.length > 0
    ? nome
    : (advogado?.usuario?.email ?? DEFAULT_NULL_TEXT);
}

function composeAdvogadosResponsaveisLabel(
  advogados?: ProcessoWithRelations["advogadosResponsaveis"],
): string {
  if (!advogados || advogados.length === 0) {
    return DEFAULT_NULL_TEXT;
  }

  return advogados
    .map((advogado) => composeAdvogadoNome(advogado as any))
    .join(", ");
}

function composeClientesVinculadosLabel(
  clientes?: ProcessoWithRelations["clientesVinculados"],
): string {
  if (!clientes || clientes.length === 0) {
    return DEFAULT_NULL_TEXT;
  }

  return clientes
    .map((cliente) => cliente?.nome?.trim())
    .filter(Boolean)
    .join(", ");
}

function compareNamedRelationSets(
  before:
    | Array<{
        id?: string | null;
        nome?: string | null;
        usuario?: {
          id?: string | null;
          firstName?: string | null;
          lastName?: string | null;
          email?: string | null;
        } | null;
      }>
    | null
    | undefined,
  after:
    | Array<{
        id?: string | null;
        nome?: string | null;
        usuario?: {
          id?: string | null;
          firstName?: string | null;
          lastName?: string | null;
          email?: string | null;
        } | null;
      }>
    | null
    | undefined,
) {
  const normalize = (
    items:
      | Array<{
          id?: string | null;
          nome?: string | null;
          usuario?: {
            id?: string | null;
            firstName?: string | null;
            lastName?: string | null;
            email?: string | null;
          } | null;
        }>
      | null
      | undefined,
  ) =>
    (items ?? [])
      .map((item) => {
        if (item.id) {
          return item.id;
        }

        if (item.nome) {
          return item.nome.trim().toUpperCase();
        }

        if (item.usuario) {
          const nome = `${item.usuario.firstName ?? ""} ${item.usuario.lastName ?? ""}`
            .trim()
            .toUpperCase();

          return nome || (item.usuario.email ?? "").trim().toUpperCase();
        }

        return "";
      })
      .filter(Boolean)
      .sort()
      .join("|");

  return normalize(before) === normalize(after);
}

type PrismaDecimalLike = {
  toNumber?: () => number;
  toString: () => string;
};

function isPrismaDecimal(value: unknown): value is PrismaDecimalLike {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as PrismaDecimalLike).toString === "function" &&
    typeof (value as PrismaDecimalLike).toNumber === "function"
  );
}

function toDecimalNumber(value: unknown): number {
  if (isPrismaDecimal(value)) {
    try {
      return value.toNumber?.() ?? Number(value.toString());
    } catch {
      return Number(value.toString());
    }
  }

  return Number(value);
}

function toDecimalString(value: unknown): string {
  if (isPrismaDecimal(value)) {
    return value.toString();
  }

  return String(value ?? "");
}

function normalizeNumericValue(
  value: unknown,
): number | null | string | undefined {
  if (value === null || value === undefined) {
    return null;
  }

  if (isPrismaDecimal(value)) {
    return toDecimalNumber(value);
  }

  if (typeof value === "number") {
    if (Number.isFinite(value)) {
      return value;
    }

    return null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (!trimmed) {
      return null;
    }

    const direct = Number(trimmed);

    if (!Number.isNaN(direct)) {
      return direct;
    }

    const normalized = Number(trimmed.replace(/\./g, "").replace(",", "."));

    if (!Number.isNaN(normalized)) {
      return normalized;
    }

    return trimmed;
  }

  return value as any;
}

function formatCurrencyValue(value: unknown): string {
  const normalized = normalizeNumericValue(value);

  if (normalized === null || normalized === undefined) {
    return DEFAULT_NULL_TEXT;
  }

  if (typeof normalized === "number" && Number.isFinite(normalized)) {
    return normalized.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  }

  return String(normalized);
}

export function getProcessoStatusLabel(
  status: ProcessoStatus | null | undefined,
  arquivamentoTipo?: ProcessoArquivamentoTipo | null,
): string {
  if (!status) {
    return DEFAULT_NULL_TEXT;
  }

  if (status === ProcessoStatus.ARQUIVADO) {
    if (arquivamentoTipo) {
      return ARQUIVAMENTO_LABEL[arquivamentoTipo] ?? STATUS_LABEL[status];
    }

    return "Arquivado sem classificacao";
  }

  return STATUS_LABEL[status] ?? status.replace(/_/g, " ").toLowerCase();
}

export function getProcessoArquivamentoTipoLabel(
  arquivamentoTipo: ProcessoArquivamentoTipo | null | undefined,
): string {
  if (!arquivamentoTipo) {
    return "Sem classificacao";
  }

  return (
    ARQUIVAMENTO_LABEL[arquivamentoTipo] ??
    arquivamentoTipo.replace(/_/g, " ").toLowerCase()
  );
}

export function getProcessoFaseLabel(
  fase: ProcessoFase | null | undefined,
): string {
  if (!fase) {
    return DEFAULT_NULL_TEXT;
  }

  return FASE_LABEL[fase] ?? fase.replace(/_/g, " ").toLowerCase();
}

export function getProcessoGrauLabel(
  grau: ProcessoGrau | null | undefined,
): string {
  if (!grau) {
    return DEFAULT_NULL_TEXT;
  }

  return GRAU_LABEL[grau] ?? grau.replace(/_/g, " ").toLowerCase();
}

type DiffDescriptor = {
  field: string;
  label: string;
  getBefore: (before: ProcessoWithRelations) => unknown;
  getAfter: (after: ProcessoWithRelations) => unknown;
  format?: (value: unknown) => string;
  includeRaw?: boolean;
  areEqual?: (before: unknown, after: unknown) => boolean;
};

const descriptors: DiffDescriptor[] = [
  {
    field: "numero",
    label: "Número",
    getBefore: (p) => p.numero,
    getAfter: (p) => p.numero,
  },
  {
    field: "numeroCnj",
    label: "Número CNJ",
    getBefore: (p) => p.numeroCnj,
    getAfter: (p) => p.numeroCnj,
  },
  {
    field: "titulo",
    label: "Título",
    getBefore: (p) => p.titulo,
    getAfter: (p) => p.titulo,
  },
  {
    field: "descricao",
    label: "Descrição",
    getBefore: (p) => p.descricao,
    getAfter: (p) => p.descricao,
  },
  {
    field: "status",
    label: "Status",
    getBefore: (p) => p.status,
    getAfter: (p) => p.status,
    format: (value) => getProcessoStatusLabel(value as ProcessoStatus),
    includeRaw: true,
  },
  {
    field: "arquivamentoTipo",
    label: "Tipo de arquivamento",
    getBefore: (p) => p.arquivamentoTipo,
    getAfter: (p) => p.arquivamentoTipo,
    format: (value) =>
      getProcessoArquivamentoTipoLabel(
        value as ProcessoArquivamentoTipo | null | undefined,
      ),
  },
  {
    field: "fase",
    label: "Fase",
    getBefore: (p) => p.fase,
    getAfter: (p) => p.fase,
    format: (value) => getProcessoFaseLabel(value as ProcessoFase),
  },
  {
    field: "grau",
    label: "Grau",
    getBefore: (p) => p.grau,
    getAfter: (p) => p.grau,
    format: (value) => getProcessoGrauLabel(value as ProcessoGrau),
  },
  {
    field: "cliente",
    label: "Cliente",
    getBefore: (p) => p.cliente?.nome ?? null,
    getAfter: (p) => p.cliente?.nome ?? null,
  },
  {
    field: "clientesVinculados",
    label: "Clientes vinculados",
    getBefore: (p) => composeClientesVinculadosLabel(p.clientesVinculados),
    getAfter: (p) => composeClientesVinculadosLabel(p.clientesVinculados),
    areEqual: (before, after) =>
      compareNamedRelationSets(
        before as ProcessoWithRelations["clientesVinculados"],
        after as ProcessoWithRelations["clientesVinculados"],
      ),
  },
  {
    field: "advogadoResponsavel",
    label: "Advogado responsável",
    getBefore: (p) => composeAdvogadoNome(p.advogadoResponsavel),
    getAfter: (p) => composeAdvogadoNome(p.advogadoResponsavel),
  },
  {
    field: "advogadosResponsaveis",
    label: "Responsáveis vinculados",
    getBefore: (p) => composeAdvogadosResponsaveisLabel(p.advogadosResponsaveis),
    getAfter: (p) => composeAdvogadosResponsaveisLabel(p.advogadosResponsaveis),
    areEqual: (before, after) =>
      compareNamedRelationSets(
        before as ProcessoWithRelations["advogadosResponsaveis"],
        after as ProcessoWithRelations["advogadosResponsaveis"],
      ),
  },
  {
    field: "area",
    label: "Área",
    getBefore: (p) => p.area?.nome ?? null,
    getAfter: (p) => p.area?.nome ?? null,
  },
  {
    field: "tribunal",
    label: "Tribunal",
    getBefore: (p) => p.tribunal?.nome ?? null,
    getAfter: (p) => p.tribunal?.nome ?? null,
  },
  {
    field: "juiz",
    label: "Juiz",
    getBefore: (p) => p.juiz?.nome ?? null,
    getAfter: (p) => p.juiz?.nome ?? null,
  },
  {
    field: "prazoPrincipal",
    label: "Prazo principal",
    getBefore: (p) => p.prazoPrincipal,
    getAfter: (p) => p.prazoPrincipal,
    format: (value) =>
      value instanceof Date
        ? value.toLocaleDateString("pt-BR")
        : DEFAULT_NULL_TEXT,
  },
  {
    field: "valorCausa",
    label: "Valor da causa",
    getBefore: (p) => p.valorCausa,
    getAfter: (p) => p.valorCausa,
    format: formatCurrencyValue,
    includeRaw: true,
    areEqual: (before, after) => {
      const normBefore = normalizeNumericValue(before);
      const normAfter = normalizeNumericValue(after);

      if (
        (normBefore === null ||
          normBefore === undefined ||
          normBefore === "") &&
        (normAfter === null || normAfter === undefined || normAfter === "")
      ) {
        return true;
      }

      if (typeof normBefore === "number" && typeof normAfter === "number") {
        return Math.abs(normBefore - normAfter) < 0.01;
      }

      return normBefore === normAfter;
    },
  },
  {
    field: "classeProcessual",
    label: "Classe processual",
    getBefore: (p) => p.classeProcessual,
    getAfter: (p) => p.classeProcessual,
  },
  {
    field: "vara",
    label: "Vara",
    getBefore: (p) => p.vara,
    getAfter: (p) => p.vara,
  },
  {
    field: "comarca",
    label: "Comarca",
    getBefore: (p) => p.comarca,
    getAfter: (p) => p.comarca,
  },
  {
    field: "foro",
    label: "Foro",
    getBefore: (p) => p.foro,
    getAfter: (p) => p.foro,
  },
  {
    field: "numeroInterno",
    label: "Número interno",
    getBefore: (p) => p.numeroInterno,
    getAfter: (p) => p.numeroInterno,
  },
  {
    field: "pastaCompartilhadaUrl",
    label: "Pasta compartilhada",
    getBefore: (p) => p.pastaCompartilhadaUrl,
    getAfter: (p) => p.pastaCompartilhadaUrl,
  },
];

export function buildProcessoDiff(
  before: ProcessoWithRelations,
  after: ProcessoWithRelations,
): ProcessoDiffResult {
  const items: ProcessoDiffItem[] = [];

  for (const descriptor of descriptors) {
    const beforeRaw = descriptor.getBefore(before);
    const afterRaw = descriptor.getAfter(after);

    const equal = descriptor.areEqual
      ? descriptor.areEqual(beforeRaw, afterRaw)
      : valuesAreEqual(beforeRaw, afterRaw);

    if (equal) {
      continue;
    }

    const format = descriptor.format ?? formatValue;
    const item: ProcessoDiffItem = {
      field: descriptor.field,
      label: descriptor.label,
      before: format(beforeRaw),
      after: format(afterRaw),
    };

    if (descriptor.includeRaw) {
      item.beforeRaw = beforeRaw;
      item.afterRaw = afterRaw;
    }

    items.push(item);
  }

  const summary = items.map((item) => item.label).join(", ");
  const statusItem = items.find((item) => item.field === "status");
  const otherItems = items.filter((item) => item.field !== "status");

  return {
    items,
    summary,
    otherChangesSummary: otherItems.map((item) => item.label).join(", "),
    statusChange: statusItem
      ? {
          before: statusItem.before,
          after: statusItem.after,
          beforeRaw: (statusItem.beforeRaw as ProcessoStatus | null) ?? null,
          afterRaw: (statusItem.afterRaw as ProcessoStatus | null) ?? null,
        }
      : undefined,
  };
}
