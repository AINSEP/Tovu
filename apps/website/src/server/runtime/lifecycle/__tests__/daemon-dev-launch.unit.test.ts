import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter, once } from "node:events";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";
import { createRealDaemonProcessPorts } from "../daemon-supervisor.js";

interface SpawnCapture { command: string; args: string[]; options: { env?: NodeJS.ProcessEnv } }

/** Capture the source-mode daemon spawn without starting a process. */
function captureDaemonSpawn(): SpawnCapture {
  let captured: SpawnCapture | undefined;
  const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough() });
  const ports = createRealDaemonProcessPorts({ workspaceId: "ws-dev-launch", siteDir: path.join(tmpdir(), "tovu-dev-launch-site"), daemonPortOverride: undefined }, {
    spawn: (input) => { captured = input as SpawnCapture; return child as unknown as ChildProcess; },
  });
  ports.spawnDaemonProcess();
  assert.ok(captured);
  return captured;
}

/** Values following each `--import` flag, in order. */
function importValues(args: string[]): string[] {
  return args.flatMap((arg, index) => (arg === "--import" ? [args[index + 1]] : []));
}

/** Run the captured argv with the daemon script swapped for a probe; returns the probe's report and the spawned pid. */
async function runProbe(capture: SpawnCapture, env: NodeJS.ProcessEnv): Promise<{ report: { pid: number; maps: boolean }; childPid: number }> {
  const dir = mkdtempSync(path.join(tmpdir(), "tovu-dev-launch-"));
  const probe = path.join(dir, "probe.mjs");
  writeFileSync(probe, "console.log(JSON.stringify({ pid: process.pid, maps: process.sourceMapsEnabled }));\n");
  const args = capture.args.map(arg => (/agent-daemon-server\.[jt]s$/.test(arg) ? probe : arg));
  // The prune preload is exercised elsewhere; keep this test off the shared tsx cache.
  const child = spawn(capture.command, args, { env: { ...env, TOVU_TSX_CACHE_PRUNE: "0" }, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  let errors = "";
  child.stdout.on("data", chunk => { output += String(chunk); });
  child.stderr.on("data", chunk => { errors += String(chunk); });
  try {
    const [code] = await once(child, "exit");
    assert.equal(code, 0, errors);
    return { report: JSON.parse(output.trim().split("\n").at(-1)!), childPid: child.pid! };
  } finally {
    if (child.exitCode === null) child.kill();
    rmSync(dir, { recursive: true, force: true });
  }
}

test("source-mode daemon runs under --import tsx in one process, not the tsx/cli relauncher", () => {
  const { command, args } = captureDaemonSpawn();
  assert.equal(command, process.execPath);
  assert.ok(!args.some(arg => /tsx[\\/]dist[\\/]cli\.mjs$/.test(arg) || arg.endsWith("tsx/cli")), args.join(" "));
  const imports = importValues(args);
  assert.equal(imports.length, 3, args.join(" "));
  for (const value of imports) assert.equal(new URL(value).protocol, "file:", value);
  assert.match(imports[0], /prune-tsx-cache\.mjs\?prune$/);
  assert.match(imports[1], /tsx\/dist\/loader\.mjs$/);
  assert.match(imports[2], /dev-source-maps-off\.mjs$/);
});

test("source-mode daemon is a single OS process with source maps off", { timeout: 30_000 }, async () => {
  const capture = captureDaemonSpawn();
  const env = { ...capture.options.env };
  delete env.TOVU_DEV_SOURCE_MAPS;
  const { report, childPid } = await runProbe(capture, env);
  assert.equal(report.pid, childPid, "the daemon script must run in the spawned process itself");
  assert.equal(report.maps, false);
});

test("TOVU_DEV_SOURCE_MAPS=1 keeps source maps on for the dev daemon", { timeout: 30_000 }, async () => {
  const capture = captureDaemonSpawn();
  const { report } = await runProbe(capture, { ...capture.options.env, TOVU_DEV_SOURCE_MAPS: "1" });
  assert.equal(report.maps, true);
});
