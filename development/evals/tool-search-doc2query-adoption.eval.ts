/**
 * @file The deciding paired test for doc2query adoption, which had never been run.
 *
 * WHY THIS EXISTS: `tool-search-all-approaches-v2.eval.ts` pairs every arm against the SHIPPED
 * KEYWORDS baseline (`const base = configs[1]!.vecs`). That was the right baseline while the question
 * was "do keywords help." It is the wrong baseline now. The descriptive-query prompt shipped in
 * `0f397a4` (Tovu) + `eeb71733` (Jini), so the live system is the HyDE-via-prompt row. The only
 * decision left is whether to ALSO fold doc2query into the indexed descriptions, and that is a
 * comparison against HyDE-alone — a comparison no file made. Reporting "+70 vs keywords" for the
 * stacked arm overstates the decision at hand by roughly an order of magnitude in case count.
 *
 * Two independent arguments for doc2query are scored separately, because they answer to different
 * risks and could easily disagree:
 *
 *   ARM A — the marginal gain, ASSUMING callers comply with the descriptive-query instruction.
 *           doc2query+HyDE vs HyDE-alone. This is the live question.
 *   ARM B — the FLOOR, assuming callers ignore the instruction and send terse keywords anyway.
 *           doc2query-on-raw-query vs shipped-keywords-on-raw-query. Index-side wins survive caller
 *           non-compliance; prompt-side wins do not. Caller-2 compliance measured 35/35 descriptive,
 *           but caller 1 (Gemini) was never measured, so this arm is a live hedge, not a hypothetical.
 *
 * Discordant cases are enumerated in both directions at top-1, because the adoption decision turns on
 * whether the regressions are systematic (a reason not to adopt) or idiosyncratic (a reason to adopt
 * and keep a note). An aggregate delta cannot answer that.
 *
 * Free and deterministic: no model calls, no network, seconds. All generated data already exists.
 *
 * Run: `npx tsx development/evals/tool-search-doc2query-adoption.eval.ts`
 */
import { buildEvalToolRegistry } from "./tool-search-eval-registry.js";
import { buildToolCatalogQuery } from "../../apps/website/src/assistant/tool-catalog-query.js";
import type { RouteDeps } from "../../apps/website/src/server/routes/types.js";
import { HELD_OUT_V2 } from "./tool-search-heldout-v2.js";
import { HYDE_PROMPT_EXPANSIONS_V2 } from "./tool-search-hyde-prompt-expansions-v2.js";
import { DOC2QUERY } from "../../apps/website/src/assistant/tool-search-doc2query.js";
import Database from "better-sqlite3";
import { ensureToolCatalogTables, reseedToolCatalog, searchToolCatalog } from "@jini-ai/sqlite";

type EvalCase = (typeof HELD_OUT_V2)[number];

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

const CUTOFFS = [1, 3, 5, 10] as const;
type Cutoff = (typeof CUTOFFS)[number];

function hitVectors(rank: (c: EvalCase) => readonly string[]): Record<Cutoff, boolean[]> {
  const out = { 1: [], 3: [], 5: [], 10: [] } as Record<Cutoff, boolean[]>;
  for (const c of HELD_OUT_V2) {
    const acceptable = new Set<string>([c.expect, ...(c.alsoAcceptable ?? [])]);
    const ids = rank(c);
    for (const k of CUTOFFS) out[k].push(ids.slice(0, k).some((id) => acceptable.has(id)));
  }
  return out;
}

/** One paired comparison at every cutoff, printed as a row. Returns the top-1 discordance for inspection. */
function pairedRow(
  label: string,
  reference: Record<Cutoff, boolean[]>,
  candidate: Record<Cutoff, boolean[]>,
  n: number,
): { refOnly: number[]; candOnly: number[] } {
  const cells: string[] = [];
  let top1RefOnly: number[] = [];
  let top1CandOnly: number[] = [];
  for (const k of CUTOFFS) {
    const refOnly: number[] = [];
    const candOnly: number[] = [];
    for (let i = 0; i < n; i++) {
      if (reference[k][i] && !candidate[k][i]) refOnly.push(i);
      else if (!reference[k][i] && candidate[k][i]) candOnly.push(i);
    }
    if (k === 1) {
      top1RefOnly = refOnly;
      top1CandOnly = candOnly;
    }
    const b = refOnly.length;
    const c = candOnly.length;
    const p = mcnemarExactP(b, c);
    const dir = c > b ? "+" : c < b ? "-" : "=";
    const sig = p < 0.05 ? "SIG" : "ns";
    cells.push(`${dir}${Math.abs(c - b)} (w${c}/l${b}) p=${p < 0.0001 ? p.toExponential(1) : p.toFixed(3)} ${sig}`.padEnd(30));
  }
  console.log(`  ${label.padEnd(30)}${cells.join("")}`);
  return { refOnly: top1RefOnly, candOnly: top1CandOnly };
}

function rateRow(label: string, vecs: Record<Cutoff, boolean[]>, n: number): void {
  const cells = CUTOFFS.map((k) => {
    const hits = vecs[k].filter(Boolean).length;
    return `${((hits / n) * 100).toFixed(0)}% (${hits})`.padEnd(14);
  });
  console.log(`  ${label.padEnd(30)}${cells.join("")}`);
}

function run(): void {
  const registry = buildEvalToolRegistry(fakeRouteDeps());
  const descriptors = registry.list();
  const n = HELD_OUT_V2.length;

  // Fail loudly on a missing expansion rather than silently falling back to the raw query — a silent
  // fallback scores as "no change" and reads as a null result instead of the missing-data bug it is.
  for (const c of HELD_OUT_V2) {
    if (!(c.query in HYDE_PROMPT_EXPANSIONS_V2)) throw new Error(`HYDE_PROMPT_EXPANSIONS_V2 missing case: "${c.query}"`);
  }

  // The PRE-adoption baseline: keywords folded, doc2query withheld. Must stay explicit — since
  // adoption landed, the bare `buildToolCatalogQuery(registry)` IS the stacked config, so a default
  // call here would compare production against itself and print a null result.
  const withKeywords = buildToolCatalogQuery(registry, { includeDoc2query: false });

  // The SHIPPED config, exactly as `search_tools` now indexes it: description + operator nouns +
  // doc2query questions, all behind one marker. Distinct from `doc2Db` below, which is the arm the
  // original canaries measured — description + doc2query with the keywords DROPPED. Scoring both is
  // the point: adopting through `indexedDescriptionFor` ships the union, and the union is a
  // configuration no earlier eval ever measured.
  const production = buildToolCatalogQuery(registry);

  const doc2Db = new Database(":memory:");
  ensureToolCatalogTables(doc2Db);
  reseedToolCatalog(
    doc2Db,
    descriptors.map((d) => {
      const qs = DOC2QUERY[d.id];
      return {
        id: d.id,
        description: qs ? `${d.description ?? ""} — ${qs.join(" ")}` : (d.description ?? ""),
        inputSchema: d.inputSchema,
        source: sourceForToolId(d.id),
      };
    }),
  );

  const hydeAlone = hitVectors((c) => withKeywords.search(HYDE_PROMPT_EXPANSIONS_V2[c.query]!, 10).map((h) => h.id));
  const stacked = hitVectors((c) => searchToolCatalog(doc2Db, HYDE_PROMPT_EXPANSIONS_V2[c.query]!, 10).map((h) => h.id));
  const prodVecs = hitVectors((c) => production.search(HYDE_PROMPT_EXPANSIONS_V2[c.query]!, 10).map((h) => h.id));
  const keywordsRaw = hitVectors((c) => withKeywords.search(c.query, 10).map((h) => h.id));
  const doc2Raw = hitVectors((c) => searchToolCatalog(doc2Db, c.query, 10).map((h) => h.id));

  console.log(`\ndoc2query ADOPTION DECISION — paired against what actually ships, n=${n} blind set`);
  console.log(`Catalog: ${descriptors.length} tools. doc2query covers ${Object.keys(DOC2QUERY).length} of them.\n`);

  console.log(`  ${"configuration".padEnd(30)}${["top-1", "top-3", "top-5", "found@10"].map((s) => s.padEnd(14)).join("")}`);
  rateRow("A-ref  HyDE alone (pre-adopt)", hydeAlone, n);
  rateRow("A-cand doc2query + HyDE", stacked, n);
  rateRow("PROD   kw + doc2query + HyDE", prodVecs, n);
  rateRow("B-ref  keywords, raw query", keywordsRaw, n);
  rateRow("B-cand doc2query, raw query", doc2Raw, n);

  console.log(`\n  PAIRED McNemar exact, candidate vs its OWN reference (not vs shipped keywords)\n`);
  console.log(`  ${"comparison".padEnd(30)}${["top-1", "top-3", "top-5", "found@10"].map((s) => s.padEnd(30)).join("")}`);
  const armA = pairedRow("A: stacked vs HyDE alone", hydeAlone, stacked, n);
  pairedRow("PROD: shipped vs pre-adoption", hydeAlone, prodVecs, n);
  pairedRow("B: doc2query vs keywords (raw)", keywordsRaw, doc2Raw, n);
  console.log(`\n  (+N = N more cases won than lost. w/l = cases won / cases LOST. p is exact two-sided paired.)`);

  console.log(`\n  ARM A top-1 discordance, case by case — is the regression systematic or idiosyncratic?\n`);
  console.log(`  WON by adopting doc2query (${armA.candOnly.length}):`);
  for (const i of armA.candOnly) {
    const c = HELD_OUT_V2[i]!;
    const was = withKeywords.search(HYDE_PROMPT_EXPANSIONS_V2[c.query]!, 10)[0]?.id ?? "(nothing)";
    console.log(`    "${c.query}"\n       want ${c.expect} | HyDE-alone gave ${was}`);
  }
  console.log(`\n  LOST by adopting doc2query (${armA.refOnly.length}):`);
  for (const i of armA.refOnly) {
    const c = HELD_OUT_V2[i]!;
    const now = searchToolCatalog(doc2Db, HYDE_PROMPT_EXPANSIONS_V2[c.query]!, 10)[0]?.id ?? "(nothing)";
    console.log(`    "${c.query}"\n       want ${c.expect} | stacked gave ${now}`);
  }

  // --- Does raising `limit` past the default 10 buy anything? ---
  // `byok-tool-surface.ts` ships DEFAULT_SEARCH_LIMIT=10, MAX_SEARCH_LIMIT=25. A hit that lands at
  // rank 11-25 is invisible today but would cost only one more {id, description, source, score} row
  // to expose (no input schemas — that is the whole point of staged discovery). So the question
  // "should we send more" is answerable directly: sweep recall@k and find where it flattens.
  const recallAt = (rank: (c: EvalCase) => readonly string[], k: number): number => {
    let hits = 0;
    for (const c of HELD_OUT_V2) {
      const acceptable = new Set<string>([c.expect, ...(c.alsoAcceptable ?? [])]);
      if (rank(c).slice(0, k).some((id) => acceptable.has(id))) hits++;
    }
    return hits;
  };
  const hydeRank25 = (c: EvalCase) => withKeywords.search(HYDE_PROMPT_EXPANSIONS_V2[c.query]!, 25).map((h) => h.id);
  const stackedRank25 = (c: EvalCase) => searchToolCatalog(doc2Db, HYDE_PROMPT_EXPANSIONS_V2[c.query]!, 25).map((h) => h.id);
  const KS = [1, 3, 5, 10, 15, 20, 25] as const;
  console.log(`\n  RECALL@k SWEEP — is the shipped limit of 10 leaving anything on the table?\n`);
  console.log(`  ${"config".padEnd(26)}${KS.map((k) => `@${k}`.padEnd(11)).join("")}`);
  for (const [label, r] of [["HyDE alone (shipped)", hydeRank25], ["doc2query + HyDE", stackedRank25]] as const) {
    console.log(`  ${label.padEnd(26)}${KS.map((k) => `${((recallAt(r, k) / n) * 100).toFixed(0)}% (${recallAt(r, k)})`.padEnd(11)).join("")}`);
  }

  // --- What does a result row actually COST? ---
  // The recall sweep says what a bigger `limit` buys; this says what it costs. `search_tools` returns
  // {id, description, source, score} and deliberately NO inputSchema — that omission is the whole
  // staged-discovery design (`byok-tool-surface.ts`: the real catalog is ~119 KB / ~30k tokens per
  // message, the 3 meta-tools are under 1 KB). So the marginal row is one authored description, and
  // the question "10 or 5?" is really "is 5 more descriptions worth 3 cases of recall?".
  // Measured on the real payload, over every case, at the shipped serialization.
  console.log(`\n  PAYLOAD COST per search_tools call (real ranked rows, no input schemas)\n`);
  console.log(`  ${"limit".padEnd(10)}${"avg bytes".padEnd(14)}${"~tokens".padEnd(12)}${"x4 calls".padEnd(14)}recall@limit`);
  for (const k of [3, 5, 10, 20, 25] as const) {
    let total = 0;
    for (const c of HELD_OUT_V2) {
      const hits = production.search(HYDE_PROMPT_EXPANSIONS_V2[c.query]!, k);
      total += JSON.stringify(hits.map((h) => ({ id: h.id, description: h.description, source: h.source, score: h.score }))).length;
    }
    const avg = total / n;
    const rec = recallAt((c) => production.search(HYDE_PROMPT_EXPANSIONS_V2[c.query]!, 25).map((h) => h.id), k);
    console.log(
      `  ${String(k).padEnd(10)}${avg.toFixed(0).padEnd(14)}${`~${Math.round(avg / 4)}`.padEnd(12)}${`~${Math.round(avg / 4) * 4}`.padEnd(14)}${((rec / n) * 100).toFixed(0)}% (${rec})`,
    );
  }

  // The "unreachable" cases, diagnosed rather than just counted. A case missing from top-10 is a
  // RETRIEVAL miss, never a missing capability: the expected tool is registered and callable either
  // way, so `execute_delegated_tool` would run it fine if the model ever named it. Printing the
  // registry membership check alongside what the search actually returned is what makes that
  // distinction legible — an unadorned "unreachable" list reads like a coverage gap.
  const registered = new Set(descriptors.map((d) => d.id));
  const diagnose = (label: string, vecs: Record<Cutoff, boolean[]>, rank: (c: EvalCase) => readonly string[]): void => {
    const missed = HELD_OUT_V2.map((c, i) => ({ c, i })).filter(({ i }) => !vecs[10][i]);
    console.log(`\n  Not retrieved in top-10 under ${label} — ${missed.length}/${n}:`);
    for (const { c } of missed) {
      const got = rank(c).slice(0, 5);
      console.log(`    "${c.query}"`);
      console.log(`       want    ${c.expect}   [registered: ${registered.has(c.expect) ? "YES — callable, just not surfaced" : "NO — genuinely absent"}]`);
      console.log(`       got     ${got.join(", ")}`);
    }
  };
  diagnose("HyDE alone (SHIPPED)", hydeAlone, (c) => withKeywords.search(HYDE_PROMPT_EXPANSIONS_V2[c.query]!, 10).map((h) => h.id));
  diagnose("doc2query + HyDE", stacked, (c) => searchToolCatalog(doc2Db, HYDE_PROMPT_EXPANSIONS_V2[c.query]!, 10).map((h) => h.id));
  console.log();
}

run();
