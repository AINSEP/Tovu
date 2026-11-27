import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test, { mock } from "node:test";

/**
 * @file The default win32 tree-kill (`taskkill /pid <pid> /T /F` under `%SystemRoot%`) used by
 * `createDaemonSupervisor` when no `killTree` is injected. `node:child_process` is the OS boundary
 * and is module-mocked for this file only, so no taskkill (or any process) ever runs; the module
 * under test is imported after the mock and is itself real.
 */

const execCalls: unknown[][] = [];
let execFailure: Error | undefined;
const realChildProcess = await import("node:child_process");
mock.module("node:child_process", {
  namedExports: {
    ...realChildProcess,
    execFileSync: (...args: unknown[]) => { execCalls.push(args); if (execFailure) throw execFailure; return Buffer.alloc(0); },
  },
});
const { createDaemonSupervisor } = await import("../daemon-supervisor.js");

function startedOnWin32() {
  const killed: (NodeJS.Signals | undefined)[] = [];
  const supervisor = createDaemonSupervisor({
    spawnDaemonProcess: () => Object.assign(new EventEmitter(), { pid: 4321, kill: (signal?: NodeJS.Signals) => { killed.push(signal); return true; } }),
    platform: "win32", log: () => {}, scheduler: { schedule: () => () => {} },
  });
  supervisor.start();
  return { supervisor, killed };
}

test.beforeEach(() => { execCalls.length = 0; execFailure = undefined; });

test("win32 shutdown runs taskkill /T /F for the child's pid from %SystemRoot%\\System32", t => {
  const saved = process.env.SystemRoot;
  process.env.SystemRoot = "D:\\WinRoot";
  t.after(() => { if (saved === undefined) delete process.env.SystemRoot; else process.env.SystemRoot = saved; });
  const { supervisor, killed } = startedOnWin32();
  supervisor.shutdown();
  assert.deepEqual(execCalls, [["D:\\WinRoot\\System32\\taskkill.exe", ["/pid", "4321", "/T", "/F"], { stdio: "ignore" }]]);
  assert.deepEqual(killed, [], "a successful tree-kill needs no direct child signal");
});

test("without %SystemRoot% taskkill is taken from C:\\Windows; a failed taskkill falls back to SIGTERM on the child", t => {
  const saved = process.env.SystemRoot;
  delete process.env.SystemRoot;
  t.after(() => { if (saved !== undefined) process.env.SystemRoot = saved; });
  execFailure = new Error("taskkill: not found");
  const { supervisor, killed } = startedOnWin32();
  supervisor.shutdown();
  assert.deepEqual(execCalls, [["C:\\Windows\\System32\\taskkill.exe", ["/pid", "4321", "/T", "/F"], { stdio: "ignore" }]]);
  assert.deepEqual(killed, ["SIGTERM"]);
});
