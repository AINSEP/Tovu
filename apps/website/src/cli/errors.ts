import { CommanderError } from "commander";

import {
  InitDirNotEmptyError,
  InternalError,
  SiteCorruptError,
  SiteDirInvalidError,
  SiteNewerThanRuntimeError,
  SiteRepairRefusedError,
  ValidationError,
  type SiteRepairRefusalReason,
} from "../platform/site-dir/index.js";
import { ExportOutputNotEmptyError } from "../platform/export/index.js";

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

/** `EXPORT_INCOMPLETE` (exit 6) — `tovu export` ran to completion but at least one route failed to
 *  render (`cli/commands/export.ts`'s own error, thrown AFTER the honest report has already been
 *  printed) — a genuinely distinct outcome from a crash (`INTERNAL`) or a bad argument
 *  (`VALIDATION`): the export partially succeeded and wrote everything it could. */
export class ExportIncompleteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExportIncompleteError";
  }
}

/**
 * `EXPORT_BLOCKED_PENDING_RECOVERY` (exit 7) — 2026-09-06 composition-root fix. `tovu export` ran
 * `createSqliteRouteDeps()` and booted the real `createApp()`-equivalent (`exportSite()`'s own
 * internal crawl listener) without ever running `runBootLifecycle`/`buildBootModules` first, unlike
 * `tovu serve` — so the `database-migration-reconciliation` scan (`reconcile-interrupted-migration.ts`,
 * the one that detects a crash-interrupted migration and flips `siteStatusRepo` to
 * `BLOCKED_PENDING_RECOVERY`) never ran before an export, and a site left mid-migration by a crash
 * could be exported from possibly-inconsistent data with no warning at all. `cli/commands/export.ts`
 * now runs that same scan directly and refuses outright when it detects one, rather than either
 * silently exporting or letting the crawl surface it indirectly as N confusing per-route failures.
 * A genuinely distinct outcome from `EXPORT_INCOMPLETE` (that means "ran, but some routes failed to
 * render"; this means "refused to run at all").
 */
export class ExportBlockedPendingRecoveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExportBlockedPendingRecoveryError";
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
  // `tovu export`-only codes (not part of the original errors.spec.md registry): 3 is reused
  // deliberately for EXPORT_OUTPUT_NOT_EMPTY — same "a pre-existing directory blocks a create-shaped
  // operation" class as INIT_DIR_NOT_EMPTY, so it shares that code rather than minting a new one for
  // an identical usage-error shape. EXPORT_INCOMPLETE (6) is genuinely new: no existing code means
  // "ran, but not everything succeeded."
  EXPORT_OUTPUT_NOT_EMPTY: 3,
  EXPORT_INCOMPLETE: 6,
  EXPORT_BLOCKED_PENDING_RECOVERY: 7,
};

/**
 * `tovu adopt`'s refusals (`site-dir/repair-site.ts`) mapped onto the EXISTING registry above — no
 * new exit code is minted, because each refusal is already one of the registry's documented
 * conditions, just detected before a boot rather than during one:
 *   - the first four are all "this directory is not a valid site dir" — the same condition `serve`
 *     answers with `SITE_DIR_INVALID` (3) for the very same directory;
 *   - a divergent lineage is `SITE_NEWER_THAN_RUNTIME` (4) by that code's own definition, which is
 *     "newer than, OR DIVERGES FROM, the runtime's" (REQ-05(b)/RT-005) — `compareSchemaVersion`
 *     raises exactly this for the same divergence at `serve` time, so `adopt` refusing earlier must
 *     not report it under a different code.
 * Mapped from the typed `reason`, never from the message text, so a reworded refusal cannot silently
 * change an exit code.
 */
const OUTCOME_BY_REPAIR_REFUSAL: Record<SiteRepairRefusalReason, "SITE_DIR_INVALID" | "SITE_NEWER_THAN_RUNTIME"> = {
  NOT_A_DIRECTORY: "SITE_DIR_INVALID",
  MARKER_ALREADY_EXISTS: "SITE_DIR_INVALID",
  CONTENT_DB_MISSING: "SITE_DIR_INVALID",
  CONTENT_DB_UNMIGRATED: "SITE_DIR_INVALID",
  CONTENT_DB_DIVERGED: "SITE_NEWER_THAN_RUNTIME",
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
 * The `site-dir` domain's own typed errors, mapped 1:1 by CLASS (never by `.name`, so a foreign
 * object merely carrying the same `name` string can never claim a domain exit code). Split out of
 * {@link mapErrorToCliOutcome} 2026-09-06 when `SiteRepairRefusedError` was added: the single
 * `instanceof` chain had already reached the cognitive-complexity ceiling, and one more branch
 * would have pushed it over. Behavior is unchanged — same classes, same codes, and the classes are
 * mutually exclusive (none extends another), so the split cannot reorder any outcome.
 *
 * `InternalError` is deliberately NOT here: it stays in the caller's own final position, immediately
 * before the "any uncaught error" fallback it shares an exit code with.
 *
 * @returns the outcome, or `undefined` when `err` is not one of these — never a partial match.
 * @complexity O(1) — a fixed sequence of `instanceof` checks.
 */
function mapSiteDirError(err: unknown): CliOutcome | undefined {
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
  if (err instanceof SiteRepairRefusedError) {
    const code = OUTCOME_BY_REPAIR_REFUSAL[err.reason];
    return { exitCode: EXIT_CODE_BY_ERROR_CODE[code], stderrLine: stderrLine(code, err.message) };
  }
  return undefined;
}

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

  const siteDirOutcome = mapSiteDirError(err);
  if (siteDirOutcome) return siteDirOutcome;

  if (err instanceof PortInUseError) {
    return { exitCode: EXIT_CODE_BY_ERROR_CODE.PORT_IN_USE, stderrLine: stderrLine("PORT_IN_USE", err.message) };
  }
  if (err instanceof ExportOutputNotEmptyError) {
    return { exitCode: EXIT_CODE_BY_ERROR_CODE.EXPORT_OUTPUT_NOT_EMPTY, stderrLine: stderrLine("EXPORT_OUTPUT_NOT_EMPTY", err.message) };
  }
  if (err instanceof ExportIncompleteError) {
    return { exitCode: EXIT_CODE_BY_ERROR_CODE.EXPORT_INCOMPLETE, stderrLine: stderrLine("EXPORT_INCOMPLETE", err.message) };
  }
  if (err instanceof ExportBlockedPendingRecoveryError) {
    return {
      exitCode: EXIT_CODE_BY_ERROR_CODE.EXPORT_BLOCKED_PENDING_RECOVERY,
      stderrLine: stderrLine("EXPORT_BLOCKED_PENDING_RECOVERY", err.message),
    };
  }
  if (err instanceof InternalError) {
    return { exitCode: EXIT_CODE_BY_ERROR_CODE.INTERNAL, stderrLine: stderrLine("INTERNAL", err.message) };
  }

  // errors.spec.md §4: "INTERNAL | any uncaught error".
  const message = err instanceof Error ? err.message : String(err);
  return { exitCode: EXIT_CODE_BY_ERROR_CODE.INTERNAL, stderrLine: stderrLine("INTERNAL", message) };
}
