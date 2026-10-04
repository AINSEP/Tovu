/** Observe native process failures through startTovuServer's public handle and cleanup. */
import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";
import type { TestContext } from "node:test";

import { startTovuServer } from "./tovu-server.ts";

interface FakeChild extends EventEmitter {
  pid: number;
  stdout: PassThrough;
  stderr: PassThrough;
  exitCode: number | null;
  signalCode: NodeJS.Signals | null;
  kill(signal?: NodeJS.Signals | number): boolean;
}

function fixture({ t }: { t: TestContext }) {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-server-failures-"));
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));
  fs.writeFileSync(path.join(repoRoot, "package.json"), JSON.stringify({ bin: { tovu: "cli.js" } }));
  fs.writeFileSync(path.join(repoRoot, "cli.js"), "");
  const child = Object.assign(new EventEmitter(), {
    pid: 424242, stdout: new PassThrough(), stderr: new PassThrough(),
    exitCode: null as number | null, signalCode: null as NodeJS.Signals | null,
    kill: (_signal?: NodeJS.Signals | number) => true,
  }) satisfies FakeChild;
  const mirror = { stdout: new PassThrough(), stderr: new PassThrough() };
  t.after(() => {
    if (child.exitCode === null && child.signalCode === null) {
      child.exitCode = 0;
      child.emit("exit", 0, null);
    }
    child.stdout.destroy(); child.stderr.destroy(); mirror.stdout.destroy(); mirror.stderr.destroy();
  });
  return { child, input: { repoRoot, siteDir: path.join(repoRoot, "site"), port: 4321,
    spawnFn: () => child, baseEnv: {}, mirror, readyTimeoutMs: 1000, stopGraceMs: 10_000 } };
}

test("a native spawn error preserves its cause and rejects only after child cleanup", { timeout: 2000 }, async (t) => {
  const f = fixture({ t });
  const error = Object.assign(new Error("spawn fixture EACCES"), { code: "EACCES" });
  const killed: unknown[] = [];
  f.child.kill = (signal) => { killed.push(signal); return true; };
  let rejected = false;
  const started = startTovuServer({ ...f.input, platform: "linux" });
  const checked = assert.rejects(started, (actual) => {
    rejected = true;
    assert.equal(actual, error, "the caller needs the native failure, not a generic boot timeout");
    return true;
  });
  f.child.emit("error", error);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(killed, ["SIGTERM"]);
  assert.equal(rejected, false, "cleanup must finish before startup rejection becomes visible");
  f.child.signalCode = "SIGTERM";
  f.child.emit("exit", null, "SIGTERM");
  await checked;
  assert.equal(rejected, true);
});

test("an error after readiness cannot replace the handle, and the supervisor still receives exit", async (t) => {
  const f = fixture({ t });
  const started = startTovuServer(f.input);
  f.child.stdout.write("tovu serve: dir=/fixture port=4321 schemaVersion=58 workspaceId=fixture\n");
  const handle = await started;
  const seen: unknown[] = [];
  handle.onExit((exit) => { seen.push(exit); });
  f.child.emit("error", new Error("late child error"));
  f.child.exitCode = 7;
  f.child.emit("exit", 7, null);
  assert.equal(await started, handle);
  assert.equal(handle.adminUrl, "http://127.0.0.1:4321/admin/");
  assert.deepEqual(seen, [{ code: 7, signal: null }]);
});

test("the default Windows stop invokes taskkill for the whole tree and waits for child exit", { timeout: 2000 }, async (t) => {
  const f = fixture({ t });
  const taskkills: unknown[] = [];
  const patched = t.mock.method(childProcess, "execFileSync", (...args: unknown[]) => { taskkills.push(args); return Buffer.alloc(0); });
  syncBuiltinESMExports();
  t.after(() => { patched.mock.restore(); syncBuiltinESMExports(); });
  const directKills: unknown[] = [];
  f.child.kill = (signal) => { directKills.push(signal); return true; };
  const started = startTovuServer({ ...f.input, platform: "win32" });
  f.child.stdout.write("tovu serve: dir=/fixture port=4321 schemaVersion=58 workspaceId=fixture\n");
  const handle = await started;
  let stopped = false;
  const stopping = handle.stop().then(() => { stopped = true; });
  assert.deepEqual(taskkills, [["taskkill", ["/pid", String(f.child.pid), "/T", "/F"], { stdio: "ignore" }]]);
  assert.deepEqual(directKills, [], "direct termination would orphan the agent daemon");
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(stopped, false);
  f.child.signalCode = "SIGKILL";
  f.child.emit("exit", null, "SIGKILL");
  await stopping;
  assert.equal(stopped, true);
  await handle.stop();
  assert.equal(taskkills.length, 1, "an already exited tree is not killed again");
});
