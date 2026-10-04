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
import ts from "typescript";

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
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const availability = { available: true };
  const transcription = { text: "hello", elapsedMs: 7 };
  t.mock.module("electron", {
    namedExports: {
      contextBridge: { exposeInMainWorld: (name: string, bridge: Record<string, (...args: unknown[]) => unknown>) => exposed.set(name, bridge) },
      ipcRenderer: {
        on(channel: string, handler: (...args: unknown[]) => void) {
          if (!listeners.has(channel)) listeners.set(channel, new Set());
          listeners.get(channel)!.add(handler);
        },
        removeListener(channel: string, handler: (...args: unknown[]) => void) { listeners.get(channel)?.delete(handler); },
        invoke: async (channel: string, ...args: unknown[]) => {
        invokes.push([channel, ...args]);
        return channel === IPC_CHANNEL_IS_AVAILABLE ? availability : transcription;
      } },
      webFrame: {}, webUtils: {},
    },
  });
  await import("./preload.mts");
  assert.deepEqual([...exposed.keys()], ["tovuRunner", "tovuVoice"]);
  const runner = exposed.get("tovuRunner")!;
  const bridgeSource = ts.createSourceFile("runner-api.ts", fs.readFileSync(path.join(__dirname, "../renderer/runner-api.ts"), "utf8"), ts.ScriptTarget.Latest, true);
  const declaration = bridgeSource.statements.find((node): node is ts.InterfaceDeclaration => ts.isInterfaceDeclaration(node) && node.name.text === "RunnerInventoryBridge");
  assert.ok(declaration, "the renderer's bridge contract must be found");
  const expectedKeys = declaration.members.map((member) => member.name!.getText(bridgeSource));
  assert.ok(expectedKeys.length > 30);
  assert.deepEqual(Object.keys(runner).sort(), expectedKeys.sort());
  for (const [method, channel, payload] of [
    ["onFindToggle", "runner:find:toggle", undefined],
    ["onSiteHistory", "runner:sites:history", "back"],
    ["onZoomCommand", "runner:zoom:command", "in"],
  ] as const) {
    const received: unknown[] = [];
    const off = runner[method]!((value: unknown) => received.push(value)) as () => void;
    assert.equal(listeners.get(channel)?.size, 1, `${method} must subscribe to its native channel`);
    for (const handler of listeners.get(channel)!) handler({ sender: "must not cross bridge" }, payload);
    assert.deepEqual(received, [payload]);
    off();
    assert.equal(listeners.get(channel)?.size, 0, `${method} must remove its listener`);
    for (const handler of listeners.get(channel)!) handler({}, payload);
    assert.deepEqual(received, [payload], "no delivery after unsubscribe");
  }
  const voice = exposed.get("tovuVoice")!;
  assert.deepEqual(Object.keys(voice), ["isAvailable", "transcribe"]);
  assert.equal(await voice.isAvailable!(), availability);
  const samples = new Float32Array([0.1, -0.2]);
  assert.equal(await voice.transcribe!(samples, 48000), transcription);
  assert.deepEqual(invokes, [[IPC_CHANNEL_IS_AVAILABLE], [IPC_CHANNEL_TRANSCRIBE, samples, 48000]]);
  assert.equal(invokes[1]![1], samples);
});
