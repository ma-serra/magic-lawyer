import prisma from "@/app/lib/prisma";
import { getRedisInstance } from "@/app/lib/notifications/redis-singleton";

import { normalizeNiceClassCode } from "./nice-classes";

const INPI_CATALOG_SYNC_RESULT_TTL_SECONDS = 7 * 24 * 60 * 60;
const INPI_CATALOG_SYNC_RESULT_SET_PREFIX = "ml:inpi-sync:result-fingerprints";

export interface InpiCatalogPersistableItem {
  nome: string;
  classeNice: string | null;
  processoNumero: string;
  titular?: string | null;
  status: string;
}

function normalizeTerm(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function buildCatalogFingerprint(input: {
  nome: string;
  classeNice?: string | null;
  processoNumero?: string | null;
  protocolo?: string | null;
}) {
  const normalizedClass = normalizeNiceClassCode(input.classeNice) || "";

  return [
    normalizeTerm(input.nome),
    normalizedClass,
    (input.processoNumero || "").trim(),
    (input.protocolo || "").trim(),
  ].join("|");
}

function buildCatalogQualityKey(item: InpiCatalogPersistableItem) {
  return [
    (item.processoNumero || "").trim(),
    normalizeTerm(item.nome),
    normalizeNiceClassCode(item.classeNice) || "sem-classe",
  ].join("|");
}

function buildResultFingerprintSetKey(syncId: string) {
  return `${INPI_CATALOG_SYNC_RESULT_SET_PREFIX}:${syncId}`;
}

export function dedupeOfficialItems(items: InpiCatalogPersistableItem[]) {
  const map = new Map<string, InpiCatalogPersistableItem>();

  for (const item of items) {
    const fingerprint = buildCatalogFingerprint({
      nome: item.nome,
      classeNice: item.classeNice,
      processoNumero: item.processoNumero,
      protocolo: null,
    });

    if (!fingerprint) {
      continue;
    }

    const existing = map.get(fingerprint);
    if (!existing) {
      map.set(fingerprint, item);
      continue;
    }

    const existingQuality =
      (existing.titular ? 2 : 0) +
      (normalizeNiceClassCode(existing.classeNice) ? 1 : 0);
    const incomingQuality =
      (item.titular ? 2 : 0) + (normalizeNiceClassCode(item.classeNice) ? 1 : 0);

    if (incomingQuality > existingQuality) {
      map.set(fingerprint, item);
    } else if (incomingQuality === existingQuality) {
      const existingStableKey = buildCatalogQualityKey(existing);
      const incomingStableKey = buildCatalogQualityKey(item);
      if (incomingStableKey.localeCompare(existingStableKey) < 0) {
        map.set(fingerprint, item);
      }
    }
  }

  return Array.from(map.values());
}

export async function reserveNewCatalogItemsForSync(
  syncId: string,
  items: InpiCatalogPersistableItem[],
) {
  if (!items.length) {
    return {
      items: [] as InpiCatalogPersistableItem[],
      totalReserved: 0,
    };
  }

  const redis = getRedisInstance();
  const multi = redis.multi();

  const members = items.map((item) =>
    buildCatalogFingerprint({
      nome: item.nome,
      classeNice: item.classeNice,
      processoNumero: item.processoNumero,
      protocolo: null,
    }),
  );
  const setKey = buildResultFingerprintSetKey(syncId);

  for (const member of members) {
    multi.sadd(setKey, member);
  }
  multi.expire(setKey, INPI_CATALOG_SYNC_RESULT_TTL_SECONDS);
  multi.scard(setKey);

  const result = await multi.exec();
  const entries = Array.isArray(result) ? result : [];
  const totalReservedRaw = entries[entries.length - 1]?.[1];
  const totalReserved =
    typeof totalReservedRaw === "number" ? totalReservedRaw : items.length;

  const freshItems = items.filter((_, index) => {
    const response = entries[index]?.[1];
    return response === 1;
  });

  return {
    items: freshItems,
    totalReserved,
  };
}

export async function persistCatalogItems(items: InpiCatalogPersistableItem[]) {
  if (!items.length) {
    return {
      persistedRows: 0,
      createdCount: 0,
      updatedCount: 0,
    };
  }

  const PERSIST_CHUNK_SIZE = 200;
  let persistedRows = 0;
  let createdCount = 0;
  let updatedCount = 0;

  for (let i = 0; i < items.length; i += PERSIST_CHUNK_SIZE) {
    const chunk = items.slice(i, i + PERSIST_CHUNK_SIZE);
    const withFingerprint = chunk.map((item) => {
      const classeNice = normalizeNiceClassCode(item.classeNice);
      const fingerprint = buildCatalogFingerprint({
        nome: item.nome,
        classeNice,
        processoNumero: item.processoNumero,
        protocolo: null,
      });

      return {
        ...item,
        classeNice,
        fingerprint,
      };
    });

    const existing = await prisma.inpiCatalogMarca.findMany({
      where: {
        fingerprint: {
          in: withFingerprint.map((item) => item.fingerprint),
        },
      },
      select: {
        fingerprint: true,
      },
    });
    const existingSet = new Set(existing.map((item) => item.fingerprint));

    await prisma.$transaction(
      withFingerprint.map((item) =>
        prisma.inpiCatalogMarca.upsert({
          where: { fingerprint: item.fingerprint },
          update: {
            nome: item.nome,
            nomeNormalizado: normalizeTerm(item.nome),
            classeNice: item.classeNice,
            titular: item.titular?.trim() || undefined,
            processoNumero: item.processoNumero,
            status: item.status,
            fonte: "inpi_dados_abertos_live",
            dadosRaw: {
              lastBackgroundSyncAt: new Date().toISOString(),
            },
          },
          create: {
            nome: item.nome,
            nomeNormalizado: normalizeTerm(item.nome),
            classeNice: item.classeNice,
            titular: item.titular?.trim() || null,
            processoNumero: item.processoNumero,
            protocolo: null,
            status: item.status,
            descricao: null,
            fonte: "inpi_dados_abertos_live",
            fingerprint: item.fingerprint,
            dadosRaw: {
              lastBackgroundSyncAt: new Date().toISOString(),
            },
          },
        }),
      ),
    );

    persistedRows += withFingerprint.length;
    updatedCount += withFingerprint.filter((item) =>
      existingSet.has(item.fingerprint),
    ).length;
    createdCount += withFingerprint.length - existingSet.size;
  }

  return {
    persistedRows,
    createdCount,
    updatedCount,
  };
}
