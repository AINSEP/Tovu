/**
 * @file Direct tests for `transcription-port.js`'s platform-selection logic. No Electron, no real
 * macOS port — `createMacPort` is a plain injected factory here.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { resolveTranscriptionPort, unavailablePort } from "./transcription-port.ts";

test("unavailablePort reports itself unavailable with the given reason", async () => {
  const port = unavailablePort("some-reason");
  assert.deepEqual(await port.isAvailable(), { available: false, reason: "some-reason" });
});

test("unavailablePort's transcribe() rejects rather than returning a fake transcript", async () => {
  const port = unavailablePort("some-reason");
  await assert.rejects(() => port.transcribe(Buffer.from([])), /some-reason/);
});

test("resolveTranscriptionPort returns the mac port on darwin", () => {
  const macPort = { isAvailable: async () => ({ available: true }), transcribe: async () => ({ text: "", elapsedMs: 0 }) };
  const port = resolveTranscriptionPort({ platform: "darwin", createMacPort: () => macPort });
  assert.equal(port, macPort);
});

test("resolveTranscriptionPort never calls createMacPort on a non-darwin platform", () => {
  let called = false;
  const port = resolveTranscriptionPort({ platform: "win32", createMacPort: () => { called = true; return unavailablePort("unused"); } });
  assert.equal(called, false);
  assert.equal(typeof port.isAvailable, "function");
});

test("resolveTranscriptionPort's non-darwin port names the actual platform in its reason", async () => {
  const port = resolveTranscriptionPort({ platform: "win32", createMacPort: () => unavailablePort("unused") });
  const availability = await port.isAvailable();
  assert.equal(availability.available, false);
  assert.match(availability.reason!, /unsupported-platform:win32/);
});
