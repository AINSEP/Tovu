/**
 * @file Static-analysis tests for the Electron entry's (`src/main/index.ts`, formerly `main.ts`) speech
 * feature wiring. `main.ts` requires
 * `"electron"` at module scope, which resolves to a path string (not the real API) outside a real
 * Electron process — `require`-ing it under plain `node --test` would crash immediately without
 * proving anything (same constraint `preload-speech.test.ts` documents for its own file). What IS
 * testable without Electron is its SOURCE TEXT: whether `createWindow` hands the window module the
 * compiled speech preload, and whether `registerSpeechIpc` is handed the real `ipcMain` and the
 * shell-page sender check. That the preload reaches the
 * window's `webPreferences` is tested through the real module in `src/main/windows/app-window.test.ts`.
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

const MAIN_PATH = path.join(__dirname, "main", "index.ts");
const source = fs.readFileSync(MAIN_PATH, "utf8");

// WHEN it runs (before any boot mode can open a window, so an early isAvailable() call never races an
// unregistered channel) is tested through `src/main/boot/boot-sequence.ts`'s `runDesktopBoot`, whose
// `registerAppWideIpc` step this call belongs to. What stays text is the call's own arguments.
test("main.ts calls registerSpeechIpc with the real ipcMain and the shell-page sender check", () => {
  // The real ipcMain, the shell-page sender check, and no injected `port` — a port here would
  // replace the real recognizer. `window-navigation-policy.test.ts` pins what `isShellPage` checks.
  assert.match(source, /registerSpeechIpc\(\s*\{\s*ipcMain,\s*isTrustedSender: isShellPage\s*\}\s*\)/);
});

// `createWindow` hands `SPEECH_PRELOAD_PATH` to `src/main/windows/app-window.ts`, whose test pins that
// it lands in `webPreferences.preload`. The constant itself lives in the entry, so this stays text.
test("createWindow's preload is the compiled speech preload, dist/speech/preload-speech.cjs", () => {
  const createWindowSource = source.slice(source.indexOf("function createWindow("), source.indexOf("function openSitesHomeWindow("));
  assert.match(createWindowSource, /preloadPath: SPEECH_PRELOAD_PATH/, "createWindow must hand the speech preload to the window module");
  const constant = source.match(/const\s+SPEECH_PRELOAD_PATH\s*=([^;]+);/);
  assert.ok(constant, "expected the SPEECH_PRELOAD_PATH constant in the entry");
  // `dist/speech/preload-speech.cjs` is what `tsconfig.preload.json` emits for
  // `src/speech/preload-speech.cts` (`preload-speech.test.ts` asserts that half); pointing at the
  // `.cts` source, or at the old hand-written `src/speech/preload-speech.cjs`, fails here.
  assert.match(
    constant[1] ?? "",
    /["']dist["']\s*,\s*["']speech["']\s*,\s*["']preload-speech\.cjs["']/,
    "preload path must be the compiled dist/speech/preload-speech.cjs",
  );
});
