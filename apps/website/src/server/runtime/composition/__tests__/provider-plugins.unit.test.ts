import assert from "node:assert/strict";
import test from "node:test";

import { createNoopObservabilityPort, isNoopObservabilityPort, type ObservabilityPort } from "@jini-ai/diagnostics/observability";
import { isNoopProductAnalytics, type ProductAnalyticsPort } from "@jini-ai/analytics/product";
import { createPluginContributionRegistry, type PluginProviderFactory, type PluginProviderSettingField } from "@jini-ai/plugins/host";

import { attributionFor, bootProviderPlugins, legacyProviderCredentialCheck, PROVIDER_CONTRACTS, providerInputOf, type SiteIdentity } from "../provider-plugins.js";
import type { ProviderConfigSource, ProviderPluginConfig } from "../provider-config-source.js";

/**
 * @file Provider-plugin selection at boot, with DI fakes only (no vendor SDK, no network): a fake
 * plugin runtime admits fake factories into a REAL contribution registry, and the REAL Jini provider
 * host initializes, validates, bounds and disposes them.
 */

type Calls = { inputs: Record<string, unknown>[]; disposed: number };

/** An observability port that records which signals reached it. */
function recordingObservability(seen: string[]): ObservabilityPort {
  const noop = createNoopObservabilityPort({});
  return { ...noop, trackOperation: (input) => { seen.push(`op:${input.name}`); return noop.trackOperation(input); }, reportError: (report) => { seen.push(`error:${report.context.operation}`); } };
}

function fakeFactory({ calls, port }: { calls: Calls; port: unknown }): PluginProviderFactory {
  return (required) => { calls.inputs.push({ ...required }); return { port, dispose: () => { calls.disposed += 1; } }; };
}

/** Each plugin's declared settings (as its manifest would declare them). */
const SETTINGS: Record<string, readonly PluginProviderSettingField[]> = {
  "observability-opentelemetry": [{ name: "endpoint", label: "Endpoint", required: true }, { name: "headers", label: "Headers", secret: true }],
  "observability-sentry": [{ name: "dsn", label: "DSN", secret: true, required: true }, { name: "environment", label: "Environment" }],
  "analytics-posthog": [{ name: "host", label: "Host", required: true }, { name: "apiKey", label: "Key", secret: true, required: true }],
  "ai-trace-langfuse": [{ name: "baseUrl", label: "URL" }, { name: "publicKey", label: "Public key", required: true }, { name: "secretKey", label: "Secret key", secret: true, required: true }],
};
const ANY_SETTINGS: readonly PluginProviderSettingField[] = [{ name: "apiKey", label: "Key", secret: true, required: true }];

/** A runtime listing the installed + enabled plugins' declarations; `loadProviderPlugins` admits their factories. */
function fakeRuntime({ factories, installed }: { factories: Record<string, { contract: string; id: string; factory: PluginProviderFactory }>; installed: readonly string[] }) {
  const providerContributions = createPluginContributionRegistry({});
  const requested: string[][] = [];
  return {
    requested,
    runtime: {
      providerContributions,
      async listProviderPlugins() {
        return installed.filter((id) => factories[id]).map((pluginId) => ({ pluginId,
          providers: [{ contract: factories[pluginId]!.contract, id: factories[pluginId]!.id, contractVersion: 1 as const, settings: SETTINGS[pluginId] ?? ANY_SETTINGS }] }));
      },
      async loadProviderPlugins({ pluginIds }: { pluginIds: readonly string[] }) {
        requested.push([...pluginIds]);
        const loaded = pluginIds.filter((id) => installed.includes(id) && factories[id]);
        for (const pluginId of loaded) {
          const { contract, id, factory } = factories[pluginId]!;
          providerContributions.replace({ contributions: { pluginId, sdk: {} as never, routes: [], tools: [], widgets: [], providers: [{ contract, id, contractVersion: 1, factory }] } });
        }
        return loaded;
      },
    },
  };
}

const CONFIGS: Record<string, ProviderPluginConfig> = {
  "observability-opentelemetry": { settings: { endpoint: "https://otlp.example.test/otlp" }, secrets: { headers: "Authorization=Basic MTIzNDU2OmdsY190b2tlbg==" } },
  "observability-sentry": { settings: {}, secrets: { dsn: "https://public@sentry.example.test/1" } },
  "analytics-posthog": { settings: { host: "https://posthog.example.test" }, secrets: { apiKey: "phc_key" } },
  "ai-trace-langfuse": { settings: { baseUrl: "https://langfuse.example.test", publicKey: "pk-lf" }, secrets: { secretKey: "sk-lf" } },
};
/** A fake saved-settings source over a fixed table. */
const configOf = (configs: Record<string, ProviderPluginConfig>): ProviderConfigSource => ({
  scope: "site",
  read: async ({ pluginId }) => configs[pluginId] ?? null,
  readSettings: async () => null,
  write: async () => {},
});
const SITE: SiteIdentity = { siteId: "site-123", siteSlug: "blog", environment: "local", projectId: "project-abc" };
const OBS_ATTRIBUTION = attributionFor({ contract: "observability", site: SITE });
const consentAlways = { consent: () => true, consentRevision: () => 0 };
const quiet = () => {};

test("nothing configured: nothing is loaded, every contract is the shared noop, and AI tracing is off", async () => {
  const { runtime, requested } = fakeRuntime({ factories: {}, installed: [] });
  const ports = await bootProviderPlugins({ runtime, config: configOf({}), serviceName: "tovu", site: SITE, ...consentAlways }, { warn: quiet });
  assert.deepEqual(requested, [[]]);
  assert.equal(isNoopObservabilityPort(ports.observability), true);
  assert.equal(isNoopProductAnalytics(ports.productAnalytics), true);
  assert.equal(ports.aiTraceSink, undefined);
  await ports.dispose({});
});

test("installed + enabled + configured OTel and Sentry: mapped inputs, one fanned-out port, both disposed", async () => {
  const otel: Calls = { inputs: [], disposed: 0 }, sentry: Calls = { inputs: [], disposed: 0 };
  const seen: string[] = [];
  const { runtime, requested } = fakeRuntime({ installed: ["observability-opentelemetry", "observability-sentry"], factories: {
    "observability-opentelemetry": { contract: "observability", id: "opentelemetry", factory: fakeFactory({ calls: otel, port: recordingObservability(seen) }) },
    "observability-sentry": { contract: "observability", id: "sentry", factory: fakeFactory({ calls: sentry, port: recordingObservability(seen) }) },
  } });
  const ports = await bootProviderPlugins({ runtime, config: configOf(CONFIGS), serviceName: "tovu", site: SITE, ...consentAlways }, { warn: quiet });
  assert.deepEqual(requested, [["observability-opentelemetry", "observability-sentry"]]);
  assert.deepEqual(otel.inputs, [{ serviceName: "tovu", attribution: OBS_ATTRIBUTION, endpoint: "https://otlp.example.test/otlp", headers: "Authorization=Basic MTIzNDU2OmdsY190b2tlbg==" }]);
  assert.deepEqual(sentry.inputs, [{ serviceName: "tovu", attribution: OBS_ATTRIBUTION, dsn: "https://public@sentry.example.test/1" }]);
  ports.observability.trackOperation({ name: "publish" }).end({ outcome: "completed", failed: false });
  ports.observability.reportError({ error: new Error("x"), context: { operation: "deploy" } });
  assert.deepEqual(seen, ["op:publish", "op:publish", "error:deploy", "error:deploy"]);
  await ports.dispose({});
  await ports.dispose({});
  assert.deepEqual([otel.disposed, sentry.disposed], [1, 1]);
});

test("configured but not installed or not enabled: that contract stays on the noop and its factory never runs", async () => {
  const calls: Calls = { inputs: [], disposed: 0 };
  const { runtime } = fakeRuntime({ installed: [], factories: { "observability-opentelemetry": { contract: "observability", id: "opentelemetry", factory: fakeFactory({ calls, port: recordingObservability([]) }) } } });
  const ports = await bootProviderPlugins({ runtime, config: configOf(CONFIGS), serviceName: "tovu", site: SITE, ...consentAlways }, { warn: quiet });
  assert.equal(isNoopObservabilityPort(ports.observability), true);
  assert.deepEqual(calls.inputs, []);
});

test("unreadable saved settings are treated as not configured, with a warning naming the plugin", async () => {
  const warnings: string[] = [];
  const calls: Calls = { inputs: [], disposed: 0 };
  const { runtime, requested } = fakeRuntime({ installed: ["observability-opentelemetry"], factories: { "observability-opentelemetry": { contract: "observability", id: "opentelemetry", factory: fakeFactory({ calls, port: recordingObservability([]) }) } } });
  const ports = await bootProviderPlugins({ runtime, config: { ...configOf({}), read: async () => { throw new Error("vault locked"); } }, serviceName: "tovu", site: SITE, ...consentAlways }, { warn: (message) => warnings.push(message) });
  assert.deepEqual(requested, [[]]);
  assert.equal(isNoopObservabilityPort(ports.observability), true);
  assert.deepEqual(warnings, ["provider plugin 'observability-opentelemetry': its settings could not be read; left on the noop"]);
});

test("installed + enabled but unconfigured (or missing a required field): never loaded; contracts Tovu does not host are skipped", async () => {
  const calls: Calls = { inputs: [], disposed: 0 };
  const { runtime, requested } = fakeRuntime({ installed: ["observability-opentelemetry", "payments-stripe"], factories: {
    "observability-opentelemetry": { contract: "observability", id: "opentelemetry", factory: fakeFactory({ calls, port: recordingObservability([]) }) },
    "payments-stripe": { contract: "payments", id: "stripe", factory: fakeFactory({ calls, port: {} }) },
  } });
  const config = configOf({ "observability-opentelemetry": { settings: { endpoint: "  " }, secrets: { headers: "a=b" } }, "payments-stripe": { settings: {}, secrets: { apiKey: "sk" } } });
  const ports = await bootProviderPlugins({ runtime, config, serviceName: "tovu", site: SITE, ...consentAlways }, { warn: quiet });
  assert.deepEqual(requested, [[]]);
  assert.equal(isNoopObservabilityPort(ports.observability), true);
  assert.deepEqual(calls.inputs, []);
});

test("providerInputOf: only declared names pass, blanks are dropped, and a required blank means not configured", () => {
  const declaration = { contract: "observability", id: "x", contractVersion: 1 as const, settings: SETTINGS["observability-opentelemetry"]! };
  assert.equal(providerInputOf({ declaration, saved: null }), undefined);
  assert.equal(providerInputOf({ declaration: { ...declaration, settings: [] }, saved: CONFIGS["observability-opentelemetry"]! }), undefined);
  assert.equal(providerInputOf({ declaration: { contract: "observability", id: "x", contractVersion: 1 }, saved: CONFIGS["observability-opentelemetry"]! }), undefined);
  assert.equal(providerInputOf({ declaration, saved: { settings: {}, secrets: { headers: "a=b" } } }), undefined);
  assert.deepEqual(providerInputOf({ declaration, saved: { settings: { endpoint: "https://c", extra: "dropped" }, secrets: { headers: "" } } }), { endpoint: "https://c" });
});

test("a throwing factory, an invalid port and a hung initialization each leave only their own contract on the noop", async () => {
  const warnings: string[] = [];
  const seen: string[] = [];
  const good: Calls = { inputs: [], disposed: 0 };
  const { runtime } = fakeRuntime({ installed: ["observability-opentelemetry", "observability-sentry", "analytics-posthog", "ai-trace-langfuse"], factories: {
    "observability-opentelemetry": { contract: "observability", id: "opentelemetry", factory: () => { throw new Error("bad endpoint https://secret@collector.example"); } },
    "observability-sentry": { contract: "observability", id: "sentry", factory: fakeFactory({ calls: good, port: recordingObservability(seen) }) },
    "analytics-posthog": { contract: "product_analytics", id: "posthog", factory: fakeFactory({ calls: good, port: { capture: "nope" } }) },
    "ai-trace-langfuse": { contract: "ai_trace", id: "langfuse", factory: () => new Promise(() => {}) },
  } });
  const ports = await bootProviderPlugins({ runtime, config: configOf(CONFIGS), serviceName: "tovu", site: SITE, ...consentAlways }, { warn: (message) => warnings.push(message), initializeTimeoutMs: 20 });
  assert.ok(!warnings.join("\n").includes("secret@"), "an SDK error message never reaches the log");
  ports.observability.trackOperation({ name: "still-works" }).end({ outcome: "completed", failed: false });
  assert.deepEqual(seen, ["op:still-works"]);
  assert.equal(isNoopProductAnalytics(ports.productAnalytics), true);
  assert.equal(ports.aiTraceSink, undefined);
  assert.deepEqual(warnings, [
    "provider plugin 'observability-opentelemetry' did not initialize: Error",
    "provider plugin 'analytics-posthog' did not initialize: PluginProviderError",
    "provider plugin 'ai-trace-langfuse' did not initialize: PluginProviderError",
  ]);
  await ports.dispose({});
  assert.equal(good.disposed, 2);
});

test("product analytics: consent first; a revoke that lands while consent is being read drops the event", async () => {
  const captured: string[] = [];
  const port: ProductAnalyticsPort = { capture: (event) => { captured.push(`${event.name}:${event.userId}`); }, identify: () => {} };
  const { runtime } = fakeRuntime({ installed: ["analytics-posthog"], factories: { "analytics-posthog": { contract: "product_analytics", id: "posthog", factory: fakeFactory({ calls: { inputs: [], disposed: 0 }, port }) } } });
  let revision = 0;
  let answer: (allowed: boolean) => void = () => {};
  const ports = await bootProviderPlugins({ runtime, config: configOf(CONFIGS), serviceName: "tovu", site: SITE,
    consent: () => new Promise<boolean>((resolve) => { answer = resolve; }), consentRevision: () => revision }, { warn: quiet });
  ports.productAnalytics.capture({ name: "post_published", userId: "p-1" });
  revision += 1; // the operator revoked consent while the read was in flight
  answer(true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(captured, []);
  ports.productAnalytics.capture({ name: "post_published", userId: "p-1" });
  answer(true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(captured, ["post_published:p-1"]);
  ports.productAnalytics.capture({ name: "post_published", userId: "p-1", properties: { email: "x" } });
  answer(true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(captured, ["post_published:p-1"], "PII-shaped properties are refused by the guard");
});

test("AI trace: a configured sink receives recorded events through the fan-out", async () => {
  const recorded: unknown[] = [];
  const sink = { record: (event: unknown) => { recorded.push(event); } };
  const calls: Calls = { inputs: [], disposed: 0 };
  const { runtime } = fakeRuntime({ installed: ["ai-trace-langfuse"], factories: { "ai-trace-langfuse": { contract: "ai_trace", id: "langfuse", factory: fakeFactory({ calls, port: sink }) } } });
  const ports = await bootProviderPlugins({ runtime, config: configOf(CONFIGS), serviceName: "tovu", site: SITE, ...consentAlways }, { warn: quiet });
  assert.deepEqual(calls.inputs, [{ serviceName: "tovu", attribution: attributionFor({ contract: "ai_trace", site: SITE }), publicKey: "pk-lf", secretKey: "sk-lf", baseUrl: "https://langfuse.example.test" }]);
  const event = { kind: "run_finished", traceId: "t", at: 0, outcome: "succeeded", error: null, totals: { turns: 0, toolCalls: 0, toolErrors: 0, inputTokens: null, outputTokens: null, costUsd: null } } as const;
  ports.aiTraceSink!.record(event);
  assert.deepEqual(recorded, [event]);
});

test("disabling a provider plugin (its contribution detached) disposes its resources", async () => {
  const calls: Calls = { inputs: [], disposed: 0 };
  const { runtime } = fakeRuntime({ installed: ["observability-sentry"], factories: { "observability-sentry": { contract: "observability", id: "sentry", factory: fakeFactory({ calls, port: recordingObservability([]) }) } } });
  const ports = await bootProviderPlugins({ runtime, config: configOf(CONFIGS), serviceName: "tovu", site: SITE, ...consentAlways }, { warn: quiet });
  runtime.providerContributions.detach({ pluginId: "observability-sentry" });
  for (let i = 0; i < 20 && calls.disposed === 0; i += 1) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.disposed, 1);
  await ports.dispose({});
  assert.equal(calls.disposed, 1, "teardown is idempotent");
});

test("two product-analytics providers both receive each allowed event", async () => {
  const seen: string[] = [];
  const port = (tag: string): ProductAnalyticsPort => ({ capture: (event) => { seen.push(`${tag}:${event.name}`); }, identify: (identity) => { seen.push(`${tag}:id:${identity.userId}`); } });
  const { runtime } = fakeRuntime({ installed: ["a", "b"], factories: {
    a: { contract: "product_analytics", id: "a", factory: fakeFactory({ calls: { inputs: [], disposed: 0 }, port: port("a") }) },
    b: { contract: "product_analytics", id: "b", factory: () => ({ port: { capture: () => { throw new Error("down"); }, identify: () => { throw new Error("down"); } }, dispose: () => {} }) },
  } });
  const ports = await bootProviderPlugins({ runtime, config: configOf({ a: { settings: {}, secrets: { apiKey: "k" } }, b: { settings: {}, secrets: { apiKey: "k" } } }), serviceName: "tovu", site: SITE, ...consentAlways }, { warn: quiet });
  ports.productAnalytics.capture({ name: "theme_changed", userId: "p-2" });
  ports.productAnalytics.identify({ userId: "p-2" });
  assert.deepEqual(seen, ["a:theme_changed", "a:id:p-2"]);
});

const HOSTILE = [undefined, null, [], {}, 0, Number.NaN, "", "  ", true, "port", () => {}];
for (const contract of PROVIDER_CONTRACTS) {
  test(`${contract.contract} validator refuses hostile values and accepts a full port`, () => {
    for (const value of HOSTILE) assert.equal(typeof contract.validate({ provider: value }), "string", `refused ${String(value)}`);
    const full = contract.contract === "observability" ? createNoopObservabilityPort({}) : contract.contract === "product_analytics" ? { capture() {}, identify() {} } : { record() {} };
    assert.equal(contract.validate({ provider: full }), undefined);
  });
}

test("the observability validator refuses a port missing any single signal", () => {
  const observability = PROVIDER_CONTRACTS.find((contract) => contract.contract === "observability")!;
  for (const name of ["trackRequest", "trackDbQuery", "trackOutboundCall", "trackAgentRun", "trackOperation", "reportError"]) {
    const port = { ...createNoopObservabilityPort({}), [name]: undefined };
    assert.equal(observability.validate({ provider: port }), "not an ObservabilityPort", name);
  }
});

test("without a warn sink, a provider failure (even a non-Error rejection) goes to the console", async (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  const { runtime } = fakeRuntime({ installed: ["observability-sentry"], factories: { "observability-sentry": { contract: "observability", id: "sentry", factory: () => Promise.reject("refused") } } });
  const ports = await bootProviderPlugins({ runtime, config: configOf(CONFIGS), serviceName: "tovu", site: SITE, ...consentAlways });
  assert.equal(isNoopObservabilityPort(ports.observability), true);
  assert.deepEqual(warn.mock.calls.map((call) => call.arguments[0]), ["[provider-plugins] provider plugin 'observability-sentry' did not initialize: string"]);
});

test("a provider whose dispose fails is reported by phase through the warn sink", async () => {
  const warnings: string[] = [];
  const { runtime } = fakeRuntime({ installed: ["observability-sentry"], factories: { "observability-sentry": { contract: "observability", id: "sentry", factory: () => ({ port: recordingObservability([]), dispose: () => { throw new Error("close failed"); } }) } } });
  const ports = await bootProviderPlugins({ runtime, config: configOf(CONFIGS), serviceName: "tovu", site: SITE, ...consentAlways }, { warn: (message) => warnings.push(message) });
  await ports.dispose({});
  for (let i = 0; i < 20 && warnings.length === 0; i += 1) await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(warnings, ["provider plugin 'observability-sentry' dispose failed"]);
});

test("a retired lease is never called again: after disable every contract's composed port is inert (noop)", async () => {
  const seen: string[] = [];
  const calls: Calls = { inputs: [], disposed: 0 };
  const sinkEvents: unknown[] = [];
  const analytics: ProductAnalyticsPort = { capture: (event) => { seen.push(`capture:${event.name}`); }, identify: () => { seen.push("identify"); } };
  const { runtime } = fakeRuntime({ installed: ["observability-sentry", "analytics-posthog", "ai-trace-langfuse"], factories: {
    "observability-sentry": { contract: "observability", id: "sentry", factory: fakeFactory({ calls, port: recordingObservability(seen) }) },
    "analytics-posthog": { contract: "product_analytics", id: "posthog", factory: fakeFactory({ calls, port: analytics }) },
    "ai-trace-langfuse": { contract: "ai_trace", id: "langfuse", factory: fakeFactory({ calls, port: { record: (event: unknown) => { sinkEvents.push(event); } } }) },
  } });
  const ports = await bootProviderPlugins({ runtime, config: configOf(CONFIGS), serviceName: "tovu", site: SITE, ...consentAlways }, { warn: quiet });
  const event = { kind: "run_finished", traceId: "t", at: 0, outcome: "succeeded", error: null, totals: { turns: 0, toolCalls: 0, toolErrors: 0, inputTokens: null, outputTokens: null, costUsd: null } } as const;
  ports.observability.trackOperation({ name: "before" }).end({ outcome: "ok" });
  ports.productAnalytics.capture({ name: "before", userId: "p-1" });
  ports.aiTraceSink!.record(event);
  assert.deepEqual(seen, ["op:before", "capture:before"]);
  assert.equal(sinkEvents.length, 1);
  for (const pluginId of ["observability-sentry", "analytics-posthog", "ai-trace-langfuse"]) runtime.providerContributions.detach({ pluginId });
  // Synchronously after detach — before the host's queued disposal — the lease is already not current.
  ports.observability.trackOperation({ name: "after" }).end({ outcome: "ok" });
  ports.observability.reportError({ error: new Error("x"), context: { operation: "after" } } as never);
  ports.productAnalytics.capture({ name: "after", userId: "p-1" });
  ports.productAnalytics.identify({ userId: "p-1" });
  ports.aiTraceSink!.record(event);
  await ports.aiTraceSink!.flush?.();
  assert.deepEqual(seen, ["op:before", "capture:before"]);
  assert.equal(sinkEvents.length, 1);
  await ports.dispose({});
});

test("site attribution: each contract's factory receives the site in that contract's terms", () => {
  assert.deepEqual(attributionFor({ contract: "observability", site: SITE }), { attributes: {
    "tovu.site.id": "site-123", "tovu.site.slug": "blog", "deployment.environment": "local", "tovu.project.id": "project-abc" } });
  const attributes = { site_id: "site-123", site_slug: "blog", environment: "local", project_id: "project-abc" };
  assert.deepEqual(attributionFor({ contract: "product_analytics", site: SITE }), { attributes, groups: { site: "site-123" } });
  assert.deepEqual(attributionFor({ contract: "ai_trace", site: SITE }), { attributes, tags: ["site:blog"] });
});

test("legacyProviderCredentialCheck: matches only the retired `plugin:<id>` label, from the non-decrypting listing", async () => {
  const check = legacyProviderCredentialCheck({ listLabels: async () => [{ label: "plugin:observability-opentelemetry" }, { label: "Stripe" }] });
  assert.equal(await check({ pluginId: "observability-opentelemetry" }), true);
  assert.equal(await check({ pluginId: "analytics-posthog" }), false);
  assert.equal(await check({ pluginId: "observability" }), false, "a prefix is not a match");
});
