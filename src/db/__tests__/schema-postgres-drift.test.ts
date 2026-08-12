/**
 * @file Proves `src/db/schema.postgres.ts` still matches what `src/db/schema.ts` generates.
 *
 * Why a test rather than a code-review convention: the PostgreSQL schema is a build artifact, not
 * an authored file. Anyone adding a column to `schema.ts` and forgetting to regenerate would
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
import path from "node:path";
import test from "node:test";

const REPO_ROOT = path.resolve(__dirname, "../../..");
const GENERATOR = path.join("development", "scripts", "generate-postgres-schema.ts");

test("schema.postgres.ts is up to date with schema.ts (run the generator and commit if this fails)", () => {
  const run = (): string =>
    execFileSync("npx", ["tsx", GENERATOR, "--check"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

  // `--check` exits non-zero on drift, which execFileSync surfaces as a throw. Asserting on the
  // thrown output rather than a boolean keeps the generator's own remediation message in the
  // failure a developer actually reads.
  assert.doesNotThrow(run, "src/db/schema.postgres.ts has drifted from src/db/schema.ts");
  assert.match(run(), /up to date/);
});
