import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  checkDebtHistory, findViolations, functionLocations, main, readDebt, readViolations, runEslint, type Violation,
} from "../check-src-complexity-drift.ts";

const v = (over: Partial<Violation> = {}): Violation => ({
  file: "apps/x/a.ts", function: "f#1", line: 3, rule: "complexity", value: 14, ...over,
});
const debtJson = (violations: unknown[], version = 2): string => JSON.stringify({ version, violations });

function capture(run: () => void) {
  const out: string[] = []; const err: string[] = [];
  const log = console.log; const error = console.error; const before = process.exitCode;
  console.log = (...a: unknown[]) => { out.push(a.join(" ")); };
  console.error = (...a: unknown[]) => { err.push(a.join(" ")); };
  try { run(); } finally { console.log = log; console.error = error; }
  const exitCode = process.exitCode; process.exitCode = before;
  return { out, err, exitCode };
}

function tmp<T>(run: (dir: string) => T, base = tmpdir()): T {
  const dir = mkdtempSync(path.join(base, "complexity-drift-"));
  try { return run(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

test("functionLocations names declarations, property values, anonymous callbacks, initializers and static blocks", () => {
  const source = [
    "export function a() { return 1; }",
    "const b = () => 2;",
    "const o = { m: function () { return 3; }, n() { return 4; } };",
    "[1].map(() => 5);",
    "[1].map(() => 6);",
    "class K { p = 7; q = () => 8; static { init(); } method() { return 9; } }",
  ].join("\n");
  const locs = functionLocations("x.ts", source);
  // Classes are not scopes: members are named by themselves; non-function property initializers are non-functions.
  assert.deepEqual(locs.map(l => [l.name, l.isFunction]), [
    ["a#1", true], ["b#1", true], ["m#1", true], ["n#1", true],
    ["<anonymous>#1", true], ["<anonymous>#2", true],
    ["p#1", false], ["<anonymous>#3", true], ["<static block>#1", false], ["method#1", true],
  ]);
  const m = locs.find(l => l.name === "m#1")!;
  assert.ok(m.headStart < m.start, "property-valued functions start at the property name");
  const a = locs[0];
  assert.equal(a.headStart, a.start);
  const tsx = functionLocations("c.tsx", "export const C = () => <div onClick={() => 1} />;");
  assert.deepEqual(tsx.map(l => l.name), ["C#1", "C#1.<anonymous>#1"]);
});

test("readDebt validates the v2 format and every entry", () => {
  assert.deepEqual(readDebt(debtJson([v(), v({ rule: "sonarjs/cognitive-complexity" })])).length, 2);
  assert.throws(() => readDebt(debtJson([], 1)), /Invalid complexity debt format/);
  assert.throws(() => readDebt(JSON.stringify({ version: 2 })), /Invalid complexity debt format/);
  for (const bad of [{ ...v(), file: 1 }, { ...v(), function: null }, { ...v(), line: 0 }, { ...v(), value: 0.5 }, { ...v(), rule: "max-lines" }]) {
    assert.throws(() => readDebt(debtJson([bad])), /Invalid complexity debt entry/);
  }
});

test("readViolations resolves each ESLint complexity message to the innermost enclosing function", () => {
  tmp(dir => {
    const filePath = path.join(dir, "s.ts");
    writeFileSync(filePath, "export function outer() {\n  const inner = () => {\n    return 1;\n  };\n  return inner;\n}\n");
    const msg = (ruleId: string | null, line: number, column: number, message: string, fatal = false) => ({ ruleId, line, column, message, fatal });
    const out = readViolations({ filePath, messages: [
      msg("complexity", 1, 8, "Function 'outer' has a complexity of 12."),
      msg("sonarjs/cognitive-complexity", 3, 5, "Refactor this function to reduce its Cognitive Complexity from 21 to the 15 allowed."),
      msg("max-lines", 1, 1, "ignored"),
    ] });
    assert.deepEqual(out.map(o => [o.function, o.rule, o.value, o.line]), [
      ["outer#1", "complexity", 12, 1], ["outer#1.inner#1", "sonarjs/cognitive-complexity", 21, 3],
    ]);
    assert.deepEqual(readViolations({ filePath, messages: [msg("max-lines", 1, 1, "x")] }), []);
    assert.throws(() => readViolations({ filePath, messages: [msg("complexity", 1, 1, "fatal parse", true)] }), /s\.ts:1: fatal parse/);
    assert.throws(() => readViolations({ filePath, messages: [msg(null, 2, 1, "no rule")] }), /no rule/);
    assert.throws(() => readViolations({ filePath, messages: [msg("complexity", 2, 1, "no number here")] }), /Cannot identify complexity violation at .*s\.ts:2/);
    assert.throws(() => readViolations({ filePath, messages: [msg("complexity", 6, 99, "complexity of 3")] }), /Cannot identify complexity violation/);
  });
});

test("runEslint returns findings on exit 1, empty on clean and throws on tool failure", () => {
  tmp(dir => {
    const config = path.join(dir, "eslint.config.mjs");
    writeFileSync(config, 'export default [{ files: ["**/*.js"], rules: { complexity: ["error", 1] } }];\n');
    const dirty = path.join(dir, "dirty.js");
    writeFileSync(dirty, "export function f(a) { if (a) { return 1; } return 2; }\n");
    const found = runEslint({ config, scopes: [dirty] });
    assert.equal(found.length, 1);
    assert.equal(found[0].filePath, dirty);
    assert.equal(found[0].messages[0].ruleId, "complexity");
    const clean = path.join(dir, "clean.js");
    writeFileSync(clean, "export const x = 1;\n");
    assert.deepEqual(runEslint({ config, scopes: [clean] }).flatMap(r => r.messages), []);
    assert.throws(() => runEslint({ config: path.join(dir, "missing.config.mjs"), scopes: [clean] }));
  }, import.meta.dirname);
});

test("checkDebtHistory: no-op without a base, legacy migration allowed, otherwise rejects added/increased debt", () => {
  assert.equal(checkDebtHistory([v()], { env: {}, show: () => { throw new Error("no git"); } }), true);
  const env = { COMPLEXITY_BASE_REF: "base" };
  const legacy = JSON.stringify({ violations: [{ reason: "legacy", file: "a" }] });
  const res = capture(() => assert.equal(checkDebtHistory([v()], { env, show: () => legacy }), true));
  assert.deepEqual(res.out, ["check:complexity — replacing the legacy baseline with the first unified snapshot."]);
  const show = () => debtJson([v()]);
  const added = v({ function: "g#1" });
  const r1 = capture(() => assert.equal(checkDebtHistory([v(), added], { env, show }), false));
  assert.deepEqual(r1.err, ["Added debt is not allowed: apps/x/a.ts:3 g#1 [complexity] 14"]);
  const r2 = capture(() => assert.equal(checkDebtHistory([v({ value: 20 })], { env, show }), false));
  assert.deepEqual(r2.err, ["Increased debt is not allowed: apps/x/a.ts:3 f#1 [complexity] 20 (was 14)"]);
  assert.equal(checkDebtHistory([v({ value: 5 })], { env, show }), true);
  // a version-less base that is not all legacy-shaped entries is validated as a normal list and rejected
  assert.throws(() => checkDebtHistory([v()], { env, show: () => JSON.stringify({ violations: [v()] }) }), /Invalid complexity debt format/);
  assert.throws(() => checkDebtHistory([v()], { env, show: () => JSON.stringify({}) }), /Invalid complexity debt format/);
  const empty = capture(() => assert.equal(checkDebtHistory([v()], { env, show: () => JSON.stringify({ violations: [] }) }), true));
  assert.equal(empty.out.length, 1);
});

test("main reports ok, drift and history failures with the right exit code", () => {
  const ok = capture(() => main({ debtRaw: debtJson([v(), v({ rule: "sonarjs/cognitive-complexity", function: "c#1" })]),
    find: () => [v(), v({ rule: "sonarjs/cognitive-complexity", function: "c#1" })], history: () => true }));
  assert.equal(ok.exitCode, undefined);
  assert.deepEqual(ok.out, ["check:complexity — ok: 2 entries (1 cyclomatic, 1 cognitive)."]);
  const bad = capture(() => main({ debtRaw: debtJson([v(), v({ function: "gone#1" })]),
    find: () => [v({ value: 30 }), v({ function: "new#1" })], history: () => true }));
  assert.equal(bad.exitCode, 1);
  assert.deepEqual(bad.err, [
    "New violation: apps/x/a.ts:3 new#1 [complexity] 14",
    "Worsened violation: apps/x/a.ts:3 f#1 [complexity] 30 (baseline 14)",
    "Delete stale debt entry: apps/x/a.ts:3 gone#1 [complexity] 14",
  ]);
  const hist = capture(() => main({ debtRaw: debtJson([v()]), find: () => [v()], history: () => false }));
  assert.equal(hist.exitCode, 1);
  assert.deepEqual(hist.out, []);
});

test("findViolations scans the real production scope and returns well-formed entries", { timeout: 300_000 }, () => {
  const found = findViolations();
  assert.ok(found.length > 0, "the repo carries complexity debt");
  for (const entry of found) {
    assert.match(entry.file, /\.[jt]sx?$/);
    assert.ok(entry.rule === "complexity" || entry.rule === "sonarjs/cognitive-complexity");
    assert.ok(Number.isInteger(entry.value) && entry.value > 0 && entry.line > 0);
  }
});
