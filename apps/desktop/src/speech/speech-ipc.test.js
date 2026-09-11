/**
 * @file Direct tests for `speech-ipc.js`. No real Electron `ipcMain` — a tiny fake that records
 * `handle(channel, fn)` registrations and lets the test invoke them directly, plus an injected
 * fake port so no real recognizer or filesystem is touched.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { registerSpeechIpc, IPC_CHANNEL_IS_AVAILABLE, IPC_CHANNEL_TRANSCRIBE } from "./speech-ipc.js";

function fakeIpcMain() {
  const handlers = new Map();
  return {
    handlers,
    handle: (channel, fn) => handlers.set(channel, fn),
  };
}

test("registerSpeechIpc registers both channels", () => {
  const ipcMain = fakeIpcMain();
  registerSpeechIpc({ ipcMain, port: { isAvailable: async () => ({ available: true }), transcribe: async () => ({ text: "", elapsedMs: 0 }) } });
  assert.equal(typeof ipcMain.handlers.get(IPC_CHANNEL_IS_AVAILABLE), "function");
  assert.equal(typeof ipcMain.handlers.get(IPC_CHANNEL_TRANSCRIBE), "function");
});

test("the isAvailable handler relays the injected port's result verbatim", async () => {
  const ipcMain = fakeIpcMain();
  const port = { isAvailable: async () => ({ available: false, reason: "on-device-recognition-unavailable" }), transcribe: async () => assert.fail() };
  registerSpeechIpc({ ipcMain, port });

  const result = await ipcMain.handlers.get(IPC_CHANNEL_IS_AVAILABLE)();
  assert.deepEqual(result, { available: false, reason: "on-device-recognition-unavailable" });
});

test("the transcribe handler encodes the incoming samples to WAV before handing them to the port", async () => {
  const ipcMain = fakeIpcMain();
  let receivedWav;
  const port = {
    isAvailable: async () => assert.fail(),
    transcribe: async (wavBuffer) => {
      receivedWav = wavBuffer;
      return { text: "ok", elapsedMs: 10 };
    },
  };
  registerSpeechIpc({ ipcMain, port });

  const result = await ipcMain.handlers.get(IPC_CHANNEL_TRANSCRIBE)({}, [0, 0.5, -0.5], 16000);

  assert.deepEqual(result, { text: "ok", elapsedMs: 10 });
  // 44-byte WAV header + 3 samples * 2 bytes each.
  assert.equal(receivedWav.length, 44 + 6);
  assert.equal(receivedWav.toString("ascii", 0, 4), "RIFF");
});

test("a rejected transcribe from the port propagates to the IPC caller rather than being swallowed", async () => {
  const ipcMain = fakeIpcMain();
  const port = { isAvailable: async () => assert.fail(), transcribe: async () => { throw new Error("recognition failed"); } };
  registerSpeechIpc({ ipcMain, port });

  await assert.rejects(() => ipcMain.handlers.get(IPC_CHANNEL_TRANSCRIBE)({}, [0], 16000), /recognition failed/);
});
