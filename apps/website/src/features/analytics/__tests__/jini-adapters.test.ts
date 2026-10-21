import assert from "node:assert/strict";
import test from "node:test";

import { createAnalyticsForwardLimiter } from "@jini-ai/analytics";

import { analyticsPrivacyPolicy, analyticsSaltContext, createAnalyticsIngestBinding, createLocalAnalyticsSink, type AnalyticsIngestRouteDeps } from "../jini-adapters.js";
import type { NormalizedHit } from "../types.js";

const hit = (path: string): NormalizedHit => ({
  workspaceId: "ws-1", occurredAt: "2026-10-21T10:00:00.000Z", kind: "pageview", path, referrerHost: null,
  utm: { source: null, medium: null, campaign: null, term: null, content: null }, country: null, region: null,
  deviceClass: "desktop", browserFamily: null, osFamily: null, visitorHash: "vh", sessionId: "sid", eventName: null, eventProps: null,
});

function hostDeps(sink = createLocalAnalyticsSink({})): AnalyticsIngestRouteDeps & { sink: ReturnType<typeof createLocalAnalyticsSink> } {
  return {
    clock: { nowIso: () => "2026-10-21T10:00:00.000Z", nowMs: () => 0 } as never,
    ids: { newId: () => "id" } as never,
    sink,
    config: { get: async () => { throw new Error("unused"); } },
    resolveWorkspaceForHost: () => "ws-1",
    analyticsSeed: "seed",
  };
}

test("binding: the fan-out sink delegates every primary method to the host sink and passes host presets", async () => {
  const deps = hostDeps();
  const { deps: bound, optional } = createAnalyticsIngestBinding({ deps });
  assert.deepEqual(optional, {});
  assert.equal(bound.privacyPolicy, analyticsPrivacyPolicy);
  assert.equal(bound.saltContext, analyticsSaltContext);
  assert.equal(bound.rootKeySeed, "seed");
  assert.equal(await bound.resolveWorkspaceForHost({ host: "example.com" }), "ws-1");
  assert.deepEqual(bound.sink.capabilities({}), { durable: false, batch: true });
  await bound.sink.accept({ hit: hit("/a") });
  await bound.sink.acceptBatch({ hits: [hit("/b"), hit("/c")] });
  assert.deepEqual((await bound.sink.list({}, { limit: 2 })).map((h) => h.path), ["/c", "/b"]);
  assert.deepEqual(deps.sink.all().map((h) => h.path), ["/a", "/b", "/c"]);
});

test("binding: forwarders receive batch hits too, and host hooks are adapted to the engine shape", async () => {
  const forwarded: string[] = [];
  const deps = { ...hostDeps(), hooks: { beforeIngest: async (h: NormalizedHit) => ({ ...h, path: `${h.path}!` }) } };
  const { deps: bound, optional } = createAnalyticsIngestBinding({ deps }, {
    forwarders: [{ id: "v", context: { workspaceId: "ws-1", mode: "live" }, forwarder: { forward: async ({ hit: h }) => {
      forwarded.push(h.path); return { status: "ok", value: undefined };
    } } }],
  });
  await bound.sink.acceptBatch({ hits: [hit("/x"), hit("/y")] });
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(forwarded, ["/x", "/y"]);
  assert.equal((await optional.hooks!.beforeIngest({ hit: hit("/h") }))?.path, "/h!");
});

test("createLocalAnalyticsSink seeds initial hits and exposes all()", async () => {
  const sink = createLocalAnalyticsSink({}, { initialHits: [hit("/seed")] });
  assert.deepEqual(sink.all().map((h) => h.path), ["/seed"]);
  assert.deepEqual((await sink.list()).map((h) => h.path), ["/seed"]);
});

test("binding: a shared limiter over its cap drops the forward but the built-in sink still accepts", async () => {
  const limiter = createAnalyticsForwardLimiter({}, { maxInFlight: 0 });
  const warn = console.warn;
  const logged: unknown[] = [];
  console.warn = (m: unknown) => { logged.push(m); };
  try {
    const deps = hostDeps();
    const { deps: bound } = createAnalyticsIngestBinding({ deps }, {
      limiter,
      forwarders: [{ id: "v", context: { workspaceId: "ws-1", mode: "live" }, forwarder: { forward: async () => { throw new Error("must not run"); } } }],
    });
    await bound.sink.accept({ hit: hit("/kept") });
    assert.deepEqual(deps.sink.all().map((h) => h.path), ["/kept"]);
  } finally {
    console.warn = warn;
  }
  assert.deepEqual(logged, ["[analytics] forward to 'v' dropped: too many vendor calls in flight"]);
});
