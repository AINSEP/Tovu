import type { ApprovalReceiptObserver, ToolExecutionContext } from "@jini-ai/core";
import type { RoutineRun } from "@jini-ai/daemon";
import { classifyApprovalEvent, type ApprovalEvent, type ApprovalProjection, type TrackedRoutineRun } from "./classify-routine-approval.js";

/**
 * @file Observe-only projection of federated approval onto the routine run row (P3-T3.T).
 *
 * Transport decision — IN-PROCESS PROJECTION: the serving site already hosts both the human-confirm
 * handler (whose leased exchange authors the T3.J receipts) and the routine store, so the receipt
 * never leaves the process. A relay through the federated emitter and durable run events would add a
 * transport extension and no authority. Why it can never redeem: this module holds no exchange, no
 * tool registry and no answer channel — it only calls `setApproval`. The card, the click and the
 * effect stay on the existing human-confirm path; `approved` means "owner said yes", not "it ran".
 */

type ApprovalState = NonNullable<RoutineRun["approvalState"]>;
export interface RoutineApprovalPersistence {
  setApproval(required: { runId: string; state: ApprovalState }, optional?: { ref?: string; expectedRef?: string; since?: number }): Promise<void>;
}
/** In-process the receipts arrive through `onReceipt`, so this is the settlement watcher's read hook (may be a no-op). */
export type ReadRunEvents = (required: { runId: string; cursor: number }) => Promise<readonly unknown[]>;
export interface RoutineApprovalPolicy { /** The serving site's verified workspace; receipts are bound to it. */ workspaceId: string }
type Log = (entry: { event: string; error: unknown }) => void;

/** What human-confirm receives for a trusted routine run: where receipts go, and "never restore". */
export interface RoutineApprovalBinding { onApprovalReceipt: ApprovalReceiptObserver; restorable: false }

interface Entry { run: TrackedRoutineRun; ref?: string; settledRefs: Set<string>; chain: Promise<unknown> }

/** Apply one projection; duplicates and stale refs are no-ops, and the store refuses non-running rows. */
async function apply({ entry, projection, persistence, now }: {
  entry: Entry; projection: ApprovalProjection; persistence: RoutineApprovalPersistence; now: () => number;
}): Promise<void> {
  const runId = projection.routineRunId;
  if (projection.kind === "waiting") {
    if (entry.settledRefs.has(projection.ref) || entry.ref === projection.ref) return;
    entry.ref = projection.ref;
    await persistence.setApproval({ runId, state: "waiting" }, { ref: projection.ref, since: now() });
    return;
  }
  if (entry.settledRefs.has(projection.expectedRef)) return;
  entry.settledRefs.add(projection.expectedRef);
  if (entry.ref === projection.expectedRef) entry.ref = undefined;
  // `expectedRef` makes an older exchange's answer unable to clear a newer waiting ref.
  await persistence.setApproval({ runId, state: projection.state }, { expectedRef: projection.expectedRef });
}

/**
 * @param required.persistence - The open routine sidecar's `setApproval`.
 * @param optional.maxTracked - Bound on concurrently tracked runs; the oldest is dropped (and expired) first.
 * @returns track/untrack for the run handler, `observe`/`onReceipt` sinks, and `bindingFor` for human-confirm.
 * @complexity O(1) per receipt; O(e) per `observe` for e events.
 */
export function createRoutineApprovalObserver(
  { persistence, now, readRunEvents, policy }: { persistence: RoutineApprovalPersistence; now: () => number; readRunEvents: ReadRunEvents; policy: RoutineApprovalPolicy },
  { log = () => {}, maxTracked = 256 }: { log?: Log; maxTracked?: number } = {},
) {
  const entries = new Map<string, Entry>();
  const safely = (entry: Entry, work: () => Promise<void>) => {
    entry.chain = entry.chain.then(work).catch((error: unknown) => log({ event: "routine-approval-projection-failed", error }));
    return entry.chain;
  };
  /** Settlement or interruption: whatever is still waiting expires, matched to its own ref only. */
  function untrack({ agentRunId }: { agentRunId: string }, _optional: Record<string, never> = {}): Promise<unknown> {
    const entry = entries.get(agentRunId);
    if (!entry) return Promise.resolve();
    entries.delete(agentRunId);
    return safely(entry, async () => {
      const ref = entry.ref;
      if (ref !== undefined) await persistence.setApproval({ runId: entry.run.routineRunId, state: "expired" }, { expectedRef: ref });
    });
  }
  function track(run: TrackedRoutineRun, _optional: Record<string, never> = {}): void {
    if (run.workspaceId !== policy.workspaceId) return;
    if (entries.size >= maxTracked) { const oldest = entries.keys().next().value; if (oldest !== undefined) void untrack({ agentRunId: oldest }); }
    entries.set(run.agentRunId, { run: { ...run }, settledRefs: new Set(), chain: Promise.resolve() });
  }
  /** Projects `events` (or the watcher's read from `cursor`) in order; returns the cursor after them. */
  async function observe({ runId, messageId, principalId, workspaceId, events, cursor = 0 }: {
    runId: string; messageId: string; principalId: string; workspaceId: string; events?: readonly unknown[]; cursor?: number;
  }, _optional: Record<string, never> = {}): Promise<{ cursor: number }> {
    const entry = entries.get(runId);
    if (!entry) return { cursor };
    const batch = events ?? await readRunEvents({ runId, cursor });
    for (const receipt of batch) {
      const event: Partial<ApprovalEvent> = { receipt: receipt as ApprovalEvent["receipt"], runId, principalId, workspaceId, messageId };
      const projection = classifyApprovalEvent({ event, expectedRun: entry.run });
      if (projection) await safely(entry, () => apply({ entry, projection, persistence, now }));
    }
    return { cursor: cursor + batch.length };
  }
  /** The T3.J callback: synchronous, never throws, never awaited by the exchange. */
  const onReceipt: ApprovalReceiptObserver = ({ receipt, runId, principalId }) => {
    const entry = entries.get(runId);
    if (!entry) return;
    const { messageId, workspaceId } = entry.run;
    void observe({ runId, messageId, principalId, workspaceId: workspaceId === policy.workspaceId ? workspaceId : "", events: [receipt] })
      .catch((error: unknown) => log({ event: "routine-approval-projection-failed", error }));
  };
  /** Trusted routine context for human-confirm: only a tracked run, asked by its own principal. */
  function bindingFor({ ctx }: { ctx: Pick<ToolExecutionContext, "run" | "principal"> }, _optional: Record<string, never> = {}): RoutineApprovalBinding | undefined {
    const entry = entries.get(ctx.run.id);
    return entry && entry.run.principalId === ctx.principal.id ? { onApprovalReceipt: onReceipt, restorable: false } : undefined;
  }
  return { track, untrack, observe, onReceipt, bindingFor };
}

export type RoutineApprovalObserver = ReturnType<typeof createRoutineApprovalObserver>;
