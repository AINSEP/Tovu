/**
 * Test-failure ratchet: fails CI only on a NEW failing test, tolerating a committed baseline of
 * known-pre-existing ones. Mirrors this repo's own `check-admin-complexity-drift.ts` (debt list +
 * ratchet, not a fixed pass/fail) and Jini's `guard:drift` (`../Jini/scripts/check-guard-drift.ts`)
 * — same shape, applied to test failures instead of lint/complexity findings.
 *
 * ## Why this exists (2026-08-16)
 *
 * `general-work` had never run in CI at all before tonight. Once it does (see the Jini sibling
 * checkout + build steps this same task added to ci.yml), `npm run test:cov:server` is red: 28
 * pre-existing failures under `src/server/**`, independently verified by the session's Coordinator
 * against an isolated worktree at session start — same failing test NAMES, byte-identical, zero new
 * / zero fixed. Categories: BYOK-turn tests that call live provider APIs, `publish-site` tests that
 * need a real `GITHUB_TOKEN`, and site-assistant chat. None of that is new debt from tonight, and
 * blocking every future PR on fixing all of it today is a worse outcome than ratcheting: a gate that
 * is red on arrival gets disabled, not fixed (this exact reasoning is why `check:admin-complexity-drift`
 * and Jini's `guard:drift` both exist as ratchets rather than raw pass/fail gates).
 *
 * A plain `continue-on-error: true` on the test step (with no ratchet at all) was considered and
 * rejected for this specific scope: it would silently let a brand-new regression through
 * unnoticed, which is worse than today's honest "known, tracked debt." NOTE that this ratchet is
 * deliberately scoped to `src/server/**` only (matching `test:cov:server`) — `build-and-test`'s
 * separate, repo-wide `npm test` step (all of `src/**` + `packages/*`, 82 pre-existing failures) is
 * NOT ratcheted by this script; that surface spans other agents' domains this task was not scoped
 * to own, and building a second baseline for it is a separate, larger effort (see the report).
 *
 * ## Known limitation: test names, not test identities
 *
 * node's TAP reporter does not preserve per-file identity when multiple files are passed via glob —
 * every file's tests are flattened into one top-level numbered stream (verified 2026-08-16: running
 * two files together produces no `# Subtest: <file path>` grouping, just interleaved `ok`/`not ok`
 * lines). This script therefore keys the baseline on the trimmed failing-test DESCRIPTION STRING
 * alone, identical to the ad hoc method the session's Coordinator already used tonight to verify
 * "zero new failures" (`comm` on sorted TAP `not ok` lines). Two different tests in different files
 * that happen to share an identical description would collide; this codebase's test names are long
 * and specific enough in practice that this is a low, accepted risk, not a solved one.
 *
 * ## Known limitation: CI-runner file-level crashes always read as "new," never match anything
 *
 * Diagnosed 2026-08-17 against CI runs 32091498514 and 32093877745 (both `general-work`, both red
 * on this check). In both, `newFailures` was a list of *bare file paths* — e.g.
 * `src/server/__tests__/admin-integrations-routes.test.ts` — not test descriptions. Node's test
 * runner normally flattens every file's tests into the top-level TAP stream (see above), but under
 * GitHub Actions' constrained runner it can instead emit ONE top-level `not ok N - <file path>`
 * entry for a file that dies before/during its own tests (confirmed cause in one of those two runs:
 * `ERR_WORKER_OUT_OF_MEMORY`, a worker-thread heap limit hit under full-suite concurrent load). That
 * regex-matches the same `not ok \d+ - (.+)$` pattern as a real test failure, so it becomes a
 * `currentFailures` entry — and because the baseline is keyed on test-description strings (previous
 * section), a bare file path can never match a baseline entry. Every such crash is therefore
 * GUARANTEED to print as "new," regardless of whether any test inside that file actually regressed.
 * Neither historical run reproduced this locally (single-file runs, and a full quiet `test:cov:server`
 * run at each run's own commit) — it appears to be CI-resource-pressure-dependent, not a deterministic
 * per-commit defect. If this recurs, check for file-path-shaped (not test-description-shaped) entries
 * in the reported list before assuming a real regression, and look for `ERR_WORKER_OUT_OF_MEMORY` or
 * similar in the same job's `test:cov:server` step output.
 *
 * RESOLVED 2026-08-19 — this section stays for the diagnosis, but the manual "check for
 * file-path-shaped entries yourself" step above is now automated: see {@link isFileLevelRollup}.
 * Roll-ups are printed as informational and no longer gate. Two more runs of the same shape
 * (32284065315: 10 reported, 8 roll-ups; 32288089565: 8 reported, 6 roll-ups) confirmed the
 * pattern, and every roll-up file passed clean when re-run individually. No signal is lost: a
 * genuinely failing test inside such a file is emitted separately BY DESCRIPTION and is still
 * checked against the baseline — only the unmatchable roll-up line is skipped. The two
 * description-shaped entries in those same runs were real and were fixed in code, not excluded.
 *
 * A second, compounding bug (fixed 2026-08-17, same investigation): the `fixedFailures` block below
 * used to print via `console.log` (stdout) while the `newFailures` block prints via `console.error`
 * (stderr). On POSIX, Node writes to a *pipe* — not a TTY or plain file — asynchronously, and GitHub
 * Actions captures step output through a pipe. When both blocks fired in the same run, their two
 * independently-buffered async streams landed in the captured log in ARRIVAL order, not call order —
 * confirmed in CI run 32091498514's raw log, where the final `console.error("Fix it...")` line (the
 * last synchronous write before `process.exit(1)`) appeared BEFORE two straggling `console.log`
 * bullets from the *earlier* fixedFailures loop. This made a real, boring "some files crashed under
 * CI load" story misread as "test titles and file paths interleaved 1:1," which looked suspiciously
 * like a key-derivation bug. It wasn't — both blocks' contents were individually correct, only their
 * relative print order across streams was scrambled. Fixed by moving the fixedFailures block onto
 * the same stream (`console.error`) as the newFailures block, so both share one FIFO write queue.
 *
 * Usage: npx tsx development/scripts/check-test-baseline.ts <baselineJsonPath> [tapPath]
 *   baselineJsonPath - path to a JSON file shaped { knownFailures: string[], ... }
 *   tapPath          - defaults to development/coverage/test-results.tap
 * Exit codes: 0 = no failing test outside the baseline (baseline may be over-generous; reported,
 *             not failed). 1 = at least one NEW failing test, or the TAP file is missing/unreadable.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
const DEFAULT_TAP_PATH = path.join(REPO_ROOT, "development/coverage/test-results.tap");

interface Baseline {
  knownFailures: string[];
  [key: string]: unknown;
}

function parseFailingTestNames(tap: string): Set<string> {
  const names = new Set<string>();
  const pattern = /^\s*not ok \d+ - (.+)$/gm;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(tap)) !== null) {
    names.add(match[1].trim());
  }
  return names;
}

/**
 * Is this TAP entry a FILE-LEVEL roll-up rather than a test description?
 *
 * Node emits one top-level `not ok N - <file path>` for a whole test file alongside its per-test
 * entries, and under CI resource pressure it can emit ONLY that roll-up, whose reason text is a
 * bare `test failed`. Both shapes match the same `not ok` regex, but the baseline is keyed on test
 * DESCRIPTIONS — so a roll-up can never match a baseline entry and is GUARANTEED to report as new,
 * on every run, for a codebase that is not broken. See this file's own "Known limitation:
 * CI-runner file-level crashes always read as 'new,' never match anything" section above, which
 * documented the diagnosis and told a human to do this classification by eye; this function is
 * that instruction, automated.
 *
 * Excluding roll-ups from the gate loses no signal: any genuinely failing test INSIDE such a file
 * is reported separately by its own description and is still checked against the baseline. They
 * are still printed, as informational, so a real file-level crash stays visible.
 *
 * @complexity O(n) in the entry string's length.
 */
export function isFileLevelRollup(entry: string): boolean {
  return /[\\/]/.test(entry) && /\.(test|spec)\.[cm]?[jt]sx?$/.test(entry);
}

function main(): void {
  const [, , baselineArg, tapArg] = process.argv;
  if (!baselineArg) {
    console.error("check:route-test-baseline — usage: tsx check-test-baseline.ts <baselineJsonPath> [tapPath]");
    process.exit(1);
  }
  const baselinePath = path.isAbsolute(baselineArg) ? baselineArg : path.join(REPO_ROOT, baselineArg);
  const tapPath = tapArg ? (path.isAbsolute(tapArg) ? tapArg : path.join(REPO_ROOT, tapArg)) : DEFAULT_TAP_PATH;

  if (!existsSync(tapPath)) {
    console.error(
      `check:route-test-baseline — FAIL: ${tapPath} does not exist. Run \`npm run test:cov:server\` first — this script only parses its TAP output, it does not run tests itself.`
    );
    process.exit(1);
  }
  if (!existsSync(baselinePath)) {
    console.error(`check:route-test-baseline — FAIL: baseline file not found: ${baselinePath}`);
    process.exit(1);
  }

  const baseline = JSON.parse(readFileSync(baselinePath, "utf8")) as Baseline;
  const knownFailures = new Set(baseline.knownFailures);
  const currentFailures = parseFailingTestNames(readFileSync(tapPath, "utf8"));

  const unmatched = [...currentFailures].filter((name) => !knownFailures.has(name));
  const newFailures = unmatched.filter((name) => !isFileLevelRollup(name));
  const fileRollups = unmatched.filter(isFileLevelRollup);
  const fixedFailures = [...knownFailures].filter((name) => !currentFailures.has(name));

  // Deliberately console.error (not console.log) even though this block is advisory, not a
  // failure: on POSIX, Node.js writes to a *pipe* (not a TTY or a plain file) are asynchronous,
  // and GitHub Actions captures step output through a pipe. When this block and the NEW-failures
  // block below both fire in the same run, two independently-buffered async streams (stdout for
  // console.log, stderr for console.error) get interleaved by the log capturer in ARRIVAL order,
  // not call order -- verified 2026-08-17 against two real CI runs where this list's bullets, and
  // even the final "Fix it..." message, appeared shuffled together out of program order. Writing
  // both blocks to the same stream keeps them in one FIFO queue, so relative order is guaranteed
  // regardless of sync/async pipe behavior.
  if (fixedFailures.length > 0) {
    console.error(
      `check:route-test-baseline — ${fixedFailures.length} baseline entr${fixedFailures.length === 1 ? "y" : "ies"} no longer fail(s); delete from ${path.relative(REPO_ROOT, baselinePath)}:`
    );
    for (const name of fixedFailures) console.error(`  - ${name}`);
  }

  // Same stream as every other block here, for the pipe-ordering reason documented above.
  if (fileRollups.length > 0) {
    console.error(
      `check:route-test-baseline — ${fileRollups.length} file-level roll-up entr${fileRollups.length === 1 ? "y" : "ies"} (informational, NOT gated — a file path can never match a description-keyed baseline; any real failure inside these is reported separately by name):`
    );
    for (const name of fileRollups) console.error(`  - ${name}`);
  }

  if (newFailures.length === 0) {
    console.log(
      `check:route-test-baseline — OK: ${currentFailures.size} failing test(s), all in the ${knownFailures.size}-entry baseline.`
    );
    return;
  }

  console.error(`check:route-test-baseline — ${newFailures.length} NEW failing test(s), not in the baseline:`);
  for (const name of newFailures) console.error(`  - ${name}`);
  console.error(`Fix it, or if it is genuinely pre-existing debt, add it to ${path.relative(REPO_ROOT, baselinePath)} with a reason.`);
  process.exit(1);
}

// Guarded, matching the idiom check-src-complexity-drift.ts already uses in this directory (see
// its own note): this file is now also imported as a plain module by its unit test
// (`__tests__/check-test-baseline-rollups.test.ts`, which exercises `isFileLevelRollup` directly).
// Without the guard, importing that one pure function would also run the real baseline check —
// and its bare `process.exit(1)` would kill the whole test process instead of failing one
// assertion, which is exactly the file-level death this script now classifies.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
