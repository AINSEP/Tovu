import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";

import { createAnalyticsForwarderRegistry, type AnalyticsForwarderModule } from "@jini-ai/analytics";

import { readSiteConsentPolicy } from "../../../inbound/public-http/middleware/site-consent.js";
import { createRouteDeps } from "../app.js";
import { analyticsProviderRouteDeps } from "../analytics-providers.js";

/**
 * @file A310 pin (owner decision, 2026-11-24): with cookie consent OFF, or with no consent given
 * where consent is required, vendor analytics (PostHog, Plausible, ...) are NEVER forwarded: no
 * forwarder is bound and the vendor module is not even constructed. Built-in analytics keep working;
 * only the vendor fan-out is gated. This is a pin, not a fix: the gate is
 * `analyticsProviderRouteDeps#consentAllowsAnalytics` (`analyticsLevel === 'full'`).
 */

const acceptAll = ({ policyVersion, nowMs }: { policyVersion: string; nowMs: number }) => "jini_choices=" + encodeURIComponent(JSON.stringify({
  v: 1, p: policyVersion, t: nowMs, a: "accept", c: { functional: true, analytics: true, marketing: true }, r: "receipt_current_0123456789",
}));

function vendorHarness() {
  const created: unknown[] = [];
  const vendor: AnalyticsForwarderModule = { create: input => { created.push(input); return { forward: async () => ({ status: "ok", value: undefined }) }; } };
  const httpClient = { send: async () => { throw new Error("no network"); } };
  const analyticsProviders = {
    load: async () => ({ forwarders: createAnalyticsForwarderRegistry({}, { seed: [{ id: "posthog", provider: vendor }] }), hooks: [], refusals: [] }),
    resolveCredential: async () => null, httpClient,
  };
  return { created, analyticsProviders };
}

function beacon(cookie: string | undefined, extra: Record<string, string> = {}) {
  const headers: Record<string, string | undefined> = { cookie, ...extra };
  return { get: (name: string) => headers[name], headers: {}, method: "POST", path: "/_analytics/e" };
}

test("consent switched off: a stored acceptance forwards nothing and never constructs the vendor", async t => {
  const base = createRouteDeps();
  const { consentFixture } = await import("#src/features/consent/__tests__/fixture");
  const f = consentFixture({ t });
  const { created, analyticsProviders } = vendorHarness();
  const deps = { ...base, consentStore: f.store, siteConsentReady: Promise.resolve(), cookieConsent: undefined,
    analyticsConfig: { get: async ({ workspaceId }: { workspaceId: string }) => ({ ...(await base.analyticsConfig.get({ workspaceId })), sink: "posthog" }) }, analyticsProviders };
  const publish = async (config: typeof f.config, expectedPublishedId: string | null) => {
    const saved = await f.service.saveDraft({ principalId: "owner", config, expectedDraftId: expectedPublishedId });
    await f.service.publish({ principalId: "owner", draftId: saved.revision.id, expectedPublishedId });
    return saved.revision.id;
  };
  const route = analyticsProviderRouteDeps(deps as never);
  const onId = await publish(f.config, null);
  const onPolicy = await readSiteConsentPolicy({ deps: deps as never });
  assert.equal((await route.forwarders!({ request: beacon(acceptAll({ policyVersion: onPolicy.policyVersion, nowMs: deps.clock.nowMs() }), { "x-forwarded-for": "203.0.113.9" }) })).length, 1, "control: consent ON with an accepted choice does forward");
  await publish({ ...f.config, enabled: false }, onId);
  const offPolicy = await readSiteConsentPolicy({ deps: deps as never });
  const cookie = acceptAll({ policyVersion: offPolicy.policyVersion, nowMs: deps.clock.nowMs() });
  const before = created.length;
  assert.deepEqual(await route.forwarders!({ request: beacon(cookie) }), [], "consent OFF forwards nothing even with an accepting cookie");
  assert.equal(created.length, before, "the vendor is not constructed while consent is off");
  assert.equal(await route.vendorHooksAllowed!({ request: beacon(cookie) as never }), false);
});

test("consent required but not given: a strict-region visitor with no choice forwards nothing", async t => {
  const base = createRouteDeps();
  const { consentFixture } = await import("#src/features/consent/__tests__/fixture");
  const f = consentFixture({ t });
  const { created, analyticsProviders } = vendorHarness();
  const saved = await f.service.saveDraft({ principalId: "owner", config: f.config, expectedDraftId: null });
  await f.service.publish({ principalId: "owner", draftId: saved.revision.id, expectedPublishedId: null });
  const deps = { ...base, consentStore: f.store, siteConsentReady: Promise.resolve(), cookieConsent: undefined,
    analyticsConfig: { get: async ({ workspaceId }: { workspaceId: string }) => ({ ...(await base.analyticsConfig.get({ workspaceId })), sink: "posthog" }) }, analyticsProviders };
  const route = analyticsProviderRouteDeps(deps as never);
  for (const cookie of ["jini_region=de", "jini_region=gb", undefined]) {
    assert.deepEqual(await route.forwarders!({ request: beacon(cookie) }), [], `no choice (${cookie ?? "no cookie"}) forwards nothing`);
  }
  assert.deepEqual(created, [], "the vendor is never constructed without consent");
});

test("no consent configured at all: nothing is forwarded to any vendor", async () => {
  const base = createRouteDeps();
  const { created, analyticsProviders } = vendorHarness();
  const deps = { ...base, analyticsConfig: { get: async ({ workspaceId }: { workspaceId: string }) => ({ ...(await base.analyticsConfig.get({ workspaceId })), sink: "posthog" }) }, analyticsProviders };
  const route = analyticsProviderRouteDeps(deps as never);
  const cookie = acceptAll({ policyVersion: "unconfigured", nowMs: deps.clock.nowMs() });
  assert.deepEqual(await route.forwarders!({ request: beacon(cookie) }), []);
  assert.deepEqual(await route.forwarders!({ request: beacon(undefined) }), []);
  assert.deepEqual(created, []);
});
