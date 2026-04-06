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
    return line.replace(/\\/g, "/").replace(/\s+/g, " ");
  }

  const [, filePath, lineNumber, code] = match;
  const normalizedFilePath = filePath.replace(/\\/g, "/");
  const normalizedCode = code.trim().replace(/\s+/g, " ");
  return `${normalizedFilePath}:${lineNumber}:${normalizedCode}`;
}

function readBaseline() {
  const raw = readFileSync(BASELINE_PATH, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed.entries)) {
    throw new Error("Baseline inválida: propriedade `entries` ausente.");
  }
  return new Set(
    parsed.entries.map((entry) =>
      normalizeEntry(typeof entry === "string" ? entry : entry?.entry),
    ),
  );
}

function collectHardDeleteEntries() {
  const scannerCommands = [
    {
      cmd: "rg",
      args: [
        "-n",
        "(?:prisma|tx)\\.[A-Za-z0-9_]+\\.(delete|deleteMany)\\(",
        "app",
        "lib",
        "--glob",
        "!generated/**",
      ],
      notFoundCode: "ENOENT",
    },
    {
      cmd: "grep",
      args: [
        "-REn",
        "(prisma|tx)\\.[A-Za-z0-9_]+\\.(delete|deleteMany)\\(",
        "app",
        "lib",
        "--exclude-dir=generated",
      ],
      notFoundCode: "ENOENT",
    },
  ];

  let output = "";
  let lastFailure = null;

  for (const scanner of scannerCommands) {
    try {
      output = execFileSync(scanner.cmd, scanner.args, {
        encoding: "utf8",
      });
      lastFailure = null;
      break;
    } catch (error) {
      const status = Number(error?.status ?? 0);
      const code = String(error?.code ?? "");
      const stdout = error?.stdout?.toString?.() ?? "";
      const stderr = error?.stderr?.toString?.() ?? "";

      // scanner retornou sem matches
      if (status === 1) {
        return [];
      }

      if (code === scanner.notFoundCode) {
        lastFailure = {
          scanner: scanner.cmd,
          stdout,
          stderr,
        };
        continue;
      }

      throw new Error(
        `Falha ao executar varredura de hard delete Prisma com ${scanner.cmd}.\n${stdout}\n${stderr}`.trim(),
      );
    }
  }

  if (lastFailure) {
    throw new Error(
      `Nenhum scanner disponível para hard delete Prisma. Última falha: ${lastFailure.scanner}.\n${lastFailure.stdout}\n${lastFailure.stderr}`.trim(),
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
