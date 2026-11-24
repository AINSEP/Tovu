/**
 * @file Direct tests for `@jini-ai/desktop-host/speech`'s platform selection bound with Tovu wording. No Electron, no real
 * macOS port — `createMacPort` is a plain injected factory here.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { resolveTranscriptionPort as resolvePort, unavailablePort as unavailable, type TranscriptionPort } from "@jini-ai/desktop-host/speech";
import { SPEECH_HOST } from "./speech-host-config.ts";
// Tovu's wording bound onto the Jini selector, exactly as `SPEECH_HOST` feeds it in production.
const unavailablePort = ({ reason }: { reason: string }) => unavailable({ reason, message: SPEECH_HOST.transcriptionMessages.unavailable });
const resolveTranscriptionPort = (args: { platform: NodeJS.Platform; createMacPort: () => TranscriptionPort }) => resolvePort({ ...args, messages: SPEECH_HOST.transcriptionMessages });

test("unavailablePort reports itself unavailable with the given reason", async () => {
  const port = unavailablePort({ reason: "some-reason" });
  assert.deepEqual(await port.isAvailable(), { available: false, reason: "some-reason" });
});

test("unavailablePort's transcribe() rejects rather than returning a fake transcript", async () => {
  const port = unavailablePort({ reason: "some-reason" });
  await assert.rejects(() => port.transcribe({ wavBuffer: Buffer.from([]) }), /some-reason/);
});

test("resolveTranscriptionPort returns the mac port on darwin", () => {
  const macPort = { isAvailable: async () => ({ available: true }), transcribe: async () => ({ text: "", elapsedMs: 0 }) };
  const port = resolveTranscriptionPort({ platform: "darwin", createMacPort: () => macPort });
  assert.equal(port, macPort);
});

test("resolveTranscriptionPort never calls createMacPort on a non-darwin platform", () => {
  let called = false;
  const port = resolveTranscriptionPort({ platform: "win32", createMacPort: () => { called = true; return unavailablePort({ reason: "unused" }); } });
  assert.equal(called, false);
  assert.equal(typeof port.isAvailable, "function");
});

test("resolveTranscriptionPort's non-darwin port names the actual platform in its reason", async () => {
  const port = resolveTranscriptionPort({ platform: "win32", createMacPort: () => unavailablePort({ reason: "unused" }) });
  const availability = await port.isAvailable();
  assert.equal(availability.available, false);
  assert.match(availability.reason!, /unsupported-platform:win32/);
});
