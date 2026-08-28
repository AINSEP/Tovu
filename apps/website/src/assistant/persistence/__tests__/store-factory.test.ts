import { describe, it } from "node:test";
import assert from "node:assert/strict";

import Database from "better-sqlite3";
import { CHAT_HISTORY_DDL } from "@jini-ai/sqlite";

import { createChatStoreFactory, createInMemoryChatStoreFactory } from "../store-factory.js";
import type { AdminChatPrincipal } from "../tenant-scope.js";

/**
 * @file `createChatStoreFactory` (the host-db-backed factory) had no direct test anywhere in the
 * repo before this file — only exercised indirectly through
 * `server/agent-daemon/__tests__/integration/daemon-boots.integration.test.ts`, which never called
 * it with more than one principal or asserted on scoping. `createInMemoryChatStoreFactory` IS
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

    await factory(alice).create({ id: "c-alice" });
    const bobList = await factory(bob).list();

    assert.deepEqual(bobList, [], "a second call for a different principal must not see the first principal's row");
    db.close();
  });
});

describe("createInMemoryChatStoreFactory", () => {
  it("opens its db lazily and reuses it across calls, so writes persist between calls", async () => {
    const factory = createInMemoryChatStoreFactory();
    const principal: AdminChatPrincipal = { kind: "user", workspaceId: "ws-1", userId: "u1" };

    await factory(principal).create({ id: "c1", title: "hi" });
    // A second call must reuse the SAME lazily-opened db, not silently open a fresh empty one —
    // the module's own doc calls this out ("Once opened it lives for the factory's lifetime").
    const listed = await factory(principal).list();
    assert.equal(listed.length, 1);
    assert.equal(listed[0]?.id, "c1");
  });

  it("gives two independent factory instances two independent in-memory dbs", async () => {
    const factoryA = createInMemoryChatStoreFactory();
    const factoryB = createInMemoryChatStoreFactory();
    const principal: AdminChatPrincipal = { kind: "user", workspaceId: "ws-1", userId: "u1" };

    await factoryA(principal).create({ id: "c1" });
    const listedFromB = await factoryB(principal).list();

    assert.deepEqual(listedFromB, [], "a fresh factory must not see another factory's private in-memory db");
  });

  it("enables foreign_keys, so deleting a conversation cascades to its messages", async () => {
    const factory = createInMemoryChatStoreFactory();
    const principal: AdminChatPrincipal = { kind: "user", workspaceId: "ws-1", userId: "u1" };
    const store = factory(principal);

    await store.create({ id: "c1" });
    await store.appendMessage("c1", { id: "m1", role: "user", content: "hello" });
    await store.delete("c1");

    // If `PRAGMA foreign_keys = ON` were not set, the message row would survive its conversation's
    // deletion — this is the exact regression the module's own comment warns about.
    const listed = await store.list();
    assert.deepEqual(listed, []);
  });
});
