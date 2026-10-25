import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

/**
 * @file Owner rule (2026-10-25): observability and product-analytics vendor SDKs live in provider
 * plugins (Jini subpaths `@jini-ai/diagnostics/observability/{opentelemetry,sentry}`,
 * `@jini-ai/analytics/product/posthog`), never in Tovu core. This scans every production source file
 * under `apps/website/src` (tests and fixtures excluded: they drive the real SDKs on purpose) for any
 * static import, dynamic import, `require` or type import of a vendor SDK package.
 */
const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const VENDOR_SPECIFIER = /(?:from\s+|import\s*\(\s*|require\s*\(\s*|import\s+)["'](@opentelemetry\/[^"']+|@sentry\/[^"']+|posthog-(?:node|js)[^"']*)["']/g;

function productionFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules" || entry.name === "__tests__" || entry.name === "dist") return [];
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return productionFiles(full);
    return /\.(?:[cm]?[jt]sx?)$/.test(entry.name) && !/\.test\.|\.d\.[cm]?ts$/.test(entry.name) ? [full] : [];
  });
}

test("no production file in Tovu core imports an observability or analytics vendor SDK", () => {
  const files = productionFiles(SRC);
  assert.ok(files.length > 500, `scanned ${files.length} files — the scan root looks wrong`);
  const hits = files.flatMap((file) => [...fs.readFileSync(file, "utf8").matchAll(VENDOR_SPECIFIER)].map((m) => `${path.relative(SRC, file)}: ${m[1]}`));
  assert.deepEqual(hits, []);
});

test("the guard itself catches each import form (so an empty result means something)", () => {
  for (const line of ['import { trace } from "@opentelemetry/api";', 'const s = require("@sentry/node");', 'await import("posthog-node")', 'import "@sentry/node";']) {
    assert.ok([...line.matchAll(VENDOR_SPECIFIER)].length === 1, line);
  }
});
