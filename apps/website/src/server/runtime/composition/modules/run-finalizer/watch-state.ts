import { isTerminalRunStatus, type AgentEvent, type ChatMessage } from "@jini-ai/chat/core";

import type { ChatRunLedger } from "#src/assistant/index";
import { isDaemonRunId, type RunFrameCarry } from "#src/contracts/core/assistant-run-events";

import type { RunDaemonClient } from "../run-daemon-http-client.js";

/**
 * @file The record the run finalizer keeps for one watched run, and the two rules about it that
 * need no engine state: which message may be watched, and how a watch is stopped.
 */

export type CheckpointState = NonNullable<Parameters<ChatRunLedger["checkpoint"]>[1]>["previous"];

/** One run being watched: the events received on the current connection, and whether it failed. */
export interface Watch {
  /** Last exact persisted projection. Owned by this watch; no ledger cache/release lifecycle. */
  checkpointState?: CheckpointState;
  readonly daemon: RunDaemonClient;
  readonly abortStream: AbortController;
  resolutionDeadline: number;
  readonly principalId: string;
  readonly conversationId: string;
  readonly messageId: string;
  readonly runId: string;
  readonly attemptBase: AgentEvent[];
  events: AgentEvent[];
  /** Keep the last complete checkpoint while a reconnect is still replaying an earlier prefix. */
  retainedEvents: AgentEvent[];
  /** Split-echo-line memory for the current connection; reset with `events` on every replay. */
  frameCarry?: RunFrameCarry;
  failed: boolean;
  /** Saved payload size and start time of the latest checkpoint attempt (writes are best
   *  effort). The saved size picks the interval before the next one. */
  checkpointedAt: number;
  checkpointedBytes: number;
  /** Meaningful saved progress: status chatter and replayed tool identities do not qualify. */
  checkpointedTextCharacters: number;
  checkpointedExtensionEvents: number;
  checkpointedTools: Set<string>;
  /** Only one best-effort progress write at a time; later frames are coalesced into the next one. */
  checkpointPending: boolean;
  /** Failed writes cannot be retried by new frames before the backed-off deadline. */
  checkpointRetryAt?: number;
  /** Stops progress scheduling as soon as the terminal outcome is known, before its durable write. */
  terminal: boolean;
  /** The trailing checkpoint armed when the interval skipped one (see `checkpoint`). */
  trailing?: ReturnType<typeof setTimeout>;
}

export function clearTrailing({ watch }: { watch: Watch }, _options = {}): void {
  clearTimeout(watch.trailing);
  watch.trailing = undefined;
}

/** Close progress scheduling before aborting I/O or awaiting storage. A late checkpoint completion
 * must not resurrect a watch that settled, was canceled, or failed to persist.
 * @complexity O(1) time and space; idempotent timer cancellation and stream abort. */
export function stopWatch({ watch }: { watch: Watch }, _options = {}): void {
  watch.terminal = true;
  clearTrailing({ watch });
  watch.abortStream.abort();
}

export function watchable({ message }: { message: ChatMessage }, _optional = {}): boolean {
  if (message.role !== "assistant" || !message.runId || !isDaemonRunId({ runId: message.runId })) return false;
  return message.runStatus !== undefined && !isTerminalRunStatus({ status: message.runStatus });
}
