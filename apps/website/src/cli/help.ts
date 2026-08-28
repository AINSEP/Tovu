import type { Command } from "commander";

/**
 * @file SPEC-003 C-003 (`CLI_HELP`) — usage/discoverability, configured to match
 * `errors.spec.md`/`api.spec.md §6`'s Status Code Map exactly (commander's OWN defaults differ
 * and must be overridden, per ADR-PIPE-003 v1.1.0's Module/Service Boundaries note for this file).
 *
 * Contract this file encodes (all three outcomes commander's own defaults do NOT match
 * out-of-the-box):
 *   - `tovu --help`            -> exit 0, usage to stdout (commander's own default already does
 *                                 this once `.exitOverride()` is set — no override needed here).
 *   - `tovu` (bare, no args)   -> exit 0, usage to stdout. Commander's own default for a
 *                                 subcommand-style program with zero args writes to STDERR and
 *                                 exits 1 — `cli/main.ts` calls `printBareUsage` BEFORE ever
 *                                 invoking `program.parseAsync()` to bypass that default entirely.
 *   - `tovu <unknown-command>` -> exit 2, usage printed (AC-12). `cli/errors.ts` maps commander's
 *                                 `commander.unknownCommand` to exit 2; `printUsageToStderr` (this
 *                                 file) is what actually prints the usage text for that case.
 *
 * Architectural role:
 * `cli` layer. Pure formatting over the `commander` `Command` instance `program.ts` builds — no
 * exit-code decisions live here (that mapping is `cli/errors.ts`'s job); this file only knows how
 * to render usage text to the right stream.
 */

/** `tovu` with zero arguments: usage to stdout, exit 0 (bypasses `program.parseAsync()` entirely). */
export function printBareUsageAndExit(program: Command): never {
  process.stdout.write(program.helpInformation());
  return process.exit(0);
}

/** AC-12: an unknown command's mapped `VALIDATION` stderr line is followed by usage text. */
export function printUsageToStderr(program: Command): void {
  process.stderr.write(program.helpInformation());
}
