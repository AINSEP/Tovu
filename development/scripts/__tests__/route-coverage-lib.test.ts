import assert from "node:assert/strict";
import test from "node:test";

import { isIntegrationTestFile, isMeasurableRouteFile } from "../route-coverage-lib.js";

/**
 * @file Direct coverage for `isIntegrationTestFile` and `isMeasurableRouteFile` — the canonical
 * unit/integration test-tier classifier and route-file predicate behind
 * `check-route-coverage-floor.ts` / `check-route-coverage-diff.ts` (see `route-coverage-lib.ts`'s
 * own doc comments for the conventions each encodes).
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

/**
 * 2026-09-03: `apps/website/src/server/inbound/public-http/routes/**` (24 real route files — site
 * rendering, forms, members, oauth) was never added to `isMeasurableRouteFile`'s recognized prefix
 * list, so both route-coverage gates silently measured zero of them. This case must FAIL against the
 * pre-fix predicate (two `startsWith` prefixes only) and pass once `MEASURABLE_ROUTE_PREFIXES` gains
 * the third entry.
 */
test("isMeasurableRouteFile: true for a real public-http route file (regression for the 2026-09-03 unmeasured-prefix gap)", () => {
  assert.equal(isMeasurableRouteFile("apps/website/src/server/inbound/public-http/routes/site/pages.ts"), true);
});

test("isMeasurableRouteFile: existing behavior preserved — an admin-http route still matches", () => {
  assert.equal(
    isMeasurableRouteFile("apps/website/src/server/inbound/admin-http/routes/newsletter/list-campaigns.ts"),
    true
  );
});

test("isMeasurableRouteFile: existing behavior preserved — a co-located __tests__/ path never matches", () => {
  assert.equal(
    isMeasurableRouteFile(
      "apps/website/src/server/inbound/public-http/routes/site/__tests__/pages.test.ts"
    ),
    false
  );
});

test("isMeasurableRouteFile: existing behavior preserved — a type-only types.ts basename never matches", () => {
  assert.equal(isMeasurableRouteFile("apps/website/src/server/routes/types.ts"), false);
});
