import assert from "node:assert/strict";
import test, { describe } from "node:test";

import { createLiveRunTracker } from "../agent-run-concurrency.js";

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
  test("hasConcurrentLiveRun is false for a conversation with no registered runs at all", () => {
    const tracker = createLiveRunTracker();
    assert.equal(tracker.hasConcurrentLiveRun("conv-1", "run-a"), false);
  });

  test("hasConcurrentLiveRun is false for the only run registered for a conversation (checking against itself)", () => {
    const tracker = createLiveRunTracker();
    tracker.register("conv-1", "run-a");
    assert.equal(tracker.hasConcurrentLiveRun("conv-1", "run-a"), false);
  });

  test("H2: hasConcurrentLiveRun is true for each of two runs registered concurrently on the same conversation", () => {
    const tracker = createLiveRunTracker();
    tracker.register("conv-1", "run-a");
    tracker.register("conv-1", "run-b");

    assert.equal(tracker.hasConcurrentLiveRun("conv-1", "run-a"), true, "run-a should see run-b as a concurrent live run");
    assert.equal(tracker.hasConcurrentLiveRun("conv-1", "run-b"), true, "run-b should see run-a as a concurrent live run");
  });

  test("unregistering the other run clears the concurrency signal for the one still live", () => {
    const tracker = createLiveRunTracker();
    tracker.register("conv-1", "run-a");
    tracker.register("conv-1", "run-b");

    tracker.unregister("conv-1", "run-b");

    assert.equal(tracker.hasConcurrentLiveRun("conv-1", "run-a"), false, "with run-b gone, run-a is alone again");
  });

  test("unregister is a silent no-op for a runId that was never registered", () => {
    const tracker = createLiveRunTracker();
    assert.doesNotThrow(() => tracker.unregister("conv-1", "run-never-registered"));
  });

  test("two different conversationIds never see each other's live runs", () => {
    const tracker = createLiveRunTracker();
    tracker.register("conv-1", "run-a");
    tracker.register("conv-2", "run-b");

    assert.equal(tracker.hasConcurrentLiveRun("conv-1", "run-a"), false);
    assert.equal(tracker.hasConcurrentLiveRun("conv-2", "run-b"), false);
  });

  test("a fresh tracker instance starts with no memory of a prior instance's registrations (matches an in-process map's empty state after a daemon restart)", () => {
    const trackerBeforeRestart = createLiveRunTracker();
    trackerBeforeRestart.register("conv-1", "run-a");

    const trackerAfterRestart = createLiveRunTracker();
    assert.equal(trackerAfterRestart.hasConcurrentLiveRun("conv-1", "run-a"), false);
  });
});
