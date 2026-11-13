import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { diffAgainstBaseline, violationKey, type Violation } from "../check-src-complexity-drift.js";
import debt from "../src-complexity-debt.json" with { type: "json" };

// The former file-level admin allowance masked a second function in the same file;
// identical anonymous functions also require counts, not a presence-only Set.
const existing: Violation = {
  file: "apps/admin/src/lib/assistant-transport.ts", function: "translateRunAgentPayload#1",
  line: 20, rule: "complexity", value: 13,
};

test("a different function in an already grandfathered file is new debt", () => {
  const added = { ...existing, function: "buildLocalCliContextRef#1" };
  assert.deepEqual(diffAgainstBaseline([existing], [existing, added]).added, [added]);
});

test("a third identical occurrence cannot be hidden by a multiset entry", () => {
  const result = diffAgainstBaseline([existing, existing], [existing, existing, existing]);
  assert.deepEqual(result.added, [existing]);
  assert.deepEqual(result.removed, []);
});

test("a worse value fails while an improvement and a line shift remain allowed", () => {
  const increased = { ...existing, line: 21, value: 14 };
  assert.deepEqual(diffAgainstBaseline([existing], [increased]).worsened, [{ baseline: existing, current: increased }]);
  const improved = { ...existing, line: 21, value: 11 };
  assert.deepEqual(diffAgainstBaseline([existing], [improved]), { added: [], removed: [], worsened: [] });
});

test("a fixed violation must be removed from the debt list", () => {
  assert.deepEqual(diffAgainstBaseline([existing], []).removed, [existing]);
});

test("file and rule are part of the function identity, but line and value are not", () => {
  assert.equal(violationKey(existing), violationKey({ ...existing, line: 99, value: 12 }));
  assert.notEqual(violationKey(existing), violationKey({ ...existing, file: "other.ts" }));
  assert.notEqual(violationKey(existing), violationKey({ ...existing, rule: "sonarjs/cognitive-complexity" }));
});

test("the recorded snapshot compares cleanly against itself", () => {
  assert.deepEqual(diffAgainstBaseline(debt.violations as Violation[], debt.violations as Violation[]),
    { added: [], removed: [], worsened: [] });
});

test("CLI consumes the ESLint JSON, names the function, and rejects new debt", (t) => {
  const scratch = mkdtempSync(path.join(tmpdir(), "complexity-cli-"));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  const fixture = path.join(scratch, "fixture.ts");
  const preload = path.join(scratch, "scanner.mjs");
  const root = path.resolve(import.meta.dirname, "../../..");
  const debtPath = path.join(root, "development/scripts/src-complexity-debt.json");
  writeFileSync(fixture, "function fixture() { return 1; }\n");
  // Only replace the scanner process and the baseline read: the real CLI and JSON conversion run.
  writeFileSync(preload, `
    import assert from 'node:assert/strict';
    import cp from 'node:child_process';
    import fs from 'node:fs';
    import { syncBuiltinESMExports } from 'node:module';
    const read = fs.readFileSync;
    fs.readFileSync = (file, ...args) => file === ${JSON.stringify(debtPath)}
      ? JSON.stringify({ version: 2, violations: [] }) : read(file, ...args);
    cp.execFileSync = (command, args) => {
      assert.equal(command, process.execPath);
      assert.ok(args.includes('development/scripts/complexity-eslint.config.mjs'));
      assert.ok(args.includes('--no-inline-config'));
      assert.ok(args.some(arg => arg.startsWith('apps/*/src/')));
      assert.ok(args.some(arg => arg.startsWith('packages/*/src/')));
      assert.ok(args.some(arg => arg.startsWith('content/agent-plugins/')));
      throw Object.assign(new Error('ESLint findings'), { status: 1, stdout: JSON.stringify([{
        filePath: ${JSON.stringify(fixture)}, messages: [{ ruleId: 'complexity', line: 1, column: 10,
          message: "Function 'fixture' has a complexity of 11. Maximum allowed is 10." }]
      }]) });
    };
    syncBuiltinESMExports();
  `);
  const result = spawnSync(process.execPath, ["--import", "tsx", "--import", pathToFileURL(preload).href,
    path.join(root, "development/scripts/check-src-complexity-drift.ts")], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /New violation: .*fixture\.ts:1 fixture#1 \[complexity\] 11/);
});
