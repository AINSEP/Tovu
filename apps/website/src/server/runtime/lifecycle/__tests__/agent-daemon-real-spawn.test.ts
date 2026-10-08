import assert from "node:assert/strict";
import { spawn as realSpawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { ensureAgentDaemonPortResolved, getAgentDaemonPortForSpawnEnv } from "../agent-daemon-port.js";

let stubPath: string;
let child: ChildProcess | undefined;
let report: Promise<Record<string, unknown>>;
// Represent an already-resolved proxy port and assert the native spawn receives that value.
// An omitted daemonPortOverride must fail: the parent keeps its allocated port out of its env.
// Keep the production start -> createRealDaemonProcessPorts -> spawn chain and its real
// env/argv options. Substitute only the daemon script at the OS boundary, so this never
// starts a dev server, invokes npx, or opens a real site's stores.
const nativeSpawn: NonNullable<import("../daemon-supervisor.js").StartAssistantDaemonOptions["nativeSpawn"]> = ({ command, args, options }) => {
  const daemonArgs = command === process.execPath ? args : args.slice(1);
  assert.ok(daemonArgs[0]?.endsWith("agent-daemon-server.ts") || daemonArgs[0]?.endsWith("agent-daemon-server.js"));
  assert.equal(options.env?.JINI_AGENT_DAEMON_PORT, getAgentDaemonPortForSpawnEnv());
  child = realSpawn(process.execPath, [stubPath, ...daemonArgs.slice(1)], options);
  report = new Promise((resolve, reject) => {
    let output = "";
    child!.once("error", reject);
    child!.stdout!.on("data", (chunk) => {
      output += String(chunk);
      if (output.includes("\n")) resolve(JSON.parse(output.split("\n")[0]!));
    });
  });
  return child;
};
const { startAssistantDaemon, shutdownAssistantDaemon, resetAssistantDaemonSingletonForTests } = await import("../daemon-supervisor.js");

test("startAssistantDaemon passes the resolved port, site, socket and identity through the real spawn env", { timeout: 10_000 }, async () => {
  const fixture = mkdtempSync(path.join(tmpdir(), "tovu-daemon-spawn-"));
  const keys = ["JINI_AGENT_DAEMON_URL", "JINI_AGENT_DAEMON_PORT", "TOVU_SITE_DIR", "TOVU_THEMES_DIR", "TOVU_PG_SOCKET"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  resetAssistantDaemonSingletonForTests();
  try {
    for (const key of keys) delete process.env[key];
    await ensureAgentDaemonPortResolved();
    const resolvedPort = getAgentDaemonPortForSpawnEnv();
    assert.ok(resolvedPort, "the proxy must resolve its own port before spawning");
    process.env.TOVU_THEMES_DIR = "/custom/themes";
    stubPath = path.join(fixture, "daemon-stub.cjs");
    writeFileSync(stubPath, `
      console.log(JSON.stringify({
        argv: process.argv.slice(2),
        port: process.env.JINI_AGENT_DAEMON_PORT,
        site: process.env.TOVU_SITE_DIR,
        workspace: process.env.TOVU_WORKSPACE,
        parent: process.env.TOVU_PARENT_PID,
        socket: process.env.TOVU_PG_SOCKET,
        themes: process.env.TOVU_THEMES_DIR,
      }));
      setInterval(() => {}, 1000);
    `);
    startAssistantDaemon({ workspaceId: "workspace-stub", siteDir: "/site/stub", pgSocketPath: "/tmp/stub/.s.PGSQL.5432" }, {
      registerProcessSignalHandlers: false, nativeSpawn,
    });
    assert.deepEqual(await report!, {
      argv: ["--workspace", "workspace-stub"], port: resolvedPort, site: "/site/stub",
      workspace: "workspace-stub", parent: String(process.pid), socket: "/tmp/stub/.s.PGSQL.5432", themes: "/custom/themes",
    });
  } finally {
    const exited = child && new Promise<void>((resolve) => child!.once("exit", () => resolve()));
    shutdownAssistantDaemon();
    if (exited) await exited;
    resetAssistantDaemonSingletonForTests();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(fixture, { recursive: true, force: true });
  }
});
