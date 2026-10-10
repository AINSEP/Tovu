/**
 * @file Per-area coverage floors for `apps/desktop`, as pure functions, plus the test passes that
 * produce the lcov. `scripts/check-coverage.ts` runs those passes and calls these functions.
 *
 * ## The trap this is shaped around: a coverage percentage cannot see its own scope shrinking
 *
 * Node's `--test-coverage-include` FILTERS WHAT WAS LOADED. It does not force files in. A source
 * file that no test ever imports simply does not appear in the lcov at all — so it leaves the
 * denominator, and **the percentage goes UP**. A floor that reads only percentages is structurally
 * blind to the one regression that matters most: code arriving with no test at all.
 *
 * This is not hypothetical. The 2026-09-12 survey that produced this harness reported the desktop
 * `.ts` area at "80.78% line over 9 files", when the area held 18 non-test TypeScript files that
 * day (27 today, close-out — renderer+contracts has grown since). Ten had no lcov record, the
 * reported number described eight of them, and the missing half had pushed the percentage UP
 * rather than down. The survey's own author wrote that trap down as item 2 of a trap list and was
 * caught by it in the same session. That is how quiet this failure is.
 *
 * The same shape had already eaten a real gate elsewhere in this repo:
 * `check-src-complexity-drift.ts` scans nine directories, four of which no longer exist after a
 * restructure, and `--no-error-on-unmatched-pattern` turns that into silence.
 *
 * ## So the denominator is DISK, never lcov
 *
 * {@link evaluateArea} takes the files found on disk and the coverage records separately. Anything
 * on disk with no coverage record is UNMEASURED, and an unmeasured file that is not on the area's
 * declared `knownUnmeasured` list fails the gate by name. Percentages are computed over what was
 * actually measured; the unmeasured set is reported alongside, every run, so a gap is a listed,
 * bounded, dated fact rather than an absence.
 *
 * ## Areas are cut by ROLE, not by file extension
 *
 * An area's `dirs` scan recurses, so `dirs: ["src"]` alone would sweep the renderer into the
 * main-process floors. `excludeDirs` ({@link isInExcludedDir}) carves those trees back out. The cut
 * is by role on purpose: while areas were cut by extension, the planned `.js`-to-`.ts` rename would
 * have moved every main-process file out of its own floors and into the renderer's lower ones.
 *
 * ## Why `knownUnmeasured` is a ratchet and not a red gate
 *
 * Some desktop source files genuinely have no test today, and each area's `knownUnmeasured` list
 * names them. A gate that is red from birth gets `enabled: false` within a week, which is the
 * noise-then-ignore cycle this whole harness exists to avoid. So existing gaps are grandfathered BY
 * NAME, printed on every run, and cannot grow: an unmeasured file missing from that list fails. Same
 * mechanic as this repo's complexity debt lists — debt is allowed, invisible debt is not.
 *
 * ## Node's line% is not comparable to anyone else's
 *
 * Node's lcov sets `LF` to EVERY line in the file, comments and blanks included (verified:
 * `keyed-serializer.ts` LF:51 / `wc -l` 51; `App.hooks.ts` 1272/1272). This codebase is unusually
 * comment-dense, so these line percentages read HIGHER than a statement-based tool's and must never
 * be compared with a c8, vitest or istanbul number — including `apps/admin`'s vitest coverage.
 */

import * as coverage from "@jini-ai/devops/checks/coverage";
export type { LcovCounters, CoverageAxis, CoverageArea, RunnerGlobs, TestPass } from "@jini-ai/devops/checks/coverage";
export type AreaResult = coverage.DiskAreaResult;
export const pct = (hit: number, found: number) => coverage.pct({ hit, found });
export const isMeasurableSource = (relPath: string) => coverage.isMeasurableSource({ file: relPath });
export const isInExcludedDir = (relPath: string, excludeDirs: readonly string[] = []) => coverage.isInExcludedDir({ file: relPath, excludeDirs });
export const parseNodeTestScript = (script: string) => coverage.parseNodeTestScript({ script });
export const runnerSplitDrift = (passes: readonly coverage.RunnerGlobs[], scriptPasses: readonly coverage.RunnerGlobs[]) => coverage.runnerSplitDrift({ passes, scriptPasses });
export const evaluateArea = (area: coverage.CoverageArea, onDisk: readonly string[], records: ReadonlyMap<string, coverage.LcovCounters>) => coverage.evaluateDiskArea({ area, onDisk, coverage: records });
export const formatArea = (result: AreaResult, area: coverage.CoverageArea) => coverage.formatDiskArea({ result, area }, { noFloorMessage: "(no floor — see coverage-floors.json)" });
/**
 * The test passes `scripts/check-coverage.ts` runs, split by DIRECTORY. Probe P4 (2026-09-12,
 * `ADS-memory/.local-artifacts/desktop-ts/phase0-probes.md`): after a `.js`-to-`.ts` rename, bare
 * node reproduces the file's lcov image exactly, but tsx does not. esbuild's `__name` helper adds a
 * fake function and branch per file and lands hits on the wrong lines. So every main-process test,
 * `.js` or `.ts`, runs on bare node. Only the renderer and contracts `.test.ts` files, whose `.js`
 * specifiers need bundler resolution, run under tsx. `package.json`'s `test` script carries the
 * same split, and `coverage-runner-split.test.ts` fails when the two disagree.
 * The node pass enables module mocks for both preload exposure/parity tests, just as `npm test`
 * does; enabling them only in the suite would leave the coverage gate unable to run those tests.
 *
 * Several of these globs match nothing today. Measured on node 24.2.0: a glob that matches nothing
 * exits 0 reporting "tests 0", with no error. Only a literal path errors. So `check-coverage.ts`'s
 * `runSuite` refuses to run a pass whose globs match no test file at all.
 */
export const TEST_PASSES: readonly coverage.TestPass[] = [
  { id: "node", nodeArgs: ["--experimental-test-module-mocks"], globs: ["src/*.test.ts", "src/!(renderer|contracts)/**/*.test.ts"] },
  { id: "tsx", nodeArgs: ["--import", "tsx"], globs: ["src/renderer/**/*.test.ts", "src/contracts/**/*.test.ts"] },
];
