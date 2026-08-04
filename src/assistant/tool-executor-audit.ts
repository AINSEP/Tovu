/**
 * @file Wraps `@jini-ai/daemon`'s `ToolExecutor` so every tool-execution ATTEMPT lands in a durable
 * table, including the attempts Jini itself cannot report.
 *
 * Why a decorator rather than an upstream change:
 * `ToolExecutor` is a plain structural interface and `registerDelegatedToolRoutes` accepts anything
 * matching it, so a wrapper is a drop-in at the one place Tovu constructs the executor
 * (`agent-daemon-server.ts`). Jini's own module doc anticipates a host doing exactly this ("a real
 * host that needs audit records to survive a restart layers a durable store behind
 * `getAuditRecord`/an append hook later"), and no such hook exists yet — so this is the sanctioned
 * seam, not a workaround.
 *
 * The two gaps this closes, both verified by reading `packages/daemon/src/tool-executor.ts`:
 *
 * 1. **In-memory only.** Its `audits` is a `Map`, so all execution history dies with the process.
 * 2. **Records are minted too late.** `execute()` awaits `authorizeToolInvocation` FIRST and throws
 *    `unknown tool "<id>"` before `audits.set(...)` runs. So an unknown tool id — or an
 *    authorization that throws — produces no audit row at all, not even a denial. This decorator
 *    appends `requested` BEFORE delegating, which is the ordering WordPress's audit pattern
 *    prescribes ("fire the audit action before any processing, for every call regardless of
 *    outcome") and the only ordering under which those cases leave a trace.
 *
 * Why not wrap each `ToolHandler` instead (the cheaper-looking option): a handler runs only after
 * authorization and confirmation have already passed, so handler-level wrapping observes exactly the
 * attempts that were never the problem and misses every denied or misrouted one.
 *
 * Audit is observation, never a gate. Appends are awaited only far enough to keep phase ordering,
 * and every one goes through `appendSafely`, so a throwing sink is reported and stepped over rather
 * than turning a completed tool call into a failed one. `ToolPolicy.authorize` and the domain-layer
 * `authorize()` remain the only deciders, so ADR-021 §2's single evaluator is untouched by this
 * file — this wrapper cannot deny, delay past its own append, or alter any result.
 *
 * Architectural role:
 * `src/assistant` composition-layer adapter. Depends on the `features/tool-audit` port, never on a
 * concrete sink.
 */
import { randomUUID } from "node:crypto";

import type { Principal, RunRef, SurfaceEmitter } from "@jini-ai/core";
import type { ToolExecutionResult, ToolExecutor } from "@jini-ai/daemon";

import type { ToolAttemptAuditSink, ToolAttemptPhase } from "../features/tool-audit/types";

export interface ToolAttemptAuditOptions {
  /** The workspace every attempt is attributed to — the daemon serves exactly one. */
  workspaceId: string;
  /** Injectable clock for the `at` timestamp. @default `() => new Date().toISOString()` */
  now?: () => string;
  /** Injectable id source for `attemptId`. @default `node:crypto` `randomUUID` */
  newAttemptId?: () => string;
  /** Called when the sink itself throws. Tool execution continues regardless. @default `console.error` */
  onSinkError?: (error: unknown) => void;
}

/**
 * Summarizes an input for the `detail` column WITHOUT retaining any value.
 *
 * Records only the top-level key names and the element count of anything array-shaped. A tool input
 * carries operator content — a field label, a content-type key — and this table is durable, so the
 * values themselves must not enter it. Key names are enough to tell two attempts apart and to see
 * that a call was malformed.
 *
 * @param input - The raw tool input, of any shape.
 * @returns A short, value-free description. Never throws, whatever the input is.
 * @complexity O(k) in the number of top-level keys.
 * @example
 * describeInput({ key: "recipe", fields: [1, 2] }); // 'keys: fields[2], key'
 * @overallScore 100
 */
export function describeInput(input: unknown): string {
  if (input === null || input === undefined) return `input: ${String(input)}`;
  if (Array.isArray(input)) return `input: an array of ${input.length}`;
  if (typeof input !== "object") return `input: a ${typeof input}`;

  const parts = Object.entries(input as Record<string, unknown>)
    .map(([key, value]) => (Array.isArray(value) ? `${key}[${value.length}]` : key))
    .sort();
  return parts.length === 0 ? "keys: none" : `keys: ${parts.join(", ")}`;
}

/** Maps a `ToolExecutionResult.status` onto the phase recorded for it. The unions are aligned by design. */
function phaseForStatus(status: ToolExecutionResult["status"]): ToolAttemptPhase {
  return status as ToolAttemptPhase;
}

/**
 * `ToolExecutor`'s own contract for an unregistered id is a thrown `unknown tool "<id>"`
 * (`tool-executor.ts`), which is the one failure that carries no `executionId` because it happens
 * before one is minted. Distinguished from a handler failure so the two are separable in the table.
 *
 * @complexity O(n) in the message length.
 * @overallScore 90
 *
 * MEDIUM — message-text coupling. `@jini-ai/daemon` throws a plain `Error` for this case with no
 * error code or subclass, so matching its wording is the only signal available. If Jini rewords
 * that message, this silently returns `false` and the attempt is recorded as `failed` instead of
 * `unknown-tool`. The consequence is a less precise audit label, never a lost row or a behavior
 * change, which is why it is accepted rather than worked around. The real fix belongs upstream — a
 * typed error or a code on `ToolExecutor`'s unknown-tool throw — and is worth requesting alongside
 * the audit-sink port whenever that upstream work happens.
 */
function isUnknownToolError(error: unknown): boolean {
  return error instanceof Error && /unknown tool/i.test(error.message);
}

/**
 * Returns a `ToolExecutor` that behaves identically to `inner` while appending every attempt phase
 * to `sink`.
 *
 * @param inner - The real executor from `createToolExecutor`. Its behavior — results, throws,
 * timing — is passed through unchanged; this wrapper adds no decision of its own.
 * @param sink - Where phases are appended. Must not throw (see `ToolAttemptAuditSink`).
 * @param options - `workspaceId` is required; `now`/`newAttemptId` are test seams.
 * @returns A drop-in `ToolExecutor`. `resumeConfirmation`, `cancel` and `getAuditRecord` delegate
 * straight through — Jini's in-memory record remains the source for its own `getAuditRecord`
 * contract, and this table is additive rather than a replacement for it.
 * @example
 * const executor = withToolAttemptAudit(createToolExecutor({ registry }), sink, { workspaceId });
 * @complexity Adds two sink appends per execution, both O(1) at this layer.
 * @overallScore 100
 */
export function withToolAttemptAudit(inner: ToolExecutor, sink: ToolAttemptAuditSink, options: ToolAttemptAuditOptions): ToolExecutor {
  const now = options.now ?? (() => new Date().toISOString());
  const newAttemptId = options.newAttemptId ?? randomUUID;

  /**
   * Appends without ever letting the sink's failure escape.
   *
   * The port already forbids throwing and the SQLite adapter catches internally, so this is belt
   * and braces — but it is the braces that matter: without it, one bad `append` would convert a
   * completed tool call into a thrown error, i.e. an observability failure would become an outage.
   * The `onSinkError` hook keeps that loud instead of silent.
   */
  const appendSafely = async (event: Parameters<ToolAttemptAuditSink["append"]>[0]): Promise<void> => {
    try {
      await sink.append(event);
    } catch (error) {
      (options.onSinkError ?? ((e: unknown) => console.error("[tool-audit] sink threw; tool execution is unaffected", e)))(error);
    }
  };

  return {
    execute: async (
      principal: Principal,
      run: RunRef,
      toolId: string,
      input: unknown,
      signal?: AbortSignal,
      // Forwarded verbatim, and it must stay that way: a handler reads `ctx.emitSurface` to decide
      // whether it may park on a human's answer. Dropping it here would not degrade to "no
      // surface" — it would silently push every human-in-the-loop tool onto its fallback path.
      emitSurface?: SurfaceEmitter,
    ): Promise<ToolExecutionResult> => {
      const attemptId = newAttemptId();
      const base = { attemptId, workspaceId: options.workspaceId, runId: run.id, toolId, principalId: principal.id };

      // BEFORE delegating — this ordering is the whole point of the file. Anything appended after
      // `inner.execute` would miss the unknown-tool and throwing-authorization cases entirely.
      await appendSafely({ ...base, executionId: null, phase: "requested", at: now(), detail: describeInput(input) });

      try {
        const result = await inner.execute(principal, run, toolId, input, signal, emitSurface);
        await appendSafely({ ...base, executionId: result.executionId, phase: phaseForStatus(result.status), at: now(), detail: result.truncated ? "output truncated" : null });
        return result;
      } catch (error) {
        const phase: ToolAttemptPhase = isUnknownToolError(error) ? "unknown-tool" : "failed";
        // The error's CLASS and nothing else: a handler's message can embed operator content.
        await appendSafely({ ...base, executionId: null, phase, at: now(), detail: error instanceof Error ? error.name : typeof error });
        throw error;
      }
    },
    resumeConfirmation: (executionId, decision) => inner.resumeConfirmation(executionId, decision),
    cancel: (executionId) => inner.cancel(executionId),
    getAuditRecord: (executionId) => inner.getAuditRecord(executionId),
  };
}
