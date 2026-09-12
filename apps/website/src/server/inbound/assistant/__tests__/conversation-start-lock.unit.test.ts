import assert from "node:assert/strict";
import test, { describe } from "node:test";

import { createConversationStartLock } from "../conversation-start-lock.js";

/**
 * @file Regression suite for the second half of Defect 1 (2026-09-11 chat-lifecycle repair): two
 * turns racing into two different agent-CLI sessions.
 *
 * `agent-run-concurrency.ts`'s `LiveRunTracker` (the H2 fix) already stops two overlapping runs
 * from both passing `--resume <sameId>`. It does NOT stop two overlapping runs from both reading
 * "no session stored yet" and both minting one — a read-modify-write over
 * `assistant_agent_sessions` with an `await` in the middle. Whoever writes last wins the binding,
 * and the loser's CLI session is orphaned: exactly the shape of the observed defect, one turn
 * answering in a session no later turn can ever reach.
 *
 * This lock serializes the read-decide-write section per conversation so the second run observes
 * the first run's binding instead of an empty slot. It deliberately does NOT serialize the runs
 * themselves — a lock held across a whole agent run would hang a second tab's turn for minutes
 * instead of letting the existing concurrency guards answer it.
 */

/** Resolves after `ms`, so a test can make one critical section demonstrably outlast another. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("createConversationStartLock", () => {
  test("runs two critical sections for one conversation strictly one after the other", async () => {
    const lock = createConversationStartLock();
    const order: string[] = [];

    const first = lock.run("conv-1", async () => {
      order.push("first:enter");
      await delay(20);
      order.push("first:exit");
      return "a";
    });
    // Started while `first` is still inside its own `await` — without the lock this body would
    // interleave, which is exactly how two runs both see an empty session slot.
    const second = lock.run("conv-1", async () => {
      order.push("second:enter");
      order.push("second:exit");
      return "b";
    });

    assert.deepEqual(await Promise.all([first, second]), ["a", "b"]);
    assert.deepEqual(order, ["first:enter", "first:exit", "second:enter", "second:exit"]);
  });

  test("the second section observes the first section's write — the read-modify-write this exists for", async () => {
    const lock = createConversationStartLock();
    // Stands in for `AgentSessionStore`: an async read and an async write with a real gap between.
    let stored: string | null = null;
    const bind = async (id: string): Promise<string> => {
      const current = await Promise.resolve(stored);
      if (current !== null) return current;
      await delay(10);
      stored = id;
      return id;
    };

    const [a, b] = await Promise.all([
      lock.run("conv-1", () => bind("session-A")),
      lock.run("conv-1", () => bind("session-B")),
    ]);

    assert.equal(a, "session-A");
    assert.equal(b, "session-A", "the second run minted its own session instead of adopting the first run's — the conversation has forked");
  });

  test("different conversations do not block each other", async () => {
    const lock = createConversationStartLock();
    const order: string[] = [];

    const slow = lock.run("conv-1", async () => {
      await delay(30);
      order.push("slow");
    });
    const fast = lock.run("conv-2", async () => {
      order.push("fast");
    });

    await Promise.all([slow, fast]);
    assert.deepEqual(order, ["fast", "slow"], "a run on one conversation was serialized behind an unrelated conversation's run");
  });

  test("a rejected section does not wedge the conversation for every later run", async () => {
    const lock = createConversationStartLock();

    await assert.rejects(
      lock.run("conv-1", async () => {
        throw new Error("binding failed");
      }),
      /binding failed/,
    );

    // The observable cost of getting this wrong is total: a conversation whose lock never released
    // would hang every later turn forever, with no error anywhere to explain it.
    assert.equal(await lock.run("conv-1", async () => "recovered"), "recovered");
  });

  test("a rejection propagates to its own caller only, not to the next section in line", async () => {
    const lock = createConversationStartLock();
    const failing = lock.run("conv-1", async () => {
      await delay(5);
      throw new Error("binding failed");
    });
    const following = lock.run("conv-1", async () => "ok");

    await assert.rejects(failing, /binding failed/);
    assert.equal(await following, "ok");
  });

  test("an absent conversation id runs immediately and serializes nothing", async () => {
    // A daemon client other than the admin chat pane has no conversation to key a binding by, so
    // there is nothing to protect and no reason to queue it behind anyone.
    const lock = createConversationStartLock();
    const order: string[] = [];

    const first = lock.run(undefined, async () => {
      await delay(20);
      order.push("first");
    });
    const second = lock.run(undefined, async () => {
      order.push("second");
    });

    await Promise.all([first, second]);
    assert.deepEqual(order, ["second", "first"], "runs with no conversation id were serialized against each other");
  });

  test("does not retain per-conversation state after its queue drains", async () => {
    const lock = createConversationStartLock();
    await lock.run("conv-1", async () => undefined);
    await lock.run("conv-2", async () => undefined);
    // One entry per conversation the daemon has EVER started a run for would be an unbounded leak
    // in a process that stays up for days.
    assert.equal(lock.trackedConversationCount(), 0);
  });
});
