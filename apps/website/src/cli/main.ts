#!/usr/bin/env node
import { runCliProgram } from "@jini-ai/cli";

import { mapErrorToCliOutcome } from "./errors.js";
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
 * requires stdout + exit 0 for the bare-invocation case, matching `--help`'s outcome. The loop
 * itself is `@jini-ai/cli` `runCliProgram`; the usage printers it uses replaced `cli/help.ts`.
 *
 * Architectural role:
 * `cli` layer. The one process entrypoint for the `tovu` bin — mirrors `src/index.ts`'s existing
 * role for the legacy env-var boot.
 */
// The bin binds every process effect here; `runCliProgram` (bare-usage bypass, parse, map, exit)
// never defaults to `process` itself.
void runCliProgram({
  createProgram,
  mapError: mapErrorToCliOutcome,
  argv: process.argv.slice(2),
  stdout: process.stdout,
  stderr: process.stderr,
  exit: (code) => process.exit(code),
});
