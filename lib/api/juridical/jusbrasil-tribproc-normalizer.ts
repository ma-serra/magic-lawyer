import {
  EsferaTribunal,
  TribunalSistema,
  type AdvogadoParte,
  type DocumentoProcesso,
  type MovimentacaoProcesso,
  type ParteProcesso,
  type ProcessoJuridico,
} from "@/lib/api/juridical/types";

type JsonRecord = Record<string, unknown>;

const ACTIVE_SIDE_HINTS = [
  "AUTOR",
  "REQUERENTE",
  "EXEQUENTE",
  "EMBARGANTE",
  "AGRAVANTE",
  "IMPETRANTE",
  "APELANTE",
  "POLO ATIVO",
];

const PASSIVE_SIDE_HINTS = [
  "REU",
  "REQUERIDO",
  "EXECUTADO",
  "EMBARGADO",
  "AGRAVADO",
  "IMPETRADO",
  "APELADO",
  "POLO PASSIVO",
];

const SKIP_PART_HINTS = [
  "JUIZ",
  "RELATOR",
  "MAGISTRADO",
  "MINISTRO",
  "DESEMBARGADOR",
];

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

function readDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }

  return undefined;
}

function normalizeNumeroDigits(value?: string | null) {
  return (value || "").replace(/\D/g, "");
}

function formatNumeroCnj(value?: string | null) {
  const digits = normalizeNumeroDigits(value);
  if (digits.length !== 20) {
    return value || "";
  }

  return `${digits.slice(0, 7)}-${digits.slice(7, 9)}.${digits.slice(9, 13)}.${digits.slice(13, 14)}.${digits.slice(14, 16)}.${digits.slice(16)}`;
}

function mapEsfera(tribunalSigla?: string | null) {
  const normalized = normalizeText(tribunalSigla);

  if (normalized.startsWith("TRT")) return EsferaTribunal.TRABALHISTA;
  if (normalized.startsWith("TRE")) return EsferaTribunal.ELEITORAL;
  if (normalized.startsWith("TRF")) return EsferaTribunal.FEDERAL;
  if (normalized.startsWith("STM") || normalized.startsWith("TJM")) {
    return EsferaTribunal.MILITAR;
  }

  return EsferaTribunal.ESTADUAL;
}

function mapTribunalSistema(value?: string | null) {
  const normalized = normalizeText(value);

  if (normalized.includes("EPROC")) return TribunalSistema.EPROC;
  if (normalized.includes("PJE")) return TribunalSistema.PJE;
  if (normalized.includes("ESAJ")) return TribunalSistema.ESAJ;
  if (normalized.includes("PROJUDI")) return TribunalSistema.PROJUDI;

  return TribunalSistema.OUTRO;
}

function classifyParte(role?: string | null): ParteProcesso["tipo"] | null {
  const normalized = normalizeText(role);

  if (!normalized) {
    return "TERCEIRO";
  }

  if (SKIP_PART_HINTS.some((hint) => normalized.includes(hint))) {
    return null;
  }

  if (normalized.includes("ADVOGADO") || normalized.includes("PROCURADOR")) {
    return "ADVOGADO";
  }

  if (ACTIVE_SIDE_HINTS.some((hint) => normalized.includes(hint))) {
    return "AUTOR";
  }

  if (PASSIVE_SIDE_HINTS.some((hint) => normalized.includes(hint))) {
    return "REU";
  }

  return "TERCEIRO";
}

function parseOab(raw?: string | null) {
  const normalized = normalizeText(raw).replace(/\s+/g, "");
  if (!normalized) {
    return {
      oabNumero: undefined,
      oabUf: undefined,
    };
  }

  let match = normalized.match(/^([A-Z]{2})(\d+)([A-Z]?)$/);
  if (match) {
    return {
      oabNumero: match[2],
      oabUf: match[1],
    };
  }

  match = normalized.match(/^(\d+)([A-Z]?)(?:\/|-)?([A-Z]{2})$/);
  if (match) {
    return {
      oabNumero: `${match[1]}${match[2] || ""}`,
      oabUf: match[3],
    };
  }

  return {
    oabNumero: undefined,
    oabUf: undefined,
  };
}

function mapAdvogados(value: unknown): AdvogadoParte[] {
  return readArray(value)
    .map((entry) => {
      const tuple = readArray(entry);
      const nome = readString(tuple[1]);

      if (!nome) {
        return null;
      }

      const parsedOab = parseOab(readString(tuple[2]));

      return {
        nome,
        oabNumero: parsedOab.oabNumero,
        oabUf: parsedOab.oabUf,
        telefone: readString(tuple[3]),
        email: readString(tuple[4]),
      } satisfies AdvogadoParte;
    })
    .filter(Boolean) as AdvogadoParte[];
}

function mapPartes(raw: JsonRecord): ParteProcesso[] {
  const seen = new Set<string>();
  const partes: ParteProcesso[] = [];

  for (const entry of readArray(raw.partes)) {
    const tuple = readArray(entry);
    const nome = readString(tuple[2]) || readString(tuple[3]);
    const role = readString(tuple[8]);
    const tipo = classifyParte(role);

    if (!nome || !tipo) {
      continue;
    }

    const key = `${tipo}:${normalizeText(nome)}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    partes.push({
      tipo,
      nome,
      documento: readString(tuple[6]) || readString(tuple[5]),
      advogados: mapAdvogados(tuple[9]),
    });
  }

  return partes;
}

function mapMovimentacoes(raw: JsonRecord): MovimentacaoProcesso[] {
  return readArray(raw.movs)
    .map((entry) => {
      const tuple = readArray(entry);
      const data = readDate(tuple[0]);
      const tipo = readString(tuple[1]) || "Andamento processual";
      const descricao = readString(tuple[2]) || tipo;

      if (!data || !descricao) {
        return null;
      }

      return {
        data,
        tipo,
        descricao,
        linkDocumento: readString(tuple[3]),
      } satisfies MovimentacaoProcesso;
    })
    .filter(Boolean) as MovimentacaoProcesso[];
}

function mapDocumentos(raw: JsonRecord): DocumentoProcesso[] {
  return readArray(raw.anexos)
    .map((entry) => {
      const tuple = readArray(entry);
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
    })
    .filter(Boolean) as DocumentoProcesso[];
}

function buildAssunto(raw: JsonRecord) {
  const classes = readArray(raw.classes)
    .map((item) => readString(item))
    .filter(Boolean) as string[];

  if (classes.length > 0) {
    return classes.slice(0, 3).join(" | ");
  }

  return readString(raw.assuntoExtra);
}

export function mapJusbrasilTribprocProcessoToProcesso(
  raw: JsonRecord,
): ProcessoJuridico | null {
  const numeroProcesso = formatNumeroCnj(
    readString(raw.numero) || readString(raw.numeroAlternativo),
  );

  if (!numeroProcesso) {
    return null;
  }

  const tribunalSigla = readString(raw.tribunal);
  const statusArquivado =
    typeof raw.arquivado === "boolean" ? raw.arquivado : undefined;
  const statusExtinto = readNumber(raw.extinto);

  return {
    numeroProcesso,
    numeroAntigo: readString(raw.numeroAlternativo),
    tribunalNome: tribunalSigla || undefined,
    tribunalSigla: tribunalSigla || undefined,
    esfera: mapEsfera(tribunalSigla),
    uf: readString(raw.uf),
    vara:
      readString(raw.vara) ||
      readString(raw.vara_original) ||
      readString(raw.foro) ||
      undefined,
    comarca: readString(raw.comarca) || readString(raw.comarca_cnj),
    classe: readString(raw.classeNatureza),
    assunto: buildAssunto(raw),
    valorCausa: readNumber(raw.valor),
    dataDistribuicao: readDate(raw.distribuicaoData),
    dataAutuacao: readDate(raw.criadoEm),
    status: readString(raw.situacao),
    statusTribunalArquivado: statusArquivado,
    statusTribunalExtinto:
      typeof statusExtinto === "number" ? statusExtinto > 0 : undefined,
    sistema: mapTribunalSistema(readString(raw.fonte_sistema)),
    partes: mapPartes(raw),
    movimentacoes: mapMovimentacoes(raw),
    documentos: mapDocumentos(raw),
    juiz: readString(raw.juiz),
    capturadoEm: new Date(),
    ultimaAtualizacao: readDate(raw.alteradoEm) || new Date(),
    fonte: "API_JUSBRASIL_TRIBPROC",
  };
}
