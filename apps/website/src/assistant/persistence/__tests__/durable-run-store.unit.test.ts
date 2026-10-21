import assert from "node:assert/strict";
import { test } from "node:test";
import { freshSqliteChatKernel } from "./chat-dialect-matrix.js";
import { createChatStoreFactory } from "../store-factory.js";
import { createDurableRunStore } from "../durable-run-store.js";

/**
 * `createDurableRunStore` binds Jini's durable store to Tovu's run-ID prefixes: a run without an
 * attempts row is classified by its ID, so a BYOK/AG-UI run is never mistaken for a daemon run.
 */
test("a run with no attempt row is classified by Tovu's run-ID prefixes", async () => {
  const kernel = freshSqliteChatKernel();
  const history = createChatStoreFactory(kernel)({ kind: "user", workspaceId: "ws", userId: "admin" });
  await history.create({ id: "chat" });
  await history.appendMessage({ conversationId: "chat", message: { id: "byok-answer", role: "assistant", content: "draft", runId: "byok:r1", runStatus: "running" } });
  await history.appendMessage({ conversationId: "chat", message: { id: "daemon-answer", role: "assistant", content: "draft", runId: "run-7", runStatus: "running" } });

  const store = createDurableRunStore({ kernel });
  const byok = await store.find({ runId: "byok:r1" }, {});
  const daemon = await store.find({ runId: "run-7" }, {});
  assert.equal(byok?.engine, "request");
  assert.equal(byok?.messageId, "byok-answer");
  assert.equal(daemon?.engine, "daemon");
  assert.equal(daemon?.principalId, "admin");
  assert.equal(await store.find({ runId: "missing" }, {}), null);
});
