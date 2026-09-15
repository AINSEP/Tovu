/**
 * @file Static-analysis tests for how `../main.ts` decides its `userData` directory.
 *
 * Source text, not behaviour, for the reason `main-project-wiring.test.ts` gives: `main.ts` cannot
 * be imported outside a real Electron process. `packaged-paths.test.ts` covers WHICH folder each
 * mode gets; this file checks that `main.ts` actually applies it, at module scope, before anything
 * reads `userData`. Without the `setPath`, Electron falls back to `package.json`'s name, which is
 * the dev app's `tovu-desktop` in a packaged build too.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MAIN_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "main.ts");
const source = fs.readFileSync(MAIN_PATH, "utf8");

/** Top-level (column-0) `setPath("userData", …)` calls; comment lines start with ` *` or `//`. */
const SET_USER_DATA = /^app\.setPath\("userData", /gm;

/** First non-comment line that reads `userData`. */
const FIRST_USER_DATA_READ = /^(?![ \t]*(?:\*|\/\/)).*app\.getPath\("userData"\)/m;

/** First non-comment `.whenReady()`; the doc comments above the setPath mention it too. */
const WHEN_READY_CALL = /^(?![ \t]*(?:\*|\/\/)).*\.whenReady\(\)/m;

test("main.ts hands the resolver Electron's appData root", () => {
  assert.match(source, /resolveDesktopRoots\(\{[\s\S]*?appDataDir: app\.getPath\("appData"\),[\s\S]*?\}\);/);
});

test("main.ts sets userData from the resolver, with the E2E override still winning", () => {
  assert.match(source, /^app\.setPath\("userData", process\.env\.TOVU_DESKTOP_USER_DATA_DIR\?\.trim\(\) \|\| DESKTOP_ROOTS\.userDataDir\);$/m);
  assert.equal(source.match(SET_USER_DATA)?.length, 1, "exactly one module-scope userData setPath, so nothing later overrides it");
});

test("userData is set before anything reads it, and before whenReady", () => {
  const setAt = source.search(SET_USER_DATA);
  assert.notEqual(setAt, -1, "expected a module-scope app.setPath(\"userData\", …) in main.ts");
  assert.ok(source.indexOf("const DESKTOP_ROOTS = resolveDesktopRoots(") < setAt, "DESKTOP_ROOTS must be defined before it is used");
  const firstRead = source.search(FIRST_USER_DATA_READ);
  assert.notEqual(firstRead, -1, "expected main.ts to read app.getPath(\"userData\") somewhere");
  assert.ok(setAt < firstRead, "a read before the setPath would resolve the dev app's folder");
  const whenReadyAt = source.search(WHEN_READY_CALL);
  assert.notEqual(whenReadyAt, -1, "expected a .whenReady() call in main.ts");
  assert.ok(setAt < whenReadyAt, "Chromium locks the userData directory at ready");
});
