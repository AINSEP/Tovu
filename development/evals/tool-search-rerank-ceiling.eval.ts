/**
 * @file Canary for "rerank the top-K with a cheap LLM/cross-encoder" — measures the ceiling BEFORE
 * building a reranker, not after.
 *
 * Run: `npx tsx development/evals/tool-search-rerank-ceiling.eval.ts`
 *
 * A reranker can only reorder what BM25 already retrieved. It cannot recover a tool BM25 never put
 * in the candidate set at all. So the question that decides GO/NO-GO is not "how good could a
 * reranker be" — it's "recall@10": of the cases where the right tool is buried below rank 1, how
 * many are still SOMEWHERE in the top 10 (reranker can fix them) versus missing entirely (reranker
 * cannot touch them, no matter how good)?
 *
 * This reuses the exact same `buildToolCatalogQuery` index and `HELD_OUT_CASES` set as
 * `tool-search-quality.eval.ts` — no new eval cases, no model calls, no network. It is really just
 * that eval's own "found" column, isolated and framed as an upper bound rather than a headline
 * number, per the brief's request to measure this BEFORE any reranker gets built.
 */
import { createToolRegistry } from "@jini-ai/core";
import { buildToolCatalogQuery } from "../../src/assistant/tool-catalog-query";
import { buildAssistantToolRegistrations } from "../../src/assistant/tool-registrations";
import type { RouteDeps } from "../../src/server/routes/types";

interface EvalCase {
  readonly query: string;
  readonly expect: string;
  readonly alsoAcceptable?: readonly string[];
}

// Same 20 held-out cases as tool-search-quality.eval.ts, duplicated rather than imported because
// that file does not export its case arrays (module-local consts) and this canary must not change
// that file's surface. Kept byte-identical on purpose — diff against tool-search-quality.eval.ts
// if this ever needs re-syncing.
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

function run(): void {
  const registry = createToolRegistry();
  for (const registration of buildAssistantToolRegistrations(fakeRouteDeps())) registry.register(registration);
  const catalog = buildToolCatalogQuery(registry);

  const results = HELD_OUT_CASES.map((c) => {
    const acceptable = new Set<string>([c.expect, ...(c.alsoAcceptable ?? [])]);
    const hits = catalog.search(c.query, SEARCH_LIMIT);
    const index = hits.findIndex((h) => acceptable.has(h.id));
    return { query: c.query, expect: c.expect, rank: index === -1 ? null : index + 1, topHit: hits[0]?.id ?? "(no hits)" };
  });

  const total = results.length;
  const top1 = results.filter((r) => r.rank === 1).length;
  const rerankable = results.filter((r) => r.rank !== null && r.rank > 1).length; // in top-10, not #1 — reranker's addressable set
  const unreachable = results.filter((r) => r.rank === null).length; // not in top-10 at all — no reranker can fix this
  const recallAt10 = top1 + rerankable;

  console.log(`\nCanary 3 — recall@10 ceiling (held-out set, n=${total})\n`);
  console.log(`  already top-1 (reranker has nothing to do):        ${top1}/${total}`);
  console.log(`  in top-10 but NOT top-1 (reranker's addressable set): ${rerankable}/${total}`);
  console.log(`  missing from top-10 entirely (reranker CANNOT fix):   ${unreachable}/${total}`);
  console.log(`  recall@10 ceiling (best any reranker could reach):    ${recallAt10}/${total} (${((recallAt10 / total) * 100).toFixed(0)}%)\n`);

  console.log(`  Rerankable cases (BM25 already found it, just not first):`);
  for (const r of results.filter((x) => x.rank !== null && x.rank > 1)) {
    console.log(`    rank ${r.rank}: "${r.query}" -> ${r.expect} (BM25 top hit: ${r.topHit})`);
  }

  console.log(`\n  Unreachable cases (reranking cannot help — these need better retrieval, not reordering):`);
  for (const r of results.filter((x) => x.rank === null)) {
    console.log(`    "${r.query}" -> ${r.expect} (BM25 top hit: ${r.topHit})`);
  }

  const gap = recallAt10 - top1;
  console.log(`\n  Verdict input: top-1 is ${top1}/${total} (${((top1 / total) * 100).toFixed(0)}%), recall@10 ceiling is ` +
    `${recallAt10}/${total} (${((recallAt10 / total) * 100).toFixed(0)}%) — a ${gap}-case (${((gap / total) * 100).toFixed(0)}pp) gap a ` +
    `PERFECT reranker could close. ${unreachable}/${total} cases (${((unreachable / total) * 100).toFixed(0)}%) are structurally out of reach ` +
    `regardless of reranker quality — that share sets a hard ceiling on how far reranking alone can move the headline number.\n`);
}

run();
