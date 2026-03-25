import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/auth";
import prisma from "@/app/lib/prisma";
import {
  extractRequestIp,
  extractRequestUserAgent,
} from "@/app/lib/audit/operational-events";
import {
  extractPresenceLocation,
  markUserPresence,
} from "@/app/lib/realtime/session-presence";

/**
 * Rota PÚBLICA intermediária para validação de sessão
 *
 * Esta rota é chamada pelo cliente e internamente valida
 * a sessão contra o banco de dados, sem expor o token
 * interno ao frontend.
 */
export async function POST(request: Request) {
  try {
    // Obter sessão do NextAuth
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json(
        { valid: false, reason: "NOT_AUTHENTICATED" },
        { status: 401 },
      );
    }

    // Payload opcional (compatibilidade com clientes antigos)
    let payload: any = null;

    try {
      payload = await request.json();
    } catch {
      payload = null;
    }

    // Fonte da verdade: sessão do servidor, não o payload do cliente.
    const sessionUser = session.user as any;
    const userId = session.user.id;
    const tenantId = sessionUser?.tenantId ?? null;
    const userRole = sessionUser?.role ?? null;
    const impersonation = sessionUser?.impersonation ?? null;
    const isSupportSession = Boolean(
      impersonation?.active && impersonation?.superAdminId,
    );
    const supportActorEmail =
      typeof impersonation?.superAdminEmail === "string"
        ? impersonation.superAdminEmail
        : null;
    const tenantSessionVersion = sessionUser?.tenantSessionVersion;
    const userSessionVersion = sessionUser?.sessionVersion;
    const requestHeaders = new Headers(request.headers);
    const location = extractPresenceLocation(requestHeaders);
    const ipAddress = extractRequestIp(requestHeaders);
    const userAgent = extractRequestUserAgent(requestHeaders);

    if (!userId || typeof userId !== "string") {
      return NextResponse.json(
        { valid: false, reason: "INVALID_USER_ID" },
        { status: 400 },
      );
    }

    if (userRole === "SUPER_ADMIN") {
      const superAdmin = await prisma.superAdmin.findUnique({
        where: { id: userId },
        select: {
          id: true,
          status: true,
          email: true,
          firstName: true,
          lastName: true,
        },
      });

      if (!superAdmin) {
        return NextResponse.json(
          { valid: false, reason: "USER_NOT_FOUND" },
          { status: 404 },
        );
      }

      if (superAdmin.status !== "ACTIVE") {
        return NextResponse.json(
          { valid: false, reason: "USER_DISABLED" },
          { status: 409 },
        );
      }

      await markUserPresence({
        userId: superAdmin.id,
        tenantId: tenantId,
        role: userRole,
        email: superAdmin.email,
        name:
          `${superAdmin.firstName ?? ""} ${superAdmin.lastName ?? ""}`.trim() ||
          superAdmin.email,
        ipAddress,
        userAgent,
        isSupportSession,
        supportActorEmail,
        location,
      });

      return NextResponse.json({ valid: true });
    }

    // Se o cliente enviar userId divergente, rejeitar.
    if (payload?.userId && payload.userId !== userId) {
      return NextResponse.json(
        { valid: false, reason: "USER_ID_MISMATCH" },
        { status: 403 },
      );
    }

    // Se o cliente enviar tenantId divergente, rejeitar.
    if (payload?.tenantId && tenantId && payload.tenantId !== tenantId) {
      return NextResponse.json(
        { valid: false, reason: "TENANT_ID_MISMATCH" },
        { status: 403 },
      );
    }

    // Buscar dados atuais do banco
    const [user, tenant] = await Promise.all([
      prisma.usuario.findUnique({
        where: { id: userId },
        select: {
          id: true,
          active: true,
          sessionVersion: true,
          tenantId: true,
        },
      }),
      tenantId
        ? prisma.tenant.findUnique({
            where: { id: tenantId },
            select: {
              id: true,
              status: true,
              sessionVersion: true,
            },
          })
        : null,
    ]);

    if (!user) {
      return NextResponse.json(
        { valid: false, reason: "USER_NOT_FOUND" },
        { status: 404 },
      );
    }

    // Verificar se usuário está ativo
    if (!user.active) {
      return NextResponse.json(
        { valid: false, reason: "USER_DISABLED" },
        { status: 409 },
      );
    }

    // Verificar se tenant existe e está ativo
    if (tenant) {
      if (tenant.status !== "ACTIVE") {
        return NextResponse.json(
          {
            valid: false,
            reason:
              tenant.status === "SUSPENDED"
                ? "TENANT_SUSPENDED"
                : "TENANT_CANCELLED",
          },
          { status: 409 },
        );
      }

      // Verificar versão da sessão do tenant (quando presente na sessão JWT)
      if (
        typeof tenantSessionVersion === "number" &&
        tenant.sessionVersion !== tenantSessionVersion
      ) {
        return NextResponse.json(
          { valid: false, reason: "SESSION_VERSION_MISMATCH" },
          { status: 409 },
        );
      }
    }

    // Verificar versão da sessão do usuário (quando presente na sessão JWT)
    if (
      typeof userSessionVersion === "number" &&
      user.sessionVersion !== userSessionVersion
    ) {
      return NextResponse.json(
        { valid: false, reason: "SESSION_VERSION_MISMATCH" },
        { status: 409 },
      );
    }

    await markUserPresence({
      userId,
      tenantId: user.tenantId ?? tenantId ?? null,
      role: userRole,
      email: session.user.email ?? null,
      name: session.user.name ?? null,
      ipAddress,
      userAgent,
      isSupportSession,
      supportActorEmail,
      location,
    });

    // Tudo OK
    return NextResponse.json({ valid: true });
  } catch (error) {
    console.error("[session/check] Erro ao validar sessão:", error);

    return NextResponse.json(
      { valid: false, reason: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
