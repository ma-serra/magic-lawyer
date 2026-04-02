export type ClasseProcessualDefault = {
  slug: string;
  nome: string;
  descricao: string;
  ordem: number;
};

// Catálogo inicial baseado em classes amplamente usadas na Tabela Processual
// Unificada (TPU) do CNJ, priorizando fluxos cíveis, família, execução e
// juizados que aparecem com frequência em escritórios generalistas.
export const CLASSES_PROCESSUAIS_PADRAO: ClasseProcessualDefault[] = [
  {
    slug: "procedimento-comum-civel",
    nome: "Procedimento Comum Cível",
    descricao: "Classe base para a tramitação cível comum no primeiro grau.",
    ordem: 10,
  },
  {
    slug: "cumprimento-de-sentenca",
    nome: "Cumprimento de Sentença",
    descricao: "Fase executiva de sentença judicial já formada.",
    ordem: 20,
  },
  {
    slug: "cumprimento-provisorio-de-sentenca",
    nome: "Cumprimento Provisório de Sentença",
    descricao: "Execução provisória antes do trânsito em julgado.",
    ordem: 30,
  },
  {
    slug: "execucao-de-titulo-extrajudicial",
    nome: "Execução de Título Extrajudicial",
    descricao: "Execução fundada em título extrajudicial.",
    ordem: 40,
  },
  {
    slug: "execucao-fiscal",
    nome: "Execução Fiscal",
    descricao: "Cobrança judicial de dívida ativa.",
    ordem: 50,
  },
  {
    slug: "embargos-a-execucao",
    nome: "Embargos à Execução",
    descricao: "Defesa do executado em execução.",
    ordem: 60,
  },
  {
    slug: "embargos-a-execucao-fiscal",
    nome: "Embargos à Execução Fiscal",
    descricao: "Defesa específica do executado em execução fiscal.",
    ordem: 70,
  },
  {
    slug: "acao-monitoria",
    nome: "Ação Monitória",
    descricao: "Cobrança fundada em prova escrita sem eficácia executiva.",
    ordem: 80,
  },
  {
    slug: "mandado-de-seguranca-civel",
    nome: "Mandado de Segurança Cível",
    descricao: "Controle judicial de ato ilegal ou abusivo em matéria cível.",
    ordem: 90,
  },
  {
    slug: "acao-civil-publica",
    nome: "Ação Civil Pública",
    descricao: "Tutela coletiva de direitos difusos, coletivos ou individuais homogêneos.",
    ordem: 100,
  },
  {
    slug: "busca-e-apreensao-em-alienacao-fiduciaria",
    nome: "Busca e Apreensão em Alienação Fiduciária",
    descricao: "Recuperação de bem dado em garantia fiduciária.",
    ordem: 110,
  },
  {
    slug: "usucapiao",
    nome: "Usucapião",
    descricao: "Reconhecimento judicial de aquisição originária da propriedade.",
    ordem: 120,
  },
  {
    slug: "inventario",
    nome: "Inventário",
    descricao: "Partilha e regularização de bens do espólio.",
    ordem: 130,
  },
  {
    slug: "arrolamento-sumario",
    nome: "Arrolamento Sumário",
    descricao: "Rito simplificado de partilha de bens.",
    ordem: 140,
  },
  {
    slug: "arrolamento-comum",
    nome: "Arrolamento Comum",
    descricao: "Rito de arrolamento fora da forma sumária.",
    ordem: 150,
  },
  {
    slug: "divorcio-litigioso",
    nome: "Divórcio Litigioso",
    descricao: "Dissolução contenciosa do vínculo conjugal.",
    ordem: 160,
  },
  {
    slug: "divorcio-consensual",
    nome: "Divórcio Consensual",
    descricao: "Dissolução consensual do vínculo conjugal.",
    ordem: 170,
  },
  {
    slug: "guarda",
    nome: "Guarda",
    descricao: "Definição de guarda de criança ou adolescente.",
    ordem: 180,
  },
  {
    slug: "alimentos-lei-especial-5478-68",
    nome: "Alimentos - Lei Especial nº 5.478/68",
    descricao: "Ação de alimentos pelo rito especial.",
    ordem: 190,
  },
  {
    slug: "procedimento-do-juizado-especial-civel",
    nome: "Procedimento do Juizado Especial Cível",
    descricao: "Rito dos Juizados Especiais Cíveis.",
    ordem: 200,
  },
  {
    slug: "procedimento-do-juizado-especial-da-fazenda-publica",
    nome: "Procedimento do Juizado Especial da Fazenda Pública",
    descricao: "Rito dos Juizados Especiais da Fazenda Pública.",
    ordem: 210,
  },
  {
    slug: "homologacao-de-acordo-extrajudicial",
    nome: "Homologação de Acordo Extrajudicial",
    descricao: "Homologação judicial de composição firmada fora do processo.",
    ordem: 220,
  },
  {
    slug: "carta-precatoria-civel",
    nome: "Carta Precatória Cível",
    descricao: "Carta de cooperação judicial em matéria cível.",
    ordem: 230,
  },
  {
    slug: "carta-de-ordem-civel",
    nome: "Carta de Ordem Cível",
    descricao: "Cumprimento de ato determinado por tribunal ou órgão superior.",
    ordem: 240,
  },
];
