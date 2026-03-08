export type BrandingColorState = {
  primaryColor: string | null;
  secondaryColor: string | null;
  accentColor: string | null;
};

type Rgb = {
  r: number;
  g: number;
  b: number;
};

export type BrandingContrastCheck = {
  key: string;
  label: string;
  foreground: string;
  background: string;
  ratio: number;
  passedAA: boolean;
  passedLargeAA: boolean;
};

export type BrandingAccessibilityReport = {
  score: number;
  checks: BrandingContrastCheck[];
  warnings: string[];
};

const HEX_COLOR_REGEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function normalizeHexColor(color?: string | null): string | null {
  if (!color) {
    return null;
  }

  const trimmed = color.trim();

  if (!HEX_COLOR_REGEX.test(trimmed)) {
    return null;
  }

  if (trimmed.length === 4) {
    return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`.toLowerCase();
  }

  return trimmed.toLowerCase();
}

function hexToRgb(hex: string): Rgb {
  const normalized = normalizeHexColor(hex);
  if (!normalized) {
    return { r: 0, g: 0, b: 0 };
  }

  const value = normalized.replace("#", "");

  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

function linearizeChannel(channel: number): number {
  const normalized = channel / 255;
  if (normalized <= 0.03928) {
    return normalized / 12.92;
  }

  return ((normalized + 0.055) / 1.055) ** 2.4;
}

function getLuminance(rgb: Rgb): number {
  return (
    0.2126 * linearizeChannel(rgb.r) +
    0.7152 * linearizeChannel(rgb.g) +
    0.0722 * linearizeChannel(rgb.b)
  );
}

export function getContrastRatio(colorA: string, colorB: string): number {
  const rgbA = hexToRgb(colorA);
  const rgbB = hexToRgb(colorB);
  const lumA = getLuminance(rgbA);
  const lumB = getLuminance(rgbB);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);

  return Number(((lighter + 0.05) / (darker + 0.05)).toFixed(2));
}

export function pickReadableTextColor(
  backgroundColor?: string | null,
): "#000000" | "#ffffff" {
  const normalized = normalizeHexColor(backgroundColor) || "#2563eb";
  const contrastWithWhite = getContrastRatio(normalized, "#ffffff");
  const contrastWithBlack = getContrastRatio(normalized, "#000000");

  return contrastWithWhite >= contrastWithBlack ? "#ffffff" : "#000000";
}

export function buildBrandingAccessibilityReport(
  colors: BrandingColorState,
): BrandingAccessibilityReport {
  const primary = normalizeHexColor(colors.primaryColor) || "#2563eb";
  const secondary = normalizeHexColor(colors.secondaryColor) || "#1d4ed8";
  const accent = normalizeHexColor(colors.accentColor) || "#3b82f6";
  const onPrimary = pickReadableTextColor(primary);
  const onSecondary = pickReadableTextColor(secondary);
  const onAccent = pickReadableTextColor(accent);

  const checks: BrandingContrastCheck[] = [
    {
      key: "primary-text",
      label: "Texto principal sobre cor primaria",
      foreground: onPrimary,
      background: primary,
      ratio: getContrastRatio(onPrimary, primary),
      passedAA: getContrastRatio(onPrimary, primary) >= 4.5,
      passedLargeAA: getContrastRatio(onPrimary, primary) >= 3,
    },
    {
      key: "secondary-text",
      label: "Texto secundario sobre cor secundaria",
      foreground: onSecondary,
      background: secondary,
      ratio: getContrastRatio(onSecondary, secondary),
      passedAA: getContrastRatio(onSecondary, secondary) >= 4.5,
      passedLargeAA: getContrastRatio(onSecondary, secondary) >= 3,
    },
    {
      key: "accent-text",
      label: "Texto de destaque sobre cor de destaque",
      foreground: onAccent,
      background: accent,
      ratio: getContrastRatio(onAccent, accent),
      passedAA: getContrastRatio(onAccent, accent) >= 4.5,
      passedLargeAA: getContrastRatio(onAccent, accent) >= 3,
    },
    {
      key: "primary-white-surface",
      label: "Cor primaria em fundo claro",
      foreground: primary,
      background: "#ffffff",
      ratio: getContrastRatio(primary, "#ffffff"),
      passedAA: getContrastRatio(primary, "#ffffff") >= 4.5,
      passedLargeAA: getContrastRatio(primary, "#ffffff") >= 3,
    },
    {
      key: "accent-white-surface",
      label: "Cor de destaque em fundo claro",
      foreground: accent,
      background: "#ffffff",
      ratio: getContrastRatio(accent, "#ffffff"),
      passedAA: getContrastRatio(accent, "#ffffff") >= 4.5,
      passedLargeAA: getContrastRatio(accent, "#ffffff") >= 3,
    },
  ];

  const warnings: string[] = [];
  for (const check of checks) {
    if (!check.passedLargeAA) {
      warnings.push(
        `${check.label}: contraste ${check.ratio}:1 abaixo do recomendado para leitura.`,
      );
    } else if (!check.passedAA) {
      warnings.push(
        `${check.label}: contraste ${check.ratio}:1 atende apenas texto grande.`,
      );
    }
  }

  const passedCount = checks.filter((item) => item.passedAA).length;
  const score = Math.round((passedCount / checks.length) * 100);

  return {
    score,
    checks,
    warnings,
  };
}
