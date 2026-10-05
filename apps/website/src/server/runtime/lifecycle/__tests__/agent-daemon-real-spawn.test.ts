import assert from "node:assert/strict";
import { spawn as realSpawn, type ChildProcess } from "node:child_process";
import childProcessDefault, * as childProcess from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { mock } from "node:test";
import * as daemonPort from "../agent-daemon-port.js";

let stubPath: string;
let child: ChildProcess | undefined;
let report: Promise<Record<string, unknown>>;
// The namespace carries a runtime `default` key its type omits; it is passed separately below.
const childProcessExports: Record<string, unknown> = { ...childProcess };
delete childProcessExports.default;
// Represent an already-resolved proxy port independently of inherited env. An omitted
// daemonPortOverride must fail, even though the child still inherits a different port.
mock.module(new URL("../agent-daemon-port.ts", import.meta.url).href, {
  namedExports: { ...daemonPort, getAgentDaemonPortForSpawnEnv: () => "9999" },
});
// Keep the production start -> spawnRealDaemonProcessFor -> spawn chain and its real
// env/argv options. Substitute only the daemon script at the OS boundary, so this never
// starts a dev server, invokes npx, or opens a real site's stores.
mock.module("node:child_process", {
  defaultExport: childProcessDefault,
  namedExports: {
    ...childProcessExports,
    spawn: (command: string, args: string[], options: Parameters<typeof realSpawn>[2]) => {
      const daemonArgs = command === process.execPath ? args : args.slice(1);
      assert.ok(daemonArgs[0]?.endsWith("agent-daemon-server.ts") || daemonArgs[0]?.endsWith("agent-daemon-server.js"));
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
    },
  },
});
const { startAssistantDaemon, shutdownAssistantDaemon, resetAssistantDaemonSingletonForTests } = await import("../daemon-supervisor.js");

test("startAssistantDaemon passes the resolved port, site, socket and identity through the real spawn env", { timeout: 10_000 }, async () => {
  const fixture = mkdtempSync(path.join(tmpdir(), "tovu-daemon-spawn-"));
  const keys = ["JINI_AGENT_DAEMON_URL", "JINI_AGENT_DAEMON_PORT", "TOVU_SITE_DIR", "TOVU_THEMES_DIR", "TOVU_PG_SOCKET"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  resetAssistantDaemonSingletonForTests();
  try {
    for (const key of keys) delete process.env[key];
    process.env.JINI_AGENT_DAEMON_PORT = "4320";
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
      registerProcessSignalHandlers: false,
    });
    assert.deepEqual(await report!, {
      argv: ["--workspace", "workspace-stub"], port: "9999", site: "/site/stub",
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
