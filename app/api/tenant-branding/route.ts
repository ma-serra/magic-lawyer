import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getTenantBrandingByHost } from "@/lib/tenant-branding";

export async function GET() {
  try {
    const headersList = await headers();
    const host = headersList.get("host") || "";

    const branding = await getTenantBrandingByHost(host);

    if (!branding) {
      return NextResponse.json({ success: false, data: null });
    }

    return NextResponse.json({ success: true, data: branding });
  } catch (error) {
    console.error("[api/tenant-branding] erro:", error);
    return NextResponse.json(
      { success: false, data: null, error: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
