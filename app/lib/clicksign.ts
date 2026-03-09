import axios from "axios";
import { randomUUID } from "crypto";

import prisma from "./prisma";
import {
  type ClicksignAmbiente,
  getDefaultClicksignApiBase,
  inferClicksignAmbiente,
  normalizeClicksignApiBase,
} from "./clicksign-config";

import { decrypt } from "@/lib/crypto";
import logger from "@/lib/logger";

export type ClicksignConfigSource = "TENANT" | "GLOBAL" | "MOCK";

export interface ResolvedClicksignConfig {
  apiBase: string;
  accessToken: string;
  ambiente: ClicksignAmbiente;
  source: ClicksignConfigSource;
  tenantId: string | null;
  integracaoAtiva: boolean;
}

export interface ClicksignRequestOptions {
  tenantId?: string | null;
  config?: ResolvedClicksignConfig;
}

export interface ClickSignDocument {
  key: string;
  filename: string;
  upload_at: string;
  updated_at: string;
  finished_at?: string;
  deadline_at?: string;
  status: "pending" | "signed" | "rejected" | "expired" | "cancelled";
  downloads: {
    signed_file_url?: string;
    original_file_url: string;
  };
  signers: ClickSignSigner[];
}

export interface ClickSignSigner {
  key: string;
  email: string;
  auths: string[];
  name: string;
  documentation: string;
  birthday: string;
  has_documentation: boolean;
  selfie_enabled: boolean;
  handwritten_enabled: boolean;
  official_document_enabled: boolean;
  liveness_enabled: boolean;
  facial_biometrics_enabled: boolean;
  status: "pending" | "signed" | "rejected" | "expired" | "cancelled";
  created_at: string;
  updated_at: string;
  signed_at?: string;
  rejected_at?: string;
  message?: string;
}

export interface CreateDocumentRequest {
  document: {
    path: string;
    content_base64: string;
    deadline_at?: string;
    auto_close?: boolean;
    locale?: string;
    sequence_enabled?: boolean;
    remind_interval?: number;
  };
}

export interface AddSignerRequest {
  signer: {
    email: string;
    phone_number?: string;
    auths: string[];
    name: string;
    documentation: string;
    birthday: string;
    delivery: string;
    message?: string;
  };
}

export interface ClickSignApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

type MockClicksignDocumentRecord = {
  document: ClickSignDocument;
  signers: Map<string, ClickSignSigner>;
  signingUrls: Map<string, string>;
  originalContentBase64: string;
  signedContentBase64?: string;
};

const mockClicksignDocuments = new Map<string, MockClicksignDocumentRecord>();

function isClicksignMockModeEnabled(): boolean {
  return process.env.CLICKSIGN_MOCK_MODE?.trim().toLowerCase() === "true";
}

function getMockClicksignApiBase(): string {
  return "mock://clicksign/api/v1";
}

function getMockClicksignAppBaseUrl(): string {
  const envBase =
    process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.NEXTAUTH_URL?.trim();

  if (envBase) {
    return envBase.replace(/\/+$/, "");
  }

  const port = process.env.PORT?.trim() || "9192";
  return `http://localhost:${port}`;
}

function buildMockSigningUrl(documentKey: string, signerKey: string): string {
  return `${getMockClicksignAppBaseUrl()}/mock/clicksign/${documentKey}/${signerKey}`;
}

function buildMockDownloadUrl(
  documentKey: string,
  fileType: "original" | "signed",
): string {
  return `${getMockClicksignAppBaseUrl()}/api/mock/clicksign/downloads/${documentKey}/${fileType}`;
}

export function resetMockClicksignState() {
  mockClicksignDocuments.clear();
}

export function updateMockClicksignDocumentStatus(
  documentKey: string,
  status: ClickSignDocument["status"],
) {
  const record = mockClicksignDocuments.get(documentKey);

  if (!record) {
    return false;
  }

  const nowIso = new Date().toISOString();

  record.document.status = status;
  record.document.updated_at = nowIso;
  record.document.finished_at = status === "signed" ? nowIso : undefined;
  record.document.downloads.signed_file_url =
    status === "signed"
      ? buildMockDownloadUrl(documentKey, "signed")
      : undefined;
  record.signedContentBase64 =
    status === "signed" ? record.originalContentBase64 : undefined;

  for (const signer of record.signers.values()) {
    signer.status = status;
    signer.updated_at = nowIso;
    signer.signed_at = status === "signed" ? nowIso : undefined;
    signer.rejected_at = status === "rejected" ? nowIso : undefined;
  }

  record.document.signers = Array.from(record.signers.values());

  return true;
}

export function getMockClicksignSigningSession(
  documentKey: string,
  signerKey: string,
) {
  const record = mockClicksignDocuments.get(documentKey);

  if (!record) {
    return null;
  }

  const signer = record.signers.get(signerKey);
  const signingUrl = record.signingUrls.get(signerKey);

  if (!signer || !signingUrl) {
    return null;
  }

  return {
    document: record.document,
    signer,
    signingUrl,
  };
}

export function completeMockClicksignSignature(
  documentKey: string,
  signerKey: string,
  status: "signed" | "rejected" = "signed",
) {
  const session = getMockClicksignSigningSession(documentKey, signerKey);

  if (!session) {
    return false;
  }

  return updateMockClicksignDocumentStatus(documentKey, status);
}

export function getMockClicksignDownload(
  documentKey: string,
  fileType: "original" | "signed",
) {
  const record = mockClicksignDocuments.get(documentKey);

  if (!record) {
    return null;
  }

  const contentBase64 =
    fileType === "signed"
      ? record.signedContentBase64 || null
      : record.originalContentBase64;

  if (!contentBase64) {
    return null;
  }

  return {
    filename: record.document.filename,
    contentBase64,
    contentType: "application/pdf",
  };
}

function buildGlobalClicksignConfig(): ResolvedClicksignConfig | null {
  const accessToken = process.env.CLICKSIGN_ACCESS_TOKEN?.trim();

  if (accessToken) {
    const rawApiBase = process.env.CLICKSIGN_API_BASE?.trim() || null;
    const ambiente = inferClicksignAmbiente(rawApiBase);

    return {
      apiBase: normalizeClicksignApiBase(rawApiBase, ambiente),
      accessToken,
      ambiente,
      source: "GLOBAL",
      tenantId: null,
      integracaoAtiva: true,
    };
  }

  if (isClicksignMockModeEnabled()) {
    return {
      apiBase: getMockClicksignApiBase(),
      accessToken: "mock-clicksign-token",
      ambiente: "SANDBOX",
      source: "MOCK",
      tenantId: null,
      integracaoAtiva: true,
    };
  }

  return null;
}

export function getGlobalClicksignFallbackSummary() {
  const config = buildGlobalClicksignConfig();
  const source: "GLOBAL" | "MOCK" = config?.source === "MOCK" ? "MOCK" : "GLOBAL";

  return {
    available: Boolean(config),
    source,
    mockMode: source === "MOCK",
    apiBase:
      config?.apiBase ||
      normalizeClicksignApiBase(
        process.env.CLICKSIGN_API_BASE?.trim() || null,
        inferClicksignAmbiente(process.env.CLICKSIGN_API_BASE?.trim() || null),
      ) ||
      getDefaultClicksignApiBase("SANDBOX"),
    ambiente:
      config?.ambiente ||
      inferClicksignAmbiente(process.env.CLICKSIGN_API_BASE?.trim() || null),
  } as const;
}

export async function getResolvedClicksignConfig(
  tenantId?: string | null,
): Promise<ResolvedClicksignConfig | null> {
  if (tenantId) {
    const config = await prisma.clicksignTenantConfig.findUnique({
      where: { tenantId },
      select: {
        apiBase: true,
        accessTokenEncrypted: true,
        ambiente: true,
        integracaoAtiva: true,
      },
    });

    if (config) {
      if (!config.integracaoAtiva) {
        return null;
      }

      return {
        apiBase: normalizeClicksignApiBase(config.apiBase, config.ambiente),
        accessToken: decrypt(config.accessTokenEncrypted),
        ambiente: config.ambiente,
        source: "TENANT",
        tenantId,
        integracaoAtiva: config.integracaoAtiva,
      };
    }
  }

  return buildGlobalClicksignConfig();
}

async function ensureClicksignConfig(
  options: ClicksignRequestOptions = {},
): Promise<ResolvedClicksignConfig> {
  const resolved = options.config ?? (await getResolvedClicksignConfig(options.tenantId));

  if (!resolved?.accessToken?.trim()) {
    throw new Error(
      options.tenantId
        ? "ClickSign não configurado para este tenant."
        : "ClickSign não configurado.",
    );
  }

  return resolved;
}

function extractClicksignError(error: unknown): string {
  if (!axios.isAxiosError(error)) {
    return error instanceof Error ? error.message : "Erro desconhecido";
  }

  const responseData = error.response?.data as
    | { message?: string; errors?: Array<{ detail?: string }> }
    | undefined;

  return (
    responseData?.message ||
    responseData?.errors?.[0]?.detail ||
    error.message ||
    "Erro desconhecido"
  );
}

function buildMockDocumentFromRequest(
  requestData: CreateDocumentRequest,
): ClickSignDocument {
  const nowIso = new Date().toISOString();
  const documentKey = `mock-doc-${randomUUID()}`;
  const normalizedFilename = requestData.document.path.replace(/^\/+/, "");

  return {
    key: documentKey,
    filename: normalizedFilename || "documento-mock.pdf",
    upload_at: nowIso,
    updated_at: nowIso,
    deadline_at: requestData.document.deadline_at,
    status: "pending",
    downloads: {
      original_file_url: buildMockDownloadUrl(documentKey, "original"),
      signed_file_url: undefined,
    },
    signers: [],
  };
}

function buildMockSignerFromRequest(requestData: AddSignerRequest): ClickSignSigner {
  const nowIso = new Date().toISOString();

  return {
    key: `mock-signer-${randomUUID()}`,
    email: requestData.signer.email,
    auths: requestData.signer.auths,
    name: requestData.signer.name,
    documentation: requestData.signer.documentation,
    birthday: requestData.signer.birthday,
    has_documentation: Boolean(requestData.signer.documentation),
    selfie_enabled: false,
    handwritten_enabled: false,
    official_document_enabled: false,
    liveness_enabled: false,
    facial_biometrics_enabled: false,
    status: "pending",
    created_at: nowIso,
    updated_at: nowIso,
    message: requestData.signer.message,
  };
}

function handleMockClicksignRequest<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  endpoint: string,
  data?: unknown,
): ClickSignApiResponse<T> {
  const normalizedUrl = new URL(
    endpoint.startsWith("/") ? endpoint : `/${endpoint}`,
    "https://mock.clicksign.local",
  );
  const pathname = normalizedUrl.pathname;
  const segments = pathname.split("/").filter(Boolean);

  if (method === "POST" && pathname === "/documents") {
    const requestData = data as CreateDocumentRequest;
    const document = buildMockDocumentFromRequest(requestData);

    mockClicksignDocuments.set(document.key, {
      document,
      signers: new Map(),
      signingUrls: new Map(),
      originalContentBase64: requestData.document.content_base64,
    });

    return {
      success: true,
      data: document as T,
    };
  }

  if (
    method === "POST" &&
    segments[0] === "documents" &&
    segments[2] === "signers" &&
    segments.length === 3
  ) {
    const documentKey = segments[1];
    const requestData = data as AddSignerRequest;
    const record = mockClicksignDocuments.get(documentKey);

    if (!record) {
      return { success: false, error: "Documento mock não encontrado" };
    }

    const signer = buildMockSignerFromRequest(requestData);
    const signingUrl = buildMockSigningUrl(documentKey, signer.key);

    record.signers.set(signer.key, signer);
    record.signingUrls.set(signer.key, signingUrl);
    record.document.signers = Array.from(record.signers.values());
    record.document.updated_at = new Date().toISOString();

    return {
      success: true,
      data: signer as T,
    };
  }

  if (method === "GET" && pathname === "/documents") {
    return {
      success: true,
      data: {
        documents: Array.from(mockClicksignDocuments.values()).map(
          (record) => record.document,
        ),
      } as T,
    };
  }

  if (segments[0] !== "documents" || segments.length < 2) {
    return { success: false, error: "Endpoint mock do ClickSign inválido" };
  }

  const documentKey = segments[1];
  const record = mockClicksignDocuments.get(documentKey);

  if (!record) {
    return { success: false, error: "Documento mock não encontrado" };
  }

  if (method === "GET" && segments.length === 2) {
    return {
      success: true,
      data: record.document as T,
    };
  }

  if (
    method === "GET" &&
    segments[2] === "signers" &&
    segments.length === 4
  ) {
    const signer = record.signers.get(segments[3]);

    if (!signer) {
      return { success: false, error: "Signatário mock não encontrado" };
    }

    return {
      success: true,
      data: signer as T,
    };
  }

  if (
    method === "GET" &&
    segments[2] === "signers" &&
    segments[4] === "signing_url" &&
    segments.length === 5
  ) {
    const signerKey = segments[3];
    const signingUrl = record.signingUrls.get(signerKey);

    if (!signingUrl) {
      return { success: false, error: "URL de assinatura mock não encontrada" };
    }

    return {
      success: true,
      data: { url: signingUrl } as T,
    };
  }

  if (method === "DELETE" && segments.length === 2) {
    updateMockClicksignDocumentStatus(documentKey, "cancelled");

    return {
      success: true,
      data: {} as T,
    };
  }

  return { success: false, error: "Operação mock do ClickSign não suportada" };
}

const makeAuthenticatedRequest = async <T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  endpoint: string,
  data?: unknown,
  options: ClicksignRequestOptions = {},
): Promise<ClickSignApiResponse<T>> => {
  let resolvedConfig: ResolvedClicksignConfig | null = null;

  try {
    resolvedConfig = await ensureClicksignConfig(options);
    const normalizedEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;

    if (resolvedConfig.source === "MOCK") {
      return handleMockClicksignRequest<T>(method, normalizedEndpoint, data);
    }

    const response = await axios({
      method,
      url: `${resolvedConfig.apiBase}${normalizedEndpoint}`,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${resolvedConfig.accessToken}`,
      },
      data,
      timeout: 20_000,
    });

    return {
      success: true,
      data: response.data,
    };
  } catch (error) {
    logger.error("Erro na requisição ClickSign:", error);

    return {
      success: false,
      error:
        extractClicksignError(error) ||
        (resolvedConfig?.source === "TENANT"
          ? "Falha ao acessar ClickSign do tenant"
          : resolvedConfig?.source === "MOCK"
            ? "Falha no mock local do ClickSign"
            : "Falha ao acessar ClickSign global"),
    };
  }
};

export async function testClicksignConnection(
  options: ClicksignRequestOptions & {
    apiBase?: string;
    accessToken?: string;
    ambiente?: ClicksignAmbiente;
  } = {},
): Promise<
  ClickSignApiResponse<{
    connected: boolean;
    source: ClicksignConfigSource;
    ambiente: ClicksignAmbiente;
  }>
> {
  try {
    const trimmedAccessToken = options.accessToken?.trim() || null;

    const config = trimmedAccessToken
      ? {
          apiBase: normalizeClicksignApiBase(
            options.apiBase,
            options.ambiente || "SANDBOX",
          ),
          accessToken: trimmedAccessToken,
          ambiente: options.ambiente || inferClicksignAmbiente(options.apiBase),
          source: "TENANT" as const,
          tenantId: options.tenantId ?? null,
          integracaoAtiva: true,
        }
      : await ensureClicksignConfig(options);

    const result = await makeAuthenticatedRequest<{ documents?: ClickSignDocument[] }>(
      "GET",
      "/documents?page=1&per_page=1",
      undefined,
      { config },
    );

    if (!result.success) {
      return {
        success: false,
        error: result.error || "Falha ao validar conexão com ClickSign",
      };
    }

    return {
      success: true,
      data: {
        connected: true,
        source: config.source,
        ambiente: config.ambiente,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: extractClicksignError(error),
    };
  }
}

export const createDocument = async (
  filename: string,
  fileContent: Buffer,
  deadlineAt?: Date,
  autoClose: boolean = true,
  options: ClicksignRequestOptions = {},
): Promise<ClickSignApiResponse<ClickSignDocument>> => {
  const contentBase64 = fileContent.toString("base64");

  const requestData: CreateDocumentRequest = {
    document: {
      path: `/${filename}`,
      content_base64: contentBase64,
      auto_close: autoClose,
      locale: "pt-BR",
      sequence_enabled: false,
    },
  };

  if (deadlineAt) {
    requestData.document.deadline_at = deadlineAt.toISOString();
  }

  return makeAuthenticatedRequest<ClickSignDocument>(
    "POST",
    "/documents",
    requestData,
    options,
  );
};

export const addSignerToDocument = async (
  documentKey: string,
  signerData: {
    email: string;
    name: string;
    document: string;
    birthday: string;
    phone?: string;
    message?: string;
  },
  options: ClicksignRequestOptions = {},
): Promise<ClickSignApiResponse<ClickSignSigner>> => {
  const requestData: AddSignerRequest = {
    signer: {
      email: signerData.email,
      phone_number: signerData.phone,
      auths: ["email"],
      name: signerData.name,
      documentation: signerData.document,
      birthday: signerData.birthday,
      delivery: "email",
      message: signerData.message,
    },
  };

  return makeAuthenticatedRequest<ClickSignSigner>(
    "POST",
    `/documents/${documentKey}/signers`,
    requestData,
    options,
  );
};

export const getDocument = async (
  documentKey: string,
  options: ClicksignRequestOptions = {},
): Promise<ClickSignApiResponse<ClickSignDocument>> => {
  return makeAuthenticatedRequest<ClickSignDocument>(
    "GET",
    `/documents/${documentKey}`,
    undefined,
    options,
  );
};

export const getSigner = async (
  documentKey: string,
  signerKey: string,
  options: ClicksignRequestOptions = {},
): Promise<ClickSignApiResponse<ClickSignSigner>> => {
  return makeAuthenticatedRequest<ClickSignSigner>(
    "GET",
    `/documents/${documentKey}/signers/${signerKey}`,
    undefined,
    options,
  );
};

export const cancelDocument = async (
  documentKey: string,
  options: ClicksignRequestOptions = {},
): Promise<ClickSignApiResponse> => {
  return makeAuthenticatedRequest("DELETE", `/documents/${documentKey}`, undefined, options);
};

export const listDocuments = async (
  page: number = 1,
  perPage: number = 20,
  options: ClicksignRequestOptions = {},
): Promise<ClickSignApiResponse<{ documents: ClickSignDocument[] }>> => {
  return makeAuthenticatedRequest<{ documents: ClickSignDocument[] }>(
    "GET",
    `/documents?page=${page}&per_page=${perPage}`,
    undefined,
    options,
  );
};

export const getSigningUrl = async (
  documentKey: string,
  signerKey: string,
  options: ClicksignRequestOptions = {},
): Promise<ClickSignApiResponse<{ url: string }>> => {
  return makeAuthenticatedRequest<{ url: string }>(
    "GET",
    `/documents/${documentKey}/signers/${signerKey}/signing_url`,
    undefined,
    options,
  );
};

export const sendDocumentForSigning = async (documentData: {
  tenantId?: string | null;
  filename: string;
  fileContent: Buffer;
  signer: {
    email: string;
    name: string;
    document: string;
    birthday: string;
    phone?: string;
  };
  deadlineAt?: Date;
  message?: string;
}): Promise<
  ClickSignApiResponse<{
    document: ClickSignDocument;
    signer: ClickSignSigner;
    signingUrl: string;
  }>
> => {
  try {
    const config = await ensureClicksignConfig({ tenantId: documentData.tenantId });

    const documentResult = await createDocument(
      documentData.filename,
      documentData.fileContent,
      documentData.deadlineAt,
      true,
      { config },
    );

    if (!documentResult.success || !documentResult.data) {
      return {
        success: false,
        error: documentResult.error || "Erro ao criar documento",
      };
    }

    const document = documentResult.data;

    const signerResult = await addSignerToDocument(
      document.key,
      {
        ...documentData.signer,
        message: documentData.message,
      },
      { config },
    );

    if (!signerResult.success || !signerResult.data) {
      return {
        success: false,
        error: signerResult.error || "Erro ao adicionar signatário",
      };
    }

    const signer = signerResult.data;

    const urlResult = await getSigningUrl(document.key, signer.key, { config });

    if (!urlResult.success || !urlResult.data) {
      return {
        success: false,
        error: urlResult.error || "Erro ao obter URL de assinatura",
      };
    }

    return {
      success: true,
      data: {
        document,
        signer,
        signingUrl: urlResult.data.url,
      },
    };
  } catch (error) {
    logger.error("Erro ao enviar documento para assinatura:", error);

    return {
      success: false,
      error: extractClicksignError(error),
    };
  }
};

export const checkDocumentStatus = async (
  documentKey: string,
  options: ClicksignRequestOptions = {},
): Promise<
  ClickSignApiResponse<{
    status: string;
    signedAt?: string;
    downloadUrl?: string;
  }>
> => {
  try {
    const result = await getDocument(documentKey, options);

    if (!result.success || !result.data) {
      return {
        success: false,
        error: result.error || "Erro ao obter documento",
      };
    }

    const document = result.data;

    return {
      success: true,
      data: {
        status: document.status,
        signedAt: document.finished_at,
        downloadUrl: document.downloads.signed_file_url,
      },
    };
  } catch (error) {
    logger.error("Erro ao verificar status do documento:", error);

    return {
      success: false,
      error: extractClicksignError(error),
    };
  }
};
