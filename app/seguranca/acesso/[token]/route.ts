import { NextResponse } from "next/server";

import { resolveSecurityAccessResponse } from "@/app/lib/security/account-access";

function redirectTo(request: Request, pathname: string) {
  return NextResponse.redirect(new URL(pathname, request.url));
}

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> | { token: string } },
) {
  const params = await Promise.resolve(context.params);
  const token = params?.token?.trim();

  if (!token) {
    return redirectTo(request, "/login?reason=SECURITY_ACTION_INVALID");
  }

  const result = await resolveSecurityAccessResponse({
    token,
    requestHeaders: new Headers(request.headers),
  });

  if (result.ok) {
    return NextResponse.redirect(result.redirectUrl);
  }

  switch (result.reason) {
    case "EXPIRED":
      return redirectTo(request, "/login?reason=SECURITY_ACTION_EXPIRED");
    case "USED":
      return redirectTo(request, "/login?reason=SECURITY_ACTION_USED");
    case "DISABLED":
      return redirectTo(request, "/login?reason=USER_DISABLED");
    default:
      return redirectTo(request, "/login?reason=SECURITY_ACTION_INVALID");
  }
}
