export interface FreePlanCapitalScope {
  uf: string;
  municipio: string;
  ibge: string;
}

export const FREE_PLAN_CAPITALS: FreePlanCapitalScope[] = [
  { uf: "AC", municipio: "Rio Branco", ibge: "1200401" },
  { uf: "AL", municipio: "Maceio", ibge: "2704302" },
  { uf: "AP", municipio: "Macapa", ibge: "1600303" },
  { uf: "AM", municipio: "Manaus", ibge: "1302603" },
  { uf: "BA", municipio: "Salvador", ibge: "2927408" },
  { uf: "CE", municipio: "Fortaleza", ibge: "2304400" },
  { uf: "DF", municipio: "Brasilia", ibge: "5300108" },
  { uf: "ES", municipio: "Vitoria", ibge: "3205309" },
  { uf: "GO", municipio: "Goiania", ibge: "5208707" },
  { uf: "MA", municipio: "Sao Luis", ibge: "2111300" },
  { uf: "MT", municipio: "Cuiaba", ibge: "5103403" },
  { uf: "MS", municipio: "Campo Grande", ibge: "5002704" },
  { uf: "MG", municipio: "Belo Horizonte", ibge: "3106200" },
  { uf: "PA", municipio: "Belem", ibge: "1501402" },
  { uf: "PB", municipio: "Joao Pessoa", ibge: "2507507" },
  { uf: "PR", municipio: "Curitiba", ibge: "4106902" },
  { uf: "PE", municipio: "Recife", ibge: "2611606" },
  { uf: "PI", municipio: "Teresina", ibge: "2211001" },
  { uf: "RJ", municipio: "Rio de Janeiro", ibge: "3304557" },
  { uf: "RN", municipio: "Natal", ibge: "2408102" },
  { uf: "RS", municipio: "Porto Alegre", ibge: "4314902" },
  { uf: "RO", municipio: "Porto Velho", ibge: "1100205" },
  { uf: "RR", municipio: "Boa Vista", ibge: "1400100" },
  { uf: "SC", municipio: "Florianopolis", ibge: "4205407" },
  { uf: "SP", municipio: "Sao Paulo", ibge: "3550308" },
  { uf: "SE", municipio: "Aracaju", ibge: "2800308" },
  { uf: "TO", municipio: "Palmas", ibge: "1721000" },
];

function normalizeTextKey(value?: string | null): string {
  if (!value) return "";

  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export function findFreePlanCapitalScope(params: {
  uf?: string | null;
  municipio?: string | null;
  ibge?: string | null;
}): FreePlanCapitalScope | null {
  const normalizedUf = normalizeTextKey(params.uf).slice(0, 2);
  const normalizedMunicipio = normalizeTextKey(params.municipio);
  const normalizedIbge = (params.ibge || "").trim();

  return (
    FREE_PLAN_CAPITALS.find((item) => {
      if (item.uf !== normalizedUf) {
        return false;
      }

      if (normalizedIbge) {
        return item.ibge === normalizedIbge;
      }

      return normalizeTextKey(item.municipio) === normalizedMunicipio;
    }) || null
  );
}
