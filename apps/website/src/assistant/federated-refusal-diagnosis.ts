/**
 * @file The CALL-TIME half of "a refusal must never be silent" — `mcp-federation/refusal-notice.ts`
 * is the BOOT-TIME half (the prompt prefix every run starts with). Read that file's header first;
 * this one only makes sense as the second half of the same incident.
 *
 * ---------------------------------------------------------------------------
 * The defect this closes
 * ---------------------------------------------------------------------------
 * A federated tool this boot refused is never registered (`mcp-federation/trust.ts`'s
 * `admitRemoteTools`), so `@jini-ai/daemon`'s `createToolExecutor` does the only thing its contract
 * allows for an id it does not know: it THROWS `ToolExecutor: unknown tool "<id>"` — "a
 * routing/programming error", per that file's own doc, never a `ToolExecutionResult`. That throw
 * propagates through every decorator in `tool-executor-stack.ts` (each of which passes it through
 * unchanged) and out through `@jini-ai/http-kit`'s `delegated-tools.ts`, whose route wraps the whole
 * call in a try/catch that treats ANY throw as SEC-005-worthy: it redacts the message to a bare
 * `INTERNAL_ERROR` + correlation id and sends the real text ONLY to `onInternalError` (the daemon's
 * `console.error`). The model — and therefore the user — sees an opaque 500 indistinguishable from a
 * genuine internal fault, for a call that was in fact refused for a nameable, fixable reason.
 *
 * `mcp-federation/refusal-notice.ts` already solves the ENUMERATION half of this (the boot prompt
 * names every actionable refusal up front) but deliberately never mentions `not-in-operator-allowlist`
 * (its R-B: reporting every tool an operator never asked for would spam the prompt on a real server
 * with dozens of unwanted tools). That silence is correct for a list nobody asked to see. It is not
 * correct for a call the model actually attempted — the model has, by naming this exact tool id,
 * already decided it wants it, so telling it why the call failed is never noise. See
 * `refusal-notice.ts`'s `explainFederatedToolRefusal` for the one explanation R-B withholds from the
 * boot prefix but this file needs for an attempt.
 *
 * ---------------------------------------------------------------------------
 * Why a decorator, and why OUTERMOST
 * ---------------------------------------------------------------------------
 * `ToolExecutor` is a plain structural interface and every one of Tovu's existing decorators
 * (`read-only-tool-constraint.ts`, `tool-executor-audit.ts`, `tool-failure-recovery.ts`,
 * `tool-executor-stack.ts`) is exactly this shape — a wrapper, not an upstream change. This one is
 * composed OUTSIDE all three of those (see `agent-daemon-server.ts`'s `toolExecutor` construction),
 * not folded into `tool-executor-stack.ts` itself: every existing decorator still sees and classifies
 * the ORIGINAL throw exactly as it does today — `tool-executor-audit.ts`'s `isUnknownToolError` still
 * records an `unknown-tool` audit row, byte-for-byte the current behavior — and this layer only ever
 * intercepts what is ABOUT TO ESCAPE the whole stack, converting it into a legible result at the very
 * last moment instead of an opaque throw. Composed here rather than baked into
 * `createAssistantToolExecutor` for the same reason `tool-executor-stack.ts` stays free of federation
 * concerns: BYOK shares that stack and has no federated connections or admission snapshot to check
 * against.
 *
 * ---------------------------------------------------------------------------
 * Why the result is `status: 'failed', errorKind: 'validation'`
 * ---------------------------------------------------------------------------
 * Not a new status, and not `'denied'`: `@jini-ai/http-kit`'s `delegated-tools.ts` already maps
 * `'failed'` with `errorKind === 'validation'` to a real, UN-redacted `400 BAD_REQUEST` carrying the
 * handler's own message verbatim — the exact "reason reaches the model" property this file exists
 * for, already wired, with zero changes to any Jini package. `'denied'` was considered and rejected:
 * `toolExecutionResultToApiResult` maps it to a FIXED string ("this operation was denied by policy")
 * and ignores `ToolExecutionResult.error` entirely, so a custom message placed there would never reach
 * the wire. `'validation'` is a deliberate reuse of a status that normally means "the caller's input
 * was malformed" for a case that is really "the caller's TARGET was refused" — accepted because it is
 * the only existing carrier for a free-text, non-redacted message, and because both share the same
 * caller-facing shape: a call the requester can fix by asking for something else, not a fault on this
 * side.
 *
 * Architectural role:
 * `src/assistant` composition-layer adapter, matching its three siblings above. Depends only on
 * `mcp-federation`'s pure reduction functions — no I/O, no registry, no protocol of its own.
 */
import { randomUUID } from "node:crypto";

import type { Principal, RunRef, SurfaceEmitter } from "@jini-ai/core";
import type { ToolExecutionResult, ToolExecutor } from "@jini-ai/daemon";

import { FEDERATED_TOOL_ID_PREFIX } from "./mcp-federation/trust.js";
import { findFederatedToolRefusal, type FederationAdmissionSnapshotEntry } from "./mcp-federation/refusal-notice.js";

/**
 * `ToolExecutor.execute`'s own contract for an unregistered id (`@jini-ai/daemon`'s
 * `tool-executor.ts`): a thrown `Error` reading `unknown tool "<id>"`, with no code or subclass to
 * match on instead. Duplicated from `tool-executor-audit.ts`'s identical `isUnknownToolError` rather
 * than imported: that file is a sibling one layer up with no dependency on `mcp-federation`, and
 * importing across that line for an 18-character regex is not worth the coupling. Both copies carry
 * the same MEDIUM message-text-coupling note that file's own doc records — if `@jini-ai/daemon`
 * rewords this message, this decorator silently stops matching and every call it would have
 * diagnosed falls back to today's opaque redaction, never a worse or incorrect outcome.
 *
 * @complexity O(n) in the message length.
 * @overallScore 90
 */
function isUnknownToolError(error: unknown): boolean {
  return error instanceof Error && /unknown tool/i.test(error.message);
}

/**
 * Wraps `inner` so a call naming a federated tool id THIS BOOT REFUSED fails with a message naming
 * the tool, the server, and the fix, instead of the bare `unknown tool` throw escaping all the way to
 * `@jini-ai/http-kit`'s SEC-005 redaction.
 *
 * @param getSnapshot - Reads the CURRENT admission snapshot lazily, not a value closed over once —
 *   this decorator is composed in `agent-daemon-server.ts` before `attachFederatedMcpTools` resolves
 *   (mirroring that file's own `federationRefusalPrefix` `let` binding for the identical reason), so
 *   a plain array parameter captured at construction time would forever see the empty pre-boot
 *   snapshot. Pass `() => federationAdmissionReports` (a closure over the module-scope binding), not
 *   `() => someArrayCapturedNow`.
 * @returns A drop-in `ToolExecutor`. Every call that is not BOTH (a) an unknown-tool throw AND (b) a
 *   federated id this boot's snapshot actually refused passes through with byte-identical behavior —
 *   completed results, every other status, and the throw itself for a genuinely unknown or
 *   native-typo id — so `resumeConfirmation`/`cancel`/`getAuditRecord` delegate straight through with
 *   no wrapping at all.
 * @complexity One extra `instanceof`/regex test and one string-prefix test per call that reaches
 *   `catch` — already the unhappy path; {@link findFederatedToolRefusal}'s own O(connections ×
 *   refusals) cost only when both tests pass.
 * @overallScore 100
 */
export function withFederatedRefusalDiagnosis(
  inner: ToolExecutor,
  getSnapshot: () => readonly FederationAdmissionSnapshotEntry[],
): ToolExecutor {
  return {
    execute: async (
      principal: Principal,
      run: RunRef,
      toolId: string,
      input: unknown,
      signal?: AbortSignal,
      emitSurface?: SurfaceEmitter,
    ): Promise<ToolExecutionResult> => {
      try {
        return await inner.execute(principal, run, toolId, input, signal, emitSurface);
      } catch (error) {
        if (!isUnknownToolError(error) || !toolId.startsWith(FEDERATED_TOOL_ID_PREFIX)) throw error;
        const refusal = findFederatedToolRefusal(toolId, getSnapshot());
        if (refusal === null) throw error;
        return {
          executionId: randomUUID(),
          status: "failed",
          errorKind: "validation",
          error: `tool "${refusal.remoteName}" on external server "${refusal.connectionId}" was refused: ${refusal.explanation}`,
        };
      }
    },
    resumeConfirmation: (executionId, decision) => inner.resumeConfirmation(executionId, decision),
    cancel: (executionId) => inner.cancel(executionId),
    getAuditRecord: (executionId) => inner.getAuditRecord(executionId),
  };
}
