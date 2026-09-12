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

const source = fs.readFileSync(path.join(__dirname, "..", "main.ts"), "utf8");

/** Just the `window.on("closed", ...)` handler in `openSiteWindow`. Scoped deliberately: the
 *  `createWindow`-failed `catch` above it legitimately calls `recordSiteClosed` before its own
 *  `server.stop()`, and a whole-file assertion would read that as the defect. */
function closedHandler() {
  const start = source.indexOf('window.on("closed"');
  assert.notEqual(start, -1, 'expected a window.on("closed", ...) handler in main.ts');
  const end = source.indexOf("\n  return window;", start);
  assert.notEqual(end, -1, "could not find the end of the closed handler");
  return source.slice(start, end);
}

/** Just the `app.on("before-quit", ...)` handler, up to its closing `});`. Anchored at a line start:
 *  a doc comment earlier in main.js mentions `app.on("before-quit")` in prose. */
function beforeQuitHandler() {
  const start = source.indexOf('\napp.on("before-quit", ');
  assert.notEqual(start, -1, 'expected an app.on("before-quit", ...) handler in main.ts');
  const end = source.indexOf("\n});", start);
  assert.notEqual(end, -1, "could not find the end of the before-quit handler");
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

test("termination signals route into the graceful quit, armed once the app is ready", () => {
  // The orphaned tovu serve after `kill -TERM <dev-desktop>`: Chromium's own SIGTERM/SIGINT/SIGHUP
  // handler is one-shot (it resets SIG_DFL), and every launcher delivers the signal more than once —
  // the group kill plus electron/cli.js's forward. The second copy killed Electron before
  // before-quit's drain had stopped its detached children.
  const ready = source.indexOf("app\n  .whenReady()");
  const route = source.search(/routeQuitSignals\(\{/);
  const reconcile = source.indexOf("await reconcileOrphansOnBoot(", ready);
  assert.notEqual(ready, -1, "expected main.ts's app.whenReady() chain");
  assert.notEqual(route, -1, "main.ts must route termination signals into app.quit()");
  assert.ok(route > ready, "a process.on handler registered at module load is replaced by Chromium's and never fires");
  assert.ok(route < reconcile, "must be armed before anything in the ready chain can spawn a tovu serve");
});

test("a quit attempt during the drain is held until the drain completes, not let through", () => {
  // The second Cmd+Q: it re-entered before-quit with the drain already running, and the old
  // `|| shuttingDown) return;` let it through without preventDefault(), so Electron exited before the
  // parallel server.stop() calls finished and stranded detached tovu serve children.
  const handler = beforeQuitHandler();
  assert.doesNotMatch(handler, /\|\| shuttingDown\) return;/, "a guard that returns mid-drain lets a second quit exit Electron");
  const decide = handler.indexOf("decideBeforeQuit({ phase: quitPhase,");
  const proceed = handler.indexOf('if (action === "proceed") return;');
  const prevent = handler.indexOf("event.preventDefault();");
  const hold = handler.indexOf('if (action === "hold") return;');
  assert.notEqual(decide, -1, "before-quit must ask decideBeforeQuit with the current quitPhase");
  assert.ok(decide < proceed && proceed < prevent && prevent < hold, "a held attempt must be preventDefault()ed before it returns");
  assert.match(handler, /quitPhase = "draining";/);
  assert.match(
    handler,
    /\.finally\(\(\) => \{\s*quitPhase = "drained";\s*app\.quit\(\);\s*\}\)/,
    "the drain's own closing app.quit() must be the one decideBeforeQuit lets through",
  );
});

test("the drain arms the force-exit deadline itself, so a held quit cannot outlive a hung drain", () => {
  // Holding a second Cmd+Q removed its accidental escape from a hung drain (endSiteSession's loopback
  // logout has no timeout of its own). quit-signals.js arms its deadline only for a signal.
  const handler = beforeQuitHandler();
  const draining = handler.indexOf('quitPhase = "draining";');
  assert.notEqual(draining, -1, "expected before-quit to enter the draining phase");
  assert.match(handler.slice(draining), /setTimeout\(\(\) => app\.exit\(1\), QUIT_DEADLINE_MS\)\.unref\(\);/);
  assert.match(source, /deadlineMs: QUIT_DEADLINE_MS,/, "a signal and a Cmd+Q must get the same bound");
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
