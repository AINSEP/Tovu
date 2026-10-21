import assert from "node:assert/strict";
import test from "node:test";

import type { PluginContributionDefinition } from "../lifecycle.js";
import {
  ANALYTICS_FORWARDERS_FILENAME, ANALYTICS_HOOKS_FILENAME, loadAnalyticsProviders, parseAnalyticsProvidersFile,
  type AnalyticsProviderDescriptor,
} from "../analytics-provider-registry.js";

/**
 * A fake `loadContributions` that runs each definition's real parse + load against in-memory
 * manifests and modules — the trust gate itself is the lifecycle's (tested there), not this file's.
 */
function fakeLoader(files: Record<string, Record<string, string>>, modules: Record<string, unknown>) {
  const calls: unknown[] = [];
  const load = async <D, T>(input: { readonly workspaceId: string; readonly definition: PluginContributionDefinition<D, T> }, options: unknown = {}) => {
    calls.push({ workspaceId: input.workspaceId, filename: input.definition.filename, options });
    const items: T[] = [];
    const refusals: string[] = [];
    const manifests = Object.entries(files).flatMap(([pluginId, byName]) => {
      const raw = byName[input.definition.filename];
      return raw === undefined ? [] : [{ pluginId, parsed: input.definition.parse({ raw }) as { ok: true; descriptors: D[] } | { ok: false; reason: string } }];
    });
    for (const { pluginId, parsed } of manifests) {
      if (!parsed.ok) { refusals.push(`${pluginId}: ${parsed.reason}`); continue; }
      for (const descriptor of parsed.descriptors) {
        const result = await input.definition.load({
          plugin: { pluginId, packageRoot: `/plugins/${pluginId}` }, descriptor,
          importModule: async ({ modulePath }) => (modulePath in modules ? { exported: modules[`${modulePath}`] } : "module missing"),
        });
        if (typeof result === "string") refusals.push(result); else items.push(result);
      }
    }
    return { items, refusals };
  };
  return { load: load as never, calls };
}

const manifest = (providers: unknown[]) => JSON.stringify({ schemaVersion: 1, providers });

test("parseAnalyticsProvidersFile accepts valid manifests and names the first fault", () => {
  assert.deepEqual(parseAnalyticsProvidersFile(manifest([{ id: "plausible", module: "f.mjs", label: "Plausible", extra: 1 }, { id: "b", module: "lib/b.mjs" }])), {
    ok: true, descriptors: [{ id: "plausible", module: "f.mjs", label: "Plausible" }, { id: "b", module: "lib/b.mjs" }] satisfies AnalyticsProviderDescriptor[],
  });
  const reason = (raw: string) => { const r = parseAnalyticsProvidersFile(raw); return r.ok ? null : r.reason; };
  assert.equal(reason("{"), "not valid JSON");
  assert.equal(reason("[]"), "schemaVersion must be 1");
  assert.equal(reason(JSON.stringify({ schemaVersion: 2, providers: [] })), "schemaVersion must be 1");
  assert.equal(reason(JSON.stringify({ schemaVersion: 1 })), "providers must be an array");
  assert.equal(reason(manifest([1])), "providers[0] must be an object");
  assert.equal(reason(manifest([{ id: 1, module: "a.mjs" }])), "providers[0].id must be a string");
  assert.equal(reason(manifest([{ id: "a", module: "a.js" }])), "providers[0].module must be a relative path ending in .mjs");
  assert.equal(reason(manifest([{ id: "a", module: "/abs/a.mjs" }])), "providers[0].module must be a relative path ending in .mjs");
  assert.equal(reason(manifest([{ id: "a", module: 3 }])), "providers[0].module must be a relative path ending in .mjs");
  assert.equal(reason(manifest([{ id: "a", module: "a.mjs", label: " " }])), "providers[0].label must be a non-empty string");
  assert.equal(reason(manifest([{ id: "a", module: "a.mjs", label: 4 }])), "providers[0].label must be a non-empty string");
  assert.equal(reason(manifest([{ id: "a", module: "a.mjs", label: "x".repeat(101) }])), "providers[0].label must be a non-empty string");
  assert.equal(reason(manifest([{ id: "a", module: "a.mjs" }, { id: "a", module: "b.mjs" }])), "providers[1].id 'a' is declared twice");
});

test("loadAnalyticsProviders registers forwarders, collects hooks in order, and merges every refusal", async () => {
  const plausible = { create: () => ({ forward: async () => ({ status: "ok", value: undefined }) }) };
  const internal = { beforeIngest: async () => null };
  const { load, calls } = fakeLoader({
    "acme-analytics": {
      [ANALYTICS_FORWARDERS_FILENAME]: manifest([
        { id: "plausible", module: "plausible.mjs", label: "Plausible" },
        { id: "Bad-Id", module: "x.mjs" },
        { id: "broken", module: "broken.mjs" },
      ]),
      [ANALYTICS_HOOKS_FILENAME]: manifest([{ id: "internal_traffic", module: "hook.mjs" }, { id: "nohook", module: "nohook.mjs" }]),
    },
    "other": { [ANALYTICS_FORWARDERS_FILENAME]: manifest([{ id: "plausible", module: "plausible.mjs" }]) },
  }, { "plausible.mjs": plausible, "broken.mjs": {}, "hook.mjs": internal, "nohook.mjs": {} });

  const providers = await loadAnalyticsProviders({ workspaceId: "ws-1" }, { loadContributions: load });

  assert.equal(providers.forwarders.get({ id: "plausible" })?.provider, plausible);
  assert.equal(providers.forwarders.get({ id: "plausible" })?.pluginId, "acme-analytics");
  assert.equal(providers.forwarders.get({ id: "plausible" })?.label, "Plausible");
  assert.deepEqual(providers.hooks, [internal]);
  assert.equal(providers.refusals.length, 4);
  assert.match(providers.refusals[0]!, /'Bad-Id' from 'acme-analytics' was not loaded: its id must match/);
  assert.match(providers.refusals[1]!, /'broken' from 'acme-analytics' was not loaded: its module has no create\(\) function/);
  assert.match(providers.refusals[2]!, /'plausible' from plugin 'other' was not loaded: already registered by plugin 'acme-analytics'/);
  assert.match(providers.refusals[3]!, /'nohook' from 'acme-analytics' was not loaded: its module has no beforeIngest\(\) function/);
  assert.deepEqual(calls, [
    { workspaceId: "ws-1", filename: ANALYTICS_FORWARDERS_FILENAME, options: { orderByPluginId: true } },
    { workspaceId: "ws-1", filename: ANALYTICS_HOOKS_FILENAME, options: { orderByPluginId: true } },
  ]);
});

test("loadAnalyticsProviders with no contributing plugins is empty", async () => {
  const { load } = fakeLoader({}, {});
  const providers = await loadAnalyticsProviders({ workspaceId: "ws-1" }, { loadContributions: load });
  assert.deepEqual(providers.forwarders.list(), []);
  assert.deepEqual(providers.hooks, []);
  assert.deepEqual(providers.refusals, []);
});
