export type AreaProcessoDefault = {
  slug: string;
  nome: string;
  descricao: string;
  ordem: number;
};

export const AREAS_PROCESSO_PADRAO: AreaProcessoDefault[] = [
  {
    slug: "civel",
    nome: "Direito Civel",
    descricao:
      "Demandas relacionadas a contratos, responsabilidade civil e direitos obrigacionais.",
    ordem: 10,
  },
  {
    slug: "trabalhista",
    nome: "Direito Trabalhista",
    descricao:
      "Causas envolvendo relacoes de trabalho, empregadores e empregados.",
    ordem: 20,
  },
  {
    slug: "criminal",
    nome: "Direito Penal",
    descricao:
      "Acoes penais, defesa criminal e procedimentos investigativos.",
    ordem: 30,
  },
  {
    slug: "empresarial",
    nome: "Direito Empresarial",
    descricao:
      "Questoes societarias, contratos empresariais e governanca corporativa.",
    ordem: 40,
  },
  {
    slug: "familia",
    nome: "Direito de Familia e Sucessoes",
    descricao:
      "Divorcios, guarda, inventarios e planejamento sucessorio.",
    ordem: 50,
  },
  {
    slug: "tributario",
    nome: "Direito Tributario",
    descricao:
      "Contencioso fiscal, planejamento tributario e revisoes fiscais.",
    ordem: 60,
  },
  {
    slug: "previdenciario",
    nome: "Direito Previdenciario",
    descricao:
      "Beneficios do INSS, aposentadorias e revisoes previdenciarias.",
    ordem: 70,
  },
  {
    slug: "arbitragem",
    nome: "Arbitragem e Mediacao",
    descricao:
      "Procedimentos extrajudiciais de solucao de conflitos.",
    ordem: 80,
  },
];
