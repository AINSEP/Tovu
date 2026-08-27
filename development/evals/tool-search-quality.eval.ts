/**
 * @file Search-quality eval for the BYOK meta-tool surface — the cheap, deterministic half.
 *
 * Run: `npx tsx development/evals/tool-search-quality.eval.ts`
 *
 * Why this exists. Once a BYOK turn publishes only `search_tools`/`describe_tool`/
 * `execute_delegated_tool` instead of all 131 real descriptors, the model can no longer see the
 * catalog — it can only find things. That makes BM25 ranking a load-bearing product surface rather
 * than a convenience: a tool that never surfaces in the top hits is, from the model's point of
 * view, a tool that does not exist. Nothing measured that before this file.
 *
 * Three failure classes hide behind "the assistant couldn't do it", and they need different fixes:
 *   1. NO TOOL       — nothing in the catalog can do it. A real gap; write a tool.
 *   2. SEARCH MISS   — the tool exists but does not rank for how a human phrases the request.
 *                      Fix the tool's DESCRIPTION (what BM25 indexes), not the catalog.
 *   3. BAD ARGUMENTS — found and called with input its schema rejects. Fix the schema/description.
 * This file measures class 2 exactly, and it does so with NO model and NO network: it asks the same
 * `buildToolCatalogQuery` index the live meta-tool dispatch uses, so the ranking it reports is the
 * ranking a real turn gets. Free, deterministic, repeatable — safe to run in CI on every change to
 * a tool description.
 *
 * Class 1 and class 3 need a real model in the loop; that is the live companion eval and it costs
 * money per run. Start here — a search miss is both the cheapest to measure and the cheapest to fix.
 *
 * The phrasings below are deliberately how an OPERATOR would ask, not how the tool is named. A
 * query that echoes the tool's own id proves nothing: BM25 will always rank an exact-token match
 * first. "stop that email going out" is the real test; "newsletter_cancel_campaign" is not.
 */
import { createToolRegistry } from "@jini-ai/core";
import { buildToolCatalogQuery } from "../../src/assistant/tool-catalog-query.js";
import { buildAssistantToolRegistrations } from "../../src/assistant/tool-registrations.js";
import { installFirstPartyToolContributors } from "../../src/server/tool-catalog-manifest.js";
import type { RouteDeps } from "../../src/server/routes/types.js";

interface EvalCase {
  /** How a human actually asks. */
  readonly query: string;
  /** The tool that SHOULD win. */
  readonly expect: string;
  /** Optional: other ids that would also be a correct answer for this phrasing. */
  readonly alsoAcceptable?: readonly string[];
}

/**
 * The task set. Spread across domains on purpose, weighted toward the phrasings a real operator
 * reaches for. Each one is a claim that can be wrong — if a case here is genuinely ambiguous, fix
 * the case; if the catalog genuinely cannot serve it, that is a class-1 finding worth recording.
 */
const CASES: readonly EvalCase[] = [
  { query: "stop that email campaign from going out", expect: "newsletter_cancel_campaign", alsoAcceptable: ["newsletter_pause_campaign"] },
  { query: "who has signed up to the mailing list", expect: "newsletter_list_subscriptions" },
  { query: "hide a comment someone reported", expect: "comments_trash_comment", alsoAcceptable: ["comments_mark_comment_spam"] },
  { query: "show me comments waiting for approval", expect: "comments_list_moderation_queue" },
  { query: "make this old url point somewhere new", expect: "redirects_create" },
  { query: "how many people hit that broken link", expect: "redirects_get_hits" },
  { query: "publish the draft article", expect: "collections_entry_publish", alsoAcceptable: ["content_post_update"] },
  { query: "find a blog post by its title", expect: "content_post_search", alsoAcceptable: ["content_post_list", "content_post_get"] },
  { query: "give someone admin access", expect: "identity_role_assign", alsoAcceptable: ["identity_policy_attach"] },
  { query: "lock someone out of the site", expect: "identity_user_disable", alsoAcceptable: ["members_disable"] },
  { query: "change the site name", expect: "workspace_update" },
  { query: "what images have been uploaded", expect: "media_list_assets" },
  { query: "add a link to the top navigation", expect: "menus_update_menu_tree", alsoAcceptable: ["menus_create_menu", "menus_assign_location"] },
  { query: "rebuild the sitemap for google", expect: "seo_regenerate_sitemap" },
  { query: "why is this page not showing up in search results", expect: "seo_analyze_entry", alsoAcceptable: ["seo_get_entry_meta"] },
  { query: "check the database is healthy", expect: "database_get_health" },
  { query: "take a snapshot before I break something", expect: "backup_create_restore_point" },
  { query: "turn off that plugin", expect: "plugins_set_enabled" },
  { query: "put a widget in the sidebar", expect: "widgets_bind_region", alsoAcceptable: ["widgets_create_instance", "widgets_set_region_placements"] },
  { query: "see what people submitted through the contact form", expect: "forms_list_submissions" },
  { query: "tag this article", expect: "taxonomy_assign_terms" },
  { query: "edit the theme's stylesheet", expect: "theme_write_file", alsoAcceptable: ["theme_read_file", "theme_list_files"] },
  { query: "send a login link to a member", expect: "members_request_magic_link" },
  { query: "what webhooks are set up", expect: "webhooks_list_subscriptions" },
  { query: "did that webhook actually fire", expect: "webhooks_get_deliveries" },
  // Real recorded operator phrasing, from `caseb`'s 2026-08-22 measurement
  // (`ADS-memory/reports/2026-08-22-case-b-discovery-measurement.md`): the then-live `capability_search`
  // never ranked at all, across 9 catalog searches in the real run. REMOVED 2026-08-26 (owner call
  // — see `ADS-memory/knowledge/2026-08-26-removed-capability-search.md`): `capability_search` is
  // gone, and its replacement, the installed plugin's own `agent_plugin_ui_ux_design` tool, is
  // registered through a SEPARATE async, disk-backed call (`registerInstalledAgentPluginTools`,
  // called directly by `agent-daemon-server.ts`) that never runs through this eval's synchronous,
  // no-filesystem `buildAssistantToolRegistrations` + `installFirstPartyToolContributors` setup —
  // pinning this case to that tool id would only ever measure "not found," never a real ranking
  // signal. This class of case (does an installed Agent Plugin's tool surface for a design-guidance
  // query) is covered instead by `development/e2e/admin-capability-discovery.spec.ts`, which runs
  // against a real daemon with the plugin actually seeded and active.
];

/**
 * HELD-OUT set. These exist to keep the eval honest.
 *
 * `src/assistant/tool-search-keywords.ts` adds operator vocabulary to what gets indexed. The obvious
 * failure mode is writing those keywords by reading the case list above and reverse-engineering
 * terms that score well — which produces a number that measures nothing. (An earlier throwaway
 * experiment did exactly that and hit 96% top-1; it was self-graded and discarded.)
 *
 * So: the phrasings below were written to be scored, never consulted while choosing keywords, and
 * they lean deliberately on words the keyword author had no reason to anticipate — indirect asks
 * ("the newsletter is about to go out and it's wrong"), symptom-first asks ("people say the contact
 * page does nothing"), and everyday synonyms not already used above. **The held-out number is the
 * one to trust.** If it diverges sharply from the primary set, the keywords have been overfitted and
 * the fix is to generalize them, not to add more.
 */
const HELD_OUT_CASES: readonly EvalCase[] = [
  { query: "someone is spamming us in the replies under a post", expect: "comments_mark_comment_spam", alsoAcceptable: ["comments_trash_comment", "comments_list_moderation_queue"] },
  { query: "the newsletter is about to go out and it's wrong", expect: "newsletter_cancel_campaign", alsoAcceptable: ["newsletter_pause_campaign"] },
  { query: "people say the contact page does nothing", expect: "forms_list_submissions", alsoAcceptable: ["forms_list_definitions"] },
  { query: "I need to roll back, everything broke", expect: "backup_plan_restore", alsoAcceptable: ["backup_list_restore_points", "backup_create_restore_point"] },
  { query: "our logo file needs swapping out", expect: "media_list_assets", alsoAcceptable: ["media_upload_asset", "media_update_metadata"] },
  { query: "a contractor finished, take away their account", expect: "identity_user_disable", alsoAcceptable: ["members_disable"] },
  { query: "new hire needs to be able to edit posts", expect: "identity_role_assign", alsoAcceptable: ["identity_policy_attach", "identity_user_create"] },
  { query: "we moved the pricing page and old bookmarks 404", expect: "redirects_create" },
  { query: "is the external system actually receiving our events", expect: "webhooks_get_deliveries", alsoAcceptable: ["webhooks_list_subscriptions"] },
  { query: "this draft is ready to go live", expect: "collections_entry_publish", alsoAcceptable: ["content_post_update"] },
  { query: "google still shows the old title for this page", expect: "seo_get_entry_meta", alsoAcceptable: ["seo_set_entry_overrides", "seo_regenerate_sitemap", "seo_analyze_entry"] },
  { query: "group these articles under a topic", expect: "taxonomy_assign_terms", alsoAcceptable: ["taxonomy_create_term", "taxonomy_create_taxonomy"] },
  { query: "the footer needs a recent posts block", expect: "widgets_bind_region", alsoAcceptable: ["widgets_create_instance", "widgets_list_regions"] },
  { query: "change the colours on the site", expect: "theme_write_file", alsoAcceptable: ["theme_list_files", "theme_read_file", "theme_list"] },
  { query: "is anything wrong with the data store", expect: "database_get_health" },
  { query: "customer can't get in, send them a way to log in", expect: "members_request_magic_link" },
  { query: "we rebranded, the title at the top is stale", expect: "workspace_update" },
  { query: "that extension is causing trouble, switch it off", expect: "plugins_set_enabled" },
  { query: "how do I put an entry in the header bar", expect: "menus_update_menu_tree", alsoAcceptable: ["menus_create_menu", "menus_assign_location", "menus_list_menus"] },
  { query: "show everyone on our email list", expect: "newsletter_list_subscriptions", alsoAcceptable: ["members_list"] },
  // Was pinned to the now-removed `capability_search`, testing whether the category words
  // (guide/playbook/reference/instructions) generalize to a differently-worded ask for the same kind
  // of thing. REMOVED 2026-08-26 for the same reason as the primary set's identical case above: its
  // replacement, `agent_plugin_ui_ux_design`, is registered through a path this deterministic,
  // no-filesystem eval never exercises — see that case's own comment and
  // `ADS-memory/knowledge/2026-08-26-removed-capability-search.md`.
];

const SEARCH_LIMIT = 10;

function fakeRouteDeps(): RouteDeps {
  const deps = {
    workspaceId: "ws-eval",
    clock: { nowIso: () => "2026-08-05T00:00:00.000Z" },
    idGen: { newId: () => "id-1" },
    authorize: async () => ({ allowed: true, reason: "matched" }),
    contentTypeRepo: {
      save: async () => {},
      appendRevision: async () => {},
      findByKey: async () => null,
      listByWorkspace: async () => [],
      transaction: async <T>(fn: () => Promise<T>) => fn(),
    },
    contentTypeIndexProvisioner: {
      provisionIndexesForNewContentType: async () => {},
      applyFieldIndexTransitions: async () => {},
      tearDownAllIndexesForContentType: async () => {},
    },
    outbox: { enqueue: async () => {} },
  };
  return deps as unknown as RouteDeps;
}

interface CaseResult {
  readonly query: string;
  readonly expect: string;
  /** 1-based rank of the first acceptable id, or null when none appeared in the top `SEARCH_LIMIT`. */
  readonly rank: number | null;
  readonly topHit: string;
}

function score(catalog: ReturnType<typeof buildToolCatalogQuery>, cases: readonly EvalCase[]): CaseResult[] {
  return cases.map((testCase) => {
    const acceptable = new Set<string>([testCase.expect, ...(testCase.alsoAcceptable ?? [])]);
    const hits = catalog.search(testCase.query, SEARCH_LIMIT);
    const index = hits.findIndex((hit) => acceptable.has(hit.id));
    return { query: testCase.query, expect: testCase.expect, rank: index === -1 ? null : index + 1, topHit: hits[0]?.id ?? "(no hits)" };
  });
}

function summarize(label: string, results: readonly CaseResult[]): void {
  const total = results.length;
  const top1 = results.filter((r) => r.rank === 1).length;
  const top3 = results.filter((r) => r.rank !== null && r.rank <= 3).length;
  const found = results.filter((r) => r.rank !== null).length;
  const pct = (n: number) => `${((n / total) * 100).toFixed(0)}%`.padStart(4);
  console.log(`  ${label.padEnd(12)} top-1 ${String(top1).padStart(2)}/${total} ${pct(top1)}   top-3 ${String(top3).padStart(2)}/${total} ${pct(top3)}   found ${String(found).padStart(2)}/${total} ${pct(found)}`);
}

function run(): void {
  // Registers all 25 first-party domains (comments, media, identity, ...) into
  // `tool-contribution-registry.ts`, the same call BOTH real boot paths (`agent-daemon-server.ts`,
  // `assistant-byok.ts`) make before their own `buildAssistantToolRegistrations` call — see
  // `tool-contribution-registry.ts`'s header: that function reads whatever is currently registered,
  // so skipping this leaves `DOMAIN_SLICES` (now empty of first-party domains; see
  // `tool-registrations.ts`'s own header) as the only source, and the catalog comes back empty.
  installFirstPartyToolContributors();
  const registry = createToolRegistry();
  for (const registration of buildAssistantToolRegistrations(fakeRouteDeps())) registry.register(registration);
  const catalog = buildToolCatalogQuery(registry);
  const baseline = buildToolCatalogQuery(registry, { includeSearchKeywords: false });
  const catalogSize = registry.list().length;

  const heldOut = score(catalog, HELD_OUT_CASES);

  const results: CaseResult[] = CASES.map((testCase) => {
    const acceptable = new Set<string>([testCase.expect, ...(testCase.alsoAcceptable ?? [])]);
    const hits = catalog.search(testCase.query, SEARCH_LIMIT);
    const index = hits.findIndex((hit) => acceptable.has(hit.id));
    return {
      query: testCase.query,
      expect: testCase.expect,
      rank: index === -1 ? null : index + 1,
      topHit: hits[0]?.id ?? "(no hits)",
    };
  });

  const top1 = results.filter((r) => r.rank === 1).length;
  const top3 = results.filter((r) => r.rank !== null && r.rank <= 3).length;
  const found = results.filter((r) => r.rank !== null).length;
  const missed = results.filter((r) => r.rank === null);
  const total = results.length;
  const pct = (n: number) => `${((n / total) * 100).toFixed(0)}%`;

  console.log(`\nTool search quality — against ${catalogSize} wired tools\n`);
  console.log("  BEFORE (raw descriptions, no operator vocabulary):");
  summarize("primary", score(baseline, CASES));
  summarize("HELD-OUT", score(baseline, HELD_OUT_CASES));
  console.log("\n  AFTER (tool-search-keywords.ts folded into the indexed text):");
  summarize("primary", results);
  summarize("HELD-OUT", heldOut);
  console.log(`\n  top-1 = model needs no judgement · top-3 = one describe_tool resolves it · found = in top ${SEARCH_LIMIT}`);
  console.log(`  HELD-OUT is the honest number: those phrasings never shaped the keywords. See`);
  console.log(`  src/assistant/tool-search-keywords.ts. A large primary/held-out gap means overfitting.\n`);
  void top1; void top3; void found; void pct;

  const heldOutMissed = heldOut.filter((r) => r.rank === null);
  if (heldOutMissed.length > 0) {
    console.log(`  HELD-OUT MISSES — the honest failures:`);
    for (const miss of heldOutMissed) console.log(`    "${miss.query}"\n        wanted: ${miss.expect}\n        got:    ${miss.topHit}`);
    console.log("");
  }

  if (missed.length > 0) {
    console.log(`\n  MISSES — the tool exists but never surfaced. These are description bugs, not catalog gaps:`);
    for (const miss of missed) {
      console.log(`    "${miss.query}"`);
      console.log(`        wanted: ${miss.expect}`);
      console.log(`        got:    ${miss.topHit}`);
    }
  }

  const weak = results.filter((r) => r.rank !== null && r.rank > 3);
  if (weak.length > 0) {
    console.log(`\n  WEAK — found, but ranked below 3, so the model pays extra describe_tool calls to disambiguate:`);
    for (const w of weak) console.log(`    rank ${w.rank}: "${w.query}" -> ${w.expect} (top hit was ${w.topHit})`);
  }

  console.log("");
}

run();
