/**
 * Architecture metrics ratchet.
 *
 * WHY THIS EXISTS SEPARATELY FROM `check:boundaries`:
 * dependency-cruiser's built-in `no-circular` rule detects cycles between *files*. This repo has
 * only 2 of those — the file graph is essentially clean. What it does NOT detect is cycles between
 * *modules* (`src/<dir>`, with `src/features/<dir>` counted separately), or any of the other
 * structural questions that decide whether a module can ever be extracted into its own package:
 * how far a change propagates, whether anything imports the composition root, whether a module
 * has an enforced public surface, which files sit in the "core" that everything churns through,
 * and which modules are stable kernels vs. volatile edges. `check:boundaries` cannot express any
 * of this — it validates per-edge rules, not graph-shape metrics. See
 * `ADS-memory/reports/refactors/2026-08-02-module-graph-analysis.md` for the full derivation of
 * every metric below and the refactor plan that came out of it.
 *
 * This script supersedes `check:module-cycles` (module cycles + largest SCC is metric #3 below;
 * the logic is unchanged, just folded in) and adds five more metrics, each ratcheted independently
 * against a committed baseline:
 *
 *   1. Propagation cost      — mean fraction of the system reachable from a file (change amplification)
 *   2. Back-edges to `server`  — imports from outside the composition root into it (the actual defect)
 *   3. Module cycles / SCC   — mutual module cycles + largest strongly-connected component (extractability)
 *   4. API surface           — distinct files reached by a cross-module import that bypasses the target
 *                              module's `index.ts` (ratcheted); the raw edge count is reported alongside
 *                              as informational only — see the note on `deepImports()` below for why
 *   5. Core size             — files above-median in both transitive fan-in and fan-out (churn blast radius)
 *   6. Martin instability    — Ce/(Ca+Ce) per module; informational gradient, not ratcheted (see below)
 *
 * Test files are excluded by default. Port/adapter contract tests (`__tests__/repo.contract.test.ts`)
 * deliberately import concrete adapters to verify them against the port — a correct pattern that
 * would otherwise show up as a permanent violation. Pass `--include-tests` to see the full graph.
 *
 * Usage:
 *   npx tsx development/scripts/check-architecture.ts            # check against the baseline
 *   npx tsx development/scripts/check-architecture.ts --update   # rewrite the baseline
 *   npx tsx development/scripts/check-architecture.ts --list     # print full detail for every metric
 *
 * Exit codes: 0 = every ratcheted metric at or better than baseline, 1 = at least one regressed.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const BASELINE_PATH = path.join(__dirname, "check-architecture.baseline.json");

const INCLUDE_TESTS = process.argv.includes("--include-tests");
const UPDATE = process.argv.includes("--update");
const LIST = process.argv.includes("--list");

/** Percentage values are rounded before storage/comparison so legitimate float noise across
 * runs of an unrelated code change never trips the ratchet — only real, visible regressions do. */
const PCT_PRECISION = 2;
function roundPct(value: number): number {
  return Math.round(value * 10 ** PCT_PRECISION) / 10 ** PCT_PRECISION;
}

interface Baseline {
  meta: { fileCount: number; moduleCount: number };
  propagationCostPct: number;
  backEdgesIntoServer: number;
  moduleCycles: { mutualCycleCount: number; largestScc: number; pairs: string[] };
  /** RATCHETED. Distinct private files reachable from outside their own module — the actual public
   * API surface, and precisely what a package `exports` map would have to enumerate. */
  moduleApiSurfaceFiles: number;
  /** INFORMATIONAL, not ratcheted. Total cross-module edges bypassing `index.ts`. Useful for
   * locating where deep coupling concentrates, but wrong to block on: a second import into an
   * already-exposed file would fail the build without widening the surface at all. Exposing a NEW
   * private file is the thing that should fail, and that is `moduleApiSurfaceFiles`. */
  deepImportsBypassingIndex: number;
  coreSize: { count: number; total: number; pct: number };
}

/** `src/features/post/x.ts` → `features/post`; `src/seo/y.ts` → `seo`. */
function moduleOf(file: string): string | null {
  const parts = file.split("/");
  if (parts[0] !== "src" || parts.length < 2) return null;
  if (parts[1] === "features" && parts.length > 2) return `features/${parts[2]}`;
  return parts[1];
}

function isTestFile(file: string): boolean {
  return /__tests__|\.test\.|\.spec\./.test(file);
}

/** Tarjan's strongly-connected components. */
function stronglyConnectedComponents(adjacency: Map<string, Set<string>>): string[][] {
  let counter = 0;
  const index = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const components: string[][] = [];

  function strongConnect(node: string): void {
    index.set(node, counter);
    lowlink.set(node, counter);
    counter += 1;
    stack.push(node);
    onStack.add(node);

    for (const next of adjacency.get(node) ?? []) {
      if (!index.has(next)) {
        strongConnect(next);
        lowlink.set(node, Math.min(lowlink.get(node)!, lowlink.get(next)!));
      } else if (onStack.has(next)) {
        lowlink.set(node, Math.min(lowlink.get(node)!, index.get(next)!));
      }
    }

    if (lowlink.get(node) === index.get(node)) {
      const component: string[] = [];
      let member: string;
      do {
        member = stack.pop()!;
        onStack.delete(member);
        component.push(member);
      } while (member !== node);
      components.push(component.sort());
    }
  }

  for (const node of adjacency.keys()) {
    if (!index.has(node)) strongConnect(node);
  }
  return components;
}

interface CruiseModule {
  source: string;
  dependencies: { resolved: string }[];
}

/**
 * dependency-cruiser 18 is ESM-only (`exports` declares an `import` condition and no `require`),
 * and this package is `"type": "commonjs"` — importing it from a tsx-compiled CJS script fails with
 * ERR_PACKAGE_PATH_NOT_EXPORTED. Shelling out to its CLI is the same path `check:boundaries` already
 * uses and keeps this script independent of the library's module format.
 */
function cruise(): CruiseModule[] {
  const raw = execFileSync(
    "npx",
    [
      "depcruise",
      "src",
      "--no-config",
      "--ts-pre-compilation-deps",
      "--ts-config",
      "tsconfig.json",
      "--do-not-follow",
      "node_modules",
      "--output-type",
      "json",
    ],
    { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 512 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] },
  );
  return JSON.parse(raw).modules;
}

/**
 * File-level import graph, filtered per `--include-tests`. This single graph feeds every metric
 * below except Martin instability's module-level edge counts — one cruise, one graph, six views
 * on it, so the metrics can never disagree about what the codebase looks like.
 *
 * Scoped to `src/**` on both ends. `--ts-pre-compilation-deps` makes dependency-cruiser resolve
 * and record *every* file it walks into as its own "module" entry, including ones outside this
 * repo entirely: Node built-ins (`fs`, `crypto`, `node:test`, ...) and, because this repo's
 * `@jini-ai/*` dependencies are `file:../Jini/packages/*` workspace links rather than ordinary
 * `node_modules` packages, `--do-not-follow node_modules` doesn't stop it walking into the
 * sibling Jini repo's compiled `dist/*.js` output either. Left unfiltered, that pulled in 313
 * extra nodes (980 vs. the real 667 production files) and silently corrupted every metric that
 * runs a transitive-reachability BFS over "the system" — propagation cost and core size — since
 * both are direct functions of how many nodes exist and how far each file's imports reach into
 * them. Module-scoped metrics (cycles, deep imports, instability) were unaffected: they already
 * gate on `moduleOf()`, which returns `null` for anything outside `src/`.
 */
function buildFileGraph(modules: CruiseModule[]): Map<string, Set<string>> {
  const inScope = (file: string): boolean => file.startsWith("src/");
  const forward = new Map<string, Set<string>>();
  for (const mod of modules) {
    if (!inScope(mod.source)) continue;
    if (!INCLUDE_TESTS && isTestFile(mod.source)) continue;
    if (!forward.has(mod.source)) forward.set(mod.source, new Set());
    for (const dep of mod.dependencies) {
      if (!inScope(dep.resolved)) continue;
      if (!INCLUDE_TESTS && isTestFile(dep.resolved)) continue;
      if (dep.resolved === mod.source) continue;
      forward.get(mod.source)!.add(dep.resolved);
      if (!forward.has(dep.resolved)) forward.set(dep.resolved, new Set());
    }
  }
  return forward;
}

function reverseOf(forward: Map<string, Set<string>>): Map<string, Set<string>> {
  const reverse = new Map<string, Set<string>>();
  for (const node of forward.keys()) reverse.set(node, new Set());
  for (const [from, targets] of forward) {
    for (const to of targets) reverse.get(to)!.add(from);
  }
  return reverse;
}

/** Size of the transitive closure reachable from `start`, excluding `start` itself.
 * @complexity O(V + E) per call via index-pointer BFS (no `Array.shift`, which would make this
 * O(V) per dequeue and O(V^2) overall on a graph this size). */
function reachableCount(start: string, graph: Map<string, Set<string>>): number {
  const seen = new Set<string>([start]);
  const queue: string[] = [start];
  let head = 0;
  while (head < queue.length) {
    const current = queue[head++];
    for (const next of graph.get(current) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen.size - 1;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Metric 1 (propagation cost) and metric 5 (core size) share one BFS pass: both are functions of
 * transitive fan-out (propagation cost's numerator) and transitive fan-in (core size's other axis).
 * Computing them once and handing back both avoids running the same O(N·(V+E)) sweep twice.
 */
function propagationAndCore(forward: Map<string, Set<string>>): {
  propagationCostPct: number;
  coreSize: { count: number; total: number; pct: number };
} {
  const reverse = reverseOf(forward);
  const nodes = [...forward.keys()];
  const total = nodes.length;

  const fanOut = new Map<string, number>();
  const fanIn = new Map<string, number>();
  for (const node of nodes) {
    fanOut.set(node, reachableCount(node, forward));
    fanIn.set(node, reachableCount(node, reverse));
  }

  const meanReachableFraction =
    nodes.reduce((sum, node) => sum + fanOut.get(node)! / Math.max(total - 1, 1), 0) / total;

  const medianFanOut = median([...fanOut.values()]);
  const medianFanIn = median([...fanIn.values()]);
  const coreCount = nodes.filter((n) => fanOut.get(n)! > medianFanOut && fanIn.get(n)! > medianFanIn).length;

  return {
    propagationCostPct: roundPct(meanReachableFraction * 100),
    coreSize: { count: coreCount, total, pct: roundPct((coreCount / total) * 100) },
  };
}

/** Metric 2: import edges from any non-`server` production file into any `src/server/**` file.
 * Grouped by target file, since that is what makes the count actionable — see the analysis
 * report's finding that 22 of these land on the single `RouteDeps` god type. */
function backEdgesIntoServer(forward: Map<string, Set<string>>): { total: number; byTarget: Map<string, number> } {
  const byTarget = new Map<string, number>();
  for (const [from, targets] of forward) {
    if (moduleOf(from) === "server") continue;
    for (const to of targets) {
      if (!to.startsWith("src/server/")) continue;
      byTarget.set(to, (byTarget.get(to) ?? 0) + 1);
    }
  }
  const total = [...byTarget.values()].reduce((a, b) => a + b, 0);
  return { total, byTarget };
}

/** Metric 4: cross-module edges whose resolved target isn't the target module's `index.ts` —
 * i.e. imports that reach past whatever public surface a module has declared. */
function deepImports(
  forward: Map<string, Set<string>>,
): { total: number; byModule: Map<string, { edges: number; files: Set<string> }> } {
  const byModule = new Map<string, { edges: number; files: Set<string> }>();
  let total = 0;
  for (const [from, targets] of forward) {
    const fromModule = moduleOf(from);
    if (!fromModule) continue;
    for (const to of targets) {
      const toModule = moduleOf(to);
      if (!toModule || toModule === fromModule) continue;
      if (to === `src/${toModule}/index.ts`) continue;
      total += 1;
      if (!byModule.has(toModule)) byModule.set(toModule, { edges: 0, files: new Set() });
      const entry = byModule.get(toModule)!;
      entry.edges += 1;
      entry.files.add(to);
    }
  }
  return { total, byModule };
}

/** Metric 3: same module-level graph and Tarjan pass as the former `check:module-cycles`. */
function buildModuleAdjacency(forward: Map<string, Set<string>>): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>();
  for (const [from, targets] of forward) {
    const fromModule = moduleOf(from);
    if (!fromModule) continue;
    if (!adjacency.has(fromModule)) adjacency.set(fromModule, new Set());
    for (const to of targets) {
      const toModule = moduleOf(to);
      if (!toModule || toModule === fromModule) continue;
      adjacency.get(fromModule)!.add(toModule);
      if (!adjacency.has(toModule)) adjacency.set(toModule, new Set());
    }
  }
  return adjacency;
}

function mutualPairs(adjacency: Map<string, Set<string>>): string[] {
  const pairs: string[] = [];
  for (const [from, targets] of adjacency) {
    for (const to of targets) {
      if (from < to && adjacency.get(to)?.has(from)) pairs.push(`${from} <-> ${to}`);
    }
  }
  return pairs.sort();
}

/** Metric 6 (informational, not ratcheted): Martin instability I = Ce/(Ca+Ce) per module.
 * There is no single "good" value for this one — it's read as a gradient, not a pass/fail
 * threshold: a stable kernel sits near 0 (heavily depended-on, few outgoing deps of its own),
 * a composition layer sits near 1 (depends on everything, nothing depends back). Ratcheting a
 * single number here would fight the shape the architecture is supposed to have. */
function martinInstability(
  forward: Map<string, Set<string>>,
): { module: string; ca: number; ce: number; instability: number }[] {
  const ca = new Map<string, number>();
  const ce = new Map<string, number>();
  const modules = new Set<string>();
  for (const [from, targets] of forward) {
    const fromModule = moduleOf(from);
    if (!fromModule) continue;
    modules.add(fromModule);
    for (const to of targets) {
      const toModule = moduleOf(to);
      if (!toModule || toModule === fromModule) continue;
      modules.add(toModule);
      ce.set(fromModule, (ce.get(fromModule) ?? 0) + 1);
      ca.set(toModule, (ca.get(toModule) ?? 0) + 1);
    }
  }
  return [...modules]
    .map((module) => {
      const Ca = ca.get(module) ?? 0;
      const Ce = ce.get(module) ?? 0;
      return { module, ca: Ca, ce: Ce, instability: Ca + Ce === 0 ? 0 : Ce / (Ca + Ce) };
    })
    .sort((a, b) => a.instability - b.instability);
}

/** Ratchet comparison for a single "lower is better" numeric metric. */
type Verdict = "regressed" | "improved" | "same";
function compare(current: number, baseline: number): Verdict {
  if (current === baseline) return "same";
  return current > baseline ? "regressed" : "improved";
}

function pad(label: string, width: number): string {
  return label.length >= width ? label : label + " ".repeat(width - label.length);
}

function main(): void {
  const modules = cruise();
  const forward = buildFileGraph(modules);
  const fileCount = forward.size;

  const { propagationCostPct, coreSize } = propagationAndCore(forward);
  const backEdges = backEdgesIntoServer(forward);
  const deep = deepImports(forward);
  const apiSurfaceFiles = [...deep.byModule.values()].reduce((sum, e) => sum + e.files.size, 0);
  const moduleAdjacency = buildModuleAdjacency(forward);
  const pairs = mutualPairs(moduleAdjacency);
  const sccs = stronglyConnectedComponents(moduleAdjacency).filter((c) => c.length > 1);
  const largestScc = sccs.reduce((max, c) => Math.max(max, c.length), 0);
  const instability = martinInstability(forward);

  const current: Baseline = {
    meta: { fileCount, moduleCount: moduleAdjacency.size },
    propagationCostPct,
    backEdgesIntoServer: backEdges.total,
    moduleCycles: { mutualCycleCount: pairs.length, largestScc, pairs },
    moduleApiSurfaceFiles: apiSurfaceFiles,
    deepImportsBypassingIndex: deep.total,
    coreSize,
  };

  const scope = INCLUDE_TESTS ? "including tests" : "production files only";
  console.log(`check:architecture — ${fileCount} files, ${moduleAdjacency.size} modules, ${scope}\n`);

  const rows: { label: string; value: string }[] = [
    { label: "propagation cost", value: `${propagationCostPct.toFixed(2)}%` },
    { label: "back-edges into composition root", value: `${backEdges.total}` },
    { label: "module cycles (mutual pairs)", value: `${pairs.length}` },
    { label: "largest strongly-connected component", value: `${largestScc}` },
    { label: "module API surface (files exposed)", value: `${apiSurfaceFiles}` },
    { label: "  └ deep-import edges (informational)", value: `${deep.total}` },
    { label: "core size", value: `${coreSize.pct.toFixed(2)}% (${coreSize.count}/${coreSize.total})` },
  ];
  const labelWidth = Math.max(...rows.map((r) => r.label.length)) + 2;
  for (const row of rows) console.log(`  ${pad(row.label, labelWidth)}${row.value}`);
  console.log(`\n  Martin instability: informational, not ratcheted — pass --list for the per-module gradient.`);

  if (LIST) {
    console.log(`\n--- back-edges into src/server/**, by target file ---`);
    for (const [target, count] of [...backEdges.byTarget.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${count} → ${target}`);
    }

    console.log(`\n--- module cycles ---`);
    for (const pair of pairs) console.log(`    ${pair}`);
    if (sccs.length > 0) {
      console.log(`\n  strongly-connected components (mutually inseparable modules):`);
      for (const component of sccs.sort((a, b) => b.length - a.length)) {
        console.log(`    [${component.length}] ${component.join(", ")}`);
      }
    }

    console.log(`\n--- deep imports bypassing index.ts, by target module ---`);
    for (const [mod, entry] of [...deep.byModule.entries()].sort((a, b) => b[1].edges - a[1].edges)) {
      console.log(`    ${entry.edges} edges, ${entry.files.size} distinct file(s) → ${mod}`);
    }

    console.log(`\n--- Martin instability (stable → unstable) ---`);
    for (const row of instability) {
      console.log(
        `    I=${row.instability.toFixed(2)}  Ca=${String(row.ca).padStart(4)} Ce=${String(row.ce).padStart(4)}  ${row.module}`,
      );
    }
  }

  if (UPDATE) {
    fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(current, null, 2)}\n`);
    console.log(`\nBaseline written to ${path.relative(REPO_ROOT, BASELINE_PATH)}.`);
    return;
  }

  if (!fs.existsSync(BASELINE_PATH)) {
    console.error(`\nNo baseline at ${path.relative(REPO_ROOT, BASELINE_PATH)}. Run with --update to create one.`);
    process.exit(1);
  }

  const baseline: Baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));

  const introducedPairs = pairs.filter((p) => !baseline.moduleCycles.pairs.includes(p));
  const removedPairs = baseline.moduleCycles.pairs.filter((p) => !pairs.includes(p));
  const sccVerdict = compare(largestScc, baseline.moduleCycles.largestScc);
  const cyclesRegressed = introducedPairs.length > 0 || sccVerdict === "regressed";
  const cyclesImproved = (removedPairs.length > 0 || sccVerdict === "improved") && !cyclesRegressed;

  const checks: { label: string; verdict: Verdict; current: number; baseline: number }[] = [
    { label: "propagation cost", verdict: compare(propagationCostPct, baseline.propagationCostPct), current: propagationCostPct, baseline: baseline.propagationCostPct },
    { label: "back-edges into composition root", verdict: compare(backEdges.total, baseline.backEdgesIntoServer), current: backEdges.total, baseline: baseline.backEdgesIntoServer },
    // The API-surface metric ratchets on DISTINCT EXPOSED FILES, not on edge count. Adding a
    // second import to an already-exposed file does not widen a module's public surface and must
    // not fail the build; exposing a file that was previously private must. `deepImportsBypassing-
    // Index` is recorded in the baseline and printed, but deliberately not checked here.
    { label: "module API surface (files exposed)", verdict: compare(apiSurfaceFiles, baseline.moduleApiSurfaceFiles), current: apiSurfaceFiles, baseline: baseline.moduleApiSurfaceFiles },
    { label: "core size", verdict: compare(coreSize.pct, baseline.coreSize.pct), current: coreSize.pct, baseline: baseline.coreSize.pct },
  ];

  const regressed = checks.filter((c) => c.verdict === "regressed");
  const improved = checks.filter((c) => c.verdict === "improved");

  if (introducedPairs.length > 0) {
    console.error(`\n  module cycles — ${introducedPairs.length} new pair(s) introduced:`);
    for (const pair of introducedPairs) console.error(`    + ${pair}`);
  }
  if (sccVerdict === "regressed") {
    console.error(`\n  largest strongly-connected component grew: ${baseline.moduleCycles.largestScc} → ${largestScc}`);
  }
  if (removedPairs.length > 0) {
    console.log(`\n  module cycles — ${removedPairs.length} pair(s) removed since baseline:`);
    for (const pair of removedPairs) console.log(`    - ${pair}`);
  }
  if (sccVerdict === "improved") {
    console.log(`\n  largest strongly-connected component shrank: ${baseline.moduleCycles.largestScc} → ${largestScc}`);
  }

  for (const check of regressed) {
    console.error(`\n  ${check.label} regressed: ${check.baseline} → ${check.current}`);
  }
  for (const check of improved) {
    console.log(`\n  ${check.label} improved: ${check.baseline} → ${check.current}`);
  }

  if (regressed.length > 0 || cyclesRegressed) {
    console.error(
      `\ncheck:architecture — FAILED: ${regressed.length + (cyclesRegressed ? 1 : 0)} metric(s) regressed against the baseline.`,
    );
    console.error(`Either fix the regression or, if genuinely intended, run with --update to move the baseline.`);
    process.exit(1);
  }

  if (improved.length > 0 || cyclesImproved) {
    console.log(`\ncheck:architecture — OK, and ahead of baseline. Run with --update to lock in the improvement.`);
    return;
  }

  console.log(`\ncheck:architecture — OK: at baseline.`);
}

main();
