import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  applyBaseline,
  checkCoverageIntegrity,
  classifyBlock,
  isPureReExportBarrelSource,
  parseBaseline,
  type LcovBlock,
} from "@jini-ai/devops/checks/coverage";
import { isFirstPartySourcePath } from "../check-coverage-integrity.js";

const REPO_ROOT = path.join(import.meta.dirname, "..", "..", "..");
const isFirstParty = ({ file }: { file: string }) => isFirstPartySourcePath(file);

test("SEVERE requires at least 30 DA records and every hit count to match the wrapper", () => {
  for (const [da, severe] of [
    [Array(29).fill(7), false],
    [Array(30).fill(7), true],
    [[...Array(29).fill(7), 99], false],
  ] as const) {
    const verdict = classifyBlock({ block: { file: "src/floor-fixture.ts", fnda: [{ name: "__toCommonJS", hits: 7 }], da }, repoRoot: REPO_ROOT, isFirstParty });
    assert.equal(verdict.status, "contaminated");
    assert.equal(verdict.severe, severe, JSON.stringify(da));
  }
});

test("CLI gates severe/new contamination and captures a usable exact baseline", (t) => {
  const scratch = mkdtempSync(path.join(tmpdir(), "coverage-integrity-cli-"));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  const lcov = path.join(scratch, "fixture.lcov");
  const baseline = path.join(scratch, "baseline.json");
  const run = (...extra: string[]) => spawnSync(process.execPath, [
    "--import", "tsx", path.join(REPO_ROOT, "development/scripts/check-coverage-integrity.ts"),
    lcov, "--baseline", baseline, ...extra,
  ], { cwd: REPO_ROOT, encoding: "utf8" });
  const writeLcov = (lines: number) => writeFileSync(lcov,
    `SF:src/cli-contamination-fixture.ts\nFNDA:7,__toCommonJS\n` +
    Array.from({ length: lines }, (_, i) => `DA:${i + 1},7`).join("\n") + "\nend_of_record\n");
  writeFileSync(baseline, JSON.stringify({ _comment: ["fixture"], knownContaminated: ["src/cli-contamination-fixture.ts"] }));
  writeLcov(30);
  const severe = run();
  assert.equal(severe.status, 1, severe.stderr);
  assert.match(severe.stderr, /1 SEVERE/);
  writeLcov(29);
  const known = run();
  assert.equal(known.status, 0, known.stderr);
  assert.match(known.stderr, /0 NEW, 1 known/);
  writeFileSync(baseline, JSON.stringify({ _comment: ["fixture"], knownContaminated: [] }));
  const added = run();
  assert.equal(added.status, 1, added.stderr);
  assert.match(added.stderr, /1 NEW/);
  const captured = run("--update-baseline");
  assert.equal(captured.status, 0, captured.stderr);
  assert.deepEqual(JSON.parse(readFileSync(baseline, "utf8")), {
    _comment: ["fixture"], knownContaminated: ["src/cli-contamination-fixture.ts"],
  });
  assert.equal(run().status, 0);
});
function readRealSource(repoRelativeFile: string): string {
  // 168d8c276 moved the live exporter to features/site-export. Keep the frozen LCOV's
  // historical SF path and provenance intact while resolving its corresponding live source.
  const currentFile = repoRelativeFile.replace("apps/website/src/platform/export/", "apps/website/src/features/site-export/");
  return readFileSync(path.join(REPO_ROOT, currentFile), "utf8");
}

/**
 * @file Direct coverage for `development/scripts/check-coverage-integrity.ts`.
 *
 * The real-data cases below are the REVISED acceptance criterion from the 2026-08-21 dispatch, after
 * the team lead's correction: all six real runs (`clean-run{1,2,4,5,6}-*` and `corrupt-run3-*`) show
 * CONTAMINATED for `src/media/provider-credential-store.ts` -- per
 * `ADS-memory/reports/2026-08-21-coverage-dual-instantiation-root-cause.md` (rounds 7/9 for the true
 * clean baseline `FNF:20 FNH:20`, rounds 8/11/12 for the counterexample proving `LH:`/`LF:` alone
 * cannot detect this), every one of those fixtures actually reports `FNF:43 FNH:29` -- contaminated,
 * not clean, regardless of what its `LH:`/`LF:` say. Only run 3 is additionally SEVERE (the wrapper
 * image also won the DA line-hit merge). The fixture file NAMES still say "clean-run1" etc. -- kept
 * as-is because they are literally the same bytes originally copied from the team lead's `run1.lcov`
 * (real, not invented) and renaming them would misrepresent provenance; their CONTENT is what
 * changed meaning, not the files themselves. `warn-run5-embeds-marker` is a second real, DIFFERENT
 * file from the same run5 -- CONTAMINATED but not SEVERE, a genuine partial-match case found by
 * scanning the full real lcov corpus, not invented.
 */

const FIXTURES_DIR = path.join(import.meta.dirname, "fixtures", "coverage-integrity");

function readFixture(name: string): string {
  return readFileSync(path.join(FIXTURES_DIR, name), "utf8");
}

// ---------------------------------------------------------------------------------------------
// Real-data acceptance criterion: all 6 runs report CONTAMINATED; run 3 additionally SEVERE.
// ---------------------------------------------------------------------------------------------

test("classifyBlock: apps/admin/dist (build output, not apps/*/src/) is skipped -- the glob is src only", () => {
  const block: LcovBlock = { file: "apps/admin/dist/index.js", fnda: [], da: [] };
  assert.equal(classifyBlock({ block, repoRoot: REPO_ROOT, isFirstParty }).status, "skip");
});

test("isFirstPartySourcePath: true for src/**, packages/*/src/**, apps/*/src/**", () => {
  assert.equal(isFirstPartySourcePath("src/media/provider-credential-store.ts"), true);
  assert.equal(isFirstPartySourcePath("packages/jini-admin/src/index.ts"), true);
  assert.equal(isFirstPartySourcePath("apps/admin/src/main.tsx"), true);
});

test("isFirstPartySourcePath: false for node_modules, dist output, and development/ tooling", () => {
  assert.equal(isFirstPartySourcePath("node_modules/esbuild/lib/main.js"), false);
  assert.equal(isFirstPartySourcePath("apps/admin/dist/index.js"), false);
  assert.equal(isFirstPartySourcePath("development/scripts/check-architecture.ts"), false);
  assert.equal(isFirstPartySourcePath("packages/jini-admin/dist/index.js"), false);
});

// ---------------------------------------------------------------------------------------------
// CONTAMINATED has no size floor: wrapper-name presence alone is the whole signal, at any block


// ---------------------------------------------------------------------------------------------
// Pure re-export barrels (2026-09-05): a file whose source is entirely `export ... from "...";`
// statements is `skip`, never `contaminated` or `ok` -- see this file's header ("Pure re-export
// barrels are also skipped") for why wrapper-name presence there is structurally guaranteed and
// carries no contamination signal. Real, not invented: both source files below and their fixture
// lcov blocks (`fixtures/coverage-integrity/real-*-barrel.lcov.info`) were captured 2026-09-05 from
// this repo's actual `apps/website/src/platform/export/index.ts` and
// `apps/website/src/features/content-types/index.ts`, and both were independently verified
// CONTAMINATED (the second one additionally SEVERE) by a live `check-coverage-integrity.ts` run
// against a real `npm run test:cov` lcov before this exclusion existed.
// ---------------------------------------------------------------------------------------------

test("isPureReExportBarrelSource: true for the real platform/export/index.ts barrel (mixed export/export-type-from, multi-line named list)", () => {
  assert.equal(isPureReExportBarrelSource({ sourceText: readRealSource("apps/website/src/platform/export/index.ts") }), true);
});

test("isPureReExportBarrelSource: true for the real features/content-types/index.ts barrel (re-exports from an npm package, JSDoc header with braces)", () => {
  assert.equal(isPureReExportBarrelSource({ sourceText: readRealSource("apps/website/src/features/content-types/index.ts") }), true);
});

test("isPureReExportBarrelSource: false for a real logic-bearing file in the same directory as a barrel", () => {
  // route-manifest.ts sits right next to index.ts in platform/export/ and is what the barrel
  // re-exports from -- it has real function bodies and must never be classified as a barrel itself.
  assert.equal(
    isPureReExportBarrelSource({ sourceText: readRealSource("apps/website/src/platform/export/route-manifest.ts") }),
    false
  );
});

test("real committed baseline: development/scripts/coverage-integrity-baseline.json is valid and baselines run1 (its own source) away entirely", () => {
  const baselineJson = readFileSync(
    path.join(import.meta.dirname, "..", "coverage-integrity-baseline.json"),
    "utf8"
  );
  const baselineSet = parseBaseline({ baselineJson });
  assert.ok(baselineSet.size > 0, "the committed baseline must not be empty");

  const { contaminated } = checkCoverageIntegrity({ lcovText: readFixture("clean-run1-provider-credential-store.lcov.info"), repoRoot: REPO_ROOT, isFirstParty });
  const gated = applyBaseline({ contaminated, baselineSet });
  assert.deepEqual(
    gated.map((v) => v.fails),
    [false],
    "run1 is the baseline's own capture source -- every path it reports must already be known"
  );
});
