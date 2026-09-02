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
 * 2. `withToolAttemptAudit` — appends `requested` BEFORE delegating, which is the only ordering that
 *    records an unknown tool id or a throwing authorization (see that file's own doc). Sitting above
 *    the constraint gate means a read-only refusal is itself audited as a denial.
 * 3. `withToolFailureRecovery` — outermost, so the remedy call and the retry it can make each land as
 *    their own audited attempt row. The opposite order would collapse all three into the one outer
 *    "completed" row the audit records for the call the transport actually made, losing the remedy
 *    tool's own attempt from the trail entirely.
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

export interface AssistantToolExecutorDeps {
  /** The registry every tool is registered on — the executor runs against it, and both the read-only
   *  gate and the recovery loop read descriptors out of it. One instance, deliberately: a second
   *  registry would let the gate check a descriptor other than the one that actually runs. */
  readonly registry: ToolRegistry;
  /** Where every attempt phase is appended. */
  readonly auditSink: ToolAttemptAuditSink;
  /** The SAME store `registerMcpUiToolCallsRoute` is mounted with, or the recovery loop's surface is
   *  unreachable — see `tool-surface-exchanges.ts`'s own `AssistantSurfaceDeps` doc. */
  readonly surfaceExchanges: SurfaceExchangeStore;
  /** The workspace every audited attempt is attributed to — the daemon serves exactly one. */
  readonly workspaceId: string;
}

/**
 * Builds the fully decorated `ToolExecutor` the agent daemon mounts its delegated-tool route with.
 *
 * @returns A `ToolExecutor` behaving exactly like `createToolExecutor({registry})` for any
 *   unconstrained principal, plus a durable attempt trail and the failure-recovery loop.
 * @complexity Composition only — O(1); each decorator's own cost is documented on it.
 */
export function createAssistantToolExecutor(deps: AssistantToolExecutorDeps): ToolExecutor {
  return withToolFailureRecovery(
    withToolAttemptAudit(
      withReadOnlyToolConstraint(createToolExecutor({ registry: deps.registry }), { registry: deps.registry }),
      deps.auditSink,
      { workspaceId: deps.workspaceId },
    ),
    { surfaceExchanges: deps.surfaceExchanges, registry: deps.registry },
  );
}
