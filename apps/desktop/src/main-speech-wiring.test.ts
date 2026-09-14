/**
 * @file Static-analysis tests for `../main.ts`'s speech feature wiring. `main.ts` requires
 * `"electron"` at module scope, which resolves to a path string (not the real API) outside a real
 * Electron process — `require`-ing it under plain `node --test` would crash immediately without
 * proving anything (same constraint `preload-speech.test.ts` documents for its own file). What IS
 * testable without Electron is its SOURCE TEXT: whether `createWindow`'s `webPreferences` actually
 * names a `preload` script, and whether `registerSpeechIpc` is required and invoked early enough
 * that the renderer's `isAvailable()` call never races an unregistered channel.
 *
 * Both `speech-ipc.ts` and `preload-speech.cts` document this exact gap in their own file headers
 * ("Not wired into main.ts yet") — this is the mic's actual failure mode inside the desktop shell:
 * every primitive (preload bridge, IPC handlers, on-device transcriber) is built and independently
 * tested, but nothing in `main.ts` ever connects them, so `window.tovuVoice` never exists even
 * inside Electron and the mic reports "needs the desktop app" while already running in it.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MAIN_PATH = path.join(__dirname, "..", "main.ts");
const source = fs.readFileSync(MAIN_PATH, "utf8");

test("main.ts imports registerSpeechIpc from speech-ipc.ts", () => {
  assert.match(source, /from ["']\.\/src\/speech\/speech-ipc\.ts["']/);
  assert.match(source, /registerSpeechIpc/);
});

test("main.ts calls registerSpeechIpc with the real ipcMain before attach mode's window can load", () => {
  const registerCallIndex = source.indexOf("registerSpeechIpc(");
  const attachBranchIndex = source.indexOf("if (attachUrl)");
  assert.notEqual(registerCallIndex, -1, "expected a registerSpeechIpc(...) call in main.ts");
  assert.notEqual(attachBranchIndex, -1, "expected the attach-mode branch in main.ts");
  assert.ok(
    registerCallIndex < attachBranchIndex,
    "registerSpeechIpc must run before attach mode's window can load, or an early isAvailable() call races an unregistered channel",
  );
  assert.match(source, /registerSpeechIpc\(\s*\{\s*ipcMain\s*\}\s*\)/);
});

test("createWindow's webPreferences names a preload script", () => {
  const createWindowStart = source.indexOf("function createWindow(");
  assert.notEqual(createWindowStart, -1, "expected a createWindow function in main.ts");
  const webPreferencesMatch = source.slice(createWindowStart).match(/webPreferences:\s*\{[^}]*\}/);
  assert.ok(webPreferencesMatch, "expected a webPreferences object in createWindow");
  assert.match(webPreferencesMatch[0], /preload:\s*\S/, "webPreferences must set a preload path");
});

test("the preload path (inline or via a named constant) resolves to the compiled speech preload, dist/speech/preload-speech.cjs", () => {
  const webPreferencesMatch = source.match(/webPreferences:\s*\{[^}]*preload:\s*([A-Za-z0-9_]+|"[^"]*"|'[^']*')/);
  assert.ok(webPreferencesMatch, "expected a preload value in webPreferences");
  const preloadValue = webPreferencesMatch[1]!; // `!`: the pattern's one capture group is not optional, so a match always sets it.
  // A bare identifier means the path is built from a constant elsewhere in the file (e.g.
  // `path.join(__dirname, "dist", "speech", "preload-speech.cjs")`) — resolve it there instead of
  // requiring the literal to be inlined in webPreferences itself.
  const isIdentifier = /^[A-Za-z0-9_]+$/.test(preloadValue) && !preloadValue.startsWith('"') && !preloadValue.startsWith("'");
  // `[1]!` above: a match always sets the non-optional `([^;]+)` group, and the fallback's index 1 is "".
  const target = isIdentifier
    ? (source.match(new RegExp(`const\\s+${preloadValue}\\s*=([^;]+);`)) ?? [, ""])[1]!
    : preloadValue;
  // `dist/speech/preload-speech.cjs` is what `tsconfig.preload.json` emits for
  // `src/speech/preload-speech.cts` (`preload-speech.test.ts` asserts that half); pointing at the
  // `.cts` source, or at the old hand-written `src/speech/preload-speech.cjs`, fails here.
  assert.match(
    target,
    /["']dist["']\s*,\s*["']speech["']\s*,\s*["']preload-speech\.cjs["']/,
    "preload path must be the compiled dist/speech/preload-speech.cjs",
  );
});
