import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

import { getSession } from "@/app/lib/auth";
import prisma from "@/app/lib/prisma";
import { UploadService } from "@/lib/upload-service";

const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
  "image/x-icon",
  "image/vnd.microsoft.icon",
]);

const SHARP_SUPPORTED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/x-icon",
  "image/vnd.microsoft.icon",
]);

const MAX_SIZE_BY_KIND = {
  logo: 4 * 1024 * 1024,
  favicon: 1 * 1024 * 1024,
} as const;

type BrandingKind = keyof typeof MAX_SIZE_BY_KIND;

function isBrandingKind(value: string): value is BrandingKind {
  return value === "logo" || value === "favicon";
}

async function optimizeBrandingImage(
  buffer: Buffer,
  kind: BrandingKind,
  mimeType: string,
): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
  if (!SHARP_SUPPORTED_MIME_TYPES.has(mimeType)) {
    return {
      buffer,
      mimeType,
      fileName: kind === "logo" ? "logo-original" : "favicon-original",
    };
  }

  const image = sharp(buffer, { failOn: "none" });

  if (kind === "logo") {
    const optimized = await image
      .rotate()
      .resize({
        width: 1400,
        height: 420,
        fit: "inside",
        withoutEnlargement: true,
      })
      .png({ compressionLevel: 9 })
      .toBuffer();

    return {
      buffer: optimized,
      mimeType: "image/png",
      fileName: "logo.png",
    };
  }

  const optimized = await image
    .rotate()
    .resize({
      width: 256,
      height: 256,
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      withoutEnlargement: false,
    })
    .png({ compressionLevel: 9 })
    .toBuffer();

  return {
    buffer: optimized,
    mimeType: "image/png",
    fileName: "favicon.png",
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  try {
    const session = await getSession();

    if (!session?.user?.id || session.user.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { success: false, error: "Somente super admins podem enviar branding aqui." },
        { status: 403 },
      );
    }

    const { tenantId } = await params;

    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: "Tenant inválido." },
        { status: 400 },
      );
    }

    const formData = await request.formData();
    const kindRaw = formData.get("kind");
    const file = formData.get("file");

    if (typeof kindRaw !== "string" || !isBrandingKind(kindRaw)) {
      return NextResponse.json(
        { success: false, error: "Tipo de upload inválido." },
        { status: 400 },
      );
    }

    if (!(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: "Arquivo não informado." },
        { status: 400 },
      );
    }

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json(
        {
          success: false,
          error: "Formato inválido. Use PNG, JPG, WEBP, SVG ou ICO para branding.",
        },
        { status: 400 },
      );
    }

    const maxSize = MAX_SIZE_BY_KIND[kindRaw];
    if (file.size > maxSize) {
      return NextResponse.json(
        {
          success: false,
          error: `Arquivo excede o limite de ${Math.floor(maxSize / (1024 * 1024))}MB para ${kindRaw}.`,
        },
        { status: 400 },
      );
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { slug: true },
    });

    if (!tenant?.slug) {
      return NextResponse.json(
        { success: false, error: "Tenant não encontrado." },
        { status: 404 },
      );
    }

    const bytes = await file.arrayBuffer();
    const rawBuffer = Buffer.from(bytes);

    let optimizedFile: { buffer: Buffer; mimeType: string; fileName: string };
    try {
      optimizedFile = await optimizeBrandingImage(rawBuffer, kindRaw, file.type);
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: "Não foi possível processar a imagem enviada. Use PNG, JPG, WEBP ou SVG.",
        },
        { status: 400 },
      );
    }

    const uploadService = UploadService.getInstance();
    const result = await uploadService.uploadStructuredDocument(
      optimizedFile.buffer,
      session.user.id,
      optimizedFile.fileName,
      {
        tenantSlug: tenant.slug,
        categoria: "outros",
        subpastas: ["branding", kindRaw],
        fileName: `${kindRaw}-${tenant.slug}`,
        resourceType: "auto",
        contentType: optimizedFile.mimeType,
        tags: ["branding", kindRaw, tenant.slug],
      },
    );

    if (!result.success || !result.url) {
      return NextResponse.json(
        { success: false, error: result.error || "Falha no upload." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        url: result.url,
        kind: kindRaw,
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Erro interno ao fazer upload do branding." },
      { status: 500 },
    );
  }
}
