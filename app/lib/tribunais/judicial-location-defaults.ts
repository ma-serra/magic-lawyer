import { TRF1_JUDICIAL_LOCATION_DEFAULTS } from "./trf1-judicial-location-defaults";

export type TribunalVaraDefault = {
  slug: string;
  nome: string;
  sigla?: string | null;
  tipo?: string | null;
  ordem?: number | null;
  aliases?: string[];
};

export type TribunalLocalidadeDefault = {
  slug: string;
  nome: string;
  sigla?: string | null;
  tipo?: string | null;
  ordem?: number | null;
  aliases?: string[];
  varas?: TribunalVaraDefault[];
};

export type TribunalJudicialLocationDefault = {
  tribunalSigla: string;
  localidades: TribunalLocalidadeDefault[];
};

export const TRIBUNAL_JUDICIAL_LOCATION_DEFAULTS: TribunalJudicialLocationDefault[] =
  [TRF1_JUDICIAL_LOCATION_DEFAULTS];

export function normalizeJudicialCatalogText(value?: string | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export function slugifyJudicialCatalogValue(value?: string | null) {
  return normalizeJudicialCatalogText(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function getJudicialLocationDefaultsByTribunalSigla(
  tribunalSigla?: string | null,
) {
  const normalizedSigla = normalizeJudicialCatalogText(tribunalSigla).toUpperCase();

  return (
    TRIBUNAL_JUDICIAL_LOCATION_DEFAULTS.find(
      (item) => item.tribunalSigla === normalizedSigla,
    ) ?? null
  );
}

export function getJudicialLocationDefaultBySlug(
  tribunalSigla?: string | null,
  localidadeSlug?: string | null,
) {
  if (!localidadeSlug) {
    return null;
  }

  const defaults = getJudicialLocationDefaultsByTribunalSigla(tribunalSigla);

  return defaults?.localidades.find((item) => item.slug === localidadeSlug) ?? null;
}

export function getJudicialVaraDefaultBySlug(
  tribunalSigla?: string | null,
  localidadeSlug?: string | null,
  varaSlug?: string | null,
) {
  if (!localidadeSlug || !varaSlug) {
    return null;
  }

  const localidade = getJudicialLocationDefaultBySlug(
    tribunalSigla,
    localidadeSlug,
  );

  return localidade?.varas?.find((item) => item.slug === varaSlug) ?? null;
}

export function buildJudicialCatalogLabel(item: {
  nome: string;
  sigla?: string | null;
}) {
  return item.sigla ? `${item.sigla} - ${item.nome}` : item.nome;
}

type JudicialCatalogMatchable = {
  nome: string;
  sigla?: string | null;
  label?: string;
  aliases?: string[] | null;
};

function buildJudicialCatalogCandidates(item: JudicialCatalogMatchable) {
  return [item.sigla, item.nome, item.label, ...(item.aliases ?? [])]
    .map((value) => normalizeJudicialCatalogText(value))
    .filter((value) => value.length > 0);
}

function escapeCatalogRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsCatalogCandidate(normalizedValue: string, candidate: string) {
  if (normalizedValue === candidate) {
    return true;
  }

  const pattern = new RegExp(
    `(^|[^a-z0-9])${escapeCatalogRegex(candidate)}($|[^a-z0-9])`,
  );

  return pattern.test(normalizedValue);
}

export function findJudicialCatalogMatch<T extends JudicialCatalogMatchable>(
  items: T[],
  rawValue?: string | null,
) {
  const normalizedValue = normalizeJudicialCatalogText(rawValue);

  if (!normalizedValue) {
    return null;
  }

  return (
    items.find((item) =>
      buildJudicialCatalogCandidates(item).some(
        (candidate) => containsCatalogCandidate(normalizedValue, candidate),
      ),
    ) ?? null
  );
}

export function resolveAutoSelectedJudicialLocation<
  T extends JudicialCatalogMatchable,
>(items: T[], candidates: Array<string | null | undefined>) {
  for (const candidate of candidates) {
    const match = findJudicialCatalogMatch(items, candidate);

    if (match) {
      return match;
    }
  }

  if (items.length === 1) {
    return items[0];
  }

  return null;
}
