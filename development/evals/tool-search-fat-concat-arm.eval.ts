/**
 * @file Arm C2 — the control that `tool-search-parent-tool-read.eval.ts` was missing.
 *
 * ## The confound this file exists to remove
 *
 * That eval compared arm C (ONE catalog entry, hand-authored `RICH_DESCRIPTION`) against arm D1 (29
 * cards, each built mechanically from its member tools' real `indexedDescriptionFor` output), and
 * attributed the whole 85% -> 59% gap to DOCUMENT GRANULARITY. The two arms differ in **two** ways at
 * once, not one: entry count AND text provenance. The attribution was therefore not established by
 * that data, however plausible the mechanism.
 *
 * **C2 holds text provenance fixed and varies only entry count**: ONE catalog entry whose description
 * is the mechanical concatenation of exactly the same 36 tools' `indexedDescriptionFor` output that
 * arm D1 chunks across 29 cards. Same words, same source, same total vocabulary, one document instead
 * of 29. Whatever separates C2 from D1 is granularity and nothing else.
 *
 * A peer's `content_delete` eval ran the fat-concat shape at n=8 and reported 100% top-10, which is
 * what prompted this. That result is not contradicted by anything here — see the report's discussion
 * of how BM25 length normalization scales with collapse-set size.
 *
 * ## Why a new file rather than another arm in the existing one
 *
 * `tool-search-parent-tool-read.eval.ts` is being edited concurrently by another agent to re-key
 * stale ground-truth ids. `TIER1_CLEAN` and `resourceKeyOf` are duplicated below rather than imported
 * for the same reason: this file's numbers must not move because a shared constant changed under it
 * mid-run. They are byte-identical to that file's versions as of commit `5ac03312`.
 *
 * MEASUREMENT ONLY. No tool is registered; the shipping catalog is untouched. Every arm is built by
 * filtering `registry.list()` into a `Pick<ToolRegistry,"list">` stand-in.
 *
 * Run: `npx tsx development/evals/tool-search-fat-concat-arm.eval.ts`
 */
import { buildToolCatalogQuery } from "../../apps/website/src/assistant/tool-catalog-query.js";
import { indexedDescriptionFor } from "../../apps/website/src/assistant/tool-search-keywords.js";
import { HELD_OUT_V2 } from "./tool-search-heldout-v2.js";
import { buildEvalToolRegistry, fakeEvalRouteDeps } from "./tool-search-eval-registry.js";

type EvalCase = (typeof HELD_OUT_V2)[number];
type Descriptor = { id: string; description?: string; inputSchema?: unknown };

/** Byte-identical to `tool-search-parent-tool-read.eval.ts`'s Tier 1 as of `5ac03312`. */
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

const VERB_TOKENS = new Set(["list", "get", "by", "id"]);

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

function pct(hits: number, n: number): string {
  return `${hits}/${n} ${((hits / n) * 100).toFixed(0)}% ±${(ciHalfwidth(hits / n, n) * 100).toFixed(0)}`.padEnd(19);
}

function run(): void {
  // `includeContentReadCollapse: false` is REQUIRED, not optional. The collapse shipped on
  // 2026-09-08 (`a2fa0bfc`) and `buildAssistantToolRegistrations` now performs it unconditionally by
  // default, so the default registry no longer contains any of the 36 read tools. Without this the
  // baseline arm silently becomes the treatment and every affected case scores as a permanent miss —
  // the integrity guard below caught exactly that on this file's first run.
  const registry = buildEvalToolRegistry(fakeEvalRouteDeps(), undefined, { includeContentReadCollapse: false });
  const all = registry.list() as readonly Descriptor[];

  /** The REAL shipped catalog, collapsed for real, as a fourth arm alongside the synthetic ones. */
  const shippedRegistry = buildEvalToolRegistry(fakeEvalRouteDeps());
  const shippedIds = new Set(shippedRegistry.list().map((d) => d.id));
  const realIds = new Set(all.map((d) => d.id));
  const n = HELD_OUT_V2.length;

  const collapsed = new Set(TIER1_CLEAN);
  const survivors = all.filter((d) => !collapsed.has(d.id));
  const byId = new Map(all.map((d) => [d.id, d]));

  // ---- Integrity: a stale ground-truth id scores as a permanent miss and reads as a retrieval
  // ---- failure. A peer measured a 21-point artifact from exactly this. Fail loudly instead.
  const badCaseIds = [...new Set(HELD_OUT_V2.flatMap((c) => [c.expect, ...(c.alsoAcceptable ?? [])]))].filter(
    (id) => !realIds.has(id),
  );
  const badTierIds = TIER1_CLEAN.filter((id) => !realIds.has(id));
  if (badCaseIds.length > 0 || badTierIds.length > 0) {
    throw new Error(
      `Ground truth does not resolve against the live catalog — refusing to score.\n` +
        `  unresolvable case ids (${badCaseIds.length}): ${badCaseIds.join(", ")}\n` +
        `  unresolvable tier-1 ids (${badTierIds.length}): ${badTierIds.join(", ")}`,
    );
  }

  /** The exact per-tool indexed text the shipped catalog holds today — keywords and doc2query folded. */
  const foldedTextOf = (id: string) => indexedDescriptionFor(id, byId.get(id)?.description ?? "");

  // ---- D1: 29 resource cards, each the concatenation of its own members' folded text.
  const cards = new Map<string, string[]>();
  for (const id of TIER1_CLEAN) cards.set(resourceKeyOf(id), [...(cards.get(resourceKeyOf(id)) ?? []), id]);
  const cardList = [...cards.entries()].sort(([a], [b]) => a.localeCompare(b));

  // ---- C2: ONE entry, the concatenation of ALL 36 — i.e. every card's text, undivided.
  const fatText = TIER1_CLEAN.map(foldedTextOf).join(" ");

  const shippedCardIds = [...shippedIds].filter((id) => id.startsWith("content_read")).sort();

  const arms = [
    {
      name: "D1 29 cards (mechanical text)",
      list: [
        ...survivors,
        ...cardList.map(([key, ids]) => ({
          id: `content_read.${key}`,
          description: ids.map(foldedTextOf).join(" "),
          inputSchema: { type: "object" },
        })),
      ],
      acceptable: (c: EvalCase): ReadonlySet<string> => {
        const ids = [c.expect, ...(c.alsoAcceptable ?? [])];
        const out = new Set<string>(ids.filter((id) => !collapsed.has(id)));
        for (const [key, members] of cardList) if (ids.some((id) => members.includes(id))) out.add(`content_read.${key}`);
        return out;
      },
    },
    {
      name: "D1-SHIPPED (real catalog)",
      list: shippedRegistry.list() as readonly Descriptor[],
      acceptable: (c: EvalCase): ReadonlySet<string> => {
        const ids = [c.expect, ...(c.alsoAcceptable ?? [])];
        const out = new Set<string>(ids.filter((id) => !collapsed.has(id)));
        for (const [key, members] of cardList) {
          if (!ids.some((id) => members.includes(id))) continue;
          const real = `content_read.${key}`;
          out.add(shippedIds.has(real) ? real : `content_read.${key}`);
        }
        return out;
      },
    },
    {
      // Scoring-asymmetry bound: C2 is a hit whenever its ONE entry ranks, but D1 requires the
      // CORRECT card. This arm scores D1 the lenient way — any `content_read.*` card counts — so the
      // gap between it and strict D1 measures exactly how much the asymmetry is worth.
      name: "D1 LENIENT (any card counts)",
      list: [
        ...survivors,
        ...cardList.map(([key, ids]) => ({
          id: `content_read.${key}`,
          description: ids.map(foldedTextOf).join(" "),
          inputSchema: { type: "object" },
        })),
      ],
      acceptable: (c: EvalCase): ReadonlySet<string> => {
        const ids = [c.expect, ...(c.alsoAcceptable ?? [])];
        const out = new Set<string>(ids.filter((id) => !collapsed.has(id)));
        if (ids.some((id) => collapsed.has(id))) for (const [key] of cardList) out.add(`content_read.${key}`);
        return out;
      },
    },
    {
      name: "C2 ONE fat entry (same text)",
      list: [...survivors, { id: "content_read", description: fatText, inputSchema: { type: "object" } }],
      acceptable: (c: EvalCase): ReadonlySet<string> => {
        const ids = [c.expect, ...(c.alsoAcceptable ?? [])];
        const survivorsOfCase = ids.filter((id) => !collapsed.has(id));
        return new Set<string>(ids.some((id) => collapsed.has(id)) ? [...survivorsOfCase, "content_read"] : survivorsOfCase);
      },
    },
  ] as const;

  const baseline = buildToolCatalogQuery(registry);
  const baseVecs = hitVectors(
    (q, l) => baseline.search(q, l),
    (c) => new Set<string>([c.expect, ...(c.alsoAcceptable ?? [])]),
  );

  // ---- Document lengths, to test the length-normalization mechanism directly rather than assert it.
  const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
  const survivorLens = survivors.map((d) => words(foldedTextOf(d.id)));
  const avgdl = survivorLens.reduce((a, b) => a + b, 0) / survivorLens.length;
  const cardLens = cardList.map(([, ids]) => words(ids.map(foldedTextOf).join(" ")));
  const fatLen = words(fatText);

  console.log(`\n${"=".repeat(104)}\nARM C2 — one fat entry, mechanically concatenated (the missing control)\n${"=".repeat(104)}\n`);
  console.log(`  catalog                        ${realIds.size} tools`);
  console.log(`  collapsed                      ${TIER1_CLEAN.length} tools -> ${cardList.length} cards (D1) or 1 entry (C2)`);
  console.log(`  ground truth                   all ids resolve (pre-collapse seam)`);
  console.log(`  shipped catalog                ${shippedIds.size} tools, ${shippedCardIds.length} content_read.* cards`);
  const synthKeys = new Set(cardList.map(([k]) => `content_read.${k}`));
  const keyMismatch = [...synthKeys].filter((k) => !shippedIds.has(k));
  console.log(`  synthetic keys not in shipped  ${keyMismatch.length}${keyMismatch.length ? " -> " + keyMismatch.join(", ") : " (identical key set)"}\n`);
  console.log(`  Indexed-text length, in words (BM25 normalizes by |D|/avgdl):\n`);
  console.log(`    avgdl across ${survivors.length} surviving tools   ${avgdl.toFixed(0)}`);
  console.log(`    D1 card, median               ${[...cardLens].sort((a, b) => a - b)[Math.floor(cardLens.length / 2)]}  (|D|/avgdl ~ ${([...cardLens].sort((a, b) => a - b)[Math.floor(cardLens.length / 2)]! / avgdl).toFixed(1)}x)`);
  console.log(`    C2 fat entry                  ${fatLen}  (|D|/avgdl ~ ${(fatLen / avgdl).toFixed(1)}x)`);

  const rows: { name: string; vecs: Record<Cutoff, boolean[]> }[] = [{ name: "BASELINE (uncollapsed)", vecs: baseVecs }];
  for (const arm of arms) {
    const catalog = buildToolCatalogQuery({ list: () => arm.list as never });
    rows.push({ name: arm.name, vecs: hitVectors((q, l) => catalog.search(q, l), arm.acceptable) });
  }

  const affectedIdx = HELD_OUT_V2.map((c, i) => [c, i] as const)
    .filter(([c]) => [c.expect, ...(c.alsoAcceptable ?? [])].some((id) => collapsed.has(id)))
    .map(([, i]) => i);
  const restrict = (v: boolean[]) => affectedIdx.filter((i) => v[i]).length;

  console.log(`\n  Whole set, n=${n}\n`);
  console.log(`  ${"configuration".padEnd(32)}${CUTOFFS.map((k) => `top-${k}`.padEnd(19)).join("")}`);
  for (const r of rows) console.log(`  ${r.name.padEnd(32)}${CUTOFFS.map((k) => pct(r.vecs[k].filter(Boolean).length, n)).join("")}`);

  console.log(`\n  Restricted to the ${affectedIdx.length} affected cases\n`);
  console.log(`  ${"configuration".padEnd(32)}${CUTOFFS.map((k) => `top-${k}`.padEnd(19)).join("")}`);
  for (const r of rows) console.log(`  ${r.name.padEnd(32)}${CUTOFFS.map((k) => pct(restrict(r.vecs[k]), affectedIdx.length)).join("")}`);

  console.log(`\n  PAIRED McNemar exact test vs. baseline (whole set), and C2 vs D1:\n`);
  const pairs: { label: string; a: Record<Cutoff, boolean[]>; b: Record<Cutoff, boolean[]> }[] = [
    { label: "D1 vs baseline", a: baseVecs, b: rows[1]!.vecs },
    { label: "D1-SHIPPED vs baseline", a: baseVecs, b: rows[2]!.vecs },
    { label: "C2 vs baseline", a: baseVecs, b: rows[4]!.vecs },
    { label: "C2 vs D1 (synthetic)", a: rows[1]!.vecs, b: rows[4]!.vecs },
    { label: "C2 vs D1-SHIPPED", a: rows[2]!.vecs, b: rows[4]!.vecs },
    { label: "C2 vs D1-LENIENT", a: rows[3]!.vecs, b: rows[4]!.vecs },
  ];
  for (const p of pairs) {
    const cells = CUTOFFS.map((k) => {
      let b = 0;
      let c = 0;
      for (let i = 0; i < n; i++) {
        const x = p.a[k][i]!;
        const y = p.b[k][i]!;
        if (x && !y) b++;
        else if (!x && y) c++;
      }
      const pv = mcnemarExactP(b, c);
      return `top-${k}: -${b}/+${c} p=${pv < 0.0001 ? pv.toExponential(1) : pv.toFixed(4)}${pv < 0.05 ? "*" : ""}`.padEnd(34);
    });
    console.log(`  ${p.label.padEnd(32)}${cells.join("")}`);
  }

  const c2 = rows[4]!;
  const misses = affectedIdx.filter((i) => !c2.vecs[10][i]).map((i) => HELD_OUT_V2[i]!);
  console.log(`\n  Cases missing at top-10 under C2 (${misses.length} of ${affectedIdx.length}):\n`);
  for (const m of misses) console.log(`    ${m.expect.padEnd(34)} "${m.query}"`);
  console.log("");
}

run();
