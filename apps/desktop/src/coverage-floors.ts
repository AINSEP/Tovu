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
 * That is also why the per-file floor ({@link evaluatePerFileBranch}) is on BRANCH %, not line %:
 * a comment line inside a function that ran counts as a covered line, but never as a branch.
 *
 * ## Every source file is in exactly one area, or excluded by name with a reason
 *
 * The disk denominator only protects files that some area scans. Until 2026-11-02 the Electron
 * entry (`main.ts`, 2,040 lines), the ten renderer `.tsx` components and `preload.mts` sat outside
 * every area: their extension or directory matched none, so they could never fail a floor and were
 * only PRINTED as "not measured". {@link inventoryFailures} closes that: every production source
 * file under {@link INVENTORY_DIRS} (and directly in the desktop root, where the entry used to live)
 * must belong to exactly one area or appear on the config's `excluded` list with a `why`. An
 * unlisted file FAILS the gate by name; a printed note is the trap this whole module is about.
 * See ADS-memory/reports/2026-11-02-desktop-coverage-structure.md, section 2.
 *
 * ## Area totals hide files, so there is a per-file branch floor too
 *
 * An area floor is an aggregate: one big well-tested file can carry a badly tested one. The
 * per-file branch floor gates each measured file on its own. Files below it are grandfathered BY
 * NAME in `debt`, each at its own number, the same ratchet as `knownUnmeasured`.
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

/** Where the source inventory is walked (recursively), relative to the desktop root. The desktop
 *  root itself is scanned too, but only one level deep: that is where the Electron entry `main.ts`
 *  lived before it moved to `src/main/index.ts`, and a source file landing there again must not be
 *  invisible. `scripts/` is not here on purpose: its entries are CLI stubs whose logic lives in
 *  tested `src/` modules (e.g. this file for `check-coverage.ts`). */
export const INVENTORY_DIRS: readonly string[] = ["src", "bin"];

/** Every extension that can carry desktop source, JS family included, so a stray `.js` or `.cjs`
 *  fails the inventory instead of slipping past an area that only lists `.ts`. */
export const SOURCE_EXTENSIONS: readonly string[] = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];

/** Test and declaration files in every source extension. `isMeasurableSource` misses `.test.cts`,
 *  `.test.jsx` and `.d.mts`/`.d.cts`, which the inventory's wider extension list can now reach. */
const TEST_OR_DECLARATION = /\.(test|spec)\.[cm]?[jt]sx?$|\.d\.[cm]?ts$/;

/** Whether `file` is production source: a source extension, and not a test or declaration file.
 *  @complexity O(e) in extensions. */
export function isProductionSource({ file }: { file: string }): boolean {
  return SOURCE_EXTENSIONS.some((ext) => file.endsWith(ext)) && !TEST_OR_DECLARATION.test(file);
}

/** Whether `area` scans `file`: under one of its `dirs` (on a whole directory segment), not under
 *  one of its `excludeDirs`, and ending in one of its `extensions`. The same three rules
 *  `scripts/check-coverage.ts`'s disk walk applies when it builds an area's denominator.
 *  @complexity O(d + e) in directories and extensions. */
export function areaOwns({ area, file }: { area: coverage.CoverageArea; file: string }): boolean {
  if (!(area.extensions ?? []).some((ext) => file.endsWith(ext))) return false;
  // isInExcludedDir is a plain "is this path at or under one of these directories" test.
  return isInExcludedDir(file, area.dirs ?? []) && !isInExcludedDir(file, area.excludeDirs ?? []);
}

/** One `excluded` entry in `coverage-floors.json`: a source file deliberately outside every area. */
export interface ExcludedSource {
  file: string;
  why: string;
}

/** The failure for one file, or undefined when it is owned exactly once.
 *  @complexity O(1). */
function ownershipFailure({ file, owners, excluded }: { file: string; owners: readonly string[]; excluded: boolean }): string | undefined {
  if (excluded && owners.length > 0) return `${file} is in area ${owners.join(", ")} AND on the excluded list. It must be one or the other.`;
  if (excluded || owners.length === 1) return undefined;
  if (owners.length === 0) return `${file} is in no coverage area and not on the excluded list. Add it to an area, or exclude it with a why.`;
  return `${file} is in ${owners.length} areas (${owners.join(", ")}). Areas must not overlap, or its lines count twice.`;
}

/** Problems with the `excluded` list itself: an entry with no reason, or one naming a file that is
 *  not on disk. A stale entry is a hole that would silently swallow whatever lands at that path
 *  later, so it fails rather than being printed.
 *  @complexity O(x) in entries, with `onDisk` a set. */
function excludedListFailures({ excluded, onDisk }: { excluded: readonly ExcludedSource[]; onDisk: ReadonlySet<string> }): string[] {
  const failures: string[] = [];
  for (const entry of excluded) {
    if (typeof entry.why !== "string" || entry.why.trim() === "") failures.push(`excluded ${entry.file} has no "why". Every exclusion must say why it is outside every area.`);
    if (!onDisk.has(entry.file)) failures.push(`excluded ${entry.file} is not on disk. Remove the stale entry.`);
  }
  return failures;
}

/**
 * Every way the source inventory and the areas disagree: a file in no area and not excluded, a file
 * in two areas, a file both in an area and excluded, and a bad `excluded` entry. Empty when every
 * file is owned exactly once.
 * @param files every production source file found on disk, desktop-root-relative.
 * @complexity O(f × a) in files and areas.
 */
export function inventoryFailures(
  { files, areas }: { files: readonly string[]; areas: readonly coverage.CoverageArea[] },
  { excluded = [] }: { excluded?: readonly ExcludedSource[] } = {},
): string[] {
  const excludedFiles = new Set(excluded.map((entry) => entry.file));
  const failures = excludedListFailures({ excluded, onDisk: new Set(files) });
  for (const file of files) {
    const owners = areas.filter((area) => areaOwns({ area, file })).map((area) => area.id);
    const failure = ownershipFailure({ file, owners, excluded: excludedFiles.has(file) });
    if (failure) failures.push(failure);
  }
  return failures;
}

/** `coverage-floors.json`'s `perFileBranch`: the per-file branch floor, whether it is enforced yet,
 *  and the files grandfathered below it, each at its own floor. */
export interface PerFileBranchPolicy {
  floor: number;
  enforced: boolean;
  debt?: Readonly<Record<string, number>>;
}

export interface FileBranch {
  file: string;
  branch: number;
  floor: number;
  /** Whether `floor` came from the file's own `debt` entry rather than the policy floor. */
  fromDebt: boolean;
}

export interface PerFileBranchResult {
  /** Every measured file under the floor that applies to it, lowest branch % first. */
  below: FileBranch[];
  /** Debt entries whose file now meets the policy floor: the list must shrink. */
  repaid: string[];
  failures: string[];
}

type Records = ReadonlyMap<string, coverage.LcovCounters>;

/** The `debt` entries that name no measured file. A debt entry for a file that vanished, or lost its
 *  lcov record, would otherwise sit there as a standing exemption for whatever lands at that path.
 *  @complexity O(d) in debt entries. */
function staleDebt({ debt, records }: { debt: Readonly<Record<string, number>>; records: Records }): string[] {
  return Object.keys(debt)
    .filter((file) => !records.has(file))
    .map((file) => `per-file debt names ${file}, which has no coverage record. Remove the stale entry.`);
}

/** `file` as a one-element list when it is measured and under the floor that applies to it (its
 *  debt floor if it has one, else the policy floor), else an empty list.
 *  @complexity O(1). */
function underFloor({ file, records, policy }: { file: string; records: Records; policy: PerFileBranchPolicy }): FileBranch[] {
  const counters = records.get(file);
  if (!counters) return [];
  const branch = pct(counters.brh, counters.brf);
  const debtFloor = policy.debt?.[file];
  const floor = debtFloor ?? policy.floor;
  return branch < floor ? [{ file, branch, floor, fromDebt: debtFloor !== undefined }] : [];
}

/** Whether a debt entry's file is measured and now meets the policy floor.
 *  @complexity O(1). */
function isRepaid({ file, records, policy }: { file: string; records: Records; policy: PerFileBranchPolicy }): boolean {
  const counters = records.get(file);
  return counters !== undefined && pct(counters.brh, counters.brf) >= policy.floor;
}

/**
 * Gates each measured file's BRANCH % on its own. A file listed in `debt` must meet its listed
 * floor; every other file must meet `floor`. A debt floor is always enforced. The policy floor
 * fails only once `enforced` is true; until then a file under it is reported in `below`, with its
 * number, and does not fail.
 * @param files the area files to judge (the areas' disk scans). A file with no lcov record is
 *   skipped here, because the area's unmeasured check already judges it.
 * @complexity O(f log f) in files.
 */
export function evaluatePerFileBranch({ files, coverage: records, policy }: {
  files: readonly string[];
  coverage: Records;
  policy: PerFileBranchPolicy;
}): PerFileBranchResult {
  const debt = policy.debt ?? {};
  const below = [...new Set(files)]
    .flatMap((file) => underFloor({ file, records, policy }))
    .sort((a, b) => a.branch - b.branch || a.file.localeCompare(b.file));
  const failures = [
    ...staleDebt({ debt, records }),
    ...below
      .filter((entry) => entry.fromDebt || policy.enforced)
      .map((entry) => `${entry.file} branch ${entry.branch.toFixed(2)}% < per-file floor ${entry.floor}%`),
  ];
  const repaid = Object.keys(debt).filter((file) => isRepaid({ file, records, policy }));
  return { below, repaid, failures };
}

/** The per-file result, rendered. Every file under its floor is named with its number on every
 *  run, enforced or not: while the floor is not enforced, that list IS the data the calibration
 *  run copies into `debt`.
 *  @complexity O(n). */
export function formatPerFileBranch({ result, policy }: { result: PerFileBranchResult; policy: PerFileBranchPolicy }): string {
  const status = policy.enforced ? "" : " — NOT ENFORCED yet, see coverage-floors.json perFileBranch._todo";
  return [
    `  ${result.failures.length === 0 ? "OK  " : "FAIL"}  per-file branch floor ${policy.floor}%${status}`,
    ...(result.below.length > 0 ? [`          under floor (${result.below.length}):`] : []),
    ...result.below.map((b) => `            - ${`${b.branch.toFixed(2)}%`.padStart(7)}  ${b.file}${b.fromDebt ? ` (debt floor ${b.floor}%)` : ""}`),
    ...(result.repaid.length > 0 ? [`          REPAID, remove from debt: ${result.repaid.join(", ")}`] : []),
    ...result.failures.map((f) => `          ! ${f}`),
  ].join("\n");
}
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
 * It also loads `scripts/resolve-ts-ext.ts`, so a main test can import a contract or website module
 * whose own relative imports are written `.js`.
 *
 * The tsx pass also runs `src/renderer/**/*.test.tsx`: the `.tsx` components are counted in their
 * own area since 2026-11-02, and a component test written as `.tsx` must run in the suite and the
 * gate alike rather than in neither.
 *
 * Several of these globs match nothing today. Measured on node 24.2.0: a glob that matches nothing
 * exits 0 reporting "tests 0", with no error. Only a literal path errors. So `check-coverage.ts`'s
 * `runSuite` refuses to run a pass whose globs match no test file at all.
 */
export const TEST_PASSES: readonly coverage.TestPass[] = [
  { id: "node", nodeArgs: ["--experimental-test-module-mocks", "--import", "./scripts/resolve-ts-ext.ts"], globs: ["src/*.test.ts", "src/!(renderer|contracts)/**/*.test.ts"] },
  { id: "tsx", nodeArgs: ["--import", "tsx"], globs: ["src/renderer/**/*.test.ts", "src/renderer/**/*.test.tsx", "src/contracts/**/*.test.ts"] },
];
