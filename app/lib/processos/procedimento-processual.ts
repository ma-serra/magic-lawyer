import {
  ProcedimentoProcessual,
  RitoProcesso,
} from "@/generated/prisma";

type AreaProcedimentoGroup = "civel" | "criminal" | "trabalhista";

type ProcedimentoOption = {
  value: ProcedimentoProcessual;
  label: string;
};

const AREA_ALIAS_MAP: Record<string, AreaProcedimentoGroup | null> = {
  civel: "civel",
  civil: "civel",
  familia: null,
  criminal: "criminal",
  penal: "criminal",
  trabalhista: "trabalhista",
};

export const PROCEDIMENTO_PROCESSUAL_LABELS: Record<
  ProcedimentoProcessual,
  string
> = {
  [ProcedimentoProcessual.CIVEL_PROCEDIMENTO_COMUM_ORDINARIO]:
    "Procedimento comum (ordinario)",
  [ProcedimentoProcessual.CIVEL_PROCEDIMENTOS_ESPECIAIS]:
    "Procedimentos especiais",
  [ProcedimentoProcessual.CIVEL_JUIZADO_ESPECIAL]: "Juizado Especial",
  [ProcedimentoProcessual.PENAL_ORDINARIO]: "Ordinario",
  [ProcedimentoProcessual.PENAL_SUMARIO]: "Sumario",
  [ProcedimentoProcessual.PENAL_SUMARISSIMO]: "Sumarissimo",
  [ProcedimentoProcessual.TRABALHISTA_ORDINARIO]: "Ordinario",
  [ProcedimentoProcessual.TRABALHISTA_SUMARIO]: "Sumario",
  [ProcedimentoProcessual.TRABALHISTA_SUMARISSIMO]: "Sumarissimo",
};

const PROCEDIMENTO_OPTIONS_BY_AREA: Record<
  AreaProcedimentoGroup,
  ProcedimentoOption[]
> = {
  civel: [
    {
      value: ProcedimentoProcessual.CIVEL_PROCEDIMENTO_COMUM_ORDINARIO,
      label: PROCEDIMENTO_PROCESSUAL_LABELS[
        ProcedimentoProcessual.CIVEL_PROCEDIMENTO_COMUM_ORDINARIO
      ],
    },
    {
      value: ProcedimentoProcessual.CIVEL_PROCEDIMENTOS_ESPECIAIS,
      label: PROCEDIMENTO_PROCESSUAL_LABELS[
        ProcedimentoProcessual.CIVEL_PROCEDIMENTOS_ESPECIAIS
      ],
    },
    {
      value: ProcedimentoProcessual.CIVEL_JUIZADO_ESPECIAL,
      label:
        PROCEDIMENTO_PROCESSUAL_LABELS[
          ProcedimentoProcessual.CIVEL_JUIZADO_ESPECIAL
        ],
    },
  ],
  criminal: [
    {
      value: ProcedimentoProcessual.PENAL_ORDINARIO,
      label:
        PROCEDIMENTO_PROCESSUAL_LABELS[ProcedimentoProcessual.PENAL_ORDINARIO],
    },
    {
      value: ProcedimentoProcessual.PENAL_SUMARIO,
      label:
        PROCEDIMENTO_PROCESSUAL_LABELS[ProcedimentoProcessual.PENAL_SUMARIO],
    },
    {
      value: ProcedimentoProcessual.PENAL_SUMARISSIMO,
      label:
        PROCEDIMENTO_PROCESSUAL_LABELS[
          ProcedimentoProcessual.PENAL_SUMARISSIMO
        ],
    },
  ],
  trabalhista: [
    {
      value: ProcedimentoProcessual.TRABALHISTA_ORDINARIO,
      label:
        PROCEDIMENTO_PROCESSUAL_LABELS[
          ProcedimentoProcessual.TRABALHISTA_ORDINARIO
        ],
    },
    {
      value: ProcedimentoProcessual.TRABALHISTA_SUMARIO,
      label:
        PROCEDIMENTO_PROCESSUAL_LABELS[
          ProcedimentoProcessual.TRABALHISTA_SUMARIO
        ],
    },
    {
      value: ProcedimentoProcessual.TRABALHISTA_SUMARISSIMO,
      label:
        PROCEDIMENTO_PROCESSUAL_LABELS[
          ProcedimentoProcessual.TRABALHISTA_SUMARISSIMO
        ],
    },
  ],
};

function normalizeText(value?: string | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export function resolveAreaProcedimentoGroup(
  areaSlug?: string | null,
): AreaProcedimentoGroup | null {
  return AREA_ALIAS_MAP[normalizeText(areaSlug)] ?? null;
}

export function getProcedimentoProcessualLabel(
  procedimentoProcessual?: ProcedimentoProcessual | null,
) {
  if (!procedimentoProcessual) {
    return null;
  }

  return PROCEDIMENTO_PROCESSUAL_LABELS[procedimentoProcessual] ?? null;
}

export function getProcedimentoProcessualOptions(areaSlug?: string | null) {
  const group = resolveAreaProcedimentoGroup(areaSlug);

  if (!group) {
    return [];
  }

  return PROCEDIMENTO_OPTIONS_BY_AREA[group];
}

export function doesAreaRequireProcedimento(areaSlug?: string | null) {
  return getProcedimentoProcessualOptions(areaSlug).length > 0;
}

export function isProcedimentoCompatibleWithArea(params: {
  areaSlug?: string | null;
  procedimentoProcessual?: ProcedimentoProcessual | null;
}) {
  if (!params.procedimentoProcessual) {
    return true;
  }

  return getProcedimentoProcessualOptions(params.areaSlug).some(
    (option) => option.value === params.procedimentoProcessual,
  );
}

export function deriveRitoProcessoFromProcedimento(
  procedimentoProcessual?: ProcedimentoProcessual | null,
) {
  switch (procedimentoProcessual) {
    case ProcedimentoProcessual.CIVEL_PROCEDIMENTO_COMUM_ORDINARIO:
    case ProcedimentoProcessual.CIVEL_PROCEDIMENTOS_ESPECIAIS:
      return RitoProcesso.JUSTICA_COMUM;
    case ProcedimentoProcessual.CIVEL_JUIZADO_ESPECIAL:
      return RitoProcesso.JUIZADO_ESPECIAL;
    default:
      return null;
  }
}

function resolveLegacyTextToProcedimentoByArea(params: {
  areaGroup: AreaProcedimentoGroup;
  normalizedText: string;
  ritoProcesso?: RitoProcesso | null;
}) {
  const { areaGroup, normalizedText, ritoProcesso } = params;

  if (areaGroup === "civel") {
    if (
      ritoProcesso === RitoProcesso.JUIZADO_ESPECIAL ||
      normalizedText.includes("juizado")
    ) {
      return ProcedimentoProcessual.CIVEL_JUIZADO_ESPECIAL;
    }

    if (normalizedText.includes("especial")) {
      return ProcedimentoProcessual.CIVEL_PROCEDIMENTOS_ESPECIAIS;
    }

    if (
      ritoProcesso === RitoProcesso.JUSTICA_COMUM ||
      normalizedText.includes("ordinario") ||
      normalizedText.includes("procedimento comum")
    ) {
      return ProcedimentoProcessual.CIVEL_PROCEDIMENTO_COMUM_ORDINARIO;
    }

    return null;
  }

  if (areaGroup === "criminal") {
    if (normalizedText.includes("sumarissimo")) {
      return ProcedimentoProcessual.PENAL_SUMARISSIMO;
    }

    if (normalizedText.includes("sumario")) {
      return ProcedimentoProcessual.PENAL_SUMARIO;
    }

    if (normalizedText.includes("ordinario")) {
      return ProcedimentoProcessual.PENAL_ORDINARIO;
    }

    return null;
  }

  if (normalizedText.includes("sumarissimo")) {
    return ProcedimentoProcessual.TRABALHISTA_SUMARISSIMO;
  }

  if (normalizedText.includes("sumario")) {
    return ProcedimentoProcessual.TRABALHISTA_SUMARIO;
  }

  if (normalizedText.includes("ordinario")) {
    return ProcedimentoProcessual.TRABALHISTA_ORDINARIO;
  }

  return null;
}

export function inferProcedimentoProcessual(params: {
  areaSlug?: string | null;
  procedimentoProcessual?: ProcedimentoProcessual | null;
  ritoProcesso?: RitoProcesso | null;
  rito?: string | null;
}) {
  if (params.procedimentoProcessual) {
    return params.procedimentoProcessual;
  }

  const areaGroup = resolveAreaProcedimentoGroup(params.areaSlug);

  if (!areaGroup) {
    return null;
  }

  return resolveLegacyTextToProcedimentoByArea({
    areaGroup,
    normalizedText: normalizeText(params.rito),
    ritoProcesso: params.ritoProcesso ?? null,
  });
}
