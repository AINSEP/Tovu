import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import test, { type TestContext } from "node:test";
import express from "express";
import { bearerTokenFromHeader } from "@jini-ai/core/contracts/server";
import { AGENT_DAEMON_TOKEN_ENV_VAR, DELEGATED_TOOL_CALLS_PATH, requireAgentDaemonToken } from "#src/assistant/daemon-access";
import { daemonSource, evaluateDaemonStatements } from "./helpers/daemon-source.js";

/**
 * @file The chain every request to the daemon scope passes before a route sees its body, recorded
 * from the real statements of `agent-daemon-scope.ts` (read from its source, in its own order) on
 * a real socket: the token gate, the 6 MB JSON parser, the per-run re-resolve on the tool paths,
 * and the delegated route's second gate that compares the run credential with the parsed body.
 * Two of these gates read the parsed body, so the parser cannot be removed or narrowed without
 * one of the cases below turning red. Only what the chain hands on to (the routes behind it and
 * the credential store) is replaced by recorders.
 */

const PROXY_TOKEN = "proxy-token";
const RUN_TOKEN = "run-token-x";

async function harness(t: TestContext) {
  const app = express();
  const delegated: unknown[] = [];
  const runsEntered: string[] = [];
  /** Counts lookups so a test can revoke the credential part-way down the chain. */
  const credential = { lookups: 0, validForLookups: Number.POSITIVE_INFINITY };
  const runCredentials = { resolveCaller: ({ token }: { token: string }) => {
    if (token !== RUN_TOKEN) return undefined;
    credential.lookups += 1;
    return credential.lookups <= credential.validForLookups ? { runId: "run-x", principalId: "alice" } : undefined;
  } };
  const text = (statement: { getText(source: typeof daemonSource): string }): string => statement.getText(daemonSource);
  const resolver = daemonSource.statements.find(statement => text(statement).startsWith("function resolveDiscoveryCaller("));
  const start = daemonSource.statements.findIndex(statement => text(statement).startsWith("app.use(requireAgentDaemonToken("));
  const end = daemonSource.statements.findIndex(statement => text(statement).startsWith("app.post(DELEGATED_TOOL_CALLS_PATH, requireAgentDaemonToken("));
  assert.ok(resolver && start >= 0 && end > start);
  const chain = daemonSource.statements.slice(start, end + 1);
  assert.deepEqual(chain.map(statement => text(statement).split("(")[0] + "(" + text(statement).split("(")[1]!.split(/[,(){]/)[0]), [
    "app.use(requireAgentDaemonToken", "app.use(express.json", "registerToolAccessLoweringRoute(", 'app.use(["/api/tools"', "app.post(DELEGATED_TOOL_CALLS_PATH",
  ], "token gate, parser, a site-owned route, the per-run re-resolve and the delegated re-check, in this order");
  await evaluateDaemonStatements([resolver, ...chain], {
    app, express, bearerTokenFromHeader, runCredentials, DELEGATED_TOOL_CALLS_PATH,
    requireAgentDaemonToken: (input: Parameters<typeof requireAgentDaemonToken>[0], options: {}) => requireAgentDaemonToken({ ...input, env: { [AGENT_DAEMON_TOKEN_ENV_VAR]: PROXY_TOKEN } }, options),
    siteTools: { withRun: ({ runId, fn }: { runId: string; fn: () => void }) => { runsEntered.push(runId); fn(); } },
    // Stands for every site-owned route mounted below the parser: it answers with the body it was given.
    registerToolAccessLoweringRoute: ({ app: target }: { app: express.Express }) => { target.post("/site-owned", (req, res) => { res.json({ parsed: req.body }); }); },
  });
  app.post(DELEGATED_TOOL_CALLS_PATH, (req, res) => { delegated.push(req.body); res.json({ handled: true }); });
  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); }));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const post = async (path: string, { token = RUN_TOKEN as string | null, body = "{}" }: { token?: string | null; body?: string } = {}) => {
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, { method: "POST", body,
      headers: { ...(token === null ? {} : { authorization: `Bearer ${token}` }), "content-type": "application/json" } });
    const answer = await response.text();
    return { status: response.status, text: answer, json: (() => { try { return JSON.parse(answer) as unknown; } catch { return undefined; } })() };
  };
  return { post, delegated, runsEntered, credential };
}

test("a delegated call whose run credential matches the run named in its body reaches the route, inside that run", async t => {
  const h = await harness(t);
  const answer = await h.post(DELEGATED_TOOL_CALLS_PATH, { body: JSON.stringify({ runId: "run-x", toolId: "site_read" }) });
  assert.equal(answer.status, 200);
  assert.deepEqual(h.delegated, [{ runId: "run-x", toolId: "site_read" }]);
  assert.deepEqual(h.runsEntered, ["run-x"]);
});

test("a run credential may not act for the run another body names: refused after parsing, and the route is not reached", async t => {
  const h = await harness(t);
  const answer = await h.post(DELEGATED_TOOL_CALLS_PATH, { body: JSON.stringify({ runId: "run-y", toolId: "site_read" }) });
  assert.equal(answer.status, 403);
  assert.deepEqual(answer.json, { error: "a run-scoped credential requires body.runId to match its own run", code: "FORBIDDEN" });
  assert.deepEqual(h.delegated, []);
});

test("a delegated call that names no run at all is refused for a run credential", async t => {
  const h = await harness(t);
  const answer = await h.post(DELEGATED_TOOL_CALLS_PATH, { body: JSON.stringify({ toolId: "site_read" }) });
  assert.equal(answer.status, 403);
  assert.deepEqual(answer.json, { error: "a run-scoped credential requires body.runId to match its own run", code: "FORBIDDEN" });
  assert.deepEqual(h.delegated, []);
});

test("a credential revoked while the request is in the chain is refused by whichever gate asks next", async t => {
  const body = JSON.stringify({ runId: "run-x" });
  const afterFirstGate = await harness(t);
  afterFirstGate.credential.validForLookups = 1;
  const reResolve = await afterFirstGate.post(DELEGATED_TOOL_CALLS_PATH, { body });
  assert.equal(reResolve.status, 404);
  assert.deepEqual(reResolve.json, { error: "a live run is required" });
  assert.deepEqual(afterFirstGate.runsEntered, []);

  const afterReResolve = await harness(t);
  afterReResolve.credential.validForLookups = 2;
  const reCheck = await afterReResolve.post(DELEGATED_TOOL_CALLS_PATH, { body });
  assert.equal(reCheck.status, 401);
  assert.deepEqual(reCheck.json, { error: "Authorization: Bearer <TOVU_AGENT_DAEMON_TOKEN> is required", code: "UNAUTHENTICATED" });
  assert.deepEqual(afterReResolve.delegated, []);
  assert.equal(afterReResolve.credential.lookups, 3, "the first gate, the re-resolve and the re-check each ask once");
});

test("the tool paths need a live run credential: the proxy token passes the first gate and is then refused there", async t => {
  const h = await harness(t);
  for (const path of [DELEGATED_TOOL_CALLS_PATH, "/api/tools", "/api/components/search"]) {
    const answer = await h.post(path, { token: PROXY_TOKEN, body: JSON.stringify({ runId: "run-x" }) });
    assert.equal(answer.status, 404, path);
    assert.deepEqual(answer.json, { error: "a live run is required" }, path);
  }
  assert.deepEqual(h.delegated, []);
});

test("a caller with no token is refused before its body is parsed: malformed JSON and an oversized body both get 401", async t => {
  const h = await harness(t);
  for (const path of [DELEGATED_TOOL_CALLS_PATH, "/site-owned"]) {
    assert.equal((await h.post(path, { token: null, body: '{"broken"' })).status, 401, path);
    assert.equal((await h.post(path, { token: null, body: JSON.stringify({ pad: "x".repeat(7 * 1024 * 1024) }) })).status, 401, path);
    assert.equal((await h.post(path, { token: "wrong-token", body: '{"broken"' })).status, 401, path);
  }
});

test("a site-owned route below the parser is handed its parsed body; a run credential does not reach it at all", async t => {
  const h = await harness(t);
  const answer = await h.post("/site-owned", { token: PROXY_TOKEN, body: JSON.stringify({ lower: ["tool-a"] }) });
  assert.equal(answer.status, 200);
  assert.deepEqual(answer.json, { parsed: { lower: ["tool-a"] } });
  const bridge = await h.post("/site-owned", { body: JSON.stringify({ lower: ["tool-a"] }) });
  assert.equal(bridge.status, 403);
  assert.deepEqual(bridge.json, { error: "a run-scoped credential cannot call POST /site-owned", code: "FORBIDDEN" });
});

test("the parser takes a body up to 6 MB (far over the framework default) and refuses the first byte over", async t => {
  const h = await harness(t);
  const LIMIT = 6 * 1024 * 1024;
  const bodyOf = (bytes: number): string => { const shell = JSON.stringify({ runId: "run-x", pad: "" }); return JSON.stringify({ runId: "run-x", pad: "x".repeat(bytes - shell.length) }); };
  for (const [bytes, status] of [[LIMIT - 1, 200], [LIMIT, 200], [LIMIT + 1, 413]] as const) {
    const body = bodyOf(bytes);
    assert.equal(Buffer.byteLength(body), bytes);
    assert.equal((await h.post(DELEGATED_TOOL_CALLS_PATH, { body })).status, status, `${bytes} bytes`);
  }
  assert.equal(h.delegated.length, 2);
  assert.equal((await h.post(DELEGATED_TOOL_CALLS_PATH, { body: '{"broken"' })).status, 400);
});
