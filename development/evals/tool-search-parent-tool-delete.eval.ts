/**
 * @file Measures what collapsing the delete/trash/tombstone tool family into a `content_delete`
 * parent tool does to `search_tools` retrieval accuracy, scored on the n=130 blind held-out set at
 * top-1 / top-5 / top-10 / top-20. Mirrors `tool-search-parent-tool-read.eval.ts`'s methodology
 * (read, never edited — that file is held by another agent). See
 * `ADS-memory/reports/2026-09-08-content-delete-eval.md` for the family inventory and scope calls
 * this file's `DELETE_FAMILY` constant is derived from.
 *
 * MEASUREMENT ONLY. The collapsed arms are built by filtering `registry.list()` and appending
 * synthetic descriptors, then handing that array to `buildToolCatalogQuery` (which takes
 * `Pick<ToolRegistry,"list">`, so a plain object suffices). `tool-catalog-manifest.ts` is untouched
 * and no existing tool is removed from anything that ships.
 *
 * ## Blindness (revised from this file's first version)
 *
 * Every collapsed-arm description below is derived MECHANICALLY from existing tool ids/descriptions,
 * without consulting `tool-search-heldout-v2.ts`'s query text. The first version of this file authored
 * a "RICH" description with the 10-then-relevant queries in context (same as the read eval's own first
 * RICH arm) and had to discount its own number as self-graded. That arm is removed here, not merely
 * caveated, per instruction: keep the arm blind, or disclose exactly how it deviates. Two blind arms
 * are measured instead of one hand-written one:
 *   - **A-thin**: a short generic description, written without reference to any held-out query.
 *   - **A-concat**: every surviving member tool's own live `indexedDescriptionFor` text, concatenated
 *     into ONE document — the same "no authored vocabulary" discipline the read eval's D1/D2/D3 arms
 *     use for their per-resource cards, applied here to a single fat document instead. This is the
 *     honest blind approximation of "the fat tool keeps the real vocabulary" — no query-peeking, no
 *     hand-tuning.
 *   - **B**: N resource-keyed thin cards (one shared handler), card text also `indexedDescriptionFor`
 *     concatenation per resource — identical construction method to A-concat, just not merged into one
 *     document.
 *
 * ## content_read-collapse safety
 *
 * The `content_read` collapse (shipped 2026-09-08, `tool-registrations.ts:703-710`) replaced 36
 * Tier-1 read tools with 29 `content_read.<resource>` cards. `tool-search-heldout-v2.ts` predates that
 * and still names pre-collapse ids as ground truth for ~38 of 130 cases — every arm, baseline
 * included, would silently undercount on the WHOLE set for a reason that has nothing to do with
 * delete. This file redirects any such id (via the same blind `resourceKeyOf` rule
 * `tool-search-parent-tool-read.eval.ts` documents) before scoring, so whole-set numbers are
 * comparable. This does not affect the delete-family-restricted view: none of the 130 cases' relevant
 * ids for THIS family were part of the read collapse.
 *
 * Run: `npx tsx development/evals/tool-search-parent-tool-delete.eval.ts`
 */
import { createToolRegistry } from "@jini-ai/core";
import { buildToolCatalogQuery } from "../../apps/website/src/assistant/tool-catalog-query.js";
import { resetDuplicateResourceHandlersForTests } from "../../apps/website/src/assistant/duplicate-resource-registry.js";
import { indexedDescriptionFor } from "../../apps/website/src/assistant/tool-search-keywords.js";
import { resetToolContributorsForTests } from "../../apps/website/src/assistant/tool-contribution-registry.js";
import { buildAssistantToolRegistrations } from "../../apps/website/src/assistant/tool-registrations.js";
import { installFirstPartyToolContributors } from "../../apps/website/src/server/runtime/composition/tool-catalog-manifest.js";
import type { RouteDeps } from "../../apps/website/src/server/routes/types.js";
import { HELD_OUT_V2 } from "./tool-search-heldout-v2.js";

type EvalCase = (typeof HELD_OUT_V2)[number];

/**
 * The 8-tool candidate family for `content_delete`, per
 * `ADS-memory/reports/2026-09-08-content-delete-eval.md` §1's scope calls. Excluded, each with its
 * own stated reason in that report (not repeated here): `identity_role_delete`/`identity_policy_delete`
 * (identity stays narrow, per Leona), `workspace_delete` (whole-tenant, already unwired),
 * `widgets_remove_embed` (removes a placement reference, not a resource — different verb-shape
 * entirely), `newsletter_remove_subscription` (reversible unsubscribe, not a resource delete).
 */
const DELETE_FAMILY: readonly string[] = [
  "content_post_delete",
  "media_trash_asset",
  "comments_trash_comment",
  "widgets_trash_instance",
  "theme_trash_file",
  "redirects_tombstone",
  "collections_content_type_tombstone",
  "webhooks_delete_subscription",
];

/**
 * The 36 Tier-1 read tools the `content_read` collapse replaced (from the read eval's own report,
 * `ADS-memory/reports/2026-09-08-parent-tool-read-eval.md` §2, Tier 1 list) — needed ONLY to redirect
 * stale held-out ground truth (see file header). Not re-derived from this file's own inspection; taken
 * as given from the accepted, measured read-collapse report so this file does not re-litigate that
 * question.
 */
const READ_TIER1_CLEAN: ReadonlySet<string> = new Set([
  "backup_list_restore_points", "collections_content_type_list", "collections_entry_list",
  "comments_list_moderation_queue", "content_post_get", "content_post_list", "custom_credential_list",
  "database_list_pending_migrations", "database_list_restore_points", "deployment_list",
  "external_mcp_list", "forms_list_definitions", "identity_policy_list", "identity_role_list",
  "identity_user_list", "media_list_assets", "members_get_by_id", "members_list", "menus_get_menu",
  "menus_list_menus", "newsletter_get_campaign", "newsletter_list_campaigns", "newsletter_list_lists",
  "plugins_list", "redirects_get", "redirects_list", "seo_get_entry_meta", "settings_list_definitions",
  "taxonomy_list", "theme_list", "webhooks_list_subscriptions", "widgets_get_instance",
  "widgets_get_region", "widgets_list_instances", "widgets_list_regions", "workspace_get",
]);

/** Verb/addressing tokens the read collapse strips to derive its resource key — copied verbatim from
 *  `tool-search-parent-tool-read.eval.ts`'s own `VERB_TOKENS`/`resourceKeyOf` (read, not imported,
 *  since that file is held by another agent and this eval must not depend on its module internals). */
const READ_VERB_TOKENS = new Set(["list", "get", "by", "id"]);
function readSingularize(token: string): string {
  return token.length > 3 && token.endsWith("s") ? token.slice(0, -1) : token;
}
function readResourceKeyOf(toolId: string): string {
  const seen: string[] = [];
  for (const raw of toolId.split("_")) {
    if (READ_VERB_TOKENS.has(raw)) continue;
    const t = readSingularize(raw);
    if (!seen.includes(t)) seen.push(t);
  }
  return seen.join("_");
}
/** Redirects a stale pre-read-collapse id to its shipped `content_read.<resource>` card id; passes
 *  every other id through unchanged. */
function redirectReadCollapse(id: string): string {
  return READ_TIER1_CLEAN.has(id) ? `content_read.${readResourceKeyOf(id)}` : id;
}

/** A short, generic description, written without reference to any held-out query — the delete-family
 *  equivalent of the read eval's own (also blind) THIN_DESCRIPTION. */
const THIN_DESCRIPTION =
  "Delete (or soft-delete/trash/tombstone) one of this site's resources by id. Pass `resource` to say " +
  "which kind, and `id` to name the one to remove. Replaces the per-resource delete/trash/tombstone tools.";

function fakeRouteDeps(): RouteDeps {
  const deps = {
    workspaceId: "ws-eval",
    clock: { nowIso: () => "2026-09-08T00:00:00.000Z" },
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

function ciHalfwidth(p: number, n: number): number {
  return 1.96 * Math.sqrt((p * (1 - p)) / n);
}

function mcnemarExactP(b: number, c: number): number {
  const total = b + c;
  if (total === 0) return 1;
  const k = Math.min(b, c);
  const logFact = (x: number) => {
    let s = 0;
    for (let i = 2; i <= x; i++) s += Math.log(i);
    return s;
  };
  let cumulative = 0;
  for (let x = 0; x <= k; x++) {
    cumulative += Math.exp(logFact(total) - logFact(x) - logFact(total - x) - total * Math.log(2));
  }
  return Math.min(1, 2 * cumulative);
}

const CUTOFFS = [1, 5, 10, 20] as const;
type Cutoff = (typeof CUTOFFS)[number];
const MAX_CUTOFF = 20;

type Descriptor = { id: string; description?: string; inputSchema?: unknown };

function hitVectors(
  search: (query: string, limit: number) => readonly { readonly id: string }[],
  acceptableFor: (c: EvalCase) => ReadonlySet<string>,
): Record<Cutoff, boolean[]> {
  const out = { 1: [], 5: [], 10: [], 20: [] } as Record<Cutoff, boolean[]>;
  for (const c of HELD_OUT_V2) {
    const acceptable = acceptableFor(c);
    const ids = search(c.query, MAX_CUTOFF).map((h) => h.id);
    for (const k of CUTOFFS) out[k].push(ids.slice(0, k).some((id) => acceptable.has(id)));
  }
  return out;
}

/** Ground truth for a case, read-collapse-redirected (file header). */
function caseIds(c: EvalCase): string[] {
  return [c.expect, ...(c.alsoAcceptable ?? [])].map(redirectReadCollapse);
}

function baselineAcceptable(c: EvalCase): ReadonlySet<string> {
  return new Set<string>(caseIds(c));
}

function collapsedAcceptable(collapsed: ReadonlySet<string>) {
  return (c: EvalCase): ReadonlySet<string> => {
    const ids = caseIds(c);
    const survivors = ids.filter((id) => !collapsed.has(id));
    return new Set<string>(ids.some((id) => collapsed.has(id)) ? [...survivors, "content_delete"] : survivors);
  };
}

function pct(hits: number, n: number): string {
  return `${hits}/${n} ${((hits / n) * 100).toFixed(0)}% ±${(ciHalfwidth(hits / n, n) * 100).toFixed(0)}`.padEnd(19);
}

/** Verb tokens for THIS family, stripped to derive a resource key — "delete"/"trash"/"tombstone" only,
 *  written before inspecting the output on this specific 8-id list (mirrors the read eval's own
 *  disclosed discipline for its VERB_TOKENS). */
const DELETE_VERB_TOKENS = new Set(["delete", "trash", "tombstone"]);
function deleteSingularize(token: string): string {
  return token.length > 3 && token.endsWith("s") ? token.slice(0, -1) : token;
}
function deleteResourceKeyOf(toolId: string): string {
  const seen: string[] = [];
  for (const raw of toolId.split("_")) {
    if (DELETE_VERB_TOKENS.has(raw)) continue;
    const t = deleteSingularize(raw);
    if (!seen.includes(t)) seen.push(t);
  }
  return seen.join("_");
}

function run(): void {
  resetToolContributorsForTests();
  resetDuplicateResourceHandlersForTests();
  installFirstPartyToolContributors();
  const registry = createToolRegistry();
  // Default options: the REAL current catalog, content_read collapse included — what both production
  // composition roots build today. Not `includeContentReadCollapse: false`.
  for (const r of buildAssistantToolRegistrations(fakeRouteDeps())) registry.register(r);
  const all = registry.list() as readonly Descriptor[];
  const realIds = new Set(all.map((d) => d.id));
  const n = HELD_OUT_V2.length;
  const byId = new Map(all.map((d) => [d.id, d]));

  // ---- Integrity, checked before any accuracy number is trusted.
  const badIds: string[] = [];
  for (const c of HELD_OUT_V2) {
    for (const id of caseIds(c)) if (!realIds.has(id)) badIds.push(`${id} ("${c.query}")`);
  }
  const familyNotInCatalog = DELETE_FAMILY.filter((id) => !realIds.has(id));

  console.log(`\nParent-tool delete collapse — integrity\n`);
  console.log(`  wired tools in catalog (observed, real, content_read collapsed)   ${realIds.size}`);
  console.log(`  held-out cases                                                    ${n}`);
  console.log(`  unresolvable case ids AFTER read-collapse redirection             ${badIds.length}${badIds.length ? " -> " + badIds.slice(0, 5).join(", ") : " (all resolve)"}`);
  console.log(`  delete-family ids                                                 ${DELETE_FAMILY.length}`);
  console.log(`  delete-family ids NOT in catalog (should be 0)                    ${familyNotInCatalog.length}${familyNotInCatalog.length ? " -> " + familyNotInCatalog.join(", ") : " (all resolve)"}`);

  if (realIds.size < 100) {
    console.log(`\n  ABORTING: catalog size ${realIds.size} looks like the dead-harness failure mode (9-tool catalog) —`);
    console.log(`  installFirstPartyToolContributors() may not have run. Not reporting numbers built on this.\n`);
    return;
  }

  const collapsed = new Set(DELETE_FAMILY);
  const survivors = all.filter((d) => !collapsed.has(d.id));

  const baseline = buildToolCatalogQuery(registry);
  const baseVecs = hitVectors((q, l) => baseline.search(q, l), baselineAcceptable);

  console.log(`\n  Retrieval, n=${n}   (± is the 95% CI half-width; read-collapse-redirected ground truth)\n`);
  console.log(`  ${"configuration".padEnd(34)}${CUTOFFS.map((k) => `top-${k}`.padEnd(19)).join("")}`);
  console.log(`  ${"BASELINE (real catalog, shipped)".padEnd(34)}${CUTOFFS.map((k) => pct(baseVecs[k].filter(Boolean).length, n)).join("")}`);

  const results: { name: string; vecs: Record<Cutoff, boolean[]> }[] = [];

  function memberDescription(id: string): string {
    return indexedDescriptionFor(id, byId.get(id)?.description ?? "");
  }

  // ---- Arm A-thin: short generic description, blind by construction.
  {
    const list = [...survivors, { id: "content_delete", description: THIN_DESCRIPTION, inputSchema: { type: "object" } }];
    const catalog = buildToolCatalogQuery({ list: () => list as never });
    const vecs = hitVectors((q, l) => catalog.search(q, l), collapsedAcceptable(collapsed));
    results.push({ name: "A-thin: one card, generic desc", vecs });
  }

  // ---- Arm A-concat: one card, every member's OWN live indexed text concatenated. Blind — no word
  // ---- authored for this eval, same discipline as the per-resource cards below.
  {
    const description = DELETE_FAMILY.map(memberDescription).join(" ");
    const list = [...survivors, { id: "content_delete", description, inputSchema: { type: "object" } }];
    const catalog = buildToolCatalogQuery({ list: () => list as never });
    const vecs = hitVectors((q, l) => catalog.search(q, l), collapsedAcceptable(collapsed));
    results.push({ name: "A-concat: one card, real text concat", vecs });
  }

  // ---- Arm B: N resource-keyed thin cards, one shared handler (Option A from the read report,
  // ---- applied to this family). Card text is `indexedDescriptionFor` per member — byte-identical to
  // ---- what the shipped index holds today for the surviving tool. No word authored here.
  const cards = new Map<string, string[]>();
  for (const id of DELETE_FAMILY) {
    const key = deleteResourceKeyOf(id);
    cards.set(key, [...(cards.get(key) ?? []), id]);
  }
  const cardList = [...cards.entries()].sort(([a], [b]) => a.localeCompare(b));
  const memberSetOf = new Map(cardList.map(([key, ids]) => [key, new Set(ids)]));

  function acceptableCardsFor(c: EvalCase): ReadonlySet<string> {
    const ids = caseIds(c);
    const out = new Set<string>(ids.filter((id) => !collapsed.has(id)));
    for (const [key, members] of memberSetOf) if (ids.some((id) => members.has(id))) out.add(`content_delete.${key}`);
    return out;
  }

  const cardListDescriptors = cardList.map(([key, ids]) => ({
    id: `content_delete.${key}`,
    description: ids.map(memberDescription).join(" "),
    inputSchema: { type: "object" },
  }));
  const listB = [...survivors, ...cardListDescriptors];
  const catalogB = buildToolCatalogQuery({ list: () => listB as never });
  const vecsB = hitVectors((q, l) => catalogB.search(q, l), acceptableCardsFor);
  results.push({ name: `B: ${cardList.length} resource-keyed cards`, vecs: vecsB });

  for (const r of results) console.log(`  ${r.name.padEnd(34)}${CUTOFFS.map((k) => pct(r.vecs[k].filter(Boolean).length, n)).join("")}`);

  console.log(`\n  Card grouping (${DELETE_FAMILY.length} tools -> ${cardList.length} cards, ${DELETE_FAMILY.length - cardList.length} merged):\n`);
  for (const [key, ids] of cardList) console.log(`    content_delete.${key.padEnd(28)} <- ${ids.join(", ")}`);

  // ---- Paired McNemar against the baseline, same 130 cases.
  console.log(`\n  PAIRED McNemar exact test — each collapsed arm vs. the shipped baseline:\n`);
  for (const r of results) {
    const cells: string[] = [];
    for (const k of CUTOFFS) {
      let b = 0;
      let c = 0;
      for (let i = 0; i < n; i++) {
        const x = baseVecs[k][i]!;
        const y = r.vecs[k][i]!;
        if (x && !y) b++;
        else if (!x && y) c++;
      }
      const p = mcnemarExactP(b, c);
      cells.push(`top-${k}: base-only=${b} arm-only=${c} p=${p < 0.0001 ? p.toExponential(1) : p.toFixed(4)}${p < 0.05 ? "*" : ""}`.padEnd(41));
    }
    console.log(`  ${r.name.padEnd(34)}${cells.join("")}`);
  }

  // ---- Restricted to the cases whose ground truth is inside the delete family.
  const affected = HELD_OUT_V2.filter((c) => caseIds(c).some((id) => collapsed.has(id)));
  console.log(`\n  Restricted to the ${affected.length} cases whose ground truth is inside the delete-family collapse set:\n`);
  console.log(`  ${"configuration".padEnd(34)}${CUTOFFS.map((k) => `top-${k}`.padEnd(19)).join("")}`);
  const affectedIdx = HELD_OUT_V2.map((c, i) => [c, i] as const).filter(([c]) => affected.includes(c)).map(([, i]) => i);
  const restrict = (v: boolean[]) => affectedIdx.filter((i) => v[i]).length;
  console.log(`  ${"BASELINE".padEnd(34)}${CUTOFFS.map((k) => pct(restrict(baseVecs[k]), affected.length)).join("")}`);
  for (const r of results) {
    console.log(`  ${r.name.padEnd(34)}${CUTOFFS.map((k) => pct(restrict(r.vecs[k]), affected.length)).join("")}`);
  }

  const familyIdsWithCoverage = new Set(affected.flatMap((c) => caseIds(c)).filter((id) => collapsed.has(id)));
  const uncovered = DELETE_FAMILY.filter((id) => !familyIdsWithCoverage.has(id));
  console.log(`\n  Delete-family ids with ZERO held-out coverage (${uncovered.length} of ${DELETE_FAMILY.length}): ${uncovered.join(", ") || "none"}`);

  for (const r of results) {
    const misses = affectedIdx.filter((i) => !r.vecs[10][i]).map((i) => HELD_OUT_V2[i]!);
    console.log(`\n  Cases still missing at top-10 under "${r.name}" (${misses.length} of ${affected.length}):`);
    for (const m of misses) console.log(`    ${m.expect.padEnd(34)} "${m.query}"`);
  }
  console.log("");
}

run();
