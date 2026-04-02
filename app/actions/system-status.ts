"use server";

import { headers } from "next/headers";
import { getServerSession } from "next-auth";
import Ably from "ably";
import Redis from "ioredis";
import { v2 as cloudinary } from "cloudinary";

import { canCurrentUserAccessDevWorkbench } from "@/app/lib/dev-workbench-access";
import prisma from "@/app/lib/prisma";
import { authOptions } from "@/auth";
import {
  AsaasClient,
  normalizeAsaasApiKey,
  resolveAsaasEnvironment,
} from "@/lib/asaas";
import {
  JusbrasilApiError,
  JusbrasilClient,
  normalizeJusbrasilApiKey,
  resolveJusbrasilApiBaseUrl,
} from "@/lib/api/juridical/jusbrasil";
import {
  buildJusbrasilExpectedWebhookUrl,
  normalizeComparableUrl,
} from "@/app/lib/juridical/jusbrasil-oab-sync";
import { getModuleRouteMap } from "@/app/lib/module-map";

export type ExternalServiceStatus = {
  id: string;
  name: string;
  ok: boolean;
  message?: string;
  checkedAt: string;
  details?: Record<string, string>;
};

function resolveErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message || "Erro desconhecido";
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  return "Erro desconhecido";
}

function buildServiceStatus(
  input: Omit<ExternalServiceStatus, "checkedAt">,
): ExternalServiceStatus {
  return {
    ...input,
    checkedAt: new Date().toISOString(),
  };
}

function truncateDetail(value: string, max = 180) {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...`;
}

async function getAsaasRuntimeDetails(
  environment: string,
): Promise<Record<string, string>> {
  const headersList = await headers();
  const host = headersList.get("host")?.trim();
  const forwardedHost = headersList.get("x-forwarded-host")?.trim();
  const deploymentId = process.env.VERCEL_DEPLOYMENT_ID?.trim();
  const gitCommitSha = process.env.VERCEL_GIT_COMMIT_SHA?.trim();
  const rawEnvironment = process.env.ASAAS_ENVIRONMENT?.trim();

  return {
    environment,
    rawEnvironment: rawEnvironment || "(vazio)",
    scope: "chave global do deployment",
    source: "process.env.ASAAS_API_KEY",
    host: host || "desconhecido",
    forwardedHost: forwardedHost || "desconhecido",
    vercelEnv: process.env.VERCEL_ENV?.trim() || "desconhecido",
    vercelTargetEnv:
      process.env.VERCEL_TARGET_ENV?.trim() || "desconhecido",
    vercelUrl: process.env.VERCEL_URL?.trim() || "desconhecido",
    vercelRegion: process.env.VERCEL_REGION?.trim() || "desconhecido",
    deploymentId: deploymentId || "desconhecido",
    gitBranch: process.env.VERCEL_GIT_COMMIT_REF?.trim() || "desconhecido",
    gitCommit: gitCommitSha ? gitCommitSha.slice(0, 12) : "desconhecido",
  };
}

async function checkDatabase(): Promise<ExternalServiceStatus> {
  try {
    await prisma.tenant.count();

    return buildServiceStatus({
      id: "neon",
      name: "Neon (Postgres)",
      ok: true,
      message: "Consulta de leitura executada com sucesso.",
      details: {
        probe: "SELECT COUNT(*) FROM Tenant",
      },
    });
  } catch (error) {
    return buildServiceStatus({
      id: "neon",
      name: "Neon (Postgres)",
      ok: false,
      message: resolveErrorMessage(error),
      details: {
        probe: "SELECT COUNT(*) FROM Tenant",
      },
    });
  }
}

async function checkAbly(): Promise<ExternalServiceStatus> {
  if (!process.env.ABLY_API_KEY) {
    return buildServiceStatus({
      id: "ably",
      name: "Ably Realtime",
      ok: false,
      message: "ABLY_API_KEY não configurada",
      details: {
        env: "ABLY_API_KEY ausente",
      },
    });
  }

  try {
    const client = new Ably.Rest({ key: process.env.ABLY_API_KEY });
    await client.time();

    return buildServiceStatus({
      id: "ably",
      name: "Ably Realtime",
      ok: true,
      message: "Ably respondeu ao endpoint de tempo.",
      details: {
        probe: "Ably REST /time",
      },
    });
  } catch (error) {
    return buildServiceStatus({
      id: "ably",
      name: "Ably Realtime",
      ok: false,
      message: resolveErrorMessage(error),
      details: {
        probe: "Ably REST /time",
      },
    });
  }
}

async function checkCloudinary(): Promise<ExternalServiceStatus> {
  if (
    !process.env.CLOUDINARY_CLOUD_NAME ||
    !process.env.CLOUDINARY_API_KEY ||
    !process.env.CLOUDINARY_API_SECRET
  ) {
    return buildServiceStatus({
      id: "cloudinary",
      name: "Cloudinary",
      ok: false,
      message: "Credenciais do Cloudinary não configuradas",
      details: {
        env: "CLOUDINARY_* ausente",
      },
    });
  }

  try {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
    await cloudinary.api.ping();

    return buildServiceStatus({
      id: "cloudinary",
      name: "Cloudinary",
      ok: true,
      message: "Cloudinary respondeu ao ping.",
      details: {
        probe: "cloudinary.api.ping()",
      },
    });
  } catch (error) {
    return buildServiceStatus({
      id: "cloudinary",
      name: "Cloudinary",
      ok: false,
      message: resolveErrorMessage(error),
      details: {
        probe: "cloudinary.api.ping()",
      },
    });
  }
}

async function checkAsaas(): Promise<ExternalServiceStatus> {
  const environment = resolveAsaasEnvironment(process.env.ASAAS_ENVIRONMENT);
  const asaasApiKey = normalizeAsaasApiKey(process.env.ASAAS_API_KEY);
  const runtimeDetails = await getAsaasRuntimeDetails(environment);

  if (!asaasApiKey) {
    return buildServiceStatus({
      id: "asaas",
      name: "Asaas",
      ok: false,
      message:
        "ASAAS_API_KEY não configurada no ambiente de execução (deploy).",
      details: {
        ...runtimeDetails,
        env: "ASAAS_API_KEY ausente/vazia no servidor",
      },
    });
  }

  try {
    const client = new AsaasClient(asaasApiKey, environment);
    const accountInfo = await client.getAccountInfo();

    return buildServiceStatus({
      id: "asaas",
      name: "Asaas",
      ok: true,
      message: "Conta Asaas autenticada com sucesso.",
      details: {
        ...runtimeDetails,
        probe: "/myAccount",
        account:
          String(
            accountInfo?.name ||
              accountInfo?.email ||
              accountInfo?.id ||
              "conta autenticada",
          ) || "conta autenticada",
      },
    });
  } catch (error) {
    return buildServiceStatus({
      id: "asaas",
      name: "Asaas",
      ok: false,
      message: resolveErrorMessage(error),
      details: {
        ...runtimeDetails,
        probe: "/myAccount",
      },
    });
  }
}

async function checkModuleMap(): Promise<ExternalServiceStatus> {
  try {
    await getModuleRouteMap();

    return buildServiceStatus({
      id: "module_map",
      name: "Module Map",
      ok: true,
      message: "Mapeamento de rotas carregado com sucesso.",
      details: {
        probe: "getModuleRouteMap()",
      },
    });
  } catch (error) {
    return buildServiceStatus({
      id: "module_map",
      name: "Module Map",
      ok: false,
      message: resolveErrorMessage(error),
      details: {
        probe: "getModuleRouteMap()",
      },
    });
  }
}

async function checkJusbrasil(): Promise<ExternalServiceStatus> {
  const apiKey = normalizeJusbrasilApiKey(process.env.JUSBRASIL_API_KEY);
  const baseUrl = resolveJusbrasilApiBaseUrl(process.env.JUSBRASIL_API_BASE_URL);
  const expectedWebhookUrl = buildJusbrasilExpectedWebhookUrl();

  if (!apiKey) {
    return buildServiceStatus({
      id: "jusbrasil",
      name: "Jusbrasil API",
      ok: false,
      message: "JUSBRASIL_API_KEY não configurada",
      details: {
        env: "JUSBRASIL_API_KEY ausente",
        baseUrl,
        expectedWebhookUrl,
      },
    });
  }

  try {
    const client = new JusbrasilClient(apiKey, baseUrl);
    const [user, webhookConfig, oabMonitors] = await Promise.all([
      client.getCurrentUser(),
      client.getCurrentWebhookConfig(),
      client.listOabMonitors(1, 1),
    ]);

    const roles = Array.isArray(user.roles) ? user.roles : [];
    const configuredWebhookUrl = webhookConfig?.url?.trim() || "";
    const webhookMatchesExpected =
      normalizeComparableUrl(configuredWebhookUrl) ===
      normalizeComparableUrl(expectedWebhookUrl);

    return buildServiceStatus({
      id: "jusbrasil",
      name: "Jusbrasil API",
      ok: true,
      message: "Token autenticado e endpoints de webhook/OAB responderam.",
      details: {
        baseUrl,
        probeAuth: "GET /admin/user?page=1&per_page=1",
        probeWebhook: "GET /admin/user_company/current_webhook_config",
        probeOab: "GET /monitoramento/oab/acompanhamento/?page=1&per_page=1",
        userEmail: user.email?.trim() || "desconhecido",
        userName: user.name?.trim() || "desconhecido",
        userCompanyId:
          user.user_company_id !== undefined && user.user_company_id !== null
            ? String(user.user_company_id)
            : "desconhecido",
        rolesCount: String(roles.length),
        oabRolesPresent: String(roles.some((role) => role.startsWith("api.oab."))),
        tribprocRolesPresent: String(roles.some((role) => role.startsWith("tribproc."))),
        webhookActive: String(Boolean(webhookConfig?.is_global_active)),
        webhookUrl: configuredWebhookUrl || "(vazio)",
        expectedWebhookUrl,
        webhookMatchesExpected: String(webhookMatchesExpected),
        oabMonitorsTotal:
          oabMonitors.totalCount !== null
            ? String(oabMonitors.totalCount)
            : String(oabMonitors.items.length),
      },
    });
  } catch (error) {
    if (error instanceof JusbrasilApiError) {
      return buildServiceStatus({
        id: "jusbrasil",
        name: "Jusbrasil API",
        ok: false,
        message: error.message,
        details: {
          baseUrl,
          status: String(error.status),
          response: error.body ? truncateDetail(error.body) : "(sem corpo)",
        },
      });
    }

    return buildServiceStatus({
      id: "jusbrasil",
      name: "Jusbrasil API",
      ok: false,
      message: resolveErrorMessage(error),
      details: {
        baseUrl,
      },
    });
  }
}

async function checkRedis(): Promise<ExternalServiceStatus> {
  if (!process.env.REDIS_URL) {
    return buildServiceStatus({
      id: "redis",
      name: "Upstash Redis",
      ok: false,
      message: "REDIS_URL não configurada",
      details: {
        env: "REDIS_URL ausente",
      },
    });
  }

  const redis = new Redis(process.env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  });

  try {
    await redis.connect();
    await redis.ping();

    return buildServiceStatus({
      id: "redis",
      name: "Upstash Redis",
      ok: true,
      message: "PING respondido com sucesso.",
      details: {
        probe: "redis.ping()",
      },
    });
  } catch (error) {
    return buildServiceStatus({
      id: "redis",
      name: "Upstash Redis",
      ok: false,
      message: resolveErrorMessage(error),
      details: {
        probe: "redis.ping()",
      },
    });
  } finally {
    redis.disconnect();
  }
}

export async function fetchSystemStatus() {
  const session = await getServerSession(authOptions);
  const workbenchEnabled =
    process.env.NODE_ENV === "development"
      ? true
      : await canCurrentUserAccessDevWorkbench();

  if (!session?.user || !workbenchEnabled) {
    return {
      success: false,
      error: "Sem permissão para consultar status",
      services: [],
    };
  }

  const services = await Promise.all([
    checkDatabase(),
    checkAbly(),
    checkCloudinary(),
    checkAsaas(),
    checkJusbrasil(),
    checkModuleMap(),
    checkRedis(),
  ]);

  return {
    success: true,
    services,
    checkedAt: new Date().toISOString(),
  };
}
