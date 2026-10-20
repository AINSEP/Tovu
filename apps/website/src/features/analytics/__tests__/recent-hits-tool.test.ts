import assert from "node:assert/strict";
import test from "node:test";
import { isReadOnlyTool, type ToolExecutionContext } from "@jini-ai/core";
import type { NormalizedHit } from "../index.js";
import { createLocalAnalyticsSink } from "../jini-adapters.js";
import { buildAnalyticsRegistrations, contributeAnalyticsTools, analyticsDerivedRisk } from "../tool-registrations.js";

const ctx = (input: unknown = {}): ToolExecutionContext => ({ executionId: "e", principal: { id: "owner" }, run: { id: "r" }, input, signal: new AbortController().signal });
const hit = (path: string, overrides: Partial<NormalizedHit> = {}): NormalizedHit => ({ workspaceId: "ws", occurredAt: "2026-10-01T00:00:00Z", kind: "pageview", path, referrerHost: null, deviceClass: "desktop", browserFamily: "Firefox", eventName: null, eventProps: null, utm: { source: null, medium: null, campaign: null, term: null, content: null }, visitorHash: "secret", sessionId: "session", osFamily: null, country: null, region: null, ...overrides });
function harness(allow = true) {
  const sink = createLocalAnalyticsSink({}, { initialHits: [hit("/old"), hit("/a"), hit("/b", { referrerHost: "google.com", deviceClass: "mobile" }), hit("/a", { referrerHost: "google.com", kind: "event", eventName: "click" })] });
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
  deps.analyticsSink = createLocalAnalyticsSink({}, { initialHits: Array.from({ length: 12 }, (_, n) => hit(`/p${String(n).padStart(2, "0")}`, { referrerHost: `h${String(n).padStart(2, "0")}` })) });
  const result = await tool.handler(ctx({ summarize: true })) as any;
  assert.deepEqual(result.summary.byPath, Array.from({ length: 10 }, (_, n) => ({ path: `/p${String(n).padStart(2, "0")}`, hits: 1 })));
  assert.deepEqual(result.summary.byReferrerHost, Array.from({ length: 10 }, (_, n) => ({ referrerHost: `h${String(n).padStart(2, "0")}`, hits: 1 })));
});

test("tied referrer counts put direct visits before named hosts regardless of input order", async () => {
  for (const referrers of [[null, "example.test"], ["example.test", null]]) {
    const { deps, tool } = harness();
    deps.analyticsSink = createLocalAnalyticsSink({}, { initialHits: referrers.map(referrerHost => hit("/a", { referrerHost })) });
    const result = await tool.handler(ctx({ summarize: true })) as { summary: unknown };
    assert.deepEqual(result.summary, {
      hits: 2,
      byPath: [{ path: "/a", hits: 2 }],
      byReferrerHost: [{ referrerHost: null, hits: 1 }, { referrerHost: "example.test", hits: 1 }],
      byDeviceClass: { desktop: 2 },
    });
  }
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

test("the analytics contributor builds its read-only recent-hits tool with the supplied dependencies", async () => {
  const { deps } = harness();
  const contributor = contributeAnalyticsTools();
  assert.equal(contributor.domain, "analytics");
  assert.equal(contributor.build, buildAnalyticsRegistrations);
  assert.equal(contributor.risk, analyticsDerivedRisk);
  // The feature needs only its own dependency slice of the assistant's larger build contract.
  const build = contributor.build as typeof buildAnalyticsRegistrations;
  const registrations = build(deps);
  assert.equal(registrations.length, 1);
  const tool = registrations[0]!;
  assert.equal(isReadOnlyTool({ descriptor: tool.descriptor }), true);
  assert.deepEqual(await tool.handler(ctx({ limit: 1 })), { hits: [{
    occurredAt: "2026-10-01T00:00:00Z", kind: "event", path: "/a", referrerHost: "google.com",
    deviceClass: "desktop", browserFamily: "Firefox", eventName: "click",
  }] });
});

test("recent-hit validation rejects each invalid option before authorization or reading", async () => {
  const { deps, tool } = harness();
  deps.authorize = async () => assert.fail("invalid options must not authorize");
  deps.analyticsSink.list = async () => assert.fail("invalid options must not read");
  const cases: Array<{ input: unknown; message: string }> = [
    { input: { limit: "5" }, message: "limit must be a finite integer." },
    { input: { limit: null }, message: "limit must be a finite integer." },
    { input: { limit: NaN }, message: "limit must be a finite integer." },
    { input: { limit: Infinity }, message: "limit must be a finite integer." },
    { input: { limit: -Infinity }, message: "limit must be a finite integer." },
    { input: { limit: 1.5 }, message: "limit must be a finite integer." },
    { input: { path: null }, message: "path must be a string." },
    { input: { path: 1 }, message: "path must be a string." },
    { input: { summarize: null }, message: "summarize must be a boolean." },
    { input: { summarize: "true" }, message: "summarize must be a boolean." },
    { input: { limit: "bad", path: 1, summarize: 1 }, message: "limit must be a finite integer." },
    { input: { path: 1, summarize: 1 }, message: "path must be a string." },
  ];
  for (const { input, message } of cases) {
    await assert.rejects(() => tool.handler(ctx(input)), { name: "ToolInputError", message: `analytics_list_recent_hits: ${message}` });
  }
});

test("valid options preserve defaulting, clamping, empty paths and explicit summary booleans", async () => {
  const { deps, tool } = harness();
  const reads: Array<{ limit?: number } | undefined> = [];
  deps.analyticsSink.list = async input => { reads.push(input); return []; };
  for (const input of [{}, { limit: undefined, path: undefined, summarize: undefined }, { limit: -10, path: "", summarize: false }, { limit: 501, path: "/a", summarize: true }]) {
    const result = await tool.handler(ctx(input));
    const expected = input.summarize
      ? { hits: [], summary: { hits: 0, byPath: [], byReferrerHost: [], byDeviceClass: {} } }
      : { hits: [] };
    assert.deepEqual(result, expected);
  }
  assert.deepEqual(reads, [{ limit: 100 }, { limit: 100 }, { limit: 1 }, { limit: 500 }]);
});

test("recent-hit reads await authorization and propagate unclassified sink failures unchanged", async () => {
  const { deps, tool } = harness();
  const calls: string[] = [];
  deps.authorize = async () => { calls.push("authorize"); return { allowed: true, reason: "fixture grant" }; };
  const failure = new Error("sink unavailable");
  deps.analyticsSink.list = async () => { calls.push("read"); throw failure; };
  await assert.rejects(() => tool.handler(ctx()), error => error === failure);
  assert.deepEqual(calls, ["authorize", "read"]);
});
