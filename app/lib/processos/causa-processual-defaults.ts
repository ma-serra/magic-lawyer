export type CausaProcessualDefault = {
  nome: string;
  codigoCnj?: string | null;
  descricao?: string | null;
};

export const CAUSAS_PROCESSUAIS_PADRAO: CausaProcessualDefault[] = [
  {
    nome: "Cobrança",
    descricao: "Pedidos cíveis de cobrança em geral.",
  },
  {
    nome: "Inadimplemento contratual",
    descricao: "Discussão sobre descumprimento de obrigações contratuais.",
  },
  {
    nome: "Rescisão contratual",
    descricao: "Pedidos de rescisão ou resolução de contrato.",
  },
  {
    nome: "Indenização por danos morais",
    descricao: "Pedidos indenizatórios por dano moral.",
  },
  {
    nome: "Indenização por danos materiais",
    descricao: "Pedidos indenizatórios por dano material.",
  },
  {
    nome: "Direito do consumidor - Vício do produto ou serviço",
    descricao: "Demandas consumeristas por vício do produto ou serviço.",
  },
  {
    nome: "Família - Alimentos",
    descricao: "Pedidos de alimentos.",
  },
  {
    nome: "Família - Guarda",
    descricao: "Pedidos relacionados à guarda.",
  },
  {
    nome: "Família - Divórcio",
    descricao: "Pedidos de divórcio.",
  },
  {
    nome: "Crime contra a Administração Pública - Peculato",
    descricao: "Apuração criminal de peculato.",
  },
  {
    nome: "Crime contra a Administração Pública - Corrupção ativa",
    descricao: "Apuração criminal de corrupção ativa.",
  },
  {
    nome: "Crime contra a Administração Pública - Corrupção passiva",
    descricao: "Apuração criminal de corrupção passiva.",
  },
  {
    nome: "Crime contra a Administração Pública - Fraude em licitação",
    descricao: "Apuração criminal de fraude em licitação.",
  },
  {
    nome: "Crimes contra o patrimônio - Furto",
    descricao: "Apuração criminal de furto.",
  },
  {
    nome: "Crimes contra o patrimônio - Roubo",
    descricao: "Apuração criminal de roubo.",
  },
  {
    nome: "Crimes contra o patrimônio - Estelionato",
    descricao: "Apuração criminal de estelionato.",
  },
  {
    nome: "Crimes contra o patrimônio - Apropriação indébita",
    descricao: "Apuração criminal de apropriação indébita.",
  },
  {
    nome: "Crimes contra o patrimônio - Receptação",
    descricao: "Apuração criminal de receptação.",
  },
  {
    nome: "Crimes contra o patrimônio - Extorsão",
    descricao: "Apuração criminal de extorsão.",
  },
  {
    nome: "Crimes contra o patrimônio - Extorsão mediante sequestro",
    descricao: "Apuração criminal de extorsão mediante sequestro.",
  },
  {
    nome: "Crimes contra a vida - Tentativa de homicídio",
    descricao: "Apuração criminal de tentativa de homicídio.",
  },
  {
    nome: "Crimes contra a vida - Homicídio",
    descricao: "Apuração criminal de homicídio.",
  },
  {
    nome: "Crimes contra a vida - Feminicídio",
    descricao: "Apuração criminal de feminicídio.",
  },
  {
    nome: "Crimes relacionados às drogas - Tráfico de drogas",
    descricao: "Apuração criminal de tráfico de drogas.",
  },
  {
    nome: "Crimes relacionados às drogas - Associação para o tráfico",
    descricao: "Apuração criminal de associação para o tráfico.",
  },
  {
    nome: "Outros - Crimes diversos",
    descricao: "Assunto genérico para crimes não mapeados no catálogo.",
  },
  {
    nome: "Verbas rescisórias",
    descricao: "Pedidos trabalhistas de verbas rescisórias.",
  },
  {
    nome: "Horas extras",
    descricao: "Pedidos trabalhistas de horas extras.",
  },
  {
    nome: "Férias",
    descricao: "Pedidos trabalhistas ligados a férias.",
  },
  {
    nome: "FGTS",
    descricao: "Pedidos relacionados a FGTS.",
  },
  {
    nome: "Reconhecimento de vínculo empregatício",
    descricao: "Pedidos de reconhecimento de vínculo empregatício.",
  },
  {
    nome: "Indenização trabalhista por dano moral",
    descricao: "Pedidos trabalhistas de dano moral.",
  },
  {
    nome: "Adicional de insalubridade",
    descricao: "Pedidos de adicional de insalubridade.",
  },
  {
    nome: "Adicional de periculosidade",
    descricao: "Pedidos de adicional de periculosidade.",
  },
  {
    nome: "Rescisão indireta",
    descricao: "Pedidos de rescisão indireta.",
  },
];
