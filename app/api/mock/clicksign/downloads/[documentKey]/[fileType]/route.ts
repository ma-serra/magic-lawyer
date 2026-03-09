import { NextResponse } from "next/server";

import { getMockClicksignDownload } from "@/app/lib/clicksign";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{
    documentKey: string;
    fileType: string;
  }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const { documentKey, fileType } = await context.params;

  if (fileType !== "original" && fileType !== "signed") {
    return NextResponse.json(
      { error: "Tipo de arquivo mock inválido" },
      { status: 404 },
    );
  }

  const file = getMockClicksignDownload(documentKey, fileType);

  if (!file) {
    return NextResponse.json(
      { error: "Arquivo mock não encontrado" },
      { status: 404 },
    );
  }

  const filename = file.filename.toLowerCase().endsWith(".pdf")
    ? file.filename
    : `${file.filename}.pdf`;

  return new NextResponse(Buffer.from(file.contentBase64, "base64"), {
    headers: {
      "cache-control": "no-store",
      "content-disposition": `inline; filename="${filename}"`,
      "content-type": file.contentType,
    },
  });
}
