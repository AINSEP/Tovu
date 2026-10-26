import assert from "node:assert/strict";
import test from "node:test";

import express from "express";
import type { Logger } from "@jini-ai/core/primitives";
import { defineJsonRoute, mountJsonRoute } from "@jini-ai/http-kit";

import { applyRequestTracking } from "../observability-middleware.js";
import { startTestServer } from "../../../__tests__/helpers/http-test-server.js";
import { createNoopObservabilityPort, type ObservabilityPort, type RequestTrackingInput, type RequestTrackingOutcome } from "#src/platform/observability/index";

const loggingDisabled: NonNullable<Parameters<typeof applyRequestTracking>[1]["env"]> = {
  TOVU_LOG_REQUESTS: undefined,
  TOVU_LOG_SLOW_REQUESTS: undefined,
};

/**
 * @file Unit coverage for `applyRequestTracking` in isolation from the full `createApp()`
 * composition root — a minimal real Express app (not `createApp()`'s ~308 routes) is enough to
 * exercise the real Express routing behavior (`req.route`, `req.baseUrl`, `res.on("finish")`) this
 * middleware depends on; faking those would only re-implement Express's own routing internals
 * incorrectly. `server/runtime/composition/__tests__/observability-wiring.test.ts` separately
 * proves this middleware is actually WIRED into both real composition roots.
 */

function createSpyObservabilityPort(): {
  port: ObservabilityPort;
  calls: Array<{ input: RequestTrackingInput; outcome: RequestTrackingOutcome }>;
} {
  const calls: Array<{ input: RequestTrackingInput; outcome: RequestTrackingOutcome }> = [];
  const port: ObservabilityPort = {
    // The non-request signals are not under test here; the shared no-op keeps the spy a full port.
    ...createNoopObservabilityPort({}),
    trackRequest(input) {
      return {
        end(outcome) {
          calls.push({ input, outcome });
        },
      };
    },
  };
  return { port, calls };
}

function buildTestApp(observability: ObservabilityPort): express.Express {
  const app = express();
  applyRequestTracking(app, { observability, env: loggingDisabled });
  app.get("/welcome", (_req, res) => res.status(200).send("ok"));
  app.post("/error", (_req, res) => res.status(500).json({ ok: false }));
  const adminRouter = express.Router();
  adminRouter.get("/posts/:id", (_req, res) => res.status(200).json({ ok: true }));
  app.use("/api/admin", adminRouter);
  return app;
}

test("records method, raw path, and status for a top-level matched route", async (t) => {
  const { port, calls } = createSpyObservabilityPort();
  const baseUrl = await startTestServer(buildTestApp(port), t);

  const res = await fetch(`${baseUrl}/welcome`);
  assert.equal(res.status, 200);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].input.method, "GET");
  assert.equal(calls[0].input.path, "/welcome");
  assert.equal(calls[0].outcome.statusCode, 200);
  assert.equal(calls[0].outcome.routePattern, "/welcome");
});

test("reconstructs the FULL mount-aware route pattern for a route registered on a sub-router (req.baseUrl + req.route.path), not just the router-local pattern", async (t) => {
  const { port, calls } = createSpyObservabilityPort();
  const baseUrl = await startTestServer(buildTestApp(port), t);

  const res = await fetch(`${baseUrl}/api/admin/posts/abc123`);
  assert.equal(res.status, 200);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].outcome.routePattern, "/api/admin/posts/:id");
});

test('an unmatched request (no route resolves, Express\'s default 404) reports the fixed literal "unmatched", not the raw (unbounded, attacker-controlled) path', async (t) => {
  const { port, calls } = createSpyObservabilityPort();
  const baseUrl = await startTestServer(buildTestApp(port), t);

  const res = await fetch(`${baseUrl}/this/does/not/exist`);
  assert.equal(res.status, 404);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].outcome.routePattern, "unmatched");
  assert.equal(
    calls[0].input.path,
    "/this/does/not/exist",
    "input.path is recorded at request-start (before routing), so it still carries the raw path for attribute-level detail even when nothing matches"
  );
});

test("a 500 response from a matched route is recorded with its real status code", async (t) => {
  const { port, calls } = createSpyObservabilityPort();
  const baseUrl = await startTestServer(buildTestApp(port), t);

  const res = await fetch(`${baseUrl}/error`, { method: "POST" });
  assert.equal(res.status, 500);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].outcome.statusCode, 500);
  assert.equal(calls[0].outcome.routePattern, "/error");
});

test("two concurrent in-flight requests are tracked independently — one request's outcome never contaminates another's", async (t) => {
  const { port, calls } = createSpyObservabilityPort();
  t.mock.method(performance, "now", () => 0);
  const logs: Record<string, unknown>[] = [];
  const firstStarted = Promise.withResolvers<void>();
  const secondStarted = Promise.withResolvers<void>();
  let welcomeResponse: express.Response | undefined;
  let errorResponse: express.Response | undefined;
  const app = express();
  applyRequestTracking(app, { observability: port, env: { ...loggingDisabled, TOVU_LOG_REQUESTS: "1" }, logger: { info: (_input, options) => { logs.push(options!.meta!); } } });
  app.get("/welcome", (_req, res) => { welcomeResponse = res; firstStarted.resolve(); });
  app.post("/error", (_req, res) => { errorResponse = res; secondStarted.resolve(); });
  t.after(() => {
    if (welcomeResponse && !welcomeResponse.writableEnded) welcomeResponse.end();
    if (errorResponse && !errorResponse.writableEnded) errorResponse.end();
  });
  const baseUrl = await startTestServer(app, t);
  const signal = AbortSignal.timeout(3000);
  const first = fetch(`${baseUrl}/welcome`, { signal, headers: { "x-request-id": "first-request" } });
  await Promise.race([firstStarted.promise, first.then(() => assert.fail("first handler must hold its response"))]);
  const second = fetch(`${baseUrl}/error`, { method: "POST", signal, headers: { "x-request-id": "second-request" } });
  await Promise.race([secondStarted.promise, second.then(() => assert.fail("second handler must hold its response"))]);
  assert.equal(calls.length, 0, "both spans must remain open before either response finishes");
  errorResponse!.status(500).json({ ok: false });
  const errorRes = await second;
  await errorRes.text();
  assert.deepEqual(calls, [{ input: { method: "POST", path: "/error" }, outcome: { statusCode: 500, routePattern: "/error" } }]);
  welcomeResponse!.status(200).send("ok");
  const welcomeRes = await first;
  await welcomeRes.text();
  assert.equal(welcomeRes.status, 200);
  assert.equal(errorRes.status, 500);

  assert.equal(calls.length, 2);
  const welcomeCall = calls.find((c) => c.outcome.routePattern === "/welcome");
  const errorCall = calls.find((c) => c.outcome.routePattern === "/error");
  assert.equal(welcomeCall?.outcome.statusCode, 200);
  assert.equal(errorCall?.outcome.statusCode, 500);
  assert.deepEqual(calls, [
    { input: { method: "POST", path: "/error" }, outcome: { statusCode: 500, routePattern: "/error" } },
    { input: { method: "GET", path: "/welcome" }, outcome: { statusCode: 200, routePattern: "/welcome" } },
  ]);
  assert.deepEqual(logs, [
    { requestId: "second-request", method: "POST", routePattern: "/error", statusCode: 500, durationMs: 0 },
    { requestId: "first-request", method: "GET", routePattern: "/welcome", statusCode: 200, durationMs: 0 },
  ]);
});

test("todo-1495: completion logging joins the response and async request context without logging request data", async (t) => {
  t.mock.method(performance, "now", () => 0);
  const entries: Array<{ message: string; options: Parameters<Logger["info"]>[1] }> = [];
  const app = express();
  applyRequestTracking(app, {
    observability: createNoopObservabilityPort({}),
    env: { ...loggingDisabled, TOVU_LOG_REQUESTS: "1" },
    logger: { info: ({ message }, options) => { entries.push({ message, options }); } },
  });
  app.get("/posts/:id", async (_req, res) => {
    await Promise.resolve();
    res.json({ requestId: res.locals.requestId });
  });
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}/posts/private-id?token=secret`, {
    headers: { "x-request-id": "proxy-request-1495", authorization: "Bearer secret" },
  });
  assert.equal(res.headers.get("x-request-id"), "proxy-request-1495");
  assert.deepEqual(await res.json(), { requestId: "proxy-request-1495" });
  assert.deepEqual(entries, [{
    message: "http 200 GET /posts/:id 0ms req=proxy-request-1495",
    options: { meta: { requestId: "proxy-request-1495", method: "GET", routePattern: "/posts/:id", statusCode: 200, durationMs: 0 } },
  }]);
});

test("todo-1495: unmatched requests log the minted response id and a fixed route label", async (t) => {
  t.mock.method(performance, "now", () => 0);
  const entries: Array<{ message: string; options: Parameters<Logger["info"]>[1] }> = [];
  const app = express();
  applyRequestTracking(app, {
    observability: createNoopObservabilityPort({}),
    env: { ...loggingDisabled, TOVU_LOG_REQUESTS: "1" },
    logger: { info: ({ message }, options) => { entries.push({ message, options }); } },
  });
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}/private-path?token=secret`, { headers: { "x-request-id": "unsafe id" } });
  await res.text();
  const requestId = res.headers.get("x-request-id");
  assert.match(requestId!, /^[0-9a-f-]{36}$/);
  assert.deepEqual(entries, [{
    message: `http 404 GET unmatched 0ms req=${requestId}`,
    options: { meta: { requestId, method: "GET", routePattern: "unmatched", statusCode: 404, durationMs: 0 } },
  }]);
});

test("the default binding keeps failed request completions silent", async (t) => {
  t.mock.method(performance, "now", () => 0);
  const info = t.mock.method(console, "info", () => {});
  const baseUrl = await startTestServer(buildTestApp(createNoopObservabilityPort({})), t);
  const res = await fetch(`${baseUrl}/error`, { method: "POST", headers: { "x-request-id": "default-logger" } });
  await res.text();
  assert.deepEqual(info.mock.calls.map(call => call.arguments), []);
});

for (const scenario of [
  { name: "disabled", env: {}, completionLogged: false },
  { name: "all requests enabled", env: { TOVU_LOG_REQUESTS: "1" }, completionLogged: true },
  { name: "below explicit slow threshold", env: { TOVU_LOG_SLOW_REQUESTS: "50" }, completionLogged: false },
  { name: "above explicit slow threshold", env: { TOVU_LOG_SLOW_REQUESTS: "5" }, completionLogged: true },
]) {
  test(`completion logging ${scenario.name} preserves the existing internal-error sink and response request id`, async (t) => {
    let now = 100;
    t.mock.method(performance, "now", () => now);
    const info = t.mock.method(console, "info", () => {});
    const error = t.mock.method(console, "error", () => {});
    const failure = new Error("handler failed");
    const app = express();
    applyRequestTracking(app, { observability: createNoopObservabilityPort({}), env: { ...loggingDisabled, ...scenario.env } });
    mountJsonRoute({
      app,
      deps: {},
      spec: defineJsonRoute<void, never, unknown>({
        method: "get", path: "/boom", parse: () => ({ ok: true, value: undefined }),
        handle: () => { now += 10; throw failure; },
      }),
    });
    const baseUrl = await startTestServer(app, t);
    const res = await fetch(`${baseUrl}/boom`, { headers: { "x-request-id": "failed-request" } });
    assert.equal(res.status, 500);
    assert.equal(res.headers.get("x-request-id"), "failed-request");
    const body = await res.json() as { error: { code: string; requestId: string } };
    assert.equal(body.error.code, "INTERNAL_ERROR");
    assert.match(body.error.requestId, /^[0-9a-f-]{36}$/);
    assert.deepEqual(error.mock.calls.map(call => call.arguments), [[
      `[@jini-ai/http-kit] internal error (GET /boom, correlationId=${body.error.requestId})`, failure,
    ]]);
    assert.deepEqual(info.mock.calls.map(call => call.arguments), scenario.completionLogged ? [[
      "http 500 GET /boom 10ms req=failed-request",
    ]] : []);
  });
}

for (const scenario of [
  { name: "fast success", statusCode: 200, durationMs: 10, env: {}, logged: false },
  { name: "cached asset", statusCode: 304, durationMs: 10, env: {}, logged: false },
  { name: "fast failure", statusCode: 500, durationMs: 10, env: {}, logged: false },
  { name: "slow request without opt-in", statusCode: 200, durationMs: 60_000, env: {}, logged: false },
  { name: "slow failure without opt-in", statusCode: 503, durationMs: 60_000, env: {}, logged: false },
  { name: "exact default threshold", statusCode: 200, durationMs: 1000, env: {}, logged: false },
  { name: "custom slow request", statusCode: 200, durationMs: 51, env: { TOVU_LOG_SLOW_REQUESTS: "50" }, logged: true },
  { name: "exact custom threshold", statusCode: 200, durationMs: 50, env: { TOVU_LOG_SLOW_REQUESTS: "50" }, logged: false },
  { name: "zero threshold", statusCode: 200, durationMs: 1, env: { TOVU_LOG_SLOW_REQUESTS: "0" }, logged: true },
  { name: "blank threshold", statusCode: 200, durationMs: 10, env: { TOVU_LOG_SLOW_REQUESTS: " " }, logged: false },
  { name: "invalid threshold", statusCode: 200, durationMs: 60_000, env: { TOVU_LOG_SLOW_REQUESTS: "invalid" }, logged: false },
  { name: "negative threshold", statusCode: 500, durationMs: 60_000, env: { TOVU_LOG_SLOW_REQUESTS: "-1" }, logged: false },
  { name: "infinite threshold", statusCode: 200, durationMs: 60_000, env: { TOVU_LOG_SLOW_REQUESTS: "Infinity" }, logged: false },
  { name: "blank threshold on a slow request", statusCode: 200, durationMs: 60_000, env: { TOVU_LOG_SLOW_REQUESTS: " " }, logged: false },
  { name: "fast failure below explicit threshold", statusCode: 500, durationMs: 10, env: { TOVU_LOG_SLOW_REQUESTS: "50" }, logged: false },
  { name: "slow failure above explicit threshold", statusCode: 503, durationMs: 51, env: { TOVU_LOG_SLOW_REQUESTS: "50" }, logged: true },
  { name: "both flags emit only once", statusCode: 500, durationMs: 51, env: { TOVU_LOG_REQUESTS: "1", TOVU_LOG_SLOW_REQUESTS: "50" }, logged: true },
  { name: "full logging ignores invalid slow threshold", statusCode: 200, durationMs: 10, env: { TOVU_LOG_REQUESTS: "1", TOVU_LOG_SLOW_REQUESTS: "invalid" }, logged: true },
  { name: "full logging", statusCode: 304, durationMs: 10, env: { TOVU_LOG_REQUESTS: "1" }, logged: true },
  { name: "other flag values stay disabled", statusCode: 200, durationMs: 10, env: { TOVU_LOG_REQUESTS: "true" }, logged: false },
]) {
  test(`request logging policy: ${scenario.name} preserves tracking and correlation`, async (t) => {
    let now = 100;
    t.mock.method(performance, "now", () => now);
    const info = t.mock.method(console, "info", () => {});
    const { port, calls } = createSpyObservabilityPort();
    const app = express();
    applyRequestTracking(app, { observability: port, env: { ...loggingDisabled, ...scenario.env } });
    app.get("/admin/:asset", (_req, res) => {
      now += scenario.durationMs;
      res.status(scenario.statusCode).end();
    });
    const baseUrl = await startTestServer(app, t);
    const res = await fetch(`${baseUrl}/admin/private.js?token=secret`, { headers: { "x-request-id": "policy-request" } });
    await res.text();
    assert.equal(res.headers.get("x-request-id"), "policy-request");
    assert.deepEqual(calls, [{
      input: { method: "GET", path: "/admin/private.js" },
      outcome: { statusCode: scenario.statusCode, routePattern: "/admin/:asset" },
    }]);
    assert.deepEqual(info.mock.calls.map(call => call.arguments), scenario.logged ? [[
      `http ${scenario.statusCode} GET /admin/:asset ${scenario.durationMs}ms req=policy-request`,
    ]] : []);
  });
}

test("the rest of the request runs inside the tracker's scope, so spans a handler starts are the request span's children", async (t) => {
  let inside = false;
  const handlerSawScope: boolean[] = [];
  const port: ObservabilityPort = {
    ...createNoopObservabilityPort({}),
    trackRequest() {
      return {
        end() {},
        run<T>(fn: () => T): T {
          inside = true;
          try {
            return fn();
          } finally {
            inside = false;
          }
        },
      };
    },
  };
  const app = express();
  applyRequestTracking(app, { observability: port });
  app.get("/scoped", (_req, res) => {
    handlerSawScope.push(inside);
    res.status(204).end();
  });
  const baseUrl = await startTestServer(app, t);

  assert.equal((await fetch(`${baseUrl}/scoped`)).status, 204);
  assert.deepEqual(handlerSawScope, [true]);
});

test("a tracker without run() (an adapter written before scoping) still lets the request through", async (t) => {
  const port: ObservabilityPort = { ...createNoopObservabilityPort({}), trackRequest: () => ({ end() {} }) };
  const app = express();
  applyRequestTracking(app, { observability: port });
  app.get("/plain", (_req, res) => res.status(200).send("ok"));
  const baseUrl = await startTestServer(app, t);
  assert.equal((await fetch(`${baseUrl}/plain`)).status, 200);
});

test("site-share artifact transfers bypass tracing entirely and carry no request id, while the route still serves", async (t) => {
  const { port, calls } = createSpyObservabilityPort();
  const app = buildTestApp(port);
  app.get("/api/admin/site-shares/artifacts/:token", (_req, res) => res.status(200).send("bytes"));
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/api/admin/Site-Shares/Artifacts/secret-token`);
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "bytes");
  assert.equal(res.headers.get("x-request-id"), null);
  assert.equal(calls.length, 0);
});


test("a synchronous 503 exports its exception before ending the SDK request span, once", async (t) => {
  const { createInMemoryOtel } = await import("#src/platform/observability/__tests__/fixtures/in-memory-otel");
  const { port, exporter } = createInMemoryOtel();
  const app = express();
  applyRequestTracking(app, { observability: port, env: loggingDisabled });
  app.get("/unavailable", (_req, res) => res.status(503).end());
  const baseUrl = await startTestServer(app, t);
  assert.equal((await fetch(`${baseUrl}/unavailable`)).status, 503);
  const spans = exporter.getFinishedSpans();
  assert.equal(spans.length, 1);
  assert.equal(spans[0]!.name, "GET /unavailable");
  const exceptions = spans[0]!.events.filter(event => event.name === "exception");
  assert.equal(exceptions.length, 1);
  assert.equal(exceptions[0]!.attributes?.["exception.type"], "ServerErrorResponse");
  assert.equal(exceptions[0]!.attributes?.["operation.name"], "http.request");
});
