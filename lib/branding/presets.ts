export type BrandingPalette = {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
};

export type BrandingPreset = BrandingPalette & {
  key: string;
  name: string;
  description: string;
};

export const BRANDING_PRESETS: BrandingPreset[] = [
  {
    key: "classic-legal",
    name: "Classico Juridico",
    description: "Azul institucional com destaque dourado.",
    primaryColor: "#1E3A8A",
    secondaryColor: "#1D4ED8",
    accentColor: "#A16207",
  },
  {
    key: "modern-cyan",
    name: "Moderno Ciano",
    description: "Visual limpo com contraste alto para leitura.",
    primaryColor: "#0F766E",
    secondaryColor: "#0891B2",
    accentColor: "#155E75",
  },
  {
    key: "executive-graphite",
    name: "Executivo Grafite",
    description: "Tom sobrio para escritorios corporativos.",
    primaryColor: "#1F2937",
    secondaryColor: "#111827",
    accentColor: "#1D4ED8",
  },
  {
    key: "warm-burgundy",
    name: "Borgonha Premium",
    description: "Identidade premium com apoio neutro.",
    primaryColor: "#7F1D1D",
    secondaryColor: "#991B1B",
    accentColor: "#C2410C",
  },
  {
    key: "forest-green",
    name: "Verde Comarca",
    description: "Visual seguro para times focados em contencioso.",
    primaryColor: "#166534",
    secondaryColor: "#15803D",
    accentColor: "#4D7C0F",
  },
  {
    key: "violet-balance",
    name: "Violeta Equilibrado",
    description: "Paleta moderna para escritórios digitais.",
    primaryColor: "#5B21B6",
    secondaryColor: "#7C3AED",
    accentColor: "#15803D",
  },
  {
    key: "midnight-ocean",
    name: "Oceano Noturno",
    description: "Azul profundo com destaque vibrante.",
    primaryColor: "#0C4A6E",
    secondaryColor: "#0369A1",
    accentColor: "#A16207",
  },
  {
    key: "charcoal-copper",
    name: "Carvao e Cobre",
    description: "Contraste elegante para marca premium.",
    primaryColor: "#292524",
    secondaryColor: "#44403C",
    accentColor: "#B45309",
  },
];

export function getBrandingPresetByKey(
  key?: string | null,
): BrandingPreset | null {
  if (!key) {
    return null;
  }

  return BRANDING_PRESETS.find((preset) => preset.key === key) ?? null;
}
