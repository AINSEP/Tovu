#!/usr/bin/env node
/**
 * @file Groups a node `--test-reporter=tap` output file's failures by source file, so failures can
 * be triaged per-owner instead of read as one flat list. Part of the local-CI toolkit added
 * 2026-08-19 (see `ci-local.sh`'s header for why local CI exists at all).
 *
 * Two npm scripts write TAP files this can read:
 *   - `npm run test:ci`         -> development/coverage/test-results-all.tap  (repo-wide)
 *   - `npm run test:cov:server` -> development/coverage/test-results.tap      (src/server/** only)
 *
 * ## Two modes
 *
 * Default: print each failing file with its failure count and the `[error] description` for every
 * failure under it, sorted by failure count descending, plus a total.
 *
 * `--list-files`: print ONLY the unique failing file paths, one per line, sorted -- nothing else.
 * This is what `rerun-failing-tests.sh` consumes to build its `node --test` argument list, so the
 * "which files currently fail" logic has exactly one implementation instead of two regexes that
 * could silently drift apart (same reasoning as `list-server-test-files.ts`'s own header on why it
 * shares `isIntegrationTestFile` rather than re-deriving it).
 *
 * ## Known limitation, inherited from check-test-baseline.ts
 *
 * Node's TAP reporter does not always preserve per-file identity -- under resource pressure it can
 * emit a bare `not ok N - <file path>` for a file that crashed before/during its own tests (see
 * check-test-baseline.ts's "CI-runner file-level crashes" section for the full diagnosis). Such
 * entries have no `location:` line, so they land under the `(file-level rollup)` bucket below rather
 * than a real file path, and `--list-files` deliberately excludes that bucket -- there is no
 * individual file to re-run for it, only a hint that the whole run needs another look.
 *
 * Usage:
 *   node development/scripts/tap-summary.mjs <tap-file>
 *   node development/scripts/tap-summary.mjs <tap-file> --list-files
 */
import { readFileSync } from "node:fs";

const tapPath = process.argv[2];
const listFilesOnly = process.argv.includes("--list-files");

if (!tapPath) {
  console.error("Usage: node development/scripts/tap-summary.mjs <tap-file> [--list-files]");
  process.exit(1);
}

const tap = readFileSync(tapPath, "utf8").split("\n");
const byFile = new Map();
let cur = null;

for (let i = 0; i < tap.length; i++) {
  const line = tap[i];
  const m = line.match(/^not ok \d+ - (.*)$/);
  if (m) {
    cur = { desc: m[1], file: null, error: null, loc: null };
    continue;
  }
  if (!cur) continue;
  const loc = line.match(/^\s*location: '(.+?):(\d+):/);
  if (loc) {
    cur.file = loc[1].replace(`${process.cwd()}/`, "");
    cur.loc = loc[2];
  }
  const err = line.match(/^\s*error: '?(.*?)'?$/);
  if (err && !cur.error) cur.error = err[1];
  if (line.trim() === "..." && cur) {
    const key = cur.file ?? "(file-level rollup)";
    if (!byFile.has(key)) byFile.set(key, []);
    byFile.get(key).push(cur);
    cur = null;
  }
}

if (listFilesOnly) {
  const files = [...byFile.keys()].filter((f) => f !== "(file-level rollup)").sort();
  for (const f of files) console.log(f);
  process.exit(0);
}

let total = 0;
const sorted = [...byFile.entries()].sort((a, b) => b[1].length - a[1].length);
for (const [file, fails] of sorted) {
  total += fails.length;
  console.log(`\n### ${file}  (${fails.length})`);
  for (const f of fails) console.log(`  - [${f.error}] ${f.desc}`);
}
console.log(`\n=== ${total} failing tests across ${byFile.size} files ===`);
