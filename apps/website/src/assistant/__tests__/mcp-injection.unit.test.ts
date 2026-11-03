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
const mintStub = (runId: string): string => `minted-for-${runId}`;

// Inside the packaged app `execPath` is the Tovu Electron binary. Without
// ELECTRON_RUN_AS_NODE it boots as a GUI app, never speaks MCP, and every run gets zero Tovu tools.
test("under Electron, launches the bridge with the app binary and ELECTRON_RUN_AS_NODE=1", () => {
  const injection = resolveMcpJsonInjection(DAEMON_URL, mintStub, {
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
  const injection = resolveMcpJsonInjection(DAEMON_URL, mintStub, {
    execPath: "/Applications/Tovu.app/Contents/MacOS/Tovu",
    electronVersion: undefined,
    env: { ELECTRON_RUN_AS_NODE: "1" },
  });

  assert.deepEqual(injection.env, { ELECTRON_RUN_AS_NODE: "1" });
});

test("under plain Node, launches the bridge with node and adds no env", () => {
  const injection = resolveMcpJsonInjection(DAEMON_URL, mintStub, {
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
  const injection = resolveMcpJsonInjection(DAEMON_URL, mintStub);

  assert.equal(injection.command, process.execPath);
  // The test runner is plain Node.
  assert.equal("env" in injection, false);
});

// Bridge credentials must resolve to the run's principal; a boot-wide proxy token cannot bind a run.
test("hands the bridge the per-run credential minted for that run, never the proxy's boot-wide token", async () => {
  const minted: string[] = [];
  const injection = resolveMcpJsonInjection(DAEMON_URL, (runId) => {
    minted.push(runId);
    return `run-token-${runId}`;
  });
  const bootToken = "b".repeat(64);
  const saved = process.env.TOVU_AGENT_DAEMON_TOKEN;
  process.env.TOVU_AGENT_DAEMON_TOKEN = bootToken;
  try {
    const credential = await injection.credential?.({ runId: "run-42" });

    assert.equal(credential, "run-token-run-42");
    assert.notEqual(credential, bootToken);
    assert.deepEqual(minted, ["run-42"]);
  } finally {
    if (saved === undefined) delete process.env.TOVU_AGENT_DAEMON_TOKEN;
    else process.env.TOVU_AGENT_DAEMON_TOKEN = saved;
  }
});


test("HTTP preparation receives only run-scoped inputs", async () => {
  const assembled: unknown[] = [];
  const hosted: unknown[] = [];
  const injection = resolveMcpJsonInjection(DAEMON_URL, mintStub, {
    execPath: "/node", electronVersion: undefined, env: { TOVU_AGENT_DAEMON_TOKEN: "boot-secret" },
    loadHttpMcp: async () => ({ MCP_HTTP_SESSION_MODE_SUPPORTED: true,
      assembleRunToolHost: async (input, options) => {
        assembled.push({ runId: input.runId, url: await input.resolveBaseUrl(), options });
        return { required: { name: 'test', version: '1', tools: [], resolveBaseUrl: input.resolveBaseUrl }, options: {} };
      },
      startMcpHttpToolServer: async (input, options) => {
        hosted.push({ input, options });
        return { url: "http://127.0.0.1:9000/mcp", token: "listener-only", close: async () => {} };
      },
    }),
  });
  const endpoint = await injection.prepareHttp!({ runId: "run-42" }, { messageRelayNonce: "a".repeat(48), startupToolIds: ['site_guide'], diagnosticToolIds: ['registered'] });
  assert.equal(endpoint.token, "listener-only");
  assert.deepEqual(assembled, [{ runId: "run-42", url: DAEMON_URL, options: {
    credential: "minted-for-run-42", messageRelayNonce: "a".repeat(48), startupToolIds: ['site_guide'], diagnosticToolIds: ['registered'],
  } }]);
  assert.equal(JSON.stringify(hosted).includes("boot-secret"), false);
  assert.equal(JSON.stringify(endpoint).includes("minted-for"), false);
});

test("unavailable HTTP support preserves stdio delivery", async () => {
  const injection = resolveMcpJsonInjection(DAEMON_URL, mintStub, {
    execPath: "/node", electronVersion: undefined, env: {},
    loadHttpMcp: async () => { throw new Error("module unavailable"); },
  });
  await assert.rejects(injection.prepareHttp!({ runId: "run-42" }), /module unavailable/);
  assert.equal(injection.command, "/node");
  assert.deepEqual(injection.args, [SERVE_JS]);
  assert.equal(await injection.credential!({ runId: "run-42" }), "minted-for-run-42");
});

test("stateless HTTP support is refused before minting a callback credential", async () => {
  const minted: string[] = [];
  const injection = resolveMcpJsonInjection(DAEMON_URL, runId => { minted.push(runId); return "callback"; }, {
    execPath: "/node", electronVersion: undefined, env: {},
    loadHttpMcp: async () => ({
      assembleRunToolHost: async () => { throw new Error("must not assemble"); },
      startMcpHttpToolServer: async () => { throw new Error("must not host"); },
    }),
  });
  await assert.rejects(injection.prepareHttp!({ runId: "run-42" }), /session support unavailable/);
  assert.deepEqual(minted, []);
});
