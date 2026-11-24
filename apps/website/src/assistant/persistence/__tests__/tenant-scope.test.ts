import { describe, it } from "node:test";
import assert from "node:assert/strict";

import Database from "better-sqlite3";
import { CHAT_HISTORY_DDL } from "@jini-ai/chat/store/sqlite";

import { hashSessionKey, type AdminChatPrincipal, type GuestChatPrincipal } from "@jini-ai/chat/store/runtime";
import { createTenantScopedChatStore } from "../tenant-scope.js";

/**
 * @file `tenant-scope.ts` is the one place a request handler may obtain chat history — these tests
 * cover its store binding directly. `hashSessionKey`/`chatExpiryFor` moved to
 * `@jini-ai/chat/store/runtime` with their unit tests (`chat-principal.test.ts` there).
 */

function freshChatDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(CHAT_HISTORY_DDL);
  return db;
}

describe("createTenantScopedChatStore", () => {
  it("scopes an admin principal's rows by workspaceId, owner_kind='user', and the raw userId", async () => {
    const db = freshChatDb();
    const principal: AdminChatPrincipal = { kind: "user", workspaceId: "ws-1", userId: "admin-42" };
    const store = createTenantScopedChatStore({ db: db, principal: principal });

    await store.create({ id: "c1" });

    const row = db.prepare("SELECT scope_id, owner_kind, owner_id FROM ai_chats WHERE id = ?").get("c1") as
      | { scope_id: string; owner_kind: string; owner_id: string }
      | undefined;
    assert.ok(row, "the store must have written the row through the real @jini-ai/chat/store/sqlite adapter");
    assert.equal(row.scope_id, "ws-1");
    assert.equal(row.owner_kind, "user");
    assert.equal(row.owner_id, "admin-42");
    db.close();
  });

  it("scopes a guest principal's rows by owner_kind='guest' and the HASHED session key, never the raw cookie", async () => {
    const db = freshChatDb();
    const rawCookie = "super-secret-cookie-value";
    const principal: GuestChatPrincipal = { kind: "guest", workspaceId: "ws-1", sessionKey: rawCookie };
    const store = createTenantScopedChatStore({ db: db, principal: principal });

    await store.create({ id: "c1" });

    const row = db.prepare("SELECT owner_kind, owner_id FROM ai_chats WHERE id = ?").get("c1") as
      | { owner_kind: string; owner_id: string }
      | undefined;
    assert.ok(row);
    assert.equal(row.owner_kind, "guest");
    assert.equal(row.owner_id, hashSessionKey({ sessionKey: rawCookie }));
    assert.notEqual(row.owner_id, rawCookie, "the raw cookie must never reach storage");
    db.close();
  });

  it("keeps two different owners' histories independent on the same db", async () => {
    const db = freshChatDb();
    const alice: AdminChatPrincipal = { kind: "user", workspaceId: "ws-1", userId: "alice" };
    const bob: AdminChatPrincipal = { kind: "user", workspaceId: "ws-1", userId: "bob" };

    await createTenantScopedChatStore({ db: db, principal: alice }).create({ id: "c-alice" });
    const bobList = await createTenantScopedChatStore({ db: db, principal: bob }).list();

    assert.deepEqual(bobList, [], "bob's scoped store must not see alice's conversation");
    db.close();
  });
});
