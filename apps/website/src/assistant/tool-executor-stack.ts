/**
 * @file The one place Tovu's `ToolExecutor` decorator stack is composed.
 *
 * The order of these three wrappers is load-bearing in two different directions, and it was
 * previously spelled out only as an expression inside `agent-daemon-server.ts` — a module that boots
 * Express, opens a database, and spawns agents, so nothing could exercise the composition without
 * booting all of it. A security property that no test can reach is a security property that drifts:
 * the read-only gateway's bypass (see `read-only-tool-constraint.ts`) lived precisely in the gap
 * between "the route check is tested" and "the composition is not". This function closes that gap by
 * being the composition, callable on its own.
 *
 * Innermost to outermost:
 *
 * 1. `withReadOnlyToolConstraint` — wraps the BARE executor, so every dispatch by every layer above
 *    it, including a tool id no caller ever named, has to pass the read-only gate to reach a handler.
 *    Anything further out would be bypassed by whatever sits beneath it.
 * 2. `withRedactedToolFailures` (2026-09-16) — blanks secret-shaped values out of every `failed`
 *    result and mints its `ERR-…` id, per the owner's "hide secrets only" ruling (see that file's own
 *    header). Sits ABOVE the read-only gate so a read-only refusal (`status: 'denied'`, set by layer
 *    1, never `'failed'`) is never touched by it, and BELOW `withToolAttemptAudit` so the audit sees
 *    the finished `errorId` and can store it (`tool-executor-audit.ts`). It sits INSIDE
 *    `withToolFailureRecovery` (layer 4) rather than outside it: recovery's own read-only-remedy
 *    refusal message is set on the OUTER result, after this layer has already run, so that message is
 *    never redacted either — only the original/remedy/retry calls recovery makes THROUGH `inner` pass
 *    through this layer, each redacted on its own.
 * 3. `withToolAttemptAudit` — appends `requested` BEFORE delegating, which is the only ordering that
 *    records an unknown tool id or a throwing authorization (see that file's own doc). Sitting above
 *    the constraint gate means a read-only refusal is itself audited as a denial. Skipped entirely
 *    when the caller supplies no `toolAttemptAudit` — see {@link AssistantToolExecutorDeps}'s own doc.
 * 4. `withToolFailureRecovery` — outermost, so the remedy call and the retry it can make each land as
 *    their own audited attempt row. The opposite order would collapse all three into the one outer
 *    "completed" row the audit records for the call the transport actually made, losing the remedy
 *    tool's own attempt from the trail entirely.
 *
 * Composed the SAME way for both of Tovu's tool-dispatch surfaces: the agent daemon's delegated-tool
 * route and BYOK's `byok-tool-surface.ts` (as of 2026-09-06 — previously BYOK hand-assembled its own
 * second copy of this stack that never wrapped `withReadOnlyToolConstraint`, so a decorator known to
 * apply to "every read-only gateway" in fact applied to only one of the two; see that file's own
 * `executor` construction for the call site).
 *
 * Architectural role: `src/assistant` composition-layer adapter. Takes its collaborators as
 * arguments and constructs no policy, sink, or registry of its own.
 */
import { createToolExecutor, type ToolExecutor } from "@jini-ai/daemon";
import type { ToolRegistry } from "@jini-ai/core";

import type { ToolAttemptAuditSink } from "../features/tool-audit/types.js";
import type { SurfaceExchangeStore } from "../contracts/core/tool-surface-exchanges.js";
import { withReadOnlyToolConstraint } from "./read-only-tool-constraint.js";
import { withToolAttemptAudit } from "./tool-executor-audit.js";
import { withToolFailureRecovery } from "./tool-failure-recovery.js";
import { withRedactedToolFailures, type RedactedToolFailuresDeps } from "./tool-failure-redaction.js";

export interface AssistantToolExecutorDeps {
  /** The registry every tool is registered on — the executor runs against it, and both the read-only
   *  gate and the recovery loop read descriptors out of it. One instance, deliberately: a second
   *  registry would let the gate check a descriptor other than the one that actually runs. */
  readonly registry: ToolRegistry;
  /** The SAME store `registerMcpUiToolCallsRoute` is mounted with, or the recovery loop's surface is
   *  unreachable — see `tool-surface-exchanges.ts`'s own `AssistantSurfaceDeps` doc. */
  readonly surfaceExchanges: SurfaceExchangeStore;
  /**
   * Where every attempt phase is appended, and the workspace it is attributed to. Optional so a
   * caller with no durable audit sink gets an executor that skips `withToolAttemptAudit` entirely
   * rather than being forced to supply one — the daemon (`agent-daemon-server.ts`) always has one and
   * always passes it; BYOK's own tests composing a bare surface, and this factory's callers in
   * general, need the "no sink" case to remain a real, first-class option rather than requiring a
   * stand-in no-op sink. Named and shaped to match `createByokToolSurface`'s identical
   * `toolAttemptAudit` option exactly, so a caller already holding that shape passes it straight
   * through with no reshaping.
   */
  readonly toolAttemptAudit?: { readonly sink: ToolAttemptAuditSink; readonly workspaceId: string };
  /** Test seam for `withRedactedToolFailures` (a fixed error ID, a captured `onFailure`). Production
   *  callers pass nothing and get the real minter and the real `[tool-failure]` log line. */
  readonly toolFailures?: RedactedToolFailuresDeps;
}

/**
 * Builds the fully decorated `ToolExecutor` shared by every caller that dispatches Tovu's tool
 * catalog — the agent daemon's own delegated-tool route (`agent-daemon-server.ts`) and BYOK's
 * `byok-tool-surface.ts`, as of the 2026-09-06 parity fix. Both get the identical three-decorator
 * stack, so a hardening landed here (or a future decorator added here) cannot silently reach one
 * caller and not the other — see this file's own header for why that was previously true only in
 * theory: BYOK hand-composed a second, independent stack that never wrapped
 * `withReadOnlyToolConstraint` at all.
 *
 * @returns A `ToolExecutor` behaving exactly like `createToolExecutor({registry})` for any
 *   unconstrained principal, plus a redacted, ID-tagged failure text for every internal failure
 *   (`withRedactedToolFailures`), plus (when `toolAttemptAudit` is supplied) a durable attempt trail,
 *   and the failure-recovery loop.
 * @complexity Composition only — O(1); each decorator's own cost is documented on it.
 */
export function createAssistantToolExecutor(deps: AssistantToolExecutorDeps): ToolExecutor {
  const readOnlyGuarded = withReadOnlyToolConstraint(createToolExecutor({ registry: deps.registry }), { registry: deps.registry });
  const redacted = withRedactedToolFailures(readOnlyGuarded, deps.toolFailures);
  const audited = deps.toolAttemptAudit
    ? withToolAttemptAudit(redacted, deps.toolAttemptAudit.sink, { workspaceId: deps.toolAttemptAudit.workspaceId })
    : redacted;
  return withToolFailureRecovery(audited, { surfaceExchanges: deps.surfaceExchanges, registry: deps.registry });
}
