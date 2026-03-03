import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

import { v2 as cloudinary } from "cloudinary";
import sharp from "sharp";

import logger from "@/lib/logger";

// Configurar Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export interface UploadResult {
  success: boolean;
  url?: string;
  error?: string;
  publicId?: string;
}

export interface DocumentUploadOptions {
  tipo: "procuracao" | "processo" | "contrato";
  identificador: string;
  fileName: string;
  description?: string;
}

export type CloudinaryResourceType = "image" | "raw" | "auto" | "video";

export interface CloudinaryFolderNode {
  name: string;
  path: string;
  children: CloudinaryFolderNode[];
}

export interface StructuredDocumentUploadOptions {
  tenantSlug: string;
  categoria: "cliente" | "processo" | "procuracao" | "contrato" | "outros";
  cliente?: {
    id: string;
    nome: string;
  };
  processo?: {
    id: string;
    numero: string;
  };
  referencia?: {
    id: string;
    etiqueta?: string | null;
  };
  subpastas?: string[];
  fileName: string;
  resourceType?: CloudinaryResourceType;
  contentType?: string;
  tags?: string[];
}

export class UploadService {
  private static instance: UploadService;
  private useCloudinary: boolean;

  constructor() {
    // Verificar se Cloudinary está configurado
    this.useCloudinary = !!(
      process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
    );
  }

  static getInstance(): UploadService {
    if (!UploadService.instance) {
      UploadService.instance = new UploadService();
    }

    return UploadService.instance;
  }

  async uploadAvatar(
    file: Buffer,
    userId: string,
    originalName: string,
    tenantSlug?: string,
    userName?: string,
  ): Promise<UploadResult> {
    try {
      if (this.useCloudinary) {
        return await this.uploadToCloudinary(
          file,
          userId,
          originalName,
          tenantSlug,
          userName,
        );
      } else {
        return await this.uploadLocally(
          file,
          userId,
          originalName,
          tenantSlug,
          userName,
        );
      }
    } catch (error) {
      logger.error("Erro no upload:", error);

      return {
        success: false,
        error: "Erro interno do servidor",
      };
    }
  }

  private async uploadToCloudinary(
    file: Buffer,
    userId: string,
    originalName: string,
    tenantSlug?: string,
    userName?: string,
  ): Promise<UploadResult> {
    try {
      // Otimizar imagem com Sharp
      const optimizedBuffer = await sharp(file)
        .resize(200, 200, {
          fit: "cover",
          position: "center",
        })
        .jpeg({ quality: 85 })
        .toBuffer();

      // Criar nome de usuário limpo para pasta
      const cleanUserName = userName
        ? userName
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "-")
            .replace(/-+/g, "-")
            .replace(/^-|-$/g, "")
        : "user";

      // Criar estrutura de pastas hierárquica: magiclawyer/tenant/nome-id
      const userFolder = `${cleanUserName}-${userId}`;
      const folderPath = tenantSlug
        ? `magiclawyer/${tenantSlug}/${userFolder}`
        : `magiclawyer/avatars/${userFolder}`;

      // Upload para Cloudinary
      const result = await cloudinary.uploader.upload(
        `data:image/jpeg;base64,${optimizedBuffer.toString("base64")}`,
        {
          folder: folderPath,
          public_id: `avatar_${Date.now()}`,
          resource_type: "image",
          transformation: [
            { width: 200, height: 200, crop: "fill", gravity: "face" },
            { quality: "auto", fetch_format: "auto" },
          ],
        },
      );

      return {
        success: true,
        url: result.secure_url,
      };
    } catch (error) {
      logger.error("Erro no upload para Cloudinary:", error);

      return {
        success: false,
        error: "Erro ao fazer upload para Cloudinary",
      };
    }
  }

  private async uploadLocally(
    file: Buffer,
    userId: string,
    originalName: string,
    tenantSlug?: string,
    userName?: string,
  ): Promise<UploadResult> {
    try {
      // Criar nome de usuário limpo para pasta
      const cleanUserName = userName
        ? userName
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "-")
            .replace(/-+/g, "-")
            .replace(/^-|-$/g, "")
        : "user";

      // Criar estrutura de diretórios hierárquica: magiclawyer/tenant/nome-id
      const userFolder = `${cleanUserName}-${userId}`;
      const uploadDir = tenantSlug
        ? join(
            process.cwd(),
            "public",
            "uploads",
            "magiclawyer",
            tenantSlug,
            userFolder,
          )
        : join(
            process.cwd(),
            "public",
            "uploads",
            "magiclawyer",
            "avatars",
            userFolder,
          );

      if (!existsSync(uploadDir)) {
        await mkdir(uploadDir, { recursive: true });
      }

      // Otimizar imagem com Sharp
      const optimizedBuffer = await sharp(file)
        .resize(200, 200, {
          fit: "cover",
          position: "center",
        })
        .jpeg({ quality: 85 })
        .toBuffer();

      // Gerar nome único para o arquivo
      const timestamp = Date.now();
      const fileExtension = originalName.split(".").pop() || "jpg";
      const fileName = `avatar_${timestamp}.${fileExtension}`;
      const filePath = join(uploadDir, fileName);

      // Salvar arquivo
      await writeFile(filePath, new Uint8Array(optimizedBuffer));

      // Retornar URL pública
      const avatarUrl = tenantSlug
        ? `/uploads/magiclawyer/${tenantSlug}/${userFolder}/${fileName}`
        : `/uploads/magiclawyer/avatars/${userFolder}/${fileName}`;

      return {
        success: true,
        url: avatarUrl,
      };
    } catch (error) {
      logger.error("Erro no upload local:", error);

      return {
        success: false,
        error: "Erro ao fazer upload local",
      };
    }
  }

  async deleteAvatar(
    avatarUrl: string,
    _userId: string,
  ): Promise<UploadResult> {
    try {
      if (!avatarUrl || typeof avatarUrl !== "string") {
        return {
          success: false,
          error: "URL inválida",
        };
      }

      // Verificar se é uma URL do Cloudinary
      if (this.isCloudinaryUrl(avatarUrl)) {
        if (this.useCloudinary) {
          return await this.deleteFromCloudinary(avatarUrl);
        } else {
          // Se não está usando Cloudinary mas a URL é do Cloudinary, não pode deletar
          return {
            success: false,
            error:
              "Não é possível deletar imagem do Cloudinary quando usando armazenamento local",
          };
        }
      } else {
        // É uma URL externa, não pode ser deletada
        return {
          success: false,
          error: "Não é possível deletar imagens de URLs externas",
        };
      }
    } catch (error) {
      logger.error("Erro ao deletar avatar:", error);

      return {
        success: false,
        error: "Erro interno do servidor",
      };
    }
  }

  private async deleteFromCloudinary(avatarUrl: string): Promise<UploadResult> {
    try {
      if (!avatarUrl || typeof avatarUrl !== "string") {
        return {
          success: false,
          error: "URL inválida",
        };
      }

      // Extrair public_id completo da URL do Cloudinary
      // A URL do Cloudinary tem formato: https://res.cloudinary.com/cloud_name/image/upload/v1234567890/folder/subfolder/public_id.jpg
      const urlParts = avatarUrl.split("/");
      const uploadIndex = urlParts.findIndex((part) => part === "upload");

      if (uploadIndex === -1 || uploadIndex + 1 >= urlParts.length) {
        return {
          success: false,
          error: "URL inválida",
        };
      }

      // Construir o public_id completo (incluindo pasta)
      const publicIdParts = urlParts.slice(uploadIndex + 2); // Pular 'upload' e 'v1234567890'
      const publicId = publicIdParts.join("/").split(".")[0]; // Remover extensão

      await cloudinary.uploader.destroy(publicId);

      return {
        success: true,
      };
    } catch (error) {
      logger.error("Erro ao deletar do Cloudinary:", error);

      return {
        success: false,
        error: "Erro ao deletar do Cloudinary",
      };
    }
  }

  private async deleteLocally(
    avatarUrl: string,
    userId: string,
  ): Promise<UploadResult> {
    try {
      // Extrair caminho completo do arquivo da URL
      // URL format: /uploads/magiclawyer/tenant/user/avatar_timestamp.jpg
      const urlParts = avatarUrl.split("/");
      const uploadsIndex = urlParts.findIndex((part) => part === "uploads");

      if (uploadsIndex === -1 || uploadsIndex + 1 >= urlParts.length) {
        return {
          success: false,
          error: "URL inválida",
        };
      }

      // Construir caminho completo do arquivo
      const filePath = join(
        process.cwd(),
        "public",
        ...urlParts.slice(uploadsIndex + 1),
      );

      // Verificar se o arquivo existe e pertence ao usuário
      if (!existsSync(filePath)) {
        return {
          success: false,
          error: "Arquivo não encontrado",
        };
      }

      // Verificar se o caminho contém o userId (segurança)
      if (!filePath.includes(userId)) {
        return {
          success: false,
          error: "Não autorizado para deletar este arquivo",
        };
      }

      // Deletar arquivo
      await writeFile(filePath, ""); // Limpar arquivo

      return {
        success: true,
      };
    } catch (error) {
      logger.error("Erro ao deletar localmente:", error);

      return {
        success: false,
        error: "Erro ao deletar localmente",
      };
    }
  }

  getUploadMethod(): string {
    return this.useCloudinary ? "Cloudinary" : "Local";
  }

  private isCloudinaryUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);

      return (
        urlObj.hostname.includes("cloudinary.com") ||
        urlObj.hostname.includes("res.cloudinary.com")
      );
    } catch {
      return false;
    }
  }

  /**
   * Upload de documento para Cloudinary
   * Estrutura: magiclawyer/{tenantSlug}/{userId}/{tipo}/{identificador}/{fileName}_{timestamp}
   */
  async uploadDocumento(
    file: Buffer,
    userId: string,
    originalName: string,
    tenantSlug: string,
    options: DocumentUploadOptions,
  ): Promise<UploadResult> {
    try {
      if (!this.useCloudinary) {
        return {
          success: false,
          error: "Upload de documentos requer Cloudinary configurado",
        };
      }

      // Validar tipo de arquivo (apenas PDFs para documentos)
      const fileExtension = originalName.split(".").pop()?.toLowerCase();

      if (fileExtension !== "pdf") {
        return {
          success: false,
          error: "Apenas arquivos PDF são permitidos para documentos",
        };
      }

      // Criar estrutura de pastas hierárquica
      const folderPath = this.getDocumentFolderPath(
        tenantSlug,
        userId,
        options.tipo,
        options.identificador,
      );

      // Criar nome do arquivo limpo
      const cleanFileName = this.cleanFileName(options.fileName);
      const timestamp = Date.now();
      const publicId = `${cleanFileName}_${timestamp}`;

      // Upload para Cloudinary
      const result = await cloudinary.uploader.upload(
        `data:application/pdf;base64,${file.toString("base64")}`,
        {
          folder: folderPath,
          public_id: publicId,
          resource_type: "raw",
          tags: [options.tipo, options.identificador, userId],
        },
      );

      return {
        success: true,
        url: result.secure_url,
        publicId: result.public_id,
      };
    } catch (error) {
      logger.error("Erro ao fazer upload do documento:", error);

      return {
        success: false,
        error: "Erro ao fazer upload do documento",
      };
    }
  }

  async uploadStructuredDocument(
    file: Buffer,
    userId: string,
    originalName: string,
    options: StructuredDocumentUploadOptions,
  ): Promise<UploadResult & { folderPath?: string }> {
    try {
      if (!this.useCloudinary) {
        return {
          success: false,
          error: "Upload estruturado requer Cloudinary configurado",
        };
      }

      const resourceType =
        options.resourceType ||
        this.detectResourceType(options.contentType, originalName);
      const normalizedResourceType = this.normalizeResourceType(resourceType);
      const folderPath = this.buildStructuredFolderPath(options);
      const cleanFileName = this.cleanFileName(options.fileName);
      const timestamp = Date.now();
      const publicId = `${cleanFileName || "arquivo"}_${timestamp}`;
      const mimeType =
        options.contentType || this.guessMimeTypeFromName(originalName);

      const uploadResult = await cloudinary.uploader.upload(
        `data:${mimeType};base64,${file.toString("base64")}`,
        {
          folder: folderPath,
          public_id: publicId,
          resource_type: normalizedResourceType,
          use_filename: false,
          overwrite: false,
          unique_filename: false,
          tags: options.tags,
        },
      );

      return {
        success: true,
        url: uploadResult.secure_url,
        publicId: uploadResult.public_id,
        folderPath,
      };
    } catch (error) {
      logger.error("Erro ao fazer upload estruturado:", error);

      return {
        success: false,
        error: "Erro ao fazer upload estruturado",
      };
    }
  }

  /**
   * Upload de foto de juiz para Cloudinary
   * Estrutura: magiclawyer/juizes/{nome-juiz}-{juiz-id}/foto_{timestamp}
   */
  async uploadJuizFoto(
    file: Buffer,
    juizId: string,
    juizNome: string,
    _originalName: string,
  ): Promise<UploadResult> {
    try {
      if (!this.useCloudinary) {
        return {
          success: false,
          error: "Upload de fotos de juízes requer Cloudinary configurado",
        };
      }

      // Otimizar imagem com Sharp (mesmo que avatar)
      const optimizedBuffer = await sharp(file)
        .resize(500, 500, {
          fit: "cover",
          position: "center",
        })
        .jpeg({ quality: 90 })
        .toBuffer();

      const base64Image = `data:image/jpeg;base64,${optimizedBuffer.toString("base64")}`;

      // Criar nome limpo para a pasta
      const cleanJuizNome = juizNome
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // Remove acentos
        .replace(/[^a-z0-9]+/g, "-") // Substitui caracteres especiais por hífen
        .replace(/^-+|-+$/g, ""); // Remove hífens do início e fim

      // Estrutura de pasta para juízes com nome
      // Exemplo: magiclawyer/juizes/joao-silva-cmxyz123/foto_1234567890
      const folderPath = `magiclawyer/juizes/${cleanJuizNome}-${juizId}`;
      const publicId = `${folderPath}/foto_${Date.now()}`;

      const uploadResult = await cloudinary.uploader.upload(base64Image, {
        public_id: publicId,
        folder: folderPath,
        resource_type: "image",
        transformation: [
          {
            width: 500,
            height: 500,
            crop: "fill",
            gravity: "face",
            quality: "auto:good",
          },
        ],
        tags: ["juiz", "foto", juizId, cleanJuizNome],
      });

      return {
        success: true,
        url: uploadResult.secure_url,
      };
    } catch (error) {
      logger.error("Erro ao fazer upload da foto do juiz:", error);

      return {
        success: false,
        error: "Erro ao fazer upload",
      };
    }
  }

  async createFolder(path: string): Promise<UploadResult> {
    try {
      if (!this.useCloudinary) {
        return {
          success: false,
          error: "Criação de pasta requer Cloudinary configurado",
        };
      }

      const sanitizedPath = path.split("/").filter(Boolean).join("/");

      const result = await cloudinary.api.create_folder(sanitizedPath);

      return {
        success: true,
        publicId: result.path,
      };
    } catch (error) {
      logger.error("Erro ao criar pasta no Cloudinary:", error);

      return {
        success: false,
        error: "Erro ao criar pasta",
      };
    }
  }

  async renameFolder(oldPath: string, newPath: string): Promise<UploadResult> {
    try {
      if (!this.useCloudinary) {
        return {
          success: false,
          error: "Renomear pasta requer Cloudinary configurado",
        };
      }

      await cloudinary.api.rename_folder(oldPath, newPath);

      return {
        success: true,
        publicId: newPath,
      };
    } catch (error) {
      logger.error("Erro ao renomear pasta no Cloudinary:", error);

      return {
        success: false,
        error: "Erro ao renomear pasta",
      };
    }
  }

  async deleteFolderRecursive(
    path: string,
    resourceTypes: CloudinaryResourceType[] = ["raw", "image", "video"],
  ): Promise<UploadResult> {
    try {
      if (!this.useCloudinary) {
        return {
          success: false,
          error: "Exclusão de pasta requer Cloudinary configurado",
        };
      }

      const uniqueTypes = Array.from(
        new Set(
          resourceTypes.map((resourceType) =>
            this.normalizeResourceType(resourceType),
          ),
        ),
      );

      for (const normalizedType of uniqueTypes) {
        await cloudinary.api.delete_resources_by_prefix(path, {
          resource_type: normalizedType,
        });
      }
      await cloudinary.api.delete_folder(path);

      return {
        success: true,
      };
    } catch (error) {
      logger.error("Erro ao deletar pasta no Cloudinary:", error);

      return {
        success: false,
        error: "Erro ao deletar pasta",
      };
    }
  }

  async renameResource(
    oldPublicId: string,
    newPublicId: string,
    resourceType: CloudinaryResourceType = "raw",
  ): Promise<UploadResult> {
    try {
      if (!this.useCloudinary) {
        return {
          success: false,
          error: "Renomear recurso requer Cloudinary configurado",
        };
      }

      const normalizedType = this.normalizeResourceType(resourceType);
      const result = await cloudinary.uploader.rename(
        oldPublicId,
        newPublicId,
        {
          resource_type: normalizedType,
          overwrite: true,
        },
      );

      return {
        success: true,
        url: result.secure_url,
        publicId: result.public_id,
      };
    } catch (error) {
      logger.error("Erro ao renomear recurso no Cloudinary:", error);

      return {
        success: false,
        error: "Erro ao renomear recurso",
      };
    }
  }

  async deleteResources(
    publicIds: string[],
    resourceType: CloudinaryResourceType = "raw",
  ): Promise<UploadResult> {
    try {
      if (!this.useCloudinary) {
        return {
          success: false,
          error: "Deleção de recursos requer Cloudinary configurado",
        };
      }

      if (!publicIds.length) {
        return { success: true };
      }

      const normalizedType = this.normalizeResourceType(resourceType);

      await cloudinary.api.delete_resources(publicIds, {
        resource_type: normalizedType,
      });

      return {
        success: true,
      };
    } catch (error) {
      logger.error("Erro ao deletar recursos no Cloudinary:", error);

      return {
        success: false,
        error: "Erro ao deletar recursos",
      };
    }
  }

  async listSubFolders(path: string): Promise<{
    success: boolean;
    folders: string[];
    error?: string;
  }> {
    try {
      if (!this.useCloudinary) {
        return {
          success: false,
          folders: [],
          error: "Listagem de pastas requer Cloudinary configurado",
        };
      }

      const result = await cloudinary.api.sub_folders(path);
      const folders = Array.isArray(result.folders)
        ? result.folders.map((folder: any) => folder.path as string)
        : [];

      return {
        success: true,
        folders,
      };
    } catch (error) {
      const httpCode = (error as any)?.http_code || (error as any)?.error?.http_code;

      if (httpCode === 420) {
        logger.warn("Cloudinary rate limit excedido ao listar subpastas", {
          path,
        });

        return {
          success: false,
          folders: [],
          error: "Limite da API do Cloudinary excedido, tente novamente em instantes.",
        };
      }

      logger.error("Erro ao listar subpastas no Cloudinary:", error);

      return {
        success: false,
        folders: [],
        error: "Erro ao listar subpastas",
      };
    }
  }

  async buildFolderTree(path: string): Promise<{
    success: boolean;
    tree: CloudinaryFolderNode | null;
    error?: string;
  }> {
    try {
      if (!this.useCloudinary) {
        return {
          success: false,
          tree: null,
          error: "Cloudinary não configurado",
        };
      }

      const traverse = async (
        currentPath: string,
      ): Promise<CloudinaryFolderNode> => {
        const name =
          currentPath.split("/").filter(Boolean).pop() || currentPath;
        let folders: any[] = [];

        try {
          const result = await cloudinary.api.sub_folders(currentPath);

          folders = Array.isArray(result.folders) ? result.folders : [];
        } catch (error: any) {
          const httpCode = error?.http_code || error?.error?.http_code;

          if (httpCode === 420) {
            logger.warn(
              "Cloudinary rate limit excedido ao listar subpastas (tree traverse)",
              { currentPath },
            );

            folders = [];
          } else if (httpCode === 404) {
            folders = [];
          } else {
            throw error;
          }
        }
        const children: CloudinaryFolderNode[] = [];

        for (const folder of folders) {
          const childPath = folder.path as string;
          const childNode = await traverse(childPath);

          children.push(childNode);
        }

        return {
          name,
          path: currentPath,
          children,
        };
      };

      const tree = await traverse(path);

      return {
        success: true,
        tree,
      };
    } catch (error) {
      const httpCode = (error as any)?.http_code || (error as any)?.error?.http_code;

      if (httpCode === 420) {
        logger.warn("Cloudinary rate limit excedido ao construir árvore", {
          path,
        });

        return {
          success: false,
          tree: null,
          error: "Limite da API do Cloudinary excedido, tente novamente em instantes.",
        };
      }

      logger.error("Erro ao construir árvore de pastas do Cloudinary:", error);

      return {
        success: false,
        tree: null,
        error: "Erro ao carregar estrutura de pastas",
      };
    }
  }

  /**
   * Deletar documento do Cloudinary
   */
  async deleteDocumento(
    documentUrl: string,
    _userId: string,
  ): Promise<UploadResult> {
    try {
      if (!this.useCloudinary) {
        return {
          success: false,
          error: "Deleção de documentos requer Cloudinary configurado",
        };
      }

      if (!this.isCloudinaryUrl(documentUrl)) {
        return {
          success: false,
          error: "URL inválida ou não é do Cloudinary",
        };
      }

      return await this.deleteFromCloudinary(documentUrl);
    } catch (error) {
      logger.error("Erro ao deletar documento:", error);

      return {
        success: false,
        error: "Erro ao deletar documento",
      };
    }
  }

  /**
   * Criar caminho de pasta para documentos
   */
  private getDocumentFolderPath(
    tenantSlug: string,
    userId: string,
    tipo: string,
    identificador: string,
  ): string {
    // Usar apenas o tenantSlug, sem duplicar a estrutura
    const basePath = tenantSlug
      ? `magiclawyer/${tenantSlug}`
      : `magiclawyer/documents`;

    // Criar nome descritivo para o identificador (nome-id)
    const cleanIdentificador = this.cleanFileName(identificador);

    // Corrigir plural de procuração
    const tipoPlural = tipo === "procuracao" ? "procuracoes" : `${tipo}s`;

    return `${basePath}/${tipoPlural}/${cleanIdentificador}`;
  }

  /**
   * Verificar se arquivo existe no Cloudinary
   */
  async checkFileExists(
    url: string,
  ): Promise<{ success: boolean; exists: boolean; error?: string }> {
    try {
      if (!this.useCloudinary) {
        return {
          success: false,
          exists: false,
          error: "Cloudinary não configurado",
        };
      }

      if (!this.isCloudinaryUrl(url)) {
        return {
          success: false,
          exists: false,
          error: "URL não é do Cloudinary",
        };
      }

      // Extrair public_id da URL
      const urlParts = url.split("/");
      const uploadIndex = urlParts.findIndex((part) => part === "upload");

      if (uploadIndex === -1) {
        return { success: false, exists: false, error: "URL inválida" };
      }

      const publicIdParts = urlParts.slice(uploadIndex + 2); // Pular 'upload' e versão
      const publicId = publicIdParts.join("/").split(".")[0]; // Remover extensão

      // Verificar se arquivo existe
      const result = await cloudinary.api.resource(publicId);

      return {
        success: true,
        exists: !!result,
      };
    } catch (error: any) {
      // Se erro 404, arquivo não existe
      if (error.http_code === 404) {
        return {
          success: true,
          exists: false,
        };
      }

      return {
        success: false,
        exists: false,
        error: error.message,
      };
    }
  }

  private buildStructuredFolderPath(
    options: StructuredDocumentUploadOptions,
  ): string {
    const segments = ["magiclawyer"];
    const tenantSegment = this.toPathSegment(options.tenantSlug, "tenant");

    segments.push(tenantSegment);

    switch (options.categoria) {
      case "processo": {
        if (options.cliente) {
          segments.push("clientes");
          segments.push(
            `${this.toPathSegment(options.cliente.nome, "cliente")}-${options.cliente.id}`,
          );
        }

        segments.push("processos");

        if (options.processo) {
          const processTag = options.processo.numero || options.processo.id;

          segments.push(
            `${this.toPathSegment(processTag, "processo")}-${options.processo.id}`,
          );
        }

        break;
      }
      case "cliente": {
        segments.push("clientes");

        if (options.cliente) {
          segments.push(
            `${this.toPathSegment(options.cliente.nome, "cliente")}-${options.cliente.id}`,
          );
        }

        segments.push("documentos");
        break;
      }
      case "procuracao": {
        segments.push("procuracoes");

        if (options.referencia) {
          const refTag =
            options.referencia.etiqueta ||
            `procuracao-${options.referencia.id}`;

          segments.push(
            `${this.toPathSegment(refTag, "procuracao")}-${options.referencia.id}`,
          );
        }

        break;
      }
      case "contrato": {
        segments.push("contratos");

        if (options.referencia) {
          const refTag =
            options.referencia.etiqueta || `contrato-${options.referencia.id}`;

          segments.push(
            `${this.toPathSegment(refTag, "contrato")}-${options.referencia.id}`,
          );
        }

        break;
      }
      default: {
        segments.push("documentos");

        if (options.referencia) {
          const refTag =
            options.referencia.etiqueta ||
            `referencia-${options.referencia.id}`;

          segments.push(
            `${this.toPathSegment(refTag, "referencia")}-${options.referencia.id}`,
          );
        }

        break;
      }
    }

    if (options.subpastas?.length) {
      for (const folder of options.subpastas) {
        segments.push(this.toPathSegment(folder, "pasta"));
      }
    }

    return segments.join("/");
  }

  private toPathSegment(value?: string | null, fallback = "item"): string {
    if (!value) return fallback;

    const normalized = value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

    return normalized || fallback;
  }

  private normalizeResourceType(
    resourceType: CloudinaryResourceType,
  ): "image" | "raw" | "video" | "auto" {
    switch (resourceType) {
      case "image":
        return "image";
      case "video":
        return "video";
      case "auto":
        return "auto";
      default:
        return "raw";
    }
  }

  private detectResourceType(
    contentType?: string | null,
    fileName?: string,
  ): CloudinaryResourceType {
    if (contentType) {
      if (contentType.startsWith("image/")) {
        return "image";
      }

      if (contentType.startsWith("video/")) {
        return "video";
      }

      if (contentType === "application/pdf") {
        return "raw";
      }
    }

    if (fileName) {
      const extension = fileName.split(".").pop()?.toLowerCase();

      if (extension) {
        if (["jpg", "jpeg", "png", "gif", "webp", "heic"].includes(extension)) {
          return "image";
        }

        if (["mp4", "mov", "avi", "mkv", "webm"].includes(extension)) {
          return "video";
        }

        if (
          ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx"].includes(
            extension,
          )
        ) {
          return "raw";
        }
      }
    }

    return "raw";
  }

  private guessMimeTypeFromName(fileName: string): string {
    const extension = fileName.split(".").pop()?.toLowerCase();

    if (!extension) {
      return "application/octet-stream";
    }

    if (extension === "pdf") return "application/pdf";
    if (extension === "png") return "image/png";
    if (["jpg", "jpeg"].includes(extension)) return "image/jpeg";
    if (extension === "gif") return "image/gif";
    if (["webp", "heic"].includes(extension)) return "image/webp";
    if (extension === "mp4") return "video/mp4";
    if (extension === "mov") return "video/quicktime";
    if (extension === "webm") return "video/webm";
    if (extension === "doc") return "application/msword";
    if (extension === "docx")
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    if (extension === "xls") return "application/vnd.ms-excel";
    if (extension === "xlsx")
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    if (extension === "ppt") return "application/vnd.ms-powerpoint";
    if (extension === "pptx")
      return "application/vnd.openxmlformats-officedocument.presentationml.presentation";

    return "application/octet-stream";
  }

  /**
   * Limpar nome do arquivo para ser compatível com Cloudinary
   */
  private cleanFileName(fileName: string): string {
    return fileName
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // Remove acentos
      .replace(/[^a-z0-9\-_]/g, "_") // Substitui caracteres especiais por underscore
      .replace(/_+/g, "_") // Remove underscores duplicados
      .replace(/^_|_$/g, ""); // Remove underscores do início e fim
  }
}
