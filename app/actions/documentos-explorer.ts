"use server";

import type {
  Prisma,
  Documento,
  DocumentoVersao,
} from "@/generated/prisma";

import { revalidatePath } from "next/cache";

import { getSession } from "@/app/lib/auth";
import { HybridNotificationService } from "@/app/lib/notifications/hybrid-notification-service";
import prisma from "@/app/lib/prisma";
import { UploadService, CloudinaryFolderNode } from "@/lib/upload-service";
import logger from "@/lib/logger";
import { DocumentNotifier } from "@/app/lib/notifications/document-notifier";
import { checkPermission } from "@/app/actions/equipe";

export interface DocumentExplorerFile {
  id: string;
  documentoId: string;
  versaoId?: string;
  nome: string;
  fileName: string;
  url: string;
  contentType: string | null;
  tamanhoBytes: number | null;
  uploadedAt: string;
  uploadedBy?: {
    id: string | null;
    nome: string | null;
    email?: string | null;
  };
  visivelParaCliente: boolean;
  cloudinaryPublicId?: string | null;
  folderSegments: string[];
  folderPath: string;
  versionNumber?: number;
  metadata?: Record<string, any> | null;
}

export interface DocumentExplorerProcess {
  id: string;
  numero: string;
  titulo: string | null;
  status: string;
  fase: string | null;
  createdAt: string;
  updatedAt: string;
  documentos: DocumentExplorerFile[];
  folderTree: CloudinaryFolderNode | null;
  causas: Array<{
    id: string;
    nome: string;
    principal: boolean;
  }>;
  counts: {
    documentos: number;
    arquivos: number;
  };
}

export interface DocumentExplorerContrato {
  id: string;
  titulo: string;
  status: string;
  processoId?: string | null;
}

export interface DocumentExplorerCatalogoCausa {
  id: string;
  nome: string;
  codigoCnj?: string | null;
}

export interface DocumentExplorerCatalogoRegime {
  id: string;
  nome: string;
  tipo: string;
  contarDiasUteis: boolean;
}

export interface DocumentExplorerCliente {
  id: string;
  nome: string;
  documento: string | null;
  email: string | null;
  telefone: string | null;
  createdAt: string;
  processos: DocumentExplorerProcess[];
  documentosGerais: DocumentExplorerFile[];
  documentosGeraisTree: CloudinaryFolderNode | null;
  contratos: DocumentExplorerContrato[];
  counts: {
    processos: number;
    documentos: number;
    arquivos: number;
  };
}

export interface DocumentExplorerData {
  tenantId: string;
  tenantSlug: string;
  generatedAt: string;
  clientes: DocumentExplorerCliente[];
  catalogos: {
    causas: DocumentExplorerCatalogoCausa[];
    regimesPrazo: DocumentExplorerCatalogoRegime[];
  };
  totals: {
    clientes: number;
    processos: number;
    documentos: number;
    arquivos: number;
  };
}

export interface DocumentExplorerClienteSummary {
  id: string;
  nome: string;
  documento: string | null;
  email: string | null;
  telefone: string | null;
  processos: number;
}

interface SessionUser {
  id: string;
  tenantId: string;
  tenantSlug: string;
  role: string;
}

interface CreateFolderInput {
  clienteId: string;
  processoId: string;
  parentSegments: string[];
  nomePasta: string;
}

interface RenameFolderInput {
  clienteId: string;
  processoId: string;
  currentSegments: string[];
  novoNome: string;
}

interface DeleteFolderInput {
  clienteId: string;
  processoId: string;
  targetSegments: string[];
}

interface DeleteFileInput {
  documentoId: string;
  versaoId?: string;
}

interface DocumentExplorerLoadOptions {
  processoIdForTree?: string | null;
  includeCloudinaryTree?: boolean;
  processosPage?: number;
  processosPageSize?: number;
}

type ExplorerPermissionAction = "visualizar" | "criar" | "editar" | "excluir";

interface ExplorerAccessScope {
  clienteFilter?: Prisma.ClienteWhereInput;
  processoFilter?: Prisma.ProcessoWhereInput;
  documentoFilter?: Prisma.DocumentoWhereInput;
}

type UploadFileCategory = "document" | "image" | "audio" | "video";

const UPLOAD_MAX_BYTES_BY_CATEGORY: Record<UploadFileCategory, number> = {
  document: 25 * 1024 * 1024,
  image: 25 * 1024 * 1024,
  audio: 50 * 1024 * 1024,
  video: 100 * 1024 * 1024,
};

const ALLOWED_UPLOAD_EXTENSIONS = new Set([
  "pdf",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "tif",
  "tiff",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "csv",
  "txt",
  "rtf",
  "odt",
  "ods",
  "ppt",
  "pptx",
  "zip",
  "7z",
  "rar",
  "mp3",
  "wav",
  "ogg",
  "m4a",
  "aac",
  "flac",
  "wma",
  "opus",
  "mp4",
  "mov",
  "avi",
  "mkv",
  "webm",
  "mpeg",
  "mpg",
  "m4v",
]);

const ALLOWED_UPLOAD_MIME_PREFIXES = [
  "application/pdf",
  "image/",
  "audio/",
  "video/",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "application/vnd.oasis.opendocument",
  "application/rtf",
  "application/zip",
  "application/x-7z-compressed",
  "application/x-rar-compressed",
];

const IMAGE_UPLOAD_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "tif",
  "tiff",
]);
const AUDIO_UPLOAD_EXTENSIONS = new Set([
  "mp3",
  "wav",
  "ogg",
  "m4a",
  "aac",
  "flac",
  "wma",
  "opus",
]);
const VIDEO_UPLOAD_EXTENSIONS = new Set([
  "mp4",
  "mov",
  "avi",
  "mkv",
  "webm",
  "mpeg",
  "mpg",
  "m4v",
]);
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

function buildDocumentoVersaoSoftDeletePayload() {
  return {
    observacoes: `${DOCUMENT_VERSION_SOFT_DELETE_MARKER} ${new Date().toISOString()}`,
  };
}

function resolveUploadFileCategory(
  extension: string,
  mimeType: string,
): UploadFileCategory | null {
  if (mimeType === "application/pdf" || extension === "pdf") {
    return "document";
  }

  if (
    mimeType.startsWith("image/") ||
    IMAGE_UPLOAD_EXTENSIONS.has(extension)
  ) {
    return "image";
  }

  if (
    mimeType.startsWith("audio/") ||
    AUDIO_UPLOAD_EXTENSIONS.has(extension)
  ) {
    return "audio";
  }

  if (
    mimeType.startsWith("video/") ||
    VIDEO_UPLOAD_EXTENSIONS.has(extension)
  ) {
    return "video";
  }

  if (
    extension &&
    ALLOWED_UPLOAD_EXTENSIONS.has(extension)
  ) {
    return "document";
  }

  return null;
}

function formatUploadLimit(limitInBytes: number): string {
  return `${Math.round(limitInBytes / (1024 * 1024))}MB`;
}

function getUploadCategoryLabel(category: UploadFileCategory): string {
  switch (category) {
    case "image":
      return "imagem";
    case "audio":
      return "áudio";
    case "video":
      return "vídeo";
    case "document":
    default:
      return "documento";
  }
}

function isPrivilegedRole(role: string): boolean {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

async function hasExplorerPermission(
  user: SessionUser,
  action: ExplorerPermissionAction,
): Promise<boolean> {
  if (isPrivilegedRole(user.role)) {
    return true;
  }

  return checkPermission("documentos", action);
}

async function getExplorerAccessScope(
  session: { user: any },
  user: SessionUser,
): Promise<{ success: true; scope: ExplorerAccessScope } | { success: false; error: string }> {
  if (isPrivilegedRole(user.role)) {
    return { success: true, scope: {} };
  }

  if (user.role === "CLIENTE") {
    const clienteId = await getClienteIdFromSession(session);

    if (!clienteId) {
      return { success: false, error: "Cliente não encontrado" };
    }

    return {
      success: true,
      scope: {
        clienteFilter: { id: clienteId },
        processoFilter: { clienteId },
        documentoFilter: {
          OR: [{ clienteId }, { processo: { clienteId } }],
        },
      },
    };
  }

  const { getAccessibleAdvogadoIds } = await import("@/app/lib/advogado-access");
  const accessibleAdvogados = await getAccessibleAdvogadoIds(session);
  const advogadoScopeFilter: Prisma.ClienteWhereInput = {
    advogadoClientes: {
      some: {
        advogadoId: {
          in: accessibleAdvogados,
        },
      },
    },
  };

  return {
    success: true,
    scope: {
      clienteFilter: advogadoScopeFilter,
      processoFilter: { cliente: advogadoScopeFilter },
      documentoFilter: {
        OR: [
          { cliente: advogadoScopeFilter },
          { processo: { cliente: advogadoScopeFilter } },
        ],
      },
    },
  };
}

function sanitizeSegment(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}

function getFileNameFromUrl(url: string): string {
  try {
    const base = url.split("/").pop() || "";

    return decodeURIComponent(base.split("?")[0]);
  } catch {
    return url;
  }
}

function extractPublicIdFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    const uploadIndex = segments.findIndex((segment) => segment === "upload");

    if (uploadIndex === -1) return null;

    const publicIdSegments = segments.slice(uploadIndex + 2); // skip version

    if (!publicIdSegments.length) return null;

    const last = publicIdSegments[publicIdSegments.length - 1];
    const withoutExtension = last.split(".")[0];

    publicIdSegments[publicIdSegments.length - 1] = withoutExtension;

    return publicIdSegments.join("/");
  } catch (error) {
    logger.warn("Não foi possível extrair public_id da URL", { url, error });

    return null;
  }
}

function normalizeFolderSegments(
  tenantSlug: string,
  publicId: string | null | undefined,
): string[] {
  if (!publicId) return [];

  const segments = publicId.split("/");

  if (segments[0] === "magiclawyer") {
    segments.shift();
  }

  if (segments[0] === tenantSlug) {
    segments.shift();
  }

  // Remover nome de arquivo
  segments.pop();

  return segments;
}

async function getAdvogadoIdFromSession(session: { user: any } | null) {
  if (!session?.user?.id || !session?.user?.tenantId) return null;

  const advogado = await prisma.advogado.findFirst({
    where: {
      usuarioId: session.user.id,
      tenantId: session.user.tenantId,
    },
    select: { id: true },
  });

  return advogado?.id || null;
}

async function getClienteIdFromSession(session: { user: any } | null) {
  if (!session?.user?.id || !session?.user?.tenantId) return null;

  const cliente = await prisma.cliente.findFirst({
    where: {
      usuarioId: session.user.id,
      tenantId: session.user.tenantId,
      deletedAt: null,
    },
    select: { id: true },
  });

  return cliente?.id || null;
}

function buildProcessFolderBase(
  tenantSlug: string,
  cliente: { id: string; nome: string },
  processo: { id: string; numero: string },
) {
  const clienteSegment = `${sanitizeSegment(cliente.nome)}-${cliente.id}`;
  const processoSegment = `${sanitizeSegment(processo.numero)}-${processo.id}`;

  return `magiclawyer/${tenantSlug}/clientes/${clienteSegment}/processos/${processoSegment}`;
}

function buildClienteDocumentFolder(
  tenantSlug: string,
  cliente: { id: string; nome: string },
) {
  const clienteSegment = `${sanitizeSegment(cliente.nome)}-${cliente.id}`;

  return `magiclawyer/${tenantSlug}/clientes/${clienteSegment}/documentos`;
}

function isCloudinaryUrl(url: string | null | undefined): boolean {
  if (!url) return false;

  try {
    const { hostname } = new URL(url);

    return (
      hostname.includes("cloudinary.com") ||
      hostname.includes("res.cloudinary.com")
    );
  } catch {
    return false;
  }
}

function mapDocumentoToFiles(
  documento: Documento & {
    versoes: DocumentoVersao[];
    uploadedBy?: {
      id: string | null;
      firstName: string | null;
      lastName: string | null;
      email: string | null;
    } | null;
  },
  tenantSlug: string,
  options?: {
    includeUploaderEmail?: boolean;
  },
): DocumentExplorerFile[] {
  const includeUploaderEmail = options?.includeUploaderEmail ?? true;
  const versions =
    documento.versoes && documento.versoes.length > 0
      ? documento.versoes.filter(
          (versao) =>
            !versao.observacoes?.startsWith(DOCUMENT_VERSION_SOFT_DELETE_MARKER),
        )
      : [null];

  return versions.map((versao) => {
    const publicId =
      versao?.cloudinaryPublicId ||
      (documento.metadados as any)?.cloudinaryPublicId ||
      (isCloudinaryUrl(versao?.url || documento.url)
        ? extractPublicIdFromUrl(versao?.url || documento.url)
        : null);

    const folderSegments = normalizeFolderSegments(
      tenantSlug,
      publicId || undefined,
    );
    const fileUrl = versao?.url || documento.url;
    const fileName = versao
      ? getFileNameFromUrl(versao.url)
      : getFileNameFromUrl(documento.url);

    const nomeArquivo =
      versao?.numeroVersao && versao.numeroVersao > 1
        ? `${documento.nome} (v${versao.numeroVersao})`
        : documento.nome;
    const secureFileUrl = versao?.id
      ? `/api/documentos/${documento.id}/view?versaoId=${encodeURIComponent(versao.id)}`
      : `/api/documentos/${documento.id}/view`;

    return {
      id: versao?.id ?? documento.id,
      documentoId: documento.id,
      versaoId: versao?.id,
      nome: nomeArquivo,
      fileName,
      url: secureFileUrl,
      contentType: documento.contentType || null,
      tamanhoBytes: documento.tamanhoBytes ?? null,
      uploadedAt: (versao?.createdAt || documento.createdAt).toISOString(),
      uploadedBy: documento.uploadedBy
        ? {
            id: documento.uploadedBy.id,
            nome:
              [documento.uploadedBy.firstName, documento.uploadedBy.lastName]
                .filter(Boolean)
                .join(" ") || null,
            email: includeUploaderEmail ? documento.uploadedBy.email : null,
          }
        : undefined,
      visivelParaCliente: documento.visivelParaCliente,
      cloudinaryPublicId: publicId,
      folderSegments,
      folderPath: folderSegments.join("/"),
      versionNumber: versao?.numeroVersao,
      metadata: {
        origem: (documento as any).origem ?? undefined,
        visivel: documento.visivelParaCliente,
      },
    } satisfies DocumentExplorerFile;
  });
}

export async function getDocumentExplorerClientes(): Promise<{
  success: boolean;
  data?: DocumentExplorerClienteSummary[];
  error?: string;
}> {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any as SessionUser;

    if (!user.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    const canViewDocumentos = await hasExplorerPermission(user, "visualizar");
    if (!canViewDocumentos) {
      return {
        success: false,
        error: "Sem permissão para visualizar documentos",
      };
    }

    const accessScopeResult = await getExplorerAccessScope(session, user);
    if (!accessScopeResult.success) {
      return { success: false, error: accessScopeResult.error };
    }

    let whereCliente: Prisma.ClienteWhereInput = {
      tenantId: user.tenantId,
      deletedAt: null,
    };

    if (accessScopeResult.scope.clienteFilter) {
      whereCliente = {
        AND: [whereCliente, accessScopeResult.scope.clienteFilter],
      };
    }

    const clientes = await prisma.cliente.findMany({
      where: whereCliente,
      select: {
        id: true,
        nome: true,
        documento: true,
        email: true,
        telefone: true,
        _count: {
          select: {
            processos: { where: { deletedAt: null } },
          },
        },
      },
      orderBy: { nome: "asc" },
    });

    const summaries: DocumentExplorerClienteSummary[] = clientes.map(
      (cliente) => ({
        id: cliente.id,
        nome: cliente.nome,
        documento: cliente.documento,
        email: cliente.email,
        telefone: cliente.telefone,
        processos: cliente._count.processos,
      }),
    );

    return { success: true, data: summaries };
  } catch (error) {
    logger.error("Erro ao listar clientes para explorer:", error);
    return { success: false, error: "Erro ao carregar clientes" };
  }
}

export async function getDocumentExplorerData(
  clienteId?: string,
  options: DocumentExplorerLoadOptions = {},
): Promise<{
  success: boolean;
  data?: DocumentExplorerData;
  error?: string;
}> {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any as SessionUser;

    if (!user.tenantId || !user.tenantSlug) {
      return { success: false, error: "Tenant não encontrado" };
    }

    const canViewDocumentos = await hasExplorerPermission(user, "visualizar");
    if (!canViewDocumentos) {
      return {
        success: false,
        error: "Sem permissão para visualizar documentos",
      };
    }

    const accessScopeResult = await getExplorerAccessScope(session, user);
    if (!accessScopeResult.success) {
      return { success: false, error: accessScopeResult.error };
    }

    const isClientRole = user.role === "CLIENTE";
    const includeCloudinaryTree = options.includeCloudinaryTree ?? true;
    const selectedProcessoForTree = options.processoIdForTree ?? null;
    const processosPage = Math.max(1, options.processosPage ?? 1);
    const processosPageSize = Math.max(
      5,
      Math.min(100, options.processosPageSize ?? 20),
    );
    const processosSkip = (processosPage - 1) * processosPageSize;
    const canManageUpload = await hasExplorerPermission(user, "criar");
    const documentoVisibilidadeWhere: Prisma.DocumentoWhereInput = isClientRole
      ? {
          deletedAt: null,
          visivelParaCliente: true,
        }
      : {
          deletedAt: null,
          visivelParaEquipe: true,
        };

    let whereCliente: Prisma.ClienteWhereInput = clienteId
      ? { tenantId: user.tenantId, id: clienteId, deletedAt: null }
      : {
          tenantId: user.tenantId,
          deletedAt: null,
        };

    if (accessScopeResult.scope.clienteFilter) {
      whereCliente = {
        AND: [whereCliente, accessScopeResult.scope.clienteFilter],
      };
    }

    const [clientes, causasCatalogo, regimesCatalogo] = await Promise.all([
      prisma.cliente.findMany({
        where: whereCliente,
        include: {
          processos: {
            where: { deletedAt: null },
            include: {
              causasVinculadas: {
                include: {
                  causa: {
                    select: {
                      id: true,
                      nome: true,
                    },
                  },
                },
              },
              _count: {
                select: {
                  documentos: { where: documentoVisibilidadeWhere },
                },
              },
            },
            orderBy: {
              createdAt: "desc",
            },
            skip: processosSkip,
            take: processosPageSize,
          },
          documentos: {
            where: {
              ...documentoVisibilidadeWhere,
              processoId: null,
            },
            include: {
              versoes: {
                where: getActiveDocumentoVersaoWhere(),
                orderBy: {
                  numeroVersao: "desc",
                },
                take: 1,
              },
              uploadedBy: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                },
              },
            },
            orderBy: {
              createdAt: "desc",
            },
          },
          contratos: canManageUpload
            ? {
                where: { deletedAt: null },
                select: {
                  id: true,
                  titulo: true,
                  status: true,
                  processoId: true,
                },
                orderBy: {
                  createdAt: "desc",
                },
              }
            : false,
          _count: {
            select: {
              processos: { where: { deletedAt: null } },
              documentos: { where: documentoVisibilidadeWhere },
            },
          },
        },
        orderBy: {
          nome: "asc",
        },
      }),
      canManageUpload
        ? prisma.causa.findMany({
            where: {
              tenantId: user.tenantId,
              ativo: true,
            },
            orderBy: {
              nome: "asc",
            },
          })
        : Promise.resolve([]),
      canManageUpload
        ? prisma.regimePrazo.findMany({
            where: {
              OR: [{ tenantId: user.tenantId }, { tenantId: null }],
            },
            orderBy: {
              nome: "asc",
            },
          })
        : Promise.resolve([]),
    ]);

    if (clienteId && clientes.length === 0) {
      return {
        success: false,
        error: "Cliente não encontrado ou sem acesso autorizado",
      };
    }

    const uploadService = UploadService.getInstance();

    const clientesDto: DocumentExplorerCliente[] = [];

    let totalProcessos = 0;
    let totalDocumentos = 0;
    let totalArquivos = 0;
    let cloudinaryRateLimited = false;
    const includeUploaderEmail = !isClientRole;

    for (const cliente of clientes) {
      const processosDto: DocumentExplorerProcess[] = [];
      let clienteArquivos = 0;
      let clienteDocumentos = cliente.documentos.length;

      let documentosProcessoSelecionado: DocumentExplorerFile[] = [];
      if (
        selectedProcessoForTree &&
        cliente.processos.some((processo: any) => processo.id === selectedProcessoForTree)
      ) {
        const documentosSelecionados = await prisma.documento.findMany({
          where: {
            ...documentoVisibilidadeWhere,
            tenantId: user.tenantId,
            clienteId: cliente.id,
            OR: [
              { processoId: selectedProcessoForTree },
              {
                processosVinculados: {
                  some: {
                    processoId: selectedProcessoForTree,
                  },
                },
              },
            ],
          },
          include: {
            versoes: {
              where: getActiveDocumentoVersaoWhere(),
              orderBy: {
                numeroVersao: "desc",
              },
              take: 1,
            },
            uploadedBy: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        });

        documentosProcessoSelecionado = documentosSelecionados.flatMap(
          (documento) =>
            mapDocumentoToFiles(documento as any, user.tenantSlug, {
              includeUploaderEmail,
            }),
        );
      }

      for (const processo of cliente.processos) {
        const documentosProcesso =
          selectedProcessoForTree === processo.id
            ? documentosProcessoSelecionado
            : [];

        const baseFolder = buildProcessFolderBase(
          user.tenantSlug,
          { id: cliente.id, nome: cliente.nome },
          { id: processo.id, numero: processo.numero },
        );

        const shouldLoadTreeForProcess =
          includeCloudinaryTree && selectedProcessoForTree === processo.id;
        const folderTreeResult = shouldLoadTreeForProcess
          ? cloudinaryRateLimited
            ? {
                success: false,
                tree: null,
                error: "Limite da API do Cloudinary excedido",
              }
            : await uploadService.buildFolderTree(baseFolder)
          : { success: true, tree: null };

        if (folderTreeResult.error?.includes("Limite da API")) {
          cloudinaryRateLimited = true;
        }

        const causasProcesso =
          processo.causasVinculadas?.map((processoCausa: any) => ({
            id: processoCausa.causa.id,
            nome: processoCausa.causa.nome,
            principal: processoCausa.principal,
          })) ?? [];

        processosDto.push({
          id: processo.id,
          numero: processo.numero,
          titulo: processo.titulo,
          status: processo.status,
          fase: processo.fase,
          createdAt: processo.createdAt.toISOString(),
          updatedAt: processo.updatedAt.toISOString(),
          documentos: documentosProcesso,
          folderTree: folderTreeResult.success ? folderTreeResult.tree : null,
          causas: causasProcesso,
          counts: {
            documentos: processo._count?.documentos ?? 0,
            arquivos: processo._count?.documentos ?? 0,
          },
        });

        totalDocumentos += processo._count?.documentos ?? 0;
        totalArquivos += processo._count?.documentos ?? 0;
        clienteArquivos += processo._count?.documentos ?? 0;
        clienteDocumentos += processo._count?.documentos ?? 0;
      }

      totalProcessos += cliente._count?.processos ?? 0;

      const documentosGerais = cliente.documentos.flatMap((documento) =>
        mapDocumentoToFiles(documento as any, user.tenantSlug, {
          includeUploaderEmail,
        }),
      );

      clienteArquivos += documentosGerais.length;
      totalArquivos += documentosGerais.length;
      totalDocumentos += cliente.documentos.length;

      let documentosGeraisTree: CloudinaryFolderNode | null = null;
      const baseFolderCliente = buildClienteDocumentFolder(user.tenantSlug, {
        id: cliente.id,
        nome: cliente.nome,
      });
      const shouldLoadClienteTree = includeCloudinaryTree && !selectedProcessoForTree;

      if (shouldLoadClienteTree) {
        const treeResult = cloudinaryRateLimited
          ? {
              success: false,
              tree: null,
              error: "Limite da API do Cloudinary excedido",
            }
          : await uploadService.buildFolderTree(baseFolderCliente);

        if (treeResult.error?.includes("Limite da API")) {
          cloudinaryRateLimited = true;
        }

        if (treeResult.success) {
          documentosGeraisTree = treeResult.tree;
        }
      }

      clientesDto.push({
        id: cliente.id,
        nome: cliente.nome,
        documento: cliente.documento,
        email: cliente.email,
        telefone: cliente.telefone,
        createdAt: cliente.createdAt.toISOString(),
        processos: processosDto,
        documentosGerais,
        documentosGeraisTree,
        contratos: (cliente.contratos ?? []).map((contrato: any) => ({
          id: contrato.id,
          titulo: contrato.titulo,
          status: contrato.status,
          processoId: contrato.processoId,
        })),
        counts: {
          processos: cliente._count?.processos ?? 0,
          documentos: clienteDocumentos,
          arquivos: clienteArquivos,
        },
      });
    }

    const data: DocumentExplorerData = {
      tenantId: user.tenantId,
      tenantSlug: user.tenantSlug,
      generatedAt: new Date().toISOString(),
      clientes: clientesDto,
      catalogos: {
        causas: causasCatalogo.map((causa) => ({
          id: causa.id,
          nome: causa.nome,
          codigoCnj: causa.codigoCnj ?? undefined,
        })),
        regimesPrazo: regimesCatalogo.map((regime) => ({
          id: regime.id,
          nome: regime.nome,
          tipo: regime.tipo,
          contarDiasUteis: regime.contarDiasUteis,
        })),
      },
      totals: {
        clientes: clientesDto.length,
        processos: totalProcessos,
        documentos: totalDocumentos,
        arquivos: totalArquivos,
      },
    };

    return { success: true, data };
  } catch (error) {
    logger.error("Erro ao carregar dados do explorador de documentos:", error);

    return {
      success: false,
      error: "Erro ao carregar documentos",
    };
  }
}

export async function uploadDocumentoExplorer(
  clienteId: string,
  processoId: string | null,
  formData: FormData,
  options: {
    folderSegments?: string[];
    description?: string;
    visivelParaCliente?: boolean;
    allowedExtensions?: string[];
  } = {},
) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const rawSessionUser = session.user as any;
    const user = rawSessionUser as SessionUser;
    const uploaderDisplayName =
      `${rawSessionUser.firstName ?? ""} ${
        rawSessionUser.lastName ?? ""
      }`.trim() ||
      rawSessionUser.email ||
      rawSessionUser.id;

    if (!user.tenantId || !user.tenantSlug) {
      return { success: false, error: "Tenant não encontrado" };
    }

    const canUploadDocumentos = await hasExplorerPermission(user, "criar");
    if (!canUploadDocumentos) {
      return {
        success: false,
        error: "Sem permissão para enviar documentos",
      };
    }

    const accessScopeResult = await getExplorerAccessScope(session, user);
    if (!accessScopeResult.success) {
      return { success: false, error: accessScopeResult.error };
    }

    const file = formData.get("file");

    if (!(file instanceof File)) {
      return { success: false, error: "Arquivo não recebido" };
    }

    const fileExtension = file.name.split(".").pop()?.toLowerCase() || "";
    const normalizedMimeType = (file.type || "").toLowerCase();
    const extensionAllowed = ALLOWED_UPLOAD_EXTENSIONS.has(fileExtension);
    const mimeAllowed = ALLOWED_UPLOAD_MIME_PREFIXES.some((prefix) =>
      normalizedMimeType.startsWith(prefix),
    );

    if (!extensionAllowed && !mimeAllowed) {
      return {
        success: false,
        error:
          "Formato não suportado. Use PDF, imagem, áudio, vídeo ou documento de escritório.",
      };
    }

    const allowedExtensionsOverride = (options.allowedExtensions ?? [])
      .map((extension) => extension.trim().toLowerCase())
      .filter(Boolean);
    if (
      allowedExtensionsOverride.length > 0 &&
      !allowedExtensionsOverride.includes(fileExtension)
    ) {
      return {
        success: false,
        error:
          "Formato não permitido para este tipo de upload. Ajuste o arquivo e tente novamente.",
      };
    }

    const fileCategory = resolveUploadFileCategory(
      fileExtension,
      normalizedMimeType,
    );
    if (!fileCategory) {
      return {
        success: false,
        error:
          "Formato não suportado. Use PDF, imagem, áudio, vídeo ou documento de escritório.",
      };
    }

    const maxUploadBytes = UPLOAD_MAX_BYTES_BY_CATEGORY[fileCategory];
    if (file.size > maxUploadBytes) {
      return {
        success: false,
        error: `Arquivo excede o limite de ${formatUploadLimit(maxUploadBytes)} para ${getUploadCategoryLabel(fileCategory)}.`,
      };
    }

    let clienteWhere: Prisma.ClienteWhereInput = {
      id: clienteId,
      tenantId: user.tenantId,
      deletedAt: null,
    };
    if (accessScopeResult.scope.clienteFilter) {
      clienteWhere = {
        AND: [clienteWhere, accessScopeResult.scope.clienteFilter],
      };
    }
    const cliente = await prisma.cliente.findFirst({
      where: clienteWhere,
      select: { id: true, nome: true },
    });

    if (!cliente) {
      return { success: false, error: "Cliente não encontrado" };
    }

    const processoIdsRaw = formData
      .getAll("processoIds")
      .filter(
        (value): value is string =>
          typeof value === "string" && value.trim().length > 0,
      );

    if (processoId) {
      processoIdsRaw.push(processoId);
    }

    const processoIds = Array.from(new Set(processoIdsRaw));

    let processoWhere: Prisma.ProcessoWhereInput = {
      id: { in: processoIds },
      tenantId: user.tenantId,
      clienteId,
      deletedAt: null,
    };
    if (accessScopeResult.scope.processoFilter) {
      processoWhere = {
        AND: [processoWhere, accessScopeResult.scope.processoFilter],
      };
    }

    const processosRaw = processoIds.length
      ? await prisma.processo.findMany({
          where: processoWhere,
          select: {
            id: true,
            numero: true,
          },
        })
      : [];
    const processosById = new Map(processosRaw.map((processo) => [processo.id, processo]));
    const processos = processoIds
      .map((processoIdSelecionado) => processosById.get(processoIdSelecionado))
      .filter((processo): processo is { id: string; numero: string } => Boolean(processo));

    if (processoIds.length && processos.length !== processoIds.length) {
      return { success: false, error: "Processo selecionado inválido" };
    }

    const contratoIdsRaw = formData
      .getAll("contratoIds")
      .filter(
        (value): value is string =>
          typeof value === "string" && value.trim().length > 0,
      );

    const contratos = contratoIdsRaw.length
      ? await prisma.contrato.findMany({
          where: {
            id: { in: contratoIdsRaw },
            tenantId: user.tenantId,
            clienteId,
            deletedAt: null,
          },
          select: {
            id: true,
            titulo: true,
            processoId: true,
          },
        })
      : [];

    if (contratoIdsRaw.length && contratos.length !== contratoIdsRaw.length) {
      return { success: false, error: "Contrato selecionado inválido" };
    }

    const causaId = (formData.get("causaId") as string | null) || null;
    const causa = causaId
      ? await prisma.causa.findFirst({
          where: {
            id: causaId,
            tenantId: user.tenantId,
            ativo: true,
          },
          select: { id: true },
        })
      : null;

    if (causaId && !causa) {
      return { success: false, error: "Causa selecionada inválida" };
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const normalizedFolderSegments = (options.folderSegments || [])
      .map((segment) => sanitizeSegment(segment))
      .filter(Boolean);

    const uploadService = UploadService.getInstance();

    const uploadResult = await uploadService.uploadStructuredDocument(
      bytes,
      user.id,
      file.name,
      {
        tenantSlug: user.tenantSlug,
        categoria: "processo",
        cliente: {
          id: cliente.id,
          nome: cliente.nome,
        },
        processo: processos[0]
          ? {
              id: processos[0].id,
              numero: processos[0].numero,
            }
          : undefined,
        subpastas: normalizedFolderSegments,
        fileName: file.name,
        contentType: file.type,
        resourceType:
          fileCategory === "image"
            ? "image"
            : fileCategory === "video"
              ? "video"
              : "raw",
        tags: [
          "processo",
          ...(processos.length ? processos.map((proc) => proc.id) : []),
          cliente.id,
        ],
      },
    );

    if (!uploadResult.success || !uploadResult.publicId || !uploadResult.url) {
      return {
        success: false,
        error: uploadResult.error || "Erro ao fazer upload",
      };
    }

    const uploadedUrl = uploadResult.url;
    const uploadedPublicId = uploadResult.publicId;
    const uploadedFolderPath = uploadResult.folderPath;

    const primaryProcessoId = processos[0]?.id ?? null;
    const primaryContratoId = contratos[0]?.id ?? null;

    const isVisibleToClient =
      typeof options.visivelParaCliente === "boolean"
        ? options.visivelParaCliente
        : true;

    const documento = await prisma.$transaction(async (tx) => {
      const createdDocumento = await tx.documento.create({
        data: {
          tenantId: user.tenantId,
          nome: file.name,
          tipo: "processo",
          descricao: options.description,
          url: uploadedUrl,
          tamanhoBytes: file.size,
          contentType: file.type,
          processoId: primaryProcessoId,
          clienteId: cliente.id,
          contratoId: primaryContratoId,
          uploadedById: user.id,
          visivelParaCliente: isVisibleToClient,
          visivelParaEquipe: true,
          metadados: {
            folderPath: uploadedFolderPath,
            subpastas: normalizedFolderSegments,
            originalFileName: file.name,
            processos: processos.map((proc) => proc.id),
            contratos: contratos.map((contrato) => contrato.id),
            causaId: causa?.id ?? null,
          },
        },
      });

      await tx.documentoVersao.create({
        data: {
          tenantId: user.tenantId,
          documentoId: createdDocumento.id,
          numeroVersao: 1,
          cloudinaryPublicId: uploadedPublicId,
          url: uploadedUrl,
          uploadedById: user.id,
        },
      });

      if (processos.length) {
        await tx.processoDocumento.createMany({
          data: processos.map((proc) => ({
            tenantId: user.tenantId,
            processoId: proc.id,
            documentoId: createdDocumento.id,
            createdById: user.id,
            visivelParaCliente: isVisibleToClient,
          })),
          skipDuplicates: true,
        });
      }

      if (contratos.length) {
        await tx.contratoDocumento.createMany({
          data: contratos.map((contrato) => ({
            tenantId: user.tenantId,
            contratoId: contrato.id,
            documentoId: createdDocumento.id,
            processoId: primaryProcessoId ?? contrato.processoId ?? null,
            causaId: causa?.id ?? null,
          })),
          skipDuplicates: true,
        });
      }

      if (causa?.id && primaryProcessoId) {
        await tx.processoCausa.upsert({
          where: {
            processoId_causaId: {
              processoId: primaryProcessoId,
              causaId: causa.id,
            },
          },
          update: {},
          create: {
            tenantId: user.tenantId,
            processoId: primaryProcessoId,
            causaId: causa.id,
            principal: false,
          },
        });
      }

      return createdDocumento;
    });

    revalidatePath("/documentos");

    // Notificações: documento anexado em processo(s)
    try {
      if (processos.length) {
        const responsaveis = await prisma.processo.findMany({
          where: {
            id: { in: processos.map((p) => p.id) },
            tenantId: user.tenantId,
          },
          select: {
            id: true,
            numero: true,
            advogadoResponsavel: {
              select: { usuario: { select: { id: true } } },
            },
          },
        });

        for (const proc of responsaveis) {
          const targetUserId =
            (proc.advogadoResponsavel?.usuario as any)?.id ||
            (user.id as string);

          await HybridNotificationService.publishNotification({
            type: "processo.document_uploaded",
            tenantId: user.tenantId,
            userId: targetUserId,
            payload: {
              documentoId: documento.id,
              processoId: proc.id,
              numero: proc.numero,
              documentName: file.name,
              referenciaTipo: "documento",
              referenciaId: documento.id,
            },
            urgency: "MEDIUM",
            channels: ["REALTIME"],
          });
        }
      }
    } catch (e) {
      logger.warn("Falha ao emitir notificação de documento anexado", e);
    }

    try {
      await DocumentNotifier.notifyUploaded({
        tenantId: user.tenantId,
        documentoId: documento.id,
        nome: documento.nome,
        tipo: documento.tipo,
        tamanhoBytes: documento.tamanhoBytes,
        uploaderUserId: user.id,
        uploaderNome: uploaderDisplayName,
        processoIds: processos.map((proc) => proc.id),
        clienteId: cliente.id,
        visivelParaCliente: isVisibleToClient,
      });
    } catch (error) {
      logger.warn("Falha ao emitir notificações de documento.uploaded", error);
    }

    return {
      success: true,
      documentoId: documento.id,
      url: uploadResult.url,
    };
  } catch (error) {
    logger.error("Erro ao enviar documento pelo explorador:", error);

    return {
      success: false,
      error: "Erro ao enviar documento",
    };
  }
}

export async function createExplorerFolder(input: CreateFolderInput) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any as SessionUser;
    if (!user.tenantId || !user.tenantSlug) {
      return { success: false, error: "Tenant não encontrado" };
    }

    const canManageFolders = await hasExplorerPermission(user, "editar");
    if (!canManageFolders) {
      return {
        success: false,
        error: "Sem permissão para criar pastas",
      };
    }

    const accessScopeResult = await getExplorerAccessScope(session, user);
    if (!accessScopeResult.success) {
      return { success: false, error: accessScopeResult.error };
    }

    let clienteWhere: Prisma.ClienteWhereInput = {
      id: input.clienteId,
      tenantId: user.tenantId,
      deletedAt: null,
    };
    if (accessScopeResult.scope.clienteFilter) {
      clienteWhere = {
        AND: [clienteWhere, accessScopeResult.scope.clienteFilter],
      };
    }
    const cliente = await prisma.cliente.findFirst({
      where: clienteWhere,
      select: { id: true, nome: true },
    });

    let processoWhere: Prisma.ProcessoWhereInput = {
      id: input.processoId,
      tenantId: user.tenantId,
      clienteId: input.clienteId,
      deletedAt: null,
    };
    if (accessScopeResult.scope.processoFilter) {
      processoWhere = {
        AND: [processoWhere, accessScopeResult.scope.processoFilter],
      };
    }
    const processo = await prisma.processo.findFirst({
      where: processoWhere,
      select: { id: true, numero: true },
    });

    if (!cliente || !processo) {
      return { success: false, error: "Cliente ou processo não encontrado" };
    }

    const baseFolder = buildProcessFolderBase(
      user.tenantSlug,
      cliente,
      processo,
    );
    const nomePastaSegment = sanitizeSegment(input.nomePasta);

    if (!nomePastaSegment) {
      return { success: false, error: "Nome da pasta inválido" };
    }

    const parentSegments = (input.parentSegments || [])
      .map((segment) => sanitizeSegment(segment))
      .filter(Boolean);

    const fullPathSegments = [
      baseFolder,
      ...parentSegments,
      nomePastaSegment,
    ].filter(Boolean);

    const fullPath = fullPathSegments.join("/");

    const uploadService = UploadService.getInstance();
    const result = await uploadService.createFolder(fullPath);

    if (!result.success) {
      return { success: false, error: result.error || "Erro ao criar pasta" };
    }

    revalidatePath("/documentos");

    return {
      success: true,
      path: fullPath,
    };
  } catch (error) {
    logger.error("Erro ao criar pasta no explorador:", error);

    return {
      success: false,
      error: "Erro ao criar pasta",
    };
  }
}

export async function renameExplorerFolder(input: RenameFolderInput) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any as SessionUser;
    if (!user.tenantId || !user.tenantSlug) {
      return { success: false, error: "Tenant não encontrado" };
    }

    const canManageFolders = await hasExplorerPermission(user, "editar");
    if (!canManageFolders) {
      return {
        success: false,
        error: "Sem permissão para renomear pastas",
      };
    }

    const accessScopeResult = await getExplorerAccessScope(session, user);
    if (!accessScopeResult.success) {
      return { success: false, error: accessScopeResult.error };
    }

    let clienteWhere: Prisma.ClienteWhereInput = {
      id: input.clienteId,
      tenantId: user.tenantId,
      deletedAt: null,
    };
    if (accessScopeResult.scope.clienteFilter) {
      clienteWhere = {
        AND: [clienteWhere, accessScopeResult.scope.clienteFilter],
      };
    }
    const cliente = await prisma.cliente.findFirst({
      where: clienteWhere,
      select: { id: true, nome: true },
    });

    let processoWhere: Prisma.ProcessoWhereInput = {
      id: input.processoId,
      tenantId: user.tenantId,
      clienteId: input.clienteId,
      deletedAt: null,
    };
    if (accessScopeResult.scope.processoFilter) {
      processoWhere = {
        AND: [processoWhere, accessScopeResult.scope.processoFilter],
      };
    }
    const processo = await prisma.processo.findFirst({
      where: processoWhere,
      select: { id: true, numero: true },
    });

    if (!cliente || !processo) {
      return { success: false, error: "Cliente ou processo não encontrado" };
    }

    const baseFolder = buildProcessFolderBase(
      user.tenantSlug,
      cliente,
      processo,
    );

    const currentSegments = (input.currentSegments || [])
      .map((segment) => sanitizeSegment(segment))
      .filter(Boolean);

    if (!currentSegments.length) {
      return { success: false, error: "Selecione uma pasta para renomear" };
    }

    const oldPath = [baseFolder, ...currentSegments].join("/");
    const newPathSegments = [...currentSegments];
    const novoNomeSanitizado = sanitizeSegment(input.novoNome);

    if (!novoNomeSanitizado) {
      return { success: false, error: "Novo nome da pasta inválido" };
    }

    newPathSegments[newPathSegments.length - 1] = novoNomeSanitizado;
    const newPath = [baseFolder, ...newPathSegments].join("/");

    const uploadService = UploadService.getInstance();
    const renameResult = await uploadService.renameFolder(oldPath, newPath);

    if (!renameResult.success) {
      return {
        success: false,
        error: renameResult.error || "Erro ao renomear pasta",
      };
    }

    // Atualizar registros de documentos que contenham o prefixo antigo
    const publicIdPrefix = `${oldPath}/`;

    const versoesParaAtualizar = await prisma.documentoVersao.findMany({
      where: {
        tenantId: user.tenantId,
        ...getActiveDocumentoVersaoWhere(),
        cloudinaryPublicId: {
          startsWith: publicIdPrefix,
        },
      },
    });

    const documentosSemVersao = await prisma.documento.findMany({
      where: {
        tenantId: user.tenantId,
        processoId: processo.id,
        deletedAt: null,
        versoes: {
          none: getActiveDocumentoVersaoWhere(),
        },
        metadados: {
          path: ["cloudinaryPublicId"],
          string_starts_with: publicIdPrefix,
        },
      },
    });

    for (const versao of versoesParaAtualizar) {
      const novoPublicId = versao.cloudinaryPublicId.replace(oldPath, newPath);
      const novaUrl = versao.url.replace(oldPath, newPath);

      await prisma.documentoVersao.update({
        where: { id: versao.id },
        data: {
          cloudinaryPublicId: novoPublicId,
          url: novaUrl,
        },
      });
    }

    for (const documento of documentosSemVersao) {
      const metadados = (documento.metadados as Record<string, any>) || {};
      const antigoPublicId = metadados.cloudinaryPublicId as string | undefined;

      if (!antigoPublicId) continue;

      const novoPublicId = antigoPublicId.replace(oldPath, newPath);
      const novaUrl = documento.url.replace(oldPath, newPath);

      await prisma.documento.update({
        where: { id: documento.id },
        data: {
          url: novaUrl,
          metadados: {
            ...metadados,
            cloudinaryPublicId: novoPublicId,
          },
        },
      });
    }

    revalidatePath("/documentos");

    return {
      success: true,
      path: newPath,
    };
  } catch (error) {
    logger.error("Erro ao renomear pasta no explorador:", error);

    return {
      success: false,
      error: "Erro ao renomear pasta",
    };
  }
}

export async function deleteExplorerFolder(input: DeleteFolderInput) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any as SessionUser;
    if (!user.tenantId || !user.tenantSlug) {
      return { success: false, error: "Tenant não encontrado" };
    }

    const canDeleteFolders = await hasExplorerPermission(user, "excluir");
    if (!canDeleteFolders) {
      return {
        success: false,
        error: "Sem permissão para excluir pastas",
      };
    }

    const accessScopeResult = await getExplorerAccessScope(session, user);
    if (!accessScopeResult.success) {
      return { success: false, error: accessScopeResult.error };
    }

    let clienteWhere: Prisma.ClienteWhereInput = {
      id: input.clienteId,
      tenantId: user.tenantId,
      deletedAt: null,
    };
    if (accessScopeResult.scope.clienteFilter) {
      clienteWhere = {
        AND: [clienteWhere, accessScopeResult.scope.clienteFilter],
      };
    }
    const cliente = await prisma.cliente.findFirst({
      where: clienteWhere,
      select: { id: true, nome: true },
    });

    let processoWhere: Prisma.ProcessoWhereInput = {
      id: input.processoId,
      tenantId: user.tenantId,
      clienteId: input.clienteId,
      deletedAt: null,
    };
    if (accessScopeResult.scope.processoFilter) {
      processoWhere = {
        AND: [processoWhere, accessScopeResult.scope.processoFilter],
      };
    }
    const processo = await prisma.processo.findFirst({
      where: processoWhere,
      select: { id: true, numero: true },
    });

    if (!cliente || !processo) {
      return { success: false, error: "Cliente ou processo não encontrado" };
    }

    const baseFolder = buildProcessFolderBase(
      user.tenantSlug,
      cliente,
      processo,
    );
    const targetSegments = (input.targetSegments || [])
      .map((segment) => sanitizeSegment(segment))
      .filter(Boolean);

    if (!targetSegments.length) {
      return {
        success: false,
        error: "Selecione uma pasta válida para exclusão",
      };
    }

    const targetPath = [baseFolder, ...targetSegments].join("/");

    const versoesParaDeletar = await prisma.documentoVersao.findMany({
      where: {
        tenantId: user.tenantId,
        ...getActiveDocumentoVersaoWhere(),
        cloudinaryPublicId: {
          startsWith: `${targetPath}/`,
        },
      },
      select: {
        id: true,
        documentoId: true,
        cloudinaryPublicId: true,
      },
    });

    const documentosSemVersao = await prisma.documento.findMany({
      where: {
        tenantId: user.tenantId,
        processoId: processo.id,
        deletedAt: null,
        versoes: {
          none: getActiveDocumentoVersaoWhere(),
        },
        metadados: {
          path: ["cloudinaryPublicId"],
          string_starts_with: `${targetPath}/`,
        },
      },
      select: {
        id: true,
      },
    });

    const versaoIds = versoesParaDeletar.map((versao) => versao.id);
    const documentoIds = Array.from(
      new Set([
        ...versoesParaDeletar.map((versao) => versao.documentoId),
        ...documentosSemVersao.map((doc) => doc.id),
      ]),
    );

    const uploadService = UploadService.getInstance();

    await uploadService.deleteFolderRecursive(targetPath);

    if (versaoIds.length || documentoIds.length) {
      await prisma.$transaction(async (tx) => {
        if (versaoIds.length) {
          await tx.documentoVersao.updateMany({
            where: { id: { in: versaoIds } },
            data: buildDocumentoVersaoSoftDeletePayload(),
          });
        }

        if (documentoIds.length) {
          await tx.documento.updateMany({
            where: { id: { in: documentoIds } },
            data: {
              deletedAt: new Date(),
            },
          });
        }
      });
    }

    revalidatePath("/documentos");

    return {
      success: true,
    };
  } catch (error) {
    logger.error("Erro ao deletar pasta no explorador:", error);

    return {
      success: false,
      error: "Erro ao deletar pasta",
    };
  }
}

export async function deleteExplorerFile(input: DeleteFileInput) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any as SessionUser;
    if (!user.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    const canDeleteDocumentos = await hasExplorerPermission(user, "excluir");
    if (!canDeleteDocumentos) {
      return {
        success: false,
        error: "Sem permissão para remover arquivos",
      };
    }

    const accessScopeResult = await getExplorerAccessScope(session, user);
    if (!accessScopeResult.success) {
      return { success: false, error: accessScopeResult.error };
    }

    let documentoWhere: Prisma.DocumentoWhereInput = {
      id: input.documentoId,
      tenantId: user.tenantId,
      deletedAt: null,
    };
    if (accessScopeResult.scope.documentoFilter) {
      documentoWhere = {
        AND: [documentoWhere, accessScopeResult.scope.documentoFilter],
      };
    }

    const documento = await prisma.documento.findFirst({
      where: documentoWhere,
      include: {
        versoes: {
          where: getActiveDocumentoVersaoWhere(),
        },
      },
    });

    if (!documento) {
      return { success: false, error: "Documento não encontrado" };
    }

    const versoesOrdenadas = [...documento.versoes].sort((a, b) => {
      if (a.numeroVersao !== b.numeroVersao) {
        return b.numeroVersao - a.numeroVersao;
      }

      return b.createdAt.getTime() - a.createdAt.getTime();
    });
    const versaoAlvo = input.versaoId
      ? versoesOrdenadas.find((versao) => versao.id === input.versaoId)
      : versoesOrdenadas[0];

    if (input.versaoId && !versaoAlvo) {
      return { success: false, error: "Versão do documento não encontrada" };
    }

    const uploadService = UploadService.getInstance();

    const publicId =
      versaoAlvo?.cloudinaryPublicId ||
      ((documento.metadados as any)?.cloudinaryPublicId as
        | string
        | undefined) ||
      (isCloudinaryUrl(documento.url)
        ? (extractPublicIdFromUrl(documento.url) ?? undefined)
        : undefined);

    if (publicId) {
      const resourceType = documento.contentType?.startsWith("image/")
        ? "image"
        : documento.contentType?.startsWith("video/")
          ? "video"
          : "raw";

      await uploadService.deleteResources([publicId], resourceType);
    }

    await prisma.$transaction(async (tx) => {
      if (versaoAlvo) {
        await tx.documentoVersao.update({
          where: { id: versaoAlvo.id },
          data: buildDocumentoVersaoSoftDeletePayload(),
        });
      }

      const versoesRestantes = await tx.documentoVersao.count({
        where: {
          documentoId: documento.id,
          ...getActiveDocumentoVersaoWhere(),
        },
      });

      if (versoesRestantes === 0) {
        await tx.documento.update({
          where: { id: documento.id },
          data: { deletedAt: new Date() },
        });
      }
    });

    revalidatePath("/documentos");

    return { success: true };
  } catch (error) {
    logger.error("Erro ao deletar arquivo no explorador:", error);

    return {
      success: false,
      error: "Erro ao deletar arquivo",
    };
  }
}
