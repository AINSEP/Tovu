import type { RunSettlement } from "#src/assistant/index";
import { readSseFrames, translateRunFrame } from "#src/contracts/core/assistant-run-events";

import type { Checkpointer } from "./checkpointer.js";
import { interruptionEvents, type Watch } from "./watch-state.js";
import { releaseUnreadBody } from "./release-body.js";

/**
 * @file Reads one events connection of a watched run. It owns the `events`, `retainedEvents`,
 * `frameCarry` and `failed` fields of the `Watch` it is given, sets `terminal` on an end frame,
 * releases the body of a response it will not read, and hands every other frame to the
 * checkpointer.
 */

/** What one connection came to, or (`unresolved`) what the bounded wait around it concluded. */
export type StreamResult = { kind: "ended"; status: RunSettlement["status"] } | { kind: "gone" } | { kind: "dropped" } | { kind: "unresolved" };

export interface StreamReader {
  /** Rejects when the daemon request or the body fails; the caller treats that as a dropped stream. */
  read(required: { watch: Watch }, optional?: {}): Promise<StreamResult>;
}

function applyStreamFrame(
  { checkpointer, watch, frame }: { checkpointer: Checkpointer; watch: Watch; frame: { event: string; data: string } },
  _optional = {},
): StreamResult | undefined {
  const outcome = translateRunFrame({ kind: frame.event, raw: frame.data }, { carry: watch.frameCarry });
  watch.events.push(...outcome.events);
  if (outcome.error) watch.failed = true;
  if (outcome.terminal) {
    watch.terminal = true;
    return { kind: "ended", status: watch.failed && outcome.terminal === "succeeded" ? "failed" : outcome.terminal };
  }
  checkpointer.onFrame({ watch });
  return undefined;
}

/** Reads one connection to the end. The daemon replays from event 0 on every connection, so the
 *  events collected by an earlier, dropped connection are discarded rather than doubled. */
async function readStream({ checkpointer, watch }: { checkpointer: Checkpointer; watch: Watch }, _optional = {}): Promise<StreamResult> {
  const signal = watch.abortStream.signal;
  const response = await watch.daemon.openEvents({ runId: watch.runId, principalId: watch.principalId }, { signal });
  if (signal.aborted) {
    // The stream was already aborted; body cancellation is best-effort cleanup.
    releaseUnreadBody({ response });
    return { kind: "dropped" };
  }
  if (response.status === 404) { releaseUnreadBody({ response }); return { kind: "gone" }; }
  if (!response.ok || !response.body) { releaseUnreadBody({ response }); return { kind: "dropped" }; }
  watch.retainedEvents = [...interruptionEvents({ watch })];
  watch.events = [...watch.attemptBase];
  watch.frameCarry = {};
  watch.failed = false;
  // Cancel the reader as well as HTTP when a bounded resolution settles the row. Fakes may
  // ignore the request signal; late frames must not change a settled watch's checkpoint.
  for await (const frame of readSseFrames(response.body.pipeThrough(new TransformStream(), { signal }))) {
    if (signal.aborted) return { kind: "dropped" };
    const result = applyStreamFrame({ checkpointer, watch, frame });
    if (result) return result;
  }
  return { kind: "dropped" };
}

/** @complexity O(1) to build; a read costs O(frame bytes) plus what the checkpointer documents. */
export function createStreamReader({ checkpointer }: { checkpointer: Checkpointer }, _optional = {}): StreamReader {
  return { read: ({ watch }, _options = {}) => readStream({ checkpointer, watch }) };
}
