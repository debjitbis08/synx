#!/usr/bin/env node
// Lint guard: @synx/debug is dev/test-only. Fail if it is imported from
// production source (anywhere outside test files, the debug package itself,
// dev entry points, or config). Dependency-free; run via `pnpm check:debug`.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, basename } from "node:path";

const ROOT = process.cwd();
const SKIP_DIRS = new Set(["node_modules", "dist", ".git", "coverage"]);
const SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

// Matches `from '@synx/debug'`, `import '@synx/debug/vitest'`,
// `require('@synx/debug')` — i.e. real import/require, not comment mentions.
const IMPORT_RE =
  /(?:\bfrom\s*|\bimport\s*|\brequire\s*\(\s*)['"]@synx\/debug(?:\/[^'"]*)?['"]/;

function isAllowed(path) {
  const file = basename(path);
  return (
    path.includes("/packages/debug/") ||
    path.includes("/test/") ||
    path.includes("/scripts/") ||
    /\.(test|spec|debug)\./.test(file) ||
    /\.config\.[cm]?[jt]s$/.test(file)
  );
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (SOURCE_EXT.test(entry)) yield full;
  }
}

const violations = [];
for (const file of walk(ROOT)) {
  if (isAllowed(file)) continue;
  const text = readFileSync(file, "utf8");
  if (IMPORT_RE.test(text)) {
    const line = text.split("\n").findIndex((l) => IMPORT_RE.test(l)) + 1;
    violations.push(`${file.replace(ROOT + "/", "")}:${line}`);
  }
}

if (violations.length > 0) {
  console.error(
    "✗ @synx/debug imported from production source (dev/test-only):",
  );
  for (const v of violations) console.error(`  ${v}`);
  console.error(
    "\nMove the import into a *.test.ts / *.debug.ts file, or the @synx/debug package.",
  );
  process.exit(1);
}

console.log("✓ no @synx/debug imports in production source");
