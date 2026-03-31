import {
  EsferaTribunal,
  type DocumentoProcesso,
  type MovimentacaoProcesso,
  type ParteProcesso,
  type ProcessoJuridico,
  TribunalSistema,
} from "@/lib/api/juridical/types";

type JsonRecord = Record<string, unknown>;

export type JusbrasilWebhookBatch = {
  correlationId: string;
  createdAt?: string;
  totalProcessos?: number;
  processos: JsonRecord[];
};

const ACTIVE_SIDE_HINTS = [
  "AUTOR",
  "REQUERENTE",
  "AGRAVANTE",
  "EXEQUENTE",
  "EMBARGANTE",
  "APELANTE",
  "IMPETRANTE",
  "PROMOVENTE",
  "POLO ATIVO",
];

const PASSIVE_SIDE_HINTS = [
  "REU",
  "REU",
  "REQUERIDO",
  "AGRAVADO",
  "EXECUTADO",
  "EMBARGADO",
  "APELADO",
  "IMPETRADO",
  "PROMOVIDO",
  "POLO PASSIVO",
];

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeText(value?: string | null) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function readRecord(value: unknown) {
  return isRecord(value) ? value : undefined;
}

function readDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return undefined;
}

function normalizeNumeroDigits(value?: string | null) {
  if (!value) return "";
  return value.replace(/\D/g, "");
}

function formatNumeroCnj(value?: string | null) {
  const digits = normalizeNumeroDigits(value);
  if (digits.length !== 20) return value || "";
  return `${digits.slice(0, 7)}-${digits.slice(7, 9)}.${digits.slice(9, 13)}.${digits.slice(13, 14)}.${digits.slice(14, 16)}.${digits.slice(16)}`;
}

function joinStrings(values: Array<string | undefined>, separator = " - ") {
  return values.filter(Boolean).join(separator);
}

function mapEsfera(value?: string, tribunalTipo?: string): EsferaTribunal {
  const normalized = normalizeText(value || tribunalTipo);

  if (normalized.includes("TRABALH")) return EsferaTribunal.TRABALHISTA;
  if (normalized.includes("ELEITORAL")) return EsferaTribunal.ELEITORAL;
  if (normalized.includes("FEDERAL")) return EsferaTribunal.FEDERAL;
  if (normalized.includes("MILITAR")) return EsferaTribunal.MILITAR;

  return EsferaTribunal.ESTADUAL;
}

function extractAssunto(processo: JsonRecord) {
  const assuntos = readArray(processo.assuntos)
    .map((item) => readString(readRecord(item)?.nome))
    .filter(Boolean) as string[];

  if (assuntos.length > 0) {
    return assuntos.slice(0, 3).join(" | ");
  }

  return readString(readRecord(processo.dados)?.materia);
}

function extractParteDocumento(parte: JsonRecord) {
  const ator = readRecord(parte.ator);

  const cpf = ator ? readString(ator.cpf) || readNumber(ator.cpf)?.toString() : undefined;
  if (cpf) return cpf;

  const cnpj = ator
    ? readString(ator.cnpj) || readNumber(ator.cnpj)?.toString()
    : undefined;
  if (cnpj) return cnpj;

  for (const item of readArray(parte.processo_parte_documentos)) {
    const doc = readRecord(readRecord(item)?.documento_identificador);
    const value =
      readString(doc?.documento) || readNumber(doc?.documento)?.toString();

    if (value) {
      return value;
    }
  }

  return undefined;
}

function classifyParte(params: {
  relationName?: string;
  relationClassification?: string;
  activeHint?: string;
  passiveHint?: string;
}): ParteProcesso["tipo"] {
  const relationName = normalizeText(params.relationName);
  const relationClassification = normalizeText(params.relationClassification);
  const activeHint = normalizeText(params.activeHint);
  const passiveHint = normalizeText(params.passiveHint);

  if (
    relationClassification.includes("ADVOGADO") ||
    relationName.includes("ADVOGADO") ||
    relationName.includes("PROCURADOR")
  ) {
    return "ADVOGADO";
  }

  if (
    activeHint &&
    (relationName === activeHint ||
      relationName.includes(activeHint) ||
      activeHint.includes(relationName))
  ) {
    return "AUTOR";
  }

  if (
    passiveHint &&
    (relationName === passiveHint ||
      relationName.includes(passiveHint) ||
      passiveHint.includes(relationName))
  ) {
    return "REU";
  }

  if (
    relationClassification.includes("ATIVO") ||
    ACTIVE_SIDE_HINTS.some((hint) => relationName.includes(hint))
  ) {
    return "AUTOR";
  }

  if (
    relationClassification.includes("PASSIVO") ||
    PASSIVE_SIDE_HINTS.some((hint) => relationName.includes(hint))
  ) {
    return "REU";
  }

  return "TERCEIRO";
}

function mapPartes(processo: JsonRecord): ParteProcesso[] {
  const classeUnificada = readRecord(processo.processo_classe_unificada);
  const activeHint =
    readString(classeUnificada?.polo_ativo_normalizado) ||
    readString(classeUnificada?.polo_ativo);
  const passiveHint =
    readString(classeUnificada?.polo_passivo_normalizado) ||
    readString(classeUnificada?.polo_passivo);

  const seen = new Set<string>();
  const partes: ParteProcesso[] = [];

  for (const item of readArray(processo.processo_partes)) {
    const parte = readRecord(item);
    const ator = parte ? readRecord(parte.ator) : undefined;
    const atorRelacao = parte ? readRecord(parte.ator_relacao) : undefined;
    const nome = readString(ator?.nome);

    if (!parte || !nome) {
      continue;
    }

    const tipo = classifyParte({
      relationName: readString(atorRelacao?.nome),
      relationClassification: readString(atorRelacao?.classificacao_polo),
      activeHint,
      passiveHint,
    });

    const key = `${tipo}:${normalizeText(nome)}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    partes.push({
      tipo,
      nome,
      documento: extractParteDocumento(parte),
      email: readString(ator?.email) || readString(ator?.email_principal),
      telefone:
        readString(ator?.telefone) ||
        readString(ator?.celular) ||
        readString(ator?.telefone_principal),
    });
  }

  return partes;
}

function mapMovimentacoes(processo: JsonRecord): MovimentacaoProcesso[] {
  const movimentacoes: MovimentacaoProcesso[] = [];

  for (const item of readArray(processo.movimentacoes)) {
    const movimento = readRecord(item);
    if (!movimento) continue;

    const data =
      readDate(movimento.data) ||
      readDate(movimento.data_movimentacao) ||
      readDate(movimento.data_hora) ||
      readDate(movimento.dh_movimentacao) ||
      readDate(movimento.dg_criacao);

    const tipo = readString(movimento.nome) || readString(movimento.titulo);
    const descricao =
      readString(movimento.descricao) ||
      readString(movimento.texto) ||
      readString(movimento.resumo) ||
      tipo;

    if (!data || !descricao) {
      continue;
    }

    movimentacoes.push({
      data,
      tipo,
      descricao,
    });
  }

  return movimentacoes;
}

function mapDocumentos(processo: JsonRecord): DocumentoProcesso[] {
  return readArray(processo.anexos)
    .map((item) => {
      const tuple = readArray(item);
      if (tuple.length > 0) {
        const link = readString(tuple[1]);
        const nome = readString(tuple[6]) || readString(tuple[5]) || undefined;

        if (!link && !nome) {
          return null;
        }

        return {
          nome: nome || "Documento importado",
          tipo: readString(tuple[2]),
          data: readDate(tuple[4]) || readDate(tuple[3]),
          link,
        } satisfies DocumentoProcesso;
      }

      const record = readRecord(item);
      if (!record) {
        return null;
      }

      const link =
        readString(record.url) ||
        readString(record.link) ||
        readString(record.docurl) ||
        readString(record.cached_docurl);
      const nome =
        readString(record.nome) ||
        readString(record.name) ||
        readString(record.titulo) ||
        readString(record.title);

      if (!link && !nome) {
        return null;
      }

      return {
        nome: nome || "Documento importado",
        tipo: readString(record.tipo) || readString(record.kind),
        data:
          readDate(record.updated_at) ||
          readDate(record.created_at) ||
          readDate(record.data),
        link,
      } satisfies DocumentoProcesso;
    })
    .filter(Boolean) as DocumentoProcesso[];
}

export function extractJusbrasilWebhookBatches(
  payload: unknown,
): JusbrasilWebhookBatch[] {
  const source = Array.isArray(payload) ? payload : isRecord(payload) ? [payload] : [];
  const batches: JusbrasilWebhookBatch[] = [];

  for (const item of source) {
    const batch = readRecord(item);
    if (!batch) continue;

    const correlationId = readString(batch.correlation_id);
    const processos = readArray(batch.processos).filter(isRecord);

    if (!correlationId) {
      continue;
    }

    const metadata = readRecord(batch.metadata);

    batches.push({
      correlationId,
      createdAt: readString(metadata?.created_at),
      totalProcessos: readNumber(metadata?.total_processos),
      processos,
    });
  }

  return batches;
}

export function mapJusbrasilWebhookProcessoToProcesso(
  processo: JsonRecord,
): ProcessoJuridico | null {
  const numeroProcesso = formatNumeroCnj(
    readString(processo.cnj) ||
      readNumber(processo.cnj)?.toString() ||
      readString(processo.codigo_identificador_cerne) ||
      readNumber(processo.codigo_identificador_cerne)?.toString(),
  );

  if (!numeroProcesso) {
    return null;
  }

  const tribunal = readRecord(processo.tribunal);
  const comarca = readRecord(processo.comarca);
  const vara = readRecord(processo.vara);
  const orgaoJulgador = readRecord(processo.orgao_julgador);
  const estado = readRecord(processo.estado);
  const classe = readRecord(processo.processo_classe_unificada) || readRecord(processo.processo_classe);

  return {
    numeroProcesso,
    tribunalNome: readString(tribunal?.nome),
    tribunalSigla: readString(tribunal?.sigla),
    esfera: mapEsfera(
      readString(processo.classificacao_1_textual_normalizado),
      readString(tribunal?.tipo),
    ),
    uf: readString(estado?.sigla),
    vara: joinStrings([
      readString(vara?.nome),
      readString(orgaoJulgador?.nome),
    ]) || undefined,
    comarca: readString(comarca?.nome),
    classe: readString(classe?.nome),
    assunto: extractAssunto(processo),
    valorCausa:
      readNumber(processo.valor_acao) ||
      readNumber(readRecord(processo.dados)?.valor_acao),
    dataDistribuicao: readDate(processo.distribuicao_data),
    dataAutuacao: readDate(processo.autuacao_inicial_data),
    status: readString(readRecord(processo.situacao)?.nome),
    sistema: TribunalSistema.OUTRO,
    partes: mapPartes(processo),
    movimentacoes: mapMovimentacoes(processo),
    documentos: mapDocumentos(processo),
    juiz:
      readString(readRecord(processo.relator_juiz)?.nome) ||
      readString(readRecord(processo.dados)?.presidente),
    capturadoEm: new Date(),
    ultimaAtualizacao:
      readDate(processo.dg_ultima_alteracao) || new Date(),
    fonte: "API_JUSBRASIL_OAB",
  };
}

export function mapJusbrasilWebhookBatchToProcessos(
  batch: JusbrasilWebhookBatch,
) {
  const seen = new Set<string>();
  const processos: ProcessoJuridico[] = [];

  for (const item of batch.processos) {
    const processo = mapJusbrasilWebhookProcessoToProcesso(item);
    if (!processo) continue;

    const key = normalizeNumeroDigits(processo.numeroProcesso);
    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    processos.push(processo);
  }

  return processos;
}
