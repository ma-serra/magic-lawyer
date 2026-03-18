export type BancoQualitySignalCode = "duplicate_name" | "duplicate_ispb";

export interface BancoCatalogIdentity {
  codigo: string;
  nome: string;
  nomeCompleto?: string | null;
  ispb?: string | null;
}

export interface BancoQualitySignal {
  code: BancoQualitySignalCode;
  label: string;
  description: string;
  severity: "warning" | "danger";
}

export interface BancoCatalogQualitySummary {
  duplicateNameGroups: Array<{ key: string; codigos: string[] }>;
  duplicateIspbGroups: Array<{ key: string; codigos: string[] }>;
  signalsByCodigo: Record<string, BancoQualitySignal[]>;
  anomalyCodes: string[];
}

export interface BancoInputLike {
  codigo?: string;
  nome?: string;
  nomeCompleto?: string | null;
  site?: string | null;
  telefone?: string | null;
  cnpj?: string | null;
  ispb?: string | null;
  ativo?: boolean;
}

export interface NormalizedBancoInput {
  codigo: string;
  nome: string;
  nomeCompleto: string | null;
  site: string | null;
  telefone: string | null;
  cnpj: string | null;
  ispb: string | null;
  ativo: boolean;
}

export interface BancoValidationResult {
  ok: boolean;
  errors: string[];
  data: NormalizedBancoInput;
}

function compactWhitespace(value: string | null | undefined) {
  return value?.trim().replace(/\s+/g, " ") ?? "";
}

function digitsOnly(value: string | null | undefined) {
  return value?.replace(/\D/g, "") ?? "";
}

function normalizeCatalogKey(value: string | null | undefined) {
  return compactWhitespace(value).toLocaleLowerCase("pt-BR");
}

function normalizeUrl(value: string | null | undefined) {
  const trimmed = compactWhitespace(value);

  if (!trimmed) {
    return null;
  }

  const candidate = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const parsed = new URL(candidate);

    return parsed.toString();
  } catch {
    return trimmed;
  }
}

function isValidCnpj(cnpj: string) {
  const normalized = digitsOnly(cnpj);

  if (normalized.length !== 14 || /^(\d)\1+$/.test(normalized)) {
    return false;
  }

  let length = 12;
  let numbers = normalized.substring(0, length);
  let sum = 0;
  let pos = length - 7;

  for (let i = length; i >= 1; i -= 1) {
    sum += Number(numbers.charAt(length - i)) * pos;
    pos -= 1;

    if (pos < 2) {
      pos = 9;
    }
  }

  let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);

  if (result !== Number(normalized.charAt(12))) {
    return false;
  }

  length = 13;
  numbers = normalized.substring(0, length);
  sum = 0;
  pos = length - 7;

  for (let i = length; i >= 1; i -= 1) {
    sum += Number(numbers.charAt(length - i)) * pos;
    pos -= 1;

    if (pos < 2) {
      pos = 9;
    }
  }

  result = sum % 11 < 2 ? 0 : 11 - (sum % 11);

  return result === Number(normalized.charAt(13));
}

export function normalizeBancoInput(data: BancoInputLike): NormalizedBancoInput {
  const codigoDigits = digitsOnly(data.codigo);
  const normalizedCode =
    codigoDigits.length === 0
      ? ""
      : codigoDigits.length >= 3
        ? codigoDigits.slice(0, 3)
        : codigoDigits.padStart(3, "0");

  const normalizedSite = normalizeUrl(data.site);

  return {
    codigo: normalizedCode,
    nome: compactWhitespace(data.nome),
    nomeCompleto: compactWhitespace(data.nomeCompleto) || null,
    site: normalizedSite,
    telefone: compactWhitespace(data.telefone) || null,
    cnpj: digitsOnly(data.cnpj) || null,
    ispb: digitsOnly(data.ispb) || null,
    ativo: data.ativo ?? true,
  };
}

export function validateBancoInput(
  data: BancoInputLike,
  options: { requireCodigo?: boolean } = {},
): BancoValidationResult {
  const normalized = normalizeBancoInput(data);
  const errors: string[] = [];
  const requireCodigo = options.requireCodigo ?? true;

  if (requireCodigo && !/^\d{3}$/.test(normalized.codigo)) {
    errors.push("Informe um código COMPE com 3 dígitos.");
  }

  if (normalized.nome.length < 2) {
    errors.push("Informe o nome da instituição com pelo menos 2 caracteres.");
  }

  if (normalized.ispb && !/^\d{8}$/.test(normalized.ispb)) {
    errors.push("ISPB deve conter 8 dígitos.");
  }

  if (normalized.cnpj && !isValidCnpj(normalized.cnpj)) {
    errors.push("CNPJ inválido.");
  }

  if (normalized.site) {
    try {
      new URL(normalized.site);
    } catch {
      errors.push("Informe uma URL válida para o site.");
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    data: normalized,
  };
}

export function buildBancoCatalogQualitySummary(
  bancos: BancoCatalogIdentity[],
): BancoCatalogQualitySummary {
  const duplicateNameMap = new Map<string, string[]>();
  const duplicateIspbMap = new Map<string, string[]>();

  for (const banco of bancos) {
    const nameKey = normalizeCatalogKey(banco.nomeCompleto || banco.nome);

    if (nameKey) {
      duplicateNameMap.set(nameKey, [
        ...(duplicateNameMap.get(nameKey) || []),
        banco.codigo,
      ]);
    }

    const ispbKey = digitsOnly(banco.ispb);

    if (ispbKey) {
      duplicateIspbMap.set(ispbKey, [
        ...(duplicateIspbMap.get(ispbKey) || []),
        banco.codigo,
      ]);
    }
  }

  const duplicateNameGroups = [...duplicateNameMap.entries()]
    .filter(([, codigos]) => codigos.length > 1)
    .map(([key, codigos]) => ({ key, codigos: [...new Set(codigos)].sort() }));

  const duplicateIspbGroups = [...duplicateIspbMap.entries()]
    .filter(([, codigos]) => codigos.length > 1)
    .map(([key, codigos]) => ({ key, codigos: [...new Set(codigos)].sort() }));

  const signalsByCodigo: Record<string, BancoQualitySignal[]> = {};

  for (const group of duplicateNameGroups) {
    for (const codigo of group.codigos) {
      signalsByCodigo[codigo] = signalsByCodigo[codigo] || [];
      signalsByCodigo[codigo].push({
        code: "duplicate_name",
        label: "Nome repetido em outro código",
        description:
          "A mesma instituição aparece em mais de um código COMPE dentro do catálogo.",
        severity: "warning",
      });
    }
  }

  for (const group of duplicateIspbGroups) {
    for (const codigo of group.codigos) {
      signalsByCodigo[codigo] = signalsByCodigo[codigo] || [];
      signalsByCodigo[codigo].push({
        code: "duplicate_ispb",
        label: "ISPB compartilhado",
        description:
          "O mesmo ISPB está associado a múltiplas instituições no catálogo.",
        severity: "danger",
      });
    }
  }

  const anomalyCodes = Object.keys(signalsByCodigo).sort();

  return {
    duplicateNameGroups,
    duplicateIspbGroups,
    signalsByCodigo,
    anomalyCodes,
  };
}
