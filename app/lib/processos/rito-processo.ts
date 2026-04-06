import { RitoProcesso, TipoPrazoLegal } from "@/generated/prisma";

export type PrazoLegalRule = {
  dias: number;
  contarDiasUteis: boolean;
  fundamentoLegal: string;
  tituloPadrao: string;
  resumo: string;
};

const RITO_PROCESSO_ORDER: RitoProcesso[] = [
  RitoProcesso.JUSTICA_COMUM,
  RitoProcesso.JUIZADO_ESPECIAL,
];

const TIPO_PRAZO_LEGAL_ORDER: TipoPrazoLegal[] = [
  TipoPrazoLegal.CONTESTACAO,
  TipoPrazoLegal.MANIFESTACAO,
  TipoPrazoLegal.APELACAO_RECURSO,
  TipoPrazoLegal.CONTRARRAZOES,
  TipoPrazoLegal.EMBARGOS_DECLARACAO,
  TipoPrazoLegal.JUNTADA_DOCUMENTOS,
];

export const RITO_PROCESSO_LABELS: Record<RitoProcesso, string> = {
  [RitoProcesso.JUSTICA_COMUM]: "Justiça Comum",
  [RitoProcesso.JUIZADO_ESPECIAL]: "Juizado Especial",
};

export const TIPO_PRAZO_LEGAL_LABELS: Record<TipoPrazoLegal, string> = {
  [TipoPrazoLegal.CONTESTACAO]: "Contestação",
  [TipoPrazoLegal.MANIFESTACAO]: "Manifestação",
  [TipoPrazoLegal.APELACAO_RECURSO]: "Apelação / recurso",
  [TipoPrazoLegal.CONTRARRAZOES]: "Contrarrazões",
  [TipoPrazoLegal.EMBARGOS_DECLARACAO]: "Embargos de declaração",
  [TipoPrazoLegal.JUNTADA_DOCUMENTOS]: "Juntada / documentos",
};

const PRAZO_LEGAL_RULES: Record<
  TipoPrazoLegal,
  Record<RitoProcesso, PrazoLegalRule>
> = {
  [TipoPrazoLegal.CONTESTACAO]: {
    [RitoProcesso.JUSTICA_COMUM]: {
      dias: 15,
      contarDiasUteis: true,
      fundamentoLegal: "Contestação em 15 dias úteis, nos termos do art. 335 do CPC.",
      tituloPadrao: "Apresentar contestação",
      resumo: "15 dias úteis pelo CPC.",
    },
    [RitoProcesso.JUIZADO_ESPECIAL]: {
      dias: 15,
      contarDiasUteis: false,
      fundamentoLegal:
        "Contestação no rito do Juizado Especial, com contagem contínua simplificada.",
      tituloPadrao: "Apresentar contestação",
      resumo: "15 dias corridos no rito simplificado do juizado.",
    },
  },
  [TipoPrazoLegal.MANIFESTACAO]: {
    [RitoProcesso.JUSTICA_COMUM]: {
      dias: 5,
      contarDiasUteis: true,
      fundamentoLegal: "Manifestação em 5 dias úteis, conforme determinação judicial aplicável.",
      tituloPadrao: "Apresentar manifestação",
      resumo: "5 dias úteis.",
    },
    [RitoProcesso.JUIZADO_ESPECIAL]: {
      dias: 5,
      contarDiasUteis: false,
      fundamentoLegal: "Manifestação no Juizado Especial, com contagem contínua simplificada.",
      tituloPadrao: "Apresentar manifestação",
      resumo: "5 dias corridos.",
    },
  },
  [TipoPrazoLegal.APELACAO_RECURSO]: {
    [RitoProcesso.JUSTICA_COMUM]: {
      dias: 15,
      contarDiasUteis: true,
      fundamentoLegal: "Apelação em 15 dias úteis, nos termos do art. 1.003, § 5º, do CPC.",
      tituloPadrao: "Interpor apelação / recurso",
      resumo: "15 dias úteis pelo CPC.",
    },
    [RitoProcesso.JUIZADO_ESPECIAL]: {
      dias: 10,
      contarDiasUteis: false,
      fundamentoLegal:
        "Recurso inominado em 10 dias, nos termos da Lei 9.099/95, com contagem contínua.",
      tituloPadrao: "Interpor recurso",
      resumo: "10 dias corridos no juizado.",
    },
  },
  [TipoPrazoLegal.CONTRARRAZOES]: {
    [RitoProcesso.JUSTICA_COMUM]: {
      dias: 15,
      contarDiasUteis: true,
      fundamentoLegal:
        "Contrarrazões em 15 dias úteis, conforme art. 1.010, § 1º, do CPC.",
      tituloPadrao: "Apresentar contrarrazões",
      resumo: "15 dias úteis pelo CPC.",
    },
    [RitoProcesso.JUIZADO_ESPECIAL]: {
      dias: 10,
      contarDiasUteis: false,
      fundamentoLegal:
        "Contrarrazões no Juizado Especial, com janela reduzida e contagem contínua.",
      tituloPadrao: "Apresentar contrarrazões",
      resumo: "10 dias corridos no juizado.",
    },
  },
  [TipoPrazoLegal.EMBARGOS_DECLARACAO]: {
    [RitoProcesso.JUSTICA_COMUM]: {
      dias: 5,
      contarDiasUteis: true,
      fundamentoLegal:
        "Embargos de declaração em 5 dias úteis, conforme art. 1.023 do CPC.",
      tituloPadrao: "Opor embargos de declaração",
      resumo: "5 dias úteis pelo CPC.",
    },
    [RitoProcesso.JUIZADO_ESPECIAL]: {
      dias: 5,
      contarDiasUteis: false,
      fundamentoLegal:
        "Embargos de declaração em 5 dias no Juizado Especial, com contagem contínua.",
      tituloPadrao: "Opor embargos de declaração",
      resumo: "5 dias corridos no juizado.",
    },
  },
  [TipoPrazoLegal.JUNTADA_DOCUMENTOS]: {
    [RitoProcesso.JUSTICA_COMUM]: {
      dias: 5,
      contarDiasUteis: true,
      fundamentoLegal:
        "Juntada de documentos e cumprimento de despacho em 5 dias úteis, salvo regra específica.",
      tituloPadrao: "Juntar documentos",
      resumo: "5 dias úteis.",
    },
    [RitoProcesso.JUIZADO_ESPECIAL]: {
      dias: 5,
      contarDiasUteis: false,
      fundamentoLegal:
        "Juntada de documentos no Juizado Especial, com contagem contínua simplificada.",
      tituloPadrao: "Juntar documentos",
      resumo: "5 dias corridos.",
    },
  },
};

export const RITO_PROCESSO_OPTIONS = RITO_PROCESSO_ORDER.map((value) => ({
  value,
  label: RITO_PROCESSO_LABELS[value],
}));

export const TIPO_PRAZO_LEGAL_OPTIONS = TIPO_PRAZO_LEGAL_ORDER.map((value) => ({
  value,
  label: TIPO_PRAZO_LEGAL_LABELS[value],
}));

export function getRitoProcessoLabel(ritoProcesso?: RitoProcesso | null) {
  if (!ritoProcesso) {
    return null;
  }

  return RITO_PROCESSO_LABELS[ritoProcesso];
}

export function getLegacyRitoProcessoLabel(ritoProcesso?: RitoProcesso | null) {
  return getRitoProcessoLabel(ritoProcesso);
}

export function getTipoPrazoLegalLabel(tipoPrazoLegal?: TipoPrazoLegal | null) {
  if (!tipoPrazoLegal) {
    return null;
  }

  return TIPO_PRAZO_LEGAL_LABELS[tipoPrazoLegal];
}

export function normalizeLegacyRitoToRitoProcesso(value?: string | null) {
  if (!value) {
    return null;
  }

  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();

  if (!normalized) {
    return null;
  }

  if (
    normalized === "ORDINARIO" ||
    normalized === "JUSTICA COMUM" ||
    normalized === "JUSTICA_COMUM"
  ) {
    return RitoProcesso.JUSTICA_COMUM;
  }

  if (
    normalized === "JUIZADO ESPECIAL" ||
    normalized === "JUIZADO_ESPECIAL"
  ) {
    return RitoProcesso.JUIZADO_ESPECIAL;
  }

  return null;
}

export function doesRitoProcessoUseBusinessDays(
  ritoProcesso?: RitoProcesso | null,
) {
  return ritoProcesso === RitoProcesso.JUSTICA_COMUM;
}

export function getPrazoLegalRule(params: {
  ritoProcesso?: RitoProcesso | null;
  tipoPrazoLegal?: TipoPrazoLegal | null;
}) {
  if (!params.ritoProcesso || !params.tipoPrazoLegal) {
    return null;
  }

  return PRAZO_LEGAL_RULES[params.tipoPrazoLegal]?.[params.ritoProcesso] ?? null;
}

export function buildPrazoLegalHint(params: {
  ritoProcesso?: RitoProcesso | null;
  tipoPrazoLegal?: TipoPrazoLegal | null;
}) {
  const rule = getPrazoLegalRule(params);

  if (!rule || !params.ritoProcesso || !params.tipoPrazoLegal) {
    return null;
  }

  return `${TIPO_PRAZO_LEGAL_LABELS[params.tipoPrazoLegal]}: ${rule.resumo} Rito aplicado: ${RITO_PROCESSO_LABELS[params.ritoProcesso]}.`;
}
