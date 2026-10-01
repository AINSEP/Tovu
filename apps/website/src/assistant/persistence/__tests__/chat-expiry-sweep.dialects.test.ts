import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";

import type { ChatOwnerScope } from "@jini-ai/chat/core";

import type { ChatKernel } from "#src/platform/db/chat-kernel";
import { createChatHistoryStore } from "../chat-history-store.js";
import { startChatExpirySweep, sweepExpiredChats } from "../chat-expiry-sweep.js";
import { heldUntil } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { describeEachChatDialect } from "./chat-dialect-matrix.js";

/**
 * @file The chat retention sweep on SQLite and PGlite: an expired conversation and its messages
 * go; an unexpired one and one with no `expires_at` stay, whoever owns them.
 */

// Past 2^31: `expires_at` must compare as epoch milliseconds on Postgres (BIGINT).
const T0 = 1_790_000_000_000;

const GUEST: ChatOwnerScope = { scopeId: "ws", ownerKind: "guest", ownerId: "hashed-session" };
const ADMIN: ChatOwnerScope = { scopeId: "ws", ownerKind: "user", ownerId: "alice" };

function stores(kernel: ChatKernel) {
  const now = () => T0;
  return { kernel, guest: createChatHistoryStore(kernel, GUEST, now), admin: createChatHistoryStore(kernel, ADMIN, now) };
}

async function messageCount(kernel: ChatKernel, conversationId: string): Promise<number> {
  const rows = await kernel.run((db) => db.selectFrom("ai_chat_messages").select("id").where("conversation_id", "=", conversationId).execute());
  return rows.length;
}

/** Capture the registered interval so each attempted tick is explicit, independent of wall time. */
function manualInterval(t: TestContext) {
  let callback: (() => void) | undefined;
  let cleared = false;
  const timer = { unref() {} };
  t.mock.method(globalThis, "setInterval", (fn: () => void, intervalMs: number) => {
    assert.equal(intervalMs, 5);
    assert.equal(callback, undefined, "only one interval should be registered");
    callback = fn;
    return timer;
  });
  t.mock.method(globalThis, "clearInterval", (handle: unknown) => {
    assert.equal(handle, timer);
    cleared = true;
  });
  return {
    tick() {
      assert.ok(callback, "the sweep must schedule an interval");
      assert.equal(cleared, false);
      callback();
    },
    get cleared() { return cleared; },
  };
}

describeEachChatDialect("chat expiry sweep", stores, (make) => {
  test("deletes an expired guest chat and its messages; keeps unexpired and never-expiring chats", async () => {
    const { kernel, guest, admin } = make();
    await guest.create({ id: "expired", expiresAt: T0 - 1 });
    await guest.appendMessage("expired", { id: "m1", role: "user", content: "hi" });
    await admin.create({ id: "expired-user", expiresAt: T0 - 1 });
    await admin.appendMessage("expired-user", { id: "m2", role: "user", content: "hello" });
    await kernel.run(async (db) => {
      for (const conversationId of ["expired", "expired-user"]) {
        await db.insertInto("assistant_agent_sessions").values({ conversation_id: conversationId, agent_id: "a", session_id: `s-${conversationId}`, updated_at: T0 }).execute();
        await db.insertInto("assistant_conversation_tool_approvals").values({
          conversation_id: conversationId, principal_id: "alice", connection_id: "mcp", tool_name: "read", fingerprint: "fp", granted_at: "2026-09-01T00:00:00.000Z",
        }).execute();
      }
    });
    await guest.create({ id: "fresh", expiresAt: T0 + 60_000 });
    await admin.create({ id: "forever" });

    assert.equal(await sweepExpiredChats(kernel, T0), 2);

    assert.equal(await guest.get("expired"), null);
    assert.equal(await messageCount(kernel, "expired"), 0);
    assert.equal(await admin.get("expired-user"), null);
    assert.equal(await messageCount(kernel, "expired-user"), 0);
    const remainingChildren = await kernel.run(async (db) => [
      ...await db.selectFrom("assistant_agent_sessions").select("conversation_id").execute(),
      ...await db.selectFrom("assistant_conversation_tool_approvals").select("conversation_id").execute(),
    ]);
    assert.deepEqual(remainingChildren, [], "sessions and approvals must cascade with the expired chats");
    assert.notEqual(await guest.get("fresh"), null);
    assert.notEqual(await admin.get("forever"), null);
  });

  test("a chat expiring exactly now is swept; a second pass deletes nothing", async () => {
    const { kernel, guest } = make();
    await guest.create({ id: "edge", expiresAt: T0 });
    assert.equal(await sweepExpiredChats(kernel, T0), 1);
    assert.equal(await sweepExpiredChats(kernel, T0), 0);
  });

  test("startChatExpirySweep sweeps at start and stops cleanly", async () => {
    const { kernel, guest } = make();
    await guest.create({ id: "expired", expiresAt: T0 - 1 });
    const errors: unknown[] = [];
    const stop = startChatExpirySweep(kernel, { now: () => T0, intervalMs: 60_000, onError: (e) => errors.push(e) });
    try {
      for (let i = 0; i < 50 && (await guest.get("expired")) !== null; i++) await new Promise((r) => setImmediate(r));
      assert.equal(await guest.get("expired"), null);
      assert.deepEqual(errors, []);
    } finally {
      await stop();
    }
  });

  test("stop() resolves only after the pass in flight has finished", async () => {
    const { kernel, guest } = make();
    await guest.create({ id: "expired", expiresAt: T0 - 1 });
    let release!: () => void;
    const held = heldUntil(kernel, new Promise<void>((r) => (release = r)));
    const stop = startChatExpirySweep(held, { now: () => T0, intervalMs: 60_000 });
    let stopped = false;
    const stopping = stop().then(() => (stopped = true));
    for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
    assert.equal(stopped, false, "stop() must wait for the held pass");
    release();
    await stopping;
    assert.equal(await guest.get("expired"), null, "the pass stop() waited for ran to completion");
  });

  test("a tick that fires while a pass is still running is skipped, never overlapped, and later ticks sweep again", async (t) => {
    const { kernel, guest } = make();
    await kernel.run(async () => undefined);
    const interval = manualInterval(t);
    let release!: () => void;
    const held = heldUntil(kernel, new Promise<void>((r) => (release = r)));
    let active = 0;
    let maxActive = 0;
    let passes = 0;
    let finishBoot!: () => void;
    const bootFinished = new Promise<void>((resolve) => { finishBoot = resolve; });
    let finishLater!: () => void;
    const laterFinished = new Promise<void>((resolve) => { finishLater = resolve; });
    const counting: typeof held = {
      ...held,
      run: async (fn) => {
        const passNumber = ++passes;
        active++;
        maxActive = Math.max(maxActive, active);
        try {
          return await held.run(fn);
        } finally {
          active--;
          if (passNumber === 1) finishBoot();
          else finishLater();
        }
      },
    };
    const stop = startChatExpirySweep(counting, { now: () => T0, intervalMs: 5 });
    try {
      assert.equal(passes, 1, "the boot pass starts immediately");
      interval.tick();
      interval.tick();
      assert.equal(passes, 1, "both attempted ticks must be skipped during the held boot pass");
      assert.equal(maxActive, 1);
      release();
      await bootFinished;
      await new Promise((resolve) => setImmediate(resolve));
      await guest.create({ id: "expired-later", expiresAt: T0 - 1 });
      interval.tick();
      assert.equal(passes, 2, "a tick after completion must start another pass");
      await laterFinished;
      assert.equal(await guest.get("expired-later"), null);
      assert.equal(maxActive, 1);
    } finally {
      release();
      await stop();
    }
    assert.equal(interval.cleared, true);
  });

  test("a failed sweep reports the error and a later tick still sweeps", async (t) => {
    const { kernel, guest } = make();
    await guest.create({ id: "expired-after-error", expiresAt: T0 - 1 });
    const interval = manualInterval(t);
    const failure = new Error("sweep failed once");
    const errors: unknown[] = [];
    let reportError!: () => void;
    const errorReported = new Promise<void>((resolve) => { reportError = resolve; });
    let finishRecovery!: () => void;
    const recoveryFinished = new Promise<void>((resolve) => { finishRecovery = resolve; });
    let passes = 0;
    const failingOnce: ChatKernel = {
      ...kernel,
      run: async (fn) => {
        if (++passes === 1) throw failure;
        try { return await kernel.run(fn); }
        finally { finishRecovery(); }
      },
    };
    const stop = startChatExpirySweep(failingOnce, {
      now: () => T0, intervalMs: 5,
      onError: (error) => { errors.push(error); reportError(); },
    });
    try {
      await errorReported;
      assert.deepEqual(errors, [failure]);
      assert.notEqual(await guest.get("expired-after-error"), null, "the failed pass must leave the chat present");
      await new Promise((resolve) => setImmediate(resolve));
      interval.tick();
      assert.equal(passes, 2, "failure must release the active-pass guard");
      await recoveryFinished;
      assert.equal(await guest.get("expired-after-error"), null);
      assert.deepEqual(errors, [failure]);
    } finally {
      await stop();
    }
    assert.equal(interval.cleared, true);
  });
});
