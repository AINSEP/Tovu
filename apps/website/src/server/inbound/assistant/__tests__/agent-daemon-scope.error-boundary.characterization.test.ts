import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import test, { type TestContext } from "node:test";
import express from "express";
import { bearerTokenFromHeader } from "@jini-ai/core/contracts/server";
import { AGENT_DAEMON_TOKEN_ENV_VAR, DELEGATED_TOOL_CALLS_PATH, requireAgentDaemonToken } from "#src/assistant/daemon-access";
import { daemonSource, evaluateDaemonStatements } from "./helpers/daemon-source.js";

/**
 * @file What a caller of the daemon scope app gets when something fails before or inside a route, recorded from
 * the real statements of `agent-daemon-scope.ts` on a real socket (the same method as `agent-daemon-scope.parser-chain.unit.test.ts`).
 * Pins today's answers: HTML for an exception, an oversized body and malformed JSON, flat `{ error: "text" }` for
 * the three refusals, and the unchanged 401 for a caller with no token.
 */

const PROXY_TOKEN = "proxy-token";
const RUN_TOKEN = "run-token-x";

async function harness(t: TestContext, { disposed = false, withRunThrows = false }: { disposed?: boolean; withRunThrows?: boolean } = {}) {
  const app = express();
  const text = (statement: { getText(source: typeof daemonSource): string }): string => statement.getText(daemonSource);
  const resolver = daemonSource.statements.find(statement => text(statement).startsWith("function resolveDiscoveryCaller("));
  const closed = daemonSource.statements.find(statement => text(statement).startsWith("app.use((_req, res, next) => {") && text(statement).includes("site scope is closed"));
  const start = daemonSource.statements.findIndex(statement => text(statement).startsWith("app.use(requireAgentDaemonToken("));
  const end = daemonSource.statements.findIndex(statement => text(statement).startsWith("app.post(DELEGATED_TOOL_CALLS_PATH, requireAgentDaemonToken("));
  assert.ok(resolver && closed && start >= 0 && end > start);
  const runCredentials = { resolveCaller: ({ token }: { token: string }) => (token === RUN_TOKEN ? { runId: "run-x", principalId: "alice" } : undefined) };
  await evaluateDaemonStatements([closed, resolver, ...daemonSource.statements.slice(start, end + 1)], {
    app, express, bearerTokenFromHeader, runCredentials, DELEGATED_TOOL_CALLS_PATH, disposed, responses: new Set(),
    requireAgentDaemonToken: (input: Parameters<typeof requireAgentDaemonToken>[0], options: {}) => requireAgentDaemonToken({ ...input, env: { [AGENT_DAEMON_TOKEN_ENV_VAR]: PROXY_TOKEN } }, options),
    siteTools: { withRun: ({ fn }: { runId: string; fn: () => void }) => {
      if (withRunThrows) throw new Error("PRIVATE-CANARY /home/owner/site/secret-draft.md");
      fn();
    } },
    registerToolAccessLoweringRoute: () => {},
  });
  app.post(DELEGATED_TOOL_CALLS_PATH, (_req, res) => { res.json({ handled: true }); });
  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const post = async ({ token = RUN_TOKEN as string | null, body = "{}" }: { token?: string | null; body?: string } = {}) => {
    const response = await fetch(`http://127.0.0.1:${address.port}${DELEGATED_TOOL_CALLS_PATH}`, { method: "POST", body,
      headers: { ...(token === null ? {} : { authorization: `Bearer ${token}` }), "content-type": "application/json" } });
    const answer = await response.text();
    return { status: response.status, contentType: response.headers.get("content-type") ?? "", text: answer };
  };
  return { post };
}

const validBody = JSON.stringify({ runId: "run-x", toolId: "site_read" });

test("a route that throws answers an HTML page, not JSON", async t => {
  const answer = await (await harness(t, { withRunThrows: true })).post({ body: validBody });
  assert.equal(answer.status, 500);
  assert.match(answer.contentType, /text\/html/);
});

test("a body over 6 MB answers 413 as HTML", async t => {
  const answer = await (await harness(t)).post({ body: JSON.stringify({ runId: "run-x", pad: "x".repeat(7 * 1024 * 1024) }) });
  assert.equal(answer.status, 413);
  assert.match(answer.contentType, /text\/html/);
});

test("malformed JSON with a valid bearer answers 400 as HTML", async t => {
  const answer = await (await harness(t)).post({ body: '{"broken"' });
  assert.equal(answer.status, 400);
  assert.match(answer.contentType, /text\/html/);
});

test("a caller with no token or a wrong token is refused 401 before the body is read, for every body", async t => {
  const h = await harness(t);
  for (const body of ['{"broken"', JSON.stringify({ pad: "x".repeat(7 * 1024 * 1024) }), validBody]) {
    for (const token of [null, "wrong-token"]) {
      const answer = await h.post({ token, body });
      assert.equal(answer.status, 401);
      assert.equal(answer.text, '{"error":"Authorization: Bearer <TOVU_AGENT_DAEMON_TOKEN> is required","code":"UNAUTHENTICATED"}');
    }
  }
});

test("the three refusals answer a flat { error: text } envelope", async t => {
  const noRun = await (await harness(t)).post({ token: PROXY_TOKEN, body: validBody });
  assert.equal(noRun.status, 404);
  assert.equal(noRun.text, '{"error":"a live run is required"}');
  const closed = await (await harness(t, { disposed: true })).post({ body: validBody });
  assert.equal(closed.status, 503);
  assert.equal(closed.text, '{"error":"site scope is closed"}');
});
