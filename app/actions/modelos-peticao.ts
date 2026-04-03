"use server";

import { Prisma, type ModeloPeticao } from "@/generated/prisma";

import { revalidatePath } from "next/cache";

import prisma from "@/app/lib/prisma";
import { getSession } from "@/app/lib/auth";
import { UploadService } from "@/lib/upload-service";
import {
  extractTemplateTokensFromDocument,
  inferPresetKeyFromTipo,
  normalizeModeloPeticaoDocument,
  resolveModeloPeticaoDocumentVariables,
  serializeModeloPeticaoDocumentToText,
  type ModeloPeticaoDocumentJson,
  type TenantBrandingDocumentSeed,
} from "@/lib/modelos-peticao/document-schema";

const uploadService = UploadService.getInstance();

// ============================================
// TIPOS E INTERFACES
// ============================================

export interface ActionResponse<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface ModeloPeticaoListItem {
  id: string;
  nome: string;
  descricao: string | null;
  conteudo: string;
  documentoJson: ModeloPeticaoDocumentJson | null;
  presetKey: string | null;
  categoria: string | null;
  tipo: string | null;
  variaveis: unknown;
  publico: boolean;
  ativo: boolean;
  createdAt: Date;
  updatedAt: Date;
  _count?: {
    peticoes: number;
  };
}

export interface ModeloPeticaoDetail extends Omit<ModeloPeticao, "documentoJson"> {
  documentoJson: ModeloPeticaoDocumentJson | null;
  _count?: {
    peticoes: number;
  };
}

export interface ModeloPeticaoCreateInput {
  nome: string;
  descricao?: string;
  conteudo: string;
  documentoJson?: ModeloPeticaoDocumentJson | null;
  presetKey?: string | null;
  categoria?: string;
  tipo?: string;
  variaveis?: unknown;
  publico?: boolean;
  ativo?: boolean;
}

export interface ModeloPeticaoUpdateInput {
  nome?: string;
  descricao?: string | null;
  conteudo?: string;
  documentoJson?: ModeloPeticaoDocumentJson | null;
  presetKey?: string | null;
  categoria?: string | null;
  tipo?: string | null;
  variaveis?: unknown | null;
  publico?: boolean;
  ativo?: boolean;
}

export interface ModeloPeticaoFilters {
  search?: string;
  categoria?: string;
  tipo?: string;
  ativo?: boolean;
  publico?: boolean;
}

export interface ProcessedModeloPeticaoTemplate {
  conteudo: string;
  documentoJson: ModeloPeticaoDocumentJson | null;
}

// ============================================
// FUNÇÕES AUXILIARES
// ============================================

async function getTenantId(): Promise<string> {
  const session = await getSession();

  if (!session?.user?.tenantId) {
    throw new Error("Usuário não autenticado ou tenant não encontrado");
  }

  return session.user.tenantId;
}

async function getTenantContext(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      slug: true,
      name: true,
      branding: {
        select: {
          logoUrl: true,
          primaryColor: true,
          secondaryColor: true,
          accentColor: true,
        },
      },
    },
  });

  if (!tenant) {
    throw new Error("Tenant não encontrado");
  }

  return {
    slug: tenant.slug,
    branding: {
      name: tenant.name,
      logoUrl: tenant.branding?.logoUrl ?? null,
      primaryColor: tenant.branding?.primaryColor ?? null,
      secondaryColor: tenant.branding?.secondaryColor ?? null,
      accentColor: tenant.branding?.accentColor ?? null,
    } satisfies TenantBrandingDocumentSeed,
  };
}

function normalizeLongText(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeTemplateVariables(value: unknown) {
  return value ?? null;
}

function toPrismaJsonInput(value: unknown) {
  if (value === null || value === undefined) {
    return Prisma.JsonNull;
  }

  return value as Prisma.InputJsonValue;
}

function buildModeloPayload(
  input: Pick<
    ModeloPeticaoCreateInput | ModeloPeticaoUpdateInput,
    "conteudo" | "documentoJson" | "presetKey" | "tipo"
  >,
  branding?: TenantBrandingDocumentSeed | null,
) {
  const normalizedDocument = normalizeModeloPeticaoDocument(input.documentoJson, {
    conteudo: input.conteudo,
    presetKey: input.presetKey,
    tipo: input.tipo,
    branding,
  });
  const conteudo = normalizeLongText(
    serializeModeloPeticaoDocumentToText(normalizedDocument),
  );

  if (!conteudo) {
    throw new Error("Conteúdo do modelo não pode ficar vazio");
  }

  return {
    conteudo,
    documentoJson: normalizedDocument,
    presetKey: normalizedDocument.preset.key,
  };
}

function mapModeloRow<T extends ModeloPeticao & { _count?: { peticoes: number } }>(
  modelo: T,
): ModeloPeticaoListItem | ModeloPeticaoDetail {
  const documentoJson = normalizeModeloPeticaoDocument(modelo.documentoJson, {
    conteudo: modelo.conteudo,
    presetKey: modelo.presetKey,
    tipo: modelo.tipo,
  });

  return {
    ...modelo,
    documentoJson,
  } as ModeloPeticaoListItem | ModeloPeticaoDetail;
}

function validateImageUrl(url: string) {
  try {
    new URL(url);
    return /\.(png|jpg|jpeg|webp|svg)(\?.*)?$/i.test(url);
  } catch {
    return false;
  }
}

// ============================================
// CRUD - LISTAR
// ============================================

export async function listModelosPeticao(
  filters: ModeloPeticaoFilters = {},
): Promise<ActionResponse<ModeloPeticaoListItem[]>> {
  try {
    const tenantId = await getTenantId();

    const where: {
      tenantId: string;
      deletedAt: null;
      OR?: Array<Record<string, unknown>>;
      categoria?: string;
      tipo?: string;
      ativo?: boolean;
      publico?: boolean;
    } = {
      tenantId,
      deletedAt: null,
    };

    if (filters.search) {
      where.OR = [
        { nome: { contains: filters.search, mode: "insensitive" } },
        { descricao: { contains: filters.search, mode: "insensitive" } },
        { categoria: { contains: filters.search, mode: "insensitive" } },
        { tipo: { contains: filters.search, mode: "insensitive" } },
        { conteudo: { contains: filters.search, mode: "insensitive" } },
      ];
    }

    if (filters.categoria) {
      where.categoria = filters.categoria;
    }

    if (filters.tipo) {
      where.tipo = filters.tipo;
    }

    if (filters.ativo !== undefined) {
      where.ativo = filters.ativo;
    }

    if (filters.publico !== undefined) {
      where.publico = filters.publico;
    }

    const modelos = await prisma.modeloPeticao.findMany({
      where,
      include: {
        _count: {
          select: {
            peticoes: true,
          },
        },
      },
      orderBy: [{ ativo: "desc" }, { updatedAt: "desc" }, { nome: "asc" }],
    });

    return {
      success: true,
      data: modelos.map((modelo) => mapModeloRow(modelo) as ModeloPeticaoListItem),
    };
  } catch (error) {
    console.error("Erro ao listar modelos de petição:", error);

    return {
      success: false,
      error: "Erro ao listar modelos de petição",
    };
  }
}

// ============================================
// CRUD - BUSCAR POR ID
// ============================================

export async function getModeloPeticao(
  id: string,
): Promise<ActionResponse<ModeloPeticaoDetail>> {
  try {
    const tenantId = await getTenantId();

    const modelo = await prisma.modeloPeticao.findFirst({
      where: {
        id,
        tenantId,
        deletedAt: null,
      },
      include: {
        _count: {
          select: {
            peticoes: true,
          },
        },
      },
    });

    if (!modelo) {
      return {
        success: false,
        error: "Modelo de petição não encontrado",
      };
    }

    return {
      success: true,
      data: mapModeloRow(modelo) as ModeloPeticaoDetail,
    };
  } catch (error) {
    console.error("Erro ao buscar modelo de petição:", error);

    return {
      success: false,
      error: "Erro ao buscar modelo de petição",
    };
  }
}

// ============================================
// CRUD - CRIAR
// ============================================

export async function createModeloPeticao(
  input: ModeloPeticaoCreateInput,
): Promise<ActionResponse<ModeloPeticaoDetail>> {
  try {
    const tenantId = await getTenantId();
    const { branding } = await getTenantContext(tenantId);
    const normalized = buildModeloPayload(input, branding);

    const modelo = await prisma.modeloPeticao.create({
      data: {
        tenantId,
        nome: input.nome.trim(),
        descricao: normalizeLongText(input.descricao),
        conteudo: normalized.conteudo,
        documentoJson: toPrismaJsonInput(normalized.documentoJson),
        presetKey: normalized.presetKey,
        categoria: input.categoria?.trim() || null,
        tipo: input.tipo?.trim() || null,
        variaveis: toPrismaJsonInput(normalizeTemplateVariables(input.variaveis)),
        publico: input.publico ?? false,
        ativo: input.ativo ?? true,
      },
      include: {
        _count: {
          select: {
            peticoes: true,
          },
        },
      },
    });

    revalidatePath("/modelos-peticao");
    revalidatePath("/peticoes");

    return {
      success: true,
      data: mapModeloRow(modelo) as ModeloPeticaoDetail,
    };
  } catch (error) {
    console.error("Erro ao criar modelo de petição:", error);

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro ao criar modelo de petição",
    };
  }
}

// ============================================
// CRUD - ATUALIZAR
// ============================================

export async function updateModeloPeticao(
  id: string,
  input: ModeloPeticaoUpdateInput,
): Promise<ActionResponse<ModeloPeticaoDetail>> {
  try {
    const tenantId = await getTenantId();

    const existente = await prisma.modeloPeticao.findFirst({
      where: {
        id,
        tenantId,
        deletedAt: null,
      },
    });

    if (!existente) {
      return {
        success: false,
        error: "Modelo de petição não encontrado",
      };
    }

    const { branding } = await getTenantContext(tenantId);
    const normalized = buildModeloPayload(
      {
        conteudo: input.conteudo ?? existente.conteudo,
        documentoJson: input.documentoJson ?? normalizeModeloPeticaoDocument(existente.documentoJson, {
          conteudo: existente.conteudo,
          presetKey: existente.presetKey,
          tipo: input.tipo ?? existente.tipo,
          branding,
        }),
        presetKey:
          input.presetKey ?? existente.presetKey ?? inferPresetKeyFromTipo(input.tipo ?? existente.tipo),
        tipo: input.tipo ?? existente.tipo,
      },
      branding,
    );

    const modelo = await prisma.modeloPeticao.update({
      where: { id },
      data: {
        ...(input.nome !== undefined && { nome: input.nome.trim() }),
        ...(input.descricao !== undefined && {
          descricao: normalizeLongText(input.descricao),
        }),
        conteudo: normalized.conteudo,
        documentoJson: toPrismaJsonInput(normalized.documentoJson),
        presetKey: normalized.presetKey,
        ...(input.categoria !== undefined && {
          categoria: input.categoria?.trim() || null,
        }),
        ...(input.tipo !== undefined && {
          tipo: input.tipo?.trim() || null,
        }),
        ...(input.variaveis !== undefined && {
          variaveis: toPrismaJsonInput(normalizeTemplateVariables(input.variaveis)),
        }),
        ...(input.publico !== undefined && { publico: input.publico }),
        ...(input.ativo !== undefined && { ativo: input.ativo }),
      },
      include: {
        _count: {
          select: {
            peticoes: true,
          },
        },
      },
    });

    revalidatePath("/modelos-peticao");
    revalidatePath("/peticoes");

    return {
      success: true,
      data: mapModeloRow(modelo) as ModeloPeticaoDetail,
    };
  } catch (error) {
    console.error("Erro ao atualizar modelo de petição:", error);

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Erro ao atualizar modelo de petição",
    };
  }
}

// ============================================
// CRUD - EXCLUIR
// ============================================

export async function deleteModeloPeticao(id: string): Promise<ActionResponse> {
  try {
    const tenantId = await getTenantId();

    const existente = await prisma.modeloPeticao.findFirst({
      where: {
        id,
        tenantId,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!existente) {
      return {
        success: false,
        error: "Modelo de petição não encontrado",
      };
    }

    await prisma.modeloPeticao.update({
      where: { id },
      data: {
        deletedAt: new Date(),
      },
    });

    revalidatePath("/modelos-peticao");
    revalidatePath("/peticoes");

    return {
      success: true,
    };
  } catch (error) {
    console.error("Erro ao excluir modelo de petição:", error);

    return {
      success: false,
      error: "Erro ao excluir modelo de petição",
    };
  }
}

// ============================================
// DUPLICAR
// ============================================

export async function duplicateModeloPeticao(
  id: string,
): Promise<ActionResponse<ModeloPeticaoDetail>> {
  try {
    const tenantId = await getTenantId();

    const original = await prisma.modeloPeticao.findFirst({
      where: {
        id,
        tenantId,
        deletedAt: null,
      },
    });

    if (!original) {
      return {
        success: false,
        error: "Modelo de petição não encontrado",
      };
    }

    const duplicado = await prisma.modeloPeticao.create({
      data: {
        tenantId,
        nome: `${original.nome} (Cópia)`,
        descricao: original.descricao,
        conteudo: original.conteudo,
        documentoJson: toPrismaJsonInput(original.documentoJson),
        presetKey: original.presetKey,
        categoria: original.categoria,
        tipo: original.tipo,
        variaveis: toPrismaJsonInput(original.variaveis),
        publico: false,
        ativo: true,
      },
      include: {
        _count: {
          select: {
            peticoes: true,
          },
        },
      },
    });

    revalidatePath("/modelos-peticao");

    return {
      success: true,
      data: mapModeloRow(duplicado) as ModeloPeticaoDetail,
    };
  } catch (error) {
    console.error("Erro ao duplicar modelo de petição:", error);

    return {
      success: false,
      error: "Erro ao duplicar modelo de petição",
    };
  }
}

// ============================================
// TOGGLE STATUS
// ============================================

export async function toggleModeloPeticaoStatus(
  id: string,
): Promise<ActionResponse<ModeloPeticaoDetail>> {
  try {
    const tenantId = await getTenantId();

    const modelo = await prisma.modeloPeticao.findFirst({
      where: {
        id,
        tenantId,
        deletedAt: null,
      },
    });

    if (!modelo) {
      return {
        success: false,
        error: "Modelo de petição não encontrado",
      };
    }

    const atualizado = await prisma.modeloPeticao.update({
      where: { id },
      data: {
        ativo: !modelo.ativo,
      },
      include: {
        _count: {
          select: {
            peticoes: true,
          },
        },
      },
    });

    revalidatePath("/modelos-peticao");
    revalidatePath("/peticoes");

    return {
      success: true,
      data: mapModeloRow(atualizado) as ModeloPeticaoDetail,
    };
  } catch (error) {
    console.error("Erro ao alterar status do modelo de petição:", error);

    return {
      success: false,
      error: "Erro ao alterar status do modelo de petição",
    };
  }
}

// ============================================
// CATEGORIAS E TIPOS
// ============================================

export async function getCategoriasModeloPeticao(): Promise<ActionResponse<string[]>> {
  try {
    const tenantId = await getTenantId();
    const modelos = await prisma.modeloPeticao.findMany({
      where: {
        tenantId,
        deletedAt: null,
        categoria: {
          not: null,
        },
      },
      select: {
        categoria: true,
      },
      distinct: ["categoria"],
      orderBy: {
        categoria: "asc",
      },
    });

    return {
      success: true,
      data: modelos
        .map((modelo) => modelo.categoria)
        .filter((categoria): categoria is string => Boolean(categoria)),
    };
  } catch (error) {
    console.error("Erro ao buscar categorias:", error);

    return {
      success: false,
      error: "Erro ao buscar categorias",
    };
  }
}

export async function getTiposModeloPeticao(): Promise<ActionResponse<string[]>> {
  try {
    const tenantId = await getTenantId();
    const modelos = await prisma.modeloPeticao.findMany({
      where: {
        tenantId,
        deletedAt: null,
        tipo: {
          not: null,
        },
      },
      select: {
        tipo: true,
      },
      distinct: ["tipo"],
      orderBy: {
        tipo: "asc",
      },
    });

    return {
      success: true,
      data: modelos
        .map((modelo) => modelo.tipo)
        .filter((tipo): tipo is string => Boolean(tipo)),
    };
  } catch (error) {
    console.error("Erro ao buscar tipos:", error);

    return {
      success: false,
      error: "Erro ao buscar tipos",
    };
  }
}

// ============================================
// MÍDIA
// ============================================

export async function uploadModeloPeticaoImage(
  formData: FormData,
): Promise<ActionResponse<{ url: string }>> {
  try {
    const session = await getSession();

    if (!session?.user?.id || !session.user.tenantId) {
      return {
        success: false,
        error: "Não autorizado",
      };
    }

    const file = formData.get("file") as File | null;
    const urlValue = formData.get("url");
    const imageUrl =
      typeof urlValue === "string" ? urlValue.trim() : "";

    if (imageUrl) {
      if (!validateImageUrl(imageUrl)) {
        return {
          success: false,
          error: "URL inválida. Use um link direto de imagem PNG, JPG, WEBP ou SVG.",
        };
      }

      return {
        success: true,
        data: {
          url: imageUrl,
        },
      };
    }

    if (!file) {
      return {
        success: false,
        error: "Nenhuma imagem enviada",
      };
    }

    const allowedTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "image/svg+xml",
    ];

    if (!allowedTypes.includes(file.type)) {
      return {
        success: false,
        error: "Tipo de arquivo não permitido. Use JPG, PNG, WEBP ou SVG.",
      };
    }

    if (file.size > 5 * 1024 * 1024) {
      return {
        success: false,
        error: "Imagem muito grande. Máximo de 5MB.",
      };
    }

    const tenantContext = await getTenantContext(session.user.tenantId);
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const uploadResult = await uploadService.uploadStructuredDocument(
      fileBuffer,
      session.user.id,
      file.name,
      {
        tenantSlug: tenantContext.slug,
        categoria: "outros",
        referencia: {
          id: session.user.id,
          etiqueta: "modelo-peticao",
        },
        subpastas: ["modelos-peticao", "imagens"],
        fileName: file.name.replace(/\.[^.]+$/, ""),
        resourceType: "image",
        contentType: file.type,
        tags: ["modelos-peticao", "imagem", tenantContext.slug],
      },
    );

    if (!uploadResult.success || !uploadResult.url) {
      return {
        success: false,
        error: uploadResult.error || "Falha ao enviar a imagem do modelo",
      };
    }

    return {
      success: true,
      data: {
        url: uploadResult.url,
      },
    };
  } catch (error) {
    console.error("Erro ao enviar imagem do modelo:", error);

    return {
      success: false,
      error: "Erro ao enviar imagem do modelo",
    };
  }
}

// ============================================
// PROCESSAMENTO DE TEMPLATE
// ============================================

export async function processarTemplate(
  modeloId: string,
  variaveis: Record<string, unknown>,
): Promise<ActionResponse<ProcessedModeloPeticaoTemplate>> {
  try {
    const tenantId = await getTenantId();
    const { branding } = await getTenantContext(tenantId);

    const modelo = await prisma.modeloPeticao.findFirst({
      where: {
        id: modeloId,
        tenantId,
        deletedAt: null,
      },
    });

    if (!modelo) {
      return {
        success: false,
        error: "Modelo de petição não encontrado",
      };
    }

    const document = normalizeModeloPeticaoDocument(modelo.documentoJson, {
      conteudo: modelo.conteudo,
      presetKey: modelo.presetKey,
      tipo: modelo.tipo,
      branding,
    });
    const resolvedDocument = resolveModeloPeticaoDocumentVariables(document, variaveis);
    const conteudo = serializeModeloPeticaoDocumentToText(resolvedDocument);

    return {
      success: true,
      data: {
        conteudo,
        documentoJson: resolvedDocument,
      },
    };
  } catch (error) {
    console.error("Erro ao processar template:", error);

    return {
      success: false,
      error: "Erro ao processar template",
    };
  }
}

export async function inferModeloPeticaoVariaveis(
  documentoJson: ModeloPeticaoDocumentJson | null,
  conteudo?: string | null,
) {
  const normalizedDocument = normalizeModeloPeticaoDocument(documentoJson, {
    conteudo,
  });

  return extractTemplateTokensFromDocument(normalizedDocument);
}
