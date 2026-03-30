import "dotenv/config";

import prisma from "../app/lib/prisma";
import { backfillExternalDeadlinesFromMovements } from "../app/lib/juridical/process-deadline-sync";

type CliOptions = {
  tenantSlugs: string[];
  processoId?: string;
  limit?: number;
};

function parseArgs(argv: string[]): CliOptions {
  const tenantSlugs: string[] = [];
  let processoId: string | undefined;
  let limit: number | undefined;

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

    if (arg === "--processo") {
      processoId = (argv[index + 1] || "").trim() || undefined;
      index += 1;
      continue;
    }

    if (arg === "--limit") {
      const parsed = Number.parseInt(argv[index + 1] || "", 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        limit = parsed;
      }
      index += 1;
      continue;
    }
  }

  return {
    tenantSlugs: Array.from(new Set(tenantSlugs)),
    processoId,
    limit,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.tenantSlugs.length === 0) {
    throw new Error("Informe ao menos um tenant com --tenant ml-test");
  }

  const tenants = await prisma.tenant.findMany({
    where: {
      slug: {
        in: options.tenantSlugs,
      },
    },
    select: {
      id: true,
      slug: true,
      name: true,
    },
    orderBy: {
      name: "asc",
    },
  });

  if (tenants.length === 0) {
    throw new Error("Nenhum tenant encontrado para o backfill de prazos.");
  }

  for (const tenant of tenants) {
    const summary = await backfillExternalDeadlinesFromMovements({
      tenantId: tenant.id,
      processoId: options.processoId,
      limit: options.limit,
    });

    console.log(
      JSON.stringify({
        tenant: tenant.slug,
        tenantName: tenant.name,
        ...summary,
      }),
    );
  }
}

main()
  .catch((error) => {
    console.error(
      JSON.stringify({
        error:
          error instanceof Error
            ? error.message
            : "Falha desconhecida no backfill de prazos Jusbrasil.",
      }),
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
