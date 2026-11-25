import type { ApprovalReceipt } from "@jini-ai/core";

/**
 * @file Pure classification of one authoritative approval receipt against one TRUSTED routine run
 * (P3-T3.T). Why a separate pure function: the binding rules (workspace, principal, accepted
 * message/attempt, exchange id) are the whole safety argument for the projection, so they are kept
 * free of storage, timers and logging and pinned directly by tests.
 *
 * A receipt only ever becomes PROJECTION state ("owner said yes"); it is never an answer, a grant or
 * an effect result. Anything that is not a well-formed receipt for exactly this run — a generic tool
 * result, user text, a receipt for another run or principal — classifies as `null`.
 */

/** A routine run the T2.T run handler accepted and registered; the only runs that can be projected. */
export interface TrackedRoutineRun {
  /** Jini routine run row (`setApproval` target). */
  routineRunId: string;
  /** The accepted agent run (attempt) the leased exchange reports as `runId`. */
  agentRunId: string;
  /** The accepted assistant message identity. */
  messageId: string;
  principalId: string;
  workspaceId: string;
}

/** One receipt as the observer sees it, already bound to the serving site's verified workspace. */
export interface ApprovalEvent {
  receipt: ApprovalReceipt;
  runId: string;
  principalId: string;
  workspaceId: string;
  messageId: string;
}

export type ApprovalProjection =
  | { kind: "waiting"; routineRunId: string; ref: string }
  | { kind: "settled"; routineRunId: string; state: "approved" | "declined" | "expired"; expectedRef: string };

/** Structural check: only the three receipt kinds T3.J authors, each with a nonempty exchange id. */
function isReceipt(value: unknown): value is ApprovalReceipt {
  if (typeof value !== "object" || value === null) return false;
  const receipt = value as Record<string, unknown>;
  if (typeof receipt.exchangeId !== "string" || receipt.exchangeId === "") return false;
  if (receipt.kind === "open") return true;
  if (receipt.kind === "answered") return typeof receipt.confirmed === "boolean";
  return receipt.kind === "ended" && (receipt.reason === "expired" || receipt.reason === "abandoned");
}

/** Every identity field must match the trusted registration exactly; nothing is inferred. */
function boundTo({ event, expectedRun }: { event: ApprovalEvent; expectedRun: TrackedRoutineRun }): boolean {
  return event.runId === expectedRun.agentRunId && event.principalId === expectedRun.principalId
    && event.workspaceId === expectedRun.workspaceId && event.messageId === expectedRun.messageId;
}

/**
 * @returns The projection for `event`, or `null` when it is not a receipt for `expectedRun`.
 * @example classifyApprovalEvent({ event, expectedRun }) // { kind: "waiting", routineRunId, ref: "card-1" }
 * @complexity O(1).
 */
export function classifyApprovalEvent(
  { event, expectedRun }: { event: unknown; expectedRun: TrackedRoutineRun },
  _optional: Record<string, never> = {},
): ApprovalProjection | null {
  if (typeof event !== "object" || event === null) return null;
  const candidate = event as ApprovalEvent;
  if (!isReceipt(candidate.receipt) || !boundTo({ event: candidate, expectedRun })) return null;
  const { receipt } = candidate;
  const routineRunId = expectedRun.routineRunId;
  if (receipt.kind === "open") return { kind: "waiting", routineRunId, ref: receipt.exchangeId };
  const state = receipt.kind === "answered" ? (receipt.confirmed ? "approved" : "declined") : "expired";
  return { kind: "settled", routineRunId, state, expectedRef: receipt.exchangeId };
}
