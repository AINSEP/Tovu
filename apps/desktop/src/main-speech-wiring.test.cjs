/**
 * @file Static-analysis tests for `../main.cjs`'s speech feature wiring. `main.cjs` requires
 * `"electron"` at module scope, which resolves to a path string (not the real API) outside a real
 * Electron process — `require`-ing it under plain `node --test` would crash immediately without
 * proving anything (same constraint `preload-speech.test.cjs` documents for its own file). What IS
 * testable without Electron is its SOURCE TEXT: whether `createWindow`'s `webPreferences` actually
 * names a `preload` script, and whether `registerSpeechIpc` is required and invoked early enough
 * that the renderer's `isAvailable()` call never races an unregistered channel.
 *
 * Both `speech-ipc.cjs` and `preload-speech.cjs` document this exact gap in their own file headers
 * ("Not wired into main.cjs yet") — this is the mic's actual failure mode inside the desktop shell:
 * every primitive (preload bridge, IPC handlers, on-device transcriber) is built and independently
 * tested, but nothing in `main.cjs` ever connects them, so `window.tovuVoice` never exists even
 * inside Electron and the mic reports "needs the desktop app" while already running in it.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const MAIN_PATH = path.join(__dirname, "..", "main.cjs");
const source = fs.readFileSync(MAIN_PATH, "utf8");

test("main.cjs requires registerSpeechIpc from speech-ipc.cjs", () => {
  assert.match(source, /require\(["']\.\/src\/speech\/speech-ipc\.cjs["']\)/);
  assert.match(source, /registerSpeechIpc/);
});

test("main.cjs calls registerSpeechIpc with the real ipcMain before attach mode's window can load", () => {
  const registerCallIndex = source.indexOf("registerSpeechIpc(");
  const attachBranchIndex = source.indexOf("if (attachUrl)");
  assert.notEqual(registerCallIndex, -1, "expected a registerSpeechIpc(...) call in main.cjs");
  assert.notEqual(attachBranchIndex, -1, "expected the attach-mode branch in main.cjs");
  assert.ok(
    registerCallIndex < attachBranchIndex,
    "registerSpeechIpc must run before attach mode's window can load, or an early isAvailable() call races an unregistered channel",
  );
  assert.match(source, /registerSpeechIpc\(\s*\{\s*ipcMain\s*\}\s*\)/);
});

test("createWindow's webPreferences names a preload script", () => {
  const createWindowStart = source.indexOf("function createWindow(");
  assert.notEqual(createWindowStart, -1, "expected a createWindow function in main.cjs");
  const webPreferencesMatch = source.slice(createWindowStart).match(/webPreferences:\s*\{[^}]*\}/);
  assert.ok(webPreferencesMatch, "expected a webPreferences object in createWindow");
  assert.match(webPreferencesMatch[0], /preload:\s*\S/, "webPreferences must set a preload path");
});

test("the preload path (inline or via a named constant) resolves to the speech feature's preload-speech.cjs", () => {
  const webPreferencesMatch = source.match(/webPreferences:\s*\{[^}]*preload:\s*([A-Za-z0-9_]+|"[^"]*"|'[^']*')/);
  assert.ok(webPreferencesMatch, "expected a preload value in webPreferences");
  const preloadValue = webPreferencesMatch[1];
  // A bare identifier means the path is built from a constant elsewhere in the file (e.g.
  // `path.join(__dirname, "src", "speech", "preload-speech.cjs")`) — resolve it there instead of
  // requiring the literal to be inlined in webPreferences itself.
  const isIdentifier = /^[A-Za-z0-9_]+$/.test(preloadValue) && !preloadValue.startsWith('"') && !preloadValue.startsWith("'");
  const target = isIdentifier
    ? (source.match(new RegExp(`const\\s+${preloadValue}\\s*=([^;]+);`)) ?? [, ""])[1]
    : preloadValue;
  assert.match(target, /["']speech["']/, "preload path must live under the speech/ directory");
  assert.match(target, /["']preload-speech\.cjs["']/, "preload path must point at preload-speech.cjs");
});
