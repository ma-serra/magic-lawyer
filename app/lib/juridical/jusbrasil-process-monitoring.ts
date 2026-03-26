import prisma from "@/app/lib/prisma";
import logger from "@/lib/logger";
import {
  JusbrasilApiError,
  type JusbrasilProcessMonitor,
} from "@/lib/api/juridical/jusbrasil";
import {
  getJusbrasilClientFromEnv,
  getTenantJusbrasilIntegrationState,
} from "@/app/lib/juridical/jusbrasil-oab-sync";

export const AUDIT_ACTION_JUSBRASIL_PROCESS_MONITOR =
  "JUSBRASIL_PROCESSO_MONITOR";

const JUSBRASIL_PROCESS_USER_CUSTOM_PREFIX = "mlproc:v1";

export type JusbrasilProcessMonitorAuditPayload = {
  provider: "JUSBRASIL";
  source: "PROCESS_MONITOR";
  status: "SYNCED" | "ERROR";
  processoId: string;
  numeroProcesso: string;
  numeroNormalizado: string;
  userCustom: string;
  monitorId?: number | null;
  monitorUri?: string | null;
  isMonitoredTribunal: boolean;
  isMonitoredDiario: boolean;
  instancia?: number | null;
  error?: string | null;
};

export type EnsureJusbrasilProcessMonitorParams = {
  tenantId: string;
  processoId: string;
  numeroProcesso?: string | null;
  usuarioId?: string | null;
  isMonitoredTribunal?: boolean;
  isMonitoredDiario?: boolean;
  instancia?: number | null;
};

export type EnsureJusbrasilProcessMonitorResult = {
  enabled: boolean;
  synced: boolean;
  existed: boolean;
  userCustom: string | null;
  monitorId: number | null;
  monitorUri: string | null;
  error?: string;
};

export type JusbrasilProcessBinding = {
  tenantId: string;
  processoId: string;
  numeroProcesso: string;
  advogadoResponsavelId: string | null;
  clienteNome: string | null;
};

function normalizeNumeroProcesso(value?: string | null) {
  if (!value) return "";
  return value.replace(/\D/g, "");
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function extractMonitorId(monitor?: JusbrasilProcessMonitor | null) {
  if (!monitor) return null;

  const explicitId = (monitor as { id?: unknown }).id;
  if (typeof explicitId === "number" && Number.isFinite(explicitId)) {
    return explicitId;
  }

  const uri = readString(monitor.$uri);
  if (!uri) return null;

  const match = uri.match(/\/api\/monitoramento\/proc\/(\d+)$/);
  if (!match) return null;

  const parsed = Number.parseInt(match[1] || "", 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildMonitorUri(monitor?: JusbrasilProcessMonitor | null) {
  return readString(monitor?.$uri) ?? null;
}

function extractMonitorIdFromConflict(error: unknown) {
  if (!(error instanceof JusbrasilApiError) || error.status !== 409) {
    return null;
  }

  try {
    const parsed = JSON.parse(error.body) as {
      id?: unknown;
      message?: unknown;
    };

    if (typeof parsed.id === "number" && Number.isFinite(parsed.id)) {
      return parsed.id;
    }

    const message = readString(parsed.message);
    if (!message) {
      return null;
    }

    const match = message.match(/\(id=(\d+)\)/i);
    if (!match) {
      return null;
    }

    const extracted = Number.parseInt(match[1] || "", 10);
    return Number.isFinite(extracted) ? extracted : null;
  } catch {
    return null;
  }
}

export function buildJusbrasilProcessUserCustom(params: {
  tenantId: string;
  processoId: string;
  numeroProcesso?: string | null;
}) {
  const numeroNormalizado = normalizeNumeroProcesso(params.numeroProcesso);
  const suffix = numeroNormalizado ? `:${numeroNormalizado}` : "";
  return `${JUSBRASIL_PROCESS_USER_CUSTOM_PREFIX}:${params.tenantId}:${params.processoId}${suffix}`;
}

export function parseJusbrasilProcessUserCustom(value?: string | null) {
  const normalized = readString(value);
  if (!normalized) return null;

  const parts = normalized.split(":");
  if (parts.length < 4) return null;
  if (`${parts[0]}:${parts[1]}` !== JUSBRASIL_PROCESS_USER_CUSTOM_PREFIX) {
    return null;
  }

  const tenantId = readString(parts[2]);
  const processoId = readString(parts[3]);
  const numeroNormalizado = readString(parts[4]);

  if (!tenantId || !processoId) {
    return null;
  }

  return {
    tenantId,
    processoId,
    numeroNormalizado: numeroNormalizado || null,
  };
}

async function createProcessMonitorAuditEntry(params: {
  tenantId: string;
  usuarioId?: string | null;
  entidadeId: string;
  payload: JusbrasilProcessMonitorAuditPayload;
}) {
  await prisma.auditLog.create({
    data: {
      tenantId: params.tenantId,
      usuarioId: params.usuarioId ?? null,
      acao: AUDIT_ACTION_JUSBRASIL_PROCESS_MONITOR,
      entidade: "Processo",
      entidadeId: params.entidadeId,
      dados: params.payload,
      changedFields: [],
    },
  });
}

function shouldUpdateProcessMonitor(
  existing: JusbrasilProcessMonitor,
  desired: {
    numero: string;
    userCustom: string;
    isMonitoredTribunal: boolean;
    isMonitoredDiario: boolean;
    instancia?: number | null;
  },
) {
  const existingNumero = readString(existing.numero) || "";
  const existingNumeroNormalizado = normalizeNumeroProcesso(existingNumero);
  const desiredNumeroNormalizado = normalizeNumeroProcesso(desired.numero);

  return (
    existingNumeroNormalizado !== desiredNumeroNormalizado ||
    readString(existing.user_custom) !== desired.userCustom ||
    Boolean(existing.is_monitored_tribunal) !== desired.isMonitoredTribunal ||
    Boolean(existing.is_monitored_diario) !== desired.isMonitoredDiario ||
    (desired.instancia ?? null) !==
      (typeof existing.instancia === "number" ? existing.instancia : null)
  );
}

export async function ensureJusbrasilProcessMonitor(
  params: EnsureJusbrasilProcessMonitorParams,
): Promise<EnsureJusbrasilProcessMonitorResult> {
  const integrationState = await getTenantJusbrasilIntegrationState(
    params.tenantId,
  );
  const client = getJusbrasilClientFromEnv();

  if (!client || !integrationState.enabled) {
    return {
      enabled: false,
      synced: false,
      existed: false,
      userCustom: null,
      monitorId: null,
      monitorUri: null,
    };
  }

  const numeroNormalizado = normalizeNumeroProcesso(params.numeroProcesso);
  if (!numeroNormalizado) {
    return {
      enabled: true,
      synced: false,
      existed: false,
      userCustom: null,
      monitorId: null,
      monitorUri: null,
      error: "Processo sem numero valido para monitoramento Jusbrasil.",
    };
  }

  const numeroProcesso = readString(params.numeroProcesso) || numeroNormalizado;
  const userCustom = buildJusbrasilProcessUserCustom({
    tenantId: params.tenantId,
    processoId: params.processoId,
    numeroProcesso,
  });
  const isMonitoredTribunal = params.isMonitoredTribunal ?? true;
  const isMonitoredDiario = params.isMonitoredDiario ?? true;

  try {
    const existingByCustom = await client.listProcessMonitors({
      page: 1,
      perPage: 1,
      where: {
        user_custom: userCustom,
      },
    });

    const fallbackByNumero =
      existingByCustom.items[0] ||
      (
        await client.listProcessMonitors({
          page: 1,
          perPage: 1,
          where: {
            numero_normalizado: numeroNormalizado,
          },
        })
      ).items[0];

    const existing = fallbackByNumero ?? null;
    const desired = {
      numero: numeroProcesso,
      userCustom,
      isMonitoredTribunal,
      isMonitoredDiario,
      instancia: params.instancia ?? null,
    };

    let monitor = existing;
    let existed = Boolean(existing);

    if (existing) {
      const monitorId = extractMonitorId(existing);
      if (!monitorId) {
        throw new Error(
          "Jusbrasil nao retornou identificador do processo monitorado.",
        );
      }

      if (shouldUpdateProcessMonitor(existing, desired)) {
        monitor = await client.updateProcessMonitor(monitorId, {
          numero: numeroProcesso,
          user_custom: userCustom,
          is_monitored_diario: isMonitoredDiario,
          is_monitored_tribunal: isMonitoredTribunal,
          ...(params.instancia !== undefined && params.instancia !== null
            ? { instancia: params.instancia }
            : {}),
        });
      }
    } else {
      existed = false;
      try {
        monitor = await client.createProcessMonitor({
          numero: numeroProcesso,
          user_custom: userCustom,
          is_monitored_diario: isMonitoredDiario,
          is_monitored_tribunal: isMonitoredTribunal,
          ...(params.instancia !== undefined && params.instancia !== null
            ? { instancia: params.instancia }
            : {}),
        });
      } catch (error) {
        const conflictingMonitorId = extractMonitorIdFromConflict(error);
        if (!conflictingMonitorId) {
          throw error;
        }

        existed = true;
        monitor = await client.updateProcessMonitor(conflictingMonitorId, {
          numero: numeroProcesso,
          user_custom: userCustom,
          is_monitored_diario: isMonitoredDiario,
          is_monitored_tribunal: isMonitoredTribunal,
          ...(params.instancia !== undefined && params.instancia !== null
            ? { instancia: params.instancia }
            : {}),
        });
      }
    }

    const monitorId = extractMonitorId(monitor);
    const monitorUri = buildMonitorUri(monitor);

    await createProcessMonitorAuditEntry({
      tenantId: params.tenantId,
      usuarioId: params.usuarioId,
      entidadeId: params.processoId,
      payload: {
        provider: "JUSBRASIL",
        source: "PROCESS_MONITOR",
        status: "SYNCED",
        processoId: params.processoId,
        numeroProcesso,
        numeroNormalizado,
        userCustom,
        monitorId,
        monitorUri,
        isMonitoredTribunal,
        isMonitoredDiario,
        instancia: params.instancia ?? null,
      },
    });

    return {
      enabled: true,
      synced: true,
      existed,
      userCustom,
      monitorId,
      monitorUri,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Falha ao sincronizar monitoramento de processo no Jusbrasil.";

    await createProcessMonitorAuditEntry({
      tenantId: params.tenantId,
      usuarioId: params.usuarioId,
      entidadeId: params.processoId,
      payload: {
        provider: "JUSBRASIL",
        source: "PROCESS_MONITOR",
        status: "ERROR",
        processoId: params.processoId,
        numeroProcesso,
        numeroNormalizado,
        userCustom,
        monitorId: null,
        monitorUri: null,
        isMonitoredTribunal,
        isMonitoredDiario,
        instancia: params.instancia ?? null,
        error: message,
      },
    }).catch((auditError) => {
      logger.warn(
        { error: auditError, processoId: params.processoId },
        "Falha ao registrar auditoria do monitor de processo Jusbrasil.",
      );
    });

    throw error instanceof Error ? error : new Error(message);
  }
}

export async function ensureJusbrasilProcessMonitorBestEffort(
  params: EnsureJusbrasilProcessMonitorParams,
) {
  try {
    return await ensureJusbrasilProcessMonitor(params);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Falha ao sincronizar monitoramento de processo no Jusbrasil.";

    logger.warn(
      {
        tenantId: params.tenantId,
        processoId: params.processoId,
        error: message,
      },
      "Sincronizacao do monitor de processo Jusbrasil falhou em modo best effort.",
    );

    return {
      enabled: true,
      synced: false,
      existed: false,
      userCustom: buildJusbrasilProcessUserCustom(params),
      monitorId: null,
      monitorUri: null,
      error: message,
    } satisfies EnsureJusbrasilProcessMonitorResult;
  }
}

export async function resolveJusbrasilProcessBinding(params: {
  sourceUserCustom?: string | null;
  targetNumber?: string | null;
}) {
  const parsed = parseJusbrasilProcessUserCustom(params.sourceUserCustom);
  if (!parsed) {
    return null;
  }

  const processo = await prisma.processo.findFirst({
    where: {
      id: parsed.processoId,
      tenantId: parsed.tenantId,
      deletedAt: null,
    },
    select: {
      id: true,
      tenantId: true,
      numero: true,
      numeroCnj: true,
      advogadoResponsavelId: true,
      cliente: {
        select: {
          nome: true,
        },
      },
    },
  });

  if (!processo) {
    return null;
  }

  const numeroProcesso = readString(processo.numeroCnj) || processo.numero;
  const numeroNormalizado = normalizeNumeroProcesso(numeroProcesso);
  const targetNumeroNormalizado = normalizeNumeroProcesso(params.targetNumber);

  if (
    parsed.numeroNormalizado &&
    numeroNormalizado &&
    parsed.numeroNormalizado !== numeroNormalizado
  ) {
    return null;
  }

  if (
    targetNumeroNormalizado &&
    numeroNormalizado &&
    targetNumeroNormalizado !== numeroNormalizado
  ) {
    return null;
  }

  return {
    tenantId: processo.tenantId,
    processoId: processo.id,
    numeroProcesso,
    advogadoResponsavelId: processo.advogadoResponsavelId,
    clienteNome: processo.cliente?.nome ?? null,
  } satisfies JusbrasilProcessBinding;
}
