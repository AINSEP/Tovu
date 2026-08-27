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
 *   1. Propagation cost      — mean fraction of the system reachable from a file (change amplification).
 *                              Computed on BOTH graphs (2026-08-17, Sol's step 5): all-import (change
 *                              coupling — a type-only edit still forces a `tsc` re-check) and
 *                              runtime/value-only (circular-load risk — `import type` edges are erased
 *                              by `tsc` and can't participate in a real load cycle). See
 *                              `buildFileGraph()`'s own doc comment for the full split rationale.
 *   2. Back-edges to `server`  — imports from outside the composition root into it (the actual defect).
 *                              All-import graph, with `src/index.ts`/`src/cli/**` excluded as the
 *                              composition root's own legitimate callers (Sol's step 5c); the same
 *                              count on the runtime-only graph is reported alongside as informational.
 *   3. Module cycles / SCC   — mutual module cycles + largest strongly-connected component
 *                              (extractability). Runtime/value-only graph ONLY (2026-08-17): a
 *                              type-only mutual pair can never actually deadlock a `require`/ESM load.
 *   4. API surface           — distinct files reached by a cross-module import that bypasses the target
 *                              module's `index.ts` (ratcheted); the raw edge count is reported alongside
 *                              as informational only — see the note on `deepImports()` below for why.
 *                              All-import graph — a module's declared surface doesn't shrink because a
 *                              caller only needed a type from it.
 *   5. Bidirectional hub count — files above-median in BOTH transitive fan-in and transitive
 *                              fan-out (churn blast radius). All-import graph, same reasoning as
 *                              propagation cost above. Renamed from "core size" 2026-08-19 — that
 *                              name read as "files under `src/contracts/core`", but the check never looks at
 *                              `moduleOf()` or any directory at all; it is a bidirectional-hub
 *                              detector over the whole file graph, with no membership list printed
 *                              even under `--list`. That made every claim about "the core" in
 *                              `ADS-memory/reports/swarm-consensus/runs/2026-08-19-tovu-architecture-redesign-consensus.md`
 *                              unfalsifiable. `--list` now prints every hub file with its owning
 *                              module, transitive fan-in, and transitive fan-out; the enumeration
 *                              is also committed at
 *                              `ADS-memory/reports/architecture/2026-08-19-bidirectional-hub-census.md`.
 *   6. Martin instability    — Ce/(Ca+Ce) per module; informational gradient, not ratcheted (see below).
 *                              All-import graph.
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

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
const BASELINE_PATH = path.join(import.meta.dirname, "check-architecture.baseline.json");

const INCLUDE_TESTS = process.argv.includes("--include-tests");
const UPDATE = process.argv.includes("--update");
const LIST = process.argv.includes("--list");

/** Percentage values are rounded before storage/comparison so legitimate float noise across
 * runs of an unrelated code change never trips the ratchet — only real, visible regressions do. */
const PCT_PRECISION = 2;
function roundPct(value: number): number {
  return Math.round(value * 10 ** PCT_PRECISION) / 10 ** PCT_PRECISION;
}

/**
 * HARD CONSTRAINTS vs RATCHETS.
 *
 * Every ratcheted metric is currently gated identically: any regression fails the build, and
 * the only way out is `--update`, which just moves the baseline and launders the regression.
 * That treats "propagation cost got worse" and "API surface got worse" as equally serious,
 * which they are not for this repo:
 *
 *   - HARD CONSTRAINTS measure coupling — the real cost paid on every future change to this
 *     codebase (propagation cost, module cycles, largest strongly-connected component). These
 *     must never regress; regressing them makes the codebase measurably harder to change.
 *   - RATCHETS measure hygiene — module API surface and bidirectional hub count are a proxy
 *     for discipline, not a cost anyone pays today, because nothing under `src/` is a published
 *     package: nobody
 *     imports `src/features/forms/` the way an npm consumer imports a package's `exports` map. A
 *     regression here is a signal worth fixing, not a reason to break the build.
 *
 * NOTE — this classification is specific to Tovu's `src/`. For the Jini packages (a separate
 * repo, published as real npm packages), the inversion holds: there, API surface *is* the
 * public contract callers depend on, so it would belong in the hard-constraint set instead.
 * Do not copy this classification into a check-architecture script for a published package
 * without re-deriving it for that repo.
 *
 * "back-edges into composition root" is classified HARD below by inference, not by explicit
 * instruction — flag this for confirmation before relying on it. It is not a surface-hygiene
 * concern like API surface or bidirectional hub count; this file's own top-of-file comment already calls it
 * "the actual defect" (an import reaching into `src/server/**` from outside it), which is a
 * structural coupling violation in the same family as propagation cost and module cycles.
 *
 * Flip `ENFORCE_HARD_CONSTRAINT_TIERS` to `true` to make only `HARD_CONSTRAINT_METRICS` able to
 * fail the build; a `RATCHET_METRICS` regression then prints as a non-blocking WARNING instead
 * of failing. Left `false`, every metric below is equally load-bearing — today's behavior,
 * unchanged, so turning tiers on is an explicit opt-in rather than a silent side effect of this
 * change.
 */
/**
 * TURNED ON 2026-08-19, and the two sets below were SWAPPED at the same time, because a day of
 * real firings showed the original classification was inverted relative to which metrics actually
 * carry signal:
 *
 * | metric                     | fired | real? |
 * |----------------------------|-------|-------|
 * | module API surface (count) | 1     | YES — caught `theme-static-assets.ts` importing a
 * |                            |       | 1134-line module for one string constant (8f65d911),
 * |                            |       | fixed in code, not baselined away.
 * | propagation cost (pct) x2  | 2     | NO  — both pure denominator artifacts.
 * | core size (pct)            | 2     | NO  — same artifacts; on the second one its PERCENTAGE
 * |                            |       | regressed while its COUNT improved 149 -> 139.
 *
 * The percentage metrics are the noisy ones, and the reason is structural, not incidental: they
 * are ratios over the file graph, so ANY change in file count moves them for reasons unrelated to
 * coupling. Deleting dead files raises them — the gate penalizes cleanup, which is backwards. Both
 * false alarms this session came from deletions (ARCH-001 scratch dirs, then the mui-marketing
 * test theme), and each cost a `--update` that a reader six months from now would reasonably
 * mistake for someone quietly widening the budget.
 *
 * So: count-based structural metrics BLOCK; ratio-based ones WARN. `bidirectional hub count`
 * additionally now ratchets on `bidirectionalHubs.count`, not `bidirectionalHubs.pct` — the count
 * is the number that means "how much of this repo is a structural chokepoint", and it is immune
 * to denominator drift. (Renamed from `core size` / `coreSize` 2026-08-19 — same field shape, same
 * values, new name; see the metric-5 doc comment at the top of this file for why.)
 *
 * TO PUT PROPAGATION COST / BIDIRECTIONAL HUB COUNT BACK ON THE BLOCKING PATH: move their labels from
 * `RATCHET_METRICS` to `HARD_CONSTRAINT_METRICS` below. Nothing else needs to change — they are
 * still computed, still printed, still compared, still `--update`d. The only difference is whether
 * a regression exits non-zero. Do that once the ratio metrics stop moving on file-count churn (or
 * once they are reworked to be denominator-stable).
 */
const ENFORCE_HARD_CONSTRAINT_TIERS = true;

type MetricTier = "hard" | "ratchet";

const HARD_CONSTRAINT_METRICS = new Set<string>([
  // Count-based and denominator-stable: a regression here is a real new coupling edge, not graph
  // arithmetic. `module API surface` is here on this session's evidence (see the table above).
  "module API surface (files exposed)",
  "back-edges into composition root",
  "module cycles / SCC (runtime-only)",
]);

const RATCHET_METRICS = new Set<string>([
  // Ratio-based: move whenever the file count moves. Warn-only until denominator-stable.
  "propagation cost (all-import)",
  "propagation cost (runtime-only)",
  "bidirectional hub count",
]);

/** Fail-safe default: a metric absent from both sets above is treated as `"hard"` so a newly
 * added ratcheted metric can't silently stop blocking the build just because nobody classified
 * it yet — the omission is loud (a printed warning on every run), not silent. */
function tierOf(label: string): MetricTier {
  if (HARD_CONSTRAINT_METRICS.has(label)) return "hard";
  if (RATCHET_METRICS.has(label)) return "ratchet";
  console.error(`  [check:architecture] "${label}" is not classified as hard or ratchet — defaulting to hard.`);
  return "hard";
}

interface Baseline {
  meta: { fileCount: number; moduleCount: number };
  /** All-import graph (change coupling): mean transitive reachability including `import type`
   * edges. Same semantics this field has always had — kept on the all-import graph because a
   * type-only edit still forces `tsc` to re-check every importer. */
  propagationCostPct: number;
  /** NEW (2026-08-17, Sol's step 5). Runtime/value-only graph (circular-load risk): same
   * computation, `import type`-only edges excluded. This is the number that actually bounds how
   * far a runtime change can ripple via `require`/ESM loads. */
  propagationCostRuntimePct: number;
  /** All-import graph, `isOuterCompositionCaller()` files excluded (Sol's step 5c). */
  backEdgesIntoServer: number;
  /** INFORMATIONAL, not ratcheted. Same edges, runtime/value-only graph — shows how much of
   * `backEdgesIntoServer` is real coupling vs. type-only (e.g. `RouteDeps`) signature noise. */
  backEdgesIntoServerRuntimeOnly: number;
  /** NOW computed on the runtime/value-only graph (2026-08-17, Sol's step 5) — a mutual cycle or
   * SCC membership here is a real `require`/ESM-load risk. Type-only cycles (common through
   * `RouteDeps` and similar shared signature types) no longer count; see `isTypeOnlyDependency()`. */
  moduleCycles: { mutualCycleCount: number; largestScc: number; pairs: string[] };
  /** RATCHETED. Distinct private files reachable from outside their own module — the actual public
   * API surface, and precisely what a package `exports` map would have to enumerate. All-import
   * graph — a module's declared surface doesn't get smaller just because a caller only needed a
   * type from it. */
  moduleApiSurfaceFiles: number;
  /** INFORMATIONAL, not ratcheted. Total cross-module edges bypassing `index.ts`. Useful for
   * locating where deep coupling concentrates, but wrong to block on: a second import into an
   * already-exposed file would fail the build without widening the surface at all. Exposing a NEW
   * private file is the thing that should fail, and that is `moduleApiSurfaceFiles`. */
  deepImportsBypassingIndex: number;
  /** All-import graph — churn blast radius is a change-coupling concept, same reasoning as
   * `propagationCostPct`. Files above-median in BOTH transitive fan-in and transitive fan-out —
   * a bidirectional structural hub, not a test of `src/contracts/core` (or any directory) membership.
   * Renamed from `coreSize` 2026-08-19; same shape, same values.
   *
   * `medians` is FROZEN at `--update` time and reused on every subsequent check (added 2026-08-20).
   * Before that, both medians were recomputed fresh each run, which made this the only count-based
   * metric here whose *threshold* moved between baseline and check — every other one applies a fixed
   * rule (`moduleApiSurfaceFiles` asks "is this index.ts?", the same question forever). A floating
   * threshold wearing count-based framing produced two measured inversions, both reproduced against
   * this exact graph and written up in
   * `ADS-memory/reports/architecture/2026-08-20-hub-decomposition-hypotheses.md`:
   *
   *   - splitting `server/routes/types.ts` — the RouteDeps god-type this file's own header calls
   *     "the actual defect" — scored 151 → 179 (a 28-point REGRESSION) floating, vs 141 → 119
   *     (a correct improvement) frozen. The gate was telling a reader to revert a correct fix.
   *   - routing all 279 deep imports through their target `index.ts` scored 151 → 45 (a huge
   *     apparent WIN) floating, vs 141 → 261 frozen — and that same mutation roughly doubles
   *     `propagationCostPct`, 11.62% → 24.38%, which is a hard-constraint metric. The gate was
   *     endorsing a change that would fail the build on a metric that can actually block.
   *
   * Mechanism: removing a large glue node collapses overall reachability so broadly that the median
   * falls faster than most individual files' degree does, so MORE files clear a LOWER bar even
   * though the graph is objectively less tangled. Freezing removes the inversion entirely.
   *
   * Trade-off, stated honestly: a frozen bar stops self-normalizing as the repo grows organically,
   * so it needs periodic re-baselining — the same cost every other count-based metric here already
   * pays. `--update` re-freezes it. Absent (older baselines) → falls back to fresh medians with a
   * warning, so this change cannot silently alter a verdict. */
  bidirectionalHubs: { count: number; total: number; pct: number; medians?: { fanIn: number; fanOut: number } };
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
  dependencies: { resolved: string; dependencyTypes: string[] }[];
}

/** True for an edge that is ONLY an `import type { X } from "..."` — erased by `tsc`, never
 * emitted into the built JS, and therefore incapable of participating in a real runtime
 * require/import cycle. dependency-cruiser's `--ts-pre-compilation-deps` tags these in
 * `dependencyTypes` (confirmed empirically: `npx depcruise <file> --ts-pre-compilation-deps
 * --output-type json` on a known `import type`-only edge returns
 * `dependencyTypes: ["local", "type-only", "import"]`). A mixed import
 * (`import { foo, type Bar } from "./x"`) carries a real value too, so it is NOT type-only here. */
function isTypeOnlyDependency(dep: { dependencyTypes: string[] }): boolean {
  return dep.dependencyTypes.includes("type-only");
}

/** `src/index.ts` (the package entrypoint) and everything under `src/cli/**` are callers OF the
 * composition root, not violations of it — they are meant to reach into `src/server/**` to boot
 * or drive it. Counting their edges in `back-edges into composition root` conflates "the
 * composition root's own front door" with "a feature module reaching past its boundary", which is
 * the actual defect that metric exists to catch (Sol's step 5c). */
function isOuterCompositionCaller(file: string): boolean {
  return file === "src/index.ts" || file.startsWith("src/cli/");
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
 * File-level import graph, filtered per `--include-tests`. TWO of these are built from the SAME
 * `cruise()` result — one cruise, two graphs, so the metrics can never disagree about what the
 * codebase looks like even though they now answer two different questions (Sol's step 5):
 *
 *   - `{ runtimeOnly: false }` (all-import): every edge, including `import type`-only ones. This
 *     is the CHANGE-COUPLING graph — propagation cost and bidirectional hub count use it, because
 *     a type-only
 *     edit still forces `tsc` to re-check every importing file, and API surface / deep-import
 *     hygiene are about what a module's contract exposes regardless of whether a caller uses it
 *     for a type or a value.
 *   - `{ runtimeOnly: true }` (runtime/value-only): `import type`-only edges dropped. This is the
 *     CIRCULAR-LOAD-RISK graph — module cycles / SCC use it, because a type-only edge is erased by
 *     `tsc` and can never participate in a real `require`/ESM-load cycle. Mixing the two into one
 *     graph (the pre-2026-08-17 shape of this function) is why `RouteDeps`-style type-only imports
 *     (e.g. `features/deployments/tool-registrations.ts` importing `RouteDeps` for a signature)
 *     inflated the same SCC number as a genuine runtime coupling.
 *
 * Scoped to `src/**` on both ends. `--ts-pre-compilation-deps` makes dependency-cruiser resolve
 * and record *every* file it walks into as its own "module" entry, including ones outside this
 * repo entirely: Node built-ins (`fs`, `crypto`, `node:test`, ...) and, because this repo's
 * `@jini-ai/*` dependencies are `file:../Jini/packages/*` workspace links rather than ordinary
 * `node_modules` packages, `--do-not-follow node_modules` doesn't stop it walking into the
 * sibling Jini repo's compiled `dist/*.js` output either. Left unfiltered, that pulled in 313
 * extra nodes (980 vs. the real 667 production files) and silently corrupted every metric that
 * runs a transitive-reachability BFS over "the system" — propagation cost and bidirectional hub
 * count — since
 * both are direct functions of how many nodes exist and how far each file's imports reach into
 * them. Module-scoped metrics (cycles, deep imports, instability) were unaffected: they already
 * gate on `moduleOf()`, which returns `null` for anything outside `src/`.
 */
function buildFileGraph(modules: CruiseModule[], opts: { runtimeOnly: boolean }): Map<string, Set<string>> {
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
      if (opts.runtimeOnly && isTypeOnlyDependency(dep)) continue;
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
 * Metric 1 (propagation cost) and metric 5 (bidirectional hub count) share one BFS pass: both are
 * functions of transitive fan-out (propagation cost's numerator) and transitive fan-in (the hub
 * count's other axis). Computing them once and handing back both avoids running the same
 * O(N·(V+E)) sweep twice. Also returns `hubMembers` — every file that clears both medians, with
 * its owning module and both degree numbers — so `--list` can print real membership instead of
 * just a count (2026-08-19; see the metric-5 doc comment at the top of this file for why that
 * mattered).
 */
type HubDegrees = { fanIn: Map<string, number>; fanOut: Map<string, number> };

/** Applies a fan-in/fan-out threshold pair to already-computed degrees. Split out from
 * `propagationAndHubs()` so the ratchet can re-threshold against the baseline's FROZEN medians
 * without paying for a second O(N·(V+E)) BFS sweep — see `Baseline.bidirectionalHubs`'s comment for
 * why the threshold is frozen at all. */
function hubsAtThresholds(
  degrees: HubDegrees,
  thresholds: { fanIn: number; fanOut: number },
): {
  bidirectionalHubs: { count: number; total: number; pct: number; medians: { fanIn: number; fanOut: number } };
  hubMembers: { file: string; module: string | null; fanIn: number; fanOut: number }[];
} {
  const nodes = [...degrees.fanOut.keys()];
  const total = nodes.length;
  const hubNodes = nodes.filter(
    (n) => degrees.fanOut.get(n)! > thresholds.fanOut && degrees.fanIn.get(n)! > thresholds.fanIn,
  );
  // Sorted by combined degree (fan-in + fan-out) descending, tie-broken by path — the files that
  // sit at the busiest structural chokepoints read first.
  const hubMembers = hubNodes
    .map((file) => ({ file, module: moduleOf(file), fanIn: degrees.fanIn.get(file)!, fanOut: degrees.fanOut.get(file)! }))
    .sort((a, b) => b.fanIn + b.fanOut - (a.fanIn + a.fanOut) || a.file.localeCompare(b.file));

  return {
    bidirectionalHubs: {
      count: hubNodes.length,
      total,
      pct: roundPct((hubNodes.length / total) * 100),
      medians: thresholds,
    },
    hubMembers,
  };
}

function propagationAndHubs(forward: Map<string, Set<string>>): {
  propagationCostPct: number;
  degrees: HubDegrees;
  /** Medians of THIS graph. Written to the baseline by `--update`; on a plain check the baseline's
   * frozen medians take precedence. */
  freshMedians: { fanIn: number; fanOut: number };
  bidirectionalHubs: { count: number; total: number; pct: number; medians: { fanIn: number; fanOut: number } };
  hubMembers: { file: string; module: string | null; fanIn: number; fanOut: number }[];
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

  const degrees: HubDegrees = { fanIn, fanOut };
  const freshMedians = { fanIn: median([...fanIn.values()]), fanOut: median([...fanOut.values()]) };

  return {
    propagationCostPct: roundPct(meanReachableFraction * 100),
    degrees,
    freshMedians,
    ...hubsAtThresholds(degrees, freshMedians),
  };
}

/** Metric 2: import edges from any non-`server` production file into any `src/server/**` file.
 * Grouped by target file, since that is what makes the count actionable — see the analysis
 * report's finding that 22 of these land on the single `RouteDeps` god type. Excludes
 * `isOuterCompositionCaller()` files (`src/index.ts`, `src/cli/**`) — they are the composition
 * root's own legitimate front door, not a feature module reaching past its boundary. */
function backEdgesIntoServer(forward: Map<string, Set<string>>): { total: number; byTarget: Map<string, number> } {
  const byTarget = new Map<string, number>();
  for (const [from, targets] of forward) {
    if (moduleOf(from) === "server") continue;
    if (isOuterCompositionCaller(from)) continue;
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

/** Ratchet comparison for a single "lower is better" numeric metric. A `baseline` that is missing
 * or not a finite number (a metric newly added to `Baseline` since the committed baseline was last
 * written) can never count as a regression — there is nothing to have regressed against — but it
 * is loudly `console.warn`ed rather than silently treated as "same", so a genuinely new ratcheted
 * metric doesn't slip in without a `--update` before its first real comparison. */
type Verdict = "regressed" | "improved" | "same";
function compare(current: number, baseline: number, label?: string): Verdict {
  if (!Number.isFinite(baseline)) {
    if (label) console.warn(`\n  WARNING: "${label}" has no baseline value yet — run --update. Treating as improved.`);
    return "improved";
  }
  if (current === baseline) return "same";
  return current > baseline ? "regressed" : "improved";
}

function pad(label: string, width: number): string {
  return label.length >= width ? label : label + " ".repeat(width - label.length);
}

/** Formats a metric's baseline→current move for the trade report: the raw delta in the metric's
 * own unit, plus the relative percent change. Both are shown because they read very differently
 * on the same number — "+5 points" on a percentage metric is a much bigger deal than "+5%" on a
 * count, and only the relative figure makes that comparable across metrics of different units. */
function formatDelta(current: number, baseline: number, unit: "pct" | "count"): string {
  if (!Number.isFinite(baseline)) {
    const currentStr = unit === "pct" ? current.toFixed(2) : `${current}`;
    return `(no prior baseline) → ${currentStr}`;
  }
  const rawDelta = unit === "pct" ? roundPct(current - baseline) : current - baseline;
  const deltaStr = `${rawDelta > 0 ? "+" : ""}${rawDelta}${unit === "pct" ? " pts" : ""}`;
  const relPct = baseline === 0 ? null : roundPct((rawDelta / Math.abs(baseline)) * 100);
  const relStr = relPct === null ? "n/a" : `${relPct > 0 ? "+" : ""}${relPct}%`;
  const valueStr = unit === "pct" ? `${baseline.toFixed(2)} → ${current.toFixed(2)}` : `${baseline} → ${current}`;
  return `${valueStr}  (${deltaStr}, ${relStr})`;
}

function main(): void {
  const modules = cruise();
  // One cruise, two graphs — see `buildFileGraph()`'s own doc comment for what each is for.
  const forwardAll = buildFileGraph(modules, { runtimeOnly: false });
  const forwardRuntime = buildFileGraph(modules, { runtimeOnly: true });
  const fileCount = forwardAll.size;

  const {
    propagationCostPct,
    degrees: hubDegrees,
    bidirectionalHubs: freshHubs,
    hubMembers: freshHubMembers,
  } = propagationAndHubs(forwardAll);
  const { propagationCostPct: propagationCostRuntimePct } = propagationAndHubs(forwardRuntime);

  // Hub thresholds are FROZEN in the baseline — see `Baseline.bidirectionalHubs` for the two
  // measured inversions that motivated this. Loaded here, before any reporting, so the printed
  // number and the ratchet verdict are the same number. `--update` deliberately uses the FRESH
  // medians: that is what re-freezing the bar means.
  const priorBaseline: Baseline | null = fs.existsSync(BASELINE_PATH)
    ? (JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8")) as Baseline)
    : null;
  const frozenMedians = priorBaseline?.bidirectionalHubs?.medians ?? null;
  const useFrozen = !UPDATE && frozenMedians !== null;
  if (!UPDATE && priorBaseline !== null && frozenMedians === null) {
    console.warn(
      `\n  WARNING: baseline predates frozen hub medians — falling back to this run's own medians,\n` +
        `  which is the pre-2026-08-20 floating-threshold behaviour. Run --update to freeze them.`,
    );
  }
  const { bidirectionalHubs, hubMembers } = useFrozen
    ? hubsAtThresholds(hubDegrees, frozenMedians!)
    : { bidirectionalHubs: freshHubs, hubMembers: freshHubMembers };
  const backEdges = backEdgesIntoServer(forwardAll);
  const backEdgesRuntime = backEdgesIntoServer(forwardRuntime);
  const deep = deepImports(forwardAll);
  const apiSurfaceFiles = [...deep.byModule.values()].reduce((sum, e) => sum + e.files.size, 0);
  // Module cycles / SCC: runtime-only graph (2026-08-17) — see `Baseline.moduleCycles`'s doc comment.
  const moduleAdjacency = buildModuleAdjacency(forwardRuntime);
  const pairs = mutualPairs(moduleAdjacency);
  const sccs = stronglyConnectedComponents(moduleAdjacency).filter((c) => c.length > 1);
  const largestScc = sccs.reduce((max, c) => Math.max(max, c.length), 0);
  const instability = martinInstability(forwardAll);

  const current: Baseline = {
    meta: { fileCount, moduleCount: moduleAdjacency.size },
    propagationCostPct,
    propagationCostRuntimePct,
    backEdgesIntoServer: backEdges.total,
    backEdgesIntoServerRuntimeOnly: backEdgesRuntime.total,
    moduleCycles: { mutualCycleCount: pairs.length, largestScc, pairs },
    moduleApiSurfaceFiles: apiSurfaceFiles,
    deepImportsBypassingIndex: deep.total,
    // FRESH hubs + fresh medians on purpose: `current` is only ever written by `--update`, and
    // re-freezing the threshold to this graph is exactly what an update is meant to do.
    bidirectionalHubs: freshHubs,
  };

  const scope = INCLUDE_TESTS ? "including tests" : "production files only";
  console.log(`check:architecture — ${fileCount} files, ${moduleAdjacency.size} modules, ${scope}\n`);

  const rows: { label: string; value: string }[] = [
    { label: "propagation cost (all-import)", value: `${propagationCostPct.toFixed(2)}%` },
    { label: "propagation cost (runtime-only)", value: `${propagationCostRuntimePct.toFixed(2)}%` },
    { label: "back-edges into composition root", value: `${backEdges.total}` },
    { label: "  └ back-edges, runtime-only (informational)", value: `${backEdgesRuntime.total}` },
    { label: "module cycles (mutual pairs, runtime-only)", value: `${pairs.length}` },
    { label: "largest strongly-connected component (runtime-only)", value: `${largestScc}` },
    { label: "module API surface (files exposed)", value: `${apiSurfaceFiles}` },
    { label: "  └ deep-import edges (informational)", value: `${deep.total}` },
    { label: "bidirectional hub count", value: `${bidirectionalHubs.pct.toFixed(2)}% (${bidirectionalHubs.count}/${bidirectionalHubs.total})` },
  ];
  const labelWidth = Math.max(...rows.map((r) => r.label.length)) + 2;
  for (const row of rows) console.log(`  ${pad(row.label, labelWidth)}${row.value}`);
  console.log(`\n  Martin instability: informational, not ratcheted — pass --list for the per-module gradient.`);

  if (LIST) {
    console.log(`\n--- back-edges into src/server/**, by target file (all-import) ---`);
    for (const [target, count] of [...backEdges.byTarget.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${count} → ${target}`);
    }

    console.log(`\n--- same, runtime-only (informational — shows which of the above are real coupling vs. type-only noise) ---`);
    for (const [target, count] of [...backEdgesRuntime.byTarget.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${count} → ${target}`);
    }

    console.log(`\n--- module cycles (runtime-only graph) ---`);
    for (const pair of pairs) console.log(`    ${pair}`);
    if (sccs.length > 0) {
      console.log(`\n  strongly-connected components (mutually inseparable modules):`);
      for (const component of sccs.sort((a, b) => b.length - a.length)) {
        console.log(`    [${component.length}] ${component.join(", ")}`);
      }
    }

    console.log(`\n--- deep imports bypassing index.ts, by target module (all-import) ---`);
    for (const [mod, entry] of [...deep.byModule.entries()].sort((a, b) => b[1].edges - a[1].edges)) {
      console.log(`    ${entry.edges} edges, ${entry.files.size} distinct file(s) → ${mod}`);
    }

    console.log(`\n--- Martin instability (stable → unstable, all-import) ---`);
    for (const row of instability) {
      console.log(
        `    I=${row.instability.toFixed(2)}  Ca=${String(row.ca).padStart(4)} Ce=${String(row.ce).padStart(4)}  ${row.module}`,
      );
    }

    // Membership for "bidirectional hub count" (formerly "core size") — every file above-median in
    // BOTH transitive fan-in and transitive fan-out, all-import graph. Printing this was the whole
    // point of the 2026-08-19 rename: the old name implied `src/contracts/core` membership, but nothing about
    // the check ever tested that, and no version of this script printed which files it counted.
    console.log(`\n--- bidirectional hubs (fan-in > median AND fan-out > median, all-import), by combined degree ---`);
    for (const hub of hubMembers) {
      console.log(
        `    fanIn=${String(hub.fanIn).padStart(4)} fanOut=${String(hub.fanOut).padStart(4)}  [${hub.module ?? "(no module)"}]  ${hub.file}`,
      );
    }

    console.log(`\n--- bidirectional hub membership by module ---`);
    const hubsByModule = new Map<string, number>();
    for (const hub of hubMembers) {
      const key = hub.module ?? "(no module)";
      hubsByModule.set(key, (hubsByModule.get(key) ?? 0) + 1);
    }
    for (const [mod, count] of [...hubsByModule.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${count}  ${mod}`);
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

  const baseline: Baseline = priorBaseline!;

  const introducedPairs = pairs.filter((p) => !baseline.moduleCycles.pairs.includes(p));
  const removedPairs = baseline.moduleCycles.pairs.filter((p) => !pairs.includes(p));
  const sccVerdict = compare(largestScc, baseline.moduleCycles.largestScc);
  const cyclesRegressed = introducedPairs.length > 0 || sccVerdict === "regressed";
  const cyclesImproved = (removedPairs.length > 0 || sccVerdict === "improved") && !cyclesRegressed;

  const cyclesLabel = "module cycles / SCC (runtime-only)";
  const cyclesTier = tierOf(cyclesLabel);
  const cyclesTradeDetail =
    [
      introducedPairs.length > 0 ? `+${introducedPairs.length} cycle pair(s)` : null,
      removedPairs.length > 0 ? `-${removedPairs.length} cycle pair(s)` : null,
      sccVerdict !== "same" ? `largest SCC ${baseline.moduleCycles.largestScc} → ${largestScc}` : null,
    ]
      .filter((s): s is string => s !== null)
      .join(", ") || "no change";

  const checks: { label: string; verdict: Verdict; current: number; baseline: number; unit: "pct" | "count"; tier: MetricTier }[] = [
    { label: "propagation cost (all-import)", verdict: compare(propagationCostPct, baseline.propagationCostPct), current: propagationCostPct, baseline: baseline.propagationCostPct, unit: "pct", tier: tierOf("propagation cost (all-import)") },
    { label: "propagation cost (runtime-only)", verdict: compare(propagationCostRuntimePct, baseline.propagationCostRuntimePct, "propagation cost (runtime-only)"), current: propagationCostRuntimePct, baseline: baseline.propagationCostRuntimePct, unit: "pct", tier: tierOf("propagation cost (runtime-only)") },
    { label: "back-edges into composition root", verdict: compare(backEdges.total, baseline.backEdgesIntoServer), current: backEdges.total, baseline: baseline.backEdgesIntoServer, unit: "count", tier: tierOf("back-edges into composition root") },
    // The API-surface metric ratchets on DISTINCT EXPOSED FILES, not on edge count. Adding a
    // second import to an already-exposed file does not widen a module's public surface and must
    // not fail the build; exposing a file that was previously private must. `deepImportsBypassing-
    // Index` is recorded in the baseline and printed, but deliberately not checked here.
    { label: "module API surface (files exposed)", verdict: compare(apiSurfaceFiles, baseline.moduleApiSurfaceFiles), current: apiSurfaceFiles, baseline: baseline.moduleApiSurfaceFiles, unit: "count", tier: tierOf("module API surface (files exposed)") },
    // Ratchets on COUNT, not PCT (changed 2026-08-19 — see the tier block at the top of this file).
    // `bidirectionalHubs.pct` is a ratio over the whole file graph, so deleting unrelated dead files
    // raises it while the hub set itself shrinks: on the mui-marketing removal the pct "regressed"
    // 17.05 -> 16.13 in the wrong direction of interest while the count genuinely improved
    // 149 -> 139. The count is what "how much of this repo is a structural chokepoint" actually
    // means, and it does not move when the denominator does. `pct` is still computed, printed, and
    // stored in the baseline — it is just no longer the ratcheted value. (Field and label renamed
    // from `coreSize` / "core size" 2026-08-19; same numbers, see the metric-5 doc comment at the
    // top of this file for why.)
    { label: "bidirectional hub count", verdict: compare(bidirectionalHubs.count, baseline.bidirectionalHubs.count), current: bidirectionalHubs.count, baseline: baseline.bidirectionalHubs.count, unit: "count", tier: tierOf("bidirectional hub count") },
  ];

  const regressed = checks.filter((c) => c.verdict === "regressed");
  const improved = checks.filter((c) => c.verdict === "improved");

  // Under ENFORCE_HARD_CONSTRAINT_TIERS=false (today's default) these are identical to
  // `regressed`/`cyclesRegressed` — nothing here changes gating unless the owner opts in.
  const blockingRegressed = ENFORCE_HARD_CONSTRAINT_TIERS ? regressed.filter((c) => c.tier === "hard") : regressed;
  const warnOnlyRegressed = ENFORCE_HARD_CONSTRAINT_TIERS ? regressed.filter((c) => c.tier === "ratchet") : [];
  const blockingCyclesRegressed = ENFORCE_HARD_CONSTRAINT_TIERS ? cyclesRegressed && cyclesTier === "hard" : cyclesRegressed;
  const warnOnlyCyclesRegressed = ENFORCE_HARD_CONSTRAINT_TIERS ? cyclesRegressed && cyclesTier === "ratchet" : false;

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
    if (warnOnlyRegressed.includes(check)) {
      console.warn(`\n  WARNING (ratchet, non-blocking): ${check.label} regressed: ${check.baseline} → ${check.current}`);
    } else {
      console.error(`\n  ${check.label} regressed: ${check.baseline} → ${check.current}`);
    }
  }
  for (const check of improved) {
    console.log(`\n  ${check.label} improved: ${check.baseline} → ${check.current}`);
  }

  // TRADE DETECTED: this run moved metrics in both directions. This is easy to miss in the
  // per-metric lines above — e.g. a barrel-file cleanup that shrinks API surface while raising
  // propagation cost is a net loss on the metric that actually costs something, but reads as
  // "3 improved, 1 regressed" if you're skimming. Make that unmissable.
  const hasTrade = (regressed.length > 0 || cyclesRegressed) && (improved.length > 0 || cyclesImproved);
  if (hasTrade) {
    const tradeLines: { verdict: "regressed" | "improved"; label: string; detail: string }[] = [
      ...regressed.map((c) => ({ verdict: "regressed" as const, label: c.label, detail: formatDelta(c.current, c.baseline, c.unit) })),
      ...(cyclesRegressed ? [{ verdict: "regressed" as const, label: cyclesLabel, detail: cyclesTradeDetail }] : []),
      ...improved.map((c) => ({ verdict: "improved" as const, label: c.label, detail: formatDelta(c.current, c.baseline, c.unit) })),
      ...(cyclesImproved ? [{ verdict: "improved" as const, label: cyclesLabel, detail: cyclesTradeDetail }] : []),
    ];
    const tradeLabelWidth = Math.max(...tradeLines.map((l) => l.label.length)) + 2;
    const bar = "=".repeat(72);
    console.error(`\n${bar}`);
    console.error(`  TRADE DETECTED — this run bought improvement on one metric with regression on another`);
    console.error(bar);
    for (const line of tradeLines) {
      const tag = line.verdict === "regressed" ? "regressed:" : "improved: ";
      console.error(`  ${tag} ${pad(line.label, tradeLabelWidth)}${line.detail}`);
    }
    console.error(bar);
  }

  const totalBlocking = blockingRegressed.length + (blockingCyclesRegressed ? 1 : 0);

  if (totalBlocking > 0) {
    console.error(
      `\ncheck:architecture — FAILED: ${totalBlocking} metric(s) regressed against ${ENFORCE_HARD_CONSTRAINT_TIERS ? "a hard constraint" : "the baseline"}.`,
    );
    console.error(`Either fix the regression or, if genuinely intended, run with --update to move the baseline.`);
    process.exit(1);
  }

  if (ENFORCE_HARD_CONSTRAINT_TIERS && (warnOnlyRegressed.length > 0 || warnOnlyCyclesRegressed)) {
    const warnCount = warnOnlyRegressed.length + (warnOnlyCyclesRegressed ? 1 : 0);
    console.warn(
      `\ncheck:architecture — OK: hard constraints hold, but ${warnCount} ratchet metric(s) regressed. Not blocking, but worth fixing before it compounds.`,
    );
    return;
  }

  if (improved.length > 0 || cyclesImproved) {
    console.log(`\ncheck:architecture — OK, and ahead of baseline. Run with --update to lock in the improvement.`);
    return;
  }

  console.log(`\ncheck:architecture — OK: at baseline.`);
}

main();
