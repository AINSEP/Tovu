/**
 * @file Measures what collapsing the read-tool family into ONE parameterized parent tool
 * (`content_read({ resource, id?, filters? })`) does to `search_tools` retrieval accuracy, scored on
 * the n=130 blind held-out set at top-1 / top-5 / top-10 / top-20.
 *
 * MEASUREMENT ONLY. Nothing here is registered into the shipping catalog: the collapsed variant is
 * built by filtering `registry.list()` and appending a synthetic descriptor, then handing that array
 * to `buildToolCatalogQuery` (which takes `Pick<ToolRegistry,"list">`, so a plain object suffices).
 * `tool-catalog-manifest.ts` is untouched and no existing tool is removed from anything that ships.
 *
 * ## Why this file exists rather than an edit to `tool-search-heldout-v2.eval.ts`
 *
 * That eval — and every other file in `development/evals/` — composes the catalog as
 * `buildAssistantToolRegistrations(fakeRouteDeps())` alone. That was the whole composition root on
 * 2026-08-05 when its numbers were measured. It stopped being so on 2026-08-17, when the
 * tool-contribution-registry rollout moved 25 domains behind
 * `server/runtime/composition/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()`.
 * Without that call the registry holds **9** tools, every expected id is unresolvable, and every
 * configuration scores a clean 0/130 — which reads as catastrophic retrieval failure rather than the
 * stale harness it is. This file makes the install call, which is the only reason it can report a
 * number at all. See `ADS-memory/reports/2026-09-08-parent-tool-read-eval.md`.
 *
 * ## The synthetic parent tool
 *
 * `content_read` has no `TOOL_SEARCH_KEYWORDS`/`DOC2QUERY` entry (it is not a real tool id), so
 * `indexedDescriptionFor` folds nothing in and its raw `description` is what gets indexed. The two
 * variants below exploit that deliberately: `THIN` is the description alone, `RICH` is the
 * description with the resource nouns and operator vocabulary appended — which is exactly what a
 * shipped `content_read` would carry via its own keyword-table entry. So the RICH arm measures the
 * predicted recovery lever, not a different index.
 *
 * Run: `npx tsx development/evals/tool-search-parent-tool-read.eval.ts`
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
 * Tier 1 — collapses unconditionally. Reads a named collection of persisted rows owned by one
 * domain, addressed by no id (whole collection) or ONE opaque id (a member), with every remaining
 * parameter an optional filter. This is precisely `content_read({ resource, id?, filters? })`.
 */
const TIER1_CLEAN: readonly string[] = [
  "backup_list_restore_points",
  "collections_content_type_list",
  "collections_entry_list",
  "comments_list_moderation_queue",
  "content_post_get",
  "content_post_list",
  "custom_credential_list",
  "database_list_pending_migrations",
  "database_list_restore_points",
  "deployment_list",
  "external_mcp_list",
  "forms_list_definitions",
  "identity_policy_list",
  "identity_role_list",
  "identity_user_list",
  "media_list_assets",
  "members_get_by_id",
  "members_list",
  "menus_get_menu",
  "menus_list_menus",
  "newsletter_get_campaign",
  "newsletter_list_campaigns",
  "newsletter_list_lists",
  "plugins_list",
  "redirects_get",
  "redirects_list",
  "seo_get_entry_meta",
  "settings_list_definitions",
  "taxonomy_list",
  "theme_list",
  "webhooks_list_subscriptions",
  "widgets_get_instance",
  "widgets_get_region",
  "widgets_list_instances",
  "widgets_list_regions",
  "workspace_get",
];

/**
 * Tier 2 — collapses ONLY if the parent tool is allowed a per-resource REQUIRED filter. Each is a
 * sub-collection addressed by a parent id (`formId`, `listId`, `campaignId`, `subscriptionId`,
 * `themeId`, the redirect's own `id`). The shape fits `filters`, but the requiredness cannot be
 * expressed in one static JSON schema — the model has to learn from `describe_tool` that
 * `resource:"form_submissions"` needs `filters.formId` while `resource:"members"` needs nothing.
 */
const TIER2_PARENT_SCOPED: readonly string[] = [
  "forms_list_submissions",
  "newsletter_list_send_log",
  "newsletter_list_subscriptions",
  "redirects_get_hits",
  "theme_list_files",
  "webhooks_get_deliveries",
];

/**
 * Tier 3 — does NOT collapse. Kept here as data rather than prose so the report's exclusion count is
 * checkable. Two failure modes: a compound key (two required ids, no single `id` to carry), or a
 * return value that is not a collection of rows at all (health, capability probes, resolved settings
 * precedence, a cross-domain aggregate).
 */
const TIER3_EXCLUDED: readonly string[] = [
  "backup_get_capabilities",
  "comments_get_settings",
  "database_get_health",
  "database_get_schema_state",
  "deployment_get_dockerfile",
  "deployment_get_export_status",
  "deployment_get_static_publish_capabilities",
  "forms_get_submission",
  "recovery_get_status",
  "seo_get_settings",
  "settings_get_effective",
  "settings_get_raw",
  "site_get_profile",
  "source_control_get_capabilities",
];

/** The description a `content_read` would ship with, written the way the catalog's other tools are. */
const THIN_DESCRIPTION =
  "Read one of this site's resources: return a whole collection, or a single record from it by id. " +
  "Pass `resource` to say which collection, `id` to fetch one member of it, and `filters` to narrow " +
  "a collection listing. Replaces the per-resource list and get tools.";

/**
 * The same tool once its operator vocabulary is folded in — the resource nouns it can address plus
 * the words an admin actually types for each. In production this text would live in
 * `TOOL_SEARCH_KEYWORDS.content_read`, not in the description; it is inlined here only because a
 * synthetic id has no keyword-table entry to read.
 */
const RICH_DESCRIPTION =
  THIN_DESCRIPTION +
  " Resources: posts pages articles blog drafts, media images photos pictures files uploads library" +
  " gallery, users admins accounts logins staff, roles permission levels access, policies permission" +
  " sets bundles, members subscribers signups customers, comments replies moderation queue approval," +
  " forms contact quote request definitions, form submissions responses entries who filled out," +
  " newsletter campaigns email blasts mailings, mailing lists audiences, newsletter subscriptions vip" +
  " list who signed up, menus navigation nav header footer links, widgets blocks sidebar modules," +
  " widget regions slots spots placements, redirects old links forwarding urls, taxonomies categories" +
  " tags topics groupings terms, themes templates designs skins looks, theme files templates source," +
  " content types kinds of content collections, entries records rows items, settings definitions" +
  " options preferences, plugins add-ons extensions apps, webhooks integrations hooked up notify" +
  " zapier slack, restore points snapshots backups copies versions, pending migrations queued updates," +
  " deployments releases publishes, external mcp servers connected services, credentials keys," +
  " workspace site name url slug. Use it to show, list, view, see, pull up, look up, find, fetch," +
  " display, browse, check, count, or read anything the site stores.";

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

/** Per-case hit vector at each cutoff. `acceptableFor` lets the collapsed arms redirect a case's
 *  ground truth to `content_read` without editing the shared case set. */
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

/** A case whose ground truth is (partly) inside the collapse set is satisfied by `content_read`;
 *  any acceptable id NOT collapsed stays acceptable, since that tool still exists in this arm. */
function collapsedAcceptable(collapsed: ReadonlySet<string>) {
  return (c: EvalCase): ReadonlySet<string> => {
    const ids = [c.expect, ...(c.alsoAcceptable ?? [])];
    const survivors = ids.filter((id) => !collapsed.has(id));
    return new Set<string>(ids.some((id) => collapsed.has(id)) ? [...survivors, "content_read"] : survivors);
  };
}

function pct(hits: number, n: number): string {
  return `${hits}/${n} ${((hits / n) * 100).toFixed(0)}% ±${(ciHalfwidth(hits / n, n) * 100).toFixed(0)}`.padEnd(19);
}

function run(): void {
  installFirstPartyToolContributors();
  const registry = createToolRegistry();
  for (const r of buildAssistantToolRegistrations(fakeRouteDeps(), undefined, { includeContentReadCollapse: false })) registry.register(r);
  const all = registry.list() as readonly Descriptor[];
  const realIds = new Set(all.map((d) => d.id));
  const n = HELD_OUT_V2.length;

  // ---- Integrity. A bad id scores as a permanent miss, which reads as a retrieval failure rather
  // ---- than the data bug it is. Surface it before reporting any accuracy number.
  const badIds: string[] = [];
  for (const c of HELD_OUT_V2) {
    for (const id of [c.expect, ...(c.alsoAcceptable ?? [])]) if (!realIds.has(id)) badIds.push(`${id} ("${c.query}")`);
  }
  const unknownTier = [...TIER1_CLEAN, ...TIER2_PARENT_SCOPED, ...TIER3_EXCLUDED].filter((id) => !realIds.has(id));

  console.log(`\nParent-tool read collapse — integrity\n`);
  console.log(`  wired tools in catalog         ${realIds.size}`);
  console.log(`  held-out cases                 ${n}`);
  console.log(`  unresolvable case ids          ${badIds.length}${badIds.length ? " -> " + badIds.slice(0, 5).join(", ") : " (all resolve)"}`);
  console.log(`  tier ids not in catalog        ${unknownTier.length}${unknownTier.length ? " -> " + unknownTier.join(", ") : " (all resolve)"}`);
  console.log(`  tier 1 (clean collapse)        ${TIER1_CLEAN.length}`);
  console.log(`  tier 2 (needs required filter) ${TIER2_PARENT_SCOPED.length}`);
  console.log(`  tier 3 (does not collapse)     ${TIER3_EXCLUDED.length}`);

  const arms = [
    { name: "T1 only (36 collapsed)", ids: TIER1_CLEAN },
    { name: "T1+T2 (42 collapsed)", ids: [...TIER1_CLEAN, ...TIER2_PARENT_SCOPED] },
  ] as const;

  const baseline = buildToolCatalogQuery(registry);
  const baseVecs = hitVectors((q, l) => baseline.search(q, l), baselineAcceptable);

  console.log(`\n  Retrieval, n=${n}   (± is the 95% CI half-width on that proportion)\n`);
  console.log(`  ${"configuration".padEnd(34)}${CUTOFFS.map((k) => `top-${k}`.padEnd(19)).join("")}`);
  console.log(`  ${"BASELINE (177 tools, shipped)".padEnd(34)}${CUTOFFS.map((k) => pct(baseVecs[k].filter(Boolean).length, n)).join("")}`);

  const results: { name: string; vecs: Record<Cutoff, boolean[]> }[] = [];
  for (const arm of arms) {
    const collapsed = new Set(arm.ids);
    const survivors = all.filter((d) => !collapsed.has(d.id));
    for (const [variantName, description] of [
      ["thin desc", THIN_DESCRIPTION],
      ["RICH desc", RICH_DESCRIPTION],
    ] as const) {
      const list = [...survivors, { id: "content_read", description, inputSchema: { type: "object" } }];
      const catalog = buildToolCatalogQuery({ list: () => list as never });
      const vecs = hitVectors((q, l) => catalog.search(q, l), collapsedAcceptable(collapsed));
      const name = `${arm.name} / ${variantName}`;
      results.push({ name, vecs });
      console.log(`  ${name.padEnd(34)}${CUTOFFS.map((k) => pct(vecs[k].filter(Boolean).length, n)).join("")}`);
    }
  }

  // ---- Paired McNemar against the baseline, same 130 cases, so the delta is attributable.
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

  // ---- Where the collapsed arm actually loses, on the cases the collapse is supposed to serve.
  const collapsedAll = new Set([...TIER1_CLEAN, ...TIER2_PARENT_SCOPED]);
  const affected = HELD_OUT_V2.filter((c) => [c.expect, ...(c.alsoAcceptable ?? [])].some((id) => collapsedAll.has(id)));
  console.log(`\n  Restricted to the ${affected.length} cases whose ground truth is inside the collapse set:\n`);
  console.log(`  ${"configuration".padEnd(34)}${CUTOFFS.map((k) => `top-${k}`.padEnd(19)).join("")}`);
  const affectedIdx = HELD_OUT_V2.map((c, i) => [c, i] as const).filter(([c]) => affected.includes(c)).map(([, i]) => i);
  const restrict = (v: boolean[]) => affectedIdx.filter((i) => v[i]).length;
  console.log(`  ${"BASELINE".padEnd(34)}${CUTOFFS.map((k) => pct(restrict(baseVecs[k]), affected.length)).join("")}`);
  for (const r of results) {
    console.log(`  ${r.name.padEnd(34)}${CUTOFFS.map((k) => pct(restrict(r.vecs[k]), affected.length)).join("")}`);
  }

  // ---- Named misses under the best collapsed arm, so the failures are inspectable rather than a rate.
  const best = results[results.length - 1]!;
  const misses = affectedIdx.filter((i) => !best.vecs[10][i]).map((i) => HELD_OUT_V2[i]!);
  console.log(`\n  Cases still missing at top-10 under "${best.name}" (${misses.length} of ${affected.length}):\n`);
  for (const m of misses) console.log(`    ${m.expect.padEnd(34)} "${m.query}"`);
  console.log("");
}

run();

/* ========================================================================================
 * ADDENDUM (2026-09-08): the one-tool / many-index-entries design.
 *
 * ONE executable tool id (`content_read`), but one SHORT indexed catalog document per RESOURCE,
 * each carrying only that resource's own vocabulary, all resolving to the same tool. This is the
 * counter-argument §5 of the report raised against its own NO-GO, measured here.
 *
 * HONESTY CONSTRAINT: every card is built mechanically from what already ships — the member tools'
 * own descriptions folded through `indexedDescriptionFor` (which is byte-identical to what the live
 * index holds for them today, keywords and doc2query included). No word is authored here, and the
 * eval queries were not consulted while writing it. The resource key is derived by a blind rule:
 * strip the read verbs from the tool id, singularize, dedupe. That rule misfires in exactly one
 * documented place, left in place rather than hand-corrected — see RESOURCE_KEY_ARTIFACTS.
 * ====================================================================================== */

/** Verb/addressing tokens stripped from a tool id to leave its resource. Blind list, written before
 *  looking at what it produces: these are the read verbs and the id-addressing words, nothing else. */
const VERB_TOKENS = new Set(["list", "get", "by", "id"]);

/** Crude singularization — trailing "s" off tokens longer than 3 chars. Deliberately naive; a
 *  smarter rule would be a place to smuggle in judgment. */
function singularize(token: string): string {
  return token.length > 3 && token.endsWith("s") ? token.slice(0, -1) : token;
}

/** `media_list_assets` -> `media_asset`; `content_post_get` and `content_post_list` -> `content_post`. */
function resourceKeyOf(toolId: string): string {
  const seen: string[] = [];
  for (const raw of toolId.split("_")) {
    if (VERB_TOKENS.has(raw)) continue;
    const t = singularize(raw);
    if (!seen.includes(t)) seen.push(t);
  }
  return seen.join("_");
}

/** Known misfires of the blind rule, disclosed rather than hand-fixed. */
const RESOURCE_KEY_ARTIFACTS =
  `newsletter_list_lists -> "newsletter": "list" is BOTH the read verb and this tool's noun (mailing ` +
  `lists), so the blind strip removes the noun too. The description still carries the vocabulary; only ` +
  `the 6x-weighted id column loses it. Left uncorrected — hand-fixing it is exactly the tuning this arm ` +
  `exists to avoid.`;

function runAddendum(): void {
  const registry = createToolRegistry();
  for (const r of buildAssistantToolRegistrations(fakeRouteDeps(), undefined, { includeContentReadCollapse: false })) registry.register(r);
  const all = registry.list() as readonly Descriptor[];
  const n = HELD_OUT_V2.length;

  const collapsed = new Set(TIER1_CLEAN);
  const survivors = all.filter((d) => !collapsed.has(d.id));
  const byId = new Map(all.map((d) => [d.id, d]));

  // ---- Group the 36 collapsed tools into resource cards. A card's indexed text is the member
  // ---- tools' OWN live indexed text, concatenated — no authored vocabulary.
  const cards = new Map<string, string[]>();
  for (const id of TIER1_CLEAN) {
    const key = resourceKeyOf(id);
    cards.set(key, [...(cards.get(key) ?? []), id]);
  }
  const cardList = [...cards.entries()].sort(([a], [b]) => a.localeCompare(b));
  const memberSetOf = new Map(cardList.map(([key, ids]) => [key, new Set(ids)]));

  function cardDescription(ids: readonly string[]): string {
    return ids.map((id) => indexedDescriptionFor(id, byId.get(id)?.description ?? "")).join(" ");
  }

  /** Hit iff a ranked card's member tools intersect this case's acceptable ids. Ranking a card for
   *  the WRONG resource is not a hit — the model would call `content_read` with the wrong resource. */
  function acceptableCardsFor(c: EvalCase): ReadonlySet<string> {
    const ids = [c.expect, ...(c.alsoAcceptable ?? [])];
    const out = new Set<string>(ids.filter((id) => !collapsed.has(id)));
    for (const [key, members] of memberSetOf) if (ids.some((id) => members.has(id))) out.add(cardIdFor(key));
    return out;
  }

  let cardIdFor: (key: string) => string = (k) => k;

  const armDefs = [
    {
      name: "D1 resource-keyed cards",
      id: (key: string) => `content_read.${key}`,
      note: "id column keeps the resource nouns",
    },
    {
      name: "D2 opaque-keyed cards",
      id: (key: string) => `content_read.r${String(cardList.findIndex(([k]) => k === key) + 1).padStart(2, "0")}`,
      note: "id column is an opaque handle",
    },
    {
      name: "D3 id-preserving (limit case)",
      id: (key: string) => cards.get(key)!.join(" "),
      note: "index untouched; only execution collapses",
    },
  ] as const;

  const baseline = buildToolCatalogQuery(registry);
  const baseVecs = hitVectors((q, l) => baseline.search(q, l), baselineAcceptable);

  const armResults: { name: string; note: string; vecs: Record<Cutoff, boolean[]> }[] = [];
  for (const arm of armDefs) {
    cardIdFor = arm.id;
    const list = [
      ...survivors,
      ...cardList.map(([key, ids]) => ({ id: arm.id(key), description: cardDescription(ids), inputSchema: { type: "object" } })),
    ];
    const catalog = buildToolCatalogQuery({ list: () => list as never });
    armResults.push({ name: arm.name, note: arm.note, vecs: hitVectors((q, l) => catalog.search(q, l), acceptableCardsFor) });
  }

  // ---- Re-derive the two reference arms so every number in the addendum comes from one run.
  cardIdFor = (k) => k;
  const richList = [...survivors, { id: "content_read", description: RICH_DESCRIPTION, inputSchema: { type: "object" } }];
  const richVecs = hitVectors(
    (q, l) => buildToolCatalogQuery({ list: () => richList as never }).search(q, l),
    collapsedAcceptable(collapsed),
  );

  console.log(`\n\n${"=".repeat(110)}\nADDENDUM — one tool, one index card per resource\n${"=".repeat(110)}\n`);
  console.log(`  36 collapsed tools -> ${cardList.length} resource cards (${TIER1_CLEAN.length - cardList.length} merged by the blind rule)`);
  console.log(`  index schema: fts5(id, description), ranked bm25(6.0, 1.0) -- the id column is weighted 6x\n`);
  for (const [key, ids] of cardList) console.log(`    ${`content_read.${key}`.padEnd(40)} <- ${ids.join(", ")}`);
  console.log(`\n  Blind-rule artifact: ${RESOURCE_KEY_ARTIFACTS}\n`);

  const affectedIdx = HELD_OUT_V2.map((c, i) => [c, i] as const)
    .filter(([c]) => [c.expect, ...(c.alsoAcceptable ?? [])].some((id) => collapsed.has(id)))
    .map(([, i]) => i);

  const rows = [
    { name: "BASELINE (177 tools, shipped)", note: "", vecs: baseVecs },
    { name: "C  one card, RICH desc (prior)", note: "self-graded upper bound", vecs: richVecs },
    ...armResults,
  ];

  console.log(`  Whole set, n=${n}\n`);
  console.log(`  ${"configuration".padEnd(32)}${CUTOFFS.map((k) => `top-${k}`.padEnd(19)).join("")}`);
  for (const r of rows) console.log(`  ${r.name.padEnd(32)}${CUTOFFS.map((k) => pct(r.vecs[k].filter(Boolean).length, n)).join("")}`);

  console.log(`\n  Restricted to the ${affectedIdx.length} cases whose ground truth is inside the 36-tool collapse set\n`);
  console.log(`  ${"configuration".padEnd(32)}${CUTOFFS.map((k) => `top-${k}`.padEnd(19)).join("")}`);
  const restrict = (v: boolean[]) => affectedIdx.filter((i) => v[i]).length;
  for (const r of rows) console.log(`  ${r.name.padEnd(32)}${CUTOFFS.map((k) => pct(restrict(r.vecs[k]), affectedIdx.length)).join("")}`);

  console.log(`\n  PAIRED McNemar exact test vs. the shipped baseline, whole set:\n`);
  for (const r of rows.slice(1)) {
    const cells = CUTOFFS.map((k) => {
      let b = 0;
      let c = 0;
      for (let i = 0; i < n; i++) {
        const x = baseVecs[k][i]!;
        const y = r.vecs[k][i]!;
        if (x && !y) b++;
        else if (!x && y) c++;
      }
      const p = mcnemarExactP(b, c);
      return `top-${k}: -${b}/+${c} p=${p < 0.0001 ? p.toExponential(1) : p.toFixed(4)}${p < 0.05 ? "*" : ""}`.padEnd(34);
    });
    console.log(`  ${r.name.padEnd(32)}${cells.join("")}`);
  }

  const best = armResults[0]!;
  const misses = affectedIdx.filter((i) => !best.vecs[10][i]).map((i) => HELD_OUT_V2[i]!);
  console.log(`\n  Cases still missing at top-10 under "${best.name}" (${misses.length} of ${affectedIdx.length}):\n`);
  for (const m of misses) console.log(`    ${m.expect.padEnd(34)} "${m.query}"`);
  console.log("");
}

runAddendum();

/* ========================================================================================
 * SECOND ADDENDUM (2026-09-08, same day): the REAL shipped catalog.
 *
 * Everything above this point measures a SYNTHETIC arm — a filtered/rebuilt registry array, never
 * registered into anything that ships. This section measures the opposite: `buildAssistantToolRegistrations`
 * run completely unmodified, exactly as every real composition root calls it. The `content_read`
 * collapse it now includes (`assistant/content-read-tool.ts`'s `deriveContentReadRegistrations`,
 * shipped in the same change as this section) is not re-implemented here in any form — this section
 * imports nothing from that file and does not need to; it only reads whatever
 * `buildAssistantToolRegistrations` already returns.
 * ====================================================================================== */

const TIER1_CLEAN_SET = new Set(TIER1_CLEAN);

/** Redirects a case's ground truth to `content_read.<resource>` when that id was one of the 36
 *  collapsed — using the SAME `resourceKeyOf` the shipped collapse itself is keyed by, not a
 *  second, hand-maintained mapping. An id NOT in the collapsed set passes through unchanged. */
function realCatalogAcceptable(c: EvalCase): ReadonlySet<string> {
  const ids = [c.expect, ...(c.alsoAcceptable ?? [])];
  return new Set<string>(ids.map((id) => (TIER1_CLEAN_SET.has(id) ? `content_read.${resourceKeyOf(id)}` : id)));
}

function runRealCatalog(): void {
  resetToolContributorsForTests();
  resetDuplicateResourceHandlersForTests();
  installFirstPartyToolContributors();
  const registry = createToolRegistry();
  const registrations = buildAssistantToolRegistrations(fakeRouteDeps());
  for (const r of registrations) registry.register(r);
  const n = HELD_OUT_V2.length;

  const cardIds = registrations.map((r) => r.descriptor.id).filter((id) => id.startsWith("content_read."));
  const stillPresent = TIER1_CLEAN.filter((id) => registry.has(id));

  console.log(`\n\n${"=".repeat(110)}\nSECOND ADDENDUM — the REAL shipped catalog (buildAssistantToolRegistrations, unmodified)\n${"=".repeat(110)}\n`);
  console.log(`  wired tools, real catalog        ${registry.list().length}`);
  console.log(`  content_read.* cards actually built  ${cardIds.length} of 29 expected`);
  console.log(`  Tier-1 ids still present (should be 0) ${stillPresent.length}${stillPresent.length ? " -> " + stillPresent.join(", ") : ""}`);

  const realQuery = buildToolCatalogQuery(registry);
  const realVecs = hitVectors((q, l) => realQuery.search(q, l), realCatalogAcceptable);

  console.log(`\n  Retrieval on the REAL shipped catalog, n=${n}   (± is the 95% CI half-width)\n`);
  console.log(`  ${"configuration".padEnd(34)}${CUTOFFS.map((k) => `top-${k}`.padEnd(19)).join("")}`);
  console.log(`  ${"REAL SHIPPED CATALOG".padEnd(34)}${CUTOFFS.map((k) => pct(realVecs[k].filter(Boolean).length, n)).join("")}`);

  const affectedIdx = HELD_OUT_V2.map((c, i) => [c, i] as const)
    .filter(([c]) => [c.expect, ...(c.alsoAcceptable ?? [])].some((id) => TIER1_CLEAN_SET.has(id)))
    .map(([, i]) => i);
  const restrict = (v: boolean[]) => affectedIdx.filter((i) => v[i]).length;
  console.log(`\n  Restricted to the ${affectedIdx.length} cases whose ground truth is inside the 36-tool collapse set\n`);
  console.log(`  ${"configuration".padEnd(34)}${CUTOFFS.map((k) => `top-${k}`.padEnd(19)).join("")}`);
  console.log(`  ${"REAL SHIPPED CATALOG".padEnd(34)}${CUTOFFS.map((k) => pct(restrict(realVecs[k]), affectedIdx.length)).join("")}`);

  const misses = affectedIdx.filter((i) => !realVecs[10][i]).map((i) => HELD_OUT_V2[i]!);
  console.log(`\n  Cases still missing at top-10 on the real catalog (${misses.length} of ${affectedIdx.length}):\n`);
  for (const m of misses) console.log(`    ${m.expect.padEnd(34)} "${m.query}"`);
  console.log("");
}

runRealCatalog();
