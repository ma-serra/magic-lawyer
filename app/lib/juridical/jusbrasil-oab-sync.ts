import prisma from "@/app/lib/prisma";
import {
  JusbrasilApiError,
  JusbrasilClient,
  type JusbrasilOabMonitor,
  normalizeJusbrasilApiKey,
  resolveJusbrasilApiBaseUrl,
} from "@/lib/api/juridical/jusbrasil";

export const AUDIT_ACTION_SYNC_OAB = "SINCRONIZACAO_INICIAL_OAB_PROCESSOS";

export type OabSyncAuditStatus =
  | "SUCESSO"
  | "ERRO"
  | "PENDENTE_CAPTCHA"
  | "AGUARDANDO_WEBHOOK";

export type OabSyncAuditOrigin =
  | "INICIO"
  | "CAPTCHA"
  | "BACKGROUND_INITIAL"
  | "BACKGROUND_CAPTCHA"
  | "JUSBRASIL_REGISTRO"
  | "JUSBRASIL_WEBHOOK";

export type OabSyncAuditPayload = {
  origem: OabSyncAuditOrigin;
  status: OabSyncAuditStatus;
  tribunalSigla: string;
  oab: string;
  syncedCount: number;
  createdCount: number;
  updatedCount: number;
  processosNumeros: string[];
  error: string | null;
  captchaRequired?: boolean;
  provider?: "SCRAPING" | "JUSBRASIL";
  mode?: "SYNC" | "ASYNC_WEBHOOK";
  correlationId?: string | null;
  monitorId?: number | null;
  syncId?: string | null;
  advogadoId?: string | null;
  clienteNome?: string | null;
  webhookUrl?: string | null;
  existingMonitor?: boolean;
};

export type RegisteredJusbrasilMonitor = {
  monitor: JusbrasilOabMonitor;
  existed: boolean;
};

export type JusbrasilSyncBinding = {
  tenantId: string;
  usuarioId: string | null;
  tribunalSigla: string;
  oab: string;
  syncId?: string;
  advogadoId?: string;
  clienteNome?: string;
};

export type TenantJusbrasilIntegrationState = {
  globalConfigured: boolean;
  integracaoAtiva: boolean;
  enabled: boolean;
  configId: string | null;
  ultimaValidacao: Date | null;
  lastWebhookAt: Date | null;
  lastWebhookEvent: string | null;
};

function stripWrappingQuotes(value: string) {
  return value.replace(/^['"]+|['"]+$/g, "");
}

function normalizeOriginValue(value?: string | null) {
  if (!value) return "";
  const trimmed = stripWrappingQuotes(value).trim();
  if (!trimmed) return "";

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed.replace(/\/+$/, "");
  }

  return `https://${trimmed.replace(/^\/+/, "").replace(/\/+$/, "")}`;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function buildJusbrasilExpectedWebhookUrl() {
  const candidates = [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXTAUTH_URL,
    process.env.BASE_URL,
    process.env.VERCEL_URL,
    "https://magiclawyer.vercel.app",
  ];

  for (const candidate of candidates) {
    const origin = normalizeOriginValue(candidate);
    if (!origin) continue;

    return `${origin}/api/webhooks/jusbrasil`;
  }

  return "https://magiclawyer.vercel.app/api/webhooks/jusbrasil";
}

export function normalizeComparableUrl(value?: string | null) {
  return normalizeOriginValue(value || "").replace(/\/+$/, "");
}

export function isJusbrasilGloballyConfigured() {
  return Boolean(normalizeJusbrasilApiKey(process.env.JUSBRASIL_API_KEY));
}

export function isJusbrasilOabSyncEnabled() {
  return isJusbrasilGloballyConfigured();
}

export function getJusbrasilClientFromEnv() {
  const apiKey = normalizeJusbrasilApiKey(process.env.JUSBRASIL_API_KEY);
  if (!apiKey) {
    return null;
  }

  return new JusbrasilClient(
    apiKey,
    resolveJusbrasilApiBaseUrl(process.env.JUSBRASIL_API_BASE_URL),
  );
}

export async function getTenantJusbrasilIntegrationState(
  tenantId: string,
): Promise<TenantJusbrasilIntegrationState> {
  const config = await prisma.tenantJusbrasilConfig.findUnique({
    where: { tenantId },
    select: {
      id: true,
      integracaoAtiva: true,
      ultimaValidacao: true,
      lastWebhookAt: true,
      lastWebhookEvent: true,
    },
  });

  const globalConfigured = isJusbrasilGloballyConfigured();
  const integracaoAtiva = config?.integracaoAtiva ?? true;

  return {
    globalConfigured,
    integracaoAtiva,
    enabled: globalConfigured && integracaoAtiva,
    configId: config?.id ?? null,
    ultimaValidacao: config?.ultimaValidacao ?? null,
    lastWebhookAt: config?.lastWebhookAt ?? null,
    lastWebhookEvent: config?.lastWebhookEvent ?? null,
  };
}

export async function isJusbrasilIntegrationEnabledForTenant(tenantId: string) {
  const state = await getTenantJusbrasilIntegrationState(tenantId);
  return state.enabled;
}

export async function touchTenantJusbrasilWebhookActivity(params: {
  tenantId: string;
  event: string;
}) {
  await prisma.tenantJusbrasilConfig.updateMany({
    where: { tenantId: params.tenantId },
    data: {
      lastWebhookAt: new Date(),
      lastWebhookEvent: params.event,
    },
  });
}

export function parseOabMonitorTarget(value: string) {
  const sanitized = value.replace(/[^0-9A-Za-z]/g, "").toUpperCase().trim();

  let match = sanitized.match(/^(\d+)([A-Z]?)([A-Z]{2})$/);
  if (match) {
    return {
      normalized: sanitized,
      number: Number.parseInt(match[1], 10),
      supplementaryLetter: match[2] || null,
      region: match[3],
    };
  }

  match = sanitized.match(/^([A-Z]{2})(\d+)([A-Z]?)$/);
  if (match) {
    return {
      normalized: sanitized,
      number: Number.parseInt(match[2], 10),
      supplementaryLetter: match[3] || null,
      region: match[1],
    };
  }

  throw new Error("Formato de OAB invalido. Use, por exemplo, 123456SP.");
}

export async function registerOrRefreshJusbrasilMonitor(params: {
  oab: string;
  name: string;
}): Promise<RegisteredJusbrasilMonitor> {
  const client = getJusbrasilClientFromEnv();

  if (!client) {
    throw new Error("JUSBRASIL_API_KEY nao configurada");
  }

  const target = parseOabMonitorTarget(params.oab);

  try {
    const existing = await client.getOabMonitorByNumberAndRegion(
      target.region,
      target.number,
    );

    const refreshed = await client.updateOabMonitor(existing.id, {
      is_active: true,
      name: params.name,
      supplementary_letter: target.supplementaryLetter,
    });

    return {
      monitor: refreshed,
      existed: true,
    };
  } catch (error) {
    if (!(error instanceof JusbrasilApiError) || error.status !== 404) {
      throw error;
    }
  }

  const created = await client.createOabMonitors([
    {
      name: params.name,
      number: target.number,
      region: target.region,
      supplementary_letter: target.supplementaryLetter,
      is_active: true,
    },
  ]);

  const monitor = created[0];

  if (!monitor) {
    throw new Error("Jusbrasil nao retornou monitoramento apos o cadastro da OAB.");
  }

  return {
    monitor,
    existed: false,
  };
}

export async function createOabSyncAuditEntry(params: {
  tenantId: string;
  usuarioId: string | null;
  tribunalSigla: string;
  oab: string;
  status: OabSyncAuditStatus;
  origem: OabSyncAuditOrigin;
  syncedCount?: number;
  createdCount?: number;
  updatedCount?: number;
  processosNumeros?: string[];
  error?: string;
  entidadeId?: string | null;
  captchaRequired?: boolean;
  provider?: "SCRAPING" | "JUSBRASIL";
  mode?: "SYNC" | "ASYNC_WEBHOOK";
  correlationId?: string | null;
  monitorId?: number | null;
  syncId?: string | null;
  advogadoId?: string | null;
  clienteNome?: string | null;
  webhookUrl?: string | null;
  existingMonitor?: boolean;
}) {
  const payload = Object.fromEntries(
    Object.entries({
      origem: params.origem,
      status: params.status,
      tribunalSigla: params.tribunalSigla,
      oab: params.oab,
      syncedCount: params.syncedCount ?? 0,
      createdCount: params.createdCount ?? 0,
      updatedCount: params.updatedCount ?? 0,
      processosNumeros: (params.processosNumeros ?? []).slice(0, 50),
      error: params.error ?? null,
      captchaRequired: params.captchaRequired,
      provider: params.provider,
      mode: params.mode,
      correlationId: params.correlationId ?? null,
      monitorId: params.monitorId ?? null,
      syncId: params.syncId ?? null,
      advogadoId: params.advogadoId ?? null,
      clienteNome: params.clienteNome ?? null,
      webhookUrl: params.webhookUrl ?? null,
      existingMonitor: params.existingMonitor,
    }).filter(([, value]) => value !== undefined),
  ) as OabSyncAuditPayload;

  await prisma.auditLog.create({
    data: {
      tenantId: params.tenantId,
      usuarioId: params.usuarioId,
      acao: AUDIT_ACTION_SYNC_OAB,
      entidade: "Processo",
      entidadeId: params.entidadeId ?? null,
      dados: payload,
      changedFields: [],
    },
  });
}

export async function resolveJusbrasilSyncBinding(
  correlationId: string,
): Promise<JusbrasilSyncBinding | null> {
  const entries = await prisma.auditLog.findMany({
    where: {
      acao: AUDIT_ACTION_SYNC_OAB,
      entidadeId: correlationId,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 10,
    select: {
      tenantId: true,
      usuarioId: true,
      dados: true,
    },
  });

  for (const entry of entries) {
    if (!isRecord(entry.dados)) {
      continue;
    }

    const payload = entry.dados;
    const provider = readString(payload.provider);
    const mode = readString(payload.mode);

    if (provider !== "JUSBRASIL" || mode !== "ASYNC_WEBHOOK") {
      continue;
    }

    const tribunalSigla = readString(payload.tribunalSigla);
    const oab = readString(payload.oab);

    if (!tribunalSigla || !oab) {
      continue;
    }

    const binding: JusbrasilSyncBinding = {
      tenantId: entry.tenantId,
      usuarioId: entry.usuarioId,
      tribunalSigla,
      oab,
    };

    const syncId = readString(payload.syncId);
    const advogadoId = readString(payload.advogadoId);
    const clienteNome = readString(payload.clienteNome);

    if (syncId) {
      binding.syncId = syncId;
    }

    if (advogadoId) {
      binding.advogadoId = advogadoId;
    }

    if (clienteNome) {
      binding.clienteNome = clienteNome;
    }

    return binding;
  }

  return null;
}

export function readOabSyncAuditPayload(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }

  const tribunalSigla = readString(value.tribunalSigla);
  const oab = readString(value.oab);
  const origem = readString(value.origem) as OabSyncAuditOrigin | undefined;
  const status = readString(value.status) as OabSyncAuditStatus | undefined;

  if (!tribunalSigla || !oab || !origem || !status) {
    return null;
  }

  return {
    origem,
    status,
    tribunalSigla,
    oab,
    syncedCount: readNumber(value.syncedCount) ?? 0,
    createdCount: readNumber(value.createdCount) ?? 0,
    updatedCount: readNumber(value.updatedCount) ?? 0,
    error: readString(value.error),
    correlationId: readString(value.correlationId),
    provider: readString(value.provider),
    mode: readString(value.mode),
    syncId: readString(value.syncId),
    existingMonitor: readBoolean(value.existingMonitor),
  };
}
