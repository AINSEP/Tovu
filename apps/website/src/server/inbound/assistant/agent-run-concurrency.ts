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
  /** The ids of every run OTHER than `runId` registered as live for `conversationId`. */
  concurrentLiveRunIds(conversationId: string, runId: string): string[];
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

    concurrentLiveRunIds(conversationId, runId) {
      return [...(liveRunIdsByConversationId.get(conversationId) ?? [])].filter((liveRunId) => liveRunId !== runId);
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

/** The two `RunLifecycle` calls {@link waitForStoppingRuns} needs. */
export interface StoppingRunLifecycle {
  onCancelRequested(runId: string, listener: () => void): () => void;
  waitForTerminal(runId: string): Promise<unknown>;
}

/** How long a new run waits for a stopped run on the same chat to exit. A stopped Claude turn was
 *  seen taking about 7 s to exit (2026-09-27); past this the new run is refused, with a reason. */
export const STOPPING_RUN_WAIT_MS = 20_000;

/** Whether the user already asked to stop `runId`. `onCancelRequested` replays a past cancel
 *  synchronously on subscribe, so subscribing and unsubscribing at once answers the question. */
function isStopping(lifecycle: StoppingRunLifecycle, runId: string): boolean {
  let stopping = false;
  try {
    lifecycle.onCancelRequested(runId, () => {
      stopping = true;
    })();
  } catch {
    // An unknown run id: nothing to wait for.
    return false;
  }
  return stopping;
}

/**
 * Waits, up to `timeoutMs`, for every OTHER live run on this conversation that the user has stopped
 * to actually end, and drops each one that did from `tracker`.
 *
 * Why (2026-09-27, `ADS-memory/reports/2026-09-27-chat-silent-gaps.md`): Stop only records the
 * cancel; the CLI turn then takes seconds to exit. A message sent right after Stop started while the
 * stopped run was still registered, so `hasConcurrentLiveRun` said "another run holds this session"
 * and a memory-carrying agent's run was refused in 0.1 s. The user had to send it again.
 *
 * A live run nobody stopped (a second tab mid-answer) is not waited for: it can run for minutes, and
 * the existing concurrency rule already decides that case. The tracker entry is removed here rather
 * than left to the stopped run's own `waitForTerminal(...).finally(...)` hook, because which of the two
 * continuations runs first is not guaranteed.
 *
 * @complexity O(live runs on the conversation), plus the wait itself (bounded by `timeoutMs`).
 */
export async function waitForStoppingRuns(input: {
  readonly tracker: LiveRunTracker;
  readonly lifecycle: StoppingRunLifecycle;
  readonly conversationId: string;
  readonly runId: string;
  readonly timeoutMs: number;
}): Promise<void> {
  const { tracker, lifecycle, conversationId, runId, timeoutMs } = input;
  const stopping = tracker.concurrentLiveRunIds(conversationId, runId).filter((id) => isStopping(lifecycle, id));
  if (stopping.length === 0) return;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, timeoutMs);
  });
  const allEnded = Promise.all(
    stopping.map((id) => lifecycle.waitForTerminal(id).then(() => tracker.unregister(conversationId, id))),
  );
  try {
    await Promise.race([allEnded, timedOut]);
  } finally {
    clearTimeout(timer);
  }
}

/** The two `RunLifecycle` calls {@link failRunBeforeStart} needs. */
export interface FailingRunLifecycle {
  emit(runId: string, input: { event: "error"; data: { message: string } }): Promise<unknown>;
  finish(input: { runId: string; status: "failed"; code: null; signal: null; resumable: false }): Promise<unknown>;
}

/** The plain reason a run gets when another run on the same chat still holds its agent session. */
export const CONCURRENT_RUN_REFUSAL_MESSAGE =
  "The assistant could not start: another answer in this chat is still running. Wait for it to finish, or stop it, then send again.";

/**
 * Ends a run this host refuses before it starts, with the plain reason on the run's own stream.
 *
 * The `error` event is what the chat shows and saves (`translateRunFrame`); a bare `finish` left the
 * user a "Run failed" whose reason existed only in the server log. Best-effort: a stream that will not
 * take the event never stops the run from finishing.
 */
export async function failRunBeforeStart(lifecycle: FailingRunLifecycle, runId: string, message: string): Promise<void> {
  await lifecycle.emit(runId, { event: "error", data: { message } }).catch(() => undefined);
  await lifecycle.finish({ runId, status: "failed", code: null, signal: null, resumable: false });
}
