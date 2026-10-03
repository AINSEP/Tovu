import assert from "node:assert/strict";
import test from "node:test";
import { isReadOnlyTool, type ToolExecutionContext } from "@jini-ai/core";
import type { NormalizedHit } from "../index.js";
import { LocalBufferSink } from "../repo.memory.js";
import { buildAnalyticsRegistrations, analyticsDerivedRisk } from "../tool-registrations.js";

const ctx = (input: unknown = {}): ToolExecutionContext => ({ executionId: "e", principal: { id: "owner" }, run: { id: "r" }, input, signal: new AbortController().signal });
const hit = (path: string, overrides: Partial<NormalizedHit> = {}): NormalizedHit => ({ workspaceId: "ws", occurredAt: "2026-10-01T00:00:00Z", kind: "pageview", path, referrerHost: null, deviceClass: "desktop", browserFamily: "Firefox", eventName: null, eventProps: null, utm: { source: null, medium: null, campaign: null, term: null, content: null }, visitorHash: "secret", sessionId: "session", osFamily: null, country: null, region: null, ...overrides });
function harness(allow = true) {
  const sink = new LocalBufferSink([hit("/old"), hit("/a"), hit("/b", { referrerHost: "google.com", deviceClass: "mobile" }), hit("/a", { referrerHost: "google.com", kind: "event", eventName: "click" })]);
  const deps = { workspaceId: "ws", analyticsSink: sink, authorize: async (request: any) => { assert.deepEqual(request, { principalId: "owner", workspaceId: "ws", permission: "analytics.read", entityType: "analytics-hit" }); return { allowed: allow, reason: "fixture grant" }; } };
  return { deps, tool: buildAnalyticsRegistrations(deps)[0]! };
}

test("projects exactly the safe hit fields, never visitorHash or session identity", async () => {
  const { tool } = harness();
  assert.deepEqual(await tool.handler(ctx({ limit: 1 })), { hits: [{ occurredAt: "2026-10-01T00:00:00Z", kind: "event", path: "/a", referrerHost: "google.com", deviceClass: "desktop", browserFamily: "Firefox", eventName: "click" }] });
  const result = await tool.handler(ctx()) as any;
  assert.deepEqual(Object.keys(result), ["hits"]);
  assert.equal(result.hits.length, 4);
  for (const row of result.hits) assert.deepEqual(Object.keys(row).sort(), ["browserFamily", "deviceClass", "eventName", "kind", "occurredAt", "path", "referrerHost"]);
});

test("defaults to 100 and clamps direct handler limits to 1..500 before the sink read", async () => {
  const { deps, tool } = harness();
  for (const [input, expected] of [[{}, 100], [{ limit: 0 }, 1], [{ limit: 1000 }, 500], [{ limit: 17 }, 17]] as const) {
    deps.analyticsSink.list = async (args) => { assert.deepEqual(args, { limit: expected }); return []; };
    assert.deepEqual(await tool.handler(ctx(input)), { hits: [] });
  }
  for (const limit of [1.2, null, "5", Number.NaN, Number.POSITIVE_INFINITY]) await assert.rejects(() => tool.handler(ctx({ limit })), { message: "analytics_list_recent_hits: limit must be a finite integer." });
});

test("exact path filtering applies after the window; summary math includes only returned hits", async () => {
  const { tool } = harness();
  const result = await tool.handler(ctx({ limit: 3, summarize: true })) as any;
  assert.deepEqual(Object.keys(result).sort(), ["hits", "summary"]);
  assert.deepEqual(result.summary, { hits: 3, byPath: [{ path: "/a", hits: 2 }, { path: "/b", hits: 1 }], byReferrerHost: [{ referrerHost: "google.com", hits: 2 }, { referrerHost: null, hits: 1 }], byDeviceClass: { desktop: 2, mobile: 1 } });
  const filtered = await tool.handler(ctx({ limit: 2, path: "/a", summarize: true })) as any;
  assert.equal(filtered.hits.length, 1);
  assert.deepEqual(filtered.summary, { hits: 1, byPath: [{ path: "/a", hits: 1 }], byReferrerHost: [{ referrerHost: "google.com", hits: 1 }], byDeviceClass: { desktop: 1 } });
  assert.deepEqual(await tool.handler(ctx({ path: "/a/", summarize: true })), { hits: [], summary: { hits: 0, byPath: [], byReferrerHost: [], byDeviceClass: {} } });
});

test("top ten summaries sort by count, with deterministic ties", async () => {
  const { deps, tool } = harness();
  deps.analyticsSink = new LocalBufferSink(Array.from({ length: 12 }, (_, n) => hit(`/p${String(n).padStart(2, "0")}`, { referrerHost: `h${String(n).padStart(2, "0")}` })));
  const result = await tool.handler(ctx({ summarize: true })) as any;
  assert.deepEqual(result.summary.byPath, Array.from({ length: 10 }, (_, n) => ({ path: `/p${String(n).padStart(2, "0")}`, hits: 1 })));
  assert.deepEqual(result.summary.byReferrerHost, Array.from({ length: 10 }, (_, n) => ({ referrerHost: `h${String(n).padStart(2, "0")}`, hits: 1 })));
});

test("permission denied prevents sink reads; malformed optional fields are readable refusals", async () => {
  const { deps, tool } = harness(false);
  deps.analyticsSink.list = async () => assert.fail("denied sink read");
  await assert.rejects(() => tool.handler(ctx()), { name: "ToolInputError", message: "ANALYTICS_FORBIDDEN: principal 'owner' is not authorized for 'analytics.read' (fixture grant)" });
  await assert.rejects(() => tool.handler(ctx({ path: 42 })), { message: "analytics_list_recent_hits: path must be a string." });
  await assert.rejects(() => tool.handler(ctx({ summarize: "true" })), { message: "analytics_list_recent_hits: summarize must be a boolean." });
});

test("analytics registration is readOnly", () => {
  assert.equal(isReadOnlyTool({ descriptor: harness().tool.descriptor }), true);
  assert.equal(analyticsDerivedRisk.get("analytics_list_recent_hits"), "none");
});
