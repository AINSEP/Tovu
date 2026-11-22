/**
 * @file Static-analysis tests for `main/index.ts`'s auto-updater wiring. Source text, for the reason
 * `main-shutdown-wiring.test.ts` gives: the entry requires `"electron"` at module scope. The
 * updater's behaviour (the skip gate, will-quit, a rejected start being logged) is
 * proven in `main/updates/desktop-updater.test.ts`, and that the boot starts it without awaiting it
 * in `main/boot/boot-sequence.test.ts`; this file checks only what the entry alone can get wrong.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(__dirname, "main", "index.ts"), "utf8");

function block(anchor: string, end: string): string {
  const start = source.indexOf(anchor);
  assert.notEqual(start, -1, `expected ${anchor} in main/index.ts`);
  const stop = source.indexOf(end, start);
  assert.notEqual(stop, -1, `could not find the end of ${anchor}`);
  return source.slice(start, stop);
}

test("electron-updater is a declared dependency, imported statically and never through a dynamic import()", () => {
  assert.match(source, /^import electronUpdater from "electron-updater";$/m);
  assert.doesNotMatch(source, /import\(\s*["']electron-updater["']\s*\)/);
  assert.match(source, /loadNativeUpdater: async \(\) => electronUpdater\.autoUpdater,/);
});

test("only the quit that ends the app consults the updater, and may be held by it", () => {
  const handler = block('\napp.on("before-quit", ', "\n});");
  assert.match(handler, /if \(action === "proceed"\) \{\s*if \(finalQuitHeldForUpdate\(\)\) event\.preventDefault\(\);\s*return;\s*\}/);
  assert.equal(handler.match(/finalQuitHeldForUpdate/g)?.length, 1, "the drain branches must not consult the updater");
});
