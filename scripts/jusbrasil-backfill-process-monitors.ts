import "dotenv/config";

import prisma from "../app/lib/prisma";
import { ProcessoStatus } from "../generated/prisma";
import { ensureJusbrasilProcessMonitorBestEffort } from "../app/lib/juridical/jusbrasil-process-monitoring";

type CliOptions = {
  tenantSlugs: string[];
  includeTest: boolean;
  onlyInProgress: boolean;
  limit: number | null;
};

function parseArgs(argv: string[]): CliOptions {
  const tenantSlugs: string[] = [];
  let includeTest = false;
  let onlyInProgress = true;
  let limit: number | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--tenant" || arg === "--tenants") {
      const raw = argv[index + 1] || "";
      tenantSlugs.push(
        ...raw
          .split(",")
          .map((item) => item.trim().toLowerCase())
          .filter(Boolean),
      );
      index += 1;
      continue;
    }

    if (arg === "--include-test") {
      includeTest = true;
      continue;
    }

    if (arg === "--all-statuses") {
      onlyInProgress = false;
      continue;
    }

    if (arg === "--limit") {
      const raw = argv[index + 1] || "";
      const parsed = Number.parseInt(raw, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        limit = parsed;
      }
      index += 1;
      continue;
    }
  }

  return {
    tenantSlugs: Array.from(new Set(tenantSlugs)),
    includeTest,
    onlyInProgress,
    limit,
  };
}

function normalizeProcessNumber(value?: string | null) {
  return (value || "").replace(/\D/g, "");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  const tenants = await prisma.tenant.findMany({
    where: {
      status: "ACTIVE",
      slug: {
        not: "global",
        ...(options.tenantSlugs.length > 0 ? { in: options.tenantSlugs } : {}),
      },
      ...(options.includeTest ? {} : { isTestEnvironment: false }),
    },
    select: {
      id: true,
      name: true,
      slug: true,
      isTestEnvironment: true,
      jusbrasilConfig: {
        select: {
          integracaoAtiva: true,
        },
      },
    },
    orderBy: {
      name: "asc",
    },
  });

  if (tenants.length === 0) {
    console.log("Nenhum tenant elegivel encontrado para backfill.");
    return;
  }

  console.log(
    JSON.stringify({
      stage: "start",
      includeTest: options.includeTest,
      onlyInProgress: options.onlyInProgress,
      limit: options.limit,
      tenants: tenants.map((tenant) => ({
        slug: tenant.slug,
        name: tenant.name,
        isTestEnvironment: tenant.isTestEnvironment,
        integracaoAtiva: tenant.jusbrasilConfig?.integracaoAtiva ?? true,
      })),
    }),
  );

  let totalScanned = 0;
  let totalSynced = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const tenant of tenants) {
    if (tenant.jusbrasilConfig?.integracaoAtiva === false) {
      console.log(
        JSON.stringify({
          stage: "tenant_skipped",
          tenant: tenant.name,
          slug: tenant.slug,
          reason: "integracao_desativada",
        }),
      );
      continue;
    }

    const processos = await prisma.processo.findMany({
      where: {
        tenantId: tenant.id,
        deletedAt: null,
        ...(options.onlyInProgress
          ? {
              status: ProcessoStatus.EM_ANDAMENTO,
            }
          : {}),
      },
      select: {
        id: true,
        numero: true,
        numeroCnj: true,
      },
      orderBy: {
        createdAt: "asc",
      },
      ...(options.limit ? { take: options.limit } : {}),
    });

    let tenantSynced = 0;
    let tenantSkipped = 0;
    let tenantErrors = 0;

    console.log(
      JSON.stringify({
        stage: "tenant_start",
        tenant: tenant.name,
        slug: tenant.slug,
        totalProcessos: processos.length,
      }),
    );

    for (const processo of processos) {
      totalScanned += 1;
      const numeroProcesso = processo.numeroCnj || processo.numero;

      if (!normalizeProcessNumber(numeroProcesso)) {
        tenantSkipped += 1;
        totalSkipped += 1;
        continue;
      }

      const result = await ensureJusbrasilProcessMonitorBestEffort({
        tenantId: tenant.id,
        processoId: processo.id,
        numeroProcesso,
      });

      if (result.synced) {
        tenantSynced += 1;
        totalSynced += 1;
        continue;
      }

      if (result.error) {
        tenantErrors += 1;
        totalErrors += 1;

        console.log(
          JSON.stringify({
            stage: "process_error",
            tenant: tenant.name,
            slug: tenant.slug,
            processoId: processo.id,
            numeroProcesso,
            error: result.error,
          }),
        );
        continue;
      }

      tenantSkipped += 1;
      totalSkipped += 1;
    }

    console.log(
      JSON.stringify({
        stage: "tenant_done",
        tenant: tenant.name,
        slug: tenant.slug,
        totalProcessos: processos.length,
        synced: tenantSynced,
        skipped: tenantSkipped,
        errors: tenantErrors,
      }),
    );
  }

  console.log(
    JSON.stringify({
      stage: "done",
      scanned: totalScanned,
      synced: totalSynced,
      skipped: totalSkipped,
      errors: totalErrors,
    }),
  );
}

main()
  .catch((error) => {
    console.error(
      JSON.stringify({
        stage: "fatal",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
