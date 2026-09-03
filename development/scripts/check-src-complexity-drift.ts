/**
 * `src/server/**` + `src/assistant/**` complexity-ceiling drift check (2026-08-17, following the
 * 2026-08-16 server-routes coverage/complexity audit — see
 * `ADS-memory/reports/2026-08-16-server-routes-coverage-complexity-audit.md` §1 for the
 * measurement that triggered this and `ADS-memory/reports/2026-08-17-src-complexity-gate.md`
 * for the full writeup).
 *
 * ## What this measures, and what it does NOT
 *
 * There is no complexity gate on `src/` today. `eslint.config.mjs` sets `complexity` and
 * `sonarjs/cognitive-complexity` to `warn`/15 repo-wide, so `npm run complexity` (plain
 * `eslint .`) cannot fail CI on complexity regardless of content — see that config's own
 * comments. `apps/admin/src` already has a hard `error`/9 gate plus a grandfathered debt list
 * (`admin-complexity-debt.json` / `check-admin-complexity-drift.ts`); this file is that same
 * pattern applied to `src/`.
 *
 * SCOPE HISTORY — read before citing any older count from this file's git history:
 *   2026-08-17  created covering `src/server/routes/**` ONLY (98 violations / 64 files today).
 *   2026-08-20  widened to `src/server/**` + `src/assistant/**` at the owner's direction. The
 *               widening added 21 violations in `src/server` outside routes and 31 in
 *               `src/assistant` — 52 that had accumulated unseen, because `eslint.config.mjs`
 *               sets these two rules to `warn`/15 repo-wide and a warning cannot fail CI.
 *   2026-09-02  repointed 8 of the 9 SCOPES entries from `src/...` to `apps/website/src/...`. The
 *               apps/website restructure moved the tree but not these strings, so every entry but
 *               `apps/site-chat/src` was a dead ESLint target — `check:src-complexity-drift` was
 *               linting one small app and nothing else. See `dead-path-sweep.test.ts`. This is a
 *               pure path repoint, not a re-scope: `src-complexity-debt.json`'s baseline entries
 *               still read `src/...` and are NOT touched here, so every entry there now reads as
 *               removed (no longer reproduces at its old path), and the real scan below will surface
 *               whatever violations exist in the tree it can finally see — an owner decision on
 *               whether/how to re-baseline, not made by this change.
 * `src/server` subsumes `src/server/routes`, so pre-existing route baseline entries keep matching
 * unchanged — widening the scan cannot orphan them.
 *
 * Still NOT covered by this gate: `src/features/**`, `src/platform/export/**`, `src/seo/**`,
 * `src/widgets/**`, `packages/**`, `apps/site-chat/**`. `apps/admin/src` has its own equivalent
 * gate (`check-admin-complexity-drift.ts`). Each remaining area needs its own fresh measurement
 * before it is added to `SCOPES`.
 *
 * Tool and threshold are IDENTICAL to `apps/admin`'s gate — plain ESLint `complexity` (cyclomatic)
 * and `sonarjs/cognitive-complexity`, both hard-overridden to `error`/9 via `--rule`, ignoring
 * `eslint.config.mjs`'s own repo-wide `warn`/15. This is a real trap in this repo (see
 * `ADS-memory/reports/continuity/2026-08-16-session-8-handoff.md`'s "two complexity metrics on
 * apps/admin" note): there is a SEPARATE per-scope numbering scheme elsewhere and nesting does
 * NOT fold across tools. This script uses exactly one tool (ESLint, per-function, no custom
 * folding) and the `SCOPES` list below (excluding `__tests__`/`__measurements__` —
 * same exclusion `check-admin-complexity-drift.ts` applies, for the same reason: test/measurement
 * code is out of scope for this ceiling, not silently-tracked debt). Do not compare this script's
 * counts to any other complexity number in this repo without checking both use the same tool,
 * threshold, and scope.
 *
 * ## Why a MULTISET diff, not a Set (the admin precedent uses a plain file-level Set)
 *
 * `src/server/routes/admin/widgets/agent-tools.ts` carries TWO textually identical violations
 * today — two different async arrow functions both reporting "Async arrow function has a
 * complexity of 10. Maximum allowed is 9." A presence-only (Set) diff keyed on
 * `(rule, file, reason)` would record that key ONCE in the baseline and then treat a THIRD
 * identical violation appearing later in the same file as "already known" — silently letting a
 * real new violation through. `diffAgainstBaseline` below counts occurrences per key and only
 * calls a violation "new" once the current count for that exact key exceeds what the baseline
 * already allows for it, in both directions (mirrors Jini's `scripts/check-guard-drift.ts`,
 * which hit the identical shape of bug first — see that file's header). Covered by
 * `development/scripts/__tests__/check-src-complexity-drift.test.ts`, including a fixture built
 * directly from the real `agent-tools.ts` duplicate so the test is not a hypothetical.
 *
 * ## Baseline provenance
 *
 * `src-complexity-debt.json`'s `violations` array was captured by running THIS script's own
 * `findViolations()` (structured JSON straight from `eslint -f json`, not scraped from human-
 * readable stdout) against a fresh tree, not typed by hand or copied from the audit's prose
 * counts. See that file's `_comment` for the exact HEAD sha and count at capture time, and the
 * explicit warning that six-plus other agents were editing this tree concurrently — the baseline
 * may already be stale by the time this is read; re-run to check.
 *
 * Usage: npx tsx development/scripts/check-src-complexity-drift.ts
 * Exit codes: 0 = no file under `SCOPES` outside the debt list violates 9/9 complexity.
 *             1 = at least one does.
 */
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
const DEBT_PATH = path.join(import.meta.dirname, "src-complexity-debt.json");
/**
 * Scanned subtrees. `src/server` subsumes the original `src/server/routes` scope, so routes stay
 * covered by the same baseline entries they always were — widening the scan cannot orphan them.
 * ESLint accepts multiple path patterns, so adding an area here is the whole change.
 */
const SCOPES = [
  "apps/website/src/server",
  "apps/website/src/assistant",
  "apps/website/src/features",
  "apps/website/src/widgets",
  "apps/website/src/seo",
  "apps/website/src/platform/export",
  "apps/website/src/analytics",
  "apps/website/src/media",
  "apps/site-chat/src",
] as const;
const THRESHOLD = 9;

export interface Violation {
  readonly rule: string;
  readonly file: string;
  readonly reason: string;
}

interface EslintMessage {
  ruleId: string | null;
  message: string;
}
interface EslintFileResult {
  filePath: string;
  messages: EslintMessage[];
}

/** Stable identity for a violation. `|`-joined rather than a template string with visible
 * separators: `reason` legitimately contains colons, quotes, and periods (ESLint's own complexity
 * messages), so any human-readable separator risks two distinct violations colliding onto the
 * same key. Deliberately excludes line number — see the module header on why identity is
 * (rule, file, message-text), not (rule, file, line): two functions in the same file can report
 * the exact same message at different lines, and that is precisely the case the multiset diff
 * exists to handle correctly rather than to avoid by over-specifying the key. */
export function violationKey(violation: Violation): string {
  return `${violation.rule}|${violation.file}|${violation.reason}`;
}

function countByKey(violations: readonly Violation[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const violation of violations) {
    const key = violationKey(violation);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export interface DriftResult {
  /** Present in `current` beyond what `baseline` allows for that exact (rule, file, reason) — a
   * real new violation, or an existing one that got MORE numerous. */
  readonly added: readonly Violation[];
  /** Present in `baseline` beyond what `current` still has — a violation that was fixed (or whose
   * count went down); a prompt to delete the now-stale entry from the baseline file. */
  readonly removed: readonly Violation[];
}

/**
 * Multiset diff between `baseline` and `current`. Symmetric in structure (each direction walks
 * its own list against the other's per-key counts) but asymmetric in meaning: `added` is what the
 * gate fails on, `removed` is reported only, never failed on — deleting a stale debt entry is the
 * baseline shrinking, which is always allowed.
 */
export function diffAgainstBaseline(baseline: readonly Violation[], current: readonly Violation[]): DriftResult {
  const baselineCounts = countByKey(baseline);
  const added: Violation[] = [];
  const consumedFromBaseline = new Map<string, number>();
  for (const violation of current) {
    const key = violationKey(violation);
    const allowed = baselineCounts.get(key) ?? 0;
    const consumed = consumedFromBaseline.get(key) ?? 0;
    if (consumed >= allowed) {
      added.push(violation);
    } else {
      consumedFromBaseline.set(key, consumed + 1);
    }
  }

  const currentCounts = countByKey(current);
  const removed: Violation[] = [];
  const consumedFromCurrent = new Map<string, number>();
  for (const violation of baseline) {
    const key = violationKey(violation);
    const stillPresent = currentCounts.get(key) ?? 0;
    const consumed = consumedFromCurrent.get(key) ?? 0;
    if (consumed >= stillPresent) {
      removed.push(violation);
    } else {
      consumedFromCurrent.set(key, consumed + 1);
    }
  }

  return { added, removed };
}

/**
 * Live ESLint scan of `src/server/routes` with `complexity` and `sonarjs/cognitive-complexity`
 * hard-overridden to `error`/9 via `--rule`, ignoring `eslint.config.mjs`'s repo-wide `warn`/15 —
 * same technique `check-admin-complexity-drift.ts` uses, so a grandfathered/lower severity
 * elsewhere in the config can never hide a violation from this gate. Reads ESLint's own `-f json`
 * output (structured, not scraped from the human-readable formatter), per the dispatch brief's
 * explicit warning that stdout-scraping breaks on the next formatter change.
 */
export function findViolations(): Violation[] {
  const ruleOverride = JSON.stringify({
    complexity: ["error", THRESHOLD],
    "sonarjs/cognitive-complexity": ["error", THRESHOLD],
  });
  let raw: string;
  try {
    raw = execFileSync(
      "npx",
      [
        "eslint",
        "--no-error-on-unmatched-pattern",
        // Load-bearing, NOT cosmetic. Without these, scanning `src/features` makes ESLint exit 2
        // with EMPTY stdout and `could not find plugin "sonarjs"` — caused by local build debris at
        // `src/features/theme/__tests__/fixtures/astro-bundler-probe/` (a real node_modules tree
        // with .vite prebundles, gitignored by that fixture's own .gitignore, so CI never has it).
        // Exit 2 is not exit 1: the `catch` below only recovers a report when stdout exists, so an
        // unguarded scan would throw rather than silently pass — but a caller reading only the exit
        // code could still misread 2 as "not 1, therefore fine". Same category as the
        // `apps/admin/dist-debug` and `.claude/worktrees` entries in eslint.config.mjs.
        "--ignore-pattern",
        "**/__tests__/**",
        "--ignore-pattern",
        "**/__measurements__/**",
        "--rule",
        ruleOverride,
        "-f",
        "json",
        ...SCOPES,
      ],
      { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 1024 * 1024 * 16 }
    );
  } catch (err) {
    // ESLint exits 1 when it finds lint errors — the expected, non-exceptional case here, and its
    // JSON report is on stdout regardless of exit code (execFileSync attaches it to the thrown
    // error). A genuine tooling failure (ESLint crash, bad flags) has no `stdout` at all.
    const stdout = (err as { stdout?: string }).stdout;
    if (typeof stdout !== "string" || stdout.length === 0) throw err;
    raw = stdout;
  }

  const results = JSON.parse(raw) as EslintFileResult[];
  const violations: Violation[] = [];
  for (const result of results) {
    const relPath = path.relative(REPO_ROOT, result.filePath).split(path.sep).join("/");
    // Mirrors check-admin-complexity-drift.ts's own exclusion, and the audit's own stated scope
    // ("234 route files... excludes __tests__ dirs"): test/measurement code is out of scope for
    // this ceiling entirely, not debt to grandfather. Empirically empty today (0 of 115 violations
    // measured 2026-08-16/17 fell in a __tests__ dir) but kept as a real guard, not dead code —
    // nothing prevents a future complex test-setup helper from tripping it.
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
      `check:src-complexity-drift — ${removed.length} baseline entr${removed.length === 1 ? "y" : "ies"} in src-complexity-debt.json no longer reproduce(s) — delete to let the baseline shrink:`
    );
    for (const violation of removed) console.log(`  - [${violation.rule}] ${violation.file}: ${violation.reason}`);
  }

  if (added.length === 0) {
    console.log(
      `check:src-complexity-drift — ok — 0 new complexity violations (${current.length} total, ${debt.violations.length} in baseline).`
    );
    return;
  }

  console.error(
    `check:src-complexity-drift — ${added.length} NEW ${SCOPES.join(" / ")} complexity violation(s), not covered by src-complexity-debt.json:`
  );
  for (const violation of added) console.error(`  - [${violation.rule}] ${violation.file}: ${violation.reason}`);
  console.error(
    "\nRefactor the function under the 9/9 ceiling, or — only if genuinely intentional — add it to" +
      " development/scripts/src-complexity-debt.json with a justification in an update to that file's own _comment."
  );
  process.exit(1);
}

// Guarded, unlike check-admin-complexity-drift.ts's unconditional `main();`: this file is also
// imported as a plain module by its own unit test (`check-src-complexity-drift.test.ts`, which
// exercises `diffAgainstBaseline`/`violationKey` directly). Without this guard, importing those
// two pure functions would also run the real ESLint scan against the real repo on every test
// run (slow) and risk a bare `process.exit(1)` killing the whole test process the moment a real
// new violation exists, rather than failing one assertion normally. Same idiom
// `generate-postgres-schema.ts` already uses in this repo.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
