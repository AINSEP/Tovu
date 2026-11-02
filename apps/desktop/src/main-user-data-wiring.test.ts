/**
 * @file Static-analysis tests for how the Electron entry (`src/main/index.ts`, formerly `main.ts`)
 * applies its `userData` directory.
 *
 * Source text, not behaviour, for the reason `main-project-wiring.test.ts` gives: the entry cannot
 * be imported outside a real Electron process. `packaged-paths.test.ts` covers WHICH folder each
 * mode gets, and `src/main/boot/boot-steps.test.ts` covers `applyUserDataDir` itself (the E2E
 * override winning, trimmed and resolved, and exported to CLI children). This file checks only what
 * the entry alone decides: that it calls `applyUserDataDir` with the resolver's folder, at module
 * scope, before anything reads `userData`. Without the `setPath`, Electron falls back to
 * `package.json`'s name, which is the dev app's `tovu-desktop` in a packaged build too.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MAIN_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "main", "index.ts");
const source = fs.readFileSync(MAIN_PATH, "utf8");

/** The one module-scope `applyUserDataDir(` call (the only `setPath("userData", …)` is inside it). */
const APPLY_USER_DATA = /^const userDataProfile = applyUserDataDir\(/m;

/** First non-comment line that reads `userData`, outside the `applyUserDataDir` call itself. */
const FIRST_USER_DATA_READ = /^(?![ \t]*(?:\*|\/\/))(?!.*getUserDataDir: ).*app\.getPath\("userData"\)/m;

/** First non-comment `.whenReady()`; the doc comments above the setPath mention it too. */
const WHEN_READY_CALL = /^(?![ \t]*(?:\*|\/\/)).*\.whenReady\(\)/m;

test("main.ts hands the resolver Electron's appData root", () => {
  assert.match(source, /resolveDesktopRoots\(\{[\s\S]*?appDataDir: app\.getPath\("appData"\),[\s\S]*?\}\);/);
});

test("main.ts applies the resolver's userData through applyUserDataDir, and sets it nowhere else", () => {
  const call = source.slice(source.search(APPLY_USER_DATA), source.indexOf("});", source.search(APPLY_USER_DATA)));
  assert.match(call, /env: process\.env, defaultUserDataDir: DESKTOP_ROOTS\.userDataDir,/);
  assert.match(call, /setUserDataDir: \(dir\) => app\.setPath\("userData", dir\)/);
  assert.equal(source.match(/applyUserDataDir\(/g)?.length, 1, "exactly one module-scope userData apply, so nothing later overrides it");
  assert.equal(source.match(/app\.setPath\("userData"/g)?.length, 1, "no second setPath outside applyUserDataDir");
});

test("the shared workspace receives Electron's resolved scratch profile only when the E2E override is on", () => {
  assert.match(source, /const sharedSites = createSitesWorkspace\(\{\}, \{[\s\S]*?appDataDir: userDataProfile\.overridden \? app\.getPath\("userData"\) : undefined/);
});

test("userData is set before anything reads it, and before whenReady", () => {
  const setAt = source.search(APPLY_USER_DATA);
  assert.notEqual(setAt, -1, "expected a module-scope applyUserDataDir(...) in main.ts");
  assert.ok(source.indexOf("const DESKTOP_ROOTS = resolveDesktopRoots(") < setAt, "DESKTOP_ROOTS must be defined before it is used");
  const firstRead = source.search(FIRST_USER_DATA_READ);
  assert.notEqual(firstRead, -1, "expected main.ts to read app.getPath(\"userData\") somewhere");
  assert.ok(setAt < firstRead, "a read before the setPath would resolve the dev app's folder");
  const whenReadyAt = source.search(WHEN_READY_CALL);
  assert.notEqual(whenReadyAt, -1, "expected a .whenReady() call in main.ts");
  assert.ok(setAt < whenReadyAt, "Chromium locks the userData directory at ready");
});
