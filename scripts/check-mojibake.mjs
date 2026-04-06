#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TEXT_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
  ".yml",
  ".yaml",
]);
const IGNORED_SEGMENTS = new Set([
  "node_modules",
  ".next",
  "generated",
  ".git",
  "coverage",
]);
const SUSPECT_REGEX = new RegExp(
  String.raw`\u00C3[\u0080-\u00BF]|\u00C2(?:[\u0080-\u00BF]| )|\u00E2\u20AC(?:.|$)|\uFFFD`,
  "gu",
);

function printHelp() {
  console.log(
    [
      "Usage: node scripts/check-mojibake.mjs [file ...]",
      "",
      "Scans tracked text files for mojibake patterns such as:",
      "  - \\u00C3x",
      "  - \\u00C2x",
      "  - \\u00E2\\u20AC...",
      "  - \\uFFFD",
      "",
      "When file paths are provided, only those files are scanned.",
    ].join("\n"),
  );
}

function isTextFile(relativePath) {
  const extension = path.extname(relativePath).toLowerCase();

  if (!TEXT_EXTENSIONS.has(extension)) {
    return false;
  }

  return !relativePath
    .split(/[\\/]+/)
    .some((segment) => IGNORED_SEGMENTS.has(segment));
}

function walkTextFiles(dir, result = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  entries.forEach((entry) => {
    if (IGNORED_SEGMENTS.has(entry.name)) {
      return;
    }

    const absolutePath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      walkTextFiles(absolutePath, result);
      return;
    }

    const relativePath = path.relative(ROOT, absolutePath);

    if (isTextFile(relativePath)) {
      result.push(relativePath);
    }
  });

  return result;
}

function listTrackedFiles() {
  try {
    const output = execFileSync("git", ["ls-files", "-z"], {
      cwd: ROOT,
      encoding: "buffer",
      stdio: ["ignore", "pipe", "ignore"],
    });

    return output
      .toString("utf8")
      .split("\0")
      .filter(Boolean)
      .filter(isTextFile);
  } catch {
    return walkTextFiles(ROOT);
  }
}

function normalizeInputFiles(inputFiles) {
  if (!inputFiles.length) {
    return listTrackedFiles();
  }

  return inputFiles
    .map((input) => path.resolve(ROOT, input))
    .map((absolutePath) => path.relative(ROOT, absolutePath))
    .filter(isTextFile);
}

function escapeForConsole(value) {
  return Array.from(value, (char) => {
    const codePoint = char.codePointAt(0);

    if (
      codePoint !== undefined &&
      codePoint >= 0x20 &&
      codePoint <= 0x7e &&
      char !== "\\"
    ) {
      return char;
    }

    if (codePoint === undefined) {
      return "";
    }

    if (codePoint <= 0xffff) {
      return `\\u${codePoint.toString(16).padStart(4, "0")}`;
    }

    return `\\u{${codePoint.toString(16)}}`;
  }).join("");
}

function formatSnippet(line) {
  const trimmed = line.trim();
  const snippet =
    trimmed.length > 200 ? `${trimmed.slice(0, 197)}...` : trimmed;

  return escapeForConsole(snippet);
}

function scanFile(relativePath) {
  const absolutePath = path.resolve(ROOT, relativePath);
  const source = fs.readFileSync(absolutePath, "utf8");
  const findings = [];
  const lines = source.split(/\r?\n/);

  lines.forEach((line, index) => {
    const matches = [...line.matchAll(SUSPECT_REGEX)];

    if (!matches.length) {
      return;
    }

    findings.push({
      file: relativePath.replace(/\\/g, "/"),
      line: index + 1,
      count: matches.length,
      snippet: formatSnippet(line),
    });
  });

  return findings;
}

function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  const files = normalizeInputFiles(args);
  const findings = files.flatMap(scanFile);

  if (!findings.length) {
    console.log("No mojibake detected in tracked text files.");
    return;
  }

  const totalOccurrences = findings.reduce(
    (sum, finding) => sum + finding.count,
    0,
  );
  const fileCount = new Set(findings.map((finding) => finding.file)).size;

  console.error(
    `Detected ${totalOccurrences} mojibake occurrence(s) in ${fileCount} file(s):`,
  );

  findings.forEach((finding) => {
    console.error(`${finding.file}:${finding.line}: ${finding.snippet}`);
  });

  process.exit(1);
}

main();
