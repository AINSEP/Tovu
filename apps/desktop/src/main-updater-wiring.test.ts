/**
 * @file Static-analysis tests for `../main.ts`'s auto-updater wiring. Source text, for the reason
 * `main-shutdown-wiring.test.ts` gives: `main.ts` requires `"electron"` at module scope. The
 * updater's behaviour is proven in `auto-update-controller.test.ts` and `update-policy.test.ts`;
 * this file checks only that `main.ts` calls it at the right points.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(__dirname, "..", "main.ts"), "utf8");

function block(anchor: string, end: string): string {
  const start = source.indexOf(anchor);
  assert.notEqual(start, -1, `expected ${anchor} in main.ts`);
  const stop = source.indexOf(end, start);
  assert.notEqual(stop, -1, `could not find the end of ${anchor}`);
  return source.slice(start, stop);
}

test("the updater is gated by updaterSkipReason, including the Store and self-test cases", () => {
  const starter = block("async function startAutoUpdater()", "\n}\n");
  assert.match(starter, /updaterSkipReason\(\{/);
  assert.match(starter, /isPackaged: app\.isPackaged,/);
  assert.match(starter, /windowsStore: process\.windowsStore === true,/);
  assert.match(starter, /selftest: SELFTEST,/);
  assert.match(starter, /if \(skip !== null\) \{[\s\S]*?return;/);
});

test("electron-updater is loaded lazily, never at module scope", () => {
  assert.doesNotMatch(source, /^import .*electron-updater/m);
  assert.match(block("async function startAutoUpdater()", "\n}\n"), /await import\("electron-updater"\)/);
});

test("the updater is started from whenReady without blocking or failing the boot", () => {
  assert.match(block("app\n  .whenReady()", ".catch(reportBootFailure);"), /startAutoUpdater\(\)\.catch\(/);
});

test("only the quit that ends the app consults the updater, and may be held by it", () => {
  const handler = block('\napp.on("before-quit", ', "\n});");
  assert.match(handler, /if \(action === "proceed"\) \{\s*if \(finalQuitHeldForUpdate\(\)\) event\.preventDefault\(\);\s*return;\s*\}/);
  assert.equal(handler.match(/finalQuitHeldForUpdate/g)?.length, 1, "the drain branches must not consult the updater");
});

test("will-quit removes this instance's presence record", () => {
  assert.match(source, /app\.on\("will-quit", \(\) => \{\s*autoUpdate\?\.willQuit\(\);\s*\}\);/);
});
