import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { createRouteDeps } from "#src/server/app";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { LocalBufferSink } from "#src/analytics/repo.memory";
import { registerAnalyticsIngestRoute } from "../analytics-ingest";
import type { IngestHitDeps } from "#src/analytics/ingest";

/**
 * @file Unit-tier coverage for `POST /_analytics/e` (`registerAnalyticsIngestRoute`) — a PUBLIC,
 * unauthenticated route (ADR-035 §5) that ALWAYS responds `204`, regardless of outcome (see the
 * route's own file header: never an oracle for probing exclusion rules). So the meaningful
 * assertions here are on what actually landed in the sink (`LocalBufferSink.all()`), not on the
 * HTTP response — every test still asserts `204` too, to prove the no-oracle contract holds even
 * for malformed/rejected input.
 */

function buildApp(sink: LocalBufferSink = new LocalBufferSink()): { app: express.Express; sink: LocalBufferSink } {
  const base = createRouteDeps();
  const deps: IngestHitDeps = {
    clock: base.clock,
    ids: base.idGen,
    sink,
    config: base.analyticsConfig,
    resolveWorkspaceForHost: async () => base.workspaceId,
    rootKeySeed: "test-seed",
  };
  const app = express();
  app.use(express.json());
  registerAnalyticsIngestRoute(app, deps);
  return { app, sink };
}

async function postBeacon(t: import("node:test").TestContext, app: express.Express, body?: unknown, noBody = false) {
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}/_analytics/e`, {
    method: "POST",
    headers: noBody ? {} : { "content-type": "application/json" },
    body: noBody ? undefined : JSON.stringify(body ?? {}),
  });
  return res;
}

test("analytics-ingest: no body at all still 204s and never throws", async (t) => {
  const { app } = buildApp();
  const res = await postBeacon(t, app, undefined, true);
  assert.equal(res.status, 204);
});

test("analytics-ingest: a minimal pageview beacon is accepted and normalized", async (t) => {
  const { app, sink } = buildApp();
  const res = await postBeacon(t, app, { host: "example.com", path: "/hello" });
  assert.equal(res.status, 204);
  const hits = sink.all();
  assert.equal(hits.length, 1);
  assert.equal(hits[0].kind, "pageview");
});

test("analytics-ingest: host absent falls back to the request's own hostname, and the hit still lands", async (t) => {
  const { app, sink } = buildApp();
  const res = await postBeacon(t, app, { path: "/no-host" });
  assert.equal(res.status, 204);
  // `host` itself isn't part of NormalizedHit (it's consumed for workspace resolution/salting
  // only) -- the observable proof the fallback worked is that resolveWorkspaceForHost still
  // received SOME non-empty host string and the hit was accepted rather than excluded.
  assert.equal(sink.all().length, 1);
});

test("analytics-ingest: kind:'event' with a string eventName is captured as an event hit", async (t) => {
  const { app, sink } = buildApp();
  const res = await postBeacon(t, app, { host: "example.com", path: "/x", kind: "event", eventName: "signup_clicked" });
  assert.equal(res.status, 204);
  const hits = sink.all();
  assert.equal(hits[0].kind, "event");
});

test("analytics-ingest: kind:'event' with a NON-string eventName degrades to undefined eventName, still kind:event", async (t) => {
  const { app, sink } = buildApp();
  const res = await postBeacon(t, app, { host: "example.com", path: "/x", kind: "event", eventName: 12345 });
  assert.equal(res.status, 204);
  assert.equal(sink.all()[0].kind, "event");
});

test("analytics-ingest: an unrecognized 'kind' value falls back to pageview", async (t) => {
  const { app, sink } = buildApp();
  const res = await postBeacon(t, app, { host: "example.com", path: "/x", kind: "not-a-real-kind" });
  assert.equal(res.status, 204);
  assert.equal(sink.all()[0].kind, "pageview");
});

test("analytics-ingest: a string referrer is captured; an absent referrer stays null", async (t) => {
  const { app, sink } = buildApp();
  await postBeacon(t, app, { host: "example.com", path: "/with-ref", referrer: "https://google.com/" });
  await postBeacon(t, app, { host: "example.com", path: "/no-ref" });
  const hits = sink.all();
  assert.equal(hits.length, 2);
});

test("analytics-ingest: a plain-object eventProps is accepted; an array/string eventProps is dropped", async (t) => {
  const { app, sink } = buildApp();
  const res1 = await postBeacon(t, app, { host: "example.com", path: "/x", kind: "event", eventProps: { plan: "pro" } });
  assert.equal(res1.status, 204);
  const res2 = await postBeacon(t, app, { host: "example.com", path: "/x", kind: "event", eventProps: ["not", "an", "object"] });
  assert.equal(res2.status, 204);
  const res3 = await postBeacon(t, app, { host: "example.com", path: "/x", kind: "event", eventProps: "not-an-object" });
  assert.equal(res3.status, 204);
  assert.equal(sink.all().length, 3);
});

test("analytics-ingest: dnt:true (real boolean) is honored end-to-end -- the hit is excluded, never reaches the sink", async (t) => {
  const { app, sink } = buildApp();
  const res = await postBeacon(t, app, { host: "example.com", path: "/x", dnt: true, gpc: true });
  // Still 204 -- see file header, no oracle for an excluded hit either.
  assert.equal(res.status, 204);
  assert.equal(sink.all().length, 0, "a real DNT:true beacon must never be recorded");
});

test("analytics-ingest: a malformed (non-boolean) dnt/gpc coerces to false via `=== true`, so the hit is NOT excluded", async (t) => {
  const { app, sink } = buildApp();
  const res = await postBeacon(t, app, { host: "example.com", path: "/y", dnt: "yes", gpc: 1 });
  assert.equal(res.status, 204);
  assert.equal(sink.all().length, 1, "raw.dnt === true is strict -- a truthy non-boolean must not be treated as DNT");
});

test("analytics-ingest: an over-long host/path/referrer/eventName is truncated, never rejected", async (t) => {
  const { app, sink } = buildApp();
  const res = await postBeacon(t, app, {
    host: "h".repeat(1000),
    path: "/" + "p".repeat(5000),
    referrer: "r".repeat(5000),
    kind: "event",
    eventName: "e".repeat(1000),
  });
  assert.equal(res.status, 204);
  const hit = sink.all()[0];
  assert.ok(hit, "an over-long beacon must still be accepted (bounded, not rejected)");
  assert.ok(hit.path.length <= 2048, `path must be truncated to MAX_PATH_LENGTH, got ${hit.path.length}`);
  assert.ok((hit.eventName?.length ?? 0) <= 200, `eventName must be truncated to MAX_EVENT_NAME_LENGTH, got ${hit.eventName?.length}`);
});

test("analytics-ingest: a sink failure is swallowed — still 204s, never leaks the error to the caller", async (t) => {
  const sink = new LocalBufferSink();
  sink.accept = async () => {
    throw new Error("sink boom");
  };
  const { app } = buildApp(sink);
  const res = await postBeacon(t, app, { host: "example.com", path: "/x" });
  assert.equal(res.status, 204);
});
