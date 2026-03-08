type Shade = 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;

const SHADE_ORDER: Shade[] = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];

const SHADE_LIGHTNESS_WEIGHTS: Record<Shade, number> = {
  50: 0.9,
  100: 0.76,
  200: 0.58,
  300: 0.4,
  400: 0.2,
  500: 0,
  600: -0.12,
  700: -0.24,
  800: -0.36,
  900: -0.5,
};

type Rgb = { r: number; g: number; b: number };
type Hsl = { h: number; s: number; l: number };

interface ToneMap {
  light: Record<string, string>;
  dark: Record<string, string>;
}

interface TenantThemeInput {
  primaryColor?: string | null;
  secondaryColor?: string | null;
  accentColor?: string | null;
}

function normalizeHexColor(hex?: string | null): string | null {
  if (!hex) return null;
  const trimmed = hex.trim().toLowerCase();
  if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(trimmed)) return null;
  if (trimmed.length === 7) return trimmed;
  const r = trimmed[1];
  const g = trimmed[2];
  const b = trimmed[3];
  return `#${r}${r}${g}${g}${b}${b}`;
}

function hexToRgb(hex: string): Rgb {
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  };
}

function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;

  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === rn) h = ((gn - bn) / delta) % 6;
    else if (max === gn) h = (bn - rn) / delta + 2;
    else h = (rn - gn) / delta + 4;
  }

  h = Math.round((h * 60 + 360) % 360);

  const l = (max + min) / 2;
  const s =
    delta === 0
      ? 0
      : delta / (1 - Math.abs(2 * l - 1));

  return {
    h,
    s: Number((s * 100).toFixed(2)),
    l: Number((l * 100).toFixed(2)),
  };
}

function hslToCss({ h, s, l }: Hsl) {
  return `${h} ${Number(s.toFixed(2))}% ${Number(l.toFixed(2))}%`;
}

function hslToRgb({ h, s, l }: Hsl): Rgb {
  const normalizedS = clamp(s / 100, 0, 1);
  const normalizedL = clamp(l / 100, 0, 1);
  const c = (1 - Math.abs(2 * normalizedL - 1)) * normalizedS;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = normalizedL - c / 2;

  let r1 = 0;
  let g1 = 0;
  let b1 = 0;

  if (h >= 0 && h < 60) {
    r1 = c;
    g1 = x;
  } else if (h >= 60 && h < 120) {
    r1 = x;
    g1 = c;
  } else if (h >= 120 && h < 180) {
    g1 = c;
    b1 = x;
  } else if (h >= 180 && h < 240) {
    g1 = x;
    b1 = c;
  } else if (h >= 240 && h < 300) {
    r1 = x;
    b1 = c;
  } else {
    r1 = c;
    b1 = x;
  }

  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function adjustLightness(baseLightness: number, weight: number) {
  if (weight >= 0) {
    return baseLightness + (100 - baseLightness) * weight;
  }
  return baseLightness * (1 + weight);
}

function reverseShade(shade: Shade): Shade {
  const map: Record<Shade, Shade> = {
    50: 900,
    100: 800,
    200: 700,
    300: 600,
    400: 500,
    500: 500,
    600: 400,
    700: 300,
    800: 200,
    900: 100,
  };

  return map[shade];
}

function getRelativeLuminance({ r, g, b }: Rgb) {
  const [rs, gs, bs] = [r, g, b].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function getContrastRatio(a: Rgb, b: Rgb) {
  const lumA = getRelativeLuminance(a);
  const lumB = getRelativeLuminance(b);
  const [lighter, darker] = lumA >= lumB ? [lumA, lumB] : [lumB, lumA];
  return (lighter + 0.05) / (darker + 0.05);
}

function pickReadableShade(
  shades: Record<Shade, Hsl>,
  surfaceHex: string,
  preferredOrder: Shade[],
  minContrast: number,
): Shade {
  const surfaceRgb = hexToRgb(surfaceHex);
  const scored = SHADE_ORDER.map((shade) => ({
    shade,
    contrast: getContrastRatio(hslToRgb(shades[shade]), surfaceRgb),
  }));

  const preferredMatch = preferredOrder.find((shade) => {
    const item = scored.find((entry) => entry.shade === shade);
    return item ? item.contrast >= minContrast : false;
  });
  if (preferredMatch) {
    return preferredMatch;
  }

  return scored.sort((a, b) => b.contrast - a.contrast)[0]?.shade ?? 500;
}

function getReadableForegroundFromShade(shade: Hsl) {
  const shadeRgb = hslToRgb(shade);
  const darkTextRgb = hexToRgb("#11181c");
  const lightTextRgb = hexToRgb("#ffffff");
  const darkContrast = getContrastRatio(shadeRgb, darkTextRgb);
  const lightContrast = getContrastRatio(shadeRgb, lightTextRgb);
  return darkContrast >= lightContrast ? "#11181c" : "#ffffff";
}

function buildToneMap(token: "primary" | "secondary", baseHex: string): ToneMap {
  const baseHsl = rgbToHsl(hexToRgb(baseHex));

  const lightShadeMap = SHADE_ORDER.reduce<Record<Shade, Hsl>>((acc, shade) => {
    const l = clamp(
      adjustLightness(baseHsl.l, SHADE_LIGHTNESS_WEIGHTS[shade]),
      6,
      96,
    );
    acc[shade] = { ...baseHsl, l };
    return acc;
  }, {} as Record<Shade, Hsl>);

  const darkShadeMap = SHADE_ORDER.reduce<Record<Shade, Hsl>>((acc, shade) => {
    acc[shade] = lightShadeMap[reverseShade(shade)];
    return acc;
  }, {} as Record<Shade, Hsl>);

  const lightBaseShade = pickReadableShade(
    lightShadeMap,
    "#ffffff",
    [700, 800, 600, 500, 900, 400],
    4.5,
  );
  const darkBaseShade = pickReadableShade(
    darkShadeMap,
    "#0b0f1a",
    [800, 900, 700, 600, 500],
    4.5,
  );

  const lightShades = SHADE_ORDER.reduce<Record<Shade, string>>((acc, shade) => {
    acc[shade] = hslToCss(lightShadeMap[shade]);
    return acc;
  }, {} as Record<Shade, string>);
  const darkShades = SHADE_ORDER.reduce<Record<Shade, string>>((acc, shade) => {
    acc[shade] = hslToCss(darkShadeMap[shade]);
    return acc;
  }, {} as Record<Shade, string>);

  const lightReadableForeground = hslToCss(
    rgbToHsl(hexToRgb(getReadableForegroundFromShade(lightShadeMap[lightBaseShade]))),
  );
  const darkReadableForeground = hslToCss(
    rgbToHsl(hexToRgb(getReadableForegroundFromShade(darkShadeMap[darkBaseShade]))),
  );
  const light: Record<string, string> = {
    [`--heroui-${token}`]: lightShades[lightBaseShade],
    [`--heroui-${token}-foreground`]: lightReadableForeground,
  };
  const dark: Record<string, string> = {
    [`--heroui-${token}`]: darkShades[darkBaseShade],
    [`--heroui-${token}-foreground`]: darkReadableForeground,
  };

  for (const shade of SHADE_ORDER) {
    light[`--heroui-${token}-${shade}`] = lightShades[shade];
    dark[`--heroui-${token}-${shade}`] = darkShades[shade];
  }

  return { light, dark };
}

function toCssBlock(selector: string, declarations: Record<string, string>) {
  const entries = Object.entries(declarations);
  if (entries.length === 0) return "";

  const body = entries.map(([key, value]) => `${key}:${value};`).join("");
  return `${selector}{${body}}`;
}

export function buildTenantThemeCss(branding: TenantThemeInput): string | null {
  const primary = normalizeHexColor(branding.primaryColor);
  const secondary = normalizeHexColor(branding.secondaryColor);
  const accent = normalizeHexColor(branding.accentColor);

  if (!primary && !secondary && !accent) {
    return null;
  }

  const light: Record<string, string> = {};
  const dark: Record<string, string> = {};

  if (primary) {
    const tone = buildToneMap("primary", primary);
    Object.assign(light, tone.light);
    Object.assign(dark, tone.dark);
  }

  if (secondary) {
    const tone = buildToneMap("secondary", secondary);
    Object.assign(light, tone.light);
    Object.assign(dark, tone.dark);
  }

  if (accent) {
    const accentHsl = hslToCss(rgbToHsl(hexToRgb(accent)));
    light["--heroui-focus"] = accentHsl;
    dark["--heroui-focus"] = accentHsl;
    light["--ml-accent"] = accentHsl;
    dark["--ml-accent"] = accentHsl;
  }

  const lightBlock = toCssBlock(
    ":root,[data-theme='light'],.light",
    light,
  );
  const darkBlock = toCssBlock("[data-theme='dark'],.dark", dark);
  const css = `${lightBlock}${darkBlock}`.trim();

  return css.length > 0 ? css : null;
}
