import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createSiteConsentPorts } from "../../../inbound/public-http/middleware/site-consent.js";
import test from "node:test";

import { createAnalyticsForwarderRegistry, type AnalyticsForwarderModule } from "@jini-ai/analytics";

import type { AnalyticsProviderSet } from "#src/features/analytics/forwarding";
import { createRouteDeps } from "../app.js";
import { analyticsProviderRouteDeps, buildAnalyticsProviders } from "../analytics-providers.js";

const emptyLoad = async () => ({ items: [], refusals: [] });

test("buildAnalyticsProviders: credential found / missing, egress adapter, cached plugin load", async () => {
  const sent: unknown[] = [];
  const lookups: unknown[] = [];
  const loads: string[] = [];
  const providers = buildAnalyticsProviders({
    workspaceId: "ws-1",
    loadContributions: (async (input: { workspaceId: string }) => { loads.push(input.workspaceId); return emptyLoad(); }) as never,
    clock: { nowMs: () => 0 },
    findCredential: async (input) => {
      lookups.push(input);
      if (input.label === "none") return null;
      if (input.label === "user") return { baseUrl: "https://a.example", connection: { token: "t", username: "u" } };
      return { baseUrl: "https://b.example", connection: { token: "t2" } };
    },
    httpClient: { send: async (request) => { sent.push(request); return { status: 204, headers: {}, body: "" } as never; } },
  });

  assert.equal(await providers.resolveCredential({ label: "none" }), null);
  assert.deepEqual(await providers.resolveCredential({ label: "user" }), { token: "t", baseUrl: "https://a.example", username: "u" });
  assert.deepEqual(await providers.resolveCredential({ label: "plain" }), { token: "t2", baseUrl: "https://b.example" });
  assert.deepEqual(lookups, [{ workspaceId: "ws-1", label: "none" }, { workspaceId: "ws-1", label: "user" }, { workspaceId: "ws-1", label: "plain" }]);

  const request = { method: "POST", url: "https://b.example/api/event" } as never;
  await providers.httpClient.send({ request });
  assert.deepEqual(sent, [request]);

  const first = await providers.load();
  assert.deepEqual(first.forwarders.list(), []);
  assert.equal(await providers.load(), first, "cached within the TTL");
  assert.deepEqual(loads, ["ws-1", "ws-1"], "one forwarder + one hook load");
});

test("analyticsProviderRouteDeps: absent providers keep the built-in-only, hook-free route", () => {
  assert.deepEqual(analyticsProviderRouteDeps(createRouteDeps()), {});
});

test("analyticsProviderRouteDeps: requires an explicit receipt before forwarding, including US opt-out regions", async t => {
  const base = createRouteDeps();
  const created: unknown[] = [];
  const vendor: AnalyticsForwarderModule = { create: (input) => { created.push(input); return { forward: async () => ({ status: "ok", value: undefined }) }; } };
  const set: AnalyticsProviderSet = {
    forwarders: createAnalyticsForwarderRegistry({}, { seed: [{ id: "plausible", provider: vendor }] }),
    hooks: [{ beforeIngest: async () => null }],
    refusals: [],
  };
  const httpClient = { send: async () => { throw new Error("no network"); } };
  const deps = {
    ...base,
    consentTrustedRegionHeader: "x-region",
    analyticsConfig: { get: async ({ workspaceId }: { workspaceId: string }) => ({ ...(await base.analyticsConfig.get({ workspaceId })), sink: "plausible" }) },
    analyticsProviders: { load: async () => set, resolveCredential: async () => null, httpClient },
  };
  const directory = await mkdtemp(path.join(os.tmpdir(), 'tovu-consent-forward-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  deps.siteBinding = { ...base.siteBinding, dir: directory };
  const route = analyticsProviderRouteDeps(deps as never);
  const headers: Record<string, string> = { 'x-region': 'US' };
  const request = { get: (name: string) => headers[name], headers: {}, method: "POST", path: "/_analytics/e" };
  assert.deepEqual(await route.forwarders!({ request }), []); assert.deepEqual(created, []);
  const ports = createSiteConsentPorts({ deps: deps as never });
  const policy = await ports.config.get({});
  const id = 'receipt_explicit_0123456789';
  await ports.records.save({ record: { id, timestamp: ports.clock.nowIso(), policyVersion: policy.policyVersion,
    regionMode: 'opt-out', gpc: false, action: 'accept', choices: { necessary: true, functional: true, analytics: true, marketing: true } } });
  headers.cookie = 'jini_consent=' + id;
  const bound = await route.forwarders!({ request });
  assert.deepEqual(bound.map((b) => b.id), ["plausible"]);
  assert.deepEqual(created, [{ credential: null, kit: { httpClient } }]);
  const hit = { path: "/x" } as never;
  assert.equal(await route.hooks!.beforeIngest(hit), null, "plugin hooks reach the route");

  const noRegion = analyticsProviderRouteDeps({ ...deps, consentTrustedRegionHeader: undefined } as never);
  assert.equal((await noRegion.forwarders!({ request })).length, 1);
  headers['sec-gpc'] = '1'; assert.deepEqual(await route.forwarders!({ request }), []);
  delete headers['sec-gpc'];
  headers.dnt = '1'; assert.deepEqual(await route.forwarders!({ request }), [], 'old engine still denies DNT');
  delete headers.dnt; await ports.records.retire!({ id });
  assert.deepEqual(await route.forwarders!({ request }), []);
});

test("buildAnalyticsProviders: credentials are cached per label for the TTL; failures are retried", async () => {
  let now = 0;
  let lookups = 0;
  let fail = true;
  const providers = buildAnalyticsProviders({
    workspaceId: "ws-1", loadContributions: emptyLoad as never, clock: { nowMs: () => now },
    findCredential: async () => { lookups++; if (fail) throw new Error("vault locked"); return { baseUrl: "https://v.example", connection: { token: "k" } }; },
    httpClient: { send: async () => { throw new Error("unused"); } },
  });
  await assert.rejects(providers.resolveCredential({ label: "GA4" }), /vault locked/);
  await Promise.resolve();
  fail = false;
  const first = await providers.resolveCredential({ label: "GA4" });
  assert.equal(lookups, 2, "a failed lookup is not cached");
  now = 59_999;
  assert.equal(await providers.resolveCredential({ label: "GA4" }), first);
  assert.equal(lookups, 2);
  await providers.resolveCredential({ label: "other" });
  assert.equal(lookups, 3, "cached per label");
  now = 60_000;
  await providers.resolveCredential({ label: "GA4" });
  assert.equal(lookups, 4);
});

test("buildAnalyticsProviders: a late failure never evicts a newer cached credential", async () => {
  let now = 0;
  let calls = 0;
  let rejectFirst!: (e: Error) => void;
  const providers = buildAnalyticsProviders({
    workspaceId: "ws-1", loadContributions: emptyLoad as never, clock: { nowMs: () => now },
    findCredential: () => {
      calls++;
      return calls === 1 ? new Promise((_, reject) => { rejectFirst = reject; }) : Promise.resolve({ baseUrl: "https://v.example", connection: { token: "k" } });
    },
    httpClient: { send: async () => { throw new Error("unused"); } },
  });
  const stale = providers.resolveCredential({ label: "GA4" });
  now = 70_000;
  const fresh = await providers.resolveCredential({ label: "GA4" });
  rejectFirst(new Error("late"));
  await assert.rejects(stale, /late/);
  assert.equal(await providers.resolveCredential({ label: "GA4" }), fresh);
  assert.equal(calls, 2);
});

test('new engine forwarding: US no-choice may run, DNT/GPC and strict regions deny; off cannot grant full forwarding', async t => {
  const base = createRouteDeps();
  const directory = await mkdtemp(path.join(os.tmpdir(), 'tovu-consent-r3-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const vendor: AnalyticsForwarderModule = { create: () => ({ forward: async () => ({ status: 'ok', value: undefined }) }) };
  const deps = {
    ...base, siteBinding: { ...base.siteBinding, dir: directory },
    cookieConsent: { regionResolvers: async () => [] },
    analyticsConfig: { get: async ({ workspaceId }: { workspaceId: string }) => ({ ...(await base.analyticsConfig.get({ workspaceId })), sink: 'fixture' }) },
    analyticsProviders: { load: async () => ({ forwarders: createAnalyticsForwarderRegistry({}, { seed: [{ id: 'fixture', provider: vendor }] }), hooks: [], refusals: [] }), resolveCredential: async () => null, httpClient: { send: async () => { throw new Error('no network'); } } },
  };
  // Bind a published, enabled policy through the real consent fixture.
  const { consentFixture } = await import('#src/features/consent/__tests__/fixture');
  const f = consentFixture({ t });
  const publish = async (config: typeof f.config, expectedPublishedId: string | null) => {
    const saved = await f.service.saveDraft({ principalId: 'owner', config, expectedDraftId: expectedPublishedId });
    await f.service.publish({ principalId: 'owner', draftId: saved.revision.id, expectedPublishedId });
    return saved.revision.id;
  };
  const publishedId = await publish(f.config, null);
  deps.consentStore = f.store;
  deps.siteConsentReady = Promise.resolve();
  const route = analyticsProviderRouteDeps(deps as never);
  const headers: Record<string, string> = { cookie: 'jini_region=us', dnt: '1' };
  const request = { get: (name: string) => headers[name], headers: {}, method: 'POST', path: '/_analytics/e' };
  assert.deepEqual(await route.forwarders!({ request }), [], 'US no-choice plus DNT is denied');
  delete headers.dnt;
  assert.equal((await route.forwarders!({ request })).length, 1, 'US opt-out defaults still apply');
  headers['sec-gpc'] = '1';
  assert.deepEqual(await route.forwarders!({ request }), []);
  delete headers['sec-gpc'];
  for (const cookie of ['', 'jini_region=de', 'jini_region=gb']) {
    headers.cookie = cookie;
    assert.deepEqual(await route.forwarders!({ request }), []);
  }
  await publish({ ...f.config, enabled: false }, publishedId);
  headers.cookie = 'jini_region=us';
  assert.deepEqual(await route.forwarders!({ request }), [], 'a boolean full-event forwarder cannot enforce anonymous restrictions');
});
