import prisma from "@/app/lib/prisma";
import {
  inferImportedProcessoStatus,
  mergeImportedProcessoStatus,
} from "@/app/lib/juridical/processo-status-mapping";

const EXTERNAL_SYNC_TAG = "origem:sincronizacao_externa";

function getArgValue(flag: string) {
  const prefixed = `${flag}=`;
  const match = process.argv.find((arg) => arg === flag || arg.startsWith(prefixed));

  if (!match) {
    return null;
  }

  if (match === flag) {
    return "true";
  }

  return match.slice(prefixed.length);
}

function hasExternalSyncTag(tags: unknown) {
  return Array.isArray(tags) && tags.some((tag) => tag === EXTERNAL_SYNC_TAG);
}

async function main() {
  const tenantSlug = getArgValue("--tenant");
  const apply = getArgValue("--apply") === "true";

  if (!tenantSlug) {
    throw new Error("Informe o tenant com --tenant=<slug>");
  }

  const processos = await prisma.processo.findMany({
    where: {
      tenant: {
        slug: tenantSlug,
      },
    },
    select: {
      id: true,
      numero: true,
      status: true,
      tags: true,
      movimentacoes: {
        orderBy: [{ dataMovimentacao: "desc" }, { createdAt: "desc" }],
        take: 120,
        select: {
          dataMovimentacao: true,
          titulo: true,
          descricao: true,
        },
      },
    },
  });

  const imported = processos.filter((processo) => hasExternalSyncTag(processo.tags));
  const updates = imported
    .map((processo) => {
      const importedStatus = inferImportedProcessoStatus({
        status: processo.status,
        movimentacoes: processo.movimentacoes.map((movimentacao) => ({
          data: movimentacao.dataMovimentacao,
          tipo: movimentacao.titulo ?? undefined,
          descricao: movimentacao.descricao ?? "",
        })),
      });
      const nextStatus = mergeImportedProcessoStatus(processo.status, importedStatus);

      return {
        id: processo.id,
        numero: processo.numero,
        currentStatus: processo.status,
        nextStatus,
      };
    })
    .filter((item) => item.currentStatus !== item.nextStatus);

  if (apply && updates.length > 0) {
    for (const update of updates) {
      await prisma.processo.update({
        where: { id: update.id },
        data: { status: update.nextStatus },
      });
    }
  }

  const nextCounts = updates.reduce<Record<string, number>>((acc, update) => {
    acc[update.nextStatus] = (acc[update.nextStatus] ?? 0) + 1;
    return acc;
  }, {});

  console.log(JSON.stringify({
    tenantSlug,
    apply,
    totalTenantProcesses: processos.length,
    importedProcesses: imported.length,
    updates: updates.length,
    nextCounts,
    sample: updates.slice(0, 10),
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
