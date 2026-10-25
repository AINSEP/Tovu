import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";
import test from "node:test";

import { InMemoryPrincipalRepo } from "@jini-ai/user-management/server";
import { createPostHogProductAnalyticsAdapter } from "@jini-ai/analytics/product/posthog";
import { withProductAnalyticsGuards, type ProductEvent, type ProductAnalyticsPort } from "@jini-ai/analytics/product";
import { createSettingsPrincipalLookup, ensureSettingsUiTabDefinitions, InMemorySettingsRepo } from "#src/features/settings/index";
import { createNoopObservabilityPort } from "#src/platform/observability/index";
import { createNoopProductAnalytics, createTelemetryConsent, resolvePostHogConfig, TELEMETRY_CONSENT } from "#src/platform/product-analytics/index";
import { withToolCallAnalytics } from "../tool-recovery-preset.js";
import { EXPECTED_PRODUCT_EVENTS, SCENARIO_SECRET, runToolCallScenario } from "./fixtures/tool-call-observability-scenario.js";

/**
 * @file Product-analytics swap proof (owner 2026-10-25: PostHog, "but it has to be an adapter so we
 * can swap it out later"). The SAME tool-call scenario (real delegated-tool route, real Tovu executor
 * stack) runs against the noop, a fake port and the REAL posthog-node SDK with a recording fetch (an
 * `.invalid` host; no network). Normalized, the fake and PostHog produce the same events; consent comes
 * from the real settings ledger (`core.privacy.telemetry.metrics`), and without it nothing is sent.
 */

const NO_OBSERVABILITY = createNoopObservabilityPort({});
const WORKSPACE = "workspace-analytics";

function recordingFetch() {
  const batches: Array<{ url: string; batch: Array<Record<string, any>> }> = [];
  const fetch = async (url: string, init: { body?: unknown }) => {
    const body = init.body;
    const raw = body instanceof Uint8Array ? Buffer.from(body) : Buffer.from(String(body ?? ""));
    const text = raw[0] === 0x1f && raw[1] === 0x8b ? gunzipSync(raw).toString("utf8") : raw.toString("utf8");
    batches.push({ url, batch: JSON.parse(text).batch });
    return { status: 200, text: async () => "{}", json: async () => ({}) };
  };
  return { batches, fetch };
}

/** PostHog's wire events back in the port's vocabulary (SDK-added `$` properties stripped). */
function normalizePostHog(batches: ReturnType<typeof recordingFetch>["batches"]): ProductEvent[] {
  return batches.flatMap((b) => b.batch).map((e) => ({ name: e.event, userId: e.distinct_id,
    properties: Object.fromEntries(Object.entries(e.properties ?? {}).filter(([key]) => !key.startsWith("$"))) }));
}

async function consentFromLedger({ consented }: { consented: boolean | undefined }) {
  const settingsRepo = new InMemorySettingsRepo();
  const ids = { newId: (() => { let n = 0; return () => `analytics-test-id-${++n}`; })() };
  const clock = { nowMs: () => Date.parse("2026-10-25T00:00:00.000Z"), nowIso: () => "2026-10-25T00:00:00.000Z" };
  await ensureSettingsUiTabDefinitions({ settingsRepo, clock, ids, principals: createSettingsPrincipalLookup({ repo: new InMemoryPrincipalRepo({}, { initialRows: [] }) }) }, { systemPrincipalId: "system" });
  if (consented !== undefined) {
    const definition = (await settingsRepo.listActiveDefinitions({ workspaceId: null })).find((d) => d.namespace === TELEMETRY_CONSENT.namespace && d.key === TELEMETRY_CONSENT.key);
    assert.ok(definition);
    await settingsRepo.saveWorkspaceValue({ settingId: definition.settingId, scope: "workspace", workspaceId: WORKSPACE, principalId: null, originPluginId: null,
      valueJson: consented, state: "set", defVersion: definition.version, seq: 1, updatedBy: "owner", updatedAt: clock.nowIso() });
  }
  return createTelemetryConsent({ settingsRepo, workspaceId: WORKSPACE });
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

test("noop (default, no POSTHOG_API_KEY): config is off and the executor is not wrapped at all", () => {
  assert.deepEqual(resolvePostHogConfig({ env: {} }), { enabled: false });
  const inner = { execute: async () => ({ executionId: "e", status: "completed" as const }), resumeConfirmation: () => {}, cancel: () => {}, getAuditRecord: () => null };
  assert.equal(withToolCallAnalytics({ inner, analytics: createNoopProductAnalytics({}) }), inner);
  assert.equal(withToolCallAnalytics({ inner, analytics: undefined }), inner);
});

test("fake port (consent given): the scenario's product events", async () => {
  const events: ProductEvent[] = [];
  const fake: ProductAnalyticsPort = { capture: (event) => { events.push(event); }, identify: () => {} };
  await runToolCallScenario({ observability: NO_OBSERVABILITY, analytics: withProductAnalyticsGuards({ inner: fake, consent: await consentFromLedger({ consented: true }) }) });
  await settle();
  assert.deepEqual(events, EXPECTED_PRODUCT_EVENTS);
});

test("PostHog provider (real posthog-node, recording fetch, consent given): the same events, nothing secret, no GeoIP", async () => {
  const { batches, fetch } = recordingFetch();
  const { port, dispose } = createPostHogProductAnalyticsAdapter({ config: { enabled: true, apiKey: "phc_dummy_test_key", host: "https://posthog.invalid" } }, { fetch: fetch as never, flushAt: 1 });
  await runToolCallScenario({ observability: NO_OBSERVABILITY, analytics: withProductAnalyticsGuards({ inner: port, consent: await consentFromLedger({ consented: true }) }) });
  await settle(); await dispose();
  assert.deepEqual(normalizePostHog(batches), EXPECTED_PRODUCT_EVENTS);
  assert.ok(batches.every((b) => b.url.startsWith("https://posthog.invalid/")));
  assert.ok(!JSON.stringify(batches).includes(SCENARIO_SECRET));
  assert.ok(batches.flatMap((b) => b.batch).every((e) => e.properties.$geoip_disable === true));
});

test("consent: unset (the default) or false in the ledger sends NOTHING to PostHog", async () => {
  for (const consented of [undefined, false]) {
    const { batches, fetch } = recordingFetch();
    const { port, dispose } = createPostHogProductAnalyticsAdapter({ config: { enabled: true, apiKey: "phc_dummy_test_key", host: "https://posthog.invalid" } }, { fetch: fetch as never, flushAt: 1 });
    await runToolCallScenario({ observability: NO_OBSERVABILITY, analytics: withProductAnalyticsGuards({ inner: port, consent: await consentFromLedger({ consented }) }) });
    await settle(); await dispose();
    assert.deepEqual(batches, [], `consent ${String(consented)}`);
  }
});
