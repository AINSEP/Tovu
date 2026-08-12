import { CommanderError } from "commander";

import {
  InitDirNotEmptyError,
  InternalError,
  SiteCorruptError,
  SiteDirInvalidError,
  SiteNewerThanRuntimeError,
  ValidationError,
} from "../site-dir";

/**
 * @file SPEC-003 — CLI-layer error-to-exit-code mapping (errors.spec.md).
 *
 * Purpose:
 * The ONE place `errors.spec.md`'s exit-code registry is encoded. `site-dir` errors map 1:1 by
 * `.name`; `commander`'s own parsing/dispatch errors (surfaced via `.exitOverride()`) are
 * re-mapped from commander's OWN default exit codes (mostly 1) to this registry's — ADR-PIPE-003
 * v1.1.0's adoption of `commander` changes the parsing MECHANISM only, never the public exit-code
 * contract (api.spec.md §7).
 *
 * Architectural role:
 * `cli` layer only. Consumes `site-dir`'s typed errors and `commander`'s `CommanderError` — never
 * the reverse (`site-dir` has zero knowledge of exit codes or `cli`).
 */

/** `PORT_IN_USE` (exit 1) — the HTTP listener's `EADDRINUSE`, the one CLI-layer-native error this file itself declares (errors.spec.md: "Produced By: HTTP listener EADDRINUSE"). */
export class PortInUseError extends Error {
  constructor(
    message: string,
    public readonly port: number
  ) {
    super(message);
    this.name = "PortInUseError";
  }
}

export interface CliOutcome {
  exitCode: number;
  /** The single `tovu: <CODE>: <message>` stderr line — omitted for a pure success outcome (`--help`). */
  stderrLine?: string;
  /** AC-12: an unknown command must also print usage, beyond the one-line error contract. */
  printUsage?: boolean;
}

const EXIT_CODE_BY_ERROR_CODE: Record<string, number> = {
  VALIDATION: 2,
  INIT_DIR_NOT_EMPTY: 3,
  SITE_DIR_INVALID: 3,
  SITE_NEWER_THAN_RUNTIME: 4,
  SITE_CORRUPT: 5,
  PORT_IN_USE: 1,
  INTERNAL: 1,
};

function stderrLine(code: string, message: string): string {
  return `tovu: ${code}: ${message}`;
}

/** commander error codes that are usage-class failures — errors.spec.md's `VALIDATION` (exit 2). */
const COMMANDER_VALIDATION_CODES = new Set([
  "commander.missingArgument",
  "commander.invalidArgument",
  "commander.excessArguments",
  "commander.unknownOption",
  "commander.unknownCommand",
  "commander.missingMandatoryOptionValue",
  "commander.optionMissingArgument",
]);

/** commander error codes that represent a SUCCESSFUL outcome (help/version already printed by commander itself). */
const COMMANDER_SUCCESS_CODES = new Set(["commander.helpDisplayed", "commander.help", "commander.version"]);

/**
 * Map any error `cli/main.ts` catches to `{ exitCode, stderrLine?, printUsage? }`.
 *
 * @param err - whatever `program.parseAsync()` (commander) or an action handler (`site-dir`
 *   errors, `PortInUseError`, or a genuinely unexpected bug) throws/rejects with.
 * @returns the exit code and (when applicable) the exact single stderr line to print.
 * @complexity O(1) — a fixed sequence of `instanceof`/set-membership checks, not a function of
 *   any caller-controlled collection.
 * @overallScore 100
 */
export function mapErrorToCliOutcome(err: unknown): CliOutcome {
  if (err instanceof CommanderError) {
    if (COMMANDER_SUCCESS_CODES.has(err.code)) {
      return { exitCode: 0 };
    }
    if (COMMANDER_VALIDATION_CODES.has(err.code)) {
      return {
        exitCode: EXIT_CODE_BY_ERROR_CODE.VALIDATION,
        stderrLine: stderrLine("VALIDATION", err.message.replace(/^error:\s*/, "")),
        printUsage: err.code === "commander.unknownCommand",
      };
    }
    // Any other commander-internal error is still an argv-shape/usage problem — commander only
    // ever throws (once `.exitOverride()` is set) for parsing/dispatch issues.
    return { exitCode: EXIT_CODE_BY_ERROR_CODE.VALIDATION, stderrLine: stderrLine("VALIDATION", err.message.replace(/^error:\s*/, "")) };
  }

  if (err instanceof ValidationError) {
    return { exitCode: EXIT_CODE_BY_ERROR_CODE.VALIDATION, stderrLine: stderrLine("VALIDATION", err.message) };
  }
  if (err instanceof InitDirNotEmptyError) {
    return { exitCode: EXIT_CODE_BY_ERROR_CODE.INIT_DIR_NOT_EMPTY, stderrLine: stderrLine("INIT_DIR_NOT_EMPTY", err.message) };
  }
  if (err instanceof SiteDirInvalidError) {
    return { exitCode: EXIT_CODE_BY_ERROR_CODE.SITE_DIR_INVALID, stderrLine: stderrLine("SITE_DIR_INVALID", err.message) };
  }
  if (err instanceof SiteNewerThanRuntimeError) {
    return { exitCode: EXIT_CODE_BY_ERROR_CODE.SITE_NEWER_THAN_RUNTIME, stderrLine: stderrLine("SITE_NEWER_THAN_RUNTIME", err.message) };
  }
  if (err instanceof SiteCorruptError) {
    return { exitCode: EXIT_CODE_BY_ERROR_CODE.SITE_CORRUPT, stderrLine: stderrLine("SITE_CORRUPT", err.message) };
  }
  if (err instanceof PortInUseError) {
    return { exitCode: EXIT_CODE_BY_ERROR_CODE.PORT_IN_USE, stderrLine: stderrLine("PORT_IN_USE", err.message) };
  }
  if (err instanceof InternalError) {
    return { exitCode: EXIT_CODE_BY_ERROR_CODE.INTERNAL, stderrLine: stderrLine("INTERNAL", err.message) };
  }

  // errors.spec.md §4: "INTERNAL | any uncaught error".
  const message = err instanceof Error ? err.message : String(err);
  return { exitCode: EXIT_CODE_BY_ERROR_CODE.INTERNAL, stderrLine: stderrLine("INTERNAL", message) };
}
