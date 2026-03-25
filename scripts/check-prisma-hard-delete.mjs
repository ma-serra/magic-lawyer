#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const BASELINE_PATH = path.resolve(
  process.cwd(),
  "scripts/policies/prisma-hard-delete-baseline.json",
);

function normalizeEntry(raw) {
  const line = String(raw ?? "").trim();
  const match = line.match(/^(.+?):(\d+):(.*)$/);
  if (!match) {
    return line.replace(/\s+/g, " ");
  }

  const [, filePath, lineNumber, code] = match;
  const normalizedCode = code.trim().replace(/\s+/g, " ");
  return `${filePath}:${lineNumber}:${normalizedCode}`;
}

function readBaseline() {
  const raw = readFileSync(BASELINE_PATH, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed.entries)) {
    throw new Error("Baseline inválida: propriedade `entries` ausente.");
  }
  return new Set(parsed.entries.map((entry) => normalizeEntry(entry)));
}

function collectHardDeleteEntries() {
  let output = "";
  try {
    output = execFileSync(
      "rg",
      [
        "-n",
        "(?:prisma|tx)\\.[A-Za-z0-9_]+\\.(delete|deleteMany)\\(",
        "app",
        "lib",
        "--glob",
        "!generated/**",
      ],
      {
        encoding: "utf8",
      },
    );
  } catch (error) {
    const stdout = error?.stdout?.toString?.() ?? "";
    const stderr = error?.stderr?.toString?.() ?? "";
    // rg retorna 1 quando não encontra match (cenário válido)
    if (error?.status === 1) {
      return [];
    }

    throw new Error(
      `Falha ao executar varredura de hard delete Prisma.\n${stdout}\n${stderr}`.trim(),
    );
  }

  return output
    .split("\n")
    .map((line) => normalizeEntry(line))
    .filter(Boolean)
    .sort();
}

function main() {
  const baseline = readBaseline();
  const found = collectHardDeleteEntries();
  const unknown = found.filter((entry) => !baseline.has(entry));

  if (unknown.length > 0) {
    console.error("Hard delete Prisma detectado fora do baseline:");
    for (const entry of unknown) {
      console.error(`- ${entry}`);
    }
    console.error(
      "\nConverta para soft delete ou registre justificativa explícita no baseline.",
    );
    process.exit(1);
  }

  const resolved = [...baseline].filter((entry) => !found.includes(entry));
  console.log("Hard delete baseline check");
  console.log(`- entradas baseline: ${baseline.size}`);
  console.log(`- hard deletes atuais: ${found.length}`);
  console.log(`- regressões: ${unknown.length}`);
  console.log(`- pendências resolvidas: ${resolved.length}`);

  if (resolved.length > 0) {
    console.log(
      "Sugestão: remova entradas resolvidas de scripts/policies/prisma-hard-delete-baseline.json",
    );
  }
}

main();
