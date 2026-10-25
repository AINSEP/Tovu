import assert from "node:assert/strict";
import test from "node:test";

import { createNoopObservabilityPort, isNoopObservabilityPort, type ObservabilityPort } from "@jini-ai/diagnostics/observability";
import { isNoopProductAnalytics, type ProductAnalyticsPort } from "@jini-ai/analytics/product";
import { createPluginContributionRegistry, type PluginProviderFactory } from "@jini-ai/plugins/host";

import { bootProviderPlugins, otlpAuthorization, PROVIDER_CONTRACTS, PROVIDER_PLUGIN_BINDINGS, providerPluginCredentialLabel, providerPluginCredentialOf, type ProviderPluginBinding, type ProviderPluginCredential } from "../provider-plugins.js";

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

/** A runtime whose `loadProviderPlugins` admits the given plugins' factories (the "installed + enabled" subset). */
function fakeRuntime({ factories, installed }: { factories: Record<string, { contract: string; id: string; factory: PluginProviderFactory }>; installed: readonly string[] }) {
  const providerContributions = createPluginContributionRegistry({});
  const requested: string[][] = [];
  return {
    requested,
    runtime: {
      providerContributions,
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

const CARDS: Record<string, ProviderPluginCredential> = {
  "plugin:observability-opentelemetry": { baseUrl: "https://otlp.example.test/otlp", token: "glc_token", username: "123456" },
  "plugin:observability-sentry": { baseUrl: "https://sentry.example.test", token: "https://public@sentry.example.test/1" },
  "plugin:analytics-posthog": { baseUrl: "https://posthog.example.test", token: "phc_key" },
  "plugin:ai-trace-langfuse": { baseUrl: "https://langfuse.example.test", token: "sk-lf", username: "pk-lf" },
};
const readCards = (cards: Record<string, ProviderPluginCredential>) => async ({ label }: { label: string }) => cards[label] ?? null;
const consentAlways = { consent: () => true, consentRevision: () => 0 };
const quiet = () => {};

test("nothing configured: nothing is loaded, every contract is the shared noop, and AI tracing is off", async () => {
  const { runtime, requested } = fakeRuntime({ factories: {}, installed: [] });
  const ports = await bootProviderPlugins({ runtime, readCredential: readCards({}), serviceName: "tovu", ...consentAlways }, { warn: quiet });
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
  const ports = await bootProviderPlugins({ runtime, readCredential: readCards({ "plugin:observability-opentelemetry": CARDS["plugin:observability-opentelemetry"]!, "plugin:observability-sentry": CARDS["plugin:observability-sentry"]! }), serviceName: "tovu", ...consentAlways }, { warn: quiet });
  assert.deepEqual(requested, [["observability-opentelemetry", "observability-sentry"]]);
  assert.deepEqual(otel.inputs, [{ serviceName: "tovu", tracerName: "tovu.observability", endpoint: "https://otlp.example.test/otlp", headers: { authorization: `Basic ${Buffer.from("123456:glc_token").toString("base64")}` } }]);
  assert.deepEqual(sentry.inputs, [{ dsn: "https://public@sentry.example.test/1" }]);
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
  const ports = await bootProviderPlugins({ runtime, readCredential: readCards(CARDS), serviceName: "tovu", ...consentAlways }, { warn: quiet });
  assert.equal(isNoopObservabilityPort(ports.observability), true);
  assert.deepEqual(calls.inputs, []);
});

test("an unreadable key card is treated as not configured, with a warning naming the plugin", async () => {
  const warnings: string[] = [];
  const { runtime, requested } = fakeRuntime({ installed: [], factories: {} });
  const ports = await bootProviderPlugins({ runtime, readCredential: async () => { throw new Error("vault locked"); }, serviceName: "tovu", ...consentAlways }, { warn: (message) => warnings.push(message), bindings: [PROVIDER_PLUGIN_BINDINGS[0]!] });
  assert.deepEqual(requested, [[]]);
  assert.equal(isNoopObservabilityPort(ports.observability), true);
  assert.deepEqual(warnings, ["provider plugin 'observability-opentelemetry': its key card could not be read; left on the noop"]);
});

test("a throwing factory, an invalid port and a hung initialization each leave only their own contract on the noop", async () => {
  const warnings: string[] = [];
  const seen: string[] = [];
  const good: Calls = { inputs: [], disposed: 0 };
  const { runtime } = fakeRuntime({ installed: ["observability-opentelemetry", "observability-sentry", "analytics-posthog", "ai-trace-langfuse"], factories: {
    "observability-opentelemetry": { contract: "observability", id: "opentelemetry", factory: () => { throw new Error("bad endpoint"); } },
    "observability-sentry": { contract: "observability", id: "sentry", factory: fakeFactory({ calls: good, port: recordingObservability(seen) }) },
    "analytics-posthog": { contract: "product_analytics", id: "posthog", factory: fakeFactory({ calls: good, port: { capture: "nope" } }) },
    "ai-trace-langfuse": { contract: "ai_trace", id: "langfuse", factory: () => new Promise(() => {}) },
  } });
  const ports = await bootProviderPlugins({ runtime, readCredential: readCards(CARDS), serviceName: "tovu", ...consentAlways }, { warn: (message) => warnings.push(message), initializeTimeoutMs: 20 });
  ports.observability.trackOperation({ name: "still-works" }).end({ outcome: "completed", failed: false });
  assert.deepEqual(seen, ["op:still-works"]);
  assert.equal(isNoopProductAnalytics(ports.productAnalytics), true);
  assert.equal(ports.aiTraceSink, undefined);
  assert.deepEqual(warnings, [
    "provider plugin 'observability-opentelemetry' did not initialize: bad endpoint",
    "provider plugin 'analytics-posthog' did not initialize: product_analytics provider 'posthog' is invalid: not a ProductAnalyticsPort",
    "provider plugin 'ai-trace-langfuse' did not initialize: provider initialization timed out",
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
  const ports = await bootProviderPlugins({ runtime, readCredential: readCards({ "plugin:analytics-posthog": CARDS["plugin:analytics-posthog"]! }), serviceName: "tovu",
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
  const ports = await bootProviderPlugins({ runtime, readCredential: readCards(CARDS), serviceName: "tovu", ...consentAlways }, { warn: quiet });
  assert.deepEqual(calls.inputs, [{ publicKey: "pk-lf", secretKey: "sk-lf", baseUrl: "https://langfuse.example.test" }]);
  const event = { kind: "run_finished", traceId: "t", at: 0, outcome: "succeeded", error: null, totals: { turns: 0, toolCalls: 0, toolErrors: 0, inputTokens: null, outputTokens: null, costUsd: null } } as const;
  ports.aiTraceSink!.record(event);
  assert.deepEqual(recorded, [event]);
});

test("disabling a provider plugin (its contribution detached) disposes its resources", async () => {
  const calls: Calls = { inputs: [], disposed: 0 };
  const { runtime } = fakeRuntime({ installed: ["observability-sentry"], factories: { "observability-sentry": { contract: "observability", id: "sentry", factory: fakeFactory({ calls, port: recordingObservability([]) }) } } });
  const ports = await bootProviderPlugins({ runtime, readCredential: readCards(CARDS), serviceName: "tovu", ...consentAlways }, { warn: quiet });
  runtime.providerContributions.detach({ pluginId: "observability-sentry" });
  for (let i = 0; i < 20 && calls.disposed === 0; i += 1) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.disposed, 1);
  await ports.dispose({});
  assert.equal(calls.disposed, 1, "teardown is idempotent");
});

test("two product-analytics providers both receive each allowed event", async () => {
  const seen: string[] = [];
  const port = (tag: string): ProductAnalyticsPort => ({ capture: (event) => { seen.push(`${tag}:${event.name}`); }, identify: (identity) => { seen.push(`${tag}:id:${identity.userId}`); } });
  const bindings: ProviderPluginBinding[] = [
    { pluginId: "a", contract: "product_analytics", id: "a", input: () => ({}) },
    { pluginId: "b", contract: "product_analytics", id: "b", input: () => ({}) },
  ];
  const { runtime } = fakeRuntime({ installed: ["a", "b"], factories: {
    a: { contract: "product_analytics", id: "a", factory: fakeFactory({ calls: { inputs: [], disposed: 0 }, port: port("a") }) },
    b: { contract: "product_analytics", id: "b", factory: () => ({ port: { capture: () => { throw new Error("down"); }, identify: () => { throw new Error("down"); } }, dispose: () => {} }) },
  } });
  const ports = await bootProviderPlugins({ runtime, readCredential: async () => CARDS["plugin:analytics-posthog"]!, serviceName: "tovu", ...consentAlways }, { bindings, warn: quiet });
  ports.productAnalytics.capture({ name: "theme_changed", userId: "p-2" });
  ports.productAnalytics.identify({ userId: "p-2" });
  assert.deepEqual(seen, ["a:theme_changed", "a:id:p-2"]);
});

test("bindings: every known plugin maps its card; labels are one per plugin id", () => {
  const byId = Object.fromEntries(PROVIDER_PLUGIN_BINDINGS.map((binding) => [binding.pluginId, binding]));
  assert.deepEqual(Object.keys(byId), ["observability-opentelemetry", "observability-sentry", "analytics-posthog", "ai-trace-langfuse"]);
  assert.deepEqual(PROVIDER_PLUGIN_BINDINGS.map(({ pluginId, contract, id }) => [pluginId, contract, id]), [
    ["observability-opentelemetry", "observability", "opentelemetry"], ["observability-sentry", "observability", "sentry"],
    ["analytics-posthog", "product_analytics", "posthog"], ["ai-trace-langfuse", "ai_trace", "langfuse"],
  ]);
  assert.deepEqual(byId["analytics-posthog"]!.input({ credential: CARDS["plugin:analytics-posthog"]!, serviceName: "s" }), { apiKey: "phc_key", host: "https://posthog.example.test" });
  assert.equal(providerPluginCredentialLabel({ pluginId: "analytics-posthog" }), "plugin:analytics-posthog");
});

test("OTLP auth is generic: username → Basic, otherwise Bearer", () => {
  assert.deepEqual(otlpAuthorization({ credential: { baseUrl: "https://c", token: "t" } }), { authorization: "Bearer t" });
  assert.deepEqual(otlpAuthorization({ credential: { baseUrl: "https://c", token: "t", username: "u" } }), { authorization: `Basic ${Buffer.from("u:t").toString("base64")}` });
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
  const ports = await bootProviderPlugins({ runtime, readCredential: readCards(CARDS), serviceName: "tovu", ...consentAlways }, { bindings: [PROVIDER_PLUGIN_BINDINGS[1]!] });
  assert.equal(isNoopObservabilityPort(ports.observability), true);
  assert.deepEqual(warn.mock.calls.map((call) => call.arguments[0]), ["[provider-plugins] provider plugin 'observability-sentry' did not initialize: refused"]);
});

test("a provider whose dispose fails is reported by phase through the warn sink", async () => {
  const warnings: string[] = [];
  const { runtime } = fakeRuntime({ installed: ["observability-sentry"], factories: { "observability-sentry": { contract: "observability", id: "sentry", factory: () => ({ port: recordingObservability([]), dispose: () => { throw new Error("close failed"); } }) } } });
  const ports = await bootProviderPlugins({ runtime, readCredential: readCards(CARDS), serviceName: "tovu", ...consentAlways }, { bindings: [PROVIDER_PLUGIN_BINDINGS[1]!], warn: (message) => warnings.push(message) });
  await ports.dispose({});
  for (let i = 0; i < 20 && warnings.length === 0; i += 1) await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(warnings, ["provider plugin 'observability-sentry' dispose failed"]);
});

test("a resolved saved credential maps to a card; no row means not configured", () => {
  assert.equal(providerPluginCredentialOf({ resolved: null }), null);
  assert.deepEqual(providerPluginCredentialOf({ resolved: { baseUrl: "https://c", connection: { token: "t" } } }), { baseUrl: "https://c", token: "t" });
  assert.deepEqual(providerPluginCredentialOf({ resolved: { baseUrl: "https://c", connection: { token: "t", username: "u" } } }), { baseUrl: "https://c", token: "t", username: "u" });
});
