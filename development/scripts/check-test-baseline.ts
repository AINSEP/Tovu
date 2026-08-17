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
 * Usage: npx tsx development/scripts/check-test-baseline.ts <baselineJsonPath> [tapPath]
 *   baselineJsonPath - path to a JSON file shaped { knownFailures: string[], ... }
 *   tapPath          - defaults to development/coverage/test-results.tap
 * Exit codes: 0 = no failing test outside the baseline (baseline may be over-generous; reported,
 *             not failed). 1 = at least one NEW failing test, or the TAP file is missing/unreadable.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
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

  const newFailures = [...currentFailures].filter((name) => !knownFailures.has(name));
  const fixedFailures = [...knownFailures].filter((name) => !currentFailures.has(name));

  if (fixedFailures.length > 0) {
    console.log(
      `check:route-test-baseline — ${fixedFailures.length} baseline entr${fixedFailures.length === 1 ? "y" : "ies"} no longer fail(s); delete from ${path.relative(REPO_ROOT, baselinePath)}:`
    );
    for (const name of fixedFailures) console.log(`  - ${name}`);
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

main();
