import { getRedisInstance } from "@/app/lib/notifications/redis-singleton";

const PRESENCE_INDEX_KEY = "presence:active-users:v1";
const PRESENCE_USER_KEY_PREFIX = "presence:user:v1:";
const PRESENCE_TTL_SECONDS = 180;
const PRESENCE_MAX_AGE_SECONDS = 180;

export interface PresenceLocationMetadata {
  country: string | null;
  region: string | null;
  city: string | null;
  label: string | null;
}

export interface SessionPresenceEntry {
  userId: string;
  tenantId: string | null;
  role: string | null;
  name: string | null;
  email: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  isSupportSession: boolean;
  supportActorEmail: string | null;
  lastSeenAt: string;
  location: PresenceLocationMetadata;
}

interface MarkUserPresenceInput {
  userId: string;
  tenantId?: string | null;
  role?: string | null;
  name?: string | null;
  email?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  isSupportSession?: boolean;
  supportActorEmail?: string | null;
  location?: Partial<PresenceLocationMetadata> | null;
}

interface PresenceSnapshotOptions {
  maxAgeSeconds?: number;
  includeSupportSessions?: boolean;
  includeSuperAdmins?: boolean;
}

function normalizeString(value?: string | null) {
  const normalized = value?.trim();

  return normalized ? normalized : null;
}

function readHeader(headers: Headers, keys: string[]): string | null {
  for (const key of keys) {
    const value = normalizeString(headers.get(key));

    if (value) {
      return value;
    }
  }

  return null;
}

function buildPresenceUserKey(userId: string) {
  return `${PRESENCE_USER_KEY_PREFIX}${userId}`;
}

function parsePresenceEntry(raw: string): SessionPresenceEntry | null {
  try {
    const parsed = JSON.parse(raw) as SessionPresenceEntry;

    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    if (!parsed.userId || typeof parsed.userId !== "string") {
      return null;
    }

    if (!parsed.lastSeenAt || Number.isNaN(Date.parse(parsed.lastSeenAt))) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function extractPresenceLocation(
  headers: Headers,
): PresenceLocationMetadata {
  const country = readHeader(headers, [
    "x-vercel-ip-country",
    "cf-ipcountry",
    "x-country-code",
  ]);
  const region = readHeader(headers, [
    "x-vercel-ip-country-region",
    "x-region",
  ]);
  const city = readHeader(headers, ["x-vercel-ip-city", "x-city"]);

  const label = [city, region, country].filter(Boolean).join(", ");

  return {
    country,
    region,
    city,
    label: label || null,
  };
}

export async function markUserPresence(
  input: MarkUserPresenceInput,
): Promise<void> {
  const userId = normalizeString(input.userId);

  if (!userId) {
    return;
  }

  const location = {
    country: normalizeString(input.location?.country) ?? null,
    region: normalizeString(input.location?.region) ?? null,
    city: normalizeString(input.location?.city) ?? null,
    label: normalizeString(input.location?.label) ?? null,
  };

  const payload: SessionPresenceEntry = {
    userId,
    tenantId: normalizeString(input.tenantId) ?? null,
    role: normalizeString(input.role) ?? null,
    name: normalizeString(input.name) ?? null,
    email: normalizeString(input.email) ?? null,
    ipAddress: normalizeString(input.ipAddress) ?? null,
    userAgent: normalizeString(input.userAgent) ?? null,
    isSupportSession: Boolean(input.isSupportSession),
    supportActorEmail: normalizeString(input.supportActorEmail) ?? null,
    lastSeenAt: new Date().toISOString(),
    location,
  };

  try {
    const redis = getRedisInstance();
    const transaction = redis.multi();
    transaction.set(
      buildPresenceUserKey(userId),
      JSON.stringify(payload),
      "EX",
      PRESENCE_TTL_SECONDS,
    );
    transaction.sadd(PRESENCE_INDEX_KEY, userId);
    await transaction.exec();
  } catch (error) {
    console.warn("[session-presence] Falha ao registrar heartbeat:", error);
  }
}

export async function getOnlinePresenceSnapshot(
  options: PresenceSnapshotOptions = {},
): Promise<SessionPresenceEntry[]> {
  const maxAgeSeconds = Math.max(30, options.maxAgeSeconds ?? PRESENCE_MAX_AGE_SECONDS);
  const includeSupportSessions = options.includeSupportSessions ?? true;
  const includeSuperAdmins = options.includeSuperAdmins ?? false;
  const now = Date.now();

  try {
    const redis = getRedisInstance();
    const userIds = await redis.smembers(PRESENCE_INDEX_KEY);

    if (userIds.length === 0) {
      return [];
    }

    const rawEntries = await redis.mget(...userIds.map(buildPresenceUserKey));
    const staleUserIds: string[] = [];
    const activeEntries: SessionPresenceEntry[] = [];

    userIds.forEach((userId, index) => {
      const raw = rawEntries[index];

      if (!raw) {
        staleUserIds.push(userId);
        return;
      }

      const parsed = parsePresenceEntry(raw);
      if (!parsed) {
        staleUserIds.push(userId);
        return;
      }

      const ageMs = now - Date.parse(parsed.lastSeenAt);
      if (ageMs > maxAgeSeconds * 1000) {
        staleUserIds.push(userId);
        return;
      }

      if (!includeSupportSessions && parsed.isSupportSession) {
        return;
      }

      if (!includeSuperAdmins && !parsed.tenantId) {
        return;
      }

      activeEntries.push(parsed);
    });

    if (staleUserIds.length > 0) {
      await redis.srem(PRESENCE_INDEX_KEY, ...staleUserIds);
    }

    activeEntries.sort(
      (a, b) => Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt),
    );

    return activeEntries;
  } catch (error) {
    console.warn("[session-presence] Falha ao montar snapshot:", error);
    return [];
  }
}

export async function getOnlineCountsByTenant(
  options: PresenceSnapshotOptions = {},
): Promise<Record<string, number>> {
  const snapshot = await getOnlinePresenceSnapshot(options);
  const usersByTenant = new Map<string, Set<string>>();

  for (const entry of snapshot) {
    if (!entry.tenantId) {
      continue;
    }

    const currentSet = usersByTenant.get(entry.tenantId) ?? new Set<string>();
    currentSet.add(entry.userId);
    usersByTenant.set(entry.tenantId, currentSet);
  }

  return Object.fromEntries(
    Array.from(usersByTenant.entries()).map(([tenantId, users]) => [
      tenantId,
      users.size,
    ]),
  );
}

export async function getOnlineUsersByTenant(
  tenantId: string,
  options: PresenceSnapshotOptions = {},
): Promise<SessionPresenceEntry[]> {
  const normalizedTenantId = normalizeString(tenantId);

  if (!normalizedTenantId) {
    return [];
  }

  const snapshot = await getOnlinePresenceSnapshot(options);

  return snapshot.filter((entry) => entry.tenantId === normalizedTenantId);
}
