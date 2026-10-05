import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import test from "node:test";

import { SpanKind, SpanStatusCode } from "@opentelemetry/api";
import type { Request, Response } from "express";

import {
  cancelDaemonRunBestEffort,
  fetchAgentDaemon,
  fetchAgentDaemonEventStream,
  forwardToAgentDaemon,
  triggerFederationReload,
} from "../assistant-daemon-client.js";
import { assertSpanOmits, createInMemoryOtel } from "#src/platform/observability/__tests__/fixtures/in-memory-otel";

/**
 * @file Direct coverage for `assistant-daemon-client.ts` paths the proxy-route suites never reach.
 *
 * `assistant-proxy-routes.test.ts` and `assistant-ag-ui-routes.test.ts` already pin the header set,
 * the known-failed 503 short-circuit and the SSE relay. What no test asserted:
 * - `triggerFederationReload()` — its only callers (the OAuth callback and the external-MCP PUT
 *   route) are tested without a reachable daemon, so all five outcomes were unpinned;
 * - the boot-window retry: a daemon that starts listening a moment AFTER the request arrives must
 *   still answer that request, not a 502;
 * - the non-retryable failure: a daemon that answers with garbage is an immediate 502
 *   `BAD_GATEWAY`, not 8 seconds of retrying;
 * - `options.path`/`options.method` overriding the inbound request's own path and verb;
 * - `cancelDaemonRunBestEffort()`'s URL encoding of the run id.
 *
 * Every daemon here is a real local socket; the daemon origin comes from `JINI_AGENT_DAEMON_URL`,
 * which `getAgentDaemonUrl()` re-reads on every call.
 */

const TOKEN_ENV = "TOVU_AGENT_DAEMON_TOKEN";

interface Seen {
  method: string;
  url: string;
  headers: http.IncomingHttpHeaders;
  body: string;
}

function startDaemon(
  t: import("node:test").TestContext,
  respond: (seen: Seen, res: http.ServerResponse) => void,
  port = 0
): Promise<{ origin: string; seen: Seen[] }> {
  const seen: Seen[] = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const entry = { method: req.method ?? "", url: req.url ?? "", headers: req.headers, body };
      seen.push(entry);
      respond(entry, res);
    });
  });
  t.after(() => {
    server.closeAllConnections();
    return new Promise<void>((r) => server.close(() => r()));
  });
  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      const address = server.address() as net.AddressInfo;
      resolve({ origin: `http://127.0.0.1:${address.port}`, seen });
    });
  });
}

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.listen(0, "127.0.0.1", () => {
      const port = (probe.address() as net.AddressInfo).port;
      probe.close(() => resolve(port));
    });
  });
}

function withEnv(t: import("node:test").TestContext, values: Record<string, string | undefined>): void {
  const saved = Object.fromEntries(Object.keys(values).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(values)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  t.after(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });
}

function fakeReq(init: { originalUrl: string; method: string; headers?: Record<string, string> }): Request {
  const headers = init.headers ?? {};
  return {
    originalUrl: init.originalUrl,
    method: init.method,
    get: (name: string) => headers[name.toLowerCase()],
  } as unknown as Request;
}

function fakeRes(): { res: Response; sent: { status?: number; body?: unknown } } {
  const sent: { status?: number; body?: unknown } = {};
  const res = {
    locals: { principal: { id: "principal-7" } },
    status(code: number) {
      sent.status = code;
      return res;
    },
    json(body: unknown) {
      sent.body = body;
      return res;
    },
  };
  return { res: res as unknown as Response, sent };
}

test("triggerFederationReload: no daemon token configured → { ok: false } and no request is made", async (t) => {
  const daemon = await startDaemon(t, (_s, res) => res.end("{}"));
  withEnv(t, { JINI_AGENT_DAEMON_URL: daemon.origin, [TOKEN_ENV]: undefined });

  assert.deepEqual(await triggerFederationReload(), { ok: false });
  assert.equal(daemon.seen.length, 0);
});

test("triggerFederationReload: a 200 POSTs /api/federation/reload with the bearer token and returns the daemon's admitted ids", async (t) => {
  const daemon = await startDaemon(t, (_s, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ newlyAdmittedConnectionIds: ["conn-a", "conn-b"] }));
  });
  withEnv(t, { JINI_AGENT_DAEMON_URL: daemon.origin, [TOKEN_ENV]: "tok-123" });

  assert.deepEqual(await triggerFederationReload(), { ok: true, newlyAdmittedConnectionIds: ["conn-a", "conn-b"] });
  assert.equal(daemon.seen.length, 1);
  assert.equal(daemon.seen[0].method, "POST");
  assert.equal(daemon.seen[0].url, "/api/federation/reload");
  assert.equal(daemon.seen[0].headers.authorization, "Bearer tok-123");
});

test("triggerFederationReload: a 200 without newlyAdmittedConnectionIds reports an empty list, not undefined", async (t) => {
  const daemon = await startDaemon(t, (_s, res) => res.end("{}"));
  withEnv(t, { JINI_AGENT_DAEMON_URL: daemon.origin, [TOKEN_ENV]: "tok-123" });

  assert.deepEqual(await triggerFederationReload(), { ok: true, newlyAdmittedConnectionIds: [] });
});

test("triggerFederationReload: a non-200 answer is { ok: false }, never thrown", async (t) => {
  const daemon = await startDaemon(t, (_s, res) => {
    res.statusCode = 401;
    res.end(JSON.stringify({ newlyAdmittedConnectionIds: ["should-not-be-read"] }));
  });
  withEnv(t, { JINI_AGENT_DAEMON_URL: daemon.origin, [TOKEN_ENV]: "tok-123" });

  assert.deepEqual(await triggerFederationReload(), { ok: false });
});

test("triggerFederationReload: an unreachable daemon or an unparsable body is { ok: false }, never thrown", async (t) => {
  withEnv(t, { JINI_AGENT_DAEMON_URL: `http://127.0.0.1:${await freePort()}`, [TOKEN_ENV]: "tok-123" });
  assert.deepEqual(await triggerFederationReload(), { ok: false });

  const daemon = await startDaemon(t, (_s, res) => res.end("not json"));
  process.env.JINI_AGENT_DAEMON_URL = daemon.origin;
  assert.deepEqual(await triggerFederationReload(), { ok: false });
});

test("fetchAgentDaemon: a daemon that starts listening AFTER the request arrived still answers it (boot-window retry), not a 502", async (t) => {
  const port = await freePort();
  withEnv(t, { JINI_AGENT_DAEMON_URL: `http://127.0.0.1:${port}`, [TOKEN_ENV]: "tok-123" });
  const { res, sent } = fakeRes();

  const pending = fetchAgentDaemon(fakeReq({ originalUrl: "/api/runs", method: "GET" }), res);
  await new Promise((r) => setTimeout(r, 600));
  const daemon = await startDaemon(t, (_s, r) => r.end(JSON.stringify({ runs: ["late"] })), port);

  const upstream = await pending;
  assert.ok(upstream, "the retry loop must return the daemon's response");
  assert.deepEqual(await upstream.json(), { runs: ["late"] });
  assert.equal(sent.status, undefined, "nothing was written to res — the caller relays the response");
  assert.equal(daemon.seen.length, 1);
});

test("fetchAgentDaemon: a daemon that answers with a malformed response is an immediate 502 BAD_GATEWAY, not a retry loop", async (t) => {
  const sockets = new Set<net.Socket>();
  const garbage = net.createServer((socket) => {
    sockets.add(socket);
    socket.end("not http at all\r\n\r\n");
  });
  await new Promise<void>((r) => garbage.listen(0, "127.0.0.1", () => r()));
  t.after(() => {
    for (const s of sockets) s.destroy();
    return new Promise<void>((r) => garbage.close(() => r()));
  });
  withEnv(t, { JINI_AGENT_DAEMON_URL: `http://127.0.0.1:${(garbage.address() as net.AddressInfo).port}` });
  const { res, sent } = fakeRes();

  const started = Date.now();
  const upstream = await fetchAgentDaemon(fakeReq({ originalUrl: "/api/runs", method: "GET" }), res);

  assert.equal(upstream, null);
  assert.equal(sent.status, 502);
  assert.deepEqual(sent.body, { error: "assistant is unavailable", code: "BAD_GATEWAY" });
  assert.ok(Date.now() - started < 3000, `a non-refused failure must not wait out the retry window (took ${Date.now() - started}ms)`);
});

test("fetchAgentDaemon: options.path/method/body override the inbound request's own path and verb", async (t) => {
  const daemon = await startDaemon(t, (_s, res) => res.end("{}"));
  withEnv(t, { JINI_AGENT_DAEMON_URL: daemon.origin, [TOKEN_ENV]: "tok-123" });
  const { res } = fakeRes();

  await fetchAgentDaemon(fakeReq({ originalUrl: "/api/ag-ui/run", method: "GET" }), res, {
    path: "/api/runs/r-1/events",
    method: "POST",
    body: { a: 1 },
  });

  assert.equal(daemon.seen.length, 1);
  assert.equal(daemon.seen[0].method, "POST");
  assert.equal(daemon.seen[0].url, "/api/runs/r-1/events");
  assert.equal(daemon.seen[0].body, '{"a":1}');
  assert.equal(daemon.seen[0].headers.authorization, "Bearer tok-123");
  assert.equal(daemon.seen[0].headers["x-tovu-principal-id"], "principal-7");
});

test("fetchAgentDaemon: a GET with no body sends no body at all", async (t) => {
  const daemon = await startDaemon(t, (_s, res) => res.end("{}"));
  withEnv(t, { JINI_AGENT_DAEMON_URL: daemon.origin });
  const { res } = fakeRes();

  await fetchAgentDaemon(fakeReq({ originalUrl: "/api/runs?contextRef=x", method: "GET" }), res);

  assert.equal(daemon.seen[0].method, "GET");
  assert.equal(daemon.seen[0].url, "/api/runs?contextRef=x");
  assert.equal(daemon.seen[0].body, "");
});

test("cancelDaemonRunBestEffort: POSTs /api/runs/<encoded id>/cancel with the daemon headers", async (t) => {
  let received: () => void = () => {};
  const arrived = new Promise<void>((r) => (received = r));
  const daemon = await startDaemon(t, (_s, res) => {
    res.end("{}");
    received();
  });
  withEnv(t, { JINI_AGENT_DAEMON_URL: daemon.origin, [TOKEN_ENV]: "tok-123" });
  const { res } = fakeRes();

  cancelDaemonRunBestEffort(fakeReq({ originalUrl: "/x", method: "GET" }), res, "run/../a b");
  await arrived;

  assert.equal(daemon.seen[0].method, "POST");
  assert.equal(daemon.seen[0].url, "/api/runs/run%2F..%2Fa%20b/cancel");
  assert.equal(daemon.seen[0].headers.authorization, "Bearer tok-123");
  assert.equal(daemon.seen[0].headers["x-tovu-principal-id"], "principal-7");
});

test("cancelDaemonRunBestEffort: an unreachable daemon is swallowed — no throw, no unhandled rejection", async (t) => {
  withEnv(t, { JINI_AGENT_DAEMON_URL: `http://127.0.0.1:${await freePort()}` });
  const unhandled: unknown[] = [];
  const onUnhandled = (e: unknown) => unhandled.push(e);
  process.on("unhandledRejection", onUnhandled);
  t.after(() => process.off("unhandledRejection", onUnhandled));
  const { res } = fakeRes();

  assert.doesNotThrow(() => cancelDaemonRunBestEffort(fakeReq({ originalUrl: "/x", method: "GET" }), res, "r-1"));
  await new Promise((r) => setTimeout(r, 300));
  assert.deepEqual(unhandled, []);
});

// --- Loopback spans: every daemon call is one outbound CLIENT span when an observability port is
// passed — method, host/port and status only; never the path (run ids), query, token or body.

/** Polls until `exporter` holds `count` finished spans — fire-and-forget calls end theirs later. */
async function finishedSpans(exporter: ReturnType<typeof createInMemoryOtel>["exporter"], count: number) {
  for (let waited = 0; exporter.getFinishedSpans().length < count && waited < 2_000; waited += 10) await new Promise((r) => setTimeout(r, 10));
  return exporter.getFinishedSpans();
}

test("fetchAgentDaemon traces the loopback call as one CLIENT span: host, port and status, never the path, token or body", async (t) => {
  const daemon = await startDaemon(t, (_s, res) => { res.statusCode = 201; res.end("{}"); });
  withEnv(t, { JINI_AGENT_DAEMON_URL: daemon.origin, [TOKEN_ENV]: "tok-otel-123" });
  const { exporter, port } = createInMemoryOtel();

  await fetchAgentDaemon(fakeReq({ originalUrl: "/x", method: "GET" }), fakeRes().res, { path: "/api/runs/secret-run-9/cancel?k=v", method: "POST", body: { prompt: "private words" }, observability: port });

  const [span] = await finishedSpans(exporter, 1);
  assert.equal(span.name, "POST 127.0.0.1");
  assert.equal(span.kind, SpanKind.CLIENT);
  assert.equal(span.attributes["server.port"], Number(new URL(daemon.origin).port));
  assert.equal(span.attributes["http.response.status_code"], 201);
  assert.equal(span.status.code, SpanStatusCode.UNSET);
  assertSpanOmits(span, ["tok-otel-123", "secret-run-9", "/api", "k=v", "private words", "principal-7"]);
});

test("fetchAgentDaemon: each boot-window retry is its own span, so a refused attempt shows as the failure it was", async (t) => {
  const portNumber = await freePort();
  withEnv(t, { JINI_AGENT_DAEMON_URL: `http://127.0.0.1:${portNumber}` });
  const { exporter, port } = createInMemoryOtel();

  const pending = fetchAgentDaemon(fakeReq({ originalUrl: "/api/runs", method: "GET" }), fakeRes().res, { observability: port });
  await new Promise((r) => setTimeout(r, 400));
  await startDaemon(t, (_s, r) => r.end("{}"), portNumber);
  assert.ok(await pending);

  const spans = exporter.getFinishedSpans();
  assert.ok(spans.length >= 2, `expected a refused attempt plus the answered one, got ${spans.length}`);
  assert.equal(spans[0].status.code, SpanStatusCode.ERROR);
  assert.equal(spans.at(-1)!.attributes["http.response.status_code"], 200);
});

test("forwardToAgentDaemon passes its observability port through to the call it makes", async (t) => {
  const daemon = await startDaemon(t, (_s, res) => res.end("{}"));
  withEnv(t, { JINI_AGENT_DAEMON_URL: daemon.origin });
  const { exporter, port } = createInMemoryOtel();

  await forwardToAgentDaemon(fakeReq({ originalUrl: "/api/runs", method: "GET" }), fakeRes().res, undefined, { observability: port });

  assert.equal((await finishedSpans(exporter, 1))[0].name, "GET 127.0.0.1");
});

test("cancelDaemonRunBestEffort traces its fire-and-forget POST without the run id", async (t) => {
  const daemon = await startDaemon(t, (_s, res) => res.end("{}"));
  withEnv(t, { JINI_AGENT_DAEMON_URL: daemon.origin, [TOKEN_ENV]: "tok-otel-123" });
  const { exporter, port } = createInMemoryOtel();

  cancelDaemonRunBestEffort(fakeReq({ originalUrl: "/x", method: "GET" }), fakeRes().res, "run-secret-42", { observability: port });

  const [span] = await finishedSpans(exporter, 1);
  assert.equal(span.name, "POST 127.0.0.1");
  assertSpanOmits(span, ["run-secret-42", "cancel", "tok-otel-123"]);
});

test("triggerFederationReload traces its POST; a daemon refusal is an ERROR span with the status, never the bearer token", async (t) => {
  const daemon = await startDaemon(t, (_s, res) => { res.statusCode = 401; res.end("{}"); });
  withEnv(t, { JINI_AGENT_DAEMON_URL: daemon.origin, [TOKEN_ENV]: "tok-otel-123" });
  const { exporter, port } = createInMemoryOtel();

  assert.deepEqual(await triggerFederationReload({ observability: port }), { ok: false });

  const [span] = await finishedSpans(exporter, 1);
  assert.equal(span.name, "POST 127.0.0.1");
  assert.equal(span.status.code, SpanStatusCode.ERROR);
  assert.equal(span.attributes["http.response.status_code"], 401);
  assertSpanOmits(span, ["tok-otel-123", "federation"]);
});

test("fetchAgentDaemonEventStream: the span ends at the response headers with their status, not with the stream", async (t) => {
  const daemon = await startDaemon(t, (seen, res) => {
    res.writeHead(seen.url.includes("missing") ? 404 : 200, { "content-type": "text/event-stream" });
    if (seen.url.includes("missing")) res.end();
    else res.write("data: {}\n\n"); // stays open: the span must not wait for it
  });
  withEnv(t, { JINI_AGENT_DAEMON_URL: daemon.origin, [TOKEN_ENV]: "tok-otel-123" });
  const { exporter, port } = createInMemoryOtel();
  const req = fakeReq({ originalUrl: "/x", method: "GET" });

  const open = await fetchAgentDaemonEventStream(req, fakeRes().res, "/api/runs/run-secret-42/events", { observability: port });
  assert.equal(open?.statusCode, 200);
  const [okSpan] = await finishedSpans(exporter, 1);
  assert.equal(okSpan.name, "GET 127.0.0.1");
  assert.equal(okSpan.attributes["http.response.status_code"], 200);
  assertSpanOmits(okSpan, ["run-secret-42", "/events", "tok-otel-123"]);
  await open?.body.cancel();

  assert.equal((await fetchAgentDaemonEventStream(req, fakeRes().res, "/api/runs/missing/events", { observability: port }))?.statusCode, 404);
  const notFound = (await finishedSpans(exporter, 2))[1];
  assert.equal(notFound.status.code, SpanStatusCode.ERROR);
  assert.equal(notFound.attributes["http.response.status_code"], 404);
});

test("fetchAgentDaemonEventStream: a transport failure ends its span as ERROR with the error type", async (t) => {
  const sockets = new Set<net.Socket>();
  const garbage = net.createServer((socket) => { sockets.add(socket); socket.end("not http at all\r\n\r\n"); });
  await new Promise<void>((r) => garbage.listen(0, "127.0.0.1", () => r()));
  t.after(() => {
    for (const s of sockets) s.destroy();
    return new Promise<void>((r) => garbage.close(() => r()));
  });
  withEnv(t, { JINI_AGENT_DAEMON_URL: `http://127.0.0.1:${(garbage.address() as net.AddressInfo).port}` });
  const { exporter, port } = createInMemoryOtel();
  const { res, sent } = fakeRes();

  assert.equal(await fetchAgentDaemonEventStream(fakeReq({ originalUrl: "/x", method: "GET" }), res, "/api/runs/r/events", { observability: port }), null);
  assert.equal(sent.status, 502);
  const [span] = await finishedSpans(exporter, 1);
  assert.equal(span.status.code, SpanStatusCode.ERROR);
  assert.equal(typeof span.attributes["error.type"], "string");
});
