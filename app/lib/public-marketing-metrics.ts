import { cache } from "react";

import { TenantStatus } from "@/generated/prisma";

import prisma from "./prisma";

type MetricFormatOptions = {
  step: number;
  multiplier?: number;
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
  { step, multiplier = 10 }: MetricFormatOptions,
) {
  if (value <= 0) {
    return "0";
  }

  const boostedValue = value * multiplier;
  const roundedValue = Math.ceil(boostedValue / step) * step;

  return `${new Intl.NumberFormat("pt-BR").format(roundedValue)}+`;
}

export const getPublicMarketingMetrics = cache(
  async (): Promise<PublicMarketingMetrics> => {
    const [processos, clientes, escritorios, usuarios] = await Promise.all([
      prisma.processo.count({
        where: {
          deletedAt: null,
          tenant: {
            status: TenantStatus.ACTIVE,
          },
        },
      }),
      prisma.cliente.count({
        where: {
          deletedAt: null,
          tenant: {
            status: TenantStatus.ACTIVE,
          },
        },
      }),
      prisma.tenant.count({
        where: {
          status: TenantStatus.ACTIVE,
        },
      }),
      prisma.usuario.count({
        where: {
          active: true,
          tenant: {
            status: TenantStatus.ACTIVE,
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
        processos: formatMarketingCount(processos, { step: 100 }),
        clientes: formatMarketingCount(clientes, { step: 50 }),
        escritorios: formatMarketingCount(escritorios, { step: 10 }),
        usuarios: formatMarketingCount(usuarios, { step: 25 }),
      },
    };
  },
);
