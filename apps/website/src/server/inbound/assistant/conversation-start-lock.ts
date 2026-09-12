/**
 * @file Per-conversation serialization for the ONE read-modify-write in `agent-daemon-server.ts`'s
 * `onStarted` that cannot tolerate interleaving: read the stored agent-CLI session id for this
 * (conversation, agent), decide whether to resume it or mint a fresh one, write the decision back.
 *
 * The bug this exists for (Defect 1, 2026-09-11 chat-lifecycle repair). `agent-run-concurrency.ts`'s
 * `LiveRunTracker` already stops two overlapping runs from both passing `--resume <sameId>` to two
 * CLI processes. It does not stop two overlapping runs from both reading "nothing stored yet" —
 * there is an `await` between that read and the write, so a second `onStarted` can land in the gap,
 * see an empty slot, and mint a second session. Whichever write lands last owns the binding, and
 * the loser's CLI session is orphaned: one turn answering inside a session no later turn can ever
 * reach, which is exactly the shape of the observed conversation fork.
 *
 * Scope, stated because the alternative is tempting and wrong: this serializes the BINDING section
 * only, never the agent run itself. A lock held across `AgentExecutor.run()` would queue a second
 * admin tab's turn behind a run that may take minutes, with no feedback in the pane — where the
 * existing `wouldForcedColdStartLoseConversationContext` refusal answers that case immediately and
 * visibly. See `agent-daemon-server.ts`'s own call site.
 *
 * A factory rather than a module-level map, matching `agent-run-concurrency.ts`'s identical
 * reasoning next to it: a fresh instance per test, exactly one for the daemon's own process
 * lifetime.
 *
 * In-process only, and deliberately not persisted. The hazard is two requests racing inside ONE
 * daemon process; across a daemon restart there is no race to lose, because a restart kills every
 * CLI child that process spawned (see `daemon-supervisor.ts`) — so an empty lock after a restart
 * matches reality rather than dropping protection.
 */

export interface ConversationStartLock {
  /**
   * Runs `critical` with exclusive access to `conversationId`, queued behind any section already
   * running for that same conversation. Sections for different conversations never wait on each
   * other.
   *
   * @param conversationId - The conversation whose session binding `critical` reads and writes, or
   *   `undefined` for a caller that has none (any daemon client other than the admin chat pane).
   *   An absent id runs immediately with no queueing at all: with nothing to file a binding under
   *   there is no shared state to protect, and serializing those runs against each other would be
   *   a pure cost.
   * @param critical - The read-modify-write to run under the lock. Its rejection is delivered to
   *   this caller and to no one else — the queue continues with the next section either way, since
   *   a wedged conversation would hang every later turn forever with nothing to explain it.
   * @returns Whatever `critical` resolves to, or a rejection carrying whatever it threw.
   */
  run<T>(conversationId: string | undefined, critical: () => Promise<T>): Promise<T>;
  /**
   * How many conversations currently have a queue. Exists for this module's own test: the map must
   * shrink back to empty as queues drain, or a daemon that stays up for days accumulates one entry
   * per conversation it has ever started a run for.
   */
  trackedConversationCount(): number;
}

/**
 * @returns A fresh, independent {@link ConversationStartLock}.
 * @complexity `run` is O(1) per call; each conversation's queue is a promise chain, so waiting
 *   costs one `.then` link rather than any polling. Memory is O(conversations with a section
 *   currently queued), not O(conversations ever seen) — see `trackedConversationCount`.
 */
export function createConversationStartLock(): ConversationStartLock {
  /**
   * The tail of each conversation's queue. Every stored promise is deliberately NON-rejecting (see
   * `settledTail` below): a rejected tail would reject the `.then()` of the next section in line
   * before that section ever ran, turning one failed binding into a permanently broken
   * conversation.
   */
  const tailByConversationId = new Map<string, Promise<void>>();

  return {
    run(conversationId, critical) {
      if (conversationId === undefined) return critical();

      const predecessor = tailByConversationId.get(conversationId) ?? Promise.resolve();
      const result = predecessor.then(critical);
      // Identity-guarded: a later section may already have replaced this tail, and deleting the
      // map entry then would let a THIRD section start concurrently with that one.
      const release = (): void => {
        if (tailByConversationId.get(conversationId) === settledTail) tailByConversationId.delete(conversationId);
      };
      // Both handlers, so the tail resolves whether `critical` fulfilled or threw — and so the
      // release happens in the FIRST continuation after `result` settles rather than a tick later.
      const settledTail: Promise<void> = result.then(release, release);
      tailByConversationId.set(conversationId, settledTail);
      return result;
    },

    trackedConversationCount() {
      return tailByConversationId.size;
    },
  };
}
