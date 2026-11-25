import type { ChatRunLedger } from "#src/assistant/index";
import type { DurableRunStore } from "@jini-ai/chat/server/durable-runs";
import { parseRoutineRunMarker } from "@tovu/contracts/routines";

/**
 * @file Boot-repair admission for routine turns (P3-T2.T step 6).
 *
 * Why generic recovery must not own them: a routine turn is unattended and tied to a routine slot. If
 * boot repair "continued" it, a quit-and-reopen would silently run the job a second time, and it would
 * race the routine host's own interruption bookkeeping. So routine turns are cancelled (recorded as
 * stopped) and then reserved from generic recovery; the next routine slot is left untouched.
 *
 * Why the decision reads the durable accepted request, not the routine DB or a browser field: this
 * must work on every serving boot that repairs chats, including web-only and a failed routine
 * sidecar, and the only trustworthy marker is the one the host wrote at acceptance. It is trusted
 * only after the stored owner, workspace, conversation and message all match this exact turn.
 */

/** The ledger's own interrupted-turn shape, derived so this file never drifts from the port. */
type InterruptedChatTurn = Parameters<NonNullable<NonNullable<Parameters<ChatRunLedger["reconcileInterrupted"]>[1]>["admit"]>>[0]["turn"];

export type RoutineAdmission = (required: { turn: InterruptedChatTurn }, optional?: Record<string, never>) => Promise<"recover" | "leave-owned">;

export interface RoutineAdmissionPorts {
  store: Pick<DurableRunStore, "load">;
  workspaceId: string;
  cancel: (required: { principalId: string; workspaceId: string; conversationId: string; messageId: string }, optional: { reason: string }) => Promise<unknown>;
  log: (entry: { event: string; error: unknown }) => void;
}

export const ROUTINE_INTERRUPTED_REASON = "routine-interrupted";

/** Reads the marker out of the stored envelope; a malformed envelope is simply "no marker". */
function storedMarker({ contextRef }: { contextRef: string }) {
  try { return parseRoutineRunMarker({ value: (JSON.parse(contextRef) as { routine?: unknown }).routine }); } catch { return null; }
}

export function createRoutineRecoveryAdmission(ports: RoutineAdmissionPorts, _optional = {}): RoutineAdmission {
  return async ({ turn }) => {
    const messageId = turn.message.id;
    // By the stable assistant message id: a crash before the attempt id was saved still finds the request.
    const run = await ports.store.load({ messageId }, { includeTranscriptEvents: false });
    if (!run || turn.principalId === null || run.principalId !== turn.principalId || run.workspaceId !== ports.workspaceId
      || run.conversationId !== turn.conversationId || run.messageId !== messageId) return "recover";
    const marker = storedMarker({ contextRef: run.request.contextRef });
    // The routine handler mints `routine-<runId>`; a marker that disagrees with its own conversation is not trusted.
    if (!marker || run.conversationId !== `routine-${marker.runId}`) return "recover";
    try {
      await ports.cancel({ principalId: turn.principalId, workspaceId: ports.workspaceId, conversationId: turn.conversationId, messageId }, { reason: ROUTINE_INTERRUPTED_REASON });
    } catch (error) {
      // Reserved even when cancellation failed: re-running an unattended turn is the worse outcome.
      ports.log({ event: "routine-interrupt-cancel-failed", error });
    }
    return "leave-owned";
  };
}
