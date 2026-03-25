"use server";

import { getServerSession } from "next-auth/next";

import { authOptions } from "@/auth";
import prisma from "@/app/lib/prisma";
import { emailService } from "@/app/lib/email-service";
import { logAudit } from "@/app/lib/audit/log";
import {
  buildRestorePayload,
  buildSoftDeletePayload,
} from "@/app/lib/soft-delete";
import { TENANT_PERMISSIONS } from "@/types";

type CredentialType = "DEFAULT" | "ADMIN";

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function validateEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function normalizeFromName(value?: string | null): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return null;
  }

  return trimmed.slice(0, 120);
}

async function authorizeTenantEmailCredentialAccess(
  tenantId: string,
  options?: { allowSuperAdminAnyTenant?: boolean },
) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return {
      success: false as const,
      error: "Não autorizado.",
    };
  }

  const role = (session.user as any)?.role as string | undefined;
  const permissions = ((session.user as any)?.permissions ?? []) as string[];
  const userTenantId = (session.user as any)?.tenantId as string | undefined;
  const isSuperAdmin = role === "SUPER_ADMIN";
  const isTenantAllowed =
    role === "ADMIN" || permissions.includes(TENANT_PERMISSIONS.manageOfficeSettings);

  if (isSuperAdmin && options?.allowSuperAdminAnyTenant) {
    return {
      success: true as const,
      session,
      tenantId,
      role,
      permissions,
      userTenantId,
    };
  }

  if (!userTenantId || userTenantId !== tenantId || !isTenantAllowed) {
    return {
      success: false as const,
      error: "Você não tem permissão para gerenciar credenciais deste tenant.",
    };
  }

  return {
    success: true as const,
    session,
    tenantId,
    role,
    permissions,
    userTenantId,
  };
}

export async function listTenantEmailCredentials(
  tenantId: string,
  options?: { includeApiKey?: boolean },
) {
  const auth = await authorizeTenantEmailCredentialAccess(tenantId, {
    allowSuperAdminAnyTenant: true,
  });
  if (!auth.success) {
    return { success: false, error: auth.error, data: [] as any[] } as const;
  }

  const includeApiKey = Boolean(options?.includeApiKey) && auth.role === "SUPER_ADMIN";
  const creds = await prisma.tenantEmailCredential.findMany({
    where: {
      tenantId,
      deletedAt: null,
    },
    select: {
      id: true,
      type: true,
      fromAddress: true,
      apiKey: includeApiKey,
      fromName: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { type: "asc" },
  });

  return { success: true, data: creds } as const;
}

export async function upsertTenantEmailCredential(params: {
  tenantId: string;
  type: CredentialType;
  fromAddress: string;
  apiKey?: string;
  fromName?: string | null;
}) {
  const { tenantId, type, fromAddress, apiKey, fromName } = params;

  const auth = await authorizeTenantEmailCredentialAccess(tenantId, {
    allowSuperAdminAnyTenant: true,
  });
  if (!auth.success) {
    return { success: false, error: auth.error } as const;
  }

  const normalizedFromAddress = normalizeEmail(fromAddress);
  const normalizedApiKey = apiKey?.trim() ?? "";
  const normalizedFromName = normalizeFromName(fromName);

  if (!validateEmail(normalizedFromAddress)) {
    return {
      success: false,
      error: "Email remetente inválido.",
    } as const;
  }

  const existing = await prisma.tenantEmailCredential.findUnique({
    where: {
      tenantId_type: { tenantId, type },
    },
    select: {
      id: true,
      fromAddress: true,
      fromName: true,
      updatedAt: true,
      deletedAt: true,
    },
  });

  if (!existing && !normalizedApiKey) {
    return {
      success: false,
      error: "API key é obrigatória para criar a credencial.",
    } as const;
  }

  if (normalizedApiKey && !normalizedApiKey.startsWith("re_")) {
    return {
      success: false,
      error: "API key inválida. Verifique a chave da Resend.",
    } as const;
  }

  const updated = await prisma.tenantEmailCredential.upsert({
    where: { tenantId_type: { tenantId, type } },
    update: {
      ...buildRestorePayload(),
      fromAddress: normalizedFromAddress,
      fromName: normalizedFromName,
      ...(normalizedApiKey ? { apiKey: normalizedApiKey } : {}),
    },
    create: {
      tenantId,
      type,
      fromAddress: normalizedFromAddress,
      apiKey: normalizedApiKey,
      fromName: normalizedFromName,
    },
    select: {
      id: true,
      fromAddress: true,
      fromName: true,
    },
  });

  await logAudit({
    tenantId,
    usuarioId: auth.session.user.id,
    acao: existing ? "TENANT_EMAIL_CREDENTIAL_UPDATED" : "TENANT_EMAIL_CREDENTIAL_CREATED",
    entidade: "TenantEmailCredential",
    entidadeId: updated.id,
    dados: {
      type,
      fromAddress: updated.fromAddress,
      fromName: updated.fromName,
      apiKeyUpdated: Boolean(normalizedApiKey),
    },
    previousValues: existing
      ? {
          fromAddress: existing.fromAddress,
          fromName: existing.fromName,
        }
      : null,
    changedFields: existing
      ? ["fromAddress", "fromName", ...(normalizedApiKey ? ["apiKey"] : [])]
      : ["fromAddress", "fromName", "apiKey"],
  });

  return { success: true } as const;
}

export async function deleteTenantEmailCredential(
  tenantId: string,
  type: CredentialType,
) {
  const auth = await authorizeTenantEmailCredentialAccess(tenantId, {
    allowSuperAdminAnyTenant: true,
  });
  if (!auth.success) {
    return { success: false, error: auth.error } as const;
  }

  const existing = await prisma.tenantEmailCredential.findFirst({
    where: {
      tenantId,
      type,
      deletedAt: null,
    },
    select: {
      id: true,
      fromAddress: true,
      fromName: true,
    },
  });

  await prisma.tenantEmailCredential.updateMany({
    where: {
      tenantId,
      type,
      deletedAt: null,
    },
    data: buildSoftDeletePayload(
      {
        actorId: auth.session.user.id,
        actorType: ((auth.session.user as any)?.role as string | undefined) ?? "USER",
      },
      "Remoção manual de credencial de email do tenant",
    ),
  });

  if (existing) {
    await logAudit({
      tenantId,
      usuarioId: auth.session.user.id,
      acao: "TENANT_EMAIL_CREDENTIAL_DELETED",
      entidade: "TenantEmailCredential",
      entidadeId: existing.id,
      dados: {
        type,
      },
      previousValues: {
        fromAddress: existing.fromAddress,
        fromName: existing.fromName,
      },
      changedFields: ["fromAddress", "fromName", "apiKey"],
    });
  }

  return { success: true } as const;
}

export async function testTenantEmailConnection(
  tenantId: string,
  type: CredentialType = "DEFAULT",
) {
  const auth = await authorizeTenantEmailCredentialAccess(tenantId, {
    allowSuperAdminAnyTenant: true,
  });
  if (!auth.success) {
    return { success: false, error: auth.error } as const;
  }

  const result = await emailService.testConnectionDetailed(tenantId, type);

  await logAudit({
    tenantId,
    usuarioId: auth.session.user.id,
    acao: result.success
      ? "TENANT_EMAIL_CREDENTIAL_TEST_SUCCESS"
      : "TENANT_EMAIL_CREDENTIAL_TEST_FAILED",
    entidade: "TenantEmailCredential",
    dados: { type, error: result.error || null },
    changedFields: [],
  });

  return { success: result.success, error: result.error } as const;
}

export async function sendTenantTestEmail(params: {
  tenantId: string;
  type: CredentialType;
  toEmail?: string;
}) {
  const { tenantId, type } = params;
  const auth = await authorizeTenantEmailCredentialAccess(tenantId, {
    allowSuperAdminAnyTenant: true,
  });
  if (!auth.success) {
    return { success: false, error: auth.error } as const;
  }

  const fallbackEmail = auth.session.user.email || undefined;
  const target = normalizeEmail(params.toEmail?.trim() || fallbackEmail || "");

  if (!target || !validateEmail(target)) {
    return {
      success: false,
      error: "Informe um email de destino válido para teste.",
    } as const;
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true },
  });

  const now = new Date();
  const result = await emailService.sendEmailPerTenant(tenantId, {
    to: target,
    credentialType: type,
    fromNameFallback: tenant?.name || "Magic Lawyer",
    subject: `Teste de envio (${type}) - ${tenant?.name || "Magic Lawyer"}`,
    html: `
      <div style="font-family: Arial, sans-serif; color: #111827;">
        <h2 style="margin-bottom: 8px;">Teste de envio realizado com sucesso</h2>
        <p style="margin: 0 0 8px;">Tenant: <strong>${tenant?.name || tenantId}</strong></p>
        <p style="margin: 0 0 8px;">Tipo de credencial: <strong>${type}</strong></p>
        <p style="margin: 0;">Data/hora: ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(now)}</p>
      </div>
    `,
    text: `Teste de envio realizado com sucesso\nTenant: ${tenant?.name || tenantId}\nTipo: ${type}\nData/hora: ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(now)}`,
  });

  await logAudit({
    tenantId,
    usuarioId: auth.session.user.id,
    acao: result.success
      ? "TENANT_EMAIL_TEST_SENT"
      : "TENANT_EMAIL_TEST_FAILED",
    entidade: "TenantEmailCredential",
    dados: {
      type,
      toEmail: target,
      messageId: result.messageId || null,
      error: result.error || null,
    },
    changedFields: [],
  });

  return {
    success: result.success,
    error: result.error,
    messageId: result.messageId,
    toEmail: target,
  } as const;
}

/**
 * Registra auditoria quando SuperAdmin visualiza API key do Resend
 */
export async function logApiKeyView(
  tenantId: string,
  credentialType: CredentialType,
) {
  const { getServerSession } = await import("next-auth/next");
  const { authOptions } = await import("@/auth");

  const session = await getServerSession(authOptions);

  if (!session?.user || (session.user as any)?.role !== "SUPER_ADMIN") {
    return { success: false, error: "Não autorizado" } as const;
  }

  const superAdminId = (session.user as any).id;

  // Buscar nome do tenant para o log
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true, slug: true },
  });

  await prisma.superAdminAuditLog.create({
    data: {
      superAdminId,
      acao: "VIEW_EMAIL_API_KEY",
      entidade: "TenantEmailCredential",
      entidadeId: `${tenantId}:${credentialType}`,
      dadosNovos: {
        tenantName: tenant?.name || tenantId,
        tenantSlug: tenant?.slug,
        credentialType,
        motivo: "Visualização de chave de API Resend",
      },
    },
  });

  return { success: true } as const;
}
