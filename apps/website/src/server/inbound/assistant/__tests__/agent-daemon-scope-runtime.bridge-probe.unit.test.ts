import assert from "node:assert/strict";
import { spawn as spawnChild, type SpawnOptions } from "node:child_process";
import test, { type TestContext } from "node:test";
import { createToolRegistry } from "@jini-ai/core";
import { createScopeBridge, startBridgeProbe } from "../agent-daemon-scope-runtime.js";

/**
 * `startBridgeProbe` takes the process spawner as a port. These tests inject a recording spawner
 * that launches a REAL child (this Node binary running a tiny inline script) in place of the bridge,
 * so the real `probeMcpBridge` initialize handshake runs end to end and the daemon's log line is
 * the observable outcome.
 */
const OK_BRIDGE = `process.stdin.once("data", () => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: 1, result: {} }) + "\\n"));`;
const FAILING_BRIDGE = `process.stderr.write("bridge exploded\\nsecond line"); process.exit(3);`;

function bridgeFixture() {
  const registry = createToolRegistry({});
  const visibleRegistry = createToolRegistry({});
  const tool = (id: string) => ({ descriptor: { id, readOnly: true }, handler: async () => ({}), policy: { authorize: () => "allow" as const } });
  registry.register(tool("site_health"));
  visibleRegistry.register(tool("theme_read_file"));
  return createScopeBridge({ daemonUrl: "http://127.0.0.1:4319", env: {}, registry, visibleRegistry, mintRunCredential: () => "run-cred" });
}

function recordingSpawner(script: string) {
  const calls: Array<{ command: string; args: readonly string[]; env: Record<string, string | undefined> }> = [];
  const spawn = ({ command, args }: { readonly command: string; readonly args: readonly string[] }, optional?: SpawnOptions) => {
    calls.push({ command, args, env: { ...optional?.env } });
    return spawnChild(process.execPath, ["-e", script], { env: optional?.env, stdio: "pipe" });
  };
  return { calls, spawn };
}

async function waitForLog(t: TestContext) {
  const logged: string[] = [];
  const errored: string[] = [];
  t.mock.method(console, "log", (line: string) => { logged.push(line); });
  t.mock.method(console, "error", (line: string) => { errored.push(line); });
  const settled = async () => {
    const deadline = Date.now() + 10_000;
    while (logged.length + errored.length === 0) {
      if (Date.now() > deadline) throw new Error("startBridgeProbe never logged a preflight line");
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    return { logged, errored };
  };
  return settled;
}

test("bridge probe: a bridge that answers initialize logs the ok line on stdout, never stderr", async (t) => {
  const bridge = bridgeFixture();
  const { calls, spawn } = recordingSpawner(OK_BRIDGE);
  const settled = await waitForLog(t);
  startBridgeProbe({ bridgeInjection: bridge, spawn, hostEnv: { PATH: process.env.PATH, HOME: "/home/probe-fixture" } });
  const { logged, errored } = await settled();
  assert.deepEqual(errored, []);
  assert.equal(logged.length, 1);
  assert.match(logged[0] ?? "", /^\[agent-daemon\] jini bridge preflight ok \(\d+ms\)$/);
  // The probe launches the real bridge command, carries the daemon's host env, and is the
  // credential-free preflight entry: no run-scoped startup tool list, no daemon token.
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.command, bridge.command);
  assert.deepEqual(calls[0]?.args, bridge.args ?? []);
  assert.equal(calls[0]?.env.HOME, "/home/probe-fixture");
  assert.equal(calls[0]?.env.JINI_DIAGNOSTIC_TOOL_IDS, JSON.stringify(["site_health"]));
  assert.equal(calls[0]?.env.JINI_STARTUP_TOOL_IDS, undefined);
  assert.equal(calls[0]?.env.JINI_DAEMON_TOKEN, undefined);
});

test("bridge probe: a bridge that exits before initialize logs the FAILED line with its exit code and stderr on stderr", async (t) => {
  const { spawn } = recordingSpawner(FAILING_BRIDGE);
  const settled = await waitForLog(t);
  startBridgeProbe({ bridgeInjection: bridgeFixture(), spawn, hostEnv: { PATH: process.env.PATH } });
  const { logged, errored } = await settled();
  assert.deepEqual(logged, []);
  assert.deepEqual(errored, ["[agent-daemon] jini bridge preflight FAILED (exit=3, signal=null): bridge exploded | second line"]);
});
