/**
 * @file Test seam for the H2 fix: tracks which run ids are currently in flight for each
 * `conversationId`, so `agent-daemon-server.ts`'s `onStarted` can tell whether a run it is about to
 * start would be the second (or later) concurrent run racing the same conversation.
 *
 * The bug this exists for: nothing serialized runs per `conversationId`. Two overlapping runs for
 * one conversation (two admin tabs open on the same chat — `conversationId` is the chat id, shared
 * across tabs) both read the same stored session id and both spawn `claude --resume <sameId>` —
 * two live CLI processes reading/writing one session-transcript file at once, a corruption hazard
 * independent of which run's `end` event later wins the store write. `onStarted` uses
 * {@link LiveRunTracker.hasConcurrentLiveRun} to refuse `resumeSessionId` for whichever run
 * observes the other already live, so at most one process ever holds `--resume <id>` for that
 * session at a time; the second run starts cold instead (`resolveResumeSessionField(null)`).
 *
 * A factory, not a bare module-level map, for the same reason `agent-session-resume.ts` exports
 * pure functions instead of closing over `agent-daemon-server.ts`'s own state: a fresh instance per
 * test avoids cross-test pollution, while `agent-daemon-server.ts` itself only ever needs exactly
 * one instance for its own process lifetime.
 *
 * In-process only, and deliberately not persisted: starts empty on every daemon restart, and a
 * restart needs no special handling for that. A restart kills every CLI child process this run's
 * own daemon spawned, so nothing a stale entry could have been protecting against is actually
 * "live" any more either — an empty tracker after restart matches reality exactly, not a gap in it.
 */

export interface LiveRunTracker {
  /**
   * Marks `runId` as in flight for `conversationId`. Call synchronously, before any `await`, in the
   * same synchronous prefix of `onStarted` that already records `principalByRunId`/`runOwners` for
   * this run — Node's single-threaded execution then guarantees a second `onStarted` invocation for
   * the same conversation can never observe this run as anything but already registered, however
   * close together the two requests arrive.
   */
  register(conversationId: string, runId: string): void;
  /**
   * Marks `runId` as no longer in flight for `conversationId`. Idempotent: safe to call even if
   * `runId` was never registered (already unregistered, or registration never happened — e.g. this
   * run's own `contextRef` carried no `conversationId` at all).
   */
  unregister(conversationId: string, runId: string): void;
  /**
   * Whether some run OTHER than `runId` is currently registered as live for `conversationId` — the
   * signal `onStarted` uses to decide whether THIS run may resume the conversation's stored session
   * id or must start cold instead.
   */
  hasConcurrentLiveRun(conversationId: string, runId: string): boolean;
}

/**
 * @returns A fresh, independent {@link LiveRunTracker} backed by a private in-memory map.
 * @complexity Every method is O(1) amortized; each conversationId's own live-run set is bounded by
 *   how many runs are genuinely in flight for it at once (in practice a handful at most — one per
 *   open admin tab on that conversation).
 */
export function createLiveRunTracker(): LiveRunTracker {
  const liveRunIdsByConversationId = new Map<string, Set<string>>();

  return {
    register(conversationId, runId) {
      const existing = liveRunIdsByConversationId.get(conversationId);
      if (existing) {
        existing.add(runId);
        return;
      }
      liveRunIdsByConversationId.set(conversationId, new Set([runId]));
    },

    unregister(conversationId, runId) {
      const existing = liveRunIdsByConversationId.get(conversationId);
      if (!existing) return;
      existing.delete(runId);
      if (existing.size === 0) liveRunIdsByConversationId.delete(conversationId);
    },

    hasConcurrentLiveRun(conversationId, runId) {
      const existing = liveRunIdsByConversationId.get(conversationId);
      if (!existing) return false;
      for (const liveRunId of existing) {
        if (liveRunId !== runId) return true;
      }
      return false;
    },
  };
}
