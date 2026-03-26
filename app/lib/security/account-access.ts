import { createHash, randomBytes } from "crypto";

import prisma from "@/app/lib/prisma";
import { gerarTokenPrimeiroAcesso } from "@/app/lib/first-access-token";
import { NotificationService } from "@/app/lib/notifications/notification-service";
import { invalidateUser } from "@/app/lib/realtime/invalidation";
import { logOperationalEvent } from "@/app/lib/audit/operational-events";

type AccessLocation = {
  country?: string | null;
  region?: string | null;
  city?: string | null;
  label?: string | null;
};

type TenantUserLoginSecurityParams = {
  tenantId: string;
  userId: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  role?: string | null;
  route: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestHeaders?: Headers | null;
  location?: AccessLocation | null;
  attemptContext?: Record<string, unknown>;
};

const ACCESS_ACTION_TOKEN_EXPIRY_HOURS = 12;

function getPublicBaseUrlFromHeaders(headers?: Headers | null) {
  const host =
    headers?.get("x-forwarded-host") ||
    headers?.get("host") ||
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL;
  const forwardedProto = headers?.get("x-forwarded-proto");

  if (!host) {
    return "http://localhost:9192";
  }

  if (host.startsWith("http://") || host.startsWith("https://")) {
    return host.replace(/\/+$/, "");
  }

  const proto = forwardedProto || (host.includes("localhost") ? "http" : "https");

  return `${proto}://${host}`.replace(/\/+$/, "");
}

function hashSecurityToken(rawToken: string) {
  return createHash("sha256").update(rawToken).digest("hex");
}

function buildActorName(firstName?: string | null, lastName?: string | null) {
  return [firstName, lastName].filter(Boolean).join(" ").trim() || null;
}

function buildLocationLabel(location?: AccessLocation | null) {
  return (
    location?.label ||
    [location?.city, location?.region, location?.country]
      .filter(Boolean)
      .join(", ") ||
    "Localizacao nao identificada"
  );
}

function buildDeviceLabel(userAgent?: string | null) {
  const raw = (userAgent || "").trim();
  if (!raw) {
    return "Dispositivo nao identificado";
  }

  const source = raw.toLowerCase();
  const browser =
    source.includes("edg/")
      ? "Edge"
      : source.includes("opr/") || source.includes("opera")
        ? "Opera"
        : source.includes("firefox/")
          ? "Firefox"
          : source.includes("safari/") && !source.includes("chrome/")
            ? "Safari"
            : source.includes("chrome/")
              ? "Chrome"
              : "Navegador";
  const os =
    source.includes("windows")
      ? "Windows"
      : source.includes("android")
        ? "Android"
        : source.includes("iphone") || source.includes("ipad") || source.includes("ios")
          ? "iOS"
          : source.includes("mac os") || source.includes("macintosh")
            ? "macOS"
            : source.includes("linux")
              ? "Linux"
              : "SO desconhecido";
  const deviceType =
    source.includes("mobile") || source.includes("iphone") || source.includes("android")
      ? "Mobile"
      : source.includes("ipad") || source.includes("tablet")
        ? "Tablet"
        : "Desktop";

  return `${browser} · ${os} · ${deviceType}`;
}

function buildAccessFingerprint(params: {
  ipAddress?: string | null;
  userAgent?: string | null;
  locationLabel: string;
}) {
  const fingerprintSource = [
    params.ipAddress?.trim() || "ip:unknown",
    params.userAgent?.trim() || "ua:unknown",
    params.locationLabel,
  ].join("|");

  return createHash("sha256").update(fingerprintSource).digest("hex");
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function createSecurityActionUrl(params: {
  tenantId: string;
  userId: string;
  auditEventId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  locationLabel: string;
  baseUrl: string;
}) {
  const rawToken = randomBytes(32).toString("hex");

  await prisma.accountSecurityActionToken.create({
    data: {
      tenantId: params.tenantId,
      userId: params.userId,
      auditEventId: params.auditEventId ?? null,
      action: "ACCESS_LOGIN_ALERT",
      tokenHash: hashSecurityToken(rawToken),
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent ?? null,
      locationLabel: params.locationLabel,
      expiresAt: new Date(
        Date.now() + ACCESS_ACTION_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000,
      ),
    },
  });

  return `${params.baseUrl}/seguranca/acesso/${rawToken}`;
}

export async function finalizeTenantUserLoginSecurity(
  params: TenantUserLoginSecurityParams,
) {
  const loginTimestamp = new Date();
  const actorName = buildActorName(params.firstName, params.lastName);
  const locationLabel = buildLocationLabel(params.location);
  const deviceLabel = buildDeviceLabel(params.userAgent);
  const accessFingerprint = buildAccessFingerprint({
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    locationLabel,
  });

  const previousEvents = await prisma.operationalAuditEvent.findMany({
    where: {
      tenantId: params.tenantId,
      category: "ACCESS",
      action: "LOGIN_SUCCESS",
      status: "SUCCESS",
      actorId: params.userId,
    },
    orderBy: { createdAt: "desc" },
    take: 12,
    select: {
      ipAddress: true,
      userAgent: true,
      payload: true,
    },
  });

  const isKnownAccess = previousEvents.some((event) => {
    if (event.payload && typeof event.payload === "object") {
      const payload = event.payload as Record<string, unknown>;
      const storedFingerprint = readString(payload.accessFingerprint);

      if (storedFingerprint && storedFingerprint === accessFingerprint) {
        return true;
      }
    }

    return (
      (event.ipAddress || null) === (params.ipAddress || null) &&
      (event.userAgent || null) === (params.userAgent || null)
    );
  });

  try {
    await prisma.usuario.update({
      where: { id: params.userId },
      data: {
        lastLoginAt: loginTimestamp,
      },
    });
  } catch (error) {
    console.warn("[security] Falha ao atualizar lastLoginAt do usuario", error);
  }

  const loginEvent = await logOperationalEvent({
    tenantId: params.tenantId,
    category: "ACCESS",
    source: "NEXTAUTH",
    action: "LOGIN_SUCCESS",
    status: "SUCCESS",
    actorType: "TENANT_USER",
    actorId: params.userId,
    actorName,
    actorEmail: params.email,
    entityType: "USUARIO",
    entityId: params.userId,
    route: params.route,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    message: "Login autorizado para usuario do tenant.",
    payload: {
      ...(params.attemptContext || {}),
      tenantId: params.tenantId,
      role: params.role,
      loginAt: loginTimestamp.toISOString(),
      locationLabel,
      locationCountry: params.location?.country ?? null,
      locationRegion: params.location?.region ?? null,
      locationCity: params.location?.city ?? null,
      deviceLabel,
      accessFingerprint,
      isKnownAccess,
    },
  });

  const baseUrl = getPublicBaseUrlFromHeaders(params.requestHeaders);
  const securityActionUrl = await createSecurityActionUrl({
    tenantId: params.tenantId,
    userId: params.userId,
    auditEventId: loginEvent?.id ?? null,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    locationLabel,
    baseUrl,
  });

  try {
    await NotificationService.publishNotification({
      type: "access.login_new",
      tenantId: params.tenantId,
      userId: params.userId,
      urgency: "HIGH",
      payload: {
        title: isKnownAccess
          ? "Acesso identificado na sua conta"
          : "Novo dispositivo ou local detectado",
        message: isKnownAccess
          ? "Sua conta acabou de ser acessada. Se nao reconhece este login, acione a contencao de seguranca."
          : "Detectamos um acesso em um contexto novo. Se nao foi voce, encerre as sessoes e redefina sua senha agora.",
        ipAddress: params.ipAddress || "IP nao identificado",
        userAgent: deviceLabel,
        rawUserAgent: params.userAgent || "Navegador nao identificado",
        locationLabel,
        loggedAt: loginTimestamp.toISOString(),
        route: params.route,
        isKnownAccess,
        accessFingerprint,
        securityActionUrl,
      },
    });

    await logOperationalEvent({
      tenantId: params.tenantId,
      category: "ACCESS",
      source: "NOTIFICATION",
      action: "LOGIN_ACCESS_ALERT_QUEUED",
      status: "SUCCESS",
      actorType: "TENANT_USER",
      actorId: params.userId,
      actorName,
      actorEmail: params.email,
      entityType: "USUARIO",
      entityId: params.userId,
      route: params.route,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      message: "Alerta de acesso enfileirado para o usuario.",
      payload: {
        locationLabel,
        loggedAt: loginTimestamp.toISOString(),
        securityActionUrl,
        isKnownAccess,
      },
    });
  } catch (error) {
    console.warn("[security] Falha ao publicar alerta de acesso", error);

    await logOperationalEvent({
      tenantId: params.tenantId,
      category: "ACCESS",
      source: "NOTIFICATION",
      action: "LOGIN_ACCESS_ALERT_QUEUED",
      status: "WARNING",
      actorType: "TENANT_USER",
      actorId: params.userId,
      actorName,
      actorEmail: params.email,
      entityType: "USUARIO",
      entityId: params.userId,
      route: params.route,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      message: "Falha ao enfileirar alerta de acesso para o usuario.",
      payload: {
        error: error instanceof Error ? error.message : String(error),
        locationLabel,
        loggedAt: loginTimestamp.toISOString(),
        securityActionUrl,
      },
    });
  }

  return {
    loginTimestamp,
    locationLabel,
    deviceLabel,
    securityActionUrl,
    isKnownAccess,
  };
}

export async function resolveSecurityAccessResponse(params: {
  token: string;
  requestHeaders?: Headers | null;
}) {
  const tokenHash = hashSecurityToken(params.token);
  const record = await prisma.accountSecurityActionToken.findUnique({
    where: { tokenHash },
    include: {
      tenant: {
        select: {
          id: true,
          name: true,
          status: true,
        },
      },
      user: {
        select: {
          id: true,
          tenantId: true,
          email: true,
          active: true,
          passwordHash: true,
          firstName: true,
          lastName: true,
        },
      },
    },
  });

  if (!record) {
    return { ok: false as const, reason: "INVALID" as const };
  }

  if (!record.user.active || record.tenant.status !== "ACTIVE") {
    return { ok: false as const, reason: "DISABLED" as const };
  }

  const baseUrl = getPublicBaseUrlFromHeaders(params.requestHeaders);

  if (record.usedAt) {
    if (!record.user.passwordHash) {
      const nextToken = gerarTokenPrimeiroAcesso({
        userId: record.user.id,
        tenantId: record.user.tenantId,
        email: record.user.email,
        expiresInHours: 2,
      });

      return {
        ok: true as const,
        redirectUrl: `${baseUrl}/primeiro-acesso/${nextToken}`,
        alreadyHandled: true,
      };
    }

    return { ok: false as const, reason: "USED" as const };
  }

  if (record.expiresAt.getTime() < Date.now()) {
    return { ok: false as const, reason: "EXPIRED" as const };
  }

  const responseIp =
    params.requestHeaders?.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    params.requestHeaders?.get("x-real-ip")?.trim() ||
    params.requestHeaders?.get("cf-connecting-ip")?.trim() ||
    null;
  const responseUserAgent = params.requestHeaders?.get("user-agent")?.trim() || null;
  const actorName = buildActorName(record.user.firstName, record.user.lastName);
  const respondedAt = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.accountSecurityActionToken.update({
      where: { id: record.id },
      data: {
        usedAt: respondedAt,
        usedIpAddress: responseIp,
        usedUserAgent: responseUserAgent,
      },
    });

    await tx.usuario.update({
      where: { id: record.user.id },
      data: {
        passwordHash: null,
        updatedAt: respondedAt,
      },
    });

    await tx.operationalAuditEvent.create({
      data: {
        tenantId: record.tenantId,
        category: "ACCESS",
        source: "SECURITY_ACTION",
        action: "ACCESS_INCIDENT_REPORTED",
        status: "SUCCESS",
        actorType: "TENANT_USER",
        actorId: record.user.id,
        actorName,
        actorEmail: record.user.email,
        entityType: "USUARIO",
        entityId: record.user.id,
        route: "/seguranca/acesso/[token]",
        ipAddress: responseIp,
        userAgent: responseUserAgent,
        message: "Usuario informou que nao reconhece o acesso e iniciou contencao.",
        payload: {
          auditEventId: record.auditEventId,
          triggeredByEmailLink: true,
          originalIpAddress: record.ipAddress,
          originalUserAgent: record.userAgent,
          originalLocationLabel: record.locationLabel,
        },
      },
    });
  });

  await invalidateUser({
    userId: record.user.id,
    tenantId: record.tenantId,
    reason: "SESSION_REVOKED_BY_SECURITY",
  });

  await logOperationalEvent({
    tenantId: record.tenantId,
    category: "ACCESS",
    source: "SECURITY_ACTION",
    action: "PASSWORD_RESET_FORCED",
    status: "SUCCESS",
    actorType: "TENANT_USER",
    actorId: record.user.id,
    actorName,
    actorEmail: record.user.email,
    entityType: "USUARIO",
    entityId: record.user.id,
    route: "/seguranca/acesso/[token]",
    ipAddress: responseIp,
    userAgent: responseUserAgent,
    message: "Senha invalidada e sessoes revogadas apos incidente de acesso.",
    payload: {
      auditEventId: record.auditEventId,
      originalIpAddress: record.ipAddress,
      originalUserAgent: record.userAgent,
      originalLocationLabel: record.locationLabel,
    },
  });

  const nextToken = gerarTokenPrimeiroAcesso({
    userId: record.user.id,
    tenantId: record.user.tenantId,
    email: record.user.email,
    expiresInHours: 2,
  });

  return {
    ok: true as const,
    redirectUrl: `${baseUrl}/primeiro-acesso/${nextToken}`,
    alreadyHandled: false,
  };
}
