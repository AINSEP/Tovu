#!/usr/bin/env node
import { mapErrorToCliOutcome } from "./errors.js";
import { printBareUsageAndExit, printUsageToStderr } from "./help.js";
import { createProgram } from "./program.js";

/**
 * @file SPEC-003 — the `tovu` bin's process entrypoint (C-001/C-002/C-003).
 *
 * Purpose:
 * Builds the `commander` program (`program.ts`), and maps ANY error it or an action handler
 * throws/rejects with (including commander's own `CommanderError`) to `errors.spec.md`'s exit
 * code + single stderr line contract (`cli/errors.ts`). Never itself opens a db or fs handle.
 *
 * `tovu` with zero arguments is handled explicitly, BEFORE `program.parseAsync()` runs: commander's
 * own default zero-argument behavior (a subcommand-style program with no args) writes usage to
 * STDERR and would exit 1 by default — this feature's contract (api.spec.md §6, `CLI_HELP`)
 * requires stdout + exit 0 for the bare-invocation case, matching `--help`'s outcome.
 *
 * Architectural role:
 * `cli` layer. The one process entrypoint for the `tovu` bin — mirrors `src/index.ts`'s existing
 * role for the legacy env-var boot.
 */
async function main(): Promise<void> {
  const program = createProgram();
  const argv = process.argv.slice(2);

  if (argv.length === 0) {
    printBareUsageAndExit(program);
  }

  try {
    await program.parseAsync(argv, { from: "user" });
  } catch (err) {
    const outcome = mapErrorToCliOutcome(err);
    if (outcome.stderrLine) {
      process.stderr.write(`${outcome.stderrLine}\n`);
    }
    if (outcome.printUsage) {
      printUsageToStderr(program);
    }
    process.exit(outcome.exitCode);
  }
}

void main();
