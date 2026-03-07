import { EsferaTribunal, ProcessoJuridico, TribunalSistema } from "@/lib/api/juridical/types";

const CNJ_PATTERN = /\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/g;
const MAX_RECURSION_DEPTH = 6;
const MAX_VALUES = 200;

function normalizeNumeroDigits(value?: string | null) {
  if (!value) return "";
  return value.replace(/\D/g, "");
}

export function formatNumeroCnj(value: string) {
  const digits = normalizeNumeroDigits(value);
  if (digits.length !== 20) return value;
  return `${digits.slice(0, 7)}-${digits.slice(7, 9)}.${digits.slice(9, 13)}.${digits.slice(13, 14)}.${digits.slice(14, 16)}.${digits.slice(16)}`;
}

function collectStringValues(input: unknown, depth = 0, acc: string[] = []) {
  if (depth > MAX_RECURSION_DEPTH || acc.length >= MAX_VALUES) {
    return acc;
  }

  if (typeof input === "string") {
    const trimmed = input.trim();
    if (trimmed) acc.push(trimmed);
    return acc;
  }

  if (typeof input === "number") {
    acc.push(String(input));
    return acc;
  }

  if (Array.isArray(input)) {
    for (const item of input) {
      collectStringValues(item, depth + 1, acc);
      if (acc.length >= MAX_VALUES) break;
    }
    return acc;
  }

  if (input && typeof input === "object") {
    for (const value of Object.values(input)) {
      collectStringValues(value, depth + 1, acc);
      if (acc.length >= MAX_VALUES) break;
    }
  }

  return acc;
}

export function extractCnjNumbers(input: unknown): string[] {
  const values = collectStringValues(input);
  const result = new Set<string>();

  for (const value of values) {
    const matches = value.match(CNJ_PATTERN);
    for (const cnj of matches ?? []) {
      result.add(cnj);
    }

    const digits = normalizeNumeroDigits(value);
    if (digits.length === 20) {
      result.add(formatNumeroCnj(digits));
    }
  }

  return Array.from(result);
}

function getStringValue(item: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

export function mapComunicaItemToProcesso(item: Record<string, unknown>): ProcessoJuridico | null {
  const numeroProcesso = extractCnjNumbers(item)[0];
  if (!numeroProcesso) {
    return null;
  }

  const tribunalSigla = getStringValue(item, [
    "siglaTribunal",
    "tribunalSigla",
    "tribunal",
    "orgao",
  ]);
  const tribunalNome = getStringValue(item, [
    "nomeTribunal",
    "tribunalNome",
    "orgaoJulgador",
    "tribunal",
  ]);
  const classe = getStringValue(item, ["classe", "classeProcessual", "tipoProcesso"]);
  const assunto = getStringValue(item, ["assunto", "descricao", "titulo"]);

  return {
    numeroProcesso,
    tribunalNome,
    tribunalSigla,
    sistema: TribunalSistema.PJE,
    esfera: EsferaTribunal.ESTADUAL,
    classe,
    assunto,
    fonte: "API_COMUNICA",
    capturadoEm: new Date(),
  };
}

export function mapComunicaItemsToProcessos(items: Record<string, unknown>[]) {
  const seen = new Set<string>();
  const processos: ProcessoJuridico[] = [];

  for (const item of items) {
    const processo = mapComunicaItemToProcesso(item);
    if (!processo) continue;

    const key = normalizeNumeroDigits(processo.numeroProcesso);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    processos.push(processo);
  }

  return processos;
}

export function findProcessoByNumero(
  items: Record<string, unknown>[],
  numeroProcesso: string,
) {
  const target = normalizeNumeroDigits(numeroProcesso);
  if (!target) return null;

  const mapped = mapComunicaItemsToProcessos(items);
  return (
    mapped.find((processo) => normalizeNumeroDigits(processo.numeroProcesso) === target) ||
    null
  );
}
