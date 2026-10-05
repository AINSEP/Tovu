/**
 * @file Proves `src/platform/db/schema.postgres.ts` still matches what `src/platform/db/schema.sqlite.ts` generates.
 *
 * Why a test rather than a code-review convention: the PostgreSQL schema is a build artifact, not
 * an authored file. Anyone adding a column to `schema.sqlite.ts` and forgetting to regenerate would
 * otherwise ship a PostgreSQL schema silently missing that column — and the failure would surface
 * only on a Postgres-backed site, at query time, far from the change that caused it. Deriving the
 * second dialect makes drift impossible to introduce *deliberately*; this test is what makes it
 * impossible to introduce *accidentally*.
 *
 * The check is exact-text, not semantic. That is intentional: the generator is deterministic, so
 * any textual difference means either the source schema moved or someone hand-edited the generated
 * file, and both are the same instruction to the developer — run the generator and commit it.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";

import { childProcessCoverageEnv } from "#src/contracts/core/child-process-coverage-env";

import { runGenerator } from "../../../../../../development/scripts/generate-postgres-schema.js";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../../../../..");
const GENERATOR = path.join("development", "scripts", "generate-postgres-schema.ts");

/** See `cli/__tests__/integration/export-command.integration.test.ts`'s identical constant for why
 * this exists: the generator runs as a real `npx tsx` child process and must not dump its own V8
 * coverage profile into this runner's aggregation directory. */
const WORKER_COVERAGE_DIR = mkdtempSync(path.join(os.tmpdir(), "tovu-schema-postgres-drift-worker-coverage-"));
after(() => rmSync(WORKER_COVERAGE_DIR, { recursive: true, force: true }));

test("schema.postgres.ts is up to date with schema.sqlite.ts (run the generator and commit if this fails)", () => {
  const run = (): string =>
    execFileSync("npx", ["tsx", GENERATOR, "--check"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: childProcessCoverageEnv(WORKER_COVERAGE_DIR),
    });

  // `--check` exits non-zero on drift, which execFileSync surfaces as a throw. Asserting on the
  // thrown output rather than a boolean keeps the generator's own remediation message in the
  // failure a developer actually reads.
  assert.doesNotThrow(run, "src/platform/db/schema.postgres.ts has drifted from src/platform/db/schema.sqlite.ts");
  assert.match(run(), /up to date/);
});


test("generator --check rejects isolated stale output without modifying it (F1598)", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "tovu-stale-postgres-output-"));
  const fixture = path.join(dir, "schema.postgres.ts");
  const stale = "// deliberately stale generated output\n";
  writeFileSync(fixture, stale);
  try {
    const stdout = recorder();
    const stderr = recorder();
    // The real generator, real fs, an isolated output file: only the path and the two streams are injected.
    const code = runGenerator({ check: true }, { outPath: fixture, stdout, stderr });
    assert.equal(code, 1);
    assert.match(stderr.text(), /^DRIFT: src\/platform\/db\/schema\.postgres\.ts does not match/m);
    assert.equal(stdout.text(), "");
    assert.equal(readFileSync(fixture, "utf8"), stale, "check mode must leave stale output untouched");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("generate mode writes exactly the checked-in schema to an isolated path, and --check then accepts it", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "tovu-fresh-postgres-output-"));
  const fixture = path.join(dir, "schema.postgres.ts");
  try {
    const stdout = recorder();
    assert.equal(runGenerator({ check: false }, { outPath: fixture, stdout, stderr: recorder() }), 0);
    assert.match(stdout.text(), /^wrote /);
    assert.equal(readFileSync(fixture, "utf8"), readFileSync(path.join(REPO_ROOT, "apps/website/src/platform/db/schema.postgres.ts"), "utf8"));
    const checkOut = recorder();
    assert.equal(runGenerator({ check: true }, { outPath: fixture, stdout: checkOut, stderr: recorder() }), 0);
    assert.match(checkOut.text(), /up to date/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

function recorder(): { write(text: string): void; text(): string } {
  const chunks: string[] = [];
  return { write: (text) => void chunks.push(text), text: () => chunks.join("") };
}
