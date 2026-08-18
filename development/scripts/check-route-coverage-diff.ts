/**
 * `src/server/routes/**` changed-file branch-coverage gate — job 2 of 2 (see
 * `check-route-coverage-floor.ts`'s header for job 1 and the shared audit/report context).
 *
 * The floor gate only holds the aggregate; it would NOT have caught the file that triggered the
 * 2026-08-16 audit (`admin/system/publish-credentials.ts`: 97.82% line, 71.93% branch — a rollup
 * gate absorbs one bad file, and the bug that shipped lived in the missing branch, not the missing
 * lines). This gate targets exactly that shape of regression: every route `.ts` file that is NEW or
 * MODIFIED relative to a base ref must individually hit branch-coverage bars on BOTH test tiers.
 *
 * ## Two-tier redesign (2026-08-18)
 *
 * A single combined threshold (the original 80%) let a file pass on integration coverage alone with
 * near-zero real unit coverage, or vice versa — a single push that only redirected import statements
 * (no behavior change) in 16 route files still tripped the old gate because 10 of those files were
 * already under 80% combined branch before the push even started (pre-existing debt the diff gate
 * wrongly attributed to that push, since the old gate only ever saw ONE lcov number per file and
 * could not distinguish "well-covered by unit tests, never touched by integration" from "genuinely
 * undertested"). This gate now reads TWO separate lcov files — `LCOV_UNIT_PATH` (produced by
 * `npm run test:cov:server:unit`) and `LCOV_INTEGRATION_PATH` (produced by
 * `npm run test:cov:server:integration`, see `route-coverage-lib.ts`'s `isIntegrationTestFile` for
 * the tier split) — and requires EACH changed file to independently clear:
 *   - unit branch coverage >= 99%
 *   - integration branch coverage >= 95%
 * Neither run touches `development/coverage/lcov.info` (still produced by `npm run test:cov:server`
 * for `check-route-coverage-floor.ts`, which this redesign deliberately leaves alone — see that
 * script's own header).
 *
 * A changed file's branch total (`brf`) is a static property of the source file, not of which test
 * tier happened to load it, so it should be identical in both lcov files whenever both have a record
 * for that file. `brf` is read from whichever tier's record is present (unit preferred when both
 * exist) to decide, once, whether the file has any branches at all:
 *   - Neither tier has ANY record for the file (never loaded by ANY src/server test at all): fail
 *     both tiers outright — the strongest possible "genuinely untested" signal.
 *   - The file genuinely has zero branches (`brf === 0` in whichever record exists): vacuously 100%
 *     on BOTH tiers, regardless of whether the other tier has a record at all (see
 *     `route-coverage-lib.ts`'s header for why an absent record and a present `brf: 0` record are
 *     different things, and why a 0-branch file cannot fail either bar — this is the existing
 *     distinction the original single-tier gate already made, preserved and applied per-tier here).
 *   - The file has real branches (`brf > 0`) but ONE tier has no record for it at all (e.g. a route
 *     only ever exercised by unit tests, never booted by an integration test): that tier reads as
 *     0% branch — a real failure on that tier's bar, not vacuous, per the file having provably
 *     nonzero branches nothing in that tier's run ever touched.
 *
 * Base ref resolution, in order: `ROUTE_COVERAGE_DIFF_BASE` env var, a positional CLI arg, else
 * `GITHUB_BASE_REF` (GitHub Actions sets this on `pull_request` events — a bare branch name like
 * "main", prefixed with `origin/` here since it isn't a ref by itself), else `GITHUB_EVENT_BEFORE`
 * (set from `github.event.before` on `push` events — the SHA the branch pointed at immediately
 * before this push, already a full ref so used as-is), else `origin/main`.
 *
 * The `GITHUB_EVENT_BEFORE` tier exists because of a real gap found 2026-08-17: this gate was
 * designed assuming it would only ever run meaningfully on `pull_request` events, with plain
 * `push` (no `GITHUB_BASE_REF`) falling through to `origin/main` as a documented near-no-op — true
 * only for a push TO `main` itself (base == HEAD's own history, nothing "changed"). Once the
 * workflow trigger widened to `push: branches: ["**"]`, a push to any long-lived feature branch
 * hit that same `origin/main` fallback instead, and a branch that diverged from `main` weeks ago
 * makes "changed vs `origin/main`" mean "every route file touched since the branch was cut" —
 * dozens of longstanding files, not this push's actual diff. `github.event.before` is the correct
 * base for a push event: it diffs exactly the commits this push introduced, which is what a
 * regression-catching gate on a feature branch should mean. Falls back to `origin/main` when
 * `before` is the all-zeros SHA (a brand-new branch's first push has no prior commit to diff from).
 *
 * Requires a non-shallow checkout so the merge-base commit is actually present locally (ci.yml's
 * checkout step sets `fetch-depth: 0` for this reason).
 *
 * Usage: npx tsx development/scripts/check-route-coverage-diff.ts [baseRef]
 * Exit codes: 0 = every changed measurable route file clears both tier bars (or none changed).
 *             1 = at least one changed file is below either tier's threshold or has no coverage
 *             record on either tier, or either lcov file is missing/unreadable, or the base ref
 *             can't be resolved (e.g. not fetched).
 */
import { execFileSync } from "node:child_process";
import {
  LCOV_INTEGRATION_PATH,
  LCOV_UNIT_PATH,
  REPO_ROOT,
  isMeasurableRouteFile,
  loadRouteCoverage,
  pct,
  type FileCoverage,
} from "./route-coverage-lib";

const UNIT_BRANCH_THRESHOLD = 99;
const INTEGRATION_BRANCH_THRESHOLD = 95;

export const ZERO_SHA = "0000000000000000000000000000000000000000";

export function resolveBaseRef(argv: string[]): string {
  const positional = argv[2];
  if (positional) return positional;
  if (process.env.ROUTE_COVERAGE_DIFF_BASE) return process.env.ROUTE_COVERAGE_DIFF_BASE;
  const ghBase = process.env.GITHUB_BASE_REF;
  if (ghBase) return ghBase.includes("/") ? ghBase : `origin/${ghBase}`;
  const eventBefore = process.env.GITHUB_EVENT_BEFORE;
  if (eventBefore && eventBefore !== ZERO_SHA) return eventBefore;
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

/** One tier's (unit or integration) verdict for a single file. `pctValue` is always a real number
 *  (never NaN) — 0 when the tier has no record at all, 100 when the file is vacuously branchless. */
export interface TierResult {
  ok: boolean;
  pctValue: number;
  detail: string;
}

export interface FileTierEvaluation {
  file: string;
  unit: TierResult;
  integration: TierResult;
  ok: boolean;
}

function tierResult(rec: FileCoverage | undefined, threshold: number, label: "unit" | "integration"): TierResult {
  if (!rec) return { ok: false, pctValue: 0, detail: `no ${label} coverage record` };
  const value = pct(rec.brh, rec.brf);
  return { ok: value >= threshold, pctValue: value, detail: `${value.toFixed(2)}% branch` };
}

/** Pure per-file tiering decision — see this file's header ("Two-tier redesign") for the full
 *  reasoning on the `brf === undefined` / `brf === 0` / `brf > 0` cases. Exported so the unit test
 *  can exercise every case directly without touching git or the filesystem. */
export function evaluateFileTiers(
  file: string,
  unitRec: FileCoverage | undefined,
  integrationRec: FileCoverage | undefined
): FileTierEvaluation {
  // brf is a static property of the source file (branch count from its AST), not of which tier's
  // test run happened to load it — so it should agree between both records whenever both exist.
  // Prefer the unit record (the primary/required tier) when both are present.
  const brf = unitRec?.brf ?? integrationRec?.brf;

  if (brf === undefined) {
    const detail = "no coverage record on either tier (never loaded by any src/server test)";
    return { file, unit: { ok: false, pctValue: 0, detail }, integration: { ok: false, pctValue: 0, detail }, ok: false };
  }
  if (brf === 0) {
    const detail = "0 branches in this file (vacuously passes both tiers)";
    return { file, unit: { ok: true, pctValue: 100, detail }, integration: { ok: true, pctValue: 100, detail }, ok: true };
  }
  const unit = tierResult(unitRec, UNIT_BRANCH_THRESHOLD, "unit");
  const integration = tierResult(integrationRec, INTEGRATION_BRANCH_THRESHOLD, "integration");
  return { file, unit, integration, ok: unit.ok && integration.ok };
}

function main(): void {
  const baseRef = resolveBaseRef(process.argv);
  const changed = changedRouteFiles(baseRef);

  if (changed.length === 0) {
    console.log(`check:route-coverage-diff — no measurable src/server/routes/** file changed vs ${baseRef}. OK`);
    return;
  }

  const unitByFile = new Map(loadRouteCoverage(LCOV_UNIT_PATH).map((f) => [f.file, f]));
  const integrationByFile = new Map(loadRouteCoverage(LCOV_INTEGRATION_PATH).map((f) => [f.file, f]));
  const failures: string[] = [];

  console.log(
    `check:route-coverage-diff — ${changed.length} changed file(s) vs ${baseRef}, ` +
      `thresholds: unit >= ${UNIT_BRANCH_THRESHOLD}% branch, integration >= ${INTEGRATION_BRANCH_THRESHOLD}% branch:`
  );
  for (const file of changed) {
    const { unit, integration, ok } = evaluateFileTiers(file, unitByFile.get(file), integrationByFile.get(file));
    console.log(`  ${ok ? "ok  " : "FAIL"}  ${file}: unit ${unit.detail}, integration ${integration.detail}`);
    if (!unit.ok) failures.push(`${file}: unit ${unit.detail} < ${UNIT_BRANCH_THRESHOLD}%`);
    if (!integration.ok) failures.push(`${file}: integration ${integration.detail} < ${INTEGRATION_BRANCH_THRESHOLD}%`);
  }

  if (failures.length > 0) {
    console.error(`\ncheck:route-coverage-diff — FAIL:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`\ncheck:route-coverage-diff — OK`);
}

// Guarded (see check-src-complexity-drift.ts's own comment on this idiom): this file is also
// imported as a plain module by its own unit test, which exercises resolveBaseRef directly
// without running the real git/coverage scan or risking a bare process.exit from this module.
if (require.main === module) {
  main();
}
