import assert from "node:assert/strict";
import test from "node:test";

import { createAnalyticsForwarderRegistry, type AnalyticsForwarderModule, type AnalyticsHooks as EngineHooks } from "@jini-ai/analytics";

import { cacheAnalyticsProviders, createAnalyticsForwarding, createPluginAnalyticsHooks, type AnalyticsProviderSet } from "../forwarding.js";
import type { AnalyticsSiteConfig, NormalizedHit } from "../types.js";

const hit = (path = "/a"): NormalizedHit => ({
  workspaceId: "ws-1", occurredAt: "2026-10-21T10:00:00.000Z", kind: "pageview", path, referrerHost: null,
  utm: { source: null, medium: null, campaign: null, term: null, content: null }, country: null, region: null,
  deviceClass: "desktop", browserFamily: null, osFamily: null, visitorHash: "vh", sessionId: "sid", eventName: null, eventProps: null,
});

const siteConfig = (sink: string): AnalyticsSiteConfig => ({
  workspaceId: "ws-1", enabled: true, honorDoNotTrack: true, honorGlobalPrivacyControl: true, rawRetentionDays: 30,
  excludedPaths: [], excludedIpRanges: [], sink,
});

function vendor(credentialLabel?: string) {
  const created: unknown[] = [];
  const module: AnalyticsForwarderModule = {
    ...(credentialLabel ? { credentialLabel } : {}),
    create: (input) => { created.push(input); return { forward: async () => ({ status: "ok", value: undefined }) }; },
  };
  return { module, created };
}

function providerSet(modules: Record<string, AnalyticsForwarderModule>, hooks: EngineHooks[] = [], refusals: string[] = []): AnalyticsProviderSet {
  return { forwarders: createAnalyticsForwarderRegistry({}, { seed: Object.entries(modules).map(([id, provider]) => ({ id, provider })) }), hooks, refusals };
}

const httpClient = { send: async () => { throw new Error("no network in tests"); } };

function forwarding(overrides: Partial<Parameters<typeof createAnalyticsForwarding<string>>[0]> & { sink?: string } = {}) {
  const warnings: string[] = [];
  const calls = { consent: 0, load: 0, credential: [] as string[] };
  const { sink = "plausible", ...rest } = overrides;
  const resolve = createAnalyticsForwarding<string>({
    workspaceId: "ws-1",
    config: { get: async () => siteConfig(sink) },
    loadProviders: async () => { calls.load++; return providerSet({}); },
    consentAllowsAnalytics: async () => { calls.consent++; return true; },
    resolveCredential: async ({ label }) => { calls.credential.push(label); return null; },
    httpClient,
    ...rest,
  }, { warn: (m) => warnings.push(m) });
  return { resolve, warnings, calls };
}

test("\"local\" forwards nowhere without loading plugins or reading consent", async () => {
  const { resolve, calls, warnings } = forwarding({ sink: "local", loadProviders: async () => { calls.load++; return providerSet({}); } });
  assert.deepEqual(await resolve({ request: "req" }), []);
  assert.deepEqual(warnings, []);
  assert.equal(calls.consent, 0);
  assert.equal(calls.load, 0);
  const empty = forwarding({ sink: "" });
  assert.deepEqual(await empty.resolve({ request: "req" }), []);
  assert.equal(empty.calls.load, 0);
});

test("a selected, consented, credential-free vendor is bound with a live context", async () => {
  const v = vendor();
  const { resolve, calls } = forwarding({ loadProviders: async () => providerSet({ plausible: v.module }) });
  const bound = await resolve({ request: "req" });
  assert.equal(bound.length, 1);
  assert.equal(bound[0]!.id, "plausible");
  assert.deepEqual(bound[0]!.context, { workspaceId: "ws-1", mode: "live" });
  assert.deepEqual(v.created, [{ credential: null, kit: { httpClient } }]);
  assert.deepEqual(calls.credential, []);
});

test("consent denial forwards nothing and never creates the vendor", async () => {
  const v = vendor();
  const seen: string[] = [];
  const { resolve } = forwarding({
    loadProviders: async () => providerSet({ plausible: v.module }),
    consentAllowsAnalytics: async ({ request }) => { seen.push(request); return false; },
  });
  assert.deepEqual(await resolve({ request: "visitor-request" }), []);
  assert.deepEqual(seen, ["visitor-request"]);
  assert.deepEqual(v.created, []);
});

test("an uninstalled sink id warns and keeps the built-in sink only", async () => {
  const { resolve, warnings, calls } = forwarding({ sink: "posthog" });
  assert.deepEqual(await resolve({ request: "req" }), []);
  assert.deepEqual(warnings, ["[analytics] analytics sink 'posthog' is not installed; hits stay in the built-in sink only"]);
  assert.equal(calls.consent, 0);
});

test("a labelled vendor gets its resolved credential, or forwards nothing when none is saved", async () => {
  const v = vendor("GA4 key");
  const credential = { token: "secret", baseUrl: "https://www.google-analytics.com" };
  const withKey = forwarding({ sink: "ga4", loadProviders: async () => providerSet({ ga4: v.module }), resolveCredential: async () => credential });
  assert.equal((await withKey.resolve({ request: "r" })).length, 1);
  assert.deepEqual(v.created, [{ credential, kit: { httpClient } }]);

  const without = forwarding({ sink: "ga4", loadProviders: async () => providerSet({ ga4: v.module }) });
  assert.deepEqual(await without.resolve({ request: "r" }), []);
  assert.deepEqual(without.calls.credential, ["GA4 key"]);
  assert.deepEqual(without.warnings, ["[analytics] analytics sink 'ga4' has no saved \"GA4 key\" credential; hits stay in the built-in sink only"]);
});

test("any failure (config, load, consent, credential, create) forwards nothing and warns", async () => {
  const failing = [
    { config: { get: async () => { throw new Error("ledger down"); } } },
    { loadProviders: async () => { throw "plugins unreadable"; } },
  ];
  for (const overrides of failing) {
    const { resolve, warnings } = forwarding(overrides as never);
    assert.deepEqual(await resolve({ request: "r" }), []);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0], "[analytics] vendor forwarding skipped: resolution failed");
  }
  const v = { credentialLabel: "GA4 key", create: () => { throw new Error("bad key SECRET-TOKEN-1"); } };
  const leaky = forwarding({ sink: "ga4", loadProviders: async () => providerSet({ ga4: v as never }), resolveCredential: async () => ({ token: "SECRET-TOKEN-1", baseUrl: "https://x" }) });
  assert.deepEqual(await leaky.resolve({ request: "r" }), []);
  assert.doesNotMatch(leaky.warnings.join("\n"), /SECRET/);
});

test("default warn goes to console.warn", async () => {
  const original = console.warn;
  const logged: unknown[] = [];
  console.warn = (m: unknown) => { logged.push(m); };
  try {
    const resolve = createAnalyticsForwarding<string>({
      workspaceId: "ws-1", config: { get: async () => siteConfig("x") }, loadProviders: async () => providerSet({}),
      consentAllowsAnalytics: async () => true, resolveCredential: async () => null, httpClient,
    });
    assert.deepEqual(await resolve({ request: "r" }), []);
    const hooks = createPluginAnalyticsHooks({ loadProviders: async () => providerSet({}, [{ beforeIngest: async () => { throw new Error("h"); } }]) });
    await hooks.beforeIngest(hit());
    const load = cacheAnalyticsProviders({ load: async () => providerSet({}, [], ["refused one"]), clock: { nowMs: () => 0 } });
    await load();
  } finally {
    console.warn = original;
  }
  assert.deepEqual(logged, [
    "[analytics] analytics sink 'x' is not installed; hits stay in the built-in sink only",
    "[analytics] beforeIngest hook #0 failed and was skipped: beforeIngest handler threw",
    "[analytics] refused one",
  ]);
});

test("cacheAnalyticsProviders memoises per TTL, reports refusals once, and never caches a failure", async () => {
  let now = 0;
  let loads = 0;
  let fail = true;
  const warnings: string[] = [];
  const load = cacheAnalyticsProviders({
    load: async () => { loads++; if (fail) throw new Error("not yet"); return providerSet({}, [], ["r1"]); },
    clock: { nowMs: () => now },
  }, { ttlMs: 100, warn: (m) => warnings.push(m) });

  await assert.rejects(load(), /not yet/);
  await Promise.resolve();
  fail = false;
  const first = await load();
  assert.equal(loads, 2, "a rejected load is retried, not cached");
  now = 99;
  assert.equal(await load(), first);
  assert.equal(loads, 2);
  now = 100;
  await load();
  assert.equal(loads, 3);
  assert.deepEqual(warnings, ["[analytics] r1", "[analytics] r1"]);
});

test("cacheAnalyticsProviders keeps a newer cache entry when an older load rejects", async () => {
  let now = 0;
  let rejectFirst!: (e: Error) => void;
  let calls = 0;
  const load = cacheAnalyticsProviders({
    load: () => { calls++; return calls === 1 ? new Promise((_, reject) => { rejectFirst = reject; }) : Promise.resolve(providerSet({})); },
    clock: { nowMs: () => now },
  }, { ttlMs: 10, warn: () => undefined });
  const stale = load();
  now = 20;
  const fresh = await load();
  rejectFirst(new Error("late"));
  await assert.rejects(stale, /late/);
  now = 25;
  assert.equal(await load(), fresh);
  assert.equal(calls, 2);
});

test("createPluginAnalyticsHooks: no handlers or a failed load pass the hit unchanged; handlers chain", async () => {
  const h = hit();
  assert.equal(await createPluginAnalyticsHooks({ loadProviders: async () => providerSet({}) }).beforeIngest(h), h);
  assert.equal(await createPluginAnalyticsHooks({ loadProviders: async () => { throw new Error("x"); } }).beforeIngest(h), h);

  const warnings: string[] = [];
  const hooks = createPluginAnalyticsHooks({ loadProviders: async () => providerSet({}, [
    { beforeIngest: async () => { throw new Error("broken"); } },
    { beforeIngest: async ({ hit: x }) => (x.path === "/internal" ? null : { ...x, path: `${x.path}/tagged` }) },
  ]) }, { warn: (m) => warnings.push(m) });
  assert.equal((await hooks.beforeIngest(hit("/a")))?.path, "/a/tagged");
  assert.equal(await hooks.beforeIngest(hit("/internal")), null);
  assert.deepEqual(warnings, [
    "[analytics] beforeIngest hook #0 failed and was skipped: beforeIngest handler threw",
    "[analytics] beforeIngest hook #0 failed and was skipped: beforeIngest handler threw",
  ]);
});
