/**
 * @file Direct tests for `mac-on-device-transcriber.js`. No real `swiftc`, no real child process,
 * no real filesystem — every dependency is a fake, injected exactly the way
 * `createMacOnDeviceTranscriptionPort`'s `overrides` parameter is designed for. The real helper
 * binary itself was verified by hand (see this feature's handoff notes for the transcript).
 */
import test from "node:test";
import assert from "node:assert/strict";

import { ensureHelperCompiled, checkAvailability, transcribeWav, parseHelperJson, createMacOnDeviceTranscriptionPort } from "./mac-on-device-transcriber.ts";
import type { MacTranscriberDeps } from "./mac-on-device-transcriber.ts";

/** A minimal fake `fs` recording every call it receives, backed by an in-memory existence set. */
function fakeFs({ existing = [] }: { existing?: string[] } = { existing: [] }) {
  const exists = new Set(existing);
  const calls: { mkdirSync: [string, unknown][]; writeFileSync: [string, unknown][]; rmSync: [string, unknown][] } = { mkdirSync: [], writeFileSync: [], rmSync: [] };
  return {
    calls,
    exists,
    existsSync: (p: string) => exists.has(p),
    mkdirSync: (p: string, opts: unknown) => calls.mkdirSync.push([p, opts]),
    writeFileSync: (p: string, data: unknown) => {
      calls.writeFileSync.push([p, data]);
      exists.add(p);
    },
    rmSync: (p: string, opts: unknown) => {
      calls.rmSync.push([p, opts]);
      exists.delete(p);
    },
  };
}

test("ensureHelperCompiled is a no-op when the binary already exists", () => {
  const fs = fakeFs({ existing: ["/bin/helper"] });
  const spawnSync = () => assert.fail("must not compile when already built");
  const result = ensureHelperCompiled({ fs, spawnSync, sourcePath: "/src.swift", binaryPath: "/bin/helper" });
  assert.deepEqual(result, { ok: true });
});

test("ensureHelperCompiled reports a clear reason when swiftc is not installed", () => {
  const fs = fakeFs();
  const spawnSync = () => ({ status: null, stderr: "", error: Object.assign(new Error("not found"), { code: "ENOENT" }) });
  const result = ensureHelperCompiled({ fs, spawnSync, sourcePath: "/src.swift", binaryPath: "/bin/helper" });
  assert.equal(result.ok, false);
  assert.match(result.error, /swiftc-not-found/);
});

test("ensureHelperCompiled reports the compiler's own stderr on a failed build", () => {
  const fs = fakeFs();
  const spawnSync = () => ({ status: 1, stderr: Buffer.from("error: syntax error") });
  const result = ensureHelperCompiled({ fs, spawnSync, sourcePath: "/src.swift", binaryPath: "/bin/helper" });
  assert.equal(result.ok, false);
  assert.match(result.error, /syntax error/);
});

test("ensureHelperCompiled compiles once and creates the parent directory first", () => {
  const fs = fakeFs();
  const spawnSync = () => ({ status: 0, stderr: "" });
  const result = ensureHelperCompiled({ fs, spawnSync, sourcePath: "/speech/src.swift", binaryPath: "/speech/.build/helper" });
  assert.deepEqual(result, { ok: true });
  assert.equal(fs.calls.mkdirSync[0]![0], "/speech/.build");
});

test("parseHelperJson throws a message that includes the raw stdout on malformed output", () => {
  assert.throws(() => parseHelperJson("not json"), /not json/);
});

test("checkAvailability reports unavailable without spawning the helper when compilation fails", async () => {
  const fs = fakeFs();
  const spawnSync = () => ({ status: null, error: { code: "ENOENT" } as NodeJS.ErrnoException });
  const execFileAsync = () => assert.fail("must not run the helper when compilation failed");
  const result = await checkAvailability({ fs, spawnSync, execFileAsync, sourcePath: "/s.swift", binaryPath: "/b" });
  assert.equal(result.available, false);
  assert.match(result.reason!, /swiftc-not-found/);
});

test("checkAvailability relays the helper's own available:true payload", async () => {
  const fs = fakeFs({ existing: ["/b"] });
  const execFileAsync = async () => ({ stdout: '{"available":true,"reason":null}' });
  const result = await checkAvailability({ fs, spawnSync: (): any => {}, execFileAsync, sourcePath: "/s.swift", binaryPath: "/b" }); // any: an unreached spawnSync stub (the binary exists, so swiftc never runs) that returns nothing
  assert.deepEqual(result, { available: true, reason: undefined });
});

test("checkAvailability relays the helper's own available:false reason (e.g. on-device assets missing)", async () => {
  const fs = fakeFs({ existing: ["/b"] });
  const execFileAsync = async () => ({ stdout: '{"available":false,"reason":"on-device-recognition-unavailable"}' });
  const result = await checkAvailability({ fs, spawnSync: (): any => {}, execFileAsync, sourcePath: "/s.swift", binaryPath: "/b" }); // any: an unreached spawnSync stub (the binary exists, so swiftc never runs) that returns nothing
  assert.deepEqual(result, { available: false, reason: "on-device-recognition-unavailable" });
});

test("transcribeWav writes the buffer to the temp path, calls the helper, and returns its text", async () => {
  const fs = fakeFs({ existing: ["/b"] });
  const calledArgs: [string, string[]][] = [];
  const execFileAsync = async (binaryPath: string, args: string[]) => {
    calledArgs.push([binaryPath, args]);
    return { stdout: '{"ok":true,"text":"publish the homepage","elapsedMs":1234}' };
  };
  const deps = { fs, spawnSync: (): any => {}, execFileAsync, sourcePath: "/s.swift", binaryPath: "/b", tempFilePath: () => "/tmp/rec.wav" }; // any: an unreached spawnSync stub (the binary exists, so swiftc never runs) that returns nothing

  const result = await transcribeWav(Buffer.from("fake-wav-bytes"), deps);

  assert.deepEqual(result, { text: "publish the homepage", elapsedMs: 1234 });
  assert.deepEqual(calledArgs[0], ["/b", ["transcribe", "/tmp/rec.wav"]]);
  assert.equal(fs.calls.writeFileSync[0]![0], "/tmp/rec.wav");
});

test("transcribeWav always removes the temp file, even when the helper reports a failure", async () => {
  const fs = fakeFs({ existing: ["/b"] });
  const execFileAsync = async () => ({ stdout: '{"ok":false,"error":"on-device-recognition-unavailable"}' });
  const deps = { fs, spawnSync: (): any => {}, execFileAsync, sourcePath: "/s.swift", binaryPath: "/b", tempFilePath: () => "/tmp/rec.wav" }; // any: an unreached spawnSync stub (the binary exists, so swiftc never runs) that returns nothing

  await assert.rejects(() => transcribeWav(Buffer.from("x"), deps), /on-device-recognition-unavailable/);
  assert.equal(fs.exists.has("/tmp/rec.wav"), false);
  assert.deepEqual(fs.calls.rmSync[0], ["/tmp/rec.wav", { force: true }]);
});

test("transcribeWav always removes the temp file even when the child process itself rejects with no JSON", async () => {
  const fs = fakeFs({ existing: ["/b"] });
  const execFileAsync = async () => {
    throw new Error("spawn EACCES");
  };
  const deps = { fs, spawnSync: (): any => {}, execFileAsync, sourcePath: "/s.swift", binaryPath: "/b", tempFilePath: () => "/tmp/rec.wav" }; // any: an unreached spawnSync stub (the binary exists, so swiftc never runs) that returns nothing

  await assert.rejects(() => transcribeWav(Buffer.from("x"), deps), /EACCES/);
  assert.equal(fs.exists.has("/tmp/rec.wav"), false);
});

test("transcribeWav rejects without writing a temp file when compilation itself fails", async () => {
  const fs = fakeFs();
  const spawnSync = () => ({ status: null, error: { code: "ENOENT" } as NodeJS.ErrnoException });
  const deps = { fs, spawnSync, execFileAsync: () => assert.fail("must not run"), sourcePath: "/s.swift", binaryPath: "/b", tempFilePath: () => "/tmp/rec.wav" };

  await assert.rejects(() => transcribeWav(Buffer.from("x"), deps), /swiftc-not-found/);
  assert.equal(fs.calls.writeFileSync.length, 0);
});

test("createMacOnDeviceTranscriptionPort composes overrides into a working port end to end", async () => {
  const fs = fakeFs({ existing: ["/b"] });
  const execFileAsync = async (_bin: string, args: string[]) =>
    args[0] === "check"
      ? { stdout: '{"available":true,"reason":null}' }
      : { stdout: '{"ok":true,"text":"hello","elapsedMs":50}' };
  const port = createMacOnDeviceTranscriptionPort({ fs, spawnSync: (): any => {}, execFileAsync, binaryPath: "/b", tempFilePath: () => "/t.wav" }); // any: an unreached spawnSync stub (the binary exists, so swiftc never runs) that returns nothing

  assert.deepEqual(await port.isAvailable(), { available: true, reason: undefined });
  assert.deepEqual(await port.transcribe(Buffer.from("x")), { text: "hello", elapsedMs: 50 });
});
