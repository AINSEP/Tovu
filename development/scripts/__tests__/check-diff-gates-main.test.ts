import assert from "node:assert/strict";
import test from "node:test";
import { changedRouteFiles, main as routeMain } from "../check-route-coverage-diff.ts";
import { main as safetyMain, mergeBaseOf } from "../check-test-safety-diff.ts";
import type { FileCoverage } from "../route-coverage-lib.ts";

const ROUTE_A = "apps/website/src/server/routes/site/a.ts";
const ROUTE_B = "apps/website/src/server/inbound/admin-http/routes/b.ts";
const cov = (file: string, brf: number, brh: number): FileCoverage => ({ file, lf: 1, lh: 1, brf, brh, fnf: 0, fnh: 0 });

function withBaseEnv<T>(run: () => T): T {
  const keys = ["ROUTE_COVERAGE_DIFF_BASE", "GITHUB_BASE_REF", "GITHUB_EVENT_BEFORE"] as const;
  const prior = keys.map(k => process.env[k]);
  for (const k of keys) delete process.env[k];
  try { return run(); } finally { keys.forEach((k, i) => { if (prior[i] === undefined) delete process.env[k]; else process.env[k] = prior[i]; }); }
}

function captureConsole(run: () => void): { out: string[]; err: string[] } {
  const out: string[] = []; const err: string[] = [];
  const log = console.log; const error = console.error;
  console.log = (...a: unknown[]) => { out.push(a.join(" ")); };
  console.error = (...a: unknown[]) => { err.push(a.join(" ")); };
  try { run(); } finally { console.log = log; console.error = error; }
  return { out, err };
}

test("changedRouteFiles diffs against the merge-base and keeps only measurable route files", () => {
  const calls: string[][] = [];
  const git = (args: string[]): string => {
    calls.push(args);
    if (args[0] === "merge-base") return "abc123\n";
    return [ROUTE_A, "  " + ROUTE_B + "  ", "", "apps/website/src/server/routes/site/__tests__/a.test.ts", "apps/website/src/server/routes/site/types.ts"].join("\n");
  };
  assert.deepEqual(changedRouteFiles("origin/main", git), [ROUTE_A, ROUTE_B]);
  assert.deepEqual(calls[0], ["merge-base", "origin/main", "HEAD"]);
  assert.deepEqual(calls[1].slice(0, 5), ["diff", "--name-only", "--diff-filter=ACMR", "abc123", "HEAD"]);
  assert.ok(calls[1].includes("apps/website/src/server/routes/"));
});

test("changedRouteFiles explains an unfetched base ref", () => {
  const git = (): string => { throw new Error("fatal: bad revision"); };
  assert.throws(() => changedRouteFiles("origin/zzz", git),
    /could not compute merge-base against 'origin\/zzz' — is it fetched \(needs fetch-depth: 0\)\? \(fatal: bad revision\)/);
});

test("route main is OK when nothing measurable changed, without reading coverage", () => {
  withBaseEnv(() => {
    let loaded = 0; let exited: number | undefined;
    const res = captureConsole(() => routeMain({
      argv: ["node", "x", "feature-base"],
      git: args => (args[0] === "merge-base" ? "m\n" : "README.md\n"),
      load: () => { loaded++; return []; },
      exit: code => { exited = code; },
    }));
    assert.deepEqual(res.out, ["check:route-coverage-diff — no measurable src/server/routes/** file changed vs feature-base. OK"]);
    assert.equal(loaded, 0);
    assert.equal(exited, undefined);
  });
});

test("route main fails with per-tier messages for under-covered, unrecorded and branchless files", () => {
  withBaseEnv(() => {
    let exited: number | undefined;
    const unit = [cov(ROUTE_A, 100, 100), cov(ROUTE_B, 100, 90)];
    const integration = [cov(ROUTE_A, 100, 90)];
    const loads: string[] = [];
    const res = captureConsole(() => routeMain({
      argv: ["node", "x"],
      git: args => (args[0] === "merge-base" ? "m\n" : `${ROUTE_A}\n${ROUTE_B}\n`),
      load: p => { loads.push(p); return p.endsWith("lcov.unit.info") ? unit : integration; },
      exit: code => { exited = code; },
    }));
    assert.equal(exited, 1);
    assert.equal(loads.length, 2);
    assert.match(res.out[0], /^check:route-coverage-diff — 2 changed file\(s\) vs origin\/main, thresholds: unit >= 99% branch, integration >= 95% branch:$/);
    assert.equal(res.out[1], `  FAIL  ${ROUTE_A}: unit 100.00% branch, integration 90.00% branch`);
    assert.equal(res.out[2], `  FAIL  ${ROUTE_B}: unit 90.00% branch, integration no integration coverage record`);
    assert.deepEqual(res.err, [
      "\ncheck:route-coverage-diff — FAIL:",
      `  - ${ROUTE_A}: integration 90.00% branch < 95%`,
      `  - ${ROUTE_B}: unit 90.00% branch < 99%`,
      `  - ${ROUTE_B}: integration no integration coverage record < 95%`,
    ]);
    assert.ok(!res.out.some(l => l.endsWith("— OK")));
  });
});

test("route main reports OK when every changed file clears both tiers", () => {
  withBaseEnv(() => {
    let exited: number | undefined;
    const res = captureConsole(() => routeMain({
      argv: ["node", "x"],
      git: args => (args[0] === "merge-base" ? "m\n" : `${ROUTE_A}\n`),
      load: () => [cov(ROUTE_A, 100, 100)],
      exit: code => { exited = code; },
    }));
    assert.equal(exited, undefined);
    assert.equal(res.out.at(-1), "\ncheck:route-coverage-diff — OK");
    assert.deepEqual(res.err, []);
  });
});

const TEST_FILE = "apps/website/src/features/x/__tests__/x.test.ts";
const SAFE = "import assert from 'node:assert/strict';\nassert.ok(true, 'with message');\n";
const UNSAFE = "import assert from 'node:assert/strict';\nassert.ok(true);\nassert.ok(false);\n";

function safetyGit(files: string, head: string, base: string) {
  const calls: string[][] = [];
  const run = (args: string[]): string => {
    calls.push(args);
    if (args[0] === "merge-base") return "mb1\n";
    if (args[0] === "diff") return files;
    if (args[0] === "show") return args[1].startsWith("HEAD:") ? head : base;
    throw new Error(`unexpected git ${args.join(" ")}`);
  };
  return { run, calls };
}

test("mergeBaseOf trims git output and wraps failures with a fetch-depth hint", () => {
  assert.equal(mergeBaseOf("b", () => "deadbeef\n"), "deadbeef");
  assert.throws(() => mergeBaseOf("origin/zzz", () => { throw new Error("boom"); }),
    /could not compute merge-base against 'origin\/zzz' — is it fetched \(needs fetch-depth: 0\)\? \(boom\)/);
});

test("test-safety main passes when changed files add no message-less assertions", () => {
  withBaseEnv(() => {
    const { run, calls } = safetyGit(`M\t${TEST_FILE}\n`, SAFE, UNSAFE);
    const out: string[] = []; const errs: string[] = []; const exits: number[] = [];
    safetyMain({ argv: ["node", "x", "base-ref"], runGit: run, log: m => out.push(m), error: m => errs.push(m), exit: c => exits.push(c) });
    assert.deepEqual(out, ["check:test-safety — 1 changed .ts file(s) vs base-ref: no new message-less assertions. OK"]);
    assert.deepEqual([errs, exits], [[], []]);
    assert.deepEqual(calls[0], ["merge-base", "base-ref", "HEAD"]);
  });
});

test("test-safety main fails and lists each regression with before -> after counts", () => {
  withBaseEnv(() => {
    const { run, calls } = safetyGit(`M\t${TEST_FILE}\n`, UNSAFE, SAFE);
    const out: string[] = []; const errs: string[] = []; const exits: number[] = [];
    safetyMain({ argv: ["node", "x", "base-ref"], runGit: run, log: m => out.push(m), error: m => errs.push(m), exit: c => exits.push(c) });
    assert.deepEqual(exits, [1]);
    assert.deepEqual(out, []);
    assert.deepEqual(errs, [
      "check:test-safety — FAIL: message-less assertions added (give each assert.ok/assert a message):",
      `  - ${TEST_FILE}: 0 -> 2`,
    ]);
    assert.ok(calls.some(c => c[0] === "show" && c[1] === `mb1:${TEST_FILE}`));
    assert.ok(calls.some(c => c[0] === "show" && c[1] === `HEAD:${TEST_FILE}`));
  });
});

test("default ports run real local git: diffing HEAD against itself changes nothing", () => {
  withBaseEnv(() => {
    assert.deepEqual(changedRouteFiles("HEAD"), []);
    assert.match(mergeBaseOf("HEAD"), /^[0-9a-f]{40}$/);
    process.env.ROUTE_COVERAGE_DIFF_BASE = "HEAD";
    const route = captureConsole(() => routeMain());
    assert.deepEqual(route.out, ["check:route-coverage-diff — no measurable src/server/routes/** file changed vs HEAD. OK"]);
    const safety = captureConsole(() => safetyMain());
    assert.deepEqual(safety.out, ["check:test-safety — 0 changed .ts file(s) vs HEAD: no new message-less assertions. OK"]);
  });
});
