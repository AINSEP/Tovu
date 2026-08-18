/**
 * @file Statistical read on the four canaries, dispatched by team-lead review: n=20 means a single
 * case is 5pp and the 95% CI half-width on any one proportion is ~13-22pp depending on p (verified
 * below), so headline point-estimate deltas under ~10-15pp are not distinguishable from noise if you
 * treat the canaries as independent samples.
 *
 * BUT the canaries are not independent samples of different populations — every canary scores the
 * SAME 20 held-out cases under a different configuration. That's a paired design, and paired designs
 * have much more power than the independent-proportions CI implies, because they cancel per-case
 * difficulty instead of averaging it into the noise. This file reports both views:
 *   1. The single-proportion 95% CI for each canary's top-1 rate (what the team lead's caveat is
 *      about — treats each canary as if it were an independent sample).
 *   2. A paired McNemar exact test against the shipped-keywords baseline for the two candidates
 *      whose point estimates differ most from baseline (doc2query, HyDE) — this is the correct test
 *      for "did this specific case flip outcome," and it's what the per-case miss/flip lists in the
 *      other canary files were already showing qualitatively.
 *
 * Run: `npx tsx development/evals/tool-search-canary-significance.eval.ts`
 */
import { createToolRegistry } from "@jini-ai/core";
import { buildToolCatalogQuery } from "../../src/assistant/tool-catalog-query";
import { buildAssistantToolRegistrations } from "../../src/assistant/tool-registrations";
import type { RouteDeps } from "../../src/server/routes/types";
import { DOC2QUERY } from "../../src/assistant/tool-search-doc2query";
import { HYDE_EXPANSIONS } from "./tool-search-hyde-blind-expansions";
import { HYDE_PROMPT_EXPANSIONS } from "./tool-search-hyde-prompt-expansions";
import Database from "better-sqlite3";
import { ensureToolCatalogTables, reseedToolCatalog, searchToolCatalog } from "@jini-ai/sqlite";

interface EvalCase {
  readonly query: string;
  readonly expect: string;
  readonly alsoAcceptable?: readonly string[];
}

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
function sourceForToolId(id: string): string {
  const [prefix] = id.split("_");
  return prefix && prefix.length > 0 ? prefix : "tovu";
}

function top1Vector(hitFn: (c: EvalCase) => string | null): boolean[] {
  return HELD_OUT_CASES.map((c) => {
    const acceptable = new Set<string>([c.expect, ...(c.alsoAcceptable ?? [])]);
    const top = hitFn(c);
    return top !== null && acceptable.has(top);
  });
}

/**
 * Same pairing, but on found@10 (recall@10) instead of top-1: did ANY acceptable id appear anywhere
 * in the top 10? This is the dimension the original significance pass never tested, and it is the one
 * that governs design: canary 3 established that a reranker can only reorder candidates BM25 already
 * retrieved, so recall@10 — not top-1 — is the hard ceiling on the whole rerank strategy.
 */
function foundVector(rankFn: (c: EvalCase) => readonly string[]): boolean[] {
  return HELD_OUT_CASES.map((c) => {
    const acceptable = new Set<string>([c.expect, ...(c.alsoAcceptable ?? [])]);
    return rankFn(c).some((id) => acceptable.has(id));
  });
}

/** Normal-approx 95% CI half-width for a single proportion, n fixed at 20. */
function ciHalfwidth(p: number, n: number): number {
  return 1.96 * Math.sqrt((p * (1 - p)) / n);
}

/** Exact two-sided binomial McNemar test on discordant pairs b (A-only) vs c (B-only). */
function mcnemarExactP(b: number, c: number): number {
  const n = b + c;
  if (n === 0) return 1;
  const k = Math.min(b, c);
  // sum P(X <= k) for X~Binomial(n, 0.5), doubled (two-sided), capped at 1
  let logC = 0;
  let cumulative = 0;
  const logFact = (x: number) => {
    let s = 0;
    for (let i = 2; i <= x; i++) s += Math.log(i);
    return s;
  };
  for (let x = 0; x <= k; x++) {
    logC = logFact(n) - logFact(x) - logFact(n - x);
    cumulative += Math.exp(logC - n * Math.log(2));
  }
  return Math.min(1, 2 * cumulative);
}

function run(): void {
  const registry = createToolRegistry();
  for (const r of buildAssistantToolRegistrations(fakeRouteDeps())) registry.register(r);

  const shipped = buildToolCatalogQuery(registry); // keywords baseline, raw query
  const baselineVec = top1Vector((c) => shipped.search(c.query, 10)[0]?.id ?? null);

  // doc2query index
  const descriptors = registry.list();
  const doc2Db = new Database(":memory:");
  ensureToolCatalogTables(doc2Db);
  reseedToolCatalog(
    doc2Db,
    descriptors.map((d) => {
      const qs = DOC2QUERY[d.id];
      const description = qs ? `${d.description ?? ""} — ${qs.join(" ")}` : (d.description ?? "");
      return { id: d.id, description, inputSchema: d.inputSchema, source: sourceForToolId(d.id) };
    }),
  );
  const doc2Vec = top1Vector((c) => searchToolCatalog(doc2Db, c.query, 10)[0]?.id ?? null);

  // HyDE on shipped index
  const hydeVec = top1Vector((c) => shipped.search(HYDE_EXPANSIONS[c.query] ?? c.query, 10)[0]?.id ?? null);

  // HyDE via the PROMPT-CHANGE form (zero added LLM calls — the calling model writes the richer query
  // itself, per the revised `search_tools` query description). Fails loudly rather than silently
  // falling back to the raw query, since a silent fallback would score as "no change" and read as a
  // null result instead of a missing-data bug.
  for (const c of HELD_OUT_CASES) {
    if (!(c.query in HYDE_PROMPT_EXPANSIONS)) throw new Error(`HYDE_PROMPT_EXPANSIONS missing case: "${c.query}"`);
  }
  const promptVec = top1Vector((c) => shipped.search(HYDE_PROMPT_EXPANSIONS[c.query]!, 10)[0]?.id ?? null);

  const n = HELD_OUT_CASES.length;
  const pBase = baselineVec.filter(Boolean).length / n;
  const pDoc2 = doc2Vec.filter(Boolean).length / n;
  const pHyde = hydeVec.filter(Boolean).length / n;
  const pPrompt = promptVec.filter(Boolean).length / n;

  console.log(`\nSignificance read on the canaries, n=${n} held-out cases\n`);
  console.log(`  1. SINGLE-PROPORTION 95% CI (treats each canary as an independent sample):`);
  for (const [label, p] of [["keywords baseline", pBase], ["doc2query (blind)", pDoc2], ["HyDE on shipped", pHyde], ["HyDE via prompt", pPrompt]] as const) {
    const hw = ciHalfwidth(p, n) * 100;
    console.log(`     ${label.padEnd(20)} top-1 ${(p * 100).toFixed(0)}%   95% CI ±${hw.toFixed(1)}pp -> [${Math.max(0, p * 100 - hw).toFixed(0)}%, ${Math.min(100, p * 100 + hw).toFixed(0)}%]`);
  }

  console.log(`\n  2. PAIRED McNemar exact test vs. keywords baseline (same 20 cases, correct test for this design):`);
  for (const [label, vec] of [["doc2query (blind)", doc2Vec], ["HyDE on shipped", hydeVec], ["HyDE via prompt", promptVec]] as const) {
    let b = 0; // baseline hit, other miss
    let c = 0; // other hit, baseline miss
    let both = 0;
    let neither = 0;
    for (let i = 0; i < n; i++) {
      if (baselineVec[i] && !vec[i]) b++;
      else if (!baselineVec[i] && vec[i]) c++;
      else if (baselineVec[i] && vec[i]) both++;
      else neither++;
    }
    const p = mcnemarExactP(b, c);
    console.log(`     ${label.padEnd(20)} both-hit=${both} baseline-only=${b} other-only=${c} both-miss=${neither}   exact p=${p.toFixed(4)}   ${p < 0.05 ? "SIGNIFICANT at .05" : "not significant at .05"}`);
  }

  // --- found@10 (recall@10): the dimension the first significance pass never tested ---
  const baselineFound = foundVector((c) => shipped.search(c.query, 10).map((r) => r.id));
  const doc2Found = foundVector((c) => searchToolCatalog(doc2Db, c.query, 10).map((r) => r.id));
  const hydeFound = foundVector((c) => shipped.search(HYDE_EXPANSIONS[c.query] ?? c.query, 10).map((r) => r.id));
  const promptFound = foundVector((c) => shipped.search(HYDE_PROMPT_EXPANSIONS[c.query]!, 10).map((r) => r.id));

  console.log(`\n  3. PAIRED McNemar exact test on found@10 (recall@10) — the reranker's hard ceiling:`);
  console.log(`     keywords baseline    found@10 ${baselineFound.filter(Boolean).length}/${n}`);
  for (const [label, vec] of [["doc2query (blind)", doc2Found], ["HyDE on shipped", hydeFound], ["HyDE via prompt", promptFound]] as const) {
    let b = 0;
    let c = 0;
    let both = 0;
    let neither = 0;
    for (let i = 0; i < n; i++) {
      if (baselineFound[i] && !vec[i]) b++;
      else if (!baselineFound[i] && vec[i]) c++;
      else if (baselineFound[i] && vec[i]) both++;
      else neither++;
    }
    const p = mcnemarExactP(b, c);
    console.log(
      `     ${label.padEnd(20)} found@10 ${vec.filter(Boolean).length}/${n}   both=${both} baseline-only=${b} other-only=${c} neither=${neither}   exact p=${p.toFixed(4)}   ${p < 0.05 ? "SIGNIFICANT at .05" : "not significant at .05"}`,
    );
  }

  console.log(`\n  Reading: the single-proportion CIs are wide (±13-22pp) because they discard the pairing —`);
  console.log(`  that's the noise floor the team lead flagged, and it's real for any comparison treated`);
  console.log(`  that way. The paired test is more informative BECAUSE the same 20 cases are shared across`);
  console.log(`  every canary in this set: it isolates which specific cases flipped rather than comparing`);
  console.log(`  two marginal rates. Even the paired test is likely underpowered at n=20 for anything short`);
  console.log(`  of a large, consistent effect — treat "not significant" as "cannot confirm," not "disproven."\n`);
}

run();
