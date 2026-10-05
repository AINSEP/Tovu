import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { SpanKind } from "@opentelemetry/api";

import { AGENT_DAEMON_TOKEN_ENV_VAR } from "#src/assistant/index";
import { notifyExternalMcpRosterChanged, resetExternalMcpRosterChangeListenersForTests } from "#src/assistant/external-mcp-roster-change";
import { assertSpanOmits, createInMemoryOtel } from "#src/platform/observability/__tests__/fixtures/in-memory-otel";
import { createApp, createRouteDeps } from "../app.js";

/**
 * @file `createApp` registers the agent daemon's roster-change listener with the composition root's
 * own `RouteDeps.observability`, so a saved MCP roster change traces its federation reload POST as
 * one outbound CLIENT span (method, host/port, status — never the token or the reload path).
 * Real app composition, real loopback stand-in daemon, real OTel SDK with an in-memory exporter.
 */

const TOKEN = "tok-reload-e19";

test("a roster change after createApp traces the agent daemon's federation reload with RouteDeps.observability", async (t) => {
  const posts: string[] = [];
  const daemon = createServer((req, res) => {
    posts.push(`${req.method} ${req.url}`);
    res.setHeader("content-type", "application/json");
    res.end('{"newlyAdmittedConnectionIds":[]}');
  });
  daemon.listen(0, "127.0.0.1");
  await once(daemon, "listening");
  const daemonPort = (daemon.address() as AddressInfo).port;
  const previous = { url: process.env.JINI_AGENT_DAEMON_URL, token: process.env[AGENT_DAEMON_TOKEN_ENV_VAR] };
  process.env.JINI_AGENT_DAEMON_URL = `http://127.0.0.1:${daemonPort}`;
  process.env[AGENT_DAEMON_TOKEN_ENV_VAR] = TOKEN;
  t.after(async () => {
    resetExternalMcpRosterChangeListenersForTests();
    if (previous.url === undefined) delete process.env.JINI_AGENT_DAEMON_URL;
    else process.env.JINI_AGENT_DAEMON_URL = previous.url;
    if (previous.token === undefined) delete process.env[AGENT_DAEMON_TOKEN_ENV_VAR];
    else process.env[AGENT_DAEMON_TOKEN_ENV_VAR] = previous.token;
    daemon.closeAllConnections();
    await new Promise<void>((resolve) => daemon.close(() => resolve()));
  });
  const { exporter, port } = createInMemoryOtel();
  const deps = createRouteDeps();
  deps.observability = port;
  createApp(deps);

  await notifyExternalMcpRosterChanged();

  assert.deepEqual(posts, ["POST /api/federation/reload"]);
  const spans = exporter.getFinishedSpans().filter((span) => span.kind === SpanKind.CLIENT);
  assert.equal(spans.length, 1);
  assert.equal(spans[0].name, "POST 127.0.0.1");
  assert.equal(spans[0].attributes["server.port"], daemonPort);
  assert.equal(spans[0].attributes["http.response.status_code"], 200);
  assertSpanOmits(spans[0], [TOKEN, "federation", "reload"]);
});
