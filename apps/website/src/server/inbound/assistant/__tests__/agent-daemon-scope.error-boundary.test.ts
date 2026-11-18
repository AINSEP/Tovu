import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import test, { type TestContext } from "node:test";
import express from "express";
import { bearerTokenFromHeader } from "@jini-ai/core/contracts/server";
import { AGENT_DAEMON_TOKEN_ENV_VAR, DELEGATED_TOOL_CALLS_PATH, requireAgentDaemonToken } from "#src/assistant/daemon-access";
import { postDaemonJson } from "@jini-ai/mcp";
import { createApiError, createApiErrorResponse } from "@jini-ai/protocol";
import { createDaemonErrorBoundary } from "../daemon-error-boundary.js";
import { daemonSource, evaluateDaemonStatements } from "./helpers/daemon-source.js";

/**
 * @file What a caller of the daemon scope app gets when something fails before or inside a route, recorded from
 * the real statements of `agent-daemon-scope.ts` on a real socket (the same method as `agent-daemon-scope.parser-chain.unit.test.ts`),
 * including the boundary mounted last. Before S9 an exception, an oversized body and malformed JSON answered Express's HTML page and
 * the three refusals a flat `{ error: text }`; the caller with no token is refused 401 exactly as before.
 */

const PROXY_TOKEN = "proxy-token";
const RUN_TOKEN = "run-token-x";
const ERROR_ID = "ERR-AAAA-BBBB-CCCC-DDDD";

interface Incident { readonly error: unknown; readonly errorId: string }

async function harness(t: TestContext, { disposed = false, withRunThrows = false, omitBoundary = false, sinkThrows = false }: { disposed?: boolean; withRunThrows?: boolean; omitBoundary?: boolean; sinkThrows?: boolean } = {}) {
  const app = express();
  const incidents: Incident[] = [];
  const text = (statement: { getText(source: typeof daemonSource): string }): string => statement.getText(daemonSource);
  const resolver = daemonSource.statements.find(statement => text(statement).startsWith("function resolveDiscoveryCaller("));
  const closed = daemonSource.statements.find(statement => text(statement).startsWith("app.use((_req, res, next) => {") && text(statement).includes("site scope is closed"));
  const start = daemonSource.statements.findIndex(statement => text(statement).startsWith("app.use(requireAgentDaemonToken("));
  const end = daemonSource.statements.findIndex(statement => text(statement).startsWith("app.post(DELEGATED_TOOL_CALLS_PATH, requireAgentDaemonToken("));
  assert.ok(resolver && closed && start >= 0 && end > start);
  const mount = daemonSource.statements.find(statement => text(statement).startsWith("app.use(createDaemonErrorBoundary("));
  assert.ok(mount, "the scope must mount the error boundary");
  const runCredentials = { resolveCaller: ({ token }: { token: string }) => (token === RUN_TOKEN ? { runId: "run-x", principalId: "alice" } : undefined) };
  await evaluateDaemonStatements([closed, resolver, ...daemonSource.statements.slice(start, end + 1)], {
    app, express, bearerTokenFromHeader, runCredentials, DELEGATED_TOOL_CALLS_PATH, disposed, createApiError, createApiErrorResponse, responses: new Set(),
    requireAgentDaemonToken: (input: Parameters<typeof requireAgentDaemonToken>[0], options: {}) => requireAgentDaemonToken({ ...input, env: { [AGENT_DAEMON_TOKEN_ENV_VAR]: PROXY_TOKEN } }, options),
    siteTools: { withRun: ({ fn }: { runId: string; fn: () => void }) => {
      if (withRunThrows) throw new Error("PRIVATE-CANARY /home/owner/site/secret-draft.md");
      fn();
    } },
    registerToolAccessLoweringRoute: () => {},
  });
  app.post(DELEGATED_TOOL_CALLS_PATH, (_req, res) => { res.json({ handled: true }); });
  app.get("/streaming-failure", (_req, res, next) => { res.write("partial"); next(new Error("stream failed midway")); });
  if (!omitBoundary) {
    await evaluateDaemonStatements([mount], {
      app, createDaemonErrorBoundary, mintToolErrorId: () => ERROR_ID,
      reportServerFailure: ({ error }: { error: unknown }, { errorId }: { errorId: string }) => {
        if (sinkThrows) throw new Error("sink is down");
        incidents.push({ error, errorId });
      },
    });
  }
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
  return { post, incidents, url: `http://127.0.0.1:${address.port}` };
}

const validBody = JSON.stringify({ runId: "run-x", toolId: "site_read" });

test("a route that throws answers a JSON 500 with fixed words and the error ID; the sink holds the original once", async t => {
  const h = await harness(t, { withRunThrows: true });
  const answer = await h.post({ body: validBody });
  assert.equal(answer.status, 500);
  assert.match(answer.contentType, /application\/json/);
  assert.deepEqual(JSON.parse(answer.text), { error: { code: "INTERNAL_ERROR", message: "The tool service hit an internal problem before the tool ran. Do not retry the same call; give the user the error ID.", requestId: ERROR_ID } });
  assert.ok(!answer.text.includes("PRIVATE-CANARY"));
  assert.equal(h.incidents.length, 1);
  assert.equal(h.incidents[0]!.errorId, ERROR_ID);
  assert.match((h.incidents[0]!.error as Error).message, /PRIVATE-CANARY/);
});

test("without the boundary the same exception is an HTML page (the boundary is what makes the answer JSON)", async t => {
  const answer = await (await harness(t, { withRunThrows: true, omitBoundary: true })).post({ body: validBody });
  assert.equal(answer.status, 500);
  assert.match(answer.contentType, /text\/html/);
});

test("a body over 6 MB answers a JSON 413 and records no incident", async t => {
  const h = await harness(t);
  const answer = await h.post({ body: JSON.stringify({ runId: "run-x", pad: "x".repeat(7 * 1024 * 1024) }) });
  assert.equal(answer.status, 413);
  assert.deepEqual(JSON.parse(answer.text), { error: { code: "PAYLOAD_TOO_LARGE", message: "This tool call's input is larger than 6 MB. Send less content per call." } });
  assert.deepEqual(h.incidents, []);
});

test("malformed JSON with a valid bearer answers a JSON 400 and records no incident", async t => {
  const h = await harness(t);
  const answer = await h.post({ body: '{"broken"' });
  assert.equal(answer.status, 400);
  assert.deepEqual(JSON.parse(answer.text), { error: { code: "BAD_REQUEST", message: "The request body was not valid JSON." } });
  assert.deepEqual(h.incidents, []);
});

test("a caller with no token or a wrong token is refused 401 before the body is read, byte for byte as before, for every body", async t => {
  const h = await harness(t);
  for (const body of ['{"broken"', JSON.stringify({ pad: "x".repeat(7 * 1024 * 1024) }), validBody]) {
    for (const token of [null, "wrong-token"]) {
      const answer = await h.post({ token, body });
      assert.equal(answer.status, 401);
      assert.equal(answer.text, '{"error":"Authorization: Bearer <TOVU_AGENT_DAEMON_TOKEN> is required","code":"UNAUTHENTICATED"}');
    }
  }
  assert.deepEqual(h.incidents, []);
});

test("the refusals answer nested envelopes with the same statuses and words", async t => {
  const noRun = await (await harness(t)).post({ token: PROXY_TOKEN, body: validBody });
  assert.equal(noRun.status, 404);
  assert.deepEqual(JSON.parse(noRun.text), { error: { code: "NOT_FOUND", message: "a live run is required" } });
  const closed = await (await harness(t, { disposed: true })).post({ body: validBody });
  assert.equal(closed.status, 503);
  assert.deepEqual(JSON.parse(closed.text), { error: { code: "SERVICE_UNAVAILABLE", message: "site scope is closed" } });
});

test("headers already sent: the boundary writes nothing and the error goes on to Express's own handler", async t => {
  const h = await harness(t);
  const response = await fetch(`${h.url}/streaming-failure`).then(async r => ({ status: r.status, text: await r.text() }), () => ({ status: 0, text: "" }));
  assert.ok(!response.text.includes("INTERNAL_ERROR"), "no envelope after partial output");
  assert.deepEqual(h.incidents, []);
});

test("end to end with the MCP client: an exception reads as a message with the error ID and the sink holds one record with the same ID", async t => {
  const h = await harness(t, { withRunThrows: true });
  const reported: unknown[] = [];
  const error = await postDaemonJson({ baseUrl: h.url, route: DELEGATED_TOOL_CALLS_PATH, body: JSON.parse(validBody) },
    { headers: { authorization: `Bearer ${RUN_TOKEN}` }, reportFailure: required => { reported.push(required); return { errorId: "ERR-0000-0000-0000-0001" }; } }).catch((e: Error) => e);
  assert.ok(error instanceof Error);
  assert.equal(error.message, `HTTP 500: INTERNAL_ERROR: The tool service hit an internal problem before the tool ran. Do not retry the same call; give the user the error ID. Error ID: ${ERROR_ID}.`);
  assert.deepEqual(reported, [], "a nested envelope is the server's own incident: the client reports nothing");
  assert.equal(h.incidents.length, 1);
  assert.equal(h.incidents[0]!.errorId, ERROR_ID);
});

test("a throwing sink still yields the 500 answer", async t => {
  const h = await harness(t, { withRunThrows: true, sinkThrows: true });
  const answer = await h.post({ body: validBody });
  assert.equal(answer.status, 500);
  assert.equal((JSON.parse(answer.text) as { error: { requestId: string } }).error.requestId, ERROR_ID);
});

test("old client x new server and new client x old server both read the refusal", async t => {
  const h = await harness(t);
  const nested = await postDaemonJson({ baseUrl: h.url, route: DELEGATED_TOOL_CALLS_PATH, body: JSON.parse(validBody) }, { headers: { authorization: `Bearer ${PROXY_TOKEN}` } }).catch((e: Error) => e);
  assert.equal((nested as Error).message, "HTTP 404: NOT_FOUND: a live run is required");
  const flat = (async () => new Response('{"error":"a live run is required"}', { status: 404, headers: { "content-type": "application/json" } })) as typeof fetch;
  const fromOldServer = await postDaemonJson({ baseUrl: h.url, route: DELEGATED_TOOL_CALLS_PATH, body: {} }, { fetchImpl: flat }).catch((e: Error) => e);
  assert.equal((fromOldServer as Error).message, "HTTP 404: a live run is required");
});
