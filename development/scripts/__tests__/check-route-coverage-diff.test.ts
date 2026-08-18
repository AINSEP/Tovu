import assert from "node:assert/strict";
import test from "node:test";

import { evaluateFileTiers, resolveBaseRef, ZERO_SHA } from "../check-route-coverage-diff";
import type { FileCoverage } from "../route-coverage-lib";

/**
 * @file Direct coverage for `resolveBaseRef`'s push-event fallback — the fix for a real gap found
 * 2026-08-17: this gate's first real CI run on `general-work` fell through to `origin/main` (a
 * branch weeks stale relative to this one), flagging 75 longstanding route files as "changed"
 * instead of the handful this push actually touched. See the script's own header for the incident.
 *
 * Also covers `evaluateFileTiers`, the pure per-file decision behind the 2026-08-18 two-tier
 * (unit >= 99% / integration >= 95% branch) redesign — see that function's own doc and the file
 * header's "Two-tier redesign" section for the three cases it exercises below.
 */

function fileCoverage(overrides: Partial<FileCoverage>): FileCoverage {
  return { file: "src/server/routes/site/example.ts", lf: 0, lh: 0, brf: 0, brh: 0, fnf: 0, fnh: 0, ...overrides };
}

const ARGV_NO_POSITIONAL = ["node", "check-route-coverage-diff.ts"];

function withEnv(vars: Record<string, string | undefined>, fn: () => void): void {
  const prior: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) prior[key] = process.env[key];
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    fn();
  } finally {
    for (const [key, value] of Object.entries(prior)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("push event: GITHUB_EVENT_BEFORE wins over the origin/main fallback", () => {
  withEnv(
    { ROUTE_COVERAGE_DIFF_BASE: undefined, GITHUB_BASE_REF: undefined, GITHUB_EVENT_BEFORE: "abc123def456" },
    () => {
      assert.equal(resolveBaseRef(ARGV_NO_POSITIONAL), "abc123def456");
    }
  );
});

test("brand-new branch's first push (GITHUB_EVENT_BEFORE is the all-zeros SHA) falls back to origin/main", () => {
  withEnv(
    { ROUTE_COVERAGE_DIFF_BASE: undefined, GITHUB_BASE_REF: undefined, GITHUB_EVENT_BEFORE: ZERO_SHA },
    () => {
      assert.equal(resolveBaseRef(ARGV_NO_POSITIONAL), "origin/main");
    }
  );
});

test("pull_request event: GITHUB_BASE_REF still wins over GITHUB_EVENT_BEFORE", () => {
  withEnv(
    { ROUTE_COVERAGE_DIFF_BASE: undefined, GITHUB_BASE_REF: "main", GITHUB_EVENT_BEFORE: "abc123def456" },
    () => {
      assert.equal(resolveBaseRef(ARGV_NO_POSITIONAL), "origin/main");
    }
  );
});

test("no env at all and no positional arg: falls all the way back to origin/main", () => {
  withEnv({ ROUTE_COVERAGE_DIFF_BASE: undefined, GITHUB_BASE_REF: undefined, GITHUB_EVENT_BEFORE: undefined }, () => {
    assert.equal(resolveBaseRef(ARGV_NO_POSITIONAL), "origin/main");
  });
});

test("an explicit positional arg beats every env var, including GITHUB_EVENT_BEFORE", () => {
  withEnv(
    { ROUTE_COVERAGE_DIFF_BASE: undefined, GITHUB_BASE_REF: undefined, GITHUB_EVENT_BEFORE: "abc123def456" },
    () => {
      assert.equal(resolveBaseRef(["node", "check-route-coverage-diff.ts", "some-explicit-ref"]), "some-explicit-ref");
    }
  );
});

test("evaluateFileTiers: neither tier has a record — fails both, no vacuous pass", () => {
  const result = evaluateFileTiers("src/server/routes/site/example.ts", undefined, undefined);
  assert.equal(result.ok, false);
  assert.equal(result.unit.ok, false);
  assert.equal(result.unit.pctValue, 0);
  assert.equal(result.integration.ok, false);
  assert.equal(result.integration.pctValue, 0);
});

test("evaluateFileTiers: brf 0 in the unit record vacuously passes both tiers, even with no integration record at all", () => {
  const unitRec = fileCoverage({ brf: 0, brh: 0 });
  const result = evaluateFileTiers("src/server/routes/site/example.ts", unitRec, undefined);
  assert.equal(result.ok, true);
  assert.equal(result.unit.ok, true);
  assert.equal(result.unit.pctValue, 100);
  assert.equal(result.integration.ok, true);
  assert.equal(result.integration.pctValue, 100);
});

test("evaluateFileTiers: brf 0 in the integration record (unit record absent) still vacuously passes both tiers", () => {
  const integrationRec = fileCoverage({ brf: 0, brh: 0 });
  const result = evaluateFileTiers("src/server/routes/site/example.ts", undefined, integrationRec);
  assert.equal(result.ok, true);
  assert.equal(result.unit.ok, true);
  assert.equal(result.integration.ok, true);
});

test("evaluateFileTiers: real branches, unit >= 99% and integration >= 95% — passes both", () => {
  const unitRec = fileCoverage({ brf: 100, brh: 99 });
  const integrationRec = fileCoverage({ brf: 100, brh: 95 });
  const result = evaluateFileTiers("src/server/routes/site/example.ts", unitRec, integrationRec);
  assert.equal(result.ok, true);
  assert.equal(result.unit.pctValue, 99);
  assert.equal(result.integration.pctValue, 95);
});

test("evaluateFileTiers: unit just under 99% fails even when integration is a perfect 100%", () => {
  const unitRec = fileCoverage({ brf: 100, brh: 98 });
  const integrationRec = fileCoverage({ brf: 100, brh: 100 });
  const result = evaluateFileTiers("src/server/routes/site/example.ts", unitRec, integrationRec);
  assert.equal(result.ok, false);
  assert.equal(result.unit.ok, false);
  assert.equal(result.integration.ok, true);
});

test("evaluateFileTiers: unit just under 95% fails the integration bar even when unit is a perfect 100%", () => {
  const unitRec = fileCoverage({ brf: 100, brh: 100 });
  const integrationRec = fileCoverage({ brf: 100, brh: 94 });
  const result = evaluateFileTiers("src/server/routes/site/example.ts", unitRec, integrationRec);
  assert.equal(result.ok, false);
  assert.equal(result.unit.ok, true);
  assert.equal(result.integration.ok, false);
});

test("evaluateFileTiers: real branches (from the unit record) but no integration record at all — integration reads 0%, a real failure, not vacuous", () => {
  const unitRec = fileCoverage({ brf: 20, brh: 20 });
  const result = evaluateFileTiers("src/server/routes/site/example.ts", unitRec, undefined);
  assert.equal(result.ok, false);
  assert.equal(result.unit.ok, true);
  assert.equal(result.integration.ok, false);
  assert.equal(result.integration.pctValue, 0);
  assert.match(result.integration.detail, /no integration coverage record/);
});

test("evaluateFileTiers: real branches (from the integration record) but no unit record at all — unit reads 0%, a real failure", () => {
  const integrationRec = fileCoverage({ brf: 20, brh: 20 });
  const result = evaluateFileTiers("src/server/routes/site/example.ts", undefined, integrationRec);
  assert.equal(result.ok, false);
  assert.equal(result.unit.ok, false);
  assert.equal(result.unit.pctValue, 0);
  assert.match(result.unit.detail, /no unit coverage record/);
});
