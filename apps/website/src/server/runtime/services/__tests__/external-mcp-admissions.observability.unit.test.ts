import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, type RequestListener } from "node:http";
import type { AddressInfo } from "node:net";
import test, { type TestContext } from "node:test";

import { SpanKind, SpanStatusCode } from "@opentelemetry/api";
import express from "express";

import { AGENT_DAEMON_TOKEN_ENV_VAR } from "#src/assistant/index";
import { assertSpanOmits, createInMemoryOtel } from "#src/platform/observability/__tests__/fixtures/in-memory-otel";
import { registerAdminExternalMcpAdmissionsRoute } from "#src/server/inbound/admin-http/routes/external-mcp/admissions";
import { fetchDaemonAdmissions } from "../external-mcp-admissions.js";

/**
 * @file The daemon admissions read is one outbound CLIENT span through the port it is handed —
 * method, host/port and status, never the bearer token or the admissions path — and the admin
 * admissions route hands it `deps.observability`. Real OTel SDK with an in-memory exporter.
 */

const TOKEN = "tok-admissions-5d1";
const DAEMON = "http://127.0.0.1:4999";
const roster = () => new Response('{"connections":[]}', { status: 200 });

test("fetchDaemonAdmissions traces its read as one CLIENT span: host, port and status, never the token or path", async () => {
  const { exporter, port } = createInMemoryOtel();

  const result = await fetchDaemonAdmissions({ token: TOKEN, daemonUrl: DAEMON, fetch: async () => roster(), observability: port });

  assert.deepEqual(result, { ok: true, connections: [] });
  const [span] = exporter.getFinishedSpans();
  assert.equal(span.name, "GET 127.0.0.1");
  assert.equal(span.kind, SpanKind.CLIENT);
  assert.equal(span.attributes["server.port"], 4999);
  assert.equal(span.attributes["http.response.status_code"], 200);
  assert.equal(span.status.code, SpanStatusCode.UNSET);
  assertSpanOmits(span, [TOKEN, "federation", "admissions"]);
});

test("fetchDaemonAdmissions: a daemon refusal is an ERROR span with its status; the caller still gets the 503 shape", async () => {
  const { exporter, port } = createInMemoryOtel();

  const result = await fetchDaemonAdmissions({ token: TOKEN, daemonUrl: DAEMON, fetch: async () => new Response("no", { status: 401 }), observability: port });

  assert.equal(result.ok, false);
  const [span] = exporter.getFinishedSpans();
  assert.equal(span.status.code, SpanStatusCode.ERROR);
  assert.equal(span.attributes["http.response.status_code"], 401);
  assertSpanOmits(span, [TOKEN]);
});

test("fetchDaemonAdmissions: a refused connection ends the span as ERROR with the error type, never the message", async () => {
  const { exporter, port } = createInMemoryOtel();

  const result = await fetchDaemonAdmissions({ token: TOKEN, daemonUrl: DAEMON, fetch: async () => { throw new TypeError(`refused ${TOKEN}`); }, observability: port });

  assert.equal(result.ok, false);
  const [span] = exporter.getFinishedSpans();
  assert.equal(span.status.code, SpanStatusCode.ERROR);
  assert.equal(span.attributes["error.type"], "TypeError");
  assertSpanOmits(span, [TOKEN, "refused"]);
});

test("fetchDaemonAdmissions: a missing token makes no request and so no span", async () => {
  const { exporter, port } = createInMemoryOtel();

  await fetchDaemonAdmissions({ token: "", daemonUrl: DAEMON, fetch: async () => roster(), observability: port });

  assert.equal(exporter.getFinishedSpans().length, 0);
});

/** A real stand-in daemon on loopback, with the env the route resolves the daemon from, both undone after the test. */
async function standInDaemon(t: TestContext, handler: RequestListener): Promise<number> {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const daemonPort = (server.address() as AddressInfo).port;
  const previous = { url: process.env.JINI_AGENT_DAEMON_URL, token: process.env[AGENT_DAEMON_TOKEN_ENV_VAR] };
  process.env.JINI_AGENT_DAEMON_URL = `http://127.0.0.1:${daemonPort}`;
  process.env[AGENT_DAEMON_TOKEN_ENV_VAR] = TOKEN;
  t.after(async () => {
    if (previous.url === undefined) delete process.env.JINI_AGENT_DAEMON_URL;
    else process.env.JINI_AGENT_DAEMON_URL = previous.url;
    if (previous.token === undefined) delete process.env[AGENT_DAEMON_TOKEN_ENV_VAR];
    else process.env[AGENT_DAEMON_TOKEN_ENV_VAR] = previous.token;
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  return daemonPort;
}

test("the admin admissions route traces its daemon read through deps.observability", async (t) => {
  const daemonPort = await standInDaemon(t, (_req, res) => { res.setHeader("content-type", "application/json"); res.end('{"connections":[]}'); });
  const { exporter, port } = createInMemoryOtel();
  const app = express();
  app.use((_req, res, next) => { res.locals.principal = { id: "owner" }; next(); });
  registerAdminExternalMcpAdmissionsRoute(app, { workspaceId: "ws-otel", authorize: async () => ({ allowed: true, reason: "matched" }), observability: port } as never);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/admin/v1/workspaces/ws-otel/mcp-servers/admissions`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { connections: [] });
  const spans = exporter.getFinishedSpans();
  assert.equal(spans.length, 1);
  assert.equal(spans[0].name, "GET 127.0.0.1");
  assert.equal(spans[0].attributes["server.port"], daemonPort);
  assertSpanOmits(spans[0], [TOKEN, "admissions"]);
});
