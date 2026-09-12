#!/usr/bin/env node
/**
 * @file The desktop complexity gate: re-lints `apps/desktop` at a hard 9/9 ceiling and fails on any
 * violation not in `complexity-debt.json`. The rules live in `../src/complexity-debt.js` and are
 * tested there.
 *
 * ## Why a --rule re-lint rather than the shared config's severity
 *
 * `eslint.config.mjs`'s desktop block sets `warn`/15, deliberately: `npm run complexity` is a
 * blocking CI step and desktop carries pre-existing 9/9 debt, so promoting it there would fail that
 * gate for everyone over debt nobody in that change introduced. The strict ceiling therefore lives
 * here, applied with `--rule`, which overrides severity independently of the shared config. That is
 * exactly how `development/scripts/check-admin-complexity-drift.ts` has always done it.
 *
 * This technique only works because that block registers `plugins: { sonarjs }` against a glob that
 * includes `.js`. Before it existed, this same command exited 2 with empty stdout — "could not find
 * plugin sonarjs" — on any desktop glob whose directory contained a `.js` file.
 *
 * ## Two guards this gate has that the admin one does not
 *
 * 1. **Exit 2 is a crash, not a finding.** ESLint exits 1 when it merely FINDS problems; it exits 2
 *    when it crashed, with empty stdout. A caller testing `status !== 1` reads that as a pass.
 *    `rejectUnusableEslintRun` refuses anything that is not exit 0-or-1 WITH a parseable, non-empty
 *    report.
 * 2. **A shrinking scan is not a clean scan.** Zero violations and "the glob matched nothing" are
 *    indistinguishable from an exit code. `minFilesLinted` fails the run when the scan shrinks —
 *    the check that four now-nonexistent scopes in `check-src-complexity-drift.ts` never had.
 *
 * Usage: node scripts/check-complexity.mjs [--update]
 *   --update rewrites complexity-debt.json from the current run. Use it to SEED the baseline or to
 *   record a deliberate, reviewed addition — never to make a red gate green.
 * Exit codes: 0 = no violation outside the debt list, and the scan was the expected size.
 *             1 = new violation, undersized scan, unusable ESLint run, or no debt file yet.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { evaluateRun, rejectUnusableEslintRun } from "../src/complexity-debt.js";

const DESKTOP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = path.resolve(DESKTOP_ROOT, "..", "..");
const DEBT_PATH = path.join(DESKTOP_ROOT, "complexity-debt.json");
const THRESHOLD = 9;
/** The 2026-09-12 measured scan size. A run smaller than this is not trusted — see the header. */
const MIN_FILES_LINTED = 90;

const RULE_OVERRIDE = JSON.stringify({
  complexity: ["error", THRESHOLD],
  "sonarjs/cognitive-complexity": ["error", THRESHOLD],
});

/** Runs ESLint at the strict ceiling and returns its raw stdout plus status. Runs from the REPO
 *  root because `eslint.config.mjs` and its relative plugin paths live there.
 *  @complexity O(1) plus ESLint's own cost. */
function lintAtCeiling() {
  const result = spawnSync(
    "npx",
    [
      "eslint",
      "--no-error-on-unmatched-pattern",
      "--ignore-pattern",
      "**/*.test.{ts,tsx,js,mjs,cjs}",
      "--rule",
      RULE_OVERRIDE,
      "-f",
      "json",
      "apps/desktop",
    ],
    { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }
  );
  return { status: result.signal ? null : result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

/** Rewrites each result's absolute `filePath` to a repo-relative, forward-slash path, so the debt
 *  file is portable across machines and checkouts.
 *  @complexity O(n). */
function toRepoRelative(results) {
  return results.map((result) => ({
    filePath: path.relative(REPO_ROOT, result.filePath).split(path.sep).join("/"),
    messages: result.messages,
  }));
}

function writeBaseline(violations) {
  const payload = {
    _comment:
      "Grandfathered apps/desktop complexity violations, keyed PER VIOLATION (rule, file, message) " +
      "rather than per file: ESLint's flat config can only ever relax a whole FILE, and a per-file " +
      "list lets every other function in that file drift unnoticed. Regenerate with " +
      "`node scripts/check-complexity.mjs --update` ONLY to record a deliberate, reviewed addition " +
      "— never to turn a red gate green. Shrink this list; do not grow it.",
    violations,
  };
  writeFileSync(DEBT_PATH, `${JSON.stringify(payload, null, 2)}\n`);
  process.stdout.write(`check-complexity — wrote ${violations.length} violation(s) to complexity-debt.json\n`);
}

function main() {
  const update = process.argv.includes("--update");
  const run = lintAtCeiling();

  const unusable = rejectUnusableEslintRun(run.status, run.stdout);
  if (unusable) {
    process.stderr.write(`check-complexity: FAIL — ${unusable}\n`);
    if (run.stderr.trim()) process.stderr.write(`${run.stderr.trim()}\n`);
    process.exit(1);
  }

  const results = toRepoRelative(JSON.parse(run.stdout));

  if (update) {
    writeBaseline(evaluateRun(results, [], MIN_FILES_LINTED).current);
    return;
  }

  if (!existsSync(DEBT_PATH)) {
    process.stderr.write(
      `check-complexity: FAIL — no complexity-debt.json. Seed it with ` +
        `\`node scripts/check-complexity.mjs --update\` and review what lands in it. This gate does ` +
        `NOT pass by default when its baseline is missing — a gate that cannot run is exactly how ` +
        `development/scripts/check-area-coverage-floor.ts sat unrunnable and unnoticed.\n`
    );
    process.exit(1);
  }

  const baseline = JSON.parse(readFileSync(DEBT_PATH, "utf8")).violations;
  const { added, removed, failures, filesLinted } = evaluateRun(results, baseline, MIN_FILES_LINTED);

  process.stdout.write(`check-complexity — ${filesLinted} files linted at ${THRESHOLD}/${THRESHOLD}\n`);
  for (const violation of removed) {
    process.stdout.write(
      `  FIXED (remove from complexity-debt.json): [${violation.rule}] ${violation.file}: ${violation.reason}\n`
    );
  }
  for (const violation of added) {
    process.stderr.write(`  NEW: [${violation.rule}] ${violation.file}: ${violation.reason}\n`);
  }
  for (const failure of failures) process.stderr.write(`  ! ${failure}\n`);

  if (failures.length > 0) {
    process.stderr.write(
      `\ncheck-complexity: FAILED. Refactor under the ${THRESHOLD}/${THRESHOLD} ceiling, or — only if ` +
        `genuinely intentional — record it with --update and say why in the review.\n`
    );
    process.exit(1);
  }
  process.stdout.write(`check-complexity: OK — ${baseline.length} grandfathered, 0 new\n`);
}

main();
