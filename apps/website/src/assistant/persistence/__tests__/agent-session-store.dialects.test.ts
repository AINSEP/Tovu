import assert from "node:assert/strict";
import { test } from "node:test";

import { createSqliteAgentSessionStore } from "../agent-session-store.js";
import { describeEachChatDialect } from "./chat-dialect-matrix.js";
import { seedChat } from "./chat-seed.js";

/**
 * @file The agent-session store's one Kysely body on SQLite and PGlite (storage plan §4): every
 * method, the cascade from `ai_chats`, a rollback, and concurrent upserts of one pair.
 */

describeEachChatDialect(
  "agent session store",
  (kernel) => ({ kernel, store: createSqliteAgentSessionStore(kernel) }),
  (make) => {
    test("get is null until set; set round-trips and overwrites; clear removes", async () => {
      const { kernel, store } = make();
      await seedChat(kernel, "c1");
      assert.equal(await store.getSessionId({ conversationId: "c1", agentId: "claude" }), null);
      await store.setSessionId({ conversationId: "c1", agentId: "claude", sessionId: "s1" });
      assert.equal(await store.getSessionId({ conversationId: "c1", agentId: "claude" }), "s1");
      await store.setSessionId({ conversationId: "c1", agentId: "claude", sessionId: "s2" });
      assert.equal(await store.getSessionId({ conversationId: "c1", agentId: "claude" }), "s2");
      await store.clearSessionId({ conversationId: "c1", agentId: "claude" });
      assert.equal(await store.getSessionId({ conversationId: "c1", agentId: "claude" }), null);
      await store.clearSessionId({ conversationId: "c1", agentId: "claude" });
    });

    test("pairs are independent per conversation and per agent", async () => {
      const { kernel, store } = make();
      await seedChat(kernel, "c1");
      await seedChat(kernel, "c2");
      await store.setSessionId({ conversationId: "c1", agentId: "claude", sessionId: "a" });
      await store.setSessionId({ conversationId: "c1", agentId: "codex", sessionId: "b" });
      await store.setSessionId({ conversationId: "c2", agentId: "claude", sessionId: "c" });
      await store.clearSessionId({ conversationId: "c1", agentId: "claude" });
      assert.equal(await store.getSessionId({ conversationId: "c1", agentId: "claude" }), null);
      assert.equal(await store.getSessionId({ conversationId: "c1", agentId: "codex" }), "b");
      assert.equal(await store.getSessionId({ conversationId: "c2", agentId: "claude" }), "c");
    });

    test("set fails for a conversation that does not exist (foreign key)", async () => {
      const { store } = make();
      await assert.rejects(store.setSessionId({ conversationId: "missing", agentId: "claude", sessionId: "s1" }));
    });

    test("deleting the conversation deletes its sessions", async () => {
      const { kernel, store } = make();
      await seedChat(kernel, "c1");
      await store.setSessionId({ conversationId: "c1", agentId: "claude", sessionId: "s1" });
      await kernel.run((db) => db.deleteFrom("ai_chats").where("id", "=", "c1").execute());
      assert.equal(await store.getSessionId({ conversationId: "c1", agentId: "claude" }), null);
    });

    test("a set inside a rolled-back transaction leaves nothing", async () => {
      const { kernel, store } = make();
      await seedChat(kernel, "c1");
      await assert.rejects(
        kernel.transaction(async () => {
          await store.setSessionId({ conversationId: "c1", agentId: "claude", sessionId: "s1" });
          throw new Error("boom");
        }),
        /boom/
      );
      assert.equal(await store.getSessionId({ conversationId: "c1", agentId: "claude" }), null);
    });

    test("concurrent sets of one pair leave exactly one row holding one of the values", async () => {
      const { kernel, store } = make();
      await seedChat(kernel, "c1");
      const values = Array.from({ length: 8 }, (_, i) => `s${i}`);
      await Promise.all(values.map((v) => store.setSessionId({ conversationId: "c1", agentId: "claude", sessionId: v })));
      const rows = await kernel.run((db) => db.selectFrom("assistant_agent_sessions").select("session_id").execute());
      assert.equal(rows.length, 1);
      assert.ok(values.includes(rows[0]!.session_id));
    });
  }
);
