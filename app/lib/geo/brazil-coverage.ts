export const BRAZIL_MAP_BOUNDS = {
  minLat: -34,
  maxLat: 6,
  minLng: -74,
  maxLng: -34,
} as const;

export const BRAZIL_STATE_METADATA: Record<
  string,
  { name: string; lat: number; lng: number }
> = {
  AC: { name: "Acre", lat: -8.77, lng: -70.55 },
  AL: { name: "Alagoas", lat: -9.62, lng: -36.82 },
  AP: { name: "Amapa", lat: 0.03, lng: -51.05 },
  AM: { name: "Amazonas", lat: -3.1, lng: -60.02 },
  BA: { name: "Bahia", lat: -12.97, lng: -38.5 },
  CE: { name: "Ceara", lat: -3.73, lng: -38.52 },
  DF: { name: "Distrito Federal", lat: -15.78, lng: -47.93 },
  ES: { name: "Espirito Santo", lat: -20.32, lng: -40.34 },
  GO: { name: "Goias", lat: -16.68, lng: -49.25 },
  MA: { name: "Maranhao", lat: -2.53, lng: -44.3 },
  MT: { name: "Mato Grosso", lat: -15.6, lng: -56.1 },
  MS: { name: "Mato Grosso do Sul", lat: -20.45, lng: -54.62 },
  MG: { name: "Minas Gerais", lat: -19.92, lng: -43.94 },
  PA: { name: "Para", lat: -1.45, lng: -48.5 },
  PB: { name: "Paraiba", lat: -7.12, lng: -34.86 },
  PR: { name: "Parana", lat: -25.42, lng: -49.27 },
  PE: { name: "Pernambuco", lat: -8.05, lng: -34.88 },
  PI: { name: "Piaui", lat: -5.09, lng: -42.8 },
  RJ: { name: "Rio de Janeiro", lat: -22.91, lng: -43.17 },
  RN: { name: "Rio Grande do Norte", lat: -5.79, lng: -35.21 },
  RS: { name: "Rio Grande do Sul", lat: -30.03, lng: -51.23 },
  RO: { name: "Rondonia", lat: -8.76, lng: -63.9 },
  RR: { name: "Roraima", lat: 2.82, lng: -60.67 },
  SC: { name: "Santa Catarina", lat: -27.59, lng: -48.55 },
  SP: { name: "Sao Paulo", lat: -23.55, lng: -46.63 },
  SE: { name: "Sergipe", lat: -10.91, lng: -37.07 },
  TO: { name: "Tocantins", lat: -10.25, lng: -48.32 },
} as const;

export type BrazilCoverageMetricKey =
  | "processos"
  | "advogados"
  | "escritorios";

export interface BrazilCoverageLocationItem {
  id: string;
  title: string;
  subtitle?: string;
  href?: string;
}

export interface BrazilCoverageStateDetails {
  processos: BrazilCoverageLocationItem[];
  advogados: BrazilCoverageLocationItem[];
  escritorios: BrazilCoverageLocationItem[];
}

export interface BrazilCoverageStateDatum {
  uf: string;
  stateName: string;
  label: string;
  mapX: number;
  mapY: number;
  processos: number;
  advogados: number;
  escritorios: number;
  details: BrazilCoverageStateDetails;
}

export interface BrazilCoverageOverview {
  states: BrazilCoverageStateDatum[];
  totals: {
    coveredStates: number;
    processos: number;
    advogados: number;
    escritorios: number;
  };
}

export interface BrazilCoverageEntry {
  uf: string;
  processos?: number;
  advogados?: number;
  escritorios?: number;
}

export function normalizeBrazilUf(value?: string | null) {
  const normalized = (value || "").trim().toUpperCase();
  return normalized in BRAZIL_STATE_METADATA ? normalized : null;
}

export function normalizeBrazilMapCoordinates(lat: number, lng: number) {
  const x =
    ((lng - BRAZIL_MAP_BOUNDS.minLng) /
      (BRAZIL_MAP_BOUNDS.maxLng - BRAZIL_MAP_BOUNDS.minLng)) *
    100;
  const y =
    100 -
    ((lat - BRAZIL_MAP_BOUNDS.minLat) /
      (BRAZIL_MAP_BOUNDS.maxLat - BRAZIL_MAP_BOUNDS.minLat)) *
      100;

  return {
    x: Number(Math.min(96, Math.max(4, x)).toFixed(2)),
    y: Number(Math.min(96, Math.max(4, y)).toFixed(2)),
  };
}

export function buildBrazilCoverageOverview(
  entries: BrazilCoverageEntry[],
): BrazilCoverageOverview {
  const merged = new Map<
    string,
    { processos: number; advogados: number; escritorios: number }
  >();

  for (const entry of entries) {
    const uf = normalizeBrazilUf(entry.uf);

    if (!uf) {
      continue;
    }

    const current = merged.get(uf) || {
      processos: 0,
      advogados: 0,
      escritorios: 0,
    };

    current.processos += entry.processos ?? 0;
    current.advogados += entry.advogados ?? 0;
    current.escritorios += entry.escritorios ?? 0;

    merged.set(uf, current);
  }

  const states = Array.from(merged.entries())
    .map(([uf, counts]) => {
      const meta = BRAZIL_STATE_METADATA[uf];
      const coords = normalizeBrazilMapCoordinates(meta.lat, meta.lng);

      return {
        uf,
        stateName: meta.name,
        label: `${meta.name} (${uf})`,
        mapX: coords.x,
        mapY: coords.y,
        processos: counts.processos,
        advogados: counts.advogados,
        escritorios: counts.escritorios,
        details: {
          processos: [],
          advogados: [],
          escritorios: [],
        },
      } satisfies BrazilCoverageStateDatum;
    })
    .filter(
      (state) =>
        state.processos > 0 || state.advogados > 0 || state.escritorios > 0,
    )
    .sort((left, right) => {
      const leftTotal =
        left.processos + left.advogados * 3 + left.escritorios * 5;
      const rightTotal =
        right.processos + right.advogados * 3 + right.escritorios * 5;

      return rightTotal - leftTotal || left.uf.localeCompare(right.uf);
    });

  return {
    states,
    totals: {
      coveredStates: states.length,
      processos: states.reduce((sum, state) => sum + state.processos, 0),
      advogados: states.reduce((sum, state) => sum + state.advogados, 0),
      escritorios: states.reduce((sum, state) => sum + state.escritorios, 0),
    },
  };
}

export const EMPTY_BRAZIL_COVERAGE_OVERVIEW: BrazilCoverageOverview = {
  states: [],
  totals: {
    coveredStates: 0,
    processos: 0,
    advogados: 0,
    escritorios: 0,
  },
};

export const EMPTY_BRAZIL_COVERAGE_STATE_DETAILS: BrazilCoverageStateDetails = {
  processos: [],
  advogados: [],
  escritorios: [],
};
