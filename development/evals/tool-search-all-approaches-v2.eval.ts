/**
 * @file Re-scores EVERY candidate approach on the independent n=130 blind held-out set, at
 * top-1 / top-3 / top-5 / found@10, plus the rerank-ceiling decomposition.
 *
 * WHY THIS EXISTS: all four original canaries were scored on the n=20 set, which was authored by the same
 * agent that wrote `src/assistant/tool-search-keywords.ts`. That set prices the shipped keywords at 45%;
 * an independent blind set prices them at 25%. So every canary verdict — doc2query's 20%, hierarchical's
 * 40%, and the "30% structurally unreachable" ceiling result — was measured against an inflated baseline
 * and none of them can be trusted as recorded. This file re-runs all of them on honest data.
 *
 * Free and deterministic: no model calls, no network. Every approach's generated data already exists
 * (`tool-search-doc2query-blind-questions.ts` was authored blind over the 131-tool catalog and is
 * eval-set-independent, so it re-scores against a new case set with no regeneration), and the
 * hierarchical index is rebuilt from the same live registry.
 *
 * Run: `npx tsx development/evals/tool-search-all-approaches-v2.eval.ts`
 */
import { createToolRegistry } from "@jini-ai/core";
import { buildToolCatalogQuery } from "../../src/assistant/tool-catalog-query";
import { buildAssistantToolRegistrations } from "../../src/assistant/tool-registrations";
import type { RouteDeps } from "../../src/server/routes/types";
import { HELD_OUT_V2 } from "./tool-search-heldout-v2";
import { HYDE_PROMPT_EXPANSIONS_V2 } from "./tool-search-hyde-prompt-expansions-v2";
import { DOC2QUERY } from "../../src/assistant/tool-search-doc2query";
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

function run(): void {
  const registry = createToolRegistry();
  for (const r of buildAssistantToolRegistrations(fakeRouteDeps())) registry.register(r);
  const descriptors = registry.list();
  const n = HELD_OUT_V2.length;

  const withKeywords = buildToolCatalogQuery(registry);
  const noKeywords = buildToolCatalogQuery(registry, { includeSearchKeywords: false });

  // --- Approach 1: doc2query. Blind-generated questions appended to each tool's indexed description.
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

  const configs = [
    { name: "no keywords (pre-fix)", vecs: hitVectors((c) => noKeywords.search(c.query, 10).map((h) => h.id)) },
    { name: "shipped keywords", vecs: hitVectors((c) => withKeywords.search(c.query, 10).map((h) => h.id)) },
    { name: "doc2query (blind)", vecs: hitVectors((c) => searchToolCatalog(doc2Db, c.query, 10).map((h) => h.id)) },
    { name: "HyDE via prompt (free)", vecs: hitVectors((c) => withKeywords.search(HYDE_PROMPT_EXPANSIONS_V2[c.query]!, 10).map((h) => h.id)) },
    {
      name: "doc2query + HyDE prompt",
      vecs: hitVectors((c) => searchToolCatalog(doc2Db, HYDE_PROMPT_EXPANSIONS_V2[c.query]!, 10).map((h) => h.id)),
    },
  ] as const;

  console.log(`\nAll approaches re-scored on the INDEPENDENT n=${n} blind set\n`);
  console.log(`  ${"approach".padEnd(26)}${["top-1", "top-3", "top-5", "found@10"].map((s) => s.padEnd(18)).join("")}`);
  for (const cfg of configs) {
    const cells = CUTOFFS.map((k) => {
      const hits = cfg.vecs[k].filter(Boolean).length;
      return `${((hits / n) * 100).toFixed(0)}% ±${(ciHalfwidth(hits / n, n) * 100).toFixed(0)} (${hits})`.padEnd(18);
    });
    console.log(`  ${cfg.name.padEnd(26)}${cells.join("")}`);
  }

  // --- Approach 2: hierarchical domain routing. One index row per domain, text = concatenation of that
  // --- domain's member tools' indexed descriptions. Scores DOMAIN top-1 — a different unit from the
  // --- table above, which is why it gets its own section rather than a row.
  const byDomain = new Map<string, string[]>();
  for (const d of descriptors) {
    const dom = sourceForToolId(d.id);
    if (!byDomain.has(dom)) byDomain.set(dom, []);
    byDomain.get(dom)!.push(d.description ?? "");
  }
  const domDb = new Database(":memory:");
  ensureToolCatalogTables(domDb);
  reseedToolCatalog(
    domDb,
    [...byDomain.entries()].map(([dom, texts]) => ({
      id: dom,
      description: texts.join(" "),
      inputSchema: { type: "object" as const },
      source: dom,
    })),
  );
  let domTop1 = 0;
  for (const c of HELD_OUT_V2) {
    const want = sourceForToolId(c.expect);
    if (searchToolCatalog(domDb, c.query, 5)[0]?.id === want) domTop1++;
  }
  console.log(`\n  Hierarchical domain routing (different unit — DOMAIN top-1, over ${byDomain.size} domains)`);
  console.log(`     domain top-1 ${domTop1}/${n} (${((domTop1 / n) * 100).toFixed(0)}%)   vs flat tool top-1 of ${((configs[1]!.vecs[1].filter(Boolean).length / n) * 100).toFixed(0)}% on the same cases`);

  // --- Approach 3: rerank ceiling. A reranker can only reorder what retrieval already surfaced, so
  // --- found@10 is its hard ceiling and top-1 is its floor. The gap is everything it could win.
  console.log(`\n  Rerank ceiling decomposition (what a perfect reranker could and could not fix)\n`);
  console.log(`  ${"over which retrieval".padEnd(26)}${"already #1".padEnd(14)}${"addressable".padEnd(14)}${"unreachable".padEnd(14)}ceiling`);
  for (const cfg of [configs[1]!, configs[3]!]) {
    const t1 = cfg.vecs[1].filter(Boolean).length;
    const f10 = cfg.vecs[10].filter(Boolean).length;
    console.log(
      `  ${cfg.name.padEnd(26)}${`${t1}/${n} (${((t1 / n) * 100).toFixed(0)}%)`.padEnd(14)}${`${f10 - t1} (${(((f10 - t1) / n) * 100).toFixed(0)}pp)`.padEnd(14)}${`${n - f10} (${(((n - f10) / n) * 100).toFixed(0)}%)`.padEnd(14)}${((f10 / n) * 100).toFixed(0)}%`,
    );
  }

  // --- Paired significance for every approach vs. the shipped-keywords baseline, at every cutoff.
  const base = configs[1]!.vecs;
  console.log(`\n  PAIRED McNemar exact vs. shipped keywords (same ${n} cases)\n`);
  console.log(`  ${"approach".padEnd(26)}${CUTOFFS.map((k) => (k === 10 ? "found@10" : `top-${k}`).padEnd(18)).join("")}`);
  for (const cfg of configs) {
    if (cfg.name === "shipped keywords") continue;
    const cells = CUTOFFS.map((k) => {
      let b = 0;
      let c = 0;
      for (let i = 0; i < n; i++) {
        if (base[k][i] && !cfg.vecs[k][i]) b++;
        else if (!base[k][i] && cfg.vecs[k][i]) c++;
      }
      const p = mcnemarExactP(b, c);
      const dir = c > b ? "+" : c < b ? "-" : "=";
      return `${dir}${Math.abs(c - b)} p=${p < 0.0001 ? p.toExponential(1) : p.toFixed(3)}`.padEnd(18);
    });
    console.log(`  ${cfg.name.padEnd(26)}${cells.join("")}`);
  }
  console.log(`\n  (+N = N more cases won than lost vs. baseline. p is the exact two-sided paired test.)\n`);
}

run();
