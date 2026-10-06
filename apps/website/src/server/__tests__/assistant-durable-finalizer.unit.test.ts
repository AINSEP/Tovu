import assert from "node:assert/strict";
import { test } from "node:test";
import { openChatDb } from "#src/platform/db/sqlite/chat-db";
import { createChatRunLedger } from "#src/assistant/persistence/run-ledger";
import { createChatStoreFactory } from "#src/assistant/persistence/store-factory";
import { createAssistantRunFinalizer, type RunDaemonClient } from "../runtime/composition/modules/assistant-run-finalizer.js";
import { INCIDENT_PARTIAL } from "#src/assistant/durable-runs/__tests__/incident.fixture";

test("serving recovery absorbs a daemon lost during restart and finalizes one continued incident message without a browser", async () => {
  const db = openChatDb(":memory:");
  const ledger = createChatRunLedger(db);
  const history = createChatStoreFactory(db)({ kind: "user", workspaceId: "ws", userId: "admin" });
  const time = 1_790_000_000_000;
  await history.create({ id: "chat" });
  const accepted = (await ledger.durable!.accept({ principalId: "admin", workspaceId: "ws", conversationId: "chat", messageId: "answer", runId: "old", now: time,
    request: { agentId: "opencode", contextRef: JSON.stringify({ prompt: "Back up my site", conversationId: "chat", assistantMessageId: "answer" }) },
  }, {}))!;
  await ledger.checkpoint({ ...accepted, content: INCIDENT_PARTIAL, events: [{ kind: "text", text: INCIDENT_PARTIAL }] });
  const attempts: string[] = [];
  const daemon: RunDaemonClient = {
    runStatus: async ({ runId }) => runId === "old" ? 404 : 200,
    cancel: async () => {},
    async launch({ run, request }) {
      attempts.push(run.runId);
      assert.equal(JSON.parse(request.contextRef).recoveryMode, "reconstruction");
      assert.equal(JSON.parse(request.contextRef).prompt.includes(INCIDENT_PARTIAL), true);
    },
    async openEvents({ runId }) {
      const data = `event: agent\ndata: ${JSON.stringify({ runId, kind: "agent", payload: { type: "text_delta", delta: "Backup complete." } })}\n\nevent: end\ndata: ${JSON.stringify({ runId, kind: "end", payload: { status: "succeeded", code: 0 } })}\n\n`;
      return new Response(data, { headers: { "Content-Type": "text/event-stream" } });
    },
  };
  const finalizer = createAssistantRunFinalizer({ ledger, daemon, now: () => time + 20_000, reconnectDelayMs: 0, checkpointIntervalMs: 0 }, {});
  await finalizer.reconcileInterrupted({}, {});
  await finalizer.idle();
  const messages = await history.messages({ conversationId: "chat" });
  assert.equal(attempts.length, 1);
  assert.equal(messages.length, 1);
  assert.equal(messages[0]!.id, "answer");
  assert.equal(messages[0]!.content, INCIDENT_PARTIAL + "\n\n---\n\nContinued\n\nBackup complete.");
  assert.equal(messages[0]!.runStatus, "succeeded");
  assert.equal(finalizer.activeCount(), 0);
  assert.equal(JSON.stringify(messages).includes("Send your message again"), false);
  db.close();
});
