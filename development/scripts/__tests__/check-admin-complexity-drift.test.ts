import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

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

// Keep the CLI and scanner real; replace only the ESLint process boundary.
test("admin CLI scans the strict admin scope, converts ESLint errors, and fails on new debt", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "admin-drift-cli-"));
  const preload = path.join(dir, "eslint-fixture.mjs");
  const newReason = "Function 'newAdminFunction' has a complexity of 10. Maximum allowed is 9.";
  try {
    writeFileSync(preload, `
      import assert from "node:assert/strict";
      import cp from "node:child_process";
      import { syncBuiltinESMExports } from "node:module";
      import path from "node:path";
      cp.execFileSync = (command, args, options) => {
        assert.equal(command, "npx");
        assert.deepEqual(args, ["eslint", "--no-error-on-unmatched-pattern", "--rule",
          JSON.stringify({ complexity: ["error", 9], "sonarjs/cognitive-complexity": ["error", 9] }),
          "-f", "json", "apps/admin/src/**/*.{ts,tsx}"]);
        assert.equal(options.cwd, ${JSON.stringify(path.resolve(import.meta.dirname, "../../.."))});
        const results = [
          { filePath: path.join(options.cwd, "apps/admin/src/new-admin.ts"), messages: [
            { ruleId: "complexity", line: 2, message: ${JSON.stringify(newReason)} },
            { ruleId: "no-unused-vars", line: 3, message: "IGNORE unrelated lint" }
          ] },
          { filePath: path.join(options.cwd, "apps/admin/src/__tests__/ignored.test.ts"),
            messages: [{ ruleId: "complexity", line: 1, message: "IGNORE test debt" }] },
          { filePath: path.join(options.cwd, "apps/admin/src/__measurements__/ignored.test.ts"),
            messages: [{ ruleId: "complexity", line: 1, message: "IGNORE measurement debt" }] }
        ];
        throw Object.assign(new Error("ESLint found errors"), { stdout: JSON.stringify(results) });
      };
      syncBuiltinESMExports();
    `);
    const result = spawnSync(process.execPath, ["--import", "tsx", "--import", pathToFileURL(preload).href,
      path.resolve(import.meta.dirname, "../check-admin-complexity-drift.ts")], { encoding: "utf8", timeout: 20_000 });
    assert.ifError(result.error);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /1 NEW apps\/admin complexity violation/);
    assert.ok(result.stderr.includes(`[complexity] apps/admin/src/new-admin.ts: ${newReason}`));
    assert.doesNotMatch(result.stderr, /IGNORE/);
    assert.match(result.stdout, /admin-complexity-debt\.json no longer reproduce/);
    const recorded = (debt as { violations: Violation[] }).violations[0]!;
    assert.ok(result.stdout.includes(`[${recorded.rule}] ${recorded.file}: ${recorded.reason}`), "the admin debt file supplies removed entries");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
