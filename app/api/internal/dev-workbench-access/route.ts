import { NextResponse } from "next/server";

import { canCurrentUserAccessDevWorkbench } from "@/app/lib/dev-workbench-access";

export const dynamic = "force-dynamic";

export async function GET() {
  const enabled = await canCurrentUserAccessDevWorkbench();

  return NextResponse.json(
    { enabled },
    {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
      },
    },
  );
}
