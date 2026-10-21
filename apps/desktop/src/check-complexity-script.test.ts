/**
 * @file `scripts/check-complexity.ts` — the desktop 9/9 complexity gate — over fake ports for ESLint,
 * the debt file and stdio, plus the real ESLint invocation shape and one real entry run.
 */
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { MIN_FILES_LINTED, REPO_ROOT, lintAtCeiling, runComplexityGate } from "../scripts/check-complexity.ts";
import type { ComplexityGatePorts, LintRun } from "../scripts/check-complexity.ts";

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "scripts", "check-complexity.ts");
const DEBT = "/fixture/complexity-debt.json";

/** `count` clean ESLint file results, plus `violations` complexity messages on the first file. */
function eslintReport(count: number, violations: string[] = []): string {
  return JSON.stringify(Array.from({ length: count }, (_, index) => ({
    filePath: path.join(REPO_ROOT, "apps", "desktop", "src", `f${index}.ts`),
    messages: index === 0 ? violations.map((message) => ({ ruleId: "complexity", message })) : [],
  })));
}

function ports(lint: LintRun, files: Record<string, string> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const written: Record<string, string> = {};
  const fixture: ComplexityGatePorts = {
    lint: () => lint,
    exists: (target) => target in files,
    readFile: (target) => files[target] ?? assert.fail(`unexpected read of ${target}`),
    writeFile: (target, text) => { written[target] = text; },
    out: (text) => out.push(text),
    err: (text) => err.push(text),
  };
  return { ports: fixture, out, err, written };
}

const debtFile = (violations: { rule: string; file: string; reason: string }[]) => ({ [DEBT]: JSON.stringify({ violations }) });
const grandfathered = { rule: "complexity", file: "apps/desktop/src/f0.ts", reason: "old debt" };

test("a full-size scan whose only violations are grandfathered passes and says how many", () => {
  const fixture = ports({ status: 1, stdout: eslintReport(MIN_FILES_LINTED, ["old debt"]), stderr: "" }, debtFile([grandfathered]));
  assert.equal(runComplexityGate({ argv: [] }, fixture.ports, { debtPath: DEBT }), 0);
  assert.equal(fixture.out[0], `check-complexity — ${MIN_FILES_LINTED} files linted at 9/9\n`);
  assert.equal(fixture.out.at(-1), "check-complexity: OK — 1 grandfathered, 0 new\n");
  assert.deepEqual(fixture.err, []);
});

test("a new violation fails, a fixed one is reported for removal, and paths are made repo-relative", () => {
  const fixture = ports({ status: 1, stdout: eslintReport(MIN_FILES_LINTED, ["fresh"]), stderr: "" }, debtFile([grandfathered]));
  assert.equal(runComplexityGate({ argv: [] }, fixture.ports, { debtPath: DEBT }), 1);
  assert.ok(fixture.out.includes("  FIXED (remove from complexity-debt.json): [complexity] apps/desktop/src/f0.ts: old debt\n"));
  assert.ok(fixture.err.includes("  NEW: [complexity] apps/desktop/src/f0.ts: fresh\n"));
  assert.match(fixture.err.join(""), /1 NEW complexity violation\(s\)[\s\S]*check-complexity: FAILED\./);
});

test("a shrunken scan is not a clean scan", () => {
  const fixture = ports({ status: 0, stdout: eslintReport(MIN_FILES_LINTED - 1), stderr: "" }, debtFile([]));
  assert.equal(runComplexityGate({ argv: [] }, fixture.ports, { debtPath: DEBT }), 1);
  assert.match(fixture.err.join(""), new RegExp(`only ${MIN_FILES_LINTED - 1} file\\(s\\) were linted`));
});

test("an unusable ESLint run fails before any judgement, echoing its redacted stderr only when there is some", () => {
  const crashed = ports({ status: 2, stdout: "", stderr: "Oops! Could not find plugin \"sonarjs\"" });
  assert.equal(runComplexityGate({ argv: [] }, crashed.ports, { debtPath: DEBT }), 1);
  assert.match(crashed.err[0]!, /^check-complexity: FAIL — eslint exited 2 — that is a CRASH/);
  assert.match(crashed.err[1]!, /Could not find plugin/);

  const silent = ports({ status: null, stdout: "", stderr: "   " });
  assert.equal(runComplexityGate({ argv: [] }, silent.ports, { debtPath: DEBT }), 1);
  assert.equal(silent.err.length, 1);
});

test("a missing debt file fails loudly rather than passing by default", () => {
  const fixture = ports({ status: 0, stdout: eslintReport(MIN_FILES_LINTED), stderr: "" });
  assert.equal(runComplexityGate({ argv: [] }, fixture.ports, { debtPath: DEBT }), 1);
  assert.match(fixture.err.join(""), /no complexity-debt\.json\. Seed it with `node scripts\/check-complexity\.ts --update`/);
});

test("--update reseeds the debt file from this run's violations instead of judging it", () => {
  const fixture = ports({ status: 1, stdout: eslintReport(MIN_FILES_LINTED, ["a", "b"]), stderr: "" });
  assert.equal(runComplexityGate({ argv: ["--update"] }, fixture.ports, { debtPath: DEBT }), 0);
  const written = JSON.parse(fixture.written[DEBT]!) as { _comment: string; violations: unknown[] };
  assert.deepEqual(written.violations, [
    { rule: "complexity", file: "apps/desktop/src/f0.ts", reason: "a" },
    { rule: "complexity", file: "apps/desktop/src/f0.ts", reason: "b" },
  ]);
  assert.match(written._comment, /never to turn a red gate green/);
  assert.deepEqual(fixture.out, ["check-complexity — wrote 2 violation(s) to complexity-debt.json\n"]);
});

test("a corrupt debt file, or a non-Error failure, fails the gate with a readable line", () => {
  const corrupt = ports({ status: 0, stdout: eslintReport(MIN_FILES_LINTED), stderr: "" }, { [DEBT]: "{not json" });
  assert.equal(runComplexityGate({ argv: [] }, corrupt.ports, { debtPath: DEBT }), 1);
  assert.match(corrupt.err.join(""), /JSON/);

  const odd = ports({ status: 0, stdout: "[]", stderr: "" });
  odd.ports.lint = () => { throw "lint port exploded"; };
  assert.equal(runComplexityGate({ argv: [] }, odd.ports, { debtPath: DEBT }), 1);
  assert.deepEqual(odd.err, ["lint port exploded\n"]);
});

test("lintAtCeiling runs ESLint from the repo root at 9/9 with test files ignored, and maps a signal to null", () => {
  const calls: unknown[][] = [];
  const spawn = ((command: string, args: string[], options: unknown) => {
    calls.push([command, args, options]);
    return { status: 1, signal: calls.length === 1 ? null : "SIGKILL", stdout: "[]", stderr: "" };
  }) as unknown as typeof spawnSync;

  assert.deepEqual(lintAtCeiling({ spawn }), { status: 1, stdout: "[]", stderr: "" });
  assert.deepEqual(lintAtCeiling({ spawn }), { status: null, stdout: "[]", stderr: "" });
  const [command, args, options] = calls[0] as [string, string[], { cwd: string }];
  assert.equal(command, "npx");
  assert.equal(options.cwd, REPO_ROOT);
  assert.deepEqual(args.slice(0, 2), ["eslint", "--no-error-on-unmatched-pattern"]);
  assert.ok(args.includes("**/*.test.{ts,tsx,js,mjs,cjs}"));
  assert.equal(JSON.parse(args[args.indexOf("--rule") + 1]!).complexity[1], 9);
  assert.equal(args.at(-1), "apps/desktop");

  const empty = ((() => ({ status: 0, signal: null, stdout: null, stderr: null })) as unknown) as typeof spawnSync;
  assert.deepEqual(lintAtCeiling({ spawn: empty }), { status: 0, stdout: "", stderr: "" });
});

test("the real entry lints this checkout and exits with a verdict it explains", { timeout: 120_000 }, () => {
  const child = spawnSync(process.execPath, [SCRIPT], { encoding: "utf8", timeout: 110_000 });
  assert.match(child.stdout, /^check-complexity — \d+ files linted at 9\/9\n/);
  if (child.status === 0) assert.match(child.stdout, /check-complexity: OK — \d+ grandfathered, 0 new\n$/);
  else {
    assert.equal(child.status, 1);
    assert.match(child.stderr, /check-complexity: FAILED\./);
  }
});
