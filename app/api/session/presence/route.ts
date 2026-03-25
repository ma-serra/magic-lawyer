import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/auth";
import {
  extractRequestIp,
  extractRequestUserAgent,
} from "@/app/lib/audit/operational-events";
import {
  extractPresenceLocation,
  markUserPresence,
} from "@/app/lib/realtime/session-presence";

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    const sessionUser = session.user as any;
    const requestHeaders = new Headers(request.headers);
    const location = extractPresenceLocation(requestHeaders);
    const impersonation = sessionUser?.impersonation ?? null;

    await markUserPresence({
      userId: session.user.id,
      tenantId: sessionUser?.tenantId ?? null,
      role: sessionUser?.role ?? null,
      email: session.user.email ?? null,
      name: session.user.name ?? null,
      ipAddress: extractRequestIp(requestHeaders),
      userAgent: extractRequestUserAgent(requestHeaders),
      isSupportSession: Boolean(
        impersonation?.active && impersonation?.superAdminId,
      ),
      supportActorEmail:
        typeof impersonation?.superAdminEmail === "string"
          ? impersonation.superAdminEmail
          : null,
      location,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[session/presence] Falha ao registrar presença:", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
