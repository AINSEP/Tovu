import assert from "node:assert/strict";
import test, { describe } from "node:test";

import { createConversationStartLock } from "../../../../assistant/agent-session-preset.js";

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
    const lock = createConversationStartLock({}, {});
    const order: string[] = [];

    const first = lock.run({ conversationId: "conv-1", critical: async () => {
      order.push("first:enter");
      await delay(20);
      order.push("first:exit");
      return "a";
    } }, {});
    // Started while `first` is still inside its own `await` — without the lock this body would
    // interleave, which is exactly how two runs both see an empty session slot.
    const second = lock.run({ conversationId: "conv-1", critical: async () => {
      order.push("second:enter");
      order.push("second:exit");
      return "b";
    } }, {});

    assert.deepEqual(await Promise.all([first, second]), ["a", "b"]);
    assert.deepEqual(order, ["first:enter", "first:exit", "second:enter", "second:exit"]);
  });

  test("the second section observes the first section's write — the read-modify-write this exists for", async () => {
    const lock = createConversationStartLock({}, {});
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
      lock.run({ conversationId: "conv-1", critical: () => bind("session-A") }, {}),
      lock.run({ conversationId: "conv-1", critical: () => bind("session-B") }, {}),
    ]);

    assert.equal(a, "session-A");
    assert.equal(b, "session-A", "the second run minted its own session instead of adopting the first run's — the conversation has forked");
  });

  test("different conversations do not block each other", async () => {
    const lock = createConversationStartLock({}, {});
    const order: string[] = [];

    const slow = lock.run({ conversationId: "conv-1", critical: async () => {
      await delay(30);
      order.push("slow");
    } }, {});
    const fast = lock.run({ conversationId: "conv-2", critical: async () => {
      order.push("fast");
    } }, {});

    await Promise.all([slow, fast]);
    assert.deepEqual(order, ["fast", "slow"], "a run on one conversation was serialized behind an unrelated conversation's run");
  });

  test("a rejected section does not wedge the conversation for every later run", async () => {
    const lock = createConversationStartLock({}, {});

    await assert.rejects(
      lock.run({ conversationId: "conv-1", critical: async () => {
        throw new Error("binding failed");
      } }, {}),
      /binding failed/,
    );

    // The observable cost of getting this wrong is total: a conversation whose lock never released
    // would hang every later turn forever, with no error anywhere to explain it.
    assert.equal(await lock.run({ conversationId: "conv-1", critical: async () => "recovered" }, {}), "recovered");
  });

  test("a rejection propagates to its own caller only, not to the next section in line", async () => {
    const lock = createConversationStartLock({}, {});
    const failing = lock.run({ conversationId: "conv-1", critical: async () => {
      await delay(5);
      throw new Error("binding failed");
    } }, {});
    const following = lock.run({ conversationId: "conv-1", critical: async () => "ok" }, {});

    await assert.rejects(failing, /binding failed/);
    assert.equal(await following, "ok");
  });

  test("an absent conversation id runs immediately and serializes nothing", async () => {
    // A daemon client other than the admin chat pane has no conversation to key a binding by, so
    // there is nothing to protect and no reason to queue it behind anyone.
    const lock = createConversationStartLock({}, {});
    const order: string[] = [];

    const first = lock.run({ conversationId: undefined, critical: async () => {
      await delay(20);
      order.push("first");
    } }, {});
    const second = lock.run({ conversationId: undefined, critical: async () => {
      order.push("second");
    } }, {});

    await Promise.all([first, second]);
    assert.deepEqual(order, ["second", "first"], "runs with no conversation id were serialized against each other");
  });

  test("does not retain per-conversation state after its queue drains", async () => {
    const lock = createConversationStartLock({}, {});
    await lock.run({ conversationId: "conv-1", critical: async () => undefined }, {});
    await lock.run({ conversationId: "conv-2", critical: async () => undefined }, {});
    // One entry per conversation the daemon has EVER started a run for would be an unbounded leak
    // in a process that stays up for days.
    assert.equal(lock.trackedConversationCount({}, {}), 0);
  });
});

test("a third section arriving after the first finishes still waits for the held second section", { timeout: 5_000 }, async () => {
  const lock = createConversationStartLock({}, {});
  const firstGate = Promise.withResolvers<void>();
  const secondGate = Promise.withResolvers<void>();
  const secondEntered = Promise.withResolvers<void>();
  const order: string[] = [];
  const first = lock.run({ conversationId: "conv-1", critical: async () => { await firstGate.promise; order.push("first:exit"); } }, {});
  const second = lock.run({ conversationId: "conv-1", critical: async () => {
    order.push("second:enter");
    secondEntered.resolve();
    await secondGate.promise;
    order.push("second:exit");
  } }, {});
  firstGate.resolve();
  await first;
  await secondEntered.promise;
  const third = lock.run({ conversationId: "conv-1", critical: async () => { order.push("third:enter"); } }, {});
  try {
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.deepEqual(order, ["first:exit", "second:enter"]);
  } finally {
    secondGate.resolve();
    await Promise.all([second, third]);
  }
  assert.deepEqual(order, ["first:exit", "second:enter", "second:exit", "third:enter"]);
});
