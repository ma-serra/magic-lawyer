export type ClicksignAmbiente = "SANDBOX" | "PRODUCAO";

export const DEFAULT_CLICKSIGN_API_BASES: Record<ClicksignAmbiente, string> = {
  SANDBOX: "https://sandbox.clicksign.com/api/v1",
  PRODUCAO: "https://app.clicksign.com/api/v1",
};

export function getDefaultClicksignApiBase(
  ambiente: ClicksignAmbiente = "SANDBOX",
): string {
  return DEFAULT_CLICKSIGN_API_BASES[ambiente];
}

export function inferClicksignAmbiente(
  apiBase?: string | null,
): ClicksignAmbiente {
  if (!apiBase?.trim()) {
    return "SANDBOX";
  }

  if (apiBase?.toLowerCase().includes("sandbox")) {
    return "SANDBOX";
  }

  return "PRODUCAO";
}

export function normalizeClicksignApiBase(
  apiBase?: string | null,
  ambiente: ClicksignAmbiente = "SANDBOX",
): string {
  const rawValue = apiBase?.trim();

  if (!rawValue) {
    return getDefaultClicksignApiBase(ambiente);
  }

  try {
    const url = new URL(rawValue);
    let pathname = url.pathname.replace(/\/+$/, "");

    if (!pathname) {
      pathname = "/api/v1";
    }

    return `${url.origin}${pathname}`;
  } catch {
    return rawValue;
  }
}

export function isValidClicksignApiBase(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.pathname.startsWith("/api/")
    );
  } catch {
    return false;
  }
}
