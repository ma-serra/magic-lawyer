import logger from "@/lib/logger";

export interface BrazilTimezoneOption {
  key: string;
  label: string;
}

const IANA_ZONE_TAB_URL = "https://data.iana.org/time-zones/tzdb/zone1970.tab";

const FALLBACK_BRAZIL_TIMEZONES: BrazilTimezoneOption[] = [
  { key: "America/Sao_Paulo", label: "Sao Paulo (UTC-03:00)" },
  { key: "America/Bahia", label: "Salvador (UTC-03:00)" },
  { key: "America/Manaus", label: "Manaus (UTC-04:00)" },
  { key: "America/Rio_Branco", label: "Rio Branco (UTC-05:00)" },
  { key: "America/Noronha", label: "Fernando de Noronha (UTC-02:00)" },
];

const FRIENDLY_ZONE_LABELS: Record<string, string> = {
  Noronha: "Fernando de Noronha",
  Araguaina: "Araguaína",
  Belem: "Belém",
  Maceio: "Maceió",
  Sao_Paulo: "São Paulo",
};

function toUtcLabel(rawOffset: string) {
  const match = rawOffset.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/i);
  if (!match) {
    return "UTC";
  }

  const sign = match[1];
  const hour = match[2].padStart(2, "0");
  const minute = (match[3] || "00").padStart(2, "0");

  return `UTC${sign}${hour}:${minute}`;
}

function getUtcOffsetLabel(timeZone: string, date = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "shortOffset",
    }).formatToParts(date);
    const value = parts.find((part) => part.type === "timeZoneName")?.value;

    if (!value) {
      return "UTC";
    }

    return toUtcLabel(value);
  } catch {
    return "UTC";
  }
}

function getOffsetSortValue(utcLabel: string) {
  const match = utcLabel.match(/UTC([+-])(\d{2}):(\d{2})/);
  if (!match) {
    return 0;
  }

  const sign = match[1] === "-" ? -1 : 1;
  const hour = Number.parseInt(match[2], 10);
  const minute = Number.parseInt(match[3], 10);

  return sign * (hour * 60 + minute);
}

function normalizeCityLabel(zone: string) {
  const token = zone.split("/").pop() || zone;
  return FRIENDLY_ZONE_LABELS[token] || token.replaceAll("_", " ");
}

function parseBrazilZones(content: string) {
  const lines = content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));

  const zones = new Map<string, string>();

  for (const line of lines) {
    const [countries, _coords, zone] = line.split("\t");

    if (!countries || !zone) {
      continue;
    }

    const countryCodes = countries.split(",");
    if (!countryCodes.includes("BR")) {
      continue;
    }

    if (!zones.has(zone)) {
      zones.set(zone, normalizeCityLabel(zone));
    }
  }

  return Array.from(zones.entries()).map(([zone, city]) => {
    const utcLabel = getUtcOffsetLabel(zone);

    return {
      key: zone,
      label: `${city} (${utcLabel})`,
      sortValue: getOffsetSortValue(utcLabel),
    };
  });
}

export async function getBrazilTimezoneOptions(): Promise<BrazilTimezoneOption[]> {
  try {
    const response = await fetch(IANA_ZONE_TAB_URL, {
      next: {
        revalidate: 60 * 60 * 24,
      },
      headers: {
        Accept: "text/plain",
      },
    });

    if (!response.ok) {
      throw new Error(`IANA response not ok: ${response.status}`);
    }

    const text = await response.text();
    const parsed = parseBrazilZones(text);

    if (parsed.length === 0) {
      throw new Error("IANA zone1970.tab returned no BR zones");
    }

    return parsed
      .sort((a, b) => {
        if (a.sortValue !== b.sortValue) {
          return b.sortValue - a.sortValue;
        }
        return a.label.localeCompare(b.label, "pt-BR");
      })
      .map(({ key, label }) => ({ key, label }));
  } catch (error) {
    logger.warn("Falha ao carregar fusos BR da IANA, usando fallback local", {
      error: error instanceof Error ? error.message : String(error),
    });
    return FALLBACK_BRAZIL_TIMEZONES;
  }
}
