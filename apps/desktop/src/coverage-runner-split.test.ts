/**
 * @file Drift guard for the runner split: which test globs run on bare node and which under tsx.
 *
 * The split is written down twice. `npm test` runs `package.json`'s `test` script, and
 * `scripts/check-coverage.mjs` runs `TEST_PASSES` from `coverage-floors.js`. If the two disagree, a
 * test file runs under a different runner in the gate than in the suite, or in only one of them.
 * The runner is not cosmetic: probe P4 showed tsx corrupts lcov counters. This fails naming every
 * glob the two disagree on.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { TEST_PASSES, parseNodeTestScript, runnerSplitDrift } from "./coverage-floors.ts";

const PACKAGE_JSON = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "package.json");

test("package.json's test script runs the same globs under the same runners as TEST_PASSES", () => {
  const manifest = JSON.parse(readFileSync(PACKAGE_JSON, "utf8"));
  assert.deepEqual(runnerSplitDrift(TEST_PASSES, parseNodeTestScript(manifest.scripts.test)), []);
});
