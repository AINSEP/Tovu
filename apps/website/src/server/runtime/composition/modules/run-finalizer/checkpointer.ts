import { checkpointIntervalMs as scaledCheckpointIntervalMs, checkpointProgress } from "@jini-ai/chat/core";

import type { ChatRunLedger } from "#src/assistant/index";
import { runContentFromEvents, runEventsForSave } from "#src/contracts/core/assistant-run-events";

import { approximateJsonBytes, checkpointGrew, hasUnsavedCheckpointGrowth } from "./checkpoint-policy.js";
import type { RunLogPort, RunTimerPort } from "./ports.js";
import { reportSafely } from "./report.js";
import { clearTrailing, type Watch } from "./watch-state.js";

/**
 * @file Saves a watched run's progress while it is still running: the growth test, the size-based
 * cadence, the single pending write, the trailing timer and the backed-off retry. It owns the
 * `checkpoint*` fields, `trailing` and `checkpointState` of the `Watch` it is given, and touches
 * no port before the first frame. `stopWatch` cancels the timer; a write that completes late
 * checks `watch.terminal`.
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

export interface Checkpointer {
  /** Call after every frame that did not end the run. Never blocks frame consumption. */
  onFrame(required: { watch: Watch }, optional?: {}): void;
}

type Progress = ReturnType<typeof checkpointProgress>;

/** Preserve injected host/test overrides while the shared pure policy owns the default cadence.
 * @complexity O(1) time and space. */
function checkpointDelay({ bytes, ports }: { bytes: number; ports: CheckpointerPorts }, _options = {}): number {
  return ports.checkpointIntervalMs ?? scaledCheckpointIntervalMs({ bytes });
}

/** One cancelable timer owns skipped frames and failed-write retries. Its callback reuses the
 * terminal, pending-write and unsaved-growth guards, including callbacks queued before cleanup.
 * @complexity O(1) time and space; replaces at most one timer per watch. */
function scheduleCheckpoint({ ports, watch, delayMs }: { ports: CheckpointerPorts; watch: Watch; delayMs: number }, _options = {}): void {
  clearTrailing({ watch });
  watch.trailing = ports.checkpointTimers.schedule({ delayMs, run: () => {
    watch.trailing = undefined;
    void checkpoint({ ports, watch });
  } });
}

/** Failed storage writes retry during quiet tool/approval waits, at most once per interval and
 * never faster than once per second. False (fenced/unchanged) results do not retry.
 * @complexity O(events + tool identities) growth comparison; one timer per watch. */
function retryCheckpoint({ ports, watch, interval }: { ports: CheckpointerPorts; watch: Watch; interval: number }, _options = {}): void {
  if (watch.terminal || !hasUnsavedCheckpointGrowth({ watch, progress: checkpointProgress({ events: watch.events }) })) return;
  const delayMs = Math.max(interval, 1_000);
  watch.checkpointRetryAt = ports.now() + delayMs;
  scheduleCheckpoint({ ports, watch, delayMs });
}

/**
 * Saves what the run has produced so far, when it has grown since the last save and the interval
 * has passed. Only growth counts: a reconnect replays from event 0, and a checkpoint of the
 * replay's first events would shrink the saved answer.
 *
 * A save the interval skips is not dropped: a trailing checkpoint is armed for the end of the
 * interval. Without it, a run that goes quiet (a long tool call) right after a skipped frame kept
 * its last text and tool-call start in memory only, lost on any stop — the process `exit` flush
 * that used to cover a graceful stop is gone (an `exit` listener cannot await an async write).
 * At most one checkpoint is pending per run. It never blocks frame consumption: otherwise a
 * slow progress write holds an already-buffered `end` behind it, leaving a finished turn running
 * for startup repair to misclassify. Later progress is coalesced when the pending write finishes.
 * Terminal settlement uses the ledger's terminal guard to reject any late checkpoint.
 * The last saved payload selects the shared size-based interval (or an injected host override):
 * a merge fallback still rewrites the projection, so large turns need fewer checkpoints.
 *
 * This function decides; `writeCheckpoint` writes.
 * @complexity O(saved events) per write, with one pending write and one trailing timer per run.
 */
async function checkpoint({ ports, watch }: { ports: CheckpointerPorts; watch: Watch }, _optional = {}): Promise<void> {
  if (watch.terminal || watch.checkpointPending) return;
  const interval = checkpointDelay({ bytes: watch.checkpointedBytes, ports });
  const wait = Math.max(watch.checkpointedAt + interval, watch.checkpointRetryAt ?? Number.NEGATIVE_INFINITY) - ports.now();
  // An armed timer will consume the latest frames; avoid rescanning them on every delta.
  if (wait > 0 && watch.trailing) return;
  const progress = checkpointProgress({ events: watch.events });
  // Completion rechecks for coalesced frames. Do not arm a timer for an unchanged projection:
  // only unsaved growth should start the trailing deadline that protects a quiet run.
  if (!hasUnsavedCheckpointGrowth({ watch, progress })) return;
  if (wait > 0) {
    scheduleCheckpoint({ ports, watch, delayMs: wait });
    return;
  }
  await writeCheckpoint({ ports, watch, interval, progress });
}

/** The write `checkpoint` decided on: marks it pending, sends the delta receipt, records what was
 * saved, and on completion picks up progress that arrived meanwhile.
 * @complexity O(saved events) for the projection and its size. */
async function writeCheckpoint(
  { ports, watch, interval, progress }: { ports: CheckpointerPorts; watch: Watch; interval: number; progress: Progress },
  _optional = {},
): Promise<void> {
  const content = runContentFromEvents(watch.events);
  const events = runEventsForSave(watch.events);
  clearTrailing({ watch });
  watch.checkpointedAt = ports.now();
  watch.checkpointRetryAt = undefined;
  watch.checkpointPending = true;
  // Best effort: a failed checkpoint only loses what a restart would keep; the stream goes on.
  await ports.ledger
    .checkpoint({ conversationId: watch.conversationId, messageId: watch.messageId, runId: watch.runId, content, events }, {
      expected: watch.checkpointState?.length,
      previous: watch.checkpointState,
      onPersisted: (state) => { watch.checkpointState = state; },
    })
    .then((written) => {
      if (!written) return;
      watch.checkpointedTextCharacters = progress.textCharacters;
      watch.checkpointedExtensionEvents = progress.extensionEvents;
      for (const key of progress.tools) watch.checkpointedTools.add(key);
      watch.checkpointedBytes = approximateJsonBytes({ value: events });
    })
    .catch((error: unknown) => {
      reportSafely({ report: () => ports.log.error({ operation: "checkpoint", runId: watch.runId, error }) });
      retryCheckpoint({ ports, watch, interval });
    })
    .finally(() => {
      watch.checkpointPending = false;
      // A false result (including a fenced row) or failure leaves the saved baseline behind.
      // Retrying that same attempt here spins at interval 0, or rearms forever at other intervals.
      // Only newer coalesced progress schedules from completion. Rejections alone also arm the
      // backed-off retry above, so quiet runs are protected without resurrecting the spin.
      if (!watch.terminal && checkpointGrew({ previous: progress, progress: checkpointProgress({ events: watch.events }) })) {
        void checkpoint({ ports, watch });
      }
    });
}

/** @complexity O(1) to build; each frame costs what `checkpoint` documents. */
export function createCheckpointer(ports: CheckpointerPorts, _optional = {}): Checkpointer {
  return { onFrame: ({ watch }, _options = {}) => { void checkpoint({ ports, watch }); } };
}
