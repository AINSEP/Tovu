/**
 * @file Direct tests for `mac-on-device-transcriber.ts` with injected dependencies, plus a
 * darwin-only contract check against the compiled Swift helper.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { ensureHelperCompiled, checkAvailability, transcribeWav, parseHelperJson, createMacOnDeviceTranscriptionPort, DEFAULT_SOURCE_PATH } from "./mac-on-device-transcriber.ts";
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
  const operations: unknown[] = [];
  const mkdirSync = fs.mkdirSync;
  fs.mkdirSync = (p, opts) => {
    operations.push(["mkdir", p, opts]);
    return mkdirSync(p, opts);
  };
  const spawnSync = (cmd: string, args: string[]) => {
    operations.push([cmd, args]);
    fs.exists.add("/speech/.build/helper");
    return { status: 0, stderr: "" };
  };
  const deps = { fs, spawnSync, sourcePath: "/speech/src.swift", binaryPath: "/speech/.build/helper" };
  const result = ensureHelperCompiled(deps);
  assert.deepEqual(result, { ok: true });
  assert.equal(fs.calls.mkdirSync[0]![0], "/speech/.build");
  assert.deepEqual(ensureHelperCompiled(deps), { ok: true });
  assert.deepEqual(operations, [
    ["mkdir", "/speech/.build", { recursive: true }],
    ["swiftc", ["-O", "/speech/src.swift", "-o", "/speech/.build/helper"]],
  ]);
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
  const wav = Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0xff, 0x80]);
  const calledArgs: [string, string[]][] = [];
  const execFileAsync = async (binaryPath: string, args: string[]) => {
    calledArgs.push([binaryPath, args]);
    assert.deepEqual(fs.calls.writeFileSync, [[args[1], wav]]);
    assert.equal(fs.exists.has(args[1]!), true);
    return { stdout: '{"ok":true,"text":"publish the homepage","elapsedMs":1234}' };
  };
  const deps = { fs, spawnSync: (): any => {}, execFileAsync, sourcePath: "/s.swift", binaryPath: "/b", tempFilePath: () => "/tmp/rec.wav" }; // any: an unreached spawnSync stub (the binary exists, so swiftc never runs) that returns nothing

  const result = await transcribeWav(wav, deps);

  assert.deepEqual(result, { text: "publish the homepage", elapsedMs: 1234 });
  assert.deepEqual(calledArgs[0], ["/b", ["transcribe", "/tmp/rec.wav"]]);
  assert.equal(fs.calls.writeFileSync[0]![0], "/tmp/rec.wav");
  assert.deepEqual(fs.calls.writeFileSync[0]![1], wav);
});

test("transcribeWav always removes the temp file, even when the helper reports a failure", async () => {
  const fs = fakeFs({ existing: ["/b"] });
  const execFileAsync = async () => ({ stdout: '{"ok":false,"error":"on-device-recognition-unavailable"}' });
  const deps = { fs, spawnSync: (): any => {}, execFileAsync, sourcePath: "/s.swift", binaryPath: "/b", tempFilePath: () => "/tmp/rec.wav" }; // any: an unreached spawnSync stub (the binary exists, so swiftc never runs) that returns nothing

  await assert.rejects(() => transcribeWav(Buffer.from("x"), deps), /on-device-recognition-unavailable/);
  assert.equal(fs.exists.has("/tmp/rec.wav"), false);
  assert.deepEqual(fs.calls.rmSync[0], ["/tmp/rec.wav", { force: true }]);
});

test("transcribeWav preserves structured failure stdout from a nonzero helper exit and removes the temp file", async () => {
  const fs = fakeFs({ existing: ["/b"] });
  const execFileAsync = async () => {
    throw Object.assign(new Error("Command failed: /b transcribe /tmp/rec.wav"), {
      code: 1,
      stdout: '{"ok":false,"error":"on-device-recognition-unavailable"}',
    });
  };
  const deps = { fs, spawnSync: () => assert.fail("already compiled"), execFileAsync, sourcePath: "/s.swift", binaryPath: "/b", tempFilePath: () => "/tmp/rec.wav" };

  await assert.rejects(() => transcribeWav(Buffer.from("x"), deps), /recognition failed \(on-device-recognition-unavailable\)/);
  assert.equal(fs.exists.has("/tmp/rec.wav"), false);
  assert.deepEqual(fs.calls.rmSync, [["/tmp/rec.wav", { force: true }]]);
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

test("the real Swift helper check command emits the availability JSON contract", { skip: process.platform !== "darwin", timeout: 60000 }, (t) => {
  const toolchain = spawnSync("swiftc", ["--version"], { encoding: "utf8", timeout: 10000 });
  if (toolchain.error?.code === "ENOENT") {
    t.skip("Swift toolchain is not installed");
    return;
  }
  assert.equal(toolchain.status, 0, toolchain.stderr);
  const buildDir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-speech-contract-"));
  t.after(() => fs.rmSync(buildDir, { recursive: true, force: true }));
  const binaryPath = path.join(buildDir, "helper");
  const compiled = spawnSync("swiftc", ["-module-cache-path", path.join(buildDir, "cache"), DEFAULT_SOURCE_PATH, "-o", binaryPath], { encoding: "utf8", timeout: 30000 });
  assert.equal(compiled.status, 0, compiled.stderr);
  const checked = spawnSync(binaryPath, ["check"], { encoding: "utf8", timeout: 20000 });
  assert.equal(checked.status, 0, checked.stderr);
  const payload = parseHelperJson(checked.stdout);
  assert.deepEqual(Object.keys(payload).sort(), ["available", "reason"]);
  assert.equal(typeof payload.available, "boolean");
  if (payload.available) assert.equal(payload.reason, null);
  else assert.equal(typeof payload.reason, "string");
});
