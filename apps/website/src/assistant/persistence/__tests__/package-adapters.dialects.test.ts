/** PLAN C3: host adapters borrow the ledger kernel and preserve ancillary-table cascades. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { closeSqliteConnection, sqliteConnectionOf } from "@jini-ai/db/kernel/sqlite";
import { createChatHistoryStore } from "../chat-history-store.js";
import { createSqliteAgentSessionStore } from "../agent-session-store.js";
import { createChatRunLedger } from "../run-ledger.js";
import { createTenantScopedChatStore } from "../tenant-scope.js";
import { describeEachChatDialect, freshSqliteChatKernel } from "./chat-dialect-matrix.js";

const SCOPE = { scopeId: "ws", ownerKind: "user", ownerId: "alice" } as const;
const RUN = { conversationId: "c", messageId: "m", runId: "r" };

describeEachChatDialect("package adapter composition", kernel => ({
  kernel, history: createChatHistoryStore(kernel, SCOPE, () => 1_790_000_000_000),
  sessions: createSqliteAgentSessionStore(kernel), ledger: createChatRunLedger(kernel),
}), make => {
  test("bounded reads use the adopted history adapter and retain owner isolation", async () => {
    const { kernel, history } = make();
    await history.create({ id: "c" });
    await history.appendMessage({ conversationId: "c", message: { id: "m", role: "user", content: "Hello 中 😀" } });
    const foreign = createChatHistoryStore(kernel, { ...SCOPE, ownerId: "bob" });
    assert.deepEqual((await history.pageMessages({ conversationId: "c" }, { limit: 1 })).items.map(m => m.content), ["Hello 中 😀"]);
    assert.deepEqual((await history.pageConversations({}, { limit: 1 })).items.map(c => c.id), ["c"]);
    assert.deepEqual(await foreign.pageMessages({ conversationId: "c" }), { items: [] });
    assert.deepEqual(await foreign.pageConversations({}), { items: [] });
  });

  test("a throwing ledger write rolls back package history AND session writes", async () => {
    const { history, sessions, ledger } = make();
    await history.create({ id: "c" });
    await assert.rejects(ledger.unlessSettled(RUN, async () => {
      await history.appendMessage({ conversationId: "c", message: { id: "m", role: "assistant", content: "must roll back", runId: "r", runStatus: "running" } });
      await sessions.setSessionId({ conversationId: "c", agentId: "a", sessionId: "must roll back" });
      throw new Error("abort shared transaction");
    }), /abort shared transaction/);
    assert.deepEqual(await history.messages({ conversationId: "c" }), []);
    assert.equal(await sessions.getSessionId({ conversationId: "c", agentId: "a" }), null);
  });

  test("a late browser save cannot erase the first terminal answer; a request-bound run can retry", async () => {
    const { kernel, history, ledger } = make();
    const guarded = createTenantScopedChatStore(kernel, { kind: "user", workspaceId: "ws", userId: "alice" }, ledger);
    await history.create({ id: "c" });
    await guarded.appendMessage({ conversationId: "c", message: { id: "m", role: "assistant", content: "draft", runId: "r", runStatus: "running" } });
    assert.equal(await ledger.settle({ ...RUN, content: "Final answer", events: [], status: "succeeded", endedAt: 1_790_000_000_005 }), true);
    assert.equal((await guarded.appendMessage({ conversationId: "c", message: { id: "m", role: "assistant", content: "", events: [], runId: "r", runStatus: "failed" } }))?.content, "Final answer");
    // Daemon acceptance owns retries; changing a browser's run id cannot replace its row.
    assert.equal((await guarded.appendMessage({ conversationId: "c", message: { id: "m", role: "assistant", content: "retry", runId: "r2", runStatus: "running" } }))?.content, "Final answer");
    await guarded.appendMessage({ conversationId: "c", message: { id: "byok-m", role: "assistant", content: "draft", runId: "byok:r", runStatus: "running" } });
    assert.equal(await ledger.settle({ conversationId: "c", messageId: "byok-m", runId: "byok:r", content: "BYOK final", events: [], status: "succeeded", endedAt: 1_790_000_000_006 }), true);
    assert.equal((await guarded.appendMessage({ conversationId: "c", message: { id: "byok-m", role: "assistant", content: "", runId: "byok:r", runStatus: "failed" } }))?.content, "BYOK final");
    assert.equal((await guarded.appendMessage({ conversationId: "c", message: { id: "byok-m", role: "assistant", content: "retry", runId: "byok:r2", runStatus: "running" } }))?.content, "retry");
  });

  test("package delete cascades sessions AND host-owned approvals", async () => {
    const { kernel, history, sessions } = make();
    await history.create({ id: "c" });
    await sessions.setSessionId({ conversationId: "c", agentId: "a", sessionId: "resume" });
    await kernel.run(db => db.insertInto("assistant_conversation_tool_approvals").values({ conversation_id: "c", principal_id: "alice", connection_id: "conn", tool_name: "tool", fingerprint: "fp", granted_at: "2026-10-01T00:00:00.000Z" }).execute());
    await history.delete({ id: "c" });
    assert.equal(await sessions.getSessionId({ conversationId: "c", agentId: "a" }), null);
    assert.deepEqual(await kernel.run(db => db.selectFrom("assistant_conversation_tool_approvals").selectAll().execute()), []);
  });
});

test("negative control: independent kernels do not participate in the ledger rollback", async () => {
  const ledgerKernel = freshSqliteChatKernel();
  const independentKernel = freshSqliteChatKernel();
  try {
    const history = createChatHistoryStore(independentKernel, SCOPE);
    await history.create({ id: "c" });
    const ledger = createChatRunLedger(ledgerKernel);
    await assert.rejects(ledger.unlessSettled(RUN, async () => {
      await history.appendMessage({ conversationId: "c", message: { id: "m", role: "assistant", content: "escaped rollback" } });
      throw new Error("independent write");
    }), /independent write/);
    assert.equal((await history.messages({ conversationId: "c" }))[0]?.content, "escaped rollback", "the positive rollback test must distinguish this broken composition");
  } finally {
    closeSqliteConnection(sqliteConnectionOf(ledgerKernel)!);
    closeSqliteConnection(sqliteConnectionOf(independentKernel)!);
  }
});
