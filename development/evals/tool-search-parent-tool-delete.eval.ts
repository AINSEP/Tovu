/**
 * @file Measures what collapsing the delete/trash/tombstone tool family into a `content_delete`
 * parent tool does to `search_tools` retrieval accuracy, scored on the n=130 blind held-out set at
 * top-1 / top-5 / top-10 / top-20. Mirrors `tool-search-parent-tool-read.eval.ts`'s methodology
 * exactly, per `ADS-memory/reports/2026-09-08-content-delete-eval.md`.
 *
 * MEASUREMENT ONLY. The collapsed arms are built by filtering `registry.list()` and appending
 * synthetic descriptors, then handing that array to `buildToolCatalogQuery` (which takes
 * `Pick<ToolRegistry,"list">`, so a plain object suffices). `tool-catalog-manifest.ts` is untouched
 * and no existing tool is removed from anything that ships.
 *
 * The baseline here is `buildAssistantToolRegistrations(fakeRouteDeps())` at its DEFAULT options —
 * i.e. the REAL current catalog, `content_read` collapse included (that collapse ships
 * unconditionally as of `tool-registrations.ts:709`; this eval does not touch it or re-implement it).
 * The 10 delete-family tool ids are untouched by that collapse (none of them is a Tier-1 read tool),
 * so this file's baseline number is directly comparable to the read eval's own real-catalog
 * measurement without needing `includeContentReadCollapse: false`.
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
 * The wired delete/trash/tombstone family — verified inventory,
 * `ADS-memory/reports/2026-09-08-content-delete-eval.md` §1.1. `workspace_delete` is NOT here: it is
 * declared but deliberately never wired (same file, §1.2), so it cannot appear in any real catalog to
 * begin with. `theme_trash_file` has no held-out case targeting it (§2.1 below) but is still part of
 * the collapse — its absence from `HELD_OUT_V2` is a held-out-set gap, not a reason to exclude the
 * tool from the arms being measured.
 */
const DELETE_FAMILY: readonly string[] = [
  "content_post_delete",
  "media_trash_asset",
  "comments_trash_comment",
  "widgets_trash_instance",
  "theme_trash_file",
  "redirects_tombstone",
  "collections_content_type_tombstone",
  "identity_role_delete",
  "identity_policy_delete",
  "webhooks_delete_subscription",
];

/** The description a `content_delete` would ship with, written the way the catalog's other tools are. */
const THIN_DESCRIPTION =
  "Delete (or soft-delete/trash/tombstone) one of this site's resources by id. Pass `resource` to say " +
  "which kind, and `id` to name the one to remove. Replaces the per-resource delete/trash/tombstone tools.";

/** The same tool once its operator vocabulary is folded in, mirroring the read eval's RICH arm. In
 *  production this text would live in `TOOL_SEARCH_KEYWORDS.content_delete`, not the description. */
const RICH_DESCRIPTION =
  THIN_DESCRIPTION +
  " Resources: posts pages articles blog get rid of delete remove trash, media images photos files " +
  "delete trash remove unused, comments replies moderation get that off there remove nasty, widgets " +
  "blocks sidebar modules get rid of dont need it anymore, theme files templates source trash, " +
  "redirects old links forwarding turn off disable remove, content types kinds of content collections " +
  "get rid of completely, roles access levels permission sets get rid of mistake nobody using, " +
  "policies permission bundles get rid of nobody using, webhooks integrations hooked up remove dont " +
  "use anymore slack zapier. Use it to delete, remove, trash, tombstone, get rid of, throw away, or " +
  "permanently take down anything the site stores.";

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

/** Normal-approx 95% CI half-width for a proportion. */
function ciHalfwidth(p: number, n: number): number {
  return 1.96 * Math.sqrt((p * (1 - p)) / n);
}

/** Exact two-sided binomial McNemar test on discordant pairs b (A-only) vs c (B-only). */
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

function baselineAcceptable(c: EvalCase): ReadonlySet<string> {
  return new Set<string>([c.expect, ...(c.alsoAcceptable ?? [])]);
}

function collapsedAcceptable(collapsed: ReadonlySet<string>) {
  return (c: EvalCase): ReadonlySet<string> => {
    const ids = [c.expect, ...(c.alsoAcceptable ?? [])];
    const survivors = ids.filter((id) => !collapsed.has(id));
    return new Set<string>(ids.some((id) => collapsed.has(id)) ? [...survivors, "content_delete"] : survivors);
  };
}

function pct(hits: number, n: number): string {
  return `${hits}/${n} ${((hits / n) * 100).toFixed(0)}% ±${(ciHalfwidth(hits / n, n) * 100).toFixed(0)}`.padEnd(19);
}

/** Verb/addressing tokens stripped from a delete-family tool id to leave its resource key. Mirrors
 *  the read eval's `VERB_TOKENS`/`resourceKeyOf`, but keyed to THIS family's own verbs — "delete",
 *  "trash", "tombstone" — rather than "list"/"get"/"by"/"id". Written blind (before inspecting its
 *  output on this specific id list). */
const VERB_TOKENS = new Set(["delete", "trash", "tombstone"]);

function singularize(token: string): string {
  return token.length > 3 && token.endsWith("s") ? token.slice(0, -1) : token;
}

function resourceKeyOf(toolId: string): string {
  const seen: string[] = [];
  for (const raw of toolId.split("_")) {
    if (VERB_TOKENS.has(raw)) continue;
    const t = singularize(raw);
    if (!seen.includes(t)) seen.push(t);
  }
  return seen.join("_");
}

function run(): void {
  resetToolContributorsForTests();
  resetDuplicateResourceHandlersForTests();
  installFirstPartyToolContributors();
  const registry = createToolRegistry();
  // Default options: the REAL current catalog, content_read collapse included, exactly what both
  // production composition roots build. This is deliberately NOT `includeContentReadCollapse: false`
  // — this eval measures against what ships today, not a pre-collapse hypothetical.
  for (const r of buildAssistantToolRegistrations(fakeRouteDeps())) registry.register(r);
  const all = registry.list() as readonly Descriptor[];
  const realIds = new Set(all.map((d) => d.id));
  const n = HELD_OUT_V2.length;
  const byId = new Map(all.map((d) => [d.id, d]));

  // ---- Integrity, checked before any accuracy number is trusted (per dispatch pre-check).
  const badIds: string[] = [];
  for (const c of HELD_OUT_V2) {
    for (const id of [c.expect, ...(c.alsoAcceptable ?? [])]) if (!realIds.has(id)) badIds.push(`${id} ("${c.query}")`);
  }
  const familyNotInCatalog = DELETE_FAMILY.filter((id) => !realIds.has(id));

  console.log(`\nParent-tool delete collapse — integrity\n`);
  console.log(`  wired tools in catalog (real, content_read collapsed)   ${realIds.size}`);
  console.log(`  held-out cases                                          ${n}`);
  console.log(`  unresolvable case ids                                   ${badIds.length}${badIds.length ? " -> " + badIds.slice(0, 5).join(", ") : " (all resolve)"}`);
  console.log(`  delete-family ids                                       ${DELETE_FAMILY.length}`);
  console.log(`  delete-family ids NOT in catalog (should be 0)          ${familyNotInCatalog.length}${familyNotInCatalog.length ? " -> " + familyNotInCatalog.join(", ") : " (all resolve)"}`);

  if (realIds.size < 100) {
    console.log(`\n  ABORTING: catalog size ${realIds.size} looks like the dead-harness failure mode (9-tool catalog) —`);
    console.log(`  installFirstPartyToolContributors() may not have run. Not reporting numbers built on this.\n`);
    return;
  }

  const collapsed = new Set(DELETE_FAMILY);
  const survivors = all.filter((d) => !collapsed.has(d.id));

  const baseline = buildToolCatalogQuery(registry);
  const baseVecs = hitVectors((q, l) => baseline.search(q, l), baselineAcceptable);

  console.log(`\n  Retrieval, n=${n}   (± is the 95% CI half-width on that proportion)\n`);
  console.log(`  ${"configuration".padEnd(34)}${CUTOFFS.map((k) => `top-${k}`.padEnd(19)).join("")}`);
  console.log(`  ${"BASELINE (real catalog, shipped)".padEnd(34)}${CUTOFFS.map((k) => pct(baseVecs[k].filter(Boolean).length, n)).join("")}`);

  const results: { name: string; vecs: Record<Cutoff, boolean[]> }[] = [];

  // ---- Arm A: one fat content_delete entry, thin then RICH description.
  for (const [variantName, description] of [
    ["thin desc", THIN_DESCRIPTION],
    ["RICH desc", RICH_DESCRIPTION],
  ] as const) {
    const list = [...survivors, { id: "content_delete", description, inputSchema: { type: "object" } }];
    const catalog = buildToolCatalogQuery({ list: () => list as never });
    const vecs = hitVectors((q, l) => catalog.search(q, l), collapsedAcceptable(collapsed));
    const name = `A: one card, ${variantName}`;
    results.push({ name, vecs });
    console.log(`  ${name.padEnd(34)}${CUTOFFS.map((k) => pct(vecs[k].filter(Boolean).length, n)).join("")}`);
  }

  // ---- Arm B: N resource-keyed thin cards, one shared handler (Option A from the read report,
  // ---- applied to this family). Card text is `indexedDescriptionFor` on each member tool's own live
  // ---- description — byte-identical to what the shipped index holds today. No word authored here.
  const cards = new Map<string, string[]>();
  for (const id of DELETE_FAMILY) {
    const key = resourceKeyOf(id);
    cards.set(key, [...(cards.get(key) ?? []), id]);
  }
  const cardList = [...cards.entries()].sort(([a], [b]) => a.localeCompare(b));
  const memberSetOf = new Map(cardList.map(([key, ids]) => [key, new Set(ids)]));

  function cardDescription(ids: readonly string[]): string {
    return ids.map((id) => indexedDescriptionFor(id, byId.get(id)?.description ?? "")).join(" ");
  }

  function acceptableCardsFor(c: EvalCase): ReadonlySet<string> {
    const ids = [c.expect, ...(c.alsoAcceptable ?? [])];
    const out = new Set<string>(ids.filter((id) => !collapsed.has(id)));
    for (const [key, members] of memberSetOf) if (ids.some((id) => members.has(id))) out.add(`content_delete.${key}`);
    return out;
  }

  const cardListDescriptors = cardList.map(([key, ids]) => ({
    id: `content_delete.${key}`,
    description: cardDescription(ids),
    inputSchema: { type: "object" },
  }));
  const listB = [...survivors, ...cardListDescriptors];
  const catalogB = buildToolCatalogQuery({ list: () => listB as never });
  const vecsB = hitVectors((q, l) => catalogB.search(q, l), acceptableCardsFor);
  const nameB = `B: ${cardList.length} resource-keyed cards`;
  results.push({ name: nameB, vecs: vecsB });
  console.log(`  ${nameB.padEnd(34)}${CUTOFFS.map((k) => pct(vecsB[k].filter(Boolean).length, n)).join("")}`);

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
  const affected = HELD_OUT_V2.filter((c) => [c.expect, ...(c.alsoAcceptable ?? [])].some((id) => collapsed.has(id)));
  console.log(`\n  Restricted to the ${affected.length} cases whose ground truth is inside the delete-family collapse set:\n`);
  console.log(`  ${"configuration".padEnd(34)}${CUTOFFS.map((k) => `top-${k}`.padEnd(19)).join("")}`);
  const affectedIdx = HELD_OUT_V2.map((c, i) => [c, i] as const).filter(([c]) => affected.includes(c)).map(([, i]) => i);
  const restrict = (v: boolean[]) => affectedIdx.filter((i) => v[i]).length;
  console.log(`  ${"BASELINE".padEnd(34)}${CUTOFFS.map((k) => pct(restrict(baseVecs[k]), affected.length)).join("")}`);
  for (const r of results) {
    console.log(`  ${r.name.padEnd(34)}${CUTOFFS.map((k) => pct(restrict(r.vecs[k]), affected.length)).join("")}`);
  }

  const familyIdsWithCoverage = new Set(affected.flatMap((c) => [c.expect, ...(c.alsoAcceptable ?? [])]).filter((id) => collapsed.has(id)));
  const uncovered = DELETE_FAMILY.filter((id) => !familyIdsWithCoverage.has(id));
  console.log(`\n  Delete-family ids with ZERO held-out coverage (${uncovered.length} of ${DELETE_FAMILY.length}): ${uncovered.join(", ") || "none"}`);

  // ---- Named misses under each arm, restricted to affected cases.
  for (const r of results) {
    const misses = affectedIdx.filter((i) => !r.vecs[10][i]).map((i) => HELD_OUT_V2[i]!);
    console.log(`\n  Cases still missing at top-10 under "${r.name}" (${misses.length} of ${affected.length}):`);
    for (const m of misses) console.log(`    ${m.expect.padEnd(34)} "${m.query}"`);
  }
  console.log("");
}

run();
