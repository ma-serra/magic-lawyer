import { PrecosContent } from "./precos-content";

import { obterPlanos } from "@/app/actions/asaas";
import prisma from "@/app/lib/prisma";

async function getPublicMatrix() {
  const [planos, modulos, planoModulos] = await Promise.all([
    prisma.plano.findMany({
      where: { ativo: true },
      select: {
        id: true,
        nome: true,
        slug: true,
      },
      orderBy: [{ valorMensal: "asc" }],
    }),
    prisma.modulo.findMany({
      where: { ativo: true },
      select: {
        id: true,
        nome: true,
        slug: true,
        categoria: {
          select: {
            nome: true,
          },
        },
      },
      orderBy: [{ ordem: "asc" }, { nome: "asc" }],
    }),
    prisma.planoModulo.findMany({
      where: {
        habilitado: true,
        plano: { ativo: true },
        modulo: { ativo: true },
      },
      select: {
        planoId: true,
        moduloId: true,
      },
    }),
  ]);

  const statusMap = new Map<string, Set<string>>();

  for (const relation of planoModulos) {
    if (!statusMap.has(relation.moduloId)) {
      statusMap.set(relation.moduloId, new Set<string>());
    }

    statusMap.get(relation.moduloId)?.add(relation.planoId);
  }

  return {
    planos,
    modulos: modulos.map((modulo) => ({
      id: modulo.id,
      nome: modulo.nome,
      slug: modulo.slug,
      categoria: modulo.categoria?.nome ?? null,
      habilitadoPlanoIds: Array.from(statusMap.get(modulo.id) ?? []),
    })),
  };
}

export default async function Precos() {
  const [planosResponse, matrix] = await Promise.all([
    obterPlanos(),
    getPublicMatrix(),
  ]);
  const planos = planosResponse.success ? planosResponse.data : [];

  return <PrecosContent matrix={matrix} planos={planos} />;
}
