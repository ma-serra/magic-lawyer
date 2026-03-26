import type { MovimentacaoProcesso, ProcessoJuridico } from "@/lib/api/juridical/types";
import { mapJusbrasilWebhookProcessoToProcesso } from "@/lib/api/juridical/jusbrasil-webhook-normalizer";

type JsonRecord = Record<string, unknown>;

export type JusbrasilProcessPublication = {
  recorteId?: number;
  processoNumero: string;
  snippet: string;
  texto?: string;
  publishedAt?: Date;
  detectedAt?: Date;
  availableAt?: Date;
  advogados?: string;
  assunto?: string;
  partes?: string;
  secaoDiario?: string;
  diarioSlug?: string;
  orgaoSlug?: string;
  docUrl?: string;
  cachedDocUrl?: string;
  raw: JsonRecord;
};

export type JusbrasilProcessChangeSummary = {
  insertedHearings: number;
  insertedAttachments: number;
  insertedParties: number;
  insertedLawyers: number;
  deletedParties: number;
  changedFields: string[];
};

type JusbrasilSupportedProcessEventBase = {
  id?: number | string;
  evtType: 1 | 2 | 7;
  targetUrl?: string;
  targetNumber?: string;
  createdAt?: Date;
  sourceUserCustom?: string;
  sourceUrls: string[];
  processMonitorIds: number[];
  raw: JsonRecord;
};

export type JusbrasilProcessMovementEvent =
  JusbrasilSupportedProcessEventBase & {
    evtType: 1;
    movimentacoes: MovimentacaoProcesso[];
  };

export type JusbrasilProcessPublicationEvent =
  JusbrasilSupportedProcessEventBase & {
    evtType: 2;
    publications: JusbrasilProcessPublication[];
    movimentacoes: MovimentacaoProcesso[];
  };

export type JusbrasilProcessChangeEvent =
  JusbrasilSupportedProcessEventBase & {
    evtType: 7;
    changes: JsonRecord;
    oldProcess?: JsonRecord;
    newProcess?: JsonRecord;
    mappedProcess?: ProcessoJuridico | null;
    changeSummary: JusbrasilProcessChangeSummary;
    movimentacoes: MovimentacaoProcesso[];
  };

export type JusbrasilSupportedProcessEvent =
  | JusbrasilProcessMovementEvent
  | JusbrasilProcessPublicationEvent
  | JusbrasilProcessChangeEvent;

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

function readDate(value: unknown): Date | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }

  const record = readRecord(value);
  if (!record) return undefined;

  const rawDate = record.$date;
  if (typeof rawDate === "number" && Number.isFinite(rawDate)) {
    const parsed = new Date(rawDate);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }

  if (typeof rawDate === "string" && rawDate.trim()) {
    const parsed = new Date(rawDate);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }

  return undefined;
}

function buildSourceUrls(value: unknown) {
  return readArray(value)
    .map((item) => readString(item))
    .filter(Boolean) as string[];
}

function extractProcessMonitorIds(sourceUrls: string[]) {
  const ids = new Set<number>();

  for (const sourceUrl of sourceUrls) {
    const match = sourceUrl.match(/\/api\/monitoramento\/proc\/(\d+)/);
    if (!match) continue;

    const parsed = Number.parseInt(match[1] || "", 10);
    if (Number.isFinite(parsed)) {
      ids.add(parsed);
    }
  }

  return Array.from(ids);
}

function buildEventBase(
  item: JsonRecord,
  evtType: 1 | 2 | 7,
): JusbrasilSupportedProcessEventBase {
  const sourceUrls = buildSourceUrls(item.source_url);

  return {
    id:
      readNumber(item.id) ??
      readString(item.id) ??
      `${evtType}:${readString(item.target_number) || "unknown"}`,
    evtType,
    targetUrl: readString(item.target_url),
    targetNumber: readString(item.target_number),
    createdAt: readDate(item.created_at),
    sourceUserCustom: readString(item.source_user_custom),
    sourceUrls,
    processMonitorIds: extractProcessMonitorIds(sourceUrls),
    raw: item,
  };
}

function mapMovementTupleToMovimentacao(
  tuple: unknown[],
  fallbackDate?: Date,
): MovimentacaoProcesso | null {
  const data =
    readDate(tuple[0]) ||
    fallbackDate ||
    new Date();
  const tipo = readString(tuple[1]) || "Movimentação processual";
  const descricao =
    readString(tuple[2]) ||
    tipo;

  if (!descricao) {
    return null;
  }

  const categoriaHint = normalizeText(`${tipo} ${descricao}`);
  const categoria =
    categoriaHint.includes("AUDIENC")
      ? "AUDIENCIA"
      : categoriaHint.includes("INTIMAC")
        ? "INTIMACAO"
        : categoriaHint.includes("PRAZO")
          ? "PRAZO"
          : "OUTRO";

  return {
    data,
    tipo,
    descricao,
    tipoNormalizado: tipo,
    categoria,
  };
}

function mapPublicationRecord(
  item: JsonRecord,
): JusbrasilProcessPublication | null {
  const processoNumero = readString(item.proc);
  const snippet = readString(item.snippet);

  if (!processoNumero || !snippet) {
    return null;
  }

  return {
    recorteId: readNumber(item.recorte_id),
    processoNumero,
    snippet,
    texto: readString(item.texto),
    publishedAt: readDate(item.published_at),
    detectedAt: readDate(item.detected_at),
    availableAt: readDate(item.available_at),
    advogados: readString(item.advs),
    assunto: readString(item.assunto),
    partes: readString(item.partes),
    secaoDiario: readString(item.secao_diario),
    diarioSlug: readString(item.periodico_diario_slug),
    orgaoSlug: readString(item.periodico_orgao_slug),
    docUrl: readString(item.docurl),
    cachedDocUrl: readString(item.cached_docurl),
    raw: item,
  };
}

function mapPublicationToMovimentacao(
  publication: JusbrasilProcessPublication,
  fallbackDate?: Date,
): MovimentacaoProcesso {
  const data =
    publication.publishedAt ||
    publication.detectedAt ||
    publication.availableAt ||
    fallbackDate ||
    new Date();

  const details = [
    publication.assunto ? `Assunto: ${publication.assunto}` : null,
    publication.advogados ? `Advogados: ${publication.advogados}` : null,
    publication.partes ? `Partes: ${publication.partes}` : null,
    publication.secaoDiario ? `Seção: ${publication.secaoDiario}` : null,
    publication.docUrl ? `Documento: ${publication.docUrl}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    data,
    tipo: "Publicação processual",
    descricao: [publication.texto || publication.snippet, details]
      .filter(Boolean)
      .join("\n\n"),
    tipoNormalizado: "Publicação processual",
    categoria: normalizeText(publication.snippet).includes("INTIMAC")
      ? "INTIMACAO"
      : "OUTRO",
    publicacao: publication.publishedAt || data,
    linkDocumento: publication.docUrl || publication.cachedDocUrl,
  };
}

function pushHearingMovements(
  movements: MovimentacaoProcesso[],
  value: unknown,
  fallbackDate: Date,
) {
  const entries = Array.isArray(value)
    ? value
    : readArray(readRecord(value)?.$insert).map((item) => readArray(item)[1]);

  for (const entry of entries) {
    const hearing = readArray(entry);
    if (hearing.length === 0) continue;

    const data = readDate(hearing[0]) || fallbackDate;
    const local = readString(hearing[1]);
    const audienceType = readString(hearing[2]) || "Audiência";

    movements.push({
      data,
      tipo: "Mudança em processo - nova audiência",
      descricao: [audienceType, local].filter(Boolean).join(" - "),
      tipoNormalizado: "Mudança em processo - nova audiência",
      categoria: "AUDIENCIA",
    });
  }
}

function pushAttachmentMovements(
  movements: MovimentacaoProcesso[],
  value: unknown,
  fallbackDate: Date,
) {
  const inserts = readArray(readRecord(value)?.$insert);

  for (const item of inserts) {
    const payload = readArray(readArray(item)[1]);
    if (payload.length === 0) continue;

    const attachmentDate = readDate(payload[3]) || fallbackDate;
    const attachmentUrl = readString(payload[1]);
    const attachmentText = readString(payload[4]);

    movements.push({
      data: attachmentDate,
      tipo: "Mudança em processo - novo anexo",
      descricao:
        attachmentText ||
        attachmentUrl ||
        "Novo anexo detectado via Jusbrasil.",
      tipoNormalizado: "Mudança em processo - novo anexo",
      categoria: "OUTRO",
      linkDocumento: attachmentUrl,
    });
  }
}

function extractInsertedPartyName(payload: unknown[]) {
  const name = readString(payload[2]);
  if (name) return name;

  const role = readString(payload[8]);
  return role ? `Parte ${role}` : "Nova parte";
}

function pushPartesMovements(
  movements: MovimentacaoProcesso[],
  changes: JsonRecord,
  fallbackDate: Date,
) {
  const directInsert = readArray(changes.$insert);

  for (const item of directInsert) {
    const payload = readArray(readArray(item)[1]);
    if (payload.length === 0) continue;

    movements.push({
      data: fallbackDate,
      tipo: "Mudança em processo - nova parte no processo",
      descricao: extractInsertedPartyName(payload),
      tipoNormalizado: "Mudança em processo - nova parte no processo",
      categoria: "OUTRO",
    });
  }

  const deletes = readArray(changes.$delete);
  if (deletes.length > 0) {
    movements.push({
      data: fallbackDate,
      tipo: "Mudança em processo - exclusão de parte no processo",
      descricao:
        deletes.length === 1
          ? "Uma parte foi removida do processo."
          : `${deletes.length} partes foram removidas do processo.`,
      tipoNormalizado: "Mudança em processo - exclusão de parte no processo",
      categoria: "OUTRO",
    });
  }

  for (const nestedValue of Object.values(changes)) {
    const nestedRecord = readRecord(nestedValue);
    if (!nestedRecord) continue;

    for (const deepValue of Object.values(nestedRecord)) {
      const deepRecord = readRecord(deepValue);
      if (!deepRecord) continue;

      const inserts = readArray(deepRecord.$insert);
      for (const item of inserts) {
        const lawyerPayload = readArray(readArray(item)[1]);
        const lawyerName = readString(lawyerPayload[1]);
        const lawyerOab = readString(lawyerPayload[0]);

        if (!lawyerName && !lawyerOab) {
          continue;
        }

        movements.push({
          data: fallbackDate,
          tipo: "Mudança em processo - novo advogado para uma parte",
          descricao: [lawyerName, lawyerOab ? `OAB ${lawyerOab}` : null]
            .filter(Boolean)
            .join(" - "),
          tipoNormalizado: "Mudança em processo - novo advogado para uma parte",
          categoria: "OUTRO",
        });
      }
    }
  }
}

function formatChangedFieldLabel(field: string) {
  switch (field) {
    case "valor":
      return "valor da causa";
    case "classe":
      return "classe processual";
    case "assunto":
      return "assunto";
    case "vara":
      return "vara";
    case "comarca":
      return "comarca";
    case "orgao_julgador":
      return "órgão julgador";
    case "situacao":
      return "situação";
    default:
      return field.replace(/_/g, " ");
  }
}

function mapChangeEventToMovimentacoes(params: {
  changes: JsonRecord;
  fallbackDate: Date;
}) {
  const movimentacoes: MovimentacaoProcesso[] = [];
  const changedFields: string[] = [];
  let insertedHearings = 0;
  let insertedAttachments = 0;
  let insertedParties = 0;
  let insertedLawyers = 0;
  let deletedParties = 0;

  for (const [field, value] of Object.entries(params.changes)) {
    if (field === "audiencias") {
      const before = movimentacoes.length;
      pushHearingMovements(movimentacoes, value, params.fallbackDate);
      insertedHearings += movimentacoes.length - before;
      continue;
    }

    if (field === "anexos") {
      const before = movimentacoes.length;
      pushAttachmentMovements(movimentacoes, value, params.fallbackDate);
      insertedAttachments += movimentacoes.length - before;
      continue;
    }

    if (field === "partes") {
      const before = movimentacoes.length;
      const changes = readRecord(value);
      if (changes) {
        const directInsert = readArray(changes.$insert);
        const directDelete = readArray(changes.$delete);
        insertedParties += directInsert.length;
        deletedParties += directDelete.length;
        pushPartesMovements(movimentacoes, changes, params.fallbackDate);
      }

      const created = movimentacoes.length - before;
      if (created > insertedParties + deletedParties) {
        insertedLawyers += created - insertedParties - deletedParties;
      }
      continue;
    }

    changedFields.push(field);
  }

  if (changedFields.length > 0) {
    movimentacoes.push({
      data: params.fallbackDate,
      tipo: "Mudança em processo - campos cadastrais atualizados",
      descricao: changedFields
        .map((field) => formatChangedFieldLabel(field))
        .join(", "),
      tipoNormalizado: "Mudança em processo - campos cadastrais atualizados",
      categoria: "OUTRO",
    });
  }

  if (movimentacoes.length === 0) {
    movimentacoes.push({
      data: params.fallbackDate,
      tipo: "Mudança em processo detectada",
      descricao: "O Jusbrasil informou uma mudança de capa sem detalhes suficientes para classificação local.",
      tipoNormalizado: "Mudança em processo detectada",
      categoria: "OUTRO",
    });
  }

  return {
    movimentacoes,
    summary: {
      insertedHearings,
      insertedAttachments,
      insertedParties,
      insertedLawyers,
      deletedParties,
      changedFields,
    } satisfies JusbrasilProcessChangeSummary,
  };
}

function mapSupportedEvent(item: JsonRecord): JusbrasilSupportedProcessEvent | null {
  const evtType = readNumber(item.evt_type);
  if (evtType !== 1 && evtType !== 2 && evtType !== 7) {
    return null;
  }

  const base = buildEventBase(item, evtType);

  if (evtType === 1) {
    const movimentacoes = readArray(item.data)
      .map((entry) =>
        Array.isArray(entry)
          ? mapMovementTupleToMovimentacao(entry, base.createdAt)
          : null,
      )
      .filter(Boolean) as MovimentacaoProcesso[];

    return {
      ...base,
      evtType,
      movimentacoes,
    };
  }

  if (evtType === 2) {
    const publications = readArray(item.data)
      .map((entry) => mapPublicationRecord(readRecord(entry) || {}))
      .filter(Boolean) as JusbrasilProcessPublication[];

    return {
      ...base,
      evtType,
      publications,
      movimentacoes: publications.map((publication) =>
        mapPublicationToMovimentacao(publication, base.createdAt),
      ),
    };
  }

  const data = readRecord(item.data) || {};
  const changes = readRecord(data.changes) || {};
  const newProcess = readRecord(data.new);
  const oldProcess = readRecord(data.old);
  const mappedProcess = newProcess
    ? mapJusbrasilWebhookProcessoToProcesso(newProcess)
    : null;
  const { movimentacoes, summary } = mapChangeEventToMovimentacoes({
    changes,
    fallbackDate: base.createdAt || new Date(),
  });

  return {
    ...base,
    evtType,
    changes,
    oldProcess,
    newProcess,
    mappedProcess,
    changeSummary: summary,
    movimentacoes,
  };
}

export function extractJusbrasilSupportedProcessEvents(payload: unknown) {
  const source = Array.isArray(payload)
    ? payload
    : isRecord(payload)
      ? [payload]
      : [];

  return source
    .map((item) => mapSupportedEvent(readRecord(item) || {}))
    .filter(Boolean) as JusbrasilSupportedProcessEvent[];
}
