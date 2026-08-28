import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import Database from "better-sqlite3";
import { CHAT_HISTORY_DDL } from "@jini-ai/sqlite";

import {
  GUEST_CHAT_TTL_MS,
  chatExpiryFor,
  createTenantScopedChatStore,
  hashSessionKey,
  type AdminChatPrincipal,
  type GuestChatPrincipal,
} from "../tenant-scope.js";

/**
 * @file `tenant-scope.ts` is the one place a request handler may obtain chat history — these tests
 * cover its three functions directly, none of which had any test anywhere in the repo before this
 * file (confirmed via `grep -rl` across all of `src`, not just this scoped test run).
 */

function freshChatDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(CHAT_HISTORY_DDL);
  return db;
}

describe("hashSessionKey", () => {
  it("returns the sha256 hex digest of the raw session key", () => {
    const key = "raw-cookie-value";
    assert.equal(hashSessionKey(key), createHash("sha256").update(key).digest("hex"));
  });

  it("is deterministic for the same input", () => {
    assert.equal(hashSessionKey("same-key"), hashSessionKey("same-key"));
  });

  it("produces different digests for different inputs", () => {
    assert.notEqual(hashSessionKey("key-a"), hashSessionKey("key-b"));
  });
});

describe("createTenantScopedChatStore", () => {
  it("scopes an admin principal's rows by workspaceId, owner_kind='user', and the raw userId", async () => {
    const db = freshChatDb();
    const principal: AdminChatPrincipal = { kind: "user", workspaceId: "ws-1", userId: "admin-42" };
    const store = createTenantScopedChatStore(db, principal);

    await store.create({ id: "c1" });

    const row = db.prepare("SELECT scope_id, owner_kind, owner_id FROM ai_chats WHERE id = ?").get("c1") as
      | { scope_id: string; owner_kind: string; owner_id: string }
      | undefined;
    assert.ok(row, "the store must have written the row through the real @jini-ai/sqlite adapter");
    assert.equal(row.scope_id, "ws-1");
    assert.equal(row.owner_kind, "user");
    assert.equal(row.owner_id, "admin-42");
    db.close();
  });

  it("scopes a guest principal's rows by owner_kind='guest' and the HASHED session key, never the raw cookie", async () => {
    const db = freshChatDb();
    const rawCookie = "super-secret-cookie-value";
    const principal: GuestChatPrincipal = { kind: "guest", workspaceId: "ws-1", sessionKey: rawCookie };
    const store = createTenantScopedChatStore(db, principal);

    await store.create({ id: "c1" });

    const row = db.prepare("SELECT owner_kind, owner_id FROM ai_chats WHERE id = ?").get("c1") as
      | { owner_kind: string; owner_id: string }
      | undefined;
    assert.ok(row);
    assert.equal(row.owner_kind, "guest");
    assert.equal(row.owner_id, hashSessionKey(rawCookie));
    assert.notEqual(row.owner_id, rawCookie, "the raw cookie must never reach storage");
    db.close();
  });

  it("keeps two different owners' histories independent on the same db", async () => {
    const db = freshChatDb();
    const alice: AdminChatPrincipal = { kind: "user", workspaceId: "ws-1", userId: "alice" };
    const bob: AdminChatPrincipal = { kind: "user", workspaceId: "ws-1", userId: "bob" };

    await createTenantScopedChatStore(db, alice).create({ id: "c-alice" });
    const bobList = await createTenantScopedChatStore(db, bob).list();

    assert.deepEqual(bobList, [], "bob's scoped store must not see alice's conversation");
    db.close();
  });
});

describe("chatExpiryFor", () => {
  it("returns undefined for an admin principal — retained indefinitely", () => {
    const principal: AdminChatPrincipal = { kind: "user", workspaceId: "ws-1", userId: "u1" };
    assert.equal(chatExpiryFor(principal, 1_000), undefined);
  });

  it("returns now + GUEST_CHAT_TTL_MS for a guest principal", () => {
    const principal: GuestChatPrincipal = { kind: "guest", workspaceId: "ws-1", sessionKey: "k" };
    assert.equal(chatExpiryFor(principal, 1_000), 1_000 + GUEST_CHAT_TTL_MS);
  });

  it("defaults `now` to Date.now() when omitted", () => {
    const principal: GuestChatPrincipal = { kind: "guest", workspaceId: "ws-1", sessionKey: "k" };
    const before = Date.now();
    const result = chatExpiryFor(principal);
    const after = Date.now();
    assert.ok(result !== undefined);
    assert.ok(result >= before + GUEST_CHAT_TTL_MS, "expiry must be computed from a `now` no earlier than the call");
    assert.ok(result <= after + GUEST_CHAT_TTL_MS, "expiry must be computed from a `now` no later than the call");
  });
});
