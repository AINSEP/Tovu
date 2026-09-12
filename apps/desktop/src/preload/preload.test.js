/**
 * @file Drift guard for the two speech channel literals inlined in `preload.mts`.
 *
 * Mirrors `src/speech/preload-speech.test.js` exactly — same regex-over-source approach, same
 * source of truth (`speech-ipc.js`'s own exports), for the same reason: two preloads now expose
 * `window.tovuVoice` (the sandboxed `.cjs` one on site-admin windows, this ESM one on the sites home
 * window), and a channel rename that updated only one of them would leave the mic silently dead on
 * whichever window was missed.
 *
 * Reads the `.mts` SOURCE rather than the compiled `dist/preload/preload.mjs`, so the guard works
 * in a checkout that has not been built. The `tovuRunner` half of that file needs no guard here:
 * its channel names are imported from `src/contracts/*.ts`, so `npm run typecheck` already catches
 * a rename, and `src/runner-ipc-stubs.test.js` covers the main-process side.
 *
 * The bridging itself is deliberately not tested: `contextBridge.exposeInMainWorld` only runs
 * inside Electron's real preload context, exactly as `preload-speech.test.js`'s own header
 * records.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { IPC_CHANNEL_IS_AVAILABLE, IPC_CHANNEL_TRANSCRIBE } from "../speech/speech-ipc.js";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const source = fs.readFileSync(path.join(__dirname, "preload.mts"), "utf8");

test("preload.mts's inlined IPC_CHANNEL_IS_AVAILABLE literal matches speech-ipc.js's own export", () => {
  const match = source.match(/IPC_CHANNEL_IS_AVAILABLE\s*=\s*["']([^"']+)["']/);
  assert.ok(match, "expected an inlined IPC_CHANNEL_IS_AVAILABLE string literal in preload.mts");
  assert.equal(match[1], IPC_CHANNEL_IS_AVAILABLE);
});

test("preload.mts's inlined IPC_CHANNEL_TRANSCRIBE literal matches speech-ipc.js's own export", () => {
  const match = source.match(/IPC_CHANNEL_TRANSCRIBE\s*=\s*["']([^"']+)["']/);
  assert.ok(match, "expected an inlined IPC_CHANNEL_TRANSCRIBE string literal in preload.mts");
  assert.equal(match[1], IPC_CHANNEL_TRANSCRIBE);
});

test("preload.mts exposes both bridges — dropping either is what the port had to avoid", () => {
  assert.match(source, /contextBridge\.exposeInMainWorld\(\s*'tovuRunner'/);
  assert.match(source, /contextBridge\.exposeInMainWorld\(\s*'tovuVoice'/);
});
