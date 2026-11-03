import assert from "node:assert/strict";
import test from "node:test";
import { createAgentExecutor, createInMemoryEventLog, createRunLifecycle } from "@jini-ai/daemon";
import { chatKernel } from "#src/platform/db/chat-kernel";
import { openChatDb } from "#src/platform/db/sqlite/chat-db";
import { createChatRunLedger } from "#src/assistant/persistence/run-ledger";
import { createChatHistoryStore } from "#src/assistant/persistence/chat-history-store";
import { EXHAUSTED_NOTICE, RECOVERY_LIMIT } from "#src/assistant/durable-runs/recover";
import { createAssistantRunFinalizer } from "../assistant-run-finalizer.js";

test("an actual executor failure remains failed through Tovu recovery, chat.db and UI history", { timeout: 10_000 }, async () => {
  const db = openChatDb(":memory:");
  const kernel = chatKernel(db);
  const ledger = createChatRunLedger({ store: kernel });
  const history = createChatHistoryStore(kernel, { scopeId: "workspace", ownerKind: "user", ownerId: "alice" });
  const lifecycle = createRunLifecycle({ eventLog: createInMemoryEventLog({}) });
  try {
    await history.create({ id: "chat" });
    const { run } = await lifecycle.start({ contextRef: "Answer this user message" });
    const accepted = await ledger.durable!.accept({ conversationId: "chat", messageId: "answer", runId: run.id,
      principalId: "alice", workspaceId: "workspace", now: Date.now(), request: {
        agentId: "missing-fixture-cli", contextRef: JSON.stringify({ userMessage: {
          id: "question", role: "user", content: "Answer me", createdAt: Date.now(),
        } }),
      } }, {});
    assert.ok(accepted);
    // This is the last allowed attempt: exercise the real recovery finalization without retries.
    await kernel.run(db => db.updateTable("assistant_run_attempts").set({ recovery_count: RECOVERY_LIMIT })
      .where("message_id", "=", "answer").execute());
    const executor = createAgentExecutor({ lifecycle }, { getAgentDef: () => null });
    await assert.rejects(executor.run({ runId: run.id, agentId: "missing-fixture-cli", prompt: "Answer me", cwd: process.cwd() }),
      { code: "AGENT_NOT_FOUND" });
    assert.equal((await lifecycle.waitForTerminal({ runId: run.id })).state, "failed");
    const frames: string[] = [];
    const subscription = await lifecycle.stream({ runId: run.id, onEvent: event => {
      frames.push(`event: ${event.kind}\ndata: ${JSON.stringify(event)}\n\n`);
    } });
    if (subscription.kind === "ok") subscription.unsubscribe();
    const endedAttempts: string[] = [];
    const finalizer = createAssistantRunFinalizer({ ledger, reconnectDelayMs: 0, checkpointIntervalMs: 0,
      onAttemptEnded: async ({ runId }) => { endedAttempts.push(runId); },
      daemon: { openEvents: async () => new Response(frames.join("")), runStatus: async () => 404 },
      scheduler: { schedule({ delayMs, run }) { const timer = setTimeout(run, delayMs); return () => clearTimeout(timer); } },
    });
    finalizer.watch({ principalId: "alice", conversationId: "chat", message: accepted.message });
    await finalizer.idle();
    const stored = await kernel.run(db => db.selectFrom("ai_chat_messages").select(["run_status", "events_json"])
      .where("id", "=", "answer").executeTakeFirstOrThrow());
    assert.equal(stored.run_status, "failed");
    const events = JSON.parse(stored.events_json!);
    assert.ok(events.some((event: { label?: string }) => event.label === "Run failed before the agent started"));
    assert.ok(events.some((event: { label?: string }) => event.label === EXHAUSTED_NOTICE));
    const message = (await history.messages({ conversationId: "chat" })).at(-1)!;
    assert.equal(message.runStatus, "failed");
    assert.ok(message.events?.some(event => event.kind === "status" && event.label.includes("unknown agentId")));
    assert.equal((await ledger.durable!.find({ runId: run.id }, {}))?.message.runStatus, "failed");
    assert.equal(finalizer.activeCount(), 0);
    assert.deepEqual(endedAttempts, [run.id], "server-owned plugin consent must release when the durable observer ends its attempt");
  } finally { await kernel.close(); }
});
