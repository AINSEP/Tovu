import assert from "node:assert/strict";
import { createHash } from 'node:crypto';
import test from "node:test";

import { createNoopObservabilityPort, createNoopTracker, isNoopObservabilityPort, type ObservabilityPort } from "@jini-ai/diagnostics/observability";
import type { ProductAnalyticsPort } from "@jini-ai/analytics/product";
import { createAiTraceRecorder } from "@jini-ai/agent-runtime/ai-trace";
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
  return { ...noop, supportsMetric: true, metric: (input) => { seen.push(`metric:${input.name}`); }, trackOperation: (input) => { seen.push(`op:${input.name}`); return noop.trackOperation(input); }, reportError: (report) => { seen.push(`error:${report.context.operation}`); } };
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
  usage: async ({ pluginId }) => ({ store: "site", usedByThisSite: Boolean(configs[pluginId]), usedBy: [] }),
  read: async ({ pluginId }) => configs[pluginId] ?? null,
  readSettings: async () => null,
  write: async () => {},
});
const SITE: SiteIdentity = { siteId: "site-123", siteSlug: "blog", environment: "local", projectId: "project-abc" };
const OBS_ATTRIBUTION = attributionFor({ contract: "observability", site: SITE });
const consentAlways = { consent: () => true, consentRevision: () => 0 };
const quiet = () => {};

test('browser contribution comes only from a configured current analytics lease', async () => {
  const contribution = { source: 'function(){return function(mode){};}', origins: ['https://collector.example'], supportsStatic: false };
  let browserCalls = 0;
  const port: ProductAnalyticsPort = { capture() {}, identify() {}, browserAnalytics: () => { browserCalls++; return { ...contribution }; } };
  const { runtime } = fakeRuntime({ installed: ['analytics-posthog'], factories: {
    'analytics-posthog': { contract: 'product_analytics', id: 'posthog', factory: fakeFactory({ calls: { inputs: [], disposed: 0 }, port }) },
  } });
  const providers = await bootProviderPlugins({ runtime, config: configOf(CONFIGS), serviceName: 'tovu', site: SITE, ...consentAlways }, { warn: quiet });
  assert.deepEqual(providers.browserAnalytics?.({ surface: 'site' }), [{ ...contribution, configuration: {
    url: '/_jini/browser-analytics?surface=site', revision: createHash('sha256').update(JSON.stringify([contribution])).digest('hex'),
  } }]);
  const cached = providers.browserAnalytics!({ surface: 'site' });
  assert.equal(providers.browserAnalytics!({ surface: 'site' }), cached);
  assert.equal(browserCalls, 1, 'unchanged inventory reuses provider source and hashed revision');
  runtime.providerContributions.detach({ pluginId: 'analytics-posthog' });
  assert.deepEqual(providers.browserAnalytics?.({ surface: 'site' }), []);
  await providers.dispose({});
  const absent = await bootProviderPlugins({ runtime, config: configOf({}), serviceName: 'tovu', site: SITE, ...consentAlways }, { warn: quiet });
  assert.deepEqual(absent.browserAnalytics?.({ surface: 'admin' }), []);
  await absent.dispose({});
});

test('provider replacement changes the browser revision, removal withdraws it, and legacy controllers require restart', async () => {
  const configs = { ...CONFIGS };
  let live = true;
  const { runtime } = fakeRuntime({ installed: ['analytics-posthog'], factories: {
    'analytics-posthog': { contract: 'product_analytics', id: 'posthog', factory: (input) => ({
      port: { capture() {}, identify() {}, browserAnalytics: () => ({
        source: `function(){var key=${JSON.stringify(input.apiKey)};return function(mode){};}`,
        origins: [], supportsStatic: false, supportsLiveConsent: live,
      }) }, dispose() {},
    }) },
  } });
  const providers = await bootProviderPlugins({ runtime, config: configOf(configs), serviceName: 'tovu', site: SITE, ...consentAlways }, { warn: quiet });
  try {
    const first = providers.browserAnalytics!({ surface: 'site' })[0]!.configuration!.revision;
    configs['analytics-posthog'] = { settings: CONFIGS['analytics-posthog']!.settings, secrets: { apiKey: ['phc', 'replacement'].join('_') } };
    assert.equal(await providers.reapply({ pluginId: 'analytics-posthog' }), 'now');
    assert.notEqual(providers.browserAnalytics!({ surface: 'site' })[0]!.configuration!.revision, first);
    live = false;
    delete configs['analytics-posthog'];
    assert.equal(await providers.reapply({ pluginId: 'analytics-posthog' }), 'restart');
    assert.deepEqual(providers.browserAnalytics!({ surface: 'site' }), []);
  } finally { await providers.dispose({}); }
});

test("provider reporter feeds delivery status and diagnostic receipts follow live leases and consent", async () => {
  const warnings: string[] = [];
  const seen: string[] = [];
  let report!: (value: import("@jini-ai/diagnostics/observability").ProviderTelemetryReport) => void;
  let allowed = false;
  const { runtime } = fakeRuntime({ installed: ["observability-opentelemetry", "analytics-posthog"], factories: {
    "observability-opentelemetry": { contract: "observability", id: "trace", factory: (_input, options = {}) => {
      report = options.reportTelemetry as typeof report;
      return { port: recordingObservability(seen), dispose() {} };
    } },
    "analytics-posthog": { contract: "product_analytics", id: "events", factory: () => ({ port: {
      capture: (event: { name: string }) => { seen.push(`event:${event.name}`); }, identify() {},
    }, dispose() {} }) },
  } });
  const providers = await bootProviderPlugins({ runtime, config: configOf(CONFIGS), serviceName: "tovu", site: SITE,
    consent: () => allowed, consentRevision: () => 0 }, { warn: message => { warnings.push(message); }, info: quiet });
  assert.deepEqual(providers.telemetryStatus({}), [
    { providerId: "observability-opentelemetry/trace", lastExport: null, lastShutdown: null },
    { providerId: "analytics-posthog/events", lastExport: null, lastShutdown: null },
  ]);
  report({ phase: "export", outcome: "failed", host: "collector.test", errorClass: "Error", statusCode: 401 });
  report({ phase: "export", outcome: "failed", host: "collector.test", errorClass: "Error", statusCode: 401 });
  assert.deepEqual(warnings, ["observability: observability-opentelemetry/trace export failed (Error, HTTP 401, host collector.test)"]);
  assert.equal(providers.telemetryStatus({})[0]!.lastExport!.outcome, "failed");
  assert.ok(providers.telemetryStatus({})[0]!.lastExport!.at);
  report({ phase: "export", outcome: "ok", host: "collector.test" });
  assert.equal(providers.telemetryStatus({})[0]!.lastExport!.outcome, "ok");
  const send = () => providers.sendTelemetryTest({ error: new Error("Tovu test error — safe to ignore") });
  assert.deepEqual(await send(), { providers: [{ providerId: "observability-opentelemetry/trace", signals: ["span", "metric", "error"] }] });
  allowed = true;
  assert.deepEqual(await send(), { providers: [
    { providerId: "observability-opentelemetry/trace", signals: ["span", "metric", "error"] },
    { providerId: "analytics-posthog/events", signals: ["analytics"] },
  ] });
  assert.deepEqual(seen, ["op:telemetry.test", "metric:telemetry.test", "error:telemetry.test", "op:telemetry.test", "metric:telemetry.test", "error:telemetry.test", "event:telemetry_test"]);
  await providers.dispose({});
  assert.deepEqual(await send(), { providers: [] });
});

test("nothing configured: nothing is loaded, every contract is the shared noop, and AI tracing is off", async () => {
  const { runtime, requested } = fakeRuntime({ factories: {}, installed: [] });
  const ports = await bootProviderPlugins({ runtime, config: configOf({}), serviceName: "tovu", site: SITE, ...consentAlways }, { warn: quiet });
  assert.deepEqual(requested, []);
  assert.equal(isNoopObservabilityPort(ports.observability), true);
  assert.equal(ports.tracker, createNoopTracker({}));
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
  assert.deepEqual(requested, [["observability-opentelemetry"], ["observability-sentry"]]);
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
  assert.deepEqual(requested, []);
  assert.equal(isNoopObservabilityPort(ports.observability), false);
  assert.deepEqual(warnings, ["provider plugin 'observability-opentelemetry' did not initialize: Error"]);
});

test("installed + enabled but unconfigured (or missing a required field): never loaded; contracts Tovu does not host are skipped", async () => {
  const calls: Calls = { inputs: [], disposed: 0 };
  const { runtime, requested } = fakeRuntime({ installed: ["observability-opentelemetry", "payments-stripe"], factories: {
    "observability-opentelemetry": { contract: "observability", id: "opentelemetry", factory: fakeFactory({ calls, port: recordingObservability([]) }) },
    "payments-stripe": { contract: "payments", id: "stripe", factory: fakeFactory({ calls, port: {} }) },
  } });
  const config = configOf({ "observability-opentelemetry": { settings: { endpoint: "  " }, secrets: { headers: "a=b" } }, "payments-stripe": { settings: {}, secrets: { apiKey: "sk" } } });
  const ports = await bootProviderPlugins({ runtime, config, serviceName: "tovu", site: SITE, ...consentAlways }, { warn: quiet });
  assert.deepEqual(requested, []);
  assert.equal(isNoopObservabilityPort(ports.observability), false);
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

test("providerInputOf: a blank public field takes the plugin's declared default; a saved value wins", () => {
  const declaration = { contract: "product_analytics", id: "x", contractVersion: 1 as const, settings: [
    { name: "host", label: "Host", required: true, default: "https://us.example.test" }, { name: "apiKey", label: "Key", secret: true, required: true }] };
  assert.deepEqual(providerInputOf({ declaration, saved: { settings: { host: " " }, secrets: { apiKey: "k" } } }), { host: "https://us.example.test", apiKey: "k" });
  assert.deepEqual(providerInputOf({ declaration, saved: { settings: {}, secrets: { apiKey: "k" } } }), { host: "https://us.example.test", apiKey: "k" });
  assert.deepEqual(providerInputOf({ declaration, saved: { settings: { host: "https://eu.example.test" }, secrets: { apiKey: "k" } } }), { host: "https://eu.example.test", apiKey: "k" });
  assert.equal(providerInputOf({ declaration, saved: { settings: {}, secrets: {} } }), undefined);
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
  assert.notEqual(ports.tracker, createNoopTracker({}), "the stable wrapper can become active later");
  assert.notEqual(ports.aiTraceSink, undefined, "a declared trace slot can become active later");
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
  ports.tracker.capture({ name: "post_published", userId: "p-1" });
  revision += 1; // the operator revoked consent while the read was in flight
  answer(true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(captured, []);
  ports.tracker.capture({ name: "post_published", userId: "p-1" });
  answer(true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(captured, ["post_published:p-1"]);
  ports.tracker.capture({ name: "post_published", userId: "p-1" }, { properties: { email: "x" } });
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
  ports.tracker.capture({ name: "theme_changed", userId: "p-2" });
  // Identity fan-out is covered at its new owner, analytics/product-fanout.test.ts.
  assert.deepEqual(seen, ["a:provider_initialized", "a:provider_initialized", "a:theme_changed"]);
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
  // A contract v1 provider written before metrics still loads; its metric calls take the noop path.
  assert.equal(observability.validate({ provider: { ...createNoopObservabilityPort({}), metric: undefined } }), undefined);
});

test("without a warn sink, a provider failure (even a non-Error rejection) goes to the console", async (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  const { runtime } = fakeRuntime({ installed: ["observability-sentry"], factories: { "observability-sentry": { contract: "observability", id: "sentry", factory: () => Promise.reject("refused") } } });
  const ports = await bootProviderPlugins({ runtime, config: configOf(CONFIGS), serviceName: "tovu", site: SITE, ...consentAlways });
  assert.equal(isNoopObservabilityPort(ports.observability), false);
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
  ports.tracker.capture({ name: "before", userId: "p-1" });
  ports.aiTraceSink!.record(event);
  assert.deepEqual(seen, ["capture:provider_initialized", "capture:provider_initialized", "capture:provider_initialized", "op:before", "capture:before"]);
  assert.equal(sinkEvents.length, 1);
  for (const pluginId of ["observability-sentry", "analytics-posthog", "ai-trace-langfuse"]) runtime.providerContributions.detach({ pluginId });
  // Synchronously after detach — before the host's queued disposal — the lease is already not current.
  ports.observability.trackOperation({ name: "after" }).end({ outcome: "ok" });
  ports.observability.reportError({ error: new Error("x"), context: { operation: "after" } } as never);
  ports.tracker.capture({ name: "after", userId: "p-1" });
  ports.aiTraceSink!.record(event);
  await ports.aiTraceSink!.flush?.();
  assert.deepEqual(seen, ["capture:provider_initialized", "capture:provider_initialized", "capture:provider_initialized", "op:before", "capture:before"]);
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

test("analytics-only AI capability records generations, reuses consent revocation and goes inert on disable", async () => {
  const events: unknown[] = [];
  const port: ProductAnalyticsPort = { capture() {}, identify() {}, includeAiContent: true, captureAiGeneration: (event) => { events.push(event); } };
  const { runtime } = fakeRuntime({ installed: ["analytics-posthog"], factories: { "analytics-posthog": { contract: "product_analytics", id: "posthog", factory: fakeFactory({ calls: { inputs: [], disposed: 0 }, port }) } } });
  let revision = 0;
  let approve!: (allowed: boolean) => void;
  const ports = await bootProviderPlugins({ runtime, config: configOf(CONFIGS), serviceName: "tovu", site: SITE,
    consent: () => new Promise<boolean>((resolve) => { approve = resolve; }), consentRevision: () => revision }, { warn: quiet });
  assert.equal(ports.aiTraceSink?.capture, "full");
  const run = (runId: string) => {
    const recorder = createAiTraceRecorder({ sink: ports.aiTraceSink!, runId, agentId: "fixture" }, { provider: "fixture", model: "fixture-model" });
    recorder.start({ input: "Hello" });
    recorder.observe({ type: "usage", usage: { input_tokens: 3, output_tokens: 1 } });
    recorder.finish({ outcome: "succeeded" });
  };
  run("stale"); revision++; approve(true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(events, []);
  run("allowed"); approve(true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(events.length, 1);
  assert.equal((events[0] as { userId: string }).userId, "site:site-123");
  run("detached");
  runtime.providerContributions.detach({ pluginId: "analytics-posthog" });
  approve(true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(events.length, 1, "an approval resolving after disable cannot reach the vendor");
  await ports.dispose({});
  run("disposed");
  assert.equal(events.length, 1);
});

test("analytics providers have independent content policies and one failure cannot block another generation destination", async () => {
  const received: unknown[] = [];
  const makePort = (includeAiContent: boolean): ProductAnalyticsPort => ({ capture() {}, identify() {}, includeAiContent, captureAiGeneration: (event) => { received.push(event); } });
  const { runtime } = fakeRuntime({ installed: ["full", "broken", "metadata"], factories: {
    full: { contract: "product_analytics", id: "full", factory: () => ({ port: makePort(true), dispose() {} }) },
    broken: { contract: "product_analytics", id: "broken", factory: () => ({ port: { ...makePort(false), captureAiGeneration() { throw new Error("offline"); } }, dispose() {} }) },
    metadata: { contract: "product_analytics", id: "metadata", factory: () => ({ port: makePort(false), dispose() {} }) },
  } });
  const config = configOf(Object.fromEntries(["full", "broken", "metadata"].map((id) => [id, { settings: {}, secrets: { apiKey: "fixture" } }])));
  const ports = await bootProviderPlugins({ runtime, config, serviceName: "tovu", site: SITE, ...consentAlways }, { warn: quiet });
  const recorder = createAiTraceRecorder({ sink: ports.aiTraceSink!, runId: "r", agentId: "fixture" });
  recorder.start({ input: "Hello" });
  recorder.observe({ type: "text_delta", delta: "Welcome" });
  recorder.finish({ outcome: "succeeded" });
  assert.deepEqual(received.map((event) => {
    const generation = event as { userId: string; input?: string; output?: string };
    return { userId: generation.userId, input: generation.input, output: generation.output };
  }), [
    { userId: "site:site-123", input: "Hello", output: "Welcome" },
    { userId: "site:site-123", input: undefined, output: undefined },
  ]);
  await ports.dispose({});
});

test("optional AI capability validation rejects malformed hooks and content policies", () => {
  const contract = PROVIDER_CONTRACTS.find((entry) => entry.contract === "product_analytics")!;
  for (const extra of [{ captureAiGeneration: "wrong" }, { includeAiContent: "true" }]) {
    assert.equal(contract.validate({ provider: { capture() {}, identify() {}, ...extra } }), "not a ProductAnalyticsPort");
  }
});


test("an unconfigured slot becomes live without replacing captured ports; rotation, detach, failure and retry use the same lifecycle", async () => {
  const seen: string[] = []; let saved: ProviderPluginConfig | null = null; let disposed = 0;
  const factory: PluginProviderFactory = input => {
    if (input.apiKey === "refuse") throw new TypeError(["fake", "sensitive"].join("_"));
    const name = String(input.apiKey);
    return { port: { capture() { seen.push(name); }, identify() {} }, dispose() { disposed++; } };
  };
  const { runtime } = fakeRuntime({ installed: ["analytics-posthog"], factories: { "analytics-posthog": { contract: "product_analytics", id: "posthog", factory } } });
  const warnings: string[] = [];
  const ports = await bootProviderPlugins({ runtime, config: { ...configOf({}), read: async () => saved }, serviceName: "test", site: SITE, ...consentAlways }, { warn: message => warnings.push(message) });
  const captured = ports.tracker;
  const event = { name: "probe", userId: "owner" };
  captured.capture(event); assert.deepEqual(seen, []);
  saved = { settings: { host: "https://collector.example.test" }, secrets: { apiKey: ["fake", "first"].join("_") } };
  assert.equal(await ports.reapply({ pluginId: "analytics-posthog" }), "now");
  captured.capture(event); assert.deepEqual(seen, [saved.secrets.apiKey, saved.secrets.apiKey]);
  assert.equal(await ports.reapply({ pluginId: "analytics-posthog" }), "now");
  assert.equal(disposed, 0, "unchanged settings do not reinitialize");
  saved = { ...saved, secrets: { apiKey: ["fake", "second"].join("_") } };
  await ports.reapply({ pluginId: "analytics-posthog" });
  captured.capture(event); assert.equal(seen[2], saved.secrets.apiKey); assert.equal(seen[3], saved.secrets.apiKey); assert.equal(disposed, 1);
  saved = null; await ports.reapply({ pluginId: "analytics-posthog" });
  captured.capture(event); assert.equal(seen.length, 4); assert.equal(disposed, 2);
  saved = { settings: { host: "https://collector.example.test" }, secrets: { apiKey: "refuse" } };
  assert.equal(await ports.reapply({ pluginId: "analytics-posthog" }), "restart");
  assert.equal(ports.appliesAt({ pluginId: "analytics-posthog" }), "restart");
  captured.capture(event); assert.equal(seen.length, 4);
  assert.deepEqual(warnings, ["provider plugin 'analytics-posthog' did not initialize: TypeError"]);
  saved = { ...saved, secrets: { apiKey: ["fake", "recovered"].join("_") } };
  assert.equal(await ports.reapply({ pluginId: "analytics-posthog" }), "now");
  captured.capture(event); assert.equal(seen[4], saved.secrets.apiKey); assert.equal(seen[5], saved.secrets.apiKey);
  await ports.dispose({}); assert.equal(disposed, 3);
});

test("AI generation recording follows live attachment and content-policy rotation, including pending consent", async () => {
  const events: { input?: string }[] = [];
  const fullKey = ["fake", "full"].join("_");
  let saved: ProviderPluginConfig | null = null;
  const { runtime } = fakeRuntime({ installed: ["analytics-posthog"], factories: {
    "analytics-posthog": { contract: "product_analytics", id: "posthog", factory: (input) => ({
      port: { capture() {}, identify() {}, includeAiContent: input.apiKey === fullKey,
        captureAiGeneration: (event: { input?: string }) => { events.push(event); } }, dispose() {},
    }) },
  } });
  const approvals: Array<(allowed: boolean) => void> = [];
  const approve = (allowed: boolean) => { for (const resolve of approvals.splice(0)) resolve(allowed); };
  const ports = await bootProviderPlugins({ runtime, config: { ...configOf({}), read: async () => saved }, serviceName: "test", site: SITE,
    consent: () => new Promise<boolean>((resolve) => { approvals.push(resolve); }), consentRevision: () => 0 }, { warn: quiet });
  const sink = ports.aiTraceSink!;
  const run = (runId: string) => {
    const recorder = createAiTraceRecorder({ sink, runId, agentId: "fixture" });
    recorder.start({ input: "Hello" });
    recorder.observe({ type: "usage", usage: { input_tokens: 3, output_tokens: 1 } });
    recorder.finish({ outcome: "succeeded" });
  };
  assert.equal(sink.capture, "metadata");
  saved = { settings: { host: "https://collector.example.test" }, secrets: { apiKey: fullKey } };
  await ports.reapply({ pluginId: "analytics-posthog" });
  assert.equal(sink.capture, "full");
  run("full"); approve(true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(events[0]?.input, "Hello");
  run("pending");
  saved = { ...saved, secrets: { apiKey: ["fake", "metadata"].join("_") } };
  await ports.reapply({ pluginId: "analytics-posthog" });
  assert.equal(sink.capture, "metadata");
  approve(true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(events.length, 2);
  assert.equal("input" in events[1]!, false, "the current provider policy strips content approved after rotation");
  saved = null;
  await ports.reapply({ pluginId: "analytics-posthog" });
  run("detached"); approve(true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(events.length, 2);
  await ports.dispose({});
});

test('visitor events follow visitor proof and revocation even when owner admin telemetry is off', async () => {
  const { captureVisitorEvent } = await import('#src/server/inbound/public-http/visitor-analytics');
  const events: import('@jini-ai/analytics/product').ProductEvent[] = [];
  const { runtime } = fakeRuntime({ installed: ['analytics-posthog'], factories: {
    'analytics-posthog': { contract: 'product_analytics', id: 'posthog', factory: fakeFactory({ calls: { inputs: [], disposed: 0 },
      port: { capture: (event: import('@jini-ai/analytics/product').ProductEvent) => { events.push(event); }, identify() {} } }) },
  } });
  const providers = await bootProviderPlugins({ runtime, config: configOf(CONFIGS), serviceName: 'tovu', site: SITE,
    consent: () => false, consentRevision: () => 0 }, { warn: quiet });
  let granted = false, current = true;
  const deps = { tracker: providers.tracker, visitorTracker: providers.visitorTracker, idGen: { newId: () => 'request' },
    visitorAnalyticsProof: async () => granted ? { receiptId: 'fixture-receipt', policyVersion: '1' } : undefined,
    visitorAnalyticsDeliveryAllowed: async () => current };
  const capture = () => captureVisitorEvent({ deps, request: {} as import('express').Request, name: 'site_pageview' });
  try {
    await providers.tracker.capture({ name: 'admin_opened', userId: 'owner' });
    await capture(); assert.deepEqual(events, []);
    granted = true; await capture();
    current = false; await capture();
    assert.deepEqual(events, [{ name: 'site_pageview', userId: 'visitor:request' }]);
    await providers.visitorTracker!.capture({ name: 'site_search_performed', userId: 'visitor:request' }, { properties: { email: 'private' } });
    assert.equal(events.length, 1, 'visitor analytics retains the shared PII guard');
  } finally { await providers.dispose({}); }
});

test('enabled reflects configured current observability leases rather than inert wrappers', async () => {
  let saved: ProviderPluginConfig | null = null;
  const { runtime } = fakeRuntime({ installed: ['observability-sentry'], factories: {
    'observability-sentry': { contract: 'observability', id: 'sentry', factory: fakeFactory({ calls: { inputs: [], disposed: 0 }, port: recordingObservability([]) }) },
  } });
  const providers = await bootProviderPlugins({ runtime, config: { ...configOf({}), read: async () => saved }, serviceName: 'tovu', site: SITE, ...consentAlways }, { warn: quiet });
  try {
    assert.equal(providers.observabilityEnabled!(), false);
    saved = CONFIGS['observability-sentry']!;
    await providers.reapply({ pluginId: 'observability-sentry' });
    assert.equal(providers.observabilityEnabled!(), true);
    runtime.providerContributions.detach({ pluginId: 'observability-sentry' });
    assert.equal(providers.observabilityEnabled!(), false);
  } finally { await providers.dispose({}); }
});

test('a later contract failure records failure for all rolled-back slots and never publishes stale success', async () => {
  const contributions = createPluginContributionRegistry({});
  const events: import('@jini-ai/analytics/product').ProductEvent[] = [];
  const settings = [{ name: 'apiKey', label: 'Key', required: true }];
  const analytics = { contract: 'product_analytics', id: 'analytics', contractVersion: 1 as const, settings };
  const first = { contract: 'observability', id: 'first', contractVersion: 1 as const, settings };
  const second = { contract: 'ai_trace', id: 'second', contractVersion: 1 as const, settings };
  let disposed = 0;
  const runtime = {
    providerContributions: contributions,
    listProviderPlugins: async () => [{ pluginId: 'healthy', providers: [analytics] }, { pluginId: 'mixed', providers: [first, second] }],
    loadProviderPlugins: async ({ pluginIds }: { pluginIds: readonly string[] }) => {
      for (const pluginId of pluginIds) contributions.replace({ contributions: { pluginId, sdk: {} as never, routes: [], tools: [], widgets: [], providers: pluginId === 'healthy'
        ? [{ ...analytics, factory: () => ({ port: { capture: (event: import('@jini-ai/analytics/product').ProductEvent) => { events.push(event); }, identify() {} }, dispose() {} }) }]
        : [{ ...first, factory: () => ({ port: recordingObservability([]), dispose() { disposed++; } }) },
          { ...second, factory: () => { throw new Error('refused'); } }] } });
      return pluginIds;
    },
  };
  const providers = await bootProviderPlugins({ runtime, config: configOf({ healthy: { settings: { apiKey: 'fixture' }, secrets: {} }, mixed: { settings: { apiKey: 'fixture' }, secrets: {} } }),
    serviceName: 'tovu', site: SITE, ...consentAlways }, { warn: quiet });
  try {
    assert.deepEqual(events.filter(event => event.properties?.providerId !== 'analytics'), [
      { name: 'provider_initialized', userId: 'site:site-123', properties: { contract: 'observability', providerId: 'first', outcome: 'failure', reasonClass: 'initialization_failed' } },
      { name: 'provider_initialized', userId: 'site:site-123', properties: { contract: 'ai_trace', providerId: 'second', outcome: 'failure', reasonClass: 'initialization_failed' } },
    ]);
    assert.equal(disposed, 1);
    assert.equal(providers.observabilityEnabled!(), false);
  } finally { await providers.dispose({}); }
});


test("provider loading reuses current registrations, reloads retired ones and recovers from refused admission", async () => {
  const calls: Calls = { inputs: [], disposed: 0 };
  const { runtime, requested } = fakeRuntime({ installed: ["observability-sentry"], factories: {
    "observability-sentry": { contract: "observability", id: "sentry", factory: fakeFactory({ calls, port: recordingObservability([]) }) },
  } });
  const load = runtime.loadProviderPlugins;
  let admitted = true;
  runtime.loadProviderPlugins = input => admitted ? load(input) : Promise.resolve([]);
  const warnings: string[] = [];
  const ports = await bootProviderPlugins({ runtime, config: configOf(CONFIGS), serviceName: "test", site: SITE, ...consentAlways }, { warn: message => warnings.push(message) });
  try {
    assert.deepEqual(requested, [["observability-sentry"]]);
    assert.equal(await ports.reapply({ pluginId: "observability-sentry" }), "now");
    assert.deepEqual(requested, [["observability-sentry"]], "a current registration is reused");
    assert.equal(calls.inputs.length, 1);
    runtime.providerContributions.detach({ pluginId: "observability-sentry" });
    admitted = false;
    assert.equal(await ports.reapply({ pluginId: "observability-sentry" }), "restart");
    assert.equal(ports.observabilityEnabled!(), false);
    assert.equal(calls.disposed, 1);
    assert.deepEqual(warnings, ["provider plugin 'observability-sentry' did not initialize: Error"]);
    admitted = true;
    assert.equal(await ports.reapply({ pluginId: "observability-sentry" }), "now");
    assert.deepEqual(requested, [["observability-sentry"], ["observability-sentry"]]);
    assert.equal(calls.inputs.length, 2);
    assert.equal(ports.observabilityEnabled!(), true);
    assert.equal(await ports.reapply({ pluginId: "unknown" }), "restart");
  } finally { await ports.dispose({}); }
  assert.equal(calls.disposed, 2);
  assert.equal(await ports.reapply({ pluginId: "observability-sentry" }), "restart");
});


test("diagnostic receipts exclude noop metrics from Sentry and PostHog while retaining OTel metrics", async () => {
  const seen: string[] = [];
  const { runtime } = fakeRuntime({ installed: ["observability-opentelemetry", "observability-sentry", "analytics-posthog"], factories: {
    "observability-opentelemetry": { contract: "observability", id: "otel", factory: () => ({ port: recordingObservability(seen), dispose() {} }) },
    "observability-sentry": { contract: "observability", id: "sentry", factory: () => ({ port: {
      ...recordingObservability(seen), supportsMetric: false, metric() {},
    }, dispose() {} }) },
    "analytics-posthog": { contract: "product_analytics", id: "posthog", factory: () => ({ port: { capture() {}, identify() {}, metric() {} }, dispose() {} }) },
  } });
  const providers = await bootProviderPlugins({ runtime, config: configOf(CONFIGS), serviceName: "tovu", site: SITE, ...consentAlways }, { warn: quiet, info: quiet });
  try {
    assert.equal(providers.observability.supportsMetric, true);
    const receipt = await providers.sendTelemetryTest({ error: new Error("diagnostic") });
    assert.deepEqual(receipt.providers, [
      { providerId: "observability-opentelemetry/otel", signals: ["span", "metric", "error"] },
      { providerId: "observability-sentry/sentry", signals: ["span", "error"] },
      { providerId: "analytics-posthog/posthog", signals: ["analytics"] },
    ]);
  } finally { await providers.dispose({}); }
  assert.equal(providers.observability.supportsMetric, false);
});
