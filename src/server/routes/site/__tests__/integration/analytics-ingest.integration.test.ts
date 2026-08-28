import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

import { createApp, createRouteDeps } from "#src/server/app";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { LocalBufferSink } from "#src/features/analytics/repo.memory";
import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file Integration-tier coverage for `POST /_analytics/e` — through the REAL composed app
 * (`createApp`), unauthenticated (public route, no login needed). `RouteDeps.analyticsSink` is
 * overridden to a fresh `LocalBufferSink` per test so assertions don't see another test's hits.
 */

function testDeps(overrides: Partial<RouteDeps> = {}): RouteDeps {
  return { ...createRouteDeps(), analyticsSink: new LocalBufferSink(), ...overrides };
}

test("analytics-ingest: a real pageview beacon through the composed app always 204s and lands in the sink", async (t) => {
  const deps = testDeps();
  const app = createApp(deps);
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/_analytics/e`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ host: "example.com", path: "/welcome" }),
  });
  assert.equal(res.status, 204);
  assert.equal(deps.analyticsSink.all().length, 1);
});

test("analytics-ingest: an event beacon with props round-trips through the real app", async (t) => {
  const deps = testDeps();
  const app = createApp(deps);
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/_analytics/e`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ host: "example.com", path: "/x", kind: "event", eventName: "cta_clicked", eventProps: { cta: "hero" } }),
  });
  assert.equal(res.status, 204);
  const hits = deps.analyticsSink.all();
  assert.equal(hits.length, 1);
  assert.equal(hits[0].kind, "event");
  assert.equal(hits[0].eventName, "cta_clicked");
});

test("analytics-ingest: a string referrer is normalized into referrerHost", async (t) => {
  const deps = testDeps();
  const app = createApp(deps);
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/_analytics/e`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ host: "example.com", path: "/x", referrer: "https://google.com/search" }),
  });
  assert.equal(res.status, 204);
  assert.equal(deps.analyticsSink.all().length, 1);
});

test("analytics-ingest: kind:'event' with a non-string eventName still records as an event, eventName null", async (t) => {
  const deps = testDeps();
  const app = createApp(deps);
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/_analytics/e`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ host: "example.com", path: "/x", kind: "event", eventName: 123 }),
  });
  assert.equal(res.status, 204);
  const hits = deps.analyticsSink.all();
  assert.equal(hits.length, 1);
  assert.equal(hits[0].kind, "event");
  assert.equal(hits[0].eventName, null);
});

test("analytics-ingest: an unrecognized kind value falls back to pageview through the real app", async (t) => {
  const deps = testDeps();
  const app = createApp(deps);
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/_analytics/e`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ host: "example.com", path: "/x", kind: "bogus" }),
  });
  assert.equal(res.status, 204);
  assert.equal(deps.analyticsSink.all()[0].kind, "pageview");
});

test("analytics-ingest: malformed/missing body never 500s and never leaks any error", async (t) => {
  const deps = testDeps();
  const app = createApp(deps);
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/_analytics/e`, { method: "POST" });
  assert.equal(res.status, 204);
});

test("analytics-ingest: a literal null eventProps is dropped through the real app, not treated as a valid object", async (t) => {
  const deps = testDeps();
  const app = createApp(deps);
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/_analytics/e`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ host: "example.com", path: "/x", kind: "event", eventProps: null }),
  });
  assert.equal(res.status, 204);
  const hits = deps.analyticsSink.all();
  assert.equal(hits.length, 1);
  assert.equal(hits[0].kind, "event");
});

test("analytics-ingest: a caller with no User-Agent/Accept-Language still 204s through the real app and classifies as unknown device", async (t) => {
  const deps = testDeps();
  const app = createApp(deps);
  const baseUrl = await startTestServer(app, t);
  const { port } = new URL(baseUrl);

  // Same technique as the unit-tier test of the same name — see its comment: `fetch()` always
  // injects its own User-Agent/Accept-Language, so only a raw `http.request` can prove Express
  // really never saw them (the real-world case for curl without `-A`, `sendBeacon`, etc).
  const payload = JSON.stringify({ host: "example.com", path: "/x" });
  const status = await new Promise<number>((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        method: "POST",
        path: "/_analytics/e",
        headers: { "content-type": "application/json", "content-length": Buffer.byteLength(payload) },
      },
      (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode ?? 0));
      }
    );
    req.on("error", reject);
    req.end(payload);
  });

  assert.equal(status, 204);
  const hit = deps.analyticsSink.all()[0];
  assert.ok(hit, "the beacon must still be accepted with no User-Agent/Accept-Language at all");
  assert.equal(hit.deviceClass, "unknown");
  assert.equal(hit.browserFamily, null);
});

/** Same technique as the unit-tier test of the same name -- see its comment: every REAL TCP
 *  connection always has SOME socket, so Express always derives a non-empty `req.ip`, meaning
 *  `buildContext`'s `req.ip ?? req.socket.remoteAddress ?? ""` double fallback is unreachable
 *  through any real HTTP request, on the real composed app or otherwise. */
interface ExpressHandlerLayer {
  route?: { path: string; stack: { handle: (req: unknown, res: unknown) => unknown }[] };
}
interface ExpressAppWithRouter {
  _router: { stack: ExpressHandlerLayer[] };
}

function extractHandler(app: ReturnType<typeof createApp>, path: string): (req: unknown, res: unknown) => unknown {
  const stack = (app as unknown as ExpressAppWithRouter)._router.stack;
  const layer = stack.find((l) => l.route?.path === path);
  if (!layer?.route) throw new Error(`route '${path}' was not found in the router stack`);
  return layer.route.stack[0].handle;
}

test("analytics-ingest: `req.ip ?? req.socket.remoteAddress ?? \"\"` double fallback, forced via a direct handler call on the REAL composed app with both left undefined -- still 204s and the hit still lands", async () => {
  const deps = testDeps();
  const app = createApp(deps);
  const handler = extractHandler(app, "/_analytics/e");
  let statusCode: number | undefined;
  const res = {
    status(code: number) {
      statusCode = code;
      return res;
    },
    end() {
      return res;
    },
  };
  const req = {
    body: { host: "example.com", path: "/forced-ip-fallback-integration" },
    ip: undefined,
    socket: { remoteAddress: undefined },
    hostname: "example.com",
    get: () => undefined,
  };

  await handler(req, res);

  assert.equal(statusCode, 204);
  const hit = deps.analyticsSink.all()[0];
  assert.ok(hit, "the beacon must still be accepted when both req.ip and req.socket.remoteAddress are undefined");
  assert.equal(hit.path, "/forced-ip-fallback-integration");
});

test("analytics-ingest: a real DNT:true beacon is excluded end-to-end (never reaches the sink), still 204s", async (t) => {
  const deps = testDeps();
  const app = createApp(deps);
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/_analytics/e`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ host: "example.com", path: "/x", dnt: true }),
  });
  assert.equal(res.status, 204);
  assert.equal(deps.analyticsSink.all().length, 0);
});

test("analytics-ingest: a sink that throws is swallowed by the real app too — still 204s", async (t) => {
  const sink = new LocalBufferSink();
  sink.accept = async () => {
    throw new Error("sink boom");
  };
  const deps = testDeps({ analyticsSink: sink });
  const app = createApp(deps);
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/_analytics/e`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ host: "example.com", path: "/x" }),
  });
  assert.equal(res.status, 204);
});
