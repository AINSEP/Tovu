import assert from "node:assert/strict";
import test from "node:test";

import { isFileLevelRollup } from "../check-test-baseline.js";

/**
 * @file Coverage for `isFileLevelRollup`, the classifier that stops `check:route-test-baseline`
 * from gating on file-level TAP roll-ups.
 *
 * Not a hypothetical edge case. Node emits one top-level `not ok N - <file path>` for a whole test
 * file alongside its per-test entries, and under CI resource pressure it can emit ONLY that
 * roll-up, whose reason text is a bare `test failed`. Both shapes match the same
 * `not ok \d+ - (.+)$` regex the baseline checker uses, but the baseline is keyed on test
 * DESCRIPTIONS — so a roll-up can never match a baseline entry and is guaranteed to report as
 * "new" on every run forever. Observed on real runs 32091498514, 32093877745, 32284065315
 * (10 reported, 8 of them roll-ups) and 32288089565 (8 reported, 6 of them roll-ups); every
 * roll-up file passed clean when re-run individually.
 *
 * The strings below are copied verbatim from run 32288089565's own failure list, so this test is
 * not asserting against an invented shape.
 */

test("real CI roll-up entries are classified as file-level, not as test descriptions", () => {
  const fromRun32288089565 = [
    "src/server/__tests__/integration/boot-lifecycle-real-deps.integration.test.ts",
    "src/server/__tests__/integration/create-sqlite-route-deps-for-workspace.integration.test.ts",
    "src/server/__tests__/integration/create-sqlite-route-deps-overrides.integration.test.ts",
    "src/server/__tests__/routes/newsletter-routes.test.ts",
    "src/server/__tests__/routes/request-cost-traversal.measurement.test.ts",
    "src/server/__tests__/routes/settings-register-definitions-op-validation.test.ts",
  ];
  for (const entry of fromRun32288089565) {
    assert.equal(isFileLevelRollup(entry), true, `expected a file-level roll-up: ${entry}`);
  }
});

test("real test descriptions are NOT classified as roll-ups, so genuine regressions still gate", () => {
  // Both of these were real, description-shaped failures in the same run as the roll-ups above —
  // they were fixed in code, not excluded. If this classifier ever swallowed them, a real
  // regression would pass CI silently, which is the one failure mode that must not happen.
  const realFailures = [
    "GET themes lists discovered built-in themes, TB-01 ordered, exactly one marked active",
    "lineage present and non-null: the manifest's own lineage object is echoed back verbatim",
    "AC-27: ENABLE_PRINCIPAL route re-activates a disabled user",
    "packet-one admin and content routes expose the seeded post loop",
  ];
  for (const entry of realFailures) {
    assert.equal(isFileLevelRollup(entry), false, `expected a test description: ${entry}`);
  }
});

test("a description that merely MENTIONS a path or an extension is not a roll-up", () => {
  // The classifier requires BOTH a path separator and a test-file extension at the very END of the
  // string. A prose description quoting a filename mid-sentence must not be swallowed.
  const prose = [
    "theme-static-assets.test.ts is wired into the server before the catch-all",
    "reads src/server/routes/admin/themes/explore.ts and reports its own errors",
    "a post whose slug looks like src/foo.test.ts still renders",
  ];
  for (const entry of prose) {
    assert.equal(isFileLevelRollup(entry), false, `expected NOT a roll-up: ${entry}`);
  }
});

test("roll-up detection covers the other test-file extensions node can emit", () => {
  for (const entry of [
    "src/a/b.spec.ts",
    "src/a/b.test.tsx",
    "src/a/b.test.js",
    "src/a/b.test.mjs",
    "src/a/b.test.cjs",
    "src\\a\\b.test.ts", // Windows-style separator
  ]) {
    assert.equal(isFileLevelRollup(entry), true, `expected a file-level roll-up: ${entry}`);
  }
});
