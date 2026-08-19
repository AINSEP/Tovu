import assert from "node:assert/strict";
import test from "node:test";

import { diffAgainstBaseline, violationKey, type Violation } from "../check-src-complexity-drift.js";

/**
 * @file Direct coverage for `diffAgainstBaseline`'s multiset behavior — the load-bearing part of
 * `check-src-complexity-drift.ts` (see that file's header for the full design rationale). This is
 * not a hypothetical edge case: `src/server/routes/admin/widgets/agent-tools.ts` genuinely carries
 * two textually-identical `complexity` violations today ("Async arrow function has a complexity of
 * 10. Maximum allowed is 9." — two different anonymous async arrow functions, both reporting the
 * same message), confirmed by a live scan at HEAD `af5af566` on 2026-08-17. A naive `Set`-based
 * diff (as `check-admin-complexity-drift.ts`'s file-level precedent uses, and as Jini's
 * `check-guard-drift.ts` documents hitting first) treats "does this key exist in the baseline" as
 * the whole question — it cannot tell "two known" from "three, one of them new" apart, because a
 * Set collapses duplicates to one membership bit. `agent-tools.test-fixture` below reproduces that
 * exact shape with the real file/message text so this test is not testing an invented scenario.
 */

function agentToolsViolation(): Violation {
  return {
    rule: "complexity",
    file: "src/server/routes/admin/widgets/agent-tools.ts",
    reason: "Async arrow function has a complexity of 10. Maximum allowed is 9.",
  };
}

test("multiset: a THIRD occurrence of an already-known (rule, file, reason) is reported as added", () => {
  // Baseline (as shipped in src-complexity-debt.json) knows about exactly TWO of these — the real,
  // current count for agent-tools.ts. A THIRD identical violation appearing (e.g. a new function
  // added to the same file at the same complexity) must be flagged, not silently absorbed.
  const baseline = [agentToolsViolation(), agentToolsViolation()];
  const current = [agentToolsViolation(), agentToolsViolation(), agentToolsViolation()];

  const { added, removed } = diffAgainstBaseline(baseline, current);

  assert.equal(added.length, 1, "exactly the surplus (3rd) occurrence should be flagged as new");
  assert.deepEqual(added[0], agentToolsViolation());
  assert.equal(removed.length, 0);
});

test("multiset: a naive presence-only Set diff would have missed the same case (documented contrast)", () => {
  const baseline = [agentToolsViolation(), agentToolsViolation()];
  const current = [agentToolsViolation(), agentToolsViolation(), agentToolsViolation()];

  // The bug this test guards against, made concrete: a Set diff asks "was this key EVER seen in
  // baseline", not "how many times". Because the key exists in the baseline (twice), a naive Set
  // diff reports 0 new violations even though a real 3rd one just landed.
  const baselineKeySet = new Set(baseline.map(violationKey));
  const naiveAdded = current.filter((v) => !baselineKeySet.has(violationKey(v)));
  assert.equal(naiveAdded.length, 0, "sanity check: the naive Set approach really does miss this");

  // The real implementation must NOT make the same mistake.
  const { added } = diffAgainstBaseline(baseline, current);
  assert.equal(added.length, 1);
});

test("multiset: exact count match on both sides — nothing added, nothing removed", () => {
  const baseline = [agentToolsViolation(), agentToolsViolation()];
  const current = [agentToolsViolation(), agentToolsViolation()];

  const { added, removed } = diffAgainstBaseline(baseline, current);
  assert.deepEqual(added, []);
  assert.deepEqual(removed, []);
});

test("multiset: fewer occurrences in current than baseline — reported as removed, never as added", () => {
  const baseline = [agentToolsViolation(), agentToolsViolation()];
  const current = [agentToolsViolation()];

  const { added, removed } = diffAgainstBaseline(baseline, current);
  assert.deepEqual(added, []);
  assert.equal(removed.length, 1);
  assert.deepEqual(removed[0], agentToolsViolation());
});

test("multiset: a violation entirely absent from current is reported as removed", () => {
  const baseline = [agentToolsViolation()];
  const current: Violation[] = [];

  const { added, removed } = diffAgainstBaseline(baseline, current);
  assert.deepEqual(added, []);
  assert.equal(removed.length, 1);
});

test("multiset: a violation entirely absent from baseline is reported as added", () => {
  const baseline: Violation[] = [];
  const current = [agentToolsViolation()];

  const { added, removed } = diffAgainstBaseline(baseline, current);
  assert.equal(added.length, 1);
  assert.deepEqual(removed, []);
});

test("identity: same file and reason text but a DIFFERENT rule are distinct keys, not one", () => {
  // A single function can trip both `complexity` and `sonarjs/cognitive-complexity` — they must
  // never be treated as the same violation just because they share a file, even in the (contrived)
  // case where the message text happens to collide too.
  const cyclomatic: Violation = {
    rule: "complexity",
    file: "src/server/routes/admin/system/publish-site.ts",
    reason: "shared reason text",
  };
  const cognitive: Violation = {
    rule: "sonarjs/cognitive-complexity",
    file: "src/server/routes/admin/system/publish-site.ts",
    reason: "shared reason text",
  };

  assert.notEqual(violationKey(cyclomatic), violationKey(cognitive));

  // baseline knows only the cyclomatic one; the cognitive one must be flagged as new, not
  // absorbed because "a violation on this file+reason was already known".
  const { added } = diffAgainstBaseline([cyclomatic], [cyclomatic, cognitive]);
  assert.equal(added.length, 1);
  assert.deepEqual(added[0], cognitive);
});

test("identity: two DIFFERENT files with the same rule and reason text are distinct keys", () => {
  const fileA: Violation = { rule: "complexity", file: "a.ts", reason: "Async arrow function has a complexity of 10. Maximum allowed is 9." };
  const fileB: Violation = { rule: "complexity", file: "b.ts", reason: "Async arrow function has a complexity of 10. Maximum allowed is 9." };

  const { added } = diffAgainstBaseline([fileA], [fileA, fileB]);
  assert.equal(added.length, 1);
  assert.deepEqual(added[0], fileB);
});

test("real baseline snapshot: development/scripts/src-complexity-debt.json diffs clean against itself", () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires -- test-only, avoids importing the
  // live-ESLint-scanning module at load time for an unrelated assertion.
  const debt = require("../src-complexity-debt.json") as { violations: Violation[] };
  const { added, removed } = diffAgainstBaseline(debt.violations, debt.violations);
  assert.deepEqual(added, [], "a baseline diffed against itself must never report new violations");
  assert.deepEqual(removed, [], "a baseline diffed against itself must never report stale entries");
});
