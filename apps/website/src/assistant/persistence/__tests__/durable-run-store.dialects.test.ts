import assert from "node:assert/strict";
import { test } from "node:test";
import type { ChatKernel } from "#src/platform/db/chat-kernel";
import { describeEachChatDialect } from "./chat-dialect-matrix.js";
import { createChatRunLedger } from "../run-ledger.js";
import { createChatStoreFactory } from "../store-factory.js";
import { RunSlotBusyError, RUN_SLOT_BUSY } from "../durable-run-store.js";
import { CONTINUATION_DIVIDER } from "../../durable-runs/continuation.js";
import { createDurableRecovery } from "../../durable-runs/recover.js";
import { INCIDENT_PARTIAL } from "../../durable-runs/__tests__/incident.fixture.js";
import type { DurableRun } from "../../durable-runs/ports.js";

const TIME = 1_790_000_000_000;
function harness(kernel: ChatKernel) {
  const ledger = createChatRunLedger(kernel);
  const store = ledger.durable!;
  const history = createChatStoreFactory(kernel)({ kind: "user", workspaceId: "ws", userId: "admin" });
  async function accept(messageId = "answer", runId = "old") {
    if (!await history.get({ id: "chat" })) await history.create({ id: "chat" });
    return (await store.accept({ principalId: "admin", workspaceId: "ws", conversationId: "chat", messageId, runId, now: TIME,
      request: { agentId: "codex", contextRef: JSON.stringify({ prompt: "Back up my site", conversationId: "chat", assistantMessageId: messageId }) },
    }, {}))!;
  }
  return { kernel, ledger, store, history, accept };
}

describeEachChatDialect("durable attempts migration and fencing", harness, (make) => {
  for (const browserFirst of [false, true]) {
    test(`first-turn acceptance persists user before answer when browserFirst=${browserFirst}`, async () => {
      const h = make(); await h.history.create({ id: "chat" });
      const userMessage = { id: "question", role: "user" as const, content: "Back up my site", createdAt: TIME - 54,
        attachments: [{ path: "attachment:zip", name: "site.zip", kind: "file" as const }] };
      if (browserFirst) await h.history.appendMessage({ conversationId: "chat", message: userMessage });
      const required = { principalId: "admin", workspaceId: "ws", conversationId: "chat", messageId: "answer", runId: "old", now: TIME,
        request: { agentId: "codex", contextRef: JSON.stringify({ prompt: userMessage.content, conversationId: "chat", assistantMessageId: "answer", userMessage }) } };
      const run = (await h.store.accept(required, {}))!;
      // Acceptance itself must own the question: a tab can disappear before its PUT lands.
      assert.deepEqual(run.transcript.map((m) => m.id), ["question", "answer"]);
      assert.deepEqual(run.transcript[0], userMessage);
      await h.ledger.settle({ ...run, content: "Done", events: [], status: "succeeded", endedAt: TIME + 1 });
      await h.history.appendMessage({ conversationId: "chat", message: userMessage });
      await h.store.accept({ ...required, runId: "duplicate" }, {});
      const rows = await h.kernel.run((db) => db.selectFrom("ai_chat_messages").select(["id", "position"])
        .where("conversation_id", "=", "chat").orderBy("position").execute());
      assert.deepEqual(rows.map((r) => [r.id, Number(r.position)]), [["question", 0], ["answer", 1]]);
    });
  }

  test("an occupied slot does not persist the queued request's user payload", async () => {
    const h = make(); await h.accept();
    await assert.rejects(h.store.accept({ principalId: "admin", workspaceId: "ws", conversationId: "chat", messageId: "second", runId: "next", now: TIME,
      request: { contextRef: JSON.stringify({ userMessage: { id: "queued-question", role: "user", content: "Next" } }) },
    }, {}), RunSlotBusyError);
    assert.deepEqual((await h.history.messages({ conversationId: "chat" })).map((m) => m.id), ["answer"]);
  });

  test("a colliding question ID cannot commit an answer without its question", async () => {
    const h = make(); await h.history.create({ id: "other" }); await h.history.create({ id: "chat" });
    await h.history.appendMessage({ conversationId: "other", message: { id: "question", role: "user", content: "Original" } });
    await assert.rejects(h.store.accept({ principalId: "admin", workspaceId: "ws", conversationId: "chat", messageId: "answer", runId: "old", now: TIME,
      request: { contextRef: JSON.stringify({ userMessage: { id: "question", role: "user", content: "Collision" } }) },
    }, {}));
    assert.deepEqual(await h.history.messages({ conversationId: "chat" }), []);
    assert.equal((await h.history.messages({ conversationId: "other" }))[0]!.content, "Original");
  });

  test("foreign acceptance cannot persist its user payload", async () => {
    const h = make(); await h.history.create({ id: "chat" });
    assert.equal(await h.store.accept({ principalId: "other-admin", workspaceId: "ws", conversationId: "chat", messageId: "answer", runId: "old", now: TIME,
      request: { contextRef: JSON.stringify({ userMessage: { id: "question", role: "user", content: "Hi" } }) },
    }, {}), null);
    assert.deepEqual(await h.history.messages({ conversationId: "chat" }), []);
  });

  test("an assistant ID colliding with a user row rolls back the newly appended question", async () => {
    const h = make(); await h.history.create({ id: "chat" });
    await h.history.appendMessage({ conversationId: "chat", message: { id: "answer", role: "user", content: "Original" } });
    await assert.rejects(h.store.accept({ principalId: "admin", workspaceId: "ws", conversationId: "chat", messageId: "answer", runId: "old", now: TIME,
      request: { contextRef: JSON.stringify({ userMessage: { id: "question", role: "user", content: "Hi" } }) },
    }, {}));
    const remaining = await h.history.messages({ conversationId: "chat" });
    assert.deepEqual(remaining.map((m) => [m.id, m.role, m.content]), [["answer", "user", "Original"]]);
  });

  test("an invalid user payload or shared user/assistant identity cannot be accepted", async () => {
    const h = make(); await h.history.create({ id: "chat" });
    for (const userMessage of [
      { id: "answer", role: "user", content: "Hi" },
      { id: "question", role: "assistant", content: "Hi" },
      { id: "question", role: "user", content: 123 },
    ]) {
      await assert.rejects(h.store.accept({ principalId: "admin", workspaceId: "ws", conversationId: "chat", messageId: "answer", runId: "old", now: TIME,
        request: { contextRef: JSON.stringify({ userMessage }) },
      }, {}));
      assert.deepEqual(await h.history.messages({ conversationId: "chat" }), []);
    }
  });

  test("user and stub appends roll back together when the second write fails", async () => {
    const h = make(); await h.history.create({ id: "chat" });
    const transaction = h.kernel.transaction.bind(h.kernel);
    const failingKernel: ChatKernel = { ...h.kernel, transaction,
      run: async (body) => h.kernel.run(async (db) => {
        const result = await body(db);
        // Throw after the assistant write: neither row may escape the outer acceptance transaction.
        const stub = await db.selectFrom("ai_chat_messages").select("id").where("id", "=", "answer").executeTakeFirst();
        if (stub) throw new Error("stub write failed");
        return result;
      }),
    };
    const store = createChatRunLedger(failingKernel).durable!;
    await assert.rejects(store.accept({ principalId: "admin", workspaceId: "ws", conversationId: "chat", messageId: "answer", runId: "old", now: TIME,
      request: { contextRef: JSON.stringify({ userMessage: { id: "question", role: "user", content: "Hi" } }) },
    }, {}));
    assert.deepEqual(await h.history.messages({ conversationId: "chat" }), []);
  });

  test("a retry without a divider retains a checkpoint committed after the recovery probe", async () => {
    const h = make(); const probed = await h.accept();
    await h.ledger.checkpoint({ ...probed, content: "First output", events: [{ kind: "text", text: "First output" }] });
    assert.equal(await h.store.advance({ run: probed, nextRunId: "next", now: TIME + 20_000,
      events: [{ kind: "status", code: "run_recovering", label: "Continuing…" }],
    }, {}), true);
    const current = (await h.store.load({ messageId: "answer" }, {}))!;
    assert.deepEqual(current.message.events, [
      { kind: "text", text: "First output" }, { kind: "text", text: CONTINUATION_DIVIDER },
      { kind: "status", code: "run_recovering", label: "Continuing…" },
    ]);
    assert.equal(current.message.content, "First output" + CONTINUATION_DIVIDER);
  });
  test("acceptance commits a queued stub and its runtime input once across duplicate POSTs", async () => {
    const h = make(); await h.accept();
    const duplicate = await h.accept("answer", "duplicate-id");
    assert.equal(duplicate.runId, "old");
    assert.equal(duplicate.request.agentId, "codex");
    assert.equal(duplicate.engine, "daemon");
    assert.equal(duplicate.recoveryCount, 0);
    assert.equal(duplicate.recoveryDeadline, null);
    assert.equal((await h.history.messages({ conversationId: "chat" })).length, 1);
    const rows = await h.kernel.run((db) => db.selectFrom("assistant_run_attempts").selectAll().execute());
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.attempt_started_at, TIME);
  });

  test("Stop beating acceptance creates a terminal tombstone that no late POST can launch", async () => {
    const h = make(); await h.history.create({ id: "chat" });
    await h.store.cancelPending({ principalId: "admin", workspaceId: "ws", conversationId: "chat", messageId: "answer", runId: "stopped-before-start", now: TIME }, {});
    const late = await h.accept();
    assert.equal(late.runId, "stopped-before-start");
    assert.equal(late.message.runStatus, "canceled");
    assert.equal((await h.history.messages({ conversationId: "chat" })).length, 1);
  });

  test("only one CAS wins and stale attempts cannot checkpoint, settle, capture sessions, or invoke tools", async () => {
    const h = make(); const old = await h.accept();
    const events = [{ kind: "text" as const, text: INCIDENT_PARTIAL }];
    await h.ledger.checkpoint({ ...old, content: INCIDENT_PARTIAL, events });
    const oldRun = (await h.store.load({ messageId: "answer" }, {}))!;
    const results = await Promise.all([
      h.store.advance({ run: oldRun, nextRunId: "next-1", now: TIME + 20_000, events }, {}),
      h.store.advance({ run: oldRun, nextRunId: "next-2", now: TIME + 20_000, events }, {}),
    ]);
    assert.equal(results.filter(Boolean).length, 1);
    assert.equal(await h.ledger.checkpoint({ ...old, content: "stale", events: [] }), false);
    assert.equal(await h.ledger.settle({ ...old, content: "stale", events: [], status: "succeeded", endedAt: TIME + 21_000 }), false);
    assert.equal(await h.store.captureSession({ runId: "old", sessionId: "stale-session" }, {}), false);
    assert.equal(await h.store.guardTool({ runId: "old", toolId: "create_repo", input: {} }, {}), "stale");
    const current = (await h.store.load({ messageId: "answer" }, {}))!;
    assert.equal(current.message.content, INCIDENT_PARTIAL);
    assert.equal(current.message.runStatus, "queued");
    assert.equal(current.recoveryCount, 1);
  });

  test("a checkpoint landing between recovery's read and CAS remains in the continuation segment", async () => {
    const h = make(); const old = await h.accept();
    await h.ledger.checkpoint({ ...old, content: "Partial", events: [{ kind: "text", text: "Partial" }] });
    const probed = (await h.store.load({ messageId: "answer" }, {}))!;
    await h.ledger.checkpoint({ ...old, content: "Partial with latest progress", events: [{ kind: "text", text: "Partial with latest progress" }] });
    assert.equal(await h.store.advance({ run: probed, nextRunId: "next", now: TIME + 20_000,
      events: [...probed.message.events!, { kind: "text", text: CONTINUATION_DIVIDER }],
    }, {}), true);
    const current = (await h.store.load({ messageId: "answer" }, {}))!;
    assert.equal(current.message.content, "Partial with latest progress" + CONTINUATION_DIVIDER);
    assert.deepEqual(current.attemptBase, [{ kind: "text", text: "Partial with latest progress" }, { kind: "text", text: CONTINUATION_DIVIDER }]);
  });

  test("a host-minted locator is unconfirmed until the CLI reports it in status", async () => {
    const h = make(); await h.accept();
    await h.store.captureSession({ runId: "old", sessionId: "minted", confirmed: false }, {});
    assert.equal((await h.store.load({ messageId: "answer" }, {}))!.sessionConfirmed, false);
    await h.store.captureSession({ runId: "old", sessionId: "minted" }, {});
    assert.equal((await h.store.load({ messageId: "answer" }, {}))!.sessionConfirmed, true);
  });

  test("progress resets the attempt counter, while init and terminal notices do not", async () => {
    const h = make(); const old = await h.accept();
    await h.store.advance({ run: old, nextRunId: "next", now: TIME + 20_000, events: [] }, {});
    const current = (await h.store.load({ messageId: "answer" }, {}))!;
    await h.ledger.checkpoint({ ...current, content: "", events: [{ kind: "status", label: "initializing" }] });
    assert.equal((await h.store.load({ messageId: "answer" }, {}))!.recoveryCount, 1);
    await h.ledger.checkpoint({ ...current, content: "Recovered progress", events: [{ kind: "text", text: "Recovered progress" }] });
    const progressed = (await h.store.load({ messageId: "answer" }, {}))!;
    assert.equal(progressed.recoveryCount, 0);
    assert.equal(progressed.recoveryDeadline, null);
  });

  test("recovery time pauses while executing and resumes with its exact remaining budget", async () => {
    const h = make(); await h.accept();
    await h.store.recoveryClock({ runId: "old", now: TIME, active: true }, {});
    assert.equal((await h.store.load({ messageId: "answer" }, {}))!.recoveryDeadline, TIME + 300_000);
    await h.store.recoveryClock({ runId: "old", now: TIME + 20_000, active: false }, {});
    assert.equal((await h.store.load({ messageId: "answer" }, {}))!.recoveryDeadline, null);
    await h.store.recoveryClock({ runId: "old", now: TIME + 600_000, active: true }, {});
    assert.equal((await h.store.load({ messageId: "answer" }, {}))!.recoveryDeadline, TIME + 880_000);
  });

  test("an identical mutating delegated call is blocked after restart while its earlier outcome is unknown", async () => {
    const h = make(); const old = await h.accept();
    assert.equal(await h.store.guardTool({ runId: "old", toolUseId: "original-tool-id", toolId: "custom_credential_make_request", input: { method: "POST", path: "/user/repos" } }, {}), "allowed");
    // A normal projection checkpoint must not erase the tool-start persistence barrier.
    await h.ledger.checkpoint({ ...old, content: "", events: [] });
    const saved = (await h.store.load({ messageId: "answer" }, {}))!;
    await h.store.advance({ run: saved, nextRunId: "next", now: TIME + 20_000, events: saved.message.events! }, {});
    assert.equal(await h.store.guardTool({ runId: "next", toolUseId: "new-tool-id", toolId: "custom_credential_make_request", input: { path: "/user/repos", method: "POST" } }, {}), "unknown");
  });

  test("a completed delegated mutation remains known even if the daemon dies before the trailing checkpoint", async () => {
    const h = make(); const old = await h.accept();
    await h.store.guardTool({ runId: "old", toolUseId: "repo", toolId: "create_repo", input: {} }, {});
    await h.store.completeTool({ runId: "old", toolUseId: "repo", content: "201 Created" }, {});
    await h.ledger.checkpoint({ ...old, content: "", events: [] });
    const saved = (await h.store.load({ messageId: "answer" }, {}))!;
    assert.deepEqual(saved.message.events, [{ kind: "tool_use", id: "repo", name: "create_repo", input: {} }, { kind: "tool_result", toolUseId: "repo", content: "201 Created", isError: false }]);
    await h.store.advance({ run: saved, nextRunId: "next", now: TIME + 20_000, events: saved.message.events! }, {});
    assert.equal(await h.store.guardTool({ runId: "next", toolId: "create_repo", input: {} }, {}), "allowed");
  });

  test("the slot follows the unfinished logical row and releases on finalization and deletion", async () => {
    const h = make(); const old = await h.accept();
    await assert.rejects(h.accept("second", "second-run"), (error: unknown) => error instanceof RunSlotBusyError && error.message === RUN_SLOT_BUSY);
    await h.ledger.settle({ ...old, content: "Saved work", events: [], status: "failed", endedAt: TIME + 20_000 });
    assert.equal((await h.accept("second", "second-run")).runId, "second-run");
    await h.history.delete({ id: "chat" });
    assert.equal(await h.store.load({ messageId: "second" }, {}), null);
    assert.equal((await h.accept("third", "third-run")).runId, "third-run");
  });

  test("browser snapshots cannot terminalize, shrink, or restore the old attempt after CAS", async () => {
    const h = make(); const old = await h.accept();
    await h.ledger.checkpoint({ ...old, content: INCIDENT_PARTIAL, events: [{ kind: "text", text: INCIDENT_PARTIAL }] });
    const saved = (await h.store.load({ messageId: "answer" }, {}))!;
    await h.store.advance({ run: saved, nextRunId: "next", now: TIME + 20_000, events: saved.message.events! }, {});
    const browser = await h.history.appendMessage({ conversationId: "chat", message: { ...old.message, runId: "old", runStatus: "failed", content: "", events: [] } });
    assert.equal(browser!.content, INCIDENT_PARTIAL);
    assert.equal(browser!.runId, "next");
    assert.equal(browser!.runStatus, "queued");
  });

  test("the dev-restart incident resumes and finalizes the same message even if no browser returns", async () => {
    const h = make(); const old = await h.accept();
    await h.ledger.checkpoint({ ...old, content: INCIDENT_PARTIAL, events: [{ kind: "text", text: INCIDENT_PARTIAL }] });
    let launched: DurableRun | undefined;
    const recovery = createDurableRecovery({ store: h.store, now: () => TIME + 20_000, mintRunId: () => "continued",
      probe: async () => "dead", cancelAttempt: async () => {}, verifyChildDead: async () => false, supportsNativeResume: () => false,
      launch: async ({ run }) => { launched = run; }, attach: () => {}, settle: (settlement) => h.ledger.settle(settlement),
    }, {});
    assert.equal(await recovery.recover({ messageId: "answer", trigger: "boot" }, {}), "continued");
    assert.equal(launched!.messageId, "answer");
    const events = [...launched!.attemptBase, { kind: "text" as const, text: "Backup complete." }];
    const content = INCIDENT_PARTIAL + "\n\n---\n\nContinued\n\nBackup complete.";
    assert.equal(await h.ledger.settle({ ...launched!, content, events, status: "succeeded", endedAt: TIME + 30_000 }), true);
    const messages = await h.history.messages({ conversationId: "chat" });
    assert.equal(messages.length, 1);
    assert.equal(messages[0]!.content, content);
    assert.equal(messages[0]!.runStatus, "succeeded");
    assert.equal(JSON.stringify(messages).includes("Send your message again"), false);
  });
});
