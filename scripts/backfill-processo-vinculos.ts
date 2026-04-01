import "dotenv/config";

import prisma from "@/app/lib/prisma";
import {
  ensureProcessoClientePartes,
  syncProcessoClientes,
  syncProcessoResponsaveis,
  uniqueOrderedProcessoRelationIds,
} from "@/app/lib/processos/processo-vinculos";

function readArg(name: string) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((value) => value.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : null;
}

async function main() {
  const tenantArg = readArg("tenant");
  const dryRun = process.argv.includes("--dry-run");

  const tenant = tenantArg
    ? await prisma.tenant.findFirst({
        where: {
          OR: [{ id: tenantArg }, { slug: tenantArg }],
        },
        select: {
          id: true,
          slug: true,
          name: true,
        },
      })
    : null;

  if (tenantArg && !tenant) {
    throw new Error(`Tenant não encontrado para o identificador "${tenantArg}"`);
  }

  const processos = await prisma.processo.findMany({
    where: {
      deletedAt: null,
      ...(tenant ? { tenantId: tenant.id } : {}),
    },
    select: {
      id: true,
      tenantId: true,
      numero: true,
      clienteId: true,
      advogadoResponsavelId: true,
      clientesRelacionados: {
        select: {
          clienteId: true,
        },
      },
      responsaveis: {
        select: {
          advogadoId: true,
        },
      },
      partes: {
        where: {
          deletedAt: null,
        },
        select: {
          clienteId: true,
          advogadoId: true,
        },
      },
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  let syncedClientes = 0;
  let syncedResponsaveis = 0;
  let touched = 0;

  for (const processo of processos) {
    const clienteIds = uniqueOrderedProcessoRelationIds([
      processo.clienteId,
      ...processo.clientesRelacionados.map((item) => item.clienteId),
      ...processo.partes.map((parte) => parte.clienteId),
    ]);
    const advogadoIds = uniqueOrderedProcessoRelationIds([
      processo.advogadoResponsavelId,
      ...processo.responsaveis.map((item) => item.advogadoId),
      ...processo.partes.map((parte) => parte.advogadoId),
    ]);

    if (clienteIds.length === 0 && advogadoIds.length === 0) {
      continue;
    }

    touched += 1;
    syncedClientes += clienteIds.length;
    syncedResponsaveis += advogadoIds.length;

    if (dryRun) {
      continue;
    }

    await prisma.$transaction(async (tx) => {
      await syncProcessoClientes(tx, {
        tenantId: processo.tenantId,
        processoId: processo.id,
        clienteIds,
      });
      await syncProcessoResponsaveis(tx, {
        tenantId: processo.tenantId,
        processoId: processo.id,
        advogadoIds,
        advogadoPrincipalId: processo.advogadoResponsavelId,
      });

      if (clienteIds.length > 0) {
        await ensureProcessoClientePartes(tx, {
          tenantId: processo.tenantId,
          processoId: processo.id,
          clienteIds,
        });
      }
    });
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        tenantId: tenant?.id ?? "ALL",
        tenantSlug: tenant?.slug ?? null,
        tenantName: tenant?.name ?? null,
        dryRun,
        processosLidos: processos.length,
        processosAtualizados: touched,
        clienteVinculosProcessados: syncedClientes,
        responsavelVinculosProcessados: syncedResponsaveis,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
