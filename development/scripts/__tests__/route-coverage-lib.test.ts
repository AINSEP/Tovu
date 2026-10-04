import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { isIntegrationTestFile, isMeasurableRouteFile, loadLcov, loadRouteCoverage, pct } from "../route-coverage-lib.js";

/**
 * @file Direct coverage for `isIntegrationTestFile` and `isMeasurableRouteFile` — the canonical
 * unit/integration test-tier classifier and route-file predicate behind
 * `check-route-coverage-floor.ts` / `check-route-coverage-diff.ts` (see `route-coverage-lib.ts`'s
 * own doc comments for the conventions each encodes).
 */

test("isIntegrationTestFile: true for a file ending .integration.test.ts, regardless of directory", () => {
  assert.equal(
    isIntegrationTestFile("src/server/foo/__tests__/boot-lifecycle-real-deps.integration.test.ts"),
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
    isIntegrationTestFile("src\\server\\__tests__\\integration\\some-suite.test.ts"),
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
      "apps/website/src/server/inbound/public-http/routes/site/__tests__/helpers.ts"
    ),
    false
  );
});

test("isMeasurableRouteFile: existing behavior preserved — a type-only types.ts basename never matches", () => {
  assert.equal(isMeasurableRouteFile("apps/website/src/server/routes/types.ts"), false);
});

test("isMeasurableRouteFile: excludes test suffixes outside __tests__", () => {
  for (const suffix of ["test", "spec"]) {
    assert.equal(isMeasurableRouteFile(`apps/website/src/server/routes/pages.${suffix}.ts`), false);
  }
});

test("isMeasurableRouteFile: legacy prefix, type-only basenames and sibling prefixes", () => {
  assert.equal(isMeasurableRouteFile("apps/website/src/server/routes/pages.ts"), true);
  for (const base of ["deps.ts", "execution-deps.ts"]) {
    assert.equal(isMeasurableRouteFile(`apps/website/src/server/routes/${base}`), false);
  }
  assert.equal(isMeasurableRouteFile("apps/website/src/server/routes-legacy/pages.ts"), false);
});

test("loadLcov normalizes records and counters; loadRouteCoverage filters source rows", () => {
  const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
  const dir = mkdtempSync(path.join(tmpdir(), "route-coverage-"));
  const fixture = path.join(dir, "lcov.info");
  try {
    writeFileSync(fixture, [
      "TN:fixture",
      `SF:  ${path.join(repoRoot, "apps/website/src/server/routes/pages.ts")}  `,
      "LF:12", "LH:9", "BRF:8", "BRH:3", "FNF:4", "FNH:2", "end_of_record",
      "SF:apps/admin/src/example.ts", "LF:7", "LH:5", "FNF:2", "FNH:1", "end_of_record",
      "SF:apps/website/src/server/routes/__tests__/helpers.ts", "LF:1", "LH:1", "end_of_record",
    ].join("\n"));
    const route = { file: "apps/website/src/server/routes/pages.ts", lf: 12, lh: 9, brf: 8, brh: 3, fnf: 4, fnh: 2 };
    assert.deepEqual(loadLcov(fixture), [
      route,
      { file: "apps/admin/src/example.ts", lf: 7, lh: 5, brf: 0, brh: 0, fnf: 2, fnh: 1 },
      { file: "apps/website/src/server/routes/__tests__/helpers.ts", lf: 1, lh: 1, brf: 0, brh: 0, fnf: 0, fnh: 0 },
    ]);
    assert.deepEqual(loadRouteCoverage(fixture), [route]);
    assert.equal(pct(3, 8), 37.5);
    assert.equal(pct(0, 0), 100);
    const missing = path.join(dir, "missing.info");
    assert.throws(() => loadLcov(missing), {
      message: `${missing} does not exist. Run \`npm run test:cov\` first — these gates only parse its output, they do not run tests themselves.`,
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
