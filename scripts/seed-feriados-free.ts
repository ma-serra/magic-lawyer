import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

import prisma from "@/app/lib/prisma";
import { FREE_PLAN_CAPITALS } from "@/app/lib/feriados/free-plan-capitals";
import { getFeriadosApiPlan, isRegionalHolidaySyncConfigured } from "@/app/lib/feriados/oficial";
import {
  ensureSharedMunicipalHolidays,
  ensureSharedNationalHolidays,
  ensureSharedStateHolidays,
  type HolidaySeedResult,
} from "@/app/lib/feriados/sync";

const DEFAULT_INTERVAL_MS = 1100;

function parseYears(argv: string[]) {
  const explicitYears = argv
    .find((item) => item.startsWith("--years="))
    ?.replace("--years=", "")
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value >= 2000 && value <= 2100);

  if (explicitYears?.length) {
    return Array.from(new Set(explicitYears)).sort((a, b) => a - b);
  }

  const currentYear = new Date().getFullYear();
  return [currentYear, currentYear + 1];
}

function parseIntervalMs(argv: string[]) {
  const rawValue = argv
    .find((item) => item.startsWith("--interval-ms="))
    ?.replace("--interval-ms=", "");

  const parsed = rawValue ? Number(rawValue) : NaN;
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_INTERVAL_MS;
  }

  return parsed;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sumSeedMetric(results: HolidaySeedResult[], field: "created" | "updated" | "ignored") {
  return results.reduce((sum, result) => sum + (result[field] ?? 0), 0);
}

function printSeedResult(label: string, result: HolidaySeedResult) {
  const parts = [
    label,
    result.seeded ? "seeded" : "skipped",
    `created=${result.created ?? 0}`,
    `updated=${result.updated ?? 0}`,
    `ignored=${result.ignored ?? 0}`,
  ];

  if (result.reason) {
    parts.push(`reason=${result.reason}`);
  }

  if (result.error) {
    parts.push(`error=${result.error}`);
  }

  console.log(parts.join(" | "));
}

async function main() {
  const years = parseYears(process.argv.slice(2));
  const intervalMs = parseIntervalMs(process.argv.slice(2));

  if (getFeriadosApiPlan() !== "free") {
    throw new Error(
      "Este seed foi preparado para o plano free. Ajuste FERIADOS_API_PLAN=free ou use um seed proprio para plano pago.",
    );
  }

  if (!isRegionalHolidaySyncConfigured()) {
    throw new Error(
      "FERIADOS_API_KEY nao configurada. Defina a chave da Feriados API para carregar feriados estaduais e municipais do plano free.",
    );
  }

  const uniqueUfs = Array.from(new Set(FREE_PLAN_CAPITALS.map((item) => item.uf)));

  console.log(
    `Seed Feriados API free | years=${years.join(",")} | states=${uniqueUfs.length} | capitals=${FREE_PLAN_CAPITALS.length} | intervalMs=${intervalMs}`,
  );

  for (const year of years) {
    console.log(`\n== Ano ${year} ==`);

    const nationalResult = await ensureSharedNationalHolidays(year);
    printSeedResult("NACIONAL", nationalResult);
    await sleep(intervalMs);

    const stateResults: HolidaySeedResult[] = [];
    for (const uf of uniqueUfs) {
      const result = await ensureSharedStateHolidays(year, uf);
      stateResults.push(result);
      printSeedResult(`ESTADUAL ${uf}`, result);
      await sleep(intervalMs);
    }

    const municipalResults: HolidaySeedResult[] = [];
    for (const capital of FREE_PLAN_CAPITALS) {
      const result = await ensureSharedMunicipalHolidays(
        year,
        capital.uf,
        capital.municipio,
      );
      municipalResults.push(result);
      printSeedResult(`MUNICIPAL ${capital.municipio}/${capital.uf}`, result);
      await sleep(intervalMs);
    }

    const yearCreated =
      (nationalResult.created ?? 0) +
      sumSeedMetric(stateResults, "created") +
      sumSeedMetric(municipalResults, "created");
    const yearUpdated =
      (nationalResult.updated ?? 0) +
      sumSeedMetric(stateResults, "updated") +
      sumSeedMetric(municipalResults, "updated");
    const yearIgnored =
      (nationalResult.ignored ?? 0) +
      sumSeedMetric(stateResults, "ignored") +
      sumSeedMetric(municipalResults, "ignored");

    console.log(
      `Resumo ${year} | created=${yearCreated} | updated=${yearUpdated} | ignored=${yearIgnored}`,
    );
  }

  const totalShared = await prisma.feriado.count({
    where: {
      tenantId: null,
      deletedAt: null,
    },
  });

  console.log(`\nCatálogo compartilhado atual: ${totalShared} feriado(s)`);
}

main()
  .catch((error) => {
    console.error("[seed-feriados-free] falha:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
