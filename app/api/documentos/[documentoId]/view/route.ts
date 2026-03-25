import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma";

import { getSession } from "@/app/lib/auth";
import prisma from "@/app/lib/prisma";
import { getAccessibleAdvogadoIds } from "@/app/lib/advogado-access";
import { checkPermission } from "@/app/actions/equipe";
import logger from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const DOCUMENT_VERSION_SOFT_DELETE_MARKER = "[SOFT_DELETED_VERSION]";

function getActiveDocumentoVersaoWhere(): Prisma.DocumentoVersaoWhereInput {
  return {
    OR: [
      {
        observacoes: null,
      },
      {
        observacoes: {
          not: {
            startsWith: DOCUMENT_VERSION_SOFT_DELETE_MARKER,
          },
        },
      },
    ],
  };
}

function isPrivilegedRole(role?: string | null): boolean {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

function sanitizeFileName(value: string): string {
  const cleaned = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w.\-()\s]/g, "")
    .trim();

  return cleaned.length ? cleaned : "documento";
}

function resolveSourceUrl(sourceUrl: string, request: NextRequest): string {
  if (/^https?:\/\//i.test(sourceUrl)) {
    return sourceUrl;
  }

  return new URL(sourceUrl, request.nextUrl.origin).toString();
}

function isAllowedDocumentSource(url: string, request: NextRequest): boolean {
  try {
    const parsed = new URL(url);

    if (!["http:", "https:"].includes(parsed.protocol)) {
      return false;
    }

    if (parsed.origin === request.nextUrl.origin) {
      return true;
    }

    const hostname = parsed.hostname.toLowerCase();

    return (
      hostname === "res.cloudinary.com" ||
      hostname.endsWith(".cloudinary.com")
    );
  } catch {
    return false;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ documentoId: string }> },
) {
  try {
    const { documentoId } = await params;
    const session = await getSession();

    if (!session?.user?.id || !session.user.tenantId) {
      return NextResponse.json(
        { success: false, error: "Não autorizado" },
        { status: 401 },
      );
    }

    const role = session.user.role ?? null;
    const canViewDocumentos = isPrivilegedRole(role)
      ? true
      : await checkPermission("documentos", "visualizar");

    if (!canViewDocumentos) {
      return NextResponse.json(
        { success: false, error: "Sem permissão para visualizar documentos" },
        { status: 403 },
      );
    }

    const isClienteRole = role === "CLIENTE";
    let documentoWhere: Prisma.DocumentoWhereInput = {
      id: documentoId,
      tenantId: session.user.tenantId,
      deletedAt: null,
      ...(isClienteRole
        ? { visivelParaCliente: true }
        : { visivelParaEquipe: true }),
    };

    if (!isPrivilegedRole(role)) {
      if (isClienteRole) {
        const cliente = await prisma.cliente.findFirst({
          where: {
            usuarioId: session.user.id,
            tenantId: session.user.tenantId,
            deletedAt: null,
          },
          select: { id: true },
        });

        if (!cliente) {
          return NextResponse.json(
            { success: false, error: "Cliente não encontrado" },
            { status: 404 },
          );
        }

        documentoWhere = {
          AND: [
            documentoWhere,
            {
              OR: [
                { clienteId: cliente.id },
                { processo: { clienteId: cliente.id } },
              ],
            },
          ],
        };
      } else {
        const accessibleAdvogados = await getAccessibleAdvogadoIds(session);
        const advogadoScope: Prisma.ClienteWhereInput = {
          advogadoClientes: {
            some: {
              advogadoId: {
                in: accessibleAdvogados,
              },
            },
          },
        };

        documentoWhere = {
          AND: [
            documentoWhere,
            {
              OR: [
                { cliente: advogadoScope },
                { processo: { cliente: advogadoScope } },
              ],
            },
          ],
        };
      }
    }

    const documento = await prisma.documento.findFirst({
      where: documentoWhere,
      select: {
        id: true,
        nome: true,
        url: true,
        contentType: true,
      },
    });

    if (!documento) {
      return NextResponse.json(
        { success: false, error: "Documento não encontrado" },
        { status: 404 },
      );
    }

    const versaoId = request.nextUrl.searchParams.get("versaoId");
    const download = request.nextUrl.searchParams.get("download") === "1";
    const versao = versaoId
      ? await prisma.documentoVersao.findFirst({
          where: {
            id: versaoId,
            documentoId: documento.id,
            tenantId: session.user.tenantId,
            ...getActiveDocumentoVersaoWhere(),
          },
          select: {
            id: true,
            url: true,
          },
        })
      : null;

    if (versaoId && !versao) {
      return NextResponse.json(
        { success: false, error: "Versão não encontrada" },
        { status: 404 },
      );
    }

    const sourceUrl = resolveSourceUrl(versao?.url || documento.url, request);
    if (!isAllowedDocumentSource(sourceUrl, request)) {
      logger.warn("URL de documento bloqueada por política de segurança", {
        documentoId: documento.id,
        versaoId: versao?.id,
      });

      return NextResponse.json(
        {
          success: false,
          error: "Origem de arquivo não permitida",
        },
        { status: 403 },
      );
    }

    const upstreamResponse = await fetch(sourceUrl, {
      cache: "no-store",
      redirect: "follow",
    });

    if (!upstreamResponse.ok || !upstreamResponse.body) {
      logger.warn("Falha ao carregar documento para proxy seguro", {
        documentoId: documento.id,
        versaoId: versao?.id,
        status: upstreamResponse.status,
      });

      return NextResponse.json(
        {
          success: false,
          error: "Não foi possível carregar o arquivo no momento",
        },
        { status: 502 },
      );
    }

    const fileName = sanitizeFileName(documento.nome);
    const headers = new Headers();
    headers.set(
      "Content-Type",
      upstreamResponse.headers.get("Content-Type") ||
        documento.contentType ||
        "application/octet-stream",
    );
    const contentLength = upstreamResponse.headers.get("Content-Length");
    if (contentLength) {
      headers.set("Content-Length", contentLength);
    }
    headers.set(
      "Content-Disposition",
      `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    );
    headers.set("Cache-Control", "private, no-store, max-age=0");
    headers.set("X-Robots-Tag", "noindex, nofollow");
    headers.set("X-Content-Type-Options", "nosniff");

    return new NextResponse(upstreamResponse.body, {
      status: 200,
      headers,
    });
  } catch (error) {
    logger.error("Erro ao visualizar documento com acesso seguro", error);

    return NextResponse.json(
      { success: false, error: "Erro interno ao carregar documento" },
      { status: 500 },
    );
  }
}
