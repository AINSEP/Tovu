#!/usr/bin/env node
/**
 * @file The desktop coverage gate. Runs the test suite under node's own coverage, then checks each
 * configured area in `coverage-floors.json` against its floors AND against the files actually
 * present on disk. The rules live in `../src/coverage-floors.ts` and are tested there.
 *
 * ## This gate runs the tests itself, on purpose
 *
 * `development/scripts/check-route-coverage-floor.ts` reads a previously-written `lcov.info` off
 * disk and does not run anything. Measured 2026-09-12: it reported `OK` at 98.54% line from an lcov
 * nine days old, having executed no tests that day. Its zero-file guard catches a MISSING lcov, not
 * a stale populated one. So this gate produces its own coverage every time; there is no path here
 * that reads a pre-existing artifact.
 *
 * ## `--test-coverage-include` is mandatory, not tidiness
 *
 * Without it, a plain coverage run here instruments 1445 files, almost all of them
 * `../../../Jini/packages/*​/dist/**` reached through symlinked `node_modules`. A floor over that
 * set measures Jini's build output and drifts with every Jini republish.
 *
 * But include patterns only FILTER WHAT WAS LOADED — they do not force files in. So the area
 * evaluation compares the lcov against a DISK scan, never against itself. See
 * `../src/coverage-floors.ts`'s header for the measurement in this very repo that the omission
 * corrupted.
 *
 * ## Runners and areas are both split by directory, never by extension
 *
 * Main-process tests run on bare node and only renderer and contracts tests run under tsx, because
 * tsx corrupts lcov counters (see `TEST_PASSES` in `../src/coverage-floors.ts`). The areas are cut
 * the same way, through `excludeDirs`. Renaming a main-process file from `.js` to `.ts` therefore
 * moves it between neither runners nor floors.
 *
 * ## Three verdicts on top of the suite's own
 *
 * 1. Area floors: each area's line/branch/funcs totals, over a disk-scanned denominator.
 * 2. Per-file branch floor: each measured area file's branch %, against `perFileBranch`.
 * 3. Source inventory: every production source file under `src/`, `bin/` and the desktop root
 *    belongs to exactly one area or is on the `excluded` list with a `why`. This is a disk check
 *    and runs even when the suite fails; it is the one that would have caught `main.ts`, the
 *    renderer `.tsx` and the preloads sitting outside every area.
 *
 * Usage: node scripts/check-coverage.ts
 * Exit codes: 0 = every area at/above its floors with no undeclared unmeasured file, every file at/
 *                 above its per-file branch floor, and every source file owned exactly once.
 *             1 = an area, the per-file floor or the inventory failed, the suite failed or matched
 *                 no test file, or the config is missing/unusable.
 */
import { spawnSync } from "node:child_process";
import type { SpawnSyncOptionsWithStringEncoding, SpawnSyncReturns } from "node:child_process";
import { globSync, mkdtempSync, readFileSync, readdirSync, rmSync, existsSync } from "node:fs";
import os from "node:os";
import { redactLocalText } from "../../website/src/platform/server-logs/redact-local-text.ts";
import { sanitizeUntrustedText } from "@jini-ai/core/text";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  INVENTORY_DIRS,
  SOURCE_EXTENSIONS,
  TEST_PASSES,
  evaluateArea,
  evaluatePerFileBranch,
  formatArea,
  formatPerFileBranch,
  inventoryFailures,
  isInExcludedDir,
  isProductionSource,
} from "../src/coverage-floors.ts";
import type { CoverageArea, ExcludedSource, LcovCounters, PerFileBranchPolicy, TestPass } from "../src/coverage-floors.ts";

/** `coverage-floors.json`, as far as this file reads it. `_comment*` and `_todo` keys exist in the
 *  file but are never read here. `perFileBranch` is required: a config without one fails the gate
 *  rather than reading as "no per-file floor". */
interface CoverageConfig {
  coverageInclude?: readonly string[];
  areas: readonly CoverageArea[];
  perFileBranch?: PerFileBranchPolicy;
  excluded?: readonly ExcludedSource[];
}

/** One test pass's outcome. `status` is `null` when the process never produced a numeric exit code
 *  (nothing to spawn, or killed by a signal) — never a pass. */
interface SuiteResult {
  status: number | null;
  message?: string;
}

const DESKTOP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** The gate's effects: the desktop root it scans (and reads `coverage-floors.json` from), the test
 *  child it spawns, and where it writes. Production wires the real ones; a test points `root` at a
 *  temp tree and `spawn` at a fake that writes the lcov a real pass would. */
interface CoverageGateContext {
  root: string;
  spawn: (command: string, args: string[], options: SpawnSyncOptionsWithStringEncoding) => SpawnSyncReturns<string>;
  out: (text: string) => void;
  err: (text: string) => void;
}

/** Every production file under `dir` whose extension is in `exts` and that is not in one of
 *  `excludeDirs`, repo-relative to the desktop root, sorted. This is the DENOMINATOR — the lcov
 *  never gets to decide what exists. An excluded directory is pruned, not walked.
 *  @complexity O(n) in files walked. */
function filesOnDisk(dir: string, exts: readonly string[], excludeDirs: readonly string[], desktopRoot: string): string[] {
  const root = path.join(desktopRoot, dir);
  if (!existsSync(root)) return [];
  const out: string[] = [];
  const walk = (abs: string) => {
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      const next = path.join(abs, entry.name);
      const rel = path.relative(desktopRoot, next).split(path.sep).join("/");
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name.startsWith(".") || isInExcludedDir(rel, excludeDirs)) continue;
        walk(next);
        continue;
      }
      if (exts.some((ext) => rel.endsWith(ext)) && isProductionSource({ file: rel })) out.push(rel);
    }
  };
  walk(root);
  return out.sort();
}

/** Every production source file the inventory guard judges: {@link INVENTORY_DIRS} walked
 *  recursively, plus the source files directly in the desktop root (not recursive — that is where
 *  the Electron entry lived, and `node_modules`/`dist` must not be walked).
 *  @complexity O(n) in files walked. */
function sourceInventory({ root }: { root: string }): string[] {
  const topLevel = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && isProductionSource({ file: entry.name }))
    .map((entry) => entry.name);
  return [...INVENTORY_DIRS.flatMap((dir) => filesOnDisk(dir, SOURCE_EXTENSIONS, [], root)), ...topLevel].sort();
}

/** Parse an lcov into `Map<relPath, counters>`. Paths outside this package (Jini's dist, anything
 *  reached through a symlink) are dropped rather than counted.
 *  @complexity O(n) in lcov records. */
function parseLcov(text: string, desktopRoot: string): Map<string, LcovCounters> {
  const byFile = new Map<string, LcovCounters>();
  for (const record of text.split(/^end_of_record$/m)) {
    const sf = /^SF:(.*)$/m.exec(record);
    if (!sf) continue;
    let rel = sf[1]!.trim(); // !: the SF: capture group matched, so group 1 exists
    if (path.isAbsolute(rel)) rel = path.relative(desktopRoot, rel);
    rel = rel.split(path.sep).join("/");
    if (rel.startsWith("..") || rel.includes("node_modules")) continue;
    const num = (key: string): number => {
      const m = new RegExp(`^${key}:(\\d+)$`, "m").exec(record);
      return m ? Number(m[1]) : 0;
    };
    const next = { lf: num("LF"), lh: num("LH"), brf: num("BRF"), brh: num("BRH"), fnf: num("FNF"), fnh: num("FNH") };
    const prev = byFile.get(rel);
    // A file recorded twice keeps the better image, the same rule mergeCoverage applies across passes.
    if (!prev || next.lh > prev.lh) byFile.set(rel, next);
  }
  return byFile;
}

/** Runs one scoped test pass under coverage, capturing and redacting its terminal diagnostics.
 *  Status comes directly from spawnSync; an exhausted output buffer fails. Empty test globs are
 *  refused before spawning, because node itself would report it as a clean pass of zero tests.
 *  @complexity O(n) in test files globbed, plus the suite's own cost. */
function runSuite(pass: TestPass, includes: readonly string[], lcovPath: string, ctx: CoverageGateContext): SuiteResult {
  const testFiles = globSync(pass.globs as string[], { cwd: ctx.root, exclude: (name) => name === "node_modules" });
  if (testFiles.length === 0) {
    return { status: null, message: `no test file matches ${pass.globs.join(" ")}, which node would pass as 0 tests` };
  }
  const args = [
    ...pass.nodeArgs,
    "--test",
    "--experimental-test-coverage",
    ...includes.flatMap((glob) => [`--test-coverage-include=${glob}`]),
    "--test-coverage-exclude=src/**/*.test.ts",
    "--test-coverage-exclude=src/**/*.test.tsx",
    "--test-reporter=lcov",
    `--test-reporter-destination=${lcovPath}`,
    "--test-reporter=dot",
    "--test-reporter-destination=stdout",
    ...pass.globs,
  ];
  const result = ctx.spawn(process.execPath, args, { cwd: ctx.root, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", maxBuffer: 1_000_000 });
  if (result.stdout) ctx.out(sanitizeUntrustedText({ text: redactLocalText({ text: result.stdout }) }, { maxLength: 2_000 }) + "\n");
  if (result.stderr) ctx.err(sanitizeUntrustedText({ text: redactLocalText({ text: result.stderr }) }, { maxLength: 2_000 }) + "\n");
  if (result.error) return { status: null, message: sanitizeUntrustedText({ text: redactLocalText({ text: result.error.message }) }, { maxLength: 2_000 }) };
  return { status: result.signal ? null : result.status };
}

/** Reads every pass's lcov into one `Map<relPath, counters>`, keeping the better image when more
 *  than one pass measured a file.
 *  @complexity O(n) in lcov records. */
function mergeCoverage(lcovPaths: readonly string[], desktopRoot: string): Map<string, LcovCounters> {
  const coverage = new Map<string, LcovCounters>();
  for (const file of lcovPaths) {
    if (!existsSync(file)) continue;
    for (const [rel, counters] of parseLcov(readFileSync(file, "utf8"), desktopRoot)) {
      const prev = coverage.get(rel);
      if (!prev || counters.lh > prev.lh) coverage.set(rel, counters);
    }
  }
  return coverage;
}

/** Runs every pass under coverage, writing pass i's lcov to `lcovPaths[i]`. Returns whether the
 *  SUITE itself passed — coverage numbers from a failed run are not evidence, so that is reported
 *  separately from the floors.
 *  @complexity O(p) in passes, plus the suites' own cost. */
function produceCoverage(config: CoverageConfig, lcovPaths: readonly string[], ctx: CoverageGateContext): boolean {
  const includes = config.coverageInclude ?? [];
  const results = TEST_PASSES.map((pass, i) => ({ id: pass.id, ...runSuite(pass, includes, lcovPaths[i]!, ctx) }));
  // !: lcovPaths is built as `TEST_PASSES.map(...)` in main, so it has exactly TEST_PASSES's length.
  if (results.every((r) => r.status === 0)) return true;
  const summary = results.map((r) => `${r.id}=${r.message ?? r.status}`).join(", ");
  ctx.err(
    `\ncheck-coverage: the test suite itself did not pass (${summary}). ` +
      `Coverage numbers from a failed run are not evidence.\n`
  );
  return false;
}

/** Evaluates and prints every configured area. Returns whether any failed, and every file the
 *  areas scanned on disk (the per-file floor judges exactly those).
 *  @complexity O(n) in areas. */
function evaluateAreas(config: CoverageConfig, coverage: ReadonlyMap<string, LcovCounters>, ctx: CoverageGateContext): { failed: boolean; files: string[] } {
  ctx.out("\n" + "=".repeat(66) + "\nDESKTOP COVERAGE FLOORS\n" + "=".repeat(66) + "\n");
  let failed = false;
  const files: string[] = [];
  for (const area of config.areas) {
    // !: every area entry in coverage-floors.json sets both dirs and extensions; the type leaves
    // them optional because CoverageArea also describes narrower future config shapes.
    const onDisk = area.dirs!.flatMap((dir) => filesOnDisk(dir, area.extensions!, area.excludeDirs ?? [], ctx.root));
    const result = evaluateArea(area, onDisk, coverage);
    ctx.out(`${formatArea(result, area)}\n`);
    if (result.failures.length > 0) failed = true;
    files.push(...onDisk);
  }
  return { failed, files };
}

/** Evaluates and prints the per-file branch floor over the area files. Returns true if it failed;
 *  a config with no `perFileBranch` fails, so dropping the key cannot switch the floor off.
 *  @complexity O(f log f) in files. */
function evaluatePerFile(
  { config, coverage, files }: { config: CoverageConfig; coverage: ReadonlyMap<string, LcovCounters>; files: readonly string[] },
  ctx: CoverageGateContext,
): boolean {
  if (!config.perFileBranch) {
    ctx.out("  FAIL  per-file branch floor\n          ! coverage-floors.json has no perFileBranch. This gate cannot pass without one.\n");
    return true;
  }
  const result = evaluatePerFileBranch({ files, coverage, policy: config.perFileBranch });
  ctx.out(`${formatPerFileBranch({ result, policy: config.perFileBranch })}\n`);
  return result.failures.length > 0;
}

/** Checks and prints the source inventory: every production source file owned by exactly one area
 *  or excluded with a why. Returns true if it failed.
 *  @complexity O(f × a) in files and areas. */
function evaluateInventory({ config }: { config: CoverageConfig }, ctx: CoverageGateContext): boolean {
  const files = sourceInventory({ root: ctx.root });
  const failures = inventoryFailures({ files, areas: config.areas }, { excluded: config.excluded ?? [] });
  ctx.out(`  ${failures.length === 0 ? "OK  " : "FAIL"}  source inventory — ${files.length} source file(s), each in exactly one area or excluded\n`);
  for (const failure of failures) ctx.out(`          ! ${failure}\n`);
  return failures.length > 0;
}

/** Printed every run, by name. An excluded file nobody is told about is the trap; an excluded file
 *  in every run's output is a decision.
 *  @complexity O(n). */
function printExcluded(config: CoverageConfig, ctx: CoverageGateContext): void {
  if (!config.excluded?.length) return;
  ctx.out("\n  EXCLUDED — in no area, no floor applies, and this is deliberate:\n");
  for (const entry of config.excluded) ctx.out(`    - ${entry.file}: ${entry.why}\n`);
}

/**
 * The whole gate: run every test pass under coverage, then judge each area's floors against a disk
 * scan of `ctx.root`, each area file against the per-file branch floor, and the whole source
 * inventory against the areas.
 * @returns the exit code: 0 when the suite passed and all three verdicts passed, else 1.
 * @complexity O(n) in files on disk plus lcov records, plus the suites' own cost.
 */
function runCoverageGate(ctx: CoverageGateContext): number {
  try {
    const configPath = path.join(ctx.root, "coverage-floors.json");
    if (!existsSync(configPath)) {
      ctx.err(`check-coverage: FAIL — no ${path.relative(ctx.root, configPath)}. This gate cannot pass without one.\n`);
      return 1;
    }
    const config: CoverageConfig = JSON.parse(readFileSync(configPath, "utf8"));
    const tmp = mkdtempSync(path.join(os.tmpdir(), "tovu-desktop-cov-"));
    const lcovPaths = TEST_PASSES.map((pass) => path.join(tmp, `${pass.id}.lcov`));

    const suitePassed = produceCoverage(config, lcovPaths, ctx);
    const coverage = mergeCoverage(lcovPaths, ctx.root);
    const areas = evaluateAreas(config, coverage, ctx);
    const perFileFailed = evaluatePerFile({ config, coverage, files: areas.files }, ctx);
    const inventoryFailed = evaluateInventory({ config }, ctx);
    printExcluded(config, ctx);
    rmSync(tmp, { recursive: true, force: true });

    if ([!suitePassed, areas.failed, perFileFailed, inventoryFailed].some(Boolean)) {
      ctx.err("\ncheck-coverage: FAILED\n");
      return 1;
    }
    ctx.out("\ncheck-coverage: OK\n");
    return 0;
  } catch (error) {
    ctx.err(sanitizeUntrustedText({ text: redactLocalText({ text: error instanceof Error ? error.message : String(error) }) }, { maxLength: 2_000 }) + "\n");
    return 1;
  }
}

/**
 * The desktop root to gate. `--root <dir>` exists for the same reason as check-gates.ts's
 * `--manifest`: so `check-coverage-script.test.ts` can run the REAL entry against a temp tree and
 * assert the exit code that comes back, without the entry recursively running this whole suite.
 * @complexity O(n) in argv.
 */
function rootFromArgv(argv: readonly string[]): string {
  const at = argv.indexOf("--root");
  const value = at === -1 ? undefined : argv[at + 1];
  return value ? path.resolve(value) : DESKTOP_ROOT;
}

/** Run only when this file IS the process, never when a test imports it. */
if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runCoverageGate({
    root: rootFromArgv(process.argv.slice(2)),
    spawn: spawnSync,
    out: process.stdout.write.bind(process.stdout),
    err: process.stderr.write.bind(process.stderr),
  });
}

export { rootFromArgv, runCoverageGate, sourceInventory };
export type { CoverageGateContext };
