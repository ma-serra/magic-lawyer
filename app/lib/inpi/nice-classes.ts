export type NiceClassType = "PRODUTO" | "SERVICO";

export interface NiceClassDefinition {
  code: string;
  heading: string;
  description: string;
  type: NiceClassType;
}

const NICE_CLASS_CATALOG_UNSORTED: NiceClassDefinition[] = [
  {
    code: "1",
    heading: "Produtos quimicos industriais",
    description:
      "Produtos quimicos para industria, ciencia, fotografia, agricultura e manufatura.",
    type: "PRODUTO",
  },
  {
    code: "2",
    heading: "Tintas, vernizes e corantes",
    description:
      "Tintas, vernizes, lacas, conservantes contra ferrugem e agentes de coloracao.",
    type: "PRODUTO",
  },
  {
    code: "3",
    heading: "Cosmeticos e limpeza",
    description:
      "Produtos de higiene pessoal, perfumaria, cosmeticos e preparacoes para limpeza.",
    type: "PRODUTO",
  },
  {
    code: "4",
    heading: "Lubrificantes e combustiveis",
    description:
      "Oleos e graxas industriais, combustiveis, velas e materiais para iluminacao.",
    type: "PRODUTO",
  },
  {
    code: "5",
    heading: "Farmaceuticos e veterinarios",
    description:
      "Produtos farmaceuticos, veterinarios, dieteticos, suplementos e desinfetantes.",
    type: "PRODUTO",
  },
  {
    code: "6",
    heading: "Metais comuns e ligas",
    description:
      "Metais comuns e seus produtos semielaborados para uso industrial e construcao.",
    type: "PRODUTO",
  },
  {
    code: "7",
    heading: "Maquinas e motores",
    description:
      "Maquinas, maquinas-ferramenta, motores e pecas para operacao mecanica.",
    type: "PRODUTO",
  },
  {
    code: "8",
    heading: "Ferramentas manuais",
    description:
      "Ferramentas e instrumentos manuais acionados sem motor, cutelaria e navalhas.",
    type: "PRODUTO",
  },
  {
    code: "9",
    heading: "Software e aparelhos eletronicos",
    description:
      "Aparelhos cientificos, eletricos, eletronicos, software e equipamentos de medicao.",
    type: "PRODUTO",
  },
  {
    code: "10",
    heading: "Aparelhos medicos",
    description:
      "Instrumentos e aparelhos cirurgicos, medicos, odontologicos e veterinarios.",
    type: "PRODUTO",
  },
  {
    code: "11",
    heading: "Iluminacao e climatizacao",
    description:
      "Aparelhos para iluminacao, aquecimento, refrigeracao, ventilacao e saneamento.",
    type: "PRODUTO",
  },
  {
    code: "12",
    heading: "Veiculos e locomocao",
    description:
      "Veiculos, aparelhos de locomocao terrestre, aerea, nautica e seus componentes.",
    type: "PRODUTO",
  },
  {
    code: "13",
    heading: "Armas e fogos",
    description:
      "Armas de fogo, municoes, explosivos e artigos pirotecnicos.",
    type: "PRODUTO",
  },
  {
    code: "14",
    heading: "Joalheria e relojoaria",
    description:
      "Metais preciosos, joias, pedras preciosas, relogios e instrumentos cronometricos.",
    type: "PRODUTO",
  },
  {
    code: "15",
    heading: "Instrumentos musicais",
    description:
      "Instrumentos musicais, suportes, estojos e acessorios.",
    type: "PRODUTO",
  },
  {
    code: "16",
    heading: "Papelaria e impressos",
    description:
      "Papel, papelao, material de escritorio, impressos e material didatico.",
    type: "PRODUTO",
  },
  {
    code: "17",
    heading: "Borracha e isolantes",
    description:
      "Borracha, plastico semiprocessado, materiais de vedacao e isolamento.",
    type: "PRODUTO",
  },
  {
    code: "18",
    heading: "Couro e malas",
    description:
      "Couro, imitacoes de couro, malas, mochilas, bolsas e artigos de selaria.",
    type: "PRODUTO",
  },
  {
    code: "19",
    heading: "Materiais de construcao nao metalicos",
    description:
      "Materiais de construcao nao metalicos, tubos rigidos, asfaltos e monumentos.",
    type: "PRODUTO",
  },
  {
    code: "20",
    heading: "Moveis e artigos domesticos",
    description:
      "Moveis, espelhos, molduras e produtos em madeira, plastico e materias similares.",
    type: "PRODUTO",
  },
  {
    code: "21",
    heading: "Utensilios domesticos",
    description:
      "Utensilios e recipientes domesticos, escovas, vidro, porcelana e louca.",
    type: "PRODUTO",
  },
  {
    code: "22",
    heading: "Cordas, redes e tendas",
    description:
      "Cordas, barbantes, redes, tendas, lonas e materiais de acondicionamento textil.",
    type: "PRODUTO",
  },
  {
    code: "23",
    heading: "Fios texteis",
    description: "Fios e linhas para uso textil.",
    type: "PRODUTO",
  },
  {
    code: "24",
    heading: "Tecidos e texteis",
    description:
      "Tecidos, colchas, toalhas e materiais texteis nao incluidos em outras classes.",
    type: "PRODUTO",
  },
  {
    code: "25",
    heading: "Vestuario e calcados",
    description: "Roupas, calcados e chapelaria.",
    type: "PRODUTO",
  },
  {
    code: "26",
    heading: "Armarinho e passamanaria",
    description:
      "Rendas, bordados, fitas, botoes, ilhoses, alfinetes e flores artificiais.",
    type: "PRODUTO",
  },
  {
    code: "27",
    heading: "Tapetes e revestimentos",
    description:
      "Tapetes, capachos, esteiras, linoleo e revestimentos para pisos e paredes.",
    type: "PRODUTO",
  },
  {
    code: "28",
    heading: "Brinquedos e artigos esportivos",
    description:
      "Jogos, brinquedos, artigos de ginasio e esporte, decoracoes para arvores de natal.",
    type: "PRODUTO",
  },
  {
    code: "29",
    heading: "Alimentos processados de origem animal",
    description:
      "Carnes, peixes, aves, laticinios, conservas, oleos comestiveis e alimentos processados.",
    type: "PRODUTO",
  },
  {
    code: "30",
    heading: "Alimentos de base vegetal e condimentos",
    description:
      "Cafe, cha, acucar, massas, paes, confeitaria, molhos e condimentos.",
    type: "PRODUTO",
  },
  {
    code: "31",
    heading: "Produtos agricolas in natura",
    description:
      "Produtos agricolas, horticolas e florestais nao processados, sementes e animais vivos.",
    type: "PRODUTO",
  },
  {
    code: "32",
    heading: "Bebidas nao alcoolicas",
    description:
      "Cervejas, aguas minerais, refrigerantes, sucos e preparacoes para bebidas.",
    type: "PRODUTO",
  },
  {
    code: "33",
    heading: "Bebidas alcoolicas",
    description: "Bebidas alcoolicas, exceto cervejas.",
    type: "PRODUTO",
  },
  {
    code: "34",
    heading: "Tabaco e artigos para fumantes",
    description: "Tabaco, cigarros, artigos para fumantes e fosforos.",
    type: "PRODUTO",
  },
  {
    code: "35",
    heading: "Publicidade e gestao comercial",
    description:
      "Publicidade, marketing, administracao comercial e servicos de varejo/atacado.",
    type: "SERVICO",
  },
  {
    code: "36",
    heading: "Financeiro e imobiliario",
    description:
      "Servicos financeiros, bancarios, seguros, investimentos e negocios imobiliarios.",
    type: "SERVICO",
  },
  {
    code: "37",
    heading: "Construcao e reparos",
    description:
      "Construcao civil, instalacao, manutencao e reparo de bens.",
    type: "SERVICO",
  },
  {
    code: "38",
    heading: "Telecomunicacoes",
    description:
      "Servicos de telecomunicacoes, transmissao de dados e comunicacao digital.",
    type: "SERVICO",
  },
  {
    code: "39",
    heading: "Transporte e logistica",
    description:
      "Transporte, embalagem, armazenagem e organizacao de viagens.",
    type: "SERVICO",
  },
  {
    code: "40",
    heading: "Tratamento de materiais",
    description:
      "Servicos de tratamento, transformacao e acabamento de materiais.",
    type: "SERVICO",
  },
  {
    code: "41",
    heading: "Educacao e entretenimento",
    description:
      "Educacao, treinamento, atividades culturais, esportivas e de entretenimento.",
    type: "SERVICO",
  },
  {
    code: "42",
    heading: "Tecnologia e software",
    description:
      "Servicos cientificos e tecnologicos, pesquisa, design e desenvolvimento de software.",
    type: "SERVICO",
  },
  {
    code: "43",
    heading: "Hospedagem e alimentacao",
    description:
      "Servicos de alimentacao, bares, restaurantes e hospedagem temporaria.",
    type: "SERVICO",
  },
  {
    code: "44",
    heading: "Saude e cuidados pessoais",
    description:
      "Servicos medicos, veterinarios, higiene, beleza e agricultura.",
    type: "SERVICO",
  },
  {
    code: "45",
    heading: "Juridico e seguranca",
    description:
      "Servicos juridicos, seguranca, investigacao e servicos pessoais e sociais.",
    type: "SERVICO",
  },
];

function toNumericCode(value: string): number {
  const numeric = Number.parseInt(value, 10);
  return Number.isFinite(numeric) ? numeric : 0;
}

export const NICE_CLASS_CATALOG = [...NICE_CLASS_CATALOG_UNSORTED].sort(
  (a, b) => toNumericCode(a.code) - toNumericCode(b.code),
);

export function normalizeNiceClassCode(value?: string | null): string | null {
  const raw = (value || "").trim();

  if (!raw) {
    return null;
  }

  const lastClassMatch = raw.match(/(?:^|\D)(\d{1,2})(?:\D*)$/);
  if (lastClassMatch?.[1]) {
    const trailingNumeric = Number.parseInt(lastClassMatch[1], 10);

    if (
      Number.isFinite(trailingNumeric) &&
      trailingNumeric >= 1 &&
      trailingNumeric <= 45
    ) {
      return String(trailingNumeric);
    }
  }

  const digits = raw.replace(/\D/g, "");

  if (!digits) {
    return null;
  }

  const numeric = Number.parseInt(digits, 10);

  if (!Number.isFinite(numeric) || numeric < 1 || numeric > 45) {
    return null;
  }

  return String(numeric);
}

export function formatNiceClassCode(code?: string | null): string {
  const normalized = normalizeNiceClassCode(code);

  if (!normalized) {
    return "";
  }

  return normalized.padStart(2, "0");
}
