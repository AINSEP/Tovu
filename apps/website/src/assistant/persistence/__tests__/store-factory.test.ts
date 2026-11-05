import { describe, it } from "node:test";
import assert from "node:assert/strict";

import Database from "better-sqlite3";
import { CHAT_HISTORY_DDL } from "@jini-ai/chat/store/sqlite";

import { createChatStoreFactory, createInMemoryChatHistory } from "../store-factory.js";
import type { AdminChatPrincipal } from "../tenant-scope.js";

/**
 * @file `createChatStoreFactory` (the host-db-backed factory) had no direct test anywhere in the
 * repo before this file — only exercised indirectly through
 * `server/agent-daemon/__tests__/integration/daemon-boots.integration.test.ts`, which never called
 * it with more than one principal or asserted on scoping. `createInMemoryChatHistory` IS
 * exercised elsewhere, but its lazy-open and cascade-delete behavior (both documented as
 * load-bearing in this file's own comments) were not directly asserted; covered here too.
 */

describe("createChatStoreFactory", () => {
  it("returns a store scoped to the given principal, backed by the supplied db", async () => {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    db.exec(CHAT_HISTORY_DDL);

    const factory = createChatStoreFactory(db);
    const principal: AdminChatPrincipal = { kind: "user", workspaceId: "ws-1", userId: "u1" };
    const store = factory(principal);

    await store.create({ id: "c1", title: "hi" });
    const listed = await store.list();
    assert.equal(listed.length, 1);
    assert.equal(listed[0]?.id, "c1");
    db.close();
  });

  it("returns a fresh scoped store per call, all against the SAME db handle", async () => {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    db.exec(CHAT_HISTORY_DDL);

    const factory = createChatStoreFactory(db);
    const alice: AdminChatPrincipal = { kind: "user", workspaceId: "ws-1", userId: "alice" };
    const bob: AdminChatPrincipal = { kind: "user", workspaceId: "ws-1", userId: "bob" };

    const first = factory(alice);
    const created = await first.create({ id: "c-alice" });
    const second = factory(alice);
    assert.notEqual(second, first);
    assert.deepEqual(await second.get({ id: "c-alice" }), created);
    assert.deepEqual(db.prepare("SELECT id, owner_id FROM ai_chats").all(), [{ id: "c-alice", owner_id: "alice" }]);
    const bobList = await factory(bob).list();

    assert.deepEqual(bobList, [], "a second call for a different principal must not see the first principal's row");
    db.close();
  });
});

describe("createInMemoryChatHistory", () => {
  it("opens its db lazily and reuses it across calls, so writes persist between calls", async () => {
    const factory = createInMemoryChatHistory().chatHistory;
    const principal: AdminChatPrincipal = { kind: "user", workspaceId: "ws-1", userId: "u1" };

    await factory(principal).create({ id: "c1", title: "hi" });
    // A second call must reuse the SAME lazily-opened db, not silently open a fresh empty one —
    // the module's own doc calls this out ("Once opened it lives for the factory's lifetime").
    const listed = await factory(principal).list();
    assert.equal(listed.length, 1);
    assert.equal(listed[0]?.id, "c1");
  });

  it("gives two independent factory instances two independent in-memory dbs", async () => {
    const factoryA = createInMemoryChatHistory().chatHistory;
    const factoryB = createInMemoryChatHistory().chatHistory;
    const principal: AdminChatPrincipal = { kind: "user", workspaceId: "ws-1", userId: "u1" };

    await factoryA(principal).create({ id: "c1" });
    const listedFromB = await factoryB(principal).list();

    assert.deepEqual(listedFromB, [], "a fresh factory must not see another factory's private in-memory db");
  });

  it("enables foreign_keys, so deleting a conversation cascades to its messages", async () => {
    const factory = createInMemoryChatHistory().chatHistory;
    const principal: AdminChatPrincipal = { kind: "user", workspaceId: "ws-1", userId: "u1" };
    const store = factory(principal);

    await store.create({ id: "c1" });
    await store.appendMessage({ conversationId: "c1", message: { id: "m1", role: "user", content: "hello" } });
    await store.delete({ id: "c1" });

    // If `PRAGMA foreign_keys = ON` were not set, the message row would survive its conversation's
    // deletion — this is the exact regression the module's own comment warns about.
    const listed = await store.list();
    assert.deepEqual(listed, []);
    await store.create({ id: "c1" });
    assert.deepEqual(await store.messages({ conversationId: "c1" }), [], "no orphaned messages may reappear when the conversation id is reused");
  });
});

it("the lazy ledger forwards checkpoint receipts and expected lengths", async () => {
  const { chatHistory, chatRunLedger: ledger } = createInMemoryChatHistory();
  const store = chatHistory({ kind: 'user', workspaceId: 'ws', userId: 'owner' });
  await store.create({ id: 'c' });
  const run = { conversationId: 'c', messageId: 'a', runId: 'run-1' };
  await ledger.durable!.accept({ ...run, principalId: 'owner', workspaceId: 'ws', now: 1, request: { contextRef: '{}' } }, {});
  type State = NonNullable<Parameters<typeof ledger.checkpoint>[1]>['previous'];
  let receipt: State;
  const first = { ...run, content: 'first', events: [{ kind: 'text' as const, text: 'first' }] };
  assert.equal(await ledger.checkpoint(first, { onPersisted: state => { receipt = state; } }), true);
  assert.equal(receipt?.length, JSON.stringify(first.events).length);
  const second = { ...run, content: 'first second', events: [{ kind: 'text' as const, text: 'first second' }] };
  assert.equal(await ledger.checkpoint(second, { expected: receipt?.length, previous: receipt }), true);
  assert.deepEqual((await store.messages({ conversationId: 'c' }))[0]?.events, second.events);
});


describe("in-memory idle probe", () => {
  it("is false before lazy open and protects an active row from any principal", async () => {
    const { chatHistory, chatRunLedger } = createInMemoryChatHistory();
    assert.equal(await chatRunLedger.hasActiveRuns({}, {}), false);
    const store = chatHistory({ kind: "user", workspaceId: "ws", userId: "other-owner" });
    await store.create({ id: "idle-check" });
    await store.appendMessage({ conversationId: "idle-check", message: {
      id: "active", role: "assistant", content: "", runId: "run-idle-check", runStatus: "running",
    } });
    assert.equal(await chatRunLedger.hasActiveRuns({}, {}), true);
    await store.delete({ id: "idle-check" });
    assert.equal(await chatRunLedger.hasActiveRuns({}, {}), false);
  });
});
