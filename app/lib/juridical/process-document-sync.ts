import { DocumentoOrigem, Prisma } from "@/generated/prisma";
import type { DocumentoProcesso } from "@/lib/api/juridical/types";

type TxClient = Prisma.TransactionClient;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeText(value?: string | null) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export function canonicalizeExternalDocumentUrl(value?: string | null) {
  const trimmed = (value || "").trim();
  if (!trimmed) {
    return "";
  }

  try {
    const parsed = new URL(trimmed);
    return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, "");
  } catch {
    return trimmed.split("#")[0]?.split("?")[0]?.replace(/\/+$/, "") || trimmed;
  }
}

function inferDocumentNameFromUrl(
  link?: string | null,
  fallback = "Documento importado",
) {
  const trimmed = (link || "").trim();
  if (!trimmed) {
    return fallback;
  }

  try {
    const parsed = new URL(trimmed);
    const lastSegment = decodeURIComponent(parsed.pathname.split("/").pop() || "")
      .split("/")
      .pop()
      ?.trim();

    return lastSegment || fallback;
  } catch {
    const sanitized = trimmed.split("#")[0]?.split("?")[0] || trimmed;
    return decodeURIComponent(sanitized.split("/").pop() || "").trim() || fallback;
  }
}

function buildDocumentNameKey(nome?: string | null, tipo?: string | null) {
  return `${normalizeText(nome)}|${normalizeText(tipo)}`;
}

function buildDocumentMetadataPatch(params: {
  canonicalUrl: string;
  documento: DocumentoProcesso;
}) {
  return {
    importedFrom: "JUSBRASIL",
    importedAt: new Date().toISOString(),
    canonicalUrl: params.canonicalUrl || null,
    sourceProvider: "JUSBRASIL",
    sourceKind: "EXTERNAL_PROCESS_DOCUMENT",
    externalType: params.documento.tipo || null,
    externalDate: params.documento.data?.toISOString() || null,
    externalSizeBytes:
      typeof params.documento.tamanho === "number"
        ? params.documento.tamanho
        : null,
  };
}

function mergeMetadata(
  current: Prisma.JsonValue | null | undefined,
  patch: Record<string, unknown>,
): Prisma.InputJsonObject {
  if (isRecord(current)) {
    return {
      ...current,
      ...patch,
    } as Prisma.InputJsonObject;
  }

  return patch as Prisma.InputJsonObject;
}

export async function syncCapturedProcessDocuments(
  tx: TxClient,
  params: {
    tenantId: string;
    processoId: string;
    clienteId?: string | null;
    documentos?: DocumentoProcesso[] | null;
  },
) {
  const documentos = (params.documentos || [])
    .map((documento) => {
      const nome =
        documento.nome?.trim() ||
        inferDocumentNameFromUrl(documento.link, "Documento importado");
      const link = documento.link?.trim();
      const canonicalUrl = canonicalizeExternalDocumentUrl(link);

      if (!nome || !link || !canonicalUrl) {
        return null;
      }

      return {
        ...documento,
        nome,
        link,
        canonicalUrl,
      };
    })
    .filter(Boolean) as Array<
    DocumentoProcesso & { nome: string; link: string; canonicalUrl: string }
  >;

  if (documentos.length === 0) {
    return {
      createdCount: 0,
      updatedCount: 0,
    };
  }

  const existentes = await tx.documento.findMany({
    where: {
      tenantId: params.tenantId,
      processoId: params.processoId,
      deletedAt: null,
    },
    select: {
      id: true,
      nome: true,
      tipo: true,
      url: true,
      tamanhoBytes: true,
      metadados: true,
    },
  });

  const existingByCanonicalUrl = new Map<string, (typeof existentes)[number]>();
  const existingByName = new Map<string, (typeof existentes)[number]>();

  for (const existing of existentes) {
    const canonicalUrl = canonicalizeExternalDocumentUrl(existing.url);
    if (canonicalUrl && !existingByCanonicalUrl.has(canonicalUrl)) {
      existingByCanonicalUrl.set(canonicalUrl, existing);
    }

    const nameKey = buildDocumentNameKey(existing.nome, existing.tipo);
    if (nameKey !== "|" && !existingByName.has(nameKey)) {
      existingByName.set(nameKey, existing);
    }
  }

  let createdCount = 0;
  let updatedCount = 0;

  for (const documento of documentos) {
    const existing =
      existingByCanonicalUrl.get(documento.canonicalUrl) ||
      existingByName.get(buildDocumentNameKey(documento.nome, documento.tipo));

    const nextMetadata = mergeMetadata(
      existing?.metadados,
      buildDocumentMetadataPatch({
        canonicalUrl: documento.canonicalUrl,
        documento,
      }),
    );

    if (!existing) {
      const created = await tx.documento.create({
        data: {
          tenantId: params.tenantId,
          processoId: params.processoId,
          clienteId: params.clienteId || null,
          nome: documento.nome,
          tipo: documento.tipo || null,
          url: documento.link,
          tamanhoBytes:
            typeof documento.tamanho === "number" ? documento.tamanho : null,
          origem: DocumentoOrigem.SISTEMA,
          visivelParaCliente: false,
          visivelParaEquipe: true,
          metadados: nextMetadata,
        },
        select: {
          id: true,
          nome: true,
          tipo: true,
          url: true,
          tamanhoBytes: true,
          metadados: true,
        },
      });

      existingByCanonicalUrl.set(documento.canonicalUrl, created);
      existingByName.set(buildDocumentNameKey(created.nome, created.tipo), created);
      createdCount += 1;
      continue;
    }

    const updateData: Prisma.DocumentoUpdateInput = {};

    if (existing.nome !== documento.nome) {
      updateData.nome = documento.nome;
    }
    if ((existing.tipo || null) !== (documento.tipo || null)) {
      updateData.tipo = documento.tipo || null;
    }
    if (existing.url !== documento.link) {
      updateData.url = documento.link;
    }
    if (
      typeof documento.tamanho === "number" &&
      existing.tamanhoBytes !== documento.tamanho
    ) {
      updateData.tamanhoBytes = documento.tamanho;
    }

    if (JSON.stringify(existing.metadados || null) !== JSON.stringify(nextMetadata)) {
      updateData.metadados = nextMetadata;
    }

    if (Object.keys(updateData).length === 0) {
      continue;
    }

    const updated = await tx.documento.update({
      where: { id: existing.id },
      data: updateData,
      select: {
        id: true,
        nome: true,
        tipo: true,
        url: true,
        tamanhoBytes: true,
        metadados: true,
      },
    });

    existingByCanonicalUrl.set(documento.canonicalUrl, updated);
    existingByName.set(buildDocumentNameKey(updated.nome, updated.tipo), updated);
    updatedCount += 1;
  }

  return {
    createdCount,
    updatedCount,
  };
}
