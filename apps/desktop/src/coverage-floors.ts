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

/** The six lcov counters for one file, or summed over several: lines, branches and functions, each
 *  as found and hit. */
export interface LcovCounters {
  lf: number;
  lh: number;
  brf: number;
  brh: number;
  fnf: number;
  fnh: number;
}

/** The three axes an area can set a floor on. */
export type CoverageAxis = "line" | "branch" | "funcs";

/** One entry of `coverage-floors.json`'s `areas`, as far as this file reads it. `dirs`,
 *  `excludeDirs` and `extensions` are read by `scripts/check-coverage.ts` to build `onDisk`. */
export interface CoverageArea {
  id: string;
  dirs?: readonly string[];
  excludeDirs?: readonly string[];
  extensions?: readonly string[];
  floors?: Partial<Record<CoverageAxis, number>>;
  knownUnmeasured?: readonly string[];
  minFilesOnDisk?: number;
}

/** The runner and globs of one `node --test` invocation. */
export interface RunnerGlobs {
  nodeArgs: readonly string[];
  globs: readonly string[];
}

/** One test pass `scripts/check-coverage.ts` runs; `id` names its lcov file. */
export interface TestPass extends RunnerGlobs {
  id: string;
}

/** {@link evaluateArea}'s result. `failures` empty means the area passes. */
export interface AreaResult {
  id: string;
  actual: Record<CoverageAxis, number>;
  measuredCount: number;
  onDiskCount: number;
  unmeasured: string[];
  newlyUnmeasured: string[];
  recovered: string[];
  failures: string[];
}

/** `pct(0, 0)` is 100: a file with no branches is fully branch-covered. Correct per file, and
 *  dangerous per area — which is why {@link evaluateArea} never relies on it to decide whether an
 *  area was measured at all.
 *  @complexity O(1). */
export function pct(hit: number, found: number): number {
  return found === 0 ? 100 : (hit / found) * 100;
}

/** Test files and type-declaration files are not production source and never count toward a floor.
 *  @complexity O(1). */
export function isMeasurableSource(relPath: string): boolean {
  if (/\.(test|spec)\.(js|cjs|mjs|ts|tsx|mts)$/.test(relPath)) return false;
  if (relPath.endsWith(".d.ts")) return false;
  return true;
}

/** Whether `relPath` is one of `excludeDirs` or lies anywhere beneath one. Anchored at the start and
 *  matched on a whole directory segment, so `src/renderer` excludes `src/renderer/x.ts` but never
 *  `src/renderer-foo/x.js`: a bare `startsWith` would move a main-process file out of its area with
 *  no failure. Both sides are desktop-root-relative and `/`-separated; a trailing `/` on a
 *  configured directory is ignored.
 *  @complexity O(d) in excluded directories. */
export function isInExcludedDir(relPath: string, excludeDirs: readonly string[] = []): boolean {
  return excludeDirs.some((dir) => {
    const base = dir.replace(/\/+$/, "");
    return relPath === base || relPath.startsWith(`${base}/`);
  });
}

/**
 * The test passes `scripts/check-coverage.ts` runs, split by DIRECTORY. Probe P4 (2026-09-12,
 * `ADS-memory/.local-artifacts/desktop-ts/phase0-probes.md`): after a `.js`-to-`.ts` rename, bare
 * node reproduces the file's lcov image exactly, but tsx does not. esbuild's `__name` helper adds a
 * fake function and branch per file and lands hits on the wrong lines. So every main-process test,
 * `.js` or `.ts`, runs on bare node. Only the renderer and contracts `.test.ts` files, whose `.js`
 * specifiers need bundler resolution, run under tsx. `package.json`'s `test` script carries the
 * same split, and `coverage-runner-split.test.ts` fails when the two disagree.
 *
 * Several of these globs match nothing today. Measured on node 24.2.0: a glob that matches nothing
 * exits 0 reporting "tests 0", with no error. Only a literal path errors. So `check-coverage.ts`'s
 * `runSuite` refuses to run a pass whose globs match no test file at all.
 */
export const TEST_PASSES: readonly TestPass[] = [
  { id: "node", nodeArgs: [], globs: ["src/*.test.ts", "src/!(renderer|contracts)/**/*.test.ts"] },
  { id: "tsx", nodeArgs: ["--import", "tsx"], globs: ["src/renderer/**/*.test.ts", "src/contracts/**/*.test.ts"] },
];

/** Splits an npm script of `&&`-chained `node [args] --test <globs>` commands into
 *  `{ nodeArgs, globs }` passes, with double quotes stripped. Every token after `--test` counts as a
 *  glob, so a flag placed there shows up as drift rather than being skipped. Any other command
 *  throws, so a script this cannot read fails loudly instead of comparing as zero globs.
 *  @complexity O(n) in script length. */
export function parseNodeTestScript(script: string): RunnerGlobs[] {
  return script.split("&&").map((command) => {
    // `!`: the regex's two alternatives are its two groups, so one of them captured.
    const tokens = [...command.matchAll(/"([^"]*)"|(\S+)/g)].map((match) => match[1] ?? match[2]!);
    const testAt = tokens.indexOf("--test");
    if (tokens[0] !== "node" || testAt < 0) {
      throw new Error(`not a "node [args] --test <globs>" command: ${command.trim()}`);
    }
    return { nodeArgs: tokens.slice(1, testAt), globs: tokens.slice(testAt + 1) };
  });
}

/** `Map<runner, Set<glob>>`, where the runner is the node command a pass uses: `node`, or
 *  `node --import tsx`. Passes on the same runner merge.
 *  @complexity O(g) in globs. */
function globsByRunner(passes: readonly RunnerGlobs[]): Map<string, Set<string>> {
  const byRunner = new Map<string, Set<string>>();
  for (const pass of passes) {
    const runner = ["node", ...pass.nodeArgs].join(" ");
    const globs = byRunner.get(runner) ?? new Set();
    for (const glob of pass.globs) globs.add(glob);
    byRunner.set(runner, globs);
  }
  return byRunner;
}

/** Each `{ runner, glob }` that `side` runs and `other` does not run on that same runner.
 *  @complexity O(g) in globs. */
function unmatchedGlobs(
  side: ReadonlyMap<string, ReadonlySet<string>>,
  other: ReadonlyMap<string, ReadonlySet<string>>
): { runner: string; glob: string }[] {
  const unmatched: { runner: string; glob: string }[] = [];
  for (const [runner, globs] of side) {
    for (const glob of globs) if (!other.get(runner)?.has(glob)) unmatched.push({ runner, glob });
  }
  return unmatched;
}

/** Every glob that `TEST_PASSES` and `package.json`'s parsed `test` script disagree on, one message
 *  per glob per side; empty when they agree. Globs are compared per runner as literal strings: order
 *  is ignored, a glob moved between runners is reported on both, and two spellings of one pattern
 *  count as drift.
 *  @complexity O(g) in globs. */
export function runnerSplitDrift(passes: readonly RunnerGlobs[], scriptPasses: readonly RunnerGlobs[]): string[] {
  const inPasses = globsByRunner(passes);
  const inScript = globsByRunner(scriptPasses);
  return [
    ...unmatchedGlobs(inScript, inPasses).map(
      ({ runner, glob }) => `package.json runs ${glob} under "${runner}"; TEST_PASSES does not`
    ),
    ...unmatchedGlobs(inPasses, inScript).map(
      ({ runner, glob }) => `TEST_PASSES runs ${glob} under "${runner}"; package.json does not`
    ),
  ];
}

/** Sums the six lcov counters across a set of file records.
 *  @complexity O(n). */
function total(records: readonly LcovCounters[]): LcovCounters {
  const sum = { lf: 0, lh: 0, brf: 0, brh: 0, fnf: 0, fnh: 0 };
  for (const r of records) {
    sum.lf += r.lf;
    sum.lh += r.lh;
    sum.brf += r.brf;
    sum.brh += r.brh;
    sum.fnf += r.fnf;
    sum.fnh += r.fnh;
  }
  return sum;
}

/**
 * Which declared floors this area misses. Only the axes the area actually configures are checked:
 * an axis with no floor is still reported, but never fails.
 *
 * @complexity O(1).
 */
function floorFailures(
  area: CoverageArea,
  measured: LcovCounters
): { actual: Record<CoverageAxis, number>; failures: string[] } {
  const actual = {
    line: pct(measured.lh, measured.lf),
    branch: pct(measured.brh, measured.brf),
    funcs: pct(measured.fnh, measured.fnf),
  };
  const failures: string[] = [];
  for (const axis of ["line", "branch", "funcs"] as const) {
    const floor = area.floors?.[axis];
    if (typeof floor === "number" && actual[axis] < floor) {
      failures.push(`${axis} ${actual[axis].toFixed(2)}% < floor ${floor}%`);
    }
  }
  return { actual, failures };
}

/**
 * Evaluate one configured area.
 *
 * @param area `{ id, floors?, knownUnmeasured?, minFilesOnDisk? }`.
 * @param onDisk repo-relative paths of this area's production files, as found on the filesystem.
 * @param coverage `Map<relPath, {lf,lh,brf,brh,fnf,fnh}>` from the lcov.
 * @returns `{ id, actual, measuredCount, unmeasured, newlyUnmeasured, recovered, failures }`.
 *   `failures` empty means the area passes.
 * @complexity O(n) in the area's files.
 */
export function evaluateArea(
  area: CoverageArea,
  onDisk: readonly string[],
  coverage: ReadonlyMap<string, LcovCounters>
): AreaResult {
  const known = new Set(area.knownUnmeasured ?? []);
  const measuredPaths = onDisk.filter((p) => coverage.has(p));
  const unmeasured = onDisk.filter((p) => !coverage.has(p));

  // `!`: `measuredPaths` holds only paths `coverage` has.
  const measured = total(measuredPaths.map((p) => coverage.get(p)!));
  const { actual, failures } = floorFailures(area, measured);

  // A file with no coverage record that nobody declared. This is the check the percentages cannot
  // make, and the reason this function takes `onDisk` at all.
  const newlyUnmeasured = unmeasured.filter((p) => !known.has(p));
  if (newlyUnmeasured.length > 0) {
    failures.push(
      `${newlyUnmeasured.length} file(s) have NO coverage record and are not in knownUnmeasured: ` +
        `${newlyUnmeasured.join(", ")}. Add a test, or grandfather them explicitly with a reason.`
    );
  }

  // Zero files on disk is never a legitimate pass — it means a directory was renamed or a glob went
  // stale, which is precisely how four scopes in `check-src-complexity-drift.ts` went quiet.
  const minOnDisk = area.minFilesOnDisk ?? 1;
  if (onDisk.length < minOnDisk) {
    failures.push(
      `only ${onDisk.length} file(s) found on disk, expected at least ${minOnDisk}. ` +
        `The glob is stale (directory renamed?) or the scan is broken — this is NOT a pass.`
    );
  }

  // A declared gap that now HAS coverage: good news, but the list must shrink or it rots into a
  // permanent exemption nobody revisits.
  const recovered = [...known].filter((p) => coverage.has(p));

  return {
    id: area.id,
    actual,
    measuredCount: measuredPaths.length,
    onDiskCount: onDisk.length,
    unmeasured,
    newlyUnmeasured,
    recovered,
    failures,
  };
}

/** One area's result, rendered. The unmeasured files are named on EVERY run — a gap nobody is told
 *  about is the trap; a gap printed every run is a decision.
 *  @complexity O(n). */
export function formatArea(result: AreaResult, area: CoverageArea): string {
  const lines = [`  ${result.failures.length === 0 ? "OK  " : "FAIL"}  ${result.id}`];
  const floors: Partial<Record<CoverageAxis, number>> = area.floors ?? {};
  for (const axis of ["line", "branch", "funcs"] as const) {
    const floor = floors[axis];
    const shown = `${result.actual[axis].toFixed(2)}%`;
    lines.push(`          ${axis.padEnd(6)} ${shown.padStart(7)}  ${typeof floor === "number" ? `(floor ${floor}%)` : "(no floor — see coverage-floors.json)"}`);
  }
  lines.push(`          files:  ${result.measuredCount} measured of ${result.onDiskCount} on disk`);
  if (result.unmeasured.length > 0) {
    lines.push(`          UNMEASURED (${result.unmeasured.length}, known gap — no test loads these):`);
    for (const p of result.unmeasured) lines.push(`            - ${p}`);
  }
  if (result.recovered.length > 0) {
    lines.push(`          NOW COVERED, remove from knownUnmeasured: ${result.recovered.join(", ")}`);
  }
  for (const f of result.failures) lines.push(`          ! ${f}`);
  return lines.join("\n");
}
