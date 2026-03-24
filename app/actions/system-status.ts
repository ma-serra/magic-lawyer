"use server";

import { getServerSession } from "next-auth";
import Ably from "ably";
import Redis from "ioredis";
import { v2 as cloudinary } from "cloudinary";

import prisma from "@/app/lib/prisma";
import { authOptions } from "@/auth";
import {
  AsaasClient,
  normalizeAsaasApiKey,
  resolveAsaasEnvironment,
} from "@/lib/asaas";
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

  if (!asaasApiKey) {
    return buildServiceStatus({
      id: "asaas",
      name: "Asaas",
      ok: false,
      message:
        "ASAAS_API_KEY não configurada no ambiente de execução (deploy).",
      details: {
        environment,
        source: "process.env.ASAAS_API_KEY",
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
        environment,
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
        environment,
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

  if (!session?.user || (session.user as any)?.role !== "SUPER_ADMIN") {
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
    checkModuleMap(),
    checkRedis(),
  ]);

  return {
    success: true,
    services,
    checkedAt: new Date().toISOString(),
  };
}
