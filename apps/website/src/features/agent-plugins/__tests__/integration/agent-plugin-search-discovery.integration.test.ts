import assert from "node:assert/strict";
import test from "node:test";

import { createByokToolSurface } from "#src/assistant/index";
import { installFirstPartyToolContributors } from "#src/server/runtime/composition/tool-catalog-manifest";

import { MIN_EXPECTED_TOOL_COUNT, fakeEvalRouteDeps } from "../../../../../../../development/evals/tool-search-eval-registry.js";

/**
 * @file Proves `search_agent_plugin_local` is REACHABLE, not merely registered — the same standard
 * `features/pages/__tests__/write-region-discovery.integration.test.ts` sets for `pages_write_region`
 * and `features/agent-plugins/__tests__/integration/agent-plugin-tool-search-ranking.integration.test.ts`
 * sets for the per-plugin `agent_plugin_<id>` tools.
 *
 * `byok-tool-surface.ts` publishes three meta-tools to the model — `search_tools`, `describe_tool`,
 * `execute_delegated_tool` — and nothing else. A tool the model cannot FIND through `search_tools` is
 * functionally a tool that does not exist. This composes the real `createByokToolSurface(...)` over
 * the full installed catalog (`installFirstPartyToolContributors()`, the same composition root call
 * `server/modules/assistant-byok.ts` makes at boot) and calls `executeMetaTool` exactly as a BYOK turn
 * does — never a hand-seeded fixture catalog, which would prove nothing about beating real neighbours
 * (`plugins_list`/`plugins_set_enabled`, the OTHER "plugin" tool family, and the dynamic
 * `agent_plugin_<id>` tools this same domain already ships).
 *
 * `fakeEvalRouteDeps()` is the shared, database-free `RouteDeps` every tool-search suite in this repo
 * reuses (`development/evals/tool-search-eval-registry.ts`) — it has a real `workspaceId` but no
 * installed Agent Plugins on disk, which is fine here: this file only proves the TOOL ID ranks and
 * resolves through `search_tools`/`describe_tool`, never that it returns a specific installed
 * plugin's content (that is `agent-plugin-search-tool.integration.test.ts`'s job, against a real
 * temp-installed package).
 *
 * Per the house convention (`write-region-discovery.integration.test.ts`'s own header, and the
 * ranking test's "CRUX" test): queries are not tuned to force a pass. Where an assertion is
 * load-bearing it says why; where a phrasing is genuinely ambiguous between this tool and a sibling
 * (`plugins_list` — a DIFFERENT plugin family, `.tovu-plugin` runtime plugins, not agent-plugins.org
 * packages — "what plugins are installed" is plausible for either), the actual ranked hits are
 * reported via console.log rather than asserted into a specific order that would just be curve-fit.
 */

const PRINCIPAL = { id: "admin-1", kind: "user" } as never;
const RUN = { id: "run-discovery" } as never;

interface SearchHit {
  id: string;
  score: number;
}

function surface() {
  installFirstPartyToolContributors();
  return createByokToolSurface(fakeEvalRouteDeps() as never);
}

async function rankedIds(query: string, limit = 5): Promise<SearchHit[]> {
  const result = await surface().executeMetaTool(PRINCIPAL, RUN, { name: "search_tools", input: { query, limit } });
  const payload = result as { content: string; isError?: boolean };
  assert.ok(!payload.isError, `search_tools returned an error for "${query}": ${payload.content}`);
  return (JSON.parse(payload.content) as { hits: SearchHit[] }).hits;
}

function logHits(query: string, hits: readonly SearchHit[]): void {
  console.log(`\n[agent-plugin-search-discovery] query="${query}" (top ${hits.length}):`);
  hits.forEach((hit, index) => console.log(`  ${index + 1}. ${hit.id}  (score ${hit.score.toFixed(3)})`));
}

test("the surface under test is the real, fully-installed catalog — not a skeleton that would pass every ranking assertion for free", () => {
  const size = surface().registry.list().length;
  assert.ok(
    size >= MIN_EXPECTED_TOOL_COUNT,
    `expected the full installed catalog (>= ${MIN_EXPECTED_TOOL_COUNT} tools); got ${size} — installFirstPartyToolContributors() did not take effect`,
  );
});

test("search_agent_plugin_local IS registered in the real catalog and describable via describe_tool", async () => {
  const result = await surface().executeMetaTool(PRINCIPAL, RUN, { name: "describe_tool", input: { id: "search_agent_plugin_local" } });
  const payload = result as { content: string; isError?: boolean };
  assert.ok(!payload.isError, `describe_tool errored for search_agent_plugin_local: ${payload.content}`);

  const entry = JSON.parse(payload.content) as {
    id: string;
    description: string;
    inputSchema?: { required?: string[]; properties?: Record<string, unknown> };
  };
  assert.equal(entry.id, "search_agent_plugin_local");
  assert.deepEqual(entry.inputSchema?.required, ["query"]);
  assert.ok(entry.inputSchema?.properties?.query, "the query argument must be describable, or the model cannot send one");
  assert.ok(entry.inputSchema?.properties?.limit, "the limit argument must be describable");
});

/**
 * Phrasings that clearly name the Agent Plugins concept this tool owns (installed packages,
 * capability discovery, or a specific domain a plugin might cover) — these are the load-bearing
 * assertions: the tool must be FOUND (top 5) for at least a realistic spread of them.
 */
const DISCOVERY_PHRASINGS = [
  "is there a plugin for deploying to fly.io",
  "find a plugin that can do accessibility review",
  "search installed agent plugins for gdpr compliance",
  "do I have an installed plugin that covers cookie consent",
  "what agent plugins are available in this workspace",
];

for (const phrasing of DISCOVERY_PHRASINGS) {
  test(`search_tools surfaces search_agent_plugin_local in the top 5 for '${phrasing}'`, async () => {
    const hits = await rankedIds(phrasing);
    logHits(phrasing, hits);
    const rank = hits.findIndex((hit) => hit.id === "search_agent_plugin_local");
    assert.ok(rank !== -1, `not found in top 5 — got ${hits.map((hit) => hit.id).join(", ") || "(nothing)"}`);
  });
}

/**
 * The one load-bearing "found at all" assertion, mirroring the per-plugin ranking test's own CRUX
 * test: at least one realistic phrasing must surface this tool in the top 10 (the same window
 * `byok-tool-surface.ts` returns to a model by default). Reported per-query above; asserted once here
 * so a single flaky phrasing cannot fail the whole file.
 */
test("CRUX: at least one realistic operator phrasing surfaces search_agent_plugin_local in the top 10 of the real catalog", async () => {
  const anyFound = (
    await Promise.all(DISCOVERY_PHRASINGS.map(async (phrasing) => (await rankedIds(phrasing, 10)).some((hit) => hit.id === "search_agent_plugin_local")))
  ).some(Boolean);
  assert.ok(anyFound, "no realistic phrasing surfaced search_agent_plugin_local in the top 10 — see the per-query logs above");
});

/**
 * A genuinely ambiguous phrasing between this tool and `plugins_list` (the SITE/RUNTIME plugin
 * family — a different system entirely; see this file's header). Not asserted into a forced order:
 * reported so a reader can see what actually happens, matching the house "do not tune queries to
 * force a pass" convention.
 */
test("ambiguous 'what plugins do I have installed' — reports both plugin families' rankings rather than asserting one", async () => {
  const hits = await rankedIds("what plugins do I have installed", 10);
  logHits("what plugins do I have installed", hits);
  assert.ok(hits.length > 0, "expected at least one hit for a plausible plugin query");
});

/**
 * NEGATIVE CONTROLS — proving the new tool did not cannibalize the plugin-adjacent queries that
 * already had a correct answer. Each of these phrasings is `plugins_list`'s / `plugins_set_enabled`'s
 * own `tool-search-doc2query.ts` entry, verbatim — the exact queries those tools are already certified
 * against.
 *
 * The expected top id is the REAL baseline top hit measured against the unmodified catalog (BEFORE
 * `search_agent_plugin_local` existed at all — captured while this test was still RED for the
 * discovery tests above), not the idealized "the tool named in the doc2query file should obviously
 * win" expectation. Two of the four already did not: `content_read.plugin` (a generic single-plugin
 * reader) already outranks `plugins_list` for both of its own certified queries today — a pre-existing
 * ranking-quality gap this change did not create and is out of scope to fix here. Pinning the
 * assertion to the true baseline is what makes this a genuine negative control (same top id with this
 * tool registered as without it) rather than a test that would have failed on `main` too.
 */
const PLUGIN_RUNTIME_PHRASINGS: readonly { readonly query: string; readonly expectedTopId: string }[] = [
  { query: "What plugins are installed on the site?", expectedTopId: "content_read.plugin" },
  { query: "Can you show me which plugins are enabled versus disabled?", expectedTopId: "content_read.plugin" },
  { query: "Can you turn on this plugin?", expectedTopId: "plugins_set_enabled" },
  { query: "How do I disable a plugin we don't want running?", expectedTopId: "plugins_set_enabled" },
];

for (const { query, expectedTopId } of PLUGIN_RUNTIME_PHRASINGS) {
  test(`negative control: '${query}' still ranks ${expectedTopId} first — search_agent_plugin_local did not cannibalize it`, async () => {
    const hits = await rankedIds(query);
    logHits(query, hits);
    assert.equal(hits[0]?.id, expectedTopId, `got ${hits.map((hit) => hit.id).join(", ") || "(nothing)"}`);
  });
}
