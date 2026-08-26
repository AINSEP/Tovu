import assert from "node:assert/strict";
import test from "node:test";

import { buildToolCatalogQuery } from "#src/assistant/tool-catalog-query";
import { postAgentToolCatalog } from "#src/features/post/agent-tools";
import { pluginAgentToolCatalog } from "../../agent-tools.js";
import { InMemoryPluginActivationRepo } from "../../repo.memory.js";
import type { PluginActivationRecord } from "../../activation.js";
import type { PluginDiscoveryRecord } from "../../discovery.js";
import { WORD_COUNT_MANIFEST } from "../../built-ins/word-count/index.js";
import { buildPluginCapabilityToolRegistrations, loadEnabledPluginCapabilityToolSources } from "../../capability-tool-registrations.js";
import { InMemoryPostRepo } from "#src/features/post/repo.memory";

/**
 * @file Acceptance evidence for the 2026-08-26 registration-gap fix: replays the OWNER'S OWN two
 * queries from the live repro ("is there a way to count words in posts?" -> `search_tools` twice,
 * both returned nothing — see `ADS-memory/reports/2026-08-26-plugin-discoverability-audit.md`)
 * against a rebuilt catalog and asserts `plugin_capability_word_count` now surfaces.
 *
 * The catalog fixture mixes REAL production descriptor text — the entire real `postAgentToolCatalog`/
 * `pluginAgentToolCatalog` (imported, not copied) plus the real registration this fix adds (built
 * through the actual `loadEnabledPluginCapabilityToolSources`/`buildPluginCapabilityToolRegistrations`
 * pipeline, not a hand-written fixture) — with a handful of the OTHER domains' descriptions the
 * 2026-08-26 audit's live replay recorded ranking in the original (broken) top-10, copied verbatim
 * from their own `agent-tools.ts` files (cited per entry) so this replay's competing vocabulary is
 * real, not invented. Two of the audit's original 20 distinct competitors
 * (`collections_content_type_deprecate`, `assistant_demo_a2ui`) are omitted from this fixture —
 * their own descriptions were not pulled verbatim for this pass — so this is a representative, not
 * byte-for-byte, reconstruction of the full ~187-tool live catalog; what matters for this assertion
 * is unchanged either way: was there previously NO on-topic candidate, and is there now one.
 */

const WORKSPACE = "ws-1";

// Verbatim, copied 2026-08-26 for this replay fixture from the cited file/line — NOT live imports,
// so a future edit to the source file will not silently update this fixture (acceptable: this test
// asserts our new tool's rank against the audit's OWN recorded competitors, not against whatever
// those domains say today).
const AUDIT_COMPETITOR_DESCRIPTORS = [
  {
    // redirects/agent-tools.ts:184-185
    id: "redirects_get_hits",
    description:
      "Fetches aggregate hit stats (total hit count, last-hit time) for a redirect rule by id. Read-only. Returns hitCount:0 if the rule has never been hit.",
  },
  {
    // features/deployments/agent-tools.ts:133-135
    id: "deployment_get_dockerfile",
    description:
      "Returns the repo-root Dockerfile's current contents (exists:true/contents:'...'), or exists:false if none has been created yet, plus an 'etag' identifying exactly this version of the contents. This is the build file a human runs `docker build`/`docker push` against in a terminal — reading it does not build, validate, or deploy anything. ALWAYS call this immediately before deployment_set_dockerfile to get a fresh etag: a human can edit and save this same file in the admin UI's Dockerfile tab at any time, so an etag from long ago may already be stale.",
  },
  {
    // features/deployments/agent-tools.ts:125-127
    id: "deployment_list",
    description:
      "Lists this workspace's configured deployment environments (e.g. staging/production), deployment targets (connected external providers such as a GitHub Pages repo), releases, and past deployment runs — a read-only snapshot exactly as stored. This is unrelated to the static export tools above: it reports what has been configured/recorded for provider-driven deployments, and does not trigger, poll, or affect any export.",
  },
  {
    // widgets/agent-tools.ts:275-280
    id: "widgets_insert_embed",
    description:
      "Inserts one new inline widgetEmbed node, referencing an existing widget instance, appended to the end of a host entry's rich-text body. Rejects if the target widget does not exist / is trashed, if the host is itself a widget instance (no widget-in-widget recursion), or if the resulting embed count would exceed the per-document cap. Returns the newly-minted placementId.",
  },
  {
    // seo/agent-tools.ts:229-230
    id: "seo_get_settings",
    description:
      "Reads the workspace's site-wide SEO settings (title template, default description/OG image/Twitter site, default robots directive, sitemap toggle, custom robots.txt rules). Read-only.",
  },
  {
    // features/theme/agent-tools.ts:184-186
    id: "theme_list_files",
    description:
      "Lists every file inside one theme's folder, as paths relative to that folder (e.g. 'theme.json', 'templates/home.liquid'). Read-only. Use this to discover what a theme actually ships before reading or editing it, rather than guessing filenames.",
  },
];

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

/** Builds the same shape `agent-daemon-server.ts`'s live `registry.list()` feeds
 *  `buildToolCatalogQuery` — real Posts + Plugins catalogs, the audit's recorded competitors, and
 *  (when `withFix`) this task's new plugin-capability registration built through the real pipeline. */
async function buildCatalogDescriptors(withFix: boolean) {
  // `postAgentToolCatalog`/`pluginAgentToolCatalog` are `AgentToolDefinition[]` (keyed by `name`,
  // this codebase's own domain-catalog shape) — `buildToolCatalogQuery` (and the real
  // `ToolRegistry`/`sourceForToolId` it feeds) expects `ToolDescriptor`s keyed by `id`. Projected
  // here rather than changed at the source: this file is a read-only consumer of both real catalogs.
  const base = [
    ...postAgentToolCatalog.map((entry) => ({ id: entry.name, description: entry.description })),
    ...pluginAgentToolCatalog.map((entry) => ({ id: entry.name, description: entry.description })),
    ...AUDIT_COMPETITOR_DESCRIPTORS,
  ];
  if (!withFix) return base;

  const sources = await loadEnabledPluginCapabilityToolSources({
    workspaceId: WORKSPACE,
    discoverPlugins: async () => [discoveryRecord()],
    pluginActivationRepo: new InMemoryPluginActivationRepo([enabledActivation()]),
  });
  const registrations = buildPluginCapabilityToolRegistrations(sources, {
    authorize: async () => ({ allowed: true }) as never,
    workspaceId: WORKSPACE,
    postRepo: new InMemoryPostRepo(),
  });

  return [...base, ...registrations.map((r) => ({ id: r.descriptor.id, description: r.descriptor.description ?? "" }))];
}

const QUERY_1 = "compute word count or reading time statistics for post content";
const QUERY_2 = "report content metrics and statistics such as length, word totals, or reading time across the site";

test("BEFORE the fix: neither owner query surfaces any word/count/reading-time candidate (reproduces the live miss)", async () => {
  const descriptors = await buildCatalogDescriptors(false);
  const query = buildToolCatalogQuery({ list: () => descriptors });

  for (const q of [QUERY_1, QUERY_2]) {
    const hits = query.search(q, 10);
    assert.ok(
      !hits.some((hit) => hit.id === "plugin_capability_word_count"),
      "the fix's tool id must not exist in the catalog before the fix is applied",
    );
  }
});

test("AFTER the fix: plugin_capability_word_count surfaces in the top-10 for both of the owner's verbatim queries", async () => {
  const descriptors = await buildCatalogDescriptors(true);
  const query = buildToolCatalogQuery({ list: () => descriptors });

  for (const q of [QUERY_1, QUERY_2]) {
    const hits = query.search(q, 10);
    assert.ok(
      hits.some((hit) => hit.id === "plugin_capability_word_count"),
      `expected plugin_capability_word_count in the top-10 for "${q}", got: ${hits.map((h) => `${h.id}(${h.score.toFixed(2)})`).join(", ")}`,
    );
  }
});

test("AFTER the fix: a DISABLED word-count plugin still produces zero on-topic candidates (no silently-indexed dormant capability)", async () => {
  const sources = await loadEnabledPluginCapabilityToolSources({
    workspaceId: WORKSPACE,
    discoverPlugins: async () => [discoveryRecord()],
    pluginActivationRepo: new InMemoryPluginActivationRepo([{ ...enabledActivation(), enabled: false }]),
  });
  assert.deepEqual(sources, [], "a disabled plugin must yield no capability-tool source at all");

  const descriptors = await buildCatalogDescriptors(false);
  const query = buildToolCatalogQuery({ list: () => descriptors });
  for (const q of [QUERY_1, QUERY_2]) {
    const hits = query.search(q, 10);
    assert.ok(!hits.some((hit) => hit.id === "plugin_capability_word_count"));
  }
});
