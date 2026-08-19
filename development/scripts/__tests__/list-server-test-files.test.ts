import assert from "node:assert/strict";
import test from "node:test";

import { listServerTestFiles } from "../list-server-test-files.js";
import { isIntegrationTestFile } from "../route-coverage-lib.js";

/**
 * @file Sanity coverage for `listServerTestFiles` — the shared enumeration behind
 * `test:cov:server:unit` / `test:cov:server:integration` (package.json). Real filesystem/`find`
 * shell-out against this actual repo checkout, deliberately: the thing worth verifying is that the
 * two lists partition the real `src/server/**\/*.test.ts` set with no overlap and no gaps, using the
 * SAME classifier the route-coverage diff gate's tier split depends on.
 */

test("listServerTestFiles: unit and integration lists partition all src/server test files with zero overlap", () => {
  const unit = listServerTestFiles("unit");
  const integration = listServerTestFiles("integration");

  assert.ok(unit.length > 0, "expected at least one unit test file in src/server");
  assert.ok(integration.length > 0, "expected at least one integration test file in src/server");

  const overlap = unit.filter((f) => integration.includes(f));
  assert.deepEqual(overlap, []);

  for (const f of unit) assert.equal(isIntegrationTestFile(f), false, `${f} should not classify as integration`);
  for (const f of integration) assert.equal(isIntegrationTestFile(f), true, `${f} should classify as integration`);
});

test("listServerTestFiles: known integration suites are present in the integration list", () => {
  const integration = listServerTestFiles("integration");
  assert.ok(
    integration.includes("src/server/__tests__/integration/boot-lifecycle-real-deps.integration.test.ts")
  );
});
