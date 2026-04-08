export type TribunalVaraDefault = {
  slug: string;
  nome: string;
  sigla?: string | null;
  tipo?: string | null;
  ordem?: number | null;
};

export type TribunalLocalidadeDefault = {
  slug: string;
  nome: string;
  sigla?: string | null;
  tipo?: string | null;
  ordem?: number | null;
  varas?: TribunalVaraDefault[];
};

export type TribunalJudicialLocationDefault = {
  tribunalSigla: string;
  localidades: TribunalLocalidadeDefault[];
};

export const TRIBUNAL_JUDICIAL_LOCATION_DEFAULTS: TribunalJudicialLocationDefault[] =
  [
    {
      tribunalSigla: "TRF1",
      localidades: [
        {
          slug: "sjac",
          nome: "Secao Judiciaria do Acre",
          sigla: "SJAC",
          tipo: "SECAO_JUDICIARIA",
          ordem: 10,
        },
        {
          slug: "sjam",
          nome: "Secao Judiciaria do Amazonas",
          sigla: "SJAM",
          tipo: "SECAO_JUDICIARIA",
          ordem: 20,
        },
        {
          slug: "sjap",
          nome: "Secao Judiciaria do Amapa",
          sigla: "SJAP",
          tipo: "SECAO_JUDICIARIA",
          ordem: 30,
        },
        {
          slug: "sjba",
          nome: "Secao Judiciaria da Bahia",
          sigla: "SJBA",
          tipo: "SECAO_JUDICIARIA",
          ordem: 40,
        },
        {
          slug: "sjdf",
          nome: "Secao Judiciaria do Distrito Federal",
          sigla: "SJDF",
          tipo: "SECAO_JUDICIARIA",
          ordem: 50,
        },
        {
          slug: "sjgo",
          nome: "Secao Judiciaria de Goias",
          sigla: "SJGO",
          tipo: "SECAO_JUDICIARIA",
          ordem: 60,
        },
        {
          slug: "sjma",
          nome: "Secao Judiciaria do Maranhao",
          sigla: "SJMA",
          tipo: "SECAO_JUDICIARIA",
          ordem: 70,
        },
        {
          slug: "sjmt",
          nome: "Secao Judiciaria do Mato Grosso",
          sigla: "SJMT",
          tipo: "SECAO_JUDICIARIA",
          ordem: 80,
        },
        {
          slug: "sjpa",
          nome: "Secao Judiciaria do Para",
          sigla: "SJPA",
          tipo: "SECAO_JUDICIARIA",
          ordem: 90,
          varas: [
            {
              slug: "1a-vara-federal",
              nome: "1A VARA FEDERAL",
              tipo: "VARA_FEDERAL",
              ordem: 10,
            },
            {
              slug: "2a-vara-federal-civel",
              nome: "2A VARA FEDERAL CIVEL",
              tipo: "VARA_FEDERAL_CIVEL",
              ordem: 20,
            },
            {
              slug: "3a-vara-federal-criminal",
              nome: "3A VARA FEDERAL CRIMINAL",
              tipo: "VARA_FEDERAL_CRIMINAL",
              ordem: 30,
            },
            {
              slug: "4a-vara-federal-criminal",
              nome: "4A VARA FEDERAL CRIMINAL",
              tipo: "VARA_FEDERAL_CRIMINAL",
              ordem: 40,
            },
            {
              slug: "5a-vara-federal-civel",
              nome: "5A VARA FEDERAL CIVEL",
              tipo: "VARA_FEDERAL_CIVEL",
              ordem: 50,
            },
            {
              slug: "6a-vara-federal-execucao-fiscal",
              nome: "6A VARA FEDERAL DE EXECUCAO FISCAL",
              tipo: "VARA_FEDERAL_EXECUCAO_FISCAL",
              ordem: 60,
            },
            {
              slug: "7a-vara-federal-execucao-fiscal",
              nome: "7A VARA FEDERAL DE EXECUCAO FISCAL",
              tipo: "VARA_FEDERAL_EXECUCAO_FISCAL",
              ordem: 70,
            },
            {
              slug: "8a-vara-federal-jef-civel",
              nome: "8A VARA FEDERAL DE JUIZADO ESPECIAL CIVEL",
              tipo: "VARA_FEDERAL_JEF_CIVEL",
              ordem: 80,
            },
            {
              slug: "9a-vara-federal-ambiental-agraria",
              nome: "9A VARA FEDERAL AMBIENTAL E AGRARIA",
              tipo: "VARA_FEDERAL_AMBIENTAL_AGRARIA",
              ordem: 90,
            },
            {
              slug: "10a-vara-federal-jef-civel",
              nome: "10A VARA FEDERAL DE JUIZADO ESPECIAL CIVEL",
              tipo: "VARA_FEDERAL_JEF_CIVEL",
              ordem: 100,
            },
            {
              slug: "11a-vara-federal-jef-civel",
              nome: "11A VARA FEDERAL DE JUIZADO ESPECIAL CIVEL",
              tipo: "VARA_FEDERAL_JEF_CIVEL",
              ordem: 110,
            },
            {
              slug: "12a-vara-federal-jef-civel",
              nome: "12A VARA FEDERAL DE JUIZADO ESPECIAL CIVEL",
              tipo: "VARA_FEDERAL_JEF_CIVEL",
              ordem: 120,
            },
          ],
        },
        {
          slug: "sjpi",
          nome: "Secao Judiciaria do Piaui",
          sigla: "SJPI",
          tipo: "SECAO_JUDICIARIA",
          ordem: 100,
        },
        {
          slug: "sjro",
          nome: "Secao Judiciaria de Rondonia",
          sigla: "SJRO",
          tipo: "SECAO_JUDICIARIA",
          ordem: 110,
        },
        {
          slug: "sjrr",
          nome: "Secao Judiciaria de Roraima",
          sigla: "SJRR",
          tipo: "SECAO_JUDICIARIA",
          ordem: 120,
        },
        {
          slug: "sjto",
          nome: "Secao Judiciaria do Tocantins",
          sigla: "SJTO",
          tipo: "SECAO_JUDICIARIA",
          ordem: 130,
        },
      ],
    },
  ];

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

export function buildJudicialCatalogLabel(item: {
  nome: string;
  sigla?: string | null;
}) {
  return item.sigla ? `${item.sigla} - ${item.nome}` : item.nome;
}

export function findJudicialCatalogMatch<
  T extends {
    nome: string;
    sigla?: string | null;
    label?: string;
  },
>(items: T[], rawValue?: string | null) {
  const normalizedValue = normalizeJudicialCatalogText(rawValue);

  if (!normalizedValue) {
    return null;
  }

  return (
    items.find((item) => {
      const sigla = normalizeJudicialCatalogText(item.sigla);
      const nome = normalizeJudicialCatalogText(item.nome);
      const label = normalizeJudicialCatalogText(item.label);

      return (
        normalizedValue === sigla ||
        normalizedValue === nome ||
        normalizedValue === label ||
        (sigla ? normalizedValue.includes(sigla) : false) ||
        normalizedValue.includes(nome)
      );
    }) ?? null
  );
}

export function resolveAutoSelectedJudicialLocation<
  T extends {
    nome: string;
    sigla?: string | null;
    label?: string;
  },
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
