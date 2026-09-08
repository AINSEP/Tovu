/**
 * @file Scores the n=130 blind-authored held-out set (`tool-search-heldout-v2.ts`) against the live tool
 * catalog, at top-1 / top-3 / top-5 / found@10. Free, deterministic, no model calls, no network.
 *
 * WHY A SECOND SET EXISTS: the original held-out set is n=20, where one case is worth 5pp and the 95%
 * interval around a mid-range proportion is roughly ±22pp — wide enough that no two candidate approaches
 * could be ranked against each other. n=130 takes that half-width to roughly ±8pp.
 *
 * WHY IT CHANGED THE ANSWER: the original 20 cases were authored by the same agent that wrote
 * `src/assistant/tool-search-keywords.ts`, so the keyword fix was being graded on cases written by its own
 * author. That set reports 45% top-1 for the shipped keywords. This independent set reports **25%**. The
 * keywords still help (12% -> 25% against the pre-keywords index), just far less than believed. Any result
 * previously scored on those 20 cases inherits the same inflation.
 *
 * WHAT THIS SET DOES NOT FIX — state it plainly, because the number will be quoted: these cases are
 * agent-authored proxy data, exactly like the original 20. A bigger set buys statistical PRECISION, not
 * ecological VALIDITY. Its author flagged, correctly and unprompted, that the register is suspiciously
 * uniform across all 130 because it is one author's model of how administrators speak, which no real
 * population would produce that consistently. Only captured real usage fixes that, and the admin assistant
 * currently has none.
 *
 * BLINDNESS PROVENANCE: authored 2026-08-05 by a fresh subagent (`claude-sonnet-5`) whose ground truth was
 * a registry dump of raw tool ids + descriptions. It was forbidden from reading `development/evals/` (all
 * of it), `src/assistant/tool-search-keywords.ts`, any file containing `HELD_OUT_CASES`, the tool-search
 * analysis reports, and the handoffs — so it never saw the original 20 cases nor the hand-written search
 * vocabulary the index is augmented with. It disclosed one non-event: an `ls` of the reports directory
 * surfaced forbidden FILENAMES in a listing without opening any. Verified here rather than trusted: this
 * file checks id validity, intra-set duplicates, and query overlap against the original 20 directly.
 *
 * It was also instructed NOT to paraphrase each tool's own description, since paraphrase would erase the
 * operator-to-tool vocabulary gap that is the entire object of measurement and report a fake-high number.
 *
 * Run: `npx tsx development/evals/tool-search-heldout-v2.eval.ts`
 */
import { buildEvalToolRegistry } from "./tool-search-eval-registry.js";
import { buildToolCatalogQuery } from "../../apps/website/src/assistant/tool-catalog-query.js";
import type { RouteDeps } from "../../apps/website/src/server/routes/types.js";
import { HELD_OUT_V2 } from "./tool-search-heldout-v2.js";
import { HYDE_PROMPT_EXPANSIONS_V2 } from "./tool-search-hyde-prompt-expansions-v2.js";

type EvalCase = (typeof HELD_OUT_V2)[number];

/** The original n=20 queries, verbatim, used ONLY to prove the v2 set does not overlap them. */
const V1_QUERIES: readonly string[] = [
  "someone is spamming us in the replies under a post",
  "the newsletter is about to go out and it's wrong",
  "people say the contact page does nothing",
  "I need to roll back, everything broke",
  "our logo file needs swapping out",
  "a contractor finished, take away their account",
  "new hire needs to be able to edit posts",
  "we moved the pricing page and old bookmarks 404",
  "is the external system actually receiving our events",
  "this draft is ready to go live",
  "google still shows the old title for this page",
  "group these articles under a topic",
  "the footer needs a recent posts block",
  "change the colours on the site",
  "is anything wrong with the data store",
  "customer can't get in, send them a way to log in",
  "we rebranded, the title at the top is stale",
  "that extension is causing trouble, switch it off",
  "how do I put an entry in the header bar",
  "show everyone on our email list",
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

/** The rank cutoffs reported for every configuration. found@10 is the last one — it is the ceiling on any
 *  reranking strategy, since a reranker can only reorder candidates the retrieval already surfaced. */
const CUTOFFS = [1, 3, 5, 10] as const;
type Cutoff = (typeof CUTOFFS)[number];

/** Per-case hit vector at each cutoff, for one configuration. Paired across configurations by index. */
function hitVectors(rank: (c: EvalCase) => readonly string[]): Record<Cutoff, boolean[]> {
  const out = { 1: [], 3: [], 5: [], 10: [] } as Record<Cutoff, boolean[]>;
  for (const c of HELD_OUT_V2) {
    const acceptable = new Set<string>([c.expect, ...(c.alsoAcceptable ?? [])]);
    const ids = rank(c);
    for (const k of CUTOFFS) out[k].push(ids.slice(0, k).some((id) => acceptable.has(id)));
  }
  return out;
}

function label(k: Cutoff): string {
  return k === 10 ? "found@10" : `top-${k}`;
}

function run(): void {
  const registry = buildEvalToolRegistry(fakeRouteDeps());
  const realIds = new Set(registry.list().map((d) => d.id));
  const n = HELD_OUT_V2.length;

  // ---- Integrity. A bad id silently scores as a permanent miss, which reads as a retrieval failure
  // ---- rather than the data bug it actually is. Surface it instead.
  const badIds: string[] = [];
  for (const c of HELD_OUT_V2) {
    for (const id of [c.expect, ...(c.alsoAcceptable ?? [])]) {
      if (!realIds.has(id)) badIds.push(`${id} (case: "${c.query}")`);
    }
  }
  const v1 = new Set(V1_QUERIES.map((q) => q.toLowerCase().trim()));
  const overlaps = HELD_OUT_V2.filter((c) => v1.has(c.query.toLowerCase().trim())).map((c) => c.query);
  const dupes = HELD_OUT_V2.map((c) => c.query.toLowerCase().trim()).filter((q, i, a) => a.indexOf(q) !== i);

  console.log(`\nBlind held-out set v2 — integrity\n`);
  console.log(`  cases                          ${n}`);
  console.log(`  distinct tools as \`expect\`     ${new Set(HELD_OUT_V2.map((c) => c.expect)).size} of ${realIds.size} wired`);
  console.log(`  domains touched                ${new Set(HELD_OUT_V2.map((c) => c.expect.split("_")[0])).size}`);
  console.log(`  cases with alsoAcceptable      ${HELD_OUT_V2.filter((c) => (c.alsoAcceptable?.length ?? 0) > 0).length}`);
  console.log(`  unresolvable ids               ${badIds.length}${badIds.length ? " -> " + badIds.join(", ") : " (all resolve)"}`);
  console.log(`  overlap with the original 20   ${overlaps.length}${overlaps.length ? " -> " + overlaps.join(" | ") : " (none — set is independent)"}`);
  console.log(`  duplicate queries within v2    ${dupes.length}${dupes.length ? " -> " + dupes.join(" | ") : " (none)"}`);

  const missing = HELD_OUT_V2.filter((c) => !(c.query in HYDE_PROMPT_EXPANSIONS_V2)).map((c) => c.query);
  if (missing.length > 0) {
    throw new Error(`HYDE_PROMPT_EXPANSIONS_V2 missing ${missing.length} case(s): ${missing.slice(0, 3).join(" | ")}`);
  }

  // `includeSearchKeywords:false` is the pre-keywords index — the same before/after contrast the n=20
  // eval reports as 10% -> 45%, which on this set is 12% -> 25%.
  const withKeywords = buildToolCatalogQuery(registry);
  const noKeywords = buildToolCatalogQuery(registry, { includeSearchKeywords: false });

  const configs = [
    { name: "no keywords (pre-fix index)", vecs: hitVectors((c) => noKeywords.search(c.query, 10).map((h) => h.id)) },
    { name: "shipped keywords (raw query)", vecs: hitVectors((c) => withKeywords.search(c.query, 10).map((h) => h.id)) },
    { name: "+ HyDE via prompt (free)", vecs: hitVectors((c) => withKeywords.search(HYDE_PROMPT_EXPANSIONS_V2[c.query]!, 10).map((h) => h.id)) },
  ] as const;

  console.log(`\n  Retrieval, n=${n}   (± is the 95% CI half-width on that proportion)\n`);
  console.log(`  ${"configuration".padEnd(30)}${CUTOFFS.map((k) => label(k).padEnd(20)).join("")}`);
  for (const cfg of configs) {
    const cells = CUTOFFS.map((k) => {
      const hits = cfg.vecs[k].filter(Boolean).length;
      const pct = (hits / n) * 100;
      return `${hits}/${n} ${pct.toFixed(0)}% ±${(ciHalfwidth(hits / n, n) * 100).toFixed(0)}`.padEnd(20);
    });
    console.log(`  ${cfg.name.padEnd(30)}${cells.join("")}`);
  }

  // Paired McNemar at every cutoff: prompt-form vs the shipped-keywords baseline, same cases.
  const base = configs[1]!.vecs;
  const prompt = configs[2]!.vecs;
  console.log(`\n  PAIRED McNemar exact test — HyDE via prompt vs. shipped keywords (same ${n} cases):\n`);
  for (const k of CUTOFFS) {
    let b = 0;
    let c = 0;
    let both = 0;
    let neither = 0;
    for (let i = 0; i < n; i++) {
      const x = base[k][i]!;
      const y = prompt[k][i]!;
      if (x && !y) b++;
      else if (!x && y) c++;
      else if (x && y) both++;
      else neither++;
    }
    const p = mcnemarExactP(b, c);
    console.log(
      `     ${label(k).padEnd(10)} both=${String(both).padStart(3)} baseline-only=${String(b).padStart(3)} prompt-only=${String(c).padStart(3)} neither=${String(neither).padStart(3)}   exact p=${p < 0.0001 ? p.toExponential(2) : p.toFixed(4)}   ${p < 0.05 ? "SIGNIFICANT at .05" : "not significant"}`,
    );
  }
  console.log("");
}

run();
