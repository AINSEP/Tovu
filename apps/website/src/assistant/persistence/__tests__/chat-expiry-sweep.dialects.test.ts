import assert from "node:assert/strict";
import { test } from "node:test";

import type { ChatOwnerScope } from "@jini-ai/chat/core";

import type { ChatKernel } from "#src/platform/db/chat-kernel";
import { createChatHistoryStore } from "../chat-history-store.js";
import { startChatExpirySweep, sweepExpiredChats } from "../chat-expiry-sweep.js";
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

describeEachChatDialect("chat expiry sweep", stores, (make) => {
  test("deletes an expired guest chat and its messages; keeps unexpired and never-expiring chats", async () => {
    const { kernel, guest, admin } = make();
    await guest.create({ id: "expired", expiresAt: T0 - 1 });
    await guest.appendMessage("expired", { id: "m1", role: "user", content: "hi" });
    await guest.create({ id: "fresh", expiresAt: T0 + 60_000 });
    await admin.create({ id: "forever" });

    assert.equal(await sweepExpiredChats(kernel, T0), 1);

    assert.equal(await guest.get("expired"), null);
    assert.equal(await messageCount(kernel, "expired"), 0);
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
      stop();
    }
  });
});
