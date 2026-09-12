#!/usr/bin/env node
/**
 * @file The desktop coverage gate. Runs the test suite under node's own coverage, then checks each
 * configured area in `coverage-floors.json` against its floors AND against the files actually
 * present on disk. The rules live in `../src/coverage-floors.js` and are tested there.
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
 * `../src/coverage-floors.js`'s header for the measurement in this very repo that the omission
 * corrupted.
 *
 * ## Runners and areas are both split by directory, never by extension
 *
 * Main-process tests run on bare node and only renderer and contracts tests run under tsx, because
 * tsx corrupts lcov counters (see {@link PASSES}). The areas are cut the same way, through
 * `excludeDirs`. Renaming a main-process file from `.js` to `.ts` therefore moves it between
 * neither runners nor floors.
 *
 * Usage: node scripts/check-coverage.mjs [--keep-lcov]
 * Exit codes: 0 = every area at/above its floors with no undeclared unmeasured file.
 *             1 = an area failed, the suite failed or matched no test file, or the config is
 *                 missing/unusable.
 */
import { spawnSync } from "node:child_process";
import { globSync, mkdtempSync, readFileSync, readdirSync, rmSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { evaluateArea, formatArea, isInExcludedDir, isMeasurableSource } from "../src/coverage-floors.js";

const DESKTOP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG_PATH = path.join(DESKTOP_ROOT, "coverage-floors.json");

/**
 * The two test passes, split by DIRECTORY. Probe P4 (2026-09-12,
 * `ADS-memory/.local-artifacts/desktop-ts/phase0-probes.md`): after a `.js`-to-`.ts` rename, bare
 * node reproduces the file's lcov image exactly, but tsx does not. esbuild's `__name` helper adds a
 * fake function and branch per file and lands hits on the wrong lines. So every main-process test,
 * `.js` or `.ts`, runs on bare node. Only the renderer and contracts `.test.ts` files, whose `.js`
 * specifiers need bundler resolution, run under tsx. `package.json`'s `test` script carries the
 * same split and must change with this list.
 *
 * Several of these globs match nothing today. Measured on node 24.2.0: a glob that matches nothing
 * exits 0 reporting "tests 0", with no error. Only a literal path errors. So {@link runSuite} refuses
 * to run a pass whose globs match no test file at all.
 */
const PASSES = [
  { id: "node", nodeArgs: [], globs: ["src/**/*.test.js", "src/*.test.ts", "src/!(renderer|contracts)/**/*.test.ts"] },
  { id: "tsx", nodeArgs: ["--import", "tsx"], globs: ["src/renderer/**/*.test.ts", "src/contracts/**/*.test.ts"] },
];

/** Every production file under `dir` whose extension is in `exts` and that is not in one of
 *  `excludeDirs`, repo-relative to the desktop root, sorted. This is the DENOMINATOR — the lcov
 *  never gets to decide what exists. An excluded directory is pruned, not walked.
 *  @complexity O(n) in files walked. */
function filesOnDisk(dir, exts, excludeDirs) {
  const root = path.join(DESKTOP_ROOT, dir);
  if (!existsSync(root)) return [];
  const out = [];
  const walk = (abs) => {
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      const next = path.join(abs, entry.name);
      const rel = path.relative(DESKTOP_ROOT, next).split(path.sep).join("/");
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name.startsWith(".") || isInExcludedDir(rel, excludeDirs)) continue;
        walk(next);
        continue;
      }
      if (exts.some((ext) => rel.endsWith(ext)) && isMeasurableSource(rel)) out.push(rel);
    }
  };
  walk(root);
  return out.sort();
}

/** Parse an lcov into `Map<relPath, counters>`. Paths outside this package (Jini's dist, anything
 *  reached through a symlink) are dropped rather than counted.
 *  @complexity O(n) in lcov records. */
function parseLcov(text) {
  const byFile = new Map();
  for (const record of text.split(/^end_of_record$/m)) {
    const sf = /^SF:(.*)$/m.exec(record);
    if (!sf) continue;
    let rel = sf[1].trim();
    if (path.isAbsolute(rel)) rel = path.relative(DESKTOP_ROOT, rel);
    rel = rel.split(path.sep).join("/");
    if (rel.startsWith("..") || rel.includes("node_modules")) continue;
    const num = (key) => {
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

/** Runs one scoped test pass under coverage. `stdio: "inherit"` for the same reason the gate runner
 *  uses it — a status read through a pipe is the pipe's. A pass whose globs match no test file is
 *  refused before spawning, because node itself would report it as a clean pass of zero tests.
 *  @complexity O(n) in test files globbed, plus the suite's own cost. */
function runSuite(pass, includes, lcovPath) {
  const testFiles = globSync(pass.globs, { cwd: DESKTOP_ROOT, exclude: (name) => name === "node_modules" });
  if (testFiles.length === 0) {
    return { status: null, message: `no test file matches ${pass.globs.join(" ")}, which node would pass as 0 tests` };
  }
  const args = [
    ...pass.nodeArgs,
    "--test",
    "--experimental-test-coverage",
    ...includes.flatMap((glob) => [`--test-coverage-include=${glob}`]),
    "--test-coverage-exclude=src/**/*.test.js",
    "--test-coverage-exclude=src/**/*.test.ts",
    "--test-reporter=lcov",
    `--test-reporter-destination=${lcovPath}`,
    "--test-reporter=dot",
    "--test-reporter-destination=stdout",
    ...pass.globs,
  ];
  const result = spawnSync(process.execPath, args, { cwd: DESKTOP_ROOT, stdio: "inherit" });
  if (result.error) return { status: null, message: result.error.message };
  return { status: result.signal ? null : result.status };
}

/** Reads every pass's lcov into one `Map<relPath, counters>`, keeping the better image when more
 *  than one pass measured a file.
 *  @complexity O(n) in lcov records. */
function mergeCoverage(lcovPaths) {
  const coverage = new Map();
  for (const file of lcovPaths) {
    if (!existsSync(file)) continue;
    for (const [rel, counters] of parseLcov(readFileSync(file, "utf8"))) {
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
function produceCoverage(config, lcovPaths) {
  const includes = config.coverageInclude ?? [];
  const results = PASSES.map((pass, i) => ({ id: pass.id, ...runSuite(pass, includes, lcovPaths[i]) }));
  if (results.every((r) => r.status === 0)) return true;
  const summary = results.map((r) => `${r.id}=${r.message ?? r.status}`).join(", ");
  process.stderr.write(
    `\ncheck-coverage: the test suite itself did not pass (${summary}). ` +
      `Coverage numbers from a failed run are not evidence.\n`
  );
  return false;
}

/** Evaluates and prints every configured area. Returns true if any failed.
 *  @complexity O(n) in areas. */
function evaluateAreas(config, coverage) {
  process.stdout.write("\n" + "=".repeat(66) + "\nDESKTOP COVERAGE FLOORS\n" + "=".repeat(66) + "\n");
  let failed = false;
  for (const area of config.areas) {
    const onDisk = area.dirs.flatMap((dir) => filesOnDisk(dir, area.extensions, area.excludeDirs ?? []));
    const result = evaluateArea(area, onDisk, coverage);
    process.stdout.write(`${formatArea(result, area)}\n`);
    if (result.failures.length > 0) failed = true;
  }
  return failed;
}

/** Printed every run, by name. An excluded file nobody is told about is the trap; an excluded file
 *  in every run's output is a decision.
 *  @complexity O(n). */
function printNotMeasured(config) {
  if (!config.notMeasured?.length) return;
  process.stdout.write("\n  NOT MEASURED — no floor applies, and this is deliberate:\n");
  for (const entry of config.notMeasured) process.stdout.write(`    - ${entry.what}: ${entry.why}\n`);
}

function main() {
  if (!existsSync(CONFIG_PATH)) {
    process.stderr.write(
      `check-coverage: FAIL — no ${path.relative(DESKTOP_ROOT, CONFIG_PATH)}. This gate cannot pass without one.\n`
    );
    process.exit(1);
  }
  const config = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  const tmp = mkdtempSync(path.join(os.tmpdir(), "tovu-desktop-cov-"));
  const lcovPaths = PASSES.map((pass) => path.join(tmp, `${pass.id}.lcov`));

  const suitePassed = produceCoverage(config, lcovPaths);
  const areasFailed = evaluateAreas(config, mergeCoverage(lcovPaths));
  printNotMeasured(config);
  rmSync(tmp, { recursive: true, force: true });

  if (!suitePassed || areasFailed) {
    process.stderr.write("\ncheck-coverage: FAILED\n");
    process.exit(1);
  }
  process.stdout.write("\ncheck-coverage: OK\n");
}

main();
