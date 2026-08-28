/**
 * @file Enforces `src/platform/db/migration/pg-fixture.ts`'s own module doc: "this file is TEST
 * INFRASTRUCTURE ONLY ... it must never be imported from product code."
 *
 * Why a test rather than `check:boundaries` (dependency-cruiser): this repo's dependency-cruiser
 * rules are deliberately `severity: "warn"` everywhere, by design (REQ-11) — `npm run check:boundaries`
 * always exits 0 on ordinary violations, so a cruiser rule here would never actually gate anything. A
 * test fails closed; a warn-only lint rule does not. This is purely additive — it has no runtime
 * effect on `pg-fixture.ts` or anything that legitimately imports it.
 *
 * `pg-fixture.ts` shells out to `psql` via `spawnSync` (see its own header for why: no `pg`/`postgres`
 * driver is installed in this repo yet). If it were ever imported from a request-handling path, that
 * would mean spawning a subprocess — and shelling out to a system binary — on every call, which is
 * both a performance and an attack-surface mistake reserved for test infrastructure only.
 *
 * Method: scan every `.ts`/`.tsx` file under this repo's actual source roots for an import specifier
 * naming `pg-fixture`, and assert every match lives in this directory (`src/platform/db/__tests__/`), which is
 * where `pg-fixture.ts` itself and its one legitimate importer
 * (`migration-manifest-postgres.test.ts`) both live. Deliberately a plain substring/regex scan, not an
 * AST import parser — a look-alike false positive would just need adding to `ALLOWED_DIRS`, whereas a
 * parser bug that silently stopped matching a real import would defeat the whole guard. Conservative
 * (over-inclusive) is the correct failure direction here, matching this suite's fail-closed posture
 * (see `migration-manifest-postgres.test.ts`'s own header on why it never skips).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");
const ALLOWED_DIRS = new Set([import.meta.dirname]);

// Only these hold product/test TypeScript source — the roots a relative import from anywhere in the
// codebase could plausibly resolve through. Excludes gitignored toolkit/report trees (AI-Dev-Shop/,
// ADS-memory/) that are not part of the shipped application.
const SOURCE_ROOTS = ["src", "apps", "packages", "development", "ops"];

const SKIP_DIR_NAMES = new Set(["node_modules", "dist", "build", "coverage", ".turbo", ".next", "test-results", ".git"]);

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);

// Matches `pg-fixture` as an import specifier's final path segment (quoted, with or without a `.ts`
// extension) — e.g. `from "../migration/pg-fixture.js"` or `require("./pg-fixture.ts")` — without
// requiring a specific import syntax, so it catches `import`, `import type`, and `require()` alike.
const IMPORT_SPECIFIER_PATTERN = /pg-fixture(?:\.ts)?["']/;

function collectSourceFiles(dir: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIR_NAMES.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(full, out);
    } else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      out.push(full);
    }
  }
}

test("pg-fixture is imported only from src/platform/db/__tests__/ (it shells out to psql and must never reach product code)", () => {
  const files: string[] = [];
  for (const root of SOURCE_ROOTS) {
    const abs = path.join(REPO_ROOT, root);
    if (fs.existsSync(abs)) collectSourceFiles(abs, files);
  }
  assert.ok(files.length > 100, `sanity check: expected hundreds of source files under ${SOURCE_ROOTS.join(", ")}, found ${files.length}`);

  const offenders = files.filter((file) => {
    if (ALLOWED_DIRS.has(path.dirname(file))) return false;
    return IMPORT_SPECIFIER_PATTERN.test(fs.readFileSync(file, "utf8"));
  });

  assert.deepEqual(
    offenders,
    [],
    `pg-fixture.ts must only be imported from src/platform/db/__tests__/, but found an import in: ${offenders.join(", ")}`
  );
});
