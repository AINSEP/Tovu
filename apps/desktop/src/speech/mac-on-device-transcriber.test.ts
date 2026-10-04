/**
 * @file Direct tests for `mac-on-device-transcriber.ts` with injected dependencies, plus a
 * darwin-only contract check against the compiled Swift helper.
 */
import test, { after, before, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync, type SpawnSyncReturns } from "node:child_process";

import { ensureHelperCompiled, checkAvailability, transcribeWav, parseHelperJson } from "@jini-ai/desktop-host/speech/macos";
import { createMacOnDeviceTranscriptionPort, speechHelperSourcePath, macTranscriberMessages, DEFAULT_BINARY_PATH } from "./mac-on-device-transcriber.ts";
const policy = { compilerPath: "swiftc", locale: "en-US", messages: macTranscriberMessages };

/** Exercise the same compiler result against installed 0.4.0 and the pending async release.
 * The legacy fake is retained only until the published package switches process contracts. */
function compilerPorts({ spawnSync }: { spawnSync: () => { status: number | null; stderr?: Buffer | string; error?: NodeJS.ErrnoException } }) {
  return {
    spawnSync,
    execFileAsync: async ({ file }: { file: string; args: string[] }) => {
      assert.equal(file, "swiftc", "must not invoke the helper after a compiler failure");
      const result = spawnSync();
      if (result.error) throw result.error;
      if (result.status !== 0) throw Object.assign(new Error("compiler failed"), { stderr: result.stderr });
      return { stdout: "" };
    },
  };
}

/** A minimal fake `fs` recording every call it receives, backed by an in-memory existence set. */
function fakeFs({ existing = [] }: { existing?: string[] } = { existing: [] }) {
  const exists = new Set(existing);
  const calls: { mkdirSync: [string, unknown][]; writeFileSync: [string, unknown][]; rmSync: [string, unknown][] } = { mkdirSync: [], writeFileSync: [], rmSync: [] };
  return {
    calls,
    exists,
    existsSync: ({ path: p }: { path: string }) => exists.has(p),
    mkdirSync: ({ path: p }: { path: string }, opts?: unknown) => calls.mkdirSync.push([p, opts]),
    writeFileSync: ({ path: p, data }: { path: string; data: unknown }) => {
      calls.writeFileSync.push([p, data]);
      exists.add(p);
    },
    rmSync: ({ path: p }: { path: string }, opts?: unknown) => {
      calls.rmSync.push([p, opts]);
      exists.delete(p);
    },
  };
}

test("ensureHelperCompiled is a no-op when the binary already exists", async () => {
  const fs = fakeFs({ existing: ["/bin/helper"] });
  const spawnSync = () => assert.fail("must not compile when already built");
  const result = await ensureHelperCompiled({ fs, ...compilerPorts({ spawnSync }), ...policy, sourcePath: "/src.swift", binaryPath: "/bin/helper" });
  assert.deepEqual(result, { ok: true });
});

test("ensureHelperCompiled reports a clear reason when swiftc is not installed", async () => {
  const fs = fakeFs();
  const spawnSync = () => ({ status: null, stderr: "", error: Object.assign(new Error("not found"), { code: "ENOENT" }) });
  const result = await ensureHelperCompiled({ fs, ...compilerPorts({ spawnSync }), ...policy, sourcePath: "/src.swift", binaryPath: "/bin/helper" });
  assert.equal(result.ok, false);
  assert.match(result.error, /swiftc-not-found/);
});

test("ensureHelperCompiled reports the compiler's own stderr on a failed build", async () => {
  const fs = fakeFs();
  const spawnSync = () => ({ status: 1, stderr: Buffer.from("error: syntax error") });
  const result = await ensureHelperCompiled({ fs, ...compilerPorts({ spawnSync }), ...policy, sourcePath: "/src.swift", binaryPath: "/bin/helper" });
  assert.equal(result.ok, false);
  assert.match(result.error, /syntax error/);
});

test("ensureHelperCompiled compiles once and creates the parent directory first", async () => {
  const fs = fakeFs();
  const operations: unknown[] = [];
  const mkdirSync = fs.mkdirSync;
  fs.mkdirSync = (p, opts) => {
    operations.push(["mkdir", p.path, opts]);
    return mkdirSync(p, opts);
  };
  const spawnSync = ({ command: cmd, args }: { command: string; args: string[] }) => {
    operations.push([cmd, args]);
    fs.exists.add("/speech/.build/helper");
    return { status: 0, stderr: "" };
  };
  const deps = { fs, spawnSync, execFileAsync: async ({ file, args }: { file: string; args: string[] }) => {
    const result = spawnSync({ command: file, args });
    assert.equal(result.status, 0);
    return { stdout: "" };
  }, ...policy, sourcePath: "/speech/src.swift", binaryPath: "/speech/.build/helper" };
  const result = await ensureHelperCompiled(deps);
  assert.deepEqual(result, { ok: true });
  assert.equal(fs.calls.mkdirSync[0]![0], "/speech/.build");
  assert.deepEqual(await ensureHelperCompiled(deps), { ok: true });
  assert.deepEqual(operations, [
    ["mkdir", "/speech/.build", { recursive: true }],
    ["swiftc", ["-O", "/speech/src.swift", "-o", "/speech/.build/helper"]],
  ]);
});

test("parseHelperJson throws a message that includes the raw stdout on malformed output", () => {
  assert.throws(() => parseHelperJson({ stdout: "not json", invalidOutput: macTranscriberMessages.invalidOutput }), /not json/);
});

test("checkAvailability reports unavailable without spawning the helper when compilation fails", async () => {
  const fs = fakeFs();
  const spawnSync = () => ({ status: null, error: Object.assign(new Error("not found"), { code: "ENOENT" }) });
  const result = await checkAvailability({ fs, ...compilerPorts({ spawnSync }), ...policy, sourcePath: "/s.swift", binaryPath: "/b" });
  assert.equal(result.available, false);
  assert.match(result.reason!, /swiftc-not-found/);
});

test("checkAvailability relays the helper's own available:true payload", async () => {
  const fs = fakeFs({ existing: ["/b"] });
  const execFileAsync = async () => ({ stdout: '{"available":true,"reason":null}' });
  const result = await checkAvailability({ fs, spawnSync: () => assert.fail("already compiled"), execFileAsync, ...policy, sourcePath: "/s.swift", binaryPath: "/b" }); // The binary exists, so the compile stub must remain unreached.
  assert.deepEqual(result, { available: true, reason: undefined });
});

test("checkAvailability relays the helper's own available:false reason (e.g. on-device assets missing)", async () => {
  const fs = fakeFs({ existing: ["/b"] });
  const execFileAsync = async () => ({ stdout: '{"available":false,"reason":"on-device-recognition-unavailable"}' });
  const result = await checkAvailability({ fs, spawnSync: () => assert.fail("already compiled"), execFileAsync, ...policy, sourcePath: "/s.swift", binaryPath: "/b" }); // The binary exists, so the compile stub must remain unreached.
  assert.deepEqual(result, { available: false, reason: "on-device-recognition-unavailable" });
});

test("transcribeWav writes the buffer to the temp path, calls the helper, and returns its text", async () => {
  const fs = fakeFs({ existing: ["/b"] });
  const wav = Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0xff, 0x80]);
  const calledArgs: [string, string[]][] = [];
  const execFileAsync = async ({ file: binaryPath, args }: { file: string; args: string[] }) => {
    calledArgs.push([binaryPath, args]);
    assert.deepEqual(fs.calls.writeFileSync, [[args[1], wav]]);
    assert.equal(fs.exists.has(args[1]!), true);
    return { stdout: '{"ok":true,"text":"publish the homepage","elapsedMs":1234}' };
  };
  const deps = { fs, spawnSync: () => assert.fail("already compiled"), execFileAsync, ...policy, sourcePath: "/s.swift", binaryPath: "/b", tempFilePath: () => "/tmp/rec.wav" }; // The binary exists, so the compile stub must remain unreached.

  const result = await transcribeWav({ wavBuffer: wav, ...deps });

  assert.deepEqual(result, { text: "publish the homepage", elapsedMs: 1234 });
  assert.deepEqual(calledArgs[0], ["/b", ["transcribe", "/tmp/rec.wav", "en-US"]]);
  assert.equal(fs.calls.writeFileSync[0]![0], "/tmp/rec.wav");
  assert.deepEqual(fs.calls.writeFileSync[0]![1], wav);
});

test("transcribeWav always removes the temp file, even when the helper reports a failure", async () => {
  const fs = fakeFs({ existing: ["/b"] });
  const execFileAsync = async () => ({ stdout: '{"ok":false,"error":"on-device-recognition-unavailable"}' });
  const deps = { fs, spawnSync: () => assert.fail("already compiled"), execFileAsync, ...policy, sourcePath: "/s.swift", binaryPath: "/b", tempFilePath: () => "/tmp/rec.wav" }; // The binary exists, so the compile stub must remain unreached.

  await assert.rejects(() => transcribeWav({ wavBuffer: Buffer.from("x"), ...deps }), /on-device-recognition-unavailable/);
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
  const deps = { fs, spawnSync: () => assert.fail("already compiled"), execFileAsync, ...policy, sourcePath: "/s.swift", binaryPath: "/b", tempFilePath: () => "/tmp/rec.wav" };

  await assert.rejects(() => transcribeWav({ wavBuffer: Buffer.from("x"), ...deps }), /recognition failed \(on-device-recognition-unavailable\)/);
  assert.equal(fs.exists.has("/tmp/rec.wav"), false);
  assert.deepEqual(fs.calls.rmSync, [["/tmp/rec.wav", { force: true }]]);
});

test("transcribeWav always removes the temp file even when the child process itself rejects with no JSON", async () => {
  const fs = fakeFs({ existing: ["/b"] });
  const execFileAsync = async () => {
    throw new Error("spawn EACCES");
  };
  const deps = { fs, spawnSync: () => assert.fail("already compiled"), execFileAsync, ...policy, sourcePath: "/s.swift", binaryPath: "/b", tempFilePath: () => "/tmp/rec.wav" }; // The binary exists, so the compile stub must remain unreached.

  await assert.rejects(() => transcribeWav({ wavBuffer: Buffer.from("x"), ...deps }), /EACCES/);
  assert.equal(fs.exists.has("/tmp/rec.wav"), false);
});

test("transcribeWav rejects without writing a temp file when compilation itself fails", async () => {
  const fs = fakeFs();
  const spawnSync = () => ({ status: null, error: Object.assign(new Error("not found"), { code: "ENOENT" }) });
  const deps = { fs, ...compilerPorts({ spawnSync }), ...policy, sourcePath: "/s.swift", binaryPath: "/b", tempFilePath: () => "/tmp/rec.wav" };

  await assert.rejects(() => transcribeWav({ wavBuffer: Buffer.from("x"), ...deps }), /swiftc-not-found/);
  assert.equal(fs.calls.writeFileSync.length, 0);
});

test("createMacOnDeviceTranscriptionPort composes overrides into a working port end to end", async () => {
  const fs = fakeFs({ existing: ["/b"] });
  const execFileAsync = async ({ args }: { file: string; args: string[] }) =>
    args[0] === "check"
      ? { stdout: '{"available":true,"reason":null}' }
      : { stdout: '{"ok":true,"text":"hello","elapsedMs":50}' };
  const port = createMacOnDeviceTranscriptionPort({}, { fs, spawnSync: () => assert.fail("already compiled"), execFileAsync, sourcePath: "/s.swift", binaryPath: "/b", tempFilePath: () => "/t.wav" }); // The binary exists, so the compile stub must remain unreached.

  assert.deepEqual(await port.isAvailable(), { available: true, reason: undefined });
  assert.deepEqual(await port.transcribe({ wavBuffer: Buffer.from("x") }), { text: "hello", elapsedMs: 50 });
});

// Compiling the helper is fixture setup with its own budget, so the contract test times only the
// helper's `check`. A cold first `swiftc` launch pays the xcrun shim lookup (~9s with
// `xcrun_nocache=1`, ~12s under suite load) plus a module build into this empty cache (~9s);
// warm, both are ~1s. The product pays this once: ensureHelperCompiled caches the binary at
// DEFAULT_BINARY_PATH and every later availability check only runs it (~0.5s).
describe("the real Swift helper (darwin toolchain)", { skip: process.platform !== "darwin" }, () => {
  let buildDir = "";
  let compiled: SpawnSyncReturns<string> | undefined;
  before(() => {
    buildDir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-speech-contract-"));
    compiled = spawnSync("swiftc", ["-module-cache-path", path.join(buildDir, "cache"), speechHelperSourcePath({}), "-o", path.join(buildDir, "helper")], { encoding: "utf8", timeout: 110000 });
  }, { timeout: 120000 });
  after(() => fs.rmSync(buildDir, { recursive: true, force: true }));

  test("the real Swift helper check command emits the availability JSON contract", { timeout: 30000 }, (t) => {
    if (compiled?.error && "code" in compiled.error && compiled.error.code === "ENOENT") {
      t.skip("Swift toolchain is not installed");
      return;
    }
    assert.equal(compiled?.status, 0, compiled?.stderr || String(compiled?.error));
    const checked = spawnSync(path.join(buildDir, "helper"), ["check", "en-US"], { encoding: "utf8", timeout: 20000 });
    assert.equal(checked.status, 0, checked.stderr);
    const payload = parseHelperJson({ stdout: checked.stdout, invalidOutput: macTranscriberMessages.invalidOutput });
    assert.deepEqual(Object.keys(payload).sort(), ["available", "reason"]);
    assert.equal(typeof payload.available, "boolean");
    if (payload.available) assert.equal(payload.reason, null);
    else assert.equal(typeof payload.reason, "string");
  });
});

// REGRESSION: fails if the legacy helper cache is reused for the explicit-locale protocol.
test("the default native helper uses a separate protocol cache and preserves en-US", async () => {
  assert.equal(path.basename(DEFAULT_BINARY_PATH), "tovu-speech-helper");
  assert.equal(path.basename(path.dirname(DEFAULT_BINARY_PATH)), "jini-v1");
  const calls: unknown[] = [];
  const port = createMacOnDeviceTranscriptionPort({}, {
    fs: fakeFs({ existing: [DEFAULT_BINARY_PATH] }),
    spawnSync: () => assert.fail("already compiled"),
    execFileAsync: async ({ file, args }) => {
      calls.push([file, args]);
      return { stdout: '{"available":true,"reason":null}' };
    },
    sourcePath: "/source.swift", tempFilePath: () => "/unused.wav",
  });
  assert.deepEqual(await port.isAvailable(), { available: true, reason: undefined });
  assert.deepEqual(calls, [[DEFAULT_BINARY_PATH, ["check", "en-US"]]]);
});

// REGRESSION: fails if helper JSON primitives are accepted as protocol payloads.
test("helper JSON must be an object, with the original host error wording", () => {
  for (const stdout of ["null", "[]", "1", '"hello"']) {
    assert.throws(() => parseHelperJson({ stdout, invalidOutput: macTranscriberMessages.invalidOutput }), {
      name: "Error", message: `tovu speech: helper printed non-JSON output: ${stdout}`,
    });
  }
});

// REGRESSION: fails if truthy availability or malformed recognition fields are accepted.
test("helper availability and transcription field types fail closed", async () => {
  const fs = fakeFs({ existing: ["/b"] });
  const base = { fs, spawnSync: () => assert.fail("already compiled"), ...policy,
    sourcePath: "/s.swift", binaryPath: "/b", tempFilePath: () => "/tmp/rec.wav" };
  for (const stdout of ['{"available":"true"}', '{"available":false,"reason":1}']) {
    await assert.rejects(() => checkAvailability({ ...base, execFileAsync: async () => ({ stdout }) }),
      /tovu speech: helper printed non-JSON output/);
  }
  for (const stdout of ['{"ok":true,"text":1}', '{"ok":true,"elapsedMs":"1"}']) {
    await assert.rejects(() => transcribeWav({ ...base, wavBuffer: Buffer.from("x"),
      execFileAsync: async () => ({ stdout }) }), /tovu speech: helper printed non-JSON output/);
    assert.equal(fs.exists.has("/tmp/rec.wav"), false);
  }
});

// REGRESSION: fails if scratch-file write failures leave recorded audio behind.
test("a failed scratch write still attempts to remove the recording", async () => {
  const fs = fakeFs({ existing: ["/b"] });
  fs.writeFileSync = ({ path: p }) => {
    fs.exists.add(p);
    throw new Error("partial write");
  };
  const deps = { fs, spawnSync: () => assert.fail("already compiled"),
    execFileAsync: () => assert.fail("write failed"), ...policy,
    sourcePath: "/s.swift", binaryPath: "/b", tempFilePath: () => "/tmp/rec.wav" };
  await assert.rejects(() => transcribeWav({ wavBuffer: Buffer.from("x"), ...deps }), /partial write/);
  assert.equal(fs.exists.has("/tmp/rec.wav"), false);
  assert.deepEqual(fs.calls.rmSync, [["/tmp/rec.wav", { force: true }]]);
});

// REGRESSION: fails if the native capability check requests Speech authorization.
test("the published helper probes without prompting and cancels timed-out recognition", () => {
  const source = fs.readFileSync(speechHelperSourcePath({}), "utf8");
  const checkBody = source.slice(source.indexOf("func runCheck("), source.indexOf("func runTranscribe("));
  assert.match(checkBody, /SFSpeechRecognizer\.authorizationStatus\(\)/);
  assert.doesNotMatch(checkBody, /resolveSpeechAuthorization|requestAuthorization/);
  assert.match(source, /if !completed\s*\{\s*task\.cancel\(\)/);
  assert.match(source, /request\.requiresOnDeviceRecognition = true/);
});

// REGRESSION: fails if whitespace-only compiler diagnostics bypass the fallback message.
test("blank compiler diagnostics use the host's unknown-error wording", async () => {
  const result = await ensureHelperCompiled({ fs: fakeFs(),
    ...compilerPorts({ spawnSync: () => ({ status: 1, stderr: "   " }) }), ...policy,
    sourcePath: "/src.swift", binaryPath: "/bin/helper" });
  assert.deepEqual(result, { ok: false, error: "swiftc-failed: unknown compiler error" });
});
