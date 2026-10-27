import assert from "node:assert/strict";
import test from "node:test";

import { DELEGATED_TOOL_CALLS_PATH, isRunScopedRoute } from "../daemon-access.js";

/**
 * @file `isRunScopedRoute` — which daemon routes a run-scoped credential (as opposed to the host's
 * full daemon token) may reach. The allow-list is method + exact path shape, so a matching path
 * under the wrong method, a deeper path, or an unlisted route must all be refused.
 */

test("each allow-listed run-scoped route is accepted for its own method", () => {
  for (const [method, path] of [
    ["GET", "/api/runs/run-1"],
    ["POST", "/api/runs/run-1/cancel"],
    ["GET", "/api/tools/some_tool"],
    ["GET", "/api/components/recharts.bar-chart"],
    ["GET", "/api/active"],
    ["GET", "/api/agents"],
    ["POST", DELEGATED_TOOL_CALLS_PATH],
  ] as const) {
    assert.equal(isRunScopedRoute({ method, path }), true, `${method} ${path}`);
  }
});

test("a listed path under another method, a deeper path, and an unlisted route are refused", () => {
  for (const [method, path] of [
    ["DELETE", "/api/runs/run-1"],
    ["GET", "/api/runs/run-1/cancel"],
    ["GET", "/api/tools/a/b"],
    ["POST", "/api/runs"],
    ["GET", "/api/settings"],
  ] as const) {
    assert.equal(isRunScopedRoute({ method, path }), false, `${method} ${path}`);
  }
});

/**
 * `TOVU_TOOL_EXEC_TOKEN` (ADR-070): the server-side tool RPC secret lives in module memory, never in
 * `process.env`, so no `...process.env` child (plugin hosts, the import fork, CLI agents) inherits it.
 * Each test imports a fresh module instance (`?case=`) because the holder is module state.
 */
async function freshDaemonAccess(caseName: string): Promise<typeof import("../daemon-access.js")> {
  return import(`../daemon-access.js?case=${caseName}`);
}

test("ensureToolExecToken mints once, keeps it in module memory, and never writes any env", async () => {
  const access = await freshDaemonAccess("mint");
  const env: NodeJS.ProcessEnv = {};
  assert.equal(access.currentToolExecToken(), undefined);
  const token = access.ensureToolExecToken({ env });
  assert.match(token, /^[0-9a-f]{64}$/);
  assert.equal(access.ensureToolExecToken({ env }), token);
  assert.equal(access.currentToolExecToken(), token);
  assert.deepEqual(env, {});
  assert.equal(process.env[access.TOOL_EXEC_TOKEN_ENV_VAR], undefined);
  assert.ok(!Object.values(process.env).includes(token));
});

test("an operator-set TOVU_TOOL_EXEC_TOKEN is adopted and removed from the env it came from", async () => {
  const access = await freshDaemonAccess("operator");
  const env: NodeJS.ProcessEnv = { TOVU_TOOL_EXEC_TOKEN: "operator-secret" };
  assert.equal(access.ensureToolExecToken({ env }), "operator-secret");
  assert.equal(access.currentToolExecToken(), "operator-secret");
  assert.equal(env.TOVU_TOOL_EXEC_TOKEN, undefined);
});

test("a CLI agent's allow-listed env never carries the tool-exec token", async () => {
  const { selectAgentExecutorHostEnv } = await import("@jini-ai/daemon");
  const access = await freshDaemonAccess("cli-env");
  const token = access.ensureToolExecToken({});
  const agentEnv = selectAgentExecutorHostEnv({ env: { ...process.env, [access.TOOL_EXEC_TOKEN_ENV_VAR]: token } });
  assert.equal(agentEnv[access.TOOL_EXEC_TOKEN_ENV_VAR], undefined);
  assert.ok(!Object.values(agentEnv).includes(token));
});

/**
 * `registerDaemonAttachmentLookup`: the daemon's lookup route carries its own full-daemon-token gate
 * ahead of its own 64 KB parser, so it is safe whatever the daemon mounts after it (its global parser).
 */
async function withLookupDaemon<T>(fn: (input: { url: string; parserCalls: () => number; env: NodeJS.ProcessEnv }) => Promise<T>): Promise<T> {
  const express = (await import("express")).default;
  const access = await freshDaemonAccess("lookup");
  const env: NodeJS.ProcessEnv = { [access.AGENT_DAEMON_TOKEN_ENV_VAR]: "daemon-secret" };
  const app = express();
  const store = {
    resolveForRun: async ({ ref, runId }: { ref: string; runId: string }) => ({ ref, runId, path: "/tmp/x" }),
    listPendingForOwner: async () => [],
  };
  access.registerDaemonAttachmentLookup({ app, store: store as never }, { env });
  let parsed = 0;
  app.use((req, res, next) => { parsed += 1; next(); });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address() as { port: number };
  try {
    return await fn({ url: `http://127.0.0.1:${port}/internal/attachment-lookup`, parserCalls: () => parsed, env });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const lookupBody = JSON.stringify({ op: "resolveForRun", ref: "att-1", runId: "run-1" });

test("the daemon attachment lookup refuses an unauthenticated caller before any later parser runs", async () => {
  await withLookupDaemon(async ({ url, parserCalls }) => {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: lookupBody });
    assert.equal(res.status, 401);
    assert.equal(parserCalls(), 0);
  });
});

test("the daemon attachment lookup refuses a run-scoped credential and answers the full daemon token", async () => {
  await withLookupDaemon(async ({ url, parserCalls }) => {
    const access = await freshDaemonAccess("lookup");
    const runScoped = access.createRunScopedCredentials({ principalOfLiveRun: () => "owner-1" }).mint({ runId: "run-1" });
    const refused = await fetch(url, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${runScoped}` }, body: lookupBody });
    assert.equal(refused.status, 401);
    const ok = await fetch(url, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer daemon-secret" }, body: lookupBody });
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), { value: { ref: "att-1", runId: "run-1", path: "/tmp/x" } });
    assert.equal(parserCalls(), 0);
  });
});
