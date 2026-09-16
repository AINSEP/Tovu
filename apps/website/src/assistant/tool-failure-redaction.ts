/**
 * @file Blanks secret-shaped values out of a FAILED tool's error text and mints a durable, copyable
 * error ID for the ones that need server-side follow-up — the 2026-09-16 owner decision ("hide
 * secrets only"): a failed tool's error stays visible everywhere it already reaches (the model, the
 * chat transcript, the tool card, admin BYOK, the daemon's delegated-tool route, the MCP-UI
 * redemption endpoint, http-kit's server log), only a secret-shaped VALUE inside it never does.
 *
 * ## Position — see `tool-executor-stack.ts`'s own header
 * Sits between `withReadOnlyToolConstraint` and `withToolAttemptAudit`, and INSIDE
 * `withToolFailureRecovery` (which calls `inner` for the original call, the remedy, and the retry —
 * each one redacted here). A read-only refusal is set by `withToolFailureRecovery` on the OUTER
 * result, after this layer has already run, so it is never touched by it.
 *
 * ## Behavior by result
 * | Result | Action |
 * |---|---|
 * | `failed` with `errorKind` `'internal'` or missing | Redact, mint an ID, prefix `Error <ID>: `, add `errorId`, report one {@link ToolFailureRecord} |
 * | `failed` with `errorKind: 'validation'` | Redact only — no ID, no record. Byte-identical when nothing secret-shaped is present |
 * | any other status | Returned as the SAME object, untouched |
 * | inner throws | Rethrown untouched |
 *
 * A validation failure is the caller's own input problem: its message is already the full, safe
 * reason, and nothing about it needs a server-side lookup — see `contracts/core/secret-redaction.ts`
 * for why only the VALUE is ever blanked, never the surrounding text.
 *
 * Architectural role: `src/assistant` composition-layer adapter, same layer as
 * `tool-executor-audit.ts` and `tool-failure-recovery.ts`. Depends only on the pure
 * `contracts/core/secret-redaction.ts` engine and `@jini-ai/daemon`'s `ToolExecutor` shape.
 */
import { randomBytes } from "node:crypto";

import type { Principal, RunRef, SurfaceEmitter } from "@jini-ai/core";
import type { ToolExecutionResult, ToolExecutor } from "@jini-ai/daemon";

import { describeErrorForLog } from "../contracts/core/model-facing-tool-errors.js";
import { redactSecretShapes } from "../contracts/core/secret-redaction.js";

/** Matches a minted error ID anywhere in a string — exported for tests and for a later chat-side
 *  copy button (`ToolCard` matching this against `result.content`, tracked separately). */
export const TOOL_ERROR_ID_PATTERN = /\bERR-[0-9A-F]{4}(?:-[0-9A-F]{4}){3}\b/;

/**
 * Mints one error ID: 64 bits of `crypto.randomBytes`, formatted `ERR-XXXX-XXXX-XXXX-XXXX`.
 *
 * @returns A string always matching {@link TOOL_ERROR_ID_PATTERN}.
 * @complexity O(1).
 */
export function mintToolErrorId(): string {
  const hex = randomBytes(8).toString("hex").toUpperCase();
  const groups = hex.match(/.{4}/g) ?? [];
  return `ERR-${groups.join("-")}`;
}

/** A `ToolExecutionResult` that may additionally carry the minted error ID — the ONLY field this
 *  decorator ever adds. Every other field is `inner`'s own, untouched. */
export type RedactedToolExecutionResult = ToolExecutionResult & { readonly errorId?: string };

/**
 * Reads the error ID this decorator attached, if any.
 *
 * @param result - Any `ToolExecutionResult`, redacted or not.
 * @returns The ID, or `undefined` for a result this decorator never touched (not `failed`,
 *   `errorKind: 'validation'`, or produced upstream of this layer).
 * @complexity O(1).
 */
export function readToolErrorId(result: ToolExecutionResult): string | undefined {
  const id = (result as RedactedToolExecutionResult).errorId;
  return typeof id === "string" ? id : undefined;
}

/** The value-free server-side record for one internal failure — everything needed to find the
 *  tool, run, principal, execution and full (already redacted) message under its ID, with no secret
 *  value ever entering it. `message` is the text AFTER {@link redactSecretShapes}. */
export interface ToolFailureRecord {
  readonly errorId: string;
  readonly toolId: string;
  readonly runId: string;
  readonly principalId: string;
  readonly executionId: string;
  readonly redactions: number;
  readonly message: string;
}

export interface RedactedToolFailuresDeps {
  /** Test seam for a deterministic ID. @default {@link mintToolErrorId} */
  readonly mintErrorId?: () => string;
  /** Where a {@link ToolFailureRecord} is reported for every internal failure. @default one
   *  `console.error` line (`logToolFailure` below) — the §3(b) server-side record. Must not throw;
   *  a throwing sink is caught and logged, never allowed to turn a redacted result into a thrown
   *  error. */
  readonly onFailure?: (record: ToolFailureRecord) => void;
}

/** Default `onFailure`: one `[tool-failure]` log line carrying the ID, the correlating ids, the
 *  redaction count, and the ALREADY-REDACTED message — never the raw text. See this file's header
 *  for why the raw value is never logged. */
function logToolFailure(record: ToolFailureRecord): void {
  console.error(
    `[tool-failure] ${record.errorId} tool=${record.toolId} run=${record.runId} execution=${record.executionId} principal=${record.principalId} redactions=${record.redactions}: ${record.message}`,
  );
}

/** Calls `onFailure`, catching and logging a throw so a hostile or buggy sink can never turn a
 *  redacted result into a thrown error — audit is observation, never a gate, the same rule
 *  `tool-executor-audit.ts`'s `appendSafely` enforces for its own sink. */
function safeOnFailure(onFailure: (record: ToolFailureRecord) => void, record: ToolFailureRecord): void {
  try {
    onFailure(record);
  } catch (error) {
    console.error("[tool-failure] sink threw", describeErrorForLog(error));
  }
}

/** The correlating ids `redactFailedResult` needs, pulled out of `execute`'s own parameters so the
 *  function below takes one small object instead of three positional strings. */
interface FailureContext {
  readonly toolId: string;
  readonly runId: string;
  readonly principalId: string;
}

/**
 * Redacts one `failed` result per this file's Behavior table — the only place this file makes a
 * decision; `withRedactedToolFailures` itself is pure plumbing around this.
 *
 * @complexity O(1) plus {@link redactSecretShapes}'s own O(text length) pass.
 */
function redactFailedResult(result: ToolExecutionResult, context: FailureContext, deps: RedactedToolFailuresDeps): ToolExecutionResult {
  if (result.errorKind === "validation") {
    if (result.error === undefined) return result;
    return { ...result, error: redactSecretShapes(result.error).text };
  }

  const mintErrorId = deps.mintErrorId ?? mintToolErrorId;
  const onFailure = deps.onFailure ?? logToolFailure;
  const { text, redactions } = redactSecretShapes(result.error ?? `tool "${context.toolId}" failed`);
  const errorId = mintErrorId();

  safeOnFailure(onFailure, {
    errorId,
    toolId: context.toolId,
    runId: context.runId,
    principalId: context.principalId,
    executionId: result.executionId,
    redactions,
    message: text,
  });

  const redacted: RedactedToolExecutionResult = { ...result, error: `Error ${errorId}: ${text}`, errorId };
  return redacted;
}

/**
 * Wraps `inner` so every `failed` result it produces is redacted per this file's Behavior table
 * before any caller — recovery, the BYOK map, the delegated-tool bridge, the MCP-UI route, or
 * http-kit's log — ever sees it. Every other status, and every throw, passes through unchanged.
 *
 * @param inner - The executor to wrap. Its own decisions (status, `errorKind`, throwing) are never
 *   second-guessed here — this layer only ever transforms an already-`failed` result's `error` text.
 * @param deps - Test seams; production callers pass nothing and get the real minter and logger.
 * @returns A drop-in `ToolExecutor`. `resumeConfirmation`, `cancel`, `getAuditRecord` delegate
 *   straight through, matching `tool-failure-recovery.ts`'s and `tool-executor-audit.ts`'s own shape.
 * @complexity O(1) beyond `inner`'s own cost and {@link redactFailedResult}'s.
 */
export function withRedactedToolFailures(inner: ToolExecutor, deps: RedactedToolFailuresDeps = {}): ToolExecutor {
  return {
    execute: async (
      principal: Principal,
      run: RunRef,
      toolId: string,
      input: unknown,
      signal?: AbortSignal,
      emitSurface?: SurfaceEmitter,
    ): Promise<ToolExecutionResult> => {
      const result = await inner.execute(principal, run, toolId, input, signal, emitSurface);
      if (result.status !== "failed") return result;
      return redactFailedResult(result, { toolId, runId: run.id, principalId: principal.id }, deps);
    },
    resumeConfirmation: (executionId, decision) => inner.resumeConfirmation(executionId, decision),
    cancel: (executionId) => inner.cancel(executionId),
    getAuditRecord: (executionId) => inner.getAuditRecord(executionId),
  };
}
