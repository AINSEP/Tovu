import assert from "node:assert/strict";
import test from "node:test";

import { diffAgainstBaseline, type Violation } from "../check-src-complexity-drift.js";
import debt from "../admin-complexity-debt.json" with { type: "json" };

/**
 * @file Direct coverage for `check-admin-complexity-drift.ts`'s per-function ratchet behavior
 * (2026-09-05 rewrite). The script itself reuses `diffAgainstBaseline` from
 * `check-src-complexity-drift.ts` — see that file's own test for the multiset-diff mechanics in
 * general. This file instead reproduces the SPECIFIC bug the rewrite closed: a per-FILE debt list
 * let every OTHER function in a listed file drift unnoticed, because "is this file grandfathered"
 * was the whole question. Both scenarios below are real, not hypothetical — `apps/admin/src/lib/
 * assistant-transport.ts` genuinely had `translateRunAgentPayload` grandfathered while
 * `buildLocalCliContextRef` in the same file drifted to 18/13 undetected, before both were fixed.
 */

function translateRunAgentPayloadViolation(): Violation {
  return {
    rule: "complexity",
    file: "apps/admin/src/lib/assistant-transport.ts",
    reason: "Function 'translateRunAgentPayload' has a complexity of 13. Maximum allowed is 9.",
  };
}

function buildLocalCliContextRefViolation(): Violation {
  return {
    rule: "complexity",
    file: "apps/admin/src/lib/assistant-transport.ts",
    reason: "Function 'buildLocalCliContextRef' has a complexity of 18. Maximum allowed is 9.",
  };
}

test("per-function: a second, undeclared violation in an already-grandfathered FILE is caught", () => {
  // This is the exact shape of the bug a per-file Set diff missed: the debt list already knows
  // about `translateRunAgentPayload` in this file. A DIFFERENT function in that same file drifting
  // over the ceiling must still be flagged — the file being on the debt list is not a blanket pass.
  const baseline = [translateRunAgentPayloadViolation()];
  const current = [translateRunAgentPayloadViolation(), buildLocalCliContextRefViolation()];

  const { added, removed } = diffAgainstBaseline(baseline, current);

  assert.equal(added.length, 1, "the undeclared second violation in the same file must be flagged");
  assert.deepEqual(added[0], buildLocalCliContextRefViolation());
  assert.equal(removed.length, 0);
});

test("per-function: a naive per-FILE Set diff would have missed the same case (documented contrast)", () => {
  const baseline = [translateRunAgentPayloadViolation()];
  const current = [translateRunAgentPayloadViolation(), buildLocalCliContextRefViolation()];

  // The bug this rewrite closed, made concrete: a per-file Set diff asks "is this violation's FILE
  // in the debt list", not "is this exact violation in the debt list". Because the file is
  // grandfathered (via translateRunAgentPayload's entry), a naive file-level diff reports 0 new
  // violations even though a second, undeclared one just landed in the same file.
  const baselineFiles = new Set(baseline.map((v) => v.file));
  const naiveAdded = current.filter((v) => !baselineFiles.has(v.file));
  assert.equal(naiveAdded.length, 0, "sanity check: the naive per-file approach really does miss this");

  // The real (per-violation) mechanism must NOT make the same mistake.
  const { added } = diffAgainstBaseline(baseline, current);
  assert.equal(added.length, 1);
});

test("per-function: the same function drifting to a DIFFERENT number is a new violation, not tolerated", () => {
  // `reason` embeds the exact measured number (ESLint's own message text). A recorded debt entry
  // pinned at one number must not silently cover the same function after it drifts to a worse one
  // — e.g. `apps/admin/src/lib/api.ts`'s `request`, recorded at cyclomatic 12 but actually at 17.
  const recordedAtTwelve: Violation = {
    rule: "complexity",
    file: "apps/admin/src/lib/api.ts",
    reason: "Function 'request' has a complexity of 12. Maximum allowed is 9.",
  };
  const actualAtSeventeen: Violation = {
    rule: "complexity",
    file: "apps/admin/src/lib/api.ts",
    reason: "Function 'request' has a complexity of 17. Maximum allowed is 9.",
  };

  const { added, removed } = diffAgainstBaseline([recordedAtTwelve], [actualAtSeventeen]);

  assert.equal(added.length, 1, "drift to a worse, un-recorded number must be flagged as new");
  assert.deepEqual(added[0], actualAtSeventeen);
  assert.equal(removed.length, 1, "the stale recorded number is reported as no-longer-reproducing");
});

test("per-function: an existing recorded violation, unchanged, is tolerated", () => {
  const baseline = [translateRunAgentPayloadViolation()];
  const current = [translateRunAgentPayloadViolation()];

  const { added, removed } = diffAgainstBaseline(baseline, current);
  assert.deepEqual(added, []);
  assert.deepEqual(removed, []);
});

test("real baseline snapshot: development/scripts/admin-complexity-debt.json diffs clean against itself", () => {
  const violations = (debt as { violations: Violation[] }).violations;
  const { added, removed } = diffAgainstBaseline(violations, violations);
  assert.deepEqual(added, [], "a baseline diffed against itself must never report new violations");
  assert.deepEqual(removed, [], "a baseline diffed against itself must never report stale entries");
});
