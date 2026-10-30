/**
 * @file `scripts/check-coverage.ts` — the desktop coverage-floor gate — run against a temp desktop
 * root with a fake test-pass `spawn` that writes the lcov a real pass would. The disk scan, the lcov
 * parse/merge and the floor verdicts are all the real code; nothing here re-runs this suite.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { rootFromArgv, runCoverageGate } from "../scripts/check-coverage.ts";
import type { CoverageGateContext } from "../scripts/check-coverage.ts";

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "scripts", "check-coverage.ts");
const DESKTOP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** One lcov record; `sf` absolute or relative. */
const record = (sf: string, [lh, lf]: [number, number], [brh, brf]: [number, number] = [0, 0], [fnh, fnf]: [number, number] = [0, 0]) =>
  `TN:\nSF:${sf}\nFNF:${fnf}\nFNH:${fnh}\nBRF:${brf}\nBRH:${brh}\nLF:${lf}\nLH:${lh}\nend_of_record\n`;

const AREAS = [
  { id: "main", dirs: ["src"], excludeDirs: ["src/renderer"], extensions: [".ts"], minFilesOnDisk: 1, floors: { line: 90, branch: 90, funcs: 90 } },
  { id: "renderer", dirs: ["src/renderer"], extensions: [".ts"], minFilesOnDisk: 1, floors: { line: 50 }, knownUnmeasured: ["src/renderer/legacy.ts"] },
];

/** A temp desktop root: two measurable sources, test files for both passes, and noise the disk scan
 *  must skip (node_modules, a dot-dir, a test file, a .d.ts, an excluded dir's file, a wrong extension).
 *  `config: null` writes no coverage-floors.json at all. */
function desktopRoot(config: unknown = { coverageInclude: ["src/**"], areas: AREAS, notMeasured: [{ what: "main.ts", why: "Electron entry" }] }): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-cov-gate-"));
  const write = (rel: string, text = "x") => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  };
  for (const rel of ["src/a.ts", "src/nested/b.ts", "src/renderer/r.ts", "src/renderer/legacy.ts", "src/a.test.ts", "src/renderer/r.test.ts",
    "src/types.d.ts", "src/readme.md", "src/node_modules/dep/index.ts", "src/.cache/c.ts"]) write(rel);
  if (config !== null) write("coverage-floors.json", typeof config === "string" ? config : JSON.stringify(config));
  return root;
}

type PassReply = { status?: number | null; signal?: NodeJS.Signals | null; stdout?: string; stderr?: string; error?: Error; lcov?: string };

/** A fake test-pass spawner: pass i writes `replies[i].lcov` to the lcov destination it was given. */
function context(root: string, replies: PassReply[]) {
  const out: string[] = [];
  const err: string[] = [];
  const calls: string[][] = [];
  const ctx: CoverageGateContext = {
    root,
    spawn: ((_command: string, args: string[]) => {
      calls.push(args);
      const reply = replies[calls.length - 1] ?? {};
      const destination = args.find((arg) => arg.startsWith("--test-reporter-destination=") && !arg.endsWith("=stdout"))!.split("=")[1]!;
      if (reply.lcov !== undefined) fs.writeFileSync(destination, reply.lcov);
      return { status: 0, signal: null, stdout: "", stderr: "", pid: 1, output: [], ...reply };
    }) as unknown as CoverageGateContext["spawn"],
    out: (text) => out.push(text),
    err: (text) => err.push(text),
  };
  return { ctx, out, err, calls };
}

const fullMain = (root: string) =>
  record(path.join(root, "src/a.ts"), [10, 10], [2, 2], [1, 1]) + record("src/nested/b.ts", [5, 5], [0, 0], [1, 1]);

test("a passing suite whose areas meet their floors is OK, and the not-measured list is printed by name", () => {
  const root = desktopRoot();
  const { ctx, out, err, calls } = context(root, [{ lcov: fullMain(root), stdout: "....\n" }, { lcov: record("src/renderer/r.ts", [3, 4]) }]);

  assert.equal(runCoverageGate(ctx), 0, err.join(""));
  const report = out.join("");
  assert.match(report, /OK {4}main/);
  assert.match(report, /OK {4}renderer/);
  assert.match(report, /NOT MEASURED — no floor applies, and this is deliberate:\n {4}- main\.ts: Electron entry/);
  assert.match(report, /\ncheck-coverage: OK\n$/);
  assert.match(report, /\.\.\.\./, "the pass's own output is echoed");
  assert.equal(calls.length, 2);
  assert.ok(calls[0]!.includes("--test-coverage-include=src/**"));
  assert.ok(calls[0]!.includes("--test-coverage-exclude=src/**/*.test.ts"));
  assert.ok(calls[0]!.includes("--test"));
});

test("an area under its floor fails the gate even though the suite passed", () => {
  const root = desktopRoot();
  const { ctx, out, err } = context(root, [{ lcov: record("src/a.ts", [1, 10]) + record("src/nested/b.ts", [1, 10]) }, { lcov: record("src/renderer/r.ts", [4, 4]) }]);
  assert.equal(runCoverageGate(ctx), 1);
  assert.match(out.join(""), /FAIL {2}main/);
  assert.match(err.join(""), /\ncheck-coverage: FAILED\n/);
});

test("lcov records outside the package or in node_modules are dropped, and a duplicate keeps the better image", () => {
  const root = desktopRoot();
  const lcov = record(path.join(root, "src/a.ts"), [10, 10], [2, 2], [1, 1])
    // A record with no branch/function counters at all reads them as zero, not as a parse failure.
    + "TN:\nSF:src/nested/b.ts\nLF:5\nLH:5\nend_of_record\n"
    + record(path.join(os.tmpdir(), "elsewhere.ts"), [0, 100])
    + record("src/node_modules/dep/index.ts", [0, 100])
    + record("src/a.ts", [1, 10])
    + record("src/renderer/r.ts", [1, 4])
    + "TN:\nno source file here\nend_of_record\n";
  // The second pass measured both areas again: worse for a.ts (ignored), better for r.ts (taken).
  const { ctx, out } = context(root, [{ lcov }, { lcov: record("src/renderer/r.ts", [4, 4]) + record("src/a.ts", [2, 10]) }]);
  assert.equal(runCoverageGate(ctx), 0, out.join(""));
  const report = out.join("");
  assert.match(report, /OK {4}main\n {10}line +100\.00%/);
  assert.match(report, /OK {4}renderer\n {10}line +100\.00%/);
});

test("a file on disk with no coverage record, not declared as known, fails the area", () => {
  const root = desktopRoot();
  // The main pass never wrote an lcov at all: its file is skipped, and both main sources go unmeasured.
  const { ctx, out } = context(root, [{}, { lcov: record("src/renderer/r.ts", [4, 4]) }]);
  assert.equal(runCoverageGate(ctx), 1);
  assert.match(out.join(""), /2 file\(s\) have NO coverage record and are not in knownUnmeasured: src\/a\.ts, src\/nested\/b\.ts/);
});

test("a failed, killed or unspawnable pass is reported as the suite not passing", () => {
  const root = desktopRoot();
  const { ctx, err } = context(root, [
    { status: 1, stderr: "1 failing", lcov: fullMain(root) },
    { status: null, signal: "SIGKILL", lcov: record("src/renderer/r.ts", [4, 4]) },
  ]);
  assert.equal(runCoverageGate(ctx), 1);
  assert.match(err.join(""), /1 failing/);
  assert.match(err.join(""), /the test suite itself did not pass \(node=1, tsx=null\)\. Coverage numbers from a failed run are not evidence\./);

  const spawnError = context(desktopRoot(), [{ error: new Error("spawnSync node ENOBUFS"), status: null }, {}]);
  assert.equal(runCoverageGate(spawnError.ctx), 1);
  assert.match(spawnError.err.join(""), /node=spawnSync node ENOBUFS/);
});

test("a pass whose globs match no test file is refused before spawning — node would call 0 tests a pass", () => {
  const root = desktopRoot();
  fs.rmSync(path.join(root, "src", "renderer", "r.test.ts"));
  const { ctx, err, calls } = context(root, [{ lcov: fullMain(root) }]);
  assert.equal(runCoverageGate(ctx), 1);
  assert.equal(calls.length, 1, "only the pass with test files spawned");
  assert.match(err.join(""), /tsx=no test file matches src\/renderer\/\*\*\/\*\.test\.ts src\/contracts\/\*\*\/\*\.test\.ts, which node would pass as 0 tests/);
});

test("a missing config, a corrupt config, and a config with no coverageInclude/notMeasured", () => {
  const missing = context(desktopRoot(null), []);
  assert.equal(runCoverageGate(missing.ctx), 1);
  assert.deepEqual(missing.err, ["check-coverage: FAIL — no coverage-floors.json. This gate cannot pass without one.\n"]);

  const corrupt = context(desktopRoot("{broken"), []);
  assert.equal(runCoverageGate(corrupt.ctx), 1);
  assert.match(corrupt.err.join(""), /JSON/);

  const root = desktopRoot({ areas: [{ ...AREAS[0], dirs: ["src", "absent-dir"] }] });
  const bare = context(root, [{ lcov: fullMain(root) }, {}]);
  assert.equal(runCoverageGate(bare.ctx), 0, bare.err.join(""));
  assert.ok(!bare.calls[0]!.some((arg) => arg.startsWith("--test-coverage-include=")));
  assert.ok(!bare.out.join("").includes("NOT MEASURED"));
});

test("a non-Error thrown from the spawn port still fails the gate with a readable line", () => {
  const { ctx, err } = context(desktopRoot(), []);
  ctx.spawn = () => { throw "spawn port exploded"; };
  assert.equal(runCoverageGate(ctx), 1);
  assert.deepEqual(err, ["spawn port exploded\n"]);
});

test("rootFromArgv defaults to the desktop root and resolves an explicit --root", () => {
  assert.equal(rootFromArgv([]), DESKTOP_ROOT);
  assert.equal(rootFromArgv(["--root"]), DESKTOP_ROOT);
  assert.equal(rootFromArgv(["--root", "/tmp/x/../y"]), path.resolve("/tmp/y"));
});

test("the real entry pointed at a root with no config fails with exit 1", () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-cov-empty-"));
  // NODE_NO_WARNINGS: Node < 24.3 prints a type-stripping ExperimentalWarning on stderr, which is not the gate's output.
  const child = spawnSync(process.execPath, [SCRIPT, "--root", empty], { encoding: "utf8", timeout: 60_000, env: { ...process.env, NODE_NO_WARNINGS: "1" } });
  assert.equal(child.status, 1);
  assert.equal(child.stderr, "check-coverage: FAIL — no coverage-floors.json. This gate cannot pass without one.\n");
});
