import { createRunCheckpointer, type RunCheckpointer, type RunLogPort, type RunTimerPort } from "@jini-ai/chat/core/durable-runs/run-finalizer";

import type { ChatRunLedger } from "#src/assistant/index";
import { runContentFromEvents, runEventsForSave } from "#src/contracts/core/assistant-run-events";

import type { Watch } from "./watch-state.js";

/**
 * @file Binds the engine's run checkpointer (cadence, growth test, single pending write, trailing
 * timer, backed-off retry) to this host's watch record, event projection and ledger. The `Watch` it
 * is given supplies the engine's structural `CheckpointWatch` fields; `checkpointState`, the
 * ledger's persisted-projection cursor, stays here with the ledger binding.
 */

export interface CheckpointerPorts {
  /** Called as `ledger.checkpoint(...)` at every write, on the host's own object. */
  readonly ledger: Pick<ChatRunLedger, "checkpoint">;
  readonly now: () => number;
  /** The trailing and retry timer. It is separate from the deadline timers because the host does
   * not let it keep the process alive: a quiet run must not hold an idle site open. */
  readonly checkpointTimers: RunTimerPort;
  readonly log: Pick<RunLogPort, "error">;
  /** Override the size-based interval between in-flight checkpoints; tests pass 0. */
  readonly checkpointIntervalMs: number | undefined;
}

export type Checkpointer = RunCheckpointer<Watch>;

/** @complexity O(1) to build; each frame costs what the engine checkpointer documents. */
export function createCheckpointer(ports: CheckpointerPorts, _optional = {}): Checkpointer {
  return createRunCheckpointer({ ports: {
    project: ({ events }, _options = {}) => ({ content: runContentFromEvents(events), events: runEventsForSave(events) }),
    ledger: {
      checkpoint: ({ watch, content, events }, _options = {}) => ports.ledger.checkpoint(
        { conversationId: watch.conversationId, messageId: watch.messageId, runId: watch.runId, content, events },
        { expected: watch.checkpointState?.length, previous: watch.checkpointState, onPersisted: (state) => { watch.checkpointState = state; } },
      ),
    },
    now: ports.now, checkpointTimers: ports.checkpointTimers, log: ports.log, checkpointIntervalMs: ports.checkpointIntervalMs,
  } });
}
