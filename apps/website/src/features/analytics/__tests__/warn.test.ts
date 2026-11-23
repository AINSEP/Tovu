import assert from "node:assert/strict";
import test from "node:test";

import { createAnalyticsForwarderRegistry, type AnalyticsHooks as EngineHooks, type AnalyticsSiteConfig, type NormalizedHit } from "@jini-ai/analytics";
import { cacheAnalyticsProviders, createAnalyticsForwarding, createPluginAnalyticsHooks, type AnalyticsProviderSet } from "@jini-ai/analytics/site/forwarding";

import { analyticsProviderRouteDeps } from "#src/server/runtime/composition/analytics-providers";
import { warnAnalytics } from "../warn.js";

/**
 * @file The host analytics warn reporter keeps the console output byte-identical to the
 * pre-extraction `[analytics] …` lines, and the composition passes it to every forwarding seam.
 */

const hit = (): NormalizedHit => ({
  workspaceId: "ws-1", occurredAt: "2026-10-21T10:00:00.000Z", kind: "pageview", path: "/a", referrerHost: null,
  utm: { source: null, medium: null, campaign: null, term: null, content: null }, country: null, region: null,
  deviceClass: "desktop", browserFamily: null, osFamily: null, visitorHash: "vh", sessionId: "sid", eventName: null, eventProps: null,
});
const siteConfig = (sink: string): AnalyticsSiteConfig => ({
  workspaceId: "ws-1", enabled: true, honorDoNotTrack: true, honorGlobalPrivacyControl: true, rawRetentionDays: 30,
  excludedPaths: [], excludedIpRanges: [], sink,
});
const providerSet = (hooks: EngineHooks[] = [], refusals: string[] = []): AnalyticsProviderSet =>
  ({ forwarders: createAnalyticsForwarderRegistry({}, { seed: [] }), hooks, refusals });
const throwingHook: EngineHooks = { beforeIngest: async () => { throw new Error("h"); } };
const httpClient = { send: async () => { throw new Error("no network in tests"); } };

test("warnAnalytics writes the pre-extraction console lines for every forwarding seam", async (t) => {
  const logged: unknown[][] = [];
  t.mock.method(console, "warn", (...args: unknown[]) => { logged.push(args); });
  const resolve = createAnalyticsForwarding<string>({
    workspaceId: "ws-1", config: { get: async () => siteConfig("x") }, loadProviders: async () => providerSet(),
    consentAllowsAnalytics: async () => true, resolveCredential: async () => null, httpClient, warn: warnAnalytics,
  });
  assert.deepEqual(await resolve({ request: "r" }), []);
  await createPluginAnalyticsHooks({ loadProviders: async () => providerSet([throwingHook]), warn: warnAnalytics }).beforeIngest({ hit: hit() });
  await cacheAnalyticsProviders({ load: async () => providerSet([], ["refused one"]), clock: { nowMs: () => 0 }, warn: warnAnalytics })();
  assert.deepEqual(logged, [
    ["[analytics] analytics sink 'x' is not installed; hits stay in the built-in sink only"],
    ["[analytics] beforeIngest hook #0 failed and was skipped: beforeIngest handler threw"],
    ["[analytics] refused one"],
  ]);
});

test("analyticsProviderRouteDeps wires the host reporter into forwarders and hooks", async (t) => {
  const logged: unknown[][] = [];
  t.mock.method(console, "warn", (...args: unknown[]) => { logged.push(args); });
  const route = analyticsProviderRouteDeps({
    workspaceId: "ws-1",
    analyticsConfig: { get: async () => siteConfig("x") },
    analyticsProviders: { load: async () => providerSet([throwingHook]), resolveCredential: async () => null, httpClient },
  } as never);
  assert.deepEqual(await route.forwarders?.({ request: {} }), []);
  await route.hooks?.beforeIngest({ hit: hit() });
  assert.deepEqual(logged, [
    ["[analytics] analytics sink 'x' is not installed; hits stay in the built-in sink only"],
    ["[analytics] beforeIngest hook #0 failed and was skipped: beforeIngest handler threw"],
  ]);
});
