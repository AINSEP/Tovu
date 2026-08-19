import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import express from "express";

import type { ClockPort, IdGeneratorPort, UUID } from "@jini-ai/cms/core";
import type { AnalyticsConfigPort } from "#src/analytics/index";
import type { AnalyticsSiteConfig } from "#src/analytics/index";
import { LocalBufferSink } from "#src/analytics/repo.memory";
import type { IngestHitDeps } from "#src/analytics/ingest";
import { registerAnalyticsIngestRoute } from "../../routes/site/analytics-ingest.js";

/**
 * @file Route-level tests for `POST /_analytics/e` (the public beacon endpoint).
 *
 * This route is not wired into `createApp()` yet (out of scope — see task handoff notes), so
 * these tests build a minimal standalone Express app with only `express.json()` and the route
 * under test registered, following the same node:http + fetch pattern as
 * `packet-one-routes.test.ts`.
 */

const ROOT_KEY_SEED = "test-root-key-seed-do-not-use-in-prod";

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

const clock: ClockPort = { nowIso: () => "2026-07-10T12:00:00.000Z" };
const ids: IdGeneratorPort = { newId: () => "id-1" as UUID };

async function startTestApp(deps: IngestHitDeps) {
  const app = express();
  app.use(express.json());
  registerAnalyticsIngestRoute(app, deps);

  const server = createServer(app);
  server.listen(0);
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

function makeDeps(overrides: Partial<IngestHitDeps> = {}): { deps: IngestHitDeps; sink: LocalBufferSink } {
  const sink = new LocalBufferSink();
  const deps: IngestHitDeps = {
    clock,
    ids,
    sink,
    config: makeConfigPort(makeConfig()),
    resolveWorkspaceForHost: async (host: string) => (host === "example.com" ? "workspace-1" : null),
    rootKeySeed: ROOT_KEY_SEED,
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
