/** Speech bridge adoption and host exposure guards for the sites-home preload. */
// Both the site-admin CommonJS preload and sites-home ESM preload expose voice; a namespace
// rename applied to only one leaves that window's mic silently dead. Keep speech-ipc.ts as the
// host channel authority. Reading source keeps these adoption checks usable before a build;
// real contextBridge exposure still requires Electron's preload context.
// Shared bridge rationale: Jini/packages/desktop-host/src/speech/speech-bridge.ts.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { register } from "tsx/esm/api";

import { IPC_CHANNEL_IS_AVAILABLE, IPC_CHANNEL_TRANSCRIBE } from "../speech/speech-ipc.ts";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const source = fs.readFileSync(path.join(__dirname, "preload.mts"), "utf8");

test("preload.mts uses the shared speech bridge with the Tovu channel namespace", () => {
  assert.match(source, /createSpeechBridge/);
  assert.match(source, /channelNamespace: 'tovu:speech'/);
  assert.equal(IPC_CHANNEL_IS_AVAILABLE, "tovu:speech:isAvailable");
  assert.equal(IPC_CHANNEL_TRANSCRIBE, "tovu:speech:transcribe");
});

test("preload.mts exposes both bridges — dropping either is what the port had to avoid", () => {
  assert.match(source, /contextBridge\.exposeInMainWorld\(\s*'tovuRunner'/);
  assert.match(source, /contextBridge\.exposeInMainWorld\(\s*'tovuVoice'/);
});

// PARITY: both renderer bridges remain exposed and the ESM voice bridge preserves positional IPC.
test("the ESM preload exposes runner and voice and forwards the exact speech payload", async (t) => {
  // Resolve the preload's emitted .js contract paths back to TypeScript source under Node.
  const unregister = register();
  t.after(unregister);
  const exposed = new Map<string, Record<string, (...args: unknown[]) => unknown>>();
  const invokes: unknown[][] = [];
  const availability = { available: true };
  const transcription = { text: "hello", elapsedMs: 7 };
  t.mock.module("electron", {
    namedExports: {
      contextBridge: { exposeInMainWorld: (name: string, bridge: Record<string, (...args: unknown[]) => unknown>) => exposed.set(name, bridge) },
      ipcRenderer: { invoke: async (channel: string, ...args: unknown[]) => {
        invokes.push([channel, ...args]);
        return channel === IPC_CHANNEL_IS_AVAILABLE ? availability : transcription;
      } },
      webFrame: {}, webUtils: {},
    },
  });
  await import("./preload.mts");
  assert.deepEqual([...exposed.keys()], ["tovuRunner", "tovuVoice"]);
  const voice = exposed.get("tovuVoice")!;
  assert.deepEqual(Object.keys(voice), ["isAvailable", "transcribe"]);
  assert.equal(await voice.isAvailable!(), availability);
  const samples = new Float32Array([0.1, -0.2]);
  assert.equal(await voice.transcribe!(samples, 48000), transcription);
  assert.deepEqual(invokes, [[IPC_CHANNEL_IS_AVAILABLE], [IPC_CHANNEL_TRANSCRIBE, samples, 48000]]);
  assert.equal(invokes[1]![1], samples);
});
