import prisma from "@/app/lib/prisma";
import logger from "@/lib/logger";

export type OperationalAuditCategory =
  | "ACCESS"
  | "DATA_ACCESS"
  | "SUPPORT"
  | "EMAIL"
  | "WEBHOOK"
  | "CRON"
  | "INTEGRATION";

export type OperationalAuditStatus =
  | "SUCCESS"
  | "WARNING"
  | "ERROR"
  | "INFO";

type RequestLike = {
  headers: Headers;
  nextUrl?: {
    pathname?: string;
  };
};

export type OperationalAuditInput = {
  tenantId?: string | null;
  category: OperationalAuditCategory;
  source: string;
  action: string;
  status?: OperationalAuditStatus;
  actorType?: string | null;
  actorId?: string | null;
  actorName?: string | null;
  actorEmail?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  route?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  message?: string | null;
  payload?: unknown;
};

function stringifyTrimmed(value?: string | null) {
  const normalized = value?.trim();

  return normalized ? normalized : null;
}

export function extractRequestIp(headers: Headers) {
  const forwardedFor =
    headers.get("x-forwarded-for") ||
    headers.get("x-real-ip") ||
    headers.get("cf-connecting-ip");

  if (!forwardedFor) {
    return null;
  }

  return stringifyTrimmed(forwardedFor.split(",")[0] ?? null);
}

export function extractRequestUserAgent(headers: Headers) {
  return stringifyTrimmed(headers.get("user-agent"));
}

export function getRequestAuditMetadata(request: RequestLike) {
  return {
    route:
      stringifyTrimmed(request.nextUrl?.pathname) ||
      stringifyTrimmed(request.headers.get("x-invoke-path")),
    ipAddress: extractRequestIp(request.headers),
    userAgent: extractRequestUserAgent(request.headers),
  };
}

export async function logOperationalEvent(input: OperationalAuditInput) {
  if (
    input.action?.toUpperCase?.().endsWith("_VIEWED") &&
    (!stringifyTrimmed(input.entityType) || !stringifyTrimmed(input.entityId))
  ) {
    logger.warn(
      {
        action: input.action,
        category: input.category,
        source: input.source,
        entityType: input.entityType,
        entityId: input.entityId,
      },
      "Evento *_VIEWED sem entityType/entityId. Registro ignorado por compliance.",
    );
    return;
  }

  try {
    await prisma.operationalAuditEvent.create({
      data: {
        tenantId: input.tenantId ?? null,
        category: input.category,
        source: input.source,
        action: input.action,
        status: input.status ?? "INFO",
        actorType: stringifyTrimmed(input.actorType),
        actorId: stringifyTrimmed(input.actorId),
        actorName: stringifyTrimmed(input.actorName),
        actorEmail: stringifyTrimmed(input.actorEmail),
        entityType: stringifyTrimmed(input.entityType),
        entityId: stringifyTrimmed(input.entityId),
        route: stringifyTrimmed(input.route),
        ipAddress: stringifyTrimmed(input.ipAddress),
        userAgent: stringifyTrimmed(input.userAgent),
        message: stringifyTrimmed(input.message),
        payload: input.payload === undefined ? undefined : (input.payload as any),
      },
    });
  } catch (error) {
    logger.warn(
      {
        action: input.action,
        category: input.category,
        source: input.source,
        error,
      },
      "Falha ao registrar evento de auditoria operacional.",
    );
  }
}
