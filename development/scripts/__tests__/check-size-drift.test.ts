import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  checkDebtHistory, gitAtBase, main, sourceMatchesBase, partitionExceptions, readDebt, readViolations,
  type MainOptions,
} from "../check-size-drift.ts";
import { REPO_ROOT, type Violation } from "../check-src-complexity-drift.ts";
import { sizeExceptions } from "../size-eslint.config.mjs";

const fileEntry = sizeExceptions.entries.find((e: { repo: string; function?: string }) => e.repo === "tovu" && !e.function);
const fnEntry = sizeExceptions.entries.find((e: { repo: string; function?: string }) => e.repo === "tovu" && e.function);
const v = (over: Partial<Violation> = {}): Violation => ({
  file: "apps/x/a.ts", function: "f#1", line: 3, rule: "max-lines-per-function", value: 90, ...over,
});
const debtJson = (violations: unknown[], version = 1): string => JSON.stringify({ version, violations });

function capture(run: () => void): { out: string[]; err: string[]; exitCode: typeof process.exitCode } {
  const out: string[] = []; const err: string[] = [];
  const log = console.log; const error = console.error; const before = process.exitCode;
  console.log = (...a: unknown[]) => { out.push(a.join(" ")); };
  console.error = (...a: unknown[]) => { err.push(a.join(" ")); };
  try { run(); } finally { console.log = log; console.error = error; }
  const exitCode = process.exitCode; process.exitCode = before;
  return { out, err, exitCode };
}

test("readDebt accepts a v1 list and rejects bad versions, shapes and entries", () => {
  assert.deepEqual(readDebt(debtJson([v()])), [v()]);
  assert.throws(() => readDebt(debtJson([], 2)), /Invalid size debt format/);
  assert.throws(() => readDebt(JSON.stringify({ version: 1 })), /Invalid size debt format/);
  for (const bad of [{ ...v(), line: 0 }, { ...v(), value: 1.5 }, { ...v(), rule: "complexity" }, { ...v(), file: 4 }]) {
    assert.throws(() => readDebt(debtJson([bad])), /Invalid size debt entry/);
  }
});

test("partitionExceptions splits owner exceptions (file and function) from debt", () => {
  assert.ok(fileEntry && fnEntry);
  const fileV = v({ file: fileEntry.file, function: "<file>", rule: "max-lines", value: 900 });
  const fnV = v({ file: fnEntry.file, function: fnEntry.identity });
  const wrongFn = v({ file: fnEntry.file, function: "other#1" });
  const wrongKind = v({ file: fileEntry.file, function: "<file>", rule: "max-lines-per-function" });
  const plain = v();
  const { debt, accepted } = partitionExceptions({ violations: [fileV, fnV, wrongFn, wrongKind, plain] });
  assert.deepEqual(accepted, [{ violation: fileV, reason: fileEntry.reason }, { violation: fnV, reason: fnEntry.reason }]);
  assert.deepEqual(debt, [wrongFn, wrongKind, plain]);
});

test("readViolations maps ESLint size messages onto file and enclosing-function identities", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "size-drift-"));
  try {
    const filePath = path.join(dir, "sample.ts");
    writeFileSync(filePath, "export function outer() {\n  const x = 1;\n  return x;\n}\n");
    const msg = (ruleId: string | null, line: number, column: number, message: string, fatal = false) =>
      ({ ruleId, line, column, message, fatal });
    const out = readViolations({
      filePath,
      messages: [
        msg("max-lines", 1, 1, "File has too many lines (700)."),
        msg("max-lines-per-function", 2, 3, "Function 'outer' has too many lines (95)."),
        msg("complexity", 1, 1, "ignored"),
      ],
    });
    assert.equal(out.length, 2);
    assert.deepEqual(out.map(o => [o.function, o.rule, o.value, o.line]), [
      ["<file>", "max-lines", 700, 1], ["outer#1", "max-lines-per-function", 95, 2],
    ]);
    assert.deepEqual(readViolations({ filePath, messages: [msg("complexity", 1, 1, "x")] }), []);
    assert.throws(() => readViolations({ filePath, messages: [msg("max-lines", 1, 1, "parse", true)] }), /sample\.ts:1: parse/);
    assert.throws(() => readViolations({ filePath, messages: [msg(null, 2, 1, "no rule")] }), /no rule/);
    assert.throws(
      () => readViolations({ filePath, messages: [msg("max-lines-per-function", 2, 3, "unparseable message")] }),
      /Cannot identify size violation at .*sample\.ts:2/,
    );
    assert.throws(
      () => readViolations({ filePath, messages: [msg("max-lines-per-function", 99, 1, "too many lines (9)")] }),
      /Cannot identify size violation/,
    );
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("checkDebtHistory is a no-op without SIZE_BASE_REF", () => {
  const git = () => { throw new Error("git must not run"); };
  assert.equal(checkDebtHistory([v()], [v()], { env: {}, git }), true);
});

function fakeGit(tree: Record<string, string>) {
  return (base: string, args: string[]): string => {
    if (args[0] === "ls-tree") return Object.keys(tree).join("\n") + "\n";
    const spec = base; // "<ref>:<file>"
    const file = spec.slice(spec.indexOf(":") + 1);
    if (!(file in tree)) throw new Error(`missing ${file}`);
    return tree[file];
  };
}
const DEBT = "development/scripts/size-debt.json";
const CHECKER = "development/scripts/check-size-drift.ts";
const POLICY = "development/scripts/size-exceptions.json";

test("checkDebtHistory handles a base without a debt list", () => {
  const first = capture(() => assert.equal(checkDebtHistory([], [], { env: { SIZE_BASE_REF: "b" }, git: fakeGit({ "a.ts": "" }) }), true));
  assert.deepEqual(first.out, ["check:size — capturing the first size debt snapshot."]);
  assert.throws(
    () => checkDebtHistory([], [], { env: { SIZE_BASE_REF: "b" }, git: fakeGit({ [CHECKER]: "" }) }),
    /Base revision is missing its size debt list/,
  );
});

test("checkDebtHistory rejects added and increased debt versus the base list", () => {
  const base = v();
  const git = fakeGit({ [DEBT]: debtJson([base]) });
  const env = { SIZE_BASE_REF: "b" };
  const added = v({ function: "g#1" });
  const worse = v({ value: 99 });
  const res = capture(() => assert.equal(checkDebtHistory([base, added], [base, added], { env, git }), false));
  assert.deepEqual(res.err, [`Added debt is not allowed: apps/x/a.ts:3 g#1 [max-lines-per-function] 90`]);
  const res2 = capture(() => assert.equal(checkDebtHistory([worse], [worse], { env, git }), false));
  assert.deepEqual(res2.err, ["Increased debt is not allowed: apps/x/a.ts:3 f#1 [max-lines-per-function] 99 (was 90)"]);
  assert.equal(checkDebtHistory([base], [base], { env, git }), true);
});

test("checkDebtHistory waives migration debt only from the 50-line policy for unchanged, accurately measured files", () => {
  const git50 = fakeGit({ [DEBT]: debtJson([]), [POLICY]: JSON.stringify({ limits: { functionLines: 50 } }) });
  const gitOther = fakeGit({ [DEBT]: debtJson([]), [POLICY]: JSON.stringify({ limits: { functionLines: 80 } }) });
  const gitNoLimits = fakeGit({ [DEBT]: debtJson([]), [POLICY]: JSON.stringify({}) });
  const env = { SIZE_BASE_REF: "b" };
  const entry = v();
  const asked: string[] = [];
  const same = (_b: string, file: string) => { asked.push(file); return true; };
  assert.equal(checkDebtHistory([entry], [entry], { env, git: git50, sameAsBase: same }), true);
  assert.equal(checkDebtHistory([entry, { ...entry, function: "h#1" }], [entry, { ...entry, function: "h#1" }], { env, git: git50, sameAsBase: same }), true);
  assert.deepEqual(asked, ["apps/x/a.ts", "apps/x/a.ts"]);
  const changed = capture(() => assert.equal(checkDebtHistory([entry], [entry], { env, git: git50, sameAsBase: () => false }), false));
  assert.equal(changed.err.length, 1);
  assert.equal(capture(() => checkDebtHistory([entry], [entry], { env, git: gitOther, sameAsBase: same })).err.length, 1);
  assert.equal(capture(() => checkDebtHistory([entry], [entry], { env, git: gitNoLimits, sameAsBase: same })).err.length, 1);
  // measured debt that was inflated relative to current disables the waiver for that file
  const lower = v({ value: 10 });
  const inflated = capture(() => assert.equal(checkDebtHistory([entry], [lower], { env, git: git50, sameAsBase: same }), false));
  assert.equal(inflated.err.length, 1);
  // a base without a policy file is not a 50-line migration
  const noPolicy = fakeGit({ [DEBT]: debtJson([]) });
  assert.equal(capture(() => checkDebtHistory([entry], [entry], { env, git: noPolicy, sameAsBase: same })).err.length, 1);
});

test("main passes when measured debt equals the baseline and reports accepted exceptions", () => {
  assert.ok(fileEntry);
  const accepted = v({ file: fileEntry.file, function: "<file>", rule: "max-lines", value: 800 });
  const opts: MainOptions = { debtRaw: debtJson([v()]), find: () => [v(), accepted], history: () => true };
  const res = capture(() => main({}, opts));
  assert.equal(res.exitCode, undefined);
  assert.equal(res.out.length, 2);
  assert.match(res.out[0], /^Accepted exception: .* — Generated from schema\.sqlite\.ts/);
  assert.equal(res.out[1], "check:size — ok: 2 violations (1 functions, 1 files); 1 debt entries, 1 accepted exceptions.");
});

test("main fails with specific drift messages: new, worsened and stale entries", () => {
  const added = v({ function: "new#1" });
  const worse = v({ value: 120 });
  const stale = v({ function: "gone#1" });
  const res = capture(() => main({}, { debtRaw: debtJson([v(), stale]), find: () => [worse, added], history: () => true }));
  assert.equal(res.exitCode, 1);
  assert.deepEqual(res.err, [
    "New violation: apps/x/a.ts:3 new#1 [max-lines-per-function] 90",
    "Worsened violation: apps/x/a.ts:3 f#1 [max-lines-per-function] 120 (baseline 90)",
    "Delete stale debt entry: apps/x/a.ts:3 gone#1 [max-lines-per-function] 90",
  ]);
  assert.deepEqual(res.out, []);
});

test("main fails when only the history check fails", () => {
  const res = capture(() => main({}, { debtRaw: debtJson([v()]), find: () => [v()], history: () => false }));
  assert.equal(res.exitCode, 1);
  assert.deepEqual(res.out, []);
});

test("main defaults read the real debt file and scan the real tree; exit code mirrors drift", { timeout: 300_000 }, () => {
  const res = capture(() => main({}, { history: () => true }));
  const drift = res.err.filter(line => /^(New|Worsened) violation: |^Delete stale debt entry: /.test(line));
  assert.deepEqual(res.err, drift, "only drift lines may be reported on stderr");
  if (drift.length === 0) {
    assert.equal(res.exitCode, undefined);
    assert.match(res.out.at(-1) ?? "", /^check:size — ok: \d+ violations \(\d+ functions, \d+ files\); \d+ debt entries, \d+ accepted exceptions\.$/);
  } else {
    assert.equal(res.exitCode, 1);
  }
});

test("gitAtBase and sourceMatchesBase use real local git and never waive on an unreadable base", () => {
  assert.match(gitAtBase("HEAD", ["rev-parse"]), /^[0-9a-f]{40}\n$/);
  assert.equal(sourceMatchesBase("HEAD", "development/scripts/does-not-exist.ts"), false);
  assert.equal(sourceMatchesBase("no-such-ref-xyz", "package.json"), false);
  const content = readFileSync(path.join(REPO_ROOT, "package.json"), "utf8");
  assert.equal(sourceMatchesBase("b", "package.json", () => content), true);
  assert.equal(sourceMatchesBase("b", "package.json", () => content + "x"), false);
});
