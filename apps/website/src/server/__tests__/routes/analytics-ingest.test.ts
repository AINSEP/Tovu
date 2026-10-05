import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import express from "express";

import type { Clock as ClockPort, IdGenerator as IdGeneratorPort, UUID } from "@jini-ai/core/primitives";
import type { AnalyticsConfigPort } from "#src/features/analytics/index";
import type { AnalyticsSiteConfig } from "#src/features/analytics/index";
import { createLocalAnalyticsSink } from "#src/features/analytics/jini-adapters";
import type { AnalyticsIngestRouteDeps } from "#src/features/analytics/jini-adapters";
import { registerAnalyticsIngestRoute } from "../../inbound/public-http/routes/site/analytics-ingest.js";

/**
 * @file Route-level tests for `POST /_analytics/e` (the public beacon endpoint).
 *
 * This route is not wired into `createApp()` yet (out of scope — see task handoff notes), so
 * these tests build a minimal standalone Express app with only `express.json()` and the route
 * under test registered, following the same node:http + fetch pattern as
 * `packet-one-routes.test.ts`.
 */

const ANALYTICS_SEED = "test-site-key-seed-do-not-use-in-prod";

function makeConfig(overrides: Partial<AnalyticsSiteConfig> = {}): AnalyticsSiteConfig {
  return {
    workspaceId: "workspace-1",
    enabled: true,
    honorDoNotTrack: true,
    honorGlobalPrivacyControl: true,
    rawRetentionDays: 30,
    excludedPaths: [],
    excludedIpRanges: [],
    sink: "local",
    ...overrides,
  };
}

function makeConfigPort(config: AnalyticsSiteConfig): AnalyticsConfigPort {
  return { async get() { return config; } };
}

const clock: ClockPort = { nowMs: () => Date.parse("2026-07-10T12:00:00.000Z") };
const ids: IdGeneratorPort = { newId: () => "id-1" as UUID };

async function startTestApp(deps: AnalyticsIngestRouteDeps) {
  const app = express();
  app.use(express.json());
  registerAnalyticsIngestRoute(app, deps);

  const server = createServer(app);
  server.listen(0);
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

function makeDeps(overrides: Partial<AnalyticsIngestRouteDeps> = {}): { deps: AnalyticsIngestRouteDeps; sink: ReturnType<typeof createLocalAnalyticsSink> } {
  const sink = createLocalAnalyticsSink({});
  const deps: AnalyticsIngestRouteDeps = {
    clock,
    ids,
    sink,
    config: makeConfigPort(makeConfig()),
    resolveWorkspaceForHost: async (host: string) => (host === "example.com" ? "workspace-1" : null),
    analyticsSeed: ANALYTICS_SEED,
    ...overrides,
  };
  return { deps, sink };
}

test("POST /_analytics/e accepts a clean beacon, returns 204, and stores a normalized hit", async (t) => {
  const { deps, sink } = makeDeps();
  const { server, baseUrl } = await startTestApp(deps);
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const res = await fetch(`${baseUrl}/_analytics/e`, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0 (Windows NT 10.0) Chrome/126.0" },
    body: JSON.stringify({ host: "example.com", path: "/blog/hello", referrer: "https://google.com/search", kind: "pageview" }),
  });

  assert.equal(res.status, 204);
  const bodyText = await res.text();
  assert.equal(bodyText, "");

  const stored = sink.all();
  assert.equal(stored.length, 1);
  assert.equal(stored[0].path, "/blog/hello");
  assert.equal(stored[0].referrerHost, "google.com");
  assert.equal(stored[0].deviceClass, "desktop");
  assert.equal(stored[0].browserFamily, "chrome");
  assert.equal(stored[0].osFamily, "windows");
  assert.equal(Object.hasOwn(stored[0], "ip"), false);
  assert.equal(Object.hasOwn(stored[0], "userAgent"), false);
  assert.ok(!JSON.stringify(stored[0]).includes("Mozilla/5.0"));
});

test("POST /_analytics/e never leaks accept/reject: an unresolvable host still returns 204 with an empty body", async (t) => {
  const { deps, sink } = makeDeps({ resolveWorkspaceForHost: async () => null });
  const { server, baseUrl } = await startTestApp(deps);
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const res = await fetch(`${baseUrl}/_analytics/e`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ host: "unknown-host.test", path: "/", kind: "pageview" }),
  });

  assert.equal(res.status, 204);
  assert.equal(await res.text(), "");
  assert.equal(sink.all().length, 0);
});

test("POST /_analytics/e never leaks accept/reject: PII-shaped event props are dropped silently (still 204)", async (t) => {
  const { deps, sink } = makeDeps();
  const { server, baseUrl } = await startTestApp(deps);
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const res = await fetch(`${baseUrl}/_analytics/e`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      host: "example.com",
      path: "/signup",
      kind: "event",
      eventName: "signup",
      eventProps: { email: "someone@example.com" },
    }),
  });

  assert.equal(res.status, 204);
  assert.equal(sink.all().length, 0);
});

test("POST /_analytics/e tolerates a malformed/empty body without throwing (still 204, nothing stored)", async (t) => {
  const { deps, sink } = makeDeps();
  const { server, baseUrl } = await startTestApp(deps);
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const res = await fetch(`${baseUrl}/_analytics/e`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });

  assert.equal(res.status, 204);
  // host falls back to the request's own hostname (127.0.0.1 in this test), which never
  // resolves to a workspace here, so nothing should be stored.
  assert.equal(sink.all().length, 0);
});

test("POST /_analytics/e rejects an array masquerading as eventProps rather than crashing", async (t) => {
  const { deps, sink } = makeDeps();
  const { server, baseUrl } = await startTestApp(deps);
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const res = await fetch(`${baseUrl}/_analytics/e`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ host: "example.com", path: "/x", kind: "event", eventName: "e", eventProps: ["not", "an", "object"] }),
  });

  assert.equal(res.status, 204);
  const stored = sink.all();
  assert.equal(stored.length, 1);
  assert.equal(stored[0].eventProps, null);
});

for (const [signal, policy] of [["dnt", "honorDoNotTrack"], ["gpc", "honorGlobalPrivacyControl"]] as const) {
  for (const honor of [true, false]) {
    test(`POST /_analytics/e ${honor ? "honors" : "can disable honoring"} ${signal} at the HTTP boundary`, async (t) => {
      const { deps, sink } = makeDeps({ config: makeConfigPort(makeConfig({ [policy]: honor })) });
      const { server, baseUrl } = await startTestApp(deps);
      t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
      const beacon = { host: "example.com", path: "/privacy-control", kind: "pageview" };
      const control = await fetch(`${baseUrl}/_analytics/e`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(beacon),
      });
      assert.equal(control.status, 204);
      assert.equal(await control.text(), "");
      assert.equal(sink.all().length, 1, "the same beacon without opt-out must be accepted");
      const optedOut = await fetch(`${baseUrl}/_analytics/e`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...beacon, [signal]: true }),
      });
      assert.equal(optedOut.status, 204);
      assert.equal(await optedOut.text(), "");
      assert.equal(sink.all().length, honor ? 1 : 2);
    });
  }
}

for (const failingDependency of ["resolver", "sink"] as const) {
  test(`POST /_analytics/e conceals an unexpected ${failingDependency} failure behind an empty 204`, async (t) => {
    let failureReached = false;
    const fail = async () => {
      failureReached = true;
      throw new Error("private ingestion failure details");
    };
    const { deps, sink } = makeDeps(failingDependency === "resolver"
      ? { resolveWorkspaceForHost: fail }
      : {});
    if (failingDependency === "sink") t.mock.method(sink, "accept", fail);
    const { server, baseUrl } = await startTestApp(deps);
    t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
    const res = await fetch(`${baseUrl}/_analytics/e`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ host: "example.com", path: "/failure-control", kind: "pageview" }),
    });
    assert.equal(failureReached, true, "the request must actually reach the throwing dependency");
    assert.equal(res.status, 204);
    assert.equal(await res.text(), "");
    assert.equal(sink.all().length, 0);
  });
}
