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
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";

import { childProcessCoverageEnv } from "#src/contracts/core/child-process-coverage-env";

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
