import assert from "node:assert/strict";
import { test } from "node:test";
import { openChatDb } from "#src/platform/db/sqlite/chat-db";
import { createChatRunLedger } from "#src/assistant/persistence/run-ledger";
import { createChatStoreFactory } from "#src/assistant/persistence/store-factory";
import { createAssistantRunFinalizer, type RunDaemonClient } from "../runtime/composition/modules/assistant-run-finalizer.js";
import { INCIDENT_PARTIAL } from "#src/assistant/durable-runs/__tests__/incident.fixture";
import { EXHAUSTED_NOTICE } from "#src/assistant/durable-runs/recover";

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

// The admin run-status suite follows these saved projections. Assert the actual NEW writer
// separately over the real durable store: browser hook callbacks cannot prove a SQL commit.
for (const status of ["failed", "succeeded", "canceled"] as const) {
  test(`the server alone persists a durable ${status} answer with saved work and terminal diagnostics`, async () => {
    const db = openChatDb(":memory:");
    try {
      const ledger = createChatRunLedger(db);
      const history = createChatStoreFactory(db)({ kind: "user", workspaceId: "ws", userId: "admin" });
      const time = 1_790_000_000_000;
      await history.create({ id: "chat" });
      const accepted = (await ledger.durable!.accept({ principalId: "admin", workspaceId: "ws", conversationId: "chat",
        messageId: "answer", runId: "run-1", now: time,
        request: { agentId: "opencode", contextRef: JSON.stringify({ prompt: "Write an article", conversationId: "chat", assistantMessageId: "answer" }) },
      }, {}))!;
      const launches: string[] = [];
      const frame = (kind: string, payload: Record<string, unknown>) =>
        `event: ${kind}\ndata: ${JSON.stringify({ runId: "run-1", kind, payload })}\n\n`;
      const daemon: RunDaemonClient = {
        runStatus: async () => 200,
        cancel: async () => {},
        launch: async ({ run }) => { launches.push(run.runId); },
        async openEvents() {
          // A bare failed attempt is retryable. Use a permanent provider error to exercise
          // logical failure, rather than wrongly demanding that every failed end be terminal.
          const data = frame("agent", { type: "text_delta", delta: "Saved partial answer" }) +
            (status === "failed" ? frame("stderr", { chunk: "Invalid request: HTTP 400\n" }) : "") +
            frame("end", { status, code: status === "failed" ? 1 : status === "succeeded" ? 0 : null,
              signal: status === "canceled" ? "SIGTERM" : null, resumable: false });
          return new Response(data, { headers: { "Content-Type": "text/event-stream" } });
        },
      };
      const finalizer = createAssistantRunFinalizer({ ledger, daemon, now: () => time + 1_000,
        reconnectDelayMs: 0, checkpointIntervalMs: 0 }, {});
      finalizer.watch({ principalId: "admin", conversationId: "chat", message: accepted.message });
      await finalizer.idle();

      const messages = await history.messages({ conversationId: "chat" });
      assert.equal(messages.length, 1);
      const message = messages[0]!;
      assert.equal(message.id, "answer");
      assert.equal(message.runStatus, status);
      assert.equal(message.content, "Saved partial answer");
      assert.equal(message.endedAt, time + 1_000);
      assert.equal(finalizer.activeCount(), 0);
      assert.deepEqual(launches, []);
      const notices = message.events?.filter(event => event.kind === "status") ?? [];
      if (status === "failed") {
        assert.equal(notices.filter(event => event.label.includes("Run failed")).length, 1);
        assert.match(JSON.stringify(message.events), /exit code 1, signal none/);
        assert.match(JSON.stringify(message.events), /Invalid request: HTTP 400/);
        assert.equal(notices.filter(event => event.label === EXHAUSTED_NOTICE).length, 1);
      } else if (status === "canceled") {
        assert.equal(notices.filter(event => event.label === "Run canceled").length, 1);
        assert.match(JSON.stringify(message.events), /SIGTERM/);
      } else {
        assert.deepEqual(notices, []);
      }

      // A later browser recovery request cannot reopen or rewrite an absorbing terminal row.
      assert.equal(await finalizer.recover({ messageId: "answer", trigger: "browser" }, {}), "terminal");
      assert.deepEqual(await history.messages({ conversationId: "chat" }), messages);
      assert.deepEqual(launches, []);
    } finally {
      db.close();
    }
  });
}
