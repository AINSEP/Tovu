/**
 * `src/server/routes/**` changed-file branch-coverage gate — job 2 of 2 (see
 * `check-route-coverage-floor.ts`'s header for job 1 and the shared audit/report context).
 *
 * The floor gate only holds the aggregate; it would NOT have caught the file that triggered the
 * 2026-08-16 audit (`admin/system/publish-credentials.ts`: 97.82% line, 71.93% branch — a rollup
 * gate absorbs one bad file, and the bug that shipped lived in the missing branch, not the missing
 * lines). This gate targets exactly that shape of regression: every route `.ts` file that is NEW or
 * MODIFIED relative to a base ref must individually hit >= 80% branch coverage, read from the same
 * `development/coverage/lcov.info` the floor gate reads (produced by `npm run test:cov`; this script
 * does not run tests itself).
 *
 * A changed file with NO lcov record at all (never loaded by any src/server test) fails outright —
 * that is the strongest possible "genuinely untested" signal (see `route-coverage-lib.ts`'s header
 * for why an *absent* record and a present record with `brf: 0` are different things and must not be
 * conflated: the latter means the file legitimately has no branches, which is vacuously 100%, not a
 * failure).
 *
 * Base ref resolution, in order: `ROUTE_COVERAGE_DIFF_BASE` env var, a positional CLI arg, else
 * `GITHUB_BASE_REF` (GitHub Actions sets this on `pull_request` events — a bare branch name like
 * "main", prefixed with `origin/` here since it isn't a ref by itself), else `origin/main`. Requires
 * a non-shallow checkout so the merge-base commit is actually present locally (ci.yml's checkout
 * step sets `fetch-depth: 0` for this reason).
 *
 * Usage: npx tsx development/scripts/check-route-coverage-diff.ts [baseRef]
 * Exit codes: 0 = every changed measurable route file is >= 80% branch (or none changed).
 *             1 = at least one changed file is below threshold or has no coverage record, or
 *             lcov.info is missing/unreadable, or the base ref can't be resolved (e.g. not fetched).
 */
import { execFileSync } from "node:child_process";
import { REPO_ROOT, isMeasurableRouteFile, loadRouteCoverage, pct } from "./route-coverage-lib";

const BRANCH_THRESHOLD = 80;

function resolveBaseRef(argv: string[]): string {
  const positional = argv[2];
  if (positional) return positional;
  if (process.env.ROUTE_COVERAGE_DIFF_BASE) return process.env.ROUTE_COVERAGE_DIFF_BASE;
  const ghBase = process.env.GITHUB_BASE_REF;
  if (ghBase) return ghBase.includes("/") ? ghBase : `origin/${ghBase}`;
  return "origin/main";
}

function changedRouteFiles(baseRef: string): string[] {
  let mergeBase: string;
  try {
    mergeBase = execFileSync("git", ["merge-base", baseRef, "HEAD"], { cwd: REPO_ROOT, encoding: "utf8" }).trim();
  } catch (err) {
    throw new Error(
      `could not compute merge-base against '${baseRef}' — is it fetched (needs fetch-depth: 0)? (${(err as Error).message})`
    );
  }
  const raw = execFileSync(
    "git",
    ["diff", "--name-only", "--diff-filter=ACMR", mergeBase, "HEAD", "--", "src/server/routes"],
    { cwd: REPO_ROOT, encoding: "utf8" }
  );
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && isMeasurableRouteFile(line));
}

function main(): void {
  const baseRef = resolveBaseRef(process.argv);
  const changed = changedRouteFiles(baseRef);

  if (changed.length === 0) {
    console.log(`check:route-coverage-diff — no measurable src/server/routes/** file changed vs ${baseRef}. OK`);
    return;
  }

  const coverageByFile = new Map(loadRouteCoverage().map((f) => [f.file, f]));
  const failures: string[] = [];

  console.log(`check:route-coverage-diff — ${changed.length} changed file(s) vs ${baseRef}, threshold ${BRANCH_THRESHOLD}% branch:`);
  for (const file of changed) {
    const cov = coverageByFile.get(file);
    if (!cov) {
      failures.push(`${file}: no coverage record (never loaded by any src/server test)`);
      console.log(`  FAIL  ${file}: no coverage record (never loaded by any src/server test)`);
      continue;
    }
    const branch = pct(cov.brh, cov.brf);
    const ok = branch >= BRANCH_THRESHOLD;
    console.log(`  ${ok ? "ok  " : "FAIL"}  ${file}: ${branch.toFixed(2)}% branch`);
    if (!ok) failures.push(`${file}: ${branch.toFixed(2)}% branch < ${BRANCH_THRESHOLD}%`);
  }

  if (failures.length > 0) {
    console.error(`\ncheck:route-coverage-diff — FAIL:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`\ncheck:route-coverage-diff — OK`);
}

main();
