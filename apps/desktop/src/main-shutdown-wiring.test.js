/**
 * @file Static-analysis tests for `../main.js`'s shutdown wiring (D-09) — that a window's `closed`
 * teardown is TRACKED, that `before-quit` waits for it, that the crash-safety row outlives the
 * child, and that an old window's close cannot drop a replacement entry.
 *
 * Source text, for the reason `main-speech-wiring.test.js` documents at length: `main.js`
 * requires `"electron"` at module scope, so `require`-ing it under plain `node --test` crashes
 * before proving anything. The drain's own behaviour is covered where it lives
 * (`shutdown-tracker.test.js`); what only this file can check is that `main.js` uses it, and in
 * the one arrangement where the use is correct.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const source = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");

/** Just the `window.on("closed", ...)` handler in `openSiteWindow`. Scoped deliberately: the
 *  `createWindow`-failed `catch` above it legitimately calls `recordSiteClosed` before its own
 *  `server.stop()`, and a whole-file assertion would read that as the defect. */
function closedHandler() {
  const start = source.indexOf('window.on("closed"');
  assert.notEqual(start, -1, 'expected a window.on("closed", ...) handler in main.js');
  const end = source.indexOf("\n  return window;", start);
  assert.notEqual(end, -1, "could not find the end of the closed handler");
  return source.slice(start, end);
}

test("before-quit waits on in-flight teardowns, not only on openSites", () => {
  // The defect: the `closed` handler empties `openSites` synchronously and only then begins
  // stopping the child, so closing the last window made this read "nothing to drain" while a
  // `detached` tovu serve was still alive — and it outlives the app.
  const quit = source.slice(source.indexOf('app.on("before-quit"'));
  assert.match(quit, /pendingTeardowns\.size === 0/, "before-quit must see that a teardown is still running");
  assert.match(quit, /pendingTeardowns\.drain\(\)/, "before-quit must actually wait for those teardowns");
  assert.doesNotMatch(
    quit.slice(0, quit.indexOf("\n}")),
    /if \(openSites\.size === 0 \|\| shuttingDown\) return;/,
    "openSites.size alone is the condition that let the app quit mid-teardown",
  );
});

test("the closed handler tracks its teardown so the drain can find it", () => {
  assert.match(closedHandler(), /pendingTeardowns\.track\(/);
});

test("the closed handler drops the crash-safety row only AFTER the child is stopped", () => {
  // The row is what lets the NEXT launch reap a child this process left running, so it must outlive
  // the child. Dropped up front, a hard kill during the stop stranded a tovu serve that
  // `reconcileOrphans` could never find.
  const handler = closedHandler();
  const stopAt = handler.indexOf("server.stop()");
  const rowAt = handler.indexOf("recordSiteClosed(");
  assert.notEqual(stopAt, -1, "expected server.stop() in the closed handler");
  assert.notEqual(rowAt, -1, "expected recordSiteClosed() in the closed handler");
  assert.ok(stopAt < rowAt, "recordSiteClosed must not run before server.stop()");
});

test("closing a window only deletes the entry that window still owns", () => {
  // A crashed server is removed from `openSites` by `site-supervisor.js`, and the operator can
  // re-open the same site from "Open Recent" while the dead window is still on screen. Deleting by
  // site dir alone then dropped that healthy REPLACEMENT the moment the old window was closed. The
  // supervisor's own `handleExit` guards by entry identity; this is its missing sibling.
  const handler = closedHandler();
  assert.match(handler, /if \(openSites\.get\(siteDir\)\?\.window === window\) openSites\.delete\(siteDir\);/);
  assert.doesNotMatch(handler, /^\s*openSites\.delete\(siteDir\);/m, "an unguarded delete drops a replacement entry");
});
