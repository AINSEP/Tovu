import assert from "node:assert/strict";
import { test } from "node:test";

import type { ChatMessage, ChatOwnerScope } from "@jini-ai/chat/core";

import type { ChatKernel } from "#src/platform/db/chat-kernel";
import { createChatHistoryStore } from "../chat-history-store.js";
import { describeEachChatDialect } from "./chat-dialect-matrix.js";

/**
 * @file The chat-history store's one Kysely body on SQLite and PGlite (storage plan §4): every
 * method, owner isolation on each of them (the cases of `@jini-ai/chat/store/sqlite`'s own
 * `chat-history/__tests__/isolation.test.ts`), a rollback, and concurrent appends to one chat.
 */

// Past 2^31: the time columns must hold epoch milliseconds on Postgres (BIGINT), not INTEGER.
const T0 = 1_790_000_000_000;

const ALICE: ChatOwnerScope = { scopeId: "ws", ownerKind: "user", ownerId: "alice" };
const BOB: ChatOwnerScope = { scopeId: "ws", ownerKind: "user", ownerId: "bob" };

function clock(start = T0): () => number {
  let t = start;
  return () => t++;
}

const user = (id: string, content = id): ChatMessage => ({ id, role: "user", content });

function stores(kernel: ChatKernel) {
  const now = clock();
  return {
    kernel,
    alice: createChatHistoryStore(kernel, ALICE, now),
    bob: createChatHistoryStore(kernel, BOB, now),
    of: (scope: ChatOwnerScope) => createChatHistoryStore(kernel, scope, now),
  };
}

describeEachChatDialect("chat history store", stores, (make) => {
  test("create then get and list round-trip every conversation field", async () => {
    const { alice } = make();
    const created = await alice.create({ id: "c1", title: "Hello", titleSource: "manual", expiresAt: T0 + 1000 });
    assert.deepEqual(created, {
      id: "c1",
      title: "Hello",
      titleSource: "manual",
      messageCount: 0,
      createdAt: T0,
      updatedAt: T0,
      expiresAt: T0 + 1000,
    });
    assert.deepEqual(await alice.get("c1"), created);
    const plain = await alice.create({ id: "c2" });
    assert.equal(plain.title, null);
    assert.equal(plain.titleSource, "fallback");
    assert.equal("expiresAt" in plain, false);
  });

  test("list is most-recently-updated first and counts messages", async () => {
    const { alice } = make();
    await alice.create({ id: "old" });
    await alice.create({ id: "new" });
    await alice.appendMessage("old", user("m1"));
    await alice.appendMessage("old", user("m2"));
    const listed = await alice.list();
    assert.deepEqual(
      listed.map((c) => [c.id, c.messageCount]),
      [
        ["old", 2],
        ["new", 0],
      ]
    );
  });

  test("messages round-trip every stored field, in position order", async () => {
    const { alice } = make();
    await alice.create({ id: "c1" });
    const full: ChatMessage = {
      id: "a1",
      role: "assistant",
      content: "answer",
      agentId: "claude",
      agentName: "Claude",
      events: [{ kind: "text", text: "hi" }] as unknown as ChatMessage["events"],
      attachments: [{ name: "f.txt" }] as unknown as ChatMessage["attachments"],
      runId: "run-1",
      runStatus: "succeeded",
      createdAt: T0 + 5,
      startedAt: T0 + 6,
      endedAt: T0 + 7,
    };
    await alice.appendMessage("c1", user("u1", "question"));
    const saved = await alice.appendMessage("c1", full);
    assert.deepEqual(saved, full);
    const all = await alice.messages("c1");
    assert.deepEqual(
      all.map((m) => m.id),
      ["u1", "a1"]
    );
    assert.equal(all[0]!.content, "question");
    assert.equal(typeof all[0]!.createdAt, "number");
  });

  test("a malformed events column reads as no events, not an error", async () => {
    const { kernel, alice } = make();
    await alice.create({ id: "c1" });
    await alice.appendMessage("c1", user("u1"));
    await kernel.run((db) => db.updateTable("ai_chat_messages").set({ events_json: "{not json" }).where("id", "=", "u1").execute());
    const [message] = await alice.messages("c1");
    assert.equal(message!.events, undefined);
    assert.equal(message!.content, "u1");
  });

  test("appending an existing id updates it in place at the same position", async () => {
    const { alice } = make();
    await alice.create({ id: "c1" });
    await alice.appendMessage("c1", user("u1"));
    await alice.appendMessage("c1", { id: "a1", role: "assistant", content: "draft", runStatus: "running" });
    await alice.appendMessage("c1", user("u2"));
    await alice.appendMessage("c1", { id: "a1", role: "assistant", content: "final", runStatus: "succeeded" });
    const all = await alice.messages("c1");
    assert.deepEqual(
      all.map((m) => [m.id, m.content]),
      [
        ["u1", "u1"],
        ["a1", "final"],
        ["u2", "u2"],
      ]
    );
    assert.equal(all[1]!.runStatus, "succeeded");
  });

  test("appending bumps the conversation's updatedAt", async () => {
    const { alice } = make();
    const created = await alice.create({ id: "c1" });
    await alice.appendMessage("c1", user("u1"));
    assert.ok((await alice.get("c1"))!.updatedAt > created.updatedAt);
  });

  test("rename: a generated title replaces a fallback one but never a manual one", async () => {
    const { alice } = make();
    await alice.create({ id: "c1" });
    assert.equal((await alice.rename("c1", "Auto", "generated"))!.title, "Auto");
    assert.equal((await alice.rename("c1", "Mine"))!.titleSource, "manual");
    const after = await alice.rename("c1", "Auto again", "generated");
    assert.equal(after!.title, "Mine");
    assert.equal(after!.titleSource, "manual");
  });

  test("touch bumps updatedAt and, when asked, the expiry", async () => {
    const { alice } = make();
    const created = await alice.create({ id: "c1", expiresAt: T0 + 10 });
    await alice.touch("c1");
    const touched = await alice.get("c1");
    assert.ok(touched!.updatedAt > created.updatedAt);
    assert.equal(touched!.expiresAt, T0 + 10);
    await alice.touch("c1", { expiresAt: T0 + 99 });
    assert.equal((await alice.get("c1"))!.expiresAt, T0 + 99);
  });

  test("delete cascades to messages, agent sessions and tool approvals", async () => {
    const { kernel, alice } = make();
    await alice.create({ id: "c1" });
    await alice.appendMessage("c1", user("u1"));
    await kernel.run((db) =>
      db.insertInto("assistant_agent_sessions").values({ conversation_id: "c1", agent_id: "a", session_id: "s", updated_at: T0 }).execute()
    );
    await kernel.run(db => db.insertInto("assistant_conversation_tool_approvals").values({ conversation_id: "c1", principal_id: "alice", connection_id: "mcp", tool_name: "read", fingerprint: "fp", granted_at: "2026-09-01T00:00:00.000Z" }).execute());
    await alice.delete("c1");
    assert.equal(await alice.get("c1"), null);
    const left = await kernel.run(async (db) => [
      ...(await db.selectFrom("ai_chat_messages").select("id").execute()),
      ...(await db.selectFrom("assistant_agent_sessions").select("conversation_id as id").execute()),
      ...(await db.selectFrom("assistant_conversation_tool_approvals").select("conversation_id as id").execute()),
    ]);
    assert.deepEqual(left, []);
  });

  test("another owner, workspace or owner kind sees nothing and changes nothing", async () => {
    const { alice, bob, of } = make();
    await alice.create({ id: "c1", title: "Alice's" });
    await alice.appendMessage("c1", user("u1"));
    for (const other of [bob, of({ ...ALICE, scopeId: "ws2" }), of({ ...ALICE, ownerKind: "guest" })]) {
      assert.equal(await other.get("c1"), null);
      assert.deepEqual(await other.list(), []);
      assert.deepEqual(await other.messages("c1"), []);
      assert.equal(await other.rename("c1", "hijack"), null);
      await other.touch("c1", { expiresAt: 1 });
      await other.delete("c1");
      assert.equal(await other.appendMessage("c1", user("x1")), null);
    }
    const still = await alice.get("c1");
    assert.equal(still!.title, "Alice's");
    assert.equal(still!.messageCount, 1);
    assert.equal("expiresAt" in still!, false);
  });

  test("appending an id that lives in another owner's chat never overwrites that row", async () => {
    const { alice, bob } = make();
    await alice.create({ id: "ca" });
    await bob.create({ id: "cb" });
    await alice.appendMessage("ca", user("shared-id", "alice's text"));
    assert.equal(await bob.appendMessage("cb", user("shared-id", "bob's text")), null);
    assert.equal((await alice.messages("ca"))[0]!.content, "alice's text");
    assert.deepEqual(await bob.messages("cb"), []);
  });

  test("an append inside a rolled-back transaction leaves nothing", async () => {
    const { kernel, alice } = make();
    await alice.create({ id: "c1" });
    await assert.rejects(
      kernel.transaction(async () => {
        await alice.appendMessage("c1", user("u1"));
        throw new Error("boom");
      }),
      /boom/
    );
    assert.deepEqual(await alice.messages("c1"), []);
  });

  test("concurrent appends to one chat get distinct, gap-free positions", async () => {
    const { kernel, alice } = make();
    await alice.create({ id: "c1" });
    const ids = Array.from({ length: 10 }, (_, i) => `m${i}`);
    const saved = await Promise.all(ids.map((id) => alice.appendMessage("c1", user(id))));
    assert.ok(saved.every((m) => m !== null));
    const positions = await kernel.run((db) => db.selectFrom("ai_chat_messages").select("position").orderBy("position").execute());
    assert.deepEqual(
      positions.map((p) => Number(p.position)),
      ids.map((_, i) => i)
    );
  });
});
