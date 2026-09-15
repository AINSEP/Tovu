import assert from "node:assert/strict";
import test from "node:test";

import { createToolRegistry } from "@jini-ai/core";

import { MAGIC_LINK_PER_EMAIL, createRateLimiter } from "#src/contracts/core/rate-limit/rate-limit";
import { createRouteDeps } from "../../server/runtime/composition/app.js";
import { installFirstPartyToolContributors } from "../../server/runtime/composition/tool-catalog-manifest.js";
import { resetToolContributorsForTests } from "../tool-contribution-registry.js";
import { buildAssistantToolRegistrations } from "../tool-registrations.js";
import { buildToolCatalogQuery } from "../tool-catalog-query.js";

/**
 * @file Search-behavior evidence for the 2026-09-01 keyword backfill: `tool-search-keywords.ts`
 * previously had no entry at all for 66 of the then-162 registered tool ids (measured by diffing
 * `buildAssistantToolRegistrations`'s real output against `TOOL_SEARCH_KEYWORDS`'s keys — see this
 * change's own report for the enumeration). Per this module's own header, "a tool that does not
 * rank is, functionally, a tool that does not exist" once a BYOK turn is reduced to the
 * `search_tools`/`describe_tool`/`execute_delegated_tool` meta-tool surface.
 *
 * Unlike `tool-search-keywords.test.ts` (which tests `indexedDescriptionFor`'s fold/strip contract
 * directly, on one tool id at a time), this file proves RANKING BEHAVIOR: a natural-language query,
 * run against the REAL ~160-tool catalog built the same way both real boot paths build it
 * (`installFirstPartyToolContributors()` + `buildAssistantToolRegistrations(createRouteDeps())`,
 * the same pattern `agent-plugin-tool-search-ranking.integration.test.ts` and
 * `development/evals/tool-search-quality.eval.ts` both use), surfaces the intended tool in the top
 * few hits — not an isolated toy registry where the answer is the only entry.
 *
 * Every case below targets a tool that had ZERO keyword coverage before this change. The paired
 * BEFORE/AFTER comparison (`buildToolCatalogQuery`'s own `includeSearchKeywords` test seam) is the
 * causal evidence: BEFORE reflects the raw id+description text these tools shipped with; AFTER
 * reflects this file's own keyword additions. A query that already ranked well BEFORE would prove
 * nothing about the backfill — the aggregate assertion below requires a real improvement, not just
 * a high AFTER number in isolation.
 */

interface RankingCase {
  /** How an operator actually phrases the request — never the tool's own id or noun. */
  readonly query: string;
  /** The tool this backfill added keywords for for this domain. */
  readonly expect: string;
  /** A different tool that is ALSO a legitimate answer to this phrasing — used exactly once below,
   *  for a genuine functional overlap between two domains (see that case's own comment). */
  readonly alsoAcceptable?: readonly string[];
}

// One representative case per newly-covered domain (25 total, well over the 15 the task asked for),
// spanning: deployments, source-control, database, identity, newsletter, pages, recovery, redirects,
// seo, settings, site-inspection, taxonomy, theme, widgets, content-types, comments, in-chat UI
// rendering. Phrasings are written the way an operator would ask, never the tool's own id/nouns.
const CASES: readonly RankingCase[] = [
  { query: "push my site live to netlify", expect: "deployment_execute_static_publish" },
  { query: "can I publish my site yet", expect: "deployment_get_static_publish_capabilities" },
  { query: "export my site to static files", expect: "deployment_trigger_export" },
  { query: "show me the current dockerfile", expect: "deployment_get_dockerfile" },
  { query: "commit my site to github", expect: "source_control_execute_commit" },
  { query: "is github connected", expect: "source_control_get_capabilities" },
  // Recovery's `database_list_restore_points` and the older Database-adjacent `backup_list_restore_points`
  // are a documented, deliberate near-duplicate pair (see `tool-registrations.ts`'s own header: "a
  // tool cannot be wired without a risk entry" collision note) — both legitimately answer this phrasing.
  { query: "what backups do we have", expect: "content_read.database_restore_point", alsoAcceptable: ["content_read.backup_restore_point"] },
  { query: "show me the history of database changes", expect: "database_query_timeline" },
  { query: "remove this custom role", expect: "identity_role_delete" },
  { query: "what access policies exist", expect: "content_read.identity_policy" },
  { query: "make a new mailing list", expect: "newsletter_create_list" },
  { query: "they never got the confirmation email, send it again", expect: "newsletter_resend_confirmation" },
  { query: "build me a landing page", expect: "pages_write_html" },
  { query: "show me the html source of this page", expect: "pages_read_html" },
  { query: "is there a migration stuck in progress", expect: "recovery_get_status" },
  { query: "look up this one redirect rule", expect: "content_read.redirect" },
  { query: "what are our current seo defaults", expect: "seo_get_settings" },
  { query: "change my admin theme to dark mode", expect: "settings_set_ui_preference" },
  { query: "give me an overview of the whole site", expect: "site_get_profile" },
  { query: "preview merging two tags together", expect: "taxonomy_plan_merge_term" },
  { query: "delete this theme file", expect: "theme_trash_file" },
  { query: "put this widget inline in the post body", expect: "widgets_insert_embed" },
  { query: "create a new custom content type", expect: "collections_content_type_define" },
  { query: "what are our current comment moderation settings", expect: "comments_get_settings" },
  { query: "show me a bar chart in the chat", expect: "assistant_render_ui" },
];

const SEARCH_LIMIT = 10;
const TOP_N = 3;

/** 1-based rank of the first acceptable id, or null when none appeared in the top {@link SEARCH_LIMIT}. */
function rankOf(hits: readonly { readonly id: string }[], c: RankingCase): number | null {
  const acceptable = new Set<string>([c.expect, ...(c.alsoAcceptable ?? [])]);
  const index = hits.findIndex((hit) => acceptable.has(hit.id));
  return index === -1 ? null : index + 1;
}

/** Builds the real production tool surface exactly the way `agent-daemon-server.ts`/
 *  `assistant-byok.ts` do, then returns BOTH catalog views over the identical registrations — the
 *  live, keyword-folded one, and the raw baseline `tool-search-quality.eval.ts` itself uses to
 *  measure "before this file existed." Same registry, so the only variable between the two is
 *  whether `TOOL_SEARCH_KEYWORDS`/doc2query get folded into the indexed text. */
async function buildBeforeAndAfterCatalogs() {
  resetToolContributorsForTests();
  installFirstPartyToolContributors();
  const routeDeps = createRouteDeps();
  await routeDeps.identityReady;

  // Both boot paths build the limiter themselves and add it to `routeDeps`; `AssistantToolRegistryDeps`
  // requires it, so passing bare `routeDeps` does not type-check.
  const magicLinkPerEmailLimiter = createRateLimiter({ profile: MAGIC_LINK_PER_EMAIL, clock: routeDeps.clock });
  const registry = createToolRegistry();
  for (const registration of buildAssistantToolRegistrations({ ...routeDeps, magicLinkPerEmailLimiter })) {
    registry.register(registration);
  }

  return {
    after: buildToolCatalogQuery(registry),
    before: buildToolCatalogQuery(registry, { includeSearchKeywords: false }),
  };
}

test("CRUX: every newly-backfilled tool ranks in the top 3 for a realistic operator phrasing, against the real ~160-tool catalog", async () => {
  const { after } = await buildBeforeAndAfterCatalogs();

  for (const c of CASES) {
    const hits = after.search(c.query, SEARCH_LIMIT);
    const rank = rankOf(hits, c);
    console.log(`[backfill-ranking] "${c.query}" -> rank ${rank ?? "MISS"} (top hit: ${hits[0]?.id ?? "(none)"}), wanted ${c.expect}`);
    assert.ok(
      rank !== null && rank <= TOP_N,
      `"${c.query}" must rank ${c.expect} (or an acceptable alternate) in the top ${TOP_N} — got rank ${rank ?? "not found in top " + SEARCH_LIMIT}, top hit was ${hits[0]?.id ?? "(none)"}`,
    );
  }
});

test("the backfill measurably improves top-3 ranking for these cases versus the raw id+description baseline — the causal evidence, not just a high AFTER number in isolation", async () => {
  const { before, after } = await buildBeforeAndAfterCatalogs();

  const top3Rate = (catalog: typeof before) => {
    const hits = CASES.map((c) => rankOf(catalog.search(c.query, SEARCH_LIMIT), c));
    const top3 = hits.filter((rank) => rank !== null && rank <= TOP_N).length;
    return { top3, total: hits.length };
  };

  const beforeResult = top3Rate(before);
  const afterResult = top3Rate(after);

  console.log(
    `[backfill-ranking] BEFORE (raw id+description) top-3: ${beforeResult.top3}/${beforeResult.total} — ` +
      `AFTER (keywords folded in) top-3: ${afterResult.top3}/${afterResult.total}`,
  );

  assert.ok(
    afterResult.top3 > beforeResult.top3,
    `the keyword backfill must strictly improve top-3 ranking across these previously-unindexed-tool cases — before ${beforeResult.top3}/${beforeResult.total}, after ${afterResult.top3}/${afterResult.total}`,
  );
});
