import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import express from "express";

import { LocalBufferSink } from "../../../analytics/repo.memory";
import type { NormalizedHit } from "../../../analytics/types";
import {
  registerAdminAnalyticsRecentHitsRoute,
  type AdminAnalyticsRecentHitsDeps,
} from "../../routes/admin/analytics/recent-hits";

/**
 * @file Route-level tests for `GET /api/admin/v1/workspaces/:workspaceId/analytics/recent-hits`.
 *
 * Not wired into `createApp()` yet (out of scope — see task handoff notes), so this builds a
 * standalone Express app with just the route under test, mirroring
 * `packet-one-routes.test.ts`'s node:http + fetch pattern. Auth (`requireAdminSession`) is applied
 * by `app.ts` ahead of every admin registrar in the real app and is intentionally NOT re-tested
 * here — this route registers no auth logic of its own, exactly like every other admin route.
 */

const WORKSPACE_ID = "workspace-1";

function makeHit(overrides: Partial<NormalizedHit> = {}): NormalizedHit {
  return {
    workspaceId: WORKSPACE_ID,
    occurredAt: "2026-07-10T12:00:00.000Z",
    kind: "pageview",
    path: "/",
    referrerHost: null,
    utm: { source: null, medium: null, campaign: null, term: null, content: null },
    country: null,
    region: null,
    deviceClass: "desktop",
    browserFamily: "chrome",
    osFamily: "windows",
    visitorHash: "hash-1",
    sessionId: "session-1",
    eventName: null,
    eventProps: null,
    ...overrides,
  };
}

async function startTestApp(deps: AdminAnalyticsRecentHitsDeps) {
  const app = express();
  registerAdminAnalyticsRecentHitsRoute(app, deps);

  const server = createServer(app);
  server.listen(0);
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

test("GET recent-hits returns the empty list when nothing has been ingested", async (t) => {
  const sink = new LocalBufferSink();
  const { server, baseUrl } = await startTestApp({ workspaceId: WORKSPACE_ID, analyticsSink: sink });
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_ID}/analytics/recent-hits`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { hits: unknown[] };
  assert.deepEqual(body.hits, []);
});

test("GET recent-hits returns hits newest-first with only the honest raw-ingest fields", async (t) => {
  const sink = new LocalBufferSink();
  await sink.acceptBatch([
    makeHit({ path: "/first", occurredAt: "2026-07-10T12:00:00.000Z" }),
    makeHit({ path: "/second", occurredAt: "2026-07-10T12:01:00.000Z" }),
  ]);
  const { server, baseUrl } = await startTestApp({ workspaceId: WORKSPACE_ID, analyticsSink: sink });
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_ID}/analytics/recent-hits`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    hits: Array<Record<string, unknown>>;
  };

  assert.equal(body.hits.length, 2);
  assert.equal(body.hits[0].path, "/second"); // newest first
  assert.equal(body.hits[1].path, "/first");

  const fields = Object.keys(body.hits[0]).sort();
  assert.deepEqual(fields, [
    "browserFamily",
    "deviceClass",
    "eventName",
    "kind",
    "occurredAt",
    "path",
    "referrerHost",
  ]);
  // No PII/internal fields leak through (workspaceId, visitorHash, sessionId, utm, ip, userAgent).
  assert.equal("visitorHash" in body.hits[0], false);
  assert.equal("sessionId" in body.hits[0], false);
  assert.equal("workspaceId" in body.hits[0], false);
});

test("GET recent-hits respects the ?limit= query param", async (t) => {
  const sink = new LocalBufferSink();
  await sink.acceptBatch([makeHit({ path: "/a" }), makeHit({ path: "/b" }), makeHit({ path: "/c" })]);
  const { server, baseUrl } = await startTestApp({ workspaceId: WORKSPACE_ID, analyticsSink: sink });
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_ID}/analytics/recent-hits?limit=1`);
  const body = (await res.json()) as { hits: Array<{ path: string }> };
  assert.equal(body.hits.length, 1);
  assert.equal(body.hits[0].path, "/c"); // most recently accepted
});

test("GET recent-hits ignores a non-numeric ?limit= rather than erroring", async (t) => {
  const sink = new LocalBufferSink();
  await sink.acceptBatch([makeHit(), makeHit(), makeHit()]);
  const { server, baseUrl } = await startTestApp({ workspaceId: WORKSPACE_ID, analyticsSink: sink });
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_ID}/analytics/recent-hits?limit=not-a-number`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { hits: unknown[] };
  assert.equal(body.hits.length, 3); // falls back to the sink's default limit, not an error
});

test("GET recent-hits 404s on a workspace id that does not match the deployed workspace", async (t) => {
  const sink = new LocalBufferSink();
  const { server, baseUrl } = await startTestApp({ workspaceId: WORKSPACE_ID, analyticsSink: sink });
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/some-other-workspace/analytics/recent-hits`);
  assert.equal(res.status, 404);
});
