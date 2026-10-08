import assert from "node:assert/strict";
import test from "node:test";

import { buildToolCatalogQuery } from "#src/assistant/tool-catalog-query";
import { buildEvalToolRegistry, fakeEvalRouteDeps, MIN_EXPECTED_TOOL_COUNT } from "../../../../../../../development/evals/tool-search-eval-registry.js";
import { InMemoryPluginActivationRepo } from "@jini-ai/plugins/host";
import type { PluginActivationRecord } from "@jini-ai/plugins/host";
import type { PluginDiscoveryRecord } from "@jini-ai/plugins/host/node";
import { WORD_COUNT_MANIFEST } from "../../built-ins/word-count/index.js";
import { buildPluginCapabilityToolRegistrations, loadEnabledPluginCapabilityToolSources, type PluginCapabilityToolSource } from "../../capability-tool-registrations.js";
import { InMemoryPostRepo } from "#src/features/post/repo.memory";

/**
 * F2.4/F4.2: use the full installed first-party catalog and the real capability registration
 * pipeline. Ranking against a copied subset cannot establish discoverability among shipped tools.
 */
const WORKSPACE = "ws-1";

function discoveryRecord(status: PluginDiscoveryRecord["status"] = "valid"): PluginDiscoveryRecord {
  return {
    id: WORD_COUNT_MANIFEST.id,
    name: WORD_COUNT_MANIFEST.name,
    version: WORD_COUNT_MANIFEST.version,
    source: "built-in",
    tier: WORD_COUNT_MANIFEST.tier,
    status,
    errors: [],
    manifest: status === "valid" ? WORD_COUNT_MANIFEST : undefined,
  };
}

function enabledActivation(): PluginActivationRecord {
  return { pluginId: "word-count", workspaceId: WORKSPACE, version: "1.0.0", enabled: true, updatedAt: "2026-08-26T00:00:00.000Z" };
}

async function buildCatalogDescriptors(withRegistration: boolean, suppliedSources?: readonly PluginCapabilityToolSource[]) {
  const registry = buildEvalToolRegistry(fakeEvalRouteDeps());
  assert.ok(registry.list({}).length >= MIN_EXPECTED_TOOL_COUNT);
  if (withRegistration) {
    const sources = suppliedSources ?? await loadEnabledPluginCapabilityToolSources({
      workspaceId: WORKSPACE,
      discoverPlugins: async () => [discoveryRecord()],
      pluginActivationRepo: new InMemoryPluginActivationRepo({ initialRows: [enabledActivation()] }),
    });
    const registrations = buildPluginCapabilityToolRegistrations(sources, {
      authorize: async () => ({ allowed: true }) as never,
      workspaceId: WORKSPACE,
      postRepo: new InMemoryPostRepo(),
      pluginActivationRepo: new InMemoryPluginActivationRepo({ initialRows: [enabledActivation()] }),
    });
    for (const registration of registrations) registry.register(registration);
  }
  return registry.list({});
}

const QUERY_1 = "compute word count or reading time statistics for post content";
const QUERY_2 = "report content metrics and statistics such as length, word totals, or reading time across the site";

test("before capability registration, the full installed catalog and searches omit the word-count tool", async () => {
  const descriptors = await buildCatalogDescriptors(false);
  assert.ok(!descriptors.some((descriptor) => descriptor.id === "plugin_capability_word_count"));
  const query = buildToolCatalogQuery({ list: () => descriptors });

  for (const q of [QUERY_1, QUERY_2]) {
    const hits = query.search({ query: q }, { limit: 10 });
    assert.ok(
      !hits.some((hit) => hit.id === "plugin_capability_word_count"),
      "the capability tool must not surface before capability registration",
    );
  }
});

test("the registered word-count tool ranks in the top three of the full installed catalog for both owner queries", async () => {
  const descriptors = await buildCatalogDescriptors(true);
  const query = buildToolCatalogQuery({ list: () => descriptors });

  for (const q of [QUERY_1, QUERY_2]) {
    const hits = query.search({ query: q }, { limit: 10 });
    const rank = hits.findIndex((hit) => hit.id === "plugin_capability_word_count");
    assert.ok(rank >= 0 && rank < 3, `expected top-three word-count rank for "${q}", got ${hits.map((hit) => hit.id).join(", ")}`);
    assert.ok(
      hits.some((hit) => hit.id === "plugin_capability_word_count"),
      `expected plugin_capability_word_count in the top-10 for "${q}", got: ${hits.map((h) => `${h.id}(${h.score.toFixed(2)})`).join(", ")}`,
    );
  }
});

test("a disabled word-count plugin contributes no capability registration or search hit", async () => {
  const sources = await loadEnabledPluginCapabilityToolSources({
    workspaceId: WORKSPACE,
    discoverPlugins: async () => [discoveryRecord()],
    pluginActivationRepo: new InMemoryPluginActivationRepo({ initialRows: [{ ...enabledActivation(), enabled: false }] }),
  });
  assert.deepEqual(sources, [], "a disabled plugin must yield no capability-tool source at all");

  const descriptors = await buildCatalogDescriptors(true, sources);
  const query = buildToolCatalogQuery({ list: () => descriptors });
  for (const q of [QUERY_1, QUERY_2]) {
    const hits = query.search({ query: q }, { limit: 10 });
    assert.ok(!hits.some((hit) => hit.id === "plugin_capability_word_count"));
  }
});
