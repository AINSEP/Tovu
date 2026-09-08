/**
 * @file Canary for "hierarchical search — route to a domain first, then search within it."
 *
 * Run: `npx tsx development/evals/tool-search-hierarchical-canary.eval.ts`
 *
 * The two-stage design (search 21 domains, then search the ~6 tools inside the winning domain)
 * cannot beat its own first stage: if domain routing only gets the right domain 60% of the time,
 * that is the ceiling for the whole approach no matter how good stage two is. So the canary question
 * is exactly that first-stage number, isolated.
 *
 * Nearly free to run: this reuses the SAME `@jini-ai/sqlite` FTS5/BM25 machinery
 * (`ensureToolCatalogTables`/`reseedToolCatalog`/`searchToolCatalog`) the production index already
 * uses, just seeded with one row PER DOMAIN instead of one row per tool. Each domain's row text is
 * the concatenation of its member tools' current (keyword-augmented) indexed descriptions — the
 * exact text the index already carries, grouped differently. No new authoring, no model calls.
 *
 * Domain for a tool id is derived the same way production code derives it
 * (`tool-catalog-query.ts`'s `sourceForToolId`): the prefix before the first `_`.
 */
import Database from "better-sqlite3";
import { buildEvalToolRegistry } from "./tool-search-eval-registry.js";
import { ensureToolCatalogTables, reseedToolCatalog, searchToolCatalog } from "@jini-ai/sqlite";
import { indexedDescriptionFor } from "../../apps/website/src/assistant/tool-search-keywords.js";
import { currentToolIdFor } from "../../apps/website/src/assistant/content-read-tool.js";
import type { RouteDeps } from "../../apps/website/src/server/routes/types.js";

interface EvalCase {
  readonly query: string;
  readonly expect: string;
  readonly alsoAcceptable?: readonly string[];
}

// Byte-identical copy of tool-search-quality.eval.ts's HELD_OUT_CASES — see
// tool-search-rerank-ceiling.eval.ts's comment on why this is duplicated, not imported.
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

function domainOf(toolId: string): string {
  const [prefix] = toolId.split("_");
  return prefix && prefix.length > 0 ? prefix : "tovu";
}

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
  const registry = buildEvalToolRegistry(fakeRouteDeps());
  const descriptors = registry.list();

  // Group by domain, concatenating each tool's ALREADY-INDEXED text (keywords folded in) — the
  // exact text the flat index uses today, just aggregated one level up.
  const byDomain = new Map<string, string[]>();
  for (const d of descriptors) {
    const domain = domainOf(d.id);
    const text = indexedDescriptionFor(d.id, d.description ?? "");
    if (!byDomain.has(domain)) byDomain.set(domain, []);
    byDomain.get(domain)!.push(text);
  }
  console.log(`\nCanary 2 — hierarchical search, domain-routing stage only`);
  console.log(`  ${descriptors.length} tools grouped into ${byDomain.size} domains\n`);

  const db = new Database(":memory:");
  ensureToolCatalogTables(db);
  reseedToolCatalog(
    db,
    [...byDomain.entries()].map(([domain, texts]) => ({
      id: domain,
      description: texts.join(" "),
      source: "domain",
    })),
  );

  const results = HELD_OUT_CASES.map((c) => {
    // Domain buckets below are built from the LIVE registry ids (`domainOf(d.id)`), and every retired
    // Tier-1 read id now ships as `content_read.<resource>` — whose `domainOf` is "content", not its
    // old domain. Resolve through `currentToolIdFor` first so `wantedDomains` names a bucket that
    // still exists. See `ADS-memory/reports/2026-09-08-parent-tool-read-eval.md` §8.
    const wantedDomains = new Set<string>([
      domainOf(currentToolIdFor(c.expect)),
      ...(c.alsoAcceptable ?? []).map((id) => domainOf(currentToolIdFor(id))),
    ]);
    const hits = searchToolCatalog(db, c.query, byDomain.size);
    const index = hits.findIndex((h) => wantedDomains.has(h.id));
    return {
      query: c.query,
      wantedDomains: [...wantedDomains],
      rank: index === -1 ? null : index + 1,
      topDomain: hits[0]?.id ?? "(no hits)",
    };
  });

  const total = results.length;
  const top1 = results.filter((r) => r.rank === 1).length;
  const found = results.filter((r) => r.rank !== null).length;

  console.log(`  domain top-1 (routing picks the RIGHT domain first): ${top1}/${total} (${((top1 / total) * 100).toFixed(0)}%)`);
  console.log(`  domain found anywhere in ranked domain list:          ${found}/${total} (${((found / total) * 100).toFixed(0)}%)\n`);

  console.log(`  Domain-routing misses (stage two never even gets a chance):`);
  for (const r of results.filter((x) => x.rank !== 1)) {
    console.log(`    "${r.query}" wanted domain(s) [${r.wantedDomains.join(", ")}] -> routed to "${r.topDomain}"${r.rank === null ? " (not found at all)" : ` (rank ${r.rank})`}`);
  }

  console.log(`\n  Verdict input: this is an UPPER BOUND on the whole hierarchical design — stage two (searching`);
  console.log(`  within the winning domain) can only do as well as stage one already routed. ${top1}/${total}` +
    ` (${((top1 / total) * 100).toFixed(0)}%) domain top-1 caps the two-stage pipeline's best-case tool-level top-1 at that same number.\n`);
}

run();
