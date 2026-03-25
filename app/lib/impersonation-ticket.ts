import { createHmac, timingSafeEqual } from "node:crypto";

import logger from "@/lib/logger";

export type ImpersonationSessionSnapshot = {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
  avatarUrl?: string | null;
  tenantId?: string | null;
  role: string;
  tenantSlug?: string | null;
  tenantName?: string | null;
  tenantLogoUrl?: string | null;
  tenantFaviconUrl?: string | null;
  permissions: string[];
  tenantModules: string[];
  sessionVersion?: number;
  tenantSessionVersion?: number;
  tenantPlanRevision?: number;
  tenantStatus?: string | null;
  tenantStatusReason?: string | null;
  impersonation?: {
    active: boolean;
    startedAt: string;
    superAdminId: string;
    superAdminEmail: string;
    superAdminName?: string | null;
    targetUserId: string;
    targetUserEmail: string;
    targetUserName?: string | null;
    targetUserRole: string;
    targetTenantId: string;
    targetTenantSlug?: string | null;
    targetTenantName?: string | null;
  } | null;
};

export type ImpersonationTicketPayload = {
  v: 1;
  type: "IMPERSONATION_START" | "IMPERSONATION_END";
  issuedAt: number;
  expiresAt: number;
  issuedForSessionId: string;
  issuedForRole: string;
  nextSession: ImpersonationSessionSnapshot;
};

type VerifyResult =
  | { valid: true; payload: ImpersonationTicketPayload }
  | { valid: false; reason: string };

const IMPERSONATION_TICKET_TTL_MS = 2 * 60 * 1000;

function getTicketSecret() {
  const secret = process.env.NEXTAUTH_SECRET?.trim();

  if (!secret) {
    throw new Error(
      "NEXTAUTH_SECRET não configurado. Não é possível validar ticket de impersonação.",
    );
  }

  return secret;
}

function signPayload(encodedPayload: string) {
  const secret = getTicketSecret();

  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

export function createImpersonationTicket(
  params: Omit<
    ImpersonationTicketPayload,
    "v" | "issuedAt" | "expiresAt"
  > & {
    ttlMs?: number;
  },
) {
  const issuedAt = Date.now();
  const expiresAt = issuedAt + (params.ttlMs ?? IMPERSONATION_TICKET_TTL_MS);

  const payload: ImpersonationTicketPayload = {
    v: 1,
    type: params.type,
    issuedAt,
    expiresAt,
    issuedForSessionId: params.issuedForSessionId,
    issuedForRole: params.issuedForRole,
    nextSession: params.nextSession,
  };

  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = signPayload(encodedPayload);

  return `${encodedPayload}.${signature}`;
}

export function verifyImpersonationTicket(
  ticket: string,
  expected: { sessionId?: string; role?: string } = {},
): VerifyResult {
  if (!ticket || typeof ticket !== "string") {
    return { valid: false, reason: "Ticket ausente" };
  }

  const parts = ticket.split(".");

  if (parts.length !== 2) {
    return { valid: false, reason: "Formato de ticket inválido" };
  }

  const [encodedPayload, providedSignature] = parts;
  const expectedSignature = signPayload(encodedPayload);

  const encoder = new TextEncoder();
  const providedBuffer = encoder.encode(providedSignature);
  const expectedBuffer = encoder.encode(expectedSignature);

  if (
    providedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    return { valid: false, reason: "Assinatura inválida" };
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as ImpersonationTicketPayload;

    if (payload.v !== 1) {
      return { valid: false, reason: "Versão de ticket não suportada" };
    }

    if (Date.now() > payload.expiresAt) {
      return { valid: false, reason: "Ticket expirado" };
    }

    if (
      expected.sessionId &&
      payload.issuedForSessionId !== expected.sessionId
    ) {
      return { valid: false, reason: "Sessão divergente do ticket" };
    }

    if (expected.role && payload.issuedForRole !== expected.role) {
      return { valid: false, reason: "Role divergente do ticket" };
    }

    return { valid: true, payload };
  } catch (error) {
    logger.warn(
      { error },
      "Falha ao decodificar ticket de impersonação",
    );
    return { valid: false, reason: "Payload de ticket inválido" };
  }
}
