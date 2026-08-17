import assert from "node:assert/strict";
import test from "node:test";

import { resolveBaseRef, ZERO_SHA } from "../check-route-coverage-diff";

/**
 * @file Direct coverage for `resolveBaseRef`'s push-event fallback — the fix for a real gap found
 * 2026-08-17: this gate's first real CI run on `general-work` fell through to `origin/main` (a
 * branch weeks stale relative to this one), flagging 75 longstanding route files as "changed"
 * instead of the handful this push actually touched. See the script's own header for the incident.
 */

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
