import assert from "node:assert/strict";
import test from "node:test";

import { isIntegrationTestFile } from "../route-coverage-lib";

/**
 * @file Direct coverage for `isIntegrationTestFile` — the canonical unit/integration test-tier
 * classifier behind the 2026-08-18 route-coverage-gate redesign (see `route-coverage-lib.ts`'s own
 * doc comment on the function for the two-part convention: filename suffix OR directory).
 */

test("isIntegrationTestFile: true for a file ending .integration.test.ts, regardless of directory", () => {
  assert.equal(
    isIntegrationTestFile("src/server/__tests__/integration/boot-lifecycle-real-deps.integration.test.ts"),
    true
  );
  assert.equal(
    isIntegrationTestFile("src/server/routes/admin/plugins/__tests__/integration/plugins-http.integration.test.ts"),
    true
  );
});

test("isIntegrationTestFile: true for a file under a __tests__/integration/ directory even without the filename suffix", () => {
  assert.equal(isIntegrationTestFile("src/server/__tests__/integration/some-suite.test.ts"), true);
});

test("isIntegrationTestFile: false for a plain unit test file", () => {
  assert.equal(isIntegrationTestFile("src/server/routes/site/__tests__/products.route.test.ts"), false);
});

test("isIntegrationTestFile: false for a file merely containing 'integration' in its name without the exact suffix", () => {
  assert.equal(isIntegrationTestFile("src/server/routes/admin/integrations/__tests__/create.test.ts"), false);
});

test("isIntegrationTestFile: normalizes backslash path separators before matching", () => {
  assert.equal(
    isIntegrationTestFile("src\\server\\__tests__\\integration\\boot-lifecycle-real-deps.integration.test.ts"),
    true
  );
});
