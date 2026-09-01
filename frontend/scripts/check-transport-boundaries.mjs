#!/usr/bin/env node
/**
 * check-transport-boundaries.mjs
 *
 * T-59 guardrail: every `fetch(`, `new EventSource`, and `XMLHttpRequest`
 * call site in `frontend/src` must live inside `services/transport/` — that
 * is the only place allowed to know how the app talks to the backend today
 * (HTTP). Everything else (hooks, components, pages) must go through
 * `getTransport()` so swapping in an IPC transport for Electron later never
 * requires touching them.
 *
 * Wired into `npm run lint` (see package.json) so a regression fails CI via
 * the repo's existing `verify.sh` → `npm run lint` path.
 *
 * Exits 1 and prints every offending `file:line` if a violation is found.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const SRC_ROOT = join(__dirname, '..', 'src');
const TRANSPORT_DIR = join('services', 'transport') + sep;

const FORBIDDEN_PATTERNS = [
  { name: 'fetch(', regex: /\bfetch\s*\(/ },
  { name: 'new EventSource', regex: /\bnew\s+EventSource\s*\(/ },
  { name: 'XMLHttpRequest', regex: /\bXMLHttpRequest\b/ },
];

const SCAN_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);

/**
 * Pre-existing, out-of-scope exceptions. T-59 explicitly forbids touching
 * `src/components/**` — this file already called `fetch` directly for
 * login before this refactor, and moving it onto the transport layer would
 * require editing a component. Tracked as follow-up work; see T-59 report.
 * Keep this list short and each entry commented — it is a debt list, not a
 * pattern to add to.
 */
const ALLOWED_EXCEPTIONS = new Set([join('components', 'auth', 'LoginForm.tsx')]);

/** @returns {string[]} absolute paths of every file under `dir` */
function walk(dir) {
  /** @type {string[]} */
  const results = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      results.push(...walk(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

function main() {
  const files = walk(SRC_ROOT);
  /** @type {{ file: string, line: number, match: string }[]} */
  const violations = [];

  for (const absPath of files) {
    const relPath = relative(SRC_ROOT, absPath);
    const ext = relPath.slice(relPath.lastIndexOf('.'));
    if (!SCAN_EXTENSIONS.has(ext)) continue;
    if (relPath.startsWith(TRANSPORT_DIR)) continue;
    if (ALLOWED_EXCEPTIONS.has(relPath)) continue;

    const contents = readFileSync(absPath, 'utf8');
    const lines = contents.split('\n');

    lines.forEach((lineText, index) => {
      for (const pattern of FORBIDDEN_PATTERNS) {
        if (pattern.regex.test(lineText)) {
          violations.push({ file: relPath, line: index + 1, match: pattern.name });
        }
      }
    });
  }

  if (violations.length > 0) {
    console.error('[check-transport-boundaries] Transport boundary violation(s) found:');
    console.error('Direct fetch/EventSource/XMLHttpRequest usage is only allowed inside services/transport/.');
    console.error('');
    for (const violation of violations) {
      console.error(`  src/${violation.file}:${violation.line} — uses ${violation.match}`);
    }
    console.error('');
    console.error('Route this call through getTransport() instead (see src/services/transport/index.ts).');
    process.exit(1);
  }

  console.log('[check-transport-boundaries] OK — no fetch/EventSource/XMLHttpRequest usage outside services/transport/.');
}

main();
