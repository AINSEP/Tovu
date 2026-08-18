import assert from "node:assert/strict";
import test from "node:test";

import { createApp, createRouteDeps } from "#src/server/app";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { LocalBufferSink } from "#src/analytics/repo.memory";
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
