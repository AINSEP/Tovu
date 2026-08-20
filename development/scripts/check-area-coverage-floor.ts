/**
 * Per-area coverage FLOOR gate — the generalization of `check-route-coverage-floor.ts` past
 * `src/server/routes/**`, which was the ONLY subtree of this repo with a coverage gate before
 * 2026-08-20. See `ADS-memory/reports/2026-08-20-server-assistant-coverage-complexity-baseline.md`
 * for the measurement that motivated it.
 *
 * ## Why per-area AGGREGATE, and not per-file
 *
 * A per-file floor flags genuinely well-tested code. Two files in the 2026-08-20 measurement read
 * "short" only because a branch was legitimately covered from a different directory by documented
 * convention. An aggregate absorbs that; `check-route-coverage-diff.ts` is the gate that catches
 * the shape a floor cannot (one badly-tested new file hiding inside a healthy average). This file
 * is deliberately the coarse net, exactly as the route floor is.
 *
 * ## ⚠️ Floors MUST be captured from a FULL `npm run test:cov` run, never a scoped one
 *
 * This is the trap that makes a naive version of this gate wrong. Files in one area are routinely
 * exercised by tests living in another, so a scoped run UNDERSTATES coverage. Measured directly on
 * `src/server/http/site/render.ts`, 2026-08-20:
 *
 *   test set run                                line    branch   funcs
 *   src/server/** + src/assistant/** only       82.4%   81.8%    59.6%
 *   src/features/theme/** only                  82.5%   59.7%    20.1%
 *
 * Neither set alone is the truth and the union is higher than either. A floor captured from the
 * first run would fail on code the second run proves is tested. `npm run test:cov` runs every test
 * under `src` plus every package's own tests, which is the honest denominator. (Their glob is not
 * written out here: it contains a star-slash sequence that would close this comment block.)
 *
 * **Set `TEST_CONCURRENCY=2` when producing that lcov.** Unbounded, the suite fans out one worker
 * per CPU, peaks at 5.4 GB, gets OOM-killed and orphans children (see `ci-local.sh`'s MEMORY
 * WARNING). At concurrency 2 the same run peaks around 1.4 GB.
 *
 * ## Node's lcov is the denominator of record
 *
 * `npx c8` source-maps more accurately but disagrees with node on the counts (168 vs 119 branches
 * on one identical file), and every gate here parses node's lcov. A c8 percentage is NOT comparable
 * to a floor in this file. Note also that lcov has no separate "statement" record — `DA:` lines ARE
 * statement coverage, so `line` here is what other tools call Stmts.
 *
 * Usage: npx tsx development/scripts/check-area-coverage-floor.ts
 * Exit codes: 0 = every configured area is at/above its floor on all three axes.
 *             1 = at least one area is below floor, has no measurable files, or the floors file is
 *                 missing/empty/unparseable.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { loadLcov, pct, REPO_ROOT, type FileCoverage } from "./route-coverage-lib.js";

const FLOORS_PATH = path.join(import.meta.dirname, "area-coverage-floors.json");

interface AreaFloor {
  readonly prefix: string;
  readonly line: number;
  readonly branch: number;
  readonly funcs: number;
}

interface FloorsFile {
  readonly _comment?: string;
  readonly areas: readonly AreaFloor[];
}

/**
 * Same exclusion rules `isMeasurableRouteFile` applies, lifted off its hardcoded route prefix:
 * co-located test files, and this repo's established type-only convention basenames. A type-only
 * file has no executable lines, so counting it would drag every percentage toward zero for reasons
 * unrelated to testing. A type-only file under a name not in this set is not recognized and would
 * read as a false failure — add it here if one appears.
 */
export function isMeasurableAreaFile(relPath: string, prefix: string): boolean {
  const normalized = relPath.split(path.sep).join("/");
  if (!normalized.startsWith(prefix)) return false;
  if (normalized.includes("/__tests__/")) return false;
  if (normalized.includes("/__measurements__/")) return false;
  if (/\.(test|spec)\.tsx?$/.test(normalized)) return false;
  const base = path.basename(normalized);
  return base !== "deps.ts" && base !== "execution-deps.ts" && base !== "types.ts";
}

interface AreaResult {
  readonly area: AreaFloor;
  readonly count: number;
  readonly line: number;
  readonly branch: number;
  readonly funcs: number;
  readonly failures: readonly string[];
}

export function evaluateArea(area: AreaFloor, all: readonly FileCoverage[]): AreaResult {
  const files = all.filter((f) => isMeasurableAreaFile(f.file, area.prefix));
  let lf = 0,
    lh = 0,
    brf = 0,
    brh = 0,
    fnf = 0,
    fnh = 0;
  for (const f of files) {
    lf += f.lf;
    lh += f.lh;
    brf += f.brf;
    brh += f.brh;
    fnf += f.fnf;
    fnh += f.fnh;
  }
  const line = pct(lh, lf);
  const branch = pct(brh, brf);
  const funcs = pct(fnh, fnf);

  const failures: string[] = [];
  // Zero measurable files is never a legitimate pass. `pct()`'s 0-found-is-100% convention is
  // correct for one file with no branches, but for a whole configured area it means the lcov is
  // empty, truncated, or the prefix no longer matches anything (a directory got renamed). Without
  // this check that reads as a clean 100% on all three axes -- the exact shape of a gate that
  // silently stops gating.
  if (files.length === 0) {
    failures.push(
      `0 measurable files matched "${area.prefix}" -- lcov is empty/truncated, or the prefix is stale (directory renamed?)`
    );
  } else {
    if (line < area.line) failures.push(`line ${line.toFixed(2)}% < floor ${area.line}%`);
    if (branch < area.branch) failures.push(`branch ${branch.toFixed(2)}% < floor ${area.branch}%`);
    if (funcs < area.funcs) failures.push(`funcs ${funcs.toFixed(2)}% < floor ${area.funcs}%`);
  }
  return { area, count: files.length, line, branch, funcs, failures };
}

function readFloors(): FloorsFile {
  let raw: string;
  try {
    raw = readFileSync(FLOORS_PATH, "utf8");
  } catch {
    console.error(
      `check:area-coverage-floor — FAIL: ${path.relative(REPO_ROOT, FLOORS_PATH)} is missing. ` +
        `Capture it from a full \`TEST_CONCURRENCY=2 npm run test:cov\` run before wiring this gate in.`
    );
    process.exit(1);
  }
  const parsed = JSON.parse(raw) as FloorsFile;
  if (!Array.isArray(parsed.areas) || parsed.areas.length === 0) {
    // Deliberately a FAILURE, not a quiet pass. A gate that exits 0 when it has nothing configured
    // is indistinguishable from a gate that is working, which is how an unwired gate ends up in
    // ci:local reporting green forever.
    console.error(
      `check:area-coverage-floor — FAIL: no areas configured in ${path.relative(REPO_ROOT, FLOORS_PATH)}. ` +
        `An unconfigured floor gate must not report success.`
    );
    process.exit(1);
  }
  return parsed;
}

function main(): void {
  const { areas } = readFloors();
  const all = loadLcov();
  const results = areas.map((area) => evaluateArea(area, all));

  for (const r of results) {
    const status = r.failures.length === 0 ? "OK" : "FAIL";
    console.log(`  [${status}] ${r.area.prefix} — ${r.count} files`);
    console.log(
      `         line ${r.line.toFixed(2)}% (>=${r.area.line})  ` +
        `branch ${r.branch.toFixed(2)}% (>=${r.area.branch})  ` +
        `funcs ${r.funcs.toFixed(2)}% (>=${r.area.funcs})`
    );
  }

  const failed = results.filter((r) => r.failures.length > 0);
  if (failed.length > 0) {
    console.error(`check:area-coverage-floor — FAIL: ${failed.length} area(s) below floor:`);
    for (const r of failed) {
      for (const f of r.failures) console.error(`  - ${r.area.prefix}: ${f}`);
    }
    process.exit(1);
  }
  console.log(`check:area-coverage-floor — OK — ${results.length} area(s) at or above floor`);
}

main();
