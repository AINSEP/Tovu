/**
 * @file Direct tests for `coverage-floors.ts`.
 *
 * The assertions that matter most here are the ones about files that are NOT in the lcov, because
 * that is the failure this module exists for: node's `--test-coverage-include` filters what was
 * loaded rather than forcing files in, so a file with no test leaves the denominator and the
 * percentage goes UP. A percentage-only floor cannot see that. Several tests below therefore check
 * that a HIGH percentage still fails when the scope quietly shrank.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  areaOwns,
  evaluateArea,
  evaluatePerFileBranch,
  formatArea,
  foreignImageFunctions,
  formatPerFileBranch,
  inventoryFailures,
  pct,
  isMeasurableSource,
  isInExcludedDir,
  isProductionSource,
  parseNodeTestScript,
  runnerSplitDrift,
} from "./coverage-floors.ts";
import type { ExcludedSource, LcovCounters, PerFileBranchPolicy } from "./coverage-floors.ts";

const perfect = { lf: 100, lh: 100, brf: 10, brh: 10, fnf: 5, fnh: 5 };
const poor = { lf: 100, lh: 50, brf: 10, brh: 5, fnf: 5, fnh: 1 };

function cov(entries: [string, LcovCounters][]): Map<string, LcovCounters> {
  return new Map(entries);
}

test("pct treats zero-found as 100 — correct for a file with no branches", () => {
  assert.equal(pct(0, 0), 100);
  assert.equal(pct(1, 2), 50);
});

test("test files and .d.ts files are not production source", () => {
  assert.equal(isMeasurableSource("src/a.js"), true);
  assert.equal(isMeasurableSource("src/a.test.js"), false);
  assert.equal(isMeasurableSource("src/a.spec.ts"), false);
  assert.equal(isMeasurableSource("src/a.d.ts"), false);
  assert.equal(isMeasurableSource("src/renderer/electron-webview.d.ts"), false);
});

// --- excludeDirs: cutting an area by role, not by extension --------------------------------------

test("a path inside an excluded directory, at any depth, is excluded", () => {
  assert.equal(isInExcludedDir("src/renderer/App.hooks.ts", ["src/renderer"]), true);
  assert.equal(isInExcludedDir("src/renderer/deep/nested/x.ts", ["src/renderer"]), true);
  assert.equal(isInExcludedDir("src/contracts/project.ts", ["src/renderer", "src/contracts"]), true);
});

test("the excluded directory itself counts as excluded, so a walk can prune it", () => {
  assert.equal(isInExcludedDir("src/renderer", ["src/renderer"]), true);
});

test("a sibling that merely SHARES the prefix is not excluded — the match is on a directory boundary", () => {
  // A bare startsWith would put src/renderer-foo/ and src/renderer.js in the renderer role, and a
  // main-process file would silently leave the 96/90/90 area it belongs to.
  assert.equal(isInExcludedDir("src/renderer-foo/x.js", ["src/renderer"]), false);
  assert.equal(isInExcludedDir("src/renderer.js", ["src/renderer"]), false);
  assert.equal(isInExcludedDir("src/rendererx/y.ts", ["src/renderer"]), false);
});

test("the match is anchored at the start of the path, not anywhere inside it", () => {
  assert.equal(isInExcludedDir("src/speech/src/renderer/x.js", ["src/renderer"]), false);
});

test("a trailing slash in the configured directory changes nothing, including the boundary", () => {
  assert.equal(isInExcludedDir("src/renderer/x.ts", ["src/renderer/"]), true);
  assert.equal(isInExcludedDir("src/renderer", ["src/renderer/"]), true);
  assert.equal(isInExcludedDir("src/renderer-foo/x.ts", ["src/renderer/"]), false);
});

test("no excludeDirs — absent or empty — excludes nothing", () => {
  assert.equal(isInExcludedDir("src/renderer/x.ts", []), false);
  assert.equal(isInExcludedDir("src/renderer/x.ts", undefined), false);
});

// --- the core trap: percentages cannot see their own scope shrinking ---------------------------

test("a file on disk with NO coverage record fails the area, even at 100% on what was measured", () => {
  const area = { id: "js", floors: { line: 90 } };
  const result = evaluateArea(area, ["src/a.js", "src/b.js"], cov([["src/a.js", perfect]]));

  assert.equal(result.actual.line, 100, "the measured half really is at 100%");
  assert.ok(result.failures.length > 0, "and the area must STILL fail");
  assert.deepEqual(result.newlyUnmeasured, ["src/b.js"]);
  assert.match(result.failures[0]!, /NO coverage record/);
  assert.match(result.failures[0]!, /src\/b\.js/, "the untested file must be named");
});

test("an explicitly grandfathered gap does NOT fail — debt is allowed when it is declared", () => {
  const area = { id: "ts", floors: { line: 90 }, knownUnmeasured: ["src/b.ts"] };
  const result = evaluateArea(area, ["src/a.ts", "src/b.ts"], cov([["src/a.ts", perfect]]));

  assert.deepEqual(result.failures, []);
  assert.deepEqual(result.unmeasured, ["src/b.ts"], "but it is still reported");
});

test("a THIRD unmeasured file fails even when two are grandfathered — the list cannot grow", () => {
  const known = ["src/1.ts", "src/2.ts"];
  const area = { id: "ts", knownUnmeasured: known };
  const result = evaluateArea(area, [...known, "src/3.ts", "src/a.ts"], cov([["src/a.ts", perfect]]));

  assert.deepEqual(result.newlyUnmeasured, ["src/3.ts"]);
  assert.ok(result.failures.some((f) => /src\/3\.ts/.test(f)));
});

test("the grandfather list is an ENUMERATION, not a count — nine DIFFERENT files still fail", () => {
  // The ratchet must not be satisfiable by keeping the same NUMBER of gaps. If it were a count or a
  // percentage, "9 files unmeasured" could quietly become nine different files while the gate stayed
  // green — a scope that silently widened without ever growing.
  const area = { id: "ts", knownUnmeasured: ["src/old-a.ts", "src/old-b.ts"] };
  const onDisk = ["src/new-a.ts", "src/new-b.ts", "src/covered.ts"];
  const result = evaluateArea(area, onDisk, cov([["src/covered.ts", perfect]]));

  assert.equal(result.unmeasured.length, 2, "the COUNT of gaps is unchanged");
  assert.deepEqual(
    result.newlyUnmeasured,
    ["src/new-a.ts", "src/new-b.ts"],
    "but both are different files, and both must fail"
  );
  assert.ok(result.failures.some((f) => /src\/new-a\.ts/.test(f)));
});

test("swapping ONE grandfathered file for another fails, even at an identical count", () => {
  const area = { id: "ts", knownUnmeasured: ["src/a.ts", "src/b.ts"] };
  const result = evaluateArea(area, ["src/a.ts", "src/c.ts"], cov([]));

  assert.equal(result.unmeasured.length, 2);
  assert.deepEqual(result.newlyUnmeasured, ["src/c.ts"], "the substituted file is caught by name");
  assert.ok(result.failures.length > 0);
});

test("a grandfathered file that regained coverage is flagged so the list shrinks", () => {
  const area = { id: "ts", knownUnmeasured: ["src/b.ts"] };
  const result = evaluateArea(area, ["src/b.ts"], cov([["src/b.ts", perfect]]));

  assert.deepEqual(result.recovered, ["src/b.ts"]);
  assert.deepEqual(result.failures, [], "recovering is not itself a failure, only a prompt");
});

test("an area whose directory vanished fails instead of reading as a clean 100%", () => {
  // pct()'s zero-found-is-100 convention would otherwise report perfect scores on an empty area —
  // the exact shape of a gate that has silently stopped gating.
  const area = { id: "bin", floors: { line: 85, branch: 80, funcs: 62 }, minFilesOnDisk: 2 };
  const result = evaluateArea(area, [], cov([]));

  assert.equal(result.actual.line, 100, "the percentages really do read 100");
  assert.ok(result.failures.some((f) => /expected at least 2/.test(f)));
  assert.ok(result.failures.some((f) => /NOT a pass/.test(f)));
});

test("a partial disappearance fails too, not only a total one", () => {
  const area = { id: "js", minFilesOnDisk: 24 };
  const result = evaluateArea(area, ["src/a.js", "src/b.js"], cov([["src/a.js", perfect], ["src/b.js", perfect]]));
  assert.ok(result.failures.some((f) => /only 2 file\(s\) found on disk, expected at least 24/.test(f)));
});

// --- ordinary floor behaviour -------------------------------------------------------------------

test("an area below its line floor fails and names the axis", () => {
  const area = { id: "js", floors: { line: 90, branch: 90, funcs: 90 } };
  const result = evaluateArea(area, ["src/a.js"], cov([["src/a.js", poor]]));

  assert.ok(result.failures.some((f) => /line 50\.00% < floor 90%/.test(f)));
  assert.ok(result.failures.some((f) => /branch 50\.00% < floor 90%/.test(f)));
  assert.ok(result.failures.some((f) => /funcs 20\.00% < floor 90%/.test(f)));
});

test("an axis with NO configured floor is never a failure", () => {
  const area = { id: "ts", floors: { line: 40, branch: 40 } };
  const result = evaluateArea(area, ["src/a.ts"], cov([["src/a.ts", poor]]));

  assert.deepEqual(result.failures, [], "funcs at 20% must not fail when no funcs floor is set");
  assert.equal(result.actual.funcs, 20);
});

test("an area at exactly its floor passes", () => {
  const area = { id: "js", floors: { line: 50 } };
  const result = evaluateArea(area, ["src/a.js"], cov([["src/a.js", poor]]));
  assert.deepEqual(result.failures, []);
});

// --- output ------------------------------------------------------------------------------------

test("the rendered area names every unmeasured file, every run", () => {
  const area = { id: "ts", floors: { line: 70 }, knownUnmeasured: ["src/b.ts", "src/c.ts"] };
  const result = evaluateArea(area, ["src/a.ts", "src/b.ts", "src/c.ts"], cov([["src/a.ts", perfect]]));
  const text = formatArea(result, area);

  assert.match(text, /OK {2}\s+ts/);
  assert.match(text, /UNMEASURED \(2, known gap/);
  assert.match(text, /- src\/b\.ts/);
  assert.match(text, /- src\/c\.ts/);
  assert.match(text, /1 measured of 3 on disk/, "the disk denominator must be visible");
});

test("an axis with no floor is rendered as such rather than as a silent pass", () => {
  const area = { id: "ts", floors: { line: 70 } };
  const text = formatArea(evaluateArea(area, ["src/a.ts"], cov([["src/a.ts", perfect]])), area);
  assert.match(text, /funcs.*no floor/);
});

// --- runner split: package.json's test script and TEST_PASSES must agree -------------------------

const SCRIPT = 'node --test "src/**/*.test.js" "src/*.test.ts" && node --import tsx --test "src/renderer/**/*.test.ts"';
const AGREEING_PASSES = [
  { id: "node", nodeArgs: [], globs: ["src/*.test.ts", "src/**/*.test.js"] },
  { id: "tsx", nodeArgs: ["--import", "tsx"], globs: ["src/renderer/**/*.test.ts"] },
];

test("a chained node --test script parses into one pass per command, quotes stripped", () => {
  assert.deepEqual(parseNodeTestScript(SCRIPT), [
    { nodeArgs: [], globs: ["src/**/*.test.js", "src/*.test.ts"] },
    { nodeArgs: ["--import", "tsx"], globs: ["src/renderer/**/*.test.ts"] },
  ]);
});

test("the same globs under the same runners report no drift, whatever the glob order", () => {
  assert.deepEqual(runnerSplitDrift(AGREEING_PASSES, parseNodeTestScript(SCRIPT)), []);
});

test("a glob moved from bare node to tsx is drift on both runners, by name", () => {
  // The deliberately mismatched copy. It holds the same globs overall, so a comparison of all globs
  // regardless of runner would pass it.
  const moved = [
    { id: "node", nodeArgs: [], globs: ["src/**/*.test.js"] },
    { id: "tsx", nodeArgs: ["--import", "tsx"], globs: ["src/renderer/**/*.test.ts", "src/*.test.ts"] },
  ];
  assert.deepEqual(runnerSplitDrift(moved, parseNodeTestScript(SCRIPT)), [
    'package.json runs src/*.test.ts under "node"; TEST_PASSES does not',
    'TEST_PASSES runs src/*.test.ts under "node --import tsx"; package.json does not',
  ]);
});

test("a glob only one side runs is drift, whichever side it is on", () => {
  // Two passes on one runner must merge, not replace each other: a replaced set would also report
  // src/renderer/**/*.test.ts here.
  const extra = [...AGREEING_PASSES, { id: "tsx2", nodeArgs: ["--import", "tsx"], globs: ["src/contracts/**/*.test.ts"] }];
  assert.deepEqual(runnerSplitDrift(extra, parseNodeTestScript(SCRIPT)), [
    'TEST_PASSES runs src/contracts/**/*.test.ts under "node --import tsx"; package.json does not',
  ]);
  assert.deepEqual(runnerSplitDrift([AGREEING_PASSES[0]!], parseNodeTestScript(SCRIPT)), [
    'package.json runs src/renderer/**/*.test.ts under "node --import tsx"; TEST_PASSES does not',
  ]);
});

test("a command the guard cannot read throws instead of comparing as zero globs", () => {
  assert.throws(() => parseNodeTestScript('node --test "src/**/*.test.js" && vitest run'), {
    message: 'not a "node [args] --test <globs>" command: vitest run',
  });
  assert.throws(() => parseNodeTestScript("node src/main.js"), {
    message: 'not a "node [args] --test <globs>" command: node src/main.js',
  });
});

// --- source inventory: every source file in exactly one area, or excluded with a why -------------
// The 2026-11-02 finding this exists for: main.ts, the renderer .tsx and both preloads matched no
// area, so they sat outside every denominator and could never fail. Each test below is a way a
// file could again end up counted nowhere, or twice, without the gate saying so.

test("production source covers every JS/TS extension and drops tests and declarations in all of them", () => {
  for (const file of ["src/a.ts", "src/A.tsx", "src/preload/p.mts", "src/speech/s.cts", "src/old.js", "src/old.cjs", "src/x.mjs", "src/y.jsx"]) {
    assert.equal(isProductionSource({ file }), true, file);
  }
  for (const file of ["src/a.test.ts", "src/A.test.tsx", "src/s.test.cts", "src/y.spec.jsx", "src/x.test.mjs", "src/t.d.ts", "src/t.d.mts", "src/t.d.cts"]) {
    assert.equal(isProductionSource({ file }), false, file);
  }
  for (const file of ["src/readme.md", "src/renderer/app.css", "coverage-floors.json"]) {
    assert.equal(isProductionSource({ file }), false, file);
  }
});

test("a name that merely CONTAINS test or spec is still production source", () => {
  // A loose /test/ match would drop these from the inventory, and with it from every area.
  assert.equal(isProductionSource({ file: "src/latest.ts" }), true);
  assert.equal(isProductionSource({ file: "src/a.testing.ts" }), true);
  assert.equal(isProductionSource({ file: "src/inspector.tsx" }), true);
});

const MAIN_AREA = { id: "main", dirs: ["src"], excludeDirs: ["src/renderer", "src/contracts"], extensions: [".ts", ".mts", ".cts"] };
const RENDERER_AREA = { id: "renderer", dirs: ["src/renderer", "src/contracts"], extensions: [".ts"] };
const COMPONENTS_AREA = { id: "components", dirs: ["src/renderer"], extensions: [".tsx"] };
const AREAS = [MAIN_AREA, RENDERER_AREA, COMPONENTS_AREA];

test("an area owns a file under its dirs, outside its excludeDirs, with one of its extensions", () => {
  assert.equal(areaOwns({ area: MAIN_AREA, file: "src/tovu-server.ts" }), true);
  assert.equal(areaOwns({ area: MAIN_AREA, file: "src/preload/preload.mts" }), true);
  assert.equal(areaOwns({ area: MAIN_AREA, file: "src/speech/preload-speech.cts" }), true);
  assert.equal(areaOwns({ area: MAIN_AREA, file: "src/renderer/App.hooks.ts" }), false, "excluded dir");
  assert.equal(areaOwns({ area: COMPONENTS_AREA, file: "src/renderer/app/TabStrip.tsx" }), true, "nested component");
});

test("the Electron entry's new home, src/main/index.ts, lands in the main-process area with no special case", () => {
  assert.equal(areaOwns({ area: MAIN_AREA, file: "src/main/index.ts" }), true);
  assert.equal(areaOwns({ area: MAIN_AREA, file: "src/main/windows/app-window.ts" }), true);
  assert.equal(inventoryFailures({ files: ["src/main/index.ts"], areas: AREAS }).length, 0);
});

test("an extension is matched whole: .ts does not own .mts, .tsx or .d.ts-shaped names by suffix accident", () => {
  const tsOnly = { id: "ts", dirs: ["src"], extensions: [".ts"] };
  assert.equal(areaOwns({ area: tsOnly, file: "src/p.mts" }), false);
  assert.equal(areaOwns({ area: tsOnly, file: "src/View.tsx" }), false);
  assert.equal(areaOwns({ area: tsOnly, file: "src/s.cts" }), false);
});

test("a dir is matched on a whole segment, and a root file is under no src area", () => {
  assert.equal(areaOwns({ area: MAIN_AREA, file: "src-legacy/x.ts" }), false);
  assert.equal(areaOwns({ area: MAIN_AREA, file: "main.ts" }), false);
});

test("an area with no dirs or no extensions owns nothing", () => {
  assert.equal(areaOwns({ area: { id: "empty" }, file: "src/a.ts" }), false);
  assert.equal(areaOwns({ area: { id: "no-ext", dirs: ["src"] }, file: "src/a.ts" }), false);
});

test("every file owned exactly once is a clean inventory", () => {
  const files = ["src/a.ts", "src/main/index.ts", "src/preload/preload.mts", "src/renderer/r.ts", "src/contracts/c.ts", "src/renderer/App.tsx"];
  assert.deepEqual(inventoryFailures({ files, areas: AREAS }), []);
});

test("a file no area scans FAILS by name — the .tsx-outside-every-area shape", () => {
  const failures = inventoryFailures({ files: ["src/a.ts", "src/renderer/App.tsx"], areas: [MAIN_AREA, RENDERER_AREA] });
  assert.deepEqual(failures, ["src/renderer/App.tsx is in no coverage area and not on the excluded list. Add it to an area, or exclude it with a why."]);
});

test("a root-level entry is in no area and fails unless it is excluded", () => {
  assert.equal(inventoryFailures({ files: ["main.ts"], areas: AREAS }).length, 1);
  const excluded: ExcludedSource[] = [{ file: "main.ts", why: "Electron entry until it moves" }];
  assert.deepEqual(inventoryFailures({ files: ["main.ts"], areas: AREAS }, { excluded }), []);
});

test("a file two areas scan fails naming both, since its lines would count twice", () => {
  const overlapping = [MAIN_AREA, { id: "speech", dirs: ["src/speech"], extensions: [".cts"] }];
  assert.deepEqual(inventoryFailures({ files: ["src/speech/preload-speech.cts"], areas: overlapping }), [
    "src/speech/preload-speech.cts is in 2 areas (main, speech). Areas must not overlap, or its lines count twice.",
  ]);
});

test("a file both in an area and excluded fails — exactly one, not both", () => {
  const excluded = [{ file: "src/a.ts", why: "reason" }];
  assert.deepEqual(inventoryFailures({ files: ["src/a.ts"], areas: AREAS }, { excluded }), [
    "src/a.ts is in area main AND on the excluded list. It must be one or the other.",
  ]);
});

test("an exclusion with no why fails — empty, blank, or missing", () => {
  const excluded = [
    { file: "a.ts", why: "" },
    { file: "b.ts", why: "   " },
    { file: "c.ts" } as unknown as ExcludedSource,
  ];
  const failures = inventoryFailures({ files: ["a.ts", "b.ts", "c.ts"], areas: AREAS }, { excluded });
  assert.deepEqual(failures, [
    'excluded a.ts has no "why". Every exclusion must say why it is outside every area.',
    'excluded b.ts has no "why". Every exclusion must say why it is outside every area.',
    'excluded c.ts has no "why". Every exclusion must say why it is outside every area.',
  ]);
});

test("an exclusion naming a file that is not on disk fails as stale — after main.ts moves, its entry must go", () => {
  const excluded = [{ file: "main.ts", why: "Electron entry until it moves" }];
  assert.deepEqual(inventoryFailures({ files: ["src/main/index.ts"], areas: AREAS }, { excluded }), [
    "excluded main.ts is not on disk. Remove the stale entry.",
  ]);
});

test("an exclusion is an exact path, never a prefix or basename: excluding main.ts covers no other main.ts", () => {
  const excluded = [{ file: "main.ts", why: "root entry" }];
  const failures = inventoryFailures({ files: ["main.ts", "src/renderer/main.ts.tsx", "lib/main.ts"], areas: [RENDERER_AREA] }, { excluded });
  assert.deepEqual(failures, [
    "src/renderer/main.ts.tsx is in no coverage area and not on the excluded list. Add it to an area, or exclude it with a why.",
    "lib/main.ts is in no coverage area and not on the excluded list. Add it to an area, or exclude it with a why.",
  ]);
});

test("a mixed batch reports every problem, not just the first", () => {
  const excluded = [{ file: "gone.ts", why: "" }];
  const failures = inventoryFailures({ files: ["src/a.ts", "stray.js", "src/renderer/V.jsx"], areas: AREAS }, { excluded });
  assert.equal(failures.length, 4, failures.join("\n"));
  assert.ok(failures.some((f) => f.startsWith('excluded gone.ts has no "why"')));
  assert.ok(failures.some((f) => f.startsWith("excluded gone.ts is not on disk")));
  assert.ok(failures.some((f) => f.startsWith("stray.js is in no coverage area")));
  assert.ok(failures.some((f) => f.startsWith("src/renderer/V.jsx is in no coverage area")));
});

// --- per-file branch floor -----------------------------------------------------------------------
// An area total can sit at 94% while one file in it is at 40%. These pin that each file is judged on
// its own, that a debt entry is enforced from the moment it is written, and that the unenforced
// policy floor still names every file under it with its number.

const branches = (brh: number, brf: number): LcovCounters => ({ lf: 10, lh: 10, brf, brh, fnf: 1, fnh: 1 });
const policy = (over: Partial<PerFileBranchPolicy> = {}): PerFileBranchPolicy => ({ floor: 80, enforced: true, ...over });

test("an enforced floor fails a file under it even when the area total would hide it", () => {
  // 1 + 9 of 2 + 10 branches = 83% for the pair; the small file alone is at 50%.
  const records = cov([["src/big.ts", branches(9, 10)], ["src/small.ts", branches(1, 2)]]);
  const result = evaluatePerFileBranch({ files: ["src/big.ts", "src/small.ts"], coverage: records, policy: policy() });
  assert.deepEqual(result.failures, ["src/small.ts branch 50.00% < per-file floor 80%"]);
  assert.deepEqual(result.below, [{ file: "src/small.ts", branch: 50, floor: 80, fromDebt: false }]);
});

test("a file exactly at the floor passes", () => {
  const result = evaluatePerFileBranch({ files: ["src/a.ts"], coverage: cov([["src/a.ts", branches(4, 5)]]), policy: policy() });
  assert.deepEqual(result.failures, []);
  assert.deepEqual(result.below, []);
});

test("an unenforced floor names every file under it with its number, and fails nothing", () => {
  const records = cov([["src/a.ts", branches(1, 4)], ["src/b.ts", branches(3, 5)], ["src/ok.ts", branches(5, 5)]]);
  const result = evaluatePerFileBranch({ files: ["src/b.ts", "src/a.ts", "src/ok.ts"], coverage: records, policy: policy({ enforced: false }) });
  assert.deepEqual(result.failures, []);
  assert.deepEqual(result.below.map((b) => [b.file, b.branch]), [["src/a.ts", 25], ["src/b.ts", 60]], "lowest first");
});

test("a debt floor is enforced even while the policy floor is not", () => {
  const records = cov([["src/a.ts", branches(1, 4)]]);
  const result = evaluatePerFileBranch({ files: ["src/a.ts"], coverage: records, policy: policy({ enforced: false, debt: { "src/a.ts": 40 } }) });
  assert.deepEqual(result.failures, ["src/a.ts branch 25.00% < per-file floor 40%"]);
  assert.deepEqual(result.below, [{ file: "src/a.ts", branch: 25, floor: 40, fromDebt: true }]);
});

test("a file at its debt floor passes, though it is still under the policy floor", () => {
  const records = cov([["src/a.ts", branches(2, 4)]]);
  const result = evaluatePerFileBranch({ files: ["src/a.ts"], coverage: records, policy: policy({ debt: { "src/a.ts": 50 } }) });
  assert.deepEqual(result.failures, []);
  assert.deepEqual(result.repaid, []);
});

test("a debt file that reached the policy floor is reported repaid, so the debt list shrinks", () => {
  const records = cov([["src/a.ts", branches(4, 5)]]);
  const result = evaluatePerFileBranch({ files: ["src/a.ts"], coverage: records, policy: policy({ debt: { "src/a.ts": 50 } }) });
  assert.deepEqual(result.repaid, ["src/a.ts"]);
  assert.deepEqual(result.failures, [], "repaying is a prompt, not a failure");
});

test("a debt entry for a file with no coverage record fails as stale", () => {
  const result = evaluatePerFileBranch({ files: [], coverage: cov([]), policy: policy({ debt: { "src/renamed.ts": 30 } }) });
  assert.deepEqual(result.failures, ["per-file debt names src/renamed.ts, which has no coverage record. Remove the stale entry."]);
  assert.deepEqual(result.repaid, []);
});

test("a file with no lcov record is left to the area's unmeasured check, and a branchless file reads 100%", () => {
  const records = cov([["src/flat.ts", branches(0, 0)]]);
  const result = evaluatePerFileBranch({ files: ["src/flat.ts", "src/untested.ts"], coverage: records, policy: policy({ floor: 100 }) });
  assert.deepEqual(result.failures, []);
  assert.deepEqual(result.below, []);
});

test("a file scanned by the areas twice is judged once", () => {
  const records = cov([["src/a.ts", branches(1, 2)]]);
  const result = evaluatePerFileBranch({ files: ["src/a.ts", "src/a.ts"], coverage: records, policy: policy() });
  assert.equal(result.failures.length, 1);
  assert.equal(result.below.length, 1);
});

test("files tied on branch % are listed by name", () => {
  const records = cov([["src/z.ts", branches(1, 2)], ["src/a.ts", branches(1, 2)]]);
  const result = evaluatePerFileBranch({ files: ["src/z.ts", "src/a.ts"], coverage: records, policy: policy({ enforced: false }) });
  assert.deepEqual(result.below.map((b) => b.file), ["src/a.ts", "src/z.ts"]);
});

test("the per-file report says when the floor is not enforced and lists each file with its number", () => {
  const records = cov([["src/a.ts", branches(1, 4)], ["src/d.ts", branches(1, 4)], ["src/r.ts", branches(5, 5)]]);
  const p = policy({ enforced: false, debt: { "src/d.ts": 30, "src/r.ts": 10 } });
  const text = formatPerFileBranch({ result: evaluatePerFileBranch({ files: ["src/a.ts", "src/d.ts", "src/r.ts"], coverage: records, policy: p }), policy: p });
  assert.match(text, /^ {2}FAIL {2}per-file branch floor 80% — NOT ENFORCED yet, see coverage-floors\.json perFileBranch\._todo/);
  assert.match(text, /under floor \(2\):/);
  assert.match(text, / 25\.00% {2}src\/a\.ts\n/);
  assert.match(text, / 25\.00% {2}src\/d\.ts \(debt floor 30%\)/);
  assert.match(text, /REPAID, remove from debt: src\/r\.ts/);
  assert.match(text, /! src\/d\.ts branch 25\.00% < per-file floor 30%/);
});

test("a clean enforced per-file report is one OK line", () => {
  const p = policy();
  const text = formatPerFileBranch({ result: evaluatePerFileBranch({ files: ["src/a.ts"], coverage: cov([["src/a.ts", perfect]]), policy: p }), policy: p });
  assert.equal(text, "  OK    per-file branch floor 80%");
});

// Shaped on the real shared-sites.ts record from cloud/desktop-coverage-1102: node's own image
// first, then a Playwright-babel image of the same file appended at shifted lines, never called.
const SHARED_SITES_SOURCE = [
  'import path from "node:path";',
  "",
  "export function createSitesWorkspace(dir: string) {",
  "  return { dir, roots: () => [dir] };",
  "}",
  "// a comment the babel image's offsets land on",
  "export function desktopSourceRoots() {",
  "  return [];",
  "}",
];
const DOUBLE_IMAGE_RECORD = [
  "SF:src/shared-sites.ts",
  "FN:3,createSitesWorkspace",
  "FN:7,desktopSourceRoots",
  "FN:1,anonymous_13",
  "FN:2,createSitesWorkspace",
  "FN:6,desktopSourceRoots",
  "FN:4,roots",
  "FNDA:194,createSitesWorkspace",
  "FNDA:198,desktopSourceRoots",
  "FNDA:1,anonymous_13",
  "FNDA:0,createSitesWorkspace",
  "FNDA:0,desktopSourceRoots",
  "FNDA:49,roots",
  "FNF:6",
  "FNH:4",
].join("\n");

test("a second image of the same file is named by every function it re-lists at a line that does not declare it", () => {
  assert.deepEqual(foreignImageFunctions(DOUBLE_IMAGE_RECORD, SHARED_SITES_SOURCE), ["createSitesWorkspace", "desktopSourceRoots"]);
});

test("a single image is clean, even with a function whose start line does not spell its name", () => {
  const single = "SF:src/shared-sites.ts\nFN:3,createSitesWorkspace\nFN:7,desktopSourceRoots\nFN:5,roots\nFNF:3\nFNH:3";
  assert.deepEqual(foreignImageFunctions(single, SHARED_SITES_SOURCE), []);
});

test("two real closures that share a name, each on its own declaring line, are not a second image", () => {
  const source = ["const a = { cut: () => 1 };", "const b = { cut: () => 2 };"];
  assert.deepEqual(foreignImageFunctions("SF:src/menu.ts\nFN:1,cut\nFN:2,cut\nFNDA:1,cut\nFNDA:0,cut", source), []);
});

test("a duplicated name pointing past the end of the file is foreign; anonymous wrappers never are", () => {
  const record = "SF:src/x.ts\nFN:1,anonymous_1\nFN:9,anonymous_1\nFN:3,createSitesWorkspace\nFN:40,createSitesWorkspace";
  assert.deepEqual(foreignImageFunctions(record, SHARED_SITES_SOURCE), ["createSitesWorkspace"]);
});
