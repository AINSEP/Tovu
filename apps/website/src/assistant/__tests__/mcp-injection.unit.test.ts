import assert from "node:assert/strict";
import { realpathSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { resolveMcpJsonInjection } from "../mcp-injection.js";

// Located independently of the code under test: walk from this file to the repo's own
// node_modules link rather than going through `require.resolve`.
const SERVE_JS = realpathSync(
  fileURLToPath(new URL("../../../../../node_modules/@jini-ai/mcp/dist/bin/serve.js", import.meta.url)),
);
const DAEMON_URL = "http://127.0.0.1:4242";

// 2026-10-01 desktop incident: inside the packaged app `execPath` is the Tovu Electron binary. Without
// ELECTRON_RUN_AS_NODE it boots as a GUI app, never speaks MCP, and every run gets zero Tovu tools.
test("under Electron, launches the bridge with the app binary and ELECTRON_RUN_AS_NODE=1", () => {
  const injection = resolveMcpJsonInjection(DAEMON_URL, {
    execPath: "/Applications/Tovu.app/Contents/MacOS/Tovu",
    electronVersion: "33.2.0",
    env: {},
  });

  assert.equal(injection.command, "/Applications/Tovu.app/Contents/MacOS/Tovu");
  assert.deepEqual(injection.args, [SERVE_JS]);
  assert.deepEqual(injection.env, { ELECTRON_RUN_AS_NODE: "1" });
  assert.equal(injection.daemonUrl, DAEMON_URL);
});

test("treats an inherited ELECTRON_RUN_AS_NODE as Electron even without process.versions.electron", () => {
  const injection = resolveMcpJsonInjection(DAEMON_URL, {
    execPath: "/Applications/Tovu.app/Contents/MacOS/Tovu",
    electronVersion: undefined,
    env: { ELECTRON_RUN_AS_NODE: "1" },
  });

  assert.deepEqual(injection.env, { ELECTRON_RUN_AS_NODE: "1" });
});

test("under plain Node, launches the bridge with node and adds no env", () => {
  const injection = resolveMcpJsonInjection(DAEMON_URL, {
    execPath: "/usr/local/bin/node",
    electronVersion: undefined,
    env: { PATH: "/usr/bin" },
  });

  assert.equal(injection.command, "/usr/local/bin/node");
  assert.deepEqual(injection.args, [SERVE_JS]);
  assert.equal(injection.env, undefined);
  assert.equal("env" in injection, false);
});

test("defaults to this process's own runtime", () => {
  const injection = resolveMcpJsonInjection(DAEMON_URL);

  assert.equal(injection.command, process.execPath);
  // The test runner is plain Node.
  assert.equal("env" in injection, false);
});
