#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';
import path from 'node:path';

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_BINARY_PREFIXES = ['contratoreal/'];
const TRANSIENT_PREFIXES = [
  '.git/',
  '.next/',
  'node_modules/',
  'generated/',
  '.vercel/',
  'coverage/',
  'playwright-report/',
  'test-results/',
  'output/',
  '.playwright-cli/',
  'tmp/',
];
const FORBIDDEN_BINARY_EXTENSIONS = new Set([
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.zip',
  '.rar',
  '.7z',
  '.tar',
  '.gz',
  '.bz2',
  '.mp4',
  '.mov',
  '.avi',
  '.mkv',
  '.heic',
]);
const SCREENSHOT_MEDIA_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.bmp',
  '.heic',
  '.mp4',
  '.mov',
  '.avi',
  '.mkv',
]);
const SCREENSHOT_NAME_PATTERN = /(^|[\s._-])(screenshot|screen ?shot|captura de tela|captura|print)([\s._-]|$)/i;

function readGitFiles(args) {
  const output = execFileSync('git', args, { encoding: 'utf8' });
  return output.split('\0').filter(Boolean);
}

function toSizeLabel(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function isAllowedBinary(filePath) {
  return ALLOWED_BINARY_PREFIXES.some((prefix) => filePath.startsWith(prefix));
}

function transientPrefix(filePath) {
  return TRANSIENT_PREFIXES.find((prefix) => filePath.startsWith(prefix)) || null;
}

function inspectFile(filePath, source) {
  const ext = path.extname(filePath).toLowerCase();
  const baseName = path.basename(filePath);
  const transient = transientPrefix(filePath);

  if (transient) {
    if (source === 'tracked') {
      return { reason: `arquivo transitório versionado em ${transient}` };
    }
    return null;
  }

  let stats;
  try {
    stats = statSync(filePath);
  } catch {
    return null;
  }

  if (!stats.isFile()) return null;

  if (FORBIDDEN_BINARY_EXTENSIONS.has(ext) && !isAllowedBinary(filePath)) {
    return { reason: `arquivo binário/documento fora de contratoreal/ (${ext})`, size: stats.size };
  }

  if (SCREENSHOT_MEDIA_EXTENSIONS.has(ext) && SCREENSHOT_NAME_PATTERN.test(baseName)) {
    return { reason: 'arquivo com cara de screenshot/print não deve entrar no repositório', size: stats.size };
  }

  if (!isAllowedBinary(filePath) && stats.size > MAX_FILE_SIZE_BYTES) {
    return { reason: `arquivo acima de ${toSizeLabel(MAX_FILE_SIZE_BYTES)} fora da allowlist`, size: stats.size };
  }

  return null;
}

const trackedFiles = readGitFiles(['ls-files', '-z']);
const untrackedFiles = readGitFiles(['ls-files', '--others', '--exclude-standard', '-z']);
const seen = new Set();
const violations = [];
const allowedHeavyFiles = [];
const scannedFiles = [];

for (const [source, files] of [
  ['tracked', trackedFiles],
  ['untracked', untrackedFiles],
]) {
  for (const filePath of files) {
    if (seen.has(filePath)) continue;
    seen.add(filePath);

    const transient = transientPrefix(filePath);
    if (transient && source === 'untracked') {
      continue;
    }

    let stats;
    try {
      stats = statSync(filePath);
    } catch {
      continue;
    }
    if (!stats.isFile()) continue;

    scannedFiles.push({ filePath, size: stats.size, source });

    if (isAllowedBinary(filePath) && stats.size >= 1024 * 1024) {
      allowedHeavyFiles.push({ filePath, size: stats.size });
    }

    const violation = inspectFile(filePath, source);
    if (violation) {
      violations.push({ filePath, source, size: stats.size, reason: violation.reason });
    }
  }
}

const heaviestNonAllowed = scannedFiles
  .filter((entry) => !isAllowedBinary(entry.filePath) && !transientPrefix(entry.filePath))
  .sort((a, b) => b.size - a.size)
  .slice(0, 10);

console.log('Repo hygiene audit');
console.log(`- arquivos rastreados: ${trackedFiles.length}`);
console.log(`- arquivos não rastreados: ${untrackedFiles.length}`);
console.log(`- arquivos fora da allowlist > 5 MB: ${heaviestNonAllowed.filter((entry) => entry.size > MAX_FILE_SIZE_BYTES).length}`);

if (allowedHeavyFiles.length > 0) {
  console.log('- arquivos grandes permitidos:');
  for (const entry of allowedHeavyFiles.sort((a, b) => b.size - a.size).slice(0, 10)) {
    console.log(`  - ${entry.filePath} (${toSizeLabel(entry.size)})`);
  }
}

if (heaviestNonAllowed.length > 0) {
  console.log('- maiores arquivos fora da allowlist:');
  for (const entry of heaviestNonAllowed) {
    console.log(`  - ${entry.filePath} (${toSizeLabel(entry.size)})`);
  }
}

if (violations.length > 0) {
  console.error('\nViolations:');
  for (const violation of violations) {
    console.error(`- [${violation.source}] ${violation.filePath} (${toSizeLabel(violation.size)}): ${violation.reason}`);
  }
  process.exit(1);
}

console.log('\nRepo hygiene OK.');
