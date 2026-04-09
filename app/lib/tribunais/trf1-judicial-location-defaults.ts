import type {
  TribunalJudicialLocationDefault,
  TribunalLocalidadeDefault,
  TribunalVaraDefault,
} from "./judicial-location-defaults";

function buildAliases(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(values.map((value) => value?.trim()).filter(Boolean) as string[]),
  );
}

function slugifyValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function createCapitalAliases(
  capital: string,
  secaoSigla: string,
  estado: string,
  extras: string[] = [],
) {
  return buildAliases([
    capital,
    `${capital}/${estado}`,
    secaoSigla,
    `Justica Federal ${capital}`,
    `Justica Federal em ${capital}`,
    ...extras,
  ]);
}

function createSubsecaoAliases(cidade: string, estado: string) {
  return buildAliases([
    cidade,
    `${cidade}/${estado}`,
    `Subsecao ${cidade}`,
    `Subsecao de ${cidade}`,
    `Subsecao Judiciaria de ${cidade}`,
    `SSJ ${cidade}`,
    `SSJ de ${cidade}`,
  ]);
}

function createVaraAliases(
  nome: string,
  cidade: string,
  extras: string[] = [],
) {
  return buildAliases([
    nome,
    `${nome} de ${cidade}`,
    `${nome} da Subsecao Judiciaria de ${cidade}`,
    ...extras,
  ]);
}

function createVaraDefault(params: {
  nome: string;
  tipo: string;
  ordem: number;
  cidade: string;
  aliases?: string[];
}) {
  const { nome, tipo, ordem, cidade, aliases = [] } = params;

  return {
    slug: slugifyValue(nome),
    nome,
    tipo,
    ordem,
    aliases: createVaraAliases(nome, cidade, aliases),
  } satisfies TribunalVaraDefault;
}

function createInteriorVaras(cidade: string, quantidade: number) {
  return Array.from({ length: quantidade }, (_, index) => {
    const numero = index + 1;
    const nome = `${numero}A VARA FEDERAL`;

    return createVaraDefault({
      nome,
      tipo: "VARA_FEDERAL",
      ordem: numero * 10,
      cidade,
      aliases: [`${numero}a vara ${cidade}`],
    });
  });
}

function createSubsecaoLocalidade(params: {
  cidade: string;
  estado: string;
  ordem: number;
  quantidadeVaras: number;
}) {
  const { cidade, estado, ordem, quantidadeVaras } = params;

  return {
    slug: `ssj-${slugifyValue(cidade)}`,
    nome: `Subsecao Judiciaria de ${cidade}`,
    tipo: "SUBSECAO_JUDICIARIA",
    ordem,
    aliases: createSubsecaoAliases(cidade, estado),
    varas: createInteriorVaras(cidade, quantidadeVaras),
  } satisfies TribunalLocalidadeDefault;
}

const SALVADOR_VARAS: TribunalVaraDefault[] = [
  createVaraDefault({
    nome: "1A VARA FEDERAL CIVEL",
    tipo: "VARA_FEDERAL_CIVEL",
    ordem: 10,
    cidade: "Salvador",
    aliases: ["1a vara civel de salvador"],
  }),
  createVaraDefault({
    nome: "2A VARA FEDERAL CRIMINAL",
    tipo: "VARA_FEDERAL_CRIMINAL",
    ordem: 20,
    cidade: "Salvador",
    aliases: [
      "2a vara federal criminal de salvador",
      "2a vara federal sistema financeiro de salvador",
    ],
  }),
  createVaraDefault({
    nome: "3A VARA FEDERAL CIVEL",
    tipo: "VARA_FEDERAL_CIVEL",
    ordem: 30,
    cidade: "Salvador",
  }),
  createVaraDefault({
    nome: "4A VARA FEDERAL CIVEL",
    tipo: "VARA_FEDERAL_CIVEL",
    ordem: 40,
    cidade: "Salvador",
  }),
  createVaraDefault({
    nome: "5A VARA FEDERAL DE JUIZADO ESPECIAL FEDERAL",
    tipo: "VARA_FEDERAL_JEF",
    ordem: 50,
    cidade: "Salvador",
    aliases: ["5a vara federal jef", "5a vara do jef de salvador"],
  }),
  createVaraDefault({
    nome: "6A VARA FEDERAL CIVEL",
    tipo: "VARA_FEDERAL_CIVEL",
    ordem: 60,
    cidade: "Salvador",
  }),
  createVaraDefault({
    nome: "7A VARA FEDERAL CIVEL E AGRARIA",
    tipo: "VARA_FEDERAL_CIVEL_AGRARIA",
    ordem: 70,
    cidade: "Salvador",
  }),
  createVaraDefault({
    nome: "8A VARA FEDERAL DE EXECUCAO FISCAL",
    tipo: "VARA_FEDERAL_EXECUCAO_FISCAL",
    ordem: 80,
    cidade: "Salvador",
  }),
  createVaraDefault({
    nome: "9A VARA FEDERAL DE JUIZADO ESPECIAL FEDERAL",
    tipo: "VARA_FEDERAL_JEF",
    ordem: 90,
    cidade: "Salvador",
    aliases: ["9a vara federal jef", "9a vara do jef de salvador"],
  }),
  createVaraDefault({
    nome: "10A VARA FEDERAL CIVEL",
    tipo: "VARA_FEDERAL_CIVEL",
    ordem: 100,
    cidade: "Salvador",
  }),
  createVaraDefault({
    nome: "11A VARA FEDERAL CIVEL",
    tipo: "VARA_FEDERAL_CIVEL",
    ordem: 110,
    cidade: "Salvador",
  }),
  createVaraDefault({
    nome: "12A VARA FEDERAL CIVEL",
    tipo: "VARA_FEDERAL_CIVEL",
    ordem: 120,
    cidade: "Salvador",
  }),
  createVaraDefault({
    nome: "13A VARA FEDERAL CIVEL",
    tipo: "VARA_FEDERAL_CIVEL",
    ordem: 130,
    cidade: "Salvador",
  }),
  createVaraDefault({
    nome: "14A VARA FEDERAL CIVEL",
    tipo: "VARA_FEDERAL_CIVEL",
    ordem: 140,
    cidade: "Salvador",
  }),
  createVaraDefault({
    nome: "15A VARA FEDERAL DE JUIZADO ESPECIAL FEDERAL",
    tipo: "VARA_FEDERAL_JEF",
    ordem: 150,
    cidade: "Salvador",
    aliases: ["15a vara federal jef", "15a vara do jef de salvador"],
  }),
  createVaraDefault({
    nome: "16A VARA FEDERAL CIVEL",
    tipo: "VARA_FEDERAL_CIVEL",
    ordem: 160,
    cidade: "Salvador",
  }),
  createVaraDefault({
    nome: "17A VARA FEDERAL CRIMINAL",
    tipo: "VARA_FEDERAL_CRIMINAL",
    ordem: 170,
    cidade: "Salvador",
    aliases: ["17a vara federal criminal de salvador"],
  }),
  createVaraDefault({
    nome: "18A VARA FEDERAL DE EXECUCAO FISCAL",
    tipo: "VARA_FEDERAL_EXECUCAO_FISCAL",
    ordem: 180,
    cidade: "Salvador",
  }),
  createVaraDefault({
    nome: "19A VARA FEDERAL DE EXECUCAO FISCAL",
    tipo: "VARA_FEDERAL_EXECUCAO_FISCAL",
    ordem: 190,
    cidade: "Salvador",
  }),
  createVaraDefault({
    nome: "20A VARA FEDERAL DE EXECUCAO FISCAL",
    tipo: "VARA_FEDERAL_EXECUCAO_FISCAL",
    ordem: 200,
    cidade: "Salvador",
  }),
  createVaraDefault({
    nome: "21A VARA FEDERAL DE JUIZADO ESPECIAL FEDERAL",
    tipo: "VARA_FEDERAL_JEF",
    ordem: 210,
    cidade: "Salvador",
    aliases: ["21a vara federal jef", "21a vara do jef de salvador"],
  }),
  createVaraDefault({
    nome: "22A VARA FEDERAL DE JUIZADO ESPECIAL FEDERAL",
    tipo: "VARA_FEDERAL_JEF",
    ordem: 220,
    cidade: "Salvador",
    aliases: ["22a vara federal jef", "22a vara do jef de salvador"],
  }),
  createVaraDefault({
    nome: "23A VARA FEDERAL DE JUIZADO ESPECIAL FEDERAL",
    tipo: "VARA_FEDERAL_JEF",
    ordem: 230,
    cidade: "Salvador",
    aliases: ["23a vara federal jef", "23a vara do jef de salvador"],
  }),
  createVaraDefault({
    nome: "24A VARA FEDERAL DE EXECUCAO FISCAL",
    tipo: "VARA_FEDERAL_EXECUCAO_FISCAL",
    ordem: 240,
    cidade: "Salvador",
  }),
];

const BELEM_VARAS: TribunalVaraDefault[] = [
  createVaraDefault({
    nome: "1A VARA FEDERAL",
    tipo: "VARA_FEDERAL",
    ordem: 10,
    cidade: "Belem",
    aliases: ["1a vara federal de belem"],
  }),
  createVaraDefault({
    nome: "2A VARA FEDERAL CIVEL",
    tipo: "VARA_FEDERAL_CIVEL",
    ordem: 20,
    cidade: "Belem",
  }),
  createVaraDefault({
    nome: "3A VARA FEDERAL CRIMINAL",
    tipo: "VARA_FEDERAL_CRIMINAL",
    ordem: 30,
    cidade: "Belem",
  }),
  createVaraDefault({
    nome: "4A VARA FEDERAL CRIMINAL",
    tipo: "VARA_FEDERAL_CRIMINAL",
    ordem: 40,
    cidade: "Belem",
  }),
  createVaraDefault({
    nome: "5A VARA FEDERAL CIVEL",
    tipo: "VARA_FEDERAL_CIVEL",
    ordem: 50,
    cidade: "Belem",
  }),
  createVaraDefault({
    nome: "6A VARA FEDERAL DE EXECUCAO FISCAL",
    tipo: "VARA_FEDERAL_EXECUCAO_FISCAL",
    ordem: 60,
    cidade: "Belem",
  }),
  createVaraDefault({
    nome: "7A VARA FEDERAL DE EXECUCAO FISCAL",
    tipo: "VARA_FEDERAL_EXECUCAO_FISCAL",
    ordem: 70,
    cidade: "Belem",
  }),
  createVaraDefault({
    nome: "8A VARA FEDERAL DE JUIZADO ESPECIAL CIVEL",
    tipo: "VARA_FEDERAL_JEF_CIVEL",
    ordem: 80,
    cidade: "Belem",
    aliases: ["8a vara federal jef de belem"],
  }),
  createVaraDefault({
    nome: "9A VARA FEDERAL AMBIENTAL E AGRARIA",
    tipo: "VARA_FEDERAL_AMBIENTAL_AGRARIA",
    ordem: 90,
    cidade: "Belem",
  }),
  createVaraDefault({
    nome: "10A VARA FEDERAL DE JUIZADO ESPECIAL CIVEL",
    tipo: "VARA_FEDERAL_JEF_CIVEL",
    ordem: 100,
    cidade: "Belem",
    aliases: ["10a vara federal jef de belem"],
  }),
  createVaraDefault({
    nome: "11A VARA FEDERAL DE JUIZADO ESPECIAL CIVEL",
    tipo: "VARA_FEDERAL_JEF_CIVEL",
    ordem: 110,
    cidade: "Belem",
    aliases: ["11a vara federal jef de belem"],
  }),
  createVaraDefault({
    nome: "12A VARA FEDERAL DE JUIZADO ESPECIAL CIVEL",
    tipo: "VARA_FEDERAL_JEF_CIVEL",
    ordem: 120,
    cidade: "Belem",
    aliases: ["12a vara federal jef de belem"],
  }),
];

export const TRF1_JUDICIAL_LOCATION_DEFAULTS: TribunalJudicialLocationDefault =
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
        aliases: createCapitalAliases("Salvador", "SJBA", "BA", ["JFBA", "Bahia"]),
        varas: SALVADOR_VARAS,
      },
      createSubsecaoLocalidade({
        cidade: "Alagoinhas",
        estado: "BA",
        ordem: 41,
        quantidadeVaras: 1,
      }),
      createSubsecaoLocalidade({
        cidade: "Barreiras",
        estado: "BA",
        ordem: 42,
        quantidadeVaras: 1,
      }),
      createSubsecaoLocalidade({
        cidade: "Bom Jesus da Lapa",
        estado: "BA",
        ordem: 43,
        quantidadeVaras: 1,
      }),
      createSubsecaoLocalidade({
        cidade: "Campo Formoso",
        estado: "BA",
        ordem: 44,
        quantidadeVaras: 1,
      }),
      createSubsecaoLocalidade({
        cidade: "Eunapolis",
        estado: "BA",
        ordem: 45,
        quantidadeVaras: 1,
      }),
      createSubsecaoLocalidade({
        cidade: "Feira de Santana",
        estado: "BA",
        ordem: 46,
        quantidadeVaras: 3,
      }),
      createSubsecaoLocalidade({
        cidade: "Guanambi",
        estado: "BA",
        ordem: 47,
        quantidadeVaras: 1,
      }),
      createSubsecaoLocalidade({
        cidade: "Ilheus",
        estado: "BA",
        ordem: 48,
        quantidadeVaras: 1,
      }),
      createSubsecaoLocalidade({
        cidade: "Irece",
        estado: "BA",
        ordem: 49,
        quantidadeVaras: 1,
      }),
      createSubsecaoLocalidade({
        cidade: "Itabuna",
        estado: "BA",
        ordem: 50,
        quantidadeVaras: 2,
      }),
      createSubsecaoLocalidade({
        cidade: "Jequie",
        estado: "BA",
        ordem: 51,
        quantidadeVaras: 1,
      }),
      createSubsecaoLocalidade({
        cidade: "Juazeiro",
        estado: "BA",
        ordem: 52,
        quantidadeVaras: 1,
      }),
      createSubsecaoLocalidade({
        cidade: "Paulo Afonso",
        estado: "BA",
        ordem: 53,
        quantidadeVaras: 1,
      }),
      createSubsecaoLocalidade({
        cidade: "Teixeira de Freitas",
        estado: "BA",
        ordem: 54,
        quantidadeVaras: 1,
      }),
      createSubsecaoLocalidade({
        cidade: "Vitoria da Conquista",
        estado: "BA",
        ordem: 55,
        quantidadeVaras: 2,
      }),
      {
        slug: "sjdf",
        nome: "Secao Judiciaria do Distrito Federal",
        sigla: "SJDF",
        tipo: "SECAO_JUDICIARIA",
        ordem: 60,
      },
      {
        slug: "sjgo",
        nome: "Secao Judiciaria de Goias",
        sigla: "SJGO",
        tipo: "SECAO_JUDICIARIA",
        ordem: 70,
      },
      {
        slug: "sjma",
        nome: "Secao Judiciaria do Maranhao",
        sigla: "SJMA",
        tipo: "SECAO_JUDICIARIA",
        ordem: 80,
      },
      {
        slug: "sjmt",
        nome: "Secao Judiciaria do Mato Grosso",
        sigla: "SJMT",
        tipo: "SECAO_JUDICIARIA",
        ordem: 90,
      },
      {
        slug: "sjpa",
        nome: "Secao Judiciaria do Para",
        sigla: "SJPA",
        tipo: "SECAO_JUDICIARIA",
        ordem: 100,
        aliases: createCapitalAliases("Belem", "SJPA", "PA", ["JFPA", "Para"]),
        varas: BELEM_VARAS,
      },
      createSubsecaoLocalidade({
        cidade: "Altamira",
        estado: "PA",
        ordem: 101,
        quantidadeVaras: 1,
      }),
      createSubsecaoLocalidade({
        cidade: "Castanhal",
        estado: "PA",
        ordem: 102,
        quantidadeVaras: 1,
      }),
      createSubsecaoLocalidade({
        cidade: "Itaituba",
        estado: "PA",
        ordem: 103,
        quantidadeVaras: 1,
      }),
      createSubsecaoLocalidade({
        cidade: "Maraba",
        estado: "PA",
        ordem: 104,
        quantidadeVaras: 2,
      }),
      createSubsecaoLocalidade({
        cidade: "Paragominas",
        estado: "PA",
        ordem: 105,
        quantidadeVaras: 1,
      }),
      createSubsecaoLocalidade({
        cidade: "Redencao",
        estado: "PA",
        ordem: 106,
        quantidadeVaras: 1,
      }),
      createSubsecaoLocalidade({
        cidade: "Santarem",
        estado: "PA",
        ordem: 107,
        quantidadeVaras: 2,
      }),
      createSubsecaoLocalidade({
        cidade: "Tucurui",
        estado: "PA",
        ordem: 108,
        quantidadeVaras: 1,
      }),
      {
        slug: "sjpi",
        nome: "Secao Judiciaria do Piaui",
        sigla: "SJPI",
        tipo: "SECAO_JUDICIARIA",
        ordem: 110,
      },
      {
        slug: "sjro",
        nome: "Secao Judiciaria de Rondonia",
        sigla: "SJRO",
        tipo: "SECAO_JUDICIARIA",
        ordem: 120,
      },
      {
        slug: "sjrr",
        nome: "Secao Judiciaria de Roraima",
        sigla: "SJRR",
        tipo: "SECAO_JUDICIARIA",
        ordem: 130,
      },
      {
        slug: "sjto",
        nome: "Secao Judiciaria do Tocantins",
        sigla: "SJTO",
        tipo: "SECAO_JUDICIARIA",
        ordem: 140,
      },
    ],
  };
