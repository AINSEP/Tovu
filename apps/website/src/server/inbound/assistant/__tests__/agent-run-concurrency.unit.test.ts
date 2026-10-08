import assert from "node:assert/strict";
import test, { describe } from "node:test";

import { CONCURRENT_RUN_REFUSAL_MESSAGE, createLiveRunTracker, failRunBeforeStart, waitForStoppingRuns, type FailingRunLifecycle } from "../../../../assistant/agent-session-preset.js";

/**
 * @file H2 regression cover for `createLiveRunTracker`. Before this tracker existed, nothing
 * serialized runs per `conversationId`: two overlapping runs for one conversation (two admin tabs
 * on the same chat) both read the same stored session id and both spawned
 * `claude --resume <sameId>` — two live CLI processes racing one session-transcript file, plus
 * "last write wins" on whichever run's `end` event reached the store last. This suite proves the
 * decision `onStarted` now uses (`hasConcurrentLiveRun`) to refuse a resume for whichever run
 * observes another already live for its conversation. The wiring that actually calls
 * `register`/`unregister`/`hasConcurrentLiveRun` from `onStarted` is covered separately by
 * `agent-daemon-server.session-resume-wiring.unit.test.ts` (a source-presence proof — see that
 * file's own header for why `agent-daemon-server.ts` cannot be imported directly by a unit test).
 */

describe("createLiveRunTracker", () => {
  test("run-to-conversation lookup isolates live registrations and removes only the unregistered run", () => {
    const tracker = createLiveRunTracker({}, {});
    assert.equal(tracker.conversationIdForRun({ runId: "run-a" }, {}), undefined);
    tracker.register({ conversationId: "conv-1", runId: "run-a" }, {});
    tracker.register({ conversationId: "conv-2", runId: "run-b" }, {});
    assert.equal(tracker.conversationIdForRun({ runId: "run-a" }, {}), "conv-1");
    assert.equal(tracker.conversationIdForRun({ runId: "run-b" }, {}), "conv-2");
    tracker.unregister({ conversationId: "conv-2", runId: "run-a" }, {});
    assert.equal(tracker.conversationIdForRun({ runId: "run-a" }, {}), "conv-1");
    tracker.unregister({ conversationId: "conv-1", runId: "run-a" }, {});
    assert.equal(tracker.conversationIdForRun({ runId: "run-a" }, {}), undefined);
    assert.equal(tracker.conversationIdForRun({ runId: "run-b" }, {}), "conv-2");
    tracker.unregister({ conversationId: "conv-2", runId: "run-b" }, {});
    assert.equal(tracker.conversationIdForRun({ runId: "run-b" }, {}), undefined);
  });

  test("hasConcurrentLiveRun is false for a conversation with no registered runs at all", () => {
    const tracker = createLiveRunTracker({}, {});
    assert.equal(tracker.hasConcurrentLiveRun({ conversationId: "conv-1", runId: "run-a" }, {}), false);
  });

  test("hasConcurrentLiveRun is false for the only run registered for a conversation (checking against itself)", () => {
    const tracker = createLiveRunTracker({}, {});
    tracker.register({ conversationId: "conv-1", runId: "run-a" }, {});
    assert.equal(tracker.hasConcurrentLiveRun({ conversationId: "conv-1", runId: "run-a" }, {}), false);
  });

  test("H2: hasConcurrentLiveRun is true for each of two runs registered concurrently on the same conversation", () => {
    const tracker = createLiveRunTracker({}, {});
    tracker.register({ conversationId: "conv-1", runId: "run-a" }, {});
    tracker.register({ conversationId: "conv-1", runId: "run-b" }, {});

    assert.equal(tracker.hasConcurrentLiveRun({ conversationId: "conv-1", runId: "run-a" }, {}), true, "run-a should see run-b as a concurrent live run");
    assert.equal(tracker.hasConcurrentLiveRun({ conversationId: "conv-1", runId: "run-b" }, {}), true, "run-b should see run-a as a concurrent live run");
  });

  test("unregistering the other run clears the concurrency signal for the one still live", () => {
    const tracker = createLiveRunTracker({}, {});
    tracker.register({ conversationId: "conv-1", runId: "run-a" }, {});
    tracker.register({ conversationId: "conv-1", runId: "run-b" }, {});

    tracker.unregister({ conversationId: "conv-1", runId: "run-b" }, {});

    assert.equal(tracker.hasConcurrentLiveRun({ conversationId: "conv-1", runId: "run-a" }, {}), false, "with run-b gone, run-a is alone again");
  });

  test("unregister is a silent no-op for a runId that was never registered", () => {
    const tracker = createLiveRunTracker({}, {});
    assert.doesNotThrow(() => tracker.unregister({ conversationId: "conv-1", runId: "run-never-registered" }, {}));
  });

  test("two different conversationIds never see each other's live runs", () => {
    const tracker = createLiveRunTracker({}, {});
    tracker.register({ conversationId: "conv-1", runId: "run-a" }, {});
    tracker.register({ conversationId: "conv-2", runId: "run-b" }, {});

    assert.equal(tracker.hasConcurrentLiveRun({ conversationId: "conv-1", runId: "run-a" }, {}), false);
    assert.equal(tracker.hasConcurrentLiveRun({ conversationId: "conv-2", runId: "run-b" }, {}), false);
  });

  test("a fresh tracker instance starts with no memory of a prior instance's registrations (matches an in-process map's empty state after a daemon restart)", () => {
    const trackerBeforeRestart = createLiveRunTracker({}, {});
    trackerBeforeRestart.register({ conversationId: "conv-1", runId: "run-a" }, {});

    const trackerAfterRestart = createLiveRunTracker({}, {});
    assert.equal(trackerAfterRestart.hasConcurrentLiveRun({ conversationId: "conv-1", runId: "run-a" }, {}), false);
  });
});

/**
 * Send right after Stop (2026-09-27, `ADS-memory/reports/2026-09-27-chat-silent-gaps.md`): the
 * stopped CLI turn takes seconds to exit, so the next run saw it still live, and a memory-carrying
 * agent's run was refused in 0.1 s. The new run now waits for a run that is being stopped.
 */
describe("waitForStoppingRuns", () => {
  function fakeLifecycle() {
    const cancelled = new Set<string>();
    const ends = new Map<string, () => void>();
    const ended = new Map<string, Promise<void>>();
    return {
      cancel(runId: string) {
        cancelled.add(runId);
      },
      end(runId: string) {
        ends.get(runId)?.();
      },
      onCancelRequested({ runId, listener }: { runId: string; listener: () => void }) {
        if (cancelled.has(runId)) listener();
        return () => undefined;
      },
      waitForTerminal({ runId }: { runId: string }) {
        let promise = ended.get(runId);
        if (!promise) {
          promise = new Promise<void>((resolve) => ends.set(runId, resolve));
          ended.set(runId, promise);
        }
        return promise;
      },
    };
  }

  test("waits for a run the user stopped to end, then no longer counts it as live", async () => {
    const tracker = createLiveRunTracker({}, {});
    const lifecycle = fakeLifecycle();
    tracker.register({ conversationId: "conv-1", runId: "old" }, {});
    tracker.register({ conversationId: "conv-1", runId: "new" }, {});
    lifecycle.cancel("old");

    let settled = false;
    const waiting = waitForStoppingRuns({ tracker, lifecycle, conversationId: "conv-1", runId: "new" }, { timeoutMs: 5_000 }).then(() => {
      settled = true;
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(settled, false, "must wait while the stopped run is still exiting");

    lifecycle.end("old");
    await waiting;
    assert.equal(tracker.hasConcurrentLiveRun({ conversationId: "conv-1", runId: "new" }, {}), false);
  });

  test("does not wait for a live run nobody stopped", async () => {
    const tracker = createLiveRunTracker({}, {});
    const lifecycle = fakeLifecycle();
    tracker.register({ conversationId: "conv-1", runId: "other-tab" }, {});
    tracker.register({ conversationId: "conv-1", runId: "new" }, {});

    await waitForStoppingRuns({ tracker, lifecycle, conversationId: "conv-1", runId: "new" }, { timeoutMs: 60_000 });
    assert.equal(tracker.hasConcurrentLiveRun({ conversationId: "conv-1", runId: "new" }, {}), true);
  });

  test("gives up after the timeout when the stopped run never ends", async () => {
    const tracker = createLiveRunTracker({}, {});
    const lifecycle = fakeLifecycle();
    tracker.register({ conversationId: "conv-1", runId: "old" }, {});
    tracker.register({ conversationId: "conv-1", runId: "new" }, {});
    lifecycle.cancel("old");

    await waitForStoppingRuns({ tracker, lifecycle, conversationId: "conv-1", runId: "new" }, { timeoutMs: 20 });
    assert.equal(tracker.hasConcurrentLiveRun({ conversationId: "conv-1", runId: "new" }, {}), true);
  });
});

describe("failRunBeforeStart", () => {
  test("puts the plain reason on the run's stream before finishing it failed", async () => {
    const calls: unknown[] = [];
    const lifecycle = {
      async emit({ runId, input }: Parameters<FailingRunLifecycle["emit"]>[0]) {
        calls.push(["emit", runId, input]);
      },
      async finish(input: unknown) {
        calls.push(["finish", input]);
      },
    };

    await failRunBeforeStart({ lifecycle: lifecycle, runId: "run-1", message: CONCURRENT_RUN_REFUSAL_MESSAGE }, {});

    assert.deepEqual(calls, [
      ["emit", "run-1", { event: "error", data: { message: "Another answer in this chat is still running. This turn could not start." } }],
      ["finish", { runId: "run-1", status: "failed", code: null, signal: null, resumable: false }],
    ]);
  });

  test("still finishes the run when the stream refuses the event", async () => {
    const finished: unknown[] = [];
    const lifecycle = {
      async emit() {
        throw new Error("run already terminal");
      },
      async finish(input: unknown) {
        finished.push(input);
      },
    };

    await failRunBeforeStart({ lifecycle: lifecycle, runId: "run-1", message: "why" }, {});
    assert.deepEqual(finished, [{ runId: "run-1", status: "failed", code: null, signal: null, resumable: false }]);
  });
});
