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
 * Usage: node scripts/check-coverage.mjs [--keep-lcov]
 * Exit codes: 0 = every area at/above its floors with no undeclared unmeasured file.
 *             1 = an area failed, the suite failed, or the config is missing/unusable.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { evaluateArea, formatArea, isMeasurableSource } from "../src/coverage-floors.js";

const DESKTOP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG_PATH = path.join(DESKTOP_ROOT, "coverage-floors.json");

/** Every production file under `dir` whose extension is in `exts`, repo-relative to the desktop
 *  root, sorted. This is the DENOMINATOR — the lcov never gets to decide what exists.
 *  @complexity O(n) in files walked. */
function filesOnDisk(dir, exts) {
  const root = path.join(DESKTOP_ROOT, dir);
  if (!existsSync(root)) return [];
  const out = [];
  const walk = (abs) => {
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      const next = path.join(abs, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        walk(next);
        continue;
      }
      const rel = path.relative(DESKTOP_ROOT, next).split(path.sep).join("/");
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
    // The js and ts passes are separate processes; a file measured by both keeps the better image.
    if (!prev || next.lh > prev.lh) byFile.set(rel, next);
  }
  return byFile;
}

/** Runs one scoped test pass under coverage. `stdio: "inherit"` for the same reason the gate runner
 *  uses it — a status read through a pipe is the pipe's.
 *  @complexity O(1) plus the suite's own cost. */
function runSuite(nodeArgs, includes, lcovPath, testGlob) {
  const args = [
    ...nodeArgs,
    "--test",
    "--experimental-test-coverage",
    ...includes.flatMap((glob) => [`--test-coverage-include=${glob}`]),
    "--test-coverage-exclude=src/**/*.test.js",
    "--test-coverage-exclude=src/**/*.test.ts",
    "--test-reporter=lcov",
    `--test-reporter-destination=${lcovPath}`,
    "--test-reporter=dot",
    "--test-reporter-destination=stdout",
    testGlob,
  ];
  const result = spawnSync(process.execPath, args, { cwd: DESKTOP_ROOT, stdio: "inherit" });
  if (result.error) return { status: null, message: result.error.message };
  return { status: result.signal ? null : result.status };
}

function main() {
  if (!existsSync(CONFIG_PATH)) {
    process.stderr.write(`check-coverage: FAIL — no ${path.relative(DESKTOP_ROOT, CONFIG_PATH)}. This gate cannot pass without one.\n`);
    process.exit(1);
  }
  const config = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  const tmp = mkdtempSync(path.join(os.tmpdir(), "tovu-desktop-cov-"));
  const jsLcov = path.join(tmp, "js.lcov");
  const tsLcov = path.join(tmp, "ts.lcov");

  const includes = config.coverageInclude ?? [];
  const js = runSuite([], includes, jsLcov, "src/**/*.test.js");
  const ts = runSuite(["--import", "tsx"], includes, tsLcov, "src/**/*.test.ts");

  let failed = false;
  if (js.status !== 0 || ts.status !== 0) {
    process.stderr.write(`\ncheck-coverage: the test suite itself did not pass (js=${js.status}, ts=${ts.status}). Coverage numbers from a failed run are not evidence.\n`);
    failed = true;
  }

  const coverage = new Map();
  for (const file of [jsLcov, tsLcov]) {
    if (!existsSync(file)) continue;
    for (const [rel, counters] of parseLcov(readFileSync(file, "utf8"))) {
      const prev = coverage.get(rel);
      if (!prev || counters.lh > prev.lh) coverage.set(rel, counters);
    }
  }

  process.stdout.write("\n" + "=".repeat(66) + "\nDESKTOP COVERAGE FLOORS\n" + "=".repeat(66) + "\n");
  for (const area of config.areas) {
    const onDisk = area.dirs.flatMap((dir) => filesOnDisk(dir, area.extensions));
    const result = evaluateArea(area, onDisk, coverage);
    process.stdout.write(`${formatArea(result, area)}\n`);
    if (result.failures.length > 0) failed = true;
  }

  // Printed every run, by name. An excluded file nobody is told about is the trap; an excluded file
  // on every run's output is a decision.
  if (config.notMeasured?.length) {
    process.stdout.write("\n  NOT MEASURED — no floor applies, and this is deliberate:\n");
    for (const entry of config.notMeasured) process.stdout.write(`    - ${entry.what}: ${entry.why}\n`);
  }

  rmSync(tmp, { recursive: true, force: true });
  if (failed) {
    process.stderr.write("\ncheck-coverage: FAILED\n");
    process.exit(1);
  }
  process.stdout.write("\ncheck-coverage: OK\n");
}

main();
