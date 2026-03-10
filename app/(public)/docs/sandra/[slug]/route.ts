import { readFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

const DOCUMENT_MAP: Record<string, { fileName: string; contentType: string }> = {
  "CONTRATO_DE_HONORARIOS_2.pdf": {
    fileName: "CONTRATO DE HONORARIOS 2.pdf",
    contentType: "application/pdf",
  },
  "PROCESSO_8154973_guarda.pdf": {
    fileName:
      "PROCESSO_ 8154973-16.2024.8.05.0001 - GUARDA DE FAMÍLIA - 8154973-16.2024.8.05.0001-1751908354604-1542966-processo.pdf",
    contentType: "application/pdf",
  },
  "PROCESSO_8155658_uniao_estavel.pdf": {
    fileName:
      "PROCESSO_ 8155658-23.2024.8.05.0001 - RECONHECIMENTO E EXTINÇÃO DE UNIÃO ESTÁVEL - 8155658-23.2024.8.05.0001-1751908345011-1542966-processo.pdf",
    contentType: "application/pdf",
  },
  "PROCESSO_8155723_medidas_protetivas.pdf": {
    fileName:
      "PROCESSO_ 8155723-18.2024.8.05.0001 - MEDIDAS PROTETIVAS DE URGÊNCIA (LEI MARIA DA PENHA) - CRIMINAL - 8155723-18.2024.8.05.0001-1751908372237-1542966-processo.pdf",
    contentType: "application/pdf",
  },
  "PROCURACAO_ROBSON_assinado.pdf": {
    fileName: "PROCURACAO_ROBSON_assinado.pdf",
    contentType: "application/pdf",
  },
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const document = DOCUMENT_MAP[slug];

  if (!document) {
    return NextResponse.json({ error: "Documento nao encontrado" }, { status: 404 });
  }

  try {
    const filePath = path.join(process.cwd(), "contratoreal", document.fileName);
    const buffer = await readFile(filePath);

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": document.contentType,
        "Content-Disposition": `inline; filename="${slug}"`,
        "Cache-Control": "private, max-age=0, must-revalidate",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Arquivo indisponivel no storage local" },
      { status: 404 },
    );
  }
}
