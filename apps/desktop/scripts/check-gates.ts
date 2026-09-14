#!/usr/bin/env node
/**
 * @file The desktop quality-gate runner. Reads `quality-gates.json`, runs every ENABLED gate, and
 * prints every gate — enabled, failing, or disabled — on every run.
 *
 * The policy it enforces lives in `../src/quality-gates.ts` (and is tested there, under the normal
 * `npm test` glob); this file is the part that touches the process table and the filesystem. The
 * split exists so the rules can be tested without spawning anything.
 *
 * ## Exit-code discipline is the whole point of this file
 *
 * The 2026-09-12 survey that produced this harness found THREE separate exit-code hazards in the
 * existing one, and every user-visible failure it explains was the same shape — a check that ran,
 * found the problem, and reported success:
 *
 *  - `stage-payload.ts`'s staleness check wrote a WARNING to stderr and let the script exit 0, so a
 *    packaged app shipped a twelve-day-stale admin bundle and the package step said SUCCESS;
 *  - ESLint exits 2 with EMPTY stdout when a config crashes, and a caller testing `rc !== 1` reads
 *    that as a pass;
 *  - reading an exit code through a shell pipe yields the PIPE's status, which is how
 *    `npm run admin:build` was reported as "exits 0 while blocked" when it exits 1 correctly.
 *
 * So, here: no pipes, ever. `spawnSync` with `stdio: "inherit"` so a gate's own output goes straight
 * to the terminal and its status comes back as a number rather than through a stream. A gate that
 * yields no numeric status at all — killed by a signal, or a command that could not be spawned —
 * is a FAILURE, never a pass (see `isFailure`). And `check-gates-exit-code.test.ts` proves the
 * non-zero actually reaches a caller, by running THIS file against deliberately-failing gates,
 * rather than by anybody reading this comment and believing it.
 *
 * Usage: node scripts/check-gates.ts
 * Exit codes: 0 = every enabled gate passed and the manifest is sound.
 *             1 = a gate failed, or the manifest is unsound (undocumented/stale disablement, or a
 *                 gate script on disk that nothing runs).
 */
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateManifest, detectGateDrift, formatSummary, isFailure, asGateEntryArray } from "../src/quality-gates.ts";
import type { GateEntry, GateExitCode, GateManifest } from "../src/quality-gates.ts";

const DESKTOP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** This runner is not itself a gate, so it must not be counted as one — without this it would
 *  report ITSELF as an unregistered gate script on every run. */
const RUNNER_BASENAME = "check-gates.ts";

/** Gate scripts are `scripts/check-*.mjs` by convention — that convention is what makes property 3
 *  (a script on disk that nothing runs is a hard failure) checkable at all.
 *  @complexity O(n) in files in `scripts/`. */
function gateScriptsOnDisk(scriptsDir: string): string[] {
  try {
    return readdirSync(scriptsDir).filter(
      (name) => name.startsWith("check-") && name.endsWith(".ts") && name !== RUNNER_BASENAME
    );
  } catch {
    return [];
  }
}

/** Today as `YYYY-MM-DD`, in local time — the date a human would write in the manifest.
 *  @complexity O(1). */
function todayIso(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * Run one gate and return its exit status. `shell: true` because a gate's `run` is a command line
 * (`npm test`), and `stdio: "inherit"` because the alternative — capturing and re-printing — is the
 * pipe that swallows statuses.
 *
 * @returns the numeric exit code, or `null` when the process never produced one.
 * @complexity O(1) plus the gate's own cost.
 */
function runGate(gate: GateEntry & { id: string; run: string }): GateExitCode {
  process.stdout.write(`\n${"=".repeat(66)}\n>>> GATE: ${gate.id}\n${"=".repeat(66)}\n`);
  const result = spawnSync(gate.run, { cwd: DESKTOP_ROOT, shell: true, stdio: "inherit" });
  if (result.error) {
    process.stderr.write(`check-gates: gate "${gate.id}" could not be spawned: ${result.error.message}\n`);
    return null;
  }
  if (result.signal) {
    process.stderr.write(`check-gates: gate "${gate.id}" was killed by ${result.signal} — treating as FAILURE.\n`);
    return null;
  }
  return result.status;
}

/** Prints the manifest problems and returns whether any were found. Kept separate so `main` stays
 *  well under the complexity ceiling this harness itself enforces.
 *  @complexity O(n). */
function reportProblems(heading: string, problems: readonly string[]): boolean {
  if (problems.length === 0) return false;
  process.stderr.write(`\ncheck-gates: ${heading}\n`);
  for (const problem of problems) process.stderr.write(`  - ${problem}\n`);
  return true;
}

/**
 * The manifest to run. `--manifest <path>` exists so `check-gates-exit-code.test.ts` can point this
 * runner at deliberately-broken manifests and assert the exit code that comes back — the one claim
 * about this file that must be demonstrated rather than reasoned about.
 *
 * @complexity O(n) in argv.
 */
function flagValue(argv: readonly string[], flag: string, fallback: string): string {
  const at = argv.indexOf(flag);
  if (at === -1 || !argv[at + 1]) return fallback;
  return path.resolve(argv[at + 1]!); // !: non-empty already checked on the line above
}

/** True when a gate is one this run should execute. A gate missing `id` or `run` is already
 *  reported by `validateManifest`; skipping it here avoids a second, noisier complaint. A type
 *  predicate, not just `boolean`, so every caller's `if (isRunnable(gate))` narrows `gate.id` and
 *  `gate.run` to `string` instead of needing a separate assertion at each call site.
 *  @complexity O(1). */
function isRunnable(gate: GateEntry): gate is GateEntry & { id: string; run: string } {
  return gate.enabled !== false && Boolean(gate.id) && Boolean(gate.run);
}

/** Reports every way the manifest fails to describe this harness honestly. Returns whether any did.
 *  @complexity O(n) in gates. */
function reportManifestProblems(manifest: GateManifest, gates: readonly GateEntry[], scriptsDir: string): boolean {
  const driftProblems = detectGateDrift(gates, gateScriptsOnDisk(scriptsDir)).map(
    (name) =>
      `scripts/${name} exists but no gate in quality-gates.json runs it. A gate nobody invokes is ` +
      `how this repo ended up with 11 dead check scripts — register it or delete it.`
  );
  const unsound = reportProblems(
    "quality-gates.json is not a sound description of this harness:",
    validateManifest(manifest, todayIso())
  );
  return reportProblems("gate scripts on disk that nothing runs:", driftProblems) || unsound;
}

function main(): void {
  const argv = process.argv.slice(2);
  const manifestPath = flagValue(argv, "--manifest", path.join(DESKTOP_ROOT, "quality-gates.json"));
  const scriptsDir = flagValue(argv, "--scripts-dir", path.join(DESKTOP_ROOT, "scripts"));
  const manifest: GateManifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  // `asGateEntryArray` throws a clear, index-naming error for a malformed entry (e.g. `null`) rather
  // than letting it pass a blind cast and crash later inside `gateProblems`/`detectGateDrift`; a
  // non-array `gates` is left to `validateManifest`'s own "no gates array" problem, below.
  const gates = asGateEntryArray(manifest.gates);

  const unsound = reportManifestProblems(manifest, gates, scriptsDir);

  // Every enabled gate runs even after an earlier one fails: a run that halts at the first failure
  // reports exactly one problem when several exist, which is the behaviour `ci-local.sh` was
  // written to avoid for the same reason.
  const outcomes = new Map<string | undefined, GateExitCode>();
  for (const gate of gates) {
    if (isRunnable(gate)) outcomes.set(gate.id, runGate(gate));
  }

  process.stdout.write(`${formatSummary(gates, outcomes)}\n`);

  const anyGateFailed = [...outcomes.values()].some(isFailure);
  const missingOutcome = gates.some((gate) => isRunnable(gate) && !outcomes.has(gate.id));
  if (anyGateFailed || missingOutcome || unsound) {
    process.stderr.write("\ncheck-gates: FAILED\n");
    process.exit(1);
  }
  process.stdout.write("\ncheck-gates: OK\n");
}

main();
