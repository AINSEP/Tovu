/**
 * `src/server/routes/**` coverage FLOOR gate — job 1 of 2 from the 2026-08-16 route-coverage-gates
 * task (see ADS-memory/reports/2026-08-16-server-routes-coverage-complexity-audit.md for the audit
 * that triggered this, and .../2026-08-16-route-coverage-gates.md for exactly how these thresholds
 * were chosen). Job 2 is `check-route-coverage-diff.ts` — read that file's header for why the floor
 * alone is not enough.
 *
 * Reads `development/coverage/lcov.info` (produced by `npm run test:cov`; this script does not run
 * tests itself — see `route-coverage-lib.ts`'s header, including the Node test-file-name-collision
 * bug that `test:cov` now works around) and fails if the aggregate line/branch/func % across every
 * measurable `src/server/routes/**` file drops below the floor.
 *
 * Thresholds are set a few points under the 2026-08-16 measured baseline — line 92.15%, branch
 * 73.86%, funcs 97.52% (corrected for the Node bug above; see the report for the raw lcov sums) — so
 * this gate is GREEN today and only fails on real backsliding, not on noise. It is deliberately the
 * coarse net: an aggregate floor absorbs one badly-tested new file (e.g.
 * `admin/newsletter/update-campaign.ts` sits at 42.9% branch today while this aggregate reads
 * 73.86%) — `check-route-coverage-diff.ts` is the gate that catches that shape of regression.
 *
 * Usage: npx tsx development/scripts/check-route-coverage-floor.ts
 * Exit codes: 0 = at/above floor on all three axes. 1 = below floor on at least one, or lcov.info
 * is missing/unreadable.
 */
import { loadRouteCoverage, pct } from "./route-coverage-lib";

const FLOOR = { line: 88, branch: 68, funcs: 93 };

function main(): void {
  const files = loadRouteCoverage();
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

  console.log(`check:route-coverage-floor — ${files.length} measurable src/server/routes/** files`);
  console.log(`  line:   ${line.toFixed(2)}% (floor ${FLOOR.line}%)`);
  console.log(`  branch: ${branch.toFixed(2)}% (floor ${FLOOR.branch}%)`);
  console.log(`  funcs:  ${funcs.toFixed(2)}% (floor ${FLOOR.funcs}%)`);

  const failures: string[] = [];
  if (line < FLOOR.line) failures.push(`line ${line.toFixed(2)}% < floor ${FLOOR.line}%`);
  if (branch < FLOOR.branch) failures.push(`branch ${branch.toFixed(2)}% < floor ${FLOOR.branch}%`);
  if (funcs < FLOOR.funcs) failures.push(`funcs ${funcs.toFixed(2)}% < floor ${FLOOR.funcs}%`);

  if (failures.length > 0) {
    console.error(`check:route-coverage-floor — FAIL:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`check:route-coverage-floor — OK`);
}

main();
