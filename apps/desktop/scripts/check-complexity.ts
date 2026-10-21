#!/usr/bin/env node
/**
 * @file The desktop complexity gate: re-lints `apps/desktop` at a hard 9/9 ceiling and fails on any
 * violation not in `complexity-debt.json`. The rules live in `../src/complexity-debt.ts` and are
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
 * Usage: node scripts/check-complexity.ts [--update]
 *   --update rewrites complexity-debt.json from the current run. Use it to SEED the baseline or to
 *   record a deliberate, reviewed addition — never to make a red gate green.
 * Exit codes: 0 = no violation outside the debt list, and the scan was the expected size.
 *             1 = new violation, undersized scan, unusable ESLint run, or no debt file yet.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { redactLocalText } from "../../website/src/platform/server-logs/redact-local-text.ts";
import { sanitizeUntrustedText } from "@jini-ai/core/text";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { evaluateRun, rejectUnusableEslintRun } from "../src/complexity-debt.ts";
import type { ComplexityViolation, EslintFileResult } from "../src/complexity-debt.ts";

const DESKTOP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = path.resolve(DESKTOP_ROOT, "..", "..");
const DEBT_PATH = path.join(DESKTOP_ROOT, "complexity-debt.json");
const THRESHOLD = 9;
/**
 * A few under the 2026-09-12 measured scan size. A run smaller than this is not trusted.
 *
 * Measured twice, by two independent routes that agree exactly: 62 non-test source files exist on
 * disk under `apps/desktop` (find, excluding build outputs), and this gate's own command reports 62
 * linted. Set to 58 for the same reason the coverage floors sit a few points under their baseline —
 * a gate that fails on ordinary churn gets disabled.
 *
 * Calibrating this was itself the guard's first catch: the initial value of 90 came from a scan
 * that did NOT apply the `--ignore-pattern` for test files, and the gate refused to report a clean
 * result against it. A number copied from a differently-scoped measurement is exactly the mistake
 * this check exists to make loud, and it made it loud about its own configuration.
 */
const MIN_FILES_LINTED = 58;

/** One ESLint run's raw outcome; `status` is `null` when it was killed by a signal. */
interface LintRun {
  status: number | null;
  stdout: string;
  stderr: string;
}

const RULE_OVERRIDE = JSON.stringify({
  complexity: ["error", THRESHOLD],
  "sonarjs/cognitive-complexity": ["error", THRESHOLD],
});

/** Runs ESLint at the strict ceiling and returns its raw stdout plus status. Runs from the REPO
 *  root because `eslint.config.mjs` and its relative plugin paths live there.
 *  @complexity O(1) plus ESLint's own cost. */
function lintAtCeiling({ spawn = spawnSync }: { spawn?: typeof spawnSync } = {}): LintRun {
  const result = spawn(
    "npx",
    [
      "eslint",
      "--no-error-on-unmatched-pattern",
      "--ignore-pattern",
      "**/*.test.{ts,tsx,js,mjs,cjs}",
      "--ignore-pattern",
      "apps/desktop/src/renderer/public/vendor/**",
      "--rule",
      RULE_OVERRIDE,
      "-f",
      "json",
      "apps/desktop",
    ],
    { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }
  );
  return { status: result.signal ? null : result.status, stdout: String(result.stdout ?? ""), stderr: String(result.stderr ?? "") };
}

/** Rewrites each result's absolute `filePath` to a repo-relative, forward-slash path, so the debt
 *  file is portable across machines and checkouts.
 *  @complexity O(n). */
function toRepoRelative(results: readonly EslintFileResult[]): EslintFileResult[] {
  return results.map((result) => ({
    filePath: path.relative(REPO_ROOT, result.filePath).split(path.sep).join("/"),
    messages: result.messages,
  }));
}

/** Every effect the gate has — production wires ESLint, the debt file and stdio. */
interface ComplexityGatePorts {
  lint: () => LintRun;
  exists: (target: string) => boolean;
  readFile: (target: string) => string;
  writeFile: (target: string, text: string) => void;
  out: (text: string) => void;
  err: (text: string) => void;
}

function writeBaseline(violations: readonly ComplexityViolation[], ports: ComplexityGatePorts, debtPath: string): void {
  const payload = {
    _comment:
      "Grandfathered apps/desktop complexity violations, keyed PER VIOLATION (rule, file, message) " +
      "rather than per file: ESLint's flat config can only ever relax a whole FILE, and a per-file " +
      "list lets every other function in that file drift unnoticed. Regenerate with " +
      "`node scripts/check-complexity.ts --update` ONLY to record a deliberate, reviewed addition " +
      "— never to turn a red gate green. Shrink this list; do not grow it.",
    violations,
  };
  ports.writeFile(debtPath, `${JSON.stringify(payload, null, 2)}\n`);
  ports.out(`check-complexity — wrote ${violations.length} violation(s) to complexity-debt.json\n`);
}

/** Prints a verdict against the debt list and returns the exit code. Split from
 *  {@link runComplexityGate} to keep both under the ceiling this gate enforces. @complexity O(n). */
function reportAgainstBaseline(results: readonly EslintFileResult[], baseline: readonly ComplexityViolation[], ports: ComplexityGatePorts): number {
  const { added, removed, failures, filesLinted } = evaluateRun(results, baseline, MIN_FILES_LINTED);

  ports.out(`check-complexity — ${filesLinted} files linted at ${THRESHOLD}/${THRESHOLD}\n`);
  for (const violation of removed) {
    ports.out(`  FIXED (remove from complexity-debt.json): [${violation.rule}] ${violation.file}: ${violation.reason}\n`);
  }
  for (const violation of added) ports.err(`  NEW: [${violation.rule}] ${violation.file}: ${violation.reason}\n`);
  for (const failure of failures) ports.err(`  ! ${failure}\n`);

  if (failures.length > 0) {
    ports.err(
      `\ncheck-complexity: FAILED. Refactor under the ${THRESHOLD}/${THRESHOLD} ceiling, or — only if ` +
        `genuinely intentional — record it with --update and say why in the review.\n`
    );
    return 1;
  }
  ports.out(`check-complexity: OK — ${baseline.length} grandfathered, 0 new\n`);
  return 0;
}

/**
 * The whole gate over its ports. `--update` reseeds the debt file from this run instead of judging it.
 * @returns the exit code: 0 clean, 1 for a new violation, an undersized scan, an unusable ESLint
 *   run, a missing debt file, or any failure along the way.
 * @complexity O(n) in ESLint results.
 */
function runComplexityGate({ argv }: { argv: readonly string[] }, ports: ComplexityGatePorts, { debtPath = DEBT_PATH }: { debtPath?: string } = {}): number {
  try {
    const run = ports.lint();
    const unusable = rejectUnusableEslintRun(run.status, run.stdout);
    if (unusable) {
      ports.err(`check-complexity: FAIL — ${unusable}\n`);
      if (run.stderr.trim()) ports.err(sanitizeUntrustedText({ text: redactLocalText({ text: run.stderr }) }, { maxLength: 2_000 }) + "\n");
      return 1;
    }

    const results = toRepoRelative(JSON.parse(run.stdout));
    if (argv.includes("--update")) {
      writeBaseline(evaluateRun(results, [], MIN_FILES_LINTED).current, ports, debtPath);
      return 0;
    }
    if (!ports.exists(debtPath)) {
      ports.err(
        `check-complexity: FAIL — no complexity-debt.json. Seed it with ` +
          `\`node scripts/check-complexity.ts --update\` and review what lands in it. This gate does ` +
          `NOT pass by default when its baseline is missing — a gate that cannot run is exactly how ` +
          `development/scripts/check-area-coverage-floor.ts sat unrunnable and unnoticed.\n`
      );
      return 1;
    }
    return reportAgainstBaseline(results, JSON.parse(ports.readFile(debtPath)).violations, ports);
  } catch (error) {
    ports.err(sanitizeUntrustedText({ text: redactLocalText({ text: error instanceof Error ? error.message : String(error) }) }, { maxLength: 2_000 }) + "\n");
    return 1;
  }
}

/** Run only when this file IS the process, never when a test imports it. */
if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runComplexityGate({ argv: process.argv.slice(2) }, {
    lint: lintAtCeiling,
    exists: existsSync,
    readFile: (target) => readFileSync(target, "utf8"),
    writeFile: writeFileSync,
    out: process.stdout.write.bind(process.stdout),
    err: process.stderr.write.bind(process.stderr),
  });
}

export { MIN_FILES_LINTED, REPO_ROOT, lintAtCeiling, runComplexityGate };
export type { ComplexityGatePorts, LintRun };
