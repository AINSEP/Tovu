/**
 * The default Windows tree killer (`taskkillTree`): what it asks the OS for, and what Stop does when
 * taskkill is absent. The OS boundary (`resolveOnPath`, `execFileSync`) is module-mocked because the
 * real one would kill a real process tree; `startTovuServer` itself runs for real.
 */
import assert from "node:assert/strict";
import * as childProcess from "node:child_process";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";
import * as agentRuntime from "@jini-ai/agent-runtime";

type ExecCall = { command: string; args: readonly string[]; options: unknown };
const execCalls: ExecCall[] = [];
let taskkillPath: string | null = "C:\\Windows\\System32\\taskkill.exe";
const lookups: string[] = [];

test.mock.module("@jini-ai/agent-runtime", { exports: { ...agentRuntime,
  resolveOnPath: ({ bin }: { bin: string }) => { lookups.push(bin); return taskkillPath; } } });
test.mock.module("node:child_process", { exports: { ...childProcess,
  execFileSync: (command: string, args: readonly string[], options: unknown) => { execCalls.push({ command, args, options }); return Buffer.alloc(0); } } });
const { startTovuServer } = await import("./tovu-server.ts");

interface FakeChild extends EventEmitter {
  stdout: PassThrough; stderr: PassThrough; pid: number; exitCode: number | null; signalCode: NodeJS.Signals | null;
  killed: NodeJS.Signals[]; kill(signal?: NodeJS.Signals): boolean;
}

function fakeChild(): FakeChild {
  const child = new EventEmitter() as FakeChild;
  Object.assign(child, { stdout: new PassThrough(), stderr: new PassThrough(), pid: 31337, exitCode: null, signalCode: null, killed: [] });
  child.kill = (signal) => { child.killed.push(signal!); queueMicrotask(() => child.emit("exit", null, signal ?? "SIGTERM")); return true; };
  return child;
}

function bootTimeout(t: test.TestContext, child: FakeChild) {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-taskkill-"));
  fs.writeFileSync(path.join(repoRoot, "package.json"), JSON.stringify({ bin: { tovu: "dist/src/cli/main.js" } }));
  fs.mkdirSync(path.join(repoRoot, "dist", "src", "cli"), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, "dist", "src", "cli", "main.js"), "");
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));
  return startTovuServer({ repoRoot, siteDir: "/fake/site", port: 3602, baseEnv: {}, platform: "win32",
    mirror: { stdout: new PassThrough(), stderr: new PassThrough() }, spawnFn: () => child, readyTimeoutMs: 20, stopGraceMs: 50 });
}

test("on win32 without an injected killer, Stop runs taskkill /T /F on the child's own pid", async (t) => {
  execCalls.length = 0; lookups.length = 0; taskkillPath = "C:\\Windows\\System32\\taskkill.exe";
  const child = fakeChild();
  setTimeout(() => child.emit("exit", null, "SIGKILL"), 30); // the tree kill ends the child
  await assert.rejects(bootTimeout(t, child), /did not report a port within 20ms/);
  assert.deepEqual(lookups, ["taskkill"]);
  assert.deepEqual(execCalls, [{ command: "C:\\Windows\\System32\\taskkill.exe", args: ["/pid", "31337", "/T", "/F"], options: { stdio: "ignore" } }]);
  assert.deepEqual(child.killed, [], "the tree kill went first; no direct-child kill was needed");
});

test("on win32 with no taskkill on PATH, Stop falls back to killing the direct child and never execs", async (t) => {
  execCalls.length = 0; lookups.length = 0; taskkillPath = null;
  const child = fakeChild();
  await assert.rejects(bootTimeout(t, child), /did not report a port within 20ms/);
  assert.deepEqual(lookups, ["taskkill"]);
  assert.deepEqual(execCalls, []);
  assert.deepEqual(child.killed, ["SIGTERM"], "the direct child is terminated instead");
});
