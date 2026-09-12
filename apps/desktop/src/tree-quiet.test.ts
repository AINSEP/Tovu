/**
 * @file Tests for `tree-quiet.js`'s pure predicate. The signal-gathering half
 * (`scripts/check-tree-quiet.mjs`) is not exercised here — it spawns `pgrep` and `git` — so these
 * tests hand it every combination of signals directly.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { treeQuietProblems } from "./tree-quiet.ts";

const QUIET = { viteWatchRunning: false, gitDirtyPaths: [], movingPaths: [] };

test("a fully quiet tree reports zero problems", () => {
  assert.deepEqual(treeQuietProblems(QUIET), []);
});

test("a live vite build --watch is one problem, naming the incident it reproduces", () => {
  const problems = treeQuietProblems({ ...QUIET, viteWatchRunning: true });
  assert.equal(problems.length, 1);
  assert.match(problems[0]!,/vite build --watch/);
  assert.match(problems[0]!,/2026-09-12-packaging-asar-corruption/);
});

test("uncommitted changes under the packaged surface are one problem, naming the paths", () => {
  const problems = treeQuietProblems({ ...QUIET, gitDirtyPaths: ["apps/desktop/src/foo.js"] });
  assert.equal(problems.length, 1);
  assert.match(problems[0]!,/apps\/desktop\/src\/foo\.js/);
});

test("a directory that changed during the observation window is one problem, naming the paths", () => {
  const problems = treeQuietProblems({ ...QUIET, movingPaths: ["apps/desktop/dist"] });
  assert.equal(problems.length, 1);
  assert.match(problems[0]!,/apps\/desktop\/dist/);
});

test("all three signals firing at once produce three distinct problems, not one merged message", () => {
  const problems = treeQuietProblems({
    viteWatchRunning: true,
    gitDirtyPaths: ["apps/desktop/src/foo.js"],
    movingPaths: ["apps/desktop/dist"],
  });
  assert.equal(problems.length, 3);
});

test("missing gitDirtyPaths/movingPaths default to empty rather than throwing", () => {
  assert.deepEqual(treeQuietProblems({ viteWatchRunning: false }), []);
});
