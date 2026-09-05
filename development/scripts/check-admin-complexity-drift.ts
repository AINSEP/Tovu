/**
 * `apps/admin` complexity-ceiling drift check (F06 option B, 2026-08-10; per-function ratchet,
 * 2026-09-05).
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
 * ## Per-function, not per-file (2026-09-05)
 *
 * `eslint.config.mjs`'s grandfather block can only ever relax a whole FILE — flat config globs
 * files, not functions. Until 2026-09-05 this script mirrored that at the drift-check level too: a
 * file's mere presence in the debt list (a `Set<string>`) tolerated ANY complexity/cognitive
 * finding anywhere in it, not just the one recorded. That is a real gap, not a hypothetical one:
 * `apps/admin/src/lib/api.ts`'s `request` drifted from a recorded 12/10 to an actual 17/16 with
 * this gate reporting green the whole time (the file was already grandfathered), and
 * `apps/admin/src/lib/assistant-transport.ts`'s `buildLocalCliContextRef` sat at 18/13 and was
 * NEVER on the debt list at all — masked because `translateRunAgentPayload`'s entry covered the
 * whole file it lived in. Both are now fixed; this rewrite closes the mechanism itself.
 *
 * `admin-complexity-debt.json` is now keyed per-VIOLATION — `{ rule, file, reason }`, where `reason`
 * is ESLint's own message text (it names the function and the exact measured number) — and this
 * script does a MULTISET diff against that list, reusing `check-src-complexity-drift.ts`'s
 * `diffAgainstBaseline`/`violationKey` rather than inventing a second copy of the same mechanism
 * (that script hit this identical class of problem first — see its header's "why a MULTISET diff"
 * section). A debt entry now tolerates exactly that (rule, file, reason) triple; any OTHER function
 * in the same file, or the same function at a DIFFERENT measured number, is a new violation this
 * gate fails on. `eslint.config.mjs`'s file-level relax block is unchanged and still necessary —
 * this script's own `--rule` override already ignores it, same as before.
 *
 * This is a genuine ratchet, not just a re-run of the same rule: a debt entry that no longer
 * reproduces is reported (not failed on) as a prompt to delete it — the JSON file's own instruction
 * not to let the list grow only works if it's also allowed to shrink.
 *
 * Test files (`apps/admin/src/**\/__tests__/**`, `apps/admin/src/**\/__measurements__/**`) are
 * excluded from the violation set entirely, mirroring `eslint.config.mjs`'s `ignores` on the same
 * gate — they're not debt to track, they're out of scope for this ceiling (see that config block's
 * comment for why).
 *
 * Usage: npx tsx development/scripts/check-admin-complexity-drift.ts
 * Exit codes: 0 = no apps/admin violation outside the debt list exceeds ≤9/≤9. 1 = at least one does.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { diffAgainstBaseline, type Violation } from "./check-src-complexity-drift.js";

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

/** Every `apps/admin/src` complexity/cognitive-complexity VIOLATION currently present, regardless
 * of `eslint.config.mjs`'s own grandfather block — this run overrides both rules back to `error`/9
 * via `--rule` so grandfathered files show up here exactly like any other file would. One entry per
 * (rule, function), not one per file — see the module header. */
export function findViolations(): Violation[] {
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
  const violations: Violation[] = [];
  for (const result of results) {
    const relPath = path.relative(REPO_ROOT, result.filePath).split(path.sep).join("/");
    // Mirrors `eslint.config.mjs`'s own `ignores` on its error/9 block: test files are excluded
    // from this gate entirely, not tracked as debt, so they must be excluded here too or a
    // violating test file would be reported as a "new" violation forever (it can never be added to
    // `admin-complexity-debt.json` — see that file's `_comment`).
    //
    // `__measurements__/` is the same category under a different name — vitest files asserting
    // request counts and render costs rather than correctness. It is a SEPARATE directory, not a
    // child of `__tests__/`, so a single-pattern check would miss it and report the render-churn
    // harness as a permanently-unfixable new violation the moment it landed.
    if (relPath.includes("__tests__/") || relPath.includes("__measurements__/")) continue;
    for (const message of result.messages) {
      if (message.ruleId === "complexity" || message.ruleId === "sonarjs/cognitive-complexity") {
        violations.push({ rule: message.ruleId, file: relPath, reason: message.message });
      }
    }
  }
  return violations;
}

function main(): void {
  const debt = JSON.parse(readFileSync(DEBT_PATH, "utf8")) as { violations: Violation[] };
  const current = findViolations();
  const { added, removed } = diffAgainstBaseline(debt.violations, current);

  if (removed.length > 0) {
    console.log(
      `check:admin-complexity-drift — ${removed.length} debt entr${removed.length === 1 ? "y" : "ies"} in admin-complexity-debt.json no longer reproduce(s) — delete to let the baseline shrink:`
    );
    for (const violation of removed) console.log(`  - [${violation.rule}] ${violation.file}: ${violation.reason}`);
  }

  if (added.length === 0) {
    console.log(
      `check:admin-complexity-drift — OK: no apps/admin violation outside the ${debt.violations.length}-entry grandfathered debt list exceeds 9/9 complexity.`
    );
    return;
  }

  console.error(
    `check:admin-complexity-drift — ${added.length} NEW apps/admin complexity violation(s), not in admin-complexity-debt.json:`
  );
  for (const violation of added) console.error(`  - [${violation.rule}] ${violation.file}: ${violation.reason}`);
  console.error("Refactor under the 9/9 ceiling, or add a justified entry to admin-complexity-debt.json.");
  process.exit(1);
}

// Guarded, matching `check-src-complexity-drift.ts`'s idiom: this file is also imported as a plain
// module by its own unit test (`check-admin-complexity-drift.test.ts`, which exercises
// `findViolations` indirectly via the real baseline snapshot). Without this guard, importing that
// export would also run the real ESLint scan against the real repo on every test run.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
