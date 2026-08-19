/**
 * @file Measures the tool-search SCALING CURVE: re-scores all 5 candidate approaches on the
 * independent n=130 blind held-out set (`tool-search-heldout-v2.ts`, same set as
 * `tool-search-all-approaches-v2.eval.ts`) at catalog sizes 131 (real, baseline) / 250 / 500 / 1000,
 * padding the real 131-tool catalog with synthetic distractor tools from
 * `tool-search-distractors.ts` to reach each larger size.
 *
 * WHY THIS EXISTS: the owner expects the tool count to grow with plugins, payments, and new
 * features, and wants the SHAPE of degradation (linear / logarithmic / cliff) and whether the
 * five approaches' RANKING stays stable as the catalog grows — not just a single point-in-time
 * number. See `ADS-memory/reports/analysis/2026-08-05-tool-search-scaling-curve.md` for the full
 * writeup, distractor-generation policy, and the caveats below in numbered form.
 *
 * ## Distractor blindness
 *
 * `tool-search-distractors.ts` was authored (by this file's own author) BEFORE this file was
 * written or the held-out set was read — see that module's header for the full provenance. This
 * file itself only ever prints AGGREGATE tables (counts, percentages, significance stats) — never
 * per-case query text — preserving that same blindness discipline for whoever reads its output.
 *
 * ## Three things this run reports beyond a plain rescoring, per review of the distractor design:
 *
 * 1. **doc2query calibration delta (size 250 only).** The distractors' doc2query enrichment is
 *    templated (`MASTER_DISTRACTOR_DOC2QUERY`), while the real 131 tools' doc2query
 *    (`tool-search-doc2query-blind-questions.ts`) was model-generated and is lexically richer. That
 *    asymmetry would flatter doc2query — the approach actively under consideration for adoption —
 *    by giving it artificially weak competition at scale. At size 250 (the smallest padded size),
 *    every doc2query config is scored BOTH against the templated distractor set AND against
 *    `tool-search-distractors-doc2query-calibration-250.ts` (also model-generated, also authored
 *    blind). The delta between the two bounds how much the templating inflates doc2query's score;
 *    that bound is assumed to hold (or worsen, never improve) at 500/1000, which are not
 *    separately calibrated.
 * 2. **Miss decomposition.** For every held-out case where the gold tool is NOT top-1, this
 *    classifies whatever IS top-1 as REAL / DISTRACTOR-NEW / DISTRACTOR-NEAR. BM25's IDF is
 *    global, so padding the index with hundreds of documents that reuse this fixture's own
 *    boilerplate phrases ("Read-only.", "Call this to find an id before calling X") lowers the IDF
 *    of those phrases FOR THE REAL TOOLS TOO. If most displacement is real-tool-over-real-tool
 *    rather than distractor-over-real-tool, part of the measured degradation is an artifact of
 *    shared boilerplate lowering IDF, not genuine new competition — a materially different finding
 *    with different implications. This decomposition is what actually separates the two effects.
 * 3. **Category contribution.** The distractor-caused misses are further split NEW vs NEAR, so the
 *    report can say how much of the measured pressure is raw catalog-size dilution (NEW) vs
 *    targeted lexical competition (NEAR) — more decision-relevant to the owner than a single
 *    blended number.
 *
 * Run: `npx tsx development/evals/tool-search-scaling-curve.eval.ts`
 * Free and deterministic: no model calls, no network, at scoring time.
 */
import { createToolRegistry } from "@jini-ai/core";
import { buildAssistantToolRegistrations } from "../../src/assistant/tool-registrations/index.js";
import type { RouteDeps } from "../../src/server/routes/types.js";
import { HELD_OUT_V2 } from "./tool-search-heldout-v2.js";
import { HYDE_PROMPT_EXPANSIONS_V2 } from "./tool-search-hyde-prompt-expansions-v2.js";
import { DOC2QUERY } from "../../src/assistant/tool-search-doc2query.js";
import { indexedDescriptionFor, stripSearchKeywords } from "../../src/assistant/tool-search-keywords.js";
import { MASTER_DISTRACTOR_DOC2QUERY, distractorsForSize, type DistractorTool } from "./tool-search-distractors.js";
import { CALIBRATION_DOC2QUERY_250 } from "./tool-search-distractors-doc2query-calibration-250.js";
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

const CUTOFFS = [1, 3, 5, 10] as const;
type Cutoff = (typeof CUTOFFS)[number];
type ToolClass = "real" | "distractor-new" | "distractor-near";

interface ToolMeta {
  readonly cls: ToolClass;
}

interface ScoreResult {
  readonly vecs: Record<Cutoff, boolean[]>;
  /** Miss classification at cutoff=1 only: what won top-1 when the gold tool did not. */
  readonly missClass: Record<ToolClass, number>;
}

function scoreConfig(rank: (c: EvalCase) => readonly string[], meta: ReadonlyMap<string, ToolMeta>): ScoreResult {
  const vecs = { 1: [], 3: [], 5: [], 10: [] } as Record<Cutoff, boolean[]>;
  const missClass: Record<ToolClass, number> = { real: 0, "distractor-new": 0, "distractor-near": 0 };
  for (const c of HELD_OUT_V2) {
    const acceptable = new Set<string>([c.expect, ...(c.alsoAcceptable ?? [])]);
    const ids = rank(c);
    for (const k of CUTOFFS) vecs[k].push(ids.slice(0, k).some((id) => acceptable.has(id)));
    const top1 = ids[0];
    if (top1 !== undefined && !acceptable.has(top1)) {
      const cls = meta.get(top1)?.cls ?? "real";
      missClass[cls]++;
    }
  }
  return { vecs, missClass };
}

function printTable(title: string, rows: ReadonlyArray<{ name: string; vecs: Record<Cutoff, boolean[]> }>, n: number): void {
  console.log(`\n${title}\n`);
  console.log(`  ${"approach".padEnd(28)}${["top-1", "top-3", "top-5", "found@10"].map((s) => s.padEnd(18)).join("")}`);
  for (const row of rows) {
    const cells = CUTOFFS.map((k) => {
      const hits = row.vecs[k].filter(Boolean).length;
      return `${((hits / n) * 100).toFixed(0)}% ±${(ciHalfwidth(hits / n, n) * 100).toFixed(0)} (${hits})`.padEnd(18);
    });
    console.log(`  ${row.name.padEnd(28)}${cells.join("")}`);
  }
}

function printMissDecomposition(title: string, rows: ReadonlyArray<{ name: string; missClass: Record<ToolClass, number> }>): void {
  console.log(`\n${title}\n`);
  console.log(`  ${"approach".padEnd(28)}${"total misses".padEnd(14)}${"real-tool".padEnd(14)}${"distractor-new".padEnd(16)}distractor-near`);
  for (const row of rows) {
    const total = row.missClass.real + row.missClass["distractor-new"] + row.missClass["distractor-near"];
    console.log(
      `  ${row.name.padEnd(28)}${String(total).padEnd(14)}${String(row.missClass.real).padEnd(14)}${String(row.missClass["distractor-new"]).padEnd(16)}${row.missClass["distractor-near"]}`,
    );
  }
}

function buildCombinedIndex(
  real: ReadonlyArray<{ id: string; description?: string; inputSchema?: unknown }>,
  distractors: readonly DistractorTool[],
  includeSearchKeywords: boolean,
): { search(query: string, limit?: number): Array<{ id: string; description: string }> } {
  const db = new Database(":memory:");
  ensureToolCatalogTables(db);
  reseedToolCatalog(db, [
    ...real.map((d) => ({
      id: d.id,
      description: includeSearchKeywords ? indexedDescriptionFor(d.id, d.description ?? "") : (d.description ?? ""),
      inputSchema: d.inputSchema,
      source: sourceForToolId(d.id),
    })),
    ...distractors.map((d) => ({
      id: d.id,
      description: d.description,
      inputSchema: { type: "object" as const },
      source: sourceForToolId(d.id),
    })),
  ]);
  return {
    search(query, limit = 10) {
      return searchToolCatalog(db, query, limit).map((hit) => ({ ...hit, description: stripSearchKeywords(hit.description) }));
    },
  };
}

function buildDoc2QueryIndex(
  real: ReadonlyArray<{ id: string; description?: string }>,
  distractors: readonly DistractorTool[],
  distractorQuestions: Readonly<Record<string, readonly string[]>>,
): { search(query: string, limit?: number): Array<{ id: string; description: string }> } {
  const db = new Database(":memory:");
  ensureToolCatalogTables(db);
  reseedToolCatalog(db, [
    ...real.map((d) => {
      const qs = DOC2QUERY[d.id];
      return {
        id: d.id,
        description: qs ? `${d.description ?? ""} — ${qs.join(" ")}` : (d.description ?? ""),
        inputSchema: undefined,
        source: sourceForToolId(d.id),
      };
    }),
    ...distractors.map((d) => {
      const qs = distractorQuestions[d.id];
      return {
        id: d.id,
        description: qs ? `${d.description} — ${qs.join(" ")}` : d.description,
        inputSchema: { type: "object" as const },
        source: sourceForToolId(d.id),
      };
    }),
  ]);
  return { search: (query, limit = 10) => searchToolCatalog(db, query, limit) };
}

function run(): void {
  const registry = createToolRegistry();
  for (const r of buildAssistantToolRegistrations(fakeRouteDeps())) registry.register(r);
  const realDescriptors = registry.list();
  const n = HELD_OUT_V2.length;

  const SIZES = [131, 250, 500, 1000] as const;

  console.log(`\n${"=".repeat(100)}`);
  console.log(`TOOL-SEARCH SCALING CURVE — real catalog: ${realDescriptors.length} tools, held-out set: n=${n}`);
  console.log(`${"=".repeat(100)}`);

  // Per-size, per-config vectors, retained across the loop for the cross-size stability/crossover
  // summary printed at the end.
  const acrossSizes: Array<{ size: number; configs: Array<{ name: string; vecs: Record<Cutoff, boolean[]> }> }> = [];

  for (const size of SIZES) {
    const distractors = distractorsForSize(size);
    const meta = new Map<string, ToolMeta>();
    for (const d of distractors) meta.set(d.id, { cls: d.category === "near" ? "distractor-near" : "distractor-new" });

    const withKeywords = buildCombinedIndex(realDescriptors, distractors, true);
    const noKeywords = buildCombinedIndex(realDescriptors, distractors, false);
    const doc2Templated = buildDoc2QueryIndex(realDescriptors, distractors, MASTER_DISTRACTOR_DOC2QUERY);

    const configs: Array<{ name: string; vecs: Record<Cutoff, boolean[]>; missClass: Record<ToolClass, number> }> = [
      { name: "no keywords (pre-fix)", ...scoreConfig((c) => noKeywords.search(c.query, 10).map((h) => h.id), meta) },
      { name: "shipped keywords", ...scoreConfig((c) => withKeywords.search(c.query, 10).map((h) => h.id), meta) },
      { name: "doc2query (blind)", ...scoreConfig((c) => doc2Templated.search(c.query, 10).map((h) => h.id), meta) },
      { name: "HyDE via prompt (free)", ...scoreConfig((c) => withKeywords.search(HYDE_PROMPT_EXPANSIONS_V2[c.query]!, 10).map((h) => h.id), meta) },
      { name: "doc2query + HyDE prompt", ...scoreConfig((c) => doc2Templated.search(HYDE_PROMPT_EXPANSIONS_V2[c.query]!, 10).map((h) => h.id), meta) },
    ];

    printTable(`--- Catalog size ${size} (${distractors.length} distractors: ${distractors.filter((d) => d.category === "near").length} near / ${distractors.filter((d) => d.category === "new").length} new) ---`, configs, n);
    printMissDecomposition(`  Miss decomposition @ top-1 (what beat the gold tool, when it lost)`, configs);

    acrossSizes.push({ size, configs: configs.map((c) => ({ name: c.name, vecs: c.vecs })) });

    // --- Rerank ceiling decomposition. Reported over BOTH configs: "doc2query + HyDE prompt" is
    // --- the decision-relevant one (nobody would adopt a reranker on top of a baseline nobody
    // --- would ship) and is the PRIMARY number; "shipped keywords" (today's production config) is
    // --- kept for contrast, since the gap between the two is itself an informative finding. ---
    for (const configName of ["doc2query + HyDE prompt", "shipped keywords"] as const) {
      const cfg = configs.find((c) => c.name === configName)!;
      const t1 = cfg.vecs[1].filter(Boolean).length;
      const f10 = cfg.vecs[10].filter(Boolean).length;
      console.log(
        `\n  Rerank ceiling (${configName}) — already #1: ${t1}/${n} (${((t1 / n) * 100).toFixed(1)}%)  addressable: ${f10 - t1} (${(((f10 - t1) / n) * 100).toFixed(1)}pp)  unreachable: ${n - f10} (${(((n - f10) / n) * 100).toFixed(1)}%)  ceiling: ${((f10 / n) * 100).toFixed(1)}%`,
      );
    }

    // --- BLOCKING calibration: at size 250 only, re-score doc2query configs against the
    // --- model-generated (non-templated) distractor doc2query set and report the delta. ---
    if (size === 250) {
      const doc2Calibrated = buildDoc2QueryIndex(realDescriptors, distractors, CALIBRATION_DOC2QUERY_250);
      const calibConfigs = [
        { name: "doc2query (blind) [CALIBRATED]", ...scoreConfig((c) => doc2Calibrated.search(c.query, 10).map((h) => h.id), meta) },
        { name: "doc2query+HyDE [CALIBRATED]", ...scoreConfig((c) => doc2Calibrated.search(HYDE_PROMPT_EXPANSIONS_V2[c.query]!, 10).map((h) => h.id), meta) },
      ];
      printTable(`  >>> CALIBRATION @ size 250: templated vs model-generated distractor doc2query <<<`, [
        { name: "doc2query (blind) [templated]", vecs: configs.find((c) => c.name === "doc2query (blind)")!.vecs },
        calibConfigs[0]!,
        { name: "doc2query+HyDE [templated]", vecs: configs.find((c) => c.name === "doc2query + HyDE prompt")!.vecs },
        calibConfigs[1]!,
      ], n);
      const templatedT1 = configs.find((c) => c.name === "doc2query (blind)")!.vecs[1].filter(Boolean).length;
      const calibratedT1 = calibConfigs[0]!.vecs[1].filter(Boolean).length;
      const deltaPP = ((templatedT1 - calibratedT1) / n) * 100;
      console.log(`\n  >>> CALIBRATION DELTA (top-1, doc2query blind): templated ${((templatedT1 / n) * 100).toFixed(1)}% vs calibrated ${((calibratedT1 / n) * 100).toFixed(1)}% => ${deltaPP >= 0 ? "+" : ""}${deltaPP.toFixed(1)}pp inflation from templating <<<\n`);
    }
  }

  // --- Cross-size ranking-stability / crossover summary ---
  console.log(`\n${"=".repeat(100)}`);
  console.log("CROSS-SIZE TOP-1 SUMMARY (does the approach ranking stay stable, or cross over?)");
  console.log(`${"=".repeat(100)}\n`);
  const names = acrossSizes[0]!.configs.map((c) => c.name);
  console.log(`  ${"approach".padEnd(28)}${SIZES.map((s) => `size ${s}`.padEnd(14)).join("")}`);
  for (const name of names) {
    const cells = acrossSizes.map(({ configs }) => {
      const cfg = configs.find((c) => c.name === name)!;
      const hits = cfg.vecs[1].filter(Boolean).length;
      return `${((hits / n) * 100).toFixed(0)}%`.padEnd(14);
    });
    console.log(`  ${name.padEnd(28)}${cells.join("")}`);
  }
  console.log();
}

run();
