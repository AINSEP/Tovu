/**
 * Coverage-gap triage for `src/server/routes/**` — answers "is this file failing the coverage gate
 * because it's badly structured, or just because nobody wrote the test yet?" without a human (or an
 * agent) having to read the code and decide by hand.
 *
 * Cross-references two signals this repo already produces separately:
 *   - `check-route-coverage-diff.ts`'s per-file tier evaluation (`evaluateFileTiers`) against
 *     `LCOV_UNIT_PATH`/`LCOV_INTEGRATION_PATH` — same thresholds, same edge cases (0-branch files,
 *     missing records), reused rather than reimplemented so this can never silently drift from what
 *     the real gate enforces.
 *   - `check-src-complexity-drift.ts`'s live `findViolations()` — current ESLint `complexity` +
 *     `sonarjs/cognitive-complexity` scan of the same scope, hard-ceiling 9/9. Live, not the frozen
 *     `src-complexity-debt.json` snapshot, so a file fixed for complexity earlier tonight doesn't
 *     misreport as still-complex.
 *
 * A file that fails either coverage tier gets one of two labels:
 *   - ARCHITECTURE_DEBT: also appears in the live complexity scan. The coverage gap is a downstream
 *     symptom — too many branches crammed into one function — not a missing-test problem. Route to
 *     a refactor pass; writing more tests here fights the structure instead of fixing it.
 *   - TEST_GAP: complexity is clean. Nothing about the code makes it hard to test; a test just
 *     doesn't exist yet for that path. Route straight to test-writing.
 *
 * A third, softer note: small files (branch count under 40) that land in TEST_GAP get a
 * `phantomTaxPlausible` flag. The 2026-08-18 coverage audit found the esbuild CJS-interop shim
 * injects exactly 2 permanently-zero-hit branches into every file — on a small file that alone can
 * cost 5-10 points, making literal 100% unreachable regardless of test quality. This is a hint to
 * check `DA:` hit counts before writing more tests chasing an unreachable number, not a verdict —
 * see `route-coverage-lib.ts`'s header and this repo's own coverage audit for the full finding.
 *
 * This is a diagnostic report, not a gate — it always exits 0. `check-route-coverage-diff.ts`
 * already blocks CI on the raw numbers; this script only helps decide what to do about a failure.
 *
 * Usage: npx tsx development/scripts/classify-coverage-gaps.ts
 * Env overrides (for validating against a scoped/synthetic lcov pair without touching the shared
 * `development/coverage/` files another process may be writing):
 *   CLASSIFY_UNIT_LCOV, CLASSIFY_INTEGRATION_LCOV
 */
import {
  LCOV_INTEGRATION_PATH,
  LCOV_UNIT_PATH,
  loadRouteCoverage,
  type FileCoverage,
} from "./route-coverage-lib";
import { evaluateFileTiers, type FileTierEvaluation } from "./check-route-coverage-diff";
import { findViolations } from "./check-src-complexity-drift";

const PHANTOM_TAX_BRANCH_CEILING = 40;

export type GapLabel = "ARCHITECTURE_DEBT" | "TEST_GAP";

export interface GapClassification {
  file: string;
  label: GapLabel;
  evaluation: FileTierEvaluation;
  complexityReasons: string[];
  phantomTaxPlausible: boolean;
}

/** Pure classification step, kept separate from the file-loading `main()` so it's testable without
 *  touching disk or running ESLint. */
export function classifyGaps(
  evaluations: readonly FileTierEvaluation[],
  complexityByFile: ReadonlyMap<string, string[]>,
  brfByFile: ReadonlyMap<string, number>
): GapClassification[] {
  const out: GapClassification[] = [];
  for (const evaluation of evaluations) {
    if (evaluation.ok) continue;
    const reasons = complexityByFile.get(evaluation.file) ?? [];
    const brf = brfByFile.get(evaluation.file) ?? 0;
    out.push({
      file: evaluation.file,
      label: reasons.length > 0 ? "ARCHITECTURE_DEBT" : "TEST_GAP",
      evaluation,
      complexityReasons: reasons,
      phantomTaxPlausible: reasons.length === 0 && brf > 0 && brf < PHANTOM_TAX_BRANCH_CEILING,
    });
  }
  return out;
}

function main(): void {
  const unitPath = process.env.CLASSIFY_UNIT_LCOV ?? LCOV_UNIT_PATH;
  const integrationPath = process.env.CLASSIFY_INTEGRATION_LCOV ?? LCOV_INTEGRATION_PATH;

  const unitRecords = loadRouteCoverage(unitPath);
  const integrationRecords = loadRouteCoverage(integrationPath);
  const unitByFile = new Map(unitRecords.map((f) => [f.file, f]));
  const integrationByFile = new Map(integrationRecords.map((f) => [f.file, f]));
  const brfByFile = new Map<string, number>();
  for (const rec of [...unitRecords, ...integrationRecords]) {
    if (!brfByFile.has(rec.file)) brfByFile.set(rec.file, rec.brf);
  }

  console.log(`classify-coverage-gaps — running live complexity scan (npx eslint, src/server/routes)...`);
  const violations = findViolations();
  const complexityByFile = new Map<string, string[]>();
  for (const v of violations) {
    const list = complexityByFile.get(v.file) ?? [];
    list.push(`[${v.rule}] ${v.reason}`);
    complexityByFile.set(v.file, list);
  }

  // Union with complexity-violation files, not just the two lcov files: a file with NO test at all
  // (never `require`/imported by any test run) never gets an lcov record on either tier, so it would
  // otherwise be invisible here — exactly the worst case (complex AND literally untested) this script
  // most needs to surface. `evaluateFileTiers` already treats "no record on either tier" as a real
  // failure (see check-route-coverage-diff.ts's header), so this just makes sure it gets evaluated.
  const allFiles = new Set<string>([...unitByFile.keys(), ...integrationByFile.keys(), ...complexityByFile.keys()]);
  const evaluations = [...allFiles].map((file) => evaluateFileTiers(file, unitByFile.get(file), integrationByFile.get(file)));

  const gaps = classifyGaps(evaluations, complexityByFile, brfByFile);
  const architectureDebt = gaps.filter((g) => g.label === "ARCHITECTURE_DEBT");
  const testGaps = gaps.filter((g) => g.label === "TEST_GAP");

  console.log(`\nclassify-coverage-gaps — ${gaps.length} file(s) below tier threshold, ${allFiles.size} scanned:\n`);

  if (architectureDebt.length > 0) {
    console.log(`ARCHITECTURE_DEBT (${architectureDebt.length}) — refactor before chasing coverage:`);
    for (const g of architectureDebt) {
      console.log(`  - ${g.file}: unit ${g.evaluation.unit.detail}, integration ${g.evaluation.integration.detail}`);
      for (const r of g.complexityReasons) console.log(`      ${r}`);
    }
    console.log("");
  }

  if (testGaps.length > 0) {
    console.log(`TEST_GAP (${testGaps.length}) — clean complexity, write the missing test(s):`);
    for (const g of testGaps) {
      const tax = g.phantomTaxPlausible ? "  [small file — check DA hit counts before assuming this is a real gap]" : "";
      console.log(`  - ${g.file}: unit ${g.evaluation.unit.detail}, integration ${g.evaluation.integration.detail}${tax}`);
    }
    console.log("");
  }

  if (gaps.length === 0) {
    console.log(`nothing below threshold on either tier across ${allFiles.size} scanned file(s).`);
  }
}

if (require.main === module) {
  main();
}
