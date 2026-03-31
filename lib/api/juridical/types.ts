/**
 * Tipos comuns para integrações jurídicas
 */

export enum TribunalSistema {
  PJE = "PJE",
  EPROC = "EPROC",
  PROJUDI = "PROJUDI",
  ESAJ = "ESAJ",
  OUTRO = "OUTRO",
}

export enum EsferaTribunal {
  FEDERAL = "FEDERAL",
  ESTADUAL = "ESTADUAL",
  TRABALHISTA = "TRABALHISTA",
  ELEITORAL = "ELEITORAL",
  MILITAR = "MILITAR",
}

export interface ProcessoJuridico {
  numeroProcesso: string; // Número CNJ formatado
  numeroAntigo?: string; // Número antigo do processo
  tribunalId?: string;
  tribunalNome?: string;
  tribunalSigla?: string;
  esfera?: EsferaTribunal;
  uf?: string;
  vara?: string;
  comarca?: string;
  classe?: string;
  assunto?: string;
  valorCausa?: number;
  dataDistribuicao?: Date;
  dataAutuacao?: Date;
  status?: string;
  sistema?: TribunalSistema;
  // Dados das partes
  partes?: ParteProcesso[];
  // Dados de movimentações
  movimentacoes?: MovimentacaoProcesso[];
  // Dados do juiz
  juiz?: string;
  // Links e documentos
  linkConsulta?: string;
  documentos?: DocumentoProcesso[];
  // Metadados
  ultimaAtualizacao?: Date;
  capturadoEm?: Date;
  fonte?: string; // "API", "SCRAPING", "MANUAL"
}

export interface ParteProcesso {
  tipo: "AUTOR" | "REU" | "TERCEIRO" | "ADVOGADO" | "TESTEMUNHA";
  nome: string;
  documento?: string; // CPF ou CNPJ
  tipoDocumento?: "CPF" | "CNPJ";
  email?: string;
  telefone?: string;
  advogados?: AdvogadoParte[];
  representacao?: string; // Ex: "Advogado", "Procurador"
}

export interface AdvogadoParte {
  nome: string;
  oabNumero?: string;
  oabUf?: string;
  email?: string;
  telefone?: string;
}

export interface MovimentacaoProcesso {
  data: Date;
  tipo?: string;
  descricao: string;
  documento?: string;
  linkDocumento?: string;
  assinadoPor?: string;
  publicacao?: Date;
  observacoes?: string;
  // Normalização
  tipoNormalizado?: string;
  categoria?: "PRAZO" | "AUDIENCIA" | "SENTENCA" | "INTIMACAO" | "OUTRO";
  prazoVencimento?: Date;
}

export interface DocumentoProcesso {
  nome: string;
  tipo?: string;
  data?: Date;
  link?: string;
  tamanho?: number;
}

export interface ConsultaProcessoParams {
  numeroProcesso: string;
  tribunalId?: string;
  sistema?: TribunalSistema;
  certificadoId?: string; // Para autenticação com certificado
}

export interface CapturaResult {
  success: boolean;
  processo?: ProcessoJuridico;
  /**
   * Quando a fonte retornar múltiplos processos (ex.: busca por OAB),
   * este array contém todos os resultados normalizados.
   */
  processos?: ProcessoJuridico[];
  movimentacoes?: MovimentacaoProcesso[];
  error?: string;
  tentativas?: number;
  tempoResposta?: number;
  /**
   * Quando a consulta pública exige captcha (comum em busca por OAB),
   * o scraper pode devolver o desafio para o front resolver manualmente.
   */
  captchaRequired?: boolean;
  captcha?: {
    id: string;
    /** Data URL (base64) pronta para renderizar em <img src="..."> */
    imageDataUrl?: string;
    /** URL original detectada no HTML (debug) */
    imageUrl?: string;
  };
  /** Informações extras para depuração (apenas em telas de teste) */
  debug?: Record<string, unknown>;
}

export interface WorkerCapturaJob {
  id: string;
  tenantId: string;
  processoId: string; // ID do processo no nosso sistema
  numeroProcesso: string;
  tribunalId?: string;
  sistema?: TribunalSistema;
  certificadoId?: string;
  prioridade?: "BAIXA" | "MEDIA" | "ALTA";
  agendarPara?: Date;
  tentativas?: number;
  maxTentativas?: number;
}

export interface TribunaisConfig {
  nome: string;
  sigla: string;
  esfera: EsferaTribunal;
  uf: string;
  sistema: TribunalSistema;
  urlBase?: string;
  urlConsulta?: string;
  requerCertificado?: boolean;
  apiDisponivel?: boolean;
  scrapingDisponivel?: boolean;
  observacoes?: string;
}
