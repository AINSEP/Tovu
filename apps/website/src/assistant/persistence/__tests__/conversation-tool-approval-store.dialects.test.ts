import assert from "node:assert/strict";
import { test } from "node:test";

import type { ConversationToolApprovalKey } from "@jini-ai/mcp/federation";
import { createSqliteConversationToolApprovalStore } from "../conversation-tool-approval-store.js";
import { describeEachChatDialect } from "./chat-dialect-matrix.js";
import { seedChat } from "./chat-seed.js";

/**
 * @file "Allow for this chat" approvals' one Kysely body on SQLite and PGlite (storage plan §4):
 * both methods, the key's every part, the foreign key and cascade, a rollback, and concurrent
 * grants of one key.
 */

const KEY: ConversationToolApprovalKey = {
  conversationId: "c1",
  principalId: "user:u",
  connectionId: "conn-1",
  toolName: "send_email",
  fingerprint: "fp-1",
};
const AT = "2026-09-28T12:00:00.000Z";

describeEachChatDialect(
  "conversation tool approval store",
  (kernel) => ({ kernel, store: createSqliteConversationToolApprovalStore(kernel) }),
  (make) => {
    test("has is false until granted, then true for the exact fingerprint only", async () => {
      const { kernel, store } = make();
      await seedChat(kernel, "c1");
      assert.equal(await store.has(KEY), false);
      await store.grant(KEY, AT);
      assert.equal(await store.has(KEY), true);
      assert.equal(await store.has({ ...KEY, fingerprint: "fp-2" }), false);
    });

    test("native identity lookup survives another chat and revokes with the granting chat", async () => {
      const { kernel, store } = make();
      await seedChat(kernel, "c1"); await seedChat(kernel, "c2");
      const { conversationId: _, ...identity } = KEY;
      assert.equal(await store.hasIdentity!(identity), false);
      await store.grant(KEY, AT);
      assert.equal(await store.hasIdentity!(identity), true);
      for (const changed of [{ principalId: "other" }, { connectionId: "other-site" }, { toolName: "other-plugin" }, { fingerprint: "new-digest" }]) {
        assert.equal(await store.hasIdentity!({ ...identity, ...changed }), false);
      }
      await kernel.run(db => db.deleteFrom("ai_chats").where("id", "=", "c1").execute());
      assert.equal(await store.hasIdentity!(identity), false);
    });

    test("every key part scopes the approval", async () => {
      const { kernel, store } = make();
      await seedChat(kernel, "c1");
      await seedChat(kernel, "c2");
      await store.grant(KEY, AT);
      assert.equal(await store.has({ ...KEY, conversationId: "c2" }), false);
      assert.equal(await store.has({ ...KEY, principalId: "user:other" }), false);
      assert.equal(await store.has({ ...KEY, connectionId: "conn-2" }), false);
      assert.equal(await store.has({ ...KEY, toolName: "delete_email" }), false);
    });

    test("a regrant replaces the fingerprint and time in the one row", async () => {
      const { kernel, store } = make();
      await seedChat(kernel, "c1");
      await store.grant(KEY, AT);
      await store.grant({ ...KEY, fingerprint: "fp-2" }, "2026-09-29T00:00:00.000Z");
      assert.equal(await store.has(KEY), false);
      assert.equal(await store.has({ ...KEY, fingerprint: "fp-2" }), true);
      const rows = await kernel.run((db) => db.selectFrom("assistant_conversation_tool_approvals").selectAll().execute());
      assert.equal(rows.length, 1);
      assert.equal(rows[0]!.granted_at, "2026-09-29T00:00:00.000Z");
    });

    // F6.2: a conflict target missing tool_name must not replace another tool's approval.
    test("two different tools in one chat retain independent approval rows", async () => {
      const { kernel, store } = make();
      await seedChat(kernel, "c1");
      const second = { ...KEY, toolName: "read_email", fingerprint: "fp-read" };
      await store.grant(KEY, AT);
      await store.grant(second, AT);
      assert.equal(await store.has(KEY), true);
      assert.equal(await store.has(second), true);
      const rows = await kernel.run(db => db.selectFrom("assistant_conversation_tool_approvals").select(["tool_name", "fingerprint"]).execute());
      assert.deepEqual(rows.sort((a, b) => a.tool_name.localeCompare(b.tool_name)), [
        { tool_name: "read_email", fingerprint: "fp-read" },
        { tool_name: "send_email", fingerprint: "fp-1" },
      ]);
    });

    test("grant throws for a conversation that does not exist; deleting a chat deletes its approvals", async () => {
      const { kernel, store } = make();
      await assert.rejects(store.grant(KEY, AT), /FOREIGN KEY constraint failed|violates foreign key constraint/);
      await seedChat(kernel, "c1");
      await store.grant(KEY, AT);
      await kernel.run((db) => db.deleteFrom("ai_chats").where("id", "=", "c1").execute());
      assert.equal(await store.has(KEY), false);
    });

    test("a grant inside a rolled-back transaction leaves nothing", async () => {
      const { kernel, store } = make();
      await seedChat(kernel, "c1");
      await assert.rejects(
        kernel.transaction(async () => {
          await store.grant(KEY, AT);
          throw new Error("boom");
        }),
        /boom/
      );
      assert.equal(await store.has(KEY), false);
    });

    test("concurrent grants of one key leave exactly one row", async () => {
      const { kernel, store } = make();
      await seedChat(kernel, "c1");
      await Promise.all(Array.from({ length: 8 }, (_, i) => store.grant({ ...KEY, fingerprint: `fp-${i}` }, AT)));
      const rows = await kernel.run((db) => db.selectFrom("assistant_conversation_tool_approvals").select("fingerprint").execute());
      assert.equal(rows.length, 1);
      assert.match(rows[0]!.fingerprint, /^fp-[0-7]$/);
    });
  }
);
