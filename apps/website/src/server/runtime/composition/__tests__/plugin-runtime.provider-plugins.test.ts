import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryPluginActivationRepo } from "@jini-ai/plugins/host";
import { createNoopObservabilityPort, isNoopObservabilityPort } from "@jini-ai/diagnostics/observability";
import { definePlugin } from "@tovu/sdk";
import { WORD_COUNT_MANIFEST } from "#src/features/plugin-runtime/built-ins/word-count/index";

import { composePluginRuntime, type PluginRuntimeSource } from "../plugin-runtime.js";
import { bootProviderPlugins } from "../provider-plugins.js";

/**
 * @file Provider plugins through Tovu's REAL plugin runtime and Jini's real loader + provider host:
 * a compiled-in source stands in for an installed provider plugin (its code is a fake factory, no
 * vendor). Proves the boot-only load path, that boot re-attach and enable never reload a provider
 * plugin, and that disabling one disposes what it initialized.
 */

const clock = { nowMs: () => 0 };
const PROVIDER_MANIFEST = { ...WORD_COUNT_MANIFEST, id: "obs-fake", tier: "tier-3" as const, extensions: { tovu: { id: "tovu/obs-fake", provides: [] } },
  hooks: [], fields: [], capabilities: ["providers.register"], contributes: { providers: [{ contract: "observability", id: "fake", contractVersion: 1 as const, settings: [{ name: "endpoint", label: "Endpoint", required: true }] }] } };

function fixture({ enabled = true, setupThrows = false, setupGate }: { enabled?: boolean; setupThrows?: boolean; setupGate?: Promise<void> } = {}) {
  const events: string[] = [];
  const repo = new InMemoryPluginActivationRepo();
  const source: PluginRuntimeSource = { source: "built-in", entryPath: "/unused/index.mjs", manifest: PROVIDER_MANIFEST,
    importModule: async () => ({ default: definePlugin({ async setup(sdk) {
      events.push("setup");
      if (setupThrows) throw new Error("setup failed");
      if (setupGate) await setupGate;
      sdk.providers.register({ contract: "observability", id: "fake", contractVersion: 1, factory: (required) => {
        events.push(`factory:${String(required.endpoint)}`);
        return { port: { ...createNoopObservabilityPort({}) }, dispose: () => { events.push("dispose"); } };
      } });
    } }) }) };
  const runtime = composePluginRuntime({ workspaceId: "ws", clock, activationRepo: repo, sources: [source] });
  const ready = repo.save({ workspaceId: "ws", pluginId: "obs-fake", version: PROVIDER_MANIFEST.version, enabled, updatedAt: "2026-10-25" });
  return { events, repo, runtime, ready };
}

const boot = (runtime: ReturnType<typeof composePluginRuntime>, configured = true) => bootProviderPlugins({
  runtime, config: { scope: "site", readSettings: async () => null, write: async () => {},
    read: async () => configured ? { settings: { endpoint: "https://collector.example.test" }, secrets: {} } : null },
  serviceName: "tovu", site: { siteId: "ws", siteSlug: "s", environment: "local", projectId: "ws" }, consent: () => false, consentRevision: () => 0,
}, { warn: () => {} });

test("installed + enabled + configured: loaded once at boot, initialized, then retired by disable", async () => {
  const { events, runtime, ready } = fixture();
  await ready;
  const ports = await boot(runtime);
  assert.equal(isNoopObservabilityPort(ports.observability), false);
  assert.deepEqual(events, ["setup", "factory:https://collector.example.test"]);
  // Neither boot re-attach nor an enable reloads a provider plugin (its port is wired into kernels).
  await runtime.attachEnabledPluginsAtBoot();
  await runtime.onPluginEnabled("obs-fake");
  assert.deepEqual(events, ["setup", "factory:https://collector.example.test"]);
  assert.equal(runtime.pluginLoadedVersion({ id: "obs-fake" }), PROVIDER_MANIFEST.version);
  runtime.onPluginDisabled("obs-fake");
  for (let i = 0; i < 20 && !events.includes("dispose"); i += 1) await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(events, ["setup", "factory:https://collector.example.test", "dispose"]);
  await ports.dispose({});
  assert.equal(events.filter((event) => event === "dispose").length, 1);
});

test("not configured: the plugin's code is never imported and the port is the noop", async () => {
  const { events, runtime, ready } = fixture();
  await ready;
  const ports = await boot(runtime, false);
  assert.equal(isNoopObservabilityPort(ports.observability), true);
  assert.deepEqual(events, []);
});

test("configured but disabled: never imported; the noop stays", async () => {
  const { events, runtime, ready } = fixture({ enabled: false });
  await ready;
  const ports = await boot(runtime);
  assert.equal(isNoopObservabilityPort(ports.observability), true);
  assert.deepEqual(events, []);
});

test("a provider plugin whose setup fails is logged and left on the noop; boot continues", async (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  const { events, runtime, ready } = fixture({ setupThrows: true });
  await ready;
  assert.deepEqual(await runtime.loadProviderPlugins({ pluginIds: ["obs-fake"] }), []);
  assert.deepEqual(events, ["setup"]);
  assert.match(String(warn.mock.calls[0]?.arguments[0]), /^\[plugin-runtime\] provider plugin 'obs-fake' failed to load; its contract stays on the noop: /);
  assert.deepEqual(runtime.providerContributions.list({}), []);
});

test("loadProviderPlugins ignores ids it was not asked for and plugins that declare no providers", async () => {
  const { events, runtime, ready } = fixture();
  await ready;
  assert.deepEqual(await runtime.loadProviderPlugins({ pluginIds: [] }), []);
  assert.deepEqual(await runtime.loadProviderPlugins({ pluginIds: ["other"] }), []);
  assert.deepEqual(events, []);
});

test("a provider plugin whose import/setup stalls is bounded: boot continues, and its late setup can never publish a provider", async (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  let release!: () => void;
  const { events, runtime, ready } = fixture({ setupGate: new Promise<void>((resolve) => { release = resolve; }) });
  await ready;
  assert.deepEqual(await runtime.loadProviderPlugins({ pluginIds: ["obs-fake"] }, { timeoutMs: 20 }), []);
  assert.match(String(warn.mock.calls[0]?.arguments[0]), /^\[plugin-runtime\] provider plugin 'obs-fake' failed to load; its contract stays on the noop: .*timed out/);
  release();
  for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(events, ["setup"]);
  assert.deepEqual(runtime.providerContributions.list({}), [], "the revoked selection admits nothing after the deadline");
  assert.equal(runtime.pluginLoadedVersion({ id: "obs-fake" }), undefined);
});

test("listProviderPlugins: only enabled plugins here that declare providers, with their declarations (no code runs)", async () => {
  const { events, runtime, ready, repo } = fixture();
  await ready;
  assert.deepEqual(await runtime.listProviderPlugins({}), [{ pluginId: "obs-fake", providers: PROVIDER_MANIFEST.contributes.providers }]);
  await repo.save({ workspaceId: "ws", pluginId: "obs-fake", version: PROVIDER_MANIFEST.version, enabled: false, updatedAt: "2026-10-26" });
  assert.deepEqual(await runtime.listProviderPlugins({}), []);
  assert.deepEqual(events, []);
});
