import { cache } from "react";

import { TenantStatus } from "@/generated/prisma";

import prisma from "./prisma";

const PRODUCTION_TENANT_FILTER = {
  status: TenantStatus.ACTIVE,
  slug: {
    not: "global",
  },
  isTestEnvironment: false,
} as const;

type MetricFormatOptions = {
  step: number;
  exactUntil?: number;
};

export type PublicMarketingMetrics = {
  raw: {
    processos: number;
    clientes: number;
    escritorios: number;
    usuarios: number;
  };
  display: {
    processos: string;
    clientes: string;
    escritorios: string;
    usuarios: string;
  };
};

function formatMarketingCount(
  value: number,
  { step, exactUntil = 0 }: MetricFormatOptions,
) {
  if (value <= 0) {
    return "0";
  }

  if (value <= exactUntil) {
    return new Intl.NumberFormat("pt-BR").format(value);
  }

  const roundedValue = Math.ceil(value / step) * step;

  return `${new Intl.NumberFormat("pt-BR").format(roundedValue)}+`;
}

export const getPublicMarketingMetrics = cache(
  async (): Promise<PublicMarketingMetrics> => {
    const [processos, clientes, escritorios, usuarios] = await Promise.all([
      prisma.processo.count({
        where: {
          deletedAt: null,
          tenant: {
            ...PRODUCTION_TENANT_FILTER,
          },
        },
      }),
      prisma.cliente.count({
        where: {
          deletedAt: null,
          tenant: {
            ...PRODUCTION_TENANT_FILTER,
          },
        },
      }),
      prisma.tenant.count({
        where: {
          ...PRODUCTION_TENANT_FILTER,
        },
      }),
      prisma.usuario.count({
        where: {
          active: true,
          tenant: {
            ...PRODUCTION_TENANT_FILTER,
          },
        },
      }),
    ]);

    return {
      raw: {
        processos,
        clientes,
        escritorios,
        usuarios,
      },
      display: {
        processos: formatMarketingCount(processos, { step: 25, exactUntil: 99 }),
        clientes: formatMarketingCount(clientes, { step: 10, exactUntil: 99 }),
        escritorios: formatMarketingCount(escritorios, { step: 1, exactUntil: 20 }),
        usuarios: formatMarketingCount(usuarios, { step: 5, exactUntil: 50 }),
      },
    };
  },
);
