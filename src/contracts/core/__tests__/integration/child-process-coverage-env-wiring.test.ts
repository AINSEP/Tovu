import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

/**
 * @file Pins that every test file known to spawn a real Node child process actually calls
 * `childProcessCoverageEnv` (`core/child-process-coverage-env.ts`), not merely that the helper
 * itself works in isolation (that is `child-process-coverage-env.unit.test.ts`'s job).
 *
 * The gap this closes: a helper that exists but isn't wired into its call sites leaves every one
 * of those sites still leaking its child's V8 coverage profile into the runner's aggregation
 * directory — exactly the corruption the helper was written to stop — while the unit test for the
 * helper itself stays green throughout, because it never looks at the call sites at all. Each
 * entry below is read from disk and checked for both the import and an actual call, so swapping
 * the call back out for a bare `{ ...process.env }` (or a helper that's imported but never
 * invoked) fails this test even though every other suite in the file would stay green.
 *
 * Static text inspection, not a behavioral spawn-and-inspect probe: the property under test here
 * is "does this file's source route its spawn(s) through the shared redirect", which is a
 * property of the source text itself. A behavioral probe would mean re-running each of these
 * (already expensive, some minutes-long) integration files just to observe an env var, once per
 * file, on every test run -- the source-level check gives the same guarantee for a fraction of
 * the cost.
 */

const REPO_ROOT = path.resolve(import.meta.dirname, "../../../..");

/** Every test file that spawns a real Node child process and must redirect its coverage output. */
const NODE_CHILD_SPAWNING_FILES = [
  "src/cli/__tests__/integration/export-command.integration.test.ts",
  "src/cli/__tests__/integration/theme-validate-command.integration.test.ts",
  "src/cli/__tests__/integration/theme-normalize-build-command.integration.test.ts",
  "src/cli/__tests__/integration/theme-migrate-command.integration.test.ts",
  "src/cli/__tests__/integration/introspect-command.integration.test.ts",
  "src/cli/__tests__/integration/init-command.integration.test.ts",
  "src/cli/__tests__/integration/help-and-unknown-command.integration.test.ts",
  "src/features/theme/__tests__/astro-real-bundler-conformance.test.ts",
  "src/platform/db/__tests__/schema-postgres-drift.test.ts",
  "src/cli/__tests__/integration/serve-command.integration.test.ts",
  "src/server/agent-daemon/__tests__/integration/daemon-boots.integration.test.ts",
  "src/platform/site-dir/__tests__/integration/init-site-fault-injection.integration.test.ts",
  "src/__tests__/integration/port-in-use.integration.test.ts",
];

const IMPORTS_HELPER = /from\s+["']#src\/core\/child-process-coverage-env["']/;
const CALLS_HELPER = /childProcessCoverageEnv\(/;

for (const relativePath of NODE_CHILD_SPAWNING_FILES) {
  test(`${relativePath}: imports and calls childProcessCoverageEnv (its Node child spawn(s) must not inherit the runner's coverage dir)`, () => {
    const source = fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
    assert.match(source, IMPORTS_HELPER, `${relativePath} does not import childProcessCoverageEnv from "#src/contracts/core/child-process-coverage-env"`);
    assert.match(source, CALLS_HELPER, `${relativePath} imports childProcessCoverageEnv but never calls it -- an unwired import gives no protection`);
  });
}
