import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { waitForFileStable } from "../dev-desktop.mjs";

/**
 * @file Regression test for `development/scripts/dev-desktop.mjs`'s launch-1-boots-the-previous-
 * bundle bug: `waitForFileStable` polled `dist/renderer/index.html` for two stable-mtime ticks
 * (~300-450ms at the default poll settings) and resolved as soon as it saw those — but on a second
 * (or later) `npm run desktop`, that file already exists from the LAST run and is already stable, so
 * the wait was satisfied by stale bytes before vite's ~2.7s first watch build had written anything.
 * Electron then loaded the previous bundle; only launch 2+ (after the watcher had time to catch up)
 * saw the real change. The fix adds a `sinceMs` freshness floor: a stat older than `sinceMs` is
 * treated as not-yet-built-this-run and cannot satisfy the wait on its own — see the function's own
 * doc comment in `../dev-desktop.mjs` for the full mechanism.
 */

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeTempIndexHtml(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dev-desktop-wait-"));
  const filePath = path.join(dir, "index.html");
  fs.writeFileSync(filePath, content);
  return filePath;
}

test("waitForFileStable: a stale file predating sinceMs never satisfies the wait on its own (times out)", async () => {
  const filePath = makeTempIndexHtml("<html>previous run's bundle</html>");
  await delay(30); // unambiguously separate the stale file's mtime from sinceMs below
  const sinceMs = Date.now();
  const result = await waitForFileStable(filePath, {
    timeoutMs: 200,
    pollMs: 20,
    stableChecks: 2,
    sinceMs,
  });
  assert.equal(result, false, "a stat older than sinceMs must not count as fresh, even if stable");
});

test("waitForFileStable: only a rewrite landing at/after sinceMs satisfies the wait, not the stale content already on disk", async () => {
  const filePath = makeTempIndexHtml("<html>previous run's bundle</html>");
  await delay(30);
  const sinceMs = Date.now();
  // Simulates vite's watch build writing the NEW bundle shortly after the watcher starts.
  setTimeout(() => fs.writeFileSync(filePath, "<html>this run's fresh bundle</html>"), 60);
  const result = await waitForFileStable(filePath, {
    timeoutMs: 2000,
    pollMs: 20,
    stableChecks: 2,
    sinceMs,
  });
  assert.equal(result, true);
});

test("waitForFileStable: sinceMs defaults to 0, so a freshly created file with no prior run still resolves true", async () => {
  const filePath = makeTempIndexHtml("<html>only build this process has ever made</html>");
  const result = await waitForFileStable(filePath, { timeoutMs: 300, pollMs: 20, stableChecks: 2 });
  assert.equal(result, true);
});

test("waitForFileStable: resolves false, not hung forever, when the file never appears at all", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dev-desktop-wait-"));
  const missingPath = path.join(dir, "never-written.html");
  const result = await waitForFileStable(missingPath, { timeoutMs: 100, pollMs: 20, stableChecks: 2 });
  assert.equal(result, false);
});
