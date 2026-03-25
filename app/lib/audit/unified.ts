import { headers } from "next/headers";

import { getSession } from "@/app/lib/auth";
import { logAudit, toAuditJson } from "@/app/lib/audit/log";
import {
  extractRequestIp,
  extractRequestUserAgent,
  logOperationalEvent,
  type OperationalAuditCategory,
  type OperationalAuditStatus,
} from "@/app/lib/audit/operational-events";
import logger from "@/lib/logger";

export type AuditActorType = "USER" | "SYSTEM";

export type UnifiedAuditActor = {
  actorType: AuditActorType;
  actorId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  tenantId: string | null;
};

export type UnifiedRequestMetadata = {
  route: string | null;
  ipAddress: string | null;
  userAgent: string | null;
};

type SessionUserLike = {
  id?: string | null;
  name?: string | null;
  email?: string | null;
  tenantId?: string | null;
};

export async function getUnifiedRequestMetadata(
  route?: string | null,
): Promise<UnifiedRequestMetadata> {
  try {
    const headerList = await headers();

    return {
      route:
        route?.trim() ||
        headerList.get("x-invoke-path")?.trim() ||
        headerList.get("referer")?.trim() ||
        null,
      ipAddress: extractRequestIp(headerList),
      userAgent: extractRequestUserAgent(headerList),
    };
  } catch {
    return {
      route: route?.trim() || null,
      ipAddress: null,
      userAgent: null,
    };
  }
}

export async function getUnifiedAuditActor(
  user?: SessionUserLike | null,
): Promise<UnifiedAuditActor> {
  const sourceUser =
    user ??
    ((await getSession().catch(() => null))?.user as SessionUserLike | null);

  return {
    actorType: sourceUser?.id ? "USER" : "SYSTEM",
    actorId: sourceUser?.id ?? null,
    actorName: sourceUser?.name ?? null,
    actorEmail: sourceUser?.email ?? null,
    tenantId: sourceUser?.tenantId ?? null,
  };
}

type LogChangeAuditInput = {
  tenantId: string;
  action: string;
  entity: string;
  entityId?: string | null;
  changedFields?: string[];
  previousValues?: unknown;
  nextValues?: unknown;
  actor?: SessionUserLike | null;
  route?: string | null;
};

export async function logUnifiedChangeAudit({
  tenantId,
  action,
  entity,
  entityId,
  changedFields,
  previousValues,
  nextValues,
  actor,
  route,
}: LogChangeAuditInput) {
  try {
    const [auditActor, requestMetadata] = await Promise.all([
      getUnifiedAuditActor(actor),
      getUnifiedRequestMetadata(route),
    ]);

    await logAudit({
      tenantId,
      usuarioId: auditActor.actorId,
      acao: action,
      entidade: entity,
      entidadeId: entityId ?? null,
      changedFields: changedFields ?? [],
      previousValues: toAuditJson(previousValues) ?? null,
      dados: toAuditJson(nextValues) ?? null,
      ip: requestMetadata.ipAddress,
      userAgent: requestMetadata.userAgent,
    });
  } catch (error) {
    logger.warn(
      {
        action,
        entity,
        entityId,
        tenantId,
        error,
      },
      "Falha ao registrar auditoria unificada de alteracao.",
    );
  }
}

type LogViewAuditInput = {
  tenantId: string;
  action: string;
  source: string;
  entityType: string;
  entityId: string;
  actor?: SessionUserLike | null;
  route?: string | null;
  message?: string | null;
  payload?: unknown;
  status?: OperationalAuditStatus;
  category?: OperationalAuditCategory;
};

export async function logUnifiedSensitiveView({
  tenantId,
  action,
  source,
  entityType,
  entityId,
  actor,
  route,
  message,
  payload,
  status,
  category = "DATA_ACCESS",
}: LogViewAuditInput) {
  try {
    const [auditActor, requestMetadata] = await Promise.all([
      getUnifiedAuditActor(actor),
      getUnifiedRequestMetadata(route),
    ]);

    await logOperationalEvent({
      tenantId,
      category,
      source,
      action,
      status: status ?? "INFO",
      actorType: auditActor.actorType,
      actorId: auditActor.actorId,
      actorName: auditActor.actorName,
      actorEmail: auditActor.actorEmail,
      entityType,
      entityId,
      route: requestMetadata.route,
      ipAddress: requestMetadata.ipAddress,
      userAgent: requestMetadata.userAgent,
      message:
        message ??
        `Acesso sensível registrado para ${entityType} (${entityId}).`,
      payload: payload === undefined ? undefined : toAuditJson(payload),
    });
  } catch (error) {
    logger.warn(
      {
        action,
        source,
        tenantId,
        entityType,
        entityId,
        error,
      },
      "Falha ao registrar auditoria unificada de visualizacao sensivel.",
    );
  }
}

