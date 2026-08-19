/**
 * `apps/admin` complexity-ceiling drift check (F06 option B, 2026-08-10).
 *
 * `eslint.config.mjs` enforces the documented ≤9 cyclomatic / ≤9 cognitive-complexity ceiling as a
 * hard `error` for every file under `apps/admin/src`, EXCEPT the files listed in
 * `admin-complexity-debt.json` — pre-existing debt from a ≤9/≤9 pass across `apps/admin` the owner
 * started and paused on 2026-08-06 in favor of a ≤15 `warn` bar (see that JSON file's `_comment`
 * and the linked handoffs for the history). Grandfathering those files keeps `npm run complexity`
 * green today without silently permitting the debt to grow forever: this script re-lints exactly
 * `apps/admin/src` at the strict ≤9/≤9 ceiling — ignoring `eslint.config.mjs`'s own grandfather
 * block — and fails if any file OUTSIDE the debt list now violates it. `npm run complexity` alone
 * cannot surface this specifically: it mixes in ~150 unrelated repo-wide warnings, so a new
 * violation in `apps/admin` would be one more warning line in a wall of them, not a clear signal.
 *
 * This is a genuine ratchet, not just a re-run of the same rule: a file's presence in the debt list
 * is also checked against reality, and a debt-list entry for a file that no longer violates is
 * reported (not failed on) as a prompt to delete the now-stale entry — the JSON file's own
 * instruction not to let it grow only works if it's also allowed to shrink.
 *
 * Test files (`apps/admin/src/**\/__tests__/**`) are excluded from the violation set entirely,
 * mirroring `eslint.config.mjs`'s `ignores` on the same gate — they're not debt to track, they're
 * out of scope for this ceiling (see that config block's comment for why).
 *
 * Usage: npx tsx development/scripts/check-admin-complexity-drift.ts
 * Exit codes: 0 = no apps/admin file outside the debt list violates ≤9/≤9. 1 = at least one does.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
const DEBT_PATH = path.join(import.meta.dirname, "admin-complexity-debt.json");

interface EslintMessage {
  ruleId: string | null;
  line: number;
  message: string;
}
interface EslintFileResult {
  filePath: string;
  messages: EslintMessage[];
}

/** Every `apps/admin/src` file currently violating ≤9 cyclomatic or ≤9 cognitive complexity,
 * regardless of `eslint.config.mjs`'s own grandfather block — this run overrides both rules back
 * to `error`/9 via `--rule` so grandfathered files show up here exactly like any other file would. */
function findViolatingFiles(): Set<string> {
  const ruleOverride = JSON.stringify({
    complexity: ["error", 9],
    "sonarjs/cognitive-complexity": ["error", 9],
  });
  let raw: string;
  try {
    raw = execFileSync(
      "npx",
      ["eslint", "--no-error-on-unmatched-pattern", "--rule", ruleOverride, "-f", "json", "apps/admin/src/**/*.{ts,tsx}"],
      { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 1024 * 1024 * 16 }
    );
  } catch (err) {
    // ESLint exits 1 when it finds lint errors — that is the expected, non-exceptional case here,
    // and its JSON report is on stdout regardless of exit code (execFileSync attaches it to the
    // thrown error). A genuine tooling failure (ESLint crash, bad flags) has no `stdout` at all.
    const stdout = (err as { stdout?: string }).stdout;
    if (typeof stdout !== "string" || stdout.length === 0) throw err;
    raw = stdout;
  }

  const results = JSON.parse(raw) as EslintFileResult[];
  const violating = new Set<string>();
  for (const result of results) {
    const relPath = path.relative(REPO_ROOT, result.filePath);
    // Mirrors `eslint.config.mjs`'s own `ignores` on its error/9 block: test files are excluded
    // from this gate entirely, not tracked as debt, so they must be excluded here too or a
    // violating test file would be reported as a "new" violation forever (it can never be added to
    // `admin-complexity-debt.json` — see that file's `_comment`).
    //
    // `__measurements__/` is the same category under a different name — vitest files asserting
    // request counts and render costs rather than correctness. It is a SEPARATE directory, not a
    // child of `__tests__/`, so the original single-pattern check missed it and reported the
    // render-churn harness as a permanently-unfixable new violation the moment it landed.
    if (
      relPath.includes(`${path.sep}__tests__${path.sep}`) ||
      relPath.includes(`${path.sep}__measurements__${path.sep}`)
    )
      continue;
    const hasComplexityFinding = result.messages.some(
      (m) => m.ruleId === "complexity" || m.ruleId === "sonarjs/cognitive-complexity"
    );
    if (hasComplexityFinding) violating.add(relPath);
  }
  return violating;
}

function main(): void {
  const debt = JSON.parse(readFileSync(DEBT_PATH, "utf8")) as { files: { file: string; note: string }[] };
  const debtFiles = new Set(debt.files.map((entry) => entry.file));
  const violating = findViolatingFiles();

  const newViolations = [...violating].filter((f) => !debtFiles.has(f));
  const staleDebtEntries = [...debtFiles].filter((f) => !violating.has(f));

  if (staleDebtEntries.length > 0) {
    console.log(
      `check:admin-complexity-drift — ${staleDebtEntries.length} debt entr${staleDebtEntries.length === 1 ? "y" : "ies"} no longer violate(s) the ceiling; delete from admin-complexity-debt.json:`
    );
    for (const f of staleDebtEntries) console.log(`  - ${f}`);
  }

  if (newViolations.length === 0) {
    console.log(
      `check:admin-complexity-drift — OK: no apps/admin file outside the ${debtFiles.size}-file grandfathered debt list exceeds 9/9 complexity.`
    );
    return;
  }

  console.error(
    `check:admin-complexity-drift — ${newViolations.length} NEW apps/admin complexity violation(s), not in admin-complexity-debt.json:`
  );
  for (const f of newViolations) console.error(`  - ${f}`);
  console.error("Refactor under the 9/9 ceiling, or add a justified entry to admin-complexity-debt.json.");
  process.exit(1);
}

main();
